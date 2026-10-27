const JSON_HEADERS = { "content-type": "application/json" };
const UNREACHABLE_MESSAGE = "Could not reach the server. Check your connection and try again.";

type WithError<T> = T & { error?: string };

export function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return { method, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function failedRequestMessage(response: Response) {
  return `The request failed (${response.status}). Please try again.`;
}

export async function readJson<T>(response: Response): Promise<WithError<T>> {
  const text = await response.text();
  if (!text) throw new Error("The server returned an empty response. Please refresh and try again.");
  try {
    return JSON.parse(text) as WithError<T>;
  } catch {
    throw new Error(response.ok ? "The server returned an unexpected response. Please refresh and try again." : failedRequestMessage(response));
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url).catch(() => {
    throw new Error(UNREACHABLE_MESSAGE);
  });
  const data = await readJson<T>(response);
  if (!response.ok) throw new Error(data.error || failedRequestMessage(response));
  return data;
}

type SendResult<T> = { ok: boolean; data: Partial<T>; error?: string };

export async function sendJson<T>(url: string, init: RequestInit): Promise<SendResult<T>> {
  const response = await fetch(url, init).catch(() => null);
  if (!response) return { ok: false, data: {}, error: UNREACHABLE_MESSAGE };
  try {
    const data = await readJson<T>(response);
    return { ok: response.ok, data, error: data.error };
  } catch (error) {
    return { ok: false, data: {}, error: error instanceof Error ? error.message : UNREACHABLE_MESSAGE };
  }
}
