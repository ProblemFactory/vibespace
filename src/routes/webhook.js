'use strict';
/**
 * THE WEBHOOK ROUTES — ORCH (lane webhook-l1-server; docs/design-webhook.zh.md §4 / §7 / §9).
 *
 *   POST /hook/<slug>                                  the inbound door — cookie-free (src/auth.js exempts exactly it); the
 *                                                      steps of src/webhook-auth.js IN ORDER, every refusal before the body
 *                                                      is read; the global JSON parser skips it (server.js); its OWN raw
 *                                                      read (express.raw, 256 KB) runs at step ⑦ and nowhere else
 *   GET  /api/channels/webhook/<slug>/replies          the caller's poll (its own token; an opaque per-caller cursor; a
 *                                                      long-poll ≤ 25 s that re-checks the caller's generation on wake —
 *                                                      revoked / rotated ⇒ 401)
 *   POST /api/channels/webhook/<slug>/pair             the instance pairing's COMPLETION (lane webhook-l3-cli-pair, §12): cookie-free
 *                                                      like /hook; refused before a byte is read unless a code A minted is
 *                                                      pending for (slug, X-Webhook-Caller); src/webhook-pair.js judges the
 *                                                      frame BEFORE the one write (a peer caller row); the code is then spent
 *   POST /api/channels/webhook/paths/<slug>/pair-code  OWNER (A): mint the one-time code (10 min) — shown in that answer only
 *   POST /api/channels/webhook/join                    OWNER (B): paste A's code — B posts the completion frame to A and, on
 *                                                      A's 200 only, writes its path + the `peer` caller for A
 *   /api/channels/webhook/paths…                       the OWNER's verbs (cookie; an agent bearer ⇒ 403 agent-forbidden):
 *                                                      list, create / update a path, register a caller (the token is shown
 *                                                      ONCE, in that answer only), rotate, revoke, delivery
 *
 * A caller learns NOTHING internal: the receipt is `{ok, receiptId, path, reply}`; every refusal is one fixed answer.
 */
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const PT = require('../pairing-token.js');
const WA = require('../webhook-auth.js');
const WR = require('../webhook-record.js');
const WH = require('../channels/webhook.js');
const WP = require('../webhook-pair.js');
const EF = require('../egress-fence.js');
const { bearerOf } = require('../channels/index.js');

const router = express.Router();
const ADAPTER_ID = WH.kind;
const RATE_DEFAULT = WA.RATE_DEFAULT;
const WAKES_DEFAULT = 6;
const LONG_POLL_MAX_S = 25;
const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));
const sha256Hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const rawParser = express.raw({ type: () => true, limit: `${WA.BODY_MAX}b` });

let D = null;   // { getEngine, dataDir, serverSetting, now }
const ipGate = WA.createIpGate();
const memos = WA.createCallerMemos();
/** What the door did — the suites read it (`stats()`): per-step refusals and how many bodies were READ (⑦). */
const STATS = { refusals: {}, bodyReads: 0, accepted: 0, last: null };

function setup(deps) { D = { now: Date.now, serverSetting: () => undefined, ...deps }; }
const engine = () => (D && typeof D.getEngine === 'function' ? D.getEngine() : null);
function store() {
  const e = engine();
  if (!e || !D.dataDir) return null;
  return WH.callersStore(path.join(D.dataDir, 'channels', ADAPTER_ID), { secrets: e.secrets || null, now: () => D.now() });
}
const optionsOf = (slug) => { const e = engine(); const en = e && e.store && e.store.index.peek(`${ADAPTER_ID}/${slug}`); return (en && en.options && typeof en.options === 'object') ? en.options : {}; };

