// Minimal unified-diff renderer. The patch arrives as text from `git diff`,
// so colour by line prefix rather than parsing hunks properly — this is a
// review surface, not a merge tool. The preamble is dropped: the header
// above already names the file and its status.
export function Patch({ patch }: { patch: string }) {
  const lines = patch
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("diff --git ") &&
        !line.startsWith("index ") &&
        !line.startsWith("new file mode ") &&
        !line.startsWith("deleted file mode ") &&
        !line.startsWith("--- ") &&
        !line.startsWith("+++ "),
    );

  return (
    <pre className="diff">
      {lines.map((line, i) => {
        let cls = "diff-line";
        if (line.startsWith("@@")) cls = "diff-line diff-hunk";
        else if (line.startsWith("+")) cls = "diff-line diff-add";
        else if (line.startsWith("-")) cls = "diff-line diff-del";
        return (
          <span key={i} className={cls}>
            {line || " "}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}
