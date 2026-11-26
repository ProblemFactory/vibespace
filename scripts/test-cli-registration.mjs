#!/usr/bin/env node
// test-cli-registration (fast; lane cli-2-1-308-records — THE TREADMILL, BUILT): the hub's claude auto-updates faster than a
// release registers each build's records (src/record-shape.js SCHEMA_CLI_VERSIONS). When the hub's CLI — or a conversation's
// drift card — names a build the record oracle does not know, the product says it ONCE (journal + telemetry, kept across a
// restart) and says it in ⚙ Diagnostics and on Manage agents' claude row, which offers 「生成记录草稿」: the static dump of the
// installed binary (its strings — NEVER run) into data/claude-cli-dumps/<v>.json for the next registration lane.
//   ① the PURE words (src/lib/cli-registration-words.js) — en / zh / ja; the row's button only until a draft is taken; the
//      Diagnostics section absent while every build is registered; every t() literal has zh + ja
//   ② the registry (src/server/cli-registration.js): said ONCE per build (a second source adds no line), kept across a
//      restart, a build a release registers drops out; a registered build is never said
//   ③ THE DRAFT ROAD over a FIXTURE binary (a 0644 file built from the tracked 2.1.308 dump + one planted field, one planted
//      subtype): versionOfBinary / dumpDiff PURE; the registry's draft() runs the real `scripts/claude-cli-dump.mjs --auto`
//      child (serviceEnv) and the draft names exactly the two plants; kept on a second press; single-flight; refused for a
//      registered build. RED CONTROL: the recipe's own road (`--version`) on the same 0644 file fails — the auto road never ran it
//   ④ the wiring: oat-file-sync's tick tells onCliVersion the build; the drift card tells global.__vsCliSeen; server.js
//      mounts it on the oat-file-sync line; the routes (GET status, POST draft — a GET never starts the child); the clients;
//      test-architecture §94: the draft child is a serviceEnv site (a MUTANT with no env is RED)
//   ⑤ the hosted runner's build (B-9ff2): ci.yml's fast job (part 1) runs the --auto road over the runner's own claude file and
//      keeps the draft as an artifact — never a run, never a gate; CONTROL: no step, or a step that can fail the job, is RED by name
import './scratch.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cli-registration-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
const W = await import('../src/lib/cli-registration-words.js');
const D = await import('./claude-cli-dump.mjs');
const REG = require('../src/server/cli-registration.js');
const R = require('../src/record-shape.js');
const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined ? String(p[k]) : m));
const tOf = (d) => (s, p) => fill(d ? (d[s] || s) : s, p);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NEWEST = R.SCHEMA_CLI_VERSION;
// lane cli-self-measure (ruling R8 — the founding requirement, 2026-03-22 item 7: an ordinary Claude Code update needs no release of
// VibeSpace): the line says the fact quietly, never «not registered … until the next release»; the journal keeps its own spelling
const LINE = (v) => `Claude Code ${v} is newer than this VibeSpace’s record table — a record kind it adds is listed in Diagnostics; conversations are not affected`;
const JLINE = (v) => `claude ${v} is newer than this release's record table — a record kind it adds is listed in Diagnostics, conversations are not affected`;

