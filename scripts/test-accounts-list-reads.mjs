// THE ACCOUNTS LIST READS NO FILE ON THE LOOP (row B-360d, lane chrome-157; 主开发 r1201 / r1217 / r1221 / r1231).
// A stand-in of 12 Claude accounts and a pool over them, in a throwaway data dir. The FILE DOOR's stand-in keeps SafeFs's contract
// (stat / readText / realpath, a timeout by name) and HOLDS EACH ASK a PLACED stall (never load); the synchronous road (what the
// release's list did on the loop) is stalled the same, placed in the fs calls themselves under the stand-in dir. THE LAW is judged
// by COUNTS (asks on the loop), which no stall moves; the stall here is 2 ms (the fast tier's sum is full). THE NUMBER at 60 ms an
// ask (主开发 r1201) was measured on the test machine with this suite at 3c00329ba, both zones: the release's rows 25 asks a list,
// the loop held 1508 ms; the cure 0 asks, a list call ≤ 0.7 ms, the loop's longest gap 2.7 ms.
//   ① RED: the release's per-row reads (the decision road still in the tree: _readAuthFor + loginStateOf per row, the pool's
//      current / members / login state) — its synchronous asks a list and the loop's hold
//   ② the cure: list() — 0 synchronous asks, the loop's longest hold, door asks a list call; the bounded re-read of an old row
//   ③ a start: every row «not read yet» (never «signed out»), ONE broadcast when the reads land
//   ④ a writer sets the facts in its own step: a sign-in, then the very next list (no wait) shows it; a switch, at once
//   ⑤ THE DECISION ROAD: unknown decides nothing; confirmed within its bound; a person's act reads now; a dead share by name
//   ⑥ the census: each reader of a row's sign-in fields is a row of one kind (DISPLAY / TURN / PERSON / TIMER), pinned in its file
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-acctreads-'));
const HOME = path.join(ROOT, 'home'), DATA = path.join(ROOT, 'data');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
process.env.HOME = HOME;   // the store's machine-login reads (~/.claude…) are the stand-in's
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const { probeEligibility, SIGNIN_UNKNOWN } = require(path.join(REPO, 'src/auto-cli-model.js'));
const { rowServes } = require(path.join(REPO, 'src/resume-account.js'));
const KEEPER = require(path.join(REPO, 'src/account-display-facts.js'));

