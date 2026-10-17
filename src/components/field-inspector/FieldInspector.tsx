import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { RotateCw, ShieldCheck } from 'lucide-react';
import { needsYou, type FieldReport } from '@/autofill/report';
import { BrandMark, Icon, StatusGlyph } from '@/components/shared/icons';
import { Locator } from '@/components/shared/Locator';
import {
  Announcer,
  CloseButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/shared/primitives';
import {
  plural,
  useAutofillSession,
  type AutofillSession,
} from '@/components/shared/useAutofillSession';
import {
  KIND_LABEL,
  PROFILE_FIELD_LABEL,
  STATUS_LABEL,
  detectionDetail,
  explain,
  locateTarget,
} from '@/components/shared/vocabulary';

type Filter = 'all' | 'handled' | 'you';

/**
 * Concept B: Field Inspector.
 *
 * Inspection-first. Every field on the form is listed up front, grouped by
 * the form's own sections, with what ApplyKit will do to it. After autofill
 * the same list becomes the execution report. Selecting a row explains it
 * and points at the field on the page.
 */
export function FieldInspector({ onClose }: { onClose: () => void }) {
  const session = useAutofillSession();
  const panel = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<FieldReport | null>(null);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  const visible = useMemo(
    () => session.reports.filter((report) => matches(report, filter)),
    [session.reports, filter],
  );
  // Reports are rebuilt after autofill; keep the selection on the same field.
  const selectedReport =
    visible.find((report) => report.field === selected?.field) ?? null;

  const runAutofill = () => {
    session.autofill();
  };
  const reviewRequired = () => {
    setFilter('you');
    setSelected(session.queue[0] ?? null);
  };
  const rescan = () => {
    session.rescan();
    setSelected(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (selectedReport) setSelected(null);
      else onClose();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = selectedReport ? visible.indexOf(selectedReport) : -1;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.min(Math.max(index + step, 0), visible.length - 1);
    setSelected(visible[nextIndex] ?? null);
  };

  const handledLabel = session.phase === 'ready' ? 'Fillable' : 'Done';

  return (
    <>
      {selectedReport && (
        <Locator target={locateTarget(selectedReport.field)} mode="hold" />
      )}
      <div
        ref={panel}
        role="dialog"
        aria-label="ApplyKit"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ '--ak-enter-from': '8px 0' } as CSSProperties}
        className="ak-panel fixed top-4 right-4 flex max-h-[calc(100vh-32px)] w-[380px] flex-col overflow-hidden rounded-lg bg-canvas shadow-panel outline-none"
      >
        <header className="shrink-0 px-3.5 pt-2.5 pb-3">
          <div className="flex h-7 items-center gap-2 pr-0">
            <BrandMark />
            <span className="font-medium">ApplyKit</span>
            <span className="flex-1" />
            <span className="-mr-1.5">
              <CloseButton onClose={onClose} />
            </span>
          </div>
          <p className="mt-2 truncate text-base font-medium tracking-[-0.01em]">
            {session.page.heading}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
            <span className="truncate font-mono text-2xs">
              {session.page.host}
            </span>
            <span aria-hidden>·</span>
            <span className="shrink-0">
              {session.summary.total > 0
                ? `${plural(session.summary.total, 'field')} detected`
                : 'No form detected'}
            </span>
          </p>
        </header>

        {session.summary.total > 0 && (
          <FilterTabs
            filter={filter}
            onChange={(next) => {
              setFilter(next);
              setSelected(null);
            }}
            counts={{
              all: session.summary.total,
              handled: session.summary.filled + session.summary.kept,
              you: session.summary.needsYou,
            }}
            handledLabel={handledLabel}
          />
        )}

        <div
          role="region"
          aria-label="Fields on this form"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pb-1"
        >
          {session.summary.total === 0 ? (
            <p className="px-3.5 py-4 text-xs text-ink-2">
              ApplyKit found no fields to complete. If the form appears later,
              close and reopen ApplyKit.
            </p>
          ) : (
            <FieldList
              reports={visible}
              phase={session.phase}
              selected={selectedReport}
              onSelect={(report) => {
                setSelected(report === selectedReport ? null : report);
              }}
            />
          )}
        </div>

        <Footer
          session={session}
          onAutofill={runAutofill}
          onReview={reviewRequired}
          onRescan={rescan}
        />
        <Announcer message={session.announcement} />
      </div>
    </>
  );
}

