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
//      P9–P14 (r5334): a REMOVED row whose removal is owed belongs to NOBODY — a person's new forward over a job's removed row carries
//         no owner (P9), a service over a person's removed row is accepted and takes it (P10), each RED on bee1c1b8f's revival; ONE
//         orphan row a file however often it is judged (P11); a never-published row's unpublish never asks the relay (P12); a removed
//         machine's removals join the owed pass's one-out (P13); an orphan's mark read once more before its removal (P14)
//      P9b / P10b (r5421): a refused retry (the pass, «Try again») keeps whose old address it is; a service over a person's row is
//         never told that person's address is its own; P9c (r5486) a second change of owner never moves the mark; P15 (r5486, S6) a
//         confirmed removal on a job's live row asks the jobs engine ONCE — the waiting service published with no restart
//   U  (r5561) THE OWED ROW, as a person reads it: its name (the machine and port, its service) and THE ADDRESS still up in its text
//      (U1, red: the base's list hides the address); a row that wraps so the name is never squeezed to nothing (U2, a CSS law; red:
//      the base's rules); the unmarked file's words wrap — the panel never scrolls sideways (U3); the press carries its words (U4)
//   I  the instance address (src/server/instance-url.js): a refused removal is OWED and retried at a start (I1), on the pace (I2),
//      a Publish waits for a retry out (I3), a retry refused the same way writes nothing (I4), and a press waits for a retry out
//      only as long as its bound (I5, r5486)
//   D  the «Try again» route (src/server/ports-relay-routes.js) is a PERSON's door: a bearer refused (human_only), a cross-site press
//      refused (cross_site), a same-origin press answered; the unmarked files' route answers the list
//   J  an agent's service: the job card says its public address is still up (jobs-layout publishBlockedNote; JobManager _stillUpOf)
//   L  the relay's removal, its listing and its hub-id read name no synchronous fs call in their own text (fs.promises; the relay's
//      pid-file read is the release's, as at every status call)
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
import { cssRules } from './lib/css-rules.mjs';

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
const execd = async (pid) => { for (let i = 0; i < 300; i++) { try { if (fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('frpc')) return true; } catch { } await tick(10); } return false; };   // the stand-in client exec'd
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
  const r3 = relayOf(); const k3 = fakeClient(r3.dir); const e3 = await execd(k3.pid);
  fs.writeFileSync(path.join(r3.proxies, 'pf-held.toml'), mark(HUB) + '[[proxies]]\n');
  const h3 = await r3.verbs.unpublish('pf-held').then((x) => ({ x }), (e) => ({ code: e && e.code }));
  const l3 = await r3.verbs.proxyFiles();
  judged(e3 && alive(k3.pid), ['relay_held_elsewhere', 'relay_owner_unknown'].includes(h3.code) && fs.existsSync(path.join(r3.proxies, 'pf-held.toml')) && l3.held === true && (l3.files || []).length === 0, 'F4 another instance\'s relay client holds the folder: the unpublish REFUSED by name, its file untouched; proxyFiles answers held, lists nothing', { h3, l3 });
  const r4 = relayOf({ peek: { desiredUp: true } }); const k4 = fakeClient(r4.dir); const e4 = await execd(k4.pid);
  fs.writeFileSync(path.join(r4.proxies, 'pf-own.toml'), mark(HUB) + '[[proxies]]\n');
  const realFetch = globalThis.fetch, fetched = []; globalThis.fetch = (u, o) => { fetched.push(String(u)); return realFetch(u, o); };   // the witness: the reload ASKED of the client
  let h4; try { h4 = await r4.verbs.unpublish('pf-own').then((x) => ({ x }), (e) => ({ code: e && e.code, msg: e && e.message })); } finally { globalThis.fetch = realFetch; }
  judged(e4 && alive(k4.pid) && fetched.some((u) => u.includes('/api/reload')), h4.code === 'relay_unpublish_unreloaded' && !fs.existsSync(path.join(r4.proxies, 'pf-own.toml')), 'F5 this instance\'s own client that does not take the reload: THROWS by name (relay_unpublish_unreloaded) after the file is gone — never «ok» while it may still serve', h4);
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
  for (let i = 0; i < 300 && (rl.calls.length < 1 || w.pf._owedBusy); i++) await tick(10);   // the witness: the relay asked, its pass ended (never a fixed sleep)
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

