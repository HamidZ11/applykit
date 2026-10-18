import { describe, expect, it } from 'vitest';
import { emptySkillsProjects } from '@/domain/skills-projects';
import type { UserProfile } from '@/domain/user-profile';
import {
  educationRecords,
  employmentRecords,
  fullProfile,
} from '@/test/autofill-fixtures';
import { savedSkills } from '@/test/skills-fixtures';
import { contextItems, rankContext } from './context';

function profile(): UserProfile {
  const p = fullProfile();
  p.education = educationRecords();
  p.employment = employmentRecords();
  return p;
}

describe('contextItems', () => {
  it('offers each saved entry with its exact shared text', () => {
    const items = contextItems(profile(), savedSkills());

    expect(items.map((i) => [i.group, i.title, i.summary])).toEqual([
      ['skills', 'Technical skills', 'Python · TypeScript · PostgreSQL'],
      ['project', 'Inventory Dashboard', 'Python · PostgreSQL'],
      ['project', 'Example Timetable Planner', 'TypeScript'],
      [
        'job',
        'Test Centre Associate · Example Testing Services',
        'Feb 2025 to present',
      ],
      [
        'job',
        'Warehouse Operative · Example Logistics',
        'Jan 2024 to Jan 2025',
      ],
      [
        'education',
        'BSc Computer Science in Computer Science',
        'University of Example · Sep 2024 to Jun 2027',
      ],
      [
        'education',
        'A levels in Mathematics, Physics, Computing',
        'Example Sixth Form College · Sep 2022 to Jun 2024',
      ],
    ]);
    expect(items[1]?.text).toBe(
      'Project: Inventory Dashboard: Built a dashboard for tracking stock and generating reports. Technologies: Python, PostgreSQL. My part: Wrote the data import and the weekly report. Challenge: Duplicate stock records broke the totals. Result: Stock counts matched the warehouse again.',
    );
    expect(items[3]?.text).toBe(
      'Job: Test Centre Associate at Example Testing Services (Feb 2025 to present). Welcomed candidates, checked identification and invigilated computer-based exams.',
    );
  });

  it('never offers contact details, address, links or names', () => {
    const shared = JSON.stringify(contextItems(profile(), savedSkills()));
    const { personal, links } = profile();

    for (const value of [
      personal.firstName,
      personal.lastName,
      personal.email,
      personal.phone,
      personal.address.line1,
      personal.address.postcode,
      links.linkedin,
      links.github,
      'example.com/inventory',
    ]) {
      expect(shared, value).not.toContain(value);
    }
  });

  it('offers nothing when nothing is saved', () => {
    expect(contextItems(null, emptySkillsProjects())).toEqual([]);
  });
});

describe('rankContext', () => {
  function rank(
    kind: Parameters<typeof rankContext>[0],
    question: string,
    saved = savedSkills(),
  ) {
    return rankContext(kind, profile(), saved, question);
  }

  it('chooses skills and software projects for a skills question, not unrelated jobs', () => {
    const ranked = rank(
      'skills',
      'Describe your programming skills in two sentences.',
    );

    expect(ranked.selected).toEqual([
      'skills',
      'project:inventory',
      'project:timetable',
    ]);
    // Selected items come first in the preview.
    expect(ranked.items.slice(0, 3).map((i) => i.id)).toEqual(ranked.selected);
  });

  it('includes a job for a skills question only when it is technical', () => {
    const p = profile();
    p.employment = [
      ...employmentRecords(),
      {
        id: 'support',
        employer: 'Example Help Desk',
        title: 'IT Support Assistant',
        employmentType: 'part-time',
        startDate: '2023-01',
        endDate: '2023-08',
        current: false,
        description:
          'Fixed laptops and wrote Python scripts to reset accounts.',
      },
    ];

    expect(
      rankContext(
        'skills',
        p,
        savedSkills(),
        'What technical skills would you bring?',
      ).selected,
    ).toContain('job:support');
  });

  it('chooses the closest project, not the first or newest', () => {
    expect(
      rank('project', 'Tell us about the timetable planner you built.')
        .selected,
    ).toEqual(['project:timetable']);
    // With no project named, the one with the most detail.
    expect(
      rank('project', 'Tell us about a project you worked on.').selected,
    ).toEqual(['project:inventory']);
  });

  it('prefers a recorded challenge for a problem question, and invents none', () => {
    expect(rank('problem', 'Describe a problem you solved.').selected).toEqual([
      'project:inventory',
    ]);
    const without = savedSkills();
    without.projects = without.projects.map((p) => ({ ...p, challenge: '' }));

    expect(
      rank('problem', 'Describe a problem you solved.', without).selected,
    ).toEqual([]);
  });

  it('chooses jobs for experience, but not unrelated ones for a technical question', () => {
    expect(
      rank('experience', 'What relevant experience do you have?').selected,
    ).toEqual(['job:testing', 'job:logistics']);
    expect(
      rank('experience', 'What software development experience do you have?')
        .selected,
    ).toEqual(['skills', 'project:inventory']);
  });

  it('connects motivation to what matches the role, not to every job', () => {
    const ranked = rank(
      'motivation',
      'Why are you interested in this role? Junior Data Engineer Example Fernhill Analytics',
    );

    expect(ranked.selected).toEqual(['skills', 'project:inventory']);
  });

  it('selects nothing that is not saved', () => {
    expect(
      rankContext(
        'skills',
        null,
        emptySkillsProjects(),
        'Describe your skills.',
      ),
    ).toEqual({ items: [], selected: [] });
  });
});
