import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiversityPreferences } from '@/domain/diversity';
import { resolveDiversity } from '@/storage/diversity-source';
import { savedAnswers } from '@/test/answer-fixtures';
import { educationRecords, fullProfile } from '@/test/autofill-fixtures';
import { savedDiversity } from '@/test/diversity-fixtures';
import { loadFixture, runFixtureScripts } from '@/test/load-fixture';
import { withDiversityChoices } from './diversity';
import type { AutofillValues } from './fields';
import { afterPageScripts, chooseCustomOption, fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { planFill, type FieldReport } from './report';
import {
  chooseSuggestedOption,
  confirmAnswer,
  confirmCustomChoice,
  type DiversityRequest,
} from './resolve';
import { scanFields } from './scan';

/**
 * Custom dropdowns on fixtures/custom-dropdowns.html (ADR 0021), with the
 * fixture's own widget script running: chosen only when the user asks,
 * only in the supported patterns, only from the list the dropdown names,
 * and reported as filled only when the page verifiably kept the choice.
 */

const NOW = new Date('2026-10-19T12:00:00Z');
const ALL = [
  'gender',
  'ethnicity',
  'disability',
  'religion',
  'sexualOrientation',
] as const;
const FAST = { step: afterPageScripts, steps: 10 };

function values(
  preferences: DiversityPreferences = savedDiversity(),
  answers = savedAnswers(),
) {
  const profile = fullProfile();
  profile.education = educationRecords();
  return autofillValuesFrom(profile, answers, {
    reuse: preferences.reuse,
    saved: preferences.reuse ? [...ALL] : [],
  });
}

function resolver(
  preferences: DiversityPreferences = savedDiversity(),
): DiversityRequest {
  const store = {
    load: () =>
      Promise.resolve({
        status: 'loaded' as const,
        preferences,
        updatedAt: '2026-10-18T12:00:00.000Z',
        damaged: [],
      }),
  };
  return (requests) => resolveDiversity(store, requests);
}

function plan(v: AutofillValues = values()): FieldReport[] {
  return planFill(scanFields(document), v, NOW);
}

function byId(reports: FieldReport[], id: string): FieldReport {
  const found = reports.find((r) => r.field.element.id === id);
  if (!found) throw new Error(`No field #${id}`);
  return found;
}

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No #${id}`);
  return found;
}

/** The widget's displayed answer, without its arrow. */
const shows = (id: string) =>
  element(id).querySelector('.value')?.textContent.trim();

/** Changes what a widget displays, as its page script would. */
function display(id: string, text: string): void {
  const value = element(id).querySelector('.value');
  if (!value) throw new Error(`No value in #${id}`);
  value.textContent = text;
}
const status = () => element('status').textContent;

/** "Choose this option" on one field, as the panel runs it. */
async function choose(
  id: string,
  {
    v = values(),
    request = resolver(),
    previewed,
  }: {
    v?: AutofillValues;
    request?: DiversityRequest;
    previewed?: FieldReport;
  } = {},
) {
  const fields = scanFields(document);
  const report = previewed ?? byId(planFill(fields, v, NOW), id);
  return chooseSuggestedOption(fields, v, report, request, {
    now: NOW,
    timing: FAST,
  });
}

async function chosen(id: string, options?: Parameters<typeof choose>[1]) {
  const result = await choose(id, options);
  if (!result.ok) throw new Error(result.message);
  return result.report;
}

/** Counts plain clicks reaching each option and trigger. */
function recordClicks(): Map<string, number> {
  const clicks = new Map<string, number>();
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element;
      const key =
        target.closest('[role="option"]')?.textContent.trim() ??
        target.closest('[id]')?.id ??
        '?';
      const owner = target.closest('[role="listbox"]')?.id ?? '';
      clicks.set(`${owner}:${key}`, (clicks.get(`${owner}:${key}`) ?? 0) + 1);
    },
    true,
  );
  return clicks;
}

beforeEach(() => {
  loadFixture('custom-dropdowns.html');
  runFixtureScripts(document);
});

