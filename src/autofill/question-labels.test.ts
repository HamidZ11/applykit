import { describe, expect, it } from 'vitest';
import { loadHtml } from '@/test/load-fixture';
import { detectControl, labelText } from './detect';
import { scanFields } from './scan';

/**
 * Finding the question when a control's own name says nothing about it
 * ("Select One Required", a bare "Year"), as on Workday forms: only from
 * the smallest container holding no other field, and never at the cost of
 * a genuine label.
 */

function control(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No #${id}`);
  return found;
}

const SELECT_ONE = (id: string) =>
  `<button id="${id}" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Select One Required">Select One</button>`;

describe('the question a control asks', () => {
  it('prefers the control’s genuine label', () => {
    loadHtml(
      '<form><div><p>Some guidance</p><label for="x">Notice period</label><input id="x" placeholder="Select one" /></div></form>',
    );

    expect(labelText(control('x'))).toBe('Notice period');
  });

  it('reads the question beside a control named only by its prompt', () => {
    loadHtml(
      `<form><div><div>Are you related to a current employee? *</div>${SELECT_ONE('x')}</div></form>`,
    );

    expect(labelText(control('x'))).toBe(
      'Are you related to a current employee? *',
    );
    expect(scanFields(document)[0]?.label).toBe(
      'Are you related to a current employee?',
    );
  });

  it('ignores the prompt after a question in the same name', () => {
    loadHtml(
      '<form><button id="x" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Degree Select One Required">Select One</button></form>',
    );

    expect(labelText(control('x'))).toBe('Degree');
  });

  it('keeps a question that ends in "required"', () => {
    loadHtml(
      '<form><label for="x">Is a reference required</label><input id="x" /></form>',
    );

    expect(labelText(control('x'))).toBe('Is a reference required');
  });

  it('keeps a prompt-only name whole, and finds nothing in a generic container', () => {
    loadHtml(
      '<form><div><span>Please select</span><button id="x" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Please select one">Select One</button></div></form>',
    );

    expect(labelText(control('x'))).toBe('Please select one');
  });

  it('never combines two questions in one container', () => {
    loadHtml(
      `<form><div><p>Are you authorised to work here?</p>${SELECT_ONE('a')}<p>Are you related to an employee?</p>${SELECT_ONE('b')}</div></form>`,
    );

    expect(labelText(control('a'))).toBe('Select One Required');
    expect(labelText(control('b'))).toBe('Select One Required');
  });

  it('keeps repeated identical controls apart', () => {
    loadHtml(
      `<form><div><p>Are you available in June?</p>${SELECT_ONE('a')}</div><div><p>Are you available in July?</p>${SELECT_ONE('b')}</div></form>`,
    );

    expect(labelText(control('a'))).toBe('Are you available in June?');
    expect(labelText(control('b'))).toBe('Are you available in July?');
  });

  it('never reads a heading, a button or a hidden note as the question', () => {
    loadHtml(
      `<form><section><h3>Application questions</h3><div><button type="button">Help</button><span hidden>Internal note</span>${SELECT_ONE('x')}</div></section></form>`,
    );

    expect(labelText(control('x'))).toBe('Select One Required');
  });

  it('gives up on text too long to be one question', () => {
    loadHtml(
      `<form><div><p>${'Please read our statement about how we store your data. '.repeat(5)}</p>${SELECT_ONE('x')}</div></form>`,
    );

    expect(labelText(control('x'))).toBe('Select One Required');
  });

  it('names a date part by its date', () => {
    loadHtml(
      '<form><div><label>From</label><div><input id="x" aria-label="Year" placeholder="YYYY" /></div></div></form>',
    );

    expect(labelText(control('x'))).toBe('From Year');
  });

  it('reads the question for a native control with no label at all', () => {
    loadHtml(
      '<form><div><span>Earliest start date</span><input id="x" /></div></form>',
    );

    expect(labelText(control('x'))).toBe('Earliest start date');
  });

  it('classifies a sensitive question by its real wording', () => {
    loadHtml(
      `<form><div><div>Will you need sponsorship for an employment visa?</div>${SELECT_ONE('x')}</div></form>`,
    );

    expect(detectControl(control('x'))).toEqual({
      kind: 'manual',
      reason: 'sensitive',
    });
  });

  it('reads only what comes before the control, never hints or values after it', () => {
    loadHtml(
      `<form><div><span>School or University</span>${SELECT_ONE('x')}<span>Example Northfield College</span></div><div><span>Earliest start date</span><input id="y" /><small>We never share this</small></div></form>`,
    );

    expect(labelText(control('x'))).toBe('School or University');
    expect(labelText(control('y'))).toBe('Earliest start date');
  });

  it('looks past a date part’s own label for its date', () => {
    loadHtml(
      '<form><div><span>From</span><div><label for="y">Year</label><input id="y" placeholder="YYYY" /></div></div></form>',
    );

    expect(labelText(control('y'))).toBe('From Year');
  });

  it('keeps the stricter sensitive check for an unlabelled control', () => {
    loadHtml(
      '<form><div><span>How old are you?</span><input id="x" name="age" /></div></form>',
    );

    expect(detectControl(control('x'))).toEqual({
      kind: 'manual',
      reason: 'sensitive',
    });
  });

  it('drops a bracketed hint only for education dates', () => {
    loadHtml(`<form><fieldset><legend>Education</legend>
      <label for="t">To (Actual or Expected)</label><input id="t" placeholder="YYYY" />
      <label for="k">Type (full-time / part-time)</label><input id="k" />
      <label for="r">Results (A-levels only)</label><input id="r" />
    </fieldset></form>`);

    expect(detectControl(control('t'))).toMatchObject({
      kind: 'match',
      field: 'educationEnd',
    });
    expect(detectControl(control('k')).kind).not.toBe('match');
    expect(detectControl(control('r')).kind).not.toBe('match');
  });
});
