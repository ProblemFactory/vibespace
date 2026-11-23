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
//   ④ (r3279 (1): r3188 (i) withdrawn) THE OWN ID ASKED WHILE HELD, as the release did: a sign-in with no own id and a held memo —
//      the pass asks the vendor ONCE (a counted stand-in, never again once it answered); on a WATCHED conversation (an agent's wake,
//      the engine's own onFresh with a counted delivery)
//      the person's own send then wakes nobody, while another's message wakes the watcher once. RED: the cure's guard (no ask while
//      held: the id unknown for the whole hold, the own send a billed wake nobody typed).
//   ⑥ (r3279 (5)) THE ENGINE's PRODUCTION DEPS hand the adapter the memo's four names (read, write, held, onLift), live: held() true
//      under the placed refusal, onLift told at the lift. RED: a deps line without held and onLift.
//   ⑦ (r3279 (5)) THE WEBHOOK ROUTE ITSELF: a caller made while the account's memo is held — the file byte for byte meanwhile, the
//      caller's name merged in at the lift beside the file's. RED: the route's read-then-write (the name lost).
//   ⑤ THE SETTLE: a pass of an account whose adapter states no own id (the memo is how it is known) while its memo is held indexes
//      the own messages as nobody's; at the lift the rows are settled once — the authors stamped with the own id, the read mark at
//      the newest own message, its count derived again. RED: no settle (left wrong).
//   ⑤b (r3279 (2)) A LIFT WITH NO OWN ID IN THE FILE: the noted rows are KEPT, and settled at the next pass that knows the id (the
//      adapter names it). RED: a settle that drops them when no id is known (the read mark left behind the own message for good).
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
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
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
    ok(!rw.merged && rw.lifted, `② RED CONTROL: a read-modify-write that does not wait while held — the memo lifted (${rw.lifted}) and the caller's name is lost (merged: ${rw.merged}) — the leg above would go red`, rw);
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

