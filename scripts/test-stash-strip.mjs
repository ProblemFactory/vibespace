#!/usr/bin/env node
// WHAT IS WAITING FOR AN AGENT — VISIBLE, AND HANDED OVER ON REQUEST (the owner, 2026-09-27: "能看到，只是会堆积到我
// 下次发消息给它，这个有点 confusing，因为我在界面里完全看不到'有消息在 queue'这件事情"). Gate row `test-stash-strip`, fast.
//
//   ① PURE src/stash-summary.js: kindOf (the SOURCE and the PATH decide; a sender name only for VibeSpace's own
//      senders — a peer NAMED "VibeSpace browser" is still a peer), summarize (grouping, KIND_ORDER, a peer by its
//      name, oldestAt, null when nothing waits), summaryDigest, stashSummaryWords (the head, one part per kind in
//      the singular and the plural, the button, the cost only when a turn would be billed) — tables
//   ② THE ENGINE: the REAL conversation-deliver (scratch data dir, a recording spend authorizer, a fake local
//      inbox) + the REAL JobManager's own stash + the REAL src/server/stash-handover.js over a live-session map:
//      a stash write fires the ladder's and the jobs engine's hooks ⇒ ONE debounced re-publish; the session's fact
//      counts both stores and the strip's numbers follow; HAND OVER = ONE injection holding every stashed item
//      (both stores), ONE ledger row under `stash-handover`, the stashes emptied — and what arrived during the
//      delivery keeps waiting; a spend refusal is answered BY NAME and leaves both stashes exactly as they were;
//      the next user message's drain (the injection route's `drainStash`) empties the fact without the button
//   ②b VERIFY (channel-jump verify, 2026-09-27 — each reproduced on the real ladder before its fix): two concurrent
//      hand-overs (a double click, two tabs) are ONE post + ONE ledger row, the second `in_flight` by name; the
//      user's own message draining at its injection WHILE a hand-over awaits the ladder takes nothing the hand-over
//      claimed (one copy, one row; an entry that arrived after the claim rides the user's turn); the jobs stash's
//      full drain leaves a claimed job result too; a refusal releases the claim (the next injection takes them);
//      `billed` on the fact = the harness's LANE (claude mid-turn charged; codex steer mid-turn free; idle billed);
//      >2 job results spill to the read file and the text names it; a `wrapper-no-steer` refusal is
//      `held_for_next_turn`, never `unreachable`
//   ②c VERIFY r2 (runs after ④ — it draws the real strip; channel-jump verify r2, 2026-09-27 — the exactly-once round; each reproduced before its fix): every
//      path pair as an interleaving with a PARKED ladder post — hand-over ‖ a SIGTERM restart (the shutdown's
//      `settle` waits, the drain is on disk, a second server over the same dir finds nothing: exactly once — was a
//      duplicate), hand-over ‖ a SIGKILL mid-round-trip (the `ho:<id>` stamp is on disk in BOTH stores; the next boot
//      RELEASES by name, never drops), the drain after a delivery persists at once (was a 500 ms / 2 s window),
//      hand-over ‖ a new write into a FULL store (the evicted claimed entry was delivered; the new one is drained
//      next, never lost), hand-over ‖ a job finalize's stash, hand-over ‖ a second client (409 names the id + since;
//      the fact says `inFlight` while it runs), hand-over ‖ a kill (the claim dies with the outcome, both ways),
//      the codex `ok:false` frame through the REAL codex-events consumer restores the ORIGINAL entries (5 stay 5,
//      the job result back in its store — was ONE blob), `billed` × harness × turn × wrapper as a table against what
//      the ladder does (a ledger row or not), the overflow words (`held` on the fact, the result and the toast — the
//      rest is named, never hidden in a count), the strip's inFlight / held / no-button states
//   ②d VERIFY r3 (channel-jump verify r3, 2026-09-27 — each reproduced through the REAL codex consumer before its fix): a
//      PEER frame whose words quote a remembered hand-over's tag, handed back by the wrapper, is stashed as ITSELF and
//      resurrects nothing (was: the three entries the agent had already received came back and the peer's message was
//      lost — the restore was keyed on a string a peer can write; now the frame must BE the frame, text-equal); the
//      hand-over's own frame still restores; a record with no originals left (the cap evicted them mid-flight) keeps the
//      frame as one notice on its first echo (was: dropped); the shutdown's door — `close()` before `settle()` — refuses
//      a press during the wait by name (`restarting`, 503) so nothing starts that nobody waits for
//   ③ THE ROUTE (express, a free port): an agent's session / job bearer is 403, the cookie POST hands over,
//      `nothing_waiting` 409, an unknown session 404
//   ④ THE STRIP (the REAL src/lib/stash-strip.js over a small fake DOM): hidden with no fact, shown with the head /
//      parts / button / cost, patched IN PLACE (the same nodes) when the numbers change, a running turn drops the
//      cost, hidden again when the fact clears; the sidebar card's hint added / patched / removed in place
//   ⑤ NEGATIVE CONTROLS (scratch copies, scripts/mutant-copy.mjs): a hand-over that hides the fact ⇒ the strip never
//      appears; a hand-over that takes the stash BEFORE delivering ⇒ a refusal loses the notices; the in-flight guard
//      removed ⇒ two clicks bill twice; the claim removed ⇒ the injection race delivers twice; `billed` read off the
//      turn alone ⇒ a claude session mid-turn says "no cost" while the ladder charges; r2: the shutdown that does not
//      wait ⇒ the SIGTERM restart re-delivers; the drain's debounced persist ⇒ the disk still holds a delivered entry
//      (the ladder's store and the jobs store, one copy each); the restorer removed ⇒ the frame is ONE blob; `held`
//      dropped from the result ⇒ the toast hides the rest; `inFlight` dropped from the fact ⇒ a second client's
//      button stays live; r3: the text equality dropped ⇒ a peer's quoted tag resurrects a delivered hand-over and
//      loses the peer's message; the door removed ⇒ a press during the shutdown's wait starts a hand-over nobody waits for
//   ⑥ WIRING PINS: the payload's `stash` fact, the two stores' hooks, LIVE_SESSION_FACTS carried-only, the strip above
//      the queue strip, ChatView feeding it, the sidebar patch + the card's hint, SPEND_REASONS + the census row +
//      the sender list, zh + ja
//   ②k (lane group-report-card) GROUP MESSAGES WAITING: the fact reads the groups engine's preview (commits nothing,
//      memoised), the strip names them with no hand-over button ("they ride the next turn"), beside a stash entry
//      the button stays and names what rides the next message, the report's commit clears them, a pending fork shows
//      none; control: a fact without the preview ⇒ the strip never appears
//
// Zero vendor calls; per-pid scratch dirs. Run: node scripts/test-stash-strip.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch, freePort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// THE SUITE CLEANS ITS OWN SCRATCH (verify r6): every rig mints `/tmp/vs-stash-strip-…-<pid>` and nothing removed them —
// 2 400 dirs had piled up under /tmp from standalone runs (the gate's reaper judges PROCESSES, not dirs). At exit every
// dir of THIS pid goes; a dir of a pid that is provably gone (no /proc entry) is an orphan of an earlier run and goes too.
const TMP = path.dirname(scratch('stash-strip-x'));
const sweepScratch = () => {
  let mine = 0, orphans = 0;
  for (const d of fs.readdirSync(TMP)) {
    const m = /^vs-stash-strip-.*-(\d+)(?:-boot)?$/.exec(d); if (!m) continue;   // r7: an older run's `<dir>-boot` twin is an orphan too
    const pid = Number(m[1]);
    const own = pid === process.pid, dead = !own && !fs.existsSync(`/proc/${pid}`);
    if (!own && !dead) continue;
    try { fs.rmSync(path.join(TMP, d), { recursive: true }); if (own) mine++; else orphans++; } catch { }
  }
  return { mine, orphans };
};
process.on('exit', () => { const n = sweepScratch(); if (n.orphans) console.log(`  (swept ${n.orphans} orphan scratch dir(s) of dead runs)`); });
const S = require(path.join(REPO, 'src/stash-summary.js'));
const tEn = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));

// ═══ ① PURE ═══
console.log('① PURE src/stash-summary.js');
{
  const K = (e, o) => S.kindOf(e, o);
  ok(K({ source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox' }) === 'channel-receipt' && K({ source: 'channel', kind: 'notification', fromName: 'Channels · Work' }) === 'channel'
    && K({ source: 'window-request', kind: 'peer', fromName: 'VibeSpace desktop' }) === 'window-request' && K({ source: 'agent', kind: 'notification', fromName: 'VibeSpace browser' }) === 'handback'
    && K({ source: 'agent', kind: 'notification', fromName: 'Background Work · nightly' }) === 'job' && K({ source: 'agent', kind: 'notification', fromName: 'Channels · Lark' }) === 'channel'
    && K({ source: 'agent', kind: 'notification', fromName: 'VibeSpace notices' }) === 'notice' && K({ source: 'agent', kind: 'peer', fromName: 'Ada' }) === 'peer' && K({}, { job: true }) === 'job',
    'kindOf: the SOURCE first, then the PATH (a notification), a sender name only for VibeSpace\'s own senders');
  ok(K({ source: 'agent', kind: 'peer', fromName: 'VibeSpace browser' }) === 'peer' && K({ source: 'agent', fromName: 'Background Work · x' }) === 'peer', 'a PEER named like a VibeSpace sender is still a peer (the path decides, never the name — S3 verify F3)');
  ok(S.summarize({}) === null && S.summarize({ msg: [], jobs: [] }) === null, 'nothing waiting ⇒ null (the fact says nothing)');
  const sum = S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Bo', ts: 50 }, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', ts: 30 }, { source: 'agent', kind: 'peer', fromName: 'Ada', ts: 40 }, { source: 'agent', kind: 'peer', fromName: 'Ada', ts: 45 }], jobs: [{ ts: 20 }, { ts: 60 }] });
  ok(sum.count === 6 && sum.oldestAt === 20 && JSON.stringify(sum.items.map((i) => [i.kind, i.label, i.n])) === JSON.stringify([['channel-receipt', null, 1], ['job', null, 2], ['peer', 'Ada', 2], ['peer', 'Bo', 1]]),
    'summarize: grouped by kind (a peer by its name), in KIND_ORDER, counts + the oldest instant', sum);
  ok(S.summaryDigest(sum) === '6|channel-receipt::1,job::2,peer:Ada:2,peer:Bo:1' && S.summaryDigest(null) === '', 'summaryDigest moves with every printed field');
  const w = S.stashSummaryWords(sum, tEn);
  ok(w.head === '6 notices are waiting for this agent’s next turn' && w.parts.join(', ') === 'a channel receipt, 2 job results, 2 messages from Ada, a message from Bo' && w.button === 'Hand over now' && w.cost === 'starts a turn',
    'stashSummaryWords: the head, one part per group, the button, the cost', w);
  const one = S.stashSummaryWords(S.summarize({ msg: [{ source: 'agent', kind: 'notification', fromName: 'VibeSpace browser' }] }), tEn, { billed: false });
  ok(one.head === '1 notice is waiting for this agent’s next turn' && one.parts.join() === 'a browser handback' && one.cost === 'joins the running turn' && /joins the turn already running; if that turn cannot take it, it runs as its own billed turn right after/.test(one.title), 'one notice in the singular; the free lane says its MECHANISM ("joins the running turn") and the title carries the caveat (verify r4: the wrapper may refuse the fold)');
  const all = ['channel-receipt', 'channel', 'job', 'handback', 'window-request', 'notice', 'peer'];
  ok(all.every((k) => S.partWords({ kind: k, n: 1, label: 'X' }, tEn).startsWith('a ') && /^3 /.test(S.partWords({ kind: k, n: 3, label: 'X' }, tEn))) && S.partWords({ kind: 'peer', n: 1, label: null }, tEn) === 'a message from another agent',
    'every kind has a singular and a plural; a nameless peer is "another agent"');
  ok(S.stashSummaryWords(null, tEn) === null, 'no fact ⇒ no words');
  // ①d THE DETAILS (the owner, 2026-09-28: "现在是完全看不了这个细节了嘛? 包括在聊天框里 queue 的时候也没法展开看细节"): the fact
  // carries one preview per waiting entry (oldest first, the first non-empty line, cut at 140, at most 12) and the
  // hand-over card opens with its own head so the notices sit behind an expander
  const pv = S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Bo', ts: 50, text: '\n  second line first?\nno — the first non-empty line\n' }, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', ts: 30, text: 'VibeSpace (this workspace, not another agent) reports:\nyour draft to Ops was approved' }], jobs: [{ jobName: 'nightly', ts: 40, text: 'x'.repeat(200) }] });
  ok(pv.previews.length === 3 && pv.previewsHeld === 0 && pv.previews.map((x) => x.at).join() === '30,40,50'
    && pv.previews[0].kind === 'channel-receipt' && pv.previews[0].head === 'your draft to Ops was approved'
    && pv.previews[1].kind === 'job' && pv.previews[1].label === 'nightly' && pv.previews[1].head.length === 140 && pv.previews[1].head.endsWith('…')
    && pv.previews[2].kind === 'peer' && pv.previews[2].label === 'Bo' && pv.previews[2].head === 'second line first?',
    'previews: oldest first, the first non-empty line (the ladder\'s own head skipped), cut at 140 with an ellipsis, a job named by its job, a peer by its name', pv.previews);
  ok(S.previewWords(pv.previews[0], tEn) === 'a channel receipt · your draft to Ops was approved' && S.previewWords(pv.previews[1], tEn).startsWith('Background Work · nightly · xxx') && S.previewWords(pv.previews[2], tEn) === 'a message from Bo · second line first?'
    && S.previewWords({ kind: 'notice', head: '' }, tEn) === 'a VibeSpace notice',
    'previewWords: the kind (or the job / the peer by name) · the head; no head ⇒ the kind alone');
  const many = S.summarize({ msg: Array.from({ length: 15 }, (_, i) => ({ source: 'agent', kind: 'peer', fromName: 'P' + i, ts: 100 + i, text: 'm' + i })) });
  ok(many.previews.length === 12 && many.previewsHeld === 3 && many.previews[0].head === 'm0' && many.previews[11].head === 'm11', 'at most 12 previews; the rest is COUNTED (previewsHeld), never silently dropped');
  ok(S.previewDigest(pv) !== S.previewDigest(S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Bo', ts: 50, text: 'other words' }] })) && S.previewDigest(null) === '' && S.summaryDigest(pv) === '3|channel-receipt::1,job::1,peer:Bo:1',
    'previewDigest moves with a head; summaryDigest keeps its shape (the card hint prints no preview)');
  ok(S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Bo' }] }).previews[0].head === '' , 'an entry without text previews as its kind alone (no throw)');
  const hf = S.handoverFacts(S.handoverCardText(2, 'from "Ada": hi\n\nfrom "Bo": there'));
  ok(hf && hf.title.key === '{n} waiting notice(s) handed over' && hf.title.params.n === 2 && hf.body === 'from "Ada": hi\n\nfrom "Bo": there' && hf.foldLabel.key === 'Show the {n} notice(s)' && hf.foldLabel.params.n === 2,
    'handoverFacts reads the card text handoverCardText wrote: the title = the head in the device\'s words, the body = the notices, the expander names how many', hf);
  ok(S.handoverFacts('2 waiting notices handed over') === null && S.handoverFacts('') === null && S.handoverFacts('from "Ada": 2 waiting notice(s) handed over') === null, 'any other text ⇒ null (the generic card rules apply)');
  const NS = require(path.join(REPO, 'src/notification-senders.js'));
  const view = NS.noticeCardView('VibeSpace notices', S.handoverCardText(3, 'a\n\nb\n\nc'), { facts: (b) => S.handoverFacts(b) });
  ok(view.folded === true && view.title.key === '{n} waiting notice(s) handed over' && view.body === 'a\n\nb\n\nc' && view.foldLabel.params.n === 3, 'noticeCardView with the hand-over facts: folded, the body is the notices, the expander label rides');
  const plain = NS.noticeCardView('VibeSpace notices', S.handoverCardText(3, 'a\n\nb\n\nc'), { facts: () => null });
  ok(plain.folded === false && plain.title.text === 'VibeSpace notices', 'CONTROL: without the facts the card is the old one — the sender as its title, nothing folded (the 2026-09-28 report)');
}

// ═══ ② THE ENGINE ═══
console.log('② the engine (real ladder + real jobs stash + the real hand-over)');
const CD = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
const SH = require(path.join(REPO, 'src/server/stash-handover.js'));
const { renderMsgStash } = require(path.join(REPO, 'src/agent-routes.js'));
const { renderNotifStash } = require(path.join(REPO, 'src/job-model.js'));
function rig({ refuse = null, handoverModule = SH, backend = 'claude', streaming = false, deferPost = false, deliverOverride = null } = {}) {
  const dir = scratch('stash-strip-' + Math.random().toString(36).slice(2, 7));
  fs.mkdirSync(dir, { recursive: true });
  const CID = 'c0ffee00-0000-4000-8000-00000000057a';
  const sessions = new Map([['w1', { name: 'Agent One', backend, backendSessionId: CID, claudeSessionId: CID, mode: 'chat', _isStreaming: streaming }]]);
  const posts = [], ledger = [], hooks = { deliver: 0, jobs: 0 }, published = [], pending = [];
  let view = null;
  const deliver = CD.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: () => ({ name: 'Agent One', socketPath: '/nowhere' }), postToPeer: async (p, text) => { if (deferPost) await new Promise((r) => pending.push(r)); posts.push(text); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
    authorizeSpend: (req) => (refuse ? { ok: false, why: refuse, detail: `${refuse} reached for this account`, retryAfter: 60000, identity: { key: 'acct', name: 'Work' }, limits: { perIdentityHour: 30 } } : { ok: true, identity: { key: 'acct', name: 'Work' }, hold: null, reason: req.reason }),
    noteSpend: (rec) => ledger.push(rec.reason), releaseSpend: () => {},
    onStashChange: () => { hooks.deliver++; view && view.changed(); }, emitPeerCard: () => {} });
  const jm = new JobManager({ dataDir: dir, log: () => {}, broadcast: () => {}, onStash: () => { hooks.jobs++; view && view.changed(); } });
  view = handoverModule.create({ activeSessions: sessions, getDeliver: () => (deliverOverride ? deliverOverride(deliver) : deliver), getJobs: () => jm, broadcastSessions: () => published.push(Date.now()), renderMsgStash, renderNotifStash, debounceMs: 20 });
  const s = sessions.get('w1');
  return { dir, CID, s, sessions, deliver, jm, view, posts, ledger, hooks, published, release: () => { const r = pending.shift(); r && r(); } };
}
const job = (id, name) => ({ id, name, state: 'done' });
{
  const R = rig();
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'Your reply to Ops room was edited and sent' });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'can you look at the deploy?' });
  R.jm._stashNotif(R.CID, job('j1', 'nightly'), { what: 'finished: 3 files' }, 'not reachable');
  await sleep(60);
  const f1 = R.view.summaryFor(R.s);
  ok(R.hooks.deliver === 2 && R.hooks.jobs === 1 && R.published.length === 1, `every stash write fires its store's hook; the re-publish is debounced to ONE (${R.published.length})`, R.hooks);
  ok(f1 && f1.count === 3 && f1.items.map((i) => i.kind).join() === 'channel-receipt,job,peer', 'the session\'s `stash` fact counts BOTH stores', f1);
  ok(S.stashSummaryWords(f1, tEn).line === '3 notices are waiting for this agent’s next turn: a channel receipt, a job result, a message from Ada', 'the strip\'s numbers follow the fact');
  // a notice that lands WHILE the hand-over is delivering must keep waiting
  const post0 = R.posts.length;
  const origPost = R.deliver.deliverToConversation;
  const h = R.view.handOver('w1');
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'arrived during the hand-over' });
  const r = await h;
  ok(r.ok && r.delivered === 3 && R.posts.length === post0 + 1, 'HAND OVER: ONE injection', r);
  const text = R.posts[R.posts.length - 1] || '';
  ok(/edited and sent/.test(text) && /can you look at the deploy/.test(text) && /finished: 3 files/.test(text) && /nightly/.test(text) && /^VibeSpace \(this workspace, not another agent\) reports:/.test(text),
    '…holding every stashed item from both stores, under the VibeSpace head (kind notification)', text.slice(0, 400));
  ok(R.ledger.length === 1 && R.ledger[0] === 'stash-handover', 'ONE ledger row, under `stash-handover`', R.ledger);
  const f2 = R.view.summaryFor(R.s);
  ok(f2 && f2.count === 1 && f2.items[0].label === 'Bo' && R.jm.peekNotifs(R.CID).length === 0 && r.remaining && r.remaining.count === 1, 'the stashes are emptied of what was DELIVERED; the notice that arrived meanwhile keeps waiting', f2);
  // the next user message: the injection route's drain empties the fact without the button
  R.deliver.drainStash(R.CID);
  ok(R.view.summaryFor(R.s) === null, 'the next user message\'s drain (drainStash at the injection) clears the fact — no button involved');
  const n0 = await R.view.handOver('w1');
  ok(!n0.ok && n0.code === 'nothing_waiting', 'nothing waiting ⇒ a named refusal, no ladder call', n0);
  void origPost;
}
{
  const R = rig({ refuse: 'hour-cap' });
  R.deliver.stashFor(R.CID, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'a message in Ops' });
  R.jm._stashNotif(R.CID, job('j2', 'build'), { what: 'failed' }, 'spend cap');
  const r = await R.view.handOver('w1');
  ok(!r.ok && r.code === 'spend_refused' && r.why === 'hour-cap' && /hour-cap/.test(r.error), 'a spend refusal is answered BY NAME', r);
  ok(R.posts.length === 0 && R.ledger.length === 0 && R.deliver.stashEntries(R.CID).length === 1 && R.jm.peekNotifs(R.CID).length === 1 && R.view.summaryFor(R.s).count === 2, '…nothing was posted or charged, and BOTH stashes are exactly as they were');
  ok((await R.view.handOver('nobody')).code === 'no_session', 'an unknown session ⇒ no_session');
}

// ═══ ②b VERIFY (channel-jump verify, 2026-09-27) ═══
console.log('②b verify: one hand-over in flight, the claim against the injection drain, the cost by lane, the spill, held');
{
  // ONE IN FLIGHT: a double click / two tabs / a click during a slow remote post
  const R = rig({ deferPost: true });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'msg-1' });
  R.jm._stashNotif(R.CID, job('j1', 'nightly'), { what: 'done-1' }, 'not reachable');
  const p1 = R.view.handOver('w1'); await sleep(5);
  const p2 = R.view.handOver('w1'); await sleep(5);
  ok(R.view.inFlight(R.CID) === true, 'a hand-over awaiting the ladder is IN FLIGHT for its conversation');
  R.release(); await sleep(5); R.release(); await sleep(5);
  const [r1, r2] = await Promise.all([p1, p2]);
  ok(r1.ok && r1.delivered === 2 && !r2.ok && r2.code === 'in_flight' && R.posts.length === 1 && R.ledger.length === 1 && R.posts.filter((t) => /msg-1/.test(t)).length === 1,
    'TWO concurrent hand-overs: ONE post, ONE ledger row, the second refused `in_flight` by name (was: two copies, two rows)', { r1, r2, posts: R.posts.length, ledger: R.ledger });
  ok(R.view.inFlight(R.CID) === false && (await R.view.handOver('w1')).code === 'nothing_waiting', 'settled ⇒ no longer in flight; a third click finds nothing waiting');
}
{
  // THE CLAIM: the user's own message drains at its injection while the hand-over awaits the post
  const R = rig({ deferPost: true });
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt-X' });
  R.jm._stashNotif(R.CID, job('j9', 'build'), { what: 'result-Y' }, 'not reachable');
  const p = R.view.handOver('w1'); await sleep(5);
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'after-the-claim' });   // arrives after the claim: the user's turn takes it
  const drainedMsg = R.deliver.drainStash(R.CID);          // the injection route's full drain
  const drainedJobs = R.jm.drainNotifs(R.CID);             // …and the jobs engine's
  ok(drainedMsg.length === 1 && drainedMsg[0].text === 'after-the-claim' && drainedJobs.length === 0 && R.deliver.stashEntries(R.CID).length === 1 && R.jm.peekNotifs(R.CID).length === 1,
    'the injection\'s full drain leaves every CLAIMED entry in place (both stores) and takes the one that arrived after the claim', { drainedMsg: drainedMsg.map((e) => e.text), drainedJobs: drainedJobs.length });
  R.release();
  const r = await p;
  const copies = R.posts.filter((t) => /receipt-X/.test(t)).length + (renderMsgStash(drainedMsg).text.includes('receipt-X') ? 1 : 0);
  ok(r.ok && r.delivered === 2 && copies === 1 && R.ledger.length === 1 && R.deliver.stashEntries(R.CID).length === 0 && R.jm.peekNotifs(R.CID).length === 0 && R.deliver.claimedCount(R.CID) === 0,
    'the receipt reaches the agent ONCE (was: the injection AND the hand-over each carried it), ONE row, the claim released', { r, copies, ledger: R.ledger });
}
{
  // a REFUSAL releases the claim: the next injection takes the entries
  const R = rig({ refuse: 'hour-cap' });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hi' });
  R.jm._stashNotif(R.CID, job('j2', 'build'), { what: 'failed' }, 'spend cap');
  const r = await R.view.handOver('w1');
  ok(!r.ok && r.code === 'spend_refused' && R.deliver.claimedCount(R.CID) === 0 && R.deliver.drainStash(R.CID).length === 1 && R.jm.drainNotifs(R.CID).length === 1, 'a refused hand-over releases its claim — the next injection drains both entries', r);
}
{
  // THE COST BY LANE: `billed` on the fact
  const C = rig({ backend: 'claude', streaming: true });
  C.deliver.stashFor(C.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hi' });
  const fc = C.view.summaryFor(C.s);
  const rc = await C.view.handOver('w1');
  ok(fc.billed === true && rc.ok && C.ledger.length === 1, 'a claude session MID-TURN: the fact says billed (its inbox queues the message as its own turn) — and the ladder does charge', { billed: fc.billed, ledger: C.ledger });
  const X = rig({ backend: 'codex', streaming: true });
  X.deliver.stashFor(X.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hi' });
  ok(X.view.summaryFor(X.s).billed === false && X.view.billedFor({ backend: 'codex', _isStreaming: false }) === true && X.view.billedFor({ backend: 'claude', _isStreaming: false }) === true,
    'a codex session mid-turn (the steer lane folds a notification into the running turn) is free; idle is billed on both');
}
{
  // THE SPILL: >2 job results
  const R = rig();
  for (let i = 0; i < 12; i++) R.jm._stashNotif(R.CID, job('j' + i, 'job-' + i), { what: 'result-' + i + ' ' + 'x'.repeat(300) }, 'not reachable');
  const r = await R.view.handOver('w1');
  const text = R.posts[0] || '';
  const spill = path.join(R.dir, 'job-notifications-read', R.CID.replace(/[^\w-]/g, '_') + '.md');
  ok(r.ok && r.delivered === 12 && /Full untruncated history: /.test(text) && fs.existsSync(spill) && /result-5/.test(fs.readFileSync(spill, 'utf8')), 'more than two job results: the untruncated history is spilled to the read file and the delivered text names it (the injection\'s rule)', { delivered: r.delivered, spill: fs.existsSync(spill) });
}
{
  // HELD: a wrapper that predates mid-turn steering is not "unreachable"
  const R = rig({ deliverOverride: (d) => ({ ...d, deliverToConversation: async () => ({ ok: false, lane: 'rpc-queue', refused: 'wrapper-no-steer', reason: 'this session\'s agent predates notification steering' }) }) });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hi' });
  const r = await R.view.handOver('w1');
  ok(!r.ok && r.code === 'held_for_next_turn' && /predates/.test(r.error) && R.deliver.stashEntries(R.CID).length === 1 && R.deliver.claimedCount(R.CID) === 0 && SH.STATUS.held_for_next_turn === 409 && SH.STATUS.in_flight === 409,
    'a `wrapper-no-steer` refusal answers `held_for_next_turn` (the notices ride the next prompt), the stash intact, the claim released; both new codes are 409', r);
}

// ═══ ③ THE ROUTE ═══
console.log('③ the route');
{
  const express = require('express');
  const R = rig();
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hello' });
  const app = express(); app.use(express.json()); R.view.register(app);
  const port = await freePort();
  const srv = await new Promise((res) => { const x = app.listen(port, '127.0.0.1', () => res(x)); });
  const post = async (p, h = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: '{}' }); return { status: r.status, body: await r.json().catch(() => null) }; };
  try {
    const a = await post('/api/sessions/w1/stash/hand-over', { Authorization: 'Bearer vsst_x' });
    const b = await post('/api/sessions/w1/stash/hand-over', { Authorization: 'Bearer jbt_x' });
    ok(a.status === 403 && a.body.code === 'agent_forbidden' && b.status === 403 && R.posts.length === 0, 'an agent\'s session / job bearer is 403 — the hand-over is the user\'s');
    const c = await post('/api/sessions/w1/stash/hand-over');
    const d = await post('/api/sessions/w1/stash/hand-over');
    const e = await post('/api/sessions/zz/stash/hand-over');
    ok(c.status === 200 && c.body.ok && c.body.delivered === 1 && d.status === 409 && d.body.code === 'nothing_waiting' && e.status === 404, 'the cookie POST hands over; a second is nothing_waiting 409; an unknown session 404', { c: c.body, d: d.status, e: e.status });
  } finally { srv.close(); }
}

