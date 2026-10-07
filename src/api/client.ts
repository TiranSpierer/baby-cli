const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const RETRIES = 3;
const TIMEOUT_MS = 20_000;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "HttpError"; }
}

function retryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function request(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: "*/*", "accept-language": "he-IL,he;q=0.9,en;q=0.7", "user-agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return response;
      const body = (await response.text()).slice(0, 240).replace(/\s+/g, " ").trim();
      const error = new HttpError(response.status, `HTTP ${response.status} from ${new URL(url).hostname}${body ? `: ${body}` : ""}`);
      if (!retryable(response.status) || attempt === RETRIES - 1) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof HttpError && !retryable(error.status)) throw error;
      lastError = error;
      if (attempt === RETRIES - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("request failed");
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await request(url);
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json") && !type.includes("javascript"))
    throw new Error(`expected JSON from ${new URL(url).hostname}, received ${type || "unknown content type"}`);
  return JSON.parse(await response.text()) as T;
}

export async function getText(url: string): Promise<string> {
  return (await request(url)).text();
}
