#!/usr/bin/env node
// test-relay-unpublish-owed — row B-73c4 (主开发 r5159 / r5162, lane nl-mounts): A PUBLISHED PORT'S PUBLIC ADDRESS NEVER OUTLIVES ITS
// FORWARD SILENTLY. Before: every road swallowed a failed or refused unpublish (a machine's removal, a person's removal or unpublish, the
// restore's and the republish's cleanups, an agent's service ending) and dropped the record, while the relay's proxy file kept serving
// the address — against a loopback port anything may listen on later. FAST, in-process; no real relay, no real public address:
//   F  the REAL relay plugin's verbs (src/plugins/frp.js) over a stand-in handle and a scratch relay folder:
//      F1 proxyFiles() reads each file's OWNER MARK (this hub's id / another hub's / none); this hub's id is minted once when absent
//      F2 unpublish of a missing file is CONFIRMED; F3 a removal the folder refuses (a directory in its place) THROWS by name, the file
//      stays; F4 another instance's relay client holding the folder: REFUSED by name, nothing touched, proxyFiles answers held; F5 this
//      instance's own client that does not take the reload: THROWS by name after the file is gone
//   P  the REAL PortForwardManager over a stand-in relay:
//      P1 a person's removal of a published forward the relay refuses: the ROW is KEPT (forwardGone, owed, its reason), on disk; a new
//         manager over the same folder lists it, never starts it, and its owed pass (the relay now answering) removes it
//      P2 a person's unpublish refused: the address kept as up (publicUrl), owed; P3 a machine's removal: its published forward's row kept
//         until the relay confirms, the others dropped at once; P4 the owed pass: ONE relay call out at a time, each bounded (no answer ⇒
//         relay_unanswered, owed), on the 5-minute pace a row; P5 ORPHANS by mark: this hub's file no row names ⇒ an owed row; another
//         hub's ⇒ never touched nor listed; no mark ⇒ the words row's list only; the instance URL's own file and a recorded one ⇒ nothing;
//         only on a READ list with this instance's own client running
//      REDS (anchored copies): the release's swallow (every refusal answered «confirmed»); the orphan judgement without its mark test
//   D  the «Try again» route (src/server/ports-relay-routes.js) is a PERSON's door: a bearer refused (human_only), a cross-site press
//      refused (cross_site), a same-origin press answered; the unmarked files' route answers the list
//   J  an agent's service: the job card says its public address is still up (jobs-layout publishBlockedNote; JobManager _stillUpOf)
//   L  nothing synchronous on the loop: the relay's removal, its listing and its hub-id read are fs.promises only
//   LAW 1 (r5135): each control is judged on a WITNESS that its plant was read (the stand-in's calls, the refused errno, the stand-in
//   client alive); a plant never read is a NAMED SKIP («⊘ SKIP: …»), never a ✓ and never a ✗.
// Run: node scripts/test-relay-unpublish-owed.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
let skipped = 0, dirN = 0;
const judged = (witness, cond, name, detail) => { if (!witness) { skipped++; console.log(`  ⊘ SKIP: ${name} — its plant was never read: not judged`); return; } ok(cond, name, detail); };
const dirOf = (n) => scratchDir(`relay-owed-${n}-${++dirN}`);
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const asModule = (rel, code) => { const Module = require('node:module'); const abs = path.join(REPO, rel); const m = new Module(abs, null); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
const copyOf = (rel, edits, name) => { let code = srcOf(rel); for (const [a, b] of edits) code = anchored(code, a, b, name); return asModule(rel, code); };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const KIDS = [];
const killKids = () => { for (const k of KIDS) { try { k.kill('SIGKILL'); } catch { } } };
process.on('exit', killKids);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { killKids(); process.exit(1); });   // a run stopped from outside leaves no stand-in behind
// a port nothing listens on (the relay client's admin port in F5: a reload there is refused)
const freePort = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
process.env.VIBESPACE_FRP_ADMIN_PORT = String(freePort);   // read by frp.js when it loads (below)
const FRP = require(path.join(REPO, 'src/plugins/frp.js'));
/** a stand-in relay client: a process whose command line names frpc (the plugin's own test of «a relay client»), its pid in the folder */
// (the stand-in ends by itself within a minute)
const fakeClient = (dir) => { const k = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)', 'frpc'], { stdio: 'ignore' }); KIDS.push(k); fs.writeFileSync(path.join(dir, 'frpc.pid'), String(k.pid)); return k; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const relayOf = ({ peek = {} } = {}) => {
  const dir = dirOf('frp'), dataDir = dirOf('data'); fs.mkdirSync(path.join(dir, 'proxies'), { recursive: true });
  const rec = { ...peek };
  const h = { id: 'frp', dir, dataDir, opts: {}, rec: () => rec, peek: () => rec, save: () => { }, notify: () => { }, probeProto: async () => 'http',
    settings: () => ({}), setting: () => undefined, settingsHeld: () => false, writeSettings: () => { }, vault: () => null, sealedDir: () => null };
  return { dir, dataDir, proxies: path.join(dir, 'proxies'), verbs: FRP.create(h) };
};
const HUB = 'vh-0123456789abcdef', OTHER = 'vh-fedcba9876543210';
const mark = (id) => `# vibespace-owner = "${id}"\n`;

