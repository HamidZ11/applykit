import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports keep domain modules visibly free of WXT globals.
  imports: false,
  manifest: {
    name: 'ApplyKit',
    description:
      'A privacy-first assistant for completing repetitive job applications.',
    // No host permissions: the panel is injected only into the tab the user
    // explicitly activates ApplyKit on (see docs/decisions/0002). `storage`
    // keeps the profile in this browser (see docs/decisions/0007).
    permissions: ['activeTab', 'scripting', 'storage'],
    action: {
      default_title: 'Open ApplyKit',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
