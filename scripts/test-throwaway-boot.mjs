#!/usr/bin/env node
// B-ba47 shape H — THE GUARD (fast; in-process + node children). 主开发's GO 2026-11-14 16:52Z on the second page, re-landed on
// pick B's BUILT env 2026-11-21 (主开发 r1222: the hub's rows = the suite's + its own knobs, derived; THE BOUND ③ below):
// a hub is THROWAWAY by ONE test (src/server-root.js isThrowaway over the root verdict: a LINKED WORKTREE, or a copy under a
// temp root handed a temp home — every gate asks it, rule 3 too: 主开发 r1278), and RE-HOMED at the boot's
// first act (src/server/runtime-boot.js → src/server/throwaway-root.js rehomeAtBoot) only on the worktree sign, by
// src/home-verdict.js's verdict and value rule over the hub's rows.
//   ① the boot in REAL children over real git layouts (a linked worktree, a clone), handed a POISONED home (a path outside
//      every temp root that does not exist; a preload records every fs touch of it and every os.homedir() / os.userInfo()):
//      (a) a worktree is re-homed to <root>/.home; the boot line names its own home, the two doors, the NAMES dropped —
//          no path of the handed home; ssh's agent socket dropped for a hub; nothing of the home read at require time;
//          the boot's touches of it are the two named ones (its other spelling; the tool probes in dropped PATH dirs)
//      (b) a person's CLONE under a temp root, their own home: NOT re-homed and NOT throwaway — real for every gate
//      (c) a clone under a temp root handed a temp home (a test's scratch clone): throwaway for every gate, not re-homed
//      (d) an installed root: real, nothing touched   (e) a worktree with VIBESPACE_REAL_INSTALL=1: real, printed
//   ② THE NAMED EXCEPTIONS: every passwd read in the product — src, server.js, data/bin's .js files AND its extensionless
//      node CLIs, read by their shebang — is a row with what it reads and why; ssh's own passwd home is the one row more
//   ③ THE BOUND (主开发 r1222): the hub's first act prints every handed name that is neither a hub row nor a hub NOT; on a
//      stand-in start (the env the tooling hands a hub: the locale, a port, the kit's switches, a caller's conversation names,
//      an agent CLI's folder, a credential of the person's own hub) that line is EMPTY — RED CONTROL: one planted name is said
//      by name, never its value
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { trackedFiles } from './tracked-files.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (typeof name !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof name} — the arguments are swapped`);   // the swap guard (B-1747)
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); }
}
const DIR = scratch('throwaway-boot');
fs.mkdirSync(DIR, { recursive: true });
// real git layouts, as git writes them: a CLONE (.git a directory) and a LINKED WORKTREE (.git a file naming
// <common>/worktrees/<name>, whose commondir names the common dir back)
const mkClone = (name) => { const r = path.join(DIR, name); fs.mkdirSync(path.join(r, '.git'), { recursive: true }); return r; };
const mkWorktree = (name) => {
  const common = path.join(DIR, `${name}-repo`, '.git'), gd = path.join(common, 'worktrees', name), r = path.join(DIR, name);
  fs.mkdirSync(gd, { recursive: true }); fs.mkdirSync(r, { recursive: true });
  fs.writeFileSync(path.join(gd, 'commondir'), '../..\n'); fs.writeFileSync(path.join(r, '.git'), `gitdir: ${gd}\n`);
  return r;
};

