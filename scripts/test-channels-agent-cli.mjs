#!/usr/bin/env node
// THE AGENT CLI (docs/design-communication-panel.zh.md §11; gate row
// `test-channels-agent-cli`, fast): data/bin/vibespace-channels driven against
// a STUB server on a free port — list / read / reply / status / request —
// with the assertions §17 names: `reply` ONLY proposes (the stub sees one
// POST to /reply and nothing that sends), an INVISIBLE conversation and a
// NONEXISTENT one print the SAME uniform error, and `send-not-available` is
// said with its code and creates nothing. The stub's not-found text is the
// engine's own constant (src/channel-acl.js), so the CLI's words are pinned to
// the product's.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const { NOT_FOUND_TEXT } = require(path.join(REPO, 'src/channel-acl.js'));
const CLI = path.join(REPO, 'data/bin/vibespace-channels');
ok(fs.existsSync(CLI) && (fs.statSync(CLI).mode & 0o111) !== 0, 'data/bin/vibespace-channels exists and is executable');
ok(require(path.join(REPO, 'src/hosts.js')).HostManager.AGENT_TOOLS.includes('vibespace-channels'), 'it is in HostManager.AGENT_TOOLS (ships to remote hosts with the other tools)');
ok(fs.existsSync(path.join(REPO, 'docs/agent/channels-manual.md')) && /vibespace-docs channels|channels: 'channels-manual.md'/.test(fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8')), 'the manual exists and the docs route knows the topic');

// ── the stub ──────────────────────────────────────────────────────────────
const calls = [];
// R4: ACCESS and NOTIFICATION are two separate facts on a row (the pre-R4 `assigned`/`authority` beside them)
const VISIBLE = { key: 'fake-poll/ops', adapterId: 'fake-poll', adapter: 'fake-poll', id: 'ops', title: 'Ops room', kind: 'group', level: 'visible', tracked: true, unread: 2, lastAt: 1, canSend: true, sendWhy: null, sendAs: 'user', identityMarking: 'unknown', policy: 'review', access: { authority: 'draft', via: 'account', as: 'group' }, watched: null, assigned: true, authority: 'draft', awaiting: 0 };
const READONLY = { ...VISIBLE, key: 'fake-poll/announce', id: 'announce', title: 'Announcements', canSend: false, sendWhy: 'read-only-mailbox', sendAs: null, access: { authority: 'send', via: 'conversation', as: 'agent' }, watched: { notify: 'wake', mode: 'filtered', via: 'conversation' } };
const notFound = () => ({ ok: false, code: 'not-found', error: NOT_FOUND_TEXT });
// ── r7: THE REFUSED-SET CENSUS ────────────────────────────────────────────
// The CLI's `refresh` treats a closed set of codes as a REFUSAL (exit 4, "not
// refreshed: <the engine's sentence> (retry in N s)") and everything else as
// an error (exit 1). r6 found `account-changed` (409) and `stopped` (503)
// missing from it — an agent read "error" for "retry in a moment". The set is
// DERIVED here from the agent route's own STATUS table (src/agent-routes.js
// `chanAnswer`): every code it answers with a retry-able status (429 / 409 /
// 503) that the refresh path can produce must be in the CLI's list, and
// nothing else may be — a code in one and not the other is red. The two
// retry-able codes that belong to the REPLY verb alone (`send-not-available`,
// `rate-floor`) are named as the exception and each is PROVEN reply-only:
// the engine's request-set region never spells it, the reply path does.
const asrc = fs.readFileSync(path.join(REPO, 'src/agent-routes.js'), 'utf-8');
const chanAnswerSrc = asrc.slice(asrc.indexOf('const chanAnswer = (res, r) => {'), asrc.indexOf('};', asrc.indexOf('const chanAnswer = (res, r) => {')));
const statusExpr = /const status = ([^;]+);/.exec(chanAnswerSrc);
const ROUTE_STATUS = new Map();   // code → status
if (statusExpr) for (const part of statusExpr[1].split(' : ')) { const m = /^(.*)\?\s*(\d{3})\s*$/.exec(part.trim()); if (!m) continue; for (const c of m[1].matchAll(/code === '([^']+)'/g)) ROUTE_STATUS.set(c[1], Number(m[2])); }
const RETRYABLE = new Set([429, 409, 503]);
// R4 (B-6acc): `compose-not-available` belongs to the COMPOSE verb alone, the same way
const REPLY_ONLY = ['send-not-available', 'rate-floor', 'compose-not-available'];
const routeRetryable = [...ROUTE_STATUS].filter(([, st]) => RETRYABLE.has(st)).map(([c]) => c);
const expectedRefused = routeRetryable.filter((c) => !REPLY_ONLY.includes(c)).sort();
const cliSrc = fs.readFileSync(CLI, 'utf-8');
const cliSetM = /const REFRESH_REFUSED = \[([^\]]*)\]/.exec(cliSrc);
const cliRefused = cliSetM ? [...cliSetM[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : [];
ok(ROUTE_STATUS.size >= 8 && routeRetryable.length >= 7, `CENSUS setup: the agent route's STATUS table parsed — ${ROUTE_STATUS.size} codes, ${routeRetryable.length} retry-able (429/409/503): ${routeRetryable.join(', ')}`);
const esrc = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf-8');
const requestSetRegion = esrc.slice(esrc.indexOf('async function pass(adapterId'), esrc.indexOf('async function watch(adapterId'));
ok(REPLY_ONLY.every((c) => !requestSetRegion.includes(`'${c}'`)) && REPLY_ONLY.every((c) => asrc.includes(`'${c}'`) || esrc.includes(`'${c}'`)), `CENSUS: the retry-able codes excepted as reply / compose only (${REPLY_ONLY.join(', ')}) are never spelled in the engine's pass / request-set region and are spelled by the reply path`);
ok(cliRefused.length > 0 && JSON.stringify(cliRefused) === JSON.stringify(expectedRefused), `CENSUS: the CLI's REFRESH_REFUSED set == the route's retry-able refresh codes — [${cliRefused.join(', ')}]`, `cli [${cliRefused.join(', ')}] vs route [${expectedRefused.join(', ')}]`);
const words = fs.readFileSync(path.join(REPO, 'src/lib/channel-words.js'), 'utf-8');
ok(cliRefused.every((c) => words.includes(`case '${c}'`)), 'CENSUS: every refused code has its own words in channel-words.js (the panel says it in the device\'s language)', cliRefused.filter((c) => !words.includes(`case '${c}'`)).join(', '));
// one fixture per refused code: the route's status, the engine's own sentence (verbatim from the engine's refusal builders / the route), the wait where the engine gives one
const REFUSAL_FIXTURES = {
  'refresh-floor': { error: 'this conversation was refreshed 8 s ago (floor 20 s) — read it now, or refresh again in 12 s', retryAfterSec: 12 },
  'refresh-queue-full': { error: '180 refreshes of Ops mail are already waiting — read what is there now, or try again in a moment', retryAfterSec: 1 },
  'vendor-budget': { error: 'this account\'s vendor budget for this minute (60 requests/min) is spent — try again in 23 s', retryAfterSec: 23 },
  'backoff': { error: 'the vendor refused this account\'s last fetch (rate-limited) — it is retried in 27 s; read what is there now', retryAfterSec: 27 },
  'account-changed': { error: 'the account changed while the refresh waited (removed) — refresh again', retryAfterSec: 0 },
  'stopped': { error: 'the channels engine is stopping — refresh again after the restart', retryAfterSec: 0 },
};
for (const c of Object.keys(REFUSAL_FIXTURES)) REFUSAL_FIXTURES[c].status = ROUTE_STATUS.get(c) || 500;
ok(JSON.stringify(Object.keys(REFUSAL_FIXTURES).sort()) === JSON.stringify(expectedRefused), 'CENSUS: one fixture per refused code — a code added to the route without a fixture here is red', Object.keys(REFUSAL_FIXTURES).sort().join(', '));
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : null;
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, auth: req.headers.authorization || null });
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer vsst_test') return send(401, { error: 'unknown session token' });
    if (url.pathname === '/api/agent/channels/list') return send(200, { ok: true, conversations: [VISIBLE, READONLY] });
    if (url.pathname === '/api/agent/channels/read') {
      if (url.searchParams.get('conv') !== VISIBLE.key) return send(404, notFound());
      return send(200, { ok: true, conversation: { key: VISIBLE.key, adapterId: 'fake-poll', id: 'ops', title: 'Ops room', polledAt: 1000 }, records: [{ at: 1, author: { name: 'Ada' }, text: 'the deploy finished', vendorId: 'm1', attachments: [{ id: 'img_1', name: 'graph.png', mime: 'image/png', bytes: 1234 }] }] });
    }
    // 2026-09-26: the agent's refresh — floor / budget refusals are 429 with their number
    const rf = /^\/api\/agent\/channels\/([^/]+)\/([^/]+)\/refresh$/.exec(url.pathname);
    if (rf && req.method === 'POST') {
      const conv = `${decodeURIComponent(rf[1])}/${decodeURIComponent(rf[2])}`;
      if (conv === 'fake-poll/floored') return send(429, { ok: false, code: 'refresh-floor', error: 'this conversation was refreshed 8 s ago (floor 20 s) — read it now, or refresh again in 12 s', retryAfterSec: 12 });
      if (conv === 'fake-poll/broke') return send(429, { ok: false, code: 'vendor-budget', error: 'this account\'s vendor budget for this minute (60 requests/min) is spent — try again in 23 s', retryAfterSec: 23 });
      if (conv === 'fake-poll/slow') return send(200, { ok: true, pending: true, polledAt: 1000 });   // r7: the drain still running at the 15 s race — a started refresh, not a refusal
      const rc = /^fake-poll\/refused-(.+)$/.exec(conv);   // r7: `refused-<code>` answers that code with the ROUTE's status and the engine's sentence
      if (rc && REFUSAL_FIXTURES[rc[1]]) { const fx = REFUSAL_FIXTURES[rc[1]]; return send(fx.status, { ok: false, code: rc[1], error: fx.error, ...(fx.retryAfterSec ? { retryAfterSec: fx.retryAfterSec } : {}) }); }
      if (conv !== VISIBLE.key) return send(404, notFound());
      return send(200, { ok: true, appended: 3, polledAt: 2000 });
    }
    if (url.pathname === '/api/agent/channels/reply') {
      if (body.conv === READONLY.key) return send(409, { ok: false, code: 'send-not-available', error: 'sending is not available on this conversation (read-only-mailbox)', why: 'read-only-mailbox' });
      if (body.conv !== VISIBLE.key) return send(404, notFound());
      return send(200, { ok: true, proposal: { id: 'p-1', state: 'awaiting-approval', adapterId: 'fake-poll', convId: 'ops', policy: { mode: 'review', reasons: ['channel-policy', 'authority'] }, sendAs: 'user', identity: { marking: 'unknown', text: null } }, decision: { mode: 'review', reasons: ['channel-policy', 'authority'] } });
    }
    if (url.pathname === '/api/agent/channels/status') {
      const p = { id: 'p-1', state: 'sent', adapterId: 'fake-poll', convId: 'ops', title: 'Ops room', at: 1, updatedAt: 2, text: 'hello', policy: { mode: 'review', reasons: [] }, receipt: { status: 'edited', edited: true, sentAs: 'user', vendorMessageId: 'v-9', identityMarking: 'marked', identityMarkingText: 'The channel shows this message as sent by Example App' } };
      if (url.searchParams.get('id')) return url.searchParams.get('id') === 'p-1' ? send(200, { ok: true, proposal: p }) : send(404, { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' });
      // R4: what the agent was given — access (with its authority) and, separately, whether it is watched
      return send(200, { ok: true, proposals: [p], access: [
        { adapterId: 'lark', adapter: 'Lark', grain: 'account', via: 'group', as: { kind: 'group', id: 'tg-work', name: '工作' }, authority: 'draft', watched: null },
        { adapterId: 'gmail', adapter: 'Work mail', grain: 'account', via: 'agent', as: { kind: 'agent', id: 'me' }, authority: 'send', watched: { notify: 'wake', mode: 'filtered', digestMinutes: 30, dailyWakeCap: 40, receiptWake: false, wakes24h: 3 } },
      ] });
    }
    // R4 (B-6acc): compose — a NEW message; the stub answers the engine's shapes
    if (url.pathname === '/api/agent/channels/compose') {
      if (body.account === 'lark') return send(409, { ok: false, code: 'compose-not-available', error: 'Lark cannot start a new conversation from here — its adapter declares no compose; reply inside an existing conversation instead' });
      if (body.account !== 'gmail') return send(404, { ok: false, code: 'not-found', error: 'no such account (not found, or you have no access to the whole account) — `vibespace-channels status` shows your access' });
      return send(200, { ok: true, proposal: { id: 'p-9', state: 'awaiting-approval', adapterId: 'gmail', convId: null, compose: { to: String(body.to).split(','), cc: [], subject: body.subject }, policy: { mode: 'review', reasons: ['channel-policy'] }, sendAs: 'user', identity: { marking: 'marked', text: 'Mail sent through the Gmail API carries a Received: header naming gmailapi.google.com' } } });
    }
    if (url.pathname === '/api/agent/channels/search') {
      return send(200, { ok: true, truncated: false, results: url.searchParams.get('q') === 'deploy' ? [{ key: 'fake-poll/ops', title: 'Ops room', at: 1, author: { name: 'Ada' }, text: 'the deploy finished' }] : [] });
    }
    if (url.pathname === '/api/agent/channels/request') {
      if (body.conv !== 'fake-poll/requestable') return send(404, notFound());
      return send(200, { ok: true, request: { id: 'rq-1', status: 'open' } });
    }
    send(404, { error: 'no such route' });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${server.address().port}`;
// ASYNC on purpose: the stub lives in THIS process, and a spawnSync would
// block the very event loop that has to answer the CLI (measured: every
// verb hung to its timeout with the stub never seeing a request).
const run = (args, env = {}) => new Promise((resolve) => {
  execFile(process.execPath, [CLI, ...args], { encoding: 'utf-8', env: { PATH: process.env.PATH, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_test', ...env }, timeout: 15000 },
    (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: stdout || '', err: stderr || '' }));
});

// ── the verbs ─────────────────────────────────────────────────────────────
const noEnv = spawnSync(process.execPath, [CLI, 'list'], { encoding: 'utf-8', env: { PATH: process.env.PATH }, timeout: 15000 });
ok(noEnv.status === 2 && /not inside a VibeSpace session/.test(noEnv.stderr), 'outside a session it refuses with exit 2 (no API / token)');

const list = await run(['list']);
ok(list.code === 0 && /fake-poll\/ops/.test(list.out) && /Ops room/.test(list.out) && /user approves/.test(list.out) && /2 unread/.test(list.out) && /access via the whole account \(drafts\) · no notification \(read when you choose\)/.test(list.out), 'list prints the key, the title, the send/policy chip, unread, and ACCESS apart from NOTIFICATION (R4: access only — nothing wakes you)', list.out);
ok(/access \(may send\) · notifies you: wake on a filter/.test(list.out) && !/assigned to you/.test(list.out), '…a row with both says each (access may send · notifies you: wake on a filter); the retired "assigned to you" wording is gone', list.out);
ok(/no reply \(read-only-mailbox\)/.test(list.out), 'a read-only row says why no reply is possible');
ok(calls.filter((c) => c.path === '/api/agent/channels/list').length === 1 && calls[0].auth === 'Bearer vsst_test', 'one GET /list with the bearer (never argv)');

const read = await run(['read', 'fake-poll/ops', '--limit', '5']);
ok(read.code === 0 && /Ops room/.test(read.out) && /Ada: the deploy finished/.test(read.out) && calls.at(-1).query.conv === 'fake-poll/ops' && calls.at(-1).query.limit === '5', 'read prints the records and passes conv + limit', read.out);
ok(!/not tracked/.test(read.out) && /attachment: graph\.png \(image\/png\), 1234 bytes/.test(read.out), 'read names each attachment and never says "not tracked" (2026-09-26: every conversation is fetched)', read.out);

// ── 2026-09-26: the agent's refresh ─────────────────────────────────────
calls.length = 0;
const rfOk = await run(['refresh', 'fake-poll/ops']);
ok(rfOk.code === 0 && /refreshed fake-poll\/ops: 3 new message\(s\)/.test(rfOk.out) && calls.length === 1 && calls[0].method === 'POST' && calls[0].path === '/api/agent/channels/fake-poll/ops/refresh', 'refresh POSTs ONE request to the conversation\'s refresh route and says how many arrived', rfOk.out);
const rfFloor = await run(['refresh', 'fake-poll/floored']);
ok(rfFloor.code === 4 && /not refreshed: .*floor 20 s/.test(rfFloor.out) && /retry in 12 s/.test(rfFloor.out), 'a refresh under the floor is REFUSED BY NAME with the wait (exit 4 — a refusal, not an error)', rfFloor.out);
const rfBudget = await run(['refresh', 'fake-poll/broke']);
ok(rfBudget.code === 4 && /60 requests\/min/.test(rfBudget.out) && /retry in 23 s/.test(rfBudget.out), 'a spent vendor budget is refused naming the budget', rfBudget.out);
// r7: EVERY refused code through the CLI — exit 4, "not refreshed: <sentence>", the wait only where there is one; never exit 1
for (const [code, fx] of Object.entries(REFUSAL_FIXTURES)) {
  const r = await run(['refresh', `fake-poll/refused-${code}`]);
  const want = `not refreshed: ${fx.error}${fx.retryAfterSec ? ` (retry in ${fx.retryAfterSec} s)` : ''}`;
  ok(r.code === 4 && r.out.trim() === want && r.err === '', `${code} (${fx.status}) is a REFUSAL: exit 4, "${want.slice(0, 60)}…"`, JSON.stringify({ code: r.code, out: r.out, err: r.err }));
}
const rfPending = await run(['refresh', 'fake-poll/slow']);
ok(rfPending.code === 0 && /refresh started for fake-poll\/slow — still running; read it in a moment/.test(rfPending.out), 'a refresh still running at the route\'s 15 s race is STARTED, not refused: exit 0, "still running"', rfPending.out);
calls.length = 0;
const freshChanged = await run(['read', 'fake-poll/refused-account-changed', '--fresh']);
ok(freshChanged.code === 1 && /\(not refreshed: the account changed while the refresh waited/.test(freshChanged.out) && calls.map((c) => c.path).join() === '/api/agent/channels/fake-poll/refused-account-changed/refresh,/api/agent/channels/read', 'read --fresh on a refused refresh prints "(not refreshed: …)" and still READS (here: the stub\'s read answers not-found for that key, exit 1 from the read, never from the refusal)', JSON.stringify({ code: freshChanged.code, out: freshChanged.out, calls: calls.map((c) => c.path) }));
const rfHidden = await run(['refresh', 'fake-poll/hidden-to-me']);
ok(rfHidden.code === 1 && rfHidden.err.includes(NOT_FOUND_TEXT), 'refreshing an invisible conversation is the uniform not-found (reach first)');
calls.length = 0;
const fresh = await run(['read', 'fake-poll/ops', '--fresh']);
ok(fresh.code === 0 && /\(refreshed: 3 new\)/.test(fresh.out) && calls.map((c) => c.path).join() === '/api/agent/channels/fake-poll/ops/refresh,/api/agent/channels/read', 'read --fresh refreshes FIRST, then reads', fresh.out);

const hidden = await run(['read', 'fake-poll/hidden-to-me']);
const nowhere = await run(['read', 'fake-poll/does-not-exist']);
ok(hidden.code === 1 && hidden.err === nowhere.err && hidden.err.includes(NOT_FOUND_TEXT), 'UNIFORM ERROR: an invisible conversation and a nonexistent one print the SAME words (the product\'s own constant), exit 1', hidden.err);

calls.length = 0;
const reply = await run(['reply', 'fake-poll/ops', 'on it — the fix is deploying', '--why', 'alert al-1']);
ok(reply.code === 0 && /proposed — proposal p-1 is awaiting the user's approval/.test(reply.out) && /channel-policy, authority/.test(reply.out), 'reply PROPOSES and prints the verdict + id', reply.out);
ok(/UNVERIFIED sender identity/.test(reply.out), 'on an unknown-marking channel the reply notes the recipient identity is unverified');
ok(calls.length === 1 && calls[0].method === 'POST' && calls[0].path === '/api/agent/channels/reply' && calls[0].body.text === 'on it — the fix is deploying' && calls[0].body.why.label === 'alert al-1', 'exactly ONE request: POST /reply — nothing else (the CLI never sends, it proposes)', JSON.stringify(calls));

const ro = await run(['reply', 'fake-poll/announce', 'hello']);
ok(ro.code === 1 && /send-not-available/.test(ro.err) && /read-only-mailbox/.test(ro.err) && !/proposal/.test(ro.out), 'reply on a sendAs:[] conversation prints send-not-available with the reason and creates nothing', ro.err);

const status = await run(['status']);
ok(status.code === 0 && /p-1\s+SENT/.test(status.out) && /receipt: edited \(edited by the user\), sent as user, vendor id v-9/.test(status.out) && /the recipient sees: The channel shows this message as sent by Example App/.test(status.out), 'status prints each proposal with its receipt and WHO the other side saw', status.out);
const one = await run(['status', 'p-1']);
ok(one.code === 0 && /text: hello/.test(one.out), 'status <id> prints the full text');
const notMine = await run(['status', 'p-2']);
ok(notMine.code === 1 && /not found, or not yours/.test(notMine.err), "somebody else's proposal is not found");

// R4: status names each ACCESS with its authority, and whether a notification wakes the agent
ok(/access:\n  lark — the whole account \(Lark\) \(as a member of group 工作\)\n      authority: drafts \(the user approves\) · not notified — nothing wakes you; read when you choose/.test(status.out), 'status: access-only (the owner\'s case — group 工作, draft) says "not notified — nothing wakes you"', status.out);
ok(/gmail — the whole account \(Work mail\)\n      authority: may send directly where the policy allows · notified: woken per batch on a filter, at most 40\/day \(3 in 24 h\)/.test(status.out) && /compose <account>/.test(status.out), 'status: access + a watcher says both (may send · woken per batch on a filter, at most 40/day) and points at compose for a whole account', status.out);
// R4 (B-6acc): compose
calls.length = 0;
const cmp = await run(['compose', 'gmail', '--to', 'bob@example.com', '--subject', 'Weekly numbers', 'the numbers are in', '--why', 'the owner asked']);
ok(cmp.code === 0 && /proposed — proposal p-9 \(a NEW message to bob@example\.com\) is awaiting the user's approval \(channel-policy\)/.test(cmp.out) && /an application marker — Mail sent through the Gmail API/.test(cmp.out), 'compose PROPOSES a NEW message, prints the verdict and the recipient-identity note', cmp.out);
ok(calls.length === 1 && calls[0].path === '/api/agent/channels/compose' && calls[0].body.account === 'gmail' && calls[0].body.to === 'bob@example.com' && calls[0].body.subject === 'Weekly numbers' && calls[0].body.text === 'the numbers are in' && calls[0].body.why.label === 'the owner asked', 'exactly ONE request: POST /compose with account / to / subject / text / why', JSON.stringify(calls));
const cmpLark = await run(['compose', 'lark', '--to', 'x@example.com', '--subject', 's', 'hi']);
ok(cmpLark.code === 1 && /compose-not-available/.test(cmpLark.err) && /declares no compose/.test(cmpLark.err), 'compose on an account that cannot start a conversation prints compose-not-available BY NAME', cmpLark.err);
const cmpUse = await run(['compose', 'gmail', '--to', 'x@example.com', 'no subject']);
ok(cmpUse.code === 1 && /usage: vibespace-channels compose/.test(cmpUse.err), 'compose without a subject prints its usage and sends nothing');
const srch = await run(['search', 'deploy']);
ok(srch.code === 0 && /fake-poll\/ops — Ops room .* Ada: the deploy finished/.test(srch.out) && calls.at(-1).path === '/api/agent/channels/search' && calls.at(-1).query.q === 'deploy', 'search prints each hit you can see with its conversation', srch.out);
const srch0 = await run(['search', 'nothing']);
ok(srch0.code === 0 && /nothing you can see matches "nothing"/.test(srch0.out), 'a search with no visible hit says so');

const rq = await run(['request', 'fake-poll/requestable', 'I answer the alerts here']);
ok(rq.code === 0 && /requested/.test(rq.out) && /rq-1/.test(rq.out) && /grants YOU visibility on this ONE conversation/.test(rq.out), 'request files and explains what approval grants', rq.out);
const rqHidden = await run(['request', 'fake-poll/hidden', 'why']);
ok(rqHidden.code === 1 && rqHidden.err.includes(NOT_FOUND_TEXT), 'a request on a hidden conversation is the uniform not-found (no oracle)');

const usage = await run([]);
ok(usage.code === 0 && /vibespace-channels reply <conv>/.test(usage.out) && /PROPOSAL/.test(usage.out), 'no verb prints the usage and says a reply is a proposal');

server.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
