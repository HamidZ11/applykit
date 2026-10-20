import { useEffect, useRef, type KeyboardEvent } from 'react';
import {
  CornerDownLeft,
  GripVertical,
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
import {
  Announcer,
  CloseButton,
  Kbd,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import { useHeightTransition } from './useHeightTransition';
import { usePanelPosition } from './usePanelPosition';
import {
  usePanel,
  type Drafting,
  type LoadValues,
  type PanelModel,
} from './usePanel';
import type { PanelSettings, ProfileSection } from '@/messages';
import type { requestDiversityChoices } from './profile-access';
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
  openProfile,
  loadSettings,
  chooseDiversity,
  drafting,
}: {
  onClose: () => void;
  /** Where the confirmed profile's values come from; replaced in tests. */
  loadValues?: LoadValues;
  /** Opens the profile page; replaced in tests. */
  openProfile?: (section?: ProfileSection) => Promise<boolean>;
  /** Where the panel's display preferences come from; replaced in tests. */
  loadSettings?: () => Promise<PanelSettings>;
  /** Chooses options for monitoring questions; replaced in tests. */
  chooseDiversity?: typeof requestDiversityChoices;
  /** AI drafting's way to the background; replaced in tests. */
  drafting?: Drafting;
}) {
  const model = usePanel(
    loadValues,
    undefined,
    openProfile,
    loadSettings,
    chooseDiversity,
    drafting,
  );
  const frame = useRef<HTMLDivElement>(null);
  const { mode, phase, summary, selected, fields } = model;
  const hasForm = summary.total > 0;
  const selectedField = fields.find((field) => field.element === selected);
  useHeightTransition(frame, mode);
  const position = usePanelPosition(frame);

  // Keep keyboard focus in the panel when it opens and when a mode switch
  // removes the focused control; never steal it from inside the panel.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const root = node.getRootNode() as Document | ShadowRoot;
    if (!node.contains(root.activeElement)) node.focus({ preventScroll: true });
    // Also when the review closes, taking the focused control with it.
  }, [mode, model.reviewing]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (model.reviewing) model.closeReview();
      else if (mode === 'expanded') model.collapse();
      else onClose();
    } else if (model.reviewing) {
      // The review's own controls handle their keys; nothing else runs.
      return;
    } else if (event.key === 'Enter') {
      if (event.target instanceof HTMLButtonElement) return;
      // A control inside the list (a record choice) handles its own keys.
      if (event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      runPrimary(model);
    } else if (
      mode === 'expanded' &&
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      // Only from the panel itself or a row: moving the selection removes
      // the selected row's detail, which may hold the focused control, and
      // radio buttons use the arrow keys themselves.
      (event.target === event.currentTarget ||
        (event.target instanceof HTMLButtonElement &&
          event.target.hasAttribute('aria-pressed')))
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
        style={{
          height: mode === 'expanded' ? EXPANDED_HEIGHT : 'auto',
          transform: `translate(${String(position.offset.x)}px, ${String(position.offset.y)}px)`,
        }}
        className="ak-panel fixed right-4 bottom-4 flex max-h-[calc(100vh-32px)] w-[380px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg bg-canvas shadow-panel outline-none"
      >
        {/* The header moves the panel; its buttons keep their own clicks. */}
        <header
          onPointerDown={(event) => {
            const target = event.target as Element;
            if (target.closest('button:not([data-move-handle])')) return;
            position.handle.onPointerDown(event);
          }}
          onPointerMove={position.handle.onPointerMove}
          onPointerUp={position.handle.onPointerUp}
          onPointerCancel={position.handle.onPointerCancel}
          onDoubleClick={(event) => {
            if ((event.target as Element).closest('button')) return;
            position.reset();
          }}
          className="flex h-10 shrink-0 cursor-grab touch-none items-center gap-2 border-b border-line pr-2 pl-1.5 select-none active:cursor-grabbing"
        >
          <button
            type="button"
            data-move-handle
            onKeyDown={position.handle.onKeyDown}
            aria-label="Move panel"
            title="Move panel: drag the header, or use the arrow keys here. Home, or a double-click on the header, puts it back."
            className="flex size-6 cursor-grab items-center justify-center rounded-sm text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            <Icon icon={GripVertical} size={14} />
          </button>
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
            onClick={model.openProfile}
          />
          {hasForm && <ModeToggle model={model} />}
          <CloseButton onClose={onClose} />
        </header>
        {model.problem && (
          <p
            role="alert"
            className="shrink-0 border-b border-line bg-danger-soft px-3.5 py-2 text-xs text-danger"
          >
            {model.problem}
          </p>
        )}

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
  const { values, phase } = model;
  switch (values.status) {
    case 'missing':
      return (
        <PrimaryButton onClick={model.openProfile}>
          Set up your profile
        </PrimaryButton>
      );
    case 'invalid':
      return (
        <PrimaryButton onClick={model.openProfile}>
          Open your profile
        </PrimaryButton>
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
  // What autofill would fill now: not fields already filled from a record
  // the user chose.
  const fillable = model.reports.some((report) => report.status === 'fill');
  return (
    <PrimaryButton
      onClick={model.autofill}
      disabled={!fillable}
      className="pr-1.5"
    >
      {fillable ? 'Autofill' : 'Nothing to fill'}
      {fillable && (
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
    model.reports.some((report) => report.status === 'fill')
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
