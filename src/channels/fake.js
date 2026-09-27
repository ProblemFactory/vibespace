'use strict';
/**
 * THE FAKE ADAPTER — the P0 conformance driver
 * (docs/design-communication-panel.zh.md §19's P0 entry).
 *
 * It TALKS TO NOTHING. Its traffic is generated deterministically from a
 * fixed seed, so the panel, the window, a restart and a second client all see
 * the same conversations, and so the parity claims have a leg from day one
 * rather than from the first real vendor.
 *
 * IT REALLY RUNS ALL THREE RECEIVE MODES, because the two axes are the thing
 * P0 is proving:
 *
 *   fake-poll   receive:'poll'  · sendAs:['user'] · the ordinary lane
 *   fake-push   receive:'push'  · sendAs:[]       · a live lane with a real
 *                 `live.start()` that emits on a timer and heartbeats, so
 *                 `laneState`'s liveness/demotion precedence has something
 *                 to resolve — AND a READ-ONLY adapter, which is how the P0
 *                 exit condition "a read-only conversation renders NO send
 *                 control at all" is observable at all
 *   fake-scan   receive:'scan' · BOTH sources, per platform:
 *                 darwin → 'store' (a real client id ⇒ historyBySource
 *                          'since', `raw.synthetic` false)
 *                 linux/win32 → 'ui' (no stable id ⇒ a DECLARED synthetic
 *                          key ⇒ historyBySource 'page')
 *
 * WHICH SOURCE A history() CALL READS IS HANDED DOWN by the engine as
 * `opts.source` (the answer of `scanState()`, the ONE resolver); this module
 * never re-derives it — see the note inside `create()` (r3).
 *
 * THE SYNTHETIC KEY IS THE POINT OF THE `'ui'` HALF (design §5 invariant 2):
 * the invariant wants A key, not a vendor-issued one — but an UNDECLARED
 * synthetic key turns every re-scan into a batch of duplicates, so this
 * adapter mints one DETERMINISTICALLY from the message's own content and
 * instant and marks it `raw.synthetic: true`. Scanning the same screen twice
 * is then a no-op by construction, and the same day's traffic read through
 * `'store'` and through `'ui'` yields the same message CONTENT with the key
 * provenance as the only difference.
 *
 * ENABLING IT IS AN EXPLICIT, NAMED SEAM: `VIBESPACE_CHANNELS_FAKE=1` (read by
 * src/server/channels-engine.js). With it unset the product registers the
 * adapters — so the contract suite can drive them — and creates NO records, so
 * a user's panel is empty rather than full of invented conversations.
 */
const { makeRecord, makeConversation } = require('../channel-record.js');

/** A tiny deterministic PRNG — the same traffic on every boot, every client. */
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** A stable 8-hex digest — the synthetic key's minting rule. */
function digest(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const PEOPLE = [
  { id: 'u-ada', name: 'Ada' },
  { id: 'u-brook', name: 'Brook' },
  { id: 'u-cass', name: 'Cass' },
];
const LINES = [
  'the deploy finished, logs look clean',
  'can someone look at the staging box?',
  'moved the meeting to 3pm',
  'that ticket is ready for review',
  'heads up: the nightly job was slow again',
  'thanks — merged',
];

/** A tiny valid PNG (8×8, one colour per room) — what an image attachment
 *  of the fake world FETCHES (2026-09-26: the aggregated IM's image
 *  thumbnails are driven end to end through our own route). */
function fixturePng(seed) {
  const zlib = require('zlib');
  const r = rng(`png:${seed}`);
  const [R, G, B] = [Math.floor(r() * 200) + 30, Math.floor(r() * 200) + 30, Math.floor(r() * 200) + 30];
  const w = 8, h = 8;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = R; raw[o + 1] = G; raw[o + 2] = B; } }
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** The conversations this adapter shows, per kind. Deterministic.
 *  `convs` (2026-09-26, the NAMED seam `VIBESPACE_CHANNELS_FAKE_CONVS=<n>`,
 *  read by `create()` below and nowhere else) adds n synthetic rooms after
 *  the two base ones — every third record of a synthetic room carries an
 *  attachment (an image or a text file), so the reader surface (thumbnails,
 *  downloads) has something real to fetch; the base rooms are unchanged. */
