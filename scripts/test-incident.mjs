#!/usr/bin/env node
// Incident-capture contract smoke (2.238.0): POST /api/incident writes a
// bundle with client rings + server state, append attaches a follow-up,
// /api/incidents lists, and pruning keeps the newest 30.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, scratch, ONBOARDED_SOURCE } from './scratch.mjs';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = await freePort(), CDP_PORT = await freePort(), wt = scratch('incident-smoke'); // per-process (scripts/scratch.mjs)
let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? ' — ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
// NO_AUTO_UPDATE is dropped so the boot takes the path every scratch server takes
const { NO_AUTO_UPDATE: _nau, ...bootEnv } = process.env;
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...bootEnv, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let bootLog = '';
srv.stdout.on('data', (d) => { bootLog += d; }); srv.stderr.on('data', (d) => { bootLog += d; });
process.on('exit', () => { try { srv.kill('SIGKILL'); } catch {}; try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {} });
const bootStart = Date.now();
let up = false;
for (let i = 0; i < 240 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); up = true; } catch { await sleep(250); } }
if (!up) { console.error(`  ✗ the scratch server never answered /api/home in 60 s — its boot log:\n${bootLog.slice(-3000)}`); process.exit(1); }
// 2026-09-24 (the 2.369.163 heavy RED): every scratch server ran the boot
// auto-update's `git pull` — a network fetch into the SHARED .git before
// listen, 2.5-15 s — and this suite's old 10 s window fell through to
// ECONNREFUSED. A server whose root is under the OS temp dir never pulls.
check('a throwaway (temp-dir) server root skips the boot auto-update — no `git pull` into the shared .git before listen',
  /\[auto-update\] skipped: throwaway\/temp server root/.test(bootLog) && !/git pull|pull --ff-only/.test(bootLog), bootLog.split('\n').filter((l) => /auto-update/.test(l)).join(' | ') || '(no auto-update line)');
console.log(`    (scratch server up in ${Date.now() - bootStart} ms)`);

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

