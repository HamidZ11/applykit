import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CircleAlert } from 'lucide-react';
import { Icon } from '@/components/ui/icons';

/**
 * Form controls for the profile screens. Labels sit above controls; optional
 * fields say so in the label, required ones are unmarked. Errors appear under
 * the control and are linked to it for assistive technology.
 */

export const CONTROL =
  'block w-full rounded-sm border bg-white text-base text-ink shadow-control outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-ink-3 disabled:bg-sunken disabled:text-ink-3';
export const CONTROL_STATE = (invalid: boolean) =>
  invalid
    ? 'border-danger focus:shadow-[0_0_0_3px_var(--color-danger-soft)]'
    : 'border-line-strong hover:border-ink-3/60 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]';

interface FieldProps {
  label: string;
  optional?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  /** Layout: span both columns of a FieldGrid. */
  wide?: boolean | undefined;
  children: (control: {
    id: string;
    invalid: boolean;
    describedBy: string | undefined;
  }) => ReactNode;
}

export function Field({
  label,
  optional = false,
  hint,
  error,
  wide = false,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label
        htmlFor={id}
        className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-ink-2"
      >
        {label}
        {optional && <span className="font-normal text-ink-3">Optional</span>}
      </label>
      {children({ id, invalid: Boolean(error), describedBy })}
      {hint && !error && (
        <p id={hintId ?? undefined} className="mt-1.5 text-xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId ?? undefined}
          className="mt-1.5 flex items-start gap-1.5 text-xs text-danger"
        >
          <Icon icon={CircleAlert} size={13} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'children'
> &
  Omit<FieldProps, 'children'> & {
    value: string;
    onValueChange: (value: string) => void;
  };

export function TextField({
  label,
  optional,
  hint,
  error,
  wide,
  value,
  onValueChange,
  className = '',
  ...input
}: TextFieldProps) {
  return (
    <Field {...{ label, optional, hint, error, wide }}>
      {({ id, invalid, describedBy }) => (
        <input
          id={id}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} ${CONTROL_STATE(invalid)} h-9 px-3 ${className}`}
          {...input}
        />
      )}
    </Field>
  );
}

type TextAreaFieldProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value' | 'children'
> &
  Omit<FieldProps, 'children'> & {
    value: string;
    onValueChange: (value: string) => void;
  };

export function TextAreaField({
  label,
  optional,
  hint,
  error,
  wide,
  value,
  onValueChange,
  ...textarea
}: TextAreaFieldProps) {
  return (
    <Field {...{ label, optional, hint, error, wide }}>
      {({ id, invalid, describedBy }) => (
        <textarea
          id={id}
          value={value}
          rows={4}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} ${CONTROL_STATE(invalid)} resize-y px-3 py-2 leading-[22px]`}
          {...textarea}
        />
      )}
    </Field>
  );
}

type SelectFieldProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value' | 'children'
> &
  Omit<FieldProps, 'children'> & {
    value: string;
    options: readonly { value: string; label: string }[];
    onValueChange: (value: string) => void;
  };

export function SelectField({
  label,
  optional,
  hint,
  error,
  wide,
  value,
  options,
  onValueChange,
  ...select
}: SelectFieldProps) {
  return (
    <Field {...{ label, optional, hint, error, wide }}>
      {({ id, invalid, describedBy }) => (
        <select
          id={id}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${CONTROL} ${CONTROL_STATE(invalid)} h-9 px-2.5`}
          {...select}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-9 cursor-default items-center gap-2.5 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onCheckedChange(event.target.checked);
        }}
        className="size-4 rounded-xs accent-accent"
      />
      {label}
    </label>
  );
}

/** Two columns from small screens up; one column below. */
export function FieldGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
      {children}
    </div>
  );
}

/** A titled group of fields, separated from the previous group by a rule. */
export function FieldSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-base font-medium">{title}</h2>
      {description && (
        <p className="mt-0.5 text-xs text-ink-3">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}
