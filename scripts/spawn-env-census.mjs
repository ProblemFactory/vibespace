// THE SPAWN-ENV CENSUS (lane spawn-env-census, 2026-10-20 — test-architecture §94). Every child the hub, the device
// daemon and data/bin start with an ASYNC child_process / node-pty call (spawn / execFile / fork / exec — the forms that
// can outlive the call; a *Sync child is one the caller waits out) is a SITE classified by the env it passes:
//   builder  agentEnv (agents) · daemonEnv (the device agent) · serviceEnv (every other long-lived service) · relayEnv
//            (the relay client, from 2.369.329) — src/agent-env.js / src/relay-token.js; directly, spread under explicit
//            names, or through a variable
//   literal  an env object built from scratch (no spread)
//   named    an env built elsewhere BY NAME — a helper's result, an options object, a parameter the caller hands in
//   raw      no env (the child inherits the whole process.env), `process.env`, `{ ...process.env }`, `x || process.env`,
//            a parameter whose DEFAULT is process.env — RED unless a ROW below names it with its reason
// and every place that COPIES process.env whole (`{ ...process.env }`, Object.entries / assign / fromEntries) outside a
// raw site's own env is a COPY — RED unless a COPY row names it (an env built in one function and spawned in another
// hides from the site census; the copy census sees it: src/mounts.js _rcloneFor).
// Row kinds (why a raw inherit is ALLOWED):
//   probe     a short-lived helper the hub awaits (its exit / its timeout bound it); its output is read and it ends
//   upstream  the process's OWN env was built before it: an agent wrapper (born of agentEnv / ws-create's r6Env), the
//             device daemon (born of daemonEnv), a remote host's process (born of its sshd), an agent's CLI tool
//   default   a factory's default when no env is handed in — every production caller hands a builder's env (named)
//   self      the hub restarting itself: its successor needs the hub's whole config env
//   debt      a LONG-LIVED child that still inherits — named, its `next:` in the why (主开发 decides the lane)
// EVERY RAW ROW HANDS ON THE HUB'S ENV WITHOUT A JOB'S NAMES (B-7ca1; B-2c5c (5)): a hub started INSIDE a Background Work job
// (its main) drops every VIBESPACE_JOB_* that job's spawn handed it — the run mark, the id, the bearer, the directory — at the
// jobs engine's construction (src/jobs.js), so no probe / upstream / default / self / debt child above inherits that job's id (a
// vibespace-job with no id there would speak as the job) or its bearer; every builder drops them too (VIBESPACE_* outside its
// keep set). test-job-hub-main §3 drives it (a stand-in hub inside a real job) and test-stop-tree pins the line
// A raw group with no row, a row whose sites are gone (DEAD) or whose count differs, a copy with no row, a FIXED site that
// is not on its builder ⇒ RED. Rows are [file, cmd (the call's first argument, as written), kind, count, why].
// THE SSH ROADS (lane spawn-env-debts, 2026-10-20): every call whose first argument names ssh / rsync / scp / sftp — made by
// ANY function (execFile, spawn, a promise wrapper like ws-handler's execFileAsync, which the site census cannot see
// through) — passes `env: <hosts>.sshEnv()`, the ONE helper beside sshArgs: a multiplexed call forks the ControlMaster,
// which keeps that call's env for ControlPersist (600 s) while every later call rides it. SSH_ROWS name the exceptions.
// DERIVED builders (sshEnv) count as builders by name: each is defined in its home file ALONE and built over its base;
// ENV_FUNCS pin an env built in one function and spawned in others (src/mounts.js _rcloneFor) to its builder.
// THE ARGV PASS (lane antigravity-spawn-argv, 2026-10-21): a site's argv words (array literals, spreads, the variables they
// name, one function deep) are read for NAME=value words. A SECRET-SHAPED name there (SECRET_ON_ARGV) is RED with no row
// possible: /proc/<pid>/cmdline is world-readable for the child's whole life. The session line put
// VIBESPACE_SESSION_TOKEN=… on every local session's dtach + wrapper argv until 2.369.336; the names ride the spawn's env
// now (src/spawn/line.js). Every other NAME= word is counted (printed by §94). A `pty` handed in by a context (the ws
// ctx's node-pty: `const { pty } = ctx`) is node-pty, so ws-create's session spawn is a SITE (it was invisible).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { gitEnvFrom } from './git-env.mjs';

