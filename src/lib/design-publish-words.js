// The design's Publish dialog's WORDS (lane card-door-in-chat, 主开发 r3170 (4)): its state line on the designs' reply and its refusal
// toast — one function each, so a leg EXECUTES their held branches (scripts/test-content-store-reads.mjs PP6), never only pins them.
// No import: the dialog (src/lib/design-window.js) hands `t` (src/lib/i18n.js) and `heldWordsOf` (src/lib/utils.js).

/** The state line on GET /api/designs' answer `r` for this design's `row` → { known, page, text } */
export function publishStateWords(r, row, t) {
  const rows = r && Array.isArray(r.designs) ? r.designs : null;
  const page = (row && row.page) || null;
  // r3139 MUST 3: the pages list is HELD — never «Not published yet» on an unread list
  if (r && r.pagesUnread) return { known: false, page: null, text: t('VibeSpace cannot read its list of published pages right now, so it is not known whether this design was published. Nothing is lost: every link given out stays, though it answers «cannot be shown right now» until the list reads; a publish pressed now is not taken — press it again then (it tries again every few minutes).') };
  if (page) return { known: true, page, text: page.public ? t('Published before as a public page — publishing again keeps its link and leaves it public unless you untick the box') : t('Published before as a private page — publishing again keeps its link and leaves it private unless you tick the box') };
  return { known: !!rows, page: null, text: rows ? t('Not published yet. Publishing makes a new link; only people signed in to VibeSpace can see it unless you tick the box.') : t('Could not check whether this design was published before — the box decides') };
}

/** The refusal toast of a press that published nothing: a held refusal in the page's words, never the hub's English */
export function publishFailWords(r, t, heldWordsOf) {
  return t('Publish failed: {err}', { err: heldWordsOf(r) || (r && (r.why || r.error)) || t('server unreachable') });
}
