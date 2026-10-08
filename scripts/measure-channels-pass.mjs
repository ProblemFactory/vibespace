#!/usr/bin/env node
// MEASURE (not a test) — lane scheduler-census-index (B-7978, 2026-10-07): what ONE channels pass costs on the owner's
// scale — 90 298 conversations (4 mail accounts behind an AUTHORITATIVE change feed, the Gmail shape, + 2 tier accounts:
// the Lark / Slack share) over scripted adapters that talk to nothing, an injected clock moved 5 s per round (one pace
// window of the scheduler card's census, CENSUS_EVERY_MS), 50 rounds × 6 account passes. Each pass ends in its broadcast
// (notify → digest → adapterView → schedulerView → the census of EVERY account).
//   wall per pass (median / mean / p95) and THE CENSUS'S SHARE = the same run on an engine copy whose schedulerView
//   reads no clock census (its counts zero) — real minus copy, over real.
// Usage: node scripts/measure-channels-pass.mjs [--repo <tree>] [--rows 90298] [--rounds 50] [--json]
//   --repo: the tree whose engine is measured (the base, for BEFORE); the fixture helpers come from this script's tree.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
const require = createRequire(import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const REPO = path.resolve(arg('--repo', new URL('..', import.meta.url).pathname));
const ROWS = Number(arg('--rows', 90298)), ROUNDS = Number(arg('--rounds', 50)), JSON_OUT = process.argv.includes('--json');
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const { makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const CENSUS_LINE = '    const c = clockCensus(rec, t);\n';
const SRC = engineSource(REPO);
if (!SRC.includes(CENSUS_LINE)) throw new Error('needle gone: schedulerView\'s clock census line');
const M = mutantCopies('measure-pass', REPO);
const NOCENSUS = M.load('src/server/channels-engine.js', SRC.replace(CENSUS_LINE, '    const c = { hot: 0, warm: 0, cold: 0, due: 0 };\n'), 'no-census');
const ROOT = scratch('measure-pass');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const quiet = { log() {}, warn() {}, error() {} };
const MIN = 60e3, DAY = 86400e3;
const HISTORY_DECL = Object.freeze({ via: 'history', authority: 'authoritative', scope: null, pagesPerPass: 1, perMin: 60 });
// the owner's instance (2026-10-06): 4 Gmail accounts + Lark + Slack — the mail accounts carry the rows
const share = [0.244, 0.244, 0.244, 0.243, 0.0166, 0.0084];
const ACCOUNTS = share.map((s, i) => ({ id: i < 4 ? `mail${i}` : i === 4 ? 'chat' : 'team', feed: i < 4, n: 0, s }));
{ let left = ROWS; ACCOUNTS.forEach((a, i) => { a.n = i === ACCOUNTS.length - 1 ? left : Math.round(ROWS * a.s); left -= a.n; }); }
function world(a, t0) {
  // lastAt spread over 4 days (a stable stride) — ~1 % hot, ~25 % warm, the rest cold; tiers cross while the run goes
  const ids = Array.from({ length: a.n }, (_, i) => `${a.id}-${String(i).padStart(6, '0')}`);
  const lastAt = new Map(ids.map((id, i) => [id, t0 - ((i * 7919) % (4 * DAY / MIN)) * MIN - 1000]));
  return { ids, lastAt, changed: new Set(), calls: { list: 0, history: 0, changes: 0 } };
}
function module(kind, worlds, feed) {
  return {
    kind,
    caps: { ...fake.fakePoll.caps, receive: 'poll', pollInterval: { hot: 30, cold: 300, floor: 10 }, budget: { unit: 'request', default: 1e9, settingKey: null, metered: true }, ...(feed ? { changeFeed: HISTORY_DECL } : {}) },
    create(record, deps) {
      const W = worlds[record.id], meter = deps.meter || (() => {}), pace = deps.pace || (async () => {});
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations({ cursor = null, limit = 100 } = {}) {
          await pace(1); meter(1); W.calls.list++;
          const from = cursor ? Number(cursor) : 0, page = W.ids.slice(from, from + limit);
          return { conversations: page.map((id) => makeConversation({ id, vendorId: id, title: id, kind: 'group', participants: 'Ada, Brook', lastAt: W.lastAt.get(id) })), cursor: from + limit < W.ids.length ? String(from + limit) : null };
        },
        async convCaps() { meter(1); return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id, { anchor = null } = {}) { await pace(1); meter(1); W.calls.history++; return { records: [], anchor, reachedAnchor: true, complete: true }; },
        async older() { meter(1); return { records: [], exhausted: true }; },
        async fetchAttachment() { throw new CH.ChannelError('not-found', 'none'); },
        changes: feed ? async () => { meter(2); W.calls.changes++; const ids = [...W.changed]; W.changed = new Set(); return { changed: ids, conversations: [], mustWalk: false }; } : undefined,
      };
    },
  };
}
async function run(mod, label) {
  let clock = Date.UTC(2026, 9, 7, 12, 0, 0);
  const now = () => clock;
  const worlds = Object.fromEntries(ACCOUNTS.map((a) => [a.id, world(a, clock)]));
  const dir = path.join(ROOT, label);
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: ACCOUNTS.map((a) => ({ id: a.id, kind: a.feed ? 'mailx' : 'chatx', label: a.id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0 })) }));
  const reg = CH.createChannelRegistry();
  reg.register(module('mailx', worlds, true)); reg.register(module('chatx', worlds, false));
  let broadcasts = 0;
  const eng = mod.create({ dataDir: dir, registry: reg, env: {}, now, broadcast: () => { broadcasts++; }, serverSetting: () => undefined, liveSessions: () => [], deliver: null, log: quiet });
  try {
    const s0 = performance.now();
    for (let i = 0; i < 12; i++) { clock += 1000; for (const a of ACCOUNTS) await eng.pass(a.id); if (Object.keys(eng.store.index.live()).length >= ROWS) break; }
    for (let i = 0; i < 3; i++) { clock += 1000; for (const a of ACCOUNTS) await eng.pass(a.id); }   // the tier accounts' first reads settle
    // ONE warm-up round, not counted: the census after discovery's mass write (the index's one O(rows) build — a boot's)
    clock += 5000; let warmMs = performance.now(); for (const a of ACCOUNTS) await eng.pass(a.id); warmMs = performance.now() - warmMs;
    const st0 = typeof eng.censusIndexStats === 'function' ? eng.censusIndexStats() : null;
    const setupMs = performance.now() - s0;
    const rows = Object.keys(eng.store.index.live()).length;
    const walls = [], rounds = [];
    let k = 0;
    for (let r = 0; r < ROUNDS; r++) {
      clock += 5000;
      for (const a of ACCOUNTS) if (a.feed) { const W = worlds[a.id]; for (let j = 0; j < 5; j++) W.changed.add(W.ids[(k++ * 104729) % W.ids.length]); }
      let sum = 0;
      for (const a of ACCOUNTS) { const t0 = performance.now(); await eng.pass(a.id); const ms = performance.now() - t0; walls.push(ms); sum += ms; }
      rounds.push(sum);
    }
    const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
    const st1 = st0 ? eng.censusIndexStats() : null;
    const stats = st1 ? { builds: st1.builds - st0.builds, rejudged: st1.rejudged - st0.rejudged, rowsReadPerRound: Math.round((st1.rowsRead - st0.rowsRead) / ROUNDS), lastBuildMs: st1.lastBuildMs } : null;
    return { label, rows, setupMs: Math.round(setupMs), passes: walls.length, median: q(walls, 0.5), mean: mean(walls), p95: q(walls, 0.95), max: Math.max(...walls), round: mean(rounds), rounds, warmMs, broadcasts, stats };
  } finally { eng.stop(); }
}
const real = await run(ENG, 'real');
const off = await run(NOCENSUS, 'no-census');
const f = (x) => x.toFixed(1);
const out = { repo: REPO, rows: real.rows, rounds: ROUNDS, passMedianMs: +f(real.median), passMeanMs: +f(real.mean), passP95Ms: +f(real.p95), passMaxMs: +f(real.max), warmRoundMs: +f(real.warmMs), roundMs: +f(real.round), noCensusMeanMs: +f(off.mean), censusShare: +((real.mean - off.mean) / real.mean).toFixed(3), stats: real.stats, setupMs: real.setupMs };
if (JSON_OUT) console.log(JSON.stringify(out));
else {
  console.log(`${REPO}: ${real.rows} rows (${ACCOUNTS.map((a) => `${a.id} ${a.n}`).join(' · ')}), ${ROUNDS} rounds × ${ACCOUNTS.length} passes, the clock +5 s a round`);
  console.log(`  the warm-up round (not counted): ${f(real.warmMs)} ms`);
  console.log(`  a pass: median ${f(real.median)} ms · mean ${f(real.mean)} ms · p95 ${f(real.p95)} ms · max ${f(real.max)} ms · a round (6 passes) ${f(real.round)} ms`);
  console.log(`  the same run without the clock census: mean ${f(off.mean)} ms ⇒ the census's share ${(100 * out.censusShare).toFixed(0)} %`);
  if (process.argv.includes('--rounds-each')) console.log(`  each round: ${real.rounds.map((x) => x.toFixed(1)).join(' ')}`);
  if (real.stats) console.log(`  census index: ${JSON.stringify(real.stats)}`);
}
