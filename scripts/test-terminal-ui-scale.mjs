#!/usr/bin/env node
// TERMINAL SELECTION UNDER THE UI SCALE (2.369.118, userW inc-mu92zsgw-6c9y: "the
// login terminal cannot copy text — the selection takes the wrong lines"): xterm
// maps the mouse by `clientX - rect.left` (ZOOMED px under the body's DPI zoom)
// over a cell size it measured in LAYOUT px, so a drag at row 20 selected row
// 20×scale (measured on a standalone harness: zoom 1.25 → row 25). The fix is
// inc-mtdrm922's rule applied to every xterm container — counter-zoom (net zoom
// 1) with the font size scaled back up so nothing visible changes. This suite
// pins the wiring; scripts/test-terminal-zoom-select.mjs (heavy, chrome) drives
// real mouse events through the fix. Run: node scripts/test-terminal-ui-scale.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const term = read('src/lib/terminal.js'), utils = read('src/lib/utils.js'), app = read('src/lib/app.js'), vv = read('src/lib/vnc-view.js'), rec = read('src/lib/incident-recorder.js');

console.log('§1 ONE counter-zoom rule, ONE definition');
ok('utils.js defines COUNTER_ZOOM verbatim (var-reactive, net zoom 1)', /export const COUNTER_ZOOM = 'calc\(1 \/ var\(--ui-scale, 1\)\)';/.test(utils));
ok('vnc-view.js re-exports it instead of spelling the calc() again', /export \{ COUNTER_ZOOM \};/.test(vv) && !/const COUNTER_ZOOM = /.test(vv));
ok('the calc() literal appears in exactly one src/lib file', fs.readdirSync(path.join(repo, 'src/lib')).filter((f) => f.endsWith('.js') && /calc\(1 \/ var\(--ui-scale/.test(read('src/lib/' + f))).join() === 'utils.js');

console.log('§2 the terminal container is counter-zoomed and every font-size writer scales by uiScale()');
ok('terminal.js imports uiScale + COUNTER_ZOOM from utils', /import \{[^}]*\buiScale\b[^}]*\bCOUNTER_ZOOM\b[^}]*\} from '\.\/utils\.js'/.test(term));
ok('the container gets style.zoom = COUNTER_ZOOM before xterm opens in it', /container\.style\.zoom = COUNTER_ZOOM;[\s\S]{0,4000}this\.terminal\.open\(container\)/.test(term) && term.indexOf('container.style.zoom = COUNTER_ZOOM') < term.indexOf('this.terminal.open(container)'));
ok('_xtermPx = visual px × uiScale() (2-decimal, 14 when unset)', /_xtermPx\(visualPx\) \{ const s = uiScale\(\) \|\| 1; return Math\.round\(\(visualPx \|\| 14\) \* s \* 100\) \/ 100; \}/.test(term));
const writers = [...term.matchAll(/(?:^\s*fontSize:|options\.fontSize =)\s*([^,\n]+)/gm)].map((m) => m[1].trim()); // the Terminal option (line-leading) + every options.fontSize assignment; the overrides default `fontSize: null` is mid-line
ok(`every fontSize writer in terminal.js goes through _xtermPx (${writers.length} writers)`, writers.length >= 3 && writers.every((w) => /^this\._xtermPx\(/.test(w)), writers);
ok('rescale() re-derives from the override or the global size, clears the atlas and fits', /rescale\(\) \{\n\s*this\.terminal\.options\.fontSize = this\._xtermPx\(this\.overrides\.fontSize \|\| this\._getGlobalFontSize\(\)\);\n\s*try \{ this\.terminal\.clearTextureAtlas\(\); \} catch \{\}\n\s*this\.fit\(\);/.test(term));
ok('app.js: a UI-scale change calls rescale() on every TerminalSession (a bare fit() would keep the old glyph size)', /_refitAllTerminals\(\) \{[\s\S]{0,600}session\.rescale\(\)/.test(app));
ok('app.js: the global font-size row applies through applyOverride (no raw options.fontSize write anywhere in app.js)', /session\.applyOverride\('fontSize', null\)/.test(app) && !/session\.terminal\.options\.fontSize =/.test(app));

console.log('§3 forensics: the incident snapshot now says whether a UI scale was on');
ok('incident-recorder snapshot carries uiScale + dpr + bodyZoom (the report that started this had no way to tell)', /out\.uiScale = uiScale\(\); out\.dpr = window\.devicePixelRatio; out\.bodyZoom = document\.body\.style\.zoom/.test(rec) && /\buiScale\b[^\n]*from '\.\/utils\.js'/.test(rec));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
