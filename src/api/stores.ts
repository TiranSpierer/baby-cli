export const STORE_IDS = ["shilav", "baby-star", "motsesim", "agalease", "mybaby"] as const;
export type StoreId = (typeof STORE_IDS)[number];

export interface Store {
  id: StoreId;
  name: string;
  baseUrl: string;
  shopifyUrl: string;
  searchSelector?: string;
}

export const STORES: Record<StoreId, Store> = {
  shilav: { id: "shilav", name: "Shilav", baseUrl: "https://www.shilav.co.il", shopifyUrl: "https://shilav-prod.myshopify.com" },
  "baby-star": { id: "baby-star", name: "Baby Star", baseUrl: "https://www.baby-star.co.il", shopifyUrl: "https://babystarisrael.myshopify.com" },
  motsesim: { id: "motsesim", name: "Motsesim", baseUrl: "https://www.motsesim.co.il", shopifyUrl: "https://motsesim.myshopify.com" },
  agalease: { id: "agalease", name: "Agalease", baseUrl: "https://www.agalease-baby.co.il", shopifyUrl: "https://agalease-baby.myshopify.com" },
  mybaby: { id: "mybaby", name: "My Baby", baseUrl: "https://www.mybaby.co.il", shopifyUrl: "https://my-baby-yarka.myshopify.com", searchSelector: "#SearchLoop a[href*='/products/']" },
};

const ALIASES: Record<string, StoreId> = {
  shilav: "shilav", "baby-star": "baby-star", babystar: "baby-star",
  motsesim: "motsesim", motzetzim: "motsesim", agalease: "agalease", agalis: "agalease",
  mybaby: "mybaby", "my-baby": "mybaby",
};

export function getStore(value: string): Store {
  const id = ALIASES[value.trim().toLowerCase()];
  if (!id) throw new Error(`unknown store "${value}"; choose ${STORE_IDS.join(", ")}, or all`);
  return STORES[id];
}

export function selectStores(value: string): Store[] {
  if (value.trim().toLowerCase() === "all") return STORE_IDS.map((id) => STORES[id]);
  const stores = value.split(",").map(getStore);
  return [...new Map(stores.map((store) => [store.id, store])).values()];
}
