#!/usr/bin/env node
// test-reset-claims-held — r3003 (b) (主开发, lane hub-loop-stalls): data/usage-reset-claims.json UNDER THE STORE-READ LAW
// (src/store-read-hold.js), through the REAL src/usage-reset-claim.js over a scratch data folder of this suite's own (made-up
// claims). The unreadable file is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path, the next read
// only), never a mount, never a mode change; torn bytes are bytes written whole that do not parse. No vendor call.
// Each law: its leg, and the RED (the release's read put back in a copy) where a line can be put back.
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const RC = require(path.join(REPO, 'src/usage-reset-claim.js'));
const M = mutantCopies('reset-claims-held', REPO);
const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
const placeReads = (file, n = 1) => {
  const f = path.resolve(file), realS = fs.readFileSync; const seen = { sync: 0 };
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f && seen.sync < n) { seen.sync++; throw EIO(); } return realS.call(this, p, ...a); };
  return { seen, restore: () => { fs.readFileSync = realS; } };
};
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let dirN = 0;
const mk = () => { const d = path.join(scratch('reset-claims-held'), 'd' + (++dirN)); fs.mkdirSync(d, { recursive: true }); return d; };
const T = Date.now();
const BEFORE = { v: 1, claims: { 'acct-a': { lanes: { 'plan:5h': { at: T - 60e3, by: 'person', name: 'Work Max' } } } },
  outcomes: { 'acct-a': [{ lane: 'plan:5h', state: 'confirmed', readAt: T - 30e3, usedPct: 2 }] }, seen: { 'acct-b': [{ lane: 'plan:5h', resetsAt: Math.floor(T / 1000) - 60 }] } };
const BYTES = JSON.stringify(BEFORE);
const holds = (j) => !!(j && j.claims && j.claims['acct-a'] && j.outcomes && j.outcomes['acct-a'] && j.seen && j.seen['acct-b']);
const RAW = { fetchedAt: T, fiveHour: { utilization: 0.9, resetsAt: Math.floor(T / 1000) + 3600 } };
const heldStart = (Mod = RC, logs = []) => { const dir = mk(), F = path.join(dir, 'usage-reset-claims.json'); fs.writeFileSync(F, BYTES); const pr = placeReads(F); let s = null; try { s = Mod.create({ file: F, now: () => T, log: (l) => logs.push(String(l)) }); } finally { pr.restore(); } return { s, F, seen: pr.seen.sync, logs }; };

console.log('§1 claims that could not be read are HELD: nothing is written over them, a person\'s act is refused by name, nothing is noted');
{
  // CONTROL: the read answers ⇒ the start writes nothing, the claims are there
  const d0 = mk(), F0 = path.join(d0, 'usage-reset-claims.json'); fs.writeFileSync(F0, BYTES);
  const s0 = RC.create({ file: F0, now: () => T, log: () => { } }); await s0.persisted(); await sleep(30);
  ok(holds(readJson(F0)) && !!s0.get('acct-a') && s0.unreadWords() === null, 'CONTROL: the claims read at the start ⇒ on disk as they were, the claim there, nothing held', readJson(F0));
  const { s, F, seen, logs } = heldStart();
  await s.persisted(); await sleep(50);
  ok(seen === 1 && /could not be read/.test(s.unreadWords() || '') && fs.readFileSync(F, 'utf8') === BYTES, 'HELD: the start\'s one read refused (EIO) ⇒ nothing written AT THE START (the release saved the empty state here), its words say so', { seen, logs: logs.slice(0, 3) });
  const c = s.claim('acct-a', 'all', RAW);
  ok(c.ok === false && c.code === 'reset_claims_unread' && /could not be read/.test(c.error), `HELD: a person's claim is refused BY NAME (${c.code})`, c);
  ok(s.dismiss('acct-a') === false, 'HELD: a dismissal is not done (the route refuses it by name: unreadWords)');
  const said = s.noteResetSeen('acct-b', [{ lane: 'plan:5h', resetsAt: Math.floor(T / 1000) - 60, before: 90, after: 2, readAt: T }]);
  s.noteLanesRead('acct-a', [{ lane: 'plan:5h', at: T, usedPct: 2 }]);
  ok(said === 0 && !logs.some((l) => /was reset — /.test(l)) && fs.readFileSync(F, 'utf8') === BYTES, 'HELD: a reset seen is NOT said on a memory that could not be read (it would be said again), a lane read is not noted, the file untouched', { said, logs: logs.slice(0, 4) });
  // the read again answers ⇒ LIFTED: the claims back as they were
  const lifted = await s.readAgain();
  ok(lifted === true && s.unreadWords() === null && !!s.get('acct-a') && s.outcomesOf('acct-a').length === 1, 'LIFTED: the claim and its outcome are back (the said-once memory with them)', { claim: s.get('acct-a') });
  const again = s.noteResetSeen('acct-b', [{ lane: 'plan:5h', resetsAt: Math.floor(T / 1000) - 60, before: 90, after: 2, readAt: T }]);
  ok(again === 0, 'LIFTED: the same reset is known already — said never twice', again);
}

