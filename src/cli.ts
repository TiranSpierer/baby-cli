#!/usr/bin/env node
import { Command, Option } from "commander";
import { collectionProducts, listCollections, productInfo, searchCollections, searchProducts, storesList } from "./core.js";
import { toYaml } from "./format.js";
import { closeClient } from "./api/client.js";

function positive(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error("must be a positive decimal integer");
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("must be a safe positive integer");
  return number;
}
function output(task: Promise<unknown> | unknown): Promise<void> {
  return Promise.resolve(task).then((value) => { process.stdout.write(toYaml(value)); });
}

export function buildProgram(): Command {
  const program = new Command().name("baby-cli").description("Search and inspect products from Israeli baby stores").version("0.1.3").showHelpAfterError();
  program.command("stores").description("List supported stores").action(() => output(storesList()));
  program.command("search <query>").description("Search live baby-store catalogs")
    .option("--store <stores>", "store ID, comma-separated IDs, or all", "all")
    .option("--limit <number>", "maximum products per store", positive, 5)
    .option("--in-stock", "only return products with an available variant")
    .option("--details", "include variant options, tags, and a primary image")
    .addOption(new Option("--sort <order>", "sort within each store").choices(["relevance", "price", "price-desc", "discount"]).default("relevance"))
    .action((query, options) => output(searchProducts({ query, stores: options.store, limit: options.limit, inStock: options.inStock, details: options.details, sort: options.sort })));
  const product = program.command("product").description("Product operations");
  product.command("info <store> <product>").description("Get complete product and variant details by handle or URL").action((store, value) => output(productInfo(store, value)));
  const collection = program.command("collection").description("Collection operations");
  collection.command("search <query>").description("Find retailer-defined collections across stores").option("--store <stores>", "store ID, comma-separated IDs, or all", "all").option("--limit <number>", "maximum collections per store", positive, 20).action((query, options) => output(searchCollections(query, options.store, options.limit)));
  collection.command("list <store>").description("List store collections")
    .addOption(new Option("--query <text>", "filter collection names across all pages").conflicts("page"))
    .addOption(new Option("--page <number>", "page number").argParser(positive).default(1).conflicts("query"))
    .option("--limit <number>", "maximum collections", positive, 50)
    .action((store, options) => output(listCollections(store, options)));
  collection.command("products <store> <collection>").description("List products in a retailer-defined collection")
    .addOption(new Option("--page <number>", "page number").argParser(positive).default(1).conflicts("allPages"))
    .addOption(new Option("--all-pages", "fetch the complete collection before filtering and sorting").conflicts("page"))
    .option("--limit <number>", "maximum products to return", positive, 20)
    .option("--in-stock", "only return products with an available variant")
    .option("--details", "include variant options, tags, and a primary image")
    .addOption(new Option("--sort <order>", "sort returned products").choices(["catalog", "price", "price-desc", "discount"]).default("catalog"))
    .action((store, handle, options) => output(collectionProducts(store, handle, options)));
  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try { await buildProgram().parseAsync(argv); }
  finally { await closeClient(); }
}

void main().catch((error) => { process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
