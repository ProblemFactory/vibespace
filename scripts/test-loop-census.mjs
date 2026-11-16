#!/usr/bin/env node
// test-loop-census — lane hub-loop-stalls, unit loop-day-report M3 (+ cure r2, S2 «EVERY HUB-SIDE FILE HAS AN OWNER»): WHAT
// THE MAIN LOOP SPENDS ITSELF ON, BY OWNER (FAST: PURE + a static census of the tree + the REAL watchdog thread in this
// process for ~5 s, 1.6 s of it planted burns; src/loop-census.js, the census in src/server/sync-fs-witness-worker.js,
// `census()` in src/server/sync-fs-witness.js).
//   ① PURE — ownerOf over a real file per owner (+ the families two owners share, the helpers, files with no row);
//      bookOf over the real shapes: a session's creation under the page handler books the conversation, the vault engine
//      under an agent route books the vault, a helper between an owner and its caller is passed and counted (viaHelper),
//      the walk never passes an owned frame, helpers or a library alone book outside, a full frame list with no owned frame
//      books deep; FRAME_LIMIT against the sample's own expression; slowerAfter; censusFold of a FIXED take ⇒ a FIXED result
//   ② THE OWNERS COVER THE HUB — every file the hub can load (server.js + src/**, less what ONLY the page bundles or the
//      device agent's bundles reach — their entries read off package.json's build) matches EXACTLY ONE owner or sits on
//      the helpers' list; the count per owner, the helpers (with why) and the unowned printed; an unowned file is red BY NAME
//   ③ LIVE — the real watchdog at a dense test rate (50 ms) over a scratch install: a burn inside
//      <scratch>/src/server/channels-burn.js ⇒ its busy ticks book «channels», the idle half books idle; the same burn inside
//      a helper it calls ⇒ «channels» through a helper (viaHelper); 40 helper frames deep ⇒ outside + deep; the setting off
//      ⇒ paused, nothing asked; a 0.8 s synchronous child under a 0.4 s hold bar ⇒ held, and THE HOLD TAKES the census's ask
//      in flight (its first sample — never a wait behind it); a capture running ⇒ the census asks nothing; the take resets
//   ④ the doors — no watchdog / the census off ⇒ census() answers null; the three takers through one function
// MUTANTS (each run on a scratch COPY outside every worktree, each red here): the walk passing owned frames (①b), no vault
// rule (①b ②), the helper not counted (①b ③a2), deep never said (①b ③a3), two owners' rules swapped (①a), a rule dropped
// (② by name), a new file with no row (② by name), the priority rule — the hold does not take the census's ask (③c) / the
// census asks while a capture runs (③d) — the reset at take (③e).
// Run: TZ=UTC node scripts/test-loop-census.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const LC = require(path.join(REPO, 'src/loop-census.js'));
const LH = require(path.join(REPO, 'src/loop-hold.js'));
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 1500) : '')); } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-loop-census-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORDER = 'interface,vault,channels,money,workspace,machines,conversation';
// on a tree without the owners (d22a7b717) every new leg is RED by itself, never a throw that hides the others
const OWNERS = LC.OWNERS || [], HELPERS = LC.HELPERS || [], ownerOf = LC.ownerOf || (() => undefined);

