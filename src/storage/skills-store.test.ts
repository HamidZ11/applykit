import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addSkills,
  emptySkillsProjects,
  skillsProjectsErrors,
} from '@/domain/skills-projects';
import { savedSkills } from '@/test/skills-fixtures';
import { browserSkillsStore as store } from './skills-store';

const NOW = new Date('2026-10-18T12:00:00.000Z');
const LATER = new Date('2026-10-18T13:00:00.000Z');

async function raw(key = 'skillsProjects') {
  return (await fakeBrowser.storage.local.get(key))[key];
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('skills store', () => {
  it('starts empty', async () => {
    expect(await store.load()).toEqual({
      status: 'loaded',
      content: emptySkillsProjects(),
      updatedAt: null,
      damaged: false,
    });
  });

  it('saves and reads skills and projects', async () => {
    expect(await store.save(savedSkills(), null, NOW)).toMatchObject({
      status: 'saved',
    });

    expect(await store.load()).toEqual({
      status: 'loaded',
      content: savedSkills(),
      updatedAt: NOW.toISOString(),
      damaged: false,
    });
  });

  it('never writes over a save from another tab', async () => {
    await store.save(savedSkills(), null, NOW);

    const result = await store.save(emptySkillsProjects(), null, LATER);

    expect(result).toMatchObject({
      status: 'conflict',
      current: { content: savedSkills() },
    });
    expect(await store.load()).toMatchObject({ content: savedSkills() });
  });

  it('keeps fields a later version adds', async () => {
    await fakeBrowser.storage.local.set({
      skillsProjects: {
        schemaVersion: 1,
        content: { skills: ['Go'], projects: [] },
        updatedAt: NOW.toISOString(),
        languages: ['Welsh'],
      },
    });

    await store.save(savedSkills(), NOW.toISOString(), LATER);

    expect(await raw()).toMatchObject({
      languages: ['Welsh'],
      content: savedSkills(),
    });
  });

  it('reads projects saved without optional fields', async () => {
    await fakeBrowser.storage.local.set({
      skillsProjects: {
        schemaVersion: 1,
        content: {
          skills: ['Go'],
          projects: [{ id: 'a', name: 'A', description: 'B' }],
        },
        updatedAt: NOW.toISOString(),
      },
    });

    expect(await store.load()).toMatchObject({
      content: {
        projects: [
          { id: 'a', name: 'A', description: 'B', technologies: [], link: '' },
        ],
      },
      damaged: false,
    });
  });

  it('leaves out damaged entries and backs them up before saving', async () => {
    const stored = {
      schemaVersion: 1,
      content: { skills: ['Go', 7], projects: [{ id: 'x' }] },
      updatedAt: NOW.toISOString(),
    };
    await fakeBrowser.storage.local.set({ skillsProjects: stored });

    expect(await store.load()).toMatchObject({
      content: { skills: ['Go'], projects: [] },
      damaged: true,
    });
    await store.save(savedSkills(), NOW.toISOString(), LATER);

    expect(await raw('skillsProjectsBackup')).toEqual([
      { backedUpAt: LATER.toISOString(), data: stored },
    ]);
  });

  it('never writes over data from a newer version', async () => {
    const newer = {
      schemaVersion: 3,
      content: {},
      updatedAt: NOW.toISOString(),
    };
    await fakeBrowser.storage.local.set({ skillsProjects: newer });

    expect(await store.load()).toEqual({ status: 'unsupported' });
    expect(await store.save(savedSkills(), null, LATER)).toEqual({
      status: 'unsupported',
    });
    expect(await raw()).toEqual(newer);
  });

  it('reports storage failures', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );

    expect(await store.save(savedSkills(), null, NOW)).toEqual({
      status: 'error',
    });
  });
});

describe('skills and projects rules', () => {
  it('adds typed or pasted skills once each', () => {
    expect(addSkills(['Python'], 'python, Rust ,  Go\nSQL;')).toEqual([
      'Python',
      'Rust',
      'Go',
      'SQL',
    ]);
  });

  it('accepts the fictional fixture', () => {
    expect(skillsProjectsErrors(savedSkills())).toEqual({});
  });

  it('requires a name and description, and a web address for links', () => {
    const content = savedSkills();
    const [first, ...rest] = content.projects;
    if (!first) throw new Error('No project');
    content.projects = [
      { ...first, name: ' ', description: '', link: 'javascript:alert(1)' },
      ...rest,
    ];

    expect(skillsProjectsErrors(content)).toEqual({
      'project.inventory.name': 'Enter the project’s name.',
      'project.inventory.description':
        'Describe the project in a sentence or two.',
      'project.inventory.link': 'Enter a full web address, starting https://.',
    });
  });

  it('limits sizes', () => {
    const errors = skillsProjectsErrors({
      skills: Array.from({ length: 61 }, (_, i) => `Skill ${String(i)}`),
      projects: [],
    });

    expect(errors.skills).toBe('List at most 60 skills.');
  });
});

describe('skills store migration', () => {
  const v1 = {
    schemaVersion: 1,
    content: {
      skills: ['Go'],
      projects: [
        {
          id: 'old',
          name: 'Example Old Tool',
          description: 'Saved before project details existed.',
          technologies: ['Go'],
          link: '',
        },
      ],
    },
    updatedAt: NOW.toISOString(),
  };

  it('reads version 1 projects with empty details', async () => {
    await fakeBrowser.storage.local.set({ skillsProjects: v1 });

    expect(await store.load()).toEqual({
      status: 'loaded',
      content: {
        skills: ['Go'],
        projects: [
          {
            ...v1.content.projects[0],
            contribution: '',
            challenge: '',
            result: '',
          },
        ],
      },
      updatedAt: NOW.toISOString(),
      damaged: false,
    });
  });

  it('saves as version 2, keeping everything', async () => {
    await fakeBrowser.storage.local.set({ skillsProjects: v1 });
    const loaded = await store.load();
    if (loaded.status !== 'loaded') throw new Error('not loaded');
    const [project] = loaded.content.projects;
    if (!project) throw new Error('no project');

    await store.save(
      {
        ...loaded.content,
        projects: [{ ...project, result: 'Still in use.' }],
      },
      NOW.toISOString(),
      LATER,
    );

    expect(await raw()).toMatchObject({
      schemaVersion: 2,
      content: {
        skills: ['Go'],
        projects: [
          { id: 'old', name: 'Example Old Tool', result: 'Still in use.' },
        ],
      },
    });
  });

  it('round-trips project details', async () => {
    await store.save(savedSkills(), null, NOW);

    expect(await store.load()).toMatchObject({
      content: {
        projects: [
          {
            contribution: 'Wrote the data import and the weekly report.',
            challenge: 'Duplicate stock records broke the totals.',
            result: 'Stock counts matched the warehouse again.',
          },
          {},
        ],
      },
    });
  });

  it('treats a damaged detail as a damaged project', async () => {
    await fakeBrowser.storage.local.set({
      skillsProjects: {
        ...v1,
        schemaVersion: 2,
        content: {
          skills: [],
          projects: [{ ...v1.content.projects[0], result: 42 }],
        },
      },
    });

    expect(await store.load()).toMatchObject({
      content: { projects: [] },
      damaged: true,
    });
  });
});
