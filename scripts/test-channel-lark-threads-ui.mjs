#!/usr/bin/env node
// A THREAD BORN AFTER ITS ROOT WAS READ + THE OWNER'S NAME FOR AN AUTHOR, IN A REAL BROWSER (lane lark-threads, 2026-10-01;
// heavy tier — a worktree server + headless chrome, zero vendor calls). The FAKE adapter (`VIBESPACE_CHANNELS_FAKE=1`)
// with the NAMED seam `VIBESPACE_CHANNELS_FAKE_TOPICS=<file>`: fake-poll lists thread replies SEPARATELY (Lark's shape)
// and a root the file names carries its topic from then on — the suite writes the file mid-run (a topic born on a root
// the window already drew). One leg per brief item:
//   (r) THE RECHECK: the root's row has no chip; the topic is born; the OWNER's Refresh (rule 22b) re-lists the chat, the
//       place door widens the stored root and the row grows its chip IN PLACE (no reload: a page marker survives, the row
//       is the same DOM node); a second tab drew it too; the walk then lands the reply and the chip counts it
//   (n) "Set a name…": a click on an author's name → the menu → the dialog → the owner's name is EVERY head of that
//       author in this tab AND in a second tab (in place, no reload), the vendor name its title; an empty name restores
//   (z) zh / ja: the menu's and the dialog's words are the dictionaries' (no English fallback)
// Scratch: ONE dir /tmp/vs-lkt-<pid> (worktree, chrome profile, HOME, the topics file inside it), free ports, never
// :7/5901 (vncEnv). Run: node scripts/test-channel-lark-threads-ui.mjs (SKIPs without chrome)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const PORT = await freePort(), CDP_PORT = await freePort();
const ROOT = scratch('lkt');
try { execSync(`git worktree remove --force ${path.join(ROOT, 'wt')}`, { cwd: repo, stdio: 'ignore' }); } catch {}
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const wt = path.join(ROOT, 'wt'), chromeDir = path.join(ROOT, 'chrome'), fakeHome = path.join(ROOT, 'home'), TOPICS = path.join(ROOT, 'topics.json');
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
fs.writeFileSync(TOPICS, JSON.stringify({ topics: {} }));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });

const srvLog = fs.openSync(path.join(ROOT, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], {
  cwd: wt, stdio: ['ignore', srvLog, srvLog],
  env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', VIBESPACE_CHANNELS_FAKE_TOPICS: TOPICS },
});
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 240; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted (the fake accounts; fake-poll lists thread replies separately)');
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const C = 'fake-poll-ops';
let recs = [];
for (let i = 0; i < 160; i++) { const r = await api('GET', `/api/channels/fake-poll/${C}/messages?limit=50`); recs = (r.json.records || r.json || []); if (r.status === 200 && Array.isArray(recs) && recs.length >= 5) break; await sleep(250); }
ok(Array.isArray(recs) && recs.length >= 5, `the ops room was ingested (${recs.length} records)`);
const plain = recs.filter((r) => !r.replyTo && !r.threadKey && r.author && r.author.id && !r.author.isSelf);
const root = plain[plain.length - 2] || plain[0];
const person = plain.find((r) => r.author.id !== root.author.id) || plain[0];

const WebSocket = require('ws');
async function newPage({ lang = 'zh' } = {}) {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const t = await r.json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  let ready = false;
  for (let i = 0; i < 200; i++) { try { if (await evaljs("!!(window.app && window.app.wm && window.app.openChannel) && !document.getElementById('loading-screen')")) { ready = true; break; } } catch {} await sleep(250); }
  if (ready) await evaljs('window.__noReload = 1; true');
  return { cdp, evaljs, ready, close: () => { try { ws.close(); } catch {} } };
}
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
const OPEN = (tag) => `(async () => {
  const w = window.app.openChannel('fake-poll', ${J(C)});
  window.app.wm.toggleMaximize(w.id);
  for (let i = 0; i < 200; i++) { if (w.content.querySelector('.chanmsg[data-vid=${J(String(root.vendorId))}]')) break; await new Promise((r) => setTimeout(r, 100)); }
  window.__w = window.__w || {}; window.__w[${J(tag)}] = w;
  const row = w.content.querySelector('.chanmsg[data-vid=${J(String(root.vendorId))}]');
  if (row) row.__probe = 'p-' + Math.random();
  return { found: !!row, chip: !!(row && row.querySelector('.chanmsg-thread-chip')), probe: row ? row.__probe : null };
})()`;
const ROW = (tag) => `(() => { const w = window.__w[${J(tag)}]; const row = w.content.querySelector('.chanmsg[data-vid=${J(String(root.vendorId))}]'); const chip = row && row.querySelector('.chanmsg-thread-chip'); return { noReload: window.__noReload === 1, probe: row ? row.__probe : null, chip: chip ? chip.textContent : null }; })()`;

