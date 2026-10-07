import TurndownService from "turndown";
import type { Store } from "./api/stores.js";

const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });

function decode(value: string, kind: string): string {
  try { return decodeURIComponent(value); }
  catch { throw new Error(`invalid percent-encoding in ${kind}`); }
}

export function htmlToMarkdown(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (!text.includes("<")) return text;
  try { return turndown.turndown(text).replace(/\n{3,}/g, "\n\n").trim(); } catch { return text; }
}

export function extractHandle(value: string, store: Store): string {
  const input = value.trim();
  if (!input) throw new Error("product handle cannot be empty");
  if (!/^https?:\/\//i.test(input)) return decode(input.split(/[?#]/)[0], "product handle");
  const url = new URL(input);
  if (url.hostname.replace(/^www\./, "") !== new URL(store.baseUrl).hostname.replace(/^www\./, ""))
    throw new Error(`product URL does not belong to ${store.name}`);
  const match = url.pathname.match(/\/products\/([^/]+)/);
  if (!match) throw new Error("product URL must contain /products/<handle>");
  return decode(match[1], "product URL");
}

export function extractCollectionHandle(value: string, store: Store): string {
  const input = value.trim();
  if (!input) throw new Error("collection handle cannot be empty");
  if (!/^https?:\/\//i.test(input)) return decode(input.split(/[?#]/)[0], "collection handle");
  const url = new URL(input);
  if (url.hostname.replace(/^www\./, "") !== new URL(store.baseUrl).hostname.replace(/^www\./, ""))
    throw new Error(`collection URL does not belong to ${store.name}`);
  const match = url.pathname.match(/\/collections\/([^/]+)/);
  if (!match) throw new Error("collection URL must contain /collections/<handle>");
  return decode(match[1], "collection URL");
}

export function money(cents: number | string | null | undefined, source: "cents" | "decimal" = "cents"): string | null {
  if (cents === null || cents === undefined || cents === "") return null;
  const number = Number(cents) / (source === "cents" ? 100 : 1);
  if (!Number.isFinite(number)) return null;
  return `₪${number.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(number) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
