import { expect, test } from './extension';
import { E2E_PROFILE } from './profile';

/**
 * Employment history (fixtures/employment-application.html): the current
 * and previous jobs are filled, numbered sections wait for the user's
 * choice, and the current-role box is only ever guided.
 */

const FIXTURE = '/employment-application.html';

test.beforeEach(async ({ page, saveProfile }) => {
  await saveProfile({
    ...E2E_PROFILE,
    employment: [
      {
        id: 'testing',
        employer: 'Example Testing Services',
        title: 'Test Centre Associate',
        employmentType: 'part-time',
        startDate: '2025-02',
        endDate: '',
        current: true,
        description:
          'Welcomed candidates, checked identification and invigilated computer-based exams.',
      },
      {
        id: 'logistics',
        employer: 'Example Logistics',
        title: 'Warehouse Operative',
        employmentType: 'full-time',
        startDate: '2024-01',
        endDate: '2025-01',
        current: false,
        description:
          'Picked and packed orders, ran stock counts and kept the loading bay safe.',
      },
    ],
  });
  await page.goto(FIXTURE);
});

test('fills the current and previous jobs, and nothing uncertain', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();

  await expect(page.locator('#cur-employer')).toHaveValue(
    'Example Testing Services',
  );
  await expect(page.locator('#cur-type')).toHaveValue('pt');
  await expect(page.locator('#cur-start-month')).toHaveValue('2');
  await expect(page.locator('#cur-start-year')).toHaveValue('2025');
  await expect(page.locator('#cur-duties')).toHaveValue(/invigilated/);
  await expect(page.locator('#prev-employer')).toHaveValue('Example Logistics');
  await expect(page.locator('#prev-end')).toHaveValue('01/2025');
  // Positive controls above; nothing below may change.
  await expect(page.locator('#cur-current')).not.toBeChecked();
  await expect(page.locator('#j1-company')).toHaveValue('');
  await expect(page.locator('#prev-reason')).toHaveValue('');
  await expect(page.locator('#ref-employer')).toHaveValue('');
  await expect(page.locator('#ec-employer')).toHaveValue('');
  await expect(page.locator('#j2-title')).toHaveValue('Retail Assistant');
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('fills a numbered section from the job the user chooses', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel.getByRole('button', { name: /^Company name/ }).click();
  await panel.getByRole('button', { name: 'Choose a saved record' }).click();

  await expect(panel.getByRole('radio')).toHaveCount(2);
  await expect(panel.getByRole('radio', { checked: true })).toHaveCount(0);
  await panel.getByRole('radio', { name: /Example Logistics/ }).check();
  await expect(
    panel.getByRole('list', { name: 'What this record fills' }),
  ).toContainText('ToWill fill');
  await expect(page.locator('#j1-company')).toHaveValue('');

  await panel.getByRole('button', { name: 'Fill 5 fields' }).click();

  await expect(page.locator('#j1-company')).toHaveValue('Example Logistics');
  await expect(page.locator('#j1-from')).toHaveValue('2024-01');
  await expect(page.locator('#j1-to')).toHaveValue('2025-01');
  await expect(page.locator('#j2-employer')).toHaveValue('');
  await expect(panel).toContainText('Filled · your choice');
  await expect(page.locator('#status')).toContainText('submitted: no');
});
