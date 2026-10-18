import { useEffect, useId, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { flagDraft } from '@/ai/check';
import { failureText } from '@/ai/failures';
import {
  describeBound,
  describeViolation,
  limitViolations,
  measure,
  type AnswerLimits,
} from '@/autofill/answer-limits';
import type { OpenQuestion } from '@/autofill/open-question';
import { currentValue, type FieldReport } from '@/autofill/report';
import type {
  AiPrepareResponse,
  DraftContextRequest,
  DraftMode,
  SharedItem,
} from '@/messages';
import { Icon } from '@/components/ui/icons';
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import type { ChoiceResult, PanelModel } from './usePanel';
import { plural } from './vocabulary';

/**
 * Optional AI drafting for one open question (ADR 0019). For an empty
 * question the user asks for a draft; for one they have answered, they
 * can ask to improve their own wording. Either way they see exactly what
 * will be shared, approve it, review and edit the result, and insert it
 * (or, when improving, confirm replacing their text). Nothing is sent
 * without the user's click, nothing is written without their final
 * action, and nothing is submitted. The background re-checks every
 * request; this card only presents it.
 */

type Preview = Extract<AiPrepareResponse, { status: 'ready' }>;

/** What the card works on: a new answer, or the applicant's own text. */
interface Job {
  mode: DraftMode;
  /** The answer on the page when improving it; empty for a new one. */
  original: string;
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'preview'; preview: Preview; full: boolean; job: Job }
  | {
      kind: 'drafting';
      preview: Preview;
      controller: AbortController;
      /** The question as it was asked; writing checks it is unchanged. */
      asked: OpenQuestion;
      job: Job;
      previous: string | null;
    }
  | {
      kind: 'draft';
      preview: Preview;
      text: string;
      asked: OpenQuestion;
      job: Job;
      /** The version before a revision, so it is never lost. */
      previous: string | null;
    }
  | {
      kind: 'problem';
      message: string;
      link: 'skills' | 'ai' | null;
      retry: Job | null;
    };

const UNREACHABLE =
  'ApplyKit could not reach its background. Close the panel and open it again.';
const NOT_CONNECTED =
  'AI drafting is not connected. Connect it in AI Assistant.';

/** "Junior Data Engineer · Example Fernhill Analytics Careers" → names. */
function namesFromPage(model: PanelModel): { role: string; employer: string } {
  const { heading, subheading, host } = model.page;
  return {
    role: heading === host ? '' : heading.slice(0, 100),
    employer: (subheading ?? '')
      .replace(/\s+(?:careers|jobs|recruitment|vacancies)$/i, '')
      .slice(0, 100),
  };
}

export function DraftAssistant({
  report,
  model,
}: {
  report: FieldReport;
  model: PanelModel;
}) {
  const { support } = report.field;
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [names, setNames] = useState(() => namesFromPage(model));
  const controller = stage.kind === 'drafting' ? stage.controller : null;

  // Leaving the field (or the panel) cancels a request in progress.
  useEffect(
    () => () => {
      controller?.abort();
    },
    [controller],
  );

  if (support.status !== 'open' || !model.ai) return null;
  const question: OpenQuestion = support.question;
  if (question.aiProhibited) {
    return (
      <p className="basis-full text-ink-3">
        This form asks for answers written without AI, so ApplyKit does not
        offer AI drafting here.
      </p>
    );
  }
  const motivation = question.kind === 'motivation';
  const request = (job: Job): DraftContextRequest => ({
    question: question.question,
    limits: question.limits,
    role: motivation ? names.role.trim() : '',
    employer: motivation ? names.employer.trim() : '',
    mode: job.mode,
    original: job.original,
  });

  const preview = (job: Job, full: boolean) => {
    setStage({ kind: 'loading' });
    void model.previewDraft(request(job)).then((reply) => {
      if (!reply) {
        setStage(problem(UNREACHABLE));
        return;
      }
      if (reply.status === 'unavailable') {
        setStage(problem(NOT_CONNECTED, 'ai'));
        return;
      }
      if (reply.status === 'not-a-question') {
        setStage(problem('ApplyKit does not draft answers to this question.'));
        return;
      }
      setSelected(new Set(reply.selected));
      setStage({
        kind: 'preview',
        preview: reply,
        full: full || !reply.approved,
        job,
      });
    });
  };

  /**
   * Sends one request. With `revise`, asks Claude to revise that text
   * (the current draft, which misses the limits) instead of the job's
   * own: always an explicitly approved request.
   */
  const send = (
    current: Preview,
    job: Job,
    approve: boolean,
    revise: string | null = null,
  ) => {
    const abort = new AbortController();
    const asked = question;
    setStage({
      kind: 'drafting',
      preview: current,
      controller: abort,
      asked,
      job,
      previous: revise,
    });
    const asking: Job =
      revise === null ? job : { mode: 'improve', original: revise };
    void model
      .draftAnswer(
        {
          ...request(asking),
          selected: [...selected],
          approve: approve || asking.mode === 'improve',
        },
        abort.signal,
      )
      .then((reply) => {
        if (abort.signal.aborted) return;
        if (!reply) {
          setStage(problem(UNREACHABLE, null, job));
          return;
        }
        switch (reply.status) {
          case 'draft':
            setStage({
              kind: 'draft',
              preview: current,
              text: reply.text,
              asked,
              job,
              previous: revise,
            });
            return;
          case 'needs-approval':
            setStage({ kind: 'preview', preview: current, full: true, job });
            return;
          case 'unavailable':
            setStage(problem(NOT_CONNECTED, 'ai'));
            return;
          case 'not-a-question':
            setStage(
              problem('ApplyKit does not draft answers to this question.'),
            );
            return;
          case 'failed':
            setStage(
              problem(
                failureText(reply.failure, reply.retryAfterSeconds),
                reply.failure === 'insufficient'
                  ? 'skills'
                  : reply.failure === 'daily-limit'
                    ? 'ai'
                    : null,
                job,
              ),
            );
        }
      });
  };

  switch (stage.kind) {
    case 'idle': {
      const answered = currentValue(report.field);
      // An empty question can take a draft; an answered one, help with
      // the applicant's own wording.
      return (
        <SecondaryButton
          size="sm"
          onClick={() => {
            preview(
              answered === null
                ? { mode: 'draft', original: '' }
                : { mode: 'improve', original: answered },
              false,
            );
          }}
        >
          <Icon icon={Sparkles} size={14} className="text-ink-3" />
          {answered === null ? 'Draft with AI' : 'Improve my answer'}
        </SecondaryButton>
      );
    }
    case 'loading':
      return (
        <p role="status" className="basis-full text-ink-3">
          Checking what can be shared…
        </p>
      );
    case 'drafting':
      return (
        <div className="flex basis-full items-center gap-2">
          <p role="status" className="text-ink-2">
            {stage.job.mode === 'improve' || stage.previous !== null
              ? 'Improving with Claude…'
              : 'Drafting with Claude…'}
          </p>
          <GhostButton
            onClick={() => {
              stage.controller.abort();
              setStage({
                kind: 'preview',
                preview: stage.preview,
                full: stage.job.mode === 'improve',
                job: stage.job,
              });
            }}
          >
            Cancel
          </GhostButton>
        </div>
      );
    case 'problem':
      return (
        <div className="basis-full space-y-1.5">
          <p role="alert" className="text-danger">
            {stage.message}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stage.link === 'skills' && (
              <SecondaryButton size="sm" onClick={model.openSkills}>
                Skills &amp; projects
              </SecondaryButton>
            )}
            {stage.link === 'ai' && (
              <SecondaryButton size="sm" onClick={model.openAiSettings}>
                AI Assistant
              </SecondaryButton>
            )}
            {stage.retry && (
              <SecondaryButton
                size="sm"
                onClick={() => {
                  if (stage.retry) preview(stage.retry, true);
                }}
              >
                Try again
              </SecondaryButton>
            )}
            <GhostButton
              onClick={() => {
                setStage({ kind: 'idle' });
              }}
            >
              Close
            </GhostButton>
          </div>
        </div>
      );
    case 'preview':
      return (
        <SharePreview
          preview={stage.preview}
          full={stage.full}
          job={stage.job}
          question={question}
          selected={selected}
          names={motivation ? names : null}
          onNames={setNames}
          onToggle={(id) => {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            setSelected(next);
            // A changed selection is a new request: show it in full.
            setStage({ ...stage, full: true });
          }}
          onShowAll={() => {
            setStage({ ...stage, full: true });
          }}
          onSend={() => {
            send(stage.preview, stage.job, stage.full);
          }}
          onCancel={() => {
            setStage({ kind: 'idle' });
          }}
          onOpenSkills={model.openSkills}
        />
      );
    case 'draft':
      return (
        <DraftReview
          text={stage.text}
          limits={stage.asked.limits}
          job={stage.job}
          previous={stage.previous}
          shared={[
            stage.asked.question,
            names.role,
            names.employer,
            stage.job.original,
            stage.previous ?? '',
            ...stage.preview.items
              .filter((item) => selected.has(item.id))
              .map((item) => item.text),
          ]}
          onChange={(text) => {
            setStage({ ...stage, text });
          }}
          onRegenerate={() => {
            send(stage.preview, stage.job, false);
          }}
          onRevise={() => {
            send(stage.preview, stage.job, true, stage.text);
          }}
          onCancel={() => {
            setStage({ kind: 'idle' });
          }}
          onWrite={(text) =>
            stage.job.mode === 'improve'
              ? model.replaceAnswer(
                  report,
                  text,
                  stage.asked,
                  stage.job.original,
                )
              : model.insertDraft(report, text, stage.asked)
          }
          onWritten={() => {
            setStage({ kind: 'idle' });
          }}
        />
      );
  }
}

