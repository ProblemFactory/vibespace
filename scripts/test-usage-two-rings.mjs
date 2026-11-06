#!/usr/bin/env node
// THE CLAUDE USAGE ROW ALWAYS DRAWS TWO RINGS (lane usage-two-rings, owner 2026-11-05, with a screenshot: 「没有 5 hour 的话，
// 你应该还是显示两个饼状图吧…你现在相当于只变成一个饼状图了，看起来很奇怪。」 — and at 18:40 PT: 「我是说没有 5h 就显示 7d+fable，刚才
// 说错了」). .367 (lane no-5h-window) drew a reading without a 5h window as ONE ring (the 7d) beside the Codex row's two. Its
// law stands (an absent window is never faked — never a 0 % 5h arc); the GEOMETRY changes: such a row shows the account's
// OTHER limit — the model-scoped weekly cap (`scopedWeekly[]`, e.g. Fable) — beside its 7d, in ONE order constant
// (usage-source NO5H_RINGS) both twins read, from ONE builder (usage-source `capRing`) both twins call. The cap ring has
// TWO states, each distinguishable at a glance AND in words: read (the cap's arc; «Fable weekly limit: 42% · resets …»,
// «Fa» in the hole) · not read (an EMPTY track that says the last read's FACT: «model-scoped weekly cap (e.g. Fable): no
// data yet — press ⟳», or after a ⟳ read that named no cap «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again»).
// With a 5h window nothing moves but the cap's words (the CONTROL: the base's rule restored in a copy renders it
// byte-identical — the roster cell IDENTICAL EXCEPT THE CAP TOOLTIP'S WORDS); no reading at all keeps [5h, 7d] «no data yet».
// Round 3: the popup's scoped note AGREES with the ring, and ONE sentence per cap everywhere (capRing's words, never the
// base's bare «Fable: 12%»). Round 4 (the r3 acceptance's two majors): (q1) THE SHAPE BELONGS TO THE LIMIT SET'S KIND — the
// roster renderer is shared with the Codex roster, and a Codex week-only push (codex-quota: no window ≤ 480 min ⇒ fiveHour
// null) drew a «Fable» cap ring it can never read; only a harness whose caps row says its limit set can carry a model-scoped
// cap (a backend-caps row — r5 renamed it `scopedCapsOnDemand`, agent-meta `scopedCapsReadOnDemand`) runs capRing — any other reading draws as the base
// drew it. (q2) AN EMPTY READ PROVES NOTHING — r3's third state («none»: a slash + «no model-scoped cap on this account» on
// an empty ⟳ read) is WITHDRAWN: a drifted panel line or a limit with no name parses to the same empty list (quota-model
// B-9f4b), so the ring says the read's fact, never an absence. (q4) the pills name a read cap in capRing's words too.
// Round 5 (the r4 acceptance): (u1) A READING'S OWN CAPS ARE DRAWN FOR EVERY HARNESS; ONLY THE PLACEHOLDER RING IS CLAUDE'S —
// a Codex reading CARRIES a model-scoped cap (the Spark limit: codex-quota scope 'model', projected into scopedWeekly by
// quota-model toLegacyView inside usage-routes summarizeCodexRateLimits), and r4's gate skipped every cap for Codex (its donut,
// its pill bucket, its «GP is spent» countdown gone while the popup still listed it); now the caps row — renamed
// `scopedCapsOnDemand`: its caps come ONLY from the ⟳ read — gates capRing alone, and any other harness draws the caps it
// carries as the base did (usage-source `readingCaps`). (u2) the not-read hole says t('cap') — zh / ja «限». (u3) the
// not-read words say the READ's result: «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again».
// The REAL renderers over a fake document (the taskbar, the popup, the Claude roster, the REAL Codex roster
// `_renderCodexAccounts` and the 8 s repaint), the real parsers for the drift fixtures, the has5h + scopedWeekly censuses
// over src/lib, and a mutant per law that reds its leg BY NAME in a copy outside the tree.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }

// ── the fake document the real `_renderUsage` paints into (test-roster-live-usage's shape) ───────────────────────────
const els = {};
const el = (id) => (els[id] ||= { id, innerHTML: '', classList: { toggle() { } }, querySelectorAll: () => [], addEventListener() { } });
globalThis.document = { getElementById: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() { },
  createElement: () => ({ dataset: {}, style: { setProperty() { } }, classList: { add() { }, toggle() { } }, setAttribute() { }, appendChild() { }, outerHTML: '<span class="backend-icon"></span>' }) };
globalThis.window ??= { addEventListener() { }, removeEventListener() { }, matchMedia: () => ({ matches: false, addEventListener() { } }), location: { search: '' } };
globalThis.requestAnimationFrame ??= () => 0;

const US = await import(pathToFileURL(path.join(REPO, 'src/lib/usage-source.js')).href);
const nowS = Math.floor(Date.now() / 1000), H = 3600, D = 86400, MIN = 60e3;
const LIFTED_AT = Date.now() - 6 * D * 1000; // the tombstone: the instant the vendor's answer first named no 5h window
const WEEK = { utilization: 0.37, resetsAt: nowS + 3 * D };
const FABLE = { name: 'Fable', utilization: 0.42, resetsAt: nowS + 2 * D + 5 * H };
const at = Date.now() - MIN, READ_AT = at - 9 * MIN; // READ_AT = the last ⟳ read of the model-scoped set
const FIX = {
  scoped: { fetchedAt: at, fiveHourAbsent: LIFTED_AT, sevenDay: WEEK, scopedWeekly: [FABLE], scopedFetchedAt: READ_AT }, // lifted + a ⟳ reading of the cap
  unread: { fetchedAt: at, fiveHourAbsent: LIFTED_AT, sevenDay: WEEK },                                   // lifted, no ⟳ read of the set yet
  fetched: { fetchedAt: at, sevenDay: WEEK, scopedWeekly: [], scopedFetchedAt: READ_AT },                 // simply absent; the last ⟳ read named no cap
  multi: { fetchedAt: at, sevenDay: WEEK, scopedWeekly: [{ name: 'Fable', utilization: 0.12, resetsAt: nowS + 2 * D }, { name: 'Opus', utilization: 0.8, resetsAt: nowS + 4 * D }], scopedFetchedAt: at },
  read: { fetchedAt: at, fiveHour: { utilization: 0.42, resetsAt: nowS + 2 * H }, sevenDay: WEEK, scopedWeekly: [FABLE], scopedFetchedAt: READ_AT }, // CONTROL
  fetchedFive: { fetchedAt: at, fiveHour: { utilization: 0.42, resetsAt: nowS + 2 * H }, sevenDay: WEEK, scopedWeekly: [], scopedFetchedAt: READ_AT }, // 5h + the last ⟳ read named no cap
  multiFive: { fetchedAt: at, fiveHour: { utilization: 0.42, resetsAt: nowS + 2 * H }, sevenDay: WEEK, scopedWeekly: [{ name: 'Fable', utilization: 0.12, resetsAt: nowS + 2 * D }, { name: 'Opus', utilization: 0.8, resetsAt: nowS + 4 * D }], scopedFetchedAt: at },
};
const EST_KNOWN = { scopedWeekly: [{ name: 'Fable', utilization: 0.2, resetsAt: nowS + 2 * D }] }; // an older reading's estimate still names the cap
const CX = { fetchedAt: at, fiveHour: { usedPercent: 23, resetsAt: nowS + 3 * H }, sevenDay: { usedPercent: 31, resetsAt: nowS + 4 * D } };
// A CODEX WEEK-ONLY PUSH through the REAL codex-quota normalize (no window ≤ 480 min ⇒ fiveHour: null — kb-bugfix's «plan 7d 33 %»)
const CX_WEEK = require(path.join(REPO, 'src/harnesses/codex-quota.js')).normalize({ primary: { used_percent: 31, window_minutes: 10080, resets_at: nowS + 4 * D } }, at);
// A CODEX READING THAT CARRIES A MODEL-SCOPED CAP (r5 u1): usage-routes summarizeCodexRateLimits `keep()`, step for step, over
// the REAL modules — each push a limit set (codex-quota limitSetFromSnapshot), merged per limitId (quota-model mergeLimitSets),
// projected (toLegacyView: the Spark limit, scope 'model', lands in scopedWeekly), JSON as /api/usage sends it
const CQX = require(path.join(REPO, 'src/harnesses/codex-quota.js')), QMX = require(path.join(REPO, 'src/quota-model.js'));
const KEEP_LINES = ['const next = codexQuota.limitSetFromSnapshot(snapshot, { identity: key, source: source || snapshot.source || null });', 'setOf[key] = quotaModel.mergeLimitSets(setOf[key] || quotaModel.makeLimitSet({ identity: key }), next);',
  'const view = quotaModel.toLegacyView(setOf[key]);', 'const out = { ...base, ...view, limits: setOf[key].limits, fetchedAt: setOf[key].fetchedAt || base.fetchedAt };'];
