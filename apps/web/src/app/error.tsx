'use client';

import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';

// Shown when a page fails to render, e.g. the API is unreachable while checking your session.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <Brand />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-stone-600">
        We could not load this page. If it keeps happening, the service may be starting up: wait a
        moment and try again.
      </p>
      <Button onClick={reset} className="self-start">
        Try again
      </Button>
    </main>
  );
}
