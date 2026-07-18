import type { OpenItemDirection, OpenItemStatus, PaymentMethod } from './types';

export const DIRECTION_LABEL: Record<OpenItemDirection, string> = { debitor: 'Debitor', kreditor: 'Kreditor' };
export const OI_STATUS_LABEL: Record<OpenItemStatus, string> = {
  offen: 'Offen', teilweise_bezahlt: 'Teilweise bezahlt', bezahlt: 'Bezahlt',
};
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  ueberweisung: 'Überweisung', lastschrift: 'Lastschrift', kreditkarte: 'Kreditkarte',
  paypal: 'PayPal', sonstige: 'Sonstige',
};
