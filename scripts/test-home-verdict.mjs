#!/usr/bin/env node
// B-ba47 pick B (lane cli-update-needs-nothing, 2026-11-14) — THE HOME VERDICT gate (fast; in-process + node children, all
// started at once). src/home-verdict.js decides, ONCE per process, whose home it runs on: a suite (scripts/scratch.mjs, at
// import) and a throwaway hub (shape H, its boot) share the one verdict and the one value rule. This suite:
//   ① suiteRehome — the table: a home under a temp root is left alone, any other is re-homed — judged where it RESOLVES; a
//      temp-directory variable that equals the home or stands above it is not a temp root; the seam can only turn it ON
//   ② hubRehome — the table, and its PARITY: its home clause IS suiteRehome, row for row
//   ③ THE WALK — a path resolved as the kernel walks it (links first, a parent step on what the prefix RESOLVED to, a
//      missing part walked ON as if made, could not look ⇒ null) over a stand-in tree; THE THREE WAYS (judgePath: the
//      kernel's walk, the spelling fold, the parent by both — the checkout's own tree carried); the value SHAPES
//   ④ rehomeEnv — THE ENVIRONMENT IS BUILT: only ENV_ROWS' names, each value of its shape and judged; ENV_NOT's names (the
//      desktop session, the proxies, the caller's conversation, …) never; the rest named; PATH BUILT;
//      ④b binLinks — the rows, each linking only what resolves to what it IS; ④c the suite's OWN node, in pieces (the
//      «ours» check — exactly what was made —, the copy, the refusal); ④d the accessors' row test and the CLI candidates
//   ⑤ purity — the module reads no env, no fs, no clock
//   ⑥ mutant copies of src/home-verdict.js — each weakened rule turns named rows red
//   ⑦ THE WIRING, in real children — the import itself: a non-temp home (never made) is re-homed, hubs inherit it, one line,
//      a temp home / a helper left alone, the accessors refuse a name-alike; A1 on a MADE stand-in behind the seam (a child
//      and a grandchild started the house way find no stand-in CLI); B2's real-link scenes; D1's made home; seven imports
//      at once on an empty cache; planted folders never adopted; and nine mutant copies of scripts/scratch.mjs, each RED
//   ⑧ the gate sweep reaps a killed suite's home and a stale node folder by age
import { scratch } from './scratch.mjs';
import * as SM from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const HV = require(path.join(REPO, 'src/home-verdict.js'));

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (typeof name !== 'string') throw new TypeError(`ok(): the name must be a string (a swapped call?) — got ${typeof name}`);   // the swap guard (test-ci-gate-tiers §7b)
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); }
}
const TMP = ['/tmp', '/var/tmp'];
// the hosted runner's account home, BUILT: on the runner «runner» is a real account, and test-architecture §68 refuses a suite that
// spells a real account's /home/<name> (the hosted run 43700758043 died in the build on these two rows; this box has no such account)
const RUNNER_HOME = ['', 'home', 'runner'].join('/');

// THE STAND-IN TREE the pure rows walk (the module takes the walk's two primitives as arguments and stays pure): every name
// a folder unless listed; the handed /home/u is itself a LINK to /nfs/users/u
const H = '/home/u', HR = '/nfs/users/u', LONG = `/srv/${'n'.repeat(300)}`;
const TREE = {
  links: { '/home/u': HR, '/run/user/1/fnm_multishells/9': '/home/u/.local/share/fnm/v22/installation', '/opt/alias-of-home': '/home/u',
    '/opt/b1link': '/home/u/sub', '/opt/c1': '/opt/c2', '/opt/c2': '/home/u/.cfg', '/opt/loop': '/opt/loop', '/opt/rel-in': '../home/u/rel',
    '/opt/tools-link': '/usr/lib/tools', '/tmp/lnk-home': '/home/u', '/nfs/users/u/outlink': '/etc/x', '/nfs/users/u-link': '/nfs/users/u' },
  files: ['/etc/hostsfile'], errors: ['/srv/locked', LONG], missing: ['/nfs/users/u/sub/nothere', '/opt/nothere'],
};
const kindOf = (p) => (TREE.links[p] !== undefined ? 'link' : TREE.files.includes(p) ? 'file' : TREE.errors.includes(p) ? 'error' : TREE.missing.some((m) => p === m || p.startsWith(m + '/')) ? 'missing' : 'dir');
const RSof = (mod) => (p) => mod.walk(p, { kind: kindOf, readlink: (q) => TREE.links[q] });   // the walk of the module under test (a mutant copy's own)
const RS = RSof(HV);

console.log('— ① suiteRehome: a home under a temp root is left alone; any other home runs on its own — judged where it resolves');
const SUITE_ROWS = [
  ['a lane env home (under /var/tmp)', '/var/tmp/vibespace-lanes/lane-x/home', TMP, false, 'temp-home'],
  ['a scratch home a suite made (under /tmp)', '/tmp/vs-chat-home-123', TMP, false, 'temp-home'],
  ['a temp root itself as the home', '/tmp', TMP, false, 'temp-home'],
  ['a trailing slash on a temp home', '/tmp/vs-x-home/', TMP, false, 'temp-home'],
  ["a person's home", '/home/u', TMP, true, 'home'],
  ["the hosted runner's account home", RUNNER_HOME, TMP, true, 'home'],
  ['root as a home', '/root', TMP, true, 'home'],
  ['SEGMENT BOUNDARY: /tmpx/h is not under /tmp', '/tmpx/h', TMP, true, 'home'],
  ['item 1: a home UNDER the temp-directory variable is no temp home — the variable root holds it (only /tmp and /var/tmp make a temp home)', '/scratch/t/h', TMP, true, 'home', { varRoots: ['/scratch/t'] }],
  ['item 1: TMPDIR EQUAL to the handed home is no temp root', '/home/u', TMP, true, 'home', { varRoots: ['/home/u'] }],
  ['item 1: TMPDIR ABOVE the handed home is no temp root', '/home/u', TMP, true, 'home', { varRoots: ['/home'] }],
  ['item 1: a home SPELLED through a temp root (/tmp/../home/u) is judged where it resolves', '/tmp/../home/u', TMP, true, 'home'],
  ['item 1: a home that is a LINK under /tmp into /home/u is judged where it resolves', '/tmp/lnk-home', TMP, true, 'home', { resolve: 'tree' }],
  ['the seam: a home under VS_REHOME_NOT_TEMP is re-homed', '/var/tmp/x/notemp/home', TMP, true, 'home', { notTemp: ['/var/tmp/x/notemp'] }],
  ['the seam turns nothing OFF: a temp home outside it is left alone', '/var/tmp/lane/home', TMP, false, 'temp-home', { notTemp: ['/var/tmp/x/notemp'] }],
  ['no home at all', '', TMP, true, 'no-home'],
  ['a relative home', 'home/u', TMP, true, 'no-home'],
  ['no temp roots handed: every home is re-homed', '/var/tmp/x', [], true, 'home'],
];
const extraOf = (mod, extra) => (extra.resolve === 'tree' ? { ...extra, resolve: RSof(mod) } : extra);
const suiteTable = (mod) => SUITE_ROWS.map(([name, home, roots, rehome, why, extra = {}]) => { const v = mod.suiteRehome({ home, tmpRoots: roots, ...extraOf(mod, extra) }); return { name, good: v.rehome === rehome && v.why === why, v }; });
for (const r of suiteTable(HV)) ok(r.good, `suite: ${r.name}`, r.v);

console.log('— ② hubRehome (B-ba47 shape H, a POSITIVE SIGN): re-homed ⇔ the root is a LINKED WORKTREE AND the home would be re-homed AND no VIBESPACE_REAL_INSTALL=1');
const HUB_ROWS = [
  ["a linked worktree under /var/tmp handed a person's home", { root: '/var/tmp/vs-wt-1', home: '/home/u', linkedWorktree: true }, true, 'throwaway'],
  ['a linked worktree under /var/tmp handed the runner home', { root: '/var/tmp/x/wt', home: RUNNER_HOME, linkedWorktree: true }, true, 'throwaway'],
  ["a linked worktree ANYWHERE handed a person's home (~/vs-live)", { root: '/home/u/vs-live', home: '/home/u', linkedWorktree: true }, true, 'throwaway'],
  ['a linked worktree handed a TEMP home (a suite re-homed it already)', { root: '/var/tmp/vs-wt-1', home: '/var/tmp/vs-rehome-9', linkedWorktree: true }, false, 'temp-home'],
  ['a lane hub: a worktree, its home under /var/tmp', { root: '/var/tmp/vibespace-lanes/wt-a', home: '/var/tmp/vibespace-lanes/a/home', linkedWorktree: true }, false, 'temp-home'],
  ["a person's CLONE under /var/tmp, their own home (the readers' REACH-5)", { root: '/var/tmp/vs-clone', home: '/home/u' }, false, 'not-worktree'],
  ["the person's own install", { root: '/home/u/vibespace', home: '/home/u' }, false, 'not-worktree'],
  ['an install in /opt', { root: '/opt/vibespace', home: '/home/u' }, false, 'not-worktree'],
  ["a linked worktree with VIBESPACE_REAL_INSTALL=1 (the person's word)", { root: '/home/u/vs-live', home: '/home/u', linkedWorktree: true, override: true }, false, 'override'],
  ['no root', { root: '', home: '/home/u', linkedWorktree: true }, false, 'no-root'],
  ['the sign is git\'s FACT, never a truthy guess', { root: '/var/tmp/vs-wt-1', home: '/home/u', linkedWorktree: 'yes' }, false, 'not-worktree'],
  ['THE SEAM (r1412): a stand-in home in a folder the seam names (under a temp root) is re-homed like a person\'s', { root: '/var/tmp/vs-wt-1', home: '/var/tmp/seam/home', notTemp: ['/var/tmp/seam'], linkedWorktree: true }, true, 'throwaway'],
  ['…the seam never turns a re-home OFF (a person\'s home, the seam elsewhere)', { root: '/var/tmp/vs-wt-1', home: '/home/u', notTemp: ['/var/tmp/seam'], linkedWorktree: true }, true, 'throwaway'],
  ['…and never re-homes a CLONE, whatever it names', { root: '/var/tmp/vs-clone', home: '/var/tmp/seam/home', notTemp: ['/var/tmp/seam'] }, false, 'not-worktree'],
];
const hubTable = (mod) => HUB_ROWS.map(([name, a, rehome, why]) => { const v = mod.hubRehome({ tmpRoots: TMP, ...a }); return { name, good: v.rehome === rehome && v.why === why, v }; });
for (const r of hubTable(HV)) ok(r.good, `hub: ${r.name}`, r.v);
{ // PARITY — ONE verdict: for every home of ① (the seam is the suite's alone), a hub under /tmp is re-homed exactly when the suite verdict re-homes that home
  const rows = SUITE_ROWS.filter((r) => !(r[5] && r[5].notTemp));
  const off = rows.filter(([, home, roots, , , extra = {}]) => { const t = roots.length ? roots : ['/tmp']; return HV.hubRehome({ root: '/var/tmp/vs-wt-p', home, tmpRoots: t, linkedWorktree: true, ...extraOf(HV, extra) }).rehome !== HV.suiteRehome({ home, tmpRoots: t, ...extraOf(HV, extra) }).rehome; });
  ok(off.length === 0, `PARITY: hubRehome's home clause is suiteRehome on all ${rows.length} homes of ① (a linked worktree)`, off.map((r) => r[0]));
}

console.log('— ③ THE WALK: a path resolved as the kernel walks it (B1; a missing part walked ON), and THE THREE WAYS');
const WALK_ROWS = [
  ['a plain path', '/usr/bin/x', '/usr/bin/x'],
  ['the home is a link', '/home/u/.claude', '/nfs/users/u/.claude'],
  ['B1: a parent step after a link goes to the parent of what the link RESOLVED to', '/opt/b1link/../canary', '/nfs/users/u/canary'],
  ['a relative link is walked from its own folder', '/opt/rel-in/x', '/nfs/users/u/rel/x'],
  ['a chain of two links', '/opt/c1/y', '/nfs/users/u/.cfg/y'],
  ['a part that is not there is walked ON as if made, a parent step after it included', '/opt/b1link/nothere/../x', '/nfs/users/u/sub/x'],
  ['a missing folder, a parent step, then a link INTO the home: walked on, it lands in the home', '/opt/nothere/../b1link/x', '/nfs/users/u/sub/x'],
  ['COULD NOT LOOK: the 40-hop bound', '/opt/loop/x', null],
  ['COULD NOT LOOK: no permission', '/srv/locked/x', null],
  ['COULD NOT LOOK: a name too long', `${LONG}/x`, null],
  ['COULD NOT LOOK: a part that is a file, with more after it', '/etc/hostsfile/x', null],
  ['a file as the last part', '/etc/hostsfile', '/etc/hostsfile'],
  ['doubled slashes, dot segments and a trailing slash read as the kernel reads them', '/usr//./bin/', '/usr/bin'],
  ['.. at the root stays at the root', '/../usr', '/usr'],
];
const walkTable = (mod) => WALK_ROWS.map(([name, p, want]) => { const got = RSof(mod)(p); return { name: `walk: ${name}`, good: got === want, got }; });
for (const r of walkTable(HV)) ok(r.good, r.name, r.got);
ok(HV.noLinks('/a/b/../c') === '/a/c' && HV.cleanPath('/a//./b/../c/') === '/a/b/../c', "noLinks applies '..' to the spelled prefix (no file system); cleanPath folds no '..'");
// THE THREE WAYS (judgePath): not carried when ANY of them lands under the handed home (not under the checkout), or cannot look
const CO = '/home/u/work/repo';
const PATH_ROWS = [
  ['the home itself', H, false], ['a dir under it', H + '/.claude', false], ['the RESOLVED spelling (the home is a link)', HR + '/.claude', false],
  ['R1: a folder OUTSIDE the home that is a link INTO it', '/run/user/1/fnm_multishells/9/bin/claude', false],
  ['an alias the other way: a link elsewhere that resolves TO the home', '/opt/alias-of-home/.codex', false],
  ['B1: a link outside, a parent step, a name — the kernel lands in the home', '/opt/b1link/../canary', false],
  ['a missing folder, a parent step, then a link into the home (the kernel way, walked on)', '/opt/nothere/../b1link/x', false],
  ['a chain of two links into the home', '/opt/c1/y', false], ['a relative link into the home', '/opt/rel-in/x', false],
  ['a link whose LAST part leads into the home', '/opt/alias-of-home', false],
  ['THE KERNEL: parent steps that climb OUT of the home, then a link back IN from beside it (the fold and the parent stay outside)', '/opt/b1link/../../u-link', false],
  ['THE FOLD, walked through links: a folded path that is itself a link into the home (8b)', '/opt/tools-link/../../opt/alias-of-home', false],
  ['THE FOLD: a program folding parent steps first lands in the home (the kernel lands elsewhere)', '/opt/tools-link/../../home/u', false],
  ["THE PARENT: the last part a link OUT of the home, reached through a link INTO it — the folder a write lands in is the home's", '/opt/alias-of-home/outlink', false],
  ['COULD NOT LOOK: the 40-hop bound', '/opt/loop/x', false], ['COULD NOT LOOK: no permission', '/srv/locked/x', false],
  ['COULD NOT LOOK: a name too long', `${LONG}/x`, false], ['COULD NOT LOOK: a part that is a file', '/etc/hostsfile/x', false],
  ['SEGMENT BOUNDARY: /home/ux', '/home/ux/.claude', true], ['SEGMENT BOUNDARY: /home/u.bak', '/home/u.bak', true], ['a path that merely CONTAINS it', '/srv/home/u/x', true],
  ['XDG_RUNTIME_DIR-like', '/run/user/1000', true], ['a link elsewhere, outside the home, is carried', '/opt/tools-link/bin', true],
  ["amendment 5: a path under THE CHECKOUT's own root is the suite's own tree — carried though under the handed home", CO + '/shots', true, CO],
  ['amendment 5: …the rest under the handed home is not (the runner\'s temp folder beside the checkout)', '/home/u/work/_temp/x', false, CO],
];
const pathTable = (mod) => PATH_ROWS.map(([name, p, carried, co]) => { const why = mod.judgePath(p, mod.homeKeys([H], RSof(mod)), { resolve: RSof(mod), checkout: co ? mod.homeKeys([co], RSof(mod)) : [] }); return { name: `three ways: ${name}`, good: (why === null) === carried, why }; });
for (const r of pathTable(HV)) ok(r.good, r.name, r.why);
// THE SHAPES: a fit and a refusal per shape; a list carried WHOLE or not at all; a prefixed knob takes the first shape it fits
const SHAPE_ROWS = [
  ['word fits: a locale', 'LANG', 'C.UTF-8', true], ['word refuses a value with a slash', 'LANG', 'a/b', false, 'not a word'],
  ['zone fits: Area/City', 'TZ', 'Europe/Paris', true], ['zone refuses a parent step', 'TZ', '../../etc/x', false, 'not a zone'], ['zone refuses a path', 'TZ', '/etc/localtime', false, 'not a zone'],
  ['path fits: one absolute path outside the home', 'TMPDIR', '/var/tmp/x', true], ['path refuses a relative value', 'TMPDIR', 'rel/x', false, 'not a path'],
  ['path: under the home ⇒ not carried', 'SSL_CERT_FILE', '/home/u/certs.pem', false, 'under the handed home'],
  ['paths fits: a list outside the home', 'XDG_DATA_DIRS', '/usr/local/share:/usr/share', true],
  ['amendment 3: a list with ONE entry under the home is not carried WHOLE (no entry dropped from inside it)', 'XDG_DATA_DIRS', '/usr/share:/home/u/.local/share', false, 'an entry under the handed home'],
  ['paths refuses an empty entry', 'XDG_DATA_DIRS', '/usr/share::/x', false, 'not a paths'],
  ['7: a PATH value holding a colon is not one path (a list is never judged as one)', 'TMPDIR', '/var/tmp/a:/home/u/x', false, 'not a path'],
  ['7: a list under a prefix is judged PER ENTRY — one under the home, the whole knob not carried', 'VS_HV_L2', '/usr/x:/home/u/y', false, 'an entry under the handed home'],
  ['a prefixed knob: a word', 'VS_HV_W', 'plain-1', true], ['a prefixed knob: one path', 'VS_HV_P', '/usr/x', true], ['a prefixed knob: a list of paths', 'VS_HV_L', '/usr/x:/opt/y', true],
  ['amendment 6: a prefixed knob that fits NO shape is not carried, named «not a word, not a path»', 'VS_HV_T', '--flag=/usr/x', false, 'not a word, not a path'],
];
const shapeTable = (mod) => SHAPE_ROWS.map(([name, k, v, carried, why]) => { const r = mod.rehomeEnv({ [k]: v }, { oldHome: H, newHome: '/tmp/vs-rehome-s', resolve: RSof(mod) }); const n = r.notCarriedNames.find((x) => x.name === k); return { name: `shape: ${name}`, good: carried ? r.env[k] === v && !n : !(k in r.env) && !!n && (!why || n.why.startsWith(why)), n }; });
for (const r of shapeTable(HV)) ok(r.good, r.name, r.n);

