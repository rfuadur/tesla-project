/** Bullet's seats at a glance: one box per seat, filled when taken (e.g. ■ ■ □  2/3). */
export function SeatMeter({ taken, capacity }: { taken: number; capacity: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${taken} of ${capacity} seats taken`}>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: capacity }, (_, seat) => (
          <span
            key={seat}
            className={`size-5 rounded ${seat < taken ? 'bg-brand-600' : 'border-2 border-stone-300'}`}
          />
        ))}
      </div>
      <span className="text-sm text-stone-600 tabular-nums">
        {taken}/{capacity} seats
      </span>
    </div>
  );
}
