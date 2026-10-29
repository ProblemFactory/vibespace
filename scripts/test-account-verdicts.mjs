#!/usr/bin/env node
// Account-verdict MATRIX (B-f531, 2.244.0) — the single evaluateOnHost
// authority, exercised across every combination that produced a field
// incident: linked / host-held / both (held wins) / identity-mismatch /
// never-signed-in / ship gate / dial / api-key. Six incidents happened
// because this matrix only ever ran in users' browsers; now it runs here.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-verdicts-'));
const AccountManager = require('../src/accounts.js');
const AM = AccountManager.AccountManager || AccountManager;
const accounts = new AM({ dataDir: tmp, onChange: () => {} });

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

// ── fixtures ──
// API key account
const api = accounts.add({ name: 'Key A', key: 'sk-ant-api03-' + 'x'.repeat(80) });
// Subscription LOGGED IN locally (fabricate a creds dir with the marker)
const subIn = accounts.createSubscription({ name: 'SubIn' });
fs.writeFileSync(path.join(accounts.subDir(subIn.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 3600e3 } }));
accounts.setEmail(subIn.id, 'alice@example.com');
// Subscription NEVER signed in (empty dir)
const subOut = accounts.createSubscription({ name: 'SubOut' });
accounts.setEmail(subOut.id, 'bob@example.com');

const evalV = (a, facts, opts) => accounts.evaluateOnHost(accounts.get(a.id), facts, opts || {});
const F = (over = {}) => ({ subscription: { email: 'machine@example.com' }, codex: { email: '' }, hostSubs: [], hostSubEmails: {}, transport: 'ssh', ...over });

console.log('── local ──');
check('api key local → local-env', (() => { const v = evalV(api, null); return v.usable && v.how === 'local-env'; })());
check('logged-in sub local → local-env', (() => { const v = evalV(subIn, null); return v.usable && v.how === 'local-env'; })());
check('never-signed-in sub local → blocked', (() => { const v = evalV(subOut, null); return !v.usable && v.reason === 'never-signed-in'; })());

console.log('── remote ──');
check('api key remote → ship (always)', (() => { const v = evalV(api, F()); return v.usable && v.how === 'ship'; })());
check('sub remote, nothing on host, no opt-in → ship-disabled', (() => { const v = evalV(subIn, F()); return !v.usable && v.reason === 'ship-disabled'; })());
check('sub remote + opt-in → ship', (() => { const v = evalV(subIn, F(), { allowShip: true }); return v.usable && v.how === 'ship'; })());
check('sub remote + opt-in + DIAL → dial-no-ship', (() => { const v = evalV(subIn, F({ transport: 'dial' }), { allowShip: true }); return !v.usable && v.reason === 'dial-no-ship'; })());
check('never-signed-in sub remote, nothing on host → never-signed-in', (() => { const v = evalV(subOut, F()); return !v.usable && v.reason === 'never-signed-in'; })());

console.log('── email-linked ──');
check('email matches machine login → host-login', (() => { const v = evalV(subIn, F({ subscription: { email: 'ALICE@example.com' } })); return v.usable && v.how === 'host-login' && v.linked; })());
check('linked works even when NOT logged in locally (2.237.3)', (() => { const v = evalV(subOut, F({ subscription: { email: 'bob@example.com' } })); return v.usable && v.how === 'host-login'; })());

console.log('── host-held ──');
check('held dir, identity unreported → host-held (unverified)', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id] })); return v.usable && v.how === 'host-held' && !v.heldVerified; })());
check('held dir, identity MATCHES → host-held (verified)', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id], hostSubEmails: { [subOut.id]: 'Bob@Example.com' } })); return v.usable && v.how === 'host-held' && v.heldVerified; })());
check('held dir, identity MISMATCH → refused loudly', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id], hostSubEmails: { [subOut.id]: 'stranger@example.com' } })); return !v.usable && v.reason === 'held-identity-mismatch' && v.dirEmail === 'stranger@example.com'; })());
check('HELD+LINKED both → held WINS (2.243.2 precedence: dir creds are deterministic, config email can be stale)', (() => {
  const v = evalV(subOut, F({ subscription: { email: 'bob@example.com' }, hostSubs: [subOut.id] }));
  return v.usable && v.how === 'host-held' && v.held && v.linked;
})());

