#!/usr/bin/env node
// test-host-stale-dialer-ui — A SECOND AGENT WITH AN OLD TOKEN IS NAMED ON ITS ROW (lane host-stale-dialer, B-6136,
// 2026-10-12; the owner's Macbook: a leftover agent refused every 30 s for a day while the live one stayed connected,
// and only the journal knew). A throwaway worktree server + headless chrome + a REAL paired daemon
// (scripts/pairing-ui-harness.mjs); a second dialer knocks with an old token over a raw upgrade request:
//   ① the server refuses it by name (401 token-mismatch) and the /api/hosts row carries `dialHealth` (the daemon's
//     platform + its stop recipe); the journal says it ONCE across three knocks; ONE For-you item (data/dial-health.json)
//   ② the Remote panel's row (zh + en) shows the line under the machine with the warning glyph and a Copy button;
//     Copy says so in a toast — the recipe is WORDS the person runs, the hub never runs it; PNG (desk)
//   CONTROL: a patched bundle without the row's paint ⇒ no line (the pre-fix row said only "connected")
//   lane mac-repair-retires-stale (B-06e9): the REAL daemon learns the hub's id at its accepted dial (dial.json `hub` = the
//   server's data/agentd/hub-id); the row names the LIVE install (device@<the host the command was minted for>) + the door,
//   and Copy copies the recipe that lists only the OTHER installs and stops the agent itself by its lock pid
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { bootWorld, CHROME, sleep, REPO, buildPatchedBundle } from './pairing-ui-harness.mjs';
import { mutantCopies } from './mutant-copy.mjs';

if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 500) : '')); } };
// a private session: chrome and the server never see the owner's runtime dir, home or display
const PRIV = { XDG_RUNTIME_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hsd-xdg-')), HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hsd-home-')) };
fs.chmodSync(PRIV.XDG_RUNTIME_DIR, 0o700);
Object.assign(process.env, PRIV); delete process.env.DISPLAY; delete process.env.WAYLAND_DISPLAY; delete process.env.DBUS_SESSION_BUS_ADDRESS;
process.on('exit', () => { for (const d of Object.values(PRIV)) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } });
const SHOT = process.env.HSD_SHOT || '';

