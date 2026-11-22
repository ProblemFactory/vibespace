#!/usr/bin/env node
// THE FIRST ASK'S CHILDREN RUN OFF THE LOOP (B-360d part 1, 主开发 r2303; lane bl-loop-a). GET /api/fonts (src/routes/files.js)
// ran fc-list and GET /api/version (src/server/ops-routes.js) ran git SYNCHRONOUSLY at their first ask after a hub start: each
// held the hub's loop for the child's whole run (25–54 ms and 21–39 ms in the page's load on a stand-in). Both run through the
// hub's starter now (src/server/child-starter.js), bounded 3 s, the answer kept as before. Each route is the REAL module mounted
// in-process on an express app, with the real starter, and a PLACED SLOW CHILD first on PATH (a stand-in fc-list / git that
// sleeps SLOW_S and counts its runs); a 5 ms timer chain reads the loop's longest step while the asks run, judged against TODAY'S
// CALL measured in the same run (a control, never a literal bound — scripts/wall-clock-census.mjs):
//  ① GET /api/fonts: the loop's longest step under half of today's call's while the lister runs; the list as before (emoji / sign dropped, sorted); two
//     asks at once and one after: ONE run (kept). A lister that fails answers [] and the next ask runs it again (not kept).
//     RED: today's call (the release's execFileSync, in a copy of the module) holds the loop for the child's whole run
//  ② GET /api/version: the same; the commit read; ONE run for two asks at once and one after. git failing: no commit, kept (as
//     before: no second run); the starter giving NO ANSWER: no commit, NOT kept (the next ask runs git). RED: today's call
// Run: node scripts/test-first-ask-children.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored, endScratchAtExit } from './scratch.mjs';   // §113: the first import after node's own

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string — the arguments are swapped'); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name + (extra !== undefined ? '\n      ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TMP = scratch('first-ask-children'); fs.mkdirSync(TMP, { recursive: true }); endScratchAtExit(TMP);
const BIN = path.join(TMP, 'bin'), ROOT = path.join(TMP, 'root'), FAIL = path.join(TMP, 'fail');
fs.mkdirSync(BIN, { recursive: true }); fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify({ name: 'vibespace', version: '1.2.3' }));
const SLOW_S = 0.6, HELD_MS = 500;   // the child sleeps 600 ms; RED: today's call holds the loop in ONE step of 500 ms or more (a lower bound)
// the placed children: each run appended to its count file; FAIL present ⇒ exit 1 at once
const placed = (name, out) => { const f = path.join(BIN, name); fs.writeFileSync(f, `#!/bin/sh\necho run >> '${path.join(TMP, name + '.runs')}'\nif [ -e '${FAIL}' ]; then exit 1; fi\nsleep ${SLOW_S}\nprintf '%s' '${out}'\n`); fs.chmodSync(f, 0o755); };
placed('fc-list', 'Fira Code\nDejaVu Sans Mono,DejaVu Sans Mono Book\nNoto Color Emoji\nSymbols Nerd Font Sign\n');
placed('git', 'abc1234\n');
const runsOf = (name) => { try { return fs.readFileSync(path.join(TMP, name + '.runs'), 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
process.env.PATH = `${BIN}:${process.env.PATH || ''}`;   // before the starter is born (its env carries PATH); each route also hands PATH at its call
process.env.VIBESPACE_CHANGELOG_FIXTURE_DIR = ROOT;       // the version's «latest» is read from here — a gate never asks the network

/** the loop's longest step while fn runs (a 5 ms timer chain; one more beat after, so a step that ended the asks is read too) */
async function loopDuring(fn) {
  let last = performance.now(), max = 0;
  const t = setInterval(() => { const n = performance.now(); max = Math.max(max, n - last); last = n; }, 5);
  try { const v = await fn(); await sleep(30); return { v, step: Math.round(max) }; } finally { clearInterval(t); }
}
/** the module at `rel` compiled IN PLACE (its own requires resolve as the real file's), from `src` — a fresh copy: fresh state */
function compiledAs(rel, src, tag) {
  const Mod = require('module'), file = path.join(REPO, rel), fn = file.replace(/\.js$/, `.${tag}.js`), m = new Mod(fn, null);
  m.filename = fn; m.paths = Mod._nodeModulePaths(path.dirname(file)); m._compile(src, fn);
  return m.exports;
}
const express = require('express');
const servers = [];
async function serve(mount) {
  const app = express(); mount(app);
  const server = http.createServer(app); servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(base + '/no-such-route').then((r) => r.text()).catch(() => { });   // warm: the client's first fetch (its lazy load) is never in a measured step
  return (p) => fetch(base + p).then((r) => r.json());
}
const { childStarter, setChildStarter } = require(path.join(REPO, 'src/server/child-starter.js'));

try {
  const filesSrc = fs.readFileSync(path.join(REPO, 'src/routes/files.js'), 'utf8');
  const opsSrc = fs.readFileSync(path.join(REPO, 'src/server/ops-routes.js'), 'utf8');
  // TODAY'S CALLS (the release's text), each put back in a copy
  const OLD_FONTS = `let _cachedMonoFonts = null;
router.get('/api/fonts', (req, res) => {
  if (_cachedMonoFonts) return res.json({ fonts: _cachedMonoFonts });
  try {
    const out = execFileSync('fc-list', [':spacing=mono', 'family'], { encoding: 'utf-8', timeout: 3000 });
    const fonts = [...new Set(
      out.trim().split('\\n')
        .map(line => line.split(',')[0].trim())
        .filter(f => f && !/emoji|sign/i.test(f))
    )].sort((a, b) => a.localeCompare(b));
    _cachedMonoFonts = fonts;
    res.json({ fonts });
  } catch {
    res.json({ fonts: [] });
  }
});
`;
  // the release's version read, built from its pieces (a suite's own text never reads as a git call: test-architecture §75)
  const OLD_VERSION = ['    try { versionInfo.commit = execFileSync(', "'git', ['-C', rootDir, ", "'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8', timeout: 3000 }).trim(); }\n", "    catch { versionInfo.commit = ''; }\n"].join('');
  const filesToday = anchored(filesSrc, /let _cachedMonoFonts = null, _monoFontsAsk = null;\nrouter\.get\('\/api\/fonts'[\s\S]*?\n\}\);\n/, OLD_FONTS, 'fonts-today');
  const opsToday = anchored(anchored(opsSrc, "const { spawn } = require('child_process');\n", "const { execFileSync, spawn } = require('child_process');\n", 'ops-import-today'),
    /    commitAsk = commitAsk \|\| childStarter\(\)\.run\([^\n]*\n[\s\S]*?\n    await commitAsk;\n/, OLD_VERSION, 'version-today');

  console.log('① GET /api/fonts — the lister off the loop, its list kept');
  {
    const ask = await serve((app) => app.use(require(path.join(REPO, 'src/routes/files.js'))));
    const r = await loopDuring(() => Promise.all([ask('/api/fonts'), ask('/api/fonts')]));
    const later = await ask('/api/fonts');
    const want = ['DejaVu Sans Mono', 'Fira Code'];
    ok(JSON.stringify(r.v[0].fonts) === JSON.stringify(want) && JSON.stringify(r.v[1].fonts) === JSON.stringify(want) && JSON.stringify(later.fonts) === JSON.stringify(want), `the list as before: ${JSON.stringify(r.v[0].fonts)} (emoji and sign dropped, sorted), to both asks and the later one`, { r: r.v, later });
    ok(runsOf('fc-list') === 1, `two asks at once and one after: ${runsOf('fc-list')} run of the lister (shared while it runs, KEPT after)`);
    fs.writeFileSync(FAIL, '');
    const fresh = await serve((app) => app.use(compiledAs('src/routes/files.js', filesSrc, 'fresh')));
    const a = await fresh('/api/fonts'); fs.unlinkSync(FAIL); const b = await fresh('/api/fonts');
    ok(Array.isArray(a.fonts) && a.fonts.length === 0 && JSON.stringify(b.fonts) === JSON.stringify(want) && runsOf('fc-list') === 3, `a lister that fails answers [] and is NOT kept: the next ask runs it again and lists (${runsOf('fc-list')} runs in all)`, { a, b });
    const today = await serve((app) => app.use(compiledAs('src/routes/files.js', filesToday, 'today')));
    const t = await loopDuring(() => today('/api/fonts'));
    ok(t.step >= HELD_MS && JSON.stringify(t.v.fonts) === JSON.stringify(want), `RED: today's call (execFileSync in the route) holds the loop for the child's whole run: a step of ${t.step} ms (at least ${HELD_MS})`, t);
    ok(r.step < t.step / 2, `while the placed lister runs (${SLOW_S * 1000} ms), the loop's longest step is ${r.step} ms — under half of today's call's, measured in this run (${t.step} ms)`, { r: r.step, today: t.step });
  }

  console.log('② GET /api/version — git off the loop, the commit kept');
  {
    const mountOps = (mod) => (app) => mod.create({ app, rootDir: ROOT, wss: { clients: new Set() }, WS_OPEN: 1, throwaway: () => true });
    const ask = await serve(mountOps(require(path.join(REPO, 'src/server/ops-routes.js'))));
    const r = await loopDuring(() => Promise.all([ask('/api/version'), ask('/api/version')]));
    const later = await ask('/api/version');
    ok(r.v[0].commit === 'abc1234' && r.v[1].commit === 'abc1234' && later.commit === 'abc1234' && r.v[0].version === '1.2.3', `the commit read (${r.v[0].commit}) to both asks and the later one; the version beside it`, { r: r.v, later });
    ok(runsOf('git') === 1, `two asks at once and one after: ${runsOf('git')} run of git (shared while it runs, KEPT after)`);
    fs.writeFileSync(FAIL, '');
    const failed = await serve(mountOps(compiledAs('src/server/ops-routes.js', opsSrc, 'failed')));
    const a = await failed('/api/version'); fs.unlinkSync(FAIL); const b = await failed('/api/version');
    ok(a.commit === null && b.commit === null && runsOf('git') === 2, `git failing: no commit, and KEPT as before — the next ask runs no git (${runsOf('git')} runs in all)`, { a, b });
    let asked = 0;
    setChildStarter({ run: () => { asked++; return Promise.resolve({ unknown: true, why: 'no starter' }); }, closePipe() { } });
    const mute = await serve(mountOps(compiledAs('src/server/ops-routes.js', opsSrc, 'mute')));
    const m1 = await mute('/api/version'); const m2 = await mute('/api/version');
    setChildStarter(null);
    ok(m1.commit === null && m2.commit === null && asked === 2, `the starter giving NO ANSWER: no commit, NOT kept — the next ask asks again (${asked} asks)`, { m1, m2, asked });
    const today = await serve(mountOps(compiledAs('src/server/ops-routes.js', opsToday, 'today')));
    const t = await loopDuring(() => today('/api/version'));
    ok(t.step >= HELD_MS && t.v.commit === 'abc1234', `RED: today's call (execFileSync in the route) holds the loop for the child's whole run: a step of ${t.step} ms (at least ${HELD_MS})`, t);
    ok(r.step < t.step / 2, `while the placed git runs (${SLOW_S * 1000} ms), the loop's longest step is ${r.step} ms — under half of today's call's, measured in this run (${t.step} ms)`, { r: r.step, today: t.step });
  }
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

for (const s of servers) { try { s.closeAllConnections?.(); s.close(); } catch { } }
try { childStarter().closePipe(); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
