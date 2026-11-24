// THE SETTINGS' FACES (B-eca3, lane lg-text-legs-2, 2026-11-21) — PURE over a checkout's TEXT (static: acorn + string reads,
// nothing run, nothing spawned). scripts/test-settings-view.mjs §14 judges what this returns:
//   L1 SERVER → SCHEMA   every key the server reads is a schema key. A read = `serverSetting(<key>)` in server.js or src/ (the
//                        page's src/lib excluded), or a call through a HAND-OFF the suite names (`walk`: the receiving file, the
//                        call it reads with, the argument holding the key). A key is a literal, a const of the file, an object
//                        member of the file, a const of a required module, or a one-level wrapper's argument at its callers.
//   L2 DOCS → SCHEMA     every backticked setting-shaped name in docs/settings.md is a schema key or a RETIRED one (the
//                        generated tables equal the schema already: test-architecture 44d).
//   L3 THE WALK IS WHOLE `dynamic` = every read the walk cannot name («<file>: <callee>(<argument>)», one entry a site), and
//                        `handoffs` = every place server code hands the reader on under ANOTHER name (`k: serverSetting`,
//                        `k: (x) => serverSetting(x)`, `X.k = …`): the suite's two closed lists.
//   L5 SCHEMA → DOCS     (judged by the suite from `keys` and `docNames`, B-eca3's remainder) every schema row is a name in
//                        docs/settings.md — a plugin's rows (registered at run time) excepted.
//   L4 (printed only)    the hand-written rows no RESOLVED read call names — a server read above, or a page read
//                        (`….settings.get('<key>')`, `onSetting('<key>')` in src/lib, src/*.js); the page's readers do not
//                        resolve statically (their dynamic count is returned), so the suite prints, never judges (B-eca3's ruling).
// `patch` = { 'rel/path': text } overrides a file (a planted red); `rows` = schema rows to add; `walk` = [[file, call, argIndex,
// firstArgText?], …] the hand-offs' receivers. Per-file results are memoised by text, so a planted run re-reads only its patch.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', 'vendor']);
const MEMO = new Map();   // `${kind}\0${file}\0${text}` → the file's result
const PARSE = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true };
function parse(acorn, src) { for (const sourceType of ['script', 'module']) { try { return acorn.parse(src, { ...PARSE, sourceType }); } catch { } } return null; }
const walkNode = (n, fn, anc = []) => { if (!n || typeof n.type !== 'string') return; fn(n, anc); anc.push(n); for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) walkNode(x, fn, anc); } else if (v && typeof v.type === 'string') walkNode(v, fn, anc); } anc.pop(); };
const fnName = (fn, anc) => { const up = anc[anc.indexOf(fn) - 1]; return (fn.id && fn.id.name) || (up && up.type === 'VariableDeclarator' && up.id.name) || (up && up.type === 'Property' && (up.key.name || up.key.value)) || (up && up.type === 'AssignmentExpression' && up.left.type === 'MemberExpression' && up.left.property.name) || null; };
const calleeName = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
// a value that IS the server reader: `serverSetting`, or a function whose only work is to call it (a try / catch around it too)
const handsTheReader = (v) => {
  if (!v) return false;
  if (v.type === 'Identifier') return v.name === 'serverSetting';
  if (!/Function/.test(v.type)) return false;
  let b = v.body;
  const one = (x) => (x && x.type === 'BlockStatement' && x.body.length === 1 ? x.body[0] : null);
  for (let i = 0; i < 3 && b && b.type !== 'CallExpression'; i++) {
    const s = one(b) || b;
    if (s.type === 'ReturnStatement') b = s.argument;
    else if (s.type === 'TryStatement') b = s.block;
    else if (s.type === 'ExpressionStatement') b = s.expression;
    else break;
  }
  return !!(b && b.type === 'CallExpression' && calleeName(b.callee) === 'serverSetting');
};

