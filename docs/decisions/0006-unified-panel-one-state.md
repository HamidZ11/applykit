# 0006: One panel, two modes, one state

- Status: Accepted
- Date: 2026-10-17

## Context

Design exploration produced two working panel concepts: Command Dock
(compact, action-first) and Field Inspector (expanded, inspection-first).
The user approved combining them: the dock by default, expandable into the
inspector. Expanding or collapsing must never trigger autofill, rescan the
page, lose results, reset statuses or lose review progress.

## Decision

- One `Panel` component with a `mode` of `compact` or `expanded`, not two
  panels. Both modes share the header, footer, primary action, width and
  bottom-right anchor; expanding only grows the panel upward.
- One `useReducer` (`panelReducer`) holds mode, filter, phase, scanned
  fields, the autofill result and the selected field. Everything else is
  derived on render. No global state library.
- The selection is stored as the field's element, so it survives rescans and
  is the same "current field" in both modes.
- Only `usePanel` calls the engine: `scanFields` on open, after autofill and
  on rescan; `autofill` only from the primary action. The engine stays free
  of React.
- The concept build switch (`APPLYKIT_CONCEPT`) is removed. Both original
  concepts remain in history at commit `3bb2d12`.

## Consequences

- Mode changes are pure state transitions, covered by unit tests of the
  reducer and of the rendered panel in jsdom.
- A field selected in the expanded list that is not in the compact queue
  stays outlined on the page after collapsing, without a matching row.
