#!/usr/bin/env node
// THE UI-LANGUAGE CENSUS (lane ui-language, 2.369.399 — the owner 2026-11-13: «走查一下所有界面找到可优化的布局，提示文本等»;
// the walk found whole blocks of English in the Chinese interface, stored values shown raw, US dates and markup shown raw).
// THE LAW — FIX BY RULE: every sentence a person reads goes through t() / tc() / tr() (or is declared with i18nKey() and
// worded through t() where it is drawn), with a zh AND a ja row; a key holds plain words — the surface does the shape.
//
// PURE and derived from the tree. The universe = every src file the three browser entries reach (src/client.js,
// src/design-viewer-entry.js, src/doc-editor-entry.js — dead-code-census's BUNDLE_ENTRIES), walked through their relative
// imports (the bundle metafile's set, without esbuild's cost); worker threads parse it with acorn (15 MB: one thread took
// 1.4 s) and hand back each file's PARSED imports — one the walk missed is RED, so the cheap walk cannot drift.
//
//   ① VISIBLE ENGLISH — a literal that reads as English words standing in a SINK a person reads: assigned to textContent /
//      innerText / title / placeholder / innerHTML / outerHTML / ariaLabel / alt / label; setAttribute(title | placeholder |
//      aria-label | alt | data-tip, …); an argument of showToast / showConfirmDialog / showInputDialog; an object key
//      label / title / text / placeholder / hint / tip / tooltip / desc / description / message / note / empty / confirmText
//      … ; the text between tags (and a title / placeholder / aria-label value) of an HTML template literal. A hit NOT in the
//      printed baseline (scripts/fixtures/ui-language-baseline.json, {file: [text…]}, a multiset) is RED by file:line; a
//      baseline row the tree no longer holds is RED too (`node scripts/test-ui-language.mjs --lower` writes the smaller list,
//      never a larger one) — so the baseline only shrinks. A literal that is not words for a person (an id, a protocol
//      token) carries `// ui-words: <why>` on its line or the line above.
//   ② EVERY EXTRACTED KEY HAS A zh AND A ja ROW (scripts/i18n-extract.mjs extractKeys — t / tr / tc / i18nKey literals and
//      index.html data-i18n) — i18n-check only warns; a missing row ships English in a Chinese interface.
//   ③ EVERY {param} IN A LITERAL KEY IS FILLED BY ITS CALL — t('… {n} …') with no params object (or one that names no `n`)
//      prints a raw «{n}» (settings-7). A settings description's `[t(key), {params}]` pair is filled where it is drawn
//      (settings-schema); a key whose {n} marks where a control is embedded says so with `// ui-words:` on its line.
//   ④ MARKUP STAYS WHERE ITS KEY PUT IT — a literal key carrying <b> / <br> / <i> / <code> / <strong> / ** / a `…` pair
//      never reaches a TEXT sink (textContent, a dialog's message, a toast, a title …: chat-cards-2's «<b>3</b>»); a dict
//      value never adds markup its key lacks (zh «在**同一个账号**上»).
//   ⑤ NO zh / ja ROW IS ENGLISH FOR A WORD KEY — a value with no CJK whose key holds an English word that is not a brand or
//      a unit: RED unless printed in the baseline (shrink-only) or in GLOSSARY_PENDING (the words the owner's glossary still
//      holds: agent, harness, reset credit, token — changed by lane L3 when the word comes).
//   ⑥ A STORED VALUE IS WORDED WHERE IT IS DRAWN — never translated in storage, never printed raw. (a) The For-you heads: every
//      literal sessionName head a producer in src/ files is a row of src/foryou-actions.js FORYOU_HEADS (the walk's
//      chat-cards-3: «Manage Agents» stood English on a Chinese card). (b) THE DOOR, src/lib/value-words.js: every value the
//      tree LISTS for a set it words is in its table (session-status STATES / URGENCIES,
//      automation-engine's key.* acts, jobs.js's run causes and triggers, channel-caps PUSH_CLAIMS, themes.js THEMES) and every delegated word (job-model STATE_WORDS)
//      has zh + ja rows — a new enum value without words is RED. (c) A code-named field (.state .status .role .urgency
//      .stopReason .verb .trigger .cause .tier .theme .permissionMode .effort …) put straight into a visible sink, never
//      through a words function, is RED unless held by its own shrink-only baseline (`raw`). (d) A value capitalised BY HAND
//      (`x.charAt(0).toUpperCase() + x.slice(1)`, `x[0].toUpperCase()`) is an id dressed as a word (the theme menus showed
//      «Dark» in a Chinese interface): word it through the door (themeWord …) — zero tolerance; a first letter that is not
//      a value's (a worded sentence's, a brand's) says `// ui-words: <why>` on the line above.
//   ⑦ ONE FORMATTER OF A TIME (src/lib/page-time.js — pick 4; 主开发's shape: zh / ja «2026/11/12 19:27», today «19:27», this
//      year «11/12 19:27», en the device's own): outside page-time.js no toLocaleString / toLocaleDateString / toLocaleTimeString,
//      no Intl.DateTimeFormat / RelativeTimeFormat in the browser bundle — ZERO tolerance; a hand-built `getMonth() + 1` date or hh:mm is red past the shrink-only `clocks` list (debt, said);
//      an English unit template (`${n}m`, `${h}h ago`) is red past its own shrink-only baseline (`units`: the PURE word
//      modules shared with agent-facing text keep theirs until each moves). A machine format (an explicit `en-…` locale, a zone read
//      `.resolvedOptions()`, a YYYY-MM-DD key) or a PURE shared module that takes its caller's locale says
//      `// page-time: <why>` on its line or the line above.
//   ⑧ THE SIGN-IN PAGE (served before sign-in: no bundle, no dictionary — src/login-words.js holds its words): every row
//      whole in en / zh / ja (zh / ja in their own script), and the page (src/login-page.js, drawn for src/auth.js) shows
//      no English literal of its own (the ① scan over login-page.js, auth.js and signin-table.js).
//
// Every leg runs its NEGATIVE CONTROL first on a planted source / dictionary: it must go red; the same plant worded through
// t() must stay green. Run: node scripts/test-ui-language.mjs [--lower] [--print]
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(REPO, 'package.json'));
const acorn = req('acorn');
const BASELINE = path.join(REPO, 'scripts', 'fixtures', 'ui-language-baseline.json');
export const ENTRIES = ['src/client.js', 'src/design-viewer-entry.js', 'src/doc-editor-entry.js'];
const DICTS = { zh: 'src/lib/i18n-zh.js', ja: 'src/lib/i18n-ja.js' };

// ── the universe: the imports of one parse per file, from the three entries ──
function parse(src) {
  try { return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true }); }
  catch { return acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true }); }
}
function specsOf(ast) {
  const out = [];
  const visit = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ExportNamedDeclaration') && n.source && typeof n.source.value === 'string') out.push(n.source.value);
    else if (n.type === 'ImportExpression' && n.source.type === 'Literal') out.push(n.source.value);
    else if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0] && n.arguments[0].type === 'Literal') out.push(n.arguments[0].value);
    for (const k in n) { if (k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  };
  visit(ast);
  return out;
}
function resolveSpec(fromFile, spec, repo) {
  if (typeof spec !== 'string' || !spec.startsWith('.')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  for (const c of [base, base + '.js', base + '.mjs', base + '.cjs', base + '/index.js']) {
    if (/\.(c|m)?js$/.test(c) && fs.existsSync(path.join(repo, c)) && fs.statSync(path.join(repo, c)).isFile()) return c;
  }
  return null;
}
const SPEC_RE = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])(\.[^'"]+)\1|\bimport\s*(['"])(\.[^'"]+)\3|\bimport\(\s*(['"])(\.[^'"]+)\5\s*\)|\brequire\(\s*(['"])(\.[^'"]+)\7\s*\)/g;
/** The files the entries reach through their relative imports (a text walk — the workers' parsed imports check it). */
export function universe(repo = REPO) {
  const seen = new Set();
  const todo = [...ENTRIES];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const src = fs.readFileSync(path.join(repo, f), 'utf8');
    for (const m of src.matchAll(SPEC_RE)) { const r = resolveSpec(f, m[2] || m[4] || m[6] || m[8], repo); if (r && !seen.has(r)) todo.push(r); }
  }
  for (const d of Object.values(DICTS)) seen.delete(d);
  return [...seen].sort();
}
/** One worker's share: parse + scan + the parsed imports (resolved). */
export function scanFiles(files, repo = REPO) {
  return files.map((f) => {
    const src = fs.readFileSync(path.join(repo, f), 'utf8');
    const ast = parse(src);
    const r = scanFile(f, src, ast);
    const reached = specsOf(ast).map((s) => resolveSpec(f, s, repo)).filter(Boolean);
    // the names this file imports from the one formatter (§1b: every export of page-time has a reader)
    const ptNames = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][./]*(?:lib\/)?page-time\.js['"]/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean));
    // ⑦ marks: the lines that call page-time's mark / markAgo (the census reads which is called where)
    const markLines = ptNames.some((x) => x === 'durationMark' || x === 'markAgo') ? src.split('\n').map((ln, i) => [i + 1, ln]).filter(([, ln]) => /(?<![.\w$])(?:durationMark|markAgo)\(/.test(ln.replace(/\s\/\/\s.*$/, ''))).map(([n, ln]) => ({ line: n, text: ln.trim() })) : [];
    return { file: f, ...r, reached, ptNames, markLines };
  });
}
async function scanAll(files, repo) {
  const n = Math.max(1, Math.min(8, Math.floor((os.availableParallelism ? os.availableParallelism() : os.cpus().length) / 2)));
  const bySize = files.map((f) => [f, fs.statSync(path.join(repo, f)).size]).sort((a, b) => b[1] - a[1]);
  const parts = Array.from({ length: n }, () => ({ files: [], bytes: 0 }));
  for (const [f, b] of bySize) { const p = parts.reduce((a, x) => (x.bytes < a.bytes ? x : a)); p.files.push(f); p.bytes += b; }
  const runs = parts.filter((p) => p.files.length).map((p) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { files: p.files, repo } });
    w.once('message', resolve); w.once('error', reject);
    w.once('exit', (c) => { if (c) reject(new Error(`worker exit ${c}`)); });
  }));
  return (await Promise.all(runs)).flat();
}

