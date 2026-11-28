#!/usr/bin/env node
// test-separation-ratchets — the separation's P0: THE COUNTERS COUNT RIGHT, AND THE REPORT NAMES THE NEW SITES (lane hub-loop-stalls,
// 2026-11-17; the design «The separation of the interface from the work — the design for lanes», THE PROGRAMME, P0 (3); reshaped
// by 主开发 06:00Z: no ceiling on master — the report names each new site at every merge of master into the separation branch).
// FAST, no process started. It judges NO ceiling: it is green while the counters count right, and it prints each total.
//   ① the five counters of scripts/separation-ratchets.mjs over the tree's own files: each PATTERN, its total against day 0
//      (scripts/separation-day0.json — 2.369.406) and its count PER FILE (`--quiet`: totals only); every file read
//   ② each counter moves by EXACTLY ONE for one planted site of every form it counts (an in-memory copy of the tree's files), on
//      the planted file's line; ZERO-MOVE CONTROLS for every skip it claims — a session-layer write, the per-relay broadcast, a
//      `function` and a shorthand definition, a comment, the SAME NAME bound to something else in another scope (and a session
//      bound in an inner scope, written outside it), a «/*» inside a regex, a template literal and a string (no code swallowed)
//   ③ THE REPORT: a site planted in an in-memory copy appears in it by FILE AND LINE; the tree against a snapshot of itself names
//      nothing; a file that only shrank names nothing; lines that only moved name nothing; A and B at day 0, A and A now ⇒ the NEW
//      copy is named (RED CONTROL: the report with a set fast path put back names nothing); a file the parser fails on is NAMED;
//      the head says an edited line reads as new and removed sites are not listed
//   ④ the day-0 snapshot is whole: per counter its total = the sum of its per-file fingerprints; its release named
// Run: node scripts/test-separation-ratchets.mjs [--quiet]
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './separation-ratchets.mjs';
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const QUIET = process.argv.includes('--quiet');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 1500) : '')); } };
const DAY0 = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/separation-day0.json'), 'utf8'));

const hub = R.hubFiles(REPO);
const counts = Object.fromEntries(R.COUNTERS.map((c) => [c.id, R.count(c, hub)]));
console.log('① the five counters over this tree, against day 0 (no ceiling)');
ok(R.unread.length === 0, `every file was read by the tokenizer (${hub.size} hub files)`, R.unread);
ok(R.COUNTERS.map((c) => c.id).join() === 'session-map,broadcast-to-all,routes,message-cases,session-field-writes', 'five counters — the suites that boot a hub are counted in ONE place, the boot helper unit\'s own ratchet (test-architecture), not here');
for (const c of R.COUNTERS) {
  const got = counts[c.id], d0 = DAY0.counters[c.id];
  console.log(`\n  ${c.id} — ${c.words}\n    pattern: ${c.source}${c.skip ? ' (files left out: see scripts/separation-ratchets.mjs)' : ''}\n    count ${got.total} in ${got.files.size} files · day 0 ${d0 ? d0.total : '?'} (${d0 ? `${got.total - d0.total >= 0 ? '+' : ''}${got.total - d0.total}` : '—'})`);
  if (!QUIET) for (const [f, s] of [...got.files].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) console.log(`      ${String(s.length).padStart(4)}  ${f}`);
  ok(got.total > 0 && !!d0, `${c.id}: ${got.total} sites counted (day 0 ${d0 ? d0.total : '?'})`);
}

