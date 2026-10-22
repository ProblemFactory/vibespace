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
const LINE = (v) => `claude ${v} is not registered — records may show as new fields until the next release`;

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
  ok('zh: the button is 「生成记录草稿」, the line names the build; ja too', zr.button.label === '生成记录草稿' && zr.line.startsWith('claude 2.1.399 尚未登记') && jr.button.label === '記録の下書きを作成' && jr.line.startsWith('claude 2.1.399 は未登録です'), [zr, jr]);
  ok('Diagnostics: NO section while every build seen is registered', W.diagnosticsSection(reg({ version: NEWEST, registered: true }), { t, esc }) === '' && W.diagnosticsSection(null, { t, esc }) === '');
  const sec = W.diagnosticsSection(reg({ version: '2.1.399', registered: false }, [u, { version: '2.1.401', sources: ['conversation'], firstSeen: null, draft: null }]), { t, esc, when: () => 'WHEN' });
  ok('Diagnostics: ONE section, a row per unregistered build — the line, where it was seen, and what to do (the hub\'s: the button / the road; another machine\'s: the road there)', (sec.match(/<h2>/g) || []).length === 1 && sec.includes(esc(LINE('2.1.399'))) && sec.includes(esc(LINE('2.1.401'))) && sec.includes('seen as the hub&#39;s claude'.replace('&#39;', "'")) && sec.includes("a conversation's records".replace("'", "'")) && sec.includes('Manage agents ▸ claude ▸ Draft the record table') && sec.includes('on the machine whose claude this is') && sec.includes(`it knows ${NEWEST} and older`), sec);
  ok('…escaped: a version string can never write markup', !W.diagnosticsSection(reg(null, [{ version: '<b>2.1.399</b>', sources: ['hub'], draft: null }]), { t, esc }).includes('<b>2.1.399'));
  const zsec = W.diagnosticsSection(reg({ version: '2.1.399', registered: false }, [u]), { t: tOf(zh), esc, when: () => 'WHEN' });
  ok('Diagnostics in zh: the heading and the line in Chinese', zsec.includes('没有记录表的 claude 版本') && zsec.includes('claude 2.1.399 尚未登记'), zsec.slice(0, 300));
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
  ok('an unregistered build seen as the hub\'s CLI ⇒ ONE journal line (the brief\'s sentence + where the draft is) and ONE telemetry event cli-unknown-version (Diagnostics\' «Harness drift» lists cli-unknown-*)', r1.said === true && r1.registered === false && lines.length === 1 && lines[0].startsWith('[cli-registration] ' + LINE('2.1.399')) && /生成记录草稿/.test(lines[0]) && /claude-cli-dump\.mjs --auto/.test(lines[0]) && events.length === 1 && events[0][0] === 'cli-unknown-version' && events[0][1] === 'claude 2.1.399 · hub' && /^cli-unknown-/.test(events[0][0]), { lines, events });
  reg.note('2.1.399', 'hub'); reg.note('2.1.399', 'conversation'); reg.note('2.1.399', 'conversation');
  const st = reg.status();
  ok('…every later sighting — the 15-min tick again, a conversation\'s drift card — adds no line and no event; the build lists both sources', lines.length === 1 && events.length === 1 && st.unregistered.length === 1 && st.unregistered[0].version === '2.1.399' && st.unregistered[0].sources.join() === 'hub,conversation' && st.unregistered[0].firstSeen === 1792652400000 && st.unregistered[0].draft === null, { lines, st });
  ok('…an unparseable version or an unknown source is ignored', reg.note('unparsed', 'hub') === null && reg.note('2.1.400', 'elsewhere') === null && lines.length === 1);
  const again = mk();
  again.note('2.1.399', 'hub');
  ok('a RESTART (a new registry over the same data dir) does not say it again — data/cli-registration.json keeps the build', lines.length === 1 && events.length === 1 && JSON.parse(fs.readFileSync(path.join(dataDir, 'cli-registration.json'), 'utf8')).seen['2.1.399'].sources.join() === 'hub,conversation');
  const fresh = REG.create({ dataDir: path.join(tmp, 'data-fresh'), rootDir: REPO, log: (...a) => lines.push(a.join(' ')), event: () => { } });
  fresh.note('2.1.399', 'conversation');
  ok('CONTROL: a registry over an EMPTY data dir does say it (the latch is the kept file, not a skip) — seen on a conversation\'s records', lines.length === 2 && /seen on a conversation's records/.test(lines[1]));
  const next = mk([...R.SCHEMA_CLI_VERSIONS, '2.1.399']);
  ok('a release that REGISTERS the build drops it: nothing unregistered, the hub\'s claude registered', next.status().unregistered.length === 0 && next.note('2.1.399', 'hub').registered === true && next.status().hub.registered === true);
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
  // RED CONTROL: the recipe's own road (`dumpBinary` without a version — it asks `--version`) on the SAME 0644 file cannot run it
  let ctl = null; try { D.dumpBinary(bin, []); ctl = 'ran'; } catch (e) { ctl = e.code || e.message; }
  ok('RED CONTROL: the recipe\'s own road on the same file (`--version`, the pre-lane dumpBinary) fails EACCES — so the auto road that succeeded never executed it', ctl === 'EACCES', ctl);
  // the CLI entry by hand: one JSON line, exit 0; a registered build ⇒ nothing written
  const out = execFileSync(process.execPath, [path.join(REPO, 'scripts/claude-cli-dump.mjs'), '--auto', '--bin', bin, '--data', path.join(tmp, 'data-cli')], { encoding: 'utf8' });
  const o = JSON.parse(out.trim());
  ok('`node scripts/claude-cli-dump.mjs --auto --bin … --data …` by hand: ONE JSON line, the draft written', o.version === '2.1.399' && o.wrote === true && fs.existsSync(path.join(tmp, 'data-cli/claude-cli-dumps/2.1.399.json')), o);
  const bad = spawnSync(process.execPath, [path.join(REPO, 'scripts/claude-cli-dump.mjs'), '--auto', '--bin', path.join(REPO, `scripts/fixtures/claude-cli/${NEWEST}.json`), '--data', path.join(tmp, 'data-cli2')], { encoding: 'utf8' });
  let badOut = null; try { badOut = JSON.parse(String(bad.stdout).trim()); } catch { }
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
  ok('server.js mounts it ON the oat-file-sync line (the size ratchet — no new line): onCliVersion = mount(app, {dataDir, rootDir, claudeCmd}).noteHub', /require\('\.\/src\/server\/oat-file-sync\.js'\)\.start\(\{ accounts, machineProbes, claudeCmd: CLAUDE_CMD, onCliVersion: require\('\.\/src\/server\/cli-registration\.js'\)\.mount\(app, \{ dataDir: path\.join\(__dirname, 'data'\), rootDir: __dirname, claudeCmd: [^}]+\}\)\.noteHub \}\);/.test(srv));
  ok('message-manager _noteDrift calls global.__vsCliSeen with the build', /_noteDrift\(drift, raw, emit\) \{\n\s+const ver = [^\n]+\n\s+if \(ver\) \{ try \{ global\.__vsCliSeen\?\.\(ver\); \} catch \{\} \}/.test(mmSrc));
  ok('⚙ Diagnostics fetches /api/cli-registration and places the section (PURE diagnosticsSection)', /fetchJson\('\/api\/cli-registration'\)/.test(sf) && sf.includes('${diagnosticsSection(reg, { t, esc })}') && sf.includes("import { diagnosticsSection } from './cli-registration-words.js'"));
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

console.log(fail ? `\n✗ (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
