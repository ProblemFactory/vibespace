// THE PATH FIELD (lane path-field — L1 of the New Session train; the owner accepted POC v2.2 on 2026-10-23 「没啥问题」).
// ONE component at EVERY door where a person types a folder (New Session, the Task Group panel, the mounts dialog, the
// app launcher, the Files path bar, the first chat, the session palette's /path) — it replaces setupDirAutocomplete.
// The contract the other lanes embed is frozen:
//   pathField(input, { bases, groupsOf, host, kind: 'folder'|'file', onCommit, name, onState, create, createWhen, picker,
//                      chips, id }) → { el, input, value, verdict, commit, set, refresh, open, close, ensure, destroy,
//                      setDerived }
// ADDED (lane new-session-group-folder-link — additive, nothing renamed): `pf.setDerived(text, { note, commit = false })`
//   fills the field FOR the door (a value derived from something else — New Session: the first picked Task Group's folder)
//   without counting as the person's: the line says where it came from (`= ~/work/x（来自任务组「X」）`), and `info.derived`
//   is true while that text stands untouched (typing, a pick, a chip, the picker or `set()` end it). A groupsOf row may
//   carry `chips: () => [{ path, tip, color }]`, the door's own chips for that group (default: its folders + its notes).
//   `chips: true` paints on `refresh()` (never at construction — no fetch while the page boots); the 由名字 chips
//   (PURE nameChips) lead the row, 新建 only for a folder the machine was asked about and does not have.
// What every door gets (PURE src/path-candidates.js decides what to offer; this file only shows it and says it):
//   · grouped candidates with reason chips — ① the Task Groups' folders (one absent on the chosen machine greyed «not on
//     <machine> · create?», never dropped) ② 由名字 <group folder>/<name> per selected group + ~/<name> ③ recent folders with
//     counts ④ the listing / the whole-path fuzzy hits with their rule chips ⑤ mounts; computed FOR THE MACHINE chosen
//     (GET /api/dir-complete here, /api/hosts/:id/dir-complete there — the same listing slice)
//   · the greyed resolution line (= <path> · relative to <base>; «N places have this» with every one pressable)
//   · keys ↑↓ Enter Tab Esc (Tab completes INTO a folder), IME-safe (a composing key is never taken; the input is never
//     re-rendered), the list never pops by itself (a press, typing, ↓ or a Tab INTO the field opens it)
//   · BLUR COMMITS: leaving the field (or Enter) makes a value that resolves take effect; one that does not keeps its text
//     and says 「未生效：…」 — never dropped silently; the commit waits past pointer-up so a re-render never eats the click
//   · «Does not exist — create it?» with the door's tick (a 新建 row picked IS that consent); its parent missing ⇒ said
//   · the folder button → THE PICKER (a dialog over the dialog): home + mounts as a tree with the groups' folders pinned
//     and badges, a preview with files / sizes / dates, the same fuzzy search, «New folder» inline, «Choose this folder»;
//     it remembers its last folder per field
//   · never offered unasked: the instance's own checkout, its data dir, dot-folders (typed explicitly they still resolve)
import { t } from './i18n.js';
import { escHtml, fetchJson, createModalShell, onOutsidePress, pressToken } from './utils.js';
import { ownFloat } from './form-yield.js'; // PURE (lane dialog-yield r3): the floated list is the form's — a press on it keeps the form's keys
import { FILE_ICONS, UI_ICONS } from './icons.js';
import { getFileIcon } from './file-types.js';
import { imeOwnsKey } from './chat-enter-keys.js';
import { folderChips } from '../day-one.js';
import { loadHomeFolders, paintFolderChips } from './folder-chips.js';
import { rankCandidates, groupOn, mergeListing, missingVerdict, isExcludedPath, toTilde, fromTilde, parentOf, baseName, HOST_ROW, nameChips } from '../path-candidates.js';

const DEBOUNCE_MS = 110;
const RECENT_TTL_MS = 30e3;
const TAB_OPENS_MS = 400;
const PROBE_MS = 250;   // the 由名字 chips ask about their folders once the name rests this long
/** The chips row in SECTIONS, each a line with its label pinned left (lane new-session-layout-v3-build — the v3 design:
 *  任务组的文件夹 / 由名字 / the person's own folders; on the phone each line scrolls sideways). Only the grouping: the chips,
 *  their order inside a section and their presses are the painters' own. */
const CHIP_SECTIONS = [['group', 'Task Group folders'], ['name', 'From the name'], ['own', 'Your folders']];
function sectionChips(el) {
  const chips = [...el.querySelectorAll(':scope > .cwd-recent-chip')];
  if (!chips.length) return;
  const sec = (c) => (c.dataset.kind === 'task' ? 'group' : c.dataset.kind === 'name' ? 'name' : 'own');
  el.replaceChildren(...CHIP_SECTIONS.map(([k, label]) => {
    const items = chips.filter((c) => sec(c) === k);
    if (!items.length) return null;
    const line = document.createElement('div'); line.className = 'pf-chipline'; line.dataset.sec = k;
    const lab = document.createElement('span'); lab.className = 'pf-chipk'; lab.textContent = t(label);
    line.append(lab, ...items);
    return line;
  }).filter(Boolean));
}

/* ── the machines as far as the fields have seen them (shared by every field of the page) ── */
const WORLD = new Map(); // hostKey ('' = here) → { L, self, recent, error, unreachable }
const hostKey = (h) => (!h || h === 'local' ? '' : String(h));
const world = (hk) => {
  if (!WORLD.has(hk)) WORLD.set(hk, { L: { home: hk ? '' : LOCAL.home, machine: hk || null, dirs: {}, links: {}, localized: {}, mounts: [], nondirs: {} }, self: null, recent: null, error: '' });
  return WORLD.get(hk);
};
const LOCAL = { home: '', p: null };
/* this machine's home: the app's own answer when it has one (app.js reads /api/home at boot), else asked once — lazily, on the
   field's first question, never while the page boots (a field is built during the app's init) */
function localHome() {
  if (!LOCAL.home && window.app?._localHome) { LOCAL.home = window.app._localHome; const W = WORLD.get(''); if (W && !W.L.home) W.L.home = LOCAL.home; }
  if (LOCAL.home || LOCAL.p) return LOCAL.p || Promise.resolve(LOCAL.home);
  LOCAL.p = fetchJson('/api/home').then((d) => { if (d && d.home) { LOCAL.home = d.home; const W = WORLD.get(''); if (W && !W.L.home) W.L.home = d.home; } return LOCAL.home; });
  return LOCAL.p;
}
const stripSlash = (p) => { const s = String(p || '').trim(); return s.length > 1 ? s.replace(/\/+$/, '') : s; };
/* a machine's NAME for the words (my-mac, never its id): GET /api/hosts once, else the page's host picker */
const HOSTS = { names: null, p: null };
const hostName = (hk) => {
  if (!hk) return '';
  if (!HOSTS.names && !HOSTS.p) HOSTS.p = fetchJson('/api/hosts').then((d) => { HOSTS.names = Object.fromEntries(((d && d.hosts) || []).map((h) => [h.id, h.name])); });
  if (HOSTS.names && HOSTS.names[hk]) return HOSTS.names[hk];
  const o = [...document.querySelectorAll('select[id*="host"] option')].find((x) => x.value === hk);
  return (o && o.textContent.replace(/\s*\(.*\)\s*$/, '').trim()) || hk;
};
/* a paired machine the hub could not reach (lane hub-dies-dead-ssh-host): the server refuses it BY NAME before anything
   spawns (`unreachable` in the answer, kept a minute there) — the field says so in its own line and offers nothing there */
const unreachableWords = (hk) => t('{host} cannot be reached — use a path on this machine or try again later', { host: hostName(hk) });

/* ── the pointer: a commit waits until the press is over (a re-render under the pointer eats the click) ── */
let pointerIsDown = false; const afterUp = []; let lastTabAt = 0; let installed = false;
function installDocListeners() {
  if (installed) return; installed = true;
  document.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
  const up = () => { if (!pointerIsDown) return; pointerIsDown = false; setTimeout(() => { for (const fn of afterUp.splice(0)) { try { fn(); } catch { } } }, 0); };
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', up, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') lastTabAt = Date.now(); }, true);
}
const afterPointer = (fn) => { if (pointerIsDown) afterUp.push(fn); else fn(); };

