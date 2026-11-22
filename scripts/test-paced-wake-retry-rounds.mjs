#!/usr/bin/env node
// test-paced-wake-retry-rounds — test-paced-wake-retry's ROUNDS 7–10, MOVED VERBATIM (the coordinator's r2569, lane
// paced-wake-retry, 2026-11-22: the row stood at 13.6 s alone; each file now 9 s or less alone):
//   §12 ROUND 7 — the sixth acceptance's findings, and each law in ONE function every road calls (THE THREE CENSUSES);
//   §13 ROUND 8 — «reaches» is ONE function every road reads; §14 ROUND 9 — one per-sender reading on the frame too;
//   §15 ROUND 10 — the senders' coverage decides the frame, «never received» counts the messages people wrote.
// Every moved line is the original's, unchanged and in order; the head is test-paced-wake-retry's own (its imports, fixtures
// and rig) but for the one helper a new suite takes (scripts/lib/check.mjs checker: test-ci-gate-tiers §7b) — each moved
// call keeps its words, its condition passing the census's own guarded coercion (verdictOf). No real CLI, no real vendor,
// no hub: a stub post over a manual clock.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker, verdictOf } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CK = checker();   // the one helper (scripts/lib/check.mjs); the moved calls keep their words: each condition passes verdictOf
const ok = (c, n, e) => CK.ok(verdictOf(c), n, e);
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = require(path.join(REPO, 'src/channel-groups.js'));
const M = require(path.join(REPO, 'src/dispatch-model.js'));
const GE0 = require(path.join(REPO, 'src/server/groups-engine.js'));
const DELIVER0 = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const WD = require(path.join(REPO, 'src/server/worker-dispatch.js'));
const PM = require(path.join(REPO, 'src/peer-messaging.js'));
const SPEND_GUARD = require(path.join(REPO, 'src/server/spend-guard.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
const ROOT = scratchDir('pwr');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const T0 = 1_790_000_000_000;
const cidOf = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, C, D, E, F, H, I, J, K] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cidOf);
const NAMES = { [A]: 'alpha', [B]: 'beta', [C]: 'gamma', [D]: 'delta', [E]: 'eps', [F]: 'zeta', [H]: 'eta', [I]: 'theta', [J]: 'iota', [K]: 'kappa' };
for (let n = 11; n <= 34; n++) NAMES[cidOf(n)] = 'm' + n;   // the wide legs' members
let seq = 0;

/** the rig: the REAL engine, store, ladder and park; a stub inbox; ONE manual clock for the park, the pace and the records */
function rig(name, { refuse = new Set(), peerOf = null, post = null, guard = null, hosts = null, GE = GE0, DELIVER = DELIVER0, dir = null, shared = null, heldRetry = null } = {}) {
  const dataDir = dir || path.join(ROOT, name + '-' + (++seq));
  fs.mkdirSync(dataDir, { recursive: true });
  const c = shared || { now: T0, timers: [] };
  const retryClock = { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + Math.max(0, ms), fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } };
  const sessions = new Map();
  const roster = Object.entries(NAMES).map(([cid, n]) => ({ cid, name: n, groups: ['tg1'], reachability: null }));
  for (const r of roster) sessions.set('w-' + r.name, { claudeSessionId: r.cid, backendSessionId: r.cid, name: r.name, mode: 'chat', backend: 'claude', _isStreaming: false, _turnStateSeen: true });
  const R = { c, dataDir, sessions, posts: [], cards: [], auths: [], notes: [], releases: [], logs: [], answers: [], refuse, hostPosts: [], audit: [] };
  const log = (...a) => R.logs.push(a.join(' '));
  const quiet = { info: log, warn: log, log };
  R.deliver = DELIVER.create({
    dataDir, activeSessions: sessions, serverSetting: () => undefined, retryClock, log, renderBatch: AR.renderMsgStash,
    peerMsg: {
      findPeer: peerOf || ((cid) => ({ name: cid, socketPath: '/dev/null' })),
      postToPeer: post || (async (peer, text) => { const a = R.answers.length ? R.answers.shift() : { ok: true, phase: 'written' }; const out = typeof a === 'function' ? await a(text) : a; if (out.ok) R.posts.push({ cid: peer.name, text }); return out; }),
      postChannelEvent: async () => ({ ok: false }),
    },
    getHosts: () => hosts, getConvIndex: () => (hosts ? { ownerHost: () => 'h1' } : null),
    emitPeerCard: (cid, card) => { R.cards.push({ cid, ...card }); return true; },
    authorizeSpend: (q) => { R.auths.push({ reason: q.reason, cid: q.cid }); if (guard) return guard.authorize(q); return refuse.has(q.cid) ? { ok: false, why: 'hour-cap', detail: 'hour cap reached', limits: { perIdentityHour: 1 } } : { ok: true, identity: { key: 'slot-1', name: 'Personal' }, hold: 'h' + R.auths.length }; },
    noteSpend: (q) => { R.notes.push(q); if (guard) guard.note(q); }, releaseSpend: (q) => { R.releases.push(q); if (guard) guard.release(q); },
  });
  R.store = createChannelStore({ dir: path.join(dataDir, 'channels'), log: quiet, ...(heldRetry ? { heldRetry } : {}) });
  R.todos = new UserTodoManager({ dataDir, now: () => c.now });
  R.eng = GE.create({ store: R.store, deliver: R.deliver, broadcast: () => { }, now: () => c.now, paceClock: () => c.now, roster: () => roster, groupSetting: () => 'none', log: quiet, userTodos: R.todos });
  R.settle = async () => { await R.deliver.settleRetries(2000); await sleep(1); await R.deliver.settleRetries(2000); };
  /** move the clock to `to`, firing every timer in its order */
  R.advanceTo = async (to) => {
    for (;;) {
      c.timers.sort((x, y) => x.at - y.at);
      const t = c.timers[0];
      if (!t || t.at > to) break;
      c.timers.shift();
      c.now = Math.max(c.now, t.at);
      t.fn();
      await R.settle();
    }
    c.now = to;
    await R.settle();
  };
  R.at = (ms) => R.advanceTo(T0 + ms);
  R.group = async (nm, by, members) => { const r = await R.eng.create({ by, name: nm, members, quiet: true }); if (!r.ok) throw new Error('create: ' + JSON.stringify(r)); return r.group.id; };
  R.say = (gid, from, text, extra = {}) => R.eng.post({ group: gid, from, text, mayWake: R.eng.pacerFor(from), ...extra });
  R.owed = (cid) => R.deliver.retryPeek(cid).filter((e) => e.held && e.held.why === 'paced');
  R.turn = async (cid) => { const rep = R.eng.reportsForTurn(cid, { budget: 4000 }); await R.eng.commitReports(cid, rep.marks); await R.settle(); return rep; };
  R.close = () => { try { R.deliver.closeRetries(); R.deliver.flush(); } catch { } try { R.store.close(); } catch { } };
  return R;
}

/** a leg that throws is a red line by name, never the end of the run (on the base's archive copy the doors do not exist) */
const leg = async (n, fn) => { try { await fn(); } catch (e) { CK.ok(false, `leg ${n} threw — ${(e && e.message) || e}`); } };