console.log('── not-on-this-host vs never-signed-in ──');
accounts.noteHostLogins('host-nov', [subOut.id]);
check('no login HERE but held elsewhere → not-on-this-host (+otherHosts)', (() => {
  const v = evalV(subOut, F({ hostId: 'host-cw' }));
  return !v.usable && v.reason === 'not-on-this-host' && (v.otherHosts || []).includes('host-nov');
})());
check('local pick of a host-only account → not-on-this-host', (() => {
  const v = evalV(subOut, null);
  return !v.usable && v.reason === 'not-on-this-host';
})());
check('evaluated ON the holding host itself w/o live dir → NOT listed as its own other-host', (() => {
  const v = evalV(subOut, F({ hostId: 'host-nov' }));
  return !v.usable && !(v.otherHosts || []).includes('host-nov');
})());

console.log('── long-lived token (oat, B-211a) ──');
// oat on the never-signed-in sub: valid token shape, encrypted at rest
const OAT = 'sk-ant-oat01-' + 'a'.repeat(60);
accounts.setOat(subOut.id, OAT);
check('oat stored encrypted (raw token never on disk)', !fs.readFileSync(path.join(tmp, 'accounts.json'), 'utf-8').includes(OAT));
check('getOat round-trips', accounts.getOat(subOut.id) === OAT);
check('list() exposes oat state', (() => { const a = accounts.list().accounts.find((x) => x.id === subOut.id); return a.oat === true && a.oatDaysLeft > 360; })());
check('bad token shape refused', (() => { try { accounts.setOat(subOut.id, 'sk-ant-api03-nope'); return false; } catch { return true; } })());
check('oat on an API-key account refused', (() => { try { accounts.setOat(api.id, OAT); return false; } catch { return true; } })());

check('oat-only sub local → usable via oat', (() => { const v = evalV(subOut, null); return v.usable && v.how === 'oat'; })());
check('oat-only sub on ssh host → usable via oat', (() => { const v = evalV(subOut, F()); return v.usable && v.how === 'oat'; })());
check('oat sub on DIAL host → usable via oat (no dial-no-ship)', (() => { const v = evalV(subOut, F({ transport: 'dial' })); return v.usable && v.how === 'oat'; })());
check('host-held still beats oat', (() => { const v = evalV(subOut, F({ hostSubs: [subOut.id], hostSubEmails: { [subOut.id]: 'bob@example.com' } })); return v.usable && v.how === 'host-held'; })());
check('linked still beats oat', (() => { const v = evalV(subOut, F({ subscription: { email: 'bob@example.com' } })); return v.usable && v.how === 'host-login'; })());