function FilterTabs({
  filter,
  onChange,
  counts,
  handledLabel,
}: {
  filter: Filter;
  onChange: (filter: Filter) => void;
  counts: Record<Filter, number>;
  handledLabel: string;
}) {
  const tabs: [Filter, string][] = [
    ['all', 'All'],
    ['handled', handledLabel],
    ['you', 'Needs you'],
  ];
  return (
    <div
      role="tablist"
      aria-label="Filter fields"
      className="mx-3 mb-2.5 grid shrink-0 grid-cols-3 rounded-sm bg-sunken p-0.5"
    >
      {tabs.map(([value, label]) => {
        const active = filter === value;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onChange(value);
            }}
            className={`flex h-6 items-center justify-center gap-1.5 rounded-xs text-xs transition-colors duration-100 ${
              active
                ? 'bg-white font-medium text-ink shadow-[0_0_0_1px_var(--color-line),var(--shadow-control)]'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {label}
            <span className="font-mono text-2xs text-ink-3 tabular-nums">
              {counts[value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FieldList({
  reports,
  phase,
  selected,
  onSelect,
}: {
  reports: FieldReport[];
  phase: AutofillSession['phase'];
  selected: FieldReport | null;
  onSelect: (report: FieldReport) => void;
}) {
  if (reports.length === 0) {
    return (
      <p className="px-3.5 py-4 text-xs text-ink-2">No fields in this view.</p>
    );
  }

  const sections = groupBySection(reports);
  return (
    <>
      {sections.map(([section, items]) => (
        <section key={section} aria-label={section}>
          <div className="sticky top-0 z-10 flex h-7 items-center bg-canvas/95 px-3.5 text-2xs font-medium tracking-[0.01em] text-ink-3 backdrop-blur-[2px]">
            <span className="truncate">{section}</span>
            <span className="flex-1" />
            <span className="font-mono tabular-nums">{items.length}</span>
          </div>
          <ul className="px-1.5">
            {items.map((report) => (
              <FieldRow
                key={report.field.element.id || report.field.label}
                report={report}
                changed={phase === 'done' && report.status === 'filled'}
                selected={report === selected}
                onSelect={() => {
                  onSelect(report);
                }}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function FieldRow({
  report,
  changed,
  selected,
  onSelect,
}: {
  report: FieldReport;
  changed: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { field, status, value } = report;
  const hasValue = value !== null;
  const detail = detectionDetail(field);
  const row = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (selected) row.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <li
      ref={row}
      className={`rounded-sm transition-colors duration-100 ${
        selected ? 'bg-accent-soft' : ''
      } ${changed ? 'animate-[ak-changed_900ms_var(--ease-out)]' : ''}`}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-expanded={selected}
        onClick={onSelect}
        className={`grid h-8 w-full grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-sm px-2 text-left ${
          selected ? '' : 'hover:bg-hover'
        }`}
      >
        <StatusGlyph status={status} />
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate">{field.label}</span>
          {field.required && (
            <span aria-label="required" className="text-danger/80">
              *
            </span>
          )}
        </span>
        <span
          className={`max-w-[150px] truncate text-xs ${
            hasValue ? 'text-ink-2' : 'text-ink-3'
          }`}
        >
          {hasValue
            ? value
            : status === 'unsupported'
              ? KIND_LABEL[field.kind]
              : STATUS_LABEL[status]}
        </span>
      </button>
      {selected && (
        <div className="animate-[ak-fade-in_140ms_var(--ease-out)] pr-2 pb-2.5 pl-[32px] text-xs">
          <p className="text-ink-2">{explain(report)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 font-mono text-2xs text-ink-3">
            <span>{STATUS_LABEL[status]}</span>
            <span aria-hidden>·</span>
            <span>{KIND_LABEL[field.kind].toLowerCase()}</span>
            {detail && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{detail}</span>
              </>
            )}
            {field.required && (
              <>
                <span aria-hidden>·</span>
                <span>required</span>
              </>
            )}
          </p>
        </div>
      )}
    </li>
  );
}

function Footer({
  session,
  onAutofill,
  onReview,
  onRescan,
}: {
  session: AutofillSession;
  onAutofill: () => void;
  onReview: () => void;
  onRescan: () => void;
}) {
  const { summary, phase, missing } = session;
  if (summary.total === 0) return null;

  const counts =
    phase === 'ready'
      ? [
          ['to fill', summary.filled],
          ['to keep', summary.kept],
          ['left for you', summary.needsYou],
        ]
      : [
          ['filled', summary.filled],
          ['kept', summary.kept],
          ['need you', summary.needsYou],
        ];

  return (
    <footer className="shrink-0 border-t border-line bg-sunken/60 px-3 pt-2 pb-3">
      <p className="flex h-6 items-center gap-1.5 px-0.5 text-xs text-ink-2">
        {counts
          .filter(([, count]) => count !== 0 || phase === 'done')
          .map(([label, count], index) => (
            <span key={label} className="flex items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden className="text-ink-3">
                  ·
                </span>
              )}
              <span className="font-mono text-2xs text-ink tabular-nums">
                {count}
              </span>
              {label}
            </span>
          ))}
      </p>
      {missing.length > 0 && (
        <p className="px-0.5 text-xs text-ink-3">
          Not asked on this form:{' '}
          {missing.map((field) => PROFILE_FIELD_LABEL[field]).join(', ')}
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-2">
        {phase === 'ready' ? (
          <PrimaryButton
            onClick={onAutofill}
            disabled={summary.filled === 0}
            className="flex-1"
          >
            {summary.filled === 0
              ? 'Nothing to fill'
              : `Autofill ${plural(summary.filled, 'field')}`}
          </PrimaryButton>
        ) : (
          <>
            <SecondaryButton onClick={onRescan}>
              <Icon icon={RotateCw} size={14} />
              Rescan
            </SecondaryButton>
            <PrimaryButton
              onClick={onReview}
              disabled={summary.needsYou === 0}
              className="flex-1"
            >
              {summary.requiredNeedsYou > 0
                ? `Review ${String(summary.requiredNeedsYou)} required`
                : summary.needsYou > 0
                  ? `Review ${String(summary.needsYou)} remaining`
                  : 'All fields handled'}
            </PrimaryButton>
          </>
        )}
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-2xs text-ink-3">
        <Icon icon={ShieldCheck} size={12} />
        Never submits, never overwrites what you typed
      </p>
    </footer>
  );
}

function matches(report: FieldReport, filter: Filter): boolean {
  if (filter === 'all') return true;
  return filter === 'you' ? needsYou(report) : !needsYou(report);
}

function groupBySection(reports: FieldReport[]): [string, FieldReport[]][] {
  const groups = new Map<string, FieldReport[]>();
  for (const report of reports) {
    const section = report.field.section ?? 'Other fields';
    const group = groups.get(section);
    if (group) group.push(report);
    else groups.set(section, [report]);
  }
  return [...groups];
}
