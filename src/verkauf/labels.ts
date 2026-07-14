import type { OrderChannel, OrderStatus } from './types';

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  shop: 'Shop', b2b_portal: 'B2B-Portal', marktplatz: 'Marktplatz',
  telefon: 'Telefon', manuell: 'Manuell',
};
export const STATUS_LABEL: Record<OrderStatus, string> = {
  angebot: 'Angebot', auftrag: 'Auftrag', versendet: 'Versendet',
  rechnung_gestellt: 'Rechnung gestellt', bezahlt: 'Bezahlt',
  retoure: 'Retoure', storniert: 'Storniert',
};
