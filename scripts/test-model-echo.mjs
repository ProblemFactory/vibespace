#!/usr/bin/env node
// THE `/model` ECHO — ONE parser (src/model-echo.js, 2.369.151).
// The CLI backticks the model token in its confirmation echo
//   <local-command-stdout>Set model to `opus[1m] (claude-opus-5-5[1m])`</local-command-stdout>
// — first in the local corpus at CLI 2.1.257 (2026-09-02; the last plain
// `alias (id)` row is 2.1.226, the last plain bare token 2.1.239); 2.1.280 is
// only the build on which the miss was noticed — and the status bar's inline end-anchored regex stopped matching (the bar
// kept the previous model until the next assistant row), the command card
// showed the raw backticks, and the server's lock repin only kept working by
// the accident of not being end-anchored. Three readers, three spellings.
//   ① the PURE parser over the vendor's VERBATIM lines (the backticked echo, the
//      old echo as the control, alias-only / bare-id forms, raw ANSI, the TUI
//      picker's display-name echo → null, a user typing the words → null when
//      the envelope is required).
//   ② the REAL renderer (esbuild → node): the command card label is spelled
//      without backticks.
//   ③ WIRING PINS (the 2.355.0 unstaged-wiring lesson): the three readers call
//      the helper and no inline `Set model to` regex is left anywhere in src/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ESC = '\x1b';
const ENV = (body) => `<local-command-stdout>${body}</local-command-stdout>`;
// VERBATIM vendor lines (transcript corpus 2026-09-22; model names only — no session data)
const BT_OPUS = ENV('Set model to `opus[1m] (claude-opus-5-5[1m])`');
const BT_FABLE = ENV('Set model to `fable[1m] (claude-fable-5-1)`');
const BT_BARE_ID = ENV('Set model to `claude-opus-5`');
const OLD_ALIAS_ID = ENV('Set model to fable[1m] (claude-fable-5)');
const OLD_OPUS_ID = ENV('Set model to opus[1m] (claude-opus-5[1m])');
const OLD_BARE_ID = ENV('Set model to claude-fable-5');
const OLD_ALIAS_ONLY = ENV('Set model to fable[1m]');
const TUI_BOLD_ALIAS = ENV(`Set model to ${ESC}[1mopus${ESC}[22m`);
const TUI_DISPLAY_SAVED = ENV(`Set model to ${ESC}[1mFable 5${ESC}[22m and saved as your default for new sessions`);
const TUI_DISPLAY_SESSION = ENV(`Set model to ${ESC}[1mOpus 4.7 (1M context) (default)${ESC}[22m for this session`);

const M = require(path.join(REPO, 'src/model-echo.js'));
const { parseSetModelEcho: parse, stripSetModelBackticks: strip } = M;
const R = { envelope: 'required' };

