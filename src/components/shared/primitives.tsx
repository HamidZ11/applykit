import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Icon } from './icons';

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

export function SecondaryButton({ className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-line bg-white px-2.5 font-medium text-ink-2 shadow-control transition-[background-color,color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.98] ${className}`}
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
