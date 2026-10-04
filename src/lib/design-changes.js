// THE CHANGES STRIP (lane design-changes, 2026-10-03; design 003 §2.2 — /var/tmp/vibespace-lanes/design-desk/
// claude-design-replica.md) — one round for many changes in the Design window: N changes cost ONE agent turn.
//
//   · THREE WAYS TO ADD A CHIP, every one a PREVIEW (nothing here writes a file — owner Q1, 2026-10-02: no hand edits):
//     the comment composer's "Add" beside "Send" (the comment becomes a chip instead of a message); a double-click on a
//     text while picking (the picker makes it editable in the frame — Enter keeps the words, the frame reports old →
//     new: `design-edit`); the composer's Style row — text colour, background, font size, spacing — previewed inline
//     in the frame (`design-style` through the canvas's outgoing fence; the frame reports what it drew).
//   · A frame's report is believed as the canvas fenced it (design-canvas-model.js pickFence / frameSay; a text edit only
//     from the frame the user was typing in, rate-gated) AND, for a style, only when it is the nudge THIS module asked
//     for (`pending`) — an artboard's own script cannot add a chip by posting.
//   · THE STRIP: "3 changes · Send all", each chip removable (× = the frame drops that preview), kept per design on this
//     device (localStorage — the previews themselves live in the frame and end with its document). One chip per
//     (artboard, element, what): a second edit of the same text / property updates it; back to the start = no chip.
//   · SEND ALL = `POST /api/design/changes {sessionId, host, dir, items}` → the hub spells ONE `[Design changes]` message
//     (design-model.js changesText — the chip's title shows that line) through THE belt and the comment's own sender
//     (typed now / queued behind the turn / stashed for a conversation that is not running). The agent makes each
//     change in the source, where it knows a repeated component from a one-off.
//   · Mounted by design-window.js (one line) + one seam in its composer; theme vars, zh/ja, 44 px targets on a phone.
import { showToast, fetchJson } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { cleanLine, CHANGE_PROPS, styleValueOk } from './design-canvas-model.js';
import { changeLine, LIMITS as DM_LIMITS } from '../design-model.js';

export const CHANGES_MAX = DM_LIMITS.changes;
const STORE_PREFIX = 'vs-design-changes:';
const CHIP_CHARS = 72;
const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** PURE: one chip per (artboard, element, what) — a comment is always its own. */
export function chipKey(c) {
  if (!isObj(c)) return '';
  if (c.edit === 'comment') return 'c\u0001' + (c.id || '');
  return [c.edit, c.file, c.ref, c.edit === 'style' ? c.prop : ''].join('\u0001');
}
/** PURE: a fenced `design-edit` (+ the quoted text of its element, when known) folded into the list → {list, op}:
 *  op = 'added' | 'updated' | 'dropped' (edited back to where it started) | 'full' (CHANGES_MAX reached) | 'same'. */
