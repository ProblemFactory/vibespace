'use strict';
/**
 * THE DESIGN CANVAS MODEL — PURE (CJS, imports nothing; bundled into the client, required by the hub).
 * docs/design-design-window.md §3 (the contract shared by the hub and the window). VibeSpace's OWN canvas
 * (owner 2026-10-02: "我们直接自己复刻一个更好的版本"): an artboard is a plain, complete HTML document in the
 * conversation's working folder (`designs/<slug>/<Name>.html`), `design.json` places the artboards (optional),
 * images sit beside them and are referenced by name. No template language, no vendor runtime, no account.
 *
 *   validateManifest(json)            closed keys + bounds; refusals by NAME {code, where, why} — what a loader would drop
 *   layoutOf(manifest, names)         every frame placed: manifest rows as written, the rest auto-placed in rows
 *                                     (80 px between frames, 120 px between rows); overlaps WARNED, never moved
 *   artboardVerdict(name, html, opts) name grammar · ≤ 2 MiB · <html> + <body> · no <base> · every relative ref resolves
 *   inlineAssets(html, readAsset)     THE ONE bundler (the window's read AND publish): relative image refs → data: URIs
 *   elementPath(nodes) / pickQuote(q) the comment's quote line (`Main.html › header > nav > a.cta ("Get started")`)
 *   commentText(quote, text)          `[Design comment] <quote>: <text>` — the hub puts the WHOLE line through
 *                                     src/peer-text.js toAgentText at its one door (src/server/design-engine.js): the
 *                                     quoted element text is an artboard's, and an artboard may be another agent's
 *   validateQuestions(json)           ask first (lane design-ask): ≤ 8 questions {id, q, help?, kind, options, other?}, closed
 *                                     keys, refusals by NAME — what the questions sheet draws
 *   answersVerdict(questions, body)   the sheet's answers against the PENDING questions (an option is named by its index —
 *                                     its words are the agent's, never the wire's); a question left out = "decide for me"
 *   answersText(verdict)              `[Design answers] platform: iOS phone · variations: 2 · accent: decide for me` —
 *                                     composes only; THE belt is the hub's door, like commentText's
 *   changesVerdict(items) / changesText(items)  the changes strip's ONE message (lane design-changes, design 003 §2.2):
 *                                     ≤ 30 chips — a text edit, a style nudge (CHANGE_PROPS, styleValueOk) or a
 *                                     comment — → `[Design changes] N changes:` + one numbered line per chip; the
 *                                     engine's door belts the whole block (the same door as the comment)
 *   tweaks (validateManifest) / tweakSay  the free knobs (lane design-tweaks, design 003 §2 S4): the list's shape
 *                                     (≤ 12) and the frame fence's `design-tweak` word (tweakWordOk: a value that cannot
 *                                     close a style block). Each knob's rules — validateManifest(json, {tweaks}) — the
 *                                     user's layer and baking it in: src/design-user-layer.js, kept OUT of this file,
 *                                     which the published page's viewer bundles whole
 *   bundleCanvas / readBundle         the published page: our shell + the state block
 *                                     `<script type="application/json" id="vibespace-design-doc">` (every `<` escaped)
 *   sizeVerdict(bytes)                warn past 8 MB, refuse at 25 MB (the published-pages cap)
 *   (design systems, lane design-systems-home: design.json's `system: {name}` is validated here; the token check —
 *    tokens.css against the artboards — is src/design-tokens.js, the hub's alone: this file is bundled into the
 *    published page's viewer, whose size is budgeted)
 *
 * Every scan here is LINEAR in its input (a hand tokenizer, `indexOf`, sticky literal regexes — never a nested
 * quantifier over the raw HTML) and bounded by the caller's size verdict first: an artboard is agent-written text.
 * Gate: scripts/test-design-model.mjs.
 */

const MiB = 1024 * 1024;
const LIMITS = Object.freeze({
  artboardBytes: 2 * MiB, assetBytes: 2 * MiB, manifestChars: 256 * 1024,
  minSize: 120, maxSize: 8000, coord: 100000, noteMinW: 40, noteMaxW: 4000,
  artboards: 40, pages: 40, notes: 200, noteText: 5000, title: 120, pageName: 80,
  readBytes: 24 * MiB, warnBytes: 8 * MiB, refuseBytes: 25 * MiB,
  quoteText: 120, quotePath: 200, commentText: 4000,
  changes: 30, changeText: 500, changeComment: 1000, changeValue: 60,
  defaultW: 1280, defaultH: 800, gapRow: 80, gapRows: 120, rowMaxW: 8000,
});
const MANIFEST_FILE = 'design.json';
const ENTRY_FILE = 'Main.html';
const DOC_ID = 'vibespace-design-doc';
const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9 _.-]{0,80}\.html$/;
const ASSET_RE = /^[A-Za-z0-9_][A-Za-z0-9 _.-]{0,80}\.(png|jpe?g|gif|webp|svg)$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const IMAGE_TYPES = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' });
const NOTE_COLORS = Object.freeze(['gray', 'red', 'orange', 'green', 'teal', 'blue', 'purple', 'pink']);
const PRINT_MODES = Object.freeze(['fixed', 'flow']);
const KEYS = Object.freeze({
  top: Object.freeze(['title', 'pages', 'artboards', 'notes', 'launch', 'tweaks', 'system']),
  system: Object.freeze(['name']),   // lane design-systems-home: the design system this design follows (`new --system`)
  page: Object.freeze(['id', 'name']),
  artboard: Object.freeze(['file', 'x', 'y', 'w', 'h', 'title', 'page', 'print']),
  note: Object.freeze(['id', 'x', 'y', 'w', 'text', 'color', 'page']),
  launchCanvas: Object.freeze(['view', 'page']),
  launchFocused: Object.freeze(['view', 'file']),
});
/** The closed refusal vocabulary (a code is what a caller branches on; `why` is the sentence for a person / an agent). */
const CODES = Object.freeze([
  'bad_json', 'unknown_key', 'bad_type', 'out_of_range', 'too_many', 'too_long', 'bad_name', 'duplicate', 'unknown_page', 'bad_value', 'missing',
  'too_big', 'not_document', 'has_base', 'bad_ref', 'missing_asset', 'asset_too_big', 'empty',
  'no_doc', 'bad_doc', 'bad_manifest',
]);

