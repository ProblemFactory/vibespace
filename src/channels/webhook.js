'use strict';
/**
 * THE BUILT-IN WEBHOOK ADAPTER (lane webhook-l1-server; docs/design-webhook.zh.md §2–§9). A conversation = a PATH
 * (`/hook/<slug>`); the people on the other side = its CALLERS (external systems, each with its own token); this side has
 * ONE identity — the owner (`sendAs: ['user']`), who answers as the path's `replyName`, never as an agent.
 *
 *   receive  = PUSH over an HTTP inbound door: `live.start({onEvent})` registers the emitter; src/routes/webhook.js judges
 *              a call (src/webhook-auth.js, every refusal before the body), maps it (src/webhook-record.js) and hands it to
 *              the engine through `live.deliver(ev)` — 200 only after `onEvent` answered `persisted`
 *   history  = empty by construction (a caller's calls exist only as they arrive)
 *   reply    = `replyEnvelope` (the answered record's author caller — src/webhook-reply.js) / an explicit recipient
 *              (`prepareSend` with `recipients`, one proposal per caller); `send` re-reads the caller at send time
 *              (revoked ⇒ not-found, rotated ⇒ the new key) and delivers by its mode: `reply-url` (ONE signed POST through
 *              src/egress-fence.js), `poll` (the caller's bounded queue), `none` (refused by name)
 *   callers  = data/channels/webhook/callers.json (0600, written atomically): a Bearer caller keeps only `tokenHash`, an
 *              HMAC caller the secret-box ciphertext `tokenEnc`; `generation` moves on every rotate / revoke
 *   pending  = data/channels/webhook/pair-pending.json (0600, atomic; lane webhook-pair-join): the pairing codes A minted
 *              and their deadlines — each token as a secret-box `tokenEnc`, never the code itself (pairPendingDoor)
 *   THE STORE-READ LAW (B-f276's family, 主开发 r3145, lane bl-ci): the release read ANY failure of either file (a refused read,
 *              torn bytes) as an empty list, and the next registration, pairing or pairing code saved that empty list plus one
 *              row over the file: every path and caller gone (their token hashes, sealed tokens and pairings), every caller's
 *              call refused as unknown meanwhile, the last ten minutes' codes void. Each file now reads through src/store-read.js
 *              and HOLDS on src/store-read-hold.js: «not there» (start empty) is told from «the read failed» (HELD: nothing
 *              written over it, read again off the loop on the helper's ladder, lifted with no restart) and from «the bytes do not
 *              parse» (kept aside once per content, then empty). While held every act that writes is refused BY NAME (503, its
 *              code) before any side effect, and every road that looks a caller up answers the hold — a caller's own call and
 *              poll «try again later» (503), never «unknown» — through `held()` / the refusal a read throws.
 *
 * Declared facts the engine reads instead of a `builtin` branch: `removable: false`, `consent: null`, `reach: 'grants'`
 * (AgentReach rows, like any vendor), `listed: true` (the first screen and the lists count it), `seed: true` (the engine
 * seeds its record; an inbound door is the conversation's only source, so the push claim is `exclusive`).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { ChannelError } = require('./index.js');
const PT = require('../pairing-token.js');
const EF = require('../egress-fence.js');
const WP = require('../webhook-pair.js');   // lane webhook-l3-cli-pair: a `peer` caller's canonical payload + its hook URL
const WA = require('../webhook-auth.js');
const RP = require('../webhook-reply.js');
const WR = require('../webhook-record.js');
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // B-f276's family (主开发 r3145): callers.json + pair-pending.json under the store-read law

const KIND = 'webhook';

const caps = {
  kind: 'webhook', vendorName: 'Webhook', glyph: 'robot', titleForm: 'name',
  receive: 'push', pushTransport: 'http-inbound', pushAckBudgetMs: 2000, pushOptIn: false,
  history: 'page', olderHistory: 'none', listConversations: true,
  sendAs: ['user'], identityMarking: 'marked', identityMarkingWhere: 'from', identityMarkingText: 'the caller sees from: {name: <the path\'s replyName>} — never an agent',
  policyModes: ['direct', 'review'], policyDefault: 'direct', honestyLine: 'never', sendStartsTurn: false,
  replyEnvelope: true, compose: true, prepareSend: true,
  idempotency: 'key',
  threads: { read: 'none', replyInto: false, listing: 'none', placements: ['chat', 'quote'], rootReply: 'quote' },
  reactions: { read: 'none', add: false, remove: 'none', vocabulary: 'names', custom: 'none', perMessageMax: null },
  revisions: Object.freeze({ recall: false, edit: false, how: 'none' }),   // lane channel-record-revisions: nothing is ever rechecked
  attachments: 'none', sendAttachments: null, sendAttachmentsWhy: 'a webhook reply carries text only (phase 2: attachments by URL + sha256)',
  avatars: null, avatarsWhy: 'a caller is a system; it has no picture',
  facts: ['sender', 'subject', 'event', 'fields'],   // the per-path declared keys ride ONE `fields` fact (a party per key)
  readReceipts: false, editSent: false, retention: 'keep', tosRisk: 'none',
  // no settingKey: webhook is no vendor of the manifest list, so it has no settings table row (L1 as-built)
  budget: { unit: 'request', default: 60 },
};

const CALLERS_FILE = 'callers.json';
const PENDING_FILE = 'pair-pending.json';
const POLL_MAX = 200;
const POLL_TTL_MS = 7 * 86400 * 1000;
const NAME_MAX = 80;
const REPLY_NAME_DEFAULT = 'VibeSpace';
const DELIVERY = RP.DELIVERY_MODES;
const hmacHex = (key, text) => crypto.createHmac('sha256', String(key)).update(String(text)).digest('hex');
// THE TWO HELD CODES (503) and their words — the store's plain name, what still holds, what to do; never a path, a caller's name,
// a token, a hash or a sealed field (the secret lens). The page words them by code (src/lib/channel-webhook.js heldWords).
const CALLERS_UNREAD = 'webhook_callers_unread';
const PENDING_UNREAD = 'webhook_pairing_unread';
const CALLERS_SHAPE = (d) => !!d && typeof d === 'object' && !Array.isArray(d) && !!d.paths && typeof d.paths === 'object' && !Array.isArray(d.paths);
const PENDING_SHAPE = (d) => !!d && typeof d === 'object' && !Array.isArray(d) && (d.rows === undefined || Array.isArray(d.rows));
const callersWords = (h) => `VibeSpace cannot read its webhook callers right now (${(h && h.code) || 'unreadable'}) — nothing was changed and nothing is written over them, and each caller is told to try again later. VibeSpace reads them again by itself every few minutes.`;
const pendingWords = (h) => `VibeSpace cannot read its pending pairing codes right now (${(h && h.code) || 'unreadable'}) — no code was made or used and nothing is written over them. VibeSpace reads them again by itself every few minutes.`;
const holdLog = (s) => console.warn(`[webhook] ${s}`);
// r3223 (2): a reply refused while the list is held is NOT sent again by anything — said plainly, the person's or agent's act to repeat
const NOT_SENT_WHILE_HELD = 'not sent: VibeSpace cannot read its webhook callers right now — send it again once the list reads (it reads the list again by itself every few minutes)';

function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, JSON.stringify(obj, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
const cleanName = (s, max = NAME_MAX) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, ' ').trim().slice(0, max);

/** THE PENDING PAIR CODES' STORE DOOR (lane webhook-pair-join, B-5ee0 b) — what webhook-pair's createPending binds:
 *  `read()` opens each sealed token (a row whose token will not open is dropped: its code is void, the owner mints a
 *  new one); `write(rows)` seals each token and writes the file atomically at 0600. Never a GET, never a broadcast. */
