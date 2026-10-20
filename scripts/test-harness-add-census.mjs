#!/usr/bin/env node
// test-harness-add-census — THE FENCE CENSUS OF A HARNESS IS ONE CHECKLIST (lane harness-add-census, 2026-10-20; the owner
// 「harness测试改进也做一下吧」; B-? measured on lane antigravity-harness §7 «Traps hit»: eleven fences met one red at a time).
// The engine is scripts/harness-fences.mjs (the generator scripts/harness-new.mjs imports the same row kinds). Here:
//   §1 the REAL registry over the real tree ⇒ green (or a real fence lacks an id today — add the row, never an exemption);
//      the fence TABLE printed (file → shape → the ids it names), the row kinds, the rules
//   §2 THE RED CONTROL: a minimal descriptor (`zz-probe`, the REQUIRED keys, a fake wrapper) register()ed in a CHILD
//      process ⇒ the census names EXACTLY the fences that lack it — every table site, every applicable row kind — and
//      the Antigravity lane's eleven traps are all among them, by file; the built-ins stay green beside it
//   §3 MUTANTS: a fence's row deleted for an existing id ⇒ RED naming the file and the row (a test's id list, a cli-registry
//      EXCLUDED row, a kb-features table row, the §78 family list); a dead exemption ⇒ RED; a rule's needle gone ⇒ RED
//   §4 the derivations cross-checked against the suites that pin them (the roster count); the scan's own controls (a
//      planted table is seen, the same text in a comment is not, two ids are no table); this suite is no fence itself
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { census, scanSet, harnessNames, loadRegistry, formatChecklist, FENCE_EXEMPT, ROW_KINDS, RULES, tableSites, mdTables } from './harness-fences.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const H = loadRegistry(REPO);
const DESCS = H.list(), BUILTIN = H.ids().filter((id) => H.isBuiltin(id)), IDS = H.ids();
const FILES = scanSet(REPO);

