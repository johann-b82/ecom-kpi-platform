export type Connector = 'shopware' | 'woocommerce' | 'ga4' | 'klaviyo' | 'mailchimp' | 'meta' | 'tiktok' | 'google';

export interface FieldDef {
  field: string;
  label: string;
  secret: boolean;
  optional: boolean;
  // OAuth app credential — needed to enable the "Mit … verbinden" flow. Grouped
  // and highlighted in the Verbindungen UI.
  oauth?: boolean;
}

export const CONNECTOR_FIELDS: Record<Connector, FieldDef[]> = {
  shopware: [
    { field: 'SHOPWARE_API_URL', label: 'API URL', secret: false, optional: false },
    { field: 'SHOPWARE_CLIENT_ID', label: 'Client ID', secret: false, optional: false },
    { field: 'SHOPWARE_CLIENT_SECRET', label: 'Client Secret', secret: true, optional: false },
  ],
  woocommerce: [
    { field: 'WOOCOMMERCE_STORE_URL', label: 'Store URL', secret: false, optional: false },
    { field: 'WOOCOMMERCE_CONSUMER_KEY', label: 'Consumer Key', secret: true, optional: false },
    { field: 'WOOCOMMERCE_CONSUMER_SECRET', label: 'Consumer Secret', secret: true, optional: false },
  ],
  ga4: [
    { field: 'GA4_PROPERTY_ID', label: 'Property ID', secret: false, optional: false },
    { field: 'GA4_SERVICE_ACCOUNT_JSON', label: 'Service Account JSON (Fallback)', secret: true, optional: true },
  ],
  klaviyo: [
    { field: 'KLAVIYO_API_KEY', label: 'Private API Key', secret: true, optional: false },
    { field: 'KLAVIYO_SIGNUP_METRIC', label: 'Signup-Metrik', secret: false, optional: true },
    { field: 'KLAVIYO_UNSUB_METRIC', label: 'Unsub-Metrik', secret: false, optional: true },
  ],
  mailchimp: [
    { field: 'MAILCHIMP_API_KEY', label: 'API Key', secret: true, optional: false },
    { field: 'MAILCHIMP_LIST_ID', label: 'Audience / List ID', secret: false, optional: false },
  ],
  meta: [
    { field: 'META_OAUTH_APP_ID', label: 'OAuth App ID', secret: false, optional: true, oauth: true },
    { field: 'META_OAUTH_APP_SECRET', label: 'OAuth App Secret', secret: true, optional: true, oauth: true },
    { field: 'META_ACCESS_TOKEN', label: 'Access Token (Fallback)', secret: true, optional: true },
    { field: 'META_AD_ACCOUNT_ID', label: 'Ad Account ID', secret: false, optional: false },
    { field: 'META_PURCHASE_ACTION_TYPE', label: 'Purchase Action Type', secret: false, optional: true },
  ],
  tiktok: [
    { field: 'TIKTOK_OAUTH_APP_ID', label: 'OAuth App ID', secret: false, optional: true, oauth: true },
    { field: 'TIKTOK_OAUTH_APP_SECRET', label: 'OAuth App Secret', secret: true, optional: true, oauth: true },
    { field: 'TIKTOK_ACCESS_TOKEN', label: 'Access Token (Fallback)', secret: true, optional: true },
    { field: 'TIKTOK_ADVERTISER_ID', label: 'Advertiser ID', secret: false, optional: false },
    { field: 'TIKTOK_VALUE_METRIC', label: 'Value-Metrik', secret: false, optional: true },
    { field: 'TIKTOK_VIDEO_METRIC', label: 'Video-Metrik', secret: false, optional: true },
  ],
  google: [
    { field: 'GOOGLE_ADS_DEVELOPER_TOKEN', label: 'Developer Token', secret: true, optional: false },
    { field: 'GOOGLE_ADS_CLIENT_ID', label: 'OAuth Client ID', secret: false, optional: false, oauth: true },
    { field: 'GOOGLE_ADS_CLIENT_SECRET', label: 'OAuth Client Secret', secret: true, optional: false, oauth: true },
    { field: 'GOOGLE_ADS_REFRESH_TOKEN', label: 'Refresh Token (Fallback)', secret: true, optional: true },
    { field: 'GOOGLE_ADS_CUSTOMER_ID', label: 'Customer ID', secret: false, optional: false },
    { field: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', label: 'Login Customer ID', secret: false, optional: true },
  ],
};

export const CONNECTORS = Object.keys(CONNECTOR_FIELDS) as Connector[];

// Human-readable connector names shown in the UI.
export const CONNECTOR_LABELS: Record<Connector, string> = {
  shopware: 'Shopware',
  woocommerce: 'WooCommerce',
  ga4: 'Google Analytics 4',
  klaviyo: 'Klaviyo',
  mailchimp: 'Mailchimp',
  meta: 'Meta Ads',
  tiktok: 'TikTok Ads',
  google: 'Google Ads',
};

// Connectors that write the same underlying tables and therefore must not both
// be configured; setting credentials for one is blocked while a sibling is
// configured. The shop pair TRUNCATE-replaces orders/customers (no source
// column), so only one shop system can be active at a time.
export const EXCLUSIVE_GROUPS: Connector[][] = [
  ['shopware', 'woocommerce'],
];

// The connectors that block `connector` from being configured (its group peers).
export function exclusiveSiblings(connector: Connector): Connector[] {
  const group = EXCLUSIVE_GROUPS.find((g) => g.includes(connector));
  return group ? group.filter((c) => c !== connector) : [];
}

// Connectors grouped into named sections by data-source category.
export const CONNECTOR_GROUPS: { title: string; connectors: Connector[] }[] = [
  { title: 'Shop', connectors: ['shopware', 'woocommerce'] },
  { title: 'Web-Analytics', connectors: ['ga4'] },
  { title: 'Werbung', connectors: ['meta', 'tiktok', 'google'] },
  { title: 'E-Mail & CRM', connectors: ['klaviyo', 'mailchimp'] },
];
