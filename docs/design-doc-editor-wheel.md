# The Doc window's editor core — the decision record (lane doc-editor-wheel, 2.369.221)

Owner 2026-10-05: "找找现成的轮子 — markdown 的 WYSIWYG 编辑器" (after the chip opened a table raw). Candidates spiked: Tiptap v3, Milkdown kit (+ preset-gfm), Milkdown Crepe; rejected unspiked: Toast UI Editor (last release 2023-02), Lexical (React-centric, partial table transformer), ink-mde (no table rendering), Vditor (23 MB, reformats). The law: a save never silently rewrites lines the person did not edit — no WYSIWYG core passes it alone (each re-serializes the whole document), BLOCK PATCHING does (src/doc-model.js `patchBlocks`, src/lib/doc-markdown.js `saveDoc`). Harness: scripts/test-doc-wheel.mjs over scripts/fixtures/doc-wheel/ (30 documents).


| | today (PM + prosemirror-markdown) | **Tiptap v3** 3.31.4 | Milkdown kit 7.22.2 (+gfm) | Milkdown Crepe 7.22.2 |
|---|---|---|---|---|
| (a) lazy entry min / gz | 389 / 128 KB (full entry) · core 380 / 125 | core 493 / **155** KB (marked inside; no markdown-it needed) | core 453 / **139** KB (remark inside) | 2 708 / 897 KB + CSS 1 478 KB — out |
| (b) round trip byte-identical | 17/30 (tables NOT rendered: kept as text) | 8/30 | 1/30 | = kit |
| (b) DROPS content | ref-link labels (inlined) | raw HTML (details/summary/kbd/br) · ref-link labels | **images without a title** (prosemirror-model attr check throws) · ref-link labels | = kit |
| (b) CHANGES structure | escaped-pipe table, front matter→##, ~~, fence in list | `*`/`+` lists merge into `-`, escaped-pipe table, front matter, fence in list re-indented, bare URL linkified | escaped-pipe table, footnote defs | = kit |
| (b) reformats | 8 | 15 (table cell padding, extra blank lines, `1)`→`1.`, `_em_`→`*em*`, `[x]`→`\[x\]`) | 25 (every `-` bullet → `*`, table padding, `---`→`-`) | = kit |
| (c) edit 1 cell / 1 item, untouched lines byte-identical — block patching | 29/30 (CRLF refused) | **29/30** (CRLF refused) | **29/30** (CRLF refused) | = kit |
| (c) same, whole-document re-serialize (no patching) | 0/30 | 1/30 | 16/30 | — |
| (c′) only the edited line changed (block patching) | 26/30 | 20/30 (tables pad every row) | 16/30 (a list edit rewrites every bullet) | — |
| (d) IME in Chrome: 你好 composed into a table cell + a paragraph, Enter(229) mid-composition | n/a (no tables) | lands once ✓ · not split ✓ · in place ✓ (both) | lands once ✓ · not split ✓ · in place ✓ (both) | = kit |
| (e) fit for our shell | — | vanilla `new Editor({element})`; `editor.markdown.parse/serialize`; table commands (insertTable, add/deleteRow/Column, Tab nav); PM view/state exposed ⇒ our selection→block→source-line map, our Save, our conflict bar | ctx/slice API, async create, commands via callCommand; same PM ground; heavier plugin system | own toolbar / slash menu / block handles (a second look) |
| (f) maintenance | — | 205 releases since 2020, 19 in 90 d, latest 2026-09-30; @tiptap/markdown is young (2025-10), 22 open issues titled "markdown" | 53 releases, 4 in 90 d, latest 2026-09-23 | same |
| (f) licences (transitive) | — | 46 packages, all MIT | 153: 149 MIT, ISC, BSD-2, BSD-3, DOMPurify (MPL-2.0 OR Apache-2.0) | 206, same mix |

**Pick: Tiptap v3.** (c) ties at 29/30 and (d) ties, so by the order size would favour Milkdown kit (−16 KB gz) — but Milkdown DROPS every image without a title (content loss on the first save of a paragraph holding one) and rewrites every bullet of an edited list (16/30 vs 20/30 only-edited-line), on a 153-package closure with a slower cadence. A content drop outranks 16 KB. Tiptap's own drops: raw HTML (stays a raw reason) and ref-link labels (an edited block inlines its links — target kept).
Adoption fixes on Tiptap measured above: the table serializer without padding, bare brackets, list markers / `1)` / `_em_` kept as written ⇒ (c′) up.

## After the adoption (scripts/test-doc-wheel.mjs, the adopted core)
Unedited save byte-identical 29/29 · one cell / item edited, untouched lines byte-identical 29/29 (+ the CRLF one refused by name) · only the edited line changed 28/29 (a loose list's blank line between items) · DROPPED: none (raw HTML + front matter ride as raw blocks) · raw reasons left: crlf, too_big.

## § UI (design 020) — as built (lane doc-editor-ui, 2.369.223)

The window's face over this core: the design desk's spec /var/tmp/vibespace-lanes/design-desk/q-020/doc-editor-ui.md (§0 the impact table, §1 the audit, §2 the direction in theme tokens; artboards q-020/design/doc-editor-ui/). Built: T4 the task-item fix (the node view's missing `data-type`, a doc-markdown option — the serializer untouched, test-doc-wheel byte-identical), T1 the 76ch column + rhythm, T2 the one folding bar (bar-fold), T3 the one status strip, T5 the table chrome + hover grips onto the existing menu, T6 the code language chip, T7 quote / image caption / raw head / links, T8 the phone. Not built (the spec's 不做): a selection bubble toolbar, an outline pane, syntax colouring. Where it lives: docs/kb-file-structure.md § src/lib/doc-window-ui.js (Design 020); gates scripts/test-doc-window.mjs §9 and scripts/test-toolbar-fold.mjs §6.
