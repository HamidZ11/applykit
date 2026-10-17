import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  educationRecords,
  fullProfile,
  sampleValues,
} from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { planFill, type FieldReport } from './report';
import { scanFields } from './scan';

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function control(id: string): HTMLInputElement | HTMLSelectElement {
  const element = document.getElementById(id);
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLSelectElement)
  ) {
    throw new Error(`No control #${id}`);
  }
  return element;
}

function plan(root: ParentNode = document): FieldReport[] {
  return planFill(scanFields(root), sampleValues());
}

describe('fillFields', () => {
  it('fills the applicant’s details and confirms each was accepted', async () => {
    loadFixture('full-application.html');

    const outcomes = await fillFields(plan());

    expect(control('full-name').value).toBe('Alex Sample');
    expect(control('email').value).toBe('alex.sample@example.com');
    expect(control('email-confirm').value).toBe('alex.sample@example.com');
    expect(control('address2').value).toBe('Flat 2');
    expect(control('county').value).toBe('Greater London');
    expect(control('country').value).toBe('GB');
    expect(control('website').value).toBe('https://alex-sample.example.com');
    expect(outcomes.filter((r) => r.status === 'filled')).toHaveLength(14);
  });

  it('leaves every other field exactly as it was', async () => {
    const document = loadFixture('full-application.html');
    const untouched = [
      'company-site',
      'employer-address',
      'manager-email',
      'ref-name',
      'ref-phone',
      'ec-name',
      'ec-phone',
      'salary',
      'dob',
      'captcha',
      'trap',
      'news-email',
    ];
    const consent = document.querySelector<HTMLInputElement>(
      '[name="privacy_consent"]',
    );
    const changed = vi.fn();
    document.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (untouched.includes(target.id)) changed(target.id);
    });

    await fillFields(plan());

    for (const id of untouched) expect(control(id).value, id).toBe('');
    expect(control('requisition').value).toBe('OL-2026-0087');
    expect(consent?.checked).toBe(false);
    expect(
      document.querySelector<HTMLInputElement>('[name="sponsorship"]:checked'),
    ).toBeNull();
    expect(document.querySelector('textarea')?.value).toBe('');
    expect(changed).not.toHaveBeenCalled();
  });

  it('dispatches bubbling input and change events for each written field', async () => {
    loadHtml(`<form id="f">
      <label>First name <input id="first"></label>
      <label>Country <select id="country"><option value=""></option><option value="GB">United Kingdom</option></select></label>
    </form>`);
    const events: string[] = [];
    const form = document.getElementById('f');
    form?.addEventListener('input', (event) => {
      events.push(`input:${(event.target as HTMLElement).id}`);
    });
    form?.addEventListener('change', (event) => {
      events.push(`change:${(event.target as HTMLElement).id}`);
    });

    await fillFields(plan());

    expect(events).toEqual([
      'input:first',
      'change:first',
      'input:country',
      'change:country',
    ]);
  });

  it('never overwrites a value typed after the plan was made', async () => {
    loadHtml('<label>Email <input id="email"></label>');
    const planned = plan();
    control('email').value = 'typed@example.org';

    const [outcome] = await fillFields(planned);

    expect(control('email').value).toBe('typed@example.org');
    expect(outcome).toMatchObject({
      status: 'kept',
      value: 'typed@example.org',
    });
  });

  it('reports a field that left the page instead of claiming it was filled', async () => {
    loadHtml(
      '<label>First name <input id="first"></label><label>Last name <input id="last"></label>',
    );
    const planned = plan();
    control('first').closest('label')?.remove();

    const outcomes = await fillFields(planned, async () => {
      control('last').closest('label')?.remove();
      await Promise.resolve();
    });

    expect(outcomes.map((r) => r.status)).toEqual(['detached', 'detached']);
  });

  it('does not write into a field that became disabled or read-only', async () => {
    loadHtml(
      '<label>First name <input id="first"></label><label>Last name <input id="last"></label>',
    );
    const planned = plan();
    (control('first') as HTMLInputElement).disabled = true;
    (control('last') as HTMLInputElement).readOnly = true;

    const outcomes = await fillFields(planned);

    expect(control('first').value).toBe('');
    expect(control('last').value).toBe('');
    expect(outcomes.map((r) => r.status)).toEqual(['rejected', 'rejected']);
  });

  it('reports values the page clears or changes', async () => {
    loadHtml(`
      <label>First name <input id="first"></label>
      <label>Last name <input id="last"></label>
    `);
    control('first').addEventListener('change', (event) => {
      (event.target as HTMLInputElement).value = '';
    });
    control('last').addEventListener('change', (event) => {
      (event.target as HTMLInputElement).value = 'Somebody else';
    });

    const outcomes = await fillFields(plan());

    expect(outcomes[0]).toMatchObject({
      status: 'rejected',
      reason: 'The site cleared this value. Enter it yourself.',
    });
    expect(outcomes[1]).toMatchObject({
      status: 'rejected',
      reason: 'The site changed this value. Check it.',
    });
  });

  it('accepts the site’s own formatting of the same value', async () => {
    loadHtml(`
      <label>Postcode <input id="postcode"></label>
      <label>Phone <input id="phone" type="tel"></label>
    `);
    control('postcode').addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      input.value = input.value.toLowerCase().replace(' ', '');
    });
    control('phone').addEventListener('input', (event) => {
      (event.target as HTMLInputElement).value = '020 7946 0000';
    });

    const outcomes = await fillFields(plan());

    expect(outcomes.map((r) => [r.status, r.value])).toEqual([
      ['reformatted', 'n19gu'],
      ['reformatted', '020 7946 0000'],
    ]);
  });

  it('reports a select that did not keep the chosen option', async () => {
    loadHtml(`<label>Country <select id="country">
      <option value="">Choose</option><option value="GB">United Kingdom</option>
    </select></label>`);
    control('country').addEventListener('change', (event) => {
      (event.target as HTMLSelectElement).value = '';
    });

    const [outcome] = await fillFields(plan());

    expect(outcome?.status).toBe('rejected');
  });

  it('fills a calling code select and the national number together', async () => {
    loadHtml(`<form>
      <label>Country calling code <select id="code">
        <option value="">Select</option>
        <option value="353">Ireland (+353)</option>
        <option value="44">United Kingdom (+44)</option>
      </select></label>
      <label>Phone number <input id="number" type="tel"></label>
    </form>`);

    const outcomes = await fillFields(plan());

    expect(control('code').value).toBe('44');
    expect(control('number').value).toBe('2079460000');
    expect(outcomes.map((r) => r.status)).toEqual(['filled', 'filled']);
  });

  it('fills education selects and dates and confirms them', async () => {
    loadFixture('education-application.html');
    const profile = fullProfile();
    profile.education = educationRecords();
    const reports = planFill(
      scanFields(document),
      autofillValuesFrom(profile),
      new Date('2026-10-17T12:00:00Z'),
    );

    const outcomes = await fillFields(reports);

    expect(control('university').value).toBe('u2');
    expect(control('degree').value).toBe('ba');
    expect(control('edu-start').value).toBe('09/2024');
    expect(control('graduation').value).toBe('2027-06');
    expect(control('school').value).toBe('Example Sixth Form College');
    expect(control('job-start').value).toBe('');
    expect(control('classification').value).toBe('');
    expect(
      outcomes
        .filter((r) => r.status === 'filled')
        .map((r) => r.field.element.id),
    ).toEqual(
      expect.arrayContaining([
        'university',
        'degree',
        'subject',
        'edu-start',
        'graduation',
      ]),
    );
  });

  it('never submits the form or clicks anything', async () => {
    const document = loadFixture('full-application.html');
    const form = document.getElementById('application') as HTMLFormElement;
    const onSubmit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    const onClick = vi.fn();
    const onKey = vi.fn();
    const onFocus = vi.fn();
    form.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus, true);
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit');
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit');

    await fillFields(plan());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(onKey).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('returns fields that were not planned for filling unchanged', async () => {
    loadFixture('full-application.html');
    const planned = plan();

    const outcomes = await fillFields(planned);

    planned.forEach((report, index) => {
      if (report.status !== 'fill') expect(outcomes[index]).toBe(report);
    });
  });
});

