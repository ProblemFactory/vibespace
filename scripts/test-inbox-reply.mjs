#!/usr/bin/env node
// test-inbox-reply — the For-you inbox REPLY (docs/design-user-inbox-reply.md
// D1, chunk 1: the server core). The owner: "给inbox item一个回复按钮，我可以直接
// 回复某个inbox item，然后会自动变成消息发给这个agent" + "发给agent的消息得带有
// 对应的引用信息". Every leg drives the REAL modules:
//   §1 PURE compose/parse round trip (src/inbox-reply.js): the marker line, the
//      quote block, the 1500-char detail cut (and NO cut line when nothing was
//      cut), the options line, hostile strings verbatim (text, not HTML), CRLF
//      normalised, blank / too-long replies refused by code
//   §2 replyVerdict — the ONE availability ladder, over the five projections
//   §3 the store: `options` validation (each bad shape throws BY NAME), the
//      merge on a re-file, resolveByReply (open ⇒ done+reply, dismissed ⇒
//      resolvedBy kept + reply written, ONE broadcast), options-first order,
//      `vibespace-ask show` + the idempotent agent resolve
//   §4 the ROUTE over a fake express + the REAL createUserInputSender + the REAL
//      claude adapter + a recording session stub: exactly one frame whose user
//      text === composeReply(...), the item resolved only after a send, every
//      refusal by name with NOTHING written and the item still open; agent
//      tokens (vsst_/jbt_) refused 403
//   §5 the turn fact (src/server/turn-facts.js) + wiring pins: the ws
//      chat-input case is a thin caller of the ONE sender, the spend census
//      excuses the sender's file, server.js wires the route, the ws ctx and
//      the payload's `turn`
//   §6 NEGATIVE CONTROL: a patched copy of the route without its isAgentBearer
//      line lets a vsst_ token through (the §4 leg can go red)
//   §8 A REPLY TO A CONVERSATION THAT ENDED REOPENS IT (lane inbox-reply-dead-session, userW inc-mvfuzlom-nwav
//      2026-10-19: 「在 inbox 里面回复 session 的时候, 如果那个 session 已经挂了, 就回不了了.」):
//      §8a PURE reopenCreate = the page's resume road's create message field for field (+ a census of
//          session-lifecycle resumeSession's savedCfg reads and createMsg keys, so a new resume field reds here);
//          PURE replyBoxView = the box both surfaces draw (never disabled; the note; "Reopen and send"); zh/ja words
//      §8b the ROUTE with a reopen dep: dead ⇒ reopened + ONE frame on the reopened session === composeReply +
//          resolved + {reopened, sessionId, conversation}; a resume failure ⇒ 409 resume_failed with ITS reason,
//          nothing resolved; a reopen that throws ⇒ named; reopened but refused by the sender ⇒ its code +
//          reopened:true (the page opens it); live / terminal / an agent bearer never reopen; live byte-identical
//      §8c the ORCH reopener (src/server/inbox-reopen.js) over a recording create: the message, the headless
//          creator leaves the session's clients, a create error by name, resume-already-live ⇒ that session, ONE
//          create for two concurrent replies, a webui key / an undiscovered local conversation refused by name
//      §8d wiring pins (server.js, ws-handler's handleCreate, the route's spend comment) + RED CONTROL: the route
//          without its reopen line answers the pre-lane 409 no_live_session
//   §7 chunk 4 ("Mark all seen"): the store's setStatusMany (known changed,
//      unknown named, ONE onChange, an invalid status throws by name), the
//      snapshot's resolved tail keeping a whole batch, and POST
//      /api/user-todos/resolve-many (≤ 200, agent tokens 403, bad shapes by
//      code, ONE broadcast) registered BEFORE the /api/user-todos/:id route
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const cleanup = [];
process.on('exit', () => { for (const f of cleanup) { try { fs.rmSync(f, { recursive: true, force: true }); } catch { } } });
const tmpdir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-inbox-reply-')); cleanup.push(d); return d; };

const R = require(path.join(REPO, 'src/inbox-reply.js'));
const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));

// ── §1 PURE compose / parse ────────────────────────────────────────────────
console.log('§1 composeReply / parseReply');
{
  const now = Date.parse('2026-09-23T06:14:00Z');
  const base = { id: 'ut-3f9a1c2b7d', text: 'Approve the migration plan before I continue', urgency: 'high', createdAt: Date.parse('2026-09-23T06:02:00Z') };
  const plain = R.composeReply({ ...base, detail: null }, 'yes, go', { now });
  const L = plain.split('\n');
  ok(L[0] === '[For you reply #ut-3f9a1c2b7d]' && R.REPLY_MARKER_RE.test(L[0]), 'line 1 is the verbatim marker `[For you reply #<id>]`', L[0]);
  ok(L[1] === '> filed 12 min ago (2026-09-23 06:02 UTC) · urgency high', 'quote line 1 = filed relative + absolute UTC · urgency', L[1]);
  ok(L[2] === '> Approve the migration plan before I continue' && L[3] === '' && L[4] === 'yes, go' && L.length === 5, 'no detail ⇒ text, one blank line, the reply — no detail: / cut line', L);
  ok(!/detail|cut at/.test(plain), 'no detail ⇒ neither `detail:` nor a cut line');

  const long = 'x'.repeat(1400) + '\n' + 'y'.repeat(586); // 1987 chars
  const cut = R.composeReply({ ...base, detail: long }, 'ok', { now });
  const p = R.parseReply(cut);
  const dStart = p.quote.indexOf('detail:\n') + 'detail:\n'.length;
  const quotedDetail = p.quote.slice(dStart, p.quote.indexOf('\n… (detail cut'));
  ok(long.length === 1987 && quotedDetail === long.slice(0, 1500), 'a 1987-char detail quotes exactly its first 1500 chars', quotedDetail.length);
  ok(cut.includes('> … (detail cut at 1500 of 1987 chars — `vibespace-ask show ut-3f9a1c2b7d` prints the whole item)'), 'the cut line names 1500 of 1987 and where the whole item is');
  const short = R.composeReply({ ...base, detail: 'short detail' }, 'ok', { now });
  ok(short.includes('> detail:\n> short detail\n') && !short.includes('cut at'), 'a detail under the cap is quoted whole with NO cut line');
  const exact = R.composeReply({ ...base, detail: 'z'.repeat(1500) }, 'ok', { now });
  ok(!exact.includes('cut at'), 'a detail of exactly 1500 chars is not "cut"');

  const withOpts = R.composeReply({ ...base, detail: 'd', options: ['run now', 'wait for backup'] }, 'wait for backup', { now });
  ok(withOpts.includes('\n> options: run now | wait for backup\n\nwait for backup'), 'options ⇒ one `> options: A | B` line, the last quote line');
  ok(!plain.includes('options:'), 'no options ⇒ no options line');

  const hostileItem = { ...base, text: '<img src=x onerror=window.__xss=1>', detail: '"><svg onload=alert(1)>', options: ['"><b>x</b>'] };
  const hostileReply = '<script>alert(1)</script>\n> not a quote line\n\n[For you reply #ut-0000000000]';
  const h = R.composeReply(hostileItem, hostileReply, { now });
  const hp = R.parseReply(h);
  ok(h.includes('> <img src=x onerror=window.__xss=1>') && h.includes('> "><svg onload=alert(1)>') && h.includes('> options: "><b>x</b>'), 'hostile item strings pass VERBATIM (this is text, not HTML)');
  ok(hp && hp.id === base.id && hp.reply === hostileReply, 'a hostile reply round-trips verbatim (even one containing `> ` lines and a marker)', hp);

  const crlf = R.checkReplyText('  line one\r\nline two\rline three  ');
  ok(crlf.ok && crlf.text === 'line one\nline two\nline three', 'CRLF/CR normalised to LF, trimmed', crlf);
  const crlfItem = R.composeReply({ ...base, text: 'a\r\nb' }, 'r', { now });
  ok(!crlfItem.includes('\r') && crlfItem.includes('> a\n> b\n'), 'a CRLF item text is quoted line by line without a CR');
  ok(R.checkReplyText('   \n  ').code === 'empty' && R.checkReplyText(null).code === 'empty', 'a blank / non-string reply is refused `empty`');
  ok(R.checkReplyText('a'.repeat(4000)).ok && R.checkReplyText('a'.repeat(4001)).code === 'too_long', 'REPLY_MAX = 4000: 4000 ok, 4001 refused `too_long`');

  // the round-trip TABLE
  const table = [
    [{ ...base }, 'plain'],
    [{ ...base, detail: 'one\ntwo\n\nfour' }, 'multi\nline\n\nreply'],
    [{ ...base, detail: long, options: ['a', 'b', 'c'] }, 'b'],
    [{ ...base, urgency: undefined, text: 'blank line inside\n\nthe text' }, '> starts like a quote'],
  ];
  let rt = 0;
  for (const [it, rep] of table) { const q = R.parseReply(R.composeReply(it, rep, { now })); if (q && q.id === it.id && q.reply === rep) rt++; }
  ok(rt === table.length, `compose → parse round-trips id + reply over the table (${rt}/${table.length})`);
  ok(R.parseReply('hello') === null && R.parseReply('[For you reply #nope]\n\nx') === null && R.parseReply(null) === null, 'parseReply is null for a text that is not an inbox reply');
  ok(R.composeReply(base, 'x', { now }).length < 6 * 1024 && R.composeReply({ ...base, detail: 'q'.repeat(2000), options: ['a'.repeat(40)] }, 'r'.repeat(4000), { now }).length < 6 * 1024, 'the whole message stays < 6 KB (far from the 64 KB frame-file gate)');
}

