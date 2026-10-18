import { expect, test } from './extension';

/**
 * Optional AI drafting (fixtures/open-questions.html, ADR 0019) while no
 * key is connected: open questions are listed for the user, nothing
 * offers AI, and nothing is filled. Drafting with a key is tested with a
 * mocked API in unit tests; browser tests never call Anthropic.
 */

const FIXTURE = '/open-questions.html';

test.beforeEach(async ({ page, saveProfile }) => {
  await saveProfile();
  await page.goto(FIXTURE);
});

test('lists open questions without offering AI drafting', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();
  // Positive control: the applicant's details were filled.
  await expect(page.locator('#first')).toHaveValue('Alex');
  await expect(page.locator('#q-skills')).toHaveValue('');

  await panel.getByRole('button', { name: 'Show all fields' }).click();
  await panel
    .getByRole('button', { name: /^Describe your programming skills/ })
    .click();
  await expect(panel).toContainText('Open question');
  await expect(
    panel.getByRole('button', { name: 'Draft with AI' }),
  ).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('submitted: no');
});
