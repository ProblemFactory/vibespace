#!/usr/bin/env node
// test-brand-svg — lane backend-icons (the owner 2026-10-23, the sidebar's 后端 filter: Claude and Codex with their
// marks, «Antigravity CLI» with none: 「图标补一下」). public/brand/antigravity.svg and opencode.svg opened with an XML
// comment holding `--backend-icon-color`; a double hyphen inside a comment is ill-formed XML, so Chrome refused the
// whole file — as a CSS mask nothing painted, as an <img> the broken-image glyph. THE INVARIANT: an asset the product
// draws is proven to parse where it is drawn. This is the fast drift guard (PURE, in-process): over the UNION of
// (a) every SVG under public/ (the served tree), (b) every BACKEND_META iconSrc, (c) every /brand/<name>.svg path the
// code spells (src/** + public/index.html + public/*.css; a template path resolves through TEMPLATES or is RED), the
// file exists AND passes a minimal STRICT XML checker written here (no dependency; xmllint is not on the box). RED
// CONTROLS: the shipped 2.369.348 antigravity.svg is refused for its comment, every rule refuses its own fixture, a
// referenced-but-absent path and an unresolvable template are RED. The browser leg (an image per iconSrc loads, every
// 后端 popover row paints pixels) is test-sidebar-scroll's, heavy. Measured against Chrome (an <img> of each fixture,
// lane backend-icons): every RED fixture below is a load error there too except the DOCTYPE (a policy, stricter than
// Chrome); every GREEN one loads.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}${x ? ` — ${x}` : ''}`); } };

