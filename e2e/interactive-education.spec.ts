import { expect, test } from './extension';
import { E2E_PROFILE } from './profile';

/**
 * Choosing a saved education record for an ambiguous section
 * (fixtures/interactive-education.html).
 */

const FIXTURE = '/interactive-education.html';

test.beforeEach(async ({ page, saveProfile }) => {
  // A second school record, so the school section has two candidates.
  await saveProfile({
    ...E2E_PROFILE,
    education: [
      ...E2E_PROFILE.education,
      {
        id: 'gcses',
        institution: 'Example Grammar School',
        qualification: 'GCSEs',
        fieldOfStudy: 'Ten subjects',
        startDate: '2017-09',
        endDate: '2022-06',
        grade: '',
      },
    ],
  });
  await page.goto(FIXTURE);
});

test('fills a section from the record the user chooses', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel.getByRole('button', { name: /^School name/ }).click();
  await panel.getByRole('button', { name: 'Choose a saved record' }).click();

  await expect(panel.getByRole('radio')).toHaveCount(2);
  await panel
    .getByRole('radio', { name: /Example Sixth Form College/ })
    .check();
  await expect(
    panel.getByRole('list', { name: 'What this record fills' }),
  ).toContainText('Grades achievedWill fill');
  await expect(page.locator('#sec-school')).toHaveValue('');

  await panel.getByRole('button', { name: 'Fill 4 fields' }).click();

  await expect(page.locator('#sec-school')).toHaveValue(
    'Example Sixth Form College',
  );
  await expect(page.locator('#sec-qual')).toHaveValue('al');
  await expect(page.locator('#sec-year')).toHaveValue('2024');
  await expect(page.locator('#e1-inst')).toHaveValue('');
  await expect(panel).toContainText('Filled · your choice');
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('cancelling leaves the section untouched', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel.getByRole('button', { name: /^School name/ }).click();
  await panel.getByRole('button', { name: 'Choose a saved record' }).click();
  await panel.getByRole('radio', { name: /Example Grammar School/ }).check();

  await page.keyboard.press('Escape');

  await expect(panel.getByRole('radio')).toHaveCount(0);
  await expect(panel).toHaveAttribute('data-mode', 'expanded');
  await expect(page.locator('#sec-school')).toHaveValue('');
});