// ── ① PURE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① PURE — the owners, one answer booked, the rate, one take folded');
{
  const FIX = [
    ['server.js', 'interface'], ['src/ws-handler.js', 'interface'], ['src/server/session-broadcast.js', 'interface'], ['src/auth.js', 'interface'], ['src/server/sync-fs-witness.js', 'interface'], ['src/store-writer.js', 'interface'],
    ['src/server/vault-engine.js', 'vault'], ['src/server/integration-store.js', 'vault'], ['src/browser-login.js', 'vault'], ['src/secret-box.js', 'vault'],
    ['src/server/channels-engine.js', 'channels'], ['src/channels/slack.js', 'channels'], ['src/channel-store.js', 'channels'], ['src/routes/channels.js', 'channels'],
    ['src/server/usage-pool-engine.js', 'money'], ['src/harnesses/claude-quota.js', 'money'], ['src/server/spend-guard.js', 'money'], ['src/server/conversation-deliver.js', 'money'], ['src/server/stream-wall.js', 'money'],
    ['src/server/task-fanout.js', 'workspace'], ['src/server/groups-engine.js', 'workspace'], ['src/channel-groups.js', 'workspace'], ['src/server/grants-store.js', 'workspace'], ['src/server/design-engine.js', 'workspace'],
    ['src/jobs.js', 'machines'], ['src/server/browser-keeper.js', 'machines'], ['src/browser-profiles.js', 'machines'], ['src/mounts.js', 'machines'], ['src/agentd/client.js', 'machines'], ['src/server/window-targets-engine.js', 'machines'],
    ['src/ws-create.js', 'conversation'], ['src/server/stdout/claude-stream-json.js', 'conversation'], ['src/agent-routes.js', 'conversation'], ['src/server/session-brain.js', 'conversation'], ['src/server/browser-stream.js', 'conversation'],
    ['src/harnesses/claude-transport.js', 'conversation'], ['src/usage-walker.js', 'conversation'], ['src/design-fs.js', 'conversation'], ['src/server/browser-login-fill.js', 'conversation'], ['src/server/stream-relays.js', 'conversation'],
    ['src/server/lazy.js', LC.HELPER], ['src/hidden-chars.js', LC.HELPER], ['src/store-pace.js', LC.HELPER],
    ['node_modules/ws/lib/websocket.js', null], ['data/plugins/x/index.js', null], ['src/agentd/agentd.js', null], ['', null],
  ];
  const wrong = FIX.map(([p, id]) => [p, id, ownerOf(p)]).filter(([, id, got]) => got !== id);
  ok(!wrong.length && LC.IDS.join() === `${ORDER},outside` && OWNERS.length === 7 && OWNERS.every((o) => FIX.some(([, id]) => id === o.id)) && FIX.every(([p]) => !p.startsWith('src/') || fs.existsSync(path.join(REPO, p))) && fs.existsSync(path.join(REPO, 'server.js')),
    `ownerOf: a real file of the tree per owner (${LC.IDS.join(', ')} — that order), the families two owners share (browser, harnesses, usage, stream, exit, session), the helpers, and no row for node_modules / data / the device agent / nothing`, wrong);
  // the sample's own encoding (src/loop-hold.js SAMPLE_EXPR): 'C' + <n>:<name><n>:<file><line>,<own line><e|n> each
  const C = (frames) => 'C' + frames.map(({ fn = 'f', file, ev = false }) => `${fn.length}:${fn}${file.length}:${file}3,1${ev ? 'e' : 'n'}`).join('');
  const R = '/srv/hub';
  const S = (lines) => { const t = ['Error', ...lines].join('\n'); return `S${t.length}:${t}`; };
  const at = (rel) => ({ file: `${R}/${rel}` });
  const lib = (i) => ({ file: `${R}/node_modules/lib${i}/index.js` });
  const helper20 = Array.from({ length: 20 }, () => at('src/hidden-chars.js'));
  const B = (owner, viaHelper = false, deep = false) => ({ owner, viaHelper, deep });
  const cases = [
    // THE REAL SHAPES (the coordinator's): a create that arrives as a page message is the conversation's, not the page protocol's
    [C([at('src/ws-create.js'), at('src/ws-handler.js'), at('server.js')]), B('conversation'), 'a session\'s creation (src/ws-create.js) under the page handler (src/ws-handler.js) books the conversation'],
    [C([lib(1), { file: 'node:internal/fs/utils' }, at('src/ws-create.js'), at('src/ws-handler.js')]), B('conversation'), 'a library and Node\'s internals under the create are passed: the conversation'],
    [C([{ file: 'node:crypto' }, at('src/server/vault-engine.js'), at('src/agent-routes.js'), at('server.js')]), B('vault'), 'the vault engine under an agent route books the vault'],
    [C([at('src/hidden-chars.js'), at('src/peer-text.js'), at('src/server/channels-engine.js'), at('src/ws-handler.js')]), B('channels', true), 'two helpers between the channels engine and its caller are passed and counted: channels, viaHelper'],
    [C([at('src/server/session-brain.js'), at('src/ws-handler.js')]), B('conversation'), 'the walk never passes an owned frame: the live-output consumer, not the page handler that called it'],
    [C([at('src/hidden-chars.js'), at('src/server/lazy.js')]), B('outside'), 'helpers alone: outside (nothing booked onto a caller, so no viaHelper)'],
    [C([lib(1), { file: 'node:internal/timers' }]), B('outside'), 'a library and Node\'s internals alone: outside'],
    [C([{ fn: 'hr', file: `${R}/src/server/loop-blame.js` }, at('src/server/sync-fs-witness.js'), { file: 'node:fs' }, at('src/usage-history.js')]), B('money'), 'the instrument\'s own frames after a wrapped sync call trimmed: its caller'],
    [C([{ fn: 'hr', file: `${R}/src/server/loop-blame.js` }, at('src/server/sync-fs-witness.js')]), B('interface'), 'a stack that is the instrument\'s alone stays the instrument\'s: the hub process\'s own (interface)'],
    [C([{ file: `${R}/src/jobs.js`, ev: true }, at('src/ws-handler.js')]), B('interface'), 'an eval\'d frame is never the install\'s'],
    [C([at('data/plugins/x/index.js'), at('src/server/plugin-loader.js')]), B('machines'), 'an install file with no row (a plugin\'s own code) is passed: its loader'],
    [C([{ file: '' }, { file: 'node:internal/timers' }, { file: '/elsewhere/plugin.js' }]), B('outside'), 'no frame of the install: outside'],
    [C([]), B('native'), 'no JavaScript frame: native'],
    // THE FRAME LIMIT: a full list with no owned frame is deep — the owner may lie beyond it; under the limit, or an owner in it, is not
    [C([...helper20, ...Array.from({ length: LC.FRAME_LIMIT - 20 }, (_, i) => lib(i))]), B('outside', false, true), `a full list (${LC.FRAME_LIMIT} frames, the sample\'s limit) of helpers and libraries: outside, deep`],
    [C([...helper20, ...Array.from({ length: LC.FRAME_LIMIT - 21 }, (_, i) => lib(i))]), B('outside'), `${LC.FRAME_LIMIT - 1} frames, no owner: outside, not deep (nothing was cut)`],
    [C([...helper20, ...Array.from({ length: LC.FRAME_LIMIT - 21 }, (_, i) => lib(i)), at('src/jobs.js')]), B('machines', true), `a full list whose last frame is owned: the owner (through the helpers), not deep`],
    [S(['    at f0 (/srv/hub/src/x.js:1:1)', '    at f (/srv/hub/src/jobs.js:3:4)', '    at g (/srv/hub/src/ws-handler.js:5:6)']), B('machines'), 'the string form (locations only) books the same way'],
    [S(['    at f0 (/srv/hub/src/x.js:1:1)', ...Array.from({ length: LC.FRAME_LIMIT + 4 }, (_, i) => `    at g${i} (/srv/hub/node_modules/l/i.js:${i + 1}:1)`)]), B('outside', false, true), 'the string form cut at its limit with no owned frame: outside, deep'],
    ['D', null, 'a debugger\'s stand-down: not sampled'], ['A', null, 'an accessor\'s stand-down: not sampled'], [S(['garbage']), null, 'frames unreadable: not sampled'], [null, null, 'no text: not sampled'],
  ];
  const bad = cases.map(([t, want, why]) => [why, want, LC.bookOf(t, R)]).filter(([, want, got]) => JSON.stringify(got) !== JSON.stringify(want));
  ok(!bad.length, `bookOf: ${cases.map(([, , why]) => why).join('; ')}`, bad);
  ok(/E\.stackTraceLimit = 32;/.test(LH.SAMPLE_EXPR) && /for \(let i = 1; i < cs\.length; i\+\+\)/.test(LH.SAMPLE_EXPR) && LC.FRAME_LIMIT === 32 - 1,
    `FRAME_LIMIT ${LC.FRAME_LIMIT} = the sample's own expression: 32 frames asked of V8, its own skipped`);
  const sl = [LC.slowerAfter(1000, 4.5), LC.slowerAfter(1000, LC.ASK_BOUND_MS), LC.slowerAfter(4000, 9), LC.slowerAfter(8000, 50), LC.slowerAfter(1000, NaN), LC.slowerAfter(1000, 0.2)];
  ok(JSON.stringify(sl) === '[2000,null,8000,null,null,null]' && LC.ASK_BOUND_MS === 4 && LC.CENSUS_FLOOR_MS === 8000 && LC.CENSUS_EVERY_MS === 1000,
    `slowerAfter: an ask past 4 ms halves the rate (1 s → 2 s, 4 s → 8 s), never slower than one per 8 s; at the bound or under, unchanged — so the bound's worst hour is 3 600 asks × (4 + ${LC.DISPATCH_MS}) ms = ${(3600 * (LC.ASK_BOUND_MS + LC.DISPATCH_MS) / 1000).toFixed(1)} s`, sl);
  const TAKE = { ev: 'census', id: 7, fromM: 1000, toM: 3601000, everyMs: 1000, ticks: { idle: 1500, held: 30, stopped: 0, notSampled: 12, paused: 8 }, pausedBy: { heap: 8 },
    families: { channels: 600, money: 300, conversation: 150, interface: 150, outside: 90, native: 60, vault: 0, renamed: 10 }, viaHelper: 120, deep: 7, asks: 1290, askOwnMs: 258, askMaxMs: 1.75, halved: null };
  const w = (id) => (id === 'outside' ? (LC.OUTSIDE || {}).words : (OWNERS.find((o) => o.id === id) || {}).words);
  const row = (id, n) => ({ family: id, words: w(id), ticks: n, share: n / 1360 });
  const WANT = { fromM: 1000, toM: 3601000, everyMs: 1000, sampledTicks: 2890, busyTicks: 1360, busyShare: 1360 / 2890,
    shares: [row('channels', 600), row('money', 300), row('interface', 150), row('conversation', 150), row('outside', 100), row('vault', 0), row('workspace', 0), row('machines', 0)],
    native: { ticks: 60, share: 60 / 1360, words: LC.NATIVE_WORDS }, viaHelper: { ticks: 120 }, deep: { ticks: 7 },
    idle: { ticks: 1500, share: 1500 / 2890 }, held: { ticks: 30, share: 30 / 2890 }, stopped: { ticks: 0, share: 0 },
    notSampled: { ticks: 20, paused: 8, pausedBy: { heap: 8 } }, cost: { asks: 1290, ownMs: 258, meanMs: 0.2, maxMs: 1.75, halved: null, dispatchMs: 1290 * LC.DISPATCH_MS, paidMs: 258 + 1290 * LC.DISPATCH_MS }, words: LC.TICK_WORDS };
  const F = LC.censusFold(TAKE);
  ok(JSON.stringify(F) === JSON.stringify(WANT) && Math.abs(F.shares.reduce((s, x) => s + x.share, 0) + F.native.share - 1) < 1e-12,
    'censusFold of a FIXED take ⇒ a FIXED result: the seven owners and outside each a share of the BUSY ticks (larger first, a tie in the table\'s order, an id it does not know is outside\'s), native beside them — together 1; viaHelper and deep as ticks; idle / held of the sampled; paused counted not sampled; the asks\' cost', F);
  const E = LC.censusFold(null);
  ok(E.busyTicks === 0 && E.busyShare === null && E.shares.length === 8 && E.shares.every((x) => x.share === null) && E.viaHelper?.ticks === 0 && E.deep?.ticks === 0 && E.cost.meanMs === null, 'an empty take folds to nothing claimed (no share without a tick)', E);
  ok(/OWNER of the first owned frame walking outward/.test(LC.TICK_WORDS) && !/innermost frame of/.test(LC.TICK_WORDS) && /outside/.test(LC.TICK_WORDS) && /deep/.test(LC.TICK_WORDS),
    'the tick words say the outward walk to the first owned frame, outside and deep — never «the innermost frame»', LC.TICK_WORDS);
}

