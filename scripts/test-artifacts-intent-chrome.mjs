#!/usr/bin/env node
// THE ARTIFACTS LIST BY INTENT ON A REAL PAGE (lane artifacts-by-intent, heavy; owner 2026-11-06, a phone shot of the
// Artifacts popover: 「这个界面你得好好优化下了 根本找不到想找的东西」). test-artifacts-chrome's rig — a THROWAWAY server in a git
// worktree (own data/, a scratch HOME), a stub `claude` behind the real chat-wrapper (ONE turn: it Writes docs/BRIEF.md ⇒
// a real card + the chip), headless chrome over raw CDP (a dead proxy, loopback only). The owner's SHAPE (30 artifacts
// incl. three README.md + 41 code files; 2 published pages, a hand-over, a running service) is built by the REAL
// src/artifacts.js reducer + view + cardBlock (the registry's listFor composition) and answered to the page's own
// GET /api/artifacts, so the chip, the popover and the window draw it through their real code:
//   ① the PHONE (360 × 740, zh then en): a FULL-HEIGHT sheet; its first section is «给你看的 · 4» with all four rows on the
//     first screen; «顺带改了 41 个代码文件» folded; the search pinned (the list scrolled, the field has not moved); every
//     row / head / ⋯ / ✕ ≥ 44 px; the names and the field 16 px; the auto-open switch out of the header (in the ⋯); the
//     three README.md told apart by their folders; ONE TAP on a row opens it (the real open road).
//   ② the DESKTOP (1280): the popover's bands; the ⤢ window's rail opens with the three bands and their counts.
//   ROUND 3: the popover's header lays out BY MEASURE — at 420 one line; at 328 / 300 (a chat window's clamp) the count
//     takes its own line, WHOLE, in en / zh / ja over the owner's 43 + 174 (CONTROL: r2's nowrap row clips it); a page a
//     peer conversation SENT (its vibespace-msg record through the real reader + reducer) reads in «给你看的», the
//     person's own paste in «做出来的».
//   ROUND 4: «the count on its own line» judged by the boxes (the count's top under every picker's bottom — never a pixel
//     offset a font's line height decides); the window's «Recent» rail newest first, no band heads; a tray answer — the
//     ask's page «给你看的», the person's own link in the answer «做出来的»; two homes' folders told apart («/home/a/x» ·
//     «/root/x»); THE DEVICE BUNDLE: src/harnesses/artifacts-of.js bundled as build:agentd bundles it — no relative
//     require left, the copy runs the tray answer (CONTROL: r3's variable require ⇒ the copy cannot resolve it).
// Shots (`VS_AF_INTENT_SHOTS` = a directory; `VS_AF_INTENT_TAG` = before | after) — the same file run in a base copy
// draws the owner's screenshot (BEFORE) and reds by name.
// Run: node scripts/test-artifacts-intent-chrome.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, stillPresser } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AF = require(path.join(repo, 'src/artifacts.js'));
const VNC_ENV = await vncEnv();
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const SHOTS = process.env.VS_AF_INTENT_SHOTS || '', TAG = process.env.VS_AF_INTENT_TAG || 'after';
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('af-intent-wt');
const fakeHome = scratchHome('af-intent-home', fs);
const stubDir = scratch('af-intent-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(path.join(CWD, 'docs'), { recursive: true });
const BRIEF = path.join(CWD, 'docs/BRIEF.md');
const REFP = '/var/tmp/vibespace-lanes/wt-referee/out/review.md'; // round 2: a REALISTIC helper's folder (outside the cwd, no home) — the row reads «referee · …/out · 文档»
const LIVE_SID = '5c3a0000-0000-4000-8000-0000000af0a1';
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

const A = (id, content) => ({ type: 'assistant', message: { id, type: 'message', role: 'assistant', model: 'claude-fable-5', content, usage: { input_tokens: 1, output_tokens: 1 } } });
const R = (tid) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: 'ok' }] } });
const TURNS = [[A('msg_a1', [{ type: 'tool_use', id: 'toolu_ai1', name: 'Write', input: { file_path: BRIEF, content: '# Brief\n\nfirst draft\n' } }]), R('toolu_ai1'), A('msg_a2', [{ type: 'text', text: 'Brief written.' }])]];
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = ${JSON.stringify(LIVE_SID)};
const TURNS = ${JSON.stringify(TURNS)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
let n = 0, buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const k = n++;
    const P = TURNS[k] || [];
    if (k === 0) fs.writeFileSync(${JSON.stringify(BRIEF)}, '# Brief\\n\\nfirst draft\\n');
    let j = 0;
    const next = () => {
      if (j < P.length) { out({ ...P[j], session_id: SID, uuid: 'ai-' + k + '-' + j }); j++; setTimeout(next, 60); return; }
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 500, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
    };
    setTimeout(next, 150);
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── THE OWNER'S SHAPE, through the real reducer (the registry's listFor composition: view + cardBlock + the cwd) ──
const ownerView = (more = null) => {
  const T = Date.now(), at = (m) => T - m * 60e3;
  let r = {};
  const add = (o) => { r = AF.fold(r, { cwd: CWD, ...o }); };
  add({ op: 'write', path: 'site/index.html', at: at(30) }); add(AF.pageOp({ id: 'pgsite000001', name: 'Site', srcKey: 'local:' + CWD + '/site/index.html', srcPath: CWD + '/site/index.html', path: '/p/pgsite000001', updatedAt: at(3) }));
  add({ op: 'write', path: 'report/summary.html', at: at(50) }); add(AF.pageOp({ id: 'pgrep0000001', name: 'Summary', srcKey: 'local:' + CWD + '/report/summary.html', srcPath: CWD + '/report/summary.html', path: '/p/pgrep0000001', updatedAt: at(40) }));
  let h = AF.fold({}, { op: 'write', path: REFP, at: at(20) }); h = Object.values(h)[0];
  add(AF.handoverOp(h, { from: { cid: 'c-H', name: 'referee' }, at: at(20) }));
  const tags = ['verify', 'attack:sandbox', 'pt2:fix', null];
  const made = ['traces/v3-or1/README.md', 'referee3/README.md', 'v3/README.md', 'docs/BRIEF.md', 'docs/status_r2.md', 'docs/todo_wave12.md', 'docs/设计说明.md',
    'out/sec10_tail.md', 'out/wave1_notes.md', 'out/wave2_notes.md', 'out/wave3_notes.md', 'out/wave4_notes.md', 'traces/v3-or1/trace.md', 'traces/v3-or1/verdict.md',
    'referee3/score.md', 'referee3/notes.md', 'v3/plan.md', 'v3/plan_b.md', 'renders/cover.png', 'renders/floor.png', 'notes/a.md', 'notes/b.md', 'notes/c.md', 'notes/d.md', 'summary.md'];
  made.forEach((p, i) => add({ op: 'write', path: p, at: at(60 + i * 7), ...(tags[i % 4] ? { via: { kind: 'subagent', name: tags[i % 4] } } : {}) }));
  add(AF.uploadOp({ path: CWD + '/inbox/brief.pdf', size: 12 }, { at: at(400) }));
  for (let i = 0; i < 40; i++) add({ op: 'edit', path: `src/pkg${i % 6}/mod_${i}.py`, at: at(90 + i * 5) });
  add({ op: 'edit', path: 'mirror/v3-or1/README.md', at: at(95) });
  if (more) r = more(r, at);
  const svc = AF.serviceRows([{ id: 'web2', state: 'up', listen: { port: 8100, at: at(10), firstAt: at(10) }, runs: [{ startedAt: at(12) }], ownerSession: { conversationId: 'c-A' } }], { cid: 'c-A', now: T, labelOf: () => 'house3d-web2-2' });
  const v = AF.view({ ...r, ...svc });
  return { ok: true, items: v.items.map(AF.cardBlock), code: v.code.map(AF.cardBlock), count: v.count, codeCount: v.codeCount, full: v.full, cwd: CWD, host: '' };
};
const OWNER = ownerView();
// round 3: the owner's FULL counts (43 + 174 — the header's measure) and a page a PEER sent (its vibespace-msg record — the
// CLI's measured peer shape — through the REAL reader + the live consumer's author rule + the reducer), beside a page the
// person pasted themselves
const OWNER_BIG = ownerView((r, at) => { for (let i = 0; i < 13; i++) r = AF.fold(r, { cwd: CWD, op: 'write', path: `extra/e${i}.md`, at: at(700 + i) }); for (let i = 0; i < 133; i++) r = AF.fold(r, { cwd: CWD, op: 'edit', path: `lib/m${i % 7}/x_${i}.py`, at: at(800 + i) }); return r; });
const OF = require(path.join(repo, 'src/harnesses/artifacts-of.js'));
const PEER_PAGES = { pgreferee001: { page: { id: 'pgreferee001', name: 'Referee report', path: '/p/pgreferee001', public: true } }, pgpasted0001: { page: { id: 'pgpasted0001', name: 'A page I pasted', path: '/p/pgpasted0001', public: true } } };
const PEER_RECS = [{ type: 'user', isMeta: true, origin: { kind: 'peer', from: 'unknown' }, promptSource: 'system', message: { role: 'user', content: 'Another Claude session sent a message:\nMessage from session "referee" (via vibespace-msg; reply: vibespace-msg send "referee" "..."):\nreport published: /p/pgreferee001' } },
  { type: 'user', promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: 'and this one is mine: /p/pgpasted0001' }] } }];
