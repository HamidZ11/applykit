import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

const EXTENSION_PATH = resolve(import.meta.dirname, '../.output/chrome-mv3');

interface ExtensionFixtures {
  /** Throwaway browser profile; never reuse a real one. */
  profileDir: string;
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  /** Clicks the ApplyKit toolbar button for the tab showing `page`. */
  clickToolbar: (page: Page) => Promise<void>;
}

interface ChromeInWorker {
  chrome: {
    action: {
      onClicked: {
        hasListeners: () => boolean;
        addListener: (listener: () => void) => void;
      };
    };
  };
  __applykitProbe?: boolean;
}

const MAX_CLICK_ATTEMPTS = 5;

/**
 * Playwright cannot click the browser toolbar, so the toolbar click is
 * performed with the DevTools protocol's `Extensions.triggerAction`, which
 * runs the same code path as a real click and grants `activeTab`.
 * It requires `--enable-unsafe-extension-debugging`, a throwaway profile and
 * Chromium (Chrome for Testing); branded Chrome ignores `--load-extension`.
 */
export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  profileDir: async ({}, use) => {
    const profile = mkdtempSync(join(tmpdir(), 'applykit-e2e-'));
    await use(profile);
    rmSync(profile, { recursive: true, force: true });
  },

  context: async ({ profileDir }, use) => {
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: 'chromium', // new headless mode, which supports extensions
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--enable-unsafe-extension-debugging',
        '--remote-debugging-port=0',
      ],
    });
    await use(context);
    await context.close();
  },

  worker: async ({ context }, use) => {
    const [existing] = context.serviceWorkers();
    const worker = existing ?? (await context.waitForEvent('serviceworker'));
    // The worker is reported as soon as it starts, before its script has run.
    // A click dispatched before the listener exists is silently dropped, so
    // wait until the toolbar listener is registered.
    await expect
      .poll(() =>
        worker.evaluate(() =>
          (
            globalThis as unknown as ChromeInWorker
          ).chrome.action.onClicked.hasListeners(),
        ),
      )
      .toBe(true);
    await use(worker);
  },

  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },

  clickToolbar: async ({ context, extensionId, profileDir }, use) => {
    // `extensionId` depends on the running browser, so DevToolsActivePort
    // has been written by now.
    const cdp = new WebSocket(devToolsWebSocketUrl(profileDir));
    await new Promise<void>((resolve, reject) => {
      cdp.addEventListener('open', () => {
        resolve();
      });
      cdp.addEventListener('error', () => {
        reject(new Error('Could not connect to the browser DevTools'));
      });
    });

    let nextId = 1;
    const send = (method: string, params: object) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = nextId++;
        const onMessage = (event: MessageEvent<string>) => {
          const message = JSON.parse(event.data) as {
            id?: number;
            result?: Record<string, unknown>;
            error?: { message: string };
          };
          if (message.id !== id) return;
          cdp.removeEventListener('message', onMessage);
          if (message.error) reject(new Error(message.error.message));
          else resolve(message.result ?? {});
        };
        cdp.addEventListener('message', onMessage);
        cdp.send(JSON.stringify({ id, method, params }));
      });

    await use(async (page) => {
      // Locate the tab by its currently loaded URL.
      const { targetInfos } = (await send('Target.getTargets', {
        filter: [{ type: 'tab' }],
      })) as { targetInfos: { targetId: string; url: string }[] };
      const tab = targetInfos.find((target) => target.url === page.url());
      if (!tab) throw new Error(`No tab found for ${page.url()}`);
      const trigger = () =>
        send('Extensions.triggerAction', {
          id: extensionId,
          targetId: tab.targetId,
        });
      // The extension's service worker is stopped and restarted shortly after
      // the browser starts, and a click that lands during the restart is lost.
      // Attach a probe listener to the live worker and retry only if that
      // worker provably did not receive the click.
      for (let attempt = 1; attempt <= MAX_CLICK_ATTEMPTS; attempt++) {
        const worker = context.serviceWorkers().at(-1);
        const armed = await worker
          ?.evaluate(() => {
            const scope = globalThis as unknown as ChromeInWorker;
            if (!scope.chrome.action.onClicked.hasListeners()) return false;
            scope.__applykitProbe = false;
            scope.chrome.action.onClicked.addListener(() => {
              scope.__applykitProbe = true;
            });
            return true;
          })
          .catch(() => false);
        if (!worker || !armed) {
          await context
            .waitForEvent('serviceworker', { timeout: 1000 })
            .catch(() => undefined);
          continue;
        }
        await trigger();
        const delivered = await expect
          .poll(
            () =>
              worker
                .evaluate(
                  () =>
                    (globalThis as unknown as ChromeInWorker).__applykitProbe,
                )
                .catch(() => false),
            { timeout: 1500 },
          )
          .toBe(true)
          .then(
            () => true,
            () => false,
          );
        if (delivered) return;
      }
      throw new Error('The toolbar click was never delivered to the extension');
    });
    cdp.close();
  },
});

export { expect };

function devToolsWebSocketUrl(profile: string): string {
  const [port, path] = readFileSync(
    join(profile, 'DevToolsActivePort'),
    'utf8',
  ).split('\n');
  if (!port || !path) throw new Error('DevToolsActivePort is incomplete');
  return `ws://127.0.0.1:${port}${path}`;
}