// ── ② THE OWNERS COVER THE HUB ────────────────────────────────────────────────────────────────────────────────────────
console.log('② the owners cover the hub — every file the hub can load in exactly one owner, or on the helpers\' list');
{
  // THE RULE for «the hub can load it»: server.js + every src/**/*.{js,mjs,cjs}, LESS the files that ONLY a page bundle or
  // ONLY a device bundle reaches — each bundle's closure walked from its entries (read off package.json's esbuild lines:
  // --platform=browser ⇒ a page bundle, --platform=node ⇒ the device agent's), never reached from server.js. A file no
  // closure reaches (a worker script, an adapter a registry loads by name) is the hub's.
  const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const entries = { browser: [], node: [] };
  for (const v of Object.values(PKG.scripts || {})) for (const m of String(v).matchAll(/esbuild (src\/\S+?\.[cm]?js) --bundle\b[^&]*?--platform=(browser|node)/g)) entries[m[2]].push(m[1]);
  const files = [];
  (function walk(rel) { for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) { const r = `${rel}/${e.name}`; if (e.isDirectory()) walk(r); else if (e.isFile() && /\.[cm]?js$/.test(e.name)) files.push(r); } })('src');
  files.push('server.js');
  const known = new Set(files);
  const resolve = (from, spec) => {
    if (!spec.startsWith('.')) return null;
    const b = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    for (const c of [b, `${b}.js`, `${b}/index.js`]) if (known.has(c)) return c;
    return null;
  };
  const text = new Map();
  const edges = (f) => {
    const t = text.get(f) ?? fs.readFileSync(path.join(REPO, f), 'utf8'); text.set(f, t);
    const out = [];
    for (const re of [/require\(\s*['"]([^'"]+)['"]\s*\)/g, /(?:^|[\s;])(?:import|export)\s[^'";]*?from\s*['"]([^'"]+)['"]/gm, /(?:^|[\s;])import\s*['"]([^'"]+)['"]/gm, /import\(\s*['"]([^'"]+)['"]\s*\)/g])
      for (const m of t.matchAll(re)) { const r = resolve(f, m[1]); if (r) out.push(r); }
    return out;
  };
  const closure = (from) => { const seen = new Set(), q = [...from]; while (q.length) { const f = q.pop(); if (seen.has(f) || !known.has(f)) continue; seen.add(f); q.push(...edges(f)); } return seen; };
  const HUB = closure(['server.js']), PAGE = closure(entries.browser), DEVICE = closure(entries.node);
  const pageOnly = [...PAGE].filter((f) => !HUB.has(f)), deviceOnly = [...DEVICE].filter((f) => !HUB.has(f));
  const hubSide = files.filter((f) => !(PAGE.has(f) && !HUB.has(f)) && !(DEVICE.has(f) && !HUB.has(f)));
  const by = Object.fromEntries(OWNERS.map((o) => [o.id, 0])), unowned = [], twice = [], helperRuled = [];
  const helperSet = new Set(HELPERS.map((h) => h.path));
  for (const f of hubSide) {
    const hits = OWNERS.filter((o) => o.rules.some((re) => re.test(f))).map((o) => o.id);
    if (helperSet.has(f)) { if (hits.length) helperRuled.push(`${f} → ${hits.join(', ')}`); continue; }
    if (!hits.length) unowned.push(f); else if (hits.length > 1) twice.push(`${f} → ${hits.join(' and ')}`); else by[hits[0]]++;
  }
  const dead = OWNERS.flatMap((o) => o.rules.map((re, i) => [o.id, i, re]).filter(([, , re]) => !hubSide.some((f) => re.test(f))).map(([id, i]) => `${id} rule ${i}`));
  const strayHelpers = HELPERS.filter((h) => !hubSide.includes(h.path)).map((h) => h.path);
  console.log(`    the page bundles (${entries.browser.join(', ')}) reach ${PAGE.size} files, ${pageOnly.length} of them only theirs; the device bundles (${entries.node.join(', ')}) ${DEVICE.size}, ${deviceOnly.length} only theirs`);
  console.log(`    THE HUB LOADS ${hubSide.length} files — ${OWNERS.map((o) => `${o.id} ${by[o.id]}`).join(' · ')} · helpers ${HELPERS.length} · unowned ${unowned.length}`);
  for (const h of HELPERS) console.log(`      helper ${h.path} — ${h.why}`);
  if (unowned.length) console.log(`    UNOWNED (each needs an owner's rule or, holding no state, a helper's row): ${unowned.join(', ')}`);
  ok(entries.browser.includes('src/client.js') && entries.node.includes('src/agentd/agentd.js') && HUB.has('src/ws-handler.js') && pageOnly.length > 100 && hubSide.length > 600,
    `the bundles' entries read off package.json (${entries.browser.length} page, ${entries.node.length} device) and server.js's closure walked`, { entries, hub: HUB.size });
  ok(!unowned.length, `UNOWNED = 0 — every one of the ${hubSide.length} files the hub can load has an owner or is a helper`, unowned);
  ok(OWNERS.length === 7 && !twice.length && !helperRuled.length, 'EXACTLY ONE owner per file — no file matches two owners\' rules, no helper matches an owner\'s', { twice, helperRuled });
  ok(OWNERS.map((o) => o.id).join() === ORDER && OWNERS.every((o) => by[o.id] > 0) && !dead.length && !strayHelpers.length && HELPERS.length && HELPERS.length <= 16 && HELPERS.every((h) => h.why && fs.existsSync(path.join(REPO, h.path))),
    `the seven owners in their order, each takes files; no rule matches nothing; the helpers' list is short (${HELPERS.length}), each a real hub-side file with its why`, { by, dead, strayHelpers });
  ok(OWNERS.length && OWNERS.reduce((s, o) => s + by[o.id], 0) + HELPERS.length === hubSide.length, 'the owners\' counts and the helpers add up to the files the hub loads', by);
}