console.log('F the relay plugin\'s own verbs (src/plugins/frp.js)');
{
  const r = relayOf();
  fs.mkdirSync(path.join(r.dataDir, 'agentd'), { recursive: true }); fs.writeFileSync(path.join(r.dataDir, 'agentd', 'hub-id'), HUB + '\n');
  fs.writeFileSync(path.join(r.proxies, 'pf-mine.toml'), mark(HUB) + '[[proxies]]\nname = "pf-mine"\n');
  fs.writeFileSync(path.join(r.proxies, 'pf-other.toml'), mark(OTHER) + '[[proxies]]\nname = "pf-other"\n');
  fs.writeFileSync(path.join(r.proxies, 'pf-none.toml'), '[[proxies]]\nname = "pf-none"\n');
  const pf = await r.verbs.proxyFiles();
  const by = Object.fromEntries((pf.files || []).map((f) => [f.name, f.mark]));
  ok(pf.held === false && by['pf-mine'] === 'mine' && by['pf-other'] === 'other' && by['pf-none'] === 'none' && pf.folder === r.proxies, 'F1 proxyFiles reads each file\'s OWNER MARK: this hub\'s id → mine, another hub\'s → other, none → none', pf);
  const r2 = relayOf(); fs.writeFileSync(path.join(r2.proxies, 'pf-x.toml'), '[[proxies]]\n');
  await r2.verbs.proxyFiles(); const minted = (() => { try { return fs.readFileSync(path.join(r2.dataDir, 'agentd', 'hub-id'), 'utf8').trim(); } catch { return null; } })();
  ok(/^vh-[0-9a-f]{16}$/.test(String(minted)), 'F1 this hub\'s id is MINTED once when no door has yet (the dial door\'s own form, vh- + 16 hex)', minted);
  const c = await r.verbs.unpublish('pf-gone').then((x) => x, (e) => ({ threw: e && e.code }));
  ok(!!c && c.ok === true && c.confirmed === true, 'F2 the unpublish of a file already missing (no client running) is CONFIRMED', c);
  fs.mkdirSync(path.join(r.proxies, 'pf-stuck.toml'));   // a directory where the file is: its removal is refused (EISDIR / EPERM)
  const realUnlink = fs.promises.unlink, unl = []; fs.promises.unlink = function (q, ...a) { unl.push(String(q)); return realUnlink.call(this, q, ...a); };   // the witness: the removal ASKED of the folder
  let s; try { s = await r.verbs.unpublish('pf-stuck').then((x) => ({ x }), (e) => ({ code: e && e.code, msg: e && e.message })); } finally { fs.promises.unlink = realUnlink; }
  judged(unl.includes(path.join(r.proxies, 'pf-stuck.toml')), s.code === 'relay_unpublish_unremoved' && fs.existsSync(path.join(r.proxies, 'pf-stuck.toml')), 'F3 a removal the folder refuses THROWS by name (relay_unpublish_unremoved), the file stays', s);
  const r3 = relayOf(); const k3 = fakeClient(r3.dir); await tick(150);
  fs.writeFileSync(path.join(r3.proxies, 'pf-held.toml'), mark(HUB) + '[[proxies]]\n');
  const h3 = await r3.verbs.unpublish('pf-held').then((x) => ({ x }), (e) => ({ code: e && e.code }));
  const l3 = await r3.verbs.proxyFiles();
  judged(alive(k3.pid), ['relay_held_elsewhere', 'relay_owner_unknown'].includes(h3.code) && fs.existsSync(path.join(r3.proxies, 'pf-held.toml')) && l3.held === true && (l3.files || []).length === 0, 'F4 another instance\'s relay client holds the folder: the unpublish REFUSED by name, its file untouched; proxyFiles answers held, lists nothing', { h3, l3 });
  const r4 = relayOf({ peek: { desiredUp: true } }); const k4 = fakeClient(r4.dir); await tick(150);
  fs.writeFileSync(path.join(r4.proxies, 'pf-own.toml'), mark(HUB) + '[[proxies]]\n');
  const realFetch = globalThis.fetch, fetched = []; globalThis.fetch = (u, o) => { fetched.push(String(u)); return realFetch(u, o); };   // the witness: the reload ASKED of the client
  let h4; try { h4 = await r4.verbs.unpublish('pf-own').then((x) => ({ x }), (e) => ({ code: e && e.code, msg: e && e.message })); } finally { globalThis.fetch = realFetch; }
  judged(alive(k4.pid) && fetched.some((u) => u.includes('/api/reload')), h4.code === 'relay_unpublish_unreloaded' && !fs.existsSync(path.join(r4.proxies, 'pf-own.toml')), 'F5 this instance\'s own client that does not take the reload: THROWS by name (relay_unpublish_unreloaded) after the file is gone — never «ok» while it may still serve', h4);
  for (const k of [k3, k4]) { try { k.kill('SIGKILL'); } catch { } }
}

