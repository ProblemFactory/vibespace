#!/usr/bin/env node
// test-pool-pin-durable — lane lg-group-parents (B-526c, unit 2; its cure, 主开发 r1070): THE PERSON'S POOL PIN IS ON DISK BEFORE ITS
// ANSWER — and THE RECORD IS THE ONE TRUTH OF WHAT THE PERSON LAST CHOSE: it says «pinned to this member» AND «cleared» (automatic),
// each with its time and who; the session meta's `poolPin` is its copy. FAST (real processes, no server, no CLI).
//   ① PURE — the record's text both ways (a pin, a clear's mark); WHO DECIDES (the record whenever it exists; an OLDER hub's later
//      pin, or its bare-null clear written after the record, is the meta's — the one bound where the files' times are read); the
//      boot's decision written back into the meta; ONE listing a pool; a record that cannot be read said by name; an older tree's
//      data reads as before; the sweep; the WIRING (the two LOCAL restore sites restore the pin through the record right before
//      the ONE pin expression; the pin's door writes the record first; the meta's copy paced; the record's calls on the timed wrapper)
//   ② THE ANSWER BEFORE THE META'S DISK — a REAL process (a codex pool of two members, one conversation, its session meta's writes
//      HELD): a record that cannot be written refuses the pin by name, nothing changed; the pin answered, the record names it, the
//      meta names nothing; a pin naming a member no longer in the pool — the chooser falls to the automatic choice
//   ③ THE KILLS — real processes, each with its red: a pin then a kill (the pin back; RED the record cut, RED the boot's read cut);
//      r1070 MUST 1: pin A landed, a CLEAR with the meta held, kill ⇒ no pin (RED: the clear that removes its record ⇒ A back);
//      r1070 MUST 2: pin A, clear, pin B with the meta held, kill, boot 1, an unrelated meta save, boot 2 ⇒ B (RED: no write-back
//      and the stamped clear read as an older hub's bare null ⇒ the pin dropped)
// Run: node scripts/test-pool-pin-durable.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SELF = fileURLToPath(import.meta.url);
const J = (x) => JSON.stringify(x);
const say = (o) => fs.writeSync(1, 'FACTS ' + J(o) + '\n');   // synchronous: a SIGKILL right after never loses it
const SOCK = 'cw-pin1';