function problem(
  message: string,
  link: 'skills' | 'ai' | null = null,
  retry: Job | null = null,
): Stage {
  return { kind: 'problem', message, link, retry };
}

/**
 * Exactly what a request shares. In full the first time, whenever
 * anything changes, and always when improving the applicant's own text;
 * otherwise a one-line summary the user can open.
 */
function SharePreview({
  preview,
  full,
  job,
  question,
  selected,
  names,
  onNames,
  onToggle,
  onShowAll,
  onSend,
  onCancel,
  onOpenSkills,
}: {
  preview: Preview;
  full: boolean;
  job: Job;
  question: OpenQuestion;
  selected: ReadonlySet<string>;
  names: { role: string; employer: string } | null;
  onNames: (names: { role: string; employer: string }) => void;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  onSend: () => void;
  onCancel: () => void;
  onOpenSkills: () => void;
}) {
  const roleId = useId();
  const employerId = useId();
  const chosen = preview.items.filter((item) => selected.has(item.id));
  const improving = job.mode === 'improve';
  const facts = chosen.filter((item) => item.group !== 'style');

  if (!improving && preview.items.every((item) => item.group === 'style')) {
    return (
      <div className="basis-full space-y-1.5">
        <p className="text-ink-2">
          Nothing to share yet. Add your skills and projects so drafts have
          facts to use.
        </p>
        <div className="flex gap-1.5">
          <SecondaryButton size="sm" onClick={onOpenSkills}>
            Skills &amp; projects
          </SecondaryButton>
          <GhostButton onClick={onCancel}>Close</GhostButton>
        </div>
      </div>
    );
  }

  if (!full && !improving) {
    return (
      <div className="basis-full space-y-1.5">
        <p className="text-ink-2">
          Shares the question and {plural(chosen.length, 'item')} with
          Anthropic, as you approved before.{' '}
          <button
            type="button"
            onClick={onShowAll}
            className="font-medium text-accent underline underline-offset-2"
          >
            Show
          </button>
        </p>
        <div className="flex gap-1.5">
          <PrimaryButton className="h-7 px-2.5 text-xs" onClick={onSend}>
            Draft
          </PrimaryButton>
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div className="basis-full space-y-2">
      <div className="rounded-md border border-line bg-white px-2.5 py-2">
        <p className="text-2xs text-ink-3">To share with Anthropic</p>
        <p className="mt-0.5 text-2xs text-ink-3">Question</p>
        <p className="break-words text-ink">{question.question}</p>
        {improving && (
          <>
            <p className="mt-2 text-2xs text-ink-3">
              Your answer on the page, to improve
            </p>
            <p className="rounded-sm bg-sunken px-1.5 py-1 break-words whitespace-pre-wrap text-ink">
              {job.original}
            </p>
          </>
        )}
        {names && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <label htmlFor={roleId} className="text-2xs text-ink-3">
              Role
              <input
                id={roleId}
                value={names.role}
                maxLength={100}
                onChange={(event) => {
                  onNames({ ...names, role: event.target.value });
                }}
                className="mt-0.5 block h-7 w-full rounded-sm border border-line-strong px-1.5 text-xs text-ink"
              />
            </label>
            <label htmlFor={employerId} className="text-2xs text-ink-3">
              Employer
              <input
                id={employerId}
                value={names.employer}
                maxLength={100}
                onChange={(event) => {
                  onNames({ ...names, employer: event.target.value });
                }}
                className="mt-0.5 block h-7 w-full rounded-sm border border-line-strong px-1.5 text-xs text-ink"
              />
            </label>
          </div>
        )}
        {preview.items.length > 0 && (
          <fieldset className="mt-2">
            <legend className="text-2xs text-ink-3">
              {improving
                ? 'Your information (optional, to keep facts accurate)'
                : 'Your information'}
            </legend>
            <ul className="mt-1 divide-y divide-line">
              {preview.items.map((item) => (
                <SharedItemRow
                  key={item.id}
                  item={item}
                  checked={selected.has(item.id)}
                  onToggle={() => {
                    onToggle(item.id);
                  }}
                />
              ))}
            </ul>
          </fieldset>
        )}
        <p className="mt-2 text-2xs text-ink-3">
          Only what is shown here and ticked is sent to Anthropic using your key
          ({preview.model}), exactly as each item&rsquo;s details show. Contact
          details and diversity answers are never shared.
        </p>
      </div>
      <div className="flex gap-1.5">
        <PrimaryButton
          className="h-7 px-2.5 text-xs"
          disabled={!improving && facts.length === 0}
          onClick={onSend}
        >
          Send to Anthropic
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </div>
  );
}

