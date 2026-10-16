#!/usr/bin/env node
// lane machine-desktop-apps (owner 2026-10-11, "这个界面布局有问题 另外刚才我让 agent 装了 jasp 但是列表里没有"): a paired
// Windows / macOS machine's desktop dialog lists the apps INSTALLED on it — enumerated ON the machine by witness (the
// Start Menu + the registry's Uninstall keys / /Applications) through the gated `desktop-apps-list` device op — and its
// action row never squeezes a button into a column of characters. FAST, in-process:
//   §1 the Windows parser over a Start Menu + Uninstall dump (JASP, a .lnk with arguments, dedup, uninstallers, the cap,
//      malformed lines)   §2 the macOS parser (/Applications, a quoted name through a real sh, background-only, binary
//      plist)   §3 the device lister (the ONE encoded script, its budget; a real ~/Applications walk)   §4 the refresh
//      rules + the hub's re-judge   §5 the capability gate (+ RED control: the gate removed sends the op)   §6 the access
//      layer: cache, single flight, hello, install, old agent, a Linux machine   §7 the route   §8 the dialog (list,
//      filter, keyed rows, Examples / Recent, the update words) + the action-row rule (RED control: the base CSS)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const IA = require(REPO + '/src/installed-apps.js');
const MD = require(REPO + '/src/machine-desktop-model.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const tick = () => new Promise((r) => setTimeout(r, 0));
const J = (o) => JSON.stringify(o);

console.log('§1 the Windows listing (Start Menu shortcuts + Uninstall keys → rows)');
const SM = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
const WIN_DUMP = [
  J({ k: 'lnk', n: 'JASP', p: `${SM}\\JASP\\JASP.lnk`, t: 'C:\\Program Files\\JASP\\JASP.exe', a: '' }),
  J({ k: 'lnk', n: 'Uninstall JASP', p: `${SM}\\JASP\\Uninstall JASP.lnk`, t: 'C:\\Program Files\\JASP\\unins000.exe', a: '' }),
  J({ k: 'lnk', n: 'JASP Website', p: `${SM}\\JASP\\JASP Website.lnk`, t: 'C:\\Program Files\\JASP\\jasp.url', a: '' }),
  J({ k: 'lnk', n: 'Chrome (Work)', p: `${SM}\\Chrome (Work).lnk`, t: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', a: '--profile-directory="Profile 1"' }),
  J({ k: 'lnk', n: 'Google Chrome', p: `${SM}\\Google Chrome.lnk`, t: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', a: '' }),
  J({ k: 'lnk', n: 'Google Chrome', p: 'C:\\Users\\m\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Google Chrome.lnk', t: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', a: '' }),
  J({ k: 'lnk', n: 'Word', p: `${SM}\\Word.lnk`, t: '', a: '' }),
  J({ k: 'lnk', n: 'Sneaky', p: `${SM}\\Sneaky.lnk`, t: 'C:\\Tools\\ev\u202eil.exe', a: '' }),
  J({ k: 'uninst', n: 'JASP 0.98.1', i: '"C:\\Program Files\\JASP\\JASP.exe",0', l: 'C:\\Program Files\\JASP\\', x: ['JASP.exe', 'unins000.exe'] }),
  J({ k: 'uninst', n: '7-Zip 24.08 (x64)', i: 'C:\\Program Files\\7-Zip\\7zFM.exe', l: 'C:\\Program Files\\7-Zip\\', x: ['7z.exe', '7zFM.exe', '7zG.exe', 'Uninstall.exe'] }),
  J({ k: 'uninst', n: 'Foo Tool', i: 'C:\\Program Files\\Foo\\foo.ico', l: 'C:\\Program Files\\Foo', x: 'FooTool.exe' }),
  J({ k: 'uninst', n: 'Bar Updater', i: 'C:\\Program Files\\Bar\\uninstall.exe', l: '', x: [] }),
  '{"k":"lnk", broken', 'garbage line', 'null', J({ k: 'lnk', n: 123 }), J([1, 2]), '',
].join('\r\n');
let w;
try { w = IA.parseWindowsListing(WIN_DUMP, { now: 1000 }); ok(true, 'a dump with malformed lines (half a JSON object, prose, null, a number name, an array) never throws'); } catch (e) { ok(false, 'malformed lines never throw', e.message); w = { rows: [] }; }
const byName = (n) => w.rows.filter((r) => r.name === n);
const jasp = byName('JASP');
ok(jasp.length === 1 && jasp[0].launch === 'start "" "C:\\Program Files\\JASP\\JASP.exe"' && jasp[0].source === 'start-menu' && jasp[0].seenAt === 1000, 'JASP: ONE row from its Start Menu shortcut, launch `start "" "C:\\Program Files\\JASP\\JASP.exe"` (its Uninstall key names the same exe — deduplicated)', jasp);
ok(MD.desktopRunPlan('win32', jasp[0] && jasp[0].launch).ok, 'the run door (desktopRunPlan) accepts JASP\'s launch line as is');
ok(!w.rows.some((r) => /JASP 0\.98/.test(r.name)), 'the Uninstall key of a program the Start Menu lists adds no second row');
const work = byName('Chrome (Work)');
ok(work.length === 1 && work[0].launch === 'start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --profile-directory="Profile 1"', 'a .lnk WITH arguments keeps them in its launch line (another program than the plain shortcut)', work);
ok(byName('Google Chrome').length === 1, 'the same shortcut in the all-users and the user Start Menu lists once (dedup by exe + arguments)');
ok(!w.rows.some((r) => /Uninstall|Website/.test(r.name)), 'an uninstaller and a web link are not apps');
const word = byName('Word');
ok(word.length === 1 && word[0].launch === `start "" "${SM}\\Word.lnk"`, 'an installer-advertised shortcut (no readable target) starts through the shortcut itself', word);
ok(!byName('Sneaky').length, 'a launch line the run door refuses (a hidden character in the path) is never offered');
const zip = byName('7-Zip 24.08 (x64)');
ok(zip.length === 1 && zip[0].source === 'uninstall' && zip[0].launch === 'start "" "C:\\Program Files\\7-Zip\\7zFM.exe"', 'an Uninstall key with an exe DisplayIcon lists that exe', zip);
const foo = byName('Foo Tool');
ok(foo.length === 1 && foo[0].launch === 'start "" "C:\\Program Files\\Foo\\FooTool.exe"', 'an Uninstall key whose icon is not an exe: the one app exe in its InstallLocation', foo);
ok(!byName('Bar Updater').length, 'an Uninstall key that names only an uninstaller lists nothing');
const names = w.rows.map((r) => r.name);
ok(J(names) === J(names.slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))) && w.total === w.rows.length && !w.truncated, `sorted by name, total = rows (${w.rows.length}: ${names.join(', ')})`);
const many = Array.from({ length: 700 }, (_, i) => J({ k: 'lnk', n: `App ${String(i).padStart(3, '0')}`, p: `${SM}\\a${i}.lnk`, t: `C:\\Apps\\a${i}\\a${i}.exe`, a: '' })).join('\n');
const capped = IA.parseWindowsListing(many);
ok(capped.rows.length === IA.INSTALLED_MAX && capped.total === 700 && capped.truncated === true && capped.rows[0].name === 'App 000', `at most ${IA.INSTALLED_MAX} rows; total + truncated say so`, { n: capped.rows.length, total: capped.total });
ok(IA.windowsLaunch('C:\\A b\\x.exe', '  -q ') === 'start "" "C:\\A b\\x.exe" -q' && IA.exeOfIcon('"C:\\x\\y.exe",-101') === 'C:\\x\\y.exe' && IA.exeOfIcon('C:\\x\\y.ico') === null, 'the launch-form builder and the DisplayIcon reader');

console.log('§2 the macOS listing (/Applications bundles → rows)');
const plist = (exe, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>${exe}</string>${extra}</dict></plist>`;
const quoted = 'Bob\'s "Quoted" $App `x` \\ y';
const mac = IA.parseMacListing([
  { path: '/Applications/JASP.app', plist: plist('JASP') },
  { path: `/Applications/${quoted}.app`, plist: plist('bob') },
  { path: '/Applications/Helper Agent.app', plist: plist('helper', '<key>LSBackgroundOnly</key><true/>') },
  { path: '/Applications/Binary.app', plist: 'bplist00\u0000\u0001' },
  { path: '/Users/m/Applications/JASP.app', plist: plist('JASP') },
  { path: '/Applications/notes.txt', plist: null }, null, { path: 5 }, { path: '/Applications/JASP.app/', plist: null },
], { now: 7 });
const mj = mac.rows.filter((r) => r.name === 'JASP');
ok(mj.length === 2 && mj.some((r) => r.launch === 'open -a "JASP"') && mj.some((r) => r.launch === 'open -a "/Users/m/Applications/JASP.app"') && mj.every((r) => r.source === 'applications' && r.seenAt === 7), 'JASP.app ⇒ `open -a "JASP"`; a second bundle of the same name opens by its path; the same bundle twice lists once', mj);
const q = mac.rows.find((r) => r.name === quoted);
ok(q && MD.desktopRunPlan('darwin', q.launch).ok, 'a name with quotes, $, a backquote and a backslash is offered (the run door accepts it)', q);
const echoed = q ? spawnSync('/bin/sh', ['-c', q.launch.replace(/^open -a /, 'printf %s ')], { encoding: 'utf8' }).stdout : null;
ok(echoed === quoted, 'a REAL sh reads the quoted name back character for character (nothing expands, nothing splits)', { echoed });
ok(!mac.rows.some((r) => r.name === 'Helper Agent') && mac.rows.some((r) => r.name === 'Binary') && !mac.rows.some((r) => /notes/.test(r.name)), 'a background-only bundle is not an app; a binary Info.plist still lists by its name; a non-bundle is skipped');
ok(IA.plistValue(plist('X', '<key>CFBundleName</key><string>A &amp; B</string>'), 'CFBundleName') === 'A & B' && IA.plistValue('bplist00', 'CFBundleName') === null, 'plistValue reads an XML plist, answers null for a binary one');

console.log('§3 the device lister (bounded; one encoded script on Windows; a real walk on a Mac-shaped home)');
{
  const seen = [];
  const fakeExec = (file, args, opts, cb) => { seen.push({ file, args, opts }); setImmediate(() => cb(null, WIN_DUMP, '')); };
  const r = await IA.listInstalled({ platform: 'win32', execFile: fakeExec, env: { PATH: 'x' }, now: () => 5000 });
  const enc = seen[0] && seen[0].args[seen[0].args.length - 1];
  const script = enc ? Buffer.from(enc, 'base64').toString('utf16le') : '';
  ok(r.ok && r.platform === 'win32' && r.rows.some((x) => x.name === 'JASP') && r.listedAt === 5000, 'win32: the rows of the script\'s output', { ok: r.ok, n: r.rows && r.rows.length });
  ok(seen.length === 1 && seen[0].file === 'powershell.exe' && seen[0].args.includes('-EncodedCommand') && seen[0].opts.timeout === IA.LIST_BUDGET_MS && seen[0].opts.maxBuffer === IA.LIST_MAX_BYTES && seen[0].opts.windowsHide === true && seen[0].opts.env.PATH === 'x', 'ONE PowerShell, -EncodedCommand, killed at the 20 s budget, stdout bounded, no console window, the daemon\'s spawn env');
  ok(script === IA.WIN_LIST_SCRIPT && /CommonStartMenu/.test(script) && /'StartMenu'/.test(script) && /WScript\.Shell/.test(script) && (script.match(/\\Uninstall\\\*/g) || []).length === 3 && /WOW6432Node/.test(script) && /HKCU:/.test(script), 'the script reads both Start Menus (.lnk through WScript.Shell) and the three Uninstall keys');
  const slow = await IA.listInstalled({ platform: 'win32', execFile: (f, a, o, cb) => setImmediate(() => cb(Object.assign(new Error('killed'), { killed: true, signal: 'SIGTERM' }), WIN_DUMP.split('\r\n').slice(0, 1).join('\n'), '')) });
  ok(slow.ok && slow.timedOut === true && slow.rows.length === 1, 'a script past its budget: what it printed is listed, `timedOut` says so');
  const dead = await IA.listInstalled({ platform: 'win32', execFile: (f, a, o, cb) => setImmediate(() => cb(new Error('spawn powershell.exe ENOENT'), '', '')) });
  ok(!dead.ok && dead.code === 'list_failed' && /ENOENT/.test(dead.error), 'no PowerShell ⇒ list_failed by name');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iapps-'));
  for (const [rel, exe] of [['Applications/JASP.app', 'JASP'], ['Applications/Utilities/Console Tool.app', 'ct'], ['Applications/Vendor Suite/Vendor Editor.app', 've']]) {
    fs.mkdirSync(path.join(home, rel, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(home, rel, 'Contents/Info.plist'), plist(exe));
  }
  fs.mkdirSync(path.join(home, 'Applications/.hidden.app'), { recursive: true });
  const m = await IA.listInstalled({ platform: 'darwin', home });
  ok(m.ok && J(m.rows.map((x) => x.name)) === J(['Console Tool', 'JASP', 'Vendor Editor']), 'darwin: ~/Applications walked one folder deep (a vendor folder, Utilities), a dot-folder skipped', m.rows && m.rows.map((x) => x.name));
  fs.rmSync(home, { recursive: true, force: true });
  const lin = await IA.listInstalled({ platform: 'linux' });
  ok(!lin.ok && lin.code === 'not_desktop_machine', 'any other platform ⇒ not_desktop_machine by name');
}

console.log('§4 the refresh rules + the hub judges the device\'s rows again');
{
  const T = 1e9, at = (ms) => ({ listedAt: T - ms, rows: [] });
  ok(IA.listDue(null, 'open', T) && !IA.listDue(at(60e3), 'open', T) && IA.listDue(at(IA.LIST_REFRESH_MS), 'open', T), 'open: never listed or 10 min old ⇒ list; a fresh list is served');
  ok(IA.listDue(at(1), 'recheck', T) && IA.listDue(at(1), 'install', T), 'Check again / an install through our door ⇒ always listed');
  ok(!IA.listDue(at(30e3), 'hello', T) && IA.listDue(at(IA.HELLO_FLOOR_MS), 'hello', T) && IA.listDue(null, 'hello', T), 'the daemon\'s hello ⇒ listed unless it listed within a minute (a flapping link)');
  const rows = IA.rowsFromDevice('win32', [{ name: 'JASP', launch: 'start "" "C:\\J\\JASP.exe"', source: 'start-menu', seenAt: 1 }, { name: 'Two', launch: 'a\nb', source: 'start-menu' }, { name: 'Odd', launch: 'x', source: 'elsewhere' }, { name: 5, launch: 'x', source: 'uninstall' }, null, { name: 'x'.repeat(400), launch: 'start "" "C:\\x.exe"', source: 'uninstall' }], 77);
  ok(rows.length === 2 && rows[0].seenAt === 77 && rows[1].name.length === 200, 'a device row keeps a string name (≤ 200), a launch the run door accepts, a known source; seenAt = the hub\'s time', rows);
  ok(IA.rowsFromDevice('win32', Array.from({ length: 600 }, (_, i) => ({ name: 'a' + i, launch: `start "" "C:\\a${i}.exe"`, source: 'start-menu' }))).length === IA.INSTALLED_MAX, 'the hub keeps at most 500 rows whatever the device sends');
}

console.log('§5 the device op: three touches + the capability gate');
const agentdSrc = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
const clientSrc = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
{
  const caps = (agentdSrc.match(/capabilities: \[([^\]]*)\]/) || [])[1] || '';
  ok(/'desktop-apps-list'/.test(caps), 'the hello-ack names desktop-apps-list (found by content)');
  ok(/if \(msg\.op === 'desktop-apps-list'\) \{[\s\S]{0,900}IA\.listInstalled\(\{ platform: process\.platform[\s\S]{0,300}op: 'desktop-apps-list-result', id: msg\.id/.test(agentdSrc), 'the daemon\'s handler runs THE shared lister and answers with the op on the reply');
  ok(/m\.op === 'desktop-apps-list-result'/.test(clientSrc), 'the client routes the reply by id (the op is in the routing set)');
  const methodOf = (src) => { const i = src.indexOf('  async desktopAppsList('); const j = src.indexOf('\n  }\n', i); return i < 0 || j < 0 ? null : (0, eval)(`(${src.slice(i, j + 4).trim().replace(/^async desktopAppsList\(/, 'async function desktopAppsList(')})`); };
  const run = async (fn, caps2) => { const sent = []; const fake = { connect: async () => ({ info: { capabilities: caps2 } }), _request: async (m) => { sent.push(m); return { op: 'desktop-apps-list-result', result: { ok: true, rows: [] } }; } }; let err = null, r = null; try { r = await fn.call(fake, {}); } catch (e) { err = e; } return { sent, err, r }; };
  const real = methodOf(clientSrc);
  const oldA = await run(real, ['probe', 'sysinfo']);
  ok(oldA.err && oldA.err.code === 'host_needs_daemon' && oldA.sent.length === 0, 'an agent without desktop-apps-list is NEVER asked: host_needs_daemon, no request sent');
  const newA = await run(real, ['desktop-apps-list']);
  ok(!newA.err && newA.sent.length === 1 && newA.sent[0].op === 'desktop-apps-list' && newA.r.ok, 'an agent with it is asked once');
  const noGate = methodOf(clientSrc.replace("if (!conn.info?.capabilities?.includes?.('desktop-apps-list')) { const e = new Error('daemon lacks desktop-apps-list (capabilities gate) -- upgrade the agent on this machine'); e.code = 'host_needs_daemon'; throw e; }", ''));
  const red = await run(noGate, ['probe']);
  ok(red.sent.length === 1, 'RED CONTROL: the gate removed ⇒ the old agent IS sent the op (an unknown op would hang it)', { sent: red.sent.length });
}

console.log('§6 the access layer: the cache, one listing at a time, the hello, an install, an old agent, a Linux machine');
const ACC = require(REPO + '/src/server/desktop-access.js');
{
  const store = { data: {}, installedOf(h) { return this.data[h] || null; }, noteInstalled(h, e) { if (e) this.data[h] = e; else delete this.data[h]; } };
  let calls = 0, gate = null;
  const dmFor = (platform, caps, rows) => ({
    status: () => ({ connected: true, info: { platform, capabilities: caps } }),
    desktopServe() { },
    async connect() { return { info: { capabilities: caps } }; },
    async _request(m) { calls++; if (gate) await gate; return { op: 'desktop-apps-list-result', result: { ok: true, platform, rows: typeof rows === 'function' ? rows() : rows, total: 3, truncated: false } }; },
  });
  const winRows = [{ name: 'JASP', launch: 'start "" "C:\\Program Files\\JASP\\JASP.exe"', source: 'start-menu', seenAt: 1 }, { name: 'Bad', launch: 'x\ny', source: 'start-menu' }];
  const DM = require(REPO + '/src/agentd/client.js').DeviceManager;
  const handles = { 'win-a': dmFor('win32', ['desktop-apps-list'], winRows), 'win-old': dmFor('win32', ['probe'], winRows), 'lin-a': dmFor('linux', ['desktop-apps-list'], []) };
  for (const h of Object.values(handles)) h.desktopAppsList = DM.prototype.desktopAppsList;
  let hook = null;
  const hosts = { get: (id) => (handles[id] ? { id, name: id } : null), isLocal: (id) => id === 'local', deviceBounded: async (id) => handles[id], addDialInHook: (fn) => { hook = fn; return () => { }; } };
  const quiet = { log() { }, warn() { } };
  const acc = ACC.create({ hosts, install: false, log: quiet, installedStore: () => store, helloListMs: 0 });
  const a1 = await acc.installedApps('win-a', { why: 'open' });
  ok(calls === 1 && a1.rows.length === 1 && a1.rows[0].name === 'JASP' && a1.platform === 'win32' && Number.isFinite(a1.listedAt) && store.data['win-a'].rows.length === 1, 'the first open lists the machine; the hub keeps the rows the run door accepts (the bad one dropped) with listedAt', a1);
  await acc.installedApps('win-a', { why: 'open' });
  ok(calls === 1, 'a second open within 10 min is served from the kept list (nothing sent)');
  let release; gate = new Promise((r) => { release = r; });
  const p1 = acc.installedApps('win-a', { why: 'recheck' }), p2 = acc.installedApps('win-a', { why: 'recheck' });
  await tick(); release(); await Promise.all([p1, p2]); gate = null;
  ok(calls === 2, 'Check again lists again — two at once share ONE listing', { calls });
  store.data['win-a'].listedAt -= IA.LIST_REFRESH_MS;
  await acc.installedApps('win-a', { why: 'open' });
  ok(calls === 3, 'a list older than 10 min is listed again when the dialog opens');
  hook('win-a'); await tick(); await tick();
  ok(calls === 3, 'the daemon\'s hello within a minute of a listing lists nothing (a flapping link)');
  store.data['win-a'].listedAt -= IA.HELLO_FLOOR_MS;
  hook('win-a'); await new Promise((r) => setTimeout(r, 20));
  ok(calls === 4, 'the daemon\'s hello lists the machine');
  const before = calls;
  acc.installedNow('win-a', 'TightVNC Server 2.8.85');
  const pend = store.data['win-a'].rows[0];
  ok(pend && pend.name === 'TightVNC Server 2.8.85' && pend.pending === true && pend.launch === null && pend.source === 'install', 'an install through our door is on the list AT ONCE (pending, nothing to press)', pend);
  await new Promise((r) => setTimeout(r, 20));
  ok(calls === before + 1 && !store.data['win-a'].rows.some((r) => r.pending), 'then the machine is listed and its own records replace the pending row');
  store.data['win-old'] = { platform: 'win32', rows: [{ name: 'Kept', launch: 'start "" "C:\\k.exe"', source: 'uninstall', seenAt: 1 }], total: 1, truncated: false, listedAt: 1 };
  const c0 = calls;
  const old = await acc.installedApps('win-old', { why: 'recheck' });
  ok(old.code === 'host_needs_daemon' && calls === c0 && old.rows.length === 1 && old.rows[0].name === 'Kept', 'an old agent: code host_needs_daemon, NOTHING sent, the list as it was', old);
  const lin = await acc.installedApps('lin-a', { why: 'open' }).then(() => null, (e) => e);
  ok(lin && lin.code === 'not_desktop_machine' && calls === c0, 'a Linux machine is refused by name (its apps are the launcher\'s), nothing sent');
  hook('lin-a'); await new Promise((r) => setTimeout(r, 20));
  ok(calls === c0, 'a Linux machine\'s hello lists nothing');
  const gone = await acc.installedApps('nope', { why: 'open' }).then(() => null, (e) => e);
  ok(gone && gone.code === 'unsupported-host', 'an unknown machine ⇒ unsupported-host by name');
  const loc = await acc.installedApps('local').then(() => null, (e) => e);
  ok(loc && loc.code === 'not_desktop_machine', 'this machine ⇒ not_desktop_machine (the Apps launcher lists it)');

  console.log('§6b the keeper keeps the lists in data/desktop-apps-hosts.json (beside the host records)');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-iapps-data-'));
  const K = require(REPO + '/src/server/desktop-app-keeper.js');
  fs.writeFileSync(path.join(dataDir, K.REMOTE_FILE), JSON.stringify({ hosts: { 'lin-x': { apps: {}, hub: {} } }, installed: { 'win-a': { platform: 'win32', rows: [{ name: 'JASP', launch: 'start "" "C:\\J.exe"', source: 'start-menu', seenAt: 1 }], total: 1, truncated: false, listedAt: 5 } } }));
  let k = null;
  try { k = K.create({ dataDir, env: () => ({}), broadcast() { }, log: quiet, tickMs: 3600e3 }); } catch (e) { ok(false, 'a keeper on a scratch data dir', e.message); }
  if (k) {
    ok(k.installedOf('win-a') && k.installedOf('win-a').rows[0].name === 'JASP' && k.installedOf('lin-x') === null, 'a restarted hub reads the kept list back (and a host record is not a list)');
    k.noteInstalled('mac-b', { platform: 'darwin', rows: [], total: 0, truncated: false, listedAt: 9 });
    const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, K.REMOTE_FILE), 'utf8'));
    ok(onDisk.installed['mac-b'].listedAt === 9 && onDisk.installed['win-a'] && onDisk.hosts['lin-x'] && !onDisk.hosts['mac-b'], 'noteInstalled writes the file: the list beside the host records, never a host row');
    try { k.shutdown?.(); k.stopTimers?.(); } catch { /* none */ }
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log('§7 the route: people only, fresh=1 = Check again');
{
  const express = require(REPO + '/node_modules/express');
  const R = require(REPO + '/src/routes/desktop-apps.js');
  const seen = [];
  R.setup({ keeper: {}, access: { installedApps: async (h, o) => { seen.push([h, o.why]); return { hostId: h, rows: [], total: 0, truncated: false, listedAt: 1 }; } }, vnc: {} });
  const app = express(); app.use(express.json()); app.use(R.router);
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${srv.address().port}/api/desktop/machine-desktop/apps`;
  const a = await fetch(base + '?host=win-a'); const b = await fetch(base + '?host=win-a&fresh=1');
  const c = await fetch(base + '?host=win-a', { headers: { Authorization: 'Bearer vsst_x' } });
  ok(a.status === 200 && b.status === 200 && J(seen) === J([['win-a', 'open'], ['win-a', 'recheck']]), 'GET …/apps?host= ⇒ open; &fresh=1 ⇒ recheck', seen);
  ok(c.status === 403 && (await c.json()).code === 'human_only' && seen.length === 2, 'an agent token is refused human_only before the machine is asked');
  srv.close();
}

console.log('§8 the dialog: installed list + filter + keyed rows + Examples / Recent + the update words; the action-row rule');
{
  const esbuild = require(REPO + '/node_modules/esbuild');
  const STUBS = {
    './i18n.js': 'export const t = (s, p) => String(s).replace(/\\{(\\w+)\\}/g, (m, k) => (p && k in p ? String(p[k]) : m)); export const tc = (c, s, p) => t(s, p);',
    './utils.js': 'export const createModalShell = (o) => globalThis.__shell(o); export const fetchJson = (u, o) => globalThis.__fetch(u, o); export const showToast = (m, o) => globalThis.__toasts.push(m); export const copyText = () => Promise.resolve();', // + copyText: lane remoteapp-r1b's settings card (imported by the dialog)
    './window-types.js': 'export const registerWindowType = () => {}; export const svgIcon16 = () => "";',
    './vnc-view.js': 'export const createVncView = () => ({ connect() {}, dispose() {} }); export const streamUrl = (u) => u;',
    './picture-shell.js': 'export const pageIsSecure = () => false;', // lane desktop-v2-latency: the strip's keyboard-lock gate (the real one imports utils.js)
  };
  // (and for src/lib/desktop-picker.js — lane desktop-v2-entry: the strip's machine ▾ opens the Desktop picker)
  // the same four stubs for src/lib/machine-app.js (machine-app-crop's "Run as its own window…" module the dialog imports — the real
  // utils.js wires document-level tooltips at load)
  const out = await esbuild.build({ entryPoints: [path.join(REPO, 'src/lib/machine-desktop.js')], bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\/(i18n|utils|window-types|vnc-view|picture-shell)\.js$/ }, (a) => (/(machine-(desktop|app)|desktop-picker|remoteapp-card)\.js$/.test(a.importer) ? { path: a.path, namespace: 'stub' } : null)); b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' })); } }] });
  class N {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parent = null; this.style = { cssText: '' }; this.attrs = {}; this.className = ''; this._text = ''; this.hidden = false; this.disabled = false; this.value = ''; this.title = '';
      this.classList = { toggle: (c, on) => { const s = new Set(this.className.split(/\s+/).filter(Boolean)); if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); this.className = [...s].join(' '); }, contains: (c) => this.className.split(/\s+/).includes(c) }; }
    append(...xs) { for (const x of xs) { if (x == null) continue; const n = typeof x === 'string' ? Object.assign(new N('#text'), { _text: x }) : x; if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = this; this.children.push(n); } }
    appendChild(x) { this.append(x); return x; }
    replaceChildren(...xs) { for (const c of this.children) c.parent = null; this.children = []; this.append(...xs); }
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
    get firstChild() { return this.children[0] || null; } get lastChild() { return this.children[this.children.length - 1] || null; }
    set textContent(v) { for (const c of this.children) c.parent = null; this.children = []; this._text = String(v); } get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    get isConnected() { let n = this; while (n.parent) n = n.parent; return n === ROOT; }
    focus() { this.focused = true; }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); } // machine-app-crop's Run as its own window… listens on the command box
    get listeners() { return this._ls || (this._ls = {}); }
    find(cls) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.className.split(/\s+/).includes(cls)) out.push(c); walk(c); } }; walk(this); return out; }
  }
  const ROOT = new N('root');
  const ls = { 'vibespace.machineDesktopRuns': JSON.stringify({ 'win-a': ['start "" notepad'] }) };
  globalThis.document = { createElement: (t) => new N(t) };
  globalThis.localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } };
  globalThis.__toasts = [];
  globalThis.__shell = () => { const body = new N('div'); ROOT.append(body); return { body, close: () => body.remove() }; };
  let answer = null; const asked = [];
  globalThis.__fetch = async (u) => { asked.push(u); return typeof answer === 'function' ? answer(u) : answer; };
  const mod = { exports: {} }; new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  const { showMachineDesktopDialog } = mod.exports;
  const JR = { name: 'JASP', launch: 'start "" "C:\\Program Files\\JASP\\JASP.exe"', source: 'start-menu', seenAt: 1 };
  const ZR = { name: '7-Zip', launch: 'start "" "C:\\Program Files\\7-Zip\\7zFM.exe"', source: 'uninstall', seenAt: 1 };
  answer = { hostId: 'win-a', platform: 'win32', rows: [ZR, JR], total: 2, truncated: false, listedAt: 1 };
  const m = { hostId: 'win-a', label: 'WIN-DESK1', code: 'no_vnc', setup: 'win32', desktop: 'vnc-native', selectable: true };
  let rechecks = 0;
  showMachineDesktopDialog({}, m, { install: () => { }, recheck: async () => { rechecks++; return m; } });
  const body = ROOT.children[ROOT.children.length - 1];
  ok(body.find('machine-apps-note')[0].textContent === 'Listing the apps on WIN-DESK1…', 'the dialog opens saying it is listing the machine');
  await tick(); await tick();
  ok(asked[0] === '/api/desktop/machine-desktop/apps?host=win-a', 'it asks the kept list (no fresh) when it opens', asked);
  const rowsNow = () => body.find('machine-apps-row').filter((b) => b.parent && !b.parent.hidden);
  const title = body.find('machine-apps-title')[0];
  ok(title.textContent === 'Installed on WIN-DESK1 (2)' && J(rowsNow().map((b) => b.firstChild.textContent)) === J(['7-Zip', 'JASP']) && rowsNow()[1].lastChild.textContent === 'Start menu' && rowsNow()[0].lastChild.textContent === 'Installed programs', '"Installed on WIN-DESK1 (2)": each row = its name + where Windows keeps it');
  const jaspNode = rowsNow()[1];
  const btnOf = (w) => { const out = []; const walk = (n) => { for (const c of n.children) { if (c.tagName === 'BUTTON' && c.textContent === w) out.push(c); walk(c); } }; walk(body); return out; };
  const [winB] = btnOf('Run as its own window…'), [runB] = btnOf('Run…');
  const before = [winB && winB.className, runB && runB.className];
  jaspNode.onclick();
  const input = body.find('machine-desktop-cmd')[0];
  ok(input.value === JR.launch && input.focused, 'a press fills the command box with the row\'s launch line (the run door judges it on Run…)');
  // int251 (with machine-app-crop): a press on an installed row picks the run's default the way a preset chip does — JASP's
  // `start "" …` line names a GUI app, so "Run as its own window…" becomes the filled button (an empty box: Run…)
  ok(J(before) === J(['file-tool-btn', 'btn-create']) && winB.className === 'btn-create' && runB.className === 'file-tool-btn', 'a press on an installed row makes "Run as its own window…" the default for its GUI line (as a preset chip does)', [before, winB && winB.className, runB && runB.className]);
  const filter = body.find('machine-apps-filter')[0];
  filter.value = 'jas'; filter.oninput();
  ok(rowsNow().length === 1 && rowsNow()[0] === jaspNode, 'the filter narrows by name (the same node)');
  filter.value = 'zzz'; filter.oninput();
  ok(body.find('machine-apps-list')[0].hidden && body.find('machine-apps-note')[0].textContent === 'Nothing matches “zzz”', 'a filter that matches nothing says so');
  filter.value = ''; filter.oninput();
  ok(rowsNow().length === 2 && rowsNow()[1] === jaspNode, 'clearing the filter brings back the SAME nodes (a filtered-out row is detached, never rebuilt)');
  const groups = body.find('machine-apps-group').map((g) => g.textContent);
  ok(groups.length === 2 && groups[0] === 'Recentstart "" notepad' && groups[1] === 'ExamplesBlender', 'the owner\'s own lines stay as "Recent", the presets as "Examples"', groups);
  answer = { hostId: 'win-a', platform: 'win32', rows: [{ name: 'Blender', launch: 'start "" "C:\\B\\blender.exe"', source: 'start-menu', seenAt: 2 }, ZR, JR], total: 3, truncated: false, listedAt: 2 };
  const checkBtn = body.find('file-tool-btn').find((b) => b.textContent === 'Check again');
  const acts = body.find('desktop-install-actions')[0];
  ok(acts && J(acts.children.map((b) => b.textContent)) === J(['Install TightVNC Server…', 'Check again', 'RemoteApp settings…']), 'the action row: Install…, Check again and (a Windows machine, lane remoteapp-r1b) RemoteApp settings… — the CSS rule below keeps each whole');
  await checkBtn.onclick(); await tick();
  ok(asked[asked.length - 1] === '/api/desktop/machine-desktop/apps?host=win-a&fresh=1' && rechecks === 1, 'Check again re-reads the machine row AND lists its apps again (fresh)');
  ok(J(rowsNow().map((b) => b.firstChild.textContent)) === J(['Blender', '7-Zip', 'JASP']) && rowsNow()[2] === jaspNode, 'a re-list moves the existing row nodes (keyed by the launch line), never rebuilds them');
  answer = { hostId: 'win-a', platform: 'win32', rows: [ZR], total: 1, truncated: false, listedAt: 2, code: 'host_needs_daemon', error: 'x' };
  await checkBtn.onclick(); await tick();
  const note = body.find('machine-apps-note')[0];
  ok(note.textContent === 'The list needs WIN-DESK1’s VibeSpace agent updated (it updates itself; check again in a minute)' && note.classList.contains('is-bad') && rowsNow().length === 1 && !jaspNode.parent, 'an old agent: the update words, the list as it was; a row gone from the list is removed');
  answer = { hostId: 'win-a', platform: 'win32', rows: Array.from({ length: 500 }, (_, i) => ({ name: 'A' + i, launch: `start "" "C:\\a${i}.exe"`, source: 'start-menu', seenAt: 3 })), total: 812, truncated: true, listedAt: 3 };
  await checkBtn.onclick(); await tick();
  ok(note.textContent === 'WIN-DESK1 has 812 apps — the first 500 are listed; filter to find one', 'a machine past the cap says how many it has');
  answer = { hostId: 'win-a', platform: 'win32', rows: [{ name: 'TightVNC Server 2.8.85', launch: null, source: 'install', pending: true, seenAt: 4 }], total: 1, truncated: false, listedAt: 4 };
  await checkBtn.onclick(); await tick();
  ok(rowsNow().length === 1 && rowsNow()[0].disabled && rowsNow()[0].lastChild.textContent === 'just installed — being listed', 'a just-installed (pending) row shows, greyed, until the machine lists it');

  const css = fs.readFileSync(path.join(REPO, 'public/style.css'), 'utf8');
  const rule = (src) => { const row = /\.desktop-install-actions \{([^}]*)\}/.exec(src); const btn = /\.desktop-install-actions > button \{([^}]*)\}/.exec(src); const icon = /\.desktop-install-actions > \.file-tool-btn \{([^}]*)\}/.exec(src); return !!(row && /flex-wrap:\s*wrap/.test(row[1]) && btn && /flex:\s*none/.test(btn[1]) && /white-space:\s*nowrap/.test(btn[1]) && icon && /width:\s*auto/.test(icon[1])); };
  ok(rule(css), 'the action row wraps and a button is never narrower than its words (flex: none; white-space: nowrap; the 24 px icon-button class sized by its words there)');
  ok(!rule('.desktop-install-actions { display: flex; gap: 8px; justify-content: flex-end; }'), 'RED CONTROL: the base rule (no wrap, shrinkable buttons — the owner\'s column of characters) fails it');
}

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed${fail ? ', ' + fail + ' failed' : ''})`);
process.exit(fail ? 1 : 0);
