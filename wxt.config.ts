import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

/**
 * Panel design concepts under exploration (design/panel-exploration).
 * Selected with the APPLYKIT_CONCEPT environment variable, e.g.
 * `APPLYKIT_CONCEPT=field-inspector wxt build`, which outputs to
 * `.output/field-inspector/chrome-mv3`. Tooling that runs without it (such as
 * `wxt prepare`) falls back to the first concept.
 */
const CONCEPTS = {
  'command-dock': 'Command Dock',
  'field-inspector': 'Field Inspector',
} as const;

type Concept = keyof typeof CONCEPTS;

function selectConcept(value: string | undefined): Concept {
  if (value === undefined) return 'command-dock';
  if (value in CONCEPTS) return value as Concept;
  throw new Error(
    `Unknown APPLYKIT_CONCEPT "${value}". Use one of: ${Object.keys(CONCEPTS).join(', ')}.`,
  );
}

const concept = selectConcept(process.env.APPLYKIT_CONCEPT);

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports keep domain modules visibly free of WXT globals.
  imports: false,
  outDirTemplate: `${concept}/{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`,
  manifest: {
    // Distinct names let both concepts be loaded side by side for review.
    name: `ApplyKit · ${CONCEPTS[concept]}`,
    description:
      'A privacy-first assistant for completing repetitive job applications.',
    // No host permissions: the panel is injected only into the tab the user
    // explicitly activates ApplyKit on (see docs/decisions/0002).
    permissions: ['activeTab', 'scripting'],
    action: {
      default_title: 'Open ApplyKit',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      // Constant-folded, so the other concept is dropped from the bundle.
      __APPLYKIT_CONCEPT__: JSON.stringify(concept),
    },
  }),
});