// ── ① the sink scan ──
const T_FNS = new Set(['t', 'tc', 'tr', 'i18nKey']);
const CODE = '\u0000code';   // a sink that is code (inside a <style> / <script> block): no words there
const CODE_FIELDS = new Set(['state', 'status', 'role', 'urgency', 'stopReason', 'stop_reason', 'verb', 'trigger', 'cause', 'service_tier', 'tier', 'theme', 'permissionMode', 'effort', 'severity', 'outcome']);
const QUIET_OBJ = new Set(['console']);
const NOT_SINK_CALLS = new Set(['Error', 'querySelector', 'querySelectorAll', 'closest', 'fetch', 'matches', 'getItem', 'setItem', 'removeItem', 'addEventListener', 'removeEventListener', 'getElementById', 'test', 'replace', 'replaceAll', 'startsWith', 'includes', 'endsWith', 'split', 'indexOf', 'postMessage', 'send', 'dispatchEvent', 'match', 'matchAll', 'exec']);
const SINK_PROPS = new Set(['textContent', 'innerText', 'title', 'placeholder', 'innerHTML', 'outerHTML', 'ariaLabel', 'alt', 'label']);
const HTML_PROPS = new Set(['innerHTML', 'outerHTML']);
const SINK_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'data-tip']);
const SINK_FNS = new Set(['showToast', 'showConfirmDialog', 'showInputDialog', 'alert', 'confirm', 'prompt']);
const SINK_KEYS = new Set(['label', 'title', 'text', 'placeholder', 'hint', 'tip', 'tooltip', 'desc', 'description', 'message', 'note', 'empty', 'okLabel', 'cancelLabel', 'confirmLabel', 'confirmText', 'body', 'heading', 'subtitle', 'caption', 'help', 'sub', 'detail', 'words', 'say', 'line']);
// a lone word that is a name, not a sentence: brands, products, protocols, units
export const NAMES = new Set(['VibeSpace', 'Claude', 'Codex', 'OpenCode', 'Antigravity', 'Gemini', 'ChatGPT', 'GitHub', 'GitLab', 'Gmail', 'Google', 'Lark', 'Feishu', 'Slack', 'Chrome', 'Chromium', 'Firefox', 'Safari', 'Linux', 'Windows', 'Ubuntu', 'Debian', 'Docker', 'Tailscale', 'TightVNC', 'Xpra', 'Node', 'Python', 'Markdown', 'JSON', 'YAML', 'HTML', 'CSS', 'SSH', 'MCP', 'OAuth', 'Anthropic', 'OpenAI', 'Fable', 'Opus', 'Sonnet', 'Haiku', 'Dropline', 'LibreOffice', 'Excel', 'Word', 'PowerPoint', 'Mermaid', 'CodeMirror', 'Monaco', 'Dracula', 'Nord', 'Solarized', 'Monokai']);
/** ⑥(e) the built-in plugins' own words (src/plugins/index.js — server modules the page words through a DYNAMIC t(p.label),
 *  which no extractor sees; the reader's round found «OpenCode background service» with no row): every label / description
 *  that is words has zh + ja rows. A name («Tailscale», «LLM») needs none. PURE over (plugins, {zh, ja} row sets). */
export function pluginFindings(plugins, rows) {
  const out = [];
  for (const p of plugins || []) for (const k of ['label', 'description']) {
    const v = p && p[k];
    if (typeof v !== 'string' || !v || englishOf(v) === null) continue;
    for (const lang of ['zh', 'ja']) if (!rows[lang].has(v)) out.push(`${p.id}.${k}: no ${lang} row — ${v.slice(0, 70)}`);
  }
  return out;
}
export function englishOf(s) {
  const x = String(s).replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\{\w+\}/g, ' ').trim();
  if (!x) return null;
  if (/^[.#[]|^https?:|^\/[\w.-]+\/|^[\w-]+:[\w-]+$|;\s*$|^[a-z]+(-[a-z]+)+$|^[a-z]+([A-Z][a-z]+)+$/.test(x)) return null;
  if (/[぀-ヿ㐀-鿿]/.test(x)) return null;
  const words = x.match(/[A-Za-z][a-z]+(?:'[a-z]+)?/g) || [];
  if (words.length >= 2 && /[A-Za-z]{2,}[\s,.:;!?…—-]+[A-Za-z]{2,}/.test(x)) return words.every((w) => NAMES.has(w)) ? null : x;
  if (words.length === 1 && /^[A-Z][a-z]{2,}[.…!?:]*$/.test(x) && !NAMES.has(words[0])) return x;
  return null;
}
const lineAt = (src, off) => { let n = 1; for (let i = 0; i < off; i++) if (src.charCodeAt(i) === 10) n++; return n; };
/** ① WORDS THE PAGE NEVER DRAWS, by name (主开发's ride-403: «an allowed line gets a named row with its reason») — a function in
 *  a module the browser bundle imports whose English is a log line's or a record's, never a person's. A row whose function is
 *  gone is red (the list only holds what is there). */
export const NOT_DRAWN = [
  ['src/stream-model.js', 'legVerdictOf', 'the udp leg verdict\'s `words` — the hub log\'s line (desktop-webrtc verdictStep) and the session record\'s `relay.leg.verdict`; no page file reads them (lane stream-udp-leg-fallback, 2.369.402)'],
];
/** ⑨ A TRAILING `//` COMMENT THAT SWALLOWED CODE (the .403 prep mirror: plugins-ui.js — a comment put in the middle of a one-line
 *  object literal took `tone, chip, chipTitle, onChip,` with it, so every plugin row's chip drew "" titled «undefined»): the code
 *  before the comment is left OPEN (it ends in `,` `(` `{` `[`) and the comment's text ends like code (a field list «a, b,», a
 *  `key: value,`, an arrow body, a call's close). A real comment only — never `//` inside a string. → [{line, text}] */
const CODEY = [/(?:\b[A-Za-z_$][\w$]*,\s*){2,}$/, /\b[A-Za-z_$][\w$]*:\s*[A-Za-z_$][\w$.]*(\([^)]*\))?,\s*$/, /=>\s*\{\s*$/, /\}\)\)?;\s*$/];
export function swallowFindings(src) {
  const lines = src.split('\n'), cand = new Set();
  lines.forEach((l, i) => { const k = l.indexOf('//'); if (k > 0 && /[,({[]\s*$/.test(l.slice(0, k)) && CODEY.some((re) => re.test(l.slice(k + 2)))) cand.add(i + 1); });
  if (!cand.size) return [];
  const out = [], onComment = (block, text, s0, e0, ls) => { if (!block && cand.has(ls.line) && CODEY.some((re) => re.test(text))) out.push({ line: ls.line, text: ('//' + text).slice(-120) }); };
  try { acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true, onComment }); }
  catch { out.length = 0; try { acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, allowReturnOutsideFunction: true, locations: true, onComment }); } catch { /* unparsable: the build refuses it */ } }
  return out;
}
/** ⑦ A DATE INSIDE A SENTENCE (the .403 prep mirror: «…已于 2026/11/12 退出登录…» — the slashed form is a table's): a page-time
 *  stampAt / dateOf whose value fills a {param} of a t() / tc() / tr() sentence — directly, inside the param's expression, or one
 *  hop through a local `const x = when(…)` — asks `words: true`. → [{line, text}] */
