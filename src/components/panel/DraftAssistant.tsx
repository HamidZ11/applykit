import { useEffect, useId, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { flagDraft, measure, overLimits } from '@/ai/check';
import { failureText } from '@/ai/failures';
import type { AnswerLimits, OpenQuestion } from '@/autofill/open-question';
import { currentValue, type FieldReport } from '@/autofill/report';
import type { AiPrepareResponse, SharedItem } from '@/messages';
import { Icon } from '@/components/ui/icons';
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import type { PanelModel } from './usePanel';
import { plural } from './vocabulary';

/**
 * Optional AI drafting for one open question (ADR 0019). The user asks for
 * a draft, sees exactly what will be shared, approves it, reviews and
 * edits the draft, and inserts it. Nothing is sent without the user's
 * click, nothing is inserted without "Insert answer", and nothing is
 * submitted. The background re-checks every request; this card only
 * presents it.
 */

type Preview = Extract<AiPrepareResponse, { status: 'ready' }>;

type Stage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'preview'; preview: Preview; full: boolean }
  | {
      kind: 'drafting';
      preview: Preview;
      controller: AbortController;
      /** The question as it was asked; insertion checks it is unchanged. */
      asked: OpenQuestion;
    }
  | { kind: 'draft'; preview: Preview; text: string; asked: OpenQuestion }
  | {
      kind: 'problem';
      message: string;
      link: 'skills' | 'ai' | null;
      preview: Preview | null;
    };

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

  // Leaving the field (or the panel) cancels a draft in progress.
  useEffect(
    () => () => {
      controller?.abort();
    },
    [controller],
  );

  if (support.status !== 'open' || !model.ai) return null;
  const question: OpenQuestion = support.question;
  const motivation = question.kind === 'motivation';
  const request = () => ({
    question: question.question,
    limits: question.limits,
    role: motivation ? names.role.trim() : '',
    employer: motivation ? names.employer.trim() : '',
  });

  const preview = (full: boolean) => {
    setStage({ kind: 'loading' });
    void model.previewDraft(request()).then((reply) => {
      if (!reply) {
        setStage(
          problem(
            'ApplyKit could not reach its background. Close the panel and open it again.',
          ),
        );
        return;
      }
      if (reply.status === 'unavailable') {
        setStage(
          problem(
            'AI drafting is not connected. Connect it in AI Assistant.',
            'ai',
          ),
        );
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
      });
    });
  };

  const send = (current: Preview, approve: boolean) => {
    const abort = new AbortController();
    const asked = question;
    setStage({ kind: 'drafting', preview: current, controller: abort, asked });
    void model
      .draftAnswer(
        { ...request(), selected: [...selected], approve },
        abort.signal,
      )
      .then((reply) => {
        if (abort.signal.aborted) return;
        if (!reply) {
          setStage(
            problem(
              'ApplyKit could not reach its background. Close the panel and open it again.',
              null,
              current,
            ),
          );
          return;
        }
        switch (reply.status) {
          case 'draft':
            setStage({
              kind: 'draft',
              preview: current,
              text: reply.text,
              asked,
            });
            return;
          case 'needs-approval':
            setStage({ kind: 'preview', preview: current, full: true });
            return;
          case 'unavailable':
            setStage(
              problem(
                'AI drafting is not connected. Connect it in AI Assistant.',
                'ai',
              ),
            );
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
                current,
              ),
            );
        }
      });
  };

  switch (stage.kind) {
    case 'idle':
      // Only an empty question can take a draft.
      if (currentValue(report.field) !== null) return null;
      return (
        <SecondaryButton
          size="sm"
          onClick={() => {
            preview(false);
          }}
        >
          <Icon icon={Sparkles} size={14} className="text-ink-3" />
          Draft with AI
        </SecondaryButton>
      );
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
            Drafting with Claude…
          </p>
          <GhostButton
            onClick={() => {
              stage.controller.abort();
              setStage({
                kind: 'preview',
                preview: stage.preview,
                full: false,
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
            {stage.preview && (
              <SecondaryButton
                size="sm"
                onClick={() => {
                  preview(true);
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
            send(stage.preview, stage.full);
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
          shared={[
            stage.asked.question,
            names.role,
            names.employer,
            ...stage.preview.items
              .filter((item) => selected.has(item.id))
              .map((item) => item.text),
          ]}
          onChange={(text) => {
            setStage({ ...stage, text });
          }}
          onRegenerate={() => {
            send(stage.preview, false);
          }}
          onCancel={() => {
            setStage({ kind: 'idle' });
          }}
          onInsert={(text) => model.insertDraft(report, text, stage.asked)}
          onInserted={() => {
            setStage({ kind: 'idle' });
          }}
        />
      );
  }
}

function problem(
  message: string,
  link: 'skills' | 'ai' | null = null,
  preview: Preview | null = null,
): Stage {
  return { kind: 'problem', message, link, preview };
}

/**
 * Exactly what a request shares. In full the first time, and whenever
 * anything changes; afterwards a one-line summary the user can open.
 */
function SharePreview({
  preview,
  full,
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

  if (preview.items.length === 0) {
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

  if (!full) {
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
        <fieldset className="mt-2">
          <legend className="text-2xs text-ink-3">Your information</legend>
          <ul className="mt-0.5 space-y-1">
            {preview.items.map((item: SharedItem) => (
              <li key={item.id}>
                <label className="flex cursor-default items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => {
                      onToggle(item.id);
                    }}
                    className="mt-0.5 size-3.5 shrink-0 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">
                      {item.label}
                    </span>
                    <span className="block break-words text-ink-2">
                      {item.text}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <p className="mt-2 text-2xs text-ink-3">
          Only what is ticked is sent, with the question, to Anthropic using
          your key ({preview.model}). Contact details and diversity answers are
          never shared.
        </p>
      </div>
      <div className="flex gap-1.5">
        <PrimaryButton
          className="h-7 px-2.5 text-xs"
          disabled={chosen.length === 0}
          onClick={onSend}
        >
          Send to Anthropic
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </div>
  );
}

/** The draft, editable, with its length against the question's limits. */
function DraftReview({
  text,
  limits,
  shared,
  onChange,
  onRegenerate,
  onCancel,
  onInsert,
  onInserted,
}: {
  text: string;
  limits: AnswerLimits;
  shared: string[];
  onChange: (text: string) => void;
  onRegenerate: () => void;
  onCancel: () => void;
  onInsert: (
    text: string,
  ) => Promise<
    { ok: true; filled: number; total: number } | { ok: false; message: string }
  >;
  onInserted: () => void;
}) {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const size = measure(text);
  const over = overLimits(text, limits);
  const flags = flagDraft(text, shared);

  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  const counts = [
    limits.sentences !== null
      ? `${String(size.sentences)} of ${plural(limits.sentences, 'sentence')}`
      : plural(size.sentences, 'sentence'),
    limits.words !== null
      ? `${String(size.words)} of ${String(limits.words)} words`
      : plural(size.words, 'word'),
    limits.characters !== null
      ? `${String(size.characters)} of ${String(limits.characters)} characters`
      : null,
  ].filter(Boolean);

  return (
    <div className="basis-full space-y-1.5">
      <label htmlFor={id} className="block text-2xs text-ink-3">
        Draft answer. Edit it before inserting.
      </label>
      <textarea
        id={id}
        ref={box}
        value={text}
        rows={5}
        onChange={(event) => {
          setError(null);
          onChange(event.target.value);
        }}
        className="block w-full resize-y rounded-sm border border-line-strong bg-white px-2 py-1.5 text-xs leading-5 text-ink outline-none focus:border-accent"
      />
      <p className={over.length > 0 ? 'text-danger' : 'text-ink-3'}>
        {counts.join(' · ')}
        {over.length > 0 && '. Over the limit: shorten it before inserting.'}
      </p>
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
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <PrimaryButton
          className="h-7 px-2.5 text-xs"
          disabled={busy || over.length > 0 || text.trim() === ''}
          onClick={() => {
            setBusy(true);
            setError(null);
            void onInsert(text).then((result) => {
              setBusy(false);
              if (result.ok && result.filled > 0) onInserted();
              else {
                setError(
                  result.ok
                    ? 'The page did not accept the answer. Paste it in yourself.'
                    : result.message,
                );
              }
            });
          }}
        >
          {busy ? 'Inserting…' : 'Insert answer'}
        </PrimaryButton>
        <SecondaryButton size="sm" disabled={busy} onClick={onRegenerate}>
          Regenerate
        </SecondaryButton>
        <GhostButton disabled={busy} onClick={onCancel}>
          Cancel
        </GhostButton>
      </div>
      <p className="text-2xs text-ink-3">
        Inserted only when you choose. ApplyKit never submits the form.
      </p>
    </div>
  );
}
