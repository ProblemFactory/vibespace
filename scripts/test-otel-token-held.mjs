#!/usr/bin/env node
// THE OTEL SIGN-IN VALUE UNDER THE STORE-READ LAW (row B-f276's family unit 2; 主开发 r3175 / r4244; lane bl-loop-a).
// src/server/otel-ingest.js reads data/usage-history/otel-token at its start: the value every local session exports its usage with
// (OTEL_EXPORTER_OTLP_HEADERS), and the ONLY key of the loopback /otel door. The release read ANY failure of that read as «no value»
// and MINTED A NEW ONE OVER THE FILE: every surviving session's exporter was refused from then on. THE LAW: «not there» mints and
// writes one (a new instance); «the read failed» HOLDS the file — nothing is written over it, sessions started meanwhile carry this
// run's own value (both are let in), the file is read again off the loop (the family's rules); torn bytes are kept aside once.
// Every world is the REAL module on a scratch data folder; a file that «cannot be read» is a PLACED refusal of the read calls for that
// one path (EIO), a «not there» once or a read that hangs are placed the same way — never a mount, never a mode change.
//   T1 the read fails at the start ⇒ the file's bytes UNCHANGED, the session's value is this run's own, both let in, the old one
//      refused only while held, the hold on the family's held list (RED: the release's mint over it)
//   T2 a read again answers ⇒ the file's value let in again (surviving sessions), this run's still let in, new sessions the file's
//   T3 «not there» right after the unread answer only arms the next try; not there TWICE ⇒ this run's value is the file's, 0600
//      (RED: «not there» believed at once ⇒ written over a file that IS there)
//   T4 torn bytes at the start ⇒ kept aside ONCE (the same bytes, 0600), then this run's value is the file's
//   T5 an EMPTY file ⇒ read once more before it is torn (a second rung), then as T4
//   T6 «not there» at the start ⇒ minted and written before any session is handed it (a new instance, as the release)
//   T7 a read again that HANGS ⇒ the press answers by the bound, a read that waits is said, the late answer lifts it
//   T8 the value is never said: no log line, no held-list row, no stats answer carries it — nor a part of it (its first eight
//      characters) nor its length beside a known word (a planted line is caught: the scan's control)
// THE FOLLOW (主开发 r4292): T1b the door while the file is held refuses a missing header, an empty value, «undefined», «null» and an
//   arbitrary value, and lets this run's value in (RED: a compare that takes two empties as equal); T2b after the read again it lets
//   both in and still refuses the five; T7 counts the reads: a second press starts NONE (RED: the one-in-flight guard cut)
// Run: node scripts/test-otel-token-held.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, endScratchAtExit, anchored } from './scratch.mjs';   // §113: the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── THE PLACED READS for the token path: EIO (placed), and one-shot answers of the off-loop read ('enoent' | 'hang') ──
const placed = new Set(), plans = new Map(), hangs = [], reads = new Map();
const realRF = fs.readFileSync, realPRF = fs.promises.readFile;
const eio = (p) => Object.assign(new Error(`EIO: a placed read refusal, read '${p}'`), { code: 'EIO' });
fs.readFileSync = function (p, ...a) { if (placed.has(String(p))) throw eio(p); return realRF.call(this, p, ...a); };
fs.promises.readFile = function (p, ...a) {
  const k = String(p), q = plans.get(k);
  reads.set(k, (reads.get(k) || 0) + 1);
  if (q && q.length) {
    const act = q.shift();
    if (act === 'enoent') return Promise.reject(Object.assign(new Error(`ENOENT: a placed «not there», open '${p}'`), { code: 'ENOENT' }));
    if (act === 'hang') return new Promise((res, rej) => { hangs.push(() => realPRF.call(fs, p, ...a).then(res, rej)); });
  }
  if (placed.has(k)) return Promise.reject(eio(p));
  return realPRF.call(this, p, ...a);
};
// every [otel] line the module says (T8 reads them all)
const said = [], realWarn = console.warn, realLog = console.log;
console.warn = (...a) => { const l = a.map(String).join(' '); if (/\[otel\]/.test(l)) { said.push(l); return; } realWarn(...a); };

