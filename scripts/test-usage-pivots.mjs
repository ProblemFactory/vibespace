#!/usr/bin/env node
// B-f95d ② (lane usage-pivots-on-demand, 2.369.274) — FAST, in-process, zero vendor calls: the Usage window asks for a
// session / project pivot only when a panel that draws it is ON SCREEN. Before, every load asked for session×origin AND
// project×origin (All time on this instance: 9.1 MB instead of 5.1 MB) while the default dashboard draws one of them in
// its last panel and the other nowhere. This suite pins the SERVER half on the REAL route (account-usage-routes on a fake
// app) over a ledger in this instance's shape (scripts/usage-shape-fixture.mjs) and the window's SOURCE:
//   ① the fixture has the real distinct counts (sessions / projects / days / session×origin …);
//   ② no `pivot` ⇒ the answer has no pivots (what the first paint now asks);
//   ③ only=pivots answers the asked cross ALONE ({pivots, asOf?}), equal to the full answer's; no pivot asked ⇒ {pivots:{}};
//   ④ the bytes, base (both origin crosses with every load) vs now (none at first paint; one when its panel is on screen),
//      All time and 30 days — the first paint shrinks by the pivots' share and a later look costs less than the base's load;
//   ⑤ the window's census: the load carries held + BOUNDED crosses only, the ask is only=pivots, every split panel and the
//      session table go through pivotHere; CONTROL: the base's unconditional line planted back ⇒ the census is RED.
// The chrome half (the real window, request census on screen, PNGs) is test-usage-window-pivots.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { writeUsageShapeLedger, SHAPE } from './usage-shape-fixture.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 900) : '')); } };

const home = scratch('usage-pivots-home');
const dataDir = scratch('usage-pivots-data');
const rm = () => { for (const d of [home, dataDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } };
process.on('exit', rm);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { rm(); process.exit(1); });

const NOW = Date.now(), DAY = 86400e3;
const { rows } = writeUsageShapeLedger(dataDir, { now: NOW });
const uh = new UsageHistory({ dataDir, homeDir: home });

// ── the REAL route on a fake app
const handlers = {};
const fakeApp = new Proxy({}, { get: (_t, verb) => (p, ...fns) => { handlers[String(verb).toUpperCase() + ' ' + p] = fns[fns.length - 1]; } });
require(path.join(REPO, 'src/server/account-usage-routes.js')).create({ app: fakeApp, rootDir: REPO, engine: {}, serverSetting: () => undefined,
  getUsageHistory: () => uh, getAccounts: () => ({}), getHosts: () => ({}), getMounts: () => ({}), getTelemetry: () => ({}), getLoginExpiryWatch: () => null });
const route = handlers['GET /api/usage-stats'];
const ask = async (query) => {
  let body = null, code = 200;
  await route({ query, on() { } }, { json: (b) => { body = b; }, status(c) { code = c; return this; }, writableEnded: false });
  return { code, body, bytes: Buffer.byteLength(JSON.stringify(body)) };
};

console.log('① the fixture is in the shape of this instance\'s ledger');
const all = await ask({});
const dist = (dim) => (all.body.groups?.[dim] || []).length;
const both = await ask({ pivot: 'session:origin,project:origin' });
ok(all.code === 200 && all.body.totals.requests === rows && dist('session') === SHAPE.sessions && dist('project') === SHAPE.projects && dist('day') === SHAPE.days
  && dist('model') === SHAPE.models && dist('account') === SHAPE.accounts && dist('host') === SHAPE.hosts && dist('mode') === SHAPE.modes && dist('pool') === SHAPE.pools,
  `the distinct keys are the real ones (sessions ${dist('session')}, projects ${dist('project')}, days ${dist('day')}, models ${dist('model')}, accounts ${dist('account')}, hosts ${dist('host')})`,
  { requests: all.body.totals.requests, rows, session: dist('session'), project: dist('project'), day: dist('day'), model: dist('model'), account: dist('account'), host: dist('host'), mode: dist('mode'), pool: dist('pool') });
