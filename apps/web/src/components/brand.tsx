import Link from 'next/link';

export function Brand({ tagline = false }: { tagline?: boolean }) {
  return (
    <div>
      <Link href="/" className="text-lg font-semibold text-brand-700">
        <span aria-hidden>🛺 </span>Dhaka Tesla Pool
      </Link>
      {tagline && (
        <p className="text-sm text-stone-500">
          Share a seat. Split the fare. Survive Dhaka traffic.
        </p>
      )}
    </div>
  );
}
