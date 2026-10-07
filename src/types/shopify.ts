export interface ShopifyImage {
  id?: number;
  src?: string;
  width?: number;
  height?: number;
  alt?: string | null;
  variant_ids?: number[];
}

export interface ShopifyVariant {
  id: number;
  title?: string;
  name?: string;
  public_title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  available?: boolean;
  price: number | string;
  compare_at_price?: number | string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  options?: string[];
  featured_image?: ShopifyImage | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  description?: string;
  body_html?: string;
  vendor?: string;
  type?: string;
  product_type?: string;
  tags?: string[] | string;
  available?: boolean;
  price?: number;
  price_min?: number;
  price_max?: number;
  compare_at_price?: number | null;
  images?: Array<string | ShopifyImage>;
  featured_image?: string | ShopifyImage | null;
  variants: ShopifyVariant[];
  url?: string;
}

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  description?: string;
  products_count?: number;
  image?: ShopifyImage | null;
}