// ── P: the REAL PortForwardManager over a stand-in relay ─────────────────────────────────────────────────────────────────────
const PF_REL = 'src/port-forward.js';
const writer = () => ({ dirty: (file, o) => { if (o && typeof o.produce === 'function') fs.writeFileSync(file, o.produce({ sync: true })); }, pending: () => false, durable: async () => true, flushSync: () => ({ written: [], left: [] }), flushDeadline: () => 0 });
const pub = (n, extra = {}) => ({ id: `pf-__local__-${7100 + n}`, hostId: '__local__', remotePort: 7100 + n, label: `made-up ${n}`, publicUrl: `https://made-sub-${n}.relay.example.test/`, publicName: `pf-__local__-${7100 + n}`, publicSub: `made-sub-${n}`, proto: 'http', ...extra });
const MADE = [];
process.on('exit', () => { for (const m of MADE) { try { clearInterval(m._watch); } catch { } try { m._hold && m._hold.stop && m._hold.stop(); } catch { } } });
const worldOf = (PFM, rows, relay, d = dirOf('ports')) => {
  const file = path.join(d, 'port-forwards.json');
  if (rows) fs.writeFileSync(file, JSON.stringify({ forwards: rows }, null, 2));
  const pf = new PFM({ hosts: { list: () => [], deviceBounded: async () => { throw new Error('no such machine'); } }, dataDir: d, plugins: null, broadcast: () => { }, log: () => { }, getJobs: () => null, storeWriter: writer() });
  clearInterval(pf._watch); MADE.push(pf);
  pf.plugins = relay; pf.relayBoundMs = 200;
  return { d, file, pf, disk: () => JSON.parse(fs.readFileSync(file, 'utf8')).forwards };
};
/** a stand-in relay: frpUnpublish refuses with `code` while `refuse` is set (each call counted), frpProxyFiles answers `files` */
const relay = ({ code = 'relay_unpublish_unremoved', files = null, own = true } = {}) => {
  const r = { calls: [], refuse: true, listed: 0, out: 0, maxOut: 0, hang: new Set() };
  r.frpUnpublish = async (name) => {
    r.calls.push(name); r.out++; r.maxOut = Math.max(r.maxOut, r.out);
    try { await tick(20); if (r.hang.has(name)) await new Promise(() => { }); if (r.refuse) throw Object.assign(new Error(`a made-up refusal (${code})`), { code }); return { ok: true, confirmed: true }; } finally { r.out--; }
  };
  r.published = []; r.frpPublish = async (name) => { r.published.push(name); throw Object.assign(new Error('no publish in this suite'), { code: 'stand_in_no_publish' }); };
  if (files) r.frpProxyFiles = async () => { r.listed++; return { held: false, own, folder: '/made/up/relay/proxies', files }; };
  return r;
};
const PFm = require(path.join(REPO, PF_REL)).PortForwardManager;
const SWALLOW = ["      const code = (e && e.code) || 'relay_unpublish_failed', reason = String((e && e.message) || code).slice(0, 300), was = rec.unpublishOwed;", "      return true;   // RED: the release's swallow\n      const code = (e && e.code) || 'relay_unpublish_failed', reason = String((e && e.message) || code).slice(0, 300), was = rec.unpublishOwed;"];
const PFred = copyOf(PF_REL, [SWALLOW], 'p-swallow').PortForwardManager;