// ── §12 ROUND 7 ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§12 round 7: the sixth acceptance\'s findings, and each law in ONE function');
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const zh12 = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf-8'), ja12 = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf-8');
const tFill = (k, o = {}) => k.replace(/\{(\w+)\}/g, (_, n) => String(o[n]));
const PP = require(path.join(REPO, 'src/channel-policy.js'));
/** the target's state, by the session's own facts: each is the row the one reader must name */
const STATES = {
  'no-mid-session': { words: /running, but its agent takes no message mid-session/, to: (R) => { R.sessions.get('w-beta').backend = 'opencode'; } },   // a REAL stash-only row (r7, P27)
  terminal: { words: /running in a terminal, where its agent takes no message mid-session/, to: (R) => { const s = R.sessions.get('w-beta'); s.backend = 'codex'; s.mode = 'terminal'; s.pty = { write() { } }; } },
  predates: { words: /process predates live messages/, to: (R) => { const s = R.sessions.get('w-beta'); s.backend = 'codex'; s.mode = 'chat'; s.pty = { write() { } }; const buf = path.join(R.dataDir, 'session-buffers'); fs.mkdirSync(buf, { recursive: true }); fs.writeFileSync(path.join(buf, 'w-beta.json'), JSON.stringify({ caps: { frameFile: true, peerMessage: false } })); } },
  'not-running': { words: /no longer running|refused|inbox/, to: (R) => { R.sessions.delete('w-beta'); } },
};
/** parked while reachable; the target then reaches `state`; the window ends. `road`: 'attempt' = the inbox is gone too; 'peer-miss' = an inbox answers, and refuses the post */
const fallAt = async (name, state, { road = 'attempt', from = A, DELIVER = DELIVER0 } = {}) => {
  let up = true;
  const R = rig(name, { DELIVER, peerOf: (cid) => (cid !== B || up || road === 'peer-miss' ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('lane', A, [B]);
  const say = (t) => (from === G.OWNER ? R.eng.post({ group: g, from, text: t, mayWake: R.eng.pacerFor(from) }) : R.say(g, from, t));
  await R.at(100); await say('@beta one');
  await R.at(5100); await say('@beta two');
  const parked = R.owed(B).length;
  up = false; STATES[state].to(R);
  if (road === 'peer-miss') R.answers.push({ ok: false, reason: 'the inbox refused it', phase: 'connect', elapsedMs: 5 });
  await R.at(40000);
  return { R, g, parked, line: (R.deliver.stashEntries(A).find((x) => /wake/.test(x.text)) || {}).text || '', item: R.todos.snapshot().open.find((i) => /beta/.test(String(i.text))) || null };
};
const FA = 'fake-poll', FC = 'fake-poll-ops';
const DRAFTER = { kind: 'agent', id: B, name: 'beta', groups: ['g1'], msgLevelFor: () => 'none' };
const heldPace = Object.assign(() => ({ reason: 'paced — sent in 25 s (the rule)', rule: 'the rule', why: 'pair', retryInMs: 25000 }), { sender: G.OWNER, refund() { } });
/** THE RECEIPT ROAD, REAL: the channels engine over the rig's real ladder and park; the decider's wake the pace refuses */
const receiptRoad = async (name, { state = null, setup = null, DELIVER = DELIVER0 } = {}) => {
  let R = null, up = true;
  R = rig(name, { DELIVER, peerOf: (cid) => (cid === B && !up ? null : { name: cid, socketPath: '/dev/null' }) });
  R.goUnreachable = (st) => { up = false; STATES[st].to(R); };
  // the live list is the sessions themselves, as the production wiring has it (r8's nit: the rig once listed a deleted session as live)
  const eng = ENG.create({ dataDir: path.join(R.dataDir, 'chan'), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => { }, userTodos: R.todos, deliver: R.deliver, now: () => R.c.now, serverSetting: () => undefined, log: { log() { }, warn() { }, error() { } }, liveSessions: () => [...R.sessions.values()].map((s) => ({ cid: s.claudeSessionId, name: s.name, groups: ['g1'] })) });
  await eng.pass(FA, { force: true }); await eng.refresh(FA, FC); await eng.pass(FA, { force: true });
  await eng.setReach(FA, FC, { principal: { kind: 'agent', id: B, name: 'beta' }, level: 'visible' });
  const p = await eng.propose(DRAFTER, FA, FC, { text: 'a decision the pace holds' });
  if (state) R.goUnreachable(state);
  if (setup) { up = false; setup(R); }   // the drafter's shape BEFORE the decision (r7, P27: the leg once set it after)
  const ans = await eng.approve(p.proposal.id, { deliver: 'wake-now', mayWake: heldPace });
  await sleep(15);
  R.chan = eng; R.pid = p.proposal.id; R.ans = ans;
  R.stored = () => eng.store.outbox.snapshot().proposals[p.proposal.id];
  R.toast = () => PP.receiptPacedText(R.stored(), { t: tFill });
  R.card = () => PP.receiptFateText(PP.receiptFateOf(R.stored()), { t: tFill });
  R.done = () => { try { eng.stop(); } catch { } R.close(); };
  return R;
};
await leg(120, async () => { // P21: the single fall
  const c = { now: T0, timers: [] };
  const R1 = rig('p21', { shared: c });
  const g = await R1.group('lane', A, [B]);
  await R1.at(100); await R1.say(g, A, '@beta one');
  await R1.at(5100); await R1.say(g, A, '@beta two');
  R1.answers.push(() => new Promise(() => { }));
  c.timers.sort((x, y) => x.at - y.at); c.now = T0 + 30100; const t = c.timers.shift(); if (t) t.fn();
  await sleep(5);
  c.timers.length = 0;
  const R2 = rig('p21-2', { shared: c, dir: R1.dataDir });
  await R2.advanceTo(T0 + 200000);
  const lines = R2.deliver.stashEntries(A).filter((x) => /wake/.test(x.text)).map((x) => x.text);
  ok(lines.length === 1 && /^Your wake of beta in group "lane" may have been woken already \(may-have-landed\)/.test(lines[0]) && /Waking them again may start a second turn/.test(lines[0]), 'THE LAW P21: a lone may-have-landed fall carries the warning, the words the fold has', lines);
  ok(lines.length === 1 && !/send again/.test(lines[0]) && /before you wake anyone again/.test(lines[0]), 'THE LAW P21: …and no «send again»: an unattended sender would bill a second turn', lines);
  ok(lines.length === 1 && !/NOT sent/.test(lines[0]) && !/may not have been sent/.test(lines[0]), 'P21: …never «not sent» about a frame that may have landed', lines);
  R2.close();
  const o = await fallAt('p21c', 'not-running');
  ok(/^Your wake of beta in group "lane" was NOT sent \(not-running\)/.test(o.line) && /check on it\.$/.test(o.line) && !/second turn/.test(o.line) && !/send again/.test(o.line), 'P21: CONTROL: a sure miss, alone: no second-turn warning (and, r8\'s nit, no futile «send again» to a stopped target)', o.line);
  o.R.close();
});
/** THE DRAFTERS P22 NAMES, each by its REAL caps row (acceptance r7, P27: the leg's «agy» was a backend id with no row, read as the stash-only default) */
const DRAFTERS = [
  { name: 'Antigravity (antigravity, an old wrapper)', cause: 'predates', words: /process predates live messages/, setup: (R) => { const s = R.sessions.get('w-beta'); s.backend = 'antigravity'; s.mode = 'chat'; s.pty = { write() { } }; const buf = path.join(R.dataDir, 'session-buffers'); fs.mkdirSync(buf, { recursive: true }); fs.writeFileSync(path.join(buf, 'w-beta.json'), JSON.stringify({ caps: { frameFile: true, peerMessage: false } })); } },
  { name: 'opencode', cause: 'no-mid-session', words: /running, but takes no message mid-session/, setup: (R) => { R.sessions.get('w-beta').backend = 'opencode'; } },
  { name: 'codex in a terminal', cause: 'terminal', words: /running in a terminal/, setup: (R) => { const s = R.sessions.get('w-beta'); s.backend = 'codex'; s.mode = 'terminal'; s.pty = { write() { } }; } },
  { name: 'a backend id with no caps row (the stash-only default, its own control)', cause: 'no-mid-session', words: /running, but takes no message mid-session/, setup: (R) => { R.sessions.get('w-beta').backend = 'no-such-backend'; } },
];
await leg(121, async () => { // P22 (+ P27): every live drafter shape, the real receipt road, each by its real row
  ok(require(path.join(REPO, 'src/backend-caps.js')).capsOf('antigravity').peerDelivery === 'rpc-queue' && require(path.join(REPO, 'src/backend-caps.js')).capsOf('opencode').peerDelivery === 'stash-only', 'P27: the rows the leg drives are the real ones (antigravity rpc-queue, opencode stash-only)');
  for (const d of DRAFTERS) {
    const R = await receiptRoad('p22-' + d.cause + '-' + d.name.length, { setup: d.setup });
    const s = R.stored();
    ok(R.deliver.retryPeek(B).length === 0 && !(s.receiptDelivery && s.receiptDelivery.paced), `THE LAW P22: a live ${d.name} drafter under the pace: nothing is parked, nothing promised`, { park: R.deliver.retryPeek(B).length, del: s.receiptDelivery });
    ok(!(Number(s.receiptPacedMs) > 0) && s.receiptChoiceBlocked === d.cause, `P22: …${d.name}: the choice records its cause (${d.cause}), and no wait`, { ms: s.receiptPacedMs, blocked: s.receiptChoiceBlocked });
    ok(d.words.test(R.toast()) && /next message/.test(R.toast()) && !/sends it in/.test(R.toast()) && !/not running/.test(R.toast()), `THE LAW P22: ${d.name}: the toast is its own reason, no «sends it in N s»`, R.toast());
    ok(d.words.test(R.card()) && !/not running/.test(R.card()) && !/holds this/.test(R.card()), `THE LAW P22: ${d.name}: the card says what it is, never «not running»`, R.card());
    ok(/a decision the pace holds|receipt/i.test(JSON.stringify(R.deliver.stashEntries(B).map((x) => x.text))), 'P22: …the receipt waits in its stash, for the next message');
    await R.advanceTo(T0 + 7200000);
    await sleep(15);
    ok(R.posts.length === 0 && !R.todos.snapshot().open.some((i) => /not running/.test(String(i.text))) && !/not running/.test(R.card()), 'P22: …two hours on: no post, no item calling it «not running»', R.todos.snapshot().open.map((i) => i.text));
    R.done();
  }
  const held = PP.receiptPacedText({ state: 'sending', receiptChoicePaced: 'the rule', receiptChoiceBlocked: 'terminal', held: { until: T0 + 1, vendor: 'lark' } }, { t: tFill });
  ok(/running in a terminal/.test(held) && !/wake follows the send/.test(held), 'P22: a held send to such a drafter promises no wake either', held);
  const R = await receiptRoad('p22c');
  ok(R.owed(B).length === 1 && R.stored().receiptDelivery.paced && /sends it in \d+ s/.test(R.toast()) && !R.stored().receiptDelivery.blocked, 'P22: CONTROL: a drafter a wake can reach: parked, «sends it in N s»', { owed: R.owed(B).length, toast: R.toast() });
  await R.advanceTo(T0 + 30000);
  await sleep(15);
  ok(R.posts.length === 1 && R.owed(B).length === 0, 'P22: CONTROL: …and woken at the window\'s end, once', R.posts.length);
  R.done();
});
await leg(122, async () => { // P22 + P23: parked while it could fire, a drafter that stopped being reachable
  const R = await receiptRoad('p23r');
  ok(R.owed(B).length === 1, 'P23: the receipt\'s wake parks while the drafter is reachable');
  R.goUnreachable('terminal');
  await R.advanceTo(T0 + 30000);
  await sleep(25);
  const it = R.todos.snapshot().open.find((i) => /was not woken/.test(String(i.text)));
  ok(it && /running in a terminal/.test(it.text) && !/not running/.test(it.text), 'THE LAW P23: the receipt road\'s item says what it is', it && it.text);
  ok(it && it.i18n.text.key === '{agent} was not woken about {title}: {why}' && it.i18n.text.params.why.key === G.FALL_WHY.terminal && zh12.includes(JSON.stringify(it.i18n.text.key) + ':') && ja12.includes(JSON.stringify(it.i18n.text.key) + ':'), 'P23: …in zh + ja, by its key', it && it.i18n);
  ok(/running in a terminal/.test(R.card()) && !/not running/.test(R.card()), 'THE LAW P23: the receipt\'s card too', R.card());
  R.done();
});
await leg(123, async () => { // P23: the attempt road, the agent's line + the owner's item + the await record
  const o = await fallAt('p23a', 'terminal');
  ok(o.parked === 1 && /was NOT sent \(terminal\): this conversation is running in a terminal, where its agent takes no message mid-session/.test(o.line) && !/not-running|not running/.test(o.line), 'THE LAW P23: the agent\'s line says «running … takes no message mid-session»', o.line);
  o.R.close();
  const w = await fallAt('p23b', 'terminal', { from: G.OWNER });
  ok(w.item && w.item.text === 'beta was not woken in lane: it is running in a terminal, where it takes no message mid-session', 'THE LAW P23: the owner\'s item says the same', w.item && w.item.text);
  ok(w.item && w.item.i18n.text.params.why.key === G.FALL_WHY.terminal && !/not running/.test(JSON.stringify(w.item)), 'P23: …its key and its body too', w.item);
  w.R.close();
  let up = true;
  const R = rig('p23c', { peerOf: (cid) => (cid !== A || up ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('pair', A, [B]);
  await R.at(100); await R.say(g, B, '@alpha hello');
  await R.at(1100); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(2100); await R.say(g, B, 'the answer');
  ok(R.owed(A).length === 1, 'P23: the asker\'s awaited reply parks while it can be woken');
  up = false; R.sessions.get('w-alpha').backend = 'opencode';
  await R.at(40000);
  const row = R.eng.get(g).awaits[q.message.vendorId];
  const st = G.awaitState({ raw: q.message.raw }, row, R.c.now);
  ok(row.held === 'no-mid-session' && st.fell === 'no-mid-session', 'THE LAW P23: the await record says the same cause', row);
  const { pathToFileURL } = await import('node:url');
  const Wd = await import(pathToFileURL(path.join(REPO, 'src/lib/channel-words.js')).href);
  ok(/running, but takes no message mid-session/.test(Wd.awaitLineText(st, { t: (k) => k })), 'P23: …and its line', Wd.awaitLineText(st, { t: (k) => k }));
  R.close();
});
await leg(124, async () => { // P24: the quiet marker move
  const R = rig('p24');
  const g = await R.group('lane', A, [B]);
  await R.eng.setNotify({ member: B, group: g, by: B, notify: 'always' });
  await R.at(100); await R.say(g, A, 'plain one');
  await R.at(5100); await R.say(g, A, 'plain two');
  const parked = R.owed(B).length;
  await R.eng.setNotify({ member: B, group: g, by: B, notify: 'mention' });
  const rep = await R.turn(B);
  const lines = R.deliver.stashEntries(A).filter((x) => /wake/.test(x.text)).map((x) => x.text);
  ok(parked === 1 && rep.text === '' && R.owed(B).length === 0, 'P24: the shape: always, parked, now mention + a turn: nothing handed, the marker past it', { parked, rep: rep.text, owed: R.owed(B).length });
  ok(lines.length === 1 && /^Your wake of beta in group "lane" was NOT sent \(mode-changed\): its notify mode is mention now/.test(lines[0]) && /it will not reach them/.test(lines[0]), 'THE LAW P24: a quiet marker move over an owed record is a FALL, said to the sender', lines);
  await R.at(200000);
  ok(R.posts.length === 1, 'P24: …and no wake bills for it', R.posts.length);
  R.close();
  // the owner holds the same promise
  const W = rig('p24o');
  const g2 = await W.group('lane', A, [B]);
  await W.eng.setNotify({ member: B, group: g2, by: B, notify: 'always' });
  const own = (t) => W.eng.post({ group: g2, from: G.OWNER, text: t, mayWake: W.eng.pacerFor(G.OWNER) });
  await W.at(100); await own('plain one');
  await W.at(5100); await own('plain two');
  await W.eng.setNotify({ member: B, group: g2, by: B, notify: 'mention' });
  await W.turn(B);
  ok(W.todos.snapshot().open.some((i) => /beta was not woken in lane/.test(String(i.text))), 'THE LAW P24: the owner hears it too', W.todos.snapshot().open.map((i) => i.text));
  W.close();
});
await leg(125, async () => { // P24: the two silent ends that stay, and the half
  const R = rig('p24c');
  const g = await R.group('lane', A, [B]);
  await R.at(100); await R.say(g, A, '@beta one');
  await R.at(5100); await R.say(g, A, '@beta two');
  const rep = await R.turn(B);
  ok(/two/.test(rep.text) && R.owed(B).length === 0 && !R.deliver.stashEntries(A).some((x) => /wake/.test(x.text)), 'P24: CONTROL: a report that CARRIED the message ends silently', { rep: rep.text, stash: R.deliver.stashEntries(A) });
  R.close();
  const H = rig('p24h');   // one entry, two senders: the member's report hands gamma's @ and not alpha's plain line
  const g3 = await H.group('lane', A, [B, C]);
  await H.eng.setNotify({ member: B, group: g3, by: B, notify: 'always' });
  await H.at(100); await H.say(g3, A, 'plain one');
  await H.at(200); await H.say(g3, C, '@beta early');
  await H.at(5100); await H.say(g3, A, 'plain from alpha');
  await H.at(6100); await H.say(g3, C, '@beta from gamma');
  ok(H.owed(B).length === 1 && H.owed(B)[0].senders.length === 2, 'P24: one owed entry, two senders');
  await H.eng.setNotify({ member: B, group: g3, by: B, notify: 'mention' });
  const r2 = await H.turn(B);
  ok(/from gamma/.test(r2.text) && !/plain from alpha/.test(r2.text) && H.owed(B).length === 0, 'P24: the report hands gamma\'s @, not alpha\'s plain line', r2.text);
  ok(H.deliver.stashEntries(A).some((x) => /NOT sent \(mode-changed\)/.test(x.text)), 'THE LAW P24: alpha, whose message no report carried, hears it', H.deliver.stashEntries(A));
  ok(!H.deliver.stashEntries(C).some((x) => /wake/.test(x.text)), 'P24: …gamma, whose message rode, does not', H.deliver.stashEntries(C));
  H.close();
  // the frame's road: the marker found past the record with no settle having run (a hub that stopped between the two)
  const F2 = rig('p24f');
  const g4 = await F2.group('lane', A, [B]);
  await F2.eng.setNotify({ member: B, group: g4, by: B, notify: 'always' });
  await F2.at(100); await F2.say(g4, A, 'plain one');
  await F2.at(5100); await F2.say(g4, A, 'plain two');
  await F2.eng.setNotify({ member: B, group: g4, by: B, notify: 'mention' });
  await F2.store.groups.update((gr) => { const m = G.memberOf(gr.groups[g4], B); m.reportedUpTo = T0 + 5100 + 1; });
  await F2.at(40000);
  ok(F2.owed(B).length === 0 && F2.posts.length === 1 && F2.deliver.stashEntries(A).some((x) => /NOT sent \(mode-changed\)/.test(x.text)), 'THE LAW P24: the frame reads the marker the same way: a fall, said', F2.deliver.stashEntries(A));
  F2.close();
});
// ── THE THREE CENSUSES: each law lives in ONE function, and every road calls it ───────────────────────────────────────────
const srcFiles = (dir, out = []) => { for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, n.name); if (n.isDirectory()) srcFiles(p, out); else if (n.name.endsWith('.js')) out.push(p); } return out; };
const SRC = srcFiles(path.join(REPO, 'src')).map((p) => ({ rel: path.relative(REPO, p), text: fs.readFileSync(p, 'utf-8') }));
const sitesOf = (re) => SRC.flatMap((f) => { const n = (f.text.match(re) || []).length; return n ? [[f.rel, n]] : []; });
const cdSrc12 = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf-8'), geSrc12 = fs.readFileSync(path.join(REPO, 'src/server/groups-engine.js'), 'utf-8'), obSrc12 = fs.readFileSync(path.join(REPO, 'src/server/channels-outbound.js'), 'utf-8');
const between = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i < 0 || j < 0 ? '' : src.slice(i, j); };
await leg(126, async () => { // THE GATE CENSUS
  const callers = sitesOf(/\bparkOwedWake\(/g).filter(([rel]) => rel !== 'src/server/conversation-deliver.js');
  ok(JSON.stringify(callers.sort()) === JSON.stringify([['src/server/channels-outbound.js', 1], ['src/server/groups-engine.js', 1]]), 'THE CENSUS (gate): parkOwedWake has exactly its two callers; a new road is red here until it is read', callers);
  const door = between(cdSrc12, 'function parkOwedWake(', 'const now = clock.now();');
  ok(/const blocked = wakeBlock\(cid\);/.test(door) && /return \{ parked: false, blocked \}/.test(door), 'THE CENSUS (gate): the gate is INSIDE the door, before anything is stored, so every caller goes through it', door.slice(-200));
  ok(!/blockedBy\(member\)\) return null/.test(geSrc12), 'THE CENSUS (gate): no road keeps a gate of its own beside it');
  ok(/deliver\.wakeBlock\(p0\.draftedBy\.id\)/.test(between(obSrc12, 'function receiptPaceFor(', 'function stampReceiptChoice(')), 'THE CENSUS (gate): the door that must promise before it parks asks the same function');
  // every road, in every state a wake cannot fire
  for (const state of Object.keys(STATES)) {
    let up = true;
    const R = rig('gate-' + state, { peerOf: (cid) => (cid !== B || up ? { name: cid, socketPath: '/dev/null' } : null) });
    const g = await R.group('lane', A, [B, C]);
    await R.at(100); await R.say(g, A, '@beta one');
    up = false; STATES[state].to(R);
    await R.at(5100);
    const send = await R.say(g, A, '@beta over the floor');
    const dm = await R.eng.sendToAgent({ from: C, to: B, text: 'dispatch', wake: true, create: true, mayWake: Object.assign(() => ({ reason: 'x', rule: 'the rule', retryInMs: 25000 }), { sender: C, refund() { } }) });
    const direct = R.deliver.parkOwedWake(B, { producer: 'census', key: 'k', retryInMs: 25000, sender: A, meta: {} });
    ok(R.deliver.retryPeek(B).length === 0 && !(send.refused[0] && send.refused[0].parked) && direct.parked === false && direct.blocked.cause === state, `THE CENSUS (gate, ${state}): send, dispatch and a direct call park nothing`, { queue: R.deliver.retryPeek(B).length, send: send.refused, direct });
    ok(dm && (dm.refused || []).every((x) => !x.parked), `THE CENSUS (gate, ${state}): …the dispatch road's answer promises no park`, dm && dm.refused);
    R.close();
  }
  const R = rig('gate-await', { peerOf: (cid) => (cid !== A ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('pair', A, [B]);
  await R.at(100); await R.say(g, B, '@alpha hello');
  await R.at(1100); await R.say(g, A, 'a question?', { awaitReply: true });
  R.sessions.get('w-alpha').backend = 'opencode';
  await R.at(2100); const a = await R.say(g, B, 'the answer');
  ok(a.awaited[0] && a.awaited[0].held === 'no-mid-session' && R.owed(A).length === 0, 'THE CENSUS (gate): the await road: not parked, the cause from the same function', a.awaited);
  R.close();
});
await leg(127, async () => { // THE WORDS CENSUS
  ok(JSON.stringify(sitesOf(/\bowedFallsText\(/g)) === JSON.stringify([['src/server/conversation-deliver.js', 2]]) && JSON.stringify(sitesOf(/\bfileOwedNotice\(/g)) === JSON.stringify([['src/server/conversation-deliver.js', 2]]), 'THE CENSUS (words): one words function, one door (a definition + one caller each)', [sitesOf(/\bowedFallsText\(/g), sitesOf(/\bfileOwedNotice\(/g)]);
  const door = between(cdSrc12, 'function fileOwedNotice(', 'open.text = text;');
  ok(/const text = owedFallsText\(f\);/.test(door) && !/\bn\.text\b/.test(cdSrc12), 'THE CENSUS (words): the door writes only what the function wrote; a producer\'s sentence is never read', door.slice(-160));
  ok(!/\btext:/.test(between(geSrc12, '      notice: {', '      },')) && /fell: \(\) => true/.test(cdSrc12), 'THE CENSUS (words): a producer hands over facts, no sentence', between(geSrc12, '      notice: {', '      },'));
  ok(JSON.stringify(sitesOf(/\bowedFalls\b/g).map(([rel]) => rel).filter((rel) => !['src/server/conversation-deliver.js', 'src/server/groups-engine.js'].includes(rel))) === '[]' && !/stashFor\(/.test(between(geSrc12, 'function owedFell(', 'function tellOwnerOwedFell(')), 'THE CENSUS (words): nobody else writes a sender\'s fall line');
  // every cause in the ONE list, through the real door: alone and folded
  for (const cause of G.AWAIT_FELL) {
    const R = rig('words-' + cause);
    R.deliver.registerOwedWake('census', { render: () => null, fell: (cid, e) => ({ taken: true, notice: { to: [A], why: `paced-${cause}`, outcome: cause, name: NAMES[cid], reaches: true, command: e.key, where: 'group "x"', said: 'because' } }) });
    const fall = (cid, key) => { R.deliver.parkOwedWake(cid, { producer: 'census', key, retryInMs: 25000, sender: A, meta: {} }); R.deliver.fellOwed(cid, R.deliver.owedEntries(cid, 'census')[0], 'because', {}); };
    fall(B, 'k1');
    const alone = R.deliver.stashEntries(A).find((x) => /wake/.test(x.text));
    const may = cause === 'may-have-landed', helps = G.RESEND_HELPS.includes(cause);   // «send again» only where a second wake may land (r7 + r8's nits)
    ok(alone && /send again/.test(alone.text) === (!may && helps) && /second turn/.test(alone.text) === may, `THE CENSUS (words, ${cause}): alone: «send again» only for a sure miss a wake could cure`, alone && alone.text);
    fall(C, 'k2');
    const fold = R.deliver.stashEntries(A).filter((x) => /wake/.test(x.text));
    ok(fold.length === 1 && /send again/.test(fold[0].text) === (!may && helps) && /second turn/.test(fold[0].text) === may, `THE CENSUS (words, ${cause}): folded: the same`, fold.map((x) => x.text));
    if (G.LIVE_FALLS.includes(cause)) ok(fold.length === 1 && fold[0].text.includes(G.FALL_WHY[cause]) && !/not running/.test(fold[0].text), `THE CENSUS (words, ${cause}): …and the fold says what it is`, fold[0] && fold[0].text);
    R.close();
  }
});
await leg(128, async () => { // THE CAUSE CENSUS
  const body = between(cdSrc12, 'function fellRetry(', 'releaseHoldOf(e);');
  ok(/const state = fallCause\(e, kind\);/.test(body), 'THE CENSUS (cause): the fall\'s one door reads the cause first, so every road (park, attempt, peer miss) does', body);
  ok((cdSrc12.match(/\bliveStateOf\(/g) || []).length === 4 && (cdSrc12.match(/liveStateOf\(cid\)/g) || []).length >= 2, 'THE CENSUS (cause): one reader of the target\'s state: its definition, liveWithoutLane, the gate, the fall', (cdSrc12.match(/\bliveStateOf\(/g) || []).length);
  ok(JSON.stringify(sitesOf(/\bAWAIT_FELL\.includes\(/g).map(([rel]) => rel)) === JSON.stringify(['src/channel-groups.js']) && /const why = owedOutcome\(extra\);/.test(between(obSrc12, 'async function noteReceiptWakeFell(', 'let moved = false;')) && /const outcome = G\.owedOutcome\(extra\);/.test(between(geSrc12, 'function owedFell(', 'function tellOwnerOwedFell(')) && /const outcome = owedOutcome\(extra\);/.test(between(cdSrc12, 'function fellRetry(', 'function retryFrameOf(')), 'THE CENSUS (cause): owedOutcome is the only way a fall is named, on all three: the groups, the receipt, the park', sitesOf(/\bAWAIT_FELL\.includes\(/g));
  ok(!/blockedCause/.test(geSrc12), 'THE CENSUS (cause): no second list maps a reason to a cause');
  // every cause in the ONE list has its words everywhere the fall is read
  ok(G.AWAIT_FELL.every((c) => typeof G.FALL_WHY[c] === 'string' && zh12.includes(JSON.stringify(G.FALL_WHY[c]) + ':') && ja12.includes(JSON.stringify(G.FALL_WHY[c]) + ':')) && new Set(G.AWAIT_FELL.map((c) => G.FALL_WHY[c])).size === G.AWAIT_FELL.length, 'THE CENSUS (cause): every cause has its own row in the ONE table, with zh + ja', G.AWAIT_FELL.filter((c) => !G.FALL_WHY[c]));
  const cli = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-msg'), 'utf-8');
  ok(G.AWAIT_FELL.every((c) => new RegExp(`'?${c}'?: '`).test(between(cli, 'const AWAIT_FELL = {', '};'))), 'THE CENSUS (cause): …the agent\'s `read` line has every one');
  for (const c of G.LIVE_FALLS) {
    const card = PP.receiptFateText({ kind: 'waiting', who: 'beta', wakeFell: c }, { t: tFill });
    ok(!/not running/.test(card) && !/did not reach/.test(card), `THE CENSUS (cause, ${c}): the card has its own words`, card);
  }
  // road × state: the cause the sender reads
  for (const road of ['attempt', 'peer-miss']) for (const state of Object.keys(STATES)) {
    const o = await fallAt(`cause-${road}-${state}`, state, { road });
    const live = G.LIVE_FALLS.includes(state);
    ok(o.parked === 1 && o.line.includes(`was NOT sent (${state})`) && STATES[state].words.test(o.line) && (!live || !/not running/.test(o.line)), `THE CENSUS (cause, ${road} × ${state}): the line names it`, o.line);
    o.R.close();
    const w = await fallAt(`cause-o-${road}-${state}`, state, { road, from: G.OWNER });
    ok(w.item && w.item.i18n.text.params.why.key === G.FALL_WHY[state], `THE CENSUS (cause, ${road} × ${state}): the owner's item names it`, w.item && w.item.text);
    w.R.close();
  }
});
await leg(129, async () => { // the mutants: each law's function taken away, red by name
  const Ms = mutantCopies('pwr-r7', REPO);
  const cdPath = 'src/server/conversation-deliver.js', gePath = 'src/server/groups-engine.js';
  const swap = (src, a, b) => { if (!src.includes(a)) throw new Error('control anchor moved: ' + a.slice(0, 60)); return editAnchor(src, a, b, "the text handed to swap()"); };
  { // the gate open: the receipt road's measured shape comes back
    const CDm = Ms.load(cdPath, swap(cdSrc12, 'function wakeBlock(cid) {\n', 'function wakeBlock(cid) { return null;\n'), 'no-gate');
    const R = await receiptRoad('m-gate', { state: 'no-mid-session', DELIVER: CDm });
    ok(R.owed(B).length === 1 && /sends it in/.test(R.toast()), '(xviii) CONTROL: without the gate a live opencode drafter is parked and promised «sends it in N s»', { owed: R.owed(B).length, toast: R.toast() });
    R.done();
  }
  { // the gate out of the door: the groups road's flood
    const CDm = Ms.load(cdPath, swap(cdSrc12, 'const blocked = wakeBlock(cid);\n', 'const blocked = null;\n'), 'gate-out');
    let up = true;
    const R = rig('m-door', { DELIVER: CDm, peerOf: (cid) => (cid !== B || up ? { name: cid, socketPath: '/dev/null' } : null) });
    const g = await R.group('lane', A, [B]);
    await R.at(100); await R.say(g, A, '@beta one');
    up = false; R.sessions.delete('w-beta');
    await R.at(5100); await R.say(g, A, '@beta two');
    ok(R.owed(B).length === 1, '(xix) CONTROL: with the gate out of the door a stopped target is parked', R.owed(B).length);
    R.close();
  }
  { // the words: the lone fall with a sentence of its own
    const CDm = Ms.load(cdPath, swap(cdSrc12, 'const one = f.n === 1 ? f.one : null;', 'const one = null;'), 'no-single');
    const o = await fallAt('m-words', 'not-running', { DELIVER: CDm });
    ok(!/^Your wake of beta/.test(o.line), '(xx) CONTROL: the single-fall branch is what writes the single sentence', o.line);
    o.R.close();
  }
  { // the cause: no reading of the state at the fall
    const CDm = Ms.load(cdPath, swap(cdSrc12, "function fallCause(e, kind) { return isOwed(e) && kind === 'not-running' ? liveStateOf(e.cid) : null; }", 'function fallCause(e, kind) { return null; }'), 'no-cause');
    const o = await fallAt('m-cause', 'terminal', { DELIVER: CDm });
    ok(/\(not-running\)/.test(o.line), '(xxi) CONTROL: with no fallCause a running terminal is called not-running', o.line);
    o.R.close();
  }
  { // the marker: every move read as carried
    const GEm = Ms.load(gePath, swap(geSrc12, 'function owedPastMarker(g, m, e) {\n', 'function owedPastMarker(g, m, e) { return null;\n'), 'all-carried');
    const R = rig('m-marker', { GE: GEm });
    const g = await R.group('lane', A, [B]);
    await R.eng.setNotify({ member: B, group: g, by: B, notify: 'always' });
    await R.at(100); await R.say(g, A, 'plain one');
    await R.at(5100); await R.say(g, A, 'plain two');
    await R.eng.setNotify({ member: B, group: g, by: B, notify: 'mention' });
    await R.turn(B);
    ok(R.owed(B).length === 0 && !R.deliver.stashEntries(A).some((x) => /wake/.test(x.text)), '(xxii) CONTROL: a marker read as «carried» ends the wake silently', R.deliver.stashEntries(A));
    R.close();
  }
});

// ── §13 ROUND 8 ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§13 round 8: «reaches» is ONE function every road reads; the toast and the card name one cause');
const geSrc13 = fs.readFileSync(path.join(REPO, 'src/server/groups-engine.js'), 'utf-8');
/** P25 (1), the acceptance's probe: a wake that is NOT about the await moves a mention-mode asker past its awaited reply */
const thirdSenderWake = async (name, GE = GE0) => {
  const R = rig(name, { GE });
  const g = await R.group('room', A, [B, C]);
  await R.eng.setNotify({ member: A, group: g, by: A, notify: 'mention' });
  await R.at(100); await R.say(g, B, '@alpha hello');   // the B|A floor
  await R.at(1100); const q = await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(2100); const a = await R.say(g, B, 'THE-ANSWER no at');
  const parked = R.owed(A).length;
  await R.at(3100); await R.say(g, C, '@alpha ping');   // C's own wake to A goes
  const afterPing = R.posts.filter((p) => p.cid === A).map((p) => p.text);
  await R.at(200000);
  const toA = R.posts.filter((p) => p.cid === A).map((p) => p.text);
  const row = R.eng.get(g).awaits[q.message.vendorId];
  const out = { parked, paced: a.awaited[0] && a.awaited[0].held, carried: afterPing.filter((t) => t.includes('THE-ANSWER')).length, answerPosts: toA.filter((t) => t.includes('THE-ANSWER')).length, owed: R.owed(A).length, told: R.deliver.stashEntries(B).filter((x) => /wake/.test(x.text)).map((x) => x.text), state: G.awaitState({ raw: q.message.raw }, row, R.c.now), next: (await R.turn(A)).text };
  R.close();
  return out;
};
/** P25 (2): the fall of a mention-mode asker's awaited reply; its next turn carries the reply */
const askerFalls = async (name, from, GE = GE0) => {
  let up = true;
  const R = rig(name, { GE, peerOf: (cid) => (cid !== A || up ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('pair', A, [B]);
  await R.eng.setNotify({ member: A, group: g, by: A, notify: 'mention' });
  const say = (t, x = {}) => (from === G.OWNER ? R.eng.post({ group: g, from, text: t, mayWake: R.eng.pacerFor(from), ...x }) : R.say(g, from, t, x));
  await R.at(100); await say('@alpha first ping');
  await R.at(1000); await R.say(g, A, 'a question?', { awaitReply: true });
  await R.at(5000); await say('THE-ANSWER no at');
  const parked = R.owed(A).length;
  up = false; R.sessions.delete('w-alpha');
  await R.at(100000);
  const out = { parked, line: (R.deliver.stashEntries(B).find((x) => /wake/.test(x.text)) || {}).text || '', item: R.todos.snapshot().open.find((i) => /alpha/.test(String(i.text))) || null, next: (await R.turn(A)).text };
  R.close();
  return out;
};
await leg(130, async () => { // P25 (1)
  const o = await thirdSenderWake('p25a');
  ok(o.parked === 1 && o.paced === 'paced', 'P25: the shape: the awaited reply\'s wake is paced and parked', o);
  ok(o.carried === 1, 'THE LAW P25: the third sender\'s wake that moves the asker\'s marker HANDS the awaited reply (the report applies the one rule)', o);
  ok(o.owed === 0 && o.answerPosts === 1 && o.told.length === 0, 'THE LAW P25: …so its silent end is a report that carried it: no second post, nothing to tell', o);
  ok(o.state && o.state.state !== 'held' && !o.next.includes('THE-ANSWER'), 'P25: …the record no longer «held», and the next turn does not repeat it', o);
  // the asker with TWO awaits: the second reply's wake goes and hands the first
  const R = rig('p25b');
  const g = await R.group('room', A, [B, D]);
  await R.eng.setNotify({ member: A, group: g, by: A, notify: 'mention' });
  await R.at(100); await R.say(g, B, '@alpha hello');
  await R.at(1100); await R.say(g, A, 'question one?', { awaitReply: true });
  await R.at(2100); await R.say(g, B, 'ANSWER-ONE');
  await R.at(2500); await R.say(g, A, 'question two?', { awaitReply: true });
  await R.at(2600); await R.say(g, D, 'ANSWER-TWO');
  const woke = R.posts.filter((p) => p.cid === A).map((p) => p.text).find((t) => t.includes('ANSWER-TWO')) || '';
  ok(woke.includes('ANSWER-ONE'), 'THE LAW P25: two awaits: the second reply\'s wake hands the first reply too', woke);
  await R.at(200000);
  ok(R.posts.filter((p) => p.cid === A && p.text.includes('ANSWER-ONE')).length === 1 && R.owed(A).length === 0, 'P25: …once', R.posts.filter((p) => p.cid === A).length);
  R.close();
});
await leg(131, async () => { // P25 (2)
  const o = await askerFalls('p25c', B);
  ok(o.parked === 1 && /NOT sent \(not-running\)/.test(o.line), 'P25: the shape: the asker\'s parked wake falls (not-running)', o.line);
  ok(/reaches them on their next turn/.test(o.line) && !/will not reach/.test(o.line), 'THE LAW P25: the sender is told the reply reaches the asker on its next turn, never «will not reach them»', o.line);
  ok(o.next.includes('THE-ANSWER'), 'P25: …and it is true: the asker\'s next turn carries it', o.next);
  const w = await askerFalls('p25d', G.OWNER);
  const body = w.item ? String(w.item.detail) : '';
  ok(w.item && /1 reach them on their next turn/.test(body) && !/will not reach/.test(body), 'THE LAW P25: the owner\'s item says the same', body);
  ok(w.next.includes('THE-ANSWER'), 'P25: …the owner\'s reply rides the asker\'s next turn too', w.next);
});
await leg(132, async () => { // THE REACHES CENSUS
  const reachBody = between(geSrc13, 'function reachFor(', '\n  }\n');
  ok((geSrc13.match(/reachesReport/g) || []).length === 1 && /G\.reachesReport\(/.test(reachBody), 'THE CENSUS (reaches): B-a354\'s rule is named in ONE place, inside reachFor — by any spelling (a space, a bracket, an alias all name it)', (geSrc13.match(/reachesReport/g) || []).length);
  ok(!/answeredAwaitsOf|awaitedReply/.test(geSrc13), 'THE CENSUS (reaches): no second reading of the awaited-reply rule beside it');
  const calls = geSrc13.split('G.reportFor(').slice(1).map((s) => s.slice(0, s.indexOf('\n')));
  ok(calls.length === 3 && calls.every((c) => /also: reachFor\(/.test(c)), 'THE CENSUS (reaches): every report the engine builds (the wake, the owed frame, the next turn) hands what reachFor hands', calls.map((c) => c.slice(-160)));
  const bodyOf = (a) => between(geSrc13, a, '\n  }\n');
  const roads = { owedPastMarker: ['function owedPastMarker(', /sendersRide\(g, m, e\)/], owedWords: ['function owedWords(', /sendersRide\(g, m, e, /], sendersRide: ['function sendersRide(', /const reach = reachFor\(g, m\.member\)/], owedFell: ['function owedFell(', /const reach = reachFor\(g, cid\)/], pendingOf: ['function pendingOf(', /const reach = reachFor\(g, cid\)/], unreadFor: ['function unreadFor(', /const take = unreceivedFor\(g, who\)/], bumpUnread: ['function bumpUnread(', /unreceivedFor\(g, who\)\(rec\)/], unreceivedFor: ['function unreceivedFor(', /reachFor\(g, who\)/], wakeAll: ['async function wakeAll(', /reachFor\(g, m\)\(rec\)/], ended: ['async function onConversationEnded(', /const take = unreceivedFor\(g, cid\)/] };
  const missing = Object.entries(roads).filter(([, [a, re]]) => !re.test(bodyOf(a))).map(([k]) => k);
  ok(missing.length === 0, 'THE CENSUS (reaches): the marker, the frame, the fall, the strip, the unread count, the next-turn promise and an ended pair all read it (through sendersRide / unreceivedFor, each built on it)', missing);
  ok((geSrc13.match(/retryTake/g) || []).length === 2 && /if \(rode\.length\) deliver\.retryTake\(member, rode, \{ via: 'prompt' \}\);/.test(between(geSrc13, 'function settleOwed(', '\n  }\n')), 'THE CENSUS (marker): the park\'s cancel is named twice in the engine, its guard and its ONE call after the per-sender reading — an alias names it a third time', (geSrc13.match(/retryTake/g) || []).length);
  ok(SRC.filter((f) => f.rel !== 'src/channel-groups.js' && f.rel !== 'src/server/groups-engine.js' && /\breachesReport\(/.test(f.text)).length === 0, 'THE CENSUS (reaches): no other file reads the rule on its own');
  // the census blind spot the acceptance planted (P8): one builder of an owed entry
  const builders = sitesOf(/held\s*:\s*\{\s*why\s*:\s*['"`]paced['"`]/g);
  ok(JSON.stringify(builders) === JSON.stringify([['src/server/conversation-deliver.js', 1]]) && /held: \{ why: 'paced'/.test(between(cdSrc12, 'function parkOwedWake(', 'function fellOwed(')), 'THE CENSUS (gate): ONE place builds an owed entry, inside the gated door', builders);
});
await leg(133, async () => { // THE MARKER CENSUS (by grep, like the other three; r7's pin was by behaviour only)
  ok((geSrc13.match(/\bowedPastMarker\(/g) || []).length === 3, 'THE CENSUS (marker): owedPastMarker = its definition + two readers', (geSrc13.match(/\bowedPastMarker\(/g) || []).length);
  const settle = between(geSrc13, 'function settleOwed(', '\n  }\n');
  ok(/owedPastMarker\(g, m, e\)/.test(settle) && settle.indexOf('owedPastMarker(') < settle.indexOf('deliver.retryTake('), 'THE CENSUS (marker): the settle reads the moved marker through it before any cancel', settle.slice(0, 400));
  ok(/if \(Number\(m\.reportedUpTo\) >= Number\(at\)\) return owedPastMarker\(g, m, e\);/.test(between(geSrc13, 'function owedWords(', '\n  }\n')), 'THE CENSUS (marker): the owed frame reads it the same way');
  ok((geSrc13.match(/deliver\.retryTake\(/g) || []).length === 1, 'THE CENSUS (marker): ONE cancel of an owed wake in the groups engine, the one after that reading', (geSrc13.match(/deliver\.retryTake\(/g) || []).length);
});
await leg(134, async () => { // P26: the toast and the card name the same cause, every blocked cause
  const zhMap = new Map();
  for (const m of zh12.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*"),?\s*$/gm)) { try { zhMap.set(JSON.parse(m[1]), JSON.parse(m[2])); } catch { } }
  const tZh = (k, o = {}) => tFill(zhMap.has(k) ? zhMap.get(k) : `«untranslated: ${k}»`, o);
  const policy = fs.readFileSync(path.join(REPO, 'src/channel-policy.js'), 'utf-8');
  for (const cause of ['not-running', ...G.LIVE_FALLS]) {
    ok(between(policy, 'function blockedText(', 'function receiptFateOf(').includes(`'${G.FALL_WHY[cause]}'`), `P26: the card's and toast's words for ${cause} are G.FALL_WHY's row, character for character`);
  }
  // the race road (r8's nit): a drafter that left between the decision and the receipt — the park skipped as «gone»; the toast names the cause, never the rule
  for (const t of [tFill, tZh]) {
    const raced = PP.receiptPacedText({ state: 'sent', receiptChoicePaced: 'the rule', receiptDelivery: { stashed: true, gone: true, ok: false } }, { t });
    ok(raced.includes(t === tFill ? G.FALL_WHY['not-running'] : zhMap.get(G.FALL_WHY['not-running'])) && !/the rule|untranslated/.test(raced), `P26 (r8's nit): the race road's toast names the cause${t === tZh ? ' (zh)' : ''}`, raced);
  }
  const shapes = [{ cause: 'not-running', setup: (R) => STATES['not-running'].to(R) }, ...DRAFTERS.slice(0, 3)];
  for (const d of shapes) {
    const R = await receiptRoad('p26-' + d.cause, { setup: d.setup });
    const words = G.FALL_WHY[d.cause];
    const stopped = d.cause === 'not-running';   // a stopped drafter is not live: its card is the «gone» fate (the receipt kept), its toast names the cause
    ok(R.toast().includes(words) && (stopped ? /beta is gone — receipt kept/.test(R.card()) : R.card().includes(words)) && !R.toast().includes('the rule'), `THE LAW P26: ${d.cause}: the toast and the card name the same cause`, { toast: R.toast(), card: R.card() });
    const zt = PP.receiptPacedText(R.stored(), { t: tZh }), zc = PP.receiptFateText(PP.receiptFateOf(R.stored()), { t: tZh });
    ok(zt.includes(zhMap.get(words)) && (stopped || zc.includes(zhMap.get(words))) && !/the rule|untranslated/.test(zt + zc), `THE LAW P26: ${d.cause}: in zh too, no English rule inside`, { zt, zc });
    R.done();
  }
});
await leg(135, async () => { // the mutants: a planted second reading of «reaches», red by name
  const Ms = mutantCopies('pwr-r8', REPO);
  const gePath = 'src/server/groups-engine.js';
  const swap = (src, a, b) => { if (!src.includes(a)) throw new Error('control anchor moved: ' + a.slice(0, 60)); return editAnchor(src, a, b, "the text handed to swap()"); };
  { // the wake road reads its own await only (633ea88bc's line)
    const GEm = Ms.load(gePath, swap(geSrc13, 'also: reachFor(g, member, awaitAt != null ? { from: awaitAt, to: rec.at } : null) });', 'also: awaitAt != null ? ((r) => Number(r.at) > Number(awaitAt) && Number(r.at) <= Number(rec.at)) : null });'), 'wake-own-reading');
    const o = await thirdSenderWake('m-reach1', GEm);
    ok(o.carried === 0 && o.answerPosts === 0 && o.owed === 0 && o.told.length === 0, '(xxiii) CONTROL: a wake road with its own reading of «reaches» loses the awaited reply with nobody told (the acceptance\'s measure)', o);
  }
  { // the fall reads a bare report
    const GEm = Ms.load(gePath, swap(geSrc13, "reaches = !!mm && readLog(gid).some((r) => r && Number(r.at) >= from && Number(r.at) <= to && Number(r.at) > since && r.author && mine.has(r.author.id) && reach(r));", 'reaches = !!G.reportFor(g, readLog(gid), cid);'), 'fall-bare');
    const o = await askerFalls('m-reach2', B, GEm);
    ok(/will not reach them/.test(o.line) && o.next.includes('THE-ANSWER'), '(xxiv) CONTROL: a fall with its own reading tells the sender «will not reach them» about a reply the next turn carries', o.line);
  }
  { // the marker read by B-a354's rule alone
    const GEm = Ms.load(gePath, swap(geSrc13, '.map((r) => ({ r, handed: reach(r) }));', '.map((r) => ({ r, handed: G.reachesReport(g, m.member, r) }));'), 'marker-own-reading');
    const o = await thirdSenderWake('m-reach3', GEm);
    ok(o.carried === 1 && o.told.length === 1, '(xxv) CONTROL: a marker with its own reading calls a carried reply a fall', o);
  }
  { // the next turn without it
    const GEm = Ms.load(gePath, swap(geSrc13, "also: reachFor(g, cid) });\n      if (!rep) { quiet.push(", "also: null });\n      if (!rep) { quiet.push("), 'turn-no-reach');
    const o = await askerFalls('m-reach4', B, GEm);
    ok(!o.next.includes('THE-ANSWER'), '(xxvi) CONTROL: a next-turn report with its own reading drops the awaited reply', o.next);
  }
  { // P27: the leg names Antigravity, so Antigravity's own road broken must turn it red (the stand-in row it drove before could not see this)
    const CDm = Ms.load('src/server/conversation-deliver.js', swap(cdSrc12, "if (wc && wc.reason !== 'no-sidecar' && !wc.peerMessage) return { cause: 'predates'", "if (false) return { cause: 'predates'"), 'no-predates');
    const ag = await receiptRoad('m-p27-ag', { setup: DRAFTERS[0].setup, DELIVER: CDm });
    const stand = await receiptRoad('m-p27-stand', { setup: DRAFTERS[3].setup, DELIVER: CDm });
    ok(ag.owed(B).length === 1 && /sends it in/.test(ag.toast()), '(xxvii) CONTROL: with the old-wrapper reading taken out, the Antigravity drafter is parked and promised «sends it in N s» — the leg goes red', { owed: ag.owed(B).length, toast: ag.toast() });
    ok(stand.owed(B).length === 0 && /takes no message mid-session/.test(stand.toast()), '(xxvii) …while the stand-in row (no caps row) stays green: it never proved Antigravity', stand.toast());
    ag.done(); stand.done();
  }
});

// ── §14 ROUND 9 ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§14 round 9: one per-sender reading on the frame too, a fall told per sender past the marker, one «never received» count; a census by behaviour');
const geSrc14 = fs.readFileSync(path.join(REPO, 'src/server/groups-engine.js'), 'utf-8');
/** leg 125's half shape: one owed entry, two senders (alpha's plain line, gamma's @beta), beta switches to mention; `road`: 'frame' = the window ends first, 'turn' = beta turns first */
const halfShape = async (name, road, { GE = GE0, from = A } = {}) => {
  const R = rig(name, { GE });
  const g = await R.group('lane', A, [B, C]);
  await R.eng.setNotify({ member: B, group: g, by: B, notify: 'always' });
  const say = (who, t) => (who === G.OWNER ? R.eng.post({ group: g, from: who, text: t, mayWake: R.eng.pacerFor(who) }) : R.say(g, who, t));
  await R.at(100); await say(from, 'plain one');
  await R.at(200); await say(C, '@beta early');
  await R.at(5100); await say(from, 'plain from alpha');
  await R.at(6100); await say(C, '@beta from gamma');
  const entry = R.owed(B)[0];
  await R.eng.setNotify({ member: B, group: g, by: B, notify: 'mention' });
  if (road === 'turn') await R.turn(B);
  await R.at(200000);
  const frames = R.posts.filter((p) => p.cid === B).map((p) => p.text).slice(2);
  const out = { senders: entry ? entry.senders.length : 0, frames: frames.length, gamma: frames.some((t) => t.includes('from gamma')), alpha: frames.some((t) => t.includes('plain from alpha')), owed: R.owed(B).length, line: (R.deliver.stashEntries(A).find((x) => /wake/.test(x.text)) || {}).text || '', gammaTold: R.deliver.stashEntries(C).filter((x) => /wake/.test(x.text)).length, item: R.todos.snapshot().open.find((i) => /beta/.test(String(i.text))) || null, next: (await R.turn(B)).text };
  R.close();
  return out;
};
await leg(140, async () => { // F1: the frame road
  const o = await halfShape('f1', 'frame');
  ok(o.senders === 2 && o.frames === 1 && o.gamma && !o.alpha, 'F1: the shape: one entry, two senders; the window ends first; the frame carries gamma\'s @, not alpha\'s plain line', o);
  ok(/^Your wake of beta in group "lane" was NOT sent \(mode-changed\): its notify mode is mention now/.test(o.line), 'THE LAW F1: alpha, none of whose records the frame carried, is TOLD (mode-changed)', o);
  ok(/will not reach them/.test(o.line) && o.gammaTold === 0 && o.owed === 0 && !o.next.includes('plain from alpha'), 'F1: …that its message will not reach beta (true: beta\'s next turn has nothing of it); gamma, carried, hears nothing', o);
  const w = await halfShape('f1o', 'frame', { from: G.OWNER });
  const body = w.item ? String(w.item.detail) : '';
  ok(w.item && /^beta was not woken in lane: its notify mode no longer asks for a wake$/.test(w.item.text) && /will not reach them: beta/.test(body), 'THE LAW F1: the owner as that sender is told the same', { text: w.item && w.item.text, body });
});
await leg(141, async () => { // F2: a fall's «reaches» per sender, past the marker
  const o = await halfShape('f2', 'turn');
  ok(/NOT sent \(mode-changed\)/.test(o.line) && /will not reach them/.test(o.line) && !/reaches them on their next turn/.test(o.line) && !o.next.includes('plain from alpha'), 'THE LAW F2: the half shape: alpha is told «will not reach them», and it is true', o);
  const w = await halfShape('f2o', 'turn', { from: G.OWNER });
  const body = w.item ? String(w.item.detail) : '';
  ok(/1 will not reach them: beta/.test(body) && !/reach them on their next turn/.test(body), 'THE LAW F2: the owner\'s item counts it under «will not reach»', body);
  // the other side: the sender's OWN un-passed plain line does ride the next turn
  let up = true;
  const R = rig('f2r', { peerOf: (cid) => (cid !== B || up ? { name: cid, socketPath: '/dev/null' } : null) });
  const g = await R.group('lane', A, [B]);
  await R.eng.setNotify({ member: B, group: g, by: B, notify: 'always' });
  await R.at(100); await R.say(g, A, 'plain one');
  await R.at(5100); await R.say(g, A, 'OWN-PLAIN-LINE');
  up = false; R.sessions.delete('w-beta');
  await R.at(100000);
  const line = (R.deliver.stashEntries(A).find((x) => /wake/.test(x.text)) || {}).text || '';
  const next = (await R.turn(B)).text;
  ok(/NOT sent \(not-running\)/.test(line) && /reaches them on their next turn/.test(line) && next.includes('OWN-PLAIN-LINE'), 'F2: CONTROL: a fallen sender whose own un-passed line rides the next turn is told so, truly', { line, next });
  R.close();
});
/** F3: the ended pair's count and the unread count, one rule, for each mode */
const noWake = Object.assign(() => ({ reason: 'test: no wake' }), { refund() { } });   // nothing is woken, nothing parked: the counts alone
const endedCount = async (name, mode, { awaited = false } = {}) => {
  const R = rig(name);
  const pair = await R.eng.sendToAgent({ from: A, to: B, text: 'hello', wake: false, create: true });
  const g = pair.group.id;
  await R.turn(B);   // the marker past «hello», in the pair's default mode
  await R.eng.setNotify({ member: B, group: g, by: B, notify: mode });
  const say = (who, t, x = {}) => R.eng.post({ group: g, from: who, text: t, mayWake: noWake, ...x });
  if (awaited) { await R.at(1000); await say(B, 'a question?', { awaitReply: true }); }
  for (let i = 0; i < 3; i++) { await R.at(2000 + i * 100); await say(A, i === 2 ? '@beta three' : `plain ${i}`); }
  const unread = (R.eng.listFor(B).find((x) => x.id === g) || {}).unread;
  await R.eng.onConversationEnded(B, { why: 'archived' });
  const rec = (R.eng.read({ by: A, group: g }).records || []).find((r) => r.raw && (r.raw.kind === 'closed' || r.raw.kind === 'ended'));
  R.close();
  return { unread, lost: rec ? rec.raw.lost : null };
};
await leg(142, async () => { // F3
  const shapes = { mute: 3, always: 3, 'next-turn': 3, mention: 1 };
  for (const [mode, want] of Object.entries(shapes)) {
    const o = await endedCount('f3-' + mode, mode);
    ok(o.unread === want && o.lost === want, `THE LAW F3: ${mode}: the ended pair says ${want} not delivered, the same count as the unread count`, o);
  }
  const a = await endedCount('f3-await', 'mention', { awaited: true });
  ok(a.unread === 2 && a.lost === 2, 'F3: a mention member that awaited a reply: the reply counts on both surfaces too (the reply + the @)', a);
});
await leg(143, async () => { // U1: the strip's memo keyed on the awaits
  let R = null, during = null, armed = false;   // armed: the read happens during the REPLY's own post to delta (delta is woken by every post)
  R = rig('u1', { post: async (peer, text) => { if (armed && peer.name === D && !during) during = R.eng.reportsForTurn(A, { budget: 4000, preview: true }); R.posts.push({ cid: peer.name, text }); return { ok: true, phase: 'written' }; } });
  const g = await R.group('room', A, [B, D]);
  await R.eng.setNotify({ member: A, group: g, by: A, notify: 'mention' });
  await R.at(100); await R.say(g, B, '@alpha hello');   // the B|A floor; delta (next-turn here) is not woken, so the reply's wake to it goes
  await R.eng.setNotify({ member: D, group: g, by: D, notify: 'always' });
  await R.at(1100); await R.say(g, A, 'a question?', { awaitReply: true });
  armed = true;
  await R.at(2100); await R.say(g, B, 'THE-ANSWER for the strip');
  const after = R.eng.reportsForTurn(A, { budget: 4000, preview: true });
  ok(during && !during.pending.some((p) => /THE-ANSWER/.test(p.text)), 'U1: the shape: the strip read during the reply\'s own post, before the await is stamped, has not the answer yet', during && during.pending);
  ok(after.pending.some((p) => /THE-ANSWER/.test(p.text)), 'THE LAW U1: once the await is stamped the strip lists the awaited reply (its memo keys on the awaited rows)', after.pending);
  ok((R.eng.listFor(A).find((x) => x.id === g) || {}).unread === 1, 'U2 (by behaviour): the unread count reads the one rule — the awaited reply counts', R.eng.listFor(A));
  R.close();
});
await leg(144, async () => { // U2: the acceptance's bypasses, planted in copies — red by name
  const Ms = mutantCopies('pwr-r9', REPO);
  const gePath = 'src/server/groups-engine.js';
  const swap = (src, a, b) => { if (!src.includes(a)) throw new Error('control anchor moved: ' + a.slice(0, 60)); return editAnchor(src, a, b, "the text handed to swap()"); };
  const fence = (src) => (src.match(/reachesReport/g) || []).length === 1 && (src.match(/retryTake/g) || []).length === 2 && /if \(rode\.length\) deliver\.retryTake\(member, rode, \{ via: 'prompt' \}\);/.test(src);
  const strip = async (GE) => { let R = null, during = null; R = rig('m9-strip', { GE, post: async (peer, text) => { if (peer.name === D && !during) during = R.eng.reportsForTurn(A, { budget: 4000, preview: true }); R.posts.push({ cid: peer.name, text }); return { ok: true, phase: 'written' }; } }); const g = await R.group('room', A, [B, D]); await R.eng.setNotify({ member: A, group: g, by: A, notify: 'mention' }); await R.eng.setNotify({ member: D, group: g, by: D, notify: 'always' }); await R.at(100); await R.say(g, B, '@alpha hello'); await R.at(1100); await R.say(g, A, 'a question?', { awaitReply: true }); await R.at(2100); await R.say(g, B, 'THE-ANSWER for the strip'); const p = R.eng.reportsForTurn(A, { budget: 4000, preview: true }).pending; R.close(); return p.some((x) => /THE-ANSWER/.test(x.text)); };
  { // the strip off the function, a space before the paren (the acceptance's plant)
    const src = swap(geSrc14, "|| !reach(r)) continue;", "|| !G.reachesReport (g, cid, r)) continue;");
    const GEm = Ms.load(gePath, src, 'strip-bypass');
    ok(!fence(src) && !(await strip(GEm)), '(xxviii) CONTROL: the strip with its own reading (`G.reachesReport (g, cid, r)`): the fence names it AND the strip loses the awaited reply', { fence: fence(src) });
  }
  { // the ended count through an alias by a bracket (the acceptance's plant)
    const src = swap(geSrc14, "const take = unreceivedFor(g, cid);   // the unread count's rule", "const rule = G['reachesReport']; const take = (r) => rule(g, cid, r);   // the unread count's rule");
    const GEm = Ms.load(gePath, src, 'ended-bypass');
    let R = rig('m9-ended', { GE: GEm });
    const pair = await R.eng.sendToAgent({ from: A, to: B, text: 'hello', wake: false, create: true });
    await R.turn(B);
    await R.eng.setNotify({ member: B, group: pair.group.id, by: B, notify: 'mute' });
    for (let i = 0; i < 3; i++) { await R.at(2000 + i * 100); await R.eng.post({ group: pair.group.id, from: A, text: `plain ${i}`, mayWake: noWake }); }
    await R.eng.onConversationEnded(B, { why: 'archived' });
    const rec = (R.eng.read({ by: A, group: pair.group.id }).records || []).find((r) => r.raw && r.raw.kind === 'closed');
    ok(!fence(src) && rec && rec.raw.lost === 3, '(xxix) CONTROL: the ended count through `G[\'reachesReport\']`: the fence names it (the muted count happens to agree: B-a354\'s rule hands a muted member everything)', { fence: fence(src), lost: rec && rec.raw.lost });
    R.close();
    const src2 = swap(geSrc14, "const take = unreceivedFor(g, cid);   // the unread count's rule", "const take = reachFor(g, cid);   // the unread count's rule");
    const GEm2 = Ms.load(gePath, src2, 'ended-reach');
    const R2 = rig('m9-ended2', { GE: GEm2 });
    const pair2 = await R2.eng.sendToAgent({ from: A, to: B, text: 'hello', wake: false, create: true });
    await R2.turn(B);
    await R2.eng.setNotify({ member: B, group: pair2.group.id, by: B, notify: 'mute' });
    for (let i = 0; i < 3; i++) { await R2.at(2000 + i * 100); await R2.eng.post({ group: pair2.group.id, from: A, text: `plain ${i}`, mayWake: noWake }); }
    await R2.eng.onConversationEnded(B, { why: 'archived' });
    const rec2 = (R2.eng.read({ by: A, group: pair2.group.id }).records || []).find((r) => r.raw && r.raw.kind === 'closed');
    ok(rec2 && rec2.raw.lost === 0, '(xxx) CONTROL: ae5944e24\'s ended count (reachFor alone) says 0 for a muted member — leg 142 is red on it', rec2 && rec2.raw.lost);
    R2.close();
  }
  { // an alias of the park's cancel
    const src = swap(geSrc14, "    if (rode.length) deliver.retryTake(member, rode, { via: 'prompt' });", "    const take = deliver.retryTake;\n    if (rode.length) take.call(deliver, member, rode, { via: 'prompt' });");
    ok(!fence(src), '(xxxi) CONTROL: an alias of the park\'s cancel (`const take = deliver.retryTake`) is named by the fence');
  }
  { // the frame without the per-sender reading (633ea88bc and ae5944e24's frame road)
    const GEm = Ms.load(gePath, swap(geSrc14, 'const j = sendersRide(g, m, e, Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : m.joinedAt - 1);', 'const j = { unread: [], handed: [1] };'), 'frame-whole');
    const o = await halfShape('m9-frame', 'frame', { GE: GEm });
    ok(o.frames === 1 && o.gamma && !o.alpha && o.line === '', '(xxxii) CONTROL: a frame with no per-sender reading carries gamma and swallows alpha, nobody told (the acceptance\'s measure)', o);
  }
  { // a fall that reads any sender's record (ae5944e24's line)
    const GEm = Ms.load(gePath, swap(geSrc14, "reaches = !!mm && readLog(gid).some((r) => r && Number(r.at) >= from && Number(r.at) <= to && Number(r.at) > since && r.author && mine.has(r.author.id) && reach(r));", "reaches = !!g && readLog(gid).some((r) => r && Number(r.at) >= from && Number(r.at) <= to && !(r.author && r.author.id === cid) && reach(r));"), 'fall-any-sender');
    const o = await halfShape('m9-fall', 'turn', { GE: GEm });
    ok(/reaches them on their next turn/.test(o.line) && !o.next.includes('plain from alpha'), '(xxxiii) CONTROL: a fall that reads any sender\'s record tells alpha «reaches them on their next turn» about a line that never will', o.line);
  }
});

// ── §15 ROUND 10 ───────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n§15 round 10: the senders\' coverage decides the frame; «never received» = the messages people wrote, on both surfaces');
const geSrc15 = fs.readFileSync(path.join(REPO, 'src/server/groups-engine.js'), 'utf-8');
/** F1′'s measured shape: group alpha / beta / delta, beta 'always'; alpha's plain line paced and parked; delta's @beta inside
 *  the span, its own wake NOT through (`road` 'nowait' = its pacer names no wait; 'refused' = its direct wake of beta did not
 *  land, reason undelivered; 'control' = no delta line); alpha's second plain line merges; beta → mention; `turnFirst` = beta
 *  turns before the window ends (the marker road), else the window ends first (the frame road). */
const threeShape = async (name, road, { GE = GE0, from = A, turnFirst = false } = {}) => {
  let R = null;
  R = rig(name, { GE, post: async (peer, text) => { if (road === 'refused' && peer.name === B && /from delta/.test(text) && !/held this wake/.test(text)) return { ok: false, reason: 'undelivered', phase: 'written' }; R.posts.push({ cid: peer.name, text }); return { ok: true, phase: 'written' }; } });
  const g = await R.group('lane', A, [B, D]);
  await R.eng.setNotify({ member: B, group: g, by: B, notify: 'always' });
  const say = (who, t) => (who === G.OWNER ? R.eng.post({ group: g, from: who, text: t, mayWake: R.eng.pacerFor(who) }) : R.say(g, who, t));
  await R.at(100); await say(from, 'plain one');
  await R.at(5100); await say(from, 'PLAIN-FROM-ALPHA');
  await R.at(5200);
  const dres = road === 'control' ? null : road === 'nowait' ? await R.eng.post({ group: g, from: D, text: '@beta from delta', mayWake: noWake }) : await say(D, '@beta from delta');
  await R.at(5300); await say(from, 'SECOND-PLAIN');
  const entry = R.owed(B)[0];
  const shape = { senders: entry ? entry.senders.map((s) => NAMES[s] || 'owner') : [], fromAt: entry ? entry.meta.fromAt - T0 : null, at: entry ? entry.meta.at - T0 : null, deltaRefused: dres ? (dres.refused || []).map((x) => x.reason) : null };
  await R.eng.setNotify({ member: B, group: g, by: B, notify: 'mention' });
  const turn = turnFirst ? (await R.turn(B)).text : '';
  await R.at(200000);
  const frames = R.posts.filter((p) => p.cid === B).map((p) => p.text).slice(1);   // after the first wake (t=100)
  const item = R.todos.snapshot().open.find((i) => /beta/.test(String(i.text))) || null;
  const next = (await R.turn(B)).text;
  const out = { ...shape, frames: frames.length, framesHaveAlpha: frames.some((t) => /PLAIN-FROM-ALPHA|SECOND-PLAIN/.test(t)), framesHaveDelta: frames.some((t) => /from delta/.test(t)), owed: R.owed(B).length, told: R.deliver.stashEntries(A).filter((x) => /wake/.test(x.text)).map((x) => x.text), item: item ? { text: item.text, detail: String(item.detail) } : null, deltaReaches: /from delta/.test(turn + next), alphaReaches: /PLAIN-FROM-ALPHA/.test(turn + next), auths: R.auths.length };
  R.close();
  return out;
};
const toldTrue = (o) => o.told.length === 1 && /^Your wake of beta in group "lane" was NOT sent \(mode-changed\): its notify mode is mention now/.test(o.told[0]) && /will not reach them/.test(o.told[0]) && !o.alphaReaches;
await leg(145, async () => { // F1′: the frame road, every sender unread, a non-sender's record handed
  const c = await threeShape('f1p-control', 'control');
  ok(c.frames === 0 && toldTrue(c), 'F1′: CONTROL: the shape without delta\'s line: alpha told «NOT sent (mode-changed)… will not reach them», no frame', c);
  for (const road of ['nowait', 'refused']) {
    const o = await threeShape('f1p-' + road, road);
    ok(o.senders.join() === 'alpha' && o.fromAt === 5100 && o.at === 5300 && o.deltaRefused && o.deltaRefused.length === 1 && o.deltaRefused[0] === (road === 'nowait' ? 'test: no wake' : 'undelivered'), `F1′ (${road}): the shape: ONE entry, its only sender alpha (5100–5300); delta's own wake of beta did not go (${road === 'nowait' ? 'its pacer named no wait' : 'refused: undelivered'}), so nothing parked it`, o);
    ok(o.frames === 0 && o.owed === 0, `THE LAW F1′ (${road}): no sender of the entry rides ⇒ NO frame — a frame for delta's line alone was a billed turn no promise of this entry holds`, o);
    ok(toldTrue(o), `THE LAW F1′ (${road}): alpha, none of whose records ride, is TOLD «NOT sent (mode-changed)… will not reach them» — and it is true`, o);
    ok(o.deltaReaches, `F1′ (${road}): delta's @ rides beta's next report, free — what delta's own road answered`, o);
    const w = await threeShape('f1p-o-' + road, road, { from: G.OWNER });
    ok(w.frames === 0 && w.item && /^beta was not woken in lane: its notify mode no longer asks for a wake$/.test(w.item.text) && /1 will not reach them: beta/.test(w.item.detail), `THE LAW F1′ (${road}): the owner as that sender is told the same, in its For-you item`, w);
  }
  const t = await threeShape('f1p-turn', 'nowait', { turnFirst: true });
  ok(t.frames === 0 && toldTrue(t) && t.deltaReaches, 'F1′: the marker road on the same shape (beta turns first): alpha told the same, delta\'s @ in that turn (green on 22e26c659 too: that road already read per sender)', t);
});
/** F3′: leg 142's pair plus a rename after the marker, and a group plus an invite AND a rename after the marker */
const endedWithRows = async (name, mode, { pair = true } = {}) => {
  const R = rig(name);
  let g;
  if (pair) { const made = await R.eng.sendToAgent({ from: A, to: B, text: 'hello', wake: false, create: true }); g = made.group.id; } else g = await R.group('lane', A, [B]);
  await R.turn(B);   // the marker past everything so far
  await R.eng.setNotify({ member: B, group: g, by: B, notify: mode });
  const say = (who, t) => R.eng.post({ group: g, from: who, text: t, mayWake: noWake });
  for (let i = 0; i < 3; i++) { await R.at(2000 + i * 100); await say(A, i === 2 ? '@beta three' : `plain ${i}`); }
  await R.at(3000);
  const rn = await R.eng.rename({ by: A, group: g, name: 'renamed-x' });
  let inv = { ok: true };
  if (!pair) { await R.at(3100); inv = await R.eng.invite({ by: A, group: g, members: [C], quiet: true }); }
  const kinds = (R.eng.read({ by: A, group: g }).records || []).map((r) => (r.raw && r.raw.kind) || 'message');
  const unread = (R.eng.listFor(B).find((x) => x.id === g) || {}).unread;
  const ownerUnread = (R.eng.list().find((x) => x.id === g) || {}).unread;
  await R.eng.onConversationEnded(B, { why: 'archived' });
  const rec = (R.eng.read({ by: A, group: g }).records || []).find((r) => r.raw && (r.raw.kind === 'closed' || r.raw.kind === 'ended'));
  R.close();
  return { rows: !!(rn && rn.ok) && !!(inv && inv.ok), kinds: kinds.filter((k) => k !== 'message').join(','), unread, lost: rec ? rec.raw.lost : null, text: rec ? rec.text : '', ownerUnread };
};
await leg(146, async () => { // F3′
  const want = { mute: 3, always: 3, 'next-turn': 3, mention: 1 };
  for (const [mode, n] of Object.entries(want)) {
    for (const pair of [true, false]) {
      const o = await endedWithRows(`f3p-${mode}-${pair ? 'pair' : 'group'}`, mode, { pair });
      ok(o.rows && (pair ? /,rename$/ : /,rename,invite$/).test(o.kinds), `F3′ (${mode}, ${pair ? 'pair' : 'group'}): the shape: ${pair ? 'a rename' : 'a rename and an invite'} after the marker`, o);
      ok(o.unread === n && o.lost === n && new RegExp(`${n} message${n === 1 ? '' : 's'}`).test(o.text), `THE LAW F3′ (${mode}, ${pair ? 'pair' : 'group'}): «never received» = the ${n} message(s) people wrote — the badge and «${n} not delivered» agree; the system rows count on neither`, o);
    }
  }
  const o = await endedWithRows('f3p-owner', 'always', { pair: false });
  ok(o.ownerUnread === 3, 'F3′: the owner\'s badge reads the same filter: 3 messages, the create / invite / rename rows uncounted', o);
});
await leg(147, async () => { // the census by behaviour + the plants, in copies — red by name
  const Ms = mutantCopies('pwr-r10', REPO);
  const gePath = 'src/server/groups-engine.js';
  const swap = (src, a, b) => { if (!src.includes(a)) throw new Error('control anchor moved: ' + a.slice(0, 60)); return editAnchor(src, a, b, "the text handed to swap()"); };
  const bodyOf = (src, a) => between(src, a, '\n  }\n');
  const coverage = (src) => !/j\.handed/.test(bodyOf(src, 'function owedPastMarker(')) && !/j\.handed/.test(bodyOf(src, 'function owedWords(')) && /const carried = whole \? /.test(bodyOf(src, 'function sendersRide(')) && !/\.carried\s*=[^=]/.test(src);
  const oneFilter = (src) => (src.match(/\bisMessage\b/g) || []).length === 2 && /isMessage\(r\)/.test(bodyOf(src, 'function unreceivedFor(')) && ![bodyOf(src, 'function unreadFor('), bodyOf(src, 'async function onConversationEnded('), bodyOf(src, 'function bumpUnread(')].some((b) => /raw\.kind|['"`]message['"`]/.test(b));
  ok(coverage(geSrc15), 'THE CENSUS (coverage): the marker and the frame read the senders\' coverage (`j.carried` / `j.unread`), never «anything handed» (`j.handed`); `carried` is reckoned in sendersRide alone');
  ok(oneFilter(geSrc15), 'THE CENSUS (never received): ONE record filter, inside unreceivedFor; the unread count, its bump and the ended count keep none of their own');
  { // (xxxiv) the frame road's 22e26c659 branch
    const src = swap(geSrc15, "      if (j.unread.length && !j.carried) return { fall: modeFall(m), fallDetail: { why: 'mode-changed' } };\n      if (j.unread.length && deliver && typeof deliver.fellOwedPart === 'function') deliver.fellOwedPart(cid, e, j.unread, modeFall(m), { why: 'mode-changed' });", "      if (j.unread.length && j.unread.length < (Array.isArray(e.senders) ? e.senders.length : 0) && deliver && typeof deliver.fellOwedPart === 'function') deliver.fellOwedPart(cid, e, j.unread, modeFall(m), { why: 'mode-changed' });\n      else if (j.unread.length && !j.handed.length) return { fall: modeFall(m), fallDetail: { why: 'mode-changed' } };");
    const o = await threeShape('m10-frame', 'nowait', { GE: Ms.load(gePath, src, 'frame-handed') });
    ok(!coverage(src) && o.frames === 1 && o.framesHaveDelta && !o.framesHaveAlpha && o.told.length === 0, '(xxxiv) CONTROL: the frame judging «anything handed» (22e26c659): one billed frame for delta\'s line, alpha never told (the acceptance\'s measure), and the census names it', o);
  }
  { // (xxxv) the marker road narrowing on «anything handed»: no visible difference (settleOwed clears an answered await's hold either way) — the census names it
    const src = swap(geSrc15, '    if (j.carried) { e.senders = j.unread;', '    if (j.handed.length) { e.senders = j.unread;');
    ok(!coverage(src), '(xxxv) CONTROL: the marker road narrowing on `j.handed` is named by the census');
  }
  { // (xxxvi) unreceivedFor without its record filter (22e26c659's)
    const src = swap(geSrc15, '    return (r) => isMessage(r) && (!reach || reach(r));', '    return reach || (() => true);');
    const GEm = Ms.load(gePath, src, 'no-filter');
    const R = rig('m10-filter', { GE: GEm });
    const made = await R.eng.sendToAgent({ from: A, to: B, text: 'hello', wake: false, create: true });
    const g = made.group.id;
    await R.turn(B);
    await R.eng.setNotify({ member: B, group: g, by: B, notify: 'mute' });
    for (let i = 0; i < 3; i++) { await R.at(2000 + i * 100); await R.eng.post({ group: g, from: A, text: `plain ${i}`, mayWake: noWake }); }
    await R.at(3000); await R.eng.rename({ by: A, group: g, name: 'renamed-x' });
    const unread = (R.eng.listFor(B).find((x) => x.id === g) || {}).unread;
    await R.eng.onConversationEnded(B, { why: 'archived' });
    const rec = (R.eng.read({ by: A, group: g }).records || []).find((r) => r.raw && r.raw.kind === 'closed');
    ok(unread === 4 && rec && rec.raw.lost === 4, '(xxxvi) CONTROL: unreceivedFor with no record filter counts the rename on BOTH surfaces (4, «your 4 messages were not delivered» — a rename is no message): the filter is the one rule, its words included', { unread, lost: rec && rec.raw.lost });
    R.close();
  }
  { // (xxxvii) the ended count keeping its own kind filter beside the rule (22e26c659's line): the counts agree, the census names it
    const src = swap(geSrc15, '&& !(r.author && r.author.id === cid) && take(r)).length;', "&& ((r.raw && r.raw.kind) || 'message') === 'message' && !(r.author && r.author.id === cid) && take(r)).length;");
    ok(!oneFilter(src), '(xxxvii) CONTROL: the ended count\'s own kind filter (22e26c659\'s) is named by the census');
  }
  { // (xxxviii) the badge with its own reading
    const src = swap(geSrc15, '    const take = unreceivedFor(g, who);\n    const n = (log || readLog(g.id))', "    const take = (r) => ((r.raw && r.raw.kind) || 'message') === 'message' || true;\n    const n = (log || readLog(g.id))");
    ok(!oneFilter(src), '(xxxviii) CONTROL: the unread count reading its own filter is named by the census');
  }
});

CK.report();
