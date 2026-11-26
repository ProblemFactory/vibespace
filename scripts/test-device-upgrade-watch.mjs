#!/usr/bin/env node
// A STUCK DEVICE-AGENT UPGRADE REACHES THE USER (lane device-upgrade-stuck, 2026-10-03). The owner's Windows machine sat
// on agent 2.369.199 after the hub gave up upgrading it (3 attempts, a journal line, an event — `_onUpgradeStuck` was
// never assigned), and every command read "exit 1". src/server/device-upgrade-watch.js is the ONE door every transport
// passes (hosts.onAgentUpgrade): ONE For-you item per (machine, expected version) under origin `machines`, the machine
// row's `agentUpgrade` fact, both retracted when the device reports the version. Over the REAL UserTodoManager and the
// REAL HostManager.list(), in-process. Controls are patched copies (scripts/mutant-copy.mjs).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const DW = require('../src/server/device-upgrade-watch.js');
const { UserTodoManager } = require('../src/user-todos.js');
const { INBOX_ORIGINS } = require('../src/inbox-origin.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dus-'));
const WIN = { platform: 'win32', capabilities: ['probe', 'sysinfo'] };
const world = (Watch = DW, dir = fs.mkdtempSync(path.join(SCR, 'w-'))) => {
  const todos = new UserTodoManager({ dataDir: dir });
  let bc = 0;
  const w = Watch.create({ userTodos: todos, dataDir: dir, log: () => {}, bcast: () => { bc++; } });
  const open = () => todos._state.items.filter((t) => t.status === 'open' && t.sessionKey === 'machines');
  return { dir, todos, w, open, bc: () => bc };
};

