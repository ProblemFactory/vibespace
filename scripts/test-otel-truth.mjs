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
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

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
  // usage-cpu U4: the route answers at once, its stash lines owed to the store writer — the suite asks for them on disk before it reads
  const stashOnDisk = () => require(REPO + '/src/store-writer.js').storeWriter().durable(path.join(dir, 'usage-history', 'otel-truth.ndjson')).catch(() => false);
  const post0 = (payload, tok = token) => new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request({ host: '127.0.0.1', port, path: '/otel/v1/logs', method: 'POST', headers: { 'content-type': 'application/json', 'x-vibespace-otel': tok, 'content-length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.end(body);
  });
  const post = async (payload, tok) => { const r = await post0(payload, tok); await stashOnDisk(); return r; };

  ok((await post(PAYLOAD([REC()]), 'WRONG')).status === 403, 'bad token → 403 (the only gate — cookie middleware exempts /otel/)');
  const r1 = await post(PAYLOAD([REC()]));
  ok(r1.status === 200, 'valid ingest → 200', r1.body);
  ok((await ingest.observedOrgForRid('req_011TESTTRUTH000000000001')) === 'sub-true', 'rid → resolved observed org (DIAGNOSTIC since 2026-09-07 — the map is kept, it just decides nothing)');
  ok((await ingest.observedOrgForRid('req_unknown')) === undefined, 'no observation → undefined');
  ok(attribCalls.length === 0, 'REFUTED AND REMOVED: a mismatch writes NO corrective attribution record — organization.id is the identity the CLI cached at SPAWN, so the correction booked a hot-switched session\'s spend to the account it started on forever', JSON.stringify(attribCalls));
  ok(verdictOf((() => { const r0 = JSON.parse(fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n')[0]); return r0.labelMatchesSlot === false && !('agreed' in r0); })()), 'the stash row RECORDS the label beside the walk\'s slot (`labelMatchesSlot` — a coincidence metric; the old `agreed` read as identity) instead of acting on it');
  await post(PAYLOAD([REC()]));
  ok(attribCalls.length === 0, 'duplicate rid → still nothing written, no re-append');
  const stash = fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n');
  ok(stash.length === 1 && JSON.parse(stash[0]).acct === 'sub-true', 'stash has ONE observation line with resolved acct');
  // org flips back to the configured one → correction must RE-write
  groups.set('org:aaaaaaaa-0000-0000-0000-000000000000', { accountIds: ['sub-configured'], accountId: 'sub-configured' });
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'aaaaaaaa-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_flip2' } })]));
  ok(attribCalls.length === 0 && (await ingest.observedOrgForRid('req_flip2')) === 'sub-configured', 'observation agreeing with the attribution walk → nothing to report');
  // unknown org: stashed as unknown, no truth entry, no correction
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'ffffffff-9999-9999-9999-999999999999' }, 'user.email': { stringValue: 'nobody@nowhere.io' }, request_id: { stringValue: 'req_unknownorg' } })]));
  ok((await ingest.observedOrgForRid('req_unknownorg')) === undefined && attribCalls.length === 0, 'UNKNOWN org → no map entry, nothing written');
  ok(JSON.parse(fs.readFileSync(path.join(dir, 'usage-history', 'otel-truth.ndjson'), 'utf-8').trim().split('\n').pop()).acctKnown === false, 'unknown org still stashed (acctKnown:false — offline re-derivable)');
  // email fallback
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'bbbbbbbb-0000-0000-0000-000000000000' }, 'user.email': { stringValue: 'Mail@Example.com' }, request_id: { stringValue: 'req_mail' } })]));
  ok((await ingest.observedOrgForRid('req_mail')) === 'sub-mail', 'org unknown but roster email matches → email-fallback resolution');
  // ── review-caught cases (adversarial pass, 2.361.0) ──
  // ① '__global__' is a TRUTHY pseudo-id and may come FIRST in the group
  //    (live production shape on this machine) — resolveOrg must skip it.
  groups.set('org:cccccccc-0000-0000-0000-000000000000', { accountIds: ['__global__', 'sub-named'], accountId: null });
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'cccccccc-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_gmix' } })]));
  ok((await ingest.observedOrgForRid('req_gmix')) === 'sub-named', "'__global__'-first group resolves to the NAMED sub, never the pseudo-id");
  // ② global-ONLY org → truth null; a global session (walk null) must get NO
  //    bogus record of any kind.
  groups.set('org:dddddddd-0000-0000-0000-000000000000', { accountIds: ['__global__'], accountId: null });
  const before2 = attribCalls.length;
  curAcct = null;
  await post(PAYLOAD([REC({ 'organization.id': { stringValue: 'dddddddd-0000-0000-0000-000000000000' }, request_id: { stringValue: 'req_gonly' } })]));
  ok((await ingest.observedOrgForRid('req_gonly')) === null && attribCalls.length === before2, 'global-only org → resolves to null, still nothing written');
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
  ok((await ingest2.observedOrgForRid('req_011TESTTRUTH000000000001')) === 'sub-true', 'boot replay: stash → observation map survives restarts');
  ok(ingest2.envFor().OTEL_EXPORTER_OTLP_HEADERS === ingest.envFor().OTEL_EXPORTER_OTLP_HEADERS, 'token PERSISTED across boots (surviving sessions keep a valid truth stream)');
  // B-1319: THE REPLAY RUNS OFF THE LOOP — a fresh instance has read nothing when create() returns; its `replayed`
  // promise fills the map (no reader finished it); a stash over FILE_MAX is rewritten only when the trim drops a line,
  // and off the loop
  const mk3 = () => require(REPO + '/src/server/otel-ingest.js').create({ dataDir: dir, PORT: 0, getUsageHistory: () => fakeUH, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
  const ingest3 = mk3();
  ok(ingest3.stats().rids === 0 && typeof ingest3.replayed?.then === 'function', 'B-1319: create() reads no stash on the loop — the map is empty when it returns (the replay is a promise)');
  await ingest3.replayed;
  ok(ingest3.stats().rids > 0 && (await ingest3.observedOrgForRid('req_011TESTTRUTH000000000001')) === 'sub-true', 'B-1319: …its replay fills the map by itself (stats, which never finishes it, sees the rows)');
  const stash3 = path.join(dir, 'usage-history', 'otel-truth.ndjson'), big = JSON.stringify({ rid: 'req_pad', ts: Date.now(), acct: 'sub-true', acctKnown: true, pad: 'p'.repeat(2000) }) + '\n';
  const oldBig = JSON.stringify({ rid: 'req_oldpad', ts: Date.now() - 40 * 86400e3, acct: 'sub-true', acctKnown: true, pad: 'o'.repeat(2000) }) + '\n';
  // row B-360d: the stash past FILE_MAX — the posts' rows, ~6.2 MB of fresh rows and ~6.6 MB of rows past the 30-day horizon
  fs.appendFileSync(stash3, big.repeat(Math.ceil(6.2 * 1048576 / big.length)) + oldBig.repeat(Math.ceil(6.6 * 1048576 / oldBig.length)));
  const ledger3 = path.join(dir, 'migrations.json'), ran3 = JSON.stringify({ applied: { '2026-09-backfill-ledger-by-slot': Date.now() - 86400e3 } });
  const SWk = require(REPO + '/src/store-writer.js').storeWriter();
  /** one start over `dir`: whether a trim was owed to the writer, and what the ingest said */
  const start3 = async () => {
    const said = [], log0 = console.log, dzk = SWk.dirty; let owed = false;
    console.log = (...a) => { said.push(a.join(' ')); };
    SWk.dirty = function (f, o) { if (o && o.name === 'otel-truth.write') owed = true; return dzk.call(this, f, o); };   // a trim owed = a rewrite on its way
    try { await mk3().replayed; } finally { console.log = log0; SWk.dirty = dzk; }
    return { owed, said };
  };
  { // (1) THE KEEP RULE FOLLOWS THE STASH'S READERS (主开发 r738 Q1): the ledger backfill not recorded as run ⇒ kept WHOLE, said once
    const st1 = fs.statSync(stash3), k = await start3();
    ok(!k.owed && fs.statSync(stash3).ino === st1.ino && fs.statSync(stash3).size === st1.size && gateOf(fs.readFileSync(stash3, 'utf8').includes('req_oldpad')) && k.said.filter((l) => l.includes('kept WHOLE')).length === 1,
      'row B-360d: the ledger backfill migration NOT recorded as run ⇒ a stash with rows past the horizon is kept WHOLE (that migration reads every old row), said once', k.said.join(' | '));
  }
  // (2) recorded ⇒ the rows past the horizon, MORE than what it keeps, are trimmed by the stash's writer: a new file renamed in
  fs.writeFileSync(ledger3, ran3);
  const st0 = fs.statSync(stash3); await mk3().replayed; for (let k = 0; k < 50 && fs.statSync(stash3).ino === st0.ino; k++) await new Promise((r) => setTimeout(r, 50));
  ok(fs.statSync(stash3).ino !== st0.ino && !fs.readFileSync(stash3, 'utf8').includes('req_oldpad') && gateOf(fs.readFileSync(stash3, 'utf8').includes('req_011TESTTRUTH000000000001')) && verdictOf(fs.readFileSync(stash3, 'utf8').includes('req_pad')), 'B-1319 / B-360d: rows past the 30-day horizon — more than what it keeps — are trimmed by the stash\'s writer (a new file renamed in), the fresh rows kept');
  { // (3) THE THRESHOLD (主开发 r915 1; B-1319's «nothing to trim» is its case of 0): a 12 MB+ stash whose droppable rows are fewer than
    // what it keeps is NOT rewritten — a start then reads at most about twice the kept set, never a rewrite at every start
    fs.appendFileSync(stash3, big.repeat(Math.ceil(6.5 * 1048576 / big.length)) + JSON.stringify({ rid: 'req_old', ts: Date.now() - 40 * 86400e3, acct: 'sub-true', acctKnown: true }) + '\n');
    const st2 = fs.statSync(stash3), k = await start3();
    ok(st2.size > 12 * 1048576 && !k.owed && fs.statSync(stash3).ino === st2.ino && fs.statSync(stash3).size === st2.size && verdictOf(fs.readFileSync(stash3, 'utf8').includes('req_old"')), `B-1319 / B-360d: a ${st2.size}-byte stash with one row past the horizon (it would drop less than it keeps) is NOT rewritten`, k.said.join(' | '));
  }

  // lane ci-351-reds — THE REPLAY IN TIME SLICES IS THE SAME REPLAY. Its 20 000-line slice took 31 ms on the measured boot
  // and the first one rode the listen tick (the read resolves in a poll-phase callback; ONE setImmediate from there stays
  // in that loop iteration). Now (row B-360d): bounded reads through one descriptor (src/ndjson-lines.js), a turn after each,
  // then REPLAY_SLICE_MS slices. The ONE-PASS copy (one read of the whole file, no slice bound, no turn) is the control. Two copies of one 12 MB+ stash (in-horizon rows, rows to trim, unknown-account rows, a blank and
  // a torn line): the same map, the same counts, the same rewritten bytes — and the sliced one hands the loop back.
  {
    const oisrc = fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8');
    const ONE = 'const STASH_READ = { readBytes: READ_BYTES, maxLine: READ_BYTES, sliceMs: REPLAY_SLICE_MS, turn: nextTurn };';
    ok(oisrc.split(ONE).length === 2, 'SLICED REPLAY premise: the stash\'s read — its bound, its slices, its turns — is one site of the module');
    const OnePass = mutantCopies('otel-truth-slice', REPO).load('src/server/otel-ingest.js', editAnchor(oisrc, ONE, () => 'const STASH_READ = { readBytes: 64 * 1048576, maxLine: 64 * 1048576, sliceMs: Infinity, turn: () => Promise.resolve() };', "src/server/otel-ingest.js"), 'one-pass');   // B-0d3e: its anchor judged by name
    const now = Date.now(), rows = [];
    for (let k = 0; k < 90000; k++) {
      const old = k % 7 < 4, known = k % 5 !== 1;   // row B-360d: most of it past the horizon — the trim drops more than it keeps (the threshold, r915)
      rows.push(JSON.stringify({ rid: `req_slice${String(k).padStart(6, '0')}`, ts: old ? now - 40 * 86400e3 : now - k * 1000, acct: known ? `sub-${k % 3}` : null, acctKnown: known, pad: 'q'.repeat(90) }));
      if (k === 4000) rows.push(''); if (k === 9000) rows.push('{"rid":"req_torn","ts":');
    }
    const body = rows.join('\n') + '\n';
    const mkDir = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-otel-slice-${tag}-`)); fs.mkdirSync(path.join(d, 'usage-history')); fs.writeFileSync(path.join(d, 'usage-history', 'otel-truth.ndjson'), body); fs.writeFileSync(path.join(d, 'migrations.json'), JSON.stringify({ applied: { '2026-09-backfill-ledger-by-slot': now - 86400e3 } })); return d; };   // row B-360d: the migration recorded as run — the count rule trims
    const replayOn = async (mod, tag) => {
      const d = mkDir(tag), f = path.join(d, 'usage-history', 'otel-truth.ndjson'), ino = fs.statSync(f).ino;
      const realPerf = performance.now.bind(performance);
      let last = realPerf(), maxGap = 0; const iv = setInterval(() => { const t = realPerf(); maxGap = Math.max(maxGap, t - last); last = t; }, 1);
      // THE WORK LAW (B-0e1b): how many stash lines the replay PARSES in one loop turn — a count, never a clock (the old
      // `S.maxGap * 2 < O.maxGap` missed by 1 ms at load 1.8, 31 vs 60): every JSON.parse of a stash row is tallied under
      // the turn it ran in (a setImmediate chain counts the turns) — and THE SLICE CLOCK IS DRIVEN (the adversarial read: a
      // time-sliced replay on the real clock spreads its rows by the CPU's speed): performance.now advances one ms per read
      // while the replay runs (the replay reads it once per 256 rows), so every slice holds the same count on any box
      let turn = 0, spin = true; const perTurn = new Map(), parse = JSON.parse, savedNow = performance.now;
      let fake = realPerf(); performance.now = () => (fake += 1);
      const step = () => { turn++; if (spin) setImmediate(step); }; setImmediate(step);
      JSON.parse = function (t, ...a) { if (typeof t === 'string' && t.startsWith('{"rid":"req_slice')) perTurn.set(turn, (perTurn.get(turn) || 0) + 1); return parse.call(this, t, ...a); };
      let oi = null;
      try {
        oi = mod.create({ dataDir: d, PORT: 0, getUsageHistory: () => fakeUH, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
        await oi.replayed;
      } finally { JSON.parse = parse; performance.now = savedNow; spin = false; }
      await new Promise((r) => setTimeout(r, 5));
      clearInterval(iv);
      for (let k = 0; k < 100 && fs.statSync(f).ino === ino; k++) await new Promise((r) => setTimeout(r, 50));   // the trim's rewrite, off the loop
      const map = []; for (let k = 0; k < 90000; k += 97) map.push(await oi.observedOrgForRid(`req_slice${String(k).padStart(6, '0')}`));
      const out = { stats: JSON.stringify(oi.stats()), map: JSON.stringify(map), bytes: fs.readFileSync(f, 'utf8'), rewritten: fs.statSync(f).ino !== ino, maxGap: Math.round(maxGap), turns: perTurn.size, perTurnMax: Math.max(0, ...perTurn.values()), parsed: [...perTurn.values()].reduce((x, y) => x + y, 0) };
      fs.rmSync(d, { recursive: true, force: true });
      return out;
    };
    const S = await replayOn(require(REPO + '/src/server/otel-ingest.js'), 's'), O = await replayOn(OnePass, 'o');
    ok(body.length > 12 * 1048576 && gateOf(S.rewritten) && gateOf(O.rewritten) && S.stats === O.stats && S.map === O.map && S.bytes === O.bytes && !S.bytes.includes('req_torn') && S.bytes.length < body.length,
      `SLICED REPLAY: the same observation map (${S.stats}), the same counts and the same trimmed stash, byte for byte (${(S.bytes.length / 1048576).toFixed(1)} of ${(body.length / 1048576).toFixed(1)} MB kept) as the one-pass replay`);
    ok(S.parsed === 90000 && S.turns >= 4 && S.perTurnMax * 4 <= S.parsed && O.parsed === 90000 && O.turns === 1 && O.perTurnMax === O.parsed,
      `SLICED REPLAY: it hands the loop back — on the driven slice clock its 90 000 rows are parsed over ${S.turns} loop turns, at most ${S.perTurnMax} in one (≤ a quarter); the one-pass control parses all ${O.perTurnMax} in ONE turn (counted, not timed — the real loop gaps read ${S.maxGap} vs ${O.maxGap} ms)`, JSON.stringify({ S: { turns: S.turns, max: S.perTurnMax, parsed: S.parsed }, O: { turns: O.turns, max: O.perTurnMax, parsed: O.parsed } }));
  }
  // usage-cpu U4 — A POST NEVER FINISHES THE REPLAY IN ITS OWN TICK, AND WHAT WAITS IS ON DISK. The release's first OTLP post of
  // every boot read the whole stash (readFileSync) and parsed it on the loop (4.4 s held). Now a post that comes mid-replay
  // reads 0 stash bytes on the loop and WAITS behind the replay; meanwhile its records are in data/usage-history/
  // otel-truth.pending.ndjson (the store writer, written at once); once the map is whole it is taken in order (a duplicate of a
  // replayed row is not stashed again) and leaves the spill when its stash line is on disk. A hub that stops with a post
  // waiting: the next boot's replay takes the spilled record ONCE (a second boot adds nothing). Control: the release's
  // finishReplay() at the top of the ingest (planted) ⇒ the whole stash read on the loop.
  {
    const SW = require(REPO + '/src/store-writer.js').storeWriter();
    const { parseOtlpLogs } = require(REPO + '/src/otel-truth.js');
    const mod = require(REPO + '/src/server/otel-ingest.js'), now4 = Date.now();
    const mkDir4 = (tag, extra = '') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-otel-u4-${tag}-`)); fs.mkdirSync(path.join(d, 'usage-history')); const rows = []; for (let k = 0; k < 40000; k++) rows.push(JSON.stringify({ rid: `req_u4old${k}`, ts: now4 - k * 1000, acct: 'sub-true', acctKnown: true, pad: 'r'.repeat(90) })); fs.writeFileSync(path.join(d, 'usage-history', 'otel-truth.ndjson'), rows.join('\n') + '\n' + extra); return d; };
    const mk4 = (d, M = mod) => M.create({ dataDir: d, PORT: 0, getUsageHistory: () => fakeUH, identityGroups: () => groups, listAccounts: () => [], serverSetting: () => undefined });
    const stashOf = (d) => fs.readFileSync(path.join(d, 'usage-history', 'otel-truth.ndjson'), 'utf8');
    const spillOf = (d) => { try { return fs.readFileSync(path.join(d, 'usage-history', 'otel-truth.pending.ndjson'), 'utf8'); } catch { return null; } };
    const countIn = (t, rid) => t.split('\n').filter((l) => l.includes(`"rid":"${rid}"`)).length;
    const midPost = (oi, payload) => { let bytes = 0; const rf = fs.readFileSync; fs.readFileSync = function (p0, ...a) { const r = rf.call(this, p0, ...a); if (String(p0).includes('otel-truth')) bytes += r.length; return r; }; let out; try { out = oi._ingest(payload); } finally { fs.readFileSync = rf; } return { out, bytes }; };
    const spillBytes = [], dirty0 = SW.dirty;
    SW.dirty = function (f, o) { if (String(f).endsWith('otel-truth.pending.ndjson') && o && typeof o.produce === 'function') spillBytes.push({ text: String(o.produce()), rows: o4 ? o4.stats().rids : -1 }); return dirty0.call(this, f, o); };
    const settle = async (d, f, ok0) => { for (let k = 0; k < 200 && !ok0(); k++) { await new Promise((r) => setTimeout(r, 10)); await SW.durable(path.join(d, 'usage-history', f)).catch(() => false); } };
    let o4 = null; const d4 = mkDir4('a'); o4 = mk4(d4);
    const a = midPost(o4, PAYLOAD([REC({ request_id: { stringValue: 'req_u4new' } }), REC({ request_id: { stringValue: 'req_u4old39990' } })])); // a replayed rid near the stash's END: the post waits for the WHOLE replay
    ok(a.bytes === 0 && gateOf(a.out) && typeof a.out.then === 'function' && o4.stats().rids < 40000, `U4 a post mid-replay reads ${a.bytes} stash bytes on the loop and waits behind the replay (${o4.stats().rids} rows replayed when it came)`);
    for (let k = 0; k < 2000 && !spillBytes.length; k++) await new Promise((r) => setImmediate(r));
    SW.dirty = dirty0;
    const w0 = spillBytes[0] || { text: '', rows: -1 };
    ok(countIn(w0.text, 'req_u4new') === 1 && countIn(w0.text, 'req_u4old39990') === 1 && w0.rows < 40000, `U4 where it waits: both records are the bytes handed to the store writer for otel-truth.pending.ndjson (rank 0, written at once) while the replay runs (${w0.rows} rows replayed)`);
    const res4 = await a.out; await o4.replayed;
    await settle(d4, 'otel-truth.ndjson', () => countIn(stashOf(d4), 'req_u4new') === 1); await settle(d4, 'otel-truth.pending.ndjson', () => (spillOf(d4) || '') === '');
    ok(res4.kept === 2 && (await o4.observedOrgForRid('req_u4new')) === 'sub-true' && countIn(stashOf(d4), 'req_u4new') === 1 && countIn(stashOf(d4), 'req_u4old39990') === 1 && (spillOf(d4) || '') === '', `U4 after the replay the post is taken in order: the new rid stashed once, the replayed one (near the stash's end) NOT again (${countIn(stashOf(d4), 'req_u4old39990')} line), the spill empty`);
    // the stop: a spill a stopped hub left (its record not in the stash) — the next boot takes it once, a second boot adds nothing
    const rec5 = parseOtlpLogs(PAYLOAD([REC({ request_id: { stringValue: 'req_u4stop' } })])).records[0];
    const d5 = mkDir4('b'); fs.writeFileSync(path.join(d5, 'usage-history', 'otel-truth.pending.ndjson'), JSON.stringify(rec5) + '\n');
    const o5 = mk4(d5); await o5.replayed;
    await settle(d5, 'otel-truth.ndjson', () => countIn(stashOf(d5), 'req_u4stop') === 1); await settle(d5, 'otel-truth.pending.ndjson', () => (spillOf(d5) || '') === '');
    const once5 = countIn(stashOf(d5), 'req_u4stop'), spill5 = spillOf(d5);
    const o6 = mk4(d5); await o6.replayed; await new Promise((r) => setTimeout(r, 30)); await SW.durable(path.join(d5, 'usage-history', 'otel-truth.ndjson')).catch(() => false);
    ok((await o5.observedOrgForRid('req_u4stop')) === 'sub-true' && once5 === 1 && (spill5 || '') === '' && (await o6.observedOrgForRid('req_u4stop')) === 'sub-true' && countIn(stashOf(d5), 'req_u4stop') === 1, `U4 a hub that stopped with a post waiting: the next boot takes the spilled record ONCE (${once5} stash line), the spill empties, a second boot adds nothing (${countIn(stashOf(d5), 'req_u4stop')})`);
    { // a post that comes DURING the replay's slices (the buffer read, the map half filled) waits too — never a replay finished in its tick
      // (B-1217 member 14, 主开发 r464: red in whole fast-tier runs on the first test machine, «40000 of 40 000 rows replayed» — the post
      // came after the replay had ENDED, nothing was left to wait behind). THE RACE IS PLACED, never hoped: the replay runs over a copy of
      // the ingest with ONE seam — after a slice that did not end the stash, before its next turn, it waits on a hold this leg opens; the
      // post is sent while the replay is held between two slices, and the replay is released after. A setup line says the hold was reached
      const SEAM = 'const STASH_READ = { readBytes: READ_BYTES, maxLine: READ_BYTES, sliceMs: REPLAY_SLICE_MS, turn: nextTurn };';   // row B-360d: the replay's turns are the reader's
      const src8 = fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8');
      // (主开发 r584 — the candidate's box zone, Node 24: the CONTROL's first 20 ms slice read all 40 000 rows, so its replay never
      // entered the loop's body and never reached the hold; the leg's own slice had read 38399 of them in the same run) THE SEAM HOLDS AT
      // A ROW COUNT, never at the clock: while the hold is armed a slice is bounded by -Infinity, so it ends at its first check (255
      // lines) and the hold is reached after one slice on any machine — the leg and its control alike. (row B-360d: the reader reads
      // `sliceMs` ONCE, when the replay's read starts; the hold is armed before the copy starts, so every slice of that replay is
      // bounded so — 255 lines each; a turn after a READ, before any row, is not the hold: the hold waits for rows)
      const hold8 = src8.split(SEAM).length === 2 ? src8.replace(SEAM, () => 'const STASH_READ = { readBytes: READ_BYTES, maxLine: READ_BYTES, get sliceMs() { return globalThis.__u4SliceHold ? -Infinity : REPLAY_SLICE_MS; }, turn: async () => { const h = globalThis.__u4SliceHold && globalThis.__u4SliceHold(); if (h) await h; await nextTurn(); } };') : null;
      const sliced = async (src, tag) => {
        const M8 = mutantCopies(`otel-truth-u4-${tag}`, REPO).load('src/server/otel-ingest.js', src, tag);
        let o8 = null, reached = null, open = null; const gate = new Promise((r) => { open = r; });
        globalThis.__u4SliceHold = () => { if (reached) return null; const rids = o8 ? o8.stats().rids : -1; if (!(rids > 0)) return null; reached = { rids }; return gate; };   // a turn after a READ (no row yet) is not the hold: after a slice of rows
        const d8 = mkDir4(`e-${tag}`); o8 = mk4(d8, M8);
        for (let k = 0; k < 1000000 && !reached; k++) await new Promise((r) => setImmediate(r));   // the replay reaches its hold (bounded by a count of turns)
        const mid = o8.stats().rids, p8 = midPost(o8, PAYLOAD([REC({ request_id: { stringValue: `req_u4mid${tag}` } })]));
        const right = o8.stats().rids, waits = !!(p8.out && typeof p8.out.then === 'function');
        globalThis.__u4SliceHold = null; open();
        const out8 = await p8.out; await o8.replayed;
        const res = { reached, mid, right, bytes: p8.bytes, waits, kept: out8 && out8.kept, org: (await o8.observedOrgForRid(`req_u4mid${tag}`)) };
        try { SW.forget(path.join(d8, 'usage-history', 'otel-truth.ndjson')); SW.forget(path.join(d8, 'usage-history', 'otel-truth.pending.ndjson')); } catch { } fs.rmSync(d8, { recursive: true, force: true });
        return res;
      };
      const s8 = hold8 ? await sliced(hold8, 'hold') : null;
      ok(!!s8 && !!s8.reached && s8.reached.rids > 0 && s8.reached.rids < 40000, `U4 setup: the replay HELD between two slices (${s8 && s8.reached ? s8.reached.rids : 'never reached'} of 40 000 rows replayed) — a seam of the suite: a copy of the ingest whose replay, after a slice that did not end the stash, waits on this leg's hold`, JSON.stringify(s8));
      const mid = s8 ? s8.mid : -1, right = s8 ? s8.right : -1;
      ok(!!s8 && mid > 0 && mid < 40000 && right === mid && s8.bytes === 0 && gateOf(s8.waits) && s8.kept === 1 && s8.org === 'sub-true', `U4 a post during the replay's slices (${mid} of 40 000 rows replayed) waits: the map unmoved in its tick (${right}), 0 stash bytes read on the loop, taken after the replay`, JSON.stringify(s8));
      // CONTROL, red for its own reason: the same placed race over a copy whose post is TAKEN AT ONCE over the half-replayed map (row
      // B-360d: the release's finishReplay — the road that finished the replay in the post's tick — is removed) — the map moves in
      // the post's tick and the post does not wait
      const FIN = '    if (replay.done) return take(records, seen);';
      const c8 = hold8 && hold8.split(FIN).length === 2 ? await sliced(hold8.replace(FIN, () => '    return take(records, seen);'), 'fin') : null;
      ok(!!c8 && !!c8.reached && c8.reached.rids > 0 && c8.reached.rids < 40000, `CONTROL setup: the copy's replay HELD between two slices too (${c8 && c8.reached ? c8.reached.rids : 'never reached'} of 40 000 rows replayed) — the same seam as the leg`, JSON.stringify(c8));
      ok(!!c8 && !!c8.reached && c8.mid > 0 && c8.mid < 40000 && c8.right > c8.mid && !c8.waits, `CONTROL: the same placed race over a copy whose post is taken at once over the half-replayed map — the map moved in the post's tick (${c8 && c8.mid} → ${c8 && c8.right}) and it did not wait ⇒ RED`, JSON.stringify(c8));
    }
    { // a write the writer never confirmed (its thread restarted and asked again) is OFFERED AGAIN, on a new line
      const d9 = mkDir4('f'), o9 = mk4(d9); await o9.replayed;
      let prod = null; const dz = SW.dirty; SW.dirty = function (f, o) { if (String(f).endsWith('otel-truth.ndjson') && o && typeof o.produce === 'function') prod = o.produce; return dz.call(this, f, o); };
      try { o9._ingest(PAYLOAD([REC({ request_id: { stringValue: 'req_u4again' } })])); } finally { SW.dirty = dz; }
      const first = prod && prod(), second = prod && prod(); // no onWritten between them: the writer never confirmed the first
      ok(gateOf(first) && gateOf(second) && countIn(String(first.append), 'req_u4again') === 1 && countIn(String(second.append), 'req_u4again') === 1 && verdictOf(String(second.append).startsWith('\n')), 'U4 a stash write the writer never confirmed is offered again (on a new line: a torn tail never glues the next row to it)');
      try { await SW.durable(path.join(d9, 'usage-history', 'otel-truth.ndjson')); SW.forget(path.join(d9, 'usage-history', 'otel-truth.ndjson')); SW.forget(path.join(d9, 'usage-history', 'otel-truth.pending.ndjson')); } catch { } fs.rmSync(d9, { recursive: true, force: true });
    }
    { // a stop between the stash append and the spill's rewrite: the record is in BOTH — the next boot stashes it no second time
      const rec10 = parseOtlpLogs(PAYLOAD([REC({ request_id: { stringValue: 'req_u4both' } })])).records[0];
      const d10 = mkDir4('g', JSON.stringify({ ...rec10, acct: 'sub-true', acctKnown: true }) + '\n'); fs.writeFileSync(path.join(d10, 'usage-history', 'otel-truth.pending.ndjson'), JSON.stringify(rec10) + '\n');
      const o10 = mk4(d10); await o10.replayed; await settle(d10, 'otel-truth.pending.ndjson', () => (spillOf(d10) || '') === '');
      ok(countIn(stashOf(d10), 'req_u4both') === 1 && (spillOf(d10) || '') === '' && (await o10.observedOrgForRid('req_u4both')) === 'sub-true', `U4 a record in the stash AND the spill (a stop between the two writes) is stashed no second time (${countIn(stashOf(d10), 'req_u4both')} line); the spill empties`);
      try { SW.forget(path.join(d10, 'usage-history', 'otel-truth.ndjson')); SW.forget(path.join(d10, 'usage-history', 'otel-truth.pending.ndjson')); } catch { } fs.rmSync(d10, { recursive: true, force: true });
    }
    { // the chain's cure (as if a must): THE STASH IS ON DISK BEFORE ITS ANSWER — the post's lines by the store writer's urgent road,
      // the wait bounded; a write that did not land in time answers 503 «retry» and the resend is stashed once. RED: acad2351a's
      // answer at once ⇒ the 200 went out with its line NOT on disk (a kill there loses a row the exporter never resends)
      const callLogs = (oi, d, rid) => new Promise((resolve) => {
        const tok = oi.envFor().OTEL_EXPORTER_OTLP_HEADERS.split('=')[1];
        const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-vibespace-otel': tok }, body: PAYLOAD([REC({ request_id: { stringValue: rid } })]) };
        const res = { code: 200, hdr: {}, status(x) { this.code = x; return this; }, set(k, val) { this.hdr[k] = val; return this; }, json(b) { resolve({ code: this.code, retryAfter: this.hdr['Retry-After'] || null, body: b, onDisk: countIn(stashOf(d), rid) }); return this; } };
        Promise.resolve(oi.logs(req, res)).catch((e) => resolve({ err: String(e) }));
      });
      const dH = mkDir4('h'), oH = mk4(dH); await oH.replayed;
      const g1 = await callLogs(oH, dH, 'req_cure_disk');                 // the answer comes with its line on disk
      const realDurable = SW.durable; SW.durable = () => Promise.resolve(false);   // the writer's queue past the bound
      let g2 = null; try { g2 = await callLogs(oH, dH, 'req_cure_late'); } finally { SW.durable = realDurable; }
      const g3 = await callLogs(oH, dH, 'req_cure_late');                 // the exporter sends it again: a duplicate, its owed line lands, ONE line
      // its TAKEN verdict: a FAILING storage (the writer's back-off can outlast the exporter's ~10 s of retries) answers 200 — every
      // record is already held and owed; a QUEUE answers 503. RED: the cure before the split ⇒ a 503 the exporter would drop the batch on
      const realWhy = SW.whyNotDurable; SW.durable = () => Promise.resolve(false); SW.whyNotDurable = () => ({ why: 'failed', code: 'EIO' });
      let g4 = null, g4red = null;
      const SPLIT = "        if (!onDisk && !(why && why.why === 'failed')) return res.status(503)";
      const srcS = fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8');
      const RS = mutantCopies('otel-truth-cure-split', REPO).load('src/server/otel-ingest.js', editAnchor(srcS, SPLIT, () => "        if (!onDisk) return res.status(503)", "src/server/otel-ingest.js"), 'no-split');   // stale-pins: kept (2b202b257's door, planted back as the RED control)
      const dS = mkDir4('j'), oS = mk4(dS, RS); await oS.replayed;
      try { g4 = await callLogs(oH, dH, 'req_cure_failing'); g4red = await callLogs(oS, dS, 'req_cure_failing_red'); } finally { SW.durable = realDurable; SW.whyNotDurable = realWhy; }
      ok(srcS.split(SPLIT).length === 2 && gateOf(g4) && g4.code === 200 && (await oH.observedOrgForRid('req_cure_failing')) === 'sub-true' && gateOf(g4red) && g4red.code === 503,
        `a FAILING storage (its back-off past the exporter's retries): the post answered 200, its record held (${g4 && g4.code}); RED (no split): ${g4red && g4red.code} — the exporter would drop a batch the hub already holds`, { g4, g4red });
      try { await SW.durable(path.join(dS, 'usage-history', 'otel-truth.ndjson')).catch(() => false); SW.forget(path.join(dS, 'usage-history', 'otel-truth.ndjson')); SW.forget(path.join(dS, 'usage-history', 'otel-truth.pending.ndjson')); } catch { } fs.rmSync(dS, { recursive: true, force: true });
      const srcC = fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8'), WAIT = "      if (stashOwed.length || stashWriting) {\n";
      const RC = mutantCopies('otel-truth-cure', REPO).load('src/server/otel-ingest.js', editAnchor(srcC, WAIT, () => "      if (false) {\n", "src/server/otel-ingest.js"), 'answer-at-once');
      const dR = mkDir4('i'), oR = mk4(dR, RC); await oR.replayed;
      const r1 = await callLogs(oR, dR, 'req_cure_red');
      ok(srcC.split(WAIT).length === 2 && g1.code === 200 && g1.onDisk === 1 && gateOf(g2) && g2.code === 503 && g2.retryAfter === '1' && gateOf(/again/.test(String(g2.body && g2.body.error))) && g3.code === 200 && g3.onDisk === 1,
        `the stash is on disk BEFORE the answer: a post's 200 came with its line written (${g1.onDisk}); a write past the bound answers 503 «retry» (${g2 && g2.code}), and the resend comes back 200 with the row stashed ONCE (${g3.onDisk})`, { g1, g2, g3 });
      ok(r1.code === 200 && r1.onDisk === 0, `RED CONTROL (acad2351a: the answer at once): the 200 went out with its line not on disk (${r1.onDisk}) — a kill there loses a row the exporter never sends again`, r1);
      for (const d of [dH, dR]) { try { await SW.durable(path.join(d, 'usage-history', 'otel-truth.ndjson')).catch(() => false); SW.forget(path.join(d, 'usage-history', 'otel-truth.ndjson')); SW.forget(path.join(d, 'usage-history', 'otel-truth.pending.ndjson')); } catch { } fs.rmSync(d, { recursive: true, force: true }); }
    }
    const src4 = fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8');
    const rel4 = editAnchor(src4, '    if (replay.done) return take(records, seen);', () => '    if (!replay.done) { try { fs.readFileSync(file); } catch { } }\n    if (replay.done) return take(records, seen);', "src/server/otel-ingest.js");   // row B-360d: the release's road (a whole read of the stash in the post's tick) planted back
    const R4 = mutantCopies('otel-truth-u4', REPO).load('src/server/otel-ingest.js', rel4, 'sync-finish');
    const d7 = mkDir4('c'), c7 = midPost(mk4(d7, R4), PAYLOAD([REC({ request_id: { stringValue: 'req_u4ctl' } })]));
    ok(rel4 !== src4 && c7.bytes > 1048576, `control (the release's whole read of the stash in a post's tick, planted back): the post read ${(c7.bytes / 1048576).toFixed(1)} MB of the stash on the loop ⇒ RED`);
    for (const d of [d4, d5, d7]) { try { SW.forget(path.join(d, 'usage-history', 'otel-truth.ndjson')); SW.forget(path.join(d, 'usage-history', 'otel-truth.pending.ndjson')); } catch { } fs.rmSync(d, { recursive: true, force: true }); }
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
  ok(gateOf(ev) && ev.acct === 'sub-true' && ev.atype === 'subscription', 'the setTruthLookup seam still overrides the walk at bake time when something IS wired into it', JSON.stringify(ev));
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
    ok(gateOf(/!session\.host && SP\.otelExport && typeof otelEnv === 'function'/.test(wc)) && H.ids().filter((id) => H.spawnOf(id).otelExport === true).join() === 'claude',
      'ws-create: OTEL env injection gated local-only on the declared spawn.otelExport row (claude alone declares it)'); }
  ok(verdictOf(read('src/ws-handler.js').includes("'otelEnv',")), 'ws contract carries otelEnv');
  ok(verdictOf(/p\.startsWith\('\/otel\/'\)/.test(read('src/door.js'))), 'the door class (src/door.js, lifted out of the auth middleware by B3a) exempts /otel/ (module gate is the only door)');
  const sv = read('server.js');
  const oi0 = read('src/server/otel-ingest.js');
  ok(gateOf(sv.includes('otelIngest.registerRoutes(app)')) && verdictOf(sv.includes('otelEnv: otelIngest.envFor')), 'server.js wires routes + spawn env');
  // THE SOURCE PIN (2026-09-07): the observation may never key an attribution
  // again. A re-wire has to defeat this line on purpose.
  // Comments are ALLOWED to name the refuted wiring (the record must survive);
  // only executable lines are pinned, so strip line comments first.
  const code = (f) => read(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/setTruthLookup\s*\(/.test(code('server.js')), 'server.js EXECUTES no setTruthLookup call at all — the OTel map may never key an attribution again (it names the SPAWN-time identity)');
  ok(!/\btruthLookup\b/.test(code('src/server/otel-ingest.js')) && verdictOf(/observedOrgForRid\(rid\)/.test(oi0)), 'the ingest exports the map under a name that says what it is (observedOrgForRid), so a re-wire cannot be a copy-paste');
  { // row B-360d (moved from the heavy test-otel-replay-slices, r915's round): the source census, on every build
    const strip = (t) => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/(^|\s)\/\/.*$/, '$1'))).join('\n');
    const SYNC = /\bfs\.(?:readFileSync|readSync|existsSync|statSync|renameSync)\(\s*file\b|\bfinishReplay\b/g;
    const cur = strip(fs.readFileSync(path.join(REPO, 'src/server/otel-ingest.js'), 'utf8')), rel = strip(fs.readFileSync(path.join(REPO, 'scripts/fixtures/otel-replay/otel-ingest-944de13f9.js.frozen'), 'utf8'));
    ok(!(cur.match(SYNC) || []).length && (rel.match(SYNC) || []).length >= 4, `row B-360d: no synchronous read of the stash left in the ingest (the release frozen beside it had ${(rel.match(SYNC) || []).length}: finishReplay, its existsSync + readFileSync, the trim's statSync + renameSync)`, cur.match(SYNC));
    const ID = '2026-09-backfill-ledger-by-slot', MIG = fs.readFileSync(path.join(REPO, 'src/server/migrations.js'), 'utf8'), at = MIG.indexOf(`id: '${ID}'`), row = at < 0 ? '' : MIG.slice(at, MIG.indexOf('const pass = backfillLedgerBySlot(', at) + 1);   // the call is `const pass =` since line 828's follow (r4125: a pass may be stepped)
    ok(at > 0 && row.length > 1 && !/\btry\s*\{/.test(row.slice(row.indexOf('run() {'))) && verdictOf(cur.includes(`const BACKFILL_ID = '${ID}';`)), 'row B-360d: the hub\'s backfill row runs the backfill with no catch of its own (a failed read reaches the runner), and the ingest\'s keep rule names that migration');
  }
  const oi = read('src/server/otel-ingest.js');
  ok(verdictOf(/registerRoutes\(app\)\s*\{[\s\S]*?\/otel\/v1\/logs[\s\S]*?\/otel\/v1\/metrics[\s\S]*?\/otel\/v1\/traces/.test(oi)), 'the module registers all three OTLP signals itself');
  // arrival counters (2.367.1): "the CLI exported nothing" and "we dropped what
  // it sent" must be distinguishable — the chat E2E's OTel check failed on
  // EVERY GitHub Actions push from 2.361.0 and there was no way to tell which.
  ok(gateOf(oi.includes('arrivals.posts++')) && gateOf(oi.includes('arrivals.rejected++')) && verdictOf(/stats\(\)\s*\{ return \{[^}]*\.\.\.arrivals/.test(oi)), 'ingest counts posts/rejects/kept separately from truth rids');
  ok(gateOf(oi.includes('arrivals.noRid++')) && gateOf(oi.includes('arrivals.noOrg++')) && verdictOf(oi.includes('arrivals.stashed++')), 'and counts WHY a parsed record was dropped (a quiet truth channel was undiagnosable)');
  ok(verdictOf(oi.includes("app.get('/api/otel-stats'")), 'stats are readable over HTTP (the CI gate reads them to classify a miss)');
  ok(verdictOf(/this\._truthLookup \? this\._truthLookup\(ev\.rid\)/.test(read('src/usage-history.js'))), 'the bake-time seam survives in usage-history (unwired, not deleted — a real per-request identity channel would be strictly better than the walk)');
}

// ── 5. the writer's thread: the stash's trim (rewriteJob) keeps B-f276 1b's laws (主开发 r1939, round w5daqaxxs) ──
// (1) a temp whose removal FAILED after an exclusive write's link is a SECOND NAME of the store: the rewrite road refuses it before
// its only open of it (ETEMPLINKED), the store whole; (2) the append road's first sweep of a file is handed the road's OWN temp, as the
// whole write's and the rewrite's are (the sweep runs once a file: an append first marked it swept and left an earlier life's temp)
{
  const WSRC = fs.readFileSync(path.join(REPO, 'src/store-writer-worker.js'), 'utf8');
  const wkRun = (WK, tag) => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-otel-wk-${tag}-`)), out = {};
    try {
      const f = path.join(d, 'otel-truth.ndjson'), tmp = f + '.tmp-1-w', BODY = 'a1\nb22\n';
      let fails = 2;   // the temp's removal after the link fails, and so does the rewrite road's try at it
      const F = Object.assign(Object.create(fs), { unlinkSync: (p) => { if (p === tmp && fails > 0) { fails--; throw Object.assign(new Error('EIO'), { code: 'EIO' }); } return fs.unlinkSync(p); } });
      try { WK.writeJob({ file: f, tmp, parts: [BODY], exclusive: true }, F); out.first = 'written'; } catch (e) { out.first = (e && e.code) || 'threw'; }
      try { out.linked = fs.statSync(tmp).ino === fs.statSync(f).ino; } catch { out.linked = false; }
      try { WK.writeJob({ file: f, tmp, parts: ['c3\n'], rewrite: { ranges: Float64Array.from([0, 3]), size: BODY.length } }, F); out.rewrite = 'no-throw'; } catch (e) { out.rewrite = (e && e.code) || 'threw'; }
      try { fs.unlinkSync(tmp); } catch { }
      out.whole = fs.readFileSync(f, 'utf8') === BODY;
      const g = path.join(d, 'ap.ndjson'), own = `${g}.tmp-${process.pid}-w`;
      fs.writeFileSync(g, 'x\n'); fs.writeFileSync(own, 'left by an earlier life of this thread');
      WK.writeJob({ file: g, tmp: own, parts: ['y\n'], append: true }, fs);
      out.ownGone = !fs.existsSync(own); out.appended = fs.readFileSync(g, 'utf8') === 'x\ny\n';
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
    return out;
  };
  const head = wkRun(require(path.join(REPO, 'src/store-writer-worker.js')), 'head');
  ok(head.first === 'written' && gateOf(head.linked) && head.rewrite === 'ETEMPLINKED' && verdictOf(head.whole), 'the stash\'s trim refuses a temp that is still a second name of the store (its removal failed after an exclusive write\'s link): ETEMPLINKED, the store whole', JSON.stringify(head));
  ok(gateOf(head.ownGone) && verdictOf(head.appended), 'an append store\'s first append in a thread\'s life removes the road\'s OWN temp an earlier life of the thread left (the sweep is handed it)', JSON.stringify(head));
  const cutR = editAnchor(WSRC, "  if (LINKED.has(m.tmp) && !dropTemp(fs, m.tmp)) {   // B-f276 1b's law on the rewrite road too", "  if (false) {   // B-f276 1b's law on the rewrite road too", 'src/store-writer-worker.js');
  const cutA = editAnchor(WSRC, "    sweepTemps(fs, m.file, m.tmp);   // row B-360d", "    sweepTemps(fs, m.file);   // row B-360d", 'src/store-writer-worker.js');   // stale-pins: kept — the line before 主开发 r1939 (2), planted back as the RED control
  const r = wkRun(mutantCopies('otel-truth-wk-linked', REPO).load('src/store-writer-worker.js', cutR, 'rewrite-opens-second-name'), 'cut-r');
  const a = wkRun(mutantCopies('otel-truth-wk-sweep', REPO).load('src/store-writer-worker.js', cutA, 'append-sweep-no-own'), 'cut-a');
  ok(gateOf(r.linked) && r.rewrite !== 'ETEMPLINKED' && !r.whole, `CONTROL (the rewrite road's check cut): the trim opens the second name for a write and truncates the live store through the shared inode (${r.rewrite}) — red`, JSON.stringify(r));
  ok(gateOf(a.appended) && !a.ownGone, 'CONTROL (the append road\'s sweep not handed its own temp, the moved form\'s line): the earlier life\'s temp stays — red', JSON.stringify(a));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