// ── ③ LIVE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('③ LIVE — the real watchdog thread in this process, a dense test rate (50 ms), a scratch install');
const ROOT = path.join(TMP, 'install');
fs.mkdirSync(path.join(ROOT, 'src/server'), { recursive: true });
// the planted work: a module whose install-relative path is the channels owner's (its frames are the only owned frames), and a
// helper it calls — at the install-relative path of a real helper (src/shell-words.js): its frames are passed, never booked
fs.writeFileSync(path.join(ROOT, 'src/shell-words.js'), "'use strict';\nfunction spin(span) { const t0 = Date.now(); let x = 0; while (Date.now() - t0 < span) x += Math.sqrt(x + 1); return x; }\n"
  + "function deep(n, span) { return n > 0 ? deep(n - 1, span) + 1 : spin(span); }\nmodule.exports = { spin, deep };\n");
fs.writeFileSync(path.join(ROOT, 'src/server/channels-burn.js'), "'use strict';\nconst H = require('../shell-words.js');\n"
  + "function burn(span) { const t0 = Date.now(); let x = 0; while (Date.now() - t0 < span) x += Math.sqrt(x + 1); return x; }\n"
  + "function viaHelper(span) { return H.spin(span) + 1; }\nfunction deepBurn(span) { return H.deep(40, span) + 1; }\nmodule.exports = { burn, viaHelper, deepBurn };\n");