const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** A string shown inside a sentence: one line, bounded (a key or a value from an untrusted file). */
const shown = (v, n = 60) => { const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
/** At most `max` UTF-16 units, ending in `…` when cut (never inside a surrogate pair). */
function cutText(s, max) {
  const t = String(s == null ? '' : s);
  if (t.length <= max) return t;
  let n = Math.max(0, max - 1);
  if (n > 0 && /[\uD800-\uDBFF]/.test(t.charAt(n - 1))) n -= 1;
  return t.slice(0, n) + '…';
}
/** UTF-8 byte length of a string (no Buffer — the client bundles this file). */
function utf8Bytes(s) {
  const t = String(s == null ? '' : s);
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < t.length && (t.charCodeAt(i + 1) & 0xFC00) === 0xDC00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
const isArtboardName = (n) => typeof n === 'string' && NAME_RE.test(n);
const isAssetName = (n) => typeof n === 'string' && ASSET_RE.test(n);
const stemOf = (file) => String(file || '').replace(/\.html$/i, '');
const mimeOf = (name) => IMAGE_TYPES[String(name || '').split('.').pop().toLowerCase()] || null;
function emptyManifest() { return { title: '', pages: [], artboards: [], notes: [], launch: { view: 'canvas' } }; }

// ── the manifest ────────────────────────────────────────────────────────────────────────────────────────────────────

/** `design.json` (a string or a parsed value) → {ok:true, manifest} | {ok:false, refusals:[{code, where, why}]}.
 *  Closed keys at every level: a key the loader would drop is refused BY NAME, never ignored. */
function validateManifest(input, { tweaks: tweaksOf = null } = {}) {
  const refusals = [];
  const no = (code, where, why) => { if (refusals.length < 50) refusals.push({ code, where, why }); };
  let j = input;
  if (typeof input === 'string') {
    if (input.length > LIMITS.manifestChars) return { ok: false, refusals: [{ code: 'too_big', where: MANIFEST_FILE, why: `design.json is over ${LIMITS.manifestChars / 1024} KB — it places artboards; the artboards hold the content` }] };
    try { j = JSON.parse(input); } catch (e) { return { ok: false, refusals: [{ code: 'bad_json', where: MANIFEST_FILE, why: `design.json is not valid JSON (${shown(e && e.message, 120)})` }] }; }
  }
  if (!isObj(j)) return { ok: false, refusals: [{ code: 'bad_json', where: MANIFEST_FILE, why: 'design.json must hold one JSON object ({"title": …, "artboards": […]})' }] };
  const closed = (o, keys, where, what) => { for (const k of Object.keys(o)) if (!keys.includes(k)) no('unknown_key', where ? `${where}.${shown(k, 40)}` : shown(k, 40), `unknown key "${shown(k, 40)}" — ${what} takes ${keys.join(', ')}`); };
  const str = (v, where, max, { required = false } = {}) => {
    if (v === undefined) { if (required) no('bad_type', where, `${where} is required (a string)`); return undefined; }
    if (typeof v !== 'string') { no('bad_type', where, `${where} must be a string`); return undefined; }
    if (v.length > max) { no('too_long', where, `${where} is ${v.length} characters — at most ${max}`); return undefined; }
    return v;
  };
  const num = (v, where, lo, hi, { required = false } = {}) => {
    if (v === undefined) { if (required) no('bad_type', where, `${where} is required (a number)`); return undefined; }
    if (!isNum(v)) { no('bad_type', where, `${where} must be a number`); return undefined; }
    if (v < lo || v > hi) { no('out_of_range', where, `${where} is ${v} — it must be between ${lo} and ${hi}`); return undefined; }
    return Math.round(v);
  };
  const arr = (v, where, max) => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) { no('bad_type', where, `${where} must be a list`); return []; }
    if (v.length > max) { no('too_many', where, `${where} holds ${v.length} — at most ${max}`); return v.slice(0, max); }
    return v;
  };
  closed(j, KEYS.top, '', 'design.json');
  const title = str(j.title, 'title', LIMITS.title);
  // pages
  const pages = [];
  const pageIds = new Set();
  arr(j.pages, 'pages', LIMITS.pages).forEach((p, i) => {
    const w = `pages[${i}]`;
    if (!isObj(p)) { no('bad_type', w, `${w} must be an object {"id", "name"}`); return; }
    closed(p, KEYS.page, w, 'a page');
    const id = typeof p.id === 'string' && ID_RE.test(p.id) ? p.id : null;
    if (!id) { no('bad_value', `${w}.id`, `${w}.id must be 1–40 letters, digits, _ or -`); return; }
    if (pageIds.has(id)) { no('duplicate', `${w}.id`, `page id "${id}" is used twice`); return; }
    pageIds.add(id);
    const name = str(p.name, `${w}.name`, LIMITS.pageName);
    pages.push({ id, name: name !== undefined ? name : id });
  });
  const pageRef = (v, where) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string' || !pageIds.has(v)) { no('unknown_page', where, `${where} names page "${shown(v, 40)}", which pages does not list`); return undefined; }
    return v;
  };
  // artboards
  const artboards = [];
  const files = new Set();
  arr(j.artboards, 'artboards', LIMITS.artboards).forEach((a, i) => {
    const w = `artboards[${i}]`;
    if (!isObj(a)) { no('bad_type', w, `${w} must be an object {"file", …}`); return; }
    closed(a, KEYS.artboard, w, 'an artboard row');
    if (!isArtboardName(a.file)) { no('bad_name', `${w}.file`, `${w}.file "${shown(a.file, 60)}" is not an artboard name — letters, digits, space, _ . - ending in .html`); return; }
    const low = a.file.toLowerCase();
    if (files.has(low)) { no('duplicate', `${w}.file`, `${a.file} is listed twice (names are unique ignoring case)`); return; }
    files.add(low);
    const row = { file: a.file };
    const hx = a.x !== undefined, hy = a.y !== undefined;
    if (hx !== hy) no('bad_value', `${w}.${hx ? 'y' : 'x'}`, `${w} gives ${hx ? 'x' : 'y'} without ${hx ? 'y' : 'x'} — give both, or neither (then it is placed in the row)`);
    else if (hx) { const x = num(a.x, `${w}.x`, -LIMITS.coord, LIMITS.coord), y = num(a.y, `${w}.y`, -LIMITS.coord, LIMITS.coord); if (x !== undefined && y !== undefined) { row.x = x; row.y = y; } }
    const ww = num(a.w, `${w}.w`, LIMITS.minSize, LIMITS.maxSize); if (ww !== undefined) row.w = ww;
    const hh = num(a.h, `${w}.h`, LIMITS.minSize, LIMITS.maxSize); if (hh !== undefined) row.h = hh;
    const t = str(a.title, `${w}.title`, LIMITS.title); if (t !== undefined) row.title = t;
    const pg = pageRef(a.page, `${w}.page`); if (pg !== undefined) row.page = pg;
    if (a.print !== undefined) { if (PRINT_MODES.includes(a.print)) row.print = a.print; else no('bad_value', `${w}.print`, `${w}.print must be "fixed" or "flow"`); }
    artboards.push(row);
  });
  // notes
  const notes = [];
  const noteIds = new Set();
  arr(j.notes, 'notes', LIMITS.notes).forEach((n, i) => {
    const w = `notes[${i}]`;
    if (!isObj(n)) { no('bad_type', w, `${w} must be an object {"id", "x", "y", "w", "text", …}`); return; }
    closed(n, KEYS.note, w, 'a note');
    const id = typeof n.id === 'string' && ID_RE.test(n.id) ? n.id : null;
    if (!id) { no('bad_value', `${w}.id`, `${w}.id must be 1–40 letters, digits, _ or -`); return; }
    if (noteIds.has(id)) { no('duplicate', `${w}.id`, `note id "${id}" is used twice`); return; }
    noteIds.add(id);
    const x = num(n.x, `${w}.x`, -LIMITS.coord, LIMITS.coord, { required: true });
    const y = num(n.y, `${w}.y`, -LIMITS.coord, LIMITS.coord, { required: true });
    const nw = num(n.w, `${w}.w`, LIMITS.noteMinW, LIMITS.noteMaxW, { required: true });
    const text = str(n.text, `${w}.text`, LIMITS.noteText, { required: true });
    let color = 'gray';
    if (n.color !== undefined) { if (NOTE_COLORS.includes(n.color)) color = n.color; else no('bad_value', `${w}.color`, `${w}.color must be one of ${NOTE_COLORS.join(' ')}`); }
    const pg = pageRef(n.page, `${w}.page`);
    if (x === undefined || y === undefined || nw === undefined || text === undefined) return;
    const note = { id, x, y, w: nw, text, color };
    if (pg !== undefined) note.page = pg;
    notes.push(note);
  });
  // launch
  let launch = { view: 'canvas' };
  if (j.launch !== undefined) {
    const l = j.launch;
    if (!isObj(l)) no('bad_type', 'launch', 'launch must be an object — {"view": "canvas", "page"?} or {"view": "focused", "file"}');
    else if (l.view === 'canvas') {
      closed(l, KEYS.launchCanvas, 'launch', 'a canvas launch');
      const pg = pageRef(l.page, 'launch.page');
      launch = pg !== undefined ? { view: 'canvas', page: pg } : { view: 'canvas' };
    } else if (l.view === 'focused') {
      closed(l, KEYS.launchFocused, 'launch', 'a focused launch');
      if (!isArtboardName(l.file)) no('bad_name', 'launch.file', `launch.file "${shown(l.file, 60)}" is not an artboard name`);
      else launch = { view: 'focused', file: l.file };
    } else no('bad_value', 'launch.view', 'launch.view must be "canvas" or "focused"');
  }
  // lane design-tweaks: the knobs' SHAPE here; each knob's rules are src/design-user-layer.js tweaksOf, which the hub
  // hands in (a reader without them — the published viewer, a bundle — keeps no knobs: their values are baked in)
  let tweaks = [];
  if (j.tweaks !== undefined) {
    if (!Array.isArray(j.tweaks)) no('bad_type', 'tweaks', 'tweaks must be a list of knobs [{"id", "label", "kind", "var" | "attr", "default"}]');
    else if (j.tweaks.length > TWEAK_LIMITS.tweakCount) no('too_many', 'tweaks', `tweaks holds ${j.tweaks.length} — at most ${TWEAK_LIMITS.tweakCount} (3–8 is the craft rule)`);
    else if (typeof tweaksOf === 'function') tweaks = tweaksOf(j.tweaks, no);
  }
  // system (lane design-systems-home): `{name}` — the design system this design follows; its tokens.css sits beside it
  let system = null;
  if (j.system !== undefined) {
    if (!isObj(j.system)) no('bad_type', 'system', 'system must be an object — {"name": "<the design system>"}');
    else {
      closed(j.system, KEYS.system, 'system', 'system');
      const nm = str(j.system.name, 'system.name', LIMITS.title, { required: true });
      if (nm !== undefined && !nm.trim()) no('empty', 'system.name', 'system.name is empty — name the design system (vibespace-design systems lists them)');
      else if (nm !== undefined) system = { name: nm };
    }
  }
  if (refusals.length) return { ok: false, refusals };
  return { ok: true, manifest: { title: title || '', pages, artboards, notes, launch, ...(tweaks.length ? { tweaks } : {}), ...(system ? { system } : {}) } };
}

