import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { CvFile, CvReadResult } from '@/cv/read';
import {
  emptyDraft,
  newEmploymentRecord,
  type ProfileDraft,
} from '@/domain/user-profile';
import { CLASSIC_CV } from '@/test/cv-fixtures';
import { validDraft } from '@/test/profile-fixtures';
import { CvImport } from './CvImport';

const extraction = vi.hoisted(() => ({ fails: false }));
vi.mock('@/cv/extract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/cv/extract')>();
  return {
    ...actual,
    extractCv: (text: string) => {
      if (extraction.fails) throw new Error('unexpected text');
      return actual.extractCv(text);
    },
  };
});

let root: Root;
let host: HTMLElement;
let onApply: ReturnType<
  typeof vi.fn<(draft: ProfileDraft, changes: number) => void>
>;
let onCancel: ReturnType<typeof vi.fn<() => void>>;

function reads(result: CvReadResult) {
  return vi.fn<(file: CvFile) => Promise<CvReadResult>>(() =>
    Promise.resolve(result),
  );
}

const readsClassicCv = () =>
  reads({ ok: true, kind: 'pdf', text: CLASSIC_CV, notes: [] });

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function render(
  read: (file: CvFile) => Promise<CvReadResult>,
  draft: ProfileDraft = emptyDraft(),
  editing = false,
) {
  act(() => {
    root.render(
      <CvImport
        draft={draft}
        editing={editing}
        read={read}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );
  });
}

async function chooseFile(name = 'Alex_Sample_CV.pdf') {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('No file input');
  const file = new File(['fictional'], name, { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
  });
  return file;
}

function button(name: string | RegExp): HTMLButtonElement {
  const match = [...host.querySelectorAll('button')].find((candidate) => {
    const label =
      candidate.getAttribute('aria-label') ?? candidate.textContent.trim();
    return typeof name === 'string' ? label === name : name.test(label);
  });
  if (!match) throw new Error(`No button ${String(name)}`);
  return match;
}

function checkbox(label: string): HTMLInputElement {
  const box = host.querySelector<HTMLInputElement>(
    `input[type="checkbox"][aria-label="${label}"]`,
  );
  if (!box) throw new Error(`No checkbox ${label}`);
  return box;
}

function textbox(label: string): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(
    `input[type="text"][aria-label="${label}"]`,
  );
  if (!input) throw new Error(`No text box ${label}`);
  return input;
}