const so = both.body.pivots?.['session:origin'] || [], po = both.body.pivots?.['project:origin'] || [];
const cells = (p) => p.reduce((s, r) => s + Object.keys(r.cells).length, 0);
ok(so.length === SHAPE.sessions && cells(so) === SHAPE.sessions + SHAPE.multiOriginSessions && po.length === SHAPE.projects && cells(po) === SHAPE.projectOrigins,
  `the crosses too: session×origin ${cells(so)} cells over ${so.length} sessions, project×origin ${cells(po)} over ${po.length} projects`, { so: so.length, soCells: cells(so), po: po.length, poCells: cells(po) });

console.log('② no pivot asked ⇒ none answered (the first paint)');
ok(all.body && !('pivots' in all.body) && Array.isArray(all.body.groups?.session), 'GET /api/usage-stats with no `pivot` answers totals + groups and NO pivots key', Object.keys(all.body || {}));

console.log('③ only=pivots answers the asked cross alone');
const sOnly = await ask({ pivot: 'session:origin', only: 'pivots' });
const keys = Object.keys(sOnly.body || {}).sort();
ok(sOnly.code === 200 && keys.every((k) => ['asOf', 'partial', 'pivots'].includes(k)) && keys.includes('pivots') && Object.keys(sOnly.body.pivots).join() === 'session:origin',
  `only=pivots&pivot=session:origin ⇒ keys ${keys.join(', ')} — the one cross, no totals / groups / series / pricing`, keys);
ok(JSON.stringify(sOnly.body.pivots['session:origin']) === JSON.stringify(so), 'the cross is the SAME as the full answer\'s (same fold, same order)');
const pOnly = await ask({ pivot: 'project:origin', only: 'pivots', from: String(NOW - 30 * DAY) });
const p30 = await ask({ pivot: 'project:origin', from: String(NOW - 30 * DAY) });
ok(JSON.stringify(pOnly.body?.pivots) === JSON.stringify(p30.body?.pivots) && !('groups' in (pOnly.body || {})),
  'with a filter (30 days) the only=pivots cross equals the full answer\'s for the same slice', { only: pOnly.bytes, full: p30.bytes });
const none = await ask({ only: 'pivots' });
ok(none.code === 200 && JSON.stringify(none.body) !== undefined && none.body.pivots && !Object.keys(none.body.pivots).length && !('groups' in none.body),
  'only=pivots with nothing asked ⇒ {pivots: {}} (never the whole answer)', none.body && Object.keys(none.body));

console.log('④ the bytes: base (both crosses with every load) vs now');
const from30 = String(NOW - 30 * DAY);
const b30 = await ask({ from: from30, pivot: 'session:origin,project:origin' }), n30 = await ask({ from: from30 }), s30 = await ask({ from: from30, pivot: 'session:origin', only: 'pivots' });
const T = {
  all: { base: both.bytes, now: all.bytes, panel: sOnly.bytes, project: (await ask({ pivot: 'project:origin', only: 'pivots' })).bytes },
  d30: { base: b30.bytes, now: n30.bytes, panel: s30.bytes },
};
console.log('  BYTES ' + JSON.stringify(T));
const pct = (a, b) => Math.round((a / b - 1) * 100);
ok(T.all.base > T.all.now * 1.5 && T.d30.base > T.d30.now * 1.3,
  `the base's first paint is ${pct(T.all.base, T.all.now)} % bigger All time (${T.all.base} vs ${T.all.now} B) and ${pct(T.d30.base, T.d30.now)} % at 30 days — the share the first paint drops`, T);
ok(T.all.now + T.all.panel < T.all.base && T.d30.now + T.d30.panel < T.d30.base,
  'even after the session×origin panel is looked at, the window has moved fewer bytes than the base\'s ONE load (the ask never re-sends the totals and groups)', T);

