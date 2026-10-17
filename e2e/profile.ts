/**
 * A fictional saved profile for browser tests, in the stored format
 * (schema version 2). Never use real personal details.
 */
export const E2E_PROFILE = {
  personal: {
    firstName: 'Alex',
    lastName: 'Sample',
    preferredName: 'Al',
    useFirstNameAsPreferred: false,
    email: 'alex.sample@example.com',
    phone: '+44 20 7946 0000',
    address: {
      line1: '1 Example Street',
      line2: 'Flat 2',
      city: 'London',
      region: 'Greater London',
      postcode: 'N1 9GU',
      country: 'GB',
    },
  },
  education: [
    {
      id: 'degree',
      institution: 'University of Example',
      qualification: 'BSc Computer Science',
      fieldOfStudy: 'Computer Science',
      startDate: '2024-09',
      endDate: '2027-06',
      grade: '',
    },
    {
      id: 'a-levels',
      institution: 'Example Sixth Form College',
      qualification: 'A levels',
      fieldOfStudy: 'Mathematics, Physics, Computing',
      startDate: '2022-09',
      endDate: '2024-06',
      grade: 'A*AA',
    },
  ],
  employment: [],
  links: {
    linkedin: 'https://www.linkedin.com/in/alex-sample',
    github: 'https://github.com/alex-sample',
    portfolio: 'https://alex-sample.example.com',
    other: [],
  },
  metadata: {
    schemaVersion: 3,
    createdAt: '2026-10-17T12:00:00.000Z',
    updatedAt: '2026-10-17T12:00:00.000Z',
  },
};
