import clsx from 'clsx';
import type { InputHTMLAttributes } from 'react';

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  helperText?: string;
}

export function FormInput({
  label,
  error,
  helperText,
  id,
  className,
  ...props
}: FormInputProps) {
  return (
    <div className="form-field">
      <label htmlFor={id} className="form-label">
        {label}
      </label>

      <input
        id={id}
        className={clsx('input', className)}
        aria-invalid={!!error}
        {...props}
      />

      {error ? (
        <span className="form-error">{error}</span>
      ) : helperText ? (
        <span className="auth-helper-text-left">{helperText}</span>
      ) : null}
    </div>
  );
}