function row(label: string): HTMLElement {
  const element = checkbox(label).closest('li');
  if (!element) throw new Error(`No row ${label}`);
  return element;
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Reflect.set(HTMLInputElement.prototype, 'value', value, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function click(element: HTMLElement) {
  act(() => {
    element.click();
  });
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  onApply = vi.fn<(draft: ProfileDraft, changes: number) => void>();
  onCancel = vi.fn<() => void>();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

describe('choosing a file', () => {
  it('explains the requirements and that the CV stays on this device', () => {
    render(readsClassicCv());

    expect(host.textContent).toContain('PDF or Word (.docx), up to 5 MB');
    expect(host.textContent).toContain('It is not uploaded');
  });

  it('reads the chosen file and shows what was found', async () => {
    const read = readsClassicCv();
    render(read);

    const file = await chooseFile();

    expect(read).toHaveBeenCalledWith(file);
    expect(host.querySelector('h1')?.textContent).toBe(
      'Review what ApplyKit found',
    );
    expect(host.textContent).toContain('Alex_Sample_CV.pdf');
    expect(textbox('First name').value).toBe('Alex');
    expect(row('Use for First name').textContent).toContain('Confident');
    expect(row('Use for Town or city').textContent).toContain('Check this');
    expect(row('Use for Email address').textContent).toContain(
      'From your CV: “London, United Kingdom | +44 7700 900123 | alex.sample@example.com”',
    );
    expect(host.textContent).toContain('Senior Product Designer');
  });

  it('accepts a file dropped onto the drop zone', async () => {
    const read = readsClassicCv();
    render(read);
    const zone = host.querySelector('.border-dashed');
    const file = new File(['fictional'], 'cv.docx');
    const drop = new Event('drop', { bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });

    await act(async () => {
      zone?.dispatchEvent(drop);
      await flush();
    });

    expect(read).toHaveBeenCalledWith(file);
  });

  it.each([
    ['no-text', 'Scanned CVs are images'],
    ['password', 'password-protected'],
    ['too-large', 'larger than 5 MB'],
    ['unsupported', 'PDF and Word (.docx)'],
  ] as const)(
    'explains a %s file and lets the user try another',
    async (error, text) => {
      render(reads({ ok: false, error }));

      await chooseFile();

      expect(host.querySelector('[role="alert"]')?.textContent).toContain(text);
      expect(button('Choose a file')).toBeTruthy();
    },
  );

  it('says so when nothing in the CV is recognised', async () => {
    render(
      reads({
        ok: true,
        kind: 'docx',
        text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
        notes: [],
      }),
    );

    await chooseFile();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'could not find any details',
    );
  });

  it('recovers when the details cannot be extracted', async () => {
    extraction.fails = true;
    try {
      render(reads({ ok: true, kind: 'docx', text: CLASSIC_CV, notes: [] }));

      await chooseFile();

      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        'could not read the details',
      );
      expect(button('Choose a file')).toBeTruthy();
    } finally {
      extraction.fails = false;
    }
  });

  it('shows notes about the document', async () => {
    render(
      reads({
        ok: true,
        kind: 'pdf',
        text: CLASSIC_CV,
        notes: ['Only the first 10 of 12 pages were read.'],
      }),
    );

    await chooseFile();

    expect(host.textContent).toContain(
      'Only the first 10 of 12 pages were read.',
    );
  });

  it('cancels without changing anything', () => {
    render(readsClassicCv());

    click(button('Cancel'));

    expect(onCancel).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('reviewing', () => {
  it('applies only the selected and corrected suggestions', async () => {
    render(readsClassicCv());
    await chooseFile();

    click(checkbox('Use for LinkedIn')); // untick a confident suggestion
    type(textbox('Town or city'), 'Manchester'); // correct and select
    click(checkbox('Add Product Designer')); // untick the second role
    click(button('Add to profile'));

    const [draft, changes] = onApply.mock.calls[0] ?? [];
    expect(draft?.personal).toMatchObject({
      firstName: 'Alex',
      lastName: 'Sample',
      email: 'alex.sample@example.com',
      phone: '+44 7700 900123',
      address: { city: 'Manchester' },
    });
    expect(draft?.links.linkedin).toBe('');
    expect(draft?.links.github).toBe('https://github.com/alexsample');
    expect(draft?.employment.map((r) => r.title)).toEqual([
      'Senior Product Designer',
    ]);
    expect(draft?.education).toHaveLength(1);
    expect(changes).toBe(8);
  });

  it('keeps existing values unless the user chooses to replace them', async () => {
    const draft = validDraft();
    draft.personal.firstName = 'Alexandra';
    render(readsClassicCv(), draft, true);
    await chooseFile();

    expect(row('Use for First name').textContent).toContain(
      'Currently Alexandra. Kept unless you tick this.',
    );
    expect(checkbox('Use for First name').checked).toBe(false);
    expect(row('Use for Email address').textContent).toContain(
      'Already in your profile',
    );
    click(button('Add to profile'));

    expect(onApply.mock.calls[0]?.[0].personal.firstName).toBe('Alexandra');
  });

  it('shows records already in the profile without offering them again', async () => {
    const draft = emptyDraft();
    draft.employment.push({
      ...newEmploymentRecord(),
      employer: 'Northwind Ltd',
      title: 'Senior Product Designer',
    });
    render(readsClassicCv(), draft);
    await chooseFile();

    const duplicate = checkbox('Add Senior Product Designer');
    expect(duplicate.disabled).toBe(true);
    expect(duplicate.closest('li')?.textContent).toContain(
      'Already in your profile',
    );
  });

  it('cannot apply when nothing is selected', async () => {
    render(
      reads({
        ok: true,
        kind: 'pdf',
        text: 'Alex Sample\nalex.sample@example.com',
        notes: [],
      }),
      validDraft(),
      true,
    );
    await chooseFile();

    expect(button('Add to profile').disabled).toBe(true);
  });

  it('renders text from the CV as plain text, never as markup', async () => {
    render(
      reads({
        ok: true,
        kind: 'docx',
        text: 'Alex Sample\nalex@example.com <img src=x onerror=alert(1)>',
        notes: [],
      }),
    );
    await chooseFile();

    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
