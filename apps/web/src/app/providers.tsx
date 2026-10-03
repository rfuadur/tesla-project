'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { ApiError } from '@/lib/api';

// TanStack Query keeps server data (rides, pools) cached in the browser, tracks loading and error
// states, and re-fetches it when asked (polling, or after a change).
export function Providers({ children }: { children: ReactNode }) {
  // One client per browser tab: created once, kept across re-renders.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2_000,
            // Retry network/server hiccups once, but never "you can't do that" answers (4xx).
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
              failureCount < 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
