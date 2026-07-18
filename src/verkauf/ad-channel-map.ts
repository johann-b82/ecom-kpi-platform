import type { OrderChannel } from './types';

// Fester Default: Web-Ads zählen auf den Shop, Amazon-Ads auf den Marktplatz.
// Manuelle channel_costs(werbung) kommen additiv obendrauf (siehe channelSummary).
export const AD_PLATFORM_CHANNEL: Record<string, OrderChannel> = {
  google_ads: 'shop', meta_ads: 'shop', tiktok_ads: 'shop', amazon_ads: 'marktplatz',
};

export function mapAdPlatformToChannel(platform: string): OrderChannel | null {
  return AD_PLATFORM_CHANNEL[platform] ?? null;
}
