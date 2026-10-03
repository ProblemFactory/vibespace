// THE TWEAKS PANEL (lane design-tweaks, 2026-10-03; design 003 §2 S4 — /var/tmp/vibespace-lanes/design-desk/
// claude-design-replica.md) — a design's free knobs in the Design window. The agent declares them in design.json
// (`tweaks`: a colour, a range, a choice, a switch — each ONE CSS custom property or ONE root data attribute its CSS
// reads); this panel draws OUR controls for them.
//
//   · MOVING A KNOB restyles every frame at once: `design-tweak {var|attr, value}` through the canvas's outgoing fence
//     (design-canvas-model.js frameSay) — the picker in each frame sets the property / attribute. No agent, no tokens.
//   · A moment later the hub writes the value into the design's `user.json` (THE USER'S LAYER — POST /api/design/tweaks;
//     the read, the preview and publish bake it in: design-model.js applyUser), so a reload, the published page and the
//     agent see it. The write says `file-changed`; a frame whose document differs only in that layer restyles in place
//     (design-canvas.js + design-model.js tweakSwap) — on this device and every other one.
//   · Reset = every knob back to the agent's default (user.json emptied). A design that declares none: the panel says so
//     and offers "+ Tweaks" — the owner's request as ONE `[Design tweaks]` message (POST /api/design/tweaks/request).
//   · Live: `file-changed` for design.json / user.json under the folder re-reads the panel (another device moved a knob,
//     the agent declared new ones); a knob being moved keeps its value until its write lands.
//   · The agent's words (labels, options) are drawn as text; theme vars, zh/ja, keyed rows; a side panel on the canvas,
//     a bottom sheet on the phone (44 px targets). Mounted by design-window.js: one line + the bar's "Tweaks" button.
import { fetchJson } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { onFileChanged, foldPath } from './file-changed.js';
import { tweakText, tweakSwap, tweakValueOk, TWEAK_LIMITS } from '../design-user-layer.js';

const WRITE_MS = 300;      // the write follows the last move by this much (a drag writes once it rests)
const RELOAD_MS = 250;     // file-changed bursts coalesce
const PILLS_MAX = 4;       // a choice of at most this many short options draws as pills; more = a select
const PILL_CHARS = 16;
const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const hostKey = (x) => (x && x !== 'local' ? String(x) : '');

/** PURE: the panel's read (GET /api/design/tweaks) → {tweaks, values, set, refused, note} or null (no answer). Every
 *  value re-judged against its knob — one that does not fit shows the knob's default. */
export function readTweaks(r) {
  if (!isObj(r) || r.ok === false || r.error) return null;
  const tweaks = (Array.isArray(r.tweaks) ? r.tweaks : []).filter((x) => isObj(x) && typeof x.id === 'string' && typeof x.kind === 'string').slice(0, TWEAK_LIMITS.tweakCount);
  const values = {}, set = {};
  for (const x of tweaks) {
    const v = isObj(r.values) ? r.values[x.id] : undefined;
    values[x.id] = tweakValueOk(x, v) ? v : x.default;
    if (isObj(r.set) && Object.prototype.hasOwnProperty.call(r.set, x.id) && tweakValueOk(x, r.set[x.id])) set[x.id] = r.set[x.id];
  }
  const ref = Array.isArray(r.refusals) && r.refusals[0];
  const warn = Array.isArray(r.warnings) && r.warnings[0];
  return { tweaks, values, set, refused: ref ? String(ref.why || ref.code || '') : '', note: warn ? String(warn.why || warn.code || '') : '' };
}
/** PURE: the frame message for one knob at one value (the canvas fences it again — frameSay → design-model.js tweakSay). */
export function tweakMessage(x, v) {
  const value = tweakText(x, v);
  return x.var ? { kind: 'design-tweak', var: x.var, value } : { kind: 'design-tweak', attr: x.attr, value };
}
/** PURE: what a knob's readout says (`12px`, `0.5`, `#e11d48`). */
export function valueWords(x, v) {
  if (x.kind === 'range') return tweakText({ ...x, var: '--x' }, v);
  if (x.kind === 'toggle') return v ? t('On') : t('Off');
  return String(v);
}
/** PURE: the knobs' shape (a re-read redraws the rows only when it changed — a moved value updates in place). */
export function shapeOf(tweaks) {
  return (Array.isArray(tweaks) ? tweaks : []).map((x) => [x.id, x.kind, x.var || x.attr, x.label, x.min, x.max, x.step, x.unit, (x.options || []).join('\u0001')].join('\u0002')).join('\u0003');
}
export function tweaksRefusalText(r) {
  if (!r) return t('Could not save the tweak — the server did not answer');
  return t('The tweak was not saved: {why}', { why: String(r.error || r.code || 'refused').slice(0, 300) });
}
export function requestSentText(r) {
  const how = String((r && r.delivered) || '');
  if (how === 'stashed') return t('The conversation is not running — your request waits above its composer');
  if (/queue/i.test(how)) return t('Request queued — the agent reads it after its current turn');
  return t('Asked the agent to add Tweaks');
}

