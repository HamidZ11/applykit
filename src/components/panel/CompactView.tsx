import type { ReactNode } from 'react';
import { ChevronRight, CircleDashed, ShieldCheck } from 'lucide-react';
import { FieldRow, fieldKey } from './FieldRow';
import { Icon } from '@/components/ui/icons';
import { StatusGlyph } from './icons';
import type { FieldFilter } from './panel-state';
import type { PanelModel } from './usePanel';
import { openProfile } from './profile-access';
import { PROFILE_FIELD_LABEL, plural } from './vocabulary';

/** Queue rows shown at once in compact mode; the rest is in the full list. */
const QUEUE_WINDOW = 5;

/**
 * Compact mode (the default): what ApplyKit will do, then what is left for
 * you. Details open in the expanded mode, on the matching filter.
 */
export function CompactView({
  model,
  hasProfile,
}: {
  model: PanelModel;
  /** Whether a profile is saved; null while checking. */
  hasProfile: boolean | null;
}) {
  return model.phase === 'ready' ? (
    <ReadyBody model={model} hasProfile={hasProfile} />
  ) : (
    <ResultsBody model={model} />
  );
}

function ReadyBody({
  model,
  hasProfile,
}: {
  model: PanelModel;
  hasProfile: boolean | null;
}) {
  const { reports, summary, queue, expand } = model;
  const willFill = reports.filter((r) => r.status === 'fill').length;
  const willKeep = reports.filter((r) => r.status === 'keep').length;

  return (
    <div className="px-3.5 pt-3 pb-3">
      <PageIdentity model={model} />
      <ul className="-mx-1.5 mt-2.5">
        {willFill > 0 && (
          <PlanLine
            glyph={<StatusGlyph status="fill" />}
            title={`Fill ${plural(willFill, 'field')} from your profile`}
            filter="handled"
            onOpen={expand}
          />
        )}
        {willKeep > 0 && (
          <PlanLine
            glyph={<StatusGlyph status="keep" />}
            title={`Keep ${plural(willKeep, 'entry', 'entries')} you already typed`}
            filter="handled"
            onOpen={expand}
          />
        )}
        {queue.length > 0 && (
          <PlanLine
            glyph={
              <Icon icon={CircleDashed} size={14} className="text-ink-3" />
            }
            title={`Leave ${String(queue.length)} for you`}
            meta={
              summary.requiredNeedsYou > 0
                ? `${String(summary.requiredNeedsYou)} required`
                : undefined
            }
            filter="you"
            onOpen={expand}
          />
        )}
      </ul>
      <MissingNote model={model} />
      <p className="mt-2.5 flex items-center gap-1.5 text-2xs text-ink-3">
        <Icon icon={ShieldCheck} size={12} />
        Never submits, never overwrites what you typed
      </p>
      {hasProfile === false && (
        <p className="mt-1.5 text-2xs text-ink-3">
          No profile saved yet.{' '}
          <button
            type="button"
            onClick={openProfile}
            className="font-medium text-accent hover:text-accent-hover hover:underline"
          >
            Set up your profile
          </button>
        </p>
      )}
    </div>
  );
}

/** One line of the plan; opens the full list on the matching filter. */
function PlanLine({
  glyph,
  title,
  meta,
  filter,
  onOpen,
}: {
  glyph: ReactNode;
  title: string;
  meta?: string | undefined;
  filter: FieldFilter;
  onOpen: (filter: FieldFilter) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onOpen(filter);
        }}
        className="group flex h-8 w-full items-center gap-2.5 rounded-sm px-1.5 text-left transition-colors duration-100 hover:bg-hover"
      >
        {glyph}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {meta && (
          <span className="font-mono text-2xs text-ink-3 tabular-nums">
            {meta}
          </span>
        )}
        <Icon
          icon={ChevronRight}
          size={14}
          className="shrink-0 text-ink-3 transition-colors group-hover:text-ink-2"
        />
      </button>
    </li>
  );
}

function ResultsBody({ model }: { model: PanelModel }) {
  const { summary, queue, selected, expand, toggleSelect } = model;
  const done = summary.filled + summary.kept;

  // A window over the queue that always contains the current field.
  const current = queue.findIndex((r) => r.field.element === selected);
  const start = Math.max(0, Math.min(current - 2, queue.length - QUEUE_WINDOW));
  const visible = queue.slice(start, start + QUEUE_WINDOW);

  return (
    <div className="pt-3 pb-2">
      <div className="px-3.5">
        <p className="flex items-center gap-2 text-base font-medium tracking-[-0.01em]">
          <StatusGlyph status="filled" />
          {summary.filled > 0
            ? `Filled ${plural(summary.filled, 'field')}`
            : 'No fields filled'}
        </p>
        <p className="mt-0.5 pl-[22px] text-xs text-ink-2">
          {[
            summary.kept > 0 &&
              `Kept ${plural(summary.kept, 'entry', 'entries')} you typed`,
            summary.needsYou > 0
              ? `${String(summary.needsYou)} left for you`
              : 'Nothing left for you',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {queue.length > 0 && (
        <section aria-label="Needs you" className="mt-3">
          <div className="flex h-6 items-center px-3.5 text-xs">
            <span className="font-medium text-ink-2">Needs you</span>
            <span className="flex-1" />
            {summary.requiredNeedsYou > 0 && (
              <span className="font-mono text-2xs text-ink-3 tabular-nums">
                {summary.requiredNeedsYou} required
              </span>
            )}
          </div>
          <ul className="px-1.5">
            {visible.map((report) => (
              <FieldRow
                key={fieldKey(report.field.element)}
                report={report}
                selected={report.field.element === selected}
                detailed={false}
                onSelect={() => {
                  toggleSelect(report.field.element);
                }}
              />
            ))}
          </ul>
          {queue.length > QUEUE_WINDOW && (
            <button
              type="button"
              onClick={() => {
                expand('you');
              }}
              className="mx-1.5 flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink-2"
            >
              View all {queue.length} in the full list
              <Icon icon={ChevronRight} size={14} />
            </button>
          )}
        </section>
      )}

      {done > 0 && (
        <ul className="mx-2 mt-2 border-t border-line pt-1.5">
          <PlanLine
            glyph={<StatusGlyph status="filled" />}
            title={`Done · ${String(done)}`}
            filter="handled"
            onOpen={expand}
          />
        </ul>
      )}
      <div className="px-3.5">
        <MissingNote model={model} />
      </div>
    </div>
  );
}

export function PageIdentity({ model }: { model: PanelModel }) {
  const { page, summary } = model;
  return (
    <div className="min-w-0">
      <p className="truncate text-base font-medium tracking-[-0.01em]">
        {page.heading}
      </p>
      <p className="truncate text-xs text-ink-3">
        {page.subheading ? `${page.subheading} · ` : ''}
        {plural(summary.total, 'field')} on this form
      </p>
    </div>
  );
}

function MissingNote({ model }: { model: PanelModel }) {
  if (model.missing.length === 0 || model.summary.total === 0) return null;
  return (
    <p className="mt-2 text-xs text-ink-3">
      Not asked on this form:{' '}
      {model.missing.map((field) => PROFILE_FIELD_LABEL[field]).join(', ')}
    </p>
  );
}