console.log('P9–P14 (r5334) a removed row belongs to nobody; one orphan row a file; no false «still up»; the machine\'s removals one out; the mark read again');
const PFrevive = copyOf(PF_REL, [["    const gone = rec && rec.forwardGone ? rec : null;\n    if (gone) rec = null;\n", "    if (rec && rec.forwardGone) { delete rec.forwardGone; delete rec.machineGone; }   // RED: bee1c1b8f's revival, before the ownership checks\n    const gone = null;\n"]], 'p-revive').PortForwardManager;
{
  const scene = async (PFM) => {
    const rl = relay(), w = worldOf(PFM, [pub(20, { ownerJob: 'jb-a', label: 'service: a', forwardGone: true, unpublishOwed: { code: 'relay_held_elsewhere', reason: 'r', since: 1 } })], rl);
    const before = w.pf._state.forwards.find((x) => x.id === pub(20).id), read = !!(before && before.ownerJob === 'jb-a' && before.forwardGone);   // the plant: a job's removed row, read from its file
    await w.pf.forward('__local__', 7120, {});   // a person adds a forward by hand on that machine and port
    const rec = w.pf._state.forwards.find((x) => x.id === pub(20).id), disk = w.disk().find((x) => x.id === pub(20).id);
    const refused = await w.pf.publish(pub(20).id).then(() => null, (e) => e && e.code);
    const listed = w.pf.list().find((x) => x.id === pub(20).id);
    return { read, rec: rec && { ownerJob: rec.ownerJob || null, label: rec.label, forwardGone: !!rec.forwardGone, owed: !!rec.unpublishOwed, publicUrl: rec.publicUrl || null, publicSub: rec.publicSub || null }, stillUpOf: listed && listed.unpublishOwed ? listed.unpublishOwed.ownerJob : null, diskOwner: disk ? disk.ownerJob || null : 'no row', refused };
  };
  const t = await scene(PFm);
  judged(t.read, !!(t.rec && t.rec.ownerJob === null && t.rec.label === '' && !t.rec.forwardGone && t.rec.owed && t.rec.publicUrl && t.rec.publicSub === null && t.stillUpOf === 'jb-a' && t.diskOwner === null && t.refused === 'unpublish_owed'),
    'P9 a person\'s new forward over a JOB\'s removed row whose removal is owed: the row is the PERSON\'s (no owner, the caller\'s label — on disk too), its owed removal and old address kept (publish refused until it is down) and still the JOB\'s on its card; the job\'s subdomain never passes to it', t);
  const red = await scene(PFrevive);
  judged(red.read, !!(red.rec && red.rec.ownerJob === 'jb-a'), 'P9 RED CONTROL (bee1c1b8f\'s revival, in a copy): the person\'s forward comes back as the job\'s row — the engine would take it', red);
}
{
  const scene = async (PFM) => {
    const rl = relay(), w = worldOf(PFM, [pub(21, { forwardGone: true, unpublishOwed: { code: 'relay_unpublish_unreloaded', reason: 'r', since: 1 } })], rl);
    const before = w.pf._state.forwards.find((x) => x.id === pub(21).id), read = !!(before && before.forwardGone && !before.ownerJob);   // the plant: a person's removed row
    const err = await w.pf.forward('__local__', 7121, { owner: 'jb-b', label: 'service: b' }).then(() => null, (e) => (e && e.code) || 'threw');
    const rec = w.pf._state.forwards.find((x) => x.id === pub(21).id);
    return { read, err, rec: rec && { ownerJob: rec.ownerJob || null, label: rec.label, forwardGone: !!rec.forwardGone, owed: !!rec.unpublishOwed, publicUrl: rec.publicUrl || null } };
  };
  const t = await scene(PFm);
  judged(t.read, !!(t.err === null && t.rec && t.rec.ownerJob === 'jb-b' && t.rec.label === 'service: b' && !t.rec.forwardGone && t.rec.owed && t.rec.publicUrl),
    'P10 a service starting over a PERSON\'s removed row whose removal is owed: accepted, the row is the service\'s; its owed removal and old address kept', t);
  const red = await scene(PFrevive);
  judged(red.read, !!(red.err === 'forward_not_owned' && red.rec && !red.rec.forwardGone && !red.rec.ownerJob), 'P10 RED CONTROL (bee1c1b8f\'s revival, in a copy): the service refused «already forwarded by hand» AND the person\'s removed forward a live row again (the heal sweep starts it)', red);
}
{
  const scene = async (PFM) => {
    const rl = relay({ files: [{ name: 'pf-stuck-orphan', mark: 'mine' }] }), w = worldOf(PFM, [], rl);   // this hub's file no row names; its removal refused
    await w.pf._owedPass('a leg');
    w.pf._orphansAt = 0; w.pf._healRetryAt.clear(); await w.pf._owedPass('five minutes on');
    return { listed: rl.listed, calls: rl.calls.length, n: w.pf._state.forwards.filter((x) => x.orphan && x.publicName === 'pf-stuck-orphan').length };
  };
  const t = await scene(PFm);
  judged(t.listed === 3 && t.calls >= 1, t.n === 1, 'P11 an orphan whose removal is refused, judged again five minutes on: exactly ONE row stands for its file', t);
  const red = await scene(copyOf(PF_REL, [['      if (standing.has(f.name)) continue;', '      // RED: no guard on the row that stands']], 'p-dup').PortForwardManager);
  judged(red.listed === 3, red.n === 2, 'P11 RED CONTROL (no guard on the standing row, in a copy): a SECOND row for the same file', red);
}
{
  const scene = async (PFM) => {
    const rl = relay({ code: 'relay_held_elsewhere' }), w = worldOf(PFM, [pub(22, { publicUrl: null, publicName: null, publicSub: null })], rl);
    await w.pf.unpublish(pub(22).id, { now: true });
    const rec = w.pf._state.forwards.find((x) => x.id === pub(22).id);
    return { calls: rl.calls.length, owed: !!(rec && rec.unpublishOwed) };
  };
  const t = await scene(PFm);
  ok(t.calls === 0 && !t.owed, 'P12 unpublishing a row that never had an address (another hub holds the relay): the relay never asked, no owed mark — never a false «still up» row', t);
  const red = await scene(copyOf(PF_REL, [['    const mayBeUp = !!(rec.publicUrl || rec.publicName || rec.unpublishOwed || rec.forwardGone || rec.orphan);', '    const mayBeUp = true;   // RED: every row asked']], 'p-never').PortForwardManager);
  judged(red.calls === 1, red.owed, 'P12 RED CONTROL (every row asked, in a copy): the held relay\'s refusal writes a «still up» row for an address that never was', red);
}
{
  const scene = async (PFM) => {
    const rl = relay(), w = worldOf(PFM, [pub(23, { hostId: 'h2' }), pub(24, { hostId: 'h2' }), pub(25, { forwardGone: true, unpublishOwed: { code: 'x', reason: 'r', since: 1 } })], rl);
    rl.hang.add(pub(25).publicName);   // an older owed removal the relay never answers: still OUT past its bound
    const pass = w.pf._owedPass('a leg');
    for (let i = 0; i < 300 && rl.calls.length < 1; i++) await tick(10);
    w.pf.onMachineUnpaired('h2', { now: true });
    await pass; for (let i = 0; i < 300 && w.pf._owedBusy; i++) await tick(10);
    return { calls: rl.calls.slice(), maxOut: rl.maxOut, kept: w.pf.list().filter((x) => x.hostId === 'h2' && x.forwardGone).length };
  };
  const t = await scene(PFm);
  judged(t.calls.length >= 1, t.maxOut === 1 && t.calls.length === 1 && t.kept === 2, 'P13 a machine removed while an owed removal is still out: its addresses wait in the owed pass — ONE out at the relay, their rows kept, owed', t);
  const red = await scene(copyOf(PF_REL, [["r.forwardGone)) this._owedPass('a removed machine')", "r.forwardGone)) (async () => { for (const rec of this._state.forwards.filter((r) => r.hostId === hostId && r.forwardGone)) await this._relayUnpublish(rec); })()   // RED: its own removals beside the pass\n    ; if (0) this._owedPass('a removed machine')"]], 'p-beside').PortForwardManager);
  judged(red.calls.length >= 1, red.maxOut === 2, 'P13 RED CONTROL (the machine\'s own removals beside the pass, in a copy): a SECOND removal out at the relay', red);
}
{
  const scene = async (PFM) => {
    const rl = relay({ files: [{ name: 'pf-now-theirs', mark: 'other' }] }); rl.refuse = false;
    const w = worldOf(PFM, [{ id: 'pf-orphan-pf-now-theirs', hostId: null, remotePort: null, label: 'pf-now-theirs', orphan: true, publicName: 'pf-now-theirs', unpublishOwed: { code: 'relay_orphan', reason: 'r', since: 1 } }], rl);
    w.pf._orphansAt = Date.now() + 60000;   // the folder's own judgement not due: only the re-read before the removal reads it
    const read = !!w.pf._state.forwards.find((x) => x.orphan && x.publicName === 'pf-now-theirs');   // the plant: the orphan row, read from its file
    await w.pf._owedPass('a leg');
    return { read, listed: rl.listed, calls: rl.calls.length, rows: w.pf.list().map((x) => x.id) };
  };
  const t = await scene(PFm);
  judged(t.read, t.listed === 1 && t.calls === 0 && !t.rows.length, 'P14 an orphan whose file carries ANOTHER hub\'s mark when its removal is due: read once more, never removed, its row leaves', t);
  const red = await scene(copyOf(PF_REL, [["        const still = rec.orphan ? await this._orphanStill(rec) : 'mine';", "        const still = 'mine';   // RED: the removal trusts the old judgement"]], 'p-trust').PortForwardManager);
  judged(red.read, red.listed === 0 && red.calls === 1, 'P14 RED CONTROL (the old judgement trusted, in a copy): another hub\'s file is asked to be removed', red);
}

