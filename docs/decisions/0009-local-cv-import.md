# 0009: Local CV import with deterministic extraction and review

- Status: Accepted
- Date: 2026-10-17

## Context

Users want to start their profile from their CV. CVs are sensitive, come in
arbitrary layouts, and the extension must not send data anywhere or run
remote code (Manifest V3).

## Decision

- Formats: PDF and Word (.docx), up to 5 MB and the first 10 PDF pages.
  Older .doc, scanned (image-only) PDFs and password-protected PDFs are
  refused with a specific explanation. No OCR.
- Libraries, both loaded only when a CV is imported:
  - PDF: `pdfjs-dist` (Mozilla PDF.js), the established browser PDF parser.
    Its worker is bundled into the extension; fonts, system fonts,
    WebAssembly and forms are disabled because only text is needed.
    Requires `Uint8Array.prototype.toHex` (Chrome 140+); some documents
    (encrypted PDFs, some fonts) also need `Map.prototype.getOrInsertComputed`
    (Chrome 145+) and `Math.sumPrecise` (Chrome 147+). The Safari minimum is
    unconfirmed. See the engineering review notes in ADR 0010.
  - DOCX: `mammoth`, raw-text extraction only, so no HTML is produced.
  - Considered: `unpdf` (a wrapper around the same PDF.js) and hand-parsing
    DOCX XML (less code, but reimplements an established library).
- Pipeline in `src/cv`, independent of React: read (validate, parse) →
  normalise (lines) → sections → extract (candidates) → review (proposals,
  choices, apply). Extraction is deterministic and conservative: certainty
  is `confident` or `review`, each with its source text and notes; nothing
  is inferred from ambiguous text, and year-only dates are never turned into
  months. No AI or remote services.
- Review is the only route into the profile: suggestions are applied to
  the editable draft, never to the saved profile; conflicts keep the
  current value unless the user ticks the suggestion; duplicate records are
  never added. Save remains the confirmation boundary.
- Retention: the CV file and its text are not stored. Only the details the
  user accepts reach the draft (and its autosave). Keeping documents would
  need a separate decision on storage size, encryption and deletion.

## Consequences

- About 0.7 MB of parser code and a 1.3 MB worker ship with the extension,
  but load only when importing.
- Unusual layouts (multi-column PDFs, tables, creative designs) extract
  less; users complete those details themselves.
- Non-Latin PDFs that rely on external character maps may extract poorly,
  because PDF.js is not given remote resources.