export function mergeEdit(list, msg, { text = '', id = '' } = {}) {
  const cur = Array.isArray(list) ? list : [];
  if (!isObj(msg) || (msg.edit !== 'text' && msg.edit !== 'style')) return { list: cur, op: 'same' };
  const row = { id, edit: msg.edit, file: msg.file, ref: msg.ref, path: msg.path, tag: msg.tag, text: msg.edit === 'style' ? cleanLine(text, 120) : '', from: msg.from, to: msg.to, ...(msg.edit === 'style' ? { prop: msg.prop } : {}) };
  const k = chipKey(row);
  const i = cur.findIndex((c) => chipKey(c) === k);
  if (i >= 0) {
    const was = cur[i];
    if (was.to === row.to) return { list: cur, op: 'same' };
    if (was.from === row.to) return { list: cur.filter((_, j) => j !== i), op: 'dropped' };
    return { list: cur.map((c, j) => (j === i ? { ...was, to: row.to } : c)), op: 'updated' };
  }
  if (row.from === row.to) return { list: cur, op: 'same' };
  if (cur.length >= CHANGES_MAX) return { list: cur, op: 'full' };
  return { list: [...cur, row], op: 'added' };
}
/** PURE: the chips → the route's items (only the fields the hub reads). */
export function itemsOf(list) {
  return (Array.isArray(list) ? list : []).map((c) => {
    const base = { edit: c.edit, file: c.file, path: c.path, tag: c.tag, text: c.text || '' };
    if (c.edit === 'text') return { ...base, from: c.from, to: c.to };
    if (c.edit === 'style') return { ...base, prop: c.prop, from: c.from, to: c.to };
    return { ...base, comment: c.comment };
  });
}
/** PURE: what a chip shows — the element and what it becomes, short (its title is the hub's whole line). */
export function chipWords(c) {
  const where = String(c.path || c.tag || '').split(' > ').pop(); // the element; the artboard and the before are in the title
  if (c.edit === 'text') return cleanLine(`${where}: “${c.to}”`, CHIP_CHARS);
  if (c.edit === 'style') return cleanLine(`${where}: ${propWord(c.prop)} ${c.to}`, CHIP_CHARS);
  return cleanLine(`${where}: ${c.comment}`, CHIP_CHARS);
}
/** PURE: a computed colour (`rgb(…)` / `rgba(…)` / `#rgb`) → `#rrggbb` for an <input type=color>; a transparent one → ''. */
export function hexOf(css) {
  const s = String(css || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s.slice(1).split('').map((x) => x + x).join('')).toLowerCase();
  const m = /^rgba?\(\s*([0-9.]+)[ ,]+([0-9.]+)[ ,]+([0-9.]+)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/.exec(s);
  if (!m) return '';
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return '';
  return '#' + [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Math.round(+v))).toString(16).padStart(2, '0')).join('');
}
/** PURE: the first px size of a computed value (`16px`, `8px 16px`) → a whole number, or null. */
export function pxOf(css) { const m = /^(-?[0-9.]+)px/.exec(String(css || '').trim()); return m ? Math.max(0, Math.round(+m[1])) : null; }
function propWord(prop) {
  return prop === 'color' ? t('Text colour') : prop === 'background-color' ? t('Background') : prop === 'font-size' ? t('Font size') : prop === 'padding' ? t('Spacing') : prop;
}
/** The words a delivered batch is confirmed in (the hub says HOW it went). */
export function changesSentText(r) {
  const how = String((r && (r.delivered || r.via)) || '');
  if (/stash|wait|held/i.test(how)) return t('The conversation is not running — your changes wait above its composer');
  if (/queue/i.test(how)) return t('Changes queued — the agent reads them after its current turn');
  return t('{n} changes sent to the agent', { n: (r && r.count) || 0 });
}
/** The words a refused batch is said in (the hub's code first). */
export function changesRefusalText(r) {
  if (!r) return t('Could not send the changes — the server did not answer');
  const code = r.code || '';
  if (code === 'no_session' || code === 'session_required' || code === 'unknown_session') return t('This design is not linked to a conversation — open it from the conversation\'s design chip to comment');
  if (code === 'too_many') return t('At most {n} changes go in one message — send these first', { n: CHANGES_MAX });
  return r.error ? t('The changes were not sent: {why}', { why: String(r.error).slice(0, 300) }) : t('The changes were not sent');
}

/** Mount the strip on one Design window. ctx = {winInfo, canvas, stage, signal, phone, host, dir, sayChip,
 *  closeComposer, composer: () => the open composer ({pick, ta} | null)}. → {composer(box, foot, ta), list()}. */
