export const STORE_IDS = ["shilav", "baby-star", "motsesim", "agalease", "mybaby"] as const;
export type StoreId = (typeof STORE_IDS)[number];

export interface Store {
  id: StoreId;
  name: string;
  baseUrl: string;
  searchSelector?: string;
}

export const STORES: Record<StoreId, Store> = {
  shilav: { id: "shilav", name: "Shilav", baseUrl: "https://www.shilav.co.il" },
  "baby-star": { id: "baby-star", name: "Baby Star", baseUrl: "https://www.baby-star.co.il" },
  motsesim: { id: "motsesim", name: "Motsesim", baseUrl: "https://www.motsesim.co.il" },
  agalease: { id: "agalease", name: "Agalease", baseUrl: "https://www.agalease-baby.co.il" },
  mybaby: { id: "mybaby", name: "My Baby", baseUrl: "https://www.mybaby.co.il", searchSelector: "#SearchLoop a[href*='/products/']" },
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