let pass = 0, fail = 0;
const ck = (n, c, why = '') => { if (typeof n !== 'string' || !n) throw new TypeError(`ck(name, cond): the name is a ${typeof n} — swapped arguments`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (why ? '  — ' + why : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STALL_MS = 2;   // placed; the number at 60 ms: the header

// ── the synchronous road's placed stall + its count (only paths under the stand-in's data dir) ─────────────────────────────
const SYNC = ['openSync', 'readFileSync', 'statSync', 'lstatSync', 'readlinkSync', 'realpathSync', 'existsSync', 'readdirSync', 'accessSync'];
const syncAsks = { n: 0, stall: false, by: new Map() };
const sab = new Int32Array(new SharedArrayBuffer(4));
const under = (p) => typeof p === 'string' && p.startsWith(DATA);
const ORIG = {};
for (const name of SYNC) {
  const orig = fs[name]; ORIG[name] = orig;
  const wrapped = function (p, ...rest) {
    if (under(p)) { syncAsks.n++; syncAsks.by.set(name, (syncAsks.by.get(name) || 0) + 1); if (syncAsks.stall) Atomics.wait(sab, 0, 0, STALL_MS); }
    return orig.call(this, p, ...rest);
  };
  if (orig.native) wrapped.native = orig.native;
  fs[name] = wrapped;
}
const countSync = (fn) => { const n0 = syncAsks.n; const t = process.hrtime.bigint(); const out = fn(); return { asks: syncAsks.n - n0, ms: Number(process.hrtime.bigint() - t) / 1e6, out }; };

// ── the FILE DOOR's stand-in: SafeFs's contract, each ask held STALL_MS (a placed stall); `dead` = every ask ends at its deadline ──
const door = { asks: 0, byOp: new Map(), dead: false, holdMs: STALL_MS, deadUnder: new Set(), slowUnder: new Map(), instant: false, inFlight: 0, maxInFlight: 0, textBy: new Map(), watch: null, watchIn: 0, watchMax: 0 };
const under2 = (p, set) => [...set].some((d) => p === d || p.startsWith(d + path.sep));
// `instant`: the answer is taken AT THE CALL (a worker that runs before the caller's next synchronous write), then held
const snapOf = (op, p) => { try { if (op === 'stat') { const st = ORIG.statSync(p); return { ok: true, v: { isFile: st.isFile(), isDirectory: st.isDirectory(), size: st.size, mtimeMs: st.mtimeMs } }; } if (op === 'readText') { const content = ORIG.readFileSync(p, 'utf-8'); return { ok: true, v: { content, size: Buffer.byteLength(content) } }; } if (op === 'realpath') return { ok: true, v: { path: ORIG.realpathSync(p) } }; } catch (e) { return { ok: false, e }; } return null; };
door.call = async (op, payload = {}, opts = {}) => {
  door.asks++; door.byOp.set(op, (door.byOp.get(op) || 0) + 1);
  const p = payload.path;
  if (op === 'readText') door.textBy.set(p, (door.textBy.get(p) || 0) + 1);
  const snap = door.instant ? snapOf(op, p) : null;
  door.inFlight++; door.maxInFlight = Math.max(door.maxInFlight, door.inFlight);
  const watched = !!(door.watch && p && p.startsWith(door.watch)); if (watched) { door.watchIn++; door.watchMax = Math.max(door.watchMax, door.watchIn); }
  try {
    const slow = [...door.slowUnder].find(([d]) => p === d || p.startsWith(d + path.sep));
    await sleep(door.holdMs + (slow ? slow[1] : 0));
    if (door.dead || under2(p, door.deadUnder)) throw Object.assign(new Error(`safe-fs: ${op} timed out after ${opts.timeoutMs || 0} ms`), { safeFsTimeout: true, code: 'ETIMEDOUT' });
    if (snap) { if (!snap.ok) throw snap.e; return snap.v; }
    if (op === 'stat') { const st = await fs.promises.stat(p); return { isFile: st.isFile(), isDirectory: st.isDirectory(), size: st.size, mtimeMs: st.mtimeMs }; }
    if (op === 'readText') { const content = await fs.promises.readFile(p, 'utf-8'); return { content, size: Buffer.byteLength(content) }; }
    if (op === 'realpath') return { path: await fs.promises.realpath(p) };
    throw Object.assign(new Error('unknown op ' + op), { code: 'EINVAL' });
  } finally { door.inFlight--; if (watched) door.watchIn--; }
};
const doorCount = () => ({ asks: door.asks, stat: door.byOp.get('stat') || 0, readText: door.byOp.get('readText') || 0, realpath: door.byOp.get('realpath') || 0 });

// ── the stand-in: 12 accounts (each its folder: .credentials.json + .claude.json) and a pool over them ───────────────────────
const ACCESS = ['stand', 'in', 'access'].join('-'), REFRESH = ['stand', 'in', 'refresh'].join('-');   // never a token shape, never a literal
const emailOf = (i) => `user${i}@example.test`;
function signIn(am, id, i) {
  const dir = am.subDir(id);
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: ACCESS + '-' + i, refreshToken: REFRESH + '-' + i, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 864e5, scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' } }), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: emailOf(i), organizationName: 'Org ' + i } }));
}
let broadcasts = 0;
const am0 = new AccountManager({ dataDir: DATA, safeFs: door, onChange: () => { broadcasts++; } });
if (!am0.poolSupported()) { console.log('SKIP — pooled accounts are unsupported on ' + process.platform); process.exit(0); }
const IDS = [];
for (let i = 0; i < 12; i++) { const { id } = am0.createSubscription({ name: 'Acct ' + i }); signIn(am0, id, i); IDS.push(id); }
for (const id of IDS) am0.displayRefresh(id);   // THE ONE SEAM: this suite wrote the sign-in files itself → ask again, then the settled wait
const { id: POOL } = am0.createPool({ name: 'Pool', members: IDS.slice(0, 6) });
await am0.displaySettled();

console.log(`\nthe stand-in: 12 accounts + a pool over 6 of them · each file ask held ${STALL_MS} ms (placed) · node ${process.version}`);

// ── ① RED: the release's per-row reads, on the loop ───────────────────────────────────────────────────────────────────
console.log('\n① RED — the release\'s list read each row\'s sign-in files ON THE LOOP (its per-row reads, still the decision road\'s):');
syncAsks.by.clear();
const releaseRows = (am) => am._state.accounts.map((a) => {
  if (a.type === 'pooled') return { id: a.id, current: am.poolCurrent(a.id), members: am.poolMembers(a.id).length, login: am.poolLoginState(a.id) };
  return { id: a.id, auth: am._readAuthFor('claude', a.id), login: am.loginStateOf(a.id) };
});
syncAsks.stall = true;
const red = countSync(() => releaseRows(am0));
syncAsks.stall = false;
console.log(`    the release's rows: ${red.asks} synchronous asks a list (${[...syncAsks.by].map(([k, v]) => `${k} ${v}`).join(', ')}) · the loop held ${red.ms.toFixed(0)} ms`);
ck(`RED: the release's rows ask the files on the loop (${red.asks} asks ≥ 24: two a signed-in account)`, red.asks >= 24);
ck(`RED: and hold the loop for them (${red.ms.toFixed(0)} ms ≥ ${Math.round(red.asks * STALL_MS * 0.9)} ms)`, red.ms >= red.asks * STALL_MS * 0.9);

// ── ② the cure ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n② the cure — list() answers from the KEPT facts:');
syncAsks.stall = true;
const d0 = doorCount(); let worst = 0, asks = 0, rows = null; const callMs = [];
const holdGaps = []; let last = process.hrtime.bigint();
const ticker = setInterval(() => { const n = process.hrtime.bigint(); holdGaps.push(Number(n - last) / 1e6); last = n; }, 2);
for (let k = 0; k < 20; k++) { const r = countSync(() => am0.list()); asks += r.asks; worst = Math.max(worst, r.ms); callMs.push(r.ms); rows = r.out.accounts; await sleep(1); }
const medMs = [...callMs].sort((x, y) => x - y)[10];
clearInterval(ticker);
syncAsks.stall = false;
const d1 = doorCount();
const loopWorst = Math.max(...holdGaps.slice(1));
console.log(`    20 list calls: ${asks} synchronous asks · a call's median ${medMs.toFixed(1)} ms, longest ${worst.toFixed(1)} ms · the loop's longest gap ${loopWorst.toFixed(1)} ms · door asks ${d1.asks - d0.asks} (fresh rows: none asked)`);
ck('the cure asks NO file on the loop (0 synchronous asks in 20 list calls)', asks === 0, `${asks}`);
ck(`a list call's hold is a tenth of the release's list at most (median ${medMs.toFixed(2)} ms vs ${red.ms.toFixed(0)} ms; the machine's own stalls can lengthen one call, never add an ask)`, medMs * 10 < red.ms);
ck('fresh kept rows ask the door nothing', d1.asks === d0.asks);
const row0 = rows.find((x) => x.id === IDS[0]), prow = rows.find((x) => x.id === POOL);
ck('a read row: facts {state: read, at}, signed in, its email', row0.facts && row0.facts.state === 'read' && row0.loggedIn === true && row0.email === emailOf(0));
ck('the pool row: its current member by the kept link, that member\'s email', IDS.includes(prow.current) && prow.email === emailOf(IDS.indexOf(prow.current)) && prow.facts.state === 'read');
// the bounded re-read of an old row: a store whose stated age is short; the list never waits, the door confirms by stamp
const amAge = new AccountManager({ dataDir: DATA, safeFs: door, displayMaxAgeMs: 15 });
await amAge.displaySettled(); await sleep(25);
const a0 = doorCount();
syncAsks.stall = true; const ra = countSync(() => amAge.list()); syncAsks.stall = false;
await amAge.displaySettled();
const a1 = doorCount();
console.log(`    an old row's bounded re-read: the list ${ra.ms.toFixed(1)} ms, ${ra.asks} synchronous asks; behind it ${a1.stat - a0.stat} stats, ${a1.readText - a0.readText} text reads (the stamps unchanged: CONFIRMED)`);
ck('a list over old rows never waits for the re-read and asks nothing on the loop', ra.asks === 0);
ck('the re-read behind it CONFIRMS by stamp: stats only, no text read', a1.stat - a0.stat >= 24 && a1.readText === a0.readText);
console.log(`    THE COUNT (this stand-in): a list call = 0 file asks on the loop; behind the shown rows at most one confirmation a folder per stated age (60 s on the hub: ≤ ${13 * 2} stats a minute through the door, off the loop), whatever the list cadence`);

// ── ③ a start ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n③ a start — every row «not read yet» until its read lands:');
let sb = 0, lastRows = null;
const amStart = new AccountManager({ dataDir: DATA, safeFs: door, onChange: (l) => { sb++; lastRows = l.accounts; } });
const first = amStart.list().accounts;
const subRows = first.filter((x) => x.type === 'subscription' || x.pooled);
ck('at a start every sign-in row is «not read yet» (facts unread)', subRows.length === 13 && subRows.every((x) => x.facts && x.facts.state === 'unread'));
ck('…and never «signed out»: loggedIn null, no email, no expiry claim', subRows.every((x) => x.loggedIn === null && !x.email && (!x.loginState || x.loginState.state === 'unknown' || x.loginState.facts === 'unread')));
await amStart.displaySettled(); await sleep(120);
ck(`the 13 landings ride few broadcasts, never one a folder (${sb}; coalesced over 100 ms)`, sb >= 1 && sb < 13, `${sb}`);
ck('the broadcast brings the facts: every row read, signed in', !!lastRows && lastRows.filter((x) => x.type === 'subscription').every((x) => x.facts.state === 'read' && x.loggedIn === true));

// ── ④ the writers ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n④ a writer sets the facts in its own step:');
const { id: NEW } = am0.createSubscription({ name: 'New' });
const nrow = am0.rowOf(NEW);
ck('a folder the store just made: read at once — «not signed in», never «not read yet»', nrow.facts.state === 'read' && nrow.loggedIn === false);
signIn(am0, NEW, 99);
am0.finalizeSubscription(NEW);
const after = am0.list().accounts.find((x) => x.id === NEW);   // the very next list, no wait
ck('a sign-in: the very next list (no wait) shows the person signed in, with the email', after.loggedIn === true && after.email === emailOf(99) && after.facts.state === 'read');
const was = am0.rowOf(POOL).current, to = IDS.slice(0, 6).find((x) => x !== was);
am0.setPoolTarget(POOL, to);
const sw = am0.rowOf(POOL);
ck('a switch: the next list shows the new member — never the old identity', sw.current === to && sw.email === emailOf(IDS.indexOf(to)));
const keptBefore = am0._display.size();
am0.remove(NEW);
ck('a removal forgets the folder\'s kept facts (the keeper no longer holds it)', am0._display.get(am0._acctDir('claude', NEW)).state === 'unread' && am0._display.size() === keptBefore - 1, JSON.stringify({ before: keptBefore, after: am0._display.size() }));

// ── ⑤ the decision road ──────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n⑤ the decision road (unknown decides nothing):');
const amD = new AccountManager({ dataDir: DATA, safeFs: door });
const un = amD.signinFacts(IDS[1]);
ck('not read yet: the accessor answers unknown (why not-read-yet)', un.state === 'unknown' && un.why === 'not-read-yet');
ck('…the decision row says so, and probeEligibility decides nothing (SIGNIN_UNKNOWN, no probe)', probeEligibility(amD.decisionRowOf(IDS[1])) === SIGNIN_UNKNOWN);
ck('…the decision login state is null (no notice, no retraction)', amD.decisionLoginStateOf(IDS[1]) === null);
const settled = await amD.signinFactsSettled([IDS[1]]);
ck('signinFactsSettled confirms off the loop, then the facts are read', settled.facts.get(IDS[1]).state === 'read' && settled.facts.get(IDS[1]).auth.email === emailOf(1));
ck('a confirmed row decides: probeable', probeEligibility(amD.decisionRowOf(IDS[1], { since: settled.since })) === 'probeable');
await sleep(20);
ck('past its bound the same facts decide nothing (withinMs 10 → unknown)', amD.signinFacts(IDS[1], { withinMs: 10 }).state === 'unknown');
// a sign-in changed UNDER the hub (a terminal), no writer of ours: the display keeps its kept facts; a person's act reads now
const cfg = path.join(amD.subDir(IDS[2]), '.claude.json');
await amD.signinFactsSettled([IDS[2]]);
fs.writeFileSync(cfg, JSON.stringify({ oauthAccount: { emailAddress: 'someone-else@example.test' } }));
fs.utimesSync(cfg, new Date(), new Date(Date.now() + 2000));
ck('the display (within its age) still shows the kept email', amD.rowOf(IDS[2]).email === emailOf(2));
const now2 = await amD.signinFactsSettled([IDS[2]], { withinMs: 0 });
ck('a person\'s act (withinMs 0) reads NOW: the changed stamp re-reads, the new email decides', amD.decisionRowOf(IDS[2], { since: now2.since }).email === 'someone-else@example.test');
ck('…and the display has it too (the landing broadcast)', amD.rowOf(IDS[2]).email === 'someone-else@example.test');
// a create, its write and a person's ask in ONE synchronous run (often one millisecond): the read the ask waits for STARTED after
// it — the keeper's strictly increasing stamp (2b73a4fb8's gate: the ⟳ decided «not logged in» off the create's own confirmation)
{ const { id: SAME } = amD.createSubscription({ name: 'Same ms' }); signIn(amD, SAME, 77);
  const sm = await amD.signinFactsSettled([SAME], { withinMs: 0 }), f = sm.facts.get(SAME);
  ck('a create, its write and a person\'s ask in one run: the ask reads AFTER the write (signed in, its email)', f.state === 'read' && f.auth.loggedIn === true && f.auth.email === emailOf(77), JSON.stringify(f && { state: f.state, auth: f.auth })); }
// a dead share: every ask ends at its deadline — by name, never a blank «signed out»
door.dead = true;
const dead = await amD.signinFactsSettled([IDS[3]], { withinMs: 0 });
door.dead = false;
const dr = amD.rowOf(IDS[3]);
ck('a dead share: the accessor says unreadable with its reason (timeout)', dead.facts.get(IDS[3]).state === 'unknown' && dead.facts.get(IDS[3]).why === 'unreadable' && dead.facts.get(IDS[3]).reason === 'timeout');
ck('…the row: facts unreadable (reason timeout), loggedIn null — never «signed out»', dr.facts.state === 'unreadable' && dr.facts.reason === 'timeout' && dr.loggedIn === null);
ck('…its probe decides nothing (SIGNIN_UNKNOWN)', probeEligibility(dr) === SIGNIN_UNKNOWN);
ck('…a resume makes no claim on it (unjudged)', !!rowServes(dr, {}).unjudged && rowServes(dr, {}).ok === true);
// no secret is kept: the kept texts carry the marker, never the stand-in's value
const kd = amD._display.get(amD._acctDir('claude', IDS[1]));
const keptText = kd.rd.readText(path.join(amD.subDir(IDS[1]), '.credentials.json'));
ck('no secret is kept: the kept text holds the marker, not the value', keptText.includes(KEEPER.KEPT) && !keptText.includes(ACCESS));
ck('…and the kept answer carries no token field', !Object.keys(kd.auth || {}).some((k) => /token$/i.test(k)));

// ── ⑦ round wldn7whag: the keeper's cures ───────────────────────────────────────────────────────────────────────────
console.log('\n⑦ round wldn7whag — the keeper:');
{
  // (a) a create, its confirming read's snapshot (the door answers AT THE CALL: a worker that ran before the write), the write and
  // a person's ask: the ask reads AFTER the write; RED control: a keeper whose clock cannot order two events in one tick (a
  // constant: the millisecond race made certain) reuses the create's own confirmation — «not signed in»
  const sameMs = async (Mgr) => {
    const am = new Mgr({ dataDir: fs.mkdtempSync(path.join(ROOT, 'same-')), safeFs: door });
    door.instant = true;
    const { id } = am.createSubscription({ name: 'Same' });
    await new Promise((r) => setImmediate(r));   // the create's read takes its snapshot (before the write)
    signIn(am, id, 55);
    const f = (await am.signinFactsSettled([id], { withinMs: 0 })).facts.get(id);
    door.instant = false; await am.displaySettled();
    return f;
  };
  const f = await sameMs(AccountManager);
  ck('(a) a create, its write and a person\'s ask in one run (the door answers at the call): the ask reads AFTER the write', f.state === 'read' && f.auth.loggedIn === true, JSON.stringify(f && f.auth));
  const M = mutantCopies('acctreads', REPO);
  const kPath = M.write('src/account-display-facts.js', anchored(fs.readFileSync(path.join(REPO, 'src/account-display-facts.js'), 'utf8'), 'const clock = () => { const t = now(); lastTick = t > lastTick ? t : lastTick + 0.001; return lastTick; };', 'const clock = () => 1;', 'a clock that cannot order'), 'flat-clock');
  const MUT = M.load('src/accounts.js', anchored(fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8'), "const DISPLAY = require('./account-display-facts.js');", `const DISPLAY = require(${JSON.stringify(kPath)});`, 'the keeper copy'), 'plain-clock');
  const fr = await sameMs(MUT.AccountManager);
  ck('(a) RED control: a clock that cannot order two events answers «not signed in» (the create\'s own confirmation taken as «after»)', fr.state !== 'read' || fr.auth.loggedIn === false, JSON.stringify(fr && fr.auth));

  // (b) a seed is never overwritten by an older read: a read in flight that began BEFORE the sign-in lands after its seed
  const amB = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ROOT, 'seed-')), safeFs: door });
  await amB.displaySettled();
  const { id: SB } = amB.createSubscription({ name: 'Seeded' }); await amB.displaySettled();
  door.instant = true; door.slowUnder.set(amB.subDir(SB), 40);
  amB.displayRefresh(SB);                      // the older read …
  await new Promise((r) => setImmediate(r));   // … takes its first snapshot now — before the sign-in
  door.instant = false;
  signIn(amB, SB, 66); amB.finalizeSubscription(SB);   // the writer's seed
  await amB.displaySettled(); door.slowUnder.clear();
  const rb = amB.rowOf(SB);
  ck('(b) a read that began before the sign-in lands after its seed: the row keeps the sign-in (signed in, its email)', rb.loggedIn === true && rb.email === emailOf(66), JSON.stringify({ loggedIn: rb.loggedIn, email: rb.email }));

  // (c) a seed during a read error that is not «absent» states nothing as a fact: the folder is unreadable by name
  const credsB = path.join(amB.subDir(SB), '.credentials.json');
  let rc = null;
  try { fs.chmodSync(credsB, 0o000); amB._displaySeed(amB.get(SB)); rc = amB.rowOf(SB); }
  finally { fs.chmodSync(credsB, 0o600); }
  if (process.getuid && process.getuid() === 0) console.log('    · (c) SKIP — root reads a 000 file');
  else ck('(c) a seed whose read failed (EACCES, not «absent»): «could not be read (EACCES)», never «not signed in»', rc.facts.state === 'unreadable' && rc.facts.reason === 'EACCES' && rc.loggedIn === null, JSON.stringify(rc && rc.facts));
  await amB.displayRefresh(SB);

  // (d) a CLI rewriting its own settings file is no change a row shows: no push; an identity change is one
  let pushes = 0;
  const amD2 = new AccountManager({ dataDir: DATA, safeFs: door, onChange: () => { pushes++; } });
  await amD2.displaySettled(); await sleep(120); pushes = 0;
  const cfg0 = path.join(amD2.subDir(IDS[4]), '.claude.json');
  fs.writeFileSync(cfg0, JSON.stringify({ oauthAccount: { emailAddress: emailOf(4), organizationName: 'Org 4' }, numStartups: 99, projects: { '/x': { allowedTools: [] } } }));
  fs.utimesSync(cfg0, new Date(), new Date(Date.now() + 3000));
  await amD2.displayRefresh(IDS[4]); await sleep(120);
  ck(`(d) the CLI rewrote its settings file (the identity unchanged): no push (${pushes})`, pushes === 0, String(pushes));
  fs.writeFileSync(cfg0, JSON.stringify({ oauthAccount: { emailAddress: 'moved@example.test', organizationName: 'Org 4' } }));
  fs.utimesSync(cfg0, new Date(), new Date(Date.now() + 6000));
  await amD2.displayRefresh(IDS[4]); await sleep(120);
  ck(`(d) …the identity changed: one push (${pushes})`, pushes === 1, String(pushes));
  fs.writeFileSync(cfg0, JSON.stringify({ oauthAccount: { emailAddress: emailOf(4), organizationName: 'Org 4' } }));
  fs.utimesSync(cfg0, new Date(), new Date(Date.now() + 9000));
  await amD2.displayRefresh(IDS[4]);

  // (e) what is kept: the login file's own shape only; the settings file no text; Antigravity's sign-in file never read
  const amE = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ROOT, 'keep-')), safeFs: door });
  const { id: SE } = amE.createSubscription({ name: 'Kept' });
  const OTHER = ['other', 'service', 'value'].join('-');
  fs.writeFileSync(path.join(amE.subDir(SE), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: ACCESS, refreshToken: REFRESH, expiresAt: Date.now() + 36e5, scopes: ['user:inference'] }, mcpOAuth: { server: { accessToken: OTHER } } }));
  fs.writeFileSync(path.join(amE.subDir(SE), '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'kept@example.test' }, mcpServers: { s: { headers: { Authorization: 'Bearer ' + OTHER } } } }));
  await amE.displayRefresh(SE);
  const ke = amE._display.get(amE._acctDir('claude', SE));
  const kt = ke.rd.readText(path.join(amE.subDir(SE), '.credentials.json'));
  let cfgKept = true; try { ke.rd.readText(path.join(amE.subDir(SE), '.claude.json')); } catch { cfgKept = false; }
  ck('(e) the login file keeps only its own shape (claudeAiOauth, scrubbed) — no other service\'s credential', kt.includes('claudeAiOauth') && !kt.includes('mcpOAuth') && !kt.includes(OTHER) && !kt.includes(ACCESS), kt.slice(0, 200));
  ck('(e) the settings file keeps NO text (its identity was read at landing; its other secrets never stay)', cfgKept === false && amE.rowOf(SE).email === 'kept@example.test');
  const { id: AG, dir: AGD } = amE.createHomeSubscription('antigravity', { name: 'Agy' });
  const agFile = amE._credsOf('antigravity').displayFiles(AGD)[0].path;
  fs.mkdirSync(path.dirname(agFile), { recursive: true }); fs.writeFileSync(agFile, 'x'.repeat(64));
  const t0 = door.textBy.get(agFile) || 0;
  await amE.displayRefresh(AG);
  ck('(e) Antigravity\'s sign-in file: its stat alone (never read — as at the release), the row signed in', (door.textBy.get(agFile) || 0) === t0 && amE.rowOf(AG).loggedIn === true, JSON.stringify({ reads: (door.textBy.get(agFile) || 0) - t0, loggedIn: amE.rowOf(AG).loggedIn }));

  // (f) a person's act waits for what it needs, bounded: a slow folder answers «unknown» at the bound
  const amF = new AccountManager({ dataDir: DATA, safeFs: door });
  await amF.displaySettled();
  door.slowUnder.set(amF.subDir(IDS[5]), 400);
  const tf = Date.now(); const bf = await amF.signinFactsSettled([IDS[5], IDS[6]], { withinMs: 0, boundMs: 40 }); const waited = Date.now() - tf;
  await amF.displaySettled();
  // the CONTROL measured in this run: the same slow folder asked with no bound (the wait the bound cuts)
  const tu = Date.now(); await amF.signinFactsSettled([IDS[5]], { withinMs: 0 }); const unbounded = Date.now() - tu;
  door.slowUnder.clear();
  ck(`(f) a bounded ask with one slow folder: back at the bound (${waited} ms, under half the unbounded wait of ${unbounded} ms), the slow one «unknown», the other read`, waited * 2 < unbounded && bf.facts.get(IDS[5]).state === 'unknown' && bf.facts.get(IDS[6]).state === 'read', JSON.stringify({ waited, unbounded, slow: bf.facts.get(IDS[5]).state, other: bf.facts.get(IDS[6]).state }));

  // (g) the door is never flooded: a start reads at most two folders at a time (its OWN data dir, watched by path: every store
  // has its own keeper, and another store's background re-read is not this start's)
  const GD = fs.mkdtempSync(path.join(ROOT, 'flood-'));
  const amGb = new AccountManager({ dataDir: GD, safeFs: door });
  for (let i = 0; i < 13; i++) { const { id } = amGb.createSubscription({ name: 'G' + i }); signIn(amGb, id, 200 + i); }
  await amGb.displaySettled();
  door.watch = GD; door.watchIn = 0; door.watchMax = 0;
  const amG = new AccountManager({ dataDir: GD, safeFs: door });
  await amG.displaySettled();
  door.watch = null;
  ck(`(g) a start of 13 folders: at most 2 of the door's calls in flight (${door.watchMax}) — a deadline counts from the send`, door.watchMax <= 2 && door.watchMax >= 1, String(door.watchMax));

  // (h) the store's own door (none handed) is ended at close
  const amH = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ROOT, 'own-')) });
  amH.createSubscription({ name: 'Own' }); await amH.displaySettled();
  const own = amH._ownDoor;
  amH.close();
  ck('(h) a store built with no door made its own (one worker) and ENDS it at close', !!own && own._closed === true && amH._ownDoor === null);
}

