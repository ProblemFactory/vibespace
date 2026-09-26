#!/usr/bin/env node
// AGENT BROWSER P0 — the ENVIRONMENT half (docs/design-agent-browser-v2.zh.md
// §3.2, §9's `test-browser-profiles` row).
//
// WHAT THIS SUITE IS FOR. P0 is four environment variables at spawn, and three
// of the four are easy to get wrong in a way that still reads correctly:
//
//   · THE GATE ASSERTS THE RESOLVED USER-DATA-DIR, NOT THE ENV STRINGS. §9 says
//     this in so many words and §3.2.2 says why: with only SESSION + NAMESPACE
//     set, the installed CLI still resolves the SHARED `default-profile`
//     (MEASURED, 2026-09-13, 0.32.0 on this box). That is variant B — the
//     broken one — and a suite that asserted the two strings would be green on
//     it. Leg ② is that negative control, spelled out.
//   · THE KEY IS THE CONVERSATION'S, NOT THE WEBUI ID'S. Leg ③ drives the
//     ladder over new / resume / resume-with-no-record / fork.
//   · THE IDLE TIMEOUT IS EXPLICIT. An inherited default is `disabled` on the
//     installed build and EXEMPTS headed browsers above it, so nothing would
//     ever reclaim the browsers this feature creates.
//
// It also pins the pin indirection's no-restart property (leg ⑥) by writing
// through the REAL resolver and reading back what the NEXT command would
// resolve — off the FILE, because an in-memory answer passes with a writer that
// never lands.
//
// r4 (the round-3 verifier, each reproduced on the real binary first):
//   · A FENCED CONFIG NEVER LANDS ON C (leg ④ + ⑰): rung C IS an
//     `AGENT_BROWSER_PROFILE`, which the CLI refuses beside `--allowed-domains`,
//     so round 3's `D → C` under a fence was a browser that refused every
//     command. `fenced` is an INPUT of the PURE ladder; the C rung also records
//     the session's cwd beside its link so a later pin can ask BOTH files.
//   · ONE QUESTION, TWO SPELLINGS, ONE TABLE (leg ⑭): the shipped fragment's
//     awk and `configNamesProfile` are driven over the same rows under every
//     shell AND every awk on the box; round 3's grep counted `"profile": null`.
//   · THE PIN'S MOMENT IS MEASURED (leg ⑥): the next COMMAND relaunches the
//     browser and loses the page — the sentence rounds 1-3 inherited was false.
//   · THE FIFTH VARIABLE (leg ⑱ + ⑨): a HOME over 38 characters made every
//     command answer "Session name … is too long"; `AGENT_BROWSER_SOCKET_DIR`
//     is set at an owned 0700 directory only when the CLI's own root is over
//     the 103-byte limit, and a hijacked name means no variable, said aloud.
//
// r5 (the round-4 verifier, each reproduced first — leg ⑳, three patched-copy
// or retired-bytes controls; the end-to-end halves live in
// test-browser-continuity on a real worktree server):
//   · THE FLOOR NOTICE LATCHES ON DELIVERY: round 4 latched before asking, so a
//     headless restart told nobody for ever; `serverNotice` now reports the
//     count, an undelivered notice is re-asked (ws-create on every connection).
//   · THE CONVERSATION'S KEY OUTLIVES ITS WEBUI SESSION: `priorKeyFor` read the
//     meta file the kill path unlinks; `browser-bindings.json` is rung 1 now.
//   · THE INTRO NEVER LIES ABOUT THE RUNG: "close --all closes only yours" is
//     said only to a session that really has its own browser.
//
// FAST TIER: no ports, no fixed /tmp path, no browser. The legs that touch the
// real binary (⑨) are LAUNCH-FREE (`session info --json` and a refusal that is
// an argument check, both measured) and SKIP WITH EVIDENCE when the tool is
// absent. The socket directory this suite makes lives under its OWN scratch
// base (`socketDirBase`), never at the production `/tmp/vs-ab-<uid>` — a
// machine-global name the fast tier may not claim.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
/** lane H verify r4: every generated config carries the keeper's launch MARK for its browser key as its LAST `args`
 *  switch — the config minus that mark (a missing / misplaced mark leaves a '<NO MARK …>' args that fails every pin). */
const unmark = (cfg, key) => {
  const m = B.keeperMarkArg(key); const a = cfg && cfg.args;
  if (typeof a === 'string' && a.endsWith(',' + m) && a.split(m).length === 2) return { ...cfg, args: a.slice(0, -(m.length + 1)) };
  if (a === m) { const { args: _a, ...rest } = cfg; return rest; }
  return { ...cfg, args: `<NO MARK ${m}> ${a}` };
};
const BE = require('../src/server/browser-env.js');
const { createBrowserFacts, sanitizeProbeEnv } = require('../src/browser-facts.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const REPO = new URL('..', import.meta.url).pathname;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const ROOT = scratch('browser-profiles');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'data', 'session-meta'), { recursive: true });
const DATA = path.join(ROOT, 'data');
const HOME = path.join(ROOT, 'home');
fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
// This machine's REAL user config shape, verbatim — it is the thing variant D
// has to neutralise and the thing whose `args` must survive the neutralising.
fs.writeFileSync(path.join(HOME, '.agent-browser', 'config.json'), JSON.stringify({
  args: '--no-sandbox,--disable-blink-features=AutomationControlled,--ozone-platform=wayland',
  profile: path.join(HOME, '.agent-browser', 'default-profile'),
  headed: true,
}));
// A SECOND, SHORT scratch root (r4): every home under ROOT is ~40 characters,
// which is OVER the 38 the CLI's own socket root allows for our names — so
// this suite models what a production session gets (a short $XDG_RUNTIME_DIR,
// which agentEnv passes through and the CLI uses as its second rung), and the
// socket-rule legs override that explicitly. The socket directory itself lives
// under this root too, never at the production per-uid name in /tmp.
const SHORT = scratch('bp');
fs.rmSync(SHORT, { recursive: true, force: true });
fs.mkdirSync(SHORT, { recursive: true });
const SOCKBASE = path.join(SHORT, 'sb');
fs.mkdirSync(SOCKBASE, { recursive: true });
const SESSION_ENV = { env: { XDG_RUNTIME_DIR: SHORT }, socketDirBase: SOCKBASE };
// THE PRODUCTION PER-UID SOCKET DIR IS A MACHINE-GLOBAL NAME this tier may not
// claim, and a resolver built with production defaults over one of this file's
// ~40-char scratch homes on a box with no XDG_RUNTIME_DIR would create it (it
// did, once — an empty /tmp/vs-ab-<uid> dated to this suite's first run). So
// every resolver here gets SESSION_ENV, and the end of the file asserts the
// consequence rather than trusting the census of call sites.
const PROD_SOCK = '/tmp/vs-ab-' + (typeof process.getuid === 'function' ? process.getuid() : 'u');
const prodSockPreExisted = fs.existsSync(PROD_SOCK);
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } try { fs.rmSync(SHORT, { recursive: true, force: true }); } catch { } });

const mk = (over = {}) => BE.create({
  dataDir: DATA, homeDir: HOME, serverNotice: null, telemetry: null,
  log: { warn() { }, log() { } }, ...SESSION_ENV, ...over,
});
const KEY = 'bk-0011aabb', KEY2 = 'bk-0022ccdd';
const pairsMap = (pairs) => Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));

// ═══ ① the four variables, and the two names ═══════════════════════════════
console.log('\n① the spawn environment');
{
  const e = mk();
  const local = e.envFor({ browserKey: KEY, integrationOn: true, remote: false });
  const m = pairsMap(local.pairs);
  ok(m.AGENT_BROWSER_SESSION === 'vs-' + KEY, 'AGENT_BROWSER_SESSION = vs-<browserKey>');
  ok(m.AGENT_BROWSER_NAMESPACE === 'vs-' + KEY, 'AGENT_BROWSER_NAMESPACE = vs-<browserKey> (§3.2.4: context AND daemon socket)');
  ok(m.AGENT_BROWSER_SESSION === m.AGENT_BROWSER_NAMESPACE, 'both names answer for the SAME browser');
  ok('AGENT_BROWSER_IDLE_TIMEOUT_MS' in m, 'the idle timeout is set EXPLICITLY (the installed build has none, and ≥0.33.1 exempts headed)');
  ok(Number(m.AGENT_BROWSER_IDLE_TIMEOUT_MS) === B.DEFAULT_IDLE_TIMEOUT_MS, `default bound is 15 min (${B.DEFAULT_IDLE_TIMEOUT_MS} ms, §3.2.3)`);
  ok(local.variant === B.VARIANTS.D, 'a local session lands on variant D (the generated config)');

  // A second, concurrent session — the whole point of the feature.
  const other = e.envFor({ browserKey: KEY2, integrationOn: true, remote: false });
  const m2 = pairsMap(other.pairs);
  ok(m.AGENT_BROWSER_NAMESPACE !== m2.AGENT_BROWSER_NAMESPACE, 'two sessions get two namespaces (a `close --all` cannot cross)');
  ok(m.AGENT_BROWSER_CONFIG !== m2.AGENT_BROWSER_CONFIG, 'two sessions get two generated configs');
}
// the negative control §9 names by name
{
  const e = mk();
  ok(e.envFor({ browserKey: KEY, integrationOn: false }).pairs.length === 0,
    'NEGATIVE CONTROL: an integration-OFF session carries ZERO browser variables (not "fewer")');
  ok(e.envFor({ browserKey: 'not-a-key', integrationOn: true }).pairs.length === 0,
    'a malformed browser key produces no environment at all (never a half-isolated spawn)');
  const off = mk({ serverSetting: (k) => (k === 'browser.isolateSessions' ? false : undefined) });
  ok(off.envFor({ browserKey: KEY, integrationOn: true }).pairs.length === 0,
    'the isolation setting turned off carries zero variables too');
  // BOTH LAYERS OWE A CONTROL: the ORCH resolver returns early, and the PURE
  // composition refuses on its own — drive the pure one directly, or a mutation
  // that removes its belt is invisible behind the other.
  ok(B.browserEnvFor({ browserKey: KEY, enabled: false, variant: 'D', configPath: '/x.json' }).length === 0,
    'the PURE composition refuses on its own too (defence in depth, each half driven)');
  ok(B.browserEnvFor({ browserKey: KEY, enabled: true, variant: 'A' }).length === 3,
    '…and the same call with enabled:true produces the three string variables (the control is not vacuous)');
}

// ═══ ② THE RESOLVED DIRECTORY, and why the env strings are not enough ══════
console.log('\n② the RESOLVED user-data-dir (§9: assert the directory, not the strings)');
{
  const e = mk();
  const r = e.envFor({ browserKey: KEY, integrationOn: true, remote: false });
  const m = pairsMap(r.pairs);
  // A MUTANT MUST GO RED, NOT CRASH: if the variable is gone, say so and stop
  // reading the report it would have named (this repo has paid for that once).
  const cfg = ok(typeof m.AGENT_BROWSER_CONFIG === 'string' && fs.existsSync(m.AGENT_BROWSER_CONFIG),
    'variant D names a generated config that EXISTS') ? JSON.parse(fs.readFileSync(m.AGENT_BROWSER_CONFIG, 'utf8')) : {};
  ok(!('profile' in cfg), 'variant D: the generated config has NO `profile` key — its ABSENCE is the ephemerality');
  ok(cfg.args && cfg.args.includes('--ozone-platform=wayland'),
    "the user's own launch `args` are carried across (a custom config REPLACES the user file; drop these and the browser does not start on this desktop)");
  ok(e.resolvedProfileDir(KEY) === '', 'what the NEXT command resolves: ephemeral (empty), read back off the file');

  // THE VARIANT-B CONTROL, stated as §3.2.2 states it.
  const bPairs = ['AGENT_BROWSER_SESSION=vs-' + KEY, 'AGENT_BROWSER_NAMESPACE=vs-' + KEY];
  const looksRight = bPairs.some((p) => p.startsWith('AGENT_BROWSER_SESSION=')) && bPairs.some((p) => p.startsWith('AGENT_BROWSER_NAMESPACE='));
  ok(looksRight, 'NEGATIVE CONTROL: variant B (SESSION+NAMESPACE only) SATISFIES an env-string assertion…');
  ok(!bPairs.some((p) => p.startsWith('AGENT_BROWSER_CONFIG=') || p.startsWith('AGENT_BROWSER_PROFILE=')),
    '…and names no user-data-dir at all, so the shared default-profile still wins (MEASURED on 0.32.0) — which is why this suite asserts the directory');
}

// the three-state `browser.headed`: "inherit" is the default and a checkbox
// cannot say it (a boolean would render inherit as OFF and make the first
// click a decision the user never made).
{
  // A MUTANT MUST GO RED, NOT CRASH: the config path can be gone under a
  // mutation, and an exception here takes every assert below it with it.
  const cfgOf = (v) => {
    const e = mk({ serverSetting: (k) => (k === 'browser.headed' ? v : undefined) });
    const r = e.envFor({ browserKey: 'bk-cafe0001', integrationOn: true });
    const f = pairsMap(r.pairs).AGENT_BROWSER_CONFIG;
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return { headed: '<no generated config>' }; }
  };
  ok(cfgOf('').headed === true, "unset ⇒ the user's own `headed: true` is carried across, not overridden");
  ok(cfgOf('no').headed === false, "'no' ⇒ headless");
  ok(cfgOf('yes').headed === true, "'yes' ⇒ a visible window");
  ok(cfgOf(false).headed === false, 'a raw boolean is accepted too (the suites drive the resolver directly)');
  const sch = read('src/lib/settings-schema.js');
  ok(/'browser\.headed':[\s\S]{0,500}type: 'enum'/.test(sch), 'and the SETTING is an enum, so the UI can render "inherit" as itself');
}

// ═══ ③ §3.2.1 the browserKey continuity ladder ════════════════════════════
console.log('\n③ the browserKey ladder (a conversation, not a webui id)');
{
  let n = 0;
  const mint = () => B.mintBrowserKey(String(++n).padStart(8, '0'));
  const nw = B.browserKeyFor({ prior: '', resume: false, fork: false, mint });
  ok(nw.origin === 'new' && B.isBrowserKey(nw.key), 'a NEW session mints a key');
  const rs = B.browserKeyFor({ prior: KEY, resume: true, fork: false, mint });
  ok(rs.key === KEY && rs.origin === 'conversation', 'a RESUME reuses the conversation\'s key (a new key per resume leaks a browser + a daemon + a pinned tab)');
  const ru = B.browserKeyFor({ prior: '', resume: true, fork: false, mint });
  ok(ru.origin === 'resume-unknown' && ru.key !== KEY, 'a resume with no record mints, and SAYS SO — "resume-unknown" is not "new" wearing a hat');
  const fk = B.browserKeyFor({ prior: KEY, resume: true, fork: true, mint });
  ok(fk.origin === 'fork' && fk.key !== KEY, 'a FORK mints a NEW key (D15: a fork is a new conversation, it must not inherit a pinned tab)');
  ok(B.mintBrowserKey('deadBEEF') === 'bk-deadbeef' && B.isBrowserKey(B.mintBrowserKey('1')), 'keys are bk-<8 hex>, case-folded and padded');
}
// the join that recovers it, driven over REAL session-meta files
{
  const e = mk();
  const conv = 'c0ffee00-1111-4222-8333-444455556666';
  fs.writeFileSync(path.join(DATA, 'session-meta', 'cw-7-1000.json'), JSON.stringify({ claudeSessionId: conv, browserKey: KEY, webuiSessionId: 'sess-7-1000' }));
  fs.writeFileSync(path.join(DATA, 'session-meta', 'cw-9-3000.json'), JSON.stringify({ claudeSessionId: conv, browserKey: KEY2, webuiSessionId: 'sess-9-3000' }));
  ok(e.priorKeyFor(conv) === KEY2, 'priorKeyFor joins conversation → webui keys → browser key, NEWEST first');
  ok(e.priorKeyFor('nope') === '', 'an unknown conversation has no prior key (and the ladder then says resume-unknown)');
  fs.writeFileSync(path.join(DATA, 'session-meta', 'cw-11-4000.json'), JSON.stringify({ claudeSessionId: 'other-conv', webuiSessionId: 'sess-11-4000' }));
  ok(e.priorKeyFor('other-conv') === '', 'a session that predates this feature has no key — never a fabricated one');
}

