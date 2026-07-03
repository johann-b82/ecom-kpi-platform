// Per-KPI help text shown as a tooltip on the dashboard: how each KPI is
// calculated (`formula`) and where its data comes from (`source`).
// Keyed by Kpi.key (see src/kpi/{see,think,do,care}.ts).

export interface KpiHelp {
  formula: string;
  source: string;
}

export const KPI_HELP: Record<string, KpiHelp> = {
  // SEE — Awareness
  impressions: {
    formula: 'Summe der Impressions aller Ad-Kampagnen im Zeitraum.',
    source: 'Ad-Plattformen (Meta/Google/TikTok Ads) → ad_spend.',
  },
  video_views: {
    formula: 'Summe der Metrik „video_views" im Zeitraum.',
    source: 'Ad-Plattformen (Meta/Google/TikTok Ads) → daily_metrics.',
  },
  cpm: {
    formula: 'Ad-Spend ÷ Impressions × 1000 (Kosten pro 1.000 Impressions).',
    source: 'Ad-Plattformen (Meta/Google/TikTok Ads) → ad_spend.',
  },
  traffic: {
    formula: 'Summe der Sessions im Zeitraum.',
    source: 'Web-Analytics (GA4) → daily_metrics (sessions).',
  },
  ad_recall: {
    formula: 'In V1 nicht erhoben — erfordert eine Brand-Lift-/Recall-Studie.',
    source: 'Keine Datenquelle angebunden.',
  },

  // THINK — Consideration
  sessions: {
    formula: 'Summe der Sessions im Zeitraum.',
    source: 'Web-Analytics (GA4) → daily_metrics.',
  },
  pages_per_session: {
    formula: 'Pageviews ÷ Sessions.',
    source: 'Web-Analytics (GA4) → daily_metrics.',
  },
  bounce_rate: {
    formula: 'Bounced Sessions ÷ Sessions.',
    source: 'Web-Analytics (GA4) → daily_metrics.',
  },
  returning_visitors: {
    formula: 'Returning Users ÷ Total Users.',
    source: 'Web-Analytics (GA4) → daily_metrics.',
  },
  atc_rate: {
    formula: 'Add-to-Carts ÷ Sessions.',
    source: 'Web-Analytics (GA4) → daily_metrics.',
  },
  newsletter_signups: {
    formula: 'Summe der Newsletter-Anmeldungen im Zeitraum.',
    source: 'E-Mail/CRM (Klaviyo) → subscribers.',
  },

  // DO — Conversion
  conversion_rate: {
    formula: 'GA4-Käufe (ecommercePurchases) ÷ Sessions.',
    source: 'GA4 (ecommercePurchases + Sessions).',
  },
  aov: {
    formula: 'Umsatz ÷ Anzahl Bestellungen (Average Order Value).',
    source: 'Shopware → orders.',
  },
  revenue: {
    formula: 'Summe des Bestellumsatzes im Zeitraum (brutto, ohne stornierte).',
    source: 'Shopware → orders.',
  },
  roas: {
    formula: 'Conversion-Value ÷ Ad-Spend (Return on Ad Spend).',
    source: 'Ad-Plattformen (Meta/Google/TikTok Ads) → ad_spend.',
  },
  cac: {
    formula: 'Ad-Spend ÷ Neukunden (Erstbesteller im Zeitraum).',
    source: 'Ad-Spend (Ads) + Shopware (Neukunden).',
  },
  cart_abandonment: {
    formula: '1 − (Bestellungen ÷ begonnene Checkouts).',
    source: 'GA4 (checkouts_started) + Shopware (Bestellungen).',
  },

  // CARE — Loyalty
  repeat_rate: {
    formula: 'Anteil aktiver Kunden mit ≥ 2 Bestellungen.',
    source: 'Shopware → customers/orders.',
  },
  clv: {
    formula: 'Ø Gesamtumsatz je aktivem Kunden (Σ totalRevenue ÷ aktive Kunden).',
    source: 'Shopware → customers.',
  },
  repurchase_interval: {
    formula: 'Ø Tage zwischen Erst- und Letztbestellung ÷ (Bestellungen − 1), über Kunden mit ≥ 2 Bestellungen.',
    source: 'Shopware → customers.',
  },
  nps: {
    formula: 'Ø NPS-Score der Einträge im Zeitraum.',
    source: 'E-Mail/CRM (Klaviyo/Umfrage) → subscribers.',
  },
  retention: {
    formula: 'Anteil der Vorperioden-Kunden, die im Zeitraum erneut bestellt haben.',
    source: 'Shopware → orders.',
  },
  churn: {
    formula: '1 − Retention Rate.',
    source: 'Shopware → orders.',
  },
};
