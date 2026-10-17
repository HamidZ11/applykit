import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './extension';

/**
 * Design capture, not a test: drives the same workflow on each concept and
 * saves screenshots and a video to artifacts/design/ for side-by-side review.
 * Skipped unless APPLYKIT_CAPTURE=1 (see `pnpm capture`).
 */

const HOST = 'careers.halden-freight.test';
const URL = `http://${HOST}:4399/job-application.html`;
const OUT = resolve(import.meta.dirname, '../artifacts/design');
/** What the applicant had already typed before opening ApplyKit. */
const TYPED_EMAIL = 'a.sample@example.org';

test.skip(!process.env.APPLYKIT_CAPTURE, 'Design capture runs on demand only');

test.use({
  viewport: { width: 1440, height: 900 },
  // A realistic careers host for the page title and panel, served locally.
  browserArgs: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`],
});

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.describe('screenshots', () => {
  test.use({ deviceScaleFactor: 2 });

  test('ready, results and review states', async ({
    page,
    concept,
    clickToolbar,
  }) => {
    const panel = await open(page, clickToolbar);
    await shoot(page, concept, '1-ready');

    await panel.getByRole('button', { name: /^Autofill/ }).click();
    await expect(page.locator('#given')).toHaveValue('Alex');
    await settle(page);
    await shoot(page, concept, '2-results');

    if (concept === 'command-dock') {
      await panel.getByRole('button', { name: /^Go to first/ }).click();
      await panel.getByRole('button', { name: /^Next field/ }).click();
      await panel.getByRole('button', { name: /^Next field/ }).click();
    } else {
      await panel.getByRole('button', { name: /^Review/ }).click();
      await panel.getByRole('button', { name: /^Current location/ }).click();
    }
    await waitForLocator(page);
    await shoot(page, concept, '3-review');

    // How much of the application the panel covers on a smaller laptop.
    await page.setViewportSize({ width: 1280, height: 720 });
    await settle(page);
    await page.screenshot({
      path: resolve(OUT, `${concept}-4-compact-viewport.png`),
    });
  });
});

test.describe('video', () => {
  test.use({ videoDir: resolve(OUT, 'video-tmp') });

  test('workflow recording', async ({ page, concept, clickToolbar }) => {
    await page.waitForTimeout(400);
    const panel = await open(page, clickToolbar);
    await page.waitForTimeout(900);
    await panel.getByRole('button', { name: /^Autofill/ }).click();
    await page.waitForTimeout(1400);
    if (concept === 'command-dock') {
      for (const name of [/^Go to first/, /^Next field/, /^Next field/]) {
        await panel.getByRole('button', { name }).click();
        await page.waitForTimeout(1100);
      }
    } else {
      await panel.getByRole('button', { name: /^Review/ }).click();
      await page.waitForTimeout(1100);
      for (const name of [/^Current location/, /^Résumé/]) {
        await panel.getByRole('button', { name }).click();
        await page.waitForTimeout(1100);
      }
    }
    await panel.getByRole('button', { name: 'Close ApplyKit' }).click();
    await page.waitForTimeout(600);
    const video = page.video();
    await page.close();
    await video?.saveAs(resolve(OUT, `${concept}.webm`));
  });
});

async function open(page: Page, clickToolbar: (page: Page) => Promise<void>) {
  await page.goto(URL);
  await page.locator('#email').fill(TYPED_EMAIL);
  await clickToolbar(page);
  const panel = page.getByRole('dialog', { name: 'ApplyKit' });
  await expect(panel).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  return panel;
}

/** Waits for entrance and state transitions to finish before capturing. */
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const host = document.querySelector('applykit-panel');
    const running = host?.shadowRoot
      ?.getAnimations()
      .filter((animation) => animation.playState === 'running');
    return running?.length === 0;
  });
}

/** Waits until the page highlight is fully visible and scrolling has stopped. */
async function waitForLocator(page: Page) {
  await page.waitForFunction(() => {
    const ring = document
      .querySelector('applykit-panel')
      ?.shadowRoot?.querySelector('[data-testid="applykit-locator"]');
    return (
      ring !== null &&
      ring !== undefined &&
      getComputedStyle(ring).opacity === '1'
    );
  });
  let last = -1;
  await expect
    .poll(async () => {
      const y = await page.evaluate(() => window.scrollY);
      const stable = y === last;
      last = y;
      return stable;
    })
    .toBe(true);
}

async function shoot(page: Page, concept: string, state: string) {
  await page.screenshot({ path: resolve(OUT, `${concept}-${state}.png`) });
  await page
    .getByRole('dialog', { name: 'ApplyKit' })
    .screenshot({ path: resolve(OUT, `${concept}-${state}-panel.png`) });
}
