// DoD seed for Katalog. References the Kontakte seed's price-list + supplier IDs
// (relative import so IDs line up). Covers: Sternenjäger (aktiv, Farbvarianten,
// part of a 3er-Pack bundle); one product each in konzept/freigegeben/auslaufend/
// eingestellt; Bauklötze Classic; Weltraum-Buggy; ≥1 Staffelpreis (minQty>1) across
// Handel/Endkunde/Key Account; ≥1 variant flagged as "unter Meldebestand" intent.
import { PRICE_LISTS, CONTACTS } from '../kontakte/seed-data';

const HANDEL = PRICE_LISTS.find((p) => p.name === 'Handel')!.id;
const ENDKUNDE = PRICE_LISTS.find((p) => p.name === 'Endkunde')!.id;
const KEY_ACCOUNT = PRICE_LISTS.find((p) => p.name === 'Key Account')!.id;
const GUANGZHOU = CONTACTS.find((c) => c.name.startsWith('Guangzhou'))!.id;

type Lifecycle = 'konzept' | 'freigegeben' | 'aktiv' | 'auslaufend' | 'eingestellt';

export interface SeedProduct {
  id: string; name: string; description: string | null; lifecycleStatus: Lifecycle;
  category: string | null; brand: string | null; defaultSupplierId: string | null; imageUrl: string | null;
}
export interface SeedVariant {
  id: string; productId: string; sku: string; gtin: string | null;
  attributes: unknown; purchasePrice: number | null; weightG: number | null;
  reorderPoint: number; customsTariffNo: string | null; status: 'aktiv' | 'inaktiv';
}
export interface SeedPrice {
  id: string; variantId: string; priceListId: string; minQty: number; amount: number | null; validFrom: string | null;
}
export interface SeedBundle { id: string; bundleVariantId: string; componentVariantId: string; quantity: number }
export interface SeedConnection {
  id: string; app: string; provider: string; label: string; status: string; lastSyncedAt: string | null;
}

const P_STERNENJAEGER = 'd0d0d0d0-0000-4000-8000-000000000001';
const P_BAUKLOETZE = 'd0d0d0d0-0000-4000-8000-000000000002';
const P_WELTRAUM_BUGGY = 'd0d0d0d0-0000-4000-8000-000000000003';

export const PRODUCTS: SeedProduct[] = [
  { id: P_STERNENJAEGER, name: 'Sternenjäger', description: 'Action-Raumschiff mit Leuchtdetails.',
    lifecycleStatus: 'aktiv', category: 'Actionfiguren', brand: 'bryx', defaultSupplierId: GUANGZHOU, imageUrl: null },
  { id: P_BAUKLOETZE, name: 'Bauklötze Classic', description: '50-teiliges Holzbauklotz-Set.',
    lifecycleStatus: 'aktiv', category: 'Bauen', brand: 'bryx', defaultSupplierId: null, imageUrl: null },
  { id: P_WELTRAUM_BUGGY, name: 'Weltraum-Buggy', description: 'Ferngesteuerter Mond-Buggy.',
    lifecycleStatus: 'aktiv', category: 'Fahrzeuge', brand: 'bryx', defaultSupplierId: GUANGZHOU, imageUrl: null },
  { id: 'd0d0d0d0-0000-4000-8000-000000000004', name: 'Mond-Rakete (Prototyp)', description: null,
    lifecycleStatus: 'konzept', category: 'Fahrzeuge', brand: 'bryx', defaultSupplierId: null, imageUrl: null },
  { id: 'd0d0d0d0-0000-4000-8000-000000000005', name: 'Sternen-Set 2026', description: null,
    lifecycleStatus: 'freigegeben', category: 'Actionfiguren', brand: 'bryx', defaultSupplierId: null, imageUrl: null },
  { id: 'd0d0d0d0-0000-4000-8000-000000000006', name: 'Retro-Kreisel', description: null,
    lifecycleStatus: 'auslaufend', category: 'Klassiker', brand: 'bryx', defaultSupplierId: null, imageUrl: null },
  { id: 'd0d0d0d0-0000-4000-8000-000000000007', name: 'Alt-Baukasten', description: null,
    lifecycleStatus: 'eingestellt', category: 'Bauen', brand: 'bryx', defaultSupplierId: null, imageUrl: null },
];