function pairPendingDoor(dir, { secrets }) {
  const file = path.join(dir, PENDING_FILE);
  // B-f276's family (r3145): the file HOLDS — a read that failed is never «no code pending» (the next mint wrote its one row over
  // the others); `read()` throws the refusal while held, `write()` refuses, the lift calls the door's `onLift` (the routes bind again)
  let value = null, started = false;
  const door = { file, onLift: null };
  const hold = HOLD.create({ file, valid: PENDING_SHAPE, code: PENDING_UNREAD, aside: (mark) => `${file}.corrupt-${mark}`, words: pendingWords, log: holdLog,
    onLift: (v) => { value = v || { v: 1, rows: [] }; if (typeof door.onLift === 'function') door.onLift(); } });
  return Object.assign(door, {
    held: () => hold.held(), words: () => hold.words(), refusal: (what) => hold.refusal(what), stop: () => hold.stop(),
    read() {
      if (!started) {   // the ONE sync read, at the routes' bind (as before)
        started = true;
        let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
        const a = SR.storeAnswer(read, { valid: PENDING_SHAPE });
        value = hold.start(a) === 'data' ? a.value : { v: 1, rows: [] };
      }
      hold.refuse('reading the pending pairing codes');
      const d = value;
      return (d && Array.isArray(d.rows) ? d.rows : []).map((r) => {
        if (!r || typeof r !== 'object' || typeof r.tokenEnc !== 'string') return null;
        let token = null; try { token = secrets.open(r.tokenEnc); } catch { token = null; }
        const { tokenEnc, ...rest } = r;
        return token ? { ...rest, token } : null;
      }).filter(Boolean);
    },
    write(rows) {
      if (!hold.writable('a pairing code change')) throw hold.refusal('this pairing code change');   // held: nothing written over it
      const next = { v: 1, rows: rows.map(({ token, ...r }) => ({ ...r, tokenEnc: secrets.seal(token) })) };
      writeJsonAtomic(file, next); value = next;
    },
  });
}

/** A caller as anybody may SEE it — never a hash, a ciphertext or a token. */
function callerView(c) {
  return { id: c.id, name: c.name, kind: c.kind, auth: c.auth, generation: c.generation, delivery: { mode: c.delivery.mode, ...(c.delivery.replyUrl ? { replyUrl: c.delivery.replyUrl } : {}) }, registeredAt: c.registeredAt, rotatedAt: c.rotatedAt || null, revokedAt: c.revokedAt || null, lastCallAt: c.lastCallAt || null, ...(c.pollDropped ? { pollDropped: c.pollDropped } : {}) };
}

/**
 * THE CALLERS STORE — one per directory (the routes and the adapter share it): callers.json is the adapter's ONLY
 * credential file. `secrets` = {seal, open} (the channels secret-box). Every mint writes FIRST and returns the token
 * after: a failed write throws, and nobody ever saw a token that is not on disk.
 */
