import { expect, test } from './extension';

/**
 * Saved application answers (fixtures/reusable-answers.html): suggested
 * in the expanded list, never filled by Autofill, and written one at a
 * time when the user chooses "Use this answer".
 */

const FIXTURE = '/reusable-answers.html';

test.beforeEach(async ({ page, saveProfile, saveAnswers }) => {
  await saveProfile();
  await saveAnswers({
    schemaVersion: 1,
    answers: {
      noticePeriod: { amount: 4, unit: 'weeks' },
      relocation: { withinCountry: 'yes', abroad: 'no' },
      workArrangement: 'hybrid',
      startDate: '2099-01-04',
      salary: { amount: 32000, currency: 'GBP', period: 'year' },
    },
    updatedAt: '2026-10-18T12:00:00.000Z',
  });
  await page.goto(FIXTURE);
});

test('Autofill leaves saved answers as suggestions', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();

  // Positive control: the applicant's details were filled.
  await expect(page.locator('#first')).toHaveValue('Alex');
  await expect(page.locator('#notice-weeks')).toHaveValue('');
  await expect(page.locator('#start-date')).toHaveValue('');
  await expect(page.locator('#relocate-uk')).toHaveValue('');
  await expect(page.locator('#salary-annual')).toHaveValue('');
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('fills one question when the user uses its saved answer', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel.getByRole('button', { name: /^Notice period in weeks/ }).click();
  await expect(panel).toContainText('From your saved answers');

  await panel.getByRole('button', { name: 'Use this answer' }).click();

  await expect(page.locator('#notice-weeks')).toHaveValue('4');
  await expect(page.locator('#salary-annual')).toHaveValue('');
  await expect(panel).toContainText('Filled · your choice');
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('never offers an answer that does not fit', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel.getByRole('button', { name: /^Expected hourly rate/ }).click();

  await expect(panel).toContainText('but this asks for an hourly rate');
  await expect(
    panel.getByRole('button', { name: 'Use this answer' }),
  ).toHaveCount(0);
});

test('edits an answer on the profile page', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/options.html#answers`);
  await expect(
    page.getByRole('heading', { name: 'Application answers' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Edit working arrangement' }).click();
  await page.getByLabel('Preferred arrangement').selectOption('remote');
  await page.getByRole('button', { name: 'Save answer' }).click();

  await expect(
    page.getByRole('listitem', { name: 'Working arrangement' }),
  ).toContainText('Remote');
});
