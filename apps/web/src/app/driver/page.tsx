import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { requireUser } from '@/lib/session';

export default async function DriverHome() {
  const { vehicle } = await requireUser('DRIVER');

  return (
    <>
      {vehicle && (
        <Card>
          <h1 className="text-2xl font-semibold">{vehicle.name}</h1>
          <p className="text-stone-600">
            {vehicle.capacity} seats · {vehicle.isOnline ? 'online' : 'offline'}
            {vehicle.currentZone && ` · ${vehicle.currentZone}`}
          </p>
        </Card>
      )}
      <EmptyState title="Going online and accepting rides is coming next." />
    </>
  );
}