// ── FREEZE THE SCENE (2.239.0): the volatile facts a user's own
// troubleshooting would destroy must be copied out, asynchronously, and the
// pending marker must clear when the freeze completes.
const dir = path.join(wt, 'data', 'incidents', r.id);
// plant a session meta + a fake transcript so the freeze has something to grab
const metaDir = path.join(wt, 'data', 'session-meta');
fs.mkdirSync(metaDir, { recursive: true });
fs.writeFileSync(path.join(metaDir, 'cw-99-test.json'), JSON.stringify({ sessionId: 'sess-99-test', name: 'frozen probe' }));
// inc-mudv05ja-n5rv: session-meta carries taskRecords since 2.369.140 — a meta of a
// session with workflows is ~100 KB and the 64 KiB byte cap froze it UNPARSEABLE.
// SYNTHETIC shapes only: 40 task records of ~2.4 KB (≈100 KB) and a 3 MB one.
const taskRec = (i, pad) => ({ type: 'system', subtype: 'task_progress', task_id: `t${i}`, description: `synthetic step ${i}`, pad: 'x'.repeat(pad) });
const midMeta = { sessionId: 'sess-98-wf', name: 'workflow meta', taskRecords: Array.from({ length: 40 }, (_, i) => taskRec(i, 2400)) };
fs.writeFileSync(path.join(metaDir, 'cw-98-wf.json'), JSON.stringify(midMeta));
const bigMeta = { sessionId: 'sess-97-wf', name: 'huge workflow meta', taskRecords: Array.from({ length: 1200 }, (_, i) => taskRec(i, 2500)) };
fs.writeFileSync(path.join(metaDir, 'cw-97-wf.json'), JSON.stringify(bigMeta));
const midBytes = fs.statSync(path.join(metaDir, 'cw-98-wf.json')).size, bigBytes = fs.statSync(path.join(metaDir, 'cw-97-wf.json')).size;
const CID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const cacheDir = path.join(wt, 'data', 'remote-jsonl', 'host-test');
fs.mkdirSync(cacheDir, { recursive: true });
fs.writeFileSync(path.join(cacheDir, CID + '.jsonl'), '{"type":"user","uuid":"u1"}\n{"type":"assistant","uuid":"u2"}\n');
const r2 = await post('/api/incident', { note: 'freeze test', rings: {}, snapshot: { sessions: [{ id: CID, host: 'host-test' }] } });
const dir2 = path.join(wt, 'data', 'incidents', r2.id);
check('pending marker written immediately', fs.existsSync(path.join(dir2, 'env.json.pending')) || fs.existsSync(path.join(dir2, 'env.json')));
for (let i = 0; i < 60 && !fs.existsSync(path.join(dir2, 'env.json')); i++) await sleep(500);
check('env.json produced by the async freeze', fs.existsSync(path.join(dir2, 'env.json')));
const env = JSON.parse(fs.readFileSync(path.join(dir2, 'env.json'), 'utf8'));
check('process table captured (the kill-erases-it evidence)', Array.isArray(env.local.processes) && env.local.processes.length > 0);
check('session metas frozen as real copies', fs.existsSync(path.join(dir2, 'frozen', 'session-meta', 'cw-99-test.json'))
  && JSON.parse(fs.readFileSync(path.join(dir2, 'frozen', 'session-meta', 'cw-99-test.json'), 'utf8')).name === 'frozen probe');
{
  const readFrozen = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir2, 'frozen', 'session-meta', f), 'utf8')); } catch (e) { return { __parseError: e.message }; } };
  const mid = readFrozen('cw-98-wf.json');
  check(`a ${Math.round(midBytes / 1024)} KB meta with 40 taskRecords freezes WHOLE and parseable (inc-mudv05ja-n5rv)`, midBytes > 64 * 1024 && mid.name === 'workflow meta' && mid.taskRecords?.length === 40 && !mid._frozenTrimmed, JSON.stringify(mid).slice(0, 200));
  const big = readFrozen('cw-97-wf.json');
  const bigSize = (() => { try { return fs.statSync(path.join(dir2, 'frozen', 'session-meta', 'cw-97-wf.json')).size; } catch { return -1; } })();
  check(`a ${(bigBytes / 1048576).toFixed(1)} MB meta freezes to VALID JSON ≤ 2 MiB, trimmed as data with a marker naming the field and the original size`,
    bigBytes > 2 * 1048576 && big.name === 'huge workflow meta' && bigSize > 0 && bigSize <= 2 * 1048576
    && big._frozenTrimmed?.originalBytes === bigBytes && big._frozenTrimmed.dropped?.[0]?.field === 'taskRecords'
    && big._frozenTrimmed.dropped[0].from === 1200 && big.taskRecords.length === big._frozenTrimmed.dropped[0].kept && big.taskRecords.length > 0
    && big.taskRecords[big.taskRecords.length - 1].task_id === 't1199', JSON.stringify(big._frozenTrimmed || big).slice(0, 300));
}
const tr = env.local.transcripts?.[CID];
check('transcript fingerprinted (sha256 + size) for the referenced conversation', Array.isArray(tr) && tr.length > 0 && /^[0-9a-f]{64}$/.test(tr[0].sha256 || ''), JSON.stringify(tr));
check('transcript tail frozen to disk', fs.readdirSync(path.join(dir2, 'frozen', 'transcripts')).some((f) => f.startsWith(CID)));
check('targets include the referenced host', (env.targets?.hostIds || []).includes('host-test'));
// TERMINAL TAILS + DESKTOP SCENE (2.369.118, userW's two reports arrived with the
// wrapper sidecar only and nothing about the picture server): the last 64 KB of a
// terminal-mode session's raw PTY buffer the reporter had open is frozen; the
// server section carries the desktop singleton / apps / bridge counters.
const bufDir = path.join(wt, 'data', 'session-buffers');
fs.mkdirSync(bufDir, { recursive: true });
fs.writeFileSync(path.join(bufDir, 'sess-77-term'), Buffer.concat([Buffer.alloc(100 * 1024, 0x41), Buffer.from('\\x1b[2J LOGIN URL https://example.invalid/oauth?code=abc TAIL-MARK')]));
const rT = await post('/api/incident', { note: 'terminal tail', rings: {}, snapshot: { windows: [{ id: 'w1', type: 'terminal', spec: { action: 'attachSession', backendSessionId: 'sess-77-term', hostId: null } }, { id: 'w2', type: 'terminal', spec: { backendSessionId: '../../etc/passwd' } }] } });
const dirT = path.join(wt, 'data', 'incidents', rT.id);
for (let i = 0; i < 60 && !fs.existsSync(path.join(dirT, 'env.json')); i++) await sleep(500);
const envT = JSON.parse(fs.readFileSync(path.join(dirT, 'env.json'), 'utf8'));
const tailFile = path.join(dirT, 'frozen', 'buffers', 'sess-77-term.tail');
check('the reporter\'s open terminal is a freeze target', (envT.targets?.terminalIds || []).includes('sess-77-term'), envT.targets);
check('its raw buffer TAIL is frozen (last 64 KB, truncatedFrom recorded)', fs.existsSync(tailFile) && fs.statSync(tailFile).size === 64 * 1024 && fs.readFileSync(tailFile, 'latin1').endsWith('TAIL-MARK') && envT.local.terminalTails?.['sess-77-term']?.bytes === 64 * 1024 && envT.local.terminalTails['sess-77-term'].truncatedFrom > 64 * 1024, envT.local.terminalTails);
check('a traversal-shaped session id is never a target', !(envT.targets?.terminalIds || []).some((x) => x.includes('..')) && !fs.existsSync(path.join(dirT, 'frozen', 'buffers', 'passwd.tail')));
const bundleT = JSON.parse(fs.readFileSync(path.join(dirT, 'bundle.json'), 'utf8'));
check('the server section carries the desktop scene (singleton + apps + bridge stats)', bundleT.server.desktop && typeof bundleT.server.desktop === 'object' && 'singleton' in bundleT.server.desktop && Array.isArray(bundleT.server.desktop.apps) && typeof bundleT.server.desktop.streams === 'object', bundleT.server.desktop);
// the meta a later kill would clobber: prove the frozen copy is independent
fs.writeFileSync(path.join(metaDir, 'cw-99-test.json'), JSON.stringify({ sessionId: null, name: 'CLOBBERED' }));
check('frozen copy survives the original being clobbered',
  JSON.parse(fs.readFileSync(path.join(dir2, 'frozen', 'session-meta', 'cw-99-test.json'), 'utf8')).name === 'frozen probe');
