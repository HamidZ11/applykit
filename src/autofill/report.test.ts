import { describe, expect, it } from 'vitest';
import {
  educationRecords,
  fullProfile,
  sampleValues,
} from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import type { AutofillValues, EducationValue } from './fields';
import {
  attentionQueue,
  planFill,
  summarise,
  type FieldReport,
} from './report';
import { autofillValuesFrom, phoneParts } from './profile-values';
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

describe('phone numbers', () => {
  /** Values for a saved number, read as the background would. */
  function withPhone(phone: string, country = 'GB'): AutofillValues {
    const values = sampleValues();
    values.text.phone = phone;
    values.phone = phoneParts(phone, country);
    return values;
  }

  const SPLIT = `
    <label>Country calling code <input id="code"></label>
    <label>Telephone number <input id="number" type="tel"></label>`;

  it('splits the number when the form asks for the code separately', () => {
    loadHtml(SPLIT);

    const reports = plan(withPhone('+44 7700 900123'));

    expect(byId(reports, 'code')).toMatchObject({
      status: 'fill',
      fillValue: '+44',
    });
    expect(byId(reports, 'number')).toMatchObject({
      status: 'fill',
      target: 'phone',
      fillValue: '7700900123',
      note: expect.stringContaining('without its country code') as string,
    });
  });

  it('reads a nationally written number with the saved country', () => {
    loadHtml(SPLIT);

    const reports = plan(withPhone('07700 900123'));

    expect(byId(reports, 'code').fillValue).toBe('+44');
    expect(byId(reports, 'number').fillValue).toBe('7700900123');
  });

  it('keeps the saved number as it is when there is no separate code', () => {
    loadHtml('<label>Telephone number <input id="number" type="tel"></label>');

    expect(byId(plan(withPhone('+44 7700 900123')), 'number').fillValue).toBe(
      '+44 7700 900123',
    );
  });

  it('gives digits only to a code field too short for the plus', () => {
    loadHtml('<label>Dialling code <input id="code" maxlength="2"></label>');

    expect(byId(plan(withPhone('+44 7700 900123')), 'code').fillValue).toBe(
      '44',
    );
  });

  it('fills the national number for autocomplete="tel-national"', () => {
    loadHtml('<input id="n" autocomplete="tel-national">');

    expect(byId(plan(withPhone('+44 7700 900123')), 'n').fillValue).toBe(
      '7700900123',
    );
  });

  it('leaves both parts when the saved number cannot be split', () => {
    loadHtml(SPLIT);

    const reports = plan(withPhone('07700 900123', ''));

    for (const id of ['code', 'number']) {
      expect(byId(reports, id)).toMatchObject({
        status: 'unusable',
        fillValue: null,
        reason: expect.stringContaining('could not be split') as string,
      });
    }
  });

  it('keeps a code the user already entered', () => {
    loadHtml(
      '<label>Country calling code <input id="code" value="+353"></label>',
    );

    expect(byId(plan(withPhone('+44 7700 900123')), 'code')).toMatchObject({
      status: 'keep',
      value: '+353',
    });
  });

  describe('calling code selects', () => {
    function codeSelect(
      options: string,
      values = withPhone('+44 7700 900123'),
    ) {
      loadHtml(`<label>Country calling code <select id="code">
        <option value="">Select</option>${options}</select></label>`);
      return byId(plan(values), 'code');
    }

    it('chooses the one option showing the code', () => {
      expect(
        codeSelect(`
          <option value="353">Ireland (+353)</option>
          <option value="44">United Kingdom (+44)</option>
          <option value="4">Fiji (+679)</option>`),
      ).toMatchObject({ status: 'fill', fillValue: '44' });
    });

    it('tells apart countries sharing a code by the number’s country', () => {
      expect(
        codeSelect(`
          <option value="JE">Jersey (+44)</option>
          <option value="GB">United Kingdom (+44)</option>
          <option value="IM">Isle of Man (+44)</option>`),
      ).toMatchObject({ status: 'fill', fillValue: 'GB' });
    });

    it('follows the number when it contradicts the saved country', () => {
      expect(
        codeSelect(
          `<option value="GB">United Kingdom (+44)</option>
           <option value="US">United States (+1)</option>`,
          withPhone('+1 202 555 0123', 'GB'),
        ),
      ).toMatchObject({ status: 'fill', fillValue: 'US' });
    });

    it('chooses nothing when shared codes cannot be told apart', () => {
      expect(
        codeSelect(
          `<option value="a">+44</option><option value="b">+44</option>`,
        ),
      ).toMatchObject({
        status: 'no-option',
        reason:
          'Several options show +44, so ApplyKit leaves the choice to you.',
      });
    });

    it('never matches a longer code that starts with the same digits', () => {
      expect(
        codeSelect(`<option value="441">Example (+441)</option>`),
      ).toMatchObject({ status: 'no-option' });
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
        context: '',
        group: null,
      },
      status,
      target: null,
      value: null,
      fillValue: null,
      reason: null,
      note: null,
      evidence: [],
      candidates: [],
      chosen: false,
      suggestion: null,
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
      chosen: 0,
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

describe('custom dropdowns', () => {
  it('reports a combobox as unsupported, saying what it seems to ask', () => {
    loadHtml(
      '<label>Country <input id="c" role="combobox" aria-expanded="false"></label>',
    );

    expect(byId(plan(), 'c')).toMatchObject({
      status: 'unsupported',
      target: 'country',
      fillValue: null,
      reason:
        'This looks like your country, but it is a custom dropdown, which ApplyKit cannot fill. Choose it yourself on this page.',
    });
  });

  it('reports an unrecognised custom dropdown without guessing', () => {
    loadHtml('<label>Source <input id="s" aria-haspopup="listbox"></label>');

    expect(byId(plan(), 's')).toMatchObject({
      status: 'unsupported',
      target: null,
      reason:
        'This is a custom dropdown, which ApplyKit cannot fill. Choose it yourself on this page.',
    });
  });
});

describe('education', () => {
  /** Fixed so "expected" and "completed" do not depend on the test date. */
  const NOW = new Date('2026-10-17T12:00:00Z');

  /** Values with the given records, as the background would derive them. */
  function withEducation(
    records = educationRecords(),
    edit?: (record: EducationValue) => void,
  ): AutofillValues {
    const profile = fullProfile();
    profile.education = records;
    const values = sampleValues();
    values.education = autofillValuesFrom(profile).education;
    if (edit) values.education.forEach(edit);
    return values;
  }

  function planned(values = withEducation()): FieldReport[] {
    return planFill(scanFields(document), values, NOW);
  }

  describe('on a heading-based internship form', () => {
    it('fills the university section from the degree', () => {
      loadFixture('education-application.html');

      const reports = planned();

      expect(byId(reports, 'university')).toMatchObject({
        status: 'fill',
        fillValue: 'u2',
        value: 'University of Example',
        note: 'From your saved BSc Computer Science at University of Example.',
      });
      expect(byId(reports, 'degree')).toMatchObject({
        status: 'fill',
        value: "Bachelor's degree",
      });
      expect(byId(reports, 'subject').fillValue).toBe('Computer Science');
      expect(byId(reports, 'edu-start').fillValue).toBe('09/2024');
      expect(byId(reports, 'graduation')).toMatchObject({
        status: 'fill',
        fillValue: '2027-06',
        note: expect.stringContaining('expected graduation') as string,
      });
      expect(byId(reports, 'classification')).toMatchObject({
        status: 'no-value',
      });
    });

    it('fills the school section from the A levels', () => {
      loadFixture('education-application.html');

      const reports = planned();

      expect(byId(reports, 'school').fillValue).toBe(
        'Example Sixth Form College',
      );
      expect(byId(reports, 'school-results').fillValue).toBe('A*AA');
      expect(byId(reports, 'school-end').fillValue).toBe('2024');
    });

    it('never fills employment dates or references from education', () => {
      loadFixture('education-application.html');

      const reports = planned();

      for (const id of ['job-start', 'employer', 'ref-name', 'ref-email']) {
        expect(byId(reports, id).fillValue, id).toBeNull();
      }
    });
  });

  describe('choosing a record', () => {
    it('uses the only record when a section does not say which', () => {
      loadHtml('<h2>Education</h2><label>Institution <input id="i"></label>');

      expect(
        byId(planned(withEducation(educationRecords().slice(0, 1))), 'i'),
      ).toMatchObject({
        status: 'fill',
        fillValue: 'University of Example',
        note: null,
      });
    });

    it('asks the user when several records could fit', () => {
      loadHtml('<h2>Education</h2><label>Institution <input id="i"></label>');

      expect(byId(planned(), 'i')).toMatchObject({
        status: 'ambiguous',
        fillValue: null,
        reason: expect.stringContaining(
          '2 of your saved education records',
        ) as string,
      });
    });

    it('never gives a university field a school', () => {
      loadHtml('<label>University <input id="u"></label>');

      expect(
        byId(planned(withEducation(educationRecords().slice(1))), 'u'),
      ).toMatchObject({
        status: 'no-value',
        reason: 'None of your saved education is a university degree.',
      });
    });

    it('reads the level from any field in the section', () => {
      loadHtml(`<h2>Education</h2>
        <label>Institution <input id="i"></label>
        <label>Degree classification <input id="g"></label>`);

      expect(byId(planned(), 'i').fillValue).toBe('University of Example');
    });

    it('does not guess when a section mentions both levels', () => {
      loadHtml(`<h2>Education</h2>
        <label>School or university <input id="i"></label>`);

      expect(byId(planned(), 'i').status).toBe('ambiguous');
    });

    it('does not choose between two degrees', () => {
      const [degree, ...rest] = educationRecords();
      if (!degree) throw new Error('No degree fixture');
      const records = [
        degree,
        ...rest,
        {
          ...degree,
          id: 'masters',
          institution: 'Example Institute of Technology',
          qualification: 'MSc Data Science',
        },
      ];
      loadHtml('<label>University <input id="u"></label>');

      expect(byId(planned(withEducation(records)), 'u').status).toBe(
        'ambiguous',
      );
    });

    it('explains when nothing is saved', () => {
      loadHtml('<label>University <input id="u"></label>');

      expect(byId(planned(withEducation([])), 'u')).toMatchObject({
        status: 'no-value',
        reason: 'Your profile has no education saved.',
      });
    });
  });

  describe('selects', () => {
    function select(label: string, options: string, values = withEducation()) {
      loadHtml(`<label>${label} <select id="s">
        <option value="">Select…</option>${options}</select></label>`);
      return byId(planned(values), 's');
    }

    it('never takes a similar institution name for the same one', () => {
      expect(
        select(
          'University',
          `<option>University of Example Online</option>
           <option>Example University</option>`,
        ),
      ).toMatchObject({ status: 'no-option', fillValue: null });
    });

    it('matches a degree by its kind only when one option fits', () => {
      expect(
        select(
          'Degree',
          `<option>Bachelor of Arts (BA)</option>
           <option>Bachelor of Science (BSc)</option>`,
        ),
      ).toMatchObject({ status: 'no-option' });
    });

    it('never selects an unrelated degree', () => {
      expect(
        select(
          'Degree',
          `<option>Master's degree</option><option>Doctorate</option>`,
        ),
      ).toMatchObject({ status: 'no-option' });
    });

    it('matches a classification written differently', () => {
      const values = withEducation(undefined, (record) => {
        record.grade =
          record.level === 'higher' ? 'Predicted 2:1' : record.grade;
      });

      expect(
        select(
          'Degree classification',
          `<option value="1">First-class honours</option>
           <option value="21">Upper second-class honours</option>`,
          values,
        ),
      ).toMatchObject({ status: 'fill', fillValue: '21' });
    });

    it('chooses a graduation year option', () => {
      expect(
        select(
          'Graduation year',
          '<option>2026</option><option>2027</option><option>2028</option>',
          withEducation(educationRecords().slice(0, 1)),
        ),
      ).toMatchObject({ status: 'fill', fillValue: '2027' });
    });

    it('chooses a graduation month option', () => {
      expect(
        select(
          'Graduation month',
          '<option value="5">May</option><option value="6">June</option>',
          withEducation(educationRecords().slice(0, 1)),
        ),
      ).toMatchObject({ status: 'fill', fillValue: '6' });
    });
  });

  describe('dates', () => {
    function date(html: string) {
      loadHtml(`<h2>University</h2>${html}`);
      return planned().find((r) => r.field.element.id === 'd');
    }

    it('fills a native month input', () => {
      expect(
        date('<label>Start date <input id="d" type="month"></label>'),
      ).toMatchObject({ fillValue: '2024-09' });
    });

    it('never invents a day', () => {
      expect(
        date('<label>Start date <input id="d" type="date"></label>'),
      ).toMatchObject({
        status: 'unusable',
        reason: expect.stringContaining('does not invent a day') as string,
      });
      expect(
        date(
          '<label>Start date <input id="d" placeholder="DD/MM/YYYY"></label>',
        ),
      ).toMatchObject({ status: 'unusable' });
    });

    it('does not guess a format the field does not state', () => {
      expect(date('<label>Start date <input id="d"></label>')).toMatchObject({
        status: 'unusable',
        reason: 'ApplyKit cannot tell which date format this field expects.',
      });
    });

    it('fills a year-only field with the year alone', () => {
      expect(
        date('<label>Year of graduation <input id="d"></label>'),
      ).toMatchObject({ fillValue: '2027' });
    });

    it('never presents an expected graduation as awarded', () => {
      expect(
        date('<label>Date awarded (MM/YYYY) <input id="d"></label>'),
      ).toMatchObject({
        status: 'unusable',
        reason: expect.stringContaining('still to come') as string,
      });
    });

    it('does not present a saved grade as final before the course ends', () => {
      const values = withEducation(undefined, (record) => {
        if (record.level === 'higher') record.grade = '2:1';
      });
      loadHtml('<label>Degree classification <input id="g"></label>');

      expect(
        byId(planFill(scanFields(document), values, NOW), 'g'),
      ).toMatchObject({
        status: 'manual',
        reason: expect.stringContaining('predicted or a final grade') as string,
      });
    });
  });
});
