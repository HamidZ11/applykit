import type { LucideIcon, LucideProps } from 'lucide-react';
import { Check, Circle, CircleDashed, CircleHelp, PenLine } from 'lucide-react';
import type { FieldStatus } from '@/autofill/report';

/**
 * Renders a Lucide icon with the panel's fixed optical rules: 1.5px strokes
 * at any size, so 14px and 16px icons share one visual weight.
 */
export function Icon({
  icon: Glyph,
  size = 16,
  ...props
}: { icon: LucideIcon; size?: number } & Omit<LucideProps, 'ref'>) {
  return (
    <Glyph
      aria-hidden
      size={size}
      strokeWidth={1.5}
      nonScalingStroke
      {...props}
    />
  );
}

const STATUS_ICON: Record<Exclude<FieldStatus, 'fill'>, LucideIcon> = {
  filled: Check,
  keep: PenLine,
  kept: PenLine,
  'no-value': CircleDashed,
  unrecognised: CircleHelp,
  // An empty ring: not an error, just not done yet.
  unsupported: Circle,
};

const STATUS_COLOR: Record<FieldStatus, string> = {
  fill: 'text-accent',
  filled: 'text-success',
  keep: 'text-ink-2',
  kept: 'text-ink-2',
  'no-value': 'text-warning',
  unrecognised: 'text-warning',
  unsupported: 'text-ink-3',
};

/** A 14px glyph that pairs with, and never replaces, a status label. */
export function StatusGlyph({ status }: { status: FieldStatus }) {
  if (status === 'fill') {
    // "Will fill" is a promise, not an outcome: a quiet filled dot.
    return (
      <span
        aria-hidden
        className="flex size-3.5 shrink-0 items-center justify-center"
      >
        <span className="size-1.5 rounded-full bg-accent" />
      </span>
    );
  }
  return (
    <Icon
      icon={STATUS_ICON[status]}
      size={14}
      className={`shrink-0 ${STATUS_COLOR[status]}`}
    />
  );
}

/** ApplyKit's provisional mark: a form row being completed. */
export function BrandMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <rect width="18" height="18" rx="5" className="fill-accent" />
      <path
        d="M5 6.5h8M5 11.5h3.25"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m10.25 11.4 1.4 1.35 2.35-2.6"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
