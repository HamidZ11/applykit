import { useEffect, useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  LIMITS,
  addSkills,
  isBlankProject,
  newProject,
  parseTechnologies,
  skillsProjectsErrors,
  type Project,
  type SkillsProjects,
} from '@/domain/skills-projects';
import {
  browserSkillsStore,
  type SkillsLoadResult,
  type SkillsStore,
} from '@/storage/skills-store';
import { Icon } from '@/components/ui/icons';
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import {
  CONTROL,
  CONTROL_STATE,
  FieldSection,
  TextAreaField,
  TextField,
} from './fields';
import { Banner, Notice, Problem, SectionShell } from './page-parts';

/**
 * Technical skills and a few project summaries, saved apart from the
 * profile. Optional, and never filled into forms; AI drafting shares them
 * only when the user chooses to (ADR 0019).
 */

const INTRO =
  'Optional. List your technical skills and a few projects you can talk about. They stay in this browser; AI drafting shares them only when you choose to.';

const NEWER =
  'Your skills and projects were saved by a newer version of ApplyKit, so this version cannot show or change them. They are kept exactly as they are.';

const systemClock = () => new Date();

export function SkillsProjectsView({
  store = browserSkillsStore,
  now = systemClock,
  heading,
  draft: keptDraft,
  onDraftChange,
}: {
  store?: SkillsStore;
  now?: () => Date;
  heading?: React.RefObject<HTMLHeadingElement | null>;
  /** Unsaved changes, when the page keeps them across views. */
  draft?: SkillsProjects | null;
  onDraftChange?: (draft: SkillsProjects | null) => void;
}) {
  const [load, setLoad] = useState<SkillsLoadResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ownDraft, setOwnDraft] = useState<SkillsProjects | null>(null);
  const draft = keptDraft === undefined ? ownDraft : keptDraft;
  const setDraft = onDraftChange ?? setOwnDraft;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [skillText, setSkillText] = useState('');
  const [revision, setRevision] = useState(0);
  const ownHeading = useRef<HTMLHeadingElement | null>(null);
  const headingRef = heading ?? ownHeading;
  const skillId = useId();

  useEffect(() => {
    let active = true;
    void store.load().then((result) => {
      if (active) setLoad(result);
    });
    return () => {
      active = false;
    };
  }, [store, attempt]);

  const shell = (children: React.ReactNode) => (
    <SectionShell heading={headingRef} title="Skills & projects" intro={INTRO}>
      {children}
    </SectionShell>
  );

  if (load === null) return shell(null);
  if (load.status === 'unsupported') {
    return shell(<Banner tone="warning">{NEWER}</Banner>);
  }
  if (load.status === 'error') {
    return shell(
      <Banner tone="danger">
        ApplyKit could not read your skills and projects from this browser.
        Nothing was changed.{' '}
        <button
          type="button"
          onClick={() => {
            setLoad(null);
            setAttempt((count) => count + 1);
          }}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Try again
        </button>
      </Banner>,
    );
  }

  const content = draft ?? load.content;
  const dirty = draft !== null;
  const unsaved = dirty || skillText.trim() !== '';
  const errors = showErrors ? skillsProjectsErrors(content) : {};
  const change = (next: SkillsProjects) => {
    // A message about the previous state, such as "Some details need
    // fixing", must not outlive the change that fixed it.
    setNotice('');
    setProblem(null);
    setDraft(next);
  };
  const changeProject = (id: string, patch: Partial<Project>) => {
    change({
      ...content,
      projects: content.projects.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    });
  };
  const addTyped = () => {
    if (skillText.trim() === '') return;
    change({ ...content, skills: addSkills(content.skills, skillText) });
    setSkillText('');
  };

  const save = async () => {
    // Blank projects (added by mistake) are dropped rather than blocking
    // the save, and a skill typed but not yet added is kept.
    const toSave: SkillsProjects = {
      skills: addSkills(content.skills, skillText),
      projects: content.projects.filter((p) => !isBlankProject(p)),
    };
    if (Object.keys(skillsProjectsErrors(toSave)).length > 0) {
      setShowErrors(true);
      setProblem('Some details need fixing before they can be saved.');
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await store.save(toSave, load.updatedAt, now());
    setBusy(false);
    switch (result.status) {
      case 'saved':
        setLoad({
          status: 'loaded',
          content: result.saved.content,
          updatedAt: result.saved.updatedAt,
          damaged: false,
        });
        setDraft(null);
        setSkillText('');
        setShowErrors(false);
        setRevision((r) => r + 1);
        setNotice('Skills and projects saved.');
        return;
      case 'conflict':
        setLoad({
          status: 'loaded',
          content: result.current.content,
          updatedAt: result.current.updatedAt,
          damaged: false,
        });
        setProblem(
          'Your skills and projects were changed in another tab, so this was not saved. Your unsaved changes are kept; save again to keep them.',
        );
        return;
      case 'unsupported':
        setLoad({ status: 'unsupported' });
        return;
      case 'error':
        setProblem(
          'ApplyKit could not save your skills and projects. Nothing was changed; try again.',
        );
    }
  };

  return shell(
    <form
      noValidate
      className="mt-6 space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (unsaved && !busy) void save();
      }}
    >
      {load.damaged && (
        <Banner tone="warning">
          Some saved entries could not be read and are not shown. A copy is kept
          when you next save.
        </Banner>
      )}

      <FieldSection
        title="Technical skills"
        description="Languages, tools and methods you use. Separate several with commas."
      >
        {content.skills.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Your skills">
            {content.skills.map((skill) => (
              <li
                key={skill}
                className="flex h-7 items-center gap-1 rounded-sm border border-line bg-white pr-1 pl-2.5 text-sm"
              >
                {skill}
                <button
                  type="button"
                  aria-label={`Remove ${skill}`}
                  onClick={() => {
                    change({
                      ...content,
                      skills: content.skills.filter((s) => s !== skill),
                    });
                  }}
                  className="flex size-5 items-center justify-center rounded-xs text-ink-3 hover:bg-hover hover:text-ink"
                >
                  <Icon icon={X} size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor={skillId} className="sr-only">
          Add a skill
        </label>
        <div className="flex gap-2">
          <input
            id={skillId}
            value={skillText}
            maxLength={LIMITS.skillLength * 10}
            placeholder="Python, TypeScript, PostgreSQL"
            onChange={(event) => {
              setSkillText(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTyped();
              }
            }}
            aria-invalid={Boolean(errors.skills) || undefined}
            className={`${CONTROL} ${CONTROL_STATE(Boolean(errors.skills))} h-9 px-3`}
          />
          <SecondaryButton onClick={addTyped}>Add</SecondaryButton>
        </div>
        {errors.skills && <Problem>{errors.skills}</Problem>}
      </FieldSection>

      <FieldSection
        title="Projects"
        description="A name and a sentence or two each: what it does and what you did."
      >
        <ul className="space-y-6">
          {content.projects.map((project, index) => {
            const key = `project.${project.id}`;
            return (
              <li
                // Remounted after a save or discard, so typed text resets.
                key={`${project.id}:${String(revision)}`}
                aria-label={project.name || `Project ${String(index + 1)}`}
                className="space-y-4 rounded-md border border-line bg-white p-4"
              >
                <TextField
                  label="Name"
                  value={project.name}
                  maxLength={LIMITS.name}
                  error={errors[`${key}.name`]}
                  onValueChange={(name) => {
                    changeProject(project.id, { name });
                  }}
                />
                <TextAreaField
                  label="Short description"
                  value={project.description}
                  rows={3}
                  maxLength={LIMITS.description}
                  error={errors[`${key}.description`]}
                  onValueChange={(description) => {
                    changeProject(project.id, { description });
                  }}
                />
                <TextAreaField
                  label="What did you personally work on?"
                  optional
                  value={project.contribution}
                  rows={2}
                  maxLength={LIMITS.detail}
                  error={errors[`${key}.contribution`]}
                  onValueChange={(contribution) => {
                    changeProject(project.id, { contribution });
                  }}
                />
                <TextAreaField
                  label="A challenge you met"
                  optional
                  hint="And what you did about it."
                  value={project.challenge}
                  rows={2}
                  maxLength={LIMITS.detail}
                  error={errors[`${key}.challenge`]}
                  onValueChange={(challenge) => {
                    changeProject(project.id, { challenge });
                  }}
                />
                <TextAreaField
                  label="What was the result?"
                  optional
                  hint="In your own words; no numbers needed."
                  value={project.result}
                  rows={2}
                  maxLength={LIMITS.detail}
                  error={errors[`${key}.result`]}
                  onValueChange={(result) => {
                    changeProject(project.id, { result });
                  }}
                />
                <TechnologiesField
                  initial={project.technologies}
                  error={errors[`${key}.technologies`]}
                  onChange={(technologies) => {
                    changeProject(project.id, { technologies });
                  }}
                />
                <TextField
                  label="Link"
                  optional
                  type="url"
                  value={project.link}
                  maxLength={LIMITS.link}
                  error={errors[`${key}.link`]}
                  onValueChange={(link) => {
                    changeProject(project.id, { link: link.trim() });
                  }}
                />
                <GhostButton
                  tone="danger"
                  onClick={() => {
                    change({
                      ...content,
                      projects: content.projects.filter(
                        (p) => p.id !== project.id,
                      ),
                    });
                  }}
                >
                  Remove project
                </GhostButton>
              </li>
            );
          })}
        </ul>
        {content.projects.length < LIMITS.projects && (
          <SecondaryButton
            className={content.projects.length > 0 ? 'mt-4' : ''}
            onClick={() => {
              change({
                ...content,
                projects: [...content.projects, newProject()],
              });
            }}
          >
            <Icon icon={Plus} size={14} className="text-ink-3" />
            Add project
          </SecondaryButton>
        )}
        {errors.projects && <Problem>{errors.projects}</Problem>}
      </FieldSection>

      <div>
        {problem && <Problem>{problem}</Problem>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryButton type="submit" disabled={!unsaved || busy}>
            {busy ? 'Saving…' : unsaved ? 'Save skills and projects' : 'Saved'}
          </PrimaryButton>
          {dirty && !busy && (
            <GhostButton
              onClick={() => {
                setDraft(null);
                setProblem(null);
                setShowErrors(false);
                setRevision((r) => r + 1);
              }}
            >
              Discard changes
            </GhostButton>
          )}
        </div>
        <Notice>{notice}</Notice>
      </div>
    </form>,
  );
}

/** Typed as a comma-separated list; the text is kept as typed. */
function TechnologiesField({
  initial,
  error,
  onChange,
}: {
  initial: readonly string[];
  error: string | undefined;
  onChange: (technologies: string[]) => void;
}) {
  const [text, setText] = useState(() => initial.join(', '));
  return (
    <TextField
      label="Technologies"
      optional
      hint="Separate with commas."
      value={text}
      error={error}
      onValueChange={(value) => {
        setText(value);
        onChange(parseTechnologies(value));
      }}
    />
  );
}
