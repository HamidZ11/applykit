import { describe, expect, it } from 'vitest';
import { loadHtml } from '@/test/load-fixture';
import {
  describeEvidence,
  detectControl,
  normalise,
  type DetectableControl,
  type Detection,
} from './detect';

/** Detects the first control in the markup. */
function detect(html: string): Detection {
  loadHtml(html);
  const control = document.querySelector<DetectableControl>(
    'input, select, textarea',
  );
  if (!control) throw new Error('No control');
  return detectControl(control);
}

function matched(html: string): string | null {
  const detection = detect(html);
  return detection.kind === 'match' ? detection.field : null;
}

describe('detectControl', () => {
  it.each([
    ['<label>First name <input></label>', 'firstName'],
    ['<label>Given name(s) <input></label>', 'firstName'],
    ['<label>Forename <input></label>', 'firstName'],
    ['<input name="fname">', 'firstName'],
    ['<label>Surname <input></label>', 'lastName'],
    ['<label>Family name <input></label>', 'lastName'],
    ['<input name="applicant[lastName]">', 'lastName'],
    ['<label>Full name <input></label>', 'fullName'],
    ['<label>Name <input></label>', 'fullName'],
    ['<label>First and last name <input></label>', 'fullName'],
    ['<label>Preferred name <input></label>', 'preferredName'],
    ['<label>Preferred first name <input></label>', 'preferredName'],
    ['<label>Known as <input></label>', 'preferredName'],
    ['<label>E-mail <input></label>', 'email'],
    ['<label>Mobile <input></label>', 'phone'],
    ['<label>Telephone number <input></label>', 'phone'],
    ['<label>Street address <input></label>', 'addressLine1'],
    ['<input name="addressLine1">', 'addressLine1'],
    ['<label>Apartment, suite, etc. <input></label>', 'addressLine2'],
    ['<input name="address_line_2">', 'addressLine2'],
    ['<label>Town / City <input></label>', 'city'],
    ['<label>County <input></label>', 'region'],
    ['<label>State / Province <input></label>', 'region'],
    ['<label>Postcode <input></label>', 'postcode'],
    ['<label>ZIP code <input></label>', 'postcode'],
    ['<label>Postal code <input></label>', 'postcode'],
    ['<label>Country <input></label>', 'country'],
    ['<label>LinkedIn URL <input></label>', 'linkedin'],
    ['<label>GitHub profile <input></label>', 'github'],
    ['<label>Portfolio <input></label>', 'portfolio'],
    ['<label>Personal website <input></label>', 'portfolio'],
    ['<label>Website <input type="url"></label>', 'portfolio'],
  ])('recognises %s', (html, field) => {
    expect(matched(html)).toBe(field);
  });

  it('prefers explicit autocomplete semantics, with the evidence', () => {
    const detection = detect('<input autocomplete="given-name" name="x1">');

    expect(detection).toEqual({
      kind: 'match',
      field: 'firstName',
      evidence: [{ signal: 'autocomplete', text: 'given-name' }],
    });
  });

  it.each([
    ['section-apply shipping postal-code', 'postcode'],
    ['address-level2', 'city'],
    ['address-level1', 'region'],
    ['country-name', 'country'],
    ['tel-national', 'phoneNational'],
    ['tel-country-code', 'phoneCountryCode'],
  ])('reads autocomplete="%s"', (autocomplete, field) => {
    expect(matched(`<input autocomplete="${autocomplete}">`)).toBe(field);
  });

  it('uses aria-label and aria-labelledby when there is no label element', () => {
    expect(matched('<input aria-label="Last name">')).toBe('lastName');
    expect(
      matched(
        '<span id="q">Postcode</span><input aria-labelledby="q" name="f7">',
      ),
    ).toBe('postcode');
  });

  it('collects every agreeing signal as evidence', () => {
    const detection = detect(
      '<label for="email">Email</label><input id="email" name="email" type="email">',
    );

    expect(detection.kind).toBe('match');
    if (detection.kind !== 'match') return;
    expect(detection.evidence.map((e) => e.signal)).toEqual([
      'type',
      'label',
      'name',
      'id',
    ]);
  });

  it('returns none for a control without any usable signal', () => {
    expect(detect('<input name="q17">')).toEqual({ kind: 'none' });
    expect(detect('<input>')).toEqual({ kind: 'none' });
  });

  it('reports a conflict when signals point at different fields', () => {
    const detection = detect(
      '<label>Email <input name="phone_number"></label>',
    );

    expect(detection).toMatchObject({
      kind: 'conflict',
      fields: ['email', 'phone'],
    });
  });

  it('treats "City, country" as a conflict rather than guessing', () => {
    expect(detect('<input placeholder="City, country">').kind).toBe('conflict');
  });

  it('does not treat long questions as address parts', () => {
    expect(
      matched(
        '<label>Which city would you prefer to be based in for this role? <input></label>',
      ),
    ).toBeNull();
  });

  it.each([
    '<label>Phone extension <input type="tel"></label>',
    '<label>Country code <input></label>',
    '<label>Phone type <select autocomplete="tel"></select></label>',
  ])('does not fill phone or country parts: %s', (html) => {
    expect(matched(html)).toBeNull();
  });

  it('still recognises a phone field that explains its format', () => {
    expect(
      matched(
        '<label>Phone number (including country code) <input type="tel"></label>',
      ),
    ).toBe('phone');
  });

  describe('details about someone else', () => {
    it.each([
      '<label>Company website <input type="url" name="website"></label>',
      '<label>Hiring manager email <input type="email"></label>',
      '<label>Employer address line 1 <input></label>',
      '<label>Emergency contact phone <input type="tel"></label>',
      '<input autocomplete="work email">',
      '<input autocomplete="section-x work tel">',
    ])('never matches %s', (html) => {
      expect(detect(html).kind).not.toBe('match');
    });

    it('recognises a reference by its section, with the evidence', () => {
      const detection = detect(`
        <fieldset><legend>Reference 1</legend>
          <label>Full name <input></label>
        </fieldset>`);

      expect(detection).toEqual({
        kind: 'other-person',
        evidence: [{ signal: 'label', text: 'Full name' }],
      });
    });

    it('recognises a group labelled for someone else', () => {
      const detection = detect(`
        <div role="group" aria-label="Referee">
          <label>Phone <input type="tel"></label>
        </div>`);

      expect(detection.kind).toBe('other-person');
    });
  });

  describe('questions ApplyKit never answers', () => {
    it.each([
      '<label>Do you have the right to work in the UK? <input></label>',
      '<label>Will you require visa sponsorship? <input></label>',
      '<label>Current salary <input></label>',
      '<label>Do you consider yourself to have a disability or long-term health condition? <select></select></label>',
      '<label>What is your sex? <select></select></label>',
      '<label>Do you require any reasonable adjustments? <input></label>',
      '<label>Date of birth <input></label>',
      '<label>Nationality <input></label>',
    ])('marks %s as sensitive', (html) => {
      expect(detect(html)).toEqual({ kind: 'manual', reason: 'sensitive' });
    });

    it('does not mistake a sensitive question for a profile field', () => {
      // "country" would otherwise match.
      expect(detect('<label>Country of citizenship <input></label>')).toEqual({
        kind: 'manual',
        reason: 'sensitive',
      });
    });

    it.each([
      '<label><input type="checkbox" name="consent"> I agree to the terms</label>',
      '<label><input type="checkbox"> Email me about new roles (newsletter)</label>',
      '<fieldset><legend>Declaration</legend><label>Full name <input></label></fieldset>',
    ])('marks %s as consent', (html) => {
      expect(detect(html)).toEqual({ kind: 'manual', reason: 'consent' });
    });

    it('marks CAPTCHA fields as verification', () => {
      expect(
        detect('<label>Type the characters <input name="captcha"></label>'),
      ).toEqual({ kind: 'manual', reason: 'verification' });
      expect(
        detect('<textarea class="g-recaptcha-response"></textarea>'),
      ).toEqual({ kind: 'manual', reason: 'verification' });
    });
  });
});

