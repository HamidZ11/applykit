import type { ReactNode, RefObject } from 'react';
import { Check, CircleAlert, Info } from 'lucide-react';
import { Icon } from '@/components/ui/icons';

/**
 * The frame and messages shared by the profile page's own sections
 * (diversity preferences, skills and projects, AI assistant).
 */

export function SectionShell({
  heading,
  title,
  intro,
  children,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-8 pb-16 md:px-10 md:pt-[clamp(32px,6vh,56px)]">
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-xl font-medium tracking-[-0.01em] outline-none"
      >
        {title}
      </h1>
      <p className="mt-1 max-w-[56ch] text-ink-2">{intro}</p>
      {children}
    </div>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`mt-6 flex items-start gap-2.5 rounded-md px-3.5 py-3 text-sm ${
        tone === 'danger'
          ? 'bg-danger-soft text-danger'
          : 'bg-warning-soft text-warning'
      }`}
    >
      <Icon
        icon={tone === 'danger' ? CircleAlert : Info}
        size={16}
        className="mt-px shrink-0"
      />
      <p>{children}</p>
    </div>
  );
}

export function Problem({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 flex items-start gap-1.5 text-xs text-danger"
    >
      <Icon icon={CircleAlert} size={13} className="mt-px shrink-0" />
      {children}
    </p>
  );
}

export function Notice({ children }: { children: string }) {
  return (
    <p role="status" className="mt-3 min-h-5 text-xs text-ink-2">
      {children && (
        <span className="flex items-center gap-1.5">
          <Icon icon={Check} size={14} className="text-success" />
          {children}
        </span>
      )}
    </p>
  );
}
