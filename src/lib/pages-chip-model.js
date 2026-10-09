// THE PAGES CHIP'S MODEL (lane pages-chip-groups, owner 2026-10-08 "可以，不过要分组"; B-aa28). PURE — imports nothing,
// `t` injected. The chat status bar's Pages chip (the design chip: designs + pages) lists pages in TWO groups, never mixed:
//   · own   — "Published by this conversation": the pages store's rows for this session / conversation (GET /api/pages +
//             the page-published broadcast); a design's page stays on ITS design row (accept-fixes F2), never here
//   · shown — "Shown here": a page ANOTHER conversation published whose /p/<id> link appears in this conversation — the
//             artifact registry's presented page rows (GET /api/artifacts items, `presented: true`, resolved server-side:
//             name, public, the publisher's live name, `gone` once unpublished). Task Group pages are never listed.
// `chipCount` = designs + own + shown (the chip's number); the tooltip spells the split.

/** The published page of one design: its srcKey `<host|local>:<dir>`, or the id GET /api/designs named. */
export function pageOfDesign(d, pages) {
  if (!d) return null;
  const key = `${d.host || 'local'}:${d.dir}`, id = d.page && d.page.id;
  return (pages || []).find((p) => p && (p.srcKey === key || (id && p.id === id))) || null;
}

/** {groups: [{key, label, rows}] (own, shown — both always, maybe empty), ownCount, shownCount, chipCount, tip}.
 *  A row: {key, group, id, name, sig, page (own) | url, publisher, gone, words (shown)}. */
export function pagesChipGroups({ own = [], presented = [], designs = [], t = (s, v) => fill(s, v) } = {}) {
  const ds = Array.isArray(designs) ? designs : [];
  const mine = (Array.isArray(own) ? own : []).filter((p) => p && p.id);
  const onDesign = new Set(ds.map((d) => pageOfDesign(d, mine)).filter(Boolean).map((p) => p.id));
  const ownIds = new Set(mine.map((p) => p.id));
  const ownRows = mine.filter((p) => !onDesign.has(p.id)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((p) => ({ key: 'own:' + p.id, group: 'own', id: p.id, name: String(p.name || p.id), page: p, sig: JSON.stringify([p.name, !!p.public, p.url || p.path, p.updatedAt || 0]) }));
  const seen = new Set();
  const shownRows = (Array.isArray(presented) ? presented : [])
    .filter((b) => b && b.presented && b.page && !ownIds.has(b.page) && !seen.has(b.page) && seen.add(b.page))
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
    .map((b) => {
      const gone = !!b.gone, publisher = String(b.publisher || '');
      const words = gone ? t('no longer published') : (publisher ? t('from {name}', { name: publisher }) : t('from another conversation'));
      return { key: 'shown:' + b.page, group: 'shown', id: b.page, name: String(b.name || b.page), url: String(b.url || '/p/' + b.page), publisher, gone, words, sig: JSON.stringify([b.name, publisher, gone, b.url, !!b.public]) };
    });
  const a = ds.length + ownRows.length, n = shownRows.length;
  const tip = n
    ? t('{a} from this conversation · {b} shown here — click to open one or request a design', { a, b: n })
    : (a ? t('{n} design(s) and page(s) from this session — click to open one or request a design', { n: a }) : t('Request a design canvas — drafted by the agent, hosted by this VibeSpace, shareable by link'));
  return {
    groups: [{ key: 'own', label: t('Published by this conversation'), rows: ownRows }, { key: 'shown', label: t('Shown here'), rows: shownRows }],
    ownCount: ownRows.length, shownCount: n, chipCount: a + n, tip,
  };
}
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] !== undefined ? String(v[k]) : m));
