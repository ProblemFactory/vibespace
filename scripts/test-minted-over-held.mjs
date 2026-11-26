#!/usr/bin/env node
// TWO VALUES MINTED OVER THEIR FILE ON A FAILED READ, NOW UNDER THE STORE-READ LAW (row B-f276's family, slice «minted-over-values»,
// 主开发 r4721, lane lg-vault-stages). Each store is ONE plain value: data/telemetry/.instance-id (src/telemetry.js, the anonymous id
// the central collector's batches carry) and data/agentd/host-<id>.token (src/server/host-tokens.js, a paired machine's link token in
// the no-vault window). The release read ANY failure of that read as «no value» and MINTED A NEW ONE OVER THE FILE: the collector saw a
// new instance from then on; the machine refused every hello until a person paired it again. THE LAW: «not there» is a first run
// (minted and written, as before); a read that FAILED, or torn bytes, is HELD through the family's helper (src/store-read-hold.js, with
// the store's own parse): nothing is written over the file, the readers answer by name, the file is read again off the loop; torn bytes
// are kept aside ONCE, then a fresh value is the file's. A file that «cannot be read» is a PLACED refusal of the read calls for that one
// path (EIO) — never a mode change, never a mount; torn bytes are written as bytes.
//   I1 the id's read fails ⇒ this life's own id (the same at every ask), the file's bytes UNCHANGED, the hold on the family's held list
//      (RED: the release's read put back writes a new id over the file)
//   I2 the refusal lifted, a read again ⇒ the file's id back (this life takes it), the file's bytes unchanged
//   I3 torn bytes ⇒ kept aside once (the same bytes), then this life's id is the file's (written by the store writer)
//   I4 not there ⇒ minted and written (a first run, as the release)
//   K1 the token's read fails ⇒ refused BY NAME (link_token_unread, the machine named), asked again: refused, NOTHING minted, the file's
//      bytes unchanged, the hold on the held list (RED: the release's read put back mints a token over the file)
//   K2 the refusal lifted, a read again ⇒ the file's token answers again, the file's bytes unchanged
//   K3 torn bytes ⇒ kept aside once (the same bytes, 0600), a FRESH token written over them (0600, by the store writer), said by name
//   K4 not there ⇒ minted and written 0600 (the first pairing, as the release)
//   K5 the token is never said: no line, refusal or held row carries it, nor its first eight characters
// Run: node scripts/test-minted-over-held.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, endScratchAtExit, anchored } from './scratch.mjs';   // §113: the first import after node's own
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError('ok(cond, name): the name is not a string'); if (c) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a wait on the FACT a row judges: its bound generous, its expiry a NAMED harness row (red)
const untilFact = async (fn, what, ms = 10000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = fn(); } catch { v = false; } if (v) return Date.now() - t0; if (Date.now() - t0 >= ms) { ok(false, `harness: ${what} — the state never came within ${ms / 1000} s (the row after it judges nothing)`); return -1; } await sleep(10); } };

// ── THE PLACED READS: an EIO for the paths in `placed`, on the sync read and the off-loop read alike ──
const placed = new Set();
const realRF = fs.readFileSync, realPRF = fs.promises.readFile;
const eio = (p) => Object.assign(new Error(`EIO: a placed read refusal, read '${p}'`), { code: 'EIO' });
fs.readFileSync = function (p, ...a) { if (placed.has(String(p))) throw eio(p); return realRF.call(this, p, ...a); };
fs.promises.readFile = function (p, ...a) { if (placed.has(String(p))) return Promise.reject(eio(p)); return realPRF.call(this, p, ...a); };
// every line the two modules and the helper say (K5 reads them all)
const said = [], realWarn = console.warn;
console.warn = (...a) => { const l = a.map(String).join(' '); if (/\[(telemetry|host-tokens)\]/.test(l)) { said.push(l); return; } realWarn(...a); };

const T = require(path.join(repo, 'src/telemetry.js'));
const HT = require(path.join(repo, 'src/server/host-tokens.js'));
const HOLD = require(path.join(repo, 'src/store-read-hold.js'));
const W = () => require(path.join(repo, 'src/store-writer.js')).storeWriter();
const MUT = mutantCopies('minted-over-held', repo);
const ROOT = scratch('minted-over-held'); fs.mkdirSync(ROOT, { recursive: true }); endScratchAtExit(ROOT);
let seq = 0;
const bytesOf = (f) => { try { return realRF.call(fs, f); } catch { return null; } };
const copiesOf = (f) => fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith(path.basename(f) + '.corrupt-'));
const heldRow = (base) => HOLD.holds().find((h) => h.file === base && h.held) || null;
const modeOf = (f) => fs.statSync(f).mode & 0o777;

