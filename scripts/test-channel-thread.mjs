#!/usr/bin/env node
// THE THREAD GATE (fast; lane channel-threads, 2026-09-28 — the owner: "我发现你似乎不支持 lark 的内嵌回复 (thread)
// 功能 … 这俩功能对未来接入 slack/telegram 都很重要"). src/channel-thread.js is PURE: a message's PLACE — what it
// answers (`replyTo`), which thread it sits in (`threadKey`), the thread's root (`root`, new) — folded into an index
// the window, the pane and the agent's text read. This suite drives it with no engine and no clock:
//   ① THE MAPPING TABLE (spec §1.3) over INVENTED REAL-SHAPE fixtures per vendor — a Lark `im/v1/messages` page
//      through the REAL adapter normalizer (a root_id chain, an `omt_` topic with its root, an `omt_` topic whose
//      root is absent, a `reply_in_thread` born from a chain), a Slack `conversations.history` page (a parent whose
//      thread_ts == ts, replies, a `thread_broadcast`, a parent stored before its first reply) and a Telegram update
//      batch (one-level `reply_to_message`, an `external_reply`, a forum `message_thread_id` = a conversation) through
//      REFERENCE mappers in the §1.3 shape (fixture legs — no Slack / Telegram adapter ships), and a Gmail thread
//      (`threadKey === convId` ⇒ kind `conversation`, nothing drawn);
//   ② THE INDEX — T1 (a chain keyed by its topmost loaded ancestor; a parent not loaded keys it by its own id),
//      T2 (the root by identity / by the members' `root` / the earliest without a parent, ties by (at, vendorId)),
//      T3 (distinct), T4 (a thread of one), T6 (hops bounded, a cycle keyed by the smaller id, well under 2 s);
//   ③ T5 — a vendor count merged as the max; a stale vendor stat changes nothing; the root's own stored line is
//      never read (attack 14: the root says 3, the log holds 5 ⇒ 5);
//   ④ T7 — `placeOf`: the quote (loaded / not loaded / another chat), the thread (root / member / kind);
//      `agentPlaceLine` words, frame-inert;
//   ⑤ T8 — `paneMode` (side ≥ 620 px, stacked below) + `threadView` paging by the store's order;
//   ⑥ THE CENSUS SHAPE (spec §0.2): 251 threads of one, 23 of 2–3, 9 of 4–10, 1 of 11–50 — a seeded corpus in that
//      shape folds to exactly that distribution, `omt_` roots found as "the earliest with no parent";
//   ⑦ BOUND BEFORE PARSE: a 64 KiB thread id is cut to 512 by the record, a 1 MiB quote source is read in linear
//      time (8× the input ≤ 16× the time) — and the record's place rules R1 / R2;
//   ⑧ CONTROLS — patched copies (scripts/mutant-copy.mjs, scratch only): the root counted as a reply; a chain walk
//      with no cycle guard (keys the cycle by the wrong id); one with neither guard (hangs — the harness kills it at
//      2 s and reads RED); stats read off the root's own line (the Slack mutability fixture turns it stale).
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { startWorkMeter, linear, work, LINEAR_BOUND } from './work-meter.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODEL = 'src/channel-thread.js';
const SRC = fs.readFileSync(path.join(REPO, MODEL), 'utf8');
startWorkMeter(); // BEFORE the modules load — a complexity claim is counted in WORK, never the clock (lane-mirror-198)
const TFILES = ['src/channel-thread.js', 'src/channel-record.js'];
const T = require(path.join(REPO, MODEL));
const R = require(path.join(REPO, 'src/channel-record.js'));
const lark = require(path.join(REPO, 'src/channels/lark.js'));

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } return !!c; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const T0 = 1759000000000;

// ═══ FIXTURES (invented, in the vendors' real shapes) ═══════════════════════════════════════════
/** A Lark `GET im/v1/messages?container_id_type=chat` page item (vendor facts L1–L3) — `body.content` a JSON string. */
const lk = (id, at, { parent = null, root = null, thread = null, text = 'x', sender = 'ou_a' } = {}) => ({
  message_id: id, create_time: String(at), msg_type: 'text', chat_id: 'oc_grp', deleted: false, updated: false,
  body: { content: JSON.stringify({ text }) }, sender: { id: sender, id_type: 'open_id', sender_type: 'user' }, mentions: [],
  ...(parent ? { parent_id: parent } : {}), ...(root ? { root_id: root } : {}), ...(thread ? { thread_id: thread } : {}),
});
const LARK_PAGE = [
  // a PLAIN reply chain under om_r1 (a group with no topics): threadKey = root_id
  lk('om_r1', T0 + 1000, { text: '周会改到几点？', sender: 'ou_a' }),
  lk('om_a', T0 + 2000, { parent: 'om_r1', root: 'om_r1', text: '三点吧', sender: 'ou_b' }),
  lk('om_b', T0 + 3000, { parent: 'om_a', root: 'om_r1', text: '可以', sender: 'ou_c' }),
  // an `omt_` TOPIC with its first message in the log (话题群: the first message carries thread_id, no parent)
  lk('om_t0', T0 + 4000, { thread: 'omt_t1', text: 'topic head', sender: 'ou_a' }),
  lk('om_t1', T0 + 5000, { parent: 'om_t0', root: 'om_t0', thread: 'omt_t1', text: 'first reply', sender: 'ou_b' }),
  lk('om_t2', T0 + 6000, { parent: 'om_t1', root: 'om_t0', thread: 'omt_t1', text: 'nested reply', sender: 'ou_c' }),
  // an `omt_` topic whose ROOT is older than the log (the 200-record first-ingest bound): root not loaded
  lk('om_x1', T0 + 7000, { parent: 'om_gone', root: 'om_gone', thread: 'omt_t9', text: 'late reply', sender: 'ou_d' }),
  // `reply_in_thread: true` on a plain message: the vendor mints a thread; root = the message replied to
  lk('om_p', T0 + 8000, { text: 'plain', sender: 'ou_a' }),
  lk('om_q', T0 + 9000, { parent: 'om_p', root: 'om_p', thread: 'omt_t5', text: 'into a new thread', sender: 'ou_b' }),
  // a topic-group message nobody answered (a thread of one — T4)
  lk('om_solo', T0 + 9500, { thread: 'omt_solo', text: 'lonely topic', sender: 'ou_c' }),
  // a peer-written SELF-REFERENCE (attack 1): parent + root name the message itself
  lk('om_self', T0 + 9600, { parent: 'om_self', root: 'om_self', text: 'me', sender: 'ou_e' }),
];
const larkRecs = LARK_PAGE.map((m) => lark.toRecord('lark-1', 'oc_grp', m, { names: new Map([['ou_a', 'A'], ['ou_b', 'B'], ['ou_c', 'C'], ['ou_d', 'D']]) }));

