#!/usr/bin/env node
// THE WORD VIEWER'S RULES (lane docx-viewer, 2026-09-27) — FAST, PURE: no
// server, no browser, no worktree. The owner opened an APA paper and saw a grey
// band narrower than the page, the page's left edge out of reach, no zoom; the
// viewer was rebuilt (src/lib/docx-viewer.js) and every decision it takes is a
// PURE function of src/lib/docx-viewer-model.js, tabled here. The chrome half
// (the fixtures, the paper, the band, the headers, the oracle, the hostile file)
// is scripts/test-docx-viewer.mjs (heavy).
//
//   ① fitWidthScale — pane minus the padding on BOTH sides over the page; no size ⇒ 1; clamped
//   ② zoomStep — the ladder; a between-rungs scale goes to the NEXT rung, never the one it is past
//   ③ wheelScale — exponential, symmetric in/out, clamped
//   ④ pageIndexAt — the probe line (a third down) and the end of the scroll = the last page
//   ⑤ viewerVerdict — docx family renders, a binary .doc is refused BY NAME before any fetch
//   ⑥ sniffVerdict + refusalText — the bytes decide (zip / OLE / empty / other); every refusal through t()
//   ⑦ linkVerdict — web + mail open, #bookmark scrolls, EVERY other scheme is blocked (allowlist)
//   ⑧ inheritHeaderFooterRefs — Word's "Link to Previous", per type, inputs untouched
//   ⑧b styleTabsResolver — a paragraph's stops = its own, else its style's via basedOn
//      (the library read them before copying the style's: the running head's page number)
//   ⑧c symbolBullet — Word's Symbol/Wingdings private-use bullets ⇒ Unicode, by font
//   ⑨ parseZoomPref / serializeZoomPref — 'fit' | a scale; junk = fit
//   ⑩ toolbarModel — the toolbar as STRUCTURE, `t` injected, icon-only items named
//   ⑪ i18n — every t() literal of the model and the DOM half has zh AND ja
//   ⑫ wiring pins — file-viewer.js routes the docx branch through viewerVerdict BEFORE
//      the fetch and renders through docx-viewer.js; docx-viewer.js calls every rule;
//      the options, the shadow root, the altChunk interception, the paper CSS
//   ⑬ the model imports nothing
//   ⑭ controls — a patched copy of each rule (scripts/mutant-copy.mjs) turns its table red
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const T0 = Date.now();
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_REL = 'src/lib/docx-viewer-model.js';
const MODEL = path.join(REPO, MODEL_REL);
const M = await import(pathToFileURL(MODEL).href);

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } return !!c; };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Each rule's table is a FUNCTION of the module so a patched copy runs the same rows.
const TABLES = {
  fitWidthScale: (m) => [
    [m.fitWidthScale(900, 816), (900 - 48) / 816, 'a 900 px pane, a Letter page: (900 − 2·24) / 816'],
    [m.fitWidthScale(900, 816, { pad: 0 }), 900 / 816, 'pad 0 = the whole pane'],
    [m.fitWidthScale(771, 1056), (771 - 48) / 1056, 'a landscape page (the widest) in the owner\'s 771 px pane'],
    [m.fitWidthScale(0, 816), 1, 'a pane with no width yet (hidden window) ⇒ 1, never 0'],
    [m.fitWidthScale(900, 0), 1, 'nothing rendered ⇒ 1'],
    [m.fitWidthScale(NaN, 816), 1, 'NaN ⇒ 1'],
    [m.fitWidthScale(100, 816), m.ZOOM_MIN, 'a sliver of a pane clamps to ZOOM_MIN'],
    [m.fitWidthScale(5000, 816), m.ZOOM_MAX, 'a huge pane clamps to ZOOM_MAX'],
  ],
  zoomStep: (m) => [
    [m.zoomStep(1, +1), 1.1, '100% → + → 110%'],
    [m.zoomStep(1, -1), 0.9, '100% → − → 90%'],
    [m.zoomStep(1.3172, +1), 1.5, 'fit width 131.7% → + → 150% (the next rung up)'],
    [m.zoomStep(1.3172, -1), 1.25, 'fit width 131.7% → − → 125% (the next rung down)'],
    [m.zoomStep(1.04, -1), 1, '104% → − → 100%, not 90%'],
    [m.zoomStep(m.ZOOM_MIN, -1), m.ZOOM_MIN, 'the floor holds'],
    [m.zoomStep(m.ZOOM_MAX, +1), m.ZOOM_MAX, 'the ceiling holds'],
    [m.zoomStep(0.26, -1), 0.25, '26% → − → 25%'],
    [m.zoomStep(2, 0), 2, 'no direction = unchanged'],
  ],
  wheelScale: (m) => [
    [m.wheelScale(1, -100), Math.exp(0.2), 'one wheel notch toward you (deltaY −100) = ×e^0.2 ≈ one rung'],
    [m.wheelScale(1, 100), Math.exp(-0.2), 'one notch away = ×e^−0.2'],
    [m.wheelScale(m.wheelScale(1.25, -37), 37), 1.25, 'in then out by the same delta returns (a pinch is symmetric)'],
    [m.wheelScale(1.5, 0), 1.5, 'no delta = unchanged'],
    [m.wheelScale(3.9, -1000), m.ZOOM_MAX, 'clamped high'],
    [m.wheelScale(0.3, 1000), m.ZOOM_MIN, 'clamped low'],
  ],
  pageIndexAt: (m) => {
    const tops = [16, 1100, 2200, 3300];
    return [
      [m.pageIndexAt(0, tops, { viewportH: 900, scrollH: 4400 }), 0, 'at the top: page 1'],
      [m.pageIndexAt(800, tops, { viewportH: 900, scrollH: 4400 }), 1, 'the probe line (800 + 900/3 = 1100) ON page 2\'s top = page 2'],
      [m.pageIndexAt(799, tops, { viewportH: 900, scrollH: 4400 }), 0, 'one px above it = still page 1'],
      [m.pageIndexAt(2000, tops, { viewportH: 900, scrollH: 4400 }), 2, 'mid-document'],
      [m.pageIndexAt(3500, tops, { viewportH: 900, scrollH: 4400 }), 3, 'scrolled to the END = the last page (a short last page never reaches the probe line)'],
      [m.pageIndexAt(3000, [16, 1100, 2200, 3990], { viewportH: 900, scrollH: 3900 }), 3, 'the end rule wins over the probe line'],
      [m.pageIndexAt(500, [], { viewportH: 900 }), -1, 'no pages ⇒ −1'],
      [m.pageIndexAt(-50, tops, { viewportH: 900, scrollH: 4400 }), 0, 'a negative scrollTop (rubber band) ⇒ page 1'],
    ];
  },
  viewerVerdict: (m) => [
    [m.viewerVerdict('docx'), { kind: 'render' }, 'docx renders'],
    [m.viewerVerdict('DOCX'), { kind: 'render' }, 'case-insensitive'],
    [m.viewerVerdict('.dotx'), { kind: 'render' }, 'a template (.dotx) renders'],
    [m.viewerVerdict('docm'), { kind: 'render' }, 'a macro-enabled .docm renders (its macros never run — nothing here executes them)'],
    [m.viewerVerdict('doc'), { kind: 'refuse', code: 'binary-word' }, 'a legacy binary .doc is refused BY NAME'],
    [m.viewerVerdict('dot'), { kind: 'refuse', code: 'binary-word' }, 'a legacy .dot too'],
    [m.viewerVerdict('pdf'), { kind: 'none' }, 'not ours'],
    [m.viewerVerdict(undefined), { kind: 'none' }, 'nothing ⇒ none'],
  ],
  sniffVerdict: (m) => [
    [m.sniffVerdict([0x50, 0x4b, 3, 4]), 'zip', 'PK.. = Office Open XML'],
    [m.sniffVerdict([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'ole', 'D0 CF 11 E0 = OLE (a binary .doc, or a password-protected .docx)'],
    [m.sniffVerdict([]), 'empty', 'zero bytes'],
    [m.sniffVerdict(new Uint8Array([0x3c, 0x68, 0x74])), 'other', 'anything else'],
    [m.sniffVerdict(null), 'empty', 'null ⇒ empty'],
  ],
  linkVerdict: (m) => [
    [m.linkVerdict('https://example.com/paper'), { kind: 'external', href: 'https://example.com/paper' }, 'https opens (in a new tab)'],
    [m.linkVerdict('HTTP://Example.com'), { kind: 'external', href: 'HTTP://Example.com' }, 'scheme case-insensitive'],
    [m.linkVerdict('mailto:a@example.com'), { kind: 'external', href: 'mailto:a@example.com' }, 'mailto opens'],
    [m.linkVerdict(' https://example.com '), { kind: 'external', href: 'https://example.com' }, 'surrounding whitespace stripped'],
    [m.linkVerdict('#endmark'), { kind: 'anchor', name: 'endmark' }, 'a #bookmark scrolls the document'],
    [m.linkVerdict('#'), { kind: 'none' }, 'a bare # goes nowhere'],
    [m.linkVerdict('javascript:alert(1)'), { kind: 'blocked', scheme: 'javascript' }, 'javascript: BLOCKED'],
    [m.linkVerdict('  JavaScript:alert(1)'), { kind: 'blocked', scheme: 'javascript' }, 'JavaScript: with leading spaces BLOCKED'],
    [m.linkVerdict('java\tscript:alert(1)'), { kind: 'blocked', scheme: 'javascript' }, 'java<TAB>script: (a browser strips the tab) BLOCKED, named'],
    [m.linkVerdict('\u0001javascript:alert(1)'), { kind: 'blocked', scheme: 'javascript' }, 'a control char before javascript: BLOCKED'],
    [m.linkVerdict('data:text/html,<script>alert(1)</script>'), { kind: 'blocked', scheme: 'data' }, 'data: BLOCKED'],
    [m.linkVerdict('vbscript:msgbox(1)'), { kind: 'blocked', scheme: 'vbscript' }, 'vbscript: BLOCKED'],
    [m.linkVerdict('file:///etc/passwd'), { kind: 'blocked', scheme: 'file' }, 'file: BLOCKED'],
    [m.linkVerdict('other.docx'), { kind: 'blocked', scheme: 'relative' }, 'a relative target (another file) BLOCKED — it would resolve against VibeSpace'],
    [m.linkVerdict(''), { kind: 'none' }, 'empty ⇒ none'],
    [m.linkVerdict(null), { kind: 'none' }, 'null ⇒ none'],
  ],
  inheritHeaderFooterRefs: (m) => {
    const S = [
      { headerRefs: [{ type: 'first', id: 'h1' }, { type: 'default', id: 'h2' }], footerRefs: [{ type: 'default', id: 'f1' }], titlePage: true },
      { titlePage: false },
      { headerRefs: [{ type: 'default', id: 'h9' }] },
      null,
    ];
    const frozen = JSON.stringify(S);
    const out = m.inheritHeaderFooterRefs(S);
    const ids = out.map((o) => [o.headerRefs.map((r) => r.type + ':' + r.id).sort().join(','), o.footerRefs.map((r) => r.type + ':' + r.id).join(',')]);
    return [
      [ids[0], ['default:h2,first:h1', 'default:f1'], 'section 1 keeps its own'],
      [ids[1], ['default:h2,first:h1', 'default:f1'], 'section 2 names nothing ⇒ inherits BOTH types and the footer (the APA body section)'],
      [ids[2], ['default:h9,first:h1', 'default:f1'], 'section 3 replaces default only — per type'],
      [ids[3], ['default:h9,first:h1', 'default:f1'], 'a null section still inherits'],
      [JSON.stringify(S) === frozen, true, 'inputs untouched'],
      [m.inheritHeaderFooterRefs(undefined), [], 'nothing ⇒ []'],
    ];
  },
  styleTabsResolver: (m) => {
    const TABS = [{ style: 'center', position: '234pt' }, { style: 'right', position: '468pt' }];
    const styles = [
      { id: 'Normal', basedOn: null, paragraphProps: {} },
      { id: 'Header', basedOn: 'Normal', paragraphProps: { tabs: TABS } },
      { id: 'MyHeader', basedOn: 'Header', paragraphProps: {} },
      { id: 'Own', basedOn: 'Header', paragraphProps: { tabs: [{ style: 'left', position: '72pt' }] } },
      { id: 'LoopA', basedOn: 'LoopB' }, { id: 'LoopB', basedOn: 'LoopA' },
    ];
    const r = m.styleTabsResolver(styles);
    return [
      [r('Header'), TABS, "the Header style's own stops (centre + right)"],
      [r('MyHeader'), TABS, 'a style based on Header inherits them (basedOn chain)'],
      [r('Own')[0].position, '72pt', "a style's own stops win over its base's"],
      [r('Normal'), null, 'no stops anywhere ⇒ null (default stops)'],
      [r('Missing'), null, 'an unknown style ⇒ null'],
      [r('LoopA'), null, 'a basedOn cycle ends the walk'],
      [r(undefined), null, 'no style name ⇒ null'],
      [m.styleTabsResolver(undefined)('Header'), null, 'no styles ⇒ null'],
    ];
  },
  symbolBullet: (m) => [
    [m.symbolBullet('\uf0b7', 'Symbol'), '\u2022', "Word's default bullet (Symbol U+F0B7) ⇒ •"],
    [m.symbolBullet('\uf0b7', "'Symbol'"), '\u2022', 'the font name as the library quotes it'],
    [m.symbolBullet('\uf0a7', 'Wingdings'), '\u25aa', "Wingdings U+F0A7 ⇒ ▪ (Word's square bullet)"],
    [m.symbolBullet('\uf0a7', 'Symbol'), '\uf0a7', 'the same code point in Symbol is NOT a square — left alone'],
    [m.symbolBullet('\uf0d8', 'Wingdings'), '\u27a2', 'Wingdings arrow ⇒ ➢'],
    [m.symbolBullet('\uf0fc', 'Wingdings'), '\u2713', 'Wingdings check ⇒ ✓'],
    [m.symbolBullet('\uf0b7', undefined), '\u2022', "no font named ⇒ Word's default bullet only"],
    [m.symbolBullet('o', 'Courier New'), 'o', "the level-2 'o' untouched"],
    [m.symbolBullet('%1.', undefined), '%1.', 'a numbered level untouched'],
    [m.symbolBullet(null, 'Symbol'), '', 'nothing ⇒ empty'],
  ],
  zoomPref: (m) => [
    [m.parseZoomPref('fit'), { mode: 'fit', scale: null }, "'fit'"],
    [m.parseZoomPref(null), { mode: 'fit', scale: null }, 'unset ⇒ fit (the default)'],
    [m.parseZoomPref('1.25'), { mode: 'scale', scale: 1.25 }, "'1.25' ⇒ 125%"],
    [m.parseZoomPref('abc'), { mode: 'fit', scale: null }, 'junk ⇒ fit'],
    [m.parseZoomPref('-1'), { mode: 'fit', scale: null }, 'negative ⇒ fit'],
    [m.parseZoomPref('9'), { mode: 'scale', scale: m.ZOOM_MAX }, 'too big ⇒ clamped'],
    [m.serializeZoomPref('fit', 2), 'fit', "fit serialises as 'fit' whatever the scale"],
    [m.serializeZoomPref('scale', 1.25), '1.25', 'a scale serialises as its number'],
    [m.parseZoomPref(m.serializeZoomPref('scale', 1.5 * Math.exp(0.2))).scale, Math.round(1.5 * Math.exp(0.2) * 1000) / 1000, 'a wheel scale round-trips to 3 decimals'],
    [m.ZOOM_PREF_KEY, 'vibespace.docx-zoom', 'the per-device localStorage key'],
  ],
  toolbarModel: (m) => {
    const tt = (s, p) => '⟦' + (p ? s.replace(/\{(\w+)\}/g, (_, k) => p[k]) : s) + '⟧';
    const a = m.toolbarModel({ mode: 'fit', scale: 1.3172, page: 3, pages: 80 }, tt);
    const b = m.toolbarModel({ mode: 'scale', scale: 1, page: 1, pages: 4 }, tt);
    const c = m.toolbarModel({ mode: 'scale', scale: m.ZOOM_MIN, page: 0, pages: 0, rendering: true }, tt);
    const d = m.toolbarModel({ mode: 'scale', scale: m.ZOOM_MAX, page: 2, pages: 2 }, tt);
    const e = m.toolbarModel({ mode: 'fit', scale: 1, page: 0, pages: 0, rendering: true }, tt, { office: 'report.docx' });
    const by = (arr, id) => arr.find((x) => x.id === id);
    const off = by(e, 'office') || {};
    return [
      [a.map((x) => x.id), ['fit', 'actual', 'out', 'zoom', 'in', 'spacer', 'pages'], 'Fit width · 100% · − · zoom · + · (spacer) · page count'],
      [[by(a, 'fit').label, by(a, 'fit').title, by(a, 'actual').title, by(a, 'out').title, by(a, 'in').title], ['⟦Fit width⟧', '⟦Fit the page to the window width⟧', '⟦Actual size (100%)⟧', '⟦Zoom out⟧', '⟦Zoom in⟧'], 'every human string goes through the injected t()'],
      [[by(a, 'out').icon, by(a, 'in').icon, !!by(a, 'out').label, !!by(a, 'in').label], ['zoomOut', 'zoomIn', false, false], '− and + are SVG icons (UI_ICONS) with no text label — named by title'],
      [[by(a, 'fit').pressed, by(a, 'actual').pressed, by(b, 'fit').pressed, by(b, 'actual').pressed], [true, false, false, true], 'the pressed state follows the mode'],
      [[by(a, 'zoom').text, by(b, 'zoom').text], ['132%', '100%'], 'the zoom label'],
      [[by(a, 'pages').text, by(a, 'pages').title], ['3 / 80', '⟦Page 3 of 80⟧'], 'the page count and its title (params through t)'],
      [[by(c, 'pages').text, by(c, 'pages').title], ['', ''], 'while rendering the count slot is empty (the pane says Rendering…)'],
      [[by(c, 'out').disabled, by(c, 'in').disabled, by(d, 'out').disabled, by(d, 'in').disabled], [true, false, false, true], '− disabled at the floor, + at the ceiling'],
      [by(b, 'actual').label, '100%', 'the 100% button is a number, not a phrase'],
      [e.map((x) => x.id), ['fit', 'actual', 'out', 'zoom', 'in', 'spacer', 'office', 'pages'], '§7.9 with a file to hand to LibreOffice: "Open in LibreOffice" at the right end, before the page count (none without one — the first row)'],
      [[off.kind, off.icon, off.withLabel, off.label, off.aria], ['button', 'external', true, '⟦Open in LibreOffice⟧', '⟦Open in LibreOffice⟧'], '…an SVG icon WITH its words, named through t() (aria-label = the name)'],
      [off.title, '⟦Opens report.docx in LibreOffice in a VibeSpace window, on the machine that holds it — you edit it there, and Save writes it back in place.⟧', '…its title says what happens, with the file (params through t)'],
      [[off.live, !!off.disabled, 'pressed' in off], [true, false, false], '…usable while the page still renders (live), never disabled (a machine without LibreOffice is answered by the click, never a greyed button), not a toggle'],
    ];
  },
};

const runTable = (m, name) => { try { return TABLES[name](m).every(([got, want]) => (typeof want === 'number' ? near(got, want) : eq(got, want))); } catch { return false; } };

for (const [i, name] of Object.keys(TABLES).entries()) {
  console.log(`${'①②③④⑤⑥⑦⑧⑧⑧⑨⑩'[i]}${name === 'styleTabsResolver' ? 'b' : name === 'symbolBullet' ? 'c' : ''} ${name}`);
  for (const [got, want, label] of TABLES[name](M)) ok(typeof want === 'number' ? near(got, want) : eq(got, want), label, { got, want });
}
console.log('⑥b refusalText — every refusal is a sentence through t()');
{
  const tt = (s) => '⟦' + s + '⟧';
  for (const code of ['binary-word', 'ole', 'empty', 'other']) {
    const s = M.refusalText(code, tt);
    ok(/^⟦.{10,}⟧$/.test(s), `${code}: "${s.slice(0, 70)}…"`);
  }
  ok(/\.docx/.test(M.refusalText('binary-word')) && /Word or LibreOffice/.test(M.refusalText('binary-word')), 'the .doc refusal says what to do (open in Word / LibreOffice, save as .docx)');
}

// ⑪ i18n census over both files
console.log('⑪ i18n — every t() literal of the model and the DOM half has zh AND ja');
{
  const zh = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
  const ja = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const lits = new Set();
  for (const f of [MODEL_REL, 'src/lib/docx-viewer.js']) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf8');
    for (const mm of src.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) lits.add(mm[1].replace(/\\'/g, "'"));
  }
  ok(lits.size >= 12, `found the viewer's t() literals (${lits.size})`);
  const missing = [...lits].filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':'));
  ok(missing.length === 0, 'every one has a zh AND a ja entry', missing);
}

// ⑫ wiring pins
console.log('⑫ wiring pins');
const FV = fs.readFileSync(path.join(REPO, 'src/lib/file-viewer.js'), 'utf8');
const DV = fs.readFileSync(path.join(REPO, 'src/lib/docx-viewer.js'), 'utf8');
{
  const branch = FV.slice(FV.indexOf("viewerType === 'docx'"), FV.indexOf("viewerType === 'pptx'"));
  ok(/import \{[^}]*\bviewerVerdict\b[^}]*\} from '\.\/docx-viewer-model\.js'/.test(FV), 'file-viewer.js imports viewerVerdict from the model');
  ok(/import \{[^}]*\brenderDocxViewer\b[^}]*\} from '\.\/docx-viewer\.js'/.test(FV), 'file-viewer.js imports renderDocxViewer');
  const iv = branch.indexOf('viewerVerdict(ext)'), ir = branch.indexOf('renderDocxViewer(');
  ok(iv > 0 && ir > iv && !/fetch\(/.test(branch.slice(0, ir)), "the docx branch asks viewerVerdict(ext) FIRST and fetches nothing before it (a .doc is refused before any fetch)");
  ok(/refusalText\(verdict\.code, t\)/.test(branch), 'the refusal sentence comes from refusalText through t');
  ok(!/from 'docx-preview'/.test(FV) && !/renderAsync/.test(FV), 'file-viewer.js no longer calls docx-preview directly (the old renderAsync path is gone)');
  ok(/if \(ctl\.signal\.aborted\) return true;/.test(FV), 'a superseded render never paints its error over the render that replaced it');
  const libUsers = fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js') && /from 'docx-preview'/.test(fs.readFileSync(path.join(REPO, 'src/lib', f), 'utf8')));
  ok(eq(libUsers, ['docx-viewer.js']), 'docx-viewer.js is the ONE importer of docx-preview', libUsers);
  const body = DV.replace(/^import[\s\S]*?from '\.\/docx-viewer-model\.js';/m, '');
  for (const fn of ['fitWidthScale', 'zoomStep', 'wheelScale', 'pageIndexAt', 'sniffVerdict', 'refusalText', 'linkVerdict', 'inheritHeaderFooterRefs', 'styleTabsResolver', 'symbolBullet', 'parseZoomPref', 'serializeZoomPref', 'toolbarModel']) {
    ok(new RegExp('\\b' + fn + '\\(').test(body), `docx-viewer.js calls ${fn}()`);
  }
  const opts = DV.slice(DV.indexOf('DOCX_RENDER_OPTIONS = Object.freeze('), DV.indexOf('});', DV.indexOf('DOCX_RENDER_OPTIONS = Object.freeze(')));
  for (const [k, v] of [['experimental', 'true'], ['ignoreFonts', 'true'], ['breakPages', 'true'], ['ignoreLastRenderedPageBreak', 'true'], ['renderHeaders', 'true'], ['renderFooters', 'true'], ['renderFootnotes', 'true'], ['ignoreWidth', 'false'], ['inWrapper', 'true']]) {
    ok(new RegExp('\\b' + k + ': ' + v + '\\b').test(opts), `DOCX_RENDER_OPTIONS.${k} = ${v}`);
  }
  ok(/parseAsync\(buf, DOCX_RENDER_OPTIONS\)/.test(DV) && /renderDocument\(doc, bodyBox, styleBox, DOCX_RENDER_OPTIONS\)/.test(DV), 'parse and render both take DOCX_RENDER_OPTIONS');
  ok(/attachShadow\(\{ mode: 'open' \}\)/.test(DV), 'the document renders into a shadow root');
  ok(/doc\.loadAltChunk = /.test(DV) && /setAttribute\('sandbox', ''\)/.test(DV), 'altChunk HTML is intercepted and re-hosted in a sandbox="" iframe');
  ok(/document\.fonts\.add\(face\)/.test(DV) && /document\.fonts\.delete\(face\)/.test(DV), 'embedded fonts are registered on document.fonts and removed on close');
  ok(/applyHeaderInheritance\(doc\);\s*applyStyleTabs\(doc\);\s*applySymbolBullets\(doc\);/.test(DV) && DV.indexOf('applySymbolBullets(doc);') < DV.indexOf('await renderDocument('), 'header inheritance, style tab stops and Symbol bullets are applied BEFORE render');
  ok(/localStorage\.(get|set)Item\(ZOOM_PREF_KEY/.test(DV), 'the zoom is remembered under ZOOM_PREF_KEY');
  ok(/scale\(\$\{1 \/ z\}\)/.test(DV) && /hasTabs \? sleep\(500\)/.test(DV), 'the tab-stop pass runs at NET scale 1 (1 / uiScale) and the stack is shown after it');
  const vcss = fs.readFileSync(path.join(REPO, 'public/viewers.css'), 'utf8');
  const scss = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  ok(!/\.docx-preview\b/.test(vcss), 'the old .docx-preview rules (theme text colour on a white page, the padded scroller) are gone');
  const block = vcss.slice(vcss.indexOf('/* ── Word document viewer'), vcss.indexOf('/* ── CodeMirror Editor'));
  ok(block.length > 200 && !/#[0-9a-f]{3,8}\b|rgba?\(|\b(white|black|gray|grey)\b(?!-)/i.test(block.replace(/\/\*[\s\S]*?\*\//g, '')), 'the viewer CSS uses theme vars only (no literal colour)');
  ok(/--paper: #ffffff;/.test(scss.slice(0, scss.indexOf('[data-theme="light"]'))), '--paper is defined once for every theme (a page is paper)');
  const paperCss = DV.slice(DV.indexOf('const PAPER_CSS = `'), DV.indexOf('`;', DV.indexOf('const PAPER_CSS = `')));
  ok(/background: var\(--paper\)/.test(paperCss) && /box-shadow: var\(--shadow-window\)/.test(paperCss) && !/#[0-9a-f]{3,8}\b|rgba?\(|\b(white|black|gray|grey)\b(?!-)/i.test(paperCss.replace(/--paper/g, '')), 'the page = var(--paper) + var(--shadow-window), no literal colour in the shadow CSS');
  ok(!/color:\s*var\(--text\)/.test(paperCss + block), 'no rule paints the theme text colour onto the page');
  const icons = fs.readFileSync(path.join(REPO, 'src/lib/icons.js'), 'utf8');
  ok(/\bzoomOut:\s*_s\(/.test(icons) && /\bzoomIn:\s*_s\(/.test(icons), 'UI_ICONS carries zoomOut / zoomIn (SVG)');
  ok(/node\.setAttribute\('aria-label', it\.aria \|\| it\.title\)/.test(DV) && /node\.title = it\.title/.test(DV), 'every toolbar button gets title + aria-label (icon-only buttons are named; "Open in LibreOffice" by its own name)');
  ok(/node\.disabled = !!it\.disabled \|\| \(state\.rendering && !it\.live\);/.test(DV) && /toolbarModel\(state, t, \{ office: office \? office\.file : null \}\)/.test(DV), '§7.9 the office button is drawn from the model and stays enabled while rendering (`live`)');
  ok(/office: FileViewer\._officeOpener\(app, filePath, host\)/.test(branch), '§7.9 the docx branch hands the viewer its "Open in LibreOffice" (file-viewer.js decides what a click does — test-office-open pins the door)');
}

console.log('⑬ the model is PURE');
{
  const src = fs.readFileSync(MODEL, 'utf8');
  ok(!/^\s*import\b/m.test(src) && !/\brequire\(/.test(src), 'docx-viewer-model.js imports nothing');
  ok(!/\b(document|window)\.|\blocalStorage\b|\bfetch\(/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'and touches no DOM, storage or network');
}

console.log('⑭ controls — a patched copy of each rule turns its table red');
{
  const C = mutantCopies('docx-viewer-model', REPO);
  const src = fs.readFileSync(MODEL, 'utf8');
  const MUTANTS = [
    ['fitWidthScale', 'pad on one side only', 'return clampScale((p - 2 * Math.max(0, Number(pad) || 0)) / w);', 'return clampScale((p - Math.max(0, Number(pad) || 0)) / w);'],
    ['zoomStep', 'a between-rungs scale steps to the rung it is past', 'return [...ZOOM_STEPS].reverse().find((z) => z < s - EPS) ?? ZOOM_MIN;', 'return [...ZOOM_STEPS].reverse().find((z) => z <= s + 0.1) ?? ZOOM_MIN;'],
    ['wheelScale', 'the wheel direction inverted', 'Math.exp(-d / WHEEL_DIVISOR)', 'Math.exp(d / WHEEL_DIVISOR)'],
    ['pageIndexAt', 'no end-of-scroll rule', 'if (scrollH > 0 && vh > 0 && st + vh >= scrollH - 1) return tops.length - 1;', ''],
    ['viewerVerdict', 'a .doc sent to the renderer', "if (e === 'doc' || e === 'dot') return { kind: 'refuse', code: 'binary-word' };", "if (e === 'doc' || e === 'dot') return { kind: 'render' };"],
    ['sniffVerdict', 'no OLE sniff', "if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';", ''],
    ['linkVerdict', 'a DENYlist (only javascript: blocked)', "if (scheme === 'http' || scheme === 'https' || scheme === 'mailto') return { kind: 'external', href: bare };", "if (scheme !== 'javascript' && scheme) return { kind: 'external', href: bare };"],
    ['styleTabsResolver', "no basedOn walk (only a style's own stops)", 'id = s.basedOn;', 'id = null;'],
    ['symbolBullet', 'no mapping (the private-use code point passes through)', "return text.replace(/[\\uf000-\\uf0ff]/g, (ch) => table[ch] ?? ch);", 'return text;'],
    ['inheritHeaderFooterRefs', 'no inheritance (each section only its own)', 'h = merge(h, s && s.headerRefs);', 'h = merge([], s && s.headerRefs);'],
    ['zoomPref', 'junk read as a scale', "if (!Number.isFinite(n) || n <= 0) return { mode: 'fit', scale: null };", "if (!Number.isFinite(n) || n <= 0) return { mode: 'scale', scale: 1 };"],
    ['toolbarModel', 'a label that bypasses t()', "label: t('Fit width')", "label: 'Fit width'"],
  ];
  for (const [rule, what, a, b] of MUTANTS) {
    if (!src.includes(a)) { ok(false, `${rule} CONTROL: the patch anchor is still in the module`, a); continue; }
    const f = C.write(MODEL_REL, src.replace(a, b), rule);
    const mm = await import(pathToFileURL(f).href);
    ok(runTable(M, rule) && !runTable(mm, rule), `${rule} CONTROL (${what}): the real module passes its table, the patched copy FAILS it`);
  }
  for (const r of copiesCensus(C.files, C.dir, REPO, { minCopies: MUTANTS.length, label: '⑭ ' })) ok(r.pass, r.name, r.detail);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'} · ${Date.now() - T0} ms`);
process.exit(fail ? 1 : 0);
