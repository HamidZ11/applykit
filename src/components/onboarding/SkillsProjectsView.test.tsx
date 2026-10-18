import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setInputValue } from '@/autofill/fill';
import { browserSkillsStore } from '@/storage/skills-store';
import { savedSkills } from '@/test/skills-fixtures';
import { SkillsProjectsView } from './SkillsProjectsView';

const NOW = new Date('2026-10-18T12:00:00.000Z');

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(now = NOW) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(<SkillsProjectsView now={() => now} />);
  });
  await flush();
}

function button(name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name,
  );
  if (!found) throw new Error(`No button ${name}`);
  return found;
}

async function click(name: string) {
  act(() => {
    button(name).click();
  });
  await flush();
}

function field(
  label: string,
  index = 0,
): HTMLInputElement | HTMLTextAreaElement {
  const labels = [...host.querySelectorAll('label')].filter(
    (l) => l.textContent.replace(/Optional$/, '').trim() === label,
  );
  const element = document.getElementById(labels[index]?.htmlFor ?? '');
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    throw new Error(`No field ${label}`);
  }
  return element;
}

function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    setInputValue(element, value);
  });
}

describe('SkillsProjectsView', () => {
  it('starts empty and optional', async () => {
    await render();

    expect(host.querySelector('h1')?.textContent).toBe('Skills & projects');
    expect(host.textContent).toContain('Optional.');
    expect(button('Saved').disabled).toBe(true);
  });

  it('adds skills, including several at once, and saves them', async () => {
    await render();

    type(field('Add a skill'), 'Python, TypeScript');
    await click('Add');
    type(field('Add a skill'), 'python');
    act(() => {
      field('Add a skill').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    await click('Save skills and projects');

    expect(await browserSkillsStore.load()).toMatchObject({
      content: { skills: ['Python', 'TypeScript'], projects: [] },
    });
    expect(host.textContent).toContain('Skills and projects saved.');
  });

  it('removes a skill', async () => {
    await browserSkillsStore.save(savedSkills(), null, NOW);
    await render(new Date('2026-10-18T13:00:00.000Z'));

    await click('Remove TypeScript');
    await click('Save skills and projects');

    expect(await browserSkillsStore.load()).toMatchObject({
      content: { skills: ['Python', 'PostgreSQL'] },
    });
  });

  it('adds a project with typed technologies', async () => {
    await render();

    await click('Add project');
    type(field('Name'), 'Example Rota Tool');
    type(field('Short description'), 'Plans weekly shifts for a café.');
    type(field('Technologies'), 'Python, ');
    expect(field('Technologies').value).toBe('Python, ');
    type(field('Technologies'), 'Python, Flask');
    await click('Save skills and projects');

    expect(await browserSkillsStore.load()).toMatchObject({
      content: {
        projects: [
          {
            name: 'Example Rota Tool',
            description: 'Plans weekly shifts for a café.',
            technologies: ['Python', 'Flask'],
            link: '',
          },
        ],
      },
    });
  });

  it('explains what to fix instead of saving an incomplete project', async () => {
    await render();

    await click('Add project');
    type(field('Link'), 'not a link');
    await click('Save skills and projects');

    expect(host.textContent).toContain('Enter the project’s name.');
    expect(host.textContent).toContain('Enter a full web address');
    expect(await browserSkillsStore.load()).toMatchObject({ updatedAt: null });
  });

  it('discards changes', async () => {
    await browserSkillsStore.save(savedSkills(), null, NOW);
    await render();

    await click('Remove project');
    await click('Discard changes');

    expect(host.querySelectorAll('li[aria-label]')).toHaveLength(2);
    expect(field('Technologies').value).toBe('Python, PostgreSQL');
  });

  it('never overwrites a save from another tab', async () => {
    await browserSkillsStore.save(savedSkills(), null, NOW);
    await render(new Date('2026-10-18T14:00:00.000Z'));
    await click('Remove Python');
    await browserSkillsStore.save(
      { ...savedSkills(), skills: ['Go'] },
      NOW.toISOString(),
      new Date('2026-10-18T13:00:00.000Z'),
    );

    await click('Save skills and projects');

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'changed in another tab',
    );
    expect(await browserSkillsStore.load()).toMatchObject({
      content: { skills: ['Go'] },
    });
  });

  it('is read-only for data from a newer version', async () => {
    await fakeBrowser.storage.local.set({
      skillsProjects: { schemaVersion: 2, content: {}, updatedAt: '' },
    });

    await render();

    expect(host.textContent).toContain('saved by a newer version');
    expect(host.querySelectorAll('input, textarea, button')).toHaveLength(0);
  });
});

describe('removing projects without losing other changes', () => {
  function projects(): HTMLLIElement[] {
    return [...host.querySelectorAll<HTMLLIElement>('li[aria-label]')];
  }

  function inProject(index: number, label: string) {
    const item = projects()[index];
    const labelEl = [...(item?.querySelectorAll('label') ?? [])].find(
      (l) => l.textContent.replace(/Optional$/, '').trim() === label,
    );
    const element = document.getElementById(labelEl?.htmlFor ?? '');
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      throw new Error(`No ${label} in project ${String(index)}`);
    }
    return element;
  }

  function removeIn(index: number) {
    const remove = [
      ...(projects()[index]?.querySelectorAll('button') ?? []),
    ].find((b) => b.textContent.trim() === 'Remove project');
    act(() => {
      remove?.click();
    });
  }

  it('keeps unrelated edits when an accidental project is removed after a failed save', async () => {
    await browserSkillsStore.save(savedSkills(), null, NOW);
    await render(new Date('2026-10-18T13:00:00.000Z'));
    type(inProject(0, 'Short description'), 'Edited description.');
    await click('Add project');
    type(inProject(2, 'Name'), 'Half-finished');
    await click('Save skills and projects');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Some details need fixing',
    );

    removeIn(2);
    await flush();

    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(inProject(0, 'Short description').value).toBe('Edited description.');
    await click('Save skills and projects');
    expect(await browserSkillsStore.load()).toMatchObject({
      content: {
        projects: [
          { id: 'inventory', description: 'Edited description.' },
          { id: 'timetable' },
        ],
      },
    });
  });

  it('drops a blank project added by mistake instead of blocking the save', async () => {
    await render();
    type(field('Add a skill'), 'Go');
    await click('Add');
    await click('Add project');
    type(inProject(0, 'Name'), 'Example Rota Tool');
    type(inProject(0, 'Short description'), 'Plans shifts.');
    await click('Add project');

    await click('Save skills and projects');

    expect(await browserSkillsStore.load()).toMatchObject({
      content: {
        skills: ['Go'],
        projects: [{ name: 'Example Rota Tool' }],
      },
    });
    expect(projects()).toHaveLength(1);
  });

  it('removes a project from the middle, keeping the others’ typed text', async () => {
    await render();
    for (const name of ['One', 'Two', 'Three']) {
      await click('Add project');
      const last = projects().length - 1;
      type(inProject(last, 'Name'), name);
      type(inProject(last, 'Short description'), `${name} description.`);
      type(inProject(last, 'Technologies'), `${name}Lang, `);
    }

    removeIn(1);
    await flush();

    expect(projects().map((p) => p.getAttribute('aria-label'))).toEqual([
      'One',
      'Three',
    ]);
    expect(inProject(1, 'Technologies').value).toBe('ThreeLang, ');
    await click('Save skills and projects');
    expect(await browserSkillsStore.load()).toMatchObject({
      content: {
        projects: [
          { name: 'One', technologies: ['OneLang'] },
          { name: 'Three', technologies: ['ThreeLang'] },
        ],
      },
    });
  });

  it('removes a saved project and saves', async () => {
    await browserSkillsStore.save(savedSkills(), null, NOW);
    await render(new Date('2026-10-18T13:00:00.000Z'));

    removeIn(0);
    await flush();
    await click('Save skills and projects');

    expect(await browserSkillsStore.load()).toMatchObject({
      content: { projects: [{ id: 'timetable' }] },
    });
  });

  it('keeps a skill typed but not yet added when saving', async () => {
    await render();
    type(field('Add a skill'), 'Rust');

    await click('Save skills and projects');

    expect(await browserSkillsStore.load()).toMatchObject({
      content: { skills: ['Rust'] },
    });
  });
});