const OWNER_PEER = ownerView((r, at) => { PEER_RECS.forEach((rec, i) => { for (const o of OF.claude(rec)) r = AF.apply(r, { cwd: CWD, ...o, at: at(1 + i), by: AF.opAuthor(o) }).rows; }); return AF.resolvePresented(r, { pageOf: (id) => PEER_PAGES[id] || null, nameOf: () => 'referee' }); });

// round 4: a For-you TRAY ANSWER (composeReply's own text: the ask quoted — the agent's words — above the person's answer)
// through the real reader; two homes' folders («~/x» each) in «做出来的»
const IR = require(path.join(repo, 'src/inbox-reply.js'));
const TRAY_PAGES = { pgaskreview1: { page: { id: 'pgaskreview1', name: 'Review before merge', path: '/p/pgaskreview1', public: true } }, pgmynotes001: { page: { id: 'pgmynotes001', name: 'My own notes', path: '/p/pgmynotes001', public: true } } };
const TRAY_REPLY = IR.composeReply({ id: 'ut-0123456789', text: 'Please review the referee report /p/pgaskreview1 before I merge', createdAt: Date.now() - 600e3, urgency: 'normal' }, 'Looks fine — merge it. My notes: /p/pgmynotes001', { now: Date.now() });
const TRAY_REC = { type: 'user', promptSource: 'sdk', message: { role: 'user', content: TRAY_REPLY } };
const OWNER_TRAY = ownerView((r, at) => { for (const o of OF.claude(TRAY_REC)) r = AF.apply(r, { cwd: CWD, ...o, at: at(1), by: AF.opAuthor(o) }).rows; for (let i = 0; i < 3; i++) { r = AF.fold(r, { cwd: CWD, op: 'write', path: `/home/a/x/a${i}.md`, at: at(2 + i) }); r = AF.fold(r, { cwd: CWD, op: 'write', path: `/root/x/r${i}.md`, at: at(5 + i) }); } return AF.resolvePresented(r, { pageOf: (id) => TRAY_PAGES[id] || null, nameOf: () => 'referee' }); });
const OWNER_HOT = ownerView((r, at) => { r = AF.fold(r, { cwd: CWD, op: 'edit', path: 'src/pkg0/hot_fix.py', at: at(1) }); return AF.fold(r, { cwd: CWD, op: 'edit', path: 'src/pkg1/hot_test.py', at: at(2) }); }); // the two newest changes: code edits
const LM = await import(pathToFileURL(path.join(repo, 'src/lib/artifacts-list-model.js')).href);

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
// a dead proxy for every origin but loopback (Chrome's own bypass) and no name resolves but 127.0.0.1 — the walk never leaves the box
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
  '--proxy-server=http://127.0.0.1:9', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 60; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result)); sock.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(150); } return evalJs(expr); };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.__sid) || [...(window.app.sessions?.values?.() || [])].filter((v) => v && v._messageList).pop())`;
const PANEL = `document.querySelector('.chat-artifacts-panel')`;
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${TAG}-${name}.png`), Buffer.from(r.data, 'base64')); console.log(`  · shot ${TAG}-${name}.png`); };
const stubFetchOf = (v) => `window.__afFetch = window.__afFetch || window.fetch; window.fetch = (u, o) => (String(u).startsWith('/api/artifacts') ? Promise.resolve(new Response(${JSON.stringify(JSON.stringify(v))}, { headers: { 'content-type': 'application/json' } })) : window.__afFetch(u, o)); true`;
const stubFetch = stubFetchOf(OWNER);
const openPanel = async (v = OWNER) => {
  await evalJs(stubFetchOf(v));
  await evalJs(`${PANEL}?.remove(); (${VIEW})._statusBar.setArtifacts(${JSON.stringify(v)}); true`); await sleep(200);
  await evalJs(`document.querySelector('.chat-status-artifacts')?.click(); true`);
  return waitFor(`!!${PANEL}`, 5000);
};
const reattach = async () => {
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(sid)}, 'artifacts', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW}) && !!document.querySelector('.chat-status-artifacts')`, 20000); await sleep(600);
};
const README = ['traces/v3-or1/README.md', 'referee3/README.md', 'v3/README.md'];
// round 2 (the r1 acceptance): what a phone row SAYS — the hand-over's meta line (WHO and WHERE, nothing clipped, the whole
// path on its title), each README under the head naming its folder (bare name, no folder on its meta), the root's head
const ROUND2 = `handed: (() => { const x = rows.find((r) => r._afRow && r._afRow.via && r._afRow.via.kind === 'handover'); if (!x) return null; const m = x.querySelector('.chat-artifact-meta'); return { meta: m.textContent, clipped: m.scrollWidth > m.clientWidth + 1, title: x.title }; })(),
        readmeF: rows.filter((x) => x._afRow && x._afRow.name === 'README.md' && x._afRow.kind !== 'code').map((x) => { let h = x.previousElementSibling; while (h && !h.classList.contains('chat-artifact-head')) h = h.previousElementSibling; const m = x.querySelector('.chat-artifact-meta'); return { name: x.querySelector('.chat-artifact-name').textContent, meta: m.textContent, head: h ? h.textContent : '', inFolder: x.classList.contains('af-in-folder'), clipped: m.scrollWidth > m.clientWidth + 1 }; }),
        root: (heads.find((h) => h.dataset.group === ${JSON.stringify('f:i:made::' + CWD)}) || {}).textContent || ''`; // r3: a head is keyed by its DIRECTORY
const round2 = (lang, p, w) => {
  const docW = lang === 'zh' ? '文档' : 'Document';
  check(`${lang} ${w}: the hand-over from a helper's folder reads «referee · …/out · ${docW}» — WHO and WHERE, nothing clipped; the whole path on its title (long-press / hover)`, !!p && !!p.handed && p.handed.meta === `referee · …/out · ${docW}` && !p.handed.clipped && p.handed.title.startsWith('\u200e' + REFP), p && p.handed);
  check(`${lang} ${w}: each README.md sits under the head naming its folder — the BARE name, the meta line without the folder (its helper in view)`, !!p && README.every((n) => p.readmeF.some((x) => x.inFolder && x.name === 'README.md' && x.head.startsWith(n.replace(/\/README\.md$/, '') + ' · ') && x.meta.startsWith(docW + ' · ') && !x.clipped)), p && p.readmeF);
  check(`${lang} ${w}: the root folder's head says the cwd's own name («proj · 1»), never «./»`, !!p && p.root === 'proj · 1', p && p.root);
};
// round 3 (z2): the popover header BY MEASURE — `w` forces the panel's width (a chat window's clamp); the count's words
// whole on ONE line inside the row, never cut; each picker's words on one line, never cut
const HEADM = (w) => `(() => { const p = ${PANEL}; if (!p) return null; const r0 = p.getBoundingClientRect().right;
  ${w ? `p.style.minWidth = p.style.maxWidth = p.style.width = '${w}px'; const dx = p.getBoundingClientRect().right - r0; if (Math.abs(dx) > 0.5) p.style.left = (parseFloat(getComputedStyle(p).left) - dx) + 'px';` : ''} // the right edge stays where showDropdown put it (beside the chip)
  const ctl = p.querySelector('.af-ctl'), c = p.querySelector('.af-count'), pr = p.getBoundingClientRect(), lr = ctl.getBoundingClientRect(), cr = c.getBoundingClientRect();
  const lines = (el) => { const r = document.createRange(); r.selectNodeContents(el); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; };
  const picks = [...p.querySelectorAll('.af-pick')].map((b) => { const wd = b.querySelector('.af-pick-word'), br = b.getBoundingClientRect(); return { t: wd.textContent, lines: lines(wd), cut: wd.scrollWidth > wd.clientWidth + 1, out: br.right > lr.right + 0.5, top: Math.round(br.top), bottom: br.bottom, w: br.width }; });
  const need = Math.ceil(picks.reduce((n, x) => n + x.w, 0) + c.scrollWidth + 2 * parseFloat(getComputedStyle(ctl).columnGap || '0'));
  return { width: Math.round(pr.width), room: Math.floor(lr.width), need, count: c.textContent, countLines: lines(c), countCut: c.scrollWidth > c.clientWidth + 1, countOut: cr.right > lr.right + 0.5 || cr.right > pr.right + 0.5, ownLine: cr.top >= Math.max(...picks.map((x) => x.bottom)) - 0.5, picks: picks.map(({ w, bottom, ...x }) => x) }; })()`; // r4: its own line = its box starts under every picker's (never «top + 4 px»: DejaVu's 10-px count sits 5.5 px low on ONE line)
