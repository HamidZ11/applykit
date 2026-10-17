import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  CircleDashed,
  CornerDownLeft,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import type { FieldReport } from '@/autofill/report';
import { BrandMark, Icon, StatusGlyph } from '@/components/shared/icons';
import { Locator } from '@/components/shared/Locator';
import {
  Announcer,
  CloseButton,
  Kbd,
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
  locateTarget,
} from '@/components/shared/vocabulary';

/** Rows shown in the attention queue before "Show more". */
const QUEUE_PREVIEW = 5;

/**
 * Concept A: Command Dock.
 *
 * Action-first. A small dock that states what will happen in three lines,
 * offers one action, then turns into a prioritised queue of what is left,
 * stepped through with ↵. Details are disclosed only on request.
 */
export function CommandDock({ onClose }: { onClose: () => void }) {
  const session = useAutofillSession();
  const panel = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  const current = cursor === null ? null : (session.queue[cursor] ?? null);

  const goTo = (index: number) => {
    setCursor(index);
    setPulse((n) => n + 1);
  };
  const next = () => {
    if (session.queue.length === 0) return;
    goTo(cursor === null ? 0 : (cursor + 1) % session.queue.length);
  };
  const runAutofill = () => {
    session.autofill();
    setCursor(null);
  };
  const rescan = () => {
    session.rescan();
    setCursor(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    } else if (
      event.key === 'Enter' &&
      !(event.target instanceof HTMLButtonElement)
    ) {
      event.preventDefault();
      if (session.phase === 'ready') {
        if (session.summary.filled > 0) runAutofill();
      } else {
        next();
      }
    }
  };

  return (
    <>
      {current && (
        <Locator
          key={pulse}
          target={locateTarget(current.field)}
          mode="pulse"
        />
      )}
      <div
        ref={panel}
        role="dialog"
        aria-label="ApplyKit"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="ak-panel fixed right-4 bottom-4 flex max-h-[calc(100vh-32px)] w-[368px] flex-col overflow-hidden rounded-lg bg-canvas shadow-panel outline-none"
      >
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3.5">
          <BrandMark />
          <span className="font-medium">ApplyKit</span>
          <span className="min-w-0 truncate font-mono text-2xs text-ink-3">
            {session.page.host}
          </span>
          <span className="flex-1" />
          <CloseButton onClose={onClose} />
        </header>

        <div
          key={session.phase}
          className="min-h-0 flex-1 animate-[ak-fade-in_160ms_var(--ease-out)] overflow-y-auto overscroll-contain"
        >
          {session.summary.total === 0 ? (
            <NoForm />
          ) : session.phase === 'ready' ? (
            <ReadyBody session={session} />
          ) : (
            <ResultsBody
              session={session}
              current={current}
              onSelect={(report) => {
                goTo(session.queue.indexOf(report));
              }}
            />
          )}
        </div>

        <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-line bg-sunken/60 pr-2 pl-3.5">
          {session.phase === 'ready' ? (
            <>
              <ProfileTag />
              <span className="flex-1" />
              <PrimaryButton
                onClick={runAutofill}
                disabled={session.summary.filled === 0}
                className="pr-1.5"
              >
                {session.summary.filled === 0 ? 'Nothing to fill' : 'Autofill'}
                {session.summary.filled > 0 && (
                  <Kbd>
                    <Icon icon={CornerDownLeft} size={12} />
                  </Kbd>
                )}
              </PrimaryButton>
            </>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
                <Icon icon={ShieldCheck} size={14} className="shrink-0" />
                <span className="truncate">Nothing was submitted</span>
              </span>
              <span className="flex-1" />
              <SecondaryButton
                onClick={rescan}
                aria-label="Rescan the page"
                title="Rescan the page"
                className="w-8 px-0"
              >
                <Icon icon={RotateCw} size={14} />
              </SecondaryButton>
              {session.queue.length > 0 && (
                <PrimaryButton onClick={next} className="pr-1.5">
                  {cursor === null ? 'Go to first' : 'Next field'}
                  <Kbd>
                    <Icon icon={CornerDownLeft} size={12} />
                  </Kbd>
                </PrimaryButton>
              )}
            </>
          )}
        </footer>

        <Announcer message={session.announcement} />
      </div>
    </>
  );
}

function ReadyBody({ session }: { session: AutofillSession }) {
  const { reports, summary, queue } = session;
  const willFill = reports.filter((r) => r.status === 'fill');
  const willKeep = reports.filter((r) => r.status === 'keep');

  return (
    <div className="px-3.5 pt-3 pb-2">
      <PageIdentity session={session} />
      <ul className="mt-2.5 -mx-1.5">
        {willFill.length > 0 && (
          <PlanLine
            glyph={<StatusGlyph status="fill" />}
            title={`Fill ${plural(willFill.length, 'field')} from your profile`}
            items={willFill}
          />
        )}
        {willKeep.length > 0 && (
          <PlanLine
            glyph={<StatusGlyph status="keep" />}
            title={`Keep ${plural(willKeep.length, 'entry', 'entries')} you already typed`}
            items={willKeep}
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
            items={queue}
            showReason
          />
        )}
      </ul>
      <MissingNote session={session} />
    </div>
  );
}

