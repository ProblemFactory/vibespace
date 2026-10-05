#!/usr/bin/env node
// test-doc-window — THE DOC WINDOW IN A REAL BROWSER (heavy; lane doc-window, 2.369.215). A throwaway server from a
// `git archive` of HEAD overlaid with the working tree under a scratch root (its own data/, a scratch HOME), built there
// (public/doc-editor.js included); a STUB claude speaking stream-json that runs command files as the agent (never a real
// CLI, no vendor key); headless Chrome (a scratch profile, its own DISPLAY, a PRIVATE XDG_RUNTIME_DIR and HOME) driving
// the REAL client over CDP.
//   ① the agent writes docs/BRIEF.md; a link from the chat opens it as the Doc window BESIDE the chat, rendered
//   ② a real click + typed words in the rendered view, Ctrl+S ⇒ the file on disk is the serializer's output (exactly
//      the one line changed) and the stub's next turn (its prompt-context) carries `[Doc edit] <path>: +1 −1 lines; …` (the registry's note)
//   ③ the agent rewrites the file ⇒ an in-place repaint (the same editor element, an unchanged list node kept, the
//      scroll kept) · ④ with unsaved edits ⇒ the bar; Keep editing ⇒ the save ASKS before overwriting (disk untouched
//      until yes); Reload ⇒ the agent's version, the edits gone · ⑤ a real double-click selection → Comment → a note,
//      twice → Send all ⇒ ONE `[Doc comments]` message on the stub's stdin, the strip empty · ⑥ Raw toggles the code
//      editor in place · ⑦ a table file opens RAW with the chip (the file untouched) · ⑧ zh at 390 px: the bar fits, 44 px
//      targets, the strip is a bottom sheet; PNGs after-edit-zh.png + after-comment-zh.png into $VS_DOC_WINDOW_SHOTS.
// Run: node scripts/test-doc-window.mjs   (SKIPs with evidence when google-chrome is absent; ~1 min)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratchDir, freePorts, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

const REPO = process.cwd();
const require = createRequire(path.join(REPO, 'package.json'));
const WebSocket = require('ws');
const CHROME = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const VNC_ENV = await vncEnv();
const [PORT, CDP] = await freePorts(2);
const ROOT = scratchDir('docwin');
const WT = path.join(ROOT, 'wt'), BIN = path.join(ROOT, 'bin'), HOME = path.join(ROOT, 'home'), PROJ = path.join(ROOT, 'proj');
const CMDS = path.join(ROOT, 'cmds'), OUT = path.join(ROOT, 'out'), CHOME = path.join(ROOT, 'chrome-home'), CXDG = path.join(ROOT, 'chrome-xdg');
for (const d of [WT, BIN, HOME, PROJ, path.join(PROJ, 'docs'), CMDS, OUT, CHOME, path.join(HOME, '.claude'), path.join(HOME, '.config')]) fs.mkdirSync(d, { recursive: true });
fs.mkdirSync(CXDG, { recursive: true, mode: 0o700 });
const SHOTS = process.env.VS_DOC_WINDOW_SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, step = 150) => { const end = Date.now() + ms; while (Date.now() < end) { let v = null; try { v = await fn(); } catch { v = null; } if (v) return v; await sleep(step); } return null; };
const S = JSON.stringify;
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : S(e)).slice(0, 900) : '')); } return !!c; };
const section = (t) => console.log('\n' + t);
if (!CHROME) { console.log('SKIP (no chrome): the Doc window\'s browser gate needs google-chrome / chromium'); process.exit(0); }

