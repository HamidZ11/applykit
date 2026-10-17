import { expect, test } from './extension';

/**
 * Custom dropdowns: listed once, guided, never operated
 * (fixtures/custom-controls.html).
 */

const FIXTURE = '/custom-controls.html';

test.beforeEach(async ({ page, saveProfile }) => {
  await saveProfile();
  await page.goto(FIXTURE);
});

test('lists custom dropdowns and guides without touching them', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await expect(panel).toContainText('12 fields on this form');

  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel.getByRole('button', { name: /^Country of residence/ }).click();
  await expect(panel).toContainText('From your saved profile');
  await expect(panel).toContainText('United Kingdom');

  await panel.getByRole('button', { name: 'Go to field' }).click();
  await expect(page.locator('#residence')).toBeFocused();
  await expect(page.locator('#residence')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('#residence')).toHaveText('Select…');
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('counts a question that appears later after a rescan', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await expect(panel).toContainText('12 fields on this form');

  await page.getByRole('button', { name: 'I was referred by someone' }).click();
  await panel.getByRole('button', { name: 'Rescan the page' }).click();

  await expect(panel).toContainText('13 fields on this form');
});
