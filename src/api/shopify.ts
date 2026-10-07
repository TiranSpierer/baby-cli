import { load } from "cheerio";
import { getJson, getText } from "./client.js";
import type { Store } from "./stores.js";
import type { ShopifyCollection, ShopifyProduct } from "../types/shopify.js";
import { extractCollectionHandle, extractHandle } from "../text.js";

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
    if (match && Number.isInteger(position) && position > 0 && !positioned.has(position)) {
      try { positioned.set(position, decodeURIComponent(match[1])); } catch { /* Ignore a malformed retailer link. */ }
    }
  });
  if (positioned.size) return [...positioned.entries()].sort(([a], [b]) => a - b).map(([, handle]) => handle);

  const handles: string[] = [];
  const seen = new Set<string>();
  $(store.searchSelector ?? "main a[href*='/products/']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const match = new URL(href, store.baseUrl).pathname.match(/\/products\/([^/]+)/);
    if (!match) return;
    let handle: string;
    try { handle = decodeURIComponent(match[1]); } catch { return; }
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

export async function fetchCollection(store: Store, collection: string): Promise<ShopifyCollection> {
  const handle = extractCollectionHandle(collection, store);
  const data = await getJson<{ collection?: ShopifyCollection }>(endpoint(store, `/collections/${encodeURIComponent(handle)}.json`));
  if (!data.collection) throw new Error(`${store.name} returned an invalid collection response`);
  return data.collection;
}

export async function fetchCollectionProducts(store: Store, collection: string, page: number, limit: number): Promise<ShopifyProduct[]> {
  const handle = extractCollectionHandle(collection, store);
  const data = await getJson<{ products?: ShopifyProduct[] }>(endpoint(store, `/collections/${encodeURIComponent(handle)}/products.json`, { page, limit }));
  return data.products ?? [];
}