// ── the tree ──
const HEAD = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
execFileSync('sh', ['-c', `git -C ${S(REPO)} archive HEAD | tar -x -C ${S(WT)}`]);
for (const f of ['src', 'public', 'docs', 'server.js', 'package.json']) execFileSync('sh', ['-c', `rm -rf ${S(path.join(WT, f))} && cp -r ${S(path.join(REPO, f))} ${S(path.join(WT, f))}`]);
execFileSync('sh', ['-c', `cp -r ${S(path.join(REPO, 'data/bin') + '/.')} ${S(path.join(WT, 'data/bin'))}`]);
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(WT, 'node_modules'));
const buildSteps = JSON.parse(fs.readFileSync(path.join(WT, 'package.json'), 'utf8')).scripts.build.split(' && ').filter((x) => !/^node scripts\//.test(x));
const tb = Date.now();
execFileSync('sh', ['-c', buildSteps.join(' && ')], { cwd: WT, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, HOME, PATH: path.join(WT, 'node_modules/.bin') + ':' + process.env.PATH } });
console.log(`[doc-window] root ${ROOT} · tree HEAD ${HEAD.slice(0, 8)} + the working tree · built in ${((Date.now() - tb) / 1000).toFixed(1)} s · doc-editor.js ${(fs.statSync(path.join(WT, 'public/doc-editor.js')).size / 1024).toFixed(1)} KB`);
const DM = require(path.join(WT, 'src/doc-model.js'));
const MD = await import(pathToFileURL(path.join(WT, 'src/lib/doc-markdown.js')).href);

// ── the stub claude: stream-json init, every stdin line logged, COMMAND FILES run as the agent ──
fs.writeFileSync(path.join(BIN, 'claude'), `#!${process.execPath}
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = ${S(ROOT)};
const args = process.argv.slice(2);
if (args.includes('--version') || args[0] === '-v') { process.stdout.write('2.1.281 (Claude Code)\\n'); process.exit(0); }
fs.appendFileSync(ROOT + '/stub-env.ndjson', JSON.stringify({ pid: process.pid, args, api: !!process.env.VIBESPACE_API, token: !!process.env.VIBESPACE_SESSION_TOKEN }) + '\\n');
if (!args.includes('--output-format')) { setInterval(() => {}, 1e6); return; }
const SID = 'e2e00000-0000-4000-8000-' + String(process.pid).padStart(12, '0');
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
setTimeout(() => out({ type: 'system', subtype: 'init', session_id: SID, cwd: process.cwd(), model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [], permissionMode: 'default' }), 50);
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); fs.appendFileSync(ROOT + '/stub-stdin.ndjson', line + '\\n'); } });
const done = new Set();
setInterval(() => {
  let names = [];
  try { names = fs.readdirSync(ROOT + '/cmds').filter((n) => n.endsWith('.json')); } catch { return; }
  for (const n of names.sort()) {
    if (done.has(n)) continue; done.add(n);
    let c = null; try { c = JSON.parse(fs.readFileSync(ROOT + '/cmds/' + n, 'utf8')); } catch { continue; }
    (async () => {
      let res;
      try {
        if (c.kind === 'write') { for (const [fp, text] of c.files) { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, text); } res = { ok: true }; }
        else if (c.kind === 'http') { const r = await fetch(process.env.VIBESPACE_API + c.path, { method: c.method || 'GET', headers: { Authorization: 'Bearer ' + process.env.VIBESPACE_SESSION_TOKEN } }); const t = await r.text(); let b = t; try { b = JSON.parse(t); } catch {} res = { status: r.status, body: b }; }
        else res = { error: 'unknown kind' };
      } catch (e) { res = { error: e.message }; }
      fs.writeFileSync(ROOT + '/out/' + n + '.tmp', JSON.stringify({ sid: SID, ...res }));
      fs.renameSync(ROOT + '/out/' + n + '.tmp', ROOT + '/out/' + n);
    })();
  }
}, 120);
setInterval(() => {}, 1e6);
`, { mode: 0o755 });