// ═══ ④ THE OWN ID ASKED WHILE HELD (r3279 (1)) ═══
console.log('④ a held memo and a sign-in with no own id: the pass asks the vendor once, and the own send is judged as the person\'s own');
const accountsFile = (chan, kind) => fs.writeFileSync(path.join(chan, 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: kind, kind, label: kind, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null }, scan: null }] }));
async function askLeg(EM, tag) {
  const dataDir = tmp(tag), chan = path.join(dataDir, 'channels'), A = 'askme';
  fs.mkdirSync(chan, { recursive: true }); accountsFile(chan, A);
  const file = seedMemo(chan, A, { self: 'u-ada', people: {} });
  let calls = 0, resolved = null;
  // the counted stand-in: a sign-in that never named the own id; the vendor's identity call answers it
  const ASK = (() => { const m = FAKE.makeFakeAdapter({ kind: A, receive: 'poll', sendAs: ['user'] }); const inner = m.create; return { kind: A, caps: m.caps, create(rec, deps) { const impl = inner(rec, deps); impl.selfId = () => resolved; impl.resolveSelf = async () => { calls++; resolved = 'u-ada'; return resolved; }; return impl; } }; })();
  const lift = refuseRead(file);
  const registry = CH.createChannelRegistry(); registry.register(ASK);
  // the wake's door, counted (test-channel-agent-watch's road): a live agent watching one conversation of the account
  const delivered = [];
  const deliver = { deliverToConversation: async (cid, text, o) => { delivered.push({ cid, text, o }); return { ok: true, lane: 'message' }; }, stashFor: () => ({ stored: true }) };
  const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' };
  const e = EM.create({ dataDir, registry, env: {}, broadcast: () => {}, log: quiet, deliver, userTodos: new UserTodoManager({ dataDir }), liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }] });
  let r;
  try {
    for (let k = 0; k < 3; k++) await e.pass(A, { force: true });
    const rec = e.adapterRecords().adapters.find((x) => x.id === A);
    const C = Object.keys(e.store.index.live()).filter((k) => k.startsWith(`${A}/`)).map((k) => k.slice(A.length + 1)).sort()[0];
    const ga = await e.setGrain(A, { kind: 'account' }, { access: [{ principal: AGENT, authority: 'draft' }] });
    const gw = await e.setGrain(A, { kind: 'conversation', convId: C }, { watchers: [{ principal: AGENT, delivery: 'wake' }] });
    const got = e.messages(A, C, { limit: 1 }), r0 = (got.records || got)[0];
    const t0 = Date.now() + 60e3;
    const mk = (vid, who, dt) => ({ ...r0, id: `${r0.id}-${vid}`, vendorId: vid, at: t0 + dt, author: { id: who, name: who, isSelf: false, isBot: false }, text: `a new line (${vid})`, replyTo: null, root: null, threadKey: null });
    await e.onFresh(rec, C, [mk('own-1', 'u-ada', 0)], { origin: 'test' }); await e.settleWakes();
    const ownWakes = delivered.length;
    await e.onFresh(rec, C, [mk('other-1', 'u-brook', 1000)], { origin: 'test' }); await e.settleWakes();
    r = { calls, held: e.store.peopleHeld(A), watched: !!(ga && ga.ok && gw && gw.ok), ownWakes, otherWakes: delivered.length - ownWakes };
  } finally { lift(); try { e.stop(); } catch { } }
  return r;
}
{
  const r = await askLeg(ENG, 'ask');
  ok(r.held && r.calls === 1 && r.watched && r.ownWakes === 0 && r.otherWakes === 1, `④ a held memo (${r.held}) and a sign-in with no own id: three passes asked the vendor ONCE (${r.calls}, never again once it answered); on a watched conversation (${r.watched}) the person's own send woke nobody (${r.ownWakes}) and another's message woke the watcher once (${r.otherWakes})`, r);
  const E = engineSource(REPO);
  const GUARD = "    if (typeof e.adapter.resolveSelf === 'function' && !selfIdOf(rec)) await e.adapter.resolveSelf()";
  await redOf(E, GUARD, async () => {
    const rn = await askLeg(M.load('src/server/channels-engine.js', anchored(E, GUARD, "    if (typeof e.adapter.resolveSelf === 'function' && !selfIdOf(rec) && !selfUnknown(rec)) await e.adapter.resolveSelf()", 'the cure\'s guard: no ask while held'), 'no-ask'), 'ask-red');   // stale-pins: kept (the red control restores the withdrawn guard)
    ok(rn.calls === 0 && rn.ownWakes === 1, `④ RED CONTROL: the cure's guard (no ask while held) — the vendor never asked (${rn.calls}), the person's own send WOKE the watcher (${rn.ownWakes}): a billed wake nobody typed — the leg above would go red`, rn);
  });
}

