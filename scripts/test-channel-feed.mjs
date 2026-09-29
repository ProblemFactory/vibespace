#!/usr/bin/env node
// THE CHANGE FEED'S PURE GATE (fast; lane lark-search-poll, B-5aab, 2026-09-28 — docs/design-communication-panel.zh.md §27).
// src/channel-feed.js owns the arithmetic of the account-wide "what changed" read (Lark's empty-query message search):
//   ① THE WINDOW — first run, steady, the overlap ≥ its floor, the 1-h clamp (the older span becomes a SINGLE-CHAT
//      catch-up), whole seconds, a clock that went backwards ⇒ no call, a window in flight continues, a token past its
//      TTL restarts the same window from page 1; a LAGGED-INDEX simulation: every message is found despite 0–55 s of
//      index lag (the overlap is what makes that true);
//   ② THE PAGE VERDICT — in-window hits pass; ANY hit outside [from − 120 s, to + 120 s] ⇒ `time-range-ignored` (an
//      edited old message is judged by its update); the `total` sanity; malformed hits dropped + counted; ONE declared
//      unit (a seconds value under a ms declaration is malformed, never rescaled);
//   ③ THE FOLD — newest instant per key, the thread marks both the conversation and the thread (U6), dedup by message id
//      across the overlap and inside a page, a stored record marks nothing, an unknown single chat is BORN, an unknown
//      group is a discovery hint, an unlisted row is counted, the thread-owed bound;
//   ④ owedSatisfied (the skew; an incomplete walk never clears) + birthFacts (catch-up ⇒ read, no news; steady ⇒ the hit
//      unread + news);
//   ⑤ THE SNIPPET CENSUS — the module reads no text field; the registry's hit fields are a closed list with no text;
//      the engine's feed page never hands a hit to the log, the preview line, the digest or a log line (grep-derived);
//   ⑥ THE MEASUREMENT — the sample window (covered / pending / before memStart), hit vs miss, promote ≥ 200 ≤ 2 %,
//      demote > 2 % over ≥ 20, re-promote, the missed-type diagnostic;
//   ⑦ THE SLIDING MINUTE — no 60 s span holds more than perMin (a seeded walk);
//   ⑧ PATCHED-COPY CONTROLS (scripts/mutant-copy.mjs): no overlap ⇒ the lagged hit is lost; the range trusted ⇒ the
//      ignored-range fixture pages to the test's bound; the snippet kept ⇒ ⑤ red; a magnitude-guessed unit ⇒ ② red.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = 'src/channel-feed.js';
const SRC = fs.readFileSync(path.join(REPO, MODEL), 'utf8');
const F0 = require(path.join(REPO, MODEL));
const caps = require(path.join(REPO, 'src/channel-caps.js'));