/** A Slack `conversations.history` page (vendor facts S1–S3, S8) + the §1.3 reference mapper. */
const SLACK_HISTORY = [
  { type: 'message', ts: '1727000000.000100', thread_ts: '1727000000.000100', reply_count: 3, latest_reply: '1727000000.000400', reply_users: ['U2', 'U3'], user: 'U1', text: 'parent' },
  { type: 'message', ts: '1727000000.000200', thread_ts: '1727000000.000100', parent_user_id: 'U1', user: 'U2', text: 'r1' },
  { type: 'message', ts: '1727000000.000300', thread_ts: '1727000000.000100', parent_user_id: 'U1', user: 'U3', text: 'r2' },
  { type: 'message', subtype: 'thread_broadcast', ts: '1727000000.000400', thread_ts: '1727000000.000100', user: 'U2', text: 'r3, also sent to the channel', root: { reply_count: 3 } },
  { type: 'message', ts: '1727000000.000500', thread_ts: '1727000000.000100', parent_user_id: 'U1', user: 'U4', text: 'r4' },
  { type: 'message', ts: '1727000000.000600', thread_ts: '1727000000.000100', parent_user_id: 'U1', user: 'U5', text: 'r5' },
  // a parent stored BEFORE its first reply existed (no thread_ts yet — the mutability note)
  { type: 'message', ts: '1727000001.000100', user: 'U1', text: 'early parent' },
  { type: 'message', ts: '1727000001.000200', thread_ts: '1727000001.000100', parent_user_id: 'U1', user: 'U2', text: 'its first reply' },
];
function slackToRecord(m) {
  const isReply = m.thread_ts && m.thread_ts !== m.ts;
  return R.makeRecord({
    adapterId: 'slack-1', convId: 'C1', vendorId: m.ts, at: Math.round(Number(m.ts) * 1000), author: { id: m.user, name: m.user }, text: m.text,
    replyTo: isReply ? m.thread_ts : null,
    threadKey: m.thread_ts || null,
    root: isReply ? m.thread_ts : null,
    raw: { subtype: m.subtype || null, ...(m.subtype === 'thread_broadcast' ? { broadcast: true } : {}), ...(m.reply_count !== undefined ? { replyCount: m.reply_count } : {}) },
  });
}
const slackRecs = SLACK_HISTORY.map(slackToRecord);

/** A Telegram `getUpdates` batch (vendor facts T1–T3) + the §1.3 reference mapper: the parent is embedded ONE
 *  level; the chain is folded LOCALLY (threadKey left to T1); a forum topic is its own CONVERSATION. */
const TG_UPDATES = [
  { update_id: 1, message: { message_id: 10, date: 1759000010, chat: { id: -100123, type: 'supergroup' }, from: { id: 7, first_name: 'Ada' }, text: 'root' } },
  { update_id: 2, message: { message_id: 11, date: 1759000011, chat: { id: -100123, type: 'supergroup' }, from: { id: 8, first_name: 'Bo' }, text: 'reply', reply_to_message: { message_id: 10, text: 'root' } } },
  { update_id: 3, message: { message_id: 12, date: 1759000012, chat: { id: -100123, type: 'supergroup' }, from: { id: 9, first_name: 'Cy' }, text: 'reply to a reply', reply_to_message: { message_id: 11, text: 'reply' } } },
  { update_id: 4, message: { message_id: 13, date: 1759000013, chat: { id: -100123, type: 'supergroup' }, from: { id: 7, first_name: 'Ada' }, text: 'quoting elsewhere', external_reply: { origin: { type: 'channel' }, chat: { id: -100999 }, message_id: 55 } } },
  { update_id: 5, message: { message_id: 14, date: 1759000014, chat: { id: -100123, type: 'supergroup', is_forum: true }, message_thread_id: 3, is_topic_message: true, from: { id: 8, first_name: 'Bo' }, text: 'in a forum topic' } },
  { update_id: 6, message: { message_id: 15, date: 1759000015, chat: { id: -100123, type: 'supergroup' }, from: { id: 9, first_name: 'Cy' }, text: 'answers something older', reply_to_message: { message_id: 2, text: 'ancient' } } },
];
function telegramToRecord(u) {
  const m = u.message;
  const convId = m.is_topic_message && m.message_thread_id ? `${m.chat.id}:${m.message_thread_id}` : String(m.chat.id);
  return R.makeRecord({
    adapterId: 'tg-1', convId, vendorId: String(m.message_id), at: m.date * 1000, author: { id: String(m.from.id), name: m.from.first_name }, text: m.text,
    replyTo: m.reply_to_message ? String(m.reply_to_message.message_id) : null,
    threadKey: null, root: null,
    raw: m.external_reply ? { externalReply: { chat: String(m.external_reply.chat && m.external_reply.chat.id), id: String(m.external_reply.message_id) } } : {},
  });
}
const tgRecs = TG_UPDATES.map(telegramToRecord);