function answer(res, name, extra = null) {
  const a = WA.ANSWERS[name];
  res.status(a.status).set({ 'Cache-Control': 'no-store', ...a.headers, ...(extra || {}) }).json(a.body);
}
function refused(req, res, v) {
  STATS.refusals[v.step] = (STATS.refusals[v.step] || 0) + 1;
  STATS.last = { step: v.step, answer: v.answer, bodyDefined: req.body !== undefined, at: D.now() };
  // never drain a body we refused to read: the connection closes behind the answer
  res.set('Connection', 'close');
  answer(res, v.answer, v.retryAfter ? { 'Retry-After': String(v.retryAfter) } : null);
}
/** THE CLIENT ADDRESS (verify r1 #10): the one the stranger gate counts and every allow-list judges (`webhook.trustProxyHops`). */
const clientAddr = (req) => WA.clientIp(req.socket && req.socket.remoteAddress, req.headers['x-forwarded-for'], D.serverSetting('webhook.trustProxyHops'));
const readBody = (req, res) => new Promise((resolve) => { STATS.bodyReads++; rawParser(req, res, (err) => resolve(err ? { err } : { body: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0) })); });

/** THE INBOUND DOOR — the steps of src/webhook-auth.js in order; the first refusal answers. */
async function hookDoor(req, res, slugIn) {
  const t = D.now();
  const slug = String(slugIn || '');
  const addr = clientAddr(req);
  let v = WA.verdict('method', { method: req.method });                                                     // ①
  if (!v.ok) { ipGate.charge(addr, t); return refused(req, res, v); }
  // ② verify r1 #4: the stranger gate is ASKED here and CHARGED only by a refusal at ①–⑤ (a proven caller pays ⑪)
  if (ipGate.blocked(addr, t)) return refused(req, res, { step: 'ip', answer: 'rate-limited' });           // ②
  const st = store();
  const sv = WA.verdict('slug', { slug });                                                                   // ③
  const p = !sv.miss && st ? st.path(slug) : null;
  const cv = WA.verdict('caller', { path: p, callers: p ? st.callersRaw(slug) : [], remote: addr });         // ④ (the allow-list judges the client address)
  const av = WA.verdict('auth', { bearer: bearerOf(req.headers.authorization), headers: req.headers, callers: cv.callers, now: t }, { tokenMatches: PT.tokenMatches, dummyHash: DUMMY_HASH });   // ⑤
  if (!av.ok) { ipGate.charge(addr, t); return refused(req, res, av); }
  v = WA.verdict('length', { contentLength: req.headers['content-length'] });                               // ⑥
  if (!v.ok) return refused(req, res, v);
  const rb = await readBody(req, res);                                                                      // ⑦
  if (rb.err) return refused(req, res, { step: 'read', answer: rb.err.type === 'entity.too.large' ? 'too-large' : 'bad-body' });
  const body = rb.body;
  v = WA.verdict('read', { body });
  if (!v.ok) return refused(req, res, v);
  const c = av.caller;
  const key = st.keyOf(c);
  v = WA.verdict('signature', { scheme: av.scheme, token: av.scheme === 'hmac' ? key : null, ts: av.ts, sig: av.sig, slug, body }, { hmacHex: WH.hmacHex, safeEqual });   // ⑧
  if (!v.ok) return refused(req, res, v);
  const opts = optionsOf(slug);
  const rate = Number(opts.rateLimit) > 0 ? Number(opts.rateLimit) : RATE_DEFAULT;
  if (av.scheme === 'hmac') { v = memos.replay(c.id, av.sig, t, rate); if (!v.ok) return refused(req, res, v); }   // ⑨ (a CHECK — committed below)
  const bodySha = sha256Hex(body);
  const ik = typeof req.headers[WA.HEADERS.key] === 'string' ? req.headers[WA.HEADERS.key].trim() : '';
  const eventId = WA.eventIdOf(c.id, ik, bodySha);                                                          // ⑩
  v = memos.idempotency(c.id, eventId, bodySha, t, rate);
  if (!v.ok) return refused(req, res, v);
  v = memos.rate(c.id, t, rate);                                                                            // ⑪
  if (!v.ok) return refused(req, res, v);
  const pv = WA.verdict('parse', { contentType: req.headers['content-type'], body });                      // ⑫
  if (!pv.ok) return refused(req, res, pv);
  v = WA.verdict('credential', { value: pv.value });                                                       // verify r1 #1 / #12: a DECODED credential
  if (!v.ok) return refused(req, res, v);
  // lane webhook-l3-cli-pair: a PEER's call is the canonical payload, read with the fixed mapping (no owner configuration)
  const peer = c.kind === 'peer' ? WP.peerRecordValue(pv.value) : null;
  if (peer && req.headers[WP.PEER_HEADER] !== undefined && String(req.headers[WP.PEER_HEADER]) !== WP.PEER_VERSION) return refused(req, res, { step: 'parse', answer: 'bad-body' });
  let record;
  try {
    record = WR.toRecord({ adapterId: ADAPTER_ID, slug, caller: { id: c.id, name: c.name }, value: peer || pv.value, bodyText: body.toString('utf-8'), eventId, at: t,
      replyTo: peer ? peer.inReplyTo : req.headers[WA.HEADERS.replyTo], threadKey: peer ? peer.threadKey : req.headers[WA.HEADERS.thread], event: req.headers[WA.HEADERS.event], mapping: peer ? WP.PEER_MAPPING : opts });
  } catch { return refused(req, res, { step: 'parse', answer: 'bad-body' }); }
  const e = engine();
  const r = e && typeof e.pushInbound === 'function' ? await e.pushInbound(ADAPTER_ID, { kind: 'record', convId: slug, eventId, record }) : null;
  if (!(r && (r.persisted === true || r.duplicate === true))) { res.set('Cache-Control', 'no-store'); return res.status(503).json({ ok: false, error: 'unavailable' }); }
  memos.commit(c.id, { sig: av.scheme === 'hmac' ? av.sig : null, key: eventId, sha: bodySha }, t);         // verify r1 #9: ⑨ ⑩ committed only now
  st.noteCall(slug, c.id, t);
  STATS.accepted++;
  STATS.last = { step: 'accepted', bodyDefined: true, at: t };
  const mode = c.delivery && c.delivery.mode;
  res.set('Cache-Control', 'no-store').json(WA.receiptOf({ receiptId: WH.hmacHex(key, record.id), slug, mode, pollUrl: `/api/channels/webhook/${slug}/replies` }));
}
const DUMMY_HASH = PT.tokenHash(PT.mintToken('webhook'));

