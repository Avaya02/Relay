const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function createSession(): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/sessions`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`could not create a session (${res.status})`);
  }
  return res.json();
}
