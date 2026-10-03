#!/usr/bin/env node
// THE DESIGN CANVAS (lane design-window L2, 2026-10-02; SharedContext/vibespace-design-window-design.md §3.5) — FAST,
// PURE: no server, no browser. The Design window and the published page's standalone runtime draw through ONE canvas
// core (src/lib/design-canvas.js) whose every decision is a rule of src/lib/design-canvas-model.js, tabled here; the
// pick channel's fence (an artboard is agent-written HTML inside the owner's logged-in page) is a census over the
// sources and a functional run of the picker under a mini DOM.
//
//   ① the view — clampZoom, the zoom ladder, zoomAt keeps the anchor, pinchView, fitView, focusView
//   ② the world — framesOf (= the hub's validateManifest + layoutOf, imported since int201), pagesOf / pageOf, notesOn,
//      launchOf
//   ③ what the hub's read and a published page carry — normalizeRead (every spelling + every failure LOUD), normalizeDoc
//   ④ THE PICK FENCE — pickFence (closed kinds, bounded fields, the frame names the file), routeMessage (the source IS
//      one of the canvas's frames, by identity), quoteLine (the composer's read-only line = the hub's pickQuote)
//   ④b THE PICKER, run — src/lib/design-pick.js's injected source under a mini DOM: it obeys only its PARENT's
//      design-mode, a click while picking is swallowed and named (the hub's elementPath grammar, bounded), Escape, the
//      message it sends passes the canvas's fence unchanged; a census of every kind it sends / listens to
//   ⑤ the frame documents — headInsertAt / frameSrcdoc (the picker FIRST, a bounded head window — never a regex over
//      the artboard), printCss / printSrcdoc
//   ⑥ wiring pins — the canvas core: sandbox="allow-scripts" ONLY (no allow-same-origin anywhere in the design
//      sources), ONE message listener through routeMessage on the caller's signal, no App / utils / i18n import
//   ⑦ the model imports ONE module — the hub's PURE src/design-model.js — and touches no DOM
//   ⑧ controls — a patched copy of each rule (scripts/mutant-copy.mjs) turns its table red
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const T0 = Date.now();
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_REL = 'src/lib/design-canvas-model.js';
const MODEL = path.join(REPO, MODEL_REL);
const M = await import(pathToFileURL(MODEL).href);
const { createRequire: createReq } = await import('node:module');
const DM = createReq(import.meta.url)(path.join(REPO, 'src/design-model.js'));
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sortKeys = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])])) : o);

