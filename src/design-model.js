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
 *   bundleCanvas / readBundle         the published page: our shell + the state block
 *                                     `<script type="application/json" id="vibespace-design-doc">` (every `<` escaped)
 *   sizeVerdict(bytes)                warn past 8 MB, refuse at 25 MB (the published-pages cap)
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
  top: Object.freeze(['title', 'pages', 'artboards', 'notes', 'launch']),
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
function validateManifest(input) {
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
  if (refusals.length) return { ok: false, refusals };
  return { ok: true, manifest: { title: title || '', pages, artboards, notes, launch } };
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
  const out = { hasHtml: false, hasBody: false, hasBase: false, refs: [] };
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
      else urlRefs(s, a.vs, a.ve, out.refs);
    }
    i = k + 1;
    if (RAW_TEXT.has(tag)) {
      const end = rawEnd(s, i, tag);
      if (tag === 'style') urlRefs(s, i, end, out.refs);
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
  bundleCanvas, readBundle, PLACEHOLDER_RUNTIME, sizeVerdict, readCapsVerdict,
};