// ── the checker: what an XML parser refuses, the subset a drawn SVG can trip ──────────────────────────────────────
const NAME = /^[A-Za-z_:][\w.:-]*/;
const ENTITY = /^&(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/;   // no DTD ⇒ only the five predefined entities
const SVG_NS = 'http://www.w3.org/2000/svg';
export function xmlProblems(src) {
  const s = src.replace(/^﻿/, ''), bad = [], stack = [];
  const amp = (t, where) => { for (let k = t.indexOf('&'); k >= 0; k = t.indexOf('&', k + 1)) if (!ENTITY.test(t.slice(k))) { bad.push(`a stray & ${where} (${JSON.stringify(t.slice(k, k + 10))})`); return; } };
  let i = 0, roots = 0, root = null;
  if (s.startsWith('<?xml')) { const e = s.indexOf('?>'); if (e < 0) return ['an unterminated XML declaration']; i = e + 2; }
  while (i < s.length) {
    const lt = s.indexOf('<', i), text = s.slice(i, lt < 0 ? s.length : lt);
    if (text) { if (!stack.length && text.trim()) bad.push(`text outside the root element (${JSON.stringify(text.trim().slice(0, 16))})`); else amp(text, 'in text'); }
    if (lt < 0) break;
    i = lt;
    if (s.startsWith('<!--', i)) {
      const e = s.indexOf('-->', i + 4);
      if (e < 0) { bad.push('an unterminated comment'); break; }
      const body = s.slice(i + 4, e), k = body.indexOf('--');
      if (k >= 0 || body.endsWith('-')) bad.push(`a double hyphen inside a comment (${JSON.stringify(k >= 0 ? body.slice(Math.max(0, k - 16), k + 24) : body.slice(-16) + '-->')})`);
      i = e + 3; continue;
    }
    if (s.startsWith('<![CDATA[', i)) {
      const e = s.indexOf(']]>', i);
      if (!stack.length) bad.push('a CDATA section outside the root element');
      if (e < 0) { bad.push('an unterminated CDATA section'); break; }
      i = e + 3; continue;
    }
    if (s.startsWith('<!', i)) { bad.push(`a markup declaration (${JSON.stringify(s.slice(i, i + 14))}) — a drawn asset carries no DTD (policy, the one rule stricter than Chrome: a DTD's entities are a second parser's guess)`); const e = s.indexOf('>', i); i = e < 0 ? s.length : e + 1; continue; }
    if (s.startsWith('<?', i)) {
      const e = s.indexOf('?>', i), target = s.slice(i + 2).match(NAME)?.[0] || '';
      if (e < 0) { bad.push('an unterminated processing instruction'); break; }
      if (!target || /^xml$/i.test(target)) bad.push('an XML declaration past the start of the file');
      i = e + 2; continue;
    }
    if (s.startsWith('</', i)) {
      const m = s.slice(i + 2).match(/^([A-Za-z_:][\w.:-]*)\s*>/);
      if (!m) { bad.push(`a malformed end tag (${JSON.stringify(s.slice(i, i + 14))})`); break; }
      const top = stack.pop();
      if (top !== m[1]) bad.push(`</${m[1]}> closes ${top ? `<${top}>` : 'nothing'}`);
      i += 2 + m[0].length; continue;
    }
    const nm = s.slice(i + 1).match(NAME);
    if (!nm) { bad.push(`a stray < (${JSON.stringify(s.slice(i, i + 12))})`); i++; continue; }
    const attrs = new Map();
    let j = i + 1 + nm[0].length, self = false, closed = false;
    while (j < s.length) {
      const ws = s.slice(j).match(/^\s*/)[0]; j += ws.length;
      if (s.startsWith('/>', j)) { self = closed = true; j += 2; break; }
      if (s[j] === '>') { closed = true; j++; break; }
      const a = s.slice(j).match(/^([A-Za-z_:][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/);
      if (!a || !ws) { bad.push(`<${nm[0]}>: a malformed attribute (${JSON.stringify(s.slice(j, j + 16))})`); break; }
      if (attrs.has(a[1])) bad.push(`<${nm[0]}>: the attribute ${a[1]} twice`);
      attrs.set(a[1], a[2] ?? a[3]); amp(a[2] ?? a[3], `in ${a[1]}="…"`);
      j += a[0].length;
    }
    if (!closed) { if (!bad.some((b) => b.startsWith(`<${nm[0]}>:`))) bad.push(`<${nm[0]} never closes`); break; }
    if (!stack.length) { if (++roots === 1) root = { name: nm[0], attrs }; else bad.push(`more than one root element (<${nm[0]}>)`); }
    if (!self) stack.push(nm[0]);
    i = j;
  }
  if (stack.length) bad.push(`unclosed <${stack.join('> <')}>`);
  if (!root) bad.push('no root element');
  else if (root.name !== 'svg') bad.push(`the root element is <${root.name}>, not <svg>`);
  else if (root.attrs.get('xmlns') !== SVG_NS) bad.push(`the root <svg> lacks xmlns="${SVG_NS}" (an image outside the SVG namespace paints nothing)`);
  return bad;
}

// ── the census: which brand files the product draws, and who names them ─────────────────────────────────────────────
const walk = (dir, keep, out = []) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, keep, out); } else if (keep(e.name)) out.push(p); } return out; };
const BRAND_REF = /\/brand\/([a-z0-9][a-z0-9_-]*|\$\{[^}]+\})\.svg/gi;
// a path SPELLED through a template: the file → the names it can produce (read from the table that feeds it)
export const TEMPLATES = {
  // channel-chrome accountBadge: `url(/brand/${mark}.svg)` for a `vendor-<x>` glyph the icon library holds
  'src/lib/channel-chrome.js': () => [...readFileSync(path.join(ROOT, 'src/lib/icons.js'), 'utf8').matchAll(/^\s*'vendor-([a-z]+)'\s*:/gm)].map((m) => m[1]),
};
export function brandRefs(files) {   // files: [{ rel, text }] → { refs: Map(webPath → Set(who)), unresolved: [who] }
  const refs = new Map(), unresolved = [];
  const add = (p, who) => { if (!refs.has(p)) refs.set(p, new Set()); refs.get(p).add(who); };
  for (const { rel: r, text } of files) {
    for (const m of text.matchAll(BRAND_REF)) {
      if (!m[1].startsWith('${')) { add(`/brand/${m[1]}.svg`, r); continue; }
      const names = TEMPLATES[r]?.() || [];
      if (!names.length) { unresolved.push(`${r}: ${m[0]}`); continue; }
      for (const n of names) add(`/brand/${n}.svg`, `${r} (${m[0]} ⇒ ${n})`);
    }
  }
  return { refs, unresolved };
}
export function census({ served, meta, files }) {   // → rows [{ web, file, who, exists, problems }] + unresolved templates
  const { refs, unresolved } = brandRefs(files);
  for (const m of meta) if (m.iconSrc) { if (!refs.has(m.iconSrc)) refs.set(m.iconSrc, new Set()); refs.get(m.iconSrc).add(`BACKEND_META.${m.id}.iconSrc`); }
  for (const f of served) { const web = '/' + f.replace(/^public\//, ''); if (!refs.has(web)) refs.set(web, new Set()); refs.get(web).add('served'); }
  const rows = [...refs].sort(([a], [b]) => a.localeCompare(b)).map(([web, who]) => {
    const file = path.join(ROOT, 'public', web), exists = existsSync(file);
    return { web, file: rel(file), who: [...who], exists, problems: exists ? xmlProblems(readFileSync(file, 'utf8')) : [] };
  });
  return { rows, unresolved };
}

const t0 = performance.now();
const { BACKEND_META } = await import(pathToFileURL(path.join(ROOT, 'src/lib/agent-meta.js')).href);
const served = walk(path.join(ROOT, 'public'), (n) => n.endsWith('.svg')).map(rel);
const readers = [...walk(path.join(ROOT, 'src'), (n) => /\.(m?js|cjs|css|html)$/.test(n)), path.join(ROOT, 'public/index.html'), ...readdirSync(path.join(ROOT, 'public')).filter((n) => n.endsWith('.css')).map((n) => path.join(ROOT, 'public', n))];
const files = readers.map((p) => ({ rel: rel(p), text: readFileSync(p, 'utf8') }));

console.log('① the census — every brand SVG the product draws exists and parses as XML');
const C = census({ served, meta: Object.values(BACKEND_META), files });
for (const r of C.rows) ok(r.exists && !r.problems.length, `${r.file} ${r.exists ? 'parses' : 'EXISTS'} — named by ${r.who.join(' · ')}`, r.exists ? r.problems.join('; ') : 'referenced but absent');
ok(!C.unresolved.length, 'every /brand/ path spelled through a template resolves (TEMPLATES)', C.unresolved.join('; '));
const metaSrcs = Object.values(BACKEND_META).filter((m) => m.iconSrc);
ok(metaSrcs.length >= 4 && metaSrcs.every((m) => C.rows.some((r) => r.web === m.iconSrc)), `every BACKEND_META iconSrc is in the census (${metaSrcs.map((m) => m.id).join(', ')})`);
const joined = C.rows.filter((r) => r.who.includes('served') && r.who.length >= 2);
ok(joined.length >= 7, `the census joins both sides: ${joined.length} served files are also named by code (${joined.map((r) => r.web.slice(7)).join(' ')})`);

console.log('② RED CONTROL — the shipped 2.369.348 antigravity.svg (the file the owner saw draw nothing)');
const BASE = 'c1dfc1af';
const BASE_COMMENT = '<!-- Antigravity CLI mark (monochrome, VibeSpace-drawn): an upward arch over a rising chevron — used as a CSS mask, fill is recolored by --backend-icon-color -->';
const now = readFileSync(path.join(ROOT, 'public/brand/antigravity.svg'), 'utf8');
let shipped = null;
try { shipped = execFileSync('git', ['-C', ROOT, 'cat-file', '-p', `${BASE}:public/brand/antigravity.svg`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* a shallow clone: the embedded line */ }
if (shipped !== null) ok(shipped.split('\n')[0] === BASE_COMMENT, `the embedded control line IS the first line of git's ${BASE}:public/brand/antigravity.svg`);
else console.log(`  SKIP the byte check against git's ${BASE} (a shallow clone holds no such object) — the control runs on the embedded line + today's drawing`);
const control = shipped ?? BASE_COMMENT + now.slice(now.indexOf('\n'));
const cv = xmlProblems(control);
ok(cv.length && /double hyphen inside a comment/.test(cv[0]) && /--backend-icon-color/.test(cv[0]), `the checker REFUSES the shipped file: ${cv[0]}`, JSON.stringify(cv));
ok(!xmlProblems(now).length && !now.split('-->')[0].slice(4).includes('--'), 'today\'s antigravity.svg passes and its comment holds no double hyphen');

console.log('③ RED CONTROLS — each rule refuses its own fixture; the well-formed shapes pass');
const G = `<svg xmlns="${SVG_NS}" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>`;
const REDS = [
  ['a double hyphen inside a comment', '<!-- recolored by --backend-icon-color -->\n' + G, /double hyphen/],
  ['a comment ending in a hyphen', '<!-- mark --->' + G, /double hyphen/],
  ['an unterminated comment', '<!-- mark ' + G, /unterminated comment/],
  ['a DOCTYPE (policy — Chrome loads one; the census does not)', '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">' + G, /markup declaration/],
  ['a stray & in text', G.replace('<path', '<title>R&D</title><path'), /stray &/],
  ['an entity XML does not define (&nbsp;)', G.replace('<path', '<title>a&nbsp;b</title><path'), /stray &/],
  ['a stray & in an attribute', G.replace('viewBox', 'data-x="a&b" viewBox'), /stray &/],
  ['a mismatched end tag', G.replace('</svg>', '<g></svg>'), /closes|unclosed/],
  ['an unclosed root', G.replace('</svg>', ''), /unclosed/],
  ['two root elements', G + G, /more than one root/],
  ['a root that is not svg', '<html xmlns="http://www.w3.org/1999/xhtml"></html>', /not <svg>/],
  ['no SVG namespace', G.replace(` xmlns="${SVG_NS}"`, ''), /lacks xmlns/],
  ['text outside the root', 'mark' + G, /outside the root/],
  ['the same attribute twice', G.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24" viewBox="0 0 1 1"'), /twice/],
  ['an unquoted attribute', G.replace('viewBox="0 0 24 24"', 'width=24'), /malformed attribute/],
  ['a < inside an attribute', G.replace('viewBox="0 0 24 24"', 'data-x="a<b"'), /malformed attribute/],
  ['attributes with no space between them', G.replace('viewBox="0 0 24 24"', 'width="1"height="1"'), /malformed attribute/],
  ['an XML declaration past the start', ' <?xml version="1.0"?>' + G, /XML declaration past the start/],
];
for (const [what, src, want] of REDS) { const v = xmlProblems(src); ok(v.some((p) => want.test(p)), `refuses ${what}: ${v[0] || '(passed)'}`, JSON.stringify(v)); }
const GREENS = [
  ['the bare shape', G],
  ['a declaration, comments around the root, single hyphens', `<?xml version="1.0" encoding="UTF-8"?>\n<!-- a - b, a mask recoloured by the backend-icon-color custom property -->\n${G}\n<!-- tail -->\n`],
  ['the predefined + numeric entities and CDATA', G.replace('<path', '<title>R&amp;D &#38; &#x26; &lt;3</title><style><![CDATA[a > b && c]]></style><path')],
  ['single-quoted attributes, self-closing tags, a BOM', '﻿' + G.replace('viewBox="0 0 24 24"', "viewBox='0 0 24 24'").replace('<path', '<g/><path')],
];
for (const [what, src] of GREENS) { const v = xmlProblems(src); ok(!v.length, `passes ${what}`, JSON.stringify(v)); }

console.log('④ RED CONTROLS — the census itself');
const absent = census({ served: [], meta: [{ id: 'ghost', iconSrc: '/brand/ghost-backend.svg' }], files: [{ rel: 'src/lib/x.js', text: "const a = '/brand/nope.svg';" }] });
ok(absent.rows.length === 2 && absent.rows.every((r) => !r.exists), `a referenced-but-absent path is RED (${absent.rows.map((r) => r.web).join(', ')})`);
const tpl = census({ served: [], meta: [], files: [{ rel: 'src/lib/elsewhere.js', text: 'g.style.setProperty("--m", `url(/brand/${who}.svg)`);' }] });
ok(tpl.unresolved.length === 1 && /elsewhere\.js/.test(tpl.unresolved[0]), `a template path outside TEMPLATES is RED: ${tpl.unresolved[0]}`);
const chan = brandRefs([{ rel: 'src/lib/channel-chrome.js', text: 'g.style.setProperty(\'--mark\', `url(/brand/${mark}.svg)`);' }]);
ok(['gmail', 'lark', 'slack'].every((n) => chan.refs.has(`/brand/${n}.svg`)), `the channel badge template resolves through icons.js's vendor-* glyphs (${[...chan.refs.keys()].join(', ')})`);
ok(!brandRefs([{ rel: 'a.js', text: '// public/brand/<vendor>.svg and public/brand/{lark,gmail}.svg' }]).refs.size, 'prose spellings (<vendor>, {a,b}) are not paths');

console.log(`\ntest-brand-svg: ${pass} passed, ${fail} failed (${(performance.now() - t0).toFixed(0)} ms in-process)`);
process.exit(fail ? 1 : 0);
