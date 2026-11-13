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
//      tree LISTS for a set it words is in its table (session-status STATES / URGENCIES, backend-caps response styles,
//      automation-engine's key.* acts, jobs.js's run causes and triggers) and every delegated word (job-model STATE_WORDS)
//      has zh + ja rows — a new enum value without words is RED. (c) A code-named field (.state .status .role .urgency
//      .stopReason .verb .trigger .cause .tier .theme .permissionMode .effort …) put straight into a visible sink, never
//      through a words function, is RED unless held by its own shrink-only baseline (`raw`).
//
// Every leg runs its NEGATIVE CONTROL first on a planted source / dictionary: it must go red; the same plant worded through
// t() must stay green. Run: node scripts/test-ui-language.mjs [--lower] [--print]
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
    return { file: f, ...r, reached };
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
const CODE_FIELDS = new Set(['state', 'status', 'role', 'urgency', 'stopReason', 'stop_reason', 'verb', 'trigger', 'cause', 'service_tier', 'tier', 'theme', 'permissionMode', 'effort', 'severity', 'outcome']);
const QUIET_OBJ = new Set(['console']);
const NOT_SINK_CALLS = new Set(['Error', 'querySelector', 'querySelectorAll', 'closest', 'fetch', 'matches', 'getItem', 'setItem', 'removeItem', 'addEventListener', 'removeEventListener', 'getElementById', 'test', 'replace', 'replaceAll', 'startsWith', 'includes', 'endsWith', 'split', 'indexOf', 'postMessage', 'send', 'dispatchEvent', 'match', 'matchAll', 'exec']);
const SINK_PROPS = new Set(['textContent', 'innerText', 'title', 'placeholder', 'innerHTML', 'outerHTML', 'ariaLabel', 'alt', 'label']);
const HTML_PROPS = new Set(['innerHTML', 'outerHTML']);
const SINK_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'data-tip']);
const SINK_FNS = new Set(['showToast', 'showConfirmDialog', 'showInputDialog', 'alert', 'confirm', 'prompt']);
const SINK_KEYS = new Set(['label', 'title', 'text', 'placeholder', 'hint', 'tip', 'tooltip', 'desc', 'description', 'message', 'note', 'empty', 'okLabel', 'cancelLabel', 'confirmLabel', 'confirmText', 'body', 'heading', 'subtitle', 'caption', 'help', 'sub', 'detail', 'words', 'say', 'line']);
// a lone word that is a name, not a sentence: brands, products, protocols, units
export const NAMES = new Set(['VibeSpace', 'Claude', 'Codex', 'OpenCode', 'Antigravity', 'Gemini', 'ChatGPT', 'GitHub', 'GitLab', 'Gmail', 'Google', 'Lark', 'Feishu', 'Slack', 'Chrome', 'Chromium', 'Firefox', 'Safari', 'Linux', 'Windows', 'Ubuntu', 'Debian', 'Docker', 'Tailscale', 'TightVNC', 'Xpra', 'Node', 'Python', 'Markdown', 'JSON', 'YAML', 'HTML', 'CSS', 'SSH', 'MCP', 'OAuth', 'Anthropic', 'OpenAI', 'Fable', 'Opus', 'Sonnet', 'Haiku', 'Dropline', 'LibreOffice', 'Excel', 'Word', 'PowerPoint', 'Mermaid', 'CodeMirror', 'Monaco']);
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
function exemptLines(src) {
  const set = new Set();
  const lines = src.split('\n');
  lines.forEach((ln, i) => { const m = ln.match(/\/\/\s*ui-words:\s*(.{8,})/); if (m) { set.add(i + 1); set.add(i + 2); } });
  return set;
}
const MARKUP = /<\/?(?:b|br|i|em|strong|code)\b[^>]*>|\*\*[^*]+\*\*|`[^`]+`/;
const TEXT_SINK = (sink) => !!sink && !HTML_PROPS.has(sink.replace(/^prop:/, '')) && sink !== 'html' && sink !== 'call:insertAdjacentHTML';
/** One file → { visible: [{line, sink, text}], markup: [{line, sink, key}], params: [{line, key, missing}] } */
export function scanFile(file, src, ast = parse(src)) {
  const visible = [], markup = [], params = [], raw = [];
  const ex = exemptLines(src);
  const at = (node) => lineAt(src, node.start);
  const hit = (node, sink, text) => { const line = at(node); if (!ex.has(line)) visible.push({ line, sink, text }); };
  const deferred = new WeakSet();   // t() calls whose params ride beside them: [t(key), { params }]
  const tCall = (n, sink) => {
    const name = n.callee.name;
    const ki = name === 'tc' ? 1 : 0;
    const k = n.arguments[ki];
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
        const obj = c.type === 'MemberExpression' && c.object.type === 'Identifier' ? c.object.name : null;
        if ((obj && QUIET_OBJ.has(obj)) || (name && NOT_SINK_CALLS.has(name))) return;
        if (name === 'setAttribute' && node.arguments[0] && node.arguments[0].type === 'Literal' && SINK_ATTRS.has(node.arguments[0].value)) return walk(node.arguments[1], 'attr:' + node.arguments[0].value);
        if (name === 'insertAdjacentHTML') { for (const a of node.arguments.slice(1)) walk(a, 'call:insertAdjacentHTML'); return; }
        if (name && SINK_FNS.has(name)) { for (const a of node.arguments) walk(a, 'call:' + name); return; }
        walk(c, null);
        for (const a of node.arguments) walk(a, null);
        return;
      }
      case 'NewExpression': if (node.callee.type === 'Identifier' && /Error$/.test(node.callee.name)) return; break;
      case 'ThrowStatement': case 'ImportDeclaration': case 'ExportAllDeclaration': return;
      case 'BinaryExpression': if (/^[!=]==?$|^in$|^instanceof$/.test(node.operator)) return; break;
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
        if (sink && typeof node.value === 'string') { const e = englishOf(node.value); if (e) hit(node, sink, e); }
        return;
      case 'TemplateLiteral': {
        const html = node.quasis.some((q) => /<[a-z][\w-]*[\s>/]|<\/[a-z]/.test(q.value.cooked || ''));
        for (const q of node.quasis) {
          const s = q.value.cooked || '';
          if (html) {
            const segs = [];
            s.replace(/>([^<>]+)</g, (m, g) => { segs.push(g); return m; });
            s.replace(/(?:title|placeholder|aria-label|alt)="([^"$]+)"/g, (m, g) => { segs.push(g); return m; });
            for (const g of segs) { const e = englishOf(g); if (e) hit(q, 'html', e); }
          } else if (sink) { const e = englishOf(s); if (e) hit(q, sink, e); }
        }
        for (const x of node.expressions) walk(x, html ? 'html' : sink);
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
  return { visible, markup, params, raw };
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
  const styles = new Set(); for (const c of Object.values(bc.BACKEND_CAPS || {})) for (const v of (c && c.responseStyle && c.responseStyle.values) || []) styles.add(v);
  const ae = fs.readFileSync(path.join(repo, 'src', 'server', 'automation-engine.js'), 'utf8');
  const jobs = fs.readFileSync(path.join(repo, 'src', 'jobs.js'), 'utf8');
  const causes = new Set([...jobs.matchAll(/'(ok\(until-output\)|interrupted|ok|timeout|error|update_window|wrapper-mismatch)'/g)].map((m) => m[1]).concat(jm.MEMORY_CAUSES || []));
  const triggers = new Set([...jobs.matchAll(/_(?:spawn|startAfter)\(job, '([a-z-]+)'/g)].map((m) => m[1]).concat([...jobs.matchAll(/'(vault-approved|vault-unlocked)'/g)].map((m) => m[1])));
  const lists = { 'session-state': ss.STATES || [], urgency: ss.URGENCIES || [], 'response-style': [...styles], 'vault-act': [...new Set([...ae.matchAll(/verb: '(key\.[a-z]+)'/g)].map((m) => m[1]))], 'job-cause': [...causes], 'job-trigger': [...triggers] };
  const vw = await import(pathToFileURL(path.join(repo, 'src', 'lib', 'value-words.js')).href);
  return { lists, sets: vw.VALUE_SETS, delegated: { 'job-state': jm.STATE_WORDS || {} } };
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
  const visible = {}, markup = [], params = [], missed = [], raw = {};
  const inUni = new Set(files);
  for (const r of scanned) {
    if (r.visible.length) visible[r.file] = r.visible.map((h) => ({ ...h, text: h.text.slice(0, 160) }));
    if (r.raw.length) raw[r.file] = r.raw;
    for (const m of r.markup) markup.push(`${r.file}:${m.line} [${m.sink}] ${m.key.slice(0, 90)}`);
    for (const p of r.params) params.push(`${r.file}:${p.line} {${p.missing.join(', ')}} ${p.key.slice(0, 90)}`);
    for (const x of r.reached) if (!inUni.has(x) && !Object.values(DICTS).includes(x)) missed.push(`${r.file} → ${x}`);
  }
  const rowsOf = (d) => new Set(d.map((x) => x.key));
  const sets = { findings: setFindings(vsets.lists, vsets.sets, vsets.delegated, { zh: rowsOf(zh), ja: rowsOf(ja) }), lists: Object.values(vsets.lists).reduce((a, l) => a + l.length, 0) };
  return { files: files.length, visible, raw, sets, markup, params, missed, heads: { lines: heads.lines.length, table: Object.keys(heads.table).length, missing: headFindings(heads.lines, heads.table) }, dict: dictFindings(keys, { zh, ja }) };
}

// ── a worker's share (the module is loaded whole first: every table above exists) ──
if (!isMainThread && workerData && Array.isArray(workerData.files)) parentPort.postMessage(scanFiles(workerData.files, workerData.repo));

// ── main ──
const isMain = isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const t0 = performance.now();
  let pass = 0, fail = 0;
  const ok = (cond, msg, detail) => { if (cond) { pass++; console.log(`  ✓ ${msg}`); } else { fail++; console.log(`  ✗ ${msg}${detail ? '\n      ' + [].concat(detail).slice(0, 40).join('\n      ') : ''}`); } };

  console.log('§0 the negative controls (planted sources and rows — each leg must go red)');
  {
    const planted = `el.textContent = 'Customize mode — drag to move it'; a.title = t('Fine words'); b.innerHTML = \`<div class="x">Add remote machine</div>\`; showToast('Public key copied'); const o = { label: 'Username on that machine' };`;
    const r = scanFile('planted.js', planted);
    ok(r.visible.length === 4 && r.visible.map((h) => h.sink).join(',') === 'prop:textContent,html,call:showToast,key:label', `① a planted bare English literal in four sinks is named (${r.visible.length}); the same words through t() are not`, JSON.stringify(r.visible));
    const worded = scanFile('worded.js', `el.textContent = t('Customize mode — drag to move it'); showToast(t('Public key copied')); el.title = 'claude-fable-5'; x.textContent = 'Codex'; // ui-words: a planted control line\ny.textContent = 'Plain English words'; // ui-words: a planted exempt line`);
    ok(worded.visible.length === 0, '① …worded through t(), an id, a brand and a `// ui-words:` line are not', JSON.stringify(worded.visible));
    const p = scanFile('p.js', `x.textContent = t('Shows {n} waiting'); y.textContent = t('{n} more', { n }); z.textContent = t('{a} of {b}', { a: 1 }); const d = { description: [t('Marked “{label}”'), { label: t('needs you') }] };\nconst m = t('fire after {n} min'); // ui-words: {n} marks where the number input is embedded`);
    ok(p.params.length === 2 && p.params[1].missing.join() === 'b', '③ a {param} its call never fills is named (no params object; a params object without it); a filled one is not', JSON.stringify(p.params));
    const m = scanFile('m.js', `p.textContent = t('<b>{n}</b> sessions', { n }); q.innerHTML = t('<b>{n}</b> sessions', { n }); showToast(t('run \`{line}\` now', { line }));`);
    ok(m.markup.length === 2 && m.markup.every((x) => x.sink !== 'prop:innerHTML'), '④ a markup key in a TEXT sink is named (textContent, a toast); the same key into innerHTML is not', JSON.stringify(m.markup));
    const d = dictFindings(['Find', 'Fine words'], { zh: [{ key: 'Find', value: 'Find', line: 1 }, { key: 'the agent', value: 'agent', line: 2 }, { key: 'The most turns on ONE account', value: '在**同一个账号**上的上限', line: 3 }, { key: 'Claude', value: 'Claude', line: 4 }] });
    ok(d.missing.join() === 'zh: Fine words', '② a key with no zh row is named', JSON.stringify(d.missing));
    ok(d.english.join() === 'zh: Find' && d.glossary.join() === 'zh: the agent', '⑤ a zh row left in English is named; a glossary-pending word and a brand are not', JSON.stringify(d));
    ok(d.addedMarkup.length === 1, '④ a dict value that adds ** its key lacks is named', JSON.stringify(d.addedMarkup));
    const rf = scanFile('rf.js', `a.textContent = j.state; b.textContent = valueWord('job-state', j.state, t); c.title = \`\${st.urgency} ok\`; if (j.state === 'up') d.textContent = 'x'; e.textContent = st.state ? w(st.state) : ''; f.textContent = st.role && w(st.role);`);
    ok(rf.raw.length === 2 && rf.raw.map((x) => x.text).join() === '.state,.urgency', '⑥(c) a code-named field drawn raw is named (a textContent, a template title); the same field through a words function, or compared, is not', JSON.stringify(rf.raw));
    const sf = setFindings({ urgency: ['low', 'brand-new'] }, { urgency: { low: 'low' } }, { 'job-state': { up: 'running', zz: 'never translated' } }, { zh: new Set(['running']) });
    ok(sf.length === 2 && /brand-new/.test(sf[0]) && /never translated/.test(sf[1]), '⑥(b) a listed value with no words, and a delegated word with no row, are named', JSON.stringify(sf));
    const h = headFindings(["src/x.js:3:  by: 'agent', sessionName: 'Storage',", "src/y.js:9:  sessionName: 'Brand new head',", "src/z.js:1:  sessionName: 'a flag reason', // ui-words: not a head"], { Storage: 'Storage' });
    ok(h.length === 1 && /Brand new head/.test(h[0]), '⑥ a literal For-you head the table does not hold is named; a held one and a `// ui-words:` line are not', JSON.stringify(h));
  }

  const now = await census();
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { visible: {}, english: [] };
  const v = multisetDiff(Object.fromEntries(Object.entries(now.visible).map(([f, hs]) => [f, hs])), base.visible || {});
  const e = multisetDiff({ dict: now.dict.english }, { dict: base.english || [] });
  const rw = multisetDiff(now.raw, base.raw || {});
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
          raw: base.raw ? keep(now.raw, base.raw) : Object.fromEntries(Object.entries(now.raw).map(([f, hs]) => [f, hs.map((h) => h.text)])) };
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n');
    console.log(`baseline ${seed ? 'SEEDED' : 'lowered'}: ① ${count(next.visible)} · ⑤ ${next.english.length} · ⑥(c) ${count(next.raw || {})}`);
    process.exit(0);
  }
  if (process.argv.includes('--print')) { for (const [f, hs] of Object.entries(now.visible)) for (const h of hs) console.log(`${f}:${h.line} [${h.sink}] ${h.text}`); }

  console.log(`§1 visible English outside t() — the universe: ${now.files} files the three browser entries reach`);
  ok(now.missed.length === 0 && now.files > 300, `the import walk holds every file a PARSED import reaches (${now.files} files)`, now.missed);
  ok(v.fresh.length === 0, `① no NEW visible English literal outside t() (${count(now.visible)} today = the baseline's ${count(base.visible || {})} rows)`, v.fresh.map((h) => `${h.file}:${h.line} [${h.sink}] ${h.text}  — word it through t() (+ zh / ja rows), or mark \`// ui-words: <why>\``));
  ok(v.stale.length === 0, `① no baseline row the tree no longer holds (the list only shrinks — lower it: node scripts/test-ui-language.mjs --lower)`, v.stale.map((h) => `${h.file}: ${h.text}`));
  console.log('§2 the dictionaries');
  ok(now.sets.findings.length === 0 && now.sets.lists > 30, `⑥ every value the tree lists for a set the door words is in its table (${now.sets.lists} listed values), every delegated word has zh + ja rows`, now.sets.findings);
  ok(rw.fresh.length === 0, `⑥ no NEW code-named field drawn raw in a visible sink (${count(now.raw)} today = the baseline's ${count(base.raw || {})}) — word it through src/lib/value-words.js`, rw.fresh.map((h) => `${h.file}:${h.line} [${h.sink}] ${h.text}`));
  ok(rw.stale.length === 0, `⑥ no raw-field baseline row the tree no longer holds (lower it)`, rw.stale.map((h) => `${h.file}: ${h.text}`));
  ok(now.heads.missing.length === 0 && now.heads.lines > 20, `⑥ every literal For-you head (${now.heads.lines} producer lines) is a row of FORYOU_HEADS (${now.heads.table}) — worded at display, never in the store`, now.heads.missing);
  ok(now.dict.missing.length === 0, `② every extracted key has a zh AND a ja row`, now.dict.missing);
  ok(now.params.length === 0, `③ every {param} in a literal key is filled by its call`, now.params);
  ok(now.markup.length === 0, `④ no key carrying markup reaches a text sink`, now.markup);
  ok(now.dict.addedMarkup.length === 0, `④ no dict value adds markup its key lacks`, now.dict.addedMarkup);
  ok(e.fresh.length === 0, `⑤ no NEW zh / ja row left in English for a word key (${now.dict.english.length} today = the baseline's ${(base.english || []).length}; ${now.dict.glossary.length} glossary-pending: ${GLOSSARY_PENDING.join(' / ')})`, e.fresh.map((h) => h.text));
  ok(e.stale.length === 0, `⑤ no baseline row the dictionaries no longer hold (lower it)`, e.stale.map((h) => h.text));
  console.log(`\n${fail ? `${fail} FAILED, ${pass} passed` : `ALL PASS (${pass})`} — ${Math.round(performance.now() - t0)} ms`);
  process.exit(fail ? 1 : 0);
}