console.log('P the forwards store keeps a public address that is still up as a row');
{
  const scene = async (PFM) => {
    const rl = relay(), w = worldOf(PFM, [pub(1), pub(2, { publicUrl: null, publicName: null })], rl);
    const r = await w.pf.unforward(pub(1).id, { now: true });
    const row = w.pf.list().find((x) => x.id === pub(1).id), onDisk = w.disk().find((x) => x.id === pub(1).id);
    return { rl, w, r, row, onDisk };
  };
  const t = await scene(PFm);
  judged(t.rl.calls.length === 1, !!(t.row && t.row.forwardGone && t.row.unpublishOwed && t.row.unpublishOwed.code === 'relay_unpublish_unremoved' && t.onDisk && t.onDisk.unpublishOwed && t.r && t.r.owed),
    'P1 a person\'s removal of a published forward the relay refuses: the ROW is KEPT — forward gone, its address OWED with its reason — and on disk', { row: t.row, r: t.r });
  // the next start: listed, never started, and its owed pass (the relay answering now) removes it
  const rl2 = relay(); rl2.refuse = false;
  const w2 = worldOf(PFm, null, rl2, t.w.d);
  const listed = !!w2.pf.list().find((x) => x.id === pub(1).id && x.unpublishOwed);
  await w2.pf.restore();
  judged(rl2.calls.length >= 1, listed && !w2.pf._live.has(pub(1).id) && !w2.pf.list().find((x) => x.id === pub(1).id) && !w2.disk().find((x) => x.id === pub(1).id),
    'P1 the next start lists the owed row (it is the record), never starts it, and its owed pass removes it once the relay CONFIRMS', { listed, calls: rl2.calls });
  const red = await scene(PFred);
  judged(red.rl.calls.length === 1, !red.row, 'P1 RED CONTROL (the release\'s swallow, in a copy): the row is dropped at once while the relay refused', red.row);
}
{
  const scene = async (PFM) => { const rl = relay({ code: 'relay_held_elsewhere' }), w = worldOf(PFM, [pub(3)], rl); const r = await w.pf.unpublish(pub(3).id, { now: true }); return { rl, r, row: w.pf.list().find((x) => x.id === pub(3).id) }; };
  const t = await scene(PFm), red = await scene(PFred);
  judged(t.rl.calls.length === 1, !!(t.row && t.row.publicUrl && t.row.unpublishOwed && t.row.unpublishOwed.code === 'relay_held_elsewhere' && t.r && t.r.owed), 'P2 a person\'s unpublish refused: the address kept as UP (publicUrl), owed with its reason', t.row);
  judged(red.rl.calls.length === 1, !!red.row && !red.row.publicUrl, 'P2 RED CONTROL (the swallow): the address cleared while the relay refused', red.row);
}
{
  const rl = relay(), w = worldOf(PFm, [pub(4, { hostId: 'h1' }), pub(5, { hostId: 'h1', publicUrl: null, publicName: null }), pub(6)], rl);
  w.pf.onMachineUnpaired('h1', { now: true });
  const atReturn = w.pf.list().map((x) => x.id).sort().join(','), kept = w.pf.list().find((x) => x.id === pub(4).id);
  for (let i = 0; i < 40 && rl.calls.length < 1; i++) await tick(10);
  await tick(60);
  const after = w.pf.list().find((x) => x.id === pub(4).id);
  rl.refuse = false; w.pf._healRetryAt.delete(pub(4).id); await w.pf._owedPass('a leg');
  judged(rl.calls.length >= 1, !!(atReturn === [pub(4).id, pub(6).id].sort().join(',') && kept && kept.machineGone && kept.forwardGone && after && after.unpublishOwed && after.unpublishOwed.code === 'relay_unpublish_unremoved' && !w.pf.list().find((x) => x.id === pub(4).id)),
    'P3 a machine\'s removal: its published forward\'s row KEPT (machine gone, owed) until the relay confirms, its unpublished one dropped at once; confirmed later ⇒ gone', { atReturn, kept, after });
}
{
  const owed = (n, since) => pub(n, { unpublishOwed: { code: 'x', reason: 'r', since }, forwardGone: true });
  const rl = relay(), w = worldOf(PFm, [owed(7, 1), owed(8, 2), owed(9, 3)], rl);
  rl.hang.add(pub(7).publicName);   // the oldest's removal never answers: past the bound it is still OUT at the relay
  await w.pf._owedPass('a leg');
  const r7 = w.pf.list().find((x) => x.id === pub(7).id), n1 = rl.calls.length;
  await w.pf._owedPass('a leg again');
  judged(n1 >= 1, !!(n1 === 1 && rl.calls[0] === pub(7).publicName && rl.calls.length === 1 && rl.maxOut === 1 && r7 && r7.unpublishOwed && r7.unpublishOwed.code === 'relay_unanswered'),
    'P4 the owed pass: the OLDEST first, bounded (no answer ⇒ relay_unanswered, still owed), and ONE out at a time — while that removal is still out at the relay nothing more is asked, in this pass or the next', { calls: rl.calls, maxOut: rl.maxOut, r7: r7 && r7.unpublishOwed });
  const rp = relay(), wp = worldOf(PFm, [owed(11, 1)], rp);
  await wp.pf._owedPass('a leg'); const m1 = rp.calls.length;
  await wp.pf._owedPass('a leg again');
  judged(m1 === 1, rp.calls.length === 1 && !!wp.pf.list().find((x) => x.id === pub(11).id && x.unpublishOwed), 'P4 the owed pass\'s PACE: a refused removal is asked again only after its 5 minutes (a pass right after asks nothing)', { calls: rp.calls });
}
{
  const files = [{ name: 'pf-mine-orphan', mark: 'mine' }, { name: 'pf-their', mark: 'other' }, { name: 'pf-old', mark: 'none' }, { name: 'vibespace-instance', mark: 'mine' }, { name: pub(10).publicName, mark: 'mine' }];
  const scene = async (PFM, own = true) => { const rl = relay({ files, own }), w = worldOf(PFM, [pub(10)], rl); await w.pf._owedPass('a leg'); return { rl, ids: w.pf.list().map((x) => x.id).sort(), unmarked: w.pf.unmarkedRelayFiles() }; };
  const t = await scene(PFm);
  judged(t.rl.listed === 1, !!(t.ids.join(',') === [pub(10).id, 'pf-orphan-pf-mine-orphan'].sort().join(',') && t.unmarked && t.unmarked.names.join() === 'pf-old' && t.unmarked.folder === '/made/up/relay/proxies' && !JSON.stringify(t).includes('pf-their')),
    'P5 ORPHANS by mark: this hub\'s file no row names ⇒ an owed row; another hub\'s ⇒ never touched nor listed; no mark ⇒ the words row\'s list only; the instance URL\'s own and a recorded one ⇒ nothing', t);
  const off = await scene(PFm, false);
  judged(off.rl.listed === 1, off.ids.join(',') === pub(10).id && !off.unmarked, 'P5 with this instance\'s own client NOT running: nothing judged', off);
  // a LAN forward's id keeps its dots; its relay file has them as underscores: that file is the row's, never an orphan
  const lan = pub(13, { id: 'pf-__local__-192.168.1.5_8013', publicName: null, targetHost: '192.168.1.5' });
  { const rl = relay({ files: [{ name: 'pf-__local__-192_168_1_5_8013', mark: 'mine' }] }), w = worldOf(PFm, [lan], rl); await w.pf._owedPass('a leg');
    judged(rl.listed === 1, !w.pf.list().some((x) => x.orphan), 'P5 a file named as the relay writes a row\'s name (dots → underscores) is that row\'s — never an orphan', w.pf.list().map((x) => x.id)); }
  // a list lifted from TORN bytes is no «empty» list: nothing is judged against it
  { const rl = relay({ files }), w = worldOf(PFm, [], rl); w.pf._tornCopy = 'port-forwards.json.corrupt-made-up'; await w.pf._owedPass('a leg');
    ok(rl.listed === 0 && !w.pf.list().length && !w.pf.unmarkedRelayFiles(), 'P5 a list lifted from torn bytes: the relay folder is not even read, nothing judged, nothing listed'); }
  // a HELD (unread) list: the owed pass does not run at all
  { const d = dirOf('held'), f = path.join(d, 'port-forwards.json'); fs.writeFileSync(f, JSON.stringify({ forwards: [] })); const realRead = fs.readFileSync;
    fs.readFileSync = function (q, ...a) { if (String(q) === f) throw Object.assign(new Error('EIO: a placed refusal of the read'), { code: 'EIO' }); return realRead.call(this, q, ...a); };
    let w = null, hit = 0; const rl = relay({ files }); const lf = rl.frpProxyFiles; rl.frpProxyFiles = async () => { hit++; return lf(); };
    try { w = worldOf(PFm, null, rl, d); } finally { fs.readFileSync = realRead; }
    const held = !!w.pf.heldWords(); if (w.pf._hold && w.pf._hold.stop) w.pf._hold.stop(); await w.pf._owedPass('a leg');
    judged(held, hit === 0 && !w.pf.list().length, 'P5 a HELD list (its read refused): nothing judged against it, the relay folder not even read', { held, hit }); }
  // a STALE orphan (a row names its file now): it leaves without its file touched
  { const rl = relay(); rl.refuse = false; const w = worldOf(PFm, [pub(14), { id: 'pf-orphan-' + pub(14).publicName, hostId: null, remotePort: null, label: pub(14).publicName, orphan: true, publicName: pub(14).publicName, unpublishOwed: { code: 'relay_orphan', reason: 'r', since: 1 } }], rl);
    await w.pf._owedPass('a leg');
    ok(!w.pf.list().some((x) => x.orphan) && rl.calls.length === 0 && !!w.pf.list().find((x) => x.id === pub(14).id), 'P5 a stale orphan (a row names its file now) leaves WITHOUT its file removed', { calls: rl.calls }); }
  const MARKLESS = copyOf(PF_REL, [["      if (f.mark === 'mine') {", "      if (f.mark === 'mine' || f.mark === 'other') {   // RED: another hub's file judged as this one's"]], 'p-markless').PortForwardManager;
  const red = await scene(MARKLESS);
  judged(red.rl.listed === 1, red.ids.includes('pf-orphan-pf-their'), 'P5 RED CONTROL (another hub\'s mark judged as this hub\'s, in a copy): its file becomes a row here', red.ids);
}

