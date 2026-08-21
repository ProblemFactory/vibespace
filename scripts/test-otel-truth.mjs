#!/usr/bin/env node
// OTel truth channel (2.361.0, B-345b): the per-request billing-truth stack.
// 1. PARSER — OTLP JSON logs → truth records (fixture shape captured from a
//    REAL 2.1.235 payload, identities sanitized; encoding tolerances pinned).
// 2. INGEST — real express + real HTTP: loopback+token gate, stash append,
//    dedup, corrective attribution on mismatch (incl. org flip re-write),
//    unknown-org honesty, envFor on/off.
// 3. BAKE — a REAL UsageHistory scan over a fake $HOME transcript: the
//    truthLookup override lands the OBSERVED acct in the persisted shard.
// 4. WIRING PINS — the 2.331.0 dead-fix lesson: injection gate in ws-create,
//    contract key, auth exemption, server routes + setTruthLookup all grepped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

// Sanitized copy of the REAL captured api_request record (2.1.235): key names,
// nesting and value encodings verbatim; uuids/email replaced.
const ORG = '9a1b2c3d-1111-2222-3333-444455556666';
const REC = (over = {}) => ({
  timeUnixNano: '1787188836189000000',
  body: { stringValue: 'claude_code.api_request' },
  attributes: Object.entries({
    'user.id': { stringValue: 'deadbeef'.repeat(8) },
    'session.id': { stringValue: '4ad31ec3-0e5b-40e2-a953-77f121ce7eee' },
    'organization.id': { stringValue: ORG.toUpperCase() },
    'user.email': { stringValue: 'User@Example.com' },
    'user.account_uuid': { stringValue: 'e4319840-4a35-4bf0-bb48-97d1a42096cc' },
    'event.name': { stringValue: 'api_request' },
    'event.timestamp': { stringValue: '2026-08-20T01:20:36.189Z' },
    'event.sequence': { intValue: 14 },
    model: { stringValue: 'claude-haiku-4-5-20251001' },
    input_tokens: { intValue: 10 },
    output_tokens: { intValue: '69' }, // protobuf-JSON allows string ints
    cache_read_tokens: { intValue: 18118 },
    cache_creation_tokens: { intValue: 8545 },
    cost_usd: { doubleValue: 0.0192568 },
    request_id: { stringValue: 'req_011TESTTRUTH000000000001' },
    ...over,
  }).map(([key, value]) => ({ key, value })),
});
const PAYLOAD = (recs) => ({
  resourceLogs: [{
    resource: { attributes: [{ key: 'service.name', value: { stringValue: 'claude-code' } }, { key: 'service.version', value: { stringValue: '2.1.235' } }] },
    scopeLogs: [{ scope: { name: 'com.anthropic.claude_code.events' }, logRecords: recs }],
  }],
});

// ── 1. parser ──
{
  const { parseOtlpLogs } = require(REPO + '/src/otel-truth.js');
  const other = REC({ 'event.name': { stringValue: 'user_prompt' }, request_id: undefined });
  const { records, seen } = parseOtlpLogs(PAYLOAD([REC(), other]));
  ok(records.length === 1, 'only api_request kept (user_prompt filtered)');
  const r = records[0];
  ok(r.rid === 'req_011TESTTRUTH000000000001' && r.orgUuid === ORG, 'rid + orgUuid extracted (org lowercased)', JSON.stringify(r));
  ok(r.i === 10 && r.o === 69 && r.cr === 18118 && r.cw === 8545, 'all four token classes (string intValue tolerated)', JSON.stringify(r));
  ok(Math.abs(r.costUsd - 0.0192568) < 1e-9 && r.ts === Date.parse('2026-08-20T01:20:36.189Z'), 'cost + ISO timestamp');
  ok(r.email === 'user@example.com' && r.sid === '4ad31ec3-0e5b-40e2-a953-77f121ce7eee' && r.cliVersion === '2.1.235', 'email lowercased, sid + resource version merged');
  ok(seen.api_request === 1 && seen.user_prompt === 1, 'unknown/filtered event names COUNTED, never silently dropped');
}

