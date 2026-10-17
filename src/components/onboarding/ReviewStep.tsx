import type { Dispatch, ReactNode } from 'react';
import { countryName } from '@/domain/countries';
import { normaliseDraft } from '@/domain/profile-schema';
import { GhostButton } from '@/components/ui/primitives';
import { EMPLOYMENT_TYPE_LABEL, formatRange } from './format';
import type {
  OnboardingAction,
  OnboardingState,
  Step,
} from './onboarding-state';

/**
 * The whole draft as it will be saved (normalised), section by section, each
 * with a way back to edit it.
 */
export function ReviewStep({
  state,
  dispatch,
}: {
  state: OnboardingState;
  dispatch: Dispatch<OnboardingAction>;
}) {
  const draft = normaliseDraft(state.draft);
  const { personal, links } = draft;
  const edit = (step: Step) => () => {
    dispatch({ type: 'go', step });
  };
  const address = [
    personal.address.line1,
    personal.address.line2,
    personal.address.city,
    personal.address.region,
    personal.address.postcode,
    countryName(personal.address.country),
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      <ReviewSection title="Personal details" onEdit={edit('personal')}>
        <Rows>
          <Row label="Name">
            {[personal.firstName, personal.lastName].filter(Boolean).join(' ')}
          </Row>
          <Row label="Preferred name">
            {personal.preferredName ||
              (personal.useFirstNameAsPreferred ? 'Same as first name' : '')}
          </Row>
          <Row label="Email">{personal.email}</Row>
          <Row label="Phone">{personal.phone}</Row>
          <Row label="Address">
            {address.length > 0 && (
              <span className="block">
                {address.map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </span>
            )}
          </Row>
        </Rows>
      </ReviewSection>

      <ReviewSection title="Education" onEdit={edit('education')}>
        {draft.education.length === 0 ? (
          <Empty>None added</Empty>
        ) : (
          <ul className="space-y-3">
            {draft.education.map((record) => (
              <RecordSummary
                key={record.id}
                title={[record.qualification, record.fieldOfStudy]
                  .filter(Boolean)
                  .join(', ')}
                lines={[
                  record.institution,
                  [formatRange(record.startDate, record.endDate), record.grade]
                    .filter(Boolean)
                    .join(' · '),
                ]}
              />
            ))}
          </ul>
        )}
      </ReviewSection>

      <ReviewSection title="Experience" onEdit={edit('experience')}>
        {draft.employment.length === 0 ? (
          <Empty>None added</Empty>
        ) : (
          <ul className="space-y-3">
            {draft.employment.map((record) => (
              <RecordSummary
                key={record.id}
                title={record.title}
                lines={[
                  [
                    record.employer,
                    record.employmentType &&
                      EMPLOYMENT_TYPE_LABEL[record.employmentType],
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  formatRange(record.startDate, record.endDate, record.current),
                  record.description,
                ]}
              />
            ))}
          </ul>
        )}
      </ReviewSection>

      <ReviewSection title="Professional links" onEdit={edit('links')}>
        <Rows>
          <Row label="LinkedIn">{links.linkedin}</Row>
          <Row label="GitHub">{links.github}</Row>
          <Row label="Portfolio">{links.portfolio}</Row>
          {links.other.map((link) => (
            <Row key={link.id} label={link.label || 'Link'}>
              {link.url}
            </Row>
          ))}
        </Rows>
      </ReviewSection>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="border-t border-line pt-5 first:border-t-0 first:pt-0"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium">{title}</h2>
        <GhostButton
          aria-label={`Edit ${title.toLowerCase()}`}
          onClick={onEdit}
        >
          Edit
        </GhostButton>
      </div>
      {children}
    </section>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="space-y-2">{children}</dl>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const empty =
    children === '' ||
    children === null ||
    children === undefined ||
    children === false;
  return (
    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[150px_minmax(0,1fr)]">
      <dt className="text-xs leading-5 text-ink-3">{label}</dt>
      <dd className={`min-w-0 break-words ${empty ? 'text-ink-3' : ''}`}>
        {empty ? 'Not provided' : children}
      </dd>
    </div>
  );
}

function RecordSummary({ title, lines }: { title: string; lines: string[] }) {
  return (
    <li>
      <p className="font-medium">{title}</p>
      {lines.filter(Boolean).map((line, i) => (
        <p key={i} className="text-xs whitespace-pre-line text-ink-2">
          {line}
        </p>
      ))}
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-ink-3">{children}</p>;
}
