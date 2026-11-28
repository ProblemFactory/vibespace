#!/usr/bin/env node
// HARNESS HONESTY (2.369.58) — the four production defects the 2026-09-07
// harness survey found, each with its own reproduction:
//
//  ① codex PERSONALITY. The wrapper hardcoded `personality:'pragmatic'` into
//     thread/start AND turn/start, silently overriding whatever the user's own
//     ~/.codex/config.toml said. Now: the value comes from the per-session
//     response-style slot, DEFAULT = unset = the key is not sent at all, and a
//     running session can be re-styled through `thread/settings/update`
//     (gated on backend-caps `responseStyle.live`, never on a backend id).
//     The accepted values are codex's own Personality enum, read out of
//     `codex app-server generate-json-schema --experimental` — never memory.
//
//  ② SERVER-REQUEST SHAPES. `respondToServerRequest` matched exactly ONE
//     method by name and answered everything else `{decision: …}` — a result
//     the app-server cannot deserialize for four of the eleven ServerRequest
//     methods (permissions wants a GRANT, requestUserInput wants bare
//     `answers`, elicitation wants an `action`, the v1 pair speaks a different
//     enum), i.e. a hung turn nobody could explain. Now: one explicit branch
//     per method, MCP elicitation rendered as the existing question-card
//     family, and anything we cannot answer refused with a JSON-RPC error +
//     a visible system line.
//
//  ③ ACP UNKNOWN UPDATE. `default: return;` dropped unknown sessionUpdate
//     kinds silently — the invisible-record class, twice convicted (claude's
//     `cli-unknown-system-subtype`, codex's `codex-unknown-record`). Now: a
//     once-per-kind telemetry breadcrumb + one console line.
//
//  ④ LIVE/ROLLOUT TWIN. `imageGeneration` and `sleep` had no branch in the
//     wrapper's item chain at all: a generated image was invisible while
//     streaming and a 20-minute sleep looked like a hang. THREE producers feed
//     the same fact (the live wrapper, the rollout parser, codex-thread-read)
//     and they must land on ONE normalized card — this suite pins all three
//     against each other, shape-equal.
//
// Parts 1-4 are node; part 5 is a headless-chrome leg (SKIPs without chrome)
// that proves the image card actually draws from a LIVE item. Part 0, the version marker, the docs legs and the source pins of
// Parts 3 / 4 live in the fast scripts/test-harness-honesty-pins.mjs (lane lg-text-legs-2, B-94d3).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { freePorts, ONBOARDED_SOURCE, withoutVendorKeys, vncEnv, CHROME_STORE, CHROME_QUIET, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
const { threadToRecords } = require(path.join(REPO, 'src/codex-thread-read.js'));
const { AcpMessageManager } = require(path.join(REPO, 'src/acp-message-manager.js'));

// ═════════ the REAL schema, not a hand-written expectation ═════════
// r2 review: the first cut of this suite asserted, byte for byte, a reply that
// the app-server CANNOT deserialize (`execpolicy_amendment` is `string[]`; the
// code sent `[{kind}]`) — a green gate certifying the exact hung-turn class the
// change exists to kill. The cure is to stop hand-writing the expectation:
// every reply is validated against codex's OWN dumped result schema
// (scripts/fixtures/codex-server-request-responses.json, verbatim from
// `codex app-server generate-json-schema --experimental`).
const RESP_SCHEMAS = JSON.parse(read('scripts/fixtures/codex-server-request-responses.json'));
/** draft-07 SUBSET validator — exactly the keywords those dumps use ($ref /
 *  type / enum / const / allOf / anyOf / oneOf / properties / required /
 *  additionalProperties / items). Cross-checked against python jsonschema on a
 *  31-case battery (both directions) while it was written. Returns error
 *  strings; empty = valid. */
