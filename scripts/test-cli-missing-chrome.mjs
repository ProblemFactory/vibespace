#!/usr/bin/env node
// A CLI THE PERSON'S LOGIN SHELL CANNOT FIND IS REFUSED BY NAME, IN A DIALOG — WITH A REAL CHROME (lane cli-shell-truth,
// B-fb02; the owner 2026-11-03: a codex conversation that would not resume — the hub's PATH had no codex, the spawn died
// ~30 s later and the UI said NOTHING).
// HEAVY: a plain copy of this checkout (its bundle built here by esbuild) booted as a scratch hub whose SHELL is a
// SCRATCH LOGIN SHELL (an sh script honouring -l -i -c; its "rc" prints a banner and sets PATH to the fake-bin dir +
// /usr/bin:/bin — never this machine's own zsh). The hub's OWN PATH has a `claude` in a directory named `hub<b>only`
// (markup in a path: data, never markup); the shell's PATH has a fake `codex` and no claude. Headless Chrome over raw CDP:
//   ① en / zh / ja · a new Claude chat from the page (app.createSession) ⇒ the create answers cli-missing (nothing ran) ⇒
//     the DIALOG «claude was not found»: what was asked (your login-shell, as a login shell), the sentence, the hint
//     naming the hub's path (its `<b>` shown as text), two doors — «Open Manage agents» / «How to install» — in that
//     language; no toast
//   ② en · «Open Manage agents» closes the dialog and opens Manage agents, whose census line under each CLI says where it
//     was found: Codex «found by your login-shell at …/codex», Claude Code «not found by your login-shell · the hub’s
//     PATH has …/hub<b>only/claude» (text, no <b> element)
// PNGs: $VIBESPACE_CLI_MISSING_PNG_DIR/{dialog-en,dialog-zh,dialog-ja,census-en}.png
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePorts, scratch, scratchHome, vncEnv, endRootedProcesses, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WebSocket = require(path.join(repo, 'node_modules', 'ws'));
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome for the client'); process.exit(0); }
const SHADOW = ['/usr/bin/claude', '/bin/claude'].filter((p) => fs.existsSync(p));
if (SHADOW.length) { console.log(`SKIP: a claude sits in the scratch shell's own PATH (${SHADOW.join(', ')}) — the "not found" create cannot be made here`); process.exit(0); }
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1400) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch { } if (v) return v; await sleep(step); } return null; };
const J = JSON.stringify;
const PNG_DIR = process.env.VIBESPACE_CLI_MISSING_PNG_DIR || null;
const [PORT, CDP_PORT] = await freePorts(2);
const VNC_ENV = await vncEnv();
const ROOT = scratch('cli-missing-chrome');
fs.rmSync(ROOT, { recursive: true, force: true });
const home = scratchHome('cli-missing-home', fs);

// ── THE MACHINE: the hub's own PATH has a claude (hub<b>only), the person's shell has a codex and no claude ──
const HUBONLY = path.join(ROOT, 'hub<b>only'), BIN = path.join(ROOT, 'fake-bin'), CWD = path.join(home, 'work');
for (const d of [HUBONLY, BIN, CWD]) fs.mkdirSync(d, { recursive: true });
const MARK = path.join(ROOT, 'ran.log');
fs.writeFileSync(path.join(HUBONLY, 'claude'), `#!/bin/sh\n[ "$1" = --version ] && { echo "2.1.308 (Claude Code)"; exit 0; }\necho "$0" >> '${MARK}'\nexit 0\n`, { mode: 0o755 });
fs.writeFileSync(path.join(BIN, 'codex'), '#!/bin/sh\n[ "$1" = --version ] && echo "codex-cli 0.99.0"\nexit 0\n', { mode: 0o755 });
const LOGIN_SH = path.join(ROOT, 'login-shell');
fs.writeFileSync(LOGIN_SH, `#!/bin/sh\necho "scratch rc banner"\nPATH='${BIN}':/usr/bin:/bin; export PATH\nwhile [ $# -gt 0 ]; do case "$1" in -c) shift; exec /bin/sh -c "$1";; *) shift;; esac; done; exit 9\n`, { mode: 0o755 });

// ── THE TREE: a plain copy of this checkout, its bundle built here ──
const wt = path.join(ROOT, 'tree');
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true });
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error', { cwd: wt, stdio: 'ignore' });

const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, SHELL: LOGIN_SH, PATH: [HUBONLY, BIN, path.join(wt, 'data/bin'), path.dirname(process.execPath), '/usr/bin', '/bin'].join(':'),
  VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
