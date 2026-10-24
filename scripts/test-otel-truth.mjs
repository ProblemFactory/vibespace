#!/usr/bin/env node
// OTel truth channel (2.361.0, B-345b): the per-request billing-truth stack.
// 1. PARSER — OTLP JSON logs → truth records (fixture shape captured from a
//    REAL 2.1.235 payload, identities sanitized; encoding tolerances pinned).
// 2. INGEST — real express + real HTTP: loopback+token gate, stash append,
//    dedup, DISAGREEMENT counting on mismatch (the corrective-attribution
//    unknown-org honesty, envFor on/off.
// 3. BAKE — a REAL UsageHistory scan over a fake $HOME transcript: the
//    seam is deliberately unwired — see the 2026-09-07 block below).
// 4. WIRING PINS — the 2.331.0 dead-fix lesson: injection gate in ws-create,
//    contract key, auth exemption, server routes grepped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

// Sanitized copy of the REAL captured api_request record (2.1.235): key names,
// nesting and value encodings verbatim; uuids/email replaced.
const ORG = '9a1b2c3d-1111-2222-3333-444455556666';
// THE FIXTURE'S INSTANT IS RELATIVE TO NOW (2026-09-20): the boot replay keeps only
// records inside KEEP_MS (30 days) — a literal 2026-08-20 stamp turned the 'stash
// survives restarts' leg red the day it aged past the horizon (the clock-dependent
// fixture class). One hour ago, spelled both ways the record carries it.
const T_MS = Date.now() - 3600e3;
const T_ISO = new Date(T_MS).toISOString();
const T_NANO = String(T_MS) + '000000';
const REC = (over = {}) => ({
  timeUnixNano: T_NANO,
  body: { stringValue: 'claude_code.api_request' },
  attributes: Object.entries({
    'user.id': { stringValue: 'deadbeef'.repeat(8) },
    'session.id': { stringValue: '4ad31ec3-0e5b-40e2-a953-77f121ce7eee' },
    'organization.id': { stringValue: ORG.toUpperCase() },
    'user.email': { stringValue: 'User@Example.com' },
    'user.account_uuid': { stringValue: 'e4319840-4a35-4bf0-bb48-97d1a42096cc' },
    'event.name': { stringValue: 'api_request' },
    'event.timestamp': { stringValue: T_ISO },
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
  ok(Math.abs(r.costUsd - 0.0192568) < 1e-9 && r.ts === T_MS, 'cost + ISO timestamp');
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
  ok(ingest.observedOrgForRid('req_011TESTTRUTH000000000001') === 'sub-true', 'rid → resolved observed org (DIAGNOSTIC since 2026-09-07 — the map is kept, it just decides nothing)');
  ok(ingest.observedOrgForRid('req_unknown') === undefined, 'no observation → undefined');
  ok(attribCalls.length === 0, 'REFUTED AND REMOVED: a mismatch writes NO corrective attribution record — organization.id is the identity the CLI cached at SPAWN, so the correction booked a hot-switched session\'s spend to the account it started on forever', JSON.stringify(attribCalls));
  ok((() => { const r0 = JSON.parse(fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n')[0]); return r0.labelMatchesSlot === false && !('agreed' in r0); })(), 'the stash row RECORDS the label beside the walk\'s slot (`labelMatchesSlot` — a coincidence metric; the old `agreed` read as identity) instead of acting on it');
  await post(PAYLOAD([REC()]));
  ok(attribCalls.length === 0, 'duplicate rid → still nothing written, no re-append');
  const stash = fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n');
  ok(stash.length === 1 && JSON.parse(stash[0]).acct === 'sub-true', 'stash has ONE observation line with resolved acct');
  // org flips back to the configured one → correction must RE-write
  groups.set('org:aaaaaaaa-0000-0000-0000-000000000000', { accountIds: ['sub-configured'], accountId: 'sub-configured' });
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'aaaaaaaa-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_flip2' } })]));
  ok(attribCalls.length === 0 && ingest.observedOrgForRid('req_flip2') === 'sub-configured', 'observation agreeing with the attribution walk → nothing to report');
  // unknown org: stashed as unknown, no truth entry, no correction
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'ffffffff-9999-9999-9999-999999999999' }, 'user.email': { stringValue: 'nobody@nowhere.io' }, request_id: { stringValue: 'req_unknownorg' } })]));
  ok(ingest.observedOrgForRid('req_unknownorg') === undefined && attribCalls.length === 0, 'UNKNOWN org → no map entry, nothing written');
  ok(JSON.parse(fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n').pop()).acctKnown === false, 'unknown org still stashed (acctKnown:false — offline re-derivable)');
  // email fallback
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'bbbbbbbb-0000-0000-0000-000000000000' }, 'user.email': { stringValue: 'Mail@Example.com' }, request_id: { stringValue: 'req_mail' } })]));
  ok(ingest.observedOrgForRid('req_mail') === 'sub-mail', 'org unknown but roster email matches → email-fallback resolution');
  // ── review-caught cases (adversarial pass, 2.361.0) ──
  // ① '__global__' is a TRUTHY pseudo-id and may come FIRST in the group
  //    (live production shape on this machine) — resolveOrg must skip it.
  groups.set('org:cccccccc-0000-0000-0000-000000000000', { accountIds: ['__global__', 'sub-named'], accountId: null });
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'cccccccc-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_gmix' } })]));
  ok(ingest.observedOrgForRid('req_gmix') === 'sub-named', "'__global__'-first group resolves to the NAMED sub, never the pseudo-id");
  // ② global-ONLY org → truth null; a global session (walk null) must get NO
  //    bogus record of any kind.
  groups.set('org:dddddddd-0000-0000-0000-000000000000', { accountIds: ['__global__'], accountId: null });
  const before2 = attribCalls.length;
  curAcct = null;
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'dddddddd-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_gonly' } })]));
  ok(ingest.observedOrgForRid('req_gonly') === null && attribCalls.length === before2, 'global-only org → resolves to null, still nothing written');
  // ③ THE CANONICAL SEQUENCE, AND WHAT IT MEANS NOW (2026-09-07). agree →
  //    pool hot-switch → the CLI keeps REPORTING the old org. Until this date
  //    the third step wrote a corrective attribution record; the owner's
  //    post-mortem refuted the premise (organization.id = the identity cached
  //    at SPAWN, while the credential file IS re-read on the re-point's mtime
  //    bump), so the sequence now produces a COUNTED, LOGGED disagreement and
  //    zero writes. The scenario is kept verbatim — it is the record of a
  //    refuted rule, not dead weight.
  const orgT = 'eeeeeeee-0000-0000-0000-000000000000';
  groups.set('org:' + orgT, { accountIds: ['sub-A'], accountId: 'sub-A' });
  curAcct = 'sub-A'; // walk agrees with the observation — steady state
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_agree1' } })]));
  const afterAgree = attribCalls.length;
  ok(afterAgree === before2, 'agreement phase writes nothing');
  const disagreedBefore = ingest.stats().labelDiffers;
  curAcct = 'sub-B'; // pool hot-switch: the link (and the credentials) are B now
  curLastTs = T_MS + 60000;
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_stale1' } })]));
  ok(attribCalls.length === afterAgree, 'the headline scenario writes NOTHING — the walk (credential link) keeps the attribution');
  ok(ingest.stats().labelDiffers === disagreedBefore + 1, '…and the difference is COUNTED (stats().labelDiffers) — and NOT journalled: the label is machine-wide, so "≠ attributed" was the normal state of most rows and its log line read as proof of the opposite (lane-hot-switch)');
  const lastStash = () => JSON.parse(fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n').pop());
  ok(lastStash().attributed === 'sub-B' && lastStash().labelMatchesSlot === false, 'the stash row carries the walk\'s slot AND the label, so the rows stay analyzable offline', JSON.stringify(lastStash()));
  curAcct = 'sub-C'; // second switch while the CLI still reports A
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_stale2' } })]));
  ok(attribCalls.length === afterAgree && ingest.stats().labelDiffers === disagreedBefore + 2, 'a SECOND switch is counted too, and still writes nothing');
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: orgT }, request_id: { stringValue: 'req_stale3' } })]));
  ok(ingest.stats().labelDiffers === disagreedBefore + 3, 'every row whose label differs from its slot is counted (a count of rows, not of transitions: nothing is logged per row any more)');
  curAcct = 'sub-configured'; curLastTs = 0;
  // ④ observedOrgFor (B-b3cd) — RETIRED 2026-09-30 (lane-hot-switch): the
  // per-session "observed org" was the engine's corroboration query, and the
  // org is a machine-wide LABEL (scripts/fixtures/claude-cred-read-2.1.281.json)
  // — nothing may ask it which member a session is on.
  ok(typeof ingest.observedOrgFor === 'undefined', 'observedOrgFor is gone: no module can ask the label which member a session bills');
  // envFor honesty
  const env = ingest.envFor();
  ok(env.OTEL_EXPORTER_OTLP_ENDPOINT === 'http://127.0.0.1:0/otel' && env.OTEL_LOGS_EXPORTER === 'otlp' && env.OTEL_METRICS_EXPORTER === 'none' && env.CLAUDE_CODE_ENABLE_TELEMETRY === '1', 'envFor: loopback endpoint, logs-only export', JSON.stringify(env));
  settingVal = false;
  ok(ingest.envFor() === null, 'usage.otelTruth=false → no env injection (kill switch)');
  settingVal = undefined;
  // boot replay: a fresh instance over the same dataDir re-learns the truth map
  const ingest2 = require(REPO + '/src/server/otel-ingest.js').create({ dataDir: dir, PORT: 0, getUsageHistory: () => fakeUH, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
  ok(ingest2.observedOrgForRid('req_011TESTTRUTH000000000001') === 'sub-true', 'boot replay: stash → observation map survives restarts');
  ok(ingest2.envFor().OTEL_EXPORTER_OTLP_HEADERS === ingest.envFor().OTEL_EXPORTER_OTLP_HEADERS, 'token PERSISTED across boots (surviving sessions keep a valid truth stream)');
  // B-1319: THE REPLAY RUNS OFF THE LOOP — a fresh instance has read nothing when create() returns; its `replayed`
  // promise fills the map (no reader finished it); a stash over FILE_MAX is rewritten only when the trim drops a line,
  // and off the loop
  const mk3 = () => require(REPO + '/src/server/otel-ingest.js').create({ dataDir: dir, PORT: 0, getUsageHistory: () => fakeUH, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
  const ingest3 = mk3();
  ok(ingest3.stats().rids === 0 && typeof ingest3.replayed?.then === 'function', 'B-1319: create() reads no stash on the loop — the map is empty when it returns (the replay is a promise)');
  await ingest3.replayed;
  ok(ingest3.stats().rids > 0 && ingest3.observedOrgForRid('req_011TESTTRUTH000000000001') === 'sub-true', 'B-1319: …its replay fills the map by itself (stats, which never finishes it, sees the rows)');
  const stash3 = path.join(dir, 'usage-history', 'otel-truth.ndjson'), big = JSON.stringify({ rid: 'req_pad', ts: Date.now(), acct: 'sub-true', acctKnown: true, pad: 'p'.repeat(2000) }) + '\n';
  fs.appendFileSync(stash3, big.repeat(Math.ceil(12.2 * 1048576 / big.length)));
  const st0 = fs.statSync(stash3); await mk3().replayed; await new Promise((r) => setTimeout(r, 200));
  ok(fs.statSync(stash3).ino === st0.ino && fs.statSync(stash3).size === st0.size, 'B-1319: a 12 MB+ stash with nothing to trim is NOT rewritten (it used to be, whole, at every boot)');
  fs.appendFileSync(stash3, JSON.stringify({ rid: 'req_old', ts: Date.now() - 40 * 86400e3, acct: 'sub-true', acctKnown: true }) + '\n');
  await mk3().replayed; for (let k = 0; k < 50 && fs.statSync(stash3).ino === st0.ino; k++) await new Promise((r) => setTimeout(r, 50));
  ok(fs.statSync(stash3).ino !== st0.ino && !fs.readFileSync(stash3, 'utf8').includes('req_old') && fs.readFileSync(stash3, 'utf8').includes('req_011TESTTRUTH000000000001'), 'B-1319: …one past the 30-day horizon is trimmed — the rewrite lands off the loop (a new file renamed in), the fresh rows kept');

  // lane ci-351-reds — THE REPLAY IN TIME SLICES IS THE SAME REPLAY. Its 20 000-line slice took 31 ms on the measured boot
  // and the first one rode the listen tick (the read resolves in a poll-phase callback; ONE setImmediate from there stays
  // in that loop iteration). Now: a later turn first, then REPLAY_SLICE_MS slices. The ONE-PASS copy (the slice bound
  // cut) is the control. Two copies of one 12 MB+ stash (in-horizon rows, rows to trim, unknown-account rows, a blank and
  // a torn line): the same map, the same counts, the same rewritten bytes — and the sliced one hands the loop back.
  {
    const oisrc = fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8');
    const FIRST = "    await nextTurn();   // never on the tick the read resolved on\n", BOUND = 'replayTake(performance.now() + REPLAY_SLICE_MS)';
    ok(oisrc.split(FIRST).length === 2 && oisrc.split(BOUND).length === 2, 'SLICED REPLAY premise: the first hop and the time bound are each one site of the module');
    const OnePass = mutantCopies('otel-truth-slice', REPO).load('src/server/otel-ingest.js', oisrc.replace(FIRST, '').replace(BOUND, 'replayTake()'), 'one-pass');
    const now = Date.now(), rows = [];
    for (let k = 0; k < 90000; k++) {
      const old = k % 7 === 3, known = k % 5 !== 1;
      rows.push(JSON.stringify({ rid: `req_slice${String(k).padStart(6, '0')}`, ts: old ? now - 40 * 86400e3 : now - k * 1000, acct: known ? `sub-${k % 3}` : null, acctKnown: known, pad: 'q'.repeat(90) }));
      if (k === 4000) rows.push(''); if (k === 9000) rows.push('{"rid":"req_torn","ts":');
    }
    const body = rows.join('\n') + '\n';
    const mkDir = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-otel-slice-${tag}-`)); fs.mkdirSync(path.join(d, 'usage-history')); fs.writeFileSync(path.join(d, 'usage-history', 'otel-truth.ndjson'), body); return d; };
    const replayOn = async (mod, tag) => {
      const d = mkDir(tag), f = path.join(d, 'usage-history', 'otel-truth.ndjson'), ino = fs.statSync(f).ino;
      let last = performance.now(), maxGap = 0; const iv = setInterval(() => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }, 1);
      const oi = mod.create({ dataDir: d, PORT: 0, getUsageHistory: () => fakeUH, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
      await oi.replayed;
      await new Promise((r) => setTimeout(r, 5));
      clearInterval(iv);
      for (let k = 0; k < 100 && fs.statSync(f).ino === ino; k++) await new Promise((r) => setTimeout(r, 50));   // the trim's rewrite, off the loop
      const map = []; for (let k = 0; k < 90000; k += 97) map.push(oi.observedOrgForRid(`req_slice${String(k).padStart(6, '0')}`));
      const out = { stats: JSON.stringify(oi.stats()), map: JSON.stringify(map), bytes: fs.readFileSync(f, 'utf8'), rewritten: fs.statSync(f).ino !== ino, maxGap: Math.round(maxGap) };
      fs.rmSync(d, { recursive: true, force: true });
      return out;
    };
    const S = await replayOn(require(REPO + '/src/server/otel-ingest.js'), 's'), O = await replayOn(OnePass, 'o');
    ok(body.length > 12 * 1048576 && S.rewritten && O.rewritten && S.stats === O.stats && S.map === O.map && S.bytes === O.bytes && !S.bytes.includes('req_torn') && S.bytes.length < body.length,
      `SLICED REPLAY: the same observation map (${S.stats}), the same counts and the same trimmed stash, byte for byte (${(S.bytes.length / 1048576).toFixed(1)} of ${(body.length / 1048576).toFixed(1)} MB kept) as the one-pass replay`);
    ok(S.maxGap * 2 < O.maxGap, `SLICED REPLAY: it hands the loop back — its longest loop gap ${S.maxGap} ms vs ${O.maxGap} ms for the one-pass replay of the same stash`);
  }
  srv.close();
}

// ── 3. bake path: the seam still WORKS, but nothing is wired into it ──
// The override mechanism is exercised here with a synthetic lookup so the seam
// stays proven for a future per-request identity channel; the wiring pin in §4
// asserts that server.js hands it NOTHING (2026-09-07 — the only source we
// ever had names the SPAWN-time identity).
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
  await uh.scan(true);
  process.env.HOME = HOME0;
  const shards = fs.readdirSync(path.join(dataDir, 'usage-history')).filter((f) => f.startsWith('events-'));
  const evs = shards.flatMap((f) => fs.readFileSync(path.join(dataDir, 'usage-history', f), 'utf-8').trim().split('\n').map((l) => JSON.parse(l)));
  const ev = evs.find((e) => e.rid === 'req_bake1');
  ok(!!ev, 'scan baked the transcript event', JSON.stringify(shards));
  ok(ev && ev.acct === 'sub-true' && ev.atype === 'subscription', 'the setTruthLookup seam still overrides the walk at bake time when something IS wired into it', JSON.stringify(ev));
  ok(uh.attribAt(sid, Date.now()).acct === 'sub-configured', 'attribAt exposes the walk — and with NOTHING wired (production since 2026-09-07) the walk is what bakes');
  // negative control for the unwiring: same instance, no lookup ⇒ the walk wins
  const uh2 = new UsageHistory({ dataDir, homeDir: home, resolveAccount: () => null });
  ok(uh2._truthLookup == null, 'a fresh UsageHistory has NO override until someone wires one (the production shape)');
}

// ── 4. wiring pins (the 2.331.0 unstaged-wiring class) ──
{
  const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
  const wc = read('src/ws-create.js');
  { const H = require(path.join(REPO, 'src/harnesses'));
    ok(/!session\.host && SP\.otelExport && typeof otelEnv === 'function'/.test(wc) && H.ids().filter((id) => H.spawnOf(id).otelExport === true).join() === 'claude',
      'ws-create: OTEL env injection gated local-only on the declared spawn.otelExport row (claude alone declares it)'); }
  ok(read('src/ws-handler.js').includes("'otelEnv',"), 'ws contract carries otelEnv');
  ok(/p\.startsWith\('\/otel\/'\)/.test(read('src/auth.js')), 'auth middleware exempts /otel/ (module gate is the only door)');
  const sv = read('server.js');
  const oi0 = read('src/server/otel-ingest.js');
  ok(sv.includes('otelIngest.registerRoutes(app)') && sv.includes('otelEnv: otelIngest.envFor'), 'server.js wires routes + spawn env');
  // THE SOURCE PIN (2026-09-07): the observation may never key an attribution
  // again. A re-wire has to defeat this line on purpose.
  // Comments are ALLOWED to name the refuted wiring (the record must survive);
  // only executable lines are pinned, so strip line comments first.
  const code = (f) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/setTruthLookup\s*\(/.test(code('server.js')), 'server.js EXECUTES no setTruthLookup call at all — the OTel map may never key an attribution again (it names the SPAWN-time identity)');
  ok(!/\btruthLookup\b/.test(code('src/server/otel-ingest.js')) && /observedOrgForRid\(rid\)/.test(oi0), 'the ingest exports the map under a name that says what it is (observedOrgForRid), so a re-wire cannot be a copy-paste');
  const oi = read('src/server/otel-ingest.js');
  ok(/registerRoutes\(app\)\s*\{[\s\S]*?\/otel\/v1\/logs[\s\S]*?\/otel\/v1\/metrics[\s\S]*?\/otel\/v1\/traces/.test(oi), 'the module registers all three OTLP signals itself');
  // arrival counters (2.367.1): "the CLI exported nothing" and "we dropped what
  // it sent" must be distinguishable — the chat E2E's OTel check failed on
  // EVERY GitHub Actions push from 2.361.0 and there was no way to tell which.
  ok(oi.includes('arrivals.posts++') && oi.includes('arrivals.rejected++') && /stats\(\)\s*\{ return \{[^}]*\.\.\.arrivals/.test(oi), 'ingest counts posts/rejects/kept separately from truth rids');
  ok(oi.includes('arrivals.noRid++') && oi.includes('arrivals.noOrg++') && oi.includes('arrivals.stashed++'), 'and counts WHY a parsed record was dropped (a quiet truth channel was undiagnosable)');
  ok(oi.includes("app.get('/api/otel-stats'"), 'stats are readable over HTTP (the CI gate reads them to classify a miss)');
  ok(/this\._truthLookup \? this\._truthLookup\(ev\.rid\)/.test(read('src/usage-history.js')), 'the bake-time seam survives in usage-history (unwired, not deleted — a real per-request identity channel would be strictly better than the walk)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
