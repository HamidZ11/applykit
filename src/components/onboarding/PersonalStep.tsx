import type { Dispatch } from 'react';
import { FieldGrid, FieldSection, TextField } from './fields';
import type { OnboardingAction, OnboardingState } from './onboarding-state';

export function PersonalStep({
  state,
  dispatch,
}: {
  state: OnboardingState;
  dispatch: Dispatch<OnboardingAction>;
}) {
  const { personal } = state.draft;
  const { address } = personal;
  const error = (path: string) => state.errors[`personal.${path}`];
  const setPersonal = (patch: Partial<Omit<typeof personal, 'address'>>) => {
    dispatch({ type: 'patch-personal', patch });
  };
  const setAddress = (patch: Partial<typeof address>) => {
    dispatch({ type: 'patch-address', patch });
  };

  return (
    <div className="space-y-8">
      <FieldSection title="Name and contact">
        <FieldGrid>
          <TextField
            label="First name"
            autoComplete="given-name"
            value={personal.firstName}
            error={error('firstName')}
            onValueChange={(firstName) => {
              setPersonal({ firstName });
            }}
          />
          <TextField
            label="Last name"
            autoComplete="family-name"
            value={personal.lastName}
            error={error('lastName')}
            onValueChange={(lastName) => {
              setPersonal({ lastName });
            }}
          />
          <TextField
            label="Preferred name"
            optional
            hint="If you go by a different first name."
            autoComplete="nickname"
            value={personal.preferredName}
            error={error('preferredName')}
            onValueChange={(preferredName) => {
              setPersonal({ preferredName });
            }}
          />
          <span aria-hidden className="hidden sm:block" />
          <TextField
            label="Email address"
            type="email"
            autoComplete="email"
            value={personal.email}
            error={error('email')}
            onValueChange={(email) => {
              setPersonal({ email });
            }}
          />
          <TextField
            label="Phone number"
            type="tel"
            autoComplete="tel"
            hint="Include the country code if applying abroad."
            value={personal.phone}
            error={error('phone')}
            onValueChange={(phone) => {
              setPersonal({ phone });
            }}
          />
        </FieldGrid>
      </FieldSection>

      <FieldSection title="Address">
        <FieldGrid>
          <TextField
            label="Address line 1"
            wide
            autoComplete="address-line1"
            value={address.line1}
            error={error('address.line1')}
            onValueChange={(line1) => {
              setAddress({ line1 });
            }}
          />
          <TextField
            label="Address line 2"
            optional
            wide
            autoComplete="address-line2"
            value={address.line2}
            error={error('address.line2')}
            onValueChange={(line2) => {
              setAddress({ line2 });
            }}
          />
          <TextField
            label="Town or city"
            autoComplete="address-level2"
            value={address.city}
            error={error('address.city')}
            onValueChange={(city) => {
              setAddress({ city });
            }}
          />
          <TextField
            label="Region or county"
            optional
            autoComplete="address-level1"
            value={address.region}
            error={error('address.region')}
            onValueChange={(region) => {
              setAddress({ region });
            }}
          />
          <TextField
            label="Postcode"
            autoComplete="postal-code"
            value={address.postcode}
            error={error('address.postcode')}
            onValueChange={(postcode) => {
              setAddress({ postcode });
            }}
          />
          <TextField
            label="Country"
            autoComplete="country-name"
            value={address.country}
            error={error('address.country')}
            onValueChange={(country) => {
              setAddress({ country });
            }}
          />
        </FieldGrid>
      </FieldSection>
    </div>
  );
}
