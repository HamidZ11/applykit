import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS_CV,
  CLASSIC_CV,
  CONTACT_ONLY_CV,
  REORDERED_CV,
} from '@/test/cv-fixtures';
import { extractCv } from './extract';

describe('personal details', () => {
  it('reads name and contact details from the header', () => {
    const { personal } = extractCv(CLASSIC_CV);

    expect(personal.firstName).toMatchObject({
      value: 'Alex',
      certainty: 'confident',
    });
    expect(personal.lastName).toMatchObject({
      value: 'Sample',
      certainty: 'confident',
    });
    expect(personal.email).toMatchObject({
      value: 'alex.sample@example.com',
      certainty: 'confident',
    });
    expect(personal.phone).toMatchObject({
      value: '+44 7700 900123',
      certainty: 'confident',
    });
    // A location is offered for checking, never as a full address.
    expect(personal.city).toMatchObject({
      value: 'London',
      certainty: 'review',
    });
  });

  it('keeps the evidence for each value', () => {
    const { personal } = extractCv(CLASSIC_CV);

    expect(personal.email?.source).toBe(
      'London, United Kingdom | +44 7700 900123 | alex.sample@example.com',
    );
  });

  it('skips a "Curriculum Vitae" title and reads labelled contacts', () => {
    const { personal } = extractCv(REORDERED_CV);

    expect(personal.firstName?.value).toBe('Sam');
    expect(personal.lastName?.value).toBe('Example-Jones');
    expect(personal.email?.value).toBe('sam.example@example.org');
    expect(personal.phone).toMatchObject({
      value: '07700 900456',
      certainty: 'confident',
    });
    expect(personal.city).toBeNull();
  });

  it('never takes numbers from the body for a phone number', () => {
    const cv = `Alex Sample\nalex@example.com\n\nExperience\nDesigner | Example Ltd | Jan 2020 – Present\n• Served 1,250,000 users and 020 7946 0000 calls.`;

    expect(extractCv(cv).personal.phone).toBeNull();
  });

  it('does not mistake a year range for a phone number', () => {
    const cv = `Alex Sample\nAvailable 2019 - 2021\nalex@example.com`;

    expect(extractCv(cv).personal.phone).toBeNull();
  });

  it('asks for review when there are several email addresses', () => {
    const cv = `Alex Sample\nalex@example.com | alex.work@example.org`;

    expect(extractCv(cv).personal.email).toMatchObject({
      value: 'alex@example.com',
      certainty: 'review',
    });
  });

  it('asks for review when a name has more than two words', () => {
    const { personal } = extractCv('Mary Ann Example\nmary@example.com');

    expect(personal.firstName).toMatchObject({
      value: 'Mary',
      certainty: 'review',
    });
    expect(personal.lastName).toMatchObject({ value: 'Ann Example' });
  });

  it('finds nothing rather than guessing', () => {
    const { personal } = extractCv('Skills\nFigma, Sketch, Prototyping');

    expect(personal).toEqual({
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      city: null,
    });
  });
});

describe('links', () => {
  it('recognises LinkedIn, GitHub and a personal site', () => {
    const { links } = extractCv(CLASSIC_CV);

    expect(links.linkedin).toMatchObject({
      value: 'https://linkedin.com/in/alex-sample',
      certainty: 'confident',
    });
    expect(links.github).toMatchObject({
      value: 'https://github.com/alexsample',
      certainty: 'confident',
    });
    // Could be an employer's site, so it is always checked.
    expect(links.portfolio).toMatchObject({
      value: 'https://alexsample.design',
      certainty: 'review',
    });
  });

  it('ignores email domains and technology names', () => {
    const cv = `Alex Sample\nalex@example.com\nSkills: Node.js, Vue.js, e.g. React`;

    expect(extractCv(cv).links).toEqual({
      linkedin: null,
      github: null,
      portfolio: null,
    });
  });

  it('marks a repository link for review rather than as the profile', () => {
    const cv = `Alex Sample\nhttps://github.com/alexsample/booking-app`;

    expect(extractCv(cv).links.github?.certainty).toBe('review');
  });
});

