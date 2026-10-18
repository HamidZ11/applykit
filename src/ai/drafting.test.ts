import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browserCredentialStore } from '@/storage/ai-credential';
import { browserApprovalStore } from '@/storage/ai-approvals';
import {
  browserAiSettingsStore,
  browserAiUsageStore,
} from '@/storage/ai-settings';
import { browserSkillsStore } from '@/storage/skills-store';
import { savedDiversity } from '@/test/diversity-fixtures';
import { employmentRecords, fullProfile } from '@/test/autofill-fixtures';
import { savedSkills } from '@/test/skills-fixtures';
import type { DraftContextRequest } from '@/messages';
import { approvalFingerprint, prepare, type DraftingDeps } from './drafting';
import type { HostAccess } from './host-access';

const KEY = 'sk-ant-test-not-a-real-key-0000000000';
const NOW = new Date(2026, 9, 18, 12);

const QUESTION: DraftContextRequest = {
  question: 'Describe your programming skills in two sentences.',
  limits: { words: null, characters: null, sentences: 2 },
  role: '',
  employer: '',
};

const granted: HostAccess = {
  granted: () => Promise.resolve(true),
  request: () => Promise.resolve(true),
  remove: () => Promise.resolve(),
};

function deps(over: Partial<DraftingDeps> = {}): DraftingDeps {
  const profile = fullProfile();
  profile.employment = employmentRecords();
  return {
    credentials: browserCredentialStore,
    host: granted,
    settings: browserAiSettingsStore,
    usage: browserAiUsageStore,
    now: () => NOW,
    profile: {
      load: () =>
        Promise.resolve({
          status: 'loaded',
          profile,
          unmatchedCountry: null,
        }),
    },
    skills: browserSkillsStore,
    approvals: browserApprovalStore,
    ...over,
  };
}

beforeEach(async () => {
  fakeBrowser.reset();
  await browserCredentialStore.save(KEY, false);
  await browserSkillsStore.save(savedSkills(), null, NOW);
  // Saved, and must never be offered.
  await fakeBrowser.storage.local.set({
    diversityPreferences: {
      schemaVersion: 1,
      preferences: savedDiversity(),
      updatedAt: NOW.toISOString(),
    },
  });
});

describe('prepare', () => {
  it('offers saved items and chooses what the question needs', async () => {
    const result = await prepare(deps(), QUESTION);

    expect(result).toMatchObject({
      status: 'ready',
      kind: 'skills',
      selected: ['skills', 'job:testing'],
      approved: false,
      model: 'Fast',
    });
    const shared = JSON.stringify(result);
    expect(shared).toContain('Python, TypeScript, PostgreSQL');
    expect(shared).not.toContain(KEY);
    expect(shared).not.toMatch(/non-binary|other-mixed|prefer-not-to-say/);
    expect(shared).not.toContain(fullProfile().personal.email);
  });

  it('offers nothing without a key or the permission', async () => {
    await browserCredentialStore.remove();
    expect(await prepare(deps(), QUESTION)).toEqual({ status: 'unavailable' });

    await browserCredentialStore.save(KEY, false);
    expect(
      await prepare(
        deps({ host: { ...granted, granted: () => Promise.resolve(false) } }),
        QUESTION,
      ),
    ).toEqual({ status: 'unavailable' });
  });

  it('checks the question again', async () => {
    for (const question of [
      'Do you have the right to work in the UK? Please explain.',
      'Describe any health conditions we should know about.',
      'Email address',
    ]) {
      expect(await prepare(deps(), { ...QUESTION, question })).toEqual({
        status: 'not-a-question',
      });
    }
  });

  it('remembers an approval of exactly the same request', async () => {
    const first = await prepare(deps(), QUESTION);
    if (first.status !== 'ready') throw new Error('not ready');
    const items = first.items.filter((i) => first.selected.includes(i.id));
    await browserApprovalStore.add(
      await approvalFingerprint(
        'fast',
        QUESTION,
        items.map((i) => ({ ...i, group: 'skills' as const })),
      ),
    );

    expect(await prepare(deps(), QUESTION)).toMatchObject({ approved: true });
    expect(
      await prepare(deps(), { ...QUESTION, question: `${QUESTION.question} ` }),
    ).toMatchObject({ approved: false });
    await browserAiSettingsStore.save({ model: 'quality', dailyLimit: 50 });
    expect(await prepare(deps(), QUESTION)).toMatchObject({
      approved: false,
      model: 'Higher quality',
    });
  });
});

describe('approvalFingerprint', () => {
  const item = {
    id: 'skills',
    group: 'skills' as const,
    label: 'Skills',
    text: 'Python',
  };

  it('changes with anything that would be sent', async () => {
    const base = await approvalFingerprint('fast', QUESTION, [item]);

    for (const other of [
      await approvalFingerprint('quality', QUESTION, [item]),
      await approvalFingerprint('fast', { ...QUESTION, role: 'Analyst' }, [
        item,
      ]),
      await approvalFingerprint('fast', QUESTION, [{ ...item, text: 'Go' }]),
      await approvalFingerprint(
        'fast',
        { ...QUESTION, limits: { ...QUESTION.limits, words: 50 } },
        [item],
      ),
    ]) {
      expect(other).not.toBe(base);
    }
    expect(await approvalFingerprint('fast', QUESTION, [item])).toBe(base);
  });
});