console.log('P6–P8 a forward again over an owed removal, a protocol change, a removed row\'s unpublish');
{
  const rl = relay(), w = worldOf(PFm, [pub(12, { forwardGone: true, unpublishOwed: { code: 'x', reason: 'r', since: 1 } })], rl);
  await w.pf.forward('__local__', 7112, {});
  const back = w.pf.list().find((x) => x.id === pub(12).id);
  const refused = await w.pf.publish(pub(12).id).then(() => null, (e) => e && e.code);
  rl.refuse = false; w.pf._healRetryAt.delete(pub(12).id); await w.pf._owedPass('a leg');
  const after = w.pf.list().find((x) => x.id === pub(12).id), again = await w.pf.publish(pub(12).id).then(() => null, (e) => e && e.code);
  judged(rl.calls.length >= 1, !!(back && !back.forwardGone && back.unpublishOwed && refused === 'unpublish_owed' && after && !after.unpublishOwed && !after.publicUrl && again !== 'unpublish_owed' && rl.published.includes(pub(12).id)),
    'P6 a forward again over a row owed its removal: the row comes back as a forward, publish REFUSED (unpublish_owed) until the old address is confirmed down; then publish is asked of the relay again', { back, refused, after, again, published: rl.published });
}
{
  const rl = relay(), w = worldOf(PFm, [pub(15)], rl);
  await w.pf.setProtoOverride(pub(15).id, 'tcp', { now: true });
  const row = w.pf.list().find((x) => x.id === pub(15).id), rec = w.pf._state.forwards.find((x) => x.id === pub(15).id);
  judged(rl.calls.length === 1, !!(row && !row.unpublishOwed && rl.published.includes(pub(15).id) && /could not be taken down|republish/.test(String(rec.error || ''))),
    'P7 a protocol change whose old address\'s removal is refused: SAID (the row\'s error), never owed — the republish writes the same-named file over it', { row, error: rec.error, published: rl.published });
}
{
  const rl = relay(), w = worldOf(PFm, [pub(16, { forwardGone: true, unpublishOwed: { code: 'x', reason: 'r', since: 1 } })], rl);
  rl.refuse = false; const r = await w.pf.unpublish(pub(16).id, { now: true });
  judged(rl.calls.length === 1, !!(r && r.confirmed && !w.pf.list().find((x) => x.id === pub(16).id)), 'P8 unpublishing a row that is only an owed removal: confirmed ⇒ the row LEAVES (never a row «still up» with nothing to remove)', { r, rows: w.pf.list() });
}

