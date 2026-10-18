import type { ApplicationAnswers } from '@/domain/application-answers';

/**
 * Fictional saved answers for tests. Test use only: the extension never
 * suggests sample data.
 */
export function savedAnswers(): ApplicationAnswers {
  return {
    noticePeriod: { amount: 4, unit: 'weeks' },
    relocation: { withinCountry: 'yes', abroad: 'no' },
    workArrangement: 'hybrid',
    startDate: '2027-01-04',
    salary: { amount: 32000, currency: 'GBP', period: 'year' },
  };
}