console.log('— ① the boot in real children, handed a POISONED home');
const POISON = `/nonexistent-vs-tboot-${process.pid}`;   // outside every temp root; never made — a touch is recorded, never served
const PRELOAD = path.join(DIR, 'poison-preload.cjs');
fs.writeFileSync(PRELOAD, `'use strict';
const fs = require('fs'), os = require('os');
const P = ${JSON.stringify(POISON)}, rec = { phase: 'require', touches: [], homedir: [], userInfo: [] };
global.__rec = rec;
const hit = (a) => { try { const s = a instanceof URL ? a.pathname : Buffer.isBuffer(a) ? a.toString() : String(a); return typeof s === 'string' && (s === P || s.startsWith(P + '/')); } catch { return false; } };
const wrap = (obj, label) => { for (const k of Object.keys(obj)) { const f = obj[k]; if (typeof f !== 'function' || /^[A-Z]/.test(k)) continue;
  const w = function (...a) { if (hit(a[0]) || hit(a[1])) rec.touches.push(rec.phase + ' ' + label + k + ' ' + String(a[0]).slice(P.length)); return f.apply(this, a); };
  for (const p of Object.keys(f)) w[p] = f[p]; obj[k] = w; } };
wrap(fs, 'fs.'); wrap(fs.promises, 'fs.promises.');
const hd = os.homedir, ui = os.userInfo;
os.homedir = () => { rec.homedir.push(rec.phase); return hd(); };
os.userInfo = (...a) => { rec.userInfo.push(rec.phase); return ui(...a); };
`);
const CHILD = path.join(DIR, 'boot-child.cjs');
fs.writeFileSync(CHILD, `'use strict';
const rec = global.__rec;
const RB = require(${JSON.stringify(path.join(REPO, 'src/server/runtime-boot.js'))});   // the boot's module graph: read at require time
rec.phase = 'boot';
const lines = []; RB.boot({ rootDir: process.argv[2], log: (l) => lines.push(l) });
rec.phase = 'after';
const TR = require(${JSON.stringify(path.join(REPO, 'src/server/throwaway-root.js'))});
const home = require('os').homedir();
const pm = require(${JSON.stringify(path.join(REPO, 'src/peer-messaging.js'))}).REGISTRY_DIR;   // a home CAPTURED WHEN A MODULE LOADS, loaded after line 1 (§113 (i))
const kid = require('child_process').spawnSync(process.execPath, ['-e', 'process.stdout.write(require("os").homedir())'], { encoding: 'utf8' }).stdout;
setImmediate(() => console.log(JSON.stringify({ rec, home, pm, kid, env: Object.fromEntries(['HOME', 'XDG_CONFIG_HOME', 'CLAUDE_CONFIG_DIR', 'SSH_AUTH_SOCK', 'PATH', 'LANG', 'PORT', 'NO_AUTO_UPDATE', 'VIBESPACE_SKIP_AGENT_HOOKS', 'VIBESPACE_API', 'VIBESPACE_SESSION_TOKEN', 'CLAUDE_WEBUI_PORT', 'VIBESPACE_PASSWORD', 'HUBGUARD_PLANTED'].map((k) => [k, process.env[k] ?? null])), lines, verdict: TR.boot(), throwaway: TR.throwaway(process.argv[2]) })));
`);
const NODE_BIN = path.dirname(process.execPath);
const SYS = createRequire(import.meta.url)('../src/home-verdict.js').SYSTEM_PATHS[process.platform === 'darwin' ? 'darwin' : 'linux'].join(':');
const SECRETISH = ['cfg', 'val', String(process.pid)].join('-');
const bootIn = (root, env) => {
  const r = spawnSync(process.execPath, ['-r', PRELOAD, CHILD, root], { encoding: 'utf8', timeout: 30000, env: { PATH: `${POISON}/.local/bin:${NODE_BIN}:/usr/bin:/bin`, LANG: 'C.UTF-8', ...env } });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { err: r.stderr + r.stdout }; }
};
const tline = (j) => (j.lines || []).find((l) => l.startsWith('[throwaway] ') && !l.startsWith('[throwaway] handed '));
const uline = (j) => (j.lines || []).find((l) => l.startsWith('[throwaway] handed '));
// THE STAND-IN START (③): what the tooling hands a hub — the locale, a port, the kit's switches — and what a caller may hand it:
// a conversation's names and family, an agent CLI's folder, the person's ssh agent, a credential of the person's own hub
const STAND_IN = Object.freeze({ HOME: POISON, LANG: 'C.UTF-8', TZ: 'UTC', PORT: '39999', NO_AUTO_UPDATE: '1', VS_NO_REAL_CLI: '1', VIBESPACE_SKIP_AGENT_HOOKS: '1',
  CLAUDE_CONFIG_DIR: `${POISON}/.claude-${SECRETISH}`, SSH_AUTH_SOCK: '/tmp/ssh-x/agent', VIBESPACE_API: 'http://127.0.0.1:1', VIBESPACE_SESSION_TOKEN: `tok-${SECRETISH}`,
  CLAUDE_WEBUI_PORT: '1', VIBESPACE_PASSWORD: `pw-${SECRETISH}` });
