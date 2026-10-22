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
//   ③ lane device-node-version (the Node.js security releases of 2026-10-21): the Machines card says which Node each
//   machine's agent runs — three REAL paired devices: one on its install's OWN node (<root>/node/bin/node) at v22.22.0,
//   one on a node the machine had at v24.12.0, one that never dialed in. The version is the FIXTURE's (a --require
//   preload pins process.version, so the leg reads the same on any box; the hello's real value is test-agentd-session's).
//   The /api/hosts rows carry `runtime`; the card (zh + en) draws the line, 「运行时过旧」 on the two below their floor
//   (its title = the advisory's date + ids), «unknown» and no chip on the third; the open card's recipe — the own node:
//   the 「重新安装…」 door opens THAT device's pairing sheet; the system node: its platform's upgrade line.
//   CONTROL: a bundle without the line's paint ⇒ no runtime line on the card
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { bootWorld, CHROME, sleep, REPO, buildPatchedBundle } from './pairing-ui-harness.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const DR = createRequire(import.meta.url)('../src/device-runtime.js');

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

  console.log('── ③ the Machines card: which Node each agent runs + 「运行时过旧」 (lane device-node-version)');
  const PRE = path.join(W.devDir, 'fake-node-version.cjs');
  fs.writeFileSync(PRE, "Object.defineProperty(process, 'version', { value: process.env.VS_FAKE_NODE_VERSION, configurable: true, enumerable: true });\n");
  const startOn = (p, nodeBin, version) => {
    const d = spawn(nodeBin, [W.bundle, '--dial', p.dialUrl, '--dial-token', p.dialToken], { detached: true, stdio: 'ignore', env: { ...process.env, HOME: W.home, VIBESPACE_AGENTD_ROOT: p.root, VIBESPACE_DEVICE_ROOT: p.root, NODE_OPTIONS: `--require ${PRE}`, VS_FAKE_NODE_VERSION: version } });
    d.unref(); return d.pid;
  };
  const own = await W.pairDevice('ownmac', { start: false });
  fs.mkdirSync(path.join(own.root, 'node', 'bin'), { recursive: true });
  const ownNode = path.join(own.root, 'node', 'bin', 'node');
  fs.copyFileSync(fs.realpathSync(process.execPath), ownNode); fs.chmodSync(ownNode, 0o755);
  startOn(own, ownNode, 'v22.22.0');
  const sys = await W.pairDevice('nodemac', { start: false });
  startOn(sys, process.execPath, 'v24.12.0');
  await W.pairDevice('newmac', { start: false });   // paired, never dialed in: its agent never said
  const rows = {};
  for (let i = 0; i < 120 && !(rows.own && rows.sys); i++) {
    const o = await W.hostRow('ownmac'), s = await W.hostRow('nodemac');
    if (o && o.runtime && o.runtime.node) rows.own = o; if (s && s.runtime && s.runtime.node) rows.sys = s;
    if (!(rows.own && rows.sys)) await sleep(250);
  }
  rows.newm = await W.hostRow('newmac');
  const line = DR.upgradeLineOf(process.platform);
  ok(rows.own && rows.own.runtime.state === 'old' && rows.own.runtime.fix === 'reinstall' && rows.own.runtime.own === true && rows.own.runtime.node === 'v22.22.0' && rows.own.runtime.openssl === process.versions.openssl && rows.own.runtime.floor === '22.23.4',
    '③ the /api/hosts row of the device on its OWN node: runtime old · reinstall (v22.22.0 < 22.23.4, own = true, its OpenSSL)', rows.own && rows.own.runtime);
  ok(rows.sys && rows.sys.runtime.state === 'old' && rows.sys.runtime.fix === 'system' && rows.sys.runtime.own === false && rows.sys.runtime.line === line && rows.sys.runtime.floor === '24.22.1',
    `③ …the device on a node the machine had: old · system, its platform's upgrade line (${line})`, rows.sys && rows.sys.runtime);
  ok(rows.newm && rows.newm.runtime && rows.newm.runtime.state === 'unknown', '③ …the device that never dialed in: unknown', rows.newm && rows.newm.runtime);
  const ACC = (id) => `[...document.querySelectorAll('.agents-mach-acc')].find((d) => d.dataset.host === ${JSON.stringify(id)})`;
  const openMachines = async (P) => P.evalJs(`(() => { localStorage.setItem('vibespace.agentsTab', 'machines'); app._showAgentsDialog({ forceModal: true }); return true; })()`);
  const cardOf = (P, id) => P.evalJs(`(() => { const d = ${ACC(id)}; if (!d) return null; const l = d.querySelector('.agents-mach-runtime'); const c = l && l.querySelector('.agents-mach-runtime-old'); const f = d.querySelector('.agents-mach-runtime-fix'); return { text: l ? l.textContent : null, state: l ? l.dataset.runtime : null, chip: c ? c.textContent : null, tip: c ? c.title : null, fix: f ? f.querySelector('span').textContent : null, line: f && f.querySelector('.agents-mach-runtime-line') ? f.querySelector('.agents-mach-runtime-line').textContent : null, door: f && f.querySelector('.agents-mach-reinstall') ? f.querySelector('.agents-mach-reinstall').textContent : null }; })()`);
  for (const lang of ['zh', 'en']) {
    const P = await W.openPage({ width: 1280, height: 860, lang });
    await openMachines(P);
    await P.waitFor(`['host-dial-ownmac', 'host-dial-nodemac', 'host-dial-newmac'].every((id) => !![...document.querySelectorAll('.agents-mach-acc')].find((d) => d.dataset.host === id)?.querySelector('.agents-mach-runtime'))`, 15000);
    const o = await cardOf(P, 'host-dial-ownmac'), s = await cardOf(P, 'host-dial-nodemac'), n = await cardOf(P, 'host-dial-newmac');
    const CHIP = lang === 'zh' ? '运行时过旧' : 'Runtime too old';
    ok(o && o.text === `Node v22.22.0 · OpenSSL ${process.versions.openssl} ${CHIP}` && o.chip === CHIP && s && s.chip === CHIP && s.text.startsWith('Node v24.12.0 · OpenSSL '),
      `${lang}: the card's line says which Node each agent runs, 「${CHIP}」 on the two below their floor`, { o, s });
    ok(o && o.tip.includes('2026-10-21') && o.tip.includes('CVE-2026-111497') && o.tip.includes('22.23.4') && s.tip.includes('24.22.1'), `${lang}: the chip's title names the floor, the advisory's date and its ids`, o && o.tip);
    ok(n && n.text === (lang === 'zh' ? 'Node：未知' : 'Node: unknown') && n.chip === null && n.fix === null && n.state === 'unknown', `${lang}: the device whose agent never said reads «${lang === 'zh' ? 'Node：未知' : 'Node: unknown'}» — no chip, no recipe`, n);
    const OWNW = lang === 'zh' ? '它的 agent 运行的是安装器自带的 Node：在那台机器上再运行一次配对命令' : 'Its agent runs the Node its installer provisioned: run the pairing command again on the machine';
    const SYSW = lang === 'zh' ? '它的 agent 运行的是这台机器原有的 Node，安装器从不替换它：请在那台机器上把它升级到 24.22.1 或更新' : 'Its agent runs a Node this machine already had, which the installer never replaces: upgrade it to 24.22.1 or newer on the machine';
    const DOOR = lang === 'zh' ? '重新安装…' : 'Install again…';
    ok(o && o.fix.includes(OWNW) && o.door === DOOR && o.line === null, `${lang}: the own node's recipe — run the pairing command again (the installer replaces it), the 「${DOOR}」 door`, o && o.fix);
    ok(s && s.fix.includes(SYSW) && s.line === line && s.door === DOOR, `${lang}: the system node's recipe — upgrade it (its line), then the pairing command`, s && [s.fix, s.line]);
    if (lang === 'zh') {
      await P.evalJs(`(() => { const d = ${ACC('host-dial-ownmac')}; d.open = true; d.scrollIntoView({ block: 'center' }); return true; })()`);
      await sleep(300);
      if (SHOT) {   // the open card (its line, the chip, the recipe and the door) before the door is pressed
        const shot = await P.cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(SHOT.replace(/\.png$/, '') + '-runtime.png', Buffer.from(shot.data, 'base64'));
        console.log('  · PNG ' + SHOT.replace(/\.png$/, '') + '-runtime.png');
      }
      const clicked = await P.realClick(`(${ACC('host-dial-ownmac')}.querySelector('.agents-mach-reinstall'))`);
      const sheet = clicked && await P.waitFor(`(() => { const d = document.getElementById('device-pair-dialog'); return !!d && d.textContent.includes('ownmac'); })()`, 8000);
      ok(sheet, '③ 「重新安装…」 opens THAT device\'s pairing sheet (its command, run again on the machine, is the re-install)', await P.evalJs(`document.getElementById('device-pair-dialog')?.textContent.slice(0, 160) || null`));
    }
    await P.cdp('Page.close').catch(() => {});
  }
  {
    const M3 = mutantCopies('hsdrt', REPO);
    const MSRC = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
    const RPAINT = '          sum.appendChild(rtl.el);\n';
    const mp = MSRC.replace(RPAINT, '');
    ok(mp !== MSRC, '③ the control patch applies');
    const P = await W.openPage({ width: 1280, height: 860, lang: 'zh', bundleText: await buildPatchedBundle(M3, 'src/lib/manage-agents.js', mp, 'nort') });
    await openMachines(P);
    await P.waitFor(`!!${ACC('host-dial-ownmac')}`, 15000); await sleep(800);
    const pre = await cardOf(P, 'host-dial-ownmac');
    ok(pre && pre.text === null && pre.chip === null, 'CONTROL ③: without the paint the card says nothing of its Node — the old runtime is nowhere on screen', pre);
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
