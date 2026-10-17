# 0004: Manifest V3 for all browsers, including Safari

- Status: Accepted
- Date: 2026-10-17

## Context

WXT builds Safari as Manifest V2 by default. ApplyKit uses `browser.action`
and `browser.scripting`, which are Manifest V3 APIs. Safari has supported
Manifest V3 since Safari 15.4.

## Decision

Build every target as Manifest V3. The Safari script is
`wxt build -b safari --mv3`.

## Consequences

- One code path for action and scripting APIs; no MV2 fallbacks.
- Very old Safari versions are not supported.
- The Safari build compiles but has not yet been converted with Xcode
  (`xcrun safari-web-extension-converter`) or run in Safari.