// ═══ ① THE MAPPING TABLE ════════════════════════════════════════════════════════════════════════
console.log('① the §1.3 mapping table — one shape for three vendors');
{
  const by = new Map(larkRecs.map((r) => [r.vendorId, r]));
  ok(by.get('om_a').replyTo === 'om_r1' && by.get('om_a').threadKey === 'om_r1' && by.get('om_a').root === 'om_r1', 'Lark plain reply: replyTo = parent_id, threadKey = root_id (a message id), root = root_id');
  ok(by.get('om_t1').threadKey === 'omt_t1' && by.get('om_t1').root === 'om_t0' && by.get('om_t1').replyTo === 'om_t0', 'Lark topic reply: threadKey = thread_id (omt_), root = root_id — the root id is KEPT (it used to be dropped when a thread id existed)');
  ok(by.get('om_t0').threadKey === 'omt_t1' && by.get('om_t0').replyTo === null && !('root' in by.get('om_t0')), 'Lark topic head: in its thread, no parent, no root field (it IS the root)');
  ok(by.get('om_q').threadKey === 'omt_t5' && by.get('om_q').root === 'om_p', 'Lark reply_in_thread: the vendor-minted thread + root = the message replied to');
  ok(by.get('om_self').replyTo === null && !('root' in by.get('om_self')), 'R1 (attack 1): a peer-written self-reference is dropped — a page cannot make a record its own parent or root');
  ok(!('root' in by.get('om_r1')), 'R2: a message with no place carries no root');
  const sp = slackRecs.find((r) => r.vendorId === '1727000000.000100');
  const sr = slackRecs.find((r) => r.vendorId === '1727000000.000200');
  const sb = slackRecs.find((r) => r.raw.broadcast);
  ok(sp.replyTo === null && sp.threadKey === '1727000000.000100' && !('root' in sp), 'Slack parent (thread_ts == ts): no parent, its own ts as the thread key, no root');
  ok(sr.replyTo === '1727000000.000100' && sr.threadKey === '1727000000.000100' && sr.root === '1727000000.000100', 'Slack reply: replyTo = threadKey = root = thread_ts (Slack has no nested reply)');
  ok(sb && sb.threadKey === '1727000000.000100' && sb.replyTo === '1727000000.000100', 'Slack thread_broadcast: the same shape + raw.broadcast (drawn in the list AND the thread)');
  const t12 = tgRecs.find((r) => r.vendorId === '12');
  const t13 = tgRecs.find((r) => r.vendorId === '13');
  const t14 = tgRecs.find((r) => r.vendorId === '14');
  ok(t12.replyTo === '11' && t12.threadKey === null, 'Telegram reply: replyTo = reply_to_message.message_id (ONE level embedded); the chain is folded locally (T1)');
  ok(t13.replyTo === null && t13.raw.externalReply && t13.raw.externalReply.id === '55', 'Telegram external_reply: no parent in this conversation; raw.externalReply names the other chat');
  ok(t14.convId === '-100123:3' && t14.threadKey === null, 'Telegram forum topic: a sub-CONVERSATION (convId <chat>:<message_thread_id>), never a thread key');
}

// ═══ ② THE INDEX ════════════════════════════════════════════════════════════════════════════════
console.log('② the thread index — T1 / T2 / T3 / T4 / T6');
{
  const ix = T.threadIndex(larkRecs, { convId: 'oc_grp' });
  const chain = ix.threads.get('om_r1');
  ok(chain && chain.kind === 'chain' && chain.root === 'om_r1' && eq(chain.replies, ['om_a', 'om_b']) && chain.count === 2, 'a Lark root_id chain: kind chain, the root by identity, 2 replies (the root is never a reply — T2)', chain);
  ok(chain.participants.map((p) => p.id).join() === 'ou_a,ou_b,ou_c' && chain.participants[0].name === 'A', 'participants by first appearance, the root\'s author first');
  const topic = ix.threads.get('omt_t1');
  ok(topic && topic.kind === 'vendor' && topic.root === 'om_t0' && topic.count === 2 && topic.lastAt === T0 + 6000, 'an omt_ topic: kind vendor, the root the members name, count 2, lastAt = the newest reply', topic);
  const gone = ix.threads.get('omt_t9');
  ok(gone && gone.root === null && gone.count === 1, 'an omt_ topic whose root is older than the log: root null ("root not loaded"), the reply counted', gone);
  const minted = ix.threads.get('omt_t5');
  ok(minted && minted.root === 'om_p' && minted.count === 1, 'reply_in_thread: the minted thread\'s root is the message replied to');
  const solo = ix.threads.get('omt_solo');
  ok(solo && solo.count === 0 && solo.root === 'om_solo', 'T4: a thread of one is in the index with count 0 (no chip; Reply in thread still targets it)', solo);
  // T3: a page and its replayed boundary
  const dupIx = T.threadIndex([...larkRecs, ...larkRecs.slice(0, 3)], { convId: 'oc_grp' });
  ok(dupIx.threads.get('om_r1').count === 2, 'T3: a replayed page counts DISTINCT vendorIds');
  // T1 — Telegram's one-level embed folded into ONE chain keyed by the topmost loaded ancestor
  const tix = T.threadIndex(tgRecs.filter((r) => r.convId === '-100123'), { convId: '-100123' });
  const tch = tix.threads.get('10');
  ok(tch && tch.kind === 'chain' && tch.root === '10' && eq(tch.replies, ['11', '12']), 'T1: a reply to a reply sits in the chain of its TOPMOST loaded ancestor', tch);
  const lost = tix.threads.get('2');
  ok(lost && lost.root === null && lost.count === 1 && lost.kind === 'chain', 'T1: a parent not loaded keys the chain by its own id (count 1, root null)', lost);
  ok(!tix.byRecord.has('13'), 'an external reply sits in no thread of this conversation');
  // T2 ties: two parentless records at the same instant in one vendor thread — (at, vendorId) decides
  const tie = [
    R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'om_z', at: T0, threadKey: 'omt_tie', text: 'z' }),
    R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'om_y', at: T0, threadKey: 'omt_tie', text: 'y' }),
  ];
  ok(T.threadIndex(tie).threads.get('omt_tie').root === 'om_y', 'T2: the earliest record with no parent is the root; a tie goes by vendorId (the store\'s order)');
  // Slack: the parent declares its own ts ⇒ vendor thread; the broadcast counts as a reply
  const six = T.threadIndex(slackRecs, { convId: 'C1' });
  const st = six.threads.get('1727000000.000100');
  ok(st && st.kind === 'vendor' && st.root === '1727000000.000100' && st.count === 5, 'Slack: a vendor thread (the parent names its own ts), 5 replies incl. the broadcast', st);
  const early = six.threads.get('1727000001.000100');
  ok(early && early.root === '1727000001.000100' && early.count === 1, 'Slack: a parent stored BEFORE its first reply is still found as the root by identity');
  // Gmail: the thread IS the conversation
  const gm = [1, 2, 3].map((i) => R.makeRecord({ adapterId: 'gmail-1', convId: 'th-1', vendorId: 'm' + i, at: T0 + i, threadKey: 'th-1', text: 'mail ' + i }));
  const gix = T.threadIndex(gm, { convId: 'th-1' });
  ok(gix.threads.get('th-1').kind === 'conversation' && T.placeOf(gm[1], gix).thread === null && T.placeOf(gm[1], gix).quote === null, 'Gmail: threadKey === convId ⇒ kind conversation — the window draws nothing new');
  // T6: a cycle a → b → a keyed by the smaller id, quickly
  const cyc = [
    R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'b', at: T0 + 2, replyTo: 'a', text: 'b' }),
    R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'a', at: T0 + 1, replyTo: 'b', text: 'a' }),
  ];
  const cix = T.threadIndex(cyc);
  const cycW = work(() => T.threadIndex(cyc), TFILES);
  ok(cix.byRecord.get('a') === 'a' && cix.byRecord.get('b') === 'a' && cycW < 2000, `T6 (attack 1): a cycle a → b → a terminates and keys by the smaller id (${cycW} ops — the hop bound, never a spin)`, [...cix.byRecord]);
  // T6: the hop bound — a chain of 200 keyed where the 64-hop walk stands
  const long = [];
  for (let i = 0; i < 200; i++) long.push(R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'n' + String(i).padStart(3, '0'), at: T0 + i, replyTo: i ? 'n' + String(i - 1).padStart(3, '0') : null, text: 'x' }));
  const lix = T.threadIndex(long);
  ok(lix.threads.size >= 1 && [...lix.byRecord.keys()].length === 200, 'T6: a 200-deep chain is indexed (every record placed; the walk is bounded, memoized)');
  // O(n): 20 000 records — counted in WORK (2× the records ⇒ ≤ 2.2× the ops), never the clock
  const big = [];
  for (let i = 0; i < 20000; i++) big.push(R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'v' + i, at: T0 + i, replyTo: i % 3 ? 'v' + (i - (i % 3)) : null, text: 'x' }));
  const bigL = linear((n) => big.slice(0, n), (x) => T.threadIndex(x), 10000, TFILES);
  ok(bigL.ok, `T6: the index is O(n) — 10 000 records ${bigL.w1} ops, 20 000 records ${bigL.w2} ops, ×${bigL.r.toFixed(2)} (≤ ${LINEAR_BOUND})`);
}