// ═══ ④ the (D)→(C)→(N)→none ladder and its journalled reasons ═════════════
console.log('\n④ the ladder (D12) and its reasons');
{
  ok(B.variantLadder({ configPath: '/x.json' }).variant === 'D', 'config written+read ⇒ D');
  const c = B.variantLadder({ configPath: null, profileDir: '/p', reasons: ['w'] });
  ok(c.variant === 'C' && c.fallbacks.length === 1 && c.fallbacks[0].why === 'w', 'no config ⇒ C, with the reason it fell');
  const n = B.variantLadder({ configPath: null, profileDir: null, reasons: ['w1', 'w2'], namesProfile: false });
  ok(n.variant === 'N' && n.fallbacks.length === 2 && n.fallbacks[1].why === 'w2', 'neither, and the config names NO profile ⇒ N (the names alone), and BOTH steps are recorded');
  ok(n.fallbacks[0].from === 'D' && n.fallbacks[0].to === 'C' && n.fallbacks[1].from === 'C' && n.fallbacks[1].to === 'N',
    'the descent is ONE RUNG AT A TIME — "D → N" would hide that C was tried and why it failed');
  // THE FLOOR IS DECIDED BY THE CONFIG (r3): with a profile named, the names
  // alone would put every session's chromium on that ONE dir — measured, the
  // second fails to launch — so the ladder lands on `none` and says why.
  // A MUTANT MUST GO RED, NOT CRASH: a ladder that stops at N has no third step,
  // so the third step is read with `?.` (measured: `if (true) return N` took the
  // whole suite down with a TypeError here instead of two red lines).
  const z = B.variantLadder({ configPath: null, profileDir: null, reasons: ['w1', 'w2'], namesProfile: true });
  ok(z.variant === 'none' && z.fallbacks.length === 3 && z.fallbacks[2]?.from === 'N' && z.fallbacks[2]?.to === 'none',
    'neither, and the config NAMES a profile ⇒ none (today\'s shared browser), as a THIRD recorded step');
  ok(/SingletonLock/.test(z.fallbacks[2]?.why || '') && /smaller harm/.test(z.fallbacks[2]?.why || ''), '…whose reason carries the measurement and the trade');
  ok(B.browserEnvFor({ browserKey: KEY, variant: 'none', enabled: true }).length === 0, 'and `none` composes to ZERO pairs (not "fewer")');
  ok(!Object.values(B.VARIANTS).includes('B') && !Object.values(B.VARIANTS).includes('A'),
    'the design\'s A and B are both NAMED REJECTS — neither is in the shippable set');
  ok(/SingletonLock/.test(B.REJECTED_VARIANTS.A) && /SingletonLock/.test(B.REJECTED_VARIANTS.B),
    '…each with the measurement that rejected it (A collides exactly like B once a profile is named: every --session launches its own chromium)');
  ok(B.configNamesProfile({ profile: '/p' }) && B.configNamesProfile({ profile: 'Default' }) && !B.configNamesProfile({ profile: '' }) && !B.configNamesProfile({}) && !B.configNamesProfile({ profile: null }),
    'configNamesProfile: a path OR a Chrome profile NAME names one; empty/null/absent do not');
  // A FENCED CONFIG NEVER LANDS ON C (r4): rung C IS `AGENT_BROWSER_PROFILE`,
  // which the CLI refuses beside `--allowed-domains` at the argument check
  // (measured) — so a scratch dir the caller MANAGED to make is not a rung it
  // may land on. The fence is an INPUT of the ladder, not a caller's detail.
  const fc = B.variantLadder({ configPath: null, profileDir: '/p', reasons: ['w1'], namesProfile: false, fenced: true });
  ok(fc.variant === 'N' && fc.fallbacks.length === 2 && fc.fallbacks[1].from === 'C' && fc.fallbacks[1].to === 'N',
    'no config + a scratch dir the caller MADE + a FENCED effective config ⇒ N, recorded as "C → N" (C was REFUSED, not tried)');
  // A MUTANT MUST GO RED, NOT CRASH: a ladder that ignores `fenced` stops at C
  // with ONE step, so the second is read with `?.` (measured: the bare read
  // took the whole suite down with a TypeError instead of two red lines).
  ok(/rung C refused/.test(fc.fallbacks[1]?.why || '') && /allowedDomains/.test(fc.fallbacks[1]?.why || '') && /measured/.test(fc.fallbacks[1]?.why || ''),
    '…with the fence as the reason, in the ONE exported spelling (fencedRungReason)');
  ok(B.variantLadder({ configPath: null, profileDir: '/p', reasons: ['w1'], namesProfile: false, fenced: false }).variant === 'C',
    'NEGATIVE CONTROL: the same inputs unfenced ⇒ C (round 3\'s ladder, byte for byte)');
  ok(B.variantLadder({ configPath: '/x.json', profileDir: null, fenced: true }).variant === 'D',
    'a fence changes nothing on D — the generated config CARRIES the fence (r2); the refusal is about rung C alone');
  ok(/allowedDomains: example\.com, b\.org/.test(B.fencedRungReason(['example.com', 'b.org'])) && /allowedDomains\)/.test(B.fencedRungReason(null)),
    'the reason names the fence it was handed, and says `allowedDomains` when handed none');
}
// THE JOURNAL HAS TWO DECLARED CATEGORIES since r2: LADDER lines (a fallback,
// or the remote decision) and CONFIG lines (which of the user's own config keys
// the generated file does not carry, a refused pin, and — since r3 — the
// project-level file it layered in). Leg ④ is about the LADDER, so it reads the
// ladder half — but it still BOUNDS the rest: a line of no declared kind fails,
// or a future flood would simply hide behind the filter.
const LADDER_RE = /variant [A-Za-z]+ → [A-Za-z]+|remote sessions decide/;
const CONFIG_RE = /the generated agent-browser config drops `|the profile pin was NOT applied|config also carries the project-level|could not be layered into the generated config|daemon socket would be \d+ bytes|NOT carried: a project file lives where the agent works|from `args` — a switch that opens a raw debugging endpoint/;
const ladderOnly = (ls) => ls.filter((l) => LADDER_RE.test(String(l)));
const undeclared = (ls) => ls.filter((l) => !LADDER_RE.test(String(l)) && !CONFIG_RE.test(String(l)));

// the real resolver on each rung, with the journal captured
{
  // (D) on a healthy tree
  const lines = [];
  const e = mk({ log: { warn: (s) => lines.push(s), log() { } } });
  const d = e.envFor({ browserKey: KEY, integrationOn: true });
  ok(d.variant === 'D' && ladderOnly(lines).length === 0, 'D on a healthy tree journals no FALLBACK (a fallback is news, a success is not)');
  ok(undeclared(lines).length === 0, `…and every line it DOES write is of a declared kind (${undeclared(lines).join(' | ') || 'none undeclared'})`);
  ok(lines.length === 1 && CONFIG_RE.test(lines[0]),
    'the one line on a healthy tree is the `profile` drop — this fixture IS this machine\'s config shape, and dropping a key the user set is a decision, not a success');

  // (C): make the config path unwritable by planting a DIRECTORY where the
  // file must go — a real failure of the real writer, not a stubbed one.
  const l2 = [];
  const e2 = mk({ log: { warn: (s) => l2.push(s), log() { } } });
  fs.rmSync(e2.configPathFor(KEY2), { force: true });
  fs.mkdirSync(e2.configPathFor(KEY2), { recursive: true });
  const c2 = e2.envFor({ browserKey: KEY2, integrationOn: true });
  ok(c2.variant === 'C', 'config unwritable ⇒ falls to C (the per-session scratch dir)');
  ok(pairsMap(c2.pairs).AGENT_BROWSER_PROFILE === e2.linkPathFor(KEY2), 'C names the indirection SYMLINK, not the directory (so a pin can re-point it)');
  ok(fs.realpathSync(e2.linkPathFor(KEY2)) === fs.realpathSync(e2.scratchDirFor(KEY2)), 'the symlink resolves to our own scratch dir under data/');
  ok(ladderOnly(l2).length === 1 && /D → C/.test(ladderOnly(l2)[0]) && /unusable/.test(ladderOnly(l2)[0]), 'the fallback is JOURNALLED with its reason (a silent degrade is a silent failure)');
  ok(undeclared(l2).length === 0, '…and nothing undeclared rode along with it');
  ok(pairsMap(c2.pairs).AGENT_BROWSER_SESSION === 'vs-' + KEY2, 'C still carries both names — the isolation half never degrades');

  // THE READ-BACK IS THE GUARD, and it needs a control. `AGENT_BROWSER_CONFIG`
  // at an unparseable file makes the installed CLI print `⚠ invalid config
  // file …` and exit 1 (MEASURED, 0.32.0) — a hard dependency pointing the
  // UNSAFE way, so a writer bug must fall to C rather than name the file.
  {
    const l = [];
    const eTorn = mk({ log: { warn: (s) => l.push(s), log() { } }, writeJson: (f) => fs.writeFileSync(f, '{ torn') });
    const torn = eTorn.envFor({ browserKey: 'bk-beef0001', integrationOn: true });
    ok(torn.variant === 'C', 'a config our own writer left unparseable is NOT named — the read-back catches it and we fall to C');
    ok(ladderOnly(l).length === 1 && /generated config unusable/.test(ladderOnly(l)[0]), 'and the reason says it was OUR config, not the machine');
    ok(!pairsMap(torn.pairs).AGENT_BROWSER_CONFIG, 'the variable never points at a file the CLI would exit 1 on');
  }

  // (A): block BOTH rungs by making the whole env dir un-creatable.
  const l3 = [];
  const roRoot = path.join(ROOT, 'readonly');
  fs.mkdirSync(roRoot, { recursive: true });
  fs.writeFileSync(path.join(roRoot, 'browser-env'), 'not a directory');
  fs.writeFileSync(path.join(roRoot, 'browser-profiles'), 'not a directory');
  // THE FLOOR FOLLOWS THE CONFIG (r3). This fixture IS this machine's shape —
  // it NAMES a profile — so the floor is `none`: the names alone would point
  // every session's chromium at that one dir and the second would not start
  // (measured). Nothing is emitted, and the journal says which profile decided.
  const e3 = BE.create({ dataDir: roRoot, homeDir: HOME, ...SESSION_ENV, log: { warn: (s) => l3.push(s), log() { } } });
  const a3 = e3.envFor({ browserKey: KEY, integrationOn: true });
  ok(a3.variant === 'none', 'neither rung available AND the config names a profile ⇒ none (today\'s shared browser, never a launch failure)');
  ok(a3.pairs.length === 0, '…with ZERO pairs: the three names would be variant B on this config (the second browser dies on SingletonLock, measured)');
  ok(ladderOnly(l3).length === 3 && /D → C/.test(ladderOnly(l3)[0]) && /C → N/.test(ladderOnly(l3)[1]) && /N → none/.test(ladderOnly(l3)[2]),
    'all THREE fallback steps reach the journal, in order');
  // …and the SAME unwritable tree with a config that names NO profile lands on
  // N: the names alone are safe there (each daemon gets the CLI's own ephemeral
  // /tmp dir, measured), so this is the degraded-not-broken rung.
  const HN = path.join(ROOT, 'home-noprofile');
  fs.mkdirSync(path.join(HN, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(HN, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: true }));
  const l4 = [];
  const e4 = BE.create({ dataDir: roRoot, homeDir: HN, ...SESSION_ENV, log: { warn: (s) => l4.push(s), log() { } } });
  const a4 = e4.envFor({ browserKey: KEY, integrationOn: true });
  ok(a4.variant === 'N', 'NEGATIVE CONTROL: the same unwritable tree with a config naming NO profile ⇒ N');
  ok(a4.pairs.length === 3 && pairsMap(a4.pairs).AGENT_BROWSER_NAMESPACE === 'vs-' + KEY,
    'N is a DEGRADED P0, not a broken one: session + namespace still stop the tab stealing and scope `close --all`, and with no profile named each daemon is ephemeral');
  ok(ladderOnly(l4).length === 2 && /C → N/.test(ladderOnly(l4)[1]), '…and only TWO steps are journalled (N is where it stopped)');
}
// remote — the rung is DECIDED ON THE HOST (r3); leg ⑭ drives the fragment
{
  const l = [];
  const e = mk({ log: { warn: (s) => l.push(s), log() { } } });
  const r = e.envFor({ browserKey: KEY, integrationOn: true, remote: true });
  const m = pairsMap(r.pairs);
  ok(r.variant === 'H', 'a REMOTE session lands on H — the rung is chosen on the host, by its own config, because (D) and (C) both name LOCAL objects');
  ok(!('AGENT_BROWSER_CONFIG' in m) && !('AGENT_BROWSER_PROFILE' in m), 'and the PAIRS name no user-data-dir: that decision is the prelude\'s, on the host');
  ok(m.AGENT_BROWSER_SESSION === 'vs-' + KEY && m.AGENT_BROWSER_NAMESPACE === 'vs-' + KEY && 'AGENT_BROWSER_IDLE_TIMEOUT_MS' in m,
    'remote still gets all THREE string variables — the isolation is the half that was actually reported broken');
  ok(typeof r.remotePrelude === 'string' && r.remotePrelude.includes('AGENT_BROWSER_PROFILE="$vs_ab_d/vs-' + KEY + '"'),
    'and a remotePrelude that exports a per-KEY profile dir on the host, conditionally');
  ok(r.remotePrelude === B.remoteBrowserPrelude({ browserKey: KEY, socketDirBase: SOCKBASE }), '…which is the PURE fragment verbatim (one spelling; this suite\'s scratch socket base rides through)');
  ok(e.envFor({ browserKey: KEY, integrationOn: true }).remotePrelude === '', 'a LOCAL session gets an empty prelude (the fragment is the remote rung, not a second mechanism)');
  const rl = ladderOnly(l);
  ok(rl.length === 1 && /decide their user-data-dir on the host/.test(rl[0]) && /fail to launch/.test(rl[0]),
    'and the reason is journalled, naming the measured collision that made the names-alone shape unsafe');
  ok(r.fallbacks.length === 0 && r.remote === true,
    '…as `remote`, NOT as a fallback — rung (H) is the DESIGNED answer for another machine, and calling a correct design decision a fallback makes every remote create warn about something working as intended');
}

// the journal is RATE-LIMITED PER REASON, because the conditions that produce
// these lines are permanent while this runs once per session CREATE
{
  const l = [];
  const e = mk({ log: { warn: (s) => l.push(s), log() { } } });
  for (let i = 0; i < 25; i++) e.envFor({ browserKey: `bk-dddd00${String(i).padStart(2, '0')}`, integrationOn: true, remote: true });
  ok(l.length === 1, `25 remote creates produce ONE journal line, not 25 (${l.length})`);
  ok(/decide their user-data-dir on the host/.test(l[0]), '…and it says what is actually true, once');
  // a DIFFERENT reason is a different line: the throttle keys on the reason,
  // never on "we already said something about the browser".
  const l2 = [];
  const e2 = mk({ log: { warn: (s) => l2.push(s), log() { } } });
  e2.envFor({ browserKey: 'bk-dddd1111', integrationOn: true, remote: true });
  fs.rmSync(e2.configPathFor('bk-dddd2222'), { recursive: true, force: true });
  fs.mkdirSync(e2.configPathFor('bk-dddd2222'), { recursive: true });
  e2.envFor({ browserKey: 'bk-dddd2222', integrationOn: true });
  ok(ladderOnly(l2).length === 2 && /D → C/.test(ladderOnly(l2)[1]), 'a DIFFERENT reason still gets its own line (the throttle keys on the reason, not on "we said something already")');
  ok(undeclared(l2).length === 0, '…and still nothing of an undeclared kind');
  // THE DROP LINE OBEYS THE SAME THROTTLE, keyed on the KEY: the remote create
  // above drops nothing (rung H writes no config), the local one drops `profile`
  // once, and a second local create says it again only after the window.
  const l3 = [];
  const e3 = mk({ log: { warn: (s) => l3.push(String(s)), log() { } } });
  for (let i = 0; i < 25; i++) e3.envFor({ browserKey: `bk-eeee00${String(i).padStart(2, '0')}`, integrationOn: true });
  ok(l3.filter((l) => /config drops `profile`/.test(l)).length === 1,
    `25 local creates produce ONE \`profile\` drop line, not 25 (${l3.length}) — the condition is PERMANENT while this runs once per create`);
  ok(/bk-dddd2222/.test(l2[1]), '…and every line names the browser key it is about');
}

// ═══ ⑤ D1: the floor probe, three outcomes, driven by a FAKE binary ═══════
console.log('\n⑤ the version floor (D1)');
{
  ok(B.FLOOR_VERSION === '0.37.1', 'the floor is 0.37.1 (D1)');
  // THE PIN IS DECLARED IN ONE PLACE AND CHECKED AT RUNTIME IN ANOTHER, so the
  // two are pinned to each other. It is deliberately NOT a dependency: npm puts
  // node_modules/.bin on PATH for `npm run`, so a local copy would be the
  // binary THIS SUITE measures while every agent session kept using the global
  // one — the gate and production would test different builds.
  const pkg = JSON.parse(read('package.json'));
  ok(pkg.agentTools?.['agent-browser']?.floor === B.FLOOR_VERSION,
    `package.json declares the same floor (${pkg.agentTools?.['agent-browser']?.floor}) as the runtime check`);
  ok(!(pkg.dependencies?.['agent-browser'] || pkg.optionalDependencies?.['agent-browser'] || pkg.devDependencies?.['agent-browser']),
    'and it is NOT an npm dependency — a local copy would shadow the global binary agents actually run, for `npm run` only');
  ok(B.cmpVersion('0.32.0', '0.37.1') === -1 && B.cmpVersion('0.37.1', '0.37.1') === 0 && B.cmpVersion('1.0.0', '0.37.1') === 1, 'numeric-segment compare');
  ok(B.cmpVersion('garbage', '0.37.1') === null, 'an unparseable version is null, never "old enough"');
  const outs = {};
  for (const [label, v] of [['ok', '0.37.1'], ['newer', '0.40.0'], ['too-old', '0.32.0'], ['absent', null], ['unknown', 'weird build']]) {
    outs[label] = B.floorVerdict(v);
  }
  ok(outs.ok.state === 'ok' && outs.ok.sharedProfiles === true, 'at the floor ⇒ ok, shared profiles available');
  ok(outs.newer.state === 'ok', 'above the floor ⇒ ok');
  ok(outs['too-old'].state === 'too-old' && outs['too-old'].sharedProfiles === false, 'below the floor ⇒ too-old, capability OFF');
  ok(outs.absent.state === 'absent' && B.floorNotice(outs.absent) === null, 'no binary ⇒ absent and SILENT (never nag about a tool nobody uses)');
  ok(outs.unknown.state === 'unknown' && outs.unknown.sharedProfiles === false, 'a binary that will not state its version fails CLOSED on the capability…');
  ok(/Could not read the installed agent-browser version/.test(B.floorNotice(outs.unknown)), '…and says so in its own words rather than claiming a version');
  const n = B.floorNotice(outs['too-old']);
  ok(/too old for shared profiles/.test(n), 'the sentence is the design\'s: "your agent-browser is too old for shared profiles"');
  ok(/0\.32\.0/.test(n) && /0\.37\.1/.test(n), 'it names the installed version AND the floor');
  ok(/isolation is on and working/.test(n), 'and it is HONEST about what still works — P0\'s isolation is measured working on 0.32.0');
}
// the SHARED probe, over a fake execFile (no fork, no binary)
{
  const fake = (v, err) => (cmd, args, opts, cb) => cb(err || null, err ? '' : v, '');
  const mkF = (impl) => createBrowserFacts({ execFileImpl: impl });
  const a = await mkF(fake('agent-browser 0.37.1')).floor();
  ok(a.state === 'ok' && a.installed === '0.37.1', 'probe → ok');
  const b = await mkF(fake('agent-browser 0.32.0')).floor();
  ok(b.state === 'too-old' && b.installed === '0.32.0', 'probe → too-old');
  const c = await mkF(fake('', Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))).floor();
  ok(c.state === 'absent', 'probe → absent when the binary is not installed (ENOENT is a FACT, not an error)');
  const d = await mkF(fake('', Object.assign(new Error('boom'), { code: 1 }))).floor();
  ok(d.state === 'unknown', 'probe → unknown when it ran and would not say (deliberately NOT the same answer as absent)');
  // the fork bound: one probe per TTL, negative answer cached like a positive one
  let calls = 0;
  const f = createBrowserFacts({ execFileImpl: (cmd, args, opts, cb) => { calls++; cb(Object.assign(new Error('x'), { code: 'ENOENT' })); } });
  await f.probeVersion(); await f.probeVersion(); await f.probeVersion();
  ok(calls === 1, 'the NEGATIVE answer is cached too — a spawn(2) costs the parent time proportional to its own RSS, so this may not run per create');
  ok(f.lastVersion() === null, 'lastVersion answers without paying for a fork');
}
// the notice fires ONCE, through the channel the user already reads
{
  const notices = [];
  const e = mk({
    serverNotice: (k, t, o) => notices.push({ k, t, o }),
    facts: createBrowserFacts({ execFileImpl: (c, a, o, cb) => cb(null, 'agent-browser 0.32.0', '') }),
  });
  await e.checkFloor(); await e.checkFloor(); await e.checkFloor();
  ok(notices.length === 1, 'ONE honest degrade notice, not one per create');
  ok(notices[0]?.k === 'agent-browser-floor' && notices[0]?.o?.level === 'warn', 'it rides the existing server-notice channel with a stable key');
  ok(e.floorState().state === 'too-old', 'the verdict is readable afterwards without another probe');
  const silent = [];
  const e2 = mk({ serverNotice: (k, t) => silent.push(t), facts: createBrowserFacts({ execFileImpl: (c, a, o, cb) => cb(null, 'agent-browser 0.37.1', '') }) });
  await e2.checkFloor();
  ok(silent.length === 0, 'NEGATIVE CONTROL: a binary at the floor produces no notice at all');
}

// ═══ ⑥ §3.2.5 the pin indirection — no restart ═══════════════════════════
console.log('\n⑥ the pin indirection (a mid-task pin never needs a restart)');
{
  // variant D: the per-session generated config IS the indirection
  const e = mk();
  const before = e.envFor({ browserKey: KEY, integrationOn: true });
  const cfgPath = pairsMap(before.pairs).AGENT_BROWSER_CONFIG;
  ok(typeof cfgPath === 'string', 'setup: the D indirection has a path to re-point (a mutant must go RED, not crash)');
  ok(e.resolvedProfileDir(KEY) === '', 'before the pin: the next launch resolves an EPHEMERAL dir');
  const pinned = path.join(HOME, '.agent-browser', 'vs-bp-work');
  const r = e.repointPin(KEY, pinned);
  ok(r.ok && r.variant === 'D', 'the pin lands on the D indirection');
  ok(e.resolvedProfileDir(KEY) === pinned, 'AFTER the pin, with NOTHING respawned, the next launch resolves the PINNED dir');
  // the env variable itself is BYTE-IDENTICAL — that is the whole mechanism
  const after = e.envFor({ browserKey: KEY, integrationOn: true, pinnedDir: pinned });
  ok(pairsMap(after.pairs).AGENT_BROWSER_CONFIG === cfgPath,
    'the ENV VARIABLE never changed — a running shell\'s environment is immutable, so the pin changes what it POINTS AT');
  ok(cfgPath && JSON.parse(fs.readFileSync(cfgPath, 'utf8')).profile === pinned, 'read off the FILE, not off any in-memory copy (an in-memory answer passes with a writer that never lands)');
  ok(r.appliesFrom === B.PIN_APPLIES_FROM && /next command/.test(r.appliesFrom) && /relaunches the browser/.test(r.appliesFrom) && /lost/.test(r.appliesFrom),
    'and the answer states WHEN it applies as MEASURED (r4): on the next command, which RELAUNCHES the browser and loses the open page — not "on the next launch, never a running browser", the sentence rounds 1-3 inherited from the pool and 0.32.0 falsifies (test-browser-resources §ⓗ drives the binary)');
  ok(!/next browser launch/.test(B.PIN_APPLIES_FROM), 'the retired sentence is gone from the answer (a UI that printed it would tell the user their page was safe)');
  // unpin
  const u = e.repointPin(KEY, null);
  ok(u.ok && e.resolvedProfileDir(KEY) === '', 'unpinning restores the ephemeral resolution in the same one write');

  // variant C: the symlink
  const e2 = mk();
  fs.rmSync(e2.configPathFor(KEY2), { recursive: true, force: true });
  fs.mkdirSync(e2.configPathFor(KEY2), { recursive: true });   // force the C rung
  const c = e2.envFor({ browserKey: KEY2, integrationOn: true });
  ok(c.variant === 'C', 'setup: on the C rung');
  const linkPath = pairsMap(c.pairs).AGENT_BROWSER_PROFILE;
  const was = fs.realpathSync(linkPath);
  const pin2 = path.join(HOME, '.agent-browser', 'vs-bp-two');
  const r2 = e2.repointPin(KEY2, pin2);
  ok(r2.ok && r2.variant === 'C', 'the C pin re-points the symlink');
  ok(fs.realpathSync(linkPath) === fs.realpathSync(pin2) && fs.realpathSync(linkPath) !== was,
    'the SAME path now resolves somewhere else — symlink-to-temp + rename, the pool\'s own primitive');
  ok(pairsMap(e2.envFor({ browserKey: KEY2, integrationOn: true, pinnedDir: pin2 }).pairs).AGENT_BROWSER_PROFILE === linkPath,
    'and the env variable is byte-identical here too');
  ok(r2.appliesFrom === B.PIN_APPLIES_FROM, 'the C rung answers the same measured sentence as D (one spelling)');
  const none = mk().repointPin('bk-99999999', pin2);
  ok(!none.ok && /no browser indirection/.test(none.why), 'a session with no indirection (rung A / older than this feature) is REFUSED by name, never silently "pinned"');
}

