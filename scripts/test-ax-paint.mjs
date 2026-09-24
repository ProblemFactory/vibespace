#!/usr/bin/env node
// PAINT-ONLY STRUCTURE STAYS OUT OF THE ACCESSIBILITY TREE — the fast census
// (docs/design-accessibility-tree.zh.md §3 row 2 + row 3 in their §8 lean form;
// chunk a2 of the lean set). The heavy leg (test-ax-budget) counts what Chrome
// serialises; this leg pins, from the SOURCE, that every paint-only element is
// marked before it is born, and that marking never took a control's only name.
//
//   ① icons.js — `_s()` (the ONE helper every UI/file icon goes through) emits
//     `aria-hidden="true" focusable="false"` on the <svg>; FUNCTIONAL over the
//     exported values (the two raw strings that bypass the helper are covered
//     because the values are what ships, not the helper).
//   ② the icon-only <button> census — every <button> in a src/lib template whose
//     content is nothing but an icon (an `${UI_ICONS.…}` / `${FILE_ICONS.…}` /
//     backend-icon interpolation, an inline <svg>, an entity) MUST carry `title=`
//     or `aria-label=` (an aria-hidden icon is no longer a name; the button
//     would be announced as "button"); the same rule over DOM-built buttons
//     (`x = document.createElement('button')` … `x.innerHTML = <rhs>;` whose
//     right-hand side, once its icon references are taken out, has no letters
//     or digits left — `UI_ICONS.k`, `UI_ICONS.k + ' '`, `` `${UI_ICONS.k}` ``
//     are icon-only; `UI_ICONS.inbox + segs` carries text). The classifier is
//     run over a fixture string as its own negative control, and the whole
//     census over a SCRATCH COPY of src/lib with a nameless `+ ' '` button
//     planted in it (the verifier's LOW-1 form, which the exact-statement
//     classifier passed green) — it must be flagged, by file and id.
//   ③ the paint-only sites — `.chat-code-ln` gutters, `.chat-diff-prefix`,
//     `.chat-run-arrow`, every spinner (`chat-spinner` / `upload-active-spinner`
//     — a census: every creation site carries the attribute, not a hand-picked
//     list), the 8 resize handles, the `.chat-minimap` strip, the tab strip's
//     `.tab-split-glyph` (2.369.162, the DOM successor of the CSS `⫿` glyph) —
//     each carries aria-hidden at the source; the TOC button is a SIBLING of the strip.
//   ④ the CSS glyph census — every `content:` string that is a GLYPH (a `\25B8`-
//     style escape or a non-ASCII character, and no letters) carries the alt-text
//     form `content: '…' / ""` as the LAST content declaration of its rule (the
//     plain declaration stays first as the fallback for a parser without the
//     slash syntax), and no TEXT string (letters) carries it — a sentence the
//     user reads must not vanish from the tree.
//   ⑤ ci.mjs carries this suite (fast tier).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_ICONS, UI_ICONS } from '../src/lib/icons.js';
import { scratch } from './scratch.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf-8');
const lib = path.join(repo, 'src', 'lib');
const libFiles = fs.readdirSync(lib).filter((f) => f.endsWith('.js')).sort();

