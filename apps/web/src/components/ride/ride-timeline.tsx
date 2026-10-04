import { dhakaTime, taka } from '@/lib/format';
import type { RideDetail, TimelineEvent } from '@/lib/types';

// The ride's history from the API, in plain words: "enough history to explain exactly what happened".

const REFUSED_BECAUSE: Record<string, string> = {
  NOT_ENOUGH_SEATS: 'it filled up just before you',
  DROPOFF_TOO_FAR: 'its riders are heading too far from your drop-off',
  POOL_NOT_JOINABLE: 'it had already left',
  DIFFERENT_PICKUP: 'it is at a different pickup',
};

function describe(event: TimelineEvent, ride: RideDetail, zoneName: (code: string) => string) {
  const tesla = ride.pool?.vehicleName ?? 'your Tesla';
  const details = event.details;

  switch (event.type) {
    case 'RIDE_REQUESTED':
      return 'You booked this ride';
    case 'RIDE_MATCHED':
      return event.by === 'SYSTEM'
        ? `Matched instantly with ${tesla}, already waiting at ${zoneName(ride.pickupZone)}`
        : `${ride.pool?.driverName ?? 'A driver'} accepted your ride with ${tesla}`;
    case 'SEAT_CLAIM_REJECTED':
      return `A Tesla nearby couldn't take you: ${REFUSED_BECAUSE[String(details.reason)] ?? 'it was not a match'}`;
    case 'DRIVER_ARRIVED':
      return `${tesla} arrived at ${zoneName(ride.pickupZone)}`;
    case 'TRIP_STARTED':
      return details.shared
        ? `Trip started, shared: ${taka(Number(details.discountPaisa))} off your fare`
        : 'Trip started';
    case 'DROPPED_OFF':
      return `Dropped off at ${zoneName(ride.dropoffZone)}, paid ${taka(Number(details.paidPaisa))} in cash`;
    case 'RIDE_CANCELLED':
      return details.reason ? `You cancelled: "${String(details.reason)}"` : 'You cancelled';
    default:
      return event.type;
  }
}

export function RideTimeline({
  ride,
  zoneName,
}: {
  ride: RideDetail;
  zoneName: (code: string) => string;
}) {
  return (
    <ol className="space-y-2">
      {ride.timeline.map((event, index) => (
        <li key={index} className="flex gap-3 text-sm">
          <time dateTime={event.at} className="w-12 shrink-0 text-stone-500 tabular-nums">
            {dhakaTime(event.at)}
          </time>
          <span>{describe(event, ride, zoneName)}</span>
        </li>
      ))}
    </ol>
  );
}
