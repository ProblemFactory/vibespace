// THE WIDTH LADDER (lane ui-phone-and-fit pick 0 — 主开发 2026-11-13, after the owner's «考虑不同窗口尺寸了吗？»): a fit fix is
// pinned at the NINE widths of its own container (a VibeSpace window in a tiled layout is rarely 1440 and rarely 390), never
// at the two sizes a walk used. ONE helper for every UI lane and the walk's next wave:
//   LADDER / PHONE_LADDER   the widths (the phone's: what a compact page can be)
//   fitVerdictSource(sel)   browser-side source → the container's verdict: every control's box inside the container (and
//                           inside its row, when `row` names one), no control's or text's words cut (an ellipsis, a hidden
//                           overflow, a line clamp — a clamp is allowed only where `clampOk` says), no sideways scroll on the
//                           container, its row, or any `scrollers` element
//   fits(v)                 the verdict reads clean
//   runLadder(...)          set each width, read the verdict, collect { w, v }
//   SIDEBAR_LADDER          the sidebar's own widths (200 floor · 260 default · 360) — the rail's panels are read there
//   columnFactsSource(sel)  a narrow COLUMN's facts (pick 1): a control on two lines that would fit on one, a cut control, text
//                           past the column's edge, a name squeezed one glyph a line, a Latin word broken where it fits; columnReads(f)
// Plain ES module, no dependency: a suite imports it and evaluates the source over its own CDP connection.

export const LADDER = Object.freeze([280, 320, 360, 420, 500, 640, 800, 1100, 1440]);
export const PHONE_LADDER = Object.freeze(LADDER.filter((w) => w <= 768));

/** `sel` / `row` = a CSS selector, or a JS expression in parentheses that yields the element. */
const elExpr = (s) => (s && s.trim().startsWith('(') ? s : `document.querySelector(${JSON.stringify(s)})`);

export function fitVerdictSource(sel, { row = null, controls = 'button, [role="button"], a, input, select', words = '', clampOk = '', scrollers = '' } = {}) {
  return `(() => {
  const box = ${elExpr(sel)}; if (!box || !box.getClientRects().length) return null;
  const row = ${row ? elExpr(row) : 'null'};
  const cs = (e) => getComputedStyle(e), vis = (e) => e.getClientRects().length > 0 && cs(e).visibility !== 'hidden' && cs(e).display !== 'none';
  const R = (e) => e.getBoundingClientRect(), say = (e) => (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 40);
  const outsideOf = (e, c) => { const a = R(e), b = R(c); return a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5; };
  const scope = row || box;
  const ctl = [...scope.querySelectorAll(${JSON.stringify(controls)})].filter(vis);
  const outside = ctl.filter((e) => outsideOf(e, box) || (row && outsideOf(e, row))).map(say);
  const textEls = [...ctl, ...(${JSON.stringify(words)} ? [...scope.querySelectorAll(${JSON.stringify(words || 'x-none')})].filter(vis) : [])];
  const clampOk = ${JSON.stringify(clampOk)};
  const clipped = [];
  for (const e of new Set(textEls)) {
    if (!e.textContent.trim()) continue;
    const c = cs(e), clamp = c.webkitLineClamp && c.webkitLineClamp !== 'none';
    const cutX = e.scrollWidth > e.clientWidth + 1 && (c.overflowX === 'hidden' || c.overflowX === 'clip' || c.textOverflow === 'ellipsis');
    const cutY = (clamp || c.overflowY === 'hidden' || c.overflowY === 'clip') && e.scrollHeight > e.clientHeight + 1;
    if ((cutX || cutY) && !(clampOk && e.matches(clampOk))) clipped.push(say(e));
  }
  const sw = (e) => e && e.scrollWidth > e.clientWidth + 1;
  const sideways = [box, row, ...(${JSON.stringify(scrollers)} ? [...document.querySelectorAll(${JSON.stringify(scrollers || 'x-none')})] : [])].filter(Boolean).filter(sw).map((e) => String(e.className || e.id || e.tagName).slice(0, 40));
  return { w: Math.round(R(box).width), rowW: row ? Math.round(R(row).width) : null, controls: ctl.length, outside, clipped, sideways };
})()`;
}