function worldFor(kind, { now = Date.now(), days = 1, convs: extra = 0 } = {}) {
  const convs = [
    { id: `${kind}-ops`, title: 'Ops room', kind: 'group', participants: 'Ada, Brook, Cass', readable: true, sendable: true },
    { id: `${kind}-announce`, title: 'Announcements', kind: 'group', participants: 'Ada', readable: true, sendable: false, why: 'read-only-mailbox' },
  ];
  const n = Math.max(0, Math.min(5000, Math.floor(Number(extra) || 0)));
  for (let i = 1; i <= n; i++) convs.push({ id: `${kind}-room-${i}`, title: `Room ${i}`, kind: i % 5 === 0 ? 'dm' : 'group', participants: 'Ada, Cass', readable: true, sendable: true, synthetic: true });
  const out = new Map();
  for (const c of convs) {
    const r = rng(`${kind}:${c.id}`);
    const records = [];
    const span = days * 86400e3;
    const count = 6 + Math.floor(r() * 6);
    for (let i = 0; i < count; i++) {
      const who = PEOPLE[Math.floor(r() * PEOPLE.length)];
      // Instants are derived from the seed and pinned to a DAY boundary, so a
      // restart reproduces them exactly (the window must come back identical).
      // They are spread over TWO spans from that boundary, never one: the
      // engine's markRead contract (and its suite) rely on this adapter
      // ALWAYS holding a future-dated record — a vendor's clock skew, modelled
      // — and a one-span spread left the last 1/(count+1) of every UTC day
      // (2.4 h for a 9-record room) with nothing ahead of the clock, so the
      // mandatory gate went red on any push in that window (2026-09-14
      // 21:44Z, measured). With two spans the newest instant is at least
      // span + span/(count+1) past the boundary, i.e. past any `now` inside it.
      const base = Math.floor(now / span) * span;
      const at = base + Math.floor((i + 1) * ((2 * span) / (count + 1)));
      const m = { vendorId: `${c.id}-m${i}`, at, author: who, text: LINES[Math.floor(r() * LINES.length)] };
      if (c.synthetic && i % 3 === 0) m.attachments = [i % 2 === 0 ? { id: `${c.id}-img${i}`, name: `photo-${i}.png`, bytes: null, mime: 'image/png' } : { id: `${c.id}-file${i}`, name: `notes-${i}.txt`, bytes: null, mime: 'text/plain' }];
      // R3 (§23): a synthetic room's FIRST message is a picture in LARK'S shape — the text is the
      // placeholder "[image]", the attachment a generic `image/*` named "image" that says so
      if (c.synthetic && i === 0) { m.text = '[image]'; m.attachments = [{ id: `${c.id}-img0`, name: null, bytes: null, mime: 'image/*', placeholder: '[image]' }]; }
      records.push(m);
    }
    // R3 (§23): room 2 ends with two pictures the fake VENDOR refuses — one for good (`-gone`: forbidden)
    // and one only the first time (`-flaky`: rate-limited, then served) — the window's named chip and its
    // own retry, driven end to end
    if (c.synthetic && /-room-2$/.test(c.id)) {
      const last = records.length ? records[records.length - 1].at : Math.floor(now / span) * span;
      records.push({ vendorId: `${c.id}-m-pics`, at: last + 1000, author: PEOPLE[0], text: '[image]\n[image]', attachments: [{ id: `${c.id}-gone`, name: null, bytes: null, mime: 'image/*', placeholder: '[image]' }, { id: `${c.id}-flaky`, name: null, bytes: null, mime: 'image/*', placeholder: '[image]' }] });
    }
    records.sort((a, b) => a.at - b.at);
    out.set(c.id, { meta: c, records });
  }
  return out;
}

