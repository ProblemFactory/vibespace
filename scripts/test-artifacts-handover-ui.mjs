#!/usr/bin/env node
// A HELPER'S DELIVERABLE, SEEN END TO END ON A REAL PAGE (lane artifacts-handover-chrome, heavy; the fast half is
// test-artifacts-handover). A THROWAWAY server in a git worktree (own data/, a scratch HOME) + headless chrome over raw CDP
// (test-artifacts-chrome's skeleton). THREE stub `claude` chats behind the real chat-wrapper: "lead" (the one the user
// talks to — the page shows it), "helper" (same Task Group) and "outsider" (no group); each plays the step its user line
// names (STEP <id>) from a plan file, and runs the REAL shipped CLIs from its own session env:
//   ① lead's turn runs a Task whose sidechain (subagents/agent-<id>.jsonl + its meta's toolUseId) Writes notes.md ⇒ ONE
//     card at the Task result saying "By subagent <name>", the chip "Artifacts · 1"; a reload shows the same card once
//   ② helper (wrote report.md with Write, made a design with vibespace-design new) runs
//     `vibespace-msg send lead "设计好了" --artifact <design> <report.md>` ⇒ the CLI says both were handed over; lead's
//     chat gets the message (the waiting strip) AND two "Handed over by helper" cards, its Artifacts list both rows; the
//     Design window OPENS on the design (title = its name) and the Design home says "via helper"; helper's own rows
//     carry handedTo
//   ③ refusals through the real CLI: a path helper does not own / the outsider (no shared group) / 21 paths ⇒ refused
//     by name, nothing sent (lead's chat unchanged)
//   ④ `vibespace-design open <dir> --for lead` from helper = ②'s design part (card + window + home)
//   ⑤ zh at 390 px: the hand-over and subagent cards say 移交自 / 子代理, the chip and every card inside the viewport, no
//     card word clipped (rect census)
// Run: node scripts/test-artifacts-handover-ui.mjs   (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VNC_ENV = await vncEnv();
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome'); process.exit(0); }
const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('artifacts-handover-ui-wt');
const fakeHome = scratchHome('artifacts-handover-ui-home', fs);
const stubDir = scratch('artifacts-handover-ui-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = { lead: path.join(fakeHome, 'lead'), helper: path.join(fakeHome, 'helper'), outsider: path.join(fakeHome, 'outsider') };
for (const d of Object.values(CWD)) fs.mkdirSync(d, { recursive: true });
const SIDS = { lead: '5c3a0000-0000-4000-8000-0000000ab001', helper: '5c3a0000-0000-4000-8000-0000000ab002', outsider: '5c3a0000-0000-4000-8000-0000000ab003' };
const NOTES = path.join(CWD.lead, 'notes.md'), REPORT = path.join(CWD.helper, 'report.md'), OTHER = path.join(CWD.helper, 'other.md');
const LANDING = path.join(CWD.helper, 'designs/landing'), POSTER = path.join(CWD.helper, 'designs/poster');
fs.writeFileSync(OTHER, '# not written by the helper\n');
const SUB = path.join(fakeHome, '.claude/projects', CWD.lead.replace(/[^a-zA-Z0-9]/g, '-'), SIDS.lead, 'subagents'); // the CLI's sidechain layout
const RUNLOG = path.join(stubDir, 'run.log'), PLAN = path.join(stubDir, 'plan.json');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

// ── the plan: what each STEP plays (records on stdout; files on disk first; the real CLIs from the stub's own env) ──
const A = (id, content) => ({ type: 'assistant', message: { id, type: 'message', role: 'assistant', model: 'claude-fable-5', content, usage: { input_tokens: 1, output_tokens: 1 } } });
const R = (tid, extra = {}) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: 'ok' }] }, ...extra });
const say = (id, text) => A(id, [{ type: 'text', text }]);
const W = (id, file, content) => A('msg_' + id, [{ type: 'tool_use', id, name: 'Write', input: { file_path: file, content } }]);
const side = { type: 'assistant', uuid: 'side-1', timestamp: new Date().toISOString(), cwd: CWD.lead, sessionId: SIDS.lead, isSidechain: true, agentId: 'a01', message: { id: 'msg_side1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_S1', name: 'Write', input: { file_path: NOTES, content: '# Notes\n' } }] } };
const MANY = Array.from({ length: 21 }, (_, i) => ['--artifact', path.join(CWD.helper, `f${i}.md`)]).flat();
const STEPS = {
  a1: { disk: [[NOTES, '# Notes\n'], [path.join(SUB, 'agent-a01.jsonl'), JSON.stringify(side) + '\n'], [path.join(SUB, 'agent-a01.meta.json'), JSON.stringify({ agentType: 'general-purpose', description: 'Draft the notes', toolUseId: 'toolu_T1' })]],
    recs: [say('msg_a1', 'Delegating the notes.'), A('msg_a2', [{ type: 'tool_use', id: 'toolu_T1', name: 'Task', input: { description: 'Draft the notes', prompt: 'write notes.md', subagent_type: 'general-purpose' } }]),
      R('toolu_T1', { tool_use_result: { status: 'completed', agentId: 'a01' } }), say('msg_a3', 'Notes drafted.')] },
  b1: { run: [['vibespace-design', 'new', 'landing', '--title', 'Landing'], ['vibespace-design', 'new', 'poster', '--title', 'Poster']], disk: [[REPORT, '# Report\n\nthe landing page\n']],
    recs: [W('toolu_B1', REPORT, '# Report\n\nthe landing page\n'), R('toolu_B1'), say('msg_b1', 'Design started.')] },
  b2: { run: [['vibespace-msg', 'send', 'lead', '设计好了', '--artifact', LANDING, REPORT]], recs: [say('msg_b2', 'Handed over.')] },
  b3: { run: [['vibespace-msg', 'send', 'lead', 'not mine', '--artifact', OTHER], ['vibespace-msg', 'send', 'outsider', 'a stranger', '--artifact', REPORT], ['vibespace-msg', 'send', 'lead', 'too many', ...MANY]], recs: [say('msg_b3', 'Refusals tried.')] },
  b4: { run: [['vibespace-design', 'open', POSTER, '--for', 'lead']], recs: [say('msg_b4', 'Poster handed over.')] },
};
fs.writeFileSync(PLAN, JSON.stringify(STEPS));
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs'), path = require('path'), cp = require('child_process');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.274 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const CWD = process.cwd(), NAME = path.basename(CWD);
const SID = ${JSON.stringify(SIDS)}[NAME] || '5c3a0000-0000-4000-8000-0000000ab0ff';
const BIN = ${JSON.stringify(path.join(wt, 'data/bin'))};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: CWD, tools: [], permissionMode: 'default', claude_code_version: '2.1.274' });
const textOf = (c) => typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('') : '';
let n = 0, buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const k = n++;
    const id = (/STEP (\\w+)/.exec(textOf(m.message && m.message.content)) || [])[1];
    const st = (JSON.parse(fs.readFileSync(${JSON.stringify(PLAN)}, 'utf8')))[id] || {};
    for (const [f, c] of st.disk || []) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); } // the tool's own write, before its record
    for (const a of st.run || []) { // the REAL CLI over this session's env (VIBESPACE_API + its token)
      let rec;
      try { rec = { rc: 0, out: cp.execFileSync(process.execPath, [BIN + '/' + a[0], ...a.slice(1)], { cwd: CWD, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { rec = { rc: e.status, out: String(e.stdout || '') + String(e.stderr || e.message) }; }
      fs.appendFileSync(${JSON.stringify(RUNLOG)}, JSON.stringify({ who: NAME, step: id, argv: a.slice(0, 4), ...rec }) + '\\n');
    }
    const P = st.recs || [say0('turn ' + k)];
    let j = 0;
    const next = () => {
      if (j < P.length) { out({ ...P[j], session_id: SID, uuid: 'ho-' + NAME + '-' + k + '-' + j }); j++; setTimeout(next, 60); return; }
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 500, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
      setTimeout(() => fs.appendFileSync(${JSON.stringify(RUNLOG)}, JSON.stringify({ who: NAME, step: id, done: true }) + '\\n'), 300);
    };
    setTimeout(next, 150);
  }
});
function say0(t) { return { type: 'assistant', message: { id: 'msg_' + Math.random().toString(36).slice(2), type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: t }], usage: { input_tokens: 1, output_tokens: 1 } } }; }
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const runs = (step, all = false) => { try { return fs.readFileSync(RUNLOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.step === step && (all || !r.done)); } catch { return []; } };

