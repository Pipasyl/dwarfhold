import type { ExpeditionResult } from "./types";

// D4: the server waits at most 5 s, so 10 s without an answer means something is wrong.
// WHY: without a time limit, a hanging server would keep the dwarf away forever.
const TIMEOUT_MS = 10_000;

export async function beginExpedition(dwarfId: string, destination: string): Promise<ExpeditionResult> {
  // D4: AbortController cancels the request when the time limit is reached
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("/api/expeditions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dwarfId, destination }), signal: controller.signal });
    if (!response.ok) {
      // D4: an error answer may not be JSON (e.g. proxy error when the server is off), so reading it must not crash
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Expedition failed (${response.status})`);
    }
    return await response.json() as ExpeditionResult;
  } catch (error) {
    // D4: clear messages for "no answer in time" and "server not reachable"
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("No word from the expedition – the scout turned back.");
    if (error instanceof TypeError) throw new Error("The road is unreachable (server offline).");
    throw error;
  } finally {
    clearTimeout(timer); // D4: stop the timer in every case
  }
}