const STORES = new Map();
function callersStore(dir, { secrets, now = Date.now, writer = null } = {}) {
  const file = path.join(dir, CALLERS_FILE);
  const have = STORES.get(file);
  if (have) { if (secrets) have.secrets = secrets; if (writer) have.writer = writer; return have; }
  const bus = new EventEmitter(); bus.setMaxListeners(0);
  let doc = null;
  // B-f276's family (r3145): callers.json HOLDS on a failed read — every read below throws the hold's refusal (no road hears «no
  // caller»), every writer is refused before its side effect (its first step is a read), and `save` refuses on its own
  const hold = HOLD.create({ file, valid: CALLERS_SHAPE, code: CALLERS_UNREAD, aside: (mark) => `${file}.corrupt-${mark}`, words: callersWords, log: holdLog,
    onLift: (v) => { doc = v || { v: 1, paths: {} }; bus.emit('change', { lifted: true }); } });
  const load = () => {
    if (!doc) {   // the ONE sync read at the store's first use (as before)
      let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; }
      const a = SR.storeAnswer(read, { valid: CALLERS_SHAPE });
      doc = hold.start(a) === 'data' ? a.value : { v: 1, paths: {} };
    }
    hold.refuse('reading the webhook callers');
    return doc;
  };
  const save = (next) => { if (!hold.writable('a webhook callers change')) throw hold.refusal('this change'); writeJsonAtomic(file, next); doc = next; };
  const clone = () => JSON.parse(JSON.stringify(load()));
  const S = {
    secrets: secrets || null, bus, file, dir, writer: writer || null,   // writer: the reply queues' store writer (B-574d) — the process's unless a suite hands one
    /** the hold's facts {file, code, since} while callers.json could not be read — null when it reads (asked after the first read) */
    held() { if (!doc) { try { load(); } catch { /* held: the facts below */ } } return hold.held(); },
    /** the words a person reads while held (null: not held) — no path, caller, token or hash */
    heldWords: () => hold.words(),
    /** the refusal BY NAME (503, webhook_callers_unread) of `what` while held */
    refusal: (what) => hold.refusal(what),
    /** a lift from TORN bytes in this run: { copy, since, at } (the copy's base name) — null when none */
    torn: () => hold.torn(),
    /** a slug a torn lift of THIS run may have lost: not in the list, and the list started empty from torn bytes — the door
     *  answers it «try again later», never «unknown» (the restart-proof half is the helper's copy question: owed) */
    lostSlug(slug) { if (!hold.torn()) return false; try { return !load().paths[slug]; } catch { return false; } },
    stopHold: () => hold.stop(),
    paths() { return Object.keys(load().paths); },
    path(slug) { const p = load().paths[slug]; return p ? { slug, title: p.title || slug, replyName: p.replyName || REPLY_NAME_DEFAULT, disabled: p.disabled === true, ipAllow: Array.isArray(p.ipAllow) ? p.ipAllow.slice() : [] } : null; },
    /** the RAW rows (hash / ciphertext included) — the auth step's and the send's read; never a view. */
    callersRaw(slug) { const p = load().paths[slug]; return p && Array.isArray(p.callers) ? p.callers : []; },
    callers(slug) { return S.callersRaw(slug).map(callerView); },
    caller(slug, id) { return S.callersRaw(slug).find((c) => c.id === id) || null; },
    putPath(slug, patch = {}) {
      const next = clone();
      const p = next.paths[slug] || (next.paths[slug] = { title: slug, replyName: REPLY_NAME_DEFAULT, callers: [], createdAt: now() });
      if (patch.title !== undefined) p.title = cleanName(patch.title, 200) || slug;
      if (patch.replyName !== undefined) p.replyName = cleanName(patch.replyName) || REPLY_NAME_DEFAULT;
      if (patch.disabled !== undefined) p.disabled = patch.disabled === true;
      if (patch.ipAllow !== undefined) p.ipAllow = (Array.isArray(patch.ipAllow) ? patch.ipAllow : []).map((x) => String(x).trim()).filter((x) => /^[0-9a-f:.]{2,45}$/i.test(x)).slice(0, 32);
      save(next);
      return S.path(slug);
    },
    /** REGISTER = mint ONCE → write → the token in this answer and nowhere else. */
    register(slug, { name, kind = 'system', auth = 'hmac', delivery = { mode: 'none' } } = {}) {
      if (!load().paths[slug]) throw Object.assign(new Error(`no path ${slug}`), { code: 'not-found' });
      const dv = deliveryVerdict(delivery);
      if (!dv.ok) throw Object.assign(new Error(dv.error), { code: 'bad-request' });
      const nm = cleanName(name);
      if (!nm) throw Object.assign(new Error('a caller needs a name'), { code: 'bad-request' });
      const a = auth === 'bearer' ? 'bearer' : 'hmac';
      if (a === 'hmac' && !S.secrets) throw Object.assign(new Error('the secret box is not available'), { code: 'unavailable' });
      const token = PT.mintToken('webhook');
      const next = clone();
      const p = next.paths[slug];
      let id; do { id = `c-${crypto.randomBytes(4).toString('hex')}`; } while (p.callers.some((c) => c.id === id));
      const t = now();
      const row = { id, name: nm, kind: kind === 'peer' ? 'peer' : 'system', auth: a, ...(a === 'bearer' ? { tokenHash: PT.tokenHash(token) } : { tokenEnc: S.secrets.seal(token) }), generation: 1, delivery: dv.delivery, registeredAt: t, rotatedAt: null, revokedAt: null, lastCallAt: null };
      p.callers.push(row);
      save(next);
      bus.emit('change', { slug, id });
      return { caller: callerView(row), token };
    },
    rotate(slug, id) {
      const next = clone();
      const c = ((next.paths[slug] || {}).callers || []).find((x) => x.id === id);
      if (!c || c.revokedAt) throw Object.assign(new Error(`no live caller ${id} on ${slug}`), { code: 'not-found' });
      const token = PT.mintToken('webhook');
      if (c.auth === 'bearer') { c.tokenHash = PT.tokenHash(token); delete c.tokenEnc; } else { c.tokenEnc = S.secrets.seal(token); delete c.tokenHash; }
      c.generation = (Number(c.generation) || 1) + 1; c.rotatedAt = now();
      save(next);
      bus.emit('change', { slug, id });
      return { caller: callerView(c), token };
    },
    /** verify r1 #16 (int248 r2): take back a row the register route could not finish (its index / people sync threw) —
     *  the token was never shown, so no holder exists; the row leaves callers.json whole. */
    unregister(slug, id) {
      const next = clone();
      const p = next.paths[slug];
      if (!p || !(p.callers || []).some((x) => x.id === id)) return false;
      p.callers = p.callers.filter((x) => x.id !== id);
      save(next);
      bus.emit('change', { slug, id });
      return true;
    },
    revoke(slug, id) {
      const next = clone();
      const c = ((next.paths[slug] || {}).callers || []).find((x) => x.id === id);
      if (!c) throw Object.assign(new Error(`no caller ${id} on ${slug}`), { code: 'not-found' });
      if (!c.revokedAt) { c.revokedAt = now(); c.generation = (Number(c.generation) || 1) + 1; delete c.tokenHash; delete c.tokenEnc; delete c.outEnc; save(next); }
      bus.emit('change', { slug, id });
      return callerView(c);
    },
    setDelivery(slug, id, delivery) {
      const dv = deliveryVerdict(delivery);
      if (!dv.ok) throw Object.assign(new Error(dv.error), { code: 'bad-request' });
      const next = clone();
      const c = ((next.paths[slug] || {}).callers || []).find((x) => x.id === id && !x.revokedAt);
      if (!c) throw Object.assign(new Error(`no live caller ${id} on ${slug}`), { code: 'not-found' });
      c.delivery = dv.delivery;
      save(next);
      return callerView(c);
    },
    /** A caller id nobody on this path holds (a pairing code reserves one before the row exists). */
    freshId(slug) { const have = S.callersRaw(slug); let id; do { id = `c-${crypto.randomBytes(4).toString('hex')}`; } while (have.some((c) => c.id === id)); return id; },
    /** THE PAIRING's one write (lane webhook-l3-cli-pair, §12): a `peer` caller holding the token THIS side issued (`token`,
     *  minted by the route through pairing-token) and the token the OTHER side issued (`outToken` — what this side signs its
     *  sends to the peer's hook with, as `outCaller` there), both sealed in the secret box; delivery reply-url = the peer's
     *  hook. An existing peer row of that id is ROTATED IN PLACE (generation + 1) — its old tokens stop working at once. */
    pair(slug, { id, name, token, outToken, outCaller, replyUrl } = {}) {
      if (!load().paths[slug]) throw Object.assign(new Error(`no path ${slug}`), { code: 'not-found' });
      if (!S.secrets) throw Object.assign(new Error('the secret box is not available'), { code: 'unavailable' });
      if (!WP.CALLER_RE.test(String(id)) || !WP.CALLER_RE.test(String(outCaller)) || !WP.TOKEN_RE.test(String(token)) || !WP.TOKEN_RE.test(String(outToken))) throw Object.assign(new Error('a pairing names caller ids and tokens of the expected shape'), { code: 'bad-request' });
      const dv = deliveryVerdict({ mode: 'reply-url', replyUrl });
      if (!dv.ok) throw Object.assign(new Error(dv.error), { code: 'bad-request' });
      const next = clone();
      const p = next.paths[slug];
      const t = now();
      let c = p.callers.find((x) => x.id === id);
      if (c && (c.revokedAt || c.kind !== 'peer')) throw Object.assign(new Error(`${id} is ${c.revokedAt ? 'revoked' : 'not a peer'} on ${slug} — mint a new code`), { code: 'bad-request' });
      if (!c) { c = { id, name: cleanName(name) || 'VibeSpace', kind: 'peer', auth: 'hmac', generation: 0, registeredAt: t, rotatedAt: null, revokedAt: null, lastCallAt: null }; p.callers.push(c); }
      else c.rotatedAt = t;
      c.name = cleanName(name) || c.name; c.tokenEnc = S.secrets.seal(token); delete c.tokenHash; c.outEnc = S.secrets.seal(outToken); c.outCaller = outCaller;
      c.delivery = dv.delivery; c.generation = (Number(c.generation) || 0) + 1;
      save(next);
      bus.emit('change', { slug, id });
      return callerView(c);
    },
    /** The token a PEER issued to this side (what a send to its hook is signed with) — null for any other caller. */
    outKeyOf(c) {
      if (!c || c.revokedAt || c.kind !== 'peer' || !c.outEnc) return null;
      try { return S.secrets ? S.secrets.open(c.outEnc) : null; } catch { return null; }
    },
    noteCall(slug, id, t) { const c = S.caller(slug, id); if (c) c.lastCallAt = t; },   // in memory; the next write keeps it
    notePollDropped(slug, id, n) { if (!n) return; const next = clone(); const c = ((next.paths[slug] || {}).callers || []).find((x) => x.id === id); if (c) { c.pollDropped = (Number(c.pollDropped) || 0) + n; save(next); } },
    /** THE KEY a caller's receipts, cursors and reply signatures are made with: an HMAC caller's token (opened from
     *  the box), a Bearer caller's token HASH (the record holds nothing else — the caller computes sha256(token)). */
    keyOf(c) {
      if (!c || c.revokedAt) return null;
      if (c.auth === 'bearer') return typeof c.tokenHash === 'string' ? c.tokenHash : null;
      try { return S.secrets && c.tokenEnc ? S.secrets.open(c.tokenEnc) : null; } catch { return null; }
    },
    reset() { if (!hold.held()) doc = null; },   // a held store is read again by its ladder, never here
  };
  STORES.set(file, S);
  return S;
}
function deliveryVerdict(d) {
  const x = d && typeof d === 'object' ? d : { mode: d };
  const mode = DELIVERY.includes(x.mode) ? x.mode : null;
  if (!mode) return { ok: false, error: `delivery must be one of ${DELIVERY.join('|')}` };
  if (mode !== 'reply-url') return { ok: true, delivery: { mode } };
  let u; try { u = new URL(String(x.replyUrl || '')); } catch { return { ok: false, error: 'reply-url needs an absolute replyUrl' }; }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return { ok: false, error: 'replyUrl must be an http(s) address without credentials' };
  return { ok: true, delivery: { mode, replyUrl: u.href.slice(0, 2000) } };
}

