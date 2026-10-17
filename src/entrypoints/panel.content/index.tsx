import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Panel } from '@/components/Panel';

type PanelUi = Awaited<ReturnType<typeof mountPanel>>;

declare global {
  // Survives repeated injections into the same page, so a second toolbar
  // click closes the existing panel instead of opening another.
  var __applykitPanel: PanelUi | undefined;
}

export default defineContentScript({
  // Injected on demand by the background script; never declared in the
  // manifest, so ApplyKit needs no host permissions.
  registration: 'runtime',
  cssInjectionMode: 'manual',

  async main(ctx) {
    if (globalThis.__applykitPanel) {
      closePanel();
      return;
    }
    globalThis.__applykitPanel = await mountPanel(ctx);
  },
});

async function mountPanel(ctx: ContentScriptContext) {
  // Inlined as a string rather than loaded as a web-accessible resource, so
  // pages cannot probe for the extension's files. Imported lazily because
  // WXT evaluates this module at build time to read its options.
  const { default: css } = await import('./style.css?inline');
  const ui = await createShadowRootUi(ctx, {
    name: 'applykit-panel',
    position: 'overlay',
    zIndex: 2147483647,
    css,
    // Keep keystrokes typed in the panel from reaching page shortcuts.
    isolateEvents: true,
    onMount(container) {
      const root = ReactDOM.createRoot(container);
      root.render(<Panel onClose={closePanel} />);
      return root;
    },
    onRemove(root) {
      root?.unmount();
    },
  });
  ui.mount();
  return ui;
}

function closePanel() {
  globalThis.__applykitPanel?.remove();
  globalThis.__applykitPanel = undefined;
}
