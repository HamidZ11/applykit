import { useEffect, useId, useRef, useState } from 'react';
import type { AiStatus } from '@/ai/connection';
import { failureText } from '@/ai/failures';
import { MODELS, type ModelChoice } from '@/ai/models';
import {
  browserAiSettingsClient,
  type AiSettingsClient,
} from '@/ai/settings-client';
import { GhostButton, PrimaryButton } from '@/components/ui/primitives';
import { MAX_DAILY_LIMIT, isDailyLimit } from '@/storage/ai-settings';
import { CONTROL, CONTROL_STATE } from './fields';
import { Banner, Notice, Problem, SectionShell } from './page-parts';

/**
 * Optional AI drafting (ADR 0019): connect the user's own Anthropic key,
 * choose a model and a daily limit, or disconnect. Off unless the user
 * connects; nothing here is part of onboarding. The key is handed to the
 * background worker and never shown again, only its last four characters.
 */

const INTRO =
  'Connect your own Anthropic API key to draft answers using information you choose to share.';

const CONSOLE_KEYS = 'https://platform.claude.com/settings/keys';

const MODEL_NOTE: Record<ModelChoice, string> = {
  fast: 'Claude Haiku 5.5. About $0.0003 per answer.',
  quality: 'Claude Sonnet 5.5. About $0.006 per answer.',
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; status: AiStatus };

