#!/usr/bin/env node
// test-pool-pin-durable — lane lg-group-parents (B-526c, unit 2): THE PERSON'S POOL PIN IS ON DISK BEFORE ITS ANSWER. FAST (real
// processes, no server, no CLI).
// The pin route answered at once while the session meta's durable write — the pin's only record — was dropped by its one caller:
// a stop right after the answer lost the person's choice. Now the pin is ALSO a record of its own (src/pool-pin-record.js:
// data/pool-pins/<poolId>/<meta name>, a symlink whose target text names the member, the time and who), written synchronously
// before the answer; the meta's copy follows at its pace; the boot takes the newer of the two.
//   ① PURE — the record's text both ways; the boot's choice (none / older meta ⇒ the record; a newer meta pin wins; another
//      pool's record is never read; an OLDER tree's data — no record — reads as before); the sweep (a gone conversation's record
//      and a half-made `.swap-` go, a live one stays); the WIRING: the two LOCAL restore sites read the record right before the
//      ONE pin expression, the third (an ssh readopt — a remote conversation, never pinned) does not; the writer before persistPoolPin
//   ② THE ANSWER BEFORE THE META'S DISK — a REAL process (a codex pool of two members, one conversation; its session meta's
//      writes HELD): the pin answered; the record on disk names the member; the meta file names none; a cleared pin removes the
//      record before its answer; a record that cannot be written refuses the pin by name, nothing changed
//   ③ THE KILL BETWEEN THE TWO WRITES — that process SIGKILLed right after its answer; a SECOND real process restores over the
//      same folder through the restore's own two calls: the pin is back. REDs: the record write cut ⇒ the pin is lost to the
//      kill (the release's road); the boot's read cut ⇒ the same
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

