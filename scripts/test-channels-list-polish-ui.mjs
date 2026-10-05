#!/usr/bin/env node
// lane channels-list-polish — HEAVY (server + chrome, zero vendor calls): the Channels list after the owner's six points.
// A real worktree server on a store SEEDED with one DISABLED Lark account (the pictures come from the account's on-disk
// memo, the identity + Mia's nickname from its people memo): the Bob DM in the OWNER's exact index shape (authors
// [owner, Bob], neither isSelf) shows the PEER's face (pixel probe), the account badge paints ON TOP (pixel probe at
// the corner) wearing the vendor's own mark, the group row wears the group's picture, the per-account rows are chat rows
// (avatar · name · "author: last line"), no access line on an inherited row; zh, ja at 390 px; CONTROL: a scratch copy
// with the old peerOf draws the owner's face. CLP_SHOTS=<dir> writes after-list-zh.png + after-dm-zh.png.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const T0 = Date.now();
const PORT = await freePort(), CDP_PORT = await freePort();
const wt = scratch('chan-list-polish');
const fakeHome = scratchHome('chan-list-polish-home', fs);
const chromeDir = scratch('chan-list-polish-chrome');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
/** The redraw bound: measured 2–4 ms here after the fix (90–115 before), ×10 slack for a loaded runner. */

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) { fs.rmSync(path.join(wt, f), { recursive: true, force: true }); fs.cpSync(path.join(repo, f), path.join(wt, f), { recursive: true }); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${JSON.stringify(require(path.join(repo, 'package.json')).version)};\n`);
const bundle = () => execSync('npx esbuild src/client.js --bundle --outfile=public/bundle.js --format=iife --platform=browser --target=es2020 --loader:.css=css', { cwd: wt, stdio: 'ignore' });
bundle();
const SHOTS = process.env.CLP_SHOTS || '';


// ── the SEED (zero vendor calls: a DISABLED Lark account; pictures from the account's on-disk memo) ──
const W = (rel) => require(path.join(wt, rel));
const zlib = require('node:zlib');
const png = (r, g, b) => { const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); }; const ih = Buffer.alloc(13); ih.writeUInt32BE(8, 0); ih.writeUInt32BE(8, 4); ih[8] = 8; ih[9] = 2; const raw = Buffer.alloc(8 * 25); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) raw.set([r, g, b], y * 25 + 1 + x * 3); return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };
const NOW = Date.now(), MIN = 60e3;
{
  const { createChannelStore } = W('src/channel-store.js');
  const store = createChannelStore({ dir: path.join(wt, 'data/channels'), log: { log() {}, warn() {}, error() {} } });
  await store.adapters.update((ad) => { ad.adapters.push({ id: 'lark', kind: 'lark', label: 'Lark', enabled: false, auth: { tokenEnc: null, expiresAt: null, scopes: ['im:message'], user: null }, lastPass: null, consecutiveFailures: 0, push: { enabled: false, claimedExclusive: 'unknown', state: null, lastEventAt: null, missRate: 0, demotedAt: null, demotedWhy: null, samples: [] } }); });
  const caps = { read: 'yes', sendAs: ['user'], why: null, at: NOW };
  await store.index.update(() => {
    // the OWNER's exact shape: the DM titled Bob, authors [owner, Bob], NEITHER isSelf
    const dm = store.index.entry('lark', 'oc_dm'); Object.assign(dm, { title: 'Bob', kind: 'dm', convCaps: caps, lastAt: NOW - MIN, listedAt: NOW, unread: 1, lastText: 'see you at 4', authors: [{ id: 'ou_me', name: 'Owner' }, { id: 'ou_bob', name: 'Bob' }] });
    const g = store.index.entry('lark', 'oc_grp'); Object.assign(g, { title: 'Fish B2B', kind: 'group', convCaps: caps, lastAt: NOW - 2 * MIN, listedAt: NOW, unread: 0, lastText: 'the deck is ready\nsecond line', authors: [{ id: 'ou_kit', name: 'Kit' }, { id: 'ou_me', name: 'Owner' }] });
    for (let i = 0; i < 12; i++) { const en = store.index.entry('lark', 'oc_f' + i); Object.assign(en, { title: 'Room ' + i, kind: 'group', convCaps: caps, lastAt: NOW - (10 + i) * MIN, listedAt: NOW, lastText: 'filler ' + i }); }
  });
  store.peopleWrite('lark', { self: 'ou_me', people: { ou_kit: { name: 'Kit', alt: { nickname: 'Mia (Marketing)' }, at: NOW } } });
  await store.avatarPut('lark', 'ou_bob', { data: png(220, 30, 30), mime: 'image/png' });   // the PEER: red
  await store.avatarPut('lark', 'ou_me', { data: png(30, 200, 30), mime: 'image/png' });      // the OWNER: green
  await store.avatarPut('lark', 'chat~oc_grp', { data: png(30, 60, 220), mime: 'image/png' }); // the GROUP: blue
  store.index.flush && store.index.flush(); store.close && store.close();
}
const boot = () => spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
const srv = boot();
let srv2 = null;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1400,1000', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  try { srv2 && srv2.kill('SIGKILL'); } catch {}
  try { endRootedProcesses(wt); } catch {}   // whatever the server started under the scratch tree
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [chromeDir, fakeHome]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
ok(await waitServer(), 'the worktree server booted on the seeded store');
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const WebSocket = require(path.join(repo, 'node_modules/ws'));
for (let i = 0; i < 120; i++) { try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); break; } catch { await sleep(250); } }
async function newPage() {
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
  const tg = await r.json();
  const ws = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res) => ws.on('open', res));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const evaljs = async (expr) => {
    const r2 = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r2.result?.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r2.result.exceptionDetails).slice(0, 900));
    if (!r2.result || !r2.result.result || !('value' in r2.result.result)) throw new Error('no value from page: ' + JSON.stringify(r2).slice(0, 600));
    return r2.result.result.value;
  };
  const load = async () => {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    for (let i = 0; i < 160; i++) { try { if (await evaljs("!!(window.app && window.app.wm && window.app.sidebar && window.app.openChannel) && !document.getElementById('loading-screen')")) return true; } catch {} await sleep(250); }
    return false;
  };
  return { cdp, evaljs, load, close: () => { try { ws.close(); } catch {} } };
}


const OPEN = `(async () => {
  const btn = document.querySelector('[data-rail="channels"], [data-tab="channels"]'); if (btn) btn.click();
  for (let i = 0; i < 100 && !document.querySelector('.chan-row[data-conv="lark/oc_dm"] img.chan-av-img'); i++) await new Promise((r) => setTimeout(r, 100));
  const row = document.querySelector('.chan-row[data-conv="lark/oc_dm"]'); if (row) row.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 400));
  return !!row;
})()`;
// the pixel probe: a screenshot decoded IN the page (an <img> on a canvas) at the avatar's centre and the badge's centre
async function probe(p, conv) {
  const R = await p.evaljs(`(() => { const r = document.querySelector('.chan-row[data-conv="${conv}"]'); if (!r) return null; const av = r.querySelector('.chan-av'), b = r.querySelector('.chan-av-badge'), im = r.querySelector('img.chan-av-img'); const q = (e) => { if (!e) return null; const x = e.getBoundingClientRect(); return { x: x.left + x.width / 2, y: x.top + x.height / 2 }; }; return { av: q(av), badge: q(b), src: im ? im.getAttribute('src') : null, mark: b && b.querySelector('.chan-av-mark') ? b.querySelector('.chan-av-mark').dataset.mark : null, last: (r.querySelector('.chan-row-last') || {}).textContent || '', assign: !!r.querySelector('.chan-row-assign') }; })()`);
  if (!R || !R.av) return R;
  const shot = (await p.cdp('Page.captureScreenshot', { format: 'png' })).result.data;
  const px = await p.evaljs(`(async () => { const im = new Image(); im.src = 'data:image/png;base64,${shot}'; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const at = (pt) => pt ? [...x.getImageData(Math.round(pt.x * im.width / innerWidth), Math.round(pt.y * im.height / innerHeight), 1, 1).data].slice(0, 3) : null; return { av: at(${J(R.av)}), badge: at(${J(R.badge)}) }; })()`);
  return { ...R, px };
}
const red = (c) => c && c[0] > 150 && c[1] < 90 && c[2] < 90, green = (c) => c && c[1] > 150 && c[0] < 90, blue = (c) => c && c[2] > 150 && c[0] < 90;
const p1 = await newPage();
await p1.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
ok(await p1.load(), 'the app loaded (zh)');
ok(await p1.evaljs(OPEN), 'the Channels panel shows the per-account list');
const DM = await probe(p1, 'lark/oc_dm');
ok(DM && /author=ou_bob/.test(DM.src || ''), '① the Bob DM row asks the PEER\'s picture (ou_bob), never the owner\'s', J(DM && DM.src));
ok(DM && red(DM.px && DM.px.av), '① PIXEL: the avatar centre is the peer\'s face (red), not the owner\'s (green)', J(DM && DM.px));
ok(DM && DM.px && DM.px.badge && !red(DM.px.badge), '② PIXEL: the account badge at the corner is painted ON TOP of the picture', J(DM && DM.px));
ok(DM && DM.mark === 'lark', '③ the badge wears the vendor\'s own mark (public/brand/lark.svg)', J(DM && DM.mark));
const GR = await probe(p1, 'lark/oc_grp');
ok(GR && blue(GR.px && GR.px.av) && /author=chat~oc_grp/.test(GR.src || ''), '④ the group row wears the GROUP\'s own picture (chat~ key, blue)', J(GR));
ok(GR && GR.last === 'Mia (Marketing): the deck is ready', '⑤⑥ the list row\'s last line = "author: first line", the author by her org nickname', J(GR && GR.last));
ok(DM && !DM.assign && GR && !GR.assign, '⑥ an inherited row prints NO access/notify line');
const rowsZh = await p1.evaljs(`[...document.querySelectorAll('.chan-row-chat')].length`);
ok(rowsZh >= 10, '⑥ every per-account row is the chat row (avatar · name · last line)', String(rowsZh));
const TW = await p1.evaljs(`Math.round(document.querySelector('.chan-row[data-conv="lark/oc_dm"] .chan-row-title').getBoundingClientRect().width)`);
ok(TW >= 40, '⑥ the name keeps its room in the rail (the pill and the time give way)', String(TW));
if (SHOTS) { fs.writeFileSync(path.join(SHOTS, 'after-list-zh.png'), Buffer.from((await p1.cdp('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); const b = await p1.evaljs(`(() => { const r = document.querySelector('.chan-row[data-conv="lark/oc_dm"]').getBoundingClientRect(); return { x: Math.max(0, r.left - 8), y: Math.max(0, r.top - 8), width: r.width + 16, height: r.height * 2 + 24, scale: 2 }; })()`); fs.writeFileSync(path.join(SHOTS, 'after-dm-zh.png'), Buffer.from((await p1.cdp('Page.captureScreenshot', { format: 'png', clip: b })).result.data, 'base64')); }
p1.close();
// ja + 390 px
const p2 = await newPage();
await p2.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await p2.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
await p2.cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'ja'); } catch {}" });
await p2.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
let up2 = false; for (let i = 0; i < 160 && !up2; i++) { try { up2 = await p2.evaljs("!!(window.app && window.app.openChannels) && !document.getElementById('loading-screen')"); } catch {} if (!up2) await sleep(250); }
ok(up2, 'the app loaded at 390 px in 日本語');
await p2.evaljs(`(async () => { window.app.openChannels(); for (let i = 0; i < 100 && !document.querySelector('.chan-row[data-conv="lark/oc_dm"]'); i++) await new Promise((r) => setTimeout(r, 100)); return true; })()`);
const PH = await p2.evaljs(`(() => { const r = document.querySelector('.chan-row[data-conv="lark/oc_dm"]'); if (!r) return null; const b = r.getBoundingClientRect(), av = r.querySelector('.chan-av').getBoundingClientRect(), last = r.querySelector('.chan-row-last').getBoundingClientRect(), ti = r.querySelector('.chan-row-title').getBoundingClientRect(); return { inside: b.right <= innerWidth + 1, avIn: av.left >= b.left - 1 && av.right <= b.right, lastIn: last.right <= b.right + 1 && last.width > 20, title: Math.round(ti.width), you: (r.querySelector('.chan-row-lastwho') || {}).textContent || '' }; })()`);
ok(PH && PH.inside && PH.avIn && PH.lastIn && PH.title >= 40 && PH.you === 'あなた: ', '⑥ 390 px ja: the row, its avatar, its title and its last line ("あなた: …") fit', J(PH));
p2.close();
// CONTROL: the old peerOf (the first author without isSelf, no stamp) on a scratch copy ⇒ the owner's face ⇒ red
try { srv.kill('SIGKILL'); } catch {}
const engRel = 'src/server/channels-engine.js', engSrc = fs.readFileSync(path.join(wt, engRel), 'utf-8');
const NEW_PEER = 'const id = Av.peerOf(authors, selfIdOf(rec));';
ok(engSrc.includes(NEW_PEER), 'CONTROL: the lane\'s peer line is where the control patches it');
fs.writeFileSync(path.join(wt, engRel), engSrc.replace(NEW_PEER, 'const id = ((en.authors || []).find((a) => a && a.id && !a.isSelf) || {}).id || null;'));   // the SCRATCH copy only
await sleep(500);
srv2 = boot();
ok(await waitServer(), 'CONTROL: the patched copy booted');
const p3 = await newPage();
await p3.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await p3.load(); await p3.evaljs(OPEN);
const C = await probe(p3, 'lark/oc_dm');
ok(C && green(C.px && C.px.av) && !red(C.px && C.px.av), 'CONTROL: the old peerOf draws the OWNER\'s face (green) on the Bob row — the probe that judges ① tells them apart', J(C));
p3.close();
console.log(`\n${pass}/${pass + fail} passed (${Math.round((Date.now() - T0) / 1000)} s)`);
process.exit(fail ? 1 : 0);
