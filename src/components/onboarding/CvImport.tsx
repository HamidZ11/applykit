import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Check,
  CircleAlert,
  CircleHelp,
  FileText,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { extractCv } from '@/cv/extract';
import {
  CV_READ_ERROR,
  readCv,
  type CvFile,
  type CvReadResult,
} from '@/cv/read';
import {
  FIELD_LABEL,
  LINK_TARGETS,
  PERSONAL_TARGETS,
  applyChoices,
  buildReview,
  countChanges,
  defaultChoices,
  type FieldProposal,
  type ImportChoices,
  type ImportReview,
  type RecordProposal,
} from '@/cv/review';
import type { Certainty } from '@/cv/types';
import type { ProfileDraft } from '@/domain/user-profile';
import { Icon } from '@/components/ui/icons';
import { PrimaryButton, SecondaryButton } from '@/components/ui/primitives';
import { CONTROL, CONTROL_STATE } from './fields';
import { EMPLOYMENT_TYPE_LABEL, formatRange } from './format';

type Stage =
  | { name: 'choose'; error: string | null }
  | { name: 'reading'; fileName: string }
  | {
      name: 'review';
      fileName: string;
      notes: string[];
      review: ImportReview;
      choices: ImportChoices;
    };

interface CvImportProps {
  draft: ProfileDraft;
  /** Editing a saved profile rather than first-run onboarding. */
  editing: boolean;
  onApply: (draft: ProfileDraft, changes: number) => void;
  onCancel: () => void;
  /** Injectable for tests; defaults to the local PDF/Word reader. */
  read?: (file: CvFile) => Promise<CvReadResult>;
}

const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Import from CV: choose a file, read it on this device, then review every
 * suggestion before anything reaches the draft. The CV text lives only in
 * this component while reviewing and is never stored.
 */
export function CvImport({
  draft,
  editing,
  onApply,
  onCancel,
  read = readCv,
}: CvImportProps) {
  const [stage, setStage] = useState<Stage>({ name: 'choose', error: null });
  const heading = useRef<HTMLHeadingElement>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [stage.name]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setStage({ name: 'reading', fileName: file.name });
    const result = await read(file);
    if (!active.current) return;
    if (!result.ok) {
      setStage({ name: 'choose', error: CV_READ_ERROR[result.error] });
      return;
    }
    const review = buildReview(extractCv(result.text), draft);
    const found =
      review.fields.length + review.education.length + review.employment.length;
    if (found === 0) {
      setStage({
        name: 'choose',
        error:
          'ApplyKit could not find any details it recognises in this CV. You can enter them yourself.',
      });
      return;
    }
    setStage({
      name: 'review',
      fileName: file.name,
      notes: [...result.notes, ...review.warnings],
      review,
      choices: defaultChoices(review),
    });
  };

  if (stage.name !== 'review') {
    return (
      <Layout
        heading={heading}
        title="Import from your CV"
        intro="ApplyKit reads your CV on this device and suggests details for your profile. Nothing is added until you choose."
        footer={<SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>}
      >
        {stage.name === 'choose' && stage.error && (
          <Notice tone="danger">{stage.error}</Notice>
        )}
        <DropZone
          reading={stage.name === 'reading' ? stage.fileName : null}
          onFile={(file) => {
            void handleFile(file);
          }}
        />
        <p className="mt-4 flex items-start gap-2 text-xs text-ink-3">
          <Icon icon={ShieldCheck} size={14} className="mt-px shrink-0" />
          Your CV is read on this device. It is not uploaded, and ApplyKit does
          not keep the file.
        </p>
      </Layout>
    );
  }

  const { review, choices } = stage;
  const changes = countChanges(review, choices);
  const setChoices = (next: ImportChoices) => {
    setStage({ ...stage, choices: next });
  };

  return (
    <Layout
      heading={heading}
      title="Review what ApplyKit found"
      intro={
        editing
          ? 'Choose what to add. Your saved details stay unless you choose to replace them, and nothing is saved until you save your profile.'
          : 'Choose what to add to your profile. You can change anything afterwards, and nothing is saved until you save your profile.'
      }
      footer={
        <>
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <span className="flex-1" />
          <span className="text-xs text-ink-3">
            {changes === 1
              ? '1 change selected'
              : `${String(changes)} changes selected`}
          </span>
          <PrimaryButton
            disabled={changes === 0}
            onClick={() => {
              onApply(applyChoices(draft, review, choices), changes);
            }}
          >
            Add to profile
          </PrimaryButton>
        </>
      }
    >
      <p className="mb-6 flex items-center gap-2 text-xs text-ink-2">
        <Icon icon={FileText} size={14} className="shrink-0 text-ink-3" />
        <span className="truncate">{stage.fileName}</span>
      </p>
      {stage.notes.length > 0 && (
        <Notice tone="info">
          {stage.notes.map((note) => (
            <span key={note} className="block">
              {note}
            </span>
          ))}
        </Notice>
      )}

      <div className="space-y-8">
        <FieldGroup
          title="Personal details"
          proposals={review.fields.filter((f) =>
            PERSONAL_TARGETS.includes(f.target),
          )}
          choices={choices}
          onChange={setChoices}
        />
        <FieldGroup
          title="Links"
          proposals={review.fields.filter((f) =>
            LINK_TARGETS.includes(f.target),
          )}
          choices={choices}
          onChange={setChoices}
        />
        <RecordGroup
          title="Education"
          empty="No education entries found."
          proposals={review.education}
          summary={(record) => ({
            primary: [record.qualification, record.fieldOfStudy]
              .filter(Boolean)
              .join(', '),
            secondary: [
              record.institution,
              formatRange(record.startDate, record.endDate),
              record.grade,
            ]
              .filter(Boolean)
              .join(' · '),
          })}
          choices={choices}
          onChange={setChoices}
        />
        <RecordGroup
          title="Experience"
          empty="No roles found."
          proposals={review.employment}
          summary={(record) => ({
            primary: record.title,
            secondary: [
              record.employer,
              record.employmentType &&
                EMPLOYMENT_TYPE_LABEL[record.employmentType],
              formatRange(record.startDate, record.endDate, record.current),
            ]
              .filter(Boolean)
              .join(' · '),
          })}
          choices={choices}
          onChange={setChoices}
        />
        {review.missing.length > 0 && (
          <p className="text-xs text-ink-3">
            Not found in your CV:{' '}
            {review.missing.map((target) => FIELD_LABEL[target]).join(', ')}.
            Address and country are always entered by you.
          </p>
        )}
      </div>
    </Layout>
  );
}