// ═══ ④ THE STRIP (fake DOM) ═══
console.log('④ the strip and the card hint (the real module over a fake DOM)');
let created = 0;
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this._text = ''; this.className = ''; this.hidden = false; this.title = ''; this.type = ''; this.disabled = false; this.dataset = {}; this.style = { setProperty() {} }; this.attrs = {}; this.listeners = {}; created++; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...ns) { for (const n of ns) this.appendChild(n); }
  appendChild(n) { if (n.parentNode) n.parentNode.children.splice(n.parentNode.children.indexOf(n), 1); n.parentNode = this; this.children.push(n); return n; }
  after(n) { const p = this.parentNode; if (n.parentNode) n.parentNode.children.splice(n.parentNode.children.indexOf(n), 1); n.parentNode = p; p.children.splice(p.children.indexOf(this) + 1, 0, n); }
  remove() { if (this.parentNode) { this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; } }
  set innerHTML(h) { this._html = h; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this._text = String(v); this.children = []; this.sets = (this.sets || 0) + 1; }
  addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); }
  get classList() { const self = this; return { contains: (c) => self.className.split(/\s+/).includes(c) }; }
  _all() { return this.children.flatMap((c) => [c, ...c._all()]); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) { const cls = sel.replace(/^\./, ''); return this._all().filter((e) => e.classList.contains(cls)); }
}
// imported BEFORE the fake document exists: utils.js wires its page-level listeners only where a document is present
const SS = await import(pathToFileURL(path.join(REPO, 'src/lib/stash-strip.js')).href);
globalThis.document = { createElement: (t) => new El(t) };   // what the strip builds with, at run time
{
  const strip = SS.createStashStrip({ sessionId: 'w1' });
  const q = (c) => strip.el.querySelector('.' + c);
  ok(strip.el.hidden === true && strip.el.className === 'chat-stash-strip', 'no fact ⇒ the strip is hidden');
  const f3 = S.summarize({ msg: [{ source: 'channel-receipt', kind: 'notification' }, { source: 'agent', kind: 'peer', fromName: 'Ada' }], jobs: [{}] });
  strip.set(f3, { turn: 'idle' });
  const nodes = ['chat-stash-head', 'chat-stash-parts', 'chat-stash-go', 'chat-stash-cost'].map(q);
  ok(!strip.el.hidden && q('chat-stash-head').textContent === '3 notices are waiting for this agent’s next turn' && q('chat-stash-parts').textContent === ': a channel receipt, a job result, a message from Ada' && q('chat-stash-go-label').textContent === 'Hand over now' && q('chat-stash-cost').textContent === ' · starts a turn',
    'a fact ⇒ the strip shows the head, the parts, the button and its cost', strip.el.textContent);
  const c0 = created;
  strip.set(S.summarize({ msg: [{ source: 'channel-receipt', kind: 'notification' }], jobs: [{}] }), { turn: 'running' });
  ok(created === c0 && ['chat-stash-head', 'chat-stash-parts', 'chat-stash-go', 'chat-stash-cost'].map(q).every((n, i) => n === nodes[i]) && q('chat-stash-head').textContent === '2 notices are waiting for this agent’s next turn' && q('chat-stash-cost').textContent === ' · joins the running turn',
    'the numbers change IN PLACE (no node created, the same nodes); a running turn (no fact word) says "joins the running turn" — the money word is never blank (verify r4)');
  // verify: the COST is the fact's word — a running claude turn still "starts a turn"; the turn alone is the fallback
  strip.set({ ...S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Ada' }] }), billed: true }, { turn: 'running' });
  ok(q('chat-stash-cost').textContent === ' · starts a turn', 'the strip prints the cost from the FACT (`billed:true` on a running turn still says "starts a turn"); the turn alone only as a fallback');
  strip.set({ ...S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Ada' }] }), billed: false }, { turn: 'idle' });
  ok(q('chat-stash-cost').textContent === ' · joins the running turn', '…and "joins the running turn" when the fact says free (an idle codex turn never is, but the word is the server\'s)');
  strip.set(S.summarize({ msg: [{ source: 'channel-receipt', kind: 'notification' }], jobs: [{}] }), { turn: 'running' });
  const sets = q('chat-stash-head').sets;
  strip.set(S.summarize({ msg: [{ source: 'channel-receipt', kind: 'notification' }], jobs: [{}] }), { turn: 'running' });
  ok(q('chat-stash-head').sets === sets, 'the same fact twice writes nothing (the digest gate)');
  // the DETAILS toggle (2026-09-28): a house text button opens a list under the strip — one row per waiting entry
  const fd = S.summarize({ msg: [{ source: 'channel-receipt', kind: 'notification', ts: 1, text: 'VibeSpace (this workspace, not another agent) reports:\nyour draft was approved' }, { source: 'agent', kind: 'peer', fromName: 'Ada', ts: 2, text: 'ping <b>bold</b>' }], jobs: [{ jobName: 'nightly', ts: 3, text: 'done' }] });
  strip.set(fd, { turn: 'idle' });
  const more = q('chat-stash-more'), dl = q('chat-stash-list');
  ok(more && more.textContent === 'Details' && more.attrs['aria-expanded'] === 'false' && dl && dl.hidden === true && strip.state().detailsOpen === false, 'the strip offers "Details", the list is closed');
  const rows0 = dl.querySelectorAll('chat-stash-row');
  ok(rows0.length === 3 && rows0[0].textContent === 'a channel receipt · your draft was approved' && rows0[1].textContent === 'a message from Ada · ping <b>bold</b>' && rows0[2].textContent === 'Background Work · nightly · done' && rows0.every((r) => r._html === undefined),
    'one row per waiting entry, oldest first, each written as TEXT (a peer\'s markup stays words)', rows0.map((r) => r.textContent));
  more.listeners.click[0]({ stopPropagation() { } });
  ok(more.textContent === 'Hide details' && more.attrs['aria-expanded'] === 'true' && dl.hidden === false && strip.state().detailsOpen === true, 'a click opens the list and the button says "Hide details"');
  const c1 = created;
  strip.set({ ...fd, billed: false }, { turn: 'idle' });
  ok(created === c1 && dl.hidden === false && dl.querySelectorAll('chat-stash-row').length === 3, 'a fact change that keeps the previews leaves the open list as it is (no node created, still open)');
  strip.set(S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Ada', ts: 2, text: 'ping' }], jobs: [] }), { turn: 'idle' });
  ok(dl.querySelectorAll('chat-stash-row').length === 1 && dl.querySelector('chat-stash-row').textContent === 'a message from Ada · ping' && dl.hidden === false, 'the list follows the fact (one entry left) and stays open');
  strip.set(S.summarize({ msg: Array.from({ length: 14 }, (_, i) => ({ source: 'agent', kind: 'peer', fromName: 'P', ts: i, text: 'm' + i })) }), { turn: 'idle' });
  const rowsM = dl.querySelectorAll('chat-stash-row');
  ok(rowsM.length === 13 && rowsM[12].textContent === '2 more are waiting, not previewed' && rowsM[12].classList.contains('chat-stash-row-more'), '14 waiting ⇒ 12 rows + a last row naming the 2 not previewed');
  more.listeners.click[0]({ stopPropagation() { } });
  ok(dl.hidden === true && more.textContent === 'Details', 'a second click closes the list');
  strip.set(null);
  ok(strip.el.hidden === true, 'the fact clears ⇒ the strip is hidden');
  ok(/^Not handed over — the limit for turns nobody typed/.test(SS.handOverRefusalText({ code: 'spend_refused' })) && /could not be reached/.test(SS.handOverRefusalText({ code: 'unreachable' })) && SS.handOverRefusalText({ error: 'boom' }) === 'Hand-over failed: boom'
    && /already in progress/.test(SS.handOverRefusalText({ code: 'in_flight' })) && /predates mid-turn notifications/.test(SS.handOverRefusalText({ code: 'held_for_next_turn' })),
    'a refusal is SAID in the device\'s words, by its code (incl. in_flight and held_for_next_turn)');
  // the card hint
  const list = new El('div');
  const card = new El('div'); card.className = 'session-item-card'; card._webuiId = 'w1';
  const state = new El('span'); state.className = 'sess-state-chip'; card.appendChild(state); list.appendChild(card);
  SS.patchStashHints(list, [{ id: 'w1', stash: f3 }]);
  const hint = card.querySelector('.sess-stash-chip');
  ok(hint && hint.querySelector('.chip-text').textContent === '3 waiting' && /a channel receipt/.test(hint.dataset.tip) && card.children[1] === hint, 'the card gains "3 waiting" after its state chip (the tooltip names them)');
  SS.patchStashHints(list, [{ id: 'w1', stash: S.summarize({ jobs: [{}] }) }]);
  ok(card.querySelector('.sess-stash-chip') === hint && hint.querySelector('.chip-text').textContent === '1 waiting', 'a change patches the SAME chip');
  SS.patchStashHints(list, [{ id: 'w1', stash: null }]);
  ok(!card.querySelector('.sess-stash-chip'), 'nothing waiting ⇒ the hint is removed');
}

// ═══ ②c VERIFY r2 — exactly once across every path pair (channel-jump verify r2, 2026-09-27) ═══
console.log('②c verify r2: exactly-once across every path pair (a parked ladder post), the codex frame restore, the billed table, the overflow words');
const CE = require(path.join(REPO, 'src/server/stdout/codex-events.js'));
const CID2 = 'c0ffee00-0000-4000-8000-00000000057a';
/** The r2 rig: a parked post that can land or fail (`release` / `releaseWith`), a claude inbox only where asked, a
 *  codex wrapper by its sidecar, a remote owner host, the REAL codex-events consumer over a fake pty (`feedCodex`),
 *  and `boot` = a second server over the same data dir (the JobManager's own init). */
function rig2({ dir = null, deferPost = false, backend = 'claude', streaming = false, host = null, sidecar = undefined, inbox = true, remote = null, handoverModule = SH, deliverModule = CD, jobsModule = null, boot = false, name = 'Agent One', cid = CID2, dataDir = false } = {}) {
  dir = dir || scratch('stash-strip-r2-' + Math.random().toString(36).slice(2, 7));
  fs.mkdirSync(path.join(dir, 'session-buffers'), { recursive: true });
  const frames = [], posts = [], ledger = [], pending = [], published = [], releases = [];
  const s = { name, backend, backendSessionId: cid, claudeSessionId: cid, mode: 'chat', _isStreaming: streaming, buffer: '', sockName: 'cw-w1', socketPath: path.join(dir, 'cw-w1') };
  if (host) s.host = host;
  if (backend === 'codex' || backend === 'opencode') s.pty = { write: (f) => frames.push(JSON.parse(f)) };
  if (sidecar !== undefined) fs.writeFileSync(path.join(dir, 'session-buffers', 'w1.json'), JSON.stringify({ caps: sidecar, startedAt: Date.now(), pid: 1 }));
  const sessions = new Map([['w1', s]]);
  let view = null;
  const deliver = deliverModule.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (c) => (inbox && c === cid ? { name, socketPath: '/nowhere' } : null), postToPeer: async (p, text) => { let res = { ok: true }; if (deferPost) res = await new Promise((r) => pending.push(r)); if (res.ok) posts.push(text); return res; }, postChannelEvent: async () => ({ ok: false }) },
    getHosts: () => ({ get: (id) => (id === 'h1' ? { id } : null), deviceBounded: async () => ({ peerPost: async () => (remote || { ok: false, reason: 'no live inbox for this conversation on this machine' }) }) }),
    getConvIndex: () => ({ ownerHost: () => (host ? 'h1' : null) }),
    authorizeSpend: (req) => ({ ok: true, identity: { key: 'acct', name: 'Work' }, hold: { k: 1 }, reason: req.reason }),
    noteSpend: (rec) => ledger.push(rec.reason), releaseSpend: (rec) => releases.push(rec.reason),
    onStashChange: () => { view && view.changed(); }, emitPeerCard: () => {}, log: () => {} });
  const JM = jobsModule ? jobsModule.JobManager : JobManager;
  const jm = new JM({ dataDir: dir, log: () => {}, broadcast: () => {}, onStash: () => { view && view.changed(); } });
  if (boot) jm.init();
  view = handoverModule.create({ activeSessions: sessions, getDeliver: () => deliver, getJobs: () => jm, broadcastSessions: () => published.push(Date.now()), renderMsgStash, renderNotifStash, debounceMs: 10, log: { log() {}, warn() {} }, ...(dataDir ? { dataDir: dir } : {}) });   // r4: `dataDir` = the delivered memory on disk, as server.js wires it
  deliver.registerFrameRestorer((c, t, m) => view.restoreHandedOver(c, t, m));
  // the REAL codex-events consumer over a fake pty: `feedCodex(record)` = one stdout line from the wrapper
  const fakePty = { _fn: null, onData(fn) { this._fn = fn; }, onExit() {}, write() {} };
  CE.create({ engine: { noteTurnEnd() {}, recordCodexQuotaSignal() {} }, deliverRef: deliver, permissionRulesRef: {} })
    .attach(s, 'w1', fakePty, { feedLive() {}, broadcastToSession() {}, broadcastActiveSessions() {}, readSessionMeta: () => ({}), writeSessionMeta() {}, updateSessionTodos() {} });
  const feedCodex = (rec) => fakePty._fn(JSON.stringify(rec) + '\n');
  return { dir, CID: cid, s, sessions, deliver, jm, view, posts, frames, ledger, releases, published, feedCodex,
    release: () => { const r = pending.shift(); r && r({ ok: true }); }, releaseWith: (res) => { const r = pending.shift(); r && r(res); },
    diskMsg: () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'msg-stash.json'), 'utf8'))[cid] || []; } catch { return []; } },
    diskJobs: () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'job-notifications.json'), 'utf8'))[cid] || []; } catch { return []; } } };
}
{
  // ── hand-over ‖ a SIGTERM restart: the shutdown WAITS, the drain is on disk, a second server finds nothing ──
  const R = rig2({ deferPost: true });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'msg-A' }); R.deliver.flush();
  R.jm._stashNotif(R.CID, job('j1', 'nightly'), { what: 'done-A' }, 'not reachable'); R.jm._save();
  const p = R.view.handOver('w1'); await sleep(5);
  ok(R.diskMsg().length === 1 && /^ho-/.test(R.diskMsg()[0].ho) && R.diskJobs().length === 1 && R.diskJobs()[0].ho === R.diskMsg()[0].ho, 'before the post leaves, BOTH stores on disk carry the entries stamped with the hand-over\'s id (was: an in-memory claim)', { msg: R.diskMsg(), jobs: R.diskJobs() });
  const st = R.view.settle(3000);                 // what SIGTERM's shutdown does now: wait for the flight
  let settled = false; st.then(() => { settled = true; });
  await sleep(20);
  ok(settled === false, 'the shutdown\'s settle() is still waiting while the post is on its way');
  R.release();
  const n = await st; const r = await p;
  ok(n === 1 && r.ok && r.delivered === 2 && /\(hand-over ho-[a-z0-9]+-[a-z0-9]+\)/.test(R.posts[0]) && R.diskMsg().length === 0 && R.diskJobs().length === 0,
    'the post lands ⇒ settle() resolves, the drain of BOTH stores is on disk at once, the frame carries the hand-over id', { n, r, disk: [R.diskMsg().length, R.diskJobs().length] });
  R.deliver.flush(); R.jm.shutdown();
  const N = rig2({ dir: R.dir, boot: true });     // the next server over the same data dir
  ok(N.deliver.drainStash(N.CID).length === 0 && N.jm.drainNotifs(N.CID).length === 0 && N.deliver.releasedAtBoot.length === 0 && (N.jm.releasedAtBoot || []).length === 0,
    'a SIGTERM restart mid-hand-over is EXACTLY ONCE: the next boot\'s injection finds nothing (was: the frame the CLI took, delivered again)');
}
{
  // ── hand-over ‖ a SIGKILL mid-round-trip: the stamp is on disk; the next boot RELEASES by name, never drops ──
  const R = rig2({ deferPost: true });
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt-K' }); R.deliver.flush();
  R.jm._stashNotif(R.CID, job('j2', 'build'), { what: 'done-K' }, 'not reachable'); R.jm._save();
  const p = R.view.handOver('w1'); await sleep(5);
  const id = R.diskMsg()[0].ho;
  // the process is gone (no release, no flush): a new server boots over the same files
  const N = rig2({ dir: R.dir, boot: true });
  const rel = N.deliver.releasedAtBoot, relJ = N.jm.releasedAtBoot || [];
  ok(rel.length === 1 && rel[0].cid === R.CID && rel[0].ids[0] === id && relJ.length === 1 && relJ[0].ids[0] === id, 'the next boot names the unsettled hand-over BY ID in both stores', { rel, relJ });
  ok(N.deliver.stashEntries(N.CID).length === 1 && !N.deliver.stashEntries(N.CID)[0].ho && N.jm.peekNotifs(N.CID).length === 1 && !N.jm.peekNotifs(N.CID)[0].ho && N.diskMsg().length === 1 && !N.diskMsg()[0].ho,
    '…and RELEASES them (stamp stripped, on disk too): they wait again — a repeat is visible and traceable, a loss would be silent');
  ok(N.view.summaryFor(N.s).count === 2 && N.view.summaryFor(N.s).inFlight === false, 'the strip after the boot: 2 waiting, nothing in flight');
  void p;
}
{
  // ── the drain after a delivered hand-over persists AT ONCE (was: 500 ms for the ladder's store, 2 s for the jobs store) ──
  const R = rig2();
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'now' }); R.deliver.flush();
  R.jm._stashNotif(R.CID, job('j3', 'x'), { what: 'now-j' }, 'not reachable'); R.jm._save();
  const r = await R.view.handOver('w1');
  ok(r.ok && r.delivered === 2 && R.diskMsg().length === 0 && R.diskJobs().length === 0, 'right after the hand-over resolves, neither store on disk holds the delivered entries (a SIGKILL here re-delivers nothing)');
  // the injection route's full drain persists at once too (the same class: a drained injection + a kill = a duplicate)
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'inj' }); R.deliver.flush();
  R.deliver.drainStash(R.CID);
  ok(R.diskMsg().length === 0, 'the injection\'s full drain is on disk at once as well');
}
{
  // ── hand-over ‖ a NEW write into a FULL store: a CLAIMED entry is never evicted (verify r4 — was: the cap evicted the
  //    oldest, claimed or not; 30 arrivals mid-flight evicted every claimed entry and the press answered "delivered: 0") ──
  const R = rig2({ deferPost: true });
  for (let i = 0; i < 30; i++) R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'full-' + i });
  const p = R.view.handOver('w1'); await sleep(5);
  ok(R.view.summaryFor(R.s).count === 30 && R.deliver.claimedCount(R.CID) === 30, 'a full store (30 = the cap), every entry claimed');
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Cy', text: 'newest' });   // the store may exceed the cap by the claimed count
  ok(R.deliver.stashEntries(R.CID).length === 31 && R.deliver.claimedCount(R.CID) === 30 && R.deliver.stashEntries(R.CID)[30].text === 'newest', 'a write while the store is full keeps every CLAIMED entry (the store exceeds the cap by the claimed count) and the new one unclaimed');
  for (let i = 0; i < 30; i++) R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Cy', text: 'new-' + i });   // a whole cap's worth arrives mid-flight
  ok(R.deliver.stashEntries(R.CID).length === 60 && R.deliver.claimedCount(R.CID) === 30 && !R.deliver.stashEntries(R.CID).some((e) => e.text === 'newest'), 'the cap counts the UNCLAIMED entries: 30 claimed + 30 unclaimed wait (the first newcomer fell off as the oldest unclaimed), no claimed entry evicted');
  R.release(); const r = await p;
  const left = R.deliver.stashEntries(R.CID);
  ok(r.ok && r.delivered === 30 && /full-0[\s\S]*full-29/.test(R.posts[0]) && left.length === 30 && left[0].text === 'new-0' && !left.some((e) => e.ho) && R.view._delivered.get(r.id).msg.length === 30 && R.deliver.drainStash(R.CID).length === 30,
    'every claimed entry was in the frame AND is counted delivered (30 — was 0 for the same shape), the record keeps all 30 originals; the 30 newcomers survive unclaimed and the next drain takes them', { delivered: r.delivered, left: left.length });
}
{
  // ── hand-over ‖ a job finalize's stash (the engine's `_deliverTo` fallback lands mid-flight) ──
  const R = rig2({ deferPost: true });
  R.jm._stashNotif(R.CID, job('j4', 'nightly'), { what: 'first' }, 'not reachable');
  const p = R.view.handOver('w1'); await sleep(5);
  R.jm._stashNotif(R.CID, job('j5', 'hourly'), { what: 'landed mid-flight' }, 'not reachable');   // a finalize whose delivery fell to the stash
  R.release(); const r = await p;
  const left = R.jm.peekNotifs(R.CID);
  ok(r.ok && r.delivered === 1 && /first/.test(R.posts[0]) && !/landed mid-flight/.test(R.posts[0]) && left.length === 1 && left[0].text === 'landed mid-flight' && !left[0].ho && R.jm.drainNotifs(R.CID).length === 1,
    'a job result stashed while the hand-over is in flight stays unclaimed, is not in the frame, and the next drain takes it');
}
{
  // ── hand-over ‖ a second client: the 409 names the in-flight one; the fact says `inFlight`; the strip waits ──
  const R = rig2({ deferPost: true });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'two-clients' });
  const p1 = R.view.handOver('w1'); await sleep(25);   // past the rig's 10 ms re-publish debounce
  const f = R.view.summaryFor(R.s);
  const p2 = await R.view.handOver('w1');
  ok(!p2.ok && p2.code === 'in_flight' && /^ho-/.test(p2.id) && p2.since > 0 && /already in progress \(ho-/.test(p2.error) && f.inFlight === true && R.published.length >= 1,
    'the second client\'s click is refused naming the in-flight hand-over (id + since); the fact it received says inFlight (a re-publish at the start)', { p2, inFlight: f.inFlight });
  const strip = SS.createStashStrip({ sessionId: 'w1' }); strip.set(f, { turn: 'idle' });
  const go = strip.el.querySelector('.chat-stash-go');
  ok(go.disabled === true && strip.el.querySelector('.chat-stash-go-label').textContent === 'Handing over…' && go.title === 'A hand-over is on its way', 'the second client\'s strip: the button waits ("Handing over…", disabled) — no live button that answers 409');
  R.release(); const r1 = await p1; await sleep(30);
  ok(r1.ok && r1.id === p2.id && R.view.summaryFor(R.s) === null && R.view.inFlight(R.CID) === false, 'after: the same id delivered once, the fact clears for every client, nothing in flight');
  strip.set(R.view.summaryFor(R.s)); ok(strip.el.hidden === true, '…and the second client\'s strip hides on that fact');
}
{
  // ── hand-over ‖ a session kill: the claim dies with the outcome, both ways ──
  const R = rig2({ deferPost: true });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'kill-ok' });
  R.jm._stashNotif(R.CID, job('j6', 'n'), { what: 'kill-job' }, 'not reachable');
  const p = R.view.handOver('w1'); await sleep(5);
  R.sessions.delete('w1');                          // the kill path: activeSessions.delete
  R.release(); const r = await p;
  ok(r.ok && r.delivered === 2 && R.deliver.claimedCount(R.CID) === 0 && R.view.inFlight(R.CID) === false && R.deliver.stashEntries(R.CID).length === 0 && R.jm.peekNotifs(R.CID).length === 0,
    'killed while the post was on its way and the post LANDED: drained, the claim released, nothing in flight (the ladder is bounded — postToPeer 5 s, the daemon op 15 s — so the finally always runs)');
  const Q = rig2({ deferPost: true });
  Q.deliver.stashFor(Q.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'kill-fail' });
  const q = Q.view.handOver('w1'); await sleep(5);
  Q.sessions.delete('w1');
  Q.releaseWith({ ok: false, reason: 'socket closed' }); const rq = await q;
  ok(!rq.ok && rq.code === 'unreachable' && Q.deliver.claimedCount(Q.CID) === 0 && !Q.deliver.stashEntries(Q.CID)[0].ho && Q.diskMsg().length === 1 && !Q.diskMsg()[0].ho && Q.releases.length === 1 && Q.deliver.drainStash(Q.CID).length === 1,
    'killed and the post FAILED: the claim is released (memory + disk), the hold given back, the entry waits for the conversation\'s next resume', rq);
  const pm = read('src/peer-messaging.js'), ac = read('src/agentd/client.js');
  ok(/function postToPeer\(peer, text, \{ timeoutMs = POST_TIMEOUT_MS \}/.test(pm) && /const POST_TIMEOUT_MS = 5000;/.test(pm) && /const POST_BOUND_MS = POST_TIMEOUT_MS \+ WRITE_GRACE_MS \+ FLUSH_GRACE_MS;/.test(pm) && /op: 'peer-post', cid, text, timeoutMs: 15000/.test(ac) && /deviceBounded \? hosts\.deviceBounded\(hid, 6000\)/.test(read('src/server/conversation-deliver.js')),
    'PIN: every rung the hand-over can await is bounded (a claim can never be stranded by a post that never answers)');
}
{
  // ── the codex `ok:false` frame through the REAL codex-events consumer: the ORIGINAL entries come back ──
  const R = rig2({ backend: 'codex', inbox: false, sidecar: { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] } });
  for (let i = 0; i < 3; i++) R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt-' + i, ts: 1000 + i });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hi', ts: 1003 });
  R.jm._stashNotif(R.CID, job('j7', 'nightly'), { what: 'done-7' }, 'not reachable');
  const before = R.view.summaryFor(R.s);
  const r = await R.view.handOver('w1');
  ok(r.ok && r.lane === 'rpc-queue' && r.delivered === 5 && R.frames.length === 1 && R.frames[0].kind === 'notification' && R.view.summaryFor(R.s) === null && R.ledger.length === 1,
    'a codex session (idle): the frame went down the rpc lane, one row, both stores emptied', r);
  // the wrapper answers ok:false (a turn/start error, a Stop that dropped it, a queue removal) echoing the frame's text
  R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'turn/start failed', text: R.frames[0].text, fromName: R.frames[0].fromName, kind: 'notification' } });
  const after = R.view.summaryFor(R.s);
  ok(after && after.count === 5 && S.summaryDigest(after) === S.summaryDigest(before) && R.jm.peekNotifs(R.CID).length === 1 && R.jm.peekNotifs(R.CID)[0].text === 'done-7' && R.deliver.stashEntries(R.CID).map((e) => e.text).join() === 'receipt-0,receipt-1,receipt-2,hi',
    'the REAL consumer restores the ORIGINAL five: three receipts + a message from Ada in the ladder\'s store (their own order), the job result in ITS store — the strip says the same five it said before (was: "1 VibeSpace notice")', { after, before });
  ok(R.deliver.stashEntries(R.CID).every((e) => !e.ho) && R.diskMsg().length === 4 && R.diskJobs().length === 1, 'restored entries carry no claim, on disk in both stores');
  // the same frame a second time (a Stop AND a queue removal both echo it) restores nothing twice; a foreign frame is stashed as itself
  R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'dropped by Stop', text: R.frames[0].text, fromName: R.frames[0].fromName, kind: 'notification' } });
  ok(R.view.summaryFor(R.s).count === 5 && R.deliver.restoreFrame(R.CID, R.frames[0].text) === 5, 'the same frame echoed twice restores once — the second echo is handled, never a blob of the copy (the memory is spent, the record marked)');
  R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'x', text: 'a peer message that was never a hand-over', fromName: 'Bo', kind: 'peer' } });
  const f6 = R.view.summaryFor(R.s);
  ok(f6.count === 6 && f6.items.some((i) => i.kind === 'peer' && i.label === 'Bo'), 'a frame that names no hand-over is re-stashed as itself (the consumer\'s rule before r2, unchanged)');
  ok(R.deliver.restoreFrame(R.CID, 'nothing here') === 0 && R.deliver.restoreFrame('other-cid', R.frames[0].text) === 0, 'restoreFrame: no tag ⇒ 0; a tag for another conversation ⇒ 0 (never restored across conversations)');
}
{
  // ── `billed` × harness × turn × wrapper — the strip's word against what the ladder DOES ──
  const steerCaps = { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] };
  const rows = [
    { name: 'claude idle, local inbox', o: { backend: 'claude' }, billed: true, reachable: true, code: 'ok', lane: 'message', ledger: 1 },
    { name: 'claude MID-TURN (the inbox queues it as its own turn)', o: { backend: 'claude', streaming: true }, billed: true, reachable: true, code: 'ok', lane: 'message', ledger: 1 },
    { name: 'codex idle, a steering wrapper', o: { backend: 'codex', sidecar: steerCaps, inbox: false }, billed: true, reachable: true, code: 'ok', lane: 'rpc-queue', ledger: 1, steered: false },
    { name: 'codex MID-TURN, a steering wrapper (folded into the running turn — settled by the wrapper later)', o: { backend: 'codex', streaming: true, sidecar: steerCaps, inbox: false }, billed: false, reachable: true, code: 'ok', lane: 'rpc-queue', ledger: 0, steered: true },
    { name: 'codex MID-TURN, a wrapper that predates steering (LOW: the word says free, the click is held)', o: { backend: 'codex', streaming: true, sidecar: { peerMessage: true, inputQueue: true }, inbox: false }, billed: false, reachable: true, code: 'held_for_next_turn', ledger: 0 },
    { name: 'codex idle, a wrapper that predates steering (queued as its own turn)', o: { backend: 'codex', sidecar: { peerMessage: true, inputQueue: true }, inbox: false }, billed: true, reachable: true, code: 'ok', lane: 'rpc-queue', ledger: 1 },
    { name: 'opencode (stash-only lane): NO button — the notices ride the next message', o: { backend: 'opencode', inbox: false }, billed: true, reachable: false, code: 'unreachable', ledger: 0 },
    { name: 'a remote claude session (ssh host): the owner machine\'s daemon posts', o: { backend: 'claude', host: 'h1', inbox: false, remote: { ok: true, peerName: 'R' } }, billed: true, reachable: true, code: 'ok', lane: 'remote-message', ledger: 1 },
    { name: 'a remote codex session (LOW: the daemon\'s registry is claude\'s — unreachable, no row)', o: { backend: 'codex', host: 'h1', inbox: false }, billed: true, reachable: true, code: 'unreachable', ledger: 0 },
    { name: 'a claude session whose inbox post FAILS (the CLI died, a stale registry): no row, the hold given back', o: { backend: 'claude', deferPost: true, fail: true }, billed: true, reachable: true, code: 'unreachable', ledger: 0, released: 1 },
  ];
  for (const row of rows) {
    const R = rig2(row.o);
    R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'row' });
    const f = R.view.summaryFor(R.s);
    const p = R.view.handOver('w1');
    if (row.o.deferPost) { await sleep(5); R.releaseWith(row.o.fail ? { ok: false, reason: 'ECONNREFUSED' } : { ok: true }); }
    const r = await p;
    const got = { billed: f.billed, reachable: f.reachable, code: r.ok ? 'ok' : r.code, lane: r.lane || undefined, ledger: R.ledger.length, steered: R.frames[0] ? undefined : undefined, released: R.releases.length };
    const exp = { billed: row.billed, reachable: row.reachable, code: row.code, lane: row.lane, ledger: row.ledger, released: row.released };
    const pass = got.billed === exp.billed && got.reachable === exp.reachable && got.code === exp.code && (exp.lane === undefined || got.lane === exp.lane) && got.ledger === exp.ledger && (exp.released === undefined || got.released === exp.released) && (row.steered === undefined || r.steered === row.steered);
    ok(pass, `TABLE ${row.name}: billed=${exp.billed} reachable=${exp.reachable} → ${exp.code}${exp.lane ? '/' + exp.lane : ''}, ledger rows ${exp.ledger}`, { got, r });
  }
  const Sh = rig2({ backend: 'shell', cid: null, inbox: false });
  ok(Sh.view.summaryFor(Sh.s) === null && (await Sh.view.handOver('w1')).code === 'no_conversation', 'TABLE a shell terminal: no conversation ⇒ no fact (no strip), a hand-over is no_conversation');
  const D = rig2(); D.sessions.delete('w1');
  ok((await D.view.handOver('w1')).code === 'no_session', 'TABLE a dead session: no_session (and no row in the payload ⇒ no strip)');
  // a no-button strip for the stash-only harness
  const O = rig2({ backend: 'opencode', inbox: false });
  O.deliver.stashFor(O.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'o' });
  const strip = SS.createStashStrip({ sessionId: 'w1' }); strip.set(O.view.summaryFor(O.s), { turn: 'idle' });
  ok(strip.el.querySelector('.chat-stash-go').hidden === true && strip.el.querySelector('.chat-stash-nobutton').hidden === false && strip.el.querySelector('.chat-stash-nobutton').textContent === 'they ride the next turn' && strip.el.querySelector('.chat-stash-cost').textContent === '',
    'the strip for a harness with no live lane: no button, the sentence "they ride the next turn" (a button that always refuses is a greyed hint)');
}
{
  // ── the overflow words: what one hand-over would leave is NAMED on the fact, the result and the toast ──
  const R = rig2();
  for (let i = 0; i < 9; i++) R.deliver.stashFor(R.CID, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'm' + i + ' ' + 'x'.repeat(1900) });
  const f = R.view.summaryFor(R.s);
  const w = S.stashSummaryWords(f, tEn, { billed: f.billed, held: f.held, inFlight: f.inFlight, reachable: f.reachable });
  ok(f.count === 9 && f.held === 3 && w.cost === 'starts a turn' && w.held === '3 more are held for the next hand-over', 'nine 2 KB channel messages: the fact counts 9 and says 3 would be held (the 12 KiB budget); the words name them beside the money word', { f, w });
  const strip = SS.createStashStrip({ sessionId: 'w1' }); strip.set(f, { turn: 'idle' });
  ok(strip.el.querySelector('.chat-stash-cost').textContent === ' · starts a turn' && strip.el.querySelector('.chat-stash-held').textContent === '3 more are held for the next hand-over' && strip.el.querySelector('.chat-stash-held').hidden === false, 'the strip prints it: the money word on the button, the held count beside it (r4: its own node, so the phone can fold it without folding the money word)');
  const r = await R.view.handOver('w1');
  ok(r.ok && r.delivered === 6 && r.held === 3 && S.handedOverWords(r, tEn) === 'Handed over 6 waiting notice(s); 3 more are still held — hand over again or send a message', 'the result and the toast name the rest (never "Handed over 6" alone)', r);
  const f2 = R.view.summaryFor(R.s);
  ok(f2.count === 3 && f2.held === 0 && (await R.view.handOver('w1')).delivered === 3 && R.view.summaryFor(R.s) === null, 'after: 3 waiting, none held; a second hand-over carries them');
  ok(S.stashSummaryWords(S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'A' }] }), tEn, { held: 1 }).held === '1 more is held for the next hand-over' && S.handedOverWords({ delivered: 2, held: 0 }, tEn) === 'Handed over 2 waiting notice(s)', 'the singular; no rest ⇒ the plain toast');
}

