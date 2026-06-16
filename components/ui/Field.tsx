import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const controlBase =
  "w-full min-h-[44px] border-[3px] border-[var(--color-line)] bg-surface text-fg " +
  "px-4 py-3 text-base placeholder:text-fg-soft/70 focus:outline-none " +
  "focus-visible:outline-3 focus-visible:outline-[var(--color-blue)] focus-visible:outline-offset-2 " +
  "aria-[invalid=true]:border-pink aria-[invalid=true]:bg-pink/10";

/**
 * Shared label/hint/error scaffold for a form control.
 * Wires aria-describedby to the hint and error ids and exposes them so the
 * control can reference them. Errors are announced via role="alert".
 */
function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: (ids: { describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-display font-bold text-fg">
        {label}
        {required ? (
          <span className="text-pink"> *</span>
        ) : (
          <span className="text-fg-soft font-normal"> (optional)</span>
        )}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-fg-soft">
          {hint}
        </p>
      ) : null}
      {children({ describedBy, invalid: Boolean(error) })}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm font-bold text-pink flex items-center gap-1.5"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

type BaseProps = {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
};

export function TextField({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  type = "text",
  autoComplete,
  placeholder,
  defaultValue,
}: BaseProps & {
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={error}
    >
      {({ describedBy, invalid }) => (
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(controlBase, className)}
        />
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  name,
  label,
  required,
  hint,
  error,
  className,
  rows = 5,
  placeholder,
  defaultValue,
}: BaseProps & {
  rows?: number;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={error}
    >
      {({ describedBy, invalid }) => (
        <textarea
          id={id}
          name={name}
          rows={rows}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(controlBase, "resize-y", className)}
        />
      )}
    </FieldShell>
  );
}