/** the four builders: an env BUILT by one of them never needs a row */
export const BUILDERS = Object.freeze(['agentEnv', 'daemonEnv', 'serviceEnv', 'relayEnv', 'sshEnv']);
/** a NAME on argv that is a secret's by its shape (the argv pass) — never allowed, no row */
export const SECRET_ON_ARGV = /TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|API_?KEY|PRIVATE_KEY/;
/** DERIVED builders: [name, home file, the builder it is built over, what] — a builder BY NAME, so it lives in one file */
export const DERIVED = Object.freeze([
  ['sshEnv', 'src/hosts.js', 'serviceEnv', "HostManager.sshEnv(), every ssh road's env (beside sshArgs)"],
]);
/** ENV FUNCTIONS: [file, function, the variable it builds, builder, what] — an env built in one function, spawned in others */
export const ENV_FUNCS = Object.freeze([
  ['src/mounts.js', '_rcloneFor', 'env', 'serviceEnv', "every rclone mount daemon / probe's env (rcloneEnv: the service list + RCLONE_ENV_KEEP + egress + the provider's RCLONE_CONFIG_VS_*)"],
]);
const ROAD_BINS = new Set(['ssh', 'rsync', 'scp', 'sftp']);   // a child that rides the ssh ControlMaster (rsync -e hosts.sshCmd)
const WANT = new Set([...DERIVED.map((d) => d[0]), ...ENV_FUNCS.map((e) => e[1])]);
const CALLS = new Set(['spawn', 'execFile', 'fork', 'exec']);                   // the async forms: a child that can OUTLIVE the call
const SYNC = new Set(['spawnSync', 'execFileSync', 'execSync']);               // the hub waits for these — never a long-lived child
const MODS = /^(?:node:)?child_process$|^node-pty$/;
const kidsOf = (n) => { const o = []; for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') o.push(x); } else if (v && typeof v.type === 'string') o.push(v); } return o; };
const isProcessEnv = (n) => n && n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'process' && n.property.name === 'env';
// require('<mod>') → '<mod>'; a computed require (`require(path.join(__dirname, '…/node-pty'))`) → the module's last path word
const requireOf = (n) => {
  if (!(n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require' && n.arguments[0])) return null;
  const a = n.arguments[0];
  if (a.type === 'Literal') return String(a.value);
  const lit = a.type === 'CallExpression' ? a.arguments.filter((x) => x.type === 'Literal' && typeof x.value === 'string').map((x) => x.value).pop() : null;
  const m = lit && /(?:^|\/)((?:node:)?child_process|node-pty)$/.exec(lit);
  return m ? m[1] : null;
};

/** the files: tracked JS under src/ + data/bin (a node-shebang script there counts), + server.js */
export function filesOf(repo) {
  const ls = execFileSync('git', ['-C', repo, 'ls-files', 'server.js', 'src', 'data/bin'], { encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 16 << 20 }).split('\n').filter(Boolean);
  return ls.filter((f) => /\.(c?js|mjs)$/.test(f) || (f.startsWith('data/bin/') && /^#!.*\bnode\b/.test(fs.readFileSync(path.join(repo, f), 'utf8').split('\n')[0])));
}

/** scan(repo, { patch: { file: text } }) → { sites, copies, errors } — `patch` swaps a file's text (the mutants) */
export function scan(repo, { patch = {}, files = filesOf(repo) } = {}) {
  const acorn = createRequire(path.join(repo, 'package.json'))('acorn');
  const sites = [], copies = [], errors = [], roads = [], defs = [], wholes = [];
  for (const f of files) {
    const src = Object.prototype.hasOwnProperty.call(patch, f) ? patch[f] : fs.readFileSync(path.join(repo, f), 'utf8');
    // a file with no call of those names and no whole-env copy holds no site (only a cheap text test before the parse)
    if (!/\b(?:spawn|execFile|fork|exec)\s*\(/.test(src) && !/(?:\.\.\.|Object\.(?:entries|assign|fromEntries)\()[^;\n]{0,40}process\.env\b/.test(src)
      && !/\(\s*['"](?:ssh|rsync|scp|sftp)['"]\s*,|\bsshEnv\b/.test(src) && !/\bwholeEnv\b/.test(src)) continue;
    let ast = null;
    for (const sourceType of ['script', 'module']) { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true }); break; } catch { } }
    if (!ast) { errors.push(f); continue; }
    const T = (n) => src.slice(n.start, n.end);
    const one = (s) => s.replace(/\s+/g, ' ').trim();
    const fns = [], decls = [], calls = [], envs = [];
    const parent = new Map();
    const visit = (n, stack) => {
      const isFn = /Function/.test(n.type);
      const st = isFn ? [...stack, n] : stack;
      const scope = stack[stack.length - 1] || ast;
      if (isFn) fns.push(n);
      if (n.type === 'VariableDeclarator' && n.init) {
        if (n.id.type === 'Identifier') decls.push({ name: n.id.name, start: n.start, init: n.init, scope });
        else if (n.id.type === 'ObjectPattern') for (const p of n.id.properties) if (p.type === 'Property' && p.value.type === 'Identifier') decls.push({ name: p.value.name, start: n.start, from: n.init, key: p.key.name || p.key.value, scope });
      }
      if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') decls.push({ name: n.left.name, start: n.start, init: n.right, scope });
      if (n.type === 'CallExpression') calls.push({ n, stack: st });
      if (isProcessEnv(n)) envs.push({ n, stack: st });
      // B-323e THE WHOLE ENV: a request handing the starter its child's WHOLE env (`wholeEnv: true`) — each one a WHOLE_ROWS row
      if (n.type === 'Property' && !n.computed && (n.key.name === 'wholeEnv' || n.key.value === 'wholeEnv') && n.value.type === 'Literal' && n.value.value === true) {
        const fn = stack[stack.length - 1], up = fn && parent.get(fn);
        const name = !fn ? '(top)' : (fn.id && fn.id.name) || (up && up.type === 'VariableDeclarator' && up.id.name) || (up && (up.type === 'MethodDefinition' || up.type === 'Property') && (up.key.name || up.key.value)) || '(anonymous)';
        wholes.push({ file: f, line: n.loc.start.line, fn: name });
      }
      for (const c of kidsOf(n)) { parent.set(c, n); visit(c, st); }
    };
    visit(ast, []);
    const within = (s, p) => s.start <= p && p <= s.end;
    const paramOf = (name, stack) => {
      for (let i = stack.length - 1; i >= 0; i--) {
        const fn = stack[i];
        for (const p of fn.params || []) {
          const hit = [];
          const g = (q, dflt) => { if (!q) return; if (q.type === 'Identifier') hit.push({ name: q.name, dflt }); else if (q.type === 'AssignmentPattern') g(q.left, q.right); else if (q.type === 'ObjectPattern') for (const pp of q.properties) g(pp.value || pp.argument); };
          g(p);
          const h = hit.find((x) => x.name === name);
          if (h) return { fn: (fn.id && fn.id.name) || (parent.get(fn) && parent.get(fn).type === 'VariableDeclarator' && parent.get(fn).id.name) || (parent.get(fn) && parent.get(fn).type === 'Property' && (parent.get(fn).key.name || parent.get(fn).key.value)) || '(anon)', dflt: h.dflt || null };
        }
      }
      return null;
    };
    const resolve = (name, at, stack) => {
      let best = null;
      for (const d of decls) if (d.name === name && d.start < at && within(d.scope, at) && (!best || d.start > best.start)) best = d;
      if (best) return best;
      const p = paramOf(name, stack);
      return p ? { param: p } : null;
    };
    // the callee: which child_process function it names (null = not one)
    const bound = (name, at, stack) => {
      const d = resolve(name, at, stack);
      if (!d) return CALLS.has(name) ? name : null;
      if (d.param) { const df = d.param.dflt; if (!df) return CALLS.has(name) ? name : null; if (df.type === 'MemberExpression' && !df.computed) return df.property.name; return null; }
      if (d.from) return requireOf(d.from) && MODS.test(requireOf(d.from)) ? d.key : null;
      const i = d.init;
      if (i.type === 'MemberExpression' && !i.computed && (requireOf(i.object) && MODS.test(requireOf(i.object)) || i.object.type === 'Identifier')) return i.property.name;
      return null;   // a local wrapper (its own body holds the real call)
    };
    const isModObj = (o, at, stack) => {
      if (requireOf(o)) return MODS.test(requireOf(o));
      if (o.type === 'Identifier') { const d = resolve(o.name, at, stack); if (!d) return /^(cp|childProcess|child_process)$/.test(o.name); if (d.from && d.key === 'pty') return true; if (d.param) return !!(d.param.dflt && requireOf(d.param.dflt) && MODS.test(requireOf(d.param.dflt))); if (d.init) return !!(requireOf(d.init) && MODS.test(requireOf(d.init))); return false; }
      if (o.type === 'CallExpression' && o.callee.type === 'Identifier') { const fd = fns.find((fn) => fn.id && fn.id.name === o.callee.name); return !!(fd && /require\(['"](?:node-pty|(?:node:)?child_process)['"]\)/.test(T(fd))); }
      return false;
    };
    // the env's class: builder | literal | named | raw (+ the ranges a raw env spans: a COPY inside them is that site's)
    const classify = (e, at, stack, spans, depth = 0) => {
      if (!e) return { k: 'raw', why: 'no env (inherits the whole process.env)' };
      spans.push([e.start, e.end]);
      if (isProcessEnv(e)) return { k: 'raw', why: 'process.env' };
      if (depth > 5) return { k: 'named', by: one(T(e)).slice(0, 60) };
      switch (e.type) {
        case 'ObjectExpression': {
          const sp = e.properties.filter((p) => p.type === 'SpreadElement').map((s) => classify(s.argument, at, stack, spans, depth + 1));
          if (sp.find((x) => x.k === 'raw')) return { k: 'raw', why: '{ ...process.env }' };
          if (!sp.length) return { k: 'literal' };
          return sp.find((x) => x.k === 'builder') || sp[0];
        }
        case 'LogicalExpression': case 'ConditionalExpression': {
          const parts = (e.type === 'LogicalExpression' ? [e.left, e.right] : [e.consequent, e.alternate]).map((x) => classify(x, at, stack, spans, depth + 1));
          return parts.find((x) => x.k === 'raw') || parts.find((x) => x.k === 'builder') || parts[0];
        }
        case 'CallExpression': {
          const c = e.callee, nm = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
          if (nm && BUILDERS.includes(nm)) return { k: 'builder', by: nm };
          if (c.type === 'Identifier') { const d = resolve(c.name, at, stack); const f0 = d && (d.param ? d.param.dflt : d.init); if (f0 && /ArrowFunctionExpression|FunctionExpression/.test(f0.type) && f0.body && f0.body.type !== 'BlockStatement') { const x = classify(f0.body, at, stack, spans, depth + 1); if (x.k === 'raw') return { ...x, why: `${c.name}() → ${x.why}`, dflt: d.param ? d.param.fn : null }; if (x.k === 'builder') return x; } }
          return { k: 'named', by: one(T(c)).slice(0, 60) + '()' };
        }
        case 'Identifier': {
          const d = resolve(e.name, at, stack);
          if (!d) return { k: 'named', by: e.name + ' (module-level / outer)' };
          if (d.param) {   // an env HANDED IN: the caller's — unless the param's default is the whole process.env
            const df = d.param.dflt && classify(d.param.dflt, at, stack, spans, depth + 1);
            if (df && df.k === 'raw') return { k: 'raw', why: `${d.param.fn}'s default (${e.name} = process.env) when no caller hands one in`, dflt: d.param.fn };
            return { k: 'named', by: `${d.param.fn}(…, ${e.name})` };
          }
          if (d.from) return { k: 'named', by: `{ ${d.key} } = ${one(T(d.from)).slice(0, 50)}` };
          return classify(d.init, d.init.start, stack, spans, depth + 1);
        }
        case 'MemberExpression': return { k: 'named', by: one(T(e)).slice(0, 60) };
        default: return { k: 'named', by: e.type };
      }
    };
    // a spread of object literals only (`...(enc ? { encoding: enc } : {})`) with no env key: it hands no env
    const literalOnly = (a) => (a.type === 'ObjectExpression' ? !a.properties.some((q) => q.type === 'SpreadElement' || (q.key && (q.key.name === 'env' || q.key.value === 'env')))
      : a.type === 'ConditionalExpression' ? literalOnly(a.consequent) && literalOnly(a.alternate) : a.type === 'LogicalExpression' ? literalOnly(a.right) : false);
    for (const { n, stack } of calls) {
      const c = n.callee;
      let fn = null;
      if (c.type === 'Identifier') fn = bound(c.name, n.start, stack);
      else if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' && (CALLS.has(c.property.name) || SYNC.has(c.property.name)) && isModObj(c.object, n.start, stack)) fn = c.property.name;
      if (!fn || !CALLS.has(fn)) continue;
      const { v, spans } = envOfCall(n, stack);
      sites.push({ file: f, line: n.loc.start.line, call: one(T(c)), cmd: n.arguments[0] ? one(T(n.arguments[0])).slice(0, 48) : '', ...v, spans, argv: argvWords(n.arguments[1], n.start, stack) });
    }
    // THE SSH ROADS: any callee — the first argument names the binary (a literal, or `x.sshBin || 'ssh'`)
    for (const { n, stack } of calls) {
      const a0 = n.arguments[0];
      if (!a0 || n.arguments.length < 2) continue;
      const lit = a0.type === 'Literal' ? a0.value : a0.type === 'LogicalExpression' && a0.right.type === 'Literal' ? a0.right.value : null;
      if (!ROAD_BINS.has(lit)) continue;
      const { v } = envOfCall(n, stack);
      roads.push({ file: f, line: n.loc.start.line, cmd: one(T(a0)).slice(0, 48), ...v });
    }
    // the DERIVED builders' and the ENV FUNCTIONS' definitions: what they return / the env variable they build
    for (const fnN of fns) {
      const p = parent.get(fnN);
      const name = (fnN.id && fnN.id.name) || (p && p.type === 'MethodDefinition' && !p.computed && p.key.name) || (p && p.type === 'Property' && !p.computed && (p.key.name || p.key.value))
        || (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier' && p.id.name) || null;
      if (!name || !WANT.has(name)) continue;
      const rets = [], vars = {};
      const own = (q) => { if (!q || typeof q.type !== 'string') return; if (q !== fnN.body && /Function/.test(q.type)) return; if (q.type === 'ReturnStatement' && q.argument) rets.push(q.argument); if (q.type === 'VariableDeclarator' && q.id.type === 'Identifier' && q.init) vars[q.id.name] = q.init; for (const k of kidsOf(q)) own(k); };
      if (fnN.body.type !== 'BlockStatement') rets.push(fnN.body); else own(fnN.body);
      const cl = (e) => classify(e, e.start, [fnN], []);
      const rc = rets.map(cl);
      defs.push({ file: f, name, line: fnN.loc.start.line, ret: rc.find((x) => x.k !== 'builder') || rc[0] || { k: 'none' }, rets: rc.length, vars: Object.fromEntries(Object.entries(vars).map(([k, e]) => [k, cl(e)])) });
    }
    // THE ARGV PASS: the NAME=value words a site's argv can carry (literals and template heads; arrays, spreads, branches,
    // and the variables they name, resolved)
    function argvWords(a, at, stack, depth = 0, out = []) {
      if (!a || depth > 6) return out;
      if (a.type === 'ArrayExpression') {
        for (const el of a.elements) {
          if (!el) continue;
          if (el.type === 'SpreadElement') { argvWords(el.argument, at, stack, depth + 1, out); continue; }
          const head = el.type === 'Literal' && typeof el.value === 'string' ? el.value : el.type === 'TemplateLiteral' ? el.quasis[0].value.cooked : null;
          const m = head == null ? null : /^([A-Z_][A-Z0-9_]*)=/.exec(head);
          if (m) out.push({ name: m[1], line: el.loc.start.line });
        }
      } else if (a.type === 'Identifier') { const d = resolve(a.name, at, stack); if (d && d.init) argvWords(d.init, at, stack, depth + 1, out); }
      else if (a.type === 'ConditionalExpression') { argvWords(a.consequent, at, stack, depth + 1, out); argvWords(a.alternate, at, stack, depth + 1, out); }
      else if (a.type === 'LogicalExpression') { argvWords(a.left, at, stack, depth + 1, out); argvWords(a.right, at, stack, depth + 1, out); }
      return out;
    }
    function envOfCall(n, stack) {
      let opts = n.arguments.slice(1).find((a) => a.type === 'ObjectExpression') || null, optsBy = null;
      if (!opts) {
        const last = n.arguments.slice(1).filter((a) => a.type === 'Identifier').pop();
        if (last) { const d = resolve(last.name, n.start, stack); if (d && d.init && d.init.type === 'ObjectExpression') opts = d.init; else optsBy = last.name; }
      }
      const spans = [];
      let v;
      if (optsBy) v = { k: 'named', by: `options ${optsBy}` };
      else {
        const p = opts && opts.properties.find((q) => q.type === 'Property' && (q.key.name === 'env' || q.key.value === 'env'));
        if (p) v = classify(p.value, n.start, stack, spans);
        else if (opts && opts.properties.some((q) => q.type === 'SpreadElement' && !literalOnly(q.argument))) v = { k: 'named', by: 'options spread' };
        else v = classify(null, n.start, stack, spans);
      }
      return { v, spans };
    }
    // COPIES: process.env used WHOLE (not `process.env.X`) — a copy, a fallback, a hand-off — outside a builder's argument
    for (const { n } of envs) {
      let u = n, p = parent.get(u);
      while (p && (p.type === 'LogicalExpression' || p.type === 'ConditionalExpression')) { u = p; p = parent.get(u); }
      const spread = p && p.type === 'SpreadElement' && p.argument === u && parent.get(p) && parent.get(p).type === 'ObjectExpression';
      const cc = p && p.type === 'CallExpression' && p.arguments.includes(u) ? p.callee : null;
      const copier = cc && cc.type === 'MemberExpression' && !cc.computed && cc.object.type === 'Identifier' && cc.object.name === 'Object' && /^(entries|assign|fromEntries)$/.test(cc.property.name);
      if (!spread && !copier) continue;                                                       // a read / a hand-off — not a copy
      copies.push({ file: f, line: n.loc.start.line, pos: n.start, text: one(src.split('\n')[n.loc.start.line - 1]).slice(0, 140) });
    }
  }
  // a copy inside a raw spawn site's env (or the declaration it resolved to) belongs to that site's row
  for (const cp of copies) cp.site = sites.find((s) => s.file === cp.file && s.k === 'raw' && s.spans.some(([a, b]) => a <= cp.pos && cp.pos <= b)) || null;
  return { sites, copies, errors, roads, defs, files, wholes };
}

const PROBE = 'a short-lived helper the hub awaits — bounded by its exit / its timeout';
const WRAPPER = "the agent's own process tree: the wrapper was born with the env the hub BUILT for the session (agentEnv + the session's names — src/ws-create.js r6Env) and hands it to the CLI (billing keys ride env, never argv)";
const DAEMON = "runs INSIDE agentd, whose own env was born of daemonEnv (client.js _spawnLocal, the --stdio bridge, the re-exec); a factory default of process.env there IS the daemon's built env";
const REMOTE = "runs on the REMOTE host (shipped there over ssh): born of that host's sshd + the hub's explicit `env K=v` prefix";
/** FIXED: [file, cmd, what, { by = 'serviceEnv', count = 1 }] — a site that inherited once, held to its builder */
export const FIXED = Object.freeze([
  ['src/vnc.js', 'xvnc', 'the singleton Desktop\'s Xvnc'],
  ['src/vnc.js', 'c', 'the Desktop session (dbus-launch xfce4-session / openbox / xterm)'],
  ['src/agentd/client.js', "t.sshBin || 'ssh'", 'the remote agentd ssh stdio bridge'],
  // lane spawn-env-debts (2026-10-20): the census's named debts
  ['src/device-mount.js', 'rcloneBin', 'the device-folder rclone mount daemon (+ RCLONE_ENV_KEEP, egress, its RCLONE_CONFIG_VSDEV_*)'],
  ['src/plugins/tailscale.js', 'cmd', 'tailscaled (egress: the control plane through the operator\'s proxy)'],
  ['src/routes/files.js', "'bash'", 'xclip, the clipboard holder (+ the display and ITS cookie)'],
  ['src/server/boot-restore.js', 'DTACH_CMD', "the remote chat re-adopt's transport (as ws-create's r6Env)", { by: 'agentEnv' }],
  // lane engine-distribution (P4 of the custom browser kernel): two NEW children, held to their builder from the start
  ['src/server/plugin-install.js', 'gitBin', "a plugin install's git children (init / fetch / checkout / rev-parse / ls-remote, each with its timeout): serviceEnv + the egress door + named git switches — a private repository's credential only through the 0600 files GIT_ASKPASS / GIT_SSH_COMMAND name, never an env value"],
  ['src/server/engine-distribution.js', 'exe', "a browser engine kernel's `--version`, run ONCE after its install / before its first launch (5 s) — the measured version"],
  // lane cli-shell-truth (B-fb02): a NEW child, held to its builder from the start
]);
/** SSH_ROWS: [file, cmd, builder | 'upstream', why] — the ssh roads NOT on hosts.sshEnv() */
export const SSH_ROWS = Object.freeze([
  ['src/agentd/client.js', "t.sshBin || 'ssh'", 'serviceEnv', 'the agentd bridge: its argv comes from the transport hosts.js builds; its env is serviceEnv over the same SSH_ENV_KEEP (src/agentd never requires hosts.js)'],
  ['src/agentd/attach-cli.js', "cfg.sshBin || 'ssh'", 'upstream', "the attach CLI runs as a session's command inside its pty (the env the hub built for that session); its sshArgs never multiplex (src/spawn/ssh.js)"],
]);
export const ROWS = Object.freeze([
  ['data/bin/acp-wrapper.js', 'cmd', 'upstream', 1, WRAPPER],
  ['src/claude-oat-trampoline.js', 'bin', 'upstream', 1, 'lane cli-self-measure (acceptance r3 item 1): the measurement\'s trampoline — its own env is the one the launcher built and checked against the allowlist (assertEnv) before strace started it; the binary inherits exactly that, and gets its OWN stderr (never the tracer\'s record)'],
  ['data/bin/chat-wrapper.js', 'cmd', 'upstream', 1, WRAPPER],
  ['data/bin/codex-chat-wrapper.js', 'cmd', 'upstream', 1, WRAPPER],
  ['data/bin/pty-wrapper.js', 'cmd', 'upstream', 1, WRAPPER + ' — a terminal session'],
  ['data/bin/agy-wrapper.js', 'cmd', 'upstream', 2, WRAPPER + " — Google's Antigravity CLI (agy, lane antigravity-harness): the wrapper is born with agentEnv + the named account's creds.spawnEnv; + its --version record probe (no network, measured)"],
  ['data/bin/vibespace-opencode-op', "'git'", 'probe', 1, "an agent's CLI tool (its env is the agent's): `git init` of the serve's scratch dir, 10 s"],
  ['data/bin/vibespace-opencode-op', 'CMD', 'upstream', 1, "opencode serve started by an agent's CLI tool: the agent's env (agentEnv)"],
  ['data/bin/vibespace-remote-keeper', 'process.execPath', 'upstream', 1, REMOTE + ' — the keeper re-execs itself as its daemon'],
  ['data/bin/vibespace-remote-keeper', 'cmd[0]', 'upstream', 1, REMOTE + ' — the session CLI the keeper holds'],
  ['src/agentd/attach-cli.js', "cfg.sshBin || 'ssh'", 'upstream', 1, "the attach CLI runs as a session's command inside its pty: the env the hub built for that session"],
  ['src/agentd/stream-mac.js', 'file', 'upstream', 1, DAEMON + ' (the Mac helper build / run)'],
  ['src/agentd/stream-mac.js', "'/usr/bin/open'", 'upstream', 1, DAEMON],
  ['src/agentd/stream-mac.js', 'sp.file', 'upstream', 2, DAEMON + ' (the screen helper)'],
  ['src/agentd/stream-screen.js', 'file', 'upstream', 1, DAEMON],
  ['src/agentd/stream-screen.js', 'plan.ffmpeg', 'upstream', 2, DAEMON + ' (the screen stream ffmpeg)'],
  ['src/agentd/stream-window-source.js', 'file', 'upstream', 1, DAEMON],
  ['src/agentd/stream-window-source.js', 'plan.ffmpeg', 'upstream', 1, DAEMON + ' (the window stream ffmpeg)'],
  ['src/agentd/stream-window-source.js', 'plan.helper', 'upstream', 1, DAEMON + ' (the window helper)'],
  ['src/app-serve.js', 'cmd', 'probe', 1, PROBE + ' (an app probe; its callers hand the display env, process.env only when none)'],
  ['src/cli-identity.js', "'pgrep'", 'probe', 1, PROBE + ' (pgrep, 2 s)'],
  ['src/proc-identity.js', "'ps'", 'probe', 1, PROBE + " (B-5a4d root, r3282: ONE listing of every process for a chat wrapper's start on a machine with no procfs, 3 s — the same env as startToken's ps, so a recorded start reads in the same words)"],
  ['src/codex-thread-read.js', 'cmd', 'probe', 1, 'codex app-server for ONE thread read, killed after the answer; the callers hand agentEnv (process.env only when none)'],
  ['src/desktop-display.js', 'binPath', 'default', 1, "rdpBuildFacts's default; desktop-serve hands the display's env (agentEnv-based)"],
  ['src/hosts.js', "'ssh-keygen'", 'probe', 3, PROBE + " (the hub's own key, once; and a machine key's PUBLIC half derived on a person's read — ui-needs-a-button publicKeyOf; B-2ca0: keyFileVerdict — a key file the person named, judged usable by BatchMode at the add, public half only)"],
  ['src/hosts.js', "'head'", 'probe', 1, PROBE + " (a machine key's .pub read on a person's press — the key path is the person's, so a 5 s child reads it, never the hub's threadpool: ui-needs-a-button publicKeyOf)"],
  ['src/incident.js', 'cmd', 'probe', 1, PROBE + ' (the incident capture helpers, 8 s)'],
  ['src/installed-apps.js', 'argv[0]', 'default', 1, "listInstalled's default; agentd hands spawnEnv() (daemonEnv), the hub its display env"],
  ['src/machine-mounts.js', "'sh'", 'probe', 1, PROBE + ' (a mount path check, 6 s)'],
  ['src/machine-probes.js', 'cmd', 'probe', 1, PROBE + ' (the machine facts probes)'],
  ['src/server/child-starter-proc.js', 'cmd', 'upstream', 2, "B-91aa THE STARTER: the hub's timer sites' programs (the mount liveness `ls`, the port scan's `sh`, the belt's X tools) — and (B-323e, 主开发 r1299) the DETACHED start (the mount daemon: its whole env, its log; never held) — the starter was BORN of serviceEnv (src/server/child-starter.js) and adds only the names a request carries (the X / locale names, DOCKER_*); B-323e: a request marked `whole` starts its child with exactly the request's env, built by its site through serviceEnv (WHOLE_ROWS)"],
  ['src/mounts.js', "'sh'", 'probe', 1, PROBE + ' (the rclone binary copy; the modprobe shim rides the starter since B-323e\'s part 3 remainder)'],
  ['src/mounts.js', "'curl'", 'probe', 3, PROBE + ' (the rclone download, two OAuth callback pokes)'],
  ['src/mounts.js', "'unzip'", 'probe', 1, PROBE],
  ['src/mounts.js', 'local', 'probe', 1, PROBE + ' (rclone version)'],
  ['src/mounts.js', "'rmdir'", 'probe', 1, PROBE],
  ['src/mounts.js', "'mc'", 'probe', 1, PROBE + " (mc --version: B-323e — only a share's act (a mint, a revoke) whose ask the starter left unanswered; every other ask rides the starter)"],
  ['src/opslog.js', "'sudo'", 'probe', 2, PROBE + ' (the ops log ceph mount, sudo -n)'],
  ['src/plugins/tailscale.js', 'run[0]', 'probe', 1, PROBE + ' (5 s)'],
  ['src/plugins/frp.js', "'tar'", 'probe', 1, PROBE + ' (the install\'s unpack, async, 120 s — rank 13\'s census)'],
  ['src/plugins/tailscale.js', "useSudo ? 'sudo' : cli", 'probe', 1, PROBE + ' (tailscale up / down / logout)'],
  ['src/routes/files.js', "'find'", 'probe', 1, PROBE],
  ['src/routes/files.js', 'cmd', 'probe', 3, PROBE + ' (archive extract / list streams)'],
  ['src/routes/files.js', "'unzip'", 'probe', 1, PROBE],
  ['src/routes/files.js', "'tar'", 'probe', 4, PROBE + ' (archive list, the copy streams)'],
  ['src/routes/files.js', "type === 'zip' ? 'unzip' : 'tar'", 'probe', 1, PROBE + ' (an archive listing)'],
  ['src/routes/files.js', "'zip'", 'probe', 1, PROBE + ' (a folder download stream)'],
  ['src/routes/files.js', "'du'", 'probe', 1, PROBE + ' (15 s)'],
  ['src/server/cli-env.js', 'CODEX_CMD', 'probe', 1, PROBE + ' (codex sandbox -- true, 20 s)'],
  ['src/server/desktop-access.js', 'launch[0]', 'default', 1, "create()'s default env; server.js hands agentEnv()"],
  ['src/server/mount-health-watch.js', 'process.execPath', 'probe', 1, PROBE + ' (its own --suspects scan child)'],
  ['src/server/ops-routes.js', "'bash'", 'self', 1, "the self-update script: it restarts the hub, and the next hub is born of it — the successor needs the hub's own config env"],
  ['src/server/permission-rules.js', 'cmd', 'default', 1, 'the permission oracle: `{ ...(agentEnv ? agentEnv() : process.env) }` — server.js hands agentEnv; bounded by its timeout'],
  ['src/server/tls.js', 'bin', 'probe', 1, PROBE + ' (openssl / mkcert)'],
  ['src/sysinfo.js', 'bin', 'probe', 1, PROBE + " (runProgram — B-360d: sysctl / vm_stat 4 s, ps / df 8 s; the DEVICE AGENT's road only — the hub hands its starter (src/server/child-starter.js), whose small process starts them with serviceEnv)"],
  ['src/window-targets.js', 'python', 'default', 1, "runHelper's default; every caller hands the display env (x11Env over agentEnv)"],
  ['src/ws-create.js', "'test'", 'probe', 1, PROBE + ' (4 s)'],
  ['src/ws-create.js', "'mkdir'", 'probe', 1, PROBE + ' (8 s)'],
  ['src/ws-create.js', "'git'", 'probe', 1, PROBE + ' (6 s)'],
  ['src/ws-handler.js', 'cmd', 'probe', 1, PROBE + " (execFileAsync, 20 s — its default env when a caller hands none: tar; the ssh callers hand hosts.sshEnv(), the SSH ROADS rule holds them)"],
]);
/** COPY rows: [file, needle (on the copy's line), kind, count, why] */
export const COPIES = Object.freeze([
  ['data/bin/vibespace-browser', "Object.entries(process.env).filter(([k]) => !k.startsWith('AGENT_BROWSER_'))", 'upstream', 1, "the agent browser CLI: the agent's env minus AGENT_BROWSER_*"],
  ['src/desktop-display.js', 'const e = { ...(env || process.env) };', 'default', 1, "x11Env's base: server.js hands agentEnv(), agentd daemonEnv"],
  ['src/desktop-display.js', "spawnDetached(binPath || 'xpra'", 'default', 1, 'xpra: its callers hand x11Env(agentEnv) — process.env only when none'],
  ['src/mounts.js', 'return { ...process.env, MC_HOST_vsshare:', 'probe', 1, PROBE + ' (mc one-shots)'],
  ['src/opencode-serve.js', 'env = () => ({ ...process.env })', 'default', 1, 'the module default; server.js hands agentEnv() (src/server/cli-env.js)'],
  ['src/server/cli-env.js', '{ ...process.env, ', 'probe', 3, PROBE + ' (the display probes, spawnSync)'],
  ['src/server/plugin-loader.js', 'agentEnv = () => ({ ...process.env })', 'default', 1, 'the module default; server.js hands agentEnv()'],
  ['src/server/vault-run-door.js', 'agentEnv = () => ({ ...process.env })', 'default', 1, 'the module default (lane vault-run-door); src/server/mounts-plugins-wiring.js hands agentEnv() — the run child gets a sanitized env, never the hub\'s; this is the test / fallback shape'],
  ['src/server/cli-usage-door.js', 'function createCliUsageDoor({ accounts, harnessOf, cliCmds, cacheDir, usageWrite', 'default', 1, 'the module default `agentEnv = () => ({ ...process.env })` on the factory\'s signature line (lane antigravity-card-fixes, int332 seam; the needle is the line\'s head — the census reads 140 characters); src/server/account-usage-routes.js hands ws-handler\'s agentEnv() — the Re-check usage child gets the agents\' sanitized env, never the hub\'s; this is the test / fallback shape'],
  ['src/server/cli-models-door.js', 'function createCliModelsDoor({ accounts, harnessOf, cliCmds, dataDir = null, agentEnv', 'default', 1, 'the module default `agentEnv = () => ({ ...process.env })` on the factory\'s signature line (lane agy-models-report); src/server/account-usage-routes.js hands ws-handler agentEnv() — every harness\'s credential names dropped, the descriptor\'s keyEnvVars deleted again in the door'],
  ['src/server/stdout/claude-stream-json.js', 'Object.entries(process.env)) if (!/^GIT_/', 'probe', 1, PROBE + ' (git rev-parse with the hub env minus GIT_*, 6 s)'],
]);
// THE PRIORITY ROADS (B-460d, the owner's yes of 2026-11-17 — WHAT A CONVERSATION STARTS NEVER OUTRANKS THE HUB): each road
// that starts a local conversation or a job has ONE place where its spawn's argv takes `nice -n 5` (src/server/spawn-priority.js
// decides, src/spawn/line.js priorityArgv spells it) — B-7f18's vault run door the one road that sets it right after its spawn instead
// (src/server/vault-run-door.js lowerRun: no program in front of a minted value). Rows: [file, what, the place spelled, count]. Every caller of the session
// line (`sessionSpawnLine(`) is a row's file or a PRIORITY_EXCEPT row with its reason — a new road with no priority is RED.
export const PRIORITY_ROADS = Object.freeze([
  ['src/spawn/line.js', 'THE session line starts with the start\'s priority words', 'argv: [...priorityArgv(priority), node, wrapper,', 1],
  ['src/ws-create.js', 'a create asks the start\'s priority (local or not) and hands it to THE line — the dtach road and the daemon pipe run that line', 'const r6Pri = SPRI.priorityFor({ serverSetting, local: !session.host });', 1],
  ['src/ws-create.js', '…the line is built with it', 'exe: spawnCmd, args: spawnArgs, priority: r6Pri.priority,', 1],
  ['src/jobs.js', 'a job\'s wrapper is spawned with the priority words first', "const argv = [...priorityArgv(pri && pri.priority), process.execPath, ...[wrapper, ctl, specPath, '--proto=' + WRAPPER_PROTO]];", 1],
  ['src/jobs.js', '…and spawned by that argv', 'child = spawn(argv[0], argv.slice(1), {', 1],
  ['src/server/jobs-wiring.js', 'the jobs engine is handed the start\'s priority (the setting read per start)', "spawnPriority: () => require('./spawn-priority.js').priorityFor({ serverSetting,", 1],
  ['src/server/vault-run-door.js', 'B-7f18: a vault run\'s command (the door spawns it for an agent) reads the start\'s step before its spawn', 'let by = 0; try { const pri = spawnPriority(), b = pri && pri.priority && pri.priority.by;', 1],
  ['src/server/vault-run-door.js', '…and sets it on the run\'s child the moment spawn returns (never nice in front: the door\'s own checks, argv[0], a failed exec)', 'if (by && child && child.pid) { try { lowerImpl(child.pid, by); } catch { } }', 1],
  ['src/server/vault-run-door.js', '…through the door\'s own setter: the step below the hub\'s own niceness, at most 19 (each thread /proc lists for it too)', 'const n = Math.min(19, os.getPriority() + by);', 1],
  ['src/server/vault-run-door.js', '…which is the door\'s default (a suite hands its own)', 'lowerImpl = lowerRun,', 1],
  ['src/server/mounts-plugins-wiring.js', 'the vault run door is handed the start\'s priority (the setting read per run)', "spawnPriority: () => require('./spawn-priority.js').priorityFor({ serverSetting, local: true, log: console }),", 1],
  ['src/spawn/dial.js', 'B-460d\'s remainder: a PAIRED machine\'s start (the chat\'s pipe session, the terminal\'s pty) asks the SAME verdict with ITS machine\'s nice program, from its agent\'s hello', 'SPRI.devicePriorityFor({ serverSetting, hello: await deviceHello(), machine: h })', 2],
  ['src/spawn/dial.js', '…and both specs are built with the SAME words in front (src/spawn/line.js withPriority)', "withPriority({ cmd: 'sh', args: ['-lc', shellCmd] }, devPri.priority)", 2],
  ['src/agentd/agentd.js', '…the machine\'s agent says its own nice program in its hello (the shared look the hub\'s starts use)', 'nicePath: niceProgram(),', 1],
  // B-460d's remainder, its ssh half (lane login-request-card, 主开发 r1362 (3)): an ssh-ONLY machine's fresh start asks the SAME verdict,
  // fed by its agent's hello on a link already up and taken as a CHOICE among the hub's own list (src/nice-program.js listedNicePath)
  ['src/spawn/ssh.js', 'B-460d\'s remainder: an ssh-only machine\'s start asks the SAME verdict from a link already up (memory only)', 'SPRI.sshPriorityFor({ serverSetting, hello: SPRI.linkedHello(hosts, h && h.id), machine: h })', 1],   // (B-460d follow: the machine named, so a no-answer is said once a machine)
  ['src/spawn/ssh.js', '…the terminal\'s dtach line takes the words in front of its shell (composed from the hub\'s own constants)', "-r winch ${priorityArgv(tPri.priority).map((x) => x + ' ').join('')}sh -lc", 1],
  ['src/spawn/ssh.js', '…the keeper road\'s fresh run takes them in front of the command', '[...priorityArgv(cPri && cPri.priority), rcmd, ...rargs.map(shq)]', 1],
  ['src/spawn/ssh.js', '…and the device road\'s pipe-session spec is built with the SAME builder', "withPriority({ cmd: 'sh', args: ['-lc', shellCmd] }, cPri && cPri.priority)", 1],
  // B-460d's remainder, the OpenCode serve (主开发 r1362 (2)): the serve STARTS below the hub — its terminals and its turns inherit it
  ['src/opencode-serve.js', 'B-460d\'s remainder: the OpenCode serve\'s spawn takes the caller\'s prefix in front (the hub its own verdict; the device the start the hub last handed it, r4369 — none handed ⇒ none)', 'child = spawnImpl(preArgv.length ? preArgv[0] : cmd, preArgv.length ? [...preArgv.slice(1), cmd, ...serveArgs] : serveArgs, {', 1],
  ['src/server/cli-env.js', '…the hub hands it the ONE verdict, composed by the ONE composer, read at each start', "return { argv: require('../spawn/line.js').priorityArgv(pri.priority), fact: pri.fact };", 1],
]);
export const PRIORITY_EXCEPT = Object.freeze([
  // [file, why, the line's own spelling there, count] — a SECOND line in an excepted file (a local one) is RED
  ['src/server/boot-restore.js', 'the readopt of a REMOTE conversation: its local line runs ssh only — the agent runs on the other machine (a paired machine\'s start is lowered on ITS machine instead: src/spawn/dial.js, B-460d\'s remainder)', "exe: 'ssh', args: sshArgs });", 1],
]);
/** THE PRIORITY CENSUS: (file) → its text (the mutants hand a patched one) ⇒ the reds, by name */
export function priorityJudge(read, files) {
  const red = [];
  for (const [file, what, needle, count] of PRIORITY_ROADS) {
    const n = (read(file) || '').split(needle).length - 1;
    if (n !== count) red.push(`PRIORITY ROAD ${file}: ${what} — «${needle}» ${n}× (the row says ${count}): a start there no longer takes the priority in its ONE place`);
  }
  const known = new Set([...PRIORITY_ROADS.map((r) => r[0]), ...PRIORITY_EXCEPT.map((r) => r[0])]);
  for (const f of files) {
    if (f === 'src/spawn/line.js' || known.has(f)) continue;
    if (/\bsessionSpawnLine\(/.test(read(f) || '')) red.push(`UNLISTED session line ${f}: it builds THE session line with no priority row — hand it the start's priority (src/server/spawn-priority.js) or add a PRIORITY_EXCEPT row with the reason`);
  }
  for (const [file, , needle, count] of PRIORITY_EXCEPT) {
    const t = read(file) || '', lines = (t.match(/\bsessionSpawnLine\(/g) || []).length, n = t.split(needle).length - 1;
    if (!lines) red.push(`DEAD priority exception ${file} — it builds no session line any more`);
    else if (lines !== count || n !== count) red.push(`PRIORITY EXCEPTION ${file}: ${lines} session line(s), «${needle}» ${n}× — the row excepts ${count}: a new line there takes the start's priority or a row of its own`);
  }
  return red;
}
export const KINDS = Object.freeze(['probe', 'upstream', 'default', 'self', 'debt']);
/** B-323e THE WHOLE ENV (主开发's ruling (A)): a request that hands THE STARTER (src/server/child-starter.js) its child's WHOLE env
 *  (`wholeEnv: true` + `env`) — the starter starts that one child with exactly it. Each such request is a ROW:
 *  [file, the function it is in, count, why — where its env is BUILT (a builder: serviceEnv, or an ENV_FUNCS function)].
 *  A request with no row, a row with no request (DEAD) or a count that differs ⇒ RED. */
export const WHOLE_ROWS = Object.freeze([
  ['src/routes/files.js', 'macClipboardWrite', 1, "the paste's macOS clipboard write (osascript), r1066: serviceEnv(process.env) built in the function — the service list, nothing of the hub's own (the old synchronous road handed it the hub's whole env)"],
  ['src/routes/files.js', 'poll', 1, "the paste's clipboard reads (xclip -t TARGETS -o), r1066: clipEnv — serviceEnv + the display and its cookie (the probed one, else the inherited one), built in attempt() exactly as the clipboard's owning xclip gets it"],
  ['src/job-logs-sweep.js', 'handOver', 1, "B-323e (lane bl-jobs): the job-logs remover's child, ONE batch a child through the starter (the hub's fork with an IPC channel gone) — its env BUILT whole of PATH alone, the env that fork gave it since round 2: never the service env, never the hub's secrets"],
  ['src/mounts.js', '_mountInner', 1, "the mount daemon's own start (B-323e, 主开发 r1299): DETACHED by the starter — its env from _rcloneFor = rcloneEnv = serviceEnv + the egress door + the provider's RCLONE_CONFIG_VS_* (ENV_FUNCS above), the child's alone (never logged, never kept by the starter, never a later child's)"],
  ['src/server/cli-cmd.js', 'runShell', 1, "B-323e's remainder (lane bl-chat-b, 主开发 r2689 (a)): the person's LOGIN SHELL asked where an agent CLI is, through the starter's SESSION option — its env BUILT here through serviceEnv (the allowlist: HOME LANG LC_* TMPDIR XDG_RUNTIME_DIR + USER / LOGNAME, the hub's PATH as the rc's baseline) with SHELL = itself, TERM=dumb, VIBESPACE_SHELL_PROBE=1: never a VIBESPACE_* name, a token or npm_* (a person's rc runs arbitrary code)"],
  ['src/agy-discover.js', 'runViaStarter', 1, "B-323e's remainder (lane bl-chat-b, 主开发 r2681): the agy index child through the starter the hub hands (src/routes/sessions.js) — its env BUILT whole of PATH and LANG (C.UTF-8) alone, exactly the env runIndexChild hands on the device road: nothing of the hub's, no login, no token (it reads only the roots it is handed)"],
  ['src/server/marked-walk.js', 'walkMarked', 1, "B-d8f4 (9), 主开发 r1745 (lane bl-jobs): the walk for what carries a job's mark, ONE child through the starter (never the hub's thread, never the file threadpool) — its env BUILT whole of PATH alone: never the service env, never the hub's secrets"],
  ['src/mounts.js', '_rcloneProbeRun', 1, "the mount sweep's rclone probes (the backend access probe, the OAuth read probe) and a connect's (the root-denied probe, the s3 signing probe — B-323e): their env from _rcloneFor = rcloneEnv = serviceEnv + the egress door + the provider's RCLONE_CONFIG_VS_* (ENV_FUNCS above); the hub's own secret prefixes refused by the starter"],
]);

/** judge(scan) → { red: [sentences], table: [{ site, class }] } */
export function judge({ sites, copies, errors, roads = [], defs = [], files = [], wholes = [] }, { rows = ROWS, copyRows = COPIES, fixed = FIXED, sshRows = SSH_ROWS, derived = DERIVED, envFuncs = ENV_FUNCS, wholeRows = WHOLE_ROWS } = {}) {
  const red = [];
  // B-323e THE WHOLE ENV: every whole env handed to the starter is a row
  for (const w of wholes) if (!wholeRows.some(([file, fn]) => file === w.file && fn === w.fn)) red.push(`WHOLE ENV UNLISTED ${w.file}:${w.line} (${w.fn}) hands the starter a whole env — build it through serviceEnv (or an ENV_FUNCS function) and add a WHOLE_ROWS row naming where`);
  for (const [file, fn, count] of wholeRows) {
    if (!files.includes(file)) continue;
    const n = wholes.filter((w) => w.file === file && w.fn === fn).length;
    if (!n) red.push(`WHOLE ENV DEAD row ${file} ${fn} — no whole env handed there any more`);
    else if (n !== count) red.push(`WHOLE ENV ${file} ${fn}: ${n} request(s), the row says ${count}`);
  }
  for (const f of errors) red.push(`${f} did not parse — the census cannot see its children`);
  const groups = new Map();
  for (const s of sites.filter((x) => x.k === 'raw')) { const key = s.file + '\0' + s.cmd; const g = groups.get(key) || { file: s.file, cmd: s.cmd, lines: [], why: s.why }; g.lines.push(s.line); groups.set(key, g); }
  const seen = new Set();
  for (const [file, cmd, kind, count, why] of rows) {
    const key = file + '\0' + cmd;
    if (seen.has(key)) red.push(`two rows for ${file} ${cmd}`); seen.add(key);
    if (!KINDS.includes(kind)) red.push(`${file} ${cmd}: kind '${kind}' is none of ${KINDS.join(' / ')}`);
    if (kind === 'debt' && !/next:/.test(why)) red.push(`${file} ${cmd}: a debt row names its next step (\`next:\`)`);
    const g = groups.get(key);
    if (!g) red.push(`DEAD row ${file} ${cmd} — no raw site left there (its env is built now? delete the row)`);
    else if (g.lines.length !== count) red.push(`${file} ${cmd}: ${g.lines.length} raw site(s) (lines ${g.lines.join(', ')}), the row says ${count}`);
  }
  for (const [key, g] of groups) if (!seen.has(key)) red.push(`UNLISTED raw site ${g.file}:${g.lines.join(',')} ${g.cmd} — ${g.why}: build its env (serviceEnv / agentEnv / daemonEnv) or add a row with the reason`);
  const loose = copies.filter((c) => !c.site);
  const used = new Map();
  for (const c of loose) {
    const r = copyRows.find(([file, needle]) => file === c.file && c.text.includes(needle.replace(/\s+/g, ' ')));
    if (!r) red.push(`UNLISTED copy of process.env ${c.file}:${c.line} — ${c.text.slice(0, 90)}: build the env (serviceEnv / agentEnv) or add a COPY row`);
    else used.set(r, (used.get(r) || 0) + 1);
  }
  for (const r of copyRows) { const n = used.get(r) || 0; if (!n) red.push(`DEAD copy row ${r[0]} «${r[1]}»`); else if (n !== r[3]) red.push(`copy row ${r[0]} «${r[1]}»: ${n} copies, the row says ${r[3]}`); if (!KINDS.includes(r[2])) red.push(`copy row ${r[0]}: kind '${r[2]}'`); }
  for (const x of sites) for (const w of x.argv || []) if (SECRET_ON_ARGV.test(w.name)) red.push(`SECRET ON ARGV ${x.file}:${w.line} ${w.name}=… (${x.call} ${x.cmd}) — /proc/<pid>/cmdline is world-readable for the child's life: the value rides the spawn's env (src/spawn/line.js) or a file`);
  const cls = (x) => `${x.k}${x.by ? ' ' + x.by : ''}${x.why ? ' — ' + x.why : ''}`;
  for (const [file, cmd, what, { by = 'serviceEnv', count = 1 } = {}] of fixed) {
    const s = sites.filter((x) => x.file === file && x.cmd === cmd);
    if (s.length !== count || s.some((x) => x.k !== 'builder' || x.by !== by)) red.push(`FIXED ${what} (${file} ${cmd}) is no longer spawned with ${by}${count > 1 ? ` ×${count}` : ''}: ${s.map(cls).join('; ') || 'the site is gone'}`);
  }
  // THE SSH ROADS: on hosts.sshEnv(), or a row says why not
  const usedSsh = new Set();
  for (const r of roads) {
    const row = sshRows.find(([file, cmd]) => file === r.file && cmd === r.cmd);
    if (row) { usedSsh.add(row); if (row[2] !== 'upstream' && !(r.k === 'builder' && r.by === row[2])) red.push(`SSH ROAD ${r.file}:${r.line} ${r.cmd}: its row says ${row[2]}, the env is ${cls(r)}`); continue; }
    if (!(r.k === 'builder' && r.by === 'sshEnv')) red.push(`SSH ROAD ${r.file}:${r.line} ${r.cmd} is not on hosts.sshEnv() (${cls(r)}) — a multiplexed call forks the ControlMaster, which keeps ITS env for ControlPersist (600 s) while every later call rides it: hand env: <hosts>.sshEnv()`);
  }
  for (const row of sshRows) if (!usedSsh.has(row) && files.includes(row[0])) red.push(`DEAD ssh row ${row[0]} ${row[1]}`);
  // DERIVED builders: one home, built over their base
  for (const [name, home, base, what] of derived) {
    for (const d of defs.filter((x) => x.name === name && x.file !== home)) red.push(`${d.file}:${d.line} defines ${name}() — the derived builder (${what}) lives in ${home} alone: a second definition would pass as a builder by its name`);
    if (!files.includes(home)) continue;
    const h = defs.filter((x) => x.name === name && x.file === home);
    if (h.length !== 1 || h[0].ret.k !== 'builder' || h[0].ret.by !== base) red.push(`DERIVED ${name}() (${home}) is not built over ${base}: ${h.map((x) => cls(x.ret)).join('; ') || 'no definition'}`);
  }
  // ENV FUNCTIONS: the env one function builds for the spawns of others
  for (const [file, fn, v, by, what] of envFuncs) {
    if (!files.includes(file)) continue;
    const h = defs.filter((x) => x.file === file && x.name === fn);
    const e = h.length === 1 ? h[0].vars[v] : null;
    if (!e || e.k !== 'builder' || e.by !== by) red.push(`ENV FUNCTION ${file} ${fn}() — ${what}: its \`${v}\` is not built by ${by} (${e ? cls(e) : h.length ? `no \`${v}\`` : 'no definition'})`);
  }
  const rowOf = (s) => rows.find(([file, cmd]) => file === s.file && cmd === s.cmd);
  const table = sites.map((s) => ({ site: `${s.file}:${s.line}`, call: s.call, cmd: s.cmd, class: s.k === 'raw' ? `raw → ${(rowOf(s) || [, , 'UNLISTED'])[2]}` : s.k === 'builder' ? s.by : s.k === 'literal' ? 'literal (built)' : `named: ${s.by}` }));
  const roadTable = roads.map((r) => ({ site: `${r.file}:${r.line}`, cmd: r.cmd, class: r.k === 'builder' ? r.by : r.k === 'raw' ? 'raw' : `named: ${r.by}` }));
  return { red, table, roads: roadTable };
}
