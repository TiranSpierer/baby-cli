# Shopify source behavior

The supported stores use Shopify, but only their public storefront surfaces are consumed. No authentication or Storefront API token is required.

Machine-readable product and collection requests use each store's canonical `*.myshopify.com` hostname to avoid branded-theme redirects. Shopify can challenge both canonical and branded hosts; the client retries challenges with a browser-like TLS fingerprint. User-facing URLs always use the retailer's branded domain.
Native fetch is attempted first. HTTP 429/5xx responses retry with a browser-like CycleTLS handshake because Shopify can temporarily challenge Node's TLS fingerprint after sustained catalog traffic.

- `/search?q=...&type=product` supplies ordered search-result handles. Shopify marks organic result links with `_pos` and `_ss=r`; My Baby uses a scoped `#SearchLoop` fallback.
- `/products/<handle>.js` supplies current prices in agorot, variants, availability, SKU, barcode when published, media, tags, and HTML description.
- `/collections.json` and `/collections/<handle>/products.json` supply category browsing. Collection `products_count` is upstream metadata and frequently disagrees substantially with the products endpoint.
- Shopify caps collection-product pages at 250. Complete collection operations paginate until the endpoint returns a short page and report whether the safety cap was reached.
- Public storefront data exposes availability, not exact inventory quantities.
- `compare_at_price` represents a regular/reference price only when it is positive and greater than the active price. A zero value is not a sale.
- Product summary prices use available variants whenever at least one variant is purchasable; unavailable variant prices remain visible in detailed variant output.
- Search parsers must stay scoped to organic result markers or the configured result container so navigation and recommendation links are not presented as matches.
