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
