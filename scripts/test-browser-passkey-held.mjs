#!/usr/bin/env node
// test-browser-passkey-held — data/browser-passkeys.json UNDER THE STORE-READ LAW (主开发 r3261; lane bl-machines-b's census of the
// stores, «37 more stores judged», item 1). FAST, in-process: the REAL dialog watch module (src/server/browser-dialogs.js, the
// store's ONE writer) over the PRODUCTION wiring of the store (src/server/browser-passkey-file.js once it exists; the release's own
// wiring copied verbatim before), a scratch data folder, MADE-UP passkeys built at run time (never a literal of sealed bytes), the
// refusal PLACED on the read (a store that does not parse; a read refused with EACCES by the leg — the production object's read and the
// hold's read again of that one path — so every run judges it, root too). r3632 (the round on line 792): the removal's callers (the REAL
// Forget, the REAL DELETE route) and the agent's status reply, while held.
// THE HARM it judges (the release): a failed read cached an EMPTY store for the process's life, and the next write — a switch, a
// removal, a sign-in's count, a registration — wrote the file over: EVERY PASSKEY A PERSON REGISTERED IN AN AGENT BROWSER LOST.
import './scratch.mjs';
import { scratch } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Dm = require('../src/server/browser-dialogs.js');
const PS = require('../src/browser-passkey-store.js');
let PF = null; try { PF = require('../src/server/browser-passkey-file.js'); } catch { PF = null; }   // the production wiring, once extracted
let pass = 0, fail = 0;
const ok = (c, title, detail) => { if (typeof title !== 'string') throw new TypeError('ok(cond, title): the title is no string — a swapped call'); if (c) { pass++; console.log(`  ✓ ${title}`); } else { fail++; console.log(`  ✗ ${title}`); if (detail !== undefined) console.log(`    ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`.slice(0, 900)); } return !!c; };
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('passkey-held');
const b64u = (n) => crypto.randomBytes(n).toString('base64url');
const sealedLike = () => ['v1', b64u(12), b64u(16), b64u(30)].join('.');   // the sealed shape, made up at run time
const PID = 'bp-0000p001';
const rowOf = (n, by) => ({ credentialId: b64u(16), rpId: 'example.test', userName: `person${n}`, displayName: `Person ${n}`, keySealed: sealedLike(), createdBy: by, createdAt: 1000 + n, signCount: 3, policy: 'ask' });
/** THE RELEASE's OWN WIRING of the store (src/server/mounts-plugins-wiring.js `passkeys:`), copied — used only where the tree has
 *  no src/server/browser-passkey-file.js (the release itself: the leg's red) */
