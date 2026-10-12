import { readdir } from "node:fs/promises";

const NOISE = new Set([
  ".git", "node_modules", "dist", "build", ".next", ".turbo",
  ".cache", "coverage", ".venv", "__pycache__", ".DS_Store",
]);

const MAX_ENTRIES = 40;

// Without this every run opened with two or three failed reads guessing paths in
// the temp-dir clone before running `pwd && ls`.
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
    // A convenience; an unreadable listing must not fail the run.
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