console.log('§2 a restart while held reads the same file again; the RED: the release\'s read');
{
  const { s, F } = heldStart();
  await s.persisted(); await sleep(30);
  const pr = placeReads(F); let s2 = null; try { s2 = RC.create({ file: F, now: () => T, log: () => { } }); } finally { pr.restore(); }
  await s2.persisted(); await sleep(30);
  ok(!!s2.unreadWords() && fs.readFileSync(F, 'utf8') === BYTES, 'a restart while the file still fails to read: held again, the file untouched', s2.heldFacts());
  const SRC = fs.readFileSync(path.join(REPO, 'src/usage-reset-claim.js'), 'utf8');
  const OLD2 = M.load('src/usage-reset-claim.js', anchored(anchored(SRC, "    var _rewrite = !!r.dropped.length;", "    var _rewrite = !!(r.dropped.length || st === 'held');", 'claims-old-rewrite2'), "    if (hold && !hold.writable('a write of the reset claims')) return;   // HELD: never over a file that could not be read\n", '', 'claims-old-save'), 'claims-old-save');   // stale-pins: kept — the release's save (no hold asked), planted back as the RED
  const r = heldStart(OLD2);
  await r.s.persisted(); await sleep(50);
  ok(!holds(readJson(r.F)), 'RED: the release\'s read — the start writes the empty state over the claims', readJson(r.F));
}

console.log('§3 torn bytes: kept aside once, then empty — saved once (no remover reads this store)');
{
  const dir = mk(), F = path.join(dir, 'usage-reset-claims.json'), TORN = BYTES.slice(0, 40);
  fs.writeFileSync(F, TORN);
  const s = RC.create({ file: F, now: () => T, log: () => { } });
  for (let i = 0; i < 200 && s.heldFacts(); i++) await sleep(10);
  await s.persisted(); await sleep(30);
  const copies = fs.readdirSync(dir).filter((n) => n.startsWith('usage-reset-claims.json.corrupt-'));
  ok(!s.heldFacts() && copies.length === 1 && fs.readFileSync(path.join(dir, copies[0]), 'utf8') === TORN && s.tornCopy() === copies[0], `TORN: kept aside ONCE, byte for byte (${copies.join(', ')}); the lift names it`, copies);
  const j = readJson(F);
  ok(!!j && j.v === 1 && Object.keys(j.claims).length === 0, 'TORN: then the empty shape is saved once (the next start reads it)', j);
}

console.log('§4 the routes refuse by name while held');
{
  const ur = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
  ok(/if \(!r\.ok && r\.code === 'reset_claims_unread'\) return res\.status\(503\)\.json\(\{ error: r\.error, code: r\.code \}\);/.test(ur)
    && /\{ const w = typeof resetClaims\.unreadWords === 'function' \? resetClaims\.unreadWords\(\) : null; if \(w\) return res\.status\(503\)\.json\(\{ ok: false, code: 'reset_claims_unread', error: w \}\); \}/.test(ur),
    'the claim and the dismiss routes answer the hold by name (503, reset_claims_unread)');
}

report();