{
  const scene = async (PFM) => {
    const rl = relay(), w = worldOf(PFM, [pub(26, { hostId: 'h3' }), pub(27, { hostId: 'h3' }), pub(28, { forwardGone: true, unpublishOwed: { code: 'x', reason: 'r', since: 1 } })], rl);
    rl.refuse = false;   // every removal answers (after its 20 ms): the pass is busy while the machine goes
    const pass = w.pf._owedPass('a leg');
    for (let i = 0; i < 300 && rl.calls.length < 1; i++) await tick(2);
    const busy = !!w.pf._owedBusy;   // the plant: the machine removed WHILE a pass runs
    w.pf.onMachineUnpaired('h3', { now: true });
    await pass; for (let i = 0; i < 300 && w.pf._owedBusy; i++) await tick(10);   // the «once more» round is the awaited pass's own
    return { busy, calls: rl.calls.slice(), maxOut: rl.maxOut, left: w.pf.list().map((x) => x.id) };
  };
  const t = await scene(PFm);
  judged(t.busy, t.calls.length === 3 && t.calls[0] === pub(28).publicName && t.maxOut === 1 && !t.left.length, 'P13 a machine removed WHILE a pass runs: that pass\'s «once more» round asks its addresses, ONE out at a time; confirmed ⇒ their rows leave', t);
  const red = await scene(copyOf(PF_REL, [['    if (this._owedBusy) { this._owedAgain = true; return; }', '    if (this._owedBusy) return;   // RED: an ask while a pass runs is lost']], 'p-lost').PortForwardManager);
  judged(red.busy, red.calls.length === 1 && red.left.length === 2, 'P13 RED CONTROL (an ask while a pass runs lost, in a copy): the removed machine\'s addresses wait for the next sweep', red);
}

{
  const scene = async (PFM) => {
    const rl = relay({ code: 'relay_held_elsewhere' }), w = worldOf(PFM, [pub(29, { ownerJob: 'jb-a', label: 'service: a', forwardGone: true, unpublishOwed: { code: 'relay_held_elsewhere', reason: 'r', since: 1 } })], rl);
    await w.pf.forward('__local__', 7129, {});   // a person's forward over the job's removed row (the old address the job's)
    const of = () => { const x = w.pf.list().find((y) => y.id === pub(29).id); return x && x.unpublishOwed ? x.unpublishOwed.ownerJob : 'no mark'; };
    const atRevive = of();
    w.pf._healRetryAt.delete(pub(29).id); await w.pf._owedPass('a leg'); const afterPass = of(), n1 = rl.calls.length;
    await w.pf.unpublishAgain(pub(29).id).catch(() => null); const afterTry = of(), n2 = rl.calls.length;
    return { atRevive, afterPass, afterTry, asked: [n1, n2] };
  };
  const t = await scene(PFm);
  judged(t.asked[0] === 1 && t.asked[1] === 2, t.atRevive === 'jb-a' && t.afterPass === 'jb-a' && t.afterTry === 'jb-a', 'P9b a refused retry — the owed pass\'s and a person\'s «Try again» — keeps whose old address it is (the old job\'s card still says it is up)', t);
  const red = await scene(copyOf(PF_REL, [["      rec.unpublishOwed = { code, reason, since: (was && was.since) || Date.now(), ...(was && was.ownerSet ? { ownerJob: was.ownerJob || null, ownerSet: true } : {}) };", "      rec.unpublishOwed = { code, reason, since: (was && was.since) || Date.now() };   // RED: the catch as at ce6b3b443"]], 'p-owner-lost').PortForwardManager);
  judged(red.asked[0] === 1, red.atRevive === 'jb-a' && red.afterPass === null, 'P9b RED CONTROL (the catch rebuilds the record, in a copy): the old job\'s mark is gone at the first refused retry', red);
}
{
  const rl = relay(), w = worldOf(PFm, [pub(30, { forwardGone: true, unpublishOwed: { code: 'x', reason: 'r', since: 1 } })], rl);
  await w.pf.forward('__local__', 7130, { owner: 'jb-c', label: 'service: c' });   // a service over a PERSON's removed row
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const up = JobManager.prototype._stillUpOf.call({ d: { getPorts: () => w.pf } }, { id: 'jb-c' }), row = w.pf.list().find((x) => x.id === pub(30).id);
  ok(up === false && !!(row && row.ownerJob === 'jb-c' && row.unpublishOwed && row.unpublishOwed.ownerSet && row.unpublishOwed.ownerJob === null), 'P10b a service over a person\'s removed row: its card never says the person\'s old address is its own (the mark names no job)', { up, row: row && row.unpublishOwed });
}

