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
const VISIBLE = { key: 'fake-poll/ops', adapterId: 'fake-poll', adapter: 'fake-poll', id: 'ops', title: 'Ops room', kind: 'group', level: 'visible', tracked: true, unread: 2, lastAt: 1, canSend: true, sendWhy: null, sendAs: 'user', identityMarking: 'unknown', policy: 'review', assigned: true, authority: 'draft', awaiting: 0 };
const READONLY = { ...VISIBLE, key: 'fake-poll/announce', id: 'announce', title: 'Announcements', canSend: false, sendWhy: 'read-only-mailbox', sendAs: null };
const notFound = () => ({ ok: false, code: 'not-found', error: NOT_FOUND_TEXT });
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
      return send(200, { ok: true, conversation: { key: VISIBLE.key, adapterId: 'fake-poll', id: 'ops', title: 'Ops room', tracked: true }, records: [{ at: 1, author: { name: 'Ada' }, text: 'the deploy finished', vendorId: 'm1' }] });
    }
    if (url.pathname === '/api/agent/channels/reply') {
      if (body.conv === READONLY.key) return send(409, { ok: false, code: 'send-not-available', error: 'sending is not available on this conversation (read-only-mailbox)', why: 'read-only-mailbox' });
      if (body.conv !== VISIBLE.key) return send(404, notFound());
      return send(200, { ok: true, proposal: { id: 'p-1', state: 'awaiting-approval', adapterId: 'fake-poll', convId: 'ops', policy: { mode: 'review', reasons: ['channel-policy', 'authority'] }, sendAs: 'user', identity: { marking: 'unknown', text: null } }, decision: { mode: 'review', reasons: ['channel-policy', 'authority'] } });
    }
    if (url.pathname === '/api/agent/channels/status') {
      const p = { id: 'p-1', state: 'sent', adapterId: 'fake-poll', convId: 'ops', title: 'Ops room', at: 1, updatedAt: 2, text: 'hello', policy: { mode: 'review', reasons: [] }, receipt: { status: 'edited', edited: true, sentAs: 'user', vendorMessageId: 'v-9', identityMarking: 'marked', identityMarkingText: 'The channel shows this message as sent by Example App' } };
      if (url.searchParams.get('id')) return url.searchParams.get('id') === 'p-1' ? send(200, { ok: true, proposal: p }) : send(404, { ok: false, code: 'not-found', error: 'no such proposal (not found, or not yours)' });
      return send(200, { ok: true, proposals: [p] });
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
ok(list.code === 0 && /fake-poll\/ops/.test(list.out) && /Ops room/.test(list.out) && /user approves/.test(list.out) && /2 unread/.test(list.out) && /assigned to you \(draft\)/.test(list.out), 'list prints the key, the title, the send/policy chip, unread and the assignment', list.out);
ok(/no reply \(read-only-mailbox\)/.test(list.out), 'a read-only row says why no reply is possible');
ok(calls.filter((c) => c.path === '/api/agent/channels/list').length === 1 && calls[0].auth === 'Bearer vsst_test', 'one GET /list with the bearer (never argv)');

const read = await run(['read', 'fake-poll/ops', '--limit', '5']);
ok(read.code === 0 && /Ops room/.test(read.out) && /Ada: the deploy finished/.test(read.out) && calls.at(-1).query.conv === 'fake-poll/ops' && calls.at(-1).query.limit === '5', 'read prints the records and passes conv + limit', read.out);

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

const rq = await run(['request', 'fake-poll/requestable', 'I answer the alerts here']);
ok(rq.code === 0 && /requested/.test(rq.out) && /rq-1/.test(rq.out) && /grants YOU visibility on this ONE conversation/.test(rq.out), 'request files and explains what approval grants', rq.out);
const rqHidden = await run(['request', 'fake-poll/hidden', 'why']);
ok(rqHidden.code === 1 && rqHidden.err.includes(NOT_FOUND_TEXT), 'a request on a hidden conversation is the uniform not-found (no oracle)');

const usage = await run([]);
ok(usage.code === 0 && /vibespace-channels reply <conv>/.test(usage.out) && /PROPOSAL/.test(usage.out), 'no verb prints the usage and says a reply is a proposal');

server.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