console.log('\n② each counter moves by exactly one for one planted site of every form, on its line');
const copy = () => new Map(hub);
const plantIn = (rel, add) => { const h = copy(); const t = h.get(rel) || ''; const line = t.split('\n').length + 1; h.set(rel, t + '\n' + R.strip(add, rel) + '\n'); return { h, line }; };
const PLANTS = [
  ['session-map', 'src/server/apps-engine.js', 'function zzPlanted() { return activeSessions.size; }', 'the map by name'],
  ['session-map', 'src/server/apps-engine.js', 'function zzPlanted(sessions) { return [...sessions()].length; }', 'the map through its injected sessions() accessor'],
  ['session-map', 'src/server/apps-engine.js', 'function zzPlanted(getActiveSessions) { return getActiveSessions().size; }', 'the map through getActiveSessions()'],
  ['broadcast-to-all', 'server.js', "bcastAll({ type: 'zz-planted' });", 'bcastAll('],
  ['broadcast-to-all', 'src/server/apps-engine.js', "function zzPlanted(bcast) { bcast({ type: 'zz' }); }", 'an injected bcast('],
  ['routes', 'server.js', "app.get('/api/zz-planted', (req, res) => res.end());", 'a route'],
  ['session-field-writes', 'src/server/model-ask.js', 'function zzPlanted(session) { session._zzPlanted = 1; }', 'session.field ='],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzPlanted(id) { const live = activeSessions.get(id); live._zzPlanted = 1; }', 'a name bound from the map\'s get in ITS scope, then .field ='],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzPlanted(id) { const live = activeSessions.get(id); Object.assign(live, { _zz: 1 }); }', 'Object.assign onto such a name'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzPlanted() { for (const [id, live] of activeSessions) { live._zz = id; } }', 'the VALUE of a for-of over the map (a pair)'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzPlanted() { for (const live of activeSessions.values()) live._zz = 1; }', 'the value of a for-of over the map\'s values()'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzPlanted(id) { const live = activeSessions.get(id) || null; if (live) live._zz = 1; }', 'a get behind an or'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzPlanted(id) { const live = activeSessions.get(id) ?? null; if (live) live._zz = 1; }', 'a get behind a nullish-or'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzPlanted(id, c) { const live = c ? activeSessions.get(id) : null; if (live) live._zz = 1; }', 'a get in a ternary arm'],
];
for (const [id, rel, add, form] of PLANTS) {
  const c = R.COUNTERS.find((x) => x.id === id);
  const { h, line } = plantIn(rel, add), got = R.count(c, h);
  const at = (got.files.get(rel) || []).map((s) => s.line);
  ok(got.total === counts[id].total + 1 && verdictOf(at.includes(line)), `② ${id} — ${form}: ${counts[id].total} → ${got.total}, the new site at ${rel}:${line}`, { total: got.total, lines: at.slice(-3) });
}
{ // a message type, planted at the switch's top level with a brace inside a string inside it
  const c = R.COUNTERS.find((x) => x.id === 'message-cases'), h = copy(), t = h.get('src/ws-handler.js');
  const at = t.indexOf('switch (data.type) {') + 'switch (data.type) {'.length, line = t.slice(0, at).split('\n').length + 1;
  h.set('src/ws-handler.js', t.slice(0, at) + "\n        case 'zz-planted': { const zzT = '}}{'; break; }" + t.slice(at));
  const got = R.count(c, h);
  ok(got.total === counts['message-cases'].total + 1 && verdictOf(got.files.get('src/ws-handler.js').some((s) => s.line === line)), `② message-cases — a type at the switch's top level (a brace in a string inside it): ${counts['message-cases'].total} → ${got.total}, at src/ws-handler.js:${line}`, got.total);
}
console.log('\n② ZERO-MOVE controls — every skip the counters claim');
const ZERO = [
  ['session-field-writes', 'src/server/session-brain.js', 'function zzPlanted(session) { session._zz = 1; }', 'a write inside the session layer (session-*.js)'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzA(id) { const live = activeSessions.get(id); return live; } function zzB() { const live = {}; live.y = 2; Object.assign(live, { z: 1 }); }', 'the SAME NAME bound to something else in another scope'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzC(id) { let live = {}; { const live = activeSessions.get(id); void live; } live.y = 2; }', 'a session bound in an inner block, the name written outside it (the outer binding)'],
  ['session-field-writes', 'src/server/apps-engine.js', 'function zzK() { for (const [live, v] of activeSessions) { live.k = v; } }', 'the KEY of a for-of pair (an id, no session)'],
  ['broadcast-to-all', 'src/server/browser-stream.js', "function zzPlanted(relay) { broadcast(relay, { type: 'x' }); }", 'the per-relay broadcast of browser-stream'],
  ['broadcast-to-all', 'server.js', 'function broadcast(msg) { return msg; }', 'a `function broadcast(` definition'],
  ['broadcast-to-all', 'server.js', 'const zzObj = { broadcast(msg) { return msg; } };', 'a shorthand method definition `broadcast(msg) {`'],
  ['session-map', 'server.js', '// activeSessions.get(x) in a comment\n/* activeSessions, sessions() */', 'a comment'],
];
for (const [id, rel, add, what] of ZERO) { const c = R.COUNTERS.find((x) => x.id === id); const got = R.count(c, plantIn(rel, add).h); ok(got.total === counts[id].total, `② ZERO MOVE — ${what}: ${id} stays ${counts[id].total}`, got.total); }
const swallow = (src) => R.count(R.COUNTERS[0], plantIn('server.js', src).h).total - counts['session-map'].total;
ok(swallow("const zzRe = /\\/\\*/; activeSessions.get(1); const zzRe2 = /\\*\\//;") === 1, '② a «/*» inside a REGEX literal is no comment: the code after it is counted (+1)');
ok(swallow("const zzT = `/* not a comment ${1}`; activeSessions.get(2); const zzU = `*/`;") === 1, '② a «/*» inside a TEMPLATE literal is no comment: the code after it is counted (+1)');
ok(swallow("const zzS = 'src/*'; activeSessions.get(3); const zzE = '*/';") === 1, '② a «/*» inside a string swallows no code (+1)');