console.log('D the «Try again» route is a person\'s door');
{
  const handlers = {}; const app = { post: (p, f) => { handlers['POST ' + p] = f; }, get: (p, f) => { handlers['GET ' + p] = f; } };
  const asked = []; const pfStand = { unpublishAgain: async (id) => { asked.push(id); return { ok: true, confirmed: true }; }, unmarkedRelayFiles: () => ({ folder: '/made/up', names: ['a'] }) };
  require(path.join(REPO, 'src/server/ports-relay-routes.js')).register({ app, getPortForwards: () => pfStand });
  const call = async (key, req) => { let code = 200, body = null; const res = { set() { return this; }, status(c) { code = c; return this; }, json(b) { body = b; return this; } }; await handlers[key]({ params: { id: 'pf-x' }, socket: {}, ...req }, res); return { code, body }; };
  const bearer = await call('POST /api/port-forward/:id/unpublish-again', { headers: { authorization: 'Bearer made-up-agent-key' } });
  const cross = await call('POST /api/port-forward/:id/unpublish-again', { headers: { 'sec-fetch-site': 'cross-site' } });
  const page = await call('POST /api/port-forward/:id/unpublish-again', { headers: { 'sec-fetch-site': 'same-origin' } });
  const files = await call('GET /api/port-forwards/relay-files', { headers: {} });
  ok(bearer.code === 403 && bearer.body.code === 'human_only' && cross.code === 403 && cross.body.code === 'cross_site' && page.code === 200 && page.body.confirmed === true && asked.join() === 'pf-x' && files.body.unmarked.names.join() === 'a',
    'D «Try again» refuses a bearer (an agent, a job, an automation: human_only) and a cross-site press, answers a person on this page; the unmarked files\' route answers the list', { bearer, cross, page, asked, files });
  const W = srcOf('src/server/mounts-plugins-wiring.js');
  ok((W.split("require('./ports-relay-routes.js').register({ app, getPortForwards: () => portForwards });").length - 1) === 1, 'D the routes are registered from the wiring (server.js gains no line)');
}

