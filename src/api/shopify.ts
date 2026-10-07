import { load } from "cheerio";
import { getJson, getText } from "./client.js";
import type { Store } from "./stores.js";
import type { ShopifyCollection, ShopifyProduct } from "../types/shopify.js";
import { extractHandle } from "../text.js";

function endpoint(store: Store, path: string, params?: Record<string, string | number>): string {
  const url = new URL(path, store.baseUrl);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, String(value));
  return url.toString();
}

export async function fetchProduct(store: Store, product: string): Promise<ShopifyProduct> {
  const handle = extractHandle(product, store);
  return getJson<ShopifyProduct>(endpoint(store, `/products/${encodeURIComponent(handle)}.js`));
}

export async function fetchRawProduct(store: Store, product: string): Promise<unknown> {
  const handle = extractHandle(product, store);
  return getJson<unknown>(endpoint(store, `/products/${encodeURIComponent(handle)}.js`));
}

export function extractSearchHandles(html: string, store: Store): string[] {
  const $ = load(html);
  const positioned = new Map<number, string>();
  $("a[href*='/products/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !href.includes("_ss=r")) return;
    const url = new URL(href, store.baseUrl);
    const match = url.pathname.match(/\/products\/([^/]+)/);
    const position = Number(url.searchParams.get("_pos"));
    if (match && Number.isInteger(position) && position > 0 && !positioned.has(position)) positioned.set(position, decodeURIComponent(match[1]));
  });
  if (positioned.size) return [...positioned.entries()].sort(([a], [b]) => a - b).map(([, handle]) => handle);

  const handles: string[] = [];
  const seen = new Set<string>();
  $(store.searchSelector ?? "main a[href*='/products/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const match = new URL(href, store.baseUrl).pathname.match(/\/products\/([^/]+)/);
    if (!match) return;
    const handle = decodeURIComponent(match[1]);
    if (!seen.has(handle)) { seen.add(handle); handles.push(handle); }
  });
  return handles;
}

export async function searchHandles(store: Store, query: string): Promise<string[]> {
  const html = await getText(endpoint(store, "/search", { q: query, type: "product", "options[prefix]": "last" }));
  return extractSearchHandles(html, store);
}

export async function fetchCollections(store: Store, page: number, limit: number): Promise<ShopifyCollection[]> {
  const data = await getJson<{ collections?: ShopifyCollection[] }>(endpoint(store, "/collections.json", { page, limit }));
  return data.collections ?? [];
}

export async function fetchCollectionProducts(store: Store, collection: string, page: number, limit: number): Promise<ShopifyProduct[]> {
  const handle = collection.trim().replace(/^.*\/collections\//, "").split(/[/?#]/)[0];
  if (!handle) throw new Error("collection handle cannot be empty");
  const data = await getJson<{ products?: ShopifyProduct[] }>(endpoint(store, `/collections/${encodeURIComponent(decodeURIComponent(handle))}/products.json`, { page, limit }));
  return data.products ?? [];
}
