#!/usr/bin/env node
// test-pair-dialog-ui — lane-pairing ①②③ in a REAL page (B-7007; the owner's MacBook 2026-09-27: the pairing
// dialog offered ONE address the Mac could not reach, every re-open of the row's Re-pair minted a new token so the
// daemon kept dialing with a stale one, and the row said only "offline" while the server journal said "token
// mismatch"). A throwaway worktree server + headless chrome (scripts/pairing-ui-harness.mjs) + a REAL daemon:
//   ① open "Pair a device" ⇒ ZERO POST /api/device/dial-pair (the page's own request log); the address rows are the
//      scratch server's own (the browser's origin first, then this machine's interfaces / hostname); the Custom…
//      field's live verdict (a path refused in place, a good address shows its dial URL)
//   ② Create pairing ⇒ ONE POST carrying the CHOSEN base, and BOTH command URLs on that base; re-open the row's
//      sheet ⇒ no POST, its head says `never`; Generate a new command ⇒ ONE POST, generation 2, the "previous command
//      stops working" sentence (attack 16: ten re-opens, zero mints)
//   ③ a daemon dialing with the RETIRED token (generation 1) ⇒ the row reads 最近一次拨号：被拒绝（令牌不匹配）… and the
//      Machines card the same (attack 17); the English page says it in English
//   · verify-r5 A2: the dialog says what the typed name becomes ("办公室uimac" ⇒ "uimac", "我的电脑" ⇒ a random name)
//   · verify-r5 A3: "UIMAC" beside the paired "uimac" — said before Create, 409 name_case_taken, nothing minted
//   · verify-r5 A1: two windows pairing one new name — window 2 (its list held stale) is refused 409 already_paired
//     (nothing minted, the device's connected wording), replaces knowingly, and window 1's command says it no longer works
//   · verify-r6 P3: a press right after the 1 s tick flipped the button to "Replace its pairing" (another window paired the
//     name) is sent as expect=new and refused 409 — the tick never turns a press into a replace
//   · verify-r6 P1: the device drops after its sheet opened; "send the new command over its link" + Generate is refused
//     by name and nothing is minted (pre-fix: a plain rotation cut the device the owner chose to keep)
//   · verify-r5 C1 / verify-r6 L1: a device dialing an address VibeSpace did not offer (paired on the LAN row, dialing the
//     relay) — the sheet keeps the command's base checked and shows the stated address as the DEVICE's CLAIM, on its
//     own row, UNCHECKED, "choose it only if it is yours"
//   · verify-r4 F1: a device behind a Host-rewriting relay (frp) — the sheet checks the address the DEVICE states, the
//     in-place push keeps it there (pre-fix: http://127.0.0.1 checked, the push stranded the device)
//   · verify-r4 F6: a new pairing typed under an existing device's name says it REPLACES that pairing, before Create
//   · verify-r4 F7: from a Windows browser, a paired device's new command comes in ITS OS's form (CONTROL: the pre-fix
//     sheet's navigator.platform tab)
//   · verify-r4 F8: a device not dialed in hears what Generate does to it BEFORE the button (never-connected, offline)
//   · THE RECT CENSUS at 860 px and 360 px: the dialog inside the viewport, no horizontal overflow, address rows
//     ≥ 44 px on the phone, the command textarea inside the dialog
// Requires google-chrome (SKIP without). Run: node scripts/test-pair-dialog-ui.mjs
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { bootWorld, CHROME, sleep, rectCensusJs, labelRowCensusJs, LABEL_FIX_REVERT, swapStyleJs, REPO, buildPatchedBundle } from './pairing-ui-harness.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { createRequire } from 'node:module';
const DF = createRequire(import.meta.url)(path.join(REPO, 'src/dial-facts.js'));

if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const W = await bootWorld('pairdlg');
const mints = (P) => P.requests.filter((r) => r.method === 'POST' && /\/api\/(device|agentd)\/dial-pair$/.test(r.url));
const openRemote = async (P) => { await P.evalJs(`(() => { const s = app.sidebar; s.toggle?.(true); if (s._railEl) { if (s._activeTab !== 'mounts') s._railGo('mounts'); else s._render(); } else { s._activeTab = 'mounts'; s._updateTabs?.(); s._render(); } return true; })()`); return P.waitFor(`!!document.querySelector('.mounts-panel') && !!document.querySelector('.mounts-panel').offsetParent`, 15000); };
// the sheet opens from the CLIENT's hosts cache (app.sidebar._hostsData — set by the re-render each hosts-updated push
// starts, after its /api/hosts fetch), not from the server row a leg just read: a leg asserting a dial fact waits for
// the cached row to carry it (int216's heavy at load: the sheet opened on the pre-accept row ⇒ no keep box ⇒ a throw)
const cachedRow = (P, id, pred, ms = 15000) => P.waitFor(`(() => { const h = (app.sidebar._hostsData?.hosts || []).find((x) => x.id === ${JSON.stringify(id)}); return !!h && (${pred})(h); })()`, ms);
const rowOf = (id) => `([...document.querySelectorAll('.mounts-row')].find((r) => r._hostId === ${JSON.stringify(id)}) || null)`;

