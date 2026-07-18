export type OpenItemDirection = 'debitor' | 'kreditor';
export type OpenItemStatus = 'offen' | 'teilweise_bezahlt' | 'bezahlt';
export type PaymentMethod = 'ueberweisung' | 'lastschrift' | 'kreditkarte' | 'paypal' | 'sonstige';

export interface OpenItemRow {
  id: string; direction: OpenItemDirection; contactName: string; reference: string | null;
  amount: number; dueDate: string; status: OpenItemStatus;
  paid: number; remaining: number; overdue: boolean;
}
export interface PaymentRow {
  id: string; amount: number; method: PaymentMethod; reference: string | null; paidAt: string;
}
export interface OpenItemDetail {
  id: string; direction: OpenItemDirection; contactId: string; contactName: string;
  reference: string | null; orderId: string | null; orderNumber: string | null; orderStatus: string | null;
  purchaseOrderId: string | null; purchaseOrderNumber: string | null;
  amount: number; dueDate: string; status: OpenItemStatus;
  paid: number; remaining: number; overdue: boolean; payments: PaymentRow[];
}
export interface PaymentInput {
  amount: number; method: PaymentMethod; reference?: string | null; paidAt?: string | null;
}
export interface UnassignedPayment {
  id: string; amount: number; method: PaymentMethod; reference: string | null; paidAt: string;
}
export interface OpenItemOption { id: string; label: string; contactId: string; remaining: number }
export interface ContactOption { id: string; name: string }
// Bestellung (purchase_order) als Auswahloption für die Verknüpfung einer Eingangsrechnung.
export interface PurchaseOrderOption { id: string; number: string; supplierId: string; status: string }
export interface KreditorInvoiceInput {
  supplierId: string; amount: number; dueDate: string; reference: string; purchaseOrderId?: string | null;
}
export interface OpenItemFilter { direction?: OpenItemDirection; onlyOpen?: boolean; dueFrom?: string; dueTo?: string }
