import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Browser tests need to see inside the panel, so they use a build with an
// open shadow root (see src/entrypoints/panel.content). It goes to its own
// folder so it can never be mistaken for the build users load.
const e2e = process.env.WXT_E2E === 'true';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports keep domain modules visibly free of WXT globals.
  imports: false,
  ...(e2e ? { outDirTemplate: '{{browser}}-mv{{manifestVersion}}-e2e' } : {}),
  manifest: {
    name: 'ApplyKit',
    description:
      'A privacy-first assistant for completing repetitive job applications.',
    // No host permissions: the panel is injected only into the tab the user
    // explicitly activates ApplyKit on (see docs/decisions/0002). `storage`
    // keeps the profile in this browser (see docs/decisions/0007).
    permissions: ['activeTab', 'scripting', 'storage'],
    // Optional AI drafting (docs/decisions/0019): requested only when the
    // user connects their own Anthropic key, and removed on disconnect.
    optional_host_permissions: ['https://api.anthropic.com/*'],
    action: {
      default_title: 'Open ApplyKit',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
