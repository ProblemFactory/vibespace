#!/usr/bin/env node
// THE VAULT's SIDE STORES under the store-read law (lane lg-vault-env, the coordinator's r3002 / r3019 — from the store-read law's
// verification and lane bl-machines-b's census of the data folder's stores). Each store's read is made to fail by a PLACED refusal of
// its read call (the read answers EIO; never a mount, never a mode change), then the store's ORDINARY next save or start runs: the
// file's content survives, the person is told what is known, and — r3019's law — WHO REMOVES BY THE STORE's SILENCE removes nothing.
//   (a) vault-use-marks.json — src/server/vault-use-grants.js (the marks held; a row UNDECIDED when its marks are lost)
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
    const r2 = await alwaysScene(M.load('src/server/vault-run-door.js', anchored(SRC, '      if (one && (one.held || one.waits)) keep.push(a);\n', '', 'carry-keeps-nothing'), 'carry-keeps-nothing'));
    ok(r2.kept === 0 && !r2.carried, '(a) CONTROL (a door whose carry keeps nothing): the held read empties the list and the row is never carried — red', r2);
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
}

main().then(() => report(), (e) => { console.error(`  ✗ the suite itself threw — ${(e && e.stack) || e}`); process.exit(1); });
