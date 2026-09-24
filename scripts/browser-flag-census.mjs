#!/usr/bin/env node
// THE BROWSER CLI'S GLOBAL FLAGS, MEASURED (docs/design-browser-takeover.zh.md
// §3.3 r3). NOT a test-*.mjs on purpose (the tier census would demand a tier):
// the ONE measurement the fast gate's checked-in fixture came from and the
// heavy gate re-runs against the installed binary.
//
// WHY MEASURED. src/browser-verbs.js finds a command's verb and noun by
// skipping the binary's GLOBAL flags, which 0.32.0 strips anywhere in the argv
// — so a value flag the router reads as a boolean hands the router its VALUE
// as the noun. The r2 census read the --help's option sections and missed
// `--idle-timeout` (documented only as AGENT_BROWSER_IDLE_TIMEOUT_MS), and
// `get --idle-timeout 5m cdp-url` printed the raw endpoint. The help is prose;
// the parser is the truth.
//
// HOW (launch-free, zero network, ~0.5 s): every flag-shaped string in the
// binary's bytes (split at `--` boundaries — the Rust string pool concatenates
// them — plus every `-`-prefix of each, plus every `-<letter>`) is run as
// `<flag> zzq9 session list` in a scratch HOME / XDG_RUNTIME_DIR / TMPDIR with
// no inherited AGENT_BROWSER_*:
//   · the session list answers        ⇒ the flag took `zzq9` as its VALUE
//   · `Unknown command: zzq9`          ⇒ a global BOOLEAN (zzq9 became the verb)
//   · `Unknown command: <flag>`        ⇒ not a global flag (a verb's own option)
//   · anything else                    ⇒ `other` (--config checks its file first;
//                                        --help / --version print and exit)
//
//   node scripts/browser-flag-census.mjs [<binary>] [--write <fixture.json>]
//   (either order; a bare name is looked up on PATH, the shim skipped — r4)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/** Every flag-shaped string in the binary's bytes (see the header). */
export function flagCandidates(buf) {
  const s = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf);
  const set = new Set();
  for (const m of s.matchAll(/--[a-z][a-z0-9-]*/g)) {
    for (const piece of m[0].split(/(?=--[a-z])/)) {
      const parts = piece.slice(2).split('-');
      for (let i = 1; i <= parts.length; i++) { const f = '--' + parts.slice(0, i).join('-'); if (f.length > 3 && !f.endsWith('-')) set.add(f); }
    }
  }
  for (const c of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') set.add('-' + c);
  return [...set].sort();
}

/** The child environment: the caller's minus every AGENT_BROWSER_* (a session
 *  shell carries its own spawn pairs — and AGENT_BROWSER_CONFIG, which would
 *  make every probe read that config), with scratch HOME / XDG / TMPDIR. */
export function probeEnv(base, dir) {
  const env = {};
  for (const [k, v] of Object.entries(base || {})) if (!k.startsWith('AGENT_BROWSER_')) env[k] = v;
  for (const k of ['WAYLAND_DISPLAY', 'DISPLAY']) delete env[k];
  const home = path.join(dir, 'home'), xdg = path.join(dir, 'xdg'), tmp = path.join(dir, 'tmp');
  for (const d of [home, xdg, tmp]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return { ...env, HOME: home, XDG_RUNTIME_DIR: xdg, TMPDIR: tmp, AGENT_BROWSER_SESSION: 'vs-flag-census', AGENT_BROWSER_NAMESPACE: 'vs-flag-census' };
}

/** → `{ version, candidates, value, bool, other, localCount, ms }`. */
export async function measureGlobalFlags(bin, { dir, env = process.env, concurrency = 16, timeout = 15000 } = {}) {
  if (!dir) throw new Error('measureGlobalFlags: a scratch dir is required');
  const cands = flagCandidates(fs.readFileSync(fs.realpathSync(bin)));
  const penv = probeEnv(env, dir);
  const run = (args) => new Promise((res) => execFile(bin, args, { env: penv, cwd: dir, timeout, encoding: 'utf8' }, (e, so, se) => res(String(so || '') + String(se || ''))));
  const version = ((await run(['--version'])).match(/(\d+\.\d+\.\d+)/) || [])[1] || null;
  const out = { value: [], bool: [], other: [], local: [] };
  const t0 = Date.now();
  let i = 0;
  const worker = async () => {
    while (i < cands.length) {
      const f = cands[i++];
      const o = await run([f, 'zzq9', 'session', 'list']);
      if (o.includes('Unknown command: ' + f)) out.local.push(f);
      else if (o.includes('Unknown command: zzq9')) out.bool.push(f);
      else if (/No active sessions|Active sessions|Invalid/.test(o)) out.value.push(f);
      else out.other.push({ flag: f, said: o.trim().split('\n')[0].slice(0, 120) });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  out.value.sort(); out.bool.sort(); out.other.sort((a, b) => a.flag.localeCompare(b.flag));
  return { version, candidates: cands.length, value: out.value, bool: out.bool, other: out.other, localCount: out.local.length, ms: Date.now() - t0 };
}

/** r4 (takeover finding 5): the command line — `[<binary>] [--write <fixture.json>]` in either order. The
 *  positional binary is any non-flag word that is not --write's value (r3 excluded index 0 whenever
 *  --write was absent: `j !== wi + 1` with wi = -1); a bare NAME is resolved through PATH by the verb
 *  table's one resolver, skipping the shim (r3 realpath'd it against the cwd — ENOENT). */
export function censusArgs(argv, { PATH = process.env.PATH || '', exists, isShim, shimDirs = [] } = {}) {
  const args = argv.slice();
  const wi = args.indexOf('--write');
  const outFile = wi >= 0 ? (args[wi + 1] || null) : null;
  const named = args.find((a, j) => !a.startsWith('--') && (wi < 0 || j !== wi + 1));
  const V = require('../src/browser-verbs.js');
  const name = named || V.REAL_BINARY;
  if (name.includes('/')) return { bin: path.resolve(name), outFile };
  const r = V.resolveRealBinary({ PATH, name, shimDirs, exists: exists || ((p) => { try { const st = fs.statSync(p); return st.isFile() && (st.mode & 0o111) !== 0; } catch { return false; } }),
    isShim: isShim || ((p) => { try { return fs.readFileSync(p, 'utf8').slice(0, 512).includes(V.SHIM_MARKER); } catch { return false; } }) });
  return r.ok ? { bin: r.path, outFile } : { error: `no ${JSON.stringify(name)} on PATH (the shim skipped)`, outFile };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const ca = censusArgs(process.argv.slice(2), { shimDirs: [path.join(here, '..', 'data', 'bin'), path.join(os.homedir(), '.vibespace', 'bin')] });
  if (ca.error) { console.error(`browser-flag-census: ${ca.error}`); process.exit(2); }
  const { bin, outFile } = ca;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-flag-census-'));
  try {
    const m = await measureGlobalFlags(bin, { dir });
    const rec = { version: m.version, measured: new Date().toISOString().slice(0, 10), method: '`<flag> zzq9 session list` for every flag-shaped string in the binary (scripts/browser-flag-census.mjs); value = swallowed zzq9, bool = zzq9 became the unknown command', candidates: m.candidates, value: m.value, bool: m.bool, other: m.other, localCount: m.localCount };
    if (outFile) fs.writeFileSync(outFile, JSON.stringify(rec, null, 1) + '\n');
    console.log(JSON.stringify({ ...rec, ms: m.ms }, null, 1));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
