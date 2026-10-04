import type { ReactNode } from 'react';
import { isRetryable, messageOf } from '@/lib/api';

// The three states every screen needs besides "here is your data": loading, error and empty.

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex justify-center py-10 text-stone-500">
      <Spinner label={label} />
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 font-medium underline">
          Try again
        </button>
      )}
    </div>
  );
}

/** Data that failed to load: the server's message, with "Try again" only when a retry could help. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <ErrorBanner message={messageOf(error)} onRetry={isRetryable(error) ? onRetry : undefined} />
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-10 text-center">
      <p className="font-medium text-stone-700">{title}</p>
      {children && <div className="mt-1 text-sm text-stone-500">{children}</div>}
    </div>
  );
}
