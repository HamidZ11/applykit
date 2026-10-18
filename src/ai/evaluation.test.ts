import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  NO_LIMITS,
  limitViolations,
  readLimits,
} from '@/autofill/answer-limits';
import { openQuestionKind } from '@/autofill/open-question';
import {
  previewDigest,
  type AiDraftRequest,
  type DraftContextRequest,
} from '@/messages';
import { browserApprovalStore } from '@/storage/ai-approvals';
import { browserCredentialStore } from '@/storage/ai-credential';
import {
  browserAiSettingsStore,
  browserAiUsageStore,
} from '@/storage/ai-settings';
import {
  softwareStudent,
  sparseApplicant,
  type Applicant,
} from '@/test/evaluation-applicants';
import type { Fetch } from './anthropic';
import { flagDraft } from './check';
import { contextItems, rankContext } from './context';
import { draft, prepare, type DraftingDeps } from './drafting';

/**
 * A small evaluation of AI drafting with fictional applicants and mocked
 * replies. Every assertion is deterministic: what is selected and sent,
 * what the instructions ask for, and how ApplyKit's own checks judge a
 * compliant, a fabricated and an over-long reply. It says nothing about
 * writing quality, which mocked replies cannot show.
 */

/**
 * Sends a draft request as the panel does: with the digest of the items
 * the user saw, from a preview of the same request.
 */
async function send(
  d: DraftingDeps,
  request: Omit<AiDraftRequest, 'previewed'>,
  signal?: AbortSignal,
) {
  const seen = await prepare(d, request);
  const previewed =
    seen.status === 'ready'
      ? previewDigest(seen.items.filter((i) => request.selected.includes(i.id)))
      : '';
  return draft(d, { ...request, previewed }, signal);
}

const KEY = 'sk-ant-test-not-a-real-key-0000000000';
const NOW = new Date(2026, 9, 18, 12);

function reply(text: string) {
  return vi.fn<Fetch>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          type: 'message',
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 800, output_tokens: 80 },
        }),
        { status: 200 },
      ),
    ),
  );
}

async function setUp(applicant: Applicant): Promise<DraftingDeps> {
  fakeBrowser.reset();
  await browserCredentialStore.save(KEY, false);
  return {
    credentials: browserCredentialStore,
    host: {
      granted: () => Promise.resolve(true),
      request: () => Promise.resolve(true),
      remove: () => Promise.resolve(),
    },
    settings: browserAiSettingsStore,
    usage: browserAiUsageStore,
    now: () => NOW,
    canRemember: true,
    profile: {
      load: () =>
        Promise.resolve({
          status: 'loaded',
          profile: applicant.profile,
          unmatchedCountry: null,
        }),
    },
    skills: {
      load: () =>
        Promise.resolve({
          status: 'loaded',
          content: applicant.saved,
          updatedAt: null,
          damaged: false,
        }),
    },
    approvals: browserApprovalStore,
  };
}

function question(text: string, maxLength: number | null = null) {
  const kind = openQuestionKind(text);
  if (!kind) throw new Error(`Not an open question: ${text}`);
  const request: DraftContextRequest = {
    question: text,
    limits: readLimits(text, maxLength),
    role: '',
    employer: '',
    mode: 'draft',
    original: '',
  };
  return { kind, request };
}

function sentPrompt(fetch: ReturnType<typeof reply>): string {
  const body = JSON.parse(fetch.mock.calls[0]?.[1].body as string) as {
    messages: { content: string }[];
  };
  return body.messages[0]?.content ?? '';
}

/** The texts a reply may use without being flagged. */
function sources(applicant: Applicant, selected: readonly string[], q: string) {
  return [
    q,
    ...contextItems(applicant.profile, applicant.saved)
      .filter((item) => selected.includes(item.id))
      .map((item) => item.text),
  ];
}

describe('1. technical skills in two sentences', () => {
  const applicant = softwareStudent();
  const { kind, request } = question(
    'Describe your programming skills in two sentences.',
  );
  const { selected } = rankContext(
    kind,
    applicant.profile,
    applicant.saved,
    request.question,
  );

  it('shares skills and software projects, not the café job', () => {
    expect(selected).toEqual(['skills', 'project:rota', 'project:notes']);
  });

  it('asks for exactly two sentences and only shared facts', async () => {
    const deps = await setUp(applicant);
    const fetch = reply(
      'I write Python and SQL. I built a Flask rota planner.',
    );

    await send({ ...deps, fetch }, { ...request, selected, approve: true });

    const prompt = sentPrompt(fetch);
    expect(prompt).toContain('<limits>Exactly 2 sentences.');
    expect(prompt).toContain('Python, SQL, Git');
    expect(prompt).not.toContain('Barista');
  });

  it('accepts a supported two-sentence answer', () => {
    const text =
      'I write Python and SQL, and use Git for version control. I built the scheduling logic for a Flask rota planner.';
    expect(limitViolations(text, request.limits)).toEqual([]);
    expect(
      flagDraft(text, sources(applicant, selected, request.question)).unstated,
    ).toEqual([]);
  });

  it('flags invented technologies and metrics', () => {
    const text =
      'I write Python and Kubernetes services. I cut response times by 40%.';
    expect(
      flagDraft(text, sources(applicant, selected, request.question)).unstated,
    ).toEqual(['40%', 'Kubernetes']);
  });

  it('rejects three sentences as non-compliant', () => {
    expect(
      limitViolations('I write Python. I use SQL. I use Git.', request.limits),
    ).toEqual([{ unit: 'sentences', bound: { min: 2, max: 2 }, actual: 3 }]);
  });
});

