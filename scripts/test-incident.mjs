#!/usr/bin/env node
// Incident-capture contract smoke (2.238.0): POST /api/incident writes a
// bundle with client rings + server state, append attaches a follow-up,
// /api/incidents lists, and pruning keeps the newest 30.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3993, wt = '/tmp/vs-incident-smoke';
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill('SIGKILL'); } catch {}; try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {} });
for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const post = async (url, body) => (await fetch(`http://127.0.0.1:${PORT}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const r = await post('/api/incident', { note: 'test note 现场', version: '0.0.0', rings: { action: [{ t: 1, k: 'ptr', el: 'div#x' }], ws: [], console: [{ t: 1, l: 'error', m: 'boom' }] }, snapshot: { windows: [], sessions: [] } });
check('capture returns an inc- id', /^inc-[a-z0-9-]+$/.test(r.id || ''), JSON.stringify(r));
const bundle = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'incidents', r.id, 'bundle.json'), 'utf8'));
check('bundle holds note + client rings', bundle.note === 'test note 现场' && bundle.client.rings.action[0].el === 'div#x');
check('bundle holds server state (sessions + console ring + uptime)', Array.isArray(bundle.server.sessions) && Array.isArray(bundle.server.console) && bundle.server.uptimeS >= 0);
const a = await post(`/api/incident/${r.id}/append`, { rings: { action: [] }, snapshot: {} });
check('follow-up append ok', a.ok === true && fs.existsSync(path.join(wt, 'data', 'incidents', r.id, 'followup.json')));
const bad = await post('/api/incident/inc-../../etc/append', {});
check('append rejects a traversal id', bad.error != null);
// prune: fabricate 35 old incidents → capture → ≤30 remain
for (let i = 0; i < 35; i++) {
  const d = path.join(wt, 'data', 'incidents', `inc-0aaa${String(i).padStart(2, '0')}-test`);
  fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'bundle.json'), '{"id":"x","at":"","note":""}');
}
await post('/api/incident', { note: 'prune trigger', rings: {}, snapshot: {} });
const left = fs.readdirSync(path.join(wt, 'data', 'incidents')).filter((d) => d.startsWith('inc-'));
check(`prune keeps ≤30 (${left.length})`, left.length <= 30);
const list = await (await fetch(`http://127.0.0.1:${PORT}/api/incidents`)).json();
check('list returns newest incidents with notes', Array.isArray(list.incidents) && list.incidents.length > 0 && 'note' in list.incidents[0]);
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
