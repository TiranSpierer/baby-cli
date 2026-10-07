import { join } from "node:path";
import { fetchCollection, fetchCollectionProducts, fetchCollections, fetchProduct, fetchRawProduct, searchHandles } from "./api/shopify.js";
import { HttpError } from "./api/client.js";
import { selectStores, getStore, STORE_IDS, type Store } from "./api/stores.js";
import { atomicWrite, productDirectory } from "./files.js";
import { toYaml } from "./format.js";
import { htmlToMarkdown, money } from "./text.js";
import type { ShopifyProduct, ShopifyVariant } from "./types/shopify.js";

function cents(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function imageUrl(value: string | { src?: string } | null | undefined): string | undefined {
  const url = typeof value === "string" ? value : value?.src;
  return url?.startsWith("//") ? `https:${url}` : url;
}

function searchText(product: ShopifyProduct): string {
  const tags = Array.isArray(product.tags) ? product.tags.join(" " ) : String(product.tags ?? "");
  return `${product.title} ${product.vendor ?? ""} ${product.type ?? product.product_type ?? ""} ${tags}`.toLocaleLowerCase("he");
}

function matchesQuery(product: ShopifyProduct, query: string): boolean {
  const generic = new Set(["baby", "babies", "תינוק", "תינוקות", "לתינוק", "לתינוקות"]);
  const tokens = query.toLocaleLowerCase("he").split(/\s+/).filter((token) => token.length >= 2 && !generic.has(token));
  const haystack = searchText(product);
  return tokens.length === 0 || tokens.every((token) => haystack.includes(token));
}

function priceFacts(product: ShopifyProduct, source: "cents" | "decimal") {
  const purchasable = product.variants.filter((variant) => variant.available);
  const pricedVariants = purchasable.length ? purchasable : product.variants;
  const prices = pricedVariants.map((variant) => cents(variant.price)).filter((value): value is number => value !== undefined);
  const min = prices.length ? Math.min(...prices) : cents(product.price_min ?? product.price);
  const max = prices.length ? Math.max(...prices) : cents(product.price_max ?? product.price);
  const comparisonsAtMin = pricedVariants.flatMap((variant) => {
    const price = cents(variant.price); const comparison = cents(variant.compare_at_price);
    return price !== undefined && price === min && comparison !== undefined && comparison > price ? [comparison] : [];
  });
  const regular = comparisonsAtMin.length ? Math.max(...comparisonsAtMin) : undefined;
  const discount = min !== undefined && regular !== undefined && regular > min ? Math.round((1 - min / regular) * 100) : undefined;
  return { min, max, regular, discount };
}

function variantCard(variant: ShopifyVariant, source: "cents" | "decimal"): unknown {
  const price = cents(variant.price);
  const regular = cents(variant.compare_at_price);
  const options = variant.options ?? [variant.option1, variant.option2, variant.option3].filter((value): value is string => Boolean(value));
  return {
    id: String(variant.id), ...((variant.public_title || variant.title) && (variant.public_title || variant.title) !== "Default Title" ? { title: variant.public_title || variant.title } : {}),
    ...(options.length && !(options.length === 1 && options[0] === "Default Title") ? { options } : {}),
    ...(variant.sku ? { sku: variant.sku } : {}), ...(variant.barcode ? { barcode: variant.barcode } : {}),
    price: money(price, source), ...(regular && price !== undefined && regular > price ? { regular_price: money(regular, source) } : {}),
    available: Boolean(variant.available), ...(imageUrl(variant.featured_image) ? { image: imageUrl(variant.featured_image) } : {}),
  };
}

export function productCard(store: Store, product: ShopifyProduct, details = false, source: "cents" | "decimal" = "cents"): Record<string, unknown> {
  const facts = priceFacts(product, source);
  const tags = Array.isArray(product.tags) ? product.tags : String(product.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const firstImage = imageUrl(product.featured_image) ?? imageUrl(product.images?.[0]);
  return {
    store: store.id, id: String(product.id), handle: product.handle, name: product.title,
    ...(product.vendor ? { brand: product.vendor } : {}), ...(product.type || product.product_type ? { category: product.type || product.product_type } : {}),
    price: money(facts.min, source), ...(facts.max !== undefined && facts.max !== facts.min ? { price_max: money(facts.max, source) } : {}),
    ...(facts.regular !== undefined && facts.min !== undefined && facts.regular > facts.min ? { regular_price: money(facts.regular, source), discount_percent: facts.discount } : {}),
    in_stock: product.variants.some((variant) => variant.available), variants: product.variants.length,
    ...(details ? { variant_options: product.variants.map((variant) => variantCard(variant, source)), ...(tags.length ? { tags } : {}), ...(firstImage ? { image: firstImage } : {}) } : {}),
    url: `${store.baseUrl}/products/${encodeURIComponent(product.handle)}`,
  };
}

function numericCardPrice(product: Record<string, unknown>): number {
  const value = Number(String(product.price ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && product.price !== null ? value : Infinity;
}

function sortCards(products: Record<string, unknown>[], sort?: string): void {
  if (sort === "price") products.sort((a, b) => numericCardPrice(a) - numericCardPrice(b));
  if (sort === "price-desc") products.sort((a, b) => {
    const left = numericCardPrice(a); const right = numericCardPrice(b);
    if (!Number.isFinite(left)) return 1; if (!Number.isFinite(right)) return -1; return right - left;
  });
  if (sort === "discount") products.sort((a, b) => Number(b.discount_percent ?? 0) - Number(a.discount_percent ?? 0));
}

export async function searchProducts(input: { query: string; stores?: string; limit?: number; inStock?: boolean; details?: boolean; sort?: string }): Promise<unknown> {
  const query = input.query.trim();
  if (!query) throw new Error("search query cannot be empty");
  if ([...query].length < 2) throw new Error("search query must contain at least 2 characters");
  const limit = input.limit ?? 5;
  const stores = selectStores(input.stores ?? "all");
  const results = await Promise.all(stores.map(async (store) => {
    try {
      const handles = await searchHandles(store, query);
      const inspectLimit = Math.min(handles.length, Math.max(4, Math.min(24, limit * 2)));
      const inspectedHandles = handles.slice(0, inspectLimit);
      const settled = await Promise.allSettled(inspectedHandles.map((handle) => fetchProduct(store, handle)));
      let products = settled.flatMap((result) => result.status === "fulfilled" && matchesQuery(result.value, query) ? [productCard(store, result.value, input.details)] : []);
      if (input.inStock) products = products.filter((product) => product.in_stock);
      const matched = products.length;
      sortCards(products, input.sort);
      const failed = settled.filter((result) => result.status === "rejected").length;
      const incomplete = inspectLimit < handles.length || failed > 0;
      return { store: store.id, name: store.name, source_page: 1, page_candidates: handles.length, inspected: inspectLimit, matched, returned: Math.min(products.length, limit), products: products.slice(0, limit), ...(incomplete ? { complete: false } : {}), ...(failed ? { products_failed: failed } : {}) };
    } catch (error) { return { store: store.id, name: store.name, error: error instanceof Error ? error.message : String(error), products: [] }; }
  }));
  const failedStores = results.filter((result) => "error" in result).length;
  if (failedStores === results.length) throw new Error(`search failed for all ${results.length} stores: ${results.map((result) => "error" in result ? `${result.store}: ${result.error}` : "").filter(Boolean).join("; ")}`);
  return { query, ...(failedStores ? { partial: true, stores_failed: failedStores } : {}), stores: results };
}

export async function productInfo(storeValue: string, productValue: string): Promise<unknown> {
  const store = getStore(storeValue);
  let raw: ShopifyProduct;
  try { raw = await fetchRawProduct(store, productValue) as ShopifyProduct; }
  catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(`no product "${productValue}" found at ${store.name}`);
    throw error;
  }
  const product = productCard(store, raw, true);
  const directory = productDirectory(store.id, raw.handle);
  const paths = { product: join(directory, "product.yml"), description: join(directory, "description.md"), raw: join(directory, "raw.json") };
  await Promise.all([
    atomicWrite(paths.product, toYaml(product)),
    atomicWrite(paths.description, `# ${raw.title}\n\n${htmlToMarkdown(raw.description ?? raw.body_html)}\n`),
    atomicWrite(paths.raw, `${JSON.stringify(raw, null, 2)}\n`),
  ]);
  return { ...product, files: paths };
}

export async function listCollections(storeValue: string, input: { page?: number; limit?: number; query?: string }): Promise<unknown> {
  const store = getStore(storeValue);
  const page = input.page ?? 1; const limit = input.limit ?? 50;
  if (input.query !== undefined && !input.query.trim()) throw new Error("collection query cannot be empty");
  if (input.query && page !== 1) throw new Error("--page cannot be combined with --query; filtered collection search scans all pages");
  if (!input.query && limit > 250) throw new Error("collection page limit cannot exceed Shopify's maximum of 250");
  const all = input.query ? await allCollections(store) : undefined;
  let collections = all ? all.collections : await fetchCollections(store, page, Math.min(limit, 250));
  const query = input.query?.trim().toLowerCase();
  if (query) collections = collections.filter((collection) => `${collection.title} ${collection.handle}`.toLowerCase().includes(query));
  collections = collections.slice(0, limit);
  return { store: store.id, ...(input.query ? { complete: all?.complete } : { page }), returned: collections.length, collections: collections.map((collection) => collectionCard(store, collection)) };
}

async function allCollections(store: Store) {
  const result = [];
  let complete = true;
  for (let page = 1; page <= 20; page++) {
    const collections = await fetchCollections(store, page, 250);
    result.push(...collections);
    if (collections.length < 250) break;
    if (page === 20) complete = false;
  }
  return { collections: result, complete };
}

function collectionCard(store: Store, collection: Awaited<ReturnType<typeof fetchCollections>>[number]) {
  return { handle: collection.handle, name: collection.title, reported_products: collection.products_count, url: `${store.baseUrl}/collections/${encodeURIComponent(collection.handle)}` };
}

export async function searchCollections(queryValue: string, storesValue = "all", limit = 20): Promise<unknown> {
  const query = queryValue.trim().toLocaleLowerCase("he");
  if (!query) throw new Error("collection query cannot be empty");
  const results = await Promise.all(selectStores(storesValue).map(async (store) => {
    try {
      const all = await allCollections(store);
      const collections = all.collections.filter((collection) => `${collection.title} ${collection.handle}`.toLocaleLowerCase("he").includes(query));
      return { store: store.id, complete: all.complete, matched: collections.length, returned: Math.min(collections.length, limit), collections: collections.slice(0, limit).map((collection) => collectionCard(store, collection)) };
    } catch (error) { return { store: store.id, error: error instanceof Error ? error.message : String(error), collections: [] }; }
  }));
  const failedStores = results.filter((result) => "error" in result).length;
  if (failedStores === results.length) throw new Error(`collection search failed for all ${results.length} stores: ${results.map((result) => "error" in result ? `${result.store}: ${result.error}` : "").filter(Boolean).join("; ")}`);
  return { query: queryValue.trim(), ...(failedStores ? { partial: true, stores_failed: failedStores } : {}), stores: results };
}

export async function collectionProducts(storeValue: string, collection: string, input: { page?: number; limit?: number; allPages?: boolean; inStock?: boolean; details?: boolean; sort?: string }): Promise<unknown> {
  const store = getStore(storeValue); const page = input.page ?? 1; const limit = input.limit ?? 20;
  if (input.allPages && page !== 1) throw new Error("--page cannot be combined with --all-pages");
  if (!input.allPages && limit > 250) throw new Error("collection page limit cannot exceed Shopify's maximum of 250; use --all-pages");
  let metadata;
  try { metadata = await fetchCollection(store, collection); }
  catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(`no collection "${collection}" found at ${store.name}`);
    throw error;
  }
  let raw: ShopifyProduct[] = []; let complete = true;
  if (input.allPages) {
    for (let current = 1; current <= 50; current++) {
      const batch = await fetchCollectionProducts(store, collection, current, 250);
      raw.push(...batch);
      if (batch.length < 250) break;
      if (current === 50) complete = false;
    }
  } else raw = await fetchCollectionProducts(store, collection, page, Math.min(limit, 250));
  const unique = [...new Map(raw.map((product) => [String(product.id), product])).values()];
  let products = unique.map((product) => productCard(store, product, false, "decimal"));
  if (input.inStock) products = products.filter((product) => product.in_stock);
  sortCards(products, input.sort);
  const selected = products.slice(0, limit);
  let detailsFailed = 0;
  if (input.details) {
    const hydrated = await Promise.allSettled(selected.map((product) => fetchProduct(store, String(product.handle))));
    detailsFailed = hydrated.filter((result) => result.status === "rejected").length;
    products = hydrated.flatMap((result, index) => result.status === "fulfilled" ? [productCard(store, result.value, true)] : [selected[index]]);
  } else products = selected;
  const reported = metadata.products_count;
  return { store: store.id, collection: metadata.handle, ...(reported !== undefined ? { reported_products: reported } : {}), ...(input.allPages ? { fetched: unique.length, pagination_complete: complete, ...(reported !== undefined ? { count_matches_reported: reported === unique.length } : {}) } : { page }), matched: input.inStock ? unique.filter((product) => product.variants.some((variant) => variant.available)).length : unique.length, returned: products.length, ...(detailsFailed ? { details_failed: detailsFailed, details_complete: false } : {}), products };
}

export function storesList(): unknown {
  return { stores: STORE_IDS.map((id) => ({ id, name: getStore(id).name, url: getStore(id).baseUrl })) };
}
