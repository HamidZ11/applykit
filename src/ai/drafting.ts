import { openQuestionKind } from '@/autofill/open-question';
import { emptySkillsProjects } from '@/domain/skills-projects';
import type { AiPrepareResponse, DraftContextRequest } from '@/messages';
import type { ApprovalStore } from '@/storage/ai-approvals';
import type { ProfileStore } from '@/storage/profile-store';
import type { SkillsStore } from '@/storage/skills-store';
import { aiAvailable, type ConnectionDeps } from './connection';
import { contextItems, defaultSelection, type ContextItem } from './context';
import { MODELS, type ModelChoice } from './models';

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

/** The items the user could share, from the confirmed profile only. */
async function availableItems(deps: DraftingDeps): Promise<ContextItem[]> {
  const [profile, skills] = await Promise.all([
    deps.profile.load(),
    deps.skills.load(),
  ]);
  return contextItems(
    profile.status === 'loaded' ? profile.profile : null,
    skills.status === 'loaded' ? skills.content : emptySkillsProjects(),
  );
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
  const [items, settings] = await Promise.all([
    availableItems(deps),
    deps.settings.load(),
  ]);
  const selected = defaultSelection(kind, items);
  const shared = items.filter((item) => selected.includes(item.id));
  const approved =
    shared.length > 0 &&
    (await deps.approvals.has(
      await approvalFingerprint(settings.model, request, shared),
    ));
  return {
    status: 'ready',
    kind,
    items: items.map(({ id, label, text }) => ({ id, label, text })),
    selected,
    approved,
    model: MODELS[settings.model].label,
  };
}