describe('custom dropdowns on an application', () => {
  it('suggests the supported dropdowns and guides the rest', () => {
    const statuses = Object.fromEntries(
      plan().map((r) => [r.field.element.id, r.status]),
    );

    expect(statuses).toMatchObject({
      country: 'suggest',
      'calling-code': 'suggest',
      arrangement: 'suggest',
      'relocate-abroad': 'suggest',
      gender: 'suggest',
      'relocate-uk': 'keep',
      licence: 'unsupported',
      'first-year': 'unsupported',
      'later-years': 'unsupported',
      site: 'unsupported',
      considered: 'unsupported',
      'arrangement-search': 'unsupported',
      campus: 'unsupported',
      rtw: 'manual',
      sponsor: 'manual',
      convictions: 'manual',
      adjustments: 'manual',
      consent: 'manual',
    });
  });

  it('shows the saved value, never a monitoring answer', () => {
    const reports = plan();

    expect(byId(reports, 'country')).toMatchObject({
      value: 'United Kingdom',
      fillValue: null,
    });
    expect(byId(reports, 'gender')).toMatchObject({
      status: 'suggest',
      value: null,
      fillValue: null,
      note: 'From your saved diversity preferences.',
    });
    expect(byId(reports, 'relocate-uk')).toMatchObject({
      status: 'keep',
      value: 'No',
    });
  });

  it('lists only the application, never hidden, disabled or other forms', () => {
    const ids = scanFields(document).map((f) => f.element.id);

    for (const id of [
      'alerts-country',
      'hidden-arrangement',
      'closed',
      'region',
      'country-list',
      'shared-list',
    ]) {
      expect(ids, id).not.toContain(id);
    }
    expect(ids).toContain('country');
  });

  it('never operates a dropdown during Autofill', async () => {
    const clicks = recordClicks();
    const fields = scanFields(document);

    const outcomes = await fillFields(
      await withDiversityChoices(
        planFill(fields, values(), NOW),
        resolver(),
        new Set(fields.map((f) => f.element)),
      ),
    );

    // The native fields around them are filled (positive control).
    expect(byId(outcomes, 'email').status).toBe('filled');
    expect(
      outcomes.filter((r) => r.field.kind === 'custom').map((r) => r.status),
    ).not.toContain('filled');
    expect([...clicks.keys()]).toEqual([]);
    expect(shows('country')).toBe('Select a country');
    expect(status()).toContain('changes: 0');
  });

  it('never chooses a saved answer through "Use this answer"', () => {
    const fields = scanFields(document);
    const report = byId(planFill(fields, values(), NOW), 'arrangement');

    expect(confirmAnswer(fields, values(), report, NOW).ok).toBe(false);
  });
});