export function mountDesignTweaks({ winInfo, canvas, stage, button = null, signal, phone = false, host = '', dir = '', sayChip = () => { } } = {}) {
  const L = { signal };
  const h = hostKey(host), d = String(dir || '');
  const q = () => { const p = new URLSearchParams(); if (h) p.set('host', h); p.set('dir', d); return p.toString(); };
  let state = { tweaks: [], values: {}, set: {}, refused: '', note: '' };
  let loaded = false, shown = false, shape = null, failed = '';
  const pending = {};          // id → the value waiting to be written
  const moving = new Set();    // ids moved here whose write has not landed — a re-read keeps their value
  let writeTimer = 0, writing = null;

  canvas.setSwap?.(tweakSwap);   // a frame whose document differs only in the user's layer restyles in place
  const panel = mk('section', 'design-tweaks' + (phone ? ' design-tweaks-phone' : ''));
  panel.setAttribute('aria-label', t('Tweaks'));
  panel.style.display = 'none';
  const head = mk('div', 'design-tweaks-head');
  const title = mk('span', 'design-tweaks-title'); title.textContent = t('Tweaks');
  const resetBtn = mk('button', 'design-tweaks-reset'); resetBtn.type = 'button'; resetBtn.textContent = t('Reset'); resetBtn.title = t('Every knob back to the agent\'s default');
  const closeBtn = mk('button', 'design-tweaks-x'); closeBtn.type = 'button'; closeBtn.innerHTML = UI_ICONS.close; closeBtn.title = t('Close'); closeBtn.setAttribute('aria-label', t('Close'));
  head.append(title, resetBtn, closeBtn);
  const body = mk('div', 'design-tweaks-body');
  const foot = mk('div', 'design-tweaks-foot');
  panel.append(head, body, foot);
  stage.appendChild(panel);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); hide(); button?.focus(); } }, L);
  closeBtn.addEventListener('click', () => hide(), L);
  resetBtn.addEventListener('click', () => reset(), L);
  button?.addEventListener('click', () => toggle(), L);

  // ── the frames: one message per knob to every artboard (a refused one has no frame — tell says so, nothing breaks) ──
  const tellFrames = (x, v) => { const m = tweakMessage(x, v); for (const f of canvas.frames()) canvas.tell(f.file, m); };

  // ── drawing ──
  const rows = new Map();   // id → {row, set(value)}
  function drawRows() {
    rows.clear();
    body.replaceChildren();
    foot.textContent = '';
    resetBtn.style.display = 'none';
    if (failed && !loaded) { const p = mk('div', 'design-tweaks-note'); p.textContent = failed; body.appendChild(p); return; }
    if (!loaded) { const p = mk('div', 'design-tweaks-note'); p.textContent = t('Loading…'); body.appendChild(p); return; }
    if (state.refused) { const p = mk('div', 'design-tweaks-note design-tweaks-refused'); p.textContent = t('Tweaks are off while design.json is refused: {why}', { why: state.refused }); body.appendChild(p); return; }
    if (!state.tweaks.length) { drawEmpty(); return; }
    resetBtn.style.display = '';
    const list = mk('div', 'design-tweaks-list');
    for (const x of state.tweaks) { const r = drawRow(x); rows.set(x.id, r); list.appendChild(r.row); }
    body.appendChild(list);
    if (state.note) { const p = mk('div', 'design-tweaks-note'); p.textContent = state.note; body.appendChild(p); }
    foot.textContent = t('Changes show at once — nothing is sent to the agent.');
    drawResetState();
  }
  const drawResetState = () => { const any = Object.keys(state.set).length > 0 || Object.keys(pending).length > 0; resetBtn.classList.toggle('design-tweaks-reset-idle', !any); };
  function drawRow(x) {
    const row = mk('div', 'design-tweak design-tweak-' + x.kind);
    row.dataset.tweak = x.id;
    const label = mk('label', 'design-tweak-label');
    label.textContent = x.label || x.id;                                   // the agent's words — text, never markup
    const ctl = mk('div', 'design-tweak-ctl');
    const readout = mk('span', 'design-tweak-value');
    const cid = `dtw-${winInfo?.id || 'w'}-${x.id}`;
    let set = () => { };
    if (x.kind === 'color') {
      const inp = mk('input'); inp.type = 'color'; inp.id = cid;
      inp.addEventListener('input', () => move(x, inp.value.toLowerCase(), false), L);
      inp.addEventListener('change', () => move(x, inp.value.toLowerCase(), true), L);
      ctl.append(inp, readout);
      set = (v) => { inp.value = v; readout.textContent = valueWords(x, v); };
    } else if (x.kind === 'range') {
      const inp = mk('input'); inp.type = 'range'; inp.id = cid;
      inp.min = String(x.min); inp.max = String(x.max); inp.step = String(x.step || 1);
      const num = () => Math.min(x.max, Math.max(x.min, Number(inp.value)));
      inp.addEventListener('input', () => move(x, num(), false), L);
      inp.addEventListener('change', () => move(x, num(), true), L);
      ctl.append(inp, readout);
      set = (v) => { inp.value = String(v); readout.textContent = valueWords(x, v); };
    } else if (x.kind === 'select' && x.options.length <= PILLS_MAX && x.options.every((o) => o.length <= PILL_CHARS)) {
      const group = mk('div', 'design-tweak-pills');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', x.label || x.id);
      const pills = x.options.map((o) => {
        const b = mk('button', 'design-tweak-pill'); b.type = 'button'; b.textContent = o; b.setAttribute('role', 'radio');
        b.addEventListener('click', () => move(x, o, true), L);
        group.appendChild(b);
        return b;
      });
      ctl.append(group);
      set = (v) => { pills.forEach((b, i) => b.setAttribute('aria-checked', x.options[i] === v ? 'true' : 'false')); };
    } else if (x.kind === 'select') {
      const sel = mk('select', 'design-tweak-select'); sel.id = cid;
      for (const o of x.options) { const op = mk('option'); op.value = o; op.textContent = o; sel.appendChild(op); }
      sel.addEventListener('change', () => move(x, sel.value, true), L);
      ctl.append(sel);
      set = (v) => { sel.value = v; };
    } else {
      const sw = mk('input', 'design-tweak-switch'); sw.type = 'checkbox'; sw.id = cid; sw.setAttribute('role', 'switch');
      sw.addEventListener('change', () => move(x, sw.checked, true), L);
      ctl.append(sw, readout);
      set = (v) => { sw.checked = !!v; sw.setAttribute('aria-checked', v ? 'true' : 'false'); readout.textContent = valueWords(x, v); };
    }
    if (x.kind !== 'select' || ctl.querySelector('select')) label.htmlFor = cid;
    row.append(label, ctl);
    set(state.values[x.id]);
    return { row, set };
  }
  function drawEmpty() {
    const box = mk('div', 'design-tweaks-empty');
    const p1 = mk('div', 'design-tweaks-empty-head'); p1.textContent = t('This design has no tweaks yet.');
    const p2 = mk('div', 'design-tweaks-empty-sub'); p2.textContent = t('Ask the agent for knobs — an accent colour, corner radius, density, type, dark / light — then try them here without another turn.');
    const inp = mk('input', 'design-tweaks-ask'); inp.type = 'text'; inp.maxLength = TWEAK_LIMITS.requestChars;
    inp.placeholder = t('What would you like to adjust? (optional)'); inp.setAttribute('aria-label', t('What would you like to adjust? (optional)'));
    const go = mk('button', 'btn-create design-tweaks-request'); go.type = 'button'; go.textContent = t('+ Tweaks');
    const send = () => request(inp.value, go);
    go.addEventListener('click', send, L);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); } }, L);
    box.append(p1, p2, inp, go);
    body.appendChild(box);
  }

  // ── moving, writing, resetting ──
  function move(x, v, now) {
    if (!tweakValueOk(x, v)) return;
    state.values[x.id] = v;
    rows.get(x.id)?.set(v);
    tellFrames(x, v);
    pending[x.id] = v;
    moving.add(x.id);
    drawResetState();
    clearTimeout(writeTimer);
    if (now) flush(); else writeTimer = setTimeout(flush, WRITE_MS);
  }
  async function flush() {
    clearTimeout(writeTimer); writeTimer = 0;
    if (writing) return writing;   // the running write's finally sends what waits
    const values = { ...pending };
    if (!Object.keys(values).length) return null;
    for (const k of Object.keys(values)) delete pending[k];
    writing = (async () => {
      const r = await fetchJson('/api/design/tweaks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: h || null, dir: d, values }) });
      if (signal.aborted) return;
      for (const k of Object.keys(values)) if (!Object.prototype.hasOwnProperty.call(pending, k)) moving.delete(k);
      if (!r || !r.ok || r.error) { sayChip(tweaksRefusalText(r)); load(); return; }
      if (isObj(r.set)) state.set = r.set;
      drawResetState();
    })().finally(() => { writing = null; if (Object.keys(pending).length && !signal.aborted) flush(); });
    return writing;
  }
  async function reset() {
    clearTimeout(writeTimer); writeTimer = 0;
    for (const k of Object.keys(pending)) delete pending[k];
    for (const x of state.tweaks) { state.values[x.id] = x.default; rows.get(x.id)?.set(x.default); tellFrames(x, x.default); moving.add(x.id); }
    if (writing) await writing;
    const r = await fetchJson('/api/design/tweaks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: h || null, dir: d, reset: true }) });
    if (signal.aborted) return;
    moving.clear();
    if (!r || !r.ok || r.error) { sayChip(tweaksRefusalText(r)); load(); return; }
    state.set = {};
    drawResetState();
  }
  async function request(text, go) {
    const sid = winInfo?._design?.sessionId || '';
    if (!sid) { sayChip(t('This design is not linked to a conversation — open it from the conversation\'s design chip to ask for tweaks')); return; }
    if (go.dataset.busy) return;
    go.dataset.busy = '1';
    const r = await fetchJson('/api/design/tweaks/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, host: h || null, dir: d, text: String(text || '') }) });
    delete go.dataset.busy;
    if (signal.aborted) return;
    if (!r || !r.ok || r.error) { sayChip(r ? t('The request was not sent: {why}', { why: String(r.error || r.code || 'refused').slice(0, 300) }) : t('Could not ask — the server did not answer')); return; }
    sayChip(requestSentText(r));
  }

  // ── the read ──
  let loading = null, again = false;
  function load() {
    if (loading) { again = true; return loading; }
    loading = (async () => {
      do {
        again = false;
        const raw = await fetchJson('/api/design/tweaks?' + q());
        if (signal.aborted) return;
        const r = readTweaks(raw);
        if (!r) { failed = raw && raw.error ? t('Could not read the tweaks: {why}', { why: String(raw.error).slice(0, 300) }) : t('Could not read the tweaks — the server did not answer'); if (!loaded) drawRows(); continue; }
        // a knob moved here keeps its value until its write lands; every other one takes the folder's
        for (const id of moving) if (Object.prototype.hasOwnProperty.call(state.values, id) && r.tweaks.some((x) => x.id === id && tweakValueOk(x, state.values[id]))) r.values[id] = state.values[id];
        const sh = shapeOf(r.tweaks) + '\u0004' + r.refused + '\u0004' + r.note;
        state = r; loaded = true; failed = '';
        if (sh !== shape) { shape = sh; drawRows(); }
        else { for (const x of state.tweaks) rows.get(x.id)?.set(state.values[x.id]); drawResetState(); }
        drawButton();
      } while (again && !signal.aborted);
    })().finally(() => { loading = null; });
    return loading;
  }
  const drawButton = () => {
    if (!button) return;
    button.classList.toggle('active', shown);
    button.setAttribute('aria-pressed', shown ? 'true' : 'false');
    button.setAttribute('aria-expanded', shown ? 'true' : 'false');
  };
  function show() { shown = true; panel.style.display = ''; drawButton(); if (!loaded) drawRows(); load(); }
  function hide() { shown = false; panel.style.display = 'none'; drawButton(); flush(); }
  function toggle() { if (shown) hide(); else show(); }
  if (button) { button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-expanded', 'false'); }

  // live: the folder's design.json / user.json changed (the agent declared knobs; another device moved one)
  const watched = new Set([foldPath(d.replace(/\/+$/, '') + '/design.json'), foldPath(d.replace(/\/+$/, '') + '/user.json')]);
  let reloadTimer = 0;
  onFileChanged((det) => {
    if (!det || hostKey(det.host) !== h || !watched.has(foldPath(String(det.path || '')))) return;
    if (!shown && !loaded) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => load(), RELOAD_MS);
  }, { signal });
  signal.addEventListener('abort', () => { clearTimeout(writeTimer); clearTimeout(reloadTimer); }, { once: true });

  return {
    toggle, show, hide, load, flush, reset,
    isOpen: () => shown,
    /** the heavy suite's raw read of the panel (never the DOM) */
    state: () => ({ tweaks: state.tweaks.map((x) => ({ ...x })), values: { ...state.values }, set: { ...state.set }, pending: { ...pending }, loaded }),
  };
}