{
  // P9c (r5486): job A's removed row, a person's forward over it, removed again while the relay refuses, then job B's over it: the mark stays A's
  const scene = async (PFM) => {
    const rl = relay({ code: 'relay_held_elsewhere' }), w = worldOf(PFM, [pub(31, { ownerJob: 'jb-a', label: 'service: a', forwardGone: true, unpublishOwed: { code: 'relay_held_elsewhere', reason: 'r', since: 1 } })], rl);
    const of = () => { const x = w.pf.list().find((y) => y.id === pub(31).id); return x && x.unpublishOwed ? x.unpublishOwed.ownerJob : 'no mark'; };
    await w.pf.forward('__local__', 7131, {}); const one = of();
    await w.pf.unforward(pub(31).id, { now: true }); const gone = !!(w.pf._state.forwards.find((x) => x.id === pub(31).id) || {}).forwardGone;
    await w.pf.forward('__local__', 7131, { owner: 'jb-b', label: 'service: b' }); const two = of(), rec = w.pf._state.forwards.find((x) => x.id === pub(31).id);
    return { one, gone, two, owner: rec && rec.ownerJob };
  };
  const t = await scene(PFm);
  judged(t.one === 'jb-a' && t.gone, t.two === 'jb-a' && t.owner === 'jb-b', 'P9c a SECOND change of owner while the same removal is owed (a person, then a service): the mark still names the FIRST old owner — the address being taken down is still its', t);
  const red = await scene(copyOf(PF_REL, [['if (rec.unpublishOwed && !rec.unpublishOwed.ownerSet) { rec.unpublishOwed.ownerJob = was;', 'if (rec.unpublishOwed) { rec.unpublishOwed.ownerJob = was;']], 'p-mark-moves').PortForwardManager);
  judged(red.one === 'jb-a' && red.gone, red.two === null, 'P9c RED CONTROL (the mark written at every change, in a copy): it moves to the person — the first owner\'s address is no longer said', red);
}
{
  // P15 (r5486, S6): a service over a removed row waits (its publish refused while the old address is up); the removal CONFIRMED ⇒ the jobs engine asked to reconcile ONCE and the service's own address is up — no restart, no unlock, no timer
  const scene = async (PFM) => {
    const rl = relay(); rl.refuse = false;
    rl.frpPublish = async (name) => { rl.published.push(name); return { url: 'https://its-own-new.relay.example.test/', proto: 'http', name }; };
    const w = worldOf(PFM, [pub(32, { ownerJob: 'jb-s', label: 'service: s', unpublishOwed: { code: 'relay_held_elsewhere', reason: 'r', since: 1, ownerJob: null, ownerSet: true } })], rl);
    const asks = []; w.pf.getJobs = () => ({ forwardsReconcile: async (why) => { asks.push(why); await w.pf.publish(pub(32).id).catch(() => null); } });   // the engine's reconcile publishes a service that asks
    w.pf._healRetryAt.delete(pub(32).id); await w.pf._owedPass('a leg');
    for (let i = 0; i < 100 && !(w.pf.list().find((x) => x.id === pub(32).id) || {}).publicUrl; i++) await tick(5);
    await tick(20);   // (no second ask may follow: there is no timer)
    const row = w.pf.list().find((x) => x.id === pub(32).id);
    return { removed: rl.calls.length, asks: asks.length, url: row && row.publicUrl, owed: !!(row && row.unpublishOwed) };
  };
  const t = await scene(PFm);
  judged(t.removed === 1, t.asks === 1 && t.url === 'https://its-own-new.relay.example.test/' && !t.owed, 'P15 a confirmed removal on a job\'s live row: the jobs engine asked to reconcile ONCE — the waiting service\'s own address up with no restart', t);
  const red = await scene(copyOf(PF_REL, [["    if (rec.ownerJob) this._reconcileOwed = true;\n", "    if (false) this._reconcileOwed = true;   /* RED: nobody asked */\n"]], 'p-no-ask').PortForwardManager);
  judged(red.removed === 1, red.asks === 0 && !red.url, 'P15 RED CONTROL (no ask after the confirm, in a copy): the service stays unpublished until a restart or an unlock', red);
}
{
  // P15b (r5486 own read): ONE confirm settled twice — its late answer (a removal that had not answered in time) and the pass — asks ONCE, after the pass
  const scene = async (PFM) => {
    const rl = relay(); rl.refuse = false;
    const w = worldOf(PFM, [pub(33, { ownerJob: 'jb-u', label: 'service: u', unpublishOwed: { code: 'relay_unanswered', reason: 'r', since: 1, ownerJob: null, ownerSet: true } })], rl);
    const asks = []; let busyAtAsk = null; w.pf.getJobs = () => ({ forwardsReconcile: async (why) => { asks.push(why); busyAtAsk = !!w.pf._owedBusy; } });
    w.pf._healRetryAt.delete(pub(33).id); await w.pf._owedPass('a leg'); await tick(20);
    return { removed: rl.calls.length, asks: asks.length, busyAtAsk };
  };
  const t = await scene(PFm);
  judged(t.removed === 1, t.asks === 1 && t.busyAtAsk === false, 'P15b one confirm settled twice (its late answer, then the pass): the jobs engine asked ONCE, after the pass — never in its middle', t);
  const red = await scene(copyOf(PF_REL, [["    if (rec.ownerJob) this._reconcileOwed = true;\n", "    if (rec.ownerJob) { const jm = this.getJobs && this.getJobs(); if (jm) jm.forwardsReconcile('red'); }   /* RED: an ask at every settle */\n"]], 'p-two-asks').PortForwardManager);
  judged(red.removed === 1, red.asks === 2, 'P15b RED CONTROL (an ask at every settle, in a copy): two asks for one confirm, in the middle of the pass', red);
}

