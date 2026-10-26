#!/usr/bin/env node
// THE DIAGRAM RULES (lane chat-mermaid, 2.369.351 — the owner: 「能不能展示 flowchart？」) — fast, PURE (no DOM: this
// repo ships no DOM library, so DOMPurify + the browser's CSS parser run in the heavy leg, scripts/test-chat-mermaid-chrome.mjs).
//   §1 WHICH FENCE IS A DIAGRAM — marked's own tokens (``` / ~~~, any case, inside lists / quotes), OPEN vs CLOSED
//   §2 THE LIBRARY'S CONFIG — strict, HTML labels off, every directive door `secure`
//   §3 THE THEME — each built-in theme's live background (public/style.css) → mermaid dark / default
//   §4 THE FAILURE VERDICT — its shape and its line
//   §5 NOTHING FROM THE NETWORK — a picture off the diagram is refused before mermaid ever sees the source
//   §6 THE SVG WALL (src/lib/safe-html.js) — its config, the id / class / reference / selector / value judges, fail closed
//   §7 THE CENSUS — every markdown parse in src/lib draws diagrams through the ONE door or is listed with its reason (RED
//      control: an unlisted new consumer); no CDN script anywhere in src/ (RED control: the shipped CDN line); mermaid is
//      imported only by its lazy entry; the build, the stamped link, the CSP unchanged
//   §8 THE WORDS — zh + ja for the card
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, name, detail) => { if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const imp = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const M = await imp('src/lib/mermaid-model.js');
const S = await imp('src/lib/safe-html.js');
const { marked } = require(path.join(REPO, 'node_modules', 'marked'));

// ── §1 ──
console.log('§1 WHICH FENCE IS A DIAGRAM');
const FLOW = 'flowchart TD\n  A[Start] --> B{Is it?}\n  B -->|Yes| C[OK]\n  C --> D[Rethink]\n  D --> B\n  B ---->|No| E[End]\n  E --> F((Done))';
const CASES = [
  // [name, markdown, expected [{closed}] in order]
  ['a closed ``` fence', 'Here:\n\n```mermaid\n' + FLOW + '\n```\n\nafter', [true]],
  ['a closed ~~~ fence', '~~~mermaid\n' + FLOW + '\n~~~\n', [true]],
  ['the info word in any case', '```Mermaid\ngraph LR\nA-->B\n```', [true]],
  ['a fence still being streamed (no closing fence yet)', 'Look:\n```mermaid\nflowchart LR\n  A --> B', [false]],
  ['a closing fence half written (``) is still open', '```mermaid\nA-->B\n``', [false]],
  ['a shorter closing fence does not close a ```` fence', '````mermaid\nA-->B\n```\nC-->D', [false]],
  ['a ~~~ line does not close a ``` fence', '```mermaid\nA-->B\n~~~\n', [false]],
  ['inside a list item and a quote, in document order', '- one\n\n  ```mermaid\n  A-->B\n  ```\n\n> ```mermaid\n> C-->D\n> ```\n\n```mermaid\nE-->F', [true, true, false]],
  ['another language is not a diagram', '```js\nconst a = 1;\n```\n```mermaidx\nA\n```', []],
  ['an indented code block is not a diagram', '    mermaid\n    A-->B\n', []],
];
for (const [name, md, want] of CASES) {
  const got = M.diagramFences(marked.lexer(md));
  const drawn = (marked.parse(md).match(/<pre><code class="language-mermaid"/gi) || []).length;
  ok(JSON.stringify(got.map((f) => f.closed)) === JSON.stringify(want) && drawn === want.length, `${name} ⇒ ${JSON.stringify(want)} (marked.parse draws ${drawn} <pre> in the same order)`, { got, drawn });
}
ok(M.diagramFences(marked.lexer('```mermaid\n' + FLOW + '\n```'))[0].code === FLOW, 'the fence\'s code is the diagram source as written');
ok(M.mayHoldDiagram('x\n```mermaid\nA') && M.mayHoldDiagram('~~~ mermaid\nA') && M.mayHoldDiagram('- ```mermaid') && !M.mayHoldDiagram('the word mermaid in prose') && !M.mayHoldDiagram('```js\n'), 'the cheap pre-check sees an opener (also in a list) and nothing else');
ok(M.isMermaidLang('mermaid') && M.isMermaidLang('MERMAID') && M.isMermaidLang('mermaid title') && !M.isMermaidLang('mermaidjs') && !M.isMermaidLang(''), 'isMermaidLang: the info word, any case, nothing else');

// ── §2 ──
console.log('§2 THE LIBRARY\'S CONFIG');
const C = M.mermaidConfig({ theme: 'dark', fontFamily: 'Inter, "Noto Sans SC"</style>{x}' });
ok(C.securityLevel === 'strict' && C.startOnLoad === false && C.suppressErrorRendering === true, 'securityLevel strict, no auto-run, no error picture (the card shows the source instead)', C);
ok(C.htmlLabels === false && C.flowchart.htmlLabels === false && C.class.htmlLabels === false && C.state.htmlLabels === false, 'HTML labels off everywhere (an HTML label is a <foreignObject>)');
const MUST_SECURE = ['htmlLabels', 'securityLevel', 'theme', 'themeCSS', 'themeVariables', 'fontFamily', 'altFontFamily', 'dompurifyConfig', 'maxTextSize', 'secure'];
ok(MUST_SECURE.every((k) => C.secure.includes(k)), 'every door a diagram\'s own %%{init}%% / front matter could re-open is secure: ' + MUST_SECURE.join(' · '), C.secure);
ok(!/[<>{};]/.test(C.fontFamily) && C.fontFamily.startsWith('Inter'), 'the measured font reaches mermaid without CSS-breaking characters', C.fontFamily);
ok(M.mermaidConfig({ theme: 'default' }).theme === 'default' && M.mermaidConfig({ theme: 'default' }).darkMode === false && C.theme === 'dark' && C.darkMode === true, 'the theme rides into mermaid (dark ⇒ dark + darkMode)');

// ── §3 ──
console.log('§3 THE THEME');
const css = read('public/style.css');
const bgOf = (sel) => { const i = css.indexOf(sel); const b = css.slice(i, css.indexOf('}', i)); const m = /--bg-window:\s*([^;]+);/.exec(b); return m ? m[1].trim() : null; };
const WANT = { dark: 'dark', light: 'default', dracula: 'dark', nord: 'dark', solarized: 'dark', monokai: 'dark' };
for (const [name, want] of Object.entries(WANT)) {
  const bg = name === 'dark' ? bgOf(':root, [data-theme="dark"]') : bgOf(`[data-theme="${name}"]`);
  ok(bg && M.mermaidThemeFor(bg) === want, `theme ${name} (--bg-window ${bg}) ⇒ mermaid ${want}`);
}
ok(M.mermaidThemeFor('rgb(255, 255, 255)') === 'default' && M.mermaidThemeFor('rgb(18, 18, 42)') === 'dark' && M.mermaidThemeFor('rgba(0, 0, 0, 0)') === 'dark' && M.mermaidThemeFor('') === 'dark' && M.mermaidThemeFor('#fdf6e3') === 'default',
  'computed rgb() strings, a transparent / unreadable colour ⇒ dark (the default theme), a light custom colour ⇒ default');

// ── §4 ──
console.log('§4 THE FAILURE VERDICT');
const perr = Object.assign(new Error("Parse error on line 3:\n...D  A --> B  B --> [oops  C --> D\n---------------------^\nExpecting 'AMP', 'COLON', got 'SQS'"), { hash: { loc: { first_line: 3, last_line: 3 } } });
const v = M.diagramVerdict(perr);
ok(JSON.stringify(Object.keys(v)) === '["ok","kind","line","message"]' && v.ok === false && v.kind === 'parse' && v.line === 3, 'mermaid\'s parse error ⇒ { ok:false, kind:"parse", line:3, message }', v);
ok(/^Parse error on line 3:/.test(v.message) && /Expecting/.test(v.message) && !/\.\.\.|\^/.test(v.message), 'the message keeps mermaid\'s words, never its ascii pointer lines', v.message);
ok(M.diagramVerdict(new Error('Lexical error on line 7. Unrecognized text.')).line === 7, 'a line named only in the words is read too');
ok(M.diagramVerdict(new Error('No diagram type detected matching given configuration for text: hello')).line === null && M.diagramVerdict(new Error('No diagram type detected')).kind === 'error', 'no line ⇒ line null, kind error');
ok(M.diagramVerdict(new Error('Failed to fetch dynamically imported module'), { kind: 'load' }).kind === 'load' && M.diagramVerdict('Maximum text size in diagram exceeded').kind === 'size', 'the load failure and the size cap have their own kind');

// ── §5 ──
console.log('§5 NOTHING FROM THE NETWORK');
ok(JSON.stringify(M.pictureRefs('flowchart LR\n  A@{ img: "https://example.invalid/x.png", label: "pic" } --> B')) === '["https://example.invalid/x.png"]', 'a node picture on another host is named (mermaid would fetch it while drawing)');
ok(M.pictureRefs("A@{ img: '/api/file/raw?path=/etc/x' }").length === 1 && M.pictureRefs('A@{img:"//cdn.example/x.png"}').length === 1 && M.pictureRefs('A@{ img: "" }').length === 1, 'a same-origin path, a scheme-relative URL and an empty one are refused too (only data:image draws)');
ok(M.pictureRefs('A@{ img: "data:image/png;base64,iVBORw0KGgo=" }').length === 0 && M.pictureRefs(FLOW).length === 0, 'a picture inside the diagram (data:image/…) and a diagram without pictures pass');

// ── §6 ──
console.log('§6 THE SVG WALL (src/lib/safe-html.js sanitizeDiagramSvg)');
const SC = S.SAFE_SVG_CONFIG;
ok(Object.isFrozen(SC) && Object.isFrozen(SC.FORBID_TAGS) && Object.isFrozen(SC.FORBID_ATTR) && JSON.stringify(Object.keys(SC).sort()) === '["ALLOW_DATA_ATTR","FORBID_ATTR","FORBID_TAGS","USE_PROFILES"]', 'the config is frozen and names exactly its four keys (any widening is a decision reviewed here)', Object.keys(SC));
ok(JSON.stringify(SC.USE_PROFILES) === '{"svg":true,"svgFilters":true}' && SC.ALLOW_DATA_ATTR === false, 'SVG + SVG filters only (no HTML element survives), no data-*');
const MUST_TAGS = ['foreignObject', 'a', 'image', 'feImage', 'use', 'script', 'animate', 'animateMotion', 'animateTransform', 'set', 'iframe', 'object', 'embed'];
ok(MUST_TAGS.every((x) => SC.FORBID_TAGS.includes(x)), 'forbidden: ' + MUST_TAGS.join(' '), SC.FORBID_TAGS);
ok(SC.FORBID_ATTR.includes('tabindex') && SC.FORBID_ATTR.includes('attributename'), 'no tabindex (nothing in a picture takes the keyboard), no attributeName');
const SCOPE = 'vsdtest0001';
ok(S.scopedId('anything', SCOPE, { root: true }) === SCOPE && S.scopedId(SCOPE + '_flowchart-v2-pointEnd', SCOPE) === SCOPE + '_flowchart-v2-pointEnd' && S.scopedId(SCOPE + '-x', SCOPE) === SCOPE + '-x'
  && S.scopedId('actor0', SCOPE) === SCOPE + '-actor0' && S.scopedId(SCOPE, SCOPE) === SCOPE + '-' + SCOPE && S.scopedId(SCOPE + 'x', SCOPE) === SCOPE + '-' + SCOPE + 'x' && S.scopedId('app', SCOPE) === SCOPE + '-app',
  'ids: the root is the scope; scope-/scope_ ids stay; a bare id (actor0, app) and the root\'s own id on an inner element are renamed under it');
ok(S.diagramValue('url(#m_flow-pointEnd)', SCOPE) === `url(#${SCOPE}-m_flow-pointEnd)` && S.diagramValue(`url( "#${SCOPE}_g" )`, SCOPE) === `url(#${SCOPE}_g)` && S.diagramValue('#333', SCOPE) === '#333' && S.diagramValue('translate(10, 20)', SCOPE) === 'translate(10, 20)',
  'a value: an in-picture url(#x) follows the id rule, a plain value is kept');
const DROP = ['url(https://example.invalid/x.png)', "url('//evil/x')", 'url(data:image/png;base64,AAA)', '\\75 rl(https://x)', 'image-set("x.png" 1x)', '-webkit-image-set(url(#a) 1x)', 'cross-fade(url(#a), url(#b), 50%)', 'element(#app)', 'url(', 'expression(alert(1))'];
for (const d of DROP) ok(S.diagramValue(d, SCOPE) === null, `dropped value: ${d}`);
ok(S.diagramClass('node default') === 'mmd-node mmd-default' && S.diagramClass('chat-img-overlay ut-exit-cmd') === 'mmd-chat-img-overlay mmd-ut-exit-cmd' && S.diagramClass('"><x 9a') === '',
  'classes: every token prefixed mmd- (a product class never survives as ours), a non-identifier token dropped');
const SEL = [
  [`#${SCOPE} .node rect`, `#${SCOPE} .mmd-node rect`], [`#${SCOPE}`, `#${SCOPE}`], [`#${SCOPE} > g.cluster:not(.x)`, `#${SCOPE} > g.mmd-cluster:not(.mmd-x)`],
  [`#${SCOPE} [class="a.b"] .c`, `#${SCOPE} [class="a.b"] .mmd-c`], [`#${SCOPE}:hover .label`, `#${SCOPE}:hover .mmd-label`],
  ['body', null], ['.node', null], [`#${SCOPE}x .a`, null], [`#${SCOPE} ~ *`, null], [`#${SCOPE} + g`, null], [`#${SCOPE}:has(+ x)`, null],
  [`#${SCOPE} || td`, null], [':root', null], [`#${SCOPE} :root`, null], [`:is(#${SCOPE}, body) g`, null], [`#${SCOPE} \\2e x`, null], [`#${SCOPE} & g`, null], [`#${SCOPE} [x="a`, null],
];
for (const [sel, want] of SEL) ok(S.diagramSelector(sel, SCOPE) === want, `selector ${JSON.stringify(sel)} ⇒ ${want === null ? 'dropped' : JSON.stringify(want)}`, S.diagramSelector(sel, SCOPE));
ok(JSON.stringify(S.splitSelectors('a, b:is(c, d), [x=","] , e')) === '["a","b:is(c, d)","[x=\\",\\"]","e"]', 'a selector list splits on its top-level commas only');
const attr = (tag, name, value, parentNs = 'http://www.w3.org/1999/xhtml') => { const d = { attrName: name, attrValue: value, keepAttr: true }; S.diagramAttribute({ nodeName: tag, parentNode: { namespaceURI: parentNs } }, d, SCOPE); return d.keepAttr ? d.attrValue : null; };
const SVGNS = 'http://www.w3.org/2000/svg';
ok(attr('svg', 'id', 'whatever') === SCOPE && attr('svg', 'id', 'inner', SVGNS) === SCOPE + '-inner' && attr('g', 'id', 'node-1', SVGNS) === SCOPE + '-node-1', 'the attribute judge: the ROOT svg takes the scope id, a nested svg / any element a scoped one');
ok(attr('path', 'marker-end', 'url(#m_pointEnd)', SVGNS) === `url(#${SCOPE}-m_pointEnd)` && attr('path', 'stroke', 'url(#linearGradient-4)', SVGNS) === `url(#${SCOPE}-linearGradient-4)` && attr('path', 'fill', 'url(https://example.invalid/p.svg#g)', SVGNS) === null,
  'references: url(#x) re-pointed with the id (so it still finds its marker / gradient), a url() off the picture dropped');
ok(attr('textPath', 'href', '#p1', SVGNS) === `#${SCOPE}-p1` && attr('textPath', 'xlink:href', 'https://example.invalid/', SVGNS) === null && attr('g', 'href', 'javascript:alert(1)', SVGNS) === null, 'href / xlink:href: only #fragments, re-pointed; anything else (a javascript: or https: link) dropped');
ok(attr('g', 'class', 'node chat-agent-view-btn', SVGNS) === 'mmd-node mmd-chat-agent-view-btn' && attr('g', 'class', '"', SVGNS) === null, 'class through the prefix (a forged product control is never one of ours)');
ok(attr('g', 'transform', 'translate(1,2)', SVGNS) === 'translate(1,2)' && attr('text', 'filter', 'url(#f)', SVGNS) === `url(#${SCOPE}-f)`, 'a geometric value is kept as written');
let threw = null;
try { S.sanitizeDiagramSvg('<svg></svg>', SCOPE); } catch (e) { threw = String(e.message); }
ok(/no DOM/.test(threw || ''), 'FAIL CLOSED: without a DOM sanitizeDiagramSvg THROWS — it never hands the picture back unsanitized', threw);
threw = null; try { S.sanitizeDiagramSvg('<svg></svg>', 'x'); } catch (e) { threw = String(e.message); }
ok(/scope/.test(threw || ''), 'a render without its own scope id is refused', threw);
threw = null; try { S.scopeDiagramCss('a{}', SCOPE); } catch (e) { threw = String(e.message); }
ok(/CSS parser/.test(threw || ''), 'the CSS re-read refuses to run without the browser\'s CSS parser (a <style> is never kept unread)', threw);

// ── §7 ──
console.log('§7 THE CENSUS');
const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((f) => /\.m?js$/.test(f) && fs.existsSync(path.join(REPO, f)));
const LIB = tracked.filter((f) => f.startsWith('src/lib/'));
const code = (t) => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\s\/\/\s.*$/, ''))).join('\n');
// a file that parses markdown: it imports from 'marked' or builds a Marked instance
const PARSES = (t) => /from\s*['"]marked['"]/.test(t) || /\bnew\s+Marked\(/.test(t);
const DRAWS = (t) => /import\s*\{[^}]*\bmountDiagrams\b[^}]*\}\s*from\s*'\.\/mermaid-render\.js'/.test(t) && (code(t).match(/\bmountDiagrams\(/g) || []).length >= 1;
const NO_DIAGRAM = {
  'src/lib/doc-window.js': 'the Doc window hands `Marked` to the reading render (Export HTML / Copy as HTML / Print) — its output leaves the app (a file, the clipboard, a print frame); the window itself edits the source in Tiptap, a fence there is code (a later lane)',
  'src/lib/doc-window-model.js': 'readingHtml — the same reading render (Export / Copy / Print), PURE: no DOM to draw into',
};
// (lane foryou-honest P1-2: the For-you window draws an item's words as plain text through the tray's renderer — no markdown
// parse there any more, so no fence to draw: the census would list it the moment it parsed markdown again)
const WANT_DRAW = ['src/lib/chat-renderers.js', 'src/lib/code-editor.js', 'src/lib/file-viewer.js', 'src/lib/jobs-panel.js'];
function mdCensus(files, readF) {
  const out = { draws: [], listed: [], unlisted: [] };
  for (const f of files) {
    const t = readF(f);
    if (!PARSES(t)) continue;
    if (DRAWS(t)) out.draws.push(f); else if (NO_DIAGRAM[f]) out.listed.push(f); else out.unlisted.push(f);
  }
  return out;
}
const cen = mdCensus(LIB, read);
ok(cen.unlisted.length === 0, `every markdown parse in src/lib (${cen.draws.length + cen.listed.length} files) draws diagrams through mountDiagrams or is listed with its reason`, cen.unlisted);
ok(WANT_DRAW.every((f) => cen.draws.includes(f)), 'the doors that show somebody else\'s markdown draw: ' + WANT_DRAW.map((f) => path.basename(f)).join(' · '), cen);
ok(Object.keys(NO_DIAGRAM).every((f) => cen.listed.includes(f)), 'every NO_DIAGRAM row still names a markdown parser (a stale row would hide a new one)', cen.listed);
const ZZ = 'src/lib/zz-new-md-door.js';
const red = mdCensus([...LIB, ZZ], (f) => (f === ZZ ? "import { marked } from 'marked';\nimport { sanitizeHtml } from './safe-html.js';\nexport const show = (el, s) => { el.innerHTML = sanitizeHtml(marked.parse(s)); };\n" : read(f)));
ok(red.unlisted.length === 1 && red.unlisted[0] === ZZ, 'RED CONTROL: a scratch copy adding an unlisted consumer (a new markdown door without the diagram door) is caught', red.unlisted);
const cr = read('src/lib/chat-renderers.js');
ok(/addDiagrams\(el\) \{ return mountDiagrams\(el, \{ app: this\.app \}\); \}/.test(cr) && /this\.addDiagrams\(el\); \/\/ lane chat-mermaid/.test(cr) && /if \(block\.closest\('\.chat-diagram'\)\) continue;/.test(cr), 'the chat: addWrapToggles (every message create / replace / gap render) draws first and gives a card\'s source no second toolbar');
ok(/this\._renderers\.addDiagrams\(textDiv\);/.test(read('src/lib/chat-view.js')) && /html = this\._markOpenFences\(text, html\);/.test(cr) && /pre\.setAttribute\('data-fence-open', ''\)/.test(cr), 'the stream: each frame draws its closed fences; an open fence is marked and stays code');
// no third-party script origin: the CDN the editor's preview used (dead weight under the app's CSP — kb-design-lessons §8)
// a script LOADED from another origin anywhere in src/ (import / from / <script src> / .src = '….js' / importScripts), and a
// known script CDN's host anywhere in the client's code (src/lib) — a server-side download URL (src/app-recipes.js's
// installers) is neither
const SCRIPT_LOAD = /\bimport\(\s*['"`]https?:\/\/|\bfrom\s*['"]https?:\/\/|<script[^>]+src\s*=\s*["']?https?:\/\/|\.src\s*=\s*['"`]https?:\/\/[^'"`]*\.m?js\b|importScripts\(\s*['"`]https?:/i;
const CDN_HOST = /\b(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|cdn\.skypack\.dev|esm\.run|ga\.jspm\.io)\b/;
const cdnHits = (files, readF) => files.filter((f) => { const c = code(readF(f)); return SCRIPT_LOAD.test(c) || (f.startsWith('src/lib/') && CDN_HOST.test(c)); });
ok(cdnHits(tracked, read).length === 0, `no script from another origin in the code of ${tracked.length} src files (every script the app runs is served by this origin)`, cdnHits(tracked, read));
ok(!SCRIPT_LOAD.test(read('public/index.html')), 'index.html loads no script from another origin');
const SHIPPED_CDN = "            script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';\n";
ok(cdnHits(['src/lib/code-editor.js'], () => read('src/lib/code-editor.js') + SHIPPED_CDN).length === 1, 'RED CONTROL: the line 2.369.348 shipped in code-editor.js is caught');
const mermaidImports = tracked.filter((f) => /from\s*['"]mermaid['"]|import\(\s*['"]mermaid['"]\s*\)|require\(\s*['"]mermaid['"]\s*\)/.test(code(read(f))));
ok(JSON.stringify(mermaidImports) === '["src/mermaid-entry.js"]', 'mermaid is imported by its lazy entry ONLY (it never rides the main bundle)', mermaidImports);
const pkg = JSON.parse(read('package.json'));
ok(/\^11\./.test(pkg.dependencies.mermaid || ''), 'mermaid ^11 is a dependency', pkg.dependencies.mermaid);
ok(/esbuild src\/mermaid-entry\.js --bundle --outfile=public\/mermaid\.js --format=esm --platform=browser --target=es2020 --minify/.test(pkg.scripts.build), 'npm run build makes public/mermaid.js (ESM, minified) beside doc-editor.js');
ok(/^public\/mermaid\.js$/m.test(read('.gitignore')), 'the built file is gitignored like public/novnc.js');
const ix = read('public/index.html');
ok(/<link rel="vs-lazy-bundle" href="\/mermaid\.js">/.test(ix), 'index.html names the lazy bundle by a link that fetches nothing (an unknown rel)');
const srvRe = /html = html\.replace\((\/[^\n]+\/g), \(m, attr, file\) =>/.exec(read('server.js'));
const stamped = srvRe ? ix.replace(eval(srvRe[1]), (m, a, f) => `${a}="/${f}?v=1792800000000"`) : '';
ok(srvRe && /<link rel="vs-lazy-bundle" href="\/mermaid\.js\?v=1792800000000">/.test(stamped), 'the index route\'s own stamping regex (read off server.js) gives it ?v=<mtime> like bundle.js — a stale tab never runs an old copy', srvRe && srvRe[1]);
const mr = read('src/lib/mermaid-render.js');
ok(mr.includes(`document.querySelector('link[rel="vs-lazy-bundle"][href^="/mermaid.js"]')`) && /import\(mermaidHref\(\)\)/.test(mr) && /new URL\(\(link && link\.getAttribute\('href'\)\) \|\| '\/mermaid\.js', location\.origin\)/.test(mr), 'the door imports the stamped address from THIS origin');
const csp = require(path.join(REPO, 'src/app-csp.js'));
const scriptSrc = csp.APP_POLICY.find(([d]) => d === 'script-src');
ok(JSON.stringify(scriptSrc[1]) === `["'self'","'report-sample'"]`, 'the app page\'s CSP is unchanged — script-src \'self\' (a new origin is NOT the fix)', scriptSrc);
ok(/sanitizeDiagramSvg\(out && out\.svg, scope\)/.test(mr) && /fig\.innerHTML = rescope\(r\.svg, r\.scope, newScope\(\)\);/.test(mr) && (code(mr).match(/innerHTML\s*=/g) || []).length === 1, 'the door\'s ONE innerHTML is the sanitized picture (r.svg = sanitizeDiagramSvg\'s output, re-scoped)');
ok(/mermaid\.initialize\(mermaidConfig\(\{ theme, fontFamily \}\)\)/.test(mr) && /const pics = pictureRefs\(src\);/.test(mr), 'every render initializes with THE config and runs the picture refusal first');

// ── §8 ──
console.log('§8 THE WORDS');
const zh = (await imp('src/lib/i18n-zh.js')).default, ja = (await imp('src/lib/i18n-ja.js')).default;
const WORDS = { 'Diagram': ['图', '図'], 'diagram::Source': ['源码', 'ソース'], 'Copy': ['复制', 'コピー'], 'Enlarge': ['放大', '拡大'], 'Rendering failed': ['渲染失败', '描画に失敗しました'] };
for (const [k, [z, j]] of Object.entries(WORDS)) ok(zh[k] === z && ja[k] === j, `「${k}」 zh ${z} · ja ${j}`, [zh[k], ja[k]]);
const keys = [...mr.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]).concat([...mr.matchAll(/\btc\('([^']+)', '([^']+)'\)/g)].map((m) => m[1] + '::' + m[2]));
const missing = keys.filter((k) => !zh[k.replace(/\\u2019/g, '’').replace(/\\u2026/g, '…')] || !ja[k.replace(/\\u2019/g, '’').replace(/\\u2026/g, '…')]);
ok(keys.length >= 10 && missing.length === 0, `every word the card says (${keys.length}) has zh + ja`, missing);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass} passed)`);
process.exit(fail ? 1 : 0);