check('pending marker cleared after freeze', !fs.existsSync(path.join(dir2, 'env.json.pending')));

// ── B-8ebb (last row): the freeze reaches CODEX rollouts too — through the
// harness registry's store.locate (never a codex ternary in incident.js).
// A codex thread id referenced by the report, its rollout in the remote-jsonl
// cache (the local ~/.codex tree is the real user's — untouched), must land in
// env.local.transcripts with identity + a frozen tail, tagged with its harness.
const TID = '01a07000-0000-7000-8000-0000000000ee';
const cxCache = path.join(wt, 'data', 'remote-jsonl', 'host-test', 'codex');
fs.mkdirSync(cxCache, { recursive: true });
fs.writeFileSync(path.join(cxCache, TID + '.jsonl'), '{"timestamp":"2026-09-05T10:00:00.000Z","ordinal":0,"type":"session_meta","payload":{"id":"' + TID + '","cwd":"/w","cli_version":"0.153.4"}}\n{"timestamp":"2026-09-05T10:00:01.000Z","ordinal":1,"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"frozen codex probe"}]}}\n');
const r3 = await post('/api/incident', { note: 'codex freeze', rings: {}, snapshot: { sessions: [{ id: TID, backend: 'codex', host: 'host-test' }, { id: CID, host: 'host-test' }] } });
const dir3 = path.join(wt, 'data', 'incidents', r3.id);
for (let i = 0; i < 60 && !fs.existsSync(path.join(dir3, 'env.json')); i++) await sleep(500);
const env3 = JSON.parse(fs.readFileSync(path.join(dir3, 'env.json'), 'utf8'));
const cx = env3.local.transcripts?.[TID];
check('codex rollout fingerprinted through the harness store (sha256 + size + harness tag)', Array.isArray(cx) && cx.length === 1 && /^[0-9a-f]{64}$/.test(cx[0].sha256 || '') && cx[0].harness === 'codex' && cx[0].size > 0, JSON.stringify(cx));
check('codex rollout tail frozen to disk (.tail.jsonl named by its cache dir)', fs.readdirSync(path.join(dir3, 'frozen', 'transcripts')).some((f) => f.startsWith(TID) && f.endsWith('.tail.jsonl')));
check('the frozen codex tail is the real bytes', fs.readFileSync(path.join(dir3, 'frozen', 'transcripts', fs.readdirSync(path.join(dir3, 'frozen', 'transcripts')).find((f) => f.startsWith(TID))), 'utf8').includes('frozen codex probe'));
check('the claude conversation in the same report still freezes exactly once (locate dedups against the scan)', Array.isArray(env3.local.transcripts?.[CID]) && env3.local.transcripts[CID].length === 1);
// the remote probe is built from every harness's store.remoteFind — claude's line unchanged, codex's added
const inc = (await import(path.join(repo, 'src', 'incident.js'))).default || (await import('node:module')).createRequire(import.meta.url)(path.join(repo, 'src', 'incident.js'));
// the copier itself (inc-mudv05ja-n5rv): a frozen file is truncated as DATA, never as bytes
{
  const cj = inc.copyJsonWhole;
  const d = scratch('inc-copyjson'); fs.mkdirSync(d, { recursive: true });
  process.on('exit', () => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} });
  const src = path.join(d, 'src.json'), dst = path.join(d, 'dst.json');
  fs.writeFileSync(src, JSON.stringify({ a: 1, taskRecords: Array.from({ length: 100 }, (_, i) => ({ i, p: 'y'.repeat(1000) })), small: [1, 2] }));
  const r0 = typeof cj === 'function' ? cj(src, dst, 20 * 1024) : null;
  const o = (() => { try { return JSON.parse(fs.readFileSync(dst, 'utf8')); } catch { return null; } })();
  check('copyJsonWhole: over the ceiling ⇒ valid JSON under it, the largest array keeps its NEWEST records, marker names field/from/kept + original size',
    r0 && o && fs.statSync(dst).size <= 20 * 1024 && o.a === 1 && o.small.length === 2 && o._frozenTrimmed?.originalBytes === fs.statSync(src).size
    && o._frozenTrimmed.dropped[0].field === 'taskRecords' && o._frozenTrimmed.dropped[0].from === 100 && o.taskRecords.at(-1).i === 99 && r0.trimmed === true, JSON.stringify(r0));
  fs.writeFileSync(src, '{"not json' + 'z'.repeat(50 * 1024));
  const r1 = typeof cj === 'function' ? cj(src, dst, 20 * 1024) : null;
  const o1 = (() => { try { return JSON.parse(fs.readFileSync(dst, 'utf8')); } catch { return null; } })();
  check('copyJsonWhole: an unparseable file over the ceiling still freezes to VALID JSON (marker + the raw tail as a string)', r1 && o1 && o1._frozenTrimmed?.unparseable === true && typeof o1.rawTail === 'string' && fs.statSync(dst).size <= 20 * 1024, JSON.stringify(r1));
  fs.writeFileSync(src, '{"x":1}');
  const r2c = typeof cj === 'function' ? cj(src, dst, 20 * 1024) : null;
  check('copyJsonWhole: under the ceiling ⇒ the bytes verbatim', r2c && fs.readFileSync(dst, 'utf8') === '{"x":1}' && !r2c.trimmed);
}
const probe = inc.buildRemoteTranscriptProbe([CID, TID]);
check('remote probe: claude find line = the pre-B-8ebb expression', probe.includes(`find "$HOME"/.claude/projects -maxdepth 2 -name "${CID}.jsonl" 2>/dev/null | head -3); do probe_transcript "$f" "claude"; done`), probe.slice(0, 300));
check('remote probe: codex rollouts (.jsonl and .jsonl.zst) probed under $HOME/.codex/sessions', probe.includes(`rollout-*${TID}.jsonl.zst`) && probe.includes('"$HOME"/.codex/sessions') && probe.includes('probe_transcript "$f" "codex"'), probe.slice(-400));
check('REMOTE_SCRIPT defines probe_transcript once and embeds the per-harness lines', (() => { const s = inc.REMOTE_SCRIPT([CID]); return s.includes('probe_transcript() {') && s.includes('probe_transcript "$f" "claude"') && !s.includes('$HOME/.claude/projects -maxdepth 2 -name "$cid.jsonl"'); })());
check('incident.js carries no backend id branch (the registry is the only harness knowledge)', !/['"]codex['"]\s*\?|backend === ['"]codex['"]|=== ['"]claude['"]/.test(fs.readFileSync(path.join(repo, 'src', 'incident.js'), 'utf8')));

