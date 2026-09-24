#!/usr/bin/env node
// THE LEDGER-WALK LOOP MEASUREMENT (2.369.167 perf ⑥). NOT a test-*.mjs: it
// writes a ~200 MB synthetic ledger and takes minutes; the gate for the
// behaviour is scripts/test-usage-walk-parity.mjs (the routing table's parity
// suite). This prints the numbers the CHANGELOG cites.
//
// FIXTURE ISOLATION. Everything lives under a scratch.mjs `scratchHome()` (a
// /tmp/vs-* root no production reader walks — the server walks ITS OWN
// ~/.claude). The transcript is the §1c generator's (scripts/huge-transcript-
// fixture.mjs): its conversation id and every record id are MINTED from the
// fixtureSid family. The FILE is named with an ordinary id on purpose: the walk's
// own fixture guard refuses a fixtureSid FILE (that guard is the reason a
// leftover can never become usage), so a fixtureSid-named file would measure a
// walk that reads nothing.
//
//   node scripts/measure-usage-walk-yield.mjs [MB=200]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { scratchHome, fixtureSid } from './scratch.mjs';
import { writeHugeTranscript } from './huge-transcript-fixture.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));

const MB = Number(process.argv[2] || 200);
const home = scratchHome('walkyield', fs);
const cleanup = () => { try { fs.rmSync(home, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

const proj = path.join(home, '.claude', 'projects', '-home-u-measure');
fs.mkdirSync(proj, { recursive: true });
const FILE_SID = '5a5a5a5a-6b6b-4c7c-8d8d-9e9e9e9e9e9e';
const gen = await writeHugeTranscript({ file: path.join(proj, FILE_SID + '.jsonl'), sid: fixtureSid('ab1e'), cwd: '/home/u/measure', targetBytes: MB * 1048576 });
console.log(`fixture: ${(gen.bytes / 1048576).toFixed(1)} MB, ${gen.lines} lines, generated in ${gen.ms} ms`);
fs.readFileSync(path.join(proj, FILE_SID + '.jsonl')); // warm the page cache once — both builds read from it

// The loop-gap samplers: (1) the ws-heartbeat SHAPE — a 1 s pulse, lateness =
// how far past its due time it fired; (2) a 1 ms pulse — the longest gap between
// two turns of the loop the walk allowed (the single-digit-ms claim is HERE);
// (3) perf_hooks' own histogram as a cross-check.
// The sampler is STOPPED at the walk's settle (the trailing gap included): what
// runs after — the route's own aggregate over the finished ledger — is the
// route's cost, printed separately, not the walk's.
function sampler() {
  let maxGap = 0, last = performance.now(), maxLate = 0, due = performance.now() + 1000;
  const fine = setInterval(() => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; }, 1);
  const pulse = setInterval(() => { const t = performance.now(); maxLate = Math.max(maxLate, t - due); due = t + 1000; }, 1000);
  const h = monitorEventLoopDelay({ resolution: 1 }); h.enable();
  return {
    // the heartbeat pulse's next due time — the walk is started 30 ms before it,
    // so a stall longer than that is SEEN by the 1 s pulse (the detector's shape)
    nextDue: () => due,
    stop: () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); clearInterval(fine); clearInterval(pulse); h.disable(); return { maxGap, maxLate: Math.max(0, maxLate), histMax: h.max / 1e6, p99: h.percentile(99) / 1e6 }; },
  };
}

