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
