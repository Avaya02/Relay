import { keystrokes, sec, typingFrames } from "./time";

// Everything the tour shows, in order. Text that the product prints is copied from
// the code that prints it (agent/src/cli.ts, agent/summarize.ts, components/room),
// so the video can't show a line or a row the real thing never would.

export type Person = { id: string; name: string; hue: string };

// The landing's greys for people, not the room's hues: the page is achromatic.
export const AVI: Person = { id: "avi", name: "Avi", hue: "#fafafa" };
export const HIMANSHU: Person = { id: "himanshu", name: "Himanshu", hue: "#b4b4b4" };
export const PEOPLE = [AVI, HIMANSHU];

export const SESSION = "4Kp2xQmN7a";
export const SESSION_URL = `relayrun.in/session/${SESSION}`;
export const REPO = "api";
// shortModel("claude-sonnet-5"), the CLI's default.
export const MODEL = "sonnet-5";

// agent/src/cli.ts, verbatim for an API key whose last four characters are 7f3a.
export const BANNER = [
  "",
  `  repo     ${REPO}  (/Users/avi/code/${REPO})`,
  "  agent    real agent — billed to the key ending 7f3a",
  `  session  ${SESSION}`,
  "  shared   the transcript, including files the agent reads or edits and command output",
  "  sandbox  on — commands can't read your keys or write outside the session folder",
  "",
  "  Share this link:",
  `    https://${SESSION_URL}`,
  "",
  "  To reattach after a restart:",
  `    relayrun --session ${SESSION} --token 9c1e47d2-3b8a-4f6e-a5d0-7e2b91c4f835`,
  "",
];
export const LINK_LINE = 8;
// agent/src/runner.ts, once the server accepts the runner.
export const CONNECTED = "connected — waiting for instructions";

// Results are summarizeToolResult's: "N lines", "applied", "written", never a tally.
export type Step = {
  id: string;
  verb: "read" | "edited" | "wrote" | "ran";
  target: string;
  result: string;
  took: string;
  // Seconds after the run starts.
  at: number;
  done: number;
};
export type Note = { id: string; text: string; at: number };

export type Run = {
  id: string;
  number: number;
  by: Person;
  text: string;
  time: string;
  // When the driver presses Enter; every offset in the run is from here.
  start: number;
  steps: Step[];
  notes: Note[];
  finish: number;
  took: string;
  doneAt: string;
  reply: { lead: string; code: string; tail: string };
  // The status badge's clock, in run seconds, at `finish`.
  runSeconds: number;
  strokes: number[];
  typeAt: number;
};

function run(r: Omit<Run, "strokes" | "start" | "typeAt">, typeAt: number): Run {
  const strokes = keystrokes(r.text, r.id);
  // Enter lands a beat after the last key.
  const start = typeAt + typingFrames(strokes) + sec(0.32);
  return { ...r, strokes, typeAt, start };
}

const S = sec;

// The beats, in seconds. One place to retime the whole film.
const B = {
  copyClick: 1.2,
  termRaise: 1.95,
  paste: 3.15,
  enter: 3.7,
  banner: 4.3,
  connected: 5.15,
  linkClick: 7.0,
  roomRaise: 7.2,
  aviFocus: 9.0,
  aviType: 9.3,
  inviteClick: 13.6,
  himanshuJoins: 14.4,
  askClick: 20.4,
  requestShows: 20.75,
  handOverClick: 22.0,
  himanshuFocus: 25.0,
  himanshuType: 25.25,
  end: 36.4,
};

export const RUN_1 = run(
  {
    id: "t1",
    number: 1,
    by: AVI,
    text: "Paginate GET /users, 50 per page",
    time: "10:41:44",
    steps: [
      { id: "s1", verb: "read", target: "src/routes/users.ts", result: "64 lines", took: "0.1s", at: 0.95, done: 1.3 },
      { id: "s2", verb: "read", target: "src/db/users.ts", result: "41 lines", took: "0.1s", at: 1.55, done: 1.85 },
      { id: "s3", verb: "edited", target: "src/db/users.ts", result: "applied", took: "0.3s", at: 2.9, done: 3.35 },
      { id: "s4", verb: "edited", target: "src/routes/users.ts", result: "applied", took: "0.2s", at: 3.6, done: 3.95 },
      { id: "s5", verb: "ran", target: "pnpm test", result: "38 lines", took: "4.1s", at: 4.3, done: 5.9 },
    ],
    notes: [{ id: "n1", text: "The handler loads every row. I'll page it in the query instead.", at: 2.2 }],
    finish: 6.45,
    took: "11.8s",
    doneAt: "10:41:56",
    reply: {
      lead: "GET /users now returns 50 per page with a ",
      code: "next",
      tail: " cursor, and the query pages in the database instead of loading every row. All 12 tests pass.",
    },
    runSeconds: 11,
  },
  S(B.aviType),
);

export const RUN_2 = run(
  {
    id: "t2",
    number: 2,
    by: HIMANSHU,
    text: "Add a test for the last page",
    time: "10:42:31",
    steps: [
      { id: "s6", verb: "read", target: "src/routes/users.test.ts", result: "88 lines", took: "0.1s", at: 0.9, done: 1.2 },
      { id: "s7", verb: "edited", target: "src/routes/users.test.ts", result: "applied", took: "0.4s", at: 1.6, done: 2.1 },
      { id: "s8", verb: "ran", target: "pnpm test", result: "41 lines", took: "4.3s", at: 2.5, done: 4.1 },
    ],
    notes: [],
    finish: 4.6,
    took: "7.2s",
    doneAt: "10:42:38",
    reply: {
      lead: "Added a test that walks to the last page and checks ",
      code: "next",
      tail: " is null. All 13 tests pass.",
    },
    runSeconds: 7,
  },
  S(B.himanshuType),
);

export const T = {
  copyClick: S(B.copyClick),
  termRaise: S(B.termRaise),
  paste: S(B.paste),
  enter: S(B.enter),
  banner: S(B.banner),
  connected: S(B.connected),
  linkClick: S(B.linkClick),
  roomRaise: S(B.roomRaise),
  aviFocus: S(B.aviFocus),
  inviteClick: S(B.inviteClick),
  himanshuJoins: S(B.himanshuJoins),
  askClick: S(B.askClick),
  requestShows: S(B.requestShows),
  handOverClick: S(B.handOverClick),
  handOver: S(B.handOverClick) + 4,
  himanshuFocus: S(B.himanshuFocus),
  end: S(B.end),
};

export const DURATION = T.end;
