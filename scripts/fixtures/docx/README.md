# Word viewer fixtures

Deterministic `.docx` files for the Word document viewer's gates
(`scripts/test-docx-viewer.mjs`, heavy — headless chrome over a worktree server;
`scripts/test-docx-viewer-model.mjs` is the PURE fast half and reads none of these).

Regenerate with `python3 scripts/fixtures/docx/gen.py` (python-docx 1.2.0 +
fontTools; the source font is the system's DejaVu Sans Mono). Every zip entry
carries a fixed timestamp and the core properties are fixed, so a re-run is
byte-identical — commit the outputs, the CI runner has no python.

| File | Exercises |
|---|---|
| `apa-title-page.docx` | The owner's report, rebuilt: an APA title page (title / author / university / course / professor / date) in a section with a **different first page** header (page number only) and a default header (`RUNNING-HEAD …` + two tabs + a PAGE field — the right-aligned tab stop of Word's Header style) and a footer; a **new-page section break**; section 2 carries **no header/footer references** (Word's "Link to Previous" — it must still show the running head); Heading 1/2 (the template's blue), body paragraphs with a first-line indent, a run in an explicit colour (`COLOURED-RUN-MARKER`, #1F3864), a **footnote** (`FOOTNOTE-ONE`), a numbered and a bulleted list, a **bordered table** (Table Grid), an **embedded PNG** (160×100, drawn by hand), a manual page break (References), and a **landscape section** (11 × 8.5 in). Letter pages, 1 in margins. |
| `long-80-pages.docx` | 80 pages separated by manual page breaks (`PAGE-nn-PARA-k` markers), one header — the "Rendering…" line, the page count `1 / 80`, the render time. |
| `hostile.docx` | A paragraph whose text is `<img src=x onerror=alert(1)>` (and one that would set `window.__docxPwned`); hyperlinks to `javascript:alert(1)`, a `data:` URL, `https://example.com/paper` and an internal `#endmark` bookmark; an **altChunk** HTML part with a `<script>` and an `onerror` (the library renders it in a same-origin iframe); a paragraph **style** whose font name closes the CSS string and the rule (`outline: 7px solid rgb(255, 0, 255)` on `body`). |
| `embedded-font.docx` | A run in `VS Embedded Fixture` — a 12 KB subset of DejaVu Sans Mono (Bitstream Vera licence: redistribution allowed, its copyright and licence records are kept in the font) embedded **obfuscated** (ECMA-376 font key) in the package. |
