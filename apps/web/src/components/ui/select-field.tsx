'use client';

import { type SelectHTMLAttributes, useId } from 'react';

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string };

/** A labelled dropdown, styled like Field. */
export function SelectField({ label, children, className = '', ...select }: SelectFieldProps) {
  const id = useId();
  return (
    <div className={`space-y-1 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-stone-700">
        {label}
      </label>
      <select
        {...select}
        id={id}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
      >
        {children}
      </select>
    </div>
  );
}