export const fits = (v) => !!v && !v.outside.length && !v.clipped.length && !v.sideways.length;

/** For each width: `setWidth(w)`, then `read(w)` → the verdict; returns [{ w, v }] (a missing verdict is a failure). */
export async function runLadder({ widths = LADDER, setWidth, read }) {
  const out = [];
  for (const w of widths) { await setWidth(w); out.push({ w, v: await read(w) }); }
  return out;
}
/** The widths that failed, in words («320: outside Reply… · 500: cut 保留 ag…»), for a check's message. */
export const ladderFaults = (rows) => rows.filter((r) => !fits(r.v)).map((r) => `${r.w}: ${r.v ? [...r.v.outside.map((x) => 'outside ' + x), ...r.v.clipped.map((x) => 'cut ' + x), ...r.v.sideways.map((x) => 'sideways ' + x)].slice(0, 3).join(' · ') : 'no container'}`);

/** The sidebar's own ladder (主开发 07:02Z: no new floor — the rail reads at its 200 px floor, its 260 default, and the sweep's 360). */
export const SIDEBAR_LADDER = Object.freeze([200, 260, 360]);

/** What a picture of a narrow column is READ by (browser-side source, `sel` = the column's element): a control (a button whose
 *  content is inline only — a card's head drawn as a button is a row, not a control) drawn on two lines or cut; text cut by
 *  the column's edge; a Latin word broken where it would have fit on its own line; a name squeezed into a column under 3 em
 *  (one CJK character a line); the column scrolling sideways. */