console.log('① the PURE words — the line, the row, the Diagnostics section');
{
  const t = tOf(null);
  const reg = (hub, unregistered = []) => ({ newest: NEWEST, hub, unregistered });
  ok('the line is the brief\'s sentence, the version named', W.unregisteredLine('2.1.399', t) === LINE('2.1.399'));
  ok('Manage agents\' claude row says nothing while the hub\'s claude is registered, or before its version is read', W.hubRegistrationRow(reg({ version: NEWEST, registered: true }), { t }) === null && W.hubRegistrationRow(reg(null), { t }) === null && W.hubRegistrationRow(null, { t }) === null);
  const u = { version: '2.1.399', sources: ['hub'], firstSeen: 1792652400000, draft: null };
  const row = W.hubRegistrationRow(reg({ version: '2.1.399', registered: false }, [u]), { t });
  ok('…an unregistered hub claude ⇒ the line + ONE button 「Draft the record table」 whose title says the binary is never run and names the file', !!row && row.line === LINE('2.1.399') && row.draft === null && row.button.label === 'Draft the record table' && /never run/.test(row.button.title) && row.button.title.includes('data/claude-cli-dumps/2.1.399.json'), row);
  const taken = { file: 'data/claude-cli-dumps/2.1.399.json', changes: 2, against: NEWEST, takenAt: '2026-10-22T08:00:00.000Z' };
  const row2 = W.hubRegistrationRow(reg({ version: '2.1.399', registered: false }, [{ ...u, draft: taken }]), { t });
  ok('…once the draft is taken: its words (file, changes, against which build) and NO button', !!row2 && row2.button === null && row2.draft === `Record draft taken: data/claude-cli-dumps/2.1.399.json — 2 changes against claude ${NEWEST}`, row2);
  const zr = W.hubRegistrationRow(reg({ version: '2.1.399', registered: false }, [u]), { t: tOf(zh) }), jr = W.hubRegistrationRow(reg({ version: '2.1.399', registered: false }, [u]), { t: tOf(ja) });
  ok('zh: the button is 「生成记录草稿」, the line names the build; ja too', zr.button.label === '生成记录草稿' && zr.line.startsWith('Claude Code 2.1.399 比这个 VibeSpace 的记录表新') && jr.button.label === '記録の下書きを作成' && jr.line.startsWith('Claude Code 2.1.399 はこの VibeSpace の記録表より新しい'), [zr, jr]);
  ok('Diagnostics: NO section while every build seen is registered', W.diagnosticsSection(reg({ version: NEWEST, registered: true }), { t, esc }) === '' && W.diagnosticsSection(null, { t, esc }) === '');
  const sec = W.diagnosticsSection(reg({ version: '2.1.399', registered: false }, [u, { version: '2.1.401', sources: ['conversation'], firstSeen: null, draft: null }]), { t, esc, when: () => 'WHEN' });
  ok('Diagnostics: ONE section, a row per unregistered build — the line, where it was seen, and what to do (the hub\'s: the button / the road; another machine\'s: the road there)', (sec.match(/<h2>/g) || []).length === 1 && sec.includes(esc(LINE('2.1.399'))) && sec.includes(esc(LINE('2.1.401'))) && sec.includes('seen as the hub&#39;s claude'.replace('&#39;', "'")) && sec.includes("a conversation's records".replace("'", "'")) && sec.includes('Manage agents ▸ claude ▸ Draft the record table') && sec.includes('on the machine whose claude this is') && sec.includes(`it knows ${NEWEST} and older`), sec);
  ok('…escaped: a version string can never write markup', !W.diagnosticsSection(reg(null, [{ version: '<b>2.1.399</b>', sources: ['hub'], draft: null }]), { t, esc }).includes('<b>2.1.399'));
  const zsec = W.diagnosticsSection(reg({ version: '2.1.399', registered: false }, [u]), { t: tOf(zh), esc, when: () => 'WHEN' });
  ok('Diagnostics in zh: the heading and the line in Chinese', zsec.includes('没有记录表的 claude 版本') && zsec.includes('Claude Code 2.1.399 比这个 VibeSpace 的记录表新'), zsec.slice(0, 300));
  const src = read('src/lib/cli-registration-words.js');
  const lits = [...src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  const ma = read('src/lib/manage-agents.js'), maCut = ma.slice(ma.indexOf('THE UNREGISTERED BUILD (lane cli-2-1-308-records'), ma.indexOf('row.append(left, actions);', ma.indexOf('THE UNREGISTERED BUILD (lane cli-2-1-308-records')));
  lits.push(...[...maCut.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")));
  const gaps = lits.filter((k) => !zh[k] || !ja[k]);
  ok(`every t() literal of the words + the row (${lits.length}) has zh + ja`, lits.length >= 13 && gaps.length === 0, gaps);
  ok('the words module is PURE: no import, no DOM, no fetch', !/^\s*import\b/m.test(src) && !/\bdocument\.|\bwindow\.|\bfetch\(/.test(src));
}

console.log('② the registry — said ONCE per build, kept across a restart');
{
  const dataDir = path.join(tmp, 'data-once');
  const lines = [], events = [];
  const mk = (pinned = R.SCHEMA_CLI_VERSIONS) => REG.create({ dataDir, rootDir: REPO, pinned, log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  const reg = mk();
  const r0 = reg.note(NEWEST + ' (Claude Code)', 'hub');
  ok(`a registered build (${NEWEST}, the CLI's own words) is never said; the status names it`, r0.registered === true && r0.said === false && lines.length === 0 && events.length === 0 && reg.status().hub.version === NEWEST && reg.status().hub.registered === true && reg.status().unregistered.length === 0, { r0, lines });
  const r1 = reg.note('2.1.399 (Claude Code)', 'hub');
  ok('an unregistered build seen as the hub\'s CLI ⇒ ONE journal line (the brief\'s sentence + where the draft is) and ONE telemetry event cli-unknown-version (Diagnostics\' «Harness drift» lists cli-unknown-*)', r1.said === true && r1.registered === false && lines.length === 1 && lines[0].startsWith('[cli-registration] ' + JLINE('2.1.399')) && /生成记录草稿/.test(lines[0]) && /claude-cli-dump\.mjs --auto/.test(lines[0]) && events.length === 1 && events[0][0] === 'cli-unknown-version' && events[0][1] === 'claude 2.1.399 · hub' && /^cli-unknown-/.test(events[0][0]), { lines, events });
  reg.note('2.1.399', 'hub'); reg.note('2.1.399', 'conversation'); reg.note('2.1.399', 'conversation');
  const st = reg.status();
  ok('…every later sighting — the 15-min tick again, a conversation\'s drift card — adds no line and no event; the build lists both sources', lines.length === 1 && events.length === 1 && st.unregistered.length === 1 && st.unregistered[0].version === '2.1.399' && st.unregistered[0].sources.join() === 'hub,conversation' && st.unregistered[0].firstSeen === 1792652400000 && st.unregistered[0].draft === null, { lines, st });
  ok('…an unparseable version or an unknown source is ignored', reg.note('unparsed', 'hub') === null && reg.note('2.1.400', 'elsewhere') === null && lines.length === 1);
  await reg.landed();   // B-574d: the store writer lands the state off the loop — the restart reads it once ON DISK (its own answer)
  const again = mk();
  again.note('2.1.399', 'hub');
  ok('a RESTART (a new registry over the same data dir) does not say it again — data/cli-registration.json keeps the build', lines.length === 1 && events.length === 1 && JSON.parse(fs.readFileSync(path.join(dataDir, 'cli-registration.json'), 'utf8')).seen['2.1.399'].sources.join() === 'hub,conversation');
  const fresh = REG.create({ dataDir: path.join(tmp, 'data-fresh'), rootDir: REPO, log: (...a) => lines.push(a.join(' ')), event: () => { } });
  fresh.note('2.1.399', 'conversation');
  ok('CONTROL: a registry over an EMPTY data dir does say it (the latch is the kept file, not a skip) — seen on a conversation\'s records', lines.length === 2 && /seen on a conversation's records/.test(lines[1]));
  const next = mk([...R.SCHEMA_CLI_VERSIONS, '2.1.399']);
  ok('a release that REGISTERS the build drops it: nothing unregistered, the hub\'s claude registered', next.status().unregistered.length === 0 && next.note('2.1.399', 'hub').registered === true && next.status().hub.registered === true);
}

console.log('②b THE LINE STOPS (lane cli-2-1-319-records): this release registers the hub\'s 2.1.319');
{
  const lines = [], events = [];
  const on = REG.create({ dataDir: path.join(tmp, 'data-319'), rootDir: REPO, log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  const r = on.note('2.1.319 (Claude Code)', 'hub');
  ok('2.1.319 is registered: no journal line, no telemetry event, nothing for ⚙ Diagnostics to list — the hub\'s «[cli-registration] claude 2.1.319 is not registered» stops', R.SCHEMA_CLI_VERSIONS.includes('2.1.319') && r.registered === true && r.said === false && lines.length === 0 && events.length === 0 && on.status().unregistered.length === 0 && on.status().hub.registered === true, { r, lines });
  ok('…and its tracked dump stays beside the newer pinned builds (2.1.321, lane fable-52-cli-321; 2.1.322, B-9ff2 — the road the registry\'s draft diffs against next)', fs.existsSync(path.join(REPO, 'scripts/fixtures/claude-cli/2.1.319.json')) && R.SCHEMA_CLI_VERSIONS.indexOf('2.1.319') >= 0 && R.SCHEMA_CLI_VERSIONS.indexOf('2.1.319') < R.SCHEMA_CLI_VERSIONS.indexOf('2.1.321'));
  const off = REG.create({ dataDir: path.join(tmp, 'data-319-base'), rootDir: REPO, pinned: R.SCHEMA_CLI_VERSIONS.filter((v) => v !== '2.1.319'), log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  off.note('2.1.319 (Claude Code)', 'hub');
  ok('RED CONTROL: over the .383 list (8b3fdb6ab) the same sighting says the journal\'s line, by name, and Diagnostics lists the build', lines.length === 1 && /2\.1\.319 is newer than this release's record table/.test(lines[0]) && events.length === 1 && off.status().unregistered.map((u) => u.version).join() === '2.1.319', { lines });
}

console.log('②c MEASURED BEFORE THE BOX RUNS IT (lane fable-52-cli-321): this release registers 2.1.321 — the box\'s claude since 12:54 PT 11-09');
{
  const lines = [], events = [];
  const on = REG.create({ dataDir: path.join(tmp, 'data-321'), rootDir: REPO, log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  const r = on.note('2.1.321 (Claude Code)', 'hub');
  ok('2.1.321 is registered: the owner\'s update to it says nothing — no journal line, no telemetry event, nothing for ⚙ Diagnostics', R.SCHEMA_CLI_VERSIONS.includes('2.1.321') && r.registered === true && r.said === false && lines.length === 0 && events.length === 0 && on.status().unregistered.length === 0 && on.status().hub.registered === true, { r, lines });
  ok('…its tracked dump stays pinned beside the newer 2.1.322 (B-9ff2)', fs.existsSync(path.join(REPO, 'scripts/fixtures/claude-cli/2.1.321.json')) && R.SCHEMA_CLI_VERSIONS.indexOf('2.1.321') >= 0 && R.SCHEMA_CLI_VERSIONS.indexOf('2.1.321') < R.SCHEMA_CLI_VERSIONS.indexOf('2.1.322'));
  const off = REG.create({ dataDir: path.join(tmp, 'data-321-base'), rootDir: REPO, pinned: R.SCHEMA_CLI_VERSIONS.filter((v) => v !== '2.1.321'), log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  off.note('2.1.321 (Claude Code)', 'hub');
  ok('RED CONTROL: over the .386 list (f5e087bb5) the same sighting says the journal\'s line, by name, and Diagnostics lists the build', lines.length === 1 && /2\.1\.321 is newer than this release's record table/.test(lines[0]) && events.length === 1 && off.status().unregistered.map((u) => u.version).join() === '2.1.321', { lines });
}

console.log('②d THE BOX\'S 2.1.322 (B-9ff2, lane bl-tests-e): this release registers it — the box\'s claude by 2026-11-13, read as a static dump');
{
  const lines = [], events = [];
  const on = REG.create({ dataDir: path.join(tmp, 'data-322'), rootDir: REPO, log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  const r = on.note('2.1.322 (Claude Code)', 'hub');
  ok('2.1.322 is registered: the box\'s build says nothing — no journal line, no telemetry event, nothing for ⚙ Diagnostics', R.SCHEMA_CLI_VERSIONS.includes('2.1.322') && r.registered === true && r.said === false && lines.length === 0 && events.length === 0 && on.status().unregistered.length === 0 && on.status().hub.registered === true, { r, lines });
  ok('…its tracked dump stays pinned beside the newer 2.1.328 (B-9ff2 step 2)', fs.existsSync(path.join(REPO, 'scripts/fixtures/claude-cli/2.1.322.json')) && R.SCHEMA_CLI_VERSIONS.indexOf('2.1.322') >= 0 && R.SCHEMA_CLI_VERSIONS.indexOf('2.1.322') < R.SCHEMA_CLI_VERSIONS.indexOf('2.1.328'));
  const off = REG.create({ dataDir: path.join(tmp, 'data-322-base'), rootDir: REPO, pinned: R.SCHEMA_CLI_VERSIONS.filter((v) => v !== '2.1.322'), log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  off.note('2.1.322 (Claude Code)', 'hub');
  ok('RED CONTROL: over the .407 list (b06f36e90) the same sighting says the journal\'s line, by name, and Diagnostics lists the build', lines.length === 1 && /2\.1\.322 is newer than this release's record table/.test(lines[0]) && events.length === 1 && off.status().unregistered.map((u) => u.version).join() === '2.1.322', { lines });
}

console.log('②e THE HOSTED RUNNER\'S 2.1.328 (B-9ff2 step 2, lane bl-ci): this release registers it — npm\'s newest on 2026-11-19, dumped ON the runner (ci.yml fast part 1), on no machine of ours');
{
  const lines = [], events = [];
  const on = REG.create({ dataDir: path.join(tmp, 'data-328'), rootDir: REPO, log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  const r = on.note('2.1.328 (Claude Code)', 'hub');
  ok('2.1.328 is registered: a hub that meets it says nothing — no journal line, no telemetry event, nothing for ⚙ Diagnostics', R.SCHEMA_CLI_VERSIONS.includes('2.1.328') && r.registered === true && r.said === false && lines.length === 0 && events.length === 0 && on.status().unregistered.length === 0 && on.status().hub.registered === true, { r, lines });
  const d328 = JSON.parse(read('scripts/fixtures/claude-cli/2.1.328.json'));
  ok('…its tracked dump is the newest pinned build (the road the registry\'s draft diffs against next), the build its own stamp names, read by the tree\'s method, no draft kept in it', R.SCHEMA_CLI_VERSION === '2.1.328' && d328.version === '2.1.328' && /^strings -n 8 <binary>/.test(d328.method) && !('draft' in d328));
  const off = REG.create({ dataDir: path.join(tmp, 'data-328-base'), rootDir: REPO, pinned: R.SCHEMA_CLI_VERSIONS.filter((v) => v !== '2.1.328'), log: (...a) => lines.push(a.join(' ')), event: (n, d) => events.push([n, d]), now: () => 1792652400000 });
  off.note('2.1.328 (Claude Code)', 'hub');
  ok('RED CONTROL: over the .413 list (073cc4a1e) the same sighting says the journal\'s line, by name, and Diagnostics lists the build', lines.length === 1 && /2\.1\.328 is newer than this release's record table/.test(lines[0]) && events.length === 1 && off.status().unregistered.map((u) => u.version).join() === '2.1.328', { lines });
}

console.log('③ THE DRAFT ROAD — over a FIXTURE binary (0644, built from the tracked dump); the binary is never run');
{
  const dump = JSON.parse(read(`scripts/fixtures/claude-cli/${NEWEST}.json`));
  // a synthetic claude: the dump's union as zod literals (helpers u/A — the anchor system/compact_boundary is in it), the nested
  // objects inline, the permission census (declarations + the list + the set), the bundle's VERSION stamp
  const fixtureText = (d, { version, union = d.union }) => {
    const nestedAt = new Map(Object.entries(d.nested).map(([at, keys]) => { const c = at.lastIndexOf('.'); return [at.slice(0, c) + '\u0000' + at.slice(c + 1), keys]; }));
    const lit = (key, fields) => { const [type, sub] = key.split('/'); return 'u({type:A("' + type + '")' + (sub ? ',subtype:A("' + sub + '")' : '') + fields.map((f) => ',' + f + ':' + (nestedAt.has(key + '\u0000' + f) ? 'u({' + nestedAt.get(key + '\u0000' + f).map((k) => k + ':A()').join(',') + '})' : 'A()')).join('') + '})'; };
    const s = d.sentences, rows = s.rows;
    const decl = 'var ' + rows.map((r) => r.name + '=' + JSON.stringify(r.text)).join(',') + ';';
    const gd = 'function ' + s.list + '(){return[' + rows.filter((r) => r.from !== 'IS').map((r) => r.name).join(',') + ']}';
    const is = 'var ' + s.set + '=new Set([' + rows.filter((r) => r.from !== 'Gd').map((r, i) => r.name + (i === 0 && s.suffixes[0] ? ',' + r.name + '+' + s.suffixes[0] : '')).join(',') + ']);';
    return ['\u0000\u0001ELF-fixture', ...Object.entries(union).map(([k, f]) => 'var z=' + lit(k, f) + ';'), decl, gd, is, 'VERSION:"' + version + '",BUILD_TIME:"x"', 'VERSION:"' + version + '"'].join('\n\u0000\u0000\n');
  };
  const planted = { ...dump.union, command_lifecycle: [...dump.union.command_lifecycle, 'x_399_probe'], 'system/planted_probe': ['note', 'uuid', 'session_id'] };
  const vdir = path.join(tmp, 'home/.local/share/claude/versions'); fs.mkdirSync(vdir, { recursive: true });
  const bin = path.join(vdir, '2.1.399'); fs.writeFileSync(bin, fixtureText(dump, { version: '2.1.399', union: planted }), { mode: 0o644 });
  const stamped = path.join(tmp, 'claude-stamped'); fs.writeFileSync(stamped, fixtureText(dump, { version: '2.1.398', union: planted }), { mode: 0o644 });
  fs.mkdirSync(path.join(tmp, 'home/.local/bin'), { recursive: true }); fs.symlinkSync(bin, path.join(tmp, 'home/.local/bin/claude'));
  ok('the fixture is NOT executable (0644) — a draft that succeeds over it never ran it', (fs.statSync(bin).mode & 0o111) === 0);
  // PURE pieces
  ok('versionOfBinary: the versions-dir name; else the bundle\'s most frequent VERSION stamp; a tie or none ⇒ null', D.versionOfBinary(bin, '') === '2.1.399' && D.versionOfBinary(stamped, fs.readFileSync(stamped, 'latin1')) === '2.1.398' && D.versionOfBinary('/x/claude', 'VERSION:"2.1.1" VERSION:"2.1.2"') === null && D.versionOfBinary('/x/claude', 'nothing') === null);
  const d7 = JSON.parse(read('scripts/fixtures/claude-cli/2.1.307.json')), d8 = JSON.parse(read('scripts/fixtures/claude-cli/2.1.308.json'));
  const nd = D.dumpDiff(d7, d8);
  ok('dumpDiff 2.1.307 → 2.1.308 (the tracked dumps): 0 changes — the registration this lane made had nothing to declare', nd.changes === 0 && nd.against === '2.1.307', nd);
  const viaRoad = D.dumpBinary(bin, [], { version: '2.1.399' }), pd = D.dumpDiff(dump, viaRoad);
  ok('…and over the fixture it names exactly the two plants (a new subtype, a field on command_lifecycle) — nothing else moved (the fixture round-trips the dump: nested objects and the 14 sentences too)', pd.changes === 2 && pd.newKeys.join() === 'system/planted_probe' && JSON.stringify(pd.fields) === '{"command_lifecycle":{"add":["x_399_probe"],"gone":[]}}' && JSON.stringify(viaRoad.nested) === JSON.stringify(dump.nested) && JSON.stringify(viaRoad.sentences) === JSON.stringify(dump.sentences), pd);
  ok('installedClaude: --bin, else `claude` on PATH, else ~/.local/bin/claude — the REAL file (the versions-dir name the version comes from)', D.installedClaude(null, { PATH: '/nonexistent', HOME: path.join(tmp, 'home') }) === bin && D.installedClaude(path.join(tmp, 'home/.local/bin/claude')) === bin && D.installedClaude(null, { PATH: '', HOME: '/nonexistent' }) === null);
  // the registry's draft(): the real child
  const dataDir = path.join(tmp, 'data-draft'), lines = [];
  const reg = REG.create({ dataDir, rootDir: REPO, claudeCmd: () => path.join(tmp, 'home/.local/bin/claude'), log: (...a) => lines.push(a.join(' ')), event: () => { } });
  const none = await reg.draft();
  ok('draft() before the hub read its version ⇒ refused by name (no-cli), nothing written', none.ok === false && none.code === 'no-cli' && !fs.existsSync(path.join(dataDir, 'claude-cli-dumps')));
  reg.note(NEWEST, 'hub');
  const isReg = await reg.draft();
  ok(`draft() for a REGISTERED hub claude (${NEWEST}) ⇒ refused (registered), nothing written`, isReg.ok === false && isReg.code === 'registered' && !fs.existsSync(path.join(dataDir, 'claude-cli-dumps')));
  reg.note('2.1.399 (Claude Code)', 'hub');
  const p1 = reg.draft(), p2 = reg.draft();
  ok('one draft at a time: a second press while it runs shares the first', p1 === p2);
  const t0 = Date.now(), r = await p1, ms = Date.now() - t0;
  const file = path.join(dataDir, 'claude-cli-dumps/2.1.399.json');
  const j = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  ok(`draft() ⇒ the child (scripts/claude-cli-dump.mjs --auto, ${ms} ms) wrote data/claude-cli-dumps/2.1.399.json: the dump the recipe writes + \`draft\` {takenAt, against ${NEWEST}, diff} naming the two plants`, r.ok === true && r.version === '2.1.399' && r.wrote === true && r.file === 'data/claude-cli-dumps/2.1.399.json' && r.changes === 2 && r.against === NEWEST && !!j && j.version === '2.1.399' && j.draft.against === NEWEST && j.draft.diff.changes === 2 && j.draft.diff.newKeys.join() === 'system/planted_probe' && (j.union.command_lifecycle || []).includes('x_399_probe') && typeof j.zod['system/planted_probe'] === 'string' && /^strings -n 8 /.test(j.method), { r, draft: j && j.draft });
  const { draft: _d, ...asRecipe } = j || {};
  ok('…minus `draft` it IS a fixture: the recipe\'s keys exactly, no path, no person', JSON.stringify(Object.keys(asRecipe)) === JSON.stringify(Object.keys(dump)) && !JSON.stringify(j).includes(tmp) && !/\/home\/|\/Users\//.test(JSON.stringify(j)));
  ok('…the journal says where the draft is (one line), and the status carries it — the row then shows its words, no button', lines.some((l) => l === `[cli-registration] record draft for claude 2.1.399: data/claude-cli-dumps/2.1.399.json — 2 changes against ${NEWEST}`) && reg.status().unregistered[0].draft?.changes === 2 && W.hubRegistrationRow(reg.status(), { t: tOf(null) }).button === null, { lines, st: reg.status() });
  const mtime = fs.statSync(file).mtimeMs;
  const r2 = await reg.draft();
  ok('a second press keeps the draft already taken (the box saw this build before) — not rewritten', r2.ok === true && r2.wrote === false && r2.changes === 2 && fs.statSync(file).mtimeMs === mtime, r2);
  // B-5e52 (lane bl-tests-e): the recipe's own road (`dumpBinary` without a version) once ASKED `--version` — on this 0644 file it
  // failed EACCES. It READS the build off the file now, like the auto road: the same 0644 file dumps, and nothing ran it.
  let ctl = null, ctlS = null; try { ctl = D.dumpBinary(bin, []).version; } catch (e) { ctl = e.code || e.message; }
  try { ctlS = D.dumpBinary(stamped, []).version; } catch (e) { ctlS = e.code || e.message; }
  ok('the recipe\'s own road (no version given) READS the build off a 0644 file, where it once ran `--version` and failed EACCES — the versions-dir name (2.1.399) and, off any other name, the bundle\'s VERSION stamp (2.1.398)', ctl === '2.1.399' && ctlS === '2.1.398', { ctl, ctlS });
  // the CLI entry by hand: one JSON line, exit 0; a registered build ⇒ nothing written
  const out = execFileSync(process.execPath, [path.join(REPO, 'scripts/claude-cli-dump.mjs'), '--auto', '--bin', bin, '--data', path.join(tmp, 'data-cli')], { encoding: 'utf8' });
  const o = JSON.parse(out.trim());
  ok('`node scripts/claude-cli-dump.mjs --auto --bin … --data …` by hand: ONE JSON line, the draft written', o.version === '2.1.399' && o.wrote === true && fs.existsSync(path.join(tmp, 'data-cli/claude-cli-dumps/2.1.399.json')), o);
  const bad = spawnSync(process.execPath, [path.join(REPO, 'scripts/claude-cli-dump.mjs'), '--auto', '--bin', path.join(REPO, `scripts/fixtures/claude-cli/${NEWEST}.json`), '--data', path.join(tmp, 'data-cli2')], { encoding: 'utf8' });
  let badOut = null; try { badOut = JSON.parse(String(bad.stdout).trim()); } catch { }
  // B-5e52 cure: the MANUAL road (`node scripts/claude-cli-dump.mjs <bin>`) on ~/.local/bin/claude — a link named «claude» whose
  // target sits under versions/2.1.399 and whose stamp votes 2.1.398: the real path's name decides, as --auto's road does
  const vdir2 = path.join(tmp, 'home2/.local/share/claude/versions'); fs.mkdirSync(vdir2, { recursive: true }); fs.mkdirSync(path.join(tmp, 'home2/.local/bin'), { recursive: true });
  const tgt2 = path.join(vdir2, '2.1.399'), link2 = path.join(tmp, 'home2/.local/bin/claude');
  fs.writeFileSync(tgt2, fixtureText(dump, { version: '2.1.398', union: planted }), { mode: 0o644 }); fs.symlinkSync(tgt2, link2);
  const man = spawnSync(process.execPath, [path.join(REPO, 'scripts/claude-cli-dump.mjs'), link2], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let manV = null; try { manV = JSON.parse(String(man.stdout)).version; } catch { manV = `exit ${man.status}: ${String(man.stderr).slice(0, 160)}`; }
  let asGiven = null; try { asGiven = D.dumpBinary(link2, []).version; } catch (e) { asGiven = e.message; }
  ok('the MANUAL road over ~/.local/bin/claude (a link named claude) reads the build off its REAL path — 2.1.399, its versions-dir name, never the stamp vote (2.1.398)', manV === '2.1.399', { manV });
  ok('RED CONTROL: the path as given (the road before the cure) leaves the build to the stamp vote — 2.1.398, the wrong build', asGiven === '2.1.398', { asGiven });
  ok('…a file that names no build (here a JSON file: no versions-dir name, no VERSION stamp) ⇒ exit 1 and the error BY NAME, nothing written', bad.status === 1 && !!badOut && /names no version/.test(badOut.error || '') && !fs.existsSync(path.join(tmp, 'data-cli2/claude-cli-dumps')), { status: bad.status, out: bad.stdout });
}

console.log('④ the wiring — the tick, the drift card, the routes, the clients');
{
  // oat-file-sync's tick tells onCliVersion the build it read (one --version read serves both)
  const seen = [];
  const caps = { ok: false, known: true, cli: '2.1.399', measured: NEWEST };
  const sync = require('../src/server/oat-file-sync.js').start({ accounts: { noteCliVersion: () => ({ ...caps, changed: false }), oatFileCaps: () => caps, syncOatFiles: async () => { }, oatFileSettled: async () => { } }, machineProbes: { cliVersion: async () => '2.1.399 (Claude Code)' }, claudeCmd: 'claude', onCliVersion: (v) => seen.push(v), log: () => { }, bootDelayMs: 3600e3 });
  await sync.tick(); sync.stop();
  ok('oat-file-sync\'s tick hands onCliVersion the parsed build (boot + 20 s, then every 15 min)', seen.join() === '2.1.399', seen);
  // the drift card tells global.__vsCliSeen the conversation's build
  const { createMessageManager } = require('../src/normalizers.js');
  const cliSeen = []; global.__vsCliSeen = (v) => cliSeen.push(v);
  const mm = createMessageManager('claude', 'test-cli-reg');
  mm.processLive({ type: 'system', subtype: 'init', cwd: '/w', session_id: 'e2e00000-0000-4000-8000-0000000003c1', uuid: 'u-1', model: 'claude-fable-5-1', claude_code_version: '2.1.399', x_399_unknown: 1 });
  delete global.__vsCliSeen;
  ok('a drift card on a conversation tells global.__vsCliSeen its build (the init frame\'s claude_code_version)', cliSeen.includes('2.1.399'), cliSeen);
  // mount: the two routes + the hook
  const routes = [], app = { get: (p, h) => routes.push(['GET', p, h]), post: (p, h) => routes.push(['POST', p, h]) };
  const reg = REG.mount(app, { dataDir: path.join(tmp, 'data-mount'), rootDir: REPO, log: () => { }, event: () => { } });
  ok('mount(): GET /api/cli-registration and POST /api/cli-registration/draft only — a GET never starts the child', routes.map(([m, p]) => m + ' ' + p).join() === 'GET /api/cli-registration,POST /api/cli-registration/draft' && typeof global.__vsCliSeen === 'function');
  global.__vsCliSeen('2.1.401'); delete global.__vsCliSeen;
  const res = () => { const o = { code: 200, body: null }; o.status = (c) => { o.code = c; return o; }; o.json = (b) => { o.body = b; return o; }; return o; };
  const g = res(); routes[0][2]({}, g);
  ok('…the hook notes a conversation\'s build; GET answers the status', g.body.unregistered.map((u) => u.version + ':' + u.sources).join() === '2.1.401:conversation' && g.body.newest === NEWEST, g.body);
  reg.noteHub(NEWEST);
  const p = res(); await routes[1][2]({}, p);
  ok('…POST for a registered hub claude ⇒ 409 {code: registered}', p.code === 409 && p.body.code === 'registered', p);
  const srv = read('server.js'), mmSrc = read('src/message-manager.js'), sf = read('src/lib/setup-flows.js'), ma = read('src/lib/manage-agents.js');
  ok('server.js mounts it ON the oat-file-sync line (the size ratchet — no new line): onCliVersion = mount(app, {dataDir, rootDir, claudeCmd}).noteHub', /require\('\.\/src\/server\/oat-file-sync\.js'\)\.start\(\{ accounts, machineProbes, claudeCmd: \(\) => cliCmds\.current\('claude'\) \|\| CLAUDE_CMD, onCliVersion: require\('\.\/src\/server\/cli-registration\.js'\)\.mount\(app, \{ dataDir: path\.join\(__dirname, 'data'\), rootDir: __dirname, claudeCmd: [^}]+\}\)\.noteHub \}\);/.test(srv));
  ok('message-manager _noteDrift calls global.__vsCliSeen with the build', /_noteDrift\(drift, raw, emit\) \{\n\s+const ver = [^\n]+\n\s+if \(ver\) \{ try \{ global\.__vsCliSeen\?\.\(ver\); \} catch \{\} \}/.test(mmSrc));
  ok('⚙ Diagnostics fetches /api/cli-registration and places the section (PURE diagnosticsSection)', /fetchJson\('\/api\/cli-registration'\)/.test(sf) && sf.includes('${diagnosticsSection(reg, { t, esc, when })}') && sf.includes("import { diagnosticsSection } from './cli-registration-words.js'"));
  ok('Manage agents\' claude row (this machine only — the SAME branch as the ephemeral-install warning: §78 counts harness branches) words it with hubRegistrationRow and POSTs the draft', /if \(!selectedHost && b\.key === 'claude' && info\.installed\) \{\n\s+if \(info\.install && !info\.install\.userLocal && b\.installCmd\) \{[\s\S]{0,2400}?const w = hubRegistrationRow\(await fetchJson\('\/api\/cli-registration'\), \{ t \}\);/.test(ma) && ma.includes("api('/api/cli-registration/draft', { method: 'POST' })"));
  const cr = read('src/server/cli-registration.js');
  ok('the child: process.execPath scripts/claude-cli-dump.mjs --auto with serviceEnv (test-architecture §94: a builder site, no row), bounded by its timeout', /execFile\(process\.execPath, \[script, '--auto', '--data', dataDir, \.\.\.\(bin \? \['--bin', bin\] : \[\]\)\], \{ env: serviceEnv\(process\.env\), timeout: timeoutMs/.test(cr) && REG.DRAFT_TIMEOUT_MS === 120e3);
  // test-architecture §94 (the spawn-env census) on the draft child — and the same census over a copy whose child inherits the hub's env
  const SC = await import('./spawn-env-census.mjs');
  const site = (patch) => { const s = SC.scan(REPO, patch ? { patch } : {}); const j = SC.judge(s); return { row: j.table.find((x) => x.site.startsWith('src/server/cli-registration.js:')), red: j.red.filter((x) => x.includes('src/server/cli-registration.js')) }; };
  const real = site(null);
  ok('§94: the census sees the draft child (a tracked file) as a BUILDER site — execFile process.execPath on serviceEnv, no row needed, nothing red', !!real.row && real.row.class === 'serviceEnv' && real.row.cmd === 'process.execPath' && real.red.length === 0, real);
  const mut = site({ 'src/server/cli-registration.js': cr.replace('{ env: serviceEnv(process.env), timeout', '{ timeout') });
  ok('…MUTANT: the same child with no env (it would inherit the hub\'s whole env, secrets included) ⇒ §94 RED, naming the site', cr.includes('{ env: serviceEnv(process.env), timeout') && mut.red.length === 1 && /UNLISTED raw/.test(mut.red[0]), mut);
}

console.log('\n⑤ THE HOSTED RUNNER\'S CLAUDE CODE (B-28b1, the coordinator\'s r238, 2026-11-20 — K44): the tree\'s PINNED build installed; the registry\'s newest a look-ahead that never gates');
{
  // the registry's newest moves almost daily: run 44748179665 installed 2.1.329 the day the tree pinned 2.1.328, and the record oracle ran
  // LENIENT. Law 1: every job that installs claude installs `@<the tree's pin>`, read by scripts/ci-claude.mjs from SCHEMA_CLI_VERSION —
  // never typed in the workflow, never bare. Law 2: the newest is installed BESIDE it (its own npm prefix), READ by the tree's --auto road
  // (strings, never run), kept as the artifact, said in one line; never a gate, never a turn. (B-9ff2 step 1's dump of the installed build
  // is that look-ahead now: the installed build IS the pin.)
  // r1682: the pin is READ IN ITS OWN ASSIGNMENT — a failed read stops the step before any install (a `$(…)` inside an argument does not)
  const PIN = 'run: pin="$(node scripts/ci-claude.mjs pin)" && bash scripts/ci-npm.sh install -g "@anthropic-ai/claude-code@$pin"\n';
  const PIN_RUN = PIN.slice('run: '.length, -1), LATEST_RUN = 'bash scripts/ci-npm.sh install -g @anthropic-ai/claude-code@latest';
  const LOOK = '        run: node scripts/ci-claude.mjs look-ahead --bin "$RUNNER_TEMP/claude-newest/bin/claude" --data "$RUNNER_TEMP/cli-dump"\n';
  const NEWEST = '        run: bash scripts/ci-npm.sh install -g @anthropic-ai/claude-code@latest\n';
  const fastOf = (yml) => { const at = yml.indexOf('\n  fast:\n'), end = yml.indexOf('\n  heavy-shards:\n', at); return at < 0 ? '' : yml.slice(at, end < 0 ? undefined : end); };
  const heavyOf = (yml) => { const at = yml.indexOf('\n  heavy-shards:\n'), end = yml.indexOf('\n  heavy:\n', at); return at < 0 ? '' : yml.slice(at, end < 0 ? undefined : end); };
  const wiring = (yml) => {
    const f = fastOf(yml), h = heavyOf(yml), bad = [];
    // every install of claude in the workflow is the pin: none typed, none bare (the look-ahead's @latest, in its own step, is the one other)
    // every line that installs claude, whole (the run's value): the pin's one form, or the look-ahead's newest
    const installs = yml.split('\n').filter((l) => /scripts\/ci-npm\.sh install -g "?@anthropic-ai\/claude-code/.test(l)).map((l) => l.trim().replace(/^- /, '').replace(/^run: /, ''));
    const other = installs.filter((x) => x !== PIN_RUN && x !== LATEST_RUN);
    if (!f.includes(PIN)) bad.push('the fast job does not install the tree\'s pinned build');
    if (!h.includes(PIN)) bad.push('the heavy shards do not install the tree\'s pinned build');
    for (const x of other) bad.push(`an install of claude that is not the pin: ${x}`);
    if (installs.filter((x) => x === LATEST_RUN).length !== 1) bad.push(`the registry's newest is installed ${installs.filter((x) => x === LATEST_RUN).length} time(s), not once (the look-ahead)`);
    // two steps, each ONE plain line (test-ci-gate §2g): the newest installed beside the pin, then read
    const inst = /( {6}- name: Look ahead — install the registry's newest claude beside the pin[^\n]*\n(?: {8}.*\n)+)/.exec(f);
    const look = /( {6}- name: Look ahead — read the newest beside the pin[^\n]*\n(?: {8}.*\n)+)/.exec(f), up = /( {6}- name: Upload the runner's claude dump[^\n]*\n(?: {8}.*\n)+)/.exec(f);
    if (!inst || !look) bad.push('the fast job keeps no look-ahead');
    else {
      const i = inst[1], d = look[1];
      if (!i.includes(NEWEST) || !d.includes(LOOK)) bad.push('the look-ahead is not the newest, installed beside the pin, read by the tree\'s road');
      if (!i.includes('          NPM_CONFIG_PREFIX: ${{ runner.temp }}/claude-newest\n')) bad.push('the look-ahead installs over the pin (no prefix of its own)');
      if (!i.includes('        continue-on-error: true\n') || !d.includes('        continue-on-error: true\n')) bad.push('the look-ahead can fail the job (no continue-on-error)');
      if (!i.includes('        if: matrix.part == 1 && matrix.node == 22\n') || !d.includes('        if: matrix.part == 1 && matrix.node == 22\n')) bad.push('the look-ahead runs in more than ONE job (part 1 on the image\'s Node — one artifact name a run)');
      if (f.indexOf(PIN) < 0 || f.indexOf(i) < f.indexOf(PIN) || f.indexOf(d) < f.indexOf(i)) bad.push('the look-ahead runs before the pinned install, or reads before it installs');
    }
    if (!up) bad.push('the look-ahead\'s dump is not kept (no upload)');
    else if (!up[1].includes('          path: ${{ runner.temp }}/cli-dump/claude-cli-dumps/\n') || !up[1].includes('          name: claude-cli-dump-${{ github.sha }}\n')) bad.push('the upload is not the draft dir, by the sha');
    else if (!up[1].includes('        if: matrix.part == 1 && matrix.node == 22 && always()\n')) bad.push('the upload runs in more than ONE job');
    return bad;
  };
  const yml = read('.github/workflows/ci.yml'), w = wiring(yml);
  ok('ci.yml installs the TREE\'S PINNED claude in the fast job AND the heavy shards (`@$(node scripts/ci-claude.mjs pin)` — never typed, never bare) and keeps the registry\'s newest as a LOOK-AHEAD beside it: its own prefix, read by the tree\'s road, never a gate, part 1 on Node 22, its dump the artifact claude-cli-dump-<sha>', w.length === 0, w);
  // the pin's one reader prints the tree's constant (a real child: what the workflow's $(…) reads)
  const pinOut = execFileSync(process.execPath, [path.join(REPO, 'scripts/ci-claude.mjs'), 'pin'], { encoding: 'utf8' }).trim();
  ok(`scripts/ci-claude.mjs pin prints the tree's pinned build — «${pinOut}» = SCHEMA_CLI_VERSION ${R.SCHEMA_CLI_VERSION}`, pinOut === R.SCHEMA_CLI_VERSION && /^\d+\.\d+\.\d+$/.test(pinOut), pinOut);
  const CC = await import('./ci-claude.mjs');
  const P0 = R.SCHEMA_CLI_VERSION, LA = (r) => CC.lookAheadLine(P0, r);
  const lines = { same: LA({ version: P0, registered: true, file: '/x/' + P0 + '.json', changes: 0 }), ahead: LA({ version: '9.9.999', registered: false, file: '/x/9.9.999.json', changes: 54 }), older: LA({ version: '0.0.1', registered: false }), broken: LA({ error: 'no claude binary' }) };
  ok('the look-ahead\'s ONE line says how far ahead: «' + lines.ahead + '» · the same build «nothing ahead» · an older one said · a failed read said — every one naming the pin, none a gate', /newest is 9\.9\.999, ahead of the pinned/.test(lines.ahead) && /54 change\(s\)/.test(lines.ahead) && /nothing registers itself/.test(lines.ahead) && /IS the pinned .* nothing ahead/.test(lines.same) && /OLDER than the pinned/.test(lines.older) && /could not be read — no claude binary/.test(lines.broken) && Object.values(lines).every((l) => l.includes(P0)), lines);
  // CONTROLS — each planted fault named
  const typed = yml.replace(PIN, 'run: bash scripts/ci-npm.sh install -g @anthropic-ai/claude-code@' + P0 + '\n');
  // stale-pins: kept — the 96a0db36d form, the pin read inside the install's argument (r1682's red)
  const inArg = yml.replace(PIN, 'run: bash scripts/ci-npm.sh install -g @anthropic-ai/claude-code@$(node scripts/ci-claude.mjs pin)\n');
  const bare = yml.replace(PIN, 'run: bash scripts/ci-npm.sh install -g @anthropic-ai/claude-code\n');
  const asGate = yml.replace(/( {6}- name: Look ahead — read the newest beside the pin[^\n]*\n(?: {8}(?!continue-on-error).*\n)*) {8}continue-on-error: true\n/, '$1');
  const overPin = yml.replace('          NPM_CONFIG_PREFIX: ${{ runner.temp }}/claude-newest\n', '');
  const noLook = yml.replace(/ {6}- name: Look ahead — install the registry's newest claude beside the pin[^\n]*\n(?: {8}.*\n)+/, '').replace(/ {6}- name: Look ahead — read the newest beside the pin[^\n]*\n(?: {8}.*\n)+/, '');
  const CTL = { typed: [typed, /an install of claude that is not the pin: bash scripts\/ci-npm\.sh install -g @anthropic-ai\/claude-code@\d/], bare: [bare, /an install of claude that is not the pin: bash scripts\/ci-npm\.sh install -g @anthropic-ai\/claude-code$/], inArg: [inArg, /an install of claude that is not the pin: bash scripts\/ci-npm\.sh install -g @anthropic-ai\/claude-code@\$\(node scripts\/ci-claude\.mjs pin\)$/], asGate: [asGate, /the look-ahead can fail the job/], overPin: [overPin, /installs over the pin/], noLook: [noLook, /keeps no look-ahead/] };
  const seen = Object.fromEntries(Object.entries(CTL).map(([k, [t, re]]) => [k, t !== yml && wiring(t).some((x) => re.test(x))]));
  ok('CONTROL: a typed version, a bare install, the pin read inside the install\'s argument (the 96a0db36d form), a look-ahead that can fail the job, one that installs over the pin, and none at all — each RED by name', Object.values(seen).every(Boolean), seen);
  // THE PIN IS CHECKED AS A VERSION (r1682): pinOf names a read that throws and a value that is not x.y.z
  const okPin = CC.pinOf(() => '2.1.328'), thrown = CC.pinOf(() => { throw new Error("Cannot find module 'a-module-npm-ci-brings'"); }), notV = ['', undefined, '2.1', 'latest', '2.1.328 '].map((v) => CC.pinOf(() => v));
  ok('pinOf: the pin is a version x.y.z or an ERROR named — a read that throws («could not be read», its first line said) and a value that is not x.y.z (empty, none, 2.1, latest, a trailing blank)', okPin.version === '2.1.328' && !okPin.error && /could not be read .*Cannot find module 'a-module-npm-ci-brings'/.test(thrown.error) && notV.every((r) => !r.version && /is not a version x\.y\.z/.test(r.error)), { okPin, thrown, notV });
  // THE STEP's OWN LINE under GitHub's shell (bash -eo pipefail), in a stub tree: the real ci-claude.mjs, a recorder for scripts/ci-npm.sh,
  // and a src/record-shape.js that throws (a require only `npm ci` brings) or that holds the pin
  {
    const stubAt = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cli-reg-pin-')), rec = path.join(stubAt, 'installs.txt');
    try {
      for (const d of ['scripts', 'src']) fs.mkdirSync(path.join(stubAt, d));
      fs.copyFileSync(path.join(REPO, 'scripts/ci-claude.mjs'), path.join(stubAt, 'scripts/ci-claude.mjs'));
      fs.writeFileSync(path.join(stubAt, 'scripts/ci-npm.sh'), 'printf "%s\\n" "$*" >> "$VS_PIN_REC"\n');
      const stepRun = (line, shape) => {
        fs.writeFileSync(path.join(stubAt, 'src/record-shape.js'), shape);
        try { fs.rmSync(rec, { force: true }); } catch { }
        const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', line], { cwd: stubAt, env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', VS_PIN_REC: rec }, encoding: 'utf8', timeout: 30000 });
        let installed = null; try { installed = fs.readFileSync(rec, 'utf8').trim(); } catch { }
        return { status: r.status, installed, stderr: (r.stderr || '').trim().split('\n')[0] };
      };
      const THROWS = "require('a-module-only-npm-ci-brings');\n", HOLDS = `module.exports = { SCHEMA_CLI_VERSION: '${P0}' };\n`, NOTV = "module.exports = { SCHEMA_CLI_VERSION: undefined };\n";
      const IN_ARG = 'bash scripts/ci-npm.sh install -g @anthropic-ai/claude-code@$(node scripts/ci-claude.mjs pin)';
      const good = stepRun(PIN_RUN, HOLDS), broken = stepRun(PIN_RUN, THROWS), unset = stepRun(PIN_RUN, NOTV), old = stepRun(IN_ARG, THROWS);
      ok(`the workflow's pin step, its own line under bash -eo pipefail: a readable pin installs @anthropic-ai/claude-code@${P0}; a pin that cannot be read FAILS the step (exit ${broken.status}) and installs NOTHING, saying why (${broken.stderr.slice(0, 120)}); a value that is not a version the same`,
        good.status === 0 && good.installed === `install -g @anthropic-ai/claude-code@${P0}` && broken.status !== 0 && broken.installed === null && /ci-claude pin: the tree's pinned build could not be read/.test(broken.stderr) && unset.status !== 0 && unset.installed === null, { good, broken, unset });
      ok('…RED CONTROL: the 96a0db36d line (the pin read inside the install\'s argument), with the same unreadable pin, exits 0 and installs `@anthropic-ai/claude-code@` — an EMPTY version, the registry\'s newest under the pin\'s name (r1682\'s red)',
        old.status === 0 && old.installed === 'install -g @anthropic-ai/claude-code@', old);
    } finally { try { fs.rmSync(stubAt, { recursive: true, force: true }); } catch { } }
  }
}

console.log('⑥ B-574d (主开发 r4764): the state through the STORE WRITER — its seam: the file, the bytes, the name; a failed landing said, the old file whole');
{
  const REG_FILE = path.join(REPO, 'src/server/cli-registration.js');
  const standIn = () => { const seen = []; return { seen, dirty(f, o) { seen.push({ f, name: o && o.name, o }); },
    durable(f) { const last = [...seen].reverse().find((x) => x.f === f); if (!last) return Promise.resolve(true);
      try { last.o.onWritten && last.o.onWritten(false, Object.assign(new Error('EIO: the write refused (placed)'), { code: 'EIO' })); } catch { } return Promise.resolve(false); } }; };
  const writerLeg = async (Mod, tag) => {
    const dW = path.join(tmp, 'data-writer-' + tag); fs.mkdirSync(dW, { recursive: true });
    const fileW = path.join(dW, 'cli-registration.json'), OLD = JSON.stringify({ v: 1, seen: {} }, null, 1) + '\n';
    fs.writeFileSync(fileW, OLD);
    const said = [], w = standIn();
    const r = Mod.create({ dataDir: dW, rootDir: REPO, pinned: R.SCHEMA_CLI_VERSIONS, log: (...a) => said.push(a.join(' ')), event: () => { }, writer: w });
    r.note('2.1.501 (Claude Code)', 'hub'); r.note('2.1.501', 'conversation');   // a burst: two changes, two hand-overs
    const landed = await r.landed();
    const mine = w.seen.filter((x) => x.f === fileW), last = mine.length ? JSON.parse(mine[mine.length - 1].o.produce()) : null;
    return { mine: mine.length, names: [...new Set(mine.map((x) => x.name))].join(), latest: !!(last && last.seen && last.seen['2.1.501'] && last.seen['2.1.501'].sources.join() === 'hub,conversation'),
      landed, said: said.filter((l) => /could not keep data\/cli-registration\.json/.test(l)).length, whole: fs.readFileSync(fileW, 'utf8') === OLD };
  };
  const g = await writerLeg(REG, 'real');
  ok(`the registry's saves go to the writer by name (${g.names}, ${g.mine} hand-overs), the last one the LATEST state (both sources), a failed landing answers false (${g.landed}) and is SAID (${g.said}), the old file stands whole`,
    g.mine === 2 && g.names === 'cli-registration.write' && g.latest && g.landed === false && g.said === 1 && g.whole, JSON.stringify(g));
  const RED = mutantCopies('cli-reg-writer', REPO).load('src/server/cli-registration.js', anchored(fs.readFileSync(REG_FILE, 'utf8'),
    "onWritten: (ok, e) => { if (!ok) { log('[cli-registration] could not keep data/cli-registration.json:'", "onWritten: (ok, e) => { if (false) { log('[cli-registration] could not keep data/cli-registration.json:'", 'reg-fail-cut'), 'reg-fail-cut');
  const r = await writerLeg(RED, 'red');
  ok('RED CONTROL: the failure branch taken out — the failed landing is said by nobody', r.said === 0 && r.landed === false, JSON.stringify(r));
}

console.log(fail ? `\n✗ (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
