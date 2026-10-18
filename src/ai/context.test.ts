import { describe, expect, it } from 'vitest';
import { emptySkillsProjects } from '@/domain/skills-projects';
import {
  educationRecords,
  employmentRecords,
  fullProfile,
} from '@/test/autofill-fixtures';
import { savedSkills } from '@/test/skills-fixtures';
import { contextItems, defaultSelection } from './context';

function profile() {
  const p = fullProfile();
  p.education = educationRecords();
  p.employment = employmentRecords();
  return p;
}

describe('contextItems', () => {
  it('offers skills, projects, jobs and education as written', () => {
    expect(contextItems(profile(), savedSkills())).toEqual([
      {
        id: 'skills',
        group: 'skills',
        label: 'Skills',
        text: 'Python, TypeScript, PostgreSQL',
      },
      {
        id: 'project:inventory',
        group: 'project',
        label: 'Project: Inventory Dashboard',
        text: 'Inventory Dashboard: Built a dashboard for tracking stock and generating reports. Technologies: Python, PostgreSQL. My part: Wrote the data import and the weekly report. Challenge: Duplicate stock records broke the totals. Result: Stock counts matched the warehouse again.',
      },
      {
        id: 'project:timetable',
        group: 'project',
        label: 'Project: Example Timetable Planner',
        text: 'Example Timetable Planner: A small web app that plans study timetables. Technologies: TypeScript.',
      },
      {
        id: 'job:testing',
        group: 'job',
        label: 'Job: Test Centre Associate at Example Testing Services',
        text: 'Test Centre Associate at Example Testing Services (Feb 2025 to present). Welcomed candidates, checked identification and invigilated computer-based exams.',
      },
      {
        id: 'job:logistics',
        group: 'job',
        label: 'Job: Warehouse Operative at Example Logistics',
        text: 'Warehouse Operative at Example Logistics (Jan 2024 to Jan 2025). Picked and packed orders, ran stock counts and kept the loading bay safe.',
      },
      {
        id: 'education:degree',
        group: 'education',
        label: 'Education: BSc Computer Science in Computer Science',
        text: 'BSc Computer Science in Computer Science, University of Example (Sep 2024 to Jun 2027)',
      },
      {
        id: 'education:a-levels',
        group: 'education',
        label: 'Education: A levels in Mathematics, Physics, Computing',
        text: 'A levels in Mathematics, Physics, Computing, Example Sixth Form College (Sep 2022 to Jun 2024), A*AA',
      },
    ]);
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

describe('defaultSelection', () => {
  const items = contextItems(profile(), savedSkills());

  it.each([
    ['skills', ['skills', 'job:testing']],
    ['project', ['project:inventory', 'project:timetable']],
    ['experience', ['job:testing', 'job:logistics', 'education:degree']],
    ['problem', ['project:inventory', 'project:timetable', 'job:testing']],
    ['motivation', ['skills', 'job:testing', 'education:degree']],
  ] as const)('chooses what a %s question needs', (kind, ids) => {
    expect(defaultSelection(kind, items)).toEqual(ids);
  });
});
