'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/feedback';
import { Field } from '@/components/ui/field';
import { api, fieldErrors, messageOf } from '@/lib/api';

// Passenger sign-up. Drivers are onboarded by operations, so there is no driver sign-up (assumption A14).
export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });

  const register = useMutation({
    mutationFn: () => api.register({ ...form, phone: form.phone.trim() || undefined }),
    onSuccess: () => router.replace('/passenger'),
  });

  const errors = fieldErrors(register.error);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Card>
      <h1 className="mb-4 text-xl font-semibold">Create a passenger account</h1>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          register.mutate();
        }}
      >
        <Field
          label="Full name"
          autoComplete="name"
          required
          value={form.fullName}
          onChange={set('fullName')}
          error={errors.fullName}
        />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
          error={errors.email}
        />
        <Field
          label="Mobile number (optional)"
          type="tel"
          autoComplete="tel"
          placeholder="01712345678"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={form.password}
          onChange={set('password')}
          error={errors.password}
        />
        {register.isError && Object.keys(errors).length === 0 && (
          <ErrorBanner message={messageOf(register.error)} />
        )}
        <Button type="submit" loading={register.isPending} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-4 text-sm text-stone-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-700 underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
