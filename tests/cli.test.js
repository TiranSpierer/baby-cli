import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function cli(...args) { return spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" }); }
test("top-level help exposes the resource model", () => { const result = cli("--help"); assert.equal(result.status, 0); assert.match(result.stdout, /stores/); assert.match(result.stdout, /search/); assert.match(result.stdout, /product/); assert.match(result.stdout, /collection/); });
test("search help documents comparison-oriented controls", () => { const result = cli("search", "--help"); assert.equal(result.status, 0); assert.match(result.stdout, /--store/); assert.match(result.stdout, /--in-stock/); assert.match(result.stdout, /discount/); });
test("collection help exposes cross-store collection discovery", () => { const result = cli("collection", "--help"); assert.equal(result.status, 0); assert.match(result.stdout, /search/); assert.match(result.stdout, /products/); });
test("invalid store exits nonzero with a useful message", () => { const result = cli("product", "info", "nope", "x"); assert.equal(result.status, 1); assert.match(result.stderr, /unknown store/); });
test("collection pagination rejects conflicting modes", () => { const result = cli("collection", "products", "shilav", "x", "--page", "2", "--all-pages"); assert.equal(result.status, 1); assert.match(result.stderr, /cannot be combined/); });
test("collection filtering rejects an empty query", () => { const result = cli("collection", "list", "shilav", "--query", "   "); assert.equal(result.status, 1); assert.match(result.stderr, /cannot be empty/); });