const V_SJ_ROT = 'e0e0e0e0-0000-4000-8000-000000000001';
const V_SJ_BLAU = 'e0e0e0e0-0000-4000-8000-000000000002';
const V_SJ_3ER = 'e0e0e0e0-0000-4000-8000-000000000003';
const V_BK = 'e0e0e0e0-0000-4000-8000-000000000004';
const V_WB = 'e0e0e0e0-0000-4000-8000-000000000005';

export const VARIANTS: SeedVariant[] = [
  // SJ-ROT: intended "unter Meldebestand" story once a stock table exists (reorderPoint high).
  { id: V_SJ_ROT, productId: P_STERNENJAEGER, sku: 'SJ-ROT', gtin: '4260000000011', attributes: { farbe: 'rot' },
    purchasePrice: 6.50, weightG: 320, reorderPoint: 20, customsTariffNo: '95030075', status: 'aktiv' },
  { id: V_SJ_BLAU, productId: P_STERNENJAEGER, sku: 'SJ-BLAU', gtin: '4260000000028', attributes: { farbe: 'blau' },
    purchasePrice: 6.50, weightG: 320, reorderPoint: 10, customsTariffNo: '95030075', status: 'aktiv' },
  { id: V_SJ_3ER, productId: P_STERNENJAEGER, sku: 'SJ-3ER', gtin: null, attributes: { bundle: true },
    purchasePrice: 18.00, weightG: 980, reorderPoint: 5, customsTariffNo: '95030075', status: 'aktiv' },
  { id: V_BK, productId: P_BAUKLOETZE, sku: 'BK-CLASSIC', gtin: '4260000000035', attributes: null,
    purchasePrice: 9.00, weightG: 1200, reorderPoint: 15, customsTariffNo: '95030039', status: 'aktiv' },
  { id: V_WB, productId: P_WELTRAUM_BUGGY, sku: 'WB-01', gtin: '4260000000042', attributes: null,
    purchasePrice: 12.00, weightG: 640, reorderPoint: 8, customsTariffNo: '95030075', status: 'aktiv' },
];

export const PRICES: SeedPrice[] = [
  { id: 'f0f0f0f0-0000-4000-8000-000000000001', variantId: V_SJ_ROT, priceListId: HANDEL, minQty: 1, amount: 12.90, validFrom: null },
  // Staffelpreis (minQty > 1):
  { id: 'f0f0f0f0-0000-4000-8000-000000000002', variantId: V_SJ_ROT, priceListId: HANDEL, minQty: 10, amount: 11.90, validFrom: null },
  { id: 'f0f0f0f0-0000-4000-8000-000000000003', variantId: V_SJ_ROT, priceListId: ENDKUNDE, minQty: 1, amount: 19.90, validFrom: null },
  { id: 'f0f0f0f0-0000-4000-8000-000000000004', variantId: V_SJ_ROT, priceListId: KEY_ACCOUNT, minQty: 1, amount: 11.50, validFrom: null },
  { id: 'f0f0f0f0-0000-4000-8000-000000000005', variantId: V_BK, priceListId: HANDEL, minQty: 1, amount: 16.90, validFrom: null },
];

export const BUNDLES: SeedBundle[] = [
  // 3er-Pack: bundle variant SJ-3ER contains 3× SJ-ROT.
  { id: '90909090-0000-4000-8000-000000000001', bundleVariantId: V_SJ_3ER, componentVariantId: V_SJ_ROT, quantity: 3 },
];

export const CONNECTIONS: SeedConnection[] = [
  { id: 'b0b0b0b0-0000-4000-8000-000000000101', app: 'katalog', provider: 'shopware', label: 'Shopware',
    status: 'verbunden (Demo)', lastSyncedAt: '2026-07-01T09:00:00Z' },
  { id: 'b0b0b0b0-0000-4000-8000-000000000102', app: 'katalog', provider: 'amazon', label: 'Amazon',
    status: 'nicht verbunden', lastSyncedAt: null },
];