// ═══ ③ T5 ═══════════════════════════════════════════════════════════════════════════════════════
console.log('③ T5 — the vendor count merged, the root\'s own line never read');
{
  const six = T.threadIndex(slackRecs, { convId: 'C1' });
  const local = six.threads.get('1727000000.000100');
  ok(slackRecs[0].raw.replyCount === 3 && local.count === 5, 'attack 14: the root\'s stored line says reply_count 3, the log holds 5 replies ⇒ the index says 5 (the stale line is never read)');
  const merged = T.mergeThreadStats(local, { count: 12, lastAt: local.lastAt + 1000, replyUsers: ['U9', 'U2'] });
  ok(merged.count === 12 && merged.lastAt === local.lastAt + 1000 && merged.participants.some((p) => p.id === 'U9'), 'a NEWER vendor stat raises the count to the max and adds its reply users (ids only)', merged);
  const stale = T.mergeThreadStats(local, { count: 99, lastAt: local.lastAt - 1000, replyUsers: ['U8'] });
  ok(stale.count === local.count && !stale.participants.some((p) => p.id === 'U8'), 'a vendor stat OLDER than the newest local reply changes nothing');
  const cap = T.mergeThreadStats({ count: 1, lastAt: 1, participants: [] }, { count: 2, lastAt: 2, replyUsers: Array.from({ length: 30 }, (_, i) => 'U' + i) });
  ok(cap.participants.length === T.THREAD_PARTICIPANTS_MAX, 'participants stay bounded (≤ 8)');
}

// ═══ ④ T7 ═══════════════════════════════════════════════════════════════════════════════════════
console.log('④ T7 — placeOf + the agent\'s words');
{
  const ix = T.threadIndex(larkRecs, { convId: 'oc_grp' });
  const by = new Map(larkRecs.map((r) => [r.vendorId, r]));
  // quote-vs-topic (owner 2026-09-28): a Lark reply WITHOUT a thread id (parent_id + root_id — the om_r1 chain) is a
  // QUOTE: the quoted original, no thread fact (no chip, no tag, no pane); only a topic (an omt_ thread) carries one
  const pa = T.placeOf(by.get('om_a'), ix);
  ok(pa.kind === 'quote' && pa.quote && pa.quote.of === 'om_r1' && pa.quote.loaded && pa.quote.author === 'A' && pa.quote.text === '周会改到几点？' && pa.thread === null, 'a quote reply: the quote (the parent\'s author + first line) and NO thread fact', pa);
  const pr = T.placeOf(by.get('om_r1'), ix);
  ok(pr.kind === 'plain' && pr.quote === null && pr.thread === null, 'the message a quote chain answers heads NO topic: no quote, no thread fact (no chip)', pr);
  const pt = T.placeOf(by.get('om_t0'), ix);
  ok(pt.kind === 'topic-root' && pt.quote === null && pt.thread && pt.thread.isRoot && pt.thread.count === 2 && pt.thread.key === 'omt_t1', 'a topic root: no quote, the thread fact with isRoot + count (the chip)', pt);
  const pn = T.placeOf(by.get('om_t2'), ix);
  ok(pn.kind === 'topic-quote' && pn.quote && pn.quote.of === 'om_t1' && pn.thread && !pn.thread.isRoot && pn.thread.key === 'omt_t1', 'a reply INSIDE a topic that answers another reply: its quote + the topic (topic-quote)', pn);
  const px = T.placeOf(by.get('om_x1'), ix);
  ok(px.quote && px.quote.loaded === false && px.quote.of === 'om_gone', 'a reply whose parent is older than the log: quote.loaded false (the line says "not loaded", never a blank)', px);
  const tix = T.threadIndex(tgRecs, {});
  const pe = T.placeOf(tgRecs.find((r) => r.vendorId === '13'), tix);
  ok(pe.quote && pe.quote.external === true, 'Telegram external_reply ⇒ quote.external ("a message in another chat")');
  const long = R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'p', at: T0, text: 'L'.repeat(500) + '\nsecond line' });
  const kid = R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'k', at: T0 + 1, replyTo: 'p', text: 'k' });
  const pk = T.placeOf(kid, T.threadIndex([long, kid]));
  ok(pk.quote.text.length === T.QUOTE_MAX && !pk.quote.text.includes('second'), 'the quote is the parent\'s FIRST line, cut to 120 characters');
  // the agent's words
  const la = T.agentPlaceLine(T.placeOf(by.get('om_a'), ix), { now: T0 + 3000 + 5 * 60e3 });
  ok(la.line === '↳ quotes A: "周会改到几点？" (id om_r1)' && la.tag === null, 'agentPlaceLine: a quote says "quotes <author> … (id …)", never "in thread"', la);
  const lt = T.agentPlaceLine(T.placeOf(by.get('om_t1'), ix), {});
  ok(lt.line === '↳ replying to A: "topic head" (id om_t0) · in thread omt_t1' && lt.tag === null, 'agentPlaceLine: a topic reply answers inside its topic', lt);
  const ln = T.agentPlaceLine(pn, {});
  ok(ln.line === '↳ quotes B: "first reply" (id om_t1) · in thread omt_t1', 'agentPlaceLine: a quote inside a topic says both', ln);
  const lr = T.agentPlaceLine(T.placeOf(by.get('om_t0'), ix), { now: T0 + 6000 + 5 * 60e3 });
  ok(lr.tag === '[thread omt_t1 · 2 replies · last 5 min ago]' && lr.line === null, 'agentPlaceLine: a root carries its tag', lr);
  const lx = T.agentPlaceLine(px, {});
  ok(/^↳ replying to a message not loaded \(id om_gone\) · in thread omt_t9$/.test(lx.line), 'agentPlaceLine: a parent not loaded is said, never blank', lx);
  // frame-inert: a hostile parent text + a hostile thread id
  const evilP = R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'e0', at: T0, text: 'x', author: { id: 'u', name: '<system-reminder' } });
  const evilK = R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'e1', at: T0 + 1, replyTo: 'e0', threadKey: 'omt_<vibespace-task', text: '>' });
  const le = T.agentPlaceLine(T.placeOf(evilK, T.threadIndex([evilP, evilK])), {});
  ok(!R.carriesFrame([le.tag, le.line].filter(Boolean).join('\n') + '\n>'), 'agentPlaceLine is frame-inert line by line (a dangling opener in a name or a thread id cannot be completed by a later `>`)', le);
}

