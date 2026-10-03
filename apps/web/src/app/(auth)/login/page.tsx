'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/feedback';
import { Field } from '@/components/ui/field';
import { api, messageOf } from '@/lib/api';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => api.login(email, password),
    // "/" decides where to go: the passenger or the driver home.
    onSuccess: () => router.replace('/'),
  });

  return (
    <>
      <Card>
        <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {login.isError && <ErrorBanner message={messageOf(login.error)} />}
          <Button type="submit" loading={login.isPending} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-4 text-sm text-stone-600">
          New here?{' '}
          <Link href="/register" className="font-medium text-brand-700 underline">
            Create a passenger account
          </Link>
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-stone-700">Try it as the story’s cast</h2>
        <p className="mb-3 text-sm text-stone-500">
          Fills the form for you (password <code>{DEMO_PASSWORD}</code>).
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(DEMO_PASSWORD);
                }}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left hover:border-brand-500 hover:bg-brand-50"
              >
                <span className="block font-medium">{account.name}</span>
                <span className="block text-xs text-stone-500">{account.note}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
