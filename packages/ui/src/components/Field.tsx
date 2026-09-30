import type { ReactNode } from "react";

export interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * `<label className="block text-xs font-medium text-slate-600">` followed by an
 * input and, sometimes, an error line was copy-pasted across ~30 form fields
 * (audit design/sécu 2026-09-22). The input itself stays a child — it varies too
 * much (text/select/date/checkbox, react-hook-form `register()` bindings) to own here.
 */
export function Field({ label, htmlFor, error, className, children }: FieldProps): ReactNode {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