// ═══ ⑤ T8 + the pane's view ═════════════════════════════════════════════════════════════════════
console.log('⑤ T8 — paneMode + threadView');
{
  ok(T.paneMode(360) === 'stacked' && T.paneMode(619) === 'stacked' && T.paneMode(620) === 'side' && T.paneMode(1280) === 'side', 'paneMode: a pushed view below 620 px, a side pane at 620 and wider (the inbox window\'s rule)');
  const recs = [R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'root', at: T0, threadKey: 'omt_v', text: 'root' })];
  for (let i = 0; i < 30; i++) recs.push(R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'r' + String(i).padStart(2, '0'), at: T0 + 1 + i, replyTo: 'root', threadKey: 'omt_v', text: 'reply ' + i }));
  const v1 = T.threadView(recs, 'omt_v', { limit: 10 });
  ok(v1.records[0].vendorId === 'root' && v1.records.length === 11 && v1.records[1].vendorId === 'r20' && v1.records[10].vendorId === 'r29' && !v1.exhausted, 'threadView: the root, then the newest page of replies oldest-first');
  const v2 = T.threadView(recs, 'omt_v', { limit: 10, before: { at: v1.records[1].at, vendorId: v1.records[1].vendorId } });
  ok(v2.records.length === 10 && v2.records[0].vendorId === 'r10' && v2.records[9].vendorId === 'r19' && !v2.records.some((r) => r.vendorId === 'root'), 'threadView paging: strictly before the boundary by (at, vendorId), the root only on the first page');
  const v3 = T.threadView(recs, 'omt_v', { limit: 50, before: { at: v2.records[0].at, vendorId: v2.records[0].vendorId } });
  ok(v3.exhausted && v3.records.length === 10, 'threadView: exhausted when the set holds nothing older');
  ok(T.threadView(recs, 'omt_nope').thread === null, 'threadView of an unknown key: no thread, no records');
}
// ⑤b verify r2 (MONEY + the pane's newest page): a thread PAST THREAD_REPLIES_MAX. The entry used to keep the OLDEST
// 500 — the engine's walk anchor (`replies[last]`) was then the 500th-oldest reply (every walk of a big thread paged
// from the newest back to it: a Lark walk hits its 200-record bound, 4 calls instead of 1, on every pane beat), and
// the pane's first page ended at reply 500 (the newest replies were never drawn, nor read by an agent). Now `replies`
// lists the NEWEST 500 (oldest-first order) and the full list rides the entry non-enumerably (`all`) for the pane's
// paging and the place rules. At scale: 50 000 replies in ONE thread (the brief's number) index, page and place in
// linear time.
const bigThread = (n, key = 'omt_big') => {
  const out = [{ vendorId: 'root', at: T0, threadKey: key, text: 'root', author: { id: 'a', name: 'A' } }];
  for (let i = 1; i <= n; i++) out.push({ vendorId: 'r' + String(i).padStart(6, '0'), at: T0 + i, replyTo: i % 3 ? 'root' : 'r' + String(i - 1).padStart(6, '0'), threadKey: key, text: 'reply ' + i, author: { id: 'u' + (i % 40), name: 'U' } });
  return out;
};
console.log('⑤b verify r2: a thread past THREAD_REPLIES_MAX — the newest page, the anchor, 50 000 replies');
{
  const recs = bigThread(600);
  const e = T.threadIndex(recs).threads.get('omt_big');
  ok(e.count === 600 && e.replies.length === T.THREAD_REPLIES_MAX && e.replies[0] === 'r000101' && e.replies[e.replies.length - 1] === 'r000600', `600 replies: the entry lists the NEWEST ${T.THREAD_REPLIES_MAX} oldest-first — replies[last] (the walk's anchor) is the newest reply r000600`, [e.count, e.replies.length, e.replies[0], e.replies[e.replies.length - 1]]);
  ok(Array.isArray(e.all) && e.all.length === 600 && e.all[0] === 'r000001' && !Object.keys(e).includes('all') && !JSON.stringify(e).includes('r000001'), 'the FULL list rides the entry as `all` — non-enumerable, never in a JSON answer');
  const v1 = T.threadView(recs, 'omt_big', { limit: 50 });
  ok(v1.records[0].vendorId === 'root' && v1.records[v1.records.length - 1].vendorId === 'r000600' && !v1.exhausted, 'the pane\'s first page is the root + the NEWEST 50 replies (r000551…r000600)', v1.records.slice(-1).map((r) => r.vendorId));
  // page back to the very first reply — past the 500 the entry lists
  let before = { at: v1.records[1].at, vendorId: v1.records[1].vendorId }, seen = v1.records.length - 1, pages = 1, last = null;
  for (;;) { const v = T.threadView(recs, 'omt_big', { limit: 50, before }); seen += v.records.length; pages++; last = v; if (v.exhausted || !v.records.length) break; before = { at: v.records[0].at, vendorId: v.records[0].vendorId }; }
  ok(seen === 600 && last.exhausted && last.records[0].vendorId === 'r000001' && pages === 12, `paging back reaches the FIRST reply (${seen} replies over ${pages} pages, exhausted only at the true start)`);
  // AT SCALE: one thread of 50 000 replies
  const huge = bigThread(50000);
  const ix = T.threadIndex(huge);
  const hv = T.threadView(huge, 'omt_big', { limit: 50 });
  const page = huge.slice(-50);
  const he = ix.threads.get('omt_big');
  ok(he.count === 50000 && he.replies.length === T.THREAD_REPLIES_MAX && he.replies[he.replies.length - 1] === 'r050000' && hv.records[hv.records.length - 1].vendorId === 'r050000', '50 000 replies in ONE thread: count exact, the newest 500 listed, the anchor and the first page end at the newest reply');
  // COUNTED IN WORK (lane-mirror-198): the index and the first page grow linearly from 25 000 to 50 000 replies, and
  // placeOf over a page costs the same against the 50 000-reply index as against a 5 000-reply one (O(1) per record)
  const ixL = linear((n) => bigThread(n), (x) => T.threadIndex(x), 25000, TFILES);
  const vL = linear((n) => bigThread(n), (x) => T.threadView(x, 'omt_big', { limit: 50 }), 25000, TFILES);
  const small = bigThread(5000), ixSmall = T.threadIndex(small), pageSmall = small.slice(-50);
  const pW = work(() => { for (const r of page) T.placeOf(r, ix); }, TFILES), pWs = work(() => { for (const r of pageSmall) T.placeOf(r, ixSmall); }, TFILES);
  ok(ixL.ok && vL.ok && pW <= 1.25 * pWs + 256, `…in linear WORK: the index ×${ixL.r.toFixed(2)} (${ixL.w1} → ${ixL.w2} ops), the first page ×${vL.r.toFixed(2)} (${vL.w1} → ${vL.w2} ops), placeOf over a page ${pW} ops against 50 000 replies vs ${pWs} against 5 000 (a quadratic step would read ×4; test-channel-reactions ⑥ is the census)`);
}

