// DoD-Seed Verkauf (§11 #1–#5). Belege entstehen im Skript über die
// Repository-Funktionen (nicht per direktem Insert) — nur so schreibt sich der
// Faden mit allen Perlen und Seiteneffekten. Varianten per SKU aufgelöst.
import type { OrderChannel } from './types';

export interface SeedOrderLine { sku: string; quantity: number; unitPrice: number }
export interface SeedOrder {
  ref: string;                 // interne Referenz für Log
  contactNumber: string;       // K-#### des Kunden
  channel: OrderChannel;
  lines: SeedOrderLine[];
  advanceTo: 'angebot' | 'auftrag' | 'versendet' | 'rechnung_gestellt' | 'bezahlt';
  withReturn?: boolean;        // Retoure auf diesen Beleg anlegen (#2)
}

export const SEED_ORDERS: SeedOrder[] = [
  // #1 voller Faden bis bezahlt (+ #2 Retoure)  — Kanal shop
  { ref: 'shop-voll', contactNumber: 'K-0001', channel: 'shop',
    lines: [{ sku: 'BK-CLASSIC', quantity: 3, unitPrice: 16.9 }], advanceTo: 'bezahlt', withReturn: true },
  // #3 B2B-Angebot (Einstiegsstatus durch Kanal)
  { ref: 'b2b-angebot', contactNumber: 'K-0001', channel: 'b2b_portal',
    lines: [{ sku: 'SJ-BLAU', quantity: 10, unitPrice: 11.5 }], advanceTo: 'angebot' },
  // #4 Teil-Fortschritt: auftrag / versendet / rechnung_gestellt (+ #5 dritter Kanal telefon)
  { ref: 'shop-auftrag', contactNumber: 'K-0001', channel: 'shop',
    lines: [{ sku: 'SJ-BLAU', quantity: 2, unitPrice: 11.9 }], advanceTo: 'auftrag' },
  { ref: 'telefon-versendet', contactNumber: 'K-0001', channel: 'telefon',
    lines: [{ sku: 'BK-CLASSIC', quantity: 1, unitPrice: 16.9 }], advanceTo: 'versendet' },
  { ref: 'b2b-rechnung', contactNumber: 'K-0001', channel: 'b2b_portal',
    lines: [{ sku: 'SJ-BLAU', quantity: 5, unitPrice: 11.5 }], advanceTo: 'rechnung_gestellt' },
];