const headWhole = (m) => !!m && !m.countCut && !m.countOut && m.countLines === 1 && m.picks.length === 2 && m.picks.every((x) => x.lines === 1 && !x.cut && !x.out);
const byMeasure = (m) => !!m && m.ownLine === m.need > m.room; // ONE line exactly when the row's words fit
const COUNT_WORDS = { en: '43 artifacts · 174 code files', zh: '43 项产出 · 174 个代码文件', ja: '成果物 43 件 · コードファイル 174 件' };
const headLeg = async (lang) => {
  await openPanel(OWNER_BIG); await sleep(250);
  const drawn = await evalJs(HEADM(0));
  check(`${lang} 1280 as drawn (${drawn && drawn.width} px): «${drawn && drawn.count}» whole, by measure`, headWhole(drawn) && byMeasure(drawn) && drawn.count === COUNT_WORDS[lang], drawn);
  const wide = await evalJs(HEADM(420));
  check(`${lang} 420 px: the header by measure — ${wide && (wide.ownLine ? 'the words need ' + wide.need + ' px of ' + wide.room + ': the count on its own line' : 'one line (' + wide.need + ' of ' + wide.room + ' px)')}, «${wide && wide.count}» whole`, headWhole(wide) && byMeasure(wide) && wide.count === COUNT_WORDS[lang] && (lang === 'ja' || !wide.ownLine), wide);
  for (const w of [328, 300]) {
    const m = await evalJs(HEADM(w));
    check(`${lang} ${w} px (a chat window's clamp): the count takes its own line, WHOLE («${m && m.count}») — nothing cut mid-word; each picker on one line`, headWhole(m) && byMeasure(m) && m.ownLine && m.count === COUNT_WORDS[lang], m);
    if (w === 328) await shot(`1280-popover-328-${lang}`);
  }
};
let sid = null;
try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp(); await sleep(800);
  const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => liveWs.on('open', r));
  await evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD)}, name: 'artifacts', mode: 'chat', backend: 'claude' }); true`);
  for (let i = 0; i < 80 && !sid; i++) { sid = await evalJs(`([...app.sessions.values()].find((v) => v && v._messageList)?.sessionId) || null`); if (!sid) await sleep(250); }
  check('a live claude chat (stub CLI behind the real wrapper) is created through the page\'s own createSession', !!sid);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; app.settings.set('artifacts.autoOpenDocs', false); true`); // the tap below is the only open
  await waitFor(`!!document.querySelector('.chat-view .chat-input')`, 20000); await sleep(600);
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'Write me a brief' }));
  check('turn 1 (Write docs/BRIEF.md) ⇒ its card + the Artifacts chip', await waitFor(`!!document.querySelector('.chat-artifact-card') && !!document.querySelector('.chat-status-artifacts')`, 20000));

  console.log('② the DESKTOP (1280): the popover\'s bands; the ⤢ window\'s rail opens with the three bands');
  await openPanel();
  const d1 = await evalJs(`(() => { const p = ${PANEL}; const heads = [...p.querySelectorAll('.chat-artifact-head')].map((h) => h.dataset.group + '|' + h.textContent); return { heads, count: p.querySelector('.af-count')?.textContent || '' }; })()`);
  check('desktop popover: the bands in order (for you · made here + its folders · touched folded), the count line «30 artifacts · 41 code files»', d1.heads[0] === 'i:foryou|For you · 4' && d1.heads.some((h) => h.startsWith('i:made|Made here · 26')) && d1.heads.at(-1) === 'i:touched|Touched 41 code files' && /30 artifacts · 41 code files/.test(d1.count), d1);
  const pickLines = `[...${PANEL}.querySelectorAll('.af-pick')].map((b) => { const w = b.querySelector('.af-pick-word'), r = document.createRange(); r.selectNodeContents(w); return { t: w.textContent, lines: r.getClientRects().length, h: Math.round(b.getBoundingClientRect().height) }; })`;
  const pk = await evalJs(pickLines);
  check('desktop 1280: each ▾ picker on ONE line («For you first» · «Recently changed»)', pk.length === 2 && pk.every((x) => x.lines === 1 && x.h <= 24), pk);
  await shot('1280-popover-en');
  const asIs = await evalJs(HEADM(0));
  check(`desktop 1280 as drawn (${asIs && asIs.width} px — the chat window's clamp): «${asIs && asIs.count}» whole, the pickers on one line, by measure`, headWhole(asIs) && byMeasure(asIs), asIs);
  console.log('  round 3: the header BY MEASURE (the owner\'s 43 + 174)');
  await headLeg('en');
  await evalJs(`(() => { const s = document.createElement('style'); s.id = 'r2-head'; s.textContent = '.af-ctl { flex-wrap: nowrap !important; } .af-count { max-width: none !important; overflow: visible !important; }'; document.head.appendChild(s); return true; })()`);
  const r2h = await evalJs(HEADM(328));
  check('CONTROL r2\'s header (the row never wraps — the pickers nowrap beside the count) at 328 px ⇒ the count runs past the panel — RED', !!r2h && !headWhole(r2h) && r2h.countOut, r2h);
  await evalJs(`document.getElementById('r2-head')?.remove(); true`);
  await openPanel(); await sleep(200);
  await evalJs(stubFetch); await evalJs(`${PANEL}?.querySelector('.af-expand')?.click(); true`);
  await waitFor(`document.querySelectorAll('.af-window .af-trow').length === 71`, 8000);
  const w1 = await evalJs(`(() => { const rail = [...document.querySelectorAll('.af-window .af-rail-item')].map((r) => r.dataset.rail + ' ' + r.querySelector('.af-rail-n').textContent); const rows = [...document.querySelectorAll('.af-window .af-trow')]; return { rail, n: rows.length, first4: rows.slice(0, 4).map((r) => r.dataset.kind), path0: rows.find((r) => r.dataset.key.endsWith('/referee3/README.md'))?.querySelector('.af-c-path')?.textContent.replace(/\\u200e/g, '') || null, name0: rows.find((r) => r.dataset.key.endsWith('/referee3/README.md'))?.querySelector('.chat-artifact-name')?.textContent.replace(/\u200e/g, '') || null }; })()`);
  check('the window\'s rail: All · 给你看的 4 · 做出来的 26 · 顺带改的 41, then the kinds and helpers', w1.rail.slice(0, 4).join() === 'all 71,i:foryou 4,i:made 26,i:touched 41', w1.rail);
  check('no column clicked ⇒ the table reads band by band («for you» first); the path column is the FOLDER, the name told apart', w1.first4.slice().sort().join() === 'doc,page,page,service' && w1.path0 === 'referee3' && w1.name0 === 'referee3/README.md', w1);
  const bandRows = `[...document.querySelectorAll('.af-window .af-tband')].map((n) => n.dataset.band + ' ' + n.textContent)`;
  const w2 = await evalJs(bandRows);
  check('the window\'s table: a thin head row per band, the rail\'s words — where «for you» ends', w2.join() === 'foryou For you · 4,made Made here · 26,touched Touched · 41', w2);
  await shot('1280-window-en');
  await evalJs(`document.querySelector('.af-window .af-th[data-col="path"]').click(); true`); await sleep(150);
  const w3 = await evalJs(`(() => { const p = [...document.querySelectorAll('.af-window .af-trow')].map((r) => r.querySelector('.af-c-path').textContent.replace(/\u200e/g, '')); return { bands: document.querySelectorAll('.af-window .af-tband').length, sorted: p.every((x, i) => i === 0 || p[i - 1].localeCompare(x, undefined, { numeric: true, sensitivity: 'base' }) <= 0), some: p.filter((x, i) => i === 0 || x !== p[i - 1]).slice(0, 8) }; })()`);
  check('Path ▲ sorts by the folder the column SHOWS; the band rows go while a column sorts', w3.bands === 0 && w3.sorted, w3);
  await evalJs(`document.querySelector('.af-window .af-rail-item[data-rail="all"]').click(); true`); await sleep(150);
  const w4 = await evalJs(`({ bands: ${bandRows}, first4: [...document.querySelectorAll('.af-window .af-trow')].slice(0, 4).map((r) => r.dataset.kind) })`);
  check('the rail\'s All after a column sort ⇒ the bands\' order and their rows again (one gesture)', w4.bands.join() === w2.join() && w4.first4.slice().sort().join() === 'doc,page,page,service', w4);
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'artifacts') app.wm.closeWindow(w.id); true`);
  console.log('  round 4: the window\'s «Recent» — newest first, no band heads (the two newest are code edits: r3 put them last)');
  await openPanel(OWNER_HOT); await sleep(200);
  await evalJs(`${PANEL}?.querySelector('.af-expand')?.click(); true`);
  await waitFor(`document.querySelectorAll('.af-window .af-trow').length === ${OWNER_HOT.items.length + OWNER_HOT.code.length}`, 8000);
  await evalJs(`document.querySelector('.af-window .af-rail-item[data-rail="recent"]').click(); true`); await sleep(150);
  const w5 = await evalJs(`({ bands: document.querySelectorAll('.af-window .af-tband').length, keys: [...document.querySelectorAll('.af-window .af-trow')].map((r) => r.dataset.key), kinds: [...document.querySelectorAll('.af-window .af-trow')].map((r) => r.dataset.kind) })`);
  const wantRecent = LM.recentOf(LM.rowsOfView(OWNER_HOT)).map((b) => b.key);
  check(`the rail's «Recent» ⇒ its ${wantRecent.length} rows NEWEST FIRST (${w5.kinds.join(' · ')}), no band heads — as the base read it`, w5.bands === 0 && w5.keys.join() === wantRecent.join() && w5.kinds[0] === 'code', { w5, wantRecent });
  await shot('1280-window-recent-en');
  await evalJs(`for (const w of [...app.wm.windows.values()]) if (w.type === 'artifacts') app.wm.closeWindow(w.id); true`);

  for (const lang of ['zh', 'en']) {
    console.log(`① the PHONE (360 × 740, ${lang}) — the full-height sheet, the attention list first, the search pinned, the targets`);
    await evalJs(`document.body.click(); localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); true`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.reload', {}); await waitApp(); await sleep(1000);
    await reattach();
    await openPanel(); await sleep(300);
    const p = await evalJs(`(() => { const p = ${PANEL}; if (!p) return null; const r = p.getBoundingClientRect(), list = p.querySelector('.af-list'), lr = list.getBoundingClientRect();
      const heads = [...p.querySelectorAll('.chat-artifact-head')]; const rows = [...p.querySelectorAll('.chat-artifact-row')];
      const vis = (e) => { const q = e.getBoundingClientRect(); return q.top >= lr.top - 1 && q.bottom <= lr.bottom + 1; };
      const fy = heads[0] && heads[0].dataset.group === 'i:foryou' ? rows.filter((x) => x._afRow && x._afRow.intent === 'foryou') : [];
      const cs = (e) => (e ? getComputedStyle(e) : null); const px = (e, k) => (e ? parseFloat(cs(e)[k]) : 0); const box = (e) => (e ? e.getBoundingClientRect() : { width: 0, height: 0 });
      const visRows = rows.filter(vis), visHeads = heads.filter(vis);
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), h: innerHeight, w: innerWidth,
        first: heads[0] ? heads[0].dataset.group + '|' + heads[0].textContent : '', foryouOnFirstScreen: fy.length === 4 && fy.every(vis),
        touched: (heads.find((h) => h.dataset.group === 'i:touched') || {}).textContent || '', touchedShut: (heads.find((h) => h.dataset.group === 'i:touched') || { dataset: {} }).dataset.fold === 'shut',
        codeRows: rows.filter((x) => x.dataset.kind === 'code').length,
        minRowH: Math.min(...visRows.map((x) => box(x).height)), minHeadH: Math.min(...visHeads.map((x) => box(x).height)),
        btns: ['.af-menu', '.af-close', '.af-expand'].map((s) => { const b = box(p.querySelector(s)); return s + ' ' + Math.round(b.width) + '×' + Math.round(b.height); }),
        nameFont: px(rows[0] && rows[0].querySelector('.chat-artifact-name'), 'fontSize'), fieldFont: px(p.querySelector('.af-filter'), 'fontSize'), metaFont: px(rows[0] && rows[0].querySelector('.chat-artifact-meta'), 'fontSize'),
        autoShown: !!p.querySelector('.af-auto') && cs(p.querySelector('.af-auto')).display !== 'none', menuShown: !!p.querySelector('.af-menu') && cs(p.querySelector('.af-menu')).display !== 'none',
        readme: rows.filter((x) => x._afRow && x._afRow.name === 'README.md' && x._afRow.kind !== 'code').map((x) => x.querySelector('.chat-artifact-name').textContent.replace(/\u200e/g, '') + ' | ' + x.querySelector('.chat-artifact-meta').textContent),
        readmeEnd: rows.filter((x) => x._afRow && x._afRow.name === 'README.md' && x._afRow.kind !== 'code').every((x) => { const n = x.querySelector('.chat-artifact-name'); return getComputedStyle(n).direction === 'rtl' || n.scrollWidth <= n.clientWidth; }),
        ${ROUND2},
        cb: (() => { for (let e = p.parentElement; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.transform !== 'none' || c.filter !== 'none' || /paint|layout|strict|content/.test(c.contain) || /transform/.test(c.willChange)) return Math.round(e.getBoundingClientRect().top); } return 0; })(),
        count: p.querySelector('.af-count')?.textContent || '' }; })()`);
    check(`${lang}: a FULL-HEIGHT sheet — the whole window area under the phone's own top bar (top ${p?.top} = the area's ${p?.cb}, bottom ${p?.bottom} of ${p?.h}, width ${p?.width})`, !!p && Math.abs(p.top - p.cb) <= 1 && p.top <= 64 && Math.abs(p.bottom - p.h) <= 2 && p.left === 0 && p.width === p.w, p);
    const fyWord = lang === 'zh' ? '给你看的 · 4' : 'For you · 4', tWord = lang === 'zh' ? '顺带改了 41 个代码文件' : 'Touched 41 code files';
    check(`${lang}: the first section is «${fyWord}» and its four rows are on the FIRST SCREEN (the attention list)`, !!p && p.first === 'i:foryou|' + fyWord && p.foryouOnFirstScreen, p && { first: p.first, onScreen: p.foryouOnFirstScreen });
    check(`${lang}: «${tWord}» folded — no code row drawn`, !!p && p.touched === tWord && p.touchedShut && p.codeRows === 0, p && { touched: p.touched, shut: p.touchedShut, code: p.codeRows });
    check(`${lang}: every visible row ≥ 44 px (min ${p?.minRowH}), every head ≥ 44 px (min ${p?.minHeadH}); ⋯ ✕ ⤢ 44 × 44`, !!p && p.minRowH >= 44 && p.minHeadH >= 44 && p.btns.every((b) => / 44×44$/.test(b)), p && { rows: p.minRowH, heads: p.minHeadH, btns: p.btns });
    check(`${lang}: the names and the field 16 px, the meta line ≥ 14 px (${p?.nameFont} / ${p?.fieldFont} / ${p?.metaFont})`, !!p && p.nameFont >= 16 && p.fieldFont >= 16 && p.metaFont >= 14, p && [p.nameFont, p.fieldFont, p.metaFont]);
    check(`${lang}: the auto-open switch left the header for the ⋯ menu`, !!p && !p.autoShown && p.menuShown, p && { auto: p.autoShown, menu: p.menuShown });
    round2(lang, p, '360');
    await shot(`360-${lang}`);
    const scrollTo = async (sel, tag) => { await evalJs(`(() => { const l = ${PANEL}.querySelector('.af-list'); const h = [...${PANEL}.querySelectorAll('.chat-artifact-head')].find((x) => x.dataset.group === ${JSON.stringify(sel)}); if (h) l.scrollTop += h.getBoundingClientRect().top - l.getBoundingClientRect().top; return true; })()`); await sleep(200); await shot(tag); };
    await scrollTo('f:i:made::' + CWD + '/traces/v3-or1', `360-${lang}-folders`); // a folder head's rows: bare names, no folder on the meta line
    await scrollTo('f:i:made::' + CWD, `360-${lang}-root`); // the root head by the cwd's own name
    await evalJs(`${PANEL}.querySelector('.af-list').scrollTop = 0; true`);
    const pin = await evalJs(`(() => { const p = ${PANEL}; const f = p.querySelector('.af-filter'), l = p.querySelector('.af-list'); const t0 = f.getBoundingClientRect().top; l.scrollTop = l.scrollHeight; return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({ t0: Math.round(t0), t1: Math.round(f.getBoundingClientRect().top), scrolled: l.scrollTop > 0, inView: f.getBoundingClientRect().bottom <= innerHeight && f.getBoundingClientRect().top >= 0 })))); })()`);
    check(`${lang}: the search is PINNED — the list scrolled ${pin.scrolled ? 'to its end' : '(did not scroll)'}, the field stayed at ${pin.t1} px`, pin.scrolled && pin.t0 === pin.t1 && pin.inView, pin);
    await shot(`360-${lang}-scrolled`);
    if (lang === 'zh') {
      console.log('  320 × 700 (zh): the narrowest phone — the same words, nothing clipped');
      await cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 2, mobile: true }); await evalJs(`${PANEL}.querySelector('.af-list').scrollTop = 0; true`); await sleep(500);
      const p320 = await evalJs(`(() => { const p = ${PANEL}; if (!p) return null; const heads = [...p.querySelectorAll('.chat-artifact-head')]; const rows = [...p.querySelectorAll('.chat-artifact-row')]; return { ${ROUND2} }; })()`);
      round2('zh', p320, '320');
      await shot('320-zh');
      await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true }); await sleep(400);
      await evalJs(`(() => { const l = ${PANEL}.querySelector('.af-list'); l.scrollTop = 0; const r = [...${PANEL}.querySelectorAll('.chat-artifact-row')].find((x) => x._afRow && x._afRow.path === ${JSON.stringify(BRIEF)}); if (r) r.scrollIntoView({ block: 'center' }); return true; })()`);
      await sleep(300);
      const rr = await evalJs(`(() => { const r = [...${PANEL}.querySelectorAll('.chat-artifact-row')].find((x) => x._afRow && x._afRow.path === ${JSON.stringify(BRIEF)}); if (!r) return null; const q = r.getBoundingClientRect(); return { x: Math.round(q.left + q.width * 0.35), y: Math.round(q.top + q.height / 2), before: [...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(BRIEF)} || String(w.title || '').includes('BRIEF.md')).length }; })()`);
      if (rr) {
        // THE STILL DOOR (scripts/scratch.mjs stillPresser — test-still-press ⑤): the tap only on a row that is the element at
        // its point, the same rect on two looks, nothing moving it (the sheet's own slide-in, the list's scroll); the pointerdown
        // must land on the row (no click owed — the row opens on its tap and the sheet closes)
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        rr.pressed = await stillPresser({ evalJs, cdp, sleep })(`JS:[...${PANEL}.querySelectorAll('.chat-artifact-row')].find((x) => x._afRow && x._afRow.path === ${JSON.stringify(BRIEF)})`, { touch: true, click: false });
        await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
      }
      const opened = rr && await waitFor(`[...app.wm.windows.values()].filter((w) => w._filePath === ${JSON.stringify(BRIEF)} || String(w.title || '').includes('BRIEF.md')).length > ${rr.before} && !${PANEL}`, 8000);
      check('zh: ONE TAP on a row (docs/BRIEF.md) opens it — the sheet closes, the document\'s window opens (the existing open road)', !!opened, rr);
      const docWin = `[...app.wm.windows.values()].find((w) => w._filePath === ${JSON.stringify(BRIEF)} || String(w.title || '').includes('BRIEF.md'))`;
      const loaded = !!opened && await waitFor(`/first draft/.test((${docWin})?.content?.textContent || '')`, 15000);
      check('zh: …and the document LOADS — its own text («first draft») in the window, never «加载中…»', !!loaded, !loaded && await evalJs(`(() => { const w = ${docWin}; return w ? { type: w.type, text: (w.content?.textContent || '').slice(0, 160) } : null; })()`));
      await shot('360-zh-tapped');
      await evalJs(`for (const w of [...app.wm.windows.values()]) if (w._filePath === ${JSON.stringify(BRIEF)} || String(w.title || '').includes('BRIEF.md')) app.wm.closeWindow(w.id); true`);
    }
  }
  console.log('③ the DESKTOP in zh (1280): «给你看的优先» on one line');
  await evalJs(`localStorage.setItem('vibespace.lang', 'zh'); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.reload', {}); await waitApp(); await sleep(1000);
  await reattach(); await openPanel(); await sleep(300);
  const pz = await evalJs(pickLines);
  check('desktop 1280 zh: each ▾ picker on ONE line («给你看的优先» · «最近修改»)', pz.length === 2 && pz.every((x) => x.lines === 1 && x.h <= 24) && pz[0].t === '给你看的优先', pz);
  await shot('1280-popover-zh');
  await headLeg('zh');
  console.log('  round 3: a page a PEER sent reads in «给你看的»; the person\'s own paste in «做出来的»');
  await openPanel(OWNER_PEER); await sleep(300);
  const pp = await evalJs(`(() => { const p = ${PANEL}; const out = {}; let band = ''; for (const n of p.querySelector('.af-list').children) { if (n.classList.contains('af-head-band')) band = n.dataset.band; else if (n.classList.contains('chat-artifact-row') && n._afRow && n._afRow.presented) out[n._afRow.page] = { band, name: n.querySelector('.chat-artifact-name').textContent, meta: n.querySelector('.chat-artifact-meta').textContent }; } return { rows: out, first: [...p.querySelectorAll('.chat-artifact-head')][0]?.textContent || '' }; })()`);
  check(`zh: the page the referee conversation SENT («${pp && pp.rows.pgreferee001 && pp.rows.pgreferee001.name}») is in «给你看的» (${pp && pp.first}); the page the person pasted is in «做出来的»`, !!pp && pp.rows.pgreferee001?.band === 'foryou' && pp.rows.pgpasted0001?.band === 'made' && pp.first === '给你看的 · 5', pp);
  await shot('1280-popover-zh-peer');
  console.log('  round 4: a TRAY ANSWER — the ask\'s page «给你看的», the person\'s own link «做出来的»; two homes\' folders told apart');
  await openPanel(OWNER_TRAY); await sleep(300);
  const pt = await evalJs(`(() => { const p = ${PANEL}; const out = {}; let band = ''; for (const n of p.querySelector('.af-list').children) { if (n.classList.contains('af-head-band')) band = n.dataset.band; else if (n.classList.contains('chat-artifact-row') && n._afRow && n._afRow.presented) out[n._afRow.page] = band; } const heads = [...p.querySelectorAll('.chat-artifact-head')].map((h) => h.textContent); return { rows: out, homes: heads.filter((h) => h.includes('/x · ')) }; })()`);
  check('zh: a tray answer — the page the ASK named («Review before merge») in «给你看的»; the person\'s own link in the answer lines in «做出来的»', !!pt && pt.rows.pgaskreview1 === 'foryou' && pt.rows.pgmynotes001 === 'made', pt);
  check(`zh: two homes\' folders, each «~/x», are two heads that SAY which: ${pt && pt.homes.join(' · ')}`, !!pt && pt.homes.slice().sort().join() === '/home/a/x · 3,/root/x · 3', pt && pt.homes);
  await shot('1280-popover-zh-tray');
  await evalJs(`(() => { const l = ${PANEL}.querySelector('.af-list'); const h = [...${PANEL}.querySelectorAll('.chat-artifact-head')].find((x) => x.textContent.startsWith('/home/a/x · ')); if (h) l.scrollTop += h.getBoundingClientRect().top - l.getBoundingClientRect().top - 40; return true; })()`); await sleep(200);
  await shot('1280-popover-zh-homes');
  console.log('④ the DESKTOP in ja (1280): the header by measure in the longest words');
  await evalJs(`localStorage.setItem('vibespace.lang', 'ja'); true`);
  await cdp('Page.reload', {}); await waitApp(); await sleep(1000);
  await reattach();
  await headLeg('ja');
  check('no page error during the walk', pageErrors.length === 0, pageErrors.slice(0, 3));
  console.log('⑤ THE DEVICE BUNDLE (W5): the reader bundled as build:agentd bundles it — every require resolved, the copy runs');
  const esb = require(path.join(repo, 'node_modules/esbuild'));
  const OFP = path.join(repo, 'src/harnesses/artifacts-of.js'), OFSRC = fs.readFileSync(OFP, 'utf8');
  const bundleOf = (contents, tag) => { const f = path.join(stubDir, `artifacts-of.${tag}.cjs`); esb.buildSync({ stdin: { contents, resolveDir: path.dirname(OFP), sourcefile: 'artifacts-of.js', loader: 'js' }, bundle: true, platform: 'node', external: ['node-pty'], outfile: f, logLevel: 'silent' }); return f; }; // the package.json build:agentd flags, written OUTSIDE src (beside no ../message-manager.js)
  const runTray = (f) => { try { const ops = require(f).claude(TRAY_REC); return ops.map((o) => o.page + ':' + (o.by || 'agent')).join(); } catch (e) { return 'threw ' + String(e && e.code || e && e.message).slice(0, 80); } };
  const unresolved = (code) => [...code.matchAll(/\b(?:require|lazy)\((?!\s*\(\)\s*=>)\s*(?:"\.{1,2}\/[^"]*"|[A-Za-z_$][\w$]*\s*\))/g)].map((m) => m[0]);
  const ofB = bundleOf(OFSRC, 'tip'), ofCode = fs.readFileSync(ofB, 'utf8');
  check(`the bundled reader carries no unresolved relative require (${unresolved(ofCode).length}) and RUNS the tray answer: ${runTray(ofB)}`, unresolved(ofCode).length === 0 && runTray(ofB) === 'pgaskreview1:agent,pgmynotes001:user', { left: unresolved(ofCode).slice(0, 5), ran: runTray(ofB) });
  const AGENTD = path.join(repo, 'data/bin/vibespace-agentd.js');
  if (fs.existsSync(AGENTD) && fs.statSync(AGENTD).mtimeMs >= fs.statSync(OFP).mtimeMs) { const a = fs.readFileSync(AGENTD, 'utf8'), i = a.indexOf('// src/harnesses/artifacts-of.js'), sec = i < 0 ? '' : a.slice(i, a.indexOf('\n// src/', i + 10)); check('the BUILT agentd bundle (data/bin/vibespace-agentd.js): the reader\'s section is there and carries no unresolved relative require', !!sec && unresolved(sec).length === 0, unresolved(sec).slice(0, 5)); }
  else console.log('  · the built agentd bundle is absent or older than the reader — the esbuild copy above is the check');
  const R3_LAZY = "const lazy = (p) => { let m = null; return () => m || (m = require(p)); };\nconst MM = lazy('../message-manager.js'), CMM = lazy('../codex-message-manager.js'), NOTE = lazy('../assistant-note.js');";
  const lazyAt = OFSRC.indexOf('const lazy = (load)'), lazyEnd = OFSRC.indexOf('\n', OFSRC.indexOf("NOTE = lazy(", lazyAt));
  const r3B = lazyAt >= 0 && lazyEnd > lazyAt ? bundleOf(OFSRC.slice(0, lazyAt) + R3_LAZY + OFSRC.slice(lazyEnd), 'r3') : null;
  check(`CONTROL r3's variable require (lazy(p)) ⇒ the bundled copy cannot resolve it (${r3B ? runTray(r3B) : 'needle missing'}) — RED`, !!r3B && unresolved(fs.readFileSync(r3B, 'utf8')).length > 0 && runTray(r3B).startsWith('threw'), r3B && runTray(r3B));
} catch (e) {
  failed++; console.error('✗ the walk threw: ' + (e && e.stack || e));
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
