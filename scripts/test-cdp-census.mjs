#!/usr/bin/env node
// THE CDP CENSUS vs THE VENDOR'S OWN LISTS — fast, PURE, launch-free (lane-cdp-154, 2026-09-28). Chrome 154 reached
// the dev box and test-browser-mediation-chrome ⑥ went red on 4 methods src/cdp-census.js had no row for — the only
// gate that compared the table with a Chrome was HEAVY (after the push), and the fixture comparison lived inside a
// 10 s heavy suite. This suite is the census's own fast gate (the fence stays test-browser-mediation ⑥'s):
//   ① every censused Chrome (CENSUS_CHROMES) has its names-only fixture scripts/fixtures/cdp-protocol-<v>/ naming the
//      same Chrome, and every such fixture directory is a censused Chrome (no orphan, no gap);
//   ② on EACH censused Chrome the table names EXACTLY that Chrome's methods — 0 unclassified, 0 stale, 0 misdated
//      (`compare(fixture, {chrome})`); validate() (closed classes, dates, version marks);
//   ③ the version marks ARE the fixtures' diff: between consecutive censused Chromes the methods added are exactly the
//      rows whose `chrome` is the newer, the removed exactly the rows marked `until` it (scripts/cdp-protocol-fetch.mjs
//      diffListings — the same diff the docs quote), every row listed by some censused Chrome;
//   ④ the 154 step, row by row: the 4 new methods' classes and their words through the REAL judge (the two whole-
//      browser setters method_refused on every lease naming the measurement, the two reads forwarded while the user
//      drives), the 7 removed ones keep their classes (the judge is VERSION-INDEPENDENT — a 153 still ships them);
//   ⑤ the unknown rule on ANY Chrome: a method no row names is refused BY NAME while the user drives whatever the
//      installed version (newer, older — the fleet's Debian chromium 150 —, between, unparsable), the words naming
//      every censused Chrome; `chromeRelation` over the four relations;
//   ⑥ the fixture shape (names only: closed keys, parameter NAMES as strings, no schema) and the diff's honesty — a
//      side that never recorded parameters / events is `unrecorded`, never "nothing changed";
//   CONTROLS (scripts/mutant-copy.mjs): (a) Browser.addMockCamera's row removed ⇒ the 154 fixture is no longer
//      covered (unclassified names it) AND a mediation copy bound to that census FORWARDS the camera call on a free
//      lease; (b) a removed row's `until` dropped ⇒ 154 reports it stale; (c) a surviving row marked `until` 154 ⇒ 154
//      reports it misdated; (d) a new row's `chrome` dropped ⇒ 153 reports it stale.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { diffListings } from './cdp-protocol-fetch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const C = require('../src/cdp-census.js');
const M = require('../src/browser-mediation.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 600) : '')); } return !!c; };
const FIX = path.join(REPO, 'scripts/fixtures');
const fixtureOf = (v) => JSON.parse(fs.readFileSync(path.join(FIX, `cdp-protocol-${v}`, 'protocol.json'), 'utf8'));
const versionOf = (f) => (/Chrome\/(\d+\.\d+\.\d+\.\d+)/.exec(String(f && f.browser || '')) || [])[1] || null;
const name = (r) => r.domain + '.' + r.method;
const C154 = '154.0.8037.57';

// a judge scope: tab T-A attached as session S-A (the shape test-browser-mediation ⑥ judges every row on)
const scope = () => { const sc = M.newScope({ targets: ['T-A'] }); M.admitReply({ id: 1, result: { sessionId: 'S-A' } }, { method: 'Target.attachToTarget', params: { targetId: 'T-A' } }, sc); return sc; };
const verdict = (mod, m, o) => { const v = mod.judge({ id: 9, method: m, params: {}, sessionId: 'S-A' }, scope(), o); return v.kind === 'refuse' ? `${mod.refusalCodeOf(v.reply)}:${v.why || ''}` : v.kind; };

// ═══ ① the censused Chromes and their fixtures ══════════════════════════════
console.log(`— ① the censused Chromes (${C.CENSUS_CHROMES.join(' + ')}) and their fixtures`);
const dirs = fs.readdirSync(FIX).filter((d) => d.startsWith('cdp-protocol-')).map((d) => d.slice('cdp-protocol-'.length)).sort((a, b) => C.cmpChrome(a, b));
ok(dirs.join() === C.CENSUS_CHROMES.join(), `① the fixture directories are exactly the censused Chromes, oldest first (${dirs.join(', ')}) — no orphan fixture, no censused Chrome without one`);
const fixtures = {};
for (const v of C.CENSUS_CHROMES) {
  const file = path.join(FIX, `cdp-protocol-${v}`, 'protocol.json');
  if (!ok(fs.existsSync(file), `① Chrome ${v}: scripts/fixtures/cdp-protocol-${v}/protocol.json exists`)) continue;
  fixtures[v] = fixtureOf(v);
  ok(versionOf(fixtures[v]) === v && fixtures[v].protocolVersion === '1.3', `① Chrome ${v}: the fixture names the Chrome it was read from (${fixtures[v].browser}, protocol ${fixtures[v].protocolVersion})`);
}
ok(C.CENSUS_CHROME === C.CENSUS_CHROMES[C.CENSUS_CHROMES.length - 1] && C.CENSUS_CHROME === C154, `① CENSUS_CHROME is the newest censused Chrome (${C.CENSUS_CHROME})`);

// ═══ ② each censused Chrome ⇔ the table ═════════════════════════════════════
console.log('— ② on EACH censused Chrome the table names exactly its methods');
ok(C.validate().length === 0, '② the table validates (closed classes, dated rows, the one anchor row, every `chrome` / `until` a censused Chrome in order)', C.validate().slice(0, 6).join('; '));
const cn = C.census();
for (const v of Object.keys(fixtures)) {
  const cmp = C.compare(fixtures[v], { chrome: v });
  console.log(`  (Chrome ${v}: ${fixtures[v].domains.length} domains, ${cmp.listed} methods listed / ${cmp.rows} rows listed there — ${cmp.unclassified.length} unclassified, ${cmp.stale.length} stale, ${cmp.misdated.length} misdated)`);
  if (!cmp.sameSet) console.error(`  Chrome ${v}: UNCLASSIFIED ${cmp.unclassified.join(', ') || '—'} · STALE ${cmp.stale.join(', ') || '—'} · MISDATED ${cmp.misdated.join(', ') || '—'}`);
  ok(cmp.sameSet && cmp.chrome === v && cmp.relation === 'censused' && cmp.listed >= 600 && cn.byChrome[v] === cmp.listed, `② Chrome ${v}: every method it lists has a row, every row listed there is one of its methods, no row misdated (${cmp.listed} = ${cmp.rows})`);
}
const byClass = Object.entries(cn.byClass).map(([k, n]) => `${k} ${n}`).join(', ');
console.log(`  (census: ${cn.total} rows over ${cn.chromes.join(' + ')} — ${byClass})`);

// ═══ ③ the version marks are the fixtures' diff ═════════════════════════════
console.log('— ③ the rows\' `chrome` / `until` marks are exactly the diff between consecutive censused Chromes');
const rows = C.rows();
for (let i = 1; i < C.CENSUS_CHROMES.length; i++) {
  const [a, b] = [C.CENSUS_CHROMES[i - 1], C.CENSUS_CHROMES[i]];
  if (!fixtures[a] || !fixtures[b]) continue;
  const d = diffListings(fixtures[a], fixtures[b]);
  const born = rows.filter((r) => r.chrome === b).map(name).sort(), gone = rows.filter((r) => r.until === b).map(name).sort();
  console.log(`  (${a} → ${b}: +${d.methods.added.length} −${d.methods.removed.length} methods, ${d.methods.reflagged.length} re-flagged, domains +${d.domains.added.length} −${d.domains.removed.length}${d.unrecorded.length ? `; unrecorded: ${d.unrecorded.join(', ')}` : ''})`);
  ok(d.methods.added.join() === born.join(), `③ ${a} → ${b}: the ${d.methods.added.length} methods added are exactly the rows marked chrome ${b} (${born.join(', ')})`);
  ok(d.methods.removed.join() === gone.join(), `③ ${a} → ${b}: the ${d.methods.removed.length} methods removed are exactly the rows marked until ${b} (${gone.join(', ')})`);
}
ok(rows.every((r) => C.CENSUS_CHROMES.some((v) => C.listedOn(r, v))), '③ every row is listed by at least one censused Chrome (no row names a method no Chrome the census read ever shipped)');
ok(C.listedOn(C.rowOf('Browser.addMockCamera'), '153.0.8010.47') === false && C.listedOn(C.rowOf('Browser.addMockCamera'), C154) === true && C.listedOn(C.rowOf('Storage.setSharedStorageEntry'), '153.0.8010.47') === true && C.listedOn(C.rowOf('Storage.setSharedStorageEntry'), C154) === false && C.listedOn(C.rowOf('Runtime.evaluate'), '150.0.7871.124') === null && C.rowsOn('150.0.7871.124') === null, '③ listedOn / rowsOn answer only for a censused Chrome (null for any other — the census knows the Chromes it read)');

// ═══ ④ the 154 step, row by row ═════════════════════════════════════════════
console.log('— ④ Chrome 154\'s four new methods: their classes and their words through the real judge; the seven removed keep theirs');
const NEW = { 'Ads.getAdScripts': 'read', 'Browser.getGlobalPrivacyControl': 'read', 'Browser.addMockCamera': 'refused', 'Browser.setGlobalPrivacyControl': 'refused' };
for (const [m, cls] of Object.entries(NEW)) {
  const r = C.rowOf(m);
  ok(r && r.cls === cls && r.chrome === C154 && r.until === null && r.since === '2026-09-28' && r.fence === 'mediator' && typeof r.why === 'string' && r.why.length > 40, `④ ${m}: class ${cls}, first listed on ${C154}, dated 2026-09-28, its reason written on the row`);
}
for (const m of ['Browser.addMockCamera', 'Browser.setGlobalPrivacyControl']) {
  const free = M.judge({ id: 20, method: m, params: m === 'Browser.addMockCamera' ? { deviceId: 'x' } : { gpc: true } }, scope(), {});
  const msg = free.reply && free.reply.error && free.reply.error.message;
  ok(free.kind === 'refuse' && M.refusalCodeOf(free.reply) === 'method_refused' && verdict(M, m, { paused: true }) === 'method_refused:refused' && M.ALWAYS_REFUSED.has(m) && /WHOLE browser/.test(msg) && /every browser context/.test(msg) && /154\.0\.8037\.57/.test(msg) && /refused on every lease/.test(msg), `④ ${m}: method_refused on EVERY lease, the agent driving or the user — the words say it reaches every browser context and name the Chrome it was measured on`, msg);
}
ok(/shared device list/.test(C.rowOf('Browser.addMockCamera').why) && /getUserMedia/.test(C.rowOf('Browser.addMockCamera').why) && /Sec-GPC/.test(C.rowOf('Browser.setGlobalPrivacyControl').why) && /navigator\.globalPrivacyControl/.test(C.rowOf('Browser.setGlobalPrivacyControl').why), '④ each refusal names what was measured (the mock camera in the shared device list reaching getUserMedia; the GPC signal in navigator.globalPrivacyControl + Sec-GPC)');
for (const m of ['Ads.getAdScripts', 'Browser.getGlobalPrivacyControl']) ok(verdict(M, m, { paused: true }) === 'forward' && verdict(M, m, {}) === 'forward', `④ ${m}: a read — forwarded while the user drives and while the agent does`);
const GONE = { 'Storage.getSharedStorageMetadata': 'read', 'Storage.getSharedStorageEntries': 'read', 'Storage.setSharedStorageEntry': 'page-mutation', 'Storage.deleteSharedStorageEntry': 'page-mutation', 'Storage.clearSharedStorageEntries': 'page-mutation', 'Storage.resetSharedStorageBudget': 'page-mutation', 'Storage.setSharedStorageTracking': 'harmless' };
const goneWrong = Object.entries(GONE).filter(([m, cls]) => { const r = C.rowOf(m); const want = cls === 'page-mutation' ? 'browser_interrupted:page-mutation' : 'forward'; return !r || r.cls !== cls || r.until !== C154 || r.chrome !== C.CENSUS_CHROMES[0] || verdict(M, m, { paused: true }) !== want || verdict(M, m, {}) !== 'forward'; });
ok(goneWrong.length === 0, `④ the ${Object.keys(GONE).length} Shared Storage methods Chrome 154 dropped keep their rows and classes (marked until ${C154}) and the judge still reads them — a 153 ships them, and the judge never asks which Chrome is installed`, goneWrong.join(', '));

// ═══ ⑤ the unknown rule on ANY Chrome ═══════════════════════════════════════
console.log('— ⑤ a method no row names is refused BY NAME while the user drives — on every Chrome, older or newer than the census');
ok(C.chromeRelation('153.0.8010.47') === 'censused' && C.chromeRelation(C154) === 'censused' && C.chromeRelation('150.0.7871.124') === 'older' && C.chromeRelation('153.0.8010.60') === 'between' && C.chromeRelation('155.0.8100.1') === 'newer' && C.chromeRelation('chromium') === 'unknown' && C.chromeRelation('') === 'unknown', '⑤ chromeRelation: censused / older (the fleet\'s Debian chromium 150) / between / newer / unknown');
// an OLDER Chrome's extra (measured 2026-09-28: Chrome for Testing 149.0.7827.55, 151.0.7922.34 and Google Chrome
// 152.0.7977.82 list Network.setRequestInterception, which 153 dropped) and a NEWER Chrome's (a synthetic name)
const older = { domains: [...fixtures['153.0.8010.47'].domains.map((d) => (d.domain === 'Network' ? { ...d, commands: [...d.commands, { name: 'setRequestInterception' }] } : d))] };
const newer = { domains: [...fixtures[C154].domains, { domain: 'Zzz', commands: [{ name: 'futureMethod' }] }] };
const cOld = C.compare(older, { chrome: '150.0.7871.124' }), cNew = C.compare(newer, { chrome: '155.0.8100.1' });
ok(cOld.chrome === null && cOld.relation === 'older' && cOld.unclassified.join() === 'Network.setRequestInterception' && cNew.relation === 'newer' && cNew.unclassified.join() === 'Zzz.futureMethod' && cNew.misdated.length === 0, '⑤ compare on an uncensused Chrome: the extra method is UNCLASSIFIED (older and newer alike), nothing is judged misdated');
for (const m of ['Network.setRequestInterception', 'Zzz.futureMethod', 'Page.zzzFutureMethod']) {
  const v = M.judge({ id: 30, method: m, params: {}, sessionId: 'S-A' }, scope(), { paused: true });
  const msg = v.reply && v.reply.error && v.reply.error.message;
  ok(v.kind === 'refuse' && v.why === 'unclassified' && M.refusalCodeOf(v.reply) === 'browser_interrupted' && msg.includes(m) && msg.includes(C.CENSUS_CHROMES.join(' + ')) && /src\/cdp-census\.js/.test(msg) && verdict(M, m, {}) === 'forward', `⑤ ${m}: refused BY NAME while the user drives (the words name every censused Chrome — ${C.CENSUS_CHROMES.join(' + ')} — and the census file), forwarded when the agent drives`, msg);
}

// ═══ ⑥ the fixture shape and the diff's honesty ═════════════════════════════
console.log('— ⑥ names only; a side that recorded no parameters / events is said, never read as "nothing changed"');
const CMD_KEYS = new Set(['name', 'deprecated', 'experimental', 'params']), DOM_KEYS = new Set(['domain', 'deprecated', 'experimental', 'commands', 'events']);
const shapeBad = [];
for (const [v, f] of Object.entries(fixtures)) {
  for (const d of f.domains) {
    if (Object.keys(d).some((k) => !DOM_KEYS.has(k))) shapeBad.push(`${v} ${d.domain}: keys ${Object.keys(d)}`);
    for (const c of [...(d.commands || []), ...(d.events || [])]) {
      if (Object.keys(c).some((k) => !CMD_KEYS.has(k)) || typeof c.name !== 'string') shapeBad.push(`${v} ${d.domain}.${c.name}: keys ${Object.keys(c)}`);
      if (c.params !== undefined && !(Array.isArray(c.params) && c.params.every((p) => typeof p === 'string' && /^[A-Za-z_][\w]*\??$/.test(p)))) shapeBad.push(`${v} ${d.domain}.${c.name}: params ${JSON.stringify(c.params)}`);
    }
  }
}
ok(shapeBad.length === 0, '⑥ every fixture is a names-only listing: domain / command / event objects with closed keys, parameter NAMES as plain strings (an optional one ends in ?) — no types, schemas or descriptions', shapeBad.slice(0, 5).join('\n    '));
const f154 = fixtures[C154];
ok(f154 && f154.domains.some((d) => Array.isArray(d.events) && d.events.length) && f154.domains.every((d) => d.commands.every((c) => Array.isArray(c.params))), `⑥ the ${C154} fixture records every command's parameter names and the events (the next Chrome's diff can say what changed)`);
const d34 = diffListings(fixtures['153.0.8010.47'], f154);
ok(d34.params === null && d34.events === null && d34.unrecorded.join() === 'older: parameter names,older: events', '⑥ 153 → 154: the 153 fixture recorded names only, so the diff says the parameter / event parts are UNRECORDED on that side (never an empty change list)', JSON.stringify(d34.unrecorded));
const d44 = diffListings(f154, f154);
ok(d44.params && d44.params.changed.length === 0 && d44.events && d44.events.added.length + d44.events.removed.length + d44.events.changed.length === 0 && d44.unrecorded.length === 0 && d44.methods.added.length + d44.methods.removed.length === 0, '⑥ a fixture against itself: every part recorded, nothing changed');
const bumped = JSON.parse(JSON.stringify(f154));
const sc = bumped.domains.find((d) => d.domain === 'Page').commands.find((c) => c.name === 'startScreencast'); sc.params = sc.params.filter((p) => p !== 'sendLastFrame?');
bumped.domains.find((d) => d.domain === 'Storage').events.push({ name: 'zzzEvent', params: [] });
const dB = diffListings(bumped, f154);
ok(dB.params.changed.length === 1 && dB.params.changed[0].method === 'Page.startScreencast' && dB.params.changed[0].added.join() === 'sendLastFrame?' && dB.events.removed.join() === 'Storage.zzzEvent', '⑥ where both sides recorded them, a changed parameter list and a removed event are named');

// ═══ CONTROLS ═══════════════════════════════════════════════════════════════
console.log('— CONTROLS: patched census copies — a new row removed, an until mark dropped, a surviving row mis-marked, a chrome mark dropped');
{
  const MUT = mutantCopies('cdp-census', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/cdp-census.js'), 'utf8');
  const medSrc = fs.readFileSync(path.join(REPO, 'src/browser-mediation.js'), 'utf8');
  const rowRe = /^ {4}addMockCamera: \{ cls: 'refused'.*\n/m;
  const untilA = "setSharedStorageTracking: { cls: 'harmless', until: C154 },", evalA = "evaluate: 'page-mutation',", chromeA = "getAdScripts: { cls: 'read', since: '2026-09-28', chrome: C154, ";
  ok((src.match(new RegExp(rowRe.source, 'gm')) || []).length === 1 && src.split(untilA).length === 2 && src.split(evalA).length === 2 && src.split(chromeA).length === 2 && medSrc.split("require('./cdp-census.js')").length === 2, 'control setup: each anchor is spelled once');
  // (a) Browser.addMockCamera's row removed
  const noRow = MUT.write('src/cdp-census.js', src.replace(rowRe, ''), 'no-mock-camera-row');
  const Ca = require(noRow);
  const a = Ca.compare(fixtures[C154], { chrome: C154 });
  const Ma = MUT.load('src/browser-mediation.js', medSrc.replace("require('./cdp-census.js')", `require(${JSON.stringify(noRow)})`), 'no-mock-camera-row');
  ok(!a.sameSet && a.unclassified.join() === 'Browser.addMockCamera' && verdict(Ma, 'Browser.addMockCamera', {}) === 'forward' && verdict(M, 'Browser.addMockCamera', {}) === 'method_refused:refused', `CONTROL (a) Browser.addMockCamera's row removed: Chrome ${C154} is no longer covered (unclassified: ${a.unclassified.join()}) and a free lease's mock camera is FORWARDED into the shared device list — the row is what refuses it on every lease`);
  // (b) a removed row's until mark dropped
  const b = require(MUT.write('src/cdp-census.js', src.replace(untilA, "setSharedStorageTracking: 'harmless',"), 'no-until')).compare(fixtures[C154], { chrome: C154 });
  ok(!b.sameSet && b.stale.join() === 'Storage.setSharedStorageTracking' && b.unclassified.length === 0, `CONTROL (b) Storage.setSharedStorageTracking's until mark dropped: Chrome ${C154} reports it STALE (the table claims a method it no longer ships)`);
  // (c) a surviving row marked gone
  const c = require(MUT.write('src/cdp-census.js', src.replace(evalA, "evaluate: { cls: 'page-mutation', until: C154 },"), 'mis-until')).compare(fixtures[C154], { chrome: C154 });
  ok(!c.sameSet && c.misdated.join() === 'Runtime.evaluate' && c.stale.length === 0, `CONTROL (c) Runtime.evaluate marked until ${C154}: that Chrome still lists it — reported MISDATED`);
  // (d) a new row's chrome mark dropped
  const d = require(MUT.write('src/cdp-census.js', src.replace(chromeA, "getAdScripts: { cls: 'read', since: '2026-09-28', "), 'no-chrome')).compare(fixtures['153.0.8010.47'], { chrome: '153.0.8010.47' });
  ok(!d.sameSet && d.stale.join() === 'Ads.getAdScripts', 'CONTROL (d) Ads.getAdScripts\' chrome mark dropped: Chrome 153.0.8010.47 reports it STALE (a 154 method claimed for 153)');
  for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 5, label: 'CONTROL ' })) ok(r.pass, r.name, r.detail);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