describe('normalise', () => {
  it('splits names, brackets and digits into words', () => {
    expect(normalise('applicant[addressLine1]')).toBe(
      'applicant address line 1',
    );
    expect(normalise('first_name')).toBe('first name');
  });
});

describe('describeEvidence', () => {
  it('shows attributes as written and text in quotes', () => {
    expect(
      describeEvidence({ signal: 'autocomplete', text: 'given-name' }),
    ).toBe('autocomplete="given-name"');
    expect(describeEvidence({ signal: 'label', text: 'First name' })).toBe(
      'label “First name”',
    );
  });
});

describe('international calling codes', () => {
  it.each([
    '<label>International telephone calling code <input></label>',
    '<label>Country calling code <input></label>',
    '<label>Dialling code <input name="phone_code"></label>',
    '<label>Phone country code <select><option>+44</option></select></label>',
    '<input name="countryCallingCode">',
  ])('recognises %s', (html) => {
    expect(matched(html)).toBe('phoneCountryCode');
  });

  it('reads a bare "Country code" select as a calling code from its options', () => {
    const detection = detect(`<label>Country code <select>
      <option value="">Select</option>
      <option value="1">United Kingdom (+44)</option>
      <option value="2">Ireland (+353)</option>
      <option value="3">France (+33)</option>
    </select></label>`);

    expect(detection).toEqual({
      kind: 'match',
      field: 'phoneCountryCode',
      evidence: [{ signal: 'options', text: 'United Kingdom (+44)' }],
    });
  });

  it.each([
    '<label>Country code <input></label>',
    '<label>Country code <select><option>GB</option><option>IE</option></select></label>',
    '<label>Area code <input></label>',
  ])('does not guess that %s is a calling code', (html) => {
    expect(matched(html)).toBeNull();
  });

  it('never takes a referee’s calling code for the applicant’s', () => {
    expect(
      detect(`<fieldset><legend>Referee</legend>
        <label>Country calling code <input></label></fieldset>`).kind,
    ).toBe('other-person');
  });
});

