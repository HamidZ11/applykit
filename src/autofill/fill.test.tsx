import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_PROFILE } from '@/domain/profile';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { autofill } from './fill';

function input(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement))
    throw new Error(`No input #${id}`);
  return element;
}

describe('autofill', () => {
  it('assigns sample values to the matching fixture fields', () => {
    const document = loadFixture('basic-application.html');

    const result = autofill(document, SAMPLE_PROFILE);

    expect(input('first-name').value).toBe('Alex');
    expect(input('last-name').value).toBe('Sample');
    expect(input('email').value).toBe('alex.sample@example.com');
    expect(result.filled.map((target) => target.field)).toEqual([
      'firstName',
      'lastName',
      'email',
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('leaves unrecognised fields untouched', () => {
    const document = loadFixture('basic-application.html');
    const hidden = document.querySelector<HTMLInputElement>('[name="job_id"]');

    autofill(document, SAMPLE_PROFILE);

    expect(hidden?.value).toBe('fixture-001');
  });

  it('dispatches bubbling input and change events for each filled field', () => {
    const document = loadFixture('basic-application.html');
    const events: string[] = [];
    const form = document.getElementById('application');
    form?.addEventListener('input', (event) => {
      expect(event).toBeInstanceOf(InputEvent);
      events.push(`input:${(event.target as HTMLInputElement).id}`);
    });
    form?.addEventListener('change', (event) => {
      events.push(`change:${(event.target as HTMLInputElement).id}`);
    });

    autofill(document, SAMPLE_PROFILE);

    expect(events).toEqual([
      'input:first-name',
      'change:first-name',
      'input:last-name',
      'change:last-name',
      'input:email',
      'change:email',
    ]);
  });

  it('reports profile fields that are missing from the page', () => {
    loadHtml('<form><label>Email <input name="email"></label></form>');

    const result = autofill(document, SAMPLE_PROFILE);

    expect(result.filled.map((target) => target.field)).toEqual(['email']);
    expect(result.missing).toEqual(['firstName', 'lastName']);
  });

  it('reports every field as missing on a page without a form', () => {
    loadHtml('<p>Nothing to fill</p>');

    const result = autofill(document, SAMPLE_PROFILE);

    expect(result.filled).toEqual([]);
    expect(result.missing).toEqual(['firstName', 'lastName', 'email']);
  });

  it('does not overwrite values the user has already entered', () => {
    loadFixture('basic-application.html');
    input('first-name').value = 'Typed by user';

    const result = autofill(document, SAMPLE_PROFILE);

    expect(input('first-name').value).toBe('Typed by user');
    expect(result.skipped).toMatchObject([
      { field: 'firstName', reason: 'has-value' },
    ]);
  });

  it('skips fields when the profile has no value for them', () => {
    loadFixture('basic-application.html');

    const result = autofill(document, { ...SAMPLE_PROFILE, lastName: '' });

    expect(input('last-name').value).toBe('');
    expect(result.skipped).toMatchObject([
      { field: 'lastName', reason: 'no-profile-value' },
    ]);
  });

  it('never submits the form', () => {
    const document = loadFixture('basic-application.html');
    const form = document.getElementById('application') as HTMLFormElement;
    const button = form.querySelector('button[type="submit"]');
    const onSubmit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    const onClick = vi.fn();
    const onKey = vi.fn();
    form.addEventListener('submit', onSubmit);
    button?.addEventListener('click', onClick);
    form.addEventListener('keydown', onKey);
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit');
    const requestSubmit = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit');

    autofill(document, SAMPLE_PROFILE);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(onKey).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('updates the state of React controlled inputs', () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    function ControlledForm() {
      const [firstName, setFirstName] = useState('');
      return (
        <>
          <input
            name="firstName"
            value={firstName}
            onChange={(event) => {
              setFirstName(event.target.value);
            }}
          />
          <output>{firstName}</output>
        </>
      );
    }

    const container = loadHtml('<div id="root"></div>').getElementById('root');
    if (!container) throw new Error('No root');
    const root = createRoot(container);
    act(() => {
      root.render(<ControlledForm />);
    });

    act(() => {
      autofill(container, SAMPLE_PROFILE);
    });

    expect(container.querySelector('output')?.textContent).toBe('Alex');
    act(() => {
      root.unmount();
    });
  });
});