// ── the layout ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every frame placed. Manifest rows first (as written; a row without x/y is placed like an unlisted artboard), then
 *  the artboards on disk the manifest does not list — Main.html first, the rest by name. `names` = the `.html` files the
 *  folder holds (null = unknown: nothing is `missing`). → {frames, warnings}; a frame carries `missing` (listed, not on
 *  disk) and `dup` (a case-insensitive twin of an earlier frame). Auto rows: 80 px between frames, a new row 120 px
 *  below past 8000 px of width, below every placed frame of the page. */
function layoutOf(manifest, names = null) {
  const m = manifest && Array.isArray(manifest.artboards) ? manifest : emptyManifest();
  const disk = Array.isArray(names) ? names.filter((n) => typeof n === 'string' && /\.html$/i.test(n)) : null;
  const onDisk = disk ? new Set(disk) : null;
  const firstPage = m.pages && m.pages.length ? m.pages[0].id : null;
  const frames = [];
  const seen = new Set();
  const add = (row, auto) => {
    const low = row.file.toLowerCase();
    const f = {
      file: row.file, x: auto ? null : row.x, y: auto ? null : row.y,
      w: row.w || LIMITS.defaultW, h: row.h || LIMITS.defaultH,
      title: row.title || stemOf(row.file), page: row.page !== undefined ? row.page : firstPage,
      print: row.print || 'fixed', placed: auto ? 'auto' : 'manifest',
      missing: !!onDisk && !onDisk.has(row.file), dup: seen.has(low),
    };
    seen.add(low);
    frames.push(f);
  };
  for (const row of m.artboards) add(row, !(isNum(row.x) && isNum(row.y)));
  if (disk) {
    const listed = new Set(m.artboards.map((r) => r.file));
    const extra = disk.filter((n) => !listed.has(n)).sort((a, b) => (a === ENTRY_FILE ? -1 : b === ENTRY_FILE ? 1 : a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : (a < b ? -1 : a > b ? 1 : 0)));
    for (const n of extra) add({ file: n }, true);
  }
  // auto placement, per page
  const byPage = new Map();
  for (const f of frames) { const k = f.page == null ? '' : f.page; if (!byPage.has(k)) byPage.set(k, []); byPage.get(k).push(f); }
  for (const list of byPage.values()) {
    const placed = list.filter((f) => f.placed === 'manifest');
    let y = placed.length ? Math.max(...placed.map((f) => f.y + f.h)) + LIMITS.gapRows : 0;
    let x = 0, bottom = y;
    for (const f of list) {
      if (f.placed !== 'auto') continue;
      if (x > 0 && x + f.w > LIMITS.rowMaxW) { y = bottom + LIMITS.gapRows; x = 0; }
      f.x = x; f.y = y;
      x += f.w + LIMITS.gapRow;
      bottom = Math.max(bottom, y + f.h);
    }
  }
  // overlaps: WARNED, never moved
  const warnings = [];
  for (let i = 0; i < frames.length; i++) {
    for (let k = i + 1; k < frames.length; k++) {
      const a = frames[i], b = frames[k];
      if ((a.page == null ? '' : a.page) !== (b.page == null ? '' : b.page)) continue;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        warnings.push({ code: 'overlap', where: b.file, why: `${b.file} overlaps ${a.file} — keep at least ${LIMITS.gapRow} px between frames (design.json x / y)` });
      }
    }
  }
  return { frames, warnings };
}

// ── one artboard ────────────────────────────────────────────────────────────────────────────────────────────────────

const isAlpha = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const isNameCh = (c) => isAlpha(c) || (c >= 48 && c <= 57) || c === 45 || c === 58 || c === 95;
const isSpaceC = (c) => c === 32 || c === 10 || c === 9 || c === 13 || c === 12;
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'noscript', 'iframe', 'noembed', 'noframes']);
// The walkers below read the text one code unit at a time (charCodeAt) — never a whole-string native from an offset
// inside a loop — so their work is the text's length, which the gate MEASURES (scripts/work-meter.mjs `linear`).
/** The first index ≥ i (and < end) of code unit `c`, or `end`. */
function seek(s, c, i, end) { while (i < end && s.charCodeAt(i) !== c) i++; return i; }
/** Does `s` hold the ASCII word `w` (lower case) at i, ignoring case? */
function wordAt(s, i, w) {
  if (i + w.length > s.length) return false;
  for (let k = 0; k < w.length; k++) { const c = s.charCodeAt(i + k); if ((c >= 65 && c <= 90 ? c + 32 : c) !== w.charCodeAt(k)) return false; }
  return true;
}
/** The end of a comment opened at i (`<!--`): the index past `-->`, or the end of the text. */
function commentEnd(s, i) {
  const n = s.length;
  for (let k = i + 4; k + 2 < n; k++) if (s.charCodeAt(k) === 45 && s.charCodeAt(k + 1) === 45 && s.charCodeAt(k + 2) === 62) return k + 3;
  return n;
}
/** The start of the closing tag of a raw-text element (`</script`), from i — or the end of the text. */
function rawEnd(s, i, tag) {
  const n = s.length;
  for (let k = i; k + 1 < n; k++) if (s.charCodeAt(k) === 60 && s.charCodeAt(k + 1) === 47 && wordAt(s, k + 2, tag)) return k;
  return n;
}

