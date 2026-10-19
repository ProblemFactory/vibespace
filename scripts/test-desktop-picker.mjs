#!/usr/bin/env node
// lane desktop-v2-entry (design q-030 D1 / §6): the Desktop picker's rows — PURE pickerRows over the machine rows, the state
// words, the recent row first (what it names must still exist; its state is today's), the stored choice's shape, the zh / ja
// words, and the wiring (the toolbar's Desktop command and the phone's row open the picker; the local desktop window stays
// the persisted singleton; a machine's window is restored by its openSpec since lane desktop-display-modes, its sign-in still
// asked each time and never by itself on a replay). The first row after a
// reload, a press, Enter and the phone's sheet run in Chrome: scripts/test-desktop-v2-chrome.mjs ①⑦⑩.
// lane desktop-picker-instant: §I the rows' last known state (PURE src/desktop-machines-cache.js), §II the real access layer +
// route over fake machines — the route answers before any probe lands (CONTROL: the pre-fix route waits), each landed probe
// broadcast, the log lines, the file a restart paints from, the daemon's hello; the installed-apps open un-awaited.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const S = require(path.join(REPO, 'src/desktop-screens.js'));
let pass = 0, fail = 0;
const ok = (c, msg, detail) => { if (c) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail !== undefined ? '\n      ' + JSON.stringify(detail).slice(0, 700) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const M = (hostId, code, extra = {}) => ({ hostId, label: hostId.toUpperCase(), desktop: 'vnc-native', setup: 'win32', code, ...extra });
const machines = [{ hostId: 'local', code: 'ready' }, { hostId: 'lin', platform: 'linux', code: 'ready' }, M('win-a', 'desktop_ready'), M('mac-b', 'no_vnc', { setup: 'darwin' }), M('win-c', 'offline')];
const flat = (rows) => rows.map((r) => `${r.group}:${r.hostId}${r.display != null ? '#' + r.display : ''}=${r.state}${r.enabled ? '' : '(off)'}`).join(' ');

let rows = S.pickerRows({ local: { available: true }, machines, recent: null });
ok(flat(rows) === 'local:local=ready remote:win-a=ready remote:mac-b=setup remote:win-c=offline(off)', 'rows: 本机 then each whole-desktop machine (a Linux host is not a remote desktop row); 就绪 / 先设置 / 离线', flat(rows));
rows = S.pickerRows({ local: { available: true }, machines, recent: { hostId: 'win-a', display: 'DISPLAY2' } });
ok(flat(rows).startsWith('recent:win-a#DISPLAY2=ready local:local=ready remote:win-a=ready'), 'the recent choice is FIRST (host + display), its machine keeps its own row below', flat(rows));
ok(flat(S.pickerRows({ local: { available: true }, machines, recent: { hostId: 'gone', display: '1' } })).startsWith('local:'), 'a recent choice naming a machine that is gone: no recent row');
ok(flat(S.pickerRows({ local: { available: true }, machines, recent: { hostId: 'win-c', display: '1' } })).startsWith('recent:win-c#1=offline(off)'), 'a recent machine that is offline today: first, with today\'s word, not pressable');
ok(flat(S.pickerRows({ local: { available: true }, machines, recent: { hostId: 'local', display: '2' } })).startsWith('recent:local=ready local:'), 'the local desktop as the recent choice (no display on it)');
const wl = S.pickerRows({ local: { available: true, seat: 'wayland' }, machines: [] });
ok(wl.length === 1 && wl[0].seat === 'wayland' && S.pickerRows({ local: { available: false } })[0].enabled === false, 'a Wayland seat is carried to the local row (D4\'s words); a local desktop that is unavailable is not pressable');
ok(JSON.stringify(S.recentChoice(' win-a ', 'DISPLAY2')) === JSON.stringify({ hostId: 'win-a', display: 'DISPLAY2', at: 0 }) && S.recentChoice('', 1) === null && S.recentChoice('x', '').display === null, 'the stored choice: host + display key (empty = the whole screen), never an empty host');
ok(S.rowState({ code: 'desktop_ready' }) === 'ready' && S.rowState({ code: 'no_vnc' }) === 'setup' && S.rowState({ code: 'offline' }) === 'offline' && S.rowState(null) === 'offline' && S.ROW_STATES.join() === 'ready,setup,offline,checking', 'rowState: the three words (+ checking — lane desktop-picker-instant), and a missing row is offline');

const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
const KEYS = { 'VibeSpace virtual desktop': 'VibeSpace 虚拟桌面', 'Set up first': '先设置', 'Offline': '离线', 'Open its desktop → Desktop': '打开它的桌面 → 桌面', 'Full screen': '全屏', 'Connected · {ms} ms · {fps} fps': '已连接 · {ms} ms · {fps} fps' };
const has = (cat, k) => new RegExp('\\n  ' + JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ').test(cat);
ok(Object.entries(KEYS).every(([k, v]) => zh.includes(`${JSON.stringify(k)}: ${JSON.stringify(v)}`)) && Object.keys(KEYS).every((k) => has(ja, k)), 'the picker\'s and the strip\'s words are in zh (as the design spells them) and ja');

const tf = read('src/lib/toolbar-fold.js'), mn = read('src/lib/mobile-nav.js'), dw = read('src/lib/desktop-window.js'), md = read('src/lib/machine-desktop.js');
ok(/id: 'desktop\.open', title: 'Desktop', run: \(c\) => openDesktopPicker\(c\.app, \{ anchor: c\.anchor \}\)/.test(tf) && /t\('Desktop'\), \(\) => openDesktopPicker\(app\)\)/.test(mn), 'the toolbar\'s Desktop command and the phone\'s Desktop row open the picker (not the local desktop directly)');
ok(/type: 'desktop', label: 'Desktop', singleton: true,/.test(dw) && /openSpec: \{ action: 'openDesktop' \}/.test(dw), 'the local desktop window stays the persisted singleton (its replay reopens it directly)');
ok(/registerWindowType\(\{ type: 'machine-desktop', label: 'Machine desktop', icon: /.test(md) && /action: 'openMachineDesktop', replay: \(app, spec, \{ syncId \} = \{\}\) => replayMachineDesktop\(app, spec, \{ syncId \}\)/.test(md) && /credentials: async \(types\) => \{\n\s+const r = await fetchJson\(`\/api\/desktop\/machine-desktop\/signins\?host=\$\{encodeURIComponent\(m\.hostId\)\}`\);\n\s+const c = await askCredentials\(m, types, auth, r && !r\.error \? r\.signin : null\);/.test(md) && /\.\.\.machineViewOpts\(m\),\n\s+\}\);\n\s+winInfo\._desktopView = view;\n\s+view\.connect\(\);/.test(md) /* lane stream-p1a-transport: the VNC view is made in startVnc() (first, or after the stream's fallback) */ && /if \(syncId && !taken && !pressed\) \{ askVnc\(/.test(md) /* lane stream-fallback-never-silent: or the person's 「显示 VNC 画面」 */, 'a machine\'s window is restored by its openSpec (lane desktop-display-modes: its display mode + display are the window\'s) and its VNC view asks the sign-in (the hub\'s word on a REMEMBERED one first — lane desktop-vnc-remember: then the hub signs in, the page never holds it) — never by itself on a replay (design 014 D1: the VNC picture waits for a press)');
ok(!/t\('Open its desktop'\)/.test(md) && /t\('Open its desktop → Desktop'\), \(\) => \{ toWindow\(\); openMachineDesktop\(app, m\); \}/.test(md) && /rememberDesktop\(m\.hostId, want\); \/\/ the Desktop picker's first row/.test(md), 'the Apps dialog\'s link says the desktop lives under Desktop, still opens the window at once (inc-mv51w0ow-crw3) and makes it the picker\'s recent choice');

// ── lane desktop-picker-instant (owner 2026-10-19 「这个界面的加载时间怎么越来越长了」): THE ROWS AT ONCE ─────────────────────────
// PURE src/desktop-machines-cache.js (fresh / stale / none, the floor + coalescing, the payloads, the log lines, the file), then
// the REAL access layer + route over fake machines: a Mac whose VNC greeting takes 2.2 s, a Windows box with nothing on 5900, a
// Linux agent — the route answers before any probe lands, each landed probe is broadcast, a restart paints from the file, the
// daemon's hello re-probes; the installed-apps open answers the old list at once. CONTROL: the pre-fix route (it awaited
// machines()) behind the same fake. The picker drawn at once + a late probe patching one row with the focus kept: Chrome,
// scripts/test-desktop-v2-chrome.mjs ⑯.
console.log('§I the machine rows answer at once (PURE)');
const MC = require(path.join(REPO, 'src/desktop-machines-cache.js'));
const J = (v) => JSON.stringify(v);
{
  const now = 1_000_000;
  const e = (age, row = { code: 'desktop_ready', link: 'online' }) => ({ row, at: now - age, ms: 40 });
  ok(MC.freshness(null, now) === 'none' && MC.freshness(e(1000), now) === 'fresh' && MC.freshness(e(MC.STALE_MS + 1), now) === 'stale' && MC.STALE_MS === 60000, 'freshness: none (never probed) · fresh · stale past 60 s');
  ok(MC.refreshDue(null, { now }) && !MC.refreshDue(null, { now, inFlight: true }) && !MC.refreshDue(e(1000), { now, inFlight: true, force: true }), 'coalescing: no history ⇒ probe; a probe in flight is JOINED (never a second, forced or not)');
  ok(!MC.refreshDue(e(1000), { now }) && MC.refreshDue(e(MC.REFRESH_FLOOR_MS), { now }) && MC.refreshDue(e(1000), { now, force: true }), 'the floor: an open 1 s after the last probe asks nothing; 10 s after, or Check again (force), probes');
  ok(MC.refreshDue(e(1000), { now, linkNow: 'offline' }) && !MC.refreshDue(e(1000), { now, linkNow: 'online' }) && !MC.refreshDue(e(1000), { now, linkNow: 'unknown' }), 'a link that dropped since the probe is due at once (no floor); the same link or no evidence (unknown) is not');
  const ck = MC.checkingRow({ hostId: 'mac', label: 'Mac', transport: 'dial', link: 'online', connected: true, platform: 'darwin' });
  const ckLin = MC.checkingRow({ hostId: 'b', label: 'B', transport: 'ssh', link: 'unknown' });
  ok(ck.code === 'checking' && ck.selectable === false && ck.desktop === 'vnc-native' && ck.setup === 'darwin' && ck.probedAt === null && ck.stale === true && !('desktop' in ckLin) && ckLin.platform === null, 'a machine never probed: code checking, never pressable; a handle that said darwin makes it a desktop row already; an unknown one is none', [ck, ckLin]);
  const known = new Map([['mac', e(5000, { hostId: 'mac', label: 'old name', code: 'desktop_ready', link: 'online', desktop: 'vnc-native' })], ['gone', e(10)]]);
  const rows = MC.answerRows([{ hostId: 'mac', label: 'Mac Studio' }, { hostId: 'new', label: 'New', transport: 'dial', link: 'offline' }], known, now);
  ok(J(rows.map((r) => [r.hostId, r.code, r.label, r.stale])) === J([['mac', 'desktop_ready', 'Mac Studio', false], ['new', 'checking', 'New', true]]) && rows[0].probedAt === now - 5000 && rows[0].ageMs === 5000 && rows[0].probeMs === 40, 'answerRows: the last probe with the record\'s label NOW (+ probedAt, ageMs, probeMs); a new machine checking; a machine no longer paired never answered', rows);
  ok(MC.answerRows([{ hostId: 'mac', label: 'Mac' }], new Map([['mac', e(MC.STALE_MS + 5)]]), now)[0].stale === true, 'an entry older than 60 s is answered stale: true');
  const pl = MC.machinesPayload([{ hostId: 'local' }, rows[0]], 'mac');
  ok(J(Object.keys(pl)) === J(['type', 'hostId', 'machines']) && pl.type === 'desktop-machines-updated' && pl.hostId === 'mac' && pl.machines.length === 2, 'the broadcast: desktop-machines-updated {hostId (whose probe landed), machines (every row)}');
  ok(J(MC.installedPayload('win', { rows: [1, 2], listedAt: 7, total: 2 })) === J({ type: 'desktop-installed-updated', hostId: 'win', listedAt: 7, total: 2, code: null }), 'the installed list\'s notice carries no rows (hundreds of them) — who, when, how many, the code');
  ok(MC.probeLine('mac', 2213.4, 'desktop_ready', 'picker') === '[desktop] mac probed in 2213 ms → desktop_ready (picker)', 'the log line: [desktop] <host> probed in <ms> ms → <code> (<why>)');
  ok(MC.slowLine('mac', 2000, { greeting: 1990 }) === null && MC.slowLine('mac', 5012, { dial: 3, forward: 9, greeting: 5000 }) === '[desktop] mac probe slow: 5012 ms — the greeting took 5000 ms (dial 3 ms · forward 9 ms · greeting 5000 ms)' && /the dial took 3001 ms/.test(MC.slowLine('w', 3010, { dial: 3001, forward: 9 })), 'a probe over 2 s: ONE more line naming the slowest step (dial / forward / greeting); 2 s or less: none');
  const file = MC.toFile(new Map([['mac', e(5)], ['gone', e(5)], ['bad', { row: null, at: 1 }]]), new Set(['mac', 'bad']));
  ok(J(Object.keys(file.rows)) === J(['mac']) && file.version === 1, 'the file keeps the machines still paired, never a malformed entry', file);
  const back = MC.fromFile({ version: 1, rows: { mac: { row: { code: 'desktop_ready', hostId: 'evil' }, at: 5, ms: 3 }, local: { row: { code: 'ready' }, at: 5 }, x: { row: { code: 7 }, at: 5 }, y: { row: { code: 'ready' } } } });
  ok(back.size === 1 && back.get('mac').row.hostId === 'mac' && MC.fromFile({ version: 2, rows: {} }).size === 0 && MC.fromFile(null).size === 0, 'the file read back: the key names the machine; this machine\'s row, a code that is no string, an entry with no time, another version: dropped');
  ok(MC.probeAge({ ageMs: 12400, probeMs: 2213 }).s === 12 && MC.probeAge({ probedAt: null }) === null, 'the page\'s 技术细节: seconds by the hub\'s own clock (ageMs — never the browser\'s), the probe\'s ms');
  ok(S.rowState({ code: 'checking' }) === 'checking' && S.ROW_STATES.includes('checking') && J(S.pickerRows({ local: { available: true }, machines: [{ hostId: 'w', code: 'checking', desktop: 'vnc-native' }] }).map((r) => [r.state, r.enabled])) === J([['ready', true], ['checking', false]]), 'the picker: a checking machine is its own row, 检查中…, not pressable');
  ok(['"Checked {n} s ago": "上次检查 {n} 秒前"', '"Checked {n} min ago": "上次检查 {n} 分钟前"', '"probe {ms} ms": "探测 {ms} ms"', '"Checking…": "检查中…"'].every((l) => zh.includes(l)) && ['Checked {n} s ago', 'Checked {n} min ago', 'probe {ms} ms'].every((k) => has(ja, k)), 'the 技术细节 words: 上次检查 N 秒前 · 探测 M ms (zh as the brief spells it; ja too)');
}

console.log('§II the real access layer + route over fake machines');
{
  const { scratchDir } = await import('./scratch.mjs');
  const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
  const R = require(path.join(REPO, 'src/routes/desktop-apps.js'));
  const express = require(path.join(REPO, 'node_modules/express'));
  const dir = scratchDir('dpick');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // a machine's agent: its platform, and its VNC port answering after `greetMs` (null = nothing listens there)
  const fakeDm = (platform, st) => ({
    status: () => ({ connected: true, info: { platform, capabilities: ['desktop-serve'] } }),
    desktopServe() { },
    async tcpForward() {
      st.forwards++;
      if (st.greetMs == null) throw new Error('ECONNREFUSED');
      const h = { onData: null, onClose: null, write() { }, close() { h.closed = true; } };
      st.greeted = false;
      setTimeout(() => { st.greeted = true; if (!h.closed && h.onData) h.onData(Buffer.concat([Buffer.from('RFB 003.008\n'), Buffer.from([1, 2])])); }, st.greetMs);
      return h;
    },
  });
  const st = { mac: { greetMs: 2200, forwards: 0 }, win: { greetMs: null, forwards: 0 } };
  const dms = { mac: fakeDm('darwin', st.mac), win: fakeDm('win32', st.win), lin: { status: () => ({ connected: true, info: { platform: 'linux', capabilities: ['desktop-serve'] } }) } };
  const hooks = [];
  // `connected: false` = a hub that just restarted: no machine has dialed in yet
  const hostsOf = ({ connected = true } = {}) => {
    const LIST = [{ id: 'mac', name: 'Mac', transport: 'dial', online: connected }, { id: 'win', name: 'Win', transport: 'dial', online: connected }, { id: 'lin', name: 'Lin', transport: 'ssh' }];
    return {
      list: () => LIST, linkState: (id) => (id === 'lin' ? (connected ? 'online' : 'unknown') : connected ? 'online' : 'offline'),
      connectedDevice: (id) => (connected ? dms[id] || null : null), get: (id) => LIST.find((h) => h.id === id) || null, isLocal: (id) => !id || id === 'local',
      deviceBounded: async (id) => (connected ? dms[id] : null), addDialInHook: (fn) => { hooks.push(fn); return () => { }; },
    };
  };
  const lines = [], sent = [];
  const log = { log: (l) => lines.push(['log', String(l)]), warn: (l) => lines.push(['warn', String(l)]) };
  const access = ACC.create({ hosts: hostsOf(), install: false, log, vncPort: 5900, probeMs: 3000, dataDir: dir, broadcast: (m) => sent.push(m), helloListMs: 10 });
  const app = express(); app.use(express.json()); app.use(R.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/desktop/machines`;
  const get = async (q = '') => { const t0 = performance.now(); const j = await (await fetch(base + q)).json(); return { ms: Math.round((performance.now() - t0) * 10) / 10, j, by: Object.fromEntries(((j && j.machines) || []).map((m) => [m.hostId, m])) }; };
  const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(10); } return false; };

  // CONTROL: the pre-fix route — it awaited machines() (every probe) — over the same fake; the Mac's greeting held 400 ms here
  st.mac.greetMs = 400;
  const ctlAccess = ACC.create({ hosts: hostsOf(), install: false, log: { log() { }, warn() { } }, vncPort: 5900, probeMs: 3000 });
  R.setup({ access: { ...ctlAccess, machinesNow: undefined }, vnc: {} });
  const c0 = await get();
  ok(c0.ms >= 380 && c0.by.mac.code === 'desktop_ready', `CONTROL: the pre-fix route (it awaited every machine's probe) answers in ${c0.ms} ms — it waited for the Mac's 400 ms greeting`, c0.ms);
  st.mac.greetMs = 2200; st.mac.forwards = 0; st.win.forwards = 0;

  R.setup({ access, vnc: {} });
  const a1 = await get();
  ok(st.mac.forwards === 1 && st.mac.greeted === false && a1.by.local.code === 'ready' && ['mac', 'win', 'lin'].every((h) => a1.by[h].code === 'checking' && a1.by[h].selectable === false) && a1.by.mac.desktop === 'vnc-native' && J([...a1.j.refreshing].sort()) === J(['lin', 'mac', 'win']), `the route answers (${a1.ms} ms) BEFORE the Mac's 2.2 s greeting went out — it never waits for a probe: this machine ready, every machine never probed 检查中… (that row only), each refresh kicked`, a1.j);
  await until(() => sent.length >= 2);
  const a2 = await get();
  ok(st.mac.greeted === false && a2.by.win.code === 'no_vnc' && a2.by.win.stale === false && a2.by.lin.code === 'ready' && a2.by.mac.code === 'checking' && J(a2.j.refreshing) === J(['mac']) && st.mac.forwards === 1, `a second open (${a2.ms} ms, the Mac's greeting still not sent): the landed rows (Windows: no VNC; Linux: ready), the Mac still checking — and its probe JOINED (1 forward, not 2)`, [a2.j.refreshing, st.mac.forwards]);
  const a3 = await get('?wait=1');
  ok(a3.ms >= 1500 && a3.by.mac.code === 'desktop_ready' && a3.by.mac.probeMs >= 2190 && a3.by.mac.stale === false && a3.by.mac.ageMs < 1000 && J(a3.j.refreshing) === J([]) && st.mac.forwards === 1, `?wait=1 (the page's follow-up) lands the Mac's row after ${a3.ms} ms — the probe in flight joined, never a second`, a3.by.mac);
  await until(() => sent.length >= 3);
  ok(sent.length === 3 && sent.every((m) => m.type === 'desktop-machines-updated' && m.machines[0].hostId === 'local' && m.machines.length === 4) && J(sent.map((m) => m.hostId).sort()) === J(['lin', 'mac', 'win']) && sent.find((m) => m.hostId === 'mac').machines.find((m) => m.hostId === 'mac').code === 'desktop_ready', 'each landed probe is BROADCAST once: desktop-machines-updated {hostId, every row} — the Mac\'s carries its desktop_ready row', sent.map((m) => m.hostId));
  const probeLines = lines.filter(([k, l]) => k === 'log' && /^\[desktop\] \w+ probed in \d+ ms → /.test(l)).map(([, l]) => l);
  const slow = lines.filter(([k]) => k === 'warn').map(([, l]) => l);
  ok(probeLines.length === 3 && probeLines.some((l) => /^\[desktop\] mac probed in (22|23|24|25)\d\d ms → desktop_ready \(picker\)$/.test(l)) && probeLines.some((l) => /^\[desktop\] win probed in \d+ ms → no_vnc \(picker\)$/.test(l)) && probeLines.some((l) => /^\[desktop\] lin probed in \d+ ms → ready \(picker\)$/.test(l)), 'ONE log line per probe: [desktop] <host> probed in <ms> ms → <code> (picker)', probeLines);
  ok(slow.length === 1 && /^\[desktop\] mac probe slow: \d+ ms — the greeting took \d+ ms \(dial \d+ ms · forward \d+ ms · greeting \d+ ms\)$/.test(slow[0]), 'the probe over 2 s: ONE warn line naming the slow step (the greeting) with every step timed', slow);
  const a4 = await get();
  ok(J(a4.j.refreshing) === J([]) && st.mac.forwards === 1 && st.win.forwards === 1, `an open within the 10 s floor asks no machine (${a4.ms} ms, nothing refreshing)`);
  const a5 = await get('?fresh=1&host=win');
  ok(a5.by.win.code === 'no_vnc' && st.win.forwards === 2 && st.mac.forwards === 1 && lines.some(([, l]) => /^\[desktop\] win probed in \d+ ms → no_vnc \(recheck\)$/.test(l)), 'Check again (?fresh=1&host=win) probes THAT machine now and waits — the others are not asked');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'desktop-machines.json'), 'utf8'));
  ok(saved.version === 1 && J(Object.keys(saved.rows).sort()) === J(['lin', 'mac', 'win']) && saved.rows.mac.row.code === 'desktop_ready' && saved.rows.mac.ms >= 2190, 'data/desktop-machines.json keeps each machine\'s last probe (writeJsonAtomic)', Object.keys(saved.rows));
  // the daemon's hello: the machine's row is probed again once its link answers — an open picker hears it
  st.mac.greetMs = 5; const n0 = sent.length;
  for (const h of hooks) h('mac');
  ok(await until(() => sent.length > n0) && sent[sent.length - 1].hostId === 'mac' && lines.some(([, l]) => /^\[desktop\] mac probed in \d+ ms → desktop_ready \(hello\)$/.test(l)), 'the daemon\'s hello re-probes that machine (why: hello) and broadcasts its row');

  // a RESTART paints from the file: no machine dialed in yet, the file 2 min old
  const aged = JSON.parse(fs.readFileSync(path.join(dir, 'desktop-machines.json'), 'utf8'));
  for (const r of Object.values(aged.rows)) r.at -= 120000;
  fs.writeFileSync(path.join(dir, 'desktop-machines.json'), JSON.stringify(aged));
  const sent2 = [];
  const access2 = ACC.create({ hosts: hostsOf({ connected: false }), install: false, log: { log() { }, warn() { } }, vncPort: 5900, probeMs: 3000, dataDir: dir, broadcast: (m) => sent2.push(m), helloListMs: 10 });
  R.setup({ access: access2, vnc: {} });
  const b1 = await get();
  ok(b1.by.mac.code === 'desktop_ready' && b1.by.mac.stale === true && b1.by.mac.ageMs >= 120000 && b1.by.win.code === 'no_vnc' && b1.by.lin.code === 'ready' && b1.j.refreshing.length === 3, `a restart paints from the file (${b1.ms} ms, every refresh still in flight): each machine's last row, stale (2 min old)`, b1.by.mac);
  await until(() => sent2.length >= 3, 3000);
  const b2 = await get();
  ok(b2.by.mac.code === 'offline' && b2.by.win.code === 'offline' && b2.by.lin.code === 'connect' && b2.by.mac.stale === false && sent2.length === 3, 'the refreshes land (not dialed in yet ⇒ offline; the ssh machine: connects when chosen), each broadcast — a stale row is never the last word', [b2.by.mac.code, b2.by.lin.code]);

  // the machine dialog's installed apps: an OPEN never waits for the machine to list (391–446 apps took 5–20 s on the owner's box)
  let release = null; let listed = 0; let listedDone = false;
  dms.win.desktopAppsList = async () => { listed++; listedDone = false; await new Promise((r) => { release = r; }); listedDone = true; return { ok: true, rows: [{ name: 'JASP', launch: 'start "" "C:\\Program Files\\JASP\\JASP.exe"', source: 'start-menu' }], total: 1, truncated: false }; };
  const old = { platform: 'win32', rows: [{ name: '7-Zip', launch: 'start "" "C:\\Program Files\\7-Zip\\7zFM.exe"', source: 'uninstall', seenAt: 1 }], total: 1, truncated: false, listedAt: Date.now() - 11 * 60 * 1000 };
  const store = { e: old, installedOf() { return this.e; }, noteInstalled(h, e) { this.e = e; } };
  const sent3 = [];
  const access3 = ACC.create({ hosts: hostsOf(), install: false, log: { log() { }, warn() { } }, installedStore: () => store, broadcast: (m) => sent3.push(m), helloListMs: 3600e3 });
  R.setup({ access: access3, vnc: {} });
  const ib = `http://127.0.0.1:${srv.address().port}/api/desktop/machine-desktop/apps?host=win`;
  const t0 = performance.now(); const i1 = await (await fetch(ib)).json(); const i1ms = Math.round(performance.now() - t0);
  ok(listedDone === false && i1.listing === true && i1.rows.length === 1 && i1.rows[0].name === '7-Zip' && listed === 1, `an open on a list older than 10 min answers the list the machine gave last (${i1ms} ms) while the machine is STILL listing (listing: true)`, i1);
  const waitP = fetch(ib + '&wait=1').then((r) => r.json());
  await sleep(50); release();
  const i2 = await waitP;
  ok(i2.rows.length === 1 && i2.rows[0].name === 'JASP' && !i2.listing && listed === 1 && sent3.length === 1 && sent3[0].type === 'desktop-installed-updated' && sent3[0].hostId === 'win' && sent3[0].listedAt === i2.listedAt, 'the follow-up (&wait=1) joins the listing in flight (ONE listing) and the landed list is announced (desktop-installed-updated, no rows in it)', [i2, sent3]);
  const ctl = await new Promise((resolve) => { // CONTROL: the pre-fix call shape (no `wait: false`) waits for the machine
    store.e = { ...store.e, listedAt: Date.now() - 11 * 60 * 1000 };
    const t1 = performance.now(); access3.installedApps('win', { why: 'open' }).then((a) => resolve({ ms: performance.now() - t1, a }));
    setTimeout(() => release(), 300);
  });
  ok(ctl.ms >= 280 && ctl.a.rows[0].name === 'JASP', `CONTROL: the open as it was asked before (it waited for the listing) took ${Math.round(ctl.ms)} ms`);
  srv.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