const SRC = realRF.call(fs, path.join(repo, 'src/server/otel-ingest.js'), 'utf8');
const MUT = mutantCopies('otel-token-held', repo);
const copyOf = (pairs, tag) => MUT.load('src/server/otel-ingest.js', pairs.reduce((t, [a, b]) => anchored(t, a, b, tag), SRC), tag);
const O = require(path.join(repo, 'src/server/otel-ingest.js'));
const HL = require(path.join(repo, 'src/server/held-lists.js'));
const W = () => require(path.join(repo, 'src/store-writer.js')).storeWriter();
const settled = async (files, ms = 3000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (!files.some((f) => W().pending(f))) return true; await sleep(10); } return false; };

const ROOT = scratch('otel-token-held'); fs.mkdirSync(ROOT, { recursive: true }); endScratchAtExit(ROOT);
let seq = 0;
const OLD = ['a1b2c3d4', 'e5f6a7b8', 'c9d0e1f2', 'a3b4c5d6'].join('');   // the value surviving sessions export with (made up, built at runtime)
function world(tag, content) {
  const dataDir = path.join(ROOT, `${tag}-${++seq}`); fs.mkdirSync(path.join(dataDir, 'usage-history'), { recursive: true });
  const file = path.join(dataDir, 'usage-history', 'otel-token');
  if (content !== undefined) fs.writeFileSync(file, content, { mode: 0o600 });
  const make = (Mod = O, extra = {}) => Mod.create({ dataDir, PORT: 0, getUsageHistory: () => null, identityGroups: () => [], listAccounts: () => [], serverSetting: () => undefined, ...extra });
  return { dataDir, file, make };
}
const bytes = (f) => { try { return realRF.call(fs, f, 'utf8'); } catch { return null; } };
const modeOf = (f) => { try { return (fs.statSync(f).mode & 0o777).toString(8); } catch { return null; } };
/** the loopback door asked with a value → its status (200 let in, 403 refused) */
const door = (o, v) => { let st = 200; const res = { status(c) { st = c; return this; }, json() { return this; }, set() { return this; } }; o.ok({ socket: { remoteAddress: '127.0.0.1' }, headers: v === undefined ? {} : { 'x-vibespace-otel': v } }, res); return st; };   // undefined: no header at all
const ODD = ['f0e1d2c3', 'b4a59687', '78695a4b', '3c2d1e0f'].join('');   // an arbitrary value of the right shape (built at runtime)
const FIVE = [undefined, '', 'undefined', 'null', ODD];   // r4292: what the door refuses in every state
const five = (o) => FIVE.map((v) => door(o, v));
const valueOf = (o) => String((o.envFor() || {}).OTEL_EXPORTER_OTLP_HEADERS || '').replace(/^x-vibespace-otel=/, '');
const until = async (fn, ms = 3000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (fn()) return true; await sleep(10); } return !!fn(); };
const within = (p, ms) => Promise.race([p.then((v) => ({ v })), sleep(ms).then(() => ({ hung: true }))]);

