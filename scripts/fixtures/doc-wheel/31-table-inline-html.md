## 4.2 Retry ledger and handoff to export

| Mechanism | Rule |
| --- | --- |
| Lineage chain | A retry opens a new ledger entry with `replaces = prior id`; the prior one turns `retired`. Compare as a **bag** (`collections.Counter`) keyed by `row_key = ledger_key + "#" + (_norm_label(title) or _amount_hint(raw_value) or "")` — two `flat_rate` lines or two unpriced asset rows sharing one `ledger_key` stay separate rows and "2 of 3 settled" counts them with repeats; `ledger_key` alone would merge them. **Not** by `ack_ref`: `ack_ref` digests the finding text (rules_engine.py:91; `_finding_line` export_fill.py:412), which embeds clause numbers, figures and the <code>STEP-nn</code> label that shifts when an earlier topic settles (`TOPIC_SEQUENCE`, catalog.py:1302-1309). `ack_ref` stays as it is. |
| Catalog digest | Each ledger entry stores the digest of the built catalog + lookup tables + the house inventory. A newer release tags older entries "the engine moved since this review; upload the draft again to re-check" (no bytes kept, decision K4). |
| Handoff at export | A signed PDF never shares bytes with the uploaded DOCX / PDF draft, and early entries carry `client_ref ""`, so a digest match almost never fires. Matching needs the signed text, which only the archive scan holds, and that scan is write-free — (1) the **hint is computed inside `plan_archive_export`** when the caller holds <code>ledger.review.read</code>: candidates are `settled` entries of the same `client_ref`, newest first, capped (setting `ledger_hint_cap`, default 20); `text_overlap(entry_text, signed_text)` (export_fidelity.py:288) ≥ 0.85 takes the newest match, digest equality is the shortcut; the hint rides on `ArchiveExportPlan.ledger_hint: LedgerHintEntity \| None` (models.py:7710); (2) the **link rides on the create POST**. Keys: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> re-runs; O(n<sup>2</sup>) worst case.<br>See also §4.3. |

Notes: the <b>retired</b> entries stay readable; H<sub>2</sub>-style indices and <i>italic</i> / <em>em</em> words keep their tags.

- the sweep reads <code>ledger_key</code> first
- then <strong>row_key</strong>

| Mechanism | Rule |
| --- | --- |
| Step labels | A finding names its step STEP-<code>-nn until export pins the number; a renumbered step would read as settled + new & stays one row. |