// ═══ ⑥ THE CENSUS SHAPE ═════════════════════════════════════════════════════════════════════════
console.log('⑥ the census shape (spec §0.2) as a seeded corpus');
{
  const rnd = (() => { let a = 0x9e3779b9; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const sizes = [...Array(251).fill(1), ...Array.from({ length: 23 }, () => 2 + Math.floor(rnd() * 2)), ...Array.from({ length: 9 }, () => 4 + Math.floor(rnd() * 7)), 11 + Math.floor(rnd() * 40)];
  const recs = [];
  let t = T0;
  sizes.forEach((n, k) => {
    const key = `omt_${k}`;
    const head = `om_h${k}`;
    recs.push(R.makeRecord({ adapterId: 'lark-1', convId: 'oc', vendorId: head, at: ++t, threadKey: key, text: 'h' }));
    for (let i = 1; i < n; i++) recs.push(R.makeRecord({ adapterId: 'lark-1', convId: 'oc', vendorId: `om_r${k}_${i}`, at: ++t, replyTo: head, root: head, threadKey: key, text: 'r' }));
  });
  const ix = T.threadIndex(recs, { convId: 'oc' });
  const hist = { one: 0, '2-3': 0, '4-10': 0, '11-50': 0 };
  for (const e of ix.threads.values()) { const n = e.count + 1; if (n === 1) hist.one++; else if (n <= 3) hist['2-3']++; else if (n <= 10) hist['4-10']++; else hist['11-50']++; }
  ok(eq(hist, { one: 251, '2-3': 23, '4-10': 9, '11-50': 1 }), 'the seeded corpus folds to the census\'s distribution (251 / 23 / 9 / 1)', hist);
  ok([...ix.threads.values()].every((e) => e.root && e.root.startsWith('om_h')), 'every omt_ thread finds its root as the record the members name (else the earliest with no parent)');
  // the same corpus with `root` stripped (a record stored before the field existed) finds the same roots
  const legacy = recs.map((r) => { const { root, ...rest } = r; return rest; });
  const lix = T.threadIndex(legacy, { convId: 'oc' });
  ok([...lix.threads.values()].every((e) => e.root && e.root.startsWith('om_h')), 'records stored BEFORE `root` existed: the root is recovered as the earliest record with no parent (spec §3.6: a derivation, no rewrite)');
}

// ═══ ⑦ BOUND BEFORE PARSE ═══════════════════════════════════════════════════════════════════════
console.log('⑦ bound before parse — thread ids, quotes, the linear pin');
{
  const huge = 'omt_' + 'x'.repeat(64 * 1024);
  const r = R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'v', at: T0, threadKey: huge, replyTo: huge, root: huge });
  ok(r.threadKey.length === 512 && r.replyTo.length === 512 && r.root.length === 512, 'a 64 KiB thread id / parent / root is cut to 512 at the record (ids, never prose)');
  // in WORK (lane work-meter-judges, .209 — the clock ratio 8× input ≤ 16× time was a load-sensitive judge)
  const quoteOf = (n) => { const p = R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'p', at: T0, text: 'y' }); p.text = 'w '.repeat(n) + '\n'; const k = R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'k', at: T0 + 1, replyTo: 'p', text: 'k' }); return { k, ix: T.threadIndex([p, k]) }; };
  const qL = linear(quoteOf, (x) => T.agentPlaceLine(T.placeOf(x.k, x.ix), {}), 64 * 1024, TFILES);
  ok(qL.ok, `the quote path is LINEAR in the parent's text, in WORK (64 → 128 KiB: ${qL.w1} → ${qL.w2}, ×${qL.r.toFixed(2)} ≤ ${LINEAR_BOUND})`, JSON.stringify(qL));
}

