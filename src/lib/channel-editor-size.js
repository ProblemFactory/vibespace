// A MESSAGE EDITOR OPENS AT THE SIZE OF ITS TEXT (lane channel-edit-autosize,
// a fleet user 2026-10-12, inc-mv4toyhw-t7ym: "在 channel 里面编辑一个消息的时候，
// 那个窗口一开始会非常的矮" — an agent's 10–40-line draft opened for editing in a
// default 2–3-row textarea, and he dragged the window bigger before he could
// review it).
//
// ONE rule for every message editor in the channels UI — the proposal card's
// Edit box (inline in a conversation window AND in the Outbox), the window's
// composer (a held draft / a quote fills it), the agent-group composer, the
// thread pane's reply box:
//
//  - `editorHeight` (PURE, DOM-free): the box's content height = its text's
//    height, clamped between `minRows` rows and `maxFrac` of the pane (then it
//    scrolls inside). A pane too small for the min still gets the min.
//  - `autosizeEditor` (the ONE DOM binding — no per-editor copies): measures
//    `scrollHeight` after a one-row reset (wrapped lines count, not only
//    newlines), on open and on every input, coalesced to one rAF; the scroll
//    offsets of the boxes around it and its own are put back, so the page
//    never jumps and the caret stays put. The person's drag on a resize
//    handle WINS until the editor is opened again.
//
// Imports nothing.

/** The editor's content-box height in px for its text, and whether it scrolls inside. */
export function editorHeight({ contentPx = 0, rowPx = 18, minRows = 4, panePx = 0, maxFrac = 0.6 } = {}) {
  const row = rowPx > 0 ? rowPx : 18;
  const minPx = Math.ceil(Math.max(1, minRows) * row);
  // no pane measured yet (not laid out) ⇒ a generous 20 rows, never unbounded
  const maxPx = Math.max(minPx, panePx > 0 ? Math.floor(panePx * maxFrac) : Math.ceil(20 * row));
  const want = Math.ceil(Math.max(0, contentPx));
  const px = Math.min(maxPx, Math.max(minPx, want));
  return { px, scroll: want > px };
}

const num = (v) => parseFloat(v) || 0;

/** Size `ta` to its text now and on every input; `pane` = the box whose height bounds it (default: its channel window). */
export function autosizeEditor(ta, { minRows = 4, maxFrac = 0.6, pane = null } = {}) {
  if (!ta || ta._autosize) return ta && ta._autosize;
  // no layout to measure (a DOM-less harness) ⇒ a no-op handle, so the callers' fit() stays one spelling
  if (typeof requestAnimationFrame !== 'function' || typeof getComputedStyle !== 'function' || !ta.addEventListener) return (ta._autosize = { fit() {}, now() {}, dragged: () => false });
  let frame = 0, setPx = 0, dragged = false, downPx = 0;
  const fit = () => {
    frame = 0;
    if (dragged || !ta.isConnected) return;
    const cs = getComputedStyle(ta);
    const rowPx = num(cs.lineHeight) || num(cs.fontSize) * 1.4 || 18;
    const padY = num(cs.paddingTop) + num(cs.paddingBottom);
    const edgeY = cs.boxSizing === 'border-box' ? padY + num(cs.borderTopWidth) + num(cs.borderBottomWidth) : 0;
    const host = pane || ta.closest('.chanwin') || document.documentElement;
    // the one-row reset may clamp a scroller's offset — keep every offset above it (and its own) to put back
    const kept = [];
    for (let n = ta; n && n !== document.body; n = n.parentElement) if (n.scrollTop) kept.push([n, n.scrollTop]);
    // int257 seam 4: …and the window's message lists BESIDE it — the composer's reset grows the list under it, which clamps a list
    // at its bottom (10 px off the bottom per keystroke; test-channel-threads-ui (b): the open then snapped it back)
    for (const n of host.querySelectorAll('.chanwin-list, .chanthread-list')) if (n.scrollTop && !kept.some((k) => k[0] === n)) kept.push([n, n.scrollTop]);
    ta.style.height = Math.ceil(rowPx + edgeY) + 'px';
    const v = editorHeight({ contentPx: ta.scrollHeight - padY, rowPx, minRows, panePx: host.clientHeight, maxFrac });
    setPx = v.px + edgeY;
    ta.style.height = setPx + 'px';
    ta.style.overflowY = v.scroll ? 'auto' : 'hidden';
    for (const [n, top] of kept) n.scrollTop = top;
  };
  const schedule = () => { if (!frame && !dragged) frame = requestAnimationFrame(fit); };
  // the person's drag on the resize handle wins (the height left after a press is not the one this set)
  ta.addEventListener('pointerdown', () => { downPx = ta.offsetHeight; });
  ta.addEventListener('pointerup', () => { if (downPx && Math.abs(ta.offsetHeight - downPx) > 1 && Math.abs(ta.offsetHeight - setPx) > 1) dragged = true; downPx = 0; });
  ta.addEventListener('input', schedule);
  ta._autosize = { fit: schedule, now: fit, dragged: () => dragged };
  schedule();
  return ta._autosize;
}