export function AiSettingsView({
  client = browserAiSettingsClient,
  heading,
}: {
  client?: AiSettingsClient;
  heading?: React.RefObject<HTMLHeadingElement | null>;
}) {
  const ownHeading = useRef<HTMLHeadingElement | null>(null);
  const headingRef = heading ?? ownHeading;
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [limit, setLimit] = useState('');
  const keyId = useId();
  const limitId = useId();
  const supported = client.supported();

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void client.status().then((status) => {
      if (!active) return;
      setPhase(status ? { kind: 'ready', status } : { kind: 'unavailable' });
      if (status) setLimit(String(status.dailyLimit));
    });
    return () => {
      active = false;
    };
  }, [client, supported, attempt]);

  const shell = (children: React.ReactNode) => (
    <SectionShell heading={headingRef} title="AI Assistant" intro={INTRO}>
      {children}
    </SectionShell>
  );

  if (!supported) {
    return shell(
      <Banner tone="warning">
        AI drafting is not available in this browser. Everything else in
        ApplyKit works as usual.
      </Banner>,
    );
  }
  if (phase.kind === 'loading') return shell(null);
  if (phase.kind === 'unavailable') {
    return shell(
      <Banner tone="danger">
        ApplyKit could not read its AI settings. Nothing was changed.{' '}
        <button
          type="button"
          onClick={() => {
            setPhase({ kind: 'loading' });
            setAttempt((count) => count + 1);
          }}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Try again
        </button>
      </Banner>,
    );
  }

  const { status } = phase;
  const connected = status.connected && status.permission;

  const connectWith = (granted: Promise<boolean>) => {
    setBusy(true);
    setProblem(null);
    setNotice('');
    void granted
      .then(async (ok) => {
        if (!ok)
          return { ok: false as const, failure: 'no-permission' as const };
        return (
          (await client.connect(key, remember)) ?? {
            ok: false as const,
            failure: 'network' as const,
          }
        );
      })
      .then((result) => {
        setBusy(false);
        if (result.ok) {
          setKey('');
          setPhase({ kind: 'ready', status: result.status });
          setLimit(String(result.status.dailyLimit));
          setNotice('Connected. Nothing is sent until you choose to draft.');
        } else {
          setProblem(failureText(result.failure));
        }
      });
  };

  const save = (model: ModelChoice, dailyLimit: number) => {
    setProblem(null);
    void client.saveSettings({ model, dailyLimit }).then((saved) => {
      if (!saved) {
        setProblem('ApplyKit could not save this setting. Try again.');
        return;
      }
      setPhase({ kind: 'ready', status: { ...status, model, dailyLimit } });
      setNotice('Saved.');
    });
  };

  return shell(
    <>
      <ul className="mt-5 max-w-[60ch] list-disc space-y-1 pl-5 text-xs text-ink-2">
        <li>
          Optional. ApplyKit works fully without it and sends nothing to
          Anthropic until you connect a key and choose to draft.
        </li>
        <li>
          Before each new question, you see exactly what will be shared. Contact
          details, your address and diversity answers are never shared.
        </li>
        <li>
          Requests go from this browser straight to Anthropic, which bills your
          account. ApplyKit has no server.
        </li>
      </ul>

      {connected ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-md border border-line bg-white px-4 py-3.5">
            <p className="font-medium">Connected</p>
            <p className="mt-0.5 text-xs text-ink-2">
              Key ending {status.keyHint} ·{' '}
              {status.remembered
                ? 'Remembered on this device, stored without encryption'
                : 'Kept until the browser closes'}
            </p>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-ink-2">
              Model
            </legend>
            <div className="space-y-1.5">
              {(Object.keys(MODELS) as ModelChoice[]).map((choice) => (
                <label
                  key={choice}
                  className="flex cursor-default items-start gap-2.5"
                >
                  <input
                    type="radio"
                    name="ai-model"
                    checked={status.model === choice}
                    onChange={() => {
                      save(choice, status.dailyLimit);
                    }}
                    className="mt-1 size-4 shrink-0 accent-accent"
                  />
                  <span>
                    <span className="block">{MODELS[choice].label}</span>
                    <span className="block text-xs text-ink-3">
                      {MODEL_NOTE[choice]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor={limitId}
              className="mb-1.5 block text-xs font-medium text-ink-2"
            >
              Daily request limit
            </label>
            <input
              id={limitId}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_DAILY_LIMIT}
              value={limit}
              onChange={(event) => {
                setLimit(event.target.value);
              }}
              onBlur={() => {
                const value = Number(limit);
                if (isDailyLimit(value)) {
                  if (value !== status.dailyLimit) save(status.model, value);
                } else {
                  setLimit(String(status.dailyLimit));
                  setProblem(
                    `Choose a limit from 1 to ${String(MAX_DAILY_LIMIT)}.`,
                  );
                }
              }}
              className={`${CONTROL} ${CONTROL_STATE(false)} h-9 w-24 px-3`}
            />
            <p className="mt-1.5 max-w-[60ch] text-xs text-ink-3">
              {status.requestsToday} of {status.dailyLimit} used today · about $
              {status.estimatedCostToday.toFixed(4)} (an estimate from reported
              usage). This counts requests from this browser only; set a spend
              limit for your key&rsquo;s workspace in the{' '}
              <a
                href={CONSOLE_KEYS}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Claude Console
              </a>
              .
            </p>
          </div>

          <GhostButton
            tone="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setProblem(null);
              void client.disconnect().then(async (ok) => {
                const next = await client.status();
                setBusy(false);
                if (next) setPhase({ kind: 'ready', status: next });
                if (ok) {
                  setNotice(
                    'Disconnected. Your key was removed from this browser.',
                  );
                } else {
                  setProblem('ApplyKit could not remove your key. Try again.');
                }
              });
            }}
          >
            Disconnect
          </GhostButton>
        </div>
      ) : (
        <form
          noValidate
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || key.trim() === '') return;
            // The browser asks for the permission only within this click.
            connectWith(client.requestPermission());
          }}
        >
          {status.connected && !status.permission && (
            <Banner tone="warning">
              Access to api.anthropic.com was removed in the browser&rsquo;s
              settings. Connect again to use AI drafting, or remove your key
              ending {status.keyHint}.{' '}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void client.disconnect().then(async (ok) => {
                    const next = await client.status();
                    setBusy(false);
                    if (next) setPhase({ kind: 'ready', status: next });
                    if (ok)
                      setNotice('Your key was removed from this browser.');
                    else
                      setProblem(
                        'ApplyKit could not remove your key. Try again.',
                      );
                  });
                }}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Remove key
              </button>
            </Banner>
          )}
          <div>
            <label
              htmlFor={keyId}
              className="mb-1.5 block text-xs font-medium text-ink-2"
            >
              Anthropic API key
            </label>
            <input
              id={keyId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
              }}
              placeholder="sk-ant-…"
              className={`${CONTROL} ${CONTROL_STATE(false)} h-9 px-3 font-mono text-sm`}
            />
            <p className="mt-1.5 max-w-[60ch] text-xs text-ink-3">
              Create a key for a single workspace with a spend limit in the{' '}
              <a
                href={CONSOLE_KEYS}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Claude Console
              </a>
              . ApplyKit checks it with a free request.
            </p>
          </div>
          <label className="flex cursor-default items-start gap-2.5">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => {
                setRemember(event.target.checked);
              }}
              className="mt-0.5 size-4 shrink-0 rounded-xs accent-accent"
            />
            <span>
              <span className="block">Remember on this device</span>
              <span className="mt-0.5 block text-xs text-ink-2">
                Off: the key is forgotten when the browser closes. On: it is
                stored in this browser&rsquo;s extension storage without
                encryption, readable by anyone with access to this browser
                profile, and, in some browsers, by a page that compromises the
                tab ApplyKit runs in.
              </span>
            </span>
          </label>
          <PrimaryButton type="submit" disabled={busy || key.trim() === ''}>
            {busy ? 'Connecting…' : 'Connect'}
          </PrimaryButton>
        </form>
      )}

      {problem && <Problem>{problem}</Problem>}
      <Notice>{notice}</Notice>
    </>,
  );
}
