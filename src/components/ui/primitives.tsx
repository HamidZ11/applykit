import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Icon } from '@/components/ui/icons';

/**
 * Small primitives both concepts share. Kept intentionally few: anything
 * concept-specific lives with its concept.
 */

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close ApplyKit"
      className="-mr-1 flex size-7 items-center justify-center rounded-sm text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
    >
      <Icon icon={X} size={16} />
    </button>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function PrimaryButton({ className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center justify-center gap-2 rounded-sm bg-accent px-3 font-medium text-white shadow-control transition-[background-color,transform] duration-100 hover:bg-accent-hover active:scale-[0.98] disabled:bg-line-strong disabled:text-ink-3 disabled:active:scale-100 ${className}`}
      {...props}
    />
  );
}

/**
 * A bounded button for actions that start something: visibly a control
 * before any hover. `sm` fits inside a field's detail in the panel.
 */
export function SecondaryButton({
  className = '',
  size = 'md',
  ...props
}: ButtonProps & { size?: 'md' | 'sm' }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-sm border border-line bg-white font-medium text-ink-2 shadow-control transition-[background-color,border-color,color,transform] duration-100 hover:border-line-strong hover:bg-hover hover:text-ink active:scale-[0.98] active:bg-line motion-reduce:active:scale-100 disabled:border-line disabled:bg-white disabled:text-ink-3 disabled:active:scale-100 ${
        size === 'sm' ? 'h-7 gap-1.5 px-2 text-xs' : 'h-8 gap-1.5 px-2.5'
      } ${className}`}
      {...props}
    />
  );
}

/** A keyboard hint, shown only where the key actually works. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs bg-white/16 px-1 font-sans text-2xs text-current">
      {children}
    </kbd>
  );
}

/** Visually hidden live region announcing outcomes to assistive technology. */
export function Announcer({ message }: { message: string }) {
  return (
    <div role="status" className="sr-only">
      {message}
    </div>
  );
}

/** A quiet text button for secondary actions next to the object they affect. */
export function GhostButton({
  className = '',
  tone = 'neutral',
  ...props
}: ButtonProps & { tone?: 'neutral' | 'danger' }) {
  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors duration-100 disabled:bg-transparent disabled:text-ink-3 ${
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : 'text-ink-2 hover:bg-hover hover:text-ink'
      } ${className}`}
      {...props}
    />
  );
}
