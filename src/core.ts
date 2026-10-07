import { join } from "node:path";
import { fetchCollectionProducts, fetchCollections, fetchProduct, fetchRawProduct, searchHandles } from "./api/shopify.js";
import { HttpError } from "./api/client.js";
import { selectStores, getStore, STORE_IDS, type Store } from "./api/stores.js";
import { atomicWrite, productDirectory } from "./files.js";
import { toYaml } from "./format.js";
import { htmlToMarkdown, money } from "./text.js";
import type { ShopifyProduct, ShopifyVariant } from "./types/shopify.js";

function cents(value: number | string | null | undefined): number | undefined {
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
  return tokens.length === 0 || tokens.some((token) => haystack.includes(token));
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
    id: String(variant.id), title: variant.public_title || variant.title || undefined,
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

export async function searchProducts(input: { query: string; stores?: string; limit?: number; inStock?: boolean; details?: boolean; sort?: string }): Promise<unknown> {
  const query = input.query.trim();
  if (!query) throw new Error("search query cannot be empty");
  const limit = input.limit ?? 5;
  const stores = selectStores(input.stores ?? "all");
  const results = await Promise.all(stores.map(async (store) => {
    try {
      const handles = await searchHandles(store, query);
      const settled = await Promise.allSettled(handles.map((handle) => fetchProduct(store, handle)));
      let products = settled.flatMap((result) => result.status === "fulfilled" && matchesQuery(result.value, query) ? [productCard(store, result.value, input.details)] : []);
      if (input.inStock) products = products.filter((product) => product.in_stock);
      const matched = products.length;
      const price = (product: Record<string, unknown>) => Number(String(product.price ?? "").replace(/[^0-9.]/g, "")) || Infinity;
      if (input.sort === "price") products.sort((a, b) => price(a) - price(b));
      if (input.sort === "price-desc") products.sort((a, b) => price(b) - price(a));
      if (input.sort === "discount") products.sort((a, b) => Number(b.discount_percent ?? 0) - Number(a.discount_percent ?? 0));
      return { store: store.id, name: store.name, candidates: handles.length, matched, returned: Math.min(products.length, limit), products: products.slice(0, limit), ...(settled.some((result) => result.status === "rejected") ? { incomplete: true } : {}) };
    } catch (error) { return { store: store.id, name: store.name, error: error instanceof Error ? error.message : String(error), products: [] }; }
  }));
  return { query, stores: results };
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
  let collections = input.query ? await allCollections(store) : await fetchCollections(store, page, Math.min(limit, 250));
  const query = input.query?.trim().toLowerCase();
  if (query) collections = collections.filter((collection) => `${collection.title} ${collection.handle}`.toLowerCase().includes(query));
  collections = collections.slice(0, limit);
  return { store: store.id, ...(input.query ? {} : { page }), returned: collections.length, collections: collections.map((collection) => collectionCard(store, collection)) };
}

async function allCollections(store: Store) {
  const result = [];
  for (let page = 1; page <= 20; page++) {
    const collections = await fetchCollections(store, page, 250);
    result.push(...collections);
    if (collections.length < 250) break;
  }
  return result;
}

function collectionCard(store: Store, collection: Awaited<ReturnType<typeof fetchCollections>>[number]) {
  return { handle: collection.handle, name: collection.title, reported_products: collection.products_count, url: `${store.baseUrl}/collections/${encodeURIComponent(collection.handle)}` };
}

export async function searchCollections(queryValue: string, storesValue = "all", limit = 20): Promise<unknown> {
  const query = queryValue.trim().toLocaleLowerCase("he");
  if (!query) throw new Error("collection query cannot be empty");
  const results = await Promise.all(selectStores(storesValue).map(async (store) => {
    const collections = (await allCollections(store)).filter((collection) => `${collection.title} ${collection.handle}`.toLocaleLowerCase("he").includes(query));
    return { store: store.id, matched: collections.length, returned: Math.min(collections.length, limit), collections: collections.slice(0, limit).map((collection) => collectionCard(store, collection)) };
  }));
  return { query: queryValue.trim(), stores: results };
}

export async function collectionProducts(storeValue: string, collection: string, input: { page?: number; limit?: number }): Promise<unknown> {
  const store = getStore(storeValue); const page = input.page ?? 1; const limit = input.limit ?? 20;
  const products = await fetchCollectionProducts(store, collection, page, Math.min(limit, 250));
  return { store: store.id, collection, page, returned: products.length, products: products.map((product) => productCard(store, product, false, "decimal")) };
}

export function storesList(): unknown {
  return { stores: STORE_IDS.map((id) => ({ id, name: getStore(id).name, url: getStore(id).baseUrl })) };
}
