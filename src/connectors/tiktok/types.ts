export interface TikTokReportRow {
  dimensions: { stat_time_day: string };
  metrics: Record<string, string>;
}
export interface TikTokPageInfo {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}
export interface TikTokReportResponse {
  code: number;
  message: string;
  data?: {
    list: TikTokReportRow[];
    page_info?: TikTokPageInfo;
  };
}