// ── THE POLL QUEUE: data/channels/webhook/replies/<slug>/<callerId>.ndjson (≤ 200 lines, ≤ 7 days) ─────────────────
function queueFile(dir, slug, id) { return path.join(dir, 'replies', slug, `${id}.ndjson`); }
// B-574d slice «channels-small-stores» (lane nl-journals, 主开发 r4939): a poll-mode caller's reply queue goes through THE STORE WRITER —
// the APPEND's own read takes the writer's OWED bytes first (it builds on an append not landed yet: its seq continues), then the file.
// THE CALLER'S POLL hands out LANDED lines only (the file): a caller's cursor never moves past a line a dying hub could still lose — a
// restart would number the next reply with that same seq and the cursor would hide it (the slice's own adversarial read). A long-poll is
// woken at the LANDING (onWritten), so a wake finds the reply. THE TAKE (r4939): a poll removes nothing it hands over — its cursor and the
// 7-day age decide what it sees — kept exactly as the release did: no new duplicate, no new loss
const writerOf = (S) => (S && S.writer) || require('../store-writer.js').storeWriter();
function queueText(S, f) { const W = writerOf(S), owed = W && typeof W.owed === 'function' ? W.owed(f) : null; return owed != null ? owed : fs.readFileSync(f, 'utf-8'); }
function queueRead(S, slug, id, t, { landed = false } = {}) {
  let lines = [];
  try { const f = queueFile(S.dir, slug, id); lines = (landed ? fs.readFileSync(f, 'utf-8') : queueText(S, f)).split('\n').filter(Boolean); } catch { return []; }
  const out = [];
  for (const l of lines) { try { const x = JSON.parse(l); if (x && Number.isInteger(x.seq) && t - Number(x.at) <= POLL_TTL_MS) out.push(x); } catch { } }
  return out;
}
function queueAppend(S, slug, id, item, t) {
  const all = queueRead(S, slug, id, t);
  let raw = 0; try { raw = queueText(S, queueFile(S.dir, slug, id)).split('\n').filter(Boolean).length; } catch { }
  const seq = (all.length ? all[all.length - 1].seq : 0) + 1;
  all.push({ seq, at: t, ...item });
  const keep = all.slice(-POLL_MAX);
  const dropped = (raw - (all.length - 1)) + (all.length - keep.length);
  const f = queueFile(S.dir, slug, id);
  fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 });
  // B-574d: handed to THE STORE WRITER (its thread writes, syncs and renames the queue, 0600) — readable at once by the poll (the owed
  // bytes), its sender answered once it LANDED (`landed`, off the loop — whoever sends: an agent's reply or a person's, nothing waits on
  // the loop); a landing that fails is said by the writer and the reply stays queued in it, written again
  const text = keep.map((x) => JSON.stringify(x)).join('\n') + '\n', W = writerOf(S);
  W.dirty(f, { name: 'webhook-replies.write', mode: 0o600, produce: () => text, onWritten: (ok) => { if (ok) { try { S.bus.emit('reply', { slug, id }); } catch { /* a listener's */ } } } });   // the long-poll woken at the LANDING
  if (dropped > 0) S.notePollDropped(slug, id, dropped);
  return { seq, landed: (opts) => Promise.resolve(W.durable(f, opts)).catch(() => false) };
}
/** The caller's OWN cursor: `<seq base36>.<hmac(key, seq)[:12]>` — forged or another caller's ⇒ null. */
function cursorOf(key, seq) { return `${seq.toString(36)}.${hmacHex(key, `cursor:${seq}`).slice(0, 12)}`; }
function cursorSeq(key, cur) {
  if (cur === undefined || cur === null || cur === '') return 0;
  const m = /^([0-9a-z]{1,10})\.([0-9a-f]{12})$/.exec(String(cur));
  if (!m) return null;
  const seq = parseInt(m[1], 36);
  return crypto.timingSafeEqual(Buffer.from(hmacHex(key, `cursor:${seq}`).slice(0, 12)), Buffer.from(m[2])) ? seq : null;
}
/** The poll answer: `{replies, cursor, dropped}` — the caller's own replies after its cursor, nothing about anyone else. */
function pollAnswer(S, slug, c, cur, t) {
  const key = S.keyOf(c);
  const since = cursorSeq(key, cur);
  if (since === null) return null;
  const items = queueRead(S, slug, c.id, t, { landed: true }).filter((x) => x.seq > since).slice(0, 50);   // LANDED lines only (B-574d)
  const last = items.length ? items[items.length - 1].seq : since;
  return { ok: true, replies: items.map((x) => ({ replyId: x.replyId, inReplyTo: x.inReplyTo || null, at: x.at, from: { name: x.replyName }, text: x.text })), cursor: cursorOf(key, last), dropped: Number(c.pollDropped) || 0 };
}