// ═══ ②d VERIFY r3 — a frame is ours only when it IS the frame; the door shuts before the wait ═══
console.log('②d verify r3: a peer\'s quoted tag restores nothing, the hand-over\'s own frame does, an originals-less record keeps the frame, the shutdown\'s door');
/** `echoKind` = what the wrapper says the peer frame's PATH was: 'peer' (a wrapper that echoes `kind`, the r4 belt) or
 *  null (an older wrapper — r3's text equality is the only guard); `whole` = the peer's message IS the hand-over's
 *  exact frame text (an agent quoted the whole frame, verbatim — r4). */
async function peerTagLeg(R, label, { echoKind = 'peer', whole = false } = {}) {
  // a delivered hand-over the hub remembers, landed as its own turn
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt-1' });
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt-2' });
  R.jm._stashNotif(R.CID, job('j1', 'nightly'), { what: 'done-1' }, 'not reachable');
  const r = await R.view.handOver('w1');
  R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: true, mode: 'turn' } });
  // a PEER's message (another agent's words) that quotes the tag it saw — or the whole frame — down the same rpc lane…
  const words = whole ? R.frames[0].text : `Bo says: about that (hand-over ${r.id}) — the receipts are handled`;
  const d = await R.deliver.deliverToConversation(R.CID, words, { kind: 'peer', spendReason: 'peer-message', fromName: 'Bo' });
  // …handed back by the wrapper (a Stop dropped it before it ran), the text verbatim
  R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'dropped by Stop before it was delivered', text: R.frames[1].text, fromName: 'Bo', kind: echoKind } });
  const texts = R.deliver.stashEntries(R.CID).map((e) => e.text);
  return { ok: r.ok && r.delivered === 3 && d.ok && R.frames.length === 2, bo: texts.some((t) => (whole ? t === words : /Bo says/.test(t))), resurrected: texts.filter((t) => /receipt-/.test(t) && t !== words).length + R.jm.peekNotifs(R.CID).length, label };
}
{
  const steerCaps = { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] };
  const L = await peerTagLeg(rig2({ backend: 'codex', inbox: false, sidecar: steerCaps }));
  ok(L.ok && L.bo === true && L.resurrected === 0, 'a PEER frame quoting a remembered hand-over\'s tag, handed back: Bo\'s message is stashed as ITSELF and nothing already delivered comes back (was: 3 resurrected, Bo lost)', L);
  const L0 = await peerTagLeg(rig2({ backend: 'codex', inbox: false, sidecar: steerCaps }), null, { echoKind: null });
  ok(L0.ok && L0.bo === true && L0.resurrected === 0, '…and on an older wrapper that echoes no kind, the text equality alone holds (r3\'s layer, judged with r4\'s stripped)', L0);
  const LW = await peerTagLeg(rig2({ backend: 'codex', inbox: false, sidecar: steerCaps }), null, { whole: true });
  ok(LW.ok && LW.bo === true && LW.resurrected === 0, 'r4: a PEER frame that IS the hand-over\'s exact text (an agent quoted the whole frame to a peer), handed back: the wrapper says it went as a peer ⇒ stashed as itself, nothing resurrected', LW);
  // the hand-over's own frame still restores (r2's rule kept), and the record remembers the exact text the ladder wrote
  const R = rig2({ backend: 'codex', inbox: false, sidecar: steerCaps });
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt-own' });
  R.jm._stashNotif(R.CID, job('j2', 'build'), { what: 'done-own' }, 'not reachable');
  const r = await R.view.handOver('w1');
  ok(R.view._delivered.get(r.id).text === R.frames[0].text, 'the delivered record keeps the exact frame text the ladder wrote (headed as a notification)');
  // the tag with the body altered is NOT ours (stashed as itself by the caller); the whole text with whitespace at its ends is
  ok(R.deliver.restoreFrame(R.CID, R.frames[0].text + ' and more') === 0 && R.deliver.restoreFrame(R.CID, R.frames[0].text.replace('receipt-own', 'receipt-else')) === 0 && R.view.summaryFor(R.s) === null, 'equality is whole-text: a frame with the same tag and a changed body restores nothing');
  R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'turn/start failed', text: '  ' + R.frames[0].text + '\n', fromName: R.frames[0].fromName, kind: 'notification' } });
  ok(R.view.summaryFor(R.s).count === 2 && R.deliver.stashEntries(R.CID)[0].text === 'receipt-own' && R.jm.peekNotifs(R.CID)[0].text === 'done-own', 'its OWN frame back (whitespace at the ends tolerated) ⇒ the originals are restored to their stores (r2\'s rule holds)');
  // an originals-less record: the first echo keeps the frame as ONE notice, a second echo adds nothing
  const Q = rig2({ backend: 'codex', inbox: false, sidecar: steerCaps });
  Q.deliver.stashFor(Q.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'only' });
  const rq = await Q.view.handOver('w1');
  Q.view._delivered.get(rq.id).msg = [];   // what the cap leaves when it evicted every entry while the post was on its way
  Q.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'x', text: Q.frames[0].text, fromName: Q.frames[0].fromName, kind: 'notification' } });
  const one = Q.deliver.stashEntries(Q.CID).map((e) => e.text);
  Q.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'x', text: Q.frames[0].text, fromName: Q.frames[0].fromName, kind: 'notification' } });
  ok(one.length === 1 && /only/.test(one[0]) && Q.deliver.stashEntries(Q.CID).length === 1, 'a record with no originals left: the first echo keeps the frame as one notice (was: dropped), the second adds nothing', { one: one.map((t) => t.slice(0, 50)), n: Q.deliver.stashEntries(Q.CID).length });
}
{
  // THE DOOR: server.js shutdown() closes first, then waits — a press during the wait is refused by name
  const R = rig2({ deferPost: true });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'm1' });
  const p1 = R.view.handOver('w1'); await sleep(5);
  R.view.close();
  const st = R.view.settle(2000);
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'm2' });
  const r2 = await R.view.handOver('w1');
  ok(!r2.ok && r2.code === 'restarting' && /restarting/.test(r2.error) && SH.STATUS.restarting === 503 && R.view.isClosed() === true, 'after close(): a press is refused `restarting` (503) by name', r2);
  R.release(); const r1 = await p1; const k = await st;
  ok(r1.ok && k === 1 && R.view.inFlightCount() === 0 && R.diskMsg().length === 1 && R.diskMsg()[0].text === 'm2' && !R.diskMsg()[0].ho, 'the awaited hand-over settled; at exit nothing is in flight and m2 waits unstamped on disk (the next boot releases nothing)', { r1, k, disk: R.diskMsg() });
  ok(/^Not handed over — the server is restarting/.test(SS.handOverRefusalText({ code: 'restarting' })), 'the strip says it in plain words');
}