const W = await bootWorld('hsd');
// the second dialer: the device's name + a token that is not the current one (a generation-1 leftover)
const knock = (deviceId, token) => new Promise((resolve) => {
  const u = new URL(W.BASE);
  const req = http.request({ host: u.hostname, port: u.port, path: `/api/device-dial?device=${encodeURIComponent(deviceId)}`, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'x-vibespace-dial-token': token } });
  req.on('response', (res) => { res.resume(); resolve({ status: res.statusCode, code: res.headers['x-vibespace-dial-refusal'] || null }); });
  req.on('upgrade', (res, sock) => { sock.destroy(); resolve({ status: 101 }); });
  req.on('error', (e) => resolve({ status: 0, error: e.message }));
  req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
  req.end();
});
const ROW = (id) => `[...document.querySelectorAll('.mounts-row')].find((x) => x._hostId === ${JSON.stringify(id)})`;
const openRemote = async (P) => { await P.evalJs(`(() => { const s = app.sidebar; s.toggle?.(true); if (s._railEl) { if (s._activeTab !== 'mounts') s._railGo('mounts'); else s._render(); } else { s._activeTab = 'mounts'; s._updateTabs?.(); s._render(); } return true; })()`); return P.waitFor(`!!document.querySelector('.mounts-panel') && !!document.querySelector('.mounts-panel').offsetParent`, 15000); };
let code = 1;
try {
  console.log('── ① the server: a refusal while the device is in');
  const paired = await W.pairDevice('oldmac');
  let live = null;
  for (let i = 0; i < 120 && !live; i++) { const h = await W.hostRow('oldmac'); if (h && h.online && h.dial && h.dial.lastAccept) live = h; else await sleep(250); }
  ok(!!live, 'the REAL daemon dialed in (online, lastAccept)', live && live.dial);
  const HID = live.id;
  const hubId = await (async () => { for (let i = 0; i < 40; i++) { try { const h = fs.readFileSync(path.join(W.wt, 'data', 'agentd', 'hub-id'), 'utf8').trim(); const d = JSON.parse(fs.readFileSync(path.join(paired.root, 'state', 'dial.json'), 'utf8')); if (h && d.hub === h) return h; } catch { } await sleep(250); } return null; })();
  ok(/^vh-[0-9a-f]{16}$/.test(hubId || ''), 'lane mac-repair-retires-stale: the REAL daemon learned the hub at its accepted dial — its dial.json `hub` is the server\'s data/agentd/hub-id', hubId);
  const k = [];
  for (let i = 0; i < 3; i++) { k.push(await knock('oldmac', 'vsdt_' + 'a'.repeat(43))); await sleep(400); }
  ok(k.every((r) => r.status === 401 && r.code === 'token-mismatch'), 'three knocks with an old token ⇒ 401 token-mismatch each', k);
  let row = null;
  for (let i = 0; i < 40 && !row; i++) { const h = await W.hostRow('oldmac'); if (h && h.dialHealth) row = h; else await sleep(250); }
  ok(row && row.online && row.dialHealth.kind === 'second-dialer-stale-token' && row.dialHealth.every === 30 && row.dialHealth.platform === process.platform && typeof row.dialHealth.recipe === 'string', 'the /api/hosts row carries dialHealth (second dialer, every 30 s, the daemon\'s platform + recipe) while the device stays online', row && row.dialHealth);
  ok(row && row.dialHealth.live === 'device@127.0.0.1' && row.dialHealth.recipe.split('\n')[0].endsWith("| grep -vxF 'device@127.0.0.1'") && row.dialHealth.recipe.endsWith('kill $(cat ~/.vibespace/device@<x>/state/agentd.lock)'), 'lane mac-repair-retires-stale: the row names the LIVE install (device@<the host the command was minted for>); its recipe lists only the others and stops the agent itself by its lock pid', row && row.dialHealth);
  const log = W.serverLog.join('');
  const n2 = (log.match(/a SECOND agent with an old token/g) || []).length, nTold = (log.match(/\[dial-health\] oldmac: a second agent with an old token .* told the user/g) || []).length;
  ok(n2 === 1 && nTold === 1, `the journal: ONE refusal line across 3 knocks (${n2}), ONE "told the user" line (${nTold})`);
  const ledger = JSON.parse(fs.readFileSync(path.join(W.wt, 'data', 'dial-health.json'), 'utf8'));
  const recs = Object.values(ledger.hosts || {});
  ok(recs.length === 1 && recs[0].itemId && recs[0].machine === 'oldmac', 'ONE For-you item filed (the ledger names it)', recs);

  console.log('── ② the row (zh + en) + Copy + PNG');
  for (const lang of ['zh', 'en']) {
    const P = await W.openPage({ width: 1280, height: 820, lang, first: lang === 'zh' });
    await openRemote(P);
    const want = lang === 'zh' ? '另一个 VibeSpace agent 也在从 ' : 'Another VibeSpace agent is also dialing in from ';
    const drawn = await P.waitFor(`(${ROW(HID)}?.querySelector('.mounts-second-dialer')?.textContent || '').includes(${JSON.stringify(want)})`, 15000);
    const facts = await P.evalJs(`(() => { const l = ${ROW(HID)}?.querySelector('.mounts-second-dialer'); if (!l) return null; const b = l.querySelector('.mounts-second-dialer-copy'); const g = l.querySelector('.mounts-second-dialer-glyph svg'); const r = l.getBoundingClientRect(), rr = ${ROW(HID)}.getBoundingClientRect(); return { text: l.textContent, btn: b && b.textContent, title: b && b.title, glyph: !!g && g.getBoundingClientRect().width > 0, inRow: r.left >= rr.left - 1 && r.right <= rr.right + 1 && r.height > 0, color: getComputedStyle(l).color }; })()`);
    ok(drawn && facts && facts.glyph && facts.inRow && facts.text.includes('127.0.0.1') && /30/.test(facts.text), `${lang}: the line under the machine — glyph, the address, every 30 s, inside the row`, facts);
    const liveW = lang === 'zh' ? '那台机器上正在用的安装是 device@127.0.0.1；把其余的停掉' : 'The live install on that machine is device@127.0.0.1; stop the others';
    const doorW = lang === 'zh' ? '在这台机器的「机器」卡片上重新配对，会替你停用这个 hub 的旧安装' : 'Re-pairing this machine from its Machines card retires the older installs of this hub for you';
    ok(facts && facts.text.includes(liveW) && facts.text.includes(doorW), `${lang}: the line names the live install and the door (a re-pair retires the older installs of this hub)`, facts && facts.text);
    ok(facts && facts.btn === (lang === 'zh' ? '复制停止命令' : 'Copy the stop command') && facts.title === row.dialHealth.recipe, `${lang}: the Copy button carries the ${process.platform} recipe (WORDS, never run)`, facts && [facts.btn, facts.title]);
    await P.evalJs(`(() => { window.__copied = null; if (navigator.clipboard) navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }; return true; })()`);
    const clicked = await P.realClick(`(${ROW(HID)}.querySelector('.mounts-second-dialer-copy'))`);
    const toast = lang === 'zh' ? '已复制 — 请在那台机器上运行' : 'Copied — run it on that machine';
    ok(clicked && await P.waitFor(`document.body.innerText.includes(${JSON.stringify(toast)})`, 5000), `${lang}: Copy ⇒ the toast "${toast}"`);
    const copied = await P.evalJs('window.__copied');
    ok(copied === row.dialHealth.recipe && copied.includes("grep -vxF 'device@127.0.0.1'") && /\nkill \$\(cat ~\/\.vibespace\/device@<x>\/state\/agentd\.lock\)$/.test(copied), `${lang}: Copy COPIES the recipe naming the live install (left out of the listing) + the kill line — words, never run`, copied);
    if (lang === 'zh' && SHOT) {
      await sleep(2600); // the toast fades before the picture
      await P.evalJs(`${ROW(HID)}.scrollIntoView({ block: 'center' })`);
      const shot = await P.cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
      console.log('  · PNG ' + SHOT);
    }
    await P.cdp('Page.close').catch(() => {});
  }

  console.log('── CONTROL: the pre-fix row (a bundle without the paint)');
  const M = mutantCopies('hsd', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
  const PAINT = "        if (h.dialHealth) row.appendChild(secondDialerLine(h.dialHealth)); // lane host-stale-dialer (B-6136)\n";
  const patched = SRC.replace(PAINT, '');
  ok(patched !== SRC, 'the control patch applies');
  const bundleText = await buildPatchedBundle(M, 'src/lib/sidebar-mounts.js', patched, 'nopaint');
  const P = await W.openPage({ width: 1280, height: 820, lang: 'zh', bundleText });
  await openRemote(P);
  await P.waitFor(`!!${ROW(HID)}`, 15000); await sleep(800);
  const pre = await P.evalJs(`(() => { const r = ${ROW(HID)}; return r ? { line: !!r.querySelector('.mounts-second-dialer'), state: r.querySelector('.mounts-dial-state')?.dataset.dialState } : null; })()`);
  ok(pre && !pre.line && pre.state === 'connected', 'CONTROL: without the paint the row reads only "connected" — the second agent is nowhere on screen (② red)', pre);
  await P.cdp('Page.close').catch(() => {});
  code = fail ? 1 : 0;
} catch (e) {
  fail++; console.log('  ✗ threw: ' + (e && e.stack || e));
} finally {
  W.cleanup();
}
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : code);
