import { expect, test } from './extension';

/**
 * Saved-profile autofill on a form that mixes the applicant's details with
 * fields ApplyKit must leave alone.
 */

const FIXTURE = '/full-application.html';

test.beforeEach(async ({ page, saveProfile }) => {
  await saveProfile();
  await page.goto(FIXTURE);
});

test('fills only the applicant’s own details', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: /^Autofill/ }).click();
  await expect(panel.getByRole('status')).toContainText('Filled 14 fields');

  const filled: Record<string, string> = {
    '#full-name': 'Alex Sample',
    '#preferred': 'Al',
    '#email': 'alex.sample@example.com',
    '#email-confirm': 'alex.sample@example.com',
    '#phone': '+44 20 7946 0000',
    '#address1': '1 Example Street',
    '#address2': 'Flat 2',
    '#city': 'London',
    '#county': 'Greater London',
    '#postcode': 'N1 9GU',
    '#country': 'GB',
    '#linkedin': 'https://www.linkedin.com/in/alex-sample',
    '#github': 'https://github.com/alex-sample',
    '#website': 'https://alex-sample.example.com',
  };
  for (const [selector, value] of Object.entries(filled)) {
    await expect(page.locator(selector)).toHaveValue(value);
  }
  for (const selector of [
    '#company-site',
    '#employer-address',
    '#manager-email',
    '#ref-name',
    '#ref-phone',
    '#salary',
    '#dob',
    '#captcha',
    '#motivation',
    '#trap',
    '#news-email',
  ]) {
    await expect(page.locator(selector)).toHaveValue('');
  }
  await expect(page.locator('#requisition')).toHaveValue('OL-2026-0087');
  await expect(page.locator('[name=privacy_consent]')).not.toBeChecked();
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('explains why a field about someone else was skipped', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel.getByRole('button', { name: /^Hiring manager/ }).click();

  await expect(panel).toContainText('Not about you');
  await expect(panel).toContainText(
    'This seems to ask about someone else or an organisation',
  );
});