// ═══ ②e VERIFY r4 — the cap never evicts a claimed entry; the hand-over memory outlives the process and a long turn; the money word is on the button ═══
console.log('②e verify r4: the cap under claim (both stores), the memory on disk across a boot, the belt at the injection, the echo\'s kind, the wrapper\'s verdict against the words');
{
  // ── THE CAP UNDER CLAIM, the JOBS store: 30 job results land while a hand-over of 2 is on its way ──
  const R = rig2({ deferPost: true });
  R.jm._stashNotif(R.CID, job('j1', 'nightly'), { what: 'result-1' }, 'not reachable');
  R.jm._stashNotif(R.CID, job('j2', 'hourly'), { what: 'result-2' }, 'not reachable');
  const p = R.view.handOver('w1'); await sleep(5);
  for (let i = 0; i < 30; i++) R.jm._stashNotif(R.CID, job('k' + i, 'k' + i), { what: 'k-result-' + i }, 'not reachable');
  const q = R.jm.peekNotifs(R.CID);
  ok(q.length === 32 && q.filter((n) => n.ho).length === 2 && q[0].text === 'result-1' && !q.some((n) => n.text === 'k-result-0') === false, 'the jobs store keeps both STAMPED results under 30 arrivals (32 wait: 2 claimed + 30 unclaimed; was: the two claimed fell off first)', { n: q.length, stamped: q.filter((n) => n.ho).length });
  R.jm._stashNotif(R.CID, job('k30', 'k30'), { what: 'k-result-30' }, 'not reachable');
  ok(R.jm.peekNotifs(R.CID).length === 32 && !R.jm.peekNotifs(R.CID).some((n) => n.text === 'k-result-0') && R.jm.peekNotifs(R.CID).filter((n) => n.ho).length === 2, 'the 31st unclaimed arrival evicts the oldest UNCLAIMED job result, never a stamped one');
  R.release(); const r = await p;
  ok(r.ok && r.delivered === 2 && /result-1[\s\S]*result-2/.test(R.posts[0]) && R.view._delivered.get(r.id).jobs.length === 2 && R.jm.peekNotifs(R.CID).length === 30 && !R.jm.peekNotifs(R.CID).some((n) => n.ho),
    'delivered = 2 (the press counts what the agent received — was 0), the record keeps both originals, the 30 newcomers wait unclaimed', { delivered: r.delivered, left: R.jm.peekNotifs(R.CID).length });
  // the echo restores both job results into a store that already holds 30: no cap on a restore (they are the oldest — a cap would have evicted exactly them)
  R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'dropped by Stop before it was delivered', text: R.posts[0], fromName: 'VibeSpace notices', kind: 'notification' } });
  ok(R.jm.peekNotifs(R.CID).length === 32 && R.jm.peekNotifs(R.CID).filter((n) => /^result-/.test(n.text)).length === 2, 'the frame handed back: both job results are back in their store beside the 30 (a restore never trims — the next arrival\'s cap does)', { n: R.jm.peekNotifs(R.CID).length });
}
{
  // ── THE MEMORY ON DISK: a restart between the delivery and the echo (the Stop that hands a queued frame back can
  //    come long after — a review turn, an hour-long turn); through the REAL codex consumer on the NEXT server ──
  const R = rig2({ backend: 'codex', streaming: true, sidecar: { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] }, inbox: false, dataDir: true });
  for (let i = 0; i < 5; i++) R.deliver.stashFor(R.CID, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'lark-' + i + ' ' + 'x'.repeat(600) });
  R.jm._stashNotif(R.CID, job('j1', 'nightly'), { what: 'result-1' }, 'not reachable'); R.jm._save();
  const r = await R.view.handOver('w1');
  const frameText = R.frames[0].text;
  const memFile = path.join(R.dir, SH.DELIVERED_FILE);
  ok(r.ok && r.delivered === 6 && fs.existsSync(memFile) && JSON.parse(fs.readFileSync(memFile, 'utf8'))[r.id].text === frameText && JSON.parse(fs.readFileSync(memFile, 'utf8'))[r.id].msg.length === 5,
    'a delivered hand-over\'s record (its exact frame text + both stores\' originals) is on disk at once, in data/' + SH.DELIVERED_FILE, { file: fs.existsSync(memFile) });
  R.deliver.flush(); R.jm.shutdown();
  const N = rig2({ dir: R.dir, boot: true, backend: 'codex', streaming: true, sidecar: { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] }, inbox: false, dataDir: true });
  ok(N.view._delivered.size === 1 && N.deliver.releasedAtBoot.length === 0 && (N.jm.releasedAtBoot || []).length === 0, 'the next server reads the record back (nothing to release: the drain was on disk — the ideal boot, no duplicate)');
  N.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'dropped by Stop before it was delivered', text: frameText, fromName: 'VibeSpace notices', kind: 'notification' } });
  const f = N.view.summaryFor(N.s);
  ok(f && f.count === 6 && f.items.map((i) => i.kind + ':' + i.n).join() === 'channel:5,job:1' && N.deliver.stashEntries(N.CID).filter((e) => /^lark-/.test(e.text)).length === 5 && N.jm.peekNotifs(N.CID).length === 1 && !N.deliver.stashEntries(N.CID).some((e) => /hand-over ho-/.test(e.text)),
    'the frame handed back AFTER the restart restores its 6 ORIGINALS, each as itself (was: "1 VibeSpace notice" — 400 chars of a 4 KB frame at the next injection, the job result gone from its store)', f);
  ok(N.deliver.restoreFrame(N.CID, frameText) === 6 && JSON.parse(fs.readFileSync(memFile, 'utf8'))[r.id].restored === 6, 'a second echo (a Stop AND a queue removal) is handled by the persisted mark, never a copy');
  // the TTL outlives a long turn; the count bounds the file
  ok(SH.DELIVERED_TTL_MS >= 12 * 60 * 60 * 1000 && SH.DELIVERED_MAX === 50, `the memory keeps a record for ${SH.DELIVERED_TTL_MS / 3600000} h (a queued frame is handed back any time before its turn ends — was 10 min) and at most ${SH.DELIVERED_MAX} records`);
  const M = rig2({ dataDir: true });
  for (let i = 0; i < 55; i++) { M.deliver.stashFor(M.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'm' + i }); await M.view.handOver('w1'); }
  ok(M.view._delivered.size === 50 && Object.keys(JSON.parse(fs.readFileSync(path.join(M.dir, SH.DELIVERED_FILE), 'utf8'))).length === 50, '55 hand-overs ⇒ 50 records in memory and on disk (the oldest forgotten)');
}
{
  // ── THE BELT at the injection: a notification VibeSpace wrote is never cut to a 400-char LINE in silence ──
  const long = 'The user handed over the 6 notice(s) that were waiting for your next turn (hand-over ho-zz-1):\n\n' + Array.from({ length: 6 }, (_, i) => `- [09-27] from "Ada": lark-${i} ` + 'x'.repeat(500)).join('\n');
  const asNotice = renderMsgStash([{ source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: long, ts: 1 }]);
  const asPeer = renderMsgStash([{ source: 'agent', kind: 'peer', fromName: 'Ada', text: long, ts: 1 }]);
  const short = renderMsgStash([{ source: 'agent', kind: 'notification', fromName: 'Background Work · nightly', text: 'finished: 3 files', ts: 1 }]);
  ok(/lark-5/.test(asNotice.text) && asNotice.text.length > 3000 && !/clipped/.test(asNotice.text), 'a long NOTIFICATION entry (a frame the wrapper handed back) renders as a BLOCK — every line reaches the agent (was: 400 chars)', asNotice.text.length);
  ok(!/lark-5/.test(asPeer.text) && asPeer.text.length < 700, 'a PEER entry with the same text is still a 400-char line (a peer\'s words are never widened by their length)');
  ok(/reports: \[Background Work · nightly\] finished: 3 files$/.test(short.text) && !/\n\(/.test(short.text), 'a short notification stays a line');
  const huge = renderMsgStash([{ source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: 'frame (hand-over ho-zz-2):\n' + 'y'.repeat(9000), ts: 1 }]);
  ok(/\(… clipped\)/.test(huge.text) && Buffer.byteLength(huge.text) < 4400, 'a block beyond the block budget (4 KiB) is clipped WITH its clip named, never in silence');
}
{
  // ── THE ECHO'S OWN KIND: a PEER frame that IS the text of a remembered hand-over restores nothing ──
  const R = rig2({ dataDir: true });
  R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'own-1' });
  const r = await R.view.handOver('w1');
  const text = R.view._delivered.get(r.id).text;
  ok(R.deliver.restoreFrame(R.CID, text, { kind: 'peer' }) === 0 && R.view.summaryFor(R.s) === null, 'the exact frame text echoed as a PEER frame (an agent quoted the whole frame to a peer, verbatim) restores nothing');
  ok(R.deliver.restoreFrame(R.CID, text, { kind: null }) === 1 && R.view.summaryFor(R.s).count === 1, 'an older wrapper that echoes no kind (null) is not judged — the text-equal frame restores');
}
{
  // ── THE MONEY WORD vs THE WRAPPER'S VERDICT (the codex steer lane): the words at the press, the ledger after ──
  const steerCaps = { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] };
  const verdicts = [
    { v: { ok: true, mode: 'steered' }, rows: 0, what: 'the fold held' },
    { v: { ok: true, mode: 'queued', steerFailed: 'turn-not-steerable', steerDetail: 'review turn' }, rows: 1, what: 'the steer REFUSED (a review turn) — queued as its own turn' },
    { v: { ok: true, mode: 'turn' }, rows: 1, what: 'the turn ended first — its own turn' },
  ];
  for (const row of verdicts) {
    const R = rig2({ backend: 'codex', streaming: true, sidecar: steerCaps, inbox: false });
    R.deliver.stashFor(R.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'row' });
    const f = R.view.summaryFor(R.s);
    const w = S.stashSummaryWords(f, tEn, { billed: f.billed, inFlight: f.inFlight, held: f.held, reachable: f.reachable });
    const r = await R.view.handOver('w1');
    R.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ...row.v } });
    ok(r.ok && f.billed === false && w.cost === 'joins the running turn' && /if that turn cannot take it, it runs as its own billed turn right after/.test(w.title) && R.ledger.length === row.rows,
      `codex MID-TURN, ${row.what}: the button said the MECHANISM ("joins the running turn"), the title the caveat; ledger rows ${row.rows} (was: no word at all, and the refused fold billed unannounced)`, { cost: w.cost, ledger: R.ledger });
  }
  const B = rig2({ backend: 'claude' });
  B.deliver.stashFor(B.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'row' });
  const wb = S.stashSummaryWords(B.view.summaryFor(B.s), tEn, { billed: true });
  ok(wb.cost === 'starts a turn' && /starts a billed turn/.test(wb.title), 'a billed lane says "starts a turn" — the money word is never blank on either lane');
  // THE PHONE: the money word is on the BUTTON and the ≤768px rule folds only the parts and the held count
  const css = read('public/chat.css');
  const phone = css.match(/@media \(max-width: 768px\) \{ ([^}]*)\}/g).filter((m) => /chat-stash/.test(m));
  ok(phone.length === 1 && /\.chat-stash-parts, \.chat-stash-held \{ display: none; \}/.test(phone[0]) && !/chat-stash-cost/.test(phone[0]) && !/chat-stash-go\b[^{]*\{[^}]*display: none/.test(phone[0]),
    'the phone rule hides the parts and the held count and NEVER the money word on the button (was: `.chat-stash-cost { display: none }` — a press that bills said nothing where it was pressed)', phone);
  const strip = SS.createStashStrip({ sessionId: 'w1' });
  strip.set({ ...S.summarize({ msg: [{ source: 'agent', kind: 'peer', fromName: 'Ada' }] }), billed: true, held: 2 }, { turn: 'idle' });
  const go = strip.el.querySelector('.chat-stash-go');
  ok(go.children.some((c) => c.className === 'chat-stash-cost' && c.textContent === ' · starts a turn') && strip.el.querySelector('.chat-stash-held').parentNode === strip.el && strip.el.querySelector('.chat-stash-held').textContent === '2 more are held for the next hand-over',
    'the money word is a child of the button; the held count is its own node beside it');
}
{
  // ── THE DOOR AT SHUTDOWN: every other caller of the ladder still delivers or stashes (the free path) while only the
  //    billed hand-over is refused ──
  const R = rig2();
  R.view.close();
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'door-1' });
  R.jm._stashNotif(R.CID, job('j1', 'nightly'), { what: 'door-job' }, 'not reachable');
  const d = await R.deliver.deliverToConversation(R.CID, 'a jobs finalize during the wait', { kind: 'notification', spendReason: 'job-notification' });
  const h = await R.view.handOver('w1');
  ok(R.deliver.stashEntries(R.CID).length === 1 && R.jm.peekNotifs(R.CID).length === 1 && d.ok && d.lane === 'message' && !h.ok && h.code === 'restarting' && SH.STATUS.restarting === 503,
    'after close(): a stash write, a jobs stash and a ladder delivery all still work (the door is the hand-over\'s alone); the press answers `restarting` 503', { d, h });
}
{
  // ── THE WRAPPER'S ECHO IS THE FRAME, BY SOURCE: every ok:false emitter carries the text it was handed, unsliced, and the reader is raw-mode ──
  const cw = read('data/bin/codex-chat-wrapper.js');
  const falses = [...cw.matchAll(/emitTaskEvent\('peer_message_result', \{ ok: false,[^\n]*/g)].map((m) => m[0]);
  ok(falses.length === 3 && falses.every((l) => /\{ ok: false, reason: [^,]+, text(: known\.text)?,/.test(l) && !/slice|substr|trim\(\)/.test(l)) && /if \(process\.stdin\.isTTY\) process\.stdin\.setRawMode\(true\);/.test(cw) && /const text = String\(msg\.text \|\| ''\);\n\s+if \(!text\.trim\(\)\) return;/.test(cw),
    'the codex wrapper: all three ok:false echoes carry the frame text unsliced (noteQueued keeps it whole), stdin is raw-mode (no canonical-line truncation), the text is stored as handed (measured byte-equal over a real pty for CRLF / trailing newlines / bidi / 12 KiB / a 72 KiB JSON line / lone surrogates)', falses);
}

// ═══ ②f VERIFY r5 — the drains fit the inline cap or wait; the memory's bound, loader and unknown echoes speak ═══
console.log('②f verify r5: the injection\'s drains fit the cap or wait (the REAL hook routes); the memory\'s junk gate, torn file, spent-first bound, record-less echo');
const { TaskGroupManager } = require(path.join(REPO, 'src/task-groups.js'));
const AR = require(path.join(REPO, 'src/agent-routes.js'));
/** The REAL agent routes on a fake express (test-backlog-nudge's harness): `groups` task groups heavy enough that a
 *  claude SessionStart / codex first prompt carries ~8 KB of context; the real ladder's stash + the real jobs store. */
function routesRig({ backend = 'claude', groups = 2, n = 60, progress = 5, routesMod = AR, cid = 'c0ffee00-0000-4000-8000-0000000000f5' } = {}) {
  const dir = scratch('stash-strip-r5-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  const NOW = Date.now(), DAY = 86400e3;
  const store = new TaskGroupManager({ dataDir: dir, onChange: () => {}, getSetting: () => undefined });
  const work = path.join(dir, 'work'); fs.mkdirSync(work);
  for (let gi = 0; gi < groups; gi++) {
    const grp = store.create({ title: `ctx${gi}`, objective: 'objective '.repeat(20), plan: 'step one; step two; step three '.repeat(10), folders: [work] });
    store.update(grp.id, { backlog: Array.from({ length: n }, (_, i) => ({ id: `B-${gi}${String(i).padStart(3, '0')}`, text: '清理积压事项'.repeat(30) + i, status: 'open', priority: 'normal', addedAt: NOW - i * DAY, addedBy: 'claude:x', claimedBy: ['claude:s1'] })) });
    for (let p = 0; p < progress; p++) store.addProgress(grp.id, { note: '进度记录 '.repeat(20) + p });
  }
  const cards = [], logs = [];
  const s = { agentToken: 'vsst_s1', backend, cwd: work, name: 's1', backendSessionId: cid, claudeSessionId: cid, mode: 'chat' };
  const sessions = new Map([['s1', s]]);
  const deliver = CD.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: (c, card) => cards.push(card), log: () => {} });
  const jm = new JobManager({ dataDir: dir, log: () => {}, broadcast: () => {}, onStash: () => {} });
  jm.init();
  const routes = {};
  const app = { get: (pth, h) => { routes[`GET ${pth}`] = h; }, post: (pth, h) => { routes[`POST ${pth}`] = h; } };
  routesMod.setupAgentRoutes({ app, activeSessions: sessions, tasks: store, deliver, getJobs: () => jm,
    sessionStatus: { snapshot: () => ({}), get: () => null, consumeNotice: () => null, consumeNotices: () => [], pendingNotices: () => [], rekey: () => {}, clear: () => null, setByUser: () => null, setByAgent: () => null, history: () => [] },
    SessionStatusManager: { renderNotice: () => '', renderNotices: () => '' },
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: () => `${backend}:${cid}`, serverSetting: () => undefined, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null });
  const get = (pth) => { let out; const res = { json: (o) => { out = o; return res; }, status: () => res }; const cl = console.log; console.log = (...a) => logs.push(a.join(' ')); try { routes[`GET ${pth}`]({ headers: { authorization: 'Bearer vsst_s1' }, query: {}, body: {} }, res); } finally { console.log = cl; } return (out && out.context) || ''; };
  return { dir, cid, store, deliver, jm, get, cards, logs, s };
}
const frame6 = require(path.join(REPO, 'src/notification-senders.js')).vibespaceNoticeText('The user handed over the 6 notice(s) that were waiting for your next turn (hand-over ho-zz-1):\n\n' + Array.from({ length: 6 }, (_, i) => `- [09-27] VibeSpace reports: [Channels · Lark] lark-${i} ` + 'x'.repeat(500) + ` END-${i}`).join('\n'));
const ends = (ctx) => Array.from({ length: 6 }, (_, i) => ctx.includes(`END-${i}`)).filter(Boolean).length;
{
  // ── a claude RESUME: the SessionStart carries two groups' full context (~8 KB) AND a handed-back frame waits ──
  const H = routesRig({ backend: 'claude' });
  H.deliver.stashFor(H.cid, { source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: frame6 });
  const tc = H.get('/api/agent/task-context');
  ok(Buffer.byteLength(tc, 'utf-8') + 2 + Buffer.byteLength(frame6, 'utf-8') > AR.INLINE_CAP - AR.INLINE_TAIL_MARGIN && !/context trimmed to stay inline/.test(tc) && !tc.includes('### Messages that arrived') && H.deliver.stashCount(H.cid) === 1 && H.cards.length === 0 && H.logs.some((l) => /1 stashed message\(s\) wait for the next prompt — \d+ B do not fit the \d+ B left under the inline cap/.test(l)),
    'a resume\'s SessionStart (two groups\' full context — less room left than the frame needs) + a 4 KiB handed-back frame: the frame WAITS whole (still in its store, no card yet) and the log names the sizes (was: drained, then capInline cut five of six notices off the tail, the card showing all six)', { bytes: Buffer.byteLength(tc, 'utf-8'), store: H.deliver.stashCount(H.cid), logs: H.logs });
  const p1 = H.get('/api/agent/prompt-context');
  ok(ends(p1) === 6 && !/context trimmed/.test(p1) && H.deliver.stashCount(H.cid) === 0 && H.cards.length === 1, 'the next (quiet) prompt carries all six notices whole and the store empties — one card', { ends: ends(p1), store: H.deliver.stashCount(H.cid) });
  // ── the codex FIRST prompt is the same shape (its full context rides prompt-context) ──
  const X = routesRig({ backend: 'codex' });
  X.deliver.stashFor(X.cid, { source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: frame6 });
  const c1 = X.get('/api/agent/prompt-context'); const c2 = X.get('/api/agent/prompt-context');
  ok(!c1.includes('### Messages that arrived') && !/context trimmed/.test(c1) && ends(c2) === 6 && X.deliver.stashCount(X.cid) === 0, 'codex: the first prompt (full context) holds the frame, the second carries it whole', { first: Buffer.byteLength(c1), ends: ends(c2) });
  // ── a small head: everything drains as before; the newest goes when only IT fits, the rest waits by identity ──
  const Q = routesRig({ backend: 'claude', groups: 1, n: 5, progress: 0 });
  Q.get('/api/agent/task-context');
  for (let k = 0; k < 3; k++) Q.deliver.stashFor(Q.cid, { source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: frame6.replace(/END-/g, `K${k}-`), ts: 1000 + k });
  const q1 = Q.get('/api/agent/prompt-context');
  ok(q1.includes('K2-5') && !q1.includes('K0-5') && /\(2 older message\(s\) held for your next turn\)/.test(q1) && Q.deliver.stashCount(Q.cid) === 2 && Q.deliver.stashEntries(Q.cid).map((e) => e.ts).join() === '1000,1001',
    'three 4 KiB blocks on a quiet prompt: the newest rides, the two older wait IN THEIR STORE with their own ts (taken by identity — nothing re-stashed)');
  // ── a claimed entry (a hand-over in flight) is never the injection\'s ──
  const rel = Q.deliver.claimStash(Q.cid, Q.deliver.stashEntries(Q.cid).slice(0, 1), 'ho-t-1');
  const q2 = Q.get('/api/agent/prompt-context');
  ok(q2.includes('K1-5') && !q2.includes('K0-5') && Q.deliver.stashCount(Q.cid) === 1 && Q.deliver.claimedCount(Q.cid) === 1, 'a claimed entry (a hand-over on its way) is left to the hand-over; the unclaimed one drains'); rel();
  // ── the jobs digest holds the same way when its budget does not fit ──
  const J = routesRig({ backend: 'claude', groups: 4 });   // four groups' full context ≈ 9.5 KB: less than the digest's 900 B is left
  for (let i = 0; i < 4; i++) J.jm._stashNotif(J.cid, { id: 'j' + i, name: 'nightly', state: 'done' }, { what: 'result-' + i }, 'not reachable');
  const jt = J.get('/api/agent/task-context');
  ok(!jt.includes('vibespace-jobs-missed-while-away') && J.jm.peekNotifs(J.cid).length === 4 && J.logs.some((l) => /4 stashed notification\(s\) wait for the next prompt/.test(l)) && !fs.existsSync(path.join(J.dir, 'job-notifications-read')),
    'the jobs digest: four results wait when the 900 B digest does not fit a four-group resume\'s context (no spill file written for a drain that did not happen)', { left: J.jm.peekNotifs(J.cid).length, logs: J.logs });
  const jp = J.get('/api/agent/prompt-context');
  ok(jp.includes('vibespace-jobs-missed-while-away') && jp.includes('result-3') && J.jm.peekNotifs(J.cid).length === 0, '…and ride the next prompt');
  // the constants the helpers reason with are the producers\' own
  ok(AR.JOBS_DIGEST_BUDGET === 900 && Buffer.byteLength(renderNotifStash(Array.from({ length: 40 }, (_, i) => ({ jobId: 'j' + i, jobName: 'n', text: 'x'.repeat(200), ts: 1 }))), 'utf-8') <= AR.JOBS_DIGEST_BUDGET && AR.roomUnderCap(0) === AR.INLINE_CAP - AR.INLINE_TAIL_MARGIN && AR.INLINE_CAP === 9600,
    'JOBS_DIGEST_BUDGET is job-model\'s own default (40 entries render under it); the room is INLINE_CAP (9600) minus the group reports\' 64 B margin');
}
{
  // ── THE MEMORY: a junk `at` is dropped at load; a torn file is SAID; the count bound evicts a SPENT record first and
  //    names a live one it forgets; an echo naming a hand-over the memory lacks is SAID ──
  const dir = scratch('stash-strip-r5-mem-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  const logs = []; const L = { log: (m) => logs.push(m), warn: (m) => logs.push('W ' + m) };
  const memFile = path.join(dir, SH.DELIVERED_FILE);
  fs.writeFileSync(memFile, JSON.stringify({ 'ho-junk': { cid: 'c', text: 't', msg: [], jobs: [], at: 'yesterday' }, 'ho-old': { cid: 'c', text: 't', msg: [], jobs: [], at: Date.now() - 48 * 3600e3 }, 'ho-live': { cid: 'c', text: 't', msg: [{ text: 'x' }], jobs: [], at: Date.now() } }));
  const v1 = SH.create({ activeSessions: new Map(), getDeliver: () => null, getJobs: () => null, dataDir: dir, log: L });
  ok([...v1._delivered.keys()].join() === 'ho-live' && Object.keys(JSON.parse(fs.readFileSync(memFile, 'utf8'))).join() === 'ho-live', 'load: a record with a junk instant is dropped (was: never older than the TTL\'s cut, it lived until the count bound), a 48 h one forgotten, the live one kept — and the file rewritten');
  const obj = {}; for (let i = 0; i < 50; i++) obj['ho-live-' + i] = { cid: 'c', text: 't' + i, msg: [{ text: 'x' }], jobs: [], at: Date.now() - 50 + i }; for (let i = 0; i < 5; i++) obj['ho-spent-' + i] = { cid: 'c', text: 's' + i, msg: [], jobs: [], at: Date.now(), restored: 2 }; obj['ho-new'] = { cid: 'c', text: 'n', msg: [], jobs: [], at: Date.now() };
  fs.writeFileSync(memFile, JSON.stringify(obj));
  const before = logs.length;
  const v2 = SH.create({ activeSessions: new Map(), getDeliver: () => null, getJobs: () => null, dataDir: dir, log: L });
  const kept = [...v2._delivered.keys()];
  ok(kept.length === 50 && !kept.some((k) => k.startsWith('ho-spent')) && kept.filter((k) => k.startsWith('ho-live')).length === 49 && !kept.includes('ho-live-0') && kept.includes('ho-new') && logs.slice(before).filter((l) => /^W \[stash\] hand-over ho-live-0 \(c, 1 originals\) forgotten by the 50-record bound/.test(l)).length === 1,
    '56 records over the 50 bound: the five SPENT go first (they hold no originals), then the oldest LIVE one — named in the log with its originals count (was: FIFO, silent)', { kept: kept.length, logs: logs.slice(before) });
  fs.writeFileSync(memFile, JSON.stringify(obj).slice(0, 40));
  const b2 = logs.length;
  const v3 = SH.create({ activeSessions: new Map(), getDeliver: () => null, getJobs: () => null, dataDir: dir, log: L });
  ok(v3._delivered.size === 0 && logs.slice(b2).length === 1 && /^W \[stash\] the hand-over memory .*stash-handover\.json was unreadable \(.*\) — starting empty/.test(logs[b2]), 'a torn file: empty memory, SAID by name (was: a silent catch)', logs.slice(b2));
  const b3 = logs.length;
  ok(v3.restoreHandedOver('c', 'frame (hand-over ho-gone-1)') === 0 && logs.slice(b3).length === 1 && /a frame names hand-over ho-gone-1, which this hub no longer remembers/.test(logs[b3]), 'an echo naming a hand-over the memory lacks answers 0 (the frame is kept as one notice) and SAYS so by id (was: silent)', logs.slice(b3));
  ok(!fs.existsSync(path.join(dir, 'nowhere')) && SH.create({ activeSessions: new Map(), getDeliver: () => null, getJobs: () => null, dataDir: path.join(dir, 'nowhere'), log: L }) && logs.length === b3 + 1, 'an ABSENT file is a first boot: nothing said');
}
{
  // ── r5 NEGATIVE CONTROLS ──
  const MUT5 = mutantCopies('stash-strip-r5', REPO);
  const ar = read('src/agent-routes.js');
  const a1 = '  if (!pm.shown.length || need > room) {\n';
  if (!ar.includes(a1)) throw new Error('mutation anchor missing: fit');
  const NoFit = MUT5.load('src/agent-routes.js', ar.replace(a1, '  if (!pm.shown.length) {\n'), 'no-fit');
  const H = routesRig({ backend: 'claude', routesMod: NoFit });
  H.deliver.stashFor(H.cid, { source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: frame6 });
  const tc = H.get('/api/agent/task-context');
  ok(/context trimmed to stay inline/.test(tc) && ends(tc) < 6 && H.deliver.stashCount(H.cid) === 0 && H.cards.length === 1 && !H.get('/api/agent/prompt-context').includes('END-'),
    `CONTROL the fit check removed: the resume drains the frame, capInline cuts it (${ends(tc)} of 6 notices reach the agent), the card shows all six and the next prompt carries nothing (②f can go red)`, { ends: ends(tc) });
  const sh = read('src/server/stash-handover.js');
  const a2 = '    if (delivered.size > DELIVERED_MAX) for (const [id, rec] of delivered) { if (delivered.size <= DELIVERED_MAX) break; if (rec.restored) { delivered.delete(id); n++; } }\n';
  if (!sh.includes(a2)) throw new Error('mutation anchor missing: spent-first');
  const Fifo = MUT5.load('src/server/stash-handover.js', sh.replace(a2, ''), 'fifo');
  const dir = scratch('stash-strip-r5-ctl-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  const obj = {}; for (let i = 0; i < 50; i++) obj['ho-live-' + i] = { cid: 'c', text: 't' + i, msg: [{ text: 'x' }], jobs: [], at: Date.now() - 50 + i }; for (let i = 0; i < 5; i++) obj['ho-spent-' + i] = { cid: 'c', text: 's' + i, msg: [], jobs: [], at: Date.now(), restored: 2 }; obj['ho-new'] = { cid: 'c', text: 'n', msg: [], jobs: [], at: Date.now() };
  fs.writeFileSync(path.join(dir, SH.DELIVERED_FILE), JSON.stringify(obj));
  const f = Fifo.create({ activeSessions: new Map(), getDeliver: () => null, getJobs: () => null, dataDir: dir, log: { log() {}, warn() {} } });
  ok([...f._delivered.keys()].filter((k) => k.startsWith('ho-spent')).length === 5 && [...f._delivered.keys()].filter((k) => k.startsWith('ho-live')).length === 44, 'CONTROL spent-first removed: six LIVE records are forgotten while five spent ones stay (②f can go red)');
  const a3 = " && Number(rec.at) > 0) delivered.set(id, { ...rec, at: Number(rec.at),";
  if (!sh.includes(a3)) throw new Error('mutation anchor missing: at-gate');
  const Junk = MUT5.load('src/server/stash-handover.js', sh.replace(a3, ') delivered.set(id, { ...rec,'), 'junk-at');
  fs.writeFileSync(path.join(dir, SH.DELIVERED_FILE), JSON.stringify({ 'ho-junk': { cid: 'c', text: 't', msg: [], jobs: [], at: 'yesterday' } }));
  const j = Junk.create({ activeSessions: new Map(), getDeliver: () => null, getJobs: () => null, dataDir: dir, log: { log() {}, warn() {} } });
  ok(j._delivered.has('ho-junk'), 'CONTROL the numeric-instant gate removed: the junk record is loaded (②f can go red)');
  for (const c of copiesCensus(MUT5.files, MUT5.dir, REPO, { minCopies: 3, label: '②f ' })) ok(c.pass, c.name, c.detail);
}

// ═══ ②g VERIFY r6 — what rides AFTER the drains is counted BEFORE them; the render's rows-only budget; the cap's eviction is said ═══
console.log('②g verify r6: the tail producers counted ahead of the drains (the REAL routes, a sweep); take-what-fits; the eviction said; the real hook; identity; the order');
const { SessionStatusManager: SSM } = require(path.join(REPO, 'src/session-status.js'));
/** The r5 rig with the REAL SessionStatusManager (the status-override notice is a real producer here), one group over the
 *  backlog-nudge threshold when asked, the dir removed by `done()` (a sweep makes hundreds). */
function rigR6({ backend = 'claude', n = 5, routesMod = AR, settings = {}, cid = 'c0ffee00-0000-4000-8000-0000000000f6' } = {}) {
  const dir = scratch('stash-strip-r6-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  const NOW = Date.now(), DAY = 86400e3, key = `${backend}:${cid}`;
  const serverSetting = (k) => settings[k];
  const store = new TaskGroupManager({ dataDir: dir, onChange: () => {}, getSetting: serverSetting });
  const work = path.join(dir, 'work'); fs.mkdirSync(work);
  const grp = store.create({ title: 'ctx0', objective: 'objective '.repeat(20), plan: 'step one; step two; step three '.repeat(10), folders: [work] });
  store.update(grp.id, { backlog: Array.from({ length: n }, (_, i) => ({ id: `B-0${String(i).padStart(3, '0')}`, text: '清理积压事项'.repeat(30) + i, status: 'open', priority: 'normal', addedAt: NOW - i * DAY, addedBy: 'claude:x', claimedBy: [key] })) });
  const cards = [], logs = [], dlogs = [];
  const s = { agentToken: 'vsst_s1', backend, cwd: work, name: 's1', backendSessionId: cid, claudeSessionId: cid, mode: 'chat' };
  const sessions = new Map([['s1', s]]);
  const deliver = CD.create({ dataDir: dir, activeSessions: sessions, serverSetting, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: (c, card) => cards.push(card), log: (...a) => dlogs.push(a.join(' ')) });
  const jm = new JobManager({ dataDir: dir, log: (...a) => dlogs.push(a.join(' ')), broadcast: () => {}, onStash: () => {} });
  jm.init();
  const sessionStatus = new SSM({ dataDir: dir, onChange: () => {} });
  const routes = {};
  const app = { get: (pth, h) => { routes[`GET ${pth}`] = h; }, post: (pth, h) => { routes[`POST ${pth}`] = h; } };
  routesMod.setupAgentRoutes({ app, activeSessions: sessions, tasks: store, deliver, getJobs: () => jm, sessionStatus, SessionStatusManager: SSM,
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: () => key, serverSetting, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null });
  const get = (pth) => { let out; const res = { json: (o) => { out = o; return res; }, status: () => res }; const cl = console.log, cw = console.warn; console.log = (...a) => logs.push(a.join(' ')); console.warn = () => {}; try { routes[`GET ${pth}`]({ headers: { authorization: 'Bearer vsst_s1' }, query: {}, body: {} }, res); } finally { console.log = cl; console.warn = cw; } return (out && out.context) || ''; };
  /** a ~5 KB diff head on the next prompt (an objective rewrite + 15 parked items — the diff's own cap) */
  const bigDiff = () => { s._groupSeenAt[grp.id] -= 10; const g = store.get(grp.id); store.update(grp.id, { objective: '目标改写 '.repeat(120), backlog: [...g.backlog, ...Array.from({ length: 15 }, (_, i) => ({ id: `P-${i}`, text: '新停放事项 '.repeat(45) + i, status: 'open', priority: 'normal', addedAt: Date.now(), addedBy: key, claimedBy: [key] }))] }); };
  const notice = () => sessionStatus.pushNotice(key, { kind: 'status-override', agent: { state: 'working', urgency: 'normal', reason: 'x' }, user: { state: 'blocked', urgency: 'high' } });
  // the stores' debounced writers must not fire into a removed dir (session-status's 500 ms tmp+rename would throw
  // from a timer); the jobs engine's unref'd intervals are cleared; the ladder's stash timer catches its own miss
  const done = () => { if (sessionStatus._writeTimer) { clearTimeout(sessionStatus._writeTimer); sessionStatus._writeTimer = null; } sessionStatus._dirty = false; for (const t of jm._timers || []) clearInterval(t); jm._dirty = false; try { fs.rmSync(dir, { recursive: true }); } catch { } };
  return { dir, cid, key, gid: grp.id, store, deliver, jm, sessionStatus, get, cards, logs, dlogs, s, sessions, bigDiff, notice, done };
}
const B = (t) => Buffer.byteLength(String(t), 'utf-8');
/** ONE prompt: the 5 KB diff head + a status-override notice + the backlog nudge (25 owned items) + a stash of one channel
 *  block (newest, `P` chars) and five older peer lines (`q` chars) — the newest-first fill lands at every distance from
 *  the room as q sweeps. Returns what reached the agent vs what left the store. */
function tailScenario({ P, q, routesMod }) {
  const H = rigR6({ n: 25, routesMod });
  try {
    H.get('/api/agent/task-context'); H.bigDiff(); H.notice();
    for (let i = 0; i < 5; i++) H.deliver.stashFor(H.cid, { source: 'agent', kind: 'peer', fromName: 'Ada', text: `m${i} END-${i} ` + 'y'.repeat(q), ts: 1000 + i });
    H.deliver.stashFor(H.cid, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'lark END-5 ' + 'z'.repeat(P) + ' TAIL-5', ts: 2000 });
    const ctx = H.get('/api/agent/prompt-context');
    const drained = H.cards.length;
    const want = drained ? ['5', ...Array.from({ length: drained - 1 }, (_, k) => String(4 - k))].sort().join('') : '';
    const got = [0, 1, 2, 3, 4, 5].filter((i) => ctx.includes(`END-${i} `) || ctx.includes(`END-${i}\n`) || ctx.endsWith(`END-${i}`)).join('');
    return { bytes: B(ctx), trimmed: /context trimmed to stay inline/.test(ctx), drained, storeAfter: H.deliver.stashCount(H.cid), whole: got === want && (!drained || ctx.includes('TAIL-5')), noticeIn: ctx.includes('<system-reminder>'), nudgeIn: ctx.includes('Clean up before parking more'), waited: H.logs.some((l) => /message\(s\) wait for the next prompt/.test(l)) };
  } finally { H.done(); }
}
function tailSweep(routesMod, Ps = [3000, 3600]) {
  const t = { n: 0, drained: 0, trimmed: 0, cut: 0, noticeCut: 0, nudgeCut: 0, waited: 0, firstCut: null };
  for (const P of Ps) for (let q = 1; q <= 400; q++) {
    const r = tailScenario({ P, q, routesMod }); t.n++;
    if (r.drained) t.drained++;
    if (r.trimmed) t.trimmed++;
    if (r.drained && !r.whole) { t.cut++; if (!t.firstCut) t.firstCut = { P, q, ...r }; }
    if (!r.noticeIn) t.noticeCut++;
    if (!r.nudgeIn) t.nudgeCut++;
    if (r.waited) t.waited++;
  }
  return t;
}
{
  const t = tailSweep(AR);
  ok(t.n === 800 && t.drained >= 500 && t.trimmed === 0 && t.cut === 0 && t.noticeCut === 0 && t.nudgeCut === 0,
    `a 5 KB diff head + a status-override notice + the backlog nudge + a stash that fills its room, 800 fills: nothing is ever trimmed, every drained entry reaches the agent whole, the CONSUMED notice and the nudge always ride (drained ${t.drained}/800)`, t);
  ok(t.waited === 0, 'take what fits: with the head + the tail counted, the newest block (3.0 / 3.6 KB) alone always fits — no fill is held whole (was: 37 % held where the rows-only budget let the head + hints overshoot)', t);
  // the rows-only budget on the helper itself: five 900 B lines under a room the header + hints overshoot ⇒ four ride, one waits (was: all five waited)
  const store = []; const fake = { stashEntries: () => store.slice(), drainStash: (cid, set) => { const took = store.filter((e) => set.has(e)); for (const e of took) store.splice(store.indexOf(e), 1); return took; }, emitPeerCard: () => {} };
  for (let i = 0; i < 5; i++) store.push({ source: 'agent', kind: 'peer', fromName: 'Ada', text: `L${i} ` + 'w'.repeat(380), ts: 10 + i });
  const rows = AR.renderMsgStash(store.slice(), { maxBytes: 99999 });
  const rowBytes = rows.text.split('\n').filter((l) => l.startsWith('- [')).reduce((a, l) => a + B(l) + 1, 0);
  const room = rowBytes + 20;   // the rows fit, the head (65 B) + the hint (~90 B) do not
  const txt = AR.drainStashUnderCap(fake, 'c', AR.INLINE_CAP - AR.INLINE_TAIL_MARGIN - room, () => {});
  ok(txt && store.length === 1 && store[0].text.startsWith('L0 ') && B(txt) + 2 <= room && /\(1 older message\(s\) held for your next turn\)/.test(txt), 'the helper: five lines whose ROWS fit a room the head + hint overshoot ⇒ the oldest waits, four ride under the room (was: all five waited)', { left: store.length, bytes: B(txt), room });
}
{
  // the jobs digest + the jobs UPDATE after it (≤ 600 B, its marker advanced at render): a preamble + the 5 KB diff put the
  // head near the cap; sweep the preamble — a drained digest is never cut and the update never falls off the tail
  const digestSweep = (routesMod) => {
    const t = { n: 0, drained: 0, trimmed: 0, cut: 0, updateCut: 0 };
    for (let pre = 2400; pre <= 3400; pre += 4) {
      const H = rigR6({ n: 5, routesMod, settings: { 'agents.injectPreamble': 'p'.repeat(pre) } });
      try {
        H.get('/api/agent/task-context'); H.s._preambleSeen = undefined; H.bigDiff();
        for (let i = 0; i < 12; i++) H.jm._stashNotif(H.cid, { id: 'j' + i, name: 'nightly', state: 'done' }, { what: `result-${i} ` + 'r'.repeat(100) }, 'not reachable');
        H.jm.jobs.set('jx', { id: 'jx', name: 'watch-news', state: 'running', kind: 'task', owner: { conversation: { id: H.cid } }, runs: [] });
        for (let e = 0; e < 8; e++) H.jm.events.push({ ts: Date.now() - 1000 + e, jobId: 'jx', name: 'watch-news', what: `finished: item-${e} ` + 'e'.repeat(40), verb: 'run' });
        const ctx = H.get('/api/agent/prompt-context'); t.n++;
        const drained = H.cards.length > 0;
        if (drained) t.drained++;
        if (/context trimmed/.test(ctx)) t.trimmed++;
        if (drained && !(ctx.includes('result-11 ') && ctx.includes('result-0 ') && ctx.includes('</vibespace-jobs-missed-while-away>'))) t.cut++;
        if (!ctx.includes('</vibespace-jobs-update>')) t.updateCut++;
      } finally { H.done(); }
    }
    return t;
  };
  const t = digestSweep(AR);
  ok(t.n === 251 && t.drained >= 60 && t.trimmed === 0 && t.cut === 0 && t.updateCut === 0, `the jobs digest under a preamble + the 5 KB diff, 251 head sizes: never trimmed, a drained digest whole, the jobs update (rendered first, counted in the digest's room) always rides (drained ${t.drained})`, t);
  // the eviction is SAID in both stores
  const H = rigR6({ n: 5 });
  try {
    for (let i = 0; i < 33; i++) H.deliver.stashFor(H.cid, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: `lark-${i}`, ts: 1000 + i });
    for (let i = 0; i < 32; i++) H.jm._stashNotif(H.cid, { id: 'j' + i, name: 'n', state: 'done' }, { what: 'r' }, 'x');
    const ev = H.dlogs.filter((l) => /oldest waiting entr(y|ies) fell off the 30-entry cap/.test(l)), jv = H.dlogs.filter((l) => /oldest waiting notification\(s\) fell off the 30-entry cap/.test(l));
    ok(H.deliver.stashCount(H.cid) === 30 && ev.length === 3 && /channel:channel 1970-01-01T00:00:01\.000Z\) — never delivered/.test(ev[0]) && !ev.some((l) => l.includes('Channels · Lark')) && H.jm.peekNotifs(H.cid).length === 30 && jv.length === 2 && /\(j0 /.test(jv[0]),
      'the cap: 33 arrivals into the ladder\'s store and 32 into the jobs store — each eviction is one log line naming the conversation, the entry (source + KIND — a peer by its sender, never a label VibeSpace composed from a record: lane-redact verify r8 — instant / job id) and "never delivered" (was: silent, the strip\'s count at the cap)', { ev, jv });
  } finally { H.done(); }
}
{
  // STARVATION (judged, pinned): the injection walks NEWEST-first, so under one 4 KiB block per prompt the oldest block is
  // held turn after turn — VISIBLE: the agent's held line every prompt, the strip's count, and the hand-over carries it
  const H = rigR6({ n: 5 });
  try {
    H.get('/api/agent/task-context');
    const blk = (i) => ({ source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: `lark-${i} ` + 'z'.repeat(3900) + ` END-${i}`, ts: 1000 + i });
    H.deliver.stashFor(H.cid, blk(0));
    let heldLines = 0, carried0 = false;
    for (let t = 1; t <= 12; t++) { H.deliver.stashFor(H.cid, blk(t)); const c = H.get('/api/agent/prompt-context'); if (/\(1 older message\(s\) held for your next turn\)/.test(c)) heldLines++; if (/END-0\b/.test(c)) carried0 = true; }
    ok(!carried0 && heldLines === 12 && H.deliver.stashCount(H.cid) === 1 && H.deliver.stashEntries(H.cid)[0].ts === 1000 && H.dlogs.every((l) => !/fell off/.test(l)),
      'starvation is by design and visible: one 4 KiB block arriving per prompt keeps the OLDEST block waiting for 12 prompts (newest-first), every prompt tells the agent "1 older held", the store keeps it (no eviction under the cap)');
    const q1 = H.get('/api/agent/prompt-context');
    ok(/END-0\b/.test(q1) && H.deliver.stashCount(H.cid) === 0, '…and the first quiet prompt carries it');
  } finally { H.done(); }
  // the hand-over over eight 4 KiB blocks: three presses, newest first, `held` named each time
  const R = rig();
  for (let i = 0; i < 8; i++) R.deliver.stashFor(R.CID, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: `lark-${i} ` + 'z'.repeat(3900) + ` END-${i}`, ts: 1000 + i });
  const f = R.view.summaryFor(R.s);
  const presses = [];
  while (R.deliver.stashCount(R.CID) && presses.length < 5) { const r = await R.view.handOver('w1'); presses.push([r.delivered, r.held, [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => R.posts[R.posts.length - 1].includes(`END-${i}`)).join('')]); }
  ok(f.held === 5 && JSON.stringify(presses) === JSON.stringify([[3, 5, '567'], [3, 2, '234'], [2, 0, '01']]) && R.ledger.length === 3, 'the hand-over breaks the hold: 8 blocks = 3 presses (3 billed turns), newest first, `held` names the rest each time', { held: f.held, presses, ledger: R.ledger.length });
}
{
  // IDENTITY: the take is by object identity — identical bytes are distinct entries; a stale peek takes nothing
  const H = rigR6({ n: 5 });
  try {
    const same = () => ({ source: 'agent', kind: 'peer', fromName: 'Ada', text: 'identical bytes', ts: 5000 });
    H.deliver.stashFor(H.cid, same()); H.deliver.stashFor(H.cid, same()); H.deliver.stashFor(H.cid, same());
    const e = H.deliver.stashEntries(H.cid);
    const one = H.deliver.drainStash(H.cid, new Set([e[1]]));
    const left = H.deliver.stashEntries(H.cid);
    const stale = left.slice(); H.deliver.drainStash(H.cid); H.deliver.stashFor(H.cid, same());
    ok(e.length === 3 && e[0] !== e[1] && one.length === 1 && one[0] === e[1] && left[0] === e[0] && left[1] === e[2] && H.deliver.drainStash(H.cid, new Set(stale)).length === 0 && H.deliver.stashCount(H.cid) === 1
      && !/await|\.then\(/.test(AR.drainStashUnderCap.toString()) && /drainStash\(cid, new Set\(pm\.shown\.filter\(\(e\) => !e\._retry\)\)\)/.test(AR.drainStashUnderCap.toString()),   // lane notify-retry: the take skips the PARKED views (those leave through retryTake, same tick)
      'identity: three identical-byte entries are three objects, a Set take of one leaves the other two (by reference), a stale peek takes nothing new; the helper is synchronous between its peek and its take');
  } finally { H.done(); }
  // THE ORDER: the tools intro (the agent\'s contract for the vibespace-* verbs) rides FIRST — a full stash never pushes it out
  // RULE PRESSURE (lane prompt-budget): the room beside the intro sits between six 300-char lines and ONE 4 KiB block —
  // the halved intro left a 4 KiB block room beside it; measured on a twin (the group archived, a 1-char preamble)
  const oneBlk = B(AR.renderMsgStash([{ source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'lark-0 ' + 'z'.repeat(3900), ts: 1000 }]).text);
  const sixLines = B(AR.renderMsgStash(Array.from({ length: 6 }, (_, i) => ({ source: 'agent', kind: 'peer', fromName: 'Ada', text: `m${i} ` + 'y'.repeat(300), ts: 3000 + i }))).text);
  const afterPre = (c) => c.replace(/<vibespace-user-instructions>[\s\S]*?<\/vibespace-user-instructions>\n\n/, '');   // the preamble rides first (THE ORDER)
  const X = rigR6({ backend: 'codex', n: 5, settings: fillFor({ backend: 'codex', n: 5 }, { rig: rigR6, leave: Math.floor((oneBlk + sixLines) / 2) + 2, twin: (T1) => T1.store.update(T1.gid, { archived: true }) }) });
  try {
    X.store.update(X.gid, { archived: true });   // no group ⇒ the baseline intro on the codex first prompt
    for (let i = 0; i < 6; i++) X.deliver.stashFor(X.cid, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: `lark-${i} ` + 'z'.repeat(3900), ts: 1000 + i });
    const c0 = X.get('/api/agent/prompt-context');   // the intro alone is ~6.4 KB with every tool on: a 4 KiB block does not fit beside it and WAITS (no card) — it never displaces the intro
    ok(c0.startsWith('<vibespace-user-instructions>') && afterPre(c0).startsWith('<vibespace-session-tools>') && !c0.includes('### Messages that arrived') && X.cards.length === 0 && X.deliver.stashCount(X.cid) === 6, 'the order: the tools intro rides whole (right after the rule-sized preamble) on the codex first prompt and six 4 KiB blocks wait behind it (no card, the store full)');
    for (let i = 0; i < 6; i++) X.deliver.stashFor(X.cid, { source: 'agent', kind: 'peer', fromName: 'Ada', text: `m${i} ` + 'y'.repeat(300), ts: 3000 + i });
    X.s._toolsIntroSeen = false; X.s._preambleSeen = undefined;   // the same first-prompt shape again, with six 300-char lines waiting newest
    const cRaw = X.get('/api/agent/prompt-context'), c = afterPre(cRaw);
    const i0 = c.indexOf('<vibespace-session-tools>'), i1 = c.indexOf('</vibespace-session-tools>'), i2 = c.indexOf('### Messages that arrived');
    ok(i0 >= 0 && i1 > i0 && i2 > i1 && (i0 === 0 || c.startsWith('(If this arrives wrapped in <persisted-output>')) && !/context trimmed/.test(c) && B(cRaw) <= AR.INLINE_CAP && X.cards.length === 6 && c.includes('m5 ') && c.includes('m0 ') && X.deliver.stashCount(X.cid) === 6,
      'the order: the tools intro rides whole before the stash (the six lines that fit; the six blocks still wait) on the codex first prompt — only the oversize belt\'s one rescue line may precede it — under the cap', { bytes: B(c), head: c.slice(0, 80), cards: X.cards.length });
  } finally { X.done(); }
  // THE REAL HOOK: data/bin/vibespace-hook.mjs hands the route\'s answer to the CLI byte for byte at the cap (9 600 < the 10 000 B measured inline bound)
  const http = require('node:http'); const { spawn } = require('node:child_process');
  let served = 'x'.repeat(9594) + '\n世界'; while (B(served) > 9600) served = served.slice(1); while (B(served) < 9600) served = 'x' + served;
  const srv = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ success: true, context: served })); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const out = await new Promise((resolve) => { const p = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-hook.mjs')], { env: { ...process.env, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_x' }, stdio: ['pipe', 'pipe', 'pipe'] }); let o = ''; p.stdout.on('data', (c) => (o += c)); p.on('close', () => resolve(o)); p.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'abc', prompt: 'hi' })); });
  srv.close();
  const j = JSON.parse(out);
  ok(B(served) === 9600 && j.hookSpecificOutput.additionalContext === served && j.hookSpecificOutput.hookEventName === 'UserPromptSubmit' && Object.keys(j).join() === 'hookSpecificOutput', 'the REAL hook script passes a 9 600 B answer through as additionalContext byte for byte (nothing framed, nothing cut; the CLI wraps at 10 240)');
}
{
  // ── r6 NEGATIVE CONTROLS ──
  const MUT6 = mutantCopies('stash-strip-r6', REPO);
  const ar = read('src/agent-routes.js');
  const a1 = "    const committed = () => B(parts.join('\\n\\n')) + pendingPreambleBytes(s) + (extraBlock ? B(extraBlock) + 2 : 0) + rescueReserve() + tailHeld;\n";
  if (!ar.includes(a1)) throw new Error('mutation anchor missing: tail');
  // r7 form: `committed()` without the rescue reserve and the tail decided so far = r5's blind side again
  const NoTail = MUT6.load('src/agent-routes.js', ar.replace(a1, "    const committed = () => B(parts.join('\\n\\n')) + pendingPreambleBytes(s) + (extraBlock ? B(extraBlock) + 2 : 0) + 0 * (rescueReserve() + tailHeld);\n"), 'no-tail');
  const t1 = tailSweep(NoTail);
  ok(t1.trimmed > 100 && t1.cut >= 1 && t1.noticeCut >= 1 && t1.nudgeCut > 100 && t1.firstCut && !t1.firstCut.whole,
    `CONTROL the tail uncounted: capInline trims ${t1.trimmed} of 800 fills — the nudge ${t1.nudgeCut}×, the CONSUMED status notice ${t1.noticeCut}× (lost), a DRAINED entry ${t1.cut}× (its card shown, its store empty) (②g can go red)`, { ...t1, firstCut: t1.firstCut && { P: t1.firstCut.P, q: t1.firstCut.q, bytes: t1.firstCut.bytes } });
  const a2 = "  while (need > room && pm.shown.length > 1) {\n";
  if (!ar.includes(a2)) throw new Error('mutation anchor missing: shrink');
  const NoShrink = MUT6.load('src/agent-routes.js', ar.replace(a2, "  while (false && need > room && pm.shown.length > 1) {\n"), 'no-shrink');
  const t2 = tailSweep(NoShrink, [3000]);
  ok(t2.waited > 50 && t2.trimmed === 0, `CONTROL the shrink loop removed: ${t2.waited} of 400 fills are held whole though the newest alone fits (②g can go red)`, t2);
  const cd6 = read('src/server/conversation-deliver.js');
  // the .195 merge: the cap returns the entries it dropped (lane channel-withdraw's `evicted` event carries them), so the
  // log line reads `evicted.length`
  const a3 = "    if (evicted.length) log(`[deliver] ${cid}: ${evicted.length} oldest waiting entr";
  if (!cd6.includes(a3)) throw new Error('mutation anchor missing: eviction log');
  const Quiet = MUT6.load('src/server/conversation-deliver.js', cd6.replace(a3, "    if (evicted.length && false) log(`[deliver] ${cid}: ${evicted.length} oldest waiting entr"), 'quiet-evict');
  const dir = scratch('stash-strip-r6-ctl-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  const qlogs = [];
  const qd = Quiet.create({ dataDir: dir, activeSessions: new Map(), serverSetting: () => undefined, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => {}, log: (...a) => qlogs.push(a.join(' ')) });
  for (let i = 0; i < 33; i++) qd.stashFor('c', { source: 'channel', kind: 'notification', fromName: 'L', text: 'x', ts: 1000 + i });
  ok(qd.stashCount('c') === 30 && qlogs.length === 0, 'CONTROL the eviction log removed: three entries fall off in silence (②g can go red)');
  try { fs.rmSync(dir, { recursive: true }); } catch { }
  for (const c of copiesCensus(MUT6.files, MUT6.dir, REPO, { minCopies: 3, label: '②g ' })) ok(c.pass, c.name, c.detail);
}

// ═══ ②h VERIFY r7 — the CENSUS of producers; consume-then-cut from the HEAD; the codex SessionStart door; the hook names its event; the order; the boot ═══
console.log('②h verify r7: every producer counted or decided (a source census + a control that adds one); fit-or-wait for every producer that consumes (the restart\'s first prompt, the manager intro, the intro beside the preamble); the codex SessionStart door; the hook\'s event header; the order vs r5; the boot');
/** rigR6 + N groups, a manager session (readUserState), the REAL SessionStatusManager; `done()` removes the dir. */
function rigR7({ backend = 'claude', groups = 1, n = 5, routesMod = AR, settings = {}, manager = false, mode = 'chat', cid = 'c0ffee00-0000-4000-8000-0000000000f7' } = {}) {
  const dir = scratch('stash-strip-r7-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
  const NOW = Date.now(), DAY = 86400e3, key = `${backend}:${cid}`;
  const serverSetting = (k) => settings[k];
  const store = new TaskGroupManager({ dataDir: dir, onChange: () => {}, getSetting: serverSetting });
  const work = path.join(dir, 'work'); fs.mkdirSync(work);
  const gids = [];
  for (let gi = 0; gi < groups; gi++) {
    const grp = store.create({ title: `ctx${gi}`, objective: 'objective '.repeat(20), plan: 'step one; step two; step three '.repeat(10), folders: [work] });
    store.update(grp.id, { backlog: Array.from({ length: n }, (_, i) => ({ id: `B-${gi}${String(i).padStart(3, '0')}`, text: '清理积压事项'.repeat(30) + i, status: 'open', priority: 'normal', addedAt: NOW - i * DAY, addedBy: 'claude:x', claimedBy: [key] })) });
    gids.push(grp.id);
  }
  const cards = [], logs = [], warns = [], dlogs = [];
  const s = { agentToken: 'vsst_s1', backend, cwd: work, name: 's1', backendSessionId: cid, claudeSessionId: cid, mode };
  const sessions = new Map([['s1', s]]);
  const deliver = CD.create({ dataDir: dir, activeSessions: sessions, serverSetting, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: (c, card) => cards.push(card), log: (...a) => dlogs.push(a.join(' ')) });
  const jm = new JobManager({ dataDir: dir, log: (...a) => dlogs.push(a.join(' ')), broadcast: () => {}, onStash: () => {} });
  jm.init();
  const sessionStatus = new SSM({ dataDir: dir, onChange: () => {} });
  const routes = {};
  const app = { get: (pth, h) => { routes[`GET ${pth}`] = h; }, post: (pth, h) => { routes[`POST ${pth}`] = h; } };
  const userState = manager ? { sessionConfigs: { [key]: { groupManager: true } } } : {};
  routesMod.setupAgentRoutes({ app, activeSessions: sessions, tasks: store, deliver, getJobs: () => jm, sessionStatus, SessionStatusManager: SSM,
    userTodos: { rekey: () => {}, forSession: () => [], resolveByAgent: () => null, add: () => ({}) },
    sessionStatusKey: () => key, serverSetting, scheduleCtxSync: () => {}, remoteCtxBaseFor: () => null, readUserState: () => userState });
  const get = (pth, headers = {}) => { let out; const res = { json: (o) => { out = o; return res; }, status: () => res }; const cl = console.log, cw = console.warn; console.log = (...a) => logs.push(a.join(' ')); console.warn = (...a) => warns.push(a.join(' ')); try { routes[`GET ${pth}`]({ headers: { authorization: 'Bearer vsst_s1', ...headers }, query: {}, body: {} }, res); } finally { console.log = cl; console.warn = cw; } return (out && out.context) || ''; };
  const notice = (kind = 'status-override') => sessionStatus.pushNotice(key, kind === 'status-override' ? { kind, agent: { state: 'working', urgency: 'normal', reason: 'x' }, user: { state: 'blocked', urgency: 'high' } } : { kind, profileId: 'p1', by: 'user', at: Date.now() });
  const events = (n) => { jm.jobs.set('jx', { id: 'jx', name: 'watch-news', state: 'running', kind: 'task', owner: { conversation: { id: cid } }, runs: [] }); for (let e = 0; e < n; e++) jm.events.push({ ts: Date.now() - 1000 + e, jobId: 'jx', name: 'watch-news', what: `finished: item-${e} ` + 'e'.repeat(40), verb: 'run' }); };
  const done = () => { if (sessionStatus._writeTimer) { clearTimeout(sessionStatus._writeTimer); sessionStatus._writeTimer = null; } sessionStatus._dirty = false; for (const t of jm._timers || []) clearInterval(t); jm._dirty = false; try { fs.rmSync(dir, { recursive: true }); } catch { } };
  return { dir, cid, key, gids, store, deliver, jm, sessionStatus, get, cards, logs, warns, dlogs, s, sessions, notice, events, done };
}
/** RULE PRESSURE (lane prompt-budget, 2.369.227). The legs that need the head NEAR the cap size it from the head a TWIN rig
 *  renders (same groups / backlog / flags, nothing pending, a 1-char preamble): a preamble of cap − margin − head − the
 *  rescue line's reserve − `leave` chars, never the head's bytes as a literal — the tools intro halved (7.6 → 3.4 KB)
 *  and every leg sized against "the 6.4 KB intro" / "8.6 KB for two groups" went vacuous at once. `minus` = bytes of
 *  the twin's answer that are not head (the intro that must wait). Returns the settings for the real rig (the fill is
 *  CJK: the preamble is cut at 4 000 characters, and a no-group head now needs more bytes than that in ASCII). */
const blockOf = (c, open, close) => { const i = c.indexOf(open), j = c.indexOf(close, i); return i >= 0 && j > i ? B(c.slice(i, j + close.length)) : 0; };
function fillFor(opts, { route = '/api/agent/prompt-context', leave, minus = 0, rig = rigR7, twin = null } = {}) {
  const T1 = rig({ ...opts, settings: { ...(opts.settings || {}), 'agents.injectPreamble': 'p' } });
  let head, rescue;
  try { if (twin) twin(T1); head = B(T1.get(route)) - minus; rescue = B(T1.store._persistRescueLine()) + 2; } finally { T1.done(); }
  const need = AR.INLINE_CAP - AR.INLINE_TAIL_MARGIN - head - rescue - leave + 1;   // the preamble's BYTES (the twin's 1 B 'p' is in `head`)
  if (need < 1) throw new Error(`fillFor: the head alone (${head} B) leaves less than ${leave} B — no preamble makes that room`);
  // the preamble keeps its first 4 000 CHARACTERS (customPreamble) — a 3-byte character carries up to 12 000 B
  return { ...(opts.settings || {}), 'agents.injectPreamble': '页'.repeat(Math.floor(need / 3)) + 'p'.repeat(need % 3) };
}
/** the restart shape (two groups, 25 owned items): the jobs update (8 events) fits, the FIRST notice needs twice the room
 *  left (the notices ride as the longest prefix that fits — none must) */
function restartSettings(routesMod = AR) {
  const P = rigR7({ groups: 0, routesMod });
  let U, N;
  try { P.notice('status-override'); P.notice('browser-takeover'); P.events(8); N = B(SSM.renderNotices(P.sessionStatus.pendingNotices(P.key).slice(0, 1))); U = blockOf(P.get('/api/agent/prompt-context'), '<vibespace-jobs-update>', '</vibespace-jobs-update>'); } finally { P.done(); }
  if (!U || !N) throw new Error(`restartSettings: the probe rendered no update (${U}) / notices (${N})`);
  return fillFor({ groups: 2, n: 25, routesMod }, { leave: U + 2 + Math.ceil((N + 2) / 2) });
}
/** two groups + the manager intro on `route`: half the manager intro's bytes left */
function managerSettings(route, routesMod = AR) {
  const flags = { 'agents.allowGroupManagement': true };
  const P = rigR7({ groups: 0, manager: true, settings: flags, routesMod });
  let MI; try { MI = blockOf(P.get('/api/agent/prompt-context'), '<vibespace-group-manager>', '</vibespace-group-manager>'); } finally { P.done(); }
  if (!MI) throw new Error('managerSettings: the probe rendered no manager intro');
  return fillFor({ groups: 2, n: 25, settings: flags, routesMod }, { route, leave: Math.floor(MI / 2) });
}
/** no group, the tools intro on the first call: half the intro's bytes left beside the preamble */
function introFill(backend, first, routesMod = AR) {
  const P = rigR7({ backend, groups: 0, routesMod });
  let I; try { I = blockOf(P.get(first), '<vibespace-session-tools>', '</vibespace-session-tools>'); } finally { P.done(); }
  if (!I) throw new Error('introFill: the probe rendered no tools intro');
  return fillFor({ backend, groups: 0, routesMod }, { route: first, leave: Math.floor(I / 2), minus: I + 2 });
}
/** THE CENSUS: every append site of the prompt-context route, classified by where it stands relative to the drains. */
function producerCensus(src) {
  const i0 = src.indexOf("app.get('/api/agent/prompt-context'"), i1 = src.indexOf("app.get('/api/agent/stop-check'", i0);
  const body = src.slice(i0, i1);
  const drainAt = body.indexOf('drainNotifsUnderCap(jm, deliver, caller.conversationId, aheadOfDrains())');
  const decided = new Set([...body.matchAll(/\bfits\((\w+(?:\.\w+)?)\)/g)].map((m) => m[1]));   // what has a fit-or-wait decision
  const sites = [];
  for (const m of body.matchAll(/\b(parts|outParts)\.(push|unshift)\(([\s\S]*?)\);/g)) {
    const arg = m[3].trim();
    const before = m.index < drainAt;
    let cls;
    if (before) cls = 'head';                                                                // counted by `parts.join` in committed()
    else if (/^(missed|pmText)$/.test(arg)) cls = 'drain';                                    // fit-or-wait (r5/r6)
    else if (arg === 'jobsUpdate') cls = decided.has('u.text') ? 'decided' : 'UNDECIDED';   // decided as u.text before the drains
    else if (arg === 'rescueLine') cls = /rescueReserve\(\)/.test(body) ? 'reserved' : 'UNDECIDED';
    else if (arg === 't' && /for \(const t of noticeTexts\)/.test(body.slice(m.index - 60, m.index))) cls = /return need <= INLINE_CAP - INLINE_TAIL_MARGIN - committed\(\); \}/.test(body) ? 'decided' : 'UNDECIDED';
    else if (arg === 'extraBlock') cls = /\(extraBlock \? B\(extraBlock\) \+ 2 : 0\)/.test(body) ? 'counted' : 'UNDECIDED';   // in committed() — the per-turn extra at the very top
    else if (decided.has(arg)) cls = 'decided';
    else if (arg === 'rep.text') cls = 'last';                                                // the group reports budget from what is left, commit only when whole
    else if (/^`<vibespace-reminder>\$\{body\}<\/vibespace-reminder>`$/.test(arg)) cls = 'alone';   // rides only when NOTHING else does
    else cls = 'UNDECIDED';
    sites.push({ arg: arg.slice(0, 40), cls, before });
  }
  return { sites, undecided: sites.filter((x) => x.cls === 'UNDECIDED'), decided: [...decided] };
}
{
  // ── 1. THE CENSUS ──
  const ar = read('src/agent-routes.js');
  const c = producerCensus(ar);
  ok(c.sites.length >= 14 && c.undecided.length === 0 && c.sites.filter((x) => x.cls === 'head').length >= 5 && c.sites.filter((x) => x.cls === 'drain').length === 2
    && ['intro', 'MANAGER_INTRO', 'u.text', 'nudgeBlock'].every((d) => c.decided.includes(d)) && c.sites.some((x) => x.cls === 'reserved') && c.sites.filter((x) => x.cls === 'decided').length >= 3 && c.sites.some((x) => x.cls === 'counted') && c.sites.some((x) => x.cls === 'last') && c.sites.some((x) => x.cls === 'alone'),
    `CENSUS prompt-context: ${c.sites.length} append sites — every one is head (counted by parts.join), a drain, decided by fits()/the notice prefix rule before the drains, the counted per-turn extra, the reserved rescue line, the last section or the alone reminder; none undecided`, c.sites);
  // the consumers: each stamp / consume sits INSIDE its fit decision (source), on both routes
  const pc = ar.slice(ar.indexOf("app.get('/api/agent/prompt-context'"), ar.indexOf("app.get('/api/agent/stop-check'"));
  const tc = ar.slice(ar.indexOf("app.get('/api/agent/task-context'"), ar.indexOf("app.get('/api/agent/prompt-context'"));
  ok((pc.match(/sessionStatus\.consumeNotices\(k\)/g) || []).length === 1 && (pc.match(/sessionStatus\.consumeNotices\(k, byKey\.get\(k\)\)/g) || []).length === 1 && /if \(taken\) \{/.test(pc) && /sessionStatus\.pendingNotices\(k\)/.test(pc) && /consumeNotices\(key, count = null\)/.test(read('src/session-status.js'))
    && (pc.match(/s\._jobsEventsSeenTs = u\.lastTs/g) || []).length === 2 && /if \(!u\.text\) s\._jobsEventsSeenTs = u\.lastTs;/.test(pc) && /else if \(fits\(u\.text\)\) \{ jobsUpdate = u\.text; tailHeld \+= B\(u\.text\) \+ 2; s\._jobsEventsSeenTs = u\.lastTs; \}/.test(pc)
    && /if \(fits\(MANAGER_INTRO\)\) \{ parts\.push\(MANAGER_INTRO\); s\._mgrIntroSeen = true; \}/.test(pc) && /if \(intro && fits\(intro\)\) \{ parts\.push\(intro\); s\._toolsIntroSeen = true; \}/.test(pc)
    && /if \(intro && fitsHere\(intro\)\) \{ context = intro; s\._toolsIntroSeen = true; \}/.test(tc) && /if \(fitsHere\(MANAGER_INTRO\)\) \{ context = context \? context \+ '\\n\\n' \+ MANAGER_INTRO : MANAGER_INTRO; s\._mgrIntroSeen = true; \}/.test(tc)
    && (pc.match(/s\._mgrIntroSeen = true/g) || []).length === 1 && (tc.match(/s\._mgrIntroSeen = true/g) || []).length === 1 && (pc.match(/s\._toolsIntroSeen = true/g) || []).length === 1 && (tc.match(/s\._toolsIntroSeen = true/g) || []).length === 1,
    'CONSUMERS: the notices are PEEKED and the fitting PREFIX consumed by count (the master switch\'s consume-and-drop is the other site); the jobs marker moves only when the update rides (or says nothing); the manager intro and the tools intro are stamped only inside fits()/fitsHere() — on both routes');
  ok(/if \(!honoursSessionStart\(s\)\) return res\.json\(\{ success: true, context: '' \}\);/.test(tc) && /if \(hookOriginated\(req\) && !hookOutputHonoured\(hit\[0\]\)\) return res\.json\(\{ success: true, context: '' \}\);/.test(pc) && pc.indexOf('hookOriginated(req)') < pc.indexOf('integrationOnMaster()'),
    'THE DOORS: task-context answers empty for a harness that ignores SessionStart output; prompt-context answers empty to a hook-originated call on a session the wrapper delivers to — before the master switch (which consumes-and-drops)');
  // the task-context route's own appends: the intro / manager (fitsHere), the preamble (first), the drains (fit-or-wait), the digest (fitDigest)
  const tcSites = [...tc.matchAll(/context = context \? context \+ '\\n\\n' \+ (\w+) : (\w+);/g)].map((m) => m[1]);
  ok(JSON.stringify(tcSites) === JSON.stringify(['MANAGER_INTRO', 'missed', 'dig', 'pmText']) && /context = withPre\.length \? withPre\.join\('\\n\\n'\) : context;/.test(tc) && /drainNotifsUnderCap\(jm, deliver, caller\.conversationId, Buffer\.byteLength\(context \|\| '', 'utf-8'\)\)/.test(tc) && /jm\.digestFor\(caller, Buffer\.byteLength\(context \|\| '', 'utf-8'\)\)/.test(tc) && /drainStashUnderCap\(deliver, caller2\.conversationId, Buffer\.byteLength\(context \|\| '', 'utf-8'\)\)/.test(tc),
    `CENSUS task-context: the appends are the manager intro (fitsHere), the two drains (fit-or-wait) and the digest (fitDigest yields) — each against the context so far; the preamble is prepended first`, tcSites);
}
{
  // ── 2. CONSUME-THEN-CUT FROM THE HEAD (the REAL routes) ──
  // (a) the restart's first prompt: two groups, a long owned backlog, two persisted notices, eight job events
  const H = rigR7({ groups: 2, n: 25, settings: restartSettings() });   // rule pressure (lane prompt-budget): the update fits, the notices do not
  try {
    H.notice('status-override'); H.notice('browser-takeover'); H.events(8);
    const c1 = H.get('/api/agent/prompt-context');
    const w1 = { bytes: B(c1), trimmed: /context trimmed/.test(c1), noticeIn: c1.includes('<system-reminder>'), updateIn: c1.includes('</vibespace-jobs-update>'), pending: H.sessionStatus.pendingNotices(H.key).length, seenTs: H.s._jobsEventsSeenTs, wait: H.logs.filter((l) => /waits? for the next prompt/.test(l)).map((l) => l.replace(/^\[\w+\] \S+: /, '').slice(0, 60)) };
    ok(!w1.trimmed && w1.bytes <= AR.INLINE_CAP - AR.INLINE_TAIL_MARGIN && !w1.noticeIn && w1.updateIn && w1.pending === 2 && w1.seenTs > 0 && w1.wait.length === 1 && /2 of 2 pending notice\(s\) wait/.test(w1.wait[0]),
      'the restart\'s first prompt (two groups\' full context + a preamble sized by rule: the jobs update fits, the first notice needs twice the room left): the two persisted notices do not fit — they WAIT UNCONSUMED (was: consumed, the takeover notice cut mid-sentence), the update rides, nothing trimmed, the wait said', w1);
    const c2 = H.get('/api/agent/prompt-context');
    ok((c2.match(/<\/system-reminder>/g) || []).length === 2 && /took over your browser/.test(c2) && H.sessionStatus.pendingNotices(H.key).length === 0 && !/context trimmed/.test(c2) && !c2.includes('</vibespace-jobs-update>'),
      '…the next prompt carries both notices whole (the takeover\'s "wait for the handback" among them) and consumes them; the update does not repeat');
  } finally { H.done(); }
  // (b) three groups: the head alone passes the cap (accepted — the group markers advance, the trim names show --full); every consumer waits
  const T = rigR7({ groups: 3, n: 25, settings: fillFor({ groups: 3, n: 25 }, { leave: -400 }) });   // rule pressure: the head 400 B past the cap
  try {
    T.notice('status-override'); T.events(8);
    const c1 = T.get('/api/agent/prompt-context');
    const w = { trimmed: /context trimmed/.test(c1), pending: T.sessionStatus.pendingNotices(T.key).length, seenTs: T.s._jobsEventsSeenTs, groupsSeen: Object.keys(T.s._groupSeenAt).length, waits: T.logs.filter((l) => /waits? for the next prompt/.test(l)).length };
    ok(w.trimmed && w.pending === 1 && w.seenTs === undefined && w.groupsSeen === 3 && w.waits === 2, 'three groups + a preamble sized 400 B past the cap (the head trimmed by design): the notice and the jobs update both wait UNCONSUMED — the marker has not moved, the queue is whole (was: both consumed and cut)', w);
    const c2 = T.get('/api/agent/prompt-context');
    ok(/<\/system-reminder>/.test(c2) && c2.includes('</vibespace-jobs-update>') && c2.includes('item-0') && /\+\d+ more — vibespace-job list/.test(c2) && T.sessionStatus.pendingNotices(T.key).length === 0 && T.s._jobsEventsSeenTs > 0 && !/context trimmed/.test(c2), '…the next (quiet) prompt carries the notice and the update (whole under its own 600 B budget: the first lines + "+N more"), and consumes them', { bytes: B(c2) });
  } finally { T.done(); }
  // (c) the manager intro on both routes: two groups leave no room — it waits UNSTAMPED, rides the next prompt whole
  for (const route of ['/api/agent/task-context', '/api/agent/prompt-context']) {
    const M = rigR7({ groups: 2, n: 25, manager: true, settings: managerSettings(route) });   // rule pressure: half the manager intro left
    try {
      const c1 = M.get(route); const seen1 = M.s._mgrIntroSeen;
      const c2 = M.get('/api/agent/prompt-context');
      ok(!c1.includes('<vibespace-group-manager>') && !/context trimmed/.test(c1) && seen1 !== true && M.logs.some((l) => /the manager intro \(\d+ B\) waits/.test(l)), `${route}: the manager intro does not fit beside two groups' context — not pushed, NOT stamped, the wait said (was: stamped seen, cut mid-verb)`, { in: c1.includes('<vibespace-group-manager>'), seen1, trimmed: /context trimmed/.test(c1) });
      ok(c2.includes('</vibespace-group-manager>') && M.s._mgrIntroSeen === true && !/context trimmed/.test(c2), '…and rides the next prompt whole, stamped then', { seen: M.s._mgrIntroSeen });
    } finally { M.done(); }
  }
  // (d) the tools intro beside a preamble sized to leave half of it (no group): the intro waits unstamped, the preamble rides; the next prompt carries the intro whole
  for (const [backend, first] of [['codex', '/api/agent/prompt-context'], ['claude', '/api/agent/task-context']]) {
    const P = rigR7({ backend, groups: 0, settings: introFill(backend, first) });   // rule pressure: half the intro left beside the preamble
    try {
      const c1 = P.get(first); const seen1 = P.s._toolsIntroSeen;
      const c2 = P.get('/api/agent/prompt-context');
      ok(c1.includes('</vibespace-user-instructions>') && !c1.includes('<vibespace-session-tools>') && seen1 !== true && !/context trimmed/.test(c1) && P.logs.some((l) => /the tools intro \(\d+ B\) waits/.test(l)),
        `${backend} ${first.split('/').pop()}: a preamble sized by rule (cap − head − half the intro) + the intro cross the cap — the preamble rides, the intro WAITS unstamped (was: the intro's tail cut, stamped seen)`, { seen1, bytes: B(c1) });
      ok(c2.startsWith('<vibespace-session-tools>') && c2.includes('</vibespace-session-tools>') && P.s._toolsIntroSeen === true && !/context trimmed/.test(c2), '…the next prompt carries the intro whole and stamps it');
    } finally { P.done(); }
  }
  // (e) a 2 000-char preamble: both fit — one prompt, unchanged (2 400 until the 2.369.202 integration: the Design window's
  // intro line + lane browser-recipes' login clause grew the intro to ~6.9 KB; a 2 400-char preamble now WAITS the intro, (d)'s rule)
  const Q = rigR7({ backend: 'codex', groups: 0, settings: { 'agents.injectPreamble': 'p'.repeat(2000) } });
  try { const c = Q.get('/api/agent/prompt-context'); ok(c.includes('</vibespace-user-instructions>') && c.includes('</vibespace-session-tools>') && Q.s._toolsIntroSeen === true && !/context trimmed/.test(c) && B(c) <= AR.INLINE_CAP - AR.INLINE_TAIL_MARGIN, 'a 2 000-char preamble + the intro fit one prompt (unchanged)'); } finally { Q.done(); }
}
{
  // CONTROL (lane prompt-budget, 2.369.227): the rule pressure is load-bearing and follows the head. The literal (d) used
  // before — a 3 000-char preamble beside "the 6.4 KB intro" — goes RED on this tree (the halved intro fits beside it);
  // on the base's module (189aadbb0: the old intro restored) the literal and the rule both hold. SKIP with evidence where
  // the ref is unavailable (a depth-1 checkout).
  const PC = '/api/agent/prompt-context';
  const waits = (routesMod, settings) => { const P = rigR7({ backend: 'codex', groups: 0, routesMod, settings }); try { const c1 = P.get(PC); return c1.includes('</vibespace-user-instructions>') && !c1.includes('<vibespace-session-tools>') && P.s._toolsIntroSeen !== true && !/context trimmed/.test(c1); } finally { P.done(); } };
  const literal = { 'agents.injectPreamble': 'p'.repeat(3000) };
  ok(waits(AR, introFill('codex', PC)) && !waits(AR, literal), 'CONTROL the old literal (a 3 000-char preamble) beside the halved intro: the intro rides — the "waits" judge goes RED; the rule-sized fill holds it');
  let oldSrc = null; try { oldSrc = require('node:child_process').execFileSync('git', ['-C', REPO, 'show', '189aadbb0:src/agent-routes.js'], { encoding: 'utf-8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { oldSrc = null; }
  if (oldSrc) {
    const OLD = mutantCopies('stash-strip-old-intro', REPO).load('src/agent-routes.js', oldSrc, 'old-intro');
    const big = B(OLD.sessionToolsIntro({ status: true, ask: true, task: true, jobs: true }, {}));
    ok(big > 6000 && waits(OLD, literal) && waits(OLD, introFill('codex', PC, OLD)), `CONTROL …on the base's module (the old ${big} B intro restored) the literal and the rule-sized fill both make it wait (the rule follows the head)`);
  } else console.log('  (old-intro control SKIPPED: `git show 189aadbb0` is not available in this checkout)');
}
{
  // ── 3. THE CODEX SessionStart DOOR ──
  const H = rigR7({ backend: 'codex', groups: 1, n: 5 });
  try {
    for (let i = 0; i < 3; i++) H.deliver.stashFor(H.cid, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: `lark-${i} END-${i}`, ts: 1000 + i });
    H.jm._stashNotif(H.cid, { id: 'j1', name: 'nightly', state: 'done' }, { what: 'result-1 ok' }, 'not reachable');
    H.notice('status-override');
    const ss = H.get('/api/agent/task-context');   // the codex app-server's SessionStart hook — its answer is dropped
    ok(ss === '' && H.deliver.stashCount(H.cid) === 3 && H.jm.peekNotifs(H.cid).length === 1 && H.cards.length === 0 && H.sessionStatus.pendingNotices(H.key).length === 1 && !H.s._groupSeenAt,
      'codex SessionStart (task-context): an EMPTY answer — nothing rendered, drained, stamped or consumed (was: three channel messages + a job result drained into a 7.6 KB answer the app-server drops, four cards shown)');
    const p1 = H.get('/api/agent/prompt-context');   // the wrapper's first prompt — the delivery
    ok(['END-0', 'END-1', 'END-2', 'result-1'].every((t) => p1.includes(t)) && p1.includes('<vibespace-task-context>') && H.deliver.stashCount(H.cid) === 0 && H.cards.length === 4, '…the wrapper\'s first prompt carries the full context, all three messages and the job result (four cards)');
  } finally { H.done(); }
  const K = rigR7({ backend: 'claude', groups: 1, n: 5 });
  try { K.deliver.stashFor(K.cid, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'lark END-0', ts: 1000 }); const ss = K.get('/api/agent/task-context'); ok(ss.includes('<vibespace-task-context>') && ss.includes('END-0') && K.deliver.stashCount(K.cid) === 0, 'claude SessionStart is unchanged: the context and the stash ride it'); } finally { K.done(); }
}
{
  // ── 4. THE HOOK NAMES ITS EVENT; A DEAD CALL TOUCHES NOTHING ──
  const H = rigR7({ backend: 'codex', groups: 1, n: 5, mode: 'chat' });
  try {
    H.get('/api/agent/prompt-context');   // the codex first prompt (the wrapper)
    const wrapper = H.get('/api/agent/prompt-context');   // turn 2, the wrapper's call
    H.deliver.stashFor(H.cid, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'arrived in the window END-W', ts: 2001 });
    H.notice('browser-takeover'); H.events(1);
    const hook = H.get('/api/agent/prompt-context', { 'x-vibespace-hook-event': 'UserPromptSubmit' });   // the app-server's hook ~100 ms later, output dropped
    const next = H.get('/api/agent/prompt-context');   // turn 3, the wrapper
    ok(hook === '' && H.cards.length === 1 && ['END-W', 'took over your browser', 'item-0'].every((t) => next.includes(t)) && H.deliver.stashCount(H.cid) === 0 && H.sessionStatus.pendingNotices(H.key).length === 0,
      'codex chat: the hook\'s UserPromptSubmit call answers EMPTY and touches nothing — the peer line, the takeover notice and the job event that arrived in the window ride the wrapper\'s next call (was: drained by the hook into nothing)', { hook: hook.length, next: next.length });
    const again = H.get('/api/agent/prompt-context', { 'x-vibespace-hook-event': 'UserPromptSubmit' });
    ok(again === '' && wrapper.includes('<vibespace-reminder>'), 'a hook call with nothing waiting is empty too; the wrapper\'s quiet call keeps its reminder');
  } finally { H.done(); }
  const T = rigR7({ backend: 'codex', groups: 1, n: 5, mode: 'terminal' });
  try { const a = T.get('/api/agent/prompt-context', { 'x-vibespace-hook-event': 'UserPromptSubmit' }); ok(a.includes('<vibespace-task-context>'), 'a codex TERMINAL session (no wrapper stands in) keeps the hook path'); } finally { T.done(); }
  const C = rigR7({ backend: 'claude', groups: 1, n: 5 });
  try { C.get('/api/agent/task-context'); C.notice('status-override'); const a = C.get('/api/agent/prompt-context', { 'x-vibespace-hook-event': 'UserPromptSubmit' }); C.notice('status-override'); const b = C.get('/api/agent/prompt-context'); ok(a === b && /<\/system-reminder>/.test(a), 'claude: the header changes nothing — the same answer with and without it'); } finally { C.done(); }
  // the REAL hook script sends the header (both events), and the generator's template is the tracked file
  const http = require('node:http'); const { spawn } = require('node:child_process');
  const seen = [];
  const srv = http.createServer((req, res) => { seen.push([req.url, req.headers['x-vibespace-hook-event'] || null]); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ success: true, context: '' })); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  for (const ev of ['SessionStart', 'UserPromptSubmit']) await new Promise((resolve) => { const p = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-hook.mjs')], { env: { ...process.env, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_x' }, stdio: ['pipe', 'pipe', 'pipe'] }); p.on('close', () => resolve()); p.stdin.end(JSON.stringify({ hook_event_name: ev, session_id: 'abc', prompt: 'hi' })); });
  srv.close();
  ok(JSON.stringify(seen) === JSON.stringify([['/api/agent/task-context', 'SessionStart'], ['/api/agent/prompt-context', 'UserPromptSubmit']]), 'the REAL hook script names its event on both calls (X-VibeSpace-Hook-Event)', seen);
  const gen = read('src/server/agent-tool-generators.js'); const i0 = gen.indexOf('const script = `#!/usr/bin/env node\n// vibespace-hook'); const i1 = gen.indexOf('`;\n  fs.writeFileSync(HOOK_CMD, script', i0);
  ok(i0 > 0 && i1 > i0 && gen.slice(i0 + 'const script = `'.length, i1) === read('data/bin/vibespace-hook.mjs'), 'the generator\'s template IS the tracked hook script, byte for byte (it is regenerated at every boot)');
}
{
  // ── 5. THE ORDER (r7 vs r5): the sections stand where they always stood; where the fit decisions coincide the bytes are identical ──
  const tags = ['<vibespace-reminder>', '<vibespace-user-instructions>', '<vibespace-cwd-notice>', '<vibespace-delivery-note>', '<vibespace-task-context>', '<vibespace-task-update>', '<vibespace-session-tools>', '<vibespace-group-manager>', '<vibespace-jobs-missed-while-away>', '<vibespace-jobs-update>', '### Messages that arrived', '<system-reminder>', 'Clean up before parking more'];
  const orderOf = (c) => tags.map((t) => [t, c.indexOf(t)]).filter(([, i]) => i >= 0).sort((x, y) => x[1] - y[1]).map(([t]) => t);
  const run = (routesMod, shape) => {
    const H = rigR7({ backend: 'claude', groups: shape.groups, n: shape.n, routesMod, settings: { 'agents.injectPreamble': shape.fillChars ? 'p'.repeat(shape.fillChars) : 'standing instructions '.repeat(shape.pre || 0), 'agents.perTurnExtra': shape.extra ? 'per-turn extra line' : '', 'agents.allowGroupManagement': !!shape.manager }, manager: !!shape.manager });
    const D = Date.now; Date.now = () => 1790000000000;
    try {
      if (shape.sessionStart) H.get('/api/agent/task-context');
      if (shape.diff) { for (const g of H.gids) H.s._groupSeenAt[g] -= 10; H.store.update(H.gids[0], { objective: '目标改写 '.repeat(20) }); }
      if (shape.notice) { H.notice('status-override'); H.notice('browser-takeover'); }
      if (shape.events) H.events(shape.events);
      if (shape.notifs) for (let i = 0; i < shape.notifs; i++) H.jm._stashNotif(H.cid, { id: 'j' + i, name: 'nightly', state: 'done' }, { what: `result-${i}` }, 'not reachable');
      if (shape.stash) for (let i = 0; i < shape.stash; i++) H.deliver.stashFor(H.cid, { source: i % 2 ? 'agent' : 'channel', kind: i % 2 ? 'peer' : 'notification', fromName: i % 2 ? 'Ada' : 'Channels · Lark', text: `m${i} ` + 'y'.repeat(shape.pad || 200), ts: 1000 + i });
      if (shape.cwd) H.s._cwdRecreated = true;
      return H.get('/api/agent/prompt-context').split(H.dir).join('<DIR>');
    } finally { Date.now = D; H.done(); }
  };
  const shapes = {
    full: { groups: 2, n: 3, pre: 3, extra: true, notice: true, events: 1, stash: 2, pad: 60, cwd: true },
    diff: { groups: 1, n: 5, pre: 3, extra: true, notice: true, events: 3, notifs: 3, stash: 4, sessionStart: true, diff: true },
    quiet: { groups: 1, n: 5, notice: true, events: 3, stash: 4, sessionStart: true },
    manager: { groups: 1, n: 5, extra: true, notice: true, events: 2, notifs: 2, stash: 3, manager: true, pad: 60 },
    reminder: { groups: 1, n: 5, sessionStart: true },
  };
  // RULE PRESSURE (lane prompt-budget): the manager shape's room ahead of the drains sits between the stash's need and the
  // jobs digest's budget — measured on a twin of the shape (no stashed job notifications, a 1-char preamble)
  {
    const tw = run(AR, { ...shapes.manager, notifs: 0, fillChars: 1 });
    const i0 = tw.indexOf('### Messages that arrived'), i1 = tw.indexOf('<system-reminder>');
    const S = B(tw.slice(i0, i1)), ahead = B(tw) - S;
    const R = Math.floor((S + AR.JOBS_DIGEST_BUDGET + 2) / 2);
    if (i0 < 0 || i1 < i0 || S >= AR.JOBS_DIGEST_BUDGET) throw new Error(`the manager twin: no stash section or one over the digest budget (${S} B)`);
    shapes.manager.fillChars = AR.INLINE_CAP - AR.INLINE_TAIL_MARGIN - R - ahead + 1;
  }
  const now = Object.fromEntries(Object.entries(shapes).map(([k, sh]) => [k, run(AR, sh)]));
  ok(orderOf(now.full).join(' → ') === '<vibespace-reminder> → <vibespace-user-instructions> → <vibespace-cwd-notice> → <vibespace-task-context> → <vibespace-jobs-update> → ### Messages that arrived → <system-reminder>'
    && orderOf(now.diff).join(' → ') === '<vibespace-reminder> → <vibespace-jobs-missed-while-away> → <vibespace-jobs-update> → ### Messages that arrived → <system-reminder>'
    && orderOf(now.quiet).join(' → ') === '<vibespace-jobs-update> → ### Messages that arrived → <system-reminder>'
    && orderOf(now.manager).join(' → ') === '<vibespace-reminder> → <vibespace-user-instructions> → <vibespace-task-context> → <vibespace-group-manager> → <vibespace-jobs-update> → ### Messages that arrived → <system-reminder>'
    && now.reminder.startsWith('<vibespace-reminder>') && Object.values(now).every((c) => !/context trimmed/.test(c) && B(c) <= AR.INLINE_CAP),
    'THE ORDER: extra → preamble → cwd notice → context/diff → tools/manager intro → jobs missed → jobs update → stash → notices → nudge — on the full, diff, quiet, manager and reminder shapes; nothing trimmed', Object.fromEntries(Object.entries(now).map(([k, c]) => [k, orderOf(c).join(' → ')])));
  // r5's own module (the branch's pre-r6 tip): byte-identical where every producer fits — SKIP with evidence where the ref is unavailable (a depth-1 checkout)
  let r5src = null; try { r5src = require('node:child_process').execFileSync('git', ['-C', REPO, 'show', '280ccd2e:src/agent-routes.js'], { encoding: 'utf-8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { }
  if (r5src) {
    const MUTO = mutantCopies('stash-strip-r7-order', REPO);
    const R5 = MUTO.load('src/agent-routes.js', r5src, 'r5');
    const then = Object.fromEntries(Object.entries(shapes).map(([k, sh]) => [k, run(R5, sh)]));
    // lane artifacts-prompt-hint: r5's calls predate `fileTools`, so its Artifacts sentence is the UNNAMED one — that one delta is folded before the identity
    // lane foryou-attachments: the ask segment now names `[--artifact <path|/p/id>…]` (the brief: the reminder mentions it) — folded the same way
    const unnamed = (c) => c.replace(/Use your file tools \([^)\n]*\) for files/g, 'Use your file tools for files').split('vibespace-ask "q" [--artifact <path|/p/id>…] — ').join('vibespace-ask "q" — ');
    const same = Object.keys(shapes).filter((k) => then[k] === unnamed(now[k]));
    const common = (k) => { const a = orderOf(then[k]), b = orderOf(now[k]); const both = a.filter((t) => b.includes(t)); return a.filter((t) => both.includes(t)).join() === b.filter((t) => both.includes(t)).join(); };
    ok(same.includes('full') && same.includes('diff') && same.includes('quiet') && same.includes('reminder') && Object.keys(shapes).every(common) && orderOf(then.manager).includes('<vibespace-jobs-missed-while-away>') && !orderOf(now.manager).includes('<vibespace-jobs-missed-while-away>'),
      `r5's module on the same stores: byte-identical on the full / diff / quiet / reminder shapes; the manager shape differs only by r6's fit decisions (r5 drained the jobs digest with the tail uncounted, r7 holds it) — every section that rides both stands in the same order`, { same, manager: [B(then.manager), B(now.manager)] });
  } else console.log('  (r5 byte-identity SKIPPED: `git show 280ccd2e` is not available in this checkout — the order pins above stand on their own)');
}
{
  // ── 6. THE BOOT: the stores load synchronously at create, before the server listens and before any session is restored ──
  const sj = read('server.js');
  const iDeliver = sj.indexOf("const deliver = require('./src/server/conversation-deliver.js').create("), iView = sj.indexOf("const stashView = require('./src/server/stash-handover.js').create("), iListen = sj.indexOf('server.listen(PORT, HOST'), iRestore = sj.indexOf('restoreSessions();', iListen);
  ok(iDeliver > 0 && iView > iDeliver && iListen > iView && iRestore > iListen && /const file = dataDir \? path\.join\(dataDir, DELIVERED_FILE\) : null;\n  if \(file\) \{\n    let raw = null;\n    try \{ raw = fs\.readFileSync\(file, 'utf-8'\); \}/.test(read('src/server/stash-handover.js')) && /try \{ stash = JSON\.parse\(fs\.readFileSync\(stashFile, 'utf-8'\)\) \|\| \{\}; \} catch \{ \}/.test(read('src/server/conversation-deliver.js')),
    'THE BOOT ORDER: the ladder\'s stash and the hand-over memory are read synchronously at create, both before server.listen, and restoreSessions runs inside the listen callback — a first prompt at boot+1 s finds either a restored session (drained once, persisted synchronously) or no session (401, nothing touched)');
  // a restored session: the stash on disk from a previous process, the first prompt drains it ONCE, the second carries nothing
  const H = rigR7({ groups: 1, n: 5 });
  try {
    H.deliver.stashFor(H.cid, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'from before the restart END-R', ts: 1000 });
    H.deliver.flush(); const file = path.join(H.dir, 'msg-stash.json'); const onDisk = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    // a NEW process over the same data dir: the stores re-read the disk
    const d2 = CD.create({ dataDir: H.dir, activeSessions: H.sessions, serverSetting: () => undefined, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) }, emitPeerCard: () => {}, log: () => {} });
    ok(onDisk.includes('END-R') && d2.stashCount(H.cid) === 1, 'the entry is on disk before any prompt (the stash write is synchronous), and a new process over the same dir loads it');
    const p1 = H.get('/api/agent/prompt-context'), p2 = H.get('/api/agent/prompt-context');
    const left = (JSON.parse(fs.readFileSync(file, 'utf-8'))[H.cid] || []).length;
    ok(p1.includes('END-R') && !p2.includes('END-R') && H.deliver.stashCount(H.cid) === 0 && left === 0, 'the first prompt drains it once and the drain is on disk at once (no debounce on a drain); the second prompt carries nothing', { left });
  } finally { H.done(); }
}
{
  // ── r7 NEGATIVE CONTROLS ──
  const MUT7 = mutantCopies('stash-strip-r7', REPO);
  const ar = read('src/agent-routes.js');
  // (i) an UNCOUNTED producer after the drains: the census goes red AND the sweep trims
  const a1 = "        const pmText = drainStashUnderCap(deliver, caller2.conversationId, aheadOfDrains());\n        if (pmText) parts.push(pmText);\n";
  if (!ar.includes(a1)) throw new Error('mutation anchor missing: stash push');
  const extraSrc = ar.replace(a1, a1 + "        parts.push('<vibespace-r7-uncounted>' + 'u'.repeat(700) + '</vibespace-r7-uncounted>');\n");
  const c = producerCensus(extraSrc);
  ok(c.undecided.length === 1 && /vibespace-r7-uncounted/.test(c.undecided[0].arg), 'CONTROL an uncounted producer appended after the drains: the census names it UNDECIDED (②h can go red)', c.undecided);
  const Extra = MUT7.load('src/agent-routes.js', extraSrc, 'uncounted');
  const t0 = tailSweep(Extra, [3000]);
  ok(t0.trimmed > 100, `CONTROL …and the sweep shows it: ${t0.trimmed} of 400 fills trimmed by capInline`, t0);
  // (ii) the notices consumed BEFORE the fit (r6's form): the restart shape loses the takeover notice
  const a2 = "      if (taken) {\n        const byKey = new Map();\n";
  if (!ar.includes(a2)) throw new Error('mutation anchor missing: notice fit');
  const Early = MUT7.load('src/agent-routes.js', ar.replace(a2, "      taken = queue.length;   // every notice consumed whether it fits or not (r6's form)\n      if (taken) {\n        const byKey = new Map();\n"), 'consume-first');
  const H = rigR7({ groups: 2, n: 25, routesMod: Early, settings: restartSettings() });
  try { H.notice('status-override'); H.notice('browser-takeover'); H.events(8); const c1 = H.get('/api/agent/prompt-context'); const c2 = H.get('/api/agent/prompt-context');
    ok(/context trimmed/.test(c1) && H.sessionStatus.pendingNotices(H.key).length === 0 && !/took over your browser/.test(c1) && !/took over your browser/.test(c2), 'CONTROL the notices consumed before their fit: the restart\'s first prompt is trimmed, the takeover notice is consumed and gone from both prompts (②h can go red)'); } finally { H.done(); }
  // (iii) the manager intro stamped before its fit
  const a3 = "      if (fits(MANAGER_INTRO)) { parts.push(MANAGER_INTRO); s._mgrIntroSeen = true; }";
  if (!ar.includes(a3)) throw new Error('mutation anchor missing: manager fit');
  const Mgr = MUT7.load('src/agent-routes.js', ar.replace(a3, "      if (true) { parts.push(MANAGER_INTRO); s._mgrIntroSeen = true; }"), 'manager-unfit');
  const M = rigR7({ groups: 2, n: 25, manager: true, settings: managerSettings('/api/agent/prompt-context'), routesMod: Mgr });
  try { const c1 = M.get('/api/agent/prompt-context'); const c2 = M.get('/api/agent/prompt-context'); ok(/context trimmed/.test(c1) && !c1.includes('</vibespace-group-manager>') && M.s._mgrIntroSeen === true && !c2.includes('<vibespace-group-manager>'), 'CONTROL the manager intro stamped before its fit: cut mid-verb on the first prompt, never again (②h can go red)'); } finally { M.done(); }
  // (iv) the codex SessionStart door removed: the stash drains into the dropped answer
  const a4 = "    if (!honoursSessionStart(s)) return res.json({ success: true, context: '' });\n";
  if (!ar.includes(a4)) throw new Error('mutation anchor missing: SessionStart door');
  const NoDoor = MUT7.load('src/agent-routes.js', ar.replace(a4, "    if (false && !honoursSessionStart(s)) return res.json({ success: true, context: '' });\n"), 'no-ss-door');
  const X = rigR7({ backend: 'codex', groups: 1, n: 5, routesMod: NoDoor });
  try { for (let i = 0; i < 3; i++) X.deliver.stashFor(X.cid, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: `lark-${i} END-${i}`, ts: 1000 + i }); const ss = X.get('/api/agent/task-context'); const p1 = X.get('/api/agent/prompt-context');
    ok(ss.includes('END-2') && X.deliver.stashCount(X.cid) === 0 && X.cards.length === 3 && !p1.includes('END-2'), 'CONTROL the SessionStart door removed: codex\'s SessionStart drains all three into the answer the app-server drops, three cards, the wrapper\'s first prompt carries none (②h can go red)'); } finally { X.done(); }
  // (v) the hook door removed: the hook's dead call drains the window's arrival
  const a5 = "  if (hookOriginated(req) && !hookOutputHonoured(hit[0])) return res.json({ success: true, context: '' });\n";
  if (!ar.includes(a5)) throw new Error('mutation anchor missing: hook door');
  const NoHook = MUT7.load('src/agent-routes.js', ar.replace(a5, "  if (false && hookOriginated(req) && !hookOutputHonoured(hit[0])) return res.json({ success: true, context: '' });\n"), 'no-hook-door');
  const Y = rigR7({ backend: 'codex', groups: 1, n: 5, routesMod: NoHook });
  try { Y.get('/api/agent/prompt-context'); Y.get('/api/agent/prompt-context'); Y.deliver.stashFor(Y.cid, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'in the window END-W', ts: 2001 }); const hook = Y.get('/api/agent/prompt-context', { 'x-vibespace-hook-event': 'UserPromptSubmit' }); const next = Y.get('/api/agent/prompt-context');
    ok(hook.includes('END-W') && !next.includes('END-W') && Y.deliver.stashCount(Y.cid) === 0, 'CONTROL the hook door removed: the hook\'s call drains the window\'s arrival, the wrapper\'s next call carries nothing (②h can go red)'); } finally { Y.done(); }
  for (const c of copiesCensus(MUT7.files, MUT7.dir, REPO, { minCopies: 5, label: '②h ' })) ok(c.pass, c.name, c.detail);
}