// ── THE CHILD (`write…`: the person's acts, then the kill · `boot`: the restore's own calls over the same folder) ──
if (process.argv[2] === '--child') {
  const [, , , role, root, mutant] = process.argv;
  if (mutant) { for (const m of mutant.split(',').filter(Boolean)) { const [rel, copy] = m.split('='); const real = path.join(REPO, rel); require.cache[real] = { id: real, filename: real, loaded: true, exports: require(copy), children: [], paths: [] }; } }
  const dataDir = path.join(root, 'data'), metaDir = path.join(dataDir, 'session-meta'), metaFile = path.join(metaDir, SOCK + '.json');
  const PR = require(path.join(REPO, 'src/pool-pin-record.js'));
  const readMeta = () => { try { return JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { return null; } };
  const metaPinOf = (m) => (m && m.poolPin && typeof m.poolPin === 'object' ? (m.poolPin.cleared ? 'cleared' : m.poolPin.memberId) : m && m.poolPin === null ? null : undefined);
  if (role.startsWith('write')) {
    process.env.CODEX_HOME = path.join(root, 'codex-home'); fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
    const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
    const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
    const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
    const cam = new AccountManager({ dataDir });
    const sub = (name) => { const { id } = cam.createCodexSubscription({ name }); fs.writeFileSync(path.join(cam.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name, id_token: 'x.e30.x' } })); return id; };
    const A = sub('Cx A'), B = sub('Cx B');
    const CP = cam.createPool({ name: 'Cx', backend: 'codex' }).id; cam.setPoolTarget(CP, A);
    fs.mkdirSync(metaDir, { recursive: true }); fs.writeFileSync(metaFile, J({ accountId: CP, backend: 'codex', name: 'x', createdAt: Date.now() }));
    // the session meta store: writes LAND (the file, synchronously) until HELD — then the pace never comes
    let held = false;
    const asked = [];
    const metaStore = { readSessionMeta: () => readMeta(), writeSessionMeta: (sock, m, o) => { asked.push({ durable: !!(o && o.durable), pin: metaPinOf(m), held }); if (held) return new Promise(() => {}); fs.writeFileSync(metaFile, J(m)); return Promise.resolve(true); } };
    const cs = new Map(); cs.set('s-x', { backend: 'codex', mode: 'chat', host: null, _webuiId: 's-x', _accountId: CP, sockName: SOCK, name: 'x', _heldPoolMember: A, createdAt: Date.now() });
    const eng = engMod.create({ app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: path.join(dataDir, 'usage-cache'), activeSessions: cs, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => cam, getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }), getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter }, getAutoResume: () => null, getQuotaProbe: () => null, getSessionMetaStore: () => metaStore });
    const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
    const pin = (m) => quiet(() => eng.setConversationPin('s-x', m));
    const rec = () => PR.read(dataDir, CP, SOCK).rec;
    if (role === 'write') {
      // a record that cannot be written (its pool folder a FILE) refuses by name and changes nothing; then the folder is freed
      const pinsDir = path.dirname(PR.recordPath(dataDir, CP, SOCK));
      fs.mkdirSync(path.dirname(pinsDir), { recursive: true }); fs.writeFileSync(pinsDir, 'not a folder');
      const refused = pin(A);   // the refused attempt names A — the act below names B (a cut record then loses the act's own pin)
      const afterRefusal = cs.get('s-x')._poolPin || null;
      fs.rmSync(pinsDir, { force: true });
      // a pin naming a member no longer in the pool: the chooser falls to the automatic choice (the pin kept by the tree's rule)
      const auto = quiet(() => eng.poolChooserForModel(CP, { model: 'gpt-5-codex' })), gone = quiet(() => eng.poolChooserForModel(CP, { model: 'gpt-5-codex', pin: 'cxs-gone0000' }));
      held = true;
      const r = pin(B);
      say({ role, A, B, refused: { ok: !!(refused && refused.ok), code: refused && refused.code, error: refused && refused.error, pin: afterRefusal }, chooser: { auto, gone },
        act: { ok: !!(r && r.ok), pinned: r && r.pinned && r.pinned.memberId }, record: rec(), metaPin: metaPinOf(readMeta()), metaWrites: asked });
    }
    if (role === 'write-clear') {   // r1070 MUST 1: pin A landed; the CLEAR with the meta held
      const p1 = pin(A); const metaA = metaPinOf(readMeta());
      held = true;
      const c = pin(null);
      say({ role, A, B, pinA: !!(p1 && p1.ok), metaA, clear: !!(c && c.ok), record: rec(), metaPin: metaPinOf(readMeta()) });
    }
    if (role === 'write-repin') {   // r1070 MUST 2: pin A, clear (both landed), pin B with the meta held
      pin(A); pin(null); const metaCleared = metaPinOf(readMeta());
      held = true;
      const p2 = pin(B);
      say({ role, A, B, metaCleared, pinB: !!(p2 && p2.ok), record: rec(), metaPin: metaPinOf(readMeta()) });
    }
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'boot' || role === 'boot-save') {
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    const meta = readMeta();
    const before = metaPinOf(meta), said = [], writes = [];
    // the restore site's own call (the WIRING leg reads it at both local sites): the listing, the write-back, the said line
    // the write-back through the REAL helper (writeBack: the pin only, over the copy as it stands) over a file-backed store
    const fileStore = { readSessionMeta: () => readMeta(), writeSessionMeta: (sock, m) => { writes.push(metaPinOf(m)); fs.writeFileSync(metaFile, J(m)); } };
    const r = PR.restorePin(dataDir, meta, SOCK, { listing: new Map(), write: PR.writeBack(fileStore, SOCK), say: (l) => said.push(l) });
    const pinNow = BR.poolPinFromMeta(meta);   // the ONE pin expression sessionFromMeta restores the pin through
    if (role === 'boot-save') { const m2 = readMeta() || {}; m2.name = 'renamed by an unrelated save'; fs.writeFileSync(metaFile, J(m2)); const t = Date.now() / 1000 + 5; fs.utimesSync(metaFile, t, t); }   // the next ordinary meta save — a NEW file time
    say({ role, before, from: r && r.from, pin: pinNow ? pinNow.memberId : null, wroteBack: !!(r && r.wroteBack), writes, after: metaPinOf(readMeta()), said });
    process.exit(0);
  }
}

