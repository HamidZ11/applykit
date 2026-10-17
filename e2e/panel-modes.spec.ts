import type { Locator, Page } from '@playwright/test';
import { expect, test } from './extension';

/**
 * The unified panel's compact and expanded modes on the realistic job
 * application fixture.
 */

const FIXTURE = '/job-application.html';
const TYPED_EMAIL = 'a.sample@example.org';

test.beforeEach(async ({ saveProfile }) => {
  await saveProfile();
});

async function openWithTypedEmail(
  page: Page,
  clickToolbar: (page: Page) => Promise<void>,
): Promise<Locator> {
  await page.goto(FIXTURE);
  await page.locator('#email').fill(TYPED_EMAIL);
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await expect(panel).toBeVisible();
  return panel;
}

/** The highlight ring must sit over the given page element. */
async function expectLocatorOver(page: Page, target: Locator) {
  const ring = page.getByTestId('applykit-locator');
  await expect(ring).toBeAttached();
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([
        ring.boundingBox(),
        target.boundingBox(),
      ]);
      if (!a || !b) return false;
      const centre = (box: typeof a) => [
        box.x + box.width / 2,
        box.y + box.height / 2,
      ];
      const [ax = 0, ay = 0] = centre(a);
      const [bx = 0, by = 0] = centre(b);
      return Math.abs(ax - bx) < 2 && Math.abs(ay - by) < 2;
    })
    .toBe(true);
}

const fieldList = (panel: Locator) =>
  panel.getByRole('region', { name: 'Fields on this form' });

test('reports honest outcomes on a realistic form without errors', async ({
  page,
  worker,
  clickToolbar,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  worker.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const bodyChildren = () =>
    page.evaluate(() =>
      [...document.body.children]
        .map((element) => element.localName)
        .filter((name) => name !== 'applykit-panel'),
    );
  await page.goto(FIXTURE);
  const before = await bodyChildren();
  expect(before).toEqual(['header', 'main', 'script']);

  const panel = await openWithTypedEmail(page, clickToolbar);
  await panel.getByRole('button', { name: /^Autofill/ }).click();

  await expect(panel.getByRole('status')).toHaveText(
    'Autofill finished. Filled 6 fields, kept 1 existing entry, 8 fields need you. Nothing was submitted.',
  );
  await expect(page.locator('#given')).toHaveValue('Alex');
  await expect(page.locator('#family')).toHaveValue('Sample');
  await expect(page.locator('#preferred')).toHaveValue('Al');
  await expect(page.locator('#phone')).toHaveValue('+44 20 7946 0000');
  await expect(page.locator('#email')).toHaveValue(TYPED_EMAIL);
  for (const selector of ['#location', '#salary']) {
    await expect(page.locator(selector)).toHaveValue('');
  }
  await expect(page.locator('#notice')).toHaveValue('');
  await expect(page.locator('[name=privacy_consent]')).not.toBeChecked();
  await expect(page.locator('#status')).toContainText('submitted: no');
  expect(await bodyChildren()).toEqual(before);
  expect(errors).toEqual([]);
});

test.describe('compact mode', () => {
  test('opens compact and summarises the plan', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);

    await expect(panel).toHaveAttribute('data-mode', 'compact');
    await expect(panel).toContainText('Fill 6 fields from your profile');
    await expect(panel).toContainText('Keep 1 entry you already typed');
    await expect(panel).toContainText('Leave 8 for you');
    await expect(panel).toContainText('5 required');
  });

  test('runs from the keyboard and steps through what needs you', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);

    await page.keyboard.press('Enter');
    await expect(page.locator('#given')).toHaveValue('Alex');

    await page.keyboard.press('Enter');
    await expect(
      panel.getByRole('button', { name: /^Current location/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expectLocatorOver(page, page.locator('#location'));

    await page.keyboard.press('Enter');
    await expectLocatorOver(page, page.locator('#resume'));
    await expect(page.locator('#status')).toContainText('submitted: no');
  });

  test('Escape closes the panel and returns focus to the page', async ({
    page,
    clickToolbar,
  }) => {
    await openWithTypedEmail(page, clickToolbar);
    await page.keyboard.press('Escape');
    await expect(page.locator('applykit-panel')).toHaveCount(0);
    await expect(page.locator('#email')).toBeFocused();
  });
});

test.describe('expanded mode', () => {
  test('lists every field by section', async ({ page, clickToolbar }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: 'Show all fields' }).click();

    await expect(panel).toHaveAttribute('data-mode', 'expanded');
    await expect(fieldList(panel).getByRole('listitem')).toHaveCount(15);
    for (const section of [
      'Personal information',
      'Experience',
      'Application questions',
      'Privacy',
    ]) {
      await expect(
        fieldList(panel).getByRole('region', { name: section }),
      ).toBeVisible();
    }
  });

  test('opens on the matching filter from the compact plan', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: /^Leave 8 for you/ }).click();

    await expect(
      panel.getByRole('tab', { name: /^Needs you/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(fieldList(panel).getByRole('listitem')).toHaveCount(8);
  });

  test('explains a selected field and points at it on the page', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: /^Autofill/ }).click();
    await panel.getByRole('button', { name: 'Show all fields' }).click();

    await panel.getByRole('button', { name: /^First name/ }).click();
    await expect(panel).toContainText(
      'Filled with your first name. The site accepted it.',
    );
    await expect(panel).toContainText('autocomplete="given-name"');

    await panel.getByRole('button', { name: /^Do you have the right/ }).click();
    await expectLocatorOver(
      page,
      page.locator('fieldset fieldset').filter({ hasText: 'right to work' }),
    );
  });

  test('Escape collapses first, then closes', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: 'Show all fields' }).click();

    await page.keyboard.press('Escape');
    await expect(panel).toHaveAttribute('data-mode', 'compact');
    await page.keyboard.press('Escape');
    await expect(page.locator('applykit-panel')).toHaveCount(0);
  });
});

test('switching modes keeps results, values and the current field', async ({
  page,
  clickToolbar,
}) => {
  const panel = await openWithTypedEmail(page, clickToolbar);
  await panel.getByRole('button', { name: /^Autofill/ }).click();
  await panel.getByRole('button', { name: /^Go to first/ }).click();

  for (let i = 0; i < 3; i++) {
    await panel.getByRole('button', { name: 'Show all fields' }).click();
    await expect(
      panel.getByRole('button', { name: /^Current location/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Show summary' }).click();
    await expect(panel).toContainText('Filled 6 fields');
  }

  await expect(page.locator('applykit-panel')).toHaveCount(1);
  await expect(page.locator('#given')).toHaveValue('Alex');
  await expect(page.locator('#email')).toHaveValue(TYPED_EMAIL);
  // The typed email and the six fills produced input events; mode switches
  // produced none.
  await expect(page.locator('#status')).toContainText('input events: 7');
  await expect(page.locator('#status')).toContainText('submitted: no');
});
