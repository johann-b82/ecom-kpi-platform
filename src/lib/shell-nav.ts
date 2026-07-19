import { APPS, type AppDef, type AppKey } from './apps';

export function activeApp(pathname: string): AppDef | null {
  return APPS.find((a) => pathname === a.href || pathname.startsWith(a.href + '/')) ?? null;
}

export function selectTabApps(
  apps: AppDef[],
  activeKey: AppKey | null,
): { tabs: AppDef[]; showMore: boolean } {
  if (apps.length <= 4) return { tabs: apps, showMore: false };
  let tabs = apps.slice(0, 4);
  if (activeKey && !tabs.some((a) => a.key === activeKey)) {
    const active = apps.find((a) => a.key === activeKey);
    if (active) tabs = [...apps.slice(0, 3), active];
  }
  return { tabs, showMore: true };
}