export function sentenceDateFindings(src, ast) {
  const alias = new Set(), out = [], hop = new Map(), wrap = new Set();
  for (const n of ast.body || []) if (n.type === 'ImportDeclaration' && /(^|\/)page-time\.js$/.test(n.source.value)) for (const sp of n.specifiers) if (sp.imported && /^(stampAt|dateOf)$/.test(sp.imported.name)) alias.add(sp.local.name);
  if (!alias.size) return out;
  const wordsOn = (call) => call.arguments.slice(1).some((a) => a && a.type === 'ObjectExpression' && a.properties.some((p) => p.key && (p.key.name || p.key.value) === 'words' && p.value.type === 'Literal' && p.value.value === true));
  const bare = (x) => x && x.type === 'CallExpression' && x.callee.type === 'Identifier' && alias.has(x.callee.name) && !wordsOn(x);
  const line = (node) => lineAt(src, node.start);
  const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
  const inside = (x, f) => { if (!x || typeof x.type !== 'string') return; if (FN.has(x.type)) return; f(x); for (const k in x) { const v = x[k]; if (k === 'loc' || k === 'start' || k === 'end') continue; if (Array.isArray(v)) v.forEach((y) => y && typeof y.type === 'string' && inside(y, f)); else if (v && typeof v.type === 'string') inside(v, f); } };
  const walk = (x) => {
    if (!x || typeof x.type !== 'string') return;
    if (x.type === 'VariableDeclarator' && x.id.type === 'Identifier' && bare(x.init)) hop.set(x.id.name, line(x));
    // a local wrapper (`const at = (ms) => stampAt(ms, { now })`): a call to it is the stamp's own
    if (x.type === 'VariableDeclarator' && x.id.type === 'Identifier' && x.init && x.init.type === 'ArrowFunctionExpression' && bare(x.init.body)) wrap.add(x.id.name);
    if (x.type === 'CallExpression' && x.callee.type === 'Identifier' && /^(t|tc|tr)$/.test(x.callee.name)) {
      const key = x.arguments[x.callee.name === 'tc' ? 1 : 0], params = x.arguments[x.callee.name === 'tc' ? 2 : 1];
      if (key && params && params.type === 'ObjectExpression' && !(key.type === 'Literal' && !/\{\w+\}/.test(String(key.value))))   // a params object = a sentence with slots (a key held in a variable too)
        for (const pr of params.properties) if (pr.value) inside(pr.value, (y) => {
          if (bare(y) || (y.type === 'Identifier' && hop.has(y.name)) || (y.type === 'CallExpression' && y.callee.type === 'Identifier' && wrap.has(y.callee.name) && !wordsOn(y)))
            out.push({ line: line(y), text: `${String(key.value || '').slice(0, 60)} ← ${src.slice(y.start, y.end).slice(0, 50)}` });
        });
    }
    for (const k in x) { const v = x[k]; if (k === 'loc') continue; if (Array.isArray(v)) v.forEach((y) => y && typeof y.type === 'string' && walk(y)); else if (v && typeof v.type === 'string') walk(v); }
  };
  walk(ast);
  return out;
}
/** The lines of `function <fn>(` … its closing «}» at column 0, or null. */
export function fnLines(src, fn) {
  const lines = src.split('\n'), i = lines.findIndex((l) => l.startsWith(`function ${fn}(`) || l.startsWith(`export function ${fn}(`));
  if (i < 0) return null;
  const j = lines.findIndex((l, k) => k > i && l === '}');
  return j < 0 ? null : [i + 1, j + 1];
}
function exemptLines(src, file = '') {
  const set = new Set();
  for (const [f, fn] of NOT_DRAWN) { if (!file.endsWith(f)) continue; const r = fnLines(src, fn); if (r) for (let n = r[0]; n <= r[1]; n++) set.add(n); }
  const lines = src.split('\n');
  lines.forEach((ln, i) => { const m = ln.match(/\/\/\s*ui-words:\s*(.{8,})/); if (m) { set.add(i + 1); set.add(i + 2); } });
  return set;
}
const CAPS_RE = /\.charAt\(0\)\.to(?:Locale)?UpperCase\(\)|\[0\]\.to(?:Locale)?UpperCase\(\)|\.replace\(\s*\/(?:\^|\\b)(?:\.|\\w|\\S|\[a-z\])\/[gimsuy]*\s*,[^;]*?\.to(?:Locale)?UpperCase\(\)/;   // ⑥(d) — also `.replace(/^./, (c) => c.toUpperCase())` (the reader's M2c)
/** ⑦ THE MARK SINKS (主开发 2026-11-14, the owner's «不如还是继续用 h/d»): every place a compact duration MARK is drawn — a row's
 *  age, a badge, a countdown — named by its line. A declared sink calls page-time's mark / markAgo and never a sentence's span /
 *  ago; a line that calls durationMark / markAgo and is NOT declared here is a sentence printing a mark — both red. */
export const MARK_SINKS = [
  ['src/lib/jobs-panel.js', 'if (run.startedAt && !run.endedAt) bits.push(durationMark(', 'a job row: how long its run has gone'],
  ['src/lib/jobs-panel.js', 'else if (run.endedAt) bits.push(markAgo(', 'a job row: how long ago its run ended'],
  ['src/lib/jobs-panel.js', "if (j.nextFireAt) bits.push(t('next') + ' ~' + durationMark(", 'a job row: when it fires next'],
  ['src/lib/jobs-panel.js', 'sage.textContent = sess.latestAt ? markAgo(', 'a conversation group\'s age'],
  ['src/lib/jobs-panel.js', 'age.textContent = g.latestAt ? markAgo(', 'a family group\'s age'],
  ['src/lib/jobs-panel.js', '${run.endedAt ? durationMark(run.endedAt - run.startedAt)', 'a run row\'s duration'],
  ['src/lib/usage-meter.js', 'const fmtDur = (sec) => durationMark(', 'the usage meter\'s reset countdown («2d23h59m»)'],
  ['src/lib/utils.js', "label = age ? t('as of {when}', { when: markAgo(age) })", 'a host chip\'s age'],
  ['src/lib/account-wall-words.js', 'if (t === markT) return durationMark(', 'a ring\'s stale-lane mark (the roster, the usage meter — hotfix 2.369.401)'],
  ['src/lib/manage-agents.js', 'const ageLabel = age != null && age > 5 ? durationMark(', 'the roster row\'s age (hotfix 2.369.401)'],
  ['src/lib/session-lifecycle.js', 'const ageTxt = age != null && age > 5 ? escHtml(durationMark(', 'the account-switch menu\'s age (hotfix 2.369.401)'],
];
/** PURE: the mark findings over (the tree's mark-calling lines, a file → its source lines). */
export function markFindings(markLines, linesOf, sinks = MARK_SINKS) {
  const out = [];
  for (const [f, anchor, why] of sinks) {
    const hits = (linesOf(f) || []).filter((ln) => ln.includes(anchor));
    if (hits.length !== 1) { out.push(`${f}: the mark sink «${anchor}» (${why}) is found ${hits.length}× — move or drop its row`); continue; }
    if (/(?<![.\w$])(?:span|ago)\(/.test(hits[0]) || !/(?<![.\w$])(?:durationMark|markAgo)\(/.test(hits[0])) out.push(`${f}: the mark sink «${anchor}» (${why}) calls a SENTENCE's span / ago — a mark says durationMark()`);
  }
  for (const m of markLines) if (!sinks.some(([f, anchor]) => f === m.file && m.text.includes(anchor))) out.push(`${m.file}:${m.line} calls durationMark / markAgo but is no declared mark sink — a sentence says span / ago (or declare the mark)`);
  return out;
}
/** ⑥(d) the AST form of a hand capitalisation: `<first piece>.to(Locale)UpperCase()` + `<value>.slice(1)` (or substring / substr) —
 *  the first piece spelled any way (charAt(0), [0], slice(0, 1), substring(0, 1), substr(0, 1), at(0)). */
const UPPER_FIRST = (e) => !!e && e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && !e.callee.computed && /^to(Locale)?UpperCase$/.test(e.callee.property.name || '');
const REST_OF = (e) => !!e && e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && !e.callee.computed && /^(slice|substring|substr)$/.test(e.callee.property.name || '') && e.arguments.length === 1 && e.arguments[0].type === 'Literal' && e.arguments[0].value === 1;
/** ⑦ a clock part read off a Date by hand (`d.getHours()`, `String(d.getMinutes()).padStart(2, '0')` …). */
const CLOCK_PART = (e) => { let hit = false; const v = (x) => { if (hit || !x || typeof x.type !== 'string') return; if (x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && !x.callee.computed && /^get(UTC)?(Hours|Minutes)$/.test(x.callee.property.name || '')) { hit = true; return; } for (const k in x) { const y = x[k]; if (Array.isArray(y)) y.forEach(v); else if (y && typeof y.type === 'string') v(y); } }; v(e); return hit; };
const MARKUP = /<\/?(?:b|br|i|em|strong|code)\b[^>]*>|\*\*[^*]+\*\*|`[^`]+`/;
const TEXT_SINK = (sink) => !!sink && !HTML_PROPS.has(sink.replace(/^prop:/, '')) && sink !== 'html' && sink !== 'call:insertAdjacentHTML';
/** One file → { visible: [{line, sink, text}], markup: [{line, sink, key}], params: [{line, key, missing}] } */
export function scanFile(file, src, ast = parse(src)) {
  const visible = [], markup = [], params = [], raw = [], time = [];
  const ptEx = new Set(); src.split('\n').forEach((ln, i) => { if (/\/\/\s*page-time:\s*\S.{2,}/.test(ln)) { ptEx.add(i + 1); ptEx.add(i + 2); } });
  const isPageTime = /(^|\/)src\/lib\/page-time\.js$/.test(file);
  const timeHit = (node, what, kind = 'fmt') => { const line = at(node); if (!isPageTime && !ptEx.has(line)) time.push({ line, text: what, kind }); };
  const enLocale = (arg) => !!arg && arg.type === 'Literal' && typeof arg.value === 'string' && /^en-/.test(arg.value);
  const ex = exemptLines(src, file);
  // ⑥(d) a value capitalised by hand (the line's code — a trailing comment is not code)
  const caps = [];
  src.split('\n').forEach((ln, i) => { if (CAPS_RE.test(ln.replace(/\s\/\/\s.*$/, '')) && !ex.has(i + 1)) caps.push({ line: i + 1, text: ln.trim().slice(0, 140) }); });
  const at = (node) => lineAt(src, node.start);
  const hit = (node, sink, text) => { const line = at(node); if (!ex.has(line)) visible.push({ line, sink, text }); };
  const deferred = new WeakSet();   // t() calls whose params ride beside them: [t(key), { params }]
  const tCall = (n, sink) => {
    const name = n.callee.name;
    const ki = name === 'tc' ? 1 : 0;
    const k = n.arguments[ki];
    // ⑥(c) a code-named field handed to t() as its KEY (`t(st.state)`): a stored value treated as a dictionary key — no extractor
    // sees it, no row is promised (the closure round, 主开发 20:39Z) — it is drawn raw by another road; word it through value-words
    if (name !== 'i18nKey' && k && k.type === 'MemberExpression' && !k.computed && k.property.type === 'Identifier' && CODE_FIELDS.has(k.property.name) && !ex.has(at(n))) raw.push({ line: at(n), sink: 'key:' + name, text: '.' + k.property.name });
    if (name !== 'i18nKey' && k && k.type === 'Literal' && typeof k.value === 'string') {
      const ps = [...k.value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const p = n.arguments[ki + 1];
      if (ps.length && !deferred.has(n) && !ex.has(at(n))) {
        if (!p) params.push({ line: at(n), key: k.value, missing: ps });
        else if (p.type === 'ObjectExpression' && !p.properties.some((x) => x.type === 'SpreadElement')) {
          const have = new Set(p.properties.map((x) => x.key && (x.key.name ?? x.key.value)));
          const miss = ps.filter((q) => !have.has(q));
          if (miss.length) params.push({ line: at(n), key: k.value, missing: miss });
        }
      }
      if (MARKUP.test(k.value) && TEXT_SINK(sink) && !ex.has(at(n))) markup.push({ line: at(n), sink, key: k.value });
    }
    for (const a of n.arguments.slice(ki + 1)) walk(a, sink);
  };
  const walk = (node, sink) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'CallExpression': {
        const c = node.callee;
        if (c.type === 'Identifier' && T_FNS.has(c.name)) return tCall(node, sink);
        const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
        if (name && /^toLocale(Date|Time)?String$/.test(name) && !enLocale(node.arguments[0])) timeHit(node, name + '()');
        // ① a sentence with {param} slots filled by hand (`'{by} created the group'.replace('{by}', by)`) never reaches the
        // dictionary: it is a key that skipped t() — named wherever it stands, sink or not (the reader's M1c)
        if ((name === 'replace' || name === 'replaceAll') && c.type === 'MemberExpression' && c.object.type === 'Literal' && typeof c.object.value === 'string' && /\{[a-z]\w*\}/i.test(c.object.value) && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(c.object.value.replace(/\{\w+\}/g, '')) && !ex.has(at(node))) visible.push({ line: at(node), sink: 'hand-filled', text: c.object.value });
        if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Intl' && /^(DateTimeFormat|RelativeTimeFormat)$/.test(name || '') && !enLocale(node.arguments[0]) && !/^\s*\.\s*resolvedOptions/.test(src.slice(node.end, node.end + 24))) timeHit(node, 'Intl.' + name);
        const obj = c.type === 'MemberExpression' && c.object.type === 'Identifier' ? c.object.name : null;
        if ((obj && QUIET_OBJ.has(obj)) || (name && NOT_SINK_CALLS.has(name))) return;
        if (name === 'setAttribute' && node.arguments[0] && node.arguments[0].type === 'Literal' && SINK_ATTRS.has(node.arguments[0].value)) return walk(node.arguments[1], 'attr:' + node.arguments[0].value);
        if (name === 'insertAdjacentHTML') { for (const a of node.arguments.slice(1)) walk(a, 'call:insertAdjacentHTML'); return; }
        if (name && SINK_FNS.has(name)) { for (const a of node.arguments) walk(a, 'call:' + name); return; }
        walk(c, null);
        for (const a of node.arguments) walk(a, null);
        return;
      }
      case 'NewExpression':
        if (node.callee.type === 'Identifier' && /Error$/.test(node.callee.name)) return;
        if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Intl' && /^(DateTimeFormat|RelativeTimeFormat)$/.test(node.callee.property.name || '') && !enLocale(node.arguments[0]) && !/^\s*\.\s*resolvedOptions/.test(src.slice(node.end, node.end + 24))) timeHit(node, 'new Intl.' + node.callee.property.name);
        break;
      case 'ThrowStatement': case 'ImportDeclaration': case 'ExportAllDeclaration': return;
      case 'BinaryExpression':
        if (/^[!=]==?$|^in$|^instanceof$/.test(node.operator)) return;
        if (node.operator === '+' && UPPER_FIRST(node.left) && REST_OF(node.right) && !ex.has(at(node)) && !caps.some((c) => c.line === at(node))) caps.push({ line: at(node), text: src.split('\n')[at(node) - 1].trim().slice(0, 140) });
        if (node.operator === '+' && node.right.type === 'Literal' && node.right.value === ':' && CLOCK_PART(node.left)) timeHit(node, 'hh:mm built by hand (getHours / getMinutes)', 'clock');
        if (node.operator === '+' && node.right.type === 'Literal' && node.right.value === 1 && node.left.type === 'CallExpression' && node.left.callee.type === 'MemberExpression' && node.left.callee.property.name === 'getMonth') timeHit(node, 'getMonth() + 1', 'clock');
        if (node.operator === '+' && node.right.type === 'Literal' && typeof node.right.value === 'string' && /^(m|h|d)( ago)?$/.test(node.right.value)) timeHit(node, `+ '${node.right.value}'`, 'unit');
        break;
      case 'SwitchCase': for (const s of node.consequent) walk(s, sink); return;
      // a condition's TEST and the left of `&&` decide what is drawn — they are not drawn themselves
      case 'ConditionalExpression': walk(node.test, null); walk(node.consequent, sink); walk(node.alternate, sink); return;
      case 'LogicalExpression': walk(node.left, node.operator === '&&' ? null : sink); walk(node.right, sink); return;
      case 'MemberExpression':
        if (sink && !node.computed && node.property.type === 'Identifier' && CODE_FIELDS.has(node.property.name)) { const line = at(node); if (!ex.has(line)) raw.push({ line, sink, text: '.' + node.property.name }); return; }
        walk(node.object, null); if (node.computed) walk(node.property, null);
        return;
      case 'ArrayExpression': {
        const [a0, a1] = node.elements;
        if (a0 && a0.type === 'CallExpression' && a0.callee.type === 'Identifier' && T_FNS.has(a0.callee.name) && a1 && a1.type === 'ObjectExpression') {
          const k = a0.arguments[a0.callee.name === 'tc' ? 1 : 0];
          const have = new Set(a1.properties.map((x) => x.key && (x.key.name ?? x.key.value)));
          if (k && k.type === 'Literal' && [...String(k.value).matchAll(/\{(\w+)\}/g)].every((m) => have.has(m[1]))) deferred.add(a0);
        }
        break;
      }
      case 'AssignmentExpression':
        if (node.left.type === 'MemberExpression' && !node.left.computed && SINK_PROPS.has(node.left.property.name)) return walk(node.right, 'prop:' + node.left.property.name);
        break;
      case 'Property': {
        if (node.computed) break;
        const k = node.key.type === 'Identifier' ? node.key.name : node.key.value;
        return walk(node.value, SINK_KEYS.has(k) ? 'key:' + k : (sink && sink.startsWith('call:') ? sink : null));
      }
      case 'Literal':
        if (sink && sink !== CODE && typeof node.value === 'string') { const e = englishOf(node.value); if (e) hit(node, sink, e); }
        return;
      case 'TemplateLiteral': {
        if (node.expressions.some((e) => CLOCK_PART(e)) && node.quasis.some((q) => /:/.test(q.value.cooked || ''))) timeHit(node, 'hh:mm built by hand (getHours / getMinutes)', 'clock');
        const html = sink !== CODE && node.quasis.some((q) => /<[a-z][\w-]*[\s>/]|<\/[a-z]/.test(q.value.cooked || ''));
        const codeAfter = [];   // per quasi: is a <style> / <script> block open after it (its expression is code, not words)
        node.quasis.forEach((q, qi) => { if (qi > 0 && /^(m|h|d|s)( ago)?(?![A-Za-z0-9])/.test(q.value.cooked || '')) timeHit(q, '${…}' + (q.value.cooked || '').slice(0, 6), 'unit'); });
        let inCode = false;   // inside a <style> / <script> block (CSS / code, never words) — it may span quasis
        for (const q of node.quasis) {
          codeAfter.push(inCode);
          let s = q.value.cooked || '';
          if (html) {
            // drop what a <style> / <script> holds; a block left open at the quasi's end goes on into the next one
            if (inCode) { const end = s.search(/<\/(style|script)>/i); if (end < 0) continue; s = s.slice(end); inCode = false; }
            s = s.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '<x></x>');
            const open = s.search(/<(style|script)\b/i);   // its tag may be cut by a \${…} (\`<script nonce="\${nonce}">\`)
            if (open >= 0) { s = s.slice(0, open) + '<x>'; inCode = true; }
            const segs = [];
            s.replace(/>([^<>]+)</g, (m, g) => { segs.push(g); return m; });
            s.replace(/(?:title|placeholder|aria-label|alt)="([^"$]+)"/g, (m, g) => { segs.push(g); return m; });
            for (const g of segs) { const e = englishOf(g); if (e) hit(q, 'html', e); }
          } else if (sink && sink !== CODE) {
            // a template inside an html template's \${…} with no tag of its own may be a piece of the enclosing tag
            // (\` data-record-src="\${…}"\`): the attribute's name, its = and quotes are markup, never words
            // — except a title / placeholder / aria-label / alt value, which a person reads
            if (sink === 'html') {
              s.replace(/(?:^|\s)(?:title|placeholder|aria-label|alt)="([^"$]+)"/g, (m, g) => { const e = englishOf(g); if (e) hit(q, 'html', e); return m; });
              s = s.replace(/(^|\s)[a-z][\w:-]*=(?:"[^"]*"|'[^']*')/gi, ' ').replace(/(^|\s)[a-z][\w:-]*=["']?(?=$|\s)/gi, ' ').replace(/^["']/, '');
            }
            const e = englishOf(s); if (e) hit(q, sink, e);
          }
          codeAfter[codeAfter.length - 1] = inCode;
        }
        node.expressions.forEach((x, i) => walk(x, html && codeAfter[i] ? CODE : html ? 'html' : sink));
        return;
      }
      default: break;
    }
    for (const key in node) {
      if (key === 'start' || key === 'end') continue;
      const v = node[key];
      if (Array.isArray(v)) for (const n of v) walk(n, sink);
      else if (v && typeof v.type === 'string') walk(v, sink);
    }
  };
  walk(ast, null);
  for (const sh of shadowFindings(ast)) timeHit({ start: sh.start }, `${sh.name}() where a local «${sh.name}» shadows the page-time import`);
  return { visible, markup, params, raw, time, caps, swallowed: swallowFindings(src), sentenceDates: sentenceDateFindings(src, ast) };
}

// ── ②④⑤ the dictionaries ──
const CJK = /[぀-ヿ㐀-鿿＀-￯]/;
const UNITS = new Set(['px', 'ms', 'min', 'max', 'kb', 'mb', 'gb', 'tb', 'cpu', 'gpu', 'id', 'ids', 'ok', 'url', 'urls', 'api', 'pr', 'git', 'uuid', 'vs']);
// words the owner's glossary still holds (the walk: «等你定 agent 的叫法») — kept in English on purpose until the word comes
export const GLOSSARY_PENDING = Object.freeze(['agent', 'agents', 'harness', 'harnesses', 'reset', 'credit', 'credits', 'token', 'tokens']);
export function englishRow(key, value) {
  if (typeof value !== 'string' || CJK.test(value)) return false;
  const words = String(key).replace(/^[^:]*::/, '').replace(/\{\w+\}/g, ' ').match(/[A-Za-z][a-z]+/g) || [];
  return words.some((w) => !NAMES.has(w) && !UNITS.has(w.toLowerCase()) && /[a-z]{2,}/.test(w));
}
export const glossaryPending = (value) => { const ws = String(value).match(/[A-Za-z]+/g) || []; return ws.length > 0 && ws.every((w) => GLOSSARY_PENDING.includes(w.toLowerCase()) || NAMES.has(w) || w.toLowerCase() === 'the'); };
const markupOf = (s) => (String(s).match(/<\/?(?:b|br|i|em|strong|code)\b[^>]*>|\*\*|`/g) || []).length;
export function dictFindings(keys, dicts) {
  const out = { missing: [], english: [], glossary: [], addedMarkup: [] };
  for (const [lang, rows] of Object.entries(dicts)) {
    const have = new Set(rows.map((r) => r.key));
    for (const k of keys) if (!have.has(k)) out.missing.push(`${lang}: ${k}`);
    for (const r of rows) {
      if (englishRow(r.key, r.value)) (glossaryPending(r.value) ? out.glossary : out.english).push(`${lang}: ${r.key}`);
      if (markupOf(r.value) > markupOf(r.key)) out.addedMarkup.push(`${lang}: ${r.key.slice(0, 90)}`);
    }
  }
  return out;
}