// verify r1 #6 (int248 r2): the WHOLE /hook prefix is the door's (src/auth.js exempts it) — /hook/<slug>/, /hook/<SLUG>,
// /hook/<slug>/x and /hook itself are a MISS walked through the same steps (the door's 405 / 429 / 401), never a second shape
router.all(/^\/hook(?:\/.*)?$/, (req, res) => { const m = /^\/hook\/([^/]+)$/.exec(req.path); hookDoor(req, res, m ? m[1] : '').catch(() => { if (!res.headersSent) answer(res, 'unauthorized'); }); });

/** The CALLER's own token on its poll: a Bearer caller's hash, an HMAC caller's sealed token — constant time either way. */
function pollCaller(req, st, slug, addr) {
  const tok = bearerOf(req.headers.authorization);
  const p = WA.SLUG_RE.test(slug) && st ? st.path(slug) : null;
  // verify r1 #2: the ONE caller rule — disabled / revoked / the path's allow-list over the client address — as at /hook ④
  const callers = p ? WA.verdict('caller', { path: p, callers: st.callersRaw(slug), remote: addr }).callers : [];
  let hit = null;
  if (!tok || !callers.length) { PT.tokenMatches(String(tok || ''), DUMMY_HASH); return null; }
  for (const c of callers) {
    const ok = c.auth === 'bearer' ? PT.tokenMatches(tok, c.tokenHash) : PT.sameToken(tok, st.keyOf(c));
    if (ok && !hit) hit = c;
  }
  return hit;
}
router.get('/api/channels/webhook/:slug/replies', async (req, res) => {
  const t0 = D.now();
  const slug = String(req.params.slug || '');
  const addr = clientAddr(req);
  if (ipGate.blocked(addr, t0)) return answer(res, 'rate-limited');   // verify r1 #4: a caller's own poll is never charged — only a refused one
  const st = store();
  const c = pollCaller(req, st, slug, addr);
  if (!c) { ipGate.charge(addr, t0); return answer(res, 'unauthorized'); }
  const gen = c.generation;
  // the generation AND the path's allow-list are re-checked on every wake (verify r1 #2)
  const still = () => { const x = st.caller(slug, c.id); const p = st.path(slug); return x && !x.revokedAt && x.generation === gen && p && !p.disabled && WA.allowVerdict(p, addr) ? x : null; };
  const since = typeof req.query.since === 'string' ? req.query.since : '';
  let a = WH.pollAnswer(st, slug, c, since, D.now());
  if (!a) return answer(res, 'bad-body');
  const wait = Math.max(0, Math.min(LONG_POLL_MAX_S, Math.floor(Number(req.query.wait) || 0)));
  if (!a.replies.length && wait > 0) {
    await new Promise((resolve) => {
      const done = () => { clearTimeout(tm); st.bus.off('reply', on); st.bus.off('change', on); req.off('close', done); resolve(); };
      const on = (ev) => { if (ev && ev.slug === slug && ev.id === c.id) done(); };
      const tm = setTimeout(done, wait * 1000);
      st.bus.on('reply', on); st.bus.on('change', on); req.on('close', done);
    });
    if (res.writableEnded || res.destroyed) return;
    const now = still();   // the generation is RE-CHECKED on every wake: revoked / rotated ⇒ the poll ends 401
    if (!now) return answer(res, 'unauthorized');
    a = WH.pollAnswer(st, slug, now, since, D.now()) || a;
  } else if (!still()) return answer(res, 'unauthorized');
  res.set('Cache-Control', 'no-store').json(a);
});
// ── THE INSTANCE PAIRING (lane webhook-l3-cli-pair; §12, fence 7) ───────────────────────────────────────────────────────
const pending = WP.createPending();
const pairParser = express.raw({ type: () => true, limit: `${WP.FRAME_MAX}b` });
const allowPrivate = () => D.serverSetting('webhook.allowPrivateReplyUrl') === true;
/** This instance's own URL (instanceUrl — the frp mapping layered over agentd.publicUrl), no trailing slash, or null. */
function instanceBase(req) {
  let v = null;
  try { v = req.app && req.app.locals ? req.app.locals.instancePublicUrl : null; } catch { v = null; }
  const u = typeof v === 'string' ? v : v && typeof v.url === 'string' ? v.url : '';
  return u ? u.replace(/\/+$/, '') : null;
}
/** THE COMPLETION (A's side): refused before a byte is read unless a code is pending for (slug, X-Webhook-Caller); the
 *  PURE verdict before the one write; a refusal is the same-shape 401 (a signed frame with a bad hook URL: 400 by name). */
