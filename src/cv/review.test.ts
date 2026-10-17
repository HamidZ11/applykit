import { describe, expect, it } from 'vitest';
import { validateDraft } from '@/domain/profile-schema';
import { emptyDraft, newEmploymentRecord } from '@/domain/user-profile';
import { CLASSIC_CV } from '@/test/cv-fixtures';
import { validDraft } from '@/test/profile-fixtures';
import { extractCv } from './extract';
import {
  applyChoices,
  buildReview,
  countChanges,
  defaultChoices,
  type ImportChoices,
} from './review';

const extraction = () => extractCv(CLASSIC_CV);

describe('buildReview', () => {
  it('proposes everything found for an empty draft as new', () => {
    const review = buildReview(extraction(), emptyDraft());

    expect(review.fields.map((f) => [f.target, f.relation])).toEqual([
      ['firstName', 'new'],
      ['lastName', 'new'],
      ['email', 'new'],
      ['phone', 'new'],
      ['city', 'new'],
      ['linkedin', 'new'],
      ['github', 'new'],
      ['portfolio', 'new'],
    ]);
    expect(review.missing).toEqual([]);
    expect(review.education).toHaveLength(1);
    expect(review.employment).toHaveLength(2);
  });

  it('separates matching values from conflicting ones', () => {
    const draft = validDraft(); // Alex Sample, alex.sample@example.com
    draft.personal.phone = '07700 900123'; // same number, national format
    draft.personal.firstName = 'Alexandra';

    const review = buildReview(extraction(), draft);
    const relation = (target: string) =>
      review.fields.find((f) => f.target === target)?.relation;

    expect(relation('lastName')).toBe('same');
    expect(relation('email')).toBe('same');
    expect(relation('phone')).toBe('same');
    expect(relation('firstName')).toBe('conflict');
    expect(review.fields.find((f) => f.target === 'firstName')).toMatchObject({
      current: 'Alexandra',
      proposed: 'Alex',
    });
  });

  it('lists fields the CV did not provide', () => {
    const review = buildReview(
      extractCv('Alex Sample\nalex@example.com'),
      emptyDraft(),
    );

    expect(review.missing).toEqual([
      'phone',
      'city',
      'linkedin',
      'github',
      'portfolio',
    ]);
  });

  it('marks records already in the profile as duplicates', () => {
    const draft = emptyDraft();
    draft.employment.push({
      ...newEmploymentRecord(),
      employer: 'NORTHWIND LTD',
      title: 'senior product designer',
    });

    const review = buildReview(extraction(), draft);

    expect(review.employment.map((p) => p.duplicate)).toEqual([true, false]);
  });

  it('treats the same organisation and start date as a duplicate', () => {
    const draft = emptyDraft();
    draft.education.push({
      id: 'e1',
      institution: 'University of Example',
      qualification: 'Bachelor of Science',
      fieldOfStudy: 'Computing',
      startDate: '2014-09',
      endDate: '2017-06',
      grade: '',
    });

    expect(buildReview(extraction(), draft).education[0]?.duplicate).toBe(true);
  });

  it('marks a record repeated within the CV as a duplicate', () => {
    const cv = `${CLASSIC_CV}\n\nExperience\nSenior Product Designer | Northwind Ltd | Jan 2021 – Present`;

    const review = buildReview(extractCv(cv), emptyDraft());

    expect(review.employment.map((p) => p.duplicate)).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('defaultChoices', () => {
  it('selects only confident, new information', () => {
    const draft = validDraft();
    draft.personal.firstName = 'Alexandra';
    draft.personal.address.city = '';
    const review = buildReview(extraction(), draft);

    const choices = defaultChoices(review);

    expect(choices.fields.firstName?.accept).toBe(false); // conflict
    expect(choices.fields.email).toBeUndefined(); // already the same
    expect(choices.fields.city?.accept).toBe(false); // needs review
    expect(choices.fields.linkedin?.accept).toBe(true); // confident, new
    expect(choices.fields.portfolio?.accept).toBe(false); // needs review
    expect(Object.values(choices.records)).toEqual([true, true, true]);
  });
});

describe('applyChoices', () => {
  it('applies accepted values and records, and nothing else', () => {
    const draft = emptyDraft();
    const review = buildReview(extraction(), draft);
    const choices: ImportChoices = {
      fields: {
        email: { accept: true, value: 'alex.sample@example.com' },
        phone: { accept: false, value: '+44 7700 900123' },
      },
      records: {
        'employment-0': true,
        'employment-1': false,
        'education-0': false,
      },
    };

    const next = applyChoices(draft, review, choices);

    expect(next.personal.email).toBe('alex.sample@example.com');
    expect(next.personal.phone).toBe('');
    expect(next.personal.firstName).toBe('');
    expect(next.employment.map((r) => r.employer)).toEqual(['Northwind Ltd']);
    expect(next.education).toEqual([]);
    expect(countChanges(review, choices)).toBe(2);
  });

  it('applies a corrected value instead of the extracted one', () => {
    const draft = emptyDraft();
    const review = buildReview(extraction(), draft);

    const next = applyChoices(draft, review, {
      fields: { city: { accept: true, value: '  Manchester ' } },
      records: {},
    });

    expect(next.personal.address.city).toBe('Manchester');
  });

  it('keeps existing values unless a conflict is explicitly accepted', () => {
    const draft = validDraft();
    draft.personal.firstName = 'Alexandra';
    const review = buildReview(extraction(), draft);

    const kept = applyChoices(draft, review, defaultChoices(review));
    const replaced = applyChoices(draft, review, {
      fields: { firstName: { accept: true, value: 'Alex' } },
      records: {},
    });

    expect(kept.personal.firstName).toBe('Alexandra');
    expect(replaced.personal.firstName).toBe('Alex');
  });

  it('never adds a duplicate, even if selected', () => {
    const draft = emptyDraft();
    draft.employment.push({
      ...newEmploymentRecord(),
      employer: 'Northwind Ltd',
      title: 'Senior Product Designer',
    });
    const review = buildReview(extraction(), draft);

    const next = applyChoices(draft, review, {
      fields: {},
      records: { 'employment-0': true, 'employment-1': true },
    });

    expect(next.employment.map((r) => r.employer)).toEqual([
      'Northwind Ltd',
      'Halden Studio',
    ]);
  });

  it('gives added records new ids and leaves the input draft untouched', () => {
    const draft = emptyDraft();
    const review = buildReview(extraction(), draft);

    const next = applyChoices(draft, review, defaultChoices(review));

    expect(draft.employment).toEqual([]);
    expect(new Set(next.employment.map((r) => r.id)).size).toBe(2);
  });

  it('leaves final validation to the profile schema', () => {
    const draft = emptyDraft();
    const review = buildReview(extraction(), draft);
    const next = applyChoices(draft, review, defaultChoices(review));

    // Address and country are never filled from a CV, so saving still asks.
    const result = validateDraft(next);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors['personal.address.line1']).toBeDefined();
      expect(result.errors['personal.address.country']).toBeDefined();
    }
  });
});