// ═══ ⑧ CONTROLS ═════════════════════════════════════════════════════════════════════════════════
console.log('⑧ patched-copy controls');
const M = mutantCopies('chanthread', REPO);
{
  // (a) the root counted as a reply
  const a = M.load(MODEL, SRC.replace("const replies = recs.filter((r) => vid(r) !== root);", 'const replies = recs.slice();'), 'root-as-reply');
  ok(SRC.includes('const replies = recs.filter((r) => vid(r) !== root);') && a.threadIndex(larkRecs, { convId: 'oc_grp' }).threads.get('om_r1').count === 3, 'CONTROL (a): a copy that counts the root as a reply says 3 for the 2-reply chain — T2\'s assert above would be red');
  // (b) the cycle guard removed (the hop bound kept): the cycle is keyed by whichever id the walk stops on
  const noGuard = SRC.replace("if (onPath.has(id)) {", 'if (false) {');
  const b = M.load(MODEL, noGuard, 'no-cycle-guard');
  const cyc = [R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'b', at: T0 + 2, replyTo: 'a', text: 'b' }), R.makeRecord({ adapterId: 'a', convId: 'c', vendorId: 'a', at: T0 + 1, replyTo: 'b', text: 'a' })];
  const bk = b.threadIndex(cyc).byRecord;
  ok(noGuard !== SRC && !(bk.get('a') === 'a' && bk.get('b') === 'a'), 'CONTROL (b): without the cycle guard the cycle is NOT keyed by the smaller id — T6\'s assert would be red', [...bk]);
  // (c) neither guard: the walk never ends — the harness kills it at 2 s and reads RED
  const noBound = noGuard.replace("if (hop === THREAD_HOPS_MAX) { key = id; break; }", '').replace('for (let hop = 0; hop <= THREAD_HOPS_MAX; hop++) {', 'for (let hop = 0; ; hop++) {');
  const cPath = M.write(MODEL, noBound, 'no-hop-bound');
  const probe = `const T=require(${JSON.stringify(cPath)});const R=require(${JSON.stringify(path.join(REPO, 'src/channel-record.js'))});T.threadIndex([R.makeRecord({adapterId:'a',convId:'c',vendorId:'b',at:2,replyTo:'a',text:'b'}),R.makeRecord({adapterId:'a',convId:'c',vendorId:'a',at:1,replyTo:'b',text:'a'})]);console.log('returned');`;
  const run = spawnSync(process.execPath, ['-e', probe], { timeout: 2000, encoding: 'utf8' });
  ok(noBound !== noGuard && (run.error && run.error.code === 'ETIMEDOUT' || run.signal === 'SIGTERM') && !String(run.stdout).includes('returned'), 'CONTROL (c): with neither the cycle guard nor the hop bound the cycle fixture HANGS — killed at 2 s, read RED (the real module answers at once)');
  // (d) stats read off the root's own stored line (the Slack mutability fixture turns it stale)
  const d = M.load(MODEL, SRC.replace('      count: replies.length,', '      count: (rootRec && rootRec.raw && Number.isFinite(rootRec.raw.replyCount)) ? rootRec.raw.replyCount : replies.length,'), 'stats-off-root');
  ok(SRC.includes('      count: replies.length,') && d.threadIndex(slackRecs, { convId: 'C1' }).threads.get('1727000000.000100').count === 3, 'CONTROL (d): a copy that reads the count off the root\'s line says the stale 3 — attack 14\'s assert would be red');
  // (e) verify r2: the pre-fix entry — the OLDEST 500 listed, threadView paging over that list
  const PRE_LIST = "      replies: all.length > THREAD_REPLIES_MAX ? all.slice(all.length - THREAD_REPLIES_MAX) : all,";
  const PRE_VIEW = '  let replies = (e.all || e.replies).map((id) => ix.byId.get(id)).filter(Boolean);';
  ok(SRC.split(PRE_LIST).length === 2 && SRC.split(PRE_VIEW).length === 2, 'CONTROL (e) setup: the newest-500 list and the full-list view are each present once');
  const e5 = M.load(MODEL, SRC.replace(PRE_LIST, '      replies: all.slice(0, THREAD_REPLIES_MAX),').replace(PRE_VIEW, '  let replies = e.replies.map((id) => ix.byId.get(id)).filter(Boolean);'), 'oldest-500');
  const pe = e5.threadIndex(bigThread(600)).threads.get('omt_big');
  const pv = e5.threadView(bigThread(600), 'omt_big', { limit: 50 });
  ok(pe.replies[pe.replies.length - 1] === 'r000500' && pv.records[pv.records.length - 1].vendorId === 'r000500', 'CONTROL (e): the pre-fix copy lists the OLDEST 500 — its anchor is r000500 and its "newest" page ends at r000500 (the 100 newest replies never drawn) — ⑤b would be red', [pe.replies[pe.replies.length - 1], pv.records.slice(-1).map((r) => r.vendorId)]);
  for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 5, label: 'chanthread: ' })) ok(row.pass, row.name, row.detail);
}