router.post('/api/channels/webhook/:slug/pair', async (req, res) => {
  const t = D.now();
  const slug = String(req.params.slug || '');
  const addr = clientAddr(req);
  if (ipGate.blocked(addr, t)) return answer(res, 'rate-limited');
  const st = store();
  const callerId = String(req.headers[WA.HEADERS.caller] || '');
  // verify r1 #2: the path's allow-list holds here too (the ONE check, over the client address)
  const p = st && WA.SLUG_RE.test(slug) && st.path(slug) && WA.allowVerdict(st.path(slug), addr) ? pending.get(slug, callerId, t) : null;
  if (!p) { ipGate.charge(addr, t); res.set('Connection', 'close'); return answer(res, 'unauthorized'); }
  const rb = await new Promise((resolve) => { pairParser(req, res, (err) => resolve(err ? { err } : { body: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0) })); });
  if (rb.err) return answer(res, 'unauthorized');
  try {
    const v = WP.complete({ slug, headers: req.headers, body: rb.body, now: D.now(), pending: p, allowPrivate: allowPrivate() },
      { hmacHex: WH.hmacHex, safeEqual, write: (f) => st.pair(slug, { id: callerId, name: f.name, token: p.token, outToken: f.token, outCaller: f.caller, replyUrl: f.hookUrl }) });
    if (!v.ok) return v.answer === 'unauthorized' ? answer(res, 'unauthorized') : res.status(400).set('Cache-Control', 'no-store').json({ ok: false, code: v.why, error: v.error });
    pending.spend(slug, callerId);
    memos.forget(callerId);
    await syncRow(slug, null);
    res.set('Cache-Control', 'no-store').json({ ok: true, v: 1 });
  } catch (e) { bad(res, 500, 'the pairing could not be stored — mint a new code', 'failed'); }
});