// ── the server ──
const journal = [];
const srv = spawn(process.execPath, ['server.js'], { cwd: WT, env: { ...process.env, ...VNC_ENV, HOME, PORT: String(PORT), CLAUDE_CMD: path.join(BIN, 'claude'), PATH: BIN + ':' + process.env.PATH, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', VIBESPACE_OPENCODE_SERVE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => journal.push(String(d))); srv.stderr.on('data', (d) => journal.push(String(d)));
let chrome = null, ws = null, cdp = null, cleaned = false;
const cleanup = () => {
  if (cleaned) return []; cleaned = true;
  try { cdp && cdp.close(); } catch { } try { ws && ws.close(); } catch { }
  try { chrome && chrome.kill('SIGKILL'); } catch { } try { srv.kill('SIGKILL'); } catch { }
  const ended = endRootedProcesses(ROOT);
  try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { }
  return ended;
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const base = `http://127.0.0.1:${PORT}`;
let cmdN = 0;
async function stub(c, { timeout = 30000 } = {}) {
  const n = String(++cmdN).padStart(4, '0') + '.json';
  fs.writeFileSync(path.join(CMDS, n + '.tmp'), S(c)); fs.renameSync(path.join(CMDS, n + '.tmp'), path.join(CMDS, n));
  return (await until(() => fs.existsSync(path.join(OUT, n)) && JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8')), timeout, 100)) || { error: 'the stub did not answer', cmd: c };
}
const stdinTexts = () => {
  const f = path.join(ROOT, 'stub-stdin.ndjson'); if (!fs.existsSync(f)) return [];
  const out = [];
  for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) { try { const o = JSON.parse(l); const c = o.message && o.message.content; if (typeof c === 'string') out.push(c); else if (Array.isArray(c)) for (const x of c) if (x && x.type === 'text') out.push(x.text); } catch { } }
  return out;
};

const FILLER = Array.from({ length: 40 }, (_, i) => `Filler line ${i + 1}.`).join('\n\n');
const BRIEF = `# Launch brief\n\nIntro paragraph.\n\n## Goals\n\n- ship the rendered view\n- keep the agent informed\n\n## Plan\n\nParagraph P0.\n\n1. read\n2. edit\n\n> a quote\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n## Notes\n\n${FILLER}\n`;
const TABLE = '# Prices\n\n| item | cost |\n|------|-----:|\n| a    | 1    |\n';
let P, TP, SIDW, CONV;
try {
  section('§0 the throwaway server + the stub agent + the real client');
  const up = await until(async () => { try { return (await fetch(base + '/api/version')).ok; } catch { return false; } }, 60000, 300);
  if (!ok(!!up, `the throwaway server answered on :${PORT}`, journal.join('').slice(-1500))) throw new Error('no server');
  ok(MD.docFidelity(BRIEF).ok && !MD.docFidelity(TABLE).ok, 'fixtures: the brief is lossless, the table file is not');
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = [];
  ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  ws.send(S({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 80, rows: 24, reqId: 'dw1', name: 'Doc window' }));
  const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'dw1'), 20000);
  if (!ok(!!created && !!created.sessionId, 'a chat session was created on the stub claude', msgs.slice(-5))) throw new Error('no session');
  SIDW = created.sessionId;
  const inited = await until(() => fs.existsSync(path.join(ROOT, 'stub-env.ndjson')) && fs.readFileSync(path.join(ROOT, 'stub-env.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.args.includes('--output-format')), 15000);
  CONV = inited && 'e2e00000-0000-4000-8000-' + String(inited.pid).padStart(12, '0');
  P = path.join(fs.realpathSync(PROJ), 'docs', 'BRIEF.md'); TP = path.join(fs.realpathSync(PROJ), 'docs', 'TABLE.md');
  const wrote = await stub({ kind: 'write', files: [[P, BRIEF], [TP, TABLE]] });
  ok(wrote.ok && fs.readFileSync(P, 'utf8') === BRIEF, 'the agent (stub) wrote docs/BRIEF.md + docs/TABLE.md', wrote);

  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: CHOME, XDG_RUNTIME_DIR: CXDG, DISPLAY: ':' + (7000 + (CDP % 1000)) } });
  const target = await until(async () => { try { return (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { return null; } }, 30000, 250);
  if (!ok(!!target, 'headless chrome (scratch profile, own DISPLAY, private XDG_RUNTIME_DIR + HOME) exposed a page target')) throw new Error('no chrome');
  cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map(); const pageErrors = [];
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(S({ id, method, params })); });
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception'); });
  const call = async (method, params = {}) => { const m = await send(method, params); if (m.error) throw new Error(method + ': ' + m.error.message); return m.result; };
  const ev = async (js) => { const r = await call('Runtime.evaluate', { expression: `(async () => { const app = window.app; ${js} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval threw'); return r.result?.value; };
  const mouse = (type, x, y, extra = {}) => call('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  const click = async (p, n = 1) => { await mouse('mouseMoved', p.x, p.y, { button: 'none' }); for (let i = 1; i <= n; i++) { await mouse('mousePressed', p.x, p.y, { clickCount: i }); await mouse('mouseReleased', p.x, p.y, { clickCount: i }); } await sleep(150); };
  const type = (text) => call('Input.insertText', { text });
  const ctrlS = async () => { await call('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 }); };
  const shot = async (name) => { if (!SHOTS) return null; const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(SHOTS, name); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  const DW = (p) => `[...app.wm.windows.values()].find((x) => x.type === 'doc' && x._filePath === ${S(p)})`;
  const W = DW(P);
  const rectIn = (sel, p = P) => ev(`const w = ${DW(p)}; const e = w && w.content.querySelector(${S(sel)}); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height, text: e.textContent };`);
  const pmText = (p = P) => ev(`const w = ${DW(p)}; const e = w && w.content.querySelector('.doc-page .ProseMirror'); return e ? e.textContent : null;`);
  async function boot(width, height, mobile) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await call('Page.navigate', { url: base + '/' });
    const b = await until(async () => ev(`if (!app || !app.ready) return false; await app.ready; return true;`), 60000, 300);
    await sleep(800);
    await ev(`app.attachSession(${S(SIDW)}, 'Doc window', ${S(PROJ)}, { mode: 'chat', backend: 'claude' }); return true;`);
    return b && until(() => ev(`for (const [id, v] of app.sessions) if (v.sessionId === ${S(SIDW)}) return id; return null;`), 15000);
  }
  await call('Page.enable'); await call('Runtime.enable');
  const chatWin = await boot(1280, 900, false);
  if (!ok(!!chatWin, 'the client booted (1280×900) with the conversation\'s chat window open')) throw new Error('no app');

  section('§1 a link from the chat opens the Doc window beside it, rendered');
  await ev(`app.openFile(${S(P)}, 'BRIEF.md', { from: ${S(chatWin)} }); return true;`);
  const opened = await until(() => ev(`const w = ${W}; if (!w) return null; const pm = w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelector('h1') ? { spec: w._openSpec, h1: pm.querySelector('h1').textContent, lis: pm.querySelectorAll('li').length, pre: !!pm.querySelector('pre'), quote: !!pm.querySelector('blockquote'), raw: w.content.querySelector('.doc-raw').hidden, chip: w.content.querySelector('.doc-chip').hidden, chain: !!w._tabChain || !!(app.wm.windows.get(${S(chatWin)}) || {})._tabChain } : null;`), 20000, 200);
  if (!opened) console.log('    diag:', S(await ev(`return { wins: [...app.wm.windows.values()].map((w) => [w.type, w._filePath || '', w.content && w.content.querySelector('.doc-window') ? w.content.querySelector('.doc-window').textContent.slice(0, 200) : '']), errs: (window.__errs || []) };`)), pageErrors.slice(0, 3));
  ok(!!opened && opened.spec.action === 'openDoc' && opened.spec.path === P && opened.spec.from === SIDW && opened.h1 === 'Launch brief' && opened.lis === 4 && opened.pre && opened.quote && opened.raw && opened.chip, 'type doc, openSpec {openDoc, path, from: the chat session}; headings / lists / code / quote rendered; no raw, no chip', opened);
  ok(!!opened && opened.chain, 'it opened beside the chat (the link placement)', opened);
  const owner = await until(() => ev(`const w = ${W}; const o = w.content.querySelector('.doc-owner'); return o && o.hidden ? 'owned' : null;`), 5000);
  ok(owner === 'owned', 'the owner is known (the `from` chat) — the strip carries no "open from a chat" line');

  section('§2 type in the rendered view, save ⇒ the serializer\'s output on disk + the agent\'s next turn learns it');
  const p0 = await rectIn('.doc-page .ProseMirror > p');
  await click({ x: p0.right - 4, y: p0.y }); await sleep(300); await click({ x: p0.right - 4, y: p0.y });
  const focus0 = await ev(`const a = document.activeElement; return { cls: a && a.className, tag: a && a.tagName, sel: (() => { const s = getSelection(); return s.anchorNode ? s.anchorNode.textContent.slice(0, 40) + '@' + s.anchorOffset : null; })(), at: (() => { const e = document.elementFromPoint(${p0.right - 4}, ${p0.y}); return e && (e.className || e.tagName); })() };`);
  await type(' EDITED-1'); await sleep(200);
  ok((await pmText()).includes('Intro paragraph. EDITED-1'), 'the words landed in the rendered paragraph', { focus0, p0, widths: await ev(`const w = ${W}; const q = (s) => { const e = w.content.querySelector(s); return e ? Math.round(e.getBoundingClientRect().width) : null; }; return { content: Math.round(w.content.getBoundingClientRect().width), root: q('.doc-window'), main: q('.doc-main'), pane: q('.doc-pane'), page: q('.doc-page'), strip: q('.doc-strip') };`) });
  await ctrlS();
  const want1 = BRIEF.replace('Intro paragraph.', 'Intro paragraph. EDITED-1');
  const disk1 = await until(() => { const s = fs.readFileSync(P, 'utf8'); return s !== BRIEF ? s : null; }, 8000);
  ok(disk1 === want1 && disk1 === DM.saveText(MD.roundTrip(want1), BRIEF), 'Ctrl+S ⇒ the file on disk is the serializer\'s output — exactly the typed line changed', disk1 && disk1.slice(0, 120));
  const st1 = await until(() => ev(`const w = ${W}; const s = w.content.querySelector('.doc-stamp').textContent; return /next turn/.test(s) ? s : null;`), 5000);
  ok(!!st1, 'the stamp says the chat sees the edit on its next turn', st1);
  const pc = await stub({ kind: 'http', method: 'GET', path: '/api/agent/prompt-context' });
  const pcText = pc && pc.body && (pc.body.text || pc.body.context || (typeof pc.body === 'string' ? pc.body : S(pc.body)));
  ok(pc.status === 200 && (pcText || '').includes(`[Doc edit] ${P}: +1 −1 lines; sections: Launch brief`) && /the user edited a document/.test(pcText || ''), 'the stub agent\'s next turn (its prompt-context) carries "[Doc edit] <path>: +1 −1 lines; sections: Launch brief" (the registry\'s note)', (pcText || '').slice(0, 500));
  ok(!stdinTexts().some((t) => t.includes('[Doc edit]')), 'the edit note opened no turn (nothing typed into the agent)');

  section('§3 the agent rewrites the file ⇒ an in-place repaint, the scroll kept');
  await ev(`const w = ${W}; const pane = w.content.querySelector('.doc-pane'); pane.scrollTop = 300; const pm = w.content.querySelector('.ProseMirror'); pm.__keep = 1; pm.querySelector('ul').__keep = 1; return pane.scrollTop;`);
  const top0 = await ev(`return ${W}.content.querySelector('.doc-pane').scrollTop;`);
  const agent2 = fs.readFileSync(P, 'utf8').replace('Paragraph P0.', 'Paragraph P0 rewritten by the agent.');
  await stub({ kind: 'write', files: [[P, agent2]] });
  const rep = await until(() => ev(`const w = ${W}; const pm = w.content.querySelector('.ProseMirror'); return pm.textContent.includes('rewritten by the agent') ? { keep: pm.__keep, ul: pm.querySelector('ul').__keep, top: w.content.querySelector('.doc-pane').scrollTop, bar: w.content.querySelector('.doc-conflict').hidden, dirty: w._editorDirty() } : null;`), 8000, 200);
  ok(!!rep && rep.keep === 1 && rep.ul === 1 && rep.bar && rep.dirty === false, 'repainted IN PLACE within the 2 s watch: the same editor element, the unchanged list node kept, no bar, still clean', rep);
  ok(!!rep && top0 > 0 && Math.abs(rep.top - top0) <= 2, `the scroll kept (${top0} → ${rep && rep.top})`);

  section('§4 unsaved edits + the agent writes ⇒ the bar; Keep editing ⇒ the save asks; Reload ⇒ the agent\'s version');
  await ev(`${W}.content.querySelector('.doc-pane').scrollTop = 0; return true;`); await sleep(100);
  const pPlan = await ev(`const w = ${W}; const p = [...w.content.querySelectorAll('.ProseMirror > p')].find((x) => x.textContent.includes('rewritten by the agent')); const r = p.getBoundingClientRect(); return { x: r.right - 4, y: r.top + r.height / 2 };`);
  await click(pPlan); await type(' USER-2'); await sleep(150);
  const agent3 = fs.readFileSync(P, 'utf8').replace('Filler line 1.', 'Filler line 1 (agent).');
  await stub({ kind: 'write', files: [[P, agent3]] });
  const bar = await until(() => ev(`const w = ${W}; const b = w.content.querySelector('.doc-conflict'); return b.hidden ? null : { text: b.textContent, pm: w.content.querySelector('.ProseMirror').textContent };`), 8000, 200);
  ok(!!bar && /agent changed this file/.test(bar.text) && bar.pm.includes('USER-2') && !bar.pm.includes('(agent)'), 'the bar shows; the rendered view keeps the user\'s edit (no silent reload)', bar && bar.text);
  await click(await rectIn('.doc-keep'));
  ok(await ev(`return ${W}.content.querySelector('.doc-conflict').hidden;`), 'Keep editing hides the bar');
  await click(await rectIn('.doc-save-btn'));
  const ask = await until(() => ev(`const o = [...document.querySelectorAll('.dialog-overlay')].find((x) => /newer version/.test(x.textContent)); if (!o) return null; const b = [...o.querySelectorAll('button')].find((x) => x.textContent === 'Overwrite'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`), 5000);
  ok(!!ask && fs.readFileSync(P, 'utf8') === agent3, 'the save ASKS "Overwrite the agent\'s newer version?" — the disk still holds the agent\'s version', ask);
  if (ask) await click(ask);
  const disk3 = await until(() => { const s = fs.readFileSync(P, 'utf8'); return s.includes('USER-2') ? s : null; }, 6000);
  ok(!!disk3 && !disk3.includes('(agent)') && disk3.includes('rewritten by the agent. USER-2'), 'yes ⇒ the user\'s version on disk (the agent\'s newer one replaced only after the ask)');
  await sleep(2500);
  await click(await ev(`const w = ${W}; const p = [...w.content.querySelectorAll('.ProseMirror > p')].find((x) => x.textContent.includes('USER-2')); const r = p.getBoundingClientRect(); return { x: r.right - 4, y: r.top + r.height / 2 };`));
  await type(' USER-3'); await sleep(150);
  await stub({ kind: 'write', files: [[P, fs.readFileSync(P, 'utf8').replace('Filler line 2.', 'Filler line 2 (agent).')]] });
  const bar2 = await until(() => ev(`const b = ${W}.content.querySelector('.doc-conflict'); return b.hidden ? null : true;`), 8000, 200);
  if (bar2) await click(await rectIn('.doc-reload'));
  const rl = await until(() => ev(`const w = ${W}; const t = w.content.querySelector('.ProseMirror').textContent; return t.includes('Filler line 2 (agent).') ? { u3: t.includes('USER-3'), dirty: w._editorDirty(), bar: w.content.querySelector('.doc-conflict').hidden } : null;`), 6000);
  ok(!!bar2 && !!rl && !rl.u3 && rl.dirty === false && rl.bar, 'Reload ⇒ the agent\'s version, the unsaved edit gone, clean', rl);

  section('§5 select → Comment → a note, twice → Send all ⇒ ONE message in the chat');
  async function comment(sel, wordFrac, note, p = P) {
    const r = await rectIn(sel, p);
    await click({ x: r.left + wordFrac, y: r.y }, 2); await sleep(500);
    const b = await until(() => ev(`const b = document.querySelector('.doc-cpop .doc-comment-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, sel: String(getSelection()) };`), 4000);
    if (!b) return { error: 'no Comment button', sel: await ev('return String(getSelection());') };
    await click(b);
    await until(() => ev(`return document.activeElement && document.activeElement.tagName === 'TEXTAREA';`), 3000);
    await type(note);
    const add = await until(() => ev(`const a = document.querySelector('.doc-note-add'); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`), 3000);
    await click(add); await sleep(200);
    return { sel: b.sel };
  }
  const c1 = await comment('.ProseMirror h2', 12, 'make this punchier');
  const c2 = await comment('.ProseMirror ul li p', 40, 'add a date');
  const strip = await ev(`const w = ${W}; return [...w.content.querySelectorAll('.doc-cmt')].map((e) => ({ q: e.querySelector('.doc-cmt-q') && e.querySelector('.doc-cmt-q').textContent, n: e.querySelector('.doc-cmt-n').textContent }));`);
  ok(strip.length === 2 && strip[0].n === 'make this punchier' && strip[1].n === 'add a date' && !!strip[0].q && !!strip[1].q, 'two comments in the strip (quote + note), keyed rows', { c1, c2, strip });
  ok(await ev(`return !!localStorage.getItem('vs-doc-comments:' + '\\u0001' + ${S(P)});`), 'the strip is device-kept per (host, path)');
  const before = stdinTexts().length;
  await click(await rectIn('.doc-send'));
  const sent = await until(() => stdinTexts().slice(before).filter((t) => t.startsWith('[Doc comments]')), 8000);
  const want = `[Doc comments] ${P}\n① "${strip[0].q}" — make this punchier\n② "${strip[1].q}" — add a date`;
  ok(!!sent && sent.length === 1 && sent[0] === want, 'Send all ⇒ exactly ONE message on the agent\'s stdin, in the contract\'s shape', sent || stdinTexts().slice(-2));
  await sleep(500);
  ok(stdinTexts().slice(before).length === 1 && (await ev(`return ${W}.content.querySelectorAll('.doc-cmt').length;`)) === 0 && !(await ev(`return localStorage.getItem('vs-doc-comments:' + '\\u0001' + ${S(P)});`)), 'one message only; the strip and its device copy are empty after');

  section('§6 Raw = the code editor in place, and back');
  await click(await rectIn('.doc-raw-btn'));
  const raw = await until(() => ev(`const w = ${W}; const r = w.content.querySelector('.doc-raw'); const cm = r && r.querySelector('.cm-content'); return !r.hidden && cm && cm.textContent.includes('Filler line 2 (agent).') ? { pane: w.content.querySelector('.doc-pane').hidden, pressed: w.content.querySelector('.doc-raw-btn').getAttribute('aria-pressed') } : null;`), 8000);
  ok(!!raw && raw.pane && raw.pressed === 'true', 'Raw shows the CodeEditor on the same file in this window (aria-pressed)', raw);
  await click(await rectIn('.doc-raw-btn'));
  const back = await until(() => ev(`const w = ${W}; return !w.content.querySelector('.doc-pane').hidden && w.content.querySelector('.doc-raw').hidden ? true : null;`), 5000);
  ok(!!back, 'pressed again ⇒ back to the rendered view');

  section('§7 a table file opens RAW with the chip, untouched');
  await ev(`app.openFile(${S(TP)}, 'TABLE.md', { from: ${S(chatWin)} }); return true;`);
  const tw = await until(() => ev(`const w = ${DW(TP)}; if (!w) return null; const c = w.content.querySelector('.doc-chip'); const cm = w.content.querySelector('.doc-raw .cm-content'); return !c.hidden && cm && cm.textContent.includes('| item |') ? { chip: c.textContent, pane: w.content.querySelector('.doc-pane').hidden } : null;`), 10000);
  ok(!!tw && /rich editor would change — editing raw/.test(tw.chip) && /a table/.test(tw.chip) && tw.pane, 'the table file opens raw and the chip says why', tw);
  await sleep(2500);
  ok(fs.readFileSync(TP, 'utf8') === TABLE, 'the table file was never written');
  ok(pageErrors.length === 0, 'no uncaught exception in the page (desktop legs)', pageErrors.slice(0, 4));

  section('§8 zh at 390 px (a phone): the bar fits, 44 px targets, the strip is a bottom sheet');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
  const chatWin2 = await boot(390, 844, true);
  ok(!!chatWin2 && (await ev('return app.isMobile === true;')), 'the client booted as a phone in zh');
  await ev(`for (const w of [...app.wm.windows.values()]) if (w.type === 'doc') app.wm.closeWindow(w.id); return true;`); await sleep(300); // the layout restore brought the desktop's Doc windows back as tabs
  await ev(`app.openFile(${S(P)}, 'BRIEF.md', { from: ${S(chatWin2)} }); return true;`);
  const ph = await until(() => ev(`const w = ${W}; if (!w || !w.content.offsetParent) return null; const pm = w.content.querySelector('.ProseMirror'); return pm && pm.querySelector('h1') ? w.content.querySelector('.doc-window').className : null;`), 20000, 200);
  ok(!!ph && /doc-phone/.test(ph), 'the Doc window opened in its phone shape', ph);
  const p1 = await rectIn('.doc-page .ProseMirror > p');
  await click({ x: p1.right - 4, y: p1.y }); await type(' 已修改'); await sleep(150);
  await click(await rectIn('.doc-save-btn'));
  const savedZh = await until(() => ev(`const s = ${W}.content.querySelector('.doc-stamp').textContent; return /下一轮/.test(s) ? s : null;`), 6000);
  ok(!!savedZh && fs.readFileSync(P, 'utf8').includes('Intro paragraph. EDITED-1 已修改'), 'saved on the phone; the stamp speaks zh', savedZh);
  const bar390 = await ev(`const w = ${W}; return [...w.content.querySelectorAll('.doc-bar button')].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, l: r.left, r: r.right, h: r.height }; });`);
  ok(bar390.length >= 3 && bar390.every((b) => b.l >= 0 && b.r <= 390 && b.h >= 44) && bar390.some((b) => b.t === '源码') && bar390.some((b) => /^保存/.test(b.t)), 'every bar button inside 390 px, a 44 px target, in zh (源码 / 保存 / 批注)', bar390);
  const f1 = await shot('after-edit-zh.png');
  const c3 = await comment('.ProseMirror h2', 12, '标题再有力一些');
  const sheetNote = await ev(`return !!document.querySelector('.doc-note-sheet');`);
  const sheet = await until(() => ev(`const w = ${W}; const s = w.content.querySelector('.doc-strip'); if (s.hidden || !s.querySelector('.doc-cmt')) return null; const r = s.getBoundingClientRect(); const wr = w.content.querySelector('.doc-window').getBoundingClientRect(); return { l: Math.round(r.left - wr.left), r: Math.round(wr.right - r.right), b: Math.round(wr.bottom - r.bottom), w: Math.round(r.width), ww: Math.round(wr.width), n: s.querySelectorAll('.doc-cmt').length, head: s.querySelector('.doc-strip-head').textContent, send: s.querySelector('.doc-send').getBoundingClientRect().height };`), 5000);
  ok(!!sheet && sheet.l === 0 && sheet.r === 0 && sheet.b === 0 && sheet.w === sheet.ww && sheet.n === 1 && sheet.head === '批注（1）' && sheet.send >= 44, 'the note box was a sheet, and the strip is a bottom sheet across the whole window (批注（1）, a 44 px Send all)', { c3, sheetNote, sheet });
  const f2 = await shot('after-comment-zh.png');
  if (SHOTS) ok(!!f1 && !!f2 && fs.statSync(f1).size > 5000 && fs.statSync(f2).size > 5000, `PNGs for the owner: ${f1}, ${f2}`);
  ok(pageErrors.length === 0, 'no uncaught exception in the page across the whole run', pageErrors.slice(0, 4));
} catch (e) {
  ok(false, 'the suite ran to its end', e && e.stack);
  console.log(journal.join('').slice(-2000));
} finally {
  const ended = cleanup();
  console.log(`\n[doc-window] ${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'} · ended ${ended.length} rooted process(es)`);
  process.exit(fail ? 1 : 0);
}