// ── ⑧ the cures' behaviour: the fold, the backfill, the undecided link, the tick ─────────────────────────────────────
console.log('\n⑧ the cures\' behaviour (round wldn7whag):');
{
  const routes = require(path.join(REPO, 'src/server/account-usage-routes.js'));
  const mkApp = () => { const h = { get: new Map(), post: new Map() }; const add = (m) => (p, ...f) => h[m].set(p, f[f.length - 1]); return { h, app: { get: add('get'), post: add('post'), put() { }, delete() { }, patch() { }, use() { }, locals: {} } }; };
  const call = (fn, req = {}) => { let code = 200, body = null; const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; } }; const p = fn({ params: {}, query: {}, body: {}, headers: {}, ...req }, res); return Promise.resolve(p).then(() => ({ code, body })); };
  const wire = (am, hosts = null) => { const { app, h } = mkApp(); routes.create({ app, rootDir: REPO, HOST: '127.0.0.1', CLAUDE_CMD: 'claude', NODE_CMD: 'node', CLAUDE_SUBSCRIPTION_LOGIN_HELPER: '/nonexistent/helper.js', activeSessions: new Map(), auth: { enabled: false }, engine: { clearSealedOrders: () => { } }, serverSetting: () => null, recordUsageAttribution: () => { }, liveAccountIdSet: () => new Set(), buildClaudeSubscriptionLoginCommand: () => 'claude auth login', getAccounts: () => am, getHosts: () => hosts, getMounts: () => null, getTelemetry: () => null, getUsageHistory: () => null, getLoginExpiryWatch: () => null }); return h; };
  const quiet = async (fn) => { const o = console.log, w = console.warn; console.log = () => { }; console.warn = () => { }; try { return await fn(); } finally { console.log = o; console.warn = w; } };
  // (a) THE FOLD: a readable same-account row is folded into; an unreadable one is never folded into, and the answer SAYS it
  const amR = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ROOT, 'fold-')), safeFs: door, platform: 'linux' });
  const { id: OLD } = amR.createSubscription({ name: 'Old' }); signIn(amR, OLD, 71); amR.finalizeSubscription(OLD);
  const { id: OLD2 } = amR.createSubscription({ name: 'Old Two' }); signIn(amR, OLD2, 72); amR.finalizeSubscription(OLD2);
  const hR = wire(amR);
  const { id: N1 } = amR.createSubscription({ name: 'New' }); signIn(amR, N1, 71);
  const r1 = await quiet(() => call(hR.post.get('/api/accounts/subscription/:id/finalize'), { params: { id: N1 } }));
  ck('(a) the fold: a fresh sign-in whose email a READABLE row holds is folded into it', r1.body && r1.body.merged === true && r1.body.account && r1.body.account.id === OLD, JSON.stringify(r1.body && { merged: r1.body.merged, account: r1.body.account && r1.body.account.id }));
  door.deadUnder.add(amR.subDir(OLD2));
  const { id: N2 } = amR.createSubscription({ name: 'New Two' }); signIn(amR, N2, 72);
  const r2 = await quiet(() => call(hR.post.get('/api/accounts/subscription/:id/finalize'), { params: { id: N2 } }));
  door.deadUnder.clear();
  ck('(a) …a row whose sign-in could not be read is NEVER folded into, and the answer names it (foldUnjudged)', r2.body && !r2.body.merged && Array.isArray(r2.body.foldUnjudged) && r2.body.foldUnjudged.some((x) => x.id === OLD2) && !!amR.get(N2), JSON.stringify(r2.body && { merged: r2.body.merged, foldUnjudged: r2.body.foldUnjudged }));
  // (b) THE BACKFILL: a host's address fills a row's missing email only when that row's sign-in was read now
  const amS = new AccountManager({ dataDir: fs.mkdtempSync(path.join(ROOT, 'host-')), safeFs: door, platform: 'linux' });
  const { id: HU } = amS.createSubscription({ name: 'Host Unread' }); fs.writeFileSync(path.join(amS.subDir(HU), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: ACCESS, refreshToken: REFRESH, expiresAt: Date.now() + 36e5 } }));
  const { id: HR } = amS.createSubscription({ name: 'Host Read' }); fs.writeFileSync(path.join(amS.subDir(HR), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: ACCESS, refreshToken: REFRESH, expiresAt: Date.now() + 36e5 } }));
  await amS.displayRefresh(HU); await amS.displayRefresh(HR);
  const hostSt = { get: () => ({ transport: 'ssh', name: 'h' }), accountsStatus: async () => ({ platform: 'linux', hostSubs: [HU, HR], hostSubEmails: { [HU]: 'hu@example.test', [HR]: 'hr@example.test' } }), renameHostSubDir: async () => false };
  const hS = wire(amS, hostSt);
  door.deadUnder.add(amS.subDir(HU));
  const r3 = await quiet(() => call(hS.get.get('/api/hosts/:id/accounts-status'), { params: { id: 'h1' } }));
  door.deadUnder.clear();
  ck('(b) the backfill: the row read now takes the host\'s address; the row that could not be read takes NOTHING (and is named)', amS.get(HR).email === 'hr@example.test' && !amS.get(HU).email && Array.isArray(r3.body && r3.body.foldUnjudged) && r3.body.foldUnjudged.some((x) => x.id === HU), JSON.stringify({ HR: amS.get(HR).email, HU: amS.get(HU).email || null, unjudged: r3.body && r3.body.foldUnjudged }));
  // (c) THE UNDECIDED LINK, both harnesses: a kept link counts only while its address is the machine login's present one
  const { setupUsage } = require(path.join(REPO, 'src/usage-routes.js'));
  const LD = fs.mkdtempSync(path.join(ROOT, 'link-'));
  const amL = new AccountManager({ dataDir: path.join(LD, 'data'), safeFs: door, platform: 'linux' });
  const LA = amL.createSubscription({ name: 'Link A' }).id; signIn(amL, LA, 81);
  const LB = amL.createSubscription({ name: 'Link B' }).id; signIn(amL, LB, 82);
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const cxSign = (id, email) => fs.writeFileSync(path.join(amL.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: ACCESS, id_token: `${b64u({ alg: 'none' })}.${b64u({ email, 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } })}.sig` } }));
  const CA = amL.createCodexSubscription({ name: 'Cx A' }).id; cxSign(CA, 'ca@example.test');
  const CB = amL.createCodexSubscription({ name: 'Cx B' }).id; cxSign(CB, 'cb@example.test');
  for (const id of [LA, LB, CA, CB]) amL.displayRefresh(id);
  await amL.displaySettled();
  let mClaude = emailOf(81), mCodex = 'ca@example.test';
  amL.subscriptionStatus = () => ({ loggedIn: true, email: mClaude });
  amL.codexGlobalStatus = () => ({ loggedIn: true, email: mCodex });
  const uroutes = {};
  const cacheL = path.join(LD, 'data', 'usage-cache'); fs.mkdirSync(cacheL, { recursive: true });
  await quiet(async () => setupUsage({ app: { get: (p, h) => { uroutes['GET ' + p] = h; }, post: (p, h) => { uroutes['POST ' + p] = h; }, put() { }, delete() { }, use() { }, locals: {} }, accounts: amL, hosts: null, usageHistory: null, activeSessions: new Map(), serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: path.join(LD, 'data', 'usage-cache.json'), USAGE_CACHE_DIR: cacheL, CODEX_SESSIONS_DIR: path.join(LD, 'codex-sessions'), META_DIR: path.join(LD, 'data', 'session-meta'), AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(LD, 'data', 'session-buffers'), probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: '/nonexistent/claude' }));
  const usageNow = () => quiet(() => new Promise((resolve) => uroutes['GET /api/usage']({ headers: {}, query: {} }, { json: resolve, status() { return this; } })));
  await amL.signinFactsSettled();
  let u = await usageNow();
  ck('(c) decided: the machine logins link the named rows (claude A, codex A)', u.globalLogin.accountId === LA && u.codexGlobalLogin.accountId === CA, JSON.stringify({ c: u.globalLogin.accountId, x: u.codexGlobalLogin.accountId }));
  door.deadUnder.add(amL.subDir(LB)); door.deadUnder.add(amL.codexSubDir(CB));
  await amL.signinFactsSettled([LB, CB], { withinMs: 0 });
  mClaude = 'someone-new@example.test'; mCodex = 'cx-new@example.test';
  u = await usageNow();
  ck('(c) a machine login signed in as ANOTHER identity while a row cannot be read: undecided — the old link is NOT kept (both harnesses)', u.globalLogin.accountId === null && u.codexGlobalLogin.accountId === null, JSON.stringify({ c: u.globalLogin, x: u.codexGlobalLogin }));
  mClaude = emailOf(81); mCodex = 'ca@example.test';
  u = await usageNow();
  ck('(c) the same address again (a row still unreadable): the match among the rows read decides — A again', u.globalLogin.accountId === LA && u.codexGlobalLogin.accountId === CA, JSON.stringify({ c: u.globalLogin.accountId, x: u.codexGlobalLogin.accountId }));
  door.deadUnder.clear();
  // (c) …AN UNDECIDED PASS MERGES NOTHING, by behaviour (主开发 r1574 (3)): a KEPT link (its address the machine login's present one)
  // on a pass that cannot decide writes NO other account's cache file on either harness; the same files on a DECIDED pass are
  // merged (the leg's control — the merge is there to be seen)
  {
    const usageWrite = require(path.join(REPO, 'src/usage-cache-write.js'));
    const { normalizeCodexRateLimit } = require(path.join(REPO, 'src/usage-routes.js'));
    const MD = fs.mkdtempSync(path.join(ROOT, 'merge-'));
    const amM = new AccountManager({ dataDir: path.join(MD, 'data'), safeFs: door, platform: 'linux' });
    const MA = amM.createSubscription({ name: 'Merge A' }).id; signIn(amM, MA, 91);
    const MB = amM.createSubscription({ name: 'Merge B' }).id; signIn(amM, MB, 92);
    const cxOn = (id, email) => fs.writeFileSync(path.join(amM.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: ACCESS, id_token: `${b64u({ alg: 'none' })}.${b64u({ email, 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } })}.sig` } }));
    const XA = amM.createCodexSubscription({ name: 'Merge Cx A' }).id; cxOn(XA, 'xa@example.test');
    const XB = amM.createCodexSubscription({ name: 'Merge Cx B' }).id; cxOn(XB, 'xb@example.test');
    for (const id of [MA, MB, XA, XB]) amM.displayRefresh(id);
    await amM.displaySettled();
    amM.subscriptionStatus = () => ({ loggedIn: true, email: emailOf(91) });
    amM.codexGlobalStatus = () => ({ loggedIn: true, email: 'xa@example.test' });
    const cacheM = path.join(MD, 'data', 'usage-cache'); fs.mkdirSync(cacheM, { recursive: true });
    const machineFile = path.join(MD, 'data', 'usage-cache.json');
    // THE MACHINE LOGIN's FILE IS THE STORE WRITER's DERIVED COPY (src/usage-routes.js writeUsageCache: marked dirty, written LATER on the
    // writer's own thread; memory is authoritative): every judge of it reads it only after the writer's OWN LANDING of what it owes
    // (afterLanding, bounded — a store owing nothing answers at once), so «merged» is never read before the write and «merges nothing»
    // is never passed by a write still owed. The named copies below share this writer (their requires reach the real modules).
    const SW = require(path.join(REPO, 'src/store-writer.js')).storeWriter();
    const landed = () => SW.afterLanding(machineFile, () => true, { timeoutMs: 5000 });
    // codex: the machine login's reading is NEWER than A's own — a merge writes it onto A's file
    const tA = Date.now() - 60000, tG = Date.now() - 1000, rs = Math.floor(Date.now() / 1000) + 3600;
    const cxSnap = (pct, at) => normalizeCodexRateLimit({ limit_id: 'codex', primary: { used_percent: pct, window_minutes: 300, resets_at: rs }, secondary: { used_percent: pct, window_minutes: 10080, resets_at: rs + 86400 } }, at);
    const wA = usageWrite.writeCacheObject({ cacheDir: cacheM, key: XA, obj: cxSnap(11, tA), source: 'codex-rate-limits', backend: 'codex' });
    const wG = usageWrite.writeCacheObject({ cacheDir: cacheM, key: '__global_codex__', obj: cxSnap(22, tG), source: 'codex-rate-limits', backend: 'codex' });
    const atOf = (f) => { try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return Number((o && o.claude ? o.claude : o).fetchedAt) || 0; } catch { return 0; } };
    const xaAt = () => atOf(usageWrite.cacheFileFor(cacheM, XA));
    const mkUsage = async (setup = setupUsage, at = { dir: cacheM, file: machineFile }) => {   // setup: the real road, or a named copy's (the mutants below); at: its folder
      const r = {}, out = {};
      await quiet(async () => setup({ app: { get: (p, h) => { r['GET ' + p] = h; }, post: (p, h) => { r['POST ' + p] = h; }, put() { }, delete() { }, use() { }, locals: {} }, accounts: amM, hosts: null, usageHistory: null, activeSessions: new Map(), serverSetting: () => undefined, ensureDir: (d) => fs.mkdirSync(d, { recursive: true }), USAGE_CACHE_FILE: at.file, USAGE_CACHE_DIR: at.dir, CODEX_SESSIONS_DIR: path.join(MD, 'codex-sessions'), META_DIR: path.join(MD, 'data', 'session-meta'), AVAILABLE_MODELS: [], BUFFERS_DIR: path.join(MD, 'data', 'session-buffers'), probeUsageForAccountKey: async () => false, onMemberReadingFresh: () => ({}), CLAUDE_CMD: '/nonexistent/claude', repairIdentityAnchors: (why, o = {}) => { out.repairSince = o.since; return { counts: { restamped: 0 }, ms: 0, identities: [] }; } }));
      return { usage: () => quiet(() => new Promise((resolve) => r['GET /api/usage']({ headers: {}, query: {} }, { json: resolve, status() { return this; } }))), r, get repairSince() { return out.repairSince; } };
    };
    const X = await mkUsage();   // its first pass (at setup) DECIDES: A on both harnesses
    await amM.signinFactsSettled();
    door.deadUnder.add(amM.subDir(MA)); door.deadUnder.add(amM.codexSubDir(XA));
    await amM.signinFactsSettled([MA, XA], { withinMs: 0 });
    const aAt = Date.now() - 500;   // claude: A's own reading, newer than any the machine login holds — a merge writes it onto the machine login's file
    fs.writeFileSync(usageWrite.cacheFileFor(cacheM, MA), JSON.stringify({ fetchedAt: aAt, five_hour: { utilization: 33, resets_at: new Date(Date.now() + 36e5).toISOString() } }));
    let um = await X.usage();
    await landed();
    ck('(c) an UNDECIDED pass on a KEPT link (A, its address the machine login\'s present one, A\'s sign-in unreadable) merges NOTHING: claude — the machine login\'s file takes no reading of A; codex — A\'s file takes no reading of the machine login',
      um.globalLogin.accountId === MA && um.codexGlobalLogin.accountId === XA && atOf(machineFile) !== aAt && xaAt() === tA && wA.ok && wG.ok,
      JSON.stringify({ links: [um.globalLogin.accountId === MA, um.codexGlobalLogin.accountId === XA], machine: atOf(machineFile) === aAt ? 'A WRITTEN' : 'not A', xa: xaAt() === tA ? 'own' : xaAt(), seeds: [wA.ok, wG.ok, wA.why, wG.why] }));
    door.deadUnder.clear();
    await amM.signinFactsSettled([MA, XA], { withinMs: 0 });
    um = await X.usage();   // claude has no memo: the same instance decides and merges
    const Y = await mkUsage();   // codex's summary is a 30 s memo: a second instance's first pass, decided
    um = await Y.usage();
    await landed();
    ck('(c) …the control: the SAME files on a DECIDED pass are merged (claude: A\'s newer reading onto the machine login\'s file; codex: the machine login\'s newer reading onto A\'s file)',
      atOf(machineFile) === aAt && xaAt() === tG, JSON.stringify({ machine: atOf(machineFile) === aAt, xa: xaAt() === tG ? 'merged' : xaAt() }));
    // (e) THE MANUAL IDENTITY REPAIR (主开发 r1574 (1)) is a person's press: it reads the sign-in facts NOW within the person's bound,
    // its reads at the head of the keeper's queue (signinFactsNow — the bound itself is ⑦(f)'s), and hands that read's `since` to
    // the repair; never the timer's unbounded settle
    const seen = { now: [], settled: 0 };
    amM.signinFactsNow = async (ids) => { seen.now.push(ids); return { since: 4242, facts: new Map() }; };
    amM.signinFactsSettled = async () => { seen.settled++; return { since: 1, facts: new Map() }; };
    const pressed = await new Promise((resolve) => X.r['POST /api/usage/repair-identity']({ headers: {}, body: {} }, { json: (b) => resolve(b), status() { return this; } }));
    delete amM.signinFactsSettled; delete amM.signinFactsNow;
    ck('(e) the manual identity repair is a person\'s press: ONE bounded read-now (signinFactsNow) whose `since` the repair is handed, no timer settle', pressed && pressed.success === true && seen.now.length === 1 && seen.settled === 0 && X.repairSince === 4242, JSON.stringify({ pressed: pressed && pressed.success, seen, since: X.repairSince }));
    // NAMED COPIES (round wge361035's smalls, 主开发 r2297): each drops ONE named piece of usage-routes.js
    const M8 = mutantCopies('acctgates', REPO);
    const usrc = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
    // (f) THE PRESS NAMES WHAT IT COULD NOT COMPARE: the folders not read inside the person's bound (or unreadable) are listed in
    // its reply by id, name and why; a folder read is not. RED: the copy whose reply drops the list
    const noteFacts = new Map([[MA, { state: 'unknown', why: 'not-read-yet' }], [MB, { state: 'read', auth: {}, at: 1 }], [XA, { state: 'unknown', why: 'unreadable' }]]);
    const pressOf = async (inst) => { amM.signinFactsNow = async () => ({ since: 4343, facts: noteFacts }); try { return await new Promise((resolve) => inst.r['POST /api/usage/repair-identity']({ headers: {}, body: {} }, { json: (b) => resolve(b), status() { return this; } })); } finally { delete amM.signinFactsNow; } };
    const judgeF = (b) => !!(b && b.success === true && Array.isArray(b.notCompared) && b.notCompared.length === 2 && b.notCompared.some((x) => x.id === MA && x.name === 'Merge A' && x.why === 'not-read-yet')
      && b.notCompared.some((x) => x.id === XA && x.name === 'Merge Cx A' && x.why === 'unreadable') && !b.notCompared.some((x) => x.id === MB));
    const fCure = await pressOf(X);
    const noList = M8.load('src/usage-routes.js', anchored(usrc, 'ms: rep.ms, notCompared, identities:', 'ms: rep.ms, identities:', 'the reply\'s list'), 'no-not-compared');
    const fRed = await pressOf(await mkUsage(noList.setupUsage));
    ck('(f) the press NAMES the folders it could not compare inside its bound (Merge A: not read yet; Merge Cx A: unreadable), never a folder it read', judgeF(fCure), JSON.stringify(fCure && fCure.notCompared));
    ck('(f) RED CONTROL — the copy whose reply drops the list: the judge reads it red', !judgeF(fRed) && !!(fRed && fRed.success === true), JSON.stringify(fRed && fRed.notCompared));
    // (c) NAMED MUTANTS of the two «undecided merges nothing» gates: the leg's own scene rebuilt (the seeds, a first pass that
    // DECIDES and keeps the links, A's sign-in made unreadable, A's newer reading, the undecided pass); each copy drops ONE gate and
    // that harness merges — the same judge reads each red
    let sceneN = 0;
    const undecidedPass = async (setup) => {
      await landed();   // a write owed by the pass before lands first
      door.deadUnder.clear(); await amM.signinFactsSettled([MA, XA], { withinMs: 0 });
      // THE SCENE ON A FOLDER OF ITS OWN: the usage folder has ONE reader (src/usage-cache-folder.js) and every instance this suite made
      // hears that folder's refreshes — the earlier instances, holding A's merged reading in memory, would write it into this scene's reset
      // files. A hub has ONE instance; so each rebuilt scene runs on a cache folder and a machine file no earlier instance reads.
      const dirS = path.join(MD, 'data', `usage-cache-scene-${++sceneN}`), fileS = path.join(MD, 'data', `usage-cache-scene-${sceneN}.json`);
      fs.mkdirSync(dirS, { recursive: true });
      const seeds = [usageWrite.writeCacheObject({ cacheDir: dirS, key: XA, obj: cxSnap(11, tA), source: 'codex-rate-limits', backend: 'codex' }), usageWrite.writeCacheObject({ cacheDir: dirS, key: '__global_codex__', obj: cxSnap(22, tG), source: 'codex-rate-limits', backend: 'codex' })];
      const inst = await mkUsage(setup, { dir: dirS, file: fileS });   // its first pass DECIDES: A on both harnesses
      door.deadUnder.add(amM.subDir(MA)); door.deadUnder.add(amM.codexSubDir(XA));
      await amM.signinFactsSettled([MA, XA], { withinMs: 0 });
      fs.writeFileSync(usageWrite.cacheFileFor(dirS, MA), JSON.stringify({ fetchedAt: aAt, five_hour: { utilization: 33, resets_at: new Date(Date.now() + 36e5).toISOString() } }));
      const u = await inst.usage();
      await SW.afterLanding(fileS, () => true, { timeoutMs: 5000 });   // the scene's own machine file, after the writer's landing
      door.deadUnder.clear();
      return { seeded: seeds.every((w) => w.ok), claudeLinked: u.globalLogin.accountId === MA, codexLinked: u.codexGlobalLogin.accountId === XA, machineA: atOf(fileS) === aAt, xaOwn: atOf(usageWrite.cacheFileFor(dirS, XA)) === tA };
    };
    const judgeU = (p) => p.seeded && p.claudeLinked && p.codexLinked && !p.machineA && p.xaOwn;
    const uCure = await undecidedPass(setupUsage);
    const noClaudeGate = M8.load('src/usage-routes.js', anchored(usrc, 'const gid = linkUndecided ? null : _usageGlobalLink.accountId;', 'const gid = _usageGlobalLink.accountId;', 'the claude road\'s gate'), 'no-claude-gate');
    const noCodexGate = M8.load('src/usage-routes.js', anchored(usrc, 'const gid = _codexLinkUndecided ? null : _codexUsageGlobalLink.accountId;', 'const gid = _codexUsageGlobalLink.accountId;', 'the codex road\'s gate'), 'no-codex-gate');
    const uClaude = await undecidedPass(noClaudeGate.setupUsage), uCodex = await undecidedPass(noCodexGate.setupUsage);
    ck('(c) the undecided pass rebuilt from its scene (the judge the named mutants meet) merges nothing on either harness', judgeU(uCure), JSON.stringify(uCure));
    ck('(c) NAMED MUTANT — the claude road\'s gate dropped (`gid = _usageGlobalLink.accountId`): the undecided pass writes A\'s reading onto the machine login\'s file — red', !judgeU(uClaude) && uClaude.machineA && uClaude.xaOwn, JSON.stringify(uClaude));
    ck('(c) NAMED MUTANT — the codex road\'s gate dropped (`gid = _codexUsageGlobalLink.accountId`): the undecided pass writes the machine login\'s reading onto A\'s file — red', !judgeU(uCodex) && !uCodex.xaOwn && !uCodex.machineA, JSON.stringify(uCodex));
  }
  // (d) THE TICK: one at a time; a sign-in not read is never probed; a door refusal «sign-in-unknown» gives the attempt back
  const { createAutoCliLoop } = require(path.join(REPO, 'src/server/auto-cli-loop.js'));
  const NOW = Date.now();
  const rowRead = { id: 'sub-tick-1', type: 'subscription', backend: 'claude', pooled: false, loggedIn: true, loginState: { state: 'ok' }, facts: { state: 'read' } };
  const rowUnread = { id: 'sub-tick-2', type: 'subscription', backend: 'claude', pooled: false, loggedIn: null, loginState: { state: 'unknown' }, facts: { state: 'unread' } };
  const mkLoop = ({ rows, gate = null, verdictCode = null }) => {
    const st = { probes: [], settles: 0 };
    const dir = fs.mkdtempSync(path.join(ROOT, 'tick-'));
    st.loop = createAutoCliLoop({
      serverSetting: (k) => (k === 'accounts.onDemandQuotaRefresh' ? 'auto-cli' : undefined),
      accounts: { decisionList: () => ({ accounts: rows }), signinFactsSettled: async () => { st.settles++; if (gate) await gate; return { since: 0, facts: new Map() }; } },
      autoCliReady: () => true, USAGE_CACHE_DIR: dir, usageIdentityGroupsCached: () => [], usageEstimator: { estimateFor: () => null },
      projectionRereadFor: () => null, projectionBillingIndex: () => null, lastMemberReadAt: () => 0,
      usage: { refreshViaCliPanel: async (k) => { st.probes.push(k); return false; }, panelVerdictFor: () => (verdictCode ? { at: NOW, code: verdictCode, outcome: 'not-probed', why: verdictCode } : null) },
      onMemberReadingFresh() { }, dataDir: dir, log() { }, warn() { }, now: () => NOW, rand: () => 0.5,
    });
    return st;
  };
  let open; const gate = new Promise((r) => { open = r; });
  const two = mkLoop({ rows: [rowRead], gate });
  const t1 = two.loop.tick(), t2 = two.loop.tick(); open(); await Promise.all([t1, t2]);
  ck(`(d) two ticks entered together: ONE settle, ONE probe — the second returns at once (${two.settles} settle(s), ${two.probes.length} probe(s))`, two.settles === 1 && two.probes.length === 1, JSON.stringify({ settles: two.settles, probes: two.probes }));
  const un = mkLoop({ rows: [rowUnread] }); await un.loop.tick();
  ck('(d) a row whose sign-in is not read is never probed (no attempt, nothing booked)', un.probes.length === 0, JSON.stringify(un.probes));
  const back = mkLoop({ rows: [rowRead], verdictCode: 'sign-in-unknown' }); await back.loop.tick(); await back.loop.tick();
  const kept = mkLoop({ rows: [rowRead], verdictCode: 'login' }); await kept.loop.tick(); await kept.loop.tick();
  ck(`(d) the door refused «sign-in-unknown»: the attempt is given back — the next tick probes again (${back.probes.length}); CONTROL: a «login» refusal keeps its attempt (${kept.probes.length})`, back.probes.length === 2 && kept.probes.length === 1, JSON.stringify({ back: back.probes.length, kept: kept.probes.length }));
}

