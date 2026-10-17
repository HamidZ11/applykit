import type { Locator, Page } from '@playwright/test';
import { expect, test } from './extension';

/**
 * Behaviour the panel concepts add on top of the shared contract, exercised on
 * the realistic job application fixture.
 */

const FIXTURE = '/job-application.html';
const TYPED_EMAIL = 'a.sample@example.org';

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
    'Autofill complete. Filled 2 fields, kept 1 existing entry, 12 fields need you.',
  );
  await expect(page.locator('#given')).toHaveValue('Alex');
  await expect(page.locator('#family')).toHaveValue('Sample');
  await expect(page.locator('#email')).toHaveValue(TYPED_EMAIL);
  // Unrecognised and unsupported fields stay untouched.
  for (const selector of ['#preferred', '#phone', '#location', '#salary']) {
    await expect(page.locator(selector)).toHaveValue('');
  }
  await expect(page.locator('#notice')).toHaveValue('');
  await expect(page.locator('[name=privacy_consent]')).not.toBeChecked();
  await expect(page.locator('#status')).toContainText('submitted: no');
  // ApplyKit adds nothing to the page other than its own shadow host.
  expect(await bodyChildren()).toEqual(before);
  expect(errors).toEqual([]);
});

test.describe('Command Dock', () => {
  test.beforeEach(({ concept }) => {
    test.skip(concept !== 'command-dock', 'Command Dock only');
  });

  test('summarises the plan before autofill', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);

    await expect(panel).toContainText('Fill 2 fields from your profile');
    await expect(panel).toContainText('Keep 1 entry you already typed');
    await expect(panel).toContainText('Leave 12 for you');
    await expect(panel).toContainText('7 required');
  });

  test('runs from the keyboard and steps through what needs you', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);

    await page.keyboard.press('Enter');
    await expect(page.locator('#given')).toHaveValue('Alex');
    await expect(
      panel.getByRole('button', { name: /^Go to first/ }),
    ).toBeVisible();

    await page.keyboard.press('Enter');
    const current = panel.locator('[aria-current="step"]');
    await expect(current).toContainText('Phone');
    await expectLocatorOver(page, page.locator('#phone'));

    await page.keyboard.press('Enter');
    await expect(current).toContainText('Current location');
    await expectLocatorOver(page, page.locator('#location'));
    await expect(page.locator('#status')).toContainText('submitted: no');
  });

  test('reveals the queue beyond the first five on request', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: /^Autofill/ }).click();
    const queue = panel.getByRole('region', { name: 'Needs you' });

    await expect(queue.getByRole('listitem')).toHaveCount(5);
    await panel.getByRole('button', { name: 'Show 7 more' }).click();
    await expect(queue.getByRole('listitem')).toHaveCount(12);
  });

  test('closes with Escape', async ({ page, clickToolbar }) => {
    await openWithTypedEmail(page, clickToolbar);
    await page.keyboard.press('Escape');
    await expect(page.locator('applykit-panel')).toHaveCount(0);
  });
});

test.describe('Field Inspector', () => {
  test.beforeEach(({ concept }) => {
    test.skip(concept !== 'field-inspector', 'Field Inspector only');
  });

  test('lists every field by section before autofill', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    const list = panel.getByRole('region', { name: 'Fields on this form' });

    await expect(list.getByRole('listitem')).toHaveCount(15);
    for (const section of [
      'Personal information',
      'Experience',
      'Application questions',
      'Privacy',
    ]) {
      await expect(list.getByRole('region', { name: section })).toBeVisible();
    }
    await expect(
      list.getByRole('button', { name: /^First name.*Alex$/ }),
    ).toBeVisible();
    await expect(
      list.getByRole('button', { name: new RegExp(`^Email.*${TYPED_EMAIL}$`) }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Autofill 2 fields' }),
    ).toBeVisible();
  });

  test('filters by who handles each field', async ({ page, clickToolbar }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    const rows = panel
      .getByRole('region', { name: 'Fields on this form' })
      .getByRole('listitem');

    await panel.getByRole('tab', { name: /^Needs you/ }).click();
    await expect(rows).toHaveCount(12);
    await panel.getByRole('tab', { name: /^Fillable/ }).click();
    await expect(rows).toHaveCount(3);
  });

  test('turns the list into an execution report', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: /^Autofill/ }).click();

    await expect(panel.getByRole('tab', { name: /^Done\s*3$/ })).toBeVisible();
    await panel.getByRole('button', { name: /^First name/ }).click();
    await expect(panel).toContainText('Filled from your profile.');
    await expect(panel).toContainText('autocomplete="given-name"');
    await panel.getByRole('button', { name: /^Email/ }).click();
    await expect(panel).toContainText(
      'You had already typed this, so ApplyKit left it as is.',
    );
  });

  test('points at the selected field on the page', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: /^Autofill/ }).click();

    await panel.getByRole('button', { name: /^Review 7 required/ }).click();
    await expect(
      panel.getByRole('tab', { name: /^Needs you/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expectLocatorOver(page, page.locator('#phone'));

    await page.keyboard.press('ArrowDown');
    await expectLocatorOver(page, page.locator('#location'));

    await panel.getByRole('button', { name: /^Do you have the right/ }).click();
    await expectLocatorOver(
      page,
      page.locator('fieldset fieldset').filter({ hasText: 'right to work' }),
    );
  });

  test('Escape clears the selection, then closes', async ({
    page,
    clickToolbar,
  }) => {
    const panel = await openWithTypedEmail(page, clickToolbar);
    await panel.getByRole('button', { name: /^Phone/ }).click();
    await expect(page.getByTestId('applykit-locator')).toBeAttached();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('applykit-locator')).toHaveCount(0);
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('applykit-panel')).toHaveCount(0);
  });
});