function serverFile(acorn, f, src, textOf, walkHere) {
  const memoKey = `s\0${f}\0${JSON.stringify(walkHere)}\0${src}`;
  if (MEMO.has(memoKey)) return MEMO.get(memoKey);
  const out = { reads: [], dynamic: [], handoffs: [] };
  const ast = parse(acorn, src);
  if (!ast) { out.dynamic.push(`${f}: (does not parse)`); MEMO.set(memoKey, out); return out; }
  const consts = new Map(), objs = new Map(), requires = new Map(), calls = [], wrappers = new Map();
  const fromModule = (rel, key) => { let p = path.join(path.dirname(f), rel); if (!/\.(?:c?js|mjs)$/.test(p)) p += '.js'; let t; try { t = textOf(p); } catch { return null; } const m = new RegExp(`\\b${key}\\s*[:=]\\s*(['"\`])([^'"\`\\n]+)\\1`).exec(t); return m ? m[2] : null; };
  walkNode(ast, (n, anc) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
      if (n.init.type === 'Literal' && typeof n.init.value === 'string') consts.set(n.id.name, n.init.value);
      if (n.init.type === 'ObjectExpression') { const m = new Map(); for (const p of n.init.properties) if (p.type === 'Property' && p.value.type === 'Literal' && typeof p.value.value === 'string') m.set(p.key.name || p.key.value, p.value.value); objs.set(n.id.name, m); }
      if (n.init.type === 'CallExpression' && n.init.callee.type === 'Identifier' && n.init.callee.name === 'require' && n.init.arguments[0] && n.init.arguments[0].type === 'Literal' && /^\./.test(n.init.arguments[0].value)) requires.set(n.id.name, n.init.arguments[0].value);
    }
    // a HAND-OFF: the reader given on under another name
    if (n.type === 'Property' && !n.computed && n.kind === 'init') { const k = n.key.name || n.key.value; if (k && k !== 'serverSetting' && handsTheReader(n.value)) out.handoffs.push(`${f}: ${k}`); }
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && !n.left.computed && n.left.property.name !== 'serverSetting' && handsTheReader(n.right)) out.handoffs.push(`${f}: ${src.slice(n.left.start, n.left.end)}`);
    if (n.type === 'CallExpression') {
      const nm = calleeName(n.callee);
      if (nm === 'serverSetting') calls.push({ n, anc: [...anc], argIndex: 0, via: null });
      for (const [, call, argIndex, firstArg] of walkHere) if (nm === call && (!firstArg || (n.arguments[0] && src.slice(n.arguments[0].start, n.arguments[0].end) === firstArg))) calls.push({ n, anc: [...anc], argIndex, via: call });
    }
  });
  const keyOf = (a) => {
    if (!a) return null;
    if (a.type === 'Literal' && typeof a.value === 'string') return a.value;
    if (a.type === 'TemplateLiteral' && !a.expressions.length) return a.quasis[0].value.cooked;
    if (a.type === 'Identifier' && consts.has(a.name)) return consts.get(a.name);
    if (a.type === 'MemberExpression' && !a.computed && a.object.type === 'Identifier' && objs.has(a.object.name)) return objs.get(a.object.name).get(a.property.name) ?? null;
    if (a.type === 'MemberExpression' && !a.computed && a.object.type === 'Identifier' && requires.has(a.object.name)) return fromModule(requires.get(a.object.name), a.property.name);
    if (a.type === 'MemberExpression' && !a.computed && a.object.type === 'CallExpression' && a.object.callee.type === 'Identifier' && a.object.callee.name === 'require' && a.object.arguments[0] && /^\./.test(String(a.object.arguments[0].value || ''))) return fromModule(a.object.arguments[0].value, a.property.name);
    return null;
  };
  const argText = (a, n) => (a ? src.slice(a.start, a.end) : src.slice(n.start, n.end)).replace(/\s+/g, ' ').slice(0, 80);
  for (const { n, anc, argIndex, via } of calls) {
    const a = n.arguments[argIndex], k = keyOf(a), fn = [...anc].reverse().find((x) => /Function/.test(x.type)), inFn = fn ? fnName(fn, anc) : null;
    const where = `${f}:${n.loc.start.line}${via ? ` (via ${via})` : ''}${inFn ? ` in ${inFn}` : ''}`;
    if (k !== null) { out.reads.push([k, where]); continue; }
    const pIdx = !via && fn && a && a.type === 'Identifier' ? fn.params.findIndex((p) => p.type === 'Identifier' && p.name === a.name) : -1;
    if (pIdx >= 0 && inFn) wrappers.set(inFn, pIdx);
    else out.dynamic.push(`${f}: ${via || 'serverSetting'}(${argText(a, n)})`);
  }
  if (wrappers.size) walkNode(ast, (n) => {
    if (n.type !== 'CallExpression') return;
    const nm = calleeName(n.callee);
    if (!nm || !wrappers.has(nm)) return;
    const a = n.arguments[wrappers.get(nm)], k = keyOf(a);
    if (k !== null) out.reads.push([k, `${f}:${n.loc.start.line} (via ${nm})`]);
    else out.dynamic.push(`${f}: ${nm}(${argText(a, n)})`);
  });
  MEMO.set(memoKey, out);
  return out;
}