// ── THE CHILD (`write`: the person's pin, then the kill · `boot`: the restore's own two calls over the same folder) ──
if (process.argv[2] === '--child') {
  const [, , , role, root, mutant] = process.argv;
  if (mutant) { for (const m of mutant.split(',').filter(Boolean)) { const [rel, copy] = m.split('='); const real = path.join(REPO, rel); require.cache[real] = { id: real, filename: real, loaded: true, exports: require(copy), children: [], paths: [] }; } }
  const dataDir = path.join(root, 'data'), metaDir = path.join(dataDir, 'session-meta'), metaFile = path.join(metaDir, SOCK + '.json');
  const PR = require(path.join(REPO, 'src/pool-pin-record.js'));
  const readMeta = () => { try { return JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch { return null; } };
  if (role === 'write') {
    process.env.CODEX_HOME = path.join(root, 'codex-home'); fs.mkdirSync(process.env.CODEX_HOME, { recursive: true });
    const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
    const engMod = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
    const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
    const cam = new AccountManager({ dataDir });
    const sub = (name) => { const { id } = cam.createCodexSubscription({ name }); fs.writeFileSync(path.join(cam.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name, id_token: 'x.e30.x' } })); return id; };
    const A = sub('Cx A'), B = sub('Cx B');
    const CP = cam.createPool({ name: 'Cx', backend: 'codex' }).id; cam.setPoolTarget(CP, A);
    // the conversation's FIRST meta on disk (as its spawn writes it), no pin yet
    fs.mkdirSync(metaDir, { recursive: true }); fs.writeFileSync(metaFile, J({ accountId: CP, backend: 'codex', name: 'x', createdAt: Date.now() }));
    // the session meta store with its writes HELD (the pace never comes): the stop lands between the record and the meta
    const held = [];
    const metaStore = { readSessionMeta: () => readMeta(), writeSessionMeta: (sock, m, o) => { held.push({ sock, durable: !!(o && o.durable), pin: m && m.poolPin ? m.poolPin.memberId : null }); return new Promise(() => {}); } };
    const cs = new Map(); cs.set('s-x', { backend: 'codex', mode: 'chat', host: null, _webuiId: 's-x', _accountId: CP, sockName: SOCK, name: 'x', _heldPoolMember: A, createdAt: Date.now() });
    const eng = engMod.create({ app: { get() { }, post() { }, put() { }, patch() { }, delete() { }, use() { }, locals: {} }, rootDir: root, USAGE_CACHE_DIR: path.join(dataDir, 'usage-cache'), activeSessions: cs, wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { }, serverNotice() { }, serverSetting: () => undefined, getAccounts: () => cam, getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }), getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter }, getAutoResume: () => null, getQuotaProbe: () => null, getSessionMetaStore: () => metaStore });
    const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
    // a record that cannot be written (its pool folder a FILE) refuses by name and changes nothing; then the folder is freed
    const pinsDir = path.dirname(PR.recordPath(dataDir, CP, SOCK));
    fs.mkdirSync(path.dirname(pinsDir), { recursive: true }); fs.writeFileSync(pinsDir, 'not a folder');
    const refused = quiet(() => eng.setConversationPin('s-x', B));
    const afterRefusal = cs.get('s-x')._poolPin || null;
    fs.rmSync(pinsDir, { force: true });
    // a pin, cleared: the record leaves before the answer
    const c1 = quiet(() => eng.setConversationPin('s-x', A)); const rec1 = PR.read(dataDir, CP, SOCK);
    const c2 = quiet(() => eng.setConversationPin('s-x', null)); const rec2 = PR.read(dataDir, CP, SOCK);
    // THE ACT: the person pins B — answered; the record names B; the meta file names nothing (its write held)
    const r = quiet(() => eng.setConversationPin('s-x', B));
    const rec = PR.read(dataDir, CP, SOCK), onDisk = readMeta();
    say({ role, A, B, refused: { ok: !!(refused && refused.ok), code: refused && refused.code, error: refused && refused.error, pin: afterRefusal }, cleared: { set: !!(c1 && c1.ok), rec1: rec1 && rec1.memberId, clear: !!(c2 && c2.ok), rec2 },
      act: { ok: !!(r && r.ok), pinned: r && r.pinned && r.pinned.memberId }, record: rec, metaPin: onDisk && onDisk.poolPin ? onDisk.poolPin.memberId : null, metaWrites: held });
    process.kill(process.pid, 'SIGKILL');
  }
  if (role === 'boot') {
    const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
    const meta = readMeta();
    const before = meta && meta.poolPin ? meta.poolPin.memberId : null;
    const took = PR.pinAtBoot(dataDir, meta, SOCK);   // the restore site's call (scripts: the WIRING leg reads it at both local sites)
    const pin = BR.poolPinFromMeta(meta);             // the ONE pin expression sessionFromMeta restores the pin through
    say({ role, before, took: took && took.memberId, pin });
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

console.log('① PURE: the record, the boot\'s choice, the sweep, the wiring');
{
  const t = PR.textOf({ memberId: 'cxs-ab12', at: 1795000000000, by: 'user' }), back = PR.pinOf(t);
  const bad = [PR.textOf({ memberId: 'a b' }), PR.textOf(null), PR.pinOf('cxs-ab12'), PR.pinOf('x#y#z'), PR.pinOf('../x#1#user')];
  console.log('    ' + J({ t, back, bad }));
  ok(!!(t === 'cxs-ab12#1795000000000#user' && J(back) === J({ memberId: 'cxs-ab12', at: 1795000000000, by: 'user' }) && bad.every((x) => x === null)), 'the record\'s text names the member, the time and who — both ways; a text that is not one reads as none (never a guess)', { t, back, bad });
  const D = path.join(ROOT, 'pure', 'data');
  PR.write(D, 'pool-1', 'cw-a', { memberId: 'm-b', at: 200, by: 'user' });
  const cases = {
    none: (() => { const m = { accountId: 'pool-1' }; const r = PR.pinAtBoot(D, m, 'cw-a'); return [r && r.memberId, m.poolPin && m.poolPin.memberId]; })(),
    older: (() => { const m = { accountId: 'pool-1', poolPin: { memberId: 'm-a', at: 100 } }; PR.pinAtBoot(D, m, 'cw-a'); return m.poolPin.memberId; })(),
    newer: (() => { const m = { accountId: 'pool-1', poolPin: { memberId: 'm-c', at: 300 } }; const r = PR.pinAtBoot(D, m, 'cw-a'); return [r, m.poolPin.memberId]; })(),
    otherPool: (() => { const m = { accountId: 'pool-2' }; const r = PR.pinAtBoot(D, m, 'cw-a'); return [r, m.poolPin || null]; })(),
    olderTree: (() => { const m = { accountId: 'pool-1', poolPin: { memberId: 'm-a', at: 100 } }; const r = PR.pinAtBoot(D, m, 'cw-none'); return [r, m.poolPin.memberId]; })(),
  };
  // A CLEARED pin (`poolPin: null`) carries no time: the two files' own mtimes decide — a meta written after the record is a clear
  // the record never heard of (an older release's), a meta written before it is a pin whose meta write was lost
  const metaDir = path.join(D, 'session-meta'); fs.mkdirSync(metaDir, { recursive: true });
  const cleared = (metaAfter) => {
    const mf = path.join(metaDir, 'cw-a.json'); fs.writeFileSync(mf, J({ accountId: 'pool-1', poolPin: null }));
    const rp = PR.recordPath(D, 'pool-1', 'cw-a'), base = Date.now() / 1000;
    fs.lutimesSync(rp, base, base); fs.utimesSync(mf, base + (metaAfter ? 60 : -60), base + (metaAfter ? 60 : -60));
    const m = JSON.parse(fs.readFileSync(mf, 'utf8')); const r = PR.pinAtBoot(D, m, 'cw-a'); return [r && r.memberId, m.poolPin && m.poolPin.memberId];
  };
  cases.clearedLater = cleared(true); cases.clearedEarlier = cleared(false);
  console.log('    the boot\'s choice: ' + J(cases));
  ok(!!(J(cases.clearedLater) === J([null, undefined]) && J(cases.clearedEarlier) === J(['m-b', 'm-b'])), 'a meta that says the pin was CLEARED: written after the record (an older release\'s clear) ⇒ it stands — the clear is never undone; written before it (the new pin\'s meta write lost) ⇒ the record\'s', { later: cases.clearedLater, earlier: cases.clearedEarlier });
  ok(!!(J(cases.none) === J(['m-b', 'm-b']) && cases.older === 'm-b' && J(cases.newer) === J([null, 'm-c']) && J(cases.otherPool) === J([null, null]) && J(cases.olderTree) === J([null, 'm-a'])),
    'the boot: no meta pin or an older one ⇒ the record\'s; a NEWER meta pin wins; another pool\'s conversation never reads it; no record (an older tree\'s data) ⇒ the meta\'s, as before', cases);
  fs.writeFileSync(path.join(path.dirname(PR.recordPath(D, 'pool-1', 'x')), 'cw-gone.swap-0a1b2c3d'), '');
  PR.write(D, 'pool-1', 'cw-gone', { memberId: 'm-b', at: 5, by: 'user' });
  const dropped = PR.sweep(D, (k) => k === 'cw-a');
  const left = fs.readdirSync(path.dirname(PR.recordPath(D, 'pool-1', 'x'))).sort();
  ok(!!(dropped === 2 && J(left) === J(['cw-a'])), `the sweep: a gone conversation's record and a half-made swap go (${dropped}), a live one stays (${J(left)})`, { dropped, left });
  const br = fs.readFileSync(path.join(REPO, 'src/server/boot-restore.js'), 'utf8');
  const wiring = (src) => {
    const sites = [...src.matchAll(/= sessionFromMeta\(meta, \{/g)].map((m) => m.index);
    return sites.map((at) => { const before = src.slice(Math.max(0, src.lastIndexOf('\n', src.lastIndexOf('\n', at) - 1)), at); return /PinRecord\.pinAtBoot\(path\.dirname\(META_DIR\), meta, sockFile\);/.test(before); });
  };
  const w = wiring(br), one = (br.match(/_poolPin:/g) || []).length === 1 && /_poolPin: poolPinFromMeta\(meta\),/.test(br);
  const ue = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const writer = /PinRecord\.write\(accounts\.dataDir, poolId, s\.sockName, pin\);[\s\S]{0,300}s\._poolPin = pin;\n  persistPoolPin\(s\);/.test(ue) && !/poolPin: session\._poolPin \|\| null \}, \{ durable: true \}\)/.test(ue);   // stale-pins: kept — the release's durable meta spelling is checked GONE (the meta's copy is paced now)
  console.log('    the wiring: ' + J({ sites: w, onePinExpression: one, writerBeforeMeta: writer }));
  ok(!!(J(w) === J([true, true, false]) && one && writer), 'WIRING: the two LOCAL restore sites read the record right before the ONE pin expression (the ssh readopt does not — a remote conversation is never pinned); the writer writes the record before the pin and the meta write is paced', { w, one, writer });
  const cut = wiring(anchored(br, '    PinRecord.pinAtBoot(path.dirname(META_DIR), meta, sockFile);   // B-526c unit 2: the person\'s pin record, when newer than the meta\'s\n    const session = sessionFromMeta(meta, {', '    const session = sessionFromMeta(meta, {', 'a local site without the record', { count: 2 }));
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
const NO_RECORD = MUT.write('src/server/usage-pool-engine.js', anchored(usrc, '    try { PinRecord.write(accounts.dataDir, poolId, s.sockName, pin); }\n', '    try { }\n', 'the pin answered without its record'), 'no-record');
const NO_READ = MUT.write('src/pool-pin-record.js', anchored(psrc, '  const rec = read(dataDir, meta.accountId, key);\n', '  const rec = null;\n', 'the boot without the record'), 'no-read');
const killThenBoot = async (dir, wm = '', bm = '') => { const w = await child('write', dir, wm); const b = await child('boot', dir, bm); return { w, b }; };
const t0 = Date.now();
const [G, RED1, RED2] = await Promise.all([killThenBoot(path.join(ROOT, 'g')), killThenBoot(path.join(ROOT, 'r1'), `src/server/usage-pool-engine.js=${NO_RECORD}`), killThenBoot(path.join(ROOT, 'r2'), '', `src/pool-pin-record.js=${NO_READ}`)]);
console.log(`    (the three worlds, six processes, in ${Date.now() - t0} ms)`);

console.log('② THE ANSWER BEFORE THE META\'S DISK — a real process whose session meta\'s writes are held');
{
  const f = G.w.facts || {};
  console.log('    the writer: ' + J({ facts: f, signal: G.w.signal }) + (G.w.facts ? '' : ' — stderr: ' + G.w.err));
  ok(!!(f.refused && f.refused.ok === false && f.refused.code === 'pin_not_saved' && /could not be saved .* nothing changed; try again$/.test(f.refused.error || '') && f.refused.pin === null),
    'a record that cannot be written refuses the pin BY NAME (pin_not_saved, «nothing changed; try again») — the conversation stays unpinned', f.refused);
  ok(!!(f.cleared && f.cleared.set && f.cleared.rec1 === f.A && f.cleared.clear && f.cleared.rec2 === null), 'a pin, then «自动»: the record names the member, then leaves — each before its answer', f.cleared);
  ok(!!(f.act && f.act.ok && f.act.pinned === f.B && f.record && f.record.memberId === f.B && f.record.by === 'user' && f.metaPin === null),
    'THE ACT: the pin is ANSWERED with the meta\'s writes held — the record on disk names the member, the meta file names none (read from the disk: the stop lands between the two)', { act: f.act, record: f.record, metaPin: f.metaPin });
  ok(!!(Array.isArray(f.metaWrites) && f.metaWrites.length >= 1 && f.metaWrites.every((x) => x.durable === false) && f.metaWrites[f.metaWrites.length - 1].pin === f.B), 'the meta\'s copy is asked at its PACE (no durable write; its last carries the pin)', f.metaWrites);
  ok(G.w.signal === 'SIGKILL', `the writer was killed by SIGKILL right after its answer (${G.w.signal})`);
}
console.log('③ THE KILL BETWEEN THE TWO WRITES — a second real process restores over the same folder');
{
  const f = G.b.facts || {};
  console.log('    the boot: ' + J(f) + (G.b.facts ? '' : ' — stderr: ' + G.b.err));
  ok(!!(G.b.facts && f.before === null && f.took === G.w.facts.B && f.pin && f.pin.memberId === G.w.facts.B), 'the boot: the meta on disk names no pin; the restore takes the record\'s — the person\'s pin survives the kill', f);
  const r1 = RED1.b.facts || {}, r1w = RED1.w.facts || {};
  console.log('    RED (no record): ' + J({ act: r1w.act, record: r1w.record, boot: r1 }));
  ok(!!(r1w.act && r1w.act.ok && r1w.record === null && RED1.b.facts && r1.pin === null), 'RED «the pin answered without its record» (the release\'s road): the same kill ⇒ the boot restores NO pin — the person\'s choice lost', { r1w, r1 });
  const r2 = RED2.b.facts || {};
  console.log('    RED (no boot read): ' + J(r2));
  ok(!!(RED2.w.facts && RED2.w.facts.record && RED2.b.facts && r2.pin === null && r2.took === null), 'RED «the boot without the record»: the record on disk, the restore never reads it ⇒ no pin', r2);
}
report();