describe('review regressions', () => {
  it.each([
    '<label>Country of origin <select></select></label>',
    '<label>Native country <input></label>',
    '<label>Are you a citizen? <input></label>',
  ])('treats %s as sensitive', (html) => {
    expect(detect(html)).toEqual({ kind: 'manual', reason: 'sensitive' });
  });

  it.each([
    '<label>Referrer email <input type="email"></label>',
    '<label>Referred by (full name) <input></label>',
    '<label>Referral phone <input type="tel"></label>',
    '<label>Colleague email <input type="email"></label>',
    '<label>Full name of the person who referred you <input></label>',
  ])('does not fill %s with the applicant’s details', (html) => {
    expect(detect(html).kind).not.toBe('match');
  });

  it('is not put off by an example address in the placeholder', () => {
    expect(
      matched(
        '<label>Email <input type="email" placeholder="name@company.com"></label>',
      ),
    ).toBe('email');
  });

  it('ignores a placeholder example when the label asks something else', () => {
    expect(
      matched(
        '<label>How did you hear about us? <input placeholder="e.g. LinkedIn"></label>',
      ),
    ).toBeNull();
  });

  it.each([
    '<label>Other last names used <input></label>',
    '<label>Second last name <input></label>',
    '<label>Have you been known by another name? <input></label>',
  ])('does not fill %s with the current name', (html) => {
    expect(matched(html)).toBeNull();
  });
});