function schemaErrors(schema, value, root = schema, at = '$', errs = []) {
  if (schema === true || schema === undefined || schema === null) return errs;
  if (schema === false) { errs.push(`${at}: schema is false`); return errs; }
  if (schema.$ref) {
    const m = /^#\/definitions\/(.+)$/.exec(schema.$ref);
    const target = m ? (root.definitions || {})[m[1]] : null;
    if (!target) { errs.push(`${at}: unresolvable $ref ${schema.$ref}`); return errs; }
    return schemaErrors(target, value, root, at, errs);
  }
  const kind = Array.isArray(value) ? 'array' : value === null ? 'null'
    : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value;
  if (schema.type !== undefined) {
    const want = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!want.some((t) => t === kind || (t === 'number' && kind === 'integer'))) {
      errs.push(`${at}: type ${kind} not in ${JSON.stringify(want)}`);
      return errs;
    }
  }
  if (schema.enum !== undefined && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errs.push(`${at}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) {
    errs.push(`${at}: ${JSON.stringify(value)} !== const`);
  }
  for (const sub of (schema.allOf || [])) schemaErrors(sub, value, root, at, errs);
  if (schema.anyOf && !schema.anyOf.some((sub) => schemaErrors(sub, value, root, at, []).length === 0)) {
    errs.push(`${at}: matched none of anyOf`);
  }
  if (schema.oneOf) {
    const per = schema.oneOf.map((sub) => schemaErrors(sub, value, root, at, []));
    const n = per.filter((e) => e.length === 0).length;
    // A failing oneOf must NAME the field that broke (the whole point here is
    // that `execpolicy_amendment` wants strings) — "matched 0 of oneOf" alone
    // sends the next reader back to the schema by hand.
    if (n === 0) errs.push(`${at}: matched none of oneOf — ${per.map((e, i) => `#${i}: ${e.join('; ')}`).join(' | ').slice(0, 500)}`);
    else if (n > 1) errs.push(`${at}: matched ${n} of oneOf (must be exactly 1)`);
  }
  if (kind === 'object') {
    for (const req of (schema.required || [])) {
      if (!Object.prototype.hasOwnProperty.call(value, req)) errs.push(`${at}: missing required "${req}"`);
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(props, k)) schemaErrors(props[k], v, root, `${at}.${k}`, errs);
      else if (schema.additionalProperties === false) errs.push(`${at}: additional property "${k}" not allowed`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') schemaErrors(schema.additionalProperties, v, root, `${at}.${k}`, errs);
    }
  }
  if (kind === 'array' && schema.items) value.forEach((v, i) => schemaErrors(schema.items, v, root, `${at}[${i}]`, errs));
  return errs;
}

// ═════════ Part 0 — the caps row is the ONE vocabulary ═════════ (its caps-table legs and source pins over src/backend-caps.js, src/ws-create.js,
// src/ws-handler.js, src/lib/chat-status-bar.js, src/lib/chat-view.js, src/lib/agent-meta.js, src/lib/session-props.js, src/server/wrapper-files.js,
// src/session-schema.js, src/server/boot-restore.js: MOVED to the fast scripts/test-harness-honesty-pins.mjs — lane lg-text-legs-2, B-94d3: a leg that reads only source text runs in every lane's gate)

// ═════════ Part 1 + 2 — the REAL wrapper against a stub app-server ═════════
console.log('— wrapper vs a stub app-server (personality + every ServerRequest shape)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-honesty-'));
const SID = 'sess-h-1700000000009';
const buf = path.join(dir, SID + '.buf'), metaFile = path.join(dir, SID + '.json'), rpcLog = path.join(dir, 'rpc.jsonl'), repliesLog = path.join(dir, 'replies.jsonl');
// The stub logs every REQUEST we send it AND every REPLY we send to ITS
// requests — the reply shapes are the whole point of ②.
// EVERY ServerRequest method in one table — lifted OUT of the stub source so
// the schema-validation pass below can map a reply id back to its METHOD from
// the same literal the stub sends (r2: a hand-copied map is the twin that
// drifts). 900-906/912-914 are human-answerable, 907 is auto-answered and
// 908-911 must be refused.
const SERVER_REQS = [
  { id: 900, method: 'item/commandExecution/requestApproval', params: { threadId: 'th-h', turnId: 't1', itemId: 'i900', command: ['rm', '-rf', '/tmp/x'], cwd: '/tmp', proposedExecpolicyAmendment: ['allow rm'] } },
  { id: 901, method: 'item/fileChange/requestApproval', params: { threadId: 'th-h', turnId: 't1', itemId: 'i901', reason: 'edit', changes: {} } },
  { id: 902, method: 'item/permissions/requestApproval', params: { threadId: 'th-h', turnId: 't1', itemId: 'i902', cwd: '/tmp', startedAtMs: 1, permissions: { fileSystem: { read: ['/tmp'] }, network: { enabled: true } } } },
  { id: 903, method: 'item/tool/requestUserInput', params: { threadId: 'th-h', turnId: 't1', itemId: 'i903', isBlocking: true, questions: [{ id: 'q1', header: 'Pick', question: 'Which layout?' , options: [{ label: 'grid', description: '' }, { label: 'list', description: '' }] }] } },
  { id: 904, method: 'mcpServer/elicitation/request', params: { threadId: 'th-h', serverName: 'weather', mode: 'form', message: 'Where are you?', requestedSchema: { type: 'object', required: ['city'], properties: { city: { type: 'string', title: 'City' }, metric: { type: 'boolean', title: 'Use metric' } } } } },
  { id: 905, method: 'applyPatchApproval', params: { conversation_id: 'c', call_id: 'i905', file_changes: {} } },
  { id: 906, method: 'execCommandApproval', params: { conversation_id: 'c', call_id: 'i906', command: ['ls'], cwd: '/tmp' } },
  { id: 912, method: 'mcpServer/elicitation/request', params: { threadId: 'th-h', serverName: 'auth', mode: 'url', elicitationId: 'e1', message: 'Finish signing in', url: 'https://example.org/login' } },
  { id: 913, method: 'item/permissions/requestApproval', params: { threadId: 'th-h', turnId: 't1', itemId: 'i913', cwd: '/tmp', startedAtMs: 1, permissions: { fileSystem: { write: ['/etc'] } } } },
  // a SECOND command approval — answered below with a frame the REAL ADAPTER
  // built, i.e. the only shape production can actually produce (r2 review).
  { id: 914, method: 'item/commandExecution/requestApproval', params: { threadId: 'th-h', turnId: 't1', itemId: 'i914', command: 'rm -rf /tmp/y', cwd: '/tmp', startedAtMs: 1, proposedExecpolicyAmendment: ['allow rm'] } },
  // answered WITHOUT a human: a fact we simply know
  { id: 907, method: 'currentTime/read', params: {} },
  // refused: values only a client that OWNS them can produce
  { id: 908, method: 'attestation/generate', params: {} },
  { id: 909, method: 'item/tool/call', params: { toolName: 'x' } },
  { id: 910, method: 'account/chatgptAuthTokens/refresh', params: {} },
  { id: 911, method: 'totally/unknown/method', params: {} },
];
const STUB = `
process.stdin.on('end', () => process.exit(0));   // as the real app-server: its wrapper gone (stdin closed), it ends — the wrapper hands it nothing on a signal, by design
const fs = require('fs');
let b = ''; let turns = 0;
const send = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const REQS = ${JSON.stringify(SERVER_REQS)};
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  b += d; let i;
  while ((i = b.indexOf('\\n')) !== -1) {
    const line = b.slice(0, i); b = b.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.method) { fs.appendFileSync(${JSON.stringify(rpcLog)}, line + '\\n'); }
    else { fs.appendFileSync(${JSON.stringify(repliesLog)}, line + '\\n'); continue; }   // a REPLY to one of OUR requests
    if (m.method === 'thread/start') { send({ id: m.id, result: { thread: { id: 'th-h' } } }); continue; }
    if (m.method === 'turn/start') {
      turns++; const tid = 'turn-' + turns;
      send({ id: m.id, result: { turn: { id: tid } } });
      send({ method: 'turn/started', params: { turn: { id: tid } } });
      if (turns === 1) {
        // ④ the LIVE media/sleep items
        send({ method: 'item/started', params: { threadId: 'th-h', turnId: tid, item: { type: 'imageGeneration', id: 'exec-img1', status: 'inProgress', result: '' } } });
        send({ method: 'item/completed', params: { threadId: 'th-h', turnId: tid, item: { type: 'imageGeneration', id: 'exec-img1', status: 'completed', revisedPrompt: 'a red van', result: 'BASE64PAYLOAD'.repeat(500), transparentBackground: false, failure: null, savedPath: '/tmp/gen/exec-img1.png' } } });
        send({ method: 'item/started', params: { threadId: 'th-h', turnId: tid, item: { type: 'sleep', id: 'call_s1', durationMs: 30000 } } });
        send({ method: 'item/completed', params: { threadId: 'th-h', turnId: tid, item: { type: 'sleep', id: 'call_s1', durationMs: 30000 } } });
        // ② every ServerRequest method, in one burst
        for (const r of REQS) send(r);
      }
      continue;
    }
    if (m.method === 'turn/interrupt') {
      send({ id: m.id, result: {} });
      send({ method: 'turn/completed', params: { turn: { id: 'turn-' + turns }, status: 'interrupted' } });
      continue;
    }
    send({ id: m.id, result: {} });
  }
});
setInterval(() => {}, 1e3);
`;
const spawnWrapper = (env) => spawn(process.execPath, [path.join(REPO, 'data/bin/codex-chat-wrapper.js'), buf, metaFile, process.execPath, '-e', STUB], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, CODEX_WEBUI_CWD: dir, VIBESPACE_API: '', VIBESPACE_SESSION_TOKEN: '', VIBESPACE_SKIP_AGENT_HOOKS: '1', ...env },
});
let w = spawnWrapper({});
let out = ''; w.stdout.on('data', (d) => { out += d; });
w.stderr.on('data', () => {});
const jsonl = (fp) => { try { return fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const rpc = () => jsonl(rpcLog);
const replies = () => jsonl(repliesLog);
const events = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const readMeta = () => { try { return JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { return null; } };
const waitFor = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(80); } return pred(); };
const sendLine = (o) => w.stdin.write(JSON.stringify(o) + '\n');
// A SUITE ENDS WHAT IT STARTS (主开发 r1108 — the integrator's watcher found three of this suite's stubs alive after it ended): a wrapper
// is stopped and WAITED for, it and its stub app-server, by identity (pid + its start time) — bounded; anything still alive is said by
// name, ended, and red
const procId = (pid) => { try { const f = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); const x = f.slice(f.lastIndexOf(')') + 2).split(' '); return x[0] === 'Z' ? null : x[19]; } catch { return null; } };
const endWrapper = async (label) => {
  await waitFor(() => Number.isInteger(readMeta()?.childPid), 3000);   // the sidecar names the stub ≤ 200 ms after its spawn
  const kids = [[w.pid, 'its codex-chat-wrapper'], [readMeta()?.childPid, 'its stub app-server (node -e STUB)']]
    .filter(([p]) => Number.isInteger(p) && p > 0).map(([p, name]) => ({ p, name, id: procId(p) })).filter((k) => k.id);
  try { w.kill('SIGTERM'); } catch { }
  const alive = () => kids.filter((k) => procId(k.p) === k.id);
  await waitFor(() => alive().length === 0, 5000);
  const left = alive();
  for (const k of left) { try { process.kill(k.p, 'SIGKILL'); } catch { } }
  ok(left.length === 0, `${label}: it and its stub app-server ended within 5 s of its stop (${kids.length} process(es) held by identity)`, left.map((k) => `${k.name} pid ${k.p} still alive — ended by SIGKILL`).join('; '));
};

ok(verdictOf(await waitFor(() => readMeta()?.threadId === 'th-h')), 'wrapper handshake against the stub app-server');

// ① NO personality key by default
{
  const ts = rpc().find((m) => m.method === 'thread/start');
  ok(gateOf(ts) && !('personality' in ts.params), 'thread/start carries NO personality key when the user chose nothing (the config.toml choice stands)', JSON.stringify(ts?.params));
}
sendLine({ type: 'chat-input', text: 'go', msgId: 'm1' });
ok(verdictOf(await waitFor(() => rpc().some((m) => m.method === 'turn/start'))), 'a turn starts');
{
  const t = rpc().find((m) => m.method === 'turn/start');
  ok(gateOf(t) && !('personality' in t.params), 'turn/start carries NO personality key either', JSON.stringify(Object.keys(t?.params || {})));
}
ok(readMeta()?.caps?.responseStyle === true, 'the wrapper adverts caps.responseStyle in the sidecar IT writes (the 2.361.1/2.364.1 skew rule)');
ok(readMeta()?.personality === '', 'the sidecar reports the EFFECTIVE style — empty = the agent decides', JSON.stringify(readMeta()?.personality));

// ① a LIVE change → thread/settings/update
sendLine({ type: 'set-response-style', style: 'friendly' });
ok(verdictOf(await waitFor(() => rpc().some((m) => m.method === 'thread/settings/update'))), 'a live style change sends thread/settings/update');
{
  const u = rpc().find((m) => m.method === 'thread/settings/update');
  ok(u.params.threadId === 'th-h' && u.params.personality === 'friendly', '…with {threadId, personality} exactly as the 0.153.4 schema names them', JSON.stringify(u.params));
  ok(verdictOf(await waitFor(() => readMeta()?.personality === 'friendly')), 'the sidecar now reports the new effective style');
  ok(verdictOf(events().some((e) => e.payload?.type === 'command_applied' && e.payload.command === 'style' && e.payload.value === 'friendly')), 'the change is VISIBLE in the transcript (command_applied)');
}
// an out-of-enum value is refused LOUDLY and never sent
{
  const before = rpc().filter((m) => m.method === 'thread/settings/update').length;
  sendLine({ type: 'set-response-style', style: 'sassy' });
  ok(verdictOf(await waitFor(() => events().some((e) => e.payload?.type === 'task_failed' && /Unknown response style "sassy"/.test(e.payload.error || '')))), 'an out-of-enum style is refused with the accepted list, never sent');
  ok(rpc().filter((m) => m.method === 'thread/settings/update').length === before, '…and no RPC left the wrapper');
  ok(readMeta()?.personality === 'friendly', '…and the effective style is unchanged');
}

// ② every ServerRequest method's reply shape
const replyFor = (id) => replies().find((r) => r.id === id);
ok(verdictOf(await waitFor(() => replyFor(907) && replyFor(908) && replyFor(909) && replyFor(910) && replyFor(911))), 'the auto/unsupported requests are answered WITHOUT a human');
ok(typeof replyFor(907)?.result?.currentTimeAt === 'number' && Math.abs(replyFor(907).result.currentTimeAt - Math.floor(Date.now() / 1000)) < 120,
  'currentTime/read is answered automatically with {currentTimeAt} in SECONDS (a card here would hang the turn)', JSON.stringify(replyFor(907)));
for (const [id, name] of [[908, 'attestation/generate'], [909, 'item/tool/call'], [910, 'account/chatgptAuthTokens/refresh'], [911, 'totally/unknown/method']]) {
  const r = replyFor(id);
  ok(gateOf(r) && gateOf(r.error) && r.error.code === -32601 && !('result' in r), `${name} is refused with a JSON-RPC ERROR — never a wrong-shaped result, never a hang`, JSON.stringify(r));
}
ok(verdictOf(await waitFor(() => events().filter((e) => e.payload?.type === 'client_request_unsupported').length >= 4)), 'each refusal also leaves a VISIBLE record (client_request_unsupported)');
ok(!Object.keys(readMeta()?.pendingRequests || {}).some((k) => ['907', '908', '909', '910', '911'].includes(k)), 'none of them ever became a pending card', JSON.stringify(Object.keys(readMeta()?.pendingRequests || {})));
ok(verdictOf(await waitFor(() => ['900', '901', '902', '903', '904', '905', '906', '912', '913', '914'].every((k) => readMeta()?.pendingRequests?.[k]))), 'the ten human-answerable requests ARE pending cards', JSON.stringify(Object.keys(readMeta()?.pendingRequests || {})));

// each one answered through the SAME client frame the UI sends
sendLine({ type: 'permission-response', requestId: 900, approved: true, permissionUpdates: [{ kind: 'allow' }], toolInput: {} });
ok(verdictOf(await waitFor(() => replyFor(900))), 'commandExecution approval answered');
// r2 REGRESSION — the one branch that did not validate was the one the first
// cut of this gate certified: `execpolicy_amendment` is `string[]` in the
// dumped schema (execpolicy RULE LINES) while the client's `permissionUpdates`
// is `[{kind}]`, so the wrapper must never build an amendment out of it. A
// plain accept is what the button promised, and it deserializes.
ok(JSON.stringify(replyFor(900).result) === JSON.stringify({ decision: 'accept' }),
  'commandExecution: the client’s option objects NEVER become an execpolicy amendment (the schema says string[]) — a plain accept', JSON.stringify(replyFor(900).result));
sendLine({ type: 'permission-response', requestId: 901, approved: true, alwaysAllow: true, permissionUpdates: [{ kind: 'allow' }] });
ok(verdictOf(await waitFor(() => replyFor(901))), 'fileChange approval answered');
ok(JSON.stringify(replyFor(901).result) === JSON.stringify({ decision: 'acceptForSession' }),
  'fileChange has NO amendment variant — "always" is acceptForSession, nothing invented', JSON.stringify(replyFor(901).result));
sendLine({ type: 'permission-response', requestId: 902, approved: true });
ok(verdictOf(await waitFor(() => replyFor(902))), 'permissions approval answered');
ok(JSON.stringify(replyFor(902).result) === JSON.stringify({ permissions: { fileSystem: { read: ['/tmp'] }, network: { enabled: true } }, scope: 'turn' }),
  'permissions wants a GRANT, not a decision: approving hands back the requested profile', JSON.stringify(replyFor(902).result));
// the round-trip the AskUserQuestion UI actually produces: answers keyed by the
// question TEXT, each a PLAIN STRING (both of which the old code dropped)
sendLine({ type: 'permission-response', requestId: 903, approved: true, toolInput: { answers: { 'Which layout?': 'grid' } }, responseData: { decision: 'accept', answers: { 'Which layout?': 'grid' } } });
ok(verdictOf(await waitFor(() => replyFor(903))), 'requestUserInput answered');
ok(JSON.stringify(replyFor(903).result) === JSON.stringify({ answers: { q1: { answers: ['grid'] } } }),
  'requestUserInput → bare {answers} keyed by QUESTION ID, plain-string answer accepted (the UI keys by text)', JSON.stringify(replyFor(903).result));
sendLine({ type: 'permission-response', requestId: 904, approved: true, toolInput: { answers: { 'Where are you? — City': 'Tokyo', 'Where are you? — Use metric': 'true' } }, responseData: { decision: 'accept', answers: { 'Where are you? — City': 'Tokyo', 'Where are you? — Use metric': 'true' } } });
ok(verdictOf(await waitFor(() => replyFor(904))), 'MCP elicitation answered');
ok(JSON.stringify(replyFor(904).result) === JSON.stringify({ action: 'accept', content: { city: 'Tokyo', metric: true } }),
  'elicitation → {action:"accept", content} with each property TYPED per the requestedSchema (metric is a boolean, not "true")', JSON.stringify(replyFor(904).result));
sendLine({ type: 'permission-response', requestId: 905, approved: false });
ok(verdictOf(await waitFor(() => replyFor(905))), 'v1 applyPatchApproval answered');
ok(JSON.stringify(replyFor(905).result) === JSON.stringify({ decision: { denied: { rejection: 'Denied by the user in VibeSpace.' } } }),
  'the v1 pair speaks ReviewDecision: a denial is {denied:{rejection}} — NOT "decline"', JSON.stringify(replyFor(905).result));
sendLine({ type: 'permission-response', requestId: 906, approved: true, alwaysAllow: true });
ok(verdictOf(await waitFor(() => replyFor(906))), 'v1 execCommandApproval answered');
ok(JSON.stringify(replyFor(906).result) === JSON.stringify({ decision: 'approved_for_session' }),
  '…and its "always" is approved_for_session, not acceptForSession', JSON.stringify(replyFor(906).result));

// a URL-mode elicitation carries no schema: accepting it sends the ACTION only
// (`content` is nullable — an empty object is a different statement)
sendLine({ type: 'permission-response', requestId: 912, approved: true, toolInput: {} });
ok(verdictOf(await waitFor(() => replyFor(912))), 'url-mode elicitation answered');
ok(JSON.stringify(replyFor(912).result) === JSON.stringify({ action: 'accept' }), 'a url-mode accept omits `content` entirely', JSON.stringify(replyFor(912).result));
// a DENIED permissions request grants NOTHING and is labelled Denied — the
// label is decided by the shape we build, not by "does the profile look empty"
sendLine({ type: 'permission-response', requestId: 913, approved: false });
ok(verdictOf(await waitFor(() => replyFor(913))), 'permissions denial answered');
ok(JSON.stringify(replyFor(913).result) === JSON.stringify({ permissions: { fileSystem: null, network: null }, scope: 'turn' }), 'denying a permissions request grants nothing', JSON.stringify(replyFor(913).result));
ok(gateOf(events().some((e) => e.type === 'server_request_resolved' && e.payload.id === 913 && e.payload.decision === 'decline'))
  && verdictOf(events().some((e) => e.type === 'server_request_resolved' && e.payload.id === 902 && e.payload.decision === 'granted')),
  'the resolved record labels a GRANT and a DENY apart (both are `{permissions}` on the wire)',
  JSON.stringify(events().filter((e) => e.type === 'server_request_resolved').map((e) => [e.payload.id, e.payload.decision])));

// ② r2 — the ADAPTER-BUILT frame, i.e. the only permission-response shape
// production can actually produce (src/ws-handler.js 'permission-response' →
// adapter.formatPermissionResponse). The first cut only ever wrote hand-made
// frames to stdin, so a branch that no product path could reach was "covered".
{
  const { CodexAdapter } = require(path.join(REPO, 'src/adapters/codex.js'));
  const ad = new CodexAdapter({ codexCmd: 'codex', chatWrapper: '/w' });
  const frame = ad.formatPermissionResponse({ requestId: 914, approved: true, toolInput: {}, permissionUpdates: [{ kind: 'allow_always' }] });
  ok(!/permissionUpdates/.test(frame), 'the adapter does NOT forward the client\u2019s permissionUpdates \u2014 it carries only the alwaysAllow BOOLEAN', frame.slice(0, 200));
  w.stdin.write(frame + '\n');
  ok(verdictOf(await waitFor(() => replyFor(914))), 'an ADAPTER-built "Always Allow" is answered');
  ok(JSON.stringify(replyFor(914).result) === JSON.stringify({ decision: 'acceptForSession' }),
    '\u2026with acceptForSession \u2014 a SESSION-scoped promise, never a persistent execpolicy amendment the user never asked for', JSON.stringify(replyFor(914).result));
}

// ② r2 — EVERY reply validated against codex's OWN result schema. This is the
// assert that would have failed the shipped `[{kind}]` amendment; the per-method
// expectations above stay because they pin the DECISION, this one pins that the
// decision is even deserializable.
{
  const methodOf = new Map(SERVER_REQS.map((r) => [r.id, r.method]));
  const answered = replies().filter((r) => 'result' in r);
  ok(answered.length >= 11, 'every request got a reply to validate', String(answered.length));
  for (const r of answered) {
    const method = methodOf.get(r.id);
    const sch = RESP_SCHEMAS.byMethod[method];
    if (!sch) { ok(false, `no vendored schema for ${method} \u2014 a new answerable method needs its dump in the fixture`); continue; }
    const errs = schemaErrors(sch, r.result);
    ok(errs.length === 0, `reply to ${method} validates against ${RESP_SCHEMAS.fileByMethod[method]} (codex ${RESP_SCHEMAS.codexVersion})`, errs.join(' | ') + ' :: ' + JSON.stringify(r.result).slice(0, 200));
  }
  // NEGATIVE CONTROL: the validator is not vacuous — the exact payload this
  // suite used to certify is rejected, naming the field.
  const bad = schemaErrors(RESP_SCHEMAS.byMethod['item/commandExecution/requestApproval'],
    { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: [{ kind: 'allow' }] } } });
  ok(bad.length > 0 && verdictOf(/execpolicy_amendment/.test(bad.join(' '))), 'negative control: the OLD amendment payload (option objects) FAILS the real schema', bad.join(' | '));
  const bad2 = schemaErrors(RESP_SCHEMAS.byMethod['item/tool/requestUserInput'], { decision: 'accept' });
  ok(bad2.length > 0, 'negative control: `{decision}` is not a requestUserInput answer (the pre-2.369.58 one-shape-fits-all)', bad2.join(' | '));
  const good = schemaErrors(RESP_SCHEMAS.byMethod['item/commandExecution/requestApproval'],
    { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: ['allow rm'] } } });
  ok(good.length === 0, 'positive control: the amendment IS legal when it carries the server\u2019s own rule STRINGS (a future UI may send it)', good.join(' | '));
}

// ② r2 — the vendored schema is a COPY of an upstream file: when the codex
// binary is here, re-dump and diff it, so an upstream shape change fails loudly
// instead of rotting in the fixture. No binary = an explicit SKIP with evidence.
{
  let cx = '';
  if (!(process.env.VS_NO_REAL_CLI === '1')) try { cx = execSync('command -v codex', { encoding: 'utf8' }).trim(); } catch { }   // B-ddb9: not under the flag
  if (!cx) {
    console.log(process.env.VS_NO_REAL_CLI === '1' ? '  SKIP: VS_NO_REAL_CLI=1 — the real codex is not started here — the fixture-vs-live schema diff did not run (the fixture still gates every reply)' : '  SKIP: no `codex` on PATH — the fixture-vs-live schema diff did not run (the fixture still gates every reply)');
  } else {
    const dumpDir = path.join(dir, 'schema-dump');
    fs.mkdirSync(dumpDir, { recursive: true });
    let dumped = true;
    try { execSync(`codex app-server generate-json-schema --experimental --out ${dumpDir}`, { env: { ...withoutVendorKeys(process.env), CODEX_HOME: path.join(dir, 'no-such-home') }, stdio: 'ignore' }); }
    catch { dumped = false; }
    if (!dumped) console.log('  SKIP: `codex app-server generate-json-schema` failed here — fixture diff skipped');
    else {
      let ver = '?';
      try { ver = execSync('codex --version', { encoding: 'utf8', env: withoutVendorKeys(process.env) }).trim(); } catch { }
      for (const [method, file] of Object.entries(RESP_SCHEMAS.fileByMethod)) {
        const live = JSON.parse(fs.readFileSync(path.join(dumpDir, file + '.json'), 'utf8'));
        ok(JSON.stringify(live) === JSON.stringify(RESP_SCHEMAS.byMethod[method]),
          `fixture matches the INSTALLED codex (${ver}) for ${method}`, 'the dump changed upstream — re-vendor the fixture and re-check every reply builder');
      }
    }
  }
}

// the elicitation CARD: rows travel with the record, and the normalizer renders
// them through the AskUserQuestion family
const wrapperRecords = () => events();
{
  const rec = wrapperRecords().find((r) => r.type === 'server_request' && r.payload?.method === 'mcpServer/elicitation/request');
  ok(gateOf(rec) && gateOf(Array.isArray(rec.payload.questions)) && rec.payload.questions.length === 2 && rec.payload.questions[0].id === 'city',
    'the elicitation record carries its derived question rows (ONE derivation feeds the card AND the reply mapping)', JSON.stringify(rec?.payload?.questions));
  const mm = new CodexMessageManager('honesty');
  mm.convertHistory(wrapperRecords());
  const card = mm.messages.find((m) => m.permission?.method === 'mcpServer/elicitation/request');
  ok(gateOf(card) && card.permission.kind === 'user_input' && card.permission.questions.length === 2 && verdictOf(/^MCP: weather$/.test(card.toolName)),
    'it renders as the SAME question-card family (kind user_input), named for the MCP server', JSON.stringify({ kind: card?.permission?.kind, tool: card?.toolName }));
  ok(gateOf(card) && card.permission.resolved === 'allowed', 'and the accepted reply resolves the card (action "accept" counts as allowed)', String(card?.permission?.resolved));
  const sys = mm.messages.filter((m) => m.role === 'system').map((m) => m.content?.[0]?.text || '');
  ok(verdictOf(sys.some((tx) => /attestation\/generate.*cannot answer/s.test(tx))), 'an unanswerable request prints a system line naming the method', sys.filter((x) => /cannot answer/.test(x)).slice(0, 1).join(' | '));
  // ④ the LIVE half of the three-producer parity
  const liveCards = mm.messages.filter((m) => m.role === 'tool' && ['image_gen', 'sleep'].includes(m.toolName));
  ok(liveCards.length === 2, 'the live stream produced BOTH media cards (image_gen + sleep)', liveCards.map((m) => m.toolName).join(','));
  global.__liveCards = liveCards;
  const raw = JSON.stringify(wrapperRecords());
  ok(!raw.includes('BASE64PAYLOAD'), "the 3 MB base64 image NEVER enters the wrapper's records (the 2.369.35 law)");
}
// …and the NEXT turn carries the chosen style (the key appears only once
// chosen). The turn has to END first — a chat-input during an active turn is a
// queue/add by design, which is exactly what the first cut of this test tripped
// over.
sendLine({ type: 'interrupt' });
ok(verdictOf(await waitFor(() => readMeta()?.activeTurnId == null)), 'the first turn ends');
sendLine({ type: 'chat-input', text: 'again', msgId: 'm2' });
ok(verdictOf(await waitFor(() => rpc().filter((m) => m.method === 'turn/start').length === 2)), 'a second turn starts');
ok(rpc().filter((m) => m.method === 'turn/start')[1].params.personality === 'friendly', '…and NOW turn/start carries personality (only because the user picked one)', JSON.stringify(rpc().filter((m) => m.method === 'turn/start')[1]?.params));

await endWrapper('the main wrapper');

// ① the spawn-time value, when the user DID choose one
console.log('— personality at spawn (chosen)');
{
  fs.rmSync(rpcLog, { force: true }); fs.rmSync(repliesLog, { force: true }); fs.rmSync(metaFile, { force: true });
  w = spawnWrapper({ CODEX_WEBUI_PERSONALITY: 'none' });
  out = ''; w.stdout.on('data', (d) => { out += d; }); w.stderr.on('data', () => {});
  ok(verdictOf(await waitFor(() => rpc().some((m) => m.method === 'thread/start'))), 'wrapper restarted with a chosen style');
  ok(rpc().find((m) => m.method === 'thread/start').params.personality === 'none', "a CHOSEN style is sent — including 'none', which is a real codex value meaning \"no persona\"");
  await endWrapper("the 'none' wrapper");
  fs.rmSync(rpcLog, { force: true }); fs.rmSync(metaFile, { force: true });
  w = spawnWrapper({ CODEX_WEBUI_PERSONALITY: 'sassy' });
  out = ''; w.stdout.on('data', (d) => { out += d; }); w.stderr.on('data', () => {});
  ok(verdictOf(await waitFor(() => rpc().some((m) => m.method === 'thread/start'))), 'wrapper restarted with a bogus style');
  ok(!('personality' in rpc().find((m) => m.method === 'thread/start').params), 'an out-of-enum spawn value is dropped, never forwarded');
  await endWrapper("the 'sassy' wrapper");
}
// the adapter is the ONE place the enum is applied to a spawn
{
  const { CodexAdapter } = require(path.join(REPO, 'src/adapters/codex.js'));
  const ad = new CodexAdapter({ codexCmd: 'codex', chatWrapper: '/w' });
  const envOf = (style) => ad.buildSessionArgs({ cwd: '/tmp', mode: 'chat', permissionMode: 'default', outputStyle: style }).env.CODEX_WEBUI_PERSONALITY;
  ok(envOf('friendly') === 'friendly' && envOf('') === '' && envOf('Concise') === '' && envOf(undefined) === '',
    "the adapter passes only codex's OWN vocabulary (claude's 'Concise' is not a personality)", JSON.stringify([envOf('friendly'), envOf('Concise')]));
  ok(JSON.parse(ad.formatSetResponseStyle('none')).type === 'set-response-style', 'formatSetResponseStyle builds the stdin verb');
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  let threw = false;
  try { new ClaudeCodeAdapter({ buffersDir: '/tmp' }).formatSetResponseStyle('Concise'); } catch { threw = true; }
  ok(verdictOf(threw), 'a spawn-only harness REFUSES the live verb (base.js throws) instead of writing a frame its wrapper would drop');
}

// ═════════ Part 3 — ACP unknown-update breadcrumb ═════════
console.log('— ACP unknown sessionUpdate');
{
  const seen = [];
  const prev = global.__vsEvent;
  global.__vsEvent = (name, detail) => seen.push([name, detail]);
  const warns = [];
  const prevWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try {
    const mm = new AcpMessageManager('acp-unknown');
    const before = mm.messages.length;
    const feed = (u) => mm.processLive({ ts: Date.now(), type: 'acp', kind: 'update', sessionId: 's', update: u });
    feed({ sessionUpdate: 'quantum_entanglement_update', payload: 1 });
    feed({ sessionUpdate: 'quantum_entanglement_update', payload: 2 });   // same kind again
    feed({ sessionUpdate: 'another_unknown_kind' });
    ok(mm.messages.length === before, 'an unknown update creates NO card (it is still dropped — but not in silence)');
    const mine = seen.filter(([n]) => n.startsWith('acp-unknown-update:'));
    ok(mine.length === 2, 'ONE telemetry event per KIND (deduped per process), not per record', JSON.stringify(mine));
    ok(mine[0][0] === 'acp-unknown-update:quantum_entanglement_update', 'the event names the kind', mine[0]?.[0]);
    ok(warns.filter((x) => /unhandled sessionUpdate/.test(x)).length === 2, 'and one rate-limited console line per kind', String(warns.length));
    // the 11th variant of the installed opencode's zod union: KNOWN, card-less
    const before2 = mm.messages.length;
    const seenBefore = seen.length;
    feed({ sessionUpdate: 'session_info_update', title: 'renamed by the agent', updatedAt: '2026-09-07' });
    ok(mm.messages.length === before2 && seen.length === seenBefore, 'session_info_update is a KNOWN kind: no card, and NO unknown breadcrumb');
    ok(mm.status()?.agentSessionTitle === 'renamed by the agent' || mm._status.agentSessionTitle === 'renamed by the agent', 'its title is kept on the status (a future surface has the fact)');
    // (Part 3's census — every kind of the agent's zod union has a case, the default arm is the breadcrumb (src/acp-message-manager.js): MOVED to the fast scripts/test-harness-honesty-pins.mjs — lane lg-text-legs-2, B-94d3: a leg that reads only source text runs in every lane's gate)
  } finally { global.__vsEvent = prev; console.warn = prevWarn; }
}

// ═════════ Part 4 — THREE-producer parity on imageGeneration + sleep ═════════
console.log('— image_gen + sleep: three producers, one card');
{
  const shapeOf = (recs) => {
    const mm = new CodexMessageManager('parity');
    mm.convertHistory(recs);
    return mm.messages.filter((m) => m.role === 'tool').map((m) => ({
      toolName: m.toolName, status: m.status, toolStatus: m.toolStatus, collapseKind: m.collapseKind, content: m.content,
    }));
  };
  // producer A — the ROLLOUT (real 0.153.4 records: Extension/image_gen.generation + Extension/clock.sleep)
  const rollout = [
    { timestamp: 't', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Extension', kind: 'image_gen.generation', id: 'exec-img1', status: 'completed', revisedPrompt: 'a red van', result: 'B'.repeat(4000), transparentBackground: false, failure: null, savedPath: '/tmp/gen/exec-img1.png' } } },
    { timestamp: 't', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Extension', kind: 'clock.sleep', id: 'call_s1', durationMs: 30000 } } },
  ];
  // producer B — codex-thread-read (a thread with NO rollout file)
  const trRecs = threadToRecords({ id: 'th', turns: [{ id: 'turn1', items: [
    { type: 'imageGeneration', id: 'exec-img1', status: 'completed', revisedPrompt: 'a red van', result: 'B'.repeat(4000), transparentBackground: false, failure: null, savedPath: '/tmp/gen/exec-img1.png' },
    { type: 'sleep', id: 'call_s1', durationMs: 30000 },
  ] }] });
  // producer C — the LIVE wrapper (captured above, against the stub app-server)
  const live = (global.__liveCards || []).map((m) => ({ toolName: m.toolName, status: m.status, toolStatus: m.toolStatus, collapseKind: m.collapseKind, content: m.content }));

  const A = shapeOf(rollout), B = shapeOf(trRecs);
  ok(A.length === 2 && B.length === 2 && live.length === 2, 'all three producers made exactly the two cards', JSON.stringify([A.length, B.length, live.length]));
  ok(JSON.stringify(A) === JSON.stringify(B), 'rollout ⇄ thread-read: SHAPE-EQUAL', JSON.stringify({ A: A[0], B: B[0] }).slice(0, 500));
  ok(JSON.stringify(A) === JSON.stringify(live), 'rollout ⇄ LIVE wrapper: SHAPE-EQUAL (the third producer the critic warned about)', JSON.stringify({ A, live }).slice(0, 700));
  const img = A[0].content[0], slp = A[1].content[0];
  ok(img.toolName === 'image_gen' && img.input.prompt === 'a red van' && img.input.path === '/tmp/gen/exec-img1.png',
    'the canonical image card = {prompt, path} + a status/saved output', JSON.stringify(img.input));
  ok(img.output === 'status: completed\nsaved /tmp/gen/exec-img1.png', '…and the file is NAMED, never inlined', JSON.stringify(img.output));
  ok(!JSON.stringify(A).includes('BBBB'), 'the base64 result never reaches the card on ANY producer');
  ok(slp.toolName === 'sleep' && slp.input.durationMs === 30000 && slp.output === 'slept 30s', 'the canonical sleep card = {durationMs} + a frozen total', JSON.stringify(slp));
  ok(A[0].collapseKind === null && A[1].collapseKind === null, 'both are VISIBLE work — a 20-minute wait folded into "N tool calls" is how a pause reads as a hang');
  // a FAILED generation is an error card, not a silent success
  const failed = shapeOf([{ timestamp: 't', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Extension', kind: 'image_gen.generation', id: 'x', status: 'failed', result: '', failure: { type: 'usageLimitExceeded', limitId: 'img' } } } }]);
  ok(failed[0].toolStatus === 'error' && verdictOf(/usageLimitExceeded/.test(failed[0].content[0].output)), 'a failed generation renders as an ERROR card carrying the failure', JSON.stringify(failed[0].content[0].output));
  // (Part 4's source pins — the wrapper's pending stub and completion spelling (data/bin/codex-chat-wrapper.js), thread-read's sleep (src/codex-thread-read.js), the renderer's image / sleep cards (src/lib/chat-renderers.js), ChatView's one ticker (src/lib/chat-view.js): MOVED to the fast scripts/test-harness-honesty-pins.mjs — lane lg-text-legs-2, B-94d3: a leg that reads only source text runs in every lane's gate)
  const { formatSleepRemaining } = await import(path.join(REPO, 'src/lib/chat-renderers.js'));
  ok(formatSleepRemaining(760000) === '12:40' && formatSleepRemaining(-5) === '0:00' && formatSleepRemaining(3665000) === '1:01:05',
    'the countdown formats mm:ss (h:mm:ss past an hour) and never goes negative', [formatSleepRemaining(760000), formatSleepRemaining(-5), formatSleepRemaining(3665000)].join(' / '));
}

// ═════════ the version marker names THIS change ═════════ (every site names ONE version, and the engineering log's entry under it is THIS
// change — src/, data/bin/, docs/: MOVED to the fast scripts/test-harness-honesty-pins.mjs — lane lg-text-legs-2, B-94d3: a leg that reads only source text runs in every lane's gate)

// ═════════ docs ═════════ (the kb documents carry the change — docs/kb-file-structure.md, docs/kb-features.md, docs/kb-api.md: MOVED to the fast scripts/test-harness-honesty-pins.mjs — lane lg-text-legs-2, B-94d3: a leg that reads only source text runs in every lane's gate)

try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }

// ═════════ Part 5 — headless chrome: the image card really draws ═════════
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.log('  SKIP: no chrome/chromium — the browser leg did not run');
} else {
  console.log('— headless chrome: a LIVE image_gen item renders as a drawn thumbnail');
  const [PORT, CDP_PORT] = await freePorts(2); // per-process (scripts/scratch.mjs) — a pid-modulo port was a 1-in-20 collision
  const wt = `/tmp/vs-honesty-wt-${process.pid}`;
  const fakeHome = `${wt}-home`;
  const CWD = `${wt}-cwd`;
  const THREAD = '01a07777-0000-7000-8000-00000000abcd';
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGMwnnkGK2IYWhIAtNFmAVCW3mYAAAAASUVORK5CYII=';
  const IMG = `${CWD}/generated.png`;
  fs.mkdirSync(CWD, { recursive: true });
  fs.writeFileSync(IMG, Buffer.from(PNG_B64, 'base64'));
  // a real codex ROLLOUT carrying the two items — the SAME records the live
  // wrapper writes (that is the whole point of the parity above), so this leg
  // proves the shape those three producers agree on actually DRAWS.
  const day = new Date();
  const rollDir = path.join(fakeHome, '.codex', 'sessions', String(day.getFullYear()), '01', '01');
  fs.mkdirSync(rollDir, { recursive: true });
  const ts = () => new Date().toISOString();
  const lines = [
    { timestamp: ts(), type: 'session_meta', payload: { id: THREAD, cwd: CWD, originator: 'vibespace', cli_version: '0.153.4', instructions: null } },
    { timestamp: ts(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'draw me a van' }] } },
    { timestamp: ts(), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Extension', kind: 'image_gen.generation', id: 'exec-img1', status: 'completed', revisedPrompt: 'a red van', result: '', failure: null, savedPath: IMG } } },
    { timestamp: ts(), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'Extension', kind: 'clock.sleep', id: 'call_s1', durationMs: 30000 } } },
    { timestamp: ts(), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Here it is.' }] } },
  ].map((r) => JSON.stringify(r));
  fs.writeFileSync(path.join(rollDir, `rollout-2026-01-01T00-00-00-${THREAD}.jsonl`), lines.join('\n') + '\n');

  try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: REPO, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${REPO}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CODEX_HOME: path.join(fakeHome, '.codex'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
  const chrome = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1400,1000',
    '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
  const cleanup = () => {
    try { chrome.kill('SIGKILL'); } catch { }
    try { srv.kill('SIGKILL'); } catch { }
    for (const r of [wt, `${wt}-chrome`, fakeHome, CWD]) { try { endRootedProcesses(r); } catch { } }   // what the server started (its HOME, its tree) goes with it (test-architecture §57b)
    try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { }
    for (const d of [`${wt}-chrome`, fakeHome, CWD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
  };
  process.on('exit', cleanup);
  for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }
  const WebSocket = require('ws');
  let target = null;
  for (let i = 0; i < 120 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { }
    if (!target) await sleep(250);
  }
  if (!target) { ok(false, 'chrome exposed a CDP page target'); }
  else {
    const cws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r) => cws.on('open', r));
    let seq = 0; const pend = new Map();
    cws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); cws.send(JSON.stringify({ id, method, params })); });
    const evaljs = async (expr) => {
      const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
      return r.result?.result?.value;
    };
    await cdp('Runtime.enable'); await cdp('Page.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 100; i++) { if (await evaljs('!!(window.app && window.app.ready && window.app.wm)').catch(() => false)) break; await sleep(300); }
    await evaljs('window.app.ready.then(() => true)').catch(() => { });
    await sleep(1200);
    const got = await evaljs(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.app.viewSession('${THREAD}', ${JSON.stringify(CWD)}, 'codex media', { backend: 'codex', backendSessionId: '${THREAD}' });
      let img = null, list = null;
      for (let i = 0; i < 100; i++) {
        list = document.querySelector('.chat-message-list');
        img = list && list.querySelector('img.chat-tool-img');
        if (img && img.complete && img.naturalWidth > 0) break;
        await sleep(250);
      }
      const labels = list ? [...list.querySelectorAll('.chat-tool-label')].map((e) => e.textContent.trim()) : [];
      return {
        cards: list ? list.querySelectorAll('.chat-msg-tool-result').length : -1,
        imgSrc: img ? img.getAttribute('src') : null,
        natural: img ? img.naturalWidth : 0,
        labels,
        srcIsAttr: img ? !/<img/.test(img.parentElement.getAttribute('data-raw') || '') : false,
      };
    })()`).catch((e) => ({ err: String(e).slice(0, 300) }));
    ok(gateOf(got) && got.natural > 0, 'the generated image DRAWS in a real browser (naturalWidth > 0 — a /api/file/raw fetch that really resolved)', JSON.stringify(got));
    ok(gateOf(got) && verdictOf(/\/api\/file\/raw\?path=/.test(got.imgSrc || '')), '…from /api/file/raw, the same lane the file viewer uses', String(got?.imgSrc).slice(0, 120));
    ok(gateOf(got) && verdictOf((got.labels || []).some((l) => /Generated image|生成的图片|生成した画像/.test(l))), 'the card is labelled as a GENERATED image, not a bare "status: completed" line', JSON.stringify(got?.labels));
    ok(gateOf(got) && verdictOf((got.labels || []).some((l) => /slept 30s/.test(l))), 'and the completed sleep is a frozen one-line card', JSON.stringify(got?.labels));
  }
  cleanup();
  process.removeAllListeners('exit');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
