import type { LifecycleStatus } from './lifecycle';
export interface Product {
  id: string; tenantId: string | null; name: string; description: string | null;
  lifecycleStatus: LifecycleStatus; category: string | null; brand: string | null;
  defaultSupplierId: string | null; imageUrl: string | null; createdAt: string;
}
export interface Variant {
  id: string; productId: string; sku: string; gtin: string | null;
  attributes: Record<string, unknown> | null; purchasePrice: number | null;
  weightG: number | null; reorderPoint: number; customsTariffNo: string | null;
  status: 'aktiv' | 'inaktiv';
}
export interface Price {
  id: string; variantId: string; priceListId: string; minQty: number;
  amount: number | null; validFrom: string | null;
}
export interface BundleComponent { id: string; bundleVariantId: string; componentVariantId: string; quantity: number }
export interface ProductDocument {
  id: string; productId: string; type: string; fileUrl: string | null;
  expiresAt: string | null; uploadedAt: string;
}
export interface ProductListItem extends Product { variantCount: number; minPurchasePrice: number | null }
export interface ProductDetail extends Product {
  variants: Variant[]; prices: Price[]; bundle: BundleComponent[]; documents: ProductDocument[];
}
export interface ProductInput {
  name: string; description?: string | null; lifecycleStatus: LifecycleStatus;
  category?: string | null; brand?: string | null; defaultSupplierId?: string | null; imageUrl?: string | null;
}
export interface VariantInput {
  productId: string; sku: string; gtin?: string | null; attributes?: Record<string, unknown> | null;
  purchasePrice?: number | null; weightG?: number | null; reorderPoint: number;
  customsTariffNo?: string | null; status: 'aktiv' | 'inaktiv';
}
