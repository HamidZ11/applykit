import { describe, expect, it } from 'vitest';
import { sampleValues } from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import type { AutofillValues } from './fields';
import {
  attentionQueue,
  planFill,
  summarise,
  type FieldReport,
} from './report';
import { scanFields } from './scan';

function plan(values: AutofillValues | null = sampleValues()): FieldReport[] {
  return planFill(scanFields(document), values);
}

function byId(reports: FieldReport[], id: string): FieldReport {
  const report = reports.find((r) => r.field.element.id === id);
  if (!report) throw new Error(`No report for #${id}`);
  return report;
}

describe('planFill', () => {
  it('plans every applicant field on a full form from the saved profile', () => {
    loadFixture('full-application.html');

    const planned = plan()
      .filter((r) => r.status === 'fill')
      .map((r) => [r.field.element.id, r.target, r.value]);

    expect(planned).toEqual([
      ['full-name', 'fullName', 'Alex Sample'],
      ['preferred', 'preferredName', 'Al'],
      ['email', 'email', 'alex.sample@example.com'],
      ['email-confirm', 'email', 'alex.sample@example.com'],
      ['phone', 'phone', '+44 20 7946 0000'],
      ['address1', 'addressLine1', '1 Example Street'],
      ['address2', 'addressLine2', 'Flat 2'],
      ['city', 'city', 'London'],
      ['county', 'region', 'Greater London'],
      ['postcode', 'postcode', 'N1 9GU'],
      ['country', 'country', 'United Kingdom'],
      ['linkedin', 'linkedin', 'https://www.linkedin.com/in/alex-sample'],
      ['github', 'github', 'https://github.com/alex-sample'],
      ['website', 'portfolio', 'https://alex-sample.example.com'],
    ]);
  });

  it('records the evidence for each planned value', () => {
    loadFixture('full-application.html');

    expect(byId(plan(), 'full-name').evidence).toEqual([
      { signal: 'autocomplete', text: 'name' },
      { signal: 'label', text: 'Full name *' },
      { signal: 'name', text: 'applicant[full_name]' },
      { signal: 'id', text: 'full-name' },
    ]);
  });

  it('gives a reason for every field it leaves to the user', () => {
    loadFixture('full-application.html');

    const left = plan().filter((r) => r.status !== 'fill');

    expect(left.length).toBeGreaterThan(0);
    for (const report of left) {
      expect(report.reason, report.field.label).toBeTruthy();
      expect(report.fillValue).toBeNull();
    }
    expect(byId(left, 'ref-name').status).toBe('other-person');
    expect(byId(left, 'salary').status).toBe('manual');
    expect(byId(left, 'captcha').status).toBe('manual');
  });

  it('plans nothing without a confirmed profile, and says why', () => {
    loadFixture('full-application.html');

    const reports = plan(null);

    expect(reports.some((r) => r.status === 'fill')).toBe(false);
    expect(byId(reports, 'email')).toMatchObject({
      status: 'no-profile',
      target: 'email',
      value: null,
      reason: 'Set up your profile so ApplyKit can fill this.',
    });
  });

  it('keeps values the user already entered', () => {
    loadHtml(
      '<label>Email <input id="email" value="typed@example.org"></label>',
    );

    expect(byId(plan(), 'email')).toMatchObject({
      status: 'keep',
      value: 'typed@example.org',
      fillValue: null,
    });
  });

  it('reports recognised fields the profile has no value for', () => {
    loadHtml('<label>GitHub <input id="gh"></label>');
    const values = sampleValues();
    values.text.github = '';

    expect(byId(plan(values), 'gh')).toMatchObject({
      status: 'no-value',
      target: 'github',
    });
  });

  it('does not fill a value longer than the field allows', () => {
    loadHtml('<label>Postcode <input id="pc" maxlength="4"></label>');

    expect(byId(plan(), 'pc')).toMatchObject({
      status: 'manual',
      reason: 'Your saved value is longer than this field allows.',
    });
  });

  it('explains conflicting signals', () => {
    loadHtml('<label>Email <input id="x" name="phone"></label>');

    expect(byId(plan(), 'x')).toMatchObject({
      status: 'conflict',
      reason:
        'The page’s labels disagree (email address or phone number), so ApplyKit leaves it to you.',
    });
  });
});

describe('preferred name', () => {
  function preferredField(values: AutofillValues): FieldReport {
    loadHtml('<label>Preferred first name <input id="pref"></label>');
    return byId(plan(values), 'pref');
  }

  it('fills a saved preferred name', () => {
    expect(preferredField(sampleValues())).toMatchObject({
      status: 'fill',
      fillValue: 'Al',
      note: null,
    });
  });

  it('leaves the field when no preferred name is saved', () => {
    const values = sampleValues();
    values.text.preferredName = '';

    expect(preferredField(values)).toMatchObject({
      status: 'no-value',
      fillValue: null,
      reason: expect.stringContaining(
        'choose to use your first name',
      ) as string,
    });
  });

  it('says when the first name is used because the user chose it', () => {
    const values = sampleValues();
    values.text.preferredName = 'Alex';
    values.preferredNameIsFirstName = true;

    expect(preferredField(values)).toMatchObject({
      status: 'fill',
      fillValue: 'Alex',
      note: 'Your first name, as you chose for preferred-name fields.',
    });
  });
});