// ═══ ②i VERIFY r8 — every queued notice record is a POSITION: a record this build cannot render (a kind a newer build wrote before a rollback) at the head of the queue ═══
console.log('②i verify r8: an unrenderable notice at the head of the queue is a position — the renderable ones the fit admitted ride on the SAME prompt, the record is dropped by name; control: r7\'s queue that skipped it (the status-override slid a prompt)');
{
  const seedUnknown = (H) => { const rec = H.sessionStatus._state.statuses[H.key] || (H.sessionStatus._state.statuses[H.key] = { state: null, urgency: null, reason: null, setBy: null, at: Date.now(), pendingNotices: [] }); rec.pendingNotices.push({ kind: 'browser-future-kind', at: 1 }); };   // the persisted shape a newer build leaves: pushNotice refuses it, the file does not
  const H = rigR7({ groups: 0 });
  try {
    seedUnknown(H); H.notice('browser-takeover'); H.notice('status-override');
    const p1 = H.get('/api/agent/prompt-context'); const p2 = H.get('/api/agent/prompt-context');
    ok(/took over your browser/.test(p1) && /manually changed/.test(p1) && H.sessionStatus.pendingNotices(H.key).length === 0 && !/took over your browser|manually changed/.test(p2),
      'an unrenderable record at the head: the takeover AND the status-override ride the first prompt whole, the queue is empty, the second prompt carries neither (was: the count landed on the unknown record — the status-override slid to the next prompt)', { p1: p1.length, left: H.sessionStatus.pendingNotices(H.key).length });
    ok(H.warns.some((w) => /unknown kind "browser-future-kind"/.test(w)), 'the dropped record is named in the log (kind + "cannot be rendered by this build")', H.warns);
    seedUnknown(H); const p3 = H.get('/api/agent/prompt-context');
    ok(!/<system-reminder>/.test(p3) && H.sessionStatus.pendingNotices(H.key).length === 0, 'a queue of ONLY an unrenderable record: consumed (the record does not poison the key), nothing rides');
  } finally { H.done(); }
  // CONTROL: r7's queue (the unrenderable record skipped, the count over positions) — the slide reproduces
  const MUT8 = mutantCopies('stash-strip-r8', REPO);
  const ar8 = read('src/agent-routes.js');
  const a8 = "{ const t = SessionStatusManager.renderNotice(n); queue.push({ k, text: t || '' }); if (!t) console.warn(";
  if (!ar8.includes(a8)) throw new Error('mutation anchor missing: notice positions');
  const Skip = MUT8.load('src/agent-routes.js', ar8.replace(a8, "{ const t = SessionStatusManager.renderNotice(n); if (!t) continue; queue.push({ k, text: t || '' }); if (!t) console.warn("), 'skip-unrenderable');
  const K = rigR7({ groups: 0, routesMod: Skip });
  try {
    seedUnknown(K); K.notice('browser-takeover'); K.notice('status-override');
    const p1 = K.get('/api/agent/prompt-context'); const p2 = K.get('/api/agent/prompt-context');
    ok(/took over your browser/.test(p1) && !/manually changed/.test(p1) && /manually changed/.test(p2), 'CONTROL the unrenderable record skipped from the queue: the status-override the fit admitted slides to the second prompt (②i can go red)');
  } finally { K.done(); }
  for (const c of copiesCensus(MUT8.files, MUT8.dir, REPO, { minCopies: 1, label: '②i ' })) ok(c.pass, c.name, c.detail);
}

