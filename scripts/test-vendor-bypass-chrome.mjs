#!/usr/bin/env node
// test-vendor-bypass-chrome — bypass-witness-hint (owner 2026-10-13: a Lark read through the agent's own larkhelp.py
// showed a bare Bash card). The REAL channelTouchHolderHtml (esbuild iife of src/lib/chat-renderers.js) renders three
// Bash cards in headless Chrome with the shipped style.css + chat.css: a larkhelp heredoc ⇒ the muted hint line naming
// Lark and the vibespace-channels door; a `vibespace-channels read` ⇒ the witness box, no hint; a word in prose ⇒
// nothing. en + zh. Scratch profile + private HOME / XDG_RUNTIME_DIR; no DISPLAY (headless). PNG_DIR=… keeps desk/phone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n      ' + String(extra).slice(0, 400) : '')); } return !!c; };
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no Chrome on this machine\n\nALL PASS (0, 1 skipped)'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-vbh-'));
const esbuild = require(path.join(REPO, 'node_modules/esbuild'));
const js = esbuild.buildSync({ stdin: { contents: "import { channelTouchHolderHtml } from './src/lib/chat-renderers.js'; window.__holder = channelTouchHolderHtml;", resolveDir: REPO, loader: 'js' }, bundle: true, format: 'iife', write: false, logLevel: 'silent', loader: { '.svg': 'text', '.css': 'text' } }).outputFiles[0].text;
fs.writeFileSync(path.join(tmp, 'b.js'), js);
const CARDS = [
  { id: 'lark', cmd: "cd /tmp && python3 - <<'EOF'\nfrom larkhelp import call, children, text_of\nfor m in children('oc_e53d5350615a'): print(text_of(m))\nEOF", out: '✓ 张三: 周五前交季度报告' },
  { id: 'door', cmd: 'vibespace-channels read lark/oc_e53d5350615a --limit 20', out: '✓ 20 messages' },
  { id: 'prose', cmd: 'echo "remember to check lark and slack later"', out: '✓ remember to check lark and slack later' },
];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const page = (lang) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${pathToFileURL(path.join(REPO, 'public/style.css'))}"><link rel="stylesheet" href="${pathToFileURL(path.join(REPO, 'public/chat.css'))}">
<script>try { localStorage.setItem('vibespace.lang', '${lang}'); } catch {}</script><script src="b.js"></script></head>
<body style="padding:12px;overflow:auto;height:auto"><div class="chat-messages" id="m"></div><script>
const C = ${JSON.stringify(CARDS)}; const E = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
document.getElementById('m').innerHTML = C.map((c) => '<div class="chat-message assistant" data-card="' + c.id + '"><div class="chat-tool-use"><span class="chat-tool-label">⌘ Bash</span><details class="chat-diff"><summary class="chat-diff-summary">Input</summary><pre>' + E(c.cmd) + '</pre></details><details class="chat-diff"><summary class="chat-diff-summary">' + E(c.out) + '</summary></details>' + window.__holder({ toolName: 'Bash', input: { command: c.cmd } }) + '</div></div>').join('');
document.title = 'rendered';
</script></body></html>`;
const env = { PATH: process.env.PATH, HOME: path.join(tmp, 'home'), XDG_RUNTIME_DIR: path.join(tmp, 'xdg'), TMPDIR: tmp, LANG: 'C.UTF-8' };
fs.mkdirSync(env.HOME); fs.mkdirSync(env.XDG_RUNTIME_DIR, { mode: 0o700 });
const chrome = (args) => execFileSync(CHROME, ['--headless=new', '--no-first-run', '--disable-gpu', '--allow-file-access-from-files', `--user-data-dir=${path.join(tmp, 'prof')}`, '--virtual-time-budget=3000', ...args], { env, encoding: 'utf-8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
const cardOf = (dom, id) => { const i = dom.indexOf(`data-card="${id}"`); const j = dom.indexOf('data-card="', i + 12); return i < 0 ? '' : dom.slice(i, j < 0 ? undefined : j); };
for (const lang of ['en', 'zh']) {
  console.log(`\n① ${lang}: the three Bash cards`);
  const f = path.join(tmp, `p-${lang}.html`); fs.writeFileSync(f, page(lang));
  const dom = chrome(['--dump-dom', pathToFileURL(f).href]);
  ok(/<title>rendered<\/title>/.test(dom), 'the real renderer bundle ran in Chrome', dom.slice(0, 300));
  const lark = cardOf(dom, 'lark'), door = cardOf(dom, 'door'), prose = cardOf(dom, 'prose');
  const want = lang === 'zh' ? /这次直接读了 Lark，没经过 VibeSpace 频道 — 没有频道卡片、已读标记和预算记录；用 vibespace-channels read 会有。/ : /This read Lark directly, not through VibeSpace channels — no channel card, read marker or budget record; vibespace-channels read would have them\./;
  ok(/class="chat-vendor-bypass chat-status-dim"/.test(lark) && want.test(lark), 'the larkhelp heredoc card carries ONE muted hint line naming Lark and the vibespace-channels door', lark.slice(-500));
  ok((lark.match(/chat-vendor-bypass/g) || []).length === 1 && !/chat-channel-touches/.test(lark), '…exactly one line, and no (empty) witness box — nothing was witnessed');
  ok(/class="chat-channel-touches" hidden/.test(door) && !/chat-vendor-bypass/.test(door), 'CONTROL: a `vibespace-channels read` card keeps the witness box and has NO hint');
  ok(!/chat-vendor-bypass|chat-channel-touches/.test(prose), 'NEGATIVE: "lark" in prose draws nothing');
  if (process.env.PNG_DIR && lang === 'zh') {
    for (const [name, size] of [['desk', '900,430'], ['phone', '390,640']]) {
      const out = path.join(process.env.PNG_DIR, `${name}.png`);
      chrome([`--screenshot=${out}`, `--window-size=${size}`, '--hide-scrollbars', pathToFileURL(f).href]);
      ok(fs.existsSync(out) && fs.statSync(out).size > 5000, `PNG ${name} written (${out})`);
    }
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
