export interface AmazonAdsReportRow {
  date: string;
  cost: number;
  impressions: number;
  clicks: number;
  purchases14d: number;
  sales14d: number;
}

export interface AmazonAdsReportStatus {
  reportId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILURE';
  url?: string;
  failureReason?: string;
}
