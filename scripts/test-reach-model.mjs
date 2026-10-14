#!/usr/bin/env node
// STATIC REACH (q-036 P0, lane affected-static-reach, 2026-10-14): scripts/reach-model.mjs (PURE) and its wiring in
// scripts/ci.mjs (reachContext + affectedSuites), over the REAL tree and over throwaway repositories.
//
// §1 the token derivation over three real suites · §2 the attribution over real files (a client window module, a
// routes module, a hub, a hub's import, a page asset, the composition root, a spawned program, an agent CLI, a shared
// table) · §3 the meet rule and the verdict (api: one segment meets its children, cls: only cls:, a client module never
// reaches a suite with no browser) · §4 the hubs (DERIVED by count; RED control: without the hub rule a utils.js
// change selects fewer suites) · §5 the rails over a stub repository — a change inside a suite's reach selects it
// (CONTROL: the same suite with its reach emptied is dropped), a suite that loads the file keeps it, server.js and a
// spawned program keep every boot, a dependency bump selects everything, a derived-empty reach runs on everything, the
// sentinel is always in (CONTROL: without always it is not), the declaration census (CONTROL: a declaration missing a
// derived token is RED), --why says ✓ / ✗ / ◇ · §6 the sentinel's census — the tree's GET routes against
// scripts/fixtures/boot-sentinel-gets.json (CONTROL: a new GET is RED, a dead row is RED) and its two judges.
// `node scripts/test-reach-model.mjs --table` also prints the three train ranges the design measured, old → new.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as RM from './reach-model.mjs';
import { SUITES, affectedSuites, reachContext } from './ci.mjs';
import { gitEnvFrom } from './git-env.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// the §47 passport word, built from parts: a stub suite that drives a page says it, and THE TIER RULE reads this file too
const PASSPORT = ['ONBOARDED', 'SOURCE'].join('_');
const GIT_ENV = gitEnvFrom(process.env);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n      ' + String(e).slice(0, 600) : '')); } };
const tmpDirs = [];
const mktmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `vs-reach-${tag}-`)); tmpDirs.push(d); return d; };
const git = (root, args) => { const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf-8', env: GIT_ENV }); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').trim()}`); return (r.stdout || '').trim(); };
const sel = (a) => a.selected.map((s) => s.name).sort().join(',');
try {
const heavy = SUITES.filter((s) => s.tier === 'heavy');
const rc = reachContext({ suites: heavy, root: REPO });
const byName = (n) => heavy.find((s) => s.name === n);

// ── §1 THE TOKEN DERIVATION (three real suites) ─────────────────────────
console.log('§1 the token derivation (three real suites, their closures)');
{
  const want = {
    'test-browser-profiles-ui': ['win:browser-profiles', 'api:browser/profiles'],
    'test-inbox-window-ui': ['win:inbox', 'api:user-todos', 'bin:vibespace-ask'],
    'test-design-window': ['win:design', 'api:design', 'bin:vibespace-design'],
  };
  for (const [n, toks] of Object.entries(want)) {
    const s = byName(n);
    if (!s) { ok(false, `${n} is a heavy row (the derivation's real sample)`); continue; }
    const f = rc.suite(s);
    ok(f.boots && f.browser && toks.every((k) => f.derived.has(k)) && !f.reach.all, `${n}: boots, drives a browser, derives ${toks.join(' ')} (${RM.reachCore(f.derived).length} core tokens)`, RM.reachCore(f.derived).join(' '));
  }
  ok(rc.probe.has('api:home') && [...rc.probe].every((k) => k.startsWith('api:')), `the PROBE routes are derived (≥ ${RM.PROBE_MIN} booting suites spell them) and never a window or a module: ${[...rc.probe].join(' ')}`);
  ok(!heavy.some((s) => rc.suite(s).derived.has('api:home')), 'a probe route is no suite\'s reach (every boot waits on /api/home — the sentinel smokes it)');
  ok(['scripts/scratch.mjs', 'scripts/git-env.mjs'].every((f) => rc.harness.has(f)) && !rc.harness.has('scripts/reach-model.mjs'), `the harness is derived (≥ ${RM.HARNESS_MIN} heavy suites load it): ${[...rc.harness].join(' ')}`);
  // the window-type literal rule: a transcript record's `type: 'system'` names no window; createWindow / a hyphenated type does
  const ctx = RM.tokenContext({ types: new Map([['system', {}], ['browser-live', {}]]), actionType: new Map([['openSystem', 'system']]) });
  const t1 = RM.suiteTokens("{ type: 'system', subtype: 'init' }", ctx), t2 = RM.suiteTokens("wm.createWindow({ id, type: 'system' }); w.type === 'browser-live'; app.openSystem();", ctx);
  ok(!t1.has('win:system') && t2.has('win:system') && t2.has('win:browser-live'), 'a record\'s type: \'system\' names no window; createWindow({ type }), a hyphenated type and an open action do');
  const t3 = RM.suiteTokens("fetch(`${base}/api/channels/send`); fetch('/api/sessions/' + id); q('.chan-row'); x.then(); 'a.json'; '.json'", ctx);
  ok(t3.has('api:channels/send') && t3.has('api:sessions') && t3.has('cls:chan-row') && !t3.has('cls:then') && !t3.has('cls:json'), 'api: two segments from a template, one when the second is dynamic; a selector\'s class, never a member call or a file extension');
}