function create(record = {}, deps = {}) {
  const clock = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const log = deps.log || console;
  const dir = typeof deps.ownDir === 'string' && deps.ownDir ? deps.ownDir : null;
  const S = dir ? callersStore(dir, { secrets: deps.secrets || null, now: clock, writer: deps.writer || null }) : null;
  const setting = typeof deps.setting === 'function' ? deps.setting : () => undefined;
  const findRecord = typeof deps.findRecord === 'function' ? deps.findRecord : () => null;
  const fetchFence = typeof deps.fenceFetch === 'function' ? deps.fenceFetch : EF.fenceFetch;
  let emitter = null, onState = null, beat = null;
  // B-f276's family (r3145): callers.json HELD answers its own words to every lookup — retryable, never «not found» / «no caller»
  const heldError = () => new ChannelError('transport', S.heldWords(), { retryable: true, detail: { why: 'callers-unread', named: true } });
  const need = () => { if (!S) throw new ChannelError('send-not-available', 'the webhook adapter has no data directory', { retryable: false, detail: { why: 'no-store' } }); if (S.held()) throw heldError(); return S; };
  const refusal = (r) => new ChannelError(r.code === 'bad-proposal' ? 'send-not-available' : r.code, r.error, { retryable: false, detail: { why: r.why, named: true, callers: (r.callers || []).map((c) => ({ id: c.id, name: c.name, delivery: c.delivery })) } });

  async function deliverTo(convId, c, { text, replyId, inReplyTo, budgetMs = null }) {
    const st = need();
    const p = st.path(convId) || { replyName: REPLY_NAME_DEFAULT };
    const t = clock();
    if (c.delivery.mode === 'poll') {
      // B-574d: answered once the queue LANDED — the wait bounded by the send's own budget when it has one (an agent's waiting command)
      const onDisk = await queueAppend(st, convId, c.id, { replyId, inReplyTo, replyName: p.replyName, text }, t).landed(Number(budgetMs) > 0 ? { timeoutMs: Math.max(1, Math.floor(Number(budgetMs))) } : undefined);
      // r5041 (主开发, MUST 1): a reply NOT ON DISK in the send's budget is answered as the release answered its throw — not ok, the
      // transport class, not retried, LOST: the person's card reads «unknown» (never «sent» over a line a restart would lose); the
      // writer keeps the line and writes it when the storage comes back
      if (!onDisk) return { ok: false, code: 'transport', retryable: false, detail: { lost: true, why: 'not-on-disk', message: 'the reply is queued but not on disk yet — it is written when the storage comes back; it is lost if VibeSpace restarts first' } };
      return { ok: true, vendorMessageId: replyId, at: t, sentAs: 'user', lane: 'poll' };
    }
    if (c.delivery.mode !== 'reply-url') return { ok: false, code: 'send-not-available', retryable: false, detail: { why: 'delivery-none', reason: `${c.name} (${c.id}) takes no replies (its delivery is none)` } };
    // lane webhook-l3-cli-pair: a PEER (another VibeSpace) is called AS this side's caller on ITS path — the canonical payload,
    // signed with the token it issued to us (`outKeyOf`), over its own /hook/<slug> (a path prefix in front is not signed)
    const peer = c.kind === 'peer';
    const hv = peer ? WP.hookUrlVerdict(c.delivery.replyUrl, { allowPrivate: true }) : null;
    const key = peer ? st.outKeyOf(c) : st.keyOf(c);
    if (!key || (peer && (!hv.ok || !c.outCaller))) return { ok: false, code: 'not-found', retryable: false, detail: { why: 'caller-revoked', reason: `${c.id} has no live key` } };
    const body = peer ? WP.peerBody({ text, inReplyTo, name: p.replyName }) : JSON.stringify({ path: convId, inReplyTo: inReplyTo || null, replyId, at: t, from: { name: p.replyName }, text });
    let u; try { u = new URL(c.delivery.replyUrl); } catch { return { ok: false, code: 'not-found', retryable: false, detail: { why: 'bad-reply-url' } }; }
    const ts = String(Math.floor(t / 1000));
    const sig = `v1=${hmacHex(key, WA.signatureBase(ts, peer ? `/hook/${hv.slug}` : u.pathname, body))}`;
    const peerHeads = peer ? { [WA.HEADERS.caller]: c.outCaller, [WA.HEADERS.key]: replyId, [WP.PEER_HEADER]: WP.PEER_VERSION } : {};
    const r = await fetchFence(c.delivery.replyUrl, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'User-Agent': 'VibeSpace-webhook', [WA.HEADERS.ts]: ts, [WA.HEADERS.sig]: sig, ...peerHeads }, allowPrivate: setting('webhook.allowPrivateReplyUrl') === true });
    if (r.ok) return { ok: true, vendorMessageId: replyId, at: t, sentAs: 'user', lane: 'reply-url' };
    const said = r.status ? `the reply URL answered HTTP ${r.status}` : (r.error || r.code || 'refused');
    if (r.code === 'lost') return { ok: false, code: 'transport', retryable: false, detail: { lost: true, why: 'lost', reason: said } };
    return { ok: false, code: 'transport', retryable: false, detail: { why: r.code || `http-${r.status}`, reason: said } };
  }

  return {
    auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['local'], why: null, user: 'you' }; } },
    /** THE PUSH DOOR: `start` registers the engine's emitter (a heartbeat keeps the lane "live" between calls);
     *  `deliver(ev)` is the inbound route's one way in — before a start it answers `not-armed` (the route says 503). */
    live: {
      start({ onEvent, onState: os } = {}) {
        emitter = typeof onEvent === 'function' ? onEvent : null;
        onState = typeof os === 'function' ? os : null;
        const tick = () => { try { if (onState) onState({ state: 'live', heard: true, at: clock() }); } catch (e) { log.warn(`[webhook] heartbeat: ${(e && e.message) || e}`); } };
        tick();
        beat = setInterval(tick, 60 * 1000); if (beat.unref) beat.unref();
        return { stop() { emitter = null; onState = null; if (beat) clearInterval(beat); beat = null; } };
      },
      async deliver(ev) { if (!emitter) return { ok: false, why: 'not-armed', persisted: false }; return emitter(ev); },
    },
    async listConversations() {
      if (!S) return { conversations: [], cursor: null, complete: true };
      if (S.held()) throw heldError();   // r3145: a held list is no COMPLETE listing — its paths are never marked unlisted by its silence
      const conversations = S.paths().map((slug) => { const p = S.path(slug); const cs = S.callers(slug).filter((c) => !c.revokedAt); return { id: slug, vendorId: slug, title: p.title, kind: cs.length > 1 ? 'group' : 'dm', participants: cs.map((c) => c.name).join(', ') || p.title, lastAt: null }; });
      return { conversations, cursor: null, complete: true };
    },
    async convCaps(convId) {
      if (S && S.held()) throw heldError();   // r3145: held — never «not-found» for a path the unread list may hold
      const p = S ? S.path(convId) : null;
      const n = p ? S.callers(convId).filter((c) => !c.revokedAt).length : 0;
      return p && !p.disabled ? { read: 'yes', sendAs: ['user'], why: null, at: clock(), audience: { kind: 'external', orgs: [], members: n } } : { read: 'yes', sendAs: [], why: p ? 'disabled' : 'not-found', at: clock() };
    },
    async history() { return { records: [], anchor: null, reachedAnchor: true, complete: true }; },
    async composeCaps() { return { sendAs: ['user'], why: null, at: clock() }; },
    /** WHO the reply goes to — the answered record's author caller (explicit `--to`), or the path's one caller when the
     *  engine chose the newest record itself (`implicit`); several ⇒ `ambiguous-caller` (nothing proposed). */
    async replyEnvelope(convId, { anchorId, implicit = false } = {}) {
      const st = need();
      const anchor = anchorId ? findRecord(convId, anchorId) : null;
      const r = RP.replyTarget({ anchor, anchorId, convId, callers: st.callersRaw(convId), implicit: implicit === true });
      if (!r.ok) throw refusal(r);
      // the anchor names its own caller only on an explicit --to; an implicit reply answers the one caller's newest call
      return RP.envelopeOf({ anchorId, callerId: r.caller.id, recordVendorId: anchor && WR.callerOfRecord(anchor) === r.caller.id ? anchor.vendorId : null });
    },
    /** A proposal's text decided once; with `recipients` (compose --caller <id>[,<id>]|all) the callers it expands to. */
    async prepareSend(convId, { text, recipients } = {}) {
      const base = { text: String(text == null ? '' : text), notifies: [], unresolved: [], plain: [], mentions: [], tooLong: String(text || '').length > 16000, sendMax: 16000 };
      if (recipients === undefined || recipients === null) return base;
      const r = RP.composeTargets({ spec: recipients, callers: need().callersRaw(convId) });
      if (!r.ok) throw refusal(r);
      return { ...base, notifies: r.callers.map((c) => c.name), recipients: r.callers.map((c) => c.id), skipped: r.skipped.map((c) => c.id) };
    },
    /** THE SEND — the caller is RE-READ now (revoked ⇒ not-found; rotated ⇒ its new key signs). */
    async send(convId, { text, idemKey, envelope = null, budgetMs = null } = {}) {
      // r3145: held — the send waits (retryable, the hold's words), never «no longer a caller» of a caller the unread list holds
      // r3223 (2): nothing re-sends a refused reply (the outbox keeps it failed), so its reason says so plainly — never as if it will go
      if (S && S.held()) return { ok: false, code: 'transport', retryable: true, detail: { why: 'callers-unread', reason: NOT_SENT_WHILE_HELD } };
      const st = need();
      const to = envelope && typeof envelope.to === 'string' ? envelope.to : null;
      const c = to ? st.caller(convId, to) : null;
      if (!c || c.revokedAt) return { ok: false, code: 'not-found', retryable: false, detail: { why: 'caller-revoked', reason: `${String(to || 'the caller').slice(0, 40)} is no longer a caller of ${convId}` } };
      // verify r1 #0 (int248 r2): the reply id is PER-CALLER OPAQUE — HMAC(the caller's key, 'reply:' + the proposal id)[:16],
      // the receiptId recipe; the outbox's instance-wide counter and its clock never leave the instance (the vendorMessageId
      // is this same id, so X-In-Reply-To → record.replyTo and reply-to-sent still correlate)
      const replyId = `${c.id}:${hmacHex(st.keyOf(c) || c.id, `reply:${String(idemKey || clock())}`).slice(0, 16)}`;
      let inReplyTo = null;
      if (envelope && envelope.inReplyTo) { const key = st.keyOf(c); const anchor = findRecord(convId, envelope.inReplyTo); if (key && anchor && anchor.id) inReplyTo = hmacHex(key, anchor.id).slice(0, 16); }
      return deliverTo(convId, c, { text: String(text == null ? '' : text), replyId, inReplyTo, budgetMs });
    },
    /** A composed message (no anchor): `to` = [callerId], `convId` = the path. */
    async compose({ convId, to, text, idemKey } = {}) {
      const id = Array.isArray(to) ? String(to[0] || '') : String(to || '');
      return this.send(String(convId || ''), { text, idemKey, envelope: { to: id } });
    },
    /** lane webhook-l3-cli-pair: the path's live callers as an agent's `read` prints them — id, name, kind, delivery mode,
     *  last call, generation (never a key, a hash or a reply URL). */
    /** verify r1 #17 (int248 r2): the facts a wake block carries under a call's text (design §5's card): the sender fact
     *  and the path's declared fields — DECLARED here, so the engine names no adapter kind. */
    wakeFactKeys: Object.freeze(['sender', 'fields']),
    callersOf(convId) {
      return need().callers(String(convId || '')).filter((c) => !c.revokedAt)
        .map((c) => ({ id: c.id, name: c.name, kind: c.kind, delivery: c.delivery.mode, lastCallAt: c.lastCallAt || null, generation: c.generation }));
    },
    /** No caller-side lookup exists: a lost reply stays `unknown`; a person re-sends it (the receipt says so). */
    async reconcile() { return { unknown: true }; },
  };
}