describe('education fields', () => {
  it.each([
    ['<label>University <input></label>', 'institution'],
    ['<label>Name of your university <input></label>', 'institution'],
    ['<label>School name <input></label>', 'institution'],
    ['<label>Degree type <select></select></label>', 'qualification'],
    [
      '<label>Highest level of education <select></select></label>',
      'qualification',
    ],
    ['<label>Field of study <input></label>', 'fieldOfStudy'],
    ['<label>Degree subject <input></label>', 'fieldOfStudy'],
    ['<label>Expected graduation date <input></label>', 'educationEnd'],
    ['<label>Year of graduation <input></label>', 'educationEnd'],
    ['<label>Degree classification <select></select></label>', 'grade'],
    ['<label>GPA <input></label>', 'grade'],
    ['<label>University start date <input></label>', 'educationStart'],
  ])('recognises %s anywhere', (html, field) => {
    expect(matched(html)).toBe(field);
  });

  it.each([
    ['Start date', 'educationStart'],
    ['End date', 'educationEnd'],
    ['Subject', 'fieldOfStudy'],
    ['Grade', 'grade'],
    ['Course', 'fieldOfStudy'],
  ])('recognises %s only in an education section', (label, field) => {
    expect(matched(`<label>${label} <input></label>`)).toBeNull();
    expect(matched(`<h2>Education</h2><label>${label} <input></label>`)).toBe(
      field,
    );
    expect(
      matched(`<h2>Work experience</h2><label>${label} <input></label>`),
    ).not.toBe(field);
  });

  it.each([
    '<label>University email address <input type="email"></label>',
    '<label>University ID number <input></label>',
    '<label>University city <input></label>',
  ])('does not take %s for the institution', (html) => {
    expect(matched(html)).not.toBe('institution');
  });

  it('never fills personal details into an education section', () => {
    expect(matched('<h2>Education</h2><label>Name <input></label>')).toBeNull();
  });

  it('does not read a job programme as a field of study', () => {
    expect(matched('<label>Programme name <input></label>')).toBeNull();
  });

  it('still treats a supervisor as someone else', () => {
    expect(
      detect(
        '<h2>Education</h2><label>Supervisor email <input type="email"></label>',
      ).kind,
    ).not.toBe('match');
  });
});

describe('date format hints in labels', () => {
  it.each([
    'Start date (MM/YYYY)',
    'Start date mm/yyyy',
    'Start date (DD/MM/YYYY)',
  ])('still recognises %s in an education section', (label) => {
    expect(matched(`<h2>Education</h2><label>${label} <input></label>`)).toBe(
      'educationStart',
    );
  });
});

describe('technical names versus wording', () => {
  it.each([
    [
      '<label>University <select id="nativeSelect"></select></label>',
      'institution',
    ],
    [
      '<label>Country <select name="originCountrySelect"></select></label>',
      'country',
    ],
    ['<label>Phone <input type="tel" id="pageField3"></label>', 'phone'],
    ['<label>Email <input id="payload-email"></label>', 'email'],
  ])('does not let an identifier make %s sensitive', (html, field) => {
    expect(matched(html)).toBe(field);
  });

  it.each([
    // Wording decides.
    '<label>Native language <input></label>',
    '<label>Country of origin <select id="countrySelect"></select></label>',
    '<label>Age range <select></select></label>',
    '<label>Do you have a medical condition we should know about? <select></select></label>',
    '<label>Political affiliation <input></label>',
    // Strong identifiers still decide when the label disagrees.
    '<label>Country <select name="nationality"></select></label>',
    '<label>Please select <select name="gender"></select></label>',
    // With no label at all, identifiers are all there is.
    '<select name="ageRange"></select>',
    '<select id="ethnicity"></select>',
    // Section context decides too.
    '<fieldset><legend>Equal opportunities</legend><label>Country <select></select></label></fieldset>',
  ])('keeps %s protected', (html) => {
    expect(detect(html)).toEqual({ kind: 'manual', reason: 'sensitive' });
  });
});

