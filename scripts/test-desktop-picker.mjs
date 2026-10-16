#!/usr/bin/env node
// lane desktop-v2-entry (design q-030 D1 / §6): the Desktop picker's rows — PURE pickerRows over the machine rows, the state
// words, the recent row first (what it names must still exist; its state is today's), the stored choice's shape, the zh / ja
// words, and the wiring (the toolbar's Desktop command and the phone's row open the picker; the local desktop window stays
// the persisted singleton; a machine's window stays NOT persisted with its sign-in asked each time). The first row after a
// reload, a press, Enter and the phone's sheet run in Chrome: scripts/test-desktop-v2-chrome.mjs ①⑦⑩.
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
ok(S.rowState({ code: 'desktop_ready' }) === 'ready' && S.rowState({ code: 'no_vnc' }) === 'setup' && S.rowState({ code: 'offline' }) === 'offline' && S.rowState(null) === 'offline' && S.ROW_STATES.length === 3, 'rowState: the three words, and a missing row is offline');

const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
const KEYS = { 'VibeSpace virtual desktop': 'VibeSpace 虚拟桌面', 'Set up first': '先设置', 'Offline': '离线', 'Open its desktop → Desktop': '打开它的桌面 → 桌面', 'Full screen': '全屏', 'Connected · {ms} ms · {fps} fps': '已连接 · {ms} ms · {fps} fps' };
const has = (cat, k) => new RegExp('\\n  ' + JSON.stringify(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ': ').test(cat);
ok(Object.entries(KEYS).every(([k, v]) => zh.includes(`${JSON.stringify(k)}: ${JSON.stringify(v)}`)) && Object.keys(KEYS).every((k) => has(ja, k)), 'the picker\'s and the strip\'s words are in zh (as the design spells them) and ja');

const tf = read('src/lib/toolbar-fold.js'), mn = read('src/lib/mobile-nav.js'), dw = read('src/lib/desktop-window.js'), md = read('src/lib/machine-desktop.js');
ok(/id: 'desktop\.open', title: 'Desktop', run: \(c\) => openDesktopPicker\(c\.app, \{ anchor: c\.anchor \}\)/.test(tf) && /t\('Desktop'\), \(\) => openDesktopPicker\(app\)\)/.test(mn), 'the toolbar\'s Desktop command and the phone\'s Desktop row open the picker (not the local desktop directly)');
ok(/type: 'desktop', label: 'Desktop', singleton: true,/.test(dw) && /openSpec: \{ action: 'openDesktop' \}/.test(dw), 'the local desktop window stays the persisted singleton (its replay reopens it directly)');
ok(/registerWindowType\(\{ type: 'machine-desktop', label: 'Machine desktop', persist: false,/.test(md) && /credentials: \(types\) => askCredentials\(m, types, auth\)/.test(md) && /\.\.\.machineViewOpts\(m\),\n\s+\}\);\n\s+winInfo\._desktopView = view;\n\s+view\.connect\(\);/.test(md) /* lane stream-p1a-transport: the VNC view is made in startVnc() (first, or after the stream's fallback) */, 'a machine\'s window stays NOT persisted and its view still asks the sign-in each time (design 014 D1 unchanged)');
ok(!/t\('Open its desktop'\)/.test(md) && /t\('Open its desktop → Desktop'\), \(\) => \{ toWindow\(\); openMachineDesktop\(app, m\); \}/.test(md) && /rememberDesktop\(m\.hostId, want\); \/\/ the Desktop picker's first row/.test(md), 'the Apps dialog\'s link says the desktop lives under Desktop, still opens the window at once (inc-mv51w0ow-crw3) and makes it the picker\'s recent choice');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