describe('2. a project with a word limit', () => {
  const applicant = softwareStudent();
  const { kind, request } = question(
    'Tell us about a project you worked on (max 60 words)',
  );
  const { selected } = rankContext(
    kind,
    applicant.profile,
    applicant.saved,
    request.question,
  );

  it('chooses the project with the most to say, with its details', async () => {
    expect(selected).toEqual(['project:rota']);
    const deps = await setUp(applicant);
    const fetch = reply('I built the scheduling logic for a rota planner.');

    await send({ ...deps, fetch }, { ...request, selected, approve: true });

    const prompt = sentPrompt(fetch);
    expect(prompt).toContain('My part: Built the scheduling logic');
    expect(prompt).toContain('Challenge: Overlapping shifts');
    expect(prompt).toContain('At most 60 words.');
  });

  it('accepts an answer within the limit and rejects one over it', () => {
    const within =
      'I built the scheduling logic and shift export for a Flask rota planner for a small café. Overlapping shifts were being double-booked, so I fixed how shifts were checked. The café used it for a term instead of a spreadsheet.';
    expect(limitViolations(within, request.limits)).toEqual([]);
    const over = Array.from({ length: 61 }, () => 'word').join(' ');
    expect(limitViolations(over, request.limits)[0]?.unit).toBe('words');
  });
});

describe('3. company motivation with sparse context', () => {
  const applicant = sparseApplicant();
  const { kind, request } = question(
    'Why do you want to work at Example Fernhill Analytics?',
  );

  it('selects nothing unrelated, so nothing is sent by default', async () => {
    expect(
      rankContext(kind, applicant.profile, applicant.saved, request.question)
        .selected,
    ).toEqual([]);
    const deps = await setUp(applicant);
    const fetch = reply('unused');

    expect(
      await send(
        { ...deps, fetch },
        { ...request, selected: [], approve: true },
      ),
    ).toMatchObject({ status: 'failed', failure: 'no-context' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports insufficient context instead of inventing interest', async () => {
    const deps = await setUp(applicant);
    const fetch = reply('INSUFFICIENT_CONTEXT');

    const result = await send(
      { ...deps, fetch },
      { ...request, selected: ['job:shop'], approve: true },
    );

    expect(sentPrompt(fetch)).toContain(
      'Claim no knowledge of the employer beyond its name.',
    );
    expect(result).toMatchObject({ status: 'failed', failure: 'insufficient' });
  });
});

describe('4. a behavioural question without a real story', () => {
  const applicant = softwareStudent();
  const withoutChallenge: Applicant = {
    ...applicant,
    saved: {
      ...applicant.saved,
      projects: applicant.saved.projects.map((p) => ({ ...p, challenge: '' })),
    },
  };
  const { kind, request } = question('Describe a problem you solved.');

  it('selects a recorded challenge when there is one, and nothing when there is not', () => {
    expect(
      rankContext(kind, applicant.profile, applicant.saved, request.question)
        .selected,
    ).toEqual(['project:rota']);
    expect(
      rankContext(
        kind,
        withoutChallenge.profile,
        withoutChallenge.saved,
        request.question,
      ).selected,
    ).toEqual([]);
  });

  it('tells the model never to invent a challenge', async () => {
    const deps = await setUp(withoutChallenge);
    const fetch = reply('INSUFFICIENT_CONTEXT');

    const result = await send(
      { ...deps, fetch },
      { ...request, selected: ['project:notes'], approve: true },
    );

    expect(sentPrompt(fetch)).toContain('Never invent one.');
    expect(result).toMatchObject({ failure: 'insufficient' });
  });
});

describe('5. improving a rough draft', () => {
  const applicant = softwareStudent();
  const original =
    'i built a app for the cafe rota, it worked good and they used it';
  const { request } = question(
    'Tell us about a project you worked on in one or two sentences.',
  );
  const improving = { ...request, mode: 'improve' as const, original };

  it('sends the applicant’s own text and asks for no new claims', async () => {
    const deps = await setUp(applicant);
    const fetch = reply(
      'I built an app for the café rota, and the café used it.',
    );

    await send(
      { ...deps, fetch },
      { ...improving, selected: [], approve: true },
    );

    const prompt = sentPrompt(fetch);
    expect(prompt).toContain(`<applicant_draft>${JSON.stringify(original)}`);
    expect(prompt).toContain('Add no new claims');
    expect(prompt).toContain('<applicant_facts>\n[]');
  });

  it('accepts a faithful revision and flags an embellished one', () => {
    const faithful = 'I built an app for the café rota, and it worked well.';
    expect(limitViolations(faithful, request.limits)).toEqual([]);
    expect(flagDraft(faithful, [request.question, original]).unstated).toEqual(
      [],
    );

    const embellished =
      'I built an app for the café rota used by 500 staff across Example Group.';
    expect(
      flagDraft(embellished, [request.question, original]).unstated,
    ).toEqual(['500', 'Example', 'Group']);
  });

  it('keeps the requirement that holds without limits', () => {
    expect(
      question('Tell us about a project you worked on.').request.limits,
    ).toEqual(NO_LIMITS);
  });
});
