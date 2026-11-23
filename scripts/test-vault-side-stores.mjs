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
    let save = null, pub = null, run = null;
    try {
      save = ug.setRow(w.e1, { to: [w.m1, { kind: 'conversation', key: 'cid-made-up-3', hosts: ['192.168.1.1'] }] }, { reauthed: true });
      pub = ug.publicFor(w.e2);
      run = ug.verdictFor(w.e2, { conversationKeys: ['cid-made-up-2'] }, { hosts: ['192.168.1.1'], destinationKnown: true });
    } finally { pr.lift(); }
    const after = jsonOr(w.MARKS);
    ok(!!save && !save.ok && save.code === 'vault_use_marks_unread' && /could not be read/.test(save.error || '') && JSON.stringify(after) === JSON.stringify(before), '(a) a read that failed HOLDS the marks: the owner\'s next Save is refused by name (what is known: «could not be read»), and nothing is written over the file', save && (save.ok ? 'the Save went through' : save.code));
    ok(!!pub && pub.unverified === true && pub.unverifiedWhy === 'marks_unread' && (pub.to || []).length === 1, '(a) …while held, the Vault window lists the other entry\'s member «unverified — the marks could not be read», never as a held grant', pub && { unverified: pub.unverified, why: pub.unverifiedWhy, members: (pub.to || []).length });
    ok(!!run && !(run.ok === true && run.member), '(a) …and a run is never let through on a mark that could not be checked (fail CLOSED: it asks its card)');
    ok(w.stale.length === 0, '(a) …and nobody is told a FORGERY for a read that failed (no «could not be trusted» notice)', `stale notices ${w.stale.length}`);
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
}

main().then(() => report(), (e) => { console.error(`  ✗ the suite itself threw — ${(e && e.stack) || e}`); process.exit(1); });