// ── THE OWNER'S VERBS (cookie routes; an agent's bearer is refused by name first) ─────────────────────────────────────
const OWNERS = 'a webhook path and its callers are the owner\'s — an agent token may not read or change them (propose with vibespace-ask)';
function owner(req, res) { if (!isAgentBearer(req)) return true; res.status(403).json({ ok: false, code: 'agent-forbidden', error: OWNERS }); return false; }
const json = express.json({ limit: '64kb' });
const bad = (res, status, error, code = 'bad-request') => res.status(status).json({ ok: false, code, error });
function pathOptions(b, prev = {}) {
  const mv = WR.validateMapping({ textPath: b.textPath !== undefined ? b.textPath : prev.textPath, senderKey: b.senderKey !== undefined ? b.senderKey : prev.senderKey, titleKey: b.titleKey !== undefined ? b.titleKey : prev.titleKey, facts: b.facts !== undefined ? b.facts : prev.facts });
  if (!mv.ok) return mv;
  const num = (v, d, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  return { ok: true, options: { ...mv.mapping, rateLimit: num(b.rateLimit !== undefined ? b.rateLimit : prev.rateLimit, RATE_DEFAULT, 1, WA.RATE_MAX), wakesPerHour: num(b.wakesPerHour !== undefined ? b.wakesPerHour : prev.wakesPerHour, WAKES_DEFAULT, 1, 60),
    ipAllow: Array.isArray(b.ipAllow) ? b.ipAllow.map(String).slice(0, 32) : (prev.ipAllow || []), disabled: b.disabled !== undefined ? b.disabled === true : prev.disabled === true, replyName: b.replyName !== undefined ? String(b.replyName).slice(0, 80) : (prev.replyName || WH.REPLY_NAME_DEFAULT) } };
}
async function syncRow(slug, options) {
  const e = engine(); const st = store();
  const p = st.path(slug); const live = st.callers(slug).filter((c) => !c.revokedAt);
  await e.store.index.update(() => {
    const en = e.store.index.entry(ADAPTER_ID, slug);
    en.title = p.title; en.kind = live.length > 1 ? 'group' : 'dm'; en.participants = live.map((c) => c.name).join(', ') || p.title;
    if (!(Number(en.readAt) > 0)) en.readAt = D.now();
    if (options) en.options = options;
  });
  // the conversation's send identity is resolved NOW (a path the owner just made is sendable — its convCaps say so)
  try { if (typeof e.refreshConvCaps === 'function') await e.refreshConvCaps(ADAPTER_ID, slug); } catch { }
  const people = e.store.peopleRead(ADAPTER_ID);
  const next = { self: people.self, people: { ...people.people } };
  for (const c of st.callers(slug)) next.people[`caller:${c.id}`] = { name: c.name, at: D.now() };
  e.store.peopleWrite(ADAPTER_ID, next);
  // lane webhook-l2-ui: EVERY client hears of it NOW (a caller registered on one appears on the other without a reload) —
  // the index write alone broadcasts nothing; the engine's one notify door names this path's row
  try { if (typeof e.notify === 'function') e.notify([`${ADAPTER_ID}/${slug}`]); } catch { }
}
const pathView = (st, slug) => ({ ...st.path(slug), options: optionsOf(slug), callers: st.callers(slug), hookUrl: `/hook/${slug}` });
router.get('/api/channels/webhook/paths', (req, res) => { if (!owner(req, res)) return; const st = store(); if (!st) return bad(res, 503, 'channels unavailable', 'unavailable'); res.set('Cache-Control', 'no-store').json({ ok: true, paths: st.paths().map((s) => pathView(st, s)) }); });
router.post('/api/channels/webhook/paths', json, async (req, res) => {
  if (!owner(req, res)) return;
  try {
    const st = store(); if (!st) return bad(res, 503, 'channels unavailable', 'unavailable');
    const b = req.body || {}; const slug = String(b.slug || '');
    if (WA.slugProblem(slug)) return bad(res, 400, 'a path is 1–63 of a-z 0-9 - (starting with a letter or digit), not a reserved word');
    if (st.path(slug)) return bad(res, 409, `path ${slug} exists`, 'exists');
    const ov = pathOptions(b);
    if (!ov.ok) return bad(res, 400, ov.error);
    st.putPath(slug, { title: b.title || slug, replyName: ov.options.replyName, disabled: ov.options.disabled, ipAllow: ov.options.ipAllow });
    await syncRow(slug, ov.options);
    res.json({ ok: true, path: pathView(st, slug) });
  } catch (e) { bad(res, 500, (e && e.message) || 'failed', 'failed'); }
});
router.put('/api/channels/webhook/paths/:slug', json, async (req, res) => {
  if (!owner(req, res)) return;
  try {
    const st = store(); const slug = String(req.params.slug || '');
    if (!st || !st.path(slug)) return bad(res, 404, `no path ${slug.slice(0, 64)}`, 'not-found');
    const b = req.body || {};
    const ov = pathOptions(b, optionsOf(slug));
    if (!ov.ok) return bad(res, 400, ov.error);
    st.putPath(slug, { ...(b.title !== undefined ? { title: b.title } : {}), replyName: ov.options.replyName, disabled: ov.options.disabled, ipAllow: ov.options.ipAllow });
    await syncRow(slug, ov.options);
    res.json({ ok: true, path: pathView(st, slug) });
  } catch (e) { bad(res, 500, (e && e.message) || 'failed', 'failed'); }
});
/** THE OWNER'S "Send a message…" (lane webhook-l2-ui): `{text, callers: [id…] | 'all'}` ⇒ the engine's composeEach — ONE
 *  proposal per caller, each sent at once as the owner (the agents' `compose --caller` door, the same PURE expansion). */
router.post('/api/channels/webhook/paths/:slug/send', json, async (req, res) => {
  if (!owner(req, res)) return;
  try {
    const e = engine(); const st = store(); const slug = String(req.params.slug || '');
    if (!e || !st || !st.path(slug)) return bad(res, 404, `no path ${slug.slice(0, 64)}`, 'not-found');
    const b = req.body || {};
    const r = await e.composeEach({ kind: 'user' }, ADAPTER_ID, slug, { direct: true, text: b.text, recipients: b.callers });
    res.status(r && r.code === 'not-found' ? 404 : r && (r.ok || Array.isArray(r.proposals)) ? 200 : 409).json(r);
  } catch (e) { bad(res, 500, (e && e.message) || 'failed', 'failed'); }
});
/** REGISTER — mint → atomic write → the token in THIS answer and nowhere else (a failed write answers 500, no token). */
router.post('/api/channels/webhook/paths/:slug/callers', json, async (req, res) => {
  if (!owner(req, res)) return;
  try {
    const st = store(); const slug = String(req.params.slug || '');
    if (!st || !st.path(slug)) return bad(res, 404, `no path ${slug.slice(0, 64)}`, 'not-found');
    const b = req.body || {};
    const r = st.register(slug, { name: b.name, kind: b.kind, auth: b.auth === 'bearer' ? 'bearer' : 'hmac', delivery: b.delivery || { mode: 'none' } });
    // verify r1 #16 (int248 r2): no GHOST — a row whose index / people sync fails is taken back before the 500 (no token)
    try { await syncRow(slug, null); } catch (e) { try { st.unregister(slug, r.caller.id); } catch { } throw e; }
    res.set('Cache-Control', 'no-store').json({ ok: true, caller: r.caller, token: r.token, shownOnce: true });
  } catch (e) { bad(res, e && e.code === 'bad-request' ? 400 : e && e.code === 'not-found' ? 404 : 500, (e && e.message) || 'failed', (e && e.code) || 'failed'); }
});
router.post('/api/channels/webhook/paths/:slug/callers/:id/:verb', json, async (req, res) => {
  if (!owner(req, res)) return;
  try {
    const st = store(); const slug = String(req.params.slug || ''); const id = String(req.params.id || '');
    if (!st || !st.path(slug)) return bad(res, 404, `no path ${slug.slice(0, 64)}`, 'not-found');
    let out;
    switch (req.params.verb) {
      case 'rotate': { const r = st.rotate(slug, id); memos.forget(id); out = { ok: true, caller: r.caller, token: r.token, shownOnce: true }; break; }
      case 'revoke': out = { ok: true, caller: st.revoke(slug, id) }; memos.forget(id); break;
      case 'delivery': out = { ok: true, caller: st.setDelivery(slug, id, (req.body || {}).delivery) }; break;
      default: return bad(res, 404, `no caller verb ${String(req.params.verb).slice(0, 20)}`);
    }
    await syncRow(slug, null);
    res.set('Cache-Control', 'no-store').json(out);
  } catch (e) { bad(res, e && e.code === 'bad-request' ? 400 : e && e.code === 'not-found' ? 404 : 500, (e && e.message) || 'failed', (e && e.code) || 'failed'); }
});
/** THE PAIRING CODE (A's owner, §12): ONE code, 10 min, single use — A's hook URL (instanceUrl), the caller id kept for the
 *  other side (fresh, or `callerId` = a live peer ⇒ re-pairing rotates it in place), the token issued to it. The code is
 *  in THIS answer and nowhere else (the pending half lives in memory: a restart voids it). */
router.post('/api/channels/webhook/paths/:slug/pair-code', json, (req, res) => {
  if (!owner(req, res)) return;
  try {
    const st = store(); const slug = String(req.params.slug || '');
    if (!st || !st.path(slug)) return bad(res, 404, `no path ${slug.slice(0, 64)}`, 'not-found');
    const base = instanceBase(req);
    if (!base) return bad(res, 409, 'this instance has no public URL yet — the other side needs one to call back (set the instance URL first)', 'no-instance-url');
    const hv = WP.hookUrlVerdict(`${base}/hook/${slug}`, { allowPrivate: allowPrivate() });
    if (!hv.ok) return bad(res, 409, hv.error, hv.why);
    const b = req.body || {};
    let callerId;
    if (b.callerId !== undefined) {
      const c = st.caller(slug, String(b.callerId));
      if (!c || c.revokedAt || c.kind !== 'peer') return bad(res, 404, `${String(b.callerId).slice(0, 40)} is not a live peer of ${slug}`, 'not-found');
      callerId = c.id;
    } else callerId = st.freshId(slug);
    const t = D.now();
    const token = PT.mintToken('webhook');
    const row = pending.put({ slug, callerId, token, nonce: crypto.randomBytes(16).toString('hex'), repair: b.callerId !== undefined }, t);
    const code = WP.encodeCode({ hook: hv.url, caller: callerId, token, nonce: row.nonce, exp: row.exp, name: b.name || st.path(slug).replyName });
    res.set('Cache-Control', 'no-store').json({ ok: true, code, callerId, hookUrl: hv.url, expiresAt: row.exp, repair: row.repair, shownOnce: true });
  } catch (e) { bad(res, 500, (e && e.message) || 'failed', 'failed'); }
});
/** JOIN (B's owner, §12): paste A's code — judged here, the token B issues to A minted, the completion frame POSTed to A's
 *  pair endpoint through the egress fence; ONLY on A's 200 does B write its path (made if missing) + the `peer` caller for
 *  A. The same A pasted again (a re-pair code) rotates that row in place. No token in the answer. */
router.post('/api/channels/webhook/join', json, async (req, res) => {
  if (!owner(req, res)) return;
  try {
    const st = store(); if (!st) return bad(res, 503, 'channels unavailable', 'unavailable');
    const b = req.body || {};
    const t = D.now();
    const cv = WP.decodeCode(b.code, t);
    if (!cv.ok) return bad(res, 400, cv.error, cv.why);
    const av = WP.hookUrlVerdict(cv.hook, { allowPrivate: allowPrivate() });
    if (!av.ok) return bad(res, 400, av.error, av.why);
    const slug = String(b.slug || av.slug);
    if (WA.slugProblem(slug)) return bad(res, 400, 'a path is 1–63 of a-z 0-9 - (starting with a letter or digit), not a reserved word');
    const base = instanceBase(req);
    if (!base) return bad(res, 409, 'this instance has no public URL yet — the other side needs one to call back (set the instance URL first)', 'no-instance-url');
    const mine = WP.hookUrlVerdict(`${base}/hook/${slug}`, { allowPrivate: allowPrivate() });
    if (!mine.ok) return bad(res, 409, mine.error, mine.why);
    const had = st.path(slug);
    const existing = had ? st.callersRaw(slug).find((c) => c.kind === 'peer' && !c.revokedAt && c.delivery && c.delivery.replyUrl === av.url) : null;
    const myId = existing ? existing.id : had ? st.freshId(slug) : `c-${crypto.randomBytes(4).toString('hex')}`;
    const token = PT.mintToken('webhook');
    const body = WP.frameOf({ nonce: cv.nonce, hookUrl: mine.url, caller: myId, token, name: b.name || (had ? had.replyName : WH.REPLY_NAME_DEFAULT) });
    const r = await EF.fenceFetch(av.pairUrl, { method: 'POST', body, headers: WP.frameHeaders({ slug: av.slug, callerId: cv.caller, token: cv.token, body, now: t }, { hmacHex: WH.hmacHex }), allowPrivate: allowPrivate() });
    if (!r.ok) return bad(res, 502, `the other side refused the pairing (${r.status ? `HTTP ${r.status}` : r.error || r.code || 'unreachable'}) — nothing was written; ask for a new code`, 'pair-refused');
    if (!had) { const ov = pathOptions({}); st.putPath(slug, { title: String(b.title || cv.name || slug), replyName: ov.options.replyName, disabled: false, ipAllow: [] }); await syncRow(slug, ov.options); }
    const caller = st.pair(slug, { id: myId, name: cv.name, token, outToken: cv.token, outCaller: cv.caller, replyUrl: av.url });
    memos.forget(myId);
    await syncRow(slug, null);
    res.set('Cache-Control', 'no-store').json({ ok: true, path: pathView(st, slug), caller, repaired: !!existing });
  } catch (e) { bad(res, 500, (e && e.message) || 'failed', 'failed'); }
});

module.exports = { router, setup, pending, stats: () => JSON.parse(JSON.stringify(STATS)), ipGate, memos, ADAPTER_ID };