console.log('— PURE: what no longer works, the words —');
ok(DW.lostOf(WIN) === 'commands' && DW.lostOf({ platform: 'win32', capabilities: ['run-shell'] }) === null && DW.lostOf({ platform: 'linux', capabilities: [] }) === null && DW.lostOf({}) === null, 'lostOf: running commands is lost ONLY on a Windows agent without run-shell (unknown ⇒ nothing claimed)');
{
  const it = DW.itemOf({ machine: 'WIN-DESK1', from: '2.369.199', to: '2.369.201', lost: 'commands' });
  ok(it.text === 'WIN-DESK1: its agent could not update (2.369.199 → 2.369.201)', 'the item names the machine and from → to', it.text);
  ok(/from 2\.369\.199 to 2\.369\.201/.test(it.detail) && /running commands \(vibespace-exit run\)/.test(it.detail) && /rerun the device's install command \(Remote → WIN-DESK1 → Pairing command\)/.test(it.detail) && /resolves itself when the device reports 2\.369\.201/.test(it.detail), '…the detail: the attempts, what no longer works, the one step, that it resolves itself', it.detail);
  ok(it.i18n.text.key.includes('{machine}') && it.i18n.detail.length === 3, '…and the same words as structure (the client words them per device)');
  ok(!/running commands/.test(DW.itemOf({ machine: 'm', from: '1', to: '2', lost: null }).detail), '…an agent whose loss is unknown claims none');
}

console.log('— the door: one item per (machine, version), the row, self-resolve —');
{
  const { w, todos, open, dir } = world();
  const r1 = w.stuck({ hostKey: 'host-dial-WIN-DESK1', machine: 'WIN-DESK1', from: '2.369.199', to: '2.369.201', ...WIN });
  const o1 = open();
  ok(r1 && r1.filed && o1.length === 1 && o1[0].origin === 'machines' && INBOX_ORIGINS.includes(o1[0].origin) && o1[0].urgency === 'high', 'DUS-W1: a stuck upgrade files ONE For-you item (origin machines, high — commands are lost)', o1);
  ok(JSON.stringify(w.rowOf('host-dial-WIN-DESK1')) === JSON.stringify({ from: '2.369.199', to: '2.369.201', at: w.ledger()['host-dial-WIN-DESK1'].at, lost: 'commands' }), 'DUS-W2: the row fact {from, to, at, lost} for the machine row\'s line', w.rowOf('host-dial-WIN-DESK1'));
  w.stuck({ hostKey: 'host-dial-WIN-DESK1', machine: 'WIN-DESK1', from: '2.369.199', to: '2.369.201', ...WIN }); // the 10-min retry cycle gave up again
  ok(open().length === 1, 'DUS-W3: the same (machine, version) gives up again — still ONE item');
  todos.setStatus(o1[0].id, 'dismissed', 'user');
  w.stuck({ hostKey: 'host-dial-WIN-DESK1', machine: 'WIN-DESK1', from: '2.369.199', to: '2.369.201', ...WIN });
  ok(open().length === 0, 'DUS-W4: an item the user dismissed is not re-filed for the same version');
  const w2 = DW.create({ userTodos: todos, dataDir: dir, log: () => {} }); // a hub restart: the ledger is on disk
  w2.stuck({ hostKey: 'host-dial-WIN-DESK1', machine: 'WIN-DESK1', from: '2.369.199', to: '2.369.201', ...WIN });
  ok(open().length === 0 && w2.rowOf('host-dial-WIN-DESK1').to === '2.369.201', 'DUS-W5: after a restart the same give-up files nothing new; the row fact survives');
  w2.stuck({ hostKey: 'host-dial-WIN-DESK1', machine: 'WIN-DESK1', from: '2.369.199', to: '2.369.203', ...WIN });
  ok(open().length === 1 && /2\.369\.199 → 2\.369\.203/.test(open()[0].text) && w2.rowOf('host-dial-WIN-DESK1').to === '2.369.203', 'DUS-W6: RE-ARMED when a newer expected version fails too', open().map((t) => t.text));
  const third = w2.stuck({ hostKey: 'host-dial-WIN-DESK1', machine: 'WIN-DESK1', from: '2.369.199', to: '2.369.204', ...WIN });
  const all = todos._state.items.filter((t) => t.sessionKey === 'machines');
  ok(third.filed && open().length === 1 && all.some((t) => /→ 2\.369\.203/.test(t.text) && t.status === 'done'), 'DUS-W7: …and the superseded item is retracted (one open item per machine)', all.map((t) => [t.text, t.status]));
  ok(w2.matched({ hostKey: 'host-dial-WIN-DESK1', version: '2.369.204' }) === true && open().length === 0 && w2.rowOf('host-dial-WIN-DESK1') === null, 'DUS-W8: the device reports the version — the item resolves itself (system) and the row line goes away');
  const done = todos._state.items.find((t) => /→ 2\.369\.204/.test(t.text));
  ok(done && done.status === 'done', '…retracted as done (by the watch, not the user)', done);
  ok(w2.matched({ hostKey: 'host-dial-WIN-DESK1', version: '2.369.204' }) === false && w2.stuck({ hostKey: 'x', machine: 'm', from: '<b>', to: '2' }) === null && w2.stuck({ hostKey: 'x', machine: 'm', from: '2', to: '2' }) === null, 'DUS-W9: nothing to resolve ⇒ no-op; a version off the shape or from === to ⇒ nothing filed');
  const lin = world();
  lin.w.stuck({ hostKey: 'ssh-1', machine: 'box', from: '2.369.100', to: '2.369.201', platform: 'linux', capabilities: [] });
  ok(lin.open().length === 1 && lin.open()[0].urgency === 'normal' && !/running commands/.test(lin.open()[0].detail), 'DUS-W10: a Linux agent stuck: the item says nothing it cannot know (normal urgency)', lin.open());
}

console.log('— the /api/hosts row carries it (the REAL HostManager.list) —');
{
  const dir = fs.mkdtempSync(path.join(SCR, 'h-'));
  fs.writeFileSync(path.join(dir, 'hosts.json'), JSON.stringify({ hosts: [{ id: 'host-dial-W', name: 'W', transport: 'dial', deviceId: 'W' }, { id: 'ssh-1', name: 'box', host: 'b', user: 'u', port: 22 }] }));
  const { HostManager } = require('../src/hosts.js');
  const hm = new HostManager({ dataDir: dir });
  const { w } = world();
  hm.agentUpgradeOf = (id) => w.rowOf(id);
  w.stuck({ hostKey: 'host-dial-W', machine: 'W', from: '1.0.0', to: '1.0.1', ...WIN });
  const rows = hm.list();
  ok(rows.find((h) => h.id === 'host-dial-W').agentUpgrade?.from === '1.0.0' && !('agentUpgrade' in rows.find((h) => h.id === 'ssh-1')), 'DUS-W11: hosts.list() puts `agentUpgrade` on the stuck machine\'s row only', rows.map((h) => [h.id, h.agentUpgrade || null]));
  hm.onAgentUpgrade = (e, f) => w.onAgentUpgrade(e, f);
  hm.onAgentUpgrade('matched', { hostKey: 'host-dial-W', version: '1.0.1' });
  ok(!('agentUpgrade' in hm.list().find((h) => h.id === 'host-dial-W')), '…and drops it once the device reports the version');
}

console.log('— controls (patched copies) —');
{
  const M = mutantCopies('dus', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/device-upgrade-watch.js'), 'utf8');
  const mutA = editAnchor(src, 'if (prev && prev.to === t) {', 'if (false) {', "src/server/device-upgrade-watch.js");
  ok(mutA !== src, '(a) the patch applies');
  const A = world(M.load('src/server/device-upgrade-watch.js', mutA, 'nodedupe'));
  A.w.stuck({ hostKey: 'k', machine: 'm', from: '1.0.0', to: '1.0.1', ...WIN }); A.todos.setStatus(A.open()[0].id, 'dismissed', 'user');
  A.w.stuck({ hostKey: 'k', machine: 'm', from: '1.0.0', to: '1.0.1', ...WIN });
  ok(A.open().length === 1, 'CONTROL (a): without the (machine, version) rule a dismissed item comes back at every give-up — DUS-W4 goes red');
  const mutB = editAnchor(src, '    retract(rec); delete ledger[key]; save();', '    delete ledger[key]; save();', "src/server/device-upgrade-watch.js");
  ok(mutB !== src, '(b) the patch applies');
  const B = world(M.load('src/server/device-upgrade-watch.js', mutB, 'noretract'));
  B.w.stuck({ hostKey: 'k', machine: 'm', from: '1.0.0', to: '1.0.1', ...WIN }); B.w.matched({ hostKey: 'k', version: '1.0.1' });
  ok(B.open().length === 1, 'CONTROL (b): a match that does not retract leaves the item open after the device updated — DUS-W8 goes red');
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 2, label: 'mutant-copy (device-upgrade-watch): ' })) ok(r.pass, r.name, r.detail);
}
console.log('— lane win-upgrade-pipe: a device that never dials back after its upgrade began (fake clock) —');
{
  let clock = 1_000_000;
  const gw = (Watch = DW, dir = fs.mkdtempSync(path.join(SCR, 'g-'))) => {
    const todos = new UserTodoManager({ dataDir: dir, now: () => clock });
    const lines = [];
    const w = Watch.create({ userTodos: todos, dataDir: dir, log: (l) => lines.push(l), now: () => clock, tickMs: 0 });
    const open = () => todos._state.items.filter((t) => t.status === 'open' && t.sessionKey === 'machines');
    return { dir, todos, w, open, lines };
  };
  const K = 'host-dial-WIN-DESK1';
  const { w, todos, open, dir, lines } = gw();
  ok(w.onAgentUpgrade('answered', { hostKey: K, version: '2.369.204' }) === false && w.onAgentUpgrade('begun', { hostKey: K, machine: 'WIN-DESK1', from: '2.369.204', to: '2.369.205' }) === true, 'GONE-1: the door takes `begun` (the hub started an upgrade) and `answered` (any hello)');
  clock += 60_000; w.sweep();
  ok(open().length === 0, 'GONE-2: one minute of silence files nothing (a healthy device re-dials within seconds; the Linux box: 17 s)');
  clock += DW.GONE_AFTER_MS; w.sweep(); w.sweep();
  const o = open();
  ok(o.length === 1 && o[0].origin === 'machines' && o[0].urgency === 'high' && o[0].text === 'WIN-DESK1 stopped answering after its upgrade to 2.369.205 began — rerun its install command (Remote → WIN-DESK1 → Pairing command)', 'GONE-3: silent past the deadline ⇒ ONE For-you item in the brief\'s words (two sweeps, still one)', o.map((t) => t.text));
  ok(o[0] && o[0].i18n && o[0].i18n.text.key.includes('{machine}') && /resolves itself when it connects again/.test(o[0].detail) && lines.some((l) => /no dial-in \d+ s after its upgrade to 2\.369\.205 began — told the user/.test(l)), '…with the words as structure, the self-resolve promise, and a journal line');
  const w2 = DW.create({ userTodos: todos, dataDir: dir, log: () => {}, now: () => clock, tickMs: 0 }); // a hub restart
  w2.sweep();
  ok(open().length === 1, 'GONE-4: a hub restart files nothing new (the record is on disk)');
  ok(w2.answered({ hostKey: K, version: '2.369.205' }) === true && open().length === 0 && todos._state.items.find((t) => t.id === o[0].id).status === 'done', 'GONE-5: the device dials in — the item resolves itself (done, by the watch)');
  w2.begun({ hostKey: K, machine: 'WIN-DESK1', from: '2.369.204', to: '2.369.205' }); clock += DW.GONE_AFTER_MS + 1; w2.sweep();
  ok(open().length === 0, 'GONE-6: ONE item per (machine, version) — the same version going silent again files no second one');
  w2.begun({ hostKey: K, machine: 'WIN-DESK1', from: '2.369.205', to: '2.369.206' }); clock += DW.GONE_AFTER_MS + 1; w2.sweep();
  ok(open().length === 1 && /2\.369\.206/.test(open()[0].text), 'GONE-7: a newer version going silent files again');
  const p = gw(); p.w.begun({ hostKey: 'k', machine: 'm', from: '1.0.0', to: '1.0.1' });
  const w3 = DW.create({ userTodos: p.todos, dataDir: p.dir, log: () => {}, now: () => clock, tickMs: 0 }); // restart INSIDE the window
  clock += DW.GONE_AFTER_MS + 1; w3.sweep();
  ok(p.open().length === 1, 'GONE-8: a deadline armed before a hub restart still fires after it (persisted)');
  const q = gw(); q.w.begun({ hostKey: 'k', machine: 'm', from: '1.0.0', to: '1.0.1' }); clock += 17_000; q.w.answered({ hostKey: 'k', version: '1.0.1' }); clock += DW.GONE_AFTER_MS; q.w.sweep();
  ok(q.open().length === 0 && Object.keys(q.w.gone()).length === 0, 'GONE-9: the healthy shape (back in 17 s) files nothing and leaves no record');
  const wsrc = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  ok(/try \{ this\._onAnswer\?\.\(msg\.daemonVersion\); \} catch \{ \}/.test(wsrc('src/agentd/client.js')) && /this\._onUpgradeBegin\?\.\(msg\.daemonVersion, expected/.test(wsrc('src/agentd/client.js')) && wsrc('src/server/dial-pairing.js').includes("hosts.onAgentUpgrade?.('begun', {") && wsrc('src/server/dial-pairing.js').includes("hosts.onAgentUpgrade?.('answered', {") && wsrc('src/hosts.js').includes("this.onAgentUpgrade?.('begun', {"), 'GONE-10: every hello and every upgrade start reach the door (client.js → dial-pairing / hosts)');
  // CONTROLS (patched copies)
  const M = mutantCopies('dusg', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/server/device-upgrade-watch.js'), 'utf8');
  const mC = editAnchor(src, '    const had = !!g.itemId;\n    retract(g);', '    const had = !!g.itemId;', "src/server/device-upgrade-watch.js");
  const mD = editAnchor(src, "if (g.filedFor === g.to) {", 'if (false) {', "src/server/device-upgrade-watch.js");
  const mE = editAnchor(src, "event === 'begun' ? begun(facts) : ", '', "src/server/device-upgrade-watch.js");
  ok(mC !== src && mD !== src && mE !== src, '(c/d/e) the patches apply');
  const C = gw(M.load('src/server/device-upgrade-watch.js', mC, 'noresolve')); C.w.begun({ hostKey: 'k', machine: 'm', from: '1', to: '2' }); clock += DW.GONE_AFTER_MS + 1; C.w.sweep(); C.w.answered({ hostKey: 'k' });
  ok(C.open().length === 1, 'CONTROL (c): an answer that does not retract leaves the item open after the device came back — GONE-5 red');
  const D = gw(M.load('src/server/device-upgrade-watch.js', mD, 'nodedupe')); D.w.begun({ hostKey: 'k', machine: 'm', from: '1', to: '2' }); clock += DW.GONE_AFTER_MS + 1; D.w.sweep(); D.w.answered({ hostKey: 'k' }); D.w.begun({ hostKey: 'k', machine: 'm', from: '1', to: '2' }); clock += DW.GONE_AFTER_MS + 1; D.w.sweep();
  ok(D.open().length === 1, 'CONTROL (d): without the (machine, version) rule the same version is filed again (the store reopens the resolved item) — GONE-6 red');
  const E = gw(M.load('src/server/device-upgrade-watch.js', mE, 'nobegun')); E.w.onAgentUpgrade('begun', { hostKey: 'k', machine: 'm', from: '1', to: '2' }); clock += DW.GONE_AFTER_MS + 1; E.w.sweep();
  ok(E.open().length === 0, 'CONTROL (e): the pre-fix door (no `begun`) — a device that never came back files nothing: the incident\'s silence (GONE-3 red)');
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: 'mutant-copy (device-upgrade-watch gone): ' })) ok(r.pass, r.name, r.detail);
}
// lane device-bundle-signing (design q-042 D2): a device REFUSED the bundle (its release signature did not check) — the same
// door, ONE URGENT item per (device, version, code) over the REAL UserTodoManager; this hub's own unsigned build = the row only
console.log('— a REFUSED upgrade: one urgent item per (device, version, code); an unsigned hub build: the row only —');
{
  const R = world();
  const f = { hostKey: 'host-dial-M', machine: 'MacBook', from: '2.369.312', to: '2.369.313', code: 'bad-signature', keyId: '0123456789abcdef', by: 'system:device-upgrade' };
  const a = R.w.onAgentUpgrade('refused', f), b = R.w.onAgentUpgrade('refused', f);
  const o = R.open();
  ok(a.filed && !b.filed && o.length === 1 && o[0].urgency === 'urgent' && o[0].origin === 'machines' && /MacBook REFUSED an agent update \(2\.369\.312 → 2\.369\.313\)/.test(o[0].text) && o[0].detail.includes('bad-signature (key 0123456789abcdef)'), 'REF-1: a refusal files ONE urgent item (machines), named machine / from → to / code / key; the same refusal again files nothing', o.map((t) => [t.urgency, t.text]));
  R.w.onAgentUpgrade('refused', { ...f, code: 'unknown-key' });
  ok(R.open().length === 2 && R.w.rowOf('host-dial-M').refused === 'unknown-key' && R.open().some((t) => /\(unknown-key\)$/.test(t.text)), 'REF-2: another code for the same device is another fact (a second item, its title names the code; the older one stays open)', R.open().map((t) => t.text));
  R.w.onAgentUpgrade('matched', { hostKey: 'host-dial-M', version: '2.369.313' });
  ok(R.w.rowOf('host-dial-M') === null && R.open().length === 2, 'REF-3: a later match drops the row, never the refusal items (a fact, not a state)');
  const u = R.w.onAgentUpgrade('refused', { hostKey: 'host-dial-U', machine: 'Box', from: '1.0.0', to: '1.0.1', code: 'unsigned-local-build' });
  ok(!u.filed && R.open().length === 2 && R.w.rowOf('host-dial-U').unsigned === true, 'REF-4: this hub\'s own unsigned build — the machine row says so, no item');
  const src = fs.readFileSync(path.join(REPO, 'src/server/device-upgrade-watch.js'), 'utf8');
  const mR = editAnchor(src, "event === 'refused' ? refused(facts) : ", '', "src/server/device-upgrade-watch.js");
  ok(mR !== src, '(r) the patch applies');
  const MR = mutantCopies('dus-ref', REPO);
  const X = world(MR.load('src/server/device-upgrade-watch.js', mR, 'norefused'));
  X.w.onAgentUpgrade('refused', f);
  ok(X.open().length === 0, 'CONTROL (r): a door without `refused` files nothing for a bad signature — REF-1 red');
}
console.log('— B-f276 (主开发 r4718): device-upgrades.json UNDER THE STORE-READ LAW — held when unreadable, kept aside once when torn, healed at the next good read —');
{
  const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
  // the unreadable file is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path, the next read only) —
  // never a mode change or a mount; torn bytes are bytes written whole that do not parse
  const placeReads = (file, n = 1) => { const f = path.resolve(file), realS = fs.readFileSync, seen = { n: 0 };
    fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen.n < n) { seen.n++; throw EIO(); } return realS.call(this, p, ...a); };
    return { seen, restore: () => { fs.readFileSync = realS; } }; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MH = mutantCopies('dus-held', REPO);
  const S = { hostKey: 'host-dial-HB1', machine: 'HB1', from: '2.369.199', to: '2.369.201', ...WIN };
  /** life one: a stuck update filed and recorded, and a pending deadline (another device) — on disk */
  const lifeOne = (Mod = DW) => { const a = world(Mod); a.w.stuck(S); a.w.begun({ hostKey: 'host-dial-HB2', machine: 'HB2', from: '2.369.199', to: '2.369.201' }); a.w.stop();
    const file = path.join(a.dir, 'device-upgrades.json'); return { ...a, file, bytes: fs.readFileSync(file, 'utf8'), itemId: a.open()[0].id }; };
  /** a held life: the same folder, its read refused once */
  const heldLife = (Mod, a, lines = []) => { const pr = placeReads(a.file); let w = null; try { w = Mod.create({ userTodos: a.todos, dataDir: a.dir, log: (l) => lines.push(l), tickMs: 0 }); } finally { pr.restore(); } return { w, lines, seen: pr.seen.n }; };
  const events = (w) => { const r1 = w.stuck({ ...S, to: '2.369.203' }); const m1 = w.matched({ hostKey: 'host-dial-HB1', version: '2.369.201' });   // a NEWER version gave up; the old one landed
    w.begun({ hostKey: 'host-dial-HB3', machine: 'HB3', to: '2.369.201' }); w.answered({ hostKey: 'host-dial-HB2' }); w.sweep(); return { r1, m1 }; };
  const alerted = [];
  const heldLife2 = (Mod, L, lines = []) => { const pr = placeReads(L.file); let w = null; try { w = Mod.create({ userTodos: L.todos, dataDir: L.dir, log: (l) => lines.push(l), tickMs: 0, alerts: { file: (kind, f) => alerted.push([kind, f.hostKey]) } }); } finally { pr.restore(); } return { w, lines, seen: pr.seen.n }; };
  const a = lifeOne();
  const h = heldLife2(DW, a); const e = events(h.w);
  ok(h.seen === 1 && !!h.w.held() && e.r1 && e.r1.held === true && e.m1 === false && a.open().length === 1 && a.open()[0].id === a.itemId && fs.readFileSync(a.file, 'utf8') === a.bytes
    && h.lines.filter((l) => /waits — the record of the machines' agent updates could not be read \(EIO\)/.test(l)).length === 1 && JSON.stringify(h.w.rowOf('host-dial-HB1')) === JSON.stringify({ held: 'EIO' }),
    'HELD (a placed EIO of the read): every update event changes NOTHING now — the item filed before stays the one open item, the bytes on disk byte for byte after every writer was asked, said once; the row reader answers «held» by name', { open: a.open().map((i) => i.text), row: h.w.rowOf('host-dial-HB1') });
  ok(alerted.length === 1 && alerted[0][0] === 'upgrade-pushed' && alerted[0][1] === 'host-dial-HB3', 'HELD: a push that began files its URGENT alert AT ONCE (its own store, device-alerts) — only its deadline waits for this record', alerted);
  ok(/could not be read/.test(h.w.heldWords() || ''), `HELD: its words name what waits («${h.w.heldWords()}»)`);
  const lifted = await h.w.readAgain();
  const g = h.w.gone();
  ok(lifted === true && !h.w.held() && a.open().length === 0 && !g['host-dial-HB2'] && g['host-dial-HB3'] && g['host-dial-HB3'].pending === true && !h.w.ledger()['host-dial-HB1'] && alerted.length === 1
    && h.lines.some((l) => /the record reads again — 4 event\(s\) that came while it could not be read judged now/.test(l)),
    'LIFTED: the events that came while held are OWED and judged in their order — the newer give-up superseded the old item and the landed update resolved it (no item left open), the device that answered has no deadline left, the push that began has its deadline (its alert not filed twice)', { open: a.open().length, gone: Object.keys(g), lines: h.lines.filter((l) => /reads again/.test(l)) });
  h.w.stop();
  // RED: a copy that DROPS the owed events (the lift judges nothing that came meanwhile) — the landed update's item stays open for good
  // and the re-dialed device keeps its deadline (it would be told «stopped answering»)
  const OSRC = fs.readFileSync(path.join(REPO, 'src/server/device-upgrade-watch.js'), 'utf8');
  const Drop = MH.load('src/server/device-upgrade-watch.js', editAnchor(OSRC, 'heldSaid = false; heldUntil = now(); replayOwed(); } });', 'heldSaid = false; heldUntil = now(); } });', 'src/server/device-upgrade-watch.js'), 'owed-dropped');
  const d = lifeOne(); const dh = heldLife2(Drop, d); events(dh.w); await dh.w.readAgain();
  ok(d.open().length === 1 && dh.w.gone()['host-dial-HB2'] && dh.w.gone()['host-dial-HB2'].pending === true, 'RED: a copy that drops what came during the hold — the landed update\'s item stays open, the device that answered keeps its deadline', { open: d.open().length });
  dh.w.stop();
  // TORN: kept aside ONCE (byte for byte), the ledger then empty — the same stuck update re-filed is the SAME item in For you (its words)
  const t0 = lifeOne(); const TORN = t0.bytes.slice(0, 30); fs.writeFileSync(t0.file, TORN);
  const tw = DW.create({ userTodos: t0.todos, dataDir: t0.dir, log: () => { }, tickMs: 0 });
  for (let i = 0; i < 200 && tw.held(); i++) await sleep(10);
  const rt = tw.stuck(S);
  const copies = fs.readdirSync(t0.dir).filter((n) => n.startsWith('device-upgrades.json.corrupt-'));
  ok(!tw.held() && copies.length === 1 && fs.readFileSync(path.join(t0.dir, copies[0]), 'utf8') === TORN && t0.open().length === 1 && t0.open()[0].id === t0.itemId && rt && !rt.held,
    'TORN: the bytes kept aside once beside the store, byte for byte; the ledger empty — the same stuck update re-filed is the SAME item in For you, never a second', { copies, open: t0.open().length });
  tw.stop();
  // RED: the tip's read (blind to the hold: a failed read taken as a first run) — the newer version files a SECOND item, the old one is
  // never retracted, and the empty ledger is written over the file
  const RSRC = fs.readFileSync(path.join(REPO, 'src/server/device-upgrade-watch.js'), 'utf8');
  const Rel = MH.load('src/server/device-upgrade-watch.js', editAnchor(RSRC, "    if (hold.start(a) === 'data') load(a.value); }\n", "    if (a.state === 'data') load(a.value); }\n", 'src/server/device-upgrade-watch.js'), 'tip-read');
  const r = lifeOne(Rel); const rh = heldLife(Rel, r); rh.w.stuck({ ...S, to: '2.369.203' }); rh.w.stop();   // a NEWER version gave up, read over an empty ledger
  ok(r.open().length === 2 && fs.readFileSync(r.file, 'utf8') !== r.bytes, 'RED: the tip\'s read (a failed read taken as a first run) — a SECOND item beside the old one, never retracted, and the ledger written over the file', r.open().map((i) => i.text));
  for (const c of copiesCensus(MH.files, MH.dir, REPO, { minCopies: 1, label: 'mutant-copy (device-upgrades held): ' })) ok(c.pass, c.name, c.detail);
}
fs.rmSync(SCR, { recursive: true, force: true });
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