/** Every `url(…)` inside [from, to) of `s` → refs (value span WITHOUT its quotes). */
function urlRefs(s, from, to, refs) {
  for (let k = from; k + 3 < to; k++) {
    if (!wordAt(s, k, 'url(')) continue;
    let p = k + 4;
    while (p < to && isSpaceC(s.charCodeAt(p))) p++;
    const q = s.charCodeAt(p);
    let vs, ve;
    if (q === 34 || q === 39) { vs = p + 1; ve = seek(s, q, vs, to); }
    else { vs = p; ve = seek(s, 41, vs, to); while (ve > vs && isSpaceC(s.charCodeAt(ve - 1))) ve--; }
    refs.push({ kind: 'url', start: vs, end: ve, value: s.slice(vs, ve) });
    k = Math.max(k + 3, ve);
  }
}

/** A linear tag walk: which document elements exist and every reference the browser would resolve — `src="…"` on a
 *  tag, `url(…)` in a style attribute or a <style> block. Script bodies and comments are skipped (code is not markup). */
function scanHtml(html) {
  const s = String(html == null ? '' : html);
  const n = s.length;
  const out = { hasHtml: false, hasBody: false, hasBase: false, refs: [], css: [] };
  let i = 0;
  while (i < n) {
    const lt = seek(s, 60, i, n);
    if (lt >= n) break;
    if (s.charCodeAt(lt + 1) === 33 && s.charCodeAt(lt + 2) === 45 && s.charCodeAt(lt + 3) === 45) { i = commentEnd(s, lt); continue; }
    if (!isAlpha(s.charCodeAt(lt + 1))) { i = lt + 1; continue; }
    let j = lt + 1;
    while (j < n && isNameCh(s.charCodeAt(j))) j++;
    const tag = j - lt - 1 <= 16 ? s.slice(lt + 1, j).toLowerCase() : '';
    let k = j;
    const attrs = [];
    while (k < n && s.charCodeAt(k) !== 62) {
      const c = s.charCodeAt(k);
      if (c === 47 || isSpaceC(c)) { k++; continue; }
      const a = k;
      while (k < n) { const d = s.charCodeAt(k); if (isSpaceC(d) || d === 61 || d === 62 || d === 47) break; k++; }
      if (k === a) { k++; continue; }
      const nameLen = k - a;
      let p = k;
      while (p < n && isSpaceC(s.charCodeAt(p))) p++;
      if (s.charCodeAt(p) !== 61) { k = p; continue; }
      p++;
      while (p < n && isSpaceC(s.charCodeAt(p))) p++;
      let vs, ve;
      const q = s.charCodeAt(p);
      if (q === 34 || q === 39) { vs = p + 1; ve = seek(s, q, vs, n); k = ve < n ? ve + 1 : n; }
      else { vs = p; while (p < n) { const d = s.charCodeAt(p); if (isSpaceC(d) || d === 62) break; p++; } ve = p; k = p; }
      if (nameLen === 3 && wordAt(s, a, 'src')) attrs.push({ kind: 'src', vs, ve });
      else if (nameLen === 5 && wordAt(s, a, 'style')) attrs.push({ kind: 'style', vs, ve });
    }
    if (tag === 'html') out.hasHtml = true;
    else if (tag === 'body') out.hasBody = true;
    else if (tag === 'base') out.hasBase = true;
    for (const a of attrs) {
      if (a.kind === 'src') out.refs.push({ kind: 'src', start: a.vs, end: a.ve, value: s.slice(a.vs, a.ve) });
      else { urlRefs(s, a.vs, a.ve, out.refs); out.css.push([a.vs, a.ve]); }
    }
    i = k + 1;
    if (RAW_TEXT.has(tag)) {
      const end = rawEnd(s, i, tag);
      if (tag === 'style') { urlRefs(s, i, end, out.refs); out.css.push([i, end]); }
      i = end;
    }
  }
  return out;
}

/** One reference as written → {kind:'none'} (empty, a fragment) | {kind:'absolute'} (a scheme, `//host`) |
 *  {kind:'asset', name} (an image beside the artboard) | {kind:'bad', why}. */
function refOf(raw) {
  let v = String(raw == null ? '' : raw).trim();
  if (!v || v[0] === '#') return { kind: 'none' };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) || v.startsWith('//')) return { kind: 'absolute' };
  if (v[0] === '/' || v[0] === '\\') return { kind: 'bad', why: `"${shown(v)}" points at the VibeSpace server, not the design folder — name a file that sits beside the artboard (logo.png)` };
  while (v.startsWith('./')) v = v.slice(2);
  const q = v.search(/[?#]/);
  if (q >= 0) v = v.slice(0, q);
  let name = v;
  try { name = decodeURIComponent(v); } catch { /* the raw spelling */ }
  if (/[\\/]/.test(name)) return { kind: 'bad', why: `"${shown(v)}" is in another folder — put the image beside the artboard and name it alone (logo.png)` };
  if (isAssetName(name)) return { kind: 'asset', name };
  if (mimeOf(name)) return { kind: 'bad', why: `"${shown(name)}" is not a usable file name — letters, digits, space, _ . - (logo.png)` };
  return { kind: 'bad', why: `"${shown(name)}" is not an image the canvas inlines (png, jpg, jpeg, gif, webp, svg) — write scripts and styles inline in the artboard` };
}

/** An asset's size from what the caller holds: a number, or anything with a length / byteLength / size. */
function assetSize(v) {
  if (isNum(v)) return v;
  if (v && isNum(v.byteLength)) return v.byteLength;
  if (v && isNum(v.size)) return v.size;
  if (v && isNum(v.length)) return v.length;
  return null;
}
const assetGet = (assets, name) => (assets instanceof Map ? (assets.has(name) ? assets.get(name) : undefined) : (hasOwn(assets, name) ? assets[name] : undefined));

/** ONE artboard → {ok:true, bytes, assets:[names]} | {ok:false, code, why}. `assets` = what sits beside it (a Map or
 *  an object of name → size | bytes); `bytes` = the file's own byte size when the caller measured it. */
function artboardVerdict(name, html, { assets = null, bytes = null } = {}) {
  if (!isArtboardName(name)) return { ok: false, code: 'bad_name', why: `"${shown(name)}" is not an artboard name — letters, digits, space, _ . - ending in .html (at most 86 characters)` };
  const size = isNum(bytes) ? bytes : utf8Bytes(html);
  if (size > LIMITS.artboardBytes) return { ok: false, code: 'too_big', why: `${name} is ${(size / MiB).toFixed(1)} MB — an artboard is at most 2 MB (move images into files beside it)` };
  const scan = scanHtml(html);
  if (!scan.hasHtml || !scan.hasBody) return { ok: false, code: 'not_document', why: `${name} needs <html> and <body> — each artboard is one complete HTML document` };
  if (scan.hasBase) return { ok: false, code: 'has_base', why: `${name} has a <base> element — remove it: images resolve beside the artboard` };
  const used = [];
  for (const r of scan.refs) {
    const ref = refOf(r.value);
    if (ref.kind === 'bad') return { ok: false, code: 'bad_ref', why: `${name}: ${ref.why}` };
    if (ref.kind !== 'asset') continue;
    const a = assets ? assetGet(assets, ref.name) : undefined;
    if (a === undefined || a === null) return { ok: false, code: 'missing_asset', why: `${name} uses ${ref.name}, which is not in the design folder` };
    const sz = assetSize(a);
    if (sz !== null && sz > LIMITS.assetBytes) return { ok: false, code: 'asset_too_big', why: `${ref.name} is ${(sz / MiB).toFixed(1)} MB — an image is at most 2 MB` };
    if (!used.includes(ref.name)) used.push(ref.name);
  }
  return { ok: true, bytes: size, assets: used };
}

/** The image names an artboard references (for a reader that fetches only what is used). */
function assetRefsOf(html) {
  const out = [];
  for (const r of scanHtml(html).refs) { const ref = refOf(r.value); if (ref.kind === 'asset' && !out.includes(ref.name)) out.push(ref.name); }
  return out;
}

/** THE ONE BUNDLER: every relative image reference → a `data:` URI. `readAsset(name)` → the file's bytes as BASE64
 *  (a string) or null. → {html, inlined:[names], missing:[names]}; a missing image is left as written (the verdict
 *  names it). Only the value span is replaced — the quotes a reference was written with stay, so a style attribute
 *  keeps its delimiters (a base64 data URI holds no quote, space or parenthesis). */
function inlineAssets(html, readAsset) {
  const s = String(html == null ? '' : html);
  const refs = scanHtml(s).refs.slice().sort((a, b) => a.start - b.start);
  const memo = new Map();
  const inlined = [], missing = [];
  let out = '', at = 0;
  for (const r of refs) {
    const ref = refOf(r.value);
    if (ref.kind !== 'asset' || r.start < at) continue;
    if (!memo.has(ref.name)) {
      let b64 = null;
      try { b64 = typeof readAsset === 'function' ? readAsset(ref.name) : null; } catch { b64 = null; }
      memo.set(ref.name, typeof b64 === 'string' && /^[A-Za-z0-9+/=\s]*$/.test(b64) ? `data:${mimeOf(ref.name)};base64,${b64.replace(/\s+/g, '')}` : null);
    }
    const uri = memo.get(ref.name);
    if (!uri) { if (!missing.includes(ref.name)) missing.push(ref.name); continue; }
    if (!inlined.includes(ref.name)) inlined.push(ref.name);
    out += s.slice(at, r.start) + uri;
    at = r.end;
  }
  return { html: out + s.slice(at), inlined, missing };
}

// ── the comment ─────────────────────────────────────────────────────────────────────────────────────────────────────

const cleanIdent = (v) => String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 40);
/** An element's path from the facts of its ancestors (root first): `{tag, id?, classes?}` each → `header > nav > a.cta`
 *  (html / body dropped; an id wins over classes; at most two classes; the last six steps, `… > ` when cut). */