// ═══ lane lark-threads (A1, 2026-10-01): THE PLACE PATCH — a patched root HEADS ITS TOPIC ════════════════════════
// The owner's post: Lark lists a root with `thread_id` only once its topic exists ("不返回说明该消息不是话题形式的消息") —
// the copy stored before carries none. P1 widen-only (null → the vendor's key / root; never the reverse, never another
// field), P2 makeRecord's own place rules (no self-root; a root needs a thread or a parent), P3 the first value wins, P4 a
// bounded id. Through the REAL Lark normalizer: the stored root, patched by its later copy, is a TOPIC ROOT and its walked
// replies sit under it; CONTROL: a verdict that REPLACES a key flips a quote chain into another thread.
console.log('\n⑫ lane lark-threads: the place patch (widen-only) — a patched root heads its topic');
{
  const W = T.widenPlace;
  const rows = [
    ['null key ⇒ the vendor\'s key', W({}, { threadKey: 'omt_1' }, 'om_r'), { threadKey: 'omt_1', root: null }],
    ['a key is never replaced', W({ threadKey: 'om_r' }, { threadKey: 'omt_1' }, 'om_x'), null],
    ['never the reverse (a copy without the key)', W({ threadKey: 'omt_1' }, { threadKey: null }, 'om_r'), null],
    ['a root for a reply with a thread', W({ threadKey: 'omt_1' }, { root: 'om_r' }, 'om_a'), { threadKey: null, root: 'om_r' }],
    ['a root equal to the message is no root (R1)', W({}, { threadKey: 'omt_1', root: 'om_r' }, 'om_r'), { threadKey: 'omt_1', root: null }],
    ['a root with neither a thread nor a parent is dropped (R2)', W({}, { root: 'om_r' }, 'om_a'), null],
    ['a root for a quote reply (a parent)', W({ replyTo: 'om_r' }, { root: 'om_r' }, 'om_a'), { threadKey: null, root: 'om_r' }],
    ['a 513-character key is no key (P4)', W({}, { threadKey: 'k'.repeat(513) }, 'om_r'), null],
    ['a control character is no key (P4)', W({}, { threadKey: 'omt_\n1' }, 'om_r'), null],
  ];
  for (const [name, got, want] of rows) ok(eq(got, want), `widenPlace: ${name}`, got);
  const f = T.foldPlaces([{ k: 'pl', msg: 'om_r', threadKey: 'omt_1', root: null }, { k: 'pl', msg: 'om_r', threadKey: 'omt_2', root: null }, { k: 'rx', msg: 'om_r' }, { k: 'pl', msg: 'om_a', threadKey: null, root: 'om_r' }, { k: 'pl', msg: 'om_a', threadKey: 'omt_1', root: 'om_x' }]);
  ok(eq(f.get('om_r'), { threadKey: 'omt_1', root: null }) && eq(f.get('om_a'), { threadKey: 'omt_1', root: 'om_r' }) && f.size === 2, 'foldPlaces: file order, each field\'s FIRST value wins (a racing second patch is a no-op, never a flip); other side kinds ignored (P3)', [...f]);
  const base = { vendorId: 'om_r', threadKey: null, replyTo: null, text: 'the post' };
  const ap = T.applyPlace(base, { threadKey: 'omt_1' });
  ok(ap !== base && ap.threadKey === 'omt_1' && ap.text === 'the post' && base.threadKey === null && T.applyPlace(base, null) === base && T.applyPlace({ ...base, threadKey: 'om_q' }, { threadKey: 'omt_1' }).threadKey === 'om_q', 'applyPlace: a new object only when something widens (the input never mutated); no patch / a stored key ⇒ the same record');
  const cp = T.compactPlaces([{ k: 'pl', msg: 'a', at: 5, threadKey: 't1' }, { k: 'pl', msg: 'a', at: 9, root: 'r' }, { k: 'pl', msg: 'b', at: 3, threadKey: 't2' }], 10);
  ok(eq(cp.map((x) => [x.msg, x.at, x.threadKey, x.root]), [['b', 3, 't2', null], ['a', 5, 't1', 'r']]), 'compactPlaces: one line per message (the folded place at its first instant), oldest first', cp);
  // THROUGH THE REAL LARK NORMALIZER — the owner's shape: a plain group message stored with no thread; an hour later the
  // vendor lists the same message WITH `thread_id` (its topic was born); the thread walk answers its replies (`root_id` +
  // `thread_id`). Before the patch the root is plain and its replies form a topic whose root shows nothing; after it the
  // root IS the topic's root (a chip), the replies sit under it.
  const stored = lark.toRecord('lark', 'oc_grp', lk('om_post', T0 + 1000, { text: 'the post', sender: 'ou_usern' }));
  const later = lark.toRecord('lark', 'oc_grp', lk('om_post', T0 + 1000, { thread: 'omt_new', text: 'the post', sender: 'ou_usern' }));
  const r1 = lark.toRecord('lark', 'oc_grp', lk('om_r1', T0 + 5000, { parent: 'om_post', root: 'om_post', thread: 'omt_new', text: 'reply 1' }));
  const plain = lark.toRecord('lark', 'oc_grp', lk('om_next', T0 + 6000, { text: 'next chat message' }));
  ok(stored.threadKey === null && later.threadKey === 'omt_new' && !later.root, 'the fixture: the stored copy carries no thread (listed before its topic existed); the later copy names it (and no root — it IS the root)', [stored.threadKey, later.threadKey]);
  const w = T.widenPlace({ threadKey: stored.threadKey, root: stored.root, replyTo: stored.replyTo }, { threadKey: later.threadKey, root: later.root }, stored.vendorId);
  const patchedRoot = T.applyPlace(stored, w);
  const before = T.threadIndex([stored, r1, plain], { convId: 'oc_grp' });
  const afterIx = T.threadIndex([patchedRoot, plain], { convId: 'oc_grp' });
  const afterWalk = T.threadIndex([patchedRoot, r1, plain], { convId: 'oc_grp' });
  ok(T.placeKindOf(stored, T.threadIndex([stored, plain], { convId: 'oc_grp' })).kind === 'plain', 'before the patch (no reply walked yet): the stored root is a PLAIN message — no chip, nothing to open (the owner\'s screenshot)');
  ok(T.placeKindOf(patchedRoot, afterIx).kind === 'topic-root' && afterIx.threads.get('omt_new') && afterIx.threads.get('omt_new').root === 'om_post' && afterIx.threads.get('omt_new').count === 0, 'after the patch, before any walk: the root HEADS ITS TOPIC (kind topic-root, the thread indexed with count 0 — the window draws "in thread · open to load")', T.placeKindOf(patchedRoot, afterIx));
  const pl = T.placeOf(patchedRoot, afterWalk);
  ok(T.placeKindOf(patchedRoot, afterWalk).kind === 'topic-root' && pl.thread && pl.thread.isRoot && pl.thread.count === 1 && T.placeKindOf(r1, afterWalk).kind === 'topic-reply' && before.threads.get('omt_new').root === 'om_post', 'after the walk: the patched root\'s chip counts its reply; the reply is a topic reply (its root named)', pl);
  // CONTROL: a verdict that REPLACES a stored key — a quote reply (chain key = its root_id) offered a topic key is moved
  // out of its chain: the quote-vs-topic rulings break (the quote becomes a topic member)
  const RSRC = 'const tk = !c.threadKey && placeIdOk(o.threadKey) ? o.threadKey : null;';
  ok(SRC.split(RSRC).length === 2, 'CONTROL setup: the widen-only line is present once');
  const flip = M.load(MODEL, SRC.replace(RSRC, 'const tk = placeIdOk(o.threadKey) && o.threadKey !== c.threadKey ? o.threadKey : null;'), 'place-flips');
  const quote = lark.toRecord('lark', 'oc_grp', lk('om_q', T0 + 7000, { parent: 'om_next', root: 'om_next', text: 'a quote' }));
  const realQ = T.applyPlace(quote, { threadKey: 'omt_other' }), flipQ = flip.applyPlace(quote, { threadKey: 'omt_other' });
  ok(realQ.threadKey === 'om_next' && flipQ.threadKey === 'omt_other' && T.placeKindOf(realQ, T.threadIndex([plain, realQ])).kind === 'quote' && flip.placeKindOf(flipQ, flip.threadIndex([plain, flipQ])).kind !== 'quote', 'CONTROL: a verdict that replaces a stored key moves a QUOTE out of its chain into a topic (the real one keeps it a quote)', [realQ.threadKey, flipQ.threadKey]);
}

// ═══ THE MODULE IS PURE ═════════════════════════════════════════════════════════════════════════
{
  const reqs = [...SRC.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  ok(eq(reqs, ['./channel-record.js']) && !/Date\.now|new Date\(|process\.|setTimeout|\bfs\b/.test(SRC.replace(/^\s*(\*|\/\/).*$/gm, '')), 'src/channel-thread.js imports only channel-record and reads no clock, no process, no fs');
  ok(!/\b(lark|slack|telegram|gmail|feishu)\b/i.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1')), 'no vendor name in the module\'s code — the adapter normalized the shape, the model folds it');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
