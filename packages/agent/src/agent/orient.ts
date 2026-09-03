import { readdir } from "node:fs/promises";

// Directories that are never what someone means by "the project", and which
// would otherwise dominate a top-level listing.
const NOISE = new Set([
  ".git", "node_modules", "dist", "build", ".next", ".turbo",
  ".cache", "coverage", ".venv", "__pycache__", ".DS_Store",
]);

const MAX_ENTRIES = 40;

/**
 * A short description of where the agent has landed.
 *
 * Every run was opening with two or three failed reads: the agent starts in a
 * disposable clone under the OS temp directory, guesses at conventional paths
 * (`server.ts`, `README.md`) from the repository *name*, misses, and only then
 * runs `pwd && ls` to orient itself. Observed on every real session so far.
 *
 * Handing it the listing up front removes that entirely. The cost is a few
 * hundred tokens on the first turn; the saving is two round-trips of latency
 * and the impression, for anyone watching the ledger, that the agent is lost.
 */
export async function orientation(workingDir: string): Promise<string> {
  let listing: string;
  try {
    const entries = await readdir(workingDir, { withFileTypes: true });
    const visible = entries
      .filter((e) => !NOISE.has(e.name) && !e.name.startsWith("."))
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort();
    listing =
      visible.length === 0
        ? "(empty)"
        : visible.slice(0, MAX_ENTRIES).join("  ") +
          (visible.length > MAX_ENTRIES ? `  … +${visible.length - MAX_ENTRIES} more` : "");
  } catch {
    // Orientation is a convenience, never a precondition — a run must not fail
    // because the listing could not be read.
    return "";
  }

  return [
    `You are working in ${workingDir}.`,
    "",
    "This is a disposable clone of the user's repository, so the path is a",
    "temporary one and paths from the project's own documentation will not",
    "resolve from anywhere else. Everything you need is under this directory.",
    "",
    `Top level: ${listing}`,
    "",
    "Use these names directly rather than guessing at conventional paths.",
  ].join("\n");
}
