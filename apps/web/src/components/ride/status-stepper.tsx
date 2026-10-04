import type { RideStatus } from '@/lib/types';

// The passenger's view of the ride lifecycle (docs/domain.md §1), in plain words.
const STEPS: { status: RideStatus; label: string }[] = [
  { status: 'REQUESTED', label: 'Requested' },
  { status: 'MATCHED', label: 'Matched' },
  { status: 'DRIVER_ARRIVED', label: 'Tesla arrived' },
  { status: 'STARTED', label: 'On the way' },
  { status: 'COMPLETED', label: 'Arrived' },
];

export function StatusStepper({ status }: { status: RideStatus }) {
  if (status === 'CANCELLED') {
    return <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm">This ride was cancelled.</p>;
  }

  const current = STEPS.findIndex((step) => step.status === status);
  return (
    <ol className="grid grid-cols-5 gap-2 text-center text-xs">
      {STEPS.map((step, index) => (
        <li
          key={step.status}
          aria-current={index === current ? 'step' : undefined}
          className={index <= current ? 'font-medium text-brand-700' : 'text-stone-400'}
        >
          <span
            aria-hidden
            className={`mb-1 block h-1.5 rounded-full ${index <= current ? 'bg-brand-600' : 'bg-stone-200'}`}
          />
          {step.label}
        </li>
      ))}
    </ol>
  );
}
