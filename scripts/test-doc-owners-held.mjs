#!/usr/bin/env node
// data/doc-owners.json UNDER THE STORE-READ LAW (主开发 r3332, lane bl-proposals; the store census's item 6; the file is the owner
// memo of src/server/doc-engine.js — B-b51a / B-b0e3). The release read ANY failure of the memo as empty and the next note (every
// new holder a lookup sees) wrote it over: who owned each document window was lost, and a comment on a stopped owner's window was
// refused `no_owner`. THE FAMILY's LAW (r3019, r3104, r3122, r3168): held, nothing is written over; every writer is refused before
// any side effect; read again off the loop; lifted with no restart; torn bytes kept aside ONCE. A comment while held is told THE HOLD
// by name, never «no owner». The unreadable file is made by a PLACED refusal of the read call (never a mount, never a mode change).
//   H1 unreadable: the comment door, the edit note and the owner look (the page's view) say the hold; nothing is sent; a lookup that
//      notes (a live owner, a new holder) writes nothing over the file; the read again lifts it with no restart: the stopped owner is
//      reached
//   H2 torn bytes: kept aside once (the same bytes, a second start makes no second copy); the memo starts empty; a comment's «no owner»
//      says where the damaged bytes are kept (its base name) — never «restore»
//   H3 control: a missing memo is empty, as before (no hold)
//   H4 the real wiring: the routes (src/routes/doc.js) over the engine as server.js creates it, with the REAL artifact registry
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const DE = require('../src/server/doc-engine.js');
const CD = require('../src/server/conversation-deliver.js');
const AR = require('../src/server/artifact-registry.js');
const HOLD = require('../src/store-read-hold.js');
const SW = require('../src/store-writer.js');   // B-574d (r4725): the memo is the store writer's — a write lands at its landing, not at the call
const { registerDocRoutes } = require('../src/routes/doc.js');
const quiet = { log() { }, warn() { } };
const CID = '5b0c2e8a-7d1f-4c3e-9a61-0d2f8b7c6e15';
const DOC = '/w/BRIEF.md', KEY = 'local\u0001' + DOC;
const MEMO = JSON.stringify({ s: { w1: { cid: CID, at: 1 } }, d: {}, h: { [KEY]: { at: 1, c: { [CID]: 1 } } } });   // the stopped window w1's conversation, seen holding the file
const items = (n) => Array.from({ length: n }, (_, i) => ({ quote: 'line ' + (i + 1), note: 'n ' + (i + 1) }));
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/** THE PLACED REFUSAL: the memo's read calls (the start's sync read, the hold's read again) refuse that one file with EIO */
function placeRefusal(file) {
  const rs = fs.readFileSync, pr = fs.promises.readFile, hit = (p) => typeof p === 'string' && path.resolve(p) === file;
  const refusal = () => Object.assign(new Error('a placed refusal of the read call'), { code: 'EIO' });
  fs.readFileSync = function (p, ...a) { if (hit(p)) throw refusal(); return rs.call(this, p, ...a); };
  fs.promises.readFile = function (p, ...a) { if (hit(p)) return Promise.reject(refusal()); return pr.call(this, p, ...a); };
  return () => { fs.readFileSync = rs; fs.promises.readFile = pr; };
}
let worlds = 0;
function world({ memo = MEMO, refuse = false, real = false } = {}) {
  const dir = scratchDir('doc-owners-held-' + (++worlds)), file = path.join(dir, 'doc-owners.json');
  if (memo !== null) fs.writeFileSync(file, memo);
  const unplace = refuse ? placeRefusal(file) : () => { };
  const activeSessions = new Map();   // w1 has STOPPED: only the memo knows its conversation
  const deliver = CD.create({ dataDir: dir, activeSessions, serverSetting: () => undefined, log: () => { } });
  const sent = [];
  const sendUserInput = (sid, text) => { if (!activeSessions.has(sid)) return { ok: false, code: 'no_session' }; sent.push({ sid, text }); return { ok: true, msgId: 'm' + sent.length }; };
  const mine = () => AR.configure({ activeSessions: () => activeSessions, deliver, sessionMeta: null, log: quiet });
  const live = { owner: null };   // a live registry owner for ANOTHER document (a lookup that notes)
  const artifacts = real ? { ownerOf: (a) => (mine(), AR.ownerOf(a)), holdersOf: (a) => (mine(), AR.holdersOf(a)), noteEdit: (a) => (mine(), AR.noteEdit(a)), touch: (a) => (mine(), AR.touch(a)) }
    : { ownerOf: (a) => (a && a.path === live.owner?.path ? { sessionId: 'w9', conversationId: live.owner.cid } : null), holdersOf: (a) => (a && a.path === live.owner?.path ? ['w9'] : []), noteEdit: () => ({ ok: true }) };
  const doc = DE.create({ activeSessions, getDeliver: () => deliver, sendUserInput, artifacts, dataDir: dir, now: () => 7, log: () => { } });
  const app = { r: {}, get(p, h) { this.r['GET ' + p] = h; }, post(p, h) { this.r['POST ' + p] = h; } };
  registerDocRoutes(app, { doc });
  const call = (verb, p, { query = {}, body = {} } = {}) => { const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } }; app.r[verb + ' ' + p]({ query, body, headers: {} }, res); return res; };
  const end = () => { unplace(); try { if (typeof doc.stop === 'function') doc.stop(); } catch { } };
  return { dir, file, doc, deliver, sent, live, call, unplace, end, activeSessions };
}