// Each rule's table is a FUNCTION of the module so a patched copy runs the same rows: [actual, expected, name].
const FOREIGN = { name: 'another window' };
const TABLES = {
  zoom: (m) => [
    [m.clampZoom(0), 1, 'zoom 0 is no zoom (identity), never a collapsed world'],
    [m.clampZoom(NaN), 1, 'NaN ⇒ 1'],
    [m.clampZoom(0.001), m.ZOOM_MIN, 'below the floor clamps to ZOOM_MIN'],
    [m.clampZoom(99), m.ZOOM_MAX, 'above the ceiling clamps to ZOOM_MAX'],
    [m.zoomStep(1, +1), 1.25, '100% → + → 125%'],
    [m.zoomStep(1, -1), 0.75, '100% → − → 75%'],
    [m.zoomStep(0.8, +1), 1, '80% (between rungs) → + → 100%, the next rung up'],
    [m.zoomStep(0.8, -1), 0.75, '80% → − → 75%, the next rung down'],
    [m.zoomStep(m.ZOOM_MAX, +1), m.ZOOM_MAX, 'the top rung stays'],
    [m.zoomStep(m.ZOOM_MIN, -1), m.ZOOM_MIN, 'the bottom rung stays'],
    [m.zoomPercent(0.333), '33%', 'the zoom label'],
  ],
  zoomAt: (m) => {
    const v0 = { x: 30, y: -50, z: 0.5 }, anchor = { x: 400, y: 300 };
    const w0 = m.toWorld(v0, anchor);
    const v1 = m.zoomAt(v0, 2, anchor);
    const w1 = m.toWorld(v1, anchor);
    const s = m.toScreen(v1, w0);
    return [
      [v1.z, 2, 'zoomAt sets the zoom'],
      [near(w0.x, w1.x) && near(w0.y, w1.y), true, 'the world point under the anchor is the same before and after'],
      [near(s.x, anchor.x) && near(s.y, anchor.y), true, '…and it is drawn at the anchor'],
      [m.zoomAt(v0, 99, anchor).z, m.ZOOM_MAX, 'a zoom past the ceiling is clamped, the anchor rule kept'],
      [eq(m.panBy({ x: 1, y: 2, z: 1 }, 10, -5), { x: 11, y: -3, z: 1 }), true, 'panBy moves the view by the screen delta'],
    ];
  },
  pinch: (m) => {
    const v = m.pinchView({ x: 0, y: 0, z: 1 }, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 250, y: 100 });
    const p = m.pinchView({ x: 0, y: 0, z: 1 }, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 130, y: 120 }, { x: 230, y: 120 });
    return [
      [near(v.z, 2), true, 'two fingers twice as far apart ⇒ zoom ×2'],
      [near(m.toScreen(v, { x: 150, y: 100 }).x, 150), true, 'the midpoint stays under the fingers'],
      [near(p.z, 1) && near(p.x, 30) && near(p.y, 20), true, 'the same spread moved ⇒ a pan by the midpoint\'s travel'],
    ];
  },
  fitView: (m) => {
    const b = { x: 0, y: 0, w: 2000, h: 1000 }, pane = { w: 1080, h: 680 };
    const v = m.fitView(b, pane);
    const tl = m.toScreen(v, { x: 0, y: 0 }), br = m.toScreen(v, { x: 2000, y: 1000 });
    const small = m.fitView({ x: 100, y: 100, w: 200, h: 100 }, pane);
    return [
      [near(v.z, (1080 - 2 * m.FIT_PAD) / 2000), true, 'the wide world fits the pane\'s width minus the pad on both sides'],
      [near(tl.x, m.FIT_PAD) && near(br.x, 1080 - m.FIT_PAD), true, 'left and right edges land on the pads'],
      [near((tl.y + br.y) / 2, 340), true, 'centred vertically'],
      [small.z, 1, 'a lone small artboard is shown at its own size (never blown up past 100%)'],
      [eq(m.fitView(null, pane), { x: m.FIT_PAD, y: m.FIT_PAD, z: 1 }), true, 'an empty world ⇒ the identity at the pad'],
      [eq(m.fitView(b, { w: 0, h: 0 }), { x: m.FIT_PAD, y: m.FIT_PAD, z: 1 }), true, 'a pane with no size yet (hidden window) ⇒ the identity, never NaN'],
      [eq(m.boundsOf([{ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 20, w: 10, h: 10 }, { x: 'x' }]), { x: -5, y: 0, w: 15, h: 30 }), true, 'boundsOf skips a malformed rect'],
    ];
  },
  focusView: (m) => {
    const r = { x: 1360, y: 0, w: 1280, h: 3000 };
    const f = m.focusView(r, { w: 672, h: 500 });
    const tall = m.focusView({ x: 0, y: 0, w: 390, h: 844 }, { w: 1000, h: 4000 });
    return [
      [near(f.view.z, (672 - 2 * m.FOCUS_PAD) / 1280), true, 'fit-width: the pane minus the pad on both sides over the artboard'],
      [near(m.toScreen(f.view, { x: 1360, y: 0 }).x, m.FOCUS_PAD) && near(m.toScreen(f.view, { x: 1360, y: 0 }).y, m.FOCUS_PAD), true, 'its top-left at the pad'],
      [f.frameH, Math.floor((500 - 2 * m.FOCUS_PAD) / f.view.z), 'an artboard taller than the pane takes the pane\'s height — its document scrolls inside'],
      [tall.view.z, 2, 'a phone artboard in a big pane: fit-width capped at 2×'],
      [tall.frameH, 844, '…and a short artboard keeps its own height'],
    ];
  },
  framesOf: (m) => {
    const man = { pages: [{ id: 'p1', name: 'Flows' }, { id: 'p2', name: 'Two' }], artboards: [
      { file: 'Main.html', x: 0, y: 0, w: 1280, h: 800, title: 'Home', page: 'p1', print: 'flow' },
      { file: 'Pricing.html', w: 390, h: 844 },
      { file: 'Gone.html', x: 2000, y: 0, page: 'p2' },
      { file: 'Side.html', x: 9, y: 9 },
    ] };
    const names = ['Main.html', 'Pricing.html', 'Side.html', 'main.html', 'About.html', 'Zeta.html', 'logo.png'];
    const fr = m.framesOf(man, names);
    const by = Object.fromEntries(fr.map((f) => [f.file, f]));
    const row = m.framesOf({}, ['B.html', 'Main.html', 'A.html']);
    const wide = m.framesOf({}, ['A.html', 'B.html', 'C.html', 'D.html', 'E.html', 'F.html', 'G.html']);
    const outOfBounds = m.framesOf({ artboards: [{ file: 'A.html', x: 0, y: 0, w: 50, h: 99999 }] }, ['A.html'])[0];
    const badName = m.framesOf({ artboards: [{ file: 'Main.html', x: 500, y: 500 }, { file: '../evil.html', x: 0, y: 0 }] }, ['Main.html']);
    return [
      [fr.map((f) => f.file).join(','), 'Main.html,Pricing.html,Gone.html,Side.html,About.html,main.html,Zeta.html', 'manifest rows in order, then the unlisted artboards (Main.html first, then by name); an image is no artboard'],
      [eq(fr, DM.layoutOf(DM.validateManifest(man).manifest, names.filter(DM.isArtboardName)).frames), true, 'framesOf IS the hub\'s layoutOf over the hub\'s validated manifest — the same frames, field for field (int201: the twin became the import)'],
      [eq([by['Main.html'].x, by['Main.html'].y, by['Main.html'].title, by['Main.html'].print, by['Main.html'].placed], [0, 0, 'Home', 'flow', 'manifest']), true, 'a placed row is drawn where the manifest says, with its title and print mode'],
      [eq([by['Pricing.html'].placed, by['Pricing.html'].page, by['Pricing.html'].w], ['auto', 'p1', 390]), true, 'a row without x / y is auto-placed on the first page at its own size'],
      [by['Pricing.html'].y, 9 + 800 + 120, 'auto rows start 120 px below the page\'s placed frames (the lowest is Side.html at y 9)'],
      [by['Gone.html'].missing && by['Gone.html'].page === 'p2', true, 'listed but not in the folder ⇒ missing (drawn as a refusal)'],
      [by['main.html'].dup, true, 'a case-insensitive twin is marked dup'],
      [by['About.html'].x, 390 + 80, 'the next auto frame sits 80 px to the right'],
      [row.map((f) => f.file).join(','), 'Main.html,A.html,B.html', 'no manifest: Main.html first, then by name'],
      [eq(row.map((f) => [f.x, f.y, f.page]), [[0, 0, ''], [1360, 0, ''], [2720, 0, '']]), true, 'in one row, 80 px apart, at the default 1280 px, on the one unnamed page'],
      [wide.find((f) => f.file === 'G.html').y, 800 + 120, 'past 8000 px a new row starts 120 px below'],
      [eq([outOfBounds.placed, outOfBounds.w, outOfBounds.h], ['auto', 1280, 800]), true, 'a manifest out of bounds (w 50) is refused whole and laid out WITHOUT it — the hub\'s read does the same, never half-applied'],
      [eq(badName.map((f) => [f.file, f.x, f.y, f.placed]), [['Main.html', 0, 0, 'auto']]), true, 'a manifest naming a path outside the folder is refused whole: no frame for it, and none of its rows applied'],
      [m.framesOf({ artboards: [{ file: 'A.html', x: 0, y: 0 }] }, null)[0].missing, false, 'names unknown ⇒ nothing is missing'],
    ];
  },
  pages: (m) => {
    const man = { pages: [{ id: 'p1', name: 'One' }, { id: 'p2' }, { id: 'p1', name: 'dup' }, { id: '' }], notes: [
      { id: 'n1', x: 0, y: -160, w: 320, text: 'Direction A: calm', color: 'blue', page: 'p1' },
      { id: 'n2', x: 0, y: 0, w: 1, text: 'x'.repeat(9000), color: 'chartreuse', page: 'p2' },
      { id: 'n3', x: 'bad', y: 0, w: 100, text: 'no' },
      { id: 'n4', x: 5, y: 5, w: 100, text: 'first page by default' },
    ] };
    const ps = m.pagesOf(man);
    const n2 = m.notesOn(man, 'p2', ps)[0];
    return [
      [eq(ps, [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'p2' }]), true, 'pages: a duplicate / empty id dropped, a nameless page named by its id'],
      [eq(m.pagesOf({}), [{ id: '', name: '' }]), true, 'no pages ⇒ ONE unnamed page'],
      [m.pageOf({ page: 'nope' }, ps), 'p1', 'a frame naming an unknown page goes to the first page'],
      [m.notesOn(man, 'p1', ps).map((n) => n.id).join(','), 'n1,n4', 'notes on a page (a note naming no page is on the first; a malformed one dropped)'],
      [n2.text.length === 5000 && n2.color === 'gray' && n2.w === 40, true, 'a note is bounded: text 5000, an unknown colour gray, width ≥ 40'],
      [Object.keys(m.NOTE_COLOR_VARS).join(','), m.NOTE_COLORS.join(','), 'every named colour maps to a theme token'],
      [Object.values(m.NOTE_COLOR_VARS).every((v) => /^(var\(--|color-mix\()/.test(v) && !/#[0-9a-f]{3,8}(?![^(]*\))/i.test(v.replace(/var\(--[\w-]+, #[0-9a-f]+\)/gi, ''))), true, 'the note colours are theme vars (a literal only as a var() fallback)'],
      [eq(m.launchOf({ launch: { view: 'focused', file: 'B.html' } }, [{ file: 'B.html' }], ps), { view: 'focused', file: 'B.html' }), true, 'launch focused on a frame that exists'],
      [eq(m.launchOf({ launch: { view: 'focused', file: 'Nope.html' } }, [{ file: 'B.html' }], ps), { view: 'canvas', page: 'p1' }), true, 'launch focused on a frame that does not exist ⇒ the canvas'],
      [eq(m.launchOf({ launch: { view: 'canvas', page: 'p2' } }, [], ps), { view: 'canvas', page: 'p2' }), true, 'launch on a page'],
    ];
  },
  normalizeRead: (m) => {
    const list = m.normalizeRead({ ok: true, title: 'Spring', manifest: { title: 'Spring', artboards: [{ file: 'Main.html', x: 0, y: 0 }] },
      artboards: [{ file: 'Main.html', html: '<html><body>a</body></html>', ok: true }, { file: 'Bad.html', ok: false, code: 'has_base', why: 'a <base> tag would move every relative link' }, { file: '../x.html', html: 'x' }], warnings: [{ code: 'overlap', why: 'B overlaps A' }], readAt: 1700000000000 });
    const map = m.normalizeRead({ manifest: {}, files: { 'Main.html': '<p>m</p>', 'logo.png': 'iVBOR' } });
    const hub = m.normalizeRead({ manifest: {}, frames: [{ file: 'A.html', x: 7, y: 8, w: 300, h: 200, placed: 'auto' }], artboards: [{ file: 'A.html', html: 'a' }] });
    const verdict = m.normalizeRead({ manifest: {}, artboards: [{ file: 'A.html', html: 'a', verdict: { ok: false, code: 'bad_ref', why: 'logo.png is not in the folder' } }] });
    const bad = m.normalizeRead({ ok: false, refusals: [{ code: 'unknown_key', where: 'artboards[0].colour', why: 'unknown key "colour"' }] });
    return [
      [eq(list.frames.map((f) => [f.file, !!f.html, f.refused && f.refused.code]), [['Main.html', true, null], ['Bad.html', false, 'has_base']]), true, 'a list read: an artboard with its html, a refused one with its verdict BY NAME (a bad name never enters)'],
      [list.title === 'Spring' && list.readAt === 1700000000000 && list.warnings[0].code === 'overlap', true, 'title, readAt and the hub\'s warnings carried'],
      [eq(map.frames.map((f) => f.file), ['Main.html']), true, 'a map read: only artboard names become frames'],
      [eq([hub.frames[0].x, hub.frames[0].y, hub.frames[0].w], [7, 8, 300]), true, 'the hub\'s own placement wins over the reader\'s twin'],
      [verdict.frames[0].refused.code === 'bad_ref' && verdict.frames[0].html === null, true, 'a `verdict` record refuses the frame'],
      [bad.error && bad.error.code === 'unknown_key' && /colour/.test(bad.error.why) && bad.error.refusals.length === 1, true, 'a refused manifest is an error naming the key'],
      [m.normalizeRead(null).error.code, 'unreachable', 'no answer (fetchJson null: the server or the route is not there) ⇒ unreachable, never an empty canvas'],
      [m.normalizeRead({ error: 'not registered', code: 'not_registered' }).error.code, 'not_registered', 'a route refusal keeps its code'],
      [m.normalizeDoc({ v: 1, title: 'T', manifest: {}, files: { 'Main.html': '<p>x</p>' } }).frames[0].html, '<p>x</p>', 'a published page\'s state block'],
      [m.normalizeDoc({ title: 'no v' }).error.code, 'bad_doc', 'a block that is not a v1 design ⇒ bad_doc'],
    ];
  },
  pickFence: (m) => {
    const fr = { file: 'Main.html', w: 1280, h: 800 };
    const good = m.pickFence({ kind: 'design-pick', path: 'header > nav > a.cta', tag: 'A', text: '  Get\n started ', rect: { x: -5, y: 10, w: 5000, h: 20 } }, fr);
    const long = m.pickFence({ kind: 'design-pick', path: 'x'.repeat(100000), tag: 'div', text: 'y'.repeat(100000) }, fr);
    const hidden = m.pickFence({ kind: 'design-pick', path: 'a', tag: 'a', text: 'ok\u202eevil\u200b' }, fr);
    return [
      [eq(good, { kind: 'design-pick', file: 'Main.html', path: 'header > nav > a.cta', tag: 'a', text: 'Get started', rect: { x: 0, y: 10, w: 1280, h: 20 } }), true, 'a pick: the frame names the file, the tag lower-cased, text collapsed, the rect clamped to the artboard'],
      [long.path.length === m.PICK_LIMITS.path && long.text.length === m.PICK_LIMITS.text, true, 'every string is bounded (path 200, text 120)'],
      [hidden.text, 'okevil', 'bidi / zero-width characters REMOVED (a word they hid in stays one word — src/peer-text.js\'s rule; the line reads as it is)'],
      [m.pickFence({ kind: 'design-pick', path: 'a', tag: 'a', text: 'Ge​t‮ sta­rted\u0007now !' }, fr).text, 'Get started now !', 'L4 B②: a soft hyphen / ZWSP / RLO vanish, a control or a line separator is one space (before: every hidden character became a space — "Ge t sta rted")'],
      [m.pickFence({ kind: 'design-pick', path: 'a', tag: 'a', file: 'Other.html' }, fr).file, 'Main.html', 'a message cannot claim another artboard'],
      [m.pickFence({ kind: 'design-evil', path: 'a', tag: 'a' }, fr), null, 'a kind outside the closed set ⇒ dropped'],
      [m.pickFence({ kind: 'design-pick', path: 'a', tag: '<img onerror=x>' }, fr), null, 'a tag that is not a tag name ⇒ dropped'],
      [m.pickFence({ kind: 'design-pick', path: 'a' }, fr), null, 'no tag ⇒ dropped'],
      [m.pickFence('design-pick', fr), null, 'a string ⇒ dropped'],
      [m.pickFence([{ kind: 'design-pick' }], fr), null, 'an array ⇒ dropped'],
      [eq(m.pickFence({ kind: 'design-key', key: 'Escape' }, fr), { kind: 'design-key', file: 'Main.html', key: 'Escape' }), true, 'the Escape key'],
      [m.pickFence({ kind: 'design-key', key: 'Enter' }, fr), null, 'any other key ⇒ dropped'],
      [m.pickFence({ kind: 'design-pick', path: 'a', tag: 'a' }, { file: '../x' }), null, 'a frame record without an artboard name ⇒ dropped'],
      [m.PICK_KINDS.join(','), 'design-pick,design-key', 'THE CLOSED SET is exactly two kinds'],
    ];
  },
  frameKeyGate: (m) => {
    // L4 B①: a hostile artboard posted 200 `design-key` Escapes and ended Comment mode the instant it started
    let g = null;
    const step = (t) => { const o = m.frameKeyGate(g, t); g = o.gate; return o; };
    const a = step(1000), b = step(1500), c = step(1900), d = step(2000), e = step(5000), f = step(12001);
    let g2 = null;
    const spaced = [0, 3000, 6000, 9000].map((t) => { const o = m.frameKeyGate(g2, t); g2 = o.gate; return o.allow; });
    const garbage = m.frameKeyGate({ times: 'x', mutedUntil: 'y' }, 10);
    return [
      [[a.allow, b.allow, c.allow], [true, true, true], 'three keys inside 2 s pass (a human\'s Escape, a retry, one more)'],
      [[d.allow, d.muted, typeof d.gate.mutedUntil], [false, true, 'number'], 'the fourth inside the window is refused and the frame is MUTED'],
      [[e.allow, e.muted], [false, true], 'still muted 3 s later (10 s of silence)'],
      [[f.allow, f.muted], [true, false], 'after the mute a key passes again, on a fresh record'],
      [spaced, [true, true, true, true], 'keys 3 s apart never trip it'],
      [[garbage.allow, Array.isArray(garbage.gate.times)], [true, true], 'a garbage record is a fresh one'],
      [m.KEY_RATE, { max: 3, windowMs: 2000, muteMs: 10000 }, 'the numbers: 3 per 2 s, muted 10 s'],
    ];
  },
  routeMessage: (m) => {
    const winA = { name: 'frame A' }, winB = { name: 'frame B' };
    const frames = [{ win: winA, file: 'A.html', w: 100, h: 100 }, { win: winB, file: 'B.html', w: 100, h: 100 }, { win: null, file: 'C.html' }];
    const data = { kind: 'design-pick', path: 'p', tag: 'div', text: 't' };
    const hitB = m.routeMessage({ source: winB, data }, frames);
    return [
      [hitB && hitB.frame.file === 'B.html' && hitB.msg.file === 'B.html', true, 'a message from frame B is frame B\'s'],
      [m.routeMessage({ source: FOREIGN, data }, frames), null, 'a message from any other window (the app\'s own page, a popup, another canvas\'s frame) ⇒ dropped'],
      [m.routeMessage({ source: null, data }, frames), null, 'no source ⇒ dropped (and a frame without a window never matches a null source)'],
      [m.routeMessage({ source: { name: 'frame A' }, data }, frames), null, 'a look-alike object is not the frame (identity, never equality)'],
      [m.routeMessage({ source: winA, data: { kind: 'design-pick', path: 'p' } }, frames), null, 'its own frame, a malformed message ⇒ dropped'],
    ];
  },
  quoteLine: (m) => [
    [m.quoteLine({ file: 'Main.html', path: 'header > nav > a.cta', tag: 'a', text: 'Get started' }), 'Main.html › header > nav > a.cta ("Get started")', 'the contract\'s quote line'],
    [m.quoteLine({ file: 'Main.html', path: '', tag: 'img', text: '' }), 'Main.html › img', 'no path ⇒ the tag; no text ⇒ no quotes'],
    [m.quoteLine({ file: '../../etc', path: 'a<script>', tag: 'a' }), 'artboard › ascript>', 'a bad file name ⇒ "artboard"; markup characters out of the path (only the path grammar: letters, # . - _ > …)'],
    [m.quoteLine({ file: 'Main.html', path: 'a', tag: 'a', text: 'ab\u202ecd\u200b' }), 'Main.html › a ("abcd")', 'the text a person reads before sending is folded: a bidi override / zero-width character never reorders or hides the line (REMOVED, as peer-text.js removes a format character — L4 B②: spaced, a soft hyphen split the word)'],
    [m.quoteLine({ file: 'Main.html', path: 'header > nav > a.cta', tag: 'a', text: 'Get started' }), DM.pickQuote({ file: 'Main.html', path: 'header > nav > a.cta', tag: 'a', text: 'Get started' }), 'the composer\'s line IS the hub\'s pickQuote over the same facts (the line the agent receives is spelled by the same function)'],
  ],
  frameDocs: (m) => {
    const P = 'window.__picker=1';
    const doc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><script>window.mine=1</script></head><body>x</body></html>';
    const out = m.frameSrcdoc(doc, P);
    const noHead = m.frameSrcdoc('<!DOCTYPE html><HTML><body>y</body></HTML>', P);
    const bare = m.frameSrcdoc('<!doctype html><p>z</p>', P);
    const evil = m.frameSrcdoc(doc, 'a="</script><img src=x onerror=alert(1)>"');
    const far = 'x'.repeat(70 * 1024) + '<head>';
    const adversarial = '<headx'.repeat(400000); // 2.4 MB of near-misses
    const pdoc = m.printSrcdoc(doc, { w: 390, h: 844, print: 'fixed' });
    return [
      [out.indexOf(P) > 0 && out.indexOf(P) < out.indexOf('window.mine') && out.startsWith('<!doctype html><html lang="en"><head><script>'), true, 'the picker is the FIRST thing in the head — before any of the artboard\'s own scripts'],
      [noHead.startsWith('<!DOCTYPE html><HTML><script>'), true, 'no <head>: after <html> (case-insensitive)'],
      [bare.startsWith('<!doctype html><script>'), true, 'no <html>: after the doctype (never before it — that would be quirks mode)'],
      [m.frameSrcdoc('<p>q</p>', P).startsWith('<script>'), true, 'nothing at all: first'],
      [m.frameSrcdoc(doc, ''), doc, 'no picker (the published page) ⇒ the artboard untouched'],
      [!/<\/script><img/i.test(evil) && evil.includes('<\\/script>'), true, 'the injected text can never close its own script element'],
      [m.headInsertAt(far), 0, 'the head window is bounded: a <head> past 64 KiB is not searched for'],
      [m.headInsertAt(adversarial), 0, 'near-misses are walked by indexOf in the head window only (2.4 MB of "<headx" answers, no regex)'],
      [m.headInsertAt('<head\n data-x="1">'), 18, 'a tag-name boundary may be any whitespace'],
      [m.printCss({ w: 390, h: 844, print: 'fixed' }), '@page{size:390px 844px;margin:0}html,body{width:390px;height:844px;overflow:hidden}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}', 'fixed = ONE page the artboard\'s size'],
      [m.printCss({ w: 390, h: 844, print: 'flow' }), '@page{margin:12mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}', 'flow = the document paginated'],
      [pdoc.indexOf('@page{size:390px 844px') > pdoc.indexOf('window.mine') && pdoc.indexOf('<style media="print">') < pdoc.indexOf('</head>') && /print\(\)/.test(pdoc), true, 'the print stylesheet goes at the head\'s END (after the artboard\'s own styles) with the print call'],
    ];
  },
};
function runTable(m, rule) {
  let rows;
  try { rows = TABLES[rule](m); } catch (e) { return false; }
  return rows.every(([a, b]) => eq(a, b));
}
const SECTIONS = [
  ['① the view', ['zoom', 'zoomAt', 'pinch', 'fitView', 'focusView']],
  ['② the world', ['framesOf', 'pages']],
  ['③ the read and the published page', ['normalizeRead']],
  ['④ THE PICK FENCE', ['pickFence', 'frameKeyGate', 'routeMessage', 'quoteLine']],
  ['⑤ the frame documents', ['frameDocs']],
];
for (const [title, rules] of SECTIONS) {
  console.log(title);
  for (const rule of rules) for (const [a, b, n] of TABLES[rule](M)) ok(eq(a, b), `${rule}: ${n}`, eq(a, b) ? undefined : { got: a, want: b });
}

console.log('④b THE PICKER, run under a mini DOM');
// The picker is injected as SOURCE TEXT into a frame; here the same text runs with a fake window. `runPicker(src)` →
// {fire(type, ev), posts, parent}: listeners by type (capture flag kept), the parent's postMessage recorded.
function miniDom() {
  const mkEl = (tag, { id = '', cls = [], text = '', attrs = {}, parent = null, rect = { left: 10, top: 20, width: 30, height: 40 } } = {}) => {
    const el = { nodeType: 1, tagName: tag.toUpperCase(), id, classList: cls, innerText: text, textContent: text, parentElement: parent, parentNode: parent,
      getAttribute: (k) => (k in attrs ? attrs[k] : null), getBoundingClientRect: () => rect, style: {}, isConnected: true };
    return el;
  };
  const html = mkEl('html'); const body = mkEl('body', { parent: html });
  const doc = { documentElement: html, body, createElement: (t) => ({ ...mkEl(t), setAttribute() {}, isConnected: false }) };
  body.appendChild = (b) => { b.isConnected = true; };
  return { mkEl, html, body, doc };
}
async function runPicker(src) {
  const D = miniDom();
  const L = [];
  const posts = [];
  const parentWin = { postMessage: (m, o) => posts.push({ m: JSON.parse(JSON.stringify(m)), o }) };
  const add = (type, fn, capture) => L.push({ type, fn, capture: !!capture });
  new Function('addEventListener', 'parent', 'document', src)(add, parentWin, D.doc);
  const fire = (type, ev) => { const e = { type, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...ev }; for (const l of L.filter((x) => x.type === type)) l.fn(e); return e; };
  return { D, L, posts, parentWin, fire };
}
const P = await import(pathToFileURL(path.join(REPO, 'src/lib/design-pick.js')).href);
async function pickerTable(src) {
  const R = await runPicker(src);
  const { D, posts, parentWin, fire } = R;
  const header = D.mkEl('header', { parent: D.body });
  const nav = D.mkEl('nav', { parent: header });
  const a = D.mkEl('a', { cls: ['cta', 'big', 'third'], text: '  Get\n started ', parent: nav, rect: { left: 5, top: 6, width: 70, height: 20 } });
  const rows = [];
  const c0 = fire('click', { target: a });
  rows.push([posts.length === 0 && !c0.defaultPrevented, true, 'before the canvas asks, a click is the page\'s own (nothing sent, nothing swallowed)']);
  fire('message', { source: { other: true }, data: { kind: 'design-mode', pick: true } });
  fire('click', { target: a });
  rows.push([posts.length, 0, 'design-mode from anything but the PARENT is ignored (still not picking)']);
  fire('message', { source: parentWin, data: { kind: 'design-mode', pick: 'yes' } });
  fire('click', { target: a });
  rows.push([posts.length, 0, 'pick must be exactly true']);
  fire('message', { source: parentWin, data: { kind: 'design-mode', pick: true, color: 'red;background:url(x)' } });
  const c1 = fire('click', { target: a });
  const m1 = posts[0] && posts[0].m;
  rows.push([eq(m1, { kind: 'design-pick', path: 'header > nav > a.cta.big', tag: 'a', text: 'Get started', rect: { x: 5, y: 6, w: 70, h: 20 } }), true, 'while picking, a click NAMES the element: the hub\'s path grammar (≤ 2 classes), the text collapsed, its rect']);
  rows.push([c1.defaultPrevented && c1.stopped, true, '…and the click is swallowed (a link does not navigate, the page\'s handlers never see it)']);
  rows.push([posts[0] && posts[0].o, '*', 'posted to the parent (the frame is an opaque origin; the canvas fences by source)']);
  let deep = D.body;
  for (let i = 0; i < 10; i++) deep = D.mkEl('div', { parent: deep, id: i === 5 ? 'hero' : i === 6 ? 'bad id!' : '', cls: i === 8 ? ['x"><img'] : [] });
  fire('click', { target: deep });
  rows.push([posts[1] && posts[1].m.path, '… > div > div#hero > div > div > div > div', 'a deep element: the last six steps, "… > " when cut; an id that is not an identifier and a class with markup are left out']);
  const longText = D.mkEl('p', { parent: D.body, text: 'w '.repeat(5000) });
  fire('click', { target: longText });
  rows.push([posts[2] && posts[2].m.text.length, 120, 'the element\'s text is bounded to 120']);
  const img = D.mkEl('img', { parent: D.body, attrs: { alt: 'Logo' } });
  fire('click', { target: img });
  rows.push([posts[3] && posts[3].m.text, 'Logo', 'an image is named by its alt']);
  fire('keydown', { key: 'Escape' });
  rows.push([eq(posts[4] && posts[4].m, { kind: 'design-key', key: 'Escape' }), true, 'Escape inside the frame is said to the canvas']);
  fire('keydown', { key: 'a' });
  rows.push([posts.length, 5, 'any other key is the page\'s own']);
  fire('message', { source: parentWin, data: { kind: 'design-mode', pick: false } });
  const c2 = fire('click', { target: a });
  rows.push([posts.length === 5 && !c2.defaultPrevented, true, 'pick off: clicks are the page\'s again']);
  const fr = { file: 'Main.html', w: 1280, h: 800 };
  rows.push([eq(sortKeys(M.pickFence(m1, fr)), sortKeys({ ...m1, file: 'Main.html' })), true, 'what the picker sends passes the canvas\'s fence unchanged']);
  rows.push([M.quoteLine(M.pickFence(m1, fr)), 'Main.html › header > nav > a.cta.big ("Get started")', '…and reads as the contract\'s quote line']);
  return rows;
}
{
  for (const [a, b, n] of await pickerTable(P.pickerSource())) ok(eq(a, b), `picker: ${n}`, eq(a, b) ? undefined : { got: a, want: b });
  // the source text that SHIPS is the minified bundle's (esbuild --minify renames the picker's locals): it must run the
  // same — built here in-process exactly as the client bundle builds it, then the same table
  {
    const { createRequire } = await import('node:module');
    const esbuild = createRequire(import.meta.url)(path.join(REPO, 'node_modules/esbuild'));
    const out = esbuild.buildSync({ stdin: { contents: "import { pickerSource } from './src/lib/design-pick.js'; globalThis.__dwinPicker = pickerSource();", resolveDir: REPO, loader: 'js' }, bundle: true, minify: true, write: false, format: 'iife', platform: 'browser', target: 'es2020' });
    const box = {};
    new Function('globalThis', out.outputFiles[0].text)(box);
    const minified = box.__dwinPicker;
    const rows = typeof minified === 'string' ? await pickerTable(minified) : [];
    ok(rows.length > 10 && rows.every(([x, y]) => eq(x, y)) && minified.length < P.pickerSource().length, `the MINIFIED picker (what the bundle injects, ${minified && minified.length} B) passes the same table`);
  }
  const code = codeOnly(read('src/lib/design-pick.js'));
  const sent = [...code.matchAll(/post\(\{ kind: '([a-z-]+)'/g)].map((x) => x[1]);
  ok(sent.length === 2 && sent.every((k) => M.PICK_KINDS.includes(k)), `census: every kind the picker sends is in the canvas's closed set (${sent.join(', ')})`);
  const heard = [...code.matchAll(/d\.kind !== '([a-z-]+)'/g)].map((x) => x[1]);
  ok(heard.length === 1 && M.FRAME_KINDS.includes(heard[0]) && /if \(e\.source !== parent\) return;/.test(code), `census: the picker hears ONE kind (${heard.join(', ')}), from its parent only`);
  ok((code.match(/postMessage\(/g) || []).length === 1 && /parent\.postMessage\(msg, '\*'\)/.test(code), 'census: ONE postMessage site, to the parent');
  ok(!/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|WebSocket|eval)\b/.test(code), 'the picker reads no storage, cookie or network and evals nothing');
  ok(P.PICK_KIND === 'design-pick' && P.KEY_KIND === 'design-key' && P.MODE_KIND === 'design-mode', 'the exported kind names are the model\'s');
}

console.log('⑥ wiring pins — the canvas core');
{
  const core = read('src/lib/design-canvas.js');
  const code = codeOnly(core);
  ok(/setAttribute\('sandbox', 'allow-scripts'\)/.test(code), "every artboard frame is sandboxed 'allow-scripts' (design-canvas.js)");
  const designSrc = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => /^design-/.test(f)).map((f) => `src/lib/${f}`).concat(fs.existsSync(path.join(REPO, 'src/design-viewer-entry.js')) ? ['src/design-viewer-entry.js'] : []);
  const sameOrigin = designSrc.filter((f) => /allow-same-origin/.test(codeOnly(read(f))));
  ok(designSrc.length >= 2 && sameOrigin.length === 0, `no design source grants allow-same-origin (${designSrc.length} files: ${designSrc.join(', ')})`, sameOrigin.join(', '));
  const sandboxes = [...code.matchAll(/sandbox[^\n]{0,80}/g)].map((x) => x[0]);
  ok(sandboxes.every((s) => !/allow-(same-origin|top-navigation|popups|forms|modals)/.test(s)), 'the canvas core\'s frame sandbox carries no other allowance (scripts only)', sandboxes.join(' | '));
  const msgs = [...code.matchAll(/addEventListener\('message'/g)];
  ok(msgs.length === 1 && /addEventListener\('message', \(ev\) => \{[\s\S]{0,600}?routeMessage\(ev, frames\)[\s\S]{0,400}?\}, L\);/.test(code), 'ONE message listener, through routeMessage, bound to the canvas\'s signal');
  ok(/frames\.push\(\{ win: rec\.iframe\.contentWindow, file/.test(code), 'routeMessage is handed exactly this canvas\'s frames (their contentWindow, at message time)');
  ok(/if \(!rec \|\| !rec\.iframe \|\| doc\.activeElement !== rec\.iframe\) return;\n\s+const g = frameKeyGate\(keyGates\.get\(hit\.frame\.file\), Date\.now\(\)\);\n\s+keyGates\.set\(hit\.frame\.file, g\.gate\);\n\s+if \(g\.allow\) onKey\?\.\(hit\.msg, hit\.frame\);/.test(code), 'L4 B①: a frame\'s KEY is admitted only from the frame that HAS the keyboard (its iframe is the active element), through the frame-key gate — a script\'s flood from any frame is muted; a pick is never gated (the composer shows the fence\'s own text)');
  const winSrc = codeOnly(read('src/lib/design-window.js'));
  ok(/onKey: \(msg, frame\) => frameEscape\(frame\),/.test(winSrc) && /function frameEscape\(frame\) \{\n\s+if \(composer\) return;\n\s+if \(canvas\.pick\(\)\) \{ canvas\.setPick\(false\); hideChip\(\); return; \}\n\s+if \(canvas\.focused\(\) && frame && frame\.file === canvas\.focused\(\)\) canvas\.focus\(null\);/.test(winSrc), 'the window: a frame\'s Escape never closes the composer (the typed words stay), ends Comment mode, and leaves the focused view only when it IS that frame');
  ok(/onKey: \(m, frame\) => \{ if \(canvas\.focused\(\) && frame && frame\.file === canvas\.focused\(\)\) canvas\.focus\(null\); \}/.test(codeOnly(read('src/design-viewer-entry.js'))), 'the published page: a frame\'s Escape leaves the focused view only when it IS that frame (another artboard\'s script cannot kick the reader out)');
  ok(/postMessage\(\{ kind: 'design-mode', pick: st\.pick, color: st\.pickColor \}, '\*'\)/.test(code) && (code.match(/postMessage\(/g) || []).length === 1, 'the canvas says ONE thing to its frames (design-mode) and nothing else');
  ok(!/from '\.\/(utils|i18n|app|ws|window)\.js'/.test(core) && /from '\.\/design-canvas-model\.js'/.test(core), 'the core imports only the model — no App, utils, i18n or ws (the published page bundles it)');
  ok(/el\.textContent = n\.text/.test(code) && /rec\.card\.textContent = /.test(code) && !/innerHTML/.test(code), 'notes and refusal cards are text; the core writes no innerHTML');
  ok(/rec\.iframe\.srcdoc = srcdoc/.test(code) && /if \(rec\.srcdoc !== srcdoc\)/.test(code), 'updateFrame swaps ONE srcdoc in place, and only when it changed');
  ok(/setPointerCapture\(e\.pointerId\)/.test(code) && /'pointercancel', end/.test(code) && /'lostpointercapture', end/.test(code), 'a drag captures its pointer at the door and ends on up / cancel / lost capture');
  ok(/vp\.addEventListener\('dblclick', \(e\) => \{[\s\S]{0,200}?toWorld\(st\.view, local\(e\)\)[\s\S]{0,200}?onActivate\?\.\(hit\.file, 'dblclick'\)/.test(code) && !/shield\.addEventListener\('dblclick'/.test(code), 'a dblclick is read on the VIEWPORT by the world point under it (the drag\'s pointer capture retargets the click pair away from the shield — measured in Chrome: a shield listener never fired)');
}

console.log('⑥b wiring pins — the Design window');
{
  const w = read('src/lib/design-window.js');
  const code = codeOnly(w);
  ok(/registerWindowType\(\{\s*type: 'design', label: 'Design',[\s\S]{0,120}?action: 'openDesign', replay:/.test(code), "the window type `design` registers with the openSpec action `openDesign`");
  ok(/const openSpec = \{ action: 'openDesign', host: h, dir: d, sessionId: sessionId \|\| '' \};/.test(code), 'the openSpec is {action, host, dir, sessionId} (the contract §3.5)');
  ok(/app\.wm\.revealWindow\(existing\.id, \{ replay: !!syncId \}\)/.test(code), 'ONE window per (host, dir): an open one is revealed through the door (§62)');
  ok(!/addEventListener\('message'/.test(code), 'the window adds NO message listener of its own — the canvas core\'s fenced one is the only door from a frame');
  ok(/createDesignCanvas\(canvasHost, \{\s*signal, counterZoom: COUNTER_ZOOM, pickerSrc: pickerSource\(\)/.test(code), 'the canvas is made on the window\'s listener signal, at net zoom 1, with the picker');
  ok(/fetchJson\('\/api\/design\?' \+ qs\(h, d\)\)/.test(code) && /normalizeRead\(await fetchJson\('\/api\/design\?/.test(code), 'the read is GET /api/design?host&dir through normalizeRead (a failure is loud)');
  ok(/onFileChanged\(\(det\) => \{[\s\S]{0,300}?\}, \{ signal \}\);/.test(code), 'the file-changed relay is bound to the window\'s signal');
  ok(/app\.ws\.send\(\{ type: 'design-watch', host: h, dir: d \}\)/.test(code) && /app\.ws\.send\(\{ type: 'design-unwatch', host: h, dir: d \}\)/.test(code) && /if \(connected && !signal\.aborted\) \{ watch\(\); load\(\); \}/.test(code), 'design-watch on open AND on every reconnect, design-unwatch on close');
  ok(/fetchJson\('\/api\/design\/comment', \{ method: 'POST'[\s\S]{0,140}?body: JSON\.stringify\(\{ sessionId: winInfo\._design\.sessionId, host: h, dir: d, quote: \{ file: p\.file, path: p\.path, tag: p\.tag, text: p\.text \}, text \}\) \}\)/.test(code), 'a comment = POST /api/design/comment {sessionId, host, dir, quote: the fenced pick facts, text} — the hub spells and belts the line; host + dir name the design whose conversation a STASHED comment waits for (L4 A③b: without them a killed conversation\'s comment was refused no_conversation)');
  ok(/if \(!r \|\| r\.error \|\| r\.ok === false\) \{ sayChip\(commentRefusalText\(r\)\); return; \}/.test(code), 'a refused comment is a floating chip in words (the typed text stays)');
  ok(/fetchJson\('\/api\/design\/publish', \{ method: 'POST'[\s\S]{0,140}?JSON\.stringify\(\{ host: hostKey\(host\), dir, title: name\.value\.trim\(\), \.\.\.\(wantPublic === undefined \? \{\} : \{ public: wantPublic \}\) \}\)/.test(code), 'Publish… = POST /api/design/publish {host, dir, title, public?} — `public` rides only when the user changed the box (an untouched box keeps the page as it is)');
  ok(/fetchJson\('\/api\/designs'\)\.then\(/.test(code) && /pub\.checked = !!page\.public;/.test(code) && /const wantPublic = \(!page \|\| !known \|\| pub\.checked !== !!page\.public\) \? pub\.checked : undefined;/.test(code) && /await info;\n\s+const wantPublic/.test(code), 'L4 B⑤: the publish dialog pre-fills the box from the page\'s current visibility (GET /api/designs → its page) and waits for that answer before it publishes — a republish from the window never flips a public page private unsaid');
  ok(/setAttribute\('sandbox', 'allow-scripts allow-modals'\)/.test(code) && /ifr\.srcdoc = printSrcdoc\(f\.html, f\)/.test(code), 'Print = the focused artboard in a transient frame sandboxed allow-scripts allow-modals (never allow-same-origin)');
  const inner = [...code.matchAll(/\.innerHTML = ([^\n;]+);/g)].map((x) => x[1].trim());
  ok(inner.length >= 2 && inner.every((r) => /^UI_ICONS(\[icon\]|\.\w+)$/.test(r)), `every innerHTML write in the window is an icons.js constant (${inner.join(' | ')})`);
  ok(/quote\.textContent = quoteLine\(pick\)/.test(code), 'the quote line is drawn as text');
  const keys = [...code.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
  const z = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, j = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  const missing = [...new Set(keys)].filter((k) => !z[k] || !j[k]);
  ok(keys.length >= 40 && missing.length === 0, `every t() literal of the window (${new Set(keys).size}) has a zh AND a ja entry`, missing.join(' | '));
  const app = codeOnly(read('src/lib/app.js'));
  ok(/openDesign\(opts\) \{ return openDesignFn\(this, opts \|\| \{\}\); \}/.test(app) && /installDesignWindow\(this\);/.test(app), 'app.js: app.openDesign (the replay\'s door) + the hub\'s design-open push installed');
}

console.log('⑥c the published page\'s runtime (the second esbuild entry)');
{
  const pkg = JSON.parse(read('package.json'));
  ok(/ && esbuild src\/design-viewer-entry\.js --bundle --outfile=public\/design-viewer\.js --format=iife --platform=browser --target=es2020 --minify && /.test(pkg.scripts.build), 'npm run build writes public/design-viewer.js (an IIFE: the hub inlines it into a <script>)');
  ok(/^public\/design-viewer\.js$/m.test(read('.gitignore')) && /^public\/novnc\.js$/m.test(read('.gitignore')), 'the built runtime is gitignored like public/novnc.js (the precedent)');
  const e = read('src/design-viewer-entry.js');
  const ec = codeOnly(e);
  const imports = [...ec.matchAll(/from '([^']+)'/g)].map((x) => x[1]);
  ok(eq(imports.sort(), ['./lib/design-canvas-model.js', './lib/design-canvas.js']), `the runtime imports only the canvas core + its rules — no i18n (1.5 MB), no utils, no picker (${imports.join(', ')})`);
  ok(/doc\.getElementById\(DOC_ID\)/.test(ec) && /const DOC_ID = 'vibespace-design-doc';/.test(ec) && /const ROOT_ID = 'vibespace-design-root';/.test(ec) && /normalizeDoc\(raw\)/.test(ec), 'it reads the state block #vibespace-design-doc through normalizeDoc and mounts into #vibespace-design-root (the hub\'s bundleCanvas shell)');
  ok(!/innerHTML/.test(ec) && /title\.textContent = read\.title/.test(ec), 'its chrome is textContent only (the title and every name are the agent\'s)');
  ok(!/pickerSrc:/.test(ec) && !/onPick:/.test(ec), 'a published page carries no picker and takes no comment');
  const V = await import(pathToFileURL(path.join(REPO, 'src/design-viewer-entry.js')).href);
  const k = (o) => Object.keys(o).sort().join(',');
  ok(k(V.WORDS.en) === k(V.WORDS.zh) && k(V.WORDS.en) === k(V.WORDS.ja) && Object.values(V.WORDS).every((w) => Object.values(w).every((x) => typeof x === 'string' && x)), 'its words exist in en / zh / ja, the same keys, none empty');
  ok(V.wordsFor('zh-CN') === V.WORDS.zh && V.wordsFor('ja') === V.WORDS.ja && V.wordsFor('fr') === V.WORDS.en && V.wordsFor('') === V.WORDS.en, 'the reader\'s browser language picks the column (anything else: English)');
  const lits = V.VIEWER_CSS.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || [];
  const tokenDefs = V.VIEWER_CSS.split('\n').filter((l) => /^:root\{|^@media \(prefers-color-scheme/.test(l)).join('\n');
  ok(lits.every((x) => tokenDefs.includes(x)), 'every colour literal in its stylesheet is a theme-token DEFINITION on :root (light / dark) — the rules read tokens');
  const { createRequire } = await import('node:module');
  const esbuild = createRequire(import.meta.url)(path.join(REPO, 'node_modules/esbuild'));
  const out = esbuild.buildSync({ entryPoints: [path.join(REPO, 'src/design-viewer-entry.js')], bundle: true, minify: true, write: false, format: 'iife', platform: 'browser', target: 'es2020' });
  const kb = out.outputFiles[0].contents.length / 1024;
  ok(kb > 8 && kb < 60, `built in-process exactly as npm run build builds it: ${kb.toFixed(1)} KB (the design's budget ~40 KB; under 60)`);
}

console.log('⑦ the model is PURE');
{
  const src = read(MODEL_REL);
  const imps = [...src.matchAll(/^\s*import\b[^;]*?from\s+'([^']+)'/gm)].map((x) => x[1]);
  ok(eq(imps, ['../design-model.js']) && !/\brequire\(/.test(src), `design-canvas-model.js imports ONE module, the hub's PURE design-model.js (${imps.join(', ')})`);
  const dms = read('src/design-model.js');
  ok(!/^\s*import\b/m.test(dms) && !/\brequire\(/.test(dms), '…and design-model.js imports nothing');
  ok(!/\b(document|window)\.|\blocalStorage\b|\bfetch\(/.test(codeOnly(src)), 'and touches no DOM, storage or network');
}

console.log('⑧ controls — a patched copy of each rule turns its table red');
{
  const C = mutantCopies('dwin', REPO);
  const src = read(MODEL_REL);
  const MUTANTS = [
    ['zoom', 'a between-rungs zoom steps past its neighbour', 'if (dir > 0) { for (const s of ZOOM_STEPS) if (s > cur * 1.001) return s; return ZOOM_MAX; }', 'if (dir > 0) { for (const s of ZOOM_STEPS) if (s > cur * 1.3) return s; return ZOOM_MAX; }'],
    ['zoomAt', 'the anchor is not kept (zoom about the origin)', 'return { x: ax - wx * nz, y: ay - wy * nz, z: nz };', 'return { x: v.x, y: v.y, z: nz };'],
    ['fitView', 'a lone artboard blown up past 100%', 'const z = clampZoom(Math.min((pw - 2 * pad) / bounds.w, (ph - 2 * pad) / bounds.h, maxZ));', 'const z = clampZoom(Math.min((pw - 2 * pad) / bounds.w, (ph - 2 * pad) / bounds.h));'],
    ['focusView', 'a tall artboard keeps its full height (nothing scrolls inside)', 'Math.min(rect.h, Math.floor((ph - 2 * pad) / z))', 'rect.h'],
    ['framesOf', 'a manifest the hub refuses half-applied (the validation dropped)', 'const m = v.ok ? v.manifest : null;', 'const m = isObj(manifest) ? manifest : null;'],
    ['normalizeRead', 'a failed read becomes an empty canvas', "if (!isObj(r)) return { error: { code: 'unreachable', why: '', refusals: [] } };", "if (!isObj(r)) r = {};"],
    ['pickFence', 'the closed kind set opened', "if (!isObj(data) || !PICK_KINDS.includes(data.kind) || !frame || !isArtboardName(frame.file)) return null;", "if (!isObj(data) || !frame || !isArtboardName(frame.file)) return null;"],
    ['pickFence', 'the path left unbounded', "path: cleanLine(data.path, PICK_LIMITS.path)", "path: String(data.path)"],
    ['routeMessage', 'THE SOURCE CHECK removed (any window\'s message accepted)', 'const frame = (Array.isArray(frames) ? frames : []).find((f) => f && f.win && f.win === src);', 'const frame = (Array.isArray(frames) ? frames : []).find((f) => f && f.file);'],
    ['frameDocs', 'the picker appended at the end (after the artboard\'s own scripts)', 'const at = headInsertAt(s);\n  return s.slice(0, at) + `<script>${scriptText(pickerSrc)}</script>` + s.slice(at);', 'return s + `<script>${scriptText(pickerSrc)}</script>`;'],
    ['frameDocs', 'the head search over the whole artboard (no bounded window)', "const lower = s.slice(0, HEAD_WINDOW).toLowerCase();\n  for (const tag of ['head', 'html', '!doctype'])", "const lower = s.toLowerCase();\n  for (const tag of ['head', 'html', '!doctype'])"],
    ['quoteLine', 'the text shown unfolded (a bidi override reorders the line the person approves)', 'text: cleanLine(p.text, PICK_LIMITS.text) });', 'text: p.text });'],
  ];
  for (const [rule, what, a, b] of MUTANTS) {
    if (!src.includes(a)) { ok(false, `${rule} CONTROL: the patch anchor is still in the module`, a); continue; }
    const f = C.write(MODEL_REL, src.replace(a, b), rule);
    const mm = await import(pathToFileURL(f).href);
    ok(runTable(M, rule) && !runTable(mm, rule), `${rule} CONTROL (${what}): the real module passes its table, the patched copy FAILS it`);
  }
  // the picker: its source check removed (a design-mode from ANY window turns picking on)
  {
    const PREL = 'src/lib/design-pick.js';
    const psrc = read(PREL);
    const a = '    if (e.source !== parent) return;\n';
    if (!psrc.includes(a)) ok(false, 'picker CONTROL: the patch anchor is still in the module', a);
    else {
      const f = C.write(PREL, psrc.replace(a, ''), 'picker-any-source');
      const pm = await import(pathToFileURL(f).href);
      const real = (await pickerTable(P.pickerSource())).every(([x, y]) => eq(x, y));
      const mut = (await pickerTable(pm.pickerSource())).every(([x, y]) => eq(x, y));
      ok(real && !mut, 'picker CONTROL (the parent check removed — any window may switch picking on): the real picker passes its table, the patched copy FAILS it');
    }
  }
  for (const r of copiesCensus(C.files, C.dir, REPO, { minCopies: MUTANTS.length + 1, label: '⑧ ' })) ok(r.pass, r.name, r.detail);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'} · ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
