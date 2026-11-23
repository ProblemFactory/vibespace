#!/usr/bin/env node
// test-browser-passkey-held — data/browser-passkeys.json UNDER THE STORE-READ LAW (主开发 r3261; lane bl-machines-b's census of the
// stores, «37 more stores judged», item 1). FAST, in-process: the REAL dialog watch module (src/server/browser-dialogs.js, the
// store's ONE writer) over the PRODUCTION wiring of the store (src/server/browser-passkey-file.js once it exists; the release's own
// wiring copied verbatim before), a scratch data folder, MADE-UP passkeys built at run time (never a literal of sealed bytes), the
// refusal PLACED on the read (a store that does not parse; one this process may not read — said, not judged, where a run reads 0000).
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
const placements = [
  { name: 'a passkey store that does not parse', slug: 'torn', torn: true, place: (f, good) => fs.writeFileSync(f, good.slice(0, Math.floor(good.length / 2))), holds: () => true },
  { name: 'a passkey store this process may not read', slug: 'mode', torn: false, place: (f) => fs.chmodSync(f, 0o000), holds: (f) => { try { fs.readFileSync(f); return false; } catch (e) { return e.code === 'EACCES'; } } },
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
  if (!pl.holds(st0.file)) { fs.chmodSync(st0.file, 0o600); console.log(`  (${pl.name}: this run reads a mode-0000 file — SAID, not judged)`); continue; }
  const s0 = fs.statSync(st0.file), bytes0 = pl.torn ? fs.readFileSync(st0.file) : null;
  const d = Dm.create({ passkeys: storeOf(dataDir), log: quiet });
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
  let dropped = null; try { dropped = d.dropPasskeys(PID); } catch (e) { dropped = { code: e && e.code }; }
  const s1 = fs.statSync(st0.file);
  const same = s1.ino === s0.ino && (s1.mode & 0o777) === (s0.mode & 0o777) && (!bytes0 || fs.readFileSync(st0.file).equals(bytes0));
  ok(same, `${pl.name}: after every press (the switch, a removal, a policy, a profile's removal) the store is NEVER written over — the same file, its bytes and mode`, { ino: [s0.ino, s1.ino], mode: [(s0.mode & 0o777).toString(8), (s1.mode & 0o777).toString(8)], dropped });
  if (!pl.torn) {
    fs.chmodSync(st0.file, 0o600);   // the store reads again
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
        try { fs.chmodSync(st.file, 0o600); } catch { }
        fs.writeFileSync(st.file, good, { mode: 0o600 }); pl.place(st.file, good);
        if (!pl.holds(st.file)) return null;
        const k = await startFakeKernel({ firstUrl: O + '/' });
        const w = Dm.create({ keeper: { cdpEndpointFor: async () => ({ ok: true, url: k.wsUrl }), onLease: () => () => {} }, log: quiet, enableTimeoutMs: 300, promptAskMs: 60, passkeyOrphanMs: 150,
          holdersOf: () => [{ browserKey: 'bk-1', sessionId: 's1' }], leaseCountOf: () => 1, labelOf: () => 'Work', passkeys: PF.passkeyFileStore({ dataDir }), takeoverOf: () => false,
          forYou: { add: () => 'fy-1', resolve() {}, ended() {} }, vaultUse: () => ({ receipt: 'vr-000000000001' }) });
        await w.arm('bp-1');
        return { k, w, s0: fs.statSync(st.file), b0: pl.torn ? fs.readFileSync(st.file) : null, close: async () => { w.shutdown(); await k.close(); } };
      };
      const rowsNow = () => { try { return PS.normalizeStore(JSON.parse(fs.readFileSync(st.file, 'utf8'))).profiles['bp-1']?.rows?.length ?? 0; } catch { return null; } };
      const untouched = (x) => { const s1 = fs.statSync(st.file); return pl.torn ? (rowsNow() === null || rowsNow() === 0) /* torn: still the torn bytes, or lifted EMPTY — never a key that landed */ : s1.ino === x.s0.ino && (s1.mode & 0o777) === (x.s0.mode & 0o777); };
      let x = await world();
      if (!x) { console.log(`  (${pl.name}: this run reads a mode-0000 file — SAID, not judged)`); continue; }
      const reg = await x.w.passkeyRegister({ profileId: 'bp-1', browserKey: 'bk-1', sessionId: 's1', rpId: 'example.test', user: 'alice' });
      ok(reg.ok === false && reg.code === 'passkeys_unread' && /could not be read/.test(reg.error) && !/no passkey for/i.test(reg.error), `${pl.name}: (a) an agent's registration is refused BY NAME before any card or ceremony — the hold, never «no passkey»`, reg);
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
    let err = null; try { k.removeProfile(p.id); } catch (e) { err = e; }
    ok(!!err && err.code === 'passkeys_unread' && /could not be read/.test(err.message) && !!k.profile(p.id), '(d) while the passkey store is held a profile\'s removal is refused BY NAME before anything moves — its passkeys are never «dropped» over an unread store', err && { code: err.code, message: String(err.message).slice(0, 160) });
    held = null;
    let gone = null; try { gone = k.removeProfile(p.id); } catch (e) { gone = { threw: e && e.code }; }
    ok(!!gone && !gone.threw && !k.profile(p.id), '…and once the store reads, the removal goes as before', gone && (gone.threw || 'removed'));
    k.shutdown?.();
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