// ═══ ⑤ THE SETTLE AT THE LIFT (the engine) ═══
console.log('⑤ rows indexed while the own id was unknown are settled once at the memo\'s lift');
// an account whose adapter states NO own id (a sign-in that never named it — the memo is how it is known): the fake poll adapter
// with its selfId answering nothing, through a registry of its own (test-channels-engine's mkMod road)
const express = require('express');
const http = require('node:http');
const WEBHOOK = require(path.join(REPO, 'src/routes/webhook.js'));
const WSRC = fs.readFileSync(path.join(REPO, 'src/routes/webhook.js'), 'utf8');
const QUIET = (() => { const m = FAKE.makeFakeAdapter({ kind: 'quiet', receive: 'poll', sendAs: ['user'] }); const inner = m.create; return { kind: 'quiet', caps: m.caps, create(rec, deps) { const impl = inner(rec, deps); impl.selfId = () => null; return impl; } }; })();
async function settleLeg(EM, tag, waitMs = 3000) {
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
    for (const until = Date.now() + waitMs; ;) { en = key ? e.store.index.live()[key] : null; if ((en && en.authors.some((x) => x.id === 'u-ada' && x.isSelf)) || Date.now() >= until) break; await turns(30); }
    const all = convId ? (e.store.readTail(A, convId, { limit: 5000 }) || []) : [];
    const expUnread = all.filter((x) => x && Number(x.at) > own && !(x.author && x.author.id === 'u-ada') && x.kind !== 'system' && x.kind !== 'draft').length;
    r = { key, own, before, heldBefore, lifted, heldAfter: typeof e.store.peopleHeld === 'function' ? e.store.peopleHeld(A) : null, self: e.store.peopleRead(A).self, authors: en ? JSON.stringify(en.authors).slice(0, 300) : null, warns: warns.filter((l) => /people|settle|own id/i.test(l)).slice(0, 6), stamped: !!(en && en.authors.some((x) => x.id === 'u-ada' && x.isSelf)), readAt: en ? Number(en.readAt) || 0 : 0, unread: en ? Number(en.unread) || 0 : -1, expUnread };
  } finally { lift(); try { e.stop(); } catch { } }
  return r;
}
{
  const r = await settleLeg(ENG, 'settle');
  ok(r.key && r.own > 0 && r.before && !r.before.self && r.before.readAt < r.own && r.stamped && r.readAt === r.own && r.unread === r.expUnread, `⑤ a pass while the memo was held indexed «u-ada» (the own id in the file) as nobody's (stamped: ${r.before && r.before.self}, read mark ${r.before && r.before.readAt} < the newest own message ${r.own}); at the lift the row was settled once — stamped (${r.stamped}), the read mark AT the newest own message (${r.readAt === r.own}), its count derived again past it (${r.unread} = ${r.expUnread})`, r);
  const SET = "      if (store.onPeopleLift) { const off = store.onPeopleLift(rec.id, () => {";
  await redOf(engineSource(REPO), SET, async () => {
    const rn = await settleLeg(M.load('src/server/channels-engine.js', anchored(engineSource(REPO), SET, "      if (false) { const off = store.onPeopleLift(rec.id, () => {", 'no settle at the lift'), 'no-settle'), 'settle-red', 300);   // its mutant settles nothing at all: a short bound
    ok(rn.key && !rn.stamped, `⑤ RED CONTROL: no settle at the lift — the rows indexed while the own id was unknown stay wrong (stamped: ${rn.stamped}) — the leg above would go red`, rn);
  });
}

// ═══ ⑥ THE ENGINE's PRODUCTION DEPS (r3279 (5)) ═══
console.log('⑥ the engine hands the adapter the memo\'s four names, live: held under the placed refusal, onLift told at the lift');
async function depsLeg(EM, tag) {
  const dataDir = tmp(tag), chan = path.join(dataDir, 'channels'), A = 'capture';
  fs.mkdirSync(chan, { recursive: true }); accountsFile(chan, A);
  const file = seedMemo(chan, A, { self: 'u-ada', people: {} });
  let got = null;
  const CAP = (() => { const m = FAKE.makeFakeAdapter({ kind: A, receive: 'poll', sendAs: ['user'] }); const inner = m.create; return { kind: A, caps: m.caps, create(rec, deps) { got = deps && deps.people; return inner(rec, deps); } }; })();
  const lift = refuseRead(file);
  const registry = CH.createChannelRegistry(); registry.register(CAP);
  const e = EM.create({ dataDir, registry, env: {}, broadcast: () => {}, log: quiet });
  let r;
  try {
    await e.pass(A, { force: true });
    const names = got ? ['read', 'write', 'held', 'onLift'].filter((k) => typeof got[k] === 'function') : [];
    let told = 0;
    const heldNow = !!(got && typeof got.held === 'function' && got.held());
    if (got && typeof got.onLift === 'function') got.onLift(() => { told++; });
    lift();
    await SRH.readAgainOf('people.json');
    r = { names, heldNow, told, heldAfter: !!(got && typeof got.held === 'function' && got.held()) };
  } finally { lift(); try { e.stop(); } catch { } }
  return r;
}
{
  const r = await depsLeg(ENG, 'deps');
  ok(r.names.length === 4 && r.heldNow && r.told === 1 && !r.heldAfter, `⑥ the engine's production deps hand the adapter ${r.names.join(', ')}: held() true under the placed refusal (${r.heldNow}), onLift told once at the lift (${r.told}), held() false after it`, r);
  const DEPS = "held: () => !!(store.peopleHeld && store.peopleHeld(rec.id)), onLift: (fn) => {";
  const E = engineSource(REPO);
  await redOf(E, DEPS, async () => {
    const cut = E.replace(/ held: \(\) => !!\(store\.peopleHeld && store\.peopleHeld\(rec\.id\)\), onLift: \(fn\) => \{[^}]*\}[^}]*\} \}/, ' }');
    const rn = await depsLeg(M.load('src/server/channels-engine.js', cut, 'deps-cut'), 'deps-red');
    ok(rn.names.length === 2 && !rn.heldNow, `⑥ RED CONTROL: a deps line without held and onLift — the adapter is handed ${rn.names.join(', ')} only, its copy never told of the hold or its lift — the leg above would go red`, rn);
  });
}

