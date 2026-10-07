#!/usr/bin/env node
import { Command, Option } from "commander";
import { collectionProducts, listCollections, productInfo, searchCollections, searchProducts, storesList } from "./core.js";
import { toYaml } from "./format.js";

function positive(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error("must be a positive integer");
  return number;
}
function output(task: Promise<unknown> | unknown): Promise<void> {
  return Promise.resolve(task).then((value) => { process.stdout.write(toYaml(value)); });
}

export function buildProgram(): Command {
  const program = new Command().name("baby-cli").description("Search and inspect products from Israeli baby stores").version("0.1.0").showHelpAfterError();
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
  collection.command("list <store>").description("List store collections").option("--query <text>", "filter collection names").option("--page <number>", "page number", positive, 1).option("--limit <number>", "maximum collections", positive, 50).action((store, options) => output(listCollections(store, options)));
  collection.command("products <store> <collection>").description("List products in a collection").option("--page <number>", "page number", positive, 1).option("--limit <number>", "maximum products", positive, 20).action((store, handle, options) => output(collectionProducts(store, handle, options)));
  return program;
}

export async function main(argv = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

main().catch((error) => { process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