// ── §2 replyVerdict ────────────────────────────────────────────────────────
console.log('§2 replyVerdict');
{
  const item = { id: 'ut-aaaaaaaaaa', sessionKey: 'claude:sid', text: 'q' };
  const v = (session, it = item) => R.replyVerdict({ item: it, session });
  const noSess = v(null), term = v({ live: true, mode: 'terminal', remoteState: null }), unreach = v({ live: true, mode: 'chat', remoteState: 'unreachable' });
  const idle = v({ live: true, mode: 'chat', remoteState: null }), mid = v({ live: true, mode: 'chat', remoteState: null, turn: 'running' });
  ok(noSess.code === 'no_live_session' && noSess.why === 'This conversation has ended — sending reopens it with this reply as its first message' && R.REOPEN_CODES.length === 1 && R.REOPEN_CODES[0] === 'no_live_session', 'no session ⇒ no_live_session, its sentence says the send REOPENS it (REOPEN_CODES = [no_live_session])', noSess);
  ok(term.code === 'not_chat' && term.why === 'Terminal session — reply in its window', 'terminal ⇒ not_chat', term);
  ok(unreach.code === 'host_unreachable' && unreach.why === 'Host unreachable — reconnect, then reply', 'unreachable host ⇒ host_unreachable', unreach);
  ok(idle.ok === true && mid.ok === true, 'live idle ⇒ ok; live MID-TURN ⇒ ok too (the session queues it)');
  ok(v(idle, { ...item, sessionKey: 'accounts' }).code === 'no_session' && v(idle, { ...item, sessionKey: 'jobs' }).code === 'no_session' && v(idle, { ...item, jobId: 'j1' }).code === 'job_item', 'accounts/jobs keys ⇒ no_session; a job item ⇒ job_item (those two are HIDDEN, not disabled)');
  ok(R.REPLY_HIDDEN_CODES.includes('no_session') && R.REPLY_HIDDEN_CODES.includes('job_item') && R.REPLY_HIDDEN_CODES.includes('card_item') && R.REPLY_HIDDEN_CODES.includes('exit_ask') && R.REPLY_HIDDEN_CODES.length === 4, 'REPLY_HIDDEN_CODES = exactly the four no-surface codes');
  // lane S1 verify r2 (M1): a helper's permission ask is answered on ITS CARD — a typed reply
  // can never approve it (a control_response on stdin is the only answer), and it used to
  // resolve the item while the helper still waited
  const helperItem = { ...item, action: { type: 'helper-ask', requestId: '2e19e852-98d5-4094-be1b-5fc1ccc2a3c7', sessionId: 'sess-1' } };
  const liveChat = { live: true, mode: 'chat', remoteState: null };
  const c1 = v(liveChat, helperItem), c2 = v(null, helperItem), c3 = v({ ...liveChat, turn: 'running' }, helperItem);
  ok(c1.code === 'card_item' && c1.why === 'Answer it on the helper’s card — click the item to go there' && c2.code === 'card_item' && c3.code === 'card_item', 'a helper-ask item ⇒ card_item on a live, a dead and a mid-turn session alike (the card is the surface, never a typed reply)', [c1, c2, c3]);
  ok(R.REPLY_HIDDEN_CODES.includes('card_item') && R.CARD_ACTION_TYPES.includes('helper-ask') && R.CARD_ACTION_TYPES.includes('main-ask') && R.CARD_ACTION_TYPES.length === 2, 'card_item is HIDDEN (no Reply button drawn) and helper-ask + main-ask (lane parked-ask-inbox: a conversation\'s own ask) are the card action kinds');
  ok(v(liveChat, { ...item, action: { type: 'open-window', winId: 'w1' } }).ok === true && v(liveChat, { ...item, action: null }).ok === true, 'an item with another action kind (or none) still replies');
  ok(v(liveChat, { ...item, jobId: 'j1', action: { type: 'helper-ask', requestId: 'r' } }).code === 'job_item', 'a job item stays job_item (the earlier rung wins)');
  // lane-pairing verify-r4 F5: an agent's "run this command on <machine>?" is answered by Allow / Deny on the item — a
  // typed reply resolved the item and an item leaving 'open' settles the ask as NOT allowed: "yes, allow it" DENIED it
  const exitItem = { ...item, action: { type: 'exit-run-ask', askId: 'a'.repeat(32), hostId: 'host-dial-mac', machine: 'mac', cmd: 'id' } };
  const e1 = v(liveChat, exitItem), e2 = v({ ...liveChat, turn: 'running' }, exitItem), e3 = v(null, exitItem);
  ok(e1.code === 'exit_ask' && e1.why === 'Answer it with Allow or Deny — a typed reply does not answer it' && e2.code === 'exit_ask' && e3.code === 'exit_ask', 'F5: an exit ask ⇒ exit_ask on a live, a mid-turn and a dead session alike (Allow / Deny is the answer, never a typed reply)', [e1, e2, e3]);
    ok(R.REPLY_HIDDEN_CODES.includes('exit_ask') && R.ANSWER_ACTION_TYPES.includes('exit-run-ask') && R.ANSWER_ACTION_TYPES.includes('hub-act-ask') && R.ANSWER_ACTION_TYPES.includes('automation-ask') && R.ANSWER_ACTION_TYPES.includes('pool-cross-provider') && R.ANSWER_ACTION_TYPES.includes('vault-run-ask') && R.ANSWER_ACTION_TYPES.includes('vault-grant-ask') && R.ANSWER_ACTION_TYPES.length === 6 /* design q-046: a held automation call; q-053 P0b: a pool's cross-provider card; lane vault-run-door: a held run; lane vault-manual-and-lock: an agent's request */, 'F5: exit_ask is HIDDEN (no Reply button, no option chips); the answer-by-buttons kinds are exit-run-ask and (lane hub-act-ask) a held hub act, (q-046) a held automation call, (q-053 P0b) a pool cross-provider card, (lane vault-run-door) a held vault run, (lane vault-manual-and-lock) an agent\'s request for a stored secret');
  const hubItem = { ...item, action: { type: 'hub-act-ask', askId: 'b'.repeat(32), hostId: 'host-dial-mac', machine: 'mac', kind: 'run' } };
  ok(v(liveChat, hubItem).code === 'exit_ask' && v(null, hubItem).code === 'exit_ask', 'lane hub-act-ask: a held hub act\'s card is answered by its buttons too — a typed reply never answers it');
}

// ── §3 the store ──────────────────────────────────────────────────────────
console.log('§3 UserTodoManager: options, resolveByReply, order');
function mkStore() {
  const calls = [];
  const m = new UserTodoManager({ dataDir: tmpdir(), onChange: (t) => calls.push(t), expirySweepMs: 0 });
  return { m, calls };
}
{
  const { m } = mkStore();
  const bad = [
    [['a', 'b', 'c', 'd', 'e', 'f', 'g'], /at most 6/],
    [['x'.repeat(41)], /41 chars/],
    [['a', 7], /options\[1\] must be a string/],
    [['a', ' a '], /duplicates "a"/],
    [['   '], /options\[0\] is empty/],
    [['a|b'], /may not contain/],
    ['a|b', /must be an array/],
  ];
  let named = 0; const miss = [];
  for (const [opts, re] of bad) { try { m.add('claude:s', { origin: 'agent', text: 'q' + named + Math.random(), options: opts }); miss.push(JSON.stringify(opts) + ' accepted'); } catch (e) { if (re.test(e.message)) named++; else miss.push(e.message); } }
  ok(named === bad.length, `every bad options shape throws BY NAME (${named}/${bad.length})`, miss.join('; '));
  const a = m.add('claude:s', { origin: 'agent', text: 'decide', options: [' run now ', 'wait'] });
  ok(JSON.stringify(a.options) === '["run now","wait"]' && a.reply === null, 'labels trimmed and stored; a new item carries reply:null');
  m.add('claude:s', { origin: 'agent', text: 'decide' });
  ok(JSON.stringify(m.get(a.id).options) === '["run now","wait"]', 'a re-file WITHOUT options keeps the set');
  m.add('claude:s', { origin: 'agent', text: 'decide', options: ['later'] });
  ok(JSON.stringify(m.get(a.id).options) === '["later"]', 'a re-file WITH options replaces them');
  ok(m.add('claude:s', { origin: 'agent', text: 'no opts', options: [] }).options === null, 'an empty array = no options (null)');
  m.stop(); m.flush();
}
{
  const { m, calls } = mkStore();
  const it = m.add('claude:s', { origin: 'agent', text: 'open one' });
  const n0 = calls.length;
  const r = m.resolveByReply(it.id, 'my reply', 1234);
  ok(r.status === 'done' && r.resolvedBy === 'reply' && r.resolvedAt === 1234 && r.reply.text === 'my reply' && r.reply.at === 1234, 'resolveByReply on OPEN ⇒ done, resolvedBy reply, reply {text, at}', r);
  ok(calls.length === n0 + 1, 'ONE broadcast per resolveByReply', calls.length - n0);
  const d = m.add('claude:s', { origin: 'agent', text: 'dismissed one' });
  m.setStatus(d.id, 'dismissed', 'user');
  const n1 = calls.length;
  const r2 = m.resolveByReply(d.id, 'late reply', 99);
  ok(r2.status === 'dismissed' && r2.resolvedBy === 'user' && r2.reply.text === 'late reply', 'on a DISMISSED item ⇒ status + resolvedBy kept, the reply written', r2);
  ok(calls.length === n1 + 1, 'ONE broadcast for the resolved item too');
  ok(m.resolveByReply(it.id, 'x'.repeat(5000)).reply.text.length === 4000, 'a stored reply is capped at 4000');
  let threw = null; try { m.resolveByReply('ut-0000000000', 'x'); } catch (e) { threw = e.message; }
  ok(threw === 'item not found', 'unknown id throws');
  // the agent side after a reply
  ok(m.resolveByAgent('claude:s', it.id).id === it.id, "the agent's `resolve <id>` on a reply-resolved item is an idempotent no-op (no throw)");
  let other = null; try { m.resolveByAgent('claude:other', it.id); } catch (e) { other = e.message; }
  ok(/no open item/.test(other || ''), "…but never across sessions (another session's id still refuses)");
  ok(m.getForSession(['claude:s'], it.id)?.reply?.text && m.getForSession(['claude:other'], it.id) === null, '`show <id>` reads one item of the OWN session only, any status');
  // re-file after a reply clears it
  m.add('claude:s', { origin: 'agent', text: 'open one' });
  ok(m.get(it.id).status === 'open' && m.get(it.id).reply === null, 'a re-filed (reopened) ask drops the old reply');
  m.stop(); m.flush();
}
{
  const { m } = mkStore();
  const t0 = Date.now();
  const mk = (text, urgency, options, ageMs) => { const i = m.add('claude:s', { origin: 'agent', text, urgency, options }); i.createdAt = t0 - ageMs; return i; };
  mk('normal old', 'normal', null, 5000);
  mk('normal new', 'normal', null, 1000);
  mk('normal opts old', 'normal', ['a'], 9000);
  mk('high plain', 'high', null, 100);
  mk('high opts', 'high', ['x', 'y'], 20000);
  mk('low opts', 'low', ['z'], 0);
  const order = m.snapshot().open.map((i) => i.text);
  ok(JSON.stringify(order) === JSON.stringify(['high opts', 'high plain', 'normal opts old', 'normal new', 'normal old', 'low opts']), 'snapshot order = urgency, then options-first, then newest', order);
  m.stop(); m.flush();
}