describe('employment fields', () => {
  const inSection = (legend: string, label: string, control = '<input>') =>
    `<fieldset><legend>${legend}</legend><label>${label} ${control}</label></fieldset>`;

  it.each([
    ['Previous employer', 'employer'],
    ['Current employer', 'employer'],
    ['Name of your most recent employer', 'employer'],
    ['Current job title', 'jobTitle'],
    ['Previous position', 'jobTitle'],
    ['Employment start date', 'employmentStart'],
    ['Job end date', 'employmentEnd'],
  ])('recognises %s anywhere', (label, field) => {
    expect(matched(`<label>${label} <input></label>`)).toBe(field);
  });

  it.each([
    ['Employer name', 'employer'],
    ['Company name', 'employer'],
    ['Organisation', 'employer'],
    ['Job title', 'jobTitle'],
    ['Position held', 'jobTitle'],
    ['Role', 'jobTitle'],
    ['Start month', 'employmentStart'],
    ['From', 'employmentStart'],
    ['End date (leave blank if current)', 'employmentEnd'],
    ['To', 'employmentEnd'],
    ['Employment type', 'employmentType'],
    ['Main duties and responsibilities', 'jobDescription'],
    ['Responsibilities', 'jobDescription'],
  ])('recognises %s only in a work-history section', (label, field) => {
    expect(matched(`<label>${label} <input></label>`)).toBeNull();
    expect(matched(inSection('Employment history', label))).toBe(field);
    expect(
      matched(`<h2>Work experience</h2><label>${label} <input></label>`),
    ).toBe(field);
    // "Experience" alone is not enough: forms use it for CVs and links.
    expect(matched(inSection('Experience', label))).toBeNull();
  });

  it('recognises numbered and current or previous job sections', () => {
    for (const legend of [
      'Employment 2',
      'Previous employment',
      'Current employer',
      'Employer 2',
    ]) {
      expect(matched(inSection(legend, 'Company name')), legend).toBe(
        'employer',
      );
    }
  });

  it('never takes the company applied to for the applicant’s employer', () => {
    // A bare "Company name" on an application may be the hiring company.
    expect(matched('<label>Company name <input></label>')).toBeNull();
    expect(matched(inSection('About the role', 'Company name'))).toBeNull();
    expect(
      matched(
        inSection('Employment history', 'Job title you are applying for'),
      ),
    ).toBeNull();
    expect(
      matched(inSection('Employment history', 'Desired job title')),
    ).toBeNull();
    // Neither employment history nor, inside a job section, availability.
    expect(
      matched(inSection('Employment history', 'Earliest start date')),
    ).toBeNull();
  });

  it.each([
    inSection('Employment history', "Hiring manager's employer"),
    inSection('Employment history', 'Employer contact'),
    inSection('Employment history', 'Company representative'),
    inSection('Employment history', 'Reference employer'),
    inSection('Emergency contact', 'Employer'),
    inSection('Emergency contact', 'Current employer'),
    inSection('Reference 1', 'Current employer'),
    inSection('Reference 1', 'Job title'),
    inSection('Employer contact', 'Employer name'),
    '<h2>Referees</h2><label>Previous employer <input></label>',
    '<h2>Hiring manager</h2><label>Current job title <input></label>',
    inSection('Recruitment agency', 'Company name'),
  ])('never treats someone else’s employer as the applicant’s: %s', (html) => {
    expect(detect(html).kind).not.toBe('match');
  });

  it('reads names, phones and addresses in a job section as the employer’s', () => {
    for (const [label, control] of [
      ['Name', '<input>'],
      ['Telephone', '<input type="tel">'],
      ['Email', '<input type="email">'],
      ['Address line 1', '<input>'],
      ['Country', '<input>'],
    ] as const) {
      expect(
        detect(inSection('Current employment', label, control)).kind,
        label,
      ).toBe('other-person');
    }
    // Explicit autocomplete semantics still say whose detail it is.
    expect(
      matched(
        inSection('Employment', 'Your email', '<input autocomplete="email">'),
      ),
    ).toBe('email');
  });

  it('leaves links in an "Experience" section to the existing rules', () => {
    expect(matched(inSection('Experience', 'Portfolio URL'))).toBe('portfolio');
    expect(matched(inSection('Experience', 'LinkedIn profile'))).toBe(
      'linkedin',
    );
  });

  it('recognises "I currently work here" only on a checkbox', () => {
    expect(
      matched('<label><input type="checkbox"> I currently work here</label>'),
    ).toBe('currentlyEmployed');
    expect(
      matched(inSection('Employment 1', 'Current', '<input type="checkbox">')),
    ).toBe('currentlyEmployed');
    expect(matched('<label>I currently work here <input></label>')).toBeNull();
    // A question about employment status is not this box.
    expect(
      matched(
        '<label><input type="checkbox"> Are you currently employed?</label>',
      ),
    ).toBeNull();
    // Nothing else is ever matched on a checkbox.
    expect(
      matched(
        inSection('Employment 1', 'Job title', '<input type="checkbox">'),
      ),
    ).toBeNull();
  });

  it.each([
    'Reason for leaving',
    'Why did you leave?',
    'Please explain any gaps in your employment',
    'Have you ever been subject to disciplinary action?',
  ])('leaves %s for the applicant to answer', (label) => {
    expect(
      detect(inSection('Previous employment', label, '<textarea></textarea>')),
    ).toEqual({ kind: 'manual', reason: 'answer' });
  });

  it.each([
    'Why do you want this job?',
    'Key achievements',
    'Describe a time you led a team',
    'Salary',
  ])('never takes %s for a job description', (label) => {
    expect(
      matched(inSection('Employment 1', label, '<textarea></textarea>')),
    ).not.toBe('jobDescription');
  });

  it('keeps declarations and signatures in a job section protected', () => {
    expect(detect(inSection('Employment history', 'Signature')).kind).toBe(
      'manual',
    );
    expect(
      detect('<h2>Declaration</h2><label>Current employer <input></label>'),
    ).toEqual({ kind: 'manual', reason: 'consent' });
    expect(detect(inSection('Employment history', 'Salary'))).toEqual({
      kind: 'manual',
      reason: 'sensitive',
    });
  });
});

