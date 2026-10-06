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
//      editor in place · ⑦ a table file opens RAW with the chip (the file untouched) · ⑧ zh at 390 px: the bar fits, 36 px
//      targets, the strip is a bottom sheet; PNGs after-edit-zh.png + after-comment-zh.png into $VS_DOC_WINDOW_SHOTS.
//   §9 DESIGN 020 (lane doc-editor-ui, 2.369.223) on the design desk's audit sample (every block kind) at 1280 / 390 ×
//      dark / light × zh / en: ① every task item is li[data-type=taskItem] with its checkbox on its words' row (the bug:
//      red on c34711faa) · ② the bar is ONE row from maximized down to 300 px, folds by priority, the ⋯ = the folded ·
//      ③ the status strip absent with nothing to say, the save dot (Ctrl+S flips it), ONE chip for a conflict (both acts)
//      and for comments · ④ the rhythm / heading scale / 76ch column · ⑤ table header nowrap, alignment, the hover grips
//      open the existing menu (a real mouse move) · ⑥ the code block's language chip, the raw head, the caption · ⑧ the
//      phone: 36 px targets, nothing clipped, the table scrolls in its wrapper, the bottom sheet · ⑦ PNGs
//      after-{1280,390}-{dark,light}-{zh,en}.png (+ -strip) into $VS_DOC_UI_SHOTS (else $VS_DOC_WINDOW_SHOTS).
//      VS_DOC_WINDOW_ONLY=sample runs §9 alone.
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
const ONLY = process.env.VS_DOC_WINDOW_ONLY || ''; // `sample` = §9 alone (the design-020 legs)
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
const TABLE = '# 价格\n\n| 项目 | 价格 |\n|------|-----:|\n| 苹果 | 1    |\n| 香蕉 | 2    |\n\n- [ ] 核对\n\n尾段。\n'; // lane doc-editor-wheel: a Chinese table opens RICH
// design 020 (lane doc-editor-ui): the design desk's audit sample — every block kind; its image is a local file
const SAMPLE = `# 产品发布简报 Launch brief

本文档用于审计 **Doc 窗口** 的排版：它包含了 _每一种_ 块类型，例如行内代码 \`vibespace-app install\`、一个[链接](https://example.com/docs)、**加粗**与*斜体*混排。This paragraph mixes CJK and Latin text so the line-height and the reading width can be judged in both scripts at once.

## 1. 目标 Goals

- 第一条要点 first bullet with a longer sentence that wraps at the reading width when the window is wide enough
  - 嵌套要点 nested bullet
  - 第二个嵌套 another nested one with \`inline code\`
- 第二条要点 second bullet

### 1.1 步骤 Steps

1. 先做这个 do this first
2. 再做那个 then that
3. 最后 finally

- [x] 已完成的任务 a done task
- [ ] 未完成的任务 an open task with a link to [the spec](https://example.com/spec)
- [ ] 第三个任务 a third task

| 平台 Platform | 状态 Status | 数量 Count | 备注 Notes |
|:--|:-:|--:|---|
| Linux | 已支持 supported | 12 | 主路径 main path |
| Windows | 探针中 probing | 3 | 等 owner 的机器 waiting on the owner's machine |
| macOS | 计划 planned | 0 | 屏幕共享 Screen Sharing |

\`\`\`js
export function fitGeometry({ paneW, paneH }, hints) {
  const w = Math.max(hints.min[0], Math.min(paneW, hints.max[0]));
  return { x: 0, y: 0, w, h: paneH };   // the app window fills the pane
}
\`\`\`

> 引用块：owner 的原话「你该优化一下富文本编辑器的界面了」。A blockquote with a second sentence long enough to wrap.

![示例图片 sample image](img/sample.png)

<div class="note">原始 HTML 块 a raw HTML block that the editor shows as source</div>

这是一个很长的段落，用来看阅读宽度和行高。It goes on for a while so that the reading column's measure can be judged: a good column holds about sixty to seventy-five characters per line in Latin script, and somewhat fewer CJK characters, with a line-height of roughly one and a half to one and six tenths of the font size; anything wider makes the eye lose the next line, anything narrower breaks the rhythm of reading. 中文段落也一样，太宽的行让眼睛找不到下一行的开头，太窄的行又会打断阅读的节奏，所以阅读列的宽度要定在一个合适的字符数上。

最后一段 the last paragraph.
`;
let P, TP, SIDW, CONV;
try {
  section('§0 the throwaway server + the stub agent + the real client');
  const up = await until(async () => { try { return (await fetch(base + '/api/version')).ok; } catch { return false; } }, 60000, 300);
  if (!ok(!!up, `the throwaway server answered on :${PORT}`, journal.join('').slice(-1500))) throw new Error('no server');
  ok(MD.docFidelity(BRIEF).ok && MD.docFidelity(TABLE).ok && !MD.docFidelity(TABLE.replace(/\n/g, '\r\n')).ok, 'fixtures: the brief and the table file open rich (the wheel), a CRLF copy would not');
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
  /** A bar tool by its class — or, folded (a split beside the chat is narrow: Raw folds first), its row in the ⋯ menu. */
  async function pressTool(cls, label, p = P) {
    const r = await rectIn(cls, p);
    if (r) return click(r);
    await click(await rectIn('.doc-more', p)); await sleep(200);
    const row = await ev(`const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === ${S(label)}); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    if (row) await click(row);
    return row;
  }
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
  if (ONLY !== 'sample') {

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
  ok(disk1 === want1, 'Ctrl+S ⇒ block patching: exactly the typed line changed, every other line byte-identical', disk1 && disk1.slice(0, 120));
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
  const bar = await until(() => ev(`const w = ${W}; const b = w.content.querySelector('.doc-conflict'); return b.hidden ? null : { text: b.title + ' | ' + b.textContent, pm: w.content.querySelector('.ProseMirror').textContent };`), 8000, 200);
  ok(!!bar && /agent changed this file/.test(bar.text) && bar.pm.includes('USER-2') && !bar.pm.includes('(agent)'), 'the conflict chip shows (its title says the agent changed the file); the rendered view keeps the user\'s edit (no silent reload)', bar && bar.text);
  await click(await rectIn('.doc-keep'));
  ok(await ev(`return ${W}.content.querySelector('.doc-conflict').hidden;`), 'Keep editing (from the chip) hides it');
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
  const c1 = await comment('.ProseMirror h2', 12, 'make this punchier');
  const c2 = await comment('.ProseMirror ul li p', 40, 'add a date');
  const strip = await ev(`const w = ${W}; return [...w.content.querySelectorAll('.doc-cmt')].map((e) => ({ q: e.querySelector('.doc-cmt-q') && e.querySelector('.doc-cmt-q').textContent, n: e.querySelector('.doc-cmt-n').textContent }));`);
  ok(strip.length === 2 && strip[0].n === 'make this punchier' && strip[1].n === 'add a date' && !!strip[0].q && !!strip[1].q, 'two comments in the strip (quote + note), keyed rows', { c1, c2, strip });
  ok(await ev(`return !!localStorage.getItem('vs-doc-comments:' + '\\u0001' + ${S(P)});`), 'the strip is device-kept per (host, path)');
  const before = stdinTexts().length;
  await click(await rectIn('.doc-send'));
  const sent = await until(() => stdinTexts().slice(before).filter((t) => t.startsWith('[Doc comments]')), 8000);
  const qOf = (x) => String(x.q).replace(/^L\d+ /, ''), lineOf = (x) => +(/^L(\d+) /.exec(x.q) || [])[1];
  const srcL = fs.readFileSync(P, 'utf8').split('\n');
  ok(lineOf(strip[0]) === 5 && lineOf(strip[1]) === 7 && srcL[4].includes(qOf(strip[0])) && srcL[6].includes(qOf(strip[1])), 'each comment maps to its SOURCE line (PM state + the block map): the heading → L5, the first list item → L7', strip);
  const want = `[Doc comments] ${P}\n① L5 "${qOf(strip[0])}" — make this punchier\n② L7 "${qOf(strip[1])}" — add a date`;
  ok(!!sent && sent.length === 1 && sent[0] === want, 'Send all ⇒ exactly ONE message on the agent\'s stdin, in the contract\'s shape', sent || stdinTexts().slice(-2));
  await sleep(500);
  ok(stdinTexts().slice(before).length === 1 && (await ev(`return ${W}.content.querySelectorAll('.doc-cmt').length;`)) === 0 && !(await ev(`return localStorage.getItem('vs-doc-comments:' + '\\u0001' + ${S(P)});`)), 'one message only; the strip and its device copy are empty after');

  section('§6 Raw = the code editor in place, and back');
  await pressTool('.doc-raw-btn', 'Edit the markdown source');
  const raw = await until(() => ev(`const w = ${W}; const r = w.content.querySelector('.doc-raw'); const cm = r && r.querySelector('.cm-content'); return !r.hidden && cm && cm.textContent.includes('Filler line 2 (agent).') ? { pane: w.content.querySelector('.doc-pane').hidden, pressed: w.content.querySelector('.doc-raw-btn').getAttribute('aria-pressed') } : null;`), 8000);
  ok(!!raw && raw.pane && raw.pressed === 'true', 'Raw shows the CodeEditor on the same file in this window (aria-pressed)', raw);
  await pressTool('.doc-raw-btn', 'Edit the markdown source');
  const back = await until(() => ev(`const w = ${W}; return !w.content.querySelector('.doc-pane').hidden && w.content.querySelector('.doc-raw').hidden ? true : null;`), 5000);
  ok(!!back, 'pressed again ⇒ back to the rendered view');

  section('§7 a Chinese table opens RICH: IME into a cell, Save ⇒ only that row changes; a task toggles; the toolbar inserts a table; a comment maps to its row');
  await ev(`app.openFile(${S(TP)}, 'TABLE.md', { from: ${S(chatWin)} }); return true;`);
  const TW = DW(TP);
  const tw = await until(() => ev(`const w = ${TW}; if (!w) return null; const pm = w.content.querySelector('.ProseMirror'); return pm && pm.querySelector('table td') ? { chip: w.content.querySelector('.doc-chip').hidden, cells: pm.querySelectorAll('td').length, tbl: !w.content.querySelector('.doc-table-btn').hidden } : null;`), 20000, 200);
  ok(!!tw && tw.chip && tw.cells === 4 && tw.tbl, 'the table file opens RICH (no chip): a real table, the Table button in the bar', tw);
  const cell = await rectIn('.ProseMirror tr:nth-child(2) td', TP);
  await click({ x: cell.right - 4, y: cell.y }); await sleep(250);
  await call('Input.imeSetComposition', { text: 'q', selectionStart: 1, selectionEnd: 1 });
  await call('Input.imeSetComposition', { text: '青', selectionStart: 1, selectionEnd: 1 });
  await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 }); // Enter DURING the composition (the IME's commit key)
  await call('Input.insertText', { text: '青' });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(300);
  await click(await rectIn('.doc-save-btn', TP));
  const T1 = TABLE.replace('| 苹果 | 1    |', '| 苹果青 | 1    |');
  const dt1 = await until(() => { const x = fs.readFileSync(TP, 'utf8'); return x !== TABLE ? x : null; }, 8000);
  ok(dt1 === T1, 'IME into a cell (Enter mid-composition) ⇒ 青 lands ONCE in that cell, the row not split; Save ⇒ only that row changed (its padding kept), every other line byte-identical', dt1);
  const box = await rectIn('.ProseMirror input[type="checkbox"]', TP);
  if (!box) console.log('[doc-window] no checkbox:', await ev(`const u = ${TW}.content.querySelectorAll('.ProseMirror ul'); return [...u].map((x) => x.outerHTML.slice(0, 300)).join(' | ');`));
  await click(box); await sleep(250);
  await click(await rectIn('.doc-save-btn', TP));
  const dt2 = await until(() => { const x = fs.readFileSync(TP, 'utf8'); return x !== T1 ? x : null; }, 8000);
  ok(dt2 === T1.replace('- [ ] 核对', '- [x] 核对'), 'a task toggles ⇒ exactly its line changed on save', dt2);
  const tail = await rectIn('.ProseMirror > p:last-child', TP);
  await click({ x: tail.right - 2, y: tail.y }); await sleep(200);
  await pressTool('.doc-table-btn', 'Table', TP); await sleep(300);
  await type('列一'); await sleep(200);
  const tbls = await ev(`return ${TW}.content.querySelectorAll('.ProseMirror table').length;`);
  await click(await rectIn('.doc-save-btn', TP));
  const dt3 = await until(() => { const x = fs.readFileSync(TP, 'utf8'); return x !== dt2 ? x : null; }, 8000);
  ok(tbls === 2 && !!dt3 && dt3.startsWith(dt2.replace(/\n$/, '')) && /\| 列一 \| {2}\|\n\| --- \| --- \|\n\| {2}\| {2}\|\n\| {2}\| {2}\|/.test(dt3), 'the toolbar inserts a 3×2 table (typed into its first cell) ⇒ saved as a new block after the untouched lines', { tbls, dt3 });
  const c4 = await comment('.ProseMirror table tr:nth-child(3) td', 8, '香蕉要改', TP);
  const s4 = await ev(`return [...${TW}.content.querySelectorAll('.doc-cmt-q')].map((e) => e.textContent);`);
  ok(s4.some((q) => /^L6 /.test(q)), 'a comment on the 香蕉 row maps to its source line L6', { c4, s4 });
  await ev(`const w = ${TW}; for (const x of w.content.querySelectorAll('.doc-cmt-x')) x.click(); return true;`);
  ok(pageErrors.length === 0, 'no uncaught exception in the page (desktop legs)', pageErrors.slice(0, 4));

  section('§8 zh at 390 px (a phone): the bar fits, 36 px targets, the strip is a bottom sheet');
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
  ok(bar390.length >= 4 && bar390.every((b) => b.l >= 0 && b.r <= 390 && b.h >= 36) && bar390.some((b) => b.t === '正文'), 'every bar button inside 390 px, a 36 px target, in zh (the block style reads 正文)', bar390);
  const f1 = await shot('after-edit-zh.png');
  const c3 = await comment('.ProseMirror h2', 12, '标题再有力一些');
  const sheetNote = await ev(`return !!document.querySelector('.doc-note-sheet');`);
  const sheet = await until(() => ev(`const w = ${W}; const s = w.content.querySelector('.doc-strip'); if (s.hidden || !s.querySelector('.doc-cmt')) return null; const r = s.getBoundingClientRect(); const wr = w.content.querySelector('.doc-window').getBoundingClientRect(); return { l: Math.round(r.left - wr.left), r: Math.round(wr.right - r.right), b: Math.round(wr.bottom - r.bottom), w: Math.round(r.width), ww: Math.round(wr.width), n: s.querySelectorAll('.doc-cmt').length, head: s.querySelector('.doc-strip-head').textContent, send: s.querySelector('.doc-send').getBoundingClientRect().height };`), 5000);
  ok(!!sheet && sheet.l === 0 && sheet.r === 0 && sheet.b === 0 && sheet.w === sheet.ww && sheet.n === 1 && sheet.head === '批注（1）' && sheet.send >= 36, 'the note box was a sheet, and the strip is a bottom sheet across the whole window (批注（1）, a 36 px Send all)', { c3, sheetNote, sheet });
  const f2 = await shot('after-comment-zh.png');
  if (SHOTS) ok(!!f1 && !!f2 && fs.statSync(f1).size > 5000 && fs.statSync(f2).size > 5000, `PNGs for the owner: ${f1}, ${f2}`);
  ok(pageErrors.length === 0, 'no uncaught exception in the page across the whole run', pageErrors.slice(0, 4));
  } // the desktop + phone legs (§1–§8) — VS_DOC_WINDOW_ONLY=sample runs §9 alone

  // ── §9 design 020 (lane doc-editor-ui, 2.369.223): the design desk's audit sample (every block kind) at 1280 / 390 ×
  //    dark / light × zh / en — the PNGs carry the audit's names with `after-` so the owner flips between before and after
  section('§9 design 020: the audit\'s SAMPLE.md — task items, the folding bar, the status strip, typography, table / code chrome, the phone');
  const SP = path.join(fs.realpathSync(PROJ), 'docs', 'SAMPLE.md'), SW = DW(SP);
  fs.mkdirSync(path.join(PROJ, 'docs', 'img'), { recursive: true });
  fs.copyFileSync(path.join(WT, 'docs/mockups/browser-faces/direction-a-desktop-en.png'), path.join(PROJ, 'docs', 'img', 'sample.png'));
  fs.writeFileSync(SP, SAMPLE);
  const UI_SHOTS = process.env.VS_DOC_UI_SHOTS || SHOTS;
  const uiShot = async (name) => { if (!UI_SHOTS) return null; const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(UI_SHOTS, name); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  async function openSample(width, height, mobile, theme, lang) {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('theme', ${S(theme)}); localStorage.setItem('vibespace.lang', ${S(lang)}); } catch {}` });
    if (!(await boot(width, height, mobile))) return null;
    await ev(`app.themeManager.apply(${S(theme)}); return true;`); // the restored layout re-applies ITS theme (layout.js) — choose it as the panel does
    const th = await ev(`return { ls: localStorage.getItem('theme'), dt: document.documentElement.getAttribute('data-theme') || 'dark', lang: localStorage.getItem('vibespace.lang') };`);
    ok(th.dt === theme && th.lang === lang, `${width}-${theme}-${lang}: the client wears the ${theme} theme in ${lang}`, th);
    await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); return true;`); await sleep(400);
    await ev(`app.openFile(${S(SP)}, 'SAMPLE.md', {}); return true;`);
    const up = await until(() => ev(`const w = ${SW}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelector('table td') && pm.querySelector('pre') && pm.querySelector('img') ? true : null;`), 20000, 200);
    await sleep(700); // the bar's fold settles on a frame after the fonts
    return up;
  }
  const inSW = (js) => ev(`const w = ${SW}; const c = w.content; const pm = c.querySelector('.ProseMirror'); const R = (e) => e.getBoundingClientRect(); ${js}`);
  /** THE BAR CENSUS: one row (every shown item's box inside the bar, centres level, no overlap, nothing scrolls), the
   *  fold by priority (no shown item outranks a folded one), the folded items' titles. */
  const barCensus = () => inSW(`const bar = c.querySelector('.doc-bar'), br = R(bar);
    const kids = [...bar.children].filter((e) => e.dataset.key);
    const shown = kids.filter((e) => e.getClientRects().length).map((e) => { const r = R(e); return { k: e.dataset.key, p: +e.dataset.prio, l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, mid: (r.top + r.bottom) / 2 }; });
    const folded = kids.filter((e) => e.classList.contains('bar-folded') && e.dataset.key !== 'sep').map((e) => ({ k: e.dataset.key, p: +e.dataset.prio, title: e.title }));
    const more = c.querySelector('.doc-more');
    const svgs = [...bar.querySelectorAll('svg')].filter((e) => e.closest('button') && e.closest('button').getClientRects().length && !e.closest('.bar-ruler-host'));
    return { glyphs: svgs.length, drawn: svgs.filter((e) => e.namespaceURI === 'http://www.w3.org/2000/svg' && R(e).width >= 11 && R(e).height >= 11).length, bw: br.width, bh: br.height, bl: br.left, brr: br.right, bt: br.top, bb: br.bottom, sw: bar.scrollWidth, cw: bar.clientWidth, shown, folded, more: !!more && more.getClientRects().length > 0 };`);
  const barOk = (v) => {
    if (!v || !v.shown.length) return false;
    const s = [...v.shown].sort((a, b) => a.l - b.l);
    const level = s.every((x) => Math.abs(x.mid - s[0].mid) <= 1 && x.t >= v.bt - 0.5 && x.b <= v.bb + 0.5 && x.l >= v.bl - 0.5 && x.r <= v.brr + 0.5);
    const apart = s.every((x, i) => i === 0 || s[i - 1].r <= x.l + 0.5);
    const ranked = v.folded.every((f) => v.shown.filter((x) => x.k !== 'sep').every((x) => x.p <= f.p));
    return level && apart && ranked && v.sw <= v.cw + 1 && v.more === v.folded.length > 0 && v.glyphs >= 3 && v.drawn === v.glyphs; // every shown button's glyph is a DRAWN svg
  };
  const moreRows = async () => {
    const m = await inSW(`const b = c.querySelector('.doc-more'); if (!b || !b.getClientRects().length) return null; const r = R(b); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    if (!m) return [];
    await click(m); await sleep(200);
    const rows = await ev(`const p = document.querySelector('.context-menu'); return p ? [...p.querySelectorAll('.context-menu-item, [role=menuitem]')].map((x) => x.textContent.trim()) : [];`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(150);
    return rows;
  };
  const lastP = () => inSW(`const p = [...pm.children].filter((e) => e.tagName === 'P').pop(); p.scrollIntoView({ block: 'center' }); const r = R(p); return { x: r.right - 3, y: r.bottom - 8 };`);
  const into = async (sel) => { await inSW(`c.querySelector(${S(sel)}).scrollIntoView({ block: 'center' }); return true;`); await sleep(120); };
  const stripState = () => inSW(`const s = c.querySelector('.doc-status'); if (!s) return { absent: true, none: true }; const pills = [...s.querySelectorAll('.doc-pill')].filter((e) => e.getClientRects().length); const dot = s.querySelector('.doc-save-btn'); return { absent: s.hidden || !s.getClientRects().length, pills: pills.map((e) => e.dataset.key), text: s.textContent, dot: dot && dot.getClientRects().length ? dot.dataset.state : null, side: !c.querySelector('.doc-strip').hidden };`);
  const COMBOS = [[1280, 900, false, 'dark', 'zh'], [1280, 900, false, 'dark', 'en'], [1280, 900, false, 'light', 'zh'], [1280, 900, false, 'light', 'en'], [390, 844, true, 'dark', 'zh'], [390, 844, true, 'dark', 'en'], [390, 844, true, 'light', 'zh'], [390, 844, true, 'light', 'en']];
  const shotsMade = [];
  for (const [width, height, mobile, theme, lang] of COMBOS) {
    const name = `after-${width}-${theme}-${lang}.png`, deep = theme === 'dark' && lang === 'zh';
    const up = await openSample(width, height, mobile, theme, lang);
    if (!ok(!!up, `${name.slice(6, -4)}: the sample opened rich (table, code, image)`)) continue;
    if (deep && !mobile) {
      // ① THE TASK-LIST BUG (design 020 T4): the parsed items wore no data-type, so the task rule never applied and every
      //    checkbox sat on its own line above its words
      const tasks = await inSW(`return [...pm.querySelectorAll('li')].filter((li) => li.querySelector(':scope > label input[type=checkbox]')).map((li) => { const cb = R(li.querySelector('input[type=checkbox]')); const box = li.querySelector(':scope > div'); const tx = (box && box.querySelector('p')) || box || li; const rg = document.createRange(); rg.selectNodeContents(tx); const line = rg.getClientRects()[0] || R(tx); return { type: li.getAttribute('data-type'), ul: li.parentElement.getAttribute('data-type'), kids: [...li.children].map((x) => x.tagName).join('+'), cbMid: Math.round(cb.top + cb.height / 2), cbW: Math.round(cb.width), lineTop: Math.round(line.top), lineBottom: Math.round(line.bottom), cbRight: Math.round(cb.right), textLeft: Math.round(line.left), checked: li.dataset.checked, deco: getComputedStyle(box || li).textDecorationLine, color: getComputedStyle(box || li).color, base: getComputedStyle(pm).color }; });`);
      ok(tasks.length === 3 && tasks.every((x) => x.type === 'taskItem' && x.ul === 'taskList' && x.kids === 'LABEL+DIV'), '① every task item is ul[data-type=taskList] > li[data-type=taskItem] > label + div', tasks.map((x) => `${x.ul}>${x.type}>${x.kids}`));
      ok(tasks.length === 3 && tasks.every((x) => x.cbMid >= x.lineTop && x.cbMid <= x.lineBottom && x.cbRight <= x.textLeft), '① each checkbox shares the row with its words (its middle inside the first text line, left of them)', tasks.map((x) => ({ cbMid: x.cbMid, line: [x.lineTop, x.lineBottom], cbRight: x.cbRight, textLeft: x.textLeft })));
      ok(tasks.length === 3 && tasks[0].checked === 'true' && /line-through/.test(tasks[0].deco) && tasks[0].color !== tasks[0].base && tasks[1].checked === 'false' && !/line-through/.test(tasks[1].deco) && tasks[0].cbW === 15, '① the house checkbox (15 px); a done item reads secondary + struck, an open one plain', tasks.map((x) => [x.checked, x.deco, x.color, x.cbW]));
      // ② THE BAR: never two rows, folds by priority (B before Table, Table before raw), the ⋯ holds exactly the folded
      const sweep = [];
      for (const px of [0, 760, 560, 470, 390, 300]) {
        await inSW(`const el = w.element; if (${px}) { el.style.width = '${px}px'; } else { app.wm.toggleMaximize(w.id); } return true;`);
        await sleep(450);
        const v = await barCensus();
        const rows = v && v.folded.length ? await moreRows() : [];
        sweep.push({ px: px || 'max', bw: v && Math.round(v.bw), ok: barOk(v), shown: v && v.shown.filter((x) => x.k !== 'sep').map((x) => x.k).join(' '), folded: v && v.folded.map((x) => x.k).join(' '), rowsOk: !!v && rows.length === v.folded.length && v.folded.every((f, i) => rows[i] === f.title), rows });
        if (!px) { await inSW(`app.wm.toggleMaximize(w.id); return true;`); await sleep(300); }
      }
      ok(sweep.every((x) => x.ok && x.rowsOk), '② the bar is ONE row at every width (maximized / 760 / 560 / 470 / 390 / 300), folds by priority, the ⋯ menu = the folded items in order', sweep);
      ok(sweep[0].folded === '' && /\braw\b/.test(sweep[sweep.length - 1].folded) && sweep.some((x) => /table/.test(x.folded) && !/bold/.test(x.folded)), '② wide: nothing folded; narrowing folds raw first, then the inserts, B last', sweep.map((x) => x.px + ': ' + x.folded));
      await inSW(`w.element.style.width = '900px'; return true;`); await sleep(400);
      // ③ THE STATUS STRIP: absent with nothing to say; the save dot while unsaved (Ctrl+S flips it); ONE chip for a
      //    conflict (both acts work from it); ONE chip for comments; the comments side strip closed until asked
      const s0 = await stripState();
      ok(s0.absent && !s0.side, '③ a clean file: no status strip, the comments strip closed', s0);
      const lastP0 = await lastP();
      await click(lastP0); await type(' 改'); await sleep(200);
      const s1 = await stripState();
      ok(!s1.absent && s1.pills.length === 0 && s1.dot === 'dirty', '③ an edit ⇒ the strip with only the save dot (unsaved)', s1);
      await ctrlS();
      const saved = await until(async () => { const st = await stripState(); return st.dot === 'saved' && fs.readFileSync(SP, 'utf8').includes('the last paragraph. 改') ? st : null; }, 6000);
      ok(!!saved, '③ Ctrl+S flips the dot to saved (the file holds the edit)', saved || await stripState());
      fs.writeFileSync(SP, SAMPLE); await sleep(2600); // clean ⇒ the watch repaints in place
      await click(await lastP()); await type(' 再改'); await sleep(150);
      fs.writeFileSync(SP, SAMPLE.replace('最后一段', '最后一段（agent）'));
      const s2 = await until(async () => { const st = await stripState(); return st.pills.includes('conflict') ? st : null; }, 6000);
      ok(!!s2 && s2.pills.length === 1 && s2.dot === 'dirty', '③ the disk moved under unsaved edits ⇒ ONE chip (the conflict, its two acts inline)', s2 || await stripState());
      await click(await rectIn('.doc-keep', SP)); await sleep(200);
      const s3 = await stripState();
      ok(!s3.pills.length && s3.dot === 'dirty', '③ Keep editing (from the chip) ⇒ the chip goes, the edit stays', s3);
      fs.writeFileSync(SP, SAMPLE.replace('最后一段', '最后一段（agent 2）'));
      await until(async () => (await stripState()).pills.includes('conflict'), 6000);
      await click(await rectIn('.doc-reload', SP));
      const s4 = await until(async () => { const st = await stripState(); const t = await inSW('return pm.textContent;'); return t.includes('（agent 2）') && !t.includes('再改') ? st : null; }, 6000);
      ok(!!s4 && !s4.pills.length && s4.dot !== 'dirty', '③ Reload (from the chip) ⇒ the agent\'s version, the edit gone, no chip', s4);
      await into('.ProseMirror h2');
      const cm = await comment('.ProseMirror h2', 12, '加一个日期', SP);
      const s5 = await stripState();
      ok(!s5.absent && s5.pills.length === 1 && s5.pills[0] === 'comments' && s5.side, '③ a comment ⇒ ONE chip (comments) and the comments strip open', { cm, s5 });
      await click(await rectIn('.doc-cmts-chip', SP)); await sleep(150);
      const s6 = await stripState();
      ok(!s6.side && s6.pills[0] === 'comments', '③ the comments chip toggles the comments strip', s6);
      // ④ TYPOGRAPHY: block rhythm, the heading scale, the reading column
      const ty = await inSW(`const kids = [...pm.children], fz = (e) => parseFloat(getComputedStyle(e).fontSize);
        const ps = kids.filter((e, i) => e.tagName === 'P' && kids[i + 1] && kids[i + 1].tagName === 'P'); const a = ps[ps.length - 1], b = a && a.nextElementSibling;
        const h2 = kids.find((e, i) => e.tagName === 'H2' && i > 0); const page = c.querySelector('.doc-page');
        const pr = document.createElement('span'); pr.style.cssText = 'position:absolute;visibility:hidden;width:76ch'; page.appendChild(pr); const ch76 = R(pr).width; pr.remove();
        const cs = getComputedStyle(page);
        const gaps = kids.slice(1).map((e, i) => ({ k: kids[i].tagName + '>' + e.tagName, g: Math.round(R(e).top - R(kids[i]).bottom) }));
        return { gaps, pGap: R(b).top - R(a).bottom, pEm: fz(a), h2Gap: R(h2).top - R(h2.previousElementSibling).bottom, h2Em: fz(h2), h1: fz(pm.querySelector('h1')), h2: fz(h2), h3: fz(pm.querySelector('h3')), lh: parseFloat(getComputedStyle(a).lineHeight) / fz(a), col: R(page).width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), page: R(page).width, ch76 };`);
      ok(Math.abs(ty.pGap - 0.75 * ty.pEm) <= 2 && Math.abs(ty.h2Gap - 1.4 * ty.h2Em) <= 2, `④ rhythm: paragraph → paragraph ${ty.pGap.toFixed(1)} px ≈ .75em; h2 top ${ty.h2Gap.toFixed(1)} px ≈ 1.4em`, ty);
      ok(ty.gaps.every((x) => x.g >= 0.5 * 15 - 1), '④ every top-level block keeps a gap from the one before (≥ .5em)', ty.gaps.filter((x) => x.g < 0.5 * 15 - 1));
      ok(ty.h1 === 26 && ty.h2 === 20 && ty.h3 === 16 && Math.abs(ty.lh - 1.6) < 0.02 && ty.page <= ty.ch76 + 64 + 1, `④ h1 26 / h2 20 / h3 16, body 15 / 1.6, the column ${Math.round(ty.col)} px ≤ 76ch (${Math.round(ty.ch76)}) + 64`, ty);
      // ⑤ TABLE: header on one line, alignment from the pipe row, the hover grips open the EXISTING menu (a real mouse move)
      const tb = await inSW(`const t = pm.querySelector('table'); const ths = [...t.querySelectorAll('th')]; const lh = parseFloat(getComputedStyle(ths[0]).lineHeight); const row = t.querySelectorAll('tr')[1]; return { thH: ths.map((x) => Math.round(R(x).height)), lh, pad: getComputedStyle(row.children[0]).padding, aligns: [...row.children].map((x) => getComputedStyle(x).textAlign), num: getComputedStyle(row.children[2]).fontVariantNumeric, thBg: getComputedStyle(ths[0]).backgroundColor };`);
      ok(tb.thH.every((h) => h <= tb.lh + 12 + 3) && tb.pad === '6px 10px' && tb.aligns.slice(1, 3).join() === 'center,right' && /tabular-nums/.test(tb.num), '⑤ the header on one line, 6×10 cells, the pipe row\'s alignment (center / right, tabular numbers)', tb);
      await into('.ProseMirror table tr:nth-child(3) td:nth-child(2)'); const cell = await rectIn('.ProseMirror table tr:nth-child(3) td:nth-child(2)', SP);
      await mouse('mouseMoved', cell.x - 20, cell.y - 60, { button: 'none' }); await mouse('mouseMoved', cell.x, cell.y, { button: 'none' }); await sleep(250);
      const grips = await inSW(`const g = (s) => { const e = c.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = R(e); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, r: r.right, t: r.top, b: r.bottom }; }; return { row: g('.doc-grip-row'), col: g('.doc-grip-col') };`);
      ok(!!grips.row && !!grips.col && grips.row.y > cell.top && grips.row.y < cell.bottom && grips.col.x > cell.left && grips.col.x < cell.right, '⑤ a real mouse move over a cell shows the row grip on its row and the column ⋯ on its column', { grips, cell });
      const menuAt = async (p) => { await mouse('mouseMoved', p.x, p.y, { button: 'none' }); await sleep(80); await click(p); await sleep(200); const m = await ev(`const p = document.querySelector('.context-menu'); return p ? p.textContent : null;`); await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150); return { m, closed: await ev(`return !document.querySelector('.context-menu');`) }; };
      const gm1 = grips.row ? await menuAt(grips.row) : {}, gm2 = grips.col ? await menuAt(grips.col) : {};
      ok(/在上方插入行/.test(gm1.m || '') && /删除表格/.test(gm1.m || '') && /在左侧插入列/.test(gm2.m || '') && gm1.closed && gm2.closed, '⑤ each grip opens the existing table menu; Esc closes it', { gm1, gm2 });
      // ⑥ CODE: the fence's language on the block's chip; T7: quote, figure caption = the alt, the raw block's head
      const blk = await inSW(`const pre = pm.querySelector('pre:not(.doc-rawblock)'); const raw = pm.querySelector('pre.doc-rawblock'); const fig = pm.querySelector('figure'); return { lang: getComputedStyle(pre, '::after').content, font: getComputedStyle(pre).fontSize + '/' + (parseFloat(getComputedStyle(pre).lineHeight) / parseFloat(getComputedStyle(pre).fontSize)).toFixed(2), head: raw ? getComputedStyle(raw, '::before').content : null, cap: fig && fig.querySelector('figcaption') ? fig.querySelector('figcaption').textContent : null, q: getComputedStyle(pm.querySelector('blockquote')).borderLeftWidth };`);
      ok(blk.lang === '"js"' && blk.font === '13px/1.55', '⑥ the code block wears its fence\'s language chip ("js"), 13 / 1.55 mono', blk);
      const sp = await inSW(`const pre = pm.querySelector('pre:not(.doc-rawblock)'); const code = pm.querySelector('p code'); const p = code && code.closest('p'); return { pre: pre.spellcheck, code: code ? code.spellcheck : null, prose: p ? p.spellcheck : null };`);
      ok(sp.pre === false && sp.code === false && sp.prose === true, '⑥ the browser spell-checks the prose, not the code: the code block and inline code carry spellcheck=false', sp);
      ok(/HTML/.test(blk.head || '') && blk.cap === '示例图片 sample image' && blk.q === '3px', 'T7: the raw block\'s head says HTML, the image\'s caption is its alt, the quote\'s 3 px rule', blk);
      await inSW(`for (const x of c.querySelectorAll('.doc-cmt-x')) x.click(); return true;`);
      fs.writeFileSync(SP, SAMPLE); await sleep(2600);
    }
    if (deep && mobile) {
      // ⑧ THE PHONE: the bar folds to the style + B I, 36 px targets, nothing clipped, the table scrolls in its wrapper,
      //    the strip scrolls sideways, the comments strip is the bottom sheet
      const v = await barCensus();
      const rows = v && v.folded.length ? await moreRows() : [];
      ok(barOk(v) && v.shown.filter((x) => x.k !== 'sep').every((x) => x.h >= 36 && x.w >= 36) && v.shown.some((x) => x.k === 'bold') && v.shown.some((x) => x.k === 'style') && /\btable\b/.test(v.folded.map((x) => x.k).join(' ')) && rows.length === v.folded.length, '⑧ 390: one row, every target ≥ 36 × 36, style + B shown, the inserts folded into ⋯', { v, rows });
      const clip = await inSW(`const wr = R(c); const out = [...c.querySelectorAll('.doc-bar > *, .doc-status > *, .doc-page')].filter((e) => e.getClientRects().length && !e.closest('.doc-status')).filter((e) => { const r = R(e); return r.left < wr.left - 0.5 || r.right > wr.right + 0.5; }).map((e) => e.className); const tw = pm.querySelector('.tableWrapper'); const pane = c.querySelector('.doc-pane'); return { out, tw: tw && { sw: tw.scrollWidth, cw: tw.clientWidth, ox: getComputedStyle(tw).overflowX }, pane: { sw: pane.scrollWidth, cw: pane.clientWidth }, h1: parseFloat(getComputedStyle(pm.querySelector('h1')).fontSize), h2: parseFloat(getComputedStyle(pm.querySelector('h2')).fontSize), pad: getComputedStyle(c.querySelector('.doc-page')).paddingLeft };`);
      ok(!clip.out.length && clip.tw && clip.tw.sw > clip.tw.cw && clip.tw.ox === 'auto' && clip.pane.sw <= clip.pane.cw + 1 && clip.h1 === 23 && clip.h2 === 18 && clip.pad === '16px', '⑧ nothing clipped; the wide table scrolls INSIDE its wrapper (the page does not); h1 23 / h2 18; 16 px gutters', clip);
      const p1 = await lastP();
      await click(p1); await type(' 改'); await sleep(200);
      await into('.ProseMirror h2');
      const cm = await comment('.ProseMirror h2', 12, '手机上的批注', SP);
      const ph = await inSW(`const s = c.querySelector('.doc-status'); const sheet = c.querySelector('.doc-strip'); const wr = R(c.querySelector('.doc-window')), r = R(sheet); return { ox: getComputedStyle(s).overflowX, ws: getComputedStyle(s).whiteSpace, sh: !sheet.hidden && Math.round(r.left - wr.left) === 0 && Math.round(wr.right - r.right) === 0 && Math.round(wr.bottom - r.bottom) === 0, pills: [...s.querySelectorAll('.doc-pill, .doc-save-btn')].filter((e) => e.getClientRects().length).map((e) => Math.round(R(e).height)) };`);
      ok(ph.ox === 'auto' && ph.ws === 'nowrap' && ph.sh && ph.pills.length >= 2 && ph.pills.every((h) => h >= 36), '⑧ the strip scrolls sideways (36 px chips); the comments strip is the bottom sheet', { cm, ph });
      await inSW(`for (const x of c.querySelectorAll('.doc-cmt-x')) x.click(); return true;`);
      await uiShot(`after-390-${theme}-${lang}-strip.png`);
      fs.writeFileSync(SP, SAMPLE);
      await openSample(width, height, mobile, theme, lang);
    }
    // ⑦ the owner's PNGs (the audit's framing: the window as it opens)
    const f = await uiShot(name);
    if (f) shotsMade.push(f);
    if (deep && !mobile) { // the strip + the grip for the owner too: an edit, a comment, a conflict
      await click(await lastP()); await type(' 改'); await sleep(150);
      await into('.ProseMirror h2');
      await comment('.ProseMirror h2', 12, '加一个日期', SP);
      fs.writeFileSync(SP, SAMPLE.replace('最后一段', '最后一段（agent）'));
      await until(async () => (await stripState()).pills.includes('conflict'), 6000);
      await into('.ProseMirror table tr:nth-child(3) td:nth-child(2)'); const cell = await rectIn('.ProseMirror table tr:nth-child(3) td:nth-child(2)', SP);
      await mouse('mouseMoved', cell.x, cell.y, { button: 'none' }); await sleep(250);
      await uiShot(`after-1280-${theme}-${lang}-strip.png`);
      await inSW(`for (const x of c.querySelectorAll('.doc-cmt-x')) x.click(); return true;`);
      await click(await rectIn('.doc-reload', SP)); await sleep(300);
      fs.writeFileSync(SP, SAMPLE); await sleep(2600);
    }
  }
  if (UI_SHOTS) ok(shotsMade.length === 8 && shotsMade.every((f) => fs.statSync(f).size > 5000), `⑦ eight PNGs for the owner (the audit's names, after-*): ${UI_SHOTS}`, shotsMade);
} catch (e) {
  ok(false, 'the suite ran to its end', e && e.stack);
  console.log(journal.join('').slice(-2000));
} finally {
  const ended = cleanup();
  console.log(`\n[doc-window] ${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'} · ended ${ended.length} rooted process(es)`);
  process.exit(fail ? 1 : 0);
}
