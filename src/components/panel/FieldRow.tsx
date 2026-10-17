import { useEffect, useRef } from 'react';
import type { FieldReport } from '@/autofill/report';
import { StatusGlyph } from './icons';
import {
  KIND_LABEL,
  STATUS_LABEL,
  detectionDetail,
  explain,
} from './vocabulary';

interface FieldRowProps {
  report: FieldReport;
  selected: boolean;
  /** Expanded mode: show the explanation and detection detail when selected. */
  detailed: boolean;
  /** Briefly highlight a row that autofill just filled. */
  flash?: boolean;
  onFlashEnd?: () => void;
  onSelect: () => void;
}

/**
 * One field, rendered identically in the compact queue and the expanded list
 * so the same field always looks the same.
 */
export function FieldRow({
  report,
  selected,
  detailed,
  flash = false,
  onFlashEnd,
  onSelect,
}: FieldRowProps) {
  const { field, status, value } = report;
  const row = useRef<HTMLLIElement>(null);
  const detail = detailed && selected ? detectionDetail(field) : null;

  useEffect(() => {
    if (selected) row.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <li
      ref={row}
      onAnimationEnd={(event) => {
        if (event.animationName === 'ak-changed') onFlashEnd?.();
      }}
      className={`rounded-sm transition-colors duration-100 ${
        selected ? 'bg-accent-soft' : ''
      } ${flash ? 'animate-[ak-changed_900ms_var(--ease-out)]' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        {...(detailed ? { 'aria-expanded': selected } : {})}
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
            value === null ? 'text-ink-3' : 'text-ink-2'
          }`}
        >
          {value ??
            (status === 'unsupported'
              ? KIND_LABEL[field.kind]
              : STATUS_LABEL[status])}
        </span>
      </button>
      {detailed && selected && (
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

/** Stable React key for a form control, so rows survive rescans. */
const keys = new WeakMap<Element, number>();
let nextKey = 0;
export function fieldKey(element: Element): number {
  let key = keys.get(element);
  if (key === undefined) {
    key = nextKey++;
    keys.set(element, key);
  }
  return key;
}
