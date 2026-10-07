import test from "node:test";
import assert from "node:assert/strict";
import { extractSearchHandles } from "../dist/api/shopify.js";
import { getStore, selectStores } from "../dist/api/stores.js";
import { extractCollectionHandle, extractHandle, htmlToMarkdown, money } from "../dist/text.js";
import { productCard } from "../dist/core.js";

test("store aliases and comma-separated selection are normalized", () => {
  assert.equal(getStore("motzetzim").id, "motsesim");
  assert.deepEqual(selectStores("shilav,babystar,shilav").map((store) => store.id), ["shilav", "baby-star"]);
  assert.throws(() => getStore("unknown"), /unknown store/);
});

test("product handles are accepted directly or extracted from matching URLs", () => {
  const store = getStore("shilav");
  assert.equal(extractHandle("מוצר-אחד", store), "מוצר-אחד");
  assert.equal(extractHandle("https://shilav.co.il/collections/x/products/%D7%9E%D7%95%D7%A6%D7%A8?variant=1", store), "מוצר");
  assert.equal(extractHandle("https://shilav-prod.myshopify.com/products/item", store), "item");
  assert.throws(() => extractHandle("https://example.com/products/x", store), /does not belong/);
});

test("collection handles validate full URL ownership", () => {
  const store = getStore("baby-star");
  assert.equal(extractCollectionHandle("https://www.baby-star.co.il/collections/%D7%90%D7%9E%D7%91%D7%98%D7%99%D7%95%D7%AA?sort=price", store), "אמבטיות");
  assert.throws(() => extractCollectionHandle("https://example.com/collections/x", store), /does not belong/);
});

test("search handles use Shopify positions, deduplicate, and preserve relevance", () => {
  const html = '<a href="/products/b?_pos=2&_ss=r">B</a><a href="/products/a?_pos=1&_ss=r">A</a><a href="/products/a?_pos=1&_ss=r">A2</a>';
  assert.deepEqual(extractSearchHandles(html, getStore("shilav")), ["a", "b"]);
});

test("malformed retailer search links are ignored", () => {
  const html = '<a href="/products/bad%ZZ?_pos=1&_ss=r">bad</a><a href="/products/good?_pos=2&_ss=r">good</a>';
  assert.deepEqual(extractSearchHandles(html, getStore("shilav")), ["good"]);
});

test("My Baby search fallback stays inside the result grid", () => {
  const html = '<nav><a href="/products/nav">nav</a></nav><div id="SearchLoop"><a href="/products/result">result</a></div>';
  assert.deepEqual(extractSearchHandles(html, getStore("mybaby")), ["result"]);
});

test("product cards preserve sale semantics, variants, barcode, and availability", () => {
  const card = productCard(getStore("baby-star"), { id: 1, title: "Bath", handle: "bath", vendor: "Brand", variants: [
    { id: 2, title: "Blue", sku: "S1", barcode: "729000", available: true, price: 8000, compare_at_price: 10000 },
    { id: 3, title: "Pink", available: false, price: 9000, compare_at_price: null },
  ] }, true);
  assert.equal(card.price, "₪80"); assert.equal(card.price_max, undefined); assert.equal(card.regular_price, "₪100");
  assert.equal(card.discount_percent, 20); assert.equal(card.in_stock, true); assert.equal(card.variants, 2);
  assert.equal(card.variant_options[0].barcode, "729000");
});

test("text and money formatting retain Hebrew and decimals", () => {
  assert.equal(htmlToMarkdown("<p>אמבטיה <strong>טובה</strong></p>"), "אמבטיה **טובה**");
  assert.equal(money(6990), "₪69.90"); assert.equal(money("69.90", "decimal"), "₪69.90");
});

test("missing upstream prices are not represented as free", () => {
  const card = productCard(getStore("shilav"), { id: 1, title: "Unknown price", handle: "unknown", variants: [{ id: 2, available: true, price: null }] });
  assert.equal(card.price, null);
});

test("malformed percent encoding has a contextual input error", () => {
  assert.throws(() => extractHandle("bad%ZZ", getStore("shilav")), /invalid percent-encoding in product handle/);
});

test("collection product cards interpret Shopify JSON prices as shekels", () => {
  const card = productCard(getStore("agalease"), { id: 1, title: "Chair", handle: "chair", variants: [
    { id: 2, available: true, price: "399.00", compare_at_price: "649.00" },
  ] }, false, "decimal");
  assert.equal(card.price, "₪399"); assert.equal(card.regular_price, "₪649");
});

test("protocol-relative Shopify images become directly usable HTTPS URLs", () => {
  const card = productCard(getStore("shilav"), { id: 1, title: "Bath", handle: "bath", featured_image: "//cdn.shopify.com/x.jpg", variants: [{ id: 2, available: true, price: 1000 }] }, true);
  assert.equal(card.image, "https://cdn.shopify.com/x.jpg");
});

test("summary regular price belongs to the cheapest variant rather than another variant", () => {
  const card = productCard(getStore("baby-star"), { id: 1, title: "Seat", handle: "seat", variants: [
    { id: 2, available: true, price: 5000, compare_at_price: null },
    { id: 3, available: true, price: 7000, compare_at_price: 20000 },
  ] });
  assert.equal(card.price, "₪50"); assert.equal(card.price_max, "₪70"); assert.equal(card.regular_price, undefined);
});

test("summary pricing uses purchasable variants when cheaper variants are sold out", () => {
  const card = productCard(getStore("shilav"), { id: 1, title: "Bath", handle: "bath", variants: [
    { id: 2, available: false, price: 8000, compare_at_price: 10000 },
    { id: 3, available: true, price: 12000, compare_at_price: null },
  ] }, true);
  assert.equal(card.price, "₪120"); assert.equal(card.regular_price, undefined); assert.equal(card.in_stock, true);
  assert.equal(card.variant_options[0].price, "₪80"); assert.equal(card.variant_options[0].available, false);
});
