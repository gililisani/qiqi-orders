'use client';

import * as React from 'react';
import { cn } from '../../../lib/utils';
import { Label } from './label';

/**
 * FormField — the canonical "label + input + helper + error" wrapper.
 *
 *   <FormField label="Email" helper="We'll never spam you." error={errors.email}>
 *     <Input type="email" />
 *   </FormField>
 *
 * Passes the right id/aria attributes so the label binds to the control and
 * the error becomes aria-describedby. Marked-required puts an asterisk by the
 * label.
 */

interface FormFieldProps {
  label?: React.ReactNode;
  helper?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Pass-through id; auto-generated if omitted. */
  htmlFor?: string;
  className?: string;
  children: React.ReactElement;
}

let counter = 0;
function useId(seed?: string) {
  const ref = React.useRef<string>(seed || '');
  if (!ref.current) ref.current = `ff-${++counter}`;
  return ref.current;
}

export function FormField({
  label,
  helper,
  error,
  required,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  const id = useId(htmlFor);
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helper ? `${id}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  const child = React.cloneElement(children, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    ...children.props,
  });

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
      )}
      {child}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
