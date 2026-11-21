// THE HUB-HOME CENSUS (B-ba47 pick B, lane cli-update-needs-nothing, 2026-11-14) — test-architecture §113 runs it.
// NOT a test-*.mjs on purpose (the tier census would demand a tier), like mount-reader-census.mjs.
//
// scripts/scratch.mjs re-homes a suite or a debug script at import (src/home-verdict.js); a hub the suite starts gets
// that temp home only if the boot site's env CARRIES it. So every hub boot site under scripts/ — a node spawn / fork
// of server.js — is CLASSED by how its env is built, from the source text alone:
//   · 'inherits'      no env option: the child gets the process's env
//   · 'process'       the env spreads process.env (or a copy of it) and sets no HOME of its own
//   · 'process-home'  HOME: process.env.HOME / os.homedir()
//   · 'scratch-home'  HOME from a scratch source: scratchHome() / scratch() / scratchDir() / os.tmpdir() / mkdtemp, a
//                     path joined under one, a `${x}-home` beside one — every definition of the name it is read from
//   · 'no-home'       an env that neither carries the process's nor names a HOME — the hub falls back to the passwd
//                     home, the person's: RED
//   · 'unresolved'    anything the reader cannot follow: RED
// The first four are where a hub's HOME comes from the re-homed process or a scratch tree by construction; the last two
// are red unless the site is a named row (SITE_ROWS) with its reason. And every file that boots a hub is RE-HOMED — it
// imports ./scratch.mjs, or a scripts/ module that does — or is a named row (FILE_ROWS).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { builtinModules } from 'node:module';

// ── THE ONE READER OF «A server.js SPAWN» (moved here from test-architecture §57, 2026-11-14, so §57 and §113 read the
// same sites): SPAWN, walk and dataRanges as §57 wrote them; a range now carries its kind as a third element
// ('comment' · 'string' · 'regex' · 'template') — §57 reads the first two.
export const SPAWN = /\b(?:spawn|fork)\(\s*(?:(?:process\.execPath|'node'|"node")\s*,\s*\[[^\]]*?|[A-Za-z_$][\w$.]*\s*,\s*\[[^\]]*?(?:process\.execPath|'node'|"node")\s*,[^\]]*?)(?:['"`]server\.js['"`]|path\.join\([^)]*?['"`]server\.js['"`]\s*\))\s*\]/g;
// walk(t, i, false) = the balanced text from the opening bracket at `i`; walk(t, i, true) = from `i` to the end of its statement (strings skipped)
export const walk = (t, i, stopAtStatementEnd) => {
  let d = 0, q = null;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('{(['.includes(c)) d++;
    else if ('})]'.includes(c)) { if (stopAtStatementEnd && d === 0) return t.slice(i, j); d--; if (!stopAtStatementEnd && d === 0) return t.slice(i, j + 1); }
    else if (stopAtStatementEnd && d === 0 && (c === ';' || c === '\n')) return t.slice(i, j);
  }
  return t.slice(i);
};
// offsets inside a string literal, a template's text, a regex literal or a comment: a spawn SPELLED there is data (a
// control or a pin), never a spawn. Templates nest through `${ … }` (a brace-depth stack); a regex literal is told
// from a division by the token before it (a regex carrying a backtick desynced the first cut for 90 lines).
export const dataRanges = (t) => {
  const out = [], tpl = []; let depth = 0;
  const chunk = (j) => { // template text from the ` or } at j to the next ` or ${
    let k = j + 1;
    while (k < t.length && t[k] !== '`' && !(t[k] === '$' && t[k + 1] === '{')) k += t[k] === '\\' ? 2 : 1;
    out.push([j, k + 1, 'template']);
    if (t[k] === '$') { tpl.push(depth); depth++; return k + 1; }
    return k;
  };
  for (let j = 0; j < t.length; j++) {
    const c = t[j], n = t[j + 1];
    if (c === '/' && (n === '/' || n === '*')) { const e = n === '/' ? t.indexOf('\n', j) : t.indexOf('*/', j + 2); const end = e < 0 ? t.length : e + (n === '/' ? 0 : 2); out.push([j, end, 'comment']); j = end - 1; continue; }
    if (c === '"' || c === "'") { let k = j + 1; while (k < t.length && t[k] !== c && t[k] !== '\n') k += t[k] === '\\' ? 2 : 1; out.push([j, k + 1, 'string']); j = k; continue; }
    if (c === '/' && /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof)\s*$/.test(t.slice(Math.max(0, j - 12), j))) {
      let k = j + 1, cls = false;
      while (k < t.length && t[k] !== '\n' && (cls || t[k] !== '/')) { if (t[k] === '\\') k++; else if (t[k] === '[') cls = true; else if (t[k] === ']') cls = false; k++; }
      out.push([j, k + 1, 'regex']); j = k; continue;
    }
    if (c === '`') { j = chunk(j); continue; }
    if (c === '}' && tpl.length && depth - 1 === tpl[tpl.length - 1]) { depth--; tpl.pop(); j = chunk(j); continue; }
    if (c === '{') depth++; else if (c === '}') depth--;
  }
  return out;
};

/** the text with every comment and regex literal blanked (same length, newlines kept) — strings and templates stay, so a
 *  'server.js' argument is still read; the string ranges are returned too: a call spelled INSIDE one is data, not a boot */