// ── ⑥ the census ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ the census — each reader of a row\'s sign-in fields, one kind (DISPLAY / TURN / PERSON / TIMER):');
// ── ⑨ the expiry sweep's TWO instants (主开发 r2067): the settle's `since` (what the decision road may read) is not the ledger's
// birth («watching since»: what the grace gate reads). A parameter named `since` shadowed the birth, so the birth was never
// persisted and a login that died AFTER the hub began watching read as a pre-existing death: recorded, SILENT
console.log('\n⑨ the expiry sweep keeps the ledger\'s birth apart from the settle\'s instant (主开发 r2067):');
{
  const LE = require(path.join(REPO, 'src/login-expiry.js'));
  const watch = require(path.join(REPO, 'src/server/login-expiry-watch.js'));
  const dirW = fs.mkdtempSync(path.join(ROOT, 'lew-'));
  let tw = 1_800_000_000_000, deadAt = null;
  const live = (t) => ({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: t + 6 * 3600e3, refreshTokenExpiresAt: t + 25 * 86400e3, scopes: ['user:inference'] } });
  const wiped = () => ({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: deadAt, scopes: ['user:inference'] } });
  const acctW = { list: () => ({ accounts: [{ id: 'sub-w1', name: 'W1', type: 'subscription', backend: 'claude' }] }), decisionLoginStateOf: (id, t) => LE.loginState(deadAt != null ? wiped() : live(t), t) };
  const filedW = [];
  const wW = watch.create({ accounts: acctW, userTodos: { add: (k, i) => filedW.push(i), resolve: () => { } }, dataDir: dirW, now: () => tw, log: () => { } });
  const t0 = tw;
  wW.sweep({ since: tw - 5 });   // the timer's settle: confirmed just before the sweep
  await wW.whenWritten();   // B-0248 unit 5 (lane bl-loop-b): the ledger is the store writer's, written on its thread
  const filedBirth = (() => { try { return JSON.parse(fs.readFileSync(path.join(dirW, 'login-expiry.json'), 'utf8')).since; } catch { return undefined; } })();
  ck('(a) the ledger\'s BIRTH is the first sweep\'s own instant and it is persisted, whatever settle instant the timer hands', wW.watchingSince() === t0 && filedBirth === t0, JSON.stringify({ birth: wW.watchingSince(), filed: filedBirth, t0 }));
  tw += 2 * 3600e3; deadAt = tw - 3600e3;   // the login dies an hour ago: AFTER the birth, before this settle's instant
  wW.sweep({ since: tw - 5 });
  ck('(b) a login that dies AFTER the hub began watching is SAID (an item filed), never recorded as a pre-existing death', filedW.length === 1, JSON.stringify(filedW.map((i) => i.text || i.title || '?')));
}