describe('employment boundaries found in review', () => {
  it.each([
    '<h1>Application for Employment</h1><label>Full name <input></label>',
    '<form><h2>Employment application</h2><label>First name <input></label></form>',
    '<h1>Employment Application Form</h1><label>Email <input type="email"></label>',
  ])('still fills the applicant’s details under a form title: %s', (html) => {
    expect(detect(html).kind).toBe('match');
  });

  it.each([
    '<h2>Apply for one of our current jobs</h2><label>Job title <select><option value="">Choose</option><option>Driver</option></select></label>',
    '<fieldset><legend>Which roles are you applying for?</legend><fieldset><legend>Role 1</legend><label>Job title <input></label></fieldset></fieldset>',
    '<h2>Position 1</h2><label>Position <input></label>',
    '<h2>Position 1</h2><label>Start date <input type="month"></label>',
    '<h2>Employment details</h2><label>Company <input></label>',
    '<h2>Our vacancies</h2><label>Current job title <input></label>',
  ])('never takes the job applied for as history: %s', (html) => {
    expect(detect(html).kind).not.toBe('match');
  });

  it.each([
    '<fieldset><legend>Employment 1</legend><h3>Agency details</h3><label>Company name <input></label></fieldset>',
    '<fieldset><legend>Employment 1</legend><h3>End client</h3><label>Job title <input></label></fieldset>',
    '<fieldset><legend>Previous employment</legend><fieldset><legend>Person to speak to</legend><label>Company <input></label></fieldset></fieldset>',
  ])('never fills an agency, client or contact person: %s', (html) => {
    expect(detect(html).kind).not.toBe('match');
  });
});
