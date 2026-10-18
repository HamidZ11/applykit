import type { OpenQuestionKind } from '@/autofill/open-question';
import type { SkillsProjects } from '@/domain/skills-projects';
import type { UserProfile, YearMonth } from '@/domain/user-profile';

/**
 * What AI drafting may share, built by the background worker from the
 * confirmed profile and the saved skills and projects (ADR 0019). Only
 * professional facts: skills, projects, jobs and education. Never names,
 * contact details, address, links, diversity preferences or saved answers.
 * Each item's `text` is exactly what is sent if the user selects it; its
 * title and summary only help the user find it.
 */

export type ContextGroup = 'skills' | 'project' | 'job' | 'education';

export interface ContextItem {
  /** Stable for the same saved entry: `skills`, `project:<id>`. */
  id: string;
  group: ContextGroup;
  /** The project's name, the job title and employer, the qualification. */
  title: string;
  /** A few words to recognise it: technologies, dates, institution. */
  summary: string;
  /** Exactly what is sent. */
  text: string;
}

/** What ranking knows about an item; never sent anywhere. */
interface Signals {
  item: ContextItem;
  /** About software, data or other technical work. */
  technical: boolean;
  /** A project with a recorded challenge. */
  challenge: boolean;
  /** How many optional project details are filled in. */
  detail: number;
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

function span(start: YearMonth, end: YearMonth, current: boolean): string {
  const from = month(start);
  const to = current ? 'present' : month(end);
  if (from && to) return `${from} to ${to}`;
  if (to) return `until ${to}`;
  return from ? `from ${from}` : '';
}

function clip(text: string, max: number): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/** Technical work, in words people use for it. */
const TECHNICAL =
  /\b(?:software|developers?|programm\w*|coding|databases?|sql|python|java|javascript|typescript|react|node(?:\.?js)?|cloud|devops|apis?|front-?end|back-?end|full[- ]stack|machine learning|data (?:analy\w*|engineer\w*|science|pipelines?)|analytics|automation|scripts?|computer science|it support|web (?:develop\w*|apps?|applications?|design\w*))\b/i;

function isTechnical(text: string, skills: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return (
    TECHNICAL.test(text) ||
    skills.some(
      (skill) => skill.length > 1 && lower.includes(skill.toLowerCase()),
    )
  );
}

function signalsFor(
  profile: UserProfile | null,
  saved: SkillsProjects,
): Signals[] {
  const signals: Signals[] = [];
  const plain = { technical: false, challenge: false, detail: 0 };
  if (saved.skills.length > 0) {
    const shown = saved.skills.slice(0, 6).join(' · ');
    const more = saved.skills.length - 6;
    signals.push({
      ...plain,
      technical: true,
      item: {
        id: 'skills',
        group: 'skills',
        title: 'Technical skills',
        summary: more > 0 ? `${shown} · +${String(more)} more` : shown,
        text: `Skills: ${saved.skills.join(', ')}`,
      },
    });
  }
  for (const project of saved.projects) {
    const technologies =
      project.technologies.length > 0
        ? ` Technologies: ${project.technologies.join(', ')}.`
        : '';
    const parts: [string, string][] = [
      ['My part', project.contribution],
      ['Challenge', project.challenge],
      ['Result', project.result],
    ];
    const details = parts
      .filter(([, text]) => text.trim() !== '')
      .map(([label, text]) => ` ${label}: ${clip(text, MAX_DESCRIPTION)}`)
      .join('');
    const text = `Project: ${project.name}: ${clip(project.description, MAX_DESCRIPTION)}${technologies}${details}`;
    signals.push({
      technical: isTechnical(text, saved.skills),
      challenge: project.challenge.trim() !== '',
      detail: parts.filter(([, value]) => value.trim() !== '').length,
      item: {
        id: `project:${project.id}`,
        group: 'project',
        title: project.name,
        summary:
          project.technologies.length > 0
            ? project.technologies.join(' · ')
            : clip(project.description, 60),
        text,
      },
    });
  }
  const jobs = [...(profile?.employment ?? [])]
    .filter((job) => job.title.trim() !== '' || job.employer.trim() !== '')
    .sort((a, b) => recency(b) - recency(a))
    .slice(0, MAX_JOBS);
  for (const job of jobs) {
    const role = [job.title, job.employer].filter(Boolean).join(' at ');
    const when = span(job.startDate, job.endDate, job.current);
    const duties = job.description.trim()
      ? `. ${clip(job.description, MAX_DESCRIPTION)}`
      : '';
    const text = `Job: ${role}${when ? ` (${when})` : ''}${duties}`;
    signals.push({
      ...plain,
      technical: isTechnical(`${job.title} ${job.description}`, saved.skills),
      item: {
        id: `job:${job.id}`,
        group: 'job',
        title: [job.title, job.employer].filter(Boolean).join(' · '),
        summary: when,
        text,
      },
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
    const when = span(record.startDate, record.endDate, false);
    const grade = record.grade.trim() ? `, ${record.grade.trim()}` : '';
    const text = `Education: ${subject ? `${subject}, ` : ''}${record.institution}${when ? ` (${when})` : ''}${grade}`;
    signals.push({
      ...plain,
      technical: isTechnical(subject, saved.skills),
      item: {
        id: `education:${record.id}`,
        group: 'education',
        title: subject || record.institution,
        summary: [subject ? record.institution : '', when]
          .filter(Boolean)
          .join(' · '),
        text,
      },
    });
  }
  return signals;
}

/** Every item the user could choose to share. */
export function contextItems(
  profile: UserProfile | null,
  saved: SkillsProjects,
): ContextItem[] {
  return signalsFor(profile, saved).map((s) => s.item);
}

/** Current jobs first, then by end date, then start date. */
function recency(job: UserProfile['employment'][number]): number {
  if (job.current) return Number.MAX_SAFE_INTEGER;
  const date = job.endDate || job.startDate;
  return Number(date.replace('-', '')) || 0;
}

const STOP_WORDS = new Set(
  'about above after again also and any are because been before being between both but can could describe did does doing during each example explain few for from give had has have how into its just more most need our out over own please role same should some such tell than that the their them then there these they this those through too under until very was were what when where which while who why will with would you your yours'.split(
    ' ',
  ),
);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const word of a) if (b.has(word)) count++;
  return count;
}

const TECHNICAL_QUESTION =
  /\b(?:technical|technolog\w*|programm\w*|coding|code|software|developer|engineer\w*|data|tools?|languages?|frameworks?|stack)\b/i;
const STUDY =
  /\b(?:stud\w*|degree|course\w*|universit\w*|graduat\w*|academic|modules?|dissertation)\b/i;

export interface RankedContext {
  /** Every item, most relevant first. */
  items: ContextItem[];
  /** What is ticked by default; the user's own choice always wins. */
  selected: string[];
}

/**
 * A small, explainable ranking: what each kind of question needs, and how
 * many words an item shares with the question, role and employer.
 * Technical questions never pull in jobs that are not technical; a
 * project question picks the closest project, not the newest; a problem
 * question prefers projects with a recorded challenge and never selects
 * an item without one just because it exists. Nothing is selected that
 * scores zero, and nothing is ever selected wholesale.
 */
export function rankContext(
  kind: OpenQuestionKind,
  profile: UserProfile | null,
  saved: SkillsProjects,
  question: string,
): RankedContext {
  const signals = signalsFor(profile, saved);
  const asked = terms(question);
  const technicalQuestion = TECHNICAL_QUESTION.test(question);
  const scoreOf = (s: Signals): number => {
    const shared = overlap(asked, terms(s.item.text));
    switch (kind) {
      case 'skills':
        if (s.item.group === 'skills') return 100;
        if (s.item.group === 'project') {
          return s.technical ? 10 + shared * 2 + s.detail : 0;
        }
        if (s.item.group === 'job') return s.technical ? 5 + shared * 2 : 0;
        return 0;
      case 'project':
        if (s.item.group !== 'project') return 0;
        // A project the question names outranks a richer one.
        return (
          overlap(asked, terms(s.item.title)) * 6 +
          10 +
          shared * 3 +
          s.detail +
          (s.technical && technicalQuestion ? 2 : 0)
        );
      case 'experience':
        if (s.item.group === 'job') {
          // A technical question is not about unrelated jobs.
          if (technicalQuestion && !s.technical) {
            return shared > 0 ? 4 + shared * 2 : 0;
          }
          return 10 + shared * 2 + (technicalQuestion ? 5 : 0);
        }
        if (s.item.group === 'project') {
          return shared > 0 || (technicalQuestion && s.technical)
            ? 6 + shared * 2 + s.detail
            : 0;
        }
        if (s.item.group === 'education') {
          return STUDY.test(question) ? 8 + shared : 0;
        }
        return technicalQuestion ? 4 : 0;
      case 'problem':
        if (s.item.group === 'project')
          return s.challenge ? 20 + shared * 2 + s.detail : 0;
        if (s.item.group === 'job') {
          return /\b(?:solv\w*|fix\w*|problem\w*|issue\w*|improv\w*|resolv\w*)\b/i.test(
            s.item.text,
          )
            ? 8 + shared * 2
            : 0;
        }
        return 0;
      case 'motivation':
        if (s.item.group === 'skills') return 12;
        if (s.item.group === 'project' || s.item.group === 'job') {
          return shared > 0 ? 8 + shared * 3 + s.detail : 0;
        }
        return STUDY.test(question) ? 6 + shared : 0;
    }
  };
  const LIMITS: Record<
    OpenQuestionKind,
    Partial<Record<ContextGroup, number>>
  > = {
    skills: { skills: 1, project: 2, job: 1 },
    project: { project: 1 },
    experience: { job: 2, project: 1, education: 1, skills: 1 },
    problem: { project: 1, job: 1 },
    motivation: { skills: 1, project: 1, job: 1, education: 1 },
  };
  const scored = signals
    .map((s, index) => ({ s, index, score: scoreOf(s) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const taken: Partial<Record<ContextGroup, number>> = {};
  const selected: string[] = [];
  for (const { s, score } of scored) {
    const allowed = LIMITS[kind][s.item.group] ?? 0;
    const count = taken[s.item.group] ?? 0;
    if (score > 0 && count < allowed) {
      selected.push(s.item.id);
      taken[s.item.group] = count + 1;
    }
  }
  // Selected items in a natural order (skills, projects, jobs, education).
  const order: ContextGroup[] = ['skills', 'project', 'job', 'education'];
  const chosen = scored
    .filter(({ s }) => selected.includes(s.item.id))
    .sort(
      (a, b) =>
        order.indexOf(a.s.item.group) - order.indexOf(b.s.item.group) ||
        b.score - a.score,
    );
  return {
    selected: chosen.map(({ s }) => s.item.id),
    items: [
      ...chosen,
      ...scored
        .filter(({ s }) => !selected.includes(s.item.id))
        .sort((a, b) => a.index - b.index),
    ].map(({ s }) => s.item),
  };
}