// ── ① icons.js ──
{
  const src = read('src/lib/icons.js');
  ok(/const _s = \(d, opts = \{\}\) => \{[\s\S]*?return `<svg aria-hidden="true" focusable="false" style=/.test(src),
    '① icons.js `_s()` emits aria-hidden="true" focusable="false" on the <svg>');
  const all = [...Object.entries(FILE_ICONS).map(([k, v]) => ['FILE_ICONS.' + k, v]), ...Object.entries(UI_ICONS).map(([k, v]) => ['UI_ICONS.' + k, v])];
  const bad = all.filter(([, v]) => !(typeof v === 'string' && /^<svg [^>]*aria-hidden="true"[^>]*focusable="false"/.test(v)));
  ok(all.length >= 60 && bad.length === 0, `① every exported icon value (${all.length}) is an <svg> carrying aria-hidden + focusable="false" (${bad.length} without)`, bad.slice(0, 5).map(([k]) => k).join(', '));
}

// ── ② the icon-only <button> census ──
const ICON = /\$\{(?:UI_ICONS|FILE_ICONS)(?:\.\w+|\[[^\]]+\])(?:\s*\|\|\s*(?:UI_ICONS|FILE_ICONS)\.\w+)?\}|\$\{(?:createBackendIconHtml|createBackendIcon|createModeBackendIcon|windowTypeIcon)\([^}]*\)\}|<svg[\s\S]*?<\/svg>|&#\d+;|&[a-z]+;/g;
// every <button>…</button> in a template: { line, attrs, inner, iconOnly, named }
function templateButtons(src) {
  const out = []; const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g; let m;
  while ((m = re.exec(src))) {
    const attrs = m[1], inner = m[2];
    const hasIcon = ICON.test(inner); ICON.lastIndex = 0;
    if (!hasIcon) continue;
    const rest = inner.replace(ICON, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    const iconOnly = !/[\p{L}\p{N}]/u.test(rest) && !/\$\{/.test(rest);   // no letters/digits and no other interpolation = nothing to name it by
    if (!iconOnly) continue;
    out.push({ line: src.slice(0, m.index).split('\n').length, attrs: attrs.replace(/\s+/g, ' ').trim(), inner: inner.replace(/\s+/g, ' ').trim(), named: /\b(?:title|aria-label|aria-labelledby)=/.test(attrs) });
  }
  return out;
}
// DOM-built: `x = document.createElement('button')` then, within 60 lines, `x.innerHTML = <rhs>;` whose
// right-hand side is icon-only by the template branch's own test — the icon references (and tags / entities,
// as in a template) taken out, no letter or digit and no other interpolation is left (`UI_ICONS.k`,
// `UI_ICONS.k + ' '`, `` `${UI_ICONS.k}` ``; NOT `UI_ICONS.inbox + segs`) — named by `x.title =` or
// `x.setAttribute('aria-label'` in the same window. The exact-statement form this replaced
// (`x.innerHTML = UI_ICONS.k;` only) passed `nb.innerHTML = UI_ICONS.copy + ' ';` green (verifier LOW-1).
const ICON_REF = /\$\{(?:UI_ICONS|FILE_ICONS)(?:\.\w+|\[[^\]]+\])(?:\s*\|\|\s*(?:(?:UI_ICONS|FILE_ICONS)\.\w+|''|""))?\}|(?:UI_ICONS|FILE_ICONS)(?:\.\w+|\[[^\]]+\])(?:\s*\|\|\s*(?:(?:UI_ICONS|FILE_ICONS)\.\w+|''|""))?/g;
function rhsIconOnly(rhs) {
  if (!new RegExp(ICON_REF.source).test(rhs)) return false;
  const rest = rhs.replace(ICON_REF, '').replace(/<[^>]+>/g, '').replace(/&#\d+;|&[a-z]+;/g, '');
  if (/\$\{/.test(rest)) return false;
  return !/[\p{L}\p{N}]/u.test(rest.replace(/[\s'"`+]/g, ''));
}
function domButtons(src) {
  const out = []; const lines = src.split('\n');
  const re = /^\s*(?:const |let |var )?((?:this\.)?[\w$]+) = document\.createElement\('button'\)/;
  lines.forEach((ln, i) => {
    const m = ln.match(re); if (!m) return;
    const id = m[1], esc = id.replace(/[.$]/g, '\\$&');
    const win = lines.slice(i, i + 60).join('\n');
    const rhs = [...win.matchAll(new RegExp(`(?<![\\w$.])${esc}\\.innerHTML = ([^;\\n]+);`, 'g'))].map((a) => a[1]);
    if (!rhs.some(rhsIconOnly)) return;
    out.push({ line: i + 1, id, named: new RegExp(`${esc}\\.title = |${esc}\\.setAttribute\\('aria-label'`).test(win) });
  });
  return out;
}
// the whole ② census over a directory of .js files
function census(dir) {
  const tRows = [], dRows = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf-8');
    for (const r of templateButtons(src)) tRows.push({ f, ...r });
    for (const r of domButtons(src)) dRows.push({ f, ...r });
  }
  return { tRows, dRows, tBad: tRows.filter((r) => !r.named), dBad: dRows.filter((r) => !r.named) };
}
{
  const { tRows, dRows, tBad, dBad } = census(lib);
  console.log(`  census: ${tRows.length} icon-only template buttons (${tRows.map((r) => `${r.f}:${r.line}`).join(', ')}) + ${dRows.length} DOM-built (${dRows.map((r) => `${r.f}:${r.line} ${r.id}`).join(', ')})`);
  ok(tRows.length + dRows.length >= 5, `② the census is non-vacuous (${tRows.length + dRows.length} icon-only buttons across src/lib)`);
  ok(tBad.length === 0, `② every icon-only template <button> carries title= or aria-label= (${tBad.length} unnamed)`, tBad.map((r) => `${r.f}:${r.line} <button ${r.attrs}>`).join('\n    '));
  ok(dBad.length === 0, `② every DOM-built icon-only button sets .title or aria-label (${dBad.length} unnamed)`, dBad.map((r) => `${r.f}:${r.line} ${r.id}`).join('\n    '));
  // NEGATIVE CONTROL — the classifier itself: an unnamed icon-only button, a named one, a button with text
  const fx = 'x = `<button class="a">${UI_ICONS.copy}</button><button class="b" title="${escHtml(t(\'Copy\'))}">${UI_ICONS.copy}</button><button class="c">${UI_ICONS.copy}<span>${escHtml(t(\'Copy\'))}</span></button><button class="d">&#9776;</button>`;\n'
    + "const z = document.createElement('button');\nz.innerHTML = UI_ICONS.bolt;\n"
    + "const nb = document.createElement('button');\nnb.innerHTML = UI_ICONS.copy + ' ';\n"
    + "const tb = document.createElement('button');\ntb.innerHTML = `${UI_ICONS.copy}`;\ntb.title = t('Copy');\n"
    + "const mb = document.createElement('button');\nmb.innerHTML = UI_ICONS.inbox + segs;\n";
  const ft = templateButtons(fx), fd = domButtons(fx);
  ok(ft.length === 3 && ft.filter((r) => !r.named).map((r) => r.attrs).join('|') === 'class="a"|class="d"' && ft.find((r) => /class="b"/.test(r.attrs))?.named === true
    && fd.map((r) => `${r.id}:${r.named}`).join('|') === 'z:false|nb:false|tb:true',
    '② NEGATIVE CONTROL: the classifier flags an unnamed icon-only button (an SVG interpolation, an entity glyph, a DOM-built one, a DOM-built `icon + \' \'` one), passes a titled one (template and DOM) and ignores one with text (template, and `UI_ICONS.inbox + segs`)', JSON.stringify({ ft, fd }));
  // NEGATIVE CONTROL — the census itself, over a SCRATCH COPY of src/lib with the verifier's nameless button planted in a real file
  const dir = scratch('ax-paint-negctl');
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of libFiles) fs.copyFileSync(path.join(lib, f), path.join(dir, f));
    const target = path.join(dir, 'chat-input.js'), src = fs.readFileSync(target, 'utf-8');
    const anchor = src.indexOf('\n  constructor(');
    const planted = src.slice(0, anchor + 1) + "  _axPaintNegctl() {\n    const nb = document.createElement('button');\n    nb.className = 'chat-input-copy';\n    nb.innerHTML = UI_ICONS.copy + ' ';\n    return nb;\n  }\n" + src.slice(anchor + 1);
    fs.writeFileSync(target, planted);
    const c = census(dir);
    ok(anchor > 0 && c.dBad.length === 1 && c.dBad[0].f === 'chat-input.js' && c.dBad[0].id === 'nb' && c.tBad.length === 0 && c.dRows.length === dRows.length + 1,
      `② NEGATIVE CONTROL: the census over a scratch copy of src/lib with \`nb.innerHTML = UI_ICONS.copy + ' ';\` planted in chat-input.js FAILS ② on exactly that button (${c.dBad.map((r) => `${r.f}:${r.line} ${r.id}`).join(', ') || 'nothing flagged'})`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ── ③ the paint-only sites carry aria-hidden at the source ──
{
  const hl = read('src/lib/highlight.js'), cr = read('src/lib/chat-renderers.js'), cv = read('src/lib/chat-view.js'), win = read('src/lib/window.js'), mm = read('src/lib/chat-minimap.js'), tg = read('src/lib/tab-group.js');
  const count = (s, re) => (s.match(re) || []).length;
  const ln = count(hl, /<span class="chat-code-ln"/g), lnH = count(hl, /<span class="chat-code-ln" aria-hidden="true"/g);
  ok(ln >= 2 && ln === lnH, `③ every .chat-code-ln gutter span in highlight.js is aria-hidden (${lnH} of ${ln})`);
  const dp = count(cr, /<span class="chat-diff-prefix"/g), dpH = count(cr, /<span class="chat-diff-prefix" aria-hidden="true"/g);
  ok(dp >= 2 && dp === dpH, `③ every .chat-diff-prefix span in chat-renderers.js is aria-hidden (${dpH} of ${dp})`);
  const ra = count(cv, /<span class="chat-run-arrow"/g), raH = count(cv, /<span class="chat-run-arrow" aria-hidden="true"/g);
  ok(ra >= 2 && ra === raH, `③ every .chat-run-arrow span in chat-view.js is aria-hidden (${raH} of ${ra})`);
  // spinners: a CENSUS over every creation site in src/lib — template `class="…spinner…"` and DOM `className = '…spinner'`
  const sites = [];
  for (const f of libFiles) {
    const src = read('src/lib/' + f); const lines = src.split('\n');
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/<span class="(chat-spinner|upload-active-spinner)"([^>]*)>/g)) sites.push({ f, line: i + 1, kind: m[1], marked: /aria-hidden="true"/.test(m[2]) });
      for (const m of l.matchAll(/(\w+)\.className = '(chat-spinner|upload-active-spinner)';/g)) {
        const id = m[1]; const win2 = lines.slice(i, i + 3).join('\n');
        sites.push({ f, line: i + 1, kind: m[2], marked: new RegExp(`${id}\\.setAttribute\\('aria-hidden', 'true'\\)`).test(win2) });
      }
    });
  }
  const unmarked = sites.filter((s) => !s.marked);
  console.log(`  spinner sites: ${sites.map((s) => `${s.f}:${s.line}`).join(', ')}`);
  ok(sites.length >= 7 && unmarked.length === 0, `③ every spinner creation site is aria-hidden (${sites.length} sites, ${unmarked.length} unmarked)`, unmarked.map((s) => `${s.f}:${s.line}`).join(', '));
  ok(/for \(const dir of \['n','s','e','w','ne','nw','se','sw'\]\) \{\n\s*const h = document\.createElement\('div'\); h\.className = `resize-handle resize-\$\{dir\}`; h\.dataset\.dir = dir; h\.setAttribute\('aria-hidden', 'true'\); el\.appendChild\(h\);/.test(win),
    '③ window.js marks each of the 8 resize handles aria-hidden as it creates it');
  ok(/this\._minimap\.className = 'chat-minimap hidden';[\s\S]{0,600}?this\._minimap\.setAttribute\('aria-hidden', 'true'\);\s*container\.appendChild\(this\._minimap\);/.test(mm),
    '③ chat-minimap.js marks the strip aria-hidden before it is appended');
  ok(/const glyph = document\.createElement\('span'\);\s*glyph\.className = 'tab-split-glyph';\s*glyph\.setAttribute\('aria-hidden', 'true'\);\s*tabBar\.appendChild\(glyph\);/.test(tg),
    '③ tab-group.js marks the split glyph (the divider\'s mirror between the pane tabs) aria-hidden before it is appended');
  ok(/container\.appendChild\(this\._tocBtn\);/.test(mm) && !/this\._minimap\.appendChild\(this\._tocBtn\)/.test(mm) && /this\._tocBtn\.title = t\('Your messages \(outline\)'\);/.test(mm),
    '③ the TOC button is a SIBLING of the strip (appended to the container, never inside the hidden subtree) and keeps its title');
}