/**
 * The draft, editable, with its length against the question's
 * requirements. A draft that misses them cannot be written; the user can
 * edit it or ask for a revision, which is a new, explicit request.
 */
function DraftReview({
  text,
  limits,
  job,
  previous,
  shared,
  onChange,
  onRegenerate,
  onRevise,
  onCancel,
  onWrite,
  onWritten,
}: {
  text: string;
  limits: AnswerLimits;
  job: Job;
  previous: string | null;
  shared: string[];
  onChange: (text: string) => void;
  onRegenerate: () => void;
  onRevise: () => void;
  onCancel: () => void;
  onWrite: (text: string) => Promise<ChoiceResult>;
  onWritten: () => void;
}) {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [shown, setShown] = useState<'original' | 'previous' | null>(null);
  const size = measure(text);
  const violations = limitViolations(text, limits);
  const flags = flagDraft(text, shared);
  const replacing = job.mode === 'improve';

  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  // Each count, with the employer's requirement where there is one.
  const counts = [
    [
      plural(size.sentences, 'sentence'),
      describeBound(limits.sentences, 'sentences'),
    ],
    [plural(size.words, 'word'), describeBound(limits.words, 'words')],
    [
      plural(size.characters, 'character'),
      describeBound(limits.characters, 'characters'),
    ],
  ]
    .filter(([, required], index) => index < 2 || required !== null)
    .map(([actual, required]) =>
      required ? `${String(actual)} (${required})` : actual,
    );

  const write = () => {
    setBusy(true);
    setError(null);
    void onWrite(text).then((result) => {
      setBusy(false);
      setConfirming(false);
      if (result.ok && result.filled > 0) onWritten();
      else {
        setError(
          result.ok
            ? 'The page did not accept the answer. Paste it in yourself.'
            : result.message,
        );
      }
    });
  };

  return (
    <div className="basis-full space-y-1.5">
      <label htmlFor={id} className="block text-2xs text-ink-3">
        {replacing
          ? 'Improved answer. Edit it before replacing yours.'
          : 'Draft answer. Edit it before inserting.'}
      </label>
      <textarea
        id={id}
        ref={box}
        value={text}
        rows={5}
        onChange={(event) => {
          setError(null);
          setConfirming(false);
          onChange(event.target.value);
        }}
        className="block w-full resize-y rounded-sm border border-line-strong bg-white px-2 py-1.5 text-xs leading-5 text-ink outline-none focus:border-accent"
      />
      <p className="text-ink-3">{counts.join(' · ')}</p>
      {violations.length > 0 && (
        <p className="text-danger">
          Does not meet the question&rsquo;s requirements.{' '}
          {violations.map(describeViolation).join(' ')} Edit it, or ask Claude
          to revise it, before {replacing ? 'replacing' : 'inserting'}.
        </p>
      )}
      {flags.unstated.length > 0 && (
        <p className="text-warning">
          Check: {flags.unstated.join(', ')}{' '}
          {flags.unstated.length === 1 ? 'is' : 'are'} not in what you shared.
        </p>
      )}
      {(flags.dashes || flags.formatting) && (
        <p className="text-ink-3">
          {flags.dashes ? 'Contains a dash. ' : ''}
          {flags.formatting ? 'Contains list or markdown formatting.' : ''}
        </p>
      )}
      {(replacing || previous !== null) && (
        <div className="flex flex-wrap gap-x-3">
          {replacing && (
            <button
              type="button"
              aria-expanded={shown === 'original'}
              onClick={() => {
                setShown(shown === 'original' ? null : 'original');
              }}
              className="text-2xs font-medium text-accent hover:underline"
            >
              {shown === 'original'
                ? 'Hide your original'
                : 'Show your original'}
            </button>
          )}
          {previous !== null && (
            <button
              type="button"
              aria-expanded={shown === 'previous'}
              onClick={() => {
                setShown(shown === 'previous' ? null : 'previous');
              }}
              className="text-2xs font-medium text-accent hover:underline"
            >
              {shown === 'previous'
                ? 'Hide the previous version'
                : 'Show the previous version'}
            </button>
          )}
        </div>
      )}
      {shown && (
        <p className="rounded-sm bg-sunken px-1.5 py-1 break-words whitespace-pre-wrap text-ink-2 select-text">
          {shown === 'original' ? job.original : previous}
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="space-y-1.5 rounded-md border border-line bg-white px-2.5 py-2">
          <p className="text-ink">
            Replace the text in this field with this version? Your original
            stays here until you close this card.
          </p>
          <div className="flex gap-1.5">
            <PrimaryButton
              className="h-7 px-2.5 text-xs"
              disabled={busy}
              onClick={write}
            >
              {busy ? 'Replacing…' : 'Replace'}
            </PrimaryButton>
            <GhostButton
              disabled={busy}
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep mine
            </GhostButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <PrimaryButton
            className="h-7 px-2.5 text-xs"
            disabled={busy || violations.length > 0 || text.trim() === ''}
            onClick={() => {
              if (replacing) setConfirming(true);
              else write();
            }}
          >
            {busy
              ? 'Inserting…'
              : replacing
                ? 'Replace your answer…'
                : 'Insert answer'}
          </PrimaryButton>
          {violations.length > 0 && (
            <SecondaryButton size="sm" disabled={busy} onClick={onRevise}>
              Revise to fit
            </SecondaryButton>
          )}
          <SecondaryButton size="sm" disabled={busy} onClick={onRegenerate}>
            {replacing ? 'Try again' : 'Regenerate'}
          </SecondaryButton>
          <GhostButton disabled={busy} onClick={onCancel}>
            Cancel
          </GhostButton>
        </div>
      )}
      <p className="text-2xs text-ink-3">
        {violations.length > 0
          ? 'Revise to fit sends this draft to Anthropic and counts as a request. '
          : ''}
        Written only when you choose. ApplyKit never submits the form.
      </p>
    </div>
  );
}

const GROUP_NAME: Record<SharedItem['group'], string> = {
  skills: 'Skills',
  project: 'Project',
  job: 'Job',
  education: 'Education',
  style: 'Writing style',
};

/**
 * One item in the preview: its type, title and a short summary, with the
 * exact text that would be sent one click away.
 */
function SharedItemRow({
  item,
  checked,
  onToggle,
}: {
  item: SharedItem;
  checked: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <li className="flex items-start gap-2 py-1.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-3 size-3.5 shrink-0 accent-accent"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium tracking-wide text-ink-3 uppercase">
          {GROUP_NAME[item.group]}
        </p>
        <label htmlFor={id} className="block font-medium break-words text-ink">
          {item.title}
        </label>
        {item.summary && <p className="truncate text-ink-3">{item.summary}</p>}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
          className="text-2xs font-medium text-accent underline-offset-2 hover:underline"
        >
          {open ? 'Hide details' : 'Show details'}
        </button>
        {open && (
          <p className="mt-0.5 rounded-sm bg-sunken px-1.5 py-1 break-words whitespace-pre-wrap text-ink-2">
            {item.text}
          </p>
        )}
      </div>
    </li>
  );
}
