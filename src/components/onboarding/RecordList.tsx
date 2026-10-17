import { useState, type ReactNode } from 'react';
import { CircleAlert, Plus } from 'lucide-react';
import { Icon } from '@/components/ui/icons';
import { GhostButton, SecondaryButton } from '@/components/ui/primitives';

interface RecordListProps<T extends { id: string }> {
  records: T[];
  openId: string | null;
  /** Singular noun for buttons and confirmations, e.g. "education". */
  noun: string;
  empty: { title: string; description: string };
  summary: (record: T) => { primary: string; secondary: string };
  hasError: (id: string) => boolean;
  renderEditor: (record: T) => ReactNode;
  onAdd: () => void;
  onOpen: (id: string | null) => void;
  /** Called when the user finishes editing; return false to keep it open. */
  onDone: (id: string) => boolean;
  onRemove: (id: string) => void;
}

/**
 * A list of records as stable rows. Each row summarises its record and
 * expands into an inline editor; removal asks for confirmation in the row.
 */
export function RecordList<T extends { id: string }>({
  records,
  openId,
  noun,
  empty,
  summary,
  hasError,
  renderEditor,
  onAdd,
  onOpen,
  onDone,
  onRemove,
}: RecordListProps<T>) {
  const [confirming, setConfirming] = useState<string | null>(null);

  const addButton = (
    <SecondaryButton onClick={onAdd}>
      <Icon icon={Plus} size={14} />
      Add {noun}
    </SecondaryButton>
  );

  if (records.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong px-5 py-6">
        <p className="font-medium">{empty.title}</p>
        <p className="mt-1 max-w-[46ch] text-xs text-ink-2">
          {empty.description}
        </p>
        <div className="mt-4">{addButton}</div>
      </div>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-line border-y border-line">
        {records.map((record) => {
          const open = record.id === openId;
          const { primary, secondary } = summary(record);
          const invalid = hasError(record.id);
          return (
            <li
              key={record.id}
              aria-label={primary || `New ${noun}`}
              className={open ? 'bg-sunken/50' : undefined}
            >
              <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate font-medium ${primary ? '' : 'text-ink-3'}`}
                  >
                    {primary || `New ${noun}`}
                  </p>
                  {secondary && (
                    <p className="truncate text-xs text-ink-2">{secondary}</p>
                  )}
                </div>
                {invalid && !open && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-danger">
                    <Icon icon={CircleAlert} size={13} />
                    Needs attention
                  </span>
                )}
                {confirming === record.id ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ink-2">
                    Remove this {noun}?
                    <GhostButton
                      onClick={() => {
                        setConfirming(null);
                      }}
                    >
                      Cancel
                    </GhostButton>
                    <GhostButton
                      tone="danger"
                      onClick={() => {
                        setConfirming(null);
                        onRemove(record.id);
                      }}
                    >
                      Remove
                    </GhostButton>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5">
                    {!open && (
                      <GhostButton
                        aria-label={`Edit ${primary || `new ${noun}`}`}
                        onClick={() => {
                          onOpen(record.id);
                        }}
                      >
                        Edit
                      </GhostButton>
                    )}
                    <GhostButton
                      aria-label={`Remove ${primary || `new ${noun}`}`}
                      onClick={() => {
                        setConfirming(record.id);
                      }}
                    >
                      Remove
                    </GhostButton>
                  </span>
                )}
              </div>
              {open && (
                <div className="animate-[ak-fade-in_140ms_var(--ease-out)] px-3 pt-2 pb-5">
                  {renderEditor(record)}
                  <div className="mt-5 flex justify-end">
                    <SecondaryButton
                      onClick={() => {
                        if (onDone(record.id)) onOpen(null);
                      }}
                    >
                      Done
                    </SecondaryButton>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4">{addButton}</div>
    </div>
  );
}
