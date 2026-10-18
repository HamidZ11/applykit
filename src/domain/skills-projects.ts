/**
 * Technical skills and short project summaries, written by the user and
 * saved apart from the profile. Useful on their own, and the only source
 * of skills and projects for AI drafting, which shares them only when the
 * user chooses to (ADR 0019). Nothing here is filled into forms.
 */

export const SKILLS_SCHEMA_VERSION = 1;

export const LIMITS = {
  skills: 60,
  skillLength: 60,
  projects: 20,
  name: 100,
  description: 600,
  technologies: 20,
  technologyLength: 60,
  link: 300,
} as const;

export interface Project {
  id: string;
  name: string;
  description: string;
  /** Optional. */
  technologies: string[];
  /** Optional; an http or https address. */
  link: string;
}

export interface SkillsProjects {
  skills: string[];
  projects: Project[];
}

export interface SavedSkillsProjects {
  schemaVersion: typeof SKILLS_SCHEMA_VERSION;
  content: SkillsProjects;
  /** ISO 8601; also the version a later save must start from. */
  updatedAt: string;
}

export function emptySkillsProjects(): SkillsProjects {
  return { skills: [], projects: [] };
}

export function newProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    technologies: [],
    link: '',
  };
}

/**
 * Splits typed or pasted text into skills ("Python, TypeScript"), trimmed
 * and without repeats of what is already listed, ignoring case.
 */
export function addSkills(current: readonly string[], text: string): string[] {
  const seen = new Set(current.map((s) => s.toLowerCase()));
  const added: string[] = [];
  for (const part of text.split(/[,\n;]/)) {
    const skill = part.trim().replace(/\s+/g, ' ');
    if (skill === '' || seen.has(skill.toLowerCase())) continue;
    seen.add(skill.toLowerCase());
    added.push(skill);
  }
  return [...current, ...added];
}

/** Technologies typed as a comma-separated list. */
export function parseTechnologies(text: string): string[] {
  return addSkills([], text);
}

/**
 * Content rules, applied when saving: what the user must fix, by field
 * ("skills", "project.<id>.name"). Stored data is read by shape only, so
 * stricter rules never make saved data unreadable.
 */
export function skillsProjectsErrors(
  content: SkillsProjects,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (content.skills.length > LIMITS.skills) {
    errors.skills = `List at most ${String(LIMITS.skills)} skills.`;
  } else if (content.skills.some((s) => s.length > LIMITS.skillLength)) {
    errors.skills = `Keep each skill under ${String(LIMITS.skillLength)} characters.`;
  }
  if (content.projects.length > LIMITS.projects) {
    errors.projects = `List at most ${String(LIMITS.projects)} projects.`;
  }
  for (const project of content.projects) {
    const key = `project.${project.id}`;
    if (project.name.trim() === '') {
      errors[`${key}.name`] = 'Enter the project’s name.';
    } else if (project.name.length > LIMITS.name) {
      errors[`${key}.name`] =
        `Keep the name under ${String(LIMITS.name)} characters.`;
    }
    if (project.description.trim() === '') {
      errors[`${key}.description`] =
        'Describe the project in a sentence or two.';
    } else if (project.description.length > LIMITS.description) {
      errors[`${key}.description`] =
        `Keep the description under ${String(LIMITS.description)} characters.`;
    }
    if (
      project.technologies.length > LIMITS.technologies ||
      project.technologies.some((t) => t.length > LIMITS.technologyLength)
    ) {
      errors[`${key}.technologies`] =
        `List at most ${String(LIMITS.technologies)} short technologies.`;
    }
    if (project.link !== '' && !isWebAddress(project.link)) {
      errors[`${key}.link`] = 'Enter a full web address, starting https://.';
    }
  }
  return errors;
}

function isWebAddress(text: string): boolean {
  if (text.length > LIMITS.link) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Saved by a newer ApplyKit: kept as it is, never written over. */
export function isNewerSkillsProjects(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { schemaVersion } = value as { schemaVersion?: unknown };
  return (
    typeof schemaVersion === 'number' &&
    Number.isInteger(schemaVersion) &&
    schemaVersion > SKILLS_SCHEMA_VERSION
  );
}

export interface StoredSkillsProjectsRead {
  saved: SavedSkillsProjects;
  /** Some entries could not be read and were left out. */
  damaged: boolean;
}

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Reads stored skills and projects by shape. An entry that is not the
 * right shape is left out and reported as damaged, so the store keeps a
 * copy before the next save. Null when this is not saved data at all.
 */
export function parseStoredSkillsProjects(
  value: unknown,
): StoredSkillsProjectsRead | null {
  if (typeof value !== 'object' || value === null) return null;
  const stored = value as Record<string, unknown>;
  if (stored.schemaVersion !== SKILLS_SCHEMA_VERSION) return null;
  if (
    !isString(stored.updatedAt) ||
    Number.isNaN(Date.parse(stored.updatedAt))
  ) {
    return null;
  }
  const content = stored.content;
  if (typeof content !== 'object' || content === null) return null;
  const { skills, projects } = content as {
    skills?: unknown;
    projects?: unknown;
  };
  if (!Array.isArray(skills) || !Array.isArray(projects)) return null;
  let damaged = false;
  const readSkills = skills.filter(isString);
  if (readSkills.length !== skills.length) damaged = true;
  const readProjects: Project[] = [];
  for (const entry of projects as unknown[]) {
    const project = readProject(entry);
    if (project) readProjects.push(project);
    else damaged = true;
  }
  return {
    saved: {
      schemaVersion: SKILLS_SCHEMA_VERSION,
      content: { skills: readSkills, projects: readProjects },
      updatedAt: stored.updatedAt,
    },
    damaged,
  };
}

function readProject(value: unknown): Project | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, name, description, technologies, link } = value as Record<
    string,
    unknown
  >;
  if (!isString(id) || !isString(name) || !isString(description)) return null;
  const techs =
    technologies === undefined
      ? []
      : Array.isArray(technologies) && technologies.every(isString)
        ? technologies
        : null;
  if (techs === null) return null;
  const address = link === undefined ? '' : isString(link) ? link : null;
  if (address === null) return null;
  return { id, name, description, technologies: techs, link: address };
}