function Layout({
  heading,
  title,
  intro,
  footer,
  children,
}: {
  heading: RefObject<HTMLHeadingElement | null>;
  title: string;
  intro: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-8 pb-16 md:px-10 md:pt-[clamp(32px,6vh,56px)]">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-xl font-medium tracking-[-0.01em] outline-none"
        >
          {title}
        </h1>
        <p className="mt-1 max-w-[56ch] text-ink-2">{intro}</p>
        <div className="mt-8">{children}</div>
      </div>
      <div className="sticky bottom-0 border-t border-line bg-canvas/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-14 w-full max-w-[640px] items-center gap-3 px-5 md:px-10">
          {footer}
        </div>
      </div>
    </>
  );
}

function DropZone({
  reading,
  onFile,
}: {
  /** The file being read, or null when waiting for one. */
  reading: string | null;
  onFile: (file: File | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!reading) onFile(event.dataTransfer.files[0]);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!reading) setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
      className={`flex flex-col items-center rounded-md border border-dashed px-6 py-10 text-center transition-colors duration-100 ${
        dragging
          ? 'border-accent bg-accent-soft/60'
          : 'border-line-strong bg-white/40'
      }`}
    >
      <Icon icon={FileText} size={20} className="text-ink-3" />
      {reading ? (
        <p role="status" className="mt-3 font-medium">
          Reading {reading}…
        </p>
      ) : (
        <>
          <p className="mt-3 font-medium">Drop your CV here</p>
          <p className="mt-1 text-xs text-ink-3">
            PDF or Word (.docx), up to 5 MB. Scanned CVs can’t be read yet.
          </p>
          <SecondaryButton
            className="mt-4"
            onClick={() => {
              input.current?.click();
            }}
          >
            Choose a file
          </SecondaryButton>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="CV file"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

function FieldGroup({
  title,
  proposals,
  choices,
  onChange,
}: {
  title: string;
  proposals: FieldProposal[];
  choices: ImportChoices;
  onChange: (choices: ImportChoices) => void;
}) {
  if (proposals.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="text-base font-medium">{title}</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {proposals.map((proposal) => (
          <FieldRow
            key={proposal.target}
            proposal={proposal}
            choice={choices.fields[proposal.target]}
            onChange={(choice) => {
              onChange({
                ...choices,
                fields: { ...choices.fields, [proposal.target]: choice },
              });
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function FieldRow({
  proposal,
  choice,
  onChange,
}: {
  proposal: FieldProposal;
  choice: { accept: boolean; value: string } | undefined;
  onChange: (choice: { accept: boolean; value: string }) => void;
}) {
  const label = FIELD_LABEL[proposal.target];
  const same = proposal.relation === 'same' || !choice;
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-3 sm:grid-cols-[20px_132px_minmax(0,1fr)]">
      <input
        type="checkbox"
        aria-label={`Use for ${label}`}
        disabled={same}
        checked={same ? false : choice.accept}
        onChange={(event) => {
          if (choice) onChange({ ...choice, accept: event.target.checked });
        }}
        className="mt-2 size-4 accent-accent disabled:opacity-40"
      />
      <div className="pt-1.5">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        <CertaintyTag certainty={proposal.certainty} />
      </div>
      <div className="col-start-2 mt-2 min-w-0 sm:col-start-3 sm:mt-0">
        {same ? (
          <p className="pt-1.5">
            {proposal.current}
            <span className="ml-2 text-xs text-ink-3">
              Already in your profile
            </span>
          </p>
        ) : (
          <input
            type="text"
            aria-label={label}
            value={choice.value}
            onChange={(event) => {
              onChange({ accept: true, value: event.target.value });
            }}
            className={`${CONTROL} ${CONTROL_STATE(false)} h-8 px-2.5 text-sm`}
          />
        )}
        {proposal.relation === 'conflict' && (
          <p className="mt-1.5 text-xs text-ink-2">
            Currently <span className="font-medium">{proposal.current}</span>.
            {choice?.accept
              ? ' This will be replaced.'
              : ' Kept unless you tick this.'}
          </p>
        )}
        <Source text={proposal.source} />
      </div>
    </li>
  );
}

function RecordGroup<T>({
  title,
  empty,
  proposals,
  summary,
  choices,
  onChange,
}: {
  title: string;
  empty: string;
  proposals: RecordProposal<T>[];
  summary: (record: T) => { primary: string; secondary: string };
  choices: ImportChoices;
  onChange: (choices: ImportChoices) => void;
}) {
  return (
    <section aria-label={title}>
      <h2 className="text-base font-medium">{title}</h2>
      {proposals.length === 0 ? (
        <p className="mt-2 text-xs text-ink-3">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {proposals.map((proposal) => {
            const { primary, secondary } = summary(proposal.record);
            const name = primary || 'Untitled entry';
            return (
              <li
                key={proposal.key}
                className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 py-3"
              >
                <input
                  type="checkbox"
                  aria-label={`Add ${name}`}
                  disabled={proposal.duplicate}
                  checked={
                    !proposal.duplicate &&
                    Boolean(choices.records[proposal.key])
                  }
                  onChange={(event) => {
                    onChange({
                      ...choices,
                      records: {
                        ...choices.records,
                        [proposal.key]: event.target.checked,
                      },
                    });
                  }}
                  className="mt-0.5 size-4 accent-accent disabled:opacity-40"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className={`font-medium ${primary ? '' : 'text-ink-3'}`}>
                      {name}
                    </p>
                    {proposal.duplicate ? (
                      <span className="text-xs text-ink-3">
                        Already in your profile
                      </span>
                    ) : (
                      <CertaintyTag certainty={proposal.certainty} />
                    )}
                  </div>
                  {secondary && (
                    <p className="text-xs text-ink-2">{secondary}</p>
                  )}
                  {proposal.notes.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {proposal.notes.map((note) => (
                        <li
                          key={note}
                          className="flex items-start gap-1.5 text-xs text-warning"
                        >
                          <Icon
                            icon={CircleHelp}
                            size={13}
                            className="mt-px shrink-0"
                          />
                          {note}
                        </li>
                      ))}
                    </ul>
                  )}
                  <details className="mt-1.5 text-xs text-ink-3">
                    <summary className="w-fit cursor-default rounded-xs hover:text-ink-2">
                      Show text from your CV
                    </summary>
                    <p className="mt-1 border-l border-line pl-2.5 whitespace-pre-line">
                      {proposal.source}
                    </p>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CertaintyTag({ certainty }: { certainty: Certainty }) {
  return certainty === 'confident' ? (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <Icon icon={Check} size={12} />
      Confident
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <Icon icon={CircleHelp} size={12} />
      Check this
    </span>
  );
}

/** The CV line a value came from, as plain text. */
function Source({ text }: { text: string }) {
  return (
    <p className="mt-1 truncate text-xs text-ink-3" title={text}>
      From your CV: “{text}”
    </p>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: 'danger' | 'info';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`mb-6 flex items-start gap-2.5 rounded-md px-3.5 py-3 text-sm ${
        tone === 'danger'
          ? 'bg-danger-soft text-danger'
          : 'bg-sunken text-ink-2'
      }`}
    >
      <Icon
        icon={tone === 'danger' ? CircleAlert : Info}
        size={16}
        className="mt-px shrink-0"
      />
      <div>{children}</div>
    </div>
  );
}