function elementPath(nodes) {
  const parts = [];
  for (const nd of Array.isArray(nodes) ? nodes.slice(-64) : []) {
    const tag = cleanIdent(nd && nd.tag).toLowerCase();
    if (!tag || tag === 'html' || tag === 'body') continue;
    const id = cleanIdent(nd.id);
    let p = tag;
    if (id) p += '#' + id;
    else {
      const raw = Array.isArray(nd.classes) ? nd.classes : String(nd.classes || '').split(/\s+/);
      const cls = raw.slice(0, 8).map(cleanIdent).filter(Boolean).slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
    }
    parts.push(p);
  }
  const s = (parts.length > 6 ? '… > ' : '') + parts.slice(-6).join(' > ');
  return cutText(s, LIMITS.quotePath);
}
/** The comment's quote line from a pick (every field is the frame's — untrusted, bounded here):
 *  `Main.html › header > nav > a.cta ("Get started")`. */
function pickQuote(q) {
  const o = isObj(q) ? q : {};
  const file = isArtboardName(o.file) ? o.file : 'artboard';
  let p = String(o.path == null ? '' : o.path).slice(0, 1000).replace(/[^A-Za-z0-9_#.\- >…]+/g, '').replace(/\s+/g, ' ').trim();
  p = cutText(p, LIMITS.quotePath);
  if (!p) p = cleanIdent(o.tag).toLowerCase() || 'element';
  // a "[Design comment]" head INSIDE an element's text (an artboard may be another agent's) is softened: the line's head is ours alone
  const text = cutText(String(o.text == null ? '' : o.text).slice(0, 4000).replace(/\s+/g, ' ').replace(/\[(design comment)\]/gi, '($1)').trim(), LIMITS.quoteText);
  return `${file} › ${p}${text ? ` ("${text}")` : ''}`;
}
/** The user's comment text → {ok:true, text} | {ok:false, code, why}. */
function commentVerdict(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, code: 'empty', why: 'write what should change' };
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (t.length > LIMITS.commentText) return { ok: false, code: 'too_long', why: `a comment is at most ${LIMITS.commentText} characters` };
  return { ok: true, text: t };
}
/** The line the agent receives as the user's own message. COMPOSES only — the hub's one door belts the whole line. */
function commentText(quote, text) {
  const q = typeof quote === 'string' ? quote : pickQuote(quote);
  const t = cutText(String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim(), LIMITS.commentText);
  return `[Design comment] ${q}: ${t}`;
}

// ── ask first: the questions form (lane design-ask — design 003 §2 S1) ──────────────────────────────────────────────

const ASK_LIMITS = Object.freeze({ questions: 8, optionCount: 8, question: 200, help: 400, option: 80, other: 500, input: 64 * 1024 });
const QUESTION_KEYS = Object.freeze(['id', 'q', 'help', 'kind', 'options', 'other']);
const ANSWER_KEYS = Object.freeze(['picks', 'other', 'decide']);
const QUESTION_KINDS = Object.freeze(['one', 'many']);
/** One line of words (the agent's question, the user's "Other…"): controls folded to a space, hidden characters
 *  dropped, runs of space to one. */
/** Characters that reorder a line or are not drawn (bidi overrides / isolates, zero-width, soft hyphen, BOM, fillers) — the
 *  sheet must draw the agent's words in the order the agent reads them back (v1's quote-line rule, design-canvas-model
 *  HIDDEN_RE; design-joint verify r1). */
const ASK_HIDDEN = /[\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufffb]/g;
const oneLine = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(ASK_HIDDEN, '').replace(/\s+/g, ' ').trim();
/** Our heads stay ours: a `[Design answers]` / `[Design comment]` inside a piece is softened to parentheses. */
const softenHeads = (s) => s.replace(/\[(design (?:answers|comment))\]/gi, '($1)');

/** `vibespace-design ask`'s JSON (a string or a parsed value: a list, or `{"questions": [...]}`) → {ok:true, questions}
 *  | {ok:false, refusals:[{code, where, why}]}. At most 8 questions `{id, q, help?, kind: one|many, options: [≤ 8],
 *  other?}`; closed keys, every refusal BY NAME. `kind` defaults to one; `other` to true (every question ends in "Decide
 *  for me" and "Other…") — false drops "Other…", and then the question needs options. */
function validateQuestions(input) {
  const refusals = [];
  const no = (code, where, why) => { if (refusals.length < 50) refusals.push({ code, where, why }); };
  let j = input;
  if (typeof input === 'string') {
    if (input.length > ASK_LIMITS.input) return { ok: false, refusals: [{ code: 'too_big', where: 'questions', why: `the questions are over ${ASK_LIMITS.input / 1024} KB — ask at most ${ASK_LIMITS.questions} short questions` }] };
    try { j = JSON.parse(input); } catch (e) { return { ok: false, refusals: [{ code: 'bad_json', where: 'questions', why: `the questions are not valid JSON (${shown(e && e.message, 120)})` }] }; }
  }
  if (isObj(j)) {
    for (const k of Object.keys(j)) if (k !== 'questions') no('unknown_key', shown(k, 40), `unknown key "${shown(k, 40)}" — the form takes {"questions": [...]}`);
    j = j.questions;
  }
  if (!Array.isArray(j)) return { ok: false, refusals: [...refusals, { code: 'bad_type', where: 'questions', why: 'the questions must be a list [{"id", "q", "kind", "options"}, …]' }] };
  if (!j.length) return { ok: false, refusals: [...refusals, { code: 'empty', where: 'questions', why: 'ask at least one question' }] };
  if (j.length > ASK_LIMITS.questions) no('too_many', 'questions', `${j.length} questions — ask at most ${ASK_LIMITS.questions} (3–6 is the craft rule)`);
  const ids = new Set();
  const questions = [];
  j.slice(0, ASK_LIMITS.questions).forEach((x, i) => {
    const w = `questions[${i}]`;
    if (!isObj(x)) { no('bad_type', w, `${w} must be an object {"id", "q", "kind", "options"}`); return; }
    for (const k of Object.keys(x)) if (!QUESTION_KEYS.includes(k)) no('unknown_key', `${w}.${shown(k, 40)}`, `unknown key "${shown(k, 40)}" — a question takes ${QUESTION_KEYS.join(', ')}`);
    const id = typeof x.id === 'string' && ID_RE.test(x.id) ? x.id : null;
    if (!id) { no('bad_value', `${w}.id`, `${w}.id must be 1–40 letters, digits, _ or -`); return; }
    if (ids.has(id)) { no('duplicate', `${w}.id`, `question id "${id}" is used twice`); return; }
    ids.add(id);
    let bad = false;
    const words = (v, where, max, required) => {
      if (v === undefined && !required) return '';
      if (typeof v !== 'string') { no('bad_type', where, `${where} must be a string`); bad = true; return ''; }
      const s = oneLine(v);
      if (!s && required) { no('empty', where, `${where} is empty`); bad = true; return ''; }
      if (s.length > max) { no('too_long', where, `${where} is ${s.length} characters — at most ${max}`); bad = true; return ''; }
      return s;
    };
    const q = words(x.q, `${w}.q`, ASK_LIMITS.question, true);
    const help = words(x.help, `${w}.help`, ASK_LIMITS.help, false);
    let kind = 'one';
    if (x.kind !== undefined) { if (QUESTION_KINDS.includes(x.kind)) kind = x.kind; else { no('bad_value', `${w}.kind`, `${w}.kind must be "one" or "many"`); bad = true; } }
    let other = true;
    if (x.other !== undefined) { if (typeof x.other === 'boolean') other = x.other; else { no('bad_type', `${w}.other`, `${w}.other must be true or false`); bad = true; } }
    const options = [];
    const seen = new Set();
    if (x.options !== undefined && !Array.isArray(x.options)) { no('bad_type', `${w}.options`, `${w}.options must be a list of strings`); bad = true; }
    const raw = Array.isArray(x.options) ? x.options : [];
    if (raw.length > ASK_LIMITS.optionCount) { no('too_many', `${w}.options`, `${w}.options holds ${raw.length} — at most ${ASK_LIMITS.optionCount}`); bad = true; }
    raw.slice(0, ASK_LIMITS.optionCount).forEach((o, k) => {
      const s = words(o, `${w}.options[${k}]`, ASK_LIMITS.option, true);
      if (!s) return;
      if (seen.has(s.toLowerCase())) { no('duplicate', `${w}.options[${k}]`, `option "${shown(s)}" is offered twice`); bad = true; return; }
      seen.add(s.toLowerCase());
      options.push(s);
    });
    if (!bad && !options.length && !other) { no('missing', `${w}.options`, `${w} offers nothing to pick — give options, or leave "other" on so the user can write an answer`); bad = true; }
    if (!bad) questions.push(help ? { id, q, help, kind, options, other } : { id, q, kind, options, other });
  });
  return refusals.length ? { ok: false, refusals } : { ok: true, questions };
}

/** The sheet's answers against the PENDING questions → {ok:true, skip, answers:[{id, picks:[words], other, decide}]} |
 *  {ok:false, code, why}. `{skip:true}` = decide everything; else `answers: {<id>: {picks:[index], other:"…",
 *  decide:true}}` — an index names one of the agent's own options (an option's words never come from the wire); a
 *  question left out, or answered with nothing, = "decide for me". */
function answersVerdict(questions, body) {
  const qs = Array.isArray(questions) ? questions : [];
  const b = isObj(body) ? body : {};
  if (b.skip === true) return { ok: true, skip: true, answers: qs.map((q) => ({ id: q.id, picks: [], other: '', decide: true })) };
  const a = b.answers === undefined || b.answers === null ? {} : b.answers;
  if (!isObj(a)) return { ok: false, code: 'bad_type', why: 'answers must be an object {"<question id>": {"picks": [index], "other": "…", "decide": true}}' };
  for (const k of Object.keys(a)) if (!qs.some((q) => q.id === k)) return { ok: false, code: 'unknown_key', why: `"${shown(k, 40)}" is not one of the questions` };
  const out = [];
  for (const q of qs) {
    const x = hasOwn(a, q.id) ? a[q.id] : null;
    if (x === null || x === undefined) { out.push({ id: q.id, picks: [], other: '', decide: true }); continue; }
    if (!isObj(x)) return { ok: false, code: 'bad_type', why: `the answer to "${q.id}" must be an object` };
    for (const k of Object.keys(x)) if (!ANSWER_KEYS.includes(k)) return { ok: false, code: 'unknown_key', why: `the answer to "${q.id}" has an unknown key "${shown(k, 40)}" — it takes ${ANSWER_KEYS.join(', ')}` };
    const picks = x.picks === undefined ? [] : x.picks;
    if (!Array.isArray(picks) || picks.length > q.options.length || picks.some((i) => !Number.isInteger(i) || i < 0 || i >= q.options.length) || new Set(picks).size !== picks.length) return { ok: false, code: 'bad_value', why: `the answer to "${q.id}" picks an option the question does not offer` };
    if (x.other !== undefined && typeof x.other !== 'string') return { ok: false, code: 'bad_type', why: `the written answer to "${q.id}" must be text` };
    if (x.decide !== undefined && typeof x.decide !== 'boolean') return { ok: false, code: 'bad_type', why: `"decide" on "${q.id}" must be true or false` };
    const other = oneLine(x.other);
    if (other.length > ASK_LIMITS.other) return { ok: false, code: 'too_long', why: `the written answer to "${q.id}" is ${other.length} characters — at most ${ASK_LIMITS.other}` };
    if (other && !q.other) return { ok: false, code: 'bad_value', why: `"${q.id}" takes no written answer` };
    const n = picks.length + (other ? 1 : 0);
    if (x.decide === true && n) return { ok: false, code: 'bad_value', why: `the answer to "${q.id}" both picks and leaves it to the agent` };
    if (q.kind === 'one' && n > 1) return { ok: false, code: 'bad_value', why: `"${q.id}" takes one answer` };
    out.push({ id: q.id, picks: picks.slice().sort((m, k) => m - k).map((i) => q.options[i]), other, decide: n === 0 });
  }
  return { ok: true, skip: false, answers: out };
}

/** The line the agent receives as the user's own message (answersVerdict's result):
 *  `[Design answers] platform: iOS phone · variations: 2 · accent: decide for me`. COMPOSES only — the hub's one door
 *  belts the whole line (the options are the agent's words, an "Other…" answer the user's). */
function answersText(verdict) {
  const v = isObj(verdict) ? verdict : {};
  if (v.skip) return '[Design answers] skipped — decide everything yourself';
  const parts = (Array.isArray(v.answers) ? v.answers : []).map((a) => {
    const said = (Array.isArray(a.picks) ? a.picks : []).map((p) => softenHeads(oneLine(p)));
    if (a.other) said.push(`"${softenHeads(oneLine(a.other))}"`);
    return `${cleanIdent(a.id) || 'question'}: ${a.decide || !said.length ? 'decide for me' : said.join(', ')}`;
  });
  return `[Design answers] ${parts.length ? parts.join(' · ') : 'decide for me'}`;
}

// ── the changes strip (lane design-changes) ─────────────────────────────────────────────────────────────────────────
/** THE CLOSED SET of what a style nudge may touch (the popover's four: text colour, background, font size, spacing). */
const CHANGE_PROPS = Object.freeze(['color', 'background-color', 'font-size', 'padding']);
const CHANGE_EDITS = Object.freeze(['text', 'style', 'comment']);
/** A value a nudge may SET: a colour is `#rrggbb` (what an <input type=color> says), a size `<0–400>px`. */
function styleValueOk(prop, v) {
  if (typeof v !== 'string') return false;
  if (prop === 'color' || prop === 'background-color') return /^#[0-9a-fA-F]{6}$/.test(v);
  if (prop === 'font-size') return /^[0-9]{1,3}px$/.test(v) && +v.slice(0, -2) >= 1 && +v.slice(0, -2) <= 400;
  if (prop === 'padding') return /^[0-9]{1,3}px$/.test(v) && +v.slice(0, -2) <= 400;
  return false;
}
/** One inline piece of a change line: one line, bounded, and a head of ours inside it softened. */
const piece = (v, max) => cutText(String(v == null ? '' : v).slice(0, 4 * max + 64).replace(/\s+/g, ' ').replace(/\[(design [a-z]+)\]/gi, '($1)').trim(), max);
/** A computed CSS value a frame reported (`rgb(17, 24, 39)`, `16px`, `8px 16px`) — its characters only. */
const cssValue = (v) => piece(String(v == null ? '' : v).slice(0, 400).replace(/[^A-Za-z0-9#.,()% -]+/g, ''), LIMITS.changeValue);
/** The strip's chips → {ok:true, items} (each bounded, the closed sets kept) | {ok:false, code, why, index}. */
function changesVerdict(items) {
  if (!Array.isArray(items) || !items.length) return { ok: false, code: 'empty', why: 'add at least one change' };
  if (items.length > LIMITS.changes) return { ok: false, code: 'too_many', why: `at most ${LIMITS.changes} changes go in one message — send these, then the rest` };
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const bad = (code, why) => ({ ok: false, code, why: `change ${i + 1}: ${why}`, index: i });
    if (!isObj(it)) return bad('bad_change', 'not an object');
    if (!CHANGE_EDITS.includes(it.edit)) return bad('bad_change', `"${shown(it.edit, 20)}" is not a change kind (${CHANGE_EDITS.join(', ')})`);
    const row = { edit: it.edit, file: isArtboardName(it.file) ? it.file : 'artboard', path: String(it.path == null ? '' : it.path).slice(0, 1000), tag: cleanIdent(it.tag).toLowerCase(), text: piece(it.text, LIMITS.quoteText) };
    if (it.edit === 'text') {
      row.from = piece(it.from, LIMITS.changeText);
      row.to = piece(it.to, LIMITS.changeText);
      if (row.from === row.to) return bad('no_change', 'the text is the same before and after');
    } else if (it.edit === 'style') {
      if (!CHANGE_PROPS.includes(it.prop)) return bad('bad_change', `"${shown(it.prop, 30)}" is not a property a nudge may touch (${CHANGE_PROPS.join(', ')})`);
      if (!styleValueOk(it.prop, it.to)) return bad('bad_change', `"${shown(it.to, 30)}" is not a ${it.prop} value (a #rrggbb colour or a size in px)`);
      row.prop = it.prop; row.from = cssValue(it.from); row.to = it.to;
    } else {
      const c = typeof it.comment === 'string' ? it.comment.replace(/\r\n?/g, '\n').trim() : '';
      if (!c) return bad('empty', 'write what should change');
      if (c.length > LIMITS.changeComment) return bad('too_long', `a comment in a list of changes is at most ${LIMITS.changeComment} characters`);
      row.comment = piece(c, LIMITS.changeComment);
    }
    out.push(row);
  }
  return { ok: true, items: out };
}
/** One chip's line: the element named as a comment's quote names it, then what changes. */
function changeLine(it) {
  const o = isObj(it) ? it : {};
  if (o.edit === 'text') return `${pickQuote({ file: o.file, path: o.path, tag: o.tag })}: text ${JSON.stringify(piece(o.from, LIMITS.changeText))} → ${JSON.stringify(piece(o.to, LIMITS.changeText))}`;
  const q = pickQuote({ file: o.file, path: o.path, tag: o.tag, text: o.text }).replace(/\[(design [a-z]+)\]/gi, '($1)');
  if (o.edit === 'style') return `${q}: ${CHANGE_PROPS.includes(o.prop) ? o.prop : 'style'} ${cssValue(o.from) || '(unset)'} → ${cssValue(o.to)}`;
  return `${q}: ${piece(o.comment, LIMITS.changeComment)}`;
}
/** The message the agent receives as the user's own: `[Design changes] N changes:` + one numbered line per chip.
 *  COMPOSES only (from `changesVerdict`'s items) — the hub's one door belts the whole block. */
function changesText(items) {
  const list = (Array.isArray(items) ? items : []).slice(0, LIMITS.changes);
  return `[Design changes] ${list.length} change${list.length === 1 ? '' : 's'}:\n` + list.map((it, i) => `${i + 1}. ${changeLine(it)}`).join('\n');
}

// ── Tweaks: the free knobs (lane design-tweaks — design 003 §2 S4) ──────────────────────────────────────────────────
// The agent DECLARES knobs in design.json (`tweaks`) and writes its CSS to read them: ONE custom property on :root
// (`var: "--accent"`) or ONE data attribute on the root element (`attr: "data-density"`) each. The owner moves them in
// the window's Tweaks panel; the hub keeps the values in `user.json` (THE USER'S LAYER) and bakes them into what it
// serves. Each knob's rules, the user's layer and the baking live in src/design-user-layer.js (the hub hands its
// `tweaksOf` to validateManifest): THIS file is bundled whole into the published page's viewer, so only the list's
// shape and the frame fence's word live here.

const USER_FILE = 'user.json';
const TWEAK_LIMITS = Object.freeze({ tweakCount: 12, wordChars: 80 });
const TWEAK_HIDDEN = new RegExp(ASK_HIDDEN.source);
const TWEAK_BAD = /[\u0000-\u001f\u007f-\u009f\u2028\u2029<>{};\\`!]/;
const isTweakVar = (v) => typeof v === 'string' && /^--[A-Za-z_][A-Za-z0-9_-]{0,39}$/.test(v);
/** A root data attribute — never our own marker's name (`data-vibespace-…`). */
const isTweakAttr = (v) => typeof v === 'string' && /^data-[a-z][a-z0-9-]{0,39}$/.test(v) && !v.startsWith('data-vibespace');
/** A word a tweak writes into CSS (`--x: <word>`) or a root attribute (an option, a colour, a number with its unit): one
 *  line, at most 80 characters, no markup or rule / declaration delimiter (`< > { } ;`), no escape, comment or `!` (the
 *  importance is ours), no hidden character, quotes closed — it cannot close the style block, end its declaration or
 *  swallow the next one. */
function tweakWordOk(v) {
  if (typeof v !== 'string' || !v.trim() || v.length > TWEAK_LIMITS.wordChars || TWEAK_BAD.test(v) || v.includes('/*') || v.includes('*/') || TWEAK_HIDDEN.test(v)) return false;
  let q = 0;
  for (let i = 0; i < v.length; i++) { const c = v.charCodeAt(i); if (q) { if (c === q) q = 0; } else if (c === 34 || c === 39) q = c; }
  return q === 0;
}
/** The canvas's word to a frame for one knob (design-canvas-model.js frameSay): ONE custom property or ONE root data
 *  attribute, a value of the tweak grammar → the bounded message, or null. */
function tweakSay(msg) {
  if (!isObj(msg) || msg.kind !== 'design-tweak' || !tweakWordOk(msg.value)) return null;
  if (isTweakVar(msg.var) && msg.attr === undefined) return { kind: 'design-tweak', var: msg.var, value: msg.value };
  if (isTweakAttr(msg.attr) && msg.var === undefined) return { kind: 'design-tweak', attr: msg.attr, value: msg.value };
  return null;
}
/** The walker pieces src/design-user-layer.js finds the root and head tags with (one walker, never a twin). */
const WALK = Object.freeze({ seek, commentEnd, rawEnd, isAlpha, isNameCh, RAW_TEXT });

// ── the published page ──────────────────────────────────────────────────────────────────────────────────────────────

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DOC_OPEN = `<script type="application/json" id="${DOC_ID}">`;
/** The runtime a page carries until the window lane's standalone viewer is built (public/design-viewer.js): the
 *  artboards in a column, each in a script-only sandboxed frame at its own size. */
const PLACEHOLDER_RUNTIME = '(function(){var el=document.getElementById(' + JSON.stringify(DOC_ID) + '),root=document.getElementById("vibespace-design-root"),d;'
  + 'try{d=JSON.parse(el.textContent)}catch(e){root.textContent="This design could not be read.";return}'
  + 'var h=document.createElement("h1");h.textContent=d.title||"Design";h.style.cssText="font:600 18px system-ui,sans-serif;margin:16px";root.appendChild(h);'
  + 'var rows=(d.manifest&&d.manifest.artboards)||[],files=d.files||{},order=[];rows.forEach(function(r){if(files[r.file]!=null&&order.indexOf(r.file)<0)order.push(r.file)});'
  + 'Object.keys(files).sort().forEach(function(n){if(order.indexOf(n)<0)order.push(n)});'
  + 'order.forEach(function(n){var r=rows.filter(function(x){return x.file===n})[0]||{};var c=document.createElement("div");c.textContent=r.title||n.replace(/\\.html$/,"");'
  + 'c.style.cssText="font:13px system-ui,sans-serif;margin:16px 16px 4px";root.appendChild(c);var f=document.createElement("iframe");f.setAttribute("sandbox","allow-scripts");'
  + 'f.title=c.textContent;f.srcdoc=files[n];f.style.cssText="display:block;border:1px solid #ccc;margin:0 16px 16px;background:#fff;width:"+(r.w||1280)+"px;height:"+(r.h||800)+"px";root.appendChild(f)})})();';

/** The published page: our shell, the state block `{v:1, title, manifest, files:{<name>: inlined html}}` with every
 *  `<` escaped, then the runtime (its own `</script` and `<!--` escaped). Only artboard-named string files ride. */
function bundleCanvas({ manifest = null, files = null, runtimeJs = '' } = {}) {
  const mv = manifest ? validateManifest(manifest) : { ok: true, manifest: emptyManifest() };
  const m = mv.ok ? mv.manifest : emptyManifest();
  const f = {};
  for (const k of Object.keys(files || {}).sort()) if (isArtboardName(k) && typeof files[k] === 'string') f[k] = files[k];
  const title = m.title || 'Design';
  const json = JSON.stringify({ v: 1, title, manifest: m, files: f }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const js = (String(runtimeJs || '').trim() || PLACEHOLDER_RUNTIME).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<meta name="generator" content="VibeSpace design"><title>${escHtml(title)}</title>\n`
    + `${DOC_OPEN}\n${json}\n</script>\n`
    + '</head><body><div id="vibespace-design-root"></div>\n'
    + `<script>${js}</script>\n</body></html>\n`;
}

/** The inverse: a published page → {ok:true, doc:{title, manifest, files}} | {ok:false, code, why}. */
function readBundle(html) {
  const s = String(html == null ? '' : html);
  const open = s.indexOf(DOC_OPEN);
  if (open < 0) return { ok: false, code: 'no_doc', why: 'this page carries no VibeSpace design' };
  const start = open + DOC_OPEN.length;
  const end = s.indexOf('</script>', start);
  if (end < 0) return { ok: false, code: 'bad_doc', why: 'the design block is not closed' };
  let doc;
  try { doc = JSON.parse(s.slice(start, end)); } catch (e) { return { ok: false, code: 'bad_doc', why: `the design block is not JSON (${shown(e && e.message, 80)})` }; }
  if (!isObj(doc) || doc.v !== 1 || !isObj(doc.files)) return { ok: false, code: 'bad_doc', why: 'the design block is not a VibeSpace design (v 1)' };
  const mv = validateManifest(doc.manifest === undefined ? {} : doc.manifest);
  if (!mv.ok) return { ok: false, code: 'bad_manifest', why: mv.refusals[0].why, refusals: mv.refusals };
  const files = {};
  for (const k of Object.keys(doc.files)) {
    if (!isArtboardName(k) || typeof doc.files[k] !== 'string') return { ok: false, code: 'bad_doc', why: `the design block holds "${shown(k)}", which is not an artboard` };
    files[k] = doc.files[k];
  }
  return { ok: true, doc: { title: typeof doc.title === 'string' ? doc.title : mv.manifest.title, manifest: mv.manifest, files } };
}

// ── sizes ───────────────────────────────────────────────────────────────────────────────────────────────────────────

const mb = (b) => (b / MiB).toFixed(1);
/** A published page's size: warn past 8 MB, refuse at 25 MB (the published-pages cap). */
function sizeVerdict(bytes) {
  const b = Number(bytes) || 0;
  if (b >= LIMITS.refuseBytes) return { ok: false, code: 'too_big', bytes: b, why: `${mb(b)} MB — a published design must stay under 25 MB (shrink or remove images)` };
  if (b > LIMITS.warnBytes) return { ok: true, warn: true, bytes: b, why: `${mb(b)} MB — over 8 MB: it publishes, but it loads slowly` };
  return { ok: true, warn: false, bytes: b };
}
/** One read of a folder: at most 40 artboards and 24 MB. → {ok:true} | {ok:false, code:'too_big', why}. */
function readCapsVerdict({ artboards = 0, bytes = 0 } = {}) {
  if (artboards > LIMITS.artboards) return { ok: false, code: 'too_big', why: `the folder holds ${artboards} artboards — one design shows at most ${LIMITS.artboards} (split it into two designs)` };
  if (bytes > LIMITS.readBytes) return { ok: false, code: 'too_big', why: `the design is ${mb(bytes)} MB — one read is at most ${LIMITS.readBytes / MiB} MB (shrink or remove images)` };
  return { ok: true };
}

module.exports = {
  LIMITS, CODES, KEYS, NOTE_COLORS, PRINT_MODES, IMAGE_TYPES, MANIFEST_FILE, ENTRY_FILE, DOC_ID, NAME_RE, ASSET_RE,
  isArtboardName, isAssetName, stemOf, mimeOf, utf8Bytes, cutText, emptyManifest,
  validateManifest, layoutOf, scanHtml, refOf, artboardVerdict, assetRefsOf, inlineAssets,
  elementPath, pickQuote, commentVerdict, commentText,
  ASK_LIMITS, validateQuestions, answersVerdict, answersText,
  CHANGE_PROPS, CHANGE_EDITS, styleValueOk, changesVerdict, changeLine, changesText,
  USER_FILE, TWEAK_LIMITS, isTweakVar, isTweakAttr, tweakWordOk, tweakSay, oneLine, WALK,
  bundleCanvas, readBundle, PLACEHOLDER_RUNTIME, sizeVerdict, readCapsVerdict,
};