export function mountDesignChanges(ctx) {
  const { winInfo, canvas, stage, signal, phone, host, dir, sayChip, closeComposer, composer: getComposer } = ctx;
  const L = { signal };
  const storeKey = STORE_PREFIX + (host || 'local') + '\u0001' + dir;
  let list = load();
  let seq = list.reduce((n, c) => Math.max(n, +String(c.id || '').replace(/\D/g, '') || 0), 0);
  let picking = !!canvas.pick();
  let sending = false;
  const pending = new Map(); // `${file}\u0001${ref}\u0001${prop}` → the value asked for (a frame's report must match it)
  const quoted = new Map();  // `${file}\u0001${ref}` → the picked element's quoted text (a style chip's quote)

  function load() {
    try { const v = JSON.parse(localStorage.getItem(storeKey) || '[]'); return Array.isArray(v) ? v.filter(isObj).slice(0, CHANGES_MAX) : []; } catch { return []; }
  }
  function save() { try { if (list.length) localStorage.setItem(storeKey, JSON.stringify(list)); else localStorage.removeItem(storeKey); } catch { /* storage full / off: the chips still live in this window */ } }

  // ── the strip ──
  const strip = mk('div', 'design-changes' + (phone ? ' design-changes-phone' : ''));
  strip.setAttribute('role', 'region');
  strip.setAttribute('aria-label', t('Changes to send'));
  const count = mk('span', 'design-changes-count');
  const chips = mk('div', 'design-changes-chips');
  chips.setAttribute('role', 'list');
  const send = mk('button', 'btn-create design-changes-send');
  send.type = 'button';
  send.textContent = t('Send all');
  send.title = t('Send every change to the agent in one message');
  strip.append(count, chips, send);
  stage.appendChild(strip);
  send.addEventListener('click', () => sendAll(), L);
  // THE STAGE'S TOP DOCK (design-joint verify r1): the strip's bottom edge as `--design-top-dock` on the stage, so another
  // top overlay (the questions' folded pill, src/lib/design-ask.js) sits below it — on a phone the strip spans the width
  // and its Send all sat under that pill. Layout px (offsetTop / offsetHeight), never the zoomed client rect.
  const dock = () => stage.style.setProperty('--design-top-dock', strip.offsetParent ? strip.offsetTop + strip.offsetHeight + 'px' : '0px');
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(dock); ro.observe(strip); signal.addEventListener('abort', () => ro.disconnect(), { once: true }); }

  // THE CHIP JUST MADE IS IN VIEW (lane mirror-green-ui, 2.369.205): the chips scroll sideways and a new chip lands at
  // the end — in DejaVu Sans (the Actions runner's sans, and many a Linux desktop's) two text chips already overflowed a
  // 500 px strip by 14 px, the newest chip's × sat past the edge (the point under it was the strip) and a real click
  // there removed nothing. Scroll the list (only the list) so the chip lies whole inside it; the client rect is the
  // zoomed one, so the overflow is converted back to the list's own px.
  function reveal(key) {
    const el = key && [...chips.children].find((e) => e.dataset.key === key);
    if (!el) return;
    const a = el.getBoundingClientRect(), b = chips.getBoundingClientRect();
    const k = b.width ? chips.offsetWidth / b.width : 1;
    if (a.right > b.right) chips.scrollLeft += (a.right - b.right) * k;
    else if (a.left < b.left) chips.scrollLeft -= (b.left - a.left) * k;
  }
  function draw(show) {
    const n = list.length;
    strip.style.display = n || (picking && !phone) ? '' : 'none'; // the phone: the strip appears with a chip (the hint would cover the page)
    strip.classList.toggle('design-changes-empty', !n);
    count.textContent = n ? (n === 1 ? t('1 change') : t('{n} changes', { n })) : t('Double-click a text to edit it · Add collects comments');
    send.style.display = n ? '' : 'none';
    chips.replaceChildren(...list.map((c) => {
      const el = mk('span', 'design-change-chip design-change-' + c.edit);
      el.setAttribute('role', 'listitem');
      el.dataset.key = chipKey(c);
      const words = mk('span', 'design-change-words');
      words.textContent = chipWords(c);
      el.title = changeLine(c); // the hub's own line — what the agent will read for this chip
      const x = mk('button', 'design-change-x');
      x.type = 'button';
      x.innerHTML = UI_ICONS.close;
      x.title = t('Remove this change');
      x.setAttribute('aria-label', t('Remove this change'));
      x.addEventListener('click', () => remove(chipKey(c)), L);
      el.append(words, x);
      return el;
    }));
    reveal(show);
  }
  function remove(key) {
    const c = list.find((x) => chipKey(x) === key);
    if (!c) return;
    if (c.edit === 'text' || c.edit === 'style') canvas.tell(c.file, { kind: 'design-undo', ref: c.ref, edit: c.edit, prop: c.prop });
    if (c.edit === 'style') pending.delete([c.file, c.ref, c.prop].join('\u0001'));
    list = list.filter((x) => x !== c);
    save(); draw();
  }
  const full = () => sayChip(t('At most {n} changes go in one message — send these first', { n: CHANGES_MAX }));

  // ── a frame's fenced report (the canvas core's door) ──
  const off = canvas.listen((ev) => {
    if (ev.type === 'change') { if (ev.state.pick !== picking) { picking = ev.state.pick; draw(); } return; }
    if (ev.type !== 'edit') return;
    const m = ev.msg;
    if (m.edit === 'style' && pending.get([m.file, m.ref, m.prop].join('\u0001')) !== m.to) return; // not a nudge we asked for
    const r = mergeEdit(list, m, { text: quoted.get(m.file + '\u0001' + m.ref) || '', id: 'e' + (seq + 1) });
    if (r.op === 'full') { canvas.tell(m.file, { kind: 'design-undo', ref: m.ref, edit: m.edit, prop: m.prop }); full(); return; }
    if (r.op === 'same') return;
    if (r.op === 'added') seq += 1;
    const made = r.list.find((c) => !list.includes(c)); // the chip added or changed (an 'updated' row is a new object)
    list = r.list;
    save(); draw(made ? chipKey(made) : null);
  });
  signal.addEventListener('abort', () => off(), { once: true });

  // ── the composer's seam: "Add" beside "Send", and the Style row ──
  function composer(box, foot, ta) {
    const add = mk('button', 'btn-cancel design-changes-add');
    add.type = 'button';
    add.textContent = t('Add');
    add.title = t('Add to the changes — send them all at once');
    foot.insertBefore(add, foot.lastElementChild); // Cancel · Add · Send
    add.addEventListener('click', () => addComment(ta));
    const toggle = mk('button', 'design-style-toggle');
    toggle.type = 'button';
    toggle.textContent = t('Style…');
    toggle.setAttribute('aria-expanded', 'false');
    const row = mk('div', 'design-style-row');
    row.style.display = 'none';
    const ctl = {};
    const field = (prop, input) => {
      const lab = mk('label', 'design-style-field');
      const s = mk('span'); s.textContent = propWord(prop);
      lab.append(s, input);
      row.appendChild(lab);
      ctl[prop] = input;
      input.addEventListener('input', () => nudge(prop, input), L);
    };
    const color = () => { const i = mk('input'); i.type = 'color'; return i; };
    const px = (min, max) => { const i = mk('input'); i.type = 'number'; i.min = String(min); i.max = String(max); i.step = '1'; i.inputMode = 'numeric'; return i; };
    field('color', color());
    field('background-color', color());
    field('font-size', px(1, 400));
    field('padding', px(0, 400));
    let filledFor = '';
    const fill = () => {
      const p = getComposer()?.pick;
      if (!p || filledFor === p.file + '\u0001' + p.ref) return;
      filledFor = p.file + '\u0001' + p.ref;
      const css = p.css || {};
      ctl.color.value = hexOf(css.color) || '#000000';
      ctl['background-color'].value = hexOf(css.background) || '#ffffff';
      ctl['font-size'].value = pxOf(css.size) ?? '';
      ctl.padding.value = pxOf(css.pad) ?? '';
    };
    toggle.addEventListener('click', () => {
      const open = row.style.display === 'none';
      row.style.display = open ? '' : 'none';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) fill();
    });
    row.addEventListener('pointerdown', fill, true);
    row.addEventListener('focusin', fill);
    box.insertBefore(toggle, foot);
    box.insertBefore(row, foot);
  }
  function nudge(prop, input) {
    const p = getComposer()?.pick;
    if (!p || !p.ref) { sayChip(t('This element cannot be previewed — describe the change in words instead')); return; }
    const value = prop === 'color' || prop === 'background-color' ? String(input.value || '').toLowerCase() : input.value === '' ? '' : Math.round(+input.value) + 'px';
    if (!CHANGE_PROPS.includes(prop) || !styleValueOk(prop, value)) return;
    if (list.length >= CHANGES_MAX && !list.some((c) => c.edit === 'style' && c.file === p.file && c.ref === p.ref && c.prop === prop)) { full(); return; }
    pending.set([p.file, p.ref, prop].join('\u0001'), value);
    quoted.set(p.file + '\u0001' + p.ref, p.text || '');
    canvas.tell(p.file, { kind: 'design-style', ref: p.ref, prop, value });
  }
  function addComment(ta) {
    const c = getComposer();
    const p = c && c.pick;
    const text = String(ta.value || '').trim();
    const styled = p && list.some((x) => x.edit === 'style' && x.file === p.file && x.ref === p.ref);
    if (!p || (!text && !styled)) { ta.focus(); sayChip(t('Write what should change first')); return; }
    if (text) {
      if (text.length > DM_LIMITS.changeComment) { ta.focus(); sayChip(t('A comment in the changes is at most {n} characters', { n: DM_LIMITS.changeComment })); return; }
      if (list.length >= CHANGES_MAX) { full(); return; }
      seq += 1;
      list = [...list, { id: 'c' + seq, edit: 'comment', file: p.file, path: p.path, tag: p.tag, text: p.text || '', comment: text }];
      save(); draw(chipKey(list[list.length - 1]));
    }
    closeComposer(); // Comment mode stays on: pick the next element
    sayChip(list.length === 1 ? t('Added — 1 change waits. Pick the next element, or Send all.') : t('Added — {n} changes wait. Pick the next element, or Send all.', { n: list.length }));
  }

  // ── send all: ONE message ──
  async function sendAll() {
    if (sending || !list.length) return;
    if (!winInfo._design.sessionId) { sayChip(changesRefusalText({ code: 'no_session' })); return; }
    sending = true;
    send.textContent = t('Sending…');
    const sent = list;
    const r = await fetchJson('/api/design/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: winInfo._design.sessionId, host, dir, items: itemsOf(sent) }) });
    sending = false;
    send.textContent = t('Send all');
    if (!r || r.error || r.ok === false) { sayChip(changesRefusalText(r)); return; } // the chips stay
    list = list.filter((c) => !sent.includes(c)); // a chip added while sending stays for the next round
    pending.clear();
    quoted.clear();
    save(); draw();
    showToast(changesSentText(r));
  }

  draw();
  winInfo._designChanges = { list: () => list.slice(), sendAll, remove }; // the raw handle the heavy suite reads
  return { composer, list: () => list.slice() };
}
