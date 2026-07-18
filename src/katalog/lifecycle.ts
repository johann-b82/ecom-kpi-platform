export type LifecycleStatus = 'konzept' | 'freigegeben' | 'aktiv' | 'auslaufend' | 'eingestellt';

export interface LifecycleFlags {
  verkaufbar: boolean;
  bestellbar: boolean;
  shopSichtbar: boolean;
}

const TABLE: Record<LifecycleStatus, LifecycleFlags> = {
  konzept:     { verkaufbar: false, bestellbar: false, shopSichtbar: false },
  freigegeben: { verkaufbar: false, bestellbar: true,  shopSichtbar: false },
  aktiv:       { verkaufbar: true,  bestellbar: true,  shopSichtbar: true  },
  auslaufend:  { verkaufbar: true,  bestellbar: false, shopSichtbar: true  },
  eingestellt: { verkaufbar: false, bestellbar: false, shopSichtbar: false },
};

export const LIFECYCLE_STATUSES = Object.keys(TABLE) as LifecycleStatus[];

/** Maps a product lifecycle status to what it enables (Weiche). */
export function lifecycle(status: LifecycleStatus): LifecycleFlags {
  return TABLE[status];
}
