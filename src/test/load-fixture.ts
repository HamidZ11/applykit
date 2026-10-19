import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Replaces the test document's body with the body of an HTML file from
 * fixtures/, so unit tests exercise the same page used for manual testing.
 * Inline scripts are not executed.
 */
export function loadFixture(name: string): Document {
  // Vitest runs from the project root.
  const path = resolve(process.cwd(), 'fixtures', name);
  const parsed = new DOMParser().parseFromString(
    readFileSync(path, 'utf8'),
    'text/html',
  );
  document.body.innerHTML = parsed.body.innerHTML;
  return document;
}

/** Replaces the test document's body with the given markup. */
export function loadHtml(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

/**
 * Runs the inline scripts of a fixture loaded with `loadFixture`, for
 * fixtures whose widgets need them. Each script runs again on every call.
 */
export function runFixtureScripts(document: Document): void {
  for (const script of document.body.querySelectorAll('script')) {
    const copy = document.createElement('script');
    copy.textContent = script.textContent;
    script.replaceWith(copy);
  }
}