function releaseWiring(dataDir) {
  const file = path.join(dataDir, 'browser-passkeys.json');
  return {
    file,
    read: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    write: (o) => require('../src/channel-store.js').writeJsonAtomic(file, o, { mode: 0o600 }),
    cipher: { seal: () => null, open: () => null },
  };
}
const storeOf = (dataDir) => (PF ? PF.passkeyFileStore({ dataDir }) : releaseWiring(dataDir));
const heldOf = (x) => !!x && (x.code === 'passkeys_unread' || (x.held && typeof x.held === 'object'));
// r3632 (should, the round on line 792): the unreadable store is a PLACED refusal of the read — the production object's own read (readText,
// or the release wiring's read) and the hold's read again (fs.promises.readFile of that ONE path) throw EACCES while placed. Never a mode
// change: a run as root reads a mode-0000 file, and «lifted with no restart» would then have no judged leg.
const EACCES = () => Object.assign(new Error('EACCES: permission denied, open (placed by the leg)'), { code: 'EACCES', errno: -13 });
const PLACED = new Set();
{ const realReadFile = fs.promises.readFile; fs.promises.readFile = function (f, ...a) { return PLACED.has(String(f)) ? Promise.reject(EACCES()) : realReadFile.call(this, f, ...a); }; }
const refusedRead = (st) => {
  const r0 = typeof st.readText === 'function' ? st.readText : null, d0 = typeof st.read === 'function' ? st.read : null;
  if (r0) st.readText = () => { if (PLACED.has(st.file)) throw EACCES(); return r0(); };
  if (d0) st.read = () => { if (PLACED.has(st.file)) throw EACCES(); return d0(); };
  return st;
};
const placements = [
  { name: 'a passkey store that does not parse', slug: 'torn', torn: true, place: (f, good) => fs.writeFileSync(f, good.slice(0, Math.floor(good.length / 2))), store: (st) => st, release: () => { } },
  { name: 'a passkey store whose read is refused (EACCES, placed)', slug: 'refused', torn: false, place: (f) => { PLACED.add(f); }, store: (st) => refusedRead(st), release: (f) => { PLACED.delete(f); } },
];
const until = async (fn, ms = 4000) => { const t = Date.now() + ms; while (Date.now() < t) { if (fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return !!fn(); };

console.log(`— the passkey store through a failed read (${PF ? 'the production wiring' : "the release's wiring, copied"})`);
for (const pl of placements) {
  console.log(`— ${pl.name}`);
  const dataDir = path.join(ROOT, pl.slug); fs.mkdirSync(dataDir, { recursive: true });
  const human = rowOf(1, 'human'), agent = rowOf(2, 'agent');
  const good = JSON.stringify(PS.normalizeStore({ v: 1, profiles: { [PID]: { agentsOff: false, rows: [human, agent] } } }));
  const st0 = storeOf(dataDir); fs.writeFileSync(st0.file, good, { mode: 0o600 });
  ok(PS.normalizeStore(JSON.parse(good)).profiles[PID].rows.length === 2, 'PREMISE: the store holds two passkeys (one the person registered, one an agent did)');
  pl.place(st0.file, good);
  const s0 = fs.statSync(st0.file), bytes0 = fs.readFileSync(st0.file);   // the leg reads the file itself (only the product's read is refused)
  const d = Dm.create({ passkeys: pl.store(storeOf(dataDir)), log: quiet });
  // the owner's page and the agent's verbs, while the store is unread
  let list = null; try { list = d.passkeyList(PID); } catch (e) { list = { code: e && e.code, message: e && e.message }; }
  ok(heldOf(list) && !(Array.isArray(list.keys) && list.keys.length === 0), `${pl.name}: the owner's list says THE HOLD in place — never an empty list`, list);
  let counts = null; try { counts = d.passkeyCounts(); } catch (e) { counts = { code: e && e.code }; }
  ok(counts === null || heldOf(counts), `${pl.name}: the panel's count is UNKNOWN while held — never «0 passkeys»`, counts);
  let sw = null; try { sw = d.passkeySwitch(PID, true); } catch (e) { sw = { code: e && e.code, message: e && e.message }; }
  ok(heldOf(sw) && sw.ok !== true, `${pl.name}: the agents' switch is refused BY NAME while held`, sw);
  let fg = null; try { fg = d.passkeyForget(PID, agent.credentialId, { by: 'agent' }); } catch (e) { fg = { code: e && e.code, message: e && e.message }; }
  ok(heldOf(fg) && fg.code !== 'not-found', `${pl.name}: an agent's removal of a passkey the store holds is told THE HOLD — never «not-found»`, fg);
  let pol = null; try { pol = d.passkeyPolicy(PID, human.credentialId, 'yes'); } catch (e) { pol = { code: e && e.code, message: e && e.message }; }
  ok(heldOf(pol) && pol.code !== 'not-found', `${pl.name}: the owner's policy press is refused BY NAME — never «no passkey»`, pol);
  let vr = null; try { vr = d.passkeyVaultRows(); } catch (e) { vr = { code: e && e.code, message: e && e.message }; }
  ok(heldOf(vr) || !!(vr && !Array.isArray(vr) && vr.held), `${pl.name}: the Vault window's passkey rows say THE HOLD — never an empty list`, Array.isArray(vr) ? { rows: vr.length } : vr);
  let rvl = null; try { rvl = d.passkeyVaultReveal(`${PID}/${human.credentialId}`, 'privateKey'); } catch (e) { rvl = { code: e && e.code, message: e && e.message }; }
  ok(heldOf(rvl), `${pl.name}: the Vault window's reveal (验证是你) says THE HOLD — never «no such key», never a key`, rvl && (rvl.code ? rvl : { answered: typeof rvl }));
  // r3632 MUST 2: the agent's passkey STATUS reply while held — the route's own function — says THE HOLD, never a 500 (null.length)
  {
    let R = null; try { R = require('../src/routes/browser.js'); } catch { R = null; }
    const L = d.passkeyList(PID); let v = null; try { v = d.passkeyIn(PID, null); } catch { v = null; }
    let reply = null; try { reply = R && typeof R.passkeyStatusReply === 'function' ? R.passkeyStatusReply(v || { state: 'none' }, L) : { missing: 'passkeyStatusReply' }; } catch (e) { reply = { threw: e && e.message }; }
    ok(!!reply && reply.ok === true && !!reply.store && reply.store.held === true && /could not be read/.test(String(reply.text || '')), `${pl.name}: MUST 2 — the agent's passkey STATUS says the hold (the store held, the hold's words) — never a 500`, reply);
    const oldLine = (x) => (!x ? '' : x.agentsOff ? 'off' : x.keys.length ? 'some' : 'none');   // the release's store line, its shape
    let threw = false; try { oldLine(L); } catch { threw = true; }
    ok(threw, `${pl.name}: CONTROL (RED): the store line's old shape over this held list throws (null.length) — the 500 the round found`);
  }
  let dropped = null; try { dropped = d.dropPasskeys(PID); } catch (e) { dropped = { code: e && e.code }; }
  const s1 = fs.statSync(st0.file);
  const same = s1.ino === s0.ino && (s1.mode & 0o777) === (s0.mode & 0o777) && (!bytes0 || fs.readFileSync(st0.file).equals(bytes0));
  ok(same, `${pl.name}: after every press (the switch, a removal, a policy, a profile's removal) the store is NEVER written over — the same file, its bytes and mode`, { ino: [s0.ino, s1.ino], mode: [(s0.mode & 0o777).toString(8), (s1.mode & 0o777).toString(8)], dropped });
  if (!pl.torn) {
    pl.release(st0.file);   // the read is let through again (the placed refusal lifted)
    const hold = d._passkeyHold || null;
    if (hold) await hold.again();
    await until(() => !hold || !hold.held());
    let back = null; try { back = d.passkeyList(PID); } catch (e) { back = { code: e && e.code }; }
    ok(!!back && Array.isArray(back.keys) && back.keys.length === 2 && !back.held, `${pl.name}: once the store reads again, with NO restart, the SAME list answers both passkeys`, back && { keys: Array.isArray(back.keys) ? back.keys.length : back.keys, held: back.held || null });
  }
  d.shutdown?.();
}

// ═══ THE CURE's OWN LEGS (they need the production store file, src/server/browser-passkey-file.js) ═══════════════════════════
if (!PF) console.log('  (the cure\'s legs need src/server/browser-passkey-file.js — not in this tree: the release)');
else {
  const SB = require('../src/secret-box.js');
  // ── TORN BYTES: kept aside once, byte for byte, 0600 from its create (they hold sealed keys); then empty WITH the damaged mark in
  //    the new file — a restart still says it; the key-file law counts the copy (a new key is never made over sealed passkeys in it)
  {
    console.log('— torn bytes: the copy, the damaged mark, a restart, the key');
    const dataDir = path.join(ROOT, 'torn-lift'); fs.mkdirSync(dataDir, { recursive: true });
    const st = PF.passkeyFileStore({ dataDir });
    const good = JSON.stringify(PS.normalizeStore({ v: 1, profiles: { [PID]: { agentsOff: false, rows: [rowOf(5, 'human'), rowOf(6, 'agent')] } } }));
    const torn = good.slice(0, Math.floor(good.length / 2));
    fs.writeFileSync(st.file, torn, { mode: 0o600 });
    const d = Dm.create({ passkeys: st, log: quiet });
    let l0 = null; try { l0 = d.passkeyList(PID); } catch (e) { l0 = { code: e && e.code }; }
    await until(() => !d._passkeyHold || !d._passkeyHold.held());
    const copies = fs.readdirSync(dataDir).filter((n) => n.startsWith('browser-passkeys.json.corrupt-'));
    const copy = copies[0] ? path.join(dataDir, copies[0]) : null;
    ok(heldOf(l0) && copies.length === 1 && fs.readFileSync(copy, 'utf8') === torn && (fs.statSync(copy).mode & 0o777) === 0o600, 'torn bytes: HELD at the first ask, then kept aside ONCE, byte for byte, mode 0600 from its create (the copy holds sealed keys)', { l0: l0 && (l0.code || (l0.held && l0.held.code)), copies, mode: copy ? (fs.statSync(copy).mode & 0o777).toString(8) : null });
    let live = null; try { live = JSON.parse(fs.readFileSync(st.file, 'utf8')); } catch (e) { live = { unread: e.code }; }
    const l1 = d.passkeyList(PID);
    ok(!!live && !!live.damaged && live.damaged.copy === copies[0] && !!l1.damaged && l1.damaged.copy === copies[0] && Array.isArray(l1.keys) && l1.keys.length === 0, 'then it starts EMPTY with the DAMAGED mark in the new file and in the list (the copy\'s name) — never a silent empty list', { live: live && live.damaged, list: l1.damaged || null });
    d.shutdown?.();
    const d2 = Dm.create({ passkeys: PF.passkeyFileStore({ dataDir }), log: quiet });
    const l2 = d2.passkeyList(PID); d2.shutdown?.();
    ok(!!l2.damaged && l2.damaged.copy === copies[0], 'a RESTART still says the store was damaged, with the copy\'s name (the mark lives in the file)', l2.damaged || null);
    const keyBefore = fs.existsSync(st.keyFile);
    let opened = null; try { opened = PF.passkeyFileStore({ dataDir }).cipher.open(sealedLike()); } catch (e) { opened = { threw: e && (e.code || e.message) }; }
    ok(!keyBefore && !fs.existsSync(st.keyFile) && !!opened && opened.ok === false, 'the key-file law COUNTS the torn copy: with sealed passkeys kept aside and no key file, no new key is made over them (the open is refused by name)', { keyBefore, keyAfter: fs.existsSync(st.keyFile), opened: opened && (opened.code || opened.threw || 'opened') });
    void SB;
  }
  // ── (a)/(b) THE CEREMONIES while held, on the kernel road (the tree's own fake kernel), the watch over the PRODUCTION store file ──
  {
    console.log('— the ceremonies while held (the kernel road)');
    const { startFakeKernel } = await import('./fixtures/fake-kernel.mjs');
    const PK = require('../src/browser-passkey.js');
    const RECS = []; const realApply = PK.applyEvent;
    PK.applyEvent = (recs, ev, o) => { const r = realApply(recs, ev, o); if (ev && ev.ev === 'start' && r) RECS.push(r); return r; };
    const O = 'https://example.test', U1 = Buffer.from('user-1').toString('base64url');
    const recsOf = (k) => RECS.slice(-4).map((q) => ({ id: q.kernel && q.kernel.requestId, kind: q.kind, outcome: q.outcome, why: q.why || null, refused: !!q.refused }));
    for (const pl of placements) {
      const dataDir = path.join(ROOT, `cer-${pl.slug}`); fs.mkdirSync(dataDir, { recursive: true });
      const st = PF.passkeyFileStore({ dataDir });
      const good = JSON.stringify(PS.normalizeStore({ v: 1, profiles: { 'bp-1': { agentsOff: false, rows: [{ ...rowOf(7, 'human'), rpId: 'example.test' }] } } }));
      // each ceremony in its OWN world (a fresh kernel and watch: its first read is the store's), the refusal placed again before it
      const world = async () => {
        pl.release(st.file);
        fs.writeFileSync(st.file, good, { mode: 0o600 }); pl.place(st.file, good);
        const k = await startFakeKernel({ firstUrl: O + '/' });
        const w = Dm.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: k.wsUrl }), onLease: () => () => {} }, log: quiet, enableTimeoutMs: 300, promptAskMs: 60, passkeyOrphanMs: 150,
          holdersOf: () => [{ browserKey: 'bk-1', sessionId: 's1' }], leaseCountOf: () => 1, labelOf: () => 'Work', passkeys: pl.store(PF.passkeyFileStore({ dataDir })), takeoverOf: () => false,
          forYou: { add: () => 'fy-1', resolve() {}, ended() {} }, vaultUse: () => ({ receipt: 'vr-000000000001' }) });
        await w.arm('bp-1');
        return { k, w, s0: fs.statSync(st.file), b0: fs.readFileSync(st.file), close: async () => { w.shutdown(); await k.close(); } };
      };
      const rowsNow = () => { try { return PS.normalizeStore(JSON.parse(fs.readFileSync(st.file, 'utf8'))).profiles['bp-1']?.rows?.length ?? 0; } catch { return null; } };
      const untouched = (x) => { const s1 = fs.statSync(st.file); return pl.torn ? (rowsNow() === null || rowsNow() === 0) /* torn: still the torn bytes, or lifted EMPTY — never a key that landed */ : s1.ino === x.s0.ino && fs.readFileSync(st.file).equals(x.b0); };
      let x = await world();
      const reg = await x.w.passkeyRegister({ profileId: 'bp-1', browserKey: 'bk-1', sessionId: 's1', rpId: 'example.test', user: 'alice' });
      ok(reg.ok === false && reg.code === 'passkeys_unread' && /could not be read/.test(reg.error) && !/no passkey for/i.test(reg.error), `${pl.name}: (a) an agent's registration is refused BY NAME before any card or ceremony — the hold, never «no passkey»`, reg);
      await x.close(); x = await world();   // r3632 (should): the page's create in a world of its OWN (the registration's read began the torn hold's copy)
      const c1 = x.k.triggerWebAuthn({ op: 'create', origin: O, user: { id: U1, name: 'alice', displayName: 'Alice' } });
      const a1 = await c1.answerPromise; await until(() => RECS.some((q) => q.kernel && q.kernel.requestId === c1.request.requestId && q.outcome !== 'pending'));
      const r1 = RECS.find((q) => q.kernel && q.kernel.requestId === c1.request.requestId) || null;
      ok(!!a1 && a1.error === 'NotAllowedError' && !!r1 && r1.refused === true && r1.why === 'passkeys_unread' && /could not be read/.test(PK.refusedText(r1.why, r1.rpId)) && untouched(x), `${pl.name}: (a) the page's own registration is refused BEFORE the ceremony answers the site (NotAllowedError, no key made, nothing stored) — the agent told the hold`, { a: a1 && { outcome: a1.outcome, error: a1.error }, recs: recsOf(), rows: rowsNow() });
      await x.close();
      x = await world();
      const c2 = x.k.triggerWebAuthn({ op: 'get', origin: O });
      const a2 = await c2.answerPromise; await until(() => RECS.some((q) => q.kernel && q.kernel.requestId === c2.request.requestId && q.outcome !== 'pending'));
      const r2 = RECS.find((q) => q.kernel && q.kernel.requestId === c2.request.requestId) || null;
      ok(!!a2 && a2.error === 'NotAllowedError' && !!r2 && r2.refused === true && r2.why === 'passkeys_unread' && untouched(x), `${pl.name}: (b) a sign-in while held: no passkey is offered (the site sees none) and the person and the agent are told THE HOLD — never «no passkey for this site»; nothing written over`, { a: a2 && { outcome: a2.outcome, error: a2.error }, recs: recsOf(), rows: rowsNow() });
      await x.close();
      pl.release(st.file);
    }
    PK.applyEvent = realApply;
  }
  // ── (d) THE REMOVER ASKS THE FACT: a profile's removal is refused BY NAME while the passkey store is held (the REAL keeper) ──
  {
    console.log('— (d) a profile\'s removal asks the fact');
    const K = require('../src/server/browser-keeper.js');
    const kd = path.join(ROOT, 'keeper'), kh = path.join(kd, 'home'); fs.mkdirSync(path.join(kh, '.agent-browser'), { recursive: true });
    const k = K.create({ dataDir: path.join(kd, 'data'), homeDir: kh, env: () => ({ PATH: '/usr/bin:/bin', HOME: kh }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: () => { }, getTelemetry: () => null, liveKeys: () => new Set(), log: quiet, tickMs: 3600e3, install: false });
    const p = k.createProfile({ label: 'Mine' });
    let held = { file: 'browser-passkeys.json', code: 'EACCES', words: 'the passkeys could not be read (test)' };
    k.setPasskeyHeld(() => held);
    const rv = typeof k.removeVerdict === 'function' ? k.removeVerdict(p.id) : null;
    ok(!!rv && rv.ok === false && rv.code === 'passkeys_unread' && /could not be read/.test(String(rv.error || '')), '(d) MUST 1: the removal VERDICT — asked by the DELETE route and the housekeeping Forget before they unpin, release or move anything — says the hold by name', rv);
    let err = null; try { k.removeProfile(p.id); } catch (e) { err = e; }
    ok(!!err && err.code === 'passkeys_unread' && /could not be read/.test(err.message) && !!k.profile(p.id), '(d) while the passkey store is held a profile\'s removal is refused BY NAME before anything moves — its passkeys are never «dropped» over an unread store', err && { code: err.code, message: String(err.message).slice(0, 160) });
    held = null;
    let gone = null; try { gone = k.removeProfile(p.id); } catch (e) { gone = { threw: e && e.code }; }
    ok(!!gone && !gone.threw && !k.profile(p.id), '…and once the store reads, the removal goes as before', gone && (gone.threw || 'removed'));
    k.shutdown?.();
  }
  // ── r3632 MUST 1: A REMOVAL's CALLERS ask the hold BEFORE they move anything — the REAL housekeeping Forget, the REAL DELETE route ──
  {
    console.log('— MUST 1: a removal\'s callers ask the hold first');
    const K = require('../src/server/browser-keeper.js');
    const BT = require('../src/server/browser-trace.js');
    const kd = path.join(ROOT, 'callers'), kh = path.join(kd, 'home'); fs.mkdirSync(path.join(kh, '.agent-browser'), { recursive: true });
    const k = K.create({ dataDir: path.join(kd, 'data'), homeDir: kh, env: () => ({ PATH: '/usr/bin:/bin', HOME: kh }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: () => { }, getTelemetry: () => null, liveKeys: () => new Set(), log: quiet, tickMs: 3600e3, install: false });
    let held = { file: 'browser-passkeys.json', code: 'EACCES', words: 'the passkeys could not be read (test)' };
    k.setPasskeyHeld(() => held);
    // (1) the housekeeping Forget (src/server/browser-trace.js forgetProfile): the folder's lineage is never re-keyed (the keeper's lineage road
    //     observed — it answers a lineage for the folder and records every move asked of it), the folder and the profile stay
    const p = k.createProfile({ label: 'Set aside' }); fs.mkdirSync(p.dir, { recursive: true });
    const moves = [];
    const kw = { ...k, lineageKeyOf: () => 'lineage-of-' + p.id, moveDirLineage: (key, to) => { moves.push({ key, to }); return { ok: true, moved: true, key }; } };
    const tr = BT.create({ dataDir: path.join(kd, 'data'), homeDir: kh, keeper: kw, log: quiet, sweepEveryMs: 0 });
    let fe = null; try { await tr.forgetProfile(p.id); } catch (e) { fe = e; }
    ok(!!fe && fe.code === 'passkeys_unread' && moves.length === 0 && fs.existsSync(p.dir) && !!k.profile(p.id), 'MUST 1 (the REAL Forget): while the passkeys are held a Forget is refused BY NAME before anything moves — the folder\'s lineage never re-keyed, the folder and the profile stay', { code: fe && fe.code, moves, dir: fs.existsSync(p.dir), profile: !!k.profile(p.id) });
    tr.shutdown?.();
    // (2) the DELETE route with the unpin choice (src/routes/browser.js): no conversation's pin is cleared, nobody is told the browser went
    const R = require('../src/routes/browser.js'); const express = require('express'); const http = require('node:http');
    const p2 = k.createProfile({ label: 'Pinned' });
    try { k.setPin('bk-0000000e', p2.id); } catch { /* the PREMISE below says it */ }
    const before = k.pinnedBy(p2.id).length;
    R.setup({ keeper: k, activeSessions: new Map(), browserEnv: () => null, notice: () => { } });
    const app = express(); app.use(express.json()); app.use(R.router);
    const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    let status = null, j = null;
    try { const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/browser/profiles/${p2.id}?unpin=1`, { method: 'DELETE' }); status = res.status; j = await res.json().catch(() => null); } catch (e) { j = { threw: e && e.message }; }
    const after = k.pinnedBy(p2.id).length;
    ok(before === 1 && status === 503 && !!j && j.code === 'passkeys_unread' && after === 1 && !!k.profile(p2.id), 'MUST 1 (the REAL DELETE route, ?unpin=1): refused BY NAME (503) before any pin is cleared — the conversation keeps its browser and is told nothing went', { before, status, code: j && (j.code || j.threw), after });
    await new Promise((r) => srv.close(r));
    // (3) the housekeeping Forget ROUTE asks the hold before its release and its stop (src/routes/browser-trace.js — pinned: its world is the page's)
    const rt = fs.readFileSync(new URL('../src/routes/browser-trace.js', import.meta.url), 'utf8');
    const iHold = rt.indexOf('ctx.keeper.passkeyHeldNow()'), iRel = rt.indexOf('released = await ctx.releaseProfile(req.params.id)');
    ok(iHold > 0 && iRel > iHold, 'MUST 1 (the housekeeping Forget route): the hold is asked BEFORE «release every lease + stop the browser» — nothing is released or stopped for a removal that cannot happen');
    held = null; k.shutdown?.();
  }
  // ── r3632 (shoulds): the panel's label with no count, the dialog's damaged line, the agent's cancel left out of the hold ──
  {
    const PM = await import('../src/lib/browser-panel-model.js');
    const lab = (n) => { const w = { t: (k, o) => (o ? String(k).replace(/\{(\w+)\}/g, (m0, q) => String(o[q])) : k) }; const m = PM.rowMenu({ id: 'bp-1', state: 'idle' }, { passkeys: n, w }).find((x) => x.id === 'passkeys'); return m ? m.label : null; };
    ok(lab(null) === 'Passkeys…' && lab(0) === 'Passkeys (0)…' && lab(3) === 'Passkeys (3)…', 'the panel\'s menu: a held store\'s count is UNKNOWN («Passkeys…»), never «Passkeys (0)…»', { held: lab(null), zero: lab(0), three: lab(3) });
    const vsrc = fs.readFileSync(new URL('../src/lib/browser-passkeys-view.js', import.meta.url), 'utf8');
    ok(/list\.damaged && list\.damaged\.copy/.test(vsrc) && /techFold\(\[t\('Its damaged bytes are kept beside it as: \{name\}'/.test(vsrc), 'the passkeys dialog draws the torn lift\'s DAMAGED mark in place (pinned), the copy\'s base name in its fold — after a restart too');
    const rsrc = fs.readFileSync(new URL('../src/routes/browser.js', import.meta.url), 'utf8');
    ok(rsrc.includes("if (L && L.held && action !== 'status' && action !== 'cancel') return res.status(503)") && rsrc.includes("if (action === 'status') return res.json(passkeyStatusReply(v, L));"), 'the agent\'s route: status answers through passkeyStatusReply (the leg\'s function), and cancel is not refused by the hold (it writes nothing; the open ceremony\'s own text sends the agent to it)');
  }
  // ── (e) THE PRODUCTION NAMES: the wiring builds the store through the same module, and wires the hold to the keeper and the digest ──
  {
    const wsrc = fs.readFileSync(new URL('../src/server/mounts-plugins-wiring.js', import.meta.url), 'utf8');
    ok(wsrc.includes("passkeys: require('./browser-passkey-file.js').passkeyFileStore({ dataDir: path.join(rootDir, 'data') }),")
      && wsrc.includes("browserKeeper.setPasskeyHeld?.(() => (typeof browserDialogs.passkeysHeld === 'function' ? browserDialogs.passkeysHeld() : null));")
      && wsrc.includes("return c === null ? { passkeyCounts: null, passkeysHeld: true } :"),
      '(e) THE PRODUCTION NAMES: the wiring builds the store with passkeyFileStore (the object these legs build), asks the watch\'s passkeysHeld before a profile\'s removal, and its digest says a held count is unknown');
    const dsrc = fs.readFileSync(new URL('../src/server/browser-dialogs.js', import.meta.url), 'utf8');
    const cdp = /    if \(pks\) pkRead\(\);[^\n]*\n    if \(pkHeld\(\)\) \{ if \(person\) return pkCtl\(w, e, rec, 'release'\);[^\n]*rec\.why = 'passkeys_unread';[^\n]*await pkCtl\(w, e, rec, 'refuse'\);/.test(dsrc)
      && dsrc.indexOf("    if (pkHeld()) { if (person) return pkCtl(w, e, rec, 'release');") < dsrc.indexOf("    if (!e.pk.auth && !person) return pkCtl(w, e, rec, 'release');");
    ok(cdp, '(a)/(b) THE CHROME ROAD (pinned; its ceremonies are the heavy suites\') — the gate reads the store FIRST and, held, refuses an agent\'s ceremony before any authenticator is paired or loaded (the person\'s own goes to Chrome\'s own window)');
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