const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
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
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; };

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
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.__sid))`;
const CARDS = `[...((${VIEW})?._messageList?.querySelectorAll('.chat-artifact-card') || [])]`;
const cardsNow = () => evalJs(`(${CARDS}).map((e) => ({ key: e.dataset.key, kind: e.dataset.kind, name: e.querySelector('.chat-artifact-name')?.textContent, meta: e.querySelector('.chat-artifact-meta')?.textContent }))`);
const CHIP = `(document.querySelector('.chat-status-artifacts')?.textContent?.trim() || '')`;
const designWins = (dir) => `[...app.wm.windows.values()].filter((w) => w._design && w._design.dir === ${JSON.stringify(dir)}).map((w) => ({ title: String(w.title || ''), shown: !!(w.el || w.element) }))`;
let ws = null, leadWid = null;
const wid = {};
const turn = async (who, step) => { // the stub logs `done` after its result record (the off-page helper has no view to watch)
  ws.send(JSON.stringify({ type: 'chat-input', sessionId: wid[who], text: `STEP ${step}` }));
  for (let i = 0; i < 120; i++) { if (runs(step, true).some((r) => r.done)) return true; await sleep(250); }
  return false;
};
const reattach = async () => {
  await waitApp(); await sleep(1000);
  await evalJs(`window.__sid = ${JSON.stringify(leadWid)}; if (!${VIEW}) app.attachSession(${JSON.stringify(leadWid)}, 'lead', ${JSON.stringify(CWD.lead)}, { mode: 'chat', backend: 'claude' }); true`);
  await waitFor(`!!(${VIEW})?._messageList`, 20000);
};
try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(800);
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.on('open', r));
  const frames = [];
  ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });

  console.log('setup: lead on the page (its own createSession); helper + outsider created off-page; lead + helper in ONE Task Group');
  await evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD.lead)}, name: 'lead', mode: 'chat', backend: 'claude' }); true`);
  for (let i = 0; i < 80 && !leadWid; i++) { leadWid = await evalJs(`([...app.sessions.values()].find((v) => v && v._messageList)?.sessionId) || null`); if (!leadWid) await sleep(250); }
  wid.lead = leadWid;
  await evalJs(`window.__sid = ${JSON.stringify(leadWid)}; true`);
  for (const name of ['helper', 'outsider']) {
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD[name], reqId: 'ho-' + name }));
    for (let i = 0; i < 80 && !wid[name]; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'ho-' + name) || frames.find((m) => m?.type === 'created' && !Object.values(wid).includes(m.sessionId)); if (f) wid[name] = f.sessionId; else await sleep(250); }
    ws.send(JSON.stringify({ type: 'rename-session', webuiId: wid[name], name }));
  }
  await sleep(1500); // each stub's init record binds its conversation id (the hand-over below proves the names resolve)
  check('three live stub chats (lead on the page, helper + outsider off it)', !!(leadWid && wid.helper && wid.outsider), wid);
  const tg = await api('POST', '/api/tasks', { title: 'Hand-over', sessions: ['claude:' + SIDS.lead, 'claude:' + SIDS.helper] });
  const tid = tg.body && tg.body.task && tg.body.task.id;
  const tgs = await api('GET', '/api/tasks');
  check('lead + helper share ONE Task Group (the outsider is in none)', ((tgs.body.tasks || []).find((t) => t.id === tid)?.sessions || []).length === 2, tgs.body);
  check('lead\'s chat window attaches on the page', await waitFor(`!!document.querySelector('.chat-view .chat-input') && !!(${VIEW})`, 20000));

  console.log('① lead\'s Task: its sidechain Writes notes.md ⇒ ONE card at the Task result, "By subagent …", the chip');
  check('lead\'s turn played (Task + its result carrying agentId)', await turn('lead', 'a1'));
  await waitFor(`(${CARDS}).length >= 1 && /Artifacts · 1/.test(${CHIP})`, 10000);
  const c1 = await cardsNow();
  check('ONE card for notes.md, saying "By subagent Draft the notes"', c1.length === 1 && c1[0].key === ':' + NOTES && /By subagent Draft the notes/.test(c1[0].meta || ''), c1);
  check('the chip reads "Artifacts · 1"', /Artifacts · 1/.test(await evalJs(CHIP)), await evalJs(CHIP));
  await cdp('Page.reload', {}); await reattach();
  await waitFor(`(${CARDS}).length >= 1`, 15000); await sleep(600);
  const c1r = await cardsNow();
  check('a reload shows the same card ONCE, still "By subagent Draft the notes"', c1r.length === 1 && c1r[0].key === ':' + NOTES && /By subagent Draft the notes/.test(c1r[0].meta || ''), c1r);

  console.log('② helper hands its design + report over with the REAL vibespace-msg send --artifact');
  check('helper\'s first turn played (vibespace-design new ×2 + a Write of report.md)', await turn('helper', 'b1'), runs('b1'));
  await evalJs(`[...app.wm.windows.values()].filter((w) => w._design).forEach((w) => { try { app.wm.close ? app.wm.close(w.id) : w.close(); } catch {} }); true`);
  check('no Design window on the page before the hand-over (helper\'s own design opens on ITS user\'s view, not lead\'s)', (await evalJs(designWins(LANDING))).length === 0, await evalJs(designWins(LANDING)));
  check('helper\'s hand-over turn played', await turn('helper', 'b2'));
  const r2 = runs('b2')[0] || {};
  check('the CLI says BOTH were handed over to "lead" (the design and report.md)', r2.rc === 0 && new RegExp(`handed over ${LANDING} \\(design\\) to "lead"`).test(r2.out) && new RegExp(`handed over ${REPORT} \\(doc\\) to "lead"`).test(r2.out) && !/NOT handed over/.test(r2.out), r2);
  await waitFor(`(${CARDS}).length >= 3`, 10000);
  const c2 = await cardsNow();
  const ho = c2.filter((c) => /Handed over by helper/.test(c.meta || ''));
  check('lead\'s chat gets TWO "Handed over by helper" cards — the design (named Landing) and report.md', ho.length === 2 && ho.some((c) => c.key === ':' + LANDING && c.kind === 'design' && c.name === 'Landing') && ho.some((c) => c.key === ':' + REPORT && c.name === 'report.md'), c2);
  check('…and the message itself: the strip says a group message from helper waits for lead\'s next turn', await waitFor(`/helper/.test((${VIEW})?._chatInput?._stashStrip?.el?.textContent || '') && !(${VIEW})._chatInput._stashStrip.el.hidden`, 10000), await evalJs(`(${VIEW})?._chatInput?._stashStrip?.el?.textContent || null`));
  check('lead\'s chip counts all three ("Artifacts · 3")', await waitFor(`/Artifacts · 3/.test(${CHIP})`, 8000), await evalJs(CHIP));
  const la = await api('GET', `/api/artifacts?sessionId=${encodeURIComponent(leadWid)}`);
  const lrow = (p) => (la.body?.items || []).find((b) => b.path === p);
  check('lead\'s Artifacts list both handed rows, via the hand-over from helper', ['design', 'doc'].every((k, i) => { const r = lrow([LANDING, REPORT][i]); return r && r.kind === k && r.via && r.via.kind === 'handover' && r.via.from?.name === 'helper'; }), la.body);
  const dw = await waitFor(`(${designWins(LANDING)}).length === 1`, 10000);
  const dws = await evalJs(designWins(LANDING));
  check('the Design window OPENS on the page for the design, titled by its name', dw && /Landing/.test(dws[0]?.title || ''), dws);
  await evalJs(`app.openDesign({}); true`);
  const homeRow = (name) => `[...document.querySelectorAll('.design-home *')].map((e) => e.closest('[class*="design-home-row"], li, .design-home-item') || e).find((e) => e.textContent.includes(${JSON.stringify(name)}) && /via helper/.test(e.textContent))`;
  check('the Design home lists Landing "via helper"', await waitFor(`!!(${homeRow('Landing')})`, 10000), await evalJs(`(document.querySelector('.design-home')?.textContent || '').slice(0, 600)`));
  const ha = await api('GET', `/api/artifacts?sessionId=${encodeURIComponent(wid.helper)}`);
  const hrow = (p) => (ha.body?.items || []).find((b) => b.path === p);
  check('helper\'s own rows carry handedTo lead', [LANDING, REPORT].every((p) => JSON.stringify(hrow(p)?.handedTo || '').includes('lead')), ha.body);

  console.log('③ refusals through the real CLI: not its file / an outsider / 21 paths ⇒ refused by name, nothing sent');
  const before3 = (await cardsNow()).length;
  check('helper\'s refusal turn played', await turn('helper', 'b3'));
  const [nm, os, tm] = runs('b3');
  check('a path helper does not own ⇒ refused (not-yours): "NOT handed over", the path named, nothing sent', nm && nm.rc !== 0 && /not-yours/.test(nm.out) && nm.out.includes(OTHER) && /nothing was sent/.test(nm.out) && /NOT handed over/.test(nm.out), nm);
  check('the outsider (no shared group) ⇒ refused by name', os && os.rc !== 0 && /unreachable|not-found/.test(os.out) && /outsider/.test(os.out), os);
  check('21 paths ⇒ refused (too-many): "NOT handed over", nothing sent', tm && tm.rc !== 0 && /too-many/.test(tm.out) && /\b21\b/.test(tm.out) && /nothing was sent/.test(tm.out) && /NOT handed over/.test(tm.out), tm);
  await sleep(800);
  check('lead\'s chat unchanged by the refusals (no new card)', (await cardsNow()).length === before3, await cardsNow());

  console.log('④ vibespace-design open <dir> --for lead = the same design hand-over');
  check('helper\'s open --for turn played', await turn('helper', 'b4'));
  const r4 = runs('b4')[0] || {};
  check('the CLI says the poster was handed over to "lead"', r4.rc === 0 && new RegExp(`handed ${POSTER} over to "lead"`).test(r4.out), r4);
  await waitFor(`(${CARDS}).some((e) => e.dataset.key === ${JSON.stringify(':' + POSTER)})`, 10000);
  const c4 = (await cardsNow()).find((c) => c.key === ':' + POSTER);
  check('lead\'s chat gets the Poster design card, "Handed over by helper"', c4 && c4.kind === 'design' && c4.name === 'Poster' && /Handed over by helper/.test(c4.meta || ''), await cardsNow());
  check('the Design window opens on the poster, titled Poster', await waitFor(`(${designWins(POSTER)}).some((w) => /Poster/.test(w.title))`, 10000), await evalJs(designWins(POSTER)));
  await evalJs(`app.openDesign({}); true`);
  check('the Design home lists Poster "via helper"', await waitFor(`!!(${homeRow('Poster')})`, 10000), await evalJs(`(document.querySelector('.design-home')?.textContent || '').slice(0, 600)`));

  console.log('⑤ zh at 390 px: the cards say 移交自 / 子代理; the chip and the cards inside the viewport, no word clipped');
  await evalJs(`localStorage.setItem('vibespace.lang', 'zh'); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.reload', {}); await reattach();
  await waitFor(`(${CARDS}).length >= 4`, 20000); await sleep(600);
  const z = await cardsNow();
  check('zh: the hand-over cards say "移交自 helper", the subagent card "子代理 Draft the notes"', z.filter((c) => /移交自 helper/.test(c.meta || '')).length === 3 && /子代理 Draft the notes/.test(z.find((c) => c.key === ':' + NOTES)?.meta || '') && !z.some((c) => /Handed over|By subagent/.test(c.meta || '')), z);
  const census = await evalJs(`(() => {
    const vw = innerWidth, bad = [];
    const inV = (r) => r.width > 0 && r.left >= -0.5 && r.right <= vw + 0.5;
    for (const e of ${CARDS}) {
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      if (!inV(r)) bad.push(['card', e.dataset.key, Math.round(r.left), Math.round(r.right)]);
      for (const sel of ['.chat-artifact-kind', '.chat-artifact-name', '.chat-artifact-meta']) {
        const c = e.querySelector(sel); if (!c) { bad.push(['missing', sel, e.dataset.key]); continue; }
        const q = c.getBoundingClientRect();
        if (!(q.width > 0 && q.left >= r.left - 0.5 && q.right <= r.right + 0.5)) bad.push(['outside', sel, e.dataset.key, Math.round(q.left), Math.round(q.right), Math.round(r.right)]);
        if (sel === '.chat-artifact-meta' && c.scrollWidth > c.clientWidth + 1) bad.push(['clipped', sel, e.dataset.key, c.scrollWidth, c.clientWidth, c.textContent]);
      }
    }
    // the phone's status bar is ONE swipe line (chat.css, max-width 768px): the chip may rest past the edge — judged once
    // the bar scrolls it in (its words whole), its resting x reported
    const chip = document.querySelector('.chat-status-artifacts');
    const rest = chip ? Math.round(chip.getBoundingClientRect().left) : null;
    if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const cr = chip && chip.getBoundingClientRect(), ct = chip && chip.querySelector('.chat-status-artifacts-text');
    if (!chip || !inV(cr) || (ct && ct.scrollWidth > ct.clientWidth + 1)) bad.push(['chip', chip ? [Math.round(cr.left), Math.round(cr.right)] : null]);
    return { vw, bad, chip: chip && chip.textContent.trim(), rest, n: ${CARDS}.length };
  })()`);
  check('rect census at 390 px: every card and its kind / name / meta inside the viewport, no meta clipped; the chip (scrolled into the swipe bar) readable and counting 4', census.n >= 4 && census.bad.length === 0 && /4/.test(census.chip || ''), census);
  await evalJs(`localStorage.removeItem('vibespace.lang'); true`);
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('✗ threw:', e && e.stack || e);
}
console.log(`\n${passed} passed, ${failed} failed`);
cleanup();
process.exit(failed ? 1 : 0);