// ── 2. ingest over real HTTP ──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-otel-'));
  const attribCalls = [];
  let curAcct = 'sub-configured';
  let curLastTs = 0;
  const fakeUH = {
    attribAt: () => ({ acct: curAcct, pool: 'pool-1', lastTs: curLastTs }),
    recordAttribution: (r) => attribCalls.push(r),
  };
  let settingVal;
  const groups = new Map([['org:' + ORG, { accountIds: ['sub-true'], accountId: 'sub-true' }]]);
  const ingest = require(REPO + '/src/server/otel-ingest.js').create({
    dataDir: dir, PORT: 0,
    getUsageHistory: () => fakeUH,
    identityGroups: () => groups,
    listAccounts: () => [{ id: 'sub-mail', email: 'mail@example.com', type: 'subscription', backend: 'claude' }],
    serverSetting: () => settingVal,
  });
  const express = require(REPO + '/node_modules/express');
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.post('/otel/v1/logs', ingest.logs);
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r));
  const port = srv.address().port;
  const token = ingest.envFor().OTEL_EXPORTER_OTLP_HEADERS.split('=')[1];
  const post = (payload, tok = token) => new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request({ host: '127.0.0.1', port, path: '/otel/v1/logs', method: 'POST', headers: { 'content-type': 'application/json', 'x-vibespace-otel': tok, 'content-length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.end(body);
  });

  ok((await post(PAYLOAD([REC()]), 'WRONG')).status === 403, 'bad token → 403 (the only gate — cookie middleware exempts /otel/)');
  const r1 = await post(PAYLOAD([REC()]));
  ok(r1.status === 200, 'valid ingest → 200', r1.body);
  ok(ingest.truthLookup('req_011TESTTRUTH000000000001') === 'sub-true', 'truth map: rid → resolved account');
  ok(ingest.truthLookup('req_unknown') === undefined, 'no truth → undefined (bake falls back to attribution walk)');
  ok(attribCalls.length === 1 && attribCalls[0].acct === 'sub-true' && attribCalls[0].sid && attribCalls[0].pool === 'pool-1', 'mismatch → ONE corrective attribution record (pool tag preserved)', JSON.stringify(attribCalls));
  await post(PAYLOAD([REC()]));
  ok(attribCalls.length === 1, 'duplicate rid → no second correction, no re-append');
  const stash = fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n');
  ok(stash.length === 1 && JSON.parse(stash[0]).acct === 'sub-true', 'stash has ONE truth line with resolved acct');
  // org flips back to the configured one → correction must RE-write
  groups.set('org:aaaaaaaa-0000-0000-0000-000000000000', { accountIds: ['sub-configured'], accountId: 'sub-configured' });
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'aaaaaaaa-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_flip2' } })]));
  ok(attribCalls.length === 1 && ingest.truthLookup('req_flip2') === 'sub-configured', 'truth agreeing with current attribution → NO corrective write');
  // unknown org: stashed as unknown, no truth entry, no correction
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'ffffffff-9999-9999-9999-999999999999' }, 'user.email': { stringValue: 'nobody@nowhere.io' }, request_id: { stringValue: 'req_unknownorg' } })]));
  ok(ingest.truthLookup('req_unknownorg') === undefined && attribCalls.length === 1, 'UNKNOWN org → no truth override, no correction');
  ok(JSON.parse(fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n').pop()).acctKnown === false, 'unknown org still stashed (acctKnown:false — offline re-derivable)');
  // email fallback
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'bbbbbbbb-0000-0000-0000-000000000000' }, 'user.email': { stringValue: 'Mail@Example.com' }, request_id: { stringValue: 'req_mail' } })]));
  ok(ingest.truthLookup('req_mail') === 'sub-mail', 'org unknown but roster email matches → email-fallback resolution');
  // ── review-caught cases (adversarial pass, 2.361.0) ──
  // ① '__global__' is a TRUTHY pseudo-id and may come FIRST in the group
  //    (live production shape on this machine) — resolveOrg must skip it.
  groups.set('org:cccccccc-0000-0000-0000-000000000000', { accountIds: ['__global__', 'sub-named'], accountId: null });
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'cccccccc-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_gmix' } })]));
  ok(ingest.truthLookup('req_gmix') === 'sub-named', "'__global__'-first group resolves to the NAMED sub, never the pseudo-id");
  // ② global-ONLY org → truth null; a global session (walk null) must get NO
  //    bogus corrective record.
  groups.set('org:dddddddd-0000-0000-0000-000000000000', { accountIds: ['__global__'], accountId: null });
  const before2 = attribCalls.length;
  curAcct = null;
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'dddddddd-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_gonly' } })]));
  ok(ingest.truthLookup('req_gonly') === null && attribCalls.length === before2, 'global-only org → truth null, NO corrective write for a global session');
  // ③ the CANONICAL sequence: agree → pool hot-switch → stale CLI. The
  //    agreement phase must NOT arm the dedup into suppressing the correction.
  const orgT = 'eeeeeeee-0000-0000-0000-000000000000';
  groups.set('org:' + orgT, { accountIds: ['sub-A'], accountId: 'sub-A' });
  curAcct = 'sub-A'; // walk agrees with truth — steady state, no write
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_agree1' } })]));
  const afterAgree = attribCalls.length;
  ok(afterAgree === before2, 'agreement phase writes nothing');
  curAcct = 'sub-B'; // pool hot-switch: link-intent now says B, CLI still bills A
  curLastTs = Date.parse('2026-08-20T01:20:36.189Z') + 60000; // switch entry NEWER than the event ts
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_stale1' } })]));
  ok(attribCalls.length === afterAgree + 1 && attribCalls.at(-1).acct === 'sub-A', 'stale-token mismatch AFTER agreement still writes the correction (the headline scenario)');
  ok(attribCalls.at(-1).ts === curLastTs + 1, 'corrective ts bumped past the newest attribution entry (late flush still dominates the walk)');
  curAcct = 'sub-C'; // second switch while STILL stale on A: new (truth→walk) pair must re-write
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_stale2' } })]));
  ok(attribCalls.length === afterAgree + 2 && attribCalls.at(-1).acct === 'sub-A', 'a SECOND hot-switch during the same stale window re-writes (pair-keyed dedup)');
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_stale3' } })]));
  ok(attribCalls.length === afterAgree + 2, 'same (truth→walk) pair repeats → deduped');
  curAcct = 'sub-configured'; curLastTs = 0;
  // envFor honesty
  const env = ingest.envFor();
  ok(env.OTEL_EXPORTER_OTLP_ENDPOINT === 'http://127.0.0.1:0/otel' && env.OTEL_LOGS_EXPORTER === 'otlp' && env.OTEL_METRICS_EXPORTER === 'none' && env.CLAUDE_CODE_ENABLE_TELEMETRY === '1', 'envFor: loopback endpoint, logs-only export', JSON.stringify(env));
  settingVal = false;
  ok(ingest.envFor() === null, 'usage.otelTruth=false → no env injection (kill switch)');
  settingVal = undefined;
  // boot replay: a fresh instance over the same dataDir re-learns the truth map
  const ingest2 = require(REPO + '/src/server/otel-ingest.js').create({ dataDir: dir, PORT: 0, getUsageHistory: () => fakeUH, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
  ok(ingest2.truthLookup('req_011TESTTRUTH000000000001') === 'sub-true', 'boot replay: stash → truth map survives restarts');
  ok(ingest2.envFor().OTEL_EXPORTER_OTLP_HEADERS === ingest.envFor().OTEL_EXPORTER_OTLP_HEADERS, 'token PERSISTED across boots (surviving sessions keep a valid truth stream)');
  srv.close();
}

// ── 3. bake path: real UsageHistory scan with a truth override ──
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-otel-home-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-otel-data-'));
  fs.mkdirSync(path.join(dataDir, 'session-meta'), { recursive: true });
  const proj = path.join(home, '.claude', 'projects', '-tmp-x');
  fs.mkdirSync(proj, { recursive: true });
  const sid = '22222222-3333-4444-5555-666666666666';
  // transcript record shape from the real field inventory (assistant + usage)
  const line = JSON.stringify({
    type: 'assistant', uuid: 'u1', parentUuid: null, sessionId: sid, timestamp: new Date().toISOString(),
    requestId: 'req_bake1', cwd: '/tmp/x',
    message: { id: 'msg_bake1', model: 'claude-haiku-4-5-20251001', role: 'assistant', type: 'message', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
  });
  fs.writeFileSync(path.join(proj, sid + '.jsonl'), line + '\n');
  const HOME0 = process.env.HOME;
  process.env.HOME = home;
  const { UsageHistory } = require(REPO + '/src/usage-history.js');
  const uh = new UsageHistory({ dataDir, homeDir: home, resolveAccount: (id) => (id === 'sub-true' ? { type: 'subscription', name: 'True', tail: '01' } : null) });
  uh.recordAttribution({ sid, acct: 'sub-configured', ts: Date.now() - 3600e3 }); // link intent says configured
  uh.setTruthLookup((rid) => (rid === 'req_bake1' ? 'sub-true' : undefined));
  uh.scan(true);
  process.env.HOME = HOME0;
  const shards = fs.readdirSync(path.join(dataDir, 'usage-history')).filter((f) => f.startsWith('events-'));
  const evs = shards.flatMap((f) => fs.readFileSync(path.join(dataDir, 'usage-history', f), 'utf-8').trim().split('\n').map((l) => JSON.parse(l)));
  const ev = evs.find((e) => e.rid === 'req_bake1');
  ok(!!ev, 'scan baked the transcript event', JSON.stringify(shards));
  ok(ev && ev.acct === 'sub-true' && ev.atype === 'subscription', 'OBSERVED truth overrode link-intent attribution at bake time', JSON.stringify(ev));
  ok(uh.attribAt(sid, Date.now()).acct === 'sub-configured', 'attribAt exposes the walk (the mismatch the ingest corrects)');
}

// ── 4. wiring pins (the 2.331.0 unstaged-wiring class) ──
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
  const wc = read('src/ws-create.js');
  ok(/!session\.host && backend === 'claude' && typeof otelEnv === 'function'/.test(wc), 'ws-create: OTEL env injection gated local-claude-only');
  ok(read('src/ws-handler.js').includes("'otelEnv',"), 'ws contract carries otelEnv');
  ok(/p\.startsWith\('\/otel\/'\)/.test(read('src/auth.js')), 'auth middleware exempts /otel/ (module gate is the only door)');
  const sv = read('server.js');
  ok(sv.includes('otelIngest.registerRoutes(app)') && sv.includes('usageHistory.setTruthLookup(otelIngest.truthLookup)') && sv.includes('otelEnv: otelIngest.envFor'), 'server.js wires routes + truthLookup + spawn env');
  const oi = read('src/server/otel-ingest.js');
  ok(/registerRoutes\(app\)\s*\{[\s\S]*?\/otel\/v1\/logs[\s\S]*?\/otel\/v1\/metrics[\s\S]*?\/otel\/v1\/traces/.test(oi), 'the module registers all three OTLP signals itself');
  // arrival counters (2.367.1): "the CLI exported nothing" and "we dropped what
  // it sent" must be distinguishable — the chat E2E's OTel check failed on
  // EVERY GitHub Actions push from 2.361.0 and there was no way to tell which.
  ok(oi.includes('arrivals.posts++') && oi.includes('arrivals.rejected++') && /stats\(\)\s*\{ return \{[^}]*\.\.\.arrivals/.test(oi), 'ingest counts posts/rejects/kept separately from truth rids');
  ok(oi.includes('arrivals.noRid++') && oi.includes('arrivals.noOrg++') && oi.includes('arrivals.stashed++'), 'and counts WHY a parsed record was dropped (a quiet truth channel was undiagnosable)');
  ok(oi.includes("app.get('/api/otel-stats'"), 'stats are readable over HTTP (the CI gate reads them to classify a miss)');
  ok(/this\._truthLookup \? this\._truthLookup\(ev\.rid\)/.test(read('src/usage-history.js')), 'usage-history scan consults truthLookup at bake time');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