// resolveForSpawn shapes
check('oat-only local spawn → env token, no dir', (() => { const r = accounts.resolveForSpawn(subOut.id, 'claude'); return r.oatOnly && r.localEnv.CLAUDE_CODE_OAUTH_TOKEN === OAT && !r.localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR; })());
check('oat-only spawn carries the secret channel', (() => { const r = accounts.resolveForSpawn(subOut.id, 'claude'); return r.secret?.var === 'CLAUDE_CODE_OAUTH_TOKEN' && r.secret.value === OAT; })());
accounts.setOat(subIn.id, OAT);
check('logged-in + oat: local spawn keeps the DIR (hot-swap intact)', (() => { const r = accounts.resolveForSpawn(subIn.id, 'claude'); return !!r.localEnv.CLAUDE_SECURESTORAGE_CONFIG_DIR && !r.localEnv.CLAUDE_CODE_OAUTH_TOKEN; })());
check('logged-in + oat: remote secret channel present', (() => { const r = accounts.resolveForSpawn(subIn.id, 'claude'); return r.secret?.var === 'CLAUDE_CODE_OAUTH_TOKEN'; })());
accounts.clearOat(subIn.id);
check('clearOat restores the plain-subscription shape', (() => { const r = accounts.resolveForSpawn(subIn.id, 'claude'); return r.secret === null; })());
// expired oat: verdict NOT usable with its own honest reason (review fix —
// a usable verdict made the switcher kill-then-fail, and a default account
// silently flipped billing to the host login the day the token expired)
accounts.setOat(subOut.id, OAT);
accounts.get(subOut.id).oatMintedAt = Date.now() - 366 * 86400000;
check('EXPIRED oat verdict → not usable, reason oat-expired (local)', (() => { const v = evalV(subOut, null); return !v.usable && v.reason === 'oat-expired'; })());
check('EXPIRED oat verdict → oat-expired on a host too', (() => { const v = evalV(subOut, F()); return !v.usable && v.reason === 'oat-expired'; })());
check('EXPIRED oat-only spawn refuses with re-mint guidance', (() => { try { accounts.resolveForSpawn(subOut.id, 'claude'); return false; } catch (e) { return /re-mint/.test(e.message); } })());
check('expired oat drops the secret for a logged-in account', (() => { accounts.get(subIn.id).oatEnc = accounts.get(subOut.id).oatEnc; accounts.get(subIn.id).oatMintedAt = Date.now() - 366 * 86400000; const r = accounts.resolveForSpawn(subIn.id, 'claude'); delete accounts.get(subIn.id).oatEnc; return r.secret === null; })());
check('clearOat removes verdict usability', (() => { accounts.clearOat(subOut.id); const v = evalV(subOut, F()); return !v.usable; })());

