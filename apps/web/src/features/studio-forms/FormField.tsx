import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function FormField({ label, hint, error, children }: FormFieldProps) {
  return (
    <label className="studio-form-field">
      <span className="studio-form-field__label">{label}</span>
      {children}
      {hint ? <span className="studio-form-field__hint">{hint}</span> : null}
      {error ? (
        <span className="studio-form-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}