// ── §4 the route over the REAL sender + the REAL claude adapter ──────────────
console.log('§4 POST /api/user-todos/:id/reply');
const { createUserInputSender } = require(path.join(REPO, 'src/server/user-input.js'));
const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
const adapterRegistry = createAdapterRegistry({});
const sessionStatusKey = (session, id) => { const bsid = session?.backendSessionId || session?.claudeSessionId; return bsid ? `${session.backend || 'claude'}:${bsid}` : `webui:${id}`; }; // server.js's, verbatim
function harness(routeFile = 'src/routes/user-todos-reply.js', { reopen = null } = {}) {
  const { registerUserTodoReplyRoutes } = require(path.isAbsolute(routeFile) ? routeFile : path.join(REPO, routeFile)); // a patched copy (§6) is an absolute path outside the checkout
  const routes = {};
  const app = { post: (p, h) => { routes['POST ' + p] = h; }, get: (p, h) => { routes['GET ' + p] = h; } };
  const activeSessions = new Map();
  const rec = { feed: [], bcast: [], recovered: [] };
  const sender = createUserInputSender({
    activeSessions, adapterRegistry, BUFFERS_DIR: tmpdir(),
    broadcastToSession: (s, id, m) => rec.bcast.push(m), feedLive: (s, m) => rec.feed.push(m),
    autoResume: { noteRecovered: (id, why) => rec.recovered.push([id, why]) },
    reattachLocalPty: () => { throw new Error('no heal expected'); }, ptyQuietSince: () => false, log: () => { },
  });
  const { m: userTodos, calls } = mkStore();
  const NOW = Date.parse('2026-09-23T07:00:00Z');
  const reopened = []; // §8: every reopen the route asked for
  registerUserTodoReplyRoutes(app, { userTodos, activeSessions, sendUserInput: sender.send, sessionStatusKey, now: () => NOW, ...(reopen ? { reopen: (item, o) => { reopened.push([item.id, o]); return reopen(item, o, { activeSessions, addSession }); } } : {}) });
  const handler = routes['POST /api/user-todos/:id/reply'];
  const call = (id, body, headers = {}) => { let status = 200, json = null; handler({ params: { id }, body, headers }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } }); return { status, json }; };
  const callAsync = async (id, body, headers = {}) => { let status = 200, json = null; await handler({ params: { id }, body, headers }, { headersSent: false, status(c) { status = c; return this; }, json(j) { json = j; this.headersSent = true; return this; } }); return { status, json }; };
  const addSession = (id, over = {}) => { const wrote = []; const s = { backend: 'claude', mode: 'chat', pty: { write: (x) => wrote.push(x) }, _isStreaming: false, _remoteState: null, backendSessionId: 'sid-' + id, buffer: '', ...over }; activeSessions.set(id, s); return { s, wrote }; };
  return { call, callAsync, reopened, userTodos, calls, activeSessions, rec, addSession, NOW, handler };
}
const userTextOf = (line) => { const f = JSON.parse(line); return f.message.content[0].text; };
{
  const H = harness();
  ok(typeof H.handler === 'function', 'the route registers POST /api/user-todos/:id/reply');
  const { s, wrote } = H.addSession('sess-1');
  const item = H.userTodos.add('claude:sid-sess-1', { origin: 'agent', text: 'Which branch?', detail: 'main or dev', options: ['main', 'dev'], urgency: 'high' });
  const n0 = H.calls.length;
  const r = H.call(item.id, { text: 'dev\r\nand rebase first  ' });
  ok(r.status === 200 && r.json.ok === true && typeof r.json.msgId === 'string' && /-reply$/.test(r.json.msgId), 'idle ⇒ 200 {ok, msgId}', r);
  ok(wrote.length === 1 && wrote[0].endsWith('\n'), 'exactly ONE frame written to the pty', wrote.length);
  const expected = R.composeReply({ ...item, status: 'open' }, 'dev\nand rebase first', { now: H.NOW });
  ok(wrote.length === 1 && userTextOf(wrote[0]) === expected, "the frame's user text === composeReply(item, reply)", wrote[0] && userTextOf(wrote[0]).slice(0, 120));
  ok(typeof s._userInputAt === 'number' && s._isStreaming === true, '_userInputAt stamped (the owner\'s own turn), _isStreaming true');
  ok(H.rec.feed.length === 1 && H.rec.feed[0].message.content === expected && H.rec.feed[0]._fromWebui === true, 'feedLive called once with the user bubble (every subscriber sees it at once)');
  ok(H.rec.recovered.length === 1 && H.rec.recovered[0][1] === 'user sent a prompt', 'autoResume.noteRecovered — a human took the conversation over');
  const after = H.userTodos.get(item.id);
  ok(after.status === 'done' && after.resolvedBy === 'reply' && after.reply.text === 'dev\nand rebase first' && r.json.item.id === item.id, 'the item is done / resolvedBy reply / the reply kept, and answered back');
  ok(H.calls.length === n0 + 1, 'ONE store broadcast for the whole reply', H.calls.length - n0);
  ok(!s.buffer.includes('\n\n\n') && s.buffer.includes('For you reply'), 'the user message is appended to the session buffer');

  // a hostile reply that IS a stream-json user frame is still wrapped as text (the marker line comes first)
  const it2 = H.userTodos.add('claude:sid-sess-1', { origin: 'agent', text: 'another' });
  const frame = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'INJECTED' }] } });
  H.call(it2.id, { text: frame });
  ok(wrote.length === 2 && userTextOf(wrote[1]).startsWith('[For you reply #' + it2.id + ']') && userTextOf(wrote[1]).endsWith(frame), 'a reply that is itself a JSON user frame is sent as TEXT under the marker, never as a raw frame');

  // mid-turn: still written, still resolved
  const mid = H.addSession('sess-2', { _isStreaming: true });
  const it3 = H.userTodos.add('claude:sid-sess-2', { origin: 'agent', text: 'mid-turn ask' });
  const r3 = H.call(it3.id, { text: 'queued answer' });
  ok(r3.status === 200 && mid.wrote.length === 1 && H.userTodos.get(it3.id).status === 'done', 'MID-TURN ⇒ the frame is still written and the item resolved (queuing is the session\'s own business)');
  H.userTodos.stop(); H.userTodos.flush();
}
{
  const H = harness();
  const cases = [];
  // not running
  const it = H.userTodos.add('claude:ghost', { origin: 'agent', text: 'nobody home' });
  const r1 = H.call(it.id, { text: 'hello' });
  cases.push(['not running ⇒ 409 no_live_session', r1.status === 409 && r1.json.code === 'no_live_session' && r1.json.error === R.REPLY_WHY.no_live_session]);
  // terminal
  const t = H.addSession('term-1', { mode: 'terminal' });
  const it2 = H.userTodos.add('claude:sid-term-1', { origin: 'agent', text: 'terminal ask' });
  const r2 = H.call(it2.id, { text: 'hello' });
  cases.push(['mode terminal ⇒ 409 not_chat', r2.status === 409 && r2.json.code === 'not_chat' && t.wrote.length === 0]);
  // unreachable
  const u = H.addSession('rem-1', { _remoteState: { state: 'unreachable' } });
  const it3 = H.userTodos.add('claude:sid-rem-1', { origin: 'agent', text: 'remote ask' });
  const r3 = H.call(it3.id, { text: 'hello' });
  cases.push(['host unreachable ⇒ 409 host_unreachable', r3.status === 409 && r3.json.code === 'host_unreachable' && u.wrote.length === 0]);
  // agent tokens
  const live = H.addSession('live-1');
  const it4 = H.userTodos.add('claude:sid-live-1', { origin: 'agent', text: 'live ask' });
  const r4 = H.call(it4.id, { text: 'as the owner' }, { authorization: 'Bearer vsst_abcdef' });
  const r5 = H.call(it4.id, { text: 'as the owner' }, { authorization: 'Bearer jbt_abcdef' });
  cases.push(['Bearer vsst_ ⇒ 403 agent_forbidden', r4.status === 403 && r4.json.code === 'agent_forbidden']);
  cases.push(['Bearer jbt_ ⇒ 403 agent_forbidden', r5.status === 403 && r5.json.code === 'agent_forbidden']);
  cases.push(['…and nothing was written for either', live.wrote.length === 0]);
  const r6 = H.call(it4.id, { text: 'a'.repeat(4001) });
  cases.push(['4001 chars ⇒ 400 too_long', r6.status === 400 && r6.json.code === 'too_long']);
  const r6b = H.call(it4.id, { text: '  ' });
  cases.push(['blank ⇒ 400 empty', r6b.status === 400 && r6b.json.code === 'empty']);
  const r7 = H.call('ut-0000000000', { text: 'x' });
  cases.push(['unknown id ⇒ 404 not_found', r7.status === 404 && r7.json.code === 'not_found']);
  const acc = H.userTodos.add('accounts', { origin: 'login', text: 'login expires', by: 'server' });
  const r8 = H.call(acc.id, { text: 'x' });
  cases.push(['accounts-keyed item ⇒ 409 no_session', r8.status === 409 && r8.json.code === 'no_session']);
  const job = H.userTodos.add('claude:sid-live-1', { origin: 'jobs', text: 'job needs your input', jobId: 'job-1' });
  const r9 = H.call(job.id, { text: 'x' });
  cases.push(['jobId item ⇒ 409 job_item', r9.status === 409 && r9.json.code === 'job_item']);
  cases.push(['no refusal wrote a frame to the live session', live.wrote.length === 0]);
  cases.push(['no refused item was resolved', [it, it2, it3, it4, acc, job].every((x) => H.userTodos.get(x.id).status === 'open' && !H.userTodos.get(x.id).reply)]);
  // a webui:<id> keyed item (filed before the conversation id existed)
  const early = H.addSession('early-1', { backendSessionId: null });
  const it10 = H.userTodos.add('webui:early-1', { origin: 'agent', text: 'early ask' });
  const r10 = H.call(it10.id, { text: 'answer' });
  cases.push(['a webui:<id> item reaches its session', r10.status === 200 && early.wrote.length === 1]);
  // the sender refused (poison guard) ⇒ nothing resolved, the code named
  const poison = H.addSession('poison-1');
  const it11 = H.userTodos.add('claude:sid-poison-1', { origin: 'agent', text: 'poison' });
  const adapter = adapterRegistry.get('claude'); const orig = adapter.formatChatInput;
  adapter.formatChatInput = () => { throw new Error('image message corrupted in transit'); };
  let r11; try { r11 = H.call(it11.id, { text: 'x' }); } finally { adapter.formatChatInput = orig; }
  cases.push(['a sender refusal answers its code (input_rejected 400), nothing written, nothing resolved', r11.status === 400 && r11.json.code === 'input_rejected' && poison.wrote.length === 0 && H.userTodos.get(it11.id).status === 'open']);
  // pty.write throws ⇒ send_failed 500
  const broken = H.addSession('broken-1', { pty: { write: () => { throw new Error('EPIPE'); } } });
  const it12 = H.userTodos.add('claude:sid-broken-1', { origin: 'agent', text: 'broken' });
  const r12 = H.call(it12.id, { text: 'x' });
  cases.push(['pty.write throwing ⇒ 500 send_failed, the item still open', r12.status === 500 && r12.json.code === 'send_failed' && /EPIPE/.test(r12.json.error) && H.userTodos.get(it12.id).status === 'open']);
  for (const [n, c] of cases) ok(c, n);
  void broken;
  H.userTodos.stop(); H.userTodos.flush();
}
{
  // the ws case's own contract through the SAME sender: no session / not chat are silent
  const activeSessions = new Map();
  const sender = createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR: tmpdir(), broadcastToSession: () => { }, feedLive: () => { }, autoResume: null, reattachLocalPty: () => { }, ptyQuietSince: () => false, log: () => { } });
  ok(sender.send('nope', 'x').code === 'no_session', 'sender: no session ⇒ code no_session');
  activeSessions.set('t', { backend: 'claude', mode: 'terminal', pty: { write: () => { } } });
  ok(sender.send('t', 'x').code === 'not_chat', 'sender: a terminal session ⇒ code not_chat');
  const bc = []; const s = { backend: 'claude', mode: 'chat', pty: { write: () => { } }, buffer: '', _interruptTimer: setTimeout(() => { }, 60000) };
  activeSessions.set('c', s);
  const sender2 = createUserInputSender({ activeSessions, adapterRegistry, BUFFERS_DIR: tmpdir(), broadcastToSession: (x, id, m) => bc.push(m), feedLive: () => { }, autoResume: null, reattachLocalPty: () => { }, ptyQuietSince: () => false, log: () => { } });
  const r = sender2.send('c', '/compact please', { msgId: 'm1' });
  ok(r.ok && r.msgId === 'm1' && s._interruptTimer === null && s._streamingKind === 'compacting' && bc[0]?.kind === 'compacting', 'sender keeps the case\'s behaviours: given msgId, interrupt timer cleared, the /compact label broadcast');
}

