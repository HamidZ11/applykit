import type { SkillsProjects } from '@/domain/skills-projects';
import type { UserProfile } from '@/domain/user-profile';
import { fullProfile } from './autofill-fixtures';

/**
 * Fictional applicants for the AI drafting evaluation. Kept apart from
 * every other fixture and from any real person's information.
 */

export interface Applicant {
  profile: UserProfile;
  saved: SkillsProjects;
}

/** A computing student with software projects and an unrelated job. */
export function softwareStudent(): Applicant {
  const profile = fullProfile();
  profile.employment = [
    {
      id: 'cafe',
      employer: 'Example Corner Café',
      title: 'Barista',
      employmentType: 'part-time',
      startDate: '2024-09',
      endDate: '',
      current: true,
      description: 'Made drinks, handled the till and trained new staff.',
    },
  ];
  profile.education = [
    {
      id: 'bsc',
      institution: 'University of Example',
      qualification: 'BSc Computer Science',
      fieldOfStudy: 'Computer Science',
      startDate: '2024-09',
      endDate: '2027-06',
      grade: '',
    },
  ];
  return {
    profile,
    saved: {
      skills: ['Python', 'SQL', 'Git'],
      projects: [
        {
          id: 'rota',
          name: 'Example Rota Planner',
          description: 'A web app that plans weekly shifts for a small café.',
          technologies: ['Python', 'Flask', 'SQLite'],
          link: '',
          contribution: 'Built the scheduling logic and the shift export.',
          challenge: 'Overlapping shifts were double-booked.',
          result: 'The café used it for a term instead of a spreadsheet.',
        },
        {
          id: 'notes',
          name: 'Example Lecture Notes Search',
          description: 'A search tool for my own lecture notes.',
          technologies: ['Python'],
          link: '',
          contribution: '',
          challenge: '',
          result: '',
        },
      ],
    },
  };
}

/** A career changer with one retail job and nothing else saved. */
export function sparseApplicant(): Applicant {
  const profile = fullProfile();
  profile.employment = [
    {
      id: 'shop',
      employer: 'Example Hardware Store',
      title: 'Sales Assistant',
      employmentType: 'full-time',
      startDate: '2021-03',
      endDate: '',
      current: true,
      description: 'Served customers and kept the shop floor stocked.',
    },
  ];
  profile.education = [];
  return { profile, saved: { skills: [], projects: [] } };
}