// ═══ ②j VERIFY r8 — THE EXACTLY-ONCE WALK: random producers × random head sizes × random callers × restarts, on the REAL routes ═══
console.log('②j verify r8: a seeded walk over both routes — every stash entry / job notification / notice that leaves its store is WHOLE in the answer of the call that took it and in no other; a dead call touches nothing; a trimmed answer consumed nothing; a stamp only on a whole intro; control: r6\'s consume-first notices');
{
  /** The walk: returns the count of exactly-once violations (0 on the real module). */
  const walk = (routesMod, seed0, steps) => {
    let seed = seed0; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    let fails = 0, calls = 0, trimmed = 0; const why = [];
    const fail = (m, d) => { fails++; if (why.length < 3) why.push(m + ' ' + JSON.stringify(d).slice(0, 160)); };
    for (const [backend, mode] of [['claude', 'chat'], ['claude', 'terminal'], ['codex', 'chat'], ['codex', 'terminal']]) {
      const groups = pick([0, 1, 2, 3]);
      const R = rigR7({ backend, mode, groups, n: pick([3, 10, 25]), routesMod, settings: rnd() < 0.5 ? { 'agents.injectPreamble': 'p'.repeat(pick([0, 1500, 3000, 3900])), 'agents.perTurnExtra': rnd() < 0.5 ? 'e'.repeat(400) : '' } : {}, manager: rnd() < 0.3, cid: `c0ffee00-0000-4000-8000-0000000${backend === 'codex' ? '1' : '0'}${mode === 'chat' ? '1' : '0'}a8` });
      try {
        const rode = new Map(); const live = new Set(); let tok = 0; const T = (p) => `${p}-${++tok}`;
        const inStore = (t) => (t.startsWith('STASH') && R.deliver.stashEntries(R.cid).some((e) => e.text.includes(t))) || (t.startsWith('NOTIF') && R.jm.peekNotifs(R.cid).some((n) => JSON.stringify(n).includes(t))) || (t.startsWith('NOTICE') && R.sessionStatus.pendingNotices(R.key).some((n) => JSON.stringify(n).includes(t)));
        for (let step = 0; step < steps; step++) {
          const act = rnd();
          if (act < 0.18) { const t = T('STASH'); live.add(t); R.deliver.stashFor(R.cid, { source: pick(['channel', 'agent']), kind: pick(['notification', 'peer']), fromName: 'Ada', text: t + ' ' + 'x'.repeat(Math.floor(rnd() * 900)), ts: Date.now() }); }
          else if (act < 0.26) { const t = T('NOTIF'); live.add(t); R.jm._stashNotif(R.cid, { id: 'j' + tok, name: 'job' + tok, state: 'done' }, { what: t + ' ' + 'w'.repeat(Math.floor(rnd() * 300)) }, 'not reachable'); }
          else if (act < 0.36) { const t = T('NOTICE'); live.add(t); R.sessionStatus.pushNotice(R.key, { kind: 'status-override', agent: { state: 'working', urgency: 'normal', reason: t }, user: { state: 'blocked', urgency: 'high' } }); }
          else if (act < 0.42 && groups) { R.store.update(R.gids[Math.floor(rnd() * groups)], { objective: 'objective ' + 'o'.repeat(Math.floor(rnd() * 4000)) + ' ' + T('OBJ') }); }
          else if (act < 0.46) { R.events(1); }
          else if (act < 0.50) { for (const k of Object.keys(R.s)) if (k.startsWith('_')) delete R.s[k]; }   // a RESTART: every memory marker gone, the stores stay
          else {
            const route = rnd() < 0.3 ? 'task-context' : 'prompt-context'; const hook = rnd() < 0.5;
            for (const t of [...live]) if (!inStore(t)) live.delete(t);   // a CAP evicted it between calls (the stores are bounded by design) — not a route's doing
            const before = JSON.stringify({ a: R.deliver.stashCount(R.cid), b: R.jm.peekNotifs(R.cid).length, c: R.sessionStatus.pendingNotices(R.key).length, d: R.s._jobsEventsSeenTs, e: !!R.s._toolsIntroSeen, f: !!R.s._mgrIntroSeen });
            const wasIntro = !!R.s._toolsIntroSeen, wasMgr = !!R.s._mgrIntroSeen;
            const ctx = R.get('/api/agent/' + route, hook ? { 'x-vibespace-hook-event': route === 'task-context' ? 'SessionStart' : 'UserPromptSubmit' } : {});
            calls++;
            const after = JSON.stringify({ a: R.deliver.stashCount(R.cid), b: R.jm.peekNotifs(R.cid).length, c: R.sessionStatus.pendingNotices(R.key).length, d: R.s._jobsEventsSeenTs, e: !!R.s._toolsIntroSeen, f: !!R.s._mgrIntroSeen });
            const dead = (route === 'task-context' && backend === 'codex') || (route === 'prompt-context' && hook && backend === 'codex' && mode === 'chat');
            if (dead) { if (ctx !== '' || before !== after) fail('a dead call touched something', { backend, mode, route, hook }); continue; }
            if (B(ctx) > AR.INLINE_CAP) fail('over the cap', { route, bytes: B(ctx) });
            const isTrim = /context trimmed to stay inline/.test(ctx); let rodeNow = 0;
            for (const t of [...live]) {
              let inAns = ctx.includes(t);
              if (!inAns && t.startsWith('NOTIF')) { const m = /(?:Full untruncated history|full history): (\S+)/.exec(ctx); if (m) { try { inAns = fs.readFileSync(m[1], 'utf8').includes(t); } catch { } } }   // the >2-entry digest ELIDES its middle and names the file it spilled it to (job-notifications-read/<cid>.md) — delivered there
              const still = inStore(t);
              if (!still && !inAns) fail('CONSUMED BUT NOT IN THE ANSWER', { t, backend, mode, route, hook, trimmed: isTrim, bytes: B(ctx) });
              if (still && inAns) fail('in the answer but still queued (would ride twice)', { t, route });
              if (inAns) { if (rode.has(t)) fail('RODE TWICE', { t }); rode.set(t, calls); live.delete(t); rodeNow++; }
            }
            if (isTrim) { trimmed++; if (rodeNow) fail('a trimmed answer also consumed items', { rodeNow, route }); }
            if (!!R.s._toolsIntroSeen && !wasIntro && !ctx.includes('</vibespace-session-tools>')) fail('tools intro stamped but not whole', { route });
            if (!!R.s._mgrIntroSeen && !wasMgr && !ctx.includes('</vibespace-group-manager>')) fail('manager intro stamped but not whole', { route });
            if (/<vibespace-jobs-update>/.test(ctx) && !ctx.includes('</vibespace-jobs-update>')) fail('jobs update cut', { route });
            if ((ctx.match(/<system-reminder>/g) || []).length !== (ctx.match(/<\/system-reminder>/g) || []).length) fail('a notice cut', { route });
          }
        }
      } finally { R.done(); }
    }
    return { fails, calls, trimmed, why };
  };
  const real = walk(AR, 8, 500);
  ok(real.fails === 0 && real.calls > 600 && real.trimmed > 20, `the walk on the real routes: ${real.calls} calls (${real.trimmed} with the head alone over the cap), 0 exactly-once violations`, real);
  const real2 = walk(AR, 88, 500);
  ok(real2.fails === 0 && real2.calls > 600, `…a second seed: ${real2.calls} calls, 0 violations`, real2);
  // CONTROL: r6's consume-first notices (every queued notice consumed whether it fits or not) — the walk goes red
  const MUT8b = mutantCopies('stash-strip-r8-walk', REPO);
  const arw = read('src/agent-routes.js');
  const aw = "      if (taken) {\n        const byKey = new Map();\n";
  if (!arw.includes(aw)) throw new Error('mutation anchor missing: notice fit (walk)');
  const EarlyW = MUT8b.load('src/agent-routes.js', arw.replace(aw, "      taken = queue.length;\n      if (taken) {\n        const byKey = new Map();\n"), 'consume-first-walk');
  const ctl = walk(EarlyW, 8, 500);
  ok(ctl.fails > 0 && ctl.why.some((w) => /CONSUMED BUT NOT IN THE ANSWER|a notice cut/.test(w)), `CONTROL the notices consumed before their fit: the same walk finds ${ctl.fails} violation(s) (②j can go red)`, ctl.why);
  for (const c of copiesCensus(MUT8b.files, MUT8b.dir, REPO, { minCopies: 1, label: '②j ' })) ok(c.pass, c.name, c.detail);
}

