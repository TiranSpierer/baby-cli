# CLAUDE.md

TypeScript CLI for searching and inspecting products from Israeli baby stores. No authentication is required.

## Commands

```bash
npm install
npm test
node dist/cli.js --help
```

## Architecture

- `api/client.ts` is the single network boundary and owns bounded concurrency, timeouts, retries, HTTP errors, and CycleTLS fallback when Shopify challenges Node's TLS fingerprint.
- `api/shopify.ts` implements shared Shopify storefront requests and narrowly scoped search-result extraction.
- `api/stores.ts` is the store registry and alias resolver.
- `core.ts` contains framework-neutral search, product bundle, collection, normalization, and sorting operations.
- `cli.ts` defines the command hierarchy and serializes core results.
- `files.ts` writes product bundles atomically under the OS temporary directory.
- `text.ts` normalizes product handles, prices, and HTML-to-Markdown conversion.
- `types/shopify.ts` models only fields consumed by the CLI.

See [`docs/SHOPIFY.md`](docs/SHOPIFY.md) for storefront endpoint semantics and upstream limitations.

## Rules

- Keep Commander and terminal output outside the core. Core functions return structured values and throw errors.
- Route every network request through `api/client.ts`.
- Treat prices from `.js` endpoints as integer agorot and prices from `.json` endpoints as decimal shekel strings.
- Never describe boolean variant availability as an exact inventory quantity.
- Never infer equivalent products solely from similar titles, and never invent a value-for-money score.
- Keep search extraction scoped to actual result markers or a store-specific result container.
- Prefer Shopify collection JSON for category discovery and comparison. Free-text search is the only operation that reads storefront HTML.
- Bound request concurrency and candidate hydration; Shopify rate-limits bursts across its hosted stores.
- Update README for user-visible changes and `docs/SHOPIFY.md` for source-behavior discoveries.
- Run `npm test` and representative live commands for every supported store.