console.log('U the owed row, as a person reads it (r5561)');
{
  const PO = await import(pathToFileURL(path.join(REPO, 'src/lib/ports-owed.js')).href);
  const nameOf = (h) => (h === '__local__' ? 'This machine' : h);
  const scene = async (PFM) => {
    const rl = relay(), w = worldOf(PFM, [pub(40, { label: 'service: web', forwardGone: true, unpublishOwed: { code: 'relay_unpublish_unreloaded', reason: 'r', since: 1 } })], rl);
    const row = w.pf.list().find((x) => x.id === pub(40).id);
    return { row: !!row, words: row ? PO.owedRowText(row, { nameOf, service: 'web', why: 'why' }) : null };
  };
  const t = await scene(PFm);
  ok(!!(t.words && t.words.name === 'This machine:7140 — web' && t.words.url === pub(40).publicUrl && t.words.addressLead === 'Its address:' && t.words.press === 'Try again'),
    'U1 an owed row says WHAT it was (the machine and port, its service) and THE ADDRESS still up — in its text, beside why and the press with its words', t);
  const red = await scene(copyOf(PF_REL, [["      stillUpUrl: (r.forwardGone || r.orphan) && r.unpublishOwed ? r.publicUrl || null : null,", "      /* RED: the base's list — the address hidden */"]], 'p-no-address').PortForwardManager);
  judged(red.row, !!(red.words && !red.words.url), 'U1 RED CONTROL (the base\'s list, in a copy): the row has no address to say', red);
  const orphanW = PO.owedRowText({ orphan: true, label: 'pf-made-up', unpublishOwed: { code: 'relay_orphan' } }, { nameOf });
  ok(orphanW.name === 'A relay file of this hub: pf-made-up' && !orphanW.url && orphanW.addressLead === 'Its address is written in that relay file.', 'U1 an orphan row names its relay file, and says its address is written in that file (this hub never recorded it)', orphanW);
  // U2 / U3: THE LAWS OF THE STYLESHEET (the drawn half is the walk's pictures): read the rules as the browser would apply them
  const CSSTEXT = srcOf('public/style.css');
  const bodyOf = (text, sel) => { const r = cssRules(text).filter((x) => x.sel === sel); return r.length ? r[r.length - 1].body : ''; };
  const boxNeverEmpty = (text) => /flex-wrap:\s*wrap/.test(bodyOf(text, '.ports-row-owed')) && /min-width:\s*[1-9][\d.]*(em|px|rem)/.test(bodyOf(text, '.ports-row-owed > .ports-row-label')) && /flex:\s*1 0 100%/.test(bodyOf(text, '.ports-owed-detail'));
  const BLOCK0 = CSSTEXT.indexOf('/* B-73c4 (主开发 r5561)'), BLOCK1 = CSSTEXT.indexOf('.ports-words-wrap {');
  const base = BLOCK0 > 0 && BLOCK1 > BLOCK0 ? CSSTEXT.slice(0, BLOCK0) + CSSTEXT.slice(CSSTEXT.indexOf('}', BLOCK1) + 1) : null;
  ok(boxNeverEmpty(CSSTEXT), 'U2 an owed row WRAPS: its words take their own line and its name keeps a width — never squeezed to nothing beside them');
  ok(!!base && !boxNeverEmpty(base), 'U2 RED CONTROL (the base\'s rules): the row does not wrap and its name may shrink to nothing');
  const wraps = (text) => /overflow-wrap:\s*anywhere/.test(bodyOf(text, '.ports-words-wrap'));
  const SR = srcOf('src/lib/sidebar-rail.js');
  ok(wraps(CSSTEXT) && SR.includes('<div class="empty-hint ports-words-wrap">${escHtml(tr(\'A relay file in this home has no owner mark'), 'U3 the unmarked file\'s words WRAP (a folder path with no space breaks anywhere): the panel never scrolls sideways');
  ok(!!base && !wraps(base), 'U3 RED CONTROL (the base\'s rules): a long path cannot break — the panel scrolls sideways');
  // U4: the press carries its words (a phone has no hover)
  const pressHasWords = (src) => /_owedRetryBtn\(f, api, render\) \{[^]*?b\.innerHTML = `\$\{PORT_ICONS\.globeOff\}<span>\$\{escHtml\(tr\('Try again'\)\)\}<\/span>`;/.test(src);
  const BASE_PRESS = "    _owedRetryBtn(f, api, render, btn) {\n      return btn(PORT_ICONS.globeOff, tr('Try again'), async () => {";
  ok(pressHasWords(SR), 'U4 «Try again» carries its WORDS on the button (not only a tooltip) at every width');
  ok(!pressHasWords(BASE_PRESS), 'U4 RED CONTROL (the base\'s press: an icon whose only words are its tooltip): no words on the button');
  // U5 (r5572): the address is a LINK only when it is http(s) — a stored string of any other scheme is said as text, never an href
  const SCHEMES = ['javascript:alert(1)', 'data:text/html,made-up', 'tcp://made-up.relay.example.test:7000', 'https://made-up-ok.relay.example.test/'];
  const links = (M) => SCHEMES.map((u) => M.owedRowText({ forwardGone: true, hostId: '__local__', remotePort: 7150, stillUpUrl: u, unpublishOwed: { code: 'x' } }, { nameOf }));
  const got = links(PO);
  ok(got[0].link === null && got[1].link === null && got[2].link === null && got[3].link === SCHEMES[3] && got.every((w, i) => w.url === SCHEMES[i]),
    'U5 the address is a LINK only when it is http(s): a javascript:, data: or tcp:// string is said as TEXT (never an href); an https address is a link', got.map((w) => w.link));
  const POSRC = srcOf('src/lib/ports-owed.js'), poRed = path.join(dirOf('po'), 'ports-owed-any.mjs');
  fs.writeFileSync(poRed, anchored(POSRC, "  const link = /^https?:\\/\\/[^\\s\"'<>`]+$/i.test(String(url || '')) ? url : null;", "  const link = url;   /* RED: any string a link */", 'po-any-scheme'));
  const redLinks = links(await import(pathToFileURL(poRed).href));
  ok(redLinks[0].link === SCHEMES[0], 'U5 RED CONTROL (every stored string a link, in a copy): a javascript: address becomes an href', redLinks.map((w) => w.link));
}

console.log('I the instance address: a refused removal is owed and retried at a start (r5334)');
{
  const IU_REL = 'src/server/instance-url.js';
  const scene = async (IU) => {
    const d = dirOf('iurl'), f = path.join(d, 'instance-url.json');
    fs.writeFileSync(f, JSON.stringify({ desired: true, auto: false, sub: 'made-sub', url: 'https://made-sub.relay.example.test/', proto: 'http', at: 1, error: null }));
    const asked = []; let refuse = true;
    const plugins = { relayStatus: () => ({ configured: true }), frpUnpublish: async (n) => { asked.push(n); await tick(5); if (refuse) throw Object.assign(new Error('a made-up refusal'), { code: 'relay_held_elsewhere' }); return { ok: true, confirmed: true }; } };
    const mk = () => IU.create({ dataDir: d, plugins, port: 1, serverSetting: () => null, log: () => { } });
    const iu = mk(); const r1 = await iu.unpublish(); const owed1 = !!JSON.parse(fs.readFileSync(f, 'utf8')).unpublishOwed; iu.stop();
    refuse = false;
    const iu2 = mk(); iu2.restore({ firstMs: 5 });   // a START over the same file: the owed mark is its record
    for (let i = 0; i < 60 && (asked.length < 2 || iu2.status().published); i++) await tick(10);
    const st = iu2.status(), disk = JSON.parse(fs.readFileSync(f, 'utf8')); iu2.stop();
    for (const x of [iu, iu2]) { try { x._hold && x._hold.stop && x._hold.stop(); } catch { } }
    return { asked: asked.length, r1: { error: !!(r1 && r1.error), code: r1 && r1.code }, owed1, published: st.published, error: st.error, diskOwed: !!disk.unpublishOwed, diskUrl: disk.url || null };
  };
  const [t, red] = await Promise.all([scene(require(path.join(REPO, IU_REL))), scene(copyOf(IU_REL, [['    if (state.unpublishOwed && !state.desired) retryOwed(firstMs);', '    // RED: a start does not retry']], 'iu-no-retry'))]);
  judged(t.asked >= 1 && t.r1.code === 'relay_held_elsewhere', !!(t.asked >= 2 && t.r1.error && t.owed1 && t.published === false && t.error === null && !t.diskOwed && !t.diskUrl),
    'I1 the instance address\'s refused removal: kept, said and OWED on disk; a start asks the relay again — confirmed ⇒ the address cleared', t);
  judged(red.asked >= 1 && red.r1.code === 'relay_held_elsewhere', !!(red.asked === 1 && red.published === true && red.diskOwed), 'I1 RED CONTROL (no retry at a start, in a copy): the address stays up, owed, until someone presses Unpublish again', red);
}
{
  const IU_REL = 'src/server/instance-url.js';
  const world = (IU, { refusals = 2, slowMs = 5, paceMs = 20 } = {}) => {
    const d = dirOf('iurl'), f = path.join(d, 'instance-url.json');
    fs.writeFileSync(f, JSON.stringify({ desired: true, auto: false, sub: 'made-sub', url: 'https://made-sub.relay.example.test/', proto: 'http', at: 1, error: null }));
    const ev = [];
    const plugins = { relayStatus: () => ({ configured: true }),
      frpUnpublish: async () => { ev.push('unpublish+'); await tick(slowMs); ev.push('unpublish-'); if (ev.filter((x) => x === 'unpublish-').length <= refusals) throw Object.assign(new Error('a made-up refusal'), { code: 'relay_unpublish_unreloaded' }); return { ok: true, confirmed: true }; },
      frpPublish: async () => { ev.push('publish'); return { url: 'https://made-sub.relay.example.test/', proto: 'http' }; } };
    const iu = IU.create({ dataDir: d, plugins, port: 1, serverSetting: () => null, log: () => { }, owedPaceMs: paceMs });
    return { d, f, ev, iu, disk: () => JSON.parse(fs.readFileSync(f, 'utf8')) };
  };
  const done = (w) => { try { w.iu.stop(); } catch { } try { w.iu._hold && w.iu._hold.stop && w.iu._hold.stop(); } catch { } };
  // I2: refused at the press, refused again at the pace, confirmed at the next — the pace re-arms after a refusal
  const pace = async (IU) => {
    const w = world(IU); await w.iu.unpublish();
    for (let i = 0; i < 60 && (w.ev.filter((x) => x === 'unpublish-').length < 3 || w.iu.status().published); i++) await tick(10);
    const r = { asks: w.ev.filter((x) => x === 'unpublish-').length, published: w.iu.status().published, owed: !!w.disk().unpublishOwed }; done(w); return r;
  };
  const [t2, red2] = await Promise.all([pace(require(path.join(REPO, IU_REL))), pace(copyOf(IU_REL, [['      askRelay();   // its answer applied, the pace re-armed by the door', '      if (stopped) return; askRelay().then(() => { stopped = true; });   /* RED: a refused retry never asks again */']], 'iu-no-rearm'))]);
  judged(t2.asks >= 2, t2.asks === 3 && t2.published === false && !t2.owed, 'I2 the instance address on the PACE: a refused retry is asked again; confirmed ⇒ cleared', t2);
  judged(red2.asks >= 2, red2.asks === 2 && red2.published === true && red2.owed, 'I2 RED CONTROL (no re-arm after a refused retry, in a copy): owed for good', red2);
  // I3: a Publish while a retry is OUT at the relay waits for it: its file is written after the removal, never removed under it
  const race = async (IU) => {
    const w = world(IU, { refusals: 1, slowMs: 60, paceMs: 5 }); await w.iu.unpublish();
    for (let i = 0; i < 200 && w.ev.length < 3; i++) await tick(2);   // the pace's retry is OUT (its removal started)
    const out = w.ev[w.ev.length - 1] === 'unpublish+';
    const pub = await w.iu.publish({}).then((x) => !!(x && x.url), (e) => 'refused: ' + (e && e.message));
    await tick(80);
    const r = { out, pub, ev: w.ev.slice(), published: w.iu.status().published, owed: !!w.disk().unpublishOwed }; done(w); return r;
  };
  const [t3, red3] = await Promise.all([race(require(path.join(REPO, IU_REL))), race(copyOf(IU_REL, [["    if (owedOut && (await within(owedOut)).late) throw Object.assign(new Error(stillOutWords().replace('try again then', 'publish again then')), { code: 'relay_removal_out' });", "    /* RED: a retry out is not waited for */"]], 'iu-race'))]);
  judged(t3.out, t3.pub === true && t3.ev.join(',') === 'unpublish+,unpublish-,unpublish+,unpublish-,publish' && t3.published === true && !t3.owed, 'I3 a Publish while a retry is OUT: it waits for the removal, then writes its file — published, nothing owed', t3);
  judged(red3.out, red3.ev.indexOf('publish') < red3.ev.lastIndexOf('unpublish-'), 'I3 RED CONTROL (the retry out not waited for, in a copy): the publish writes its file while the removal is still out — the removal lands after it', red3);
  // I4 (r5421): a press refused, then two paced retries refused the SAME way: ONE write of the file (the press's) — none on the pace
  const quiet = async (IU) => {
    const FC = require(path.join(REPO, 'src/fd-close.js')), real = FC.renameSynced; let writes = 0;
    FC.renameSynced = function (from, to, ...a) { if (String(to).endsWith('instance-url.json')) writes++; return real.call(this, from, to, ...a); };
    try {
      const w = world(IU, { refusals: 99, paceMs: 15 }); writes = 0;
      await w.iu.unpublish();
      for (let i = 0; i < 100 && w.ev.filter((x) => x === 'unpublish-').length < 3; i++) await tick(10);
      const r = { asks: w.ev.filter((x) => x === 'unpublish-').length, writes, owed: !!w.disk().unpublishOwed }; done(w); return r;
    } finally { FC.renameSynced = real; }
  };
  const t4 = await quiet(require(path.join(REPO, IU_REL)));
  const red4 = await quiet(copyOf(IU_REL, [['    if (code !== state.unpublishOwed.code || words !== state.error) { state.unpublishOwed = { code, since: state.unpublishOwed.since }; state.error = words; save(); emit(); }', '    { state.unpublishOwed = { code, since: state.unpublishOwed.since }; state.error = words; save(); emit(); }   /* RED: every refused answer written */']], 'iu-pace-writes'));
  judged(t4.asks >= 3, t4.writes === 1 && t4.owed, 'I4 a refused press, then two paced retries refused the same way: the file written ONCE (the press) — never a synced write on the pace', t4);
  judged(red4.asks >= 3, red4.writes >= 3, 'I4 RED CONTROL (every refused retry written, in a copy): the file rewritten on the pace', red4);
  // I5 (r5486): a person's Unpublish while a retry is OUT and never answers (a hung home folder): it waits at most its bound, then asks the relay itself
  const hung = async (IU) => {
    const d = dirOf('iurl'), f = path.join(d, 'instance-url.json');
    fs.writeFileSync(f, JSON.stringify({ desired: true, auto: false, sub: 'made-sub', url: 'https://made-sub.relay.example.test/', proto: 'http', at: 1, error: null }));
    let n = 0; const plugins = { relayStatus: () => ({ configured: true }), frpUnpublish: async () => { n++; if (n === 1) throw Object.assign(new Error('a made-up refusal'), { code: 'relay_held_elsewhere' }); if (n === 2) return new Promise(() => { }); return { ok: true, confirmed: true }; } };
    const iu = IU.create({ dataDir: d, plugins, port: 1, serverSetting: () => null, log: () => { }, owedPaceMs: 5, owedWaitMs: 60 });
    await iu.unpublish();
    for (let i = 0; i < 100 && n < 2; i++) await tick(5);   // the pace's retry is OUT and hangs
    const out = n === 2;
    const press = await Promise.race([iu.unpublish().then((x) => 'answered:' + ((x && x.code) || 'ok'), () => 'answered:threw'), tick(400).then(() => 'still waiting')]);   // the bound is 60 ms: 400 ms is past it many times over
    const r = { out, press, asks: n, published: iu.status().published }; try { iu.stop(); iu._hold && iu._hold.stop && iu._hold.stop(); } catch { } return r;
  };
  const [t5, red5] = await Promise.all([hung(require(path.join(REPO, IU_REL))), hung(copyOf(IU_REL, [["    if (owedOut && (await within(owedOut)).late) return { status: status(), error: stillOutWords(), code: 'relay_removal_out' };", "    if (owedOut) await owedOut;   /* RED: the wait unbounded */"]], 'iu-wait-unbounded'))]);
  judged(t5.out, t5.press === 'answered:relay_removal_out' && t5.asks === 2 && t5.published === true, 'I5 a person\'s Unpublish while a retry hangs at the relay: answered BY NAME once its bound passes — never held without end, never a second ask beside the one out (the address still said up)', t5);
  judged(red5.out, red5.press === 'still waiting', 'I5 RED CONTROL (the wait unbounded, in a copy): the press is held as long as the hung retry', red5);
  // I6 (r5486 own read): the press's OWN ask slow past its bound: answered at its bound (still up, relay_unanswered), the late answer APPLIED when it comes
  const slow = async (IU) => {
    const d = dirOf('iurl'), f = path.join(d, 'instance-url.json');
    fs.writeFileSync(f, JSON.stringify({ desired: true, auto: false, sub: 'made-sub', url: 'https://made-sub.relay.example.test/', proto: 'http', at: 1, error: null }));
    let asked = 0, answered = false; const plugins = { relayStatus: () => ({ configured: true }), frpUnpublish: async () => { asked++; await tick(250); answered = true; return { ok: true, confirmed: true }; } };
    const iu = IU.create({ dataDir: d, plugins, port: 1, serverSetting: () => null, log: () => { }, owedPaceMs: 99999, owedWaitMs: 50 });
    const r = await iu.unpublish(); const answeredAtPress = answered, atPress = iu.status().published;   // the FACT, never a wall clock: had the relay answered when the press returned?
    for (let i = 0; i < 100 && iu.status().published; i++) await tick(10);
    const out = { asked, answeredAtPress, code: r && r.code, atPress, after: iu.status().published, owed: !!JSON.parse(fs.readFileSync(f, 'utf8')).unpublishOwed }; try { iu.stop(); iu._hold && iu._hold.stop && iu._hold.stop(); } catch { } return out;
  };
  const [t6, red6] = await Promise.all([slow(require(path.join(REPO, IU_REL))), slow(copyOf(IU_REL, [['    const a = await within(askRelay());', '    const a = await askRelay();   /* RED: the press\'s own ask unbounded */']], 'iu-press-unbounded'))]);
  judged(t6.asked === 1, t6.code === 'relay_unanswered' && t6.answeredAtPress === false && t6.atPress === true && t6.after === false && !t6.owed, 'I6 a press whose OWN ask has not answered in its bound: answered then (still up, relay_unanswered) — and the late confirmation is applied when it comes', t6);
  judged(red6.asked === 1, red6.answeredAtPress === true, 'I6 RED CONTROL (the press\'s own ask unbounded, in a copy): the press held as long as the relay', red6);
  // I3b (r5486 own read): a Publish while a removal hangs at the relay: refused BY NAME at its bound — never a new file written under a removal still out
  const pubOver = async (IU) => {
    const d = dirOf('iurl'), f = path.join(d, 'instance-url.json');
    fs.writeFileSync(f, JSON.stringify({ desired: true, auto: false, sub: 'made-sub', url: 'https://made-sub.relay.example.test/', proto: 'http', at: 1, error: null }));
    let n = 0, pubs = 0; const plugins = { relayStatus: () => ({ configured: true }), frpPublish: async () => { pubs++; return { url: 'https://made-sub.relay.example.test/', proto: 'http' }; },
      frpUnpublish: async () => { n++; if (n === 1) throw Object.assign(new Error('a made-up refusal'), { code: 'relay_held_elsewhere' }); return new Promise(() => { }); } };
    const iu = IU.create({ dataDir: d, plugins, port: 1, serverSetting: () => null, log: () => { }, owedPaceMs: 5, owedWaitMs: 60 });
    await iu.unpublish(); for (let i = 0; i < 100 && n < 2; i++) await tick(5);
    const out = n === 2;
    const r = await Promise.race([iu.publish({}).then(() => 'published', (e) => 'refused:' + (e && e.code)), tick(1500).then(() => 'still waiting')]);
    const o = { out, r, pubs }; try { iu.stop(); iu._hold && iu._hold.stop && iu._hold.stop(); } catch { } return o;
  };
  const [t3b, red3b] = await Promise.all([pubOver(require(path.join(REPO, IU_REL))), pubOver(copyOf(IU_REL, [["    if (owedOut && (await within(owedOut)).late) throw Object.assign(new Error(stillOutWords().replace('try again then', 'publish again then')), { code: 'relay_removal_out' });", "    /* RED: a removal out not waited for */"]], 'iu-publish-under'))]);
  judged(t3b.out, t3b.r === 'refused:relay_removal_out' && t3b.pubs === 0, 'I3b a Publish while a removal hangs at the relay: refused BY NAME at its bound — no file written under a removal still out', t3b);
  judged(red3b.out, red3b.pubs === 1, 'I3b RED CONTROL (the removal out not waited for, in a copy): the new file written while the removal is still out — it can land after it', red3b);
  // I7 (r5515): the pace's timer, armed before a person's press, fires DURING that press's ask (held by a placed gate): the door RETURNS the ask out — ONE call reaches the relay
  const beside = async (IU) => {
    const d = dirOf('iurl'), f = path.join(d, 'instance-url.json');
    fs.writeFileSync(f, JSON.stringify({ desired: true, auto: false, sub: 'made-sub', url: 'https://made-sub.relay.example.test/', proto: 'http', at: 1, error: null }));
    let n = 0, held = false, open = null; const gate = new Promise((r) => { open = r; });
    const plugins = { relayStatus: () => ({ configured: true }), frpUnpublish: async () => { n++; if (n === 2) { held = true; await gate; held = false; } throw Object.assign(new Error('a made-up refusal'), { code: 'relay_held_elsewhere' }); } };
    const iu = IU.create({ dataDir: d, plugins, port: 1, serverSetting: () => null, log: () => { }, owedPaceMs: 30, owedWaitMs: 5000 });
    await iu.unpublish();                       // refused: owed, the pace's timer ARMED (30 ms)
    const press = iu.unpublish();               // a person's press at once: its own ask (the 2nd call) is held at the gate
    for (let i = 0; i < 100 && !held; i++) await tick(2);
    const heldAcross = held; await tick(150);   // the pace's 30 ms pass five times over while that ask is held
    const during = n; open(); await press;
    const o = { heldAcross, during }; try { iu.stop(); iu._hold && iu._hold.stop && iu._hold.stop(); } catch { } return o;
  };
  const [t7, red7] = await Promise.all([beside(require(path.join(REPO, IU_REL))), beside(copyOf(IU_REL, [['    if (owedOut) return owedAsk;', '    /* RED: a second ask beside the one out */']], 'iu-ask-beside'))]);
  judged(t7.heldAcross, t7.during === 2, 'I7 the pace\'s timer firing while a press\'s ask is out: the door RETURNS the ask out — ONE call at the relay (the refusing press, then the held one), never a second beside it', t7);
  judged(red7.heldAcross, red7.during >= 3, 'I7 RED CONTROL (the door starts a second ask beside the one out, in a copy): asks at the relay beside the one out — and, the «out» record overwritten, the pace asking again and again', red7);
}

console.log('J2 the jobs engine never takes a person\'s forward by the job\'s own row id (r5334)');
{
  const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
  const JMred = copyOf('src/jobs.js', [["    if (job._pfId) return job._pfId === rec.id && this._claimLabels(job).includes(rec.label);", "    if (job._pfId) return job._pfId === rec.id;   // RED: bee1c1b8f's acceptance by id alone"], ["id = rec && (rec.ownerJob ? rec.ownerJob === job.id : this._claimLabels(job).includes(rec.label)) ? rec.id : null; } catch { }", "id = rec && (!rec.ownerJob || rec.ownerJob === job.id) ? rec.id : null; } catch { }   // RED"]], 'jobs-by-id').JobManager;
  const scene = async (K) => {
    const job = { id: 'jb-j', kind: 'service', name: 'web', _pfId: 'pf-__local__-7130', publish: true, ports: [7130] };
    const person = { id: 'pf-__local__-7130', hostId: '__local__', remotePort: 7130, label: '', ownerJob: null }, release = { ...person, label: 'service: web' };
    const asked = [];
    const ctx = Object.create(K.prototype); ctx.labelOf = (j) => j.name; ctx._touch = () => { }; ctx._endUrlCheck = () => { }; ctx.d = { getPorts: () => ({ list: () => [person], unpublish: async (id) => { asked.push('unpublish ' + id); }, unforward: async (id) => { asked.push('unforward ' + id); } }), log: () => { } };
    const own = { person: K.prototype._isJobForward.call(ctx, job, person), release: K.prototype._isJobForward.call(ctx, job, release) };
    await K.prototype._teardownPublish.call(ctx, job, {});
    return { own, asked };
  };
  const t = await scene(JobManager);
  ok(t.own.person === false && t.own.release === true && !t.asked.length, 'J2 a person\'s forward on the job\'s old port (its row id the job\'s): never the job\'s — its stop removes nothing; the release\'s own row (its «service: …» label) still is', t);
  const red = await scene(JMred);
  ok(red.own.person === true && red.asked.length === 2, 'J2 RED CONTROL (acceptance by the row id alone, in a copy): the job\'s stop removes the person\'s forward', red);
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

console.log('R the Ports row of a revived row says whose its shown address is (r5486)');
{
  const K = "That address is its earlier owner's and is still being taken down.";
  const SR = srcOf('src/lib/sidebar-rail.js'), ZH = srcOf('src/lib/i18n-zh.js'), JA = srcOf('src/lib/i18n-ja.js');
  ok(SR.includes("tr('That address is its earlier owner\\'s and is still being taken down.')") && SR.includes('const earlier = !!o.ownerSet && (o.ownerJob || null) !== (f.ownerJob || null);') && ZH.includes(JSON.stringify(K) + ':') && JA.includes(JSON.stringify(K) + ':'),
    'R the owed row of a revived row (its mark names an owner other than the row\'s) says the shown address is its earlier owner\'s, still being taken down — en, zh, ja through the translator');
}

console.log('L nothing synchronous on the loop in the relay\'s removal, listing and hub-id read');
{
  const F = srcOf('src/plugins/frp.js');
  const block = (a, b) => { const i = F.indexOf(a), j = F.indexOf(b, i + 1); return i >= 0 && j > i ? F.slice(i, j) : null; };
  const un = block('      async unpublish(name) {', '      async proxyFiles() {'), ls = block('      async proxyFiles() {', '        return { held: false, own: !!ownRunPid(), folder: dir, files };'), hid = block('    const hubIdNow = async () => {', '    const OWNER_RE =');
  ok(!!un && !!ls && !!hid && ![un, ls, hid].some((s) => /\b[a-zA-Z]+Sync\(/.test(s)), 'L the relay\'s removal, its listing and its hub-id read name no synchronous fs call in their own text (fs.promises; the pid-file read is the release\'s)', { un: !!un, ls: !!ls, hid: !!hid });
  ok((F.split('const toml = ownerLine(await hubIdNow()) + `[[proxies]]').length - 1) === 2, 'L both proxy files this instance writes carry the OWNER MARK (this hub\'s id) on their first line');
}

if (skipped) console.log(`${skipped} named skip(s) — a plant never read, not judged`);
report();