console.log('⑤ the window\'s census (+ a planted RED control)');
const win = fs.readFileSync(path.join(REPO, 'src/lib/usage-window.js'), 'utf8');
const dash = fs.readFileSync(path.join(REPO, 'src/lib/usage-dashboard.js'), 'utf8');
const judge = (w, d) => {
  const bad = [];
  if (/'session:origin',\s*'project:origin'/.test(w)) bad.push('a literal list of both origin crosses (asked unconditionally)');
  const load = w.slice(w.indexOf('  const load = async () => {'), w.indexOf('  const askPivots = async () => {'));
  if (!/const eager = state\.view === 'dash' \? panelPivots\(currentPanels\(\)\)\.filter\(\(k\) => !unboundedPivot\(k\)\) : \[\];\n\s*const pivots = \[\.\.\.new Set\(\[\.\.\.state\.held, \.\.\.eager\]\)\];/.test(load)) bad.push('the load does not ask for held + BOUNDED crosses only');
  if ((load.match(/qs\.set\('pivot'/g) || []).length !== 1) bad.push('the load sets `pivot` other than once');
  if (!/const unboundedPivot = \(key\) => key\.split\(':'\)\.some\(\(dim\) => dim === 'session' \|\| dim === 'project'\);/.test(w)) bad.push('the unbounded rule moved');
  const askP = w.slice(w.indexOf('  const askPivots = async () => {'), w.indexOf('  const onScreen = '));
  if (!/qs\.set\('only', 'pivots'\);/.test(askP) || !/if \(gen !== state\.gen\) return;/.test(askP) || !/missing\.map\(\(k\) => \[k, got\.pivots\[k\] \|\| \[\]\]\)/.test(askP)) bad.push('the ask is not only=pivots / not dropped when a load overtook it / can re-ask an unanswered key');
  if (!/new IntersectionObserver\(/.test(w) || !/if \(!state\.pivotErr\) onScreen\(el, \(\) => \{ state\.held\.add\(key\); askPivots\(\); \}\);/.test(w)) bad.push('the ask is not tied to the panel being on screen');
  if (!/if \(opts\.pivotHere && !opts\.pivotHere\('session:origin', sec\)\) return sec;/.test(w) || !/withPivot\('project:origin', renderGroup\(/.test(w) || !/renderSessions\(d, state, \{ limit: 12, pivotHere \}\)/.test(w)) bad.push('a classic section draws a cross without asking for it');
  if (!/if \(pivotHere && !pivotHere\(`\$\{panel\.dim\}:\$\{panel\.splitBy\}`, body\)\) return;\n\s*chartSplit\(body, data, panel, mlist\);/.test(d) || !/pivotHere,\n\s*\}\);/.test(w)) bad.push('a split panel draws without asking for its pivot');
  if (!/for \(const k of \[\.\.\.state\.held\]\) if \(!drawn\.has\(k\)\) state\.held\.delete\(k\);/.test(w)) bad.push('a held pivot nobody draws any more is never let go (it would ride every load)');
  return bad;
};
const verdict = judge(win, dash);
ok(verdict.length === 0, 'the window: first load = held + bounded crosses, the ask = only=pivots once on screen, every cross-drawing surface goes through pivotHere, held pivots nobody draws are let go', verdict);
const BASE_LINE = "const pivots = [...new Set([...ORIGIN_PIVOTS, ...panelPivots(currentPanels())])];\n    const ORIGIN_PIVOTS = ['session:origin', 'project:origin'];";
const planted = win.replace(/const pivots = \[\.\.\.new Set\(\[\.\.\.state\.held, \.\.\.eager\]\)\];/, BASE_LINE);
const red = judge(planted, dash);
ok(planted !== win && red.length >= 2, `CONTROL: the base's unconditional fetch planted back into the load ⇒ RED (${red.join(' | ')})`, red);

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
