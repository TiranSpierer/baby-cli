# baby-cli

CLI for searching and inspecting products sold by major Israeli baby retailers: [Shilav](https://www.shilav.co.il), [Baby Star](https://www.baby-star.co.il), [Motsesim](https://www.motsesim.co.il), [Agalease](https://www.agalease-baby.co.il), and [My Baby](https://www.mybaby.co.il). Search current storefront catalogs and inspect prices, sales, availability, variants, SKUs, barcodes, descriptions, collections, and images without an account or API key.

## Install

> [!TIP]
> **Recommended:** Install [`israel-shopping`](https://github.com/TiranSpierer/agent-plugins) from the agent plugin marketplace.

Run directly:

```bash
npx -y -p git+https://github.com/TiranSpierer/baby-cli.git baby-cli --help
```

---

<details>
<summary><strong>Search commands</strong></summary>

```bash
baby-cli search "אמבטיה לתינוק"
baby-cli search "כיסא בטיחות" --store shilav,motsesim --in-stock
baby-cli search "עגלה" --store all --limit 10 --sort price --details
baby-cli search "אמבטיה מתקפלת" --sort discount
```

`--limit` applies per store. Relevance is the default storefront order; price and discount sorting happen independently inside each store so the source remains visible. Search prices and availability are hydrated from each product's current Shopify storefront data. `candidates` is the number of storefront results inspected; `matched` is the number remaining after relevance and availability filters.

</details>

<details>
<summary><strong>Product commands</strong></summary>

```bash
baby-cli product info motsesim "7482467-אמבטיה-מתקפלת-עם-טרמומטר-ורוד-בייבי-טאץ"
baby-cli product info baby-star "https://www.baby-star.co.il/products/40168297"
```

Product arguments accept a store handle or a full product URL from the selected store. Output includes variant prices and availability plus SKU and barcode when the retailer publishes them.

</details>

<details>
<summary><strong>Collection commands</strong></summary>

```bash
baby-cli collection search "אמבט" --store all
baby-cli collection list shilav --query אמבט
baby-cli collection products agalease outlet --limit 20
```

Collection search uses each retailer's complete Shopify collection taxonomy rather than inferring categories from free-text results. Collection counts are labelled as retailer-reported because Shopify collection metadata can occasionally disagree with the collection-products endpoint.

</details>

<details>
<summary><strong>Generated files</strong></summary>

`product info` creates a bundle under `<os-temp>/baby-cli/<store>/<hash>/`:

```text
product.yml       Normalized identity, pricing, availability, variants, and images
description.md    Product description converted from HTML to Markdown
raw.json          Complete untouched Shopify product payload
```

</details>

<details>
<summary><strong>Output and limitations</strong></summary>

Commands print compact YAML. Prices are current storefront prices. `regular_price` appears only when Shopify publishes a higher `compare_at_price`. Availability is boolean; retailers do not expose exact inventory quantities publicly.

The CLI does not automatically claim that similarly named products from different stores are identical. Use published barcodes, model/SKU details, and product descriptions when comparing offers.

</details>

<details>
<summary><strong>Requirements</strong></summary>

- Node.js 20+
- No store account or API key

</details>
