export interface ShopwareOrderCustomer {
  customerId: string | null;
  id: string;
}
export interface ShopwareOrderState {
  technicalName: string;
}
export interface ShopwareOrder {
  id: string;
  orderDateTime: string;          // ISO, z.B. "2026-01-05T10:00:00.000+00:00"
  amountTotal: number;            // brutto
  amountNet?: number;
  stateMachineState?: ShopwareOrderState;
  orderCustomer?: ShopwareOrderCustomer;
}
export interface ShopwareOrderPage {
  data: ShopwareOrder[];
  total: number;
}
