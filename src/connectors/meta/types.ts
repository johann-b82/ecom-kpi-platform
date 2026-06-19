export interface MetaAction {
  action_type: string;
  value: string;
}
export interface MetaInsightRow {
  date_start: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}
export interface MetaInsightsResponse {
  data: MetaInsightRow[];
  paging?: { next?: string };
}
