'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from './ui/button';

export function SignOutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear(); // forget the previous user's cached data
      router.replace('/login');
    },
  });

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={logout.isPending}
      onClick={() => logout.mutate()}
    >
      Sign out
    </Button>
  );
}
