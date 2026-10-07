import test from "node:test";
import assert from "node:assert/strict";
import { request } from "../dist/api/client.js";

test("non-retryable HTTP errors are attempted once", async (context) => {
  const original = globalThis.fetch; let attempts = 0;
  globalThis.fetch = async () => { attempts++; return new Response("missing", { status: 404 }); };
  context.after(() => { globalThis.fetch = original; });
  await assert.rejects(() => request("https://example.test/missing"), /HTTP 404/);
  assert.equal(attempts, 1);
});

test("network concurrency is globally bounded", async (context) => {
  const original = globalThis.fetch; let active = 0; let peak = 0;
  globalThis.fetch = async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--; return new Response("ok", { status: 200 });
  };
  context.after(() => { globalThis.fetch = original; });
  await Promise.all(Array.from({ length: 12 }, (_, index) => request(`https://example.test/${index}`)));
  assert.equal(peak, 4);
});
