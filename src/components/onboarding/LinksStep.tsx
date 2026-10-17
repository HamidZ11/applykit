import type { Dispatch } from 'react';
import { Plus, X } from 'lucide-react';
import { Icon } from '@/components/ui/icons';
import { SecondaryButton } from '@/components/ui/primitives';
import { FieldGrid, FieldSection, TextField } from './fields';
import type { OnboardingAction, OnboardingState } from './onboarding-state';

export function LinksStep({
  state,
  dispatch,
}: {
  state: OnboardingState;
  dispatch: Dispatch<OnboardingAction>;
}) {
  const { links } = state.draft;
  const error = (path: string) => state.errors[`links.${path}`];

  return (
    <div className="space-y-8">
      <FieldSection title="Profiles">
        <FieldGrid>
          <TextField
            label="LinkedIn"
            optional
            wide
            type="url"
            inputMode="url"
            placeholder="linkedin.com/in/your-name"
            value={links.linkedin}
            error={error('linkedin')}
            onValueChange={(linkedin) => {
              dispatch({ type: 'patch-links', patch: { linkedin } });
            }}
          />
          <TextField
            label="GitHub"
            optional
            wide
            type="url"
            inputMode="url"
            placeholder="github.com/your-name"
            value={links.github}
            error={error('github')}
            onValueChange={(github) => {
              dispatch({ type: 'patch-links', patch: { github } });
            }}
          />
          <TextField
            label="Portfolio or personal website"
            optional
            wide
            type="url"
            inputMode="url"
            placeholder="your-site.com"
            value={links.portfolio}
            error={error('portfolio')}
            onValueChange={(portfolio) => {
              dispatch({ type: 'patch-links', patch: { portfolio } });
            }}
          />
        </FieldGrid>
      </FieldSection>

      <FieldSection
        title="Other links"
        description="Publications, talks, a blog, or anything else worth sharing."
      >
        {links.other.length > 0 && (
          <ul className="mb-4 space-y-4">
            {links.other.map((link, index) => (
              <li
                key={link.id}
                className="grid grid-cols-[minmax(0,1fr)_28px] items-start gap-x-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_28px]"
              >
                <TextField
                  label="Name"
                  placeholder="Blog"
                  value={link.label}
                  error={error(`other.${link.id}.label`)}
                  onValueChange={(label) => {
                    dispatch({
                      type: 'patch-link',
                      id: link.id,
                      patch: { label },
                    });
                  }}
                />
                <div className="col-start-1 mt-4 sm:col-start-auto sm:mt-0">
                  <TextField
                    label="Web address"
                    type="url"
                    inputMode="url"
                    placeholder="example.com"
                    value={link.url}
                    error={error(`other.${link.id}.url`)}
                    onValueChange={(url) => {
                      dispatch({
                        type: 'patch-link',
                        id: link.id,
                        patch: { url },
                      });
                    }}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove link ${link.label || String(index + 1)}`}
                  onClick={() => {
                    dispatch({ type: 'remove-link', id: link.id });
                  }}
                  className="col-start-2 row-start-1 mt-[26px] flex size-7 items-center justify-center rounded-sm text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink sm:col-start-3"
                >
                  <Icon icon={X} size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <SecondaryButton
          onClick={() => {
            dispatch({ type: 'add-link' });
          }}
        >
          <Icon icon={Plus} size={14} />
          Add a link
        </SecondaryButton>
      </FieldSection>
    </div>
  );
}
