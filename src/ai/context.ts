import type { SkillsProjects } from '@/domain/skills-projects';
import type { UserProfile, YearMonth } from '@/domain/user-profile';
import type { OpenQuestionKind } from '@/autofill/open-question';

/**
 * What AI drafting may share, built by the background worker from the
 * confirmed profile and the saved skills and projects (ADR 0019). Only
 * professional facts: skills, projects, jobs and education. Never names,
 * contact details, address, links, diversity preferences or saved answers.
 * Each item's `text` is exactly what is sent if the user selects it.
 */

export type ContextGroup = 'skills' | 'project' | 'job' | 'education';

export interface ContextItem {
  /** Stable for the same saved entry: `skills`, `project:<id>`. */
  id: string;
  group: ContextGroup;
  label: string;
  text: string;
}

const MAX_JOBS = 5;
const MAX_EDUCATION = 4;
const MAX_DESCRIPTION = 600;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function month(value: YearMonth): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const name = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && name ? `${name} ${match[1] ?? ''}` : '';
}

function period(start: YearMonth, end: YearMonth, current: boolean): string {
  const from = month(start);
  const to = current ? 'present' : month(end);
  if (from && to) return ` (${from} to ${to})`;
  if (to) return ` (until ${to})`;
  return from ? ` (from ${from})` : '';
}

function clip(text: string, max: number): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** Every item the user could choose to share, most recent first. */
export function contextItems(
  profile: UserProfile | null,
  saved: SkillsProjects,
): ContextItem[] {
  const items: ContextItem[] = [];
  if (saved.skills.length > 0) {
    items.push({
      id: 'skills',
      group: 'skills',
      label: 'Skills',
      text: saved.skills.join(', '),
    });
  }
  for (const project of saved.projects) {
    const technologies =
      project.technologies.length > 0
        ? ` Technologies: ${project.technologies.join(', ')}.`
        : '';
    items.push({
      id: `project:${project.id}`,
      group: 'project',
      label: `Project: ${project.name}`,
      text: `${project.name}: ${clip(project.description, MAX_DESCRIPTION)}${technologies}`,
    });
  }
  const jobs = [...(profile?.employment ?? [])]
    .filter((job) => job.title.trim() !== '' || job.employer.trim() !== '')
    .sort((a, b) => recency(b) - recency(a))
    .slice(0, MAX_JOBS);
  for (const job of jobs) {
    const role = [job.title, job.employer].filter(Boolean).join(' at ');
    const duties = job.description.trim()
      ? `. ${clip(job.description, MAX_DESCRIPTION)}`
      : '';
    items.push({
      id: `job:${job.id}`,
      group: 'job',
      label: `Job: ${role}`,
      text: `${role}${period(job.startDate, job.endDate, job.current)}${duties}`,
    });
  }
  const education = [...(profile?.education ?? [])]
    .filter((record) => record.institution.trim() !== '')
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, MAX_EDUCATION);
  for (const record of education) {
    const subject = [record.qualification, record.fieldOfStudy]
      .filter(Boolean)
      .join(' in ');
    const grade = record.grade.trim() ? `, ${record.grade.trim()}` : '';
    items.push({
      id: `education:${record.id}`,
      group: 'education',
      label: `Education: ${subject || record.institution}`,
      text: `${subject ? `${subject}, ` : ''}${record.institution}${period(record.startDate, record.endDate, false)}${grade}`,
    });
  }
  return items;
}

/** Current jobs first, then by end date, then start date. */
function recency(job: UserProfile['employment'][number]): number {
  if (job.current) return Number.MAX_SAFE_INTEGER;
  const date = job.endDate || job.startDate;
  return Number(date.replace('-', '')) || 0;
}

/**
 * What a question of `kind` usually needs, chosen by default; the user can
 * untick any of it before sending.
 */
export function defaultSelection(
  kind: OpenQuestionKind,
  items: readonly ContextItem[],
): string[] {
  const first = (group: ContextGroup, count = 1) =>
    items
      .filter((item) => item.group === group)
      .slice(0, count)
      .map((item) => item.id);
  switch (kind) {
    case 'skills':
      return [...first('skills'), ...first('job')];
    case 'project':
      return first('project', 3);
    case 'experience':
      return [...first('job', 3), ...first('education')];
    case 'problem':
      return [...first('project', 2), ...first('job')];
    case 'motivation':
      return [...first('skills'), ...first('job'), ...first('education')];
  }
}