// ═══ ⑩ THE GENERATED CONFIG IS A DENY, NOT AN ALLOW (r2) ═════════════════
// Round 1 carried across an enumerated seven keys, so the generated config that
// REPLACES the user's own silently deleted their browsing fence and the whole
// confirmation/action-policy family from every local session. Measured end to
// end on 0.32.0: through the user's own config a navigation is refused
// ("Domain '127.0.0.1' is not in the allowed domains list"); through the
// generated one it succeeded.
console.log('\n⑩ the generated config carries the user\'s restrictions (r2)');
{
  // A REALISTIC FENCED USER: `allowedDomains` with NO `profile`, because the CLI
  // refuses those two together — so this is the only shape a fenced user can
  // actually have (measured).
  const H2 = path.join(ROOT, 'home-fenced');
  fs.mkdirSync(path.join(H2, '.agent-browser'), { recursive: true });
  const userCfg = {
    args: '--no-sandbox,--ozone-platform=wayland',
    headed: true,
    allowedDomains: ['example.com'],       // the browsing FENCE
    confirmActions: 'navigate',            // the confirmation family
    actionPolicy: '/etc/vs/policy.json',
    initScripts: ['/etc/vs/init.js'],
    downloadPath: '/tmp/dl',
    maxOutput: 5000,
    aKeyNobodyEnumerated: 'survives too',   // the point of a DENY: we do not have to know it
  };
  fs.writeFileSync(path.join(H2, '.agent-browser', 'config.json'), JSON.stringify(userCfg));
  const lines = [];
  const e = mk({ homeDir: H2, log: { warn: (s) => lines.push(String(s)), log() { } } });
  const r = e.envFor({ browserKey: 'bk-fe0e0001', integrationOn: true });
  const cfg = ok(r.configPath && fs.existsSync(r.configPath), 'setup: the generated config exists (a mutant must go RED, not crash)')
    ? unmark(JSON.parse(fs.readFileSync(r.configPath, 'utf8')), 'bk-fe0e0001') : {};
  ok(Array.isArray(cfg.allowedDomains) && cfg.allowedDomains[0] === 'example.com',
    "the user's own browsing FENCE survives — §3.2.2 sells variant D on \"能否带 --allowed-domains: 是\" and §6.3 forbids accepting a flag that is later silently dropped");
  for (const k of ['confirmActions', 'actionPolicy', 'initScripts', 'downloadPath', 'maxOutput', 'aKeyNobodyEnumerated']) {
    ok(JSON.stringify(cfg[k]) === JSON.stringify(userCfg[k]), `…and so does \`${k}\` (a DENY carries the keys nobody enumerated)`);
  }
  ok(!('profile' in cfg), 'while `profile` — the ONE key this feature exists to drop — is gone');
  ok(cfg.args === userCfg.args && cfg.headed === true, 'the launch args and the inherited headed value are unchanged');

  // THE PRE-FIX CONTROL, verbatim: round 1's seven-key ALLOW list over the SAME
  // user config. It must lose every restriction the fixed one keeps.
  const R1_ALLOW = ['args', 'executablePath', 'extensions', 'proxy', 'proxyBypass', 'userAgent', 'engine'];
  const r1 = {};
  for (const k of R1_ALLOW) if (userCfg[k] !== undefined && userCfg[k] !== null) r1[k] = userCfg[k];
  r1.headed = !!userCfg.headed;
  const lost = Object.keys(userCfg).filter((k) => !(k in r1));
  ok(lost.includes('allowedDomains') && lost.includes('confirmActions') && lost.includes('actionPolicy'),
    `PRE-FIX CONTROL: round 1's ALLOW list dropped ${lost.length} of the user's keys including the fence — [${lost.join(', ')}]`);
  ok(Object.keys(userCfg).filter((k) => !(k in cfg)).length === 0,
    'while the DENY drops NOTHING from a fenced config — it has no `profile` to drop, because the CLI refuses those two together');
  ok(r.dropped && r.dropped.length === 0 && lines.length === 0,
    'so there is nothing to report and nothing to journal (a drop line for a key nobody set would be noise)');

  // A DROPPED KEY IS A STATED DECISION, not one made by omission — driven on a
  // config that HAS the key, which is this machine's own shape.
  const H2b = path.join(ROOT, 'home-profile');
  fs.mkdirSync(path.join(H2b, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(H2b, '.agent-browser', 'config.json'), JSON.stringify({
    args: '--no-sandbox', headed: true, profile: '/home/u/.agent-browser/default-profile', restore: 'work',
  }));
  const l2 = [];
  const ep = mk({ homeDir: H2b, log: { warn: (s) => l2.push(String(s)), log() { } } });
  const rp = ep.envFor({ browserKey: 'bk-fe0e0002', integrationOn: true });
  ok(JSON.stringify((rp.dropped || []).slice().sort()) === '["profile","restore"]',
    `the resolver REPORTS both denied keys this config carries (${JSON.stringify(rp.dropped)})`);
  ok(l2.filter((l) => /config drops `/.test(l)).length === 2,
    'ONE journal line PER KEY — the throttle keys on the key, so a reader learns which restriction of theirs does not apply here');
  ok(l2.some((l) => /drops `profile`/.test(l) && /ephemerality/.test(l)) && l2.some((l) => /drops `restore`/.test(l) && /replays/.test(l)),
    `and each line carries that key's own reason — ${JSON.stringify(l2.find((l) => /drops `restore`/.test(l))?.slice(0, 110) || '<nothing>')}`);
  ok(l2.every((l) => /carried across unchanged/.test(l)),
    '…and says what it did NOT drop, so the line is not read as "your config was ignored"');
  const cfgP = unmark(JSON.parse(fs.readFileSync(rp.configPath, 'utf8')), 'bk-fe0e0002');
  ok(!('profile' in cfgP) && !('restore' in cfgP) && cfgP.args === '--no-sandbox' && cfgP.headed === true,
    'the file itself: both denied keys gone, everything else verbatim');
  ok(Object.keys(B.EPHEMERAL_DENY).every((k) => typeof B.EPHEMERAL_DENY[k] === 'string' && B.EPHEMERAL_DENY[k].length > 10),
    `every denied key carries a reason (${Object.keys(B.EPHEMERAL_DENY).join(', ')})`);
  // the deny set is the CLI's own "this is not a fresh, isolated context" list
  for (const k of ['profile', 'restore', 'sessionName', 'state', 'autoConnect', 'cdp']) {
    ok(k in B.EPHEMERAL_DENY, `\`${k}\` is denied — MEASURED: the binary refuses --allowed-domains beside it`);
  }
  for (const k of ['extensions', 'userAgent', 'downloadPath', 'engine', 'confirmActions', 'actionPolicy', 'initScripts']) {
    ok(!(k in B.EPHEMERAL_DENY), `…and \`${k}\` is NOT denied — measured compatible with the fence, so dropping it would be a loss for nothing`);
  }
  // a denied key that IS present is dropped and named, per key
  const denyAll = {};
  for (const k of Object.keys(B.EPHEMERAL_DENY)) denyAll[k] = 'x';
  const got = B.generatedConfig({ userConfig: { ...denyAll, args: '--no-sandbox' } });
  ok(Object.keys(got).join() === 'args', `all ${Object.keys(denyAll).length} denied keys are dropped together, leaving only what the user set beside them`);
  ok(B.deniedKeys({ ...denyAll, args: 'x' }).length === Object.keys(denyAll).length, 'and deniedKeys() names every one of them for the journal');
  ok(B.deniedKeys({ profile: null }).length === 1, 'a denied key set to null is still DROPPED (its presence is the claim, not its value)');
}

// ═══ ⑪ A FENCE AND A PIN ARE MUTUALLY EXCLUSIVE (§6.3, r2) ═══════════════
// The r2 fix carries `allowedDomains` across, so a pin — which adds `profile`
// back — would hand the session a browser that refuses EVERY command (measured
// on 0.32.0: `open` AND `get title` both answer "--allowed-domains is not
// supported with --profile"). §6.3's ruling is to REFUSE with a message.
console.log('\n⑪ a pin over a fenced config is refused, with the reason (§6.3)');
{
  const H3 = path.join(ROOT, 'home-fence-pin');
  fs.mkdirSync(path.join(H3, '.agent-browser'), { recursive: true });
  const write = (o) => fs.writeFileSync(path.join(H3, '.agent-browser', 'config.json'), JSON.stringify(o));

  write({ args: '--no-sandbox', allowedDomains: ['example.com'] });
  const e = mk({ homeDir: H3 });
  const K = 'bk-f0f0f0f0';
  e.envFor({ browserKey: K, integrationOn: true });
  const pinned = path.join(H3, '.agent-browser', 'vs-bp-vendor');
  const r = e.repointPin(K, pinned);
  ok(r.ok === false, 'repointPin REFUSES while the user config carries a fence');
  ok(/mutually exclusive/.test(r.why) && /allowedDomains/.test(r.why) && /proxy/.test(r.why),
    'and the refusal names the conflict, the CLI\'s reason and the way out — never a silent drop');
  ok(e.resolvedProfileDir(K) === '', 'the session is still EPHEMERAL — the refusal changed nothing');
  const stillFenced = JSON.parse(fs.readFileSync(e.configPathFor(K), 'utf8'));
  ok(Array.isArray(stillFenced.allowedDomains) && !('profile' in stillFenced),
    'and the config on disk still has the fence and no profile (a refusal that half-applied would be worse than either answer)');

  // the spawn path lands EPHEMERAL and SAYS the pin was refused
  const lines = [];
  const e2 = mk({ homeDir: H3, log: { warn: (s) => lines.push(String(s)), log() { } } });
  const r2 = e2.envFor({ browserKey: 'bk-f0f0f0f1', integrationOn: true, pinnedDir: pinned });
  ok(!!r2.pinRefused && r2.pinRefused.key === 'allowedDomains', 'a spawn asked to pin under a fence reports the refusal');
  ok(!('profile' in JSON.parse(fs.readFileSync(r2.configPath, 'utf8'))), '…and writes NO profile, so the browser still works');
  ok(lines.some((l) => /pin was NOT applied/.test(l)), 'and journals it — a dropped pin nobody is told about is the anti-pattern §6.3 names');

  // NEGATIVE CONTROLS — the refusal must be about the FENCE, not about pinning.
  write({ args: '--no-sandbox' });
  const e3 = mk({ homeDir: H3 });
  const K3 = 'bk-f0f0f0f2';
  e3.envFor({ browserKey: K3, integrationOn: true });
  const r3 = e3.repointPin(K3, pinned);
  ok(r3.ok && e3.resolvedProfileDir(K3) === pinned, 'NEGATIVE CONTROL: with no fence the SAME pin is applied normally');
  write({ args: '--no-sandbox', allowedDomains: [] });
  const e4 = mk({ homeDir: H3 });
  const K4 = 'bk-f0f0f0f3';
  e4.envFor({ browserKey: K4, integrationOn: true });
  ok(e4.repointPin(K4, pinned).ok,
    'NEGATIVE CONTROL: an EMPTY allowedDomains is not a fence — MEASURED, `[]` + a profile opens the page, so it may not block a pin');
  ok(B.pinFenceConflict({ userConfig: { allowedDomains: ['x'] }, pinnedDir: null }) === null,
    'NEGATIVE CONTROL: a fence with no pin conflicts with nothing (the ephemeral default is exactly what §6.3 wants)');
}

// ═══ ⑫ THE VERSION PROBE ASKS THE BINARY, NOT THE SHELL (r2) ═════════════
// An ambient AGENT_BROWSER_CONFIG makes the CLI exit 1 on `--version`, so the
// probe answered 'unknown' and the honest degrade notice said "could not read
// the installed version" on a machine whose version reads perfectly. Measured:
// `AGENT_BROWSER_CONFIG=/AMBIENT/LEAK/config.json agent-browser --version` →
// `⚠ config file not found`, exit 1, while the same call without it prints
// `agent-browser 0.32.0` in 0.103 s.
console.log('\n⑫ the version probe strips an ambient AGENT_BROWSER_* (r2)');
{
  let seen = null;
  const f = createBrowserFacts({
    env: { PATH: '/usr/bin', HOME: '/home/u', AGENT_BROWSER_CONFIG: '/AMBIENT/LEAK/config.json', AGENT_BROWSER_PROFILE: '/x', AGENT_BROWSER_SESSION: 'someone-else' },
    execFileImpl: (cmd, args, opts, cb) => { seen = opts; cb(null, 'agent-browser 0.37.1', ''); },
  });
  await f.floor();
  // A MUTANT MUST GO RED, NOT CRASH: with the fix reverted there is no `env` on
  // the options at all, so say so and stop reading the object it would have been.
  if (ok(!!(seen && seen.env), 'the probe passes an explicit env (inheriting process.env is what let the operator\'s shell answer this question)')) {
    const leaked = Object.keys(seen.env).filter((k) => k.startsWith('AGENT_BROWSER_'));
    ok(leaked.length === 0, `no AGENT_BROWSER_* survives into the probe env (${leaked.length ? leaked.join(', ') : 'none'})`);
    ok(seen.env.PATH === '/usr/bin' && seen.env.HOME === '/home/u', '…and nothing else is dropped — PATH still names the binary this asks about');
  }
  ok(Object.keys(sanitizeProbeEnv({ A: '1', AGENT_BROWSER_X: '2' })).join() === 'A', 'the rule is one exported predicate, so it can be asserted directly');
  // PRE-FIX CONTROL: the retired shape, over the SAME ambient env.
  const before = { PATH: '/usr/bin', AGENT_BROWSER_CONFIG: '/AMBIENT/LEAK/config.json' };
  ok(Object.keys(before).some((k) => k.startsWith('AGENT_BROWSER_')),
    'PRE-FIX CONTROL: round 1 handed execFile no env at all, so process.env — including that variable — reached the CLI');
  // and the SPAWN path already had this rule, one layer away: same names, same reason
  const { agentEnv } = require('../src/ws-handler.js');
  ok(!Object.keys(agentEnv({ PATH: '/usr/bin', AGENT_BROWSER_CONFIG: '/x' })).some((k) => k.startsWith('AGENT_BROWSER_')),
    'agentEnv() drops the same family on the spawn path — the probe was the one layer that did not');
}
// the ORIGIN vocabulary — P0 may only emit what BOTH existing vocabularies accept
{
  const { SPAWN_ORIGINS } = require('../src/resume-continuity.js');
  ok(B.P0_PIN_ORIGINS.every((o) => SPAWN_ORIGINS.includes(o)),
    'every origin P0 emits is already in SPAWN_ORIGINS (the frozen four) — no vocabulary change rides in on P0');
  const client = read('src/lib/agent-meta.js');
  ok(B.P0_PIN_ORIGINS.every((o) => client.includes(`'${o}'`)),
    'and the CLIENT mirror (agent-meta.js) recognises each of them — an unknown origin there is a SILENT mislabel, never an error');
  ok(B.PIN_ORIGINS.includes('task-group') && !B.P0_PIN_ORIGINS.includes('task-group'),
    "the fifth value ('task-group') is written down for P1 but NOT emitted by P0 — adding it is a two-place change in P1's own commit");
  for (const [inp, want] of [
    [{ explicit: 'p1', conversation: 'p2', instanceDefault: 'p3' }, 'chosen'],
    [{ explicit: '', conversation: 'p2', instanceDefault: 'p3' }, 'conversation'],
    [{ explicit: '', conversation: '', instanceDefault: 'p3' }, 'instance'],
    [{ explicit: '', conversation: '', instanceDefault: '' }, 'harness'],
  ]) ok(B.pinPick(inp).origin === want, `pin ladder: ${JSON.stringify(inp)} ⇒ ${want}`);
}

// ═══ ⑦ WIRING PINS — the composition really reaches both transports ═══════
console.log('\n⑦ wiring (a pure function nobody calls is a feature nobody has)');
{
  const src = read('src/ws-create.js');
  ok(/\.envFor\(\{\s*\n?\s*browserKey/.test(src), 'ws-create calls the resolver');
  // LAZY BY CONSTRUCTION: registering the ws handler must cost nothing. An
  // EAGER construction here took the whole release gate down with a TypeError,
  // because test-contributions registers the handler with a minimal ctx that
  // carries no `path` and no `BUFFERS_DIR` — and an instance where nobody ever
  // creates a session should never touch the filesystem for this at all.
  ok(/const browserEnvOf = \(\) => \{/.test(src) && !/^\s*const browserEnv = require\(/m.test(src),
    'the resolver is built LAZILY on first use, never at handler registration');
  ok(/console\.warn\('\[browser\] per-session browser environment unavailable/.test(src),
    '…and a construction failure degrades with the message printed VERBATIM (a catch that swallows its own bug is how this class survives)');
  ok(/spawnEnvPairs\.push\(\.\.\.be\.pairs\)/.test(src), 'and pushes the pairs into spawnEnvPairs');
  // ORDERING IS THE WHOLE POINT: the remote branches consume spawnEnvPairs and
  // then EMPTY it, so a push below them reaches only local sessions. Round-1 of
  // several past whitelist-drift bugs in this file is exactly this shape.
  const iPush = src.indexOf('spawnEnvPairs.push(...be.pairs)');
  const iFirstRemote = src.indexOf('buildRemoteExec({');
  const iLocal = src.indexOf('const r6Argv = [');
  ok(iPush > 0 && iFirstRemote > 0 && iLocal > 0, 'setup: all three anchors exist');
  ok(iPush < iFirstRemote, 'the push happens ABOVE the first remote builder (which consumes spawnEnvPairs and then empties it)');
  ok(iPush < iLocal, 'and above the local r6Argv');
  // …and the local composition really SPREADS the array it was pushed into.
  const r6 = src.slice(iLocal, src.indexOf('];', iLocal));
  ok(/\.\.\.spawnEnvPairs/.test(r6), 'the local r6Argv spreads spawnEnvPairs (the push has to land somewhere)');
  const clears = (src.match(/spawnEnvPairs = \[\];/g) || []).length;
  ok(clears >= 5, `each remote branch clears the array after consuming it (${clears} sites) — the reason ordering is load-bearing`);
  ok(/browserKey: session\._browserKey \|\| undefined/.test(src), 'the key is recorded in session-meta (without it, every resume mints a new one)');
  ok(/priorKeyFor\(data\.resumeId\)/.test(src), 'and a resume asks for the CONVERSATION\'s key');
  ok(/fork: !!data\.fork/.test(src), 'the fork flag reaches the ladder (D15)');
  // THE AMBIENT LEAK: our four variables are the only source of a session's
  // browser environment. A server launched from a shell that exports
  // AGENT_BROWSER_PROFILE would otherwise pin every agent on the box to one
  // cookie jar — silently, and exactly on the paths where we set nothing.
  const { agentEnv } = require('../src/ws-handler.js');
  const leaked = agentEnv({ PATH: '/usr/bin', AGENT_BROWSER_PROFILE: '/home/u/.agent-browser/default-profile', AGENT_BROWSER_SESSION: 'someone-else' });
  ok(!('AGENT_BROWSER_PROFILE' in leaked) && !('AGENT_BROWSER_SESSION' in leaked),
    'agentEnv DROPS an ambient AGENT_BROWSER_* — the server\'s own shell may not pin every agent to one browser');
  ok(leaked.PATH === '/usr/bin', '…and drops nothing else (the control: the sanitizer still passes the rest through)');
  // the tools intro + the manual are the agent's only two pointers at this
  const ar = read('src/agent-routes.js');
  ok(/browser: 'browser-manual\.md'/.test(ar), '`vibespace-docs browser` resolves to a manual');
  ok(fs.existsSync(path.join(REPO, 'docs/agent/browser-manual.md')), '…and that manual exists in this checkout (the route serves it off disk)');
  ok(/Browsing: `vibespace-browser <verb>`/.test(ar) && /vibespace-docs browser/.test(ar),
    'the budgeted tools intro carries ONE line about it — the one tool (takeover C2) — pointing at the manual');

  const restore = read('src/server/boot-restore.js');
  ok((restore.match(/_browserKey: meta\.browserKey/g) || []).length === 3,
    'ALL THREE boot-restore paths carry the key back (a whitelist that covers two of three is this file\'s recurring bug)');
  const schema = read('src/session-schema.js');
  ok(/_browserKey:/.test(schema) && /_browserVariant:/.test(schema), 'both session fields have owner rows');
  // the remote composition really carries them
  const { buildRemoteExec } = require('../src/remote-shell.js');
  const shq = (x) => `'${String(x).replace(/'/g, `'"'"'`)}'`;
  const e = mk();
  const rp = e.envFor({ browserKey: KEY, integrationOn: true, remote: true }).pairs;
  const line = buildRemoteExec({ cwd: '/w', shq, parts: [...rp.map(shq), shq('claude')] });
  ok(line.includes(shq('AGENT_BROWSER_SESSION=vs-' + KEY)), 'buildRemoteExec carries the browser env, shell-quoted, into the remote command');
  ok(/exec env .*AGENT_BROWSER_NAMESPACE/.test(line), 'as part of the one `exec env` composition, not a second mechanism');
}

// ═══ ⑧ housekeeping: the C rung may not farm orphans ═════════════════════
console.log('\n⑧ the sweep (§3.2.2: those directories are ours, and they are swept)');
{
  const e = mk();
  e.envFor({ browserKey: 'bk-aaaa0001', integrationOn: true });
  e.envFor({ browserKey: 'bk-aaaa0002', integrationOn: true });
  // age them past the in-flight grace
  const old = Date.now() / 1000 - 7200;
  for (const k of ['bk-aaaa0001', 'bk-aaaa0002']) { try { fs.utimesSync(e.configPathFor(k), old, old); } catch { } }
  ok(e.sweep(null).skipped, 'NO live-session set ⇒ sweeps NOTHING and says so ("I could not enumerate" is not "there are none")');
  const r = e.sweep(new Set(['bk-aaaa0001']));
  ok(r.swept === 1 && r.kept >= 1, 'an orphaned indirection is removed; a live one is kept');
  ok(fs.existsSync(e.configPathFor('bk-aaaa0001')) && !fs.existsSync(e.configPathFor('bk-aaaa0002')), 'and the right one survived');
  // the on-disk half: a restored session may not carry the key in memory yet
  const k3 = 'bk-aaaa0003';
  e.envFor({ browserKey: k3, integrationOn: true });
  fs.utimesSync(e.configPathFor(k3), old, old);
  fs.writeFileSync(path.join(DATA, 'session-meta', 'cw-77-7777.json'), JSON.stringify({ browserKey: k3, webuiSessionId: 'sess-77-7777' }));
  const r3 = e.sweep(new Set());   // in-memory set EMPTY, as right after a restart
  ok(fs.existsSync(e.configPathFor(k3)),
    'a session-meta on disk keeps its indirection alive even when the in-memory set is empty — a restart must not silently revert a pin');
  ok(e.liveKeysFromMeta().has(k3) && !r3.spared.some((s) => s.name.includes(k3)),
    '…and it was the META that saved it, not the in-flight grace (the two halves are separable)');
  // the in-flight grace
  const k4 = 'bk-aaaa0004';
  e.envFor({ browserKey: k4, integrationOn: true });   // fresh: mtime ≈ now
  const r4 = e.sweep(new Set());
  ok(r4.spared.some((s) => s.name.includes(k4)) && fs.existsSync(e.configPathFor(k4)),
    'a create still in flight (indirection written, meta not yet) is SPARED and NAMED with its age');
  ok(r4.spared[0].ageMs >= 0 && r4.graceMs === BE.SWEEP_GRACE_MS,
    'the sweep reports its own clock and threshold, so a reader never re-measures the age (and the age is never NEGATIVE — Date.now() truncates where mtimeMs does not)');
}

// ═══ PATCHED COPIES of the ORCH module (the branch's pre-fix-control idiom) ═
// A control must be the thing it names: round 2's behaviour is the shipped
// module with ONE call put back, not a hand-written imitation. Copies are
// written OUTSIDE the tree (scripts/mutant-copy.mjs: this process's scratch
// dir, `require` re-bound on line 1 to the real module's path, so relative
// requires resolve as a sibling's); ㉑ measures that while they exist. They
// used to be siblings in src/server/ (vs-browser-mut-*, gitignored).
sweepLegacy(REPO, ['src/server'], /^vs-browser-mut-(\d+)-/);   // what a pre-fix run stranded (dead PIDs only)
const MUTB = mutantCopies('bprof', REPO);

const beSrc0 = read('src/server/browser-env.js');
function mutantBE(edits) {
  let src = beSrc0, hits = 0;
  for (const [from, to] of edits) {
    if (!src.includes(from)) return { err: 'needle missing: ' + from.slice(0, 70) };
    src = src.split(from).join(to); hits++;
  }
  return { mod: MUTB.load('src/server/browser-env.js', src), hits };
}
// The same for src/server/browser-bindings.js (r6): it has no relative
// requires, but it goes through the same outside-the-tree helper on purpose.
const bbSrc0 = read('src/server/browser-bindings.js');
function mutantBB(edits) {
  let src = bbSrc0, hits = 0;
  for (const [from, to] of edits) {
    if (!src.includes(from)) return { err: 'needle missing: ' + from.slice(0, 70) };
    src = src.split(from).join(to); hits++;
  }
  return { mod: MUTB.load('src/server/browser-bindings.js', src), hits };
}

// ═══ ⑬ THE CLI'S OTHER FILE: ./agent-browser.json (r3) ════════════════════
// The CLI reads TWO files before the environment — the user file and a
// PROJECT-level `./agent-browser.json` in the invocation directory, at HIGHER
// priority — and AGENT_BROWSER_CONFIG replaces BOTH. Round 2 carried only the
// first, so a project-level fence was still deleted from every local session
// with `dropped: []`. MEASURED (0.32.0): arm A, today at the project cwd ⇒
// `✗ Domain '127.0.0.1' is not in the allowed domains list`; arm B, round 2's
// resolver at the same cwd ⇒ `✓` (test-browser-resources §ⓔ drives both).
console.log('\n⑬ the project-level agent-browser.json is layered the way the CLI does (r3)');
{
  // the PURE rule, one assert per measured fact
  const u = { args: '--no-sandbox,--user', headed: false, userAgent: 'U', extensions: ['/e/a'] };
  const p = { args: '--no-sandbox,--project', allowedDomains: ['example.com'], extensions: ['/e/b'] };
  const m = B.layerProjectConfig(u, p);
  ok(m.args === p.args, 'a key in BOTH files takes the PROJECT value (measured: the project `args` reached the chromium cmdline, the user file\'s did not)');
  ok(m.userAgent === 'U' && m.headed === false, 'a key in ONE file survives (measured: a user-level `userAgent` still answered beside a project file)');
  ok(JSON.stringify(m.extensions) === '["/e/a","/e/b"]', '`extensions` is the ONE key that is CONCATENATED, user first (measured: --load-extension=<user>,<project>)');
  ok(Array.isArray(m.allowedDomains) && m.allowedDomains[0] === 'example.com', 'the project-level FENCE is in the merged config');
  ok(JSON.stringify(B.layerProjectConfig(u, null)) === JSON.stringify(u), 'no project file ⇒ the user file verbatim (round 2\'s shape, by construction)');
  ok(JSON.stringify(B.layerProjectConfig({ extensions: '/e/a' }, { extensions: '/e/b' }).extensions) === '["/e/a","/e/b"]', 'a string `extensions` is coerced before concatenation');

  // the RESOLVER, over a home WITHOUT a fence and a project dir WITH one
  const H13 = path.join(ROOT, 'home-project');
  const PROJ = path.join(ROOT, 'proj');
  fs.mkdirSync(path.join(H13, '.agent-browser'), { recursive: true }); fs.mkdirSync(PROJ, { recursive: true });
  fs.writeFileSync(path.join(H13, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox,--user', headed: false, extensions: ['/e/a'] }));
  fs.writeFileSync(path.join(PROJ, 'agent-browser.json'), JSON.stringify({ allowedDomains: ['example.com'], args: '--no-sandbox,--project', extensions: ['/e/b'], confirmActions: 'navigate' }));
  const lines = [];
  const e = mk({ homeDir: H13, log: { warn: (s) => lines.push(String(s)), log() { } } });
  const K = 'bk-13131301';
  const r = e.envFor({ browserKey: K, integrationOn: true, cwd: PROJ });
  const cfg = ok(!!r.configPath && fs.existsSync(r.configPath), 'setup: variant D wrote a config (a mutant must go RED, not crash)') ? unmark(JSON.parse(fs.readFileSync(r.configPath, 'utf8')), K) : {};
  ok(Array.isArray(cfg.allowedDomains) && cfg.allowedDomains[0] === 'example.com', 'THE FIX: the generated config carries the PROJECT-level fence');
  // takeover r3 (finding 2): the project file only NARROWS — its `confirmActions` (a narrowing key) is carried,
  // its `args` and `extensions` (launch keys) are NOT: the user file's stand, and the drop is journalled by name
  ok(cfg.args === '--no-sandbox,--user' && cfg.confirmActions === 'navigate' && JSON.stringify(cfg.extensions) === '["/e/a"]',
    'takeover r3: the project `confirmActions` is carried (it narrows); its `args` / `extensions` are NOT — the user file\'s launch keys stand', JSON.stringify(cfg));
  ok(JSON.stringify(r.projectDropped) === '["args","extensions"]' && lines.some((l) => /NOT carried: a project file lives where the agent works/.test(l) && /args, extensions/.test(l) && l.includes(path.join(PROJ, 'agent-browser.json'))),
    'takeover r3: …and the dropped project keys are SAID (the result + one journal line naming the file and the keys)', JSON.stringify({ pd: r.projectDropped, lines }));
  ok(r.projectConfig && r.projectConfig.path === path.join(PROJ, 'agent-browser.json') && r.projectConfig.keys.includes('allowedDomains'),
    'the resolver REPORTS the file it layered and the keys it took');
  const pl = lines.filter((l) => /config also carries the project-level/.test(l));
  ok(pl.length === 1 && pl[0].includes(path.join(PROJ, 'agent-browser.json')) && /allowedDomains/.test(pl[0]) && !/keys: [^)]*\bargs\b/.test(pl[0]),
    'ONE journal line names the file and its keys (round 2 wrote nothing — the drop was by omission)');
  ok(/cd's into/.test(pl[0]) && /per invocation directory/.test(pl[0]),
    '…and states the one boundary honestly: the CLI reads it per invocation directory, the generated config applies it to the whole session');
  ok(undeclared(lines).length === 0, 'and the line is of a declared journal kind');
  // THE PIN READS THE SESSION'S OWN FILE (door #2): a pin over the layered
  // fence is refused even though the USER file has no fence at all.
  const pinned = path.join(H13, '.agent-browser', 'vs-bp-x');
  const pr = e.repointPin(K, pinned);
  ok(pr.ok === false && /allowedDomains/.test(pr.why), 'a pin over a PROJECT-level fence is refused — repointPin asks the session\'s own generated file, not ~/.agent-browser/config.json');
  ok(e.resolvedProfileDir(K) === '' && Array.isArray(JSON.parse(fs.readFileSync(r.configPath, 'utf8')).allowedDomains),
    '…and nothing half-applied: still ephemeral, fence still on disk');
  // drop-line sentence names BOTH files now
  const H13b = path.join(ROOT, 'home-project-profile');
  fs.mkdirSync(path.join(H13b, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(H13b, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', profile: '/h/p' }));
  const l2 = [];
  mk({ homeDir: H13b, log: { warn: (s) => l2.push(String(s)), log() { } } }).envFor({ browserKey: 'bk-13131302', integrationOn: true, cwd: PROJ });
  const dl = l2.find((l) => /drops `profile`/.test(l)) || '';
  ok(dl.includes('and ' + path.join(PROJ, 'agent-browser.json')) && /carried across unchanged/.test(dl),
    'the drop line now says what it carried FROM — both files — so it is not read as "your config was ignored"');

  // CONTROLS — each must be the thing it names.
  // (a) no cwd ⇒ round 2's behaviour by construction: user file only, no line
  const la = [];
  const ra = mk({ homeDir: H13, log: { warn: (s) => la.push(String(s)), log() { } } }).envFor({ browserKey: 'bk-13131303', integrationOn: true });
  const ca = unmark(JSON.parse(fs.readFileSync(ra.configPath, 'utf8')), 'bk-13131303');
  ok(!('allowedDomains' in ca) && ca.args === '--no-sandbox,--user' && ra.projectConfig.path === null && la.length === 0,
    'CONTROL (no cwd): the user file alone, no project line — round 2\'s output byte for byte');
  // (b) a cwd with no such file ⇒ identical to (a)
  const NOFILE = path.join(ROOT, 'proj-empty'); fs.mkdirSync(NOFILE, { recursive: true });
  const rb = mk({ homeDir: H13 }).envFor({ browserKey: 'bk-13131304', integrationOn: true, cwd: NOFILE });
  ok(JSON.stringify(unmark(JSON.parse(fs.readFileSync(rb.configPath, 'utf8')), 'bk-13131304')) === JSON.stringify(ca) && rb.projectConfig.path === null,
    'CONTROL (cwd without the file): identical to no cwd');
  // (c) an unparseable project file is REPORTED, not silently skipped
  const BAD = path.join(ROOT, 'proj-bad'); fs.mkdirSync(BAD, { recursive: true });
  fs.writeFileSync(path.join(BAD, 'agent-browser.json'), '{ torn');
  const lc = [];
  const rc = mk({ homeDir: H13, log: { warn: (s) => lc.push(String(s)), log() { } } }).envFor({ browserKey: 'bk-13131305', integrationOn: true, cwd: BAD });
  ok(rc.projectConfig.error && lc.some((l) => /could not be layered/.test(l) && l.includes(path.join(BAD, 'agent-browser.json'))),
    'a project file that does not parse is NAMED in the journal with the error (the CLI would refuse it too; "we ignored your file" is the sentence this round exists to stop leaving out)');
  ok(!('allowedDomains' in JSON.parse(fs.readFileSync(rc.configPath, 'utf8'))), '…and the generated config falls back to the user file');
  // (d) PRE-FIX CONTROL #1: round 2's spawn — the layering call put back to the
  //     user-only read. Same cwd, same files ⇒ the fence is GONE and nothing is
  //     journalled about it (`dropped: []`), which is finding ① for this file.
  const pre = mutantBE([[
    '    const eff = effectiveConfig(cwd);\n    const user = eff.config;',
    '    const eff = { config: userConfig(), user: userConfig(), project: { path: null, keys: [], error: null } };\n    const user = eff.config;',
  ]]);
  if (ok(!pre.err && pre.hits === 1, `PRE-FIX CONTROL #1 is a patched copy of the real module with exactly ONE replacement (${pre.err || 'hit'})`)) {
    const lp = [];
    const ep = pre.mod.create({ dataDir: DATA, homeDir: H13, ...SESSION_ENV, log: { warn: (s) => lp.push(String(s)), log() { } } });
    const rp = ep.envFor({ browserKey: 'bk-13131306', integrationOn: true, cwd: PROJ });
    const cp = unmark(JSON.parse(fs.readFileSync(rp.configPath, 'utf8')), 'bk-13131306');
    ok(!('allowedDomains' in cp) && cp.args === '--no-sandbox,--user',
      'PRE-FIX CONTROL #1: round 2\'s resolver at the SAME cwd drops the project fence and keeps the user args');
    ok((rp.dropped || []).length === 0 && !lp.some((l) => /project-level/.test(l)), '…with `dropped: []` and no journal line — the drop was by OMISSION');
  }
  // (e) PRE-FIX CONTROL #2: round 2's PIN — rebuilt from the user file. With
  //     the spawn layering intact, the fence is on disk, yet the pin is applied,
  //     un-fencing the session silently. The same defect through a second door.
  const pre2 = mutantBE([[
    '        const conflict = B.pinFenceConflict({ userConfig: current, pinnedDir });',
    '        const conflict = B.pinFenceConflict({ userConfig: userConfig(), pinnedDir });',
  ]]);
  if (ok(!pre2.err && pre2.hits === 1, `PRE-FIX CONTROL #2 is a patched copy with exactly ONE replacement (${pre2.err || 'hit'})`)) {
    const ep2 = pre2.mod.create({ dataDir: DATA, homeDir: H13, ...SESSION_ENV, log: { warn() { }, log() { } } });
    const K2 = 'bk-13131307';
    ep2.envFor({ browserKey: K2, integrationOn: true, cwd: PROJ });
    const pin2 = ep2.repointPin(K2, pinned);
    ok(pin2.ok === true && ep2.resolvedProfileDir(K2) === pinned,
      'PRE-FIX CONTROL #2: a pin rebuilt from ~/.agent-browser/config.json APPLIES over a project-level fence (round 2 would have shipped a browser that refuses every command, silently)');
  }
  // takeover r3 (finding 2): a raw-debugging / user-data-dir switch never reaches the generated config, from EITHER
  // file — the verifier's shape: a session directory whose agent-browser.json names `--remote-debugging-port`
  {
    const H13r = path.join(ROOT, 'home-rawargs'); const PR = path.join(ROOT, 'proj-rawargs');
    fs.mkdirSync(path.join(H13r, '.agent-browser'), { recursive: true }); fs.mkdirSync(PR, { recursive: true });
    fs.writeFileSync(path.join(H13r, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox,--remote-debugging-port=41999,--ozone-platform=wayland', cdp: '9222', userAgent: 'U' }));
    fs.writeFileSync(path.join(PR, 'agent-browser.json'), JSON.stringify({ args: '--no-sandbox,--remote-debugging-port=42945', userAgent: 'R3-UA-LAYERED', executablePath: '/x/dumpchrome', proxy: 'http://127.0.0.1:1', allowedDomains: ['example.com'] }));
    const lr = [];
    const rr = mk({ homeDir: H13r, log: { warn: (s2) => lr.push(String(s2)), log() { } } }).envFor({ browserKey: 'bk-13131308', integrationOn: true, cwd: PR });
    const cr = unmark(JSON.parse(fs.readFileSync(rr.configPath, 'utf8')), 'bk-13131308');
    ok(cr.args === '--no-sandbox,--ozone-platform=wayland' && cr.userAgent === 'U' && !('executablePath' in cr) && !('proxy' in cr) && !('cdp' in cr) && JSON.stringify(cr.allowedDomains) === '["example.com"]',
      'takeover r3: the verifier\'s rung-D shape — the project\'s args / userAgent / executablePath / proxy are not carried, the user\'s raw-debugging switch and `cdp` are dropped, the user\'s other args and the project FENCE stand', JSON.stringify(cr));
    ok(JSON.stringify(rr.argsDropped) === '["--remote-debugging-port=41999"]' && lr.some((l) => /drops --remote-debugging-port=41999 from `args`/.test(l)) && undeclared(lr).length === 0,
      'takeover r3: …the dropped switch is SAID in a declared journal line', JSON.stringify({ ad: rr.argsDropped, lr }));
    // PRE-FIX CONTROL: the v2-r3 composition (the layered config whole, only EPHEMERAL_DENY dropped) in a patched copy of
    // the PURE module carries the verifier's raw port and user agent into the generated config
    const bsrc = read('src/browser-profiles.js');
    const pre = bsrc.replace("const r = VERBS.sanctionedConfig({ user: userConfig, project: projectConfig, deny: Object.keys(EPHEMERAL_DENY) });",
      "const lay = layerProjectConfig(userConfig, projectConfig); const cfg0 = { ...lay }; for (const k of deniedKeys(lay)) delete cfg0[k]; const r = { config: cfg0, dropped: { project: [], keys: [], args: [] } };");
    const m0 = { exports: {} }; new Function('module', 'exports', 'require', pre)(m0, m0.exports, (x) => require(x.startsWith('./') ? path.join(REPO, 'src', x) : x));
    const pc = m0.exports.generatedConfig({ userConfig: JSON.parse(fs.readFileSync(path.join(H13r, '.agent-browser', 'config.json'), 'utf8')), projectConfig: JSON.parse(fs.readFileSync(path.join(PR, 'agent-browser.json'), 'utf8')) });
    ok(pre !== bsrc && /--remote-debugging-port=42945/.test(pc.args) && pc.userAgent === 'R3-UA-LAYERED' && pc.executablePath === '/x/dumpchrome',
      'takeover r3 PRE-FIX CONTROL: the v2-r3 layering (patched copy) carries the project\'s raw debugging port, user agent and executable into the generated config — the legs above can go red', JSON.stringify(pc));
  }
  // wiring: ws-create hands the resolver the session's cwd
  const src = read('src/ws-create.js');
  ok(/remote: !!data\.hostId, cwd,/.test(src), 'ws-create passes the session\'s `cwd` to envFor (the file is read from the directory the CLI would read it from)');
  // the two documents that told the agent and the user the opposite
  ok(/agent-browser\.json/.test(read('docs/agent/browser-manual.md')) && /agent-browser\.json/.test(read('docs/kb-features.md')),
    'the manual and the kb both name `./agent-browser.json` (round 2 asserted "keeps everything in ~/.agent-browser/config.json" and said nothing about the file it dropped whole)');
}

// ═══ ⑭ THE REMOTE RUNG IS DECIDED ON THE HOST, BY THE HOST (r3) ══════════
// Round 2 sent a remote session the three names alone. MEASURED (0.32.0): on a
// host whose config names a `profile`, the second concurrent browser dies on
// `SingletonLock: File exists` where today both launch — and the directory
// rung cannot be sent unconditionally either, because on a FENCED host an
// AGENT_BROWSER_PROFILE makes every command answer `--allowed-domains is not
// supported with --profile`. The fact lives on the host, so the host decides:
// a shell fragment in buildRemoteExec's `browser` slot. test-browser-resources
// §ⓕ drives it against real browsers; this leg drives the SHELL.
console.log('\n⑭ the remote rung: a shell fragment the host runs (r3)');
{
  const { spawnSync } = await import('node:child_process');
  // Built with this suite's scratch socket base (r4): the fragment now also
  // applies the socket-root rule, and this fixture HOME is over 38 characters,
  // so running it would otherwise create the production `/tmp/vs-ab-<uid>`.
  const frag = B.remoteBrowserPrelude({ browserKey: KEY, socketDirBase: SOCKBASE });
  ok(frag.endsWith('; ') && !/\n/.test(frag), 'the fragment is one line ending in "; ", like every prelude beside it');
  ok(frag.includes(`awk '${B.TOP_LEVEL_PROFILE_AWK}'`) && /-name 'vs-bk-\*'/.test(frag) && !B.TOP_LEVEL_PROFILE_AWK.includes("'"),
    'the awk program and every pattern are single-quoted words (zsh reads an unquoted pattern as a glob — the B-3185 lesson; the awk carries no quote of its own)');
  ok(!/grep -qs '"profile"/.test(frag), 'round 3\'s grep spelling is GONE from the fragment (it counted `"profile": null` as naming a profile — r4)');
  ok(/\[ -L "\$1\/SingletonLock" \]/.test(frag), 'liveness is `-L`: chromium\'s SingletonLock is a DANGLING symlink while the browser runs (measured), and `-e` follows it and answers "absent"');
  ok(frag.includes(`-mtime +${B.REMOTE_SCRATCH_STALE_DAYS}`) && B.REMOTE_SCRATCH_STALE_DAYS === 7, 'the sweep threshold is the named constant (7 days)');
  ok(B.remoteBrowserPrelude({ browserKey: 'nope' }) === '', 'a malformed key produces NO fragment (never a half-formed shell line)');

  const shells = ['sh', 'bash', 'zsh', 'dash', 'busybox'].filter((s) => { const r = spawnSync('sh', ['-c', `command -v ${s}`], { encoding: 'utf8' }); return r.status === 0; });
  ok(shells.includes('sh'), `sh is available to drive the fragment (found: ${shells.join(', ')})`);
  for (const s of ['bash', 'zsh', 'dash', 'busybox']) if (!shells.includes(s)) skip(`${s} is not installed here — the fragment is driven under ${shells.join('/')} only`);
  const run = (shell, home, cwd, fragment = frag, extraEnv = {}, echo = 'PROFILE=[$AGENT_BROWSER_PROFILE]') => {
    const argv = shell === 'busybox' ? ['busybox', ['sh', '-c', fragment + `echo "${echo}"`]] : [shell, ['-c', fragment + `echo "${echo}"`]];
    const r = spawnSync(argv[0], argv[1], { cwd, env: { PATH: process.env.PATH, HOME: home, ...extraEnv }, encoding: 'utf8', timeout: 20000 });
    return { out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim(), status: r.status };
  };
  const HR = path.join(ROOT, 'remote-home');
  const CWD = path.join(HR, 'proj');
  const reset = (userCfg, projectCfg) => {
    fs.rmSync(HR, { recursive: true, force: true });
    fs.mkdirSync(path.join(HR, '.agent-browser'), { recursive: true }); fs.mkdirSync(CWD, { recursive: true });
    if (userCfg !== null) fs.writeFileSync(path.join(HR, '.agent-browser', 'config.json'), JSON.stringify(userCfg));
    if (projectCfg !== null) fs.writeFileSync(path.join(CWD, 'agent-browser.json'), JSON.stringify(projectCfg));
  };
  const want = `PROFILE=[${HR}/.vibespace/browser-profiles/vs-${KEY}]`;
  for (const shell of shells) {
    reset({ args: '--no-sandbox', profile: '/x/shared' }, null);
    let r = run(shell, HR, CWD);
    ok(r.status === 0 && r.out === want && r.err === '', `${shell}: a host config NAMING a profile ⇒ AGENT_BROWSER_PROFILE=<per-key dir> (rung C there)${r.err ? ' — stderr: ' + r.err.slice(0, 120) : ''}`);
    reset({ args: '--no-sandbox', headed: false }, null);
    r = run(shell, HR, CWD);
    ok(r.status === 0 && r.out === 'PROFILE=[]' && r.err === '', `${shell}: a host config naming NO profile ⇒ nothing exported (rung N: the names alone are ephemeral there, measured)`);
    reset({ args: '--no-sandbox' }, { profile: '/p' });
    r = run(shell, HR, CWD);
    ok(r.status === 0 && r.out === want, `${shell}: a PROJECT-level profile counts too (the CLI reads ./agent-browser.json from the session dir, and buildRemoteExec cd's there first)`);
    reset(null, null);
    r = run(shell, HR, CWD);
    ok(r.status === 0 && r.out === 'PROFILE=[]' && r.err === '', `${shell}: no config files at all ⇒ nothing, silently (grep -qs), exit 0`);
  }
  // the sweep: stale+unlocked swept, LIVE (dangling symlink) kept, young kept, foreign name kept
  reset({ args: '--no-sandbox', profile: '/x' }, null);
  const SD = path.join(HR, '.vibespace', 'browser-profiles');
  const old = Date.now() / 1000 - 10 * 86400;
  for (const d of ['vs-bk-0ld00001', 'vs-bk-11ve0001', 'vs-bk-y0ung001', 'other-dir']) fs.mkdirSync(path.join(SD, d), { recursive: true });
  fs.symlinkSync('somehost-12345', path.join(SD, 'vs-bk-11ve0001', 'SingletonLock'));   // the MEASURED live shape: dangling
  for (const d of ['vs-bk-0ld00001', 'vs-bk-11ve0001', 'other-dir']) fs.utimesSync(path.join(SD, d), old, old);
  ok(!fs.existsSync(path.join(SD, 'vs-bk-11ve0001', 'SingletonLock')) && fs.lstatSync(path.join(SD, 'vs-bk-11ve0001', 'SingletonLock')).isSymbolicLink(),
    'setup: the live marker is a dangling symlink — `existsSync`/`-e` say absent, `lstat`/`-L` say present (chromium\'s real shape)');
  const rs = run('sh', HR, CWD);
  ok(rs.status === 0, 'the sweep runs to exit 0');
  ok(!fs.existsSync(path.join(SD, 'vs-bk-0ld00001')), 'a stale, unlocked per-key dir is SWEPT');
  ok(fs.existsSync(path.join(SD, 'vs-bk-11ve0001')), 'a stale dir whose browser is LIVE (dangling SingletonLock) is KEPT');
  ok(fs.existsSync(path.join(SD, 'vs-bk-y0ung001')), 'a young dir is kept (a create may be in flight)');
  ok(fs.existsSync(path.join(SD, 'other-dir')), 'a directory that is not ours is never touched');
  // PRE-FIX CONTROL: the same sweep with `-e` only — the LIVE browser's dir goes.
  fs.mkdirSync(path.join(SD, 'vs-bk-0ld00001'), { recursive: true }); fs.utimesSync(path.join(SD, 'vs-bk-0ld00001'), old, old);
  const eOnly = frag.replace('[ -L "$1/SingletonLock" ] || ', '');
  ok(eOnly !== frag, 'setup: the control really removed the -L test');
  run('sh', HR, CWD, eOnly);
  ok(!fs.existsSync(path.join(SD, 'vs-bk-11ve0001')), 'PRE-FIX CONTROL: with `-e` alone the LIVE browser\'s directory is swept out from under it');
  fs.rmSync(path.join(HR, '.vibespace'), { recursive: true, force: true });
  ok(run('sh', HR, CWD).status === 0, 'no scratch dir at all ⇒ still exit 0 (the last statement is an `if`, never a bare `&&`)');

  // ═ r4: "NAMES A PROFILE" IS ONE QUESTION IN TWO SPELLINGS, DRIVEN OVER ONE TABLE
  // Round 3's `grep '"profile"[[:space:]]*:'` was a LOOSER spelling than the
  // PURE predicate: it counted `"profile": null` and `""` as naming a profile,
  // counted a key nested inside another value, and could not see a project
  // file's `null` overriding the user file's string — so a host config
  // `{…, allowedDomains, profile: null}`, which works bare, was handed an
  // AGENT_BROWSER_PROFILE the CLI refuses beside the fence (measured 0.32.0).
  // The two spellings now answer the SAME table, under every shell AND every
  // awk on the box (the system awk, and busybox's through a PATH shim).
  {
    const table = [
      ['absent', { args: '--no-sandbox' }, null, false],
      ['null', { args: '--no-sandbox', profile: null, allowedDomains: ['example.com'] }, null, false],
      ['empty string', { args: '--no-sandbox', profile: '' }, null, false],
      ['Default (a Chrome profile NAME)', { profile: 'Default' }, null, true],
      ['/abs/path', { args: '--no-sandbox', profile: '/home/u/.agent-browser/default-profile' }, null, true],
      ['nested-only', { args: '--no-sandbox', plugins: [{ name: 'p', profile: '/nested/only' }], other: { profile: 'deep' } }, null, false],
      ['a number', { profile: 12 }, null, false],
      ['project null overrides a user string', { profile: '/u' }, { profile: null }, false],
      ['project string over user none', { args: '--no-sandbox' }, { profile: '/p' }, true],
      ['project string over user string', { profile: '/u' }, { profile: '/p' }, true],
      ['escaped quotes in the key beside it', { 'pro"file': 'x', profile: 'a"b' }, null, true],
      ['no files at all', null, null, false],
    ];
    const awks = [['system awk', process.env.PATH]];
    if (shells.includes('busybox')) {
      const bb = path.join(ROOT, 'bbawk'); fs.mkdirSync(bb, { recursive: true });
      const bbBin = String(spawnSync('sh', ['-c', 'command -v busybox'], { encoding: 'utf8' }).stdout || '').trim();
      try { fs.symlinkSync(bbBin, path.join(bb, 'awk')); } catch { }   // busybox dispatches on argv[0]
      awks.push(['busybox awk', bb + ':' + process.env.PATH]);
    } else skip('busybox is not installed here — the parity table is driven under the system awk only');
    let driven = 0; const disagree = [];
    for (const [awkName, PATH] of awks) for (const shell of shells) for (const [label, u, p, want] of table) {
      reset(u, p);
      const r = run(shell, HR, CWD, frag, { PATH });
      const exported = r.status === 0 && r.out.startsWith('PROFILE=[') && r.out !== 'PROFILE=[]';
      const pure = B.configNamesProfile(B.layerProjectConfig(u || {}, p));
      driven++;
      if (exported !== want || pure !== want || r.err) disagree.push(`${awkName}/${shell}/${label}: shell=${exported} pure=${pure} want=${want}${r.err ? ' stderr=' + r.err.slice(0, 80) : ''}`);
    }
    ok(driven === table.length * shells.length * awks.length, `the table was driven ${driven} times (${table.length} rows × ${shells.length} shells × ${awks.length} awks)`);
    ok(disagree.length === 0, `the PURE predicate and the shipped fragment agree on EVERY row${disagree.length ? ': ' + disagree.join(' | ') : ' — including null, empty, nested-only and a project null overriding a user string'}`);
    // PRE-FIX CONTROL: round 3's spelling, verbatim, spliced into the same fragment
    const r3grep = `if grep -qs '"profile"[[:space:]]*:' ./${B.PROJECT_CONFIG_NAME} "$HOME/${B.USER_CONFIG_REL}" 2>/dev/null; then export AGENT_BROWSER_PROFILE="$vs_ab_d/vs-${KEY}"; fi; `;
    const iP = frag.indexOf('vs_ab_p() {'), iS = frag.indexOf('if [ -z "${AGENT_BROWSER_SOCKET_DIR:-}" ]');
    const pre = iP > 0 && iS > iP ? frag.slice(0, iP) + r3grep + frag.slice(iS) : '';
    if (ok(pre && /grep -qs/.test(pre) && !pre.includes('vs_ab_p'), 'setup: the control is the fragment with round 3\'s grep put back in place of the awk')) {
      reset({ args: '--no-sandbox', profile: null, allowedDomains: ['example.com'] }, null);
      ok(run('sh', HR, CWD, pre).out === want && run('sh', HR, CWD).out === 'PROFILE=[]',
        'PRE-FIX CONTROL: round 3\'s grep EXPORTS a profile for `"profile": null` beside a fence — a host shape that works bare and then answers "--allowed-domains is not supported with --profile"; the awk exports nothing');
      reset({ plugins: [{ profile: '/nested' }] }, null);
      ok(run('sh', HR, CWD, pre).out === want && run('sh', HR, CWD).out === 'PROFILE=[]', '…and for a NESTED key, where only the top-level one is the CLI\'s');
      reset({ profile: '/u' }, { profile: null });
      ok(run('sh', HR, CWD, pre).out === want && run('sh', HR, CWD).out === 'PROFILE=[]', '…and for a project `null` overriding a user string (the CLI\'s per-key precedence, which a grep over both files cannot express)');
    }
  }

  // ═ r4: THE SOCKET ROOT RULE RIDES THE SAME FRAGMENT, computed from the host's own $HOME
  {
    const uid = process.getuid();
    const sdir = path.join(SOCKBASE, `vs-ab-${uid}`);
    const HSHORT = path.join(SHORT, 'h'); fs.mkdirSync(path.join(HSHORT, '.agent-browser'), { recursive: true });
    ok(HR.length > 38 && HSHORT.length <= 38, `setup: the remote fixture HOME is ${HR.length} chars (over the 38 the CLI's own root allows), the short one ${HSHORT.length}`);
    reset({ args: '--no-sandbox' }, null);
    const S = 'SOCK=[$AGENT_BROWSER_SOCKET_DIR]';
    for (const shell of shells) {
      fs.rmSync(sdir, { recursive: true, force: true });
      const a = run(shell, HR, CWD, frag, {}, S);
      ok(a.status === 0 && a.out === `SOCK=[${sdir}]` && a.err === '', `${shell}: a long HOME ⇒ AGENT_BROWSER_SOCKET_DIR=<base>/vs-ab-<uid> exported on the host${a.err ? ' — ' + a.err.slice(0, 100) : ''}`);
      ok(fs.lstatSync(sdir).isDirectory() && !fs.lstatSync(sdir).isSymbolicLink() && (fs.statSync(sdir).mode & 0o777) === 0o700 && fs.statSync(sdir).uid === uid, `${shell}: …a real 0700 directory this user owns`);
      ok(run(shell, HSHORT, CWD, frag, {}, S).out === 'SOCK=[]', `${shell}: a short HOME ⇒ nothing (the CLI's own root fits)`);
      ok(run(shell, HR, CWD, frag, { XDG_RUNTIME_DIR: path.join(SHORT, 'x') }, S).out === 'SOCK=[]', `${shell}: a short $XDG_RUNTIME_DIR ⇒ nothing (the CLI's own second rung, measured precedence)`);
      ok(run(shell, HR, CWD, frag, { AGENT_BROWSER_SOCKET_DIR: '/pre/set' }, S).out === 'SOCK=[/pre/set]', `${shell}: a pre-set AGENT_BROWSER_SOCKET_DIR is left alone`);
      fs.rmSync(sdir, { recursive: true, force: true }); fs.symlinkSync(SHORT, sdir);
      const h = run(shell, HR, CWD, frag, {}, S);
      ok(h.status === 0 && h.out === 'SOCK=[]', `${shell}: the fixed name pre-created as a SYMLINK ⇒ nothing exported (a socket may not live in somebody else's directory; ownership by another uid cannot be staged without root, so the planted link is the reachable shape)`);
      fs.unlinkSync(sdir);
    }
    ok(frag.includes(`+ ${B.socketTailBytes(KEY)} )) -gt ${B.SOCKET_PATH_MAX}`), `the fragment's arithmetic uses the tail the PURE half computes from the names (${B.socketTailBytes(KEY)} bytes) against ${B.SOCKET_PATH_MAX}`);
    ok(/printf %s "\$vs_ab_r" \| wc -c/.test(frag), 'the length is counted in BYTES (`wc -c`), like the kernel counts sun_path — `${#var}` is characters in bash/zsh');
    ok(B.SOCKET_DIR_BASE === '/tmp' && B.remoteBrowserPrelude({ browserKey: KEY }).includes(`${B.SOCKET_DIR_BASE}/vs-ab-$(id -u)`),
      'production\'s base is the LITERAL /tmp (a short root is the point; TMPDIR may be the long path) — asserted on the string, never run from this tier');
  }

  // wiring: the ONE composition carries it, at every remote site
  const rs2 = read('src/remote-shell.js');
  ok(/browser = ''/.test(rs2) && /\+ pre \+ browser \+ resolve \+/.test(rs2), 'buildRemoteExec has a NAMED `browser` slot placed after `pre` and before `resolve`');
  const { buildRemoteExec, AMBIENT_OAT_UNSET, sessionCwdExport } = require('../src/remote-shell.js');
  const shq = (x) => `'${String(x).replace(/'/g, `'"'"'`)}'`;
  const line = buildRemoteExec({ cwd: '/w', shq, pre: 'PRE; ', browser: frag, parts: [shq('AGENT_BROWSER_SESSION=vs-' + KEY), 'agent-browser'] });
  ok(line.indexOf("cd '/w'") < line.indexOf('PRE; ') && line.indexOf('PRE; ') < line.indexOf('vs_ab_d=') && line.indexOf('vs_ab_d=') < line.indexOf('exec env'),
    'the fragment lands after the cd (so ./agent-browser.json is the session dir) and after the prelude, before exec env');
  ok(buildRemoteExec({ cwd: '/w', shq, parts: ['x'] }) === "cd '/w' 2>/dev/null; " + sessionCwdExport('/w', shq) + AMBIENT_OAT_UNSET + 'exec env x',
    'an empty `browser` changes nothing (every non-browser caller is byte-identical to round 2\'s composition + lane L r5\'s session-cwd export)');
  const ws = read('src/ws-create.js');
  const sites = (ws.match(/buildRemoteExec\(\{/g) || []).length;
  const wired = (ws.match(/browser: spawnBrowserPre/g) || []).length;
  ok(sites === 5 && wired === sites, `ALL ${sites} buildRemoteExec sites pass \`browser: spawnBrowserPre\` (${wired}) — a site that forgets is a remote transport with the round-2 collision`);
  ok(/spawnBrowserPre = be\.remotePrelude \|\| ''/.test(ws), 'and the fragment comes from the resolver\'s answer, never re-spelled in ws-create');
  const schema = read('src/session-schema.js');
  ok(/_browserVariant:[^\n]*\bH \(REMOTE/.test(schema) && /_browserVariant:[^\n]*none \(nothing emitted/.test(schema), 'the schema row spells the new rungs (H, N, none)');
}

// ═══ ⑯ THE GENERATED CONFIG IS A SECRET (r3) ═════════════════════════════
// It is a verbatim copy of the user's config — proxy credentials and plugin
// credentials included — and round 2 wrote it with the process umask (measured
// 0664 in a 0775 directory) while the token files beside it in ws-create use
// {mode: 0o600}.
console.log('\n⑯ modes: the generated config is 0600 in a 0700 directory (r3)');
{
  const H16 = path.join(ROOT, 'home-secret');
  fs.mkdirSync(path.join(H16, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(H16, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', proxy: 'http://alice:s3cr3t@127.0.0.1:7890' }), { mode: 0o600 });
  const D16 = path.join(ROOT, 'data-modes');
  // an ENV_DIR that ALREADY exists with the old mode — `mkdirSync`'s mode applies only to what it creates
  fs.mkdirSync(path.join(D16, 'browser-env'), { recursive: true, mode: 0o775 });
  fs.chmodSync(path.join(D16, 'browser-env'), 0o775);
  const e = BE.create({ dataDir: D16, homeDir: H16, ...SESSION_ENV, log: { warn() { }, log() { } } });
  const r = e.envFor({ browserKey: 'bk-16161601', integrationOn: true });
  const mode = (p) => fs.statSync(p).mode & 0o777;
  ok(fs.readFileSync(r.configPath, 'utf8').includes('s3cr3t'), 'setup: the generated config really carries the proxy credential');
  ok(mode(r.configPath) === 0o600, `the generated config is 0600 (got ${mode(r.configPath).toString(8)})`);
  ok(mode(e.ENV_DIR) === 0o700, `its directory is 0700 even though it pre-existed at 0775 (got ${mode(e.ENV_DIR).toString(8)})`);
  ok(mode(e.PROFILE_DIR) === 0o700, `the scratch root is 0700 (got ${mode(e.PROFILE_DIR).toString(8)})`);
  // the variant-C scratch dir is a chromium user-data-dir: 0700 too
  fs.mkdirSync(e.configPathFor('bk-16161602'), { recursive: true });   // force the C rung
  const c = e.envFor({ browserKey: 'bk-16161602', integrationOn: true });
  ok(c.variant === 'C' && mode(e.scratchDirFor('bk-16161602')) === 0o700, `the per-session scratch dir is 0700 (got ${mode(e.scratchDirFor('bk-16161602')).toString(8)})`);
  // a pin rewrite keeps the mode (it goes through the same writer)
  e.repointPin('bk-16161601', path.join(H16, 'pin'));
  ok(mode(r.configPath) === 0o600, 'a pin rewrite keeps 0600 (same writer)');
  // PRE-FIX CONTROL, umask-independent: the retired writer takes the umask's
  // answer, ours ignores it. On a box whose umask already yields 0600 the two
  // would agree, so the control asserts the RULE (0666 & ~umask) rather than a
  // literal 0664.
  const um = process.umask();
  const retired = path.join(D16, 'retired.json');
  fs.writeFileSync(retired, '{}');
  ok(mode(retired) === (0o666 & ~um), `PRE-FIX CONTROL: round 2's bare writeFileSync gives 0666 & ~umask = ${(0o666 & ~um).toString(8)} here (umask ${um.toString(8)})`);
  ok(BE.FILE_MODE === 0o600 && BE.DIR_MODE === 0o700, 'the modes are named constants the ORCH exports');
  const wsrc = read('src/ws-create.js');
  ok((wsrc.match(/\{ mode: 0o600 \}/g) || []).length >= 3, 'and match the mode the token-bearing files beside it in ws-create already use');
}

// ═══ ⑰ A FENCED CONFIG NEVER LANDS ON C (r4) ═════════════════════════════
// Rung C exports `AGENT_BROWSER_PROFILE`, and the CLI refuses `--allowed-domains`
// beside a profile at the argument check — so round 3's `D → C` under a fenced
// config was a browser that answered EVERY command `✗ --allowed-domains is not
// supported with --profile` where the bare CLI works (measured; test-browser-
// resources §ⓖ drives the binary). The fence is now an INPUT of the ladder, the
// C block is not attempted, and the C rung records the session's own directory
// beside its link so a LATER pin can ask both of the CLI's files.
console.log('\n⑰ a fenced effective config skips the C rung (r4)');
{
  const H17 = path.join(ROOT, 'home-fence-c');
  fs.mkdirSync(path.join(H17, '.agent-browser'), { recursive: true });
  const cfg17 = (o) => fs.writeFileSync(path.join(H17, '.agent-browser', 'config.json'), JSON.stringify(o));
  cfg17({ args: '--no-sandbox', headed: false, allowedDomains: ['example.com'] });
  const D17 = path.join(ROOT, 'data-fence-c');
  const lines = [];
  const e = BE.create({ dataDir: D17, homeDir: H17, ...SESSION_ENV, log: { warn: (s) => lines.push(String(s)), log() { } } });
  const K = 'bk-17171701';
  fs.mkdirSync(e.configPathFor(K), { recursive: true });   // a DIRECTORY where the config must go: the real C trigger this suite already uses
  const r = e.envFor({ browserKey: K, integrationOn: true });
  ok(r.variant === 'N', `THE FIX: generated config unwritable + a FENCED config ⇒ variant N, not C (got ${r.variant})`);
  const m = pairsMap(r.pairs);
  ok(!('AGENT_BROWSER_PROFILE' in m) && !('AGENT_BROWSER_CONFIG' in m) && m.AGENT_BROWSER_SESSION === 'vs-' + K,
    'the pairs are the three names alone — no PROFILE the CLI would refuse beside the fence, no CONFIG that could not be written');
  ok(!fs.existsSync(e.linkPathFor(K)) && !fs.existsSync(e.scratchDirFor(K)) && !fs.existsSync(e.cwdPathFor(K)),
    'and NO symlink, scratch dir or sidecar was made — a refused rung leaves nothing to sweep');
  const lad = ladderOnly(lines);
  ok(lad.length === 2 && /D → C/.test(lad[0]) && /C → N/.test(lad[1]) && /rung C refused/.test(lad[1]) && /allowedDomains: example\.com/.test(lad[1]),
    `the journal: "D → C" (config unusable), then "C → N" with the FENCE as the reason (${lad.length} ladder lines)`);
  ok(undeclared(lines).length === 0, '…and nothing undeclared rode along');
  // the PROJECT-level fence counts too (the effective config is both files, as at every other site)
  cfg17({ args: '--no-sandbox', headed: false });
  const P17 = path.join(ROOT, 'proj-fence-c'); fs.mkdirSync(P17, { recursive: true });
  fs.writeFileSync(path.join(P17, 'agent-browser.json'), JSON.stringify({ allowedDomains: ['x.org'] }));
  const K2 = 'bk-17171702';
  fs.mkdirSync(e.configPathFor(K2), { recursive: true });
  const r2 = e.envFor({ browserKey: K2, integrationOn: true, cwd: P17 });
  ok(r2.variant === 'N' && !('AGENT_BROWSER_PROFILE' in pairsMap(r2.pairs)), 'a PROJECT-level fence skips C too (the effective config is both files)');
  // NEGATIVE CONTROL: the same unwritable tree with NO fence anywhere ⇒ C, link and all
  const K3 = 'bk-17171703';
  fs.mkdirSync(e.configPathFor(K3), { recursive: true });
  const r3 = e.envFor({ browserKey: K3, integrationOn: true });
  ok(r3.variant === 'C' && pairsMap(r3.pairs).AGENT_BROWSER_PROFILE === e.linkPathFor(K3) && fs.existsSync(e.scratchDirFor(K3)),
    'NEGATIVE CONTROL: the same unwritable tree UNFENCED ⇒ C with its symlink and scratch dir (round 3\'s rung, unchanged where it is safe)');
  // THE C RUNG RECORDS THE SESSION'S DIRECTORY beside its link, so a later pin
  // asks BOTH of the CLI's files as they stand THEN — round 3's C-branch check
  // read `effectiveConfig(null)`, the user file alone.
  const K4 = 'bk-17171704';
  const P4 = path.join(ROOT, 'proj-c-pin'); fs.mkdirSync(P4, { recursive: true });
  fs.mkdirSync(e.configPathFor(K4), { recursive: true });
  const r4 = e.envFor({ browserKey: K4, integrationOn: true, cwd: P4 });
  ok(r4.variant === 'C' && JSON.parse(fs.readFileSync(e.cwdPathFor(K4), 'utf8')).cwd === P4, 'on C the session\'s cwd is recorded in `<key>.cwd` beside the link');
  ok((fs.statSync(e.cwdPathFor(K4)).mode & 0o777) === 0o600, '…0600, like every file this module writes');
  fs.writeFileSync(path.join(P4, 'agent-browser.json'), JSON.stringify({ allowedDomains: ['later.example'] }));   // the fence appears AFTER spawn, at project level
  const pinned = path.join(H17, '.agent-browser', 'vs-bp-c');
  const pr = e.repointPin(K4, pinned);
  ok(pr.ok === false && /allowedDomains/.test(pr.why) && /later\.example/.test(pr.why),
    'a pin on the C rung is refused by a PROJECT-level fence — the check reads the session directory\'s file, which round 3\'s `effectiveConfig(null)` could not see');
  fs.rmSync(path.join(P4, 'agent-browser.json'));
  ok(e.repointPin(K4, pinned).ok === true && e.repointPin(K4, null).ok === true, 'NEGATIVE CONTROL: with the project fence gone the same pin applies (and unpins)');
  fs.unlinkSync(e.cwdPathFor(K4));
  const pm = e.repointPin(K4, pinned);
  ok(pm.ok === false && /not recorded/.test(pm.why) && /\.cwd/.test(pm.why),
    'a C-rung session WITHOUT the record (a pre-r4 spawn) is refused BY NAME, never half-checked against the user file alone');
  // PRE-FIX CONTROL #1: round 3's resolver — the fence is not an input of the C rung
  const pre = mutantBE([['    const fenced = !!fence;', '    const fenced = false;']]);
  if (ok(!pre.err && pre.hits === 1, `PRE-FIX CONTROL #1 is a patched copy of the real module with exactly ONE replacement (${pre.err || 'hit'})`)) {
    cfg17({ args: '--no-sandbox', headed: false, allowedDomains: ['example.com'] });
    const ep = pre.mod.create({ dataDir: path.join(ROOT, 'data-fence-c-pre'), homeDir: H17, ...SESSION_ENV, log: { warn() { }, log() { } } });
    const K5 = 'bk-17171705';
    fs.mkdirSync(ep.configPathFor(K5), { recursive: true });
    const rp = ep.envFor({ browserKey: K5, integrationOn: true });
    ok(rp.variant === 'C' && !!pairsMap(rp.pairs).AGENT_BROWSER_PROFILE,
      'PRE-FIX CONTROL #1: round 3 lands on C and exports AGENT_BROWSER_PROFILE beside the fence — the CLI refuses every command with it (measured; test-browser-resources §ⓖ)');
  }
  // PRE-FIX CONTROL #2: round 3's C-rung pin check — the user file alone
  const pre2 = mutantBE([[
    '        const conflict = B.pinFenceConflict({ userConfig: effectiveConfig(rec.cwd).config, pinnedDir });',
    '        const conflict = B.pinFenceConflict({ userConfig: effectiveConfig(null).config, pinnedDir });',
  ]]);
  if (ok(!pre2.err && pre2.hits === 1, `PRE-FIX CONTROL #2 is a patched copy with exactly ONE replacement (${pre2.err || 'hit'})`)) {
    cfg17({ args: '--no-sandbox', headed: false });
    const ep2 = pre2.mod.create({ dataDir: path.join(ROOT, 'data-fence-c-pre2'), homeDir: H17, ...SESSION_ENV, log: { warn() { }, log() { } } });
    const K6 = 'bk-17171706';
    fs.mkdirSync(ep2.configPathFor(K6), { recursive: true });
    ep2.envFor({ browserKey: K6, integrationOn: true, cwd: P4 });
    fs.writeFileSync(path.join(P4, 'agent-browser.json'), JSON.stringify({ allowedDomains: ['later.example'] }));
    ok(ep2.repointPin(K6, pinned).ok === true,
      'PRE-FIX CONTROL #2: round 3\'s C-rung pin APPLIES over a project-level fence (a browser that would refuse every command, silently)');
    fs.rmSync(path.join(P4, 'agent-browser.json'));
  }
  // the sweep knows the sidecar
  const K7 = 'bk-17171707';
  fs.mkdirSync(e.configPathFor(K7), { recursive: true });
  e.envFor({ browserKey: K7, integrationOn: true, cwd: P4 });
  const old = Date.now() / 1000 - 7200;
  for (const p of [e.configPathFor(K7), e.cwdPathFor(K7), e.scratchDirFor(K7)]) { try { fs.utimesSync(p, old, old); } catch { } }
  try { fs.lutimesSync(e.linkPathFor(K7), old, old); } catch { }
  e.sweep(new Set());
  ok(!fs.existsSync(e.cwdPathFor(K7)) && !fs.existsSync(e.linkPathFor(K7)) && !fs.existsSync(e.scratchDirFor(K7)),
    'the sweep removes the `.cwd` record with its link and scratch dir (one more thing under data/ nobody owns is exactly what the sweep exists for)');
}

// ═══ ⑱ THE FIFTH VARIABLE: the daemon socket root (r4) ═══════════════════
// The CLI's socket lives at `<root>/namespaces/<ns>/run/<session>.sock` under
// `$HOME/.agent-browser` (or `$XDG_RUNTIME_DIR/agent-browser`), unix sockets are
// capped at 103 bytes, and our names put the tail at 50 — so a HOME over 38
// characters made EVERY agent-browser command in a VibeSpace session answer
// `Session name … is too long` where the bare CLI's `default` name still fit
// (measured at 38 vs 39). Round 3 recorded it and left it to the manual.
console.log('\n⑱ AGENT_BROWSER_SOCKET_DIR when the CLI\'s own root is over 103 bytes (r4)');
{
  ok(B.socketRootFor({ home: '/h' }).root === '/h/.agent-browser' && B.socketRootFor({ home: '/h' }).via === 'HOME', 'root = $HOME/.agent-browser by default');
  ok(B.socketRootFor({ home: '/h', xdgRuntimeDir: '/run/user/1' }).root === '/run/user/1/agent-browser', '…$XDG_RUNTIME_DIR/agent-browser when that is set (measured on `session info --json`)');
  ok(B.socketRootFor({ home: '/h', xdgRuntimeDir: '/run/user/1', socketDir: '/s' }).root === '/s', '…and AGENT_BROWSER_SOCKET_DIR wins over both (measured)');
  ok(B.socketTailBytes(KEY) === 50, `the tail past the root is 50 bytes for our names (${B.socketTailBytes(KEY)})`);
  const at = (n) => B.socketDirDecision({ browserKey: KEY, home: '/' + 'h'.repeat(n - 1), uid: 1000 });
  ok(at(38).needed === false && at(38).bytes === 103, 'a 38-char HOME fits exactly (103 bytes) — the CLI accepts it (measured)');
  ok(at(39).needed === true && at(39).bytes === 104, 'a 39-char HOME is one byte over (104) — the CLI refuses every command (measured: "Socket path would be 104 bytes (max 103)")');
  ok(at(39).dir === '/tmp/vs-ab-1000' && at(39).fits === true, 'the remedy is <base>/vs-ab-<uid>, and it fits');
  ok(B.socketDirDecision({ browserKey: KEY, home: '/' + 'h'.repeat(60), xdgRuntimeDir: '/run/user/1000', uid: 1000 }).needed === false,
    'a long HOME beside a short $XDG_RUNTIME_DIR needs nothing — the CLI already uses the runtime dir');
  ok(B.utf8Bytes('/héllo') === 7 && B.socketDirDecision({ browserKey: KEY, home: '/' + 'é'.repeat(19), uid: 1000 }).bytes === 1 + 38 + 65,
    'BYTES, not characters: nineteen two-byte characters count as 38 (the kernel counts sun_path in bytes)');
  ok(B.socketDirBaseOf('/tmp/') === '/tmp' && B.socketDirBaseOf('bad;rm -rf /') === '/tmp' && B.socketDirBaseOf('') === '/tmp',
    'a base a shell could read as syntax falls back to the literal (the fragment interpolates it)');
  ok(B.socketDirDecision({ browserKey: KEY, home: '/' + 'h'.repeat(60), uid: 1000, base: '/' + 'b'.repeat(60) }).fits === false,
    'a base that does not itself fit is reported (`fits:false`), so the ORCH never emits a remedy that does not remedy');
  ok(B.browserEnvFor({ browserKey: KEY, variant: 'N', enabled: true, socketDir: '/s' }).includes('AGENT_BROWSER_SOCKET_DIR=/s') && B.browserEnvFor({ browserKey: KEY, variant: 'N', enabled: true }).length === 3,
    'the composition carries the fifth pair only when handed one');
  ok(B.browserEnvFor({ browserKey: KEY, variant: 'none', enabled: true, socketDir: '/s' }).length === 0, '`none` still emits ZERO pairs, socket dir or not');

  // ORCH: a long home, a bare-login env (no XDG), the scratch base
  const uid = process.getuid();
  const HL = path.join(ROOT, 'home-long-enough-for-the-socket-rule');
  fs.mkdirSync(path.join(HL, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(HL, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: false }));
  ok(HL.length > 38, `setup: the fixture HOME is ${HL.length} chars`);
  const sdir = path.join(SOCKBASE, `vs-ab-${uid}`);
  fs.rmSync(sdir, { recursive: true, force: true });
  const l = [];
  const e = BE.create({ dataDir: path.join(ROOT, 'data-sock'), homeDir: HL, env: {}, socketDirBase: SOCKBASE, log: { warn: (s) => l.push(String(s)), log() { } } });
  const r = e.envFor({ browserKey: 'bk-18181801', integrationOn: true });
  const m = pairsMap(r.pairs);
  ok(r.variant === 'D' && m.AGENT_BROWSER_SOCKET_DIR === sdir, `THE FIX: a ${HL.length}-char HOME ⇒ AGENT_BROWSER_SOCKET_DIR=<scratch base>/vs-ab-${uid} as a FIFTH pair (${r.pairs.length} pairs)`);
  ok(!!r.socket && r.socket.needed && r.socket.via === 'HOME' && r.socket.bytes > 103,
    `…because the CLI's own root would be ${r.socket && r.socket.bytes} bytes (via ${r.socket && r.socket.via})`);
  ok(fs.lstatSync(sdir).isDirectory() && !fs.lstatSync(sdir).isSymbolicLink() && (fs.statSync(sdir).mode & 0o777) === 0o700 && fs.statSync(sdir).uid === uid,
    'the directory exists, is real, is 0700, and is ours');
  const sl = l.filter((x) => /AGENT_BROWSER_SOCKET_DIR=/.test(x));
  ok(sl.length === 1 && /would be \d+ bytes/.test(sl[0]) && /too long/.test(sl[0]) && CONFIG_RE.test(sl[0]),
    'ONE journal line says what would have happened and what was set, of a declared kind');
  for (let i = 0; i < 5; i++) e.envFor({ browserKey: `bk-1818180${i + 2}`, integrationOn: true });
  ok(l.filter((x) => /AGENT_BROWSER_SOCKET_DIR=/.test(x)).length === 1, '…and once only: a long home is permanent while this runs once per create');
  const eX = BE.create({ dataDir: path.join(ROOT, 'data-sock-x'), homeDir: HL, env: { XDG_RUNTIME_DIR: '/run/user/' + uid }, socketDirBase: SOCKBASE, log: { warn() { }, log() { } } });
  ok(!('AGENT_BROWSER_SOCKET_DIR' in pairsMap(eX.envFor({ browserKey: 'bk-18181811', integrationOn: true }).pairs)),
    'a session whose env carries a short $XDG_RUNTIME_DIR gets no fifth pair (agentEnv passes it through and the CLI uses it — the systemd shape)');
  const HS = path.join(SHORT, 'hs'); fs.mkdirSync(path.join(HS, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(HS, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: false }));
  const rS = BE.create({ dataDir: path.join(ROOT, 'data-sock-s'), homeDir: HS, env: {}, socketDirBase: SOCKBASE, log: { warn() { }, log() { } } }).envFor({ browserKey: 'bk-18181812', integrationOn: true });
  ok(!('AGENT_BROWSER_SOCKET_DIR' in pairsMap(rS.pairs)) && rS.socket && rS.socket.needed === false && rS.pairs.length === 4,
    `NEGATIVE CONTROL: a ${HS.length}-char HOME ⇒ the four pairs of round 3, nothing more`);
  // HIJACK: the fixed name pre-created as a SYMLINK ⇒ no variable, and the journal names why
  fs.rmSync(sdir, { recursive: true, force: true }); fs.symlinkSync(SHORT, sdir);
  const lh = [];
  const eh = BE.create({ dataDir: path.join(ROOT, 'data-sock-h'), homeDir: HL, env: {}, socketDirBase: SOCKBASE, log: { warn: (s) => lh.push(String(s)), log() { } } });
  const rh = eh.envFor({ browserKey: 'bk-18181813', integrationOn: true });
  ok(!('AGENT_BROWSER_SOCKET_DIR' in pairsMap(rh.pairs)) && !!rh.socket.refused && /SYMLINK/.test(rh.socket.refused),
    'a planted SYMLINK at the fixed name ⇒ NO variable (a socket may not live in somebody else\'s directory)');
  ok(lh.some((x) => /could NOT be used/.test(x) && /SYMLINK/.test(x) && /refuse every command/.test(x)), '…and the journal says so, with the CLI\'s consequence');
  ok(fs.lstatSync(sdir).isSymbolicLink() && fs.readlinkSync(sdir) === SHORT, '…and the planted link was not touched (no chmod through it)');
  fs.unlinkSync(sdir);
  fs.writeFileSync(sdir, 'x');
  ok(/not a directory/.test(eh.envFor({ browserKey: 'bk-18181814', integrationOn: true }).socket.refused || ''), 'a plain FILE at the name is refused too');
  fs.unlinkSync(sdir);
  ok(e.ensureSocketDir(path.join(SOCKBASE, 'fresh-' + process.pid)).ok === true && (fs.statSync(path.join(SOCKBASE, 'fresh-' + process.pid)).mode & 0o777) === 0o700,
    'POSITIVE CONTROL: ensureSocketDir makes a fresh 0700 directory (the refusals above are not a broken helper)');
  // `none` emits nothing even when the root is long: the floor is still the floor
  const HP = path.join(ROOT, 'home-long-with-a-profile');
  fs.mkdirSync(path.join(HP, '.agent-browser'), { recursive: true });
  fs.writeFileSync(path.join(HP, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', profile: '/shared' }));
  const roP = path.join(ROOT, 'readonly-p'); fs.mkdirSync(roP, { recursive: true });
  fs.writeFileSync(path.join(roP, 'browser-env'), 'not a directory'); fs.writeFileSync(path.join(roP, 'browser-profiles'), 'not a directory');
  const rn = BE.create({ dataDir: roP, homeDir: HP, env: {}, socketDirBase: SOCKBASE, log: { warn() { }, log() { } } }).envFor({ browserKey: 'bk-18181815', integrationOn: true });
  ok(rn.variant === 'none' && rn.pairs.length === 0 && rn.socket === null, '`none` (a profile-naming config with neither D nor C) still emits ZERO pairs — no socket dir for a session that gets nothing');
}

// ═══ ⑨ the real binary — SKIPS WITH EVIDENCE ═════════════════════════════
console.log('\n⑨ the installed binary (skips with evidence when absent)');
{
  const { spawnSync } = await import('node:child_process');
  const v = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (v.error || v.status !== 0) {
    skip(`agent-browser not runnable here (${v.error ? v.error.code || v.error.message : 'exit ' + v.status}) — the floor verdict and the four variable NAMES are asserted above against a fake binary; what cannot be checked without it is that this build still accepts these names, and that its own socket-root reader honours AGENT_BROWSER_SOCKET_DIR`);
  } else {
    const out = String(v.stdout || '').trim();
    ok(/\d+\.\d+\.\d+/.test(out), `installed: ${out}`);
    const help = spawnSync('agent-browser', ['--help'], { encoding: 'utf8', timeout: 20000 });
    const h = String(help.stdout || '') + String(help.stderr || '');
    for (const name of ['AGENT_BROWSER_SESSION', 'AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_IDLE_TIMEOUT_MS', 'AGENT_BROWSER_CONFIG', 'AGENT_BROWSER_PROFILE']) {
      ok(h.includes(name), `the installed build documents ${name} (the P0 environment is not aspirational)`);
    }
    // AGENT_BROWSER_SOCKET_DIR is NOT in the top-level `--help` of 0.32.0; the
    // binary names it in its own refusal (asserted below) and honours it in
    // `session info --json` — the evidence is the behaviour, not the help text.
    const verdict = B.floorVerdict(B.parseVersion(out).join('.'));
    console.log(`  · floor verdict on THIS machine: ${verdict.state} (installed ${verdict.installed}, floor ${verdict.floor}, sharedProfiles ${verdict.sharedProfiles})`);
    ok(true, `floor verdict computed against the real binary: ${verdict.state}`);

    // THE SOCKET ROOT, LAUNCH-FREE (r4). `session info --json` prints the root
    // the CLI resolved and launches nothing (measured: `active:false`, no
    // process), and a 39-char HOME with no AGENT_BROWSER_SOCKET_DIR is refused
    // by `tab list` BEFORE anything launches (measured) — so both arms stay
    // inside the fast tier's rule. The launching pair (38 ✓ / 39 ✓ with the
    // variable / bare `default` ✓) is test-browser-resources §ⓘ.
    const uid = process.getuid();
    const H9 = path.join(ROOT, 'home-long-enough-for-the-cli');
    fs.mkdirSync(path.join(H9, '.agent-browser'), { recursive: true });
    fs.writeFileSync(path.join(H9, '.agent-browser', 'config.json'), JSON.stringify({ args: '--no-sandbox', headed: false }));
    const e9 = BE.create({ dataDir: path.join(ROOT, 'data-9'), homeDir: H9, env: {}, socketDirBase: SOCKBASE, log: { warn() { }, log() { } } });
    const K9 = 'bk-09090901';
    const r9 = e9.envFor({ browserKey: K9, integrationOn: true });
    const env9 = { PATH: process.env.PATH, HOME: H9 };
    for (const p of r9.pairs) { const i = p.indexOf('='); env9[p.slice(0, i)] = p.slice(i + 1); }
    const sdir = path.join(SOCKBASE, `vs-ab-${uid}`);
    if (ok(H9.length > 38 && env9.AGENT_BROWSER_SOCKET_DIR === sdir, `setup: a ${H9.length}-char HOME made the resolver emit AGENT_BROWSER_SOCKET_DIR (a mutant must go RED, not crash)`)) {
      const info = spawnSync('agent-browser', ['session', 'info', '--json'], { env: env9, encoding: 'utf8', timeout: 20000 });
      let data = null; try { data = JSON.parse(String(info.stdout || '')).data; } catch { }
      ok(!!data && typeof data.socketDir === 'string' && data.socketDir.startsWith(sdir + '/') && data.active === false,
        `the installed CLI resolves its socket root to OUR directory — session info --json: ${data ? data.socketDir : String(info.stdout || info.stderr || '').slice(0, 80)} (launch-free: active:false)`);
      const env9x = { ...env9 }; delete env9x.AGENT_BROWSER_SOCKET_DIR;
      const tl = spawnSync('agent-browser', ['tab', 'list'], { env: env9x, encoding: 'utf8', timeout: 20000 });
      const tlo = String(tl.stdout || '') + String(tl.stderr || '');
      ok(/is too long/.test(tlo) && /\(max 103\)/.test(tlo), `PRE-FIX CONTROL: the same session WITHOUT the fifth variable is refused at its first command — "${tlo.trim().split('\n')[0].slice(0, 90)}" (round 3's regression on a long home)`);
      ok(/AGENT_BROWSER_SOCKET_DIR/.test(tlo), 'and the CLI\'s own refusal names AGENT_BROWSER_SOCKET_DIR as the remedy — the variable the product now sets');
      let launched = 0;
      for (const d of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(d)) continue;
        try { if (fs.readFileSync(`/proc/${d}/environ`, 'utf8').includes(`AGENT_BROWSER_NAMESPACE=vs-${K9}`)) launched++; } catch { }
      }
      ok(launched === 0, `…and NEITHER arm launched anything (${launched} process(es) carry this namespace) — this stays a fast-tier leg`);
    }
  }
}


// ═══ ⑳ r5: the round-4 verifier's three findings, each reproduced first ════
console.log('\n⑳ r5: the floor notice latches on DELIVERY · the conversation key outlives its webui session · the intro never lies about the rung');
// (a) THE FLOOR NOTICE. The boot probe fires 3 s after the ws handler registers
//     — into an EMPTY client set on a systemd / update.sh restart — and
//     `serverNotice` deliberately burns its key only when a client received it.
//     Round 4's resolver latched BEFORE asking, so the notice was said to nobody
//     for the life of the process (measured end to end in test-browser-
//     continuity: zero frames at Ready+6.3 s while the journal had the line).
{
  const facts032 = () => createBrowserFacts({ execFileImpl: (c, a, o, cb) => cb(null, 'agent-browser 0.32.0', '') });
  const pre = mutantBE([['    floorAnnounced = delivered > 0;', '    floorAnnounced = true;']]);
  if (ok(!pre.err && pre.hits === 1, `PRE-FIX CONTROL is a patched copy with round 4's "latch before delivery" put back (${pre.err || 'hit'})`)) {
    let asked0 = 0;
    const e0 = pre.mod.create({ dataDir: DATA, homeDir: HOME, serverNotice: () => { asked0++; return 0; }, telemetry: null, log: { warn() { }, log() { } }, ...SESSION_ENV, facts: facts032() });
    await e0.checkFloor(); await e0.checkFloor(); await e0.checkFloor();
    ok(asked0 === 1, `PRE-FIX: with a channel reporting 0 delivered, round 4 asks ONCE and never again (${asked0} ask) — the headless-restart shape: told nobody, for ever`);
  }
  let asked = 0, delivered = 0;
  const e = mk({ serverNotice: () => { asked++; return delivered; }, facts: facts032() });
  await e.checkFloor(); await e.checkFloor();
  ok(asked === 2, `FIXED: a channel that reports 0 delivered is asked AGAIN on the next call (${asked} asks)`);
  delivered = 1;
  await e.checkFloor();
  ok(asked === 3, 'the third call asks once more, and this time somebody is there…');
  await e.checkFloor(); await e.checkFloor();
  ok(asked === 3, `…and after a DELIVERY it is latched: no further asks (${asked})`);
  const r = await e.checkFloor({ reprobe: true });
  ok(r.state === 'too-old' && asked === 3, 'a `reprobe` (the 6 h cadence) re-reads the binary without re-sending a delivered notice');
  ok(e.floorState().state === 'too-old', 'the verdict stays readable without a probe');
  let silentAsks = 0;
  const e2 = mk({ serverNotice: () => { silentAsks++; }, facts: facts032() });
  await e2.checkFloor(); await e2.checkFloor();
  ok(silentAsks === 2, 'a channel that reports NOTHING (undefined) is treated as UNDELIVERED and asked again — never "assumed heard" (the loud direction)');
  let okAsks = 0;
  const e3 = mk({ serverNotice: () => { okAsks++; return 0; }, facts: createBrowserFacts({ execFileImpl: (c, a, o, cb) => cb(null, 'agent-browser 0.37.1', '') }) });
  await e3.checkFloor(); await e3.checkFloor();
  ok(okAsks === 0, 'NEGATIVE CONTROL: at the floor nothing is asked and nothing is re-asked (there is nothing to deliver)');
  // The connection-time call must be FREE once latched: it runs on every ws
  // connection, and a fork costs the parent time proportional to its own RSS.
  let probes = 0;
  const e4 = mk({ serverNotice: () => 1, facts: createBrowserFacts({ execFileImpl: (c, a, o, cb) => { probes++; cb(null, 'agent-browser 0.32.0', ''); }, ttlMs: 0 }) });
  await e4.checkFloor(); await e4.checkFloor(); await e4.checkFloor();
  ok(probes === 1, `once latched a call is free — ${probes} probe over three calls with a ZERO TTL (round 4 probed on every call and only then looked at the latch)`);
  // wiring: the channel reports, the hook exists, the handler calls it
  const srvSrc = read('server.js');
  const fnStart = srvSrc.indexOf('function serverNotice(');
  const fn = srvSrc.slice(fnStart, srvSrc.indexOf('\n}\n', fnStart));
  ok(/return delivered;/.test(fn) && /_sentNotices\.get\(key\)/.test(fn), 'server.js `serverNotice` RETURNS the delivery count (and, once burned, the count it reached)');
  const wc = read('src/ws-create.js');
  ok(/const onClientConnected = \(\) => \{ try \{ browserEnvOf\(\)\?\.checkFloor\(\)/.test(wc) && /\}, \{ onClientConnected \}\);/.test(wc), 'ws-create exposes `onClientConnected` on the handler, and it asks checkFloor()');
  ok(/checkFloor\(\{ reprobe: true \}\)[^\n]*6 \* 3600e3/.test(wc), 'and re-probes on the 6 h cadence the other health probes use');
  const wh = read('src/ws-handler.js');
  const cAt = wh.indexOf("wss.on('connection'");
  const conn = wh.slice(cAt, wh.indexOf("ws.on('message'", cAt));
  ok(/handleCreate\.onClientConnected\?\.\(\)/.test(conn), 'ws-handler calls it on EVERY client connection, before the first message');
}
// (b) THE CONVERSATION'S KEY OUTLIVES ITS WEBUI SESSION. `priorKeyFor` read
//     only data/session-meta, and the product's own Terminate → Resume flow
//     UNLINKS that file (ws-handler's kill case, session-stdout's pty-exit
//     path) — so every resume of a stopped conversation minted a new key and
//     orphaned the previous namespace's daemon until the idle timeout.
{
  const BB = require('../src/server/browser-bindings.js');
  const conv = 'c0ffee11-2222-4333-8444-555566667777';
  const meta = { webuiSessionId: 'sess-21-5000', claudeSessionId: conv, browserKey: KEY };
  const metaFile = path.join(DATA, 'session-meta', 'cw-21-5000.json');
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  const e = mk();
  ok(e.priorKeyFor(conv) === KEY, 'setup: while the meta file exists, rung 2 (the meta join) answers');
  const b = BB.create({ dataDir: DATA, log: { warn() { } } });
  ok(BB.conversationIdOf(meta) === conv && BB.conversationIdOf({ backendSessionId: 'th-1' }) === 'th-1' && BB.conversationIdOf({}) === '' && BB.conversationIdOf(null) === '',
    'conversationIdOf = claudeSessionId, else backendSessionId, else nothing — the same rule the meta join files a conversation under');
  ok(b.record(BB.conversationIdOf(meta), meta.browserKey) === true, 'the first record WRITES (this is the call session-stdout.writeSessionMeta makes)');
  ok(b.record(conv, KEY) === false, 'the same binding again writes NOTHING (a session writes its meta dozens of times per turn)');
  ok(b.file === path.join(e.ENV_DIR, 'bindings.json'), `the store lives in the directory browser-env owns (${path.relative(DATA, b.file)})`);
  ok((fs.statSync(b.file).mode & 0o777) === 0o600, 'and it is 0600 like every file beside it');
  fs.unlinkSync(metaFile);
  ok(e.priorKeyFor(conv) === KEY, 'THE FINDING: with the meta file UNLINKED (what the ws kill and the pty-exit path do), priorKeyFor still answers the conversation\'s key');
  ok(B.browserKeyFor({ prior: e.priorKeyFor(conv), resume: true, fork: false, mint: () => 'bk-ffffffff' }).origin === 'conversation', '…so the ladder says `conversation`, not `resume-unknown`');
  ok(B.browserKeyFor({ prior: e.priorKeyFor(conv), resume: true, fork: true, mint: () => 'bk-ffffffff' }).key === 'bk-ffffffff', 'and a FORK still mints (D15) — the binding never leaks a key across a fork');
  const pre = mutantBE([['    const bound = bindings.lookup(String(conversationId));\n    if (bound) return bound;\n', '']]);
  if (ok(!pre.err && pre.hits === 1, `PRE-FIX CONTROL is a patched copy with rung 1 removed (${pre.err || 'hit'})`)) {
    const e0 = pre.mod.create({ dataDir: DATA, homeDir: HOME, serverNotice: null, telemetry: null, log: { warn() { }, log() { } }, ...SESSION_ENV });
    ok(e0.priorKeyFor(conv) === '', 'PRE-FIX: round 4 answers NOTHING for the same conversation once its meta is gone (⇒ resume-unknown ⇒ a new key ⇒ a leaked daemon per resume)');
  }
  ok(b.record(conv, KEY2) === false && b.lookup(conv) === KEY, 'r6: a DIFFERENT key for a bound conversation is REFUSED — the store never moves a binding (round 5 said "newest write wins", and that is exactly how a fork\'s first record moved its parent)');
  const conv2 = 'c0ffee22-3333-4444-8555-666677778888';
  ok(b.record(conv2, KEY2) === true && BB.create({ dataDir: DATA }).lookup(conv2) === KEY2, 'a SECOND instance (browser-env\'s reader) sees what the writer (session-stdout\'s) wrote');
  ok(e.priorKeyFor(conv) === KEY && e.priorKeyFor(conv2) === KEY2, 'priorKeyFor follows the store for both');
  ok(b.record(conv, 'not-a-key') === false && b.lookup(conv) === KEY && b.record('', KEY) === false, 'garbage (a non-key, an empty conversation) is refused, never written');
  const b2 = BB.create({ dataDir: path.join(ROOT, 'bind2'), log: { warn() { } } });
  for (let i = 0; i < BB.MAX_BINDINGS + 5; i++) b2.record(`conv-${i}`, B.mintBrowserKey(String(i)), { at: 1000 + i });
  ok(b2.lookup('conv-0') === '' && b2.lookup(`conv-${BB.MAX_BINDINGS + 4}`) !== '' && b2.keys().size === BB.MAX_BINDINGS, `the store is bounded at ${BB.MAX_BINDINGS} newest conversations (the oldest is pruned)`);
  const sw = e.sweep(new Set(), { graceMs: 0 });
  ok(fs.existsSync(b.file) && b.lookup(conv) === KEY, `the orphan sweep never removes bindings.json (${sw.swept} object(s) swept around it)`);
  // wiring: the ONE meta choke point records; the two deleters still unlink (the reason the store exists)
  const ss = read('src/server/session-stdout.js');
  const wsm = ss.slice(ss.indexOf('function writeSessionMeta('), ss.indexOf('function deleteSessionMeta('));
  ok(/fs\.renameSync\(tmp, fp\);[\s\S]*b\.record\(sid, meta\.browserKey\)/.test(wsm), 'session-stdout.writeSessionMeta records the binding AFTER the meta write');
  ok(/const sid = b\.bindableIdOf\(meta\); if \(sid\) b\.record\(sid, meta\.browserKey\)/.test(wsm) && !/b\.conversationIdOf\(meta\)/.test(wsm), 'r6: through the store\'s own bindableIdOf (the id a record may BIND), never conversationIdOf (the id it NAMES) — the round-5 shape');
  ok(/browserBindings\(\)/.test(wsm) && /require\('\.\/browser-bindings\.js'\)\.create\(\{ dataDir: path\.dirname\(META_DIR\) \}\)/.test(ss), 'lazily, against the same data dir');
  const dAt = ss.indexOf('function deleteSessionMeta(');
  const del = ss.slice(dAt, dAt + 400);
  ok(/fs\.unlinkSync\(path\.join\(META_DIR, sockName \+ '\.json'\)\)/.test(del) && !/bindings/.test(del), 'deleteSessionMeta still unlinks the meta file and touches NO binding (a kill is not the end of the conversation)');
  ok(/if \(session\.sockName\) deleteSessionMeta\(session\.sockName\);/.test(read('src/ws-handler.js')), 'the ws kill path still deletes the meta — so rung 2 alone can never serve a Terminate → Resume, which is why rung 1 exists');
  ok(/const bound = bindings\.lookup\(String\(conversationId\)\);\s*\n\s*if \(bound\) return bound;/.test(beSrc0), 'browser-env.priorKeyFor asks the store FIRST');
}
// (b′) r6 — A RECORD MAY NOT BIND THE CONVERSATION IT WAS FORKED FROM (the
//     round-5 verifier's HIGH, reproduced END TO END in test-browser-continuity
//     §② on the pristine r5 store before a line was changed: `bindings[X]`
//     moved to the fork's key within 800 ms of the fork's create, the parent's
//     next resume spawned with the FORK's AGENT_BROWSER_SESSION, two namespaces
//     for one conversation). A claude fork is created with claudeSessionId =
//     the PARENT's id (`--fork-session` resumes the parent; the fork's own id
//     is announced by the init frame later), a codex fork with the parent's
//     thread id (the wrapper's `thread/fork` reports the new one later); both
//     mint a NEW browser key (D15), so the fork's FIRST meta write carries
//     {<parent id>, <fork key>} and r5's hook — "does the record carry an id
//     and a key" — bound the parent to the fork's browser. TWO LAYERS, each
//     with its own control: ① the RULE at the choke point (`forkSourceId`,
//     written by ws-create's first meta write and spread forward by every
//     later write; `bindableIdOf` answers '' while the record names the very
//     conversation it was forked from) ② the BELT in the store (a bound
//     conversation keeps its key; a move is refused, journalled once per
//     pair, counted).
{
  const BB = require('../src/server/browser-bindings.js');
  const parent = 'f0f0f0f0-1111-4222-8333-444455556666', forkId = 'a1a1a1a1-5555-4666-8777-888899990000';
  const pKey = 'bk-0a0a0a0a', forkKey = 'bk-0b0b0b0b';
  // THE RULE — the id a record may BIND is not the id it NAMES.
  const forkMeta = { webuiSessionId: 'sess-31-7000', claudeSessionId: parent, browserKey: forkKey, forkRequested: true, forkSourceId: parent };
  ok(BB.bindableIdOf(forkMeta) === '' && BB.conversationIdOf(forkMeta) === parent, 'THE RULE: a record that names the conversation it was forked FROM binds NOTHING — while conversationIdOf still NAMES the parent (two questions, two answers)');
  ok(BB.bindableIdOf({ ...forkMeta, claudeSessionId: forkId, backendSessionId: forkId }) === forkId, 'claude: after the init frame adopts the fork\'s OWN id (claudeSessionId re-listed, forkSourceId riding the spread) the record binds the FORK — never the parent');
  ok(BB.bindableIdOf({ backendSessionId: parent, claudeSessionId: null, browserKey: forkKey, forkSourceId: parent }) === '' && BB.bindableIdOf({ backendSessionId: 'th-new', claudeSessionId: null, browserKey: forkKey, forkSourceId: parent }) === 'th-new', 'codex: the parent thread id binds nothing; the thread id the wrapper_meta adopts binds');
  ok(BB.bindableIdOf({ backendSessionId: 'oc-new', forkSourceId: 'oc-parent', browserKey: forkKey }) === 'oc-new', 'opencode: the fork id is minted BEFORE the spawn, so the first record already names it and binds at once (exactly as before)');
  ok(BB.bindableIdOf({ claudeSessionId: parent, browserKey: pKey }) === parent && BB.bindableIdOf({ claudeSessionId: parent, forkSourceId: 'some-other', browserKey: pKey }) === parent, 'a record that makes no fork statement, or names a different source, binds as before — a plain resume is untouched');
  ok(BB.bindableIdOf({ claudeSessionId: parent, forkSourceId: 123 }) === parent && BB.bindableIdOf(null) === '' && BB.bindableIdOf({}) === '', 'garbage in forkSourceId is ignored; no conversation ⇒ nothing (never a fabricated id)');
  // THE BELT — a bound conversation keeps its key.
  const warned = [];
  const b3 = BB.create({ dataDir: path.join(ROOT, 'bind3'), log: { warn(m) { warned.push(String(m)); } } });
  ok(b3.record(parent, pKey) === true && b3.lookup(parent) === pKey, 'setup: the parent conversation is bound to its own key');
  ok(b3.record(parent, forkKey) === false && b3.lookup(parent) === pKey, 'THE BELT: the store REFUSES to move a bound conversation onto a different key — the parent keeps its browser');
  ok(warned.length === 1 && /refused to move the browser binding/.test(warned[0]) && warned[0].includes(pKey) && warned[0].includes(forkKey), `and journals the refusal ONCE, naming both keys (${warned.length} line)`);
  ok(b3.record(parent, forkKey) === false && warned.length === 1 && b3.refusals() === 1, 'the same offer again is silent (one line per pair — a fork writes its meta dozens of times per turn) and counted once');
  ok(b3.record(parent, pKey) === false && warned.length === 1, 'the parent\'s own key is still a silent no-op re-record, not a refusal');
  ok(b3.record('fresh-conv', forkKey) === true && b3.lookup('fresh-conv') === forkKey, 'a NEW conversation still binds (the belt refuses MOVES, not first writes)');
  ok(BB.REFUSAL_METRIC === 'browser-binding-move-refused', 'the refusal has a telemetry name');
  // r7 — A KEY IS BOUND TO THE CONVERSATION IT WAS DECIDED FOR (the round-6
  // verifier's MEDIUM): a RESUME whose harness announces a DIFFERENT id (claude's
  // implicit fork on a locked conversation; a codex/ACP resume that re-mints) is
  // ADOPTED by the consumer, and r6's rule — "is this the conversation you were
  // forked FROM" — bound the announced id to the resumed conversation's key.
  // The origin write now states `browserKeyFor`, the rule refuses any other id,
  // the store refuses to bind a NEW conversation to a key another one holds,
  // and the choke point SAYS it once. The end-to-end shape (real server, fake
  // claude announcing a different session_id) is test-browser-continuity §③.
  const resumed = 'c0c0c0c0-2222-4333-8444-555566667777', announcedId = 'd1d1d1d1-6666-4777-8888-999900001111';
  const rKey = 'bk-0c0c0c0c';
  ok(BB.keyDecidedFor({ browserKeyFor: resumed }) === resumed && BB.keyDecidedFor({}) === '' && BB.keyDecidedFor({ browserKeyFor: 7 }) === '' && BB.keyDecidedFor(null) === '', 'r7: keyDecidedFor reads the origin write\'s statement and nothing else (garbage/absent ⇒ no statement)');
  ok(BB.bindableIdOf({ claudeSessionId: resumed, browserKey: rKey, browserKeyFor: resumed }) === resumed, 'r7 THE RULE: a resume\'s record names the conversation its key was decided for and binds it');
  ok(BB.bindableIdOf({ claudeSessionId: announcedId, browserKey: rKey, browserKeyFor: resumed, forkedFrom: [resumed] }) === '', 'r7 THE FINDING: once the consumer adopts the id the harness announced INSTEAD (the implicit fork), the record names a conversation the key was never decided for and binds NOTHING');
  ok(BB.bindableIdOf({ backendSessionId: 'th-announced', claudeSessionId: null, browserKey: rKey, browserKeyFor: 'th-resumed' }) === '' && BB.bindableIdOf({ backendSessionId: 'th-resumed', claudeSessionId: null, browserKey: rKey, browserKeyFor: 'th-resumed' }) === 'th-resumed', 'r7 codex: a resume whose wrapper_meta re-mints the thread id is the same shape; the resumed thread itself still binds');
  ok(BB.bindableIdOf({ claudeSessionId: announcedId, browserKey: rKey }) === announcedId && BB.bindableIdOf({ claudeSessionId: forkId, browserKey: forkKey, forkSourceId: parent }) === forkId, 'r7: a NEW session and a FORK state no browserKeyFor, so their first announced id binds as before');
  // THE BELT's other half — a key is ONE conversation's.
  ok(b3.record(announcedId, pKey) === false && b3.lookup(announcedId) === '' && b3.lookup(parent) === pKey, 'r7 THE BELT: the store REFUSES to bind a NEW conversation to a key another conversation already holds — the holder keeps it, the newcomer stays unbound');
  ok(warned.length === 2 && /refused to bind conversation/.test(warned[1]) && warned[1].includes(pKey) && warned[1].includes(parent.slice(0, 8)), `and journals it ONCE, naming the key and its holder (${warned.length} lines)`);
  ok(b3.record(announcedId, pKey) === false && warned.length === 2 && b3.refusals() === 2, 'the same offer again is silent; moves and shares share one refusal census (2)');
  ok(b3.record(announcedId, 'bk-0d0d0d0d') === true && b3.lookup(announcedId) === 'bk-0d0d0d0d', 'a refused newcomer still binds its OWN fresh key later (the belt refuses SHARES, not the conversation)');
  ok(BB.SHARE_METRIC === 'browser-binding-share-refused' && BB.IMPLICIT_FORK_METRIC === 'browser-binding-implicit-fork', 'both r7 events have telemetry names');
  // THE CHOKE POINT's journal line for the implicit fork: once per (session, id).
  const unboundMeta = { claudeSessionId: announcedId, browserKey: rKey, browserKeyFor: resumed };
  ok(b3.noteUnbound(unboundMeta, 'cw-9-9') === true && warned.length === 3 && /the harness announced conversation/.test(warned[2]) && warned[2].includes(rKey) && warned[2].includes(resumed.slice(0, 8)) && warned[2].includes('cw-9-9'), 'r7: the choke point SAYS the implicit fork once, naming the session, the key and the conversation it was decided for');
  ok(b3.noteUnbound(unboundMeta, 'cw-9-9') === false && warned.length === 3 && b3.implicitForks() === 1, 'the adopted record\'s dozens of later writes are silent (once per session + id) and counted once');
  ok(b3.noteUnbound(forkMeta, 'cw-9-9') === false && b3.noteUnbound({ claudeSessionId: resumed, browserKey: rKey, browserKeyFor: resumed }, 'cw-9-9') === false && b3.noteUnbound({}, 'cw-9-9') === false && warned.length === 3, 'a fork\'s pre-adoption record, a resume naming its own conversation, and an empty record are NOT announcements');
  // THE CHOKE POINT, mirrored line for line from session-stdout.writeSessionMeta
  // (the source pin above holds the mirror to the shipped text), driven over
  // the REAL module and over three patched copies — one layer off at a time,
  // then both, which is r5's bytes and the incident.
  const choke = (mod, store, meta) => { const sid = mod.bindableIdOf(meta); if (sid) store.record(sid, meta.browserKey); };
  const world = (mod, tag) => { const st = mod.create({ dataDir: path.join(ROOT, 'bind-' + tag), log: { warn() { } } }); st.record(parent, pKey); return st; };
  const real = world(BB, 'real');
  choke(BB, real, forkMeta); choke(BB, real, { ...forkMeta, cwd: '/x' }); choke(BB, real, { ...forkMeta, claudeSessionId: forkId, backendSessionId: forkId });
  ok(real.lookup(parent) === pKey && real.lookup(forkId) === forkKey, 'REAL: the fork\'s pre-adoption writes bind nothing, the adoption write binds the fork, the parent keeps its key');
  // r7 restructured `bindableIdOf` into two clauses; the r6 control removes
  // the fork-source clause only (round 5's answer for the fork shape).
  const RULE_OFF = ["  if (typeof src === 'string' && src && src === sid) return '';\n", ''];
  const BELT_OFF = ["      if (cur && KEY_RE.test(String(cur.key || '')) && cur.key !== key) return refuseMove(sid, cur, key);\n", ''];
  const ruleOff = mutantBB([RULE_OFF]);
  if (ok(!ruleOff.err && ruleOff.hits === 1, `CONTROL ①: a patched copy with the choke-point rule removed (${ruleOff.err || 'hit'})`)) {
    const st = world(ruleOff.mod, 'rule-off');
    ok(ruleOff.mod.bindableIdOf(forkMeta) === parent, 'with the rule off the fork\'s first record offers the PARENT\'s id (round 5\'s answer)…');
    choke(ruleOff.mod, st, forkMeta);
    ok(st.lookup(parent) === pKey && st.refusals() === 1, '…and the BELT ALONE holds the parent\'s binding (refused, counted) — the second layer has its own control');
  }
  const beltOff = mutantBB([BELT_OFF]);
  if (ok(!beltOff.err && beltOff.hits === 1, `CONTROL ②: a patched copy with the store\'s belt removed (${beltOff.err || 'hit'})`)) {
    const st = world(beltOff.mod, 'belt-off');
    ok(st.record(parent, forkKey) === true && st.lookup(parent) === forkKey, 'with the belt off the store is round 5\'s "newest write wins" again (a direct move lands)…');
    const st2 = world(beltOff.mod, 'belt-off-2');
    choke(beltOff.mod, st2, forkMeta);
    ok(st2.lookup(parent) === pKey, '…and the RULE ALONE keeps the fork\'s record from reaching it — the first layer has its own control');
  }
  const both = mutantBB([RULE_OFF, BELT_OFF]);
  if (ok(!both.err && both.hits === 2, `PRE-FIX CONTROL: both layers removed = the r5 store (${both.err || '2 hits'})`)) {
    const st = world(both.mod, 'both-off');
    choke(both.mod, st, forkMeta);
    ok(st.lookup(parent) === forkKey, 'PRE-FIX: the fork\'s first meta write MOVES the parent onto the fork\'s browser key — the incident (two conversations on one browser, the parent\'s own daemon orphaned)');
  }
  // WIRING: the record says which conversation it was forked from, at the ONE
  // origin write, and every other producer spreads the previous record so the
  // statement survives to the adoption write that finally binds the fork.
  const wc = read('src/ws-create.js');
  ok(/forkSourceId: \(data\.fork && \(data\.forkedFromId \|\| data\.resumeId\)\) \? String\(data\.forkedFromId \|\| data\.resumeId\) : undefined,/.test(wc), 'ws-create\'s first meta write states forkSourceId = the id the fork was asked to resume (forkedFromId when the store minted the fork before the spawn, else resumeId), only under data.fork');
  // A census reads CODE: whole-line comments are blanked first (the origin
  // write's own comments spell parentheses and semicolons), and each site is
  // judged on ITS OWN argument text — up to the call's `);` — never on a
  // fixed window that would bleed into the next producer's spread.
  const classifySites = (raw, file) => {
    const src = raw.replace(/^[ \t]*(\/\/|\*).*$/gm, (m) => ' '.repeat(m.length));
    const out = []; let i = 0;
    while ((i = src.indexOf('writeSessionMeta(', i)) !== -1) {
      const ls = src.lastIndexOf('\n', i) + 1, le = src.indexOf('\n', i);
      const line = src.slice(ls, le < 0 ? src.length : le);
      const at = i; i += 'writeSessionMeta('.length;
      if (/function writeSessionMeta\(/.test(line)) continue;
      const end = src.indexOf(');', at);
      const arg = src.slice(at, end < 0 ? at + 6000 : Math.min(end + 2, at + 6000));
      out.push({ file, line: src.slice(0, at).split('\n').length, spreads: /\.\.\./.test(arg), origin: /forkSourceId:/.test(arg) });
    }
    return out;
  };
  // no name-based exclusion: no suite writes a patched copy under src/ any more (test-architecture §51)
  const files = ['server.js', ...fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join('src', f))];
  const sites = files.flatMap((f) => classifySites(read(f), f));
  const nonSpread = sites.filter((x) => !x.spreads);
  console.log(`    meta-writer census: ${sites.length} call sites over ${files.length} files; non-spreading: ${nonSpread.map((x) => x.file + ':' + x.line).join(', ') || 'none'}`);
  ok(sites.length >= 20, `the census walked the real producers (${sites.length} writeSessionMeta call sites)`);
  ok(nonSpread.length === 1 && nonSpread[0].file === 'src/ws-create.js' && nonSpread[0].origin, `exactly ONE producer rebuilds the record from scratch — ws-create\'s origin write, the one that states forkSourceId (${nonSpread.map((x) => x.file + ':' + x.line).join(', ')}); every other writer spreads the previous record, so the statement reaches the adoption write`);
  const synth = "writeSessionMeta(sock, { name: 'x', cwd: '/y' });\nwriteSessionMeta(sock, { ...(readSessionMeta(sock) || {}), name: 'x' });\n// writeSessionMeta(sock, {})\n";
  const cs = classifySites(synth, 'synthetic.js');
  ok(cs.length === 2 && cs[0].spreads === false && cs[1].spreads === true, 'the census can SEE a non-spreading writer and ignores a commented one (its own positive control)');
}
// (c) THE TOOLS INTRO NEVER LIES ABOUT THE RUNG. Round 4 told EVERY session
//     "THIS session already has its own browser … close --all closes only
//     yours" — including a session on the shared browser (isolation off, rung
//     `none`, a resolver that threw), the exact incident P0 exists to stop.
{
  const ar = require('../src/agent-routes.js');
  const T = { status: true, ask: true, task: false, jobs: false };
  const line = (v) => ar.sessionToolsIntro(T, { browserVariant: v }).split('\n').find((l) => l.startsWith('Browsing:')) || '';
  for (const v of B.ISOLATED_VARIANTS) ok(/THIS conversation's own browser/.test(line(v)) && /close --all` closes only yours/.test(line(v)), `rung ${v}: the intro says this conversation has its OWN browser and \`close --all\` is safe`);
  for (const [label, v] of [['none', B.VARIANTS.NONE], ['null (feature off / resolver unavailable)', null], ['undefined (a session that predates the feature)', undefined], ['garbage', 'Z']]) {
    const l = line(v);
    ok(/machine's SHARED browser/.test(l) && /never `close --all`/.test(l) && !/closes only yours/.test(l), `rung ${label}: the intro says the browser is SHARED and \`close --all\` is NOT safe (the manual's own words)`);
  }
  ok(ar.sessionToolsIntro(T) === ar.sessionToolsIntro(T, {}) && /machine's SHARED browser/.test(ar.sessionToolsIntro(T)), 'no facts at all ⇒ the shared sentence (the conservative default: a caller that forgot the session cannot claim isolation)');
  ok(/^Browsing: `vibespace-browser <verb>`/.test(line('none')) && /^Browsing: `vibespace-browser <verb>`/.test(line('D')) && /vibespace-docs browser/.test(line('none')), 'both sentences keep the two anchors leg ⑦ pins (the one tool; the manual pointer)');
  ok(B.isolatedVariant('D') && B.isolatedVariant('C') && B.isolatedVariant('N') && B.isolatedVariant('H') && !B.isolatedVariant('none') && !B.isolatedVariant(null) && !B.isolatedVariant(''), 'isolatedVariant is the ONE table (D/C/N/H yes; none/null/empty no)');
  const arSrc = read('src/agent-routes.js');
  const sites = arSrc.match(/sessionToolsIntro\((?:enabledTools\(\)|toolFlags), \{ browserVariant: s\._browserVariant(?:, browserSet: browserSetFacts\(s\))? \}\)/g) || []; // P1b added the set beside the variant; the pin follows the shipped call shape
  ok(sites.length === 2, `both delivery sites (task-context + prompt-context) hand it \`s._browserVariant\` (${sites.length})`);
  ok(!/sessionToolsIntro\((?:enabledTools\(\)|toolFlags)\)/.test(arSrc), 'and no site calls it without the session\'s facts (the round-4 shape)');
  ok((read('src/server/boot-restore.js').match(/_browserVariant: meta\.browserVariant/g) || []).length === 3, 'the rung is restored with the session at all three boot-restore sites, so a restored session\'s re-delivered intro is about ITS rung');
  ok(!arSrc.includes("L.push(\n    'Browsing: the `agent-browser` CLI works as usual and THIS session already has its own browser"), 'the unconditional round-4 push is gone (the control names the retired bytes)');
}

// ═══ the fast tier claimed no machine-global name ═════════════════════════
console.log('\n⑲ no machine-global name was claimed');
if (prodSockPreExisted) skip(`${PROD_SOCK} already existed before this run, so whether a leg would have created it cannot be told here`);
else ok(!fs.existsSync(PROD_SOCK), `this suite did not create the production per-uid socket dir ${PROD_SOCK} — every resolver it builds gets a scratch base or a short runtime dir`);


// ── ㉒ LANE H (2026-09-25): THE HOLDER ROWS — the ONE representation of "which session holds which browser" ──
// The owner watched an agent's managed ephemeral browser start and saw nothing: it was not a lease ROW, so the
// live view's auto-bind (a NEW row), the recorder's arming and the card never saw it. `holderRows` is what the
// keeper's digest `leases`, the status route's `leases` and every reader get.
console.log('\n㉒ lane H: the holder rows (a live managed ephemeral browser is a lease row, marked)');
{
  const KA = 'bk-0000a0a1', KB = 'bk-0000b0b2';
  const named = { id: 'bp-0000e001', label: 'Work', owner: { kind: 'instance', id: null } };
  const eph = { id: 'bp-0000e002', label: '(ephemeral) fix the bug', ephemeral: true, owner: { kind: 'conversation', id: KA } };
  const kid = { id: 'bp-0000e003', label: '(ephemeral) fix the bug · child 1', ephemeral: true, owner: { kind: 'conversation', id: KA + '.1' } };
  const leases = [
    { profileId: named.id, browserKey: KB, sessionId: 'sess-b', alias: 'work', since: 1 },
    { profileId: eph.id, browserKey: KA, sessionId: 'sess-a', alias: 'ephemeral', since: 2 },
    { profileId: kid.id, browserKey: KA + '.1', sessionId: 'sess-a', alias: 'ephemeral', since: 3 },
    { profileId: 'bp-0000dead', browserKey: KA, sessionId: 'sess-a', since: 4 },
  ];
  const profiles = [named, eph, kid];
  const ready = { [named.id]: { state: 'stopped' }, [eph.id]: { state: 'ready' }, [kid.id]: { state: 'ready' } };
  const rows = B.holderRows({ leases, profiles, browsers: ready });
  const e = rows.find((r) => r.profileId === eph.id), k = rows.find((r) => r.profileId === kid.id), n = rows.find((r) => r.profileId === named.id);
  ok(rows.length === 3 && !!n && !('ephemeral' in n) && n.alias === 'work', '㉒ a NAMED lease is a row as it is (its browser\'s state is not its question) and says nothing about being ephemeral', JSON.stringify(rows));
  ok(e && e.ephemeral === true && e.child === false && e.sessionId === 'sess-a' && e.browserKey === KA && e.label === eph.label && e.alias === 'ephemeral', '㉒ a managed ephemeral browser whose browser is READY is a row: ephemeral:true, its session, its key, its record\'s label', JSON.stringify(e));
  ok(k && k.ephemeral === true && k.child === true, '㉒ a sub-agent\'s ephemeral is a row too, marked child (its pairs are not its session\'s — the live view and the recorder skip it)');
  ok(!rows.some((r) => r.profileId === 'bp-0000dead'), '㉒ a lease naming no known profile is never a row (no dangling holder)');
  for (const st of ['starting', 'stopped', 'failed']) ok(!B.holderRows({ leases, profiles, browsers: { ...ready, [eph.id]: { state: st } } }).some((r) => r.profileId === eph.id), `㉒ an ephemeral whose browser is ${st} holds nothing — no row (it comes back when the next verb makes it ready: the auto-bind's "it started")`);
  ok(!B.holderRows({ leases, profiles, browsers: {} }).some((r) => r.ephemeral) && B.holderRows({ leases, profiles, browsers: {} }).length === 1, '㉒ no browser record at all ⇒ only the named lease');
  const viewed = B.holderRows({ leases, profiles, browsers: ready, view: (l) => ({ ...l, mediated: false }) });
  ok(viewed.every((r) => r.mediated === false) && viewed.find((r) => r.profileId === eph.id).ephemeral === true, '㉒ the keeper\'s view decorates every row and cannot erase the ephemeral mark');
  ok(B.holderRows({}).length === 0 && B.holderRows({ leases: null, profiles: null }).length === 0, '㉒ nothing in ⇒ nothing out (never a throw)');
  // the live view's target rule the ephemeral row opens on: EPHEMERAL_REF names the session's OWN ephemeral browser
  const SS = require('../src/browser-stream.js');
  const pairs = ['AGENT_BROWSER_SESSION=vs-' + KA, 'AGENT_BROWSER_NAMESPACE=vs-' + KA];
  const set = { attachments: [{ profileId: named.id, alias: 'work', label: 'Work', isDefault: true }] };
  const t1 = SS.streamTargetFor({ browserKey: KA, set, profileRef: SS.EPHEMERAL_REF, envPairs: pairs, profiles });
  const t0 = SS.streamTargetFor({ browserKey: KA, set, profileRef: '', envPairs: pairs, profiles });
  ok(t1.ok && t1.kind === 'ephemeral' && t1.ns === 'vs-' + KA && t0.ok && t0.kind === 'attachment', '㉒ EPHEMERAL_REF targets the session\'s own ephemeral browser even beside an attachment (the default pane would be the attachment — the recorder would file its actions under `ephemeral`)', JSON.stringify([t1.kind, t0.kind]));
  ok(!SS.streamTargetFor({ browserKey: KA, set, profileRef: SS.EPHEMERAL_REF, envPairs: [], profiles }).ok && !B.isAlias(SS.EPHEMERAL_REF), '㉒ …no pairs ⇒ no-browser (typed); and no alias can ever spell the ref');
}

// ── ㉑ THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\n㉑ the patched copies never touch the tree');
for (const r of copiesCensus(MUTB.files, MUTB.dir, REPO, { minCopies: 2 })) ok(r.pass, '㉑ ' + r.name + (r.pass ? '' : ' — ' + r.detail));

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
process.exit(fail ? 1 : 0);
