import type { Dispatch } from 'react';
import { validateSection } from '@/domain/profile-schema';
import { EMPLOYMENT_TYPES } from '@/domain/user-profile';
import {
  CheckboxField,
  FieldGrid,
  SelectField,
  TextAreaField,
  TextField,
} from './fields';
import { EMPLOYMENT_TYPE_LABEL, formatRange } from './format';
import type {
  OnboardingAction,
  OnboardingState,
  RecordList as ListName,
} from './onboarding-state';
import { RecordList } from './RecordList';

interface StepProps {
  state: OnboardingState;
  dispatch: Dispatch<OnboardingAction>;
}

/**
 * Validates one record when its editor is closed. Errors for that record are
 * shown and the editor stays open; other records are not affected.
 */
function finishRecord(
  { state, dispatch }: StepProps,
  list: ListName,
  id: string,
): boolean {
  const all = validateSection(list, state.draft);
  const prefix = `${list}.${id}.`;
  const mine = Object.fromEntries(
    Object.entries(all).filter(([key]) => key.startsWith(prefix)),
  );
  if (Object.keys(mine).length === 0) return true;
  dispatch({ type: 'set-errors', errors: { ...state.errors, ...mine } });
  return false;
}

function hasErrorFor(state: OnboardingState, list: ListName) {
  return (id: string) =>
    Object.keys(state.errors).some((key) => key.startsWith(`${list}.${id}.`));
}

export function EducationStep(props: StepProps) {
  const { state, dispatch } = props;
  const error = (id: string, field: string) =>
    state.errors[`education.${id}.${field}`];

  return (
    <RecordList
      records={state.draft.education}
      openId={state.open.education}
      noun="education"
      empty={{
        title: 'No education added',
        description:
          'Add degrees, diplomas or other qualifications you want employers to see. You can leave this empty.',
      }}
      summary={(record) => ({
        primary: [record.qualification, record.fieldOfStudy]
          .filter(Boolean)
          .join(', '),
        secondary: [
          record.institution,
          formatRange(record.startDate, record.endDate),
        ]
          .filter(Boolean)
          .join(' · '),
      })}
      hasError={hasErrorFor(state, 'education')}
      onAdd={() => {
        dispatch({ type: 'add-record', list: 'education' });
      }}
      onOpen={(id) => {
        dispatch({ type: 'open-record', list: 'education', id });
      }}
      onDone={(id) => finishRecord(props, 'education', id)}
      onRemove={(id) => {
        dispatch({ type: 'remove-record', list: 'education', id });
      }}
      renderEditor={(record) => {
        const patch = (
          value: Extract<
            OnboardingAction,
            { type: 'patch-education' }
          >['patch'],
        ) => {
          dispatch({ type: 'patch-education', id: record.id, patch: value });
        };
        return (
          <FieldGrid>
            <TextField
              label="Institution"
              wide
              value={record.institution}
              error={error(record.id, 'institution')}
              onValueChange={(institution) => {
                patch({ institution });
              }}
            />
            <TextField
              label="Degree or qualification"
              placeholder="BSc, A levels, Diploma…"
              value={record.qualification}
              error={error(record.id, 'qualification')}
              onValueChange={(qualification) => {
                patch({ qualification });
              }}
            />
            <TextField
              label="Field of study"
              value={record.fieldOfStudy}
              error={error(record.id, 'fieldOfStudy')}
              onValueChange={(fieldOfStudy) => {
                patch({ fieldOfStudy });
              }}
            />
            <TextField
              label="Start date"
              type="month"
              value={record.startDate}
              error={error(record.id, 'startDate')}
              onValueChange={(startDate) => {
                patch({ startDate });
              }}
            />
            <TextField
              label="End date"
              type="month"
              hint="Or your expected graduation date."
              value={record.endDate}
              error={error(record.id, 'endDate')}
              onValueChange={(endDate) => {
                patch({ endDate });
              }}
            />
            <TextField
              label="Grade or classification"
              optional
              wide
              placeholder="First-class honours, 3.8 GPA…"
              value={record.grade}
              error={error(record.id, 'grade')}
              onValueChange={(grade) => {
                patch({ grade });
              }}
            />
          </FieldGrid>
        );
      }}
    />
  );
}

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: '', label: 'Not specified' },
  ...EMPLOYMENT_TYPES.map((type) => ({
    value: type,
    label: EMPLOYMENT_TYPE_LABEL[type],
  })),
];

export function ExperienceStep(props: StepProps) {
  const { state, dispatch } = props;
  const error = (id: string, field: string) =>
    state.errors[`employment.${id}.${field}`];

  return (
    <RecordList
      records={state.draft.employment}
      openId={state.open.employment}
      noun="role"
      empty={{
        title: 'No roles added',
        description:
          'Add jobs, internships, placements or volunteering. You can leave this empty.',
      }}
      summary={(record) => ({
        primary: record.title,
        secondary: [
          record.employer,
          formatRange(record.startDate, record.endDate, record.current),
        ]
          .filter(Boolean)
          .join(' · '),
      })}
      hasError={hasErrorFor(state, 'employment')}
      onAdd={() => {
        dispatch({ type: 'add-record', list: 'employment' });
      }}
      onOpen={(id) => {
        dispatch({ type: 'open-record', list: 'employment', id });
      }}
      onDone={(id) => finishRecord(props, 'employment', id)}
      onRemove={(id) => {
        dispatch({ type: 'remove-record', list: 'employment', id });
      }}
      renderEditor={(record) => {
        const patch = (
          value: Extract<
            OnboardingAction,
            { type: 'patch-employment' }
          >['patch'],
        ) => {
          dispatch({ type: 'patch-employment', id: record.id, patch: value });
        };
        return (
          <FieldGrid>
            <TextField
              label="Job title"
              value={record.title}
              error={error(record.id, 'title')}
              onValueChange={(title) => {
                patch({ title });
              }}
            />
            <TextField
              label="Employer"
              value={record.employer}
              error={error(record.id, 'employer')}
              onValueChange={(employer) => {
                patch({ employer });
              }}
            />
            <SelectField
              label="Employment type"
              optional
              value={record.employmentType}
              options={EMPLOYMENT_TYPE_OPTIONS}
              error={error(record.id, 'employmentType')}
              onValueChange={(value) => {
                const employmentType = EMPLOYMENT_TYPES.find(
                  (type) => type === value,
                );
                patch({ employmentType: employmentType ?? '' });
              }}
            />
            <span aria-hidden className="hidden sm:block" />
            <TextField
              label="Start date"
              type="month"
              value={record.startDate}
              error={error(record.id, 'startDate')}
              onValueChange={(startDate) => {
                patch({ startDate });
              }}
            />
            <TextField
              label="End date"
              type="month"
              disabled={record.current}
              value={record.current ? '' : record.endDate}
              error={error(record.id, 'endDate')}
              onValueChange={(endDate) => {
                patch({ endDate });
              }}
            />
            <div className="sm:col-span-2 -mt-2">
              <CheckboxField
                label="I currently work here"
                checked={record.current}
                onCheckedChange={(current) => {
                  patch(current ? { current, endDate: '' } : { current });
                }}
              />
            </div>
            <TextAreaField
              label="Description"
              optional
              wide
              hint="Responsibilities and achievements, in a few lines."
              value={record.description}
              error={error(record.id, 'description')}
              onValueChange={(description) => {
                patch({ description });
              }}
            />
          </FieldGrid>
        );
      }}
    />
  );
}