// ── ⑩ A WRITER THAT CHANGES WHAT A ROW SHOWS PUSHES THE RECOMPUTED ROWS IN ITS OWN STEP (主开发 r2201 / r2204): the page never
// waits on a landing for an act of ours — (a) a pool default switch, (b) a sign-in finished through our flow. RED: a copy of the
// store whose two writers lack their push (the pool default's: its own and _noteSlot's; the finish's own) answers only at a later landing
console.log('\n⑩ a writer that changes what a row shows pushes the rows in its own step (主开发 r2204):');
{
  const stepPushes = async (Mgr) => {
    const pushes = [];
    const am = new Mgr({ dataDir: fs.mkdtempSync(path.join(ROOT, 'push-')), safeFs: door, platform: 'linux', onChange: (l) => pushes.push(l.accounts) });
    const A = am.createSubscription({ name: 'Push A' }).id; signIn(am, A, 101); am.finalizeSubscription(A);
    const B = am.createSubscription({ name: 'Push B' }).id; signIn(am, B, 102); am.finalizeSubscription(B);
    const pool = am.createPool({ name: 'Push P', members: [A, B] });
    const C = am.createSubscription({ name: 'Push C' }).id;
    await am.displaySettled(); await new Promise((r) => setTimeout(r, 150));   // every landing and its coalesced push are past
    pushes.length = 0;
    am.setPoolTarget(pool.id, pool.current === A ? B : A);
    const switched = pushes.length ? (pushes[pushes.length - 1].find((x) => x.id === pool.id) || null) : null;   // read in the SAME step: no await yet
    const want = pool.current === A ? B : A;
    signIn(am, C, 103);
    pushes.length = 0;
    am.finalizeSubscription(C);
    const signed = pushes.length ? (pushes[pushes.length - 1].find((x) => x.id === C) || null) : null;
    await am.displaySettled();
    return { switched: !!switched && switched.current === want, signed: !!signed && signed.loggedIn === true && signed.email === emailOf(103), seen: { pool: switched && switched.current, want, c: signed && { loggedIn: signed.loggedIn, email: signed.email } } };
  };
  const real = await stepPushes(AccountManager);
  ck('(a) a pool default switch pushes the rows IN ITS OWN STEP — the pool row names its new member, no wait on any landing', real.switched, JSON.stringify(real.seen));
  ck('(b) a sign-in finished through our flow pushes the rows IN ITS OWN STEP — the row signed in, with its address', real.signed, JSON.stringify(real.seen));
  const M10 = mutantCopies('acctpush', REPO);
  const srcA = fs.readFileSync(path.join(REPO, 'src/accounts.js'), 'utf8');
  const noPush = anchored(anchored(anchored(srcA, "      if (sessionId) this._notifyLinks(); else this._notify();\n", "      if (sessionId) this._notifyLinks();\n", 'the pool default\'s push (_noteSlot)'),
    "    this._notify();\n    return { id, current: subId, name: target.name, swept };\n", "    return { id, current: subId, name: target.name, swept };\n", 'the pool default\'s own push (setPoolTarget)'),
    "    this._displaySeed(a);   // B-360d: the person's own sign-in — the row right at once\n    this._notify();\n    const { accessToken: _accessToken, ...publicInfo } = info;\n",
    "    this._displaySeed(a);   // B-360d: the person's own sign-in — the row right at once\n    const { accessToken: _accessToken, ...publicInfo } = info;\n", 'the finish\'s push');
  const red = await stepPushes(M10.load('src/accounts.js', noPush, 'nopush').AccountManager);
  ck('(a)/(b) RED CONTROL — the store without the two writers\' push: neither row reaches the page in the writer\'s step', !red.switched && !red.signed, JSON.stringify(red.seen));
}

