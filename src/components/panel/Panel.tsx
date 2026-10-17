import { useEffect, useRef, type KeyboardEvent } from 'react';
import {
  CornerDownLeft,
  Maximize2,
  Minimize2,
  RotateCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CompactView } from './CompactView';
import { ExpandedView, visibleReports } from './ExpandedView';
import { fieldKey } from './FieldRow';
import { BrandMark, Icon } from '@/components/ui/icons';
import { Locator } from './Locator';
import { openProfile } from './profile-access';
import {
  Announcer,
  CloseButton,
  Kbd,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import { useHeightTransition } from './useHeightTransition';
import { usePanel, type LoadValues, type PanelModel } from './usePanel';
import { locateTarget } from './vocabulary';

/** Expanded height: tall enough to inspect, never taller than the viewport. */
const EXPANDED_HEIGHT = 'min(600px, calc(100vh - 32px))';

/**
 * ApplyKit's floating panel.
 *
 * One panel, two presentation modes over one state (see usePanel):
 * compact by default, expandable into the full field list. Both modes keep
 * the same width and bottom-right anchor, so expanding only grows upward.
 */
export function Panel({
  onClose,
  loadValues,
}: {
  onClose: () => void;
  /** Where the confirmed profile's values come from; replaced in tests. */
  loadValues?: LoadValues;
}) {
  const model = usePanel(loadValues);
  const frame = useRef<HTMLDivElement>(null);
  const { mode, phase, summary, selected, fields } = model;
  const hasForm = summary.total > 0;
  const selectedField = fields.find((field) => field.element === selected);
  useHeightTransition(frame, mode);

  // Keep keyboard focus in the panel when it opens and when a mode switch
  // removes the focused control; never steal it from inside the panel.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const root = node.getRootNode() as Document | ShadowRoot;
    if (!node.contains(root.activeElement)) node.focus({ preventScroll: true });
  }, [mode]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (mode === 'expanded') model.collapse();
      else onClose();
    } else if (event.key === 'Enter') {
      if (event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      runPrimary(model);
    } else if (
      mode === 'expanded' &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp')
    ) {
      event.preventDefault();
      moveSelection(model, event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  return (
    <>
      {selectedField && (
        <Locator
          key={fieldKey(selectedField.element)}
          target={locateTarget(selectedField)}
        />
      )}
      <div
        ref={frame}
        role="dialog"
        aria-label="ApplyKit"
        tabIndex={-1}
        data-mode={mode}
        onKeyDown={onKeyDown}
        style={{ height: mode === 'expanded' ? EXPANDED_HEIGHT : 'auto' }}
        className="ak-panel fixed right-4 bottom-4 flex max-h-[calc(100vh-32px)] w-[380px] flex-col overflow-hidden rounded-lg bg-canvas shadow-panel outline-none"
      >
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3.5">
          <BrandMark />
          <span className="font-medium">ApplyKit</span>
          <span className="min-w-0 truncate font-mono text-2xs text-ink-3">
            {model.page.host}
          </span>
          <span className="flex-1" />
          <HeaderButton
            label={
              model.values.status === 'missing'
                ? 'Set up your profile'
                : 'Open your profile'
            }
            icon={UserRound}
            onClick={openProfile}
          />
          {hasForm && <ModeToggle model={model} />}
          <CloseButton onClose={onClose} />
        </header>

        <div
          key={
            mode === 'expanded'
              ? 'expanded'
              : phase === 'done'
                ? 'compact-done'
                : 'compact-ready'
          }
          className={`flex min-h-0 flex-1 animate-[ak-fade-in_160ms_var(--ease-out)] flex-col ${
            mode === 'compact' ? 'overflow-y-auto overscroll-contain' : ''
          }`}
        >
          {!hasForm ? (
            <NoForm />
          ) : mode === 'expanded' ? (
            <ExpandedView model={model} />
          ) : (
            <CompactView model={model} />
          )}
        </div>

        {hasForm && <Footer model={model} />}
        <Announcer message={model.announcement} />
      </div>
    </>
  );
}

/** A header icon button, matching the expand toggle and close button. */
function HeaderButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-7 items-center justify-center rounded-sm text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
    >
      <Icon icon={icon} size={14} />
    </button>
  );
}

