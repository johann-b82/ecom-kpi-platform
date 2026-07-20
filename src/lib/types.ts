export interface DateRange { start: string; end: string; } // ISO 'YYYY-MM-DD', inklusiv

export type Source =
  | 'shopware' | 'ga4' | 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'klaviyo' | 'mailchimp' | 'seed';
export type AdPlatform = 'google_ads' | 'meta_ads' | 'tiktok_ads';

export interface DailyMetric {
  date: string; source: Source; channel: string; metricKey: string; value: number;
}
export interface Order {
  orderId: string; customerId: string; date: string; revenue: number; isFirstOrder: boolean;
}
export interface Customer {
  customerId: string; firstOrderDate: string; lastOrderDate: string;
  ordersCount: number; totalRevenue: number;
}
export interface AdSpend {
  date: string; platform: AdPlatform; spend: number; impressions: number;
  clicks: number; conversions: number; convValue: number;
  campaignId?: string; campaignName?: string;
}
export interface Subscriber {
  date: string; source: Source; signups: number; unsubscribes: number; npsScore: number | null;
}

export interface CanonicalDataset {
  dailyMetrics: DailyMetric[];
  orders: Order[];
  customers: Customer[];
  adSpend: AdSpend[];
  subscribers: Subscriber[];
}

// Verkaufs-/Bestellzahlen aus den echten Belegen (sales_orders, gespeist aus
// WooCommerce) — überschreiben im E-Commerce-Dashboard die GA4-Schätzwerte.
export interface SalesFacts {
  revenue: number;            // Netto-Umsatz im Zeitraum
  purchases: number;          // Anzahl Käufe (Belege) im Zeitraum
  aov: number | null;         // Warenkorbwert = revenue / purchases
  clv: number | null;         // Ø Lifetime-Umsatz aktiver Kunden
  repeatRate: number | null;  // Anteil aktiver Kunden mit >= 2 Belegen (lifetime)
}
