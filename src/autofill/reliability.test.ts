import { describe, expect, it } from 'vitest';
import { educationRecords, fullProfile } from '@/test/autofill-fixtures';
import { loadHtml } from '@/test/load-fixture';
import { fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { planFill, type FieldReport } from './report';
import { scanFields } from './scan';

/** Regression tests for the reliability review (chore/reliability-review). */

const NOW = new Date('2026-10-17T12:00:00Z');

function plan(html: string, records = educationRecords()): FieldReport[] {
  loadHtml(html);
  const profile = fullProfile();
  profile.education = records;
  return planFill(scanFields(document), autofillValuesFrom(profile), NOW);
}

function byId(reports: FieldReport[], id: string): FieldReport | undefined {
  return reports.find((r) => r.field.element.id === id);
}

describe('controls disabled by their fieldset', () => {
  it('are not listed or written', async () => {
    const reports = plan(`<form>
      <label>Email <input id="email" type="email"></label>
      <fieldset disabled><legend>Billing</legend>
        <label>First name <input id="first"></label>
      </fieldset>
    </form>`);

    expect(byId(reports, 'first')).toBeUndefined();
    await fillFields(reports);
    expect((document.getElementById('first') as HTMLInputElement).value).toBe(
      '',
    );
  });
});

describe('declarations and signatures', () => {
  it.each([
    '<label>First name <input></label><h2>Declaration</h2><p>I confirm the above is true.</p><label>Full name <input id="x"></label>',
    '<label>Signature (type your full name) <input id="x"></label>',
    '<label>Electronic signature <input id="x"></label>',
  ])('never signs for the applicant: %s', (html) => {
    expect(byId(plan(`<form>${html}</form>`), 'x')?.status).toBe('manual');
  });
});

describe('work authorisation', () => {
  it.each(['Work authorisation', 'Immigration status', 'Eligibility to work'])(
    'never answers country questions under "%s"',
    (heading) => {
      const reports = plan(
        `<form><h2>${heading}</h2><label>Country <select id="x"><option value="">Select</option><option value="GB">United Kingdom</option></select></label></form>`,
      );
      expect(byId(reports, 'x')?.status).toBe('manual');
    },
  );
});

describe('question-shaped labels', () => {
  it.each([
    '<label>Did you attend a Russell Group university? <input id="x"></label>',
    '<label>Professional qualifications (e.g. ACCA) <input id="x"></label>',
    '<label>Preferred city <input id="x"></label>',
    '<label>Preferred country <input id="x"></label>',
    '<label>Desired work location (city) <input id="x"></label>',
  ])('are not filled with applicant data: %s', (html) => {
    expect(
      byId(plan(`<form>${html}</form>`), 'x')?.fillValue ?? null,
    ).toBeNull();
  });
});

describe('headings in other sections', () => {
  it('do not describe fields outside their section', () => {
    const reports = plan(`<form>
      <section><h3>University</h3><label>Institution <input id="u"></label></section>
      <p>Secondary school</p>
      <label>Institution <input id="s"></label>
    </form>`);

    expect(byId(reports, 's')?.fillValue).not.toBe('University of Example');
  });
});

describe('self-labelled custom controls', () => {
  it('do not read their own value as part of the label', () => {
    loadHtml(`<form>
      <span id="fos">Field of study</span>
      <div id="sel" role="combobox" tabindex="0" aria-labelledby="fos sel">Business Management</div>
    </form>`);

    const [field] = scanFields(document);

    expect(field?.label).toBe('Field of study');
    expect(field?.support.status).toBe('unsupported');
  });
});

describe('page furniture without a form', () => {
  it('ignores header and footer widgets', () => {
    loadHtml(`
      <header><span id="l">Language</span><div role="combobox" tabindex="0" aria-labelledby="l"></div></header>
      <main><label>Email <input id="email" type="email"></label></main>
      <footer><span id="r">Region</span><div role="combobox" tabindex="0" aria-labelledby="r"></div></footer>
    `);

    expect(scanFields(document).map((f) => f.element.id)).toEqual(['email']);
  });
});

describe('custom wrappers around inputs', () => {
  it('never types into an input inside a popup wrapper', () => {
    const reports = plan(`<form>
      <div aria-haspopup="listbox"><input id="c" aria-label="Country" aria-autocomplete="list"></div>
    </form>`);

    expect(byId(reports, 'c')).toMatchObject({
      status: 'unsupported',
      fillValue: null,
    });
  });

  it('lists a wrapper whose inner input is only a hidden or read-only backing', () => {
    loadHtml(`<form>
      <div id="w1" role="button" tabindex="0" aria-haspopup="listbox" aria-label="Field of study">
        <input readonly value="">
      </div>
      <div id="w2" role="combobox" tabindex="0" aria-label="Country">
        <input aria-hidden="true" hidden>
      </div>
    </form>`);

    expect(scanFields(document).map((f) => f.element.id)).toEqual(['w1', 'w2']);
  });
});

describe('long forms', () => {
  it('scan in reasonable time', () => {
    const parts: string[] = [];
    for (let i = 0; i < 400; i++) {
      parts.push(
        `<label>Question ${String(i)} <input></label>`,
        `<div role="combobox" tabindex="0" aria-label="Choice ${String(i)}" aria-controls="lb${String(i)}"></div>`,
        `<ul role="listbox" id="lb${String(i)}" hidden></ul>`,
      );
    }
    loadHtml(`<form>${parts.join('')}</form>`);

    const started = performance.now();
    const fields = scanFields(document);

    expect(fields).toHaveLength(800);
    expect(performance.now() - started).toBeLessThan(4000);
  });
});
