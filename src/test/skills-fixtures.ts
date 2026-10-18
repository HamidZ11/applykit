import type { SkillsProjects } from '@/domain/skills-projects';

/** Fictional skills and projects for tests; never anyone's real work. */
export function savedSkills(): SkillsProjects {
  return {
    skills: ['Python', 'TypeScript', 'PostgreSQL'],
    projects: [
      {
        id: 'inventory',
        name: 'Inventory Dashboard',
        description:
          'Built a dashboard for tracking stock and generating reports.',
        technologies: ['Python', 'PostgreSQL'],
        link: 'https://example.com/inventory',
      },
      {
        id: 'timetable',
        name: 'Example Timetable Planner',
        description: 'A small web app that plans study timetables.',
        technologies: ['TypeScript'],
        link: '',
      },
    ],
  };
}