// ═══ ⑦ THE WEBHOOK ROUTE ITSELF (r3279 (5)) ═══
console.log('⑦ the webhook route: a caller made while the memo is held — nothing written meanwhile, its name merged in at the lift');
async function routeLeg(RM, tag) {
  const dataDir = tmp(tag), chan = path.join(dataDir, 'channels');
  fs.mkdirSync(chan, { recursive: true });
  const id = RM.ADAPTER_ID;
  const file = seedMemo(chan, id, { self: null, people: { 'caller:old': { name: 'An earlier caller', at: 1 } } });
  const bytes = R0.call(fs, file, 'utf8');
  const lift = refuseRead(file);
  const e = ENG.create({ dataDir, env: {}, httpInbound: true, broadcast: () => {}, log: quiet, serverSetting: () => undefined });
  RM.setup({ getEngine: () => e, dataDir, serverSetting: () => undefined });
  const app = express(); app.use(RM.router);
  const srv = http.createServer(app);
  await new Promise((z) => srv.listen(0, '127.0.0.1', z));
  const call = (method, p, body) => new Promise((resolve) => {
    const b = body ? JSON.stringify(body) : null;
    const q = http.request({ host: '127.0.0.1', port: srv.address().port, method, path: p, headers: { 'Sec-Fetch-Site': 'same-origin', ...(b ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}) } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, j }); }); });
    if (b) q.write(b); q.end();
  });
  let r;
  try {
    const mk = await call('POST', '/api/channels/webhook/paths', { slug: 'ci', title: 'CI', textPath: 'text', senderKey: 'who' });
    const c1 = await call('POST', '/api/channels/webhook/paths/ci/callers', { name: 'deploy-bot', auth: 'bearer', delivery: { mode: 'poll' } });
    await turns(30);
    const whileHeld = R0.call(fs, file, 'utf8');
    lift();
    const lifted = await SRH.readAgainOf('people.json');
    const mem = Object.values((e.store.peopleRead(id) || {}).people || {}).some((x) => x && x.name === 'deploy-bot');   // the lift merged it in memory (synchronously)
    let disk = null;
    for (let k = 0; k < (mem ? 60 : 1); k++) { try { disk = JSON.parse(R0.call(fs, file, 'utf8')); } catch { disk = null; } if (disk && disk.people && Object.values(disk.people).some((x) => x && x.name === 'deploy-bot')) break; await turns(30); }   // the merged write rides the store writer
    const names = disk && disk.people ? Object.values(disk.people).map((x) => x && x.name) : [];
    r = { made: mk.status === 200 && c1.status === 200, same: whileHeld === bytes, lifted, mem, kept: names.includes('An earlier caller'), merged: names.includes('deploy-bot') };
  } finally { lift(); try { srv.close(); } catch { } try { e.stop(); } catch { } }
  return r;
}
{
  const r = await routeLeg(WEBHOOK, 'route');
  ok(r.made && r.same && r.lifted && r.mem && r.kept && r.merged, `⑦ the webhook route made a caller while the account's memo was held (${r.made}): the file byte for byte meanwhile (${r.same}); at the lift (${r.lifted}) the caller's name merged in (${r.merged}) beside the file's (${r.kept})`, r);
  const PU = '  e.store.peopleUpdate(ADAPTER_ID, put);';
  await redOf(WSRC, PU, async () => {
    const rn = await routeLeg(M.load('src/routes/webhook.js', anchored(WSRC, PU, '  { const people = e.store.peopleRead(ADAPTER_ID); e.store.peopleWrite(ADAPTER_ID, put({ self: people.self, people: { ...people.people } })); }', 'the route\'s read-then-write'), 'route-rmw'), 'route-red');
    ok(rn.lifted && !rn.mem && !rn.merged, `⑦ RED CONTROL: the route's read-then-write — refused while held, nothing waits: at the lift the caller's name is lost (merged: ${rn.merged}) — the leg above would go red`, rn);
  });
}

