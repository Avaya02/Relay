import WebSocket from "ws";
import type {
  RunnerMessage,
  ServerToRunnerMessage,
  SessionStatus,
} from "@relay/shared";
import type { RunEmitter } from "./emit.js";
import { runRealAgent } from "./agent/run.js";
import { runMockAgent } from "./agent/mock.js";
import type { Repo } from "./repo.js";

export type RunnerOptions = {
  wsUrl: string;
  sessionId: string;
  token: string;
  repo: Repo;
  mode: "mock" | "real";
  keySource: "oauth" | "api-key" | "mock";
  keyHint: string | null;
  /** Set only when the operator supplied a key explicitly. */
  apiKeyHelper?: string;
  model: string;
};

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export function startRunner(opts: RunnerOptions): void {
  const { wsUrl, sessionId, token, repo, mode } = opts;

  let socket: WebSocket | null = null;
  let attempts = 0;
  let workingDir: string | null = null;
  let currentRun: AbortController | null = null;
  // Kept so a reconnect can offer it back. Only meaningful alongside a
  // surviving workingDir — see resumeAgentSession in the hello below.
  let agentSessionId: string | null = null;
  // Set when the server says the problem is permanent, so `close` stops
  // rescheduling and the process can exit instead of spinning.
  let giveUp = false;

  function send(msg: RunnerMessage): void {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }

  const emit: RunEmitter = {
    event: (kind, data) => send({ type: "runner_event", kind, data }),
    status: (status) => send({ type: "runner_status", status }),
    agentSession: (id) => {
      agentSessionId = id;
      send({ type: "runner_agent_session", agentSessionId: id });
    },
  };

  // Prepared on the first instruction rather than at startup: cloning for a
  // session nobody ever drives is wasted work.
  async function ensureWorkingDir(): Promise<string> {
    workingDir ??= await repo.prepareWorkingDir(sessionId);
    return workingDir;
  }

  function fail(status: SessionStatus, message: string): void {
    emit.event("agent_error", { message });
    emit.status(status);
  }

  async function handleInstruction(text: string, resume?: string): Promise<void> {
    const abort = new AbortController();
    currentRun = abort;
    try {
      const dir = await ensureWorkingDir();
      if (mode === "mock") {
        await runMockAgent({ emit, instruction: text, workingDir: dir, signal: abort.signal });
      } else {
        await runRealAgent({
          emit,
          instruction: text,
          workingDir: dir,
          signal: abort.signal,
          resume,
          apiKeyHelper: opts.apiKeyHelper,
          model: opts.model,
        });
      }
    } catch (err) {
      fail("error", err instanceof Error ? err.message : String(err));
    } finally {
      if (currentRun === abort) currentRun = null;
    }
  }

  async function handleChangesRequest(requestId: string): Promise<void> {
    // Nothing has run yet, so there is nothing to diff — an empty answer is
    // correct here, not an error.
    if (!workingDir) {
      send({
        type: "runner_changes",
        requestId,
        files: [],
        insertions: 0,
        deletions: 0,
        patch: "",
      });
      return;
    }
    try {
      const changes = await repo.sessionChanges(workingDir);
      send({ type: "runner_changes", requestId, ...changes });
    } catch (err) {
      console.error("could not read session changes:", err);
      send({
        type: "runner_changes",
        requestId,
        files: [],
        insertions: 0,
        deletions: 0,
        patch: "",
      });
    }
  }

  async function handlePublish(title: string): Promise<void> {
    if (!workingDir) {
      send({
        type: "runner_publish_result",
        ok: false,
        error: "this session hasn't run anything yet",
      });
      return;
    }
    try {
      const result = await repo.publishSession(workingDir, sessionId, title);
      send(
        result.ok
          ? {
              type: "runner_publish_result",
              ok: true,
              branch: result.branch,
              pushed: result.pushed,
              prUrl: result.prUrl,
              note: result.note,
            }
          : { type: "runner_publish_result", ok: false, error: result.error },
      );
    } catch (err) {
      console.error("publish failed:", err);
      send({ type: "runner_publish_result", ok: false, error: "publish failed" });
    }
  }

  function handleMessage(raw: string): void {
    let msg: ServerToRunnerMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case "runner_ready":
        // Only now is the socket genuinely attached. Resetting backoff on
        // "open" instead would make a server that accepts and immediately
        // rejects look like a healthy connection, and retry it every second
        // forever.
        attempts = 0;
        console.log("connected — waiting for instructions");
        break;
      case "runner_rejected":
        console.error(`\n  ${msg.reason}\n`);
        if (msg.fatal) {
          // Retrying cannot change the answer, and a silent reconnect loop
          // against a dead session is worse than stopping: the terminal keeps
          // claiming to be connected while nothing works.
          giveUp = true;
          socket?.close();
          process.exitCode = 1;
        }
        break;
      case "run_instruction":
        void handleInstruction(msg.text, msg.resume);
        break;
      case "stop_run":
        currentRun?.abort();
        break;
      case "request_runner_changes":
        void handleChangesRequest(msg.requestId);
        break;
      case "run_publish":
        void handlePublish(msg.title);
        break;
    }
  }

  function connect(): void {
    const ws = new WebSocket(wsUrl);
    socket = ws;

    ws.on("open", () => {
      send({
        type: "runner_hello",
        sessionId,
        token,
        repoName: repo.repoName(),
        mode,
        keySource: opts.keySource,
        keyHint: opts.keyHint,
        // Only when something actually answers with it. The scripted agent
        // replays a fixture and never reaches a model, so naming one in the
        // room would be the same lie the "Demo" label exists to prevent.
        ...(mode === "real" ? { model: opts.model } : {}),
        // Offered only when this process still holds the clone those turns ran
        // against. A restarted CLI has neither, and correctly starts fresh.
        ...(workingDir && agentSessionId ? { resumeAgentSession: agentSessionId } : {}),
      });
    });

    ws.on("message", (data) => handleMessage(data.toString()));

    ws.on("error", (err) => {
      console.error("connection error:", err instanceof Error ? err.message : err);
    });

    ws.on("close", () => {
      if (socket === ws) socket = null;
      // An in-flight run can no longer report anything, so stop it rather than
      // letting it spend time (or credit) with nowhere to send the result.
      currentRun?.abort();

      if (giveUp) {
        void repo.disposeWorkingDir(sessionId).finally(() => process.exit(1));
        return;
      }

      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
      attempts++;
      console.log(`disconnected — retrying in ${Math.round(delay / 1000)}s`);
      setTimeout(connect, delay);
    });
  }

  function cleanup(code: number): void {
    currentRun?.abort();
    void repo.disposeWorkingDir(sessionId).finally(() => process.exit(code));
  }

  // Set by the first interrupt, so a second one leaves immediately — including
  // one pressed while the check below is still running.
  let quitArmed = false;

  /**
   * Ctrl-C is how most sessions end, and it takes the clone with it. Anything
   * the agent wrote but nobody published dies there, with the transcript left
   * describing edits that no longer exist anywhere — so the first interrupt
   * says what is about to be lost instead of deleting it silently.
   *
   * The in-flight run is deliberately left alone: stopping it and then not
   * exiting would leave a dead run inside a live session.
   */
  async function interrupt(): Promise<void> {
    if (quitArmed) return cleanup(0);
    quitArmed = true;

    if (!workingDir) return cleanup(0);
    let pending = 0;
    try {
      pending = (await repo.sessionChanges(workingDir)).files.length;
    } catch {
      // Never let a failed diff strand someone in a process that won't quit.
      return cleanup(0);
    }
    if (pending === 0) return cleanup(0);

    console.log(
      `\n  ${pending} ${pending === 1 ? "file" : "files"} changed in this session and not published.` +
        `\n  Publish from the session page to keep the work, or press Ctrl-C again to discard it.\n`,
    );
  }

  process.on("SIGINT", () => void interrupt());
  // No prompt on these two: SIGTERM is programmatic and SIGHUP means the
  // terminal is already gone, so a warning would print to nobody.
  process.on("SIGTERM", () => cleanup(0));
  // Closing the terminal window sends SIGHUP, not SIGTERM — the most common way
  // a session actually ends, and without this it left its clone behind.
  process.on("SIGHUP", () => cleanup(0));

  connect();
}
