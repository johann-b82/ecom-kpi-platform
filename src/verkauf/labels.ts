import type { OrderChannel, OrderStatus, CostType, CostSource } from './types';

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  shop: 'Shop', b2b_portal: 'B2B-Portal', marktplatz: 'Marktplatz',
  telefon: 'Telefon', manuell: 'Manuell',
};
export const STATUS_LABEL: Record<OrderStatus, string> = {
  angebot: 'Angebot', auftrag: 'Auftrag', versendet: 'Versendet',
  rechnung_gestellt: 'Rechnung gestellt', bezahlt: 'Bezahlt',
  retoure: 'Retoure', storniert: 'Storniert',
};
export const COST_TYPE_LABEL: Record<CostType, string> = {
  wareneinsatz: 'Wareneinsatz', marktplatzgebuehr: 'Marktplatzgebühr', fulfillment: 'Fulfillment',
  versand: 'Versand', zahlungsgebuehr: 'Zahlungsgebühr', retoure: 'Retoure', sonstige: 'Sonstige',
};
export const COST_SOURCE_LABEL: Record<CostSource, string> = {
  berechnet: 'berechnet', api: 'API', manuell: 'manuell',
};