console.log('\n③ THE REPORT names each new site by file and line');
const self = R.snapshotOf(counts);
{
  const rSelf = R.report(counts, self);
  ok(rSelf.counters.length === 5 && verdictOf(rSelf.counters.every((c) => c.grew.length === 0 && c.now === c.day0)), '③ this tree against a snapshot of itself: every counter +0, no file named');
  const { h, line } = plantIn('src/server/apps-engine.js', "function zzPlanted(bcast) { bcast({ type: 'zz' }); return activeSessions.size; }");
  const cP = Object.fromEntries(R.COUNTERS.map((c) => [c.id, R.count(c, h)]));
  const rP = R.report(cP, self), text = R.printReport(rP, 'a snapshot of this tree');
  const g = (id) => (rP.counters.find((c) => c.id === id).grew[0] || {});
  ok(g('session-map').file === 'src/server/apps-engine.js' && g('session-map').sites.length === 1 && g('session-map').sites[0].line === line && g('broadcast-to-all').sites[0].line === line && gateOf(text.includes(`src/server/apps-engine.js:${line}  function zzPlanted(bcast)`)) && verdictOf(/session-map — .*: \d+ \(day 0 \d+, \+1\)/.test(text)),
    `③ a site planted in an in-memory copy appears in the report by FILE AND LINE (src/server/apps-engine.js:${line}, in two counters) and its counter says +1`, text.split('\n').filter((l) => /zzPlanted|\+1\)/.test(l)));
  const h2 = copy(); h2.set('src/server/apps-engine.js', ''); const c2 = Object.fromEntries(R.COUNTERS.map((c) => [c.id, R.count(c, h2)]));
  const r2 = R.report(c2, self);
  ok(gateOf(r2.counters.every((c) => c.grew.length === 0)) && r2.counters.find((c) => c.id === 'session-map').shrank >= 1, '③ a file that only SHRANK names nothing (counted as «fewer»)');
  const moved = (() => { const h3 = copy(); const t = h3.get('server.js'); h3.set('server.js', '\n\n\n' + t); return h3; })();
  const r3 = R.report(Object.fromEntries(R.COUNTERS.map((c) => [c.id, R.count(c, moved)])), self);
  ok(verdictOf(r3.counters.every((c) => c.grew.length === 0)), '③ a file whose lines only MOVED (three lines added above) names nothing — a site is its line\'s text, not its number');
}

