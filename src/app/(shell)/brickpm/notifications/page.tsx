import { listNotifications } from '@/brickpm/repository';
import { BpmNotifications } from '@/components/BpmNotifications';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const items = await listNotifications();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Notifications</h2>
      <BpmNotifications items={items} />
    </div>
  );
}