// ── THE SUITE ──
const { ok, report } = checker();
const ROOT = scratch('pool-pin-durable');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('pool-pin-durable', REPO);
const PR = require(path.join(REPO, 'src/pool-pin-record.js'));

console.log('① PURE: the record says both, the record decides, the bound, the write-back, one listing, the wiring');
{
  const t = PR.textOf({ memberId: 'cxs-ab12', at: 1795000000000, by: 'user' }), back = PR.pinOf(t), tc = PR.textOf({ cleared: true, at: 7, by: 'user' }), bc = PR.pinOf(tc);
  const bad = [PR.textOf({ memberId: 'a b' }), PR.textOf(null), PR.pinOf('cxs-ab12'), PR.pinOf('x#y#z'), PR.pinOf('../x#1#user'), PR.pinOf('*other#1#user')];
  console.log('    ' + J({ t, back, tc, bc, bad }));
  ok(!!(t === 'cxs-ab12#1795000000000#user' && J(back) === J({ memberId: 'cxs-ab12', at: 1795000000000, by: 'user' }) && tc === '*cleared#7#user' && J(bc) === J({ cleared: true, at: 7, by: 'user' }) && bad.every((x) => x === null)),
    'the record\'s text names the member — or a CLEAR\'s mark — with the time and who, both ways; a text that is not one reads as none', { t, back, tc, bc, bad });
  const D = path.join(ROOT, 'pure', 'data'), metaDir = path.join(D, 'session-meta'); fs.mkdirSync(metaDir, { recursive: true });
  PR.write(D, 'pool-1', 'cw-a', { memberId: 'm-b', at: 200, by: 'user' });
  PR.write(D, 'pool-1', 'cw-c', { cleared: true, at: 250, by: 'user' });
  const run = (m, key = 'cw-a', opts = {}) => { const writes = []; const r = PR.restorePin(D, m, key, { write: (x) => writes.push(J(x.poolPin)), ...opts }); return { from: r ? r.from : null, pin: m.poolPin === undefined ? undefined : m.poolPin && (m.poolPin.cleared ? 'cleared' : m.poolPin.memberId), writes: writes.length }; };
  const filed = (pinValue, after) => { const mf = path.join(metaDir, 'cw-a.json'); fs.writeFileSync(mf, J({ accountId: 'pool-1', poolPin: pinValue })); const rp = PR.recordPath(D, 'pool-1', 'cw-a'), b = Date.now() / 1000; fs.lutimesSync(rp, b, b); fs.utimesSync(mf, b + (after ? 60 : -60), b + (after ? 60 : -60)); return JSON.parse(fs.readFileSync(mf, 'utf8')); };
  const cases = {
    none: run({ accountId: 'pool-1' }),
    older: run({ accountId: 'pool-1', poolPin: { memberId: 'm-a', at: 100 } }),
    same: run({ accountId: 'pool-1', poolPin: { memberId: 'm-b', at: 200, by: 'user', copy: true } }),
    staleOwnCopy: run({ accountId: 'pool-1', poolPin: { memberId: 'm-c', at: 300, by: 'user', copy: true } }),
    olderHubPin: run({ accountId: 'pool-1', poolPin: { memberId: 'm-c', at: 300 } }),
    clearRecorded: run({ accountId: 'pool-1', poolPin: { memberId: 'm-b', at: 200 } }, 'cw-c'),
    staleClearCopy: run({ accountId: 'pool-1', poolPin: { cleared: true, at: 150, by: 'user' } }),
    otherPool: run({ accountId: 'pool-2' }),
    olderTree: run({ accountId: 'pool-1', poolPin: { memberId: 'm-a', at: 100 } }, 'cw-none'),
    olderHubClearAfter: run(filed(null, true)),
    olderHubClearBefore: run(filed(null, false)),
  };
  console.log('    who decides: ' + J(cases));
  ok(!!(J(cases.none) === J({ from: 'record', pin: 'm-b', writes: 1 }) && J(cases.older) === J({ from: 'record', pin: 'm-b', writes: 1 }) && J(cases.same) === J({ from: 'record', pin: 'm-b', writes: 0 })
    && J(cases.olderHubPin) === J({ from: 'meta', pin: 'm-c', writes: 0 }) && J(cases.staleOwnCopy) === J({ from: 'record', pin: 'm-b', writes: 1 }) && J(cases.clearRecorded) === J({ from: 'record', pin: 'cleared', writes: 1 }) && J(cases.staleClearCopy) === J({ from: 'record', pin: 'm-b', writes: 1 })
    && J(cases.otherPool) === J({ from: null, pin: undefined, writes: 0 }) && J(cases.olderTree) === J({ from: null, pin: 'm-a', writes: 0 })
    && J(cases.olderHubClearAfter) === J({ from: 'meta', pin: null, writes: 0 }) && J(cases.olderHubClearBefore) === J({ from: 'record', pin: 'm-b', writes: 1 })),
    'THE RECORD DECIDES whenever it exists (a pin over an older copy; a CLEAR the record heard of over the old pin; the record\'s pin over this tree\'s stale cleared copy) and its decision is WRITTEN BACK where the meta said otherwise; the one bound — an older hub\'s OWN later pin (no copy mark), or its bare-null clear written after the record — is the meta\'s; THIS tree\'s own copy, even with a later time (a clock that stepped back), never wins; no record ⇒ the meta as before', cases);
  // r1094: a pool whose listing fails is said ONCE (three conversations of it, one line)
  const badPool = path.join(D, 'pool-pins', 'pool-3'); fs.writeFileSync(badPool, 'not a folder');
  const once = [], lst = new Map();
  for (const k of ['cw-1', 'cw-2', 'cw-3']) PR.restorePin(D, { accountId: 'pool-3' }, k, { listing: lst, say: (l) => once.push(l) });
  fs.rmSync(badPool, { force: true });
  ok(!!(once.length === 1 && /could not be read \(ENOTDIR\)/.test(once[0])), `a pool whose folder cannot be listed is SAID ONCE for its three conversations (${once.length})`, once);
  // r1094 — THE WRITE-BACK THROUGH THE REAL HELPER over the REAL session-meta store, with a sibling write of the same boot PENDING
  // (the restore's «no start» marker, persistNoStart's own paced write): the pin only, over the copy as it stands — the marker survives
  {
    const RD = path.join(ROOT, 'real'), META = path.join(RD, 'data', 'session-meta'), BUF = path.join(RD, 'data', 'session-buffers');
    fs.mkdirSync(META, { recursive: true }); fs.mkdirSync(BUF, { recursive: true });
    const store = require(path.join(REPO, 'src/server/session-stdout.js')).create({ rootDir: RD, BUFFERS_DIR: BUF, META_DIR: META, activeSessions: new Map(), engine: {}, recordUsageAttribution() { }, broadcastToSession() { }, broadcastActiveSessions() { } });
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    // both conversations' metas on disk BEFORE the store's first call (it lists the folder once): each one's next write is PACED
    for (const sock of ['cw-real', 'cw-red']) { fs.writeFileSync(path.join(META, sock + '.json'), J({ accountId: 'pool-r', backend: 'codex', name: 'x' })); PR.write(path.join(RD, 'data'), 'pool-r', sock, { memberId: 'm-b', at: 9, by: 'user' }); }
    const leg = (PRX, sock) => {
      const meta = store.readSessionMeta(sock);
      const marked = BR.persistNoStart(sock, meta, store);
      const pendingMarker = (store.readSessionMeta(sock) || {}).heldPoolOrigin === 'no-start' && !fs.readFileSync(path.join(META, sock + '.json'), 'utf8').includes('no-start');   // the marker PENDING (in the store, not yet in the file)
      const r = PRX.restorePin(path.join(RD, 'data'), meta, sock, { listing: new Map(), write: PRX.writeBack(store, sock) });
      const now = store.readSessionMeta(sock);
      return { marked, pendingMarker, wroteBack: !!(r && r.wroteBack), marker: now.heldPoolOrigin || null, pin: now.poolPin && now.poolPin.memberId };
    };
    const real = leg(PR, 'cw-real');
    const prsrc = fs.readFileSync(path.join(REPO, 'src/pool-pin-record.js'), 'utf8');
    const WHOLE = MUT.load('src/pool-pin-record.js', anchored(anchored(prsrc, '  return (pin) => {\n', '  return (pin, whole) => {\n', 'the write-back handed the whole copy'), '    const cur = readSessionMeta(sockFile) || {};\n', '    const cur = whole || {};\n', 'the whole copy read earlier written back'), 'whole-copy');
    const red = leg(WHOLE, 'cw-red');
    console.log('    the real helper: ' + J({ real, red }));
    ok(!!(real.marked && real.pendingMarker && real.wroteBack && real.marker === 'no-start' && real.pin === 'm-b'), 'the boot\'s write-back through the REAL helper over the real session-meta store: the pin written, the «no start» marker pending beside it SURVIVES (the pin only, over the copy as it stands)', real);
    ok(!!(red.marked && red.pendingMarker && red.wroteBack && red.marker === null && red.pin === 'm-b'), 'RED «the whole copy read earlier» (the tip\'s write-back): the pending «no start» marker is LOST', red);
  }
  // ONE listing a pool; a record that exists and cannot be read is said by name (a folder in its place)
  const listing = new Map(), said = [];
  for (const k of ['cw-a', 'cw-c', 'cw-x']) PR.restorePin(D, { accountId: 'pool-1' }, k, { listing, say: (l) => said.push(l) });
  fs.mkdirSync(PR.recordPath(D, 'pool-1', 'cw-dir'), { recursive: true });
  const r2 = PR.restorePin(D, { accountId: 'pool-1', poolPin: { memberId: 'm-a', at: 1 } }, 'cw-dir', { say: (l) => said.push(l) });
  console.log('    ' + J({ listings: listing.size, said, r2 }));
  ok(!!(listing.size === 1 && r2 === null && said.length === 1 && /the pin record of cw-dir could not be read \(EINVAL\) — the session meta's pin is used/.test(said[0])), 'the boot lists each pool\'s folder ONCE (three conversations, one listing); a record that exists and cannot be read is SAID by name (the meta\'s pin used)', { listings: listing.size, said });
  fs.rmSync(PR.recordPath(D, 'pool-1', 'cw-dir'), { recursive: true, force: true });
  fs.writeFileSync(path.join(path.dirname(PR.recordPath(D, 'pool-1', 'x')), 'cw-gone.swap-0a1b2c3d'), '');
  PR.write(D, 'pool-1', 'cw-gone', { memberId: 'm-b', at: 5, by: 'user' });
  const dropped = PR.sweep(D, (k) => k === 'cw-a' || k === 'cw-c');
  const left = fs.readdirSync(path.dirname(PR.recordPath(D, 'pool-1', 'x'))).sort();
  ok(!!(dropped === 2 && J(left) === J(['cw-a', 'cw-c'])), `the sweep: a gone conversation's record and a half-made swap go (${dropped}), the live ones stay (${J(left)})`, { dropped, left });
  const br = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  const SITE = /PinRecord\.restorePin\(path\.dirname\(META_DIR\), meta, sockFile, pinAtBoot\(sockFile\)\);/;
  const wiring = (src) => [...src.matchAll(/= sessionFromMeta\(meta, \{/g)].map((m) => { const at = m.index; return SITE.test(src.slice(Math.max(0, src.lastIndexOf('\n', src.lastIndexOf('\n', at) - 1)), at)); });
  const w = wiring(br), one = (br.match(/_poolPin:/g) || []).length === 1 && /_poolPin: poolPinFromMeta\(meta\),/.test(br);
  const helper = /const pinAtBoot = \(sockFile\) => \(\{ listing: pinListings, write: PinRecord\.writeBack\(\{ readSessionMeta, writeSessionMeta \}, sockFile\), say: /.test(br);
  const ue = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8'), ts = fs.readFileSync(path.join(REPO, 'src/timed-sync.js'), 'utf8'), pr = fs.readFileSync(path.join(REPO, 'src/pool-pin-record.js'), 'utf8');
  const writer = /const rec = pin \|\| \{ cleared: true, at: now, by \};[\s\S]{0,400}PinRecord\.write\(accounts\.dataDir, poolId, s\.sockName, rec\);[\s\S]{0,300}s\._poolPin = pin;\n  persistPoolPin\(s, pin \? null : rec\);/.test(ue) && !/\{ durable: true \}\);   \/\/ round 2 \(law B\): the owner's pin/.test(ue);
  const timed = /'pool-pin\.write': row\('write'/.test(ts) && /'pool-pin\.read': row\('read'/.test(ts) && (pr.match(/timedSync\('pool-pin\.(write|read)'/g) || []).length >= 4 && !/\bfs\.unlinkSync\(file\)/.test(pr);
  console.log('    the wiring: ' + J({ sites: w, onePinExpression: one, helper, writer, timed }));
  ok(!!(J(w) === J([true, true, false]) && one && helper && writer && timed), 'WIRING: the two LOCAL restore sites restore through the record right before the ONE pin expression (each pool listed once, the write-back through the meta writer, an unreadable record said); the pin\'s door writes the record first — a clear\'s mark too, never a removal — and the meta\'s copy is paced; the record\'s calls on the timed wrapper', { w, one, helper, writer, timed });
  const cut = wiring(anchored(br, '    PinRecord.restorePin(path.dirname(META_DIR), meta, sockFile, pinAtBoot(sockFile));   // B-526c unit 2 (r1070): the record decides, written back into the meta\n    const session = sessionFromMeta(meta, {', '    const session = sessionFromMeta(meta, {', 'a local site without the record', { count: 2 }));
  ok(!!(J(cut) === J([false, false, false])), 'RED «a restore site without the record»: the wiring leg reads it by name', cut);
}

/** one child of the world (a process this suite starts — the only one it may signal: its own bound) → its FACTS + how it ended */
function child(role, root, mutant = '') {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [SELF, '--child', role, root, mutant], { env: { ...process.env, VS_NO_REAL_CLI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const bound = setTimeout(() => c.kill('SIGKILL'), 60000);
    c.on('close', (status, signal) => {
      clearTimeout(bound);
      const line = out.split('\n').find((l) => l.startsWith('FACTS '));
      let facts = null; try { facts = line ? JSON.parse(line.slice(6)) : null; } catch { }
      resolve({ facts, status, signal, err: err.slice(-1200) });
    });
  });
}
const usrc = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8'), psrc = fs.readFileSync(path.join(REPO, 'src/pool-pin-record.js'), 'utf8');
const UE = (f) => `src/server/usage-pool-engine.js=${f}`, PRF = (f) => `src/pool-pin-record.js=${f}`;
const NO_RECORD = MUT.write('src/server/usage-pool-engine.js', anchored(usrc, '    try { PinRecord.write(accounts.dataDir, poolId, s.sockName, rec); }\n', '    try { }\n', 'the pin answered without its record'), 'no-record');
const NO_READ = MUT.write('src/pool-pin-record.js', anchored(psrc, '  const { rec, error } = read(dataDir, meta.accountId, key, listing);\n', '  const rec = null, error = null;\n', 'the boot without the record'), 'no-read');
const CLEAR_REMOVES = MUT.write('src/server/usage-pool-engine.js', anchored(usrc, '    try { PinRecord.write(accounts.dataDir, poolId, s.sockName, rec); }\n', "    try { if (pin) PinRecord.write(accounts.dataDir, poolId, s.sockName, rec); else require('fs').rmSync(PinRecord.recordPath(accounts.dataDir, poolId, s.sockName), { force: true }); }\n", 'a clear that removes its record'), 'clear-removes');
const NO_WRITEBACK = MUT.write('src/pool-pin-record.js', anchored(anchored(anchored(psrc, "  if (!same && typeof writeMeta === 'function') {", "  if (false) {", 'no write-back'), '  if (metaPin === null && metaAfter) return \'meta\';\n', "  if ((metaPin === null || (metaPin && metaPin.cleared)) && metaAfter) return 'meta';\n", 'the stamped clear read as a bare null'), '  if (mp === null) {\n', '  if (mp === null || (mp && mp.cleared)) {\n', 'its file time read as a bare null\'s'), 'no-writeback');
const pool = async (jobs, n) => { const out = new Array(jobs.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } })); return out; };
const world = (dir, writer, { wm = '', bm = '', boots = ['boot'] } = {}) => async () => { const d = path.join(ROOT, dir); const w = await child(writer, d, wm); const b = []; for (const r of boots) b.push(await child(r, d, bm)); return { w, b }; };
const t0 = Date.now();
const [G, RED1, RED2, M1, M1R, M2, M2R] = await pool([
  world('g', 'write'), world('r1', 'write', { wm: UE(NO_RECORD) }), world('r2', 'write', { bm: PRF(NO_READ) }),
  world('m1', 'write-clear'), world('m1r', 'write-clear', { wm: UE(CLEAR_REMOVES) }),
  world('m2', 'write-repin', { boots: ['boot-save', 'boot'] }), world('m2r', 'write-repin', { bm: PRF(NO_WRITEBACK), boots: ['boot-save', 'boot'] }),
], 4);
console.log(`    (the seven worlds, at most four at once, in ${Date.now() - t0} ms)`);

console.log('② THE ANSWER BEFORE THE META\'S DISK — a real process whose session meta\'s writes are held');
{
  const f = G.w.facts || {};
  console.log('    the writer: ' + J({ facts: f, signal: G.w.signal }) + (G.w.facts ? '' : ' — stderr: ' + G.w.err));
  ok(!!(f.refused && f.refused.ok === false && f.refused.code === 'pin_not_saved' && /could not be saved .* nothing changed; try again$/.test(f.refused.error || '') && f.refused.pin === null),
    'a record that cannot be written refuses the pin BY NAME (pin_not_saved, «nothing changed; try again») — the conversation stays unpinned', f.refused);
  ok(!!(f.act && f.act.ok && f.act.pinned === f.B && f.record && f.record.memberId === f.B && f.record.by === 'user' && f.metaPin === undefined),
    'THE ACT: the pin is ANSWERED with the meta\'s writes held — the record on disk names the member, the meta file names none (read from the disk: the stop lands between the two)', { act: f.act, record: f.record, metaPin: f.metaPin });
  ok(!!(Array.isArray(f.metaWrites) && f.metaWrites.length >= 1 && f.metaWrites.every((x) => x.durable === false)), 'the meta\'s copy is asked at its PACE (never a durable write)', f.metaWrites);
  ok(!!(f.chooser && f.chooser.gone === f.chooser.auto && f.chooser.auto), `a pin naming a member no longer in the pool: the chooser falls to the AUTOMATIC choice (${f.chooser && f.chooser.gone} = ${f.chooser && f.chooser.auto}) — the tree keeps such a pin and its pass says it is not usable there`, f.chooser);
  ok(G.w.signal === 'SIGKILL', `the writer was killed by SIGKILL right after its answer (${G.w.signal})`);
}
console.log('③ THE KILLS — real processes over the same folder');
{
  const b = G.b[0].facts || {};
  console.log('    the boot: ' + J(b) + (G.b[0].facts ? '' : ' — stderr: ' + G.b[0].err));
  ok(!!(G.b[0].facts && b.before === undefined && b.from === 'record' && b.pin === G.w.facts.B && b.wroteBack && b.after === G.w.facts.B), 'a pin then a kill: the meta named no pin; the record decides — the person\'s pin is back, and written BACK into the meta', b);
  ok(!!(RED1.w.facts && RED1.w.facts.act && RED1.w.facts.act.ok && RED1.w.facts.record === null && RED1.b[0].facts && RED1.b[0].facts.pin !== RED1.w.facts.B), 'RED «the pin answered without its record»: the same kill ⇒ the boot does not restore the pin the person was told (B)', { w: RED1.w.facts && RED1.w.facts.record, b: RED1.b[0].facts });
  ok(!!(RED2.w.facts && RED2.w.facts.record && RED2.b[0].facts && RED2.b[0].facts.pin === null && !RED2.b[0].facts.from), 'RED «the boot without the record»: the record on disk, the restore never reads it ⇒ no pin', RED2.b[0].facts);
  const m = M1.w.facts || {}, mb = M1.b[0].facts || {}, mr = M1R.b[0].facts || {};
  console.log('    MUST 1: ' + J({ writer: m, boot: mb, red: { writer: M1R.w.facts, boot: mr } }));
  ok(!!(m.pinA && m.metaA === m.A && m.clear && m.record && m.record.cleared === true && m.metaPin === m.A && M1.w.signal === 'SIGKILL'), 'r1070 MUST 1: pin A landed in the meta; the CLEAR is answered with its mark in the record (cleared, its time, who) while the meta still says A; then SIGKILL', m);
  ok(!!(mb.from === 'record' && mb.pin === null && mb.after === 'cleared' && mb.wroteBack), 'MUST 1: the boot — the record says CLEARED: no pin (automatic, as the person was told), the clear written back into the meta', mb);
  ok(!!(mr.pin === M1R.w.facts.A), 'RED «a clear that removes its record»: the same kill ⇒ the conversation comes back PINNED to A', mr);
  const r = M2.w.facts || {}, b1 = M2.b[0].facts || {}, b2 = M2.b[1].facts || {}, x1 = M2R.b[0].facts || {}, x2 = M2R.b[1].facts || {};
  console.log('    MUST 2: ' + J({ writer: r, boot1: b1, boot2: b2, red: { boot1: x1, boot2: x2 } }));
  ok(!!(r.metaCleared === 'cleared' && r.pinB && r.record && r.record.memberId === r.B && r.metaPin === 'cleared' && M2.w.signal === 'SIGKILL'), 'r1070 MUST 2: pin A, clear (both landed), pin B answered with the meta still «cleared»; then SIGKILL', r);
  ok(!!(b1.pin === r.B && b1.wroteBack && b1.after === r.B && b2.pin === r.B && b2.from === 'record' && !b2.wroteBack), 'MUST 2: boot 1 takes the record (B) and WRITES IT BACK; an unrelated meta save after it (a new file time); boot 2 — still B', { b1, b2 });
  // the red world's OWN members (each world mints its own)
  ok(!!(M2R.w.facts && x1.pin === M2R.w.facts.B && J(x1.writes) === J([]) && x1.after === 'cleared' && x2.pin === null), 'RED «no write-back AND the stamped clear read as a bare null» (both cut: with the write-back alone cut, the stamped clear never reaches the file-time bound and boot 2 still finds B — the pure leg\'s write counts pin the write-back itself): boot 1 B in memory only; boot 2 drops the person\'s pin', { x1, x2 });
}
report();