describe('country', () => {
  /** A country field; selects get the usual empty first option. */
  function country(html: string, values = sampleValues()): FieldReport {
    loadHtml(
      `<label>Country ${html.replace(
        /<select([^>]*)>/,
        '<select$1><option value="">Choose…</option>',
      )}</label>`,
    );
    const [report] = plan(values);
    if (!report) throw new Error('No report');
    return report;
  }

  it('chooses the select option whose value is the country code', () => {
    expect(
      country(`<select id="c">
        <option value="">Choose</option>
        <option value="FR">France</option>
        <option value="GB">United Kingdom</option>
      </select>`),
    ).toMatchObject({
      status: 'fill',
      fillValue: 'GB',
      value: 'United Kingdom',
    });
  });

  it('matches option text by name or a recognised alias', () => {
    expect(
      country(
        `<select><option value="1">Ireland</option><option value="2">UK</option></select>`,
      ),
    ).toMatchObject({ status: 'fill', fillValue: '2', value: 'UK' });
    expect(
      country(`<select><option value="gbr">Great Britain</option></select>`),
    ).toMatchObject({ status: 'fill', fillValue: 'gbr' });
  });

  it('never approximates when no option matches exactly', () => {
    expect(
      country(`<select>
        <option value="UKR">Ukraine</option>
        <option value="UM">United States Minor Outlying Islands</option>
      </select>`),
    ).toMatchObject({
      status: 'no-option',
      fillValue: null,
      reason: 'None of the options matches United Kingdom.',
    });
  });

  it('leaves the choice to the user when several options match', () => {
    expect(
      country(`<select>
        <option value="GB">United Kingdom</option>
        <option value="UK">UK (legacy)</option>
        <option value="uk">UK</option>
      </select>`),
    ).toMatchObject({ status: 'no-option' });
  });

  it('leaves a select that starts on a real option to the user', () => {
    loadHtml(
      '<label>Country <select><option value="IE">Ireland</option><option value="GB">United Kingdom</option></select></label>',
    );

    expect(plan()[0]).toMatchObject({ status: 'manual', fillValue: null });
  });

  it('keeps an option the page or the user explicitly selected', () => {
    loadHtml(
      '<label>Country <select><option value="IE">Ireland</option><option value="FR" selected>France</option></select></label>',
    );

    expect(plan()[0]).toMatchObject({ status: 'keep', value: 'France' });
  });

  it('ignores disabled options', () => {
    expect(
      country(
        `<select><option value="GB" disabled>United Kingdom</option></select>`,
      ),
    ).toMatchObject({ status: 'no-option' });
  });

  it('uses the representation a text field asks for', () => {
    expect(country('<input>')).toMatchObject({ fillValue: 'United Kingdom' });
    expect(country('<input autocomplete="country">')).toMatchObject({
      fillValue: 'GB',
    });
    expect(country('<input maxlength="2">')).toMatchObject({ fillValue: 'GB' });
    expect(country('<input maxlength="3">')).toMatchObject({
      fillValue: 'GBR',
    });
  });

  it('reports a missing country instead of guessing one', () => {
    const values = sampleValues();
    values.country = null;

    expect(country('<input>', values)).toMatchObject({ status: 'no-value' });
  });
});

describe('summarise and attentionQueue', () => {
  function report(
    status: FieldReport['status'],
    required = false,
    id: string = status,
  ): FieldReport {
    const element = document.createElement('input');
    element.id = id;
    return {
      field: {
        element,
        label: id,
        section: null,
        kind: 'text',
        required,
        support: { status: 'unrecognised' },
      },
      status,
      target: null,
      value: null,
      fillValue: null,
      reason: null,
      note: null,
      evidence: [],
    };
  }

  it('counts filled, kept, failed and remaining fields', () => {
    const reports = [
      report('filled'),
      report('reformatted'),
      report('kept'),
      report('rejected', true),
      report('detached'),
      report('manual', true),
      report('unsupported'),
    ];

    expect(summarise(reports)).toEqual({
      filled: 2,
      reformatted: 1,
      kept: 1,
      failed: 2,
      needsYou: 4,
      requiredNeedsYou: 2,
      total: 7,
    });
  });

  it('puts failed fills first, then required fields, then the rest', () => {
    const queue = attentionQueue([
      report('unsupported', false, 'a'),
      report('manual', true, 'b'),
      report('filled', false, 'c'),
      report('rejected', false, 'd'),
    ]);

    expect(queue.map((r) => r.field.element.id)).toEqual(['d', 'b', 'a']);
  });
});

describe('select placeholders', () => {
  it('fills a select whose placeholder is a disabled option', () => {
    loadHtml(`<label>Country <select>
      <option selected disabled>Select a country</option>
      <option value="GB">United Kingdom</option>
    </select></label>`);

    expect(plan()[0]).toMatchObject({ status: 'fill', fillValue: 'GB' });
  });

  it('fills a select whose placeholder only reads like one', () => {
    loadHtml(`<label>Country <select>
      <option value="-1">Choose…</option>
      <option value="GB">United Kingdom</option>
    </select></label>`);

    expect(plan()[0]).toMatchObject({ status: 'fill', fillValue: 'GB' });
  });
});
