import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Labelled form row (pl-field). Errors explain the fix and are announced. */
export function FormField({ label, hint, error, children }: FormFieldProps) {
  return (
    <label className="pl-field sf-field" data-invalid={error ? true : undefined}>
      <span className="sf-field__label">{label}</span>
      {children}
      {hint ? <span className="sf-hint">{hint}</span> : null}
      {error ? (
        <span className="sf-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
