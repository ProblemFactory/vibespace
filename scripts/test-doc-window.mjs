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
//      §10 (lane doc-window-width-export, 2.369.239): Fit / Comfortable widths at 1872 / 1000 / 390 px, the wide table scrolls,
//      the ⋯ menu's Download .md / Export HTML / Print / Copy legs, a hostile .md; PNGs after-{fit,comfortable,menu}.png into
//      $VS_DOC_WIDTH_SHOTS (else $VS_DOC_WINDOW_SHOTS). VS_DOC_WINDOW_ONLY=width runs §10 alone.
//      §11 (lane doc-print-fidelity, 2.369.241): Print renders the markdown SOURCE — a lane brief
//      (scripts/fixtures/doc-print/lane-brief.md) and a 40-paragraph document printed through Page.printToPDF: an <h1>,
//      a 4-item list, no raw block, nothing wider than the A4 page box, no scroll container, ≥ 2 pages, every line's end
//      in the PDF text; PNG after-print-p1.png (pdftoppm) into $VS_DOC_PRINT_SHOTS. VS_DOC_WINDOW_ONLY=print runs §11 alone.
//      §12 (lane doc-raw-blocks, 2.369.246 — owner "这个会莫名其妙变成源码的问题还没修复"): at 1400×900 in zh the owner's
//      shape (scripts/fixtures/doc-wheel/31-…: a GFM table whose cells hold <code>) opens as a TABLE with inline code
//      chips (no grey block), a cell edit saves that row only; a <details> block reads rendered with its chip, a hostile
//      <img onerror> never runs, a comment shows its source (the chip says why); arrows step over a raw block; the chip
//      opens its source IN PLACE, Esc re-renders, Ctrl+S ⇒ only that block's lines change. PNGs <tag>.png (the table) +
//      <tag>-raw.png + <tag>-raw-edit.png into $VS_DOC_RAW_SHOTS (tag = $VS_DOC_RAW_SHOT_TAG, else after).
//      VS_DOC_WINDOW_ONLY=raw runs §12 alone. Since lane doc-table-native (2.369.267) fixture 31's second table (a bare
//      STEP-<code>-nn) is a native table too: no raw block in that document.
//      §17 (lane doc-table-native, 2.369.267 — owner 2026-10-14 「这下面不是标准的表格吗 为啥显示说是源码？」): at 1400×900 in zh
//      the owner's SHAPE (scripts/fixtures/doc-wheel/32-…: a 10-column table whose cells hold a bare <absent>, code spans
//      with underscores, a long quoted last column) opens as a NATIVE table — no chip, editable cells, both <absent> as text;
//      the row height measured against each cell's content (the tall rows = the long quote columns); a letter typed after
//      <absent> + Ctrl+S ⇒ that row's line only; what stays raw (a <details>, a comment) wears the new chip words
//      「HTML 块 · 已按内容显示 · 点此编辑源码」 / 「… · 无法显示，给出源码 · 点此编辑」 and a `/p/<id>` paragraph is a paragraph.
//      PNGs <tag>.png (the table) + <tag>-raw.png into $VS_DOC_TABLE_SHOTS (tag = $VS_DOC_TABLE_SHOT_TAG, else after;
//      the PNGs are taken BEFORE the asserts, so a base tree gives the before pair). VS_DOC_WINDOW_ONLY=table runs §17 alone.
//      §13 (lane doc-comment-raw-block, 2.369.258 — owner "这个html部分无法批注"): at 1100×900 in en a blog draft (front matter,
//      a paragraph, an HTML comment block): a click on the block ⇒ Add comment, the quote = "HTML block: <!-- …", the strip's
//      context line = its kind; a mouse drag inside its source box ⇒ the quote = the selected text (its own line); reload ⇒
//      the strip lists both and a press selects the block in view; the source box open ⇒ no button + a toast; phone 390 ⇒
//      the comment sheet. PNGs desk.png + phone.png (+ desk-offer / desk-select / desk-editing) into $VS_DOC_RAWCMT_SHOTS
//      (else $VS_DOC_WINDOW_SHOTS). VS_DOC_WINDOW_ONLY=rawcmt runs §13 alone.
//      §14 (lane doc-link-bubble, 2.369.261 — owner "markdown富文本编辑器里url无法点击和编辑"): at 1280 in en a document with two
//      links: a click ⇒ the link's bar (address + Open / Edit / Copy / Remove); Open ⇒ a new tab (a new page target); Copy ⇒
//      the clipboard + a toast; Edit ⇒ the dialog prefilled, a new address / text rewrites the link (the markdown on disk); a
//      javascript: address refused; the toolbar's Link on a link ⇒ Edit (RED on the pre-lane build: it removed the link);
//      Remove ⇒ the words stay; Ctrl+K on a selection ⇒ the dialog (not the palette); a URL pasted over a selection links it,
//      javascript: pasted stays text; autolink on a typed URL (README.md stays a word); a hover's bar; read-only ⇒ a plain
//      click opens; phone 390 ⇒ the bottom row. PNGs bar.png + edit.png + phone.png into $VS_DOC_LINK_SHOTS (else
//      $VS_DOC_WINDOW_SHOTS). VS_DOC_WINDOW_ONLY=link runs §14 alone.
//      §15 (lane doc-comments-synced — owner 2026-10-12: his eighteen comments were in another computer's browser): two pages
//      on one instance — A adds 2 comments ⇒ B shows them without a reload; B removes one ⇒ A shows 1; A reloads ⇒ 1 from
//      the server (no localStorage key); a page with 3 rows under the OLD key ⇒ the server holds 3, the key gone; a second
//      browser's stale copy only adds; Send all on A ⇒ B's strip empties; the phone sheet. PNGs desk-a.png / desk-b.png /
//      phone.png into $VS_DOC_SYNC_SHOTS (else $VS_DOC_WINDOW_SHOTS). VS_DOC_WINDOW_ONLY=synced runs §15 alone.
//      ⑪–⑮ (lane doc-comments-ui, B-8199 — owner 2026-10-12 with eighteen comments: "请问我现在该干啥"): 18 rows ⇒ the button
//      reads "Send all (18 → 3 messages)"; row 7's ➤ ⇒ ONE POST of ONE item, row 7 gone, 17 stay, page B follows; the phone
//      sheet's glyphs fit their rows; a stopped owner ⇒ "Sending 17 comments…" (rows held) then the STASHED words. PNGs
//      desk.png / phone.png into $VS_DOC_SEND_SHOTS (else the §15 folder).
//      §16 (lane doc-comments-stopped-owner, B-b51a): a chat opens STOP.md, the chat is STOPPED (ws kill) ⇒ Send all is
//      stashed for its conversation (the toast says next turn, never refused); resumed (same conversation) ⇒ the chat's
//      `stash` fact counts the messages and the hand-over delivers them in order on the stub's stdin.
//      VS_DOC_WINDOW_ONLY=stopped runs §16 alone.
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
const SID = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : 'e2e00000-0000-4000-8000-' + String(process.pid).padStart(12, '0'); // a resume keeps its conversation id (§16)
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
setTimeout(() => out({ type: 'system', subtype: 'init', session_id: SID, cwd: process.cwd(), model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [], permissionMode: 'default' }), 50);
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); fs.appendFileSync(ROOT + '/stub-stdin.ndjson', line + '\\n'); } });
const done = new Set((() => { try { return fs.readdirSync(ROOT + '/cmds'); } catch { return []; } })()); // a stub started later never replays earlier commands (§16: a resumed stub replayed §5's prompt-context and drained its own stash)
setInterval(() => {
  let names = [];
  try { names = fs.readdirSync(ROOT + '/cmds').filter((n) => n.endsWith('.json')); } catch { return; }
  for (const n of names.sort()) {
    if (done.has(n)) continue; done.add(n);
    let c = null; try { c = JSON.parse(fs.readFileSync(ROOT + '/cmds/' + n, 'utf8')); } catch { continue; }
    if (c.sid && c.sid !== SID) continue;   // §16: a command for ONE conversation's stub (several stubs live)
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
/** The server's drafts SyncStore (lane doc-comments-synced: a document's comment rows live there under doc:<host>\u0001<path>). */
const drafts = async () => { try { return (await (await fetch(base + '/api/sync/drafts')).json()).data || {}; } catch { return {}; } };

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
  if (!ONLY) {

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
  const rec5 = await until(async () => { const v = (await drafts())['doc:\u0001' + P]; return Array.isArray(v) && v.length === 2 ? v : null; }, 4000);
  ok(!!rec5 && rec5.map((c) => c.note).join('|') === 'make this punchier|add a date' && !(await ev(`return localStorage.getItem('vs-doc-comments:' + '\\u0001' + ${S(P)});`)), 'the strip is VibeSpace\'s (lane doc-comments-synced): the server\'s drafts store holds both rows under doc:<host>\\u0001<path>, nothing in this browser\'s storage', rec5);
  const before = stdinTexts().length;
  await click(await rectIn('.doc-send'));
  const sent = await until(() => stdinTexts().slice(before).filter((t) => t.startsWith('[Doc comments]')), 8000);
  const qOf = (x) => String(x.q).replace(/^L\d+ /, ''), lineOf = (x) => +(/^L(\d+) /.exec(x.q) || [])[1];
  const srcL = fs.readFileSync(P, 'utf8').split('\n');
  ok(lineOf(strip[0]) === 5 && lineOf(strip[1]) === 7 && srcL[4].includes(qOf(strip[0])) && srcL[6].includes(qOf(strip[1])), 'each comment maps to its SOURCE line (PM state + the block map): the heading → L5, the first list item → L7', strip);
  const want = `[Doc comments] ${P}\n① L5 "${qOf(strip[0])}" — make this punchier\n② L7 "${qOf(strip[1])}" — add a date`;
  ok(!!sent && sent.length === 1 && sent[0] === want, 'Send all ⇒ exactly ONE message on the agent\'s stdin, in the contract\'s shape', sent || stdinTexts().slice(-2));
  await sleep(500);
  ok(stdinTexts().slice(before).length === 1 && (await ev(`return ${W}.content.querySelectorAll('.doc-cmt').length;`)) === 0 && !(await drafts())['doc:\u0001' + P], 'one message only; the strip and its server record are empty after');

  // THE COMMENT BUTTON OUTLIVED ITS SELECTION (userW inc-muxrol54-uv2d, lane doc-comment-dismiss): real mouse selections
  // in this .md; the popover is sampled every 100 ms (never two, gone means it STAYS gone — no re-offer)
  section('§5b the Add-comment popover lives exactly as long as its selection: a click elsewhere / a new selection / Esc');
  const cpopN = () => ev(`return document.querySelectorAll('.doc-cpop').length;`);
  const samples = async (ms) => { const out = []; for (let t = 0; t < ms; t += 100) { out.push(await cpopN()); await sleep(100); } return out; };
  // "elsewhere" = the intro paragraph ABOVE the heading: on screen, and never under the popover (that sits below the
  // selection, over the list — a press there is the button's own, the note box, not a click elsewhere)
  const h2r = await rectIn('.ProseMirror h2'), far = await rectIn('.ProseMirror > p');
  const where = () => ev(`const pm = document.querySelector('.doc-page .ProseMirror'); return { inPm: !!pm && pm.contains(document.activeElement), note: !!document.querySelector('.doc-note'), sel: String(getSelection()) };`);
  await mouse('mouseMoved', h2r.left + 2, h2r.y, { button: 'none' }); await mouse('mousePressed', h2r.left + 2, h2r.y, { clickCount: 1 });
  for (const dx of [20, 40, 70]) { await mouse('mouseMoved', h2r.left + dx, h2r.y); await sleep(30); }
  await mouse('mouseReleased', h2r.left + 70, h2r.y, { clickCount: 1 });
  const offered = await until(async () => (await cpopN()) === 1 || null, 3000);
  const dragSel = await ev('return String(getSelection());');
  ok(!!offered && dragSel.length > 0, 'a drag selection by mouse ⇒ the Add-comment popover', { dragSel, n: await cpopN() });
  await click({ x: far.left + 12, y: far.y });
  const afterClick = await samples(800), w1 = await where();
  ok(afterClick.every((n) => n === 0) && w1.inPm && !w1.note && w1.sel === '', 'a click elsewhere in the document ⇒ the popover is gone (.doc-cpop = 0, and stays 0; the caret in the text, no note box)', { afterClick, w1 });
  await click({ x: h2r.left + 12, y: h2r.y }, 2);
  const again = await until(async () => (await cpopN()) === 1 || null, 3000), w2 = await where();
  await click({ x: far.left + 12, y: far.y }, 2);
  const swap = await samples(800), w3 = await where();
  ok(!!again && w2.sel === 'Goals' && swap.every((n) => n <= 1) && swap[swap.length - 1] === 1 && w3.inPm && !w3.note && !!w3.sel && w3.sel !== 'Goals', 'a new selection elsewhere ⇒ never two, ONE again (the new one)', { again, w2, swap, w3 });
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const afterEsc = await samples(800), keptSel = await ev('return String(getSelection());');
  ok(afterEsc.every((n) => n === 0) && keptSel.length > 0, 'Esc ⇒ the popover is gone (the selection kept, not offered again)', { afterEsc, keptSel });
  await click({ x: far.left + 12, y: far.y }); await sleep(300);

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
  } // the desktop + phone legs (§1–§8) — VS_DOC_WINDOW_ONLY=sample runs §9 alone, =width §10 alone
  if (ONLY === '' || ONLY === 'width') {
  // ── §10 width + leaving (lane doc-window-width-export, 2.369.239 — owner 2026-10-08 "为啥左右这么多空白，缺少下载和导出功能"):
  //    the owner's shot = a 4-column table clipped in a centred 76ch column of a 1872 px window, no download / export / print
  section('§10 the column fills the window (Fit) or keeps the measure (Comfortable); a wide table scrolls; ⋯ = Download .md / Export HTML / Print / Copy');
  const WSHOTS = process.env.VS_DOC_WIDTH_SHOTS || SHOTS;
  const wshot = async (n) => { if (!WSHOTS) return null; const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(WSHOTS, n); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  const DOCS = path.join(fs.realpathSync(PROJ), 'docs'); fs.mkdirSync(path.join(DOCS, 'img'), { recursive: true });
  fs.copyFileSync(path.join(WT, 'docs/mockups/browser-faces/direction-a-desktop-en.png'), path.join(DOCS, 'img', 'wide.png'));
  const WIDE = '# Security incident register — compiled from Slack, e-mail and Lark, 2026-07-15 → 2026-10-07\n\nPrepared 2026-10-07 by the Security Officer for the fieldwork (incident identification and tracking).\n\n## 1. Method\n\n'
    + '| Source | Scope searched | Keywords | Raw hits |\n|---|---|---|---|\n'
    + '| **Slack** (example-ai.slack.com) | every channel, external shared channel and DM the Security Officer\'s account is a member of; `search.messages` with `after:2026-07-14` | 40: security incident, incident, vulnerability, breach, phishing, exploit, leak, leaked, hacked, attack, DDoS, suspicious, unauthorized, malware, compromised, outage, postmortem, post-mortem, CVE, pentest, penetration, abuse, takeover, XSS, injection, credential, password reset, 2FA, MFA, 安全, 漏洞, 泄露, 攻击, 钓鱼, 入侵, 故障, 事故, 宕机, 复盘, 异常 | 34 unique messages; incident 9, breach 4, security incident 3, hacked 2, 2FA 2, leak/leaked/异常 1 each; RAWHITSEND |\n'
    + '| **E-mail** — officer@example-audio.example and officer@example-ai.example | whole mailbox per keyword (one query each) | 20: vulnerability, security report, disclosure | personal mail: none an incident; work mail: 3 vendor notices |\n\n'
    + '![the figure](img/wide.png)\n\nA [kept link](https://example.com/kept) after the table.\n';
  const WP = path.join(DOCS, 'WIDE.md'), WW = DW(WP); fs.writeFileSync(WP, WIDE);
  const inW = (js) => ev(`const w = ${WW}; const c = w.content; const pm = c.querySelector('.doc-page .ProseMirror'); const R = (e) => e.getBoundingClientRect(); ${js}`);
  const GEOM = `const pane = c.querySelector('.doc-pane'), wr = pm.querySelector('.tableWrapper'), tb = pm.querySelector('table'), last = pm.querySelector('table tr:nth-child(2) td:last-child'), first = pm.querySelector('table tr:nth-child(2) td:first-child');
    const pr = R(pane), mr = R(pm), wrr = R(wr), lr = R(last);
    return { win: Math.round(R(c).width), pane: Math.round(pane.clientWidth), col: Math.round(mr.width), left: Math.round(mr.left - pr.left), right: Math.round(pane.clientWidth - (mr.right - pr.left)), width: c.querySelector('.doc-window').dataset.width,
      wrapW: wr.clientWidth, scrollW: wr.scrollWidth, ox: getComputedStyle(wr).overflowX, lastRight: Math.round(lr.right), wrapRight: Math.round(wrr.right), firstLeft: Math.round(R(first).left), wrapLeft: Math.round(wrr.left), sticky: getComputedStyle(first).position,
      btn: (c.querySelector('.doc-width-btn') || {}).textContent || '', btnShown: !!(c.querySelector('.doc-width-btn') || {}).offsetParent, ls: localStorage.getItem('vs-doc-width') };`;
  async function openWide(width, height) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); return true;`); await sleep(300);
    await ev(`app.openFile(${S(WP)}, 'WIDE.md', {}); return true;`);
    const up = await until(() => ev(`const w = ${WW}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelector('table td') && pm.querySelector('img') ? w.id : null;`), 20000, 200);
    if (up) { await ev(`app.wm.toggleMaximize(${S(up)}); return true;`); await sleep(700); }
    return up;
  }
  const menuRow = async (label) => { await click(await rectIn('.doc-more', WP)); await sleep(200); const r = await ev(`const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === ${S(label)}); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`); if (r) await click(r); else await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); return r; };
  // its own boot: §8 left the client in zh on a phone (app.isMobile) — §10 reads at desktop sizes in en
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); localStorage.removeItem('vs-doc-width'); } catch {}` });
  if (!ok(!!(await boot(1872, 1000, false)), '§10 the client re-booted at 1872×1000 in en')) throw new Error('no app for §10');
  await ev(`localStorage.removeItem('vs-doc-width'); return true;`);
  const g = {};
  ok(!!(await openWide(1872, 1000)), '①  WIDE.md (the shot\'s 4-column table) opened rich and maximized at 1872 px');
  g.fit1872 = await inW(GEOM);
  ok(g.fit1872.width === 'fit' && g.fit1872.ls === null && g.fit1872.col >= 1700 && Math.abs(g.fit1872.left - 32) <= 2 && Math.abs(g.fit1872.right - 32) <= 2, '② the DEFAULT is Fit: the column = the pane minus 32 px each side (≥ 1700 px at 1872)', g.fit1872);
  ok(g.fit1872.lastRight <= g.fit1872.wrapRight + 1 && g.fit1872.scrollW <= g.fit1872.wrapW + 1, '③ the table\'s 4th column is inside the column at 1872 px — no clip, no scrollbar needed', g.fit1872);
  ok(/Fit width/.test(g.fit1872.btn) && g.fit1872.btnShown, '④ the bar says the width (glyph + "Fit width") at the right of the comments button', g.fit1872.btn);
  await wshot('after-fit.png');
  await click(await rectIn('.doc-width-btn', WP)); await sleep(400);
  g.comf1872 = await inW(GEOM);
  const measure = await inW(`const p = c.querySelector('.doc-page'); return Math.round(parseFloat(getComputedStyle(p).maxWidth) - 64);`);
  ok(g.comf1872.width === 'comfortable' && g.comf1872.ls === 'comfortable' && Math.abs(g.comf1872.col - measure) <= 2 && Math.abs(g.comf1872.left - g.comf1872.right) <= 2 && /Comfortable/.test(g.comf1872.btn), '⑤ Comfortable = the 76ch measure CENTRED, remembered on the device (localStorage vs-doc-width)', { ...g.comf1872, measure });
  await call('Runtime.evaluate', { expression: `(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'doc'); const wr = w.content.querySelector('.tableWrapper'); wr.scrollLeft = wr.scrollWidth; return 1; })()` }); await sleep(200);
  const comfScrolled = await inW(GEOM);
  ok(comfScrolled.ox === 'auto' && comfScrolled.lastRight <= comfScrolled.wrapRight + 1, '⑥ in Comfortable the table SCROLLS in its own wrapper — scrolled to its end, the 4th column is inside (never clipped)', comfScrolled);
  await wshot('after-comfortable.png');
  ok(!!(await openWide(1872, 1000)) && (await inW(GEOM)).width === 'comfortable', '⑦ a reopened Doc window keeps the device\'s choice (Comfortable)');
  await click(await rectIn('.doc-width-btn', WP)); await sleep(300);
  ok(!!(await openWide(1000, 800)), '⑧ reopened maximized at 1000 px');
  g.fit1000 = await inW(GEOM);
  await call('Runtime.evaluate', { expression: `(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'doc'); const wr = w.content.querySelector('.tableWrapper'); wr.scrollLeft = wr.scrollWidth; return 1; })()` }); await sleep(200);
  const s1000 = await inW(GEOM);
  ok(g.fit1000.width === 'fit' && Math.abs(g.fit1000.left - 32) <= 2 && (g.fit1000.scrollW <= g.fit1000.wrapW + 1 || (s1000.ox === 'auto' && s1000.lastRight <= s1000.wrapRight + 1 && s1000.sticky === 'sticky' && Math.abs(s1000.firstLeft - s1000.wrapLeft) <= 6)), '⑨ at 1000 px Fit: the table fits, or scrolls in its wrapper with the first column held (sticky) — never clipped', { before: g.fit1000, scrolled: s1000 });
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 2, mobile: true }); await sleep(900);
  g.phone390 = await inW(GEOM);
  ok(g.phone390.width === 'fit' && Math.abs(g.phone390.left - 12) <= 2 && !g.phone390.btnShown, '⑩ a phone (390 px) is always Fit with a 12 px gutter; the width control is absent', g.phone390);
  ok(!!(await openWide(1872, 1000)), '⑪ back at 1872 px');
  // the ⋯ menu — downloads recorded, not navigated (an <a download> click is the page's only act)
  await ev(`window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ href: this.href, download: this.download }); }; window.__clip = []; navigator.clipboard.writeText = async (x) => { window.__clip.push(String(x)); }; return true;`);
  await click(await rectIn('.doc-more', WP)); await sleep(300);
  const rows = await ev(`return [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => [x.textContent.trim(), !!x.querySelector('svg')]);`);
  await wshot('after-menu.png');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200);
  ok(S(rows.map((r) => r[0])) === S(['Download .md', 'Export HTML', 'Print / Save as PDF', 'Copy as Markdown', 'Copy as HTML']) && rows.every((r) => r[1]), '⑫ the ⋯ menu at the bar\'s right: Download .md · Export HTML · Print / Save as PDF · Copy as Markdown · Copy as HTML, each with its glyph; no .docx row', rows);
  await menuRow('Download .md'); await sleep(300);
  const dl = await ev(`const d = window.__dl.pop(); if (!d) return null; const r = await fetch(d.href); return { ...d, status: r.status, cd: r.headers.get('content-disposition'), body: await r.text() };`);
  ok(!!dl && /\/api\/download\?/.test(dl.href) && dl.download === 'WIDE.md' && dl.status === 200 && /attachment/.test(dl.cd || '') && /WIDE\.md/.test(dl.cd || '') && dl.body === fs.readFileSync(WP, 'utf8'), '⑬ Download .md = the existing /api/download route: 200, attachment, named WIDE.md, the bytes on disk', dl && { ...dl, body: dl.body.length });
  await click(await rectIn('.ProseMirror p', WP)); await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 }); await type(' EDITED'); await sleep(300);
  await menuRow('Download .md'); await sleep(400);
  const ask = await until(() => ev(`const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save and download' && x.offsetParent); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`), 4000);
  const before = (await ev(`return window.__dl.length;`));
  if (ask) await click(ask);
  const dl2 = await until(() => ev(`return window.__dl.length > ${before} ? window.__dl[window.__dl.length - 1] : null;`), 6000);
  ok(!!ask && !!dl2 && fs.readFileSync(WP, 'utf8').includes(' EDITED'), '⑭ an UNSAVED edit asks "Save and download?" — the save lands on disk first, then the download (never a stale file)', { ask: !!ask, dl2 });
  await menuRow('Export HTML');
  const ex = await until(() => ev(`const d = window.__dl[window.__dl.length - 1]; if (!d || !/^blob:/.test(d.href)) return null; return { ...d, html: await (await fetch(d.href)).text() };`), 8000);
  fs.mkdirSync(OUT, { recursive: true }); const exPath = path.join(OUT, 'WIDE.html'); if (ex) fs.writeFileSync(exPath, ex.html);
  ok(!!ex && ex.download === 'WIDE.html' && !/<script\b/i.test(ex.html) && /<table/.test(ex.html) && /:root\{--/.test(ex.html) && /data:image\/png;base64,/.test(ex.html) && ex.html.includes('https://example.com/kept') && /@page\{margin:16mm\}/.test(ex.html) && ex.html.includes('RAWHITSEND'), '⑮ Export HTML = ONE self-contained WIDE.html: no script, theme tokens + styles inlined, the image beside the file inlined, links kept', ex && { download: ex.download, size: ex.html.length });
  if (ex) {
    const tgt = await call('Target.createTarget', { url: pathToFileURL(exPath).href });
    const tws = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.id === tgt.targetId)?.webSocketDebuggerUrl, 8000);
    const w2 = new WebSocket(tws); await new Promise((r, e) => { w2.on('open', r); w2.on('error', e); });
    await sleep(800);
    const st = await new Promise((r) => { w2.on('message', (d) => { const m = JSON.parse(d); if (m.id === 1) r(m.result?.result?.value); }); w2.send(S({ id: 1, method: 'Runtime.evaluate', params: { expression: `(() => { const t = document.querySelector('table'), th = document.querySelectorAll('th')[3], img = document.querySelector('img'); return { scripts: document.scripts.length, th: th && th.textContent, thW: th ? Math.round(th.getBoundingClientRect().width) : 0, img: img ? img.naturalWidth : 0, bg: getComputedStyle(document.body).backgroundColor }; })()`, returnByValue: true } })); });
    w2.close(); await call('Target.closeTarget', { targetId: tgt.targetId });
    ok(!!st && st.scripts === 0 && st.th === 'Raw hits' && st.thW > 40 && st.img > 0, '⑯ the exported file opens STANDALONE in a second tab: the table renders (4th header "Raw hits"), the image drawn, zero scripts', st);
  }
  await menuRow('Print / Save as PDF');
  const pf = await until(() => ev(`const f = document.querySelectorAll('iframe.doc-print-frame'); if (f.length !== 1 || f[0].dataset.printed !== '1') return null; const d = f[0].contentDocument; return { n: f.length, sandbox: f[0].getAttribute('sandbox'), page: /@page\\{margin:16mm\\}/.test(d.documentElement.outerHTML), table: !!d.querySelector('table'), scripts: d.scripts.length };`), 10000);
  ok(!!pf && pf.n === 1 && pf.page && pf.table && pf.scripts === 0 && !/allow-scripts/.test(pf.sandbox), '⑰ Print = ONE transient hidden frame holding the same document + the print sheet (16 mm pages); sandbox without allow-scripts; print() called', pf);
  await menuRow('Copy as Markdown'); await sleep(300);
  await menuRow('Copy as HTML'); await sleep(500);
  const clip = await ev(`return window.__clip.slice();`);
  ok(clip.length === 2 && clip[0] === fs.readFileSync(WP, 'utf8') && /<table/.test(clip[1]) && !/<script/i.test(clip[1]), '⑱ Copy as Markdown = the source; Copy as HTML = the sanitized rendered fragment', clip.map((x) => x.length));
  // a hostile document: the export carries no script, no handler, no javascript: link
  const HP = path.join(DOCS, 'HOSTILE.md'); fs.writeFileSync(HP, '# Hostile\n\nA [bad link](javascript:alert(1)) and [ok](https://example.com/ok).\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); app.openFile(${S(HP)}, 'HOSTILE.md', {}); return true;`);
  const hrich = await until(() => ev(`const w = ${DW(HP)}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelector('table') ? true : null;`), 15000, 200);
  let hx = null;
  if (hrich) { await click(await rectIn('.doc-more', HP)); await sleep(200); const r = await ev(`const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === 'Export HTML'); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`); if (r) await click(r);
    hx = await until(() => ev(`const d = window.__dl[window.__dl.length - 1]; if (!d || d.download !== 'HOSTILE.html') return null; return await (await fetch(d.href)).text();`), 8000); }
  ok(!!hx && !/<script\b/i.test(hx) && !/javascript:/i.test(hx.replace(/&lt;[^]*?&gt;/g, '')) && !/<[^>]*\sonerror\s*=/i.test(hx) && hx.includes('https://example.com/ok'), '⑲ a hostile .md (script / javascript: link / onerror) exports with none of them (the one sanitizer)', hx && hx.length);
  ok(pageErrors.length === 0, '⑳ no page exception through §10', pageErrors.slice(0, 3));
  console.log('    widths:', S({ fit1872: g.fit1872.col, comf1872: g.comf1872.col, fit1000: g.fit1000.col, phone390: g.phone390.col, pane1872: g.fit1872.pane, pane1000: g.fit1000.pane, pane390: g.phone390.pane }));
  }
  if (ONLY === '' || ONLY === 'print') {
  // ── §11 print fidelity (lane doc-print-fidelity, 2.369.241 — owner 2026-10-08 "你这个存为PDF效果很差 需要优化": a lane brief
  //    printed as monospace boxes cut at the right edge, scrollbars painted, "1 page") — Print / Export render the SOURCE
  section('§11 Print / Save as PDF renders the markdown: a lane brief prints as a document — a heading, a list, no code box, nothing cut, real pages');
  const PSHOTS = process.env.VS_DOC_PRINT_SHOTS || SHOTS;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` });
  if (!ok(!!(await boot(1280, 900, false)), '§11 the client re-booted at 1280×900 in en')) throw new Error('no app for §11');
  const PD = path.join(fs.realpathSync(PROJ), 'print'); fs.mkdirSync(PD, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  const BRIEF = fs.readFileSync(path.join(REPO, 'scripts/fixtures/doc-print/lane-brief.md'), 'utf8');
  const BP = path.join(PD, 'lane-brief.md'); fs.writeFileSync(BP, BRIEF);
  const FORTY = '# Forty paragraphs\n\n' + Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: ` + 'the print sheet lets the document flow onto as many pages as it needs, '.repeat(4) + `https://example.com/${'a'.repeat(120)}\n`).join('\n')
    + '\n```text\n' + Array.from({ length: 90 }, (_, i) => `line ${i + 1} ` + 'x'.repeat(i % 7 === 0 ? 220 : 40)).join('\n') + '\n```\n\n'
    + '| ' + Array.from({ length: 11 }, (_, i) => 'Column ' + (i + 1)).join(' | ') + ' |\n|' + '---|'.repeat(11) + '\n| ' + Array.from({ length: 11 }, (_, i) => `cell-${i + 1}-` + 'w'.repeat(30)).join(' | ') + ' |\n\nENDOFFORTY\n';
  const FP = path.join(PD, 'forty.md'); fs.writeFileSync(FP, FORTY);
  const has = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'ignore' }); return true; } catch { return false; } };
  const squash = (x) => (String(x).match(/[\p{L}\p{N}]+/gu) || []).join(''); // letters + digits only: wrapping and punctuation spacing aside
  /** A second tab on `url`: steps(send) with its own CDP socket, closed after. */
  async function tab(url, steps) {
    const tgt = await call('Target.createTarget', { url });
    const tws = await until(async () => (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.id === tgt.targetId)?.webSocketDebuggerUrl, 8000);
    const w2 = new WebSocket(tws, { maxPayload: 256 * 1024 * 1024 }); await new Promise((r, e) => { w2.on('open', r); w2.on('error', e); });
    let n = 0; const waits = new Map(); w2.on('message', (d) => { const m = JSON.parse(d); if (waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++n; waits.set(id, r); w2.send(S({ id, method, params })); });
    try { await sleep(700); return await steps(send); } finally { w2.close(); await call('Target.closeTarget', { targetId: tgt.targetId }); }
  }
  /** Open `p` in the Doc window, ⋯ → Print / Save as PDF; the print frame's document printed by Page.printToPDF (A4, its own
   *  16 mm @page) + a layout census under print media at the page box's width (A4 − 2×16 mm = 673 CSS px). */
  async function printOf(p, nm) {
    await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); return true;`); await sleep(300);
    await ev(`app.openFile(${S(p)}, ${S(nm)}, {}); return true;`);
    const up = await until(() => ev(`const w = ${DW(p)}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.childElementCount > 1 ? w.id : null;`), 20000, 200);
    if (!up) return null;
    const screen = await ev(`const w = ${DW(p)}; const pm = w.content.querySelector('.doc-page .ProseMirror'); return { raw: pm.querySelectorAll('.doc-rawblock').length, h1: pm.querySelectorAll('h1').length, ol: pm.querySelectorAll('ol > li').length };`);
    await click(await rectIn('.doc-more', p)); await sleep(200);
    const row = await ev(`const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => x.textContent.trim() === 'Print / Save as PDF'); if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    if (row) await click(row); else return { screen };
    const html = await until(() => ev(`const f = document.querySelector('iframe.doc-print-frame'); return f && f.dataset.printed === '1' ? f.srcdoc : null;`), 12000);
    if (!html) return { screen };
    const file = path.join(OUT, nm.replace(/\.md$/, '.print.html')); fs.writeFileSync(file, html);
    return tab(pathToFileURL(file).href, async (send) => {
      const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, paperWidth: 8.27, paperHeight: 11.69 });
      const buf = Buffer.from(pdf.result?.data || '', 'base64'), pdfPath = path.join(OUT, nm.replace(/\.md$/, '.pdf')); fs.writeFileSync(pdfPath, buf);
      const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      const text = has('pdftotext') ? execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' }) : null;
      await send('Emulation.setEmulatedMedia', { media: 'print' });
      await send('Emulation.setDeviceMetricsOverride', { width: Math.floor((210 - 32) / 25.4 * 96), height: 1000, deviceScaleFactor: 1, mobile: false }); await sleep(300);
      const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const W = document.documentElement.clientWidth, over = [], clip = [];
        for (const e of document.body.querySelectorAll('*')) { const b = e.getBoundingClientRect(); if (b.width && b.right > W + 1) over.push(e.tagName + ' ' + Math.round(b.right)); const cs = getComputedStyle(e); if (/auto|scroll|hidden/.test(cs.overflowX + ' ' + cs.overflowY) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)) clip.push(e.tagName + ' ' + cs.overflowX + '/' + cs.overflowY); }
        const art = document.querySelector('article'), li = [...art.querySelectorAll('ol > li')], h1 = art.querySelector('h1');
        return { W, docW: document.documentElement.scrollWidth, over: over.slice(0, 5), nOver: over.length, clip: clip.slice(0, 5), raw: document.querySelectorAll('.doc-rawblock').length, first: art.firstElementChild && art.firstElementChild.tagName,
          h1: h1 ? h1.textContent : '', ol: li.length, liInline: li.filter((x) => x.querySelector('code') && x.querySelector('strong')).length, pre: [...art.querySelectorAll('pre')].map((x) => getComputedStyle(x).whiteSpace + ' ' + getComputedStyle(x).overflowX + ' ' + getComputedStyle(x).breakInside),
          cols: [...art.querySelectorAll('.tableWrapper')].map((x) => x.dataset.cols || ''), font: getComputedStyle(art).fontSize, height: art.getBoundingClientRect().height }; })()` });
      return { screen, pages, pdfPath, bytes: buf.length, text, lay: r.result?.result?.value };
    });
  }
  const b = await printOf(BP, 'lane-brief.md');
  const bl = b && b.lay;
  console.log('    the brief ON SCREEN:', S(b && b.screen), '— a bare `/p/<id>` is text in the editor since 2.369.267 (lane doc-table-native: a literal tag is text), so no raw block');
  ok(!!bl && bl.first === 'H1' && /^Lane pages-chip-groups — the chat's Pages chip/.test(bl.h1) && bl.h1.includes('/p/<id>') && bl.ol === 4 && bl.liInline === 4 && bl.raw === 0, '① the brief PRINTS as a document: the first line an <h1> (its /p/<id> kept as text), the numbered list an <ol> of 4 items with inline code + bold, NO raw block', bl && { first: bl.first, h1: bl.h1.slice(0, 80), ol: bl.ol, liInline: bl.liInline, raw: bl.raw });
  ok(!!bl && bl.nOver === 0 && bl.docW <= bl.W && bl.clip.length === 0 && bl.pre.every((x) => /^pre-wrap visible auto$/.test(x)) && bl.font === '14.6667px', '② nothing wider than the A4 page box (673 px) under print media, no clipping / scroll container, pre wraps and may break across pages, body 11 pt', bl && { W: bl.W, docW: bl.docW, over: bl.over, clip: bl.clip, pre: bl.pre, font: bl.font });
  const ends = BRIEF.split('\n').filter((l) => l.trim()).map((l) => (l.match(/[\p{L}\p{N}]+/gu) || []).slice(-3).join(''));
  const missing = b && b.text != null ? ends.filter((e) => !squash(b.text).includes(e)) : null;
  ok(!!b && b.pages >= 1 && b.bytes > 10000 && (missing === null || missing.length === 0), `③ the brief's PDF: ${b && b.pages} page(s) — every line's END is in the PDF text (nothing cut at the right edge)${missing === null ? ' [pdftotext absent: text leg skipped]' : ''}`, { pages: b && b.pages, missing });
  if (PSHOTS && b && has('pdftoppm')) execFileSync('pdftoppm', ['-png', '-r', '90', '-f', '1', '-l', '1', '-singlefile', b.pdfPath, path.join(PSHOTS, 'after-print-p1')]);
  if (PSHOTS && b && has('pdftoppm')) execFileSync('pdftoppm', ['-png', '-r', '90', '-f', '2', '-l', '2', '-singlefile', b.pdfPath, path.join(PSHOTS, 'after-print-p2')]);
  ok(!PSHOTS || (has('pdftoppm') && fs.existsSync(path.join(PSHOTS, 'after-print-p1.png')) && fs.statSync(path.join(PSHOTS, 'after-print-p1.png')).size > 10000), `④ the PDF's page 1 rendered for the owner (pdftoppm): ${PSHOTS ? path.join(PSHOTS, 'after-print-p1.png') : '(no shots dir)'}`);
  const f = await printOf(FP, 'forty.md');
  const fl = f && f.lay;
  ok(!!f && f.pages >= 2 && !!fl && fl.nOver === 0 && fl.clip.length === 0 && fl.raw === 0 && S(fl.cols) === S(['xl']) && (f.text == null || (f.text.includes('ENDOFFORTY') && /line 90 x/.test(f.text) && f.text.includes('Paragraph 40:'))), `⑤ 40 paragraphs + a 90-line code block + an 11-column table print on ${f && f.pages} pages (≥ 2): the code block breaks across pages, the table fits the page (type stepped: xl), the last line printed`, f && { pages: f.pages, over: fl && fl.over, clip: fl && fl.clip, cols: fl && fl.cols, height: fl && fl.height });
  ok(pageErrors.length === 0, '⑥ no page exception through §11', pageErrors.slice(0, 3));
  }
  if (ONLY === '' || ONLY === 'raw') {
  // ── §12 raw blocks READ as documents (lane doc-raw-blocks, 2.369.246 — owner 2026-10-09 "这个会莫名其妙变成源码的问题还没修复":
  //    §2.7 of his design doc, a GFM table whose cells hold <code>, drawn as a grey "Markdown · 以源码编辑" source block)
  section('§12 a table with inline <code> opens as a TABLE; a <details> block reads rendered, its chip edits its source in place; Save ⇒ only that block changes');
  const RSHOTS = process.env.VS_DOC_RAW_SHOTS || SHOTS, RTAG = process.env.VS_DOC_RAW_SHOT_TAG || 'after';
  const rshot = async (n) => { if (!RSHOTS) return null; const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(RSHOTS, n); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); localStorage.removeItem('vs-doc-width'); } catch {}` });
  if (!ok(!!(await boot(1400, 900, false)), '§12 the client re-booted at 1400×900 in zh (the owner\'s window shape)')) throw new Error('no app for §12');
  const RD = path.join(fs.realpathSync(PROJ), 'raw'); fs.mkdirSync(RD, { recursive: true });
  const OWNER = fs.readFileSync(path.join(REPO, 'scripts/fixtures/doc-wheel/31-table-inline-html.md'), 'utf8');
  const OP = path.join(RD, 'design-shape.md'); fs.writeFileSync(OP, OWNER);
  const RAWDOC = '# Raw blocks\n\nIntro line.\n\n<details>\n<summary>Why a bag</summary>\n\nTwo equal rows stay two.\n\n</details>\n\n<div><b>Boxed</b> words <img src="x.png" onerror="window.__rawXss = 1"></div>\n\n<!-- reviewer: keep the bag -->\n\nTail paragraph.\n';
  const RP = path.join(RD, 'raw-blocks.md'); fs.writeFileSync(RP, RAWDOC);
  async function openMax(p, nm) {
    await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); return true;`); await sleep(300);
    await ev(`app.openFile(${S(p)}, ${S(nm)}, {}); return true;`);
    const up = await until(() => ev(`const w = ${DW(p)}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.childElementCount > 1 ? w.id : null;`), 20000, 200);
    if (up) { await ev(`app.wm.toggleMaximize(${S(up)}); return true;`); await sleep(700); }
    return up;
  }
  const inR = (p, js) => ev(`const w = ${DW(p)}; const pm = w.content.querySelector('.doc-page .ProseMirror'); const R = (e) => e.getBoundingClientRect(); ${js}`);
  ok(!!(await openMax(OP, 'design-shape.md')), '① the owner\'s shape (fixture 31) opened in the Doc window, maximized at 1400 px');
  await inR(OP, `const t = pm.querySelector('table') || pm.querySelector('.doc-rawblock'); if (t) t.scrollIntoView({ block: 'start' }); return true;`); await sleep(400);
  const own = await inR(OP, `const t = pm.querySelector('table'), step = t && [...t.querySelectorAll('code')].find((x) => x.textContent === 'STEP-nn');
    return { raw: pm.querySelectorAll('.doc-rawblock').length, rows: t ? t.rows.length : 0, code: t ? [...t.querySelectorAll('code')].map((c) => c.textContent) : [], kbd: t ? t.querySelectorAll('kbd').length : 0, sup: t ? t.querySelectorAll('sup').length : 0, br: t ? t.querySelectorAll('td br').length : 0,
      chip: step ? getComputedStyle(step).fontFamily + ' | ' + getComputedStyle(step).backgroundColor : null, mono: t && [...t.querySelectorAll('td')].some((td) => /mono/i.test(getComputedStyle(td).fontFamily)),
      bare: (() => { const td = [...pm.querySelectorAll('td')].find((x) => x.textContent.includes('names its step')), b = td && td.closest('table'); return td ? { native: !td.closest('.doc-rawblock') && b !== t && td.isContentEditable, table: !!b.closest('.tableWrapper'), code: td.querySelectorAll('code').length, mono: /mono/i.test(getComputedStyle(td).fontFamily), text: td.textContent.slice(0, 60) } : null; })() };`);
  const ownShot = await rshot(`${RTAG}.png`);
  ok(own.raw === 0 && own.rows === 4 && ['STEP-nn', 'ledger.review.read', 'replaces = prior id'].every((c) => own.code.includes(c)) && own.kbd === 2 && own.sup === 1 && own.br === 1 && /mono/i.test(own.chip || '') && !own.mono,
    '② it opens as a TABLE (4 rows) with inline code chips — <code>STEP-nn</code> beside the backticked `replaces = prior id`, <kbd> ×2, <sup>, a <br> in its cell — no grey source block, the cells in the prose font', own);
  await inR(OP, `const t2 = pm.querySelectorAll('table')[1]; if (t2) t2.scrollIntoView({ block: 'center' }); return true;`); await sleep(300);
  await rshot(`${RTAG}-bare.png`);
  ok(!!own.bare && own.bare.native && own.bare.table && own.bare.code === 0 && !own.bare.mono && own.bare.text.includes('STEP-<code>-nn until export'), '②b the second table (a cell with a BARE <code> placeholder) is a NATIVE table too (lane doc-table-native: a literal tag is text): STEP-<code>-nn shown as written in an editable cell, no <code> element opened, the prose font', own.bare);
  // ③ a cell is a real cell: the caret at the end of the 'Catalog digest' rule, a typed mark, Ctrl+S ⇒ that row's line only
  const cellP = await inR(OP, `const c = pm.querySelector('table tr:nth-child(3) td:nth-child(2) p') || pm.querySelector('table tr:nth-child(3) td:nth-child(2)'); c.scrollIntoView({ block: 'center' }); const r = R(c); return { x: r.right - 3, y: r.bottom - 8 };`);
  await click(cellP); await type('Ⓧ'); await sleep(150); await ctrlS();
  const saved = await until(() => { const t = fs.readFileSync(OP, 'utf8'); return t.includes('Ⓧ') ? t : null; }, 8000);
  const oL = OWNER.split('\n'), nL = String(saved || '').split('\n'), diff = oL.map((l, i) => (l === nL[i] ? null : i)).filter((x) => x !== null);
  ok(!!saved && oL.length === nL.length && diff.length === 1 && nL[diff[0]] === oL[diff[0]].replace(/ \|$/, 'Ⓧ |') && /^\| Catalog digest \|/.test(oL[diff[0]]), '③ typing at the end of a cell + Ctrl+S ⇒ exactly that row\'s line changed (the mark at its end), every other line — the <code> / <kbd> / <br> rows included — byte-identical', { diff, line: diff.length ? nL[diff[0]].slice(-60) : null });
  fs.writeFileSync(OP, OWNER);
  // ④ the blocks that stay raw READ rendered; a hostile <img onerror> never runs; a comment shows its source, the chip says why
  ok(!!(await openMax(RP, 'raw-blocks.md')), '④ a document with a <details> block, an HTML <div> (a hostile <img onerror>) and a comment opened');
  await sleep(600);
  const rb = await inR(RP, `return { blocks: [...pm.querySelectorAll('.doc-rawblock')].map((b) => ({ rendered: b.dataset.rendered, head: (b.querySelector('.doc-raw-head') || {}).textContent || '', details: !!b.querySelector('details > summary'), src: (b.querySelector('.doc-raw-src') || {}).textContent || '', ce: b.getAttribute('contenteditable'), onerror: !!b.querySelector('[onerror]'), bold: !!b.querySelector('b'), pre: !!b.querySelector('pre') })), xss: window.__rawXss === 1 };`);
  const B = rb.blocks;
  ok(B.length === 4 && B[0].rendered === '1' && B[0].details && B[0].head === 'HTML 块 · 已按内容显示 · 点此编辑源码' && B[0].ce === 'false' && B[2].rendered === '1' && B[2].bold && !B[2].onerror && !rb.xss && !B.some((x) => x.pre),
    '⑤ the <details> block and the <div> READ rendered (a <details> with its summary, bold words), read-only, the chip "HTML 块 · 已按内容显示 · 点此编辑源码" (the words since lane doc-table-native); the <img onerror> carries no handler and never ran; no block drawn as a source <pre>', rb);
  ok(B[1].rendered === '0' && B[1].src === '</details>' && B[3].rendered === '0' && B[3].src === '<!-- reviewer: keep the bag -->' && B[3].head === 'HTML 块 · 无法显示，给出源码 · 点此编辑', '⑥ a block that reads as nothing (the lone </details>, the comment) shows its SOURCE and its chip says it cannot be rendered', [B[1], B[3]]);
  await rshot(`${RTAG}-raw.png`);
  // ⑦ arrows step over a raw block as one unit
  const intro = await inR(RP, `const p = pm.querySelector('p'); const r = R(p); return { x: r.right - 3, y: r.top + r.height / 2 };`);
  await click(intro);
  for (const k of ['End', 'ArrowDown']) { await call('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: k === 'End' ? 35 : 40 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: k === 'End' ? 35 : 40 }); await sleep(120); }
  const sel1 = await inR(RP, `const s = pm.querySelector('.ProseMirror-selectednode'); return s ? s.className + ' ' + (s.querySelector('summary') || {}).textContent : null;`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }); await sleep(150);
  const sel2 = await inR(RP, `const a = getSelection().anchorNode; const el = a && (a.nodeType === 1 ? a : a.parentElement); return { node: !!pm.querySelector('.ProseMirror-selectednode'), in: el ? (el.closest('p') || {}).textContent || el.tagName : null };`);
  ok(/doc-rawblock/.test(sel1 || '') && /Why a bag/.test(sel1 || '') && !sel2.node && sel2.in === 'Two equal rows stay two.', '⑦ ArrowDown from the line above selects the raw block as ONE unit; the next ArrowDown leaves it for the paragraph below', { sel1, sel2 });
  // ⑧ the chip opens the source IN PLACE; Esc ⇒ re-rendered; Ctrl+S ⇒ only that block's lines change
  await click(await rectIn('.doc-rawblock .doc-raw-head', RP)); await sleep(300);
  const ed1 = await inR(RP, `const ta = pm.querySelector('.doc-rawblock textarea.doc-raw-edit'); return ta ? { value: ta.value, focused: document.activeElement === ta, h: Math.round(R(ta).height), mono: /mono/i.test(getComputedStyle(ta).fontFamily), done: (pm.querySelector('.doc-raw-done') || {}).textContent || '' } : null;`);
  ok(!!ed1 && ed1.value === '<details>\n<summary>Why a bag</summary>' && ed1.focused && ed1.h >= 40 && ed1.mono && ed1.done === '完成', '⑧ a press on the chip opens THIS block\'s source in place (a focused monospace box the block\'s size, Finish (完成) beside it) — not the whole-document Raw', ed1);
  await inR(RP, `const ta = pm.querySelector('textarea.doc-raw-edit'); ta.select(); return true;`);
  await type('<details open>\n<summary>Why a bag — edited</summary>'); await sleep(150);
  await rshot(`${RTAG}-raw-edit.png`);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300);
  const ed2 = await inR(RP, `const b = pm.querySelector('.doc-rawblock'); return { ta: !!pm.querySelector('textarea.doc-raw-edit'), open: !!b.querySelector('details[open]'), summary: (b.querySelector('summary') || {}).textContent || '', dirty: (w.content.querySelector('.doc-save-btn') || {}).dataset?.state || '' };`);
  ok(!ed2.ta && ed2.open && ed2.summary === 'Why a bag — edited' && ed2.dirty === 'dirty', '⑨ Esc writes it back: the block re-renders from its new source (open, the new summary), the document is dirty', ed2);
  await ctrlS();
  const want = RAWDOC.replace('<details>\n<summary>Why a bag</summary>', '<details open>\n<summary>Why a bag — edited</summary>');
  const disk = await until(() => { const t = fs.readFileSync(RP, 'utf8'); return t !== RAWDOC ? t : null; }, 8000);
  ok(disk === want, '⑩ Ctrl+S ⇒ the file differs in exactly that block\'s two lines; the paragraph, the </details>, the <div>, the comment and the tail byte-identical', disk && disk.slice(0, 160));
  // ⑩b the chip toggles: a second press while the box is open closes it (it does not reopen)
  await click(await rectIn('.doc-rawblock .doc-raw-head', RP)); await sleep(250);
  const tog1 = await inR(RP, `return !!pm.querySelector('textarea.doc-raw-edit');`);
  await click(await rectIn('.doc-rawblock .doc-raw-head', RP)); await sleep(300);
  const tog2 = await inR(RP, `return { ta: !!pm.querySelector('textarea.doc-raw-edit'), rendered: (pm.querySelector('.doc-rawblock') || {}).dataset?.rendered, disk: null };`);
  ok(tog1 && !tog2.ta && tog2.rendered === '1' && fs.readFileSync(RP, 'utf8') === want, '⑩b a second press on the chip closes the open box (no reopen), the block reads rendered again, nothing changed on disk', { tog1, tog2 });
  ok(!!(await until(() => (pageErrors.length === 0 ? true : null), 300)) || pageErrors.length === 0, '⑪ no page exception through §12', pageErrors.slice(0, 3));
  if (RSHOTS) ok(!!ownShot && fs.statSync(ownShot).size > 10000, `⑫ PNGs for the owner: ${path.join(RSHOTS, RTAG + '.png')} (+ -raw, -raw-edit)`);
  }
  if (ONLY === '' || ONLY === 'table') {
  // ── §17 a standard table is a TABLE (lane doc-table-native, 2.369.267 — owner 2026-10-14 「这下面不是标准的表格吗 为啥显示说是源码？」:
  //    an agent's report whose 10-column table held a bare <absent> in two cells drew as a raw block 「Markdown · 原样保留，点此改源码」)
  section('§17 the owner\'s shape (a 10-column table whose cells hold a bare <absent>) opens as a NATIVE table at desk width; what stays raw says what it is');
  const TSHOTS = process.env.VS_DOC_TABLE_SHOTS || SHOTS, TTAG = process.env.VS_DOC_TABLE_SHOT_TAG || 'after';
  const tshot = async (n) => { if (!TSHOTS) return null; const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(TSHOTS, n); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'zh'); localStorage.removeItem('vs-doc-width'); } catch {}` });
  if (!ok(!!(await boot(1400, 900, false)), '§17 the client re-booted at 1400×900 in zh (the owner\'s desk)')) throw new Error('no app for §17');
  const TD = path.join(fs.realpathSync(PROJ), 'tables'); fs.mkdirSync(TD, { recursive: true });
  const F32 = fs.readFileSync(path.join(REPO, 'scripts/fixtures/doc-wheel/32-table-placeholder-cells.md'), 'utf8');
  const TP = path.join(TD, 'adjudication.md'); fs.writeFileSync(TP, F32);
  const RAWDOC = '# Notes\n\nOpen /p/<id> to read the published copy.\n\n<details>\n<summary>Why two rows</summary>\n\nThey differ in the year.\n\n</details>\n\n<!-- reviewer: keep both -->\n\nTail paragraph.\n';
  const RP = path.join(TD, 'notes.md'); fs.writeFileSync(RP, RAWDOC);
  const openT = async (p, nm) => {
    await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); return true;`); await sleep(300);
    await ev(`app.openFile(${S(p)}, ${S(nm)}, {}); return true;`);
    const up = await until(() => ev(`const w = ${DW(p)}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.childElementCount > 1 ? w.id : null;`), 20000, 200);
    if (up) { await ev(`app.wm.toggleMaximize(${S(up)}); return true;`); await sleep(700); }
    return up;
  };
  const inT = (p, js) => ev(`const w = ${DW(p)}; const pm = w.content.querySelector('.doc-page .ProseMirror'); const R = (e) => e.getBoundingClientRect(); ${js}`);
  ok(!!(await openT(TP, 'adjudication.md')), '① the owner\'s shape (fixture 32) opened in the Doc window, maximized at 1400 px');
  await inT(TP, `const h = [...pm.querySelectorAll('h2')].pop(); if (h) h.scrollIntoView({ block: 'start' }); return true;`); await sleep(400);
  const shot = await tshot(`${TTAG}.png`);
  const tv = await inT(TP, `const t = pm.querySelector('table'), raw = pm.querySelectorAll('.doc-rawblock').length, chip = !!pm.querySelector('.doc-raw-head');
    if (!t) return { raw, chip, table: false, chipText: (pm.querySelector('.doc-raw-head') || {}).textContent || '' };
    const tds = [...t.querySelectorAll('td')], abs = tds.filter((x) => x.textContent.trim() === '<absent>');
    const tr = t.rows[1], pad = (td) => parseFloat(getComputedStyle(td).paddingTop) + parseFloat(getComputedStyle(td).paddingBottom);
    const inner = [...tr.cells].map((td) => { const r = document.createRange(); r.selectNodeContents(td); return Math.round(r.getBoundingClientRect().height); });
    const tallest = inner.indexOf(Math.max(...inner)), code = tr.cells[2];
    return { raw, chip, table: true, wrapped: !!t.closest('.tableWrapper'), rows: t.rows.length, cols: t.rows[0].cells.length, absent: abs.length, absentEditable: abs.every((x) => x.isContentEditable), absentEl: abs.some((x) => x.querySelector('absent')),
      codes: [...t.querySelectorAll('code')].map((c) => c.textContent), rowH: Math.round(R(tr).height), pad: pad(tr.cells[0]), inner, tallest, codeCell: Math.round(code.querySelector('code') ? R(code.querySelector('code')).height : 0),
      tableW: Math.round(R(t).width), pageW: Math.round(R(pm).width), colW: [...t.rows[0].cells].map((c) => Math.round(R(c).width)) };`);
  ok(tv.table && tv.raw === 0 && !tv.chip && tv.wrapped && tv.rows === 5 && tv.cols === 10, '② a NATIVE table (5 rows × 10 columns in its scrolling wrapper) — no raw block, no chip', tv);
  ok(tv.absent === 2 && tv.absentEditable && !tv.absentEl && ['terms.deposit_months.count', 'fees.late_tiers[all#2]', 'term.survival_years', 'pricing.unit_price.amount'].every((c) => (tv.codes || []).includes(c)), '③ both <absent> cells read "<absent>" as text in editable cells (no element), the code spans with underscores drawn as inline code', tv);
  ok(tv.table && tv.tallest >= 8 && tv.inner[tv.tallest] + tv.pad >= tv.rowH - 2 && tv.inner[2] <= tv.inner[tv.tallest] / 2, '④ the TALL ROW measured: the row is as tall as its tallest cell — a long quoted column (reason / deciding quote) — while the code-span cell holds one short line (its "tall blank" is the row, not the cell)', { rowH: tv.rowH, inner: tv.inner, tallest: tv.tallest, colW: tv.colW, tableW: tv.tableW, pageW: tv.pageW });
  console.log(`    the tall row: row ${tv.rowH} px · each cell's content ${S(tv.inner)} · columns ${S(tv.colW)} (table ${tv.tableW} px in a ${tv.pageW} px page)`);
  // ⑤ a letter typed after the first <absent> + Ctrl+S ⇒ that row's line only, the tag kept as written
  const cellA = await inT(TP, `const td = [...pm.querySelectorAll('td')].find((x) => x.textContent.trim() === '<absent>'); td.scrollIntoView({ block: 'center' }); const r = document.createRange(); r.selectNodeContents(td.querySelector('p') || td); const b = r.getBoundingClientRect(); return { x: b.right - 1, y: b.top + b.height / 2 };`);
  await click(cellA); await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 }); await sleep(100);
  await type('Ⓧ'); await sleep(150); await ctrlS();
  const savedT = await until(() => { const t = fs.readFileSync(TP, 'utf8'); return t.includes('Ⓧ') ? t : null; }, 8000);
  const tL = F32.split('\n'), sL = String(savedT || '').split('\n'), tdiff = tL.map((l, i) => (l === sL[i] ? null : i)).filter((x) => x !== null);
  ok(!!savedT && tL.length === sL.length && tdiff.length === 1 && sL[tdiff[0]] === tL[tdiff[0]].replace('| <absent> |', '| <absent>Ⓧ |') && /^\| R007 \|/.test(tL[tdiff[0]]), '⑤ typing at the end of an <absent> cell + Ctrl+S ⇒ exactly that row\'s line changed (<absent>Ⓧ, the tag as written), every other line byte-identical', { tdiff, line: tdiff.length ? sL[tdiff[0]].slice(0, 120) : null });
  fs.writeFileSync(TP, F32);
  // ⑥ what stays raw says what it is; a /p/<id> paragraph is a paragraph
  ok(!!(await openT(RP, 'notes.md')), '⑥ a document with a /p/<id> paragraph, a <details> block and an HTML comment opened');
  await sleep(500);
  const rawShot = await tshot(`${TTAG}-raw.png`);
  const rv = await inT(RP, `return { heads: [...pm.querySelectorAll('.doc-rawblock .doc-raw-head')].map((h) => h.textContent), p: [...pm.querySelectorAll(':scope > p')].map((x) => x.textContent) };`);
  ok(rv.heads.length === 3 && rv.heads[0] === 'HTML 块 · 已按内容显示 · 点此编辑源码' && rv.heads[1] === 'HTML 块 · 无法显示，给出源码 · 点此编辑' && rv.heads[2] === rv.heads[1] && rv.p.includes('Open /p/<id> to read the published copy.'), '⑦ the chip says what the block is: 「HTML 块 · 已按内容显示 · 点此编辑源码」 (the <details>, read rendered) / 「HTML 块 · 无法显示，给出源码 · 点此编辑」 (the lone </details>, the comment); the /p/<id> line is a paragraph, not a raw block', rv);
  ok(pageErrors.length === 0, '⑧ no page exception through §17', pageErrors.slice(0, 3));
  if (TSHOTS) ok(!!shot && fs.statSync(shot).size > 10000 && !!rawShot && fs.statSync(rawShot).size > 10000, `⑨ PNGs for the owner: ${path.join(TSHOTS, TTAG + '.png')} + ${TTAG}-raw.png`);
  }
  if (ONLY === '' || ONLY === 'rawcmt') {
  // ── §13 a raw block is commentable (lane doc-comment-raw-block, 2.369.258 — owner 2026-10-12 "这个html部分无法批注": a blog
  //    draft's HTML comment block "<!-- [CONFIRM-BLOCK …] -->" drawn as its source box could not be annotated)
  section('§13 a raw block is commentable: a click on it quotes the block, a selection inside its source box quotes the text; reload ⇒ the strip finds it; an open box ⇒ no button + a toast; desk 1100 + phone 390');
  const CSHOTS = process.env.VS_DOC_RAWCMT_SHOTS || SHOTS;
  const cshot = async (n) => { if (!CSHOTS) return null; const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(CSHOTS, n); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); localStorage.removeItem('vs-doc-width'); } catch {}` });
  const CD = path.join(fs.realpathSync(PROJ), 'rawcmt'); fs.mkdirSync(CD, { recursive: true });
  const CDOC = '---\ntitle: Draft\n---\n\n# Blog draft\n\nIntro paragraph for the reader.\n\n<!-- [CONFIRM-BLOCK id=7]\nkeep the bag\n-->\n\nTail paragraph.\n';
  const CP = path.join(CD, 'blog-draft.md'); fs.writeFileSync(CP, CDOC);
  const KEY = 'doc:\u0001' + CP; // the drafts store's row (lane doc-comments-synced; int259 seam: this section read localStorage)
  async function openDoc(max) {
    await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); return true;`); await sleep(300);
    await ev(`app.openFile(${S(CP)}, 'blog-draft.md', {}); return true;`);
    const up = await until(() => ev(`const w = ${DW(CP)}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelectorAll('.doc-rawblock').length >= 2 ? w.id : null;`), 20000, 200);
    if (up && max) { await ev(`app.wm.toggleMaximize(${S(up)}); return true;`); await sleep(700); }
    return up;
  }
  const inC = (js) => ev(`const w = ${DW(CP)}; const pm = w.content.querySelector('.doc-page .ProseMirror'); const R = (e) => e.getBoundingClientRect(); const H = [...pm.querySelectorAll('.doc-rawblock')].find((b) => /^HTML/.test((b.querySelector('.doc-raw-head') || {}).textContent || '')); ${js}`);
  const btnNow = () => ev(`const b = document.querySelector('.doc-cpop .doc-comment-btn'); if (!b || !b.offsetParent) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  const addNote = async (b, note) => {
    await click(b);
    await until(() => ev(`return document.activeElement && document.activeElement.tagName === 'TEXTAREA' && !!document.activeElement.closest('.doc-note');`), 3000);
    await type(note);
    const add = await until(() => ev(`const a = document.querySelector('.doc-note-add'); if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`), 3000);
    await click(add); await sleep(250);
  };
  const stored = async () => { const v = (await drafts())[KEY]; return Array.isArray(v) ? v : []; };
  const storedN = async (n) => (await until(async () => { const v = await stored(); return v.length === n ? v : null; }, 8000, 150)) || (await stored());
  if (!ok(!!(await boot(1100, 900, false)), '§13 the client re-booted at 1100×900 (en)')) throw new Error('no app for §13');
  ok(!!(await openDoc(true)), '① a blog draft with front matter, a paragraph and an HTML comment block opened, maximized at 1100 px');
  const kinds = await inC(`H.scrollIntoView({ block: 'center' }); return [...pm.querySelectorAll('.doc-rawblock')].map((b) => (b.querySelector('.doc-raw-head') || {}).textContent);`);
  ok(kinds.length === 2 && /^Front matter · shown as its content/.test(kinds[0]) && /^HTML block · cannot be shown, source below/.test(kinds[1]), '② two raw blocks: the front matter and the HTML comment (its source shown, "cannot be shown, source below")', kinds);
  await sleep(300);
  // ③ a click on the block (its NodeSelection) ⇒ Add comment; the quote = the block's kind + source
  const hb = await inC(`const s = H.querySelector('.doc-raw-src'); const r = R(s); return { x: r.right - 40, y: r.top + r.height / 2 };`);
  await click(hb);
  const b1 = await until(btnNow, 4000);
  const sel1 = await inC(`return { node: !!H.classList.contains('ProseMirror-selectednode'), focus: pm.contains(document.activeElement) || document.activeElement === pm };`);
  await cshot('desk-offer.png');
  ok(!!b1 && sel1.node, '③ a click on the HTML block selects it (one unit) and offers Add comment', { b1, sel1 });
  if (b1) await addNote(b1, 'Confirm this block before publishing');
  const s1 = await storedN(1);
  const strip1 = await inC(`return [...w.content.querySelectorAll('.doc-cmt')].map((e) => ({ k: (e.querySelector('.doc-cmt-k') || {}).textContent || '', q: (e.querySelector('.doc-cmt-q') || {}).textContent || '', raw: e.classList.contains('doc-cmt-raw') }));`);
  ok(s1 && s1.length === 1 && s1[0].quote === 'HTML block: <!-- [CONFIRM-BLOCK id=7] keep the bag -->' && s1[0].line === 9 && s1[0].raw && s1[0].raw.kind === 'html' && s1[0].raw.line === 9 && Number.isInteger(s1[0].raw.pos) && s1[0].note === 'Confirm this block before publishing',
    '④ the comment is saved with the block quote ("HTML block: <!-- [CONFIRM-BLOCK id=7] keep the bag -->"), the block\'s source line (L9) and ONE extra field raw {pos, line, kind}', s1);
  ok(strip1.length === 1 && strip1[0].raw && strip1[0].k === 'L9 · HTML block' && strip1[0].q.startsWith('HTML block: <!-- [CONFIRM-BLOCK'), '⑤ the strip lists it with the block\'s kind as its context line', strip1);
  // ⑥ a real mouse drag across "keep the bag" inside the source box ⇒ Add comment, the quote = the selected text
  await click(await inC(`const p = [...pm.querySelectorAll('p')].find((x) => /Tail paragraph/.test(x.textContent)); const r = R(p); return { x: r.left + 20, y: r.top + r.height / 2 };`)); await sleep(300);
  const span = await inC(`const s = H.querySelector('.doc-raw-src'), tn = s.firstChild, i = tn.data.indexOf('keep the bag'); const g = document.createRange(); g.setStart(tn, i); g.setEnd(tn, i + 1); const a = g.getBoundingClientRect(); g.setStart(tn, i + 11); g.setEnd(tn, i + 12); const z = g.getBoundingClientRect(); return { a: { x: a.left + 1, y: a.top + a.height / 2 }, z: { x: z.right - 1, y: z.top + z.height / 2 } };`);
  await mouse('mouseMoved', span.a.x, span.a.y, { button: 'none' });
  await mouse('mousePressed', span.a.x, span.a.y, { clickCount: 1, buttons: 1 });
  for (let i = 1; i <= 6; i++) await mouse('mouseMoved', span.a.x + (span.z.x - span.a.x) * i / 6, span.a.y, { buttons: 1 });
  await mouse('mouseReleased', span.z.x, span.z.y, { clickCount: 1 });
  const b2 = await until(btnNow, 4000);
  const dsel = await ev(`return String(getSelection());`);
  await cshot('desk-select.png');
  ok(!!b2 && dsel === 'keep the bag', '⑥ a mouse selection INSIDE the source box (a DOM selection the editor does not own) offers Add comment', { b2, dsel });
  if (b2) await addNote(b2, 'Say which bag');
  const s2 = await storedN(2);
  ok(s2 && s2.length === 2 && s2[1].quote === 'keep the bag' && s2[1].line === 10 && s2[1].raw && s2[1].raw.kind === 'html' && s2[1].raw.offset === CDOC.split('<!--')[1].indexOf('keep') + 4, '⑦ that comment\'s quote = the selected text, its line = the text\'s own source line (L10), the offset in the block kept', s2 && s2[1]);
  // ⑨ reload ⇒ the strip shows both; a press on the block comment selects the block and scrolls it into view
  if (!ok(!!(await boot(1100, 900, false)), '⑧ reload (the client re-booted)')) throw new Error('no app after reload');
  ok(!!(await openDoc(true)), '⑧ the draft re-opened');
  await inC(`w.content.querySelector('.doc-page').scrollTop = 0; return true;`); await sleep(300);
  const opener = (await rectIn('.doc-strip-btn', CP)) || (await rectIn('.doc-cmts-chip', CP));
  if (opener) await click(opener); await sleep(300);
  const strip2 = await inC(`return [...w.content.querySelectorAll('.doc-cmt')].map((e) => ({ k: (e.querySelector('.doc-cmt-k') || {}).textContent || '', q: (e.querySelector('.doc-cmt-q') || {}).textContent || '' }));`);
  ok(strip2.length === 2 && strip2[0].k === 'L9 · HTML block' && strip2[1].k === 'L10 · HTML block' && strip2[1].q === 'keep the bag', '⑨ after a reload the strip lists both raw-block comments (kind + line as context)', strip2);
  await inC(`pm.querySelector('h1') && pm.querySelector('h1').scrollIntoView({ block: 'start' }); return true;`);
  await click(await inC(`const e = w.content.querySelector('.doc-cmt .doc-cmt-n'); const r = R(e); return { x: r.left + 10, y: r.top + r.height / 2 };`)); await sleep(500);
  const back = await inC(`const r = R(H), pg = R(w.content.querySelector('.doc-page')); return { node: H.classList.contains('ProseMirror-selectednode'), inView: r.top >= pg.top - 1 && r.bottom <= pg.bottom + 1 };`);
  ok(back.node && back.inView, '⑩ a press on the comment in the strip selects its block (one unit) and scrolls it into view', back);
  await cshot('desk.png');
  // ⑪ the block's source box open (editing) ⇒ a selection in it offers no Add comment; a toast says Finish first
  await click(await inC(`const r = R(H.querySelector('.doc-raw-head')); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`)); await sleep(300);
  const ta = await inC(`const t = H.querySelector('textarea.doc-raw-edit'); if (!t) return null; const r = R(t); return { x: r.left + 6, y: r.top + 10, x2: r.left + 120 };`);
  if (ta) { await mouse('mouseMoved', ta.x, ta.y, { button: 'none' }); await mouse('mousePressed', ta.x, ta.y, { clickCount: 1, buttons: 1 }); for (let i = 1; i <= 5; i++) await mouse('mouseMoved', ta.x + (ta.x2 - ta.x) * i / 5, ta.y, { buttons: 1 }); await mouse('mouseReleased', ta.x2, ta.y, { clickCount: 1 }); }
  await sleep(700);
  const ed = await inC(`const t = H.querySelector('textarea.doc-raw-edit'); return { ta: !!t, sel: t ? t.selectionEnd - t.selectionStart : 0, btn: !!document.querySelector('.doc-cpop .doc-comment-btn'), toast: document.body.innerText.includes('Press Finish first — a block whose source is open cannot be commented') };`);
  await cshot('desk-editing.png');
  ok(ed.ta && ed.sel > 0 && !ed.btn && ed.toast, '⑪ the block\'s source box open: a selection in it offers NO Add comment, and a toast says to press Finish first (not silence)', ed);
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300);
  ok(fs.readFileSync(CP, 'utf8') === CDOC, '⑪ nothing on disk changed (comments are not edits)');
  // ⑫ phone 390: a tap on the block ⇒ Add comment ⇒ the comment sheet as today
  if (!ok(!!(await boot(390, 800, true)), '⑫ the client re-booted as a phone (390×800)')) throw new Error('no phone');
  ok(!!(await openDoc(false)), '⑫ the draft opened on the phone');
  await inC(`H.scrollIntoView({ block: 'center' }); return true;`); await sleep(400);
  await click(await inC(`const r = R(H.querySelector('.doc-raw-src')); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`));
  const pb = await until(btnNow, 4000);
  if (pb) { await click(pb); await sleep(500); }
  const sheet = await ev(`const d = document.querySelector('.doc-note-sheet'); return d ? { q: (d.querySelector('.doc-note-q') || {}).textContent || '', w: Math.round(d.getBoundingClientRect().width) } : null;`);
  await cshot('phone.png');
  ok(!!pb && !!sheet && sheet.q.startsWith('“HTML block: <!-- [CONFIRM-BLOCK'), '⑫ phone: a tap on the HTML block offers Add comment, which opens the comment sheet quoting the block', { pb, sheet });
  ok(pageErrors.length === 0, '⑬ no page exception through §13', pageErrors.slice(0, 3));
  if (CSHOTS) ok(['desk.png', 'phone.png'].every((f) => fs.existsSync(path.join(CSHOTS, f)) && fs.statSync(path.join(CSHOTS, f)).size > 10000), `⑭ PNGs for the owner: ${path.join(CSHOTS, 'desk.png')} + phone.png (+ desk-offer, desk-select, desk-editing)`);
  }
  if (ONLY === '' || ONLY === 'link') {
  // ── §14 a link opens and edits (lane doc-link-bubble, 2.369.261 — owner 2026-10-12 "markdown富文本编辑器里url无法点击和编辑": a
  //    plain click on a link did nothing, the toolbar's Link REMOVED an existing link, nothing edited one)
  section('§14 a link opens and edits: a click shows its bar; Open / Copy / Edit / Remove; the toolbar\'s Link edits (never removes); Ctrl/Cmd+K; paste + autolink; hover; read-only opens; phone 390');
  const LSHOTS = process.env.VS_DOC_LINK_SHOTS || SHOTS;
  const lshot = async (n) => { if (!LSHOTS) return null; const r = await call('Page.captureScreenshot', { format: 'png' }); const f = path.join(LSHOTS, n); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); localStorage.removeItem('vs-doc-width'); } catch {}` });
  const LD = path.join(fs.realpathSync(PROJ), 'links'); fs.mkdirSync(LD, { recursive: true });
  const LDOC = '# Links\n\nRead the [design notes](https://example.com/design) before you start.\n\nThe [tracker](https://tracker.example.org/board) has the rest.\n\nA plain line to paste over and to link.\n';
  const LP = path.join(LD, 'links.md'); fs.writeFileSync(LP, LDOC);
  ok(MD.docFidelity(LDOC).ok, '§14 fixture: a document with two links opens rich (the wheel)');
  const LW = DW(LP);
  async function openLinks(max) {
    await ev(`for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); return true;`); await sleep(300);
    await ev(`app.openFile(${S(LP)}, 'links.md', {}); return true;`);
    const up = await until(() => ev(`const w = ${LW}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelectorAll('a[href]').length >= 2 ? w.id : null;`), 20000, 200);
    if (up && max) { await ev(`app.wm.toggleMaximize(${S(up)}); return true;`); await sleep(700); }
    return up;
  }
  const inL = (js) => ev(`const w = ${LW}; const pm = w.content.querySelector('.doc-page .ProseMirror'); const R = (e) => e.getBoundingClientRect(); const A = (h) => [...pm.querySelectorAll('a')].find((a) => a.getAttribute('href') === h || a.textContent === h); ${js}`);
  const linkPt = (h, frac = 0.5) => inL(`const a = A(${S(h)}); if (!a) return null; const r = R(a); return { x: r.left + r.width * ${frac}, y: r.top + r.height / 2 };`);
  const wordPt = (word) => inL(`for (const p of pm.querySelectorAll('p')) for (const n of p.childNodes) { if (n.nodeType !== 3) continue; const i = n.data.indexOf(${S(word)}); if (i < 0) continue; const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + ${word.length}); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, end: r.right }; } return null;`);
  const barNow = () => ev(`const b = document.querySelector('.doc-lbar'); if (!b || !b.isConnected || b.style.visibility === 'hidden') return null; const r = b.getBoundingClientRect(), h = b.querySelector('.doc-lbar-href') || {}; return { href: h.textContent || '', title: h.title || '', acts: [...b.querySelectorAll('.doc-lbar-btn')].map((x) => x.dataset.act), phone: b.classList.contains('doc-lbar-phone'), left: r.left, top: r.top, bottom: r.bottom, w: r.width, vh: innerHeight, vw: innerWidth, btnH: Math.min(...[...b.querySelectorAll('.doc-lbar-btn')].map((x) => x.getBoundingClientRect().height)), words: [...b.querySelectorAll('.doc-lbar-btn')].map((x) => x.textContent) };`);
  const barBtn = (act) => ev(`const b = document.querySelector('.doc-lbar .doc-lbar-btn[data-act=${act}]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  const dialogNow = () => ev(`const d = document.querySelector('.doc-link-dialog'); if (!d) return null; return { title: (d.querySelector('.dialog-header h3') || {}).textContent || '', href: (d.querySelector('input.doc-link-href') || {}).value, text: (d.querySelector('input.doc-link-text') || {}).value, focus: (document.activeElement && document.activeElement.className) || '' };`);
  const key = async (k, code, vk, modifiers = 0) => { await call('Input.dispatchKeyEvent', { type: 'keyDown', modifiers, key: k, code, windowsVirtualKeyCode: vk }); await call('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, key: k, code, windowsVirtualKeyCode: vk }); };
  const enter = () => key('Enter', 'Enter', 13), esc = () => key('Escape', 'Escape', 27);
  const pages = async () => (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter((x) => x.type === 'page');
  const newPage = async (before) => until(async () => (await pages()).find((x) => !before.some((b) => b.id === x.id)) || null, 6000, 200);
  const closePage = async (p) => { if (p) { try { await fetch(`http://127.0.0.1:${CDP}/json/close/${p.id}`); } catch { } } await call('Page.bringToFront'); await sleep(300); };
  const linksNow = () => inL(`return [...pm.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);`);
  const saved = async (want) => { await ctrlS(); return until(() => (fs.readFileSync(LP, 'utf8') === want ? true : null), 6000); };
  const pasteText = (text) => inL(`const dt = new DataTransfer(); dt.setData('text/plain', ${S(text)}); pm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true;`);
  await call('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: base }).catch(() => null);
  if (!ok(!!(await boot(1280, 900, false)), '§14 the client re-booted at 1280×900 (en)')) throw new Error('no app for §14');
  ok(!!(await openLinks(true)), '① a document with two links opened, maximized');
  // ⓪ the toolbar's Link with the caret on a link ⇒ the Edit dialog, prefilled — never a removal (FIRST: the RED control on the
  //    pre-lane build reaches it — there the button unset the link and asked nothing)
  await click(await linkPt('design notes', 0.5)); await sleep(300);
  await pressTool('.doc-tb[data-key="link"]', 'Link', LP);
  const d0 = await until(dialogNow, 3000);
  await esc(); await sleep(300);
  const l0 = await linksNow();
  ok(!!d0 && d0.title === 'Edit link' && d0.href === 'https://example.com/design' && d0.text === 'design notes' && l0.some(([t, h]) => t === 'design notes' && h === 'https://example.com/design'),
    '⓪ the toolbar\'s Link with the caret on a link ⇒ "Edit link" prefilled; Esc ⇒ the link still there (the pre-lane button REMOVED it)', { d0, l0 });
  // ① a real click on a link ⇒ its bar: the address + Open / Edit / Copy / Remove
  await click(await linkPt('design notes', 0.4));
  const b1 = await until(barNow, 4000);
  await lshot('bar.png');
  ok(!!b1 && b1.href === 'https://example.com/design' && b1.title === 'https://example.com/design' && S(b1.acts) === S(['open', 'edit', 'copy', 'remove']) && !b1.phone, '① a plain click on "design notes" shows its bar: the address + Open / Edit / Copy / Remove', b1);
  // ② Open ⇒ a new tab (a new page target)
  let before = await pages();
  await click(await barBtn('open'));
  let tab = await newPage(before);
  const tabUrl = tab && (await until(async () => { const p = (await pages()).find((x) => x.id === tab.id); return p && /example\.com\/design/.test(p.url) ? p.url : null; }, 4000, 200));
  ok(!!tab && !!tabUrl, '② Open ⇒ ONE new tab at the link\'s address (a new page target)', { tab, tabUrl, pages: before.length });
  await closePage(tab);
  // ③ Copy ⇒ the address on the clipboard + a toast
  await click(await linkPt('design notes', 0.6)); await until(barNow, 3000);
  await click(await barBtn('copy'));
  const cp = await until(() => ev(`return document.body.innerText.includes('Link copied') ? true : null;`), 3000);
  const clip = await ev(`try { return await navigator.clipboard.readText(); } catch (e) { return 'ERR ' + e.message; }`);
  ok(!!cp && clip === 'https://example.com/design', '③ Copy ⇒ the address on the clipboard + the toast "Link copied"', { cp, clip });
  // ④ Edit ⇒ the dialog prefilled (address + text); a new address rewrites the link ⇒ the markdown on disk
  await click(await linkPt('design notes', 0.5)); await until(barNow, 3000);
  await click(await barBtn('edit'));
  const d1 = await until(async () => { const d = await dialogNow(); return d && /doc-link-href/.test(d.focus) ? d : null; }, 3000);
  await lshot('edit.png');
  ok(!!d1 && d1.title === 'Edit link' && d1.href === 'https://example.com/design' && d1.text === 'design notes', '④ Edit opens "Edit link" prefilled: the address (focused, selected) + the link\'s text', d1);
  await type('https://example.com/design-v2'); await enter(); await sleep(400);
  const l4 = await linksNow(), b4 = await until(barNow, 2000);
  const want4 = LDOC.replace('(https://example.com/design)', '(https://example.com/design-v2)');
  ok(!(await dialogNow()) && S(l4[0]) === S(['design notes', 'https://example.com/design-v2']) && !!(await saved(want4)), '④ Enter applies: the link points at the new address, its words kept; Ctrl+S ⇒ "[design notes](https://example.com/design-v2)" on disk, nothing else changed', { l4, disk: fs.readFileSync(LP, 'utf8') });
  ok(!!b4 && b4.href === 'https://example.com/design-v2', '④ the bar now shows the new address (the caret after the link)', b4);
  // ④b a new text replaces the words, the address kept
  await click(await linkPt('design notes', 0.5)); await until(barNow, 3000); await click(await barBtn('edit'));
  await until(async () => { const d = await dialogNow(); return d && /doc-link-href/.test(d.focus) ? d : null; }, 3000);
  await ev(`const i = document.querySelector('input.doc-link-text'); i.focus(); i.select(); return true;`); await type('design doc'); await enter(); await sleep(400);
  const want4b = want4.replace('[design notes]', '[design doc]');
  ok(!!(await saved(want4b)), '④b a new text in the dialog ⇒ "[design doc](https://example.com/design-v2)" on disk', fs.readFileSync(LP, 'utf8'));
  // ⑤ a javascript: address is refused by safeHref, said, the link untouched
  await click(await linkPt('design doc', 0.5)); await until(barNow, 3000); await click(await barBtn('edit'));
  await until(async () => { const d = await dialogNow(); return d && /doc-link-href/.test(d.focus) ? d : null; }, 3000);
  await type('javascript:alert(1)'); await enter(); await sleep(400);
  const r5 = await inL(`return { said: w.content.innerText.includes('Not a link this document can carry: javascript:alert(1)'), links: [...pm.querySelectorAll('a')].map((a) => a.getAttribute('href')) };`);
  ok(r5.said && r5.links.includes('https://example.com/design-v2') && !r5.links.some((h) => /javascript/i.test(h || '')), '⑤ Edit to javascript:alert(1) ⇒ refused (safeHref), the strip says so, the link unchanged', r5);
  // ⑦ Remove ⇒ the words stay, the mark goes
  await click(await linkPt('tracker', 0.5)); const b7 = await until(barNow, 3000);
  await click(await barBtn('remove')); await sleep(300);
  const l7 = await linksNow(), t7 = await inL(`return pm.textContent.includes('The tracker has the rest.');`);
  const want7 = want4b.replace('[tracker](https://tracker.example.org/board)', 'tracker');
  ok(!!b7 && b7.href === 'https://tracker.example.org/board' && !l7.some(([, h]) => /tracker/.test(h || '')) && t7 && !!(await saved(want7)), '⑦ Remove on "tracker" ⇒ the words stay, the link goes; on disk "The tracker has the rest."', { b7, l7, disk: fs.readFileSync(LP, 'utf8') });
  // ⑧ Ctrl/Cmd+K on a selection ⇒ the Link dialog (never the session palette); the selection linked
  await click(await wordPt('plain'), 2); await sleep(300);
  await key('k', 'KeyK', 75, 2);
  const d8 = await until(async () => { const d = await dialogNow(); return d && /doc-link-href/.test(d.focus) ? d : null; }, 3000), pal8 = await ev(`return !!document.querySelector('.palette-overlay');`); // typed only once the dialog holds the focus
  ok(!!d8 && d8.title === 'Link' && d8.href === '' && d8.text === 'plain' && !pal8, '⑧ Ctrl+K on the selected word "plain" ⇒ the Link dialog (its text prefilled), NOT the session palette', { d8, pal8 });
  if (d8) { await type('https://example.com/plain'); await enter(); await sleep(400); }
  ok((await linksNow()).some(([t, h]) => t === 'plain' && h === 'https://example.com/plain'), '⑧ Enter ⇒ "plain" links to https://example.com/plain', await linksNow());
  // ⑨ paste a URL over a selection ⇒ linked; a javascript: URL pasted ⇒ plain text (safeHref)
  await click(await wordPt('paste'), 2); await sleep(300);
  await pasteText('https://example.com/pasted'); await sleep(300);
  const l9 = await linksNow();
  ok(l9.some(([t, h]) => t === 'paste' && h === 'https://example.com/pasted'), '⑨ a URL pasted over the selected word "paste" links it (its words kept)', l9);
  await click(await wordPt('link.'), 2); await sleep(300);
  await pasteText('javascript:alert(1)'); await sleep(300);
  const r9 = await inL(`return { text: pm.textContent, bad: [...pm.querySelectorAll('a')].filter((a) => !a.hasAttribute('href') || /javascript/i.test(a.getAttribute('href'))).length };`);
  ok(r9.text.includes('javascript:alert(1)') && r9.bad === 0, '⑨ javascript:alert(1) pasted over a selection ⇒ plain text, never a link', r9);
  // ⑩ autolink: a typed URL + a space links itself; README.md stays a word
  const endP = await inL(`const p = [...pm.querySelectorAll('p')].pop(); const r = R(p); return { x: r.right - 2, y: r.top + r.height / 2 };`);
  await click(endP); await key('End', 'End', 35); await type(' see https://example.com/typed '); await sleep(200); await type('and README.md '); await sleep(300);
  const l10 = await linksNow();
  ok(l10.some(([t, h]) => t === 'https://example.com/typed' && h === 'https://example.com/typed') && !l10.some(([t]) => /README/.test(t)), '⑩ typing "https://example.com/typed " links it (autolink); "README.md " stays a word', l10);
  await ctrlS(); await sleep(1200);
  const disk10 = fs.readFileSync(LP, 'utf8'), json10 = S(MD.parseMd(disk10).toJSON());
  ok(disk10.includes('[plain](https://example.com/plain)') && disk10.includes('[paste](https://example.com/pasted)') && !/\]\(javascript/i.test(disk10) && json10.includes('"href":"https://example.com/typed"') && !json10.includes('README.md"}]') && disk10.includes('README.md'),
    '⑩ on disk: [plain](…/plain), [paste](…/pasted), the typed URL a link, README.md text, no javascript: link', disk10);
  // ⑪ hover ≥ 300 ms over a link (the caret elsewhere) ⇒ its bar; the pointer leaving ⇒ gone
  await click(await inL(`const r = R(pm.querySelector('h1')); return { x: r.left + 10, y: r.top + r.height / 2 };`)); await sleep(300);
  const hv = await linkPt('design doc', 0.5);
  await mouse('mouseMoved', hv.x, hv.y, { button: 'none' }); await sleep(700);
  const b11 = await barNow();
  await mouse('mouseMoved', hv.x, hv.y + 160, { button: 'none' }); await sleep(1000);
  const b11b = await barNow();
  ok(!!b11 && b11.href === 'https://example.com/design-v2' && !b11b, '⑪ a hover ≥ 300 ms over "design doc" shows its bar; moving away drops it', { b11, b11b });
  // ⑫ read-only (the editor not editable): a plain click OPENS the link; a hover's bar offers Open + Copy only
  const ro = await inL(`pm.editor.setEditable(false); return pm.getAttribute('contenteditable');`); await sleep(200);
  await mouse('mouseMoved', hv.x, hv.y, { button: 'none' }); await sleep(700);
  const b12 = await barNow();
  before = await pages();
  await click(hv);
  tab = await newPage(before);
  ok(ro === 'false' && !!b12 && S(b12.acts) === S(['open', 'copy']) && !!tab, '⑫ read-only: the hover bar offers Open + Copy; a plain click opens the link in a new tab', { ro, b12, tab: tab && tab.url });
  await closePage(tab);
  await inL(`pm.editor.setEditable(true); return true;`);
  // ⑬ phone 390: a tap on a link ⇒ the bar as a bottom row of the four acts (36 px+ targets, their words)
  if (!ok(!!(await boot(390, 844, true)), '⑬ the client re-booted as a phone (390×844)')) throw new Error('no phone');
  ok(!!(await openLinks(false)), '⑬ the document opened on the phone');
  await click(await linkPt('design doc', 0.5));
  const b13 = await until(barNow, 4000);
  await lshot('phone.png');
  ok(!!b13 && b13.phone && S(b13.acts) === S(['open', 'edit', 'copy', 'remove']) && Math.abs(b13.bottom - b13.vh) <= 2 && b13.left <= 1 && b13.w >= b13.vw - 2 && b13.btnH >= 36 && S(b13.words) === S(['Open', 'Edit', 'Copy', 'Remove']),
    '⑬ phone: a tap on "design doc" ⇒ the bar as a bottom row (full width, at the bottom), Open / Edit / Copy / Remove with words, ≥ 36 px', b13);
  ok(pageErrors.length === 0, '⑭ no page exception through §14', pageErrors.slice(0, 3));
  if (LSHOTS) ok(['bar.png', 'edit.png', 'phone.png'].every((f) => fs.existsSync(path.join(LSHOTS, f)) && fs.statSync(path.join(LSHOTS, f)).size > 10000), `⑭ PNGs for the owner: ${path.join(LSHOTS, 'bar.png')} + edit.png + phone.png`);
  }
  if (ONLY === '' || ONLY === 'synced') {
  // ── §15 A DOCUMENT'S COMMENTS ARE VIBESPACE'S (lane doc-comments-synced — owner 2026-10-12: his eighteen comments
  //    "disappeared"; they were in another computer's browser): two pages on one instance, live both ways, a reload reads
  //    the server, a browser's old localStorage copy migrates once (upload; merge = the server's rows kept, local-only added)
  section('§15 a document\'s comments are VibeSpace\'s: two pages on one instance, live both ways; the old browser copy migrates once');
  const SSHOTS = process.env.VS_DOC_SYNC_SHOTS || SHOTS;
  const SY = path.join(fs.realpathSync(PROJ), 'docs', 'SYNC.md'), SY2 = path.join(fs.realpathSync(PROJ), 'docs', 'OLD.md');
  fs.writeFileSync(SY, '# Synced comments\n\nThe first paragraph says what the plan is.\n\n## Steps\n\n- write the note on one device\n- read it on the other device\n');
  fs.writeFileSync(SY2, '# Old notes\n\nA document whose notes lived in one browser.\n');
  const recOf = async (p) => { const v = (await drafts())['doc:\u0001' + p]; return Array.isArray(v) ? v : null; };
  const oldKeyOf = (p) => 'vs-doc-comments:\u0001' + p;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); localStorage.removeItem('vs-doc-width'); } catch {}` });
  const chatA = await boot(1100, 800, false);
  // page B: a second tab on the same instance, its own CDP session (another browser, as far as the strip can tell)
  const tB = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdpB = new WebSocket(tB.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r, e) => { cdpB.on('open', r); cdpB.on('error', e); });
  let seqB = 0; const pendB = new Map(); const errsB = [];
  cdpB.on('message', (d) => { const m = JSON.parse(d); if (m.id && pendB.has(m.id)) { pendB.get(m.id)(m); pendB.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') errsB.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception'); });
  const callB = (method, params = {}) => new Promise((r, e) => { const id = ++seqB; pendB.set(id, (m) => (m.error ? e(new Error(method + ': ' + m.error.message)) : r(m.result))); cdpB.send(S({ id, method, params })); });
  const evB = async (js) => { const r = await callB('Runtime.evaluate', { expression: `(async () => { const app = window.app; ${js} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval threw'); return r.result?.value; };
  const clickB = async (p) => { await callB('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' }); for (const type of ['mousePressed', 'mouseReleased']) await callB('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(150); };
  async function bootB(width, height, mobile) {
    await callB('Page.enable'); await callB('Runtime.enable');
    await callB('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await callB('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await callB('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` });
    await callB('Page.navigate', { url: base + '/' });
    const up = await until(async () => evB(`if (!app || !app.ready) return false; await app.ready; return true;`), 60000, 300);
    await sleep(800);
    return up;
  }
  const shotOn = async (c, name) => { if (!SSHOTS) return null; await c('Page.bringToFront'); await sleep(400); const r = await c('Page.captureScreenshot', { format: 'png' }); const f = path.join(SSHOTS, name); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  const openOn = async (E, p, nm, from) => {
    await E(`app.openFile(${S(p)}, ${S(nm)}, ${from ? `{ from: ${S(from)} }` : '{}'}); return true;`);
    return until(() => E(`const w = ${DW(p)}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelector('h1') ? w.id : null;`), 20000, 200);
  };
  const notesOn = (E, p) => E(`const w = ${DW(p)}; if (!w) return null; return [...w.content.querySelectorAll('.doc-cmt')].map((e) => e.querySelector('.doc-cmt-n').textContent);`);
  const stripOpen = (E, p) => E(`const w = ${DW(p)}; const s = w.content.querySelector('.doc-strip'); if (s.hidden) w.content.querySelector('.doc-strip-btn').click(); return true;`);
  const until15 = (fn) => until(fn, 8000, 150);
  if (!ok(!!chatA && !!(await bootB(1100, 800, false)), '§15 page A (1100×800, its chat attached) and page B (a second tab, 1100×800) booted on ONE instance')) throw new Error('no pages for §15');
  const wa = await openOn(ev, SY, 'SYNC.md', chatA), wb = await openOn(evB, SY, 'SYNC.md');
  ok(!!wa && !!wb && (await notesOn(ev, SY)).length === 0 && (await notesOn(evB, SY)).length === 0 && !(await recOf(SY)), '① SYNC.md open on both pages, no comments anywhere yet', { wa, wb });
  // ② A adds two (real mouse selections — A is the tab in front, as the person's hands are) ⇒ B shows them without a reload
  await call('Page.bringToFront'); await sleep(300);
  const s1 = await comment('.ProseMirror h2', 12, 'say which device', SY);
  const s2 = await comment('.ProseMirror ul li p', 30, 'name the second step', SY);
  const liveB = await until15(async () => { const n = await notesOn(evB, SY); return n && n.length === 2 ? n : null; });
  const rec2 = await recOf(SY);
  ok(!!liveB && liveB.join('|') === 'say which device|name the second step' && !!rec2 && rec2.length === 2, '② A adds 2 comments ⇒ B\'s strip shows both, in order, WITHOUT a reload; the server\'s drafts store holds them', { s1, s2, liveB, rec2 });
  ok(!(await ev(`return localStorage.getItem(${S(oldKeyOf(SY))});`)) && !(await evB(`return localStorage.getItem(${S(oldKeyOf(SY))});`)), '② …and neither browser\'s storage holds them (the record is the server\'s)');
  // B's person comes to that tab: brought to the front it adopts the desktop's shared layout (A's windows — its own Doc
  // window goes with it), so it opens the document again — the strip reads the server's two rows at mount
  await callB('Page.bringToFront'); await sleep(1500);
  await openOn(evB, SY, 'SYNC.md'); await stripOpen(evB, SY);
  const atMountB = await until15(async () => { const n = await notesOn(evB, SY); return n && n.length === 2 ? n : null; });
  ok(!!atMountB, '② …a Doc window opened on B afterwards reads both rows at its mount (the server\'s record)', atMountB);
  const deskA = await shotOn(call, 'desk-a.png'), deskB = await shotOn(callB, 'desk-b.png');
  // ③ B removes one (a real click on its ✕) ⇒ A shows one
  const xB = await until15(() => evB(`const w = ${DW(SY)}; const x = w.content.querySelector('.doc-cmt .doc-cmt-x'); if (!x || !x.offsetParent) return null; const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`));
  await callB('Page.bringToFront'); await sleep(300);
  if (xB) await clickB(xB);
  const liveA = await until15(async () => { const n = await notesOn(ev, SY); return n && n.length === 1 ? n : null; });
  ok(!!xB && !!liveA && liveA[0] === 'name the second step' && (await notesOn(evB, SY)).join() === 'name the second step', '③ B removes the first ⇒ A\'s strip shows the one left, without a reload', { xB, liveA });
  // ④ A reloads ⇒ the one row, from the server (no browser copy)
  const rec3 = await until15(async () => { const r = await recOf(SY); return r && r.length === 1 ? r : null; });
  await call('Page.bringToFront');
  const chatA2 = await boot(1100, 800, false);
  await openOn(ev, SY, 'SYNC.md', chatA2);
  const afterReload = await until15(async () => { const n = await notesOn(ev, SY); return n && n.length === 1 ? n : null; });
  ok(!!rec3 && !!afterReload && afterReload[0] === 'name the second step' && !(await ev(`return localStorage.getItem(${S(oldKeyOf(SY))});`)), '④ A reloads ⇒ its strip reads the one row from the server; no localStorage key', { rec3, afterReload });
  // ⑤ THE MIGRATION: B carries three rows under the OLD key of a document the server knows nothing about ⇒ uploaded, key gone
  const OLD3 = [1, 2, 3].map((i) => ({ id: 'old' + i, quote: 'A document whose notes lived in one browser.', line: 3, note: 'old note ' + i }));
  await evB(`localStorage.setItem(${S(oldKeyOf(SY2))}, ${S(S(OLD3))}); return true;`);
  await openOn(evB, SY2, 'OLD.md');
  const up3 = await until15(async () => { const r = await recOf(SY2); return r && r.length === 3 ? r : null; });
  const gone3 = await until15(() => evB(`return localStorage.getItem(${S(oldKeyOf(SY2))}) === null ? true : null;`));
  ok(!!up3 && up3.map((c) => c.id).join() === 'old1,old2,old3' && !!gone3 && (await notesOn(evB, SY2)).length === 3, '⑤ a page with 3 rows under the OLD localStorage key ⇒ after mount the server holds the 3 and the local key is gone', { up3, gone3 });
  // ⑥ …and a second browser's stale copy can only ADD: A carries old2 (stale text) + one of its own ⇒ the server keeps old2's text, adds a-only
  await ev(`localStorage.setItem(${S(oldKeyOf(SY2))}, ${S(S([{ id: 'old2', quote: '', note: 'a stale copy of old note 2' }, { id: 'a-only', quote: 'Old notes', line: 1, note: 'only this browser had me' }]))}); return true;`);
  await openOn(ev, SY2, 'OLD.md', chatA2);
  const up4 = await until15(async () => { const r = await recOf(SY2); return r && r.length === 4 ? r : null; });
  const liveB4 = await until15(async () => { const n = await notesOn(evB, SY2); return n && n.length === 4 ? n : null; });
  ok(!!up4 && up4.map((c) => c.id).join() === 'old1,old2,old3,a-only' && up4[1].note === 'old note 2' && !(await ev(`return localStorage.getItem(${S(oldKeyOf(SY2))});`)) && !!liveB4, '⑥ a second browser\'s old copy merges: the server\'s rows kept (old2 keeps ITS text), the local-only row appended, the key gone; B sees 4 live', { up4, liveB4 });
  // ⑦ Send all on A ⇒ B's strip empties
  await openOn(ev, SY, 'SYNC.md', chatA2); await stripOpen(ev, SY); await sleep(300);
  const before15 = stdinTexts().length;
  const sendA = await rectIn('.doc-send', SY);
  if (sendA) await click(sendA);
  const sent15 = await until15(() => { const t = stdinTexts().slice(before15).filter((x) => x.startsWith('[Doc comments] ' + SY)); return t.length ? t : null; });
  const emptyB = await until15(async () => { const n = await notesOn(evB, SY); return n && n.length === 0 ? true : null; });
  ok(!!sendA && !!sent15 && sent15[0].includes('name the second step') && !!emptyB && !(await recOf(SY)), '⑦ Send all on A ⇒ the chat gets the message, the server\'s record is gone and B\'s strip empties (no reload)', { sendA, sent15, emptyB });
  // ⑪–⑮ THE SEND SAYS WHAT IT WILL DO AND WHAT IT DID (lane doc-comments-ui, B-8199): 18 rows the packer makes 3 messages of
  const DSHOTS = process.env.VS_DOC_SEND_SHOTS || SSHOTS;
  const shotTo = async (c, name) => { if (!DSHOTS) return null; await c('Page.bringToFront'); await sleep(400); const r = await c('Page.captureScreenshot', { format: 'png' }); const f = path.join(DSHOTS, name); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
  const SD = path.join(fs.realpathSync(PROJ), 'docs', 'SEND.md');
  fs.writeFileSync(SD, '# Send plan\n\n' + Array.from({ length: 18 }, (_, i) => `Step ${i + 1} of the plan.`).join('\n\n') + '\n');
  const ROWS = Array.from({ length: 18 }, (_, i) => ({ id: 'sd' + (i + 1), quote: `Step ${i + 1} of the plan.`, line: 3 + 2 * i, note: `note ${i + 1} `.padEnd(500, 'x') }));
  const PLAN = require('./src/doc-model.js').commentsBatches(SD, ROWS);
  // page A's fetch: every POST /api/doc/comments body recorded; `__docStash` set ⇒ answered with it after 1.5 s (⑭)
  await ev(`localStorage.setItem(${S(oldKeyOf(SD))}, ${S(S(ROWS))}); window.__docPosts = []; if (!window.__docFetch) { window.__docFetch = window.fetch; window.fetch = (u, o) => { if (!String(u).includes('/api/doc/comments')) return window.__docFetch(u, o); window.__docPosts.push(JSON.parse(o.body)); if (window.__docStash) { const a = window.__docStash; return new Promise((r) => setTimeout(() => r(new Response(JSON.stringify(a), { status: 200, headers: { 'Content-Type': 'application/json' } })), 1500)); } return window.__docFetch(u, o); }; } return true;`);
  await openOn(ev, SD, 'SEND.md', chatA2); await stripOpen(ev, SD);
  const label = (E) => E(`const w = ${DW(SD)}; const b = w && w.content.querySelector('.doc-send'); return b && !b.hidden ? b.textContent : null;`);
  const up18 = await until15(async () => { const r = await recOf(SD); return r && r.length === 18 ? r : null; });
  const lab18 = await until15(async () => { const l = await label(ev); return l && l.includes('18') ? l : null; });
  ok(PLAN.ok && PLAN.batches.length === 3 && !!up18 && lab18 === 'Send all (18 → 3 messages)', '⑪ 18 rows (the packer makes 3 messages of them) ⇒ the button reads "Send all (18 → 3 messages)" before any press', { lab18, n: up18 && up18.length, plan: PLAN.batches && PLAN.batches.map((b) => b.count) });
  await openOn(evB, SD, 'SEND.md'); await stripOpen(evB, SD);
  const b18 = await until15(async () => { const n = await notesOn(evB, SD); return n && n.length === 18 ? n : null; });
  const deskSend = await shotTo(call, 'desk.png');
  await call('Page.bringToFront'); await sleep(300); await openOn(ev, SD, 'SEND.md', chatA2); await stripOpen(ev, SD);
  // ⑫ row 7's ➤ (a real click) ⇒ ONE POST with ONE item, ONE message with row 7 alone; row 7 leaves, 17 stay; the toast
  const before16 = stdinTexts().length;
  await ev(`window.__docPosts = []; return true;`);
  const r7 = await until15(() => ev(`const w = ${DW(SD)}; const row = w.content.querySelectorAll('.doc-cmt')[6]; const b = row && row.querySelector('.doc-cmt-send'); if (!b || !b.offsetParent) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, note: row.querySelector('.doc-cmt-n').textContent.slice(0, 7), tip: b.title };`));
  if (r7) await click(r7);
  const sent7 = await until15(() => { const t = stdinTexts().slice(before16).filter((x) => x.startsWith('[Doc comments] ' + SD)); return t.length ? t : null; });
  const left17 = await until15(async () => { const n = await notesOn(ev, SD); return n && n.length === 17 ? n : null; });
  const posts7 = await ev(`return window.__docPosts;`);
  const toast7 = await until15(() => ev(`return [...document.querySelectorAll('[class*="toast"]')].map((e) => e.textContent).find((x) => x.includes('Sent 1 comment')) || null;`));
  ok(!!r7 && r7.note === 'note 7 ' && r7.tip === 'Send this one' && posts7.length === 1 && posts7[0].items.length === 1 && posts7[0].items[0].note.startsWith('note 7 ') && !!sent7 && sent7.length === 1 && sent7[0].includes('note 7 x') && !sent7[0].includes('note 6 x') && !sent7[0].includes('note 8 x') && !!left17 && !left17.some((n) => n.startsWith('note 7 ')), '⑫ the ➤ ("Send this one") on row 7 ⇒ ONE POST with ONE item, ONE message carrying row 7 alone; row 7 gone, 17 stay', { r7, posts: posts7.map((p) => p.items.length), sent7: sent7 && sent7.map((x) => x.slice(0, 160)), left: left17 && left17.length });
  ok(!!toast7 && !!(await until15(async () => { const l = await label(ev); return l === 'Send all (17 → 3 messages)' ? l : null; })), '⑫ …the toast says "Sent 1 comment" and the button now reads "Send all (17 → 3 messages)"', { toast7, label: await label(ev) });
  const b17 = await until15(async () => { const n = await notesOn(evB, SD); return n && n.length === 17 ? n : null; });
  ok(!!b18 && !!b17 && !b17.some((n) => n.startsWith('note 7 ')), '⑬ page B showed the 18, then the 17 without a reload (row 7 gone there too)', { b18: b18 && b18.length, b17: b17 && b17.length });
  // ⑬b the phone: B at 390 — the sheet's ➤ / ✕ are 36 px targets inside their row, clear of the note; the label wraps in its button
  await bootB(390, 844, true);
  await openOn(evB, SD, 'SEND.md'); await stripOpen(evB, SD);
  const ph = await until15(() => evB(`const w = ${DW(SD)}; const s = w.content.querySelector('.doc-strip'); const rows = [...s.querySelectorAll('.doc-cmt')]; if (s.hidden || rows.length !== 17) return null; const b = s.querySelector('.doc-send'); const geo = rows.slice(0, 4).map((row) => { const r = row.getBoundingClientRect(), n = row.querySelector('.doc-cmt-n').getBoundingClientRect(), g = [...row.querySelectorAll('.doc-cmt-acts button')].map((x) => x.getBoundingClientRect()); return { inRow: g.every((x) => x.left >= r.left && x.right <= r.right + 0.5 && x.top >= r.top - 0.5), big: g.every((x) => x.width >= 36 && x.height >= 36), clear: g.every((x) => x.left >= n.right - 0.5), n: g.length }; }); const br = b.getBoundingClientRect(); return { phone: !!w.content.querySelector('.doc-phone'), geo, label: b.textContent, fits: b.scrollWidth <= b.clientWidth + 1 && br.right <= innerWidth, ws: getComputedStyle(b).whiteSpace, sheetW: Math.round(s.getBoundingClientRect().width) };`));
  const phoneSend = await shotTo(callB, 'phone.png');
  ok(!!ph && ph.geo.every((g) => g.n === 2 && g.inRow && g.big && g.clear) && ph.label === 'Send all (17 → 3 messages)' && ph.fits && ph.ws === 'normal' && ph.sheetW <= 390, '⑬b on a phone (390) each row\'s ➤ and ✕ are 36 px targets inside the row, clear of its note; the button label wraps (no overflow)', ph);
  // ⑭ the owning conversation is not running: the page gets THE ENGINE'S stash answer for its 17 rows (the rig's stub chat
  //    cannot be stopped and still own the file — a killed session leaves no owner: no_owner), held 1.5 s ⇒ the in-flight state
  await call('Page.bringToFront'); await sleep(1500); await openOn(ev, SD, 'SEND.md', chatA2); await stripOpen(ev, SD);
  const rows17 = await recOf(SD);
  const stashAns = require('./src/server/doc-engine.js').create({ activeSessions: new Map([['w1', { mode: 'chat', backend: 'claude', claudeSessionId: 'conv-1' }]]), getDeliver: () => ({ stashFor: () => ({ stored: true }) }), sendUserInput: () => ({ ok: false, code: 'not_chat', error: 'not a live chat session' }), artifacts: null, now: () => 7 }).comments({ path: SD, from: 'w1', items: rows17 || [] });
  await ev(`window.__docStash = ${S(stashAns)}; window.__docPosts = []; return true;`);
  const sendAll = await rectIn('.doc-send', SD); if (sendAll) await click(sendAll);
  const flight = await until(() => ev(`const w = ${DW(SD)}; const b = w.content.querySelector('.doc-send'); const g = [...w.content.querySelectorAll('.doc-cmt-acts button')]; return b.disabled ? { label: b.textContent, held: g.length === 34 && g.every((x) => x.disabled) } : null;`), 3000, 50);
  ok(!!flight && flight.label === 'Sending 17 comments…' && flight.held, '⑭ while the ONE POST is out the button is disabled and reads "Sending 17 comments…"; every row\'s ➤ / ✕ is held', flight);
  const stashSaid = await until15(() => ev(`const w = ${DW(SD)}; const c = w.content.querySelector('.doc-chip'); return c && !c.hidden && /^Stashed/.test(c.textContent) ? c.textContent : null;`));
  const toastS = await ev(`return [...document.querySelectorAll('[class*="toast"]')].map((e) => e.textContent).find((x) => x.includes('Stashed 17')) || null;`);
  const gone = await until15(async () => ((await notesOn(ev, SD)) || [1]).length === 0 && !(await recOf(SD)) ? true : null);
  ok(stashAns.delivered === 'stashed' && (await ev(`return window.__docPosts.length;`)) === 1 && stashSaid === 'Stashed 17 comments — the conversation is not running; they are delivered when its next turn starts' && !!toastS && !/Sent/.test(stashSaid + toastS) && !!gone, '⑮ a stopped owner (the engine stashes) ⇒ the strip and the toast say "Stashed 17 comments — … delivered when its next turn starts", never "Sent"; the rows leave the record', { stashSaid, toastS, gone, delivered: stashAns.delivered });
  await ev(`window.__docStash = null; return true;`);
  if (DSHOTS) ok([deskSend, phoneSend].every((f) => f && fs.statSync(f).size > 5000), `⑮ PNGs for the owner: ${deskSend}, ${phoneSend}`);
  // ⑧ the phone: B at 390 shows the migrated document's four rows in its bottom sheet
  await bootB(390, 844, true);
  await openOn(evB, SY2, 'OLD.md');
  await stripOpen(evB, SY2);
  const sheetB = await until15(() => evB(`const w = ${DW(SY2)}; const s = w.content.querySelector('.doc-strip'); if (s.hidden || s.querySelectorAll('.doc-cmt').length !== 4) return null; const r = s.getBoundingClientRect(); return { w: Math.round(r.width), n: s.querySelectorAll('.doc-cmt').length, phone: /doc-phone/.test(w.content.querySelector('.doc-window').className) };`));
  ok(!!sheetB && sheetB.phone && sheetB.n === 4 && sheetB.w <= 390, '⑧ on a phone (390) the same four rows, in the bottom sheet', sheetB);
  const phone = await shotOn(callB, 'phone.png');
  await call('Page.bringToFront');
  ok(errsB.length === 0, '⑨ no page exception on page B', errsB.slice(0, 3));
  if (SSHOTS) ok([deskA, deskB, phone].every((f) => f && fs.statSync(f).size > 5000), `⑩ PNGs for the owner: ${deskA}, ${deskB}, ${phone}`);
  try { cdpB.close(); } catch { }
  try { await fetch(`http://127.0.0.1:${CDP}/json/close/${tB.id}`); } catch { }
  }
  if (ONLY === '' || ONLY === 'stopped') {
  // ── §16 A STOPPED OWNER IS AN ADDRESSEE (lane doc-comments-stopped-owner, B-b51a — lane doc-comments-ui found a stopped
  //    chat's document answering "Open this document from a chat…"): the exit unlinks the session's meta, the engine's
  //    owner memo (data/doc-owners.json) still names the conversation ⇒ the stash; the resumed chat gets them in order
  section('§16 a stopped owner: Send all waits in its stash; the resumed chat gets the messages in order');
  const ST = path.join(fs.realpathSync(PROJ), 'docs', 'STOP.md');
  fs.writeFileSync(ST, '# Stopped owner\n\nThe plan has two steps.\n\n## Steps\n\n- the first step\n- the second step\n');
  const envPids = () => (fs.existsSync(path.join(ROOT, 'stub-env.ndjson')) ? fs.readFileSync(path.join(ROOT, 'stub-env.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.args.includes('--output-format')).map((x) => x.pid) : []);
  const pids0 = envPids();
  ws.send(S({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 80, rows: 24, reqId: 'dw16', name: 'Stopped owner' }));
  const c16 = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'dw16'), 20000);
  const pid16 = await until(() => envPids().find((x) => !pids0.includes(x)), 15000);
  const CONV16 = pid16 && 'e2e00000-0000-4000-8000-' + String(pid16).padStart(12, '0');
  if (!ok(!!c16 && !!CONV16, '§16 a chat of its own on the stub claude (conversation ' + CONV16 + ')')) throw new Error('no §16 chat');
  const SID16 = c16.sessionId;
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` });
  ok(!!(await boot(1100, 800, false)), '§16 the client booted (1100×800, en)');
  await ev(`app.attachSession(${S(SID16)}, 'Stopped owner', ${S(PROJ)}, { mode: 'chat', backend: 'claude' }); return true;`);
  const chat16 = await until(() => ev(`for (const [id, v] of app.sessions) if (v.sessionId === ${S(SID16)}) return id; return null;`), 15000);   // openFile's `from` = the client's chat window id (as §15's boot)
  const w16 = await until(async () => { await ev(`app.openFile(${S(ST)}, 'STOP.md', { from: ${S(chat16)} }); return true;`); return until(() => ev(`const w = ${DW(ST)}; const pm = w && w.content.offsetParent && w.content.querySelector('.doc-page .ProseMirror'); return pm && pm.querySelector('h1') ? w.id : null;`), 8000, 200); }, 20000, 500);
  const owned = await until(async () => { const r = await (await fetch(`${base}/api/doc/owner?path=${encodeURIComponent(ST)}&from=${encodeURIComponent(SID16)}`)).json(); return r.owner && r.owner.via === 'from' ? r.owner : null; }, 8000, 200);
  ok(!!w16 && !!owned, '① STOP.md open from that chat; the owner resolves via its live session', { w16, owned });
  await call('Page.bringToFront'); await sleep(300);
  const n1 = await comment('.ProseMirror h2', 12, 'stopped note one', ST);
  const n2 = await comment('.ProseMirror ul li p', 30, 'stopped note two', ST);
  // ② the chat STOPS (the product's Terminate: ws kill — its live record goes and its session-meta file is unlinked)
  ws.send(S({ type: 'kill', sessionId: SID16, reqId: 'k16' }));
  const gone = await until(async () => { const r = await (await fetch(`${base}/api/doc/owner?path=${encodeURIComponent(ST)}&from=${encodeURIComponent(SID16)}`)).json(); return r.owner && r.owner.via === 'stopped' ? r.owner : null; }, 15000, 250);
  ok(!!n1 && !!n2 && !!gone && gone.sessionId === SID16, '② the chat stopped ⇒ GET /api/doc/owner still names it (via stopped), never null', { n1, n2, gone });
  const ownerLine = await ev(`const w = ${DW(ST)}; const o = w.content.querySelector('.doc-owner'); return o ? { hidden: o.hidden, text: o.textContent } : null;`);
  // ③ Send all ⇒ stashed (the toast says the next turn), the strip empties, nothing typed into a stub
  const before16 = stdinTexts().length;
  await ev(`const w = ${DW(ST)}; const s = w.content.querySelector('.doc-strip'); if (s.hidden) w.content.querySelector('.doc-strip-btn').click(); return true;`); await sleep(300);
  const send16 = await until(() => ev(`const w = ${DW(ST)}; const b = w.content.querySelector('.doc-send'); if (!b || !b.offsetParent || b.disabled) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`), 8000, 200);
  if (send16) await click(send16);
  const toast16 = await until(() => ev(`const t = [...document.querySelectorAll('[class*=toast]')].map((e) => e.textContent).find((x) => /next turn/i.test(x)); return t || null;`), 8000, 150);
  const empty16 = await until(async () => ((await ev(`return ${DW(ST)}.content.querySelectorAll('.doc-cmt').length;`)) === 0 ? true : null), 8000, 150);
  ok(!!send16 && !!toast16 && !!empty16 && !/open (this document|it) from a chat/i.test(toast16) && stdinTexts().length === before16, '③ Send all on a stopped owner ⇒ "' + (toast16 || '') + '" (stashed, not refused), the strip empties, nothing typed', { send16, toast16, empty16, ownerLine });
  // ④ resumed (same conversation, a new session id) ⇒ the chat's `stash` fact counts the message; the hand-over delivers it in order
  const pids1 = envPids();
  ws.send(S({ type: 'create', backend: 'claude', mode: 'chat', cwd: PROJ, cols: 80, rows: 24, reqId: 'dw16r', name: 'Stopped owner', resume: true, resumeId: CONV16 }));
  const r16 = await until(() => msgs.find((m) => (m.type === 'created' || m.type === 'error') && m.reqId === 'dw16r'), 20000);
  await until(() => envPids().find((x) => !pids1.includes(x)), 15000);
  const fact = await until(() => { const a = [...msgs].reverse().find((m) => m.type === 'active-sessions' && Array.isArray(m.sessions) && m.sessions.some((x) => (x.id || x.sessionId) === (r16 && r16.sessionId) && x.stash)); const x = a && a.sessions.find((y) => (y.id || y.sessionId) === r16.sessionId); return x ? x.stash : null; }, 15000, 200);
  ok(!!r16 && r16.type === 'created' && r16.sessionId !== SID16 && !!fact, '④ resumed under a new session id ⇒ its `stash` fact says something waits', { r16: r16 && { type: r16.type, id: r16.sessionId, message: r16.message }, fact });
  // ⑤ the resumed chat's next turn: its UserPromptSubmit hook's call (the REAL GET /api/agent/prompt-context, as that
  //    stub with its own session token) drains the stash ⇒ the [Doc comments] message, notes in order; drained once
  // (the first prompt also carries the tools intro: a stash that does not fit the room waits for the next prompt — product
  //  behaviour, agent-routes drainStashUnderCap — so up to three turns are asked, and exactly ONE may carry the notes)
  const turns = [];
  for (let t = 0; t < 3; t++) {
    const pc = await stub({ kind: 'http', path: '/api/agent/prompt-context', sid: CONV16 });
    const c = String((pc && pc.body && pc.body.context) || '');
    turns.push({ sid: pc && pc.sid, len: c.length, doc: c.includes('[Doc comments] ' + ST), one: c.indexOf('stopped note one'), two: c.indexOf('stopped note two') });
    if (turns.filter((x) => x.one > -1).length && t >= 1) break;
  }
  const carry = turns.filter((x) => x.one > -1);
  ok(turns.every((x) => x.sid === CONV16) && carry.length === 1 && carry[0].doc && carry[0].one < carry[0].two && turns.indexOf(carry[0]) < turns.length - 1, '⑤ the resumed chat\'s next turn (its hook\'s REAL prompt-context) carries the [Doc comments] message, notes in order — once', turns);
  }
  if (ONLY !== 'width' && ONLY !== 'print' && ONLY !== 'raw' && ONLY !== 'table' && ONLY !== 'rawcmt' && ONLY !== 'link' && ONLY !== 'synced' && ONLY !== 'stopped') {

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
    return level && apart && ranked && v.sw <= v.cw + 1 && v.more === true && v.glyphs >= 3 && v.drawn === v.glyphs; // every shown button's glyph is a DRAWN svg
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
      // ② THE BAR: never two rows, folds by priority (B before Table, Table before raw), the ⋯ (always shown since 2.369.239) holds the folded first
      const sweep = [];
      for (const px of [0, 760, 560, 470, 390, 300]) {
        await inSW(`const el = w.element; if (${px}) { el.style.width = '${px}px'; } else { app.wm.toggleMaximize(w.id); } return true;`);
        await sleep(450);
        const v = await barCensus();
        const rows = v && v.folded.length ? (await moreRows()).slice(0, v.folded.length) : []; // the folded first, then the document's own rows (§10)
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
      ok(ty.h1 === 26 && ty.h2 === 20 && ty.h3 === 16 && Math.abs(ty.lh - 1.6) < 0.02 && Math.abs(ty.col - (ty.page - 64)) <= 1, `④ h1 26 / h2 20 / h3 16, body 15 / 1.6, the column ${Math.round(ty.col)} px = the page − 2×32 (Fit, the default since 2.369.239; Comfortable = 76ch ${Math.round(ty.ch76)} — §10)`, ty);
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
      const blk = await inSW(`const pre = pm.querySelector(':scope > pre'); const raw = pm.querySelector('.doc-rawblock'); const fig = pm.querySelector('figure'); return { lang: getComputedStyle(pre, '::after').content, font: getComputedStyle(pre).fontSize + '/' + (parseFloat(getComputedStyle(pre).lineHeight) / parseFloat(getComputedStyle(pre).fontSize)).toFixed(2), head: raw ? (raw.querySelector('.doc-raw-head') || {}).textContent || null : null, cap: fig && fig.querySelector('figcaption') ? fig.querySelector('figcaption').textContent : null, q: getComputedStyle(pm.querySelector('blockquote')).borderLeftWidth };`);
      ok(blk.lang === '"js"' && blk.font === '13px/1.55', '⑥ the code block wears its fence\'s language chip ("js"), 13 / 1.55 mono', blk);
      const sp = await inSW(`const pre = pm.querySelector(':scope > pre'); const code = pm.querySelector('p code'); const p = code && code.closest('p'); return { pre: pre.spellcheck, code: code ? code.spellcheck : null, prose: p ? p.spellcheck : null };`);
      ok(sp.pre === false && sp.code === false && sp.prose === true, '⑥ the browser spell-checks the prose, not the code: the code block and inline code carry spellcheck=false', sp);
      ok(/HTML/.test(blk.head || '') && blk.cap === '示例图片 sample image' && blk.q === '3px', 'T7: the raw block\'s head says HTML, the image\'s caption is its alt, the quote\'s 3 px rule', blk);
      await inSW(`for (const x of c.querySelectorAll('.doc-cmt-x')) x.click(); return true;`);
      fs.writeFileSync(SP, SAMPLE); await sleep(2600);
    }
    if (deep && mobile) {
      // ⑧ THE PHONE: the bar folds to the style + B I, 36 px targets, nothing clipped, the table scrolls in its wrapper,
      //    the strip scrolls sideways, the comments strip is the bottom sheet
      const v = await barCensus();
      const rows = v && v.folded.length ? (await moreRows()).slice(0, v.folded.length) : []; // the folded first, then the document's own rows (§10)
      ok(barOk(v) && v.shown.filter((x) => x.k !== 'sep').every((x) => x.h >= 36 && x.w >= 36) && v.shown.some((x) => x.k === 'bold') && v.shown.some((x) => x.k === 'style') && /\btable\b/.test(v.folded.map((x) => x.k).join(' ')) && rows.length === v.folded.length, '⑧ 390: one row, every target ≥ 36 × 36, style + B shown, the inserts folded into ⋯', { v, rows });
      const clip = await inSW(`const wr = R(c); const out = [...c.querySelectorAll('.doc-bar > *, .doc-status > *, .doc-page')].filter((e) => e.getClientRects().length && !e.closest('.doc-status')).filter((e) => { const r = R(e); return r.left < wr.left - 0.5 || r.right > wr.right + 0.5; }).map((e) => e.className); const tw = pm.querySelector('.tableWrapper'); const pane = c.querySelector('.doc-pane'); return { out, tw: tw && { sw: tw.scrollWidth, cw: tw.clientWidth, ox: getComputedStyle(tw).overflowX }, pane: { sw: pane.scrollWidth, cw: pane.clientWidth }, h1: parseFloat(getComputedStyle(pm.querySelector('h1')).fontSize), h2: parseFloat(getComputedStyle(pm.querySelector('h2')).fontSize), pad: getComputedStyle(c.querySelector('.doc-page')).paddingLeft };`);
      ok(!clip.out.length && clip.tw && clip.tw.sw > clip.tw.cw && clip.tw.ox === 'auto' && clip.pane.sw <= clip.pane.cw + 1 && clip.h1 === 23 && clip.h2 === 18 && clip.pad === '12px', '⑧ nothing clipped; the wide table scrolls INSIDE its wrapper (the page does not); h1 23 / h2 18; 12 px gutters (2.369.239)', clip);
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
  } // §9
} catch (e) {
  ok(false, 'the suite ran to its end', e && e.stack);
  console.log(journal.join('').slice(-2000));
} finally {
  const ended = cleanup();
  console.log(`\n[doc-window] ${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'} · ended ${ended.length} rooted process(es)`);
  process.exit(fail ? 1 : 0);
}