// ── §1 the real registry ────────────────────────────────────────────────────────────────────────────────────────────
console.log('§1 the real registry over the real tree');
const real = census({ repo: REPO, descriptors: DESCS, builtin: BUILTIN, files: FILES });
ok(FILES.length > 900 && FILES.every((f) => /^(?:scripts|src)\//.test(f)) && !FILES.some((f) => f.startsWith('scripts/fixtures/')), `the scan set is git ls-files over scripts/** + src/** (${FILES.length} files; fixtures excepted)`);
ok(real.sites.length >= 30, `the tree holds ${real.sites.length} harness-keyed table sites (≥ 30: the census is non-vacuous)`, real.sites.length);
ok(real.ok, `every registered harness (${IDS.join(', ')}) is in every fence, or exempt with a reason — ${real.missing.length} missing, ${real.rows.length} row(s), ${real.dead.length} dead exemption(s), rules alive ${real.rules.filter((r) => r.alive).length}/${real.rules.length}`, real.checklist.filter((l) => !l.startsWith('rule · ')));
const byShape = {}; for (const s of real.sites) byShape[s.shape] = (byShape[s.shape] || 0) + 1;
console.log(`    the fence table (${real.sites.length} sites; shapes ${JSON.stringify(byShape)}):`);
for (const s of real.sites) console.log(`      ${s.file}:${s.line}  ${s.shape.padEnd(11)} ${s.decl.slice(0, 32).padEnd(32)} [${s.found.join(' ')}]${s.countPins.length ? '  pin ' + s.countPins.map((p) => p.text).join(',') : ''}`);
console.log(`    the row kinds (${ROW_KINDS.length}): ${ROW_KINDS.map((k) => k.kind).join(' · ')}`);
console.log(`    the rules (${RULES.length}): ${RULES.map((r) => path.basename(r.suite)).join(' · ')}`);
ok(FENCE_EXEMPT.every((e) => e.file && e.needle && Array.isArray(e.ids) && e.ids.length && e.ids.every((id) => IDS.includes(id)) && e.why && e.why.length > 20), `every exemption names a file, a needle, registered ids and a reason (${FENCE_EXEMPT.length} rows)`);
ok(real.rules.every((r) => r.alive), 'every rule\'s needle is alive in its suite (a renamed rule is noticed)', real.rules.filter((r) => !r.alive).map((r) => r.suite));
ok(real.sites.some((s) => s.file === 'scripts/id-branch-census.mjs') && real.sites.some((s) => s.file === 'scripts/ci.mjs' && s.decl === 'REAL_PROGRAMS') && real.sites.some((s) => s.file === 'src/backend-caps.js'), 'the fences the Antigravity lane never saw are sites: the §78 family list, the gate\'s real-program alternation, the caps registry');
ok(real.sites.some((s) => s.file === 'scripts/test-quota-source.mjs' && s.countPins.some((p) => p.n === IDS.length)), `a count pin beside a table is named with it (test-quota-source's ids().length === ${IDS.length})`);
{ // §1b the shapes by example: object / list / rows / regex / alternation
  const want = { object: 'src/backend-caps.js', list: 'scripts/test-quota-source.mjs', rows: 'src/lib/manage-agents.js', regex: 'scripts/test-global-search.mjs', alternation: 'scripts/ci.mjs' };
  ok(Object.entries(want).every(([shape, file]) => real.sites.some((s) => s.shape === shape && s.file === file)), `every table shape is found by example: ${Object.entries(want).map(([s, f]) => `${s} (${f})`).join(', ')}`);
}

// ── §2 the RED control: zz-probe in a child ─────────────────────────────────────────────────────────────────────────
console.log('§2 THE RED CONTROL: a planted descriptor in a child — the checklist');
const DIR = scratch('hac'); fs.mkdirSync(DIR, { recursive: true });
const PROBE = { id: 'zz-probe', label: 'ZZ Probe', kind: 'chat', wrapper: 'data/bin/zz-wrapper.js' };
const WRAPPER = '#!/usr/bin/env node\n// a fake chat wrapper: it reaches the agent API (VIBESPACE_API), as agy\'s does\nconst api = process.env.VIBESPACE_API;\n';
const child = path.join(DIR, 'probe.mjs');
fs.writeFileSync(child, `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = process.argv[2];
const H = require(REPO + '/src/harnesses/index.js');
const { BackendAdapter } = require(REPO + '/src/adapters/base.js');
class ZzAdapter extends BackendAdapter {}
// the REQUIRED keys (id/label/kind/caps/Adapter/adapterConfig/wrapper) — and the quota contract register() demands of everyone (NULL_QUOTA: no limit signal)
H.register({ ...${JSON.stringify(PROBE)}, caps: { pool: false }, Adapter: ZzAdapter, adapterConfig: (cfg) => ({ ptyWrapper: cfg.ptyWrapper }), quota: H.NULL_QUOTA });
const F = await import(REPO + '/scripts/harness-fences.mjs');
const r = F.census({ repo: REPO, descriptors: H.list(), builtin: H.ids().filter((id) => H.isBuiltin(id)), override: { ${JSON.stringify(PROBE.wrapper)}: ${JSON.stringify(WRAPPER)} } });
process.stdout.write(JSON.stringify({ ok: r.ok, ids: H.ids(), sites: r.sites.length, missing: r.missing, rows: r.rows, dead: r.dead, rules: r.rules.map((x) => ({ suite: x.suite, alive: x.alive })), text: F.formatChecklist(r) }));
`);
const run = spawnSync(process.execPath, [child, REPO], { encoding: 'utf8', maxBuffer: 1 << 26 });
let P = null; try { P = JSON.parse(run.stdout); } catch { P = null; }
ok(run.status === 0 && P, `the child registered zz-probe beside the built-ins and ran the census (exit ${run.status})`, (run.stderr || '').slice(0, 400));
if (P) {
  const mine = P.missing.filter((m) => m.id === PROBE.id), others = P.missing.filter((m) => m.id !== PROBE.id);
  ok(P.ids.includes(PROBE.id) && P.sites === real.sites.length, `the child saw the same ${P.sites} table sites and six harnesses`);
  ok(!P.ok && mine.length === P.sites && others.length === 0 && P.dead.length === 0, `RED: zz-probe is missing from EXACTLY every table site (${mine.length} of ${P.sites}); the built-ins stay green beside it; no exemption names it`, { others: others.slice(0, 3), dead: P.dead });
  const kinds = P.rows.filter((r) => r.id === PROBE.id).map((r) => r.kind);
  const expectKinds = ['cli-registry-excluded', 'peer-text-declared', 'brand-svg', 'i18n-category', 'i18n-category', 'backend-option', 'own-suite-ci-row', 'kb-features'];
  ok(expectKinds.every((k) => kinds.includes(k)) && !kinds.includes('settings-group') && !kinds.includes('registry-require') && P.rows.every((r) => r.id === PROBE.id), `the row kinds a chat harness owes are all named (${[...new Set(kinds)].join(', ')}); none for a settings table it has not declared, none for a built-in require (it is register()ed)`, kinds);
  ok(P.rows.filter((r) => r.kind === 'kb-features').length >= 3, 'kb-features: a row in each harness-keyed table + a feature entry naming the label');
  // THE ELEVEN (lane antigravity-harness report §7 «Traps hit») — every one is on the probe's checklist, by file
  const TRAPS = [
    ['scripts/test-cli-registry.mjs', 'the EXCLUDED row for the new data/bin wrapper'], ['scripts/test-peer-text-census.mjs', 'the DECLARED_CLIS row'],
    ['scripts/test-settings-view.mjs', 'the installed-CLI facts + the (h.acp || h.exe) pin + the advanced bound'], ['scripts/test-codex-pool.mjs', 'the .sort(rosterSort) count'],
    ['scripts/test-harness-spawn.mjs', 'the spawn-form leg'], ['scripts/test-quota-source.mjs', 'the registry roster + its count pin'], ['scripts/test-agent-env.mjs', 'the keyEnvVars strip (HOME guarded)'],
    ['scripts/ci.mjs', 'the fast row for the harness suite (and the real-program names)'], ['scripts/test-channels-egress.mjs', 'the host-literal rule'], ['scripts/test-record-clear-census.mjs', 'the alias pass'],
    ['scripts/test-ci-gate.mjs', 'the Date.now() rule'], ['scripts/test-changelog-style.mjs', 'the bullet caps'], [`public/brand/${PROBE.id}.svg`, 'the brand svg'], ['public/index.html', 'the backend option'],
    ['src/lib/i18n-zh.js', 'the zh label key'], ['src/lib/i18n-ja.js', 'the ja label key'], ['docs/kb-features.md', 'the Harnesses tables + entry'],
  ];
  const absent = TRAPS.filter(([f]) => !P.text.includes(f));
  ok(absent.length === 0, `THE ELEVEN TRAPS are all on the checklist, by file (${TRAPS.length} files named)`, absent.map(([f, w]) => `${f} (${w})`));
  ok(/test-quota-source\.mjs:\d+: add 'zz-probe'.*count pin .length === \d+ → \d+/.test(P.text), 'the count pin beside the registry roster is named with its next value');
  ok(P.text.includes("'zz-probe' (or its program 'zz-probe')") === false && P.text.includes("add 'zz-probe' to REAL_PROGRAMS"), 'a chat harness with no exe/acp row is keyed by its id alone (the program IS the id); the gate\'s real-program alternation is on the list');
  console.log('    ── the checklist a zz-probe lane reads (verbatim) ──');
  for (const l of P.text.split('\n')) console.log('    ' + l);
}

// ── §3 MUTANTS ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§3 MUTANTS: a deleted fence row, a dead exemption, a dead rule needle ⇒ RED by name');
const mutant = (override, exempt) => census({ repo: REPO, descriptors: DESCS, builtin: BUILTIN, files: FILES, override, ...(exempt ? { exempt } : {}) });
{ // (a) a test's id list
  const rel = 'scripts/test-quota-source.mjs', src = read(rel), cut = src.replace("'opencode', 'antigravity']", "'opencode']");
  ok(cut !== src, '(a) the mutant text differs (the roster list loses antigravity)');
  const m = mutant({ [rel]: cut });
  ok(!m.ok && m.missing.length === 1 && m.missing[0].file === rel && m.missing[0].id === 'antigravity' && m.checklist[0].startsWith(`${rel}:`) && m.checklist[0].includes("add 'antigravity'"), '(a) RED: the file and the row are named, nothing else moves', m.checklist.slice(0, 2));
}
{ // (b) a cli-registry EXCLUDED row (a row KIND)
  const rel = 'scripts/test-cli-registry.mjs', src = read(rel), cut = src.split('\n').filter((l) => !l.includes("'agy-wrapper.js':")).join('\n');
  ok(cut.length < src.length, '(b) the mutant text differs (the agy-wrapper EXCLUDED row is gone)');
  const m = mutant({ [rel]: cut });
  ok(!m.ok && m.missing.length === 0 && m.rows.length === 1 && m.rows[0].kind === 'cli-registry-excluded' && m.rows[0].id === 'antigravity' && m.rows[0].row.includes("'agy-wrapper.js':"), '(b) RED: the row kind names the file and the row text to add', m.rows);
}
{ // (c) a kb-features table row
  const rel = 'docs/kb-features.md', src = read(rel), lines = src.split('\n');
  const i = lines.findIndex((l) => /^\| antigravity /.test(l));
  ok(i > 0, '(c) the auto-resume table has an antigravity row to delete');
  const cut = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n');
  const m = mutant({ [rel]: cut });
  ok(!m.ok && m.rows.length === 1 && m.rows[0].kind === 'kb-features' && m.rows[0].id === 'antigravity' && /^docs\/kb-features\.md:\d+$/.test(m.rows[0].file) && m.rows[0].row.includes('a row for antigravity'), '(c) RED: the table (by line) and the missing row are named', m.rows);
}
{ // (d) the §78 family list — the fence nobody saw before this census
  const rel = 'scripts/id-branch-census.mjs', src = read(rel), cut = src.replace("'opencode', 'antigravity', 'acp', 'shell'", "'opencode', 'acp', 'shell'");
  ok(cut !== src, '(d) the mutant text differs (the harness family loses antigravity)');
  const m = mutant({ [rel]: cut });
  ok(!m.ok && m.missing.length === 1 && m.missing[0].file === rel && m.missing[0].id === 'antigravity', '(d) RED: the ratchet\'s own family list is a fence', m.checklist.slice(0, 1));
}
{ // (e) a dead exemption: a row that exempts nothing
  const m = mutant({}, [...FENCE_EXEMPT, { file: 'scripts/ci.mjs', needle: 'REAL_PROGRAMS', ids: ['codex'], why: 'a planted row — codex is present there' }]);
  ok(!m.ok && m.missing.length === 0 && m.dead.length === 1 && m.dead[0].ids[0] === 'codex' && m.checklist.some((l) => /DEAD exemption/.test(l)), '(e) RED: a dead exemption is named (an exemption that hides nothing would hide the next gap)', m.dead);
}
{ // (f) a rule whose needle died
  const rel = 'scripts/test-ci-gate.mjs', src = read(rel), cut = src.split('Date.now() delta').join('a renamed rule');
  const m = mutant({ [rel]: cut });
  const r = m.rules.find((x) => x.suite === rel);
  ok(!m.ok && r && !r.alive && m.checklist.some((l) => l.includes(rel) && /NEEDLE IS GONE/.test(l)), '(f) RED: a rule whose needle moved or died is named (the checklist never lists a rule that is no longer checked)', m.checklist.filter((l) => /NEEDLE/.test(l)));
}
{ // (g) a harness gone from the registry: the census is over the REGISTERED ids — a descriptor removed ⇒ nothing is asked of it
  const m = census({ repo: REPO, descriptors: DESCS.filter((d) => d.id !== 'antigravity'), builtin: BUILTIN.filter((id) => id !== 'antigravity'), files: FILES });
  ok(m.missing.every((x) => x.id !== 'antigravity') && m.rows.every((x) => x.id !== 'antigravity'), '(g) the ids come from the registry: an unregistered id is never demanded (the fences keep its rows; the exemptions naming it are not dead — they still match sites)');
}

// ── §4 derivations + the scan's own controls ────────────────────────────────────────────────────────────────────────
console.log('§4 the derivations cross-checked; the scan\'s controls; this suite is no fence');
{
  const names = DESCS.map(harnessNames);
  const roster = RULES.find((r) => r.suite === 'scripts/test-codex-pool.mjs');
  const pinned = /count\(ma, \/\\\.sort\\\(rosterSort\\\)\/g\) === (\d+)/.exec(read(roster.suite));
  ok(pinned && Number(pinned[1]) === roster.derive(names), `the roster count test-codex-pool pins (${pinned && pinned[1]}) = the harnesses with creds (${roster.derive(names)}: ${names.filter((n) => n.hasCreds).map((n) => n.id).join(', ')})`);
  const ag = names.find((n) => n.id === 'antigravity'), cl = names.find((n) => n.id === 'claude'), sh = names.find((n) => n.id === 'shell');
  ok(ag.program === 'agy' && ag.keys.join(',') === 'antigravity,agy' && cl.program === 'claude' && cl.keys.join(',') === 'claude' && sh.program === null && sh.keys.join(',') === 'shell', 'harnessNames: the program is exe.command / acp.command (agy), the id for a chat harness without one, none for a terminal');
  ok(ag.category === 'Antigravity CLI' && cl.category === 'Claude' && sh.category === null && ag.brand === '/brand/antigravity.svg', 'harnessNames: the settings category (the i18n key the Settings window needs) and the brand come off the descriptor');
  ok(real.sites.find((s) => s.file === 'scripts/ci.mjs' && s.decl === 'REAL_PROGRAMS').found.includes('antigravity'), "a site keyed by PROGRAM names (ci.mjs REAL_PROGRAMS: agy) credits the harness whose program it is");
}
{ // the scan's controls
  const names = DESCS.map(harnessNames), four = IDS.slice(0, 4);
  const planted = `const T = { ${four.map((id) => `${id}: 1`).join(', ')} };\n`;
  const inComment = `// ${four.map((id) => `${id}: 1`).join(', ')}\nconst T = {};\n`;
  const two = `const T = [${IDS.slice(0, 2).map((id) => `'${id}'`).join(', ')}];\n`;
  const sw = `switch (x) { ${four.map((id) => `case '${id}': break;`).join(' ')} }\n`;
  const re = `const R = /^(${four.join('|')})$/;\n`;
  const rows = `const R = [${four.map((id) => `{ backend: '${id}', n: 1 }`).join(', ')}];\n`;
  ok(tableSites('src/zz.js', planted, names).length === 1 && tableSites('src/zz.js', planted, names)[0].shape === 'object' && tableSites('src/zz.js', planted, names)[0].found.length === 4, 'NEGATIVE CONTROL: a planted object keyed by four ids is a site (object, 4 found)');
  ok(tableSites('src/zz2.js', inComment, names).length === 0, '…the same words in a COMMENT are no table (acorn drops comments)');
  ok(tableSites('src/zz3.js', two, names).length === 0, '…a list of two ids is no table (three is the bound)');
  ok(tableSites('src/zz4.js', sw, names).length === 1 && tableSites('src/zz4.js', sw, names)[0].shape === 'switch', '…a switch on four ids is a site (switch)');
  ok(tableSites('src/zz5.js', re, names).length === 1 && tableSites('src/zz5.js', re, names)[0].shape === 'regex', '…a regex alternation of four ids is a site (regex)');
  ok(tableSites('src/zz6.js', rows, names).length === 1 && tableSites('src/zz6.js', rows, names)[0].shape === 'rows', '…rows carrying backend: ids are a site (rows)');
  const md = `| harness | x |\n|---|---|\n${four.map((id) => `| **${id}** (x) | y |`).join('\n')}\n`;
  ok(mdTables(md, names).length === 1 && mdTables(md, names)[0].ids.length === 4 && mdTables('| a | b |\n|---|---|\n| claude | 1 |\n', names).length === 0, '…a markdown table whose first cells name four ids is a harness table; one id is not');
}
ok(!real.sites.some((s) => /scripts\/(?:test-harness-add-census|harness-fences|harness-new)\.mjs$/.test(s.file)), 'this suite, the engine and the generator are no fence themselves (no id table of their own — they derive)');

// ── §5 THE GENERATOR (scripts/harness-new.mjs) ──────────────────────────────────────────────────────────────────────
console.log('§5 the generator: its plan satisfies every row kind in memory; the rows deleted ⇒ RED with the probe\'s checklist');
{
  const G = await import('./harness-new.mjs');
  const o = G.parseArgs(['zz-gen', '--label', 'ZZ Gen', '--kind', 'chat', '--wrapper', 'data/bin/zz-gen-wrapper.js']);
  const ctx = { repo: REPO, files: FILES, read, exists: (rel) => fs.existsSync(path.join(REPO, rel)), names: DESCS.map(harnessNames), builtin: BUILTIN, memo: {} };
  const p = G.plan(o, ctx), gen = G.descriptorOf(o);
  const files2 = [...FILES, ...Object.keys(p.writes).filter((f) => /\.(?:m?js|cjs)$/.test(f))];
  const run2 = (override) => census({ repo: REPO, descriptors: [...DESCS, gen], builtin: [...BUILTIN, gen.id], files: files2, override });
  ok(Object.keys(p.writes).length >= 6 && Object.keys(p.edits).length >= 8 && Object.keys(p.edits).every((f) => fs.existsSync(path.join(REPO, f))), `the plan (in memory, nothing written): ${Object.keys(p.writes).length} new files, ${Object.keys(p.edits).length} edited tracked files — row kinds ${p.kinds.join(' · ')}`);
  const r = run2({ ...p.writes, ...p.edits });
  ok(r.rows.length === 0 && r.dead.length === 0 && r.rules.every((x) => x.alive), 'the plan satisfies EVERY row kind (no row left for zz-gen; the built-ins untouched; no exemption died)', r.rows);
  ok(r.missing.length > 0 && r.missing.every((m) => m.id === gen.id) && r.missing.length === r.sites.length, `what is LEFT is exactly the id-keyed tables (${r.missing.length} sites — judgment no generator fakes: caps, META, settings, the suites' rosters)`);
  const kindsOf = (x) => [...new Set(x.rows.map((y) => y.kind))].sort();
  // the mutant: the skeleton files stay, every fence row the plan wrote is gone (the edits, the brand file)
  const { [`public/brand/${gen.id}.svg`]: _brand, ...skeleton } = p.writes;
  const m = run2(skeleton);
  const probeKinds = P ? kindsOf(P) : [];
  ok(!m.ok && m.rows.length > 0 && JSON.stringify(kindsOf(m)) === JSON.stringify([...probeKinds, 'registry-require'].sort()), `MUTANT: the generated skeleton with its fence rows deleted ⇒ RED with the probe's checklist kind for kind, plus the require line a BUILT-IN owes (${kindsOf(m).join(', ')})`, { mutant: kindsOf(m), probe: probeKinds });
  const refuses = (args) => { try { G.parseArgs(args); return false; } catch { return true; } };
  ok(refuses(['ZZ-gen', '--label', 'x', '--wrapper', 'data/bin/x.js']) && refuses(['zz', '--wrapper', 'data/bin/x.js']) && refuses(['zz', '--label', 'x', '--kind', 'chat']) && refuses(['zz', '--label', 'x', '--kind', 'pty', '--bogus']) && !refuses(['zz', '--label', 'x', '--kind', 'pty']) && G.descriptorOf(G.parseArgs(['zz', '--label', 'x', '--kind', 'pty'])).kind === 'terminal', 'the arguments are judged: a slug id, a label, a data/bin wrapper for a chat / acp harness, no unknown flag; pty = a terminal descriptor');
  const sk = G.skeletons(o);
  ok(/module\.exports = \{/.test(sk['src/harnesses/zz-gen.js']) && ['id', 'label', 'kind', 'caps', 'Adapter', 'adapterConfig', 'wrapper'].every((k) => new RegExp(`^  ${k}:`, 'm').test(sk['src/harnesses/zz-gen.js'])) && (sk['src/harnesses/zz-gen.js'].match(/TODO/g) || []).length >= 8 && /test-harness-contract/.test(sk['src/harnesses/zz-gen.js']), 'the descriptor skeleton declares the REQUIRED keys and names the contract at every TODO');
}
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}`);
process.exit(fail ? 1 : 0);