describe('React-controlled inputs', () => {
  function render(element: React.ReactElement) {
    const container = loadHtml('<div id="root"></div>').getElementById('root');
    if (!container) throw new Error('No root');
    const root = createRoot(container);
    act(() => {
      root.render(element);
    });
    return {
      container,
      unmount: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  }

  it('updates the component’s state', async () => {
    function ControlledForm() {
      const [email, setEmail] = useState('');
      return (
        <>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
          <output>{email}</output>
        </>
      );
    }
    const { container, unmount } = render(<ControlledForm />);

    let outcomes: FieldReport[] = [];
    await act(async () => {
      outcomes = await fillFields(plan(container));
    });

    expect(container.querySelector('output')?.textContent).toBe(
      'alex.sample@example.com',
    );
    expect(outcomes[0]?.status).toBe('filled');
    unmount();
  });

  it('updates a controlled education select', async () => {
    function EducationForm() {
      const [university, setUniversity] = useState('');
      return (
        <>
          <label>
            University
            <select
              id="u"
              value={university}
              onChange={(event) => {
                setUniversity(event.target.value);
              }}
            >
              <option value="">Select…</option>
              <option value="ex">University of Example</option>
            </select>
          </label>
          <output>{university}</output>
        </>
      );
    }
    const { container, unmount } = render(<EducationForm />);
    const profile = fullProfile();
    profile.education = educationRecords().slice(0, 1);

    let outcomes: FieldReport[] = [];
    await act(async () => {
      outcomes = await fillFields(
        planFill(scanFields(container), autofillValuesFrom(profile)),
      );
    });

    expect(container.querySelector('output')?.textContent).toBe('ex');
    expect(outcomes[0]?.status).toBe('filled');
    unmount();
  });

  it('reports a value the component refuses', async () => {
    function LockedInput() {
      const [value] = useState('');
      return (
        <input aria-label="City" value={value} onChange={() => undefined} />
      );
    }
    const { container, unmount } = render(<LockedInput />);

    let outcomes: FieldReport[] = [];
    await act(async () => {
      outcomes = await fillFields(plan(container));
    });

    expect(outcomes[0]?.status).toBe('rejected');
    expect(container.querySelector('input')?.value).toBe('');
    unmount();
  });
});
