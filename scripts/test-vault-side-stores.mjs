#!/usr/bin/env node
// THE VAULT's SIDE STORES under the store-read law (lane lg-vault-env, the coordinator's r3002 / r3019 — from the store-read law's
// verification and lane bl-machines-b's census of the data folder's stores). Each store's read is made to fail by a PLACED refusal of
// its read call (the read answers EIO; never a mount, never a mode change), then the store's ORDINARY next save or start runs: the
// file's content survives, the person is told what is known, and — r3019's law — WHO REMOVES BY THE STORE's SILENCE removes nothing.
//   (a) vault-use-marks.json — src/server/vault-use-grants.js (the marks held; a row UNDECIDED when its marks are lost)
//   (c) vault-grants.json — src/server/vault-totp.js (held; a later layout kept aside once; a row it cannot read CARRIED)
//   (d) vault-grant-ends.json — src/server/vault-run-door.js (held; the ends made meanwhile kept beside it, folded in at the lift)
//   (e) vault-run-tools.json — src/server/vault-run-door.js (held; the drift record records nothing meanwhile, every sealed run goes on;
//       the lift resumes from the file's own baselines; test-vault-run-seal drives the sealed runs themselves)
//   (b) vault.json — src/server/vault-engine.js (a failed read held and read again, said «could not be read»; torn bytes stay damaged)
// Every value here is made up at run time; no value, no sealed thing is printed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';   // the FIRST local import (§113): it re-homes this process; anchored(): a red control's edit
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(decodeURIComponent(new URL('..', import.meta.url).pathname));
const { ok, report } = checker();
const note = (s) => console.log('  · ' + s);
const VE = require(path.join(REPO, 'src/server/vault-engine.js'));
const GS = require(path.join(REPO, 'src/server/grants-store.js'));
const UG = require(path.join(REPO, 'src/server/vault-use-grants.js'));
const VT = require(path.join(REPO, 'src/server/vault-totp.js'));
const RUN = require(path.join(REPO, 'src/server/vault-run-door.js'));
const SW = require(path.join(REPO, 'src/store-writer.js'));

const ROOT = scratchDir('vside');
let nw = 0;
const freshDir = (tag) => { const d = path.join(ROOT, `${tag}-${++nw}`); fs.mkdirSync(d, { recursive: true, mode: 0o700 }); return d; };
const KDF = { N: 1024, r: 8, p: 1 };
const PW = 'a made-up password for the side stores ' + crypto.randomBytes(4).toString('hex');
const quiet = { log() { }, warn() { } };
const mkEngine = (dataDir) => VE.create({ dataDir, kdf: KDF, log: quiet, idleTimer: false, register: false, bcast: () => { } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 5000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) return false; await sleep(10); } return true; };
const jsonOr = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// A PLACED REFUSAL: the store's read of `file` answers EIO (readFileSync and openSync of that path) while it is on
const EIO = () => Object.assign(new Error('EIO: i/o error, placed by the suite'), { code: 'EIO', errno: -5 });
function placeRefusalTimes(file, times) {
  const want = path.resolve(file), r0 = fs.readFileSync, o0 = fs.openSync;
  let n = 0;
  const hit = (p) => typeof p === 'string' && path.resolve(p) === want && n < times;
  fs.readFileSync = function (p, ...a) { if (hit(p)) { n++; throw EIO(); } return r0.call(this, p, ...a); };
  fs.openSync = function (p, ...a) { if (hit(p)) { n++; throw EIO(); } return o0.call(this, p, ...a); };
  return { refused: () => n, lift: () => { fs.readFileSync = r0; fs.openSync = o0; } };
}
function placeRefusal(file) {
  const want = path.resolve(file), r0 = fs.readFileSync, o0 = fs.openSync, a0 = fs.promises.readFile;
  let n = 0;
  const hit = (p) => typeof p === 'string' && path.resolve(p) === want;
  fs.readFileSync = function (p, ...a) { if (hit(p)) { n++; throw EIO(); } return r0.call(this, p, ...a); };
  fs.openSync = function (p, ...a) { if (hit(p)) { n++; throw EIO(); } return o0.call(this, p, ...a); };
  fs.promises.readFile = async function (p, ...a) { if (hit(p)) { n++; throw EIO(); } return a0.call(this, p, ...a); };
  return { refused: () => n, lift: () => { fs.readFileSync = r0; fs.openSync = o0; fs.promises.readFile = a0; } };
}

// ── (a) the use marks: a world of two entries, each with a «used with no card by» member the owner saved ──
async function marksWorld(ugMod = UG) {
  const dataDir = freshDir('marks');
  const vault = mkEngine(dataDir); await vault.setup(PW);
  const grants = GS.create({ dataDir });
  const stale = [];
  const mk = () => ugMod.create({ grants: () => grants, vault, dataDir, log: () => { }, onStale: (r) => stale.push(r) });
  const entry = () => { const name = 'secret:' + crypto.randomBytes(5).toString('hex'); const r = vault.secretPut(name, 'made-up-' + crypto.randomBytes(8).toString('hex'), { prov: 'owner', label: 'Made-up entry', kind: 'password', hosts: [] }); if (!r.ok) throw new Error('secretPut ' + r.code); return `secrets:${name}#secret`; };
  const e1 = entry(), e2 = entry();
  const m1 = { kind: 'conversation', key: 'cid-made-up-1', hosts: ['192.168.1.1'] }, m2 = { kind: 'conversation', key: 'cid-made-up-2', hosts: ['192.168.1.1'] };
  const ug0 = mk();
  const w = [ug0.setRow(e1, { to: [m1] }, { reauthed: true }), ug0.setRow(e2, { to: [m2] }, { reauthed: true })];
  if (!w.every((x) => x && x.ok)) throw new Error('the world\'s saves: ' + w.map((x) => x && x.code).join(','));
  const MARKS = path.join(dataDir, 'vault-use-marks.json');
  const onDisk = (id) => (((grants.rowsFor ? grants.rowsFor('vault-use', id) : []) || [])[0] || {}).to || [];
  const verified = (ug, id) => (((ug.rowsOf(id) || [])[0] || {}).to || []).length;
  return { dataDir, vault, grants, stale, mk, e1, e2, m1, m2, MARKS, onDisk, verified };
}

