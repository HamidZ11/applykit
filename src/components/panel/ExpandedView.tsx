import { useState } from 'react';
import type { FieldReport } from '@/autofill/report';
import { PageIdentity } from './CompactView';
import { FieldRow, fieldKey } from './FieldRow';
import { matchesFilter, type FieldFilter } from './panel-state';
import type { PanelModel } from './usePanel';

/**
 * Expanded mode: every field on the form, grouped by the form's own
 * sections, with filters. After autofill the same rows are the report.
 */
export function ExpandedView({ model }: { model: PanelModel }) {
  const { phase, filter, setFilter, summary, selected, toggleSelect } = model;
  // Filled rows flash once, only when autofill completes while this view is
  // open: not when the view is opened afterwards or a filter changes.
  const [seenPhase, setSeenPhase] = useState(phase);
  const [flash, setFlash] = useState(false);
  if (phase !== seenPhase) {
    setSeenPhase(phase);
    setFlash(phase === 'done');
  }
  const visible = visibleReports(model);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3.5 pt-3 pb-2.5">
        <PageIdentity model={model} />
      </div>
      <FilterTabs
        filter={filter}
        onChange={setFilter}
        handledLabel={phase === 'ready' ? 'Fillable' : 'Done'}
        counts={{
          all: summary.total,
          handled: summary.filled + summary.kept,
          you: summary.needsYou,
        }}
      />
      <div
        role="region"
        aria-label="Fields on this form"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pb-1"
      >
        {visible.length === 0 ? (
          <p className="px-3.5 py-4 text-xs text-ink-2">
            No fields in this view.
          </p>
        ) : (
          groupBySection(visible).map(([section, items]) => (
            <section key={section} aria-label={section}>
              <div className="sticky top-0 z-10 flex h-7 items-center bg-canvas/95 px-3.5 text-2xs font-medium tracking-[0.01em] text-ink-3 backdrop-blur-[2px]">
                <span className="truncate">{section}</span>
                <span className="flex-1" />
                <span className="font-mono tabular-nums">{items.length}</span>
              </div>
              <ul className="px-1.5">
                {items.map((report) => (
                  <FieldRow
                    key={fieldKey(report.field.element)}
                    report={report}
                    selected={report.field.element === selected}
                    detailed
                    flash={flash && report.status === 'filled'}
                    onFlashEnd={() => {
                      setFlash(false);
                    }}
                    onSelect={() => {
                      toggleSelect(report.field.element);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/** The reports the expanded list currently shows, in page order. */
export function visibleReports(model: PanelModel): FieldReport[] {
  return model.reports.filter((report) => matchesFilter(report, model.filter));
}

function FilterTabs({
  filter,
  onChange,
  counts,
  handledLabel,
}: {
  filter: FieldFilter;
  onChange: (filter: FieldFilter) => void;
  counts: Record<FieldFilter, number>;
  handledLabel: string;
}) {
  const tabs: [FieldFilter, string][] = [
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
