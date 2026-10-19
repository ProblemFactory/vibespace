// THE `by` CENSUS (lane device-act-audit, design q-042 D4): a hub act on a device is never anonymous. Every call of a device
// client method that can send an act / code op (src/device-acts.js CLIENT_ACT_METHODS — test-device-acts proves that list
// against src/agentd/client.js) in the hub's sources (src/** but the browser's src/lib/**, plus server.js) passes a `by`
// AT THE CALL: an object argument with a `by` property (`{ timeoutMs, by }`, `{ by: 'system:writer-sweep' }`). A call
// without one is RED with its file:line — the ONE send point would refuse it at run time (`act_without_by`), this finds it
// before. `tcpForward` is an act only with a host argument (a loopback port is a read). Parsed with acorn (a string or a
// comment that names a method is never a call). Used by scripts/test-architecture.mjs (the census row) and
// scripts/test-device-acts.mjs (the census + a mutant that drops `by` from a hosts.js runCmd ⇒ RED).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const acorn = require('acorn');

function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') walk(x, fn); }
    else if (v && typeof v.type === 'string') walk(v, fn);
  }
}
const hasBy = (args) => args.some((a) => a && a.type === 'ObjectExpression' && a.properties.some((p) => p.type === 'Property' && !p.computed && ((p.key.type === 'Identifier' && p.key.name === 'by') || (p.key.type === 'Literal' && p.key.value === 'by'))));

/** The hub's source files the census reads (repo-relative). */
export function censusFiles(root) {
  const all = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', 'src', 'server.js'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  return all.filter((f) => f.endsWith('.js') && !f.startsWith('src/lib/') && f !== 'src/agentd/client.js' && fs.existsSync(path.join(root, f)));
}

/** → { calls: [{file, line, method, ok}], missing: [...the calls without a by] }. `override` = { file: text } (a mutant). */
export function censusActCalls({ root, files = null, override = {} } = {}) {
  const DA = require(path.join(root, 'src', 'device-acts.js'));
  const methods = new Set(DA.CLIENT_ACT_METHODS);
  const calls = [];
  for (const f of files || censusFiles(root)) {
    const text = Object.prototype.hasOwnProperty.call(override, f) ? override[f] : fs.readFileSync(path.join(root, f), 'utf8');
    if (!DA.CLIENT_ACT_METHODS.some((m) => text.includes('.' + m + '('))) continue;
    let ast;
    const opts = (sourceType) => ({ ecmaVersion: 'latest', sourceType, allowHashBang: true, locations: true, allowReturnOutsideFunction: sourceType === 'script', allowAwaitOutsideFunction: true });
    try { ast = acorn.parse(text, opts('script')); }
    catch { try { ast = acorn.parse(text, opts('module')); } catch (e) { calls.push({ file: f, line: (e.loc && e.loc.line) || 0, method: '(parse)', ok: false, why: 'unparseable: ' + e.message }); continue; } }
    walk(ast, (n) => {
      if (n.type !== 'CallExpression' || !n.callee || n.callee.type !== 'MemberExpression' || n.callee.computed) return;
      const m = n.callee.property && n.callee.property.name;
      if (!methods.has(m)) return;
      const hostArg = DA.HOST_ARG_METHODS[m];
      if (hostArg != null) { const a = n.arguments[hostArg]; if (!a || (a.type === 'Identifier' && a.name === 'undefined')) return; }
      calls.push({ file: f, line: n.loc.start.line, method: m, ok: hasBy(n.arguments) });
    });
  }
  return { calls, missing: calls.filter((c) => !c.ok) };
}