// ── THE RELEASE's READS, put back (the REDs): each a copy of its module with the cure's read replaced by the release's ──
const T_SRC = realRF.call(fs, path.join(repo, 'src/telemetry.js'), 'utf8');
const T_CURE = "    let read;\n    try { read = { text: timedSync('telemetry.read', () => fs.readFileSync(f, 'utf-8')) }; } catch (error) { read = { error }; }   // the folder's one read left on the loop (timed)\n    const a = SR.storeAnswer(read, { parse: IID_PARSE, valid: IID_SHAPE });\n";
const T_RELEASE = "    try { this._iid = timedSync('telemetry.read', () => fs.readFileSync(f, 'utf-8')).trim(); } catch {}\n    if (!this._iid) { this._iid = IID_MINT(); try { fs.writeFileSync(f, this._iid); } catch {} }\n    return this._iid;\n    const a = SR.storeAnswer({ text: '' }, { parse: IID_PARSE, valid: IID_SHAPE });\n";
const T_OLD = MUT.load('src/telemetry.js', anchored(T_SRC, T_CURE, T_RELEASE, 'the instance id: the release read put back'), 'iid-release');
const K_SRC = realRF.call(fs, path.join(repo, 'src/server/host-tokens.js'), 'utf8');
const K_CURE = "    let read;\n    try { read = { text: fs.readFileSync(f, 'utf-8') }; } catch (error) { read = { error }; }\n    const a = SR.storeAnswer(read, { parse: TOKEN_PARSE, valid: TOKEN_SHAPE });\n";
const K_RELEASE = "    try { return fs.readFileSync(f, 'utf-8').trim(); } catch { }\n    { const tok = mint(); fs.writeFileSync(f, tok, { mode: 0o600 }); return tok; }\n    const a = SR.storeAnswer({ text: '' }, { parse: TOKEN_PARSE, valid: TOKEN_SHAPE });\n";
const K_OLD = MUT.load('src/server/host-tokens.js', anchored(K_SRC, K_CURE, K_RELEASE, 'the link token: the release read put back'), 'token-release');

// ═════ THE INSTANCE ID ═════
console.log('THE INSTANCE ID (data/telemetry/.instance-id)');
const ID_OLD = 'vs-' + ['0a1b', '2c3d', '4e5f'].join('');   // the id the collector knows this hub by (made up)
function idWorld(tag, content) {
  const dataDir = path.join(ROOT, `id-${tag}-${++seq}`); fs.mkdirSync(path.join(dataDir, 'telemetry'), { recursive: true });
  const file = path.join(dataDir, 'telemetry', '.instance-id');
  if (content !== undefined) fs.writeFileSync(file, content);
  return { file, make: (Mod = T) => new Mod.Telemetry({ dataDir, version: 'test' }) };
}
{
  const w = idWorld('held', ID_OLD + '\n'), before = bytesOf(w.file);
  placed.add(w.file);
  const t = w.make();
  const first = t._instanceId(), again = t._instanceId();
  const row = heldRow('.instance-id');
  ok(first !== ID_OLD && /^vs-[0-9a-f]{12}$/.test(first) && again === first && bytesOf(w.file).equals(before) && !!row,
    'I1 the id\'s read FAILS (placed EIO) ⇒ this life\'s own id, the same at every ask; the file\'s bytes UNCHANGED; the hold on the family\'s held list', { same: again === first, unchanged: bytesOf(w.file).equals(before), row });
  placed.delete(w.file);
  const lifted = await HOLD.readAgainOf('.instance-id');
  ok(lifted === true && t._instanceId() === ID_OLD && bytesOf(w.file).equals(before) && !heldRow('.instance-id'),
    'I2 the refusal lifted, a read again ⇒ the file\'s id back (this life takes it), the file\'s bytes unchanged, off the held list', { lifted, id: t._instanceId() });
}
{
  const w = idWorld('red', ID_OLD + '\n'), before = bytesOf(w.file);
  placed.add(w.file);
  const t = w.make(T_OLD);
  t._instanceId();
  placed.delete(w.file);
  ok(!bytesOf(w.file).equals(before), 'I1 RED: the release\'s read put back ⇒ a new id written OVER the file on a failed read', { after: String(bytesOf(w.file)) });
}
{
  const TORN = Buffer.from('two words\n');
  const w = idWorld('torn', TORN);
  const t = w.make();
  const mine = t._instanceId();
  await untilFact(() => t._iid === mine && !W().pending(w.file) && String(bytesOf(w.file)) === mine, 'the torn id\'s copy made and this life\'s id written');
  const copies = copiesOf(w.file);
  ok(copies.length === 1 && bytesOf(path.join(path.dirname(w.file), copies[0])).equals(TORN) && String(bytesOf(w.file)) === mine,
    'I3 torn bytes ⇒ kept aside ONCE (the same bytes), then this life\'s id is the file\'s (the store writer wrote it)', { copies, file: String(bytesOf(w.file)) });
}
{
  const w = idWorld('none');
  const t = w.make(), id = t._instanceId();
  ok(/^vs-[0-9a-f]{12}$/.test(id) && String(bytesOf(w.file)) === id, 'I4 not there ⇒ minted and written (a first run, as the release)', { id });
}

