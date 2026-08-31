const KEY_LIKE = /sk-ant-[A-Za-z0-9_-]+/g;

/**
 * Scrubs anything key-shaped out of text bound for the server.
 *
 * A failed auth often echoes the key in its message, and anything emitted here
 * lands in the transcript, every browser in the room, and Postgres. The server
 * scrubs incoming text as well — this is the same guard at the other end of
 * the socket, where the text is actually produced.
 */
export function redactKeys(text: string): string {
  return text.replace(KEY_LIKE, (m) => `sk-ant-…${m.slice(-4)}`);
}