/* ── words (every key a literal: zh / ja tables) ── */
const whenWords = (ms) => {
  if (!ms) return '';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return t('just now');
  if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('{n} h ago', { n: h });
  const d = Math.round(h / 24);
  if (d === 1) return t('yesterday');
  return d < 14 ? t('{n} days ago', { n: d }) : new Date(ms).toISOString().slice(0, 10);
};
const baseWord = (b) => (b === 'abs' ? t('absolute path') : b === 'home' ? t('home') : String(b || ''));
function secTitle(s) {
  const p = s.title.params || {};
  if (s.sec === 1) return t('① Task Group folders');
  if (s.sec === 2) return p.word ? t('② From the word you typed (the session name is empty)') : t('② From the name');
  if (s.sec === 3) return t('③ Recent');
  if (s.sec === 4) return p.files ? t('④ Folders · files') : t('④ Folders');
  return t('⑤ Mounts');
}
function onWords(p) { return !p.host || !p.on ? '' : p.on === 'declared' ? ' · ' + t('declared for {host}', { host: p.host }) : ' · ' + t('on {host}', { host: p.host }); }
function chipText(c) {
  const p = c.params || {};
  switch (c.key) {
    case 'group': return t('Task Group · {group}', { group: p.group }) + onWords(p);
    case 'notes': return t('Shared notes · {group}', { group: p.group }) + onWords(p);
    case 'in-group': return t('In Task Group «{group}»', { group: p.group });
    case 'recent': return (p.count === 1 ? t('1 session') : t('{n} sessions', { n: p.count })) + (p.when ? ' · ' + p.when : '');
    case 'mount': return t('Mount · {mount}', { mount: p.mount });
    case 'file': return t('File · {size}', { size: p.size }) + (p.relative ? ' · ' + t('relative to {base}', { base: p.relative }) : '');
    case 'inside': return t('Inside');
    case 'name-same': return t('Same-name folder');
    case 'name-group': return t('Task Group «{group}»', { group: p.group });
    case 'name-home': return p.host ? t('{host} home', { host: p.host }) : t('Home');
    default: return p.relative ? t('Folder · relative to {base}', { base: p.relative }) : t('Folder');
  }
}
const ruleText = (r) => ({ segment: t('Segment prefix'), subseq: t('Subsequence'), token: t('Word match'), prefix: t('Same start'), list: t('Listing') })[r] || '';
function whyText(w) {
  const p = w.params || {};
  switch (w.key) {
    case 'seg-start': return t('{tok} → the start of {seg}', p);
    case 'seg-word': return t('{tok} → the word {word} in {seg}', p);
    case 'seg-initials': return t('{tok} → the initials of {seg}', p);
    case 'alias': return t('{tok} → the alias «{alias}»', p);
    case 'subseq': return t('the letters of {tok} appear in order in the path', p);
    case 'in-path': return t('{tok} is in the path', p);
    case 'in-alias': return t('{tok} is in the alias «{alias}»', p);
    case 'name-group': return p.word ? t('Task Group «{group}» folder + the word you typed', p) : t('Task Group «{group}» folder + the name', p);
    case 'name-home': return p.word ? t('home + the word you typed') : t('home + the name');
    case 'name-same': return t('A folder of that name already exists');
    case 'absent': return t('Not on {host} · create?', p);
    default: return '';
  }
}
function aliasText(a) {
  const k = a.from && a.from.key;
  if (k === 'group-name') return t('Task Group name «{alias}»', { alias: a.text });
  if (k === 'os-name') return t('Alias «{alias}» · the system’s display name', { alias: a.text });
  return t('Alias «{alias}» · link {link}', { alias: a.text, link: (a.from && a.from.params && a.from.params.link) || '' });
}
const boostText = (b) => ({ recent: t('recent +{n}', b.params), group: t('Task Group +{n}', b.params), missing: t('does not exist yet {n}', b.params), 'word-new': t('made from the typed word — never ahead of a folder that is there') })[b.key] || '';
function dirWords(L, p) {
  const y = L.dirs[p] || {};
  const kids = (y.kids || []).length;
  const parts = [];
  if (kids) parts.push(kids === 1 ? t('1 folder') : t('{n} folders', { n: kids }));
  if (y.fileCount) parts.push(y.fileCount === 1 ? t('1 file') : t('{n} files', { n: y.fileCount + (y.more ? '+' : '') }));
  if (y.mtime) parts.push(t('changed {when}', { when: whenWords(y.mtime) }));
  return parts.length ? parts.join(' · ') : (y.kids ? t('empty folder') : '');
}
const sizeWords = (n) => { const b = Number(n) || 0; return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(1)} GB`; };
const hl = (p, idx) => {
  if (!idx || !idx.length) return escHtml(p);
  const set = new Set(idx); let o = '';
  for (let k = 0; k < p.length; k++) o += set.has(k) ? `<span class="pf-match">${escHtml(p[k])}</span>` : escHtml(p[k]);
  return o;
};
const isPhone = () => !!(window.app?.isMobile);

/** The person's Task Groups as a field takes them: the SELECTED ones in selection order (`selected: true` — their folders
 *  lead the bases and give the 由名字 rows), else every group that is not archived (`selected: false` — offered, no bases).
 *  Every door's default `groupsOf` (the candidates come from the person's own groups). */
export function appGroups(selectedIds = []) {
  const sb = window.app?.sidebar; if (!sb) return [];
  const all = (sb._taskBoardOrder?.() || []).filter(Boolean);
  const mk = (tg, selected) => ({ id: tg.id, name: tg.title || tg.name || '', color: sb.getTaskColor?.(tg) || '', folders: sb._folderPaths?.(tg) || [], context: tg.contextDir || null, selected });
  const sel = (selectedIds || []).map((id) => all.find((x) => x.id === id)).filter(Boolean);
  return sel.length ? sel.map((tg) => mk(tg, true)) : all.filter((tg) => !tg.archived).map((tg) => mk(tg, false));
}

/**
 * THE PATH FIELD. `input` = a text input already in (or about to join) the DOM; the field wraps it in place.
 * See the header and CONTRACT.md for every option; all functions are re-read on every query.
 */
export function pathField(input, opts = {}) {
  installDocListeners();
  const o = { bases: () => [], groupsOf: () => appGroups([]), host: () => null, kind: 'folder', onCommit: null, name: null, onState: null, create: undefined, createWhen: '', picker: true, chips: false, id: '', ...opts };
  const kind = o.kind === 'file' ? 'file' : 'folder';
  const createMode = o.create === 'never' || o.create === 'ask' ? o.create : (kind === 'folder' ? 'ask' : 'never');
  const fid = o.id || input.id || 'path-field';
  const call = (fn, dflt) => { try { const v = typeof fn === 'function' ? fn() : fn; return v == null ? dflt : v; } catch { return dflt; } };
  const st = { open: false, active: -1, err: '', errBest: '', tick: false, flash: false, committed: null, answered: null, seq: 0, ctl: null, timer: null, verdict: null, destroyed: false, chipsAt: '', derived: null, probeTimer: null };

  /* ── DOM ── */
  const wrap = document.createElement('div');
  wrap.className = 'path-field';
  wrap.dataset.state = 'empty';
  const row = document.createElement('div'); row.className = 'pf-row';
  const under = document.createElement('div'); under.className = 'pf-under'; under.setAttribute('role', 'status'); under.setAttribute('aria-live', 'polite');
  const list = document.createElement('div'); list.className = 'pf-list'; list.setAttribute('role', 'listbox'); list.hidden = true; list.id = `pf-list-${fid}-${Math.random().toString(36).slice(2, 7)}`;
  if (input.parentNode) input.parentNode.insertBefore(wrap, input);
  row.appendChild(input);
  let pickBtn = null;
  if (o.picker !== false) {
    pickBtn = document.createElement('button');
    pickBtn.type = 'button'; pickBtn.className = 'pf-pick';
    pickBtn.innerHTML = FILE_ICONS.folder;
    pickBtn.title = kind === 'file' ? t('Pick a file or folder…') : t('Pick a folder…');
    pickBtn.setAttribute('aria-label', pickBtn.title);
    row.appendChild(pickBtn);
  }
  wrap.append(row, under);
  let chipsEl = null;
  if (o.chips) {
    chipsEl = wrap.closest('label, .form-row, .field')?.querySelector('.cwd-recent') || null;
    if (!chipsEl) { chipsEl = document.createElement('div'); chipsEl.className = 'cwd-recent pf-chips'; }
    wrap.appendChild(chipsEl);
  }
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.classList.add('pf-input');

  /* ── what the field knows now ── */
  const hk = () => hostKey(call(o.host, null));
  const textNow = () => input.value.trim();
  function groupsNow() {
    const home = LOCAL.home;
    return (call(o.groupsOf, []) || []).filter(Boolean).map((g) => ({
      id: g.id, name: String(g.name || g.title || ''), color: g.color || '', selected: !!g.selected,
      folders: (g.folders || []).map((f) => (typeof f === 'string' ? f : f && f.path)).filter(Boolean).map((f) => (HOST_ROW.test(f) ? f : toTilde(home, stripSlash(f)))),
      context: g.context ? toTilde(home, stripSlash(g.context)) : null,
      chips: typeof g.chips === 'function' ? g.chips : null,
    }));
  }
  function inputsNow() {
    const h = hk(); const W = world(h); const L = W.L;
    if (!LOCAL.home && window.app?._localHome) LOCAL.home = window.app._localHome;
    if (!h && !L.home && LOCAL.home) L.home = LOCAL.home;
    const view = groupsNow().map((g) => groupOn(g, L));
    const bases = [];
    for (const g of view.filter((x) => x.selected)) for (const f of g.folders) bases.push({ path: f, label: t('Task Group «{name}»', { name: g.name }) });
    for (const b of call(o.bases, []) || []) if (b && b.path) bases.push({ path: toTilde(h ? L.home : LOCAL.home, stripSlash(b.path)), label: String(b.label || '') });
    bases.push({ path: '~', label: h ? t('{host} home', { host: hostName(h) }) : t('home') });
    return { bases, groups: view, recent: recentNow(h), listing: L, name: String(call(o.name, '') || ''), machine: h ? hostName(h) : '', files: kind === 'file', self: W.self };
  }
  function recentNow(h) {
    const W = world(h);
    if (!h) {
      const by = new Map();
      for (const s of window.app?.sidebar?._allSessions || []) {
        if (!s || !s.cwd || s.host) continue;
        const c = by.get(s.cwd) || { path: toTilde(LOCAL.home, s.cwd), count: 0, last: 0 };
        c.count++; const at = Number(s.startedAt || s.lastActivity || 0); if (at > c.last) c.last = at; by.set(s.cwd, c);
      }
      return [...by.values()].sort((a, b) => b.last - a.last).slice(0, 20).map((r) => ({ path: r.path, count: r.count, when: whenWords(r.last) }));
    }
    if (!W.recent || Date.now() - W.recent.at > RECENT_TTL_MS) {
      if (!W.recent || !W.recent.p) {
        const p = fetchJson(`/api/hosts/${encodeURIComponent(h)}/recent-cwds`).then((d) => {
          W.recent = { at: Date.now(), rows: Array.isArray(d && d.recent) ? d.recent : (d && d.cwds || []).map((c) => ({ path: c, count: 1, last: 0 })), p: null };
          if (d && d.unreachable) W.unreachable = d.unreachable;
          paint(); paintChips(true);
        });
        W.recent = { ...(W.recent || { at: 0, rows: [] }), p };
      }
    }
    const home = W.L.home;
    return ((W.recent && W.recent.rows) || []).map((r) => ({ path: toTilde(home, String(r.path || '').replace(/^[^:]*: /, '')), count: r.count || 1, when: whenWords(r.last) }));
  }
  let memo = { key: '', m: null };
  function model(text = textNow()) {
    const inp = inputsNow();
    const dead = !!(hk() && world(hk()).unreachable); // a machine that cannot be reached is offered nothing (no «not on my-mac» guesses)
    const key = JSON.stringify([text, hk(), inp.name, inp.groups.map((g) => [g.id, g.selected, g.folders]), inp.bases.map((b) => b.path), Object.keys(inp.listing.dirs).length, inp.recent.length, !!inp.self, dead]);
    if (memo.key !== key) { const m = rankCandidates(text, inp); memo = { key, m: dead ? { ...m, rows: [], sections: [], best: null, nameRows: [] } : m, inp }; }
    return memo.m;
  }
  const abs = (p) => fromTilde(world(hk()).L.home || LOCAL.home, p);
  /* the door's derived text (setDerived), while it stands untouched — its note says where it came from */
  const derivedNow = () => (st.derived && st.derived.text === input.value ? st.derived : null);
  const fromHTML = () => { const d = derivedNow(); return d && d.note ? `<span class="pf-from">${escHtml(d.note)}</span>` : ''; };

  /* ── asking the machine ── */
  function ask(text = textNow(), { force = false } = {}) {
    const h = hk();
    if (!force && st.answered && st.answered.text === text && st.answered.h === h && Date.now() - st.answered.at < 2000) return Promise.resolve();
    const W = world(h);
    const go = () => {
      const inp = inputsNow();
      const m = rankCandidates(text, inp);
      const probe = new Set();
      for (const g of inp.groups) { for (const f of g.folders) probe.add(f); for (const f of g.absent || []) probe.add(f); if (g.context) probe.add(g.context); }
      for (const g of groupsNow()) for (const f of g.folders) if (!HOST_ROW.test(f)) probe.add(f);
      for (const n of m.nameRows) probe.add(n.path);
      for (const r of inp.recent.slice(0, 8)) probe.add(r.path);
      if (m.missing) probe.add(m.missing.path);
      const fuzzy = m.mode === 'fuzzy' ? text : '';
      const qs = `?path=${encodeURIComponent(text)}&bases=${encodeURIComponent(JSON.stringify(inp.bases.map((b) => b.path)))}&probe=${encodeURIComponent(JSON.stringify([...probe].slice(0, 40)))}&q=${encodeURIComponent(fuzzy)}&kind=${kind}`;
      const url = (h ? `/api/hosts/${encodeURIComponent(h)}/dir-complete` : '/api/dir-complete') + qs;
      st.ctl?.abort?.(); st.ctl = new AbortController();
      const my = ++st.seq;
      wrap.dataset.pending = '1';
      return fetchJson(url, { signal: st.ctl.signal }).then((d) => {
        if (my !== st.seq || st.destroyed) return;
        delete wrap.dataset.pending;
        if (d && d.listing) {
          mergeListing(W.L, d.listing);
          W.L.machine = h || null;
          if (d.listing.nondirs) Object.assign(W.L.nondirs = W.L.nondirs || {}, d.listing.nondirs);
          if (d.self) W.self = d.self;
        }
        if (d && d.listing) { W.asked = W.asked || new Map(); for (const p of probe) W.asked.set(p, Date.now()); }
        W.error = (d && d.error) || (d ? '' : t('the machine did not answer'));
        W.unreachable = (d && d.unreachable) || null;
        st.answered = { text, h, at: Date.now() };
        if (d && d.partial && !st.reasked) { st.reasked = true; setTimeout(() => { st.reasked = false; if (textNow() === text) ask(text, { force: true }); }, 450); }
        paint();
      });
    };
    return !h && !LOCAL.home ? localHome().then(go) : go();
  }
  const askSoon = () => { clearTimeout(st.timer); st.timer = setTimeout(() => ask(), DEBOUNCE_MS); };

  /* ── the verdict (what the line says; what a form's footer may say) ── */
  function target(text = textNow()) {
    const m = model(text);
    if (!text) return { empty: true, m };
    if (m.resolved.length) return { ok: true, r: m.resolved[0], all: m.resolved, m };
    const pathLike = /^[~/.]/.test(text) || text.includes('/');
    if (m.missing && pathLike) { const mv = missingVerdict(m.missing.path, world(hk()).L); return { missing: true, path: m.missing.path, base: m.missing.base, parentOk: mv.parentExists, parent: mv.parent, file: !!(world(hk()).L.nondirs || {})[m.missing.path], m }; }
    return { search: true, m };
  }
  function verdictNow() {
    const text = textNow(); const x = target(text);
    if (st.err) return { status: 'unresolved', text: t('Not applied:') + ' ' + st.err };
    if (hk() && world(hk()).unreachable) return { status: 'unreachable', text: unreachableWords(hk()) };
    if (x.empty) return { status: 'empty', text: '' };
    if (x.ok) return { status: 'ok', text: '= ' + x.r.path, path: abs(x.r.path), alts: x.all.length - 1 };
    if (wrap.dataset.pending && !st.answered) return { status: 'pending', text: t('Asking the machine…') };
    if (x.missing) return { status: 'missing', text: x.parentOk ? t('{path} does not exist — create it?', { path: x.path }) : t('{path} does not exist, nor the folder above ({parent})', { path: x.path, parent: x.parent || '' }), path: abs(x.path), parentExists: !!x.parentOk };
    return { status: 'searching', text: t('«{text}» is not a path yet — pick a folder from the list', { text }) };
  }
  function emitState() {
    const v = verdictNow();
    const was = st.verdict;
    st.verdict = v;
    wrap.dataset.state = v.status;
    if (!was || was.status !== v.status || was.text !== v.text) { try { o.onState?.(v); } catch { } }
  }

  /* ── painting (never the input itself: IME, the caret) ── */
  function listHTML() {
    const m = model();
    if (!m.rows.length) {
      const W = world(hk());
      return `<div class="pf-empty">${escHtml(W.unreachable && hk() ? unreachableWords(hk()) : W.error ? t('The machine did not answer: {err}', { err: W.error }) : m.mode === 'empty' ? t('No suggestions yet — type a path or a few letters.') : t('No matching folder.'))}</div>`;
    }
    let i = 0;
    const body = m.sections.map((s) => `<div class="pf-sec">${escHtml(secTitle(s))}${s.more ? `<span class="pf-more">${escHtml(t('{n} more', { n: s.more }))}</span>` : ''}</div>` + s.rows.map((r) => {
      const k = i++;
      const icon = r.file ? getFileIcon(baseName(r.path)) : r.isNew ? UI_ICONS.plus : r.mount ? UI_ICONS.connect : FILE_ICONS.folder;
      const chips = [];
      if (r.isNew && !r.absent) chips.push(`<span class="pf-chip new">${escHtml(t('New'))}</span>`);
      chips.push(`<span class="pf-chip${/group|notes|name-group/.test(r.chip.key) ? ' grp' : r.chip.key === 'mount' ? ' mnt' : ''}">${r.chip.params && r.chip.params.color ? `<span class="tvg-dot" style="--g-color:${escHtml(r.chip.params.color)}"></span>` : ''}${escHtml(chipText(r.chip))}</span>`);
      if (r.absent) chips.push(`<span class="pf-chip new">${escHtml(whyText(r.why))}</span>`);
      if (m.mode === 'fuzzy' && r.rule) chips.push(`<span class="pf-chip rule" title="${escHtml((r.why || []).map(whyText).join(', ') + (r.boost && r.boost.length ? '\n' + r.boost.map(boostText).join(' · ') : ''))}">${escHtml(ruleText(r.rule))}</span>`);
      if (r.alias) chips.push(`<span class="pf-chip rule">${escHtml(aliasText(r.alias))}</span>`);
      if (r.git) chips.push(`<span class="pf-chip" title="git">${UI_ICONS.forkBranch}</span>`);
      const tip = r.path + (r.why && !Array.isArray(r.why) ? '\n' + whyText(r.why) : '');
      return `<div class="pf-item${k === st.active ? ' active' : ''}${r.sub ? ' sub' : ''}${r.absent ? ' absent' : ''}" data-i="${k}" role="option" aria-selected="${k === st.active}" title="${escHtml(tip)}"><span class="pf-ic">${icon}</span><span class="pf-path">${hl(r.path, r.hl)}</span><span class="pf-rc">${chips.join('')}</span></div>`;
    }).join('')).join('');
    const keys = isPhone() ? '' : `<div class="pf-keys"><span><kbd>↑</kbd><kbd>↓</kbd> ${escHtml(t('choose'))}</span><span><kbd>Enter</kbd> ${escHtml(t('pick'))}</span><span><kbd>Tab</kbd> ${escHtml(t('complete into it'))}</span><span><kbd>Esc</kbd> ${escHtml(t('close'))}</span></div>`;
    return body + keys;
  }
  const baseOrderTip = () => t('A relative path is looked up in this order:') + '\n' + inputsNow().bases.map((b, i) => `${i + 1}. ${b.label} = ${b.path}`).join('\n');
  function underHTML() {
    const text = textNow(); const x = target(text); const L = world(hk()).L;
    let h = '';
    if (st.err) h += `<div class="pf-res pf-err"><span class="pf-hint"><b>${escHtml(t('Not applied:'))}</b> ${escHtml(st.err)}</span>${st.errBest ? `<button type="button" class="pf-link pf-best" data-act="best">${UI_ICONS.check} ${escHtml(t('Use the first: {path}', { path: st.errBest }))}</button>` : ''}</div>`;
    if (hk() && world(hk()).unreachable) return h + `<div class="pf-res pf-err pf-unreachable"><span class="pf-hint">${escHtml(unreachableWords(hk()))}</span></div>`;
    if (x.empty) {
      const h2 = hk();
      h += `<div class="pf-res"><span class="pf-hint one" title="${escHtml(baseOrderTip())}">${h2 ? escHtml(t('On {host}:', { host: hostName(h2) })) + ' ' : ''}${escHtml(t('An absolute path, ~/…, a relative path or a few letters'))} ${UI_ICONS.info}</span></div>`;
    } else if (x.ok) {
      const r = x.r;
      const facts = r.file ? t('File') : dirWords(L, r.path);
      if (x.all.length > 1) {
        h += `<div class="pf-res"><span class="pf-hint">${escHtml(t('{n} places have this — the first is used; press another to switch:', { n: x.all.length }))}</span>${x.all.map((rr, i) => `<button type="button" class="pf-alt${i === 0 ? ' used' : ''}" data-act="alt" data-path="${escHtml(rr.path)}" title="${escHtml(i === 0 ? t('This one is used') : t('Use this one'))}">= ${escHtml(rr.path)} <span class="pf-who">${escHtml(rr.relative ? t('relative to {base}', { base: rr.base }) : baseWord(rr.base))}${i === 0 ? ' · ' + escHtml(t('used')) : ''}</span></button>`).join('')}</div>`;
      } else {
        const same = text.replace(/\/+$/, '') === r.path && !derivedNow();
        h += `<div class="pf-res"><div class="pf-ln">${same ? '' : `<span class="pf-eq">= <b>${escHtml(r.path)}</b>${fromHTML()}</span>`}${r.kind === 'complete' ? `<span class="pf-tag">${escHtml(t('completed from the start · Tab'))}</span>` : ''}${r.kind === 'link' ? `<span class="pf-tag">${escHtml(t('through the link {via}', { via: r.via }))}</span>` : ''}${r.relative && !same ? `<span class="pf-meta">${escHtml(t('relative to {base}', { base: r.base }))}</span>` : ''}${facts ? `<span class="pf-meta ok">${UI_ICONS.check} ${escHtml(facts)}</span>` : ''}</div></div>`;
      }
    } else if (x.missing) {
      if (x.file && kind === 'folder') h += `<div class="pf-res"><span class="pf-hint">${escHtml(t('{path} is a file — this needs a folder.', { path: x.path }))}</span></div>`;
      else if (createMode === 'never') h += `<div class="pf-res"><span class="pf-hint">${escHtml(t('{path} does not exist.', { path: x.path }))}</span></div>`;
      else h += `<div class="pf-new${st.flash ? ' appear' : ''}"><div class="pf-q"><b>${escHtml(t('Does not exist — create it?'))}</b><code>${escHtml(x.path)}</code>${fromHTML()}${x.base && x.base !== 'home' && x.base !== 'abs' ? `<span class="pf-meta">(${escHtml(t('relative to {base}', { base: x.base }))})</span>` : ''}</div>`
        + (x.parentOk ? `<label class="pf-tickrow"><input type="checkbox" data-act="tick"${st.tick ? ' checked' : ''}> ${escHtml(o.createWhen || t('Create this folder'))}</label>` : `<span class="pf-bad">${escHtml(t('The folder above, {parent}, does not exist either — pick another, or press the folder button.', { parent: x.parent || '' }))}</span>`) + '</div>';
    } else if (!st.err && model().rows.length) {
      h += `<div class="pf-res"><span class="pf-hint">${escHtml(isPhone() ? t('No path called «{text}» — press a suggestion above.', { text }) : t('No path called «{text}» — choose a suggestion with ↑↓, Enter picks it.', { text }))}</span></div>`;
    } else if (!st.err && st.answered) {
      h += `<div class="pf-res"><span class="pf-hint">${escHtml(t('Nothing found — try other letters, or press the folder button.'))}</span></div>`;
    }
    return h;
  }
  function placeList() {
    if (!st.open || list.hidden) return;
    if (isPhone()) { if (list.parentNode !== wrap) wrap.insertBefore(list, under); list.classList.remove('pf-float'); list.style.cssText = ''; return; }
    if (list.parentNode !== document.body) { document.body.appendChild(list); ownFloat(list, wrap); }
    list.classList.add('pf-float');
    const a = row.getBoundingClientRect();
    const w = Math.max(a.width, 360);
    const vw = window.innerWidth; const vh = window.innerHeight;
    list.style.left = Math.max(8, Math.min(a.left, vw - w - 8)) + 'px';
    list.style.width = w + 'px';
    const below = vh - a.bottom - 10; const above = a.top - 10;
    if (below >= 220 || below >= above) { list.style.top = (a.bottom + 2) + 'px'; list.style.bottom = ''; list.style.maxHeight = Math.max(120, Math.min(360, below)) + 'px'; }
    else { list.style.top = ''; list.style.bottom = (vh - a.top + 2) + 'px'; list.style.maxHeight = Math.max(120, Math.min(360, above)) + 'px'; }
  }
  function paint() {
    if (st.destroyed) return;
    under.innerHTML = underHTML();
    if (st.open) {
      list.hidden = false;
      list.innerHTML = listHTML();
      placeList();
      list.querySelector('.pf-item.active')?.scrollIntoView?.({ block: 'nearest' });
    } else { list.hidden = true; }
    /* a press outside the field and its list closes the list (THE one outside-press closer, utils.js) */
    if (st.open && !st.outside) st.outside = onOutsidePress([wrap, list], () => { st.outside = null; close(); });
    else if (!st.open && st.outside) { st.outside(); st.outside = null; }
    input.setAttribute('aria-expanded', st.open ? 'true' : 'false');
    emitState();
    if (st.chipsAt) paintChips();   // a 新建 mark the machine's answer moved (keyed: nothing else repaints)
  }
  function open() { if (st.destroyed || st.open) return; st.open = true; st.active = -1; ask(); paint(); }
  function close() { if (!st.open) return; st.open = false; st.active = -1; paint(); }

  /* ── the chips row (New Session): 由名字 per selected group + home (PURE nameChips), then the day-one folders (src/day-one.js
     folderChips) — painted on refresh() (never at construction: no fetch while the page boots), again when an answer moves a
     新建 mark; a chip is the person's pick ── */
  const knownAbsent = (W, p) => {
    const L = W.L; if (L.dirs[p]) return false;
    if (W.asked && W.asked.has(p)) return true;   // asked, and not answered as a folder
    const up = L.dirs[parentOf(p)];
    return !!(up && Array.isArray(up.kids) && !up.kids.includes(baseName(p)));
  };
  function paintChips(force = false) {
    if (!chipsEl || st.destroyed) return;
    const h = hk(); const W = world(h);
    const inp = inputsNow();
    const names = nameChips(inp).map((n) => ({ ...n, isNew: n.isNew && knownAbsent(W, n.path) }));
    const key = JSON.stringify([h, inp.name, inp.groups.map((g) => [g.id, g.selected, g.folders]), inp.recent.map((r) => r.path), Object.keys(inp.listing.dirs).length > 0, names.map((n) => [n.path, n.isNew])]);
    if (!force && key === st.chipsAt) return;
    st.chipsAt = key;
    const home = h ? inp.listing.home : LOCAL.home;
    const task = inp.groups.filter((g) => g.selected).flatMap((g) => {
      const own = g.chips ? call(g.chips, null) : null;   // the door's own chips for this group (New Session: its folders + the sub-folders that hold sessions)
      return Array.isArray(own) ? own : g.folders.concat(g.context ? [g.context] : []).map((f) => ({ path: fromTilde(home, f), tip: t('Task Group folder ({name})', { name: g.name }), color: g.color }));
    });
    const recent = inp.recent.map((r) => fromTilde(home, r.path));
    const draw = (folders) => {
      if (!chipsEl.isConnected && !wrap.isConnected) return;
      paintFolderChips(chipsEl, folderChips({ folders, recent, task }), { onPick: (c) => set(c.path, { commit: true, how: 'set' }) });
      const first = chipsEl.firstChild;
      for (const n of names) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cwd-recent-chip cwd-name-chip'; b.dataset.path = fromTilde(home, n.path); b.dataset.kind = 'name';
        if (n.isNew) b.dataset.new = '1';
        b.title = whyText(n.why) + '\n' + b.dataset.path;
        if (n.group && n.group.color) { const dot = document.createElement('span'); dot.className = 'tvg-dot'; dot.style.setProperty('--g-color', n.group.color); b.appendChild(dot); }
        if (n.isNew) b.appendChild(Object.assign(document.createElement('span'), { className: 'cwd-chip-new', textContent: t('New') }));
        b.appendChild(document.createTextNode(n.path));
        b.onclick = () => { st.tick = !world(hk()).L.dirs[n.path]; set(n.path, { commit: true, how: 'pick' }); };   // a 新建 chip picked IS the consent (made at use)
        chipsEl.insertBefore(b, first);
      }
      sectionChips(chipsEl);
    };
    if (!h) { draw([]); loadHomeFolders().then((folders) => { if (folders.length && st.chipsAt === key) draw(folders); }); }
    else draw([]);
    probeNames(names.filter((n) => !inp.listing.dirs[n.path]).map((n) => n.path));
  }
  /* the 由名字 chips ask the machine about their own folders — never through ask(): the field's verdict and line stay still
     while the name is typed; once per path, when the name rests; the answer repaints the marks */
  function probeNames(paths) {
    const h = hk(); const W = world(h);
    clearTimeout(st.probeTimer);
    const want = paths.filter((p) => !(W.asked && Date.now() - (W.asked.get(p) || 0) < RECENT_TTL_MS)).slice(0, 12);   // asked again after a while (made elsewhere meanwhile?)
    if (!want.length || W.unreachable) return;
    st.probeTimer = setTimeout(() => {
      if (st.destroyed || hk() !== h) return;
      const go = () => fetchJson((h ? `/api/hosts/${encodeURIComponent(h)}/dir-complete` : '/api/dir-complete') + `?path=&bases=${encodeURIComponent('[]')}&probe=${encodeURIComponent(JSON.stringify(want))}&q=&kind=folder`).then((d) => {
        if (!d || !d.listing || st.destroyed) return;
        mergeListing(W.L, d.listing);
        if (d.listing.nondirs) Object.assign(W.L.nondirs = W.L.nondirs || {}, d.listing.nondirs);
        if (d.self) W.self = d.self;
        W.asked = W.asked || new Map(); for (const p of want) W.asked.set(p, Date.now());
        paintChips();
      }).catch(() => { });
      return !h && !LOCAL.home ? localHome().then(go) : go();
    }, PROBE_MS);
  }

  /* ── taking effect ── */
  function infoOf(path, extra) {
    const h = hk();
    return { path: abs(path), display: path, text: input.value, host: h || null, isFile: false, exists: true, create: false, via: { base: '', relative: false, kind: 'exact', alias: '' }, how: 'api', derived: !!derivedNow(), ...extra };
  }
  const bestOf = () => { const m = model(); const b = m.best || m.rows.find((r) => !r.isNew); return b && !b.isNew ? b.path : ''; };
  async function commit(how = 'api') {
    if (st.destroyed) return null;
    const text = textNow();
    st.err = ''; st.errBest = '';
    if (!text) { st.committed = null; paint(); return null; }
    if (!st.answered || st.answered.text !== text || st.answered.h !== hk()) { try { await ask(text, { force: true }); } catch { } }
    if (textNow() !== text) return st.committed;   // typed on while the machine answered
    const x = target(text);
    let info = null;
    if (x.ok) {
      const r = x.r;
      info = infoOf(r.path, { isFile: !!r.file, via: { base: r.base, relative: !!r.relative, kind: how === 'picker' ? 'picker' : how === 'pick' ? 'pick' : r.kind, alias: '' }, how });
    } else if (x.missing) {
      if (x.file && kind === 'folder') st.err = t('{path} is a file — this needs a folder.', { path: x.path });
      else if (createMode === 'never') st.err = t('{path} does not exist.', { path: x.path });
      else if (!x.parentOk) st.err = t('{path} does not exist, nor the folder above — pick another.', { path: x.path });
      else if (!st.tick) { st.err = t('{path} does not exist — tick «{create}» and leave the field, or pick another.', { path: x.path, create: o.createWhen || t('Create this folder') }); st.flash = true; }
      else info = infoOf(x.path, { exists: false, create: true, isFile: kind === 'file', via: { base: x.base, relative: !!(x.base && x.base !== 'home' && x.base !== 'abs'), kind: how === 'pick' ? 'pick' : 'exact', alias: '' }, how });
    } else {
      st.err = t('«{text}» is not a path (a few letters search) — nothing was set.', { text });
      st.errBest = bestOf();
    }
    if (info) { st.committed = info; paint(); try { o.onCommit?.(info); } catch (e) { console.warn('[path-field] onCommit', e); } }
    else { paint(); st.flash = false; }
    return info;
  }
  function set(text, { commit: c = true, how = 'set', derived = null } = {}) {
    input.value = String(text == null ? '' : text);
    st.derived = derived && input.value.trim() ? { text: input.value, note: String(derived.note || '') } : null;   // setDerived: the door's, not the person's
    st.err = ''; st.errBest = ''; st.answered = null;
    if (st.open) close(); else paint();
    if (c) return commit(how);
    ask();
    return Promise.resolve(null);
  }
  function pickRow(r, how) {
    if (!r) return;
    st.derived = null;
    const L = world(hk()).L;
    if (how === 'tab' && !r.file && L.dirs[r.path]) {
      input.value = r.path === '~' ? '~/' : r.path + '/';
      st.active = -1; st.err = ''; ask(); paint();
      return;
    }
    st.tick = !!r.isNew;
    st.flash = !!r.isNew;
    input.value = r.path;
    st.open = false; st.active = -1;
    commit('pick');
  }
  async function ensure() {
    const v = st.committed;
    if (!v) return false;
    if (!v.create || kind === 'file') return true;
    const r = await fetchJson('/api/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: v.path, host: v.host || undefined }) });
    if (!r || r.error) { st.err = t('Could not create {path}: {err}', { path: v.display, err: (r && r.error) || t('server unreachable') }); paint(); return false; }
    st.committed = { ...v, exists: true, create: false };
    const L = world(hk()).L; const par = parentOf(v.display);
    L.dirs[v.display] = { kids: [], fileCount: 0, mtime: Date.now() };
    if (par && L.dirs[par] && Array.isArray(L.dirs[par].kids) && !L.dirs[par].kids.includes(baseName(v.display))) L.dirs[par].kids.push(baseName(v.display));
    st.answered = null; paint();
    return true;
  }

  /* ── events ── */
  const onInput = (e) => {
    if (e && (e.isComposing || input._pfComposing)) return;
    st.err = ''; st.errBest = ''; st.derived = null;   // the person's text now
    const x = target(); if (!x.missing) st.tick = false;
    if (!st.open) st.open = true;
    st.active = -1;
    paint(); askSoon();
  };
  input.addEventListener('input', onInput);
  input.addEventListener('compositionstart', () => { input._pfComposing = true; });
  input.addEventListener('compositionend', () => { input._pfComposing = false; onInput(); });
  input.addEventListener('focus', () => { if (Date.now() - lastTabAt < TAB_OPENS_MS) open(); });
  input.addEventListener('pointerdown', () => { setTimeout(() => { if (document.activeElement === input) open(); }, 0); });
  input.addEventListener('keydown', (e) => {
    if (imeOwnsKey(e) || e.isComposing) return;
    const rows = st.open ? model().rows : [];
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!st.open) { open(); return; } st.active = Math.min(st.active + 1, rows.length - 1); paint(); return; }
    if (e.key === 'ArrowUp') { if (!st.open) return; e.preventDefault(); st.active = Math.max(st.active - 1, 0); paint(); return; }
    if (e.key === 'Escape') { if (st.open) { e.preventDefault(); close(); } return; }
    if (e.key === 'Enter') {
      if (st.open && st.active >= 0 && rows[st.active]) { e.preventDefault(); pickRow(rows[st.active], 'enter'); return; }
      st.open = false; st.active = -1; commit('enter');
      return;   // not prevented: a form's own Enter-to-submit still sees it (and awaits commit())
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      const text = textNow(); if (!text && !st.open) return;
      if (st.open && st.active >= 0 && rows[st.active]) { e.preventDefault(); pickRow(rows[st.active], 'tab'); return; }
      const x = target(text);
      if (x.ok && !x.r.file && (x.r.kind === 'complete' || (!text.endsWith('/') && world(hk()).L.dirs[x.r.path] && (world(hk()).L.dirs[x.r.path].kids || []).length))) {
        e.preventDefault(); input.value = (x.r.path === '~' ? '~' : x.r.path) + '/'; st.open = true; st.active = -1; st.err = ''; ask(); paint(); return;
      }
      if (st.open && rows.length) { e.preventDefault(); st.active = 0; paint(); return; }
    }
  });
  /* a press in the list / on the line never blurs the field first */
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => {
    const it = e.target.closest('.pf-item'); if (!it) return;
    pickRow(model().rows[Number(it.dataset.i)], 'pick');
    input.focus();
  });
  under.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  under.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'alt') { set(b.dataset.path, { commit: true, how: 'pick' }); return; }
    if (b.dataset.act === 'best' && st.errBest) { set(st.errBest, { commit: true, how: 'pick' }); return; }
  });
  under.addEventListener('change', (e) => {
    if (e.target.dataset.act !== 'tick') return;
    st.tick = !!e.target.checked;
    if (st.tick && st.err) commit('api'); else paint();
  });
  /* LEAVING the field commits it (a press in its own list / line / picker is not leaving) */
  const inside = (n) => !!n && (wrap.contains(n) || list.contains(n) || !!(n.closest && n.closest('.pf-picker')));
  wrap.addEventListener('focusout', () => {
    setTimeout(() => {
      if (st.destroyed || inside(document.activeElement) || st.picking) return;
      afterPointer(() => { if (st.destroyed || inside(document.activeElement)) return; st.open = false; st.active = -1; commit('blur'); });
    }, 150);
  });
  const onReflow = () => placeList();
  window.addEventListener('resize', onReflow);
  window.addEventListener('scroll', onReflow, true);

  /* ── THE PICKER (a dialog over the dialog) ── */
  const memKey = () => `vs-path-field-node:${fid}:${hk()}`;
  async function listNode(p) {
    const h = hk(); const W = world(h);
    const qs = `?path=${encodeURIComponent(p === '~' ? '~/' : p + '/')}&bases=${encodeURIComponent('[]')}&kind=file`;
    const d = await fetchJson((h ? `/api/hosts/${encodeURIComponent(h)}/dir-complete` : '/api/dir-complete') + qs);
    if (d && d.listing) { mergeListing(W.L, d.listing); W.L.machine = h || null; if (d.self) W.self = d.self; }
  }
  async function openPicker() {
    // lane dialog-yield r3: THE PRESS THAT ASKED, read before any await — a remote machine's home listing takes seconds, and
    // the picker opened over the New Session sheet is still the person's (it was opened BEHIND it at 1.5 s, unreachable)
    const from = pressToken();
    if (st.picker && st.picker.overlay.isConnected) { createModalShell({ kind: 'form', id: 'path-picker', key: fid, from }); return; }   // open already: Browse… raises it (the same id and key)
    if (st.picking) return;   // its listing is on its way: this press is the same ask
    st.picking = true; close();
    const h = hk(); const W = world(h);
    if (!W.L.home) await (h ? ask('', { force: true }) : localHome());
    const x = target();
    const K = { sel: null, open: new Set(['~']), q: '', mk: false };
    if (x.ok) K.sel = x.r.file ? parentOf(x.r.path) : x.r.path;
    else if (x.search) { const b = x.m.rows.find((r) => !r.isNew && !r.file); if (b) { K.q = textNow(); K.sel = b.path; } }
    if (!K.sel) { try { const m = localStorage.getItem(memKey()); if (m) K.sel = m; } catch { } }
    if (!K.sel) K.sel = (inputsNow().bases[0] || { path: '~' }).path;
    for (let q = K.sel; q && q.includes('/'); q = parentOf(q)) K.open.add(q);
    K.open.add(K.sel);
    const shell = createModalShell({ id: 'path-picker', key: fid, from, title: kind === 'file' ? t('Pick a file or folder') : t('Pick a folder'), dialogClass: 'pf-picker', escapeToClose: true, onClose: () => { st.picking = false; st.picker = null; input.focus(); }, kind: 'form' });
    if (shell.raised) { st.picking = false; return; }   // (this field's picker opened meanwhile: it is raised, its tree as it was)
    st.picker = shell;
    if (shell.placed === 'behind') st.picking = false;   // not where the person can reach it: the latch never leaves a dead Browse… (a press raises it)
    const { body, dialog } = shell;
    if (h) dialog.querySelector('.dialog-header h3').append(Object.assign(document.createElement('span'), { className: 'pf-pk-sub', textContent: ' · ' + hostName(h) }));
    body.innerHTML = `<div class="pf-pk-main"><div class="pf-pk-left"><div class="pf-pk-search">${UI_ICONS.search}<input type="text" class="pf-pk-q" placeholder="${escHtml(t('Search folders (a few letters anywhere in the path)'))}" autocomplete="off" spellcheck="false"></div><div class="pf-pk-tree"></div></div><div class="pf-pk-right"></div></div><div class="dialog-footer pf-pk-foot"></div>`;
    const qIn = body.querySelector('.pf-pk-q'); const treeEl = body.querySelector('.pf-pk-tree'); const rightEl = body.querySelector('.pf-pk-right'); const footEl = body.querySelector('.pf-pk-foot');
    qIn.value = K.q;
    const L = () => world(hk()).L;
    const kidsOf = (p) => (L().dirs[p] && L().dirs[p].kids || []).map((k) => (p === '~' ? '~/' + k : p === '/' ? '/' + k : p + '/' + k));
    const groupsSeen = () => inputsNow().groups;
    const groupOf = (p) => groupsSeen().find((g) => g.folders.includes(p) || g.context === p) || null;
    const badges = (p) => { const g = groupOf(p); const y = L().dirs[p] || {}; return (g ? `<span class="pf-badge">${g.color ? `<span class="tvg-dot" style="--g-color:${escHtml(g.color)}"></span>` : ''}${escHtml(g.context === p ? t('Shared notes') : g.name)}</span>` : '') + (y.git ? `<span class="pf-badge dim">${UI_ICONS.forkBranch} git</span>` : '') + (y.mount ? `<span class="pf-badge dim">${UI_ICONS.connect} ${escHtml(y.mount)}</span>` : ''); };
    const label = (p) => (p === '~' ? t('Home') : (L().localized || {})[p] || baseName(p));
    function treeHTML() {
      if (K.q.trim()) {
        const m = rankCandidates(K.q, { ...inputsNow(), name: '' });
        const rows = m.rows.filter((r) => !r.isNew);
        if (!rows.length) return `<div class="pf-empty">${escHtml(t('No folder called «{text}».', { text: K.q }))}</div>`;
        return `<div class="pf-pk-root">${escHtml(t('Search results · the same order as the field'))}</div>` + rows.map((r) => `<div class="pf-tn pin${K.sel === r.path ? ' sel' : ''}" data-sel="${escHtml(r.path)}">${r.file ? getFileIcon(baseName(r.path)) : r.mount ? UI_ICONS.connect : FILE_ICONS.folder}<span class="pf-path">${hl(r.path, r.hl)}</span><span class="pf-chip">${escHtml(chipText(r.chip).split(' · ')[0])}</span></div>`).join('');
      }
      const node = (p, depth) => {
        const y = L().dirs[p]; if (!y) return '';
        const kids = kidsOf(p).filter((k) => L().dirs[k] && (!W.self || !isExcludedPath(k, { home: L().home, roots: W.self.roots }) || groupOf(k)));   // never offered unasked: the checkout, its data dir, dot-folders
        const links = Object.entries(L().links || {}).filter(([lk]) => parentOf(lk) === p);
        const isOpen = K.open.has(p);
        const canOpen = !y.kids || kids.length || links.length;
        let s = `<div class="pf-tn${K.sel === p ? ' sel' : ''}" data-sel="${escHtml(p)}" style="padding-left:${4 + depth * 14}px"><span class="pf-tw" data-tog="${escHtml(p)}">${canOpen ? (isOpen ? UI_ICONS.chevronDown : UI_ICONS.chevronRight) : ''}</span>${y.mount ? UI_ICONS.connect : FILE_ICONS.folder}<span class="pf-tnm">${escHtml(label(p))}</span>${badges(p)}<span class="pf-tc">${y.fileCount ? escHtml(String(y.fileCount)) : ''}</span></div>`;
        if (isOpen) {
          s += kids.map((k) => node(k, depth + 1)).join('');
          s += links.map(([lk, tg]) => `<div class="pf-tn" data-sel="${escHtml(tg)}" style="padding-left:${18 + (depth + 1) * 14}px" title="${escHtml(t('A link to {path}', { path: tg }))}">${UI_ICONS.link}<span class="pf-tnm">${escHtml(baseName(lk))}</span><span class="pf-lk">→ ${escHtml(tg)}</span></div>`).join('');
        }
        return s;
      };
      let s = '';
      const pins = groupsSeen().flatMap((g) => g.folders.map((f) => [g, f, false]).concat(g.context ? [[g, g.context, true]] : []));
      if (pins.length) s += `<div class="pf-pk-root">${UI_ICONS.tasks} ${escHtml(h ? t('Task Group folders on {host}', { host: hostName(h) }) : t('Task Group folders'))}</div>` + pins.map(([g, f, c]) => `<div class="pf-tn pin${K.sel === f ? ' sel' : ''}" data-sel="${escHtml(f)}">${g.color ? `<span class="tvg-dot" style="--g-color:${escHtml(g.color)}"></span>` : ''}${FILE_ICONS.folder}<span class="pf-path">${escHtml(f)}</span><span class="pf-badge">${escHtml(c ? t('Shared notes') : g.name)}</span></div>`).join('');
      s += `<div class="pf-pk-root">${FILE_ICONS.folder} ${escHtml(t('Home'))} <i>${escHtml(L().home || '')}</i></div>` + node('~', 0);
      if ((L().mounts || []).length) s += `<div class="pf-pk-root">${UI_ICONS.connect} ${escHtml(t('Mounts'))}</div>` + L().mounts.map((m) => node(m, 0)).join('');
      return s;
    }
    function rightHTML() {
      const p = K.sel; const y = L().dirs[p] || {};
      const g = groupsSeen().find((gg) => gg.folders.some((f) => p === f || p.startsWith(f + '/')));
      const kids = kidsOf(p).filter((k) => L().dirs[k]);
      const rows = kids.map((k) => `<div class="pf-pv-row d" data-sel="${escHtml(k)}"><span class="pf-nm">${FILE_ICONS.folder}<span>${escHtml(baseName(k))}</span></span><span class="pf-sz">${L().dirs[k].fileCount != null ? escHtml(t('{n} files', { n: L().dirs[k].fileCount })) : ''}</span><span class="pf-md">${escHtml(whenWords(L().dirs[k].mtime))}</span></div>`).join('')
        + (y.files || []).slice(0, 40).map((f) => { const fp = (p === '~' ? '~/' : p + '/') + f.name; return `<div class="pf-pv-row${kind === 'file' ? ' d' : ''}${K.sel === fp ? ' sel' : ''}"${kind === 'file' ? ` data-file="${escHtml(fp)}"` : ''}><span class="pf-nm">${getFileIcon(f.name)}<span>${escHtml(f.name)}</span></span><span class="pf-sz">${escHtml(sizeWords(f.size))}</span><span class="pf-md">${escHtml(whenWords(f.mtime))}</span></div>`; }).join('');
      const more = y.files && y.fileCount > Math.min(40, y.files.length) ? `<div class="pf-pv-more">${escHtml(t('…and {n} more files', { n: y.fileCount - Math.min(40, y.files.length) }))}</div>` : '';
      return `<div class="pf-pv-head"><span class="pf-pt">${y.mount ? UI_ICONS.connect : FILE_ICONS.folder}${escHtml(label(p))}<span class="pf-sp"></span><button type="button" class="pf-link" data-act="mk">${UI_ICONS.plus} ${escHtml(t('New folder'))}</button></span>
        <span class="pf-pp">${escHtml(fromTilde(L().home, p))}</span>
        <span class="pf-pm">${escHtml(dirWords(L(), p))}${g ? ` <span class="pf-badge">${UI_ICONS.tasks}${escHtml(t('Task Group «{name}»', { name: g.name }))}</span>` : ''}${y.git ? ` <span class="pf-badge dim">${UI_ICONS.forkBranch} ${escHtml(t('git repository'))}</span>` : ''}</span>
        ${K.mk ? `<div class="pf-pv-mk"><input type="text" class="pf-mk-name" placeholder="${escHtml(t('Name of the new folder'))}" autocomplete="off" spellcheck="false"><button type="button" class="btn-create" data-act="mk-go">${escHtml(t('Create'))}</button><button type="button" class="btn-cancel" data-act="mk-x">${escHtml(t('Cancel'))}</button></div>` : ''}
        </div><div class="pf-pv-list">${rows || `<div class="pf-pv-more">${escHtml(y.kids ? t('No files here yet.') : t('Loading…'))}</div>`}${more}</div>`;
    }
    function footHTML() {
      return `<span class="pf-pk-l">${escHtml(t('Chosen:'))} <b>${escHtml(K.sel)}</b></span><span class="pf-pk-r"><button type="button" class="btn-cancel" data-act="cancel">${escHtml(t('Cancel'))}</button><button type="button" class="btn-create" data-act="go">${UI_ICONS.check} ${escHtml(kind === 'file' && !L().dirs[K.sel] ? t('Choose this file') : t('Choose this folder'))}</button></span>`;
    }
    const draw = () => { const sc = treeEl.scrollTop; treeEl.innerHTML = treeHTML(); treeEl.scrollTop = sc; rightEl.innerHTML = rightHTML(); footEl.innerHTML = footHTML(); };
    const select = async (p) => { K.sel = p; K.mk = false; draw(); if (!L().dirs[p] || !L().dirs[p].kids || (kind === 'file' && !L().dirs[p].files) || !L().dirs[p].files) { await listNode(p); if (K.sel === p) draw(); } };
    const toggle = async (p) => { if (K.open.has(p)) K.open.delete(p); else { K.open.add(p); if (!L().dirs[p] || !L().dirs[p].kids) await listNode(p); } draw(); };
    treeEl.addEventListener('click', (e) => {
      const tg = e.target.closest('[data-tog]'); if (tg) { e.stopPropagation(); toggle(tg.dataset.tog); return; }
      const n = e.target.closest('[data-sel]'); if (n) { const p = n.dataset.sel; if (!K.q.trim()) K.open.add(p); select(p); }
    });
    treeEl.addEventListener('dblclick', (e) => { const n = e.target.closest('[data-sel]'); if (n) { K.sel = n.dataset.sel; go(); } });
    rightEl.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-act]');
      if (a && a.dataset.act === 'mk') { K.mk = true; draw(); rightEl.querySelector('.pf-mk-name')?.focus(); return; }
      if (a && a.dataset.act === 'mk-x') { K.mk = false; draw(); return; }
      if (a && a.dataset.act === 'mk-go') { mkGo(); return; }
      const f = e.target.closest('[data-file]'); if (f) { K.sel = f.dataset.file; footEl.innerHTML = footHTML(); rightEl.querySelectorAll('.pf-pv-row.sel').forEach((x) => x.classList.remove('sel')); f.classList.add('sel'); return; }
      const d = e.target.closest('[data-sel]'); if (d) { K.open.add(K.sel); select(d.dataset.sel); }
    });
    rightEl.addEventListener('keydown', (e) => { if (e.target.classList.contains('pf-mk-name') && e.key === 'Enter' && !imeOwnsKey(e) && !e.isComposing) { e.preventDefault(); mkGo(); } });
    async function mkGo() {
      const inp = rightEl.querySelector('.pf-mk-name'); const nm = String(inp && inp.value || '').trim();
      if (!nm || /[\\/]/.test(nm) || nm === '.' || nm === '..') { inp?.focus(); return; }
      const dir = L().dirs[K.sel] ? K.sel : parentOf(K.sel);
      const np = (dir === '~' ? '~/' : dir + '/') + nm;
      const r = await fetchJson('/api/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fromTilde(L().home, np), host: hk() || undefined }) });
      if (!r || r.error) { const m2 = rightEl.querySelector('.pf-pv-mk'); if (m2) { const er = m2.querySelector('.pf-bad') || m2.appendChild(Object.assign(document.createElement('span'), { className: 'pf-bad' })); er.textContent = t('Could not create {path}: {err}', { path: np, err: (r && r.error) || t('server unreachable') }); } return; }
      K.open.add(dir); await listNode(dir); select(np);
    }
    footEl.addEventListener('click', (e) => { const a = e.target.closest('[data-act]'); if (!a) return; if (a.dataset.act === 'cancel') shell.close(); if (a.dataset.act === 'go') go(); });
    let qTimer = null;
    qIn.addEventListener('input', () => { if (qIn._c) return; K.q = qIn.value; clearTimeout(qTimer); draw(); qTimer = setTimeout(() => { const save = input.value; ask(K.q, { force: true }).then(() => { if (input.value === save) draw(); }); }, DEBOUNCE_MS); });
    qIn.addEventListener('compositionstart', () => { qIn._c = true; });
    qIn.addEventListener('compositionend', () => { qIn._c = false; qIn.dispatchEvent(new Event('input')); });
    function go() {
      try { localStorage.setItem(memKey(), L().dirs[K.sel] ? K.sel : parentOf(K.sel)); } catch { }
      const p = K.sel;
      st.picking = false;
      shell.close();
      st.tick = false;
      set(p, { commit: true, how: 'picker' });
    }
    draw();
    await Promise.all([listNode(K.sel), K.sel !== '~' ? listNode('~') : null, ...[...K.open].filter((p) => p !== K.sel && p !== '~').map(listNode)]);
    if (K.q) await ask(K.q, { force: true });
    draw();
    (K.q ? qIn : treeEl.querySelector('.pf-tn.sel:not(.pin)') || qIn)?.scrollIntoView?.({ block: 'center' });
    qIn.focus();
  }
  pickBtn?.addEventListener('click', (e) => { e.preventDefault(); openPicker(); });

  /* ── the handle ── */
  function refresh() { memo = { key: '', m: null }; st.answered = null; if (st.open) ask(); st.chipsAt = ''; paint(); paintChips(true); }   // the chips drawn once, forced
  function destroy() {
    st.destroyed = true; clearTimeout(st.timer); clearTimeout(st.probeTimer); st.ctl?.abort?.();
    st.outside?.(); st.outside = null;
    window.removeEventListener('resize', onReflow); window.removeEventListener('scroll', onReflow, true);
    input.removeEventListener('input', onInput);
    list.remove();
  }
  paint();   // the chips row waits for refresh() (a field is built while the page boots — no fetch then)
  const setDerived = (text, { note = '', commit: c = false } = {}) => set(text, { commit: c, how: 'derived', derived: { note } });
  const handle = { el: wrap, input, value: () => st.committed, verdict: () => { emitState(); return st.verdict; }, commit: () => commit('api'), set, setDerived, refresh, open, close, ensure, destroy };
  input._pathField = handle;
  return handle;
}

/** THE PALETTE'S /path (src/lib/session-palette.js): the same candidates for a typed path, without a field — this
 *  machine, the person's Task Groups offered, the recent folders. → Promise<[{ path, display, chip, isNew }]> (≤ limit) */
export async function pathSuggest(text, { limit = 8 } = {}) {
  installDocListeners();
  await localHome();
  const W = world('');
  const groups = appGroups([]).map((g) => ({ ...g, folders: g.folders.map((f) => (HOST_ROW.test(f) ? f : toTilde(LOCAL.home, stripSlash(f)))), context: g.context ? toTilde(LOCAL.home, stripSlash(g.context)) : null }));
  const by = new Map();
  for (const s of window.app?.sidebar?._allSessions || []) { if (!s || !s.cwd || s.host) continue; const c = by.get(s.cwd) || { path: toTilde(LOCAL.home, s.cwd), count: 0, last: 0 }; c.count++; const at = Number(s.startedAt || 0); if (at > c.last) c.last = at; by.set(s.cwd, c); }
  const recent = [...by.values()].sort((a, b) => b.last - a.last).map((r) => ({ path: r.path, count: r.count, when: whenWords(r.last) }));
  const inp = () => ({ bases: [{ path: '~', label: t('home') }], groups: groups.map((g) => groupOn(g, W.L)), recent, listing: W.L, name: '', machine: '', files: false, self: W.self });
  const q = String(text || '').trim();
  const d = await fetchJson(`/api/dir-complete?path=${encodeURIComponent(q)}&bases=${encodeURIComponent('["~"]')}&probe=${encodeURIComponent('[]')}&q=&kind=folder`);
  if (d && d.listing) { mergeListing(W.L, d.listing); if (d.self) W.self = d.self; }
  const m = rankCandidates(q, inp());
  const rows = m.resolved.map((r) => ({ path: r.path, chip: { key: 'dir', params: {} } })).concat(m.rows);
  const seen = new Set(); const out = [];
  for (const r of rows) { if (seen.has(r.path)) continue; seen.add(r.path); out.push({ path: fromTilde(LOCAL.home, r.path), display: r.path, chip: chipText(r.chip), isNew: !!r.isNew }); if (out.length >= limit) break; }
  if (!out.length && q) out.push({ path: fromTilde(LOCAL.home, q.startsWith('~') ? q : q), display: q, chip: '', isNew: true });
  return out;
}
