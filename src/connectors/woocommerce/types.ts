export interface WooBilling {
  email?: string;
}

// WooCommerce REST API order (wc/v3). `total` is a gross amount string;
// customer_id is 0 for guest orders; status e.g. completed/processing/cancelled.
export interface WooOrder {
  id: number;
  status: string;
  date_created: string; // store timezone, 'YYYY-MM-DDTHH:MM:SS'
  total: string;        // brutto, as string
  customer_id: number;  // 0 = Gast
  billing?: WooBilling;
}