console.log('— ④ rehomeEnv: THE ENVIRONMENT IS BUILT — named variables only (主开发 01:18Z / 01:23Z), PATH built');
const NODE_DIR = '/home/u/.nvm/versions/node/v22/bin';
const SYS = HV.SYSTEM_PATHS.linux.join(':');
const IN = Object.freeze({
  HOME: H, PATH: `/home/u/.local/bin:${NODE_DIR}:/run/user/1/fnm_multishells/9/bin:/usr/local/bin:/opt/tools/bin::rel/bin:/usr/bin:/bin`, CLAUDE_CONFIG_DIR: H + '/.claude-alt', CODEX_HOME: HR + '/.codex',
  XDG_CONFIG_HOME: H + '/.config', XDG_DATA_HOME: '/data/shared', XDG_RUNTIME_DIR: '/run/user/1000', XDG_DATA_DIRS: '/usr/local/share:/usr/share',
  NVM_DIR: H + '/.nvm', XAUTHORITY: H + '/.Xauthority', DISPLAY: ':0', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', SSH_AUTH_SOCK: '/tmp/ssh-x/agent',
  PWD: H + '/src', USER: 'u', LANG: 'C.UTF-8', ANTHROPIC_API_KEY: ['kept', 'by', 'value'].join('-'), https_proxy: 'http://proxy.invalid:3128',
  VIBESPACE_SESSION_TOKEN: ['caller', 'token'].join('-'), VIBESPACE_API: 'http://hub.invalid', VIBESPACE_CI_OAT: ['ci', 'oat'].join('-'), VIBESPACE_DEVICE_ROOT: '/srv/device-root', VIBESPACE_JOB_TOKEN: ['job', 'tok'].join('-'), VS_CLAUDE_BIN: '/opt/pin/claude', VS_CODEX_BIN: '/opt/pin/codex', VSX_HV: 'plain', VS_HV_SHOTS: '/tmp/shots', VS_HV_B1: '/opt/b1link/../canary', VS_HV_LOCKED: '/srv/locked/x', VS_HV_FLAG: '--log=/home/u/log.txt',
  OTHER_HOME: '/home/ux', CI: 'true', TZ: 'Europe/Paris', GITHUB_WORKSPACE: CO, RUNNER_TEMP: '/home/u/work/_temp',
});
const before = JSON.stringify(IN);
const envTable = (mod) => {
  const r = mod.rehomeEnv(IN, { oldHome: H, newHome: '/tmp/vs-rehome-7', platform: 'linux', resolve: RSof(mod), checkout: CO });
  const e = r.env, nc = Object.fromEntries(r.notCarriedNames.map((x) => [x.name, x.why]));
  return [
    ['HOME is the new home, PATH is BUILT', e.HOME === '/tmp/vs-rehome-7' && e.PATH === `/tmp/vs-rehome-7/.vs-bin:${SYS}` && r.binDir === '/tmp/vs-rehome-7/.vs-bin'],
    ['CARRIED, by name and shape: CI, GITHUB_WORKSPACE (the checkout), LANG, TZ, USER, VIBESPACE_CI_OAT (a named row of the product\'s prefix), VS_HV_SHOTS, XDG_DATA_DIRS — nothing else', JSON.stringify(r.carried) === JSON.stringify(['CI', 'GITHUB_WORKSPACE', 'LANG', 'TZ', 'USER', 'VIBESPACE_CI_OAT', 'VS_HV_SHOTS', 'XDG_DATA_DIRS'])],
    ["cure 2: the PRODUCT's own namespace is carried only by named rows — the caller's token and address, a job's token, a paired machine's device root: not rows", ['VIBESPACE_SESSION_TOKEN', 'VIBESPACE_API', 'VIBESPACE_JOB_TOKEN', 'VIBESPACE_DEVICE_ROOT'].every((k) => nc[k] === 'not a row')],
    // B-ba47's follow-up (主开发 r863 MUST 2): the three PROCESS MARKS are named rows — ids, no route, no credential — so a re-homed
    // suite's children still carry them and the person's Stop / a job's stop still find what they left behind
    ["the PROCESS MARKS are carried by name (CLAUDE_WEBUI_SESSION_ID, VIBESPACE_JOB_ID, VIBESPACE_JOB_RUN: src/conversation-env.js CONVERSATION_MARKS), the token beside them is not", (() => { const MK = { CLAUDE_WEBUI_SESSION_ID: 'sid-1', VIBESPACE_JOB_ID: 'jb-1', VIBESPACE_JOB_RUN: 'jb-1:1700000000000' }; const r2 = mod.rehomeEnv({ ...IN, ...MK }, { oldHome: H, newHome: '/tmp/vs-rehome-7', resolve: RSof(mod), checkout: CO }); return Object.entries(MK).every(([k, v]) => r2.env[k] === v && r2.carried.includes(k)) && !('VIBESPACE_SESSION_TOKEN' in r2.env); })()],
    ['cure 1: a PINNED agent CLI (VS_CLAUDE_BIN, VS_CODEX_BIN — the suites\' own pin form) is never carried', /PINNED agent CLI/.test(nc.VS_CLAUDE_BIN || '') && /PINNED agent CLI/.test(nc.VS_CODEX_BIN || '')],
    ["7: a name that only BEGINS like the suites' prefix (VSX_HV) is no row", nc.VSX_HV === 'not a row'],
    ['amendment 1: THE DESKTOP SESSION is not carried — DISPLAY, XAUTHORITY, DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR, SSH_AUTH_SOCK', ['DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'SSH_AUTH_SOCK'].every((k) => /DESKTOP SESSION/.test(nc[k] || ''))],
    ['amendment 2: a PROXY is not carried', /PROXY/.test(nc.https_proxy || '')],
    ["the person's agent CLIs, the XDG base folders, the caller's shell: CLAUDE_CONFIG_DIR, CODEX_HOME, NVM_DIR, ANTHROPIC_API_KEY, XDG_CONFIG_HOME, XDG_DATA_HOME, PWD — not carried", ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'NVM_DIR', 'ANTHROPIC_API_KEY', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'PWD'].every((k) => k in nc)],
    ['a name that is no row is not carried (OTHER_HOME)', nc.OTHER_HOME === 'not a row'],
    ["a prefixed path judged three ways: B1's parent step after a link — not carried; a path that could not be looked at — not carried", /under the handed home/.test(nc.VS_HV_B1 || '') && /could not look/.test(nc.VS_HV_LOCKED || '')],
    ['amendment 6: a prefixed knob of free text — not carried, «not a word, not a path»', nc.VS_HV_FLAG === 'not a word, not a path'],
    ["amendment 5: the runner's temp folder beside the checkout — not carried; the checkout itself — carried", /under the handed home/.test(nc.RUNNER_TEMP || '') && e.GITHUB_WORKSPACE === CO],
    ['…and what was not carried of PATH is NAMED, a home path in ~ form: ~/.local/bin, ~/.nvm/…, the fnm link by where it resolves, /opt/tools/bin, the empty and the relative entry',
      JSON.stringify(r.notCarried) === JSON.stringify(['~/.local/bin', '~/.nvm/versions/node/v22/bin', '~/.local/share/fnm/v22/installation/bin', '/opt/tools/bin', '(an empty entry)', '(relative: rel/bin)'])],
    ['the report holds NAMES, reasons and ~-form entries only — no account name, no value', !JSON.stringify({ d: r.notCarriedNames, n: r.notCarried }).includes(H) && !JSON.stringify(r.notCarried).includes(HR) && !JSON.stringify(r.notCarriedNames).includes('caller-token') && !JSON.stringify(r.notCarriedNames).includes('job-tok')],
    // B-ba47 B2 (主开发 2026-11-15 11:17Z item 3: «a suite's own planted names … reach its own children exactly as on master»):
    // THE STARTED ENV — only what the process was started with is judged; what it set itself is its own, kept as it is
    ['B2: a name the process set ITSELF (absent from the started env) is kept as it is — never judged; a handed name beside it is judged as before', (() => { const r2 = mod.rehomeEnv({ ...IN, HV_PLANTED: 'p-1', AWS_SECRET_ACCESS_KEY: 'p-2' }, { oldHome: H, newHome: '/tmp/vs-rehome-7', resolve: RSof(mod), checkout: CO, handed: IN }); return r2.env.HV_PLANTED === 'p-1' && r2.env.AWS_SECRET_ACCESS_KEY === 'p-2' && JSON.stringify(r2.own) === JSON.stringify(['AWS_SECRET_ACCESS_KEY', 'HV_PLANTED']) && r2.notCarriedNames.some((x) => x.name === 'VIBESPACE_SESSION_TOKEN') && JSON.stringify(r2.carried) === JSON.stringify(r.carried); })()],
    ['B2: a handed name the process CHANGED is its own (its new value kept); one it REMOVED stays removed', (() => { const e2 = { ...IN, SSH_AUTH_SOCK: '/tmp/vs-hv/agent.sock' }; delete e2.DISPLAY; const r2 = mod.rehomeEnv(e2, { oldHome: H, newHome: '/tmp/vs-rehome-7', resolve: RSof(mod), checkout: CO, handed: IN }); return r2.env.SSH_AUTH_SOCK === '/tmp/vs-hv/agent.sock' && r2.own.includes('SSH_AUTH_SOCK') && !('DISPLAY' in r2.env); })()],
    ['B2: its own PATH entries (not in the handed PATH) go IN FRONT of the built PATH; the handed ones are judged as before', (() => { const r2 = mod.rehomeEnv({ ...IN, PATH: '/opt/own/bin:' + IN.PATH }, { oldHome: H, newHome: '/tmp/vs-rehome-7', resolve: RSof(mod), checkout: CO, handed: IN }); return r2.env.PATH === `/opt/own/bin:/tmp/vs-rehome-7/.vs-bin:${SYS}` && JSON.stringify(r2.ownPath) === '["/opt/own/bin"]' && JSON.stringify(r2.notCarried) === JSON.stringify(r.notCarried); })()],
    ['B2: a started env EQUAL to the env holds nothing of its own — the same build as with none', (() => { const r2 = mod.rehomeEnv(IN, { oldHome: H, newHome: '/tmp/vs-rehome-7', resolve: RSof(mod), checkout: CO, handed: IN }); return JSON.stringify(r2.env) === JSON.stringify(e) && r2.own.length === 0 && r2.ownPath.length === 0; })()],
    ['B2: the started env NOT KNOWN (null: no /proc) — every name is judged, the rule before (a planted name is not carried)', (() => { const r2 = mod.rehomeEnv({ ...IN, HV_PLANTED: 'p-1' }, { oldHome: H, newHome: '/tmp/vs-rehome-7', resolve: RSof(mod), checkout: CO }); return !('HV_PLANTED' in r2.env) && r2.own.length === 0 && r2.notCarriedNames.some((x) => x.name === 'HV_PLANTED' && x.why === 'not a row'); })()],
    ['the input env is not mutated', JSON.stringify(IN) === before],
    ['macOS builds from its own fixed directories', mod.rehomeEnv({ PATH: '/usr/bin' }, { oldHome: H, newHome: '/tmp/vs-rehome-9', platform: 'darwin' }).env.PATH === `/tmp/vs-rehome-9/.vs-bin:${HV.SYSTEM_PATHS.darwin.join(':')}`],
    ['a new home that is not absolute is refused', (() => { try { mod.rehomeEnv({}, { oldHome: H, newHome: 'rel' }); return false; } catch { return true; } })()],
    ['the home is walked ONCE for the whole env (note 8: not once per variable)', (() => { let n = 0; const count = (p) => { if (p === H) n++; return RSof(mod)(p); }; mod.rehomeEnv(IN, { oldHome: H, newHome: '/tmp/vs-rehome-7', resolve: count }); return n === 1; })()],
  ].map(([name, good]) => ({ name: `env: ${name}`, good, nc }));
};
for (const r of envTable(HV)) ok(r.good, r.name, r.good ? undefined : r.nc);
ok(HV.ENV_ROWS.every((r) => r.why && r.why.length > 10 && (r.name || r.prefix) && (r.prefix ? r.shape === 'any' : HV.SHAPES[r.shape])) && HV.ENV_NOT.every((r) => r.name && r.why && r.tag) && !HV.ENV_ROWS.some((r) => r.name && HV.ENV_NOT.some((n) => n.name === r.name)),
  `the table: ${HV.ENV_ROWS.length} carried rows (each a name or a prefix, a shape and a reason) and ${HV.ENV_NOT.length} not-carried rows (each a reason and a tag for the line); no name in both`);

console.log('— ④b the tools a re-homed PATH reaches BY NAME — each row links only what RESOLVES to what it IS; never an agent CLI');
const binTable = (mod) => {
  const SHIM = '/home/u/.asdf/shims', NODE_REAL = '/home/u/.asdf/installs/nodejs/22/bin/node', NPMJS = '/home/u/.asdf/installs/nodejs/22/lib/node_modules/npm/bin/npm-cli.js';
  const have = new Set([`${SHIM}/npm`, `${SHIM}/node`, '/home/u/.asdf/installs/nodejs/22/bin/npm', '/home/u/.asdf/installs/nodejs/22/bin/npx', '/home/u/.local/bin/dtach', '/opt/ci/gh/bin/gh', '/usr/bin/gh', '/home/u/.local/bin/claude', '/home/u/.local/bin/gh']);
  const resolveNode = (p) => (p === `${SHIM}/node` ? NODE_REAL : p === '/home/u/.asdf/installs/nodejs/22/bin/npm' ? NPMJS : mod.noLinks(p));
  const L = mod.binLinks({ execPath: `${SHIM}/node`, handedPath: [`${SHIM}`, '/home/u/.local/bin', '/opt/ci/gh/bin', '/usr/bin'], home: H, exists: (f) => have.has(f), resolve: resolveNode, platform: 'linux' });
  const L2 = mod.binLinks({ execPath: '/usr/bin/node', handedPath: ['/usr/bin'], home: H, exists: (f) => f === '/usr/bin/dtach' || f === '/home/u/.local/bin/dtach', platform: 'linux' });
  const L3 = mod.binLinks({ execPath: '/usr/bin/node', handedPath: ['/home/u/.local/bin', '/usr/bin', '/opt/ci/gh/bin'], home: H, exists: (f) => f === '/home/u/.local/bin/gh' || f === '/usr/bin/gh' || f === '/opt/ci/gh/bin/gh', platform: 'linux' });
  const L4 = mod.binLinks({ execPath: '/usr/bin/node', handedPath: [], home: H, exists: (f) => f === '/home/u/.local/bin/dtach', resolve: (p) => (p === '/home/u/.local/bin/dtach' ? '/home/u/.local/lib/agent/claude' : mod.noLinks(p)), platform: 'linux' });
  const L4b = mod.binLinks({ execPath: '/usr/bin/node', handedPath: [], home: H, exists: (f) => f === '/home/u/.local/bin/dtach', resolve: (p) => (p === '/home/u/.local/bin/dtach' ? '/home/u/.local/share/claude/versions/2.1.3' : mod.noLinks(p)), platform: 'linux' });
  const L5 = mod.binLinks({ execPath: '/usr/bin/node', nodeInstall: '/opt/n/bin', handedPath: [], home: H, exists: (f) => f === '/opt/n/bin/npm', platform: 'linux' });
  return [
    ["binLinks: node → the executable RESOLVED; npm / npx → BESIDE it (npm resolving to its npm-cli.js), never the shim first on PATH (R3); dtach → the product's ~/.local/bin build; gh → the first copy that resolves OUTSIDE the home; claude never",
      JSON.stringify(L) === JSON.stringify([{ name: 'node', target: NODE_REAL }, { name: 'npm', target: '/home/u/.asdf/installs/nodejs/22/bin/npm' }, { name: 'npx', target: '/home/u/.asdf/installs/nodejs/22/bin/npx' }, { name: 'dtach', target: '/home/u/.local/bin/dtach' }, { name: 'gh', target: '/opt/ci/gh/bin/gh' }])],
    ['dtach is linked only when NO system directory has one', !L2.some((x) => x.name === 'dtach')],
    ["gh: the first copy outside the home is the system's — no link, never the home's copy and never a later one", !L3.some((x) => x.name === 'gh')],
    ['a row named for the session helper whose file RESOLVES to an agent CLI is not linked', !L4.some((x) => x.name === 'dtach')],
    ["(e) the «is what the row names» check ALONE: a helper-named link to an agent CLI's VERSIONED program file (no agent name in it) is not linked", !L4b.some((x) => x.name === 'dtach')],
    ['npm / npx come from the folder they were installed beside (nodeInstall), whatever node the suite now runs', JSON.stringify(L5.map((x) => x.target)) === JSON.stringify(['/usr/bin/node', '/opt/n/bin/npm'])],
  ].map(([name, good]) => ({ name: `bin: ${name}`, good }));
};
for (const r of binTable(HV)) ok(r.good, r.name);
ok(HV.TOOL_ROWS.every((r) => r.why.length > 20 && Array.isArray(r.is) && !HV.AGENT_CLIS.includes(r.name)) && (() => { try { HV.binLinks({ rows: [{ name: 'claude', from: 'self', why: 'x' }] }); return false; } catch { return true; } })(),
  `the rows (${HV.TOOL_ROWS.map((r) => r.name).join(', ')}) each carry a reason and what they ARE, and a row named like an agent CLI is REFUSED (${HV.AGENT_CLIS.length} names)`);
{ // THE PIN, in-process through the scratch module's own walk and linker
  const root = path.join(scratch('home-verdict-v1'), 'x'), home = path.join(root, 'home'), inst = path.join(home, '.mgr', 'installs', 'node', 'bin'), shims = path.join(home, '.mgr', 'shims'), nh = path.join(root, 'new');
  fs.mkdirSync(inst, { recursive: true }); fs.mkdirSync(shims, { recursive: true }); fs.mkdirSync(nh, { recursive: true });
  const STANDINS = ['node', 'npm', 'npx', 'claude', 'codex', 'opencode', 'agy'], CLIS = STANDINS.filter((n) => HV.AGENT_CLIS.includes(n));
  for (const n of STANDINS) fs.writeFileSync(path.join(inst, n), `#!/bin/sh\necho real-${n}\n`, { mode: 0o755 });
  for (const n of ['node', 'npm']) fs.writeFileSync(path.join(shims, n), `#!/bin/sh\necho shim-${n}\n`, { mode: 0o755 });
  const r = HV.rehomeEnv({ HOME: home, PATH: `${shims}:${inst}:/usr/bin:/bin` }, { oldHome: home, newHome: nh, platform: process.platform, resolve: SM.resolveFs });
  const linked = SM.linkTools(r.binDir, HV.binLinks({ execPath: path.join(inst, 'node'), handedPath: r.handedPath, home, exists: (f) => fs.existsSync(f), resolve: SM.resolveFs, platform: process.platform }));
  const which = (n) => r.env.PATH.split(':').map((d) => path.join(d, n)).find((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }) || null;
  ok(JSON.stringify(linked) === JSON.stringify(['node', 'npm', 'npx']) && fs.realpathSync(which('npm')) === path.join(inst, 'npm')
    && CLIS.length === 4 && CLIS.every((n) => which(n) === null || !fs.realpathSync(which(n)).startsWith(home)) && !r.env.PATH.split(':').some((d) => d.startsWith(home)),
    'THE PIN (in-process): after the re-home PATH holds nothing of the handed one; npm resolves BESIDE the real node (never the shim); the four agent CLIs resolve to none of it', { PATH: r.env.PATH, linked });
}

console.log("— ④c the suite's OWN node in pieces: «ours» without following a link and EXACTLY what was made, the COPY, the refusal");
{
  const UID = process.getuid();
  const st = (o) => ({ isDirectory: () => !!o.dir, isFile: () => !!o.file, uid: o.uid ?? UID, mode: o.mode ?? (o.dir ? 0o40700 : 0o100755), ino: o.ino ?? 7, size: o.size ?? 100, mtimeMs: o.mtimeMs ?? 5 });
  const D = '/c/vs-node-k', good = { [D]: st({ dir: true }), [`${D}/bin`]: st({ dir: true }), [`${D}/stamp.json`]: st({ file: true, mode: 0o100600 }), [`${D}/bin/node`]: st({ file: true }) };
  const stamp = JSON.stringify({ source: 'k', file: { ino: 7, size: 100, mtimeMs: 5 }, bin: ['node', 'npm'] });
  const look = (over = {}, s = stamp, ls = {}) => SM.oursNode(D, 'k', { lstat: (p) => { const m = { ...good, ...over }; if (!m[p]) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return m[p]; }, read: () => s, readdir: (d) => ({ [D]: ['stamp.json', 'bin'], [`${D}/bin`]: ['npm', 'node'], ...ls })[d] || [], uid: UID });
  const ROWS = [
    ['ours: a folder, our owner, 0700, the stamp agreeing with the file, holding EXACTLY what was made', look(), { file: `${D}/bin/node` }],
    ['not ours: another owner', look({ [D]: st({ dir: true, uid: UID + 1 }) }), null],
    ['not ours: mode 0755', look({ [D]: st({ dir: true, mode: 0o40755 }) }), null],
    ['not ours: a LINK at the name (judged by lstat, never followed)', look({ [D]: st({}) }), null],
    ['not ours: its bin a link', look({ [`${D}/bin`]: st({}) }), null],
    ['not ours: the file a link', look({ [`${D}/bin/node`]: st({}) }), null],
    ['not ours: the stamp names another source', look({}, JSON.stringify({ source: 'other', file: { ino: 7, size: 100, mtimeMs: 5 }, bin: ['node', 'npm'] })), null],
    ["not ours: the stamp disagrees with the file's own identity (inode)", look({ [`${D}/bin/node`]: st({ file: true, ino: 8 }) }), null],
    ['not ours: no stamp', look({ [`${D}/stamp.json`]: undefined }), null],
    ['(a) not ours: a program installed into its bin since (a global install from a re-homed child)', look({}, stamp, { [`${D}/bin`]: ['npm', 'node', 'claude'] }), null],
    ['(a) not ours: anything else in the folder', look({}, stamp, { [D]: ['stamp.json', 'bin', 'lib'] }), null],
  ];
  for (const [name, got, want] of ROWS) ok(JSON.stringify(got) === JSON.stringify(want), `ours: ${name}`, got);
  const calls = [];
  SM.placeNodeFile('/s', '/d', { copy: (a, b) => calls.push(['copy', a, b]) });
  ok(JSON.stringify(calls) === '[["copy","/s","/d"]]' && !/linkSync/.test(SM.placeNodeFile.toString()), 'must-fix 1: placeNodeFile COPIES (the clone flag), and never links — the person\'s own node file is left as it was');
  const k1 = SM.nodeKeyOf({ dev: 1, ino: 2, size: 3, mtimeMs: 4 });
  ok(/^[0-9a-f]{16}$/.test(k1) && k1 === SM.nodeKeyOf({ dev: 1, ino: 2, size: 3, mtimeMs: 4 }) && k1 !== SM.nodeKeyOf({ dev: 1, ino: 9, size: 3, mtimeMs: 4 }), "the node folder's key is the file's identity: the same file, the same key; another inode, another");
  const OC = path.join(scratch('hv-own-node'), 'cache'), SRC = path.join(path.dirname(OC), 'node-src');
  fs.mkdirSync(path.dirname(OC), { recursive: true }); fs.writeFileSync(SRC, 'x', { mode: 0o755 });
  const fakePlace = (a, b) => { fs.writeFileSync(b, 'x', { mode: 0o755 }); };
  const ref = SM.ownNode(SRC, path.dirname(SRC), { root: OC, place: fakePlace, run: () => ({ status: 1, stdout: '', stderr: 'needs its neighbours' }) });
  ok(ref && /does not run out of the home/.test(ref.refused || '') && fs.readdirSync(OC).length === 0, 'a node file that does not RUN where it now stands ⇒ REFUSED by name, nothing left at the cache', { ref, left: fs.readdirSync(OC) });
  const a = SM.ownNode(SRC, path.dirname(SRC), { root: OC, place: fakePlace, run: () => ({ status: 0, stdout: process.version + '\n' }) });
  const b = SM.ownNode(SRC, path.dirname(SRC), { root: OC, place: () => { throw new Error('a second make'); }, run: () => { throw new Error('a second run'); } });
  ok(a && a.file && a.file.startsWith(OC + '/vs-node-') && !a.own && b && b.file === a.file && fs.readdirSync(OC).length === 1, 'a node that runs is renamed into place once and REUSED by the next import (no second make, no second run)', { a, b, left: fs.readdirSync(OC) });
  const RO = path.join(path.dirname(OC), 'ro'); fs.mkdirSync(RO, { mode: 0o500 }); fs.chmodSync(RO, 0o500);
  const unw = SM.ownNode(SRC, path.dirname(SRC), { root: path.join(RO, 'cache'), place: fakePlace, run: () => ({ status: 0, stdout: process.version }) });
  fs.chmodSync(RO, 0o700);
  ok(unw && /its node cache cannot be made \(EACCES/.test(unw.refused || ''), '(d) a cache place that cannot be written ⇒ a named refusal, not a stack', unw);
  const OC5 = path.join(path.dirname(OC), 'cache5');
  const thr = SM.ownNode(SRC, path.dirname(SRC), { root: OC5, place: (a, b) => { fs.writeFileSync(b, 'half'); throw Object.assign(new Error('the disk is full'), { code: 'ENOSPC' }); }, run: () => ({ status: 0, stdout: process.version }) });
  ok(thr && /its node cache cannot be made \(ENOSPC/.test(thr.refused || '') && fs.readdirSync(OC5).length === 0, 'cure 5: a make that THROWS mid-copy is refused by name AND removes what it made (no half-made folder, no partial copy left)', { thr, left: fs.readdirSync(OC5) });
}

console.log("— ④d the accessors answer a row's FILE in this checkout (主开发 18:25Z item 2); the CLI candidates come from the HANDED env");
{
  const map = { '/r/scripts/test-fixture-isolation.mjs': '/r/scripts/test-fixture-isolation.mjs' };
  const rows = [{ suite: 'test-fixture-isolation.mjs' }];
  const asks = (me) => SM.isRowCaller(me, rows, { scriptsDir: '/r/scripts', resolve: (f) => map[f] || null });
  ok(asks('/r/scripts/test-fixture-isolation.mjs') && !asks('/elsewhere/test-fixture-isolation.mjs') && !asks('/r/scripts/test-other.mjs') && !asks(null),
    "a row's own file is answered; a file with its name in another folder, another file, or no main file is not");
  ok(JSON.stringify(SM.cliCandidatesOf('claude', { HOME: '/home/u', PATH: '/a::/b', VS_CLAUDE_BIN: '/x/claude' })) === JSON.stringify(['/x/claude', '/a/claude', '/b/claude', '/home/u/.local/bin/claude']),
    'the CLI candidates are read from the HANDED env: $VS_<CLI>_BIN, each handed PATH dir, the handed ~/.local/bin');
  ok(SM.NOT_REHOMED.map((r) => r.file).join() === 'ci.mjs,probe-claude-stdout.mjs,measure-tier3.mjs,ci-remote.mjs,measure-browser-windows.mjs,measure-dialog-hold.mjs,measure-held-enable.mjs,measure-hidden-window-cpu.mjs,measure-input-receipts.mjs,measure-navigation-loop.mjs,measure-shared-profile-freeze.mjs' && SM.NOT_REHOMED.every((r) => r.why.length > 40),
    '(f) the main files that run on the handed home ON PURPOSE are named rows, each with its reason: the tier runner, the real-CLI probe, the measure script that reads the person\'s browser install, and the seven by-hand browser measurements (cure 6: one family reason)');
}

console.log('— ⑤ purity');
const src = fs.readFileSync(path.join(REPO, 'src/home-verdict.js'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok([...code.matchAll(/\brequire\s*\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]).join() === './server-root.js,./conversation-env.js,./hub-env-knobs.json' && !/^\s*import\b|\bprocess\.|\bfs\.|\bos\.|Date\.now|new Date/m.test(code),
  'src/home-verdict.js requires ./server-root.js and ./conversation-env.js (both PURE: the process marks and the conversation names are the one list\u2019s) and the derived ./hub-env-knobs.json (data: the hub\u2019s own knobs, B-ba47 shape H) alone, and reads no env, fs, os or clock (PURE — the callers read the facts)');

console.log('— ⑥ mutant copies of src/home-verdict.js (a weakened rule must turn named rows red)');
const M = mutantCopies('home-verdict', REPO);
const all = (mod) => [...suiteTable(mod), ...hubTable(mod), ...walkTable(mod), ...pathTable(mod), ...shapeTable(mod), ...envTable(mod), ...binTable(mod)];
const CONTROLS = [
  { what: "the process marks not rows (主开发 r863 MUST 2: a re-homed suite would lose them)", needle: "  ...CONVERSATION_MARKS.map((n) => R(n, 'word', ", repl: "  ...[].map((n) => R(n, 'word', ", reds: ["env: the PROCESS MARKS are carried by name (CLAUDE_WEBUI_SESSION_ID, VIBESPACE_JOB_ID, VIBESPACE_JOB_RUN: src/conversation-env.js CONVERSATION_MARKS), the token beside them is not"] },
  { what: 'the far-side boundary cut', needle: "const underOne = (q, keys) => keys.some((h) => q === h || q.startsWith(h + '/'));", repl: 'const underOne = (q, keys) => keys.some((h) => q.startsWith(h));', reds: ['three ways: SEGMENT BOUNDARY: /home/ux', 'three ways: SEGMENT BOUNDARY: /home/u.bak'] },
  { what: 'WAY 1 cut: the kernel walk', needle: "['as the kernel walks it', k], ", repl: '', reds: ['three ways: THE KERNEL: parent steps that climb OUT of the home, then a link back IN from beside it (the fold and the parent stay outside)'] },
  { what: '8b cut: the fold not walked through links', needle: "['folded by spelling', resolve(noLinks(sp))], ", repl: "['folded by spelling', noLinks(sp)], ", reds: ['three ways: THE FOLD, walked through links: a folded path that is itself a link into the home (8b)'] },
  { what: '7: a path value may hold a colon', needle: "  path: (v) => isAbs(v) && !/[:\\n\\0]/.test(v),", repl: "  path: (v) => isAbs(v) && !/[\\n\\0]/.test(v),", reds: ['shape: 7: a PATH value holding a colon is not one path (a list is never judged as one)'] },
  { what: '7: a list under a prefix carried without its entries judged', needle: '    if (SHAPES.paths(v)) { for (const x of v.split', repl: '    if (SHAPES.paths(v)) return null; if (false) { for (const x of v.split', reds: ['shape: 7: a list under a prefix is judged PER ENTRY — one under the home, the whole knob not carried'] },
  { what: '7: the suites\' prefix widened', needle: "P('VS_', ", repl: "P('VS', ", reds: ['env: 7: a name that only BEGINS like the suites\' prefix (VSX_HV) is no row'] },
  { what: 'WAY 2 cut: the spelling fold', needle: "['folded by spelling', resolve(noLinks(sp))], ", repl: '', reds: ['three ways: THE FOLD: a program folding parent steps first lands in the home (the kernel lands elsewhere)'] },
  { what: 'WAY 3 cut: the parent folder', needle: "['its parent, as the kernel walks it', resolve(parent)], ['its parent, folded by spelling', resolve(noLinks(parent))]", repl: '', reds: ["three ways: THE PARENT: the last part a link OUT of the home, reached through a link INTO it — the folder a write lands in is the home's"] },
  { what: 'the walk STOPS at a missing part (the old shape)', needle: "    if (k === 'missing') { cur = next; continue; }", repl: "    if (k === 'missing') { let r = next; for (const x of queue) r = x === '..' ? parentOf(r) : joinOf(r, x); return r; }", reds: ['walk: a missing folder, a parent step, then a link INTO the home: walked on, it lands in the home'] },
  { what: 'the 40-hop bound answers a path, not «could not look»', needle: '      if (++hops > max) return null;', repl: '      if (++hops > max) return cur;', reds: ['walk: COULD NOT LOOK: the 40-hop bound', 'three ways: COULD NOT LOOK: the 40-hop bound'] },
  { what: 'a look that failed is walked on as a folder', needle: "    if (k === 'error' || (k === 'file' && queue.length) || (k !== 'dir' && k !== 'file')) return null;", repl: '', reds: ['three ways: COULD NOT LOOK: no permission', 'three ways: COULD NOT LOOK: a name too long', 'three ways: COULD NOT LOOK: a part that is a file'] },
  { what: "amendment 5 cut: the checkout's own tree not carried", needle: ' && !(checkout.length && underOne(lc(l), checkout))', repl: '', reds: ["three ways: amendment 5: a path under THE CHECKOUT's own root is the suite's own tree — carried though under the handed home"] },
  { what: 'ENV_NOT no longer outranks a prefix (a pinned CLI carried by the suites\' prefix)', needle: 'const no = notRow(k, not), row = no ? null : rowOf(k, rows);', repl: 'const no = null, row = rowOf(k, rows);', reds: ['env: cure 1: a PINNED agent CLI (VS_CLAUDE_BIN, VS_CODEX_BIN — the suites\' own pin form) is never carried'] },
  { what: '(e) the «is what the row names» check cut', needle: '(r.is || [r.name]).includes(baseOf(lands)) && ', repl: '', reds: ["bin: (e) the «is what the row names» check ALONE: a helper-named link to an agent CLI's VERSIONED program file (no agent name in it) is not linked"] },
  { what: 'item 1: the temp-directory variable counted even when it holds the home', needle: '...rootsOf(varRoots).map(at).filter((t) => !isUnder(h, t))', repl: '...rootsOf(varRoots).map(at)', reds: ['item 1: TMPDIR EQUAL to the handed home is no temp root', 'item 1: TMPDIR ABOVE the handed home is no temp root'] },
  { what: 'item 1: the home judged by its spelling', needle: '  const h = at(home);', repl: '  const h = cleanPath(home);', reds: ['item 1: a home SPELLED through a temp root (/tmp/../home/u) is judged where it resolves', 'item 1: a home that is a LINK under /tmp into /home/u is judged where it resolves'] },
  { what: 'hubRehome drops the seam (its notTemp never reaches the home\'s judgment)', needle: 'const s = suiteRehome({ home, tmpRoots, varRoots, notTemp, resolve });', repl: 'const s = suiteRehome({ home, tmpRoots, varRoots, resolve });', reds: ['THE SEAM (r1412): a stand-in home in a folder the seam names (under a temp root) is re-homed like a person\'s'] },   // stale-pins: kept — the mutant's REPLACEMENT spells the line without the seam on purpose
  { what: 'hubRehome takes a truthy sign for the worktree fact', needle: "if (linkedWorktree !== true) return { rehome: false, why: 'not-worktree' };", repl: "if (!linkedWorktree) return { rehome: false, why: 'not-worktree' };", reds: ['the sign is git\'s FACT, never a truthy guess'] },
  { what: 'B2: what the process set itself judged like a handed name', needle: '    if (isOwn(k, v)) { out[k] = v; own.push(k); continue; }   // the process set it itself: its own, never judged', repl: '', reds: ['env: B2: a name the process set ITSELF (absent from the started env) is kept as it is — never judged; a handed name beside it is judged as before', 'env: B2: a handed name the process CHANGED is its own (its new value kept); one it REMOVED stays removed'] },
  { what: "B2: its own PATH entries dropped", needle: "  out.PATH = [...ownPath, bin, ...sys].join(':');", repl: "  out.PATH = [bin, ...sys].join(':');", reds: ['env: B2: its own PATH entries (not in the handed PATH) go IN FRONT of the built PATH; the handed ones are judged as before'] },
];
for (const c of CONTROLS) {
  ok(src.split(c.needle).length === 2, `control "${c.what}": the needle is in the shipped source once (a stale control would prove nothing)`);
  const mod = M.load('src/home-verdict.js', SM.anchored(src, c.needle, c.repl, `control «${c.what}»`), c.what.replace(/\W+/g, '-').slice(0, 24));   // a gone needle throws by name
  const red = all(mod).filter((r) => !r.good).map((r) => r.name);
  ok(c.reds.every((n) => red.includes(n)), `control "${c.what}": the named rows go RED on the weakened copy (${red.length} red)`, red);
}
for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: CONTROLS.length })) ok(row.pass, row.name, row.detail);

console.log('— ⑦ the wiring, through the import itself, in real children started at once');
const DIR = scratch('home-verdict');
fs.mkdirSync(DIR, { recursive: true });
const STANDIN = `/nonexistent-vs-hv-${process.pid}`;   // outside every temp root and never made — nothing can land in it
const SCRATCH_URL = pathToFileURL(path.join(REPO, 'scripts/scratch.mjs')).href;
const PROBE = `import os from 'node:os'; import { spawnSync } from 'node:child_process';
const S = await import(${JSON.stringify(SCRATCH_URL)});
const kid = (o) => spawnSync(process.execPath, ['-e', 'process.stdout.write(require("os").homedir())'], { encoding: 'utf8', ...o }).stdout;
let allow; try { allow = S.handedCliCandidates('claude'); } catch (e) { allow = 'REFUSED'; }
let watch; try { watch = S.handedHome(); } catch (e) { watch = 'REFUSED'; }
const ownKid = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify([process.env.XDG_CONFIG_HOME ?? null, process.env.XDG_DATA_HOME ?? null, require("os").homedir()]))'], { encoding: 'utf8', env: { ...process.env, HOME: ${JSON.stringify(path.join(DIR, 'own-kid-home'))} } }).stdout;
console.log(JSON.stringify({ rehomed: S.REHOMED, home: os.homedir(), ownKid, spread: kid({ env: { ...process.env, PORT: '1' } }), inherit: kid({}), cfg: process.env.CLAUDE_CONFIG_DIR ?? null, path: process.env.PATH, allow, watch }));`;
// a child started the house way: PATH from the folder of the node it runs; it asks for the five agent CLIs, reports which of
// the not-carried families' names it SEES, and starts its own child the same way
const FAMILY = ['DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'SSH_AUTH_SOCK', 'https_proxy', 'VIBESPACE_SESSION_TOKEN', 'VIBESPACE_API', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_PASSWORD', 'VS_CLAUDE_BIN', 'XDG_CONFIG_HOME', 'PWD', 'NODE_OPTIONS', 'CLAUDE_CONFIG_DIR'];
const KID = path.join(DIR, 'kid.cjs');
fs.writeFileSync(KID, `const { spawnSync } = require('child_process'); const path = require('path');
const depth = Number(process.argv[2] || 0);
const env = { ...process.env, PATH: path.dirname(process.execPath) + ':' + process.env.PATH };
const found = spawnSync('sh', ['-c', 'for n in claude codex opencode agy gemini; do command -v "$n"; done; true'], { env, encoding: 'utf8' }).stdout.split('\\n').filter(Boolean);
const seen = ${JSON.stringify(FAMILY)}.filter((n) => process.env[n] !== undefined && !(n === 'PWD'));
let next = null;
if (depth < 1) { const g = spawnSync(process.execPath, [__filename, String(depth + 1)], { env, encoding: 'utf8' }); try { next = JSON.parse(g.stdout); } catch { next = { err: String(g.stderr).slice(0, 200) }; } }
process.stdout.write(JSON.stringify({ exec: process.execPath, found, seen, gpaths: require('module').globalPaths, next }));
`);
const A1_PROBE = (url) => `import fs from 'node:fs'; import Module from 'node:module'; import { spawnSync } from 'node:child_process'; import path from 'node:path';
const KIDS_ON = process.env.HV_KIDS === '1';   // read BEFORE the import: the built environment carries no such name
const S = await import(${JSON.stringify(url)});
const R = S.REHOMED;
let kid = null;
if (KIDS_ON) { const k = spawnSync(process.execPath, [${JSON.stringify(KID)}, '0'], { encoding: 'utf8', env: { ...process.env, PATH: path.dirname(process.execPath) + ':' + process.env.PATH } }); try { kid = JSON.parse(k.stdout); } catch { kid = { err: String(k.stderr).slice(0, 300) }; } }
let st = null; try { st = fs.statSync(R.home); } catch { }
console.log(JSON.stringify({ rehomed: R && { home: R.home, node: R.node, initPaths: R.initPaths, dropped: R.dropped, notCarried: R.notCarried, notCarriedNames: R.notCarriedNames, carried: R.carried, linked: R.linked, seam: R.seam }, compared: !!(R && R.compared && R.compared.startsWith('/')), npmPrefix: process.env.npm_config_prefix || null, pid: process.pid, homeMode: st && (st.mode & 0o777), hasRun: !!(R && fs.existsSync(path.join(R.home, '.vs-run.json'))), exec: process.execPath, argv0: process.argv[0], gpaths: Module.globalPaths, kid }));`;
// B-ba47 B2 — THE LATE LOAD (the second hosted run: test-agentd-remote planted its census names, THEN `import('./mutant-copy.mjs')`
// loaded this module): the suite's own code runs BEFORE its first load of the module — what it set must reach its own children
const PLANT_LATE = ['planted', 'late', String(process.pid)].join('-');
const LATE_PROBE = (url) => `import { spawnSync } from 'node:child_process';
process.env.HV_PLANTED_LATE = ${JSON.stringify(PLANT_LATE)};
process.env.CLAUDE_CONFIG_DIR = '/tmp/vs-hv-late-cfg';
process.env.PATH = '/opt/vs-hv-own/bin:' + process.env.PATH;
const S = await import(${JSON.stringify(url)});
const R = S.REHOMED;
const kid = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({ planted: process.env.HV_PLANTED_LATE ?? null, cfg: process.env.CLAUDE_CONFIG_DIR ?? null, noRow: process.env.HV_HANDED_NOROW ?? null, path: process.env.PATH, home: require("os").homedir() }))'], { encoding: 'utf8' }).stdout;
console.log(JSON.stringify({ home: R && R.home, own: R && R.own, ownPath: R && R.ownPath, kid }));`;
// THE RUNNER's DRIVER NAMES NEVER REACH A SCENE BY INHERITANCE (主开发 r4804, the 2.369.420 candidate's real-driver row 965): such a
// row hands THIS suite both driver names (its class asks), and a child started from the suite's own environment inherited them, so
// the «no name» scene was a NAMED world and the door rightly linked the row's driver. ONE base for every child that inherits: the
// suite's environment WITHOUT either name (`base`: the suite's own, or a planted one for the driver door's control). A scene that
// means a named driver or a named browsers folder sets its own (D2-D4, the browsers scenes); a clean start takes its env whole.
const DRIVER_VARS = Object.freeze([SM.DRIVER.env, SM.DRIVER.browsersEnv]);
const unnamed = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !DRIVER_VARS.includes(k)));
const start = (file, env, src, { exec = process.execPath, clean = false, cwd, base = process.env } = {}) => {
  if (src !== null) fs.writeFileSync(file, src);
  return new Promise((resolve) => {
    const c = spawn(exec, [file], { env: clean ? env : { ...unnamed(base), ...env }, timeout: 60000, ...(cwd ? { cwd } : {}) });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('error', (e) => resolve({ j: null, err: String(e), status: null, out }));
    c.on('close', (status) => { let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { } resolve({ j, err, status, out }); });
  });
};
const NODE_BIN = path.dirname(process.execPath);
const SECRETISH = ['cfg', 'value', String(process.pid)].join('-');
const handed = { HOME: STANDIN, CLAUDE_CONFIG_DIR: `${STANDIN}/.claude-${SECRETISH}`, PATH: `${STANDIN}/.local/bin:${NODE_BIN}:/usr/bin:/bin`, XDG_DATA_HOME: '/srv/shared-data' };
const LANE = path.join(DIR, 'lane-home');
// the made stand-ins live under /var/tmp, in the sweep's vs-hv- unit; each is a seam folder of its own. Their node is a LINK
// of a COPY of the running node this suite owns (the scratch module's own node cache) — never a link of a file it does not own
const BASE = fs.mkdtempSync('/var/tmp/vs-hv-');
process.on('exit', () => { try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { } });
const BASE_NODE = path.join(BASE, 'node');
const REAL_EXEC = fs.realpathSync(process.execPath);
const COPIED = SM.ownNode(REAL_EXEC, path.dirname(REAL_EXEC), { root: '/var/tmp' });
if (COPIED.file) fs.linkSync(COPIED.file, BASE_NODE); else { fs.copyFileSync(REAL_EXEC, BASE_NODE); fs.chmodSync(BASE_NODE, 0o755); }
const KEY = SM.nodeKeyOf(fs.statSync(BASE_NODE));
// a SMALL real node for the scenes that MAKE a node folder (a make copies the node: the system's 26 KB node, not 127 MB)
const SMALL_NODE = path.join(BASE, 'small-node');
(() => { try { const st = fs.statSync('/usr/bin/node'); if (st.size < 1e6) { fs.copyFileSync('/usr/bin/node', SMALL_NODE); fs.chmodSync(SMALL_NODE, 0o755); return; } } catch { } fs.linkSync(BASE_NODE, SMALL_NODE); })();
const KEY_SMALL = SM.nodeKeyOf(fs.statSync(SMALL_NODE));
const CLI5 = ['claude', 'codex', 'opencode', 'agy', 'gemini'];
// a stand-in: its node a link of the BIG copy with its node folder PRE-MADE (reused: nothing copied), or the SMALL one that
// makes its own
const standin = (tag, { small = false, premade = !small, own = false } = {}) => {
  const seam = path.join(BASE, tag), home = path.join(seam, 'home');
  for (const d of ['.nvm/bin', '.local/bin', 'sub', '.cfg', '.x']) fs.mkdirSync(path.join(home, d), { recursive: true });
  if (own) { fs.copyFileSync(SMALL_NODE, path.join(home, '.nvm/bin/node')); fs.chmodSync(path.join(home, '.nvm/bin/node'), 0o755); } else fs.linkSync(small ? SMALL_NODE : BASE_NODE, path.join(home, '.nvm/bin/node'));   // own: a file of its own (its link count is its own)
  for (const c of CLI5) for (const d of ['.nvm/bin', '.local/bin']) fs.writeFileSync(path.join(home, d, c), '#!/bin/sh\necho STANDIN\n', { mode: 0o755 });
  fs.symlinkSync(home, path.join(seam, 'homelink')); fs.symlinkSync(home, path.join(seam, 'intohome'));
  fs.symlinkSync(path.join(home, '.cfg'), path.join(seam, 'outlink'));
  fs.symlinkSync(path.join(seam, 'c2'), path.join(seam, 'c1')); fs.symlinkSync(path.join(home, '.x'), path.join(seam, 'c2'));
  fs.symlinkSync(path.join(home, 'sub'), path.join(seam, 'b1link'));
  fs.symlinkSync(path.join(seam, 'loop'), path.join(seam, 'loop'));
  fs.symlinkSync('/usr/share', path.join(seam, 'elsewhere')); fs.symlinkSync('/usr/share', path.join(home, 'outlink2'));
  const env = { PATH: `${home}/.local/bin:${home}/.nvm/bin:/opt/vs-hv-nowhere/bin:/usr/bin:/bin`, HOME: path.join(seam, 'homelink'), LANG: 'C.UTF-8', [SM.NOT_TEMP_ENV]: seam,
    VS_HV_OUTIN: `${seam}/outlink/x`, VS_HV_CHAIN: `${seam}/c1/y`, VS_HV_REAL: `${home}/.z`, VS_HV_B1: `${seam}/b1link/../canary`, VS_HV_NOLOOK: `${seam}/loop/x`,
    VS_HV_MISSLINK: `${seam}/nothere/../b1link/x`, VS_HV_FOLD: `${seam}/elsewhere/../home`, VS_HV_LASTLINK: `${seam}/intohome/outlink2`, VS_HV_KEEP: `${seam}/elsewhere/x`,
    DISPLAY: ':99', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/vs-hv-bus', XDG_RUNTIME_DIR: '/tmp/vs-hv-run', SSH_AUTH_SOCK: '/tmp/vs-hv-agent', https_proxy: 'http://proxy.invalid:9',
    VIBESPACE_SESSION_TOKEN: ['stand', 'in', 'token'].join('-'), VIBESPACE_API: 'http://hub.invalid', VIBESPACE_DEVICE_ROOT: '/srv/vs-hv-device', VIBESPACE_PASSWORD: ['stand', 'in', 'pw'].join('-'), VS_CLAUDE_BIN: `${home}/.nvm/bin/claude`, XDG_CONFIG_HOME: `${home}/.config`, NODE_OPTIONS: '--no-deprecation', CLAUDE_CONFIG_DIR: `${home}/.claude` };
  const key = own ? SM.nodeKeyOf(fs.statSync(path.join(home, '.nvm/bin/node'))) : small ? KEY_SMALL : KEY, s = { seam, home, node: path.join(home, '.nvm/bin/node'), env, key, small, cache: `${seam}.node-cache`, final: path.join(`${seam}.node-cache`, `vs-node-${SM.NODE_CACHE_FORM}-${key}`) };
  if (premade) { fs.mkdirSync(s.cache, { recursive: true, mode: 0o700 }); plantValid(s.final, s); }
  return s;
};
// a MUTANT copy of scripts/scratch.mjs: its own scripts folder, scratch-run.mjs and src linked from the checkout
const SCR_SRC = fs.readFileSync(path.join(REPO, 'scripts/scratch.mjs'), 'utf8');
const mutant = (tag, needle, repl) => {
  const d = path.join(DIR, 'mut', tag), sd = path.join(d, 'scripts');
  fs.mkdirSync(sd, { recursive: true });
  fs.symlinkSync(path.join(REPO, 'src'), path.join(d, 'src')); fs.symlinkSync(path.join(REPO, 'scripts/scratch-run.mjs'), path.join(sd, 'scratch-run.mjs'));
  fs.writeFileSync(path.join(sd, 'scratch.mjs'), SM.anchored(SCR_SRC, needle, repl, `mutant scratch.mjs «${tag}»`));   // a gone needle throws by name
  return { url: pathToFileURL(path.join(sd, 'scratch.mjs')).href, probe: path.join(sd, `test-hv-${tag}.mjs`), present: SCR_SRC.split(needle).length === 2 };
};
const runA1 = (s, url = SCRATCH_URL, file = path.join(DIR, `test-hv-a1-${path.basename(s.seam)}.mjs`), kids = true, o = {}) => start(file, { ...s.env, ...(kids ? { HV_KIDS: '1' } : {}), ...(o.env || {}) }, A1_PROBE(url), { exec: o.exec || s.node, clean: true, cwd: o.cwd });
// planted at the name before the child runs: a valid node folder made by hand, then broken one way each
function plantValid(dir, s) {
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
  fs.linkSync(s.small ? SMALL_NODE : BASE_NODE, path.join(dir, 'bin/node')); const f = fs.lstatSync(path.join(dir, 'bin/node'));
  fs.writeFileSync(path.join(dir, 'stamp.json'), JSON.stringify({ source: s.key, file: { ino: f.ino, size: f.size, mtimeMs: f.mtimeMs }, bin: ['node'] }));
}
const OLD = new Date(Date.UTC(2001, 0, 1));   // a FIXED instant: the touch is read against it, no clock read here
const plant = (s, how) => {
  fs.mkdirSync(s.cache, { recursive: true, mode: 0o700 });
  if (how === 'mode') { plantValid(s.final, s); fs.chmodSync(s.final, 0o755); }
  if (how === 'link') { const real = path.join(`${s.seam}.elsewhere`, path.basename(s.final)); fs.mkdirSync(path.dirname(real), { recursive: true }); plantValid(real, s); fs.symlinkSync(real, s.final); }
  if (how === 'stamp') { plantValid(s.final, s); const p = path.join(s.final, 'stamp.json'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(s.key, 'not-this-node')); }
  if (how === 'extra') { plantValid(s.final, s); fs.writeFileSync(path.join(s.final, 'bin', 'claude'), '#!/bin/sh\necho STANDIN\n', { mode: 0o755 }); }
  if (how === 'old') { fs.utimesSync(s.final, OLD, OLD); }
  if (how === 'oldform') { const o = path.join(s.cache, `vs-node-${s.key}`); fs.mkdirSync(path.join(o, 'bin'), { recursive: true, mode: 0o700 }); fs.chmodSync(o, 0o700); fs.linkSync(s.small ? SMALL_NODE : BASE_NODE, path.join(o, 'bin/node')); const f = fs.lstatSync(path.join(o, 'bin/node')); fs.writeFileSync(path.join(o, 'stamp.json'), JSON.stringify({ source: s.key, file: { ino: f.ino, size: f.size, mtimeMs: f.mtimeMs }, made: 'link' })); }   // round 3's form, at its unversioned name
  if (how === 'ro') { fs.chmodSync(s.cache, 0o500); }
  return s;
};
// (3) THE REFUSAL THROUGH THE IMPORT: a stand-in whose node FILE is a real node that cannot run outside its own folder — the
// system's node with its loader named by a path RELATIVE to the folder it runs from (the run-once runs from '/')
const ELF = (() => {   // written ONCE in the base folder; each stand-in links it (one file system)
  for (const src of ['/usr/bin/node', REAL_EXEC]) {
    try { const d = fs.readFileSync(src), a = Buffer.from('/lib64/ld-linux-x86-64.so.2'), b = Buffer.from('vsld/ld-linux-x86-64.so.2\0\0'); const i = d.indexOf(a); if (i < 0) continue; b.copy(d, i); const f = path.join(BASE, 'elfnode'); fs.writeFileSync(f, d, { mode: 0o755 }); return f; } catch { }
  }
  return null;
})();
const standinElf = (tag) => {
  const s = standin(tag, { small: true }); fs.rmSync(s.node); fs.linkSync(ELF, s.node); fs.symlinkSync('/lib64', path.join(path.dirname(s.node), 'vsld'));
  return s;
};
const HL_M6 = (() => {   // src/home-links.js with its walk cut to «by spelling»; its own require made absolute (the copy lives in the scratch dir)
  const f = path.join(DIR, 'mut', 'home-links-m6.cjs'); fs.mkdirSync(path.dirname(f), { recursive: true });
  const t0 = fs.readFileSync(path.join(REPO, 'src/home-links.js'), 'utf8');
  const t1 = SM.anchored(t0, "require('./home-verdict')", `require(${JSON.stringify(path.join(REPO, 'src/home-verdict.js'))})`, 'mutant home-links «m6» (its require)');
  fs.writeFileSync(f, SM.anchored(t1, "return (p) => HV.walk(String(p).startsWith('/') ? String(p) : `${process.cwd()}/${p}`, { kind, readlink });", 'return (p) => HV.noLinks(String(p));', 'mutant home-links «m6»'));
  return f;
})();
const MUT = {
  m1: mutant('m1', '  if (nodeUnder) {\n    node = ownNode(', '  if (false) {\n    node = ownNode('),
  m2: mutant('m2', '    if (initPaths) M._initPaths();', '    if (false) M._initPaths();'),
  m3: mutant('m3', ' || (d.mode & 0o777) !== 0o700', ''),
  m4: mutant('m4', "const d = lstat(dir), b = lstat(path.join(dir, 'bin'))", "const d = fs.statSync(dir), b = fs.statSync(path.join(dir, 'bin'))"),
  m5: mutant('m5', 'if (st.source !== key || !st.file || st.file.ino !== f.ino || st.file.size !== f.size || st.file.mtimeMs !== f.mtimeMs) return null;', ''),
  // m6: the walk lives in src/home-links.js (shared with the hub's boot, B-ba47 shape H) — the mutant scratch.mjs requires a mutated COPY of it
  m6: mutant('m6', "const HL = require('../src/home-links.js');", `const HL = require(${JSON.stringify(HL_M6)});`),
  m7: mutant('m7', "  const home = endScratchAtExit(fs.mkdtempSync(path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}rehome-`)));\n  fs.chmodSync(home, 0o700);", "  const home = endScratchAtExit(path.join(TMP_ROOTS[0], `${FIXTURE_CWD_PREFIX}rehome-${process.pid}`)); fs.mkdirSync(home, { recursive: true });\n  fs.chmodSync(home, 0o777);"),
  m8: mutant('m8', '  fs.chmodSync(home, 0o700);', '  fs.chmodSync(home, 0o755);'),
  m9: mutant('m9', "${notCarried.length ? ` — not carried: ${notCarried.join(', ')}` : ''}", "${notCarried.length ? ` — not carried: ${[...notCarried.slice(1), '/never-handed'].join(', ')}` : ''}"),
  m10: mutant('m10', '    if (node.refused) refuse(', '    if (node.refused) node = null; else if (false) refuse('),
  m11: mutant('m11', '  const ran = run(file);', '  const ran = { status: 0, stdout: process.version };'),
  m12: mutant('m12', '  if (have) { touch(final); return', '  if (have) { return'),
  m13: mutant('m13', '  if (!r || !HV.tempRootOf(r, roots)) return null;', '  if (!r) return null;'),
  m14: mutant('m14', "return h && h.startsWith('/') ? h : os.userInfo()" + '.homedir;', 'return h;'),   // the needle split: §68 reads no passwd home in a suite
  m15: mutant('m15', "  env.npm_config_prefix = path.join(home, '.npm-global');", ''),
  m17: mutant('m17', '  return /^(?:test|dbg)-[A-Za-z0-9._-]+\\.mjs$/.test(base) || inScripts;', '  return /^(?:test|dbg)-[A-Za-z0-9._-]+\\.mjs$/.test(base);'),
  m18: mutant('m18', "  if (inScripts && NOT_REHOMED.some((r) => { try { return fs.realpathSync(path.join(dirReal, r.file)) === ME; } catch { return false; } })) return false;", "  if (inScripts && NOT_REHOMED.some((r) => r.file === base)) return false;"),
  m19: mutant('m19', ', handed: STARTED_ENV });', ' });'),
  m16: mutant('m16', "    if (JSON.stringify([...readdir(dir)].sort()) !== '[\"bin\",\"stamp.json\"]' || JSON.stringify([...readdir(path.join(dir, 'bin'))].sort()) !== JSON.stringify([...(st.bin || [])].sort())) return null;\n", ''),
};
const SA = standin('a1'), S7 = standin('seven', { small: true, own: true }), PM = plant(standin('pmode', { small: true }), 'mode'), PL = plant(standin('plink', { small: true }), 'link'), PS = plant(standin('pstamp', { small: true }), 'stamp'), PX = plant(standin('pextra', { small: true }), 'extra'), PO = plant(standin('pold'), 'old'), PR = plant(standin('pro', { small: true, premade: false }), 'ro');
const S7_NODE_BEFORE = (() => { const st = fs.statSync(S7.node); return { nlink: st.nlink, ctimeMs: st.ctimeMs }; })();
const SE = ELF ? standinElf('elf') : null;
const PF = plant(standin('poldform', { small: true, premade: false }), 'oldform');
// 7a + 8a: an UNMUTATED copy of the module in a tree of its own: a main file of its scripts/ that is no suite re-homes; a FILE
// that is a NOT_REHOMED row does not; a LINK named like a row, leading to one of its suites, is not the row and re-homes
const TREE_PLAIN = mutant('plain', 'export const NOT_REHOMED', 'export const NOT_REHOMED');
const plainDir = path.dirname(TREE_PLAIN.probe);
const viaLink = (tree, tag) => { const d = path.join(DIR, `lnk-${tag}`); fs.mkdirSync(d, { recursive: true }); const real = path.join(path.dirname(tree.probe), `test-hv-real-${tag}.mjs`); fs.writeFileSync(real, PROBE.replace(JSON.stringify(SCRATCH_URL), JSON.stringify(tree.url))); fs.symlinkSync(real, path.join(d, 'ci.mjs')); return path.join(d, 'ci.mjs'); };
const SMUT = Object.fromEntries(Object.keys(MUT).filter((k) => !['m10', 'm11', 'm13', 'm14', 'm17', 'm18', 'm19'].includes(k)).map((k) => [k, ({ m3: () => plant(standin(k, { small: true }), 'mode'), m4: () => plant(standin(k, { small: true }), 'link'), m5: () => plant(standin(k, { small: true }), 'stamp'), m12: () => plant(standin(k), 'old'), m16: () => plant(standin(k, { small: true }), 'extra') }[k] || (() => standin(k)))()]));
const SMUT_ELF = ELF ? Object.fromEntries(['m10', 'm11'].map((k) => [k, standinElf(`${k}e`)])) : {};
const elfRun = (s, url, file) => runA1(s, url, file, false, { cwd: path.dirname(s.node) });
const KIDS = {
  suite: start(path.join(DIR, 'test-hv-suite.mjs'), handed, PROBE),
  dbg: start(path.join(DIR, 'dbg-hv-probe.mjs'), handed, PROBE),
  lane: start(path.join(DIR, 'test-hv-lane.mjs'), { HOME: LANE, PATH: `${NODE_BIN}:/usr/bin:/bin` }, PROBE),
  helper: start(path.join(DIR, 'hv-helper.mjs'), handed, PROBE),
  steer: start(path.join(DIR, 'test-claude-steer-chrome.mjs'), { ...handed, VS_CLAUDE_BIN: `${STANDIN}/bin/claude` }, PROBE),
  watcher: start(path.join(DIR, 'test-fixture-isolation.mjs'), handed, PROBE),
  linked: (() => { const d = path.join(DIR, 'lnk'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(DIR, 'hv-target.mjs'), PROBE); fs.symlinkSync(path.join(DIR, 'hv-target.mjs'), path.join(d, 'test-claude-retention.mjs')); return start(path.join(d, 'test-claude-retention.mjs'), handed, null); })(),
  seamOut: start(path.join(DIR, 'test-hv-seamout.mjs'), { ...handed, [SM.NOT_TEMP_ENV]: `${STANDIN}-seam` }, PROBE),
  seamRoot: start(path.join(DIR, 'test-hv-seamroot.mjs'), { ...handed, [SM.NOT_TEMP_ENV]: '/tmp' }, PROBE),
  emptyHome: start(path.join(DIR, 'test-hv-emptyhome.mjs'), { HOME: '', PATH: '/usr/bin:/bin' }, A1_PROBE(SCRATCH_URL), { clean: true }),
  late: start(path.join(DIR, 'test-hv-late.mjs'), { ...handed, HV_HANDED_NOROW: 'handed-no-row' }, LATE_PROBE(SCRATCH_URL)),
  a1: runA1(SA),
  seven: Array.from({ length: 7 }, (_, i) => runA1(S7, SCRATCH_URL, path.join(DIR, `test-hv-seven-${i}.mjs`), false)),
  pmode: runA1(PM, SCRATCH_URL, path.join(DIR, 'test-hv-pmode.mjs'), false),
  plink: runA1(PL, SCRATCH_URL, path.join(DIR, 'test-hv-plink.mjs'), false),
  pstamp: runA1(PS, SCRATCH_URL, path.join(DIR, 'test-hv-pstamp.mjs'), false),
  pextra: runA1(PX, SCRATCH_URL, path.join(DIR, 'test-hv-pextra.mjs'), false),
  pold: runA1(PO, SCRATCH_URL, path.join(DIR, 'test-hv-pold.mjs'), false),
  pro: runA1(PR, SCRATCH_URL, path.join(DIR, 'test-hv-pro.mjs'), false),
  elf: SE ? elfRun(SE, SCRATCH_URL, path.join(DIR, 'test-hv-elf.mjs')) : Promise.resolve(null),
  oldform: runA1(PF, SCRATCH_URL, path.join(DIR, 'test-hv-oldform.mjs'), false),
  plainMain: start(path.join(plainDir, 'hv-plain.mjs'), handed, PROBE.replace(JSON.stringify(SCRATCH_URL), JSON.stringify(TREE_PLAIN.url))),
  plainRow: start(path.join(plainDir, 'ci.mjs'), handed, PROBE.replace(JSON.stringify(SCRATCH_URL), JSON.stringify(TREE_PLAIN.url))),
  plainLink: start(viaLink(TREE_PLAIN, 'plain'), handed, null),
  mut: Object.fromEntries(Object.entries(MUT).map(([k, m]) => [k,
    k === 'm13' ? start(m.probe, { ...handed, [SM.NOT_TEMP_ENV]: `${STANDIN}-seam` }, PROBE.replace(JSON.stringify(SCRATCH_URL), JSON.stringify(m.url)))
      : k === 'm14' ? start(m.probe, { HOME: '', PATH: '/usr/bin:/bin' }, A1_PROBE(m.url), { clean: true })
        : k === 'm17' ? start(path.join(path.dirname(m.probe), 'hv-plain.mjs'), handed, PROBE.replace(JSON.stringify(SCRATCH_URL), JSON.stringify(m.url)))
          : k === 'm18' ? start(viaLink(m, 'm18'), handed, null)
          : k === 'm19' ? start(path.join(path.dirname(m.probe), 'test-hv-late-m19.mjs'), { ...handed, HV_HANDED_NOROW: 'handed-no-row' }, LATE_PROBE(m.url))
            : ['m10', 'm11'].includes(k) ? (SMUT_ELF[k] ? elfRun(SMUT_ELF[k], m.url, m.probe) : Promise.resolve(null)) : runA1(SMUT[k], m.url, m.probe, ['m1', 'm2', 'm15'].includes(k))])),
};
const SYSDIRS = HV.SYSTEM_PATHS[process.platform === 'darwin' ? 'darwin' : 'linux'];
const lineOf = (err) => String(err).split('\n').find((l) => l.startsWith('[scratch] ')) || '';
{
  const r = await KIDS.suite;
  const h = r.j && r.j.rehomed && r.j.rehomed.home;
  ok(r.status === 0 && /^\/tmp\/vs-rehome-[A-Za-z0-9]{6}$/.test(h || '') && r.j.home === h, 'a SUITE handed a non-temp home runs on a FRESH /tmp/vs-rehome-XXXXXX — made by the unique-name call, never a fixed name', r.j || r.err);
  ok(r.j && r.j.spread === h && r.j.inherit === h, "the hubs it starts get that home — an env spread from the process's, and an inherited env", r.j);
  ok(r.j && r.j.ownKid === JSON.stringify([null, null, path.join(DIR, 'own-kid-home')]), 'a hub that names its OWN home (a scratch home) gets no XDG base dir from the suite — its XDG follow its own HOME, as on a lane', r.j && r.j.ownKid);
  ok(r.j && r.j.cfg === null && r.j.path === `${h}/.vs-bin:${SYSDIRS.join(':')}`, "a value naming the handed home is gone; PATH is BUILT — its own .vs-bin + the system's fixed directories, nothing of the handed PATH", r.j);
  const line = lineOf(r.err), lines = r.err.split('\n').filter((l) => l.startsWith('[scratch] '));
  const nc = (line.match(/ — not carried: (.*?); a tool missing there/) || [])[1];
  const wantNC = ['~/.local/bin', ...(SYSDIRS.includes(NODE_BIN) ? [] : [NODE_BIN])];
  ok(lines.length === 1 && /handed a home outside every temp root — it runs on its own \(\/tmp\/vs-rehome-\w{6}\): HOME there; the environment is BUILT: \d+ names? carried, \d+ not carried — .*CLAUDE_CONFIG_DIR[^;]*\(the person's agent CLIs\).*XDG_DATA_HOME[^;]*\(an XDG base folder\).* — one a suite needs: add it to src\/home-verdict\.js ENV_ROWS with its shape, or run through the lane's environment; PATH is its own: \/tmp\/vs-rehome-\w{6}\/\.vs-bin \([^)]*\) \+ the system's directories — not carried: .*; a tool missing there: install it in a system directory, or add a named row to src\/home-verdict\.js TOOL_ROWS \(a real agent CLI: scripts\/scratch\.mjs REAL_CLI_ALLOW\)$/.test(line),
    "ONE stderr line says it: what was carried, every name NOT carried with its reason, the door for one a suite needs, PATH's own tools and what of it was not carried, the two doors for a missing tool", lines);
  ok(nc === wantNC.join(', '), `item 4: the line's PATH «not carried» names are EXACTLY the handed entries outside the system dirs (${wantNC.length}), in ~ form under the home`, { nc, wantNC });
  ok(!r.err.includes(SECRETISH) && !r.err.includes(STANDIN), 'the line carries no value — neither a dropped one nor the handed home', r.err.slice(0, 400));
  ok(h && !fs.existsSync(h), 'its own home is removed when it exits');
  ok(r.j && r.j.allow === 'REFUSED' && r.j.watch === 'REFUSED', "the real-CLI allow list and the watchers' accessor both refuse a suite that is not their row");
}
{ const r = await KIDS.dbg; ok(r.j && r.j.rehomed && r.j.home.startsWith('/tmp/vs-rehome-'), 'a DEBUG script (dbg-*.mjs — run by hand from a real shell) is re-homed the same way', r.j || r.err); }
{ const r = await KIDS.lane; ok(r.j && r.j.rehomed === null && r.j.home === LANE && r.j.spread === LANE && !r.err.includes('[scratch] '), 'a suite handed a home under a temp root (the lane env) is left alone, and silent', r.j || r.err); }
{ const r = await KIDS.helper; ok(r.j && r.j.rehomed === null && r.j.home === STANDIN, "a module outside this checkout's scripts folder and not named test- / dbg- (a helper) is left alone", r.j || r.err); }
{ // C1 (主开发 18:25Z item 2): the accessors answer a row's FILE in this checkout — a file with a row's name elsewhere, and a link named after one, are refused
  const s = await KIDS.steer, w = await KIDS.watcher, l = await KIDS.linked;
  ok(s.j && s.j.allow === 'REFUSED' && s.j.rehomed, "item 2: a file with the steer row's NAME in another folder gets no real-CLI candidates", s.j || s.err);
  ok(w.j && w.j.watch === 'REFUSED', "item 2: a file with a watcher's NAME in another folder does not get the handed home", w.j || w.err);
  ok(l.j && l.j.watch === 'REFUSED', 'item 2: a LINK named after a watcher, leading to another file, does not get the handed home', l.j || l.err);
}
{ // (e) the seam IGNORES a value outside every temp root; (d) the seam set to a temp root ITSELF is a named refusal
  const o = await KIDS.seamOut, t = await KIDS.seamRoot;
  ok(o.status === 0 && o.j && o.j.rehomed && o.j.rehomed.seam === null && !/the seam/.test(lineOf(o.err)), '(e) the seam IGNORES a value outside every temp root (no seam, no node cache beside it)', o.j && o.j.rehomed);
  ok(t.status === 1 && /the seam VS_REHOME_NOT_TEMP names a temp root itself \(\/tmp\) — it may name only a folder a suite made under one — it REFUSES to run there/.test(t.err), '(d) the seam set to a temp root ITSELF ⇒ a named refusal with the door (exit 1), not a stack', { status: t.status, err: t.err.slice(0, 300) });
}
{ // (b) a handed home that is EMPTY: the account entry's home is the home compared
  const r = await KIDS.emptyHome;
  ok(r.j && r.j.rehomed && r.j.compared === true, '(b) a handed HOME that is empty ⇒ the process re-homes, comparing against the account entry\'s home (an absolute path), never against nothing', r.j && { rehomed: !!r.j.rehomed, compared: r.j.compared });
}
const legsLate = (r) => {
  const j = r && r.j, k = (() => { try { return JSON.parse(j.kid); } catch { return null; } })(), line = r ? lineOf(r.err) : '';
  return [
    { name: 'B2 THE LATE LOAD: a name the suite planted BEFORE its first load of the module reaches its own child', good: !!k && k.planted === PLANT_LATE },
    { name: 'B2 THE LATE LOAD: a handed name it CHANGED reaches its child with the new value; one it left is judged as before (not carried)', good: !!k && k.cfg === '/tmp/vs-hv-late-cfg' && k.noRow === null },
    { name: 'B2 THE LATE LOAD: its own PATH entry goes in front of the built PATH', good: !!k && !!j.home && k.path === `/opt/vs-hv-own/bin:${j.home}/.vs-bin:${SYSDIRS.join(':')}` },
    { name: 'B2 THE LATE LOAD: the one line says it was loaded after its own code ran and names what it kept — names, never a value', good: /LOADED AFTER ITS OWN CODE RAN — what it set itself is kept as it is: CLAUDE_CONFIG_DIR, HV_PLANTED_LATE, 1 PATH entry of its own \(in front\)/.test(line) && !String(r && r.err).includes(PLANT_LATE) },
    { name: 'B2 THE LATE LOAD: it is still re-homed — the child\'s home is the made one', good: !!k && !!j.home && k.home === j.home && /^\/tmp\/vs-rehome-/.test(j.home) },
  ];
};
{ const r = await KIDS.late; for (const l of legsLate(r)) ok(l.good, l.name, l.good ? undefined : (r.j || r.err.slice(0, 400))); }
ok(!fs.existsSync(STANDIN), 'the handed stand-in home was never made by anything above');
const under = (p, s) => typeof p === 'string' && (p === s.home || p.startsWith(s.home + '/') || p.startsWith(path.join(s.seam, 'homelink') + '/'));
// a STAND-IN is what the leg planted (under the handed home, beside its node); a CLI in one of the system's own folders the
// built PATH keeps (/usr/local/bin …) is the machine's install — «a system-wide install is the hub resolver's to find»
const standIns = (list) => (Array.isArray(list) ? list : []).filter((p) => !SYSDIRS.includes(path.dirname(p)));
const legsA1 = (j, s) => {
  const R = (j && j.rehomed) || {}, n = R.node || {}, k = (j && j.kid) || {}, g = k.next || {};
  return [
    ['A1: the suite runs on its OWN node, out of the home — a COPY (execPath and argv[0] moved to it)', !!R.node && n.file === j.exec && j.argv0 === j.exec && !under(j.exec, s)],
    ['A1: the module folders were re-read (Module._initPaths) — RED BY NAME if this node has none', R.initPaths === true],
    ['A1: the CJS global folders name nothing under the handed home', Array.isArray(j && j.gpaths) && j.gpaths.length > 0 && j.gpaths.every((p) => !under(p, s))],
    ['A1: a CHILD started the house way (PATH from its node) finds no stand-in CLI and runs outside the home', Array.isArray(k.found) && standIns(k.found).length === 0 && typeof k.exec === 'string' && !under(k.exec, s) && (k.gpaths || []).every((p) => !under(p, s))],
    ['A1: …and its GRANDCHILD, started the same way, the same', Array.isArray(g.found) && standIns(g.found).length === 0 && typeof g.exec === 'string' && !under(g.exec, s)],
    ['(a) npm\'s global folder is the re-homed home\'s own (it dies with the run)', !!R.home && j.npmPrefix === path.join(R.home, '.npm-global')],
  ].map(([name, good]) => ({ name, good }));
};
const legsFamilies = (j) => { const k = (j && j.kid) || {}, g = k.next || {}; return [
  ['a NOT-carried family each — the desktop session (DISPLAY, the bus, the runtime folder, the ssh agent), a proxy, the product\'s own names (the caller\'s token and address, a device root, a password), a PINNED agent CLI, an XDG base folder, free text, the agent CLIs\' folders: a CHILD of the re-homed suite sees none of them', Array.isArray(k.seen) && k.seen.length === 0],
  ['…nor its grandchild', Array.isArray(g.seen) && g.seen.length === 0],
].map(([name, good]) => ({ name, good })); };
const legsB2 = (j) => { const d = (j && j.rehomed && j.rehomed.dropped) || [], c = (j && j.rehomed && j.rehomed.carried) || []; return [
  ['B2 through the import: a link outside the home INTO it — not carried', d.includes('VS_HV_OUTIN')],
  ['B2 through the import: a chain of two links into the home — not carried', d.includes('VS_HV_CHAIN')],
  ['B2 through the import: the home handed through a LINK, a value naming its real path — not carried', d.includes('VS_HV_REAL')],
  ["B2 through the import: B1's parent step after a link — not carried", d.includes('VS_HV_B1')],
  ['B2 through the import: a path the walk could not look at (a loop) — not carried', d.includes('VS_HV_NOLOOK')],
  ['THE KERNEL WAY through the import: a missing folder, a parent step, then a link into the home — not carried', d.includes('VS_HV_MISSLINK')],
  ['THE FOLD through the import: a value a program folds into the home — not carried', d.includes('VS_HV_FOLD')],
  ["THE PARENT through the import: the last part a link out of the home, reached through a link into it — not carried", d.includes('VS_HV_LASTLINK')],
  ['B2 through the import: a link elsewhere, outside the home — CARRIED', c.includes('VS_HV_KEEP') && !d.includes('VS_HV_KEEP')],
].map(([name, good]) => ({ name, good })); };
const legsD1 = (j) => { const h = (j && j.rehomed && j.rehomed.home) || '', b = path.basename(h); return [
  ['D1: the made home is mode 0700 exactly (read, not assumed)', j && j.homeMode === 0o700],
  ["D1: its name is not derivable — no process number in it, never vs-rehome-<pid>", !!h && b !== `vs-rehome-${j.pid}` && !b.includes(String(j.pid))],
  ['item 6: it carries a run record, as the scratch homes do', !!(j && j.hasRun)],
].map(([name, good]) => ({ name, good })); };
const ncOf = (err) => (lineOf(err).match(/ — not carried: (.*?); a tool missing there/) || [])[1];
const legsNC = (r) => [{ name: "item 4: the line's PATH «not carried» names are exactly the handed entries (~/.local/bin, ~/.nvm/bin, /opt/vs-hv-nowhere/bin)", good: ncOf(r.err) === '~/.local/bin, ~/.nvm/bin, /opt/vs-hv-nowhere/bin' }];
const legsLine = (r) => [{ name: "the line says the node is a COPY of its own, names every not-carried name with its reason (the desktop session, the caller's conversation, …), and the seam by name", good: /node: its own \(\S+, a copy\), out of the home; /.test(r.err) && /DISPLAY[^;]*\(the desktop session\)/.test(lineOf(r.err)) && /the caller's conversation names are not carried: [^\n]*VIBESPACE_SESSION_TOKEN/.test(r.err)   /* said by the import's own line, before the re-home (B-ba47's follow-up) */ && /VS_CLAUDE_BIN[^;]*\(a pinned agent CLI\)/.test(lineOf(r.err)) && /; the seam VS_REHOME_NOT_TEMP made \S+ not a temp root$/.test(lineOf(r.err)) && !lineOf(r.err).includes('stand-in-token') && !lineOf(r.err).includes('stand-in-pw') }];
const legsRefusal = (r) => [{ name: '(3) THE REFUSAL THROUGH THE IMPORT: a node file that cannot run outside its own folder ⇒ the suite REFUSES by name with the two doors (exit 1), never going on with the home\'s node', good: !!r && r.status === 1 && /it does not run out of the home \(ENOENT\) — it REFUSES to run there: run it with a node outside the home \(a system node\), or through the lane's environment/.test(r.err) }];
const legsTouch = (r, s) => [{ name: '(3) THE TOUCH: a node folder reused is touched — its last use read against a fixed old time', good: !!r && r.status === 0 && !!(r.j && r.j.rehomed && r.j.rehomed.node && r.j.rehomed.node.file.startsWith(s.final + '/')) && fs.statSync(s.final).mtimeMs > OLD.getTime() }];
const notAdopted = (r, s) => !!(r.j && r.j.rehomed && r.j.rehomed.node) && !r.j.rehomed.node.file.startsWith(s.final + '/');
const legsExtra = (r, s) => [{ name: '(a) a node folder holding a program installed into it since is NOT ours — never adopted', good: notAdopted(r, s) }];
const legsSeam = (r) => [{ name: '(e) the seam IGNORES a value outside every temp root', good: !!(r.j && r.j.rehomed) && r.j.rehomed.seam === null }];
const legsCompared = (r) => [{ name: "(b) an empty handed HOME is compared as the account entry's home", good: !!(r.j && r.j.compared) }];
{ // A1, B2, D1, the families, items 4 and 6 — ONE child on a MADE stand-in behind the seam, running FROM a node file under that home
  const r = await KIDS.a1;
  for (const l of [...legsA1(r.j, SA), ...legsFamilies(r.j), ...legsB2(r.j), ...legsD1(r.j), ...legsNC(r), ...legsLine(r)]) ok(l.good, l.name, l.good ? undefined : { j: r.j, err: r.err.slice(0, 700) });
}
{ const r = await KIDS.elf; if (!SE) ok(false, '(3) the refusal through the import: no node file could be made to need its folder (no /lib64 loader string) — RED by name'); else for (const l of legsRefusal(r)) ok(l.good, l.name, { status: r.status, err: r.err.slice(0, 400) }); }
{ const r = await KIDS.pold; for (const l of legsTouch(r, PO)) ok(l.good, l.name, { node: r.j && r.j.rehomed && r.j.rehomed.node, err: r.err.slice(0, 200) }); }
{ const r = await KIDS.oldform; ok(r.status === 0 && !!(r.j && r.j.rehomed && r.j.rehomed.node) && r.j.rehomed.node.file === path.join(PF.final, 'bin/node') && fs.existsSync(path.join(PF.cache, `vs-node-${PF.key}`)), "cure 4: an OLDER form of our own folder at the old name never blocks the present one — the import makes and keeps the v2 folder (the old one is the sweep's)", { node: r.j && r.j.rehomed && r.j.rehomed.node, left: fs.readdirSync(PF.cache), err: r.err.slice(0, 200) }); }
const legsUnion = (r) => [{ name: '7a THE UNION: a main file of the checkout\'s scripts folder that is NO suite (hv-plain.mjs) and loads the module re-homes', good: !!(r && r.j && r.j.rehomed) }];
const legsRowLink = (r) => [{ name: '8a a LINK named like a not-re-homed row (ci.mjs), leading to one of the tree\'s suites, is NOT the row — it re-homes', good: !!(r && r.j && r.j.rehomed) }];
{ const m = await KIDS.plainMain, w = await KIDS.plainRow, l = await KIDS.plainLink;
  for (const x of legsUnion(m)) ok(x.good, x.name, m.j || m.err.slice(0, 200));
  ok(w.status === 0 && w.j && w.j.rehomed === null, '(f) a FILE that IS a not-re-homed row (scripts/ci.mjs) runs on the handed home, on purpose', w.j || w.err.slice(0, 200));
  for (const x of legsRowLink(l)) ok(x.good, x.name, l.j || l.err.slice(0, 200)); }
{ // amendment 4 of 23:36Z: seven imports at once on an EMPTY cache — one folder renamed into place, every import on it, nothing half-made left
  const rs = await Promise.all(KIDS.seven);
  const files = rs.map((r) => r.j && r.j.rehomed && r.j.rehomed.node && r.j.rehomed.node.file);
  ok(rs.every((r) => r.status === 0) && files.every((f) => f === path.join(S7.final, 'bin/node')) && JSON.stringify(fs.readdirSync(S7.cache)) === JSON.stringify([path.basename(S7.final)]),
    'SEVEN imports at once on an empty cache — each runs on the ONE folder renamed into place; nothing half-made is left', { files, left: fs.readdirSync(S7.cache), errs: rs.filter((r) => r.status !== 0).map((r) => r.err.slice(0, 200)) });
  const after = fs.statSync(S7.node);
  ok(after.nlink === S7_NODE_BEFORE.nlink && after.ctimeMs === S7_NODE_BEFORE.ctimeMs && fs.statSync(path.join(S7.final, 'bin/node')).ino !== after.ino, "must-fix 1: after a FRESH make, the handed home's node file has the same link count and changed-time — the folder's node is a COPY (another inode)", { before: S7_NODE_BEFORE, after: { nlink: after.nlink, ctimeMs: after.ctimeMs } });
}
{ // planted at the name: never adopted — the run makes its own (removed at exit), the planted thing is untouched
  for (const [k, s, what] of [['pmode', PM, 'a folder at the name with mode 0755'], ['plink', PL, 'a LINK at the name (to a valid folder elsewhere)'], ['pstamp', PS, 'a folder at the name whose stamp names another node'], ['pextra', PX, '(a) a folder at the name holding a program installed into it since']]) {
    const r = await KIDS[k];
    ok(r.status === 0 && notAdopted(r, s) && fs.readdirSync(s.cache).filter((x) => x.includes('.tmp-')).length === 0, `${what} is NEVER adopted — this run used its own folder, removed at exit`, { node: r.j && r.j.rehomed && r.j.rehomed.node, err: r.err.slice(0, 200) });
  }
  ok((fs.lstatSync(PM.final).mode & 0o777) === 0o755 && fs.lstatSync(PL.final).isSymbolicLink() && fs.existsSync(path.join(PX.final, 'bin', 'claude')), '…and the planted things are left as they were');
  const ro = await KIDS.pro; fs.chmodSync(PR.cache, 0o700);
  ok(ro.status === 1 && /its node cache cannot be made \(EACCES/.test(ro.err) && /it REFUSES to run there/.test(ro.err), '(d) a node cache place that cannot be written ⇒ a named refusal with the door (exit 1), not a stack', { status: ro.status, err: ro.err.slice(0, 300) });
}
{ // NINETEEN mutant copies of scripts/scratch.mjs — each weakened law must turn its own named legs RED, through the import
  const WANT = {
    m1: ["today's shape (the node under the home kept)", (r) => legsA1(r.j, SMUT.m1), ['A1: a CHILD started the house way (PATH from its node) finds no stand-in CLI and runs outside the home']],
    m2: ['the module folders not re-read', (r) => legsA1(r.j, SMUT.m2), ['A1: the CJS global folders name nothing under the handed home']],
    m3: ["«ours» without the mode", (r) => [{ name: 'mode', good: notAdopted(r, SMUT.m3) }], ['mode']],
    m4: ['«ours» judged THROUGH a link', (r) => [{ name: 'link', good: notAdopted(r, SMUT.m4) }], ['link']],
    m5: ['«ours» without the stamp', (r) => [{ name: 'stamp', good: notAdopted(r, SMUT.m5) }], ['stamp']],
    m6: ['the walk at import cut to «by spelling» (B2)', (r) => legsB2(r.j), ['B2 through the import: a link outside the home INTO it — not carried', "B2 through the import: B1's parent step after a link — not carried"]],
    m7: ['the home named from the process number, 0777 (D1)', (r) => legsD1(r.j), ['D1: the made home is mode 0700 exactly (read, not assumed)', "D1: its name is not derivable — no process number in it, never vs-rehome-<pid>"]],
    m8: ['the mode widened (D1)', (r) => legsD1(r.j), ['D1: the made home is mode 0700 exactly (read, not assumed)']],
    m9: ["the line's PATH «not carried» list tampered (item 4)", (r) => legsNC(r), ["item 4: the line's PATH «not carried» names are exactly the handed entries (~/.local/bin, ~/.nvm/bin, /opt/vs-hv-nowhere/bin)"]],
    m10: ["(3) the refusal changed to «go on with the home's node»", (r) => legsRefusal(r), ['(3) THE REFUSAL THROUGH THE IMPORT: a node file that cannot run outside its own folder ⇒ the suite REFUSES by name with the two doors (exit 1), never going on with the home\'s node']],
    m11: ['(3) the real run-once replaced by a stub', (r) => legsRefusal(r), ['(3) THE REFUSAL THROUGH THE IMPORT: a node file that cannot run outside its own folder ⇒ the suite REFUSES by name with the two doors (exit 1), never going on with the home\'s node']],
    m12: ['(3) the touch on reuse cut', (r) => legsTouch(r, SMUT.m12), ['(3) THE TOUCH: a node folder reused is touched — its last use read against a fixed old time']],
    m13: ['(e) the seam takes a value outside every temp root', (r) => legsSeam(r), ['(e) the seam IGNORES a value outside every temp root']],
    m14: ["(b) the empty home compared as it is", (r) => legsCompared(r), ["(b) an empty handed HOME is compared as the account entry's home"]],
    m15: ["(a) npm's global folder left to the node cache", (r) => legsA1(r.j, SMUT.m15), ["(a) npm's global folder is the re-homed home's own (it dies with the run)"]],
    m16: ['(a) «ours» without «exactly what was made»', (r) => legsExtra(r, SMUT.m16), ['(a) a node folder holding a program installed into it since is NOT ours — never adopted']],
    m17: ['7a the union cut: only test- / dbg- names re-home', (r) => legsUnion(r), ['7a THE UNION: a main file of the checkout\'s scripts folder that is NO suite (hv-plain.mjs) and loads the module re-homes']],
    m18: ['8a the rows matched by NAME, not by the file that resolves', (r) => legsRowLink(r), ['8a a LINK named like a not-re-homed row (ci.mjs), leading to one of the tree\'s suites, is NOT the row — it re-homes']],
    m19: ['B2 the started env not passed (every name judged, the rule before)', (r) => legsLate(r), ['B2 THE LATE LOAD: a name the suite planted BEFORE its first load of the module reaches its own child', 'B2 THE LATE LOAD: its own PATH entry goes in front of the built PATH']],
  };
  for (const [k, [what, legs, reds]] of Object.entries(WANT)) {
    const r = await KIDS.mut[k];
    if (['m10', 'm11'].includes(k) && !ELF) { ok(false, `mutant scratch.mjs "${what}": no node file could be made to need its folder — RED by name`); continue; }
    const red = legs(r).filter((l) => !l.good).map((l) => l.name);
    ok(MUT[k].present && reds.every((n) => red.includes(n)), `mutant scratch.mjs "${what}": its needle is in the shipped module once, and its named legs go RED through the import (${red.length} red)`, { present: MUT[k].present, red, err: r && r.err.slice(0, 300) });
  }
}
{ // ⑧ a suite KILLED outright runs no exit hook — the gate's directory sweep reaps its home by age, and a node folder by its OWN shape at a week
  const SW = await import(pathToFileURL(path.join(REPO, 'scripts/scratch-sweep.mjs')).href);
  const FIXED_NOW = 1794700000000, v = (p, age, markerOk = true) => SW.dirVerdict({ path: p, name: path.basename(p), mtimeMs: FIXED_NOW - age, now: FIXED_NOW, liveRoots: [], markerOk }).verdict;   // a fixed instant: this suite reads no clock
  const day = 24 * 3600e3, K = `/var/tmp/vs-node-${SM.NODE_CACHE_FORM}-${KEY}`;
  ok(v('/tmp/vs-rehome-a1B2c3', 25 * 3600e3) === 'reap' && v('/tmp/vs-rehome-a1B2c3', 60e3) === 'keep' && SW.familyOf('vs-rehome-a1B2c3') === 'vs-rehome', "a killed suite's /tmp/vs-rehome-XXXXXX is the gate sweep's: reaped once a day old, kept while young (family vs-rehome)");
  ok(v(K, 8 * day) === 'reap' && v(K, 2 * day) === 'keep' && v(`${K}.tmp-a1B2c3`, 8 * day, false) === 'reap', "(c) a node folder is reaped a WEEK after its last use (a half-made one by its name's form alone) — by age, no process table");
  ok(v('/var/tmp/vs-node-hv-x', 30 * day) === 'keep' && v(K, 30 * day, false) === 'keep' && v('/var/tmp/vs-node-ABCDEF0123456789', 30 * day) === 'keep', "(c) …and ONLY by its own shape: a name merely beginning the same way, a folder without its stamp, a key not of its form — kept");
  ok(v(`/var/tmp/vs-node-${KEY}`, 8 * day) === 'reap', 'cure 4: an OLDER form of the folder (no version in its name) is aged out by the same sweep');
  ok(v('/var/tmp/vs-hv-a1B2c3', 25 * 3600e3) === 'reap' && v('/var/tmp/vs-hv-a1B2c3', 60e3) === 'keep' && v('/var/tmp/vs-hv-anything-else', 30 * day) === 'keep' && v('/var/tmp/vs-hv-a1B2c', 30 * day) === 'keep', "cure 3: the sweep takes the suite's stand-in folders ONLY in the exact form the suite makes (vs-hv- + six), a day old — never a folder whose name merely begins the same way");
}

// ── THE RUNNER'S NAMES REACH A RE-HOMED SUITE'S CHILDREN (主开发 r1083 cure 1) ──────────────────────────────────────────────────
// The tier runner hands every fast suite the egress sampler (--require) and its file (VIBESPACE_SUITE_EGRESS_FILE); a fork()ed
// child carries the --require by its execArgv and the file by the env. A re-homed suite's env is BUILT from the rows, so the file's
// name must be one: a stand-in suite handed a home outside every temp root forks a child that opens a socket past the loopback,
// and the sampler's file holds that child's line. CONTROL: the same stand-in through a copy of the tree whose home-verdict.js lacks
// the row — the child's line is gone (the tip before this cure).
console.log('— the runner\'s egress file reaches a re-homed suite\'s forked child (B-9dd0 × the re-home)');
{
  const SAMPLER = path.join(REPO, 'scripts/egress-sampler.cjs');
  const CARRIED_ROW = (JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/egress-carried-rows.json'), 'utf8')).carried || [])[0];
  ok(typeof CARRIED_ROW === 'string' && /^test-[\w-]+$/.test(CARRIED_ROW), 'the egress list names a carried row to run the probe under', CARRIED_ROW);
  const CHILD = path.join(DIR, 'egress-child.cjs');
  fs.writeFileSync(CHILD, "const net = require('net'); const s = net.connect({ host: 'egress-child.invalid', port: 9 }); s.on('error', () => {}); s.destroy(); setTimeout(() => process.exit(0), 20);\n");
  const probeSrc = (scratchUrl) => `import ${JSON.stringify(scratchUrl)};\nimport { fork } from 'node:child_process';\nconst c = fork(${JSON.stringify(CHILD)}, [], { stdio: 'ignore' });\nc.on('exit', (code) => { process.stdout.write(JSON.stringify({ code, home: process.env.HOME, file: process.env.VIBESPACE_SUITE_EGRESS_FILE || null }) + '\\n'); });\n`;
  // the control's tree: scripts/ (scratch.mjs as shipped, scratch-run.mjs linked) and a src/ of links but home-verdict.js, a copy without the row
  const ctlTree = (() => {
    const d = path.join(DIR, 'mut', 'egress-row'), sd = path.join(d, 'scripts'), srcd = path.join(d, 'src');
    fs.mkdirSync(sd, { recursive: true }); fs.mkdirSync(srcd, { recursive: true });
    for (const e of fs.readdirSync(path.join(REPO, 'src'))) if (e !== 'home-verdict.js') fs.symlinkSync(path.join(REPO, 'src', e), path.join(srcd, e));
    const HVS = fs.readFileSync(path.join(REPO, 'src/home-verdict.js'), 'utf8');
    const row = HVS.split('\n').find((l) => l.includes("R('VIBESPACE_SUITE_EGRESS_FILE', 'path',")) || '';
    fs.writeFileSync(path.join(srcd, 'home-verdict.js'), SM.anchored(HVS, row + '\n', '', 'control «the egress file’s row cut»'));
    fs.writeFileSync(path.join(sd, 'scratch.mjs'), SCR_SRC); fs.symlinkSync(path.join(REPO, 'scripts/scratch-run.mjs'), path.join(sd, 'scratch-run.mjs'));
    return { scratchUrl: pathToFileURL(path.join(sd, 'scratch.mjs')).href, dir: sd };
  })();
  const egressRun = (tag, scratchUrl, dir) => new Promise((resolve) => {
    // the probe runs under a CARRIED row's name: on the root (B-9dd0, 主开发 r1246) a row scripts/egress-carried-rows.json does not
    // name is a census row, whose node children the reader never follows (counted unread 'census') — what this leg reads is the
    // egress file's road through the re-home down to a forked child, so the suite must be one whose children are read
    const file = path.join(DIR, `egress-${tag}.ndjson`), pd = path.join(dir, `egress-${tag}`); fs.mkdirSync(pd, { recursive: true });
    const probe = path.join(pd, `${CARRIED_ROW}.mjs`);
    fs.writeFileSync(probe, probeSrc(scratchUrl));
    const c = spawn(process.execPath, ['--require', SAMPLER, probe], { env: { ...process.env, ...handed, VIBESPACE_SUITE_EGRESS_FILE: file }, timeout: 60000 });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('close', (status) => {
      let j = null; try { j = JSON.parse(out.trim().split('\n').pop()); } catch { }
      let lines = []; try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { }
      resolve({ j, status, err: err.slice(-400), lines, child: lines.some((l) => String(l.host || '').startsWith('egress-child.invalid')) });
    });
  });
  const [real, ctl] = await Promise.all([egressRun('real', SCRATCH_URL, DIR), egressRun('ctl', ctlTree.scratchUrl, ctlTree.dir)]);
  ok(!!real.j && /^\/tmp\/vs-rehome-/.test(real.j.home || '') && real.j.file !== null && real.child,
    'a RE-HOMED suite keeps the runner\'s egress file, and its fork()ed child\'s socket past the loopback is in the sampler\'s file', { j: real.j, lines: real.lines.slice(0, 4), err: real.err });
  ok(!!ctl.j && /^\/tmp\/vs-rehome-/.test(ctl.j.home || '') && ctl.j.file === null && !ctl.child && ctl.lines.length >= 1,
    'CONTROL: the same suite through a home-verdict.js without the row loses the file at the re-home — its child records nothing while the parent\'s sentinel stays', { j: ctl.j, lines: ctl.lines.slice(0, 4), err: ctl.err });
}

// ── THE HANDED ENV IS JUDGED, NOT THE SOURCE (主开发 r1139) ─────────────────────────────────────────────────────────────────
// scripts/ci.mjs judges the env it hands a suite at the ONE place it starts one (runSuiteAsync): every name it ADDED to what it
// was itself started with is a row or a named NOT, or the suite is refused by name. However the name was added — the shared
// object (as markCiRun sets the run's id on GIT_ENV), a computed name, a helper — the judge reads the env itself. RED: the tip's
// source reader (the census of assignment forms) finds none of the three.
console.log('— the handed env, judged (B-ba47 pick B, r1139): a name the runner added by any road is a row, a named NOT, or a refusal');
{
  const STARTED = { PATH: '/usr/bin:/bin', HOME: '/home/u', LANG: 'C.UTF-8', CI: 'true' };
  const viaShared = (() => { const e = { ...STARTED }; const shared = e; shared.VIBESPACE_FORM_SHARED = 'x'; return e; })();
  const viaComputed = (() => { const part = ['FORM', 'COMPUTED'].join('_'); return { ...STARTED, [`VIBESPACE_${part}`]: 'x' }; })();
  const viaHelper = (() => { const add = (o, k, v) => { o[k] = v; return o; }; return add({ ...STARTED }, 'VIBESPACE_FORM_HELPER', 'x'); })();
  const named = [['the shared object', viaShared, 'VIBESPACE_FORM_SHARED'], ['a computed name', viaComputed, 'VIBESPACE_FORM_COMPUTED'], ['a helper', viaHelper, 'VIBESPACE_FORM_HELPER']]
    .map(([form, env, n]) => ({ form, n, got: HV.unruledNames(env, STARTED) }));
  ok(named.every((x) => x.got.join() === x.n), `a name ADDED through each of three forms — ${named.map((x) => x.form).join(', ')} — is red BY NAME (${named.map((x) => x.got.join(',')).join(' · ')})`, named);
  const ruled = HV.unruledNames({ ...STARTED, HOME: '/tmp/vs-lane-1/home', XDG_RUNTIME_DIR: '/tmp/r', VIBESPACE_CI_RUN: 'ci-fast-pid1@2', VIBESPACE_SUITE_BUDGET_MS: '9', VIBESPACE_SUITE_EGRESS_FILE: '/tmp/e', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/b' }, STARTED);
  ok(ruled.length === 0, 'what the runner adds today is ruled: the lane home and runtime folder, the run\'s id (a row), the budget and the egress file (rows), the lane\'s bus (a named NOT)', ruled);
  // RED: the tip's reader — the assignment forms the census matched — over the three forms' own spelling finds none of them
  const tipReader = (src) => { const out = []; for (const l of src.split('\n')) { for (const m of l.matchAll(/\b(?:env|out)\.([A-Z][A-Z0-9_]+)\s*=(?!=)/g)) out.push(m[1]); if (/\{\s*\.\.\.(?:laneEnv\(|env\b)/.test(l)) for (const m of l.matchAll(/[{,]\s*([A-Z][A-Z0-9_]{2,})\s*:/g)) out.push(m[1]); } return out; };
  const forms = "GIT_ENV.VIBESPACE_CI_RUN = id;\nconst part = ['FORM', 'COMPUTED'].join('_'); const e2 = { ...base, [`VIBESPACE_${part}`]: 'x' };\nadd(env, 'VIBESPACE_FORM_HELPER', 'x');";
  ok(tipReader(forms).length === 0 && tipReader('env.VIBESPACE_SEEN = 1;').join() === 'VIBESPACE_SEEN',
    'RED CONTROL: the tip\'s source reader finds NONE of the three forms (the run\'s id on the shared object among them) — while it sees the plain one', tipReader(forms));
  // the wiring: the runner judges the env it hands, before the spawn, and refuses by name
  const CI = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  const at = CI.indexOf('export function runSuiteAsync('), judge = CI.indexOf('HANDED_JUDGE.unruledNames(env, STARTED_ENV)', at), spawnAt = CI.indexOf('child = spawn(process.execPath', at);
  ok(at > 0 && judge > at && spawnAt > judge && /REFUSED \(0ms\)/.test(CI.slice(judge, spawnAt)) && /const STARTED_ENV = Object\.freeze\(\{ \.\.\.process\.env \}\);/.test(CI),
    'scripts/ci.mjs judges the env it hands at runSuiteAsync — its started env frozen at load — and refuses the suite by name before it is spawned');
}

// ── A FENCED LEG'S VERDICT: named only by the handed variable (主开发 r1139) ───────────────────────────────────────────────────
console.log('— a fenced real-program leg: the switch, a usable program, named and missing, not named and missing');
{
  const v = (o) => SM.fencedVerdict(o).act;
  ok(v({ off: true, named: '/opt/claude', found: '/opt/claude' }) === 'skip' && v({ off: false, named: null, found: '/usr/local/bin/claude' }) === 'run'
    && v({ off: false, named: '/opt/ci/bin/claude', found: null }) === 'red' && v({ off: false, named: null, found: null }) === 'skip',
    'the lanes\' switch ⇒ a counted skip; a usable program ⇒ run; NAMED (the handed VS_<CLI>_BIN) and not found ⇒ RED; not named and not found ⇒ the counted skip said by name');
  ok(/handed VS_<CLI>_BIN/.test(SM.fencedVerdict({}).why) && /NAMES its program \(\/x\)/.test(SM.fencedVerdict({ named: '/x' }).why), 'each verdict says why by name');
  const both = ['test-claude-steer-chrome.mjs', 'test-claude-wrapper-queue.mjs'].map((f) => fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8'));
  ok(both.every((t) => /fencedVerdict\(\{ off: NO_REAL_CLI, named: claudeNamed, found: claudeBin \}\)/.test(t) && /handedCliNamed\('claude'\)/.test(t) && !/claudeCands\[0\]/.test(t)),
    'both fenced suites take the ONE verdict, with the program named only by handedCliNamed (never the first candidate)');
}

// ── THE JUDGE, THE NAMED PATH, THE HAND-OFF DRIVEN (主开发 r1156) ──────────────────────────────────────────────────────────────
console.log('— the judge reads CHANGED names too; the NAMED path itself; the one hand-off refuses, driven');
{
  // (1) a name the runner was started with and then CHANGES is judged like an added one; every name it changes today is ruled
  const WAS = { HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1/bus', VIBESPACE_CI_RUN: 'ci-outer', VIBESPACE_SUITE_BUDGET_MS: '1', PERSON_WORD: 'kept' };
  const today = HV.unruledNames({ ...WAS, HOME: '/tmp/l/home', XDG_RUNTIME_DIR: '/tmp/l/run', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/l/run/bus', VIBESPACE_CI_RUN: 'ci-fast-pid1@2', VIBESPACE_SUITE_BUDGET_MS: '300000' }, WAS);
  const changed = HV.unruledNames({ ...WAS, PERSON_WORD: 'changed by the runner' }, WAS);
  ok(today.length === 0 && changed.join() === 'PERSON_WORD', 'a name the runner CHANGES is judged: every one it changes today (the lane home, its runtime folder and bus, the run id, the budget) is ruled; an unruled one it changes is red by name', { today, changed });
  // (2) «named and not found» reads the NAMED path itself: another usable candidate never stands in for it
  const usable = (p) => (p === '/usr/local/bin/claude' || p === '/opt/named/claude-ok' ? p : null);
  const pick = (o) => SM.fencedProgram({ usable, ...o });
  const namedGone = pick({ named: '/opt/ci/bin/claude', candidates: ['/usr/local/bin/claude'] });
  ok(namedGone === null && SM.fencedVerdict({ named: '/opt/ci/bin/claude', found: namedGone }).act === 'red'
    && pick({ named: '/opt/named/claude-ok', candidates: ['/usr/local/bin/claude'] }) === '/opt/named/claude-ok'
    && pick({ named: null, candidates: ['/nowhere/claude', '/usr/local/bin/claude'] }) === '/usr/local/bin/claude' && pick({ off: true, named: '/opt/named/claude-ok' }) === null,
    'the NAMED path itself decides: named and unusable is RED even beside a usable candidate; named and usable runs THAT file; not named takes the first usable candidate; the switch takes none');
  const both = ['test-claude-steer-chrome.mjs', 'test-claude-wrapper-queue.mjs'].map((f) => fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8'));
  ok(both.every((t) => /fencedProgram\(\{ off: NO_REAL_CLI, named: claudeNamed, candidates: claudeCands, usable: usableClaude \}\)/.test(t)), 'both fenced suites pick their binary through the ONE fencedProgram');
  // (3) THE HAND-OFF, DRIVEN: scripts/ci.mjs runSuiteAsync with a stand-in suite and an unruled name — the refused line comes
  // back and nothing is spawned; the same stand-in handed nothing new runs
  const CI = await import(pathToFileURL(path.join(REPO, 'scripts/ci.mjs')).href);
  const tree = path.join(DIR, 'handoff-tree'), marker = path.join(DIR, 'handoff-ran');
  fs.mkdirSync(path.join(tree, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'scripts', 'test-hv-handoff.mjs'), `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(marker)}, 'ran'); console.log('ALL PASS (1)');\n`);
  const row = { name: 'test-hv-handoff', tier: 'heavy', why: 'a stand-in suite of test-home-verdict' };
  const refused = await CI.runSuiteAsync(row, { root: tree, lane: 1, egress: false, envOf: () => ({ ...process.env, VIBESPACE_HANDOFF_UNRULED: 'x' }) });
  const ranBefore = fs.existsSync(marker);
  const plain = await CI.runSuiteAsync(row, { root: tree, lane: 1, egress: false, envOf: () => ({ ...process.env }) });
  const said = (refused.lines || []).join('\n');
  ok(refused.ok === false && /✗ test-hv-handoff REFUSED/.test(said) && said.includes('VIBESPACE_HANDOFF_UNRULED') && !ranBefore && plain.ok === true && fs.existsSync(marker),
    'the ONE hand-off, driven: a stand-in suite handed an unruled name is REFUSED by name and never spawned; the same stand-in handed nothing new runs', { refused: said.slice(0, 300), plainOk: plain.ok, ranBefore });
}

// THE DRIVER'S DOOR (主开发 r2068 / r2095): the re-home builds the suite's PATH, so the browser driver a run hands on PATH (npm -g
// puts it in node's own folder, never carried) reached no real-driver suite: each skipped whole. THE VARIABLE ONLY: the program
// VS_AGENT_BROWSER_BIN names is linked into the suite's own .vs-bin — that ONE program; named and unusable (gone, or the shim) is
// none, said by name; NO NAME, NO DRIVER: one standing on the handed PATH is never picked up. CONTROL: a copy with the link cut.
console.log('— the driver\'s door: the one real driver the run NAMES reaches a re-homed suite (主开发 r2068 / r2095)');
{
  const VERBS = require(path.join(REPO, 'src/browser-verbs.js'));
  ok(SM.DRIVER.name === VERBS.REAL_BINARY && SM.DRIVER.shimMarker === VERBS.SHIM_MARKER, "the door's driver name and shim marker are the product's own (src/browser-verbs.js REAL_BINARY / SHIM_MARKER)", SM.DRIVER);
  const U = new Set(['/n/agent-browser', '/s/agent-browser']), SH = new Set(['/s/agent-browser']);
  const door = (o) => SM.driverDoor({ usable: (f) => U.has(f), isShim: (f) => SH.has(f), ...o });
  const tbl = [
    [door({}).path, null], [door({ named: '/n/agent-browser' }).path, '/n/agent-browser'], [door({ named: '/none/agent-browser' }).path, null],
    [door({ named: '/s/agent-browser' }).path, null], [door({ named: 'agent-browser' }).path, null],
  ];
  ok(tbl.every(([a, b]) => a === b) && door({}).named === false && /VS_AGENT_BROWSER_BIN names \/none\/agent-browser/.test(door({ named: '/none/agent-browser' }).why || ''),
    'PURE: NO NAME, NO DRIVER; a NAMED program is it alone — named and unusable, the shim or a bare word is none, said by name', tbl);
  // THE ONE SENTENCE (主开发 r2095): every skip whose words say the real driver is absent begins with DRIVER.skip, whole or a leg —
  // the integrator's runner finds a skipped driver leg in any row's output by that fixed string (NO READING / PARTIAL). Held over
  // every suite's skip calls; a SECOND (older) driver named by VIBESPACE_TEST_PREV_CLI is no «run named none». CONTROL: a bare one
  const ABSENT = /agent-browser[^`'\n]{0,40}?(?:is )?not (?:resolvable|runnable|on PATH|installed)|no (?:real )?agent-browser|real agent-browser here is|real agent-browser[^`'\n]{0,30}not resolvable/;
  const CALL = /\b(?:skip|skipWhole|console\.error)\(\s*(`|')((?:\\.|(?!\1)[^\\])*)\1/g;
  const sitesOf = (t) => [...t.matchAll(CALL)].filter((m) => ABSENT.test(m[2]) && !/VIBESPACE_TEST_PREV_CLI/.test(m[2])).map((m) => ({ at: t.slice(0, m.index).split('\n').length, said: m[2].includes('${DRIVER.skip}') }));
  const sentenceSites = fs.readdirSync(path.join(REPO, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f) && f !== 'test-home-verdict.mjs')
    .flatMap((f) => sitesOf(fs.readFileSync(path.join(REPO, 'scripts', f), 'utf8')).map((s) => ({ f, ...s })));
  const bareSites = sentenceSites.filter((s) => !s.said), suitesSaid = new Set(sentenceSites.map((s) => s.f));
  const ctlSites = sitesOf("if (!ab) skip('no real agent-browser installed');\nif (!x) skip(`${DRIVER.skip} the real agent-browser is not resolvable`);\nif (!y) skip('no chrome for the agent-browser legs');");
  ok(bareSites.length === 0 && sentenceSites.length >= 33 && suitesSaid.size >= 22 && ctlSites.length === 2 && ctlSites.filter((s) => !s.said).length === 1 && SM.DRIVER.skip.length > 20 && !/SKIP/.test(SM.DRIVER.skip),
    `THE ONE SENTENCE (r2095): every skip whose words say the real driver is absent begins «${SM.DRIVER.skip}» — ${sentenceSites.length} sites in ${suitesSaid.size} suites, none bare; it holds no skip word of its own (the line's own skip word stays first); CONTROL: a planted bare one is found, a Chrome-absent one is none`, bareSites.map((s) => `${s.f}:${s.at}`));
  const PROBE_DRV = (url) => `import fs from 'node:fs'; import path from 'node:path';
const NAMED = ${JSON.stringify(DRIVER_VARS)}.filter((k) => k in process.env);   // read BEFORE the import: the names the child was STARTED with
const S = await import(${JSON.stringify(url)});
const on = (n) => { for (const d of String(process.env.PATH || '').split(':')) { const f = path.join(d, n); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch { } } return null; };
const ab = on('agent-browser'); let real = null; try { real = ab && fs.realpathSync(ab); } catch { }
console.log(JSON.stringify({ home: S.REHOMED && S.REHOMED.home, linked: (S.REHOMED && S.REHOMED.linked) || [], ab, real, other: on('vs-hv-other-tool'), named: NAMED, browsers: (S.REHOMED && S.REHOMED.browsers) || null }));`;
  const fake = (f, body) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body, { mode: 0o755 }); return fs.realpathSync(f); };
  const REAL_BODY = '#!/bin/sh\necho 0.38.2\n', SHIM_BODY = `#!/bin/sh\n# ${VERBS.SHIM_MARKER}\nexit 2\n`;
  const scene = (tag, plant) => { const s = standin(`drv-${tag}`, { small: true }); return { s, ...plant(s) }; };
  const D1 = scene('noname', (s) => ({ onPath: fake(path.join(s.home, '.nvm/bin/agent-browser'), REAL_BODY) }));
  const D2 = scene('named', (s) => { fake(path.join(s.home, '.nvm/bin/agent-browser'), REAL_BODY); const named = path.join(s.seam, 'named/agent-browser'); fake(path.join(s.seam, 'named/vs-hv-other-tool'), REAL_BODY); return { want: fake(named, REAL_BODY), env: { VS_AGENT_BROWSER_BIN: named } }; });
  const D3 = scene('gone', (s) => ({ onPath: fake(path.join(s.home, '.nvm/bin/agent-browser'), REAL_BODY), env: { VS_AGENT_BROWSER_BIN: path.join(s.seam, 'none/agent-browser') } }));
  const D4 = scene('shim', (s) => { const shim = path.join(s.seam, 'shim/agent-browser'); fake(shim, SHIM_BODY); return { env: { VS_AGENT_BROWSER_BIN: shim } }; });
  const CUT = mutant('drvcut', '  if (drv.path) {', '  if (false && drv.path) {');
  const go = (d, tag, url = SCRATCH_URL, dir = DIR, base = process.env) => start(path.join(dir, `test-hv-drv-${tag}.mjs`), { ...d.s.env, ...(d.env || {}) }, PROBE_DRV(url), { base });
  // r4804: a base that HOLDS both names, planted as a real-driver row hands them (D2's named program and a folder of builds)
  const PLANT_BR = path.dirname(path.dirname(fake(path.join(DIR, 'drv-planted/builds/chrome-151.0.7922.34/chrome'), REAL_BODY)));
  const PLANTED = { ...process.env, [SM.DRIVER.env]: D2.want, [SM.DRIVER.browsersEnv]: PLANT_BR };
  const [r1, r2, r3, r4, rc, rp, rw] = await Promise.all([go(D1, 'noname'), go(D2, 'named'), go(D3, 'gone'), go(D4, 'shim'), go(D2, 'cut', CUT.url, path.dirname(CUT.probe)),
    go(D1, 'planted', SCRATCH_URL, DIR, PLANTED), start(path.join(DIR, 'test-hv-drv-whole.mjs'), { ...PLANTED, ...D1.s.env }, PROBE_DRV(SCRATCH_URL), { clean: true })]);
  const own = (r) => !!(r.j && r.j.home && r.j.ab === path.join(r.j.home, '.vs-bin', 'agent-browser') && r.j.linked.includes('agent-browser'));
  ok(own(r2) && r2.j.real === D2.want && r2.j.other === null,
    'THROUGH THE IMPORT: the program VS_AGENT_BROWSER_BIN names reaches the re-homed suite in its OWN .vs-bin — that one program, never the PATH\'s driver, and nothing of its folder beside it', { j: r2.j, err: r2.err.slice(-300) });
  ok(!!r1.j && !r1.j.linked.includes('agent-browser') && r1.j.real !== D1.onPath && !/VS_AGENT_BROWSER_BIN names/.test(r1.err),
    'NO NAME, NO DRIVER (r2095): a driver standing on the handed PATH (node\'s own folder) is never picked up — the fence skips in its own words', { j: r1.j, err: r1.err.slice(-300) });
  ok(!!r1.j && Array.isArray(r1.j.named) && r1.j.named.length === 0 && !!rp.j && Array.isArray(rp.j.named) && rp.j.named.length === 0 && !rp.j.linked.includes('agent-browser') && rp.j.real !== D2.want && rp.j.browsers === null && !/VS_AGENT_BROWSER_\w+ names/.test(rp.err),
    `THE NO-NAME SCENE HOLDS NO NAME (r4804): its child starts with neither ${DRIVER_VARS.join(' nor ')}, on any row; PLACED: from a base that HOLDS both (as a real-driver row hands them) it still holds neither, links no driver and places no browsers`, { r1: r1.j && r1.j.named, rp: rp.j, err: rp.err.slice(-300) });
  ok(!!rw.j && Array.isArray(rw.j.named) && rw.j.named.length === 2 && rw.j.linked.includes('agent-browser') && rw.j.real === D2.want && !!rw.j.browsers && !!rw.j.browsers.at,
    'RED CONTROL: the same planted base taken WHOLE (the release\'s road: the suite\'s environment under the scene\'s) — the child holds both names, the door links the planted program and the browsers are placed: row 965\'s red, made at will', { j: rw.j, err: rw.err.slice(-300) });
  ok(!!r3.j && !r3.j.linked.includes('agent-browser') && r3.j.real !== D3.onPath && /VS_AGENT_BROWSER_BIN names .*none\/agent-browser: no usable agent-browser there/.test(r3.err),
    'a NAMED program that is not there is none — said by name on stderr; the PATH\'s driver never stands in for it', { j: r3.j, err: r3.err.slice(-300) });
  ok(!!r4.j && !r4.j.linked.includes('agent-browser') && /VS_AGENT_BROWSER_BIN names .*shim\/agent-browser: no usable agent-browser there/.test(r4.err),
    'a NAMED program that is VibeSpace\'s own shim (its marker) is not the driver: none, said by name', { j: r4.j, err: r4.err.slice(-300) });
  ok(CUT.present && !!rc.j && !rc.j.linked.includes('agent-browser') && rc.j.real !== D2.want, 'CONTROL: the named scene through a copy with the link cut — no driver reaches the suite (the skip whole the box read)', { j: rc.j, err: rc.err.slice(-300) });
  // THE DOOR LEFT ALONE (主开发 r2775): a suite whose home is ALREADY a throwaway (a box row's own scratch home, r2203) is left alone by
  // the re-home, so the door must apply there too — the program the variable names is linked into a folder of its own, FIRST on its
  // PATH, and the suite's own fence (src/browser-facts.js binaryResolver) finds THAT program; no name, none; a gone name or the shim,
  // none, said by name. RED CONTROL: the release's early return (the door inside the re-home only — the box's NO READING at will)
  const LA = path.join(DIR, 'drv-left-alone'), LA_HOME = path.join(LA, 'home'), LA_BIN = path.join(LA, 'bin');
  fs.mkdirSync(LA_HOME, { recursive: true }); fs.mkdirSync(LA_BIN, { recursive: true });
  const LA_WANT = fake(path.join(LA, 'named/agent-browser'), REAL_BODY), LA_SHIM = fake(path.join(LA, 'shim/agent-browser'), SHIM_BODY);
  const PROBE_LA = (url) => `import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const S = await import(${JSON.stringify(url)});
const LD = S.DRIVER_LEFT_ALONE && S.DRIVER_LEFT_ALONE.dir;
let stamp = null; if (LD) { try { stamp = JSON.parse(fs.readFileSync(path.join(LD, '.vs-run.json'), 'utf8')).pid === process.pid; } catch { stamp = false; } }
const Ff = createRequire(import.meta.url)(${JSON.stringify(path.join(REPO, 'src/browser-facts.js'))});
let fence = null; try { fence = Ff.binaryResolver('agent-browser', process.env)(); } catch { }
let real = null; try { real = fence && fs.realpathSync(fence); } catch { }
console.log(JSON.stringify({ rehomed: !!S.REHOMED, left: S.DRIVER_LEFT_ALONE || null, fence, real, path: process.env.PATH, stamp }));`;
  const LA_PATH = `${LA_BIN}:/usr/bin:/bin`, laEnv = (extra = {}) => ({ HOME: LA_HOME, PATH: LA_PATH, LANG: 'C.UTF-8', ...extra });
  const LA_CUT = mutant('drvlacut', "  if (v.rehome || v.why !== 'temp-home') return null;", '  return null;');
  const goLA = (tag, env, url = SCRATCH_URL, dir = DIR) => start(path.join(dir, `test-hv-drvla-${tag}.mjs`), env, PROBE_LA(url), { clean: true });
  const [l1, l2, l3, l4, lc] = await Promise.all([goLA('named', laEnv({ VS_AGENT_BROWSER_BIN: LA_WANT })), goLA('noname', laEnv()),
    goLA('gone', laEnv({ VS_AGENT_BROWSER_BIN: path.join(LA, 'none/agent-browser') })), goLA('shim', laEnv({ VS_AGENT_BROWSER_BIN: LA_SHIM })),
    goLA('cut', laEnv({ VS_AGENT_BROWSER_BIN: LA_WANT }), LA_CUT.url, path.dirname(LA_CUT.probe))]);
  const laDir = l1.j && l1.j.left && l1.j.left.dir;
  ok(!!l1.j && l1.j.rehomed === false && !!laDir && l1.j.path === `${laDir}:${LA_PATH}` && l1.j.fence === path.join(laDir, 'agent-browser') && l1.j.real === LA_WANT && l1.j.stamp === true && !fs.existsSync(laDir),
    'LEFT ALONE (r2775): a suite whose home is already a throwaway is not re-homed, and the program VS_AGENT_BROWSER_BIN names still reaches its own fence — linked into a folder of the run\'s own (stamped as this run\'s: its record names the suite\'s own pid), FIRST on its PATH, removed at its exit', { j: l1.j, err: l1.err.slice(-300) });
  ok(!!l2.j && l2.j.rehomed === false && l2.j.left === null && l2.j.path === LA_PATH && l2.j.real !== LA_WANT && !/VS_AGENT_BROWSER_BIN names/.test(l2.err) && !fs.existsSync(path.join(LA_HOME, '.agent-browser')),
    'WITH NEITHER NAME SET NOTHING CHANGES (r2793): no folder made, the PATH exactly as handed (the row\'s two folders), the home untouched, the fence answers in its own words', { j: l2.j, err: l2.err.slice(-300) });
  ok(!!l3.j && !!l3.j.left && l3.j.left.dir === null && l3.j.path === LA_PATH && l3.j.real !== LA_WANT && /VS_AGENT_BROWSER_BIN names .*none\/agent-browser: no usable agent-browser there/.test(l3.err)
    && !!l4.j && !!l4.j.left && l4.j.left.dir === null && l4.j.path === LA_PATH && /VS_AGENT_BROWSER_BIN names .*shim\/agent-browser: no usable agent-browser there/.test(l4.err),
    'LEFT ALONE, a NAMED program that is not there, or that is VibeSpace\'s own shim (its marker): none, said by name on stderr — the PATH as handed', { l3: l3.j, l4: l4.j, err: (l3.err + l4.err).slice(-400) });
  ok(LA_CUT.present && !!lc.j && lc.j.rehomed === false && !lc.j.left && lc.j.path === LA_PATH && lc.j.real !== LA_WANT,
    'RED CONTROL: the release\'s early return (the door inside the re-home only) — the same named scene left alone reaches no driver: the box\'s «NO REAL DRIVER» skip, made at will', { j: lc.j, err: lc.err.slice(-300) });
  // THE DRIVER'S INSTALLED BROWSERS (主开发 r2777, row 401): the folder VS_AGENT_BROWSER_BROWSERS names is linked as
  // <home>/.agent-browser/browsers — where the driver and the suites (os.homedir()) look: in the re-home's own home, or in a left-alone
  // suite's home only where none is there (the link stays with that home: r2825 (3)); no name, none; a name that is no folder, none, said by name; one
  // already there is never covered. RED CONTROL: the release's scratch (no such door) — the suite's home has none (row 401's skip)
  // B-8695's follow (主开发 r4974 (2)): the named build's «real» binary PRINTS its argv, one word a line, so the harness's program run
  // over it shows what reaches it; the named folder's whole tree is read before any scene and judged unchanged after the last
  const ARGV_BODY = '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n';
  const BR = fake(path.join(LA, 'builds/chrome-151.0.7922.34/chrome'), ARGV_BODY), BR_DIR = path.dirname(path.dirname(BR));
  const snapTree = (root) => { const out = []; const walk = (d) => { for (const n of fs.readdirSync(d).sort()) { const f = path.join(d, n), st = fs.lstatSync(f); out.push([path.relative(root, f), st.isDirectory() ? 'd' : st.isSymbolicLink() ? 'l' : 'f', st.size, st.mtimeMs, st.mode]); if (st.isDirectory()) walk(f); } }; walk(root); return JSON.stringify(out); };
  const SNAP_BR = snapTree(BR_DIR);
  const PROBE_BR = (url) => `import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const S = await import(${JSON.stringify(url)});
const at = path.join(os.homedir(), '.agent-browser', 'browsers');
let real = null; try { real = fs.realpathSync(at); } catch { }
let builds = null; try { builds = fs.readdirSync(at); } catch { }
let link = null; try { link = fs.lstatSync(at).isSymbolicLink(); } catch { }
let stamp = null; try { stamp = JSON.parse(fs.readFileSync(path.join(at, S.BROWSERS_STAMP), 'utf8')); } catch { }
const pick = typeof S.driverCachedChrome === 'function' ? S.driverCachedChrome(at) : null;   // the DRIVER's own lookup in that cache
let prog = null; try { prog = pick && fs.readFileSync(pick, 'utf8').slice(0, 800); } catch { }
let ran = null; try { ran = pick && execFileSync(pick, ['--x=1', 'a, b'], { encoding: 'utf8', timeout: 10000 }); } catch (e) { ran = 'threw ' + (e && e.message); }
console.log(JSON.stringify({ rehomed: !!S.REHOMED, home: os.homedir(), real, builds, link, stamp, pick, prog, ran, placed: (S.REHOMED ? S.REHOMED.browsers : S.DRIVER_LEFT_ALONE && S.DRIVER_LEFT_ALONE.browsers) || null }));`;
  const brHome = (tag) => { const h = path.join(LA, `br-${tag}`); fs.mkdirSync(h, { recursive: true }); return h; };
  const BH = { left: brHome('left'), none: brHome('none'), gone: brHome('gone'), there: brHome('there'), cut: brHome('cut') };
  fs.mkdirSync(path.join(BH.there, '.agent-browser', 'browsers', 'chrome-1.0.0.0'), { recursive: true });   // a folder already there: never covered
  const brEnv = (h, extra = {}) => ({ HOME: h, PATH: LA_PATH, LANG: 'C.UTF-8', ...extra });
  const DB = scene('browsers', () => ({ env: { VS_AGENT_BROWSER_BROWSERS: BR_DIR } }));   // a stand-in the re-home takes
  const BR_CUT = mutant('brcut', 'function placeBrowsers(home, me) {\n', 'function placeBrowsers(home, me) {\n  return null;\n');
  // r4974 (2) RED: the release's shape — the named folder LINKED as the cache (the driver then takes the build's real binary, no rule)
  const BR_LINK = mutant('brlink', '    fs.renameSync(tmp, at); tmp = null;   // whole or not at all: a sibling never reads a half-made cache\n', '    fs.rmSync(tmp, { recursive: true, force: true }); tmp = null; fs.symlinkSync(real, at);   // the release\'s link\n');
  // r4974 (2): a home under NO temp root is refused by name and nothing is made there (planted: the re-home hands one)
  const NOT_TEMP_HOME = '/home/vs-hv-not-a-temp-home';
  const BR_REAL = mutant('brreal', '  const browsers = placeBrowsers(home, me);   // the driver\'s installed browsers the run NAMES (r2777), in this home of its own\n', `  const browsers = placeBrowsers(${JSON.stringify(NOT_TEMP_HOME)}, me);   // planted: a home under no temp root\n`);
  const goBR = (tag, env, url = SCRATCH_URL, dir = DIR, o = { clean: true }) => start(path.join(dir, `test-hv-drvbr-${tag}.mjs`), env, PROBE_BR(url), o);
  const [b1, b2, b3, b4, b5, bc] = await Promise.all([goBR('left', brEnv(BH.left, { VS_AGENT_BROWSER_BROWSERS: BR_DIR })), goBR('rehomed', { ...DB.s.env, ...DB.env }, SCRATCH_URL, DIR, {}),
    goBR('noname', brEnv(BH.none)), goBR('gone', brEnv(BH.gone, { VS_AGENT_BROWSER_BROWSERS: path.join(LA, 'no-builds') })),
    goBR('there', brEnv(BH.there, { VS_AGENT_BROWSER_BROWSERS: BR_DIR })), goBR('cut', brEnv(BH.cut, { VS_AGENT_BROWSER_BROWSERS: BR_DIR }), BR_CUT.url, path.dirname(BR_CUT.probe))]);
  const BHL = brHome('link');
  const [bl, br] = await Promise.all([goBR('link', brEnv(BHL, { VS_AGENT_BROWSER_BROWSERS: BR_DIR }), BR_LINK.url, path.dirname(BR_LINK.probe)), goBR('realhome', { ...DB.s.env, ...DB.env }, BR_REAL.url, path.dirname(BR_REAL.probe), {})]);
  const BUILD = 'chrome-151.0.7922.34', realOf = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
  const AT_LEFT = path.join(BH.left, '.agent-browser', 'browsers'), NAMED_REAL = realOf(BR_DIR);
  ok(!!b1.j && b1.j.rehomed === false && b1.j.link === false && (b1.j.builds || []).includes(BUILD) && !!b1.j.placed && b1.j.placed.at === AT_LEFT && !!b1.j.stamp && b1.j.stamp.named === NAMED_REAL && fs.lstatSync(AT_LEFT).isDirectory()
    && !!b2.j && b2.j.rehomed === true && b2.j.link === false && (b2.j.builds || []).includes(BUILD) && b2.j.home !== DB.s.home && !!b2.j.stamp && b2.j.stamp.named === NAMED_REAL,
    'THE INSTALLED BROWSERS (r2777; door (b) of r4974): every build of the folder VS_AGENT_BROWSER_BROWSERS names reaches the suite at <home>/.agent-browser/browsers — a left-alone suite\'s home (the folder stays with it after the exit) and the re-home\'s own — as a folder of THAT home\'s own, never a link of the named one, stamped with the named folder', { b1: b1.j, b2: b2.j, err: (b1.err + b2.err).slice(-300) });
  const RULE_B = SM.chromeNames(), progOk = (j) => !!j && typeof j.prog === 'string' && j.prog.includes(SM.NAMES_PROGRAM_MARK) && j.prog.includes(`exec '${realOf(BR)}' `);
  const ranIs = (j, words) => !!j && typeof j.ran === 'string' && JSON.stringify(j.ran.split('\n')) === JSON.stringify([...words, '']);
  ok([b1, b2].every((r) => !!r.j && r.j.pick === path.join(r.j.home, '.agent-browser', 'browsers', BUILD, 'chrome') && progOk(r.j) && ranIs(r.j, [RULE_B, '--x=1', 'a, b'])),
    'DOOR (b) (r4974 (2)): the DRIVER\'s own lookup in that cache (agent-browser 0.38.2: the highest «chrome-» build, its `chrome` first) finds the harness\'s Chrome program over the build\'s REAL binary by its real path — run, it hands the names rule FIRST and every argument after it whole (a comma inside one kept)', { b1: b1.j && { pick: b1.j.pick, ran: b1.j.ran }, b2: b2.j && { pick: b2.j.pick, ran: b2.j.ran } });
  ok(BR_LINK.present && !!bl.j && bl.j.link === true && realOf(bl.j.pick || '') === realOf(BR) && !progOk(bl.j) && ranIs(bl.j, ['--x=1', 'a, b']),
    'RED CONTROL (r4974 (2)): the release\'s link of the named folder as the cache — the driver\'s own lookup then takes the build\'s REAL binary, and no names rule reaches it (probe row 1024\'s driver-launched Chromes, made at will)', { j: bl.j && { link: bl.j.link, pick: bl.j.pick, ran: bl.j.ran }, err: bl.err.slice(-300) });
  ok(BR_REAL.present && !!br.j && !!br.j.placed && br.j.placed.at === null && /under no temp root/.test(br.j.placed.why || '') && /under no temp root/.test(br.err) && !fs.existsSync(NOT_TEMP_HOME),
    'A HOME UNDER NO TEMP ROOT is refused by name (r4974 (2): the harness\'s builds go only into a suite\'s own scratch home): none placed, said on stderr, nothing made there', { placed: br.j && br.j.placed, err: br.err.slice(-300) });
  ok(!!b3.j && b3.j.real === null && b3.j.placed === null && !fs.existsSync(path.join(BH.none, '.agent-browser'))
    && !!b4.j && b4.j.real === null && !!b4.j.placed && b4.j.placed.at === null && /VS_AGENT_BROWSER_BROWSERS names .*no-builds: no folder of installed browsers there/.test(b4.err),
    'NO NAME, NO BROWSERS: nothing is placed; a NAMED folder that is not there is none, said by name on stderr — never found, never fetched', { b3: b3.j, b4: b4.j, err: b4.err.slice(-300) });
  ok(!!b5.j && !!b5.j.placed && b5.j.placed.at === null && (b5.j.builds || []).join() === 'chrome-1.0.0.0' && /is there already/.test(b5.err) && fs.existsSync(path.join(BH.there, '.agent-browser', 'browsers', 'chrome-1.0.0.0')),
    'a home that HAS its installed browsers keeps them: the named folder never covers one, said by name, and what was there stays after the exit', { b5: b5.j, err: b5.err.slice(-300) });
  ok(BR_CUT.present && !!bc.j && bc.j.real === null && bc.j.placed === null,
    'RED CONTROL: the release\'s scratch (no browsers door) — the named folder never reaches the suite\'s home: row 401\'s «no installed browser under …», made at will', { j: bc.j, err: bc.err.slice(-300) });
  // THE FOLLOW (主开发 r2825): the builds folder is WHOLE after both kinds of exit (a left-alone child leaves its link; the re-home's
  // child has its home removed whole — the link, never its target); what stands there already IS the folder ⇒ quiet; a home that cannot
  // take the link ⇒ none, said by the variable's name, no stack trace; a link placed by another between the look and the link (EEXIST)
  // is «there already»; suites sharing one home all read the builds and none takes the link from another; a script that is not a suite
  // (no test-* / dbg-* name, outside scripts/) with both names and a throwaway home gets NOTHING
  ok(fs.existsSync(BR) && (fs.readdirSync(BR_DIR) || []).join() === BUILD, 'THE NAMED BUILDS FOLDER IS WHOLE after the left-alone child\'s exit and the re-homed child\'s (its home removed whole): no remover follows the link', fs.readdirSync(BR_DIR));
  const BH2 = { same: brHome('same'), file: brHome('file'), race: brHome('race'), shared: brHome('shared'), notsuite: brHome('notsuite') };
  fs.writeFileSync(path.join(BH2.file, '.agent-browser'), 'a file where the folder would go\n');   // a home that cannot take the link
  const BR_RACE = mutant('brrace', '  if (stands()) return thereAlready();\n', '  if (false) return thereAlready();\n');   // its look misses: the link meets EEXIST
  const named = (h) => brEnv(h, { VS_AGENT_BROWSER_BROWSERS: BR_DIR });
  // a sibling's placement, made first by a run of this harness (the stamped folder); the release's LINK of the named folder: another's
  const BH3 = { oldlink: brHome('oldlink') };
  fs.mkdirSync(path.join(BH3.oldlink, '.agent-browser')); fs.symlinkSync(BR_DIR, path.join(BH3.oldlink, '.agent-browser', 'browsers'));
  const [p0, p1] = await Promise.all([goBR('same0', named(BH2.same)), goBR('race0', named(BH2.race))]);
  const NOTSUITE = path.join(LA, 'probe-hv-notsuite.mjs');   // no suite name, outside the scripts folder: REHOMES is false
  const [q1, q2, q3, s1, s2, s3, ns] = await Promise.all([goBR('same', named(BH2.same)), goBR('file', named(BH2.file)), goBR('race', named(BH2.race), BR_RACE.url, path.dirname(BR_RACE.probe)),
    goBR('shared1', named(BH2.shared)), goBR('shared2', named(BH2.shared)), goBR('shared3', named(BH2.shared)),
    start(NOTSUITE, brEnv(BH2.notsuite, { VS_AGENT_BROWSER_BROWSERS: BR_DIR, VS_AGENT_BROWSER_BIN: LA_WANT }), PROBE_LA(SCRATCH_URL), { clean: true })]);
  const ol = await goBR('oldlink', named(BH3.oldlink));
  const ours = (j) => !!j && j.link === false && !!j.stamp && j.stamp.named === NAMED_REAL && (j.builds || []).includes(BUILD);
  ok(ours(p0 && p0.j) && ours(q1.j) && !!q1.j.placed && q1.j.placed.same === true && !/is there already|cannot take/.test(q1.err),
    'QUIET when what stands there IS this harness\'s placement of the named builds (a child of a named run, a sibling that placed it first: its stamp names the same folder): no line on stderr, the builds read', { j: q1.j, err: q1.err.slice(-300) });
  ok(!!ol.j && ol.j.link === true && !!ol.j.placed && ol.j.placed.at === null && !ol.j.placed.same && /is there already/.test(ol.err) && fs.lstatSync(path.join(BH3.oldlink, '.agent-browser', 'browsers')).isSymbolicLink(),
    'the RELEASE\'s link of the named folder, already in a home, is ANOTHER\'s folder: never covered, said by name, left as it stood', { j: ol.j && { link: ol.j.link, placed: ol.j.placed }, err: ol.err.slice(-300) });
  ok(!!q2.j && q2.j.real === null && !!q2.j.placed && q2.j.placed.at === null && /VS_AGENT_BROWSER_BROWSERS names .*cannot take it/.test(q2.err) && !/\n\s+at /.test(q2.err) && q2.status === 0,
    'a home that CANNOT take the link (its .agent-browser a file): none, said by the variable\'s name — never a stack trace, the suite goes on', { j: q2.j, err: q2.err.slice(-300), status: q2.status });
  ok(BR_RACE.present && ours(p1 && p1.j) && ours(q3.j) && !!q3.j.placed && q3.j.placed.same === true && q3.status === 0 && !/\n\s+at /.test(q3.err),
    'a placement made by ANOTHER between the look and the rename (a copy whose look misses meets the folder there) is «there already»: quiet, read, no crash', { j: q3.j, err: q3.err.slice(-300) });
  const AT_SHARED = path.join(BH2.shared, '.agent-browser', 'browsers');
  ok([s1, s2, s3].every((r) => ours(r.j) && r.status === 0) && fs.lstatSync(AT_SHARED).isDirectory() && JSON.parse(fs.readFileSync(path.join(AT_SHARED, SM.BROWSERS_STAMP), 'utf8')).named === NAMED_REAL && fs.existsSync(BR),
    'THREE SUITES ON ONE SHARED HOME at once: each reads the builds, none crashes, and after every exit the placement still stands with its stamp — none takes it from another (it stays with the home)', { s: [s1.j, s2.j, s3.j], err: (s1.err + s2.err + s3.err).slice(-400) });
  ok(!!ns.j && ns.j.rehomed === false && ns.j.left === null && ns.j.path === LA_PATH && !fs.existsSync(path.join(BH2.notsuite, '.agent-browser')),
    'A SCRIPT THAT IS NOT A SUITE (no test-* / dbg-* name, outside scripts/) with a throwaway home and BOTH names set gets nothing: no door, the PATH as handed, the home untouched — never the tier runner', { j: ns.j, err: ns.err.slice(-300) });
  ok(snapTree(BR_DIR) === SNAP_BR,
    'THE NAMED FOLDER IS ONLY READ (r4974 (2)): after every scene above — placed, quiet, raced, shared, refused, linked — its whole tree is as it was: no file written, renamed, linked or changed in it', { before: SNAP_BR.slice(0, 300), after: snapTree(BR_DIR).slice(0, 300) });
  // DOOR (a) (r4974 (1)): scratch.mjs driverHome writes a home's driver line — the quiet set through driverArgs (DRIVER_NAMES among it)
  // beside the keys handed — and refuses a home under no temp root by name, nothing written there
  const DHH = path.join(DIR, 'dh-home'); SM.driverHome(DHH, { config: { headed: false }, args: ['--no-sandbox'] });
  let dh = null; try { dh = JSON.parse(fs.readFileSync(path.join(DHH, '.agent-browser/config.json'), 'utf8')); } catch { }   // one segment: a read, never a driver line (§47e)
  let dhRefused = null; try { SM.driverHome(NOT_TEMP_HOME); } catch (e) { dhRefused = String(e && e.message); }
  const dhWords = dh ? String(dh.args).split(',') : [];
  ok(!!dh && dh.headed === false && dh.args === SM.driverArgs(SM.CHROME_QUIET, '--no-sandbox') && dhWords.includes(SM.DRIVER_NAMES) && dhWords.includes('--no-sandbox') && SM.CHROME_QUIET.filter((x) => x !== SM.chromeNames()).every((x) => dhWords.includes(x)) && /under no temp root/.test(dhRefused || '') && !fs.existsSync(NOT_TEMP_HOME),
    'DOOR (a) (r4974 (1)): driverHome writes <home>/.agent-browser/config.json — every quiet switch and DRIVER_NAMES through driverArgs, the keys handed beside them — and a home under no temp root is refused by name, nothing made there', { dh, dhRefused });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