try {
  console.log('— T1 the read fails at the start');
  const run1 = (Mod) => {
    const w = world('t1', OLD); placed.add(w.file);
    const o = w.make(Mod);
    const v = valueOf(o), out = { same: bytes(w.file) === OLD, fresh: v && v !== OLD, newIn: door(o, v), oldIn: door(o, OLD), held: !!(o.stats().tokenHeld), w, o };
    placed.delete(w.file);
    return out;
  };
  const g1 = run1(O);
  ok(g1.same && g1.fresh && g1.newIn === 200 && g1.oldIn === 403 && g1.held, `the file is NOT written over (its bytes unchanged); a session started now carries this run's own value (let in: ${g1.newIn}); the file's value waits for the file (${g1.oldIn} while held); the hold is said`, { same: g1.same, fresh: g1.fresh, newIn: g1.newIn, oldIn: g1.oldIn, held: g1.held });
  const f1 = five(g1.o);
  ok(f1.every((c) => c === 403) && door(g1.o, valueOf(g1.o)) === 200, `T1b the door while the file is held: a missing header, an empty value, «undefined», «null» and an arbitrary value refused (${f1.join(' ')}); this run's value let in`, f1);
  const twoEmpties = (() => {
    const w = world('t1e', OLD); placed.add(w.file);
    const o = w.make(copyOf([["    if (loop && token && sameToken(req.headers['x-vibespace-otel'], token)) return true;", "    if (loop && (req.headers['x-vibespace-otel'] || '') === (token || '')) return true;"]], 'two-empties'));
    placed.delete(w.file);
    return door(o, undefined);
  })();
  ok(twoEmpties === 200, `RED: a compare that takes two empties as equal ⇒ a post with NO header is let in while the file is held (${twoEmpties})`, { twoEmpties });
  const hl = HL.create({ hold: { holds: () => [], readAgainOf: async () => false, onHoldsChange: () => () => { } }, older: [g1.o.tokenRow] });
  const rows = hl.list(); hl.stop();
  ok(rows.length === 1 && rows[0].what === 'otel-token' && rows[0].readAgain === true, `the hold is ONE row of the family's held list («${rows[0] && rows[0].what}», read again: ${rows[0] && rows[0].readAgain})`, rows);
  const r1 = run1(copyOf([["    else if (a.state === 'missing') {", "    else if (a.state !== 'data') {"]], 'mint-over'));
  ok(!r1.same, `RED: the release's road (any failed read mints) ⇒ the file WRITTEN OVER — every surviving session refused (same bytes: ${r1.same})`, { same: r1.same });

  console.log('— T2 a read again answers');
  const v1 = valueOf(g1.o);
  const lifted2 = await g1.o.readTokenAgain();
  ok(lifted2 === true && door(g1.o, OLD) === 200 && door(g1.o, v1) === 200 && valueOf(g1.o) === OLD && bytes(g1.w.file) === OLD && !g1.o.stats().tokenHeld,
    'the file read again: its value let in again (surviving sessions), this run\'s still let in (sessions started meanwhile), new sessions carry the file\'s; nothing written', { lifted2, now: valueOf(g1.o) === OLD });

  const f2 = five(g1.o);
  ok(f2.every((c) => c === 403) && door(g1.o, OLD) === 200 && door(g1.o, v1) === 200, `T2b after the read again: the file's value and this run's let in, the five still refused (${f2.join(' ')})`, f2);

  console.log('— T3 «not there» right after the unread answer, then not there again');
  const run3 = async (Mod, tag) => {
    const w = world(tag, OLD); placed.add(w.file);
    const o = w.make(Mod); const v = valueOf(o);
    placed.delete(w.file); plans.set(w.file, ['enoent']);
    const first = await o.readTokenAgain(), afterFirst = bytes(w.file), heldAfterFirst = !!o.stats().tokenHeld;
    let second = null;
    if (heldAfterFirst) { fs.unlinkSync(w.file); second = await o.readTokenAgain(); await settled([w.file]); }
    else await settled([w.file]);
    plans.delete(w.file);
    return { first, afterFirst: afterFirst === OLD, heldAfterFirst, second, file: bytes(w.file), v, mode: modeOf(w.file) };
  };
  const g3 = await run3(O, 't3');
  ok(g3.first === false && g3.afterFirst && g3.heldAfterFirst && g3.second === true && g3.file === g3.v && g3.mode === '600',
    `a «not there» right after the unread answer only arms the next try (still held, the file untouched); not there TWICE ⇒ this run's value is the file's (0${g3.mode}, written through the store writer)`, { ...g3, file: g3.file === g3.v, v: undefined });
  const r3 = await run3(copyOf([["      if (a.state === 'missing' && !tMissingAt) { tMissingAt = Date.now(); return false; }", '']], 'missing-at-once'), 't3r');
  ok(r3.first === true && r3.file === r3.v && r3.file !== OLD, 'RED: «not there» believed at once ⇒ this run\'s value written over a file that IS there', { first: r3.first, over: r3.file !== OLD });

  console.log('— T4 torn bytes at the start');
  const TORN = '\u0000\u0001';
  const w4 = world('t4', TORN); const o4 = w4.make(); const v4 = valueOf(o4);
  await until(() => !o4.stats().tokenHeld); await settled([w4.file]);
  const copies4 = fs.readdirSync(path.dirname(w4.file)).filter((f) => f.startsWith('otel-token.corrupt-'));
  const kept4 = copies4.length === 1 && bytes(path.join(path.dirname(w4.file), copies4[0])) === TORN && modeOf(path.join(path.dirname(w4.file), copies4[0])) === '600';
  ok(kept4 && bytes(w4.file) === v4 && door(o4, v4) === 200, `torn bytes KEPT ASIDE once (${copies4.length} copy, the same bytes, 0600), then this run's value is the file's (let in: ${door(o4, v4)})`, { copies4, file: bytes(w4.file) === v4 });

  console.log('— T5 an EMPTY file');
  const w5 = world('t5', ''); const o5 = w5.make();
  await until(() => /empty/.test(String((o5.stats().tokenHeld || {}).code)));
  const once = o5.stats().tokenHeld ? o5.stats().tokenHeld.code : null;
  const lifted5 = await o5.readTokenAgain(); await settled([w5.file]);
  const copies5 = fs.readdirSync(path.dirname(w5.file)).filter((f) => f.startsWith('otel-token.corrupt-'));
  ok(once === 'empty, read once more' && lifted5 === true && copies5.length === 1 && bytes(w5.file) === valueOf(o5), `an empty file is read once more first («${once}»), then kept aside and replaced by this run's value`, { once, lifted5, copies5 });

  console.log('— T6 «not there» at the start');
  const w6 = world('t6'); const o6 = w6.make();
  ok(bytes(w6.file) === valueOf(o6) && /^[0-9a-f]{32}$/.test(valueOf(o6)) && modeOf(w6.file) === '600' && !o6.stats().tokenHeld, 'a new instance: a value minted and written before any session is handed it (0600), as the release');

  console.log('— T7 a read again that HANGS');
  const run7 = async (Mod, tag) => {
    const w = world(tag, OLD); placed.add(w.file);
    const o = w.make(Mod, { tokenReadMs: 80 }); placed.delete(w.file); plans.set(w.file, ['hang']);
    const r0 = reads.get(w.file) || 0;
    const press = await within(o.readTokenAgain(), 600), waiting = !!(o.stats().tokenHeld && o.stats().tokenHeld.waiting);
    const press2 = await within(o.readTokenAgain(), 600);
    const n = (reads.get(w.file) || 0) - r0, hung = hangs.length;
    while (hangs.length) hangs.shift()();
    const lifted = await until(() => !o.stats().tokenHeld);
    plans.delete(w.file);
    return { press: !press.hung, waiting, press2: !press2.hung, n, hung, lifted, oldIn: door(o, OLD) };
  };
  const g7 = await run7(O, 't7'), r7 = await run7(copyOf([['    if (tBusy) return false;\n', '']], 'two-in-flight'), 't7r');
  ok(g7.press && g7.waiting && g7.press2 && g7.n === 1 && g7.hung === 1 && g7.lifted && g7.oldIn === 200, `the press answers by the bound, the read that waits is said (${g7.waiting}), a second press starts NO read (${g7.n} read in all); the late answer lifts it (the file's value let in)`, g7);
  ok(r7.n === 2, `RED: the one-in-flight guard cut ⇒ the second press starts a second read (${r7.n} reads)`, r7);

  console.log('— T8 the value is never said — nor a part of it, nor its length');
  const values = [OLD, valueOf(g1.o), v1, g3.v, v4, valueOf(o5), valueOf(o6)].filter(Boolean);
  const lens = [...new Set(values.map((v) => v.length))];
  const lenRe = new RegExp(`\\b(?:${lens.join('|')})\\s*(?:characters?|chars?|bytes?|long|hex)\\b|\\b(?:length|size|long|characters?|chars?)\\D{0,4}(?:${lens.join('|')})\\b`, 'i');
  /** a text → why it leaks (a whole value, its first eight characters, its length beside a known word), or null */
  const leakOf = (t) => (values.some((v) => t.includes(v)) ? 'a whole value' : values.some((v) => t.includes(v.slice(0, 8))) ? 'a part (its first eight characters)' : lenRe.test(t) ? 'its length' : null);
  const planted = [`[otel] otel-token: the value ${OLD.slice(0, 8)}… is let in`, `[otel] otel-token: a value of ${OLD.length} characters`];
  ok(planted.every((l) => leakOf(l)), `CONTROL: the scan catches a planted part and a planted length (${planted.map(leakOf).join(' · ')})`, planted.map(leakOf));
  const leakLog = said.map((l) => [leakOf(l), l]).filter(([w]) => w);
  const leakStats = [g1.o, o4, o5, o6].map((o) => JSON.stringify(o.stats())).map((t) => leakOf(t)).filter(Boolean);
  const leakRow = leakOf(JSON.stringify(rows));
  ok(said.length > 0 && leakLog.length === 0 && leakStats.length === 0 && !leakRow, `${said.length} [otel] line(s) said, a held-list row and the stats answers: none carries a sign-in value, a part of one or its length`, { leakLog: leakLog.slice(0, 2), leakStats, leakRow });
} catch (e) { fail++; console.error('  ✗ threw: ' + ((e && e.stack) || e)); }

fs.readFileSync = realRF; fs.promises.readFile = realPRF; console.warn = realWarn; void realLog;
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