// ═══ ⑤b A LIFT WITH NO OWN ID (r3279 (2)) ═══
console.log('⑤b a lift whose file names no own id: the noted rows kept, settled at the next pass that knows it');
let knownB = null;
const LATER = (() => { const m = FAKE.makeFakeAdapter({ kind: 'later', receive: 'poll', sendAs: ['user'] }); const inner = m.create; return { kind: 'later', caps: m.caps, create(rec, deps) { const impl = inner(rec, deps); impl.selfId = () => knownB; return impl; } }; })();
async function keptLeg(EM, tag, waitMs = 1800) {
  const dataDir = tmp(tag), chan = path.join(dataDir, 'channels'), A = 'later';
  fs.mkdirSync(chan, { recursive: true }); accountsFile(chan, A);
  const file = seedMemo(chan, A, { self: null, people: {} });
  knownB = null;
  const lift = refuseRead(file);
  const registry = CH.createChannelRegistry(); registry.register(LATER);
  const e = EM.create({ dataDir, registry, env: {}, broadcast: () => {}, log: quiet });
  let r;
  try {
    await e.pass(A, { force: true });
    const live = e.store.index.live();
    const key = Object.keys(live).find((k) => k.startsWith(`${A}/`) && Array.isArray(live[k].authors) && live[k].authors.some((x) => x && x.id === 'u-ada'));
    const convId = key ? key.slice(A.length + 1) : null;
    const recs = convId ? (e.store.readTail(A, convId, { limit: 200 }) || []) : [];
    const own = recs.filter((x) => x && x.author && x.author.id === 'u-ada').reduce((t, x) => Math.max(t, Number(x.at) || 0), 0);
    lift();
    const lifted = await SRH.readAgainOf('people.json');
    await turns(60);
    const atLift = key ? Number(e.store.index.live()[key].readAt) || 0 : 0;   // no own id anywhere yet: nothing to settle with
    knownB = 'u-ada';   // the adapter names the own id (a later sign-in's answer)
    await e.pass(A, { force: true });
    let readAt = 0;
    for (const until = Date.now() + waitMs; ;) { readAt = key ? Number(e.store.index.live()[key].readAt) || 0 : 0; if (readAt === own || Date.now() >= until) break; await turns(30); }
    r = { key, own, lifted, atLift, readAt };
  } finally { lift(); knownB = null; try { e.stop(); } catch { } }
  return r;
}
{
  const r = await keptLeg(ENG, 'kept');
  ok(r.key && r.own > 0 && r.lifted && r.atLift < r.own && r.readAt === r.own, `⑤b the lift read a file naming no own id: nothing settled then (the read mark ${r.atLift} behind the newest own message ${r.own}), the noted rows KEPT — the next pass that knew the id settled them (the read mark at it: ${r.readAt === r.own})`, r);
  const KEEP = '    if (!self) return 0;   // r3279 (2): no own id yet — the noted rows are KEPT, settled when a pass learns it';
  await redOf(engineSource(REPO), KEEP, async () => {
    const rn = await keptLeg(M.load('src/server/channels-engine.js', anchored(engineSource(REPO), KEEP, '    if (!self) { selfSettle.delete(adapterId); return 0; }', 'a settle that drops the rows when no id is known (the commit\'s)'), 'drop-noted'), 'kept-red', 300);   // its mutant has no rows left to settle: a short bound
    ok(rn.key && rn.readAt < rn.own, `⑤b RED CONTROL: a settle that drops the noted rows when no id is known — the next pass knew the id and the read mark stayed behind the own message (${rn.readAt} < ${rn.own}) — the leg above would go red`, rn);
  });
}

fs.rmSync(ROOT, { recursive: true, force: true });
report();