function pageFile(acorn, f, src) {
  const memoKey = `p\0${f}\0${src}`;
  if (MEMO.has(memoKey)) return MEMO.get(memoKey);
  const out = { reads: [], dynamic: 0 };
  if (/settings\??\.get\(|onSetting\(/.test(src)) {
    const ast = parse(acorn, src);
    if (ast) walkNode(ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const c = n.callee, nm = calleeName(c);
      const isRead = (nm === 'get' && c.type === 'MemberExpression' && /settings$/.test(src.slice(c.object.start, c.object.end))) || nm === 'onSetting';
      if (!isRead) return;
      const a = n.arguments[0];
      if (a && a.type === 'Literal' && typeof a.value === 'string') out.reads.push(a.value); else out.dynamic++;
    });
  }
  MEMO.set(memoKey, out);
  return out;
}

export async function settingsFaces(repo, { patch = {}, rows = {}, walk = [] } = {}) {
  const req = createRequire(path.join(repo, 'package.json'));
  const acorn = req('acorn');
  const S = await import(pathToFileURL(path.join(repo, 'src/lib/settings-schema.js')).href);
  const schema = { ...S.SETTINGS_SCHEMA, ...rows };
  const retired = new Set(S.RETIRED_SETTING_KEYS || []);
  const keys = Object.keys(schema), prefixes = new Set(keys.map((k) => k.split('.')[0]));
  const files = [];
  const walkDir = (d) => { for (const n of fs.readdirSync(path.join(repo, d), { withFileTypes: true })) { const r = d + '/' + n.name; if (n.isDirectory()) { if (!SKIP_DIRS.has(n.name)) walkDir(r); } else if (/\.(?:js|cjs|mjs)$/.test(n.name)) files.push(r); } };
  walkDir('src'); files.push('server.js');
  for (const rel of Object.keys(patch)) if (!files.includes(rel) && /\.(?:js|cjs|mjs)$/.test(rel)) files.push(rel);
  const textOf = (rel) => (rel in patch ? patch[rel] : fs.readFileSync(path.join(repo, rel), 'utf8'));
  // ── L1 / L3 ──
  const reads = new Map(), dynamic = [], handoffs = [];
  for (const f of files) {
    if (f.startsWith('src/lib/')) continue;
    const src = textOf(f), walkHere = walk.filter((w) => w[0] === f);
    if (!src.includes('serverSetting') && !walkHere.length) continue;
    const r = serverFile(acorn, f, src, textOf, walkHere);
    for (const [k, where] of r.reads) { if (!reads.has(k)) reads.set(k, []); reads.get(k).push(where); }
    dynamic.push(...r.dynamic); handoffs.push(...r.handoffs);
  }
  // ── L2 ──
  const doc = 'docs/settings.md' in patch ? patch['docs/settings.md'] : fs.readFileSync(path.join(repo, 'docs/settings.md'), 'utf8');
  const docNames = new Map();
  for (const m of doc.matchAll(/`([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+)`/g)) {
    const k = m[1];
    if (!prefixes.has(k.split('.')[0]) || /\.(?:js|mjs|cjs|json|md|sh|ts|css|html)$/.test(k)) continue;
    docNames.set(k, (docNames.get(k) || 0) + 1);
  }
  // ── L4 (printed): the rows no resolved read call names ──
  const pageReads = new Set(); let pageDynamic = 0;
  for (const f of files) {
    if (!(f.startsWith('src/lib/') || /^src\/[^/]+\.m?js$/.test(f))) continue;
    const r = pageFile(acorn, f, textOf(f));
    for (const k of r.reads) pageReads.add(k);
    pageDynamic += r.dynamic;
  }
  const derived = (k) => !!(schema[k].harness || (schema[k].when && schema[k].when.channel) || k.startsWith('plugin.'));
  const hand = keys.filter((k) => !derived(k) && schema[k].store === undefined);
  const unreadByCall = hand.filter((k) => !reads.has(k) && !pageReads.has(k));
  return { schema, keys, retired, reads, dynamic, handoffs: [...new Set(handoffs)], docNames, files: files.length, hand: hand.length, unreadByCall, pageReads: pageReads.size, pageDynamic, derived: keys.filter(derived).length, stored: keys.filter((k) => schema[k].store !== undefined).length };
}