let passN = 0, failN = 0, QUIET = false;
const ok = (c, n, extra) => { if (QUIET) return !!c; if (c) { passN++; console.log('  ✓ ' + n); } else { failN++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);
const T0 = Date.UTC(2026, 8, 28, 12, 0, 0);
const DECL = Object.freeze({ via: 'search', scope: 'search:message', option: 'search', pageSize: 30, pagesPerPass: 5, perMin: 10, maxWindowSec: 3600, catchUp: { chatType: 'p2p', pagesMax: 20 }, describes: true });
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ═══ ① THE WINDOW ═══════════════════════════════════════════════════════════════════════════
function legWindow(F, label = '') {
  const res = {};
  const first = F.window({}, T0 + 400, DECL, { overlapSec: 60 });
  res.first = first;
  ok(first.act === 'new' && first.first === true && first.to === T0 && first.from === T0 - 60e3 && first.gap === null, `${label}① first run: from = now − overlap, to = now (whole seconds), no gap`, J(first));
  const steady = F.window({ cursorAt: T0 - 30e3 }, T0 + 999, DECL, { overlapSec: 60 });
  res.steady = steady;
  ok(steady.act === 'new' && !steady.first && steady.from === T0 - 90e3 && steady.to === T0, `${label}① steady: from = cursor − overlap (the last complete window re-read by 60 s), to = now floored to the second`, J(steady));
  const floor = F.window({ cursorAt: T0 - 30e3 }, T0, DECL, { overlapSec: 5 });
  ok(floor.from === T0 - 30e3 - F.OVERLAP_MIN_SEC * 1000, `${label}① the overlap never goes under its floor (${F.OVERLAP_MIN_SEC} s) whatever the setting says (5 ⇒ 30)`, J(floor));
  const gap = F.window({ cursorAt: T0 - 5 * 3600e3 }, T0, DECL, { overlapSec: 60 });
  ok(gap.act === 'new' && gap.from === T0 - 3600e3 && gap.gap && gap.gap.from === T0 - 5 * 3600e3 - 60e3 && gap.gap.to === T0 - 3600e3, `${label}① a 5-hour stop: the steady window covers the last hour only; [cursor − overlap, now − 1 h] becomes the single-chat catch-up`, J(gap));
  const back = F.window({ cursorAt: T0 + 300e3 }, T0, DECL, { overlapSec: 60 });
  ok(back.act === 'none' && back.why === 'clock-backwards', `${label}① a clock that went backwards past the cursor ⇒ no call this tick`, J(back));
  const cont = F.window({ cursorAt: T0 - 30e3, window: { from: T0 - 90e3, to: T0, pages: 2 } }, T0 + 20e3, DECL, { overlapSec: 60, tokenAt: T0 + 5e3 });
  ok(cont.act === 'continue' && cont.from === T0 - 90e3 && cont.to === T0, `${label}① a window in flight with a live token continues — its {from, to} fixed`, J(cont));
  const stale = F.window({ cursorAt: T0 - 30e3, window: { from: T0 - 90e3, to: T0, pages: 2 } }, T0 + 6 * 60e3, DECL, { overlapSec: 60, tokenAt: T0 });
  const lost = F.window({ window: { from: T0 - 90e3, to: T0, pages: 2 } }, T0 + 1000, DECL, { overlapSec: 60, tokenAt: null });
  ok(stale.act === 'restart' && lost.act === 'restart' && stale.from === T0 - 90e3, `${label}① a token past its ${F.PAGE_TOKEN_TTL_MS / 60e3}-min TTL (or none — a restart) re-reads the SAME window from page 1 (the dedup absorbs it)`, J([stale, lost]));
  ok(F.isoSec(T0 + 1234) === '2026-09-28T12:00:01Z', `${label}① the vendor's time_range spelling: ISO 8601, whole seconds, UTC`, F.isoSec(T0 + 1234));
  return res;
}
/** A LAGGED INDEX: messages are created at random instants and become searchable 0–55 s later; the feed ticks every
 *  `every` s, pages to the end, and moves its cursor to `to`. Returns the messages never found. */
function laggedIndexRun(F, { seed = 7, every = 30, overlapSec = 60, lagMax = 55e3, n = 400, span = 3 * 3600e3 } = {}) {
  const rnd = mulberry32(seed);
  const msgs = [];
  for (let i = 0; i < n; i++) { const at = T0 + Math.floor(rnd() * span); msgs.push({ id: `m${i}`, at, indexedAt: at + Math.floor(rnd() * lagMax) }); }
  const found = new Set();
  const feed = {};
  for (let t = T0 + 1000; t <= T0 + span + 5 * 60e3; t += every * 1000) {
    const w = F.window(feed, t, DECL, { overlapSec });
    if (w.act !== 'new') continue;
    for (const m of msgs) if (m.at >= w.from && m.at <= w.to && m.indexedAt <= t) found.add(m.id);
    feed.cursorAt = w.to;
  }
  return msgs.filter((m) => !found.has(m.id) && m.at >= T0 + 60e3);
}
function legLag(F, label = '') {
  const lost = laggedIndexRun(F);
  ok(lost.length === 0, `${label}① A LAGGED INDEX (0–55 s, 400 messages over 3 h, a 30 s tick): every message is found — the overlap re-reads the part of the last window the index had not caught up with`, J(lost.slice(0, 3)));
  return lost;
}

// ═══ ② THE PAGE VERDICT ═════════════════════════════════════════════════════════════════════
const hit = (o = {}) => ({ convId: 'oc_a', vendorId: `om_${Math.random().toString(36).slice(2, 10)}`, at: T0 - 10e3, updatedAt: null, threadKey: null, isP2p: false, fromId: 'ou_x', ...o });
function legVerdict(F, label = '') {
  const win = { from: T0 - 90e3, to: T0 };
  const good = F.pageVerdict({ hits: [hit(), hit({ at: T0 - 89e3 }), hit({ at: T0 + 100e3 })], total: 3 }, win, { pageSize: 30, now: T0 });
  ok(good.ok && good.hits.length === 3 && good.malformed === 0, `${label}② in-window hits pass (the slack admits a hit 100 s past \`to\`)`, J(good));
  const ign = F.pageVerdict({ hits: [hit(), hit({ at: T0 - 90e3 - 121e3 })], total: 2 }, win, { pageSize: 30, now: T0 });
  ok(!ign.ok && ign.park === 'time-range-ignored' && ign.outside === 1, `${label}② ONE hit 121 s before the window ⇒ time-range-ignored (the vendor ignored its range) — no hit is used`, J(ign));
  const edited = F.pageVerdict({ hits: [hit({ at: T0 - 30 * 86400e3, updatedAt: T0 - 5e3 })] }, win, { pageSize: 30, now: T0 });
  ok(edited.ok && edited.hits.length === 1, `${label}② an OLD message EDITED inside the window is judged by its update (it is news again), never "outside"`, J(edited));
  // verify r1: a message CREATED inside the window and edited after its end (a later page read after a typo fix, a window
  // re-read after a restart) is inside by its creation — never a park; an old message edited long after is still outside
  const editedLate = F.pageVerdict({ hits: [hit({ at: T0 - 60e3, updatedAt: T0 + 3 * 3600e3 })] }, win, { pageSize: 30, now: T0 + 4 * 3600e3 });
  const oldEditedLate = F.pageVerdict({ hits: [hit({ at: T0 - 30 * 86400e3, updatedAt: T0 + 3 * 3600e3 })] }, win, { pageSize: 30, now: T0 + 4 * 3600e3 });
  ok(editedLate.ok && editedLate.hits.length === 1 && !oldEditedLate.ok && oldEditedLate.park === 'time-range-ignored', `${label}② (verify r1) created inside the window + edited 3 h after its end ⇒ inside (no park); created a month before + edited after ⇒ outside`, J([editedLate, oldEditedLate]));
  const tot = F.pageVerdict({ hits: [hit()], total: 90 * 50 + 1 }, win, { pageSize: 30, now: T0 });
  const totOk = F.pageVerdict({ hits: [hit()], total: 90 * 50 }, win, { pageSize: 30, now: T0 });
  ok(!tot.ok && tot.park === 'time-range-ignored' && totOk.ok, `${label}② the total sanity: ${90 * 50 + 1} hits counted for a 90 s window (> 50/s) ⇒ ignored; ${90 * 50} ⇒ trusted`, J([tot, totOk.ok]));
  // verify r1 (U9): a continuation page answering the token we SENT, or repeating the previous page of this window,
  // means the vendor ignores the page token — parked by name (a window that never completes spent 10 pages a minute)
  const p1 = F.pageVerdict({ hits: [hit({ vendorId: 'om_p1' }), hit({ vendorId: 'om_p2' })], pageToken: 'tk-2' }, win, { pageSize: 30, now: T0 });
  const sameTok = F.pageVerdict({ hits: [hit({ vendorId: 'om_p3' })], pageToken: 'tk-2' }, win, { pageSize: 30, now: T0, sent: 'tk-2', prevSig: p1.sig });
  const samePage = F.pageVerdict({ hits: [hit({ vendorId: 'om_p2' }), hit({ vendorId: 'om_p1' })], pageToken: 'tk-3' }, win, { pageSize: 30, now: T0, sent: 'tk-2', prevSig: p1.sig });
  const next = F.pageVerdict({ hits: [hit({ vendorId: 'om_p3' })], pageToken: 'tk-3' }, win, { pageSize: 30, now: T0, sent: 'tk-2', prevSig: p1.sig });
  const firstPage = F.pageVerdict({ hits: [hit({ vendorId: 'om_p1' }), hit({ vendorId: 'om_p2' })], pageToken: 'tk-2' }, win, { pageSize: 30, now: T0, sent: null, prevSig: p1.sig });
  const emptyTwice = F.pageVerdict({ hits: [], pageToken: null }, win, { pageSize: 30, now: T0, sent: 'tk-2', prevSig: '' });
  ok(p1.ok && !sameTok.ok && sameTok.park === 'contract' && sameTok.paging && !samePage.ok && samePage.park === 'contract' && next.ok && firstPage.ok && emptyTwice.ok, `${label}② (verify r1, U9) a continuation answering the token it was sent, or the previous page's hits again ⇒ the page token is ignored, parked by name; the next real page, a first page, an empty last page pass`, J([sameTok, samePage, next.ok, firstPage.ok, emptyTwice.ok]));
  const many = F.pageVerdict({ hits: Array.from({ length: 31 }, () => hit()) }, win, { pageSize: 30, now: T0 });
  ok(!many.ok && many.park === 'contract', `${label}② more hits than the page size ⇒ a contract violation (parked by name)`, J(many));
  const mal = F.pageVerdict({ hits: [hit(), hit({ convId: '' }), hit({ vendorId: 'x'.repeat(600) }), hit({ at: 'soon' }), hit({ convId: 'oc_<script>' }), hit({ threadKey: 'bad key!' })], malformed: 2 }, win, { pageSize: 30, now: T0 });
  ok(mal.ok && mal.hits.length === 1 && mal.malformed === 2 + 5, `${label}② malformed hits (no chat, a 600-char id, a word for a time, markup in an id, a bad thread key) are dropped + counted with the adapter's own count`, J(mal));
  // THE DECLARED UNIT
  const ms = F.normalizeHit({ convId: 'oc_a', vendorId: 'om_1', createTime: String(T0 - 5e3), isP2p: 'true' }, { unit: 'ms', now: T0 });
  const secUnderMs = F.normalizeHit({ convId: 'oc_a', vendorId: 'om_1', createTime: String(Math.floor((T0 - 5e3) / 1000)) }, { unit: 'ms', now: T0 });
  const sec = F.normalizeHit({ convId: 'oc_a', vendorId: 'om_1', createTime: String(Math.floor((T0 - 5e3) / 1000)) }, { unit: 's', now: T0 });
  const future = F.normalizeHit({ convId: 'oc_a', vendorId: 'om_1', createTime: String(T0 + 2 * 86400e3) }, { unit: 'ms', now: T0 });
  const undeclared = F.normalizeHit({ convId: 'oc_a', vendorId: 'om_1', createTime: String(T0) }, { unit: 'us', now: T0 });
  const r = { ms: ms.ok && ms.hit.at === T0 - 5e3 && ms.hit.isP2p === true, secUnderMs: !secUnderMs.ok && secUnderMs.why === 'time-out-of-range', sec: sec.ok && sec.hit.at === Math.floor((T0 - 5e3) / 1000) * 1000, future: !future.ok, undeclared: !undeclared.ok && undeclared.why === 'unit-undeclared' };
  ok(Object.values(r).every(Boolean), `${label}② ONE DECLARED UNIT: a ms value reads as ms; a SECONDS value under a ms declaration is MALFORMED (1970), never rescaled by its magnitude; a seconds declaration reads it; a day ahead of now and an undeclared unit are refused`, J(r));
  return r;
}

// ═══ ③ THE FOLD ═════════════════════════════════════════════════════════════════════════════
function legFold(F) {
  const seen = new Map([['om_seen', T0]]);
  const state = { oc_live: 'live', oc_paused: 'paused', oc_gone: 'unlisted' };
  const stored = new Set(['oc_live|om_stored']);
  const hits = [
    hit({ convId: 'oc_live', vendorId: 'om_1', at: T0 - 50e3 }),
    hit({ convId: 'oc_live', vendorId: 'om_2', at: T0 - 20e3 }),
    hit({ convId: 'oc_live', vendorId: 'om_2', at: T0 - 20e3 }),                 // a repeat inside the page
    hit({ convId: 'oc_live', vendorId: 'om_seen', at: T0 - 5e3 }),                // seen in the previous (overlapping) window
    hit({ convId: 'oc_live', vendorId: 'om_stored', at: T0 - 4e3 }),              // push already delivered it
    hit({ convId: 'oc_live', vendorId: 'om_t1', at: T0 - 10e3, threadKey: 'omt_7' }),
    hit({ convId: 'oc_paused', vendorId: 'om_p', at: T0 - 3e3 }),
    hit({ convId: 'oc_gone', vendorId: 'om_g', at: T0 - 3e3 }),
    hit({ convId: 'oc_dm', vendorId: 'om_d1', at: T0 - 9e3, isP2p: true, fromId: 'ou_peer' }),
    hit({ convId: 'oc_dm', vendorId: 'om_d2', at: T0 - 8e3, isP2p: true, fromId: 'ou_me' }),
    hit({ convId: 'oc_newgrp', vendorId: 'om_n', at: T0 - 7e3, isP2p: false, threadKey: 'omt_9' }),
  ];
  const f = F.foldHits(hits, { seen, stateOf: (c) => state[c] || null, hasRecord: (c, v) => stored.has(`${c}|${v}`), separateThreads: true });
  ok(f.owed.get('oc_live') === T0 - 10e3 && f.owed.get('oc_paused') === T0 - 3e3 && f.owed.size === 2, '③ one owed mark per conversation at its NEWEST hit (a paused row is owed too — fetched once unpaused)', J([...f.owed]));
  ok(f.threadOwed.get('oc_live') && f.threadOwed.get('oc_live').get('omt_7') === T0 - 10e3 && f.owed.has('oc_live'), '③ U6: a thread hit marks BOTH the conversation (roots ride the listing) and the thread (replies need the walk)', J([...(f.threadOwed.get('oc_live') || [])]));
  ok(f.repeats === 2 && f.stored === 1, `③ dedup by message id: the in-page repeat and the overlap's re-read are dropped (${f.repeats}); a message the store holds marks nothing (${f.stored})`, J(f));
  ok(f.births.size === 1 && f.births.get('oc_dm').at === T0 - 8e3 && J(f.births.get('oc_dm').fromIds) === J(['ou_peer', 'ou_me']), '③ an unknown SINGLE chat is BORN (its newest instant, its authors for the describe ladder)', J([...f.births]));
  ok(f.groups.size === 1 && f.groups.get('oc_newgrp').at === T0 - 7e3 && !f.births.has('oc_newgrp') && f.unlisted === 1, '③ an unknown GROUP is a discovery hint, never born by the feed (the chat listing is the membership authority); an unlisted row is counted, never marked', J([...f.groups.keys(), f.unlisted]));
  ok(f.seenAdd.length === 9, `③ every NEW message id is remembered once (9 new of 11 hits)`, J(f.seenAdd.map((x) => x[0])));
  // verify r2 (#4): an EDIT is not activity — a single chat whose only hit is a year-old message edited now is born with its
  // CREATION as the activity instant (`created`), the edit's instant only in `at` (the read line's input)
  const ed = F.foldHits([hit({ convId: 'oc_olddm', vendorId: 'om_old', at: T0 - 400 * 86400e3, updatedAt: T0 - 5e3, isP2p: true, fromId: 'ou_old' })], { stateOf: () => null });
  const eb = ed.births.get('oc_olddm');
  ok(eb && eb.created === T0 - 400 * 86400e3 && eb.at === T0 - 5e3 && f.births.get('oc_dm').created === T0 - 8e3, '③ verify r2: a birth keeps its newest CREATION apart from an edit\'s instant (an edit of a year-old message is not activity)', J(eb));
  // verify r2 (#9): WHERE THE FEED'S REACH BEGAN per owed thread — a new mark takes the window's start, a live one the
  // earlier of the two, a STALE entry (no owed mark before) never lowers a new line, keys outside the marks are dropped
  const rch = F.mergeThreadReach({ omt_a: T0 - 900e3, omt_stale: T0 - 86400e3, omt_gone: T0 - 5e3 }, { omt_a: T0 - 1e3 }, ['omt_a', 'omt_stale', 'omt_new'], T0 - 60e3, { omt_a: T0, omt_stale: T0, omt_new: T0 });
  ok(rch.omt_a === T0 - 900e3 && rch.omt_stale === T0 - 60e3 && rch.omt_new === T0 - 60e3 && !('omt_gone' in rch), '③ verify r2: a thread\'s reach = the earliest naming window\'s start while its mark lives; a stale entry starts afresh; bounded to the marks', J(rch));
  const noSep = F.foldHits([hit({ convId: 'oc_live', vendorId: 'om_x', threadKey: 'omt_1' })], { stateOf: () => 'live', separateThreads: false });
  ok(noSep.threadOwed.size === 0 && noSep.owed.size === 1, '③ an adapter whose replies ride the listing gets no thread mark (nothing to walk)');
  const big = {}; for (let i = 0; i < 70; i++) big[`omt_${i}`] = T0 + i;
  const mt = F.mergeThreadOwed(big, new Map([['omt_new', T0 + 1000]]));
  ok(Object.keys(mt.marks).length === F.THREAD_OWED_MAX && mt.dropped === 71 - F.THREAD_OWED_MAX && mt.marks.omt_new && !mt.marks.omt_0, `③ thread owed marks are bounded to ${F.THREAD_OWED_MAX} per conversation — the OLDEST dropped and counted`, J([Object.keys(mt.marks).length, mt.dropped]));
}

// ═══ ④ owedSatisfied + birthFacts ═══════════════════════════════════════════════════════════
function legOwed(F) {
  const o = T0;
  const r = {
    after: F.owedSatisfied(o, o + F.FEED_SKEW_MS),
    inSkew: F.owedSatisfied(o, o + F.FEED_SKEW_MS - 1),
    before: F.owedSatisfied(o, o - 1000),
    incomplete: F.owedSatisfied(o, o + 60e3, { complete: false }),
    none: F.owedSatisfied(null, null),
  };
  ok(r.after && !r.inSkew && !r.before && !r.incomplete && r.none, `④ an owed mark is satisfied ONLY by a complete walk that started ≥ the message + ${F.FEED_SKEW_MS / 1000} s (inside the skew, before it, or incomplete ⇒ still owed)`, J(r));
  const cu = F.birthFacts({ at: T0 - 3 * 86400e3 }, { linkedAt: T0 - 30 * 86400e3, backlogUntil: T0, catchUp: true });
  const st = F.birthFacts({ at: T0 + 50e3 }, { linkedAt: T0 - 30 * 86400e3, backlogUntil: T0 });
  const early = F.birthFacts({ at: T0 - 10e3 }, { linkedAt: T0 - 86400e3, backlogUntil: T0 });
  ok(cu.readAt === T0 && cu.newsSince === T0 && st.readAt === T0 + 50e3 - 1 && st.newsSince === T0 + 50e3 - 1 && early.readAt === T0, '④ birthFacts: a catch-up birth is read to the first run (BACKLOG — never news, never a wake); a steady birth leaves its causing message unread and news, the older page read; never before the first run', J([cu, st, early]));
  // verify r1: the line is the WINDOW's start — every message a steady window holds for an unknown conversation is news
  // (three messages of one person in one window: the newest used to be the only unread one)
  const win3 = F.birthFacts({ at: T0 + 80e3 }, { linkedAt: T0 - 30 * 86400e3, backlogUntil: T0, windowFrom: T0 + 30e3 });
  const winFirst = F.birthFacts({ at: T0 + 80e3 }, { linkedAt: T0 - 30 * 86400e3, backlogUntil: T0 + 60e3, windowFrom: T0 + 30e3 });
  const winLate = F.birthFacts({ at: T0 + 20e3 }, { linkedAt: T0 - 30 * 86400e3, backlogUntil: T0, windowFrom: T0 + 30e3 });
  ok(win3.newsSince === T0 + 30e3 - 1 && winFirst.newsSince === T0 + 60e3 && winLate.newsSince === T0 + 20e3 - 1 && win3.readAt === win3.newsSince, '④ birthFacts (verify r1): a steady birth\'s line is the WINDOW\'s start (every message it holds is news), never after the hit, never before the first run', J([win3, winFirst, winLate]));
}

// ═══ ⑤ THE SNIPPET CENSUS ═══════════════════════════════════════════════════════════════════
function legCensus(src, F, label = '') {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const reads = /\.(text|snippet|display_info|displayInfo|body|content)\b/.test(code);
  ok(!reads && !F.HIT_FIELDS.some((k) => /text|snippet|display|body|content/i.test(k)), `${label}⑤ the module reads no text field and the hit's CLOSED field list carries none (${F.HIT_FIELDS.join(', ')})`);
  const h = F.cleanHit({ convId: 'oc_a', vendorId: 'om_1', at: T0, text: 'secret words', snippet: '<em>x</em>', display_info: 'y' }, { now: T0 });
  const keys = h ? Object.keys(h) : [];
  const clean = !!h && keys.every((k) => F.HIT_FIELDS.includes(k)) && !('text' in h) && !('snippet' in h) && !('display_info' in h);
  ok(clean, `${label}⑤ a hit that carries a snippet comes out WITHOUT it (the closed field list is what passes)`, J(h));
  return clean;
}
function legEngineCensus() {
  const eng = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const m = /async function feedPage\(rec, e\) \{[\s\S]*?\n {2}\}\n/.exec(eng);
  if (!m) { ok(false, '⑤ the engine\'s feed page (`async function feedPage(rec, e)`) exists — the census reads it'); return; }
  const body = m[0].replace(/\/\/[^\n]*/g, '');
  const bad = ['appendRecords', 'lastText', 'onFresh(', 'digest(', '.text', 'snippet', 'display_info'].filter((w) => body.includes(w));
  ok(bad.length === 0, `⑤ THE ENGINE CENSUS: the feed page never hands a hit to the log, the preview line, the wake funnel, the digest or a text field (${bad.join(', ') || 'none'})`);
  const logs = [...body.matchAll(/log\.(?:log|warn)\(([^\n]*)/g)].map((x) => x[1]);
  const leak = logs.filter((l) => /\bh\.|hits\b|\.vendorId/.test(l));
  ok(leak.length === 0, `⑤ …and no log line of the feed page prints a hit (only counts, codes, field NAMES)`, leak.join(' | '));
  const reg = fs.readFileSync(path.join(REPO, 'src/channels/index.js'), 'utf8');
  ok(/async changes\(/.test(reg) && /cleanHit/.test(reg), '⑤ the registry\'s `changes()` wrapper passes every hit through the closed field list (cleanHit)');
}

// ═══ ⑥ THE MEASUREMENT ══════════════════════════════════════════════════════════════════════
function legMeasure(F) {
  const seen = new Map([['a', 1], ['b', 1]]);
  const recs = [{ vendorId: 'a', at: T0 - 100e3 }, { vendorId: 'b', at: T0 - 90e3 }, { vendorId: 'c', at: T0 - 80e3, msgType: 'system' }, { vendorId: 'd', at: T0 + 10e3 }, { vendorId: 'e', at: T0 - 20 * 60e3 }];
  const s = F.sample(recs, { coveredTo: T0 - 60e3, memStart: T0 - 10 * 60e3, seen });
  ok(s.n === 3 && s.p === 1 && s.missedTypes.system === 1 && s.pending.length === 1 && s.pending[0].vendorId === 'd', '⑥ a sample: covered records are judged (a, b found, c MISSED — its type kept for the diagnostic), an uncovered one waits (d), one before this process\'s first window is never judged (e)', J(s));
  const s2 = F.sample([], { coveredTo: T0 + 60e3, memStart: T0 - 10 * 60e3, seen: new Map([['d', 1]]), pending: s.pending });
  ok(s2.n === 1 && s2.p === 0 && s2.pending.length === 0, '⑥ …the waiting record is judged once a complete window covers it (found)', J(s2));
  const none = F.sample(recs, { coveredTo: T0, memStart: null, seen });
  ok(none.n === 0, '⑥ no first window yet (memStart null) ⇒ nothing is judged');
  // the verdict over the push lane's rolling window (the caller computes the rate — this module imports nothing)
  const add = (list, n, p) => caps.pushSamplesAdd(list, { at: T0, n, p });
  let S = add([], 199, 0);
  const m199 = F.modeVerdict('measuring', caps.pushMissRate(S, T0));
  S = add(S, 1, 0);
  const m200 = F.modeVerdict('measuring', caps.pushMissRate(S, T0));
  const D = add([], 200, 4);
  const d2 = F.modeVerdict('measuring', caps.pushMissRate(D, T0));
  const bad = F.modeVerdict('measuring', caps.pushMissRate(add(D, 1, 1), T0));
  const dem = F.modeVerdict('carrying', caps.pushMissRate(add([], 20, 1), T0));
  const dem19 = F.modeVerdict('carrying', caps.pushMissRate(add([], 19, 10), T0));
  const rep = F.modeVerdict('demoted', caps.pushMissRate(add([], 200, 4), T0));
  const r = { m199: m199.mode, m200: m200.mode, d2: d2.mode, bad: bad.mode, dem: dem.mode, dem19: dem19.mode, rep: rep.mode };
  ok(r.m199 === 'measuring' && r.m200 === 'carrying' && r.d2 === 'carrying' && r.bad === 'measuring' && r.dem === 'demoted' && r.dem19 === 'carrying' && r.rep === 'carrying', '⑥ promote at ≥ 200 samples ≤ 2 % missed (199 ⇒ still measuring; 4/200 = 2 % ⇒ carrying; 5/201 ⇒ not); demote at > 2 % over ≥ 20 (1/20 ⇒ demoted, 10/19 ⇒ not yet); re-promote at ≤ 2 % over ≥ 200', J(r));
  // verify r1: a promotion waits for the measurement to SPAN one full cold cycle (the caller's minimum) — before it, the
  // samples come from the conversations the feed found; a demotion never waits
  const CYC = (900 + 60 + 30) * 1000;
  const early = F.modeVerdict('measuring', caps.pushMissRate(S, T0), { spanMs: CYC - 1, minSpanMs: CYC });
  const spanned = F.modeVerdict('measuring', caps.pushMissRate(S, T0), { spanMs: CYC, minSpanMs: CYC });
  const repEarly = F.modeVerdict('demoted', caps.pushMissRate(add([], 200, 4), T0), { spanMs: 60e3, minSpanMs: CYC });
  const demEarly = F.modeVerdict('carrying', caps.pushMissRate(add([], 20, 1), T0), { spanMs: 0, minSpanMs: CYC });
  ok(early.mode === 'measuring' && spanned.mode === 'carrying' && repEarly.mode === 'demoted' && demEarly.mode === 'demoted', '⑥ (verify r1) no promotion (nor re-promotion) before the measurement spans one full cold cycle; at it ⇒ carrying; a demotion never waits', J([early.mode, spanned.mode, repEarly.mode, demEarly.mode]));
  const fr = F.freshMs(30, 60);
  ok(fr === 180e3 && F.freshMs(120, 60) === 420e3, `⑥ the fresh bound: max(180 s, 3 × every + overlap) — ${fr / 1000} s at the defaults, ${F.freshMs(120, 60) / 1000} s at a 2-min feed`);
}

// ═══ ⑦ THE SLIDING MINUTE ═══════════════════════════════════════════════════════════════════
function legMinute(F) {
  const rnd = mulberry32(99);
  const perMin = 10;
  let calls = [];
  const sent = [];
  let t = T0;
  for (let i = 0; i < 4000; i++) {
    t += Math.floor(rnd() * 9000);
    const left = F.pagesLeft(calls, t, perMin);
    if (left > 0 && rnd() < 0.8) { calls = F.minuteAt(calls, t).calls.concat([t]); sent.push(t); }
  }
  let worst = 0;
  for (let i = 0, j = 0; j < sent.length; j++) { while (sent[j] - sent[i] >= 60e3) i++; worst = Math.max(worst, j - i + 1); }
  ok(worst <= perMin && sent.length > 500, `⑦ a seeded walk of ${sent.length} feed pages: no 60 s span ever holds more than ${perMin} (worst ${worst}) — a SLIDING minute`, worst);
  ok(F.pagesLeft([T0 - 59e3, T0 - 1], T0, 10) === 8 && F.pagesLeft([T0 - 60e3], T0, 10) === 10, '⑦ a page 59 s old still counts; one 60 s old has left the minute');
}

// ═══ RUN ═══════════════════════════════════════════════════════════════════════════════════
console.log('channel-feed — the PURE arithmetic of the change feed');
legWindow(F0); legLag(F0); legVerdict(F0); legFold(F0); legOwed(F0); legCensus(SRC, F0); legEngineCensus(); legMeasure(F0); legMinute(F0);
ok(!/\brequire\(|\bimport\s|Date\.now\(|performance\.now|process\./.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/'use strict';/, '')), '⑤ the module imports nothing and reads no clock (every `now` is an argument)');

// ═══ ⑧ PATCHED-COPY CONTROLS ════════════════════════════════════════════════════════════════
console.log('⑧ patched-copy controls (scratch only)');
const M = mutantCopies('larkfeed', REPO);
const patch = (from, to, tag) => { if (!SRC.includes(from)) throw new Error(`control ${tag}: the anchor is gone — re-point it`); return M.load(MODEL, SRC.replace(from, to), tag); };
{
  const F1 = patch('let from = first ? t - ov : floorSec(cursor) - ov;', 'let from = first ? t - ov : floorSec(cursor);', 'no-overlap');
  const lost = laggedIndexRun(F1);
  ok(lost.length > 0, `CONTROL no overlap: the lagged index LOSES ${lost.length} of 400 messages for good (the real module: 0)`, lost.length);
}
{
  const F2 = patch('if (outside) return { ok: false, park:', 'if (false) return { ok: false, park:', 'range-trusted');
  // the ignored-range vendor: whatever window is asked, it answers the WHOLE history, 30 a page, has_more
  const history = Array.from({ length: 1000 }, (_, i) => hit({ vendorId: `om_h${i}`, at: T0 - 30 * 86400e3 + i * 60e3 }));
  const drive = (F) => { let pages = 0; for (let i = 0; i < 50; i++) { const more = (i + 1) * 30 < history.length; const v = F.pageVerdict({ hits: history.slice(i * 30, i * 30 + 30), more }, { from: T0 - 90e3, to: T0 }, { pageSize: 30, now: T0 }); pages++; if (!v.ok || !more) break; } return pages; };
  const real = drive(F0), mut = drive(F2);
  ok(real === 1 && mut === 34, `CONTROL the range trusted: the ignored-range fixture is parked after ONE page by the real verdict, and pages ${mut} times (to the history's end) through the copy`, J([real, mut]));
}
{
  const F3 = patch('return { convId, vendorId, at, updatedAt: up !== null', 'return { ...h, convId, vendorId, at, updatedAt: up !== null', 'snippet-kept');
  let red = false;
  QUIET = true;
  try { red = !legCensus(SRC, F3, 'CONTROL(copy) '); } finally { QUIET = false; }
  ok(red, 'CONTROL the snippet kept: a copy whose hit keeps the vendor\'s extra fields turns ⑤ red');
}
{
  // verify r1 (U9): the page token ignored — the same first page answered for every continuation; the real verdict parks
  // on the second page, the copy without check (e) pages to the test's bound (the window never completes)
  const F6 = patch("if (sent !== null && sent !== undefined && sent !== '' && (", "if (false && (", 'paging-trusted');
  const pg1 = Array.from({ length: 30 }, (_, i) => hit({ vendorId: `om_ig${i}`, at: T0 - 1000 - i }));
  const drive = (F) => { let pages = 0, sent = null, prev = null; for (let i = 0; i < 60; i++) { const v = F.pageVerdict({ hits: pg1, pageToken: 'tk-30', more: true }, { from: T0 - 90e3, to: T0 }, { pageSize: 30, now: T0, sent, prevSig: prev }); pages++; if (!v.ok) break; sent = 'tk-30'; prev = v.sig; } return pages; };
  const real = drive(F0), mut = drive(F6);
  ok(real === 2 && mut === 60, `CONTROL the page token trusted: a vendor that ignores it is parked on the 2nd page by the real verdict, and pages ${mut} times (the bound) through the copy`, J([real, mut]));
}
{
  // verify r1: the max(create, update) judge — an ordinary edit after the window's end parks the feed for 24 h
  const F5 = patch('if (!inside(h.at) && !(h.updatedAt && inside(h.updatedAt))) outside++;', 'const t = Math.max(h.at, h.updatedAt || 0); if (t < from - RANGE_SLACK_MS || t > to + RANGE_SLACK_MS) outside++;', 'range-judged-by-max');
  const v = F5.pageVerdict({ hits: [hit({ at: T0 - 60e3, updatedAt: T0 + 3 * 3600e3 })] }, { from: T0 - 90e3, to: T0 }, { pageSize: 30, now: T0 + 4 * 3600e3 });
  ok(!v.ok && v.park === 'time-range-ignored', 'CONTROL the range judged by max(create, update): a message created in the window and edited after it PARKS the feed through the copy — ② (verify r1) would be red', J(v));
}
{
  const F4 = patch("const scale = unit === 's' ? 1000 : 1;", "const scale = unit === 's' || raw < 1e11 ? 1000 : 1;", 'magnitude-guessed');
  let r = null;
  QUIET = true;
  try { r = legVerdict(F4, 'CONTROL(copy) '); } finally { QUIET = false; }
  ok(r && r.secUnderMs === false, 'CONTROL the unit guessed from the magnitude: a seconds value under a ms declaration is RESCALED by the copy — ② goes red');
}
for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 4, label: 'larkfeed: ' })) ok(c.pass, c.name, c.pass ? undefined : c.detail);

console.log(`\n${failN ? '✗' : '✓'} test-channel-feed: ${passN} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
