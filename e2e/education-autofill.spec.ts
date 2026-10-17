import { expect, test } from './extension';

/**
 * Preferred name, separate calling code and education on a heading-based
 * internship form (fixtures/education-application.html).
 */

const FIXTURE = '/education-application.html';

test.beforeEach(async ({ page, saveProfile }) => {
  await saveProfile();
  await page.goto(FIXTURE);
});

test('fills phone parts and education from the matching records', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: /^Autofill/ }).click();
  await expect(panel.getByRole('status')).toContainText('Autofill finished');

  const filled: Record<string, string> = {
    '#first': 'Alex',
    '#preferred': 'Al',
    '#calling-code': 'GB',
    '#phone': '2079460000',
    '#university': 'u2',
    '#degree': 'ba',
    '#subject': 'Computer Science',
    '#edu-start': '09/2024',
    '#graduation': '2027-06',
    '#school': 'Example Sixth Form College',
    '#school-results': 'A*AA',
    '#school-end': '2024',
  };
  for (const [selector, value] of Object.entries(filled)) {
    await expect(page.locator(selector)).toHaveValue(value);
  }
  // Left alone: a custom dropdown, employment, a referee, diversity.
  for (const selector of [
    '#country',
    '#employer',
    '#job-start',
    '#ref-name',
    '#ref-email',
    '#gender',
    '#school-type',
  ]) {
    await expect(page.locator(selector)).toHaveValue('');
  }
  await expect(page.locator('[name=privacy]')).not.toBeChecked();
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('groups the full list by topic', async ({ page, clickToolbar }) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  const list = panel.getByRole('region', { name: 'Fields on this form' });

  for (const group of [
    'Personal information',
    'Contact details',
    'Education',
    'Employment',
    'References and other contacts',
    'Sensitive disclosures',
  ]) {
    await expect(list.getByRole('region', { name: group })).toBeVisible();
  }
  await expect(list.getByRole('region', { name: 'Other fields' })).toHaveCount(
    0,
  );
});
