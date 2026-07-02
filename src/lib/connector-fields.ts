export type Connector = 'shopware' | 'ga4' | 'klaviyo' | 'meta' | 'tiktok' | 'google';

export interface FieldDef {
  field: string;
  label: string;
  secret: boolean;
  optional: boolean;
}

export const CONNECTOR_FIELDS: Record<Connector, FieldDef[]> = {
  shopware: [
    { field: 'SHOPWARE_API_URL', label: 'API URL', secret: false, optional: false },
    { field: 'SHOPWARE_CLIENT_ID', label: 'Client ID', secret: false, optional: false },
    { field: 'SHOPWARE_CLIENT_SECRET', label: 'Client Secret', secret: true, optional: false },
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
  meta: [
    { field: 'META_ACCESS_TOKEN', label: 'Access Token', secret: true, optional: false },
    { field: 'META_AD_ACCOUNT_ID', label: 'Ad Account ID', secret: false, optional: false },
    { field: 'META_PURCHASE_ACTION_TYPE', label: 'Purchase Action Type', secret: false, optional: true },
  ],
  tiktok: [
    { field: 'TIKTOK_ACCESS_TOKEN', label: 'Access Token', secret: true, optional: false },
    { field: 'TIKTOK_ADVERTISER_ID', label: 'Advertiser ID', secret: false, optional: false },
    { field: 'TIKTOK_VALUE_METRIC', label: 'Value-Metrik', secret: false, optional: true },
    { field: 'TIKTOK_VIDEO_METRIC', label: 'Video-Metrik', secret: false, optional: true },
  ],
  google: [
    { field: 'GOOGLE_ADS_DEVELOPER_TOKEN', label: 'Developer Token', secret: true, optional: false },
    { field: 'GOOGLE_ADS_CLIENT_ID', label: 'OAuth Client ID', secret: false, optional: false },
    { field: 'GOOGLE_ADS_CLIENT_SECRET', label: 'OAuth Client Secret', secret: true, optional: false },
    { field: 'GOOGLE_ADS_REFRESH_TOKEN', label: 'Refresh Token (Fallback)', secret: true, optional: true },
    { field: 'GOOGLE_ADS_CUSTOMER_ID', label: 'Customer ID', secret: false, optional: false },
    { field: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', label: 'Login Customer ID', secret: false, optional: true },
  ],
};

export const CONNECTORS = Object.keys(CONNECTOR_FIELDS) as Connector[];

// Human-readable connector names shown in the UI.
export const CONNECTOR_LABELS: Record<Connector, string> = {
  shopware: 'Shopware',
  ga4: 'Google Analytics 4',
  klaviyo: 'Klaviyo',
  meta: 'Meta Ads',
  tiktok: 'TikTok Ads',
  google: 'Google Ads',
};

// Connectors grouped into named sections by data-source category.
export const CONNECTOR_GROUPS: { title: string; connectors: Connector[] }[] = [
  { title: 'Shop', connectors: ['shopware'] },
  { title: 'Web-Analytics', connectors: ['ga4'] },
  { title: 'Werbung', connectors: ['meta', 'tiktok', 'google'] },
  { title: 'E-Mail & CRM', connectors: ['klaviyo'] },
];
