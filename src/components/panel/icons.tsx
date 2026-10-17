import type { LucideIcon } from 'lucide-react';
import {
  Check,
  Circle,
  CircleDashed,
  CircleHelp,
  CircleSlash,
  CircleX,
  PenLine,
} from 'lucide-react';
import type { FieldStatus } from '@/autofill/report';
import { Icon } from '@/components/ui/icons';

const STATUS_ICON: Record<Exclude<FieldStatus, 'fill'>, LucideIcon> = {
  filled: Check,
  reformatted: Check,
  keep: PenLine,
  kept: PenLine,
  rejected: CircleX,
  detached: CircleSlash,
  'no-value': CircleDashed,
  'no-profile': CircleDashed,
  'no-option': CircleHelp,
  unusable: CircleHelp,
  ambiguous: CircleHelp,
  unrecognised: CircleHelp,
  conflict: CircleHelp,
  duplicate: CircleHelp,
  // An empty ring: not an error, just the applicant's to answer.
  unsupported: Circle,
  manual: Circle,
  'other-person': Circle,
};

const STATUS_COLOR: Record<FieldStatus, string> = {
  fill: 'text-accent',
  filled: 'text-success',
  reformatted: 'text-success',
  keep: 'text-ink-2',
  kept: 'text-ink-2',
  rejected: 'text-danger',
  detached: 'text-danger',
  'no-value': 'text-warning',
  'no-profile': 'text-ink-3',
  'no-option': 'text-warning',
  unusable: 'text-warning',
  ambiguous: 'text-warning',
  unrecognised: 'text-warning',
  conflict: 'text-warning',
  duplicate: 'text-warning',
  unsupported: 'text-ink-3',
  manual: 'text-ink-3',
  'other-person': 'text-ink-3',
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