for (const k of ['DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'CLAUDE_CMD', 'CODEX_CMD', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) delete srvEnv[k];
const srvLog = [];
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d)));
const client = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--window-size=1100,800', `--user-data-dir=${path.join(ROOT, 'client')}`, 'about:blank'], { stdio: 'ignore', detached: true });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { process.kill(-client.pid, 'SIGKILL'); } catch { }
  try { process.kill(-srv.pid, 'SIGKILL'); } catch { }
  for (const root of [ROOT, home]) { try { endRootedProcesses(root); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

try {
  const up = await until(async () => { if (srv.exitCode !== null) return 'dead'; await fetch(`http://127.0.0.1:${PORT}/api/home`); return 'up'; }, 120000, 250);
  check('the scratch hub answers (its SHELL a scratch login shell)', up === 'up', srvLog.join('').slice(-600));
  if (up !== 'up') throw new Error('no server');
  check('boot resolved claude to the hub\'s own PATH (the provisional answer — the shell is never asked at boot)', srvLog.join('').includes(`claude: ${path.join(HUBONLY, 'claude')}`) && !srvLog.join('').includes('(login shell)'), (srvLog.join('').match(/claude: \S+/) || [''])[0]);

  const ver = await until(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(), 30000);
  const cdp = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(J({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const SPY = `(() => { window.__answers = []; window.__toasts = [];
    const iv = setInterval(() => { if (!window.app || !app.ws || !app.ws.onGlobal || app.ws.__spied) return; app.ws.__spied = true; clearInterval(iv);
      app.ws.onGlobal((m) => { if (m && (m.type === 'created' || m.type === 'error')) window.__answers.push({ type: m.type, code: m.code || null, cli: m.cli || null, shell: m.shell || null, hubPath: m.hubPath || null }); }); }, 50);
    new MutationObserver((ms) => { for (const r of ms) for (const n of r.addedNodes) if (n.nodeType === 1 && /toast/.test(n.className || '')) window.__toasts.push(n.textContent || ''); }).observe(document.documentElement, { childList: true, subtree: true }); })();`;
  async function newPage(lang) {
    const tg = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const a = await send('Target.attachToTarget', { targetId: tg.result.targetId, flatten: true });
    const s = a.result.sessionId; const S = (m, p) => send(m, p, s);
    await S('Page.enable'); await S('Runtime.enable');
    await S('Emulation.setDeviceMetricsOverride', { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` });
    await S('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
    await S('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const ev = async (expr) => { const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { __err: J(r.result.exceptionDetails).slice(0, 500) }; return r.result && r.result.result ? r.result.result.value : undefined; };
    const ready = await until(() => ev("!!(window.app && app.wm && app.ws && app.ws.__spied && typeof app.createSession === 'function') && !document.getElementById('loading-screen')"), 60000, 300);
    const shot = async (name) => { if (!PNG_DIR) return; try { fs.mkdirSync(PNG_DIR, { recursive: true }); const r = await S('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(PNG_DIR, name), Buffer.from(r.result.data, 'base64')); } catch { } };
    return { ev, ready, shot, close: () => send('Target.closeTarget', { targetId: tg.result.targetId }) };
  }
  const DIALOG = `(() => { const d = document.getElementById('cli-missing-dialog'); if (!d) return null; const q = (s) => d.querySelector(s);
    return { title: q('.dialog-header h3')?.textContent || '', asked: q('.cli-missing-asked')?.textContent || '', what: q('.cli-missing-what')?.textContent || '', hint: q('.cli-missing-hint')?.textContent || '',
      manage: q('.cli-missing-manage')?.textContent || '', docs: q('.cli-missing-docs')?.textContent || '', bTags: d.querySelectorAll('.dialog-body b').length, native: typeof window.__nativeDialogs === 'number' ? window.__nativeDialogs : 0 }; })()`;
  const WORDS = {
    en: { title: 'claude was not found', asked: 'your login-shell, as a login shell', manage: 'Open Manage agents', docs: 'How to install', what: 'Nothing was started.' },
    zh: { title: '找不到 claude', asked: '你的 login-shell（作为登录 shell）', manage: '打开「管理 agent」', docs: '如何安装', what: '没有启动任何东西' },
    ja: { title: 'claude が見つかりません', asked: 'あなたの login-shell（ログインシェルとして）', manage: '「エージェントを管理」を開く', docs: 'インストール方法', what: '何も起動していません' },
  };
  const hubClaude = path.join(HUBONLY, 'claude');
  console.log('① a refused create ⇒ the dialog (en / zh / ja)');
  let enPage = null;
  for (const lang of ['en', 'zh', 'ja']) {
    const pg = await newPage(lang);
    check(`${lang}: the page is up`, !!pg.ready);
    const ranBefore = fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').length : 0;
    await pg.ev(`(() => { window.__nativeDialogs = 0; for (const k of ['alert', 'confirm', 'prompt']) { const o = window[k]; window[k] = (...a) => { window.__nativeDialogs++; return o ? undefined : undefined; }; } app.createSession({ backend: 'claude', cwd: ${J(CWD)}, mode: 'chat', name: 'cli-missing ${lang}' }); return true; })()`);
    const ans = await until(() => pg.ev("(window.__answers || []).find((a) => a.type === 'error' || a.type === 'created') || null"), 30000);
    check(`${lang}: the create answers cli-missing by name (cli claude, the shell named, the hub's path as the hint) — and nothing ran`, ans && ans.type === 'error' && ans.code === 'cli-missing' && ans.cli === 'claude' && ans.shell === 'login-shell' && ans.hubPath === hubClaude && (fs.existsSync(MARK) ? fs.readFileSync(MARK, 'utf8').length : 0) === ranBefore, ans);
    const d = await until(() => pg.ev(DIALOG), 10000);
    const w = WORDS[lang];
    check(`${lang}: THE DIALOG «${d && d.title}» says what was asked, the sentence and the hint`, !!d && d.title === w.title && d.asked.includes(w.asked) && d.what.startsWith(w.what) && d.what.includes('claude') && d.hint.includes(hubClaude), d);
    check(`${lang}: its two doors — «${w.manage}» and «${w.docs}»`, !!d && d.manage === w.manage && d.docs === w.docs, d);
    check(`${lang}: the hub's path (with <b> in it) is TEXT — no <b> element, no native dialog, no toast`, !!d && d.bTags === 0 && d.hint.includes('<b>') && d.native === 0 && ((await pg.ev('window.__toasts.length')) || 0) === 0, { d, toasts: await pg.ev('window.__toasts') });
    await pg.shot(`dialog-${lang}.png`);
    if (lang === 'en') enPage = pg; else await pg.close();
  }

  console.log('② the doors: «Open Manage agents» ⇒ the census line under each CLI');
  {
    const pg = enPage;
    await pg.ev("document.querySelector('#cli-missing-dialog .cli-missing-manage').click()");
    const gone = await until(() => pg.ev("!document.getElementById('cli-missing-dialog')"), 5000);
    const rows = await until(() => pg.ev(`(() => { const out = {}; for (const r of document.querySelectorAll('.ob-backend')) { const b = r.querySelector('.ob-backend-id b'); const w = r.querySelector('.ob-cli-where'); if (b && w) out[b.textContent] = { text: w.textContent, warn: w.classList.contains('ob-cli-where-warn'), bTags: w.querySelectorAll('b').length }; } return Object.keys(out).length >= 2 ? out : null; })()`), 30000);
    check('«Open Manage agents» closes the dialog and opens Manage agents', !!gone && !!rows, rows);
    const cx = rows && rows['Codex'], cl = rows && rows['Claude Code'];
    check(`the Codex row: «${cx && cx.text}» (found by the login shell, the path it named)`, !!cx && cx.text === `found by your login-shell at ${path.join(BIN, 'codex')}` && !cx.warn, cx);
    check(`the Claude Code row: «${cl && cl.text}» (not found by the shell; the hub's path a hint, as text)`, !!cl && cl.text === `not found by your login-shell · the hub’s PATH has ${hubClaude}` && cl.warn && cl.bTags === 0, cl);
    const st = await (await fetch(`http://127.0.0.1:${PORT}/api/backend-status`)).json();
    check('/api/backend-status: claude NOT installed (the shell is the truth), codex installed at the shell\'s path — each with its provenance', st.claude?.installed === false && st.claude?.answer === 'none' && st.claude?.hubPath === hubClaude && st.codex?.installed === true && st.codex?.provenance === 'shell' && st.codex?.cmdPath === path.join(BIN, 'codex'), { claude: st.claude, codex: st.codex });
    await pg.shot('census-en.png');
  }
  const refusals = srvLog.join('').split('\n').filter((l) => /\[cli-cmd\] claude: .*refused \(cli-missing\)/.test(l));
  check(`the journal: ONE line per refused create (${refusals.length} for 3 creates)`, refusals.length === 3, refusals.slice(0, 2));
} catch (e) {
  check('the suite ran to its end', false, e && e.stack);
} finally {
  console.log(`\n${failed ? failed + ' FAILED (' + passed + ' passed)' : 'ALL PASS (' + passed + ')'}`);
  cleanup();
  process.exit(failed ? 1 : 0);
}