const keep = (snaps) => { let set = null, out = null; for (const snapshot of snaps) { const next = CQX.limitSetFromSnapshot(snapshot, { identity: 'cxs-a', source: snapshot.source || null }); set = QMX.mergeLimitSets(set || QMX.makeLimitSet({ identity: 'cxs-a' }), next); const view = QMX.toLegacyView(set); const base = (!out || (snapshot.fetchedAt || 0) >= (out.fetchedAt || 0)) ? snapshot : out; out = { ...base, ...view, limits: set.limits, fetchedAt: set.fetchedAt || base.fetchedAt }; } return JSON.parse(JSON.stringify(out)); };
const SPARK = 'GPT-5.3-Codex-Spark', PLAN = CQX.normalize({ limit_id: 'codex', primary: { used_percent: 33, window_minutes: 10080, resets_at: nowS + 4 * D } }, at);
const CX_SPARK = keep([PLAN, CQX.normalize({ limit_id: 'codex_bengalfox', limit_name: SPARK, primary: { used_percent: 90, window_minutes: 300, resets_at: nowS + 3 * H }, secondary: { used_percent: 97, window_minutes: 10080, resets_at: nowS + 2 * D } }, at)]); // the acceptance's: plan 7d 33 % + Spark 5h 90 % / 7d 97 %
const CX_SPARK_WEEK = keep([PLAN, CQX.normalize({ limit_id: 'codex_bengalfox', limit_name: SPARK, primary: { used_percent: 97, window_minutes: 10080, resets_at: nowS + 2 * D } }, at)]); // no window ≤ 480 min anywhere ⇒ no 5h
// THE DRIFT FIXTURES (the r3 acceptance's, through the REAL claude-quota parsers), stored as the ⟳ route stores them
// (usage-routes: `{ ...cliPanel, source: 'on-demand', scopedFetchedAt: Date.now() }`) — JSON drops the enumeration mark, as storage does
const CQ = require(path.join(REPO, 'src/harnesses/claude-quota.js'));
const stored = (parsed) => JSON.parse(JSON.stringify({ fetchedAt: at, ...parsed, source: 'on-demand', scopedFetchedAt: READ_AT }));
const DRIFT = {
  panel: stored(CQ.parseCliUsageText('Current week (all models): 37% used\nCurrent week (Fable): 42 % used\n', Date.now())),   // the cap line drifted («42 %»)
  oauth: stored(CQ.parseOAuthUsage({ seven_day: { utilization: 37, resets_at: new Date((nowS + 3 * D) * 1000).toISOString() }, limits: [{ kind: 'weekly_scoped', percent: 42, resets_at: new Date((nowS + 2 * D) * 1000).toISOString() }] })), // a weekly_scoped limit with no name
};
const LAST = (ms) => `the last ⟳ (${US.resetInstantText ? US.resetInstantText(ms, Date.now()) : '?'}) returned no cap figure — press ⟳ to read again`;
const R4_KEY = 'the last ⟳ at {when} read no cap — press ⟳ to read again', R5_KEY = 'the last ⟳ ({when}) returned no cap figure — press ⟳ to read again'; // r4's words (u3: they read as «no cap»)
const W = {
  unread: 'model-scoped weekly cap (e.g. Fable): no data yet — press ⟳', known: 'Fable weekly limit: no data yet — press ⟳',
  fetched: `model-scoped weekly cap (e.g. Fable): ${LAST(READ_AT)}`, knownFetched: `Fable weekly limit: ${LAST(READ_AT)}`,
  absent: 'no model-scoped cap on this account', // r3's «none» — WITHDRAWN: never said on a read that proves nothing
  off: 'Model-scoped weekly limits (e.g. Fable) aren’t in the passive feed — on-demand refresh is disabled in Settings',
  passive: 'Model-scoped weekly limits (e.g. Fable) aren’t in the passive feed — ⟳ fetches them on demand',
};
const note = (s) => `<div class="usage-note">${s}</div>`;
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// THE TASKBAR ROW + THE POPUP + THE PHONE CHIP: usage-meter `_renderUsage`, the real method
const meter = (UM, u, { est = null, refresh, cx = CX } = {}) => {
  for (const k of Object.keys(els)) delete els[k];
  class AppU { }
  UM.installUsageMeter(AppU, {});
  const app = new AppU();
  app.settings = { get: (k) => (k === 'accounts.onDemandQuotaRefresh' ? refresh : undefined) };
  app._accounts = { accounts: [{ id: 'sub-a', backend: 'claude', type: 'subscription', name: 'userW' }, { id: 'cxs-a', backend: 'codex', type: 'subscription', name: 'userL' }], defaultAccountId: 'sub-a', defaultCodexAccountId: 'cxs-a' };
  app._accountUsage = u ? { 'sub-a': u } : {}; app._codexAccountUsage = { 'cxs-a': cx }; app._usageEstimates = est ? { 'sub-a': est } : {};
  let err = null;
  try { app._renderUsage(); } catch (e) { err = e.message; }
  const bar = el('taskbar-usage').innerHTML, pop = el('usage-popup').innerHTML, chip = el('mobile-nav-usage').innerHTML;
  const [cRow = '', xRow = ''] = bar.split('<div class="taskbar-usage-row">').slice(1);
  const [cPop = '', xPop = ''] = pop.split('<div class="usage-section-title">').slice(1);
  const donuts = [...cRow.matchAll(/<div class="(usage-pie usage-donut[^"]*)" title="([^"]*)" style="([^"]*)"><span class="usage-donut-label">([^<]*)<\/span><\/div>/g)]
    .map((m) => ({ cls: m[1], tip: unesc(m[2]), style: m[3], label: m[4] }));
  return { err, bar, pop, chip, cRow, xRow, cPop, xPop, donuts };
};
const donutsOf = (html) => [...html.matchAll(/<span class="(acct-usage-donut[^"]*)" title="([^"]*)" style="([^"]*)"><span>([^<]*)<\/span><\/span>/g)]
  .map((m) => ({ cls: m[1], tip: unesc(m[2]), style: m[3], label: m[4] }));