/** ⑦ (the bug pick 4's pictures caught; the reader's round found the closure case): a call of a name a page-time import binds
 *  (`when`, `span`, `num` …) where ANY enclosing function declares that name — a param, a var / let / const (any pattern), a
 *  function or class declaration, a catch param. The call reaches the local (a TDZ ReferenceError, or a string called), never
 *  the formatter — also from inside a nested closure (chat-status-bar's pool lines: `const clock = (ms) => when(ms)` under a
 *  local string `when`). Function-level scopes: a let / const in a sibling block counts too (rename it — never a reason). */
export function shadowFindings(ast) {
  const names = new Set();
  for (const n of ast.body || []) if (n.type === 'ImportDeclaration' && /(^|\/)page-time\.js$/.test(n.source.value)) for (const sp of n.specifiers) names.add(sp.local.name);
  if (!names.size) return [];
  const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']), out = [];
  const bind = (pat, set) => {
    if (!pat) return;
    if (pat.type === 'Identifier') set.add(pat.name);
    else if (pat.type === 'ObjectPattern') for (const q of pat.properties) bind(q.type === 'RestElement' ? q.argument : q.value, set);
    else if (pat.type === 'ArrayPattern') for (const q of pat.elements) bind(q, set);
    else if (pat.type === 'AssignmentPattern') bind(pat.left, set);
    else if (pat.type === 'RestElement') bind(pat.argument, set);
  };
  /** The names a function declares in its own scope (its params + every declaration in its body, not inside a nested function). */
  const declaredIn = (fn) => {
    const set = new Set();
    for (const p of fn.params || []) bind(p, set);
    const scan = (x) => {
      if (!x || typeof x.type !== 'string') return;
      if (x !== fn.body && FN.has(x.type)) { if (x.type === 'FunctionDeclaration' && x.id) set.add(x.id.name); return; }
      if (x.type === 'VariableDeclarator') bind(x.id, set);
      if (x.type === 'ClassDeclaration' && x.id) set.add(x.id.name);
      if (x.type === 'CatchClause' && x.param) bind(x.param, set);
      for (const k in x) { const v = x[k]; if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v.type === 'string') scan(v); }
    };
    scan(fn.body);
    return set;
  };
  const visit = (n, scopes) => {
    if (!n || typeof n.type !== 'string') return;
    if (FN.has(n.type)) scopes = [...scopes, declaredIn(n)];
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && names.has(n.callee.name) && scopes.some((sc) => sc.has(n.callee.name))) out.push({ name: n.callee.name, start: n.start });
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach((x) => visit(x, scopes)); else if (v && typeof v.type === 'string') visit(v, scopes); }
  };
  visit(ast, []);
  return out;
}

