import { expect, test } from './extension';

/**
 * Custom dropdowns (fixtures/custom-dropdowns.html, ADR 0021): chosen
 * only after "Choose this option", in the supported patterns, and never
 * by Autofill. These check what jsdom cannot: real layout and
 * visibility, a portalled list, and the guard against navigation, which
 * needs the browser's Navigation API.
 */

const FIXTURE = '/custom-dropdowns.html';

const shows = (id: string) => `#${id} .value`;

test.beforeEach(async ({ page, saveProfile, saveAnswers, saveDiversity }) => {
  await saveProfile();
  await saveAnswers({
    schemaVersion: 1,
    answers: {
      noticePeriod: { amount: 4, unit: 'weeks' },
      relocation: { withinCountry: 'yes', abroad: 'no' },
      workArrangement: 'hybrid',
      startDate: null,
      salary: null,
    },
    updatedAt: '2026-10-19T12:00:00.000Z',
  });
  await saveDiversity({
    schemaVersion: 1,
    preferences: {
      reuse: true,
      answers: {
        gender: 'non-binary',
        ethnicity: null,
        disability: null,
        religion: null,
        sexualOrientation: null,
      },
    },
    updatedAt: '2026-10-19T12:00:00.000Z',
  });
  await page.goto(FIXTURE);
});

test('Autofill fills the native fields and operates no dropdown', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();

  await expect(page.locator('#first')).toHaveValue('Alex');
  await expect(page.locator(shows('country'))).toHaveText('Select a country');
  await expect(page.locator(shows('gender'))).toHaveText('Select…');
  await expect(page.locator('#status')).toContainText('changes: 0');
  await expect(page.locator('#status')).toContainText('submitted: 0');
});

test('chooses in a select-only combobox and a portalled list on request', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();

  for (const question of [
    'Country of residence',
    'Preferred working arrangement',
  ]) {
    await panel
      .getByRole('listitem')
      .filter({ hasText: question })
      .getByRole('button', { name: 'Choose this option' })
      .click();
  }

  await expect(page.locator(shows('country'))).toHaveText('United Kingdom');
  await expect(page.locator(shows('arrangement'))).toHaveText('Hybrid');
  await expect(page.locator('[data-portal]')).toHaveCount(0);
  await expect(page.locator(shows('licence'))).toHaveText('Select…');
  await expect(page.locator('#status')).toContainText('submitted: 0');
});

test('blocks navigation a choice sets off, and reports it', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  const row = panel
    .getByRole('listitem')
    .filter({ hasText: 'Working arrangement in your second rotation' });

  await row.getByRole('button', { name: 'Choose this option' }).click();

  await expect(row).toContainText('tried to submit the form or leave');
  // The page attempted it (positive control), and stayed.
  await expect(page.locator('#status')).toContainText('navigations: 1');
  expect(new URL(page.url()).hash).toBe('');
});

test('leaves a dropdown that opens only on a mouse press', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  const row = panel
    .getByRole('listitem')
    .filter({ hasText: 'Expected annual salary' });

  await row.getByRole('button', { name: 'Choose this option' }).click();

  await expect(row).toContainText('needs manual selection');
  await expect(page.locator('#salary-list')).toBeHidden();
  await expect(page.locator(shows('salary'))).toHaveText('Select a band');
});
