#!/usr/bin/env node
// test-claude-update-needs-nothing-hub — THE DRILL'S HUB LEG (lane cli-update-needs-nothing, ruling R8). A real hub — this
// tree's server.js in a scratch worktree, its own data dir, a FAKE home — is started with a Claude Code it has never seen
// (the stand-in of scripts/claude-catalog-stand-in.mjs: 2.1.900, a catalog with Fable 6 and the new family Quill; a /bin/sh
// stub that answers --version and is otherwise never run for its catalog). With no release of ours, through the hub's
// own routes: the tick that already reads `claude --version` (oat-file-sync, 20 s after boot) has the hub read the binary's
// catalog → /api/available-models lists the new model in its 1M form and the new family's alias; /api/usage-stats/pricing
// prices it from the catalog and says so (`sources`); the ledger data/cli-model-catalog.json holds it; Diagnostics' Harness
// drift rows (/api/telemetry/summary?drift=1) name the new ids once; nothing catalog-derived is in pricing.json.
// The fast drill (test-claude-update-needs-nothing) holds every scene with its RED control; this leg proves the wiring.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { scratch, scratchHome, vncEnv, endRootedProcesses } from './scratch.mjs';
import { writeStandIn, neverSeen } from './claude-catalog-stand-in.mjs';
const VNC_ENV = await vncEnv();
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + e : '')); } };

