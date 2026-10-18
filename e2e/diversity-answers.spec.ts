import { expect, test } from './extension';

/**
 * Diversity preferences (fixtures/diversity-application.html): monitoring
 * lists are filled only with reuse on and an option that says the saved
 * answer; everything else on the form stays with the user.
 */

const FIXTURE = '/diversity-application.html';

function stored(reuse: boolean) {
  return {
    schemaVersion: 1,
    preferences: {
      reuse,
      answers: {
        gender: 'non-binary',
        ethnicity: 'other-mixed',
        disability: 'no',
        religion: 'none',
        sexualOrientation: 'prefer-not-to-say',
      },
    },
    updatedAt: '2026-10-18T12:00:00.000Z',
  };
}

test.beforeEach(async ({ saveProfile }) => {
  await saveProfile();
});

test('fills matching monitoring lists with reuse on', async ({
  page,
  clickToolbar,
  saveDiversity,
}) => {
  await saveDiversity(stored(true));
  await page.goto(FIXTURE);
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();

  await expect(page.locator('#first')).toHaveValue('Alex');
  await expect(page.locator('#ethnicity')).toHaveValue('e12');
  await expect(page.locator('#orientation')).toHaveValue('p');
  // Male and Female describe sex; a choice already made is kept.
  await expect(page.locator('#gender')).toHaveValue('');
  await expect(page.locator('#religion')).toHaveValue('Prefer not to say');
  await expect(page.locator('input[name="disability"]:checked')).toHaveCount(0);
  for (const id of ['#sex', '#birth-sex', '#health', '#sponsorship']) {
    await expect(page.locator(id)).toHaveValue('');
  }
  await expect(page.locator('#consent')).not.toBeChecked();
  await expect(page.locator('#status')).toContainText('submitted: no');
  await expect(panel).not.toContainText('Any other Mixed');
});

test('fills no monitoring list with reuse off', async ({
  page,
  clickToolbar,
  saveDiversity,
}) => {
  await saveDiversity(stored(false));
  await page.goto(FIXTURE);
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });

  await panel.getByRole('button', { name: /^Autofill/ }).click();

  // Positive control: the applicant's details were filled.
  await expect(page.locator('#first')).toHaveValue('Alex');
  await expect(page.locator('#ethnicity')).toHaveValue('');
  await expect(page.locator('#orientation')).toHaveValue('');
  await expect(page.locator('#status')).toContainText('submitted: no');
});
