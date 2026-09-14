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

/** The conversations this adapter shows, per kind. Deterministic. */
function worldFor(kind, { now = Date.now(), days = 1 } = {}) {
  const convs = [
    { id: `${kind}-ops`, title: 'Ops room', kind: 'group', participants: 'Ada, Brook, Cass', readable: true, sendable: true },
    { id: `${kind}-announce`, title: 'Announcements', kind: 'group', participants: 'Ada', readable: true, sendable: false, why: 'read-only-mailbox' },
  ];
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
      records.push({ vendorId: `${c.id}-m${i}`, at, author: who, text: LINES[Math.floor(r() * LINES.length)] });
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
    mentions: [], attachments: [], replyTo: null, threadKey: convId,
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
    attachments: 'metadata',
  };

  function create(record = {}, deps = {}) {
    const adapterId = record.id || kind;
    const clock = deps.now || now;
    let world = null;
    const getWorld = () => (world || (world = worldFor(kind, { now: clock() })));
    // THE SCAN SOURCE ARRIVES AS `opts.source` ON EVERY history() CALL — the
    // engine resolves it with `scanState()` and hands it down, and the registry
    // refuses a scan-adapter page that carries none. This module used to keep
    // a `source()` closure that fell back to `caps.scanSources[process.platform]`
    // (r3): a second resolver, two lines under a comment saying there was
    // none, and the reason the engine could ingest through a lane the real
    // resolver had just called unavailable. There is deliberately nothing
    // here that reads `caps.scanSources` or `process.platform` except
    // `scanHost()`, whose whole job is to REPORT the platform.

    return {
      auth: {
        async state() { return { state: 'connected', expiresAt: null, scopes: ['fake'], why: null }; },
      },

      async listConversations() {
        const list = [...getWorld().values()].map((c) => makeConversation({
          id: c.meta.id, vendorId: c.meta.id, title: c.meta.title, kind: c.meta.kind,
          participants: c.meta.participants, lastAt: c.records.length ? c.records[c.records.length - 1].at : null,
        }));
        return { conversations: list, cursor: null, complete: true };
      },

      /** Per-conversation, three-valued, and NEVER wider than `caps` (the
       *  registry enforces that too — this one narrows honestly). */
      async convCaps(convId) {
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
      async history(convId, { anchor = null, limit = 50, source = null } = {}) {
        const c = getWorld().get(convId);
        if (!c) return { records: [], anchor: null, reachedAnchor: true, complete: true };
        // `source` is the RESOLVED one the engine handed down (see above).
        const synthetic = receive === 'scan' && source === 'ui';
        const all = c.records.map((m) => toRecord(adapterId, convId, m, { synthetic }));
        let idx = 0;
        if (anchor) {
          const at = all.findIndex((r) => r.vendorId === anchor);
          idx = at >= 0 ? at + 1 : 0;
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
      send: sendAs.length ? async (convId, { text, idemKey, as }) => ({
        ok: true, vendorMessageId: `sent-${digest(`${convId}|${idemKey}|${text}`)}`, at: clock(), sentAs: as || sendAs[0],
      }) : undefined,
      reconcile: sendAs.length ? async () => ({ unknown: true }) : undefined,
    };
  }

  return { kind, caps, create };
}

/** The three modules P0 registers. `fake-push` is deliberately READ-ONLY. */
const fakePoll = makeFakeAdapter({ kind: 'fake-poll', receive: 'poll', sendAs: ['user'] });
const fakePush = makeFakeAdapter({ kind: 'fake-push', receive: 'push', sendAs: [] });
const fakeScan = makeFakeAdapter({ kind: 'fake-scan', receive: 'scan', sendAs: ['user'] });

module.exports = { makeFakeAdapter, fakePoll, fakePush, fakeScan, worldFor, syntheticKey, toRecord, FAKE_KINDS: ['fake-poll', 'fake-push', 'fake-scan'] };
