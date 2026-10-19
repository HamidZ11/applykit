import { expect, test } from './extension';

/**
 * Reviewing suggested answers and applying them together
 * (fixtures/batch-answers.html, ADR 0022): nothing is written until
 * "Apply", each answer is checked on the page, and a page that changes
 * under the batch stops it, keeping what was applied.
 */

const FIXTURE = '/batch-answers.html';

test.beforeEach(async ({ page, saveProfile, saveAnswers }) => {
  await saveProfile();
  await saveAnswers({
    schemaVersion: 1,
    answers: {
      noticePeriod: { amount: 4, unit: 'weeks' },
      relocation: { withinCountry: 'yes', abroad: 'no' },
      workArrangement: 'hybrid',
      startDate: '2027-01-04',
      salary: null,
    },
    updatedAt: '2026-10-19T12:00:00.000Z',
  });
  await page.goto(FIXTURE);
});

test('applies reviewed answers with one confirmation, stopping where the page changed', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /answers ready to review$/ }).click();
  const review = panel.getByRole('region', { name: 'Answers to apply' });
  await expect(review.getByRole('checkbox')).not.toHaveCount(0);
  await expect(page.locator('#notice-weeks')).toHaveValue('');

  await panel
    .getByRole('button', { name: /^Apply \d+ selected answers?$/ })
    .click();

  await expect(panel).toContainText(
    'Stopped at “Earliest available start date”',
  );
  await expect(page.locator('#notice-weeks')).toHaveValue('4');
  await expect(page.locator('#relocate-uk')).toHaveValue('');

  await panel
    .getByRole('button', { name: /^Review \d+ remaining answers?$/ })
    .click();
  await panel
    .getByRole('button', { name: /^Apply \d+ selected answers?$/ })
    .click();

  await expect(page.locator('#start-date')).toHaveValue('2027-01-04');
  await expect(page.locator('#relocate-uk')).toHaveValue('y');
  await expect(page.locator('#regions')).toHaveValue('');
  await expect(page.locator('#arrangement')).toHaveValue('');
  await expect(page.locator('#rtw')).toHaveValue('');
  await expect(page.locator('#consent')).not.toBeChecked();
  await expect(page.locator('#status')).toContainText('submitted: 0');
});