// ── ④ the CSS glyph census ──
{
  const STR = String.raw`(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
  const isGlyph = (lit) => { const v = lit.slice(1, -1); return (/\\[0-9A-Fa-f]{2,6}/.test(v) || [...v].some((c) => c.charCodeAt(0) > 127)) && !/[A-Za-z]/.test(v.replace(/\\[0-9A-Fa-f]{2,6}\s?/g, '')); };
  const glyphRules = [], textWithAlt = [], missing = [];
  for (const css of ['public/chat.css', 'public/style.css', 'public/viewers.css', 'public/theme-editor.css']) {
    const src = read(css);
    // every rule block; inside it the ORDERED list of `content:` declarations
    for (const m of src.matchAll(/\{([^{}]*)\}/g)) {
      const decls = [...m[1].matchAll(new RegExp(String.raw`content:\s*(` + STR + String.raw`)(\s*\/\s*"")?\s*;`, 'g'))];
      if (!decls.length) continue;
      const line = src.slice(0, m.index).split('\n').length;
      const last = decls[decls.length - 1];
      const lit = last[1], alt = !!last[2];
      if (isGlyph(lit)) { glyphRules.push({ css, line, lit }); if (!alt) missing.push(`${css}:${line} content: ${lit}`); }
      else if (alt) textWithAlt.push(`${css}:${line} content: ${lit}`);
    }
  }
  console.log(`  glyph rules: ${glyphRules.length} (${[...new Set(glyphRules.map((g) => g.lit))].join(' ')})`);
  ok(glyphRules.length >= 30, `④ the glyph census is non-vacuous (${glyphRules.length} generated-glyph rules across the stylesheets)`);
  ok(missing.length === 0, `④ every generated glyph's LAST content declaration is the alt-text form \`content: '…' / ""\` (${missing.length} plain)`, missing.join('\n    '));
  ok(textWithAlt.length === 0, `④ no generated TEXT (letters) carries the empty alt (${textWithAlt.length} would vanish from the tree)`, textWithAlt.join('\n    '));
  // '⫿' left this list in 2.369.162: the split-member tab's generated `⫿ ` glyph was deleted (design-split-ux R3) —
  // the split mark is now the `.tab-split-glyph` ELEMENT, pinned aria-hidden in ③
  const known = ['\\25B8', '\\25BE', '\\25B4', '\\00B7', '\\200e', '\\25C2', '\\1F464', '\\2699', '▸', '▾', '†'];
  ok(known.every((k) => glyphRules.some((g) => g.lit.includes(k))), `④ the census reaches every glyph family the design named (${known.join(' ')})`);
  ok(isGlyph("'\\25B8  '") && isGlyph("'▸ '") && isGlyph("'\\200e'") && !isGlyph("'Collapse'") && !isGlyph("'Extra row — drag elements here'") && !isGlyph("''"),
    '④ NEGATIVE CONTROL: the glyph classifier takes escapes / symbols / the LRM and refuses words, a sentence with a dash, and the empty string');
}

// ── ⑤ ci.mjs ──
ok(/\{ name: 'test-ax-paint', tier: 'fast' \}/.test(read('scripts/ci.mjs')), '⑤ ci.mjs carries test-ax-paint in the fast tier');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