try {
  const P = await W.openPage({ width: 1280, height: 820, lang: 'zh', first: true });
  ok(await openRemote(P), 'the Remote tab renders the machines panel');
  // ── ① open the dialog: nothing minted, the server's own addresses ──
  console.log('① open "Pair a device" — nothing minted, the address choice');
  const before = mints(P).length;
  ok(await P.realClick(`([...document.querySelectorAll('.mounts-action')].find((b) => /配对设备/.test(b.textContent)) || null)`), 'a real click on 配对设备');
  ok(await P.waitFor(`document.querySelectorAll('#device-pair-dialog .dap-row').length > 1`, 10000), 'the dialog lists the addresses the server can name');
  const rows = await P.evalJs(`[...document.querySelectorAll('#device-pair-dialog .dap-row')].map((r) => ({ kind: r.dataset.kind, base: r.querySelector('.dap-base').textContent, note: r.querySelector('.dap-note').textContent, checked: r.querySelector('input').checked }))`);
  // naive-user N-loop: this page's origin is 127.0.0.1 — a LOOPBACK address only this machine reaches. It stays a row
  // (a device on this very machine may dial it) but it is last, says so, and is never the checked default
  // (pre-fix: first + checked + "你现在正在用的地址" — a device anywhere else can never dial it)
  const originRow = rows.find((r) => r.kind === 'origin');
  const lastReach = rows.findLastIndex((r) => r.kind !== 'custom' && !/^http:\/\/(127\.|localhost|\[::1\])/.test(r.base));
  ok(originRow && originRow.base === W.BASE && !originRow.checked && originRow.note === '你现在正在用的地址 — 但只有本机能访问，其他设备连不上' && rows.indexOf(originRow) > lastReach, 'N-loop: the browser\'s 127.0.0.1 origin is AFTER every reachable row, unchecked, worded "你现在正在用的地址 — 但只有本机能访问，其他设备连不上"', rows);
  const addrs = (await W.api('GET', '/api/device/dial-addresses?device=DEVICE')).j.candidates;
  const want = DF.dialDefaultChoice({ candidates: addrs });
  ok(want.kind === 'row' && rows.find((r) => r.checked)?.base === want.base && (want.why === 'first-reachable' || addrs.every((c) => c.loopback)), `N-loop: the CHECKED row is PURE dialDefaultChoice's — the first address a device elsewhere can reach (${want.base}, ${want.why})`, { want, checked: rows.find((r) => r.checked) });
  const os = await import('node:os');
  const ifaces = Object.values(os.networkInterfaces()).flat().filter((a) => a && !a.internal && (a.family === 'IPv4' || a.family === 4) && !/^169\.254\./.test(a.address)).map((a) => `http://${a.address}:${W.PORT}`);
  ok(ifaces.every((b) => rows.some((r) => r.base === b)) && rows.some((r) => r.kind === 'hostname' && r.base === `http://${os.hostname().toLowerCase()}:${W.PORT}`), `this machine's own interfaces and hostname are rows (${ifaces.length} IPv4)`, rows.map((r) => r.kind + ' ' + r.base));
  ok(!rows.some((r) => /127\.0\.0\.1/.test(r.base) && r.kind !== 'origin'), 'loopback is never an interface row');
  ok(rows.at(-1).kind === 'custom', 'the last row is 自定义…');
  // naive-user N-radio: `.dialog-body label` (0,1,1) is a COLUMN flex — every address radio sat on its OWN line above its
  // address (half-way between two rows; centred on the phone). THE LABEL CENSUS: every control beside its words.
  const lc = await P.evalJs(labelRowCensusJs('#device-pair-dialog'));
  ok(lc.ok && lc.n === rows.length, `N-radio: every address radio sits BESIDE its address, on its first line (${lc.n} labels)`, lc);
  {
    // CONTROL: a patched copy of public/style.css with the pre-fix selectors (scripts/mutant-copy.mjs's scratch dir),
    // loaded IN PLACE of /style.css — the census must see every radio above its words; then the real file again
    const real = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
    ok(LABEL_FIX_REVERT.every(([fixed]) => real.split(fixed).length === 2), 'N-radio: the fixed selectors are in public/style.css once each (the control\'s anchors)');
    const MUT = mutantCopies('pairdlg', REPO);
    const pre = LABEL_FIX_REVERT.reduce((x, [fixed, old]) => x.replace(fixed, old), real);
    const fPre = path.join(MUT.dir, `style-prefix-${process.pid}.css`); fs.writeFileSync(fPre, pre); MUT.files.push(fPre);
    await P.evalJs(swapStyleJs(fs.readFileSync(fPre, 'utf8')));
    await sleep(200);
    const lcPre = await P.evalJs(labelRowCensusJs('#device-pair-dialog'));
    ok(!lcPre.ok && lcPre.bad.length === lcPre.n && lcPre.n === rows.length, `CONTROL (N-radio): the pre-fix style.css stacks every radio above its address — the census sees ${lcPre.bad.length} of ${lcPre.n}`, lcPre);
    await P.evalJs(swapStyleJs(real));
    await sleep(200);
    ok((await P.evalJs(labelRowCensusJs('#device-pair-dialog'))).ok, '…and the real style.css puts them back beside their words');
  }
  ok(mints(P).length === before, 'OPENING THE DIALOG MINTED NOTHING (no POST /api/device/dial-pair in the page\'s request log)', mints(P));
  await P.realClick(`#device-pair-dialog .dap-custom`);
  await P.type('http://mac.lan/api');
  const bad = await P.evalJs(`(() => { const v = document.querySelector('#device-pair-dialog .dap-verdict'); return { text: v.textContent, bad: v.classList.contains('dap-bad') }; })()`);
  ok(bad.bad && bad.text === '只要地址 — 不带路径或参数', 'the Custom field refuses a path IN PLACE, worded', bad);
  await P.evalJs(`(() => { const i = document.querySelector('#device-pair-dialog .dap-custom'); i.value = ''; i.dispatchEvent(new Event('input')); return true; })()`);
  await P.type('wss://mac.lan:3456');
  const good = await P.evalJs(`document.querySelector('#device-pair-dialog .dap-verdict').textContent`);
  ok(good === 'wss://mac.lan:3456/api/device-dial?device=DEVICE', 'a good custom address shows the dial URL it makes', good);
  // back to the origin row, a name, Create pairing
  await P.realClick(`#device-pair-dialog .dap-row[data-kind="origin"] input`);
  await P.realClick(`#device-pair-dialog .device-pair-name`);
  await P.type('uimac');
  // THE RECT CENSUS at 860 px (the form)
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 860, height: 760, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const r860 = await P.evalJs(rectCensusJs('#device-pair-dialog .dialog', '.dap-row', 28));
  ok(r860.ok, 'RECT CENSUS 860 px: the dialog inside the viewport, no horizontal overflow', r860);
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await sleep(200);
  // ── ② Create pairing: ONE mint on the chosen base ──
  console.log('② Create pairing — ONE mint, both URLs on the chosen base');
  ok(await P.realClick(`#device-pair-dialog .device-pair-go`), 'a real click on 创建配对');
  ok(await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000), 'the command appears');
  const m1 = mints(P);
  ok(m1.length === before + 1 && JSON.parse(m1.at(-1).body).base === W.BASE && JSON.parse(m1.at(-1).body).deviceId === 'uimac', 'ONE POST carrying the chosen base and the name', m1.map((x) => x.body));
  const cmd = await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-cmd').value`);
  ok(cmd.includes(`curl -fsSL ${W.BASE}/vibespace-device-install.sh`) && cmd.includes(`--bundle-url ${W.BASE}/vibespace-device.js`) && cmd.includes(`--dial '${W.BASE.replace(/^http/, 'ws')}/api/device-dial?device=uimac'`), 'BOTH command URLs (the installer + bundle, and the dial URL) are on the chosen base', cmd);
  const tok1 = (cmd.match(/VIBESPACE_DIAL_TOKEN=(vsdt_[0-9a-f]+)/) || [])[1], host1 = (cmd.match(/VIBESPACE_HOST_TOKEN=(vsht_[0-9a-f]+)/) || [])[1]; // verify-r3 B-inst: the tokens in the installer shell's environment
  ok(!/--dial-token|--host-token/.test(cmd) && /\n  bash -s -- \\\n/.test(cmd), 'verify-r3 B-inst: the command carries the tokens as environment assignments before `bash`, never as flags (a flag sits in bash\'s argv, readable by every user of the device)', cmd);
  ok(!!tok1 && !!host1, 'the command carries both tokens');
  // phone: the same command body at 360 px
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const r360c = await P.evalJs(`(() => { const d = document.querySelector('#device-pair-dialog .dialog'); const ta = d.querySelector('.device-pair-cmd'); const dr = d.getBoundingClientRect(), tr = ta.getBoundingClientRect(); const body = d.querySelector('.dialog-body'); return { inside: tr.left >= dr.left - 1 && tr.right <= dr.right + 1, fits: dr.right <= document.documentElement.clientWidth + 1 && dr.left >= -1, overflowX: body.scrollWidth - body.clientWidth, font: getComputedStyle(ta).fontSize, copyW: Math.round(d.querySelector('.device-pair-copy').getBoundingClientRect().width) }; })()`);
  ok(r360c.inside && r360c.fits && r360c.overflowX <= 1 && r360c.font === '11px', 'RECT CENSUS 360 px: the 11 px command textarea inside the dialog, no horizontal overflow', r360c);
  await P.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false });
  await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close').click(); true`);
  await sleep(300);
  // re-open the row's sheet: no mint, the head says `never`
  await openRemote(P);
  ok(await P.waitFor(`!!${rowOf('host-dial-uimac')}`, 10000), 'the new device has a machine row');
  const subNever = await P.evalJs(`${rowOf('host-dial-uimac')}.querySelector('.mounts-dial-state').textContent`);
  ok(/^从未连接 — .* 生成的命令尚未到达本服务器/.test(subNever), 'the row says 从未连接 — the command generated at … has not reached this server', subNever);
  const b2 = mints(P).length;
  for (let k = 0; k < 10; k++) {
    await P.realClick(`(${rowOf('host-dial-uimac')}?.querySelector('.mounts-row-actions button[title^="配对命令"], .mounts-row-actions button[title^="Pairing command"]') || null)`);
    await P.waitFor(`document.querySelectorAll('#device-pair-dialog .dap-row').length > 1`, 8000);
    if (k < 9) { await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close').click(); true`); await sleep(150); }
  }
  const head = await P.evalJs(`(() => { const s = document.querySelector('#device-pair-dialog .device-pair-state'); return s ? { text: s.textContent, state: s.dataset.dialState } : null; })()`);
  ok(head && head.state === 'never' && /^从未连接/.test(head.text), 'the pairing SHEET\'s head says the device\'s state (never)', head);
  // naive-user N-sheet: the sheet checks the DEVICE's address (the command was made on the origin row), never the
  // dialog's default for a new device (pre-fix: row 1 — "Generate" + the in-place push moved a working device onto it)
  const sheetPick = await P.evalJs(`(() => { const r = [...document.querySelectorAll('#device-pair-dialog .dap-row')].find((x) => x.querySelector('input').checked); return r ? { base: r.querySelector('.dap-base').textContent, own: r.querySelector('.dap-own')?.textContent || '' } : null; })()`);
  ok(sheetPick && sheetPick.base === W.BASE && sheetPick.own === '这台设备当前命令用的地址', 'N-sheet: the sheet CHECKS the address this device\'s command was made for (the origin), saying "这台设备当前命令用的地址"', sheetPick);
  // verify-r4 F8: what Generate does to a device that is not dialed in is said BEFORE the button (naive L-generate-before)
  const consNever = await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-consequence')?.textContent || ''`);
  ok(/^生成新命令会替换 \d\d:\d\d 生成的那条：那条随即失效 — 请在设备上运行新的这条。$/.test(consNever), 'F8: the never-connected sheet says, before 生成新命令, that the command made at <time> stops working', consNever);
  ok(mints(P).length === b2, 'TEN re-opens of the sheet minted NOTHING (attack 16)', mints(P).length - b2);
  ok((await W.hostRow('uimac')).dial.generation === 1, '…generation still 1');
  // Generate a new command: ONE mint, generation 2, the sentence
  ok(await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-go').textContent`) === '生成新命令', 'the sheet\'s button is 生成新命令');
  await P.realClick(`#device-pair-dialog .device-pair-go`);
  ok(await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000), 'Generate ⇒ the new command');
  ok(mints(P).length === b2 + 1 && (await W.hostRow('uimac')).dial.generation === 2, 'ONE POST, generation 2');
  const genHead = await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-head').textContent`);
  ok(genHead === '"uimac" 的新命令 — 之前生成的那条现在已失效。在设备上运行这条：', 'the sentence: the previous command stops working now', genHead);
  await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close').click(); true`);
  // ── ③ a daemon with the RETIRED token (generation 1) ⇒ refused, by name, on the row + the Machines card ──
  console.log('③ a device holding the retired command — the row and the Machines card say refused (token mismatch)');
  const root = `${W.devDir}/uimac`;
  fs.mkdirSync(`${root}/state`, { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${root}/state/token`, host1, { mode: 0o600 });
  W.startDaemon(root, `${W.BASE.replace(/^http/, 'ws')}/api/device-dial?device=uimac`, tok1);
  let refusedRow = null;
  for (let i = 0; i < 80 && !refusedRow; i++) { const h = await W.hostRow('uimac'); if (h?.dial?.lastRefusal?.code === 'token-mismatch') refusedRow = h; else await sleep(250); }
  ok(!!refusedRow && refusedRow.dial.lastRefusal.attempt >= 0, 'the server recorded the refusal (hosts.json dial.lastRefusal token-mismatch)', refusedRow && refusedRow.dial);
  await openRemote(P);
  ok(await P.waitFor(`/^最近一次拨号：被拒绝（令牌不匹配），/.test(${rowOf('host-dial-uimac')}?.querySelector('.mounts-dial-state')?.textContent || '')`, 15000), 'the ROW reads 最近一次拨号：被拒绝（令牌不匹配），… — never a bare "offline" (attack 17)', await P.evalJs(`${rowOf('host-dial-uimac')}?.querySelector('.mounts-dial-state')?.textContent`));
  // naive-user N-refused: the row NAMES the command that works (the one generated at the latest mint) and says to run
  // it — "the device holds an older command; generate a new one" sent the user round the rotation loop (every Generate
  // retired the command he had just made)
  const mintHhmm = await P.evalJs(`new Date(${(await W.hostRow('uimac')).dial.tokenMintedAt}).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })`); // the words' own clock (dial-address-picker.js hhmm: the DEVICE's locale — L-time)
  ok(await P.evalJs(`(() => { const t = ${rowOf('host-dial-uimac')}.querySelector('.mounts-dial-state').textContent; return t.includes('设备上仍是比 ${mintHhmm} 生成的那条更旧的命令：请在设备上运行那一条（已经找不到了再重新生成）') && !/请重新生成$/.test(t); })()`) && await P.evalJs(`${rowOf('host-dial-uimac')}.querySelector('.mounts-badge').textContent === '被拒绝'`), `N-refused: the row names the current command (generated at ${mintHhmm}) and says to run THAT one — never a bare "请重新生成"; the badge reads 被拒绝`, await P.evalJs(`${rowOf('host-dial-uimac')}.querySelector('.mounts-dial-state').textContent`));
  // the Machines card (Manage agents → Machines) reads the same state
  await P.evalJs(`(() => { localStorage.setItem('vibespace.agentsTab', 'machines'); app._showAgentsDialog({ forceModal: true }); return true; })()`);
  const cardOk = await P.waitFor(`[...document.querySelectorAll('.agents-mach-acc')].some((d) => d.dataset.host === 'host-dial-uimac' && /^最近一次拨号：被拒绝（令牌不匹配）/.test(d.querySelector('.agents-mach-line2')?.textContent || ''))`, 15000);
  ok(cardOk, 'the Machines card\'s second line reads the same refused state', await P.evalJs(`[...document.querySelectorAll('.agents-mach-acc')].map((d) => d.dataset.host + ': ' + (d.querySelector('.agents-mach-line2')?.textContent || '')).join(' | ')`));
  // the English page says it in English
  const E = await W.openPage({ width: 1280, height: 820, lang: 'en' });
  await openRemote(E);
  ok(await E.waitFor(`/^Last dial: refused \\(token mismatch\\) at .* — the device still holds a command older than the one generated at .*: run that one on the device \\(or generate a new one if you no longer have it\\)$/.test(${rowOf('host-dial-uimac')}?.querySelector('.mounts-dial-state')?.textContent || '')`, 15000), 'the English page: "Last dial: refused (token mismatch) at … — the device still holds a command older than the one generated at …: run that one on the device (or generate a new one if you no longer have it)"', await E.evalJs(`${rowOf('host-dial-uimac')}?.querySelector('.mounts-dial-state')?.textContent`));
  // the phone: the sheet at 360 px — radios ≥ 44 px, nothing overflows
  await E.cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  await E.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.id === 'host-dial-uimac')); true`);
  await E.waitFor(`document.querySelectorAll('#device-pair-dialog .dap-row').length > 1`, 8000);
  const r360 = await E.evalJs(rectCensusJs('#device-pair-dialog .dialog', '.dap-row', 44));
  ok(r360.ok, 'RECT CENSUS 360 px: the sheet inside the viewport, no horizontal overflow, every address row ≥ 44 px', r360);
  ok((await E.evalJs(labelRowCensusJs('#device-pair-dialog'))).ok, 'N-radio: on the phone every address radio sits beside its address (not centred above it)', await E.evalJs(labelRowCensusJs('#device-pair-dialog')));
  const headEn = await E.evalJs(`document.querySelector('#device-pair-dialog .device-pair-state').textContent`);
  ok(/^Last dial: refused \(token mismatch\)/.test(headEn), 'the sheet\'s head says the refused state (the user sees the OLD command failed before rotating it)', headEn);
  ok(mints(E).length === 0, 'the English page minted nothing either');
  // attack 19: a custom address that is not an address — refused BEFORE anything is minted (the route re-judges it)
  for (const bad of ['http://mac.lan/api', 'javascript:alert(1)', 'mac.lan:99999']) {
    const r = await W.api('POST', '/api/device/dial-pair', { deviceId: 'nopair', base: bad });
    ok(r.status === 400 && r.j.code === 'bad_base' && !(await W.hostRow('nopair')), `POST dial-pair base ${JSON.stringify(bad)} ⇒ 400 bad_base (${r.j.why}), no pairing created (attack 19)`, r);
  }
  // ── verify-r1 B8: "Generate a new command" while a device holding the CURRENT command is dialed in — the sheet
  // offers the choice (unchecked), the default locks the holder out: it is refused at its next dial, by name ──
  console.log('verify-r1 B8: a connected holder is locked out by Generate unless the user chooses to update it in place');
  {
    const cur = await W.api('POST', '/api/device/dial-pair', { deviceId: 'uimac', base: W.BASE }); // generation 3 — the token a connected device holds
    const root2 = `${W.devDir}/uimac-holder`;
    fs.mkdirSync(`${root2}/state`, { recursive: true, mode: 0o700 });
    fs.writeFileSync(`${root2}/state/token`, cur.j.hostToken, { mode: 0o600 });
    W.startDaemon(root2, cur.j.dialUrl, cur.j.dialToken);
    let on = false; for (let i = 0; i < 80 && !on; i++) { on = !!(await W.hostRow('uimac'))?.online; if (!on) await sleep(250); }
    ok(on, 'a device holding the current command is dialed in (online)');
    await openRemote(E);
    await E.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.id === 'host-dial-uimac')); true`);
    await E.waitFor(`document.querySelectorAll('#device-pair-dialog .dap-row').length > 1`, 8000);
    const keep = await E.evalJs(`(() => { const b = document.querySelector('#device-pair-dialog .device-pair-keep input'); return b ? { checked: b.checked, text: b.parentElement.textContent } : null; })()`);
    ok(keep && keep.checked === false && /Send the new command to the connected device over its link/.test(keep.text), 'the sheet offers "send the new command to the connected device" — UNCHECKED by default', keep);
    const lcKeep = await E.evalJs(labelRowCensusJs('#device-pair-dialog'));
    ok(lcKeep.ok && lcKeep.n >= 2, 'N-radio: the keep box sits beside its sentence, like every address radio', lcKeep);
    const ownE = await E.evalJs(`(() => { const r = [...document.querySelectorAll('#device-pair-dialog .dap-row')].find((x) => x.querySelector('input').checked); return r ? { base: r.querySelector('.dap-base').textContent, own: r.querySelector('.dap-own')?.textContent || '' } : null; })()`);
    ok(ownE && ownE.base === W.BASE && ownE.own === 'the address this device connects through', 'N-sheet: the sheet of a CONNECTED device checks the address it connects through, saying so', ownE);
    const bE = mints(E).length;
    await E.realClick(`#device-pair-dialog .device-pair-go`);
    ok(await E.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000), 'Generate ⇒ the new command');
    const mintBody = JSON.parse(mints(E).at(-1).body);
    ok(mints(E).length === bE + 1 && mintBody.updateInPlace === false, 'ONE POST with updateInPlace: false', mintBody);
    ok(mintBody.base === W.BASE, 'N-sheet: "Generate a new command" keeps the device on its own address (the POST carries the base it connects through)', mintBody);
    const headB8 = await E.evalJs(`document.querySelector('#device-pair-dialog .device-pair-head').textContent`);
    ok(/the device that was connected has been disconnected; it holds the previous command, which no longer works/.test(headB8), 'the sentence names the connected holder and its fate (verify-r2 B8-r2: disconnected NOW)', headB8);
    await E.evalJs(`document.querySelector('#device-pair-dialog .dialog-close').click(); true`);
    const onDevice = JSON.parse(fs.readFileSync(`${root2}/state/dial.json`, 'utf8'));
    ok(onDevice.token === cur.j.dialToken, 'the holder\'s dial.json still carries the OLD token (nothing was pushed)');
    // its next dial is refused by name
    try { process.kill(W.lockPid(root2), 'SIGTERM'); } catch { }
    await sleep(500);
    W.startDaemon(root2, cur.j.dialUrl, cur.j.dialToken);
    let refused = null; for (let i = 0; i < 80 && !refused; i++) { const h = await W.hostRow('uimac'); if (h?.dial?.lastRefusal?.code === 'token-mismatch' && h.dial.lastRefusal.at > cur.j.generation && h.dial.generation === 4) refused = h; else await sleep(250); }
    ok(!!refused && !refused.online, 'the holder\'s next dial is REFUSED (token mismatch) — the rotation locked it out', refused && refused.dial);
    // and WITH the choice: the route pushes the new dial.json to the connected device (the trusted-device case)
    try { process.kill(W.lockPid(root2), 'SIGTERM'); } catch { }
    await sleep(500);
    const cur2 = await W.api('POST', '/api/device/dial-pair', { deviceId: 'uimac', base: W.BASE });
    fs.writeFileSync(`${root2}/state/dial.json`, JSON.stringify({ url: cur2.j.dialUrl, token: cur2.j.dialToken }), { mode: 0o600 });
    W.startDaemon(root2, cur2.j.dialUrl, cur2.j.dialToken);
    on = false; for (let i = 0; i < 80 && !on; i++) { on = !!(await W.hostRow('uimac'))?.online; if (!on) await sleep(250); }
    const pushed = await W.api('POST', '/api/device/dial-pair', { deviceId: 'uimac', base: W.BASE, updateInPlace: true });
    ok(on && pushed.j.updatedInPlace === true && pushed.j.inPlace === 'requested', 'asked for: updatedInPlace true (the connected device gets the new command over its link)', pushed.j.inPlace);
    let landed = false; for (let i = 0; i < 40 && !landed; i++) { try { landed = JSON.parse(fs.readFileSync(`${root2}/state/dial.json`, 'utf8')).token === pushed.j.dialToken; } catch { } if (!landed) await sleep(250); }
    ok(landed, '…and its dial.json carries the new token');
    // verify-r6 P1: the sheet opened on a CONNECTED device, the device DROPS, the owner ticks "send it over its link" and
    // presses Generate — refused by name, NOTHING minted (pre-fix: a plain rotation — the device he chose to keep was cut)
    {
      let back = false; for (let i = 0; i < 80 && !back; i++) { back = !!(await W.hostRow('uimac'))?.online; if (!back) await sleep(250); }
      await E.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.id === 'host-dial-uimac')); true`);
      await E.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-keep input') && document.querySelectorAll('#device-pair-dialog .dap-row').length > 1`, 8000);
      const gen0 = (await W.hostRow('uimac'))?.dial?.generation;
      try { process.kill(W.lockPid(root2), 'SIGTERM'); } catch { }
      let off = false; for (let i = 0; i < 80 && !off; i++) { off = !(await W.hostRow('uimac'))?.online; if (!off) await sleep(250); }
      await E.evalJs(`(() => { const b = document.querySelector('#device-pair-dialog .device-pair-keep input'); b.checked = true; return true; })()`);
      await E.realClick(`#device-pair-dialog .device-pair-go`);
      await E.waitFor(`/no longer connected/.test(document.querySelector('#device-pair-dialog .device-pair-err')?.textContent || '')`, 10000);
      const p1 = await E.evalJs(`(() => ({ err: document.querySelector('#device-pair-dialog .device-pair-err')?.textContent || '', keepShown: getComputedStyle(document.querySelector('#device-pair-dialog .device-pair-keep')).display !== 'none', cmd: !!document.querySelector('#device-pair-dialog .device-pair-cmd') }))()`);
      const gen1 = (await W.hostRow('uimac'))?.dial?.generation;
      const lastBody = JSON.parse(mints(E).at(-1).body);
      ok(off && p1.err.startsWith('"uimac" is no longer connected, so its new command cannot be sent over its link — nothing was changed.') && !p1.keepShown && !p1.cmd && gen1 === gen0 && lastBody.updateInPlace === true && lastBody.keepLinkSince != null, 'verify-r6 P1: the device dropped after the sheet opened — "send it over its link" + Generate is REFUSED by name, nothing minted (generation unchanged), the keep choice is gone (pre-fix: a plain rotation cut the device the owner chose to keep)', { off, p1, gen0, gen1, lastBody: { updateInPlace: lastBody.updateInPlace, keepLinkSince: lastBody.keepLinkSince } });
      await E.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
    }
  }
  // ── verify-r4 F1: a device behind a relay that REWRITES the Host header (VibeSpace's own frp relay:
  // `hostHeaderRewrite = "127.0.0.1"`, src/plugins.js). naive-user N-sheet read the Host header as the device's
  // address — the sheet checked Custom… http://127.0.0.1 and Generate + the in-place push wrote ws://127.0.0.1 into
  // the device's dial.json (reproduced: the daemon then dialed 127.0.0.1:80 — stranded). The DEVICE states the address
  // it dials (x-vibespace-dial-base); the sheet checks that and the push keeps it there ──
  console.log('verify-r4 F1: a device behind a Host-rewriting relay — the sheet checks the address the DEVICE states');
  {
    const relay = net.createServer((c) => {
      let head = Buffer.alloc(0), up = null;
      c.on('data', (d) => {
        if (up) { up.write(d); return; }
        head = Buffer.concat([head, d]);
        const i = head.indexOf('\r\n\r\n');
        if (i < 0) return;
        const txt = head.slice(0, i).toString('latin1').replace(/\r\nHost: [^\r]*/i, '\r\nHost: 127.0.0.1');
        up = net.connect(W.PORT, '127.0.0.1', () => up.write(Buffer.concat([Buffer.from(txt, 'latin1'), head.slice(i)])));
        up.on('data', (x) => c.write(x)); up.on('end', () => c.end()); up.on('error', () => c.destroy()); c.on('error', () => up.destroy()); c.on('end', () => up.end());
      });
    });
    await new Promise((r) => relay.listen(0, '0.0.0.0', r));
    const ip = Object.values(os.networkInterfaces()).flat().find((a) => a && !a.internal && (a.family === 'IPv4' || a.family === 4))?.address || '127.0.0.1';
    const relayBase = `http://${ip}:${relay.address().port}`;
    const rp = await W.pairDevice('relaymac', { base: relayBase });
    let on = false; for (let i = 0; i < 80 && !on; i++) { on = !!(await W.hostRow('relaymac'))?.online; if (!on) await sleep(250); }
    const la = (await W.hostRow('relaymac'))?.dial?.lastAccept || {};
    ok(on && la.host === '127.0.0.1' && la.dialed === relayBase, `F1: dialed in through the relay — the Host header reached the server as 127.0.0.1, the device states ${relayBase}`, la);
    ok(await cachedRow(E, 'host-dial-relaymac', `(h) => !!h.online && h.dial?.lastAccept?.dialed === ${JSON.stringify(relayBase)}`), 'F1: the page\'s hosts cache carries the accepted dial (online, dialed through the relay) before the sheet opens');
    await E.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.id === 'host-dial-relaymac')); true`);
    await E.waitFor(`!!document.querySelector('#device-pair-dialog .dap-row input:checked')`, 8000);
    const pickR = await E.evalJs(`(() => { const r = [...document.querySelectorAll('#device-pair-dialog .dap-row')].find((x) => x.querySelector('input').checked); return r ? { kind: r.dataset.kind, custom: r.querySelector('.dap-custom')?.value || null, own: r.querySelector('.dap-own')?.textContent || '' } : null; })()`);
    ok(pickR && pickR.kind === 'custom' && pickR.custom === relayBase && pickR.own === 'the address this device connects through', 'F1: the sheet checks the address the device STATES it dials (pre-fix: Custom… http://127.0.0.1 — the relay\'s rewrite)', pickR);
    await E.evalJs(`(() => { const k = document.querySelector('#device-pair-dialog .device-pair-keep input'); k.checked = true; return true; })()`);
    const bR = mints(E).length;
    await E.realClick(`#device-pair-dialog .device-pair-go`);
    ok(await E.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000), 'Generate (send it over its link) ⇒ the new command');
    const bodyR = JSON.parse(mints(E).at(-1).body);
    ok(mints(E).length === bR + 1 && bodyR.base === relayBase && bodyR.updateInPlace === true, 'F1: ONE POST — the device\'s own address, pushed in place', bodyR);
    let urlR = ''; for (let i = 0; i < 40; i++) { try { urlR = JSON.parse(fs.readFileSync(`${rp.root}/state/dial.json`, 'utf8')).url; } catch { } if (urlR && urlR !== rp.dialUrl) break; await sleep(250); }
    ok(urlR === DF.dialUrlOf(relayBase, 'relaymac'), `F1: the device's dial.json keeps the relay (${urlR}) — never ws://127.0.0.1`, urlR);
    await E.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
    try { process.kill(W.lockPid(rp.root), 'SIGTERM'); } catch { }
    // verify-r5 C1: a device that DIALS an address VibeSpace did not offer — paired on this server's LAN row, its daemon
    // started on the relay's URL instead (a hand-edited dial.json; equally a leaked command's holder stating an address
    // of its own choosing): the sheet words it as the DEVICE's CLAIM. verify-r6 L1: and never checks it — the command's
    // base stays checked, the claim is a row of its own (one Generate on a pre-checked claim minted it for good)
    {
      const lanBase = `http://${ip}:${W.PORT}`;
      const cp = await W.pairDevice('claimmac', { base: lanBase, start: false });
      W.startDaemon(cp.root, DF.dialUrlOf(relayBase, 'claimmac'), cp.dialToken);
      let onC = false; for (let i = 0; i < 80 && !onC; i++) { onC = !!(await W.hostRow('claimmac'))?.online; if (!onC) await sleep(250); }
      const rowC = await W.hostRow('claimmac');
      ok(onC && rowC?.dial?.lastAccept?.dialed === relayBase && rowC?.dial?.mintedBase === lanBase, `C1: claimmac was paired on ${lanBase} and dials through ${relayBase} (not a row this server offers)`, rowC?.dial);
      ok(await cachedRow(E, 'host-dial-claimmac', `(h) => !!h.online && h.dial?.lastAccept?.dialed === ${JSON.stringify(relayBase)} && h.dial?.mintedBase === ${JSON.stringify(lanBase)}`), 'C1: the page\'s hosts cache carries the accepted dial (online, dialed through the relay, minted on the LAN row) before the sheet opens');
      await E.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.id === 'host-dial-claimmac')); true`);
      await E.waitFor(`!!document.querySelector('#device-pair-dialog .dap-row input:checked')`, 8000);
      const pickC = await E.evalJs(`(() => { const rows = [...document.querySelectorAll('#device-pair-dialog .dap-row')]; const r = rows.find((x) => x.querySelector('input').checked); const tag = r && r.querySelector('.dap-own'); const cr = rows.find((x) => x.querySelector('input').dataset.base === ${JSON.stringify(relayBase)}); const ct = cr && cr.querySelector('.dap-claim'); return r ? { kind: r.dataset.kind, base: r.querySelector('input').dataset.base || null, own: tag ? tag.textContent : null, claimRow: cr ? { kind: cr.dataset.kind, checked: cr.querySelector('input').checked, words: ct ? ct.textContent : null } : null } : null; })()`);
      ok(pickC && pickC.base === lanBase && pickC.own === 'the address of this device\'s current command' && pickC.claimRow && pickC.claimRow.checked === false && pickC.claimRow.words === 'the address this device says it connects through — VibeSpace did not offer it, so it is not checked: choose it only if it is yours', 'C1 / verify-r6 L1: the sheet keeps the command\'s base CHECKED and shows the address the device STATES as its CLAIM, on its own row, UNCHECKED — "choose it only if it is yours" (r5: the claim checked, so one Generate minted it; pre-r5: "the address this device connects through", as a fact)', pickC);
      await E.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
      try { process.kill(W.lockPid(cp.root), 'SIGTERM'); } catch { }
    }
    relay.close();
  }
  // ── verify-r4 F6: "Pair a device" under the NAME of an existing device is a replacement — said BEFORE the button
  // (pre-fix: nothing; Create rotated the token and cut the connected device — reproduced, generation 2) ──
  console.log('verify-r4 F6: a new pairing under an existing device\'s name says it replaces that pairing');
  {
    const bF = mints(P).length;
    await P.evalJs(`app.sidebar._showDevicePairDialog(); true`);
    ok(await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-name') && !document.querySelector('#device-pair-dialog .device-pair-go').disabled`, 10000), 'the new-pairing dialog');
    await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-name').focus(); true`);
    await P.type('uimac');
    const f6 = await P.evalJs(`({ note: document.querySelector('#device-pair-dialog .device-pair-exists')?.textContent || '', shown: !!document.querySelector('#device-pair-dialog .device-pair-exists')?.offsetParent, go: document.querySelector('#device-pair-dialog .device-pair-go').textContent })`);
    ok(f6.shown && /^"uimac" 已经配对过。创建会替换它的配对：它持有的命令随即失效。/.test(f6.note) && f6.go === '替换它的配对', 'F6: typing an existing (offline) device\'s name says "已经配对过。创建会替换它的配对…" and the button reads 替换它的配对 — before anything is minted', f6);
    await P.evalJs(`(() => { const i = document.querySelector('#device-pair-dialog .device-pair-name'); i.value = ''; i.dispatchEvent(new Event('input')); i.focus(); return true; })()`);
    await P.type('brand-new-mac');
    const f6b = await P.evalJs(`({ shown: !!document.querySelector('#device-pair-dialog .device-pair-exists')?.offsetParent, go: document.querySelector('#device-pair-dialog .device-pair-go').textContent })`);
    ok(!f6b.shown && f6b.go === '创建配对', 'F6: a new name ⇒ no note, the button reads 创建配对 again', f6b);
    ok(mints(P).length === bF, 'F6: typing minted nothing');
    await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
  }
  // ── verify-r5 A1: TWO WINDOWS PAIRING ONE NEW NAME. The F6 note is judged on a window's own copy of the machine list;
  // the route re-paired silently: the second Create rotated the token, cut the device the first window's command had
  // just connected, told the second window "the one you generated before stops working" and never told the first.
  // Now the dialog says what it expects, the route refuses a "new" pairing under a paired name (409), and a command
  // replaced while on screen says so. Window 2's list is HELD stale here (a broadcast that has not landed) ──
  console.log('verify-r5 A1: two windows, one new name — the route refuses a silent replacement; the replaced command says so');
  {
    for (const Q of [P, E]) {
      await openRemote(Q);
      await Q.evalJs(`app.sidebar._showDevicePairDialog(); true`);
      await Q.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-name') && !document.querySelector('#device-pair-dialog .device-pair-go').disabled`, 10000);
      await Q.evalJs(`document.querySelector('#device-pair-dialog .device-pair-name').focus(); true`);
      await Q.type('racemac');
    }
    await E.evalJs(`(() => { const s = app.sidebar; s.__r5real = s._hostsData; Object.defineProperty(s, '_hostsData', { configurable: true, get: () => ({ ...(s.__r5real || {}), hosts: ((s.__r5real || {}).hosts || []).filter((h) => h.deviceId !== 'racemac') }), set: (v) => { s.__r5real = v; } }); return true; })()`);
    const view = (Q) => Q.evalJs(`({ note: document.querySelector('#device-pair-dialog .device-pair-exists')?.textContent || '', shown: !!document.querySelector('#device-pair-dialog .device-pair-exists')?.offsetParent, go: document.querySelector('#device-pair-dialog .device-pair-go')?.textContent || '', err: document.querySelector('#device-pair-dialog .device-pair-err')?.textContent || '', head: document.querySelector('#device-pair-dialog .device-pair-head')?.textContent || '', replaced: document.querySelector('#device-pair-dialog .device-pair-replaced')?.offsetParent ? document.querySelector('#device-pair-dialog .device-pair-replaced').textContent : '', cmd: document.querySelector('#device-pair-dialog .device-pair-cmd')?.value || '' })`);
    // window 1 creates racemac, and a REAL daemon runs its command (connected)
    await P.realClick('#device-pair-dialog .device-pair-go');
    ok(await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000), 'A1: window 1 creates racemac');
    const b1 = JSON.parse(mints(P).at(-1).body);
    const c1 = (await view(P)).cmd;
    const tok = (c1.match(/VIBESPACE_DIAL_TOKEN=(vsdt_[0-9a-f]+)/) || [])[1], htok = (c1.match(/VIBESPACE_HOST_TOKEN=(vsht_[0-9a-f]+)/) || [])[1], durl = (c1.match(/--dial '([^']+)'/) || [])[1];
    const rootR = path.join(W.devDir, 'racemac');
    fs.mkdirSync(path.join(rootR, 'state'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(rootR, 'state', 'token'), htok || '', { mode: 0o600 });
    W.startDaemon(rootR, durl, tok);
    let onR = false; for (let i = 0; i < 80 && !onR; i++) { onR = !!(await W.hostRow('racemac'))?.online; if (!onR) await sleep(250); }
    ok(b1.expect === 'new' && !!tok && !!durl && onR, 'A1: window 1 said it expects a NEW device, and its command is running on a device (connected)', { expect: b1.expect, onR });
    // window 2 (its list stale) still reads Create pairing — then presses it
    await sleep(1300);
    const e0 = await view(E);
    ok(!e0.shown && e0.go === 'Create pairing', 'A1: window 2, its list stale, reads "Create pairing" with no note (the state the probe reproduced)', e0);
    const bE = mints(E).length;
    await E.realClick('#device-pair-dialog .device-pair-go');
    await E.waitFor(`/was paired a moment ago/.test(document.querySelector('#device-pair-dialog .device-pair-err')?.textContent || '')`, 8000);
    const e1 = await view(E);
    const r1 = await W.hostRow('racemac');
    ok(mints(E).length === bE + 1 && JSON.parse(mints(E).at(-1).body).expect === 'new' && /^"racemac" was paired a moment ago — in another window, or by another user\. Nothing was created\./.test(e1.err) && e1.go === 'Replace its pairing' && e1.shown && /^"racemac" is already paired and connected\. Creating replaces its pairing: that device is disconnected now/.test(e1.note) && r1.dial.generation === 1 && r1.online, 'A1: window 2\'s Create ⇒ 409 already_paired — NOTHING minted (generation 1, the device still connected); the window says why, shows the CONNECTED note and "Replace its pairing" (pre-fix: generation 2, the device cut, "the one you generated before")', { e1, gen: r1.dial.generation, online: r1.online });
    // window 2 replaces it knowingly; window 1's command then says it no longer works
    await E.evalJs(`(() => { const s = app.sidebar; const v = s.__r5real; delete s._hostsData; s._hostsData = v; return true; })()`);
    await E.realClick('#device-pair-dialog .device-pair-go');
    ok(await E.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000), 'A1: "Replace its pairing" ⇒ the new command');
    const e2 = await view(E);
    const r2 = await W.hostRow('racemac');
    ok(JSON.parse(mints(E).at(-1).body).expect === 'existing' && /^A new command for "racemac" — the device that was connected has been disconnected/.test(e2.head) && r2.dial.generation === 2, 'A1: the knowing Replace sends expect=existing and re-pairs (generation 2; the connected device is cut and the head says so)', { head: e2.head, gen: r2.dial.generation });
    ok(await P.waitFor(`/^这条命令已经失效 — .* 又为 "racemac" 生成了一条更新的/.test(document.querySelector('#device-pair-dialog .device-pair-replaced')?.textContent || '') && !!document.querySelector('#device-pair-dialog .device-pair-replaced').offsetParent`, 6000), 'A1: window 1\'s command sheet now says 这条命令已经失效 — a newer one was generated (pre-fix: it kept showing "Paired as" with a dead command)', await view(P));
    for (const Q of [P, E]) await Q.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
    try { process.kill(W.lockPid(rootR), 'SIGTERM'); } catch { }
    // the route alone (an older client, the API): expect=new on a paired name ⇒ 409, nothing minted
    const api409 = await W.api('POST', '/api/device/dial-pair', { deviceId: 'racemac', base: W.BASE, expect: 'new' });
    ok(api409.status === 409 && api409.j.code === 'already_paired' && (await W.hostRow('racemac')).dial.generation === 2, 'A1: POST dial-pair {expect:new} on a paired name ⇒ 409 already_paired, nothing minted', api409);
    // verify-r6 P3: the 1 s tick flips a window's button to "Replace its pairing" when another window pairs the typed name
    // meanwhile — a press landing right after that flip read the LIVE label and replaced the fresh pairing unshown. The
    // tick never upgrades a press: it is sent as `new`, the route answers 409 already_paired, nothing is replaced
    await E.evalJs(`app.sidebar._showDevicePairDialog(); true`);
    await E.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-name') && !document.querySelector('#device-pair-dialog .device-pair-go').disabled`, 10000);
    await E.evalJs(`document.querySelector('#device-pair-dialog .device-pair-name').focus(); true`);
    await E.type('tickmac');
    const t0v = await view(E);
    const other = await W.api('POST', '/api/device/dial-pair', { deviceId: 'tickmac', base: W.BASE, expect: 'new' }); // "another window"
    const flipped = await E.waitFor(`document.querySelector('#device-pair-dialog .device-pair-go')?.textContent === 'Replace its pairing'`, 8000);
    const bT = mints(E).length;
    await E.realClick('#device-pair-dialog .device-pair-go');
    await E.waitFor(`/was paired a moment ago/.test(document.querySelector('#device-pair-dialog .device-pair-err')?.textContent || '')`, 8000);
    const tv = await view(E);
    const rT = await W.hostRow('tickmac');
    ok(t0v.go === 'Create pairing' && other.status === 200 && flipped && mints(E).length === bT + 1 && JSON.parse(mints(E).at(-1).body).expect === 'new' && /^"tickmac" was paired a moment ago/.test(tv.err) && rT.dial.generation === 1, 'verify-r6 P3: a press right after the TICK flipped the button to "Replace its pairing" is sent as expect=new ⇒ 409 already_paired, NOTHING replaced (generation 1) — the tick never turns a press into a replace (pre-fix: expect=existing read off the live label, the other window\'s pairing replaced)', { t0: t0v.go, flipped, body: JSON.parse(mints(E).at(-1).body).expect, err: tv.err, gen: rT.dial.generation });
    await E.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
  }
  // ── verify-r5 A3: a name that differs from a paired one only by upper / lower case — one name on a case-insensitive
  // disk (a macOS hub): said before Create, refused by the route, nothing minted ──
  console.log('verify-r5 A3: "UIMAC" beside the paired "uimac" — said before Create, refused by the route');
  {
    await P.evalJs(`app.sidebar._showDevicePairDialog(); true`);
    await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-name') && !document.querySelector('#device-pair-dialog .device-pair-go').disabled`, 10000);
    await P.evalJs(`document.querySelector('#device-pair-dialog .device-pair-name').focus(); true`);
    await P.type('UIMAC');
    const a3 = await P.evalJs(`({ note: document.querySelector('#device-pair-dialog .device-pair-exists')?.textContent || '', shown: !!document.querySelector('#device-pair-dialog .device-pair-exists')?.offsetParent, go: document.querySelector('#device-pair-dialog .device-pair-go').textContent })`);
    ok(a3.shown && a3.note === '"UIMAC" 和已配对的设备 "uimac" 只差大小写 — VibeSpace 把它们当成同一个名字。请换一个名字，或者用 "uimac" 那一行上的配对图标给它一条新命令。' && a3.go === '创建配对', 'A3: typing "UIMAC" beside the paired "uimac" says they are one name (zh), before Create', a3);
    const bA3 = mints(P).length, genA3 = (await W.hostRow('uimac'))?.dial?.generation;
    await P.realClick('#device-pair-dialog .device-pair-go');
    await P.waitFor(`/只差大小写/.test(document.querySelector('#device-pair-dialog .device-pair-err')?.textContent || '')`, 8000);
    const hostsA3 = (await W.api('GET', '/api/hosts')).j.hosts.filter((h) => String(h.deviceId || '').toLowerCase() === 'uimac').map((h) => h.deviceId);
    ok(mints(P).length === bA3 + 1 && hostsA3.join() === 'uimac' && (await W.hostRow('uimac'))?.dial?.generation === genA3, 'A3: Create ⇒ 409 name_case_taken — no "UIMAC" record, "uimac" untouched (its generation unchanged), the words in place', { hostsA3 });
    await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
  }
  // ── verify-r5 A2: the typed name BECOMES another id silently — "办公室Mac" is paired as "Mac" (and the F6 note named the
  // paired "Mac": read as a different device, Replace would cut it); an all-CJK name became dev-<hex> ──
  console.log('verify-r5 A2: the dialog says what the typed name becomes');
  {
    await P.evalJs(`app.sidebar._showDevicePairDialog(); true`);
    await P.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-name') && !document.querySelector('#device-pair-dialog .device-pair-go').disabled`, 10000);
    const typeName = async (n) => { await P.evalJs(`(() => { const i = document.querySelector('#device-pair-dialog .device-pair-name'); i.value = ''; i.dispatchEvent(new Event('input')); i.focus(); return true; })()`); await P.type(n); return P.evalJs(`({ will: document.querySelector('#device-pair-dialog .device-pair-willbe')?.offsetParent ? document.querySelector('#device-pair-dialog .device-pair-willbe').textContent : '', note: document.querySelector('#device-pair-dialog .device-pair-exists')?.offsetParent ? document.querySelector('#device-pair-dialog .device-pair-exists').textContent : '' })`); };
    const w1 = await typeName('办公室uimac');
    const w2 = await typeName('我的电脑');
    const w3 = await typeName('uimac');
    ok(w1.will === '它会以 "uimac" 配对 — 设备名只保留字母、数字、- 和 _。' && /^"uimac" 已经配对过/.test(w1.note) && w2.will === '这个名字里没有字母、数字、- 或 _ — 会用一个随机名字（dev-…）配对。' && w3.will === '', 'A2: "办公室uimac" ⇒ "它会以 "uimac" 配对…" beside the replace note; "我的电脑" ⇒ the random-name line; a clean name ⇒ no line', { w1, w2, w3 });
    await P.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
  }
  // ── verify-r4 F7: a paired device's "Generate a new command" comes in ITS OS's form — the daemon states its OS on every
  // dial. Pre-fix the tab was navigator.platform: the owner's Windows browser handed a paired Mac the PowerShell form ──
  console.log('verify-r4 F7: a paired device\'s new command in ITS OS\'s form, never the browser\'s');
  {
    const po = await W.pairDevice('osdev');
    let on = false; for (let i = 0; i < 80 && !on; i++) { on = !!(await W.hostRow('osdev'))?.online; if (!on) await sleep(250); }
    const pf = (await W.hostRow('osdev'))?.dial?.lastAccept?.platform;
    const want = { mac: 'macOS', linux: 'Linux', win: 'Windows' }[DF.commandOsOf(pf)];
    ok(on && pf === process.platform && !!want, `F7: the device states its OS (${pf})`, pf);
    const winPage = async (bundleText = null) => {
      const Q = await W.openPage({ width: 1280, height: 820, lang: 'en', bundleText });
      await Q.cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', platform: 'Win32' });
      await Q.cdp('Page.reload'); await sleep(500); await Q.waitApp(); await sleep(700);
      return Q;
    };
    const generate = async (Q) => {
      await openRemote(Q);
      await Q.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.id === 'host-dial-osdev')); true`);
      await Q.waitFor(`!!document.querySelector('#device-pair-dialog .dap-row input:checked')`, 8000);
      await Q.realClick('#device-pair-dialog .device-pair-go');
      await Q.waitFor(`!!document.querySelector('#device-pair-dialog .device-pair-cmd')`, 10000);
      const r = await Q.evalJs(`({ nav: navigator.platform, chip: [...document.querySelectorAll('#device-pair-dialog .device-pair-os button')].find((b) => b.className === 'btn-create')?.textContent || '', cmd: document.querySelector('#device-pair-dialog .device-pair-cmd').value.slice(0, 14) })`);
      await Q.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
      return r;
    };
    const Q1 = await winPage();
    const g1 = await generate(Q1);
    ok(g1.nav === 'Win32' && g1.chip === want && (want === 'Windows' || /^curl -fsSL/.test(g1.cmd)), `F7: from a Windows browser, the ${pf} device's new command is the ${want} form (pre-fix: Windows — PowerShell)`, g1);
    await Q1.cdp('Page.close').catch(() => {});
    // CONTROL (F7): the pre-fix sheet — the browser's OS whatever the device states
    const MUT7 = mutantCopies('pairos', REPO);
    const smSrc = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
    const smPre = smSrc.replace('const guessOs = deviceOs || (', 'const guessOs = (');
    ok(smPre !== smSrc, 'CONTROL (F7): the patch applies');
    const Q2 = await winPage(await buildPatchedBundle(MUT7, 'src/lib/sidebar-mounts.js', smPre, 'browseros'));
    const g2 = await generate(Q2);
    ok(g2.nav === 'Win32' && g2.chip === 'Windows' && want !== 'Windows', 'CONTROL (F7): the pre-fix sheet hands the device the Windows (PowerShell) form from a Windows browser — the F7 leg goes red', g2);
    await Q2.cdp('Page.close').catch(() => {});
    try { process.kill(W.lockPid(po.root), 'SIGTERM'); } catch { }
  }
  // ── verify-r4 F8: an OFFLINE device that worked (relaymac, its daemon stopped after the F1 leg — a laptop asleep):
  // Generate would leave it refused when it comes back until the new command runs on it. Pre-fix nothing said so
  // before the button (reproduced) ──
  console.log('verify-r4 F8: the sheet of an offline device says what Generate does to it — before the button');
  {
    let off = false; for (let i = 0; i < 60 && !off; i++) { off = !(await W.hostRow('relaymac'))?.online; if (!off) await sleep(250); }
    const sheetCons = async (Q) => {
      await openRemote(Q);
      await Q.evalJs(`app.sidebar._showDevicePairDialog((app.sidebar._hostsData?.hosts || []).find((h) => h.id === 'host-dial-relaymac')); true`);
      await Q.waitFor(`!!document.querySelector('#device-pair-dialog .dap-row input:checked')`, 8000);
      const r = await Q.evalJs(`({ cons: document.querySelector('#device-pair-dialog .device-pair-consequence')?.textContent || '', before: !!document.querySelector('#device-pair-dialog .device-pair-consequence') && !!(document.querySelector('#device-pair-dialog .device-pair-consequence').compareDocumentPosition(document.querySelector('#device-pair-dialog .device-pair-go')) & Node.DOCUMENT_POSITION_FOLLOWING) })`);
      await Q.evalJs(`document.querySelector('#device-pair-dialog .dialog-close')?.click(); true`);
      return r;
    };
    const c8 = await sheetCons(P);
    ok(off && c8.cons === '这台设备现在离线。生成新命令会替换它手上的那条：它回来时会被拒绝，直到你在它上面运行新命令。' && c8.before, 'F8: 这台设备现在离线。生成新命令会替换它手上的那条：它回来时会被拒绝… — above 生成新命令', c8);
    // CONTROL (F8): the pre-fix sheet (no sentence for a device that is not dialed in)
    const MUT8 = mutantCopies('paircons', REPO);
    const sm8 = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8');
    const sm8Pre = sm8.replace('        const cons = generateConsequenceText(h);', "        const cons = '';");
    ok(sm8Pre !== sm8, 'CONTROL (F8): the patch applies');
    const Q8 = await W.openPage({ width: 1280, height: 820, lang: 'zh', bundleText: await buildPatchedBundle(MUT8, 'src/lib/sidebar-mounts.js', sm8Pre, 'nocons') });
    const c8p = await sheetCons(Q8);
    ok(c8p.cons === '' && !c8p.before, 'CONTROL (F8): the pre-fix sheet says nothing before 生成新命令 — the F8 leg goes red', c8p);
    await Q8.cdp('Page.close').catch(() => {});
  }
  ok(P.errors.length === 0 && E.errors.length === 0, 'no page exception', [...P.errors, ...E.errors].slice(0, 3));
} catch (e) {
  fail++; console.error('  ✗ threw:', e.stack || e.message);
}
console.log(fail ? `\n${fail} FAILED (${pass} passed) · ${((Date.now() - T0) / 1000).toFixed(1)} s` : `\nALL PASS (${pass}) · ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