const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const CENSUS = [
  { f: 'src/accounts.js', kind: 'DISPLAY', who: 'list() / rowOf() and their broadcast', has: ['_rowsOf(this._state.accounts)', 'rowOf(id) { const a = this.get(id); return a ? this._rowsOf([a])[0] : null; }'], unread: 'facts {state: unread}, loggedIn null', unreadable: 'facts {state: unreadable, reason}' },
  { f: 'src/server/backend-status-route.js', kind: 'DISPLAY', who: 'the onboarding chips\' counts', has: ['namedUnread', 'namedUnreadable'], unread: '«reading N account sign-in(s)…»', unreadable: '«N account sign-in(s) could not be read»' },
  { f: 'src/usage-routes.js', kind: 'DISPLAY', who: 'GET /api/usage `logins` (ALSO CURED: it read every account\'s file on the loop)', has: ['const rd = accounts.displayReaderOf(a.id);'], unread: 'no entry (no claim)', unreadable: 'no entry (no claim)' },
  { f: 'src/server/oat-shape-routes.js', kind: 'DISPLAY', who: 'the shape dialog\'s row (one row by its id)', has: ['accounts.rowOf(id)'], not: ['accounts.list()'], unread: 'the row\'s facts', unreadable: 'the row\'s facts' },
  { f: 'src/server/usage-pool-engine.js', kind: 'TURN', who: 'a reading\'s and a rejection\'s slot (readingSlotFor / rejectionSlotFor)', has: ['function readingSlotFor(session', 'function rejectionSlotFor(session'], unread: 'never the list', unreadable: 'never the list' },
  { f: 'src/server/account-usage-routes.js', kind: 'PERSON', who: 'a sign-in\'s same-account fold (finalize dupOf)', has: ['await accounts.signinFactsNow(compared)', 'foldUnjudged = rowsNow.filter('], unread: 'read now (the folders it compares), bounded', unreadable: 'never folded into (both kept) — and SAID (foldUnjudged)' },
  { f: 'src/server/account-usage-routes.js', kind: 'PERSON', who: 'a host\'s email backfill and fold (accounts-status)', has: ['const readNow = (x) => !x.facts || x.facts.state === \'read\';'], unread: 'read now, awaited', unreadable: 'no backfill, no fold — and SAID (foldUnjudged)' },
  { f: 'src/lib/manage-agents.js', kind: 'DISPLAY', who: 'the host\'s «could not compare» where Manage Agents reads the host\'s accounts answer (client; the host\'s words: «two rows may name one account»)', has: ['export function sayHostFoldUnjudged(hostId, r)', 'foldUnjudgedWords(r && r.foldUnjudged, { host: true })', "t('Could not compare with {names} — their sign-in could not be read; two rows may name one account', { names })", 'sayHostFoldUnjudged(hostId, cur);', 'if (selectedHost) sayHostFoldUnjudged(selectedHost, racct);', 'if (!r.merged && foldUnjudgedWords(r.foldUnjudged)) showToast('], unread: 'said once a change', unreadable: 'said once a change' },
  { f: 'src/usage-routes.js', kind: 'PERSON', who: '⟳ and the tick\'s pick (refreshViaCliPanel) + the token road\'s same-account email', has: ['await accounts.signinFactsNow([key])', 'await accounts.signinFactsNow(compared)', 'const rowsNow = accounts.decisionList({ since }).accounts || [];'], unread: 'read now, awaited', unreadable: 'refused by name, no spawn, never «re-login»' },
  { f: 'src/server/auto-cli-loop.js', kind: 'TIMER', who: 'the automatic usage read\'s tick', has: ['await d.accounts.signinFactsSettled();', 'd.accounts.decisionList({ since: factsSince })', 'probeEligibility(a) === SIGNIN_UNKNOWN) continue;', 'if (ticking) return;'], not: ['d.accounts.list().accounts'], unread: 'NO probe this tick', unreadable: 'NO probe this tick' },   // stale-pins: kept — `not` checks the release's read is GONE
  { f: 'src/server/login-expiry-watch.js', kind: 'TIMER', who: 'the login-expiry sweep (its notices)', has: ['accounts.decisionLoginStateOf(a.id, t, ', 'accounts.signinFactsSettled()', 'sweep({ since: settled && settled.since })'], not: ['accounts.loginStateOf(a.id, t)'], unread: 'no notice, no retraction', unreadable: 'no notice, no retraction' },   // stale-pins: kept — `not` checks the release's read is GONE
  { f: 'src/usage-routes.js', kind: 'TIMER', who: 'the machine login\'s link and merge (ingestPassiveUsage)', has: ['const dec = accounts.decisionList().accounts || [];', 'const gid = linkUndecided ? null : _usageGlobalLink.accountId;', 'const gid = _codexLinkUndecided ? null : _codexUsageGlobalLink.accountId;', 'const ingestConfirmed = () => accounts.signinFactsSettled()'], unread: 'no link decided, no merge', unreadable: 'no link decided, no merge' },
  { f: 'src/server/usage-pool-engine.js', kind: 'TIMER', who: 'the boot / hourly / manual identity repair (the rows it keys on)', has: ['accounts.decisionList(since != null ? { since } : {})'], unread: 'no email: never grouped by one', unreadable: 'the same' },
  { f: 'server.js', kind: 'TIMER', who: 'the boot and hourly repairs await the facts first', has: ["repairIdentityAnchors('boot', { since: settled && settled.since })", "repairIdentityAnchors('hourly', { since: settled && settled.since })"], unread: '—', unreadable: '—' },
  { f: 'src/usage-routes.js', kind: 'PERSON', who: 'the manual identity repair (a person\'s press: read now, bounded, at the head of the queue)', has: ['settled = await accounts.signinFactsNow(null)', "repairIdentityAnchors('manual', { since: settled && settled.since })"], unread: 'read now within the person\'s bound', unreadable: 'no email: never grouped by one' },
  { f: 'src/server/usage-pool-engine.js', kind: 'TIMER', who: 'the identity groups\' email key: the release\'s (the B-6a92 door\'s grouping, confirmed within 60 s) and, since B-87fd unit 4 (主开发 r3311 MUST 1), the names and records over the KEPT facts at any age — landed once', has: ['const roster = accounts.decisionList({ withinMs: 60000 }).accounts || [];', 'const kept = accounts.decisionList({ since: 0 }).accounts || [];', "const f = accounts.signinFacts(accountId, { since: 0 });"], unread: 'release key: its own identity (no merge); never landed: the release\'s grouping until its first landing', unreadable: 'release key: its own identity; the groups: judged, no record — unproven, apart' },
  { f: 'server.js', kind: 'TIMER', who: 'OTel\'s org→account email fallback (per record, no wait)', has: ['listAccounts: () => accounts.decisionList().accounts || [],'], unread: '«unknown org» (counted), the rid not remembered', unreadable: 'the same' },
  { f: 'src/lib/manage-agents.js', kind: 'DISPLAY', who: 'the accounts dialog\'s rows (client)', has: ['export function factsWordsHtml(a)', "t('sign-in not read yet')", "t('sign-in could not be read ({why})', { why })"], unread: '«sign-in not read yet»', unreadable: '«sign-in could not be read (why)»' },
  { f: 'src/lib/app.js', kind: 'DISPLAY', who: 'New Session\'s account choices (client)', has: ["t('sign-in not read yet')"], unread: 'offered with its words', unreadable: 'offered with its words' },
  { f: 'src/lib/session-lifecycle.js', kind: 'DISPLAY', who: 'the pre-spawn refusals (client)', has: ["if (a.facts && a.facts.state !== 'read') return null;"], unread: 'refuses nothing (the spawn reads fresh)', unreadable: 'refuses nothing' },
  { f: 'src/resume-account.js', kind: 'DISPLAY', who: 'a resume\'s account verdict', has: ["if (a.facts && a.facts.state !== 'read') return { ok: true, unjudged: true };"], unread: 'no claim', unreadable: 'no claim' },
  { f: 'src/lib/setup-flows.js', kind: 'DISPLAY', who: 'the onboarding chips (client)', has: ["t('reading {n} account sign-in(s)…', { n: unread })"], unread: '«reading…» (asked once more after the door\'s deadline)', unreadable: '«could not be read»' },
];
const KINDS = new Set(['DISPLAY', 'TURN', 'PERSON', 'TIMER']);
for (const r of CENSUS) {
  const s = src(r.f);
  const okHas = r.has.every((h) => s.includes(h)), okNot = !(r.not || []).some((h) => s.includes(h));
  ck(`${r.kind.padEnd(7)} ${r.f} — ${r.who} · not read yet: ${r.unread} · could not be read: ${r.unreadable}`, KINDS.has(r.kind) && okHas && okNot,
    !okHas ? 'missing: ' + r.has.filter((h) => !s.includes(h)).join(' | ') : 'still: ' + (r.not || []).filter((h) => s.includes(h)).join(' | '));
}
// a decider reading the DISPLAY list for a sign-in field is a NEW row without a census entry: the files above hold no such read
const deciders = ['src/server/auto-cli-loop.js'];
for (const f of deciders) ck(`${f}: no display list read`, !/accounts\.list\(\)/.test(src(f)));

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
