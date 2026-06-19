export interface GoogleAdsRow {
  segments: { date: string };
  metrics: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
    videoViews?: string;
  };
}
export interface GoogleAdsStreamChunk {
  results?: GoogleAdsRow[];
}
