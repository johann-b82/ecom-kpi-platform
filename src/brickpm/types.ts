export interface BpmProduct {
  id: string; name: string; cat: string; series: string; status: string;
  year: number; parts: number; uvp: number; price: number; cost: number;
  tMgn: number; mMgn: number; stock: number; minStock: number;
  validFrom: string | null; validTo: string | null; channel: string; succ: string | null; descr: string;
}
export interface BpmPromotion {
  id: string; name: string; productId: string; type: string; startDate: string | null; endDate: string | null;
  targetUnits: number; sold: number; targetRev: number; expMgn: number; status: string; note: string;
}
export interface BpmGoodie {
  id: string; name: string; type: string; cost: number; price: number; products: string[];
  minCart: number; validFrom: string | null; validTo: string | null; status: string; mgnEffect: number; comment: string;
}
export interface BpmCompetitor {
  id: string; productId: string; competitor: string; compProduct: string;
  ownPrice: number; compPrice: number; avail: boolean; date: string | null; rec: string;
}
export interface BpmNotification {
  id: string; type: string; priority: string; refId: string; msg: string; action: string;
  status: string; due: string | null; role: string; target: string;
}
export interface BpmIntegration {
  id: string; type: string; system: string; purpose: string; objects: string[]; dir: string;
  status: string; ep: string; lastSync: string;
}