const p1 = await newPage({ lang: 'zh' }), p2 = await newPage({ lang: 'ja' });
ok(p1.ready && p2.ready, 'two tabs loaded the app (zh, ja)');
console.log('(r) a thread born on a root the window already drew — the recheck');
const o1 = await p1.evaljs(OPEN('a')), o2 = await p2.evaljs(OPEN('b'));
ok(o1.found && o2.found && !o1.chip && !o2.chip, `the root (${root.vendorId}) is drawn in both tabs with NO thread chip (nobody had answered it in a thread)`, J([o1, o2]));
fs.writeFileSync(TOPICS, JSON.stringify({ topics: { [root.vendorId]: { key: 'fthr_lkt1', replies: [{ vendorId: 'lkt-r1', at: Date.now() - 5000, author: { id: 'u-brook', name: 'Brook' }, text: 'a reply made in the new topic' }] } } }));
const press = await api('POST', `/api/channels/fake-poll/${encodeURIComponent(C)}/refresh`, {});
let r1 = null, r2 = null;
for (let i = 0; i < 80; i++) { r1 = await p1.evaljs(ROW('a')); r2 = await p2.evaljs(ROW('b')); if (r1.chip && r2.chip) break; await sleep(250); }
ok(press.status === 200 && r1.chip && r2.chip && r1.noReload && r2.noReload && r1.probe === o1.probe && r2.probe === o2.probe, `the OWNER's Refresh re-lists the chat (rule 22b), the stored root WIDENS and its row grows the chip IN PLACE in both tabs — no reload, the same row node ("${r1.chip}" / "${r2.chip}")`, J({ press: press.status, r1, r2 }));
// the chip says "open to load": a click opens the pane, the walk loads the topic's reply (the fake account ticks once a
// minute here — its timer walk is test-channels-engine ㉓ (A)'s), and the chip counts it
const opened = await p1.evaljs(`(async () => {
  const w = window.__w.a;
  const row = w.content.querySelector('.chanmsg[data-vid=${J(String(root.vendorId))}]');
  const chip = row && row.querySelector('.chanmsg-thread-chip');
  if (!chip) return { clicked: false };
  chip.click();
  for (let i = 0; i < 120; i++) { if (w.content.querySelector('.chanthread .chanmsg[data-vid="lkt-r1"], [class*=chanthread] .chanmsg[data-vid="lkt-r1"]')) break; await new Promise((r) => setTimeout(r, 250)); }
  return { clicked: true, reply: !!w.content.querySelector('[class*=chanthread] .chanmsg[data-vid="lkt-r1"]') };
})()`);
let r3 = null;
for (let i = 0; i < 80; i++) { r3 = await p1.evaljs(ROW('a')); if (r3.chip && /1/.test(r3.chip)) break; await sleep(250); }
const th = await api('GET', `/api/channels/fake-poll/${encodeURIComponent(C)}/thread/${encodeURIComponent(root.vendorId)}`);
ok(opened.clicked && opened.reply && r3 && /1/.test(r3.chip || '') && (th.json.records || []).some((x) => x.vendorId === 'lkt-r1'), `the chip opens the pane and the walk loads the topic's reply; the chip then counts it ("${r3 && r3.chip}") — no reload (${r3 && r3.noReload})`, J({ opened, r3, th: (th.json.records || []).map((x) => x.vendorId) }));

