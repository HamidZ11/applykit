import { expect, test } from './extension';

/**
 * Native radio groups (fixtures/radio-application.html, ADR 0020):
 * monitoring answers chosen by Autofill only with reuse on, saved and
 * graduation answers only after "Use this answer", and nothing else.
 */

const FIXTURE = '/radio-application.html';

const checked = (name: string) => `input[name="${name}"]:checked`;

test.beforeEach(async ({ page, saveProfile, saveAnswers, saveDiversity }) => {
  await saveProfile();
  await saveAnswers({
    schemaVersion: 1,
    answers: {
      noticePeriod: null,
      relocation: { withinCountry: 'yes', abroad: 'no' },
      workArrangement: 'hybrid',
      startDate: null,
      salary: null,
    },
    updatedAt: '2026-10-18T12:00:00.000Z',
  });
  await saveDiversity({
    schemaVersion: 1,
    preferences: {
      reuse: true,
      answers: {
        gender: 'non-binary',
        ethnicity: null,
        disability: 'no',
        religion: 'none',
        sexualOrientation: 'prefer-not-to-say',
      },
    },
    updatedAt: '2026-10-18T12:00:00.000Z',
  });
  await page.goto(FIXTURE);
});

test('Autofill chooses monitoring answers, including in a controlled group, and nothing else', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();

  await expect(page.locator('#first')).toHaveValue('Alex');
  await expect(page.locator(checked('religion'))).toHaveValue('none');
  await expect(page.locator(checked('disability'))).toHaveValue('n');
  // The page's own script keeps this choice only if it saw a click.
  await expect(page.locator(checked('orientation'))).toHaveValue('p');
  for (const name of [
    'gradBefore',
    'relocateAbroad',
    'arrangement',
    'gender',
    'rtw',
    'sponsorship',
    'health',
    'adjustments',
    'convictions',
  ]) {
    await expect(page.locator(checked(name))).toHaveCount(0);
  }
  await expect(page.locator(checked('relocateUk'))).toHaveValue('y');
  await expect(page.locator('#consent')).not.toBeChecked();
  await expect(page.locator('#status')).toContainText('submitted: no');
});

test('chooses a saved answer on a radio group only when the user uses it', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel
    .getByRole('button', {
      name: /^What is your preferred working arrangement/,
    })
    .click();
  await expect(page.locator(checked('arrangement'))).toHaveCount(0);

  await panel
    .getByRole('listitem')
    .filter({ hasText: 'What is your preferred working arrangement' })
    .getByRole('button', { name: 'Use this answer' })
    .click();

  await expect(page.locator(checked('arrangement'))).toHaveValue('hybrid');
  await expect(page.locator(checked('relocateAbroad'))).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('submitted: no');
});