// ═══ ②k GROUP MESSAGES WAITING (lane group-report-card; the owner, 2026-09-28: "怎么在那个对话里看不到你发了消息？") ═══
console.log('②k group messages waiting for the next turn: the fact reads the engine\'s PREVIEW (commits nothing), the strip names them with no hand-over button, beside a stash entry the button stays and says what rides the next message; the report\'s commit clears them; a pending fork shows none');
{
  const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
  const GC = require(path.join(REPO, 'src/group-card.js'));
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const dir = scratch('stash-strip-grp-' + Math.random().toString(36).slice(2, 7));
  fs.mkdirSync(dir, { recursive: true });
  const A = 'aaaaaaaa-1111-4000-8000-00000000057a', B = CID2;
  const sB = { name: 'Agent One', backend: 'claude', backendSessionId: B, claudeSessionId: B, mode: 'chat' };
  const sessions = new Map([['w1', sB], ['w2', { name: 'alpha', backend: 'claude', backendSessionId: A, claudeSessionId: A, mode: 'chat' }]]);
  const roster = [{ cid: A, name: 'alpha', groups: ['tg'] }, { cid: B, name: 'Agent One', groups: ['tg'] }];
  const store = createChannelStore({ dir: path.join(dir, 'channels') });
  let reads = 0;
  const readTail0 = store.readTail.bind(store);
  store.readTail = (...a) => { reads++; return readTail0(...a); };
  const published = [], cards = [];
  let view = null, pendingHits = 0;
  const deliver = CD.create({ dataDir: dir, activeSessions: sessions, serverSetting: () => undefined, peerMsg: { findPeer: () => null, postToPeer: async () => ({ ok: false }), postChannelEvent: async () => ({ ok: false }) },
    onStashChange: () => { view && view.changed(); }, emitPeerCard: (c, card) => cards.push(card), log: () => {} });
  const ge = GE.create({ store, deliver, roster: () => roster, groupSetting: () => 'none', log: { info() {}, warn() {}, log() {} }, onPending: () => { pendingHits++; view && view.changed(); } });
  view = SH.create({ activeSessions: sessions, getDeliver: () => deliver, getJobs: () => null, getGroups: () => ge, broadcastSessions: () => published.push(Date.now()), renderMsgStash, renderNotifStash, debounceMs: 20 });
  const made = await ge.create({ by: A, name: 'api lane', members: [B], quiet: true });
  const hits0 = pendingHits;
  await ge.post({ group: made.group.id, from: A, text: 'the deploy is blocked — can you look?\nsecond line' });
  await sleep(60);
  ok(pendingHits > hits0 && published.length >= 1, `a post into a member's group tells the strip (onPending → ONE debounced re-publish of the session list: ${published.length})`, { pendingHits, published: published.length });
  const f = view.summaryFor(sB);
  ok(f && f.count === 1 && f.items.length === 1 && f.items[0].kind === 'group' && f.items[0].label === 'alpha' && f.reachable === false,
    'the fact counts the waiting GROUP message (kind group, by its sender) — and `reachable: false`: a hand-over carries the stash, never a group report', f);
  const w = S.stashSummaryWords(f, tEn, { reachable: f.reachable });
  ok(w.line === '1 notice is waiting for this agent’s next turn: a group message from alpha' && w.noButton === 'they ride the next turn' && /^Group messages ride this agent’s next turn, whoever starts it — your message, a notification, a reply receipt — or at once when a member @mentions it$/.test(w.title) && w.cost === null,
    'the words: "a group message from alpha", no button — "they ride the next turn", the title says how it arrives', w);
  const pv = ge.reportsForTurn(B, { preview: true });
  const pv2 = ge.reportsForTurn(B, { preview: true });
  const reads0 = reads;
  view.summaryFor(sB); view.summaryFor(sB);
  ok(pv.marks.length === 0 && pv.preview === true && pv.pending.length === 1 && pv2 === pv && reads === reads0,
    'PREVIEW commits nothing (no marks handed out) and is memoised: the session list\'s re-publish reads no log twice', { marks: pv.marks.length, same: pv2 === pv, reads: reads - reads0 });
  const e = GC.pendingEntry(pv.pending[0]);
  ok(e.source === 'group' && e.fromName === 'alpha' && e.text === 'alpha · the deploy is blocked — can you look?' && e.ts === pv.pending[0].at,
    'a waiting message as a summary entry: its sender + its first line ("alpha · the deploy is blocked — can you look?" — the Details row after lane-stash-detail\'s previews)', e);
  if (Array.isArray(f.previews)) {   // lane-stash-detail merged: the Details list rows
    const row = f.previews.find((x) => x.kind === 'group');
    ok(!!row && S.previewWords(row, tEn) === 'a group message · alpha · the deploy is blocked — can you look?', 'MERGED WITH lane-stash-detail: the Details list has the group row "a group message · alpha · <first line>"', f.previews);
  }
  // the REAL strip: no button, the sentence where it would be
  const strip = SS.createStashStrip({ sessionId: 'w1' });
  strip.set(f, { turn: 'idle' });
  const q = (c) => strip.el.querySelector('.' + c);
  ok(!strip.el.hidden && q('chat-stash-parts').textContent === ': a group message from alpha' && q('chat-stash-go').hidden === true && q('chat-stash-nobutton').hidden === false && q('chat-stash-nobutton').textContent === 'they ride the next turn',
    'the REAL strip: "a group message from alpha", NO Hand over button (it would refuse "nothing_waiting"), "they ride the next turn" where it would be', strip.el.textContent);
  // B-c198 (the owner 2026-10-02): "they ride the next turn" while the agent is MID-TURN was false — a message typed
  // into a running turn is folded into it with no UserPromptSubmit, so the report waits for the turn after; the words say so
  strip.set(f, { turn: 'running' });
  ok(q('chat-stash-nobutton').textContent === 'this agent is mid-turn — they ride the next turn, after this one ends' && /^This agent is mid-turn — a message typed into a running turn carries no group message/.test(q('chat-stash-nobutton').title),
    'B-c198: MID-TURN the strip says the agent is mid-turn and the messages ride the next turn after this one ends (lane stash-any-turn: a turn of any origin)', strip.el.textContent);
  // verify r1: `waiting` (the harness's requires_action — paused on a permission or a question) is INSIDE the turn: the
  // user's answer continues it with no UserPromptSubmit, so "your next message" was false there too
  strip.set(f, { turn: 'waiting' });
  ok(q('chat-stash-nobutton').textContent === 'this agent is mid-turn — they ride the next turn, after this one ends', 'B-c198 verify r1: WAITING on the user (a permission, a question — still inside the turn) the strip says mid-turn too, never a bare "the next turn"', strip.el.textContent);
  strip.set(f, { turn: 'idle' });
  ok(q('chat-stash-nobutton').textContent === 'they ride the next turn', 'B-c198 CONTROL: the turn ends ⇒ the strip repaints to "they ride the next turn" (the turn is in its patch key)', strip.el.textContent);
  const wm = S.stashSummaryWords({ ...f, count: 2, items: [...f.items, { kind: 'peer', label: 'Bo', n: 1 }] }, tEn, { reachable: true, midTurn: true });
  ok(wm.held === '1 group message rides the next turn, after this one ends', 'B-c198: beside a stash entry, mid-turn, the held words say "after this turn ends" too', wm);
  // beside a stash entry the button stays, and says what it will NOT carry
  deliver.stashFor(B, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'a peer note' });
  const f2 = view.summaryFor(sB);
  ok(f2.count === 2 && f2.reachable === true && f2.items.map((i) => i.kind).join() === 'group,peer', 'beside a stash entry: two waiting, the hand-over exists again', f2);
  strip.set(f2, { turn: 'idle' });
  ok(q('chat-stash-go').hidden === false && q('chat-stash-held').hidden === false && q('chat-stash-held').textContent === '1 group message rides the next turn',
    '…the button stays, and the strip says the group message rides the next turn (a hand-over carries only the stash)', strip.el.textContent);
  const r = await view.handOver('w1');
  ok(r.ok === false && r.code === 'unreachable' && view.summaryFor(sB).items.some((i) => i.kind === 'group'), 'a hand-over never touches the group report (it stays waiting)', r);
  // the report is handed to B's turn ⇒ it leaves the fact, its card is drawn
  const rep = ge.reportsForTurn(B);
  await ge.commitReports(B, rep.marks);
  await sleep(40);
  const f3 = view.summaryFor(sB);
  ok(f3 && f3.count === 1 && f3.items[0].kind === 'peer' && cards.filter((c) => c.kind === 'group').length === 1, 'the report committed into B\'s turn: the group message leaves the fact (its card went through the ladder\'s door)', { f3, cards });
  // a pending fork carries B's id — its strip is not B's
  const fork = { name: 'fork of One', backend: 'claude', backendSessionId: B, claudeSessionId: B, mode: 'chat', _forkRequested: true, _forkSourceId: B };
  await ge.post({ group: made.group.id, from: A, text: 'one more' });
  const ff = view.summaryFor(fork), fb = view.summaryFor(sB);
  ok(!(ff && ff.items.some((i) => i.kind === 'group')) && fb.items.some((i) => i.kind === 'group'), 'a PENDING FORK (it carries its parent\'s id) shows none of the parent\'s group messages; the parent does', { ff, fb });
  // CONTROL: a hand-over module whose fact leaves the groups out — the strip never names them
  const MUTG = mutantCopies('stash-strip-grp', REPO);
  const src = read('src/server/stash-handover.js');
  const ga = "      const groups = groupEntriesOf(s);\n";
  if (!src.includes(ga)) throw new Error('mutation anchor missing: group entries');
  const NoGroups = MUTG.load('src/server/stash-handover.js', src.replace(ga, "      const groups = [];\n"), 'no-groups');
  const view2 = NoGroups.create({ activeSessions: sessions, getDeliver: () => deliver, getJobs: () => null, getGroups: () => ge, broadcastSessions: () => {}, renderMsgStash, renderNotifStash, debounceMs: 20 });
  deliver.drainStash(B);
  const strip2 = SS.createStashStrip({ sessionId: 'w1' });
  strip2.set(view2.summaryFor(sB), { turn: 'idle' });
  ok(strip2.el.hidden === true && view.summaryFor(sB).items.some((i) => i.kind === 'group'), 'CONTROL a fact without the group preview: a group message waits and the strip NEVER appears (②k can go red)');
  for (const c of copiesCensus(MUTG.files, MUTG.dir, REPO, { minCopies: 1, label: '②k ' })) ok(c.pass, c.name, c.detail);
  try { deliver.flush(); } catch { }
  store.close();
}