// ── 2.239.1: the dialog must actually render its submit button (the boss's
// "怎么提交" screenshot — shell.footer was undefined, appendChild threw, no
// button). Drive the REAL dialog in headless chrome and click through it.
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (CHROME) {
  const { spawn: sp } = await import('node:child_process');
  const { createRequire } = await import('node:module');
  const WebSocket = createRequire(import.meta.url)('ws');
  const chrome = sp(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', `--user-data-dir=${scratch('inc-chrome')}`, 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch {}; try { fs.rmSync(scratch('inc-chrome'), { recursive: true, force: true }); } catch {} });
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { await sleep(250); }
  }
  const cws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => cws.on('open', r));
  let seq = 0; const pend = new Map();
  cws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); cws.send(JSON.stringify({ id, method, params })); });
  const evaljs = async (expr) => {
    const rr = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (rr.result?.exceptionDetails) throw new Error(JSON.stringify(rr.result.exceptionDetails).slice(0, 300));
    return rr.result?.result?.value;
  };
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  for (let i = 0; i < 60; i++) { if (await evaljs('!!(window.app && window.app.captureIncident)').catch(() => false)) break; await sleep(400); }
  const ui = await evaljs(`(async () => {
    window.app.captureIncident();
    await new Promise((r) => setTimeout(r, 300));
    // scope to the NEWEST overlay — a fresh instance also shows the
    // onboarding dialog, and document-order querySelector grabs that one
    const ovs = document.querySelectorAll('.dialog-overlay');
    const ov = ovs[ovs.length - 1];
    const btn = ov?.querySelector('.dialog-actions .btn-create');
    const ta = ov?.querySelector('.dialog-body textarea');
    if (!btn || !ta) return { ok: false, btn: !!btn, ta: !!ta };
    ta.value = 'ui e2e note';
    btn.click();
    // A BOUNDED POLL, 30 s (2026-09-16): the capture freezes transcripts and
    // fingerprints them server-side, and under the heavy tier's parallel lanes
    // that took longer than the 10 s this leg used to allow — the tier paid a
    // retry for a render the box's load made late (the 2b49b4a7 class). The
    // assertion is unchanged; only WHEN the leg looks is bounded differently.
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const idEl = ov?.querySelector('.dialog-body .mono');
      if (idEl && /^inc-/.test(idEl.textContent.trim())) return { ok: true, id: idEl.textContent.trim() };
    }
    // say what the overlay we CLICKED shows, not the first dialog in the document
    return { ok: false, stuck: ov?.querySelector('.dialog-body')?.textContent?.slice(0, 120) };
  })()`);
  check('dialog renders the Capture button AND click-through yields an inc- id', ui?.ok === true, JSON.stringify(ui));
  if (ui?.ok) {
    const b2 = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'incidents', ui.id, 'bundle.json'), 'utf8'));
    check('UI-driven capture wrote the note from the textarea', b2.note === 'ui e2e note');
  }
  cws.close();
} else console.log('  (chrome absent — dialog render check skipped)');

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
