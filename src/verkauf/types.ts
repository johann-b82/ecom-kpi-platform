export type OrderChannel = 'shop' | 'b2b_portal' | 'marktplatz' | 'telefon' | 'manuell';
export type OrderStatus =
  | 'angebot' | 'auftrag' | 'versendet' | 'rechnung_gestellt' | 'bezahlt' | 'retoure' | 'storniert';
export type EventStage = 'bestellt' | 'kommissioniert' | 'rechnung_gestellt' | 'bezahlt' | 'retoure';
export type SourceApp = 'verkauf' | 'verfuegbarkeit' | 'finanzen';

export interface SalesOrder {
  id: string; tenantId: string | null; number: string; contactId: string;
  channel: OrderChannel; status: OrderStatus; priceListId: string | null;
  relatedOrderId: string | null; currency: string;
  placedAt: string | null; createdAt: string;
}
export interface SalesOrderLine {
  id: string; orderId: string; variantId: string; quantity: number; unitPrice: number;
}
export interface SalesOrderEvent {
  id: string; orderId: string; stage: EventStage; sourceApp: SourceApp;
  note: string | null; automated: boolean; occurredAt: string;
}
export interface SalesOrderDetail extends SalesOrder {
  lines: SalesOrderLine[]; events: SalesOrderEvent[];
}
export interface SalesOrderLineInput { variantId: string; quantity: number; unitPrice: number }
export interface SalesOrderInput {
  contactId: string; channel: OrderChannel; priceListId?: string | null;
  currency?: string; placedAt?: string | null; lines: SalesOrderLineInput[];
}

export interface OrderRow {
  id: string; number: string; contactId: string; contactName: string;
  channel: OrderChannel; status: OrderStatus; createdAt: string; stages: EventStage[];
}
export interface OrderViewLine {
  id: string; variantId: string; sku: string; productName: string; quantity: number; unitPrice: number;
}
export interface OrderView extends SalesOrder {
  contactName: string; lines: OrderViewLine[]; events: SalesOrderEvent[];
}
export interface SellableVariant { variantId: string; sku: string; productName: string; available: number }
export interface CustomerOption {
  id: string; name: string; priceListId: string | null; paymentTerms: number; deliveryLabel: string | null;
}
export interface PriceEntry { variantId: string; priceListId: string; amount: number }

export interface DateRange { start: string; end: string } // ISO YYYY-MM-DD, inklusiv
export interface SalesTotals {
  revenueNet: number; orders: number; avgOrderValueNet: number; openOffers: number;
}
export interface ChannelSummary {
  channel: OrderChannel; revenueNet: number; orders: number; avgOrderValueNet: number;
}
export interface StatusCount { status: OrderStatus; count: number }