describe('experience', () => {
  it('reads several dated roles with their descriptions', () => {
    const { employment } = extractCv(CLASSIC_CV);

    expect(employment).toHaveLength(2);
    expect(employment[0]).toMatchObject({
      certainty: 'confident',
      record: {
        title: 'Senior Product Designer',
        employer: 'Northwind Ltd',
        startDate: '2021-01',
        endDate: '',
        current: true,
        description:
          'Led the redesign of the onboarding flow, increasing activation by 18%.\nBuilt and maintained the design system used by 40 engineers.',
      },
    });
    expect(employment[1]?.record).toMatchObject({
      title: 'Product Designer',
      employer: 'Halden Studio',
      startDate: '2018-03',
      endDate: '2020-12',
      current: false,
    });
  });

  it('reads roles whose header spans two lines, including "Title at Employer"', () => {
    const { employment } = extractCv(REORDERED_CV);

    expect(employment).toHaveLength(2);
    expect(employment[0]).toMatchObject({
      certainty: 'confident',
      record: {
        title: 'Marketing Assistant',
        employer: 'Acme Corporation',
        startDate: '2019-06',
        endDate: '2020-08',
        description: 'Drafted campaign copy for product launches.',
      },
    });
    expect(employment[1]).toMatchObject({
      certainty: 'review',
      notes: ['Check the employer name.'],
      record: {
        title: 'Junior Marketing Executive',
        employer: 'Brightside',
        startDate: '2020-09',
        current: true,
        description: 'Ran weekly email campaigns.',
      },
    });
  });

  it('does not invent months for year-only dates or guess the title', () => {
    const { employment } = extractCv(AMBIGUOUS_CV);

    expect(employment).toHaveLength(1);
    expect(employment[0]).toMatchObject({
      certainty: 'review',
      record: { startDate: '', endDate: '', current: false },
    });
    expect(employment[0]?.notes).toEqual([
      'Check which is the job title and which is the employer.',
      'Dates are given without months (2019 - 2021); add the months.',
    ]);
  });

  it('warns instead of guessing when roles cannot be told apart', () => {
    const cv = `Alex Sample\n\nExperience\nWorked across several design teams on many products.`;
    const result = extractCv(cv);

    expect(result.employment).toEqual([]);
    expect(result.warnings).toContain(
      'The roles in your Experience section could not be told apart reliably. Add them yourself.',
    );
  });
});

describe('education', () => {
  it('reads a degree with its institution, dates and stated grade', () => {
    const { education } = extractCv(CLASSIC_CV);

    expect(education).toEqual([
      expect.objectContaining({
        certainty: 'confident',
        notes: [],
        record: {
          institution: 'University of Example',
          qualification: 'BSc (Hons)',
          fieldOfStudy: 'Computer Science',
          startDate: '2014-09',
          endDate: '2017-06',
          grade: 'First Class Honours',
        },
      }),
    ]);
  });

  it('reads several entries in a different layout, flagging years-only dates', () => {
    const { education } = extractCv(REORDERED_CV);

    expect(education).toHaveLength(2);
    expect(education[0]).toMatchObject({
      certainty: 'review',
      record: {
        institution: 'University College Example',
        qualification: 'Bachelor of Arts',
        fieldOfStudy: 'History',
        startDate: '',
        endDate: '',
        grade: '',
      },
    });
    expect(education[0]?.notes).toEqual([
      'Dates are given without months (2016 – 2019); add the months.',
    ]);
    expect(education[1]?.record).toMatchObject({
      institution: 'Example Sixth Form College',
      qualification: 'A levels',
      fieldOfStudy: 'History, English, Maths',
    });
  });

  it('reads an expected graduation date without inventing a start', () => {
    const cv = `Alex Sample\n\nEducation\nMSc in Data Science, University of Example\nExpected June 2027`;
    const [entry] = extractCv(cv).education;

    expect(entry?.record).toMatchObject({
      qualification: 'MSc',
      fieldOfStudy: 'Data Science',
      startDate: '',
      endDate: '2027-06',
    });
    expect(entry?.notes).toEqual(['Start date not found.']);
  });

  it('does not infer a grade that is not stated', () => {
    const cv = `Alex Sample\n\nEducation\nBA History, University of Example, Sep 2015 – Jun 2018\nFirst in my family to attend university.`;

    expect(extractCv(cv).education[0]?.record.grade).toBe('');
  });
});

describe('whole documents', () => {
  it('reads contact details when there are no sections', () => {
    const result = extractCv(CONTACT_ONLY_CV);

    expect(result.personal.firstName?.value).toBe('Jordan');
    expect(result.personal.phone?.value).toBe('020 7946 0991');
    expect(result.links.portfolio?.value).toBe(
      'https://jordan-placeholder.example.dev/work',
    );
    expect(result.warnings).toEqual([
      'No Education or Experience headings were found, so only contact details and links were read.',
    ]);
  });

  it('handles empty text', () => {
    const result = extractCv('');

    expect(result.education).toEqual([]);
    expect(result.employment).toEqual([]);
    expect(result.personal.email).toBeNull();
  });
});

describe('details in the body of the CV', () => {
  it('never offers a referee’s or employer’s contact details as yours', () => {
    const cv = [
      'Alex Sample',
      'London',
      'Experience',
      'Engineer, Example Ltd, 2020 - 2023',
      'Maintained github.com/example-org tooling',
      'References',
      'Jane Doe | jane.doe@example.org | linkedin.com/in/jane-doe | github.com/janedoe',
    ].join('\n');

    const { personal, links } = extractCv(cv);

    expect(personal.email).toBeNull();
    expect(links).toEqual({ linkedin: null, github: null, portfolio: null });
  });

  it('reads links from a Links section', () => {
    const cv = [
      'Alex Sample',
      'alex.sample@example.com',
      'Links',
      'linkedin.com/in/alex-sample',
      'Experience',
      'Engineer, Example Ltd, 2020 - 2023',
    ].join('\n');

    expect(extractCv(cv).links.linkedin?.value).toBe(
      'https://linkedin.com/in/alex-sample',
    );
  });

  it('stays fast on very long tokens', () => {
    const started = performance.now();

    extractCv(`Alex Sample\n${'a'.repeat(50_000)}\n${'aa.'.repeat(20_000)}`);

    expect(performance.now() - started).toBeLessThan(1000);
  });
});