describe('choosing on request', () => {
  it('chooses in a select-only combobox whose list stays in the page', async () => {
    const clicks = recordClicks();

    const report = await chosen('country');

    expect(report).toMatchObject({
      status: 'filled',
      value: 'United Kingdom',
      chosen: true,
    });
    expect(shows('country')).toBe('United Kingdom');
    expect(element('country').getAttribute('aria-expanded')).toBe('false');
    expect(
      [
        ...element('country-list').querySelectorAll('[aria-selected="true"]'),
      ].map((o) => o.textContent),
    ).toEqual(['United Kingdom']);
    // One click on the trigger, one on the option, nothing else.
    expect(Object.fromEntries(clicks)).toEqual({
      ':country': 1,
      'country-list:United Kingdom': 1,
    });
    expect(status()).toContain('submitted: 0 · changes: 1');
  });

  it('chooses in a popup button whose list exists only while open', async () => {
    const report = await chosen('calling-code');

    expect(report).toMatchObject({
      status: 'filled',
      value: '+44 United Kingdom',
    });
    expect(shows('calling-code')).toBe('+44 United Kingdom');
    expect(document.getElementById('calling-code-list')).toBeNull();
  });

  it('chooses in a list portalled to the end of the page', async () => {
    const report = await chosen('arrangement');

    expect(report.status).toBe('filled');
    expect(shows('arrangement')).toBe('Hybrid');
    expect(element('arrangement').hasAttribute('data-placeholder')).toBe(false);
    // The library's hidden native list followed, for the form.
    expect(
      document.querySelector<HTMLSelectElement>('select[name="arrangement"]')
        ?.value,
    ).toBe('Hybrid');
    expect(document.querySelector('[data-portal]')).toBeNull();
  });

  it('chooses only in the right one of three Yes/No dropdowns', async () => {
    const clicks = recordClicks();

    const report = await chosen('relocate-abroad');

    expect(report.status).toBe('filled');
    expect(shows('relocate-abroad')).toBe('No');
    expect(shows('licence')).toBe('Select…');
    expect(shows('relocate-uk')).toBe('No');
    expect([...clicks.keys()].sort()).toEqual([
      ':relocate-abroad',
      'relocate-abroad-list:No',
    ]);
  });

  it('chooses a monitoring answer only with reuse on, never showing it', async () => {
    const report = await chosen('gender');

    expect(shows('gender')).toBe('Non-binary');
    expect(report).toMatchObject({
      status: 'filled',
      value: null,
      fillValue: null,
    });
    expect(JSON.stringify({ ...report, field: null })).not.toMatch(
      /non.?binary/i,
    );
  });

  it('leaves a monitoring question when reuse is off', async () => {
    const off = { reuse: false, answers: savedDiversity().answers };
    const request = vi.fn(resolver(off));

    expect(byId(plan(values(off)), 'gender')).toMatchObject({
      status: 'manual',
      reason: expect.stringContaining('Reuse') as string,
    });
    const result = await choose('gender', {
      v: values(off),
      request,
      previewed: byId(plan(), 'gender'),
    });

    expect(result.ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(shows('gender')).toBe('Select…');
  });

  it('leaves a dropdown that already shows an answer', async () => {
    const previewed = byId(plan(), 'relocate-abroad');
    display('relocate-abroad', 'Yes');

    const result = await choose('relocate-abroad', { previewed });

    expect(result).toEqual({
      ok: false,
      message: 'You chose an answer here, so ApplyKit left it as it is.',
    });
    expect(element('relocate-abroad').getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('reveals a dependent question without answering it', async () => {
    await chosen('country');

    const region = byId(plan(), 'region');
    expect(region.status).toBe('unsupported');
    expect(shows('region')).toBe('Select a region');
  });
});

describe('failing safely', () => {
  it('chooses nothing when the matching option is disabled', async () => {
    const clicks = recordClicks();

    const report = await chosen('notice');

    expect(report.status).toBe('rejected');
    expect(report.reason).toContain('chose nothing');
    expect(shows('notice')).toBe('Select…');
    // ApplyKit closed the list it opened.
    expect(element('notice').getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('notice-list')).toBeNull();
    expect([...clicks.keys()].filter((key) => key.includes('list:'))).toEqual(
      [],
    );
  });

  it('chooses the same option once it is enabled (positive control)', async () => {
    element('notice').dataset.options =
      '2 weeks|4 weeks|8 weeks|12 weeks or more';

    const report = await chosen('notice');

    expect(report).toMatchObject({ status: 'filled', value: '4 weeks' });
  });

  it('chooses nothing when two options read the same', async () => {
    const report = await chosen('graduation');

    expect(report.status).toBe('rejected');
    expect(shows('graduation')).toBe('Select…');
  });

  it('chooses the year once it is offered once (positive control)', async () => {
    element('graduation').dataset.options = '2026|2027|2028 or later';

    expect(await chosen('graduation')).toMatchObject({
      status: 'filled',
      value: '2027',
    });
  });

  it('chooses nothing in a list offering only a placeholder', async () => {
    const report = await chosen('degree');

    expect(report.status).toBe('rejected');
    expect(shows('degree')).toBe('Please select');
  });

  it('stops when the options change after the list opens', async () => {
    const clicks = recordClicks();

    const report = await chosen('start');

    expect(report).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('choices changed') as string,
    });
    expect([...clicks.keys()].filter((key) => key.includes('list:'))).toEqual(
      [],
    );
    expect(element('start').getAttribute('aria-expanded')).toBe('false');
  });

  it('reports a dropdown that opens only on a mouse press as manual', async () => {
    const report = await chosen('salary');

    expect(report).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('needs manual selection') as string,
    });
    expect(element('salary-list').hidden).toBe(true);
    expect(shows('salary')).toBe('Select a band');
  });

  it('stops when the page replaces the trigger', async () => {
    const report = await chosen('notice-weeks');

    expect(report.status).toBe('rejected');
    expect(report.reason).toContain('press Escape');
    expect(
      element('notice-weeks-list').querySelectorAll('[aria-selected="true"]'),
    ).toHaveLength(0);
  });

  it('never clicks an option that is a link', async () => {
    const report = await chosen('office');

    expect(report.status).toBe('rejected');
    expect(status()).toContain('link clicks: 0');
    expect(shows('office')).toBe('Select…');
  });

  it('blocks a form submission the choice sets off, and says so', async () => {
    const report = await chosen('pattern');

    expect(report).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('tried to submit') as string,
    });
    expect(status()).toContain('submitted: 0');
  });

  it('removes its guard afterwards (positive control)', async () => {
    await chosen('pattern');

    (element('application') as HTMLFormElement).requestSubmit();

    expect(status()).toContain('submitted: 1');
  });

  it('never operates sensitive, consent or guided dropdowns', async () => {
    const clicks = recordClicks();
    const reports = plan();

    for (const id of [
      'rtw',
      'sponsor',
      'convictions',
      'adjustments',
      'consent',
      'first-year',
      'site',
      'considered',
      'campus',
    ]) {
      const result = await choose(id, { previewed: byId(reports, id) });
      expect(result.ok, id).toBe(false);
    }
    expect([...clicks.keys()]).toEqual([]);
  });
});