// ── H1 — UNREADABLE (a placed refusal of the read call) ───────────────────────────────────────────────────────────────────────
console.log('H1 the owner memo unreadable at the start: held — the doors say the hold, nothing is written over it, the read again lifts it');
{
  const w = world({ refuse: true });
  const c = w.call('POST', '/api/doc/comments', { body: { path: DOC, from: 'w1', items: items(2) } });
  const e = w.call('POST', '/api/doc/edited', { body: { path: DOC, from: 'w1', summary: 'fixed a line' } });
  const o = w.call('GET', '/api/doc/owner', { query: { path: DOC, from: 'w1' } });
  ok(true, 'the scene: the memo names the stopped window w1\'s conversation; its read is refused (EIO) at the engine\'s start');
  ok(!!(c.code === 503 && c.body && c.body.code === 'doc_owners_unread' && !!(c.body.i18n && c.body.i18n.key) && w.sent.length === 0), 'H1 — THE LAW (r3332: a comment while held is told THE HOLD by name, never «no owner»): POST /api/doc/comments answers 503 doc_owners_unread with its sentence, and nothing is sent', { status: c.code, body: c.body && { code: c.body.code, error: String(c.body.error || '').slice(0, 90) }, sent: w.sent.length });
  ok(!!(e.code === 503 && e.body && e.body.code === 'doc_owners_unread'), 'H1 — THE LAW: the edit note (POST /api/doc/edited) is told the hold too', { status: e.code, code: e.body && e.body.code });
  ok(!!(o.body && o.body.owner === null && o.body.hold && o.body.hold.code === 'doc_owners_unread' && o.body.hold.i18n && o.body.hold.i18n.key), 'H1 — THE LAW (the page\'s view): GET /api/doc/owner answers the hold where the strip would say «no conversation»', o.body);
  w.live.owner = { path: '/w/OTHER.md', cid: 'c-live' };   // a lookup that NOTES: a live registry owner and a new holder of another document
  const n = w.call('GET', '/api/doc/owner', { query: { path: '/w/OTHER.md' } });
  SW.storeWriter().flushSync([w.file]);   // B-574d: anything the lookup asked of the writer lands NOW — a write over the held file would be on disk before the read
  let after = null; w.unplace(); try { after = fs.readFileSync(w.file, 'utf8'); } catch { after = null; }
  ok(!!(n.body && n.body.owner && after === MEMO), 'H1 — THE LAW (held: nothing written over): a lookup that finds a live owner and a new holder answers it, and the unread file keeps its bytes', { owner: n.body && n.body.owner, fileKept: after === MEMO });
  const lifted = await HOLD.readAgainOf('doc-owners.json');   // the read again (the hold's own ladder, asked now): the refusal gone
  const c2 = w.call('POST', '/api/doc/comments', { body: { path: DOC, from: 'w1', items: items(1) } });
  ok(!!(lifted === true && c2.body && c2.body.ok === true && c2.body.delivered === 'stashed' && c2.body.conversationId === CID), 'H1 — THE LAW (lifted with no restart): once the file reads again the stopped owner is reached — the comment waits in its conversation\'s stash', { lifted, answer: c2.body && { ok: c2.body.ok, delivered: c2.body.delivered, code: c2.body.code } });
  w.end();
}