/** One line of the plan; expands to list the fields behind it. */
function PlanLine({
  glyph,
  title,
  meta,
  items,
  showReason = false,
}: {
  glyph: ReactNode;
  title: string;
  meta?: string | undefined;
  items: FieldReport[];
  showReason?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex h-8 w-full items-center gap-2.5 rounded-sm px-1.5 text-left transition-colors duration-100 hover:bg-hover"
      >
        {glyph}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {meta && (
          <span className="font-mono text-2xs text-ink-3 tabular-nums">
            {meta}
          </span>
        )}
        <Icon
          icon={ChevronDown}
          size={14}
          className={`shrink-0 text-ink-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul className="mb-1 ml-[25px] animate-[ak-fade-in_140ms_var(--ease-out)] border-l border-line pl-3">
          {items.map((report) => (
            <li
              key={report.field.element.id || report.field.label}
              className="flex h-7 items-center gap-3 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {report.field.label}
              </span>
              <span className="max-w-[55%] truncate text-ink-3">
                {showReason ? reasonFor(report) : (report.value ?? '')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ResultsBody({
  session,
  current,
  onSelect,
}: {
  session: AutofillSession;
  current: FieldReport | null;
  onSelect: (report: FieldReport) => void;
}) {
  const { summary, queue, reports } = session;
  const [showAll, setShowAll] = useState(false);
  const done = reports.filter(
    (r) => r.status === 'filled' || r.status === 'kept',
  );
  const currentIndex = current ? queue.indexOf(current) : -1;
  const expanded = showAll || currentIndex >= QUEUE_PREVIEW;
  const visible = expanded ? queue : queue.slice(0, QUEUE_PREVIEW);

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
          <ul className="px-2">
            {visible.map((report) => (
              <QueueRow
                key={report.field.element.id || report.field.label}
                report={report}
                current={report === current}
                onSelect={() => {
                  onSelect(report);
                }}
              />
            ))}
          </ul>
          {queue.length > QUEUE_PREVIEW && !expanded && (
            <button
              type="button"
              onClick={() => {
                setShowAll(true);
              }}
              className="mx-2 flex h-7 items-center gap-1 rounded-sm px-1.5 text-xs text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink-2"
            >
              Show {queue.length - QUEUE_PREVIEW} more
              <Icon icon={ChevronDown} size={14} />
            </button>
          )}
        </section>
      )}

      {done.length > 0 && (
        <ul className="mx-2 mt-2 border-t border-line pt-1.5">
          <PlanLine
            glyph={<StatusGlyph status="filled" />}
            title={`Done · ${String(done.length)}`}
            items={done}
          />
        </ul>
      )}
      <div className="px-3.5">
        <MissingNote session={session} />
      </div>
    </div>
  );
}

function QueueRow({
  report,
  current,
  onSelect,
}: {
  report: FieldReport;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={current ? 'step' : undefined}
        className={`group relative flex h-8 w-full items-center gap-2.5 rounded-sm px-1.5 text-left transition-colors duration-100 ${
          current ? 'bg-accent-soft' : 'hover:bg-hover'
        }`}
      >
        <StatusGlyph status={report.status} />
        <span className="flex min-w-0 flex-1 items-baseline gap-1">
          <span className="truncate">{report.field.label}</span>
          {report.field.required && (
            <span aria-label="required" className="text-danger/80">
              *
            </span>
          )}
        </span>
        <span
          className={`shrink-0 text-xs ${current ? 'text-accent' : 'text-ink-3'}`}
        >
          {current ? 'On page' : reasonFor(report)}
        </span>
      </button>
    </li>
  );
}

function PageIdentity({ session }: { session: AutofillSession }) {
  const { page, summary } = session;
  return (
    <div>
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

function ProfileTag() {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
      <span className="truncate">Sample profile</span>
      <span className="rounded-xs border border-line px-1 font-mono text-2xs text-ink-3">
        DEMO
      </span>
    </span>
  );
}

function MissingNote({ session }: { session: AutofillSession }) {
  if (session.missing.length === 0 || session.summary.total === 0) return null;
  return (
    <p className="mt-2 text-xs text-ink-3">
      Not asked on this form:{' '}
      {session.missing.map((field) => PROFILE_FIELD_LABEL[field]).join(', ')}
    </p>
  );
}

function NoForm() {
  return (
    <div className="px-3.5 py-5">
      <p className="font-medium">No application form here</p>
      <p className="mt-1 text-xs text-ink-2">
        ApplyKit looks for fields when you open it. If the form appears later,
        close and reopen ApplyKit.
      </p>
    </div>
  );
}

function reasonFor(report: FieldReport): string {
  return report.status === 'unsupported'
    ? KIND_LABEL[report.field.kind]
    : STATUS_LABEL[report.status];
}