// ── ⑥ stored values: the For-you heads ──
/** `git grep` lines (`file:line:text`) → the literal heads a producer files that the table does not hold. */
/** ⑥(b): the tree's own lists of each set's values → the values the door's table does not word. PURE over (lists, sets). */
export function setFindings(lists, sets, delegated = {}, rows = {}) {
  const out = [];
  for (const [set, values] of Object.entries(lists)) for (const v of values) if (!(sets[set] && Object.prototype.hasOwnProperty.call(sets[set], v))) out.push(`${set}: «${v}» has no words in src/lib/value-words.js VALUE_SETS`);
  for (const [set, words] of Object.entries(delegated)) for (const [v, w] of Object.entries(words)) for (const [lang, have] of Object.entries(rows)) if (!have.has(w)) out.push(`${set}: «${v}» → «${w}» has no ${lang} row`);
  return out;
}
async function setsOf(repo) {
  const req = createRequire(path.join(repo, 'package.json'));
  const ss = req(path.join(repo, 'src', 'session-status.js')), bc = req(path.join(repo, 'src', 'backend-caps.js')), jm = req(path.join(repo, 'src', 'job-model.js'));
  const ae = fs.readFileSync(path.join(repo, 'src', 'server', 'automation-engine.js'), 'utf8');
  const jobs = fs.readFileSync(path.join(repo, 'src', 'jobs.js'), 'utf8');
  const causes = new Set([...jobs.matchAll(/'(ok\(until-output\)|interrupted|ok|timeout|error|update_window|wrapper-mismatch)'/g)].map((m) => m[1]).concat(jm.MEMORY_CAUSES || []));
  const triggers = new Set([...jobs.matchAll(/_(?:spawn|startAfter)\(job, '([a-z-]+)'/g)].map((m) => m[1]).concat([...jobs.matchAll(/'(vault-approved|vault-unlocked)'/g)].map((m) => m[1])));
  const cc = req(path.join(repo, 'src', 'channel-caps.js'));
  const th = fs.readFileSync(path.join(repo, 'src', 'lib', 'themes.js'), 'utf8');
  const themeBody = th.slice(th.indexOf('const THEMES = {'), th.indexOf('const BUILTIN_THEMES'));
  const themes = [...themeBody.matchAll(/^  ([a-z][a-z0-9-]*): \{/gm)].map((m) => m[1]);
  const lists = { 'push-claim': cc.PUSH_CLAIMS || [], theme: themes, 'session-state': ss.STATES || [], urgency: ss.URGENCIES || [], 'vault-act': [...new Set([...ae.matchAll(/verb: '(key\.[a-z]+)'/g)].map((m) => m[1]))], 'job-cause': [...causes], 'job-trigger': [...triggers] };
  const vw = await import(pathToFileURL(path.join(repo, 'src', 'lib', 'value-words.js')).href);
  return { lists, sets: vw.VALUE_SETS, delegated: { 'job-state': jm.STATE_WORDS || {} } };
}
/** ⑧: the sign-in page's words table → its rows that are not whole in en / zh / ja. PURE. */
export function loginFindings(table) {
  const out = [];
  for (const [k, v] of Object.entries(table || {})) {
    for (const l of ['en', 'zh', 'ja']) if (!v || typeof v[l] !== 'string' || !v[l].trim()) out.push(`${k}: no ${l}`);
    for (const l of ['zh', 'ja']) if (v && typeof v[l] === 'string' && v[l].trim() && !/[\u3040-\u30ff\u3400-\u9fff]/.test(v[l])) out.push(`${k}: the ${l} row is not ${l === 'zh' ? 'Chinese' : 'Japanese'} («${v[l]}»)`);
  }
  return out;
}
export function headFindings(lines, table) {
  const out = [];
  for (const ln of lines) {
    if (/\/\/\s*ui-words:/.test(ln)) continue;
    const m = ln.match(/^([^:]+):(\d+):.*?\bsessionName:\s*'((?:[^'\\]|\\.)+)'/);
    if (m && !Object.prototype.hasOwnProperty.call(table, m[3].replace(/\\'/g, "'"))) out.push(`${m[1]}:${m[2]} sessionName '${m[3]}' — add its row to FORYOU_HEADS (src/foryou-actions.js)`);
  }
  return out;
}
function headsOf(repo) {
  const r = spawnSync('git', ['-C', repo, 'grep', '-n', '-E', "sessionName: '", '--', 'src'], { encoding: 'utf8' });
  const table = createRequire(path.join(repo, 'package.json'))(path.join(repo, 'src', 'foryou-actions.js')).FORYOU_HEADS || {};
  return { lines: (r.stdout || '').split('\n').filter(Boolean), table };
}

// ── the baseline (shrink-only multisets) ──
function multisetDiff(now, base) {
  const fresh = [], stale = [];
  const files = new Set([...Object.keys(now), ...Object.keys(base)]);
  for (const f of files) {
    const left = new Map();
    for (const s of base[f] || []) left.set(s, (left.get(s) || 0) + 1);
    for (const h of now[f] || []) { const s = typeof h === 'string' ? h : h.text; const n = left.get(s) || 0; if (n > 0) left.set(s, n - 1); else fresh.push({ file: f, ...(typeof h === 'string' ? { text: h } : h) }); }
    for (const [s, n] of left) for (let i = 0; i < n; i++) stale.push({ file: f, text: s });
  }
  return { fresh, stale };
}
const count = (m) => Object.values(m).reduce((a, v) => a + v.length, 0);

/** The dictionary as the page loads it (the module's object: a row with a trailing `// lane …` comment counts too). */
async function dictOf(repo, rel) {
  const obj = (await import(pathToFileURL(path.join(repo, rel)).href)).default;
  return Object.entries(obj).map(([key, value]) => ({ key, value }));
}
export async function census(repo = REPO) {
  const files = universe(repo);
  const heads = headsOf(repo);
  const [scanned, keys, zh, ja, vsets] = await Promise.all([
    scanAll(files, repo),
    import(pathToFileURL(path.join(repo, 'scripts', 'i18n-extract.mjs')).href).then((m) => [...m.extractKeys(repo + path.sep)]),
    dictOf(repo, DICTS.zh), dictOf(repo, DICTS.ja), setsOf(repo),
  ]);
  const visible = {}, markup = [], params = [], missed = [], raw = {}, time = [], units = {}, clocks = {}, caps = [], swallowed = [], sentenceDates = [];
  const inUni = new Set(files);
  for (const r of scanned) {
    if (r.visible.length) visible[r.file] = r.visible.map((h) => ({ ...h, text: h.text.slice(0, 160) }));
    if (r.raw.length) raw[r.file] = r.raw;
    for (const h of r.time) if (h.kind === 'unit') (units[r.file] = units[r.file] || []).push(h); else if (h.kind === 'clock') (clocks[r.file] = clocks[r.file] || []).push(h); else time.push(`${r.file}:${h.line} ${h.text} — print it through src/lib/page-time.js (or say \`// page-time: <why>\`)`);
    for (const c of r.swallowed || []) swallowed.push(`${r.file}:${c.line} ${c.text}`);
    for (const c of r.sentenceDates || []) sentenceDates.push(`${r.file}:${c.line} ${c.text}`);
    for (const c of r.caps) caps.push(`${r.file}:${c.line} ${c.text} — word the value through src/lib/value-words.js (or say \`// ui-words: <why>\` above it)`);
    for (const m of r.markup) markup.push(`${r.file}:${m.line} [${m.sink}] ${m.key.slice(0, 90)}`);
    for (const p of r.params) params.push(`${r.file}:${p.line} {${p.missing.join(', ')}} ${p.key.slice(0, 90)}`);
    for (const x of r.reached) if (!inUni.has(x) && !Object.values(DICTS).includes(x)) missed.push(`${r.file} → ${x}`);
  }
  const rowsOf = (d) => new Set(d.map((x) => x.key));
  const sets = { findings: setFindings(vsets.lists, vsets.sets, vsets.delegated, { zh: rowsOf(zh), ja: rowsOf(ja) }), lists: Object.values(vsets.lists).reduce((a, l) => a + l.length, 0) };
  const plugins = pluginFindings(createRequire(path.join(repo, 'package.json'))(path.join(repo, 'src', 'plugins', 'index.js')), { zh: rowsOf(zh), ja: rowsOf(ja) });
  const lw = createRequire(path.join(repo, 'package.json'))(path.join(repo, 'src', 'login-words.js'));
  const loginRows = loginFindings(lw.LOGIN_WORDS);
  // lane artifacts-by-intent (B3b-1): the page moved out of src/auth.js into src/login-page.js and the held words' table into
  // src/signin-table.js — the scan reads all three (a scan of auth.js alone would pass over a page it no longer holds)
  const authScan = ['src/auth.js', 'src/login-page.js', 'src/signin-table.js'].flatMap((f) => scanFile(f, fs.readFileSync(path.join(repo, f), 'utf8')).visible.map((h) => `${f}:${h.line} [${h.sink}] ${h.text}`));
  const markLines = scanned.flatMap((r) => (r.file === 'src/lib/page-time.js' ? [] : (r.markLines || []).map((m) => ({ file: r.file, ...m }))));
  const ptUsed = [...new Set(scanned.flatMap((r) => (r.file === 'src/lib/page-time.js' ? [] : r.ptNames || [])))];
  return { files: files.length, ptUsed, markLines, visible, raw, time, units, clocks, caps, swallowed, sentenceDates, plugins, sets, login: { rows: Object.keys(lw.LOGIN_WORDS).length, findings: loginRows, page: authScan }, markup, params, missed, heads: { lines: heads.lines.length, table: Object.keys(heads.table).length, missing: headFindings(heads.lines, heads.table) }, dict: dictFindings(keys, { zh, ja }) };
}

// ── a worker's share (the module is loaded whole first: every table above exists) ──
if (!isMainThread && workerData && Array.isArray(workerData.files)) parentPort.postMessage(scanFiles(workerData.files, workerData.repo));

// ── main ──
const isMain = isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const t0 = performance.now();
  let pass = 0, fail = 0;
  const ok = (cond, msg, detail) => { if (typeof cond !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof cond}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail ? '\n      ' + [].concat(detail).slice(0, 40).join('\n      ') : ''}`); } };

  console.log('§0 the negative controls (planted sources and rows — each leg must go red)');
  {
    const planted = `el.textContent = 'Customize mode — drag to move it'; a.title = t('Fine words'); b.innerHTML = \`<div class="x">Add remote machine</div>\`; showToast('Public key copied'); const o = { label: 'Username on that machine' };`;
    const r = scanFile('planted.js', planted);
    ok(r.visible.length === 4 && r.visible.map((h) => h.sink).join(',') === 'prop:textContent,html,call:showToast,key:label', `① a planted bare English literal in four sinks is named (${r.visible.length}); the same words through t() are not`, JSON.stringify(r.visible));
    const worded = scanFile('worded.js', `el.textContent = t('Customize mode — drag to move it'); showToast(t('Public key copied')); el.title = 'claude-fable-5'; x.textContent = 'Codex'; // ui-words: a planted control line\ny.textContent = 'Plain English words'; // ui-words: a planted exempt line`);
    ok(worded.visible.length === 0, '① …worded through t(), an id, a brand and a `// ui-words:` line are not', JSON.stringify(worded.visible));
    const sw = swallowFindings("x.appendChild(row({ id: p.id, label: t(p.label),   // a built-in's label is a declared word tone, chip, chipTitle, onChip,\n  sw }));\n// a comment on its own line: tone, chip,\ny.appendChild(row({ id, // its id, then\n  a, b }));\nif (ok) rec.more = more(m);   // lane x: which,\nconst u = 'http://host/a, b,';\n");
    ok(sw.length === 1 && sw[0].line === 1, '⑨ a trailing comment that swallowed a field list (`… // words tone, chip, chipTitle, onChip,`) is named; a comment on its own line, prose after an open line, prose after a whole statement and `//` in a string are not', JSON.stringify(sw));
    const sd = scanFile('sd.js', "import { stampAt as when, dateOf } from './page-time.js';\na.textContent = t('signed out on {date}', { date: dateOf(x, { full: true }) });\nb.textContent = t('signed out on {date}', { date: dateOf(x, { full: true, words: true }) });\nconst at = when(y);\nc.textContent = t('resumed {time}', { time: at });\nd.title = when(z);\ne.textContent = t('Exported {date}', { date: q ? when(q, { full: true }) : t('(unknown date)') });\nconst w = (ms) => when(ms, { now });\nf.textContent = t('expired {at}', { at: w(k) });\n");
    ok(sd.sentenceDates.length === 4 && sd.sentenceDates.map((x) => x.line).join() === '2,5,7,9', '⑦ a page-time date filling a t() sentence without `words` is named (directly, one hop through a local, inside a ternary, through a local wrapper); with `words`, and a stamp in a title, are not', JSON.stringify(sd.sentenceDates));
    const frag = scanFile('frag.js', 'x.innerHTML = `<img src="${a}"${b ? ` data-record-src="${b}"` : \'\'}${c ? ` data-kind="codex" data-key="${c}"` : \'\'} alt="">`; y.innerHTML = `<p>${b ? `Plain words for a person` : \'\'}</p>`; z.innerHTML = `<b${b ? ` title="Open the whole file"` : \'\'}>x</b>`;');
    ok(frag.visible.length === 2 && gateOf(/Plain words/.test(frag.visible[0].text)) && verdictOf(/Open the whole file/.test(frag.visible[1].text)), '① a piece of an enclosing tag (` data-record-src="${…}"`) is markup; words in the same place, and a title in such a piece, are named', JSON.stringify(frag.visible));
    const nd = scanFile('src/stream-model.js', "function legVerdictOf(h) {\n  return { words: 'the daemon says its leg is up' };\n}\nfunction other() {\n  return { label: 'Words a person reads' };\n}\n");
    ok(nd.visible.length === 1 && nd.visible[0].line === 5, '① a NOT_DRAWN row exempts its own function only — the next function\'s words are named', JSON.stringify(nd.visible));
    const p = scanFile('p.js', `x.textContent = t('Shows {n} waiting'); y.textContent = t('{n} more', { n }); z.textContent = t('{a} of {b}', { a: 1 }); const d = { description: [t('Marked “{label}”'), { label: t('needs you') }] };\nconst m = t('fire after {n} min'); // ui-words: {n} marks where the number input is embedded`);
    ok(p.params.length === 2 && p.params[1].missing.join() === 'b', '③ a {param} its call never fills is named (no params object; a params object without it); a filled one is not', JSON.stringify(p.params));
    const m = scanFile('m.js', `p.textContent = t('<b>{n}</b> sessions', { n }); q.innerHTML = t('<b>{n}</b> sessions', { n }); showToast(t('run \`{line}\` now', { line }));`);
    ok(m.markup.length === 2 && verdictOf(m.markup.every((x) => x.sink !== 'prop:innerHTML')), '④ a markup key in a TEXT sink is named (textContent, a toast); the same key into innerHTML is not', JSON.stringify(m.markup));
    const d = dictFindings(['Find', 'Fine words'], { zh: [{ key: 'Find', value: 'Find', line: 1 }, { key: 'the agent', value: 'agent', line: 2 }, { key: 'The most turns on ONE account', value: '在**同一个账号**上的上限', line: 3 }, { key: 'Claude', value: 'Claude', line: 4 }] });
    ok(d.missing.join() === 'zh: Fine words', '② a key with no zh row is named', JSON.stringify(d.missing));
    ok(d.english.join() === 'zh: Find' && d.glossary.join() === 'zh: the agent', '⑤ a zh row left in English is named; a glossary-pending word and a brand are not', JSON.stringify(d));
    ok(d.addedMarkup.length === 1, '④ a dict value that adds ** its key lacks is named', JSON.stringify(d.addedMarkup));
    const rf = scanFile('rf.js', `a.textContent = j.state; b.textContent = valueWord('job-state', j.state, t); c.title = \`\${st.urgency} ok\`; if (j.state === 'up') d.textContent = 'x'; e.textContent = st.state ? w(st.state) : ''; f.textContent = st.role && w(st.role);`);
    ok(rf.raw.length === 2 && rf.raw.map((x) => x.text).join() === '.state,.urgency', '⑥(c) a code-named field drawn raw is named (a textContent, a template title); the same field through a words function, or compared, is not', JSON.stringify(rf.raw));
    const sf = setFindings({ urgency: ['low', 'brand-new'] }, { urgency: { low: 'low' } }, { 'job-state': { up: 'running', zz: 'never translated' } }, { zh: new Set(['running']) });
    ok(sf.length === 2 && gateOf(/brand-new/.test(sf[0])) && verdictOf(/never translated/.test(sf[1])), '⑥(b) a listed value with no words, and a delegated word with no row, are named', JSON.stringify(sf));
    const tp = scanFile('src/lib/tp.js', `a.textContent = new Date(x).toLocaleString(); b = n.toLocaleString('en-US'); c = \`\${m}m ago\`; d = (d.getMonth() + 1) + '/' + d.getDate(); e = new Intl.DateTimeFormat(undefined, {}).format(x); f = Intl.DateTimeFormat().resolvedOptions().timeZone;\n// page-time: a machine day key in the planted control\ng = d.getMonth() + 1;`);
    ok(tp.time.length === 4 && tp.time.map((x) => x.text.split(' ')[0]).join() === 'toLocaleString(),${…}m,getMonth(),new' && tp.time[1].kind === 'unit', '⑦ a bare toLocaleString, an English unit template, a hand-built month and an Intl formatter are named; an en-US machine format, a zone read and a `// page-time:` line are not', JSON.stringify(tp.time));
    ok(scanFile('src/lib/page-time.js', 'x = new Date(1).toLocaleString();').time.length === 0, '⑦ …and page-time.js itself is the one place a time is formatted');
    const sh = scanFile('src/lib/sh.js', "import { stampAt as when } from './page-time.js';\nfunction f(d) { let when; when = d ? when(d) : ''; return when; }\nfunction g(d) { return when(d); }");
    ok(sh.time.length === 1 && verdictOf(/shadows/.test(sh.time[0].text)), '⑦ a page-time import shadowed by a local where it is called is named (the usage meter\'s and the job detail\'s bug); a plain call is not', JSON.stringify(sh.time));
    // ⑥(d) control: an id capitalised by hand is named (both spellings); the same value through the door, and a declared first letter, are not
    const cp = scanFile('c.js', "a.textContent = name.charAt(0).toUpperCase() + name.slice(1);\nb.textContent = themeWord(name, t);\nc.title = v[0].toUpperCase() + v.slice(1);\n// ui-words: the first letter of a sentence t() already worded\nd.textContent = s.charAt(0).toUpperCase() + s.slice(1);");
    ok(cp.caps.length === 2 && cp.caps.map((x) => x.line).join() === '1,3', '⑥(d) a value capitalised by hand is named (charAt(0) and [0]); the same value through themeWord, and a `// ui-words:` first letter, are not', JSON.stringify(cp.caps));
    const pf = pluginFindings([{ id: 'a', label: 'OpenCode background service', description: 'Runs it' }, { id: 'b', label: 'Tailscale' }, { id: 'c', label: 'Public URLs (frp)' }], { zh: new Set(['Runs it', 'Public URLs (frp)']), ja: new Set(['Runs it', 'Public URLs (frp)']) });
    ok(pf.length === 2 && verdictOf(pf.every((x) => /^a\.label: no (zh|ja) row/.test(x))), '⑥(e) a built-in plugin label with no zh / ja row is named (the reader\'s «OpenCode background service»); a name and a held row are not', JSON.stringify(pf));
    // the closure round (主开发 20:39Z): a stored value handed to t() as its key, and the slice / substring spellings of a capitalisation
    const nk = scanFile('src/lib/nk.js', "a.textContent = t(st.state);\nb.textContent = valueWord('job-state', st.state, t);\nc.textContent = t(p.label);");
    ok(nk.raw.length === 1 && nk.raw[0].line === 1 && verdictOf(/key:t/.test(nk.raw[0].sink)), '⑥(c) a code-named field handed to t() as its KEY (t(st.state)) is named; the door, and a non-stored dynamic key, are not', JSON.stringify(nk.raw));
    const sc2 = scanFile('src/lib/sc2.js', "a.textContent = n.slice(0, 1).toUpperCase() + n.slice(1);\nb.title = n.substring(0, 1).toLocaleUpperCase() + n.substring(1);\nc.textContent = n.at(0).toUpperCase() + n.substr(1);\nd.textContent = n.toUpperCase() + m.slice(2);");
    ok(sc2.caps.length === 3 && sc2.caps.map((x) => x.line).join() === '1,2,3', '⑥(d) a capitalisation spelled with slice / substring / at(0) is named (the AST form: an upper-cased first piece + the rest); a whole upper-case is not', JSON.stringify(sc2.caps));
    // ⑦ marks (主开发 2026-11-14): a declared mark sink that calls a sentence's ago(), and an undeclared line printing a mark
    const mk = markFindings([{ file: 'src/lib/x.js', line: 3, text: "p.textContent = t('Updated {ago}', { ago: markAgo(at) });" }, { file: 'src/lib/x.js', line: 1, text: 'a.textContent = durationMark(ms);' }],
      (f) => (f === 'src/lib/x.js' ? ['a.textContent = durationMark(ms);', 'b.textContent = ago(at);', "p.textContent = t('Updated {ago}', { ago: markAgo(at) });"] : []), [['src/lib/x.js', 'a.textContent = durationMark('], ['src/lib/x.js', 'b.textContent = ago(', 'a row age']]);
    ok(mk.length === 2 && gateOf(mk.some((x) => /calls a SENTENCE/.test(x))) && verdictOf(mk.some((x) => /x\.js:3 calls durationMark/.test(x))), '⑦ a mark sink calling a sentence\'s ago() is named, and a sentence printing a mark is named; a declared mark is not', JSON.stringify(mk));
    // the reader's round (13:41Z): its four green mutants, planted — each shape is RED here
    const m1c = scanFile('src/lib/m1c.js', "function sysLine(by) { return '{by} created the group'.replace('{by}', by); }\nfunction ok2(by) { return t('{by} created the group', { by }); }\nconst path = '/api/{id}/x'.replace('{id}', id);");
    ok(m1c.visible.length === 1 && m1c.visible[0].line === 1 && m1c.visible[0].sink === 'hand-filled', '① M1c: a {param} sentence filled by hand (`.replace(\'{by}\', by)`) is named wherever it stands; the same key through t(), and a path template, are not', JSON.stringify(m1c.visible));
    const m2c = scanFile('src/lib/m2c.js', "o.textContent = name.replace(/^./, (c) => c.toUpperCase());\np.textContent = name.replace(/\\b\\w/g, (c) => c.toLocaleUpperCase());\nq.textContent = name.replace(/^-/, '');");
    ok(m2c.caps.length === 2 && m2c.caps.map((x) => x.line).join() === '1,2', '⑥(d) M2c: a value capitalised by a regex (`.replace(/^./, c => c.toUpperCase())`, a \\b\\w title-case) is named; a plain replace is not', JSON.stringify(m2c.caps));
    const m3b = scanFile('src/lib/m3b.js', "a.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;\nb.textContent = d.getHours() + ':' + d.getMinutes();\nc.textContent = `${d.getHours()} h`;");
    ok(m3b.time.filter((x) => /by hand/.test(x.text) && x.kind === 'clock').length === 2, '⑦ M3b: an hh:mm built by hand from getHours / getMinutes (a template or a + \':\' +) is named; an hour count is not', JSON.stringify(m3b.time));
    const m3c = scanFile('src/lib/m3c.js', "import { stampAt as when, clockOf } from './page-time.js';\nfunction render(a) { const when = a ? 'x' : ''; const clock = (ms) => when(ms); return clock(1); }\nconst zz = function () { let clockOf = 1; return () => clockOf(5); };\nfunction fine(d) { const resetAt = when(d); return () => when(d) + resetAt; }");
    ok(m3c.time.length === 2 && verdictOf(m3c.time.every((x) => /shadows/.test(x.text))), '⑦ M3c: a shadowed page-time import called from INSIDE a closure is named (chat-status-bar\'s pool lines); a closure over a renamed local is not', JSON.stringify(m3c.time));
    const lf = loginFindings({ a: { en: 'Sign in', zh: '登录', ja: 'サインイン' }, b: { en: 'Password', zh: 'Password', ja: '' } });
    ok(lf.length === 2 && gateOf(/b: no ja/.test(lf.join())) && verdictOf(/b: the zh row is not Chinese/.test(lf.join())), '⑧ a sign-in row with no ja and an English zh row are named; a whole row is not', JSON.stringify(lf));
    const h = headFindings(["src/x.js:3:  by: 'agent', sessionName: 'Storage',", "src/y.js:9:  sessionName: 'Brand new head',", "src/z.js:1:  sessionName: 'a flag reason', // ui-words: not a head"], { Storage: 'Storage' });
    ok(h.length === 1 && verdictOf(/Brand new head/.test(h[0])), '⑥ a literal For-you head the table does not hold is named; a held one and a `// ui-words:` line are not', JSON.stringify(h));
  }

  const now = await census();
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { visible: {}, english: [] };
  const v = multisetDiff(Object.fromEntries(Object.entries(now.visible).map(([f, hs]) => [f, hs])), base.visible || {});
  const e = multisetDiff({ dict: now.dict.english }, { dict: base.english || [] });
  const rw = multisetDiff(now.raw, base.raw || {});
  const un = multisetDiff(now.units, base.units || {});
  const ck = multisetDiff(now.clocks, base.clocks || {});
  if (process.argv.includes('--lower')) {
    // min(baseline, now): stale rows leave, a NEW hit is never written in
    const keep = (nowMap, baseMap) => Object.fromEntries(Object.entries(baseMap).map(([f, list]) => {
      const have = new Map(); for (const h of nowMap[f] || []) { const s = typeof h === 'string' ? h : h.text; have.set(s, (have.get(s) || 0) + 1); }
      const out = []; for (const s of list) { const n = have.get(s) || 0; if (n > 0) { out.push(s); have.set(s, n - 1); } }
      return [f, out];
    }).filter(([, l]) => l.length));
    const seed = !fs.existsSync(BASELINE) || process.argv.includes('--seed');
    const next = seed
      ? { note: 'lane ui-language — shrink-only: ① visible English outside t() ({file: [text…]}), ⑤ zh/ja rows left in English, ⑥(c) code-named fields drawn raw. Lower with `node scripts/test-ui-language.mjs --lower`; never add a row.', visible: Object.fromEntries(Object.entries(now.visible).map(([f, hs]) => [f, hs.map((h) => h.text)])), english: now.dict.english, raw: Object.fromEntries(Object.entries(now.raw).map(([f, hs]) => [f, hs.map((h) => h.text)])) }
      : { note: base.note, visible: keep(now.visible, base.visible || {}), english: (keep({ dict: now.dict.english }, { dict: base.english || [] }).dict) || [],
          // a leg's section is SEEDED once, by the lane that adds the leg; after that it only shrinks
          raw: base.raw ? keep(now.raw, base.raw) : Object.fromEntries(Object.entries(now.raw).map(([f, hs]) => [f, hs.map((h) => h.text)])),
          units: base.units ? keep(now.units, base.units) : Object.fromEntries(Object.entries(now.units).map(([f, hs]) => [f, hs.map((h) => h.text)])),
          clocks: base.clocks ? keep(now.clocks, base.clocks) : Object.fromEntries(Object.entries(now.clocks).map(([f, hs]) => [f, hs.map((h) => h.text)])) };
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n');
    console.log(`baseline ${seed ? 'SEEDED' : 'lowered'}: ① ${count(next.visible)} · ⑤ ${next.english.length} · ⑥(c) ${count(next.raw || {})} · ⑦ units ${count(next.units || {})} · ⑦ clocks ${count(next.clocks || {})}`);
    process.exit(0);
  }
  if (process.argv.includes('--print')) { for (const [f, hs] of Object.entries(now.visible)) for (const h of hs) console.log(`${f}:${h.line} [${h.sink}] ${h.text}`); }

  console.log(`§1 visible English outside t() — the universe: ${now.files} files the three browser entries reach`);
  ok(now.missed.length === 0 && now.files > 300, `the import walk holds every file a PARSED import reaches (${now.files} files)`, now.missed);
  ok(v.fresh.length === 0, `① no NEW visible English literal outside t() (${count(now.visible)} today = the baseline's ${count(base.visible || {})} rows)`, v.fresh.map((h) => `${h.file}:${h.line} [${h.sink}] ${h.text}  — word it through t() (+ zh / ja rows), or mark \`// ui-words: <why>\``));
  {
    const gone = NOT_DRAWN.filter(([f, fn]) => { try { return !fnLines(fs.readFileSync(path.join(REPO, f), 'utf8'), fn); } catch { return true; } });
    ok(gone.length === 0, `① every NOT_DRAWN row names a function its file still holds (${NOT_DRAWN.length} rows)`, gone);
  }
  ok(v.stale.length === 0, `① no baseline row the tree no longer holds (the list only shrinks — lower it: node scripts/test-ui-language.mjs --lower)`, v.stale.map((h) => `${h.file}: ${h.text}`));
  ok(now.time.length === 0, `⑦ every time and number a person reads goes through src/lib/page-time.js (zero tolerance)`, now.time);
  ok(now.sentenceDates.length === 0, `⑦ a page-time date inside a SENTENCE asks its words form (\`{ words: true }\`: «11月12日», never the table's «11/12») — zero tolerance`, now.sentenceDates);
  ok(now.swallowed.length === 0, `⑨ no trailing // comment swallowed code in the browser bundle (zero tolerance; the .403 mirror's plugin chip) — the comment goes on its own line`, now.swallowed);
  ok(now.caps.length === 0, `⑥(d) no value capitalised by hand in the browser bundle (zero tolerance) — a theme / an id is worded through src/lib/value-words.js`, now.caps);
  ok(un.fresh.length === 0, `⑦ no NEW English unit template (${count(now.units)} today = the baseline's ${count(base.units || {})}) — say a duration with page-time's span / ago`, un.fresh.map((h) => `${h.file}:${h.line} ${h.text}`));
  ok(un.stale.length === 0, `⑦ no unit-template baseline row the tree no longer holds (lower it)`, un.stale.map((h) => `${h.file}: ${h.text}`));
  // the reader's round: an hh:mm read off a Date by hand skips the near rule and the page's zone — a NEW one is red; the ones the
  // tree holds today are a shrink-only list (`clocks`), each to be moved to page-time (a machine clock says `// page-time: <why>`)
  ok(ck.fresh.length === 0, `⑦ no NEW hh:mm built by hand (${count(now.clocks)} today = the baseline's ${count(base.clocks || {})}) — print it with page-time's stampAt / clockOf`, ck.fresh.map((h) => `${h.file}:${h.line} ${h.text}`));
  ok(ck.stale.length === 0, `⑦ no hand-clock baseline row the tree no longer holds (lower it)`, ck.stale.map((h) => `${h.file}: ${h.text}`));
  console.log('§1b the one formatter, driven (the closure round, 主开发 15:15Z)');
  {
    const PT = await import(pathToFileURL(path.join(REPO, 'src/lib/page-time.js')).href);
    // the two US-DST 01:30 instants (2026-11-01, PDT then PST) printed the same — a wall clock the zone lives twice says its offset
    PT.setPageZone('America/Los_Angeles');
    const pdt = Date.parse('2026-11-01T08:30:00Z'), pst = Date.parse('2026-11-01T09:30:00Z'), at = Date.parse('2026-11-13T12:00:00Z');
    const a = PT.stampAt(pdt, { now: at }), b = PT.stampAt(pst, { now: at }), ca = PT.clockOf(pdt), cb = PT.clockOf(pst);
    ok(a !== b && ca !== cb && PT.stampAt(Date.parse('2026-11-01T20:30:00Z'), { now: at }) === PT.stampAt(Date.parse('2026-11-01T20:30:00Z'), { now: at }),
      'a wall clock the zone lives twice (the US fall-back 01:30) says which: the two instants never print the same', [a, b, ca, cb]);
    // «today» is decided in the zone the stamp is printed in: browser-session-words decided it by the DEVICE's calendar
    PT.setPageZone('Asia/Shanghai');
    const BSW = await import(pathToFileURL(path.join(REPO, 'src/lib/browser-session-words.js')).href);
    const w = BSW.whenText(Date.parse('2026-11-13T16:10:00Z'), Date.parse('2026-11-13T15:30:00Z'));   // Shanghai: 11/14 00:10 against 11/13 23:30
    ok(verdictOf(/14/.test(w)), 'a session instant past midnight in the PAGE\'s zone carries its date (whenText reads «today» in the zone it prints in)', w);
    PT.setPageZone(null);
    // THE SPEED CURE (the .403 prep mirror: the 1 758-row Channels panel redrew in 600 ms — page-time built an Intl.DateTimeFormat a
    // call to read the device's zone). (a) The zone is KEPT FOR A MINUTE — the limit — and a zone change is seen once it is over
    {
      const realNow = Date.now, TZ0 = process.env.TZ, t1 = Date.parse('2026-11-14T20:00:00Z');
      try {
        process.env.TZ = 'America/Los_Angeles'; PT.setPageZone(null);   // a zone setting's change re-reads the device's zone at once
        const la = PT.clockOf(t1);
        process.env.TZ = 'Asia/Shanghai';
        const kept = PT.clockOf(t1);
        const later = realNow() + 61000; Date.now = () => later;
        const seen = PT.clockOf(t1);
        const sh = new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Shanghai', hour: 'numeric', minute: '2-digit' }).format(new Date(t1));   // page-time: the control's own reading
        ok(kept === la && seen !== la && seen === sh, 'page-time keeps the device\'s zone for a minute (THE LIMIT: a device whose zone changes prints the old zone that long) — the new zone is seen once the minute is over', { la, kept, seen, sh });
      } finally { Date.now = realNow; if (TZ0 === undefined) delete process.env.TZ; else process.env.TZ = TZ0; PT.setPageZone(null); }
    }
    // (b) the caches are BOUNDED: a walk over 24 zones × 150 days (four quarter-hours each — past every bound at least once) leaves every one under its bound
    {
      const zones = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['Asia/Tokyo', 'Europe/Paris']).slice(0, 24), base = Date.parse('2026-01-01T00:00:00Z');
      let worst = { formats: 0, memo: 0, names: 0 }, sizes = null;
      for (const z of zones) {
        PT.setPageZone(z);
        for (let d = 0; d < 150; d++) for (let q = 0; q < 4; q++) PT.stampAt(base + d * 864e5 + q * 9e5 * 7, { now: base });
        sizes = PT.stampAt.cacheSizes(); for (const k of Object.keys(worst)) worst[k] = Math.max(worst[k], sizes[k]);
      }
      PT.setPageZone(null);
      ok(gateOf(sizes) && worst.formats <= sizes.formatsMax && worst.memo <= sizes.memoMax && worst.names <= sizes.namesMax && worst.memo > 1000, `page-time's caches stay under their bounds over a walk of ${zones.length} zones × 150 days (formats ${worst.formats} ≤ ${sizes && sizes.formatsMax}, quarter-hours ${worst.memo} ≤ ${sizes && sizes.memoMax}, zone names ${worst.names} ≤ ${sizes && sizes.namesMax})`, worst);
    }
    // THE SPAN FORM (主开发 2026-11-15, the machine card's head «· 10/4 11:39–10/4 11:41»): the date ONCE — today none, one day the
    // date at the start, two days both, one reading one stamp, the zone's words once at the end. ITS ORACLE STATES THE LAW, whatever
    // zone the process runs in (the .403 third mirror: under the runner's UTC the old oracle composed clockOf + stampAt — each
    // carrying the zone's words when the page's zone is not the device's — and expected them twice). The leg sets the device's
    // zone itself (process.env.TZ, re-read by setPageZone) and drives BOTH cases: the page's zone = the device's ⇒ no words;
    // ≠ ⇒ the words once, at the end
    {
      const TZ0 = process.env.TZ, now2 = Date.parse('2026-11-15T19:00:00Z'), T = Date.parse('2026-10-04T18:39:00Z'), o = { now: now2 };
      const facts = {}; let okEq = false, okNe = false;
      try {
        process.env.TZ = 'America/Los_Angeles'; PT.setPageZone('America/Los_Angeles');   // the page's zone IS the device's: no words
        const today = PT.stampSpan(now2 - 3600e3, now2 - 3480e3, o), oneDay = PT.stampSpan(T, T + 125e3, o), twoDays = PT.stampSpan(T, T + 864e5, o), one = PT.stampSpan(T, T + 20e3, o);
        okEq = today === `${PT.clockOf(now2 - 3600e3)}–${PT.clockOf(now2 - 3480e3)}` && oneDay === `${PT.stampAt(T, o)}–${PT.clockOf(T + 125e3)}` && twoDays === `${PT.stampAt(T, o)}–${PT.stampAt(T + 864e5, o)}` && one === PT.stampAt(T, o)
          && ![today, oneDay, twoDays, one].some((x) => /\b(P[SD]?T|GMT[+-]\d+)\b/.test(x));
        Object.assign(facts, { today, oneDay, twoDays, one });
        PT.setPageZone('Asia/Tokyo');   // the page's zone is NOT the device's: the zone's words ONCE, at the end
        const tailOf = (x) => { const m = String(x).match(/ (JST|GMT\+9)$/); return m ? m[0] : null; };
        const z = PT.stampSpan(T, T + 125e3, o), s0 = PT.stampAt(T, o), c1 = PT.clockOf(T + 125e3), tail = tailOf(c1);
        okNe = !!tail && tailOf(s0) === tail && z === `${s0.slice(0, -tail.length)}–${c1.slice(0, -tail.length)}${tail}` && (z.match(/JST|GMT\+9/g) || []).length === 1;
        Object.assign(facts, { z, tail });
      } finally { if (TZ0 === undefined) delete process.env.TZ; else process.env.TZ = TZ0; PT.setPageZone(null); }
      ok(gateOf(okEq) && verdictOf(okNe), 'page-time stampSpan says the date ONCE: today none, one day at its start, two days both, one reading one stamp — the zone\'s words once, at the end (both cases driven: the device\'s zone = the page\'s, ≠)', facts);
    }
    // ONE countdown spelling (2.369.403): page-time durationMark({ full }) — the usage popup's «· in 1d10h50m» — and the roster's /
    // the cap ring's fullEta (usage-eta, PURE) are the same function, over every minute of 40 d; the owner's 09-15 form stands
    const UE = await import(pathToFileURL(path.join(REPO, 'src/lib/usage-eta.js')).href);
    const T0 = Date.UTC(2026, 10, 14, 12), cd = (ms) => PT.durationMark(ms, { full: true });
    ok(gateOf(Array.from({ length: 40 * 1440 }, (_, i) => (i + 1) * 60e3).every((ms) => UE.fullEta(T0 + ms, T0) === cd(ms))) && cd(2 * 1440 * 60e3 + 5 * 60e3) === '2d0h5m' && cd(3 * 3600e3) === '3h0m', 'the popup\'s countdown (durationMark({ full })) and the roster\'s fullEta are ONE spelling — usage-eta countdownMark, the owner\'s 09-15 form', [cd(2 * 1440 * 60e3 + 5 * 60e3), UE.fullEta(T0 + 3 * 3600e3, T0)]);
    // every export of the one formatter has a reader in the browser bundle (the closure: until() had none)
    const ptSrc = fs.readFileSync(path.join(REPO, 'src/lib/page-time.js'), 'utf8');
    const exportsOf = [...ptSrc.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
    const used = new Set(now.ptUsed || []);
    const dead = exportsOf.filter((n) => !used.has(n));
    ok(dead.length === 0 && exportsOf.length >= 6, `every export of src/lib/page-time.js has a reader in the bundle (${exportsOf.join(', ')})`, dead);
  }
  // the mutant battery (M4c, the reader's): a value the door has no word for shows as ITSELF — never blank — and a known one is worded
  {
    const VW = await import(pathToFileURL(path.join(REPO, 'src/lib/value-words.js')).href);
    const mk = (k) => '‹' + k + '›';
    const unknown = VW.valueWord('theme', 'my-own-theme', mk), known = VW.valueWord('theme', 'dark', (k) => (k === 'theme::Dark' ? '深色' : k)), bare = VW.valueWord('theme', 'light', (k) => k);
    ok(unknown === 'my-own-theme' && known === '深色' && bare === 'Light', 'value-words: an unknown value shows as itself (never blank), a known one is worded, a contexted key with no row is the word without its context', { unknown, known, bare });
  }
  // the closure round (F12): one-word keys another surface may spell with another meaning live under a context (tc / a set's
  // `set::word`) — never as plain keys
  {
    const GENERIC = ['Light', 'Dark', 'Standard', 'Batch', 'Flex', 'Assistant', 'Tool', 'max', 'count', 'median', 'Root', 'Primary', 'Date', 'Base'];
    const plain = GENERIC.filter((k) => now.dict && (now.dict.zhKeys ? now.dict.zhKeys.has(k) : false));
    const zhSrc = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8');
    const rows = GENERIC.filter((k) => new RegExp('^\\s*' + JSON.stringify(k) + ':', 'm').test(zhSrc));
    ok(rows.length === 0 && plain.length === 0, 'the generic one-word keys this lane added live under a context (theme::Light, service-tier::Standard, msg-role::Assistant, diagnostics::count, theme-color::Root, eml::Date) — no plain row another surface would inherit', rows);
  }
  console.log('§2 the dictionaries');
  // a caption SENTENCE drawn inside an upper-cased head inherits text-transform — «运行 AGENT 会话» (主开发's look, the Machines
  // section): each known (head, sentence) pair says text-transform: none on the sentence
  {
    const css = ['public/style.css', 'public/chat.css'].map((f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return ''; } }).join('\n');
    const ruleOf = (sel) => [...css.matchAll(new RegExp('(?:^|[}\\s,])' + sel.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}', 'g'))].map((m) => m[1]).join(';');
    const PAIRS = [['.mounts-sec-head', '.mounts-sec-sub']];
    const bad = PAIRS.filter(([h, c]) => /text-transform:\s*uppercase/.test(ruleOf(h)) && !/text-transform:\s*none/.test(ruleOf(c)));
    ok(bad.length === 0, 'CSS: a caption sentence inside an upper-cased head is not upper-cased (the Machines caption «运行 AGENT 会话»)', bad);
  }
  {
    const srcLines = new Map(); const linesOf = (f) => { if (!srcLines.has(f)) { try { srcLines.set(f, fs.readFileSync(path.join(REPO, f), 'utf8').split('\n')); } catch { srcLines.set(f, []); } } return srcLines.get(f); };
    const mf = markFindings(now.markLines, linesOf);
    ok(mf.length === 0, `⑦ a compact duration MARK is drawn only at a declared mark sink, through page-time's durationMark (${MARK_SINKS.length} sinks, ${now.markLines.length} mark calls) — a sentence says span / ago`, mf);
  }
  ok(now.plugins.length === 0, `⑥(e) every built-in plugin's label and description that is words has zh + ja rows (src/plugins — drawn through a dynamic t(p.label))`, now.plugins);
  ok(now.sets.findings.length === 0 && now.sets.lists > 30, `⑥ every value the tree lists for a set the door words is in its table (${now.sets.lists} listed values), every delegated word has zh + ja rows`, now.sets.findings);
  ok(rw.fresh.length === 0, `⑥ no NEW code-named field drawn raw in a visible sink (${count(now.raw)} today = the baseline's ${count(base.raw || {})}) — word it through src/lib/value-words.js`, rw.fresh.map((h) => `${h.file}:${h.line} [${h.sink}] ${h.text}`));
  ok(rw.stale.length === 0, `⑥ no raw-field baseline row the tree no longer holds (lower it)`, rw.stale.map((h) => `${h.file}: ${h.text}`));
  ok(now.login.findings.length === 0 && now.login.rows >= 10, `⑧ every row of the sign-in page's words (${now.login.rows}) is whole in en / zh / ja`, now.login.findings);
  ok(now.login.page.length === 0, `⑧ the sign-in page (src/login-page.js, src/auth.js, src/signin-table.js) shows no English literal outside src/login-words.js`, now.login.page);
  ok(now.heads.missing.length === 0 && now.heads.lines > 20, `⑥ every literal For-you head (${now.heads.lines} producer lines) is a row of FORYOU_HEADS (${now.heads.table}) — worded at display, never in the store`, now.heads.missing);
  ok(now.dict.missing.length === 0, `② every extracted key has a zh AND a ja row`, now.dict.missing);
  // B-cc5e (lane bl-tests-e): THE ONE ENTRY PARSER (scripts/i18n-extract.mjs dictEntries — i18n-check's duplicates / parity /
  // params and the unused-key census read it) sees EVERY row the dictionary module holds. An entry ending in a `// …` comment
  // was invisible to it — 1178 rows per dictionary on 2.369.407, six of them dead text no census could name.
  {
    const { dictEntries } = await import(pathToFileURL(path.join(REPO, 'scripts', 'i18n-extract.mjs')).href);
    for (const [lang, rel] of Object.entries(DICTS)) {
      const seen = new Set(dictEntries(fs.readFileSync(path.join(REPO, rel), 'utf8')).map((e) => e.key)), keys = (await dictOf(REPO, rel)).map((e) => e.key);
      const unseen = keys.filter((k) => !seen.has(k));
      ok(keys.length > 10000 && unseen.length === 0 && seen.size === keys.length, `② the one entry parser sees every ${lang} row the module exports (${seen.size} of ${keys.length}) — a trailing comment hides none`, unseen.slice(0, 5));
    }
    const plant = ['export default {', '  "Run": "运行",', '  "Run": "执行", // a second copy — a lane\'s note after it', "  'Stop': '停止',  // single quotes, two spaces", '};'].join('\n');
    const pe = dictEntries(plant);
    ok(pe.map((e) => e.key).join() === 'Run,Run,Stop' && pe[1].value === '执行' && pe[1].line === 3, 'RED CONTROL (the planted dictionary): the duplicate whose second copy carries a trailing comment is SEEN twice — i18n-check\'s duplicate gate can name it', pe);
  }
  ok(now.params.length === 0, `③ every {param} in a literal key is filled by its call`, now.params);
  ok(now.markup.length === 0, `④ no key carrying markup reaches a text sink`, now.markup);
  ok(now.dict.addedMarkup.length === 0, `④ no dict value adds markup its key lacks`, now.dict.addedMarkup);
  ok(e.fresh.length === 0, `⑤ no NEW zh / ja row left in English for a word key (${now.dict.english.length} today = the baseline's ${(base.english || []).length}; ${now.dict.glossary.length} glossary-pending: ${GLOSSARY_PENDING.join(' / ')})`, e.fresh.map((h) => h.text));
  ok(e.stale.length === 0, `⑤ no baseline row the dictionaries no longer hold (lower it)`, e.stale.map((h) => h.text));
  console.log(`\n${fail ? `${fail} FAILED, ${pass} passed` : `ALL PASS (${pass})`} — ${Math.round(performance.now() - t0)} ms`);
  process.exit(fail ? 1 : 0);
};import { verdictOf, gateOf } from './lib/check.mjs';