// ONE walk per call, on a fresh ledger (empty cursors ⇒ the whole 200 MB is new).
// `route`: ask the Usage route 100 ms into the walk. The loop-gap runs do NOT
// ask it — the route's own work over the finished ledger (its first shard parse
// + aggregate) is the route's cost, printed on the route runs, not the walk's.
async function run(label, yielding, { route = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(home, 'data-'));
  const uh = new UsageHistory({ dataDir, homeDir: home, ...(yielding ? {} : { scanYield: null }) }); // null hook ⇒ the sync walk = the pre-chunk scan
  // the Usage route, through its real registration on a fake app
  const handlers = {};
  const app = new Proxy({}, { get: (_t, verb) => (p, ...fns) => { handlers[String(verb).toUpperCase() + ' ' + p] = fns[fns.length - 1]; } });
  require(path.join(REPO, 'src/server/account-usage-routes.js')).create({ app, rootDir: REPO, engine: {}, serverSetting: () => undefined,
    getUsageHistory: () => uh, getAccounts: () => ({}), getHosts: () => ({}), getMounts: () => ({}), getTelemetry: () => ({}), getLoginExpiryWatch: () => null });
  await new Promise((r) => setTimeout(r, 50));
  const smp = sampler();
  await new Promise((r) => setTimeout(r, Math.max(0, smp.nextDue() - performance.now() - 30)));
  const t0 = performance.now();
  const p = uh.scan(true);
  let routeAt = null, routeBody = null, routeCalledAt = null, routeP = null;
  // the route is asked 100 ms into the walk (a yielding walk has handed the loop
  // back by then; a sync one is still holding it and the timer fires after)
  if (route) setTimeout(() => { routeCalledAt = performance.now() - t0; routeP = handlers['GET /api/usage-stats']({ query: {} }, { json: (b) => { routeAt = performance.now() - t0; routeBody = b; }, status() { return this; } }); }, 100);
  const res = await Promise.resolve(p);
  const wall = performance.now() - t0;
  // the heartbeat pulse due 30 ms after the start: in the sync build it could
  // not fire during the walk — one TIMERS phase lets it report how late it is
  if (!route) await new Promise((r) => setTimeout(r, 0));
  const s = smp.stop();
  await new Promise((r) => setTimeout(r, 150));
  await routeP;
  const post = uh.aggregate({});
  const equal = !!routeBody && JSON.stringify(routeBody.totals) === JSON.stringify(post.totals);
  if (route) console.log(`${label.padEnd(9)} +route: walk ${wall.toFixed(0)} ms | route asked @${routeCalledAt?.toFixed(0)} ms, answered @${routeAt?.toFixed(0)} ms (walk settled @${wall.toFixed(0)}) | totals ${equal ? '==' : '!='} post-walk totals (${post.totals?.requests} requests)`);
  else console.log(`${label.padEnd(9)} wall ${wall.toFixed(0).padStart(5)} ms | max loop gap ${s.maxGap.toFixed(1).padStart(6)} ms (perf_hooks max ${s.histMax.toFixed(1)}, p99 ${s.p99.toFixed(1)}) | 1 s pulse late by ${s.maxLate.toFixed(0)} ms | added ${res.added}`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  return { wall, ...s, added: res.added, routeAt, equal };
}

const rows = [];
for (let i = 0; i < 3; i++) { rows.push(['sync', await run('sync', false)]); rows.push(['yielding', await run('yielding', true)]); }
const routeRows = [];
for (let i = 0; i < 2; i++) { routeRows.push(['sync', await run('sync', false, { route: true })]); routeRows.push(['yielding', await run('yielding', true, { route: true })]); }
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pick = (k, f) => rows.filter(([l]) => l === k).map(([, r]) => r[f]);
const sw = med(pick('sync', 'wall')), yw = med(pick('yielding', 'wall'));
console.log('\nmedian of 3:');
console.log(`  wall          sync ${sw.toFixed(0)} ms → yielding ${yw.toFixed(0)} ms (${(((yw / sw) - 1) * 100).toFixed(1)} %)`);
console.log(`  max loop gap  sync ${med(pick('sync', 'maxGap')).toFixed(1)} ms → yielding ${med(pick('yielding', 'maxGap')).toFixed(1)} ms (worst yielding run ${Math.max(...pick('yielding', 'maxGap')).toFixed(1)} ms)`);
console.log(`  1 s pulse     sync late ${med(pick('sync', 'maxLate')).toFixed(0)} ms → yielding late ${med(pick('yielding', 'maxLate')).toFixed(0)} ms`);
console.log(`  route: totals == post-walk totals on every run: ${routeRows.every(([, r]) => r.equal)}; the yielding route answered only after the walk settled: ${routeRows.filter(([l]) => l === 'yielding').every(([, r]) => r.routeAt != null && r.routeAt >= r.wall)}`);
