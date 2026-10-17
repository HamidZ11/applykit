import { expect, test } from './extension';

const FIXTURE = '/basic-application.html';
const AUTOFILL = { name: /^Autofill/ };
const PANEL = { name: 'ApplyKit' };

interface Manifest {
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
  web_accessible_resources?: unknown[];
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
});

test('declares only activeTab and scripting, with no host access', async ({
  worker,
}) => {
  const manifest = await worker.evaluate(() =>
    (
      globalThis as unknown as {
        chrome: { runtime: { getManifest: () => Manifest } };
      }
    ).chrome.runtime.getManifest(),
  );

  expect(manifest.permissions).toEqual(['activeTab', 'scripting']);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
});

test('shows no panel until the toolbar button is clicked', async ({ page }) => {
  await expect(page.locator('applykit-panel')).toHaveCount(0);
});

test('opens the panel from the toolbar button', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);

  const panel = page.getByRole('dialog', PANEL);
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', AUTOFILL)).toBeEnabled();
});

test('closes with the close button and reopens', async ({
  page,
  clickToolbar,
}) => {
  const panel = page.locator('applykit-panel');
  await clickToolbar(page);
  await expect(panel).toHaveCount(1);

  await page.getByRole('button', { name: 'Close ApplyKit' }).click();
  await expect(panel).toHaveCount(0);

  await clickToolbar(page);
  await expect(panel).toHaveCount(1);
});

test('toggles on repeated toolbar clicks without duplicating the panel', async ({
  page,
  clickToolbar,
}) => {
  const panel = page.locator('applykit-panel');

  await clickToolbar(page);
  await expect(panel).toHaveCount(1);

  await clickToolbar(page);
  await expect(panel).toHaveCount(0);

  await clickToolbar(page);
  await expect(panel).toHaveCount(1);
  await expect(panel).not.toHaveCount(2);
});

test('fills first name, last name and email with sample data', async ({
  page,
  clickToolbar,
}) => {
  await clickToolbar(page);
  await page.getByRole('button', AUTOFILL).click();

  await expect(page.locator('#first-name')).toHaveValue('Alex');
  await expect(page.locator('#last-name')).toHaveValue('Sample');
  await expect(page.locator('#email')).toHaveValue('alex.sample@example.com');
  await expect(page.getByRole('dialog', PANEL).getByRole('status')).toHaveText(
    'Autofill complete. Filled 3 fields, 0 fields need you.',
  );
  // Fields ApplyKit does not recognise are left alone.
  await expect(page.locator('[name=job_id]')).toHaveValue('fixture-001');
});

test('dispatches input and change events the page can observe', async ({
  page,
  clickToolbar,
}) => {
  await page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { __events: string[] }).__events = log;
    for (const type of ['input', 'change']) {
      document.addEventListener(type, (event) => {
        log.push(`${type}:${(event.target as HTMLInputElement).id}`);
      });
    }
  });

  await clickToolbar(page);
  await page.getByRole('button', AUTOFILL).click();
  await expect(page.locator('#email')).toHaveValue('alex.sample@example.com');

  const events = await page.evaluate(
    () => (window as unknown as { __events: string[] }).__events,
  );
  expect(events).toEqual([
    'input:first-name',
    'change:first-name',
    'input:last-name',
    'change:last-name',
    'input:email',
    'change:email',
  ]);
  // The fixture's own listener also saw three input events.
  await expect(page.locator('#status')).toContainText('input events: 3');
});

test('preserves values the user already entered', async ({
  page,
  clickToolbar,
}) => {
  await page.locator('#first-name').fill('Typed by user');

  await clickToolbar(page);
  await page.getByRole('button', AUTOFILL).click();

  await expect(page.locator('#last-name')).toHaveValue('Sample');
  await expect(page.locator('#first-name')).toHaveValue('Typed by user');
  await expect(
    page.getByRole('dialog', PANEL).getByRole('status'),
  ).toContainText('Filled 2 fields, kept 1 existing entry');
});

test('never submits the form', async ({ page, clickToolbar }) => {
  await clickToolbar(page);
  await page.getByRole('button', AUTOFILL).click();
  await expect(page.locator('#email')).toHaveValue('alex.sample@example.com');

  await expect(page.locator('#status')).toContainText('Submitted: no');
  expect(page.url()).toContain(FIXTURE);

  // Guard against a vacuous pass: the fixture must report a real submit.
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.locator('#status')).toContainText('Submitted: YES');
});

test('fails gracefully on pages extensions cannot script', async ({
  context,
  worker,
  clickToolbar,
}) => {
  const page = await context.newPage();
  await page.goto('chrome://version');
  const warning = worker.waitForEvent('console', {
    predicate: (message) => message.text().includes('could not open'),
  });

  await clickToolbar(page);

  expect((await warning).text()).toContain('could not open on this page');
  // The extension is still alive and works on a normal page afterwards.
  const normal = await context.newPage();
  await normal.goto(FIXTURE);
  await clickToolbar(normal);
  await expect(normal.locator('applykit-panel')).toHaveCount(1);
});