console.log('J an agent\'s service: its card says its address is still up');
{
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const d = { getPorts: () => ({ list: () => [{ id: 'pf-a', ownerJob: 'j1', unpublishOwed: { code: 'x' } }, { id: 'pf-b', ownerJob: 'j2', unpublishOwed: null }] }) };
  const up1 = JobManager.prototype._stillUpOf.call({ d }, { id: 'j1' }), up2 = JobManager.prototype._stillUpOf.call({ d }, { id: 'j2' });
  const JL = await import(pathToFileURL(path.join(REPO, 'src/lib/jobs-layout.js')).href);
  const t = (s) => s;
  const note = JL.publishBlockedNote({ publish: true, publishedUrl: null, publishStillUp: true }, t), none = JL.publishBlockedNote({ publish: true, publishedUrl: null, publishStillUp: false }, t);
  ok(up1 === true && up2 === false && /still up/.test(note) && !/remove (it|the file)/i.test(note) && none === '', 'J the job card says its public address is still up (kept in Ports) — never tells an agent to remove a file', { up1, up2, note, none });
}

console.log('L nothing synchronous on the loop in the relay\'s removal, listing and hub-id read');
{
  const F = srcOf('src/plugins/frp.js');
  const block = (a, b) => { const i = F.indexOf(a), j = F.indexOf(b, i + 1); return i >= 0 && j > i ? F.slice(i, j) : null; };
  const un = block('      async unpublish(name) {', '      async proxyFiles() {'), ls = block('      async proxyFiles() {', '        return { held: false, own: !!ownRunPid(), folder: dir, files };'), hid = block('    const hubIdNow = async () => {', '    const OWNER_RE =');
  ok(!!un && !!ls && !!hid && ![un, ls, hid].some((s) => /\b[a-zA-Z]+Sync\(/.test(s.replace(/frpDaemonPid|ownRunPid|heldElsewhere/g, ''))), 'L the relay\'s removal, its listing and its hub-id read call no synchronous fs (fs.promises only)', { un: !!un, ls: !!ls, hid: !!hid });
  ok((F.split('const toml = ownerLine(await hubIdNow()) + `[[proxies]]').length - 1) === 2, 'L both proxy files this instance writes carry the OWNER MARK (this hub\'s id) on their first line');
}

if (skipped) console.log(`${skipped} named skip(s) — a plant never read, not judged`);
report();
