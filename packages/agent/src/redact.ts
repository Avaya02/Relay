const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]+/g;

// Failed auth often echoes the key, and emitted text reaches every browser and
// Postgres. The server scrubs too (validate.ts); this guards the producing end.
export function redactKeys(text: string): string {
  return text.replace(KEY_LIKE, (m) => `sk-ant-…${m.slice(-4)}`);
}
