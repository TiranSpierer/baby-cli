import net from "node:net";
import * as cycletls from "cycletls";
import type { CycleTLSClient } from "cycletls";

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const RETRIES = 3;
const TIMEOUT_MS = 15_000;
const MAX_CONCURRENT_REQUESTS = 4;
let activeRequests = 0;
const waiters: Array<() => void> = [];
type InitCycleTLS = (options?: { port?: number; timeout?: number; autoExit?: boolean }) => Promise<CycleTLSClient>;
const initCycleTLS: InitCycleTLS = (cycletls as unknown as { default?: InitCycleTLS }).default ?? (cycletls as unknown as InitCycleTLS);
const CHROME_JA3 = "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513-21,29-23-24,0";
const HTTP2_FINGERPRINT = "1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p";
let clientPromise: Promise<CycleTLSClient> | null = null;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "HttpError"; }
}

function retryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function getCycleClient(): Promise<CycleTLSClient> {
  if (!clientPromise) clientPromise = freePort().then((port) => initCycleTLS({ port, timeout: TIMEOUT_MS, autoExit: true }));
  return clientPromise;
}

export async function closeClient(): Promise<void> {
  if (!clientPromise) return;
  const promise = clientPromise; clientPromise = null;
  try { await (await promise).exit(); } catch { /* The helper exits with the parent process. */ }
}

async function cycleRequest(url: string): Promise<Response> {
  const result = await (await getCycleClient()).get(url, {
    ja3: CHROME_JA3, http2Fingerprint: HTTP2_FINGERPRINT, userAgent: USER_AGENT,
    headers: { Accept: "*/*", "Accept-Language": "he-IL,he;q=0.9,en;q=0.7" }, responseType: "text", timeout: TIMEOUT_MS / 1000,
  });
  const headers = new Headers();
  for (const [key, value] of Object.entries(result.headers ?? {})) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  return new Response(typeof result.data === "string" ? result.data : String(result.data ?? ""), { status: result.status, headers });
}

async function withRequestSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS) await new Promise<void>((resolve) => waiters.push(resolve));
  activeRequests++;
  try { return await operation(); }
  finally { activeRequests--; waiters.shift()?.(); }
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter);
  const dateDelay = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) - Date.now() : 0;
  const serverDelay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Math.max(0, dateDelay);
  return Math.min(10_000, Math.max(serverDelay, 750 * 2 ** attempt)) + Math.floor(Math.random() * 250);
}

export async function request(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    let delay = retryDelay(attempt, null);
    try {
      const response = await withRequestSlot(() => attempt === 0
        ? fetch(url, { headers: { accept: "*/*", "accept-language": "he-IL,he;q=0.9,en;q=0.7", "user-agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) })
        : cycleRequest(url));
      if (response.ok) return response;
      delay = retryDelay(attempt, response.headers.get("retry-after"));
      const body = (await response.text()).slice(0, 240).replace(/\s+/g, " ").trim();
      const error = new HttpError(response.status, `HTTP ${response.status} from ${new URL(url).hostname}${body ? `: ${body}` : ""}`);
      if (!retryable(response.status) || attempt === RETRIES - 1) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof HttpError && !retryable(error.status)) throw error;
      lastError = error;
      if (attempt === RETRIES - 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw lastError instanceof Error ? lastError : new Error("request failed");
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await request(url);
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!type.includes("json") && !type.includes("javascript"))
    throw new Error(`expected JSON from ${new URL(url).hostname}, received ${type || "unknown content type"}`);
  return JSON.parse(await response.text()) as T;
}

export async function getText(url: string): Promise<string> {
  return (await request(url)).text();
}
