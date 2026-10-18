import { openQuestionKind } from '@/autofill/open-question';
import { emptySkillsProjects } from '@/domain/skills-projects';
import type {
  AiDraftRequest,
  AiDraftResponse,
  AiPrepareResponse,
  DraftContextRequest,
} from '@/messages';
import type { ApprovalStore } from '@/storage/ai-approvals';
import type { ProfileStore } from '@/storage/profile-store';
import type { SkillsStore } from '@/storage/skills-store';
import { requestDraft } from './anthropic';
import { cleanDraft } from './check';
import { aiAvailable, type ConnectionDeps } from './connection';
import { contextItems, rankContext, type ContextItem } from './context';
import { MODELS, type ModelChoice } from './models';
import {
  INSUFFICIENT,
  SYSTEM_PROMPT,
  buildPrompt,
  maxTokensFor,
} from './prompt';

/**
 * AI drafting in the background worker (ADR 0019): what may be shared for
 * a question, whether the user already approved exactly that, and (in
 * `draft`) the request itself. Everything shared is built here from saved
 * data; the panel only names items by id.
 */

export interface DraftingDeps extends ConnectionDeps {
  profile: Pick<ProfileStore, 'load'>;
  skills: Pick<SkillsStore, 'load'>;
  approvals: ApprovalStore;
}

/** The saved data items come from: the confirmed profile only. */
async function savedData(deps: DraftingDeps) {
  const [profile, skills] = await Promise.all([
    deps.profile.load(),
    deps.skills.load(),
  ]);
  return {
    profile: profile.status === 'loaded' ? profile.profile : null,
    saved: skills.status === 'loaded' ? skills.content : emptySkillsProjects(),
  };
}

/** The items the user could share. */
async function availableItems(deps: DraftingDeps): Promise<ContextItem[]> {
  const { profile, saved } = await savedData(deps);
  return contextItems(profile, saved);
}

/**
 * A fingerprint of everything a request would send: provider, model,
 * question, limits, role and employer, and each shared item's text. Any
 * change needs a new approval.
 */
export async function approvalFingerprint(
  model: ModelChoice,
  request: DraftContextRequest,
  shared: readonly ContextItem[],
): Promise<string> {
  const content = JSON.stringify({
    provider: 'anthropic',
    model: MODELS[model].id,
    question: request.question,
    limits: request.limits,
    role: request.role,
    employer: request.employer,
    shared: [...shared]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => [item.id, item.text]),
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(content),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** What a question could share, and what is chosen by default. */
export async function prepare(
  deps: DraftingDeps,
  request: DraftContextRequest,
): Promise<AiPrepareResponse> {
  if (!(await aiAvailable(deps))) return { status: 'unavailable' };
  const kind = openQuestionKind(request.question);
  if (!kind) return { status: 'not-a-question' };
  const [{ profile, saved }, settings] = await Promise.all([
    savedData(deps),
    deps.settings.load(),
  ]);
  const { items, selected } = rankContext(
    kind,
    profile,
    saved,
    `${request.question} ${request.role} ${request.employer}`,
  );
  const shared = items.filter((item) => selected.includes(item.id));
  const approved =
    shared.length > 0 &&
    (await deps.approvals.has(
      await approvalFingerprint(settings.model, request, shared),
    ));
  return {
    status: 'ready',
    kind,
    items: items.map(({ id, group, title, summary, text }) => ({
      id,
      group,
      title,
      summary,
      text,
    })),
    selected,
    approved,
    model: MODELS[settings.model].label,
  };
}

/**
 * One draft, only for a request the user approved: now (`approve`, from
 * the full preview) or earlier this session for exactly the same content.
 * The background checks everything again: that AI is connected and
 * allowed, that the question is an open question, which saved items are
 * shared (by id, never text from the panel), the daily limit, and the
 * reply. Nothing is retried automatically.
 */
export async function draft(
  deps: DraftingDeps,
  request: AiDraftRequest,
  signal?: AbortSignal,
): Promise<AiDraftResponse> {
  if (!(await aiAvailable(deps))) return { status: 'unavailable' };
  const kind = openQuestionKind(request.question);
  if (!kind) return { status: 'not-a-question' };
  const [items, settings] = await Promise.all([
    availableItems(deps),
    deps.settings.load(),
  ]);
  const shared = items.filter((item) => request.selected.includes(item.id));
  if (shared.length === 0) {
    return { status: 'failed', failure: 'no-context', retryAfterSeconds: null };
  }
  const fingerprint = await approvalFingerprint(
    settings.model,
    request,
    shared,
  );
  if (!request.approve && !(await deps.approvals.has(fingerprint))) {
    return { status: 'needs-approval' };
  }
  const credential = await deps.credentials.load();
  if (!credential) return { status: 'unavailable' };
  if (signal?.aborted) {
    return { status: 'failed', failure: 'cancelled', retryAfterSeconds: null };
  }
  if (!(await deps.usage.reserve(settings.dailyLimit, deps.now()))) {
    return {
      status: 'failed',
      failure: 'daily-limit',
      retryAfterSeconds: null,
    };
  }
  if (request.approve) await deps.approvals.add(fingerprint);

  const reply = await requestDraft(
    {
      key: credential.key,
      model: settings.model,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(
        kind,
        request.question,
        request.limits,
        shared.map((item) => item.text),
        request.role,
        request.employer,
      ),
      maxTokens: maxTokensFor(request.limits, settings.model),
    },
    {
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      ...(signal ? { signal } : {}),
    },
  );
  const { usage } = reply;
  if (usage) await deps.usage.record(settings.model, usage, deps.now());
  if (!reply.ok) {
    return {
      status: 'failed',
      failure: reply.failure,
      retryAfterSeconds: reply.retryAfterSeconds,
    };
  }
  const text = cleanDraft(reply.text);
  if (text.includes(INSUFFICIENT)) {
    return {
      status: 'failed',
      failure: 'insufficient',
      retryAfterSeconds: null,
    };
  }
  return { status: 'draft', text };
}
