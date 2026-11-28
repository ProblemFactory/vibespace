#!/usr/bin/env node
// `claude -p /usage` panel parser (2.327.0): pinned against a REAL captured
// output (2026-08-11, claude 2.1.x). This is the ⟳ ladder's rung 2 — the only
// no-live-session channel that carries model-scoped weeklies — so format
// drift must fail HERE, not silently degrade every refresh to the token read.
import './scratch.mjs';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { parseCliUsageText } = require('../src/usage-routes.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

const FIXTURE = `You are currently using your subscription to power your Claude Code usage

Current session: 30% used · resets Aug 12, 12:20am (America/Los_Angeles)
Current week (all models): 5% used · resets Aug 13, 2am (America/Los_Angeles)
Current week (Fable): 9% used · resets Aug 13, 2am (America/Los_Angeles)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai.

Last 24h · 3474 requests · 7 sessions
  98% of your usage was at >150k context`;

// nowMs: the capture evening (2026-08-11 ~18:00 PDT = 2026-08-12 01:00 UTC)
const NOW = Date.UTC(2026, 7, 12, 1, 0, 0);
const r = parseCliUsageText(FIXTURE, NOW);
ok(!!r, 'fixture parses');
ok(Math.abs(r.fiveHour.utilization - 0.30) < 1e-9, '5h utilization 30% → 0.30', r.fiveHour);
ok(Math.abs(r.sevenDay.utilization - 0.05) < 1e-9, '7d utilization 5% → 0.05', r.sevenDay);
ok(r.scopedWeekly.length === 1 && r.scopedWeekly[0].name === 'Fable' && Math.abs(r.scopedWeekly[0].utilization - 0.09) < 1e-9,
  'scoped weekly: Fable 9%', r.scopedWeekly);
// Aug 12, 12:20am America/Los_Angeles (PDT, UTC-7) = Aug 12 07:20 UTC
ok(r.fiveHour.resetsAt === Math.floor(Date.UTC(2026, 7, 12, 7, 20) / 1000), '5h resetsAt = Aug 12 07:20 UTC (12:20am PDT)', r.fiveHour.resetsAt);
// Aug 13, 2am PDT = Aug 13 09:00 UTC
ok(r.sevenDay.resetsAt === Math.floor(Date.UTC(2026, 7, 13, 9, 0) / 1000), '7d resetsAt = Aug 13 09:00 UTC (2am PDT)', r.sevenDay.resetsAt);
ok(r.scopedWeekly[0].resetsAt === r.sevenDay.resetsAt, 'scoped weekly shares the 7d deadline (nested-window model)');

// honesty: API-key mode / unrecognized output → null, never a fabricated zero
ok(parseCliUsageText('API key detected — usage tracking is unavailable', NOW) === null, 'non-subscription output → null');
ok(parseCliUsageText('', NOW) === null, 'empty output → null');
// resets clause absent → bucket kept, resetsAt absent (cache-merge keeps old)
const r2 = parseCliUsageText('Current session: 12% used\nCurrent week (all models): 3% used', NOW);
ok(gateOf(r2) && r2.fiveHour.utilization === 0.12 && r2.fiveHour.resetsAt === undefined, 'reset-less lines still parse utilization');
// year rollover: a January reset read in late December belongs to NEXT year
const DEC = Date.UTC(2026, 11, 30, 12, 0);
const r3 = parseCliUsageText('Current session: 1% used · resets Jan 2, 3am (America/Los_Angeles)', DEC);
ok(r3.fiveHour.resetsAt * 1000 > DEC, 'January reset parsed in December lands in the FUTURE (next year)', r3.fiveHour.resetsAt);

// THE TWO ANSWERS WITH NO QUOTA LINE (lane pool-silent-members R3, the owner's probe log 2026-10-28): neither is a parser
// drift (85/85 live-login probes parsed the full panel on the same claude 2.1.312 that day) — the parser gives null, never a
// fabricated zero, and the class names what the CLI said (src/auto-cli-model.js panelAnswerClass)
const { panelAnswerClass } = require('../src/auto-cli-model.js');
const COST = 'Total cost:            $0.0000\nTotal duration (API):  0s\nTotal duration (wall): 1s\nTotal code changes:    0 lines added, 0 lines removed\nUsage:                 0 input, 0 output, 0 cache read, 0 cache write\n';
const HEAD = 'You are currently using your subscription to power your Claude Code usage\n';
ok(parseCliUsageText(COST, NOW) === null && panelAnswerClass({ rawStdout: COST }) === 'no-login', 'R3: the non-subscriber cost summary (an EMPTY folder, the env token stripped) → null, classed no-login — never a zero reading');
ok(parseCliUsageText(HEAD, NOW) === null && panelAnswerClass({ rawStdout: HEAD, folderToken: true }) === 'folder-token' && panelAnswerClass({ rawStdout: HEAD }) === null, 'R3: the bare subscription header (a long-lived token in the folder) → null, classed folder-token; the same header from a live login keeps no class');
ok(!!parseCliUsageText(FIXTURE, NOW) && panelAnswerClass({ rawStdout: FIXTURE, folderToken: true }) === null, 'R3: …a panel WITH its quota lines is never classed (the header above them is the full panel\'s own first line)');

// ── THE MACHINE LOGIN's KEPT READ (主开发 r2575, for 2.369.417): src/usage-routes.js keys its read of ~/.claude/.credentials.json on
// the file's time AND size AND inode, and a kept sign-in past its own life is read again FROM THE FILE — a file read and nothing
// else (no request built, no child started, no timer), once at the expiry and then at the poll's own pace (never a loop on a file
// that stays old). Two writes inside ONE FROZEN tick (both writes' times pinned to one value), by rename and in place, on stand-in
// files with made-up values; each part with its red in a copy (a fresh copy of the module a scene: its kept read is module state).
console.log("§ the machine login's kept read (r2575)");
{
  const fs = require('fs'), path = require('path'), os = require('os');
  const http = require('http'), https = require('https'), cp = require('child_process');
  const REL = 'src/usage-routes.js', SRC = fs.readFileSync(new URL('../src/usage-routes.js', import.meta.url), 'utf8');
  const MJ = mutantCopies('oauth-kept-read-r2575', new URL('..', import.meta.url).pathname);
  // THE COUNT (law 2): every road to a request or a child is replaced by a counter BEFORE any copy loads (a copy that took its
  // functions at load takes these); a counter never performs anything
  const counts = { req: 0, child: 0 };
  const realOf = {};
  for (const [mod, keys, kind] of [[http, ['request', 'get'], 'req'], [https, ['request', 'get'], 'req'], [cp, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], 'child']]) {
    for (const k of keys) { realOf[`${kind}.${k}.${mod === http ? 'http' : mod === https ? 'https' : 'cp'}`] = [mod, k, mod[k]]; mod[k] = function () { counts[kind]++; throw new Error('counted, never performed'); }; }
  }
  const fetch0 = globalThis.fetch; globalThis.fetch = async () => { counts.req++; throw new Error('counted, never performed'); };
  const HOME0 = process.env.HOME, NOW0 = Date.now, rf0 = fs.readFileSync;
  const T = 1900000000000, PINNED = 1800000000;   // a made-up instant; the one file time both writes are pinned to (whole seconds)
  let clock = T; Date.now = () => clock;
  let credReads = 0, credFile = null, throwOnRead = false;
  fs.readFileSync = function (p, ...a) { if (credFile && String(p) === credFile) { credReads++; if (throwOnRead) throw Object.assign(new Error('EACCES: a stand-in'), { code: 'EACCES' }); } return rf0.call(this, p, ...a); };
  const homes = [];
  const rt = ['stand', 'in', 'refresh'].join('-');   // made-up, built at runtime (the secret scan reads a long name or literal after a token field)
  const credsOf = (tok, exp) => JSON.stringify({ claudeAiOauth: { accessToken: tok, refreshToken: rt, expiresAt: exp } });
  const home = (tag) => { const h = fs.mkdtempSync(path.join(os.tmpdir(), `vs-oauth-${tag}-`)); homes.push(h); fs.mkdirSync(path.join(h, '.claude')); process.env.HOME = h; credFile = path.join(h, '.claude', '.credentials.json'); credReads = 0; throwOnRead = false; return credFile; };
  const pin = (f) => fs.utimesSync(f, PINNED, PINNED);   // the frozen tick: the second write keeps the first write's time
  const byRename = (f, body) => { fs.writeFileSync(f + '.swap', body); fs.renameSync(f + '.swap', f); pin(f); };
  const inPlace = (f, body) => { fs.writeFileSync(f, body); pin(f); };
  const fresh = (src, tag) => MJ.load(REL, src, tag, src === SRC ? { same: true } : {}).getOAuthToken;
  const A = 'stand-in-token-A', B = 'stand-in-token-B';   // the same length: the two contents have the same size
  // (a) BY RENAME inside one tick: time and size equal, a NEW inode
  const renameScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    byRename(f, credsOf(A, T + 3600e3)); const first = get();
    const ino1 = fs.statSync(f).ino; byRename(f, credsOf(B, T + 3600e3)); const st = fs.statSync(f);
    return { first, second: get(), sameTime: st.mtimeMs === PINNED * 1000, newInode: st.ino !== ino1 };
  };
  // (b) IN PLACE inside one tick: time, size AND inode equal (the residual) — kept while its life lasts, read again past it
  const placeScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T + 3600e3)); const first = get();
    inPlace(f, credsOf(B, T + 7200e3)); const residual = get();
    clock = T + 3600e3; const pastLife = get();
    return { first, residual, pastLife };
  };
  // (c) THE BOUND: a file that stays old (an expired sign-in nobody refreshes) is read once at the expiry, then at the poll's pace
  const boundScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T - 1));
    const tokens = []; for (let i = 0; i < 50; i++) tokens.push(get());
    const readsAtOnce = credReads;
    clock = T + 300000; get(); const readsAtPace = credReads;
    for (let i = 0; i < 10; i++) get();
    return { readsAtOnce, readsAtPace, readsAfter: credReads, allNull: tokens.every((t) => t === null) };
  };
  // (e) A SIGN-OUT (ALSO CURED): a kept sign-in never outlives the file's sign-out
  const signOutScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T + 3600e3)); const first = get();
    fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0 } }));
    const after = get(); const readsSignedOut = credReads;
    for (let i = 0; i < 20; i++) get();
    return { first, after, readsSignedOut, readsAfter: credReads };
  };
  // (f) THE SIZE in the key: an in-place write of ANOTHER size inside one tick (same time, same inode) is a change
  const sizeScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T + 3600e3)); const first = get();
    inPlace(f, credsOf('stand-in-token-B-longer', T + 3600e3));
    return { first, second: get() };
  };
  // (g) THE PACE when the read again THROWS (a half-written or unreadable file past the kept sign-in's life): one attempt, then paced
  const throwScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T + 3600e3)); get();
    clock = T + 3600e3; throwOnRead = true; const before = credReads;
    for (let i = 0; i < 30; i++) get();
    const attempts = credReads - before; throwOnRead = false;
    return { attempts };
  };
  // (h) macOS: the past-life pass never goes on to the Keychain's child (law 2) — a stand-in Keychain behind a signed-out file
  const darwinScene = (src, tag) => {
    const plat = Object.getOwnPropertyDescriptor(process, 'platform');
    let kc = 0; const prev = cp.execFileSync;
    cp.execFileSync = function () { kc++; return credsOf('stand-in-token-K', T + 3600e3); };   // taken by the copy at its load
    let get; try { get = fresh(src, tag); } finally { cp.execFileSync = prev; }
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    try {
      clock = T; const f = home(tag);
      fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0 } }));
      const first = get(); const again = get(); const kcLive = kc;
      clock = T + 3600e3; const pastLife = get();
      return { first, again, kcLive, pastLife, kcAfter: kc };
    } finally { Object.defineProperty(process, 'platform', plat); }
  };
  // (i) A FILE GONE (Linux): its kept token is not used after it
  const goneScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T + 3600e3)); const first = get();
    fs.rmSync(f); return { first, after: get() };
  };
  // (j) r2700: the file's key CHANGED and the read then FAILS (a torn write, EACCES): the kept sign-in is dropped for that ask, and the
  // key not advanced, so the next ask reads again
  const failScene = (src, tag) => {
    const get = fresh(src, tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T + 3600e3)); const first = get();
    byRename(f, credsOf(B, T + 3600e3)); throwOnRead = true; const failed = get(); throwOnRead = false;
    return { first, failed, next: get() };
  };
  // (k) r2700: emptied (signed out), then DELETED (Linux): the signed-out word the usage meter's warning reads stands — read through a
  // copy whose only edit exports the module's flag (the export line, anchored)
  const EXP = "module.exports = { setupUsage, parseCliUsageText, normalizeCodexRateLimit, PANEL_PROBE_ARGS, spawnPanelProbe, getOAuthToken };";
  const withFlag = (src, tag) => anchored(src, EXP, "module.exports = { setupUsage, parseCliUsageText, normalizeCodexRateLimit, PANEL_PROBE_ARGS, spawnPanelProbe, getOAuthToken, signedOutForLegs: () => _oauthSignedOut };   /* PROBE: the flag read, nothing else */", tag);
  const emptiedGoneScene = (src, tag) => {
    const M = MJ.load(REL, withFlag(src, tag + '-flag'), tag); clock = T; const f = home(tag);
    inPlace(f, credsOf(A, T + 3600e3)); const first = M.getOAuthToken();
    fs.writeFileSync(f, JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0 } }));
    const emptied = M.getOAuthToken(); const outEmptied = M.signedOutForLegs();
    fs.rmSync(f); const gone = M.getOAuthToken();
    return { first, emptied, outEmptied, gone, outGone: M.signedOutForLegs() };
  };
  try {
    const R = renameScene(SRC, 'rename');
    ok(gateOf(R.sameTime) && gateOf(R.newInode) && R.first === A && R.second === B, 'two writes inside ONE tick by RENAME (time and size equal, a new inode): the kept read serves the second content', R);
    const KEY = "const oauthKeyOf = (st) => `${st.mtimeMs}|${st.size}|${st.ino}`;";
    ok(SRC.split(KEY).length === 2, 'control setup: the kept read\'s key is found once');
    const RT = renameScene(anchored(SRC, KEY, "const oauthKeyOf = (st) => `${st.mtimeMs}`;   /* MUTANT: the time alone (the release) */", 'oauth-key-time-alone'), 'rename-timex');
    ok(RT.second === A, 'CONTROL (the time alone, in a copy — the release\'s key): the first content served after the second write (red)', RT);
    const RI = renameScene(anchored(SRC, KEY, "const oauthKeyOf = (st) => `${st.mtimeMs}|${st.size}`;   /* MUTANT: the inode cut */", 'oauth-key-no-inode'), 'rename-inodex');
    ok(RI.second === A, 'CONTROL (the inode cut, in a copy): the renamed second write read as unchanged (red)', RI);
    const P = placeScene(SRC, 'place');
    ok(P.first === A && P.residual === A && P.pastLife === B, 'two writes inside ONE tick IN PLACE (time, size and inode equal — the residual): the first is kept while its life lasts; past it the FILE is read again and the second served', P);
    const LIFE = "(!oauthPastLife(_oauthCreds) || Date.now() - _oauthExpiredReadAt < OAUTH_EXPIRED_REREAD_MS)";
    ok(SRC.split(LIFE).length === 2, 'control setup: the read again past the kept sign-in\'s life is found once');
    const PX = placeScene(anchored(SRC, LIFE, "(true /* MUTANT: never read again past its life */)", 'oauth-no-life-read'), 'place-lifex');
    ok(PX.pastLife === null, 'CONTROL (the read again past its life cut, in a copy): an expired kept sign-in stands while the file holds a live one — the poll keeps the last-known usage (red)', PX);
    const C = boundScene(SRC, 'bound');
    ok(gateOf(C.allNull) && C.readsAtOnce === 1 && C.readsAtPace === 2 && C.readsAfter === 2, 'a file that stays old is read ONCE at the expiry (50 asks: 1 read), then at the poll\'s pace (5 min later: 1 more; 10 asks after: none)', C);
    const CX = boundScene(anchored(SRC, "Date.now() - _oauthExpiredReadAt < OAUTH_EXPIRED_REREAD_MS", "false /* MUTANT: no pace */", 'oauth-no-pace'), 'bound-pacex');
    ok(CX.readsAtOnce >= 50, 'CONTROL (the pace cut, in a copy): the old file read at every ask (red)', CX);
    const E = signOutScene(SRC, 'signout');
    ok(E.first === A && E.after === null && E.readsAfter === E.readsSignedOut, 'ALSO CURED: a sign-out in the file drops the kept sign-in (no token used after it), and an unchanged signed-out file is not read again (20 asks: no read)', E);
    const NUL = "        _oauthCreds = null;   // r2575 (ALSO CURED)";
    ok(SRC.split(NUL).length === 2, 'control setup: the sign-out\'s drop is found once');
    const EX = signOutScene(anchored(SRC, NUL, "        /* MUTANT: the kept sign-in outlives the sign-out */   // r2575 (ALSO CURED)", 'oauth-signout-kept'), 'signout-keptx');
    ok(EX.after === A, 'CONTROL (the drop cut, in a copy): the previous token still used after the sign-out (red)', EX);
    const Z = sizeScene(SRC, 'size');
    ok(Z.first === A && Z.second === 'stand-in-token-B-longer', 'an in-place write of ANOTHER size inside one tick (same time, same inode) is a change: the second content served', Z);
    const ZX = sizeScene(anchored(SRC, KEY, "const oauthKeyOf = (st) => `${st.mtimeMs}|${st.ino}`;   /* MUTANT: the size cut */", 'oauth-key-no-size'), 'size-sizex');
    ok(ZX.second === A, 'CONTROL (the size cut, in a copy): the other-size write read as unchanged (red)', ZX);
    const W = throwScene(SRC, 'throw');
    ok(W.attempts === 1, 'a read again that THROWS past the kept sign-in\'s life is attempted ONCE, then paced (30 asks: 1 attempt)', W);
    const STAMP = "if (kept && _oauthCreds) { _oauthExpiredReadAt = Date.now(); pastLifePass = true; }";
    ok(SRC.split(STAMP).length === 2, 'control setup: the past-life pass\'s stamp is found once');
    const WX = throwScene(anchored(SRC, STAMP, "if (kept && _oauthCreds) { pastLifePass = true; }   /* MUTANT: the stamp cut */", 'oauth-no-stamp'), 'throw-stampx');
    ok(WX.attempts >= 30, 'CONTROL (the stamp cut, in a copy): a throwing file attempted at every ask (red)', WX);
    const M = darwinScene(SRC, 'darwin');
    ok(M.first === 'stand-in-token-K' && M.again === 'stand-in-token-K' && M.kcLive === 1 && M.pastLife === null && M.kcAfter === 1, 'macOS: the Keychain read once for a signed-out file; the past-life pass starts NO child (the expired token stands, the usage keeps its last-known)', M);
    const KC = "    if (process.platform === 'darwin' && !pastLifePass) {";
    ok(SRC.split(KC).length === 2, 'control setup: the Keychain branch\'s guard is found once');
    const MX = darwinScene(anchored(SRC, KC, "    if (process.platform === 'darwin') {   /* MUTANT: the past-life pass reaches the Keychain */", 'oauth-keychain-pastlife'), 'darwin-kcx');
    ok(MX.kcAfter === 2, 'CONTROL (the guard cut, in a copy): the past-life pass starts the Keychain\'s child (red)', MX);
    const G = goneScene(SRC, 'gone');
    ok(G.first === A && G.after === null, 'a sign-in file GONE (Linux): its kept token is not used after it', G);
    const GONE = "    } else if (process.platform !== 'darwin') { _oauthCreds = null; _oauthKey = null; }";
    ok(SRC.split(GONE).length === 2, 'control setup: the gone file\'s drop is found once');
    const GX = goneScene(anchored(SRC, GONE, "    } else if (false) { /* MUTANT: a gone file keeps its token */ }", 'oauth-gone-kept'), 'gone-keptx');
    ok(GX.after === A, 'CONTROL (the drop cut, in a copy): the deleted file\'s token still used (red)', GX);
    const F = failScene(SRC, 'fail');
    ok(F.first === A && F.failed === null && F.next === B, 'r2700: the file\'s key CHANGED and its read FAILS — that ask serves NO token (never the previous sign-in); the next ask reads again and serves the new one', F);
    const DROP = "catch (e) { if (!kept) _oauthCreds = null; throw e; }";
    ok(SRC.split(DROP).length === 2, 'control setup: the failed read\'s drop is found once');
    const FX = failScene(anchored(SRC, DROP, "catch (e) { /* MUTANT: the previous sign-in kept */ throw e; }", 'oauth-fail-kept'), 'fail-keptx');
    ok(FX.failed === A, 'CONTROL (the drop cut, in a copy): the previous sign-in served after the file changed (red)', FX);
    const EG = emptiedGoneScene(SRC, 'emptied-gone');
    ok(EG.first === A && EG.emptied === null && EG.outEmptied === true && EG.gone === null && EG.outGone === true, 'r2700: a file emptied (signed out) and then DELETED — no token, and the signed-out word the usage meter\'s warning reads stays TRUE', EG);
    const EGX = emptiedGoneScene(anchored(SRC, GONE, "    } else if (process.platform !== 'darwin') { _oauthCreds = null; _oauthKey = null; _oauthSignedOut = false; }   /* MUTANT: 3108d3e37's gone branch */", 'oauth-gone-flips'), 'emptied-gonex');
    ok(EGX.outEmptied === true && EGX.outGone === false, 'CONTROL (3108d3e37\'s gone branch, in a copy): the deletion flips the signed-out word back to false (red)', EGX);
    // (d) LAW 2: the read again is a FILE READ AND NOTHING ELSE — every scene above, the tree's and the copies', built no request and
    // started no child; the counter is live (a deliberate call is counted)
    const seen = { ...counts };
    let live = 0; try { https.get('https://example.invalid/'); } catch { live = counts.req - seen.req; }
    ok(seen.req === 0 && seen.child === 0 && live === 1, 'the read again builds NO request and starts NO child (counted over every scene); the counter counts a deliberate call', { seen, live });
    const r0 = counts.req;
    placeScene(anchored(SRC, STAMP, "if (kept && _oauthCreds) { _oauthExpiredReadAt = Date.now(); pastLifePass = true; try { require('https').get('https://example.invalid/'); } catch { } }   /* MUTANT: a request on the past-life pass */", 'oauth-pastlife-request'), 'place-requestx');
    ok(counts.req - r0 === 1, 'CONTROL (a request on the past-life pass, in a copy): the count sees it (red)', { requests: counts.req - r0 });
  } finally {
    Date.now = NOW0; fs.readFileSync = rf0; globalThis.fetch = fetch0;
    if (HOME0 === undefined) delete process.env.HOME; else process.env.HOME = HOME0;
    for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { } }
    for (const [mod, k, f] of Object.values(realOf)) mod[k] = f;
  }
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { gateOf } from './lib/check.mjs';
