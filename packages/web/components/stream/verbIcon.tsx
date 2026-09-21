import {
  FileText,
  Globe,
  GitFork,
  ListTodo,
  Pencil,
  Search,
  SquarePen,
  Terminal,
  Wrench,
} from "lucide-react";

/** One drawn glyph per verb, so a column of steps can be scanned by shape. */
export function VerbIcon({ verb, size = 13 }: { verb: string; size?: number }) {
  const props = { size, strokeWidth: 1.75, className: "step-icon", "aria-hidden": true as const };
  switch (verb) {
    case "read":
      return <FileText {...props} />;
    case "wrote":
      return <SquarePen {...props} />;
    case "edited":
      return <Pencil {...props} />;
    case "ran":
      return <Terminal {...props} />;
    case "grepped":
    case "globbed":
    case "searched":
      return <Search {...props} />;
    case "fetched":
      return <Globe {...props} />;
    case "delegated":
      return <GitFork {...props} />;
    case "planned":
      return <ListTodo {...props} />;
    default:
      return <Wrench {...props} />;
  }
}