const B = require(path.join(ROOT, 'src/server/channels-burn.js'));
const SFW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
const said = [];
let samplingOn = true;
const quiet = { warn: (l) => said.push(String(l)), log() {}, error() {}, info() {} };
const W = SFW.create({ rootDir: ROOT, armed: true, readMountinfo: () => '', fresh: true, beatMs: 50, holdMs: 400, noAnswerMs: 50, liveMs: 60000, censusEveryMs: 50, samplingOn: () => samplingOn,
  log: quiet, holdsOptions: { eluEveryMs: 50, eluBeforeMs: 500, captureMs: 800, captureEveryMs: 20, autoCapture: false } }).start({ installHook: false });
const sumOf = (t) => Object.values(t.ticks).reduce((s, n) => s + n, 0) + Object.values(t.families).reduce((s, n) => s + n, 0);
try {
  await sleep(400);   // the watchdog thread up
  ok(!!(await W.census()), 'census() answers the take of a running census');
  // (a) half busy inside the channels owner, half idle
  for (let i = 0; i < 4; i++) { B.burn(140); await sleep(1); }
  await sleep(400);
  const a = await W.census(), fa = LC.censusFold(a);
  ok(a && a.families.channels >= 5 && fa.shares[0].family === 'channels' && fa.shares[0].share > 0.5 && a.ticks.idle >= 5 && a.asks >= 5 && a.askMaxMs > 0 && a.everyMs === 50 && a.viaHelper === 0 && a.deep === 0,
    `(a) a burn inside src/server/channels-burn.js: «channels» books ${a && a.families.channels} of ${fa.busyTicks} busy ticks, the idle half ${a && a.ticks.idle} idle ticks; ${a && a.asks} asks, their own run ${a && a.askOwnMs.toFixed(2)} ms (largest ${a && a.askMaxMs.toFixed(3)} ms); none through a helper, none deep`, a);
  // (a2) the same burn inside a HELPER the channels file calls: booked on channels, counted through a helper
  for (let i = 0; i < 4; i++) { B.viaHelper(100); await sleep(1); }
  const a2 = await W.census(), fa2 = LC.censusFold(a2);
  ok(a2 && a2.families.channels >= 3 && a2.viaHelper >= 3 && a2.viaHelper <= a2.families.channels && (a2.families.outside || 0) <= 1 && fa2.viaHelper?.ticks === a2.viaHelper,
    `(a2) a burn inside a helper (src/shell-words.js) called by src/server/channels-burn.js: «channels» books ${a2 && a2.families.channels} ticks, ${a2 && a2.viaHelper} of them through the helper (viaHelper), ${(a2 && a2.families.outside) || 0} outside (the test's own frames between burns)`, a2);
  // (a3) the burn 40 helper frames deep: the sample's 31 frames hold no owned one — outside, deep (the owner lies beyond)
  for (let i = 0; i < 4; i++) { B.deepBurn(100); await sleep(1); }
  const a3 = await W.census(), fa3 = LC.censusFold(a3);
  ok(a3 && a3.families.outside >= 3 && a3.deep >= 3 && a3.deep <= a3.families.outside && (a3.families.channels || 0) <= 1 && fa3.deep?.ticks === a3.deep,
    `(a3) the burn under 40 helper frames: ${a3 && a3.families.outside} ticks outside, ${a3 && a3.deep} of them deep — the sample's ${LC.FRAME_LIMIT} frames end before channels-burn.js`, a3);
  // (b) the setting off: paused, nothing asked
  samplingOn = false; await sleep(120); await W.census();   // the flag reaches the thread on a beat: an hour that starts after it is paused whole
  await sleep(300);
  const b = await W.census();
  samplingOn = true; await sleep(150); await W.census();
  ok(b && b.ticks.paused >= 3 && b.pausedBy.off >= 3 && b.asks === 0, `(b) the sampling setting off pauses the census as it stops a capture: ${b && b.ticks.paused} ticks paused (off), nothing asked`, b);
  // (c) a hold: a synchronous child (no JavaScript runs) past the 0.4 s bar — the census's ask in flight is TAKEN by the hold
  const h0 = W.holds().ring().length;
  cp.spawnSync('sleep', ['0.8']);
  await sleep(300);
  const c = await W.census(), held = W.holds().ring().slice(h0);
  ok(c && held.length === 1 && held[0].samples >= 1 && c.ticks.held >= 1 && c.ticks.notSampled >= 1,
    `(c) a 0.8 s synchronous child: ${c && c.ticks.held} ticks held; the HOLD TOOK the census's ask in flight — its first sample «${held[0] && held[0].frame}» — and the census's waiting ticks are not sampled (${c && c.ticks.notSampled})`, { c, held });
  // (d) a capture running: the census asks nothing (its busy ticks are not sampled); the capture samples
  const r = W.holds().startCapture({ auto: false });
  await W.census();   // after the capture's message (one port, in order): this take's window lies inside the capture
  for (let i = 0; i < 4; i++) { B.burn(100); await sleep(1); }
  const d = await W.census();
  for (let i = 0; i < 40 && !W.holds().captureReport().last; i++) await sleep(100);   // the capture's end (its 0.8 s window, then its names)
  const last = W.holds().captureReport().last;
  ok(r.ok && d && d.asks === 0 && d.ticks.notSampled >= 3 && last && last.samples >= 10,
    `(d) while a capture runs the census asks nothing: ${d && d.ticks.notSampled} busy ticks not sampled, ${d && d.asks} asks — the capture took ${last && last.samples} samples`, { r, d, last: last && { samples: last.samples, split: last.split } });
  // (e) the take resets: the next hour starts where it ended, from zero
  await sleep(250);
  const e1 = await W.census(), e2 = await W.census();
  ok(e1 && e2 && e2.fromM === e1.toM && sumOf(e1) >= 3 && sumOf(e2) <= 2 && e2.asks <= 1 && e2.halved === null,
    `(e) a take resets the counts: the next starts at its end (${e1 && sumOf(e1)} ticks, then ${e2 && sumOf(e2)})`, { e1, e2 });
} finally { W.stop(); }