async function main() {
  console.log('(a) vault-use-marks.json');
  {
    // HELD: the next life's first read FAILS, then the owner's ordinary next Save of ANOTHER entry's row
    const w = await marksWorld();
    const before = jsonOr(w.MARKS);
    const ug = w.mk();
    const pr = placeRefusal(w.MARKS);
    let save = null, pub = null, run = null, mayUse = null, words = null;
    try {
      save = ug.setRow(w.e1, { to: [w.m1, { kind: 'conversation', key: 'cid-made-up-3', hosts: ['192.168.1.1'] }] }, { reauthed: true });
      pub = ug.publicFor(w.e2);
      run = ug.verdictFor(w.e2, { conversationKeys: ['cid-made-up-2'] }, { hosts: ['192.168.1.1'], destinationKnown: true });
      mayUse = ug.mayUseFor({ conversationKeys: ['cid-made-up-2'] });
      words = ug.marksUnread();
    } finally { pr.lift(); }
    const after = jsonOr(w.MARKS);
    ok(!!save && !save.ok && save.code === 'vault_use_marks_unread' && /could not be read/.test(save.error || '') && JSON.stringify(after) === JSON.stringify(before), '(a) a read that failed HOLDS the marks: the owner\'s next Save is refused by name (what is known: «could not be read»), and nothing is written over the file', save && (save.ok ? 'the Save went through' : save.code));
    ok(!!pub && pub.unverified === true && pub.unverifiedWhy === 'marks_unread' && (pub.to || []).length === 1, '(a) …while held, the Vault window lists the other entry\'s member «unverified — the marks could not be read», never as a held grant', pub && { unverified: pub.unverified, why: pub.unverifiedWhy, members: (pub.to || []).length });
    ok(!!run && !(run.ok === true && run.member), '(a) …and a run is never let through on a mark that could not be checked (fail CLOSED: it asks its card)');
    ok(w.stale.length === 0, '(a) …and nobody is told a FORGERY for a read that failed (no «could not be trusted» notice)', `stale notices ${w.stale.length}`);
    ok(Array.isArray(mayUse) && mayUse.length === 1 && mayUse[0].code === 'vault_use_marks_unread' && typeof words === 'string' && /could not be read/.test(words), '(a) …a lookup through the list says it is held (r3104): «what it may use» lists the held state by its code, and a second road (the agent\'s list) is handed the hold\'s words — never «nothing held»', { mayUse: mayUse && mayUse.map((r) => r.code), words: !!words });
    const ug3 = w.mk();   // the next life, reading fine
    ok(w.verified(ug3, w.e2) === 1 && w.verified(ug3, w.e1) === 1 && w.stale.length === 0, '(a) …once the file reads, every member verifies again: nothing was lost', { e1: w.verified(ug3, w.e1), e2: w.verified(ug3, w.e2), stale: w.stale.length });
  }
  {
    // HELD, THEN LIFTED IN THE SAME LIFE: the law's read again off the loop brings the generations back
    const w = await marksWorld();
    const ug = w.mk();
    const pr = placeRefusal(w.MARKS);
    let held = null;
    try { held = ug.publicFor(w.e2); } finally { pr.lift(); }
    // the law's ladder reads again in 30 s; the suite asks that one read again now (the hold's own door, as its timer would)
    const lifted = await ug._marksHold.again();
    const back = ug.publicFor(w.e2);
    ok(!!held && held.unverifiedWhy === 'marks_unread' && lifted === true && !!back && !back.unverified && w.verified(ug, w.e2) === 1 && w.stale.length === 0, '(a) …and in the SAME life, the read again off the loop lifts the hold: the generations are back, the members verify, nothing was said forged', { held: held && held.unverifiedWhy, lifted, verified: w.verified(ug, w.e2), stale: w.stale.length });
  }
  // TORN BYTES and NO SIDECAR: the remover law (r3019) — a write built on the verified view must remove ZERO members
  async function silenceScene(ugMod, how) {
    const w = await marksWorld(ugMod);
    fs.writeFileSync(w.MARKS, '{"v":1,"gen":2,"res":{"secrets:secr');   // a write cut short
    const ug = w.mk();
    ug.publicFor(w.e2);   // the first read while unlocked
    const textOf = () => { try { return fs.readFileSync(w.MARKS, 'utf8'); } catch { return ''; } };
    await until(() => (textOf() !== '' && !textOf().startsWith('{"v":1,"gen":2,"res":{"secrets:secr')), 3000);
    await sleep(30); ug.publicFor(w.e2);   // after the torn bytes' copy, the lift
    const asideN = fs.readdirSync(w.dataDir).filter((n) => n.startsWith('vault-use-marks.json.corrupt-')).length;
    const add = ug.addMember(w.e2, { kind: 'conversation', key: 'cid-made-up-4' }, { hosts: ['192.168.1.1'] }, { by: 'user' });   // the card's «Always» (a write built on the verified view)
    const kept = w.onDisk(w.e2).some((m) => m && m.key === 'cid-made-up-2');
    const pub = ug.publicFor(w.e2);
    const ugR = w.mk(); const pubR = ugR.publicFor(w.e2);   // a restart: the undecided rows ride the sidecar's own mark
    const save = ugR.setRow(w.e2, { to: [w.m2] }, { reauthed: true });   // the owner decides: saves the row again
    const ugS = w.mk();
    return { asideN, add, kept, pub, pubR, save, after: w.verified(ugS, w.e2), e1after: ugS.publicFor(w.e1), stale: w.stale.length };
  }
  {
    const r = await silenceScene(UG, 'torn');
    ok(r.asideN === 1, '(a) TORN bytes are kept aside ONCE (a dated copy beside the store)', `copies ${r.asideN}`);
    ok(!!r.add && !r.add.ok && r.add.code === 'marks_undecided' && r.kept, '(a) …and the REMOVER removes ZERO: a write built on the verified view (the card\'s «Always») is refused by name on an undecided row, and its member stays in the grants store', { add: r.add && (r.add.ok ? 'written' : r.add.code), kept: r.kept });
    ok(!!r.pub && /^vault-use-marks\.json\.corrupt-/.test(r.pub.marksAside || '') && !!r.pubR && r.pubR.marksAside === r.pub.marksAside, '(a) …the window says WHERE the damaged marks are kept (the copy\'s base name), after a restart too — and what to do: save the row again (never «restore that copy»)', { aside: r.pub && r.pub.marksAside, afterRestart: r.pubR && r.pubR.marksAside });
    ok(!!r.pub && r.pub.unverifiedWhy === 'marks_undecided' && !!r.pubR && r.pubR.unverifiedWhy === 'marks_undecided' && r.stale === 0, '(a) …the row is UNDECIDED (listed «its marks were lost — save it again»), across a restart, with no forgery notice', { why: r.pub && r.pub.unverifiedWhy, afterRestart: r.pubR && r.pubR.unverifiedWhy, stale: r.stale });
    ok(!!r.save && r.save.ok && r.after === 1 && !!r.e1after && r.e1after.unverifiedWhy === 'marks_undecided', '(a) …the owner\'s Save of the row decides it (its member verifies again); the other row stays undecided until its own Save', { save: r.save && (r.save.ok ? 'ok' : r.save.code), verified: r.after, other: r.e1after && r.e1after.unverifiedWhy });
  }
  {
    const M = mutantCopies('vault-side-stores', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-use-grants.js'), 'utf8');
    const cut = "    if (!rows.length) return;\n    for (const id of rows) undecided.add(id);";
    ok(SRC.split(cut).length === 2, '(a) the undecided rule is there once (the control below takes it out)');
    const noUndecided = M.load('src/server/vault-use-grants.js', anchored(SRC, cut, '    return;\n    for (const id of rows) undecided.add(id);', 'no-undecided'), 'no-undecided');
    const r = await silenceScene(noUndecided, 'torn');
    ok(!!r.add && r.add.ok && !r.kept, '(a) CONTROL (a copy whose torn marks lift as «no generations»): the card\'s «Always» rewrites the row WITHOUT its old member — red', { add: r.add && (r.add.ok ? 'written' : r.add.code), kept: r.kept });
  }
  // ── r3130: the round's two musts and its required points ──
  const releaseVerifies = (vault, file) => {   // THE RELEASE's OWN READER SHAPE (b06f36e90 loadGen), its bytes pinned: a mark over {v, gen, res}
    const f = jsonOr(file); if (!f || typeof f.mark !== 'string') return false;
    const res = f.res && typeof f.res === 'object' ? f.res : {};
    const body = JSON.stringify({ v: 1, gen: Number(f.gen) || 0, res: Object.fromEntries(Object.keys(res).sort().map((k) => [k, Number(res[k]) || 0])) });
    let want = null; try { want = vault.macOf('vault-use-gen-v1', body); } catch { want = null; }
    return !!want && want === f.mark;
  };
  async function wayBackScene(ugMod) {
    const w = await marksWorld(ugMod);
    fs.writeFileSync(w.MARKS, '{"v":1,"gen":2,"res":{"secrets:secr');   // torn
    const ug = w.mk(); ug.publicFor(w.e1);
    const textOf = () => { try { return fs.readFileSync(w.MARKS, 'utf8'); } catch { return ''; } };
    await until(() => textOf() !== '' && !textOf().startsWith('{"v":1,"gen":2,"res":{"secrets:secr'), 3000); await sleep(30); ug.publicFor(w.e1);
    const save = ug.setRow(w.e1, { to: [w.m1] }, { reauthed: true });   // the owner decides e1; e2 stays undecided
    const f = jsonOr(w.MARKS) || {};
    return { save, hasUndecided: Array.isArray(f.undecided) && f.undecided.includes(w.e2), release: releaseVerifies(w.vault, w.MARKS), e2still: w.mk().publicFor(w.e2).unverifiedWhy };
  }
  {
    const r = await wayBackScene(UG);
    ok(!!r.save && r.save.ok && r.hasUndecided && r.release && r.e2still === 'marks_undecided', '(a) MUST 1 THE WAY BACK: with a row still undecided, the release\'s own reader verifies the sidecar (its mark over {v, gen, res}, byte for byte) — the rows decided here keep their members under the release; the list rides under its own mark', r);
    const M = mutantCopies('vault-side-stores-wayback', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-use-grants.js'), 'utf8');
    const folded = anchored(SRC, 'const body = genBody(genSeq, genByRes); const mark = vault.macOf(GEN_LABEL, body);', 'const body = JSON.stringify({ ...JSON.parse(genBody(genSeq, genByRes)), ...(undecided.size ? { undecided: [...undecided].sort() } : {}) }); const mark = vault.macOf(GEN_LABEL, body);', 'folded-list');
    const r2 = await wayBackScene(M.load('src/server/vault-use-grants.js', folded, 'folded-list'));
    ok(!r2.release, '(a) CONTROL (the list folded back into the first body): the release cannot verify the sidecar — red', { release: r2.release });
  }
  {
    // MUST 2 THE WAY OUT: the page's own plan function — a Save with no edit of an UNDECIDED row posts it (it decides)
    const VUR = await import(new URL('../src/lib/vault-use-row.js', import.meta.url).href).catch(() => null);
    const m = { kind: 'conversation', key: 'cid-made-up-1', scopes: [{ kind: 'host', key: '192.168.1.1', host: '192.168.1.1' }] };
    const posts = VUR && VUR.rowChanged({ to: [m], except: [] }, { to: [m], except: [] }, { undecided: true });
    const today = VUR && VUR.rowChanged({ to: [m], except: [] }, { to: [m], except: [] });
    ok(posts === true, '(a) MUST 2 THE WAY OUT: an undecided row\'s Save with no edit POSTS the row whole (the page\'s own plan: it decides)', { posts });
    ok(today === false, '(a) CONTROL (today\'s plan, the row not undecided): the same press posts nothing — red', { today });
  }
  {
    // (d) deciding asks the second word; (a)(f) the carry, the wildcard carry, a drop and a ✕ while HELD; a lift while LOCKED; a file gone after a failed read
    const w = await marksWorld();
    const ug = w.mk();
    const pr = placeRefusal(w.MARKS);
    let carryR = null, wild = null, drop = null, rev = null, rows0 = null, rows1 = null;
    try {
      rows0 = JSON.stringify(w.grants.rowsOfDoor('vault-use'));
      const always = [{ conv: 'cid-made-up-9', key: 'shape:' + JSON.stringify(['/usr/bin/curl', 0, 0, 0, ['192.168.1.1']]), entries: [w.e2], until: null }];
      carryR = ug.carry(always); wild = ug.carryWildcards(() => null); drop = ug.drop(w.e2); rev = ug.revoke(w.e2, 'conversation:cid-made-up-2');
      rows1 = JSON.stringify(w.grants.rowsOfDoor('vault-use'));
    } finally { pr.lift(); }
    ok(!!carryR && carryR.held === true && carryR.carried === 0 && !!wild && wild.code === 'vault_use_marks_unread' && rows1 === rows0, '(a) the carry of an old «always» row and the wildcard carry while HELD carry nothing and say they wait (the row stays for the next read)', { carry: carryR, wild: wild && wild.code });
    ok(!!drop && drop.code === 'vault_use_marks_unread' && !!rev && rev.code === 'vault_use_marks_unread' && rows1 === rows0, '(a) …a drop and a ✕ while HELD are refused by the hold\'s own code, nothing written', { drop: drop && drop.code, revoke: rev && rev.code });
    // a lift while the vault is LOCKED: the read again lifts; the next unlocked read loads the generations
    w.vault.lock('door');
    const lifted = await ug._marksHold.again();
    await w.vault.unlock(PW);
    ok(lifted === true && w.verified(ug, w.e2) === 1 && w.stale.length === 0, '(a) a lift while the vault is LOCKED: the generations load at the next unlocked read, every member verifies, nothing said forged', { lifted, verified: w.verified(ug, w.e2) });
  }
  {
    const w = await marksWorld();
    const ug = w.mk();
    const pr = placeRefusal(w.MARKS);
    try { ug.publicFor(w.e2); } finally { pr.lift(); }
    fs.rmSync(w.MARKS, { force: true });   // the file is GONE after the failed read
    const a1 = await ug._marksHold.again(), a2 = await ug._marksHold.again();
    const pub = ug.publicFor(w.e2);
    ok(a1 === false && a2 === true && !!pub && !pub.unverifiedWhy, '(a) a file MISSING after a failed read is read once more, then is the release\'s generation 0 (no row undecided — a missing sidecar never makes one)', { first: a1, second: a2, why: pub && pub.unverifiedWhy });
  }
  {
    const w = await marksWorld(), ug = w.mk();
    fs.writeFileSync(w.MARKS, '{"v":1,"gen":2,"res":{"secrets:secr'); ug.publicFor(w.e2);
    await until(() => { try { return !fs.readFileSync(w.MARKS, 'utf8').startsWith('{"v":1,"gen":2,"res":{"secrets:secr'); } catch { return false; } }, 3000); await sleep(30); ug.publicFor(w.e2);
    const noWord = ug.setRow(w.e2, { to: [w.m2] }, { reauthed: false });
    const withWord = ug.setRow(w.e2, { to: [w.m2] }, { reauthed: true });
    ok(!!noWord && noWord.code === 'reveal_needs_password' && !!withWord && withWord.ok, '(a) (d) a Save that DECIDES an undecided row asks the second word (验证是你), as the window says — it vouches anew for members whose mark is lost', { without: noWord && noWord.code, with: withWord && (withWord.ok ? 'ok' : withWord.code) });
  }
  {
    // r3130 (a) AT THE RUN DOOR: an old «always» row read while the marks are HELD STAYS in data/vault-run.json for the next read (the
    // door carries one row at a time and keeps each the hold refused); the next life, the marks read, carries it. RED: a door whose
    // carry keeps nothing (the list emptied while nothing was carried — the row lost)
    const RUNA = require(path.join(REPO, 'src/server/vault-run-door.js'));
    const VRA = require(path.join(REPO, 'src/vault-run.js'));
    async function alwaysScene(runMod) {
      const w = await marksWorld();
      const name = w.e2.slice('secrets:'.length, -'#secret'.length), ref = `vault://secrets/${name}/secret`;
      const key = VRA.shapeKeyOf({ tool: '/usr/bin/curl', sub: [], flags: ['-s'], args: ['url'], hosts: ['api.router.lan'], entries: [ref], injection: ['env:T'], env: [], templates: [], on: null, script: null, keyed: [] });
      const body = JSON.stringify({ v: 1, gen: 7, runnable: [w.e2], always: [{ conv: 'cid-made-up-9', key, until: null, entries: [w.e2], at: Date.now(), by: 'user' }] });
      const STORE = path.join(w.dataDir, RUNA.STORE_FILE);
      fs.writeFileSync(STORE, JSON.stringify({ ...JSON.parse(body), mark: w.vault.macOf(RUNA.MARK_LABEL, body) }));
      const door = (ug) => runMod.create({ dataDir: w.dataDir, vault: w.vault, userTodos: null, sources: {}, log: () => { }, useGrants: ug });
      const row = { id: w.e2, store: 'secrets', entry: name, field: 'secret' };
      const pr = placeRefusal(w.MARKS);
      let heldAnswer = null;
      try { const ug = w.mk(); door(ug).rowFacts(row); heldAnswer = ug.carry([], {}); } finally { pr.lift(); }
      const keptWhileHeld = ((jsonOr(STORE) || {}).always || []).length;
      door(w.mk()).rowFacts(row);   // the next life: the marks read
      return { held: !!(heldAnswer && heldAnswer.held), kept: keptWhileHeld, carried: JSON.stringify(w.onDisk(w.e2)).includes('cid-made-up-9'), left: ((jsonOr(STORE) || {}).always || []).length };
    }
    const r = await alwaysScene(RUNA);
    ok(r.held && r.kept === 1 && r.carried && r.left === 0, '(a) THE RUN DOOR\'s carry of an old «always» row while the marks are HELD: the row STAYS in data/vault-run.json for the next read — and the next life, the marks read, carries it (the list then empty)', r);
    const M = mutantCopies('vault-side-stores-carry', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const r2 = await alwaysScene(M.load('src/server/vault-run-door.js', anchored(SRC, 'const keep = c.held || (!Array.isArray(c.waitedFor) && c.waits) ? db.always.slice() : ', 'const keep = false ? db.always.slice() : ', 'carry-keeps-nothing'), 'carry-keeps-nothing'));
    ok(r2.kept === 0 && !r2.carried, '(a) CONTROL (a door whose carry keeps nothing): the held read empties the list and the row is never carried — red', r2);
  }
  // ── r3205 (round wg20wcxhh on line 669): the round's SMALLS and its readers' shoulds ──
  const TORN = '{"v":1,"gen":2,"res":{"secrets:secr';
  const nameOfId = (id) => id.slice('secrets:'.length, -'#secret'.length);
  async function decideE1(w, ug) {   // torn marks: both rows undecided; the owner's Save decides e1 — e2 stays undecided
    fs.writeFileSync(w.MARKS, TORN); ug.publicFor(w.e1);
    await until(() => { try { return !fs.readFileSync(w.MARKS, 'utf8').startsWith(TORN); } catch { return false; } }, 3000); await sleep(30); ug.publicFor(w.e1);
    return ug.setRow(w.e1, { to: [w.m1] }, { reauthed: true });
  }
  const RUNR = require(path.join(REPO, 'src/server/vault-run-door.js'));
  {
    // SMALLS 1 + 2: the agent's `uses` says the hold as `list` does; an UNDECIDED row naming the caller is listed as unknown in
    // Session Properties' «what it may use» and as waiting in the agent's list and uses — never skipped as «nothing held».
    // REDs: a door whose uses drops the hold's words; a copy whose undecided answers are taken out
    const usesScene = async (runMod, ugMod = UG) => {
      const w = await marksWorld(ugMod);
      const door = (ug) => runMod.create({ dataDir: w.dataDir, vault: w.vault, userTodos: null, sources: {}, log: () => { }, useGrants: ug });
      const me = { conversationId: 'cid-made-up-2', scope: 'cid-made-up-2' };
      const pr = placeRefusal(w.MARKS);
      let heldUses = null;
      try { heldUses = door(w.mk()).usesFor(me); } finally { pr.lift(); }
      const ex = w.mk().setRow(w.e2, { to: [w.m2, { kind: 'everyone', hosts: ['192.168.1.1'] }], except: [{ kind: 'conversation', key: 'cid-made-up-7' }] }, { reauthed: true });   // r3275 (6): e2's row leaves one conversation out
      const ug = w.mk(); await decideE1(w, ug);
      const may = ug.mayUseFor({ conversationKeys: ['cid-made-up-2'] }) || [];
      const mayLeft = ug.mayUseFor({ conversationKeys: ['cid-made-up-7'] }) || [];
      const d = door(ug), ref = `vault://secrets/${nameOfId(w.e2)}/secret`;
      const usesUnd = ((d.usesFor(me) || {}).standingUndecided || {}).entries || [], listUnd = ((d.runnableFor(me) || {}).standingUndecided || {}).entries || [];
      return { exOk: !!(ex && ex.ok), mayExc: mayLeft.some((r) => r.resource === w.e2 && r.code === 'excepted' && r.ok === false), heldWords: !!(heldUses && /could not be read/.test(String(heldUses.standingUnread || ''))), mayUnd: may.some((r) => r.resource === w.e2 && r.code === 'marks_undecided' && r.ok === false), usesUnd: usesUnd.includes(ref), listUnd: listUnd.includes(ref) };
    };
    const r = await usesScene(RUNR);
    ok(r.heldWords, '(a) r3205 (1): the agent\'s `uses` while the marks are HELD carries the hold\'s words, as `list` does — never «none» from a held list', r);
    ok(r.exOk && r.mayExc, '(a) r3275 (6): an UNDECIDED row\'s 除了 still says «left out» in «what it may use» (the excepted answer, never skipped)', r);
    ok(r.mayUnd && r.usesUnd && r.listUnd, '(a) r3205 (2): an UNDECIDED row that names the conversation is listed as unknown in «what it may use», and as waiting for the user in the agent\'s list and uses', r);
    const M = mutantCopies('vault-side-stores-uses', REPO);
    const SRCd = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const noHeldUses = anchored(SRCd, "      ...(() => { let w = null; try { w = useGrants && typeof useGrants.marksUnread === 'function' ? useGrants.marksUnread() : null; } catch { w = null; } return w ? { standingUnread: w } : {}; })(),", '', 'uses-no-hold');
    const r2 = await usesScene(M.load('src/server/vault-run-door.js', noHeldUses, 'uses-no-hold'));
    ok(!r2.heldWords, '(a) CONTROL (a door whose uses drops the hold\'s words): `uses` says nothing of the hold — red', r2);
    const SRCg = fs.readFileSync(path.join(REPO, 'src/server/vault-use-grants.js'), 'utf8');
    const noUnd = anchored(anchored(SRCg, "if (rv && U.holds(rv)) out.push({ ...base, ok: false, code: 'marks_undecided' });", 'if (false) { }', 'may-no-undecided'), 'if (v && U.holds(v)) out.push({ id: String(row.resource) });', '', 'list-no-undecided');
    const r3 = await usesScene(RUNR, M.load('src/server/vault-use-grants.js', noUnd, 'no-undecided'));
    ok(!r3.mayUnd && !r3.usesUnd && !r3.listUnd, '(a) CONTROL (a copy without the undecided answers): the undecided row is skipped as «nothing held» everywhere — red', r3);
    const noExc = anchored(SRCg, " else if (rv && rv.code === 'excepted') { const p = bare(rv.except); out.push({ ...base, ok: false, code: 'excepted', ...(p ? { except: p } : {}) }); }", '', 'no-excepted');
    const r4 = await usesScene(RUNR, M.load('src/server/vault-use-grants.js', noExc, 'no-excepted'));
    ok(r4.exOk && !r4.mayExc, '(a) CONTROL (r3325: a copy without the undecided row\'s excepted answer): «left out» is gone from «what it may use» — red', { mayExc: r4.mayExc });
  }
  {
    // SMALL 3: the second word on a DECIDING Save has a red of its own — a copy that drops ONLY the «undecided» half of the check
    const M = mutantCopies('vault-side-stores-word', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-use-grants.js'), 'utf8');
    const half = anchored(SRC, 'undecided.has(String(id)) || widens(was, { to: rowTo, except: v.row.except })', 'widens(was, { to: rowTo, except: v.row.except })', 'no-undecided-word');
    const w = await marksWorld(M.load('src/server/vault-use-grants.js', half, 'no-undecided-word')), ug = w.mk();
    fs.writeFileSync(w.MARKS, TORN); ug.publicFor(w.e2);
    await until(() => { try { return !fs.readFileSync(w.MARKS, 'utf8').startsWith(TORN); } catch { return false; } }, 3000); await sleep(30);
    const undecidedFirst = ug.publicFor(w.e2).unverifiedWhy === 'marks_undecided';
    const noWord = ug.setRow(w.e2, { to: [w.m2] }, { reauthed: false });
    ok(undecidedFirst && !!noWord && noWord.ok, '(a) CONTROL (r3205 (3): a copy without the «undecided» half of the second word): the deciding Save goes through with no 验证是你 — red', { undecided: undecidedFirst, save: noWord && (noWord.ok ? 'ok' : noWord.code) });
  }
  {
    // SMALL 4: an entry's delete while HELD, at the PASTE DOOR's own reply — the hold's code and words, and the entry stays
    const PD = require(path.join(REPO, 'src/server/vault-paste-door.js'));
    const pasteScene = async (pdMod) => {
    const w = await marksWorld();
    const ugp = w.mk(), paste = pdMod.create({ vault: w.vault, useGrants: ugp, log: () => { } });
    const pr = placeRefusal(w.MARKS);
    let r = null;
    try { r = paste.dropEntry(nameOfId(w.e2).slice('secret:'.length)); } finally { pr.lift(); }
    const still = (w.vault.secretNames() || []).some((x) => x && `secrets:${x.name}#secret` === w.e2);
    return { r, still, holdWords: ugp._marksHold.words() }; };
    const { r, still, holdWords } = await pasteScene(PD);
    ok(!!r && !r.ok && r.code === 'vault_use_marks_unread' && /could not be read/.test(String(r.words || '')) && r.words === holdWords && still, '(a) r3205 (4): an entry\'s delete while HELD, at the paste door\'s own reply: the hold\'s code and words — the entry stays', { code: r && r.code, words: !!(r && (r.words || r.error)), still });
    const MP = mutantCopies('vault-side-stores-paste', REPO);
    const SRCp = fs.readFileSync(path.join(REPO, 'src/server/vault-paste-door.js'), 'utf8');
    const rp = await pasteScene(MP.load('src/server/vault-paste-door.js', anchored(SRCp, /named\('vault_use_marks_unread', \{ words: dr\.error \|\| MORE_WORDS\.vault_use_marks_unread \}\)/g, "named('vault_use_marks_unread')", 'paste-no-words', { count: 'any' }), 'paste-no-words'));
    ok(rp.r && rp.r.code === 'vault_use_marks_unread' && rp.r.words !== rp.holdWords, '(a) CONTROL (r3275 (5): a paste door that drops the hold\'s words): its reply says the generic words, not the hold\'s — red', { same: rp.r && rp.r.words === rp.holdWords });
  }
  {
    // r3325: the carry's FAIL-CLOSED guard — a carry answer that waits but names nothing (an older use-grants) keeps EVERY row.
    // RED: a door without the guard (the list emptied while nothing was carried)
    const VRG = require(path.join(REPO, 'src/vault-run.js'));
    async function guardScene(runMod) {
      const w = await marksWorld();
      fs.writeFileSync(w.MARKS, TORN);
      const ug = w.mk(); ug.publicFor(w.e2);
      await until(() => { try { return !fs.readFileSync(w.MARKS, 'utf8').startsWith(TORN); } catch { return false; } }, 3000); await sleep(30); ug.publicFor(w.e2);   // e2 UNDECIDED
      const old = w.e2, ref = `vault://secrets/${nameOfId(old)}/secret`;
      const key = VRG.shapeKeyOf({ tool: '/usr/bin/curl', sub: [], flags: ['-s'], args: ['url'], hosts: ['api.router.lan'], entries: [ref], injection: ['env:T'], env: [], templates: [], on: null, script: null, keyed: [] });
      const body = JSON.stringify({ v: 1, gen: 7, runnable: [old], always: [{ conv: 'cid-made-up-9', key, until: null, entries: [old], at: Date.now(), by: 'user' }] });
      const STORE = path.join(w.dataDir, RUNR.STORE_FILE);
      fs.writeFileSync(STORE, JSON.stringify({ ...JSON.parse(body), mark: w.vault.macOf(RUNR.MARK_LABEL, body) }));
      const older = new Proxy(ug, { get: (o, k) => (k === 'carry' ? (...a) => { const c = o.carry(...a); if (c) delete c.waitedFor; return c; } : o[k]) });   // an answer with no waited list
      runMod.create({ dataDir: w.dataDir, vault: w.vault, userTodos: null, sources: {}, log: () => { }, useGrants: older }).rowFacts({ id: old, store: 'secrets', entry: nameOfId(old), field: 'secret' });
      return { kept: ((jsonOr(STORE) || {}).always || []).length };
    }
    const r = await guardScene(RUNR);
    ok(r.kept === 1, '(a) r3325: a carry answer that waits but names nothing keeps EVERY old «always» row (fail closed)', r);
    const M = mutantCopies('vault-side-stores-guard', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const r2 = await guardScene(M.load('src/server/vault-run-door.js', anchored(SRC, 'const keep = c.held || (!Array.isArray(c.waitedFor) && c.waits) ? db.always.slice() : ', 'const keep = c.held ? db.always.slice() : ', 'no-guard'), 'no-guard'));
    ok(r2.kept === 0, '(a) CONTROL (a door without the guard): the row is dropped while nothing was carried — red', r2);
  }
  {
    // ALSO (the round's readers): an old «always» row of TWO entries, one UNDECIDED — the door keeps ONLY the entry that waited; the
    // carried one is never carried again, so the owner's ✕ on it stands at the next read. RED: the whole row kept when one entry waits
    const VRC = require(path.join(REPO, 'src/vault-run.js'));
    async function twoScene(runMod) {
      const w = await marksWorld(), ug = w.mk();
      await decideE1(w, ug);
      const ids = [w.e1, w.e2].sort();
      const key = VRC.shapeKeyOf({ tool: '/usr/bin/curl', sub: [], flags: ['-s'], args: ['url'], hosts: ['api.router.lan'], entries: ids.map((id) => `vault://secrets/${nameOfId(id)}/secret`), injection: ['env:T'], env: [], templates: [], on: null, script: null, keyed: [] });
      const body = JSON.stringify({ v: 1, gen: 7, runnable: ids, always: [{ conv: 'cid-made-up-9', key, until: null, entries: ids, at: Date.now(), by: 'user' }] });
      const STORE = path.join(w.dataDir, RUNR.STORE_FILE);
      fs.writeFileSync(STORE, JSON.stringify({ ...JSON.parse(body), mark: w.vault.macOf(RUNR.MARK_LABEL, body) }));
      const door = (u) => runMod.create({ dataDir: w.dataDir, vault: w.vault, userTodos: null, sources: {}, log: () => { }, useGrants: u });
      const row = { id: w.e1, store: 'secrets', entry: nameOfId(w.e1), field: 'secret' };
      door(ug).rowFacts(row);
      const on = () => JSON.stringify(w.onDisk(w.e1)).includes('cid-made-up-9');
      const carried = on();
      const rv = ug.revoke(w.e1, 'conversation:cid-made-up-9');   // the owner's ✕ on the carried member
      door(w.mk()).rowFacts(row);   // the next read (a new life)
      return { carried, revoked: !!(rv && rv.ok), back: on(), kept: ((jsonOr(STORE) || {}).always || []).map((a) => (a.entries || []).length) };
    }
    const r = await twoScene(RUNR);
    ok(r.carried && r.revoked && !r.back && r.kept.length === 1 && r.kept[0] === 1, '(a) r3205 (its readers): an old «always» row of two entries, one UNDECIDED — the door keeps ONLY the entry that waited; the owner\'s ✕ on the carried one stands at the next read', r);
    const M = mutantCopies('vault-side-stores-two', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const whole = anchored(SRC, '.filter((a) => a.entries.length);', '.filter((a) => a.entries.length); if (c.waits) keep.splice(0, keep.length, ...db.always);', 'whole-row-keep');
    const r2 = await twoScene(M.load('src/server/vault-run-door.js', whole, 'whole-row-keep'));
    ok(r2.carried && r2.back, '(a) CONTROL (the whole row kept when one entry waits): the next read puts the ✕-ed member back — red', r2);
  }
  {
    // the HELD scene's own red: a copy whose write doors do not ask the hold
    const M = mutantCopies('vault-side-stores-held', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-use-grants.js'), 'utf8');
    const noHold = anchored(SRC, "    if (marksHeld()) return { ok: false, code: 'vault_use_marks_unread', error: marksHold.words() };\n    if (!decides && undecided.has(String(id))) return named('marks_undecided');", "    if (!decides && undecided.has(String(id))) return named('marks_undecided');", 'no-hold-guard');
    const w = await marksWorld(M.load('src/server/vault-use-grants.js', noHold, 'no-hold-guard'));
    const ug = w.mk(); const pr = placeRefusal(w.MARKS);
    let save = null; try { save = ug.setRow(w.e1, { to: [w.m1] }, { reauthed: true }); } finally { pr.lift(); }
    ok(!!save && save.ok === true, '(a) CONTROL (a copy whose write doors do not ask the hold): the owner\'s Save goes through on a mark that could not be read — red', save && (save.ok ? 'written' : save.code));
  }
  console.log('(c) vault-grants.json');
  async function totpWorld(vtMod = VT) {
    const dataDir = freshDir('totp');
    const vault = mkEngine(dataDir); await vault.setup(PW);
    const mk = () => vtMod.create({ dataDir, vault, log: () => { } });
    const t0 = mk();
    const seed = Array.from(crypto.randomBytes(20)).map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b % 32]).join('');   // a made-up seed, built here
    const r = [t0.addEntry({ seed, issuer: 'MadeUp', account: 'made-up-account', name: 'madeup-code' }), t0.grant('madeup-code', ['group:T-made-up-one']), t0.grant('madeup-code', ['group:T-made-up-two']), t0.agentAdd({ seed, name: 'own-code' }, { owner: 'cid-made-up-own' })];   // r3275 (2): + an agent's OWN seed (no grant)
    if (!r.every((x) => x && x.ok)) throw new Error('the two-step world: ' + r.map((x) => x && x.code).join(','));
    return { dataDir, vault, mk, FILE: path.join(dataDir, 'vault-grants.json') };
  }
  const caller = { conversationId: 'cid-made-up-c', groups: ['T-made-up-one'], run: 'r'.repeat(24) };
  {
    const w = await totpWorld();
    const before = fs.readFileSync(w.FILE, 'utf8');
    const pr = placeRefusal(w.FILE);
    let t1, g = null, l = null, u = null, dr = null;
    const seed2 = Array.from(crypto.randomBytes(20)).map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b % 32]).join('');   // made up, built here
    const gid = (JSON.parse(before).grants[0] || {}).id;
    let ad = null, ag = null, ux = null, own = null;
    try { t1 = w.mk(); g = t1.grant('madeup-code', ['group:T-made-up-three']); l = t1.list(); u = t1.use(caller, 'madeup-code'); dr = t1.drop('madeup-code'); ad = t1.addEntry({ seed: seed2, name: 'held-add' }); ag = t1.agentAdd({ seed: seed2, name: 'held-agent-add' }, { owner: 'cid-made-up-own' }); ux = t1.ungrant(gid); own = t1.use({ conversationId: 'cid-made-up-own', scope: 'cid-made-up-own', groups: [], run: 'r'.repeat(24) }, 'own-code'); } finally { pr.lift(); }
    ok([ad, ag, ux].every((x) => !!x && !x.ok && x.code === 'vault_grants_unread' && /could not be read/.test(x.why || '')) && fs.readFileSync(w.FILE, 'utf8') === before, '(c) r3275 (1) (5): while held the window\'s add, an agent\'s add and a ✕ each answer the hold\'s own code and words — nothing stored, nothing written', { add: ad && ad.code, agentAdd: ag && ag.code, ungrant: ux && ux.code });
    ok(!!own && own.ok && typeof own.code === 'string' && own.code.length >= 6, '(c) r3275 (2): an agent\'s OWN seed is answered while held (its road needs no grant, as the release answered it)', { own: own && (own.ok ? 'given' : own.code) });
    ok(!!dr && !dr.ok && dr.code === 'vault_grants_unread' && /could not be read/.test(dr.why || '') && fs.readFileSync(w.FILE, 'utf8') === before, '(c) …an entry\'s DELETE while held answers the hold\'s own code and words (r3230\'s reader table): the entry and its grants stay', { code: dr && dr.code });
    ok(!!g && !g.ok && /could not be read/.test(g.why || '') && fs.readFileSync(w.FILE, 'utf8') === before, '(c) a read that failed at the start HOLDS the grants: the next grant is refused by name («could not be read»), nothing written over the file', g && (g.ok ? 'granted' : g.code));
    ok(!!g && g.code === 'vault_grants_unread' && !!l && !!l.grantsUnread && !!u && !u.ok && u.code === 'vault_grants_unread', '(c) …the window\'s list says the grants could not be read, and an agent\'s request for its code is answered the HOLD\'s code — never «not granted» (r3104; no code is given: fail closed)', { grant: g && g.code, listed: !!(l && l.grantsUnread), use: u && (u.ok ? 'given' : u.code) });
    const lifted = await t1._hold.again();
    const u2 = t1.use(caller, 'madeup-code'), l2 = t1.list();
    const grantsOf = (x) => ((x && x.entries) || []).flatMap((e) => e.grants || []);
    ok(lifted === true && !!u2 && u2.ok && !l2.grantsUnread && grantsOf(l2).length === 2, '(c) …and the read again off the loop lifts it in the same life: both grants back, the code given again', { lifted, use: u2 && (u2.ok ? 'given' : u2.code), grants: grantsOf(l2).length });
  }
  async function carryScene(vtMod) {
    const w = await totpWorld(vtMod);
    const doc = JSON.parse(fs.readFileSync(w.FILE, 'utf8'));
    doc.grants[1] = { ...doc.grants[1], subject: 'team:made-up-later-kind' };   // a row of a later shape this reader cannot read
    fs.writeFileSync(w.FILE, JSON.stringify(doc));
    const t = w.mk();
    const g = t.grant('madeup-code', ['group:T-made-up-four']);
    const after = JSON.parse(fs.readFileSync(w.FILE, 'utf8'));
    return { g, carried: after.grants.some((x) => x.subject === 'team:made-up-later-kind'), granted: after.grants.some((x) => x.subject === 'group:T-made-up-four') };
  }
  {
    const r = await carryScene(VT);
    ok(!!r.g && r.g.ok && r.carried && r.granted, '(c) a row the reader cannot read (a later shape) is CARRIED verbatim through the next grant — never written over, never used', { grant: r.g && (r.g.ok ? 'ok' : r.g.code), carried: r.carried });
  }
  {
    const w = await totpWorld();
    const later = JSON.stringify({ v: 2, grantsByEntry: { 'madeup-code': [{ subject: 'group:T-made-up-one' }] } });   // a later layout: no grants array
    fs.writeFileSync(w.FILE, later);
    const t = w.mk();
    await until(() => fs.readdirSync(w.dataDir).some((n) => n.startsWith('vault-grants.json.corrupt-')) && (() => { try { return Array.isArray(JSON.parse(fs.readFileSync(w.FILE, 'utf8')).grants); } catch { return false; } })(), 3000);
    const copies = fs.readdirSync(w.dataDir).filter((n) => n.startsWith('vault-grants.json.corrupt-'));
    const copyBytes = copies.length ? fs.readFileSync(path.join(w.dataDir, copies[0]), 'utf8') : null;
    const lostBefore = t.list().grantsLost;
    const g = t.grant('madeup-code', ['group:T-made-up-five']);
    const lostAfter = t.list().grantsLost;
    ok(!!copies[0] && lostBefore === copies[0] && !lostAfter, '(c) …the window says the list was damaged and WHERE its bytes are kept (the copy\'s base name) — what to do: grant again or mend by hand, never «restore that copy» — until the person\'s next grant', { before: lostBefore, named: copies[0], after: lostAfter || null });
    ok(copies.length === 1 && copyBytes === later && !!g && g.ok, '(c) a file of another LAYOUT (no grants array) at the start is kept aside ONCE (its bytes, byte for byte), then the store starts empty and takes grants again', { copies: copies.length, same: copyBytes === later, grant: g && (g.ok ? 'ok' : g.code) });
  }
  {
    // r3275 (5) (7): a carried row is never USED (a group grant this reader cannot read, the caller in that group); a row that is not
    // an object is carried too; the carried rows go with their entry's delete; a file gone by hand takes them with it
    const w = await totpWorld();
    const doc = JSON.parse(fs.readFileSync(w.FILE, 'utf8'));
    const entryOf0 = doc.grants[0].entry;
    doc.grants.push({ ...doc.grants[0], subject: 'group:T-made-up-nine', run: 'r'.repeat(24) }, 'a later scalar row', 7);   // grantOf rejects a group grant with a run
    fs.writeFileSync(w.FILE, JSON.stringify(doc));
    const t = w.mk();
    const used = t.use({ conversationId: 'cid-made-up-n', groups: ['T-made-up-nine'], run: 'r'.repeat(24) }, 'madeup-code');
    const g = t.grant('madeup-code', ['group:T-made-up-six']);
    const after = JSON.parse(fs.readFileSync(w.FILE, 'utf8')).grants;
    const dr = t.drop('madeup-code');
    const afterDrop = JSON.parse(fs.readFileSync(w.FILE, 'utf8')).grants;
    ok(!!used && !used.ok && used.code === 'not_granted', '(c) r3275 (5): a CARRIED row is never used — a group grant this reader cannot read gives its group no code', { use: used && used.code });
    ok(!!g && g.ok && after.includes('a later scalar row') && after.includes(7), '(c) r3275 (7): a row that is not an object is carried too (every row the reader cannot read)', { grant: g && (g.ok ? 'ok' : g.code) });
    ok(!!dr && dr.ok && !afterDrop.some((x) => x && typeof x === 'object' && x.entry === entryOf0) && afterDrop.includes('a later scalar row'), '(c) r3275 (5): the carried rows of an entry go with its delete (a stale grant never covers a new seed); a row of no entry stays', { left: afterDrop.length });
    const w2 = await totpWorld();
    const d2 = JSON.parse(fs.readFileSync(w2.FILE, 'utf8'));
    d2.grants.push({ ...d2.grants[0], subject: 'team:made-up-later-kind' });
    fs.writeFileSync(w2.FILE, JSON.stringify(d2));
    const t2 = w2.mk(); t2.grant('madeup-code', ['group:T-made-up-six']);
    fs.rmSync(w2.FILE, { force: true });   // the file gone by hand
    const g2 = t2.grant('madeup-code', ['group:T-made-up-eight']);
    const after2 = JSON.parse(fs.readFileSync(w2.FILE, 'utf8')).grants;
    ok(!!g2 && g2.ok && !after2.some((x) => x && x.subject === 'team:made-up-later-kind'), '(c) r3275 (7): a file gone by hand takes its carried rows with it (the next grant writes none back)', { rows: after2.length });
  }
  {
    // r3275 (3): TORN bytes in MID-LIFE (a hand edit) take the family's road — held (the words say «damaged»), kept aside ONCE, lifted
    // by the read again; then the window names the copy and the list takes grants again
    const w = await totpWorld();
    const t = w.mk(); t.list();   // a life that read fine
    fs.writeFileSync(w.FILE, '{"v":1,"grants":[');
    const g = t.grant('madeup-code', ['group:T-made-up-seven']);
    const lt = t.list();
    await until(() => fs.readdirSync(w.dataDir).some((n) => n.startsWith('vault-grants.json.corrupt-')) && (() => { try { return Array.isArray(JSON.parse(fs.readFileSync(w.FILE, 'utf8')).grants); } catch { return false; } })(), 3000);
    await sleep(20);
    const copies = fs.readdirSync(w.dataDir).filter((n) => n.startsWith('vault-grants.json.corrupt-'));
    const lost = t.list().grantsLost;
    const g2 = t.grant('madeup-code', ['group:T-made-up-seven']);
    ok(!!g && g.code === 'vault_grants_unread' && /damaged/.test(g.why || '') && !!lt && lt.grantsTorn === true, '(c) r3275 (3): torn bytes in MID-LIFE are HELD — a grant is refused with the hold\'s words («damaged»), and the window\'s list says torn', { grant: g && g.code, torn: lt && lt.grantsTorn });
    ok(copies.length === 1 && !!copies[0] && lost === copies[0] && !!g2 && g2.ok, '(c) …kept aside ONCE and lifted by the read again in the same life: the window names the copy, the list takes grants again', { copies: copies.length, lost, grant: g2 && (g2.ok ? 'ok' : g2.code) });
  }
  {
    // r3325: the PASTE CARD's two-step store while the grants are held — refused with the hold's own code and words, nothing stored
    const { UserTodoManager } = require(path.join(REPO, 'src/user-todos.js'));
    const PDc = require(path.join(REPO, 'src/server/vault-paste-door.js'));
    const w = await totpWorld();
    const userTodos = new UserTodoManager({ dataDir: w.dataDir, expirySweepMs: 3600e3 });
    const seed3 = Array.from(crypto.randomBytes(20)).map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b % 32]).join('');   // made up, built here
    const pr = placeRefusal(w.FILE);
    let q = null, a = null, t = null;
    try {
      t = w.mk();
      const paste = PDc.create({ vault: w.vault, userTodos, totp: t, log: () => { } });
      q = paste.request({ caller: { conversationId: 'cid-made-up-p', sessionKey: 'claude:cid-made-up-p', name: 'Made-up asker', scope: 'cid-made-up-p' }, words: 'the CI two-step', purpose: 'sign the release', kind: 'totp', name: 'paste-held' });
      a = q && q.ok ? paste.answer(q.requestId, { answer: 'store', person: true, totp: { seed: seed3, name: 'paste-held' } }) : null;
    } finally { pr.lift(); }
    const stored = (w.vault.secretNames() || []).some((x) => x && /paste-held/.test(String(x.name)));
    ok(!!q && q.ok && !!a && !a.ok && a.code === 'vault_grants_unread' && !!a.words && a.words === t._hold.words() && !stored, '(c) r3325: the PASTE CARD\'s two-step store while held is refused with the hold\'s own code and words — nothing stored', { request: q && (q.ok ? 'filed' : q.code), answer: a && a.code, same: !!(a && t && a.words === t._hold.words()), stored });
  }
  {
    // r3275 (5): a red for the code's OWN held check — a copy without it answers «not granted» while held
    const M = mutantCopies('vault-side-stores-c-use', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-totp.js'), 'utf8');
    const noHeld = anchored(SRC, "if (!own.ok && own.code === 'not_granted') return done(named(hold.held() ? 'vault_grants_unread' : 'failed', hold.words() || `${GRANTS_FILE} could not be read`)); }", '}', 'use-no-held');
    const w = await totpWorld(M.load('src/server/vault-totp.js', noHeld, 'use-no-held'));
    const pr = placeRefusal(w.FILE);
    let u = null;
    try { u = w.mk().use(caller, 'madeup-code'); } finally { pr.lift(); }
    ok(!!u && !u.ok && u.code === 'not_granted', '(c) CONTROL (r3275 (5): a copy without the code\'s held check): an agent\'s request while held is answered «not granted» — red', { code: u && u.code });
  }
  {
    // r3275 (4): THE PAGE's model — the Vault window's ONE note in its three states (held, torn, lost) and none, and the picker's gate
    const TM = require(path.join(REPO, 'src/totp.js'));
    const n1 = TM.grantsNotesOf({ grantsUnread: 'x' }), n2 = TM.grantsNotesOf({ grantsUnread: 'x', grantsTorn: true }), n3 = TM.grantsNotesOf({ grantsLost: 'vault-grants.json.corrupt-made-up' }), n4 = TM.grantsNotesOf({ entries: [] });
    ok(n1.held && n1.note.kind === 'unread' && n2.held && n2.note.kind === 'torn' && !n3.held && n3.note.kind === 'lost' && n3.note.name === 'vault-grants.json.corrupt-made-up' && !n4.held && n4.note === null, '(c) r3275 (4): the window\'s ONE note — held, torn, lost, or none; «Use for…» opens no picker while held', { n1, n2, n3, n4 });
  }
  {
    const M = mutantCopies('vault-side-stores-c', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-totp.js'), 'utf8');
    const cut = 'else carried.push(raw);';
    ok(SRC.split(cut).length === 2, '(c) the carry is there once (the control below takes it out)');
    const r = await carryScene(M.load('src/server/vault-totp.js', anchored(SRC, cut, '', 'no-carry'), 'no-carry'));
    ok(!!r.g && r.g.ok && !r.carried, '(c) CONTROL (a copy that drops the rows it cannot read): the later row is written over by the next grant — red', { carried: r.carried });
  }
  console.log('(d) vault-grant-ends.json');
  async function endsScene(runMod) {
    const dataDir = freshDir('ends');
    const e0 = mkEngine(dataDir); await e0.setup(PW);
    const ENDS = path.join(dataDir, 'vault-grant-ends.json');
    const W = SW.storeWriter();
    const mkDoor = (vault) => runMod.create({ dataDir, vault, userTodos: null, sources: {}, log: () => { } });
    const grant = (conv, id) => ({ conv, entries: [id], at: Date.now() - 1000, until: Date.now() + 3600e3, once: false, purpose: 'made-up purpose' });
    const endA = ['cid-made-up-a', 'secrets:secret:aaaa000001#secret'], endB = ['cid-made-up-b', 'secrets:secret:bbbb000002#secret'];
    // life 0: an end on disk (a grant ended by a lock)
    const d0 = mkDoor(e0); d0._grants.set(endA.join('\n'), grant(...endA)); e0.lock('door');
    await until(() => fs.existsSync(ENDS), 3000); await W.durable(ENDS).catch(() => false);
    const fileBefore = fs.readFileSync(ENDS, 'utf8');
    // life 1: the start's read FAILS; a grant ends while held — it lives in MEMORY (no side file); the read again lifts it in this life
    const e1 = mkEngine(dataDir); await e1.unlock(PW);
    let pr = placeRefusal(ENDS), d1, heldSaid = null, inMemory = false;
    try {
      d1 = mkDoor(e1); d1._grants.set(endB.join('\n'), grant(...endB)); heldSaid = (d1.usesFor({ conversationId: endB[0], scope: endB[0] }) || {}).endedUnread || null; e1.lock('door');
      await sleep(30);
      inMemory = [...d1._ended.keys()].some((k) => k.startsWith(endB[0] + '\n'));
    } finally { pr.lift(); }
    const heldKept = fs.readFileSync(ENDS, 'utf8') === fileBefore, noSide = !fs.existsSync(ENDS + '.pending');
    const lifted = await d1._endsHold.again();
    const convs = () => { try { return JSON.parse(fs.readFileSync(ENDS, 'utf8')).ends.map((e) => e.conv); } catch { return []; } };
    await until(() => convs().includes(endB[0]), 3000); await W.durable(ENDS).catch(() => false);
    const fileAfter = convs();
    // life 2: reading fine — which ends does a door know?
    const e2 = mkEngine(dataDir); await e2.unlock(PW);
    const d2 = mkDoor(e2);
    const knows = (conv) => [...d2._ended.keys()].some((k) => k.startsWith(conv + '\n'));
    return { heldKept, inMemory, noSide, heldSaid, lifted, fileAfter, knowsA: knows(endA[0]), knowsB: knows(endB[0]) };
  }
  {
    const r = await endsScene(RUN);
    ok(r.heldKept && r.inMemory && r.noSide, '(d) a read that failed at the start HOLDS the ends: nothing written over the file, and an end made while held lives in MEMORY — no side file (主开发 r3325)', { heldKept: r.heldKept, inMemory: r.inMemory, noSide: r.noSide });
    ok(typeof r.heldSaid === 'string' && /could not be read/.test(r.heldSaid) && /may miss/.test(r.heldSaid), '(d) …a lookup of the ended list while HELD says so (r3104): the agent\'s `uses` carries the hold\'s words — the list may miss an end', { said: !!r.heldSaid });
    ok(r.lifted === true && r.fileAfter.includes('cid-made-up-a') && r.fileAfter.includes('cid-made-up-b'), '(d) …the read again off the loop lifts it: the file\'s ends and the held ones are written ONCE', { lifted: r.lifted, file: r.fileAfter });
    ok(r.knowsA && r.knowsB, '(d) …and the next start knows both ends: none was lost', { a: r.knowsA, b: r.knowsB });
  }
  {
    // r3325: a RESTART while still held loses the ends made meanwhile — NEWS only (said: the list «may miss an end»); the file never
    // written over, its own ends kept
    const dataDir = freshDir('ends-restart');
    const e0 = mkEngine(dataDir); await e0.setup(PW);
    const ENDS = path.join(dataDir, 'vault-grant-ends.json'), W = SW.storeWriter();
    const mkDoor = (vault) => RUN.create({ dataDir, vault, userTodos: null, sources: {}, log: () => { } });
    const endA = ['cid-made-up-ra', 'secrets:secret:dddd000004#secret'], endB = ['cid-made-up-rb', 'secrets:secret:eeee000005#secret'];
    const grant = (conv, id) => ({ conv, entries: [id], at: Date.now() - 1000, until: Date.now() + 3600e3, once: false, purpose: 'made-up purpose' });
    const d0 = mkDoor(e0); d0._grants.set(endA.join('\n'), grant(...endA)); e0.lock('door');
    await until(() => fs.existsSync(ENDS), 3000); await W.durable(ENDS).catch(() => false);
    const before = fs.readFileSync(ENDS, 'utf8');
    const e1 = mkEngine(dataDir); await e1.unlock(PW);
    let pr = placeRefusal(ENDS);
    try { const d1 = mkDoor(e1); d1._grants.set(endB.join('\n'), grant(...endB)); e1.lock('door'); await sleep(30); } finally { pr.lift(); }
    const e2 = mkEngine(dataDir); await e2.unlock(PW);
    pr = placeRefusal(ENDS); let d2, said = null;
    try { d2 = mkDoor(e2); said = (d2.usesFor({ conversationId: endB[0], scope: endB[0] }) || {}).endedUnread || null; } finally { pr.lift(); }
    const lifted = await d2._endsHold.again();
    await sleep(30); await W.durable(ENDS).catch(() => false);
    const knows = (conv) => [...d2._ended.keys()].some((k) => k.startsWith(conv + '\n'));
    ok(fs.readFileSync(ENDS, 'utf8') !== '' && lifted === true && knows(endA[0]) && !knows(endB[0]) && /may miss/.test(String(said || '')), '(d) r3325: a RESTART while still held loses the end made meanwhile — news only, said («may miss an end»); the file\'s own end kept, never written over while held', { a: knows(endA[0]), b: knows(endB[0]), said: !!said, unchangedWhileHeld: before.length > 0 });
  }
  {
    // r3104: a TORN lift is told IN PLACE — the agent's ended list says the list was damaged, WHERE its bytes are kept and what to do,
    // across a restart too. RED: a copy whose lift names nothing (the ends start empty in silence)
    async function tornEnds(runMod) {
      const dataDir = freshDir('ends-torn');
      const e0 = mkEngine(dataDir); await e0.setup(PW);
      const ENDS = path.join(dataDir, 'vault-grant-ends.json');
      fs.writeFileSync(ENDS, '{ "v": 1, "ends": [ not json', { mode: 0o600 });
      const mkDoor = () => runMod.create({ dataDir, vault: e0, userTodos: null, sources: {}, log: () => { } });
      const d1 = mkDoor();
      await until(() => d1._endsHold && !d1._endsHold.held(), 3000);
      await sleep(30); await SW.storeWriter().durable(ENDS).catch(() => false);
      const me = { conversationId: 'cid-made-up-t', scope: 'cid-made-up-t' };
      const copies = fs.readdirSync(dataDir).filter((n) => n.startsWith('vault-grant-ends.json.corrupt-'));
      const said = (d1.usesFor(me) || {}).endedLost || '';
      const saidAfter = (mkDoor().usesFor(me) || {}).endedLost || '';   // the next start reads the file the lift wrote
      return { copies: copies.length, names: copies.length === 1 && said.includes(copies[0]) && /damaged/.test(said) && /not a copy to restore/.test(said), after: copies.length === 1 && saidAfter.includes(copies[0]) };
    }
    const r = await tornEnds(RUN);
    ok(r.copies === 1 && r.names && r.after, '(d) a TORN ends file is kept aside ONCE, and the lift is told IN PLACE (r3104): the agent\'s ended list says it was damaged, WHERE its bytes are kept (never «restore that copy») and what to do — after a restart too', r);
    const M = mutantCopies('vault-side-stores-d-torn', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const r2 = await tornEnds(M.load('src/server/vault-run-door.js', anchored(SRC, 'if (f && f.setAside) endsLost = { name: path.basename(String(f.setAside)), at: now() }; ', '', 'torn-silent'), 'torn-silent'));
    ok(r2.copies === 1 && !r2.names && !r2.after, '(d) CONTROL (a lift that names nothing): the ends start empty in silence — red', r2);
  }
  {
    // r3230's reader table: an end TAKEN BACK while the ends are HELD (here: the entry deleted) never comes back at the lift's merge;
    // and an end of that entry made AFTER the taking back stands (r3325). RED: a merge that does not ask what was taken back
    async function goneScene(runMod) {
      const dataDir = freshDir('ends-gone');
      const e0 = mkEngine(dataDir); await e0.setup(PW);
      const ENDS = path.join(dataDir, 'vault-grant-ends.json'), W = SW.storeWriter();
      const mkDoor = (vault) => runMod.create({ dataDir, vault, userTodos: null, sources: {}, log: () => { } });
      const endA = ['cid-made-up-g', 'secrets:secret:cccc000003#secret'], endC = ['cid-made-up-h', 'secrets:secret:ffff000006#secret'];
      const grant = (conv, id, at = Date.now() - 1000) => ({ conv, entries: [id], at, until: Date.now() + 3600e3, once: false, purpose: 'made-up purpose' });
      const d0 = mkDoor(e0); d0._grants.set(endA.join('\n'), grant(...endA)); d0._grants.set(endC.join('\n'), grant(...endC)); e0.lock('door');
      await until(() => fs.existsSync(ENDS), 3000); await W.durable(ENDS).catch(() => false);
      const onDiskBefore = (() => { try { const c = JSON.parse(fs.readFileSync(ENDS, 'utf8')).ends.map((e) => e.conv); return c.includes(endA[0]) && c.includes(endC[0]); } catch { return false; } })();
      const e1 = mkEngine(dataDir); await e1.unlock(PW);
      const pr = placeRefusal(ENDS); let d1;
      try {
        d1 = mkDoor(e1);
        d1.forgetEntry(endA[1]);   // held: entry A deleted
        d1.forgetEntry(endC[1]); d1._grants.set(endC.join('\n'), grant(endC[0], endC[1], Date.now() + 5)); e1.lock('door');   // held: entry C deleted, then a grant of it given AFTER and ended by a lock
        await sleep(30);
      } finally { pr.lift(); }
      const lifted = await d1._endsHold.again();
      await sleep(30); await W.durable(ENDS).catch(() => false);
      const recOf = (conv) => [...d1._ended.values()].find((e) => e.conv === conv) || null;
      const fileBack = (() => { try { return JSON.parse(fs.readFileSync(ENDS, 'utf8')).ends.some((e) => e.conv === endA[0]); } catch { return null; } })();
      const c = recOf(endC[0]);
      return { onDiskBefore, lifted, back: !!recOf(endA[0]), fileBack, laterStands: !!c && c.endedBy === 'lock' };
    }
    const r = await goneScene(RUN);
    ok(r.onDiskBefore && r.lifted === true && !r.back && r.fileBack === false, '(d) an end TAKEN BACK while held (its entry deleted) never comes back at the lift (r3230\'s reader table)', r);
    ok(r.laterStands, '(d) r3325: …and an end of that entry made AFTER the taking back stands (a later end is never swallowed)', r);
    const M2 = mutantCopies('vault-side-stores-d-gone', REPO);
    const SRC2 = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const r2 = await goneScene(M2.load('src/server/vault-run-door.js', anchored(SRC2, "      if ((goneEntriesHeld.get(r.id) || 0) >= r.endedAt || (gonePairsHeld.get(k) || 0) >= r.endedAt) continue;", '', 'merge-forgets-gone'), 'merge-forgets-gone'));
    ok(r2.back, '(d) CONTROL (a merge that does not ask what was taken back): the deleted entry\'s end is back after the lift — red', r2);
  }
  {
    // the held life's red: a lift that does not fold the FILE's own ends in — the next write keeps only the held ones
    const M = mutantCopies('vault-side-stores-d', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const r = await endsScene(M.load('src/server/vault-run-door.js', anchored(SRC, 'if (v && Array.isArray(v.ends)) mergeEnds(v.ends); ', '', 'lift-forgets-file'), 'lift-forgets-file'));
    ok(!r.knowsA, '(d) CONTROL (a lift that does not fold the file\'s ends in): the file\'s own end is lost at the lift — red', { a: r.knowsA });
  }
  console.log('(b) vault.json');
  async function recordScene(veMod = VE, { times = 1 } = {}) {
    const dataDir = freshDir('record');
    const mk = () => veMod.create({ dataDir, kdf: KDF, log: quiet, idleTimer: false, register: false, bcast: () => { } });
    const v0 = mk(); await v0.setup(PW);
    const FILE = path.join(dataDir, 'vault.json'), bytes = fs.readFileSync(FILE, 'utf8');
    return { dataDir, mk, FILE, bytes };
  }
  {
    const w = await recordScene();
    const pr = placeRefusalTimes(w.FILE, 1);   // ONE read fails (a slow disk once), then the file reads
    let v1; try { v1 = w.mk(); } finally { pr.lift(); }
    const f1 = v1.facts();
    const u = await v1.unlock(PW);
    ok(fs.readFileSync(w.FILE, 'utf8') === w.bytes && f1.unreadable === true && f1.corrupt === false, '(b) a read that failed once at the start writes nothing over the record and is said «could not be read», never «damaged»', { unreadable: f1.unreadable, corrupt: f1.corrupt });
    ok(!!u && u.ok === true, '(b) …and the record is READ AGAIN in the same life: the unlock press asks one read again now, and the right password opens it', u && (u.ok ? 'ok' : u.code));
  }
  {
    const w = await recordScene();
    const pr = placeRefusal(w.FILE);   // the read keeps failing
    let u = null, su = null;
    let v1;
    try { v1 = w.mk(); u = await v1.unlock(PW); su = await v1.setup('another made-up password ' + crypto.randomBytes(3).toString('hex')); } finally { pr.lift(); }
    ok(!!u && !u.ok && u.code === 'record_unreadable' && /could not be read/.test(u.error || ''), '(b) …a read that keeps failing answers its own code (record_unreadable: «could not be read»), the vault locked', u && u.code);
    ok(!!su && !su.ok && fs.readFileSync(w.FILE, 'utf8') === w.bytes, '(b) …and the REMOVER removes ZERO: a setup is refused while the record is held — no new record over the sealed stores', su && su.code);
    const lifted = await v1.unlock(PW);
    ok(!!lifted && lifted.ok === true, '(b) …once it reads, the next unlock opens it (same life)', lifted && (lifted.ok ? 'ok' : lifted.code));
  }
  {
    const w = await recordScene();
    fs.writeFileSync(w.FILE, '{"v":1,"entries":{"a');   // torn bytes
    const torn = fs.readFileSync(w.FILE, 'utf8');
    const v1 = w.mk();
    const f1 = v1.facts(), u = await v1.unlock(PW), su = await v1.setup('another made-up password ' + crypto.randomBytes(3).toString('hex'));
    ok(f1.corrupt === true && !f1.unreadable && !!u && u.code === 'corrupt' && !!su && !su.ok && fs.readFileSync(w.FILE, 'utf8') === torn, '(b) TORN bytes stay DAMAGED for the life (never «not set up»): the unlock says damaged, a setup is refused, nothing written over them', { corrupt: f1.corrupt, unlock: u && u.code, setup: su && su.code });
  }
  {
    const M = mutantCopies('vault-side-stores-b', REPO);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-engine.js'), 'utf8');
    const cut = "    if (recordHeld()) { try { await recordHold.again(); } catch { } }";
    ok(SRC.split(cut).length === 2, '(b) the unlock\'s read again is there once (the control below takes it out)');
    const w = await recordScene(M.load('src/server/vault-engine.js', anchored(anchored(SRC, cut, '', 'no-reread'), 'recordHold.start(SR.storeAnswer({ error: e }));', '', 'no-reread-start'), 'no-reread'));
    const pr = placeRefusalTimes(w.FILE, 1);
    let v1; try { v1 = w.mk(); } finally { pr.lift(); }
    const u = await v1.unlock(PW);
    ok(!!u && !u.ok, '(b) CONTROL (the release\'s load — never read again in the life): the right password is refused after the disk reads again — red', u && (u.ok ? 'ok' : u.code));
  }

  console.log('(e) vault-run-tools.json');
  {
    // r5363 / r5367: the vault run door's TOOLS RECORD (each sealed tool's first-seen digest: a drift record, never a gate) under the
    // store-read law. The scenes reach it through the door's two named seams, _driftNote (the sealed run's own call, a made-up stat
    // and digest) and _toolsHold; test-vault-run-seal drives the sealed runs themselves (a held record neither refuses nor passes one)
    const M = mutantCopies('vault-side-stores-tools', REPO);
    const SRCt = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const i0 = SRCt.indexOf('  const toolsLoad = () => {\n'), i1 = SRCt.indexOf('  const toolsSave = () => {');
    const NEW_LOAD = i0 >= 0 && i1 > i0 ? SRCt.slice(i0, i1) : '(the tools record\'s read is gone)';
    const OLD_LOAD = "  const toolsLoad = () => { if (toolsCache) return toolsCache; let o = null; try { o = JSON.parse(readBounded(TOOLS_FILE, STORE_MAX).toString('utf8')); } catch { o = null; } toolsCache = (o && o.tools && typeof o.tools === 'object') ? { v: 1, tools: o.tools } : { v: 1, tools: {} }; return toolsCache; };\n";   // the release's read, written back by the red control on purpose — stale-pins: kept
    const RELEASE = M.load('src/server/vault-run-door.js', anchored(SRCt, NEW_LOAD, OLD_LOAD, 'tools-release-read'), 'tools-release-read');   // the release's read: any failure is «no tools», for the life
    const TA = '/usr/bin/made-up-tool-a', TB = '/usr/bin/made-up-tool-b';
    const stOf = (n) => ({ dev: 1, ino: n, size: 100 + n, mtimeMs: 1700000000000 + n });
    const sha = (c) => c.repeat(64);
    const rec = (p, n, s) => ({ path: p, dev: 1, ino: n, size: 100 + n, mtime: 1700000000000 + n, sha256: s, version: null, at: Date.now() - 86400e3 });
    const doorOf = async (Mod, tag) => { const dataDir = freshDir(tag); const e0 = mkEngine(dataDir); await e0.setup(PW); return { dataDir, TF: path.join(dataDir, 'vault-run-tools.json'), door: Mod.create({ dataDir, vault: e0, userTodos: null, sources: {}, log: () => { } }) }; };
    const unreadScene = async (Mod) => {
      const { TF, door } = await doorOf(Mod, 'tools-unread');
      fs.writeFileSync(TF, JSON.stringify({ v: 1, tools: { [TA]: rec(TA, 1, sha('a')), [TB]: rec(TB, 2, sha('b')) } }), { mode: 0o600 });
      const before = fs.readFileSync(TF, 'utf8');
      const pr = placeRefusal(TF); let held = null;
      try { door._driftNote(TB, stOf(2), sha('c'), 'made-up-b'); held = door._toolsHold.held(); } finally { pr.lift(); }
      const whileHeld = fs.readFileSync(TF, 'utf8');
      const lifted = held ? await door._toolsHold.again() : null;
      door._driftNote(TB, stOf(2), sha('c'), 'made-up-b');   // after the lift: the tool's change against the FILE's baseline
      const after = jsonOr(TF) || {}; const t = after.tools || {};
      try { door._toolsHold.stop(); } catch { }
      return { heldCode: held && held.code, keptWhileHeld: whileHeld === before, lifted, aKept: !!(t[TA] && t[TA].sha256 === sha('a')), bDrift: !!(t[TB] && t[TB].sha256 === sha('c') && t[TB].noticedSha === sha('c')) };
    };
    { const r = await unreadScene(RUN);
      ok(r.heldCode === 'EIO' && r.keptWhileHeld === true, '(e) a tools record that could not be read (EIO) at a sealed run\'s drift note is HELD: nothing recorded, the file byte for byte as it was (both tools\' baselines kept)', r);
      ok(r.lifted === true && r.aKept && r.bDrift, '(e) …read again off the loop, it lifts and recording resumes FROM THE FILE: the changed tool is noticed against its own baseline (first notice), the other tool\'s record kept', r); }
    { const r = await unreadScene(RELEASE);
      ok(!(r.keptWhileHeld && r.aKept), '(e) CONTROL (the release\'s read — any failure is «no tools» for the life): the next drift note writes a fresh file over the unread one and the other tool\'s baseline is LOST — red', r); }
    const TORN = '{"v":1,"tools":{"' + TA + '":{"path":';
    const tornScene = async (Mod) => {
      const { dataDir, TF, door } = await doorOf(Mod, 'tools-torn');
      fs.writeFileSync(TF, TORN, { mode: 0o600 });
      door._driftNote(TA, stOf(1), sha('a'), 'made-up-a');   // torn bytes: held while their copy is made off the loop
      const lifted = await until(() => !door._toolsHold.held(), 3000);
      door._driftNote(TA, stOf(1), sha('a'), 'made-up-a');   // after the lift (empty): the tool's baseline set again
      const copies = fs.readdirSync(dataDir).filter((n) => n.startsWith('vault-run-tools.json.corrupt-'));
      const after = jsonOr(TF) || {};
      try { door._toolsHold.stop(); } catch { }
      return { lifted, copies: copies.length, copyIsTorn: copies.length === 1 && fs.readFileSync(path.join(dataDir, copies[0]), 'utf8') === TORN, aSet: !!(after.tools && after.tools[TA] && after.tools[TA].sha256 === sha('a')) };
    };
    { const r = await tornScene(RUN);
      ok(r.lifted && r.copyIsTorn && r.aSet, '(e) torn bytes: kept aside ONCE (the copy byte for byte), lifted empty, and the tool\'s baseline is set again at its next drift note', r); }
    { const r = await tornScene(RELEASE);
      ok(r.copies === 0, '(e) CONTROL (the release\'s read): the torn bytes are written over with no copy kept — red', r); }
    { const { TF, door } = await doorOf(RUN, 'tools-missing');
      door._driftNote(TA, stOf(1), sha('a'), 'made-up-a');
      const after = jsonOr(TF) || {};
      ok(!door._toolsHold.held() && !!(after.tools && after.tools[TA] && after.tools[TA].sha256 === sha('a') && !after.tools[TA].noticedSha), '(e) a MISSING record is a first run, as before: the tool\'s baseline is set, no notice', after); }
  }
}

main().then(() => report(), (e) => { console.error(`  ✗ the suite itself threw — ${(e && e.stack) || e}`); process.exit(1); });