// ── §5 turn facts + wiring pins ─────────────────────────────────────────────
console.log('§5 turn facts + wiring');
{
  const { turnOf, turnDigest } = require(path.join(REPO, 'src/server/turn-facts.js'));
  ok(turnOf({ _isStreaming: true }) === 'running' && turnOf({ _isStreaming: false }) === 'idle' && turnOf({ _isStreaming: true, _turnState: 'requires_action' }) === 'waiting' && turnOf(null) === 'idle', 'turnOf: running / idle / waiting (requires_action wins)');
  const m = new Map([['b', { _isStreaming: true }], ['a', { _turnState: 'requires_action' }], ['c', {}], ['d', { _isStreaming: true, isTmuxView: true }]]);
  ok(turnDigest(m) === 'a:waiting,b:running', 'turnDigest = sorted non-idle `${id}:${turn}` (idle and tmux views excluded)', turnDigest(m));
  ok(turnDigest(new Map([['c', {}]])) === turnDigest(new Map()), 'an idle session appearing does not move the digest (the list\'s own broadcast announces it)');

  const ws = read('src/ws-handler.js');
  const cm = ws.match(/case 'chat-input': \{([\s\S]*?)\n {8}\}\n/);
  ok(!!cm && !/formatChatInput\s*\(/.test(cm[1]) && /sendUserInput\(data\.sessionId, data\.text/.test(cm[1]), "ws-handler's chat-input case spells no formatChatInput( and calls sendUserInput(", cm && cm[1].slice(0, 200));
  ok(!!cm && /r\.code === 'input_rejected' \|\| r\.code === 'too_large'/.test(cm[1]) && /code: 'input-rejected'/.test(cm[1]), "…and maps ONLY input_rejected/too_large to the existing input-rejected frame");
  ok((ws.match(/formatChatInput\s*\(/g) || []).length === 0, 'ws-handler holds no formatChatInput at all any more');
  ok((read('src/server/user-input.js').match(/formatChatInput\s*\(/g) || []).length === 1, 'src/server/user-input.js holds exactly ONE formatChatInput');
  ok(!/formatChatInput\s*\(/.test(read('src/routes/user-todos-reply.js')) && !/deliverToConversation|authorizeSpend|spendGuard/.test(read('src/routes/user-todos-reply.js')), 'the route composes no frame and touches neither the ladder nor the authorizer');
  const sp = read('scripts/test-spend-paths.mjs');
  ok(/\{ file: 'src\/server\/user-input\.js', prim: 'user-frame'/.test(sp) && !/\{ file: 'src\/ws-handler\.js', prim: 'user-frame'/.test(sp), 'the spend ALLOW row names src/server/user-input.js#user-frame (re-pointed, not duplicated)');
  const srv = read('server.js');
  ok(/createUserInputSender\(\{[^}]*\}\)\.send;/.test(srv) && /registerUserTodoReplyRoutes\(app, \{ userTodos, activeSessions, sendUserInput, sessionStatusKey, reopen: \(item, o\) => inboxReopen\.reopen\(item, o\) \}\)/.test(srv), 'server.js constructs the ONE sender and hands it to the reply route');
  ok(/registerWsHandler\(wss, \{[\s\S]*?\bsendUserInput,[\s\S]*?\n\}\);/.test(srv), '…and to the ws handler through ctx');
  ok(/turn: require\('\.\/src\/server\/turn-facts\.js'\)\.turnOf\(s\)/.test(srv) && /turnDigest\(activeSessions\)/.test(srv) && /\}, 1000\)\.unref\(\)/.test(srv), 'the payload carries `turn`, re-broadcast by ONE unref\'d 1 s digest');
  const { SPEND_REASONS } = require(path.join(REPO, 'src/spend-authorizer.js'));
  ok(Array.isArray(SPEND_REASONS) ? !SPEND_REASONS.some((x) => /reply|inbox/.test(String(x))) : !Object.keys(SPEND_REASONS || {}).some((x) => /reply|inbox/.test(x)), 'no spend reason for a reply (a per-occurrence owner action is not an unattended turn)');
  const ag = read('src/agent-routes.js') + read('src/agent-routes/status.js'); // + the status / todos family (lane dc-seams-server)
  ok(/options: add\.options == null \? null : add\.options/.test(ag) && ag.includes('[--options "A|B|C"]') && ag.includes('`[For you reply #<id>]`'), 'agent route forwards add.options; the teaching block names --options and the reply shape');
  const cli = read('data/bin/vibespace-ask');
  ok(/opt\('options'\)/.test(cli) && /split\('\|'\)/.test(cli) && /options: ' \+ i\.options\.join/.test(cli) && /cmd === 'show'/.test(cli), "vibespace-ask: --options split on '|', list prints options, a show verb");
  ok(/## Replies from the inbox/.test(read('docs/agent/ask-manual.md')), 'the ask manual documents the reply shape');
}

// ── §5b the CLI's --options against a recording route running the STORE's own rule ──
// r1: the CLI dropped empty labels (`"A||B"` → [A, B], two chips, no error) while
// the store refuses the same string by name — two producers, one string, two answers.
console.log('§5b vibespace-ask --options: the CLI passes the labels as typed, the store names a bad one');
{
  const http = require('node:http');
  const { execFile } = require('node:child_process');
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      const body = JSON.parse(b || '{}'); bodies.push(body);
      try { const options = R.normalizeOptions(body.add && body.add.options); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: true, item: { id: 'ut-x', text: body.add.text, urgency: 'normal', options } })); }
      catch (e) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const run = (args) => new Promise((resolve) => execFile(process.execPath, [path.join(REPO, 'data/bin/vibespace-ask'), ...args], { env: { ...process.env, VIBESPACE_API: `http://127.0.0.1:${srv.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_test' }, timeout: 10000 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
  const good = await run(['decide', '--options', ' Run now | Wait ']);
  ok(good.code === 0 && JSON.stringify(bodies[0]?.add?.options) === '["Run now","Wait"]' && /options: Run now \| Wait/.test(good.stdout), '"A|B" ⇒ two labels, trimmed, echoed', { good, body: bodies[0] });
  const bad = await run(['decide', '--options', 'Run now||Wait']);
  ok(JSON.stringify(bodies[1]?.add?.options) === '["Run now","","Wait"]', '"A||B" reaches the route AS TYPED (the empty label is not silently dropped)', bodies[1]);
  ok(bad.code === 1 && /options\[1\] is empty/.test(bad.stderr), '…and the CLI exits 1 printing the store\'s refusal BY NAME', bad);
  srv.close();
}

// ── §4b (lane S1 verify r2, M1) the route: a helper-ask item is refused by name — nothing written, nothing resolved ──
console.log('§4b POST /api/user-todos/:id/reply on a helper-ask item');
{
  const H = harness();
  const { wrote } = H.addSession('sess-h');
  const item = H.userTodos.add('claude:sid-sess-h', { origin: 'agent', kind: 'action', urgency: 'high', text: 'Helper “Fetch title of example.com” needs your approval to use WebFetch', action: { type: 'helper-ask', requestId: '2e19e852-98d5-4094-be1b-5fc1ccc2a3c7', sessionId: 'sess-h' } });
  const r = H.call(item.id, { text: 'yes, allow it' });
  ok(r.status === 409 && r.json.code === 'card_item' && /helper’s card/.test(r.json.error), 'a typed reply to a helper-ask item ⇒ 409 card_item with the sentence', r);
  ok(wrote.length === 0 && H.rec.feed.length === 0, 'NOTHING was written to the pty and nothing fed (a typed line can never be a control_response)', wrote.length);
  ok(H.userTodos.get(item.id).status === 'open', 'the item stays OPEN — the pointer to the waiting card is kept', H.userTodos.get(item.id).status);
  H.userTodos.stop(); H.userTodos.flush();
}

// ── §4c (lane-pairing verify-r4 F5) the route: an exit ask is refused by name — nothing written, nothing resolved ──
console.log('§4c POST /api/user-todos/:id/reply on an exit ask (verify-r4 F5)');
{
  const H = harness();
  const { wrote } = H.addSession('sess-x');
  let settled = 0;
  H.userTodos.onStatus(() => { settled++; }); // exit-proxy's one-state hook: an item leaving 'open' settles the ask DENIED
  const item = H.userTodos.add('claude:sid-sess-x', { origin: 'machines', kind: 'action', urgency: 'high', text: 'Allow "ops" to run a command on mac?', detail: 'id', action: { type: 'exit-run-ask', askId: 'b'.repeat(32), hostId: 'host-dial-mac', machine: 'mac', cmd: 'id' } });
  const r = H.call(item.id, { text: '可以，允许它运行 (yes, allow it)' });
  ok(r.status === 409 && r.json.code === 'exit_ask' && /Allow or Deny/.test(r.json.error), 'F5: a typed reply to an exit ask ⇒ 409 exit_ask with the sentence (pre-fix: 200 — the item resolved and the ask was DENIED)', r);
  ok(wrote.length === 0 && H.rec.feed.length === 0, 'F5: nothing reached the agent (it was not a message to it)', wrote.length);
  ok(H.userTodos.get(item.id).status === 'open' && settled === 0, 'F5: the item stays OPEN — no status move, so the ask is NOT settled (Allow / Deny still answer it)', { status: H.userTodos.get(item.id).status, settled });
  H.userTodos.stop(); H.userTodos.flush();
}

// ── §6 NEGATIVE CONTROL ──────────────────────────────────────────────────────
console.log('§6 negative control');
{
  const rel = 'src/routes/user-todos-reply.js';
  const src = read(rel);
  const needle = "      if (isAgentBearer(req)) return fail(res, 'agent_forbidden',";
  ok(src.includes(needle), 'control needle exists (a control that cannot be built proves nothing)');
  // the patched copy lives OUTSIDE the checkout (scripts/mutant-copy.mjs, test-architecture §51):
  // its relative requires still reach the real modules, its line numbers stay the original's
  const MUT = mutantCopies('inbox-reply', REPO);
  const mut = MUT.write(rel, src.split('\n').map((l) => (l.startsWith(needle) ? '' : l)).join('\n'), 'no-agent-bearer');
  for (const row of copiesCensus(MUT.files, MUT.dir, REPO, { label: '§6 ' })) ok(row.pass, row.name, row.detail);
  const H = harness(mut);
  const { wrote } = H.addSession('ctl-1');
  const it = H.userTodos.add('claude:sid-ctl-1', { origin: 'agent', text: 'control' });
  const r = H.call(it.id, { text: 'speaking as the owner' }, { authorization: 'Bearer vsst_x' });
  ok(r.status === 200 && wrote.length === 1, 'without the isAgentBearer line a vsst_ token IS let through — the §4 leg can go red', r);
  H.userTodos.stop(); H.userTodos.flush();
}

// ── §6b negative control (M1): the PURE verdict without its card_item rung ──
console.log('§6b negative control: replyVerdict without the card_item rung');
{
  const rel = 'src/inbox-reply.js';
  const src = read(rel);
  const needle = "  if (it.action && typeof it.action === 'object' && CARD_ACTION_TYPES.includes(it.action.type) && cardReplyRefused()) return no('card_item');\n"; // lane S1 verify r3: the rung asks the ask table's `reply` row
  ok(src.includes(needle), '§6b control needle exists');
  const MUT = mutantCopies('inbox-reply-card', REPO);
  const Mut = MUT.load(rel, src.replace(needle, ''), 'no-card-item');
  const helperItem = { id: 'ut-aaaaaaaaaa', sessionKey: 'claude:sid', text: 'q', action: { type: 'helper-ask', requestId: 'r1' } };
  const v = Mut.replyVerdict({ item: helperItem, session: { live: true, mode: 'chat', remoteState: null } });
  ok(v.ok === true, '§6b CONTROL: without the rung a helper-ask item is offered a typed reply (the F3 symptom: the item resolved, the helper still waiting) — the §2/§4b legs can go red', v);
  for (const row of copiesCensus(MUT.files, MUT.dir, REPO, { label: '§6b ' })) ok(row.pass, row.name, row.detail);
}

// ── §6c negative control (verify-r4 F5): the PURE verdict without its exit_ask rung ──
console.log('§6c negative control: replyVerdict without the exit_ask rung');
{
  const rel = 'src/inbox-reply.js';
  const src = read(rel);
  const needle = "  if (it.action && typeof it.action === 'object' && ANSWER_ACTION_TYPES.includes(it.action.type)) return no('exit_ask');\n";
  ok(src.includes(needle), '§6c control needle exists');
  const MUT = mutantCopies('inbox-reply-exit', REPO);
  const Mut = MUT.load(rel, src.replace(needle, ''), 'no-exit-ask');
  const v = Mut.replyVerdict({ item: { id: 'ut-aaaaaaaaaa', sessionKey: 'claude:sid', text: 'q', action: { type: 'exit-run-ask', askId: 'c'.repeat(32) } }, session: { live: true, mode: 'chat', remoteState: null } });
  ok(v.ok === true, '§6c CONTROL: without the rung an exit ask is offered a typed reply (the F5 symptom: "yes" resolved the item and DENIED the command) — the §2/§4c legs go red', v);
  for (const row of copiesCensus(MUT.files, MUT.dir, REPO, { label: '§6c ' })) ok(row.pass, row.name, row.detail);
}

// ── §7 chunk 4: setStatusMany + POST /api/user-todos/resolve-many ─────────────
console.log('§7 setStatusMany + resolve-many (chunk 4: "Mark all seen")');
{
  const { m, calls } = mkStore();
  ok(typeof m.setStatusMany === 'function', 'the store has setStatusMany');
  const a = m.add('claude:s', { origin: 'agent', text: 'a' }), b = m.add('claude:s', { origin: 'agent', text: 'b' }), c = m.add('claude:s', { origin: 'agent', text: 'c' });
  m.setStatus(c.id, 'done', 'user');
  const n0 = calls.length;
  let r = null; try { r = m.setStatusMany([a.id, 'ut-nope000000', b.id, c.id, a.id], 'dismissed', 'user'); } catch (e) { r = { threw: e.message }; }
  ok(r && Array.isArray(r.changed) && r.changed.length === 3 && [a.id, b.id, c.id].every((id) => r.changed.includes(id)), 'mixed ids ⇒ every KNOWN id changed (a duplicate counted once; an already-done id counts, changed to dismissed)', r);
  ok(r && Array.isArray(r.unknown) && r.unknown.length === 1 && r.unknown[0] === 'ut-nope000000', '…the unknown id is NAMED', r);
  ok(calls.length === n0 + 1, 'ONE onChange (one broadcast) for the whole batch', calls.length - n0);
  ok([a, b, c].every((x) => { const g = m.get(x.id); return g.status === 'dismissed' && g.resolvedBy === 'user' && typeof g.resolvedAt === 'number'; }), 'each is dismissed, resolvedBy user, stamped');
  let threw = null; try { m.setStatusMany([a.id], 'gone', 'user'); } catch (e) { threw = e.message; }
  ok(threw && /status must be one of open\/done\/dismissed/.test(threw), 'an invalid status THROWS by name', threw);
  const n1 = calls.length;
  const r2 = m.setStatusMany(['ut-nope000001'], 'done', 'user');
  ok(r2.changed.length === 0 && r2.unknown.length === 1 && calls.length === n1, 'nothing known ⇒ nothing written, no broadcast');
  m.stop(); m.flush();
}
{
  // the snapshot keeps a batch it just resolved: an OPEN popup keeps a row in its
  // slot only while the snapshot still lists it (nextLayout drops the rest)
  const { m } = mkStore();
  const ids = Array.from({ length: 30 }, (_, k) => m.add('claude:flood-' + Math.floor(k / 15), { origin: 'agent', text: 'flood ' + k }).id);
  const old = m.add('claude:old', { origin: 'agent', text: 'resolved long ago' });
  m.setStatus(old.id, 'done', 'user');
  m.get(old.id).resolvedAt = Date.now() - 2 * 3600e3;
  for (let k = 0; k < 20; k++) { const x = m.add('claude:older', { origin: 'agent', text: 'older ' + k }); m.setStatus(x.id, 'done', 'user'); m.get(x.id).resolvedAt = Date.now() - 3 * 3600e3 - k; }
  m.setStatusMany(ids, 'dismissed', 'user');
  const snap = m.snapshot();
  ok(ids.every((id) => snap.resolved.some((i) => i.id === id)), 'after a 30-id batch the snapshot lists all 30 resolved items (not the old flat 15)', snap.resolved.length);
  ok(!snap.resolved.some((i) => i.id === old.id) && snap.resolved.length === 30, '…while an item resolved hours ago beyond the newest 15 is not carried', snap.resolved.length);
  const { RESOLVED_TAIL, RESOLVED_SNAPSHOT_MAX } = require(path.join(REPO, 'src/user-todos.js'));
  ok(RESOLVED_TAIL === 15 && RESOLVED_SNAPSHOT_MAX >= 200, 'the tail keeps its newest 15 and is capped (≥ one resolve-many batch)');
  m.stop(); m.flush();
}
{
  const R2 = require(path.join(REPO, 'src/routes/user-todos-reply.js'));
  ok(typeof R2.registerResolveManyRoute === 'function', 'the route file exports registerResolveManyRoute');
  const mk = () => {
    const routes = {};
    const app = { post: (p, h) => { routes['POST ' + p] = h; }, get: (p, h) => { routes['GET ' + p] = h; } };
    const { m, calls } = mkStore();
    if (R2.registerResolveManyRoute) R2.registerResolveManyRoute(app, { userTodos: m });
    const h = routes['POST /api/user-todos/resolve-many'];
    const call = (body, headers = {}) => { let status = 200, json = null; if (h) h({ params: {}, body, headers }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } }); return { status, json }; };
    return { m, calls, call, h };
  };
  const H = mk();
  ok(typeof H.h === 'function', 'it registers POST /api/user-todos/resolve-many');
  const ids = ['x', 'y', 'z'].map((t) => H.m.add('claude:s', { origin: 'agent', text: t }).id);
  H.m.setStatus(ids[2], 'done', 'user');
  const many = Array.from({ length: 201 }, (_, k) => 'ut-' + String(k).padStart(10, '0'));
  const r201 = H.call({ ids: many, status: 'dismissed' });
  ok(r201.status === 400 && r201.json && r201.json.code === 'too_many', '201 ids ⇒ 400 too_many', r201);
  const n0 = H.calls.length;
  const rv = H.call({ ids, status: 'dismissed' }, { authorization: 'Bearer vsst_abc' });
  const rj = H.call({ ids, status: 'dismissed' }, { authorization: 'Bearer jbt_abc' });
  ok(rv.status === 403 && rv.json.code === 'agent_forbidden' && rj.status === 403 && rj.json.code === 'agent_forbidden', 'vsst_ / jbt_ ⇒ 403 agent_forbidden', [rv, rj]);
  ok(H.calls.length === n0 && ids.slice(0, 2).every((id) => H.m.get(id).status === 'open'), '…and nothing changed, nothing broadcast');
  const bad = [[{ ids: [], status: 'dismissed' }, 'bad_ids'], [{ ids: 'x', status: 'dismissed' }, 'bad_ids'], [{ ids: [7], status: 'dismissed' }, 'bad_ids'], [{ ids, status: 'open' }, 'bad_status'], [{ ids }, 'bad_status']];
  ok(bad.every(([body, code]) => { const r = H.call(body); return r.status === 400 && r.json.code === code; }), 'empty / non-array / non-string ids ⇒ 400 bad_ids; a status other than dismissed|done (incl. a reopen) ⇒ 400 bad_status');
  const r3 = H.call({ ids, status: 'dismissed' });
  ok(r3.status === 200 && r3.json && r3.json.ok === true && r3.json.changed === 3 && Array.isArray(r3.json.unknown) && r3.json.unknown.length === 0, 'a 3-id dismiss ⇒ {ok, changed:3, unknown:[]} (the already-done id counts as changed-to-dismissed)', r3);
  ok(H.calls.length === n0 + 1, 'ONE broadcast recorded', H.calls.length - n0);
  ok(ids.every((id) => H.m.get(id).status === 'dismissed' && H.m.get(id).resolvedBy === 'user'), 'every item dismissed by the user');
  const r4 = H.call({ ids: [ids[0], 'ut-gone000000'], status: 'done' });
  ok(r4.status === 200 && r4.json.changed === 1 && r4.json.unknown[0] === 'ut-gone000000', 'a partial batch answers the unknown id by name', r4);
  H.m.stop(); H.m.flush();
  // WIRING: server.js registers it BEFORE the `/api/user-todos/:id` status route (Express matches in order — after it, `resolve-many` would be read as an item id)
  const srv = read('server.js');
  const iMany = srv.indexOf('registerResolveManyRoute(app, { userTodos })');
  const iId = srv.indexOf("app.post('/api/user-todos/:id', ");
  ok(iMany > 0 && iId > 0 && iMany < iId, 'server.js registers resolve-many BEFORE the /api/user-todos/:id route', { iMany, iId });
  const rsrc = read('src/routes/user-todos-reply.js');
  const body = (rsrc.match(/function registerResolveManyRoute[\s\S]*?\n\}\n/) || [''])[0];
  ok(/if \(isAgentBearer\(req\)\) return fail\(403, 'agent_forbidden'/.test(body) && /userTodos\.setStatusMany\(/.test(body) && /RESOLVE_MANY_MAX/.test(body), 'the route refuses agent tokens first and writes through setStatusMany under the 200 cap');
}

// ── §8 A REPLY TO A CONVERSATION THAT ENDED REOPENS IT (lane inbox-reply-dead-session) ──────────────
console.log('§8a PURE reopenCreate — the page\'s own resume road, field for field');
const RO = require(path.join(REPO, 'src/inbox-reopen.js'));
{
  const cfg = { model: 'claude-opus-4', permission: 'plan', effort: 'high', outputStyle: 'Explanatory', worktree: true, autoResume: false, account: 'acct-1', modelLock: true, lockModel: 'claude-opus-4', poolPin: { memberId: 'm-1', at: 7, poolId: 'pool-a' } };
  const a = RO.reopenCreate({ key: 'claude:c-1', entry: { cwd: '/home/u/proj', name: 'disc name' }, cfg, defaults: { permission: 'default', extraArgs: '--verbose' }, name: 'My lane', taskId: 'T-1', reqId: 'reopen-x' });
  const want = { type: 'create', backend: 'claude', mode: 'chat', cwd: '/home/u/proj', sessionName: 'My lane', model: 'claude-opus-4', permissionMode: 'plan', effort: 'high', outputStyle: 'Explanatory', autoResume: false, extraArgs: '--verbose', worktree: true, spawnOriginHint: { model: 'chosen', effort: 'chosen' }, resume: true, resumeId: 'c-1', cols: 120, rows: 30, reqId: 'reopen-x', taskId: 'T-1', accountId: 'acct-1', modelLock: true, lockModel: 'claude-opus-4', poolPin: { memberId: 'm-1', at: 7, poolId: 'pool-a' } };
  const clean = (o) => JSON.parse(JSON.stringify(o));
  ok(a.ok && JSON.stringify(clean(a.data)) === JSON.stringify(want), 'a config that states everything ⇒ the create the page sends: resume of c-1 in chat mode, the conversation\'s own model / permission / effort / style / account / lock / pool pin, the harness\'s extra args, its first Task Group', clean(a.data));
  ok(a.conversation && a.conversation.backend === 'claude' && a.conversation.backendSessionId === 'c-1' && a.conversation.cwd === '/home/u/proj' && a.conversation.hostId === null, '…and names the conversation it reopens (backend, id, cwd, no host)', a.conversation);
  const b = RO.reopenCreate({ key: 'codex:t-9', entry: { cwd: 'box: /srv/x', host: 'h-1' }, cfg: null, defaults: { permission: 'default' }, name: '' });
  ok(b.ok && b.data.backend === 'codex' && b.data.hostId === 'h-1' && b.data.cwd === '/srv/x' && b.data.model === undefined && b.data.effort === undefined && b.data.spawnOriginHint.model === 'harness' && b.data.permissionMode === 'default' && b.data.accountId === undefined && b.data.poolPin === undefined && b.data.sessionName === undefined,
    'no config ⇒ model / effort NOT sent (the server\'s continuity ladder reads the conversation\'s own), the instance permission default filled in, a merged record\'s "host: /path" cut to the path, the host carried', clean(b.data));
  const c = RO.reopenCreate({ key: 'claude:c-2', entry: { cwd: '/p' }, cfg: { permission: '' }, defaults: { permission: 'acceptEdits' } });
  ok(c.ok && c.data.permissionMode === undefined, 'a STATED empty permission beats the default (createSession: `permission !== undefined ? permission : default`, then `|| undefined`)', clean(c.data));
  const d = RO.reopenCreate({ key: 'claude:c-3', entry: null, item: { cwd: '/far', hostId: 'h-2' } });
  ok(d.ok && d.data.hostId === 'h-2' && d.data.cwd === '/far', 'not in this machine\'s discovery but the ask names its host ⇒ the remote resume on that host (the create judges the transcript there)', clean(d.data));
  const refusals = [
    [RO.reopenCreate({ key: 'webui:abc', entry: { cwd: '/p' } }), /filed before its conversation had an id/],
    [RO.reopenCreate({ key: 'claude:c-4', entry: null, item: { cwd: '/p' } }), /no transcript of this conversation was found on this machine/],
    [RO.reopenCreate({ key: 'claude:c-5', entry: { cwd: '' }, item: {} }), /folder this conversation ran in is not known/],
    [RO.reopenCreate({ key: 'accounts' }), /filed before its conversation had an id/],
  ];
  ok(refusals.every(([r, re]) => r.ok === false && re.test(r.why)), 'a webui: key, a LOCAL conversation discovery does not list (no transcript — never guessed), an unknown folder, a producer key ⇒ refused BY NAME', refusals.map(([r]) => r.why));
  // THE MIRROR CENSUS: the page's resume road reads these config fields and sends these keys — a new one reds HERE
  const life = read('src/lib/session-lifecycle.js');
  const resumeBody = (life.match(/\n  resumeSession\(sessionId, cwd, sessionName[\s\S]*?\n  \},\n/) || [''])[0];
  const cfgReads = [...new Set([...resumeBody.matchAll(/savedCfg\.(\w+)/g)].map((m) => m[1]))].sort();
  ok(resumeBody.length > 1000 && JSON.stringify(cfgReads) === JSON.stringify([...RO.REOPEN_CFG_KEYS].sort()), `session-lifecycle resumeSession reads exactly REOPEN_CFG_KEYS from the conversation's config (${cfgReads.join(', ')})`, { cfgReads, REOPEN_CFG_KEYS: RO.REOPEN_CFG_KEYS });
  const createMsg = (life.match(/const createMsg = \{[\s\S]*?\n    \};/) || [''])[0];
  const sentKeys = Object.keys(a.data).filter((k) => k !== 'type');
  const notInClient = sentKeys.filter((k) => !new RegExp(`[{,\\s]${k}[:,]`).test(createMsg));
  ok(createMsg.length > 500 && notInClient.length === 0, `every key reopenCreate sends is a key of the page's createMsg (${sentKeys.length} keys)`, notInClient);
  const jumpSrc = read('src/lib/user-todos-actions.js');
  ok(/else if \(s\.status === 'stopped'\) app\.resumeSession\(s\.sessionId, s\.cwd, displayName\(s\), \{ backend: s\.backend, hostId: s\.hostId \|\| s\.host \|\| undefined \}\);/.test(jumpSrc), 'the For-you\'s own "open the session" door is that resume (jump: resumeSession(id, cwd, name, {backend, hostId}) — no mode, no model: what reopenCreate mirrors)');
}
console.log('§8a PURE replyBoxView — the box both surfaces draw, never disabled');
{
  const stopped = R.replyBoxView({ show: true, enabled: false, why: R.REPLY_WHY.no_live_session, code: 'no_live_session' });
  const live = R.replyBoxView({ show: true, enabled: true, why: '', code: null });
  const term = R.replyBoxView({ show: true, enabled: false, why: R.REPLY_WHY.not_chat, code: 'not_chat' });
  const failedRe = R.replyBoxView({ show: true, enabled: false, why: R.REPLY_WHY.no_live_session, code: 'no_live_session' }, { code: 'resume_failed', why: 'claude is not installed on this machine' });
  const failedSend = R.replyBoxView({ show: true, enabled: true, code: null }, { code: 'send_failed', why: 'EPIPE' });
  ok(stopped.reopen && stopped.note.key === R.REPLY_WHY.no_live_session && stopped.send === 'Reopen and send' && /Reopen the conversation/.test(stopped.sendTitle), 'an ended conversation ⇒ reopen, the note says it ends + the send reopens it, the send reads "Reopen and send"', stopped);
  ok(!live.reopen && live.note === null && live.send === 'Reply' && live.sendTitle === 'Send reply (Enter) · newline (Shift+Enter)', 'a live chat ⇒ no note, "Reply" with its old title (the live box is unchanged)', live);
  ok(!term.reopen && term.note.key === R.REPLY_WHY.not_chat && term.send === 'Reply', 'a live terminal ⇒ its fact said in the note, nothing reopened (a send is answered by name)', term);
  ok(failedRe.note.key === 'Could not reopen the conversation: {why}' && failedRe.note.why === 'claude is not installed on this machine' && failedRe.reopen, 'a failed reopen ⇒ the note says it with the resume\'s own reason (never silent)', failedRe);
  ok(failedSend.note.key === 'Could not reply: {why}' && failedSend.note.why === 'EPIPE', 'any other refused send ⇒ "Could not reply: …" in the note', failedSend);
  ok(!Object.keys(stopped).some((k) => /disabled|enabled/i.test(k)), 'the box view has NO enabled/disabled field — nothing in it can grey a box out', Object.keys(stopped));
  // the words, en / zh / ja — the brief's own zh sentence and button
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const pair = (src, k) => { const m = src.match(new RegExp('\\n  ' + JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ("(?:[^"\\\\]|\\\\.)*"),')); return m ? JSON.parse(m[1]) : null; };
  const WORDS = [R.REPLY_WHY.no_live_session, 'Reopen and send', 'Reopen the conversation and send this reply (Enter) · newline (Shift+Enter)', 'Reopen and send "{label}"', 'Reopened the conversation and sent your reply', 'Could not reopen the conversation: {why}', 'Could not open the conversation: {why}'];
  ok(pair(zh, R.REPLY_WHY.no_live_session) === '这个对话已结束；发送会重新打开它并把这条回复作为第一条消息' && pair(zh, 'Reopen and send') === '重新打开并发送', 'zh: 「这个对话已结束；发送会重新打开它并把这条回复作为第一条消息」 + 「重新打开并发送」 (the brief\'s words)', [pair(zh, R.REPLY_WHY.no_live_session), pair(zh, 'Reopen and send')]);
  ok(pair(ja, R.REPLY_WHY.no_live_session) === 'この会話は終了しています。送信すると会話を再開し、この返信を最初のメッセージとして送ります' && pair(ja, 'Reopen and send') === '再開して送信', 'ja: the note + 「再開して送信」', [pair(ja, R.REPLY_WHY.no_live_session), pair(ja, 'Reopen and send')]);
  ok(WORDS.every((k) => pair(zh, k) && pair(ja, k)) && !zh.includes('Agent not running — open the session, then reply') && !ja.includes('Agent not running — open the session, then reply'), `every new word has zh + ja (${WORDS.length}); the retired "open the session, then reply" key is gone from both`, WORDS.filter((k) => !pair(zh, k) || !pair(ja, k)));
}
console.log('§8b the ROUTE with a reopen dep');
{
  // the fake reopen = what the ORCH answers: the conversation is live again under a NEW webui id
  const H = harness(undefined, { reopen: async (item, o, { addSession }) => { const id = 'reo-' + item.sessionKey.split(':')[1]; const { s, wrote } = addSession(id, { backendSessionId: item.sessionKey.split(':')[1] }); H8.made.push({ id, s, wrote }); return { ok: true, sessionId: id, conversation: { backend: 'claude', backendSessionId: item.sessionKey.split(':')[1], cwd: '/p', hostId: null, name: 'ended one' } }; } });
  const H8 = { made: [] };
  const dead = H.userTodos.add('claude:ended-1', { origin: 'agent', text: 'Ship it?', options: ['yes', 'no'], urgency: 'high' });
  const n0 = H.calls.length;
  const r = await H.callAsync(dead.id, { text: 'yes — ship after the tests' });
  const made = H8.made[0];
  ok(r.status === 200 && r.json.ok === true && r.json.reopened === true && r.json.sessionId === 'reo-ended-1' && r.json.conversation && r.json.conversation.backendSessionId === 'ended-1' && /-reply$/.test(r.json.msgId), 'an ENDED conversation ⇒ 200 {ok, reopened:true, sessionId, conversation, msgId}', r.json);
  ok(H.reopened.length === 1 && H.reopened[0][0] === dead.id && H.reopened[0][1] && H.reopened[0][1].by === 'human:local', 'the route asked for ONE reopen of that item, naming who pressed (device-audit byOfReq)', H.reopened);
  ok(made && made.wrote.length === 1 && userTextOf(made.wrote[0]) === R.composeReply({ ...dead, status: 'open' }, 'yes — ship after the tests', { now: H.NOW }), 'the reply is the reopened session\'s FIRST input — exactly ONE frame, its text === composeReply(item, reply)', made && made.wrote.map((w) => userTextOf(w).slice(0, 80)));
  ok(made && typeof made.s._userInputAt === 'number' && !made.s._machineInputAt, '…typed as the PERSON\'s turn (_userInputAt — never the machine-turn mark)');
  const after = H.userTodos.get(dead.id);
  ok(after.status === 'done' && after.resolvedBy === 'reply' && after.reply.text === 'yes — ship after the tests' && r.json.item.id === dead.id && H.calls.length === n0 + 1, 'the item resolved by the reply (ONE store broadcast)', after);
  // a chip on an ended conversation = the same reopen (its label is the whole reply)
  const deadChip = H.userTodos.add('claude:ended-2', { origin: 'agent', text: 'Pick', options: ['left', 'right'] });
  const rc = await H.callAsync(deadChip.id, { text: 'right' });
  ok(rc.status === 200 && rc.json.reopened && H8.made[1] && H8.made[1].wrote.length === 1 && userTextOf(H8.made[1].wrote[0]).endsWith('\n\nright'), 'an option chip on an ended conversation reopens it the same way (the label is its first message)', rc.json);
  // live / terminal / agent bearer: never a reopen
  const nRe = H.reopened.length;
  const { wrote: lw } = H.addSession('live-8');
  const liveIt = H.userTodos.add('claude:sid-live-8', { origin: 'agent', text: 'live one' });
  const rl = H.call(liveIt.id, { text: 'plain answer' });
  ok(rl.status === 200 && !rl.json.reopened && lw.length === 1 && H.reopened.length === nRe, 'a LIVE session with the reopen wired ⇒ the old path (no reopen asked, one frame, no `reopened`)', rl.json);
  const H0 = harness();
  const { wrote: lw0 } = H0.addSession('live-8');
  const liveIt0 = H0.userTodos.add('claude:sid-live-8', { origin: 'agent', text: 'live one' });
  H0.call(liveIt0.id, { text: 'plain answer' });
  const strip = (w) => { const f = JSON.parse(w); return JSON.stringify({ ...f, uuid: undefined, message: { ...f.message, content: [{ ...f.message.content[0], text: f.message.content[0].text.replace(/#ut-\w+/, '#ID') }] } }); };
  ok(lw0.length === 1 && strip(lw0[0]) === strip(lw[0]), 'BYTE-IDENTICAL live path: the frame with the reopen wired === the frame without it (the item id aside)', [lw0[0] && strip(lw0[0]).slice(0, 160), lw[0] && strip(lw[0]).slice(0, 160)]);
  H0.userTodos.stop(); H0.userTodos.flush();
  H.addSession('term-8', { mode: 'terminal' });
  const termIt = H.userTodos.add('claude:sid-term-8', { origin: 'agent', text: 'terminal one' });
  const rt = H.call(termIt.id, { text: 'x' });
  ok(rt.status === 409 && rt.json.code === 'not_chat' && H.reopened.length === nRe, 'a live TERMINAL ⇒ 409 not_chat, never a reopen (only no_live_session reopens)', rt.json);
  const deadB = H.userTodos.add('claude:ended-3', { origin: 'agent', text: 'agent tries' });
  const rb = H.call(deadB.id, { text: 'as the owner' }, { authorization: 'Bearer vsst_zzz' });
  const rj = H.call(deadB.id, { text: 'as the owner' }, { authorization: 'Bearer jbt_zzz' });
  ok(rb.status === 403 && rb.json.code === 'agent_forbidden' && rj.status === 403 && H.reopened.length === nRe && H.userTodos.get(deadB.id).status === 'open', 'an AGENT bearer (vsst_ / jbt_) on an ended conversation ⇒ 403, nothing reopened, nothing resolved', [rb.json, rj.json]);
  const bad = await H.callAsync(deadB.id, { text: '   ' });
  ok(bad.status === 400 && bad.json.code === 'empty' && H.reopened.length === nRe, 'a blank reply ⇒ 400 empty BEFORE any reopen (nothing started for nothing)', bad.json);
  H.userTodos.stop(); H.userTodos.flush();
}
{
  const failing = harness(undefined, { reopen: async () => ({ ok: false, why: 'claude is not installed on this machine (no "claude" on PATH — install it or set CLAUDE_CMD)' }) });
  const it = failing.userTodos.add('claude:ended-9', { origin: 'agent', text: 'q' });
  const r = await failing.callAsync(it.id, { text: 'answer' });
  ok(r.status === 409 && r.json.code === 'resume_failed' && r.json.error === 'claude is not installed on this machine (no "claude" on PATH — install it or set CLAUDE_CMD)' && failing.userTodos.get(it.id).status === 'open' && !failing.userTodos.get(it.id).reply, 'a resume that FAILS ⇒ 409 resume_failed with the resume\'s own reason, the item still open, no reply kept', r.json);
  failing.userTodos.stop(); failing.userTodos.flush();
  const throwing = harness(undefined, { reopen: async () => { throw new Error('spawn EACCES'); } });
  const it2 = throwing.userTodos.add('claude:ended-10', { origin: 'agent', text: 'q' });
  const r2 = await throwing.callAsync(it2.id, { text: 'answer' });
  ok(r2.status === 409 && r2.json.code === 'resume_failed' && /spawn EACCES/.test(r2.json.error) && throwing.userTodos.get(it2.id).status === 'open', 'a reopen that THROWS ⇒ 409 resume_failed naming the error', r2.json);
  throwing.userTodos.stop(); throwing.userTodos.flush();
  const H = harness(undefined, { reopen: async (item, o, { addSession }) => { addSession('reo-term', { mode: 'terminal' }); return { ok: true, sessionId: 'reo-term', conversation: { backend: 'claude', backendSessionId: 'ended-11' } }; } });
  const it3 = H.userTodos.add('claude:ended-11', { origin: 'agent', text: 'q' });
  const r3 = await H.callAsync(it3.id, { text: 'answer' });
  ok(r3.status === 409 && r3.json.code === 'not_chat' && r3.json.reopened === true && r3.json.sessionId === 'reo-term' && H.userTodos.get(it3.id).status === 'open', 'reopened but the SENDER refused ⇒ its code + reopened:true + sessionId (the page opens it), the item still open', r3.json);
  H.userTodos.stop(); H.userTodos.flush();
}
console.log('§8c the ORCH reopener over a recording create');
{
  const IR = require(path.join(REPO, 'src/server/inbox-reopen.js'));
  const OPS = require(path.join(REPO, 'src/server/conversation-ops.js')); // int322: the reopen goes through THE conversation seam
  const mk = ({ answer = 'created', discovered = { cwd: '/home/u/proj', name: 'disc' }, us = {}, getHandle = true, delay = 0, located = null } = {}) => {
    const activeSessions = new Map();
    const creates = [];
    const handleCreate = async (ws, data, attached) => {
      creates.push({ ws, data, attached });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (answer === 'throw') throw new Error('boom');
      if (answer === 'created') { const sess = { mode: 'chat', clients: new Map([[ws, { cols: data.cols, rows: data.rows }]]) }; activeSessions.set('w-new', sess); ws.send(JSON.stringify({ type: 'created', sessionId: 'w-new', name: 'Resumed name', reqId: data.reqId })); }
      else if (answer === 'already') { activeSessions.set('w-old', { mode: 'chat', clients: new Map() }); ws.send(JSON.stringify({ type: 'error', code: 'resume-already-live', existingId: 'w-old', reqId: data.reqId, message: 'already live' })); }
      else if (answer === 'error') ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Account error: the account cannot serve' }));
    };
    const logs = [];
    const locates = [];
    const ops = OPS.forDeps({ handleCreate, activeSessions });
    const opens = [];
    const R2 = IR.create({ getOpenConversation: () => (getHandle ? (spec, by, o) => { opens.push({ spec, by, o }); return ops.openConversation(spec, by, o); } : null), activeSessions, discover: async (key) => (discovered ? { ...discovered, sessionKey: key } : null), readUserState: () => us,
      locate: (b, id, cwd) => { locates.push([b, id, cwd]); return located; },
      defaultsFor: (b) => ({ permission: b === 'claude' ? 'default' : '', extraArgs: '' }), taskFor: (key) => (key === 'claude:c-1' ? 'T-7' : null), log: (l) => logs.push(l) });
    return { R2, creates, activeSessions, logs, locates, opens };
  };
  const us = { sessionConfigs: { 'claude:c-1': { model: 'claude-opus-4', account: 'acct-9' } }, customNames: { 'c-1': 'Named by the owner' } };
  const A = mk({ us });
  const r = await A.R2.reopen({ id: 'ut-1', sessionKey: 'claude:c-1', sessionName: 'frozen' }, { by: 'human:me' });
  const sent = A.creates[0];
  ok(r.ok && r.sessionId === 'w-new' && A.creates.length === 1, 'reopen ⇒ ONE create through the handed create case ⇒ {ok, sessionId}', r);
  ok(sent && sent.data.resume === true && sent.data.resumeId === 'c-1' && sent.data.mode === 'chat' && sent.data.cwd === '/home/u/proj' && sent.data.model === 'claude-opus-4' && sent.data.accountId === 'acct-9' && sent.data.permissionMode === 'default' && sent.data.taskId === 'T-7' && sent.data.sessionName === 'Named by the owner' && /^reopen-/.test(sent.data.reqId),
    'the create = the resume of c-1 with the conversation\'s user-state config, the owner\'s custom name (a legacy bare-id key), its Task Group, the harness default permission', sent && sent.data);
  ok(sent && sent.ws._headless === true && sent.ws._actBy === 'human:me' && sent.ws.readyState === 1 && sent.attached instanceof Set, 'the creator is a HEADLESS socket naming who pressed (its own attached set)', sent && { h: sent.ws._headless, by: sent.ws._actBy });
  ok(A.opens.length === 1 && A.opens[0].by.kind === 'human' && A.opens[0].by.actBy === 'human:me' && A.opens[0].o.ws === sent.ws && A.opens[0].o.attachedSessions === sent.attached && A.opens[0].spec === sent.data,
    'int322: the reopen goes through THE SEAM (conversation-ops openConversation, by: human, its creator socket) and the seam ran the create case with the very message and socket — byte-identical', A.opens[0] && A.opens[0].by);
  ok(!A.activeSessions.get('w-new').clients.has(sent.ws) && A.activeSessions.get('w-new').clients.size === 0, '…and it LEFT the session\'s clients the moment the create answered (the window the page opens attaches like any other)');
  ok(r.conversation && r.conversation.name === 'Resumed name' && r.conversation.backendSessionId === 'c-1' && r.conversation.cwd === '/home/u/proj', 'the answer names the conversation (the create\'s own name for it)', r.conversation);
  const E = mk({ answer: 'error' });
  const re = await E.R2.reopen({ sessionKey: 'claude:c-2' });
  ok(!re.ok && re.why === 'Account error: the account cannot serve' && E.logs.some((l) => /the resume failed — Account error/.test(l)), 'a create that answers an ERROR ⇒ {ok:false, why: its own words} (+ one journal line)', re);
  const L2 = mk({ answer: 'already' });
  const ra = await L2.R2.reopen({ sessionKey: 'claude:c-3' });
  ok(ra.ok && ra.sessionId === 'w-old' && ra.already === true, 'resume-already-live (a page resumed it a moment ago) ⇒ THAT session carries the reply', ra);
  const N = mk({ answer: 'none' });
  const rn = await N.R2.reopen({ sessionKey: 'claude:c-4' });
  ok(!rn.ok && /did not start/.test(rn.why), 'a create that answered nothing ⇒ said ("did not start"), never a silent ok', rn);
  const T = mk({ answer: 'throw' });
  const rt = await T.R2.reopen({ sessionKey: 'claude:c-5' });
  ok(!rt.ok && /did not start: boom/.test(rt.why), 'a create that THROWS ⇒ said with its message', rt);
  const S = mk({ delay: 30 });
  const [p1, p2] = await Promise.all([S.R2.reopen({ sessionKey: 'claude:c-6' }), S.R2.reopen({ sessionKey: 'claude:c-6' })]);
  ok(S.creates.length === 1 && p1.ok && p2.ok && p1.sessionId === p2.sessionId && S.R2.inflightCount() === 0, 'two replies at once (a double press, a second device) ⇒ ONE create, both answered with the same session', { creates: S.creates.length });
  const W2 = mk();
  const rw = await W2.R2.reopen({ sessionKey: 'webui:abc' });
  const U = mk({ discovered: null });
  const ru = await U.R2.reopen({ sessionKey: 'claude:c-7', cwd: '/p' });
  const B = mk({ getHandle: false });
  const rbt = await B.R2.reopen({ sessionKey: 'claude:c-8' });
  ok(!rw.ok && /before its conversation had an id/.test(rw.why) && !ru.ok && /no transcript/.test(ru.why) && !rbt.ok && /still booting/.test(rbt.why) && W2.creates.length + U.creates.length + B.creates.length === 0, 'a webui key / a local conversation neither discovery nor the harness store knows / no create case yet ⇒ refused BY NAME, no create sent', [rw.why, ru.why, rbt.why]);
  ok(U.locates.length === 1 && U.locates[0][0] === 'claude' && U.locates[0][1] === 'c-7' && U.locates[0][2] === '/p', '…the harness store WAS asked first (backend, id, the ask\'s folder)', U.locates);
  const Lc = mk({ discovered: null, located: '/home/u/.claude/projects/-p/c-9.jsonl' });
  const rl = await Lc.R2.reopen({ sessionKey: 'claude:c-9', cwd: '/p' });
  ok(rl.ok && Lc.creates.length === 1 && Lc.creates[0].data.cwd === '/p' && Lc.creates[0].data.hostId === undefined && Lc.creates[0].data.resumeId === 'c-9', 'not discovered but the HARNESS STORE locates its transcript ⇒ resumed here, in the folder the ask was filed from', Lc.creates[0] && Lc.creates[0].data);
  const Rc = mk({ discovered: null, located: '/srv/vibespace/data/remote-jsonl/h-1/c-10.jsonl' });
  const rr = await Rc.R2.reopen({ sessionKey: 'claude:c-10', cwd: '/p' });
  ok(!rr.ok && /no transcript/.test(rr.why) && Rc.creates.length === 0, 'a REMOTE copy cached here is no evidence (it would resume another machine\'s conversation locally) ⇒ refused by name', rr);
  const Hc = mk({ discovered: null, located: '/never' });
  const rh = await Hc.R2.reopen({ sessionKey: 'claude:c-11', cwd: '/far', hostId: 'h-2' });
  ok(rh.ok && Hc.locates.length === 0 && Hc.creates[0].data.hostId === 'h-2' && Hc.creates[0].data.cwd === '/far', 'an ask filed from ANOTHER machine ⇒ resumed on that host (never located here)', Hc.creates[0] && Hc.creates[0].data);
}
console.log('§8d wiring pins + RED CONTROL');
{
  const srv = read('server.js'), wsh = read('src/ws-handler.js'), rsrc = read('src/routes/user-todos-reply.js');
  ok(/const wsApi = registerWsHandler\(wss, \{/.test(srv) && /\n  return \{ convOps \}; \/\/ [^\n]*\n\}\n/.test(wsh), 'ws-handler hands its conversation seams back (return { convOps } — int322: never the raw create case) and server.js keeps them (wsApi)');
  ok(/const inboxReopen = require\('\.\/src\/server\/inbox-reopen\.js'\)\.create\(\{ getOpenConversation: \(\) => wsApi && wsApi\.convOps && wsApi\.convOps\.openConversation, activeSessions, readUserState: \(\) => persistenceRouter\.readUserState\(\), discover: async \(key\) => .*warmSessions\(\).*sessionKey === key/.test(srv), 'server.js builds the reopener over the conversation seam (int322), user-state and the discovery sweep the sidebar lists');
  ok(/if \(!v\.ok && v\.code === 'no_live_session' && typeof reopen === 'function'\) return reopenAndSend\(req, res, item, t\.text\);\n      if \(!v\.ok\) return fail\(res, v\.code, v\.why\);/.test(rsrc), 'the route reopens ONLY on no_live_session, right before the refusal it replaces');
  ok(/NOT AN UNATTENDED SPEND: this first turn is the PERSON's/.test(rsrc) && (rsrc.match(/\bsendUserInput\s*\(/g) || []).length === 2, 'the reopened first turn is commented at its call as the PERSON\'s typed turn, and rides THE typing path (the file\'s 2 sendUserInput calls — the spend census\'s typed-send ALLOW row)');
  ok(!/formatChatInput|deliverToConversation|authorizeSpend|sendToSession/.test(read('src/server/inbox-reopen.js')) && !/formatChatInput|deliverToConversation|authorizeSpend|sendToSession|sendUserInput/.test(read('src/inbox-reopen.js')), 'the reopener sends nothing into a conversation (no frame, no ladder, no typing) — a resume bills no turn');
  // RED CONTROL: the route WITHOUT its reopen line = the pre-lane answer
  const rel = 'src/routes/user-todos-reply.js';
  const needle = "      if (!v.ok && v.code === 'no_live_session' && typeof reopen === 'function') return reopenAndSend(req, res, item, t.text);";
  ok(rsrc.includes(needle), '§8d control needle exists');
  const MUT = mutantCopies('inbox-reply-reopen', REPO);
  const mut = MUT.write(rel, rsrc.split('\n').map((l) => (l === needle ? '' : l)).join('\n'), 'no-reopen');
  for (const row of copiesCensus(MUT.files, MUT.dir, REPO, { label: '§8d ' })) ok(row.pass, row.name, row.detail);
  const H = harness(mut, { reopen: async () => ({ ok: true, sessionId: 'never' }) });
  const it = H.userTodos.add('claude:ended-ctl', { origin: 'agent', text: 'control' });
  const r = await H.callAsync(it.id, { text: 'answer' });
  ok(r.status === 409 && r.json.code === 'no_live_session' && H.reopened.length === 0, 'RED CONTROL: without the reopen line an ended conversation\'s reply is the pre-lane 409 no_live_session — the §8b legs can go red', r.json);
  H.userTodos.stop(); H.userTodos.flush();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
