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
