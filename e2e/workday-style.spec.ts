import { expect, test } from './extension';

/**
 * A fictional form shaped like observed Workday pages
 * (fixtures/workday-style.html): real questions shown instead of "Select
 * One Required", education years filled, the Degree dropdown chosen only
 * on request, and the panel moved off the page's bottom bar.
 */

const FIXTURE = '/workday-style.html';

test.beforeEach(async ({ page, saveProfile }) => {
  await saveProfile();
  await page.goto(FIXTURE);
});

test('shows real questions, fills years, chooses the degree on request', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();
  await expect(page.locator('#edu-from')).not.toHaveValue('');
  await expect(page.locator('#degree')).toHaveText('Select One');

  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await expect(panel).toContainText('Are you related to a current employee?');
  await expect(panel).not.toContainText('Select One Required');
  await panel
    .getByRole('listitem')
    .filter({ hasText: 'Degree' })
    .getByRole('button', { name: 'Choose this option' })
    .click();
  await expect(page.locator('#degree')).not.toHaveText('Select One');
  await expect(page.locator('#q-authorised')).toHaveText('Select One');
  await expect(page.locator('#status')).toContainText('submitted: 0');
});

test('moves out of the way of the page’s bottom bar', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  const before = await panel.boundingBox();

  const handle = panel.getByRole('button', { name: 'Move panel' });
  await handle.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');

  const after = await panel.boundingBox();
  expect(after?.y).toBeLessThan(before?.y ?? 0);
  await expect(
    page.getByRole('button', { name: 'Save and Continue' }),
  ).toBeVisible();
});