// ── macOS local-only rung (PR #23): a Darwin-platform manager marks
// Claude subscriptions Keychain-backed — the SHIP rung is forbidden (the file
// fallback forks the rotating refresh token), but held/linked stay usable.
console.log('── macOS local-only (PR #23) ──');
{
  const { AccountManager: AM } = await import('../src/accounts.js');
  const mac = new AM({ dataDir: tmp + '/mac', platform: 'darwin' });
  const ms = mac.createSubscription({ name: 'MacSub' });
  fs.writeFileSync(path.join(mac.subDir(ms.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok', expiresAt: Date.now() + 3600e3 } }));
  mac.setEmail(ms.id, 'mac@example.com');
  const mF = (over = {}) => ({ subscription: { email: 'machine@example.com' }, codex: { email: '' }, hostSubs: [], hostSubEmails: {}, transport: 'ssh', ...over });
  const mv = (facts, opts) => mac.evaluateOnHost(mac.get(ms.id), facts, opts || {});
  check('darwin sub is localOnly in list()', mac.list().accounts.find((x) => x.id === ms.id)?.localOnly === true);
  check('darwin sub + allowShip → BLOCKED reason local-only-mac', (() => { const v = mv(mF(), { allowShip: true }); return !v.usable && v.reason === 'local-only-mac'; })());
  check('darwin sub, ship off → reason local-only-mac (not ship-disabled)', (() => { const v = mv(mF()); return !v.usable && v.reason === 'local-only-mac'; })());
  check('darwin sub HELD on host stays usable (host-held)', (() => { const v = mv(mF({ hostSubs: [ms.id], hostSubEmails: { [ms.id]: 'mac@example.com' } })); return v.usable && v.how === 'host-held'; })());
  check('darwin sub LINKED to host login stays usable (host-login)', (() => { const v = mv(mF({ subscription: { email: 'mac@example.com' } })); return v.usable && v.how === 'host-login'; })());
  check('darwin sub local spawn unaffected', (() => { const v = mv(null); return v.usable && v.how === 'local-env'; })());
  check('resolveForSpawn marks remoteCreds non-shippable', mac.resolveForSpawn(ms.id, 'claude').remoteCreds?.shippable === false);
  check('linux manager (this one) marks nothing localOnly', accounts.list().accounts.every((x) => !x.localOnly));
}

// ── THE POOL VERDICT NAMES EVERY MEMBER (lane pool-silent-members R2, inc-mvsjhna7 12:56:40 PT) ──
// The incident's roster: 14 members, 6 with a live login (the current one soft-spent on 5h, 3 out of quota, 2 under the
// 15 % reserve floor), 6 living on a long-lived token whose file the 2.1.312 update took away (the CLI unmeasured), 2 with
// wiped logins. 90c995a3's notice could name only what reached the decision — the 2 under the floor — and said «every
// other member is held back by your spending limits» while 3 were simply out of quota. THE CENSUS: every member the
// roster lists is named in the notice (a miss is RED by name), and the verdict puts each other member in exactly one bucket.
console.log('── the pool verdict names every member of its roster (R2) ──');
{
  const APA = require('../src/account-pool-auto.js');
  const { decidePoolSwitch, poolBlockedNotice } = APA;
  const FX = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'oat-in-file.json'), 'utf-8'));
  const { '2.1.312': _r312, ...upTo308 } = FX.versions;
  const dirR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-verdicts-roster-'));
  const fxF = path.join(dirR, 'fx-to-2.1.308.json'); fs.writeFileSync(fxF, JSON.stringify({ versions: upTo308 }));
  const am = new AM({ dataDir: dirR, onChange: () => {}, oatFixture: fxF });
  const SH = { scopes: ['user:inference', 'user:profile'], subscriptionType: 'max' };
  const live = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r', expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 20 * 864e5, ...SH } }), { mode: 0o600 });
  const wiped = (id) => fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: Date.now() - 864e5, ...SH } }), { mode: 0o600 });
  const id = {};
  for (let i = 1; i <= 14; i++) id[i] = am.createSubscription({ name: `acct-${i}` }).id;
  for (let i = 1; i <= 6; i++) live(id[i]);
  for (let i = 7; i <= 12; i++) am.setOat(id[i], ['sk', '-ant-oat01-'].join('') + 'ROSTERfake_' + String.fromCharCode(96 + i).repeat(40)); // a token, NO file in the folder
  wiped(id[13]); wiped(id[14]);
  am.noteCliVersion('2.1.312 (Claude Code)'); // the box's CLI — this fixture never measured it
  await am.oatFileSettled();
  const P = am.createPool({ name: 'All' }).id;
  const nowSec = Math.floor(Date.now() / 1000), H = 3600, D = 86400;
  const c = (u5, u7, extra = {}) => ({ fetchedAt: Date.now(), fiveHour: { utilization: u5, resetsAt: nowSec + 2 * H }, sevenDay: { utilization: u7, resetsAt: nowSec + 3 * D }, scopedWeekly: [], ...extra });
  const caches = {
    [id[1]]: c(0.92, 0.42),                       // the CURRENT member: 5h nearly spent on a hot pool
    [id[2]]: c(0.10, 0.97), [id[3]]: c(0.10, 0.97), // under the 15 % reserve floor (3 % weekly)
    [id[4]]: c(0.97, 0.40), [id[5]]: c(1, 0.36),    // out of quota on 5h
    [id[6]]: c(0.20, 0.30, { scopedWeekly: [{ name: 'Fable', utilization: 0.99, resetsAt: nowSec + 2 * D }] }), // out of quota on its model cap
  };
  const members = am.poolMembers(P);
  const roster = typeof am.poolRoster === 'function' ? am.poolRoster(P) : am.poolMembership(P).map((x) => ({ id: x, name: am.get(x).name }));
  const d = decidePoolSwitch({ currentId: id[1], members, roster, readCache: (x) => caches[x] || null, nowSec, hot: true, proactive: true, reserveFloorPct: 15, readLogin: (x) => am.loginStateOf(x, Date.now(), { slot: true }), explain: true });
  const txt = poolBlockedNotice(d, { poolName: 'All', currentName: 'acct-1' });
  check(`(the incident's shape: the candidate list holds the 6 live logins of 14 — ${members.length} — and the decision is blocked: ${d && d.reason})`, members.length === 6 && roster.length === 14 && !!d && d.to === null);
  // (acceptance r2) THE NOTICE IS BOUNDED: its TEXT names the current member and the first 3 of each bucket and COUNTS the
  // rest («and N more», «6 accounts: …»); its DETAIL (poolBlockedDetail — journaled beside the notice) has ONE line per member
  const detail = typeof APA.poolBlockedDetail === 'function' ? APA.poolBlockedDetail(d, { currentName: 'acct-1' }) : [];
  const lined = roster.filter((r) => detail.some((l) => l.startsWith(r.name + ': ') || l.startsWith(r.name + ' (current): ')));
  const missing = roster.filter((r) => !lined.includes(r)).map((r) => r.name);
  check(`CENSUS: every member of the roster has its OWN line in the notice's detail — ${lined.length} of 14 (${detail.length} lines, the current member first)${missing.length ? `; missing: ${missing.join(', ')}` : ''}`, lined.length === 14 && detail.length === 14 && /^acct-1 \(current\): /.test(detail[0] || ''));
  const shownN = roster.filter((r) => new RegExp(`\\b${r.name}\\b`).test(txt)).length;
  const countedN = [...txt.matchAll(/ and (\d+) more/g)].reduce((a, m) => a + Number(m[1]), 0);
  check(`CENSUS: the notice's TEXT names or counts every member — ${shownN} named + ${countedN} counted («and N more») of 14 — never one silent`, shownN + countedN === 14);
  const named = typeof APA.namedMembersOf === 'function' ? APA.namedMembersOf(d) : [];
  const others = roster.filter((r) => r.id !== id[1]).map((r) => r.id);
  const twice = named.filter((x, i) => named.indexOf(x) !== i);
  check(`CENSUS: the verdict puts every OTHER member in exactly ONE named bucket (${new Set(named).size} of ${others.length}${twice.length ? `; twice: ${twice.map((x) => am.get(x).name).join(', ')}` : ''})`, others.every((x) => named.includes(x)) && !twice.length && named.every((x) => others.includes(x)));
  check('…out of quota is a NAMED list with the spent bucket and its reset — «acct-4 (5h 3% until …)», «acct-5 (5h 0% until …)», «acct-6 (Fable 1% until …)» — never a count', /Out of quota: acct-4 \(5h 3% until \d\d:\d\d:\d\dZ\), acct-5 \(5h 0% until \d\d:\d\d:\d\dZ\), acct-6 \(Fable 1% until \d\d:\d\d:\d\dZ\)\./.test(txt));
  // (acceptance r3: a reason said for MANY speaks of THEIR folders — «14 accounts: … in ITS folder» was the claim's wording nit)
  check('…the members the pool cannot place are named WITH the store\'s reason, ONE clause per reason with its count — «6 accounts: no credential file in their folders (CLI 2.1.312 unmeasured) — re-login or wait for the measurement (acct-7, acct-8, acct-9 and 3 more); 2 accounts: signed out (their logins were wiped) — re-login (acct-13, acct-14)»', /The pool cannot place: 6 accounts: no credential file in their folders \(CLI 2\.1\.312 unmeasured\) — re-login or wait for the measurement \(acct-7, acct-8, acct-9 and 3 more\); 2 accounts: signed out \(their logins were wiped\) — re-login \(acct-13, acct-14\)\./.test(txt));
  check('…and the detail names each with its own reason — «acct-12: the pool cannot place it — no credential file in its folder (CLI 2.1.312 unmeasured) — …», «acct-5: out of quota — 5h 0% until …»', detail.includes('acct-12: the pool cannot place it — no credential file in its folder (CLI 2.1.312 unmeasured) — re-login or wait for the measurement') && detail.some((l) => /^acct-5: out of quota — 5h 0% until \d\d:\d\d:\d\dZ$/.test(l)));
  check('…«held back by your spending limits» is NOT said: three others are out of quota (barsOnly reads every OTHER member)', !/held back by your spending limits/.test(txt) && /Held back by the 15% reserve floor: acct-2 \(3% weekly\), acct-3 \(3% weekly\)\./.test(txt));
  // the positive control: when every other member really IS held by a bar, the sentence is true and is said
  const onlyBars = decidePoolSwitch({ currentId: id[1], members: members.filter((m) => [id[1], id[2], id[3]].includes(m.id)), roster: roster.filter((r) => [id[1], id[2], id[3]].includes(r.id)), readCache: (x) => caches[x] || null, nowSec, hot: true, proactive: true, reserveFloorPct: 15, readLogin: (x) => am.loginStateOf(x, Date.now(), { slot: true }), explain: true });
  check('CONTROL: a roster whose every other member sits under the reserve floor still reads «every other member is held back by your spending limits»', /every other member is held back by your spending limits/.test(poolBlockedNotice(onlyBars, { poolName: 'All', currentName: 'acct-1' })));
  if (fail) console.log('    notice: ' + txt);
  fs.rmSync(dirR, { recursive: true, force: true });
  // (acceptance r2, claim 1 (a)) A 40-MEMBER ROSTER — 19 candidates every one spent, 14 on a token the unmeasured CLI cannot
  // be handed, 7 wiped: 9d53db09 said it in ONE 2 694-char toast, the same clause 14×, no «and N more», no detail
  const m40 = [], r40 = [], c40 = {};
  for (let i = 1; i <= 40; i++) {
    const mid = 'm' + i, name = 'acct-' + i;
    if (i <= 19) { m40.push({ id: mid, name }); r40.push({ id: mid, name, placeable: true }); c40[mid] = { fetchedAt: Date.now(), fiveHour: { utilization: 0.99, resetsAt: nowSec + H + i * 60 }, sevenDay: { utilization: 0.5, resetsAt: nowSec + 3 * D } }; }
    else if (i <= 33) r40.push({ id: mid, name, placeable: false, why: { code: 'cli-unmeasured', cli: '2.1.312', file: false } });
    else r40.push({ id: mid, name, placeable: false, why: { code: 'logged-out' } });
  }
  const notice40 = (A) => { const d40 = A.decidePoolSwitch({ currentId: 'm1', members: m40, readCache: (x) => c40[x] || null, nowSec, roster: () => r40, explain: true }); return { d40, t40: A.poolBlockedNotice(d40, { poolName: 'All', currentName: 'acct-1' }), l40: typeof A.poolBlockedDetail === 'function' ? A.poolBlockedDetail(d40, { currentName: 'acct-1' }) : [] }; };
  const { d40, t40, l40 } = notice40(APA);
  const sh40 = r40.filter((r) => new RegExp(`\\b${r.name}\\b`).test(t40)).length, ct40 = [...t40.matchAll(/ and (\d+) more/g)].reduce((a, m) => a + Number(m[1]), 0);
  check(`BOUNDED: a 40-member roster's toast is ${t40.length} chars (≤ 700) — the current member and the first 3 of each bucket, the rest counted (${sh40} named + ${ct40} counted = 40)`, t40.length <= 700 && sh40 + ct40 === 40 && APA.namedMembersOf(d40).length === 39);
  check('BOUNDED: …the clause shared by 14 members is said ONCE with its count — «14 accounts: no credential file in their folders (CLI 2.1.312 unmeasured) — … (acct-20, acct-21, acct-22 and 11 more)»', (t40.match(/no credential file in (its|their) folders?/g) || []).length === 1 && /14 accounts: no credential file in their folders \(CLI 2\.1\.312 unmeasured\) — re-login or wait for the measurement \(acct-20, acct-21, acct-22 and 11 more\)/.test(t40) && /Out of quota: acct-2 \(5h 1% until [^)]*\), acct-3 \([^)]*\), acct-4 \([^)]*\) and 15 more\./.test(t40));
  check('BOUNDED: …and the detail carries the WHOLE roster, one line per member (40 — the current member first)', l40.length === 40 && /^acct-1 \(current\): /.test(l40[0]) && r40.every((r) => l40.some((l) => l.startsWith(r.name + ': ') || l.startsWith(r.name + ' (current): '))));
  {
    const Module = require('node:module'), file = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'account-pool-auto.js');
    const src = fs.readFileSync(file, 'utf8'), cut = 'const NOTICE_NAMES_MAX = 3;';
    const mm = src.includes(cut) ? (() => { const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(src.replace(cut, 'const NOTICE_NAMES_MAX = 1e6;'), file); return m.exports; })() : null;
    const r = mm ? notice40(mm) : null;
    check(`RED CONTROL: the same 40 with the bound taken out (NOTICE_NAMES_MAX unbounded) is a ${r ? r.t40.length : '?'}-char toast — the bound is what keeps it short`, !!r && r.t40.length > 1000);
  }
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