// ── §2 THE ATTRIBUTION (real files) ─────────────────────────────────────
console.log('\n§2 the attribution (real files)');
{
  const a = (f) => rc.attr(f);
  const cp = a('src/lib/channels-panel.js');
  ok(!cp.all && cp.client && cp.tokens.has('win:channels') && cp.tokens.has('api:channels') && cp.tokens.has('mod:src/lib/channels-panel.js'), `src/lib/channels-panel.js: a client module — the window it registers, the routes it fetches, its own path (${cp.why})`);
  const br = a('src/routes/browser.js');
  ok(!br.all && !br.client && br.tokens.has('api:browser/profiles') && br.tokens.has('mod:src/routes/browser.js'), `src/routes/browser.js: the routes it mounts (${br.why})`);
  const cf = a('src/channel-focus.js');
  ok(cf.tokens.has('win:channels') && cf.tokens.has('mod:src/lib/channels-panel.js'), 'src/channel-focus.js (shared PURE): ONE HOP — its importers add their path and the window they register');
  ok(!a('src/lib/sidebar-rail.js').tokens.has('mod:src/lib/app.js') && rc.roots.has('src/lib/app.js') && rc.roots.has('server.js'), `a composition root adds nothing as an importer (roots: ${[...rc.roots].join(' ')})`);
  ok(a('src/lib/utils.js').all === 'ALL-BROWSER' && /hub/.test(a('src/lib/utils.js').why), `src/lib/utils.js: a hub ⇒ every browser suite (${a('src/lib/utils.js').why})`);
  ok(a('src/lib/i18n-zh.js').all === 'ALL-BROWSER' && /imported by the hub/.test(a('src/lib/i18n-zh.js').why), 'src/lib/i18n-zh.js: imported by a hub ⇒ on every page');
  ok(a('public/style.css').all === 'ALL-BROWSER' && a('src/lib/settings-schema.js').all === 'ALL-BROWSER', 'a page asset and a shared table (affected-model MODELED) ⇒ every browser suite');
  ok(a('server.js').all === 'ALL' && /kept/.test(a('server.js').why), 'server.js keeps every boot (KEPT_BOOT)');
  ok(a('data/bin/chat-wrapper.js').all === 'ALL' && /spawns/.test(a('data/bin/chat-wrapper.js').why), `data/bin/chat-wrapper.js: a program the product spawns keeps every boot (${rc.spawned.size} spawned)`);
  const clis = rc.bins.filter((b) => /^vibespace-/.test(b) && !rc.spawned.has(b));
  const cli = clis.includes('vibespace-msg') ? 'vibespace-msg' : clis[0];
  const msg = cli ? a('data/bin/' + cli) : { all: 'none', tokens: new Set() };
  ok(clis.length >= 3 && !msg.all && msg.tokens.has('bin:' + cli) && [...msg.tokens].some((k) => k.startsWith('api:')), `data/bin/${cli}: an agent CLI no server module spawns — the suites that run it, the routes it calls (${clis.length} such CLIs: ${clis.join(' ')})`);
  ok(RM.spawnedPrograms(['vs-cli'], [['src/x.js', "// data/bin/vs-cli is the agent's CLI\nconst a = 1;"]]).size === 0 && RM.spawnedPrograms(['vs-cli'], [['src/x.js', "spawn(path.join(BIN, 'vs-cli'));"]]).size === 1, 'a comment naming a data/bin program spawns nothing; a spawn of it does');
  ok(!a('src/lib/channels-panel.js').tokens.has('cls:active') && rc.sharedCls.has('cls:active'), `a class ≥ ${RM.SHARED_CLS_MIN} client modules draw is no key (${rc.sharedCls.size} shared classes: active, hidden, btn-create …)`);
}