/** `'ui'` has no stable id, so it DECLARES one derived from the content. */
const syntheticKey = (adapterId, convId, m) => `syn-${digest(`${adapterId}|${convId}|${m.at}|${m.author.id}|${m.text}`)}`;

function toRecord(adapterId, convId, m, { synthetic = false } = {}) {
  return makeRecord({
    adapterId, convId,
    vendorId: synthetic ? syntheticKey(adapterId, convId, m) : m.vendorId,
    at: m.at,
    author: { id: m.author.id, name: m.author.name, isSelf: false, isBot: false },
    text: m.text,
    mentions: [], attachments: Array.isArray(m.attachments) ? m.attachments : [], replyTo: null, threadKey: convId,
    raw: synthetic ? { synthetic: true, source: 'ui' } : { synthetic: false, source: 'store' },
  });
}

/**
 * Build one fake adapter MODULE. `receive` picks the axis-1 behaviour; the
 * caps are otherwise the same declaration a real adapter would make.
 */
function makeFakeAdapter({ kind, receive, sendAs = ['user'], now = () => Date.now() }) {
  const caps = {
    receive,
    pushTransport: receive === 'push' ? 'ws-long-conn' : null,
    pushAckBudgetMs: receive === 'push' ? 3000 : null,
    pollInterval: { hot: 30, cold: 300, floor: 10 },
    scanSources: receive === 'scan' ? { darwin: 'store', win32: 'ui', linux: 'ui' } : null,
    scanLatency: receive === 'scan' ? { store: 15, ui: 300 } : null,
    history: receive === 'scan' ? null : 'page',
    historyBySource: receive === 'scan' ? { store: 'since', ui: 'page' } : null,
    listConversations: true,
    sendAs,
    identityMarking: sendAs.length ? 'unknown' : 'none',
    identityMarkingWhere: null,
    identityMarkingText: null,
    tosRisk: 'none',
    idempotency: 'key',
    threading: 'thread-id',
    editSent: false,
    readReceipts: false,
    // 2026-09-26 (the aggregated IM): a fake attachment is FETCHED (a fixture
    // PNG / a text body), history pages back past the local log, and every
    // call is metered one request against a generous fixture budget
    attachments: receive === 'scan' ? 'metadata' : 'fetch',
    olderHistory: receive === 'scan' ? 'none' : 'page',
    budget: { unit: 'request', default: 600, settingKey: null, metered: true },
  };

  function create(record = {}, deps = {}) {
    const adapterId = record.id || kind;
    const clock = deps.now || now;
    // the NAMED seam, read HERE only: how many synthetic rooms to add
    const extraConvs = Number((deps.env || process.env).VIBESPACE_CHANNELS_FAKE_CONVS) || 0;
    let world = null;
    const getWorld = () => (world || (world = worldFor(kind, { now: clock(), convs: extraConvs })));
    const meter = typeof deps.meter === 'function' ? deps.meter : () => {};
    const refusedOnce = new Set();   // R3: the `-flaky` pictures refused once already
    // THE SCAN SOURCE ARRIVES AS `opts.source` ON EVERY history() CALL — the
    // engine resolves it with `scanState()` and hands it down, and the registry
    // refuses a scan-adapter page that carries none. This module used to keep
    // a `source()` closure that fell back to `caps.scanSources[process.platform]`
    // (r3): a second resolver, two lines under a comment saying there was
    // none, and the reason the engine could ingest through a lane the real
    // resolver had just called unavailable. There is deliberately nothing
    // here that reads `caps.scanSources` or `process.platform` except
    // `scanHost()`, whose whole job is to REPORT the platform.

    // THE §14 CREDENTIAL QUESTION IS ASKED OF THE ONE RESOLVER, never of
    // process.env: `deps.resolveIntegration('fake')` is the fake row's live
    // consumer (the registry census requires exactly this call in exactly
    // this file). With no resolver handed in (the contract suite creates
    // adapters bare) the fake answers as it always did; with one, a row that
    // resolves to `none` with a required field missing is `needs-credentials`
    // — the Adapters row flips, not only the Integrations card (§14.3).
    const resolveIntegration = typeof deps.resolveIntegration === 'function' ? deps.resolveIntegration : null;

    return {
      auth: {
        async state() {
          if (resolveIntegration) {
            let r = null;
            try { r = resolveIntegration('fake'); } catch (e) { return { state: 'unknown', expiresAt: null, scopes: [], why: `integration lookup failed: ${(e && e.message) || e}` }; }
            if (r && r.source === 'none' && Array.isArray(r.missing) && r.missing.length) {
              // the store's `whyCode`/`whyParams` ride beside its sentence, so the panel words the CODE (a3 i18n)
              return { state: 'needs-credentials', expiresAt: null, scopes: [], why: r.why || 'no-credentials', whyCode: r.whyCode || null, whyParams: r.whyParams || null, missing: r.missing.slice(), credentialSource: 'none' };
            }
            return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null, credentialSource: r ? r.source : null };
          }
          return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null };
        },
      },

      async listConversations() {
        meter(1);
        const list = [...getWorld().values()].map((c) => makeConversation({
          id: c.meta.id, vendorId: c.meta.id, title: c.meta.title, kind: c.meta.kind,
          participants: c.meta.participants, lastAt: c.records.length ? c.records[c.records.length - 1].at : null,
        }));
        return { conversations: list, cursor: null, complete: true };
      },

      /** Per-conversation, three-valued, and NEVER wider than `caps` (the
       *  registry enforces that too — this one narrows honestly). */
      async convCaps(convId) {
        meter(1);
        const c = getWorld().get(convId);
        if (!c) return { read: 'no', sendAs: [], why: 'not-a-member', at: clock() };
        if (!c.meta.sendable) return { read: 'yes', sendAs: [], why: c.meta.why || 'read-only-mailbox', at: clock() };
        return { read: 'yes', sendAs: caps.sendAs.slice(), why: null, at: clock() };
      },

      /**
       * Pages BACKWARD from the newest toward `anchor`, returning at most
       * `limit` and saying HONESTLY whether it got there. It advances nothing:
       * the cursor belongs to the store.
       */
      async history(convId, { anchor = null, limit = 50, source = null, initialMax = null } = {}) {
        meter(1);
        const c = getWorld().get(convId);
        if (!c) return { records: [], anchor: null, reachedAnchor: true, complete: true };
        // `source` is the RESOLVED one the engine handed down (see above).
        const synthetic = receive === 'scan' && source === 'ui';
        const all = c.records.map((m) => toRecord(adapterId, convId, m, { synthetic }));
        let idx = 0;
        if (anchor) {
          const at = all.findIndex((r) => r.vendorId === anchor);
          idx = at >= 0 ? at + 1 : 0;
        } else if (Number(initialMax) > 0 && receive !== 'scan') {
          // a FIRST ingest takes the newest page only; `older()` has the rest
          idx = Math.max(0, all.length - Number(initialMax));
        }
        const anchorFound = !anchor || idx > 0;
        const pending = all.slice(idx);
        const page = pending.slice(0, limit);
        const drained = page.length === pending.length;
        return {
          records: page,
          anchor: page.length ? page[page.length - 1].vendorId : anchor,
          // Honest on BOTH halves: we reached the stored anchor only if we
          // found it AND drained everything after it. An anchor we could not
          // find is an INCOMPLETE pass — `complete:false` says "do not
          // advance", which is design §5 invariant 4's whole point: a pass
          // that skipped is worse than a pass that re-reads.
          reachedAnchor: anchorFound && drained,
          complete: anchorFound && drained,
        };
      },

      /** HISTORY ON DEMAND: the newest `limit` records strictly before
       *  `before` ({at, vendorId}); `exhausted` once nothing older is left. */
      older: receive === 'scan' ? undefined : async (convId, { before = null, limit = 50 } = {}) => {
        meter(1);
        const c = getWorld().get(convId);
        if (!c) return { records: [], exhausted: true };
        const all = c.records.map((m) => toRecord(adapterId, convId, m));
        const olderThan = before ? all.filter((r) => r.at < Number(before.at) || (r.at === Number(before.at) && before.vendorId && r.vendorId < before.vendorId)) : all;
        const page = olderThan.slice(-Math.max(1, Number(limit) || 50));
        return { records: page, exhausted: page.length === olderThan.length };
      },
      /** ONE attachment's bytes: a fixture PNG for an image, a text body
       *  otherwise — only for an id a record of this conversation names. */
      fetchAttachment: receive === 'scan' ? undefined : async (convId, { messageId, attachmentId } = {}) => {
        meter(1);
        const c = getWorld().get(convId);
        const m = c && c.records.find((x) => x.vendorId === messageId);
        const a = m && Array.isArray(m.attachments) ? m.attachments.find((x) => x.id === attachmentId) : null;
        if (!a) { const { ChannelError } = require('./index.js'); throw new ChannelError('not-found', `fake: no attachment ${attachmentId} on ${messageId}`, { retryable: false }); }
        // R3 (§23): the fake vendor's two refusals — for good, and only the first time
        if (/-gone$/.test(a.id)) { const { ChannelError } = require('./index.js'); throw new ChannelError('forbidden', `fake: the vendor refuses ${a.id}`, { retryable: false }); }
        if (/-flaky$/.test(a.id) && !refusedOnce.has(a.id)) { refusedOnce.add(a.id); const { ChannelError } = require('./index.js'); throw new ChannelError('rate-limited', `fake: rate limited on ${a.id}`, { retryable: true, detail: { retryAfterSec: 2 } }); }
        if (/^image\//.test(a.mime || '')) return { data: fixturePng(a.id), mime: 'image/png', name: a.name };
        return { data: Buffer.from(`fixture attachment ${a.id} of ${messageId}\n`, 'utf-8'), mime: 'text/plain', name: a.name };
      },

      // ── receive:'push' — a REAL live lane (a timer, not a promise) ────────
      live: receive === 'push' ? {
        start({ onEvent, onState } = {}) {
          let stopped = false;
          onState && onState({ state: 'live', at: clock() });
          const t = setInterval(() => {
            if (stopped) return;
            // A heartbeat is what makes `laneState`'s liveness POSITIVE
            // evidence; a lane that only claims to be live is the
            // `opencode-events` round-4 lesson.
            onState && onState({ state: 'live', at: clock() });
            onEvent && onEvent({ kind: 'cursor-kick', at: clock() });
          }, 5000);
          if (t.unref) t.unref();
          return { stop() { stopped = true; clearInterval(t); onState && onState({ state: 'stopped', at: clock() }); } };
        },
      } : undefined,

      // ── receive:'scan' — facts about ONE machine; hostId is a PARAMETER ──
      scanHost: receive === 'scan' ? async (hostId) => ({
        hostId: hostId || null,
        platform: process.platform,
        clientInstalled: true,
        storePath: process.platform === 'darwin' ? '/fake/ChatStorage.sqlite' : null,
        grant: process.platform === 'darwin' ? 'granted' : null,
        why: null,
        at: clock(),
      }) : undefined,

      // `sendAs: []` adapters get NO send at all — the registry refuses it with
      // the typed `send-not-available` before this is ever reached.
      //
      // P4: the outcome is STEERED BY MARKERS IN THE TEXT, so a suite (and the
      // e2e run, from a real browser) can drive every §9.4 shape through the
      // real engine without a vendor: `[[fake:throw]]` = the adapter died
      // mid-send (a bare throw ⇒ `unknown`), `[[fake:lost]]` = the request
      // left and the answer never came (typed transport + `detail.lost` ⇒
      // `unknown`), `[[fake:refuse]]` = a typed refusal (⇒ `failed`),
      // `[[fake:as-bot]]` = the platform sent it as a bot whatever was asked
      // (the vendor's `sentAs` is the truth the receipt carries). The vendor
      // id is a function of (conversation, idempotency key, text) — a second
      // send with the same key is the same message, as the key promises.
      send: sendAs.length ? async (convId, { text, idemKey, as }) => {
        const s = String(text == null ? '' : text);
        if (/\[\[fake:throw\]\]/.test(s)) throw new Error('fake: socket hung up mid-send');
        if (/\[\[fake:lost\]\]/.test(s)) return { ok: false, code: 'transport', retryable: true, detail: { lost: true, message: 'fake: the request left and the answer never came' } };
        if (/\[\[fake:refuse\]\]/.test(s)) return { ok: false, code: 'forbidden', retryable: false, detail: { reason: 'fake: the fixture refused the send' } };
        const sentAs = /\[\[fake:as-bot\]\]/.test(s) ? 'bot' : (as || sendAs[0]);
        return { ok: true, vendorMessageId: `sent-${digest(`${convId}|${idemKey}|${s}`)}`, at: clock(), sentAs, observed: { senderType: sentAs === 'bot' ? 'app' : 'user' } };
      } : undefined,
      // `[[fake:landed]]` / `[[fake:not-landed]]` steer the reconcile answer;
      // anything else is honestly `unknown` (the default a real vendor gives
      // when it holds no evidence either way).
      reconcile: sendAs.length ? async (convId, { idemKey, text } = {}) => {
        const s = String(text == null ? '' : text);
        if (/\[\[fake:landed\]\]/.test(s)) return { landed: true, vendorMessageId: `sent-${digest(`${convId}|${idemKey}|${s}`)}`, at: clock(), detail: { how: 'fake-landed' } };
        if (/\[\[fake:not-landed\]\]/.test(s)) return { landed: false, reason: 'fake: the platform holds no such message', detail: { how: 'fake-not-landed' } };
        return { unknown: true, reason: 'fake: no evidence either way', detail: { how: 'fake-unknown' } };
      } : undefined,
    };
  }

  return { kind, caps, create };
}