// ═════ THE LINK TOKEN (the no-vault window) ═════
console.log('THE LINK TOKEN (data/agentd/host-<id>.token, no vault set up)');
const TOK = ['vs', 'ht_', '1a2b3c4d'.repeat(4)].join('');   // the token the machine already holds (made up, built at runtime)
function tokWorld(tag, content) {
  const dataDir = path.join(ROOT, `tok-${tag}-${++seq}`), agentdDir = path.join(dataDir, 'agentd'); fs.mkdirSync(agentdDir, { recursive: true });
  const hostId = `host-${tag}${seq}`, file = path.join(agentdDir, `host-${hostId}.token`);
  if (content !== undefined) fs.writeFileSync(file, content, { mode: 0o600 });
  let mints = 0;
  const make = (Mod = HT) => Mod.create({ dataDir, agentdDir, nameOf: () => 'Lab machine', log: { warn: (l) => said.push(String(l)), log() {} }, mint: () => { mints++; return ['vs', 'ht_', require('node:crypto').randomBytes(16).toString('hex')].join(''); } });
  return { hostId, file, make, mints: () => mints };
}
const told = [];   // every refusal's message (K5 scans them)
const errOf = (fn) => { try { fn(); return null; } catch (e) { told.push(String(e && e.message)); return e; } };
{
  const w = tokWorld('held', TOK + '\n'), before = bytesOf(w.file);
  placed.add(w.file);
  const k = w.make();
  const e1 = errOf(() => k.tokenFor(w.hostId)), e2 = errOf(() => k.tokenFor(w.hostId));
  const base = path.basename(w.file), row = heldRow(base);
  ok(!!e1 && e1.code === 'link_token_unread' && /Lab machine/.test(e1.message) && !!e2 && e2.code === 'link_token_unread' && w.mints() === 0 && bytesOf(w.file).equals(before) && !!row,
    'K1 the token\'s read FAILS (placed EIO) ⇒ refused BY NAME (link_token_unread, the machine named), asked again: refused, NOTHING minted, the file\'s bytes UNCHANGED, the hold on the held list', { c1: e1 && e1.code, c2: e2 && e2.code, mints: w.mints(), row: !!row });
  placed.delete(w.file);
  const lifted = await HOLD.readAgainOf(base);
  let got = null; try { got = k.tokenFor(w.hostId); } catch (e) { got = e; }
  ok(lifted === true && got === TOK && w.mints() === 0 && bytesOf(w.file).equals(before) && !heldRow(base),
    'K2 the refusal lifted, a read again ⇒ the file\'s token answers again, nothing minted, the file\'s bytes unchanged', { lifted, same: got === TOK, mints: w.mints() });
}
{
  const w = tokWorld('red', TOK + '\n'), before = bytesOf(w.file);
  placed.add(w.file);
  const k = w.make(K_OLD);
  errOf(() => k.tokenFor(w.hostId));
  placed.delete(w.file);
  ok(!bytesOf(w.file).equals(before) && w.mints() === 1, 'K1 RED: the release\'s read put back ⇒ a token minted and written OVER the machine\'s on a failed read', { mints: w.mints() });
}
{
  const TORN = Buffer.from('not a token\n');
  const w = tokWorld('torn', TORN);
  const k = w.make();
  const e = errOf(() => k.tokenFor(w.hostId));
  await untilFact(() => w.mints() === 1 && !W().pending(w.file) && !String(bytesOf(w.file)).includes('not a token'), 'the torn token\'s copy made and a fresh one written');
  const copies = copiesOf(w.file), fresh = String(bytesOf(w.file));
  let got = null; try { got = k.tokenFor(w.hostId); } catch (x) { got = x; }
  ok(!!e && e.code === 'link_token_unread' && copies.length === 1 && bytesOf(path.join(path.dirname(w.file), copies[0])).equals(TORN) && modeOf(path.join(path.dirname(w.file), copies[0])) === 0o600
    && /^vsht_[0-9a-f]{32}$/.test(fresh) && got === fresh && modeOf(w.file) === 0o600 && said.some((l) => /Lab machine/.test(l) && /pair the machine again/.test(l)),
    'K3 torn bytes ⇒ kept aside ONCE (the same bytes, 0600), a FRESH token written over them (0600, by the store writer), said by name: pair the machine again', { code: e && e.code, copies, mode: modeOf(w.file) });
}
{
  const w = tokWorld('none');
  const k = w.make(), tok = k.tokenFor(w.hostId);
  ok(String(bytesOf(w.file)) === tok && modeOf(w.file) === 0o600 && w.mints() === 1, 'K4 not there ⇒ minted and written 0600 (the first pairing, as the release)', { mode: modeOf(w.file) });
}
{
  const rows = JSON.stringify(HOLD.holds()), lines = [...said, ...told].join('\n');
  const leaks = [TOK, TOK.slice(0, 8)].filter((v) => lines.includes(v) || rows.includes(v));
  const planted = [...said, `[host-tokens] a planted line ${TOK.slice(0, 8)}`].join('\n').includes(TOK.slice(0, 8));
  ok(leaks.length === 0 && planted, `K5 the token is never said: ${said.length} lines, ${told.length} refusals and the held rows carry neither it nor its first eight characters (a planted line is caught: the scan's control)`, { leaks: leaks.length });
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
