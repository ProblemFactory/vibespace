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
  ok(noSess.code === 'no_live_session' && noSess.why === 'Agent not running — open the session, then reply', 'no session ⇒ no_live_session + its tooltip sentence', noSess);
  ok(term.code === 'not_chat' && term.why === 'Terminal session — reply in its window', 'terminal ⇒ not_chat', term);
  ok(unreach.code === 'host_unreachable' && unreach.why === 'Host unreachable — reconnect, then reply', 'unreachable host ⇒ host_unreachable', unreach);
  ok(idle.ok === true && mid.ok === true, 'live idle ⇒ ok; live MID-TURN ⇒ ok too (the session queues it)');
  ok(v(idle, { ...item, sessionKey: 'accounts' }).code === 'no_session' && v(idle, { ...item, sessionKey: 'jobs' }).code === 'no_session' && v(idle, { ...item, jobId: 'j1' }).code === 'job_item', 'accounts/jobs keys ⇒ no_session; a job item ⇒ job_item (those two are HIDDEN, not disabled)');
  ok(R.REPLY_HIDDEN_CODES.includes('no_session') && R.REPLY_HIDDEN_CODES.includes('job_item') && R.REPLY_HIDDEN_CODES.length === 2, 'REPLY_HIDDEN_CODES = exactly the two no-surface codes');
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
function harness(routeFile = 'src/routes/user-todos-reply.js') {
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
  registerUserTodoReplyRoutes(app, { userTodos, activeSessions, sendUserInput: sender.send, sessionStatusKey, now: () => NOW });
  const handler = routes['POST /api/user-todos/:id/reply'];
  const call = (id, body, headers = {}) => { let status = 200, json = null; handler({ params: { id }, body, headers }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } }); return { status, json }; };
  const addSession = (id, over = {}) => { const wrote = []; const s = { backend: 'claude', mode: 'chat', pty: { write: (x) => wrote.push(x) }, _isStreaming: false, _remoteState: null, backendSessionId: 'sid-' + id, buffer: '', ...over }; activeSessions.set(id, s); return { s, wrote }; };
  return { call, userTodos, calls, activeSessions, rec, addSession, NOW, handler };
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
  ok(/createUserInputSender\(\{[^}]*\}\)\.send;/.test(srv) && /registerUserTodoReplyRoutes\(app, \{ userTodos, activeSessions, sendUserInput, sessionStatusKey \}\)/.test(srv), 'server.js constructs the ONE sender and hands it to the reply route');
  ok(/registerWsHandler\(wss, \{[\s\S]*?\bsendUserInput,[\s\S]*?\n\}\);/.test(srv), '…and to the ws handler through ctx');
  ok(/turn: require\('\.\/src\/server\/turn-facts\.js'\)\.turnOf\(s\)/.test(srv) && /turnDigest\(activeSessions\)/.test(srv) && /\}, 1000\)\.unref\(\)/.test(srv), 'the payload carries `turn`, re-broadcast by ONE unref\'d 1 s digest');
  const { SPEND_REASONS } = require(path.join(REPO, 'src/spend-authorizer.js'));
  ok(Array.isArray(SPEND_REASONS) ? !SPEND_REASONS.some((x) => /reply|inbox/.test(String(x))) : !Object.keys(SPEND_REASONS || {}).some((x) => /reply|inbox/.test(x)), 'no spend reason for a reply (a per-occurrence owner action is not an unattended turn)');
  const ag = read('src/agent-routes.js');
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

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
