'use client';

import { type InputHTMLAttributes, useId } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** A message from the server about this field, shown under it. */
  error?: string;
  hint?: string;
};

/** A labelled input. The label and error message are linked to the input for screen readers. */
export function Field({ label, error, hint, className = '', ...input }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <input
        {...input}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none aria-invalid:border-red-600"
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-stone-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