// ═══ ⑤ NEGATIVE CONTROLS ═══
console.log('⑤ negative controls (patched scratch copies)');
{
  const MUT = mutantCopies('stash-strip', REPO);
  const src = read('src/server/stash-handover.js');
  const anchor1 = "      const sum = S.summarize({ msg: [...both.retry, ...both.msg, ...groups], jobs: both.jobs });\n";
  if (!src.includes(anchor1)) throw new Error('mutation anchor missing: hide');
  const Hide = MUT.load('src/server/stash-handover.js', src.replace(anchor1, "      const sum = null && S.summarize({ msg: [...both.retry, ...both.msg, ...groups], jobs: both.jobs });\n"), 'hide');
  const R = rig({ handoverModule: Hide });
  R.deliver.stashFor(R.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'sent' });
  const strip = SS.createStashStrip({ sessionId: 'w1' });
  strip.set(R.view.summaryFor(R.s), { turn: 'idle' });
  ok(strip.el.hidden === true, 'CONTROL a hand-over module that hides the fact: a notice waits and the strip NEVER appears (② and ④ can go red)');
  const anchor2 = "    const { msg: stashed, jobs, retry } = entriesOf(cid);\n";
  if (!src.includes(anchor2)) throw new Error('mutation anchor missing: take-first');
  const Take = MUT.load('src/server/stash-handover.js', src.replace(anchor2, "    const { msg: stashed, jobs, retry } = entriesOf(cid);\n    d.drainStash(cid); { const jm0 = jobsReady(); if (jm0) jm0.drainNotifs(cid); }\n"), 'take-first');
  const R2 = rig({ refuse: 'day-cap', handoverModule: Take });
  R2.deliver.stashFor(R2.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hi' });
  const r2 = await R2.view.handOver('w1');
  ok(!r2.ok && R2.view.summaryFor(R2.s) === null, 'CONTROL take-before-deliver: the refusal LOSES the notice (② "exactly as they were" can go red)');
  // the in-flight guard removed: two clicks bill twice
  const anchor3 = "    if (cur) return { ok: false, code: 'in_flight',";
  if (!src.includes(anchor3)) throw new Error('mutation anchor missing: no-guard');
  const NoGuard = MUT.load('src/server/stash-handover.js', src.replace(anchor3, "    if (false) return { ok: false, code: 'in_flight',"), 'no-guard');
  const R3 = rig({ deferPost: true, handoverModule: NoGuard });
  R3.deliver.stashFor(R3.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'msg-1' });
  const q1 = R3.view.handOver('w1'); await sleep(5); const q2 = R3.view.handOver('w1'); await sleep(5);
  R3.release(); await sleep(5); R3.release(); await sleep(5);
  await Promise.all([q1, q2]);
  ok(R3.posts.length === 2 && R3.ledger.length === 2, 'CONTROL the in-flight guard removed: two concurrent clicks are TWO posts and TWO ledger rows (②b can go red)', { posts: R3.posts.length, ledger: R3.ledger });
  // the claim removed: the injection race delivers twice
  const anchor4 = "    if (shownStashed.length && typeof d.claimStash === 'function') releases.push(d.claimStash(cid, shownStashed, id));\n";
  if (!src.includes(anchor4)) throw new Error('mutation anchor missing: no-claim');
  const NoClaim = MUT.load('src/server/stash-handover.js', src.replace(anchor4, ''), 'no-claim');
  const R4 = rig({ deferPost: true, handoverModule: NoClaim });
  R4.deliver.stashFor(R4.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'receipt-X' });
  const q4 = R4.view.handOver('w1'); await sleep(5);
  const d4 = R4.deliver.drainStash(R4.CID);
  R4.release(); await q4;
  ok(d4.length === 1 && R4.posts.filter((t) => /receipt-X/.test(t)).length === 1, 'CONTROL the claim removed: the injection\'s drain takes the entry AND the hand-over delivers it — two copies (②b can go red)', { drained: d4.length, posts: R4.posts.length });
  // `billed` read off the turn alone
  const anchor5 = "    try { return !(notificationDelivery(capsOf(s && s.backend)) === 'steer' && !!(s && s._isStreaming)); } catch { return true; }";
  if (!src.includes(anchor5)) throw new Error('mutation anchor missing: turn-only');
  const TurnOnly = MUT.load('src/server/stash-handover.js', src.replace(anchor5, "    return !(s && s._isStreaming);"), 'turn-only');
  const R5 = rig({ backend: 'claude', streaming: true, handoverModule: TurnOnly });
  R5.deliver.stashFor(R5.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'hi' });
  const f5 = R5.view.summaryFor(R5.s); await R5.view.handOver('w1');
  ok(f5.billed === false && R5.ledger.length === 1, 'CONTROL `billed` from the turn alone: a claude session mid-turn says "no cost" while the ladder charges (②b can go red)', { billed: f5.billed, ledger: R5.ledger });
  // ── r2 controls ──
  // the shutdown that does not wait: the SIGTERM leg re-delivers
  const anchor6 = "    if (!ps.length) return Promise.resolve(0);\n";
  if (!src.includes(anchor6)) throw new Error('mutation anchor missing: no-settle');
  const NoSettle = MUT.load('src/server/stash-handover.js', src.replace(anchor6, "    if (true) return Promise.resolve(0);\n"), 'no-settle');
  {
    const dir = scratch('stash-strip-ctl-settle-' + Math.random().toString(36).slice(2, 7));
    const R6 = rig2({ dir, deferPost: true, handoverModule: NoSettle });
    R6.deliver.stashFor(R6.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'ctl-settle' });
    const q6 = R6.view.handOver('w1'); await sleep(5);
    let settledAtOnce = false; R6.view.settle(2000).then(() => { settledAtOnce = true; });
    R6.release();                                  // the CLI's ack is in the socket; the patched settle has already "resolved"…
    R6.deliver.flush(); R6.jm.shutdown();          // …so the shutdown flushes and exits BEFORE the ack's continuation runs
    const N6 = rig2({ dir, boot: true });          // the next server reads the disk as the dead process left it
    const dup = N6.deliver.drainStash(N6.CID).length;
    await q6; await sleep(5);
    ok(settledAtOnce === true && dup === 1 && N6.deliver.releasedAtBoot.length === 1, 'CONTROL the shutdown that does not wait for a hand-over in flight: the next boot re-delivers the frame the CLI took (②c SIGTERM can go red)', { settledAtOnce, dup });
  }
  // the drain's debounced persist: the disk still holds a delivered entry (the ladder's store)
  const cdsrc = read('src/server/conversation-deliver.js');
  // (the .195 merge: the same line also emits lane channel-withdraw's `drained` with what was TAKEN)
  const anchor7 = "      if (took.length) { writeStashNow(); stashChanged(cid); ";
  if (!cdsrc.includes(anchor7)) throw new Error('mutation anchor missing: lazy-drain');
  const LazyDrain = MUT.load('src/server/conversation-deliver.js', cdsrc.replace(anchor7, "      if (took.length) { persistStash(); stashChanged(cid); "), 'lazy-drain');
  {
    const R7 = rig2({ deliverModule: LazyDrain });
    R7.deliver.stashFor(R7.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'ctl-lazy' }); R7.deliver.flush();
    await R7.view.handOver('w1');
    ok((JSON.parse(fs.readFileSync(path.join(R7.dir, 'msg-stash.json'), 'utf8'))[R7.CID] || []).length === 1, 'CONTROL the drain persisted on the debounce: right after a delivered hand-over the ladder\'s store on disk still holds the entry (②c can go red)');
  }
  // …and the jobs store's
  const jbsrc = read('src/jobs.js');
  const anchor8 = "    } else this.pendingNotifs.delete(cid);\n    this._saveNotifs();\n";
  if (!jbsrc.includes(anchor8)) throw new Error('mutation anchor missing: lazy-notifs');
  const LazyNotifs = MUT.load('src/jobs.js', jbsrc.replace(anchor8, "    } else this.pendingNotifs.delete(cid);\n"), 'lazy-notifs');
  {
    const R8 = rig2({ jobsModule: LazyNotifs });
    R8.jm._stashNotif(R8.CID, job('j1', 'nightly'), { what: 'ctl-lazy-job' }, 'not reachable'); R8.jm._save();
    await R8.view.handOver('w1');
    ok((JSON.parse(fs.readFileSync(path.join(R8.dir, 'job-notifications.json'), 'utf8'))[R8.CID] || []).length === 1, 'CONTROL the jobs drain persisted on the 2 s tick: right after a delivered hand-over the notifs file still holds the job result (②c can go red)');
  }
  // the restorer removed: the frame that came back is ONE blob
  const anchor9 = "    const rec = delivered.get(m[1]);\n";
  if (!src.includes(anchor9)) throw new Error('mutation anchor missing: no-restore');
  const NoRestore = MUT.load('src/server/stash-handover.js', src.replace(anchor9, "    const rec = null;\n"), 'no-restore');
  {
    const R9 = rig2({ handoverModule: NoRestore });
    for (let i = 0; i < 3; i++) R9.deliver.stashFor(R9.CID, { source: 'channel-receipt', kind: 'notification', fromName: 'Channels · Outbox', text: 'r-' + i });
    R9.jm._stashNotif(R9.CID, job('j1', 'nightly'), { what: 'done' }, 'not reachable');
    await R9.view.handOver('w1');
    R9.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'boom', text: R9.posts[0], fromName: 'VibeSpace notices', kind: 'notification' } });
    const f9 = R9.view.summaryFor(R9.s);
    ok(f9 && f9.count === 1 && f9.items[0].kind === 'notice' && R9.jm.peekNotifs(R9.CID).length === 0, 'CONTROL the restorer removed: the wrapper\'s ok:false frame is re-stashed as ONE notice — "1 notice" for four, the job result gone from its store (②c can go red)', f9);
  }
  // `held` dropped from the result: the toast hides the rest
  const anchor10 = "      return { ok: true, id, delivered: tookMsg.length + tookJobs.length, held, lane";
  if (!src.includes(anchor10)) throw new Error('mutation anchor missing: no-held');
  const NoHeld = MUT.load('src/server/stash-handover.js', src.replace(anchor10, "      return { ok: true, id, delivered: tookMsg.length + tookJobs.length, held: 0, lane"), 'no-held');
  {
    const R10 = rig2({ handoverModule: NoHeld });
    for (let i = 0; i < 9; i++) R10.deliver.stashFor(R10.CID, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'm' + i + ' ' + 'x'.repeat(1900) });
    const r10 = await R10.view.handOver('w1');
    ok(r10.delivered === 6 && R10.view.summaryFor(R10.s).count === 3 && S.handedOverWords(r10, tEn) === 'Handed over 6 waiting notice(s)', 'CONTROL `held` dropped from the result: 3 notices stay and the toast says only "Handed over 6" (②c can go red)', r10);
  }
  // `inFlight` dropped from the fact: a second client's button stays live
  const anchor11 = "inFlight: inflight.has(cid),";
  if (!src.includes(anchor11)) throw new Error('mutation anchor missing: no-inflight');
  const NoInFlight = MUT.load('src/server/stash-handover.js', src.replace(anchor11, "inFlight: false,"), 'no-inflight');
  {
    const R11 = rig2({ deferPost: true, handoverModule: NoInFlight });
    R11.deliver.stashFor(R11.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'x' });
    const q11 = R11.view.handOver('w1'); await sleep(5);
    const strip11 = SS.createStashStrip({ sessionId: 'w1' }); strip11.set(R11.view.summaryFor(R11.s), { turn: 'idle' });
    ok(strip11.el.querySelector('.chat-stash-go').disabled === false && strip11.el.querySelector('.chat-stash-go-label').textContent === 'Hand over now', 'CONTROL `inFlight` dropped from the fact: while a hand-over runs another client\'s strip still offers a live "Hand over now" (②c can go red)');
    R11.release(); await q11;
  }
  // ── r3 controls ──
  // the text equality dropped: a peer's quoted tag resurrects a delivered hand-over and loses the peer's message
  const anchor12 = "    if (!sameFrame(rec, echoed)) {";   // the lane-redact merge: the equality lives in sameFrame (a cleared record keeps its frame's digest)
  if (!src.includes(anchor12)) throw new Error('mutation anchor missing: tag-only');
  const TagOnly = MUT.load('src/server/stash-handover.js', src.replace(anchor12, "    if (false) {"), 'tag-only');
  {
    const steerCaps = { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] };
    // judged on an OLD wrapper's echo (no kind): r4's kind gate is stripped from r3's control (a new guard layer is
    // taken out of the old layer's control, or the old control proves nothing)
    const L = await peerTagLeg(rig2({ backend: 'codex', inbox: false, sidecar: steerCaps, handoverModule: TagOnly }), null, { echoKind: null });
    ok(L.ok && L.bo === false && L.resurrected === 3, 'CONTROL the frame keyed on its tag alone: a peer\'s quoted tag resurrects the three delivered entries and Bo\'s message is lost (②d can go red)', L);
    const Lk = await peerTagLeg(rig2({ backend: 'codex', inbox: false, sidecar: steerCaps, handoverModule: TagOnly }));
    ok(Lk.ok && Lk.bo === true && Lk.resurrected === 0, '…the same mutant under a wrapper that echoes `kind`: r4\'s gate alone still refuses the peer frame (the layers are independent)', Lk);
  }
  // r4: the echo's kind gate removed — a peer frame that IS the exact frame text resurrects the delivered entries
  const anchor14 = "    if (meta && meta.kind === 'peer') {";
  if (!src.includes(anchor14)) throw new Error('mutation anchor missing: no-kind');
  const NoKind = MUT.load('src/server/stash-handover.js', src.replace(anchor14, "    if (false) {"), 'no-kind');
  {
    const steerCaps = { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] };
    const L = await peerTagLeg(rig2({ backend: 'codex', inbox: false, sidecar: steerCaps, handoverModule: NoKind }), null, { whole: true });
    ok(L.ok && L.bo === false && L.resurrected === 3, 'CONTROL r4 the kind gate removed: a peer\'s verbatim copy of the frame resurrects the three delivered entries and the peer\'s message is lost (②d/②e can go red)', L);
  }
  // the door removed: a press during the shutdown's wait starts a hand-over nobody waits for
  const anchor13 = "    if (closed) return { ok: false, code: 'restarting',";
  if (!src.includes(anchor13)) throw new Error('mutation anchor missing: no-door');
  const NoDoor = MUT.load('src/server/stash-handover.js', src.replace(anchor13, "    if (false) return { ok: false, code: 'restarting',"), 'no-door');
  {
    const R13 = rig2({ deferPost: true, handoverModule: NoDoor });
    R13.deliver.stashFor(R13.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'ctl-door-1' });
    const q1 = R13.view.handOver('w1'); await sleep(5);
    R13.view.close(); const st = R13.view.settle(2000);
    R13.release(); await q1; await sleep(5);
    R13.deliver.stashFor(R13.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'ctl-door-2' });
    const q2 = R13.view.handOver('w1'); await sleep(5);
    const k = await st;
    ok(k === 1 && R13.view.inFlightCount() === 1 && R13.diskMsg().length === 1 && /^ho-/.test(R13.diskMsg()[0].ho), 'CONTROL the door removed: settle() answered 1 while a second hand-over is in flight with its stamp on disk — the exit would leave it (②d can go red)', { k, inFlight: R13.view.inFlightCount(), disk: R13.diskMsg() });
    R13.release(); await q2;
  }
  // ── r4 controls ──
  // the cap over the WHOLE store (claimed or not): 30 arrivals mid-flight evict every claimed entry — delivered 0, no originals
  // (cdsrc is the ladder source read above)
  const anchor15 = "    let over = q.filter((e) => !(e && e.ho)).length - STASH_CAP;";
  if (!cdsrc.includes(anchor15)) throw new Error('mutation anchor missing: cap-all');
  const CapAll = MUT.load('src/server/conversation-deliver.js', cdsrc.replace(anchor15, "    let over = q.length - STASH_CAP; if (over > 0) return q.splice(0, over);"), 'cap-all');
  {
    const R15 = rig2({ deferPost: true, deliverModule: CapAll });
    for (let i = 0; i < 5; i++) R15.deliver.stashFor(R15.CID, { source: 'agent', kind: 'peer', fromName: 'Ada', text: 'old-' + i });
    const q15 = R15.view.handOver('w1'); await sleep(5);
    for (let i = 0; i < 30; i++) R15.deliver.stashFor(R15.CID, { source: 'agent', kind: 'peer', fromName: 'Bo', text: 'new-' + i });
    const claimedLeft = R15.deliver.claimedCount(R15.CID);
    R15.release(); const r15 = await q15;
    ok(claimedLeft === 0 && r15.ok && r15.delivered === 0 && /old-4/.test(R15.posts[0]) && R15.view._delivered.get(r15.id).msg.length === 0 && S.handedOverWords(r15, tEn) === 'Handed over 0 waiting notice(s)',
      'CONTROL the cap over the whole store: 30 arrivals evict the 5 claimed entries, the frame carried them, the press says "Handed over 0", the record keeps no originals (②c/②e can go red)', { claimedLeft, r15 });
  }
  // ②c THE .195 MERGE — lane channel-withdraw's `evicted` event rides THIS cap and nothing else: the entries it carries
  // are the ones the cap dropped (the oldest UNCLAIMED), never one a hand-over is carrying; a restore trims nothing and
  // says `stashed` for what it put back. Over the ladder alone (the engine's fates are test-channel-outbox's merge legs).
  const evictRig = (mod) => {
    const dir = scratch('stash-strip-m195-' + Math.random().toString(36).slice(2, 7)); fs.mkdirSync(dir, { recursive: true });
    const lad = mod.create({ dataDir: dir, activeSessions: new Map(), log: () => {} });
    const evs = []; lad.onStash((ev, cid, entries, extra) => evs.push({ ev, refs: entries.map((e) => e.ref), ho: entries.map((e) => !!e.ho), extra }));
    for (let i = 0; i < 5; i++) lad.stashFor('c', { source: 'channel', kind: 'notification', fromName: 'R', text: 'claimed ' + i, ref: 'claimed-' + i, ts: 1000 + i });
    lad.claimStash('c', lad.stashEntries('c'), 'ho-m195');
    for (let i = 0; i < 31; i++) lad.stashFor('c', { source: 'channel', kind: 'notification', fromName: 'R', text: 'new ' + i, ref: 'new-' + i, ts: 2000 + i });
    const evicted = evs.filter((x) => x.ev === 'evicted');
    const out = { evicted: evicted.flatMap((x) => x.refs), anyClaimed: evicted.some((x) => x.refs.some((r) => /^claimed-/.test(r))), held: evicted.map((x) => x.extra.held), total: lad.stashCount('c'), claimed: lad.claimedCount('c') };
    const took = lad.drainStash('c', new Set(lad.stashEntries('c').filter((e) => e.ho)));
    const n0 = evs.length;
    lad.restoreStash('c', took);
    out.restore = evs.slice(n0).map((x) => x.ev); out.afterRestore = lad.stashCount('c');
    try { fs.rmSync(dir, { recursive: true }); } catch { }
    return out;
  };
  {
    const m = evictRig(CD);
    ok(JSON.stringify(m.evicted) === JSON.stringify(['new-0']) && !m.anyClaimed && m.total === 35 && m.claimed === 5 && JSON.stringify(m.restore) === JSON.stringify(['stashed']) && m.afterRestore === 35,
      `②c the .195 merge: 31 ref'd arrivals over 5 CLAIMED entries evict ONE entry, the oldest unclaimed (${JSON.stringify(m.evicted)}), and \`evicted\` names only it; the claimed five stay (${m.claimed}); the hand-over's frame put back is ONE \`stashed\` and nothing trimmed (${m.afterRestore} queued)`, m);
    const mc = evictRig(CapAll);
    ok(mc.anyClaimed, `CONTROL the cap over the whole store: its \`evicted\` names a claimed entry (${JSON.stringify(mc.evicted.slice(0, 6))}) — a receipt the hand-over carries would read "not delivered" (②c can go red)`, mc);
  }
  // the delivered memory not persisted: the echo after a restart restores nothing — the frame is one notice
  const anchor16 = "    try { fs.writeFileSync(file + '.tmp', JSON.stringify(Object.fromEntries(delivered))); fs.renameSync(file + '.tmp', file); }";
  if (!src.includes(anchor16)) throw new Error('mutation anchor missing: no-persist');
  const NoPersist = MUT.load('src/server/stash-handover.js', src.replace(anchor16, "    try { void file; }"), 'no-persist');
  {
    const steerCaps = { peerMessage: true, inputQueue: true, queueVerbs: ['remove', 'steer', 'steer-all'] };
    const R16 = rig2({ backend: 'codex', streaming: true, sidecar: steerCaps, inbox: false, dataDir: true, handoverModule: NoPersist });
    for (let i = 0; i < 3; i++) R16.deliver.stashFor(R16.CID, { source: 'channel', kind: 'notification', fromName: 'Channels · Lark', text: 'ctl-lark-' + i });
    R16.jm._stashNotif(R16.CID, job('j1', 'nightly'), { what: 'ctl-result' }, 'not reachable'); R16.jm._save();
    const r16 = await R16.view.handOver('w1');
    R16.deliver.flush(); R16.jm.shutdown();
    const N16 = rig2({ dir: R16.dir, boot: true, backend: 'codex', streaming: true, sidecar: steerCaps, inbox: false, dataDir: true, handoverModule: NoPersist });
    N16.feedCodex({ type: 'event_msg', payload: { type: 'peer_message_result', ok: false, reason: 'dropped by Stop before it was delivered', text: R16.frames[0].text, fromName: 'VibeSpace notices', kind: 'notification' } });
    const f16 = N16.view.summaryFor(N16.s);
    ok(r16.ok && r16.delivered === 4 && !fs.existsSync(path.join(R16.dir, SH.DELIVERED_FILE)) && f16 && f16.count === 1 && f16.items[0].kind === 'notice' && N16.jm.peekNotifs(N16.CID).length === 0,
      'CONTROL the memory in-process only: after the restart the frame comes back as ONE notice, the job result gone from its store (②e can go red)', f16);
  }
  // the block render removed: a long notification is a 400-char line again
  const arsrc = read('src/agent-routes.js');
  const anchor17 = "    if (notice && text.length > MSG_STASH_LINE_MAX) return";
  if (!arsrc.includes(anchor17)) throw new Error('mutation anchor missing: no-block');
  const NoBlock = MUT.load('src/agent-routes.js', arsrc.replace(anchor17, "    if (false) return"), 'no-block');
  {
    const long = 'frame (hand-over ho-zz-3):\n\n' + Array.from({ length: 6 }, (_, i) => `- lark-${i} ` + 'x'.repeat(500)).join('\n');
    const out = NoBlock.renderMsgStash([{ source: 'agent', kind: 'notification', fromName: 'VibeSpace notices', text: long, ts: 1 }]);
    ok(!/lark-5/.test(out.text) && out.text.length < 700, 'CONTROL the block render removed: the handed-back frame is a 400-char line, five of six notices gone in silence (②e can go red)', out.text.length);
  }
  // the phone rule that hid the money word: the pin catches the pre-r4 css (a string control — no copy)
  {
    const oldCss = read('public/chat.css').replace('@media (max-width: 768px) { .chat-stash-parts, .chat-stash-held { display: none; }', '@media (max-width: 768px) { .chat-stash-parts, .chat-stash-cost { display: none; }');
    const phone = oldCss.match(/@media \(max-width: 768px\) \{ ([^}]*)\}/g).filter((m) => /chat-stash/.test(m));
    ok(phone.length === 1 && /chat-stash-cost/.test(phone[0]), 'CONTROL the pre-r4 phone rule (`.chat-stash-cost { display: none }`) is what the ②e pin refuses');
  }
  for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 17, label: '⑤ ' })) ok(c.pass, c.name, c.detail);
}

// ═══ ⑥ WIRING PINS ═══
console.log('⑥ wiring pins');
{
  const sv = read('server.js');
  ok(/stash: stashFactOf\(s\),/.test(sv) && /onStashChange: \(\) => \{ try \{ stashView\.changed\(\); \} catch \{ \} \}/.test(sv) && /onStash: \(\) => \{ try \{ stashView\.changed\(\); \} catch \{ \} \}/.test(sv) && /stashView\.register\(app\);/.test(sv),
    'server.js: the payload carries `stash`, both stores\' hooks re-publish, the route is registered');
  const cd = read('src/server/conversation-deliver.js'), jb = read('src/jobs.js');
  ok((cd.match(/stashChanged\(cid\)/g) || []).length >= 3 && /stashEntries,/.test(cd) && (jb.match(/this\.d\.onStash\?\.\(cid\)/g) || []).length === 3 && /peekNotifs\(cid\)/.test(jb), 'the ladder\'s stash and the jobs stash each say every write, every drain and every restore');
  const sh = read('src/server/stash-handover.js');
  ok(/claimStash, claimedCount, restoreStash, registerFrameRestorer, restoreFrame, releasedAtBoot, flush,/.test(cd) && /claimNotifs\(cid, entries, id = null\) \{/.test(jb) && /releases\.push\(d\.claimStash\(cid, shownStashed, id\)\)/.test(sh) && /releases\.push\(d\.claimRetry\(cid, shownParked, id\)\)/.test(sh) && /releases\.push\(jm\.claimNotifs\(cid, jobs, id\)\)/.test(sh),
    'verify: every store exposes the claim door and the hand-over claims through each, BY ID (released in its finally) — the ladder\'s stash, its retry park (lane notify-retry) and the jobs stash');
  // the .195 merge: the claim's write is judged (a failed one is logged by name — withdraw's checklist ⑧) and a by-id
  // drain also emits withdraw's `drained` with what it TOOK; both still write through at once
  ok(/for \(const e of mine\) e\.ho = tag;\n(?:\s*\/\/[^\n]*\n)*\s*if \(mine\.length && !writeStashNow\(\)\) log\(/.test(cd) && /for \(const n of mine\) n\.ho = tag;\n    if \(mine\.length\) this\._saveNotifs\(\);/.test(jb) && /if \(took\.length\) \{ writeStashNow\(\); stashChanged\(cid\); emitStash\('drained', cid, took\); \}/.test(cd) && /delete stash\[cid\]; writeStashNow\(\); stashChanged\(cid\);/.test(cd) && /\} else this\.pendingNotifs\.delete\(cid\);\n    this\._saveNotifs\(\);/.test(jb),
    'verify r2: the claim is the entry\'s own `ho` stamp written to disk at once in BOTH stores, and every drain persists at once (the ladder\'s store and the jobs store)');
  ok(/deliver\.registerFrameRestorer\(\(cid, text, meta\) => stashView\.restoreHandedOver\(cid, text, meta\)\)/.test(sv) && /stashView\.settle\(maxMs\)/.test(read('src/server/exit-settle.js')) && /settleInFlight\(\{ stashView, deliver, n, m \}\)\.finally\(shutdownNow\)/.test(sv) && /function shutdown\(\)[\s\S]{0,700}stashView\.inFlightCount\(\)/.test(sv) && /renderNotifStash: require\('\.\/src\/job-model\.js'\)\.renderNotifStash, dataDir: path\.join\(__dirname, 'data'\) \}\); stashView\.register\(app\);/.test(sv),
    'verify r2: server.js registers the hand-over restorer on the ladder (r4: with the echo\'s kind) and the shutdown waits for a hand-over in flight before it exits; r4: the view gets the data dir (the delivered memory on disk)');
  ok(/function shutdown\(\)[\s\S]{0,700}stashView\.close\(\); n = stashView\.inFlightCount\(\)/.test(sv) && /text: vibespaceNoticeText\(frame\) \}\);/.test(sh) && /if \(typeof rec\.text === 'string'\) return echoed\.trim\(\) === rec\.text\.trim\(\);/.test(sh) && /if \(!sameFrame\(rec, echoed\)\) \{/.test(sh),   // the lane-redact merge: the exact-text rule lives in sameFrame (a cleared record keeps its frame's digest)
    'verify r3: the shutdown shuts the door BEFORE it counts and waits; the delivered record keeps the exact frame text and the restore requires it');
  const ce = read('src/server/stdout/codex-events.js'), ae = read('src/server/stdout/acp-events.js');
  ok(/restored = deliverRef\?\.restoreFrame\?\.\(cid, String\(msg\.payload\.text\), \{ kind: msg\.payload\.kind \|\| null \}\)[\s\S]{0,320}if \(!restored\) \{\n\s+try \{ if \(cid\) deliverRef\?\.stashFor\?\.\(cid, \{ source: 'agent', kind: msg\.payload\.kind \|\| null/.test(ce) && /restored = deliverRef\?\.restoreFrame\?\.\(cid, String\(msg\.text\), \{ kind: msg\.peerKind \|\| null \}\)[\s\S]{0,320}if \(!restored\) \{\n\s+try \{ if \(cid\) deliverRef\?\.stashFor\?\.\(cid, \{ source: 'agent', kind: msg\.peerKind \|\| null/.test(ae) && !/deliverRef\s*\(/.test(ce.replace(/\/\/.*$/gm, '')),
    'verify r2: both stdout consumers ask the ladder to restore a hand-over\'s frame BEFORE the re-stash (property access on the lazy ref, the codex + acp twins alike; r4: the echo\'s own kind rides along)');
  ok(/stash: \{ digest: null \},/.test(read('src/lib/sidebar.js')) && /patchStashHints\(this\.listEl, msg\.sessions\)/.test(read('src/lib/sidebar.js')) && /stashHintChip\(s\.stash\)/.test(read('src/lib/session-card.js')), 'LIVE_SESSION_FACTS carries `stash` (carried-only), the sidebar patches the hint in place, the card draws it at build');
  const ci = read('src/lib/chat-input.js'), cv = read('src/lib/chat-view.js');
  ok(/\.chat-stash-go\[hidden\], \.chat-stash-nobutton\[hidden\], \.chat-stash-held\[hidden\] \{ display: none; \}/.test(read('public/chat.css')), 'verify r2: the strip\'s no-button sentence, the hidden button and the held count have their own display rules (no global .hidden)');
  ok(/inputArea\.append\(this\._stashStrip\.el, this\._queueStrip,/.test(ci) && /setStash\(summary, opts = \{\}\) \{ this\._stashStrip\?\.set\(summary \|\| null, opts\); \}/.test(ci) && /this\._chatInput\?\.setStash\?\.\(this\._stashFact\.stash, \{ turn: this\._stashFact\.turn \}\);/.test(cv),
    'the strip sits ABOVE the queue strip; ChatView feeds it from its own row of every active-sessions payload');
  ok(!/\.innerHTML\s*=(?!\s*UI_ICONS\.)/.test(read('src/lib/stash-strip.js')) && (read('src/lib/stash-strip.js').match(/\.innerHTML\s*=/g) || []).length === 2, 'stash-strip assigns innerHTML ONLY the library\'s own icons (every string is textContent)');
  const A = require(path.join(REPO, 'src/spend-authorizer.js'));
  ok(A.SPEND_REASONS['stash-handover'] && A.SPEND_REASONS['stash-handover'].turn === true && /file: 'src\/server\/stash-handover\.js', prim: 'deliver-ladder'/.test(read('scripts/test-spend-paths.mjs')) && require(path.join(REPO, 'src/notification-senders.js')).NOTIFICATION_SENDERS.includes('VibeSpace notices'),
    'SPEND_REASONS declares stash-handover (a turn), the spend census names the site, the sender list names its voice');
  const load = (f) => { const m = new Set(); for (const ln of read(f).split('\n')) { const r = ln.match(/^  ("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'): /); if (r) m.add(new Function('return ' + r[1])()); } return m; };
  const zh = load('src/lib/i18n-zh.js'), ja = load('src/lib/i18n-ja.js');
  const keys = new Set();
  for (const f of ['src/stash-summary.js', 'src/lib/stash-strip.js']) for (const m of read(f).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.add(new Function(`return '${m[1]}'`)());
  const missing = [...keys].filter((k) => !zh.has(k) || !ja.has(k));
  ok(keys.size >= 28 && missing.length === 0, `zh + ja carry every word of the strip and the hint (${keys.size} keys)`, missing);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
