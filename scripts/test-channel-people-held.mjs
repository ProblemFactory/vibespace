#!/usr/bin/env node
// test-channel-people-held — B-f276 family, the per-account channel files (主开发 r3183 / r3188): channels/<account>/people.json UNDER
// THE STORE-READ LAW (src/store-read-hold.js). The memo holds the account's OWN ID and the names it learned; the release read ANY
// failure of its read as «nothing stored» and the next save wrote over the file. Every unreadable file here is made by a PLACED
// refusal of the read call (EIO on readFileSync at the start and on fs.promises.readFile at the read again); made-up values only.
//   ① THE HOLD: the read held, the own id UNKNOWN (null, peopleHeld), a write refused and nothing written over the file, said once.
//      RED: the save that does not ask writable (the release's: the write lands over the file).
//   ② THE LIFT: read again, the file's memo is back; a read-modify-write made while held (the webhook's caller names) WAITED and
//      lands merged — the file's other entries kept. RED: an update that does not wait (it is lost).
//   ③ THE LARK ADAPTER's COPY: while held its save writes nothing (a resolveSelf forced flush included — its save asks held() first,
//      and the store's door refuses too); at the lift it takes the file's memo in, merged with what it learned meanwhile — the own id
//      the vendor named since stands, the file's names kept; with no id named since, the file's own id stands. RED: a copy with no
//      merge at the lift (what the vendor named meanwhile never lands).
//   ④ NO resolveSelf while held: the pass asks the vendor for the own id only when the memo is not held. RED: the guard removed.
//   ⑤ THE SETTLE: a pass of an account whose adapter states no own id (the memo is how it is known) while its memo is held indexes
//      the own messages as nobody's; at the lift the rows are settled once — the authors stamped with the own id, the read mark at
//      the newest own message. RED: no settle (left wrong).
// Run: node scripts/test-channel-people-held.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order: the first import after node's own
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const CS = require(path.join(REPO, 'src/channel-store.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));
const SRH = require(path.join(REPO, 'src/store-read-hold.js'));
const LARK = require(path.join(REPO, 'src/channels/lark.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const FAKE = require(path.join(REPO, 'src/channels/fake.js'));
const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
const LSRC = fs.readFileSync(path.join(REPO, 'src/channels/lark.js'), 'utf8');
const M = mutantCopies('people-held', REPO);
const { ok, report } = checker();
const quiet = { log() {}, info() {}, warn() {}, error() {} };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'people-held-'));
let n = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${n++}`); fs.mkdirSync(d, { recursive: true }); return d; };
const turns = (ms) => new Promise((z) => setTimeout(z, ms));
const ACC = 'lark';
const MEMO = { self: 'ou_file_self', people: { ou_one: { name: 'One', at: 1 } } };
const seedMemo = (dir, id = ACC, memo = MEMO) => { fs.mkdirSync(path.join(dir, id), { recursive: true }); const f = path.join(dir, id, 'people.json'); fs.writeFileSync(f, JSON.stringify(memo)); return f; };
// THE PLACED REFUSAL of the read call: EIO for one file, on the start's synchronous read and the hold's read again
const R0 = fs.readFileSync, P0 = fs.promises.readFile;
function refuseRead(file) {
  const eio = () => Object.assign(new Error('EIO: placed'), { code: 'EIO' });
  fs.readFileSync = function (q, ...x) { if (path.resolve(String(q)) === file) throw eio(); return R0.call(this, q, ...x); };
  fs.promises.readFile = async function (q, ...x) { if (path.resolve(String(q)) === file) throw eio(); return P0.call(this, q, ...x); };
  return () => { fs.readFileSync = R0; fs.promises.readFile = P0; };
}
const openStore = (mod, dir, warns) => { const w = SW.create({ log: quiet }); return { w, st: mod.createChannelStore({ dir, log: { log() {}, info() {}, warn: (x) => warns.push(String(x)), error() {} }, writer: w }) }; };
// THE BASE (the release's store) has none of the cure's doors: each leg reads them if they are there, so the base reddens by its law,
// never by a missing name; a red control whose anchor the tree does not hold is red by name
const has = (o, k) => typeof o.st[k] === 'function';
const redOf = (src, from, run) => (src.includes(from) ? run() : (ok(false, `RED CONTROL: its anchor is not in this tree (${from.slice(0, 60)}…)`), null));
const shut = (o) => { try { o.st.close(); } catch { } try { o.w.stop(); } catch { } };

// ═══ ① + ② THE HOLD AND ITS LIFT (the store) ═══
console.log('① the people memo held: its own id unknown, nothing written over it · ② its lift: back, a waiting update merged');
async function holdLeg(mod, tag) {
  const dir = tmp(tag), warns = [], file = seedMemo(dir), bytes = R0.call(fs, file, 'utf8');
  const lift = refuseRead(file);
  const o = openStore(mod, dir, warns);
  let r;
  try {
    const m = o.st.peopleRead(ACC);
    const held = has(o, 'peopleHeld') ? o.st.peopleHeld(ACC) : false;
    const w1 = o.st.peopleWrite(ACC, { self: null, people: { ou_two: { name: 'Two', at: 2 } } });
    o.st.peopleWrite(ACC, { self: null, people: {} });
    const put = (p) => { p.people['caller:c1'] = { name: 'A caller', at: 3 }; return p; };
    const queued = has(o, 'peopleUpdate') ? o.st.peopleUpdate(ACC, put) : (o.st.peopleWrite(ACC, put({ self: m.self, people: { ...m.people } })), true);   // the webhook's road (the release's: read, then write)
    await o.w.durable(file);
    const whileHeld = R0.call(fs, file, 'utf8');
    lift();
    const lifted = await SRH.readAgainOf('people.json');
    await o.w.durable(file); await turns(30); await o.w.durable(file);
    const after = o.st.peopleRead(ACC);
    let disk = null; try { disk = JSON.parse(R0.call(fs, file, 'utf8')); } catch { }
    r = { unknown: m.self === null, held, refused: w1 === null, same: whileHeld === bytes, said: warns.filter((l) => /people\.json could not be read/.test(l)).length, refusedSaid: warns.filter((l) => /was refused: the file could not be read/.test(l)).length, queued, lifted, back: after.self === MEMO.self && !(has(o, 'peopleHeld') && o.st.peopleHeld(ACC)), merged: !!(disk && disk.self === MEMO.self && disk.people && disk.people.ou_one && disk.people['caller:c1']) };
  } finally { lift(); shut(o); }
  return r;
}
{
  const r = await holdLeg(CS, 'hold');
  ok(r.unknown && r.held && r.refused && r.same && r.said === 1 && r.refusedSaid === 1, `① the read refused (EIO placed): HELD (${r.held}), its own id UNKNOWN (${r.unknown}); two writes refused and the file byte for byte (${r.same}); said once (${r.said}), the refused save said once (${r.refusedSaid})`, r);
  ok(r.queued === false && r.lifted && r.back && r.merged, `② read again: lifted (${r.lifted}), the file's own id back (${r.back}); the update made while held WAITED (${r.queued === false}) and landed merged — the file's names and the caller's (${r.merged})`, r);
  const ASK = "    if (H && !H.writable(`the people memo of ${adapterId}`)) return null;";
  await redOf(SRC, ASK, async () => {
    const rn = await holdLeg(M.load('src/channel-store.js', anchored(SRC, ASK, '', 'the save that does not ask writable (the release\'s)'), 'people-save'), 'hold-red');
    ok(!rn.same, `① RED CONTROL: a save that does not ask writable — the write lands over the unread file (the file byte for byte: ${rn.same}) — the leg above would go red`, rn);
  });
  const WAIT = "    if (peopleHeld(adapterId)) { const q = peopleQueued.get(adapterId) || []; q.push(fn); peopleQueued.set(adapterId, q); return false; }\n";
  await redOf(SRC, WAIT, async () => {
    const rw = await holdLeg(M.load('src/channel-store.js', anchored(SRC, WAIT, '', 'an update that does not wait'), 'people-nowait'), 'hold-nowait-red');
    ok(!rw.merged, `② RED CONTROL: a read-modify-write that does not wait while held — the caller's name is lost (merged: ${rw.merged}) — the leg above would go red`, rw);
  });
}

// ═══ ③ THE LARK ADAPTER's COPY ═══
console.log('③ the Lark adapter\'s copy: no write while held, the file\'s memo merged in at the lift');
const CRED = { source: 'user', values: { appId: 'cli_fixture0001', appSecret: 'fixture-secret-0001' }, missing: [], why: null };
const tokens = (token) => ({ read: () => ({ token, why: null }), write: async () => {}, clear: async () => {} });
const jsonRes = (body) => ({ ok: true, status: 200, headers: new Headers({}), json: async () => body, text: async () => JSON.stringify(body) });
async function larkLeg(LM, tag, { stateSelf = true } = {}) {
  const dir = tmp(tag), warns = [], file = seedMemo(dir), bytes = R0.call(fs, file, 'utf8');
  const lift = refuseRead(file);
  const o = openStore(CS, dir, warns);
  let r;
  try {
    const people = { read: () => o.st.peopleRead(ACC), write: (m) => o.st.peopleWrite(ACC, m), held: () => (has(o, 'peopleHeld') ? o.st.peopleHeld(ACC) : false), onLift: (fn) => (has(o, 'onPeopleLift') ? o.st.onPeopleLift(ACC, fn) : () => { }) };
    const fetchFn = async (url) => (/user_info/.test(String(url)) ? jsonRes({ code: 0, data: { open_id: 'ou_vendor_self' } }) : jsonRes({ code: 0, data: {} }));
    const a = LM.create({ id: ACC, options: {} }, { resolveIntegration: () => CRED, fetch: fetchFn, now: () => Date.now(), tokens: tokens({ access_token: 'u-fixture-user-token', expiresAt: Date.now() + 3600e3 }), log: quiet, people });
    if (stateSelf) await a.resolveSelf();   // the vendor names the own id meanwhile (its forced flush while held)
    await o.w.durable(file);
    const whileHeld = R0.call(fs, file, 'utf8');
    lift();
    await SRH.readAgainOf('people.json');
    await turns(30); await o.w.durable(file); await turns(30); await o.w.durable(file);
    let disk = null; try { disk = JSON.parse(R0.call(fs, file, 'utf8')); } catch { }
    r = { same: whileHeld === bytes, self: disk && disk.self, kept: !!(disk && disk.people && disk.people.ou_one) };
  } finally { lift(); shut(o); }
  return r;
}
{
  const r = await larkLeg(LARK, 'lark');
  ok(r.same && r.self === 'ou_vendor_self' && r.kept, `③ the adapter's copy while held: nothing written (the file byte for byte: ${r.same}, its own resolveSelf's forced flush included); at the lift merged — the own id the vendor named since stands (${r.self}), the file's names kept (${r.kept})`, r);
  const r2 = await larkLeg(LARK, 'lark-file-self', { stateSelf: false });
  ok(r2.same && r2.self === MEMO.self && r2.kept, `③ …and with no own id named since, the file's own id stands at the lift (${r2.self}), its names kept (${r2.kept})`, r2);
  const MERGE = "  if (peopleStore && typeof peopleStore.onLift === 'function') {";
  await redOf(LSRC, MERGE, async () => {
    const rr = await larkLeg(M.load('src/channels/lark.js', anchored(LSRC, MERGE, '  if (false) {', 'a copy with no merge at the lift'), 'lark-no-merge'), 'lark-red');
    ok(rr.self !== 'ou_vendor_self', `③ RED CONTROL: a copy with no merge at the lift — the own id the vendor named meanwhile never lands (on disk: ${rr.self}) — the leg above would go red`, rr);
  });
}

// ═══ ④ NO resolveSelf WHILE HELD (the pass) ═══
console.log('④ the pass asks the vendor for the own id only when the people memo is not held');
{
  const E = engineSource(REPO);
  const GUARD = "    if (typeof e.adapter.resolveSelf === 'function' && !selfIdOf(rec) && !selfUnknown(rec)) await e.adapter.resolveSelf()";
  const pin = (src) => src.split(GUARD).length === 2 && /const selfUnknown = \(rec\) => !!\(rec && store\.peopleHeld && store\.peopleHeld\(rec\.id\)\);/.test(src);
  ok(pin(E), '④ the pass calls resolveSelf only while the own id is not known AND the account\'s people memo is not held — never a vendor call nobody pressed at every pass');
  await redOf(E, GUARD, async () => ok(!pin(anchored(E, GUARD, "    if (typeof e.adapter.resolveSelf === 'function' && !selfIdOf(rec)) await e.adapter.resolveSelf()", 'the guard removed')), '④ RED CONTROL: the release\'s guard (own id not known) — the pin above would go red'));   // stale-pins: kept (the red control restores the release's guard)
}

// ═══ ⑤ THE SETTLE AT THE LIFT (the engine) ═══
console.log('⑤ rows indexed while the own id was unknown are settled once at the memo\'s lift');
// an account whose adapter states NO own id (a sign-in that never named it — the memo is how it is known): the fake poll adapter
// with its selfId answering nothing, through a registry of its own (test-channels-engine's mkMod road)
const QUIET = (() => { const m = FAKE.makeFakeAdapter({ kind: 'quiet', receive: 'poll', sendAs: ['user'] }); const inner = m.create; return { kind: 'quiet', caps: m.caps, create(rec, deps) { const impl = inner(rec, deps); impl.selfId = () => null; return impl; } }; })();
async function settleLeg(EM, tag) {
  const dataDir = tmp(tag), chan = path.join(dataDir, 'channels'), A = 'quiet';
  fs.mkdirSync(chan, { recursive: true });
  fs.writeFileSync(path.join(chan, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: A, label: A, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null }] }));
  const file = seedMemo(chan, A, { self: 'u-ada', people: {} });
  const lift = refuseRead(file);
  const warns = [];
  const registry = CH.createChannelRegistry(); registry.register(QUIET);
  const e = EM.create({ dataDir, registry, env: {}, broadcast: () => {}, log: { log() {}, info() {}, warn: (x) => warns.push(String(x).slice(0, 240)), error: (x) => warns.push('E ' + String(x).slice(0, 240)) } });
  let r;
  try {
    await e.pass(A, { force: true });
    const live = e.store.index.live();
    const key = Object.keys(live).find((k) => k.startsWith(`${A}/`) && Array.isArray(live[k].authors) && live[k].authors.some((x) => x && x.id === 'u-ada'));
    const convId = key ? key.slice(A.length + 1) : null;
    const recs = convId ? (e.store.readTail(A, convId, { limit: 200 }) || []) : [];
    const own = recs.filter((x) => x && x.author && x.author.id === 'u-ada').reduce((t, x) => Math.max(t, Number(x.at) || 0), 0);
    const before = key ? { readAt: Number(live[key].readAt) || 0, self: live[key].authors.some((x) => x.id === 'u-ada' && x.isSelf) } : null;
    const heldBefore = typeof e.store.peopleHeld === 'function' ? e.store.peopleHeld(A) : null;
    lift();
    const lifted = await SRH.readAgainOf('people.json');
    let en = null;
    for (let k = 0; k < 100; k++) { en = key ? e.store.index.live()[key] : null; if (en && en.authors.some((x) => x.id === 'u-ada' && x.isSelf)) break; await turns(30); }
    r = { key, own, before, heldBefore, lifted, heldAfter: typeof e.store.peopleHeld === 'function' ? e.store.peopleHeld(A) : null, self: e.store.peopleRead(A).self, authors: en ? JSON.stringify(en.authors).slice(0, 300) : null, warns: warns.filter((l) => /people|settle|own id/i.test(l)).slice(0, 6), stamped: !!(en && en.authors.some((x) => x.id === 'u-ada' && x.isSelf)), readAt: en ? Number(en.readAt) || 0 : 0 };
  } finally { lift(); try { e.stop(); } catch { } }
  return r;
}
{
  const r = await settleLeg(ENG, 'settle');
  ok(r.key && r.own > 0 && r.before && !r.before.self && r.before.readAt < r.own && r.stamped && r.readAt >= r.own, `⑤ a pass while the memo was held indexed «u-ada» (the own id in the file) as nobody's (stamped: ${r.before && r.before.self}, read mark ${r.before && r.before.readAt} < the newest own message ${r.own}); at the lift the row was settled once — stamped (${r.stamped}), the read mark at the newest own message (${r.readAt >= r.own})`, r);
  const SET = "      if (store.onPeopleLift) store.onPeopleLift(rec.id, () => {";
  await redOf(engineSource(REPO), SET, async () => {
    const rn = await settleLeg(M.load('src/server/channels-engine.js', anchored(engineSource(REPO), SET, "      if (false) store.onPeopleLift(rec.id, () => {", 'no settle at the lift'), 'no-settle'), 'settle-red');
    ok(rn.key && !rn.stamped, `⑤ RED CONTROL: no settle at the lift — the rows indexed while the own id was unknown stay wrong (stamped: ${rn.stamped}) — the leg above would go red`, rn);
  });
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