console.log('(n) "Set a name…" — the owner\'s own name for an author, every head, both tabs');
const vid = String(person.vendorId), aid = String(person.author.id), vname = String(person.author.name);
const HEADS = (tag) => `(() => { const w = window.__w[${J(tag)}]; return [...w.content.querySelectorAll('.chanmsg-who[data-author-id=${J(aid)}]')].map((b) => ({ text: b.textContent, title: b.title || '' })); })()`;
const before1 = await p1.evaljs(HEADS('a')), before2 = await p2.evaljs(HEADS('b'));
ok(before1.length >= 1 && before1.every((h) => h.text === vname) && before2.every((h) => h.text === vname), `${aid}'s heads read the channel's name "${vname}" (${before1.length} in the zh tab, ${before2.length} in the ja tab)`, J([before1, before2]));
const menu = await p1.evaljs(`(async () => {
  const w = window.__w.a;
  const who = w.content.querySelector('.chanmsg-who[data-author-id=${J(aid)}]');
  who.scrollIntoView({ block: 'center' });
  who.click();
  // verify r2 ⑦: an EVIDENCE wait, never a sleep — the menu's rows exist (≤ 5 s), then the dialog's input exists (≤ 5 s)
  let waitedMenu = 0; for (; waitedMenu < 50 && !document.querySelector('.context-menu .context-menu-item'); waitedMenu++) await new Promise((r) => setTimeout(r, 100));
  const items = [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => x.textContent);
  const it = [...document.querySelectorAll('.context-menu .context-menu-item')].find((x) => /设置名字/.test(x.textContent));
  if (it) it.click();
  let waitedDlg = 0; for (; waitedDlg < 50 && !([...document.querySelectorAll('.dialog-overlay')].pop() || {}).querySelector; waitedDlg++) await new Promise((r) => setTimeout(r, 100));
  for (; waitedDlg < 50 && !([...document.querySelectorAll('.dialog-overlay')].pop() || { querySelector: () => null }).querySelector('input[type=text]'); waitedDlg++) await new Promise((r) => setTimeout(r, 100));
  const ov = [...document.querySelectorAll('.dialog-overlay')].pop();
  const input = ov ? ov.querySelector('input[type=text]') : null;
  const title = ov ? ((ov.querySelector('.dialog-header h3') || {}).textContent || '') : '';
  if (!input) return { items, title, input: false, waitedMenu, waitedDlg };
  input.value = 'Ada 林';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return { items, title, input: true, waitedMenu, waitedDlg };
})()`);
ok(menu.input && menu.items.some((x) => /设置名字…/.test(x)) && /起的名字/.test(menu.title), `(z) the head's menu says "设置名字…" and the dialog "${menu.title}" (zh — the dictionary's words); waited ${menu.waitedMenu * 100} ms for the menu, ${menu.waitedDlg * 100} ms for the dialog (evidence, ≤ 5 s each)`, J(menu));
let after1 = null, after2 = null;
for (let i = 0; i < 40; i++) { after1 = await p1.evaljs(HEADS('a')); after2 = await p2.evaljs(HEADS('b')); if (after1.every((h) => h.text === 'Ada 林') && after2.length && after2.every((h) => h.text === 'Ada 林')) break; await sleep(150); }
ok(after1.every((h) => h.text === 'Ada 林' && h.title.includes(vname)) && after2.every((h) => h.text === 'Ada 林' && h.title.includes(vname)) && (await p2.evaljs('window.__noReload === 1')), `the owner's name is EVERY head of ${aid} in BOTH tabs, in place (no reload); the title keeps the channel's name and says it is the owner's`, J({ after1, after2 }));
const agent = await api('GET', `/api/channels/fake-poll/${encodeURIComponent(C)}/messages?limit=50`);
const arec = (agent.json.records || agent.json || []).find((r) => r.vendorId === vid);
ok(arec && arec.author.display === 'Ada 林' && arec.author.name === vname && arec.author.alias === 'Ada 林', 'a fresh read of the page (the window\'s route) carries it: display = the owner\'s name, name = the channel\'s', J(arec && arec.author));
const ja = await p2.evaljs(`(async () => { const w = window.__w.b; const who = w.content.querySelector('.chanmsg-who[data-author-id=${J(aid)}]'); who.click(); for (let i = 0; i < 50 && !document.querySelector('.context-menu .context-menu-item'); i++) await new Promise((r) => setTimeout(r, 100)); const items = [...document.querySelectorAll('.context-menu .context-menu-item')].map((x) => x.textContent); document.querySelectorAll('.context-menu').forEach((x) => x.remove()); return items; })()`);   // verify r2 ⑦: an evidence wait
ok(ja.some((x) => /名前を設定…/.test(x)), `(z) the ja tab's menu says "名前を設定…"`, J(ja));
const clr = await api('PATCH', `/api/channels/fake-poll/authors/${encodeURIComponent(aid)}`, { alias: '' });
let back1 = null, back2 = null;
for (let i = 0; i < 40; i++) { back1 = await p1.evaljs(HEADS('a')); back2 = await p2.evaljs(HEADS('b')); if (back1.every((h) => h.text === vname) && back2.every((h) => h.text === vname)) break; await sleep(150); }
ok(clr.status === 200 && back1.every((h) => h.text === vname) && back2.every((h) => h.text === vname), 'an EMPTY name clears it: the channel\'s name returns in both tabs, in place', J({ clr: clr.json, back1, back2 }));
const ag = await fetch(`http://127.0.0.1:${PORT}/api/channels/fake-poll/authors/${encodeURIComponent(aid)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_not-the-owner' }, body: JSON.stringify({ alias: 'x' }) });
ok(ag.status === 403 || ag.status === 401, `an agent bearer is refused (${ag.status})`);
p1.close(); p2.close();
console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
