# 0005: Load panel fonts from bundled data with the FontFace API

- Status: Accepted
- Date: 2026-10-17

## Context

The panel uses Instrument Sans and IBM Plex Mono. It renders inside a shadow
root on arbitrary third-party pages, where:

- `@font-face` rules inside a shadow root are ignored by browsers.
- Loading font files from the extension requires `web_accessible_resources`,
  which ADR 0002 rules out because pages can probe them to detect ApplyKit.
- A page's Content Security Policy may block `data:` font URLs in
  stylesheets.

## Decision

- Bundle the two latin-subset WOFF2 files (about 45 KB together, from the
  OFL-licensed `@fontsource` packages) into the content script as data.
- When the panel opens, decode them and register them with
  `new FontFace(name, arrayBuffer)` and `document.fonts.add`. No URL is
  fetched, so neither web-accessible resources nor page CSP are involved.
- Use namespaced family names (`ApplyKit Instrument Sans`,
  `ApplyKit IBM Plex Mono`) so they cannot collide with the page's fonts.
- Font stacks fall back to system fonts if registration fails.

## Consequences

- The content script is about 60 KB larger.
- The font families become visible to the page's own `document.fonts`, but
  only after the user opens ApplyKit, and only under ApplyKit's names.
- Not yet verified in Safari.
