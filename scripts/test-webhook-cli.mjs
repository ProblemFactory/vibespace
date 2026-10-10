#!/usr/bin/env node
// test-webhook-cli — THE AGENT'S WEBHOOK WORDS (lane webhook-l3-cli-pair; docs/design-webhook.zh.md §7 / §9). The REAL
// data/bin/vibespace-channels against a STUB server (the test-msg-cli-groups shape): every verb's request and how its
// answer is printed. `reply webhook/<path> "…" --to <record id>` (the server derives the caller from the record);
// no --to + several callers ⇒ the `ambiguous-caller` refusal as `c-… "name"` rows + the two ways on, exit 1; `compose
// --caller <id>[,<id>]|all` ⇒ one line per proposal, delivery none refused by name; `read` prints a `callers:` header
// before the records. CENSUS: the verbs are a closed set and none makes a path or mints a token (CONTROL: a planted
// `register` verb ⇒ RED); every answer the CLI reads passes the answer door that withholds `vswh_` (a token planted in every
// answer never reaches stdout / stderr; CONTROLS: a copy with a planted raw write ⇒ the census RED, a copy whose door does
// not withhold ⇒ the runtime leg RED). Run: node scripts/test-webhook-cli.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(repo, 'data/bin/vibespace-channels');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); } };
const TOKEN = 'vswh_' + '7'.repeat(48);
const CODE = 'vswp_' + 'eyJ2IjoxfQ' + 'Q'.repeat(30);   // int248 r2 (verify r1 #1): a pairing code carries a token — withheld the same way
let next = null;           // (req, body) → [status, json]
const seen = [];
const srv = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { let j = null; try { j = b ? JSON.parse(b) : null; } catch { } seen.push({ method: req.method, url: req.url, body: j }); const [st, out] = next ? next(req, j) : [404, { error: 'no stub' }]; res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${srv.address().port}`;
const run = (args, cli = CLI) => new Promise((resolve) => execFile(process.execPath, [cli, ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_cli' }, timeout: 15000 }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr })));
const CALLERS = [{ id: 'c-1a2b3c4d', name: 'deploy-bot', delivery: 'poll' }, { id: 'c-5e6f7a8b', name: 'monitor', delivery: 'reply-url' }];
const tmp = scratch('webhook-cli');
fs.mkdirSync(tmp, { recursive: true });
try {
  console.log('§1 reply');
  seen.length = 0;
  next = () => [200, { ok: true, proposal: { id: 'p1', state: 'sent', sendAs: 'user', result: { sentAs: 'user' } } }];
  const r1 = await run(['reply', 'webhook/ci', 'rolling back', '--to', 'c-1a2b3c4d:prod-1']);
  ok(r1.code === 0 && seen[0].url === '/api/agent/channels/reply' && seen[0].body.conv === 'webhook/ci' && seen[0].body.replyTo === 'c-1a2b3c4d:prod-1' && /sent directly/.test(r1.stdout), 'reply webhook/ci "…" --to <record id> asks the server with that record (the caller follows it)', r1);
  seen.length = 0;
  next = () => [200, { ok: true, proposal: { id: 'p2', state: 'sent', sendAs: 'user' } }];
  const r2 = await run(['reply', 'webhook/ci', 'hello']);
  ok(r2.code === 0 && seen[0].body.replyTo === undefined && /sent directly/.test(r2.stdout), 'no --to on a one-caller path: the request names no record — the one caller gets it');
  next = () => [400, { ok: false, code: 'bad-proposal', why: 'ambiguous-caller', error: 'this path has 2 callers — reply to one of their records with --to <record id>, or compose --caller <id>|all — nothing was created', callers: CALLERS }];
  const r3 = await run(['reply', 'webhook/ci', 'hello']);
  ok(r3.code === 1 && r3.stderr.includes('  c-1a2b3c4d "deploy-bot" · delivery poll') && r3.stderr.includes('  c-5e6f7a8b "monitor" · delivery reply-url') && /two ways on: .*reply webhook\/ci "…" --to <record id>/.test(r3.stderr) && r3.stderr.includes('compose webhook/ci --caller <id>[,<id>]|all') && !r3.stdout.includes('sent'), 'no --to on a path of several callers ⇒ ambiguous-caller: the error, one `c-… "name"` row each, the two ways on — exit 1, nothing sent', r3);
  console.log('§2 compose --caller');
  seen.length = 0;
  next = () => [200, { ok: true, proposals: [{ recipient: 'c-1a2b3c4d', ok: true, proposal: { id: 'p3', state: 'sent' } }, { recipient: 'c-5e6f7a8b', ok: true, proposal: { id: 'p4', state: 'awaiting-approval', policy: { reasons: ['review'] } } }], skipped: [] }];
  const c1 = await run(['compose', 'webhook/ci', '--caller', 'c-1a2b3c4d,c-5e6f7a8b', 'deploy paused']);
  ok(c1.code === 0 && seen[0].url === '/api/agent/channels/compose' && seen[0].body.conv === 'webhook/ci' && seen[0].body.caller === 'c-1a2b3c4d,c-5e6f7a8b' && seen[0].body.text === 'deploy paused' && /proposal p3 to c-1a2b3c4d/.test(c1.stdout) && /proposal p4 to c-5e6f7a8b is awaiting/.test(c1.stdout), 'compose webhook/ci --caller <id>,<id> "…" ⇒ ONE proposal per caller, one line each', c1);
  seen.length = 0;
  next = () => [200, { ok: true, proposals: [{ recipient: 'c-5e6f7a8b', ok: true, proposal: { id: 'p5', state: 'sent' } }], skipped: ['c-1a2b3c4d'] }];
  const c2 = await run(['compose', 'webhook/ci', '--caller', 'all', 'maintenance at 22:00']);
  ok(c2.code === 0 && seen[0].body.caller === 'all' && /not sent to c-1a2b3c4d — delivery none/.test(c2.stdout), '--caller all ⇒ every caller that takes replies; a delivery-none one is said as not sent');
  next = () => [409, { ok: false, code: 'send-not-available', why: 'delivery-none', error: 'deploy-bot (c-1a2b3c4d) takes no replies (its delivery is none)', callers: CALLERS }];
  const c3 = await run(['compose', 'webhook/ci', '--caller', 'c-1a2b3c4d', 'x']);
  ok(c3.code === 1 && /deploy-bot \(c-1a2b3c4d\) takes no replies \(its delivery is none\) \[send-not-available\]/.test(c3.stderr), '--caller naming a delivery-none caller ⇒ refused by name, exit 1');
  const c4 = await run(['compose', 'webhook/ci', '--caller']);
  ok(c4.code === 1 && /usage: vibespace-channels compose webhook\/<path> --caller/.test(c4.stderr), '--caller without ids / text ⇒ the usage line');
  console.log('§3 read');
  next = () => [200, { ok: true, conversation: { key: 'webhook/ci', title: 'CI' }, callers: [{ id: 'c-1a2b3c4d', name: 'deploy-bot', kind: 'system', delivery: 'poll', lastCallAt: Date.UTC(2026, 9, 10, 9, 0), generation: 1 }, { id: 'c-5e6f7a8b', name: 'Hub B', kind: 'peer', delivery: 'reply-url', lastCallAt: null, generation: 2 }], records: [{ at: Date.UTC(2026, 9, 10, 9, 0), author: { name: 'deploy-bot' }, text: 'PROD deploy failed', vendorId: 'c-1a2b3c4d:prod-1' }] }];
  const rd = await run(['read', 'webhook/ci']);
  const L = rd.stdout.split('\n');
  const hi = L.findIndex((l) => l === 'callers: 2'), ri = L.findIndex((l) => l.includes('PROD deploy failed'));
  ok(rd.code === 0 && hi > 0 && ri > hi && L[hi + 1] === '  c-1a2b3c4d "deploy-bot" · system · delivery poll · last call 2026-10-10 09:00Z · generation 1' && L[hi + 2] === '  c-5e6f7a8b "Hub B" · peer · delivery reply-url · last call never · generation 2', 'read webhook/ci prints `callers:` (id, name, kind, delivery, last call, generation) BEFORE the records', rd.stdout);
  console.log('§4 census: no verb makes a path or mints a token');
  const src = fs.readFileSync(CLI, 'utf-8');
  const ALLOWED = ['list', 'refresh', 'read', 'attachment', 'reply', 'react', 'unreact', 'withdraw', 'status', 'compose', 'search', 'watches', 'watch', 'unwatch', 'api', 'request'];
  const census = (s) => { const verbs = [...new Set([...s.matchAll(/verb === '([a-z-]+)'/g)].map((m) => m[1]))]; return { verbs, extra: verbs.filter((v) => !ALLOWED.includes(v)), mint: verbs.filter((v) => /regist|mint|token|rotate|revoke|pair|path|caller|join/.test(v)), owner: /\/api\/channels\/webhook\//.test(s) }; };
  const cs = census(src);
  ok(!cs.extra.length && !cs.mint.length && !cs.owner && cs.verbs.length === ALLOWED.length, `the verbs are the closed set (${cs.verbs.length}); none registers / mints / pairs; no owner webhook route in the CLI`, cs);
  const planted = src.replace("  if (verb === 'search') {", "  if (verb === 'register') { await call('POST', '/api/channels/webhook/paths/ci/callers', { name: args[1] }); return; }\n  if (verb === 'search') {");
  const cp = census(planted);
  ok(planted !== src && cp.extra.includes('register') && cp.mint.includes('register') && cp.owner, 'CONTROL: a planted `register` verb ⇒ the census is RED');
  console.log('§5 the CLI never prints a vswh_ token');
  const DOOR = "async function answerOf(res) { return JSON.parse(String(await res.text()).replace(/(vswh|vswp)_[A-Za-z0-9_-]*/g, '$1_[withheld]')); }";   // int248 r2 (verify r1 #1): a pairing code too
  const rawWrites = (s) => (s.match(/process\.(stdout|stderr)\.write\(|console\.(info|warn|debug|trace|dir|table)\(/g) || []).length;
  ok(src.split('\n').filter((l) => l === DOOR).length === 1 && !/\.json\(\)/.test(src) && (src.match(/await answerOf\(res\)/g) || []).length === 6 && rawWrites(src) === 0, 'THE ANSWER DOOR: one line, verbatim; every server answer (6 reads) is parsed through it, none by res.json(); no raw stdout / stderr write');
  ok(rawWrites(src.replace(DOOR, DOOR + "\nprocess.stdout.write('vswh_' + 'x');")) === 1 && /\.json\(\)/.test(src.replace('await answerOf(res)', 'await res.json()')), 'CONTROLS: a planted raw write / one answer read past the door ⇒ the census is RED');
  const leakyAnswers = (j) => { const s = JSON.stringify(j).replace(/"__T__"/g, JSON.stringify(TOKEN + ' ' + CODE)); return JSON.parse(s); };
  const plant = [
    [['read', 'webhook/ci'], () => [200, leakyAnswers({ ok: true, conversation: { key: 'webhook/ci', title: '__T__' }, callers: [{ id: 'c-1a2b3c4d', name: '__T__', kind: 'system', delivery: 'poll', generation: 1 }], records: [{ at: 1, author: { name: '__T__' }, text: '__T__', vendorId: '__T__' }] })]],
    [['reply', 'webhook/ci', 'x'], () => [400, leakyAnswers({ error: '__T__', code: 'bad-proposal', why: 'ambiguous-caller', callers: [{ id: '__T__', name: '__T__' }] })]],
    [['compose', 'webhook/ci', '--caller', 'all', 'x'], () => [200, leakyAnswers({ ok: true, proposals: [{ recipient: '__T__', ok: false, error: '__T__' }], skipped: ['__T__'] })]],
  ];
  const runAll = async (cli) => { let out = ''; for (const [args, ans] of plant) { next = ans; const r = await run(args, cli); out += r.stdout + r.stderr; } return out; };
  const outReal = await runAll(CLI);
  ok(!outReal.includes(TOKEN) && !outReal.includes(CODE) && outReal.includes('vswh_[withheld]') && outReal.includes('vswp_[withheld]'), 'a vswh_ token AND a vswp_ pairing code planted in EVERY answer field (title, names, text, ids, errors) never reaches stdout / stderr — withheld at the door', outReal.slice(0, 400));
  const noDoor = path.join(tmp, 'vibespace-channels-nodoor');
  fs.writeFileSync(noDoor, src.replace(DOOR, DOOR.replace(".replace(/(vswh|vswp)_[A-Za-z0-9_-]*/g, '$1_[withheld]')", '')));
  const outNoDoor = await runAll(noDoor);
  ok(outNoDoor.includes(TOKEN) && outNoDoor.includes(CODE), 'CONTROL: the same CLI whose door does not withhold prints the planted token (RED)');
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
finally { srv.close(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