function codeOf(t) {
  const ranges = dataRanges(t);
  const a = t.split('');
  for (const [x, y, kind] of ranges) if (kind === 'comment' || kind === 'regex') for (let i = x; i < y && i < a.length; i++) if (a[i] !== '\n') a[i] = ' ';
  return { code: a.join(''), strs: ranges.filter((r) => r[2] === 'string' || r[2] === 'template') };
}
const strip = (t) => codeOf(t).code;
/** index after the bracket matching s[i] (one of ( [ {), skipping strings; -1 if unbalanced */
export function close(s, i) {
  const open = s[i], shut = { '(': ')', '[': ']', '{': '}' }[open];
  let d = 0, q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { d--; if (!d) return c === shut ? j + 1 : -1; }
  }
  return -1;
}
/** top-level comma split of a bracket body */
function splitTop(body) {
  const out = []; let d = 0, q = null, at = 0;
  for (let j = 0; j < body.length; j++) {
    const c = body[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (c === ',' && d === 0) { out.push(body.slice(at, j)); at = j + 1; }
  }
  out.push(body.slice(at));
  return out.map((x) => x.trim()).filter(Boolean);
}
const NODE_PROG = /^(?:process\.execPath|'node'|"node"|NODE|NODE_BIN|nodeBin|node)$/;
const NODE_IN_ARGV = /(?:^|[\[,]\s*)(?:process\.execPath|'node'|"node")\s*,/;
/** Every hub boot site in a source text: [{ at, line, call, opts }] — a node spawn of server.js (its argv names it, inline,
 *  through a const, joined or as a mutant copy), the same through a LAUNCHER (`spawn(DBUS, ['--', process.execPath,
 *  'server.js'])`, prlimit), or a fork of it. A `--check` / `-e` / `-p` run is no boot; a call spelled inside a string
 *  literal or a template's text is data (a control's fixture), never a boot — dataRanges decides, as for §57. */
export function bootSites(src) {
  const { code: s, strs } = codeOf(src);
  const inStr = (i) => strs.some(([x, y]) => i >= x && i < y);
  const consts = new Set([...s.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:path\.(?:join|resolve)\([^;\n()]*['"`]server\.js['"`]\s*\)|['"`][^'"`\n]*server\.js['"`])\s*[;,\n]/g)].map((m) => m[1]));   // a const that IS a server.js path
  const names = (t) => /server\.js['"`]/.test(t) || [...consts].some((c) => new RegExp(`(^|[^\\w$.])${c.replace(/\$/g, '\\$')}\\b`).test(t));
  const out = [];
  for (const m of s.matchAll(/\b(spawn|spawnSync|fork|execFile|execFileSync)\s*\(/g)) {
    if (inStr(m.index)) continue;
    const open = m.index + m[0].length - 1, end = close(s, open);
    if (end < 0) continue;
    const args = splitTop(s.slice(open + 1, end - 1));
    let script, opts;
    if (m[1] === 'fork') { script = args[0] || ''; opts = [args[1], args[2]].find((x) => x && x.startsWith('{')) || (args[1] && !args[1].startsWith('[') ? args[1] : args[2]); }
    else if (NODE_PROG.test(args[0] || '')) { script = args[1] || ''; opts = args[2]; }
    else if (args[1] && args[1].startsWith('[') && NODE_IN_ARGV.test(args[1])) { script = args[1]; opts = args[2]; }   // a launcher
    else continue;
    if (!names(script) || /'(?:--check|-e|-p|--eval|--print)'/.test(script)) continue;
    out.push({ at: m.index, line: s.slice(0, m.index).split('\n').length, call: s.slice(m.index, end).replace(/\s+/g, ' ').slice(0, 160), opts: opts || null });
  }
  return out;
}
const HOME_FROM_PROCESS = /^(?:process\.env\.HOME|process\.env\[['"]HOME['"]\]|os\.homedir\(\))$/;
const SCRATCH_CALL = /^(?:await\s+)?(?:scratchHome|scratch|scratchDir|endScratchAtExit)\s*\(|^os\.tmpdir\(\)$|^fs\.mkdtempSync\s*\(\s*path\.join\(\s*os\.tmpdir\(\)|^fs\.mkdtempSync\s*\(\s*['"`]\/tmp\/|^['"`]\/tmp\//;
const ENV_PASS = /^(?:withoutVendorKeys|gitEnvFrom|cleanEnv|envWithout|stripEnv)\s*\(/;   // f(env) ⇒ a copy of env, keys removed
const NO_HOME_ENV = /^(?:\(?\s*await\s+vncEnv\(\)\s*\)?|vncEnv\(\)|VNC_ENV|runnerFontEnv\(\)|FONT_ENV|NO_BUS|busless|envNoBus)$/;
const IDENT = /^[A-Za-z_$][\w$]*$/;
/** every right-hand side the name is given in the text — const/let/var x = …, x = …, `const { …, ...x } = process.env` —
 *  as [{ at, rhs }]; a destructured default is not followed */
function defsAll(s, name) {
  const out = [], n = name.replace(/\$/g, '\\$');
  for (const m of s.matchAll(new RegExp(`\\{[^{}]*\\.\\.\\.\\s*${n}\\s*\\}\\s*=\\s*process\\.env\\b`, 'g'))) out.push({ at: m.index, rhs: 'process.env' });
  const re = new RegExp(`(?:^|[^\\w$.])(?:(?:const|let|var)\\s+)?${n}\\s*=(?![=>])\\s*`, 'g');
  for (const m of s.matchAll(re)) {
    let j = m.index + m[0].length, d = 0, q = null;
    for (; j < s.length; j++) { const c = s[j]; if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; } if (c === "'" || c === '"' || c === '`') { q = c; continue; } if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) { if (!d) break; d--; } else if ((c === ';' || c === '\n' || c === ',') && d === 0) break; }
    const rhs = s.slice(m.index + m[0].length, j).trim();
    if (rhs) out.push({ at: m.index, rhs });
  }
  return out.sort((a, b) => a.at - b.at);
}
/** the definition that reaches position `at`: the nearest one before it (lexical scope, approximately), else the first */
function defOf(s, name, at, skip = /^(?:null|undefined)$/) {
  const ds = defsAll(s, name).filter((d) => !skip.test(d.rhs));
  if (!ds.length) return null;
  const before = ds.filter((d) => d.at < at);
  return before.length ? before[before.length - 1] : ds[0];
}
const RANK = ['inherits', 'process', 'process-home', 'scratch-home', 'no-home', 'unresolved'];
const worst = (cs) => cs.reduce((a, c) => (RANK.indexOf(c) > RANK.indexOf(a) ? c : a), cs[0] || 'unresolved');
/** the class of a HOME value expression read at position `at` */
function homeOf(s, v, at, depth = 0) {
  v = v.trim();
  while (/^\(.*\)$/.test(v) && close(v, 0) === v.length) v = v.slice(1, -1).trim();
  if (depth > 16) return 'unresolved';
  if (HOME_FROM_PROCESS.test(v)) return 'process-home';
  if (SCRATCH_CALL.test(v)) return 'scratch-home';
  let m;
  if ((m = /^path\.(?:join|resolve)\(\s*([^,()]+(?:\([^()]*\))?)/.exec(v))) return homeOf(s, m[1], at, depth + 1);
  if ((m = /^`\$\{\s*([^}]+?)\s*\}[^`$]*`$/.exec(v))) return homeOf(s, m[1], at, depth + 1);
  if ((m = /^([A-Za-z_$][\w$.]*)\s*\+\s*['"][^'"]*['"]$/.exec(v))) return homeOf(s, m[1], at, depth + 1);
  if ((m = /^([A-Za-z_$][\w$]*)\.HOME$/.exec(v))) { const c = envClass(s, m[1], at, depth + 1); return c === 'process' || c === 'inherits' ? 'process-home' : c === 'process-home' || c === 'scratch-home' ? c : 'unresolved'; }
  if (IDENT.test(v)) { const d = defOf(s, v, at, /^(?:null|undefined|''|"")$/); return d ? homeOf(s, d.rhs, d.at, depth + 1) : 'unresolved'; }
  return 'unresolved';
}
/** a top-level conditional `c ? a : b` → [c, a, b] (never `?.` or `??`; a nested one inside a branch is that branch's), else null */
function ternaryOf(e) {
  let d = 0, q = null, qi = -1, nest = 0;
  for (let j = 0; j < e.length; j++) {
    const c = e[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--;
    else if (d === 0 && c === '?' && e[j + 1] !== '.' && e[j + 1] !== '?' && e[j - 1] !== '?') { if (qi < 0) qi = j; else nest++; }
    else if (d === 0 && c === ':' && qi >= 0) { if (nest) nest--; else return [e.slice(0, qi).trim(), e.slice(qi + 1, j).trim(), e.slice(j + 1).trim()]; }
  }
  return null;
}
/** the class of an env expression (an object literal, a name, a pass-through call) read at position `at` */
export function envClass(s, e, at = Infinity, depth = 0) {
  if (e == null) return 'inherits';
  e = e.trim().replace(/^await\s+/, '');
  while (/^\(.*\)$/.test(e) && close(e, 0) === e.length) e = e.slice(1, -1).trim().replace(/^await\s+/, '');
  if (depth > 16) return 'unresolved';
  if (e === 'process.env') return 'process';
  if (NO_HOME_ENV.test(e)) return 'no-home';
  if (ENV_PASS.test(e)) { const i = e.indexOf('('); const inner = e.slice(i + 1, close(e, i) - 1).trim(); return inner ? envClass(s, inner, at, depth + 1) : 'process'; }
  if (/^Object\.fromEntries\(\s*Object\.entries\(\s*process\.env\s*\)/.test(e) || /^Object\.assign\(\s*\{\s*\}\s*,\s*process\.env\b/.test(e)) return /['"]HOME['"]/.test(e) ? 'unresolved' : 'process';
  if (IDENT.test(e)) {
    const d = defOf(s, e, at);
    if (!d) return 'unresolved';
    if (d.rhs === '{}') {   // a filtered COPY of the process's env: `const x = {}; for (const [k, v] of Object.entries(process.env)) if (…) x[k] = v;`
      const n = e.replace(/\$/g, '\\$');
      const copy = new RegExp(`for\\s*\\(\\s*const\\s*\\[\\s*(\\w+)\\s*,\\s*(\\w+)\\s*\\]\\s*of\\s*Object\\.entries\\(\\s*process\\.env\\s*\\)\\s*\\)[^\\n;]*?\\b${n}\\[\\s*\\1\\s*\\]\\s*=\\s*\\2`, 'y');
      copy.lastIndex = s.indexOf('{}', d.at) + 2;
      const rest = s.slice(copy.lastIndex).match(/^\s*;?\s*/)[0].length;
      copy.lastIndex += rest;
      const c = copy.exec(s);
      return c && !/['"]HOME['"]/.test(c[0]) ? 'process' : 'no-home';
    }
    return envClass(s, d.rhs, d.at, depth + 1);
  }
  // a LOCAL env builder called at the site: `const f = (extra = {}) => ({ … })` — the object it returns; a spread of one
  // of its own parameters adds keys the caller wrote in this same file and is read as adding no HOME
  { const m = /^([A-Za-z_$][\w$]*)\s*\(/.exec(e);
    if (m) {
      const d = defOf(s, m[1], at);
      if (d && /^(?:async\s*)?\(([^()]*)\)\s*=>\s*\(\s*\{/.test(d.rhs)) {
        const params = /^(?:async\s*)?\(([^()]*)\)/.exec(d.rhs)[1].split(',').map((x) => x.split('=')[0].trim()).filter(Boolean);
        const i = d.rhs.indexOf('({'), body = d.rhs.slice(i + 1, close(d.rhs, i + 1));
        const own = splitTop(body.slice(1, -1)).filter((part) => !params.some((p) => part === '...' + p)).join(', ');
        return envClass(s, `{ ${own} }`, d.at, depth + 1);
      }
    }
  }
  // a CONDITIONAL env (`c ? A : B` — the root's piped start word, B-ba47 on 0cc12963d): each branch is read; a branch adding
  // no HOME yields the other, else the worse of the two
  { const t = ternaryOf(e);
    if (t) { const a = envClass(s, t[1], at, depth + 1), b = envClass(s, t[2], at, depth + 1); return a === 'no-home' ? b : b === 'no-home' ? a : worst([a, b]); } }
  if (e.startsWith('{') && close(e, 0) === e.length) {
    let cls = 'no-home';
    for (const part of splitTop(e.slice(1, -1))) {
      if (part.startsWith('...')) { const c = envClass(s, part.slice(3), at, depth + 1); if (c !== 'no-home') cls = c === 'inherits' ? 'process' : c; continue; }
      const m = /^(?:HOME|'HOME'|"HOME")\s*(?::\s*([\s\S]+))?$/.exec(part);
      if (m) cls = homeOf(s, m[1] || 'HOME', at, depth + 1);
    }
    return cls;
  }
  return 'unresolved';
}
/** the env expression of a site's options: { env: X } / { env } / { ...o, env } ; null = no env option (inherits) */
export function envOfOpts(s, opts, at = Infinity, depth = 0) {
  if (opts == null) return { env: null };
  const o = opts.trim();
  if (IDENT.test(o)) { const d = defOf(s, o, at); return d && depth < 3 ? envOfOpts(s, d.rhs, d.at, depth + 1) : { env: '?' + o }; }
  if (!o.startsWith('{')) return { env: '?' + o.slice(0, 40) };
  for (const part of splitTop(o.slice(1, close(o, 0) - 1))) {
    const m = /^env\s*(?::\s*([\s\S]+))?$/.exec(part);
    if (m) return { env: m[1] ? m[1].trim() : 'env' };
  }
  return { env: null };
}
export const OK_CLASSES = Object.freeze(['inherits', 'process', 'process-home', 'scratch-home']);
/** Class every boot site of one source text: [{ line, cls, env }] */
export function classify(src) {
  const s = strip(src);
  return bootSites(src).map((b) => {
    const { env } = envOfOpts(s, b.opts, b.at);
    const cls = env && env.startsWith('?') ? 'unresolved' : envClass(s, env, b.at);
    const full = env == null ? '(none)' : env.replace(/\s+/g, ' ');
    return { line: b.line, cls, env: full.slice(0, 90), envText: full };
  });
}
/** Does the text import ./scratch.mjs, or a scripts/ module that does (one hop — the boot modules)? */
/** The relative modules a text imports IN CODE (a specifier spelled in a string, a template or a comment is no import). */
export function importsOf(src) {
  const { code, strs } = codeOf(src);
  return [...code.matchAll(/\b(?:from|import)\s*\(?\s*'\.\/([\w.-]+\.mjs)'/g)].filter((m) => !strs.some(([x, y]) => m.index >= x && m.index < y)).map((m) => m[1]);
}
export function rehomed(src, readModule) {
  const mods = importsOf(src);
  if (mods.includes('scratch.mjs')) return 'direct';
  for (const m of mods.filter((x) => !/^test-/.test(x))) {
    const t = readModule(m);
    if (t && importsOf(t).includes('scratch.mjs')) return 'via ' + m;
  }
  return null;
}
/** The census over a scripts/ dir: every file that boots a hub, its re-home and its sites. */
export function census(dir) {
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  return fs.readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort().flatMap((f) => {
    const src = read(f), sites = classify(src);
    return sites.length ? [{ file: f, rehome: rehomed(src, read), sites }] : [];
  });
}

/** THE NAMED SITES: a boot site whose env the reader cannot follow to the process or a scratch source, each with the
 *  reason its hub's HOME is a scratch one. Matched on the site's env text; a row that matches no red site is STALE (red). */
export const SITE_ROWS = Object.freeze([
  { file: 'test-feed-miss-ui.mjs', env: /HOME: t\.home\b/, why: "boot(t, port): t is setup()'s { wt, home }, home = scratchHome(`feed-miss-${tag}-home`)" },
  { file: 'test-https-hub-chrome.mjs', env: /HOME: fakeHome, .*\.\.\.env \}$/, why: "boot(tag, env, dataDir): HOME = scratchHome('https-hub-home'); the caller's env spread after it carries TLS / tailscale keys alone (no call in the file names a HOME)" },
  { file: 'test-roster-reset-eta.mjs', env: /^srvEnv$/, why: "srvEnv = { ...VNC_ENV, ...envFor(shape) }: envFor's block returns { ...process.env, HOME: home = scratchHome('roster-eta-home'), PATH without a CLI dir, SHELL = the shape's login shell } minus the CLI keys" },
  { file: 'xpra-window-boot.mjs', env: /HOME: env\.HOME \|\| fakeHome/, why: "spawnCopy(name, cwd, env): the copy's env HOME — its callers hand srvEnv and the control envs, built on fakeHome = scratchHome('deskxpra-home') — else fakeHome itself" },
]);
/** THE NAMED FILES: a file that boots a hub and is not re-homed, with its reason. None. */
export const FILE_ROWS = Object.freeze([]);
/** The whole verdict over a scripts/ dir: { files, red: [lines], stale: [rows], modules, viaModules } */
export function judge(dir) {
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const files = census(dir), red = [], used = new Set();
  for (const f of files) {
    if (!f.rehome && !FILE_ROWS.some((r) => r.file === f.file)) red.push(`${f.file}: boots a hub and is NOT re-homed — no ./scratch.mjs import, direct or through a boot module, and no FILE_ROWS row`);
    for (const x of f.sites) {
      if (OK_CLASSES.includes(x.cls)) continue;
      const row = SITE_ROWS.find((r) => r.file === f.file && r.env.test(x.envText));
      if (row) { used.add(row); continue; }
      red.push(`${f.file}:${x.line} ${x.cls} — its env (${x.env}) hands the hub a HOME that comes neither from the re-homed process nor from a scratch source`);
    }
  }
  const modules = files.filter((f) => !/^(?:test|dbg)-/.test(f.file)).map((f) => f.file);
  const viaModules = fs.readdirSync(dir).filter((f) => /^(?:test|dbg)-.*\.mjs$/.test(f) && !files.some((x) => x.file === f)).filter((f) => importsOf(read(f)).some((m) => modules.includes(m)))
    .map((f) => ({ file: f, rehome: rehomed(read(f), read) }));
  for (const v of viaModules) if (!v.rehome) red.push(`${v.file}: boots through a boot module and is NOT re-homed`);
  return { files, red, stale: SITE_ROWS.filter((r) => !used.has(r)), modules, viaModules };
}

// ── THE ORDER (主开发 2026-11-14 14:15Z): the re-home happens when scratch.mjs is EVALUATED — so nothing of a suite's own
// code may run before it. ESM evaluates imports in source order; a module imported before scratch.mjs runs its top level
// on the HANDED home. Builtins are node's own and stand anywhere; the suite's FIRST other import is ./scratch.mjs, or a
// scripts/ module whose own first other import is (recursively).
const BUILTIN = new Set(builtinModules);
/** the static import specifiers of a text, in order, code only, builtins left out — `import … from`, a bare `import '…'`
 *  and `export … from`, wherever a statement starts (a second one on a line too: 主开发 17:06Z, BOUNDARY-8) */
export function staticImports(src) {
  const { code, strs } = codeOf(src);
  return [...code.matchAll(/(?:^|[;\n])[ \t]*(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+)['"]([^'"]+)['"]/g)]
    .filter((m) => !strs.some(([x, y]) => m.index >= x && m.index < y))
    .map((m) => m[1]).filter((s) => !s.startsWith('node:') && !BUILTIN.has(s));
}
/** Does the text import ./scratch.mjs DYNAMICALLY (`import('./scratch.mjs')`, a path joined to scripts/scratch.mjs, a URL)? */
export function dynamicScratch(src) {
  const { code } = codeOf(src);
  return /\bimport\(\s*(?:['"`]\.\/scratch\.mjs['"`]|[^)]*['"`](?:scripts\/)?scratch\.mjs['"`])/.test(code) || /new URL\(\s*['"]\.\/scratch\.mjs['"]/.test(code);
}
/** THE FIRST IMPORT (主开发 18:25Z item 3, stated the other way round: the census says what it IS, and everything else is
 *  late however it is written). ESM evaluates every import of a module before ANY other statement of it, so the first
 *  thing a file loads is its first import-shaped statement — whatever its spelling. Scanning the code (comments, strings,
 *  templates and regex literals blanked; a shebang dropped) for the keywords: `import` (not `import(`, not `import.meta`,
 *  not a property) and `export` (a re-export: not `export const / let / var / function / class / async / default`):
 *  builtin imports in the strict grammar `import <a | * as a | { … } | a, { … }> from '<node:x | a builtin>'` (or a bare
 *  `import '<builtin>'`) are passed; the next import-shaped statement must BE, in that same strict grammar, a static import
 *  of a LOCAL module — `import './x.mjs'` or `import <bindings> from './x.mjs'` → './x.mjs'; anything else (an export-from,
 *  a glued spelling, a bare specifier) → null. A plain statement before it (`const require = createRequire(…)`) runs after
 *  every import and is passed over. */
const BINDINGS = String.raw`(?:[A-Za-z_$][\w$]*|\*\s+as\s+[A-Za-z_$][\w$]*|\{[^{}]*\}|[A-Za-z_$][\w$]*\s*,\s*(?:\{[^{}]*\}|\*\s+as\s+[A-Za-z_$][\w$]*))`;
const BUILTIN_STMT = new RegExp(String.raw`^import\s+(?:${BINDINGS}\s+from\s+)?(['"])([\w:/]+)\1`);
const LOCAL_STMT = new RegExp(String.raw`^import\s+(?:${BINDINGS}\s+from\s+)?(['"])(\.\/[\w.-]+\.mjs)\1`);
const NOT_REEXPORT = /^export\s+(?:const|let|var|function|class|async|default)\b/;
export function firstStatement(src) {
  const raw = String(src).replace(/^#![^\n]*/, (m) => ' '.repeat(m.length));
  const { code, strs } = codeOf(raw);
  const blank = code.split(''); for (const [x, y] of strs) for (let i = x + 1; i < y - 1 && i < blank.length; i++) if (blank[i] !== '\n') blank[i] = ' ';
  const kw = blank.join('');
  for (const m of kw.matchAll(/(?<![\w$.])(import|export)\b/g)) {
    const at = code.slice(m.index);
    if (m[1] === 'import' && /^import\s*(?:\(|\.)/.test(at)) continue;   // a dynamic import, import.meta: not a declaration
    if (m[1] === 'export' && NOT_REEXPORT.test(at)) continue;           // a declaration exported in place: a plain statement
    const b = BUILTIN_STMT.exec(at);
    if (b && (b[2].startsWith('node:') || BUILTIN.has(b[2]))) continue;
    const l = LOCAL_STMT.exec(at);
    return l ? l[2] : null;
  }
  return null;
}
/** Is ./scratch.mjs the first thing this text loads — its FIRST IMPORT, or the first import of the local module that
 *  is (up to four hops)? A DYNAMIC import is never first: it re-homes in the middle of the run. */
export function rehomesFirst(src, readModule, depth = 0) {
  const first = firstStatement(src);
  if (!first) return false;
  if (first === './scratch.mjs') return true;
  if (depth < 4) return rehomesFirst(readModule(first.slice(2)), readModule, depth + 1);
  return false;
}
/** The scripts/ modules a text loads AT RUN TIME, code only — `import(…)` or `require(…)` whose argument names `<x>.mjs`
 *  ('./x.mjs', a path joined to scripts/x.mjs, a URL), in order, de-duplicated. B-ba47 B2 (the second hosted run, 主开发
 *  2026-11-15 11:17Z): a dynamic import of a module that loads scratch.mjs re-homes the process IN THE MIDDLE of its run — 22
 *  suites through `import('./mutant-copy.mjs')`, unseen by this census (it followed a dynamic import of scratch.mjs itself
 *  only): test-agentd-remote planted four names before it (the rebuild dropped them), and its npm wrote the handed home's
 *  ~/.npm/_logs. */
export function lateLoads(src) {
  const { code, strs } = codeOf(src);
  const out = [];
  for (const m of code.matchAll(/\b(?:import|require)\(\s*([^;]{0,240}?)\)/g)) {
    if (strs.some(([x, y]) => m.index >= x && m.index < y)) continue;   // spelled in a string or a template: a child's code, not this file's
    for (const n of m[1].matchAll(/['"`/]([\w.-]+\.mjs)['"`]/g)) if (!out.includes(n[1])) out.push(n[1]);
  }
  return out;
}
/** Does the text reach ./scratch.mjs at all — statically through its scripts/ imports, or at run time (lateLoads: a dynamic
 *  import or a require of scratch.mjs or of a module that reaches it)? A file that reaches it late is held by THE ORDER like
 *  any other: the scratch import first. */
export function reachesScratch(src, readModule, seen = new Set()) {
  if (dynamicScratch(src)) return true;
  for (const s of staticImports(src)) {
    if (s === './scratch.mjs') return true;
    if (/^\.\/[\w.-]+\.mjs$/.test(s) && !seen.has(s)) { seen.add(s); if (reachesScratch(readModule(s.slice(2)), readModule, seen)) return true; }
  }
  for (const m of lateLoads(src)) {
    if (m === 'scratch.mjs') return true;
    const s = './' + m;
    if (!seen.has(s)) { seen.add(s); const t = readModule(m); if (t && reachesScratch(t, readModule, seen)) return true; }
  }
  return false;
}
/** THE ORDER over a scripts/ dir: every test-* / dbg-* file that reaches scratch.mjs, and those whose first load is not it */
export function orderCensus(dir) {
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const files = fs.readdirSync(dir).filter((f) => /^(?:test|dbg)-.*\.mjs$/.test(f)).sort();
  const reach = files.filter((f) => reachesScratch(read(f), read));
  return { files, reach, late: reach.filter((f) => !rehomesFirst(read(f), read)), outside: files.filter((f) => !reach.includes(f)) };
}
// ── THE SUITES OUTSIDE BOTH FENCES (主开发 14:15Z item 2): a test-* / dbg-* file with no path to scratch.mjs that boots no hub
// but loads a product module reading a home (os.homedir(), $HOME, an XDG base-dir name — at load or by default), or reads
// it itself. Counted by reading (the module's own text and its relative requires, transitively). MANY ⇒ ONE row: they ride
// with shape H; the row's count may only fall (a new one is red: give it the import).
const HOME_RE = /\bhomedir\s*\(|process\.env\.HOME\b|process\.env\[['"]HOME['"]\]|\bXDG_(?:CONFIG|DATA|CACHE|STATE)_HOME\b/;
export function outsideReaders(dir, outside) {
  const R = path.resolve(dir, '..'), memo = new Map();
  const clean = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const resolve = (from, spec) => { if (!spec.startsWith('.')) return null; const p = path.resolve(path.dirname(from), spec); for (const c of [p, p + '.js', p + '.cjs', p + '/index.js']) { try { if (fs.statSync(c).isFile()) return c; } catch { } } return null; };
  const reads = (f, seen = new Set()) => {
    if (memo.has(f)) return memo.get(f); if (seen.has(f)) return null; seen.add(f);
    let t = ''; try { t = clean(fs.readFileSync(f, 'utf8')); } catch { }
    let hit = HOME_RE.test(t) ? path.relative(R, f) : null;
    if (!hit) for (const m of t.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]/g)) { const r = resolve(f, m[1] || m[2]); if (r && (r.startsWith(R + '/src/') || r === R + '/server.js')) { hit = reads(r, seen); if (hit) break; } }
    memo.set(f, hit); return hit;
  };
  return outside.map((f) => {
    const t = clean(fs.readFileSync(path.join(dir, f), 'utf8'));
    // any string literal naming src/<x>.js or server.js counts as a LOAD (主开发 17:06Z, BOUNDARY-4: a renamed require, a TREE spelling)
    const via = [...new Set([...t.matchAll(/['"`](?:[^'"`\n]*\/)?(src\/[\w./-]+?\.(?:c|m)?js|server\.js)['"`]/g)].map((m) => m[1]))]
      .map((s) => { let p = path.join(R, s); if (!fs.existsSync(p) && fs.existsSync(p + '.js')) p += '.js'; return fs.existsSync(p) ? reads(p) : null; }).filter(Boolean);
    return { file: f, own: HOME_RE.test(t), via };
  }).filter((x) => x.own || x.via.length);
}
/** THE ROW (主开发 14:15Z: many ⇒ a row, they ride with H) — measured 2026-11-14 on 91ac6db0b: 153 of the 317 files outside. */
/** THE SUITES THAT LOOK A VENDOR PROGRAM UP BY THEMSELVES (主开发 r1083 cure 2): they are no scripts/scratch.mjs REAL_CLI_ALLOW
 *  row (a new row is the owner's to give, never a lane's). Each finds its program on its OWN PATH / HOME / VS_<CLI>_BIN, so
 *  re-homed (the hosted runner, the push hook, the cut) it finds a system copy or none, and prints a named SKIP; a HIDE row
 *  drops the folders holding it. test-architecture §113 holds this list both ways against the suites that look a program up,
 *  and the kb names them beside the allow table. */
export const SELF_LOOKUP = Object.freeze({
  'test-claude-update-needs-nothing-hub.mjs': 'claude — §L reads the installed catalog; re-homed, it says by name that it did not run',
  'test-codex-sandbox-net.mjs': 'codex — the loopback A/B over the real `codex sandbox` (binary); re-homed, it says by name that it did not run',
  'test-harness-honesty.mjs': 'codex — the fixture-vs-live schema diff; re-homed, it says by name that it did not run',
  'test-harness-settings.mjs': 'codex — its load leg (--version, `features list`); re-homed, it says by name that it did not run',
  'test-opencode-s9.mjs': 'opencode — a real `opencode serve` (binary, the box); re-homed, it says by name that it did not run',
  'test-permission-rules.mjs': 'codex — the live oracle run; re-homed, it says by name that it did not run',
  'test-pricing-tiers.mjs': 'claude — §3 reads the installed catalog as an oracle; re-homed, it says by name that it did not run',
  'test-queue-steer.mjs': 'codex — ⑥ / ⑩ the real `codex app-server`; re-homed, it says by name that it did not run',
  'test-record-clear-walk.mjs': 'claude — a HIDE row: its hub\u2019s PATH drops the folders holding it',
  'test-record-shape.mjs': 'claude — the installed binary\u2019s shapes READ off it; re-homed, it says by name that it did not run',
  'test-toolbar-fold-ui.mjs': 'claude, codex — a HIDE row: its hub\u2019s PATH drops the folders holding them',
  'test-vendor-whitelist.mjs': 'the shipped oracles — (b) the live re-measurement under strace; re-homed, it says by name that it did not run',
});
/** THE NAMES THE KIT HANDS ITS SUITES (主开发 r1083 cure 1) — test-architecture §113 holds each as a row or a named NOT. The kit
 *  is OUTSIDE the tree, so this is a HAND LIST, read once (KIT_HANDED_READ) and able to go STALE: where the census can read the
 *  kit's own files (VS_KIT_DIR, the kit's folder), it re-reads them with kitNamesOf and holds the list to them both ways;
 *  elsewhere it says the dated line (主开发 r1139). */
export const KIT_HANDED_READ = Object.freeze({ on: '2026-11-21', files: Object.freeze(['remote/runner.mjs', 'remote/heavy-run.sh']) });
/** PURE: the env names a kit file hands — `env.N =` / `['N'] =`, a shell `N=` / `export N=`, a `{ N: }` key — of the names a suite's
 *  env is made of (the house prefixes and the session's own words). */
export function kitNamesOf(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/(?:\benv\.|\[')([A-Z][A-Z0-9_]{2,})'?\]?\s*=(?!=)|(?:^|[\s;{,])(?:export\s+)?((?:VIBESPACE|VS|TZ|LANG|HOME|XDG|TMPDIR|PATH)[A-Z0-9_]*)=(?!=)|[{,]\s*((?:VIBESPACE|VS|TZ|LANG|HOME|XDG|TMPDIR|PATH)[A-Z0-9_]*)\s*:/gm)) {
    const n = m[1] || m[2] || m[3]; if (n) out.add(n);
  }
  return [...out].sort();
}
export const KIT_HANDED = Object.freeze(['HOME', 'LANG', 'PATH', 'TZ', 'TMPDIR', 'XDG_RUNTIME_DIR', 'VIBESPACE_SKIP_AGENT_HOOKS', 'VIBESPACE_SUITE_EGRESS_FILE',
  'VS_NO_REAL_CLI', 'VIBESPACE_CI_DIR_SWEEP', 'VIBESPACE_CI_LANES', 'VIBESPACE_CI_LANE_ROOT', 'VIBESPACE_CI_REMOTE_RUN']);
export const OUTSIDE_ROW = Object.freeze({ max: 0, why: 'CLOSED by pick C (B-ba47, 主开发 r1222, 2026-11-21): every test-* / dbg-* file takes the scratch import first, so no suite or debug file is outside both fences — it was 153, restated 194 by the wider loader reader (主开发 17:06Z BOUNDARY-4), 43 after the fast part; a NEW file takes the import (scratch.mjs first)' });
/** PICK C (B-ba47, 主开发 r1222: EVERY FILE, one line a file — no «pure» class: a census that proves a file pure is one more reader
 *  that can be blind). The fast part gave every FAST row and every file of no row `import \'./scratch.mjs\';` as its first import;
 *  what is left outside is HEAVY rows only — their own commit, a hosted proof first — and the count may only fall. */
export const PICK_C = Object.freeze({ heavyLeft: 0, why: 'every heavy row took the import too (2026-11-21, its own commit, PROVE HOSTED each; test-account-reset-door-controls in the fast part, which THE ORDER needed): EVERY test-* / dbg-* file takes it first' });
/** PURE: the files of `outside` by the tier of their ci.mjs row (read from ci.mjs's TEXT: `{ name: \'x\', tier: \'y\'` — this module
 *  never imports the runner) → { fast, heavy, other, none } (none = no row: a debug script, a build check, an EXCLUDED suite). */
export function outsideByTier(outside, ciText) {
  const tier = new Map([...String(ciText || '').matchAll(/\{\s*name:\s*'([\w.-]+)',\s*tier:\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
  const out = { fast: [], heavy: [], other: [], none: [] };
  for (const f of outside || []) { const t = tier.get(String(f).replace(/\.mjs$/, '')); (t === 'fast' ? out.fast : t === 'heavy' ? out.heavy : t ? out.other : out.none).push(f); }
  return out;
}

// ── THE ENVIRONMENT'S TABLE, HELD BOTH WAYS (B-ba47, 主开发 01:23Z amendment 7) ─────────────────────────────────────────
// Every name a test-* / dbg-* file reads from the environment IN ITS OWN CODE (a read inside a string or template — the stub
// source a suite writes for a child — is the child's, not the suite's) is carried (src/home-verdict.js ENV_ROWS), a
// not-carried row (ENV_NOT), set in that same file first, or one of THE SUITES' OWN KNOBS: the derived list in
// scripts/suite-env-knobs.json, which must equal the census both ways. And every row is READ — by the tree's code, its
// shell, its workflow, or by the program its row names (`prog`).
const ENV_READ_RE = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)|process\.env\[\s*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\s*\]/g;
export function envReadsOf(t, { code = true } = {}) {
  const dr = code ? dataRanges(t).filter((r) => r[2] !== 'regex') : [];
  const inData = (i) => dr.some(([a, b]) => i >= a && i < b);
  const names = new Set([...t.matchAll(ENV_READ_RE)].filter((m) => !inData(m.index)).map((m) => m[1] || m[2]));
  for (const m of t.matchAll(/(?:const|let|var)\s*\{([^}]{1,400})\}\s*=\s*process\.env\b/g)) if (!inData(m.index)) for (const n of m[1].split(',').map((x) => x.trim().split(/[:=\s]/)[0]).filter((x) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x))) names.add(n);
  return names;
}
export const setFirstIn = (t, n) => new RegExp(`process\\.env\\.${n}\\s*=[^=]|process\\.env\\[['"\`]${n}['"\`]\\]\\s*=[^=]|delete\\s+process\\.env\\.${n}\\b`).test(t);
export function envCensus(repo, HV) {
  const dir = path.join(repo, 'scripts'), read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const carried = (n) => HV.ENV_ROWS.some((r) => r.name === n || (r.prefix && n.startsWith(r.prefix))), named = (n) => HV.ENV_NOT.some((r) => r.name === n);
  const knobs = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^(?:test|dbg)-.*\.mjs$/.test(x))) {
    const t = read(path.join(dir, f));
    for (const n of envReadsOf(t)) if (n !== 'HOME' && n !== 'PATH' && !carried(n) && !named(n) && !setFirstIn(t, n)) { if (!knobs.has(n)) knobs.set(n, []); knobs.get(n).push(f); }
  }
  // the tree reads a row when its code (JS anywhere, a shell's $NAME, a workflow's env: key) names it
  // the tree's files by git's own list (test-architecture §96: a data/bin listing is git ls-files-derived)
  const tree = execFileSync('git', ['-C', repo, 'ls-files', '-z', '--', 'src', 'scripts', 'server.js', 'data/bin', '.github/workflows'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter((f) => f && !f.startsWith('scripts/fixtures/')).map((f) => path.join(repo, f));
  const OWN = new Set(['src/home-verdict.js', 'scripts/test-home-verdict.mjs', 'scripts/test-architecture.mjs', 'scripts/hub-home-census.mjs'].map((f) => path.join(repo, f)));
  const treeText = tree.filter((f) => !OWN.has(f) && (/\.(?:m?js|cjs|sh|ya?ml|py)$/.test(f) || f.includes('/data/bin/'))).map(read).join('\n');
  // READ = an env read in code (process.env.N, env.N, env['N'], a destructure), a shell's $N / ${N}, a workflow's `N:` env key, os.environ
  const readByTree = (n) => new RegExp(`(?:process\\.env|\\benv)(?:\\.${n}\\b|\\[\\s*['"\`]${n}['"\`])|\\$\\{?${n}\\b|^\\s+${n}:\\s|environ(?:\\.get)?[\\[(]\\s*['"]${n}['"]|\\{[^}]*\\b${n}\\b[^}]*\\}\\s*=\\s*process\\.env`, 'm').test(treeText);
  const rows = [...HV.ENV_ROWS.filter((r) => r.name), ...HV.ENV_NOT];
  const unread = rows.filter((r) => !r.prog && !readByTree(r.name)).map((r) => r.name);
  return { knobs: [...knobs.keys()].sort(), knobFiles: knobs, unread };
}

// ── THE HUB'S OWN KNOBS, DERIVED (B-ba47 shape H, 主开发 r1222 (a)) ───────────────────────────────────────────────────────
// What the HUB's code reads from the environment: server.js and every src/ module (the device agent's src/agentd/ aside: it runs
// on a paired machine, never in the hub), in code (a read inside a string or a template — a child's source — is the child's):
// process.env.N / process.env['N'] / a destructure of process.env (envReadsOf), and `env.N` READ off an env object (a
// parameter that defaults to process.env: runtime-boot's env.NO_AUTO_UPDATE) — never an assignment `env.N = …` (a child's env
// being built) — and a name spelled once as a constant (`const OVERRIDE_ENV = 'N'`, `FORCE_ENV: 'N'`) and read through it. → Map(name → [files]). src/home-verdict.js HUB_ROWS / HUB_NOT must rule every name, both ways (§113 (h)).
// THE BOUND (主开发 r1222): a reader of names can miss a form, so the hub's own first act prints every handed name that is
// neither a row nor a NOT, and scripts/test-throwaway-boot.mjs holds that line EMPTY on a stand-in start.
const ENV_DOT_READ = /\benv\.([A-Z][A-Z0-9_]{2,})\b(?!\s*=[^=])/g;
const ENV_CONST = /\b[A-Z][A-Z0-9_]*_ENV\s*[:=]\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g;
export function hubEnvReads(repo) {
  const files = execFileSync('git', ['-C', repo, 'ls-files', '-z', '--', 'server.js', 'src'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0')
    .filter((f) => /\.(?:m?js|cjs)$/.test(f) && !f.startsWith('src/agentd/'));
  const out = new Map(), add = (n, f) => { if (!out.has(n)) out.set(n, []); if (!out.get(n).includes(f)) out.get(n).push(f); };
  for (const f of files) {
    let t = ''; try { t = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
    for (const n of hubReadsOfText(t)) add(n, f);
  }
  return out;
}
/** PURE: the env names ONE file's code reads, in the three forms above (a read in a string or a template is a child's). */
export function hubReadsOfText(t) {
  const names = new Set(envReadsOf(t));
  const dr = dataRanges(t).filter((r) => r[2] !== 'regex'), inData = (i) => dr.some(([a, b]) => i >= a && i < b);
  for (const m of t.matchAll(ENV_DOT_READ)) if (!inData(m.index) && !/delete\s+$/.test(t.slice(Math.max(0, m.index - 8), m.index))) names.add(m[1]);
  for (const m of t.matchAll(ENV_CONST)) if (!inData(m.index)) names.add(m[1]);   // a name read through a constant: `const OVERRIDE_ENV = 'N'` / `OVERRIDE_ENV: 'N'`
  return names;
}
/** PURE: the names of `reads` the hub's rows leave UNRULED (neither a HUB_ROWS row nor a HUB_NOT), and the knob-file names no
 *  code reads — the census both ways. HOME and PATH are the re-home's own. */
export function hubKnobCensus(reads, HV) {
  const row = (n) => HV.HUB_ROWS.some((r) => r.name === n || (r.prefix && n.startsWith(r.prefix)));
  const not = (n) => HV.HUB_NOT.some((x) => x.name === n || (x.prefix && n.startsWith(x.prefix) && n.length > x.prefix.length));
  const unruled = [...reads.keys()].filter((n) => n !== 'HOME' && n !== 'PATH' && !row(n) && !not(n)).sort();
  const unread = [...HV.HUB_KNOBS.knobs, ...HV.HUB_KNOBS.credentials.map((c) => c.name), ...(HV.HUB_KNOBS.refused || []).map((c) => c.name)].filter((n) => !reads.has(n)).sort();
  return { unruled, unread };
}

// ── THE LINE-1 CENSUS (B-ba47 shape H, the plan's PROOFS-9): the re-home is runtime-boot's first act, and runtime-boot is
// server.js's FIRST line — so every module server.js loads after it, and every home a module CAPTURES WHEN IT LOADS (a top-level
// const built from os.homedir() or $HOME), reads the re-homed home. The captures are a named list held both ways (a new one is
// red until named: it must be loaded after line 1, never by runtime-boot's own graph).
export const BOOT_LINE = "require('./src/server/runtime-boot.js').boot({ rootDir: __dirname });";
export const LOAD_TIME_HOME = Object.freeze(['src/adapters/codex.js', 'src/peer-messaging.js', 'src/plugins.js', 'src/session-store.js']);
const LOAD_HOME_RE = /^(?:const|let|var)\s+[^=\n]+=[^\n]*(?:\bos\.homedir\(\)|process\.env\.HOME\b)/;
/** PURE over one file's text: the top-level lines (column 0, not a function) that capture a home when the module loads. */
export function loadTimeHomeOf(text) {
  return String(text).split('\n').filter((l) => LOAD_HOME_RE.test(l) && !/=>|\bfunction\b/.test(l));   // a line that defines a function reads the home when CALLED, not at load
}
/** The files of server.js + src/ (the device agent's src/agentd/ aside) that capture a home at load. */
export function loadTimeHomeFiles(repo) {
  const files = execFileSync('git', ['-C', repo, 'ls-files', '-z', '--', 'server.js', 'src'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0')
    .filter((f) => /\.(?:m?js|cjs)$/.test(f) && !f.startsWith('src/agentd/'));
  return files.filter((f) => { try { return loadTimeHomeOf(fs.readFileSync(path.join(repo, f), 'utf8')).length > 0; } catch { return false; } }).sort();
}
/** The relative-require closure of `start` (repo-relative paths; comments stripped; .js / /index.js tried) — runtime-boot's own
 *  graph loads BEFORE its first act re-homes, so no home-capturing module may be in it. */
export function requireClosure(repo, start) {
  const seen = new Set(), q = [start];
  while (q.length) {
    const f = q.shift(); if (seen.has(f)) continue; seen.add(f);
    let t = ''; try { t = fs.readFileSync(path.join(repo, f), 'utf8'); } catch { continue; }
    const body = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
    for (const m of body.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const p = path.normalize(path.join(path.dirname(f), m[1]));
      for (const c of [p, p + '.js', p + '/index.js']) { try { if (fs.statSync(path.join(repo, c)).isFile()) { q.push(c); break; } } catch { } }
    }
  }
  return [...seen].sort();
}