console.log('— ① the PURE parser');
{
  ok('backticked opus echo (2.1.280 row) → alias opus[1m], resolved id claude-opus-5-5[1m]', same(parse(BT_OPUS, R), { alias: 'opus[1m]', id: 'claude-opus-5-5[1m]', quoted: true }), parse(BT_OPUS, R));
  ok('backticked fable echo (2.1.280 row) → alias fable[1m], resolved id claude-fable-5-1', same(parse(BT_FABLE, R), { alias: 'fable[1m]', id: 'claude-fable-5-1', quoted: true }), parse(BT_FABLE, R));
  ok('backticked bare id (2.1.263 row) → alias = the id, no parenthesised id', same(parse(BT_BARE_ID, R), { alias: 'claude-opus-5', id: null, quoted: true }), parse(BT_BARE_ID, R));
  ok('CONTROL: the plain echo (≤2.1.226; backticked since 2.1.257) parses to the same shape', same(parse(OLD_ALIAS_ID, R), { alias: 'fable[1m]', id: 'claude-fable-5', quoted: false }) && same(parse(OLD_OPUS_ID, R), { alias: 'opus[1m]', id: 'claude-opus-5[1m]', quoted: false }), [parse(OLD_ALIAS_ID, R), parse(OLD_OPUS_ID, R)]);
  ok('old bare id / alias-only echoes → id null, alias the token', same(parse(OLD_BARE_ID, R), { alias: 'claude-fable-5', id: null, quoted: false }) && same(parse(OLD_ALIAS_ONLY, R), { alias: 'fable[1m]', id: null, quoted: false }));
  ok('backticks and no backticks name the SAME model (only `quoted` differs)', parse(BT_FABLE).alias === parse(ENV('Set model to fable[1m] (claude-fable-5-1)')).alias && parse(BT_FABLE).id === parse(ENV('Set model to fable[1m] (claude-fable-5-1)')).id);
  ok('raw ANSI bold around the alias is stripped inside → alias opus', same(parse(TUI_BOLD_ALIAS, R), { alias: 'opus', id: null, quoted: true }), parse(TUI_BOLD_ALIAS, R));
  ok('a pre-stripped string keeps the literal 1M suffix `[1m]` (not ANSI)', parse('Set model to opus[1m]')?.alias === 'opus[1m]' && parse(`Set model to ${ESC}[1mopus[1m]${ESC}[22m`)?.alias === 'opus[1m]');
  ok('the TUI picker echo names a DISPLAY NAME, not a model id → null (the bar must not show "Fable")', parse(TUI_DISPLAY_SAVED) === null && parse(TUI_DISPLAY_SESSION) === null, [parse(TUI_DISPLAY_SAVED), parse(TUI_DISPLAY_SESSION)]);
  ok('a quoted token may carry trailing prose; an unquoted one may not', parse('Set model to `opus (claude-opus-5-5)` for this session')?.id === 'claude-opus-5-5' && parse('Set model to opus (claude-opus-5-5) for this session') === null);
  ok('without the envelope: accepted by default, REFUSED when required (a user typing the words is not an echo)', parse('Set model to `opus[1m] (claude-opus-5-5[1m])`')?.id === 'claude-opus-5-5[1m]' && parse('Set model to `opus[1m] (claude-opus-5-5[1m])`', R) === null && parse('Set model to claude-fable-5', R) === null);
  ok('surrounding whitespace is tolerated', parse('  ' + BT_OPUS + '\n', R)?.id === 'claude-opus-5-5[1m]');
  ok('non-echo lines → null', parse(ENV('Compacted. ctrl+o to see full summary'), R) === null && parse('<command-name>/model</command-name>', R) === null && parse(ENV('Set model to'), R) === null && parse(ENV('Set model to `unterminated'), R) === null);
  ok('garbage input → null (never throws)', [undefined, null, 42, {}, '', '<local-command-stdout></local-command-stdout>'].every((x) => parse(x) === null && parse(x, R) === null));
  ok('the card label: the backtick pair removed, a non-echo label untouched', strip('Set model to `opus[1m] (claude-opus-5-5[1m])`') === 'Set model to opus[1m] (claude-opus-5-5[1m])' && strip('Set model to fable[1m] (claude-fable-5)') === 'Set model to fable[1m] (claude-fable-5)' && strip('run `ls`') === 'run `ls`' && strip(null) === null);
  ok('module is PURE (no requires) and registered in the PURE tier', !/require\(/.test(read('src/model-echo.js')) && /'src\/model-echo\.js'/.test(read('scripts/test-architecture.mjs')));
}

console.log('— ② the real renderer (esbuild → node, DOM shimmed): the command card label');
{
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mecho-'));
  const out = path.join(dir, 'chat-renderers.mjs');
  const stubBuildVersion = { name: 'stub-build-version', setup(b) { b.onResolve({ filter: /build-version\.js$/ }, () => ({ path: 'build-version', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: "export const BUILD_VERSION = 'test';", loader: 'js' })); } };
  await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/chat-renderers.js')], bundle: true, format: 'esm', platform: 'node', target: 'es2022', outfile: out, logLevel: 'silent', loader: { '.css': 'text' }, plugins: [stubBuildVersion] });
  const mkEl = () => ({ className: '', dataset: {}, _html: '', classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} }, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}, setAttribute() {}, getAttribute() { return null; } });
  const noop = () => {};
  for (const [k, v] of Object.entries({ addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }), requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: noop, getComputedStyle: () => ({ getPropertyValue: () => '' }), innerWidth: 1024, innerHeight: 768, location: { origin: 'http://test', href: 'http://test/', hostname: 'test', protocol: 'http:' }, scrollTo: noop })) {
    try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); } catch {}
  }
  class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) { try { Object.defineProperty(globalThis, k, { value: NoopObserver, configurable: true, writable: true }); } catch {} }
  globalThis.window = globalThis;
  globalThis.document = { createElement: mkEl, getElementById: () => null, body: mkEl(), documentElement: mkEl(), head: mkEl(), addEventListener: noop, removeEventListener: noop, querySelector() { return null; }, querySelectorAll() { return []; }, createTextNode: (t) => ({ textContent: t }) };
  try { Object.defineProperty(globalThis, 'navigator', { value: { language: 'en', userAgent: 'node' }, configurable: true, writable: true }); } catch {}
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const { ChatRenderers } = await import(out);
  const r = new ChatRenderers({ ws: null, sessionId: 's', app: {}, backend: 'claude', compact: false, messageList: mkEl() });
  const label = (raw) => { const m = /<span class="chat-system-text">([^<]*)<\/span>/.exec(r._renderNotificationMsg(raw)._html); return m ? m[1] : null; };
  ok('backticked echo → "Set model to opus[1m] (claude-opus-5-5[1m])" (no backticks)', label(BT_OPUS) === 'Set model to opus[1m] (claude-opus-5-5[1m])', label(BT_OPUS));
  ok('CONTROL: the old echo renders exactly as before', label(OLD_ALIAS_ID) === 'Set model to fable[1m] (claude-fable-5)', label(OLD_ALIAS_ID));
  ok('the TUI echo still loses its ANSI and keeps its prose', label(TUI_DISPLAY_SAVED) === 'Set model to Fable 5 and saved as your default for new sessions', label(TUI_DISPLAY_SAVED));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

