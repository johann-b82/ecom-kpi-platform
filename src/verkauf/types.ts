import type { Sort } from '@/lib/sort';

export type OrderChannel = 'shop' | 'b2b_portal' | 'marktplatz' | 'telefon' | 'manuell';

// Sortierbare Spalten der Belegliste (client- und server-seitig geteilt).
export const ORDER_SORT = {
  allowed: ['number', 'contact', 'channel', 'status', 'placed'] as const,
  fallback: { col: 'placed', dir: 'desc' } as Sort,
};
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
  channel: OrderChannel; status: OrderStatus; createdAt: string; placedAt: string | null; stages: EventStage[];
}
export interface OrderViewLine {
  id: string; variantId: string; sku: string; productName: string; quantity: number; unitPrice: number;
}
export interface OrderView extends SalesOrder {
  contactName: string; lines: OrderViewLine[]; events: SalesOrderEvent[]; costs: OrderCost[];
  ekUnvollstaendig: boolean;
}
export interface SellableVariant { variantId: string; sku: string; productName: string; available: number }
export interface CustomerOption {
  id: string; name: string; priceListId: string | null; paymentTerms: number; deliveryLabel: string | null;
}
export interface PriceEntry { variantId: string; priceListId: string; amount: number }

export type CostType =
  | 'wareneinsatz' | 'marktplatzgebuehr' | 'fulfillment' | 'versand' | 'zahlungsgebuehr' | 'retoure' | 'sonstige';
export type CostSource = 'berechnet' | 'api' | 'manuell';
export interface OrderCost {
  id: string; orderId: string; type: CostType; amount: number; source: CostSource; sourceRef: string | null;
}

export interface DateRange { start: string; end: string } // ISO YYYY-MM-DD, inklusiv
export interface SalesTotals {
  revenueNet: number; orders: number; avgOrderValueNet: number; openOffers: number;
}
export interface ChannelSummary {
  channel: OrderChannel; revenueNet: number; orders: number; avgOrderValueNet: number;
  wareneinsatz: number; gebuehren: number; werbung: number; db: number; dbProzent: number | null;
  ekUnvollstaendig: boolean;
}
export interface MarginTotals {
  revenueNet: number; wareneinsatz: number; gebuehren: number; werbung: number;
  db: number; dbProzent: number | null; adSpend: number; mer: number | null;
}
export interface StatusCount { status: OrderStatus; count: number }
export interface TopProduct { name: string; sku: string; units: number; revenueNet: number }
export interface RevenuePoint { day: string; revenueNet: number }
