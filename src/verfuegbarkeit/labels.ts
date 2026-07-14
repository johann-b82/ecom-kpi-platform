import type { AdjustmentReason, PurchaseOrderStatus } from './types';

export const REASON_LABEL: Record<AdjustmentReason, string> = {
  inventurdifferenz: 'Inventurdifferenz', bruch_schwund: 'Bruch/Schwund',
  korrektur_fehlbuchung: 'Korrektur Fehlbuchung',
};
export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  entwurf: 'Entwurf', bestellt: 'Bestellt', teilweise_eingegangen: 'Teilweise eingegangen',
  abgeschlossen: 'Abgeschlossen', storniert: 'Storniert',
};
