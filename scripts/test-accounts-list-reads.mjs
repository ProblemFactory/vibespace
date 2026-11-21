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
for (const name of SYNC) {
  const orig = fs[name];
  const wrapped = function (p, ...rest) {
    if (under(p)) { syncAsks.n++; syncAsks.by.set(name, (syncAsks.by.get(name) || 0) + 1); if (syncAsks.stall) Atomics.wait(sab, 0, 0, STALL_MS); }
    return orig.call(this, p, ...rest);
  };
  if (orig.native) wrapped.native = orig.native;
  fs[name] = wrapped;
}
const countSync = (fn) => { const n0 = syncAsks.n; const t = process.hrtime.bigint(); const out = fn(); return { asks: syncAsks.n - n0, ms: Number(process.hrtime.bigint() - t) / 1e6, out }; };

// ── the FILE DOOR's stand-in: SafeFs's contract, each ask held STALL_MS (a placed stall); `dead` = every ask ends at its deadline ──
const door = { asks: 0, byOp: new Map(), dead: false, holdMs: STALL_MS };
door.call = async (op, payload = {}, opts = {}) => {
  door.asks++; door.byOp.set(op, (door.byOp.get(op) || 0) + 1);
  await sleep(door.holdMs);
  if (door.dead) throw Object.assign(new Error(`safe-fs: ${op} timed out after ${opts.timeoutMs || 0} ms`), { safeFsTimeout: true, code: 'ETIMEDOUT' });
  const p = payload.path;
  if (op === 'stat') { const st = await fs.promises.stat(p); return { isFile: st.isFile(), isDirectory: st.isDirectory(), size: st.size, mtimeMs: st.mtimeMs }; }
  if (op === 'readText') { const content = await fs.promises.readFile(p, 'utf-8'); return { content, size: Buffer.byteLength(content) }; }
  if (op === 'realpath') return { path: await fs.promises.realpath(p) };
  throw Object.assign(new Error('unknown op ' + op), { code: 'EINVAL' });
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
am0.remove(NEW);
ck('a removal forgets the folder\'s kept facts', !am0.list().accounts.some((x) => x.id === NEW));

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

// ── ⑥ the census ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ the census — each reader of a row\'s sign-in fields, one kind (DISPLAY / TURN / PERSON / TIMER):');
const src = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const CENSUS = [
  { f: 'src/accounts.js', kind: 'DISPLAY', who: 'list() / rowOf() and their broadcast', has: ['_rowsOf(this._state.accounts)', 'rowOf(id) { const a = this.get(id); return a ? this._rowsOf([a])[0] : null; }'], unread: 'facts {state: unread}, loggedIn null', unreadable: 'facts {state: unreadable, reason}' },
  { f: 'src/server/backend-status-route.js', kind: 'DISPLAY', who: 'the onboarding chips\' counts', has: ['namedUnread', 'namedUnreadable'], unread: '«reading N account sign-in(s)…»', unreadable: '«N account sign-in(s) could not be read»' },
  { f: 'src/usage-routes.js', kind: 'DISPLAY', who: 'GET /api/usage `logins` (ALSO CURED: it read every account\'s file on the loop)', has: ['const rd = accounts.displayReaderOf(a.id);'], unread: 'no entry (no claim)', unreadable: 'no entry (no claim)' },
  { f: 'src/server/oat-shape-routes.js', kind: 'DISPLAY', who: 'the shape dialog\'s row (one row by its id)', has: ['accounts.rowOf(id)'], not: ['accounts.list()'], unread: 'the row\'s facts', unreadable: 'the row\'s facts' },
  { f: 'src/server/usage-pool-engine.js', kind: 'TURN', who: 'a reading\'s and a rejection\'s slot (readingSlotFor / rejectionSlotFor)', has: ['function readingSlotFor(session', 'function rejectionSlotFor(session'], unread: 'never the list', unreadable: 'never the list' },
  { f: 'src/server/account-usage-routes.js', kind: 'PERSON', who: 'a sign-in\'s same-account fold (finalize dupOf)', has: ["const { since } = await accounts.signinFactsSettled(null, { withinMs: 0 });   // every sign-in account's folder, read now"], unread: 'read now, awaited', unreadable: 'never folded into (both kept)' },
  { f: 'src/server/account-usage-routes.js', kind: 'PERSON', who: 'a host\'s email backfill and fold (accounts-status)', has: ['const readNow = (x) => !x.facts || x.facts.state === \'read\';'], unread: 'read now, awaited', unreadable: 'no backfill, no fold' },
  { f: 'src/usage-routes.js', kind: 'PERSON', who: '⟳ and the tick\'s pick (refreshViaCliPanel) + the token road\'s same-account email', has: ["const { since } = await accounts.signinFactsSettled([key], { withinMs: 0 });", 'const rowsNow = accounts.decisionList({ since }).accounts || [];'], unread: 'read now, awaited', unreadable: 'refused by name, no spawn, never «re-login»' },
  { f: 'src/server/auto-cli-loop.js', kind: 'TIMER', who: 'the automatic usage read\'s tick', has: ['await d.accounts.signinFactsSettled();', 'd.accounts.decisionList({ since: factsSince })', 'probeEligibility(a) === SIGNIN_UNKNOWN) continue;'], not: ['d.accounts.list().accounts'], unread: 'NO probe this tick', unreadable: 'NO probe this tick' },   // stale-pins: kept — `not` checks the release's read is GONE
  { f: 'src/server/login-expiry-watch.js', kind: 'TIMER', who: 'the login-expiry sweep (its notices)', has: ['accounts.decisionLoginStateOf(a.id, t)', 'accounts.signinFactsSettled()'], not: ['accounts.loginStateOf(a.id, t)'], unread: 'no notice, no retraction', unreadable: 'no notice, no retraction' },   // stale-pins: kept — `not` checks the release's read is GONE
  { f: 'src/usage-routes.js', kind: 'TIMER', who: 'the machine login\'s link and merge (ingestPassiveUsage)', has: ['const dec = accounts.decisionList().accounts || [];', 'const gid = linkUndecided ? null : _usageGlobalLink.accountId;', 'const ingestConfirmed = () => accounts.signinFactsSettled()'], unread: 'no link decided, no merge', unreadable: 'no link decided, no merge' },
  { f: 'src/server/usage-pool-engine.js', kind: 'TIMER', who: 'the identity groups\' email key', has: ['const roster = accounts.decisionList({ withinMs: 60000 }).accounts || [];'], unread: 'its own identity (no merge)', unreadable: 'its own identity (no merge)' },
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
