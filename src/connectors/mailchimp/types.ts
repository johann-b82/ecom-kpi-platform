// Mailchimp Marketing API — List Activity endpoint (GET /lists/{id}/activity).
// One entry per calendar day with subscribe/unsubscribe counts.
export interface MailchimpActivityDay {
  day: string; // 'YYYY-MM-DD'
  subs?: number | string;
  unsubs?: number | string;
}

export interface MailchimpActivityResponse {
  list_id: string;
  total_items: number;
  activity: MailchimpActivityDay[];
}