function ModeToggle({ model }: { model: PanelModel }) {
  const expanded = model.mode === 'expanded';
  const label = expanded ? 'Show summary' : 'Show all fields';
  return (
    <button
      type="button"
      onClick={() => {
        if (expanded) model.collapse();
        else model.expand();
      }}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      className="flex size-7 items-center justify-center rounded-sm text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
    >
      <Icon icon={expanded ? Minimize2 : Maximize2} size={14} />
    </button>
  );
}

function Footer({ model }: { model: PanelModel }) {
  const { phase, queue, selected } = model;
  const reviewing = queue.some((report) => report.field.element === selected);

  return (
    <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-line bg-sunken/60 pr-2 pl-3.5">
      {phase === 'done' ? (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
          <Icon icon={ShieldCheck} size={14} className="shrink-0" />
          <span className="truncate">Nothing was submitted</span>
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
          <Icon icon={UserRound} size={14} className="shrink-0 text-ink-3" />
          <span className="truncate">
            {PROFILE_STATUS[model.values.status]}
          </span>
        </span>
      )}
      <span className="flex-1" />
      <SecondaryButton
        onClick={model.rescan}
        disabled={phase === 'filling'}
        aria-label="Rescan the page"
        title="Rescan the page and reload your profile"
        className="w-8 px-0"
      >
        <Icon icon={RotateCw} size={14} />
      </SecondaryButton>
      {phase === 'done' ? (
        queue.length > 0 && (
          <PrimaryButton onClick={model.next} className="pr-1.5">
            {reviewing ? 'Next field' : 'Go to first'}
            <Kbd>
              <Icon icon={CornerDownLeft} size={12} />
            </Kbd>
          </PrimaryButton>
        )
      ) : (
        <ReadyAction model={model} />
      )}
    </footer>
  );
}

/** What the footer says about the profile before autofill. */
const PROFILE_STATUS: Record<PanelModel['values']['status'], string> = {
  loading: 'Reading your profile…',
  ready: 'Your saved profile',
  missing: 'No profile saved',
  invalid: 'Profile needs checking',
  error: 'Profile unavailable',
};

/**
 * Autofill when a confirmed profile is available; otherwise the one action
 * that would make it available. Never falls back to other data.
 */
function ReadyAction({ model }: { model: PanelModel }) {
  const { values, summary, phase } = model;
  switch (values.status) {
    case 'missing':
      return (
        <PrimaryButton onClick={openProfile}>Set up your profile</PrimaryButton>
      );
    case 'invalid':
      return (
        <PrimaryButton onClick={openProfile}>Open your profile</PrimaryButton>
      );
    case 'error':
      return <PrimaryButton onClick={model.rescan}>Try again</PrimaryButton>;
    case 'loading':
      return <PrimaryButton disabled>Autofill</PrimaryButton>;
    case 'ready':
      break;
  }
  if (phase === 'filling') {
    return <PrimaryButton disabled>Filling…</PrimaryButton>;
  }
  return (
    <PrimaryButton
      onClick={model.autofill}
      disabled={summary.filled === 0}
      className="pr-1.5"
    >
      {summary.filled === 0 ? 'Nothing to fill' : 'Autofill'}
      {summary.filled > 0 && (
        <Kbd>
          <Icon icon={CornerDownLeft} size={12} />
        </Kbd>
      )}
    </PrimaryButton>
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

/** ↵ does what the footer's primary button does, in either mode. */
function runPrimary(model: PanelModel) {
  if (model.phase === 'done') {
    model.next();
  } else if (
    model.phase === 'ready' &&
    model.values.status === 'ready' &&
    model.summary.filled > 0
  ) {
    model.autofill();
  }
}

/** ↑/↓ in the expanded list move the shared selection through visible rows. */
function moveSelection(model: PanelModel, step: 1 | -1) {
  const visible = visibleReports(model);
  if (visible.length === 0) return;
  const index = visible.findIndex(
    (report) => report.field.element === model.selected,
  );
  const target =
    index === -1
      ? step === 1
        ? 0
        : visible.length - 1
      : Math.min(Math.max(index + step, 0), visible.length - 1);
  const element = visible[target]?.field.element;
  if (element && element !== model.selected) model.toggleSelect(element);
}