const appOf = (MA) => { class AppM { } MA.installManageAgents(AppM, {}); return new AppM(); };
// THE ROSTER: manage-agents `_acctUsageHtml`, the real method (donuts + the narrow pill)
const roster = (MA, u, { est = null, refresh, backend } = {}) => {
  const app = appOf(MA);
  app.settings = { get: (k) => (k === 'accounts.onDemandQuotaRefresh' ? refresh : undefined) };
  let html = '', err = null;
  try { html = backend === undefined ? app._acctUsageHtml(u, est) : app._acctUsageHtml(u, est, null, backend); } catch (e) { err = e.message; }
  const pill = html.match(/<span class="acct-usage-mini[^"]*"[^>]*title="([^"]*)"/);
  return { err, html, donuts: donutsOf(html), pillTip: pill ? unesc(pill[1]) : '' };
};
// THE CODEX ROSTER: manage-agents `_renderCodexAccounts`, the real method — the global login row, a named ChatGPT row and a
// pool row whose target is that account, each cell through the shared renderer as the product calls it
const codexRoster = async (MA, u) => {
  const app = appOf(MA);
  app.settings = { get: () => undefined };
  const accts = { accounts: [{ id: 'cxs-a', backend: 'codex', type: 'subscription', name: 'userL', loggedIn: true },
    { id: 'cxp-a', backend: 'codex', type: 'subscription', pooled: true, name: 'userQ', current: 'cxs-a', currentName: 'userL' }], defaultCodexAccountId: 'cxs-a' };
  app.refreshAccounts = async () => accts;
  app._codexAccountUsage = { 'cxs-a': u, __global_codex__: u }; app._usageEstimates = {};
  const made = [], mk0 = globalThis.document.createElement;
  globalThis.document.createElement = () => { const e = { dataset: {}, style: {}, className: '', textContent: '', title: '', innerHTML: '', kids: [], classList: { add() { }, toggle() { }, remove() { } }, append(...k) { this.kids.push(...k); }, appendChild(k) { this.kids.push(k); }, querySelector: () => null, querySelectorAll: () => [], setAttribute() { }, addEventListener() { } }; made.push(e); return e; };
  let err = null;
  try { await app._renderCodexAccounts({ body: { appendChild() { } }, selectedHost: null, done() { }, run() { }, refresh() { }, st: { codex: { loggedIn: true } }, stale: () => false }); } catch (e) { err = e.message; } finally { globalThis.document.createElement = mk0; }
  const html = (made.find((e) => String(e.innerHTML).includes('acct-list')) || {}).innerHTML || '';
  const cells = html.split('<span class="acct-usage-cell').slice(1).map((c) => c.slice(0, c.indexOf('<span class="acct-key-actions">')));
  return { err, html, cells, donuts: donutsOf(html) };
};
// THE 8 s REPAINT: `_repaintRosterUsage` over one stamped cell (the real method, the real `rosterUsageSnapshot`)
const repaint = (MA, src, key, maps) => {
  const app = appOf(MA);
  app.settings = { get: () => undefined };
  Object.assign(app, maps);
  const cell = { dataset: { usageSrc: src, usageKey: key }, innerHTML: '', closest: () => null }, qsa = globalThis.document.querySelectorAll;
  globalThis.document.querySelectorAll = (sel) => (/acct-usage-cell/.test(sel) ? [cell] : []);
  let err = null;
  try { app._repaintRosterUsage(); } catch (e) { err = e.message; } finally { globalThis.document.querySelectorAll = qsa; }
  return { err, html: cell.innerHTML, donuts: donutsOf(cell.innerHTML) };
};

// ── THE LEGS (one per twin and fixture; a mutant reds its leg BY NAME) ─────────────────────────────────────────────
const labels = (ds) => ds.map((d) => d.label).join(',');
const EMPTY = 'background:var(--bg-input)';
const capState = (d, twin) => !d ? '?' : new RegExp(`\\b${twin}-none\\b`).test(d.cls) ? 'none' : d.style === EMPTY ? 'unread' : /^conic-gradient\(/.test(d.style.replace(/^background:/, '')) ? 'read' : '?';
const meterLegs = (UM) => {
  const S = meter(UM, FIX.scoped), N = meter(UM, FIX.unread), O = meter(UM, FIX.fetched), X = meter(UM, FIX.multi), R = meter(UM, FIX.read), Z = meter(UM, null);
  const K = meter(UM, FIX.unread, { est: EST_KNOWN }), F = meter(UM, FIX.unread, { refresh: 'off' });
  const O5 = meter(UM, FIX.fetchedFive), OF = meter(UM, FIX.fetched, { refresh: 'off' }), OK = meter(UM, FIX.fetched, { est: EST_KNOWN });
  const [s7, sc] = S.donuts, [, nc] = N.donuts, [, oc] = O.donuts, [, xc] = X.donuts;
  return [
    { name: 'taskbar NO 5h + a scoped reading: TWO rings [7d, Fa] — the cap\'s ARC, «Fable weekly limit: 42% · resets in …» (the full name in the tooltip, two letters in the hole)',
      pass: !S.err && labels(S.donuts) === '7d,Fa' && capState(sc, 'usage-donut') === 'read' && /conic-gradient\(var\(--green\) 151deg, var\(--bg-input\) 151deg\)/.test(sc?.style) && /^Fable weekly limit: 42% · resets in \d+d\d+h\d+m$/.test(sc?.tip || ''),
      detail: S.err || JSON.stringify(S.donuts) },
    { name: 'taskbar NO 5h: …the 7d ring is the 7d ring («7d: 37%»), never a 5h ring anywhere in the row', pass: !S.err && s7?.tip === '7d: 37%' && !/>5h</.test(S.cRow), detail: JSON.stringify(s7) },
    { name: 'taskbar NO 5h + no scoped reading: [7d, cap] — the cap ring «no data yet» (an EMPTY track, «… no data yet — press ⟳»), never drawn as read',
      pass: !N.err && labels(N.donuts) === '7d,cap' && capState(nc, 'usage-donut') === 'unread' && nc?.cls === 'usage-pie usage-donut' && nc?.tip === W.unread, detail: N.err || JSON.stringify(N.donuts) },
    { name: 'taskbar NO 5h + an older reading names the cap: the not-read ring is labelled by it («Fa», «Fable weekly limit: no data yet — press ⟳»)',
      pass: !K.err && labels(K.donuts) === '7d,Fa' && capState(K.donuts[1], 'usage-donut') === 'unread' && K.donuts[1]?.tip === W.known, detail: K.err || JSON.stringify(K.donuts) },
    { name: 'taskbar NO 5h + on-demand refresh OFF in Settings: the not-read ring says the popup\'s own sentence for that (with or without a past ⟳ read)', pass: !F.err && labels(F.donuts) === '7d,cap' && F.donuts[1]?.tip === W.off && OF.donuts[1]?.tip === W.off, detail: JSON.stringify([F.donuts, OF.donuts]) },
    { name: 'A ⟳ READ THAT NAMED NO CAP PROVES NOTHING (taskbar): [7d, cap] — the cap ring stays NOT READ (the plain empty track, no slash) and says the read\'s FACT «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again» (an older estimate\'s name labels it), never «no model-scoped cap on this account»',
      pass: !O.err && labels(O.donuts) === '7d,cap' && capState(oc, 'usage-donut') === 'unread' && oc?.cls === 'usage-pie usage-donut' && oc?.tip === W.fetched && labels(OK.donuts) === '7d,Fa' && OK.donuts[1]?.tip === W.knownFetched
        && ![O, O5, OK].some((Y) => Y.bar.includes(W.absent) || /donut-none/.test(Y.bar)), detail: O.err || JSON.stringify([O.donuts, OK.donuts]) },
    { name: 'taskbar NO 5h + SEVERAL caps: still TWO rings — the cap that exhausts first (Opus 80 % over Fable 12 %), its tooltip naming it',
      pass: !X.err && labels(X.donuts) === '7d,Op' && /^Opus weekly limit: 80%/.test(xc?.tip || ''), detail: X.err || JSON.stringify(X.donuts) },
    { name: 'taskbar WITH a 5h window: 5h + 7d as before («5h: 42%»), no cap ring', pass: !R.err && labels(R.donuts) === '5h,7d' && R.donuts[0]?.tip === '5h: 42%' && !/donut-none|Fable/.test(R.cRow), detail: JSON.stringify(R.donuts) },
    { name: 'taskbar with NO reading at all: [5h, 7d] both «no data yet», as the base', pass: !Z.err && labels(Z.donuts) === '5h,7d' && Z.donuts.every((d) => / no data yet$/.test(d.tip)), detail: Z.err || JSON.stringify(Z.donuts) },
    { name: 'popup: the 5-hour section keeps .367\'s «5-hour limit lifted (<when>)» (lifted) and «no data yet» (simply absent); the scoped section lists the cap as before',
      pass: !S.err && S.cPop.includes(`5-hour limit lifted (${US.stampText(LIFTED_AT)})`) && /<div class="usage-session usage-session-unread" data-window="5h">\s*<div class="usage-session-name">5-hour limit<\/div>\s*<div class="usage-session-stats"><span class="usage-stat">no data yet<\/span><\/div>/.test(O.cPop)
        && /Fable weekly limit<\/div>/.test(S.cPop) && /42% used/.test(S.cPop), detail: S.cPop.slice(0, 240) },
    { name: 'THE POPUP SAYS THE RING\'S SENTENCE: after a ⟳ read that named no cap the scoped note is the ring\'s own «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again» (with or without a 5h window) — never «no model-scoped cap on this account», never «⟳ fetches them on demand»; refresh off ⇒ the off sentence; no ⟳ read yet keeps the passive-feed sentence',
      pass: [O, O5].every((Y) => !Y.err && Y.cPop.includes(note(W.fetched)) && !Y.cPop.includes('aren’t in the passive feed')) && OK.cPop.includes(note(W.knownFetched)) && OF.cPop.includes(note(W.off)) && N.cPop.includes(note(W.passive)) && F.cPop.includes(note(W.off))
        && ![O, O5, OF, OK, N, F].some((Y) => Y.pop.includes(W.absent)), detail: [O, O5, OF, N].map((Y) => (Y.cPop.match(/<div class="usage-note">[^<]*<\/div>/g) || []).join(' ')).join(' | ') },
    { name: 'THE RING AND THE POPUP NAME THE CAP ALIKE: the ring\'s tooltip opens with the popup\'s own section title («Fable weekly limit»)', pass: sc?.tip?.startsWith('Fable weekly limit: ') && S.cPop.includes('<div class="usage-session-name">Fable weekly limit</div>') },
    { name: 'the PHONE chip keeps the base\'s count (worst of 5h-if-present, 7d and every running cap): 42 with the Fable reading, 37 without, 80 for Opus',
      pass: />42<\/span>/.test(S.chip) && [N, O].every((Y) => />37<\/span>/.test(Y.chip)) && />80<\/span>/.test(X.chip), detail: [S.chip, N.chip, X.chip].join(' | ') },
    { name: 'the CODEX row is untouched: 5h + 7d (23 % / 31 %) beside every Claude state', pass: [S, N, O, X, R].every((Y) => /title="5h: 23%"/.test(Y.xRow) && /title="7d: 31%"/.test(Y.xRow) && !/cap|Fable|no data yet/.test(Y.xRow)) },
  ];
};
// THE DRIFT FIXTURES through every twin: a cap the parser could not read is NEVER called absent
const driftLegs = (UM, MA) => ['panel', 'oauth'].map((k) => {
  const u = DRIFT[k], m = meter(UM, u), r = roster(MA, u);
  return { name: k === 'panel' ? 'THE DRIFTED PANEL (the acceptance\'s fixture through the real parseCliUsageText, stored as the ⟳ route stores it): a «Current week (Fable): 42 % used» line the parser cannot read ⇒ the taskbar ring, the roster donut, the narrow pill and the popup note say «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again» — never «no cap»'
    : 'THE NAMELESS LIMIT (an OAuth weekly_scoped limit with no name through the real parseOAuthUsage — «a model cap we cannot NAME is a cap we lost»): the same words in every twin — never «no cap»',
    pass: Array.isArray(u.scopedWeekly) && !u.scopedWeekly.length && !m.err && !r.err && labels(m.donuts) === '7d,cap' && m.donuts[1]?.tip === W.fetched && labels(r.donuts) === '7d,cap' && r.donuts[1]?.tip === W.fetched
      && r.pillTip.startsWith(W.fetched) && m.cPop.includes(note(W.fetched)) && !(m.bar + m.pop + r.html).includes(W.absent) && !/donut-none/.test(m.bar + r.html),
    detail: m.err || r.err || JSON.stringify([u.scopedWeekly, m.donuts, r.donuts]) };
});
const rosterLegs = (MA) => {
  const S = roster(MA, FIX.scoped), N = roster(MA, FIX.unread), O = roster(MA, FIX.fetched), X = roster(MA, FIX.multi), R = roster(MA, FIX.read), K = roster(MA, FIX.unread, { est: EST_KNOWN });
  const R2 = roster(MA, FIX.multiFive), OK = roster(MA, FIX.fetched, { est: EST_KNOWN });
  const host = typeof MA.hostQuotaPillHtml === 'function' ? MA.hostQuotaPillHtml(FIX.scoped) : '', hostTip = unesc((host.match(/title="([^"]*)"/) || [])[1] || '');
  const [s7, sc] = S.donuts, [, nc] = N.donuts, [, oc] = O.donuts;
  return [
    { name: 'roster NO 5h + a scoped reading: TWO donuts [7d, Fa] — no 5h donut, the cap\'s arc + «Fable weekly limit: 42% · resets in …»',
      pass: !S.err && labels(S.donuts) === '7d,Fa' && /^7d: 37%/.test(s7?.tip || '') && capState(sc, 'acct-donut') === 'read' && /^Fable weekly limit: 42% · resets in /.test(sc?.tip || ''), detail: S.err || JSON.stringify(S.donuts) },
    { name: 'roster NO 5h + no scoped reading: [7d, cap] — the cap donut «no data yet» (an EMPTY track, an empty countdown slot so the columns stay aligned)',
      pass: !N.err && labels(N.donuts) === '7d,cap' && capState(nc, 'acct-donut') === 'unread' && nc?.cls === 'acct-usage-donut' && nc?.tip === W.unread && /<span>cap<\/span><\/span><span class="acct-donut-eta-slot" aria-hidden="true"><\/span>/.test(N.html),
      detail: N.err || JSON.stringify(N.donuts) },
    { name: 'roster NO 5h + an older reading names the cap: «Fa», «Fable weekly limit: no data yet — press ⟳»', pass: !K.err && labels(K.donuts) === '7d,Fa' && K.donuts[1]?.tip === W.known, detail: JSON.stringify(K.donuts) },
    { name: 'A ⟳ READ THAT NAMED NO CAP PROVES NOTHING (roster): [7d, cap] — the plain empty track (no slash), «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again» (an older estimate\'s name labels it), never «no model-scoped cap on this account»',
      pass: !O.err && labels(O.donuts) === '7d,cap' && capState(oc, 'acct-donut') === 'unread' && oc?.cls === 'acct-usage-donut' && oc?.tip === W.fetched && OK.donuts[1]?.tip === W.knownFetched && ![O, OK].some((Y) => Y.html.includes(W.absent) || /donut-none/.test(Y.html)),
      detail: O.err || JSON.stringify([O.donuts, OK.donuts]) },
    { name: 'roster NO 5h + SEVERAL caps: 7d, then every cap the roster has always drawn — the one that exhausts first leading (7d, Op, Fa)', pass: !X.err && labels(X.donuts) === '7d,Op,Fa', detail: JSON.stringify(X.donuts) },
    { name: 'roster: the narrow pill\'s tooltip says the cap ring\'s words when it has no figure (no data yet / the last ⟳ returned no cap figure); the pill shows the week', pass: N.pillTip.startsWith(W.unread + ' · 7d 37%') && O.pillTip.startsWith(W.fetched + ' · 7d 37%') && /acct-usage-mini[^>]*>7d 37%/.test(N.html), detail: N.pillTip + ' | ' + O.pillTip },
    { name: 'roster WITH a 5h window: its three donuts as before (5h, 7d, Fa); several caps keep the reading\'s order after the 7d (5h, 7d, Fa, Op)',
      pass: !R.err && labels(R.donuts) === '5h,7d,Fa' && /^5h: 42%/.test(R.donuts[0]?.tip || '') && !/donut-none/.test(R.html) && !R2.err && labels(R2.donuts) === '5h,7d,Fa,Op', detail: JSON.stringify([R.donuts, labels(R2.donuts)]) },
    { name: 'ONE SENTENCE PER CAP: the roster\'s cap donut in a 5h row says capRing\'s words («Fable weekly limit: 42% · resets in …» — the no-5h row\'s very sentence), never the base\'s bare «Fable: 42%»',
      pass: !R.err && /^Fable weekly limit: 42% · resets in \S+$/.test(R.donuts[2]?.tip || '') && R.donuts[2]?.tip === S.donuts[1]?.tip && /^Fable weekly limit: 12% · /.test(R2.donuts[2]?.tip || '') && /^Opus weekly limit: 80% · /.test(R2.donuts[3]?.tip || '') && !/title="(Fable|Opus): /.test(R.html + R2.html),
      detail: JSON.stringify([R.donuts[2], R2.donuts.slice(2)]) },
    { name: 'ONE SENTENCE PER CAP — THE PILLS TOO: the roster\'s narrow pill and the machine row\'s host pill name a READ cap in capRing\'s words in their tooltips («Fable weekly limit: 42%», «Fable weekly limit resets in …», «next reset in … (Fable weekly limit)» — never «Fa 42%» / «(Fa)»), each pill keeping its two letters («Fa 42% · …»)',
      pass: S.pillTip.includes('Fable weekly limit: 42%') && /Fable weekly limit resets in \S+/.test(S.pillTip) && /\(Fable weekly limit\)/.test(S.pillTip) && !/(^| · )Fa 42%|\(Fa\)/.test(S.pillTip) && /acct-usage-mini[^>]*>Fa 42% · /.test(S.html)
        && R.pillTip.includes('Fable weekly limit: 42%') && !/(^| · )Fa \d+%/.test(R.pillTip) && R2.pillTip.includes('Fable weekly limit: 12%') && R2.pillTip.includes('Opus weekly limit: 80%') && /acct-usage-mini[^>]*>Op 80%/.test(R2.html)
        && hostTip.includes('Fable weekly limit: 42%') && !/(^| · )Fa 42%/.test(hostTip) && />Fa 42%/.test(host),
      detail: [S.pillTip, R2.pillTip, hostTip].join(' | ') },
  ];
};
// THE SHAPE BELONGS TO THE LIMIT SET'S KIND (r4 q1): the Codex roster through the REAL `_renderCodexAccounts` + the repaint
const codexLegs = async (MA) => {
  const C = await codexRoster(MA, CX_WEEK), C5 = await codexRoster(MA, CX), S = await codexRoster(MA, CX_SPARK), SW = await codexRoster(MA, CX_SPARK_WEEK);
  const wk = (ds) => ds.length > 0 && ds.every((d) => d.label === '7d' && /^7d: 31% · resets in /.test(d.tip));
  const P = repaint(MA, 'codex', 'cxs-a', { _codexAccountUsage: { 'cxs-a': CX_WEEK }, _usageEstimates: {} });
  const PS = repaint(MA, 'codex', 'cxs-a', { _codexAccountUsage: { 'cxs-a': CX_SPARK }, _usageEstimates: {} });
  // the Spark donut as the base drew it (the cap's own name, 97 %, red), the pill on it and the row's countdown blocked on it
  const gp = (ds) => { const d = ds.find((x) => x.label === 'GP'); return !!d && /^GPT-5\.3-Codex-Spark: 97% · resets in \S+$/.test(d.tip) && d.style === 'background:conic-gradient(var(--red,#e55) 349deg, var(--bg-input) 349deg)'; };
  const spent = (html) => /<span class="acct-usage-mini[^"]*" style="color:var\(--red,#e55\)" title="[^"]*\bGP 97% · [^"]*usable again in [^"]+ — GP is spent">GP 97% · /.test(html) && /class="acct-usage-next" data-next-ms="\d+" data-bucket="GP" data-blocked="1"/.test(html);
  const cellsOk = (R, want) => !R.err && R.cells.length === 3 && R.cells.every((c) => labels(donutsOf(c)) === want && gp(donutsOf(c)) && spent(c));
  const PC = repaint(MA, 'accounts', 'sub-a', { _accountUsage: { 'sub-a': FIX.fetched }, _usageEstimates: {} });
  return [
    { name: 'THE CAP RING IS CLAUDE\'S LIMIT SET: a Codex week-only push (the real codex-quota normalize — fiveHour null, its 7d alone) draws its 7d ALONE in every row of the real Codex roster (the global login, the named ChatGPT row, the pool row) — no cap ring, no «Fable», no «press ⟳», as the base drew it; with its 5h, 5h + 7d',
      pass: CX_WEEK && CX_WEEK.fiveHour === null && !C.err && C.cells.length === 3 && C.cells.every((c) => wk(donutsOf(c))) && wk(C.donuts) && C.donuts.length === 3 && !/model-scoped|Fable|press ⟳|>cap</.test(C.html)
        && !C5.err && C5.cells.length === 3 && C5.cells.every((c) => labels(donutsOf(c)) === '5h,7d'),
      detail: C.err || JSON.stringify(C.donuts) },
    { name: 'THE 8 s REPAINT KEEPS EACH LIMIT SET: a stamped Codex cell repaints its 7d alone (the snapshot names its harness), a Claude cell its [7d, cap]',
      pass: !P.err && wk(P.donuts) && P.donuts.length === 1 && !/model-scoped|Fable|press ⟳/.test(P.html) && !PC.err && labels(PC.donuts) === '7d,cap' && PC.donuts[1]?.tip === W.fetched,
      detail: P.err || PC.err || JSON.stringify([P.donuts, PC.donuts]) },
    { name: 'A READING\'S OWN CAPS ARE DRAWN FOR EVERY HARNESS: a Codex reading that carries the Spark limit (usage-routes summarizeCodexRateLimits keep() over the real modules — plan 7d 33 % + Spark 5h 90 % / 7d 97 %) draws [5h, 7d, GP] in every row of the real Codex roster (the global login, the named row, the pool row) — «GPT-5.3-Codex-Spark: 97% · resets in …», the pill «GP 97% · …» whose tooltip ends «usable again in … — GP is spent», the row\'s countdown blocked on GP — as the base drew it; with no 5h anywhere, [7d, GP]; never capRing\'s words or its placeholder',
      pass: CX_SPARK.scopedWeekly?.[0]?.name === SPARK && cellsOk(S, '5h,7d,GP') && cellsOk(SW, '7d,GP') && !/weekly limit|model-scoped|press ⟳|>cap</.test(S.html + SW.html),
      detail: S.err || SW.err || JSON.stringify([S.cells.map((c) => labels(donutsOf(c))), SW.cells.map((c) => labels(donutsOf(c))), (S.html.match(/acct-usage-mini[^>]*>/) || [''])[0]]) },
    { name: 'THE 8 s REPAINT KEEPS A READING\'S OWN CAPS: a stamped Codex cell carrying the Spark limit repaints [5h, 7d, GP], the pill on GP and the countdown blocked on it',
      pass: !PS.err && labels(PS.donuts) === '5h,7d,GP' && gp(PS.donuts) && spent(PS.html), detail: PS.err || JSON.stringify(PS.donuts) },
    { name: 'THE ROSTER AND THE CODEX POPUP NAME THE SAME CAP: the popup lists the Spark limit (extraLimitRows) and every Codex roster row draws it — the two twins never disagree on a cap the reading carries',
      pass: (() => { const m = meter(UM, FIX.read, { cx: CX_SPARK }); return !m.err && m.pop.includes(SPARK) && S.cells.length === 3 && S.cells.every((c) => c.includes(`title="${SPARK}: 97%`)); })(), detail: S.err || '' },
  ];
};
// THE TWINS AGREE: the same rings in the same order (NO5H_RINGS) and the same cap state for every no-5h fixture
const twinLegs = (UM, MA, order = US.NO5H_RINGS || ['7d', 'cap']) => { // (the owner's order where the constant is missing — a base copy)
  const rows = ['scoped', 'unread', 'fetched'].map((k) => { const m = meter(UM, FIX[k]), r = roster(MA, FIX[k]); return { k, m: m.donuts, r: r.donuts.slice(0, 2) }; });
  const want = (k) => order.map((x) => (x === '7d' ? '7d' : k === 'scoped' ? 'Fa' : 'cap')).join(',');
  return [
    { name: `THE TWINS AGREE ON THE ORDER: the taskbar's two rings and the roster's donuts are [${order.join(', ')}] for every reading without a 5h window`,
      pass: rows.every(({ k, m, r }) => labels(m) === want(k) && labels(r) === want(k)), detail: JSON.stringify(rows.map(({ k, m, r }) => [k, labels(m), labels(r)])) },
    { name: 'THE TWINS AGREE ON THE CAP\'S STATE and its words (read / not read — no data yet, the last ⟳ returned no cap figure)', pass: rows.every(({ k, m, r }) => {
      const i = order.indexOf('cap'), a = m[i], b = r[i], st = { scoped: 'read', unread: 'unread', fetched: 'unread' }[k];
      return capState(a, 'usage-donut') === st && capState(b, 'acct-donut') === st && (st === 'read' ? a.tip.split(' · ')[0] === b.tip.split(' · ')[0] : a.tip === b.tip);
    }), detail: JSON.stringify(rows) },
  ];
};

const UM = await import(pathToFileURL(path.join(REPO, 'src/lib/usage-meter.js')).href);
const MA = await import(pathToFileURL(path.join(REPO, 'src/lib/manage-agents.js')).href);
console.log('— the taskbar row, the popup and the phone chip (usage-meter `_renderUsage`)');
for (const r of meterLegs(UM)) ok(r.name, r.pass, r.detail);
console.log('— the Agents roster (manage-agents `_acctUsageHtml` + the host pill)');
for (const r of rosterLegs(MA)) ok(r.name, r.pass, r.detail);
console.log('— an empty read proves nothing (the drift fixtures through the real parsers, every twin)');
for (const r of driftLegs(UM, MA)) ok(r.name, r.pass, r.detail);
console.log('— the limit set\'s kind (the real Codex roster `_renderCodexAccounts` + the 8 s repaint)');
for (const r of await codexLegs(MA)) ok(r.name, r.pass, r.detail);
console.log('— the twins (ONE order constant, ONE cap builder)');
for (const r of twinLegs(UM, MA)) ok(r.name, r.pass, r.detail);

// ── THE CAPABILITY: a caps row, never a name ─────────────────────────────────────────────────────────────────────
console.log('— the capability (backend-caps `scopedCapsOnDemand`, agent-meta `scopedCapsReadOnDemand`) and the Spark fixture');
{
  const BC = require(path.join(REPO, 'src/backend-caps.js'));
  const AM = await import(pathToFileURL(path.join(REPO, 'src/lib/agent-meta.js')).href);
  const ids = Object.keys(BC.BACKEND_CAPS || {});
  let contributed = null;
  try { BC.contributeCaps('vs-two-rings-x', { pool: false }); contributed = BC.capsOf('vs-two-rings-x').scopedCapsOnDemand; } finally { BC.contributeCaps?.('vs-two-rings-x', null); }
  const has = typeof AM.scopedCapsReadOnDemand === 'function', on = (b) => has && AM.scopedCapsReadOnDemand(b);
  ok('THE CAPABILITY IS A CAPS ROW: backend-caps `scopedCapsOnDemand` (r5: its model-scoped caps come ONLY from the ⟳ read — r4\'s `modelScopedCap` said Codex had none, and Spark is one) is declared (a boolean) on every shipped row and true for claude alone; an unknown or register()ed harness is false; agent-meta `scopedCapsReadOnDemand` reads the server row (absent = claude)',
    ids.length >= 4 && ids.every((id) => typeof BC.BACKEND_CAPS[id].scopedCapsOnDemand === 'boolean' && !('modelScopedCap' in BC.BACKEND_CAPS[id])) && ids.filter((id) => BC.BACKEND_CAPS[id].scopedCapsOnDemand).join() === 'claude' && BC.capsOf('nope-x').scopedCapsOnDemand === false && contributed === false
      && on('claude') && on(undefined) && !on('codex') && !on('antigravity') && !on('nope-x'),
    JSON.stringify(ids.map((id) => [id, BC.BACKEND_CAPS[id].scopedCapsOnDemand])));
  const UR = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
  ok('THE SPARK FIXTURE IS THE PRODUCT\'S READING: usage-routes summarizeCodexRateLimits keep() still builds a Codex reading with the four lines the fixture repeats over the real modules — and that reading CARRIES the cap (scopedWeekly [GPT-5.3-Codex-Spark 97 %], the 5h from the Spark 5h; the week-only pair has no 5h)',
    KEEP_LINES.every((l) => UR.includes(l)) && CX_SPARK.scopedWeekly?.length === 1 && CX_SPARK.scopedWeekly[0].name === SPARK && Math.round(CX_SPARK.scopedWeekly[0].utilization * 100) === 97 && CX_SPARK.fiveHour?.usedPercent === 90 && CX_SPARK.sevenDay?.usedPercent === 33
      && CX_SPARK_WEEK.fiveHour == null && CX_SPARK_WEEK.scopedWeekly?.[0]?.name === SPARK, JSON.stringify([KEEP_LINES.filter((l) => !UR.includes(l)), CX_SPARK.scopedWeekly, CX_SPARK_WEEK.fiveHour]));
  const src = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8'), a = src.indexOf('  _acctUsageHtml(u, est, probeNote = null'), body = a > 0 ? src.slice(a, src.indexOf('\n  },', a)) : '';
  ok('…the renderer never names a harness: `_acctUsageHtml` compares no backend id and asks `scopedCapsReadOnDemand(backend)` for capRing alone — every other harness\'s caps through `readingCaps`; the Codex roster\'s rows (named + global via usageHtml, the pool row) and the repaint hand their harness',
    body.length > 2000 && !/[!=]==?\s*'(?:claude|codex|antigravity|opencode|shell)'|'(?:claude|codex|antigravity|opencode|shell)'\s*[!=]==?/.test(body) && body.includes('!scopedCapsReadOnDemand(backend) ? null : capRing(') && body.includes('acctCap ? acctCap.all : readingCaps(u, est);')
      && src.includes("const usageHtml = (u) => this._acctUsageHtml(u, null, null, 'codex');") && src.includes("this._usageEstimates?.[a.current], null, 'codex')") && src.includes('probeNoteOfCell(cell.dataset), snap.backend);'));
}

// ── capRing, the ONE builder (pure) ──────────────────────────────────────────────────────────────────────────────
console.log('— capRing (usage-source, PURE)');
{
  const QM = await import(pathToFileURL(path.join(REPO, 'src/quota-model.js')).href);
  const { estDisplayPair: pair } = await import(pathToFileURL(path.join(REPO, 'src/lib/utils.js')).href);
  const c = (u, est = null, o = {}) => US.capRing(QM, u, est, Date.now(), { pair, ...o });
  ok('NO5H_RINGS is ONE constant: [\'7d\', \'cap\'] — 7d first, as the owner listed it', JSON.stringify(US.NO5H_RINGS) === '["7d","cap"]');
  ok('capRing is usage-source\'s ONE cap-ring builder (exported, PURE)', typeof US.capRing === 'function');
  ok('readingCaps — A READING\'S OWN CAPS (u1): every cap the reading carries, in its order, as the base drew them — two letters, the cap\'s own name for the donut\'s tooltip, no pill words, no reading instant of its own (a malformed list ⇒ none); capRing builds on the same list (its caps = these, in capRing\'s words)',
    typeof US.readingCaps === 'function' && typeof US.capRing === 'function' && (() => { const sp = US.readingCaps(CX_SPARK), m2 = US.readingCaps(FIX.multi), all = c(FIX.multi).all;
      return sp.length === 1 && sp[0].label === 'GP' && sp[0].tipName === SPARK && sp[0].words === null && sp[0].bucket === CX_SPARK.scopedWeekly[0] && !('readAt' in sp[0]) && m2.map((x) => x.label).join() === 'Fa,Op'
        && all.map((x) => x.name).join() === m2.map((x) => x.name).join() && all.every((x) => x.words === x.tipName && / weekly limit$/.test(x.words)) && !US.readingCaps(null).length && !US.readingCaps({ scopedWeekly: 'x' }).length; })());
  if (typeof US.capRing === 'function') {
  const r = c(FIX.scoped), m = c(FIX.multi);
  ok('read: the cap\'s own reading, aged by scopedFetchedAt (the popup\'s readAt), two letters + the popup\'s section title', r.state === 'read' && r.label === 'Fa' && r.tipName === 'Fable weekly limit' && r.pct === 42 && r.readAt === FIX.scoped.scopedFetchedAt && r.bucket === FABLE && !r.rest.length);
  ok('several caps: the one that exhausts first leads, the others follow (rest)', m.label === 'Op' && m.rest.map((x) => x.label).join() === 'Fa');
  ok('all: every cap in the READING\'s order (a row with a 5h window draws them so); not read ⇒ []', m.all?.map((x) => x.label).join() === 'Fa,Op' && r.all?.length === 1 && r.all[0] === r.all.find((x) => x.label === 'Fa') && c(FIX.fetched).all?.length === 0 && c(FIX.unread).all?.length === 0);
  const ns = c({ ...FIX.multi, scopedWeekly: [{ name: 'Fable', utilization: 0.12, resetsAt: nowS + D }, { name: 'Opus', utilization: 0.9, state: 'empty' }] });
  ok('…a window not started never leads (the popup\'s chip rule)', ns.label === 'Fa', ns.label);
  const ed = c({ ...FIX.multi, scopedWeekly: [{ name: 'Fable', utilization: 0.3, resetsAt: nowS + D }, { name: 'Opus', utilization: 0.2, resetsAt: nowS + D }] }, { scopedWeekly: [{ name: 'Opus', utilization: 0.6, resetsAt: nowS + D }] });
  ok('…an estimate counts the way the chip counts it (Opus est 60 % over Fable 30 %)', ed.label === 'Op', ed.label);
  ok('not read, no ⟳ read: «cap» + «… no data yet — press ⟳» (lastReadAt null); an older estimate\'s name labels it; refresh off ⇒ the popup\'s sentence',
    c(FIX.unread).state === 'unread' && c(FIX.unread).label === 'cap' && c(FIX.unread).tip === W.unread && !c(FIX.unread).lastReadAt && c(FIX.unread, EST_KNOWN).label === 'Fa' && c(FIX.unread, EST_KNOWN).tip === W.known && c(FIX.unread, null, { refreshOff: true }).tip === W.off);
  const states = [FIX.scoped, FIX.unread, FIX.fetched, FIX.multi, FIX.read, FIX.fetchedFive, DRIFT.panel, DRIFT.oauth, null, { fetchedAt: at, sevenDay: WEEK }].map((u) => c(u).state);
  ok('TWO STATES — read and not read: a ⟳ read that named no cap is NOT READ, saying its fact «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again» (`lastReadAt` = scopedFetchedAt; an older estimate\'s name labels it; refresh off ⇒ the popup\'s sentence) — no reading, fixture or drift ever answers «none» or the absence words',
    c(FIX.fetched).state === 'unread' && c(FIX.fetched).tip === W.fetched && c(FIX.fetched).lastReadAt === READ_AT && c(FIX.fetched, EST_KNOWN).tip === W.knownFetched && c(FIX.fetched, null, { refreshOff: true }).tip === W.off
      && states.every((s) => s === 'read' || s === 'unread') && !states.includes('none') && c(DRIFT.panel).tip === W.fetched && c(DRIFT.oauth).tip === W.fetched, JSON.stringify(states));
  }
}

// ── THE CONTROL: the base's rule restored in a copy renders every 5h-present case byte-identical ───────────────────
const M = mutantCopies('two-rings', REPO);
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const patched = async (rel, tag, swaps, extra = []) => {
  let src = srcOf(rel);
  for (const [a, b] of [...swaps, ...extra]) { if (src.split(a).length !== 2) return null; src = src.replace(a, b); }
  try { return await import(pathToFileURL(M.write(rel, src, tag)).href); } catch { return null; } // a copy that does not compile on this tree is no mutant (never a crash)
};
const UM_ROW = `rows.push(ring ? ringRow('claude', NO5H_RINGS.map((k) => ring[k])) : renderRow('claude', '5h', pct5h, '7d', pct7d, noData, [p5, p7], [v5, v7]));`;
const UM_NOTE = '${acctCap.lastReadAt ? escHtml(acctCap.tip) : odOff';
const UM_BASE = [[UM_ROW, `rows.push(renderRow('claude', has5h || noData ? '5h' : null, pct5h, '7d', pct7d, noData, [p5, p7], [v5, v7]));`],
  ['      renderPie(primaryLabel, primaryPct, noData, pairs?.[0], views?.[0]), renderPie(', "      ...(primaryLabel == null ? [] : [renderPie(primaryLabel, primaryPct, noData, pairs?.[0], views?.[0])]), renderPie("],
  [UM_NOTE, '${odOff'],
  ['      </div>` : `<div class="usage-session usage-session-unread" data-window="5h">\n        <div class="usage-session-name">${t(\'5-hour limit\')}</div>\n        <div class="usage-session-stats"><span class="usage-stat">${escHtml(t(\'no data yet\'))}</span></div>\n      </div>`}', "      </div>` : ''}"]];
const MA_PARTS = ": ring ? NO5H_RINGS.flatMap((k) => ring[k]) : [...(has5h ? [donut('5h', u.fiveHour, null, est?.fiveHour)] : []), donut('7d'";
const MA_GATE = 'const acctCap = wins || !scopedCapsReadOnDemand(backend) ? null : capRing(';
const MA_5H_CAPS = 'if (!cap) parts.push(...caps.map(capDonut));', MA_CAPS = 'const caps = wins ? [] : acctCap ? acctCap.all : readingCaps(u, est);';
const MA_PILL_CAPS = "...caps.map((c) => [c.label, c.bucket, c.est, 'weekly', c.words])", MA_BASE_PILL_CAPS = "...(u.scopedWeekly || []).map((sc) => [String(sc.name || '?').slice(0, 2), sc, scEst(sc.name), 'weekly'])";
const MA_BASE_CAPS = "const scEst = (name) => (est?.scopedWeekly || []).find((x) => String(x?.name || '').toLowerCase() === String(name || '').toLowerCase()) || null; if (!wins) for (const sc of (u.scopedWeekly || [])) parts.push(donut(String(sc.name || '?').slice(0, 2), sc, sc.name, scEst(sc.name)));";
const MA_PILL_WORDS = '${words ? `${words}:` : l} ${isE ?', MA_HOST_WORDS = '${words ? `${words}:` : l} ${pctOf(x)}%';
const MA_BASE = [['const cap = has5h ? null : acctCap;', 'const cap = null;'], [MA_5H_CAPS, MA_BASE_CAPS], [MA_PILL_CAPS, MA_BASE_PILL_CAPS],
  [MA_PILL_WORDS, '${l} ${isE ?'], ['if (wEta) etaTitle = `${wWords || wl} ', 'if (wEta) etaTitle = `${wl} '], ['label: words || label, spentPct', 'label, spentPct'], [MA_HOST_WORDS, '${l} ${pctOf(x)}%']];
console.log('— THE CONTROL: the base\'s rule restored in a copy draws every 5h-present case byte-identical (the cap\'s words aside)');
{
  const UB = await patched('src/lib/usage-meter.js', 'base-rule', UM_BASE), MB = await patched('src/lib/manage-agents.js', 'base-rule', MA_BASE);
  ok('control: the base\'s rule is found in the current source (usage-meter 4 swaps, manage-agents 7)', !!UB && !!MB);
  if (UB && MB) {
    const live = meter(UM, FIX.read), base = meter(UB, FIX.read);
    ok('CONTROL 5h PRESENT (+ a Fable reading): the taskbar row + the popup + the phone chip are BYTE-IDENTICAL to the base rule\'s', live.bar === base.bar && live.pop === base.pop && live.chip === base.chip && live.bar.length > 200, `${live.bar.length}/${base.bar.length} · ${live.pop.length}/${base.pop.length}`);
    const n5 = meter(UM, FIX.fetchedFive), n5b = meter(UB, FIX.fetchedFive);
    ok('CONTROL 5h PRESENT + a ⟳ read that named no cap: the taskbar row + the phone chip BYTE-IDENTICAL; the popup IDENTICAL EXCEPT ITS SCOPED NOTE\'S WORDS (the ring\'s «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again» where the base said «⟳ fetches them on demand»)',
      n5.bar === n5b.bar && n5.chip === n5b.chip && n5.pop !== n5b.pop && n5.pop.replace(W.fetched, W.passive) === n5b.pop, `${n5.pop.length}/${n5b.pop.length}`);
    // the cap's words back to the base's: a donut's «Fable weekly limit: » ⇒ «Fable: », a pill's ⇒ its two letters
    const words = (h) => h.replace(/title="(Fable|Opus) weekly limit: /g, 'title="$1: ').replace(/(Fable|Opus) weekly limit:? ?/g, (x, n) => n.slice(0, 2) + (x.endsWith(' ') ? ' ' : ''));
    const lv = roster(MA, FIX.read).html, bv = roster(MB, FIX.read).html, lm = roster(MA, FIX.multiFive).html, bm = roster(MB, FIX.multiFive).html;
    ok('CONTROL 5h PRESENT: the roster cell — its THREE donuts (5h, 7d, Fa), the pill, the countdowns — is IDENTICAL to the base rule\'s EXCEPT THE CAP TOOLTIP\'S WORDS («Fable weekly limit: 42% · …» where the base said «Fable: 42% · …», «Fable weekly limit: 42%» where its pill said «Fa 42%»; several caps: each one, the reading\'s order kept)',
      lv !== bv && words(lv) === bv && (lv.match(/ weekly limit: /g) || []).length === 2 && lm !== bm && words(lm) === bm && roster(MB, FIX.read).donuts.length === 3, `${lv.length}/${bv.length} · ${lm.length}/${bm.length}`);
    const z = meter(UM, null), zb = meter(UB, null);
    ok('CONTROL NO READING: [5h, 7d] «no data yet» byte-identical to the base rule\'s', z.bar === zb.bar && z.chip === zb.chip);
    const bs = meter(UB, FIX.scoped);
    ok('CONTROL: …the base rule really is the owner\'s screenshot — ONE ring for a Claude row without a 5h (the RED this lane turns green)', bs.donuts.length === 1 && bs.donuts[0].label === '7d', JSON.stringify(bs.donuts));
    ok('CONTROL: the CODEX taskbar row and the phone chip are byte-identical to the base rule\'s in every Claude state, and for a Codex week-only push', ['scoped', 'unread', 'fetched', 'multi', 'read', 'fetchedFive', 'multiFive'].every((k) => { const a = meter(UM, FIX[k]), b = meter(UB, FIX[k]); return a.xRow === b.xRow && a.chip === b.chip; })
      && (() => { const a = meter(UM, FIX.scoped, { cx: CX_WEEK }), b = meter(UB, FIX.scoped, { cx: CX_WEEK }); return a.xRow === b.xRow && a.xRow.length > 50 && !/model-scoped|Fable|press ⟳/.test(a.xRow); })());
    ok('CONTROL: the 7d ring of every no-5h row is byte-identical to the base rule\'s 7d ring (the taskbar and the roster)', ['scoped', 'unread', 'fetched'].every((k) => {
      const a = meter(UM, FIX[k]).donuts.find((d) => d.label === '7d'), b = meter(UB, FIX[k]).donuts[0], ra = roster(MA, FIX[k]).donuts.find((d) => d.label === '7d'), rb = roster(MB, FIX[k]).donuts[0];
      return !!a && JSON.stringify(a) === JSON.stringify(b) && !!ra && JSON.stringify(ra) === JSON.stringify(rb);
    }));
    const cw = await codexRoster(MA, CX_WEEK), cwb = await codexRoster(MB, CX_WEEK), c5 = await codexRoster(MA, CX), c5b = await codexRoster(MB, CX);
    ok('CONTROL CODEX: the real Codex roster (the global login, the named row, the pool row) is BYTE-IDENTICAL to the base rule\'s — for a week-only push and for a 5h + 7d one',
      !cw.err && cw.html.length > 1000 && cw.html === cwb.html && c5.html === c5b.html, `${cw.html.length}/${cwb.html.length} · ${c5.html.length}/${c5b.html.length}`);
    const sp = await codexRoster(MA, CX_SPARK), spb = await codexRoster(MB, CX_SPARK), sw = await codexRoster(MA, CX_SPARK_WEEK), swb = await codexRoster(MB, CX_SPARK_WEEK);
    const rp = repaint(MA, 'codex', 'cxs-a', { _codexAccountUsage: { 'cxs-a': CX_SPARK }, _usageEstimates: {} }), rpb = repaint(MB, 'codex', 'cxs-a', { _codexAccountUsage: { 'cxs-a': CX_SPARK }, _usageEstimates: {} });
    ok('CONTROL CODEX SPARK: a Codex reading that CARRIES the Spark limit draws the real Codex roster (global, named, pool) and the 8 s repaint BYTE-IDENTICAL to the base rule\'s — its three donuts, the pill, the countdown; week-only (7d + GP) too',
      !sp.err && sp.html.length > 1000 && sp.html === spb.html && /data-bucket="GP" data-blocked="1"/.test(sp.html) && sw.html === swb.html && !rp.err && rp.html === rpb.html && rp.html.length > 500, `${sp.html.length}/${spb.html.length} · ${sw.html.length}/${swb.html.length} · ${rp.html.length}/${rpb.html.length}`);
  }
}

// ── THE DEVICE'S LANGUAGE (u2): the twins in copies whose i18n reads the zh dictionary — the i18n module picks its dictionary
// once, at load, from the device, so a copy of it is pinned to zh (every copy's other imports point at the real tree) ────────
const ZH = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, JA = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
const zhTwins = async (tag, usUrl = null) => {
  const pin = 'const _dict = DICTS[resolveLang()] || null;', i18n = srcOf('src/lib/i18n.js');
  if (i18n.split(pin).length !== 2) return null;
  const url = pathToFileURL(M.write('src/lib/i18n.js', i18n.replace(pin, 'const _dict = DICTS.zh;'), tag)).href;
  const us = usUrl ? [["} from './usage-source.js';", `} from '${usUrl}';`]] : [];
  const um = await patched('src/lib/usage-meter.js', tag, [["import { t, tc, deviceLocale } from './i18n.js';", `import { t, tc, deviceLocale } from '${url}';`], ...us]);
  const ma = await patched('src/lib/manage-agents.js', tag, [["import { t } from './i18n.js';", `import { t } from '${url}';`], ...us]);
  return um && ma ? { um, ma } : null;
};
const zhLegs = (T) => {
  const m = meter(T.um, FIX.unread), o = meter(T.um, FIX.fetched), r = roster(T.ma, FIX.unread), ro = roster(T.ma, FIX.fetched);
  const what = ZH['model-scoped weekly cap (e.g. Fable)'], last = String(ZH[R5_KEY] || '').replace('{when}', US.resetInstantText ? US.resetInstantText(READ_AT, Date.now()) : '?');
  return [{ name: 'THE HOLE SPEAKS THE DEVICE\'S LANGUAGE (u2): the not-read ring\'s label goes through t() — a zh render of the taskbar row and the roster draws «限» in the hole (zh and ja «限»: the character of 上限 / 制限, one glyph the hole holds), its tooltip in zh, and never the English «cap»',
    pass: ZH.cap === '限' && JA.cap === '限' && !m.err && !r.err && [m, o, r, ro].every((Y) => labels(Y.donuts) === '7d,限') && !/>cap</.test(m.cRow + o.cRow + r.html + ro.html)
      && m.donuts[1]?.tip === `${what}: ${ZH['no data yet — press ⟳']}` && ro.donuts[1]?.tip === `${what}: ${last}` && o.donuts[1]?.tip === ro.donuts[1]?.tip,
    detail: m.err || r.err || JSON.stringify([m.donuts, ro.donuts]) }];
};
console.log('— the device\'s language (the twins in zh copies — the hole label through t())');
{
  const Z = await zhTwins('zh');
  if (Z) for (const r of zhLegs(Z)) ok(r.name, r.pass, r.detail); else ok('zh: the twins\' i18n import and the dictionary pin exist', false);
}

// ── THE has5h CENSUS: every site in src/lib is a registered, DRIVEN twin (twin-sets are re-measured, never assumed) ──
const SITES = {
  'usage-meter.js': [
    ['const has5h = !!(rl && rl.fiveHour', 'the presence test the row and the popup read'],
    ['const cap = has5h ? null : acctCap;', 'the taskbar row\'s second ring ⇒ «taskbar NO 5h …» legs'],
    ['chipWorst = Math.max(chipWorst, has5h ?', 'the phone chip (the base\'s count) ⇒ «the PHONE chip»'],
    ['${has5h ? `<div class="usage-session">', 'the popup\'s 5-hour section ⇒ «popup: the 5-hour section …»'],
  ],
  'manage-agents.js': [
    ['const has5h = !!(u.fiveHour', 'the presence test the roster reads'],
    ['const cap = has5h ? null : acctCap;', 'the roster\'s [7d, cap] ⇒ «roster NO 5h …» legs (with a 5h: acctCap.all ⇒ «ONE SENTENCE PER CAP»)'],
    ["[...(has5h ? [donut('5h', u.fiveHour", 'the base\'s [5h?, 7d] (+ the caps the reading carries, r5) for a harness whose caps ride its pushes (a Codex week-only push: its 7d alone, r4; a Spark reading: 7d + GP) ⇒ «THE CAP RING IS CLAUDE\'S LIMIT SET» / «A READING\'S OWN CAPS …»'],
    ["[...(has5h ? [['5h', u.fiveHour", 'the narrow pill\'s bucket list (no 5h figure; its tooltip says the cap ring\'s words) ⇒ «roster: the narrow pill»'],
  ],
};
const DRIVERS = {
  'usage-meter.js': (Mod) => labels(meter(Mod, FIX.scoped).donuts) === '7d,Fa' && labels(meter(Mod, FIX.fetched).donuts) === '7d,cap',
  'manage-agents.js': (Mod) => labels(roster(Mod, FIX.scoped).donuts) === '7d,Fa' && labels(roster(Mod, FIX.fetched).donuts) === '7d,cap',
};
const censusOf = (word, rows) => (texts) => {
  const sites = [], unregistered = [], used = new Set(), re = new RegExp(`\\b${word}\\b`);
  for (const [f, src] of Object.entries(texts)) if (src.includes(word)) src.split('\n').forEach((line, i) => { // (a file never naming the word has no site — skipped whole)
    if (!line.includes(word) || !re.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
    const row = (rows[f] || []).find(([needle]) => line.includes(needle));
    if (row) { used.add(f + '\0' + row[0]); sites.push(`${f}:${i + 1} — ${row[1]}`); } else unregistered.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
  const dead = Object.entries(rows).flatMap(([f, rs]) => rs.filter(([n]) => !used.has(f + '\0' + n)).map(([n]) => `${f}: ${n}`));
  return { sites, unregistered, dead };
};
const census = censusOf('has5h', SITES);
const LIB = path.join(REPO, 'src/lib');
const TEXTS = Object.fromEntries(fs.readdirSync(LIB).filter((f) => f.endsWith('.js') && !/^i18n-/.test(f)).map((f) => [f, fs.readFileSync(path.join(LIB, f), 'utf8')]));
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
console.log('— THE has5h CENSUS over src/lib');
{
  const c = census(TEXTS);
  for (const s of c.sites) console.log('    · ' + s);
  ok(`census: every has5h site in src/lib is registered (${c.sites.length} sites in ${Object.keys(SITES).length} files)`, !c.unregistered.length && c.sites.length >= 8, JSON.stringify(c.unregistered));
  ok('census: …no dead row (a registered site that no longer exists)', !c.dead.length, JSON.stringify(c.dead));
  const undriven = [...new Set(c.sites.map((s) => s.split(':')[0]))].filter((f) => !DRIVERS[f]);
  ok('census: …every file with a site is DRIVEN, and each driver draws a no-5h reading as [7d, cap]', !undriven.length && DRIVERS['usage-meter.js'](UM) && DRIVERS['manage-agents.js'](MA), JSON.stringify(undriven));
  const r1 = census({ ...TEXTS, 'usage-source.js': TEXTS['usage-source.js'] + '\nconst has5h = !!(x && x.fiveHour);\n' });
  ok('census RED: a has5h in a THIRD file is named by file:line (a twin nobody drives)', r1.unregistered.length === 1 && /^usage-source\.js:\d+: const has5h/.test(r1.unregistered[0]), JSON.stringify(r1.unregistered));
}
// ── THE CAP-RING CENSUS: ONE builder — `capRing` is called by the twins (and the host pill), and every other scopedWeekly
// reader in src/lib is a registered NON-ring surface (a second copy of the cap ring would be a new, unregistered reader) ────
const SCOPED = {
  'usage-source.js': [['const scopedEstOf = (estSel, name) => (estSel?.scopedWeekly', 'a cap\'s estimate (readingCaps, capRing)'], ['return (Array.isArray(reading?.scopedWeekly)', 'readingCaps — THE reading of the caps (the roster for every harness, capRing on top)'], ['const known = (estSel?.scopedWeekly', 'capRing — the not-read ring\'s name']],
  'usage-meter.js': [['for (const sc of rl?.scopedWeekly', 'the popup\'s scoped sections (a bar per cap, not a ring)'], ['const scEst = (estSel?.scopedWeekly', '…their estimate lookup']],
  'session-lifecycle.js': [['const scoped = (u.scopedWeekly', 'the billing switcher\'s text segments (not a ring)'], ['const e = (est?.scopedWeekly', '…their estimate lookup']],
};
const scopedCensus = censusOf('scopedWeekly', SCOPED);
console.log('— THE CAP-RING CENSUS over src/lib (ONE builder, never a second copy)');
{
  const c = scopedCensus(TEXTS);
  ok(`cap census: every scopedWeekly reader in src/lib is registered (${c.sites.length} lines) and none is dead`, !c.unregistered.length && !c.dead.length && c.sites.length >= 7, JSON.stringify([c.unregistered, c.dead]));
  ok('cap census: the roster reads no scopedWeekly itself — every cap it draws (the ring, a 5h row\'s donuts, the narrow pill, the host pill) comes from capRing or, for a harness whose caps ride its pushes, readingCaps', !/\bscopedWeekly\b/.test(code(TEXTS['manage-agents.js'])));
  const rc = Object.entries(TEXTS).filter(([, src]) => src.includes('readingCaps(')).flatMap(([f, src]) => (code(src).match(/(?<!function )\breadingCaps\(/g) || []).map(() => f)).sort().join();
  ok('cap census: readingCaps(…) — a reading\'s own caps — is called by capRing and the roster renderer alone (usage-source ×1, manage-agents ×1)', rc === 'manage-agents.js,usage-source.js', rc);
  const calls = Object.entries(TEXTS).flatMap(([f, src]) => (src.match(/\bcapRing\(quotaModel,/g) || []).map(() => f)).sort().join();
  ok('cap census: capRing(quotaModel, …) is called by the two twins and the machine row\'s host pill (manage-agents ×2, usage-meter ×1) — never a second builder', calls === 'manage-agents.js,manage-agents.js,usage-meter.js', calls);
  const r2 = scopedCensus({ ...TEXTS, 'usage-meter.js': TEXTS['usage-meter.js'] + '\nconst fable = (rl?.scopedWeekly || [])[0];\n' });
  ok('cap census RED: a second copy of the cap ring (a new scopedWeekly reader in a twin) is named by file:line', r2.unregistered.length === 1 && /^usage-meter\.js:\d+: const fable/.test(r2.unregistered[0]), JSON.stringify(r2.unregistered));
}

// ── THE MUTANTS: each law's bypass in a patched copy reds its own leg BY NAME ─────────────────────────────────────
console.log('— mutants (each reds its own leg by name)');
{
  const red = (tag, legs, needle) => {
    const failed = legs.filter((r) => !r.pass).map((r) => r.name);
    ok(`mutant ${tag}: reds «${needle}» (${failed.length} red)`, failed.some((n) => n.startsWith(needle)), failed.join(' | ').slice(0, 240));
  };
  // a usage-source copy reaches the twins through a twin copy whose import names it (the copies' relative imports point at the real tree)
  const viaSource = async (tag, swaps, { roster: withRoster = true } = {}) => {
    let src = srcOf('src/lib/usage-source.js');
    for (const [a, b] of swaps) { if (src.split(a).length !== 2) return null; src = src.replace(a, b); }
    const url = pathToFileURL(M.write('src/lib/usage-source.js', src, tag)).href;
    const um = await patched('src/lib/usage-meter.js', tag, [["} from './usage-source.js';", `} from '${url}';`]]);
    const ma = withRoster ? await patched('src/lib/manage-agents.js', tag, [["} from './usage-source.js';", `} from '${url}';`]]) : true;
    return um && ma ? { um, ma } : null;
  };
  const muts = [
    ['src/lib/usage-meter.js', 'um-r1-slash', 'r1\'s slashed 5h ring back beside the 7d', [[UM_ROW, `rows.push(ring ? ringRow('claude', [capPie({ state: 'none', label: '5h', tip: '5h: no 5-hour limit on this account' }), ring['7d']]) : renderRow('claude', '5h', pct5h, '7d', pct7d, noData, [p5, p7], [v5, v7]));`]], meterLegs, 'taskbar NO 5h + a scoped reading: TWO rings [7d, Fa]'],
    ['src/lib/usage-meter.js', 'um-cap-dropped', 'the cap ring dropped (one ring)', [['ringRow(\'claude\', NO5H_RINGS.map((k) => ring[k]))', 'ringRow(\'claude\', [ring[\'7d\']])']], meterLegs, 'taskbar NO 5h + a scoped reading: TWO rings [7d, Fa]'],
    ['src/lib/manage-agents.js', 'ma-third-donut', 'the roster keeping a third donut beside an empty 5h', [[MA_PARTS, ": ring ? [capDonut({ state: 'unread', label: '5h', tip: '5h: no data yet' }), ...NO5H_RINGS.flatMap((k) => ring[k])] : [...(has5h ? [donut('5h', u.fiveHour, null, est?.fiveHour)] : []), donut('7d'"]], rosterLegs, 'roster NO 5h + a scoped reading: TWO donuts [7d, Fa]'],
    ['src/lib/manage-agents.js', 'ma-week-alone', 'the base\'s week-alone roster when no cap is read', [['const ring = cap && {', 'const ring = cap && cap.state === \'read\' && {']], rosterLegs, 'roster NO 5h + no scoped reading: [7d, cap]'],
    ['src/lib/manage-agents.js', 'ma-5h-bare-tip', 'the 5h row\'s cap donut back in the base\'s bare words', [[MA_5H_CAPS, MA_BASE_CAPS.replace('if (!wins)', 'if (!wins && !cap)')]], rosterLegs, 'ONE SENTENCE PER CAP: the roster'],
    ['src/lib/manage-agents.js', 'ma-5h-lead-first', 'the 5h row\'s caps reordered worst-first (never the base\'s order)', [['parts.push(...caps.map(capDonut))', 'parts.push(...(acctCap ? [acctCap, ...acctCap.rest] : caps).map(capDonut))']], rosterLegs, 'roster WITH a 5h window'],
    ['src/lib/usage-meter.js', 'um-popup-passive', 'the popup still saying «⟳ fetches them on demand» after a ⟳ read named no cap', [[UM_NOTE, '${odOff']], meterLegs, 'THE POPUP SAYS THE RING\'S SENTENCE'],
    ['src/lib/manage-agents.js', 'ma-pill-two-letters', 'the narrow pill naming a read cap by two letters («Fa 42%»)', [[MA_PILL_WORDS, '${l} ${isE ?']], rosterLegs, 'ONE SENTENCE PER CAP — THE PILLS TOO'],
    ['src/lib/manage-agents.js', 'ma-host-two-letters', 'the host pill naming a read cap by two letters', [[MA_HOST_WORDS, '${l} ${pctOf(x)}%']], rosterLegs, 'ONE SENTENCE PER CAP — THE PILLS TOO'],
  ];
  for (const [rel, tag, what, swaps, legsOf, needle] of muts) {
    const Mod = await patched(rel, tag, swaps);
    if (!Mod) { ok(`mutant ${tag} (${what}): the patched line exists`, false); continue; }
    red(`${tag} (${what})`, legsOf(Mod), needle);
  }
  // THE LIMIT SET'S KIND (q1): r3's capRing for every backend; the repaint losing the harness; the Codex rows not naming theirs
  const cxMuts = [
    ['ma-every-backend', 'capRing for every backend (r3: a Codex week-only push drew a «Fable» cap ring)', [[MA_GATE, 'const acctCap = wins ? null : capRing(']], 'THE CAP RING IS CLAUDE\'S LIMIT SET'],
    ['ma-repaint-no-backend', 'the 8 s repaint dropping the snapshot\'s harness', [['probeNoteOfCell(cell.dataset), snap.backend);', 'probeNoteOfCell(cell.dataset));']], 'THE 8 s REPAINT KEEPS EACH LIMIT SET'],
    ['ma-codex-row-unnamed', 'the Codex roster\'s rows not naming their harness', [["const usageHtml = (u) => this._acctUsageHtml(u, null, null, 'codex');", 'const usageHtml = (u) => this._acctUsageHtml(u);']], 'THE CAP RING IS CLAUDE\'S LIMIT SET'],
    // u1: r4's gate (the caps row skipping EVERY cap — Spark gone from the Codex roster) and the Codex caps in capRing's words
    ['ma-skip-every-cap', 'r4\'s gate: a harness whose caps ride its pushes draws none of them (the Spark donut, pill bucket and countdown gone)', [[MA_CAPS, 'const caps = acctCap ? acctCap.all : [];']], ['A READING\'S OWN CAPS ARE DRAWN FOR EVERY HARNESS', 'THE 8 s REPAINT KEEPS A READING\'S OWN CAPS', 'THE ROSTER AND THE CODEX POPUP NAME THE SAME CAP']],
    ['ma-codex-caps-in-capring-words', 'a Codex cap drawn in capRing\'s words (never the base\'s)', [[MA_CAPS, 'const caps = wins ? [] : acctCap ? acctCap.all : capRing(quotaModel, u, est, now, { pair: estDisplayPair, t }).all;']], 'A READING\'S OWN CAPS ARE DRAWN FOR EVERY HARNESS'],
  ];
  for (const [tag, what, swaps, needles] of cxMuts) {
    const Mod = await patched('src/lib/manage-agents.js', tag, swaps);
    if (!Mod) { ok(`mutant ${tag} (${what}): the patched line exists`, false); continue; }
    const legs = await codexLegs(Mod);
    for (const needle of [needles].flat()) red(`${tag} (${what})`, legs, needle);
  }
  // the twins disagreeing on the order: the roster hard-codes its own
  const MO = await patched('src/lib/manage-agents.js', 'ma-own-order', [['ring ? NO5H_RINGS.flatMap((k) => ring[k])', "ring ? ['cap', '7d'].flatMap((k) => ring[k])"]]);
  if (MO) red('ma-own-order (the taskbar and the roster disagreeing on the order)', twinLegs(UM, MO), 'THE TWINS AGREE ON THE ORDER'); else ok('mutant ma-own-order: the patched line exists', false);
  // the cap's «no data yet» drawn as read (0 %): capRing hands the twins a read ring with nothing read
  const U0 = await viaSource('us-unread-as-read', [["return { state: 'unread', label:", "return { state: 'read', pct: 0, pair: { darkPct: 0, estPct: null, rolled: false }, view: { reading: {}, unconfirmed: false }, bucket: {}, tipName: 'cap', label:"]]);
  if (U0) { red('us-unread-as-read (the cap\'s «no data yet» drawn as read, 0 %)', meterLegs(U0.um), 'taskbar NO 5h + no scoped reading'); red('us-unread-as-read (roster)', rosterLegs(U0.ma), 'roster NO 5h + no scoped reading'); } else ok('mutant us-unread-as-read: the patched line exists', false);
  const U1 = await viaSource('us-first-cap', [['const lead = caps.reduce((a, b) => (b.eff > a.eff ? b : a));', 'const lead = caps[0];']], { roster: false });
  if (U1) red('us-first-cap (the first cap, not the one that exhausts first)', meterLegs(U1.um), 'taskbar NO 5h + SEVERAL caps'); else ok('mutant us-first-cap: the patched line exists', false);
  // AN EMPTY READ PROVES NOTHING (q2): r3's «none» back — an empty ⟳ read called «no model-scoped cap on this account»
  const U3 = await viaSource('us-none-back', [["  const what = known ? t('{name} weekly limit'", "  if (!known && Number(reading?.scopedFetchedAt) > 0) return { state: 'none', label: 'cap', tip: t('no model-scoped cap on this account'), readAt, rest: [], all: [] };\n  const what = known ? t('{name} weekly limit'"]]);
  if (U3) { red('us-none-back (r3\'s «none» on an empty ⟳ read — taskbar)', meterLegs(U3.um), 'A ⟳ READ THAT NAMED NO CAP PROVES NOTHING (taskbar)'); red('us-none-back (roster)', rosterLegs(U3.ma), 'A ⟳ READ THAT NAMED NO CAP PROVES NOTHING (roster)'); red('us-none-back (the drifted panel)', driftLegs(U3.um, U3.ma), 'THE DRIFTED PANEL'); } else ok('mutant us-none-back: the patched line exists', false);
  // u2: the hole back to the literal English «cap» (no t()) — a zh render says «cap»
  { let src = srcOf('src/lib/usage-source.js'); const a = ": t('cap'), name: known || null,";
    const url = src.split(a).length === 2 ? pathToFileURL(M.write('src/lib/usage-source.js', src.replace(a, ": 'cap', name: known || null,"), 'us-hole-english')).href : null;
    const Z = url && await zhTwins('us-hole-english', url);
    if (Z) red('us-hole-english (the not-read hole the literal English «cap», no t())', zhLegs(Z), 'THE HOLE SPEAKS THE DEVICE\'S LANGUAGE'); else ok('mutant us-hole-english: the patched line exists', false); }
  // …and the ONE constant really is one: flipped in a copy, BOTH twins flip (never a mutant — the owner may ask for it)
  const U2 = await viaSource('us-flip', [["export const NO5H_RINGS = ['7d', 'cap'];", "export const NO5H_RINGS = ['cap', '7d'];"]]);
  if (U2) for (const r of twinLegs(U2.um, U2.ma, ['cap', '7d'])) ok(`ONE CONSTANT: NO5H_RINGS flipped in a copy flips both twins — ${r.name}`, r.pass, r.detail); else ok('flip: the constant exists', false);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 35 })) ok(r.name, r.pass, r.detail);
}

// ── the words and the mark (text half) ─────────────────────────────────────────────────────────────────────────
console.log('— the words (zh + ja), no mark (r3\'s slash withdrawn), the wiring');
{
  const KEYS = ['model-scoped weekly cap (e.g. Fable)', 'no data yet — press ⟳', R5_KEY, '{name} weekly limit', 'resets in {dur}', 'cap'];
  const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  ok('the cap ring\'s words are in zh + ja (the last read\'s sentence with its {when})', KEYS.every((k) => typeof zh[k] === 'string' && typeof ja[k] === 'string') && zh[KEYS[2]].includes('{when}') && ja[KEYS[2]].includes('{when}'), KEYS.filter((k) => !zh[k] || !ja[k]).join(' | '));
  ok('SAY THE READ, NOT THE CAP (u3): after an empty ⟳ read the not-read words are the READ\'s result — «… the last ⟳ (<when>) returned no cap figure — press ⟳ to read again» (zh / ja likewise, with {when}); r4\'s «… read no cap …» (it reads as «there is no cap») is gone from zh / ja and from the code',
    typeof zh[R5_KEY] === 'string' && zh[R5_KEY].includes('{when}') && ja[R5_KEY]?.includes('{when}') && !(R4_KEY in zh) && !(R4_KEY in ja) && W.fetched.includes('returned no cap figure') && !/read no cap/.test(code(srcOf('src/lib/usage-source.js')) + code(srcOf('src/lib/usage-meter.js')) + code(srcOf('src/lib/manage-agents.js'))), JSON.stringify([zh[R5_KEY], ja[R5_KEY]]));
  ok('r1\'s lifted-ring words are gone with the ring (nothing uses them)', !('no 5-hour limit on this account — lifted {when}' in zh) && !('no 5-hour limit on this account — lifted {when}' in ja) && !/absentWindowText|usage-donut-lifted|acct-donut-lifted/.test(srcOf('src/lib/usage-meter.js') + srcOf('src/lib/manage-agents.js') + srcOf('src/lib/usage-source.js') + srcOf('public/style.css')));
  ok('r3\'s «none» is WITHDRAWN: its words are gone from zh + ja and from the code of every twin and of capRing, its slash (.usage-donut-none / .acct-donut-none) from style.css — a ring never says «no cap» on a read that proves nothing',
    !(W.absent in zh) && !(W.absent in ja) && !/donut-none|no model-scoped cap on this account|state: 'none'|state === 'none'/.test(code(srcOf('src/lib/usage-meter.js')) + code(srcOf('src/lib/manage-agents.js')) + code(srcOf('src/lib/usage-source.js'))) && !/donut-none/.test(srcOf('public/style.css')));
  ok('the phone chip line is the base\'s (a 5h counts only when present; every running cap counts in the popup\'s loop)', /if \(!noData\) chipWorst = Math\.max\(chipWorst, has5h \? \(p5\.estPct \?\? pct5h\) : -1, p7\.estPct \?\? pct7d\);/.test(srcOf('src/lib/usage-meter.js')) && /if \(!scNotStarted\) chipWorst = Math\.max\(chipWorst, pSc\.estPct \?\? pctSc\);/.test(srcOf('src/lib/usage-meter.js')));
  ok('§ban-safety: the cap ring asks no vendor anything — usage-source imports nothing, and the twins gained no fetch', !/^import /m.test(srcOf('src/lib/usage-source.js')) && !/\bfetch(Json)?\(/.test(srcOf('src/lib/usage-source.js')));
  ok('ci.mjs runs this suite', /'test-usage-two-rings'/.test(srcOf('scripts/ci.mjs')));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