{ // THE MUST — a file that had A and B at day 0 and now has A and A (B deleted, a second A added): the new copy is NAMED
  const A = { line: 3, text: 'activeSessions.get(1);' }, B = { line: 7, text: 'activeSessions.delete(2);' };
  const now = Object.fromEntries(R.COUNTERS.map((c) => [c.id, { total: 0, files: new Map() }])); now['session-map'] = { total: 2, files: new Map([['src/zz.js', [A, { line: 9, text: A.text }]]]) };
  const d0 = Object.fromEntries(R.COUNTERS.map((c) => [c.id, { total: 0, files: {} }])); d0['session-map'] = { total: 2, files: { 'src/zz.js': [R.fp(A.text), R.fp(B.text)] } };
  const named = R.report(now, d0).counters.find((c) => c.id === 'session-map').grew;
  ok(named.length === 1 && named[0].file === 'src/zz.js' && named[0].sites.length === 1 && named[0].sites[0].line === 9, '③ THE MUST — day 0 A and B, now A and A: the report names the NEW copy (src/zz.js:9) — fingerprints are a MULTISET, never a set', named);
  // RED CONTROL: the report with the set fast path put back (its source, the line re-inserted) names nothing
  const src = fs.readFileSync(path.join(REPO, 'scripts/separation-ratchets.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export function report('), src.indexOf('\nexport function printReport')).replace('export function report(', 'function report(');
  const anchor = '      const left = new Map();';
  if (!body.includes(anchor)) throw new Error('the report\'s multiset loop moved — update this suite');
  const mut = new Function('COUNTERS', 'fp', 'unread', body.replace(anchor, '      if (sites.length <= old.length && sites.every((s) => old.includes(fp(s.text)))) continue;\n' + anchor) + '\nreturn report;')(R.COUNTERS, R.fp, []);
  ok(mut(now, d0).counters.find((c) => c.id === 'session-map').grew.length === 0, '③ RED CONTROL — the set fast path kept: the same case names NOTHING (the hidden duplicate)');
  // a hub file the parser fails on is NAMED — never a silent zero
  const h = copy(); h.set('src/server/zz-broken.js', 'const = ;\nsession.x = 1;\n');
  const cB = Object.fromEntries(R.COUNTERS.map((c) => [c.id, R.count(c, h)])), rB = R.report(cB, self), tB = R.printReport(rB, 'a snapshot of this tree');
  ok(gateOf(rB.unread.includes('src/server/zz-broken.js')) && verdictOf(/NOT READ by the parser — counted as nothing, named here: .*src\/server\/zz-broken\.js/.test(tB)), '③ a hub file the parser fails on is NAMED in the unread list and by the report — never a silent zero', rB.unread);
  R.unread.length = 0;   // the planted broken file only
  ok(verdictOf(/an EDITED line reads as a new site; removed sites are not listed/.test(tB)), '③ the report\'s head says it: an edited line reads as a new site; removed sites are not listed');
}

console.log('\n④ the day-0 snapshot is whole');
ok(DAY0.release === '2.369.406 (eacbf64df)' && gateOf(R.COUNTERS.every((c) => { const d = DAY0.counters[c.id]; return d && d.total === Object.values(d.files).reduce((a, s) => a + s.length, 0); })) && Object.keys(DAY0.counters).length === 5,
  `④ scripts/separation-day0.json: the release named; per counter its total = the sum of its per-file fingerprints (${R.COUNTERS.map((c) => DAY0.counters[c.id].total).join(' / ')})`);

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
