import { expect, test } from './extension';
import { E2E_PROFILE } from './profile';

/**
 * Graduation answers worked out from saved education
 * (fixtures/graduation-application.html): suggested with the date they
 * rest on, never filled by Autofill, written one at a time.
 */

const FIXTURE = '/graduation-application.html';

test.beforeEach(async ({ page, saveProfile }) => {
  // The fictional BSc ends in June 2099, so it stays an expected date.
  await saveProfile({
    ...E2E_PROFILE,
    education: E2E_PROFILE.education.map((record) =>
      record.id === 'degree' ? { ...record, endDate: '2099-06' } : record,
    ),
  });
  await page.goto(FIXTURE);
});

test('Autofill leaves graduation answers as suggestions', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();

  // Positive control: the applicant's details were filled.
  await expect(page.locator('#first')).toHaveValue('Alex');
  await expect(page.locator('#grad-in')).toHaveValue('');
  await expect(page.locator('#grad-year')).toHaveValue('');
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('fills one graduation answer the user uses', async ({
  page,
  clickToolbar,
}) => {
  await page.locator('#grad-in').evaluate((label) => {
    // Ask about the fictional degree's year.
    const question = label.ownerDocument.querySelector('label[for="grad-in"]');
    if (question) question.textContent = 'Are you graduating in 2099?';
  });
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel
    .getByRole('button', { name: /^Are you graduating in 2099/ })
    .click();
  await expect(panel).toContainText('Based on your saved education');
  await expect(panel).toContainText('Expected graduation: June 2099');

  await panel
    .getByRole('listitem')
    .filter({ hasText: 'Are you graduating in 2099' })
    .getByRole('button', { name: 'Use this answer' })
    .click();

  await expect(page.locator('#grad-in')).toHaveValue('y');
  await expect(page.locator('#grad-by')).toHaveValue('');
  await expect(page.locator('#status')).toContainText('submitted: no');
});