const PORT = await freePort();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-cunn-hub-'));
const wt = path.join(tmpRoot, 'wt');
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const fakeHome = scratchHome('cunn-hub-home', fs);
const stub = writeStandIn(scratch('cunn-hub-claude'), { version: '2.1.900', builtAt: '2026-12-01T00:00:00Z', catalog: neverSeen(JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/claude-model-catalog-2.1.321.json'), 'utf8'))) });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stub, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
let errText = ''; srv.stderr.on('data', (d) => { errText = (errText + d).slice(-4000); });
const cleanup = () => {
  try { srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, fakeHome]) { try { endRootedProcesses(root); } catch { } } // whatever the hub started under its roots
  for (const d of [fakeHome, stub]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
const get = async (p) => { try { const r = await fetch(`http://127.0.0.1:${PORT}${p}`); return r.ok ? await r.json() : null; } catch { return null; } };
try {
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { if (await get('/api/home')) up = true; else await sleep(250); }
  ok(up, 'the scratch hub is up', errText.slice(-400));
  const t0 = Date.now();
  let models = null;
  while (Date.now() - t0 < 90e3) { const m = await get('/api/available-models'); if (m && Array.isArray(m.claude) && m.claude.some((r) => r.id === 'claude-fable-6')) { models = m.claude; break; } await sleep(1000); }
  const ids = (models || []).map((r) => r.id);
  ok(!!models, `the hub read the never-seen binary's own catalog on its existing --version tick (${Math.round((Date.now() - t0) / 1000)} s after boot)`, errText.slice(-400));
  ok(['claude-fable-6', 'claude-fable-6[1m]', 'quill', 'quill[1m]', 'claude-quill-1[1m]'].every((id) => ids.includes(id)), '/api/available-models: the new model in its 1M form, the new family and its aliases', JSON.stringify(ids));
  const fa = (models || []).find((r) => r.id === 'fable');
  ok(fa && fa.label === 'fable · Fable 6 · 1M', 'the alias row says what `fable` means on this CLI', JSON.stringify(fa));
  const pr = await get('/api/usage-stats/pricing');
  const t = pr && pr.pricing && pr.pricing.tiers, s = pr && pr.pricing && pr.pricing.sources;
  ok(t && t['fable-6'] && t['fable-6'].input === 6 && t['fable-6'].output === 30 && s['fable-6'].from === 'catalog' && s['fable-6'].cli === '2.1.900' && t['quill-1'] && t['quill-1'].input === 1, '/api/usage-stats/pricing: Fable 6 and Quill 1 priced from the catalog, the source said', JSON.stringify({ f6: t && t['fable-6'], src: s && s['fable-6'] }));
  const disk = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'usage-history', 'pricing.json'), 'utf8'));
  ok(!('fable-6' in disk.tiers) && !('quill-1' in disk.tiers), 'nothing catalog-derived is written to the hub\'s pricing.json');
  const led = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'cli-model-catalog.json'), 'utf8'));
  const cur = led.binaries[led.current];
  ok(cur && cur.state === 'read' && cur.cli === '2.1.900' && cur.models.length === 26, 'data/cli-model-catalog.json holds the read (2.1.900, 26 models)', JSON.stringify(cur && { state: cur.state, cli: cur.cli, n: cur.models.length }));
  const tel = await get('/api/telemetry/summary?days=14&drift=1');
  const drift = ((tel && tel.drift) || []).map((r) => `${r.name}: ${r.detail}`);
  ok(drift.includes('cli-unknown-model: claude-fable-6 · fable · Claude Code 2.1.900') && drift.includes('cli-unknown-model: claude-quill-1 · quill · Claude Code 2.1.900'), "Diagnostics' Harness drift rows name each new id (the maintainers hear first)", JSON.stringify(drift));
  // LAW A (acceptance r1): what the hub read is in force from the FIRST answer after a restart — a second process over the
  // same data dir, with NO claude at all (so no --version tick can ever read anything), answers from the ledger at once
  try { srv.kill('SIGKILL'); } catch { }
  await sleep(500);
  const PORT2 = await freePort();
  const srv2 = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT2), HOME: fakeHome, CLAUDE_CMD: path.join(tmpRoot, 'no-such-claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, stdio: ['ignore', 'ignore', 'pipe'] });
  process.on('exit', () => { try { srv2.kill('SIGKILL'); } catch { } });
  const get2 = async (p) => { try { const r = await fetch(`http://127.0.0.1:${PORT2}${p}`); return r.ok ? await r.json() : null; } catch { return null; } };
  const tb = Date.now(); let up2 = false;
  for (let i = 0; i < 120 && !up2; i++) { if (await get2('/api/home')) up2 = true; else await sleep(250); }
  const firstAnswerS = Math.round((Date.now() - tb) / 100) / 10;
  const m2 = await get2('/api/available-models'), p2 = await get2('/api/usage-stats/pricing');
  const ids2 = ((m2 && m2.claude) || []).map((r) => r.id);
  ok(up2 && firstAnswerS < 20 && ids2.includes('claude-fable-6') && ids2.includes('claude-quill-1[1m]'), `a RESTART with no claude at all: the first answers (${firstAnswerS} s after start, before the 20 s tick) list the ledger's models`, JSON.stringify(ids2.slice(0, 12)));
  ok(p2 && p2.pricing && p2.pricing.tiers['fable-6'] && p2.pricing.sources['fable-6'].from === 'catalog', '…and price from it (the Source column says «From Claude Code 2.1.900»)', JSON.stringify(p2 && p2.pricing && p2.pricing.sources && p2.pricing.sources['fable-6']));
  // §L (moved from the fast drill): the box's OWN installed claude, read for real — never run (informational on the mirror)
  {
    const { readBinary } = require(path.join(repo, 'src/server/cli-model-catalog.js'));
    const cands = [path.join(os.homedir(), '.local/bin/claude'), ...String(process.env.PATH || '').split(':').filter(Boolean).map((d) => path.join(d, 'claude'))];
    let real = null; for (const c of cands) { try { const r = fs.realpathSync(c); if (fs.statSync(r).isFile() && fs.statSync(r).size > 50e6) { real = r; break; } } catch { } }
    if (!real) console.log('  - SKIP no installed claude binary here (nothing to read)');
    else {
      const e = await readBinary(real, {});
      const good = e.state === 'read' && e.models.length >= 20 && e.refused.length === 0;
      if (good || !process.env.GITHUB_ACTIONS) ok(good, `the installed claude ${e.cli} (built ${String(e.builtAt).slice(0, 10)}): ${e.models.length} models read in ${e.evidence.ms} ms, nothing refused — never run`, JSON.stringify({ state: e.state, reason: e.reason }));
      else console.log('  - SKIP (informational on the mirror) the installed claude: ' + JSON.stringify(e.reason));
    }
  }
} catch (e) { fail++; console.log('  ✗ the hub leg threw: ' + ((e && e.stack) || e)); }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