// ── §3 THE MEET RULE AND THE VERDICT ────────────────────────────────────
console.log('\n§3 the meet rule and the verdict (PURE)');
{
  ok(RM.tokensMeet('api:channels', 'api:channels/send') && RM.tokensMeet('api:channels/send', 'api:channels') && !RM.tokensMeet('api:channels/send', 'api:channels/rows') && !RM.tokensMeet('api:chan', 'api:channels/x'), 'api:x meets every api:x/… (both ways); two different second segments never meet; a prefix of a segment is no segment');
  ok(!RM.tokensMeet('cls:channels', 'win:channels') && RM.meet(new Set(['cls:x']), new Set(['cls:x'])).length === 1, 'cls: meets only cls:');
  const suite = (reach, browser = true) => ({ reach: RM.effectiveReach(undefined, new Set(reach)), browser });
  const attr = (tokens, extra = {}) => ({ all: null, tokens: new Set(tokens), why: '', ...extra });
  ok(RM.reachVerdict(suite(['win:channels']), 'f', attr(['win:channels'])).hit, 'a suite whose reach meets the attribution is selected');
  ok(!RM.reachVerdict(suite(['win:doc']), 'f', attr(['win:channels'])).hit, 'CONTROL: a reach outside the attribution is not (a doc-window suite, a channels change)');
  ok(RM.reachVerdict(suite([]), 'f', attr(['win:channels'])).hit && /derived empty/.test(RM.reachVerdict(suite([]), 'f', attr(['win:x'])).why), 'a derived-EMPTY undeclared reach runs on everything (\'all\')');
  ok(!RM.reachVerdict(suite(['win:channels'], false), 'f', attr(['win:channels'], { client: true })).hit && RM.reachVerdict(suite(['api:channels'], false), 'f', attr(['api:channels'])).hit, 'a client module never reaches a suite with no browser; a server module does');
  ok(RM.reachVerdict(suite(['win:doc'], true), 'f', { all: 'ALL-BROWSER', tokens: new Set(), why: 'hub' }).hit && !RM.reachVerdict(suite(['win:doc'], false), 'f', { all: 'ALL-BROWSER', tokens: new Set(), why: 'hub' }).hit && RM.reachVerdict(suite(['win:doc'], false), 'f', { all: 'ALL', tokens: new Set(), why: 'kept' }).hit,
    'ALL-BROWSER = every browser suite and no other; ALL = every boot');
  ok(RM.effectiveReach('all', new Set(['win:x'])).all && RM.effectiveReach(['win:a'], new Set(['win:b'])).tokens.has('win:b'), "a declared 'all' is all; a declared list is unioned with the derivation (never blind)");
  ok(RM.declarationFindings(['win:a'], new Set(['win:a', 'cls:z'])).length === 0 && RM.declarationFindings(['win:a'], new Set(['win:b'])).length === 1, 'the declaration census: ⊇ the derived non-class tokens holds; CONTROL: a derived token the row misses is RED');
  ok(RM.declarationFindings([], new Set(), { reads: ['x/'] }).length === 0 && RM.declarationFindings([], new Set()).length === 1 && RM.declarationFindings(['nope'], new Set()).length === 1 && RM.declarationFindings(['api:channels'], new Set(['api:channels/send'])).length === 0,
    'reach: [] only beside reads:; a malformed token is named; a one-segment api: covers its children');
}