// ── H2 — TORN BYTES ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('H2 the owner memo torn: kept aside once, the memo starts empty, «no owner» says where the damaged bytes are kept');
{
  const TORN = '{"s":{"w1":{"cid":"' + CID.slice(0, 9);
  const w = world({ memo: TORN });
  let hold = null; for (let i = 0; i < 80; i++) { hold = typeof w.doc.ownersHold === 'function' ? w.doc.ownersHold() : null; if (hold && hold.torn) break; await nap(25); }
  const copies = () => fs.readdirSync(w.dir).filter((f) => f.startsWith('doc-owners.json.corrupt-'));
  const c = copies();
  ok(!!(c.length === 1 && fs.readFileSync(path.join(w.dir, c[0]), 'utf8') === TORN), 'H2 — THE LAW (torn bytes kept aside once): a copy with the SAME bytes beside the memo', { copies: c });
  const r = w.call('POST', '/api/doc/comments', { body: { path: DOC, from: 'w1', items: items(1) } });
  const said = r.body && r.body.code === 'no_owner' && r.body.i18n && r.body.i18n.params && r.body.i18n.params.name === c[0] && String(r.body.error || '').includes(c[0]) && !/restore/i.test(String(r.body.error || '') + JSON.stringify(r.body.i18n || {}));
  ok(!!(said), 'H2 — THE LAW (the person told in place, r3104): the comment\'s «no owner» says the list was damaged and names where its bytes are kept — never «restore that copy»', r.body && { code: r.body.code, error: String(r.body.error || '').slice(0, 160), i18n: r.body.i18n });
  w.end();
  fs.writeFileSync(path.join(w.dir, 'doc-owners.json'), TORN);   // a second start meets the same torn bytes
  const DE2 = DE.create({ activeSessions: new Map(), getDeliver: () => null, sendUserInput: null, artifacts: null, dataDir: w.dir, now: () => 8, log: () => { } });
  for (let i = 0; i < 40; i++) { await nap(25); }
  ok(!!(copies().length === 1), 'H2 — THE LAW (once per content): a second start over the same torn bytes makes no second copy', { copies: copies() });
  try { if (typeof DE2.stop === 'function') DE2.stop(); } catch { }
}

// ── H3 — CONTROL: a missing memo ───────────────────────────────────────────────────────────────────────────────────────────
console.log('H3 control: a missing memo is empty, as before');
{
  const w = world({ memo: null });
  const r = w.call('POST', '/api/doc/comments', { body: { path: DOC, from: 'w1', items: items(1) } });
  const o = w.call('GET', '/api/doc/owner', { query: { path: DOC, from: 'w1' } });
  ok(!!(r.code === 409 && r.body && r.body.code === 'no_owner' && o.body && o.body.owner === null && !o.body.hold), 'H3 — CONTROL: no memo ⇒ «no owner» (409) and no hold, as the release', { status: r.code, code: r.body && r.body.code, hold: o.body && o.body.hold });
  w.end();
}

// ── H4 — THE REAL WIRING: the routes over the engine as server.js creates it, the REAL artifact registry ──────────────────────
console.log('H4 the real wiring (server.js creates the engine; the REAL artifact registry): the owner look and the comment say the hold');
{
  const w = world({ refuse: true, real: true });
  const o = w.call('GET', '/api/doc/owner', { query: { path: DOC, from: 'w1' } });
  const c = w.call('POST', '/api/doc/comments', { body: { path: DOC, from: 'w1', items: items(1) } });
  ok(!!(o.body && o.body.hold && o.body.hold.code === 'doc_owners_unread' && c.code === 503 && c.body && c.body.code === 'doc_owners_unread'), 'H4 — THE LAW (production\'s names): over the real registry the owner look and the comment door answer the hold', { owner: o.body, comment: c.body && c.body.code });
  w.end();
}
report();
