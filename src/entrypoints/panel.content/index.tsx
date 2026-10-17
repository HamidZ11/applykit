import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';

type PanelUi = Awaited<ReturnType<typeof mountPanel>>;

interface PanelHandle {
  /** Null while the panel is still mounting. */
  ui: PanelUi | null;
  /** Set when the user closes the panel before it finished mounting. */
  cancelled: boolean;
}

declare global {
  // Survives repeated injections into the same page, so a second toolbar
  // click closes the existing panel instead of opening another.
  var __applykitPanel: PanelHandle | undefined;
}

export default defineContentScript({
  // Injected on demand by the background script; never declared in the
  // manifest, so ApplyKit needs no host permissions.
  registration: 'runtime',
  cssInjectionMode: 'manual',

  async main(ctx) {
    if (globalThis.__applykitPanel) {
      void closePanel();
      return;
    }
    // Claimed synchronously so a fast second click cannot mount a duplicate.
    const handle: PanelHandle = { ui: null, cancelled: false };
    globalThis.__applykitPanel = handle;
    try {
      const ui = await mountPanel(ctx);
      if (handle.cancelled) ui.remove();
      else handle.ui = ui;
    } catch (error) {
      // Release the claim so the next toolbar click can try again.
      if (globalThis.__applykitPanel === handle) {
        globalThis.__applykitPanel = undefined;
      }
      throw error;
    }
  },
});

async function mountPanel(ctx: ContentScriptContext) {
  // Imported lazily because WXT evaluates this module at build time to read
  // its options. CSS and fonts are inlined rather than loaded as
  // web-accessible resources, so pages cannot probe for the extension's files.
  const [{ default: css }, { loadPanelFonts }, { Concept }] = await Promise.all(
    [import('./style.css?inline'), import('@/page/fonts'), import('./concept')],
  );
  await loadPanelFonts();

  const ui = await createShadowRootUi(ctx, {
    name: 'applykit-panel',
    position: 'overlay',
    zIndex: 2147483647,
    css,
    // Keep keystrokes typed in the panel from reaching page shortcuts.
    isolateEvents: true,
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(
        <Concept
          onClose={() => {
            void closePanel();
          }}
        />,
      );
      return root;
    },
    onRemove(root) {
      root?.unmount();
    },
  });
  ui.mount();
  return ui;
}

/** Plays the exit transition, then removes the panel from the page. */
async function closePanel() {
  const handle = globalThis.__applykitPanel;
  if (!handle) return;
  globalThis.__applykitPanel = undefined;

  const { ui } = handle;
  if (!ui) {
    handle.cancelled = true;
    return;
  }
  ui.uiContainer.dataset.state = 'closing';
  await Promise.allSettled(
    ui.uiContainer
      .getAnimations({ subtree: true })
      .map((animation) => animation.finished),
  );
  ui.remove();
}