/** The three modules P0 registers. `fake-push` is deliberately READ-ONLY. */
const fakePoll = makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] });
const fakePush = makeFakeAdapter({ kind: 'fake-push', receive: 'push', sendAs: [] });
const fakeScan = makeFakeAdapter({ kind: 'fake-scan', receive: 'scan', sendAs: ['user'] });

/**
 * The fake row's Test RUNNER (design §14.3 constraint 1: the consumer owns
 * the runner; the store only dispatches). `shape-only`: zero network. It
 * succeeds or fails on a FIXTURE SWITCH — a key containing "fail" fails —
 * so a failed Test has a leg on a card that ships in P0, with the vendor's
 * words (here: ours) reaching the card escaped.
 */
async function integrationTest({ resolved } = {}) {
  const r = resolved || {};
  if (r.source === 'none') return { ok: false, error: `no key resolved: ${r.why || 'nothing configured'}` };
  const key = String((r.values && r.values.apiKey) || '');
  if (key.length < 4) return { ok: false, error: 'the resolved key is shorter than 4 characters' };
  if (/fail/i.test(key)) return { ok: false, error: `the fixture switch: the resolved key contains "fail" (source: ${r.source})` };
  return { ok: true, detail: { source: r.source, region: (r.values && r.values.region) || null } };
}

module.exports = { makeFakeAdapter, fakePoll, fakePush, fakeScan, worldFor, syntheticKey, toRecord, integrationTest, fixturePng, FAKE_KINDS: ['fake-poll', 'fake-push', 'fake-scan'] };