const NOT_CARRIED = ['CLAUDE_CONFIG_DIR', 'CLAUDE_WEBUI_PORT', 'SSH_AUTH_SOCK', 'VIBESPACE_API', 'VIBESPACE_PASSWORD', 'VIBESPACE_SESSION_TOKEN'];
{ // (a) a linked worktree, handed a home outside every temp root
  const root = mkWorktree('wt-a');
  const j = bootIn(root, STAND_IN);
  const own = path.join(root, '.home');
  ok(j.verdict && j.verdict.rehome === true && j.verdict.why === 'throwaway' && j.verdict.sign === 'worktree' && j.throwaway === true && j.home === own && j.env.HOME === own, '(a) a LINKED WORKTREE handed a home outside every temp root is re-homed to <root>/.home — and throwaway for every gate', j.verdict || j);
  ok(j.env && j.env.XDG_CONFIG_HOME === null && NOT_CARRIED.every((k) => j.env[k] === null) && j.env.PATH === `${own}/.vs-bin:${SYS}`
    && j.env.LANG === 'C.UTF-8' && j.env.PORT === '39999' && j.env.NO_AUTO_UPDATE === '1' && j.env.VIBESPACE_SKIP_AGENT_HOOKS === '1',
    "(a) the env is BUILT from the hub's rows: its port, the locale and the kit's switches carried (the hub's own knobs, derived); the caller's conversation names and family, the agent CLI's folder, the person's ssh agent and the person's own hub password NOT carried; the XDG base dirs unset; PATH its own .vs-bin + the system's fixed directories, nothing of the handed PATH", j.env);
  ok(fs.existsSync(own) && (fs.statSync(own).mode & 0o777) === 0o700 && j.kid === own, '(a) the own home is made 0700, and a child the hub starts inherits it', j.kid);
  ok(j.pm === path.join(own, '.claude', 'sessions'), "(a) a home a module CAPTURES WHEN IT LOADS (src/peer-messaging.js REGISTRY_DIR, one of §113 (i)'s named four), loaded after the boot as server.js loads it, is the hub's own — never the handed one", j.pm);
  { // ssh, read by ssh itself: `ssh -G` resolves the config it would use, and dials nothing
    const w = path.join(own, '.vs-bin', 'ssh'), g = fs.existsSync(w) ? spawnSync(w, ['-G', 'host.invalid'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: own } }) : null;
    const cfg = (g && g.stdout) || '', has = (k, v) => new RegExp(`^${k} ${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'mi').test(cfg);
    ok(!!g && g.status === 0 && has('userknownhostsfile', path.join(own, '.ssh', 'known_hosts')) && has('globalknownhostsfile', '/dev/null') && has('identitiesonly', 'yes')
      && has('identityfile', path.join(own, '.ssh', 'id_ed25519')) && !cfg.includes(POISON),
      "(a) the hub's ssh is its own (.vs-bin first on PATH, every ssh road spawns ssh by name): read by `ssh -G`, it uses the hub's OWN known_hosts and identity, no global known_hosts, IdentitiesOnly — nothing of the person's ~/.ssh", g ? (g.stderr || cfg).slice(0, 300) : 'no wrapper');
  }
  const line = tline(j) || '';
  ok(line.includes(`this copy runs from a git worktree (${root}): its home is ${own}`) && line.includes('instead of the home it was handed') && line.includes('start it from your clone — or set VIBESPACE_REAL_INSTALL=1')
    && line.includes(`${NOT_CARRIED.length} names not carried into its environment (${NOT_CARRIED.join(', ')})`) && !line.includes(POISON) && !line.includes(SECRETISH),
    '(a) ONE boot line: its own home, the two doors, the NAMES dropped — and NO path of the handed home, no value', line);
  const req = (j.rec || {}).touches?.filter((t) => t.startsWith('require ')) || ['?'];
  ok(req.length === 0 && (j.rec.homedir || []).filter((p) => p === 'require').length === 0 && (j.rec.userInfo || []).length === 0,
    "(a) THE GUARD: the boot's module graph reads nothing of the handed home at require time — no fs touch, no os.homedir(), no passwd read", j.rec);
  const BOOT_TOUCHES = [/^boot fs\.(?:lstatSync|realpathSync) $/, /^boot fs\.(?:statSync|realpathSync|lstatSync) \/\.local\/bin\/dtach$/];   // its other spelling (the walk's lstat of the home itself); the product's own dtach where no system dir has one
  const boot = (j.rec.touches || []).filter((t) => t.startsWith('boot ')), after = (j.rec.touches || []).filter((t) => t.startsWith('after '));
  ok(boot.length >= 1 && boot.every((t) => BOOT_TOUCHES.some((re) => re.test(t))) && after.length === 0,
    "(a) …the boot's touches of the handed home are the NAMED ones: the home itself (its other spelling, for the value rule and the link table) and, on a machine with no system dtach, the product's own ~/.local/bin/dtach — a path SPELLED under the home is never resolved; nothing after the re-home", j.rec.touches);
  // ③ THE BOUND: the stand-in start hands nothing that is neither a hub row nor a hub NOT — and a planted name is said, by name
  ok(!uline(j), "③ THE BOUND (主开发 r1222): on the stand-in start the hub's first act names NO handed name that is neither a hub row nor a hub NOT (src/home-verdict.js HUB_ROWS / HUB_NOT)", uline(j));
  const pj = bootIn(mkWorktree('wt-a3'), { ...STAND_IN, HUBGUARD_PLANTED: `val-${SECRETISH}` }), pl = uline(pj) || '';
  ok(pl.startsWith('[throwaway] handed 1 name that is neither a hub row nor a named NOT') && pl.includes(': HUBGUARD_PLANTED — ') && !pl.includes(SECRETISH) && pj.env && pj.env.HUBGUARD_PLANTED === null,
    '③ RED CONTROL: one planted name the rows do not rule is said at the first act BY NAME (never its value) and not carried', pl || pj);
}
{ // (b) a person's CLONE under a temp root, their own home
  const root = mkClone('clone-b');
  const j = bootIn(root, { HOME: POISON });
  ok(j.verdict && j.verdict.rehome === false && j.verdict.why === 'not-worktree' && j.throwaway === false && j.home === POISON && !fs.existsSync(path.join(root, '.home')) && !tline(j),
    "(b) a person's CLONE under a temp root, run with their own home, is NOT re-homed and NOT throwaway — a real hub for every gate, rule 3 too (主开发 r1278), silently (the readers' REACH-5)", j.verdict || j);
}
{ // (c) a test's scratch clone: under a temp root, handed a temp home
  const root = mkClone('clone-c'), tmpHome = path.join(DIR, 'suite-home');
  const j = bootIn(root, { HOME: tmpHome });
  ok(j.verdict && j.verdict.rehome === false && j.throwaway === true && j.verdict.sign === 'scratch-clone' && j.home === tmpHome && !tline(j),
    "(c) a test's scratch CLONE (under a temp root, handed a temp home) stays THROWAWAY for every gate, as today — not re-homed: it has a home of its own", j.verdict || j);
  const jw = bootIn(mkWorktree('wt-c2'), { HOME: tmpHome });
  ok(jw.verdict && jw.verdict.rehome === false && jw.verdict.why === 'temp-home' && jw.throwaway === true, '(c) …and a worktree handed a temp home (a suite\'s hub) is left alone, throwaway', jw.verdict || jw);
}
{ // (d) an installed root; (e) the override
  const installed = `/nonexistent-vs-tboot-root-${process.pid}`;
  const d = bootIn(installed, { HOME: POISON });
  ok(d.verdict && d.verdict.rehome === false && d.throwaway === false && d.home === POISON && (d.rec.touches || []).length === 0 && !tline(d), '(d) an installed root is real — nothing of the home touched, nothing said', d.verdict || d);
  const root = mkWorktree('wt-e');
  const e = bootIn(root, { HOME: POISON, VIBESPACE_REAL_INSTALL: '1' });
  ok(e.verdict && e.verdict.rehome === false && e.verdict.why === 'override' && e.throwaway === false && e.home === POISON && !fs.existsSync(path.join(root, '.home'))
    && (tline(e) || '') === `[throwaway] this copy runs from a git worktree (${root}) but VIBESPACE_REAL_INSTALL=1 is set: it uses the home it was handed, as an installed copy does`,
    "(e) a worktree with VIBESPACE_REAL_INSTALL=1 (the person's word: «this is my real install») is real for every gate and not re-homed — and says so", e.verdict || e);
}

console.log('— ② THE NAMED EXCEPTIONS: every passwd read in the product is a row; ssh is the one row more');
const PASSWD_ROWS = Object.freeze([
  { file: 'src/claude-oat-probe.js', n: 1, why: 'homedir — REAL_HOME, a DENY root (law E): compared against, never opened' },
  { file: 'src/usage-routes.js', n: 1, why: 'username — a label' },
  { file: 'src/adapters/codex.js', n: 1, why: 'uid — a per-user name' },
  { file: 'src/server/cli-cmd.js', n: 1, why: "shell — loginShellOf's account shell, never its home" },
  { file: 'src/server/tls.js', n: 1, why: 'username — the tailnet certificate user' },
  { file: 'src/hosts.js', n: 1, why: "username — ssh's default user, compared with a host entry's (a name, never a home)" },
  { file: 'data/bin/vibespace-claude-subscription-login.mjs', n: 2, why: 'username — the keychain account (two defaults of one helper)' },
  { file: 'data/bin/vibespace-browser', n: 1, why: "homedir — THE ACCOUNT'S home, never $HOME (2.369.168 takeover finding 2: HOME is the agent's to set, so a fence that follows it follows the agent) — and NEVER READ under its checkout's own re-home (④: the throwaway hub's home is the account's there)" },
  { file: 'data/bin/vibespace-window', n: 1, why: 'homedir — one spelling of a DENY list: a screenshot is refused in secret folders under every home; compared, never written' },
]);
const SSH_ROW = Object.freeze({ what: "ssh's own passwd home", why: "ssh reads ~/.ssh from the passwd entry whatever HOME says — so a re-homed hub's PATH starts with an ssh of its own on its OWN files (-F /dev/null, its known_hosts and identity, IdentitiesOnly; proven above by `ssh -G`) and its agent socket is dropped (HUB_DROPS)" });
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const reads = (t) => (strip(t).match(/os\.userInfo\(/g) || []).length;
const isNodeCli = (f) => { try { return /^#!.*\bnode\b/.test(fs.readFileSync(path.join(REPO, f), 'utf8').slice(0, 80)); } catch { return false; } };
const files = trackedFiles(REPO, 'server.js', 'src', 'data/bin')   // git ls-files (test-architecture §96)
  .filter((f) => !f.startsWith('src/lib/') && f !== 'data/bin/vibespace-agentd.js' && (/\.(c|m)?js$/.test(f) || (f.startsWith('data/bin/') && !/\.[a-z0-9]+$/i.test(path.basename(f)) && isNodeCli(f))));
const found = files.map((f) => [f, reads(fs.readFileSync(path.join(REPO, f), 'utf8'))]).filter(([, n]) => n > 0);
const off = [...found.filter(([f, n]) => { const r = PASSWD_ROWS.find((x) => x.file === f); return !r || r.n !== n; }).map(([f, n]) => `${f} ×${n}`),
  ...PASSWD_ROWS.filter((r) => !found.some(([f]) => f === r.file)).map((r) => `${r.file}: stale row`)];
ok(off.length === 0 && found.length === PASSWD_ROWS.length && files.some((f) => f === 'data/bin/vibespace-browser') && PASSWD_ROWS.every((r) => r.why.length > 10),
  `the passwd reads are the ${PASSWD_ROWS.length} named rows — data/bin's extensionless node CLIs read by their shebang (${found.map(([f, n]) => `${f} ×${n}`).join(', ')}) — and ${SSH_ROW.what}: ${SSH_ROW.why}`, off);
const PLANT = ['const h = os.', 'userInfo', '().', 'homedir;'].join('');   // built at runtime: §68 reads a suite's own text for a passwd-home read
ok(reads(PLANT) === 1 && reads('// os.userInfo() in a comment') === 0 && reads("const s = 'x'; /* os.userInfo() */") === 0, 'CONTROL: a new os.userInfo() read is counted; one in a comment is not');


console.log("— ④ vibespace-browser under a throwaway hub: the account home its agent's ~, Downloads fence, config and profile root use is the hub's OWN (src/browser-account-home.js)");
{
  const AH = require(path.join(REPO, 'src/browser-account-home.js'));
  let asked = 0; const readPw = () => { asked++; return '/home/person'; };
  const own = AH.accountHomeOf({ env: '/w/wt/.home', treeRoot: '/w/wt', readPw, fallback: '/x' });
  ok(own.home === '/w/wt/.home' && own.ownTree === true && own.agrees === true && asked === 0,
    "④ a CLI run from a checkout whose hub re-homed itself ($HOME = <its root>/.home): that home is the account's for every use — the person's passwd home is NEVER READ", { own, asked });
  const kept = AH.accountHomeOf({ env: '/home/person', treeRoot: '/w/wt', readPw }), moved = AH.accountHomeOf({ env: '/tmp/mine', treeRoot: '/w/wt', readPw });
  ok(kept.home === '/home/person' && kept.agrees && moved.home === '/home/person' && moved.agrees === false && !moved.ownTree,
    "④ …anywhere else takeover finding 2 holds: the account's passwd home, and an agent's own $HOME is `agrees: false` (the config refused by name)", { kept, moved });
  const host = AH.accountHomeOf({ env: '/w/wt/.home', treeRoot: null, readPw }), linked = AH.accountHomeOf({ env: '/w/link/.home', treeRoot: '/w/wt', readPw, realpath: (p) => p.replace('/w/link', '/w/wt') });
  ok(host.home === '/home/person' && !host.ownTree && linked.ownTree === true,
    "④ a paired machine's copy (no checkout beside it) keeps the account's rule; the own home is judged by where it RESOLVES (a link to it counts)", { host, linked });
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-browser'), 'utf8');
  ok(/require\(path\.join\(treeRoot, 'src', 'browser-account-home\.js'\)\)/.test(cli) && /const HOMES = accountHome\(\);/.test(cli) && /const HOME_DIRS = \[\.\.\.new Set\(\[HOMES\.home, os\.homedir\(\)\]/.test(cli),
    "④ WIRING: the CLI decides HOMES through it from its OWN checkout (never a device bundle input: src/browser-verbs.js is one), and the fences read HOMES");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