console.log('— ③ wiring pins');
{
  const cv = read('src/lib/chat-view.js');
  const cr = read('src/lib/chat-renderers.js');
  const sj = read('src/server/stdout/claude-stream-json.js');
  ok('chat-view imports the parser and feeds the status bar id || alias from it', /import \{ parseSetModelEcho \} from '\.\.\/model-echo\.js';/.test(cv) && /const echo = parseSetModelEcho\(txt, \{ envelope: 'required' \}\);\s*if \(echo\) this\._statusBar\.setModel\(echo\.id \|\| echo\.alias\);/.test(cv));
  ok('chat-renderers imports the label helper and runs the stdout label through it', /import \{ stripSetModelBackticks \} from '\.\.\/model-echo\.js';/.test(cr) && /const so = stripSetModelBackticks\(stripAnsi\(stdoutMatch\[1\]\)\.trim\(\)\);/.test(cr));
  ok('the lock repin takes the resolved id from the parser', /require\('\.\.\/\.\.\/model-echo\.js'\)/.test(sj) && /const echo = parseSetModelEcho\(uText, \{ envelope: 'required' \}\);\s*if \(echo && echo\.id && modelsMatch\(session\._lockedModel, echo\.id\)\)/.test(sj) && /session\._lockedModel = echo\.id;/.test(sj));
  // census: no inline `Set model to` REGEX left anywhere in src/ (comments and the module itself excepted)
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : (/\.(m?js|cjs)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const files = walk('src').filter((f) => f !== path.join('src', 'model-echo.js'));
  const offenders = [];
  for (const f of files) {
    read(f).split('\n').forEach((line, i) => {
      const code = line.replace(/^\s*\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      if (/Set model to/.test(code)) offenders.push(`${f}:${i + 1}`);
    });
  }
  ok(`no inline "Set model to" matcher left in src/ (${files.length} files scanned)`, files.length > 100 && offenders.length === 0, offenders);
  // negative control: the census catches the pre-fix line
  const pre = "      const m = txt.match(/^<local-command-stdout>Set model to (\\S+?)(?: \\(([^)]+)\\))?<\\/local-command-stdout>/);";
  ok('NEGATIVE CONTROL: the census flags the pre-fix status-bar regex', /Set model to/.test(pre.replace(/^\s*\/\/.*$/, '')));
  ok('NEGATIVE CONTROL: the pre-fix regex really misses the backticked echo (every /model since 2.1.257) (why this module exists)', !new RegExp('^<local-command-stdout>Set model to (\\S+?)(?: \\(([^)]+)\\))?<\\/local-command-stdout>').test(BT_OPUS));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