// ── ④ THE DOORS ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('④ the doors');
{
  const none = SFW.create({ rootDir: ROOT, readMountinfo: () => '', fresh: true, live: false, log: quiet }).start({ installHook: false });
  const off = SFW.create({ rootDir: ROOT, readMountinfo: () => '', fresh: true, beatMs: 50, holdMs: 400, censusEveryMs: 0, log: quiet }).start({ installHook: false });
  await sleep(200);
  const [n1, n2] = [await none.census(), await off.census()];
  none.stop(); off.stop();
  ok(n1 === null && n2 === null, 'census() answers null with no watchdog thread and with the census off (no take, never a guess)', { n1, n2 });
  const WK = fs.readFileSync(path.join(REPO, 'src/server/sync-fs-witness-worker.js'), 'utf8');
  ok(/const q = takeCensusAsk\(\{ kind: 'hold', h \}\) \|\| ask\(\{ kind: 'hold', h \}\);/.test(WK) && /if \(!hold\) takeCensusAsk\(\{ kind: 'capture', c, pending: \[\] \}\);/.test(WK)
    && /if \(!hold && takeCensusAsk\(\{ kind: 'profile', pr, pq: \{ countedTo: now, counted: false \} \}\)\) return;/.test(WK)
    && /const k = CC\.tickOf\(\{ state, wchan, sys, beatAgeMs: now - T\[1\], freshMs: 2 \* beatMs \+ noAnswerMs, holdOpen: !!hold, mine: own, other: \(!!inflight && !own\) \|\| !!cap \|\| !!prof \}\);/.test(WK)
    && /startCensus\(censusEveryMs\);/.test(WK),
    'the watchdog: a hold, a capture and a profile TAKE the census\'s ask through ONE function; the census\'s tick is a capture\'s tick (CC.tickOf) with every other asker counted as «another ask out»; it starts with the watchdog');
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