export const columnFactsSource = (sel) => `(() => {
  const p = document.querySelector(${JSON.stringify(sel)}); if (!p || !p.getClientRects().length) return null;
  const cs = (e) => getComputedStyle(e);
  const vis = (e) => e.getClientRects().length > 0 && cs(e).visibility !== 'hidden' && cs(e).display !== 'none';
  const pr = p.getBoundingClientRect(), em = parseFloat(cs(p).fontSize) || 13;
  const blocky = (e) => [...e.querySelectorAll('*')].some((d) => /^(block|flex|grid|list-item|table|inline-flex|inline-grid)$/.test(cs(d).display) && d.textContent.trim() && vis(d));
  const controls = [...p.querySelectorAll('button, [role="button"]')].filter((b) => vis(b) && b.textContent.trim() && !blocky(b));
  const rangeRects = (node) => { const r = document.createRange(); r.selectNodeContents(node); return [...r.getClientRects()].filter((q) => q.width > 0.5); };
  const textLines = (e) => { const tops = new Set(); const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.trim()) for (const q of rangeRects(n)) tops.add(Math.round(q.top + q.height / 2)); return tops.size; };
  // the width a control needs on ONE line, and the line it has (its parent's content box): a control alone wider than its line
  // may wrap inside itself (a full-width door in a 128 px column) — one that would fit never
  const oneLine = (b) => { const ws = b.style.whiteSpace; b.style.whiteSpace = 'nowrap'; const need = b.scrollWidth; b.style.whiteSpace = ws; return need; };
  const lineOf = (b) => { const q = b.parentElement, c = cs(q); return q.clientWidth - (parseFloat(c.paddingLeft) || 0) - (parseFloat(c.paddingRight) || 0); };
  const say = (e) => e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 32);
  const wrapped = controls.filter((b) => textLines(b) > 1 && oneLine(b) <= lineOf(b) + 0.5).map(say);
  const cut = controls.filter((b) => b.scrollWidth > b.clientWidth + 1 && cs(b).overflow !== 'visible').map(say);
  const clipped = [], squeezed = [], midWord = [];
  const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const s = n.textContent, el = n.parentElement; if (!s.trim() || !el || !vis(el)) continue;
    // text inside a CLOSED fold is not drawn — never judged (its summary is); a fold's words are measured OPEN (checkpoint 61)
    const fold = el.closest('details'); if (fold && !fold.open && !el.closest('summary')) continue;
    const rects = rangeRects(n); if (!rects.length) continue;
    // an ellipsis drawn INSIDE its own box (the box within the column) whose tip — its own, its parent's or grandparent's title or
    // aria-label — holds the whole words is a deliberate one-line preview, not a cut (a job's last line); without the tip it is
    const tipped = cs(el).textOverflow === 'ellipsis' && el.getBoundingClientRect().right <= pr.right + 1 && [el, el.parentElement, el.parentElement?.parentElement].some((x) => x && ((x.getAttribute('title') || '') + ' ' + (x.getAttribute('aria-label') || '')).includes(s.trim().slice(0, 40)));
    if (!tipped && Math.max(...rects.map((q) => q.right)) > pr.right + 1 && clipped.length < 8) clipped.push(s.trim().slice(0, 24));
    const tops = new Set(rects.map((q) => Math.round(q.top + q.height / 2)));
    const w = Math.max(...rects.map((q) => q.width));
    if (tops.size >= 3 && w < 3 * em && s.trim().length >= 3 && squeezed.length < 8) squeezed.push(s.trim().slice(0, 24));
    if (tops.size < 2) continue;
    // a Latin run split over two lines although it is narrower than the box that holds it (a path or a token wider than
    // the line must break; a word that fits on a line never)
    const box = el.getBoundingClientRect().width;
    const re = /[A-Za-z0-9]{2,}/g;
    for (let m; (m = re.exec(s));) {
      const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const rs = [...r.getClientRects()].filter((q) => q.width > 0.5);
      if (new Set(rs.map((q) => Math.round(q.top + q.height / 2))).size < 2) continue;
      const tok = s.slice(0, m.index + m[0].length).split(/\\s/).pop() + s.slice(m.index + m[0].length).split(/\\s/)[0];
      const width = rs.reduce((a, q) => a + q.width, 0);
      if (width < box - 1 && !/[\\/]/.test(tok) && midWord.length < 8) midWord.push(m[0].slice(0, 24));
    }
  }
  return { w: Math.round(pr.width), sideways: p.scrollWidth > p.clientWidth + 1, controls: controls.length, wrapped, cut, clipped, squeezed, midWord };
})()`;
/** A column READS when nothing in its facts is a fault. */
export const columnReads = (f) => !!f && !f.sideways && !f.wrapped.length && !f.cut.length && !f.clipped.length && !f.squeezed.length && !f.midWord.length;

/** B-db5d (the coordinator's law, 2026-11-19 04:47Z): AT NO WIDTH OF THE LADDER DOES A NAME STAND ON MORE LINES THAN IT DID AT THE
 *  CHECKPOINT — the controls go under the name before the name is squeezed. PURE over two measured walks ([{ lang, label, nameLines }],
 *  label = the host and the width): → the widths where `after` draws the name on more lines than `before` (and the widths `after` never
 *  measured — a ladder width left out is no pass). */
export function linesGrew(before = [], after = []) {
  const key = (r) => `${r.lang} ${r.label}`;
  const was = new Map(before.filter((r) => r && Number.isFinite(r.nameLines)).map((r) => [key(r), r.nameLines]));
  const now = new Map(after.filter((r) => r && Number.isFinite(r.nameLines)).map((r) => [key(r), r.nameLines]));
  const out = [];
  for (const [k, b] of was) { const a = now.get(k); if (a == null) out.push({ at: k, before: b, after: null }); else if (a > b) out.push({ at: k, before: b, after: a }); }
  return out;
}
