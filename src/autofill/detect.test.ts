import { describe, expect, it } from 'vitest';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { detectFields, normalise } from './detect';

function summarise(root: ParentNode) {
  return detectFields(root).map(({ element, field, source }) => ({
    id: element.id,
    field,
    source,
  }));
}

describe('detectFields', () => {
  it('identifies the fields on the basic application fixture', () => {
    const document = loadFixture('basic-application.html');

    expect(summarise(document)).toEqual([
      { id: 'first-name', field: 'firstName', source: 'name' },
      { id: 'last-name', field: 'lastName', source: 'name' },
      { id: 'email', field: 'email', source: 'type' },
    ]);
  });

  it('prefers the autocomplete attribute over a misleading name', () => {
    loadHtml('<input id="x" name="first_name" autocomplete="family-name">');

    expect(summarise(document)).toEqual([
      { id: 'x', field: 'lastName', source: 'autocomplete' },
    ]);
  });

  it.each([
    [
      'camelCase name',
      '<input id="x" name="applicant[firstName]">',
      'firstName',
      'name',
    ],
    ['abbreviated name', '<input id="x" name="lname">', 'lastName', 'name'],
    ['id only', '<input id="surname">', 'lastName', 'id'],
    ['label element', '<label>E-mail <input id="x"></label>', 'email', 'label'],
    [
      'aria-labelledby',
      '<span id="l">Given name</span><input id="x" aria-labelledby="l">',
      'firstName',
      'label',
    ],
    [
      'aria-label',
      '<input id="x" aria-label="Family name">',
      'lastName',
      'label',
    ],
    [
      'placeholder',
      '<input id="x" placeholder="Your first name">',
      'firstName',
      'placeholder',
    ],
  ])('recognises a field by %s', (_case, html, field, source) => {
    loadHtml(html);

    expect(detectFields(document)).toMatchObject([{ field, source }]);
  });

  it('ignores inputs that must never be filled', () => {
    loadHtml(`
      <input type="hidden" name="email">
      <input type="password" name="email">
      <input type="checkbox" name="email">
      <input type="submit" name="email">
      <input name="email" disabled>
      <input name="email" readonly>
    `);

    expect(detectFields(document)).toEqual([]);
  });

  it('ignores unrelated fields', () => {
    loadHtml(`
      <label>Company <input name="company"></label>
      <label>Phone <input name="phone" type="tel"></label>
      <input name="email_opt_out" autocomplete="off" type="checkbox">
    `);

    expect(detectFields(document)).toEqual([]);
  });

  it('returns nothing for a page without inputs', () => {
    loadHtml('<p>No form here</p>');

    expect(detectFields(document)).toEqual([]);
  });
});

describe('normalise', () => {
  it.each([
    ['firstName', 'first name'],
    ['applicant[first_name]', 'applicant first name'],
    ['E-mail address *', 'e mail address'],
  ])('normalises %j', (input, expected) => {
    expect(normalise(input)).toBe(expected);
  });
});