/** THE DECLARED EGRESS (§3.1): no vendor host — every request goes to an OWNER-CONFIGURED reply URL through
 *  src/egress-fence.js, judged by the address it resolves to (test-channels-egress's owner-configured leg). */
const EGRESS = Object.freeze([]);
/** lane vault-contents-window: THE VAULT WINDOW's rows of this adapter's own sealed file — each HMAC caller's secret and each
 *  paired caller's outbound token (a Bearer caller keeps a hash only: nothing to show); masked — the ciphertext rides only
 *  to src/vault-inventory.js's length class. `vaultReveal` opens ONE of them with the channels box the engine hands in. */
const CALLER_FIELD_RE = /^caller\.(.+)\.(c-[0-9a-f]{1,32})\.(token|out)$/;
/** r3223 (1): THE DECLARED NOTE about this adapter's own list, for the account's section (src/server/channels-engine.js adapterView):
 *  { code: 'held' } while callers.json could not be read, { code: 'torn', copy, since } after a torn lift of this run, else null.
 *  A fact the panel words (src/lib/webhook-view.js) — no path, caller or token in it. */
function listNote({ ownDir } = {}) {
  if (!ownDir) return null;
  const S = callersStore(ownDir);
  if (S.held()) return { code: 'held' };
  const t = S.torn();
  return t ? { code: 'torn', copy: t.copy, since: t.since } : null;
}
function vaultRows({ ownDir } = {}) {
  if (!ownDir) return [];
  const S = callersStore(ownDir), out = [];
  for (const slug of S.paths()) {
    for (const c of S.callersRaw(slug)) {
      if (!c || !/^c-[0-9a-f]{1,32}$/.test(String(c.id))) continue;
      if (typeof c.tokenEnc === 'string' && c.tokenEnc) out.push({ field: `caller.${slug}.${c.id}.token`, kind: 'secret', label: c.name || c.id, detail: slug, createdAt: c.createdAt || null, cipher: c.tokenEnc });
      if (typeof c.outEnc === 'string' && c.outEnc) out.push({ field: `caller.${slug}.${c.id}.out`, kind: 'token', label: c.name || c.id, detail: slug, createdAt: c.createdAt || null, cipher: c.outEnc });
    }
  }
  return out;
}
function vaultReveal({ ownDir, secrets } = {}, field) {
  const m = CALLER_FIELD_RE.exec(String(field || ''));
  if (!m || !ownDir || !secrets || typeof secrets.open !== 'function') return null;
  const c = callersStore(ownDir).caller(m[1], m[2]);
  const blob = c && (m[3] === 'token' ? c.tokenEnc : c.outEnc);
  return typeof blob === 'string' && blob ? secrets.open(blob) : null;
}

module.exports = {
  listNote,   // r3223 (1): the account section's note about the list (held / torn this run)
  vaultRows, vaultReveal, // lane vault-contents-window: the Vault window's rows of callers.json (the engine asks a module that declares them)
  kind: KIND, caps, create, label: 'Webhook', policyDefault: 'direct', sendStartsTurn: false, EGRESS,
  removable: false, consent: null, reach: 'grants', listed: true, seed: true,
  callersStore, callerView, deliveryVerdict, pollAnswer, cursorOf, cursorSeq, queueAppend, hmacHex, POLL_MAX, POLL_TTL_MS, REPLY_NAME_DEFAULT, pairPendingDoor, PENDING_FILE, CALLERS_FILE,
  CALLERS_UNREAD, PENDING_UNREAD,   // B-f276's family (r3145): the two held codes (503) the routes and the page answer by name
};