describe('the fixture’s own widgets, without ApplyKit', () => {
  it('opens the portalled list under its trigger, where people see it', () => {
    const trigger = element('arrangement');
    // jsdom has no layout: give the trigger a place on the page.
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 200,
      top: 200,
      left: 100,
      bottom: 240,
      right: 400,
      width: 300,
      height: 40,
      toJSON: () => ({}),
    });

    trigger.click();

    const holder = document.querySelector<HTMLElement>('[data-portal]');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(holder?.querySelector('#arrangement-content')).not.toBeNull();
    expect(holder?.style.top).toBe('240px');
    expect(holder?.style.left).toBe('100px');
    expect(holder?.style.width).toBe('300px');
  });

  it('chooses an option clicked by a person', () => {
    element('arrangement').click();
    [...document.querySelectorAll<HTMLElement>('[data-portal] [role="option"]')]
      .find((option) => option.textContent === 'Hybrid')
      ?.click();

    expect(shows('arrangement')).toBe('Hybrid');
    expect(document.querySelector('[data-portal]')).toBeNull();
    expect(status()).toContain('changes: 1');
  });
});

describe('stale questions and answers', () => {
  it('rejects a changed question before touching the page', async () => {
    const clicks = recordClicks();
    const previewed = byId(plan(), 'relocate-abroad');
    element('relocate-abroad-label').textContent =
      'Would you consider relocating to our Belfast office?';

    const result = await choose('relocate-abroad', { previewed });

    expect(result.ok).toBe(false);
    expect([...clicks.keys()]).toEqual([]);
  });

  it('rejects a saved answer changed since it was shown', async () => {
    const previewed = byId(plan(), 'arrangement');
    const changed = values(savedDiversity(), {
      ...savedAnswers(),
      workArrangement: 'remote',
    });

    const result = await choose('arrangement', { v: changed, previewed });

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('has changed') as string,
    });
    expect(shows('arrangement')).toBe('Choose an arrangement');
  });

  it('rejects a trigger replaced since it was shown', async () => {
    const previewed = byId(plan(), 'country');
    const old = element('country');
    old.replaceWith(old.cloneNode(true));

    expect((await choose('country', { previewed })).ok).toBe(false);
  });

  it('rejects a list now named by two controls', () => {
    const previewed = byId(plan(), 'country');
    element('licence').setAttribute('aria-controls', 'country-list');

    const fields = scanFields(document);
    expect(confirmCustomChoice(fields, values(), previewed, NOW).ok).toBe(
      false,
    );
  });

  it('stops when the list closes while the answer is worked out', async () => {
    const clicks = recordClicks();
    const request: DiversityRequest = async (requests) => {
      // The user closes the list meanwhile.
      element('gender').click();
      return resolver()(requests);
    };

    const report = await chosen('gender', { request });

    expect(report.status).toBe('rejected');
    expect([...clicks.keys()].filter((key) => key.includes('list:'))).toEqual(
      [],
    );
    expect(shows('gender')).toBe('Select…');
  });

  it('gives up on a slow answer and closes the list', async () => {
    const trigger = element('country');

    const outcome = await chooseCustomOption(
      trigger,
      () => new Promise(() => undefined),
      { ...FAST, pickTimeout: 20 },
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('in time') as string,
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(shows('country')).toBe('Select a country');
  });

  it('closes the list when working out the option fails', async () => {
    const trigger = element('country');

    const outcome = await chooseCustomOption(
      trigger,
      () => Promise.reject(new Error('Background unavailable')),
      FAST,
    );

    expect(outcome.status).toBe('rejected');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(element('country-list').hidden).toBe(true);
  });

  it('keeps its guard while closing a list, for what closing sets off', async () => {
    // A page that submits shortly after its list closes (the widget's own
    // listener has already run, so the click closed it).
    element('notice').addEventListener('click', () => {
      if (element('notice').getAttribute('aria-expanded') !== 'false') return;
      setTimeout(() => {
        (element('application') as HTMLFormElement).requestSubmit();
      }, 0);
    });

    const report = await chosen('notice');
    await afterPageScripts();

    expect(report.status).toBe('rejected');
    expect(status()).toContain('submitted: 0');
  });

  it('keeps an answer chosen while ApplyKit works out its own', async () => {
    const clicks = recordClicks();
    const request: DiversityRequest = async (requests) => {
      display('gender', 'Woman');
      return resolver()(requests);
    };

    const report = await chosen('gender', { request });

    expect(report.status).toBe('rejected');
    expect(shows('gender')).toBe('Woman');
    expect([...clicks.keys()].filter((key) => key.includes('list:'))).toEqual(
      [],
    );
  });

  it('reports failure when the page does not keep the choice', async () => {
    // A page whose script puts the placeholder back after any choice.
    element('country-list').addEventListener('click', () => {
      setTimeout(() => {
        display('country', 'Select a country');
      }, 0);
    });

    const report = await chosen('country');

    expect(report).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('could not verify') as string,
    });
  });
});