// ── §4 THE HUBS ─────────────────────────────────────────────────────────
console.log('\n§4 the hubs (derived by count)');
{
  const importers = new Map(), imports = new Map();
  const edge = (from, to) => { if (!importers.has(to)) importers.set(to, new Set()); importers.get(to).add(from); if (!imports.has(from)) imports.set(from, new Set()); imports.get(from).add(to); };
  for (let i = 0; i < 20; i++) edge(`src/lib/m${i}.js`, 'src/lib/hub.js');
  for (let i = 0; i < 19; i++) edge(`src/lib/m${i}.js`, 'src/lib/almost.js');
  edge('src/lib/hub.js', 'src/lib/table.js'); edge('src/lib/table.js', 'src/deep.js');
  const h = RM.hubModules(importers, imports);
  ok(h.has('src/lib/hub.js') && !h.has('src/lib/almost.js') && h.has('src/lib/table.js') && h.has('src/deep.js'), `${RM.HUB_MIN} src/lib importers make a hub, ${RM.HUB_MIN - 1} do not; what a hub imports (transitively) is on every page too`);
  const real = [...rc.hubs].filter(([, w]) => /importers/.test(w)).map(([f]) => f.replace('src/lib/', '')).sort();
  ok(['i18n.js', 'utils.js', 'icons.js', 'window-types.js'].every((f) => real.includes(f)), `the real hubs (by count): ${real.join(' ')}`);
  // RED CONTROL: without the hub rule (min = ∞) a utils.js change selects FEWER suites — the rule is what reaches every page
  const S = heavy;
  const withHub = affectedSuites({ range: 'x..y', suites: S, root: REPO, changed: ['src/lib/utils.js'] }).selected.length;
  const noHub = RM.attribution('src/lib/utils.js', { textOf: (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf-8'); } catch { return ''; } }, importersOf: () => [], hubs: new Map(), types: rc.registry.types, roots: rc.roots, sharedCls: rc.sharedCls });
  const booting = S.filter((s) => !s.always && rc.suite(s).boots && !rc.own(s, 'src/lib/utils.js'));
  const hitNoHub = booting.filter((s) => RM.reachVerdict(rc.suite(s), 'src/lib/utils.js', noHub).hit).length;
  const hitHub = booting.filter((s) => rc.verdict(s, 'src/lib/utils.js').hit).length;
  ok(hitNoHub < hitHub && withHub >= hitHub, `CONTROL: without the hub rule src/lib/utils.js reaches ${hitNoHub} booting suites, with it ${hitHub} (every browser suite) — removing the rule is RED`);
}

// ── §5 THE RAILS (a stub repository, the real wiring) ──────────────────
console.log('\n§5 the rails (ci.mjs affectedSuites over a stub repository)');
{
  const repo = mktmp('repo');
  const w = (rel, body) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), body); };
  w('package.json', '{ "scripts": { "build": "esbuild src/client.js --bundle --outfile=public/bundle.js" } }\n');
  w('server.js', "require('./src/routes/foo.js');\n");
  w('src/client.js', "import './lib/app.js';\n");
  w('src/lib/app.js', "import './foo-window.js';\nimport './doc-window.js';\n");
  w('src/lib/window-types.js', 'export function registerWindowType() {}\n');
  w('src/lib/foo-window.js', "registerWindowType({ type: 'foo', action: 'openFoo', replay: (a) => a.openFoo() });\nfetch('/api/foo/list');\n");
  w('src/lib/doc-window.js', "registerWindowType({ type: 'doc', action: 'openDoc', replay: (a) => a.openDoc() });\n");
  w('src/routes/foo.js', "router.get('/api/foo/list', (q, r) => r.json([]));\n");
  w('src/foo-model.js', 'module.exports = {};\n');
  w('src/x1.js', "module.exports = require('./x2.js');\n"); w('src/x2.js', "module.exports = require('./foo-model.js');\n");
  w('data/bin/vs-wrapper.js', '// a wrapper\n');
  w('src/spawner.js', "spawn(path.join(BIN, 'vs-wrapper.js'));\n");
  w('scripts/test-foo-ui.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\napp.openFoo();\n`);
  w('scripts/test-foo-emptied.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\napp.openDoc();\n`);
  w('scripts/test-doc-ui.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\napp.openDoc();\n`);
  w('scripts/test-blank.mjs', `spawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\nclickAt(10, 10);\n`);
  w('scripts/test-loader.mjs', `import m from '../src/x1.js';\nspawn(process.execPath, ['server.js']);\naddScript(${PASSPORT});\napp.openDoc();\n`);
  w('scripts/test-srv.mjs', "spawn(process.execPath, ['server.js']);\nawait fetch('/api/foo/list');\n");
  w('scripts/test-boot-sentinel.mjs', "spawn(process.execPath, ['server.js']);\n");
  w('scripts/test-doc-only.mjs', "console.log('docs');\n");
  const S = ['test-foo-ui', 'test-foo-emptied', 'test-doc-ui', 'test-blank', 'test-loader', 'test-srv', 'test-doc-only'].map((name) => ({ name })).concat([{ name: RM.SENTINEL, always: true }]);
  const rc0 = (ctx, name, f) => ctx.verdict(S.find((s) => s.name === name), f).hit;
  const run = (changed, suites = S, extra = {}) => affectedSuites({ range: 'x..y', suites, root: repo, changed, ...extra });
  const a1 = run(['src/lib/foo-window.js']);
  ok(a1.selected.some((s) => s.name === 'test-foo-ui') && /reach win:foo ∩ src\/lib\/foo-window\.js/.test(a1.why.get('test-foo-ui')), `a change inside a suite's reach selects it (${a1.why.get('test-foo-ui')})`);
  ok(!a1.selected.some((s) => s.name === 'test-foo-emptied') && a1.dropped.has('test-foo-emptied'), 'CONTROL: the same suite with its reach emptied of win:foo (it opens doc) is DROPPED — a reach that misses the change is RED for it');
  ok(!a1.selected.some((s) => s.name === 'test-doc-ui') && a1.selected.some((s) => s.name === 'test-blank') && /derived empty/.test(a1.why.get('test-blank')), 'a doc suite is outside a foo change; a suite that derives nothing runs on it (\'all\' until declared)');
  ok(!a1.selected.some((s) => s.name === 'test-srv') && /drives no browser/.test(a1.dropped.get('test-srv') || ''), 'a client module never reaches the server-only suite, even through a route it shares');
  ok(a1.selected.some((s) => s.name === RM.SENTINEL) && /boot sentinel/.test(a1.why.get(RM.SENTINEL)), 'the sentinel is always in');
  ok(!run(['docs/x.md'], S.map((s) => (s.name === RM.SENTINEL ? { name: s.name } : s))).selected.length && sel(run(['docs/x.md'])) === RM.SENTINEL, 'CONTROL: without always: a change nothing reads selects no sentinel — always is what carries it');
  const a2 = run(['src/routes/foo.js']);
  ok(a2.selected.some((s) => s.name === 'test-srv') && !a2.selected.some((s) => s.name === 'test-doc-ui') && /reach api:foo\/list ∩ src\/routes\/foo\.js/.test(a2.why.get('test-srv')), 'a routes module reaches the suites that call its route — a server-only one too — and not a doc suite');
  const a3 = run(['src/foo-model.js']);
  const rcs = reachContext({ suites: S, root: repo });
  ok(a3.selected.some((s) => s.name === 'test-loader') && /^loads src\/foo-model\.js/.test(a3.why.get('test-loader')) && !rc0(rcs, 'test-loader', 'src/foo-model.js'),
    'THE RAIL: a suite that loads the file (two imports down) keeps it — the old rule\'s precise reason — though its reach does not meet the file\'s attribution');
  ok(sel(run(['server.js'])) === S.filter((s) => s.name !== 'test-doc-only').map((s) => s.name).sort().join(','), 'server.js keeps every boot (and the sentinel)');
  ok(run(['data/bin/vs-wrapper.js']).selected.length === S.length - 1, 'a program the product spawns keeps every boot');
  ok(run(['package.json']).selected.length === S.length, 'a dependency bump is a global input: everything');
  ok(sel(run(['docs/x.md'])) === RM.SENTINEL, 'a file nothing reads selects only the always row');
  const old = run(['src/lib/foo-window.js'], S, { reach: false });
  ok(old.selected.length > a1.selected.length && a1.selected.every((s) => old.selected.includes(s)), `the reach only narrows: the old rule's ${old.selected.length} ⊇ the reach's ${a1.selected.length}`);
  const why = run(['src/lib/foo-window.js'], S, { why: true }).summary;
  ok(/✓ test-foo-ui ← .*reach win:foo/.test(why) && /✗ test-doc-ui — reach \{win:doc\} ∌ src\/lib\/foo-window\.js/.test(why) && /◇ src\/lib\/foo-window\.js — reach: \{.*win:foo.*\} .* ⇒ \d+ of \d+ booting suites/.test(why) && /✓ test-boot-sentinel ← always \(the boot sentinel/.test(why),
    '--why: ✓ per selected suite and why, ✗ per dropped suite and the reach it lacks, one ◇ line per file');
  ok(!/✓|✗/.test(run(['src/lib/foo-window.js']).summary) && /static reach: \d+ booting suite/.test(run(['src/lib/foo-window.js']).summary), 'without --why: the old · lines and one line counting the drop');
  // the census over a declaration: declared ⊇ derived, else RED
  const D = [{ name: 'test-foo-ui', reach: ['win:doc'] }];
  const rcd = reachContext({ suites: D, root: repo });
  ok(RM.declarationFindings(D[0].reach, rcd.suite(D[0]).derived).some((p) => /win:foo is not declared/.test(p)), 'CONTROL: a declaration that misses a derived token (win:foo) is RED in the census');
}

// ── §6 THE SENTINEL'S CENSUS AND JUDGES ─────────────────────────────────
console.log('\n§6 the sentinel\'s census (the tree\'s GET routes) and its judges');
{
  const table = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/boot-sentinel-gets.json'), 'utf-8'));
  const files = git(REPO, ['ls-files', '--', 'src', 'server.js']).split('\n').filter((f) => /\.(?:m?js|cjs)$/.test(f) && !f.startsWith('src/lib/'));
  const texts = files.map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf-8')]);
  const routes = RM.getRoutes(texts);
  const c = RM.getCensus(routes, table);
  ok(routes.length >= 200 && !c.unclassified.length && !c.dead.length && !c.both.length && !c.reasonless.length, `every GET route of the tree is in exactly one list (${routes.length}: ${c.smoke.length} smoke, ${c.skip.length} skip) — no dead row, no reason-less skip`, [...c.unclassified, ...c.dead.map((p) => 'DEAD ' + p)].join(' · '));
  const plus = RM.getCensus(RM.getRoutes([...texts, ['src/routes/new.js', "router.get('/api/sentinel-new', (q, r) => r.json({}));"]]), table);
  ok(plus.unclassified.length === 1 && /\/api\/sentinel-new \(src\/routes\/new\.js\)/.test(plus.unclassified[0]), 'CONTROL: a NEW GET in neither list is RED (named with its file)');
  ok(RM.getCensus(routes, { ...table, skip: { ...table.skip, '/api/gone': 'x' } }).dead.includes('/api/gone') && RM.getCensus(routes, { ...table, query: { ...table.query, '/api/gone': 'a=1' } }).dead.includes('/api/gone'), 'CONTROL: a row no route answers (a skip, a query) is DEAD');
  ok(RM.getCensus(routes, { ...table, skip: { [table.smoke[0]]: 'x' } }).both.length === 1 && RM.getCensus(routes, { ...table, skip: { '/api/x': ' ' } }).reasonless.length === 1, 'CONTROL: a route in both lists, a skip without a reason');
  ok(RM.fillRoute('/api/a/:id/b/:which', { id: 'x y' }) === '/api/a/x%20y/b/sentinel-none' && RM.fillRoute('/api/file/serve/*') === '/api/file/serve/sentinel-none', 'a :param is filled by name, else the default; a trailing * too');
  const v = (o) => RM.getVerdict({ budgetMs: 2000, ...o });
  ok(v({ status: 200, type: 'application/json', body: '{}', ms: 5 }).ok && v({ status: 404, type: 'text/html', body: '<p>', ms: 5 }).ok, 'a 2xx JSON and a 4xx page pass');
  ok(!v({ status: 500, body: '' }).ok && !v({ status: 503, body: '' }).ok && v({ status: 503, body: '', allow: [503] }).ok, 'CONTROL: a 5xx is RED (the lost-export class) unless the table names it the route\'s deliberate answer');
  ok(!v({ status: 200, type: 'application/json; charset=utf-8', body: '{nope' }).ok && !v({ status: 200, body: '{}', ms: 2500 }).ok, 'CONTROL: a JSON route whose body does not parse, a route slower than the budget');
  const wv = RM.windowVerdict;
  ok(wv({ type: 'doc', types: ['doc'] }).ok && !wv({ type: 'doc', types: ['editor'] }).ok && !wv({ type: 'doc', types: ['doc'], events: [{ kind: 'console.error', text: 'x' }] }).ok && !wv({ type: 'doc', types: ['doc'], events: [{ kind: 'uncaught', text: 'y' }] }).ok && !wv({ type: 'doc', threw: 'z' }).ok,
    'the window judge: the type must appear; CONTROL: another type, a console error, an uncaught exception, a throwing replay are RED');
  const reg = RM.windowRegistry(git(REPO, ['ls-files', '--', 'src/lib']).split('\n').filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(REPO, f), 'utf-8')]));
  const skip = (table.windows && table.windows.skip) || {};
  ok(reg.types.size >= 30 && [...reg.types].every(([t, r]) => r.actions.length || skip[t]) && Object.keys(skip).every((t) => reg.types.has(t)), `every registered window type has an open action or a windows.skip row (${reg.types.size} types, ${Object.keys(skip).length} skipped)`);
  const s = SUITES.filter((x) => x.name === RM.SENTINEL);
  ok(s.length === 1 && s[0].tier === 'heavy' && s[0].always === true && fs.existsSync(path.join(REPO, 'scripts', RM.SENTINEL + '.mjs')), 'the sentinel is ONE heavy row, always: true, and its file exists');
}

// ── --table: the three train ranges the design measured, old → new ─────
if (process.argv.includes('--table')) {
  console.log('\n--table: the three train ranges (pre-bump; package.json / package-lock.json / src/agentd/version.js removed)');
  const BUMP = ['package.json', 'package-lock.json', 'src/agentd/version.js'];
  for (const [range, tag] of [['79743b74b..a6e60f7a7', '.265'], ['a6e60f7a7..2dd2f322a', '.266'], ['2dd2f322a..d5f352538', '.267']]) {
    const [a, b] = range.split('..');
    const has = (x) => spawnSync('git', ['-C', REPO, 'cat-file', '-e', `${x}^{commit}`], { env: GIT_ENV }).status === 0;
    if (!has(a) || !has(b)) { console.log(`  ${tag} ${range}: SKIP — a depth-1 checkout has no ${has(a) ? b : a} (test-architecture §75)`); continue; }
    const files = git(REPO, ['diff', '--name-only', a, b]).split('\n').filter((f) => f && !BUMP.includes(f));
    const env = { LANG: 'C.UTF-8' };
    const old = affectedSuites({ range, suites: heavy, root: REPO, changed: files, env, reach: false }).selected.length;
    const now = affectedSuites({ range, suites: heavy, root: REPO, changed: files, env }).selected.length;
    const noSrv = files.includes('server.js') ? affectedSuites({ range, suites: heavy, root: REPO, changed: files.filter((f) => f !== 'server.js'), env }).selected.length : null;
    console.log(`  ${tag} ${range}: ${files.length} files — old ${old} → new ${now}${noSrv !== null ? ` (without server.js ${noSrv})` : ''}`);
  }
}
} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}
console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);
