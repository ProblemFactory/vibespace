#!/usr/bin/env node
// THE KEY-FILE LAW (lane key-file-law-stores, .269; credential class). Fast tier: in-process stores over scratch data
// dirs, no vendor, no real key file.
//
//   ① PURE src/key-file.js loadOrMintKey: the branch table over fake doors — mint only on ENOENT with no ciphertext
//      (once); ENOENT + ciphertext ⇒ key-missing (mint never called); any other errno ⇒ key-unreadable:<errno>;
//      a bad shape ⇒ key-malformed; a lost mint race reads the landed key.
//   ② THE CENSUS (grep-derived over src/, acorn tokens — comments never count): every data key file NAME is a STORES row
//      and appears only in its row's file; every src/ `secretBox(` / `lawfulKey(` call passes the store's
//      `hasCiphertext`; nothing but src/secret-box.js reads or writes a key file; `randomBytes(32)` sites are pinned per
//      file. RED controls = plants (a bare box, the old accounts mint, the old passkey mint, a new store, an aliased mint,
//      a bare lawfulKey) — and a commented-out plant stays quiet. key-file-law-fix (verify r1 F2): EVERY argument of
//      every fs door is judged (rename / copy / link DESTINATIONS), the doors include open / cp / createWriteStream /
//      unlink / rm, same-file aliases resolve (`const kp = this._keyFile`, `const { _keyFile: f } = mm`, `const t =
//      keyFile + '.t'`, `const { writeFileSync: put } = require('fs')`), a store's key name BUILT at runtime (its stem
//      '.mounts' outside its file) and any dotted '*.key' name are judged, `randomBytes(N)` resolves a same-file
//      `const N = 32` and any other non-literal size is RED until classified — the verifier's seven variants are RED rows.
//   ③ EVERY STORE (accounts, mounts, integrations, channels, app-secrets, passkeys), each branch: a fresh dir mints ONE
//      key (0600, its shape) and a secret round-trips; the key file removed over ciphertext ⇒ key-missing, nothing
//      minted, the ciphertext byte-identical, the store's rows say restore, a new secret refused, and the restored key
//      opens everything; EIO ⇒ key-unreadable:EIO, the key byte-identical, and the SAME store opens every secret once
//      the error clears; a malformed key ⇒ key-malformed, the file untouched. RED control per store = the store's base
//      rule (a patched copy: the box without the store's question / the old inline mints) ⇒ the key-missing leg FAILS.
//   ③b THE BEHAVIOUR BELT (key-file-law-fix): every fs call that names a key file while the stores run (every ③ leg, then
//      each store booted over a fresh and a filled dir — mounts' restore() too) is judged by its CALLER: only
//      src/secret-box.js under src/key-file.js's loadOrMintKey may touch one. RED controls = mounts' restore() with an
//      inline tmp + rename mint, the passkey wiring's old inline mint.
//   ④ THE PASSKEY DOORS (key-file-law-fix, verify r1 F1): a key refusal is a VALUE — a new passkey over a lost key
//      throws nothing out of the socket listener (fake + real ws), stores nothing, says it ONCE (one For-you line naming
//      the file + the refusal); a modal get is RELEASED at once with nothing loaded and its sentence carries the restore
//      words; the key restored ⇒ kept again, the line resolved. RED controls = 952bb5aef's shape (the refusal thrown, the
//      watch unguarded: the throw escapes, the gate hangs) and the base wiring (a new key minted beside sealed rows).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const acorn = require('acorn');
let pass = 0, fail = 0;
function ok(cond, msg, detail) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg + (detail ? '\n      ' + String(detail).slice(0, 600) : '')); } }
const ROOT = scratch('keyfilelaw');
const MUT = mutantCopies('key-file-law', REPO);
const KF = require(path.join(REPO, 'src/key-file.js'));
const SB = require(path.join(REPO, 'src/secret-box.js'));
const quiet = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const enoent = () => Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
const errno = (code) => Object.assign(new Error(`${code}: injected`), { code });
const HEX = crypto.randomBytes(32).toString('hex');

// ── ① THE LAW, PURE ──────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① PURE loadOrMintKey');
{
  const run = ({ read, mint = () => crypto.randomBytes(32), holds = () => false, parse } = {}) => {
    const calls = { mint: 0, holds: 0 };
    const r = KF.loadOrMintKey({ readKey: read, mintKey: () => { calls.mint++; return mint(); }, hasCiphertext: () => { calls.holds++; return holds(); }, ...(parse ? { parse } : {}) });
    return { r, calls };
  };
  let a = run({ read: () => { throw enoent(); } });
  ok(a.r.ok && a.r.minted && a.r.key.length === 32 && a.calls.mint === 1 && a.calls.holds === 1, 'absent + no ciphertext ⇒ ONE mint (the store was asked first)', JSON.stringify(a));
  a = run({ read: () => { throw enoent(); }, holds: () => true });
  ok(!a.r.ok && a.r.code === 'key-missing' && a.calls.mint === 0, 'absent + ciphertext ⇒ key-missing, the mint never called', JSON.stringify(a));
  a = run({ read: () => { throw enoent(); }, holds: () => { throw errno('EACCES'); } });
  ok(!a.r.ok && a.r.code === 'key-missing' && a.calls.mint === 0, 'absent + the store cannot be asked (it threw) ⇒ key-missing: an unreadable store still holds what it holds', JSON.stringify(a));
  for (const code of ['EIO', 'EACCES', 'EMFILE', 'EISDIR', 'ENFILE', 'EPERM']) {
    a = run({ read: () => { throw errno(code); } });
    ok(!a.r.ok && a.r.code === `key-unreadable:${code}` && a.calls.mint === 0 && a.calls.holds === 0, `${code} ⇒ key-unreadable:${code} (never minted, the store never asked)`, JSON.stringify(a));
  }
  a = run({ read: () => { throw new Error('no code at all'); } });
  ok(!a.r.ok && a.r.code === 'key-unreadable:error' && a.calls.mint === 0, 'a read error with no errno ⇒ key-unreadable:error — a refusal, never a mint');
  for (const [label, raw] of [['empty', ''], ['3 chars', 'abc'], ['63 hex', HEX.slice(1)], ['65 hex', HEX + 'a'], ['64 non-hex', 'z'.repeat(64)], ['hex + junk line', HEX + '\nxx']]) {
    a = run({ read: () => raw });
    ok(!a.r.ok && a.r.code === 'key-malformed' && a.calls.mint === 0, `a ${label} key file ⇒ key-malformed, never replaced`);
  }
  a = run({ read: () => HEX + '\n' });
  ok(a.r.ok && !a.r.minted && a.r.key.toString('hex') === HEX && a.calls.holds === 0, '64 hex (+ newline) ⇒ the key, the store never asked');
  let n = 0;
  a = run({ read: () => { if (n++ === 0) throw enoent(); return HEX; }, mint: () => null });
  ok(a.r.ok && a.r.key.toString('hex') === HEX && a.calls.mint === 1, 'a lost mint race (mint → null) reads the key the other writer landed');
  n = 0;
  a = run({ read: () => { if (n++ === 0) throw enoent(); throw errno('EIO'); }, mint: () => null });
  ok(!a.r.ok && a.r.code === 'key-unreadable:EIO', '…and that re-read failing is key-unreadable, never a second mint');
  a = run({ read: () => { throw enoent(); }, mint: () => { throw errno('EROFS'); } });
  ok(!a.r.ok && a.r.code === 'key-unreadable:EROFS', 'a mint that fails (EROFS) ⇒ key-unreadable:EROFS');
  const raw32 = crypto.randomBytes(32);
  a = run({ read: () => raw32, parse: KF.parseRawKey });
  ok(a.r.ok && a.r.key.equals(raw32), 'the raw 32-byte shape (the passkey store) reads');
  a = run({ read: () => raw32.subarray(0, 31), parse: KF.parseRawKey });
  ok(!a.r.ok && a.r.code === 'key-malformed', '…31 bytes ⇒ key-malformed');
  let threw = null; try { KF.loadOrMintKey({ readKey: () => HEX, mintKey: () => null }); } catch (e) { threw = e; }
  ok(threw instanceof TypeError, 'no hasCiphertext door ⇒ a TypeError: no store is exempt from the question');
  ok(JSON.stringify(KF.refusalOf('key-unreadable:EIO')) === '{"kind":"key-unreadable","errno":"EIO"}' && KF.refusalOf('key-missing').kind === 'key-missing' && KF.refusalOf('nope') === null, 'refusalOf parses the three codes, nothing else');
  ok(/restore it from a backup/.test(KF.refusalWords('key-missing', '.x-key')) && /could not be read \(EIO\)/.test(KF.refusalWords('key-unreadable:EIO', '.x-key')) && /damaged/.test(KF.refusalWords('key-malformed', '.x-key')), 'refusalWords: restore / could not be read (EIO) / damaged — the code and the file name only');
}

// ── ② THE CENSUS ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('② THE CENSUS (src/, comments never count)');
const STORES = [
  { name: '.accounts-key', file: 'src/accounts.js', via: 'lawfulKey', ciphertext: 'accounts.json keyEnc / oatEnc (hex iv:tag:data)', rows: 'the account (a named refusal: getKey / spawn say restore)' },
  { name: '.mounts-key', file: 'src/mounts.js', via: 'secretBox', ciphertext: 'mounts.json *Enc + the state in memory', rows: 'the mounts list: row.keyFile → the row\'s key line' },
  { name: '.integrations-key', file: 'src/server/integration-store.js', via: 'secretBox', ciphertext: 'integrations.json + the state in memory', rows: 'the integration card: storeError {code, reason}' },
  { name: '.channels-key', file: 'src/server/channels-engine.js', via: 'secretBox', ciphertext: 'channels/adapters.json + every channels/<id>/callers.json', rows: 'the account card: token-undecryptable — restore' },
  { name: '.app-secrets-key', file: 'src/app-secrets.js', via: 'lawfulKey', ciphertext: 'desktop-apps/<id>/portal/secrets.json with n > 0', rows: 'the app window ⋯: Stored logins: …' },
  { name: 'browser-passkeys.key', file: 'src/server/mounts-plugins-wiring.js', via: 'lawfulKey', ciphertext: 'browser-passkeys.json v1 sealed rows', rows: 'the passkey ceremony line (a named refusal)' },
];
// files that may hold a key-shaped READ or WRITE that is NOT a store key (each with its reason)
const IO_EXEMPT = new Map([
  ['src/secret-box.js', 'THE one reader + minter (lawfulKey / mintKeyFile)'],
  ['src/server/tls.js', 'readPair(certFile, keyFile): the TLS private key the person configured — a certificate pair, read only, never minted'],
]);
// ONE fs call (file · door · a needle of its arguments) that touches a key-NAMED file which is no data/ store key (each with its reason)
const IO_SITES = [
  ['src/desktop-serve.js', 'unlinkSync', 'M.SECRETS_KEY_FILE', "the per-display hand-over key (desktop-apps' run/secrets.key, under the plan's private XDG_RUNTIME_DIR) removed once the service read it"],
];
// randomBytes(32) per file: a new one is RED until classified here
const RANDOM32 = new Map([
  ['src/secret-box.js', [1, 'mintKeyFile: THE mint']],
  ['src/server/dropline-oauth.js', [2, 'a PKCE verifier + this boot\'s state key (memory only)']],
  ['src/server/channels-engine.js', [1, 'consentKey: this boot\'s HMAC key for consent state (memory only)']],
]);
const KEYNAME_RE = /^(\.[a-z0-9][a-z0-9._-]*[-.]key|[a-z0-9][a-z0-9._-]*\.key)$/; // a dotfile ending -key / .key, or any *.key (key-file-law-fix: dots too — '.vault.key')
const KEYVAR_RE = /^(_?keyFile|KEY_FILE|\w*KeyFile|\w*_KEY_FILE)$/;
const STEMS = new Map(STORES.map((s) => [s.name.replace(/[-.]key$/, ''), s])); // '.mounts' … — a store's key name BUILT at runtime (['.mounts', 'key'].join('-'))
const READS = new Set(['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream']);
const WRITES = new Set(['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'copyFileSync', 'copyFile', 'cpSync', 'cp', 'renameSync', 'rename', 'linkSync', 'link', 'symlinkSync', 'symlink', 'truncateSync', 'truncate', 'createWriteStream', 'unlinkSync', 'unlink', 'rmSync', 'rm']);
const PATHY = new Set(['join', 'resolve', 'normalize', 'String', 'concat']); // a call a key PATH passes through unchanged
const FS_MOD_RE = /^(node:)?fs(\/promises)?$/;
// randomBytes(<not a literal>) per file: RED until classified (a same-file `const N = 32` counts as randomBytes(32))
const RANDOM_EXPR = new Map([
  ['src/pairing-token.js', [1, 'randomBytes(k.bytes): a pairing token of its KINDS row — the token itself, never a key file']],
]);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []);
const SRC = new Map(walk(path.join(REPO, 'src')).map((f) => [path.relative(REPO, f), fs.readFileSync(f, 'utf-8')]));
function tokensOf(text) {
  const out = [];
  try { for (const t of acorn.tokenizer(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowImportExportEverywhere: true })) out.push(t); }
  catch (e) { return { err: e.message, toks: out }; }
  return { toks: out };
}
const isName = (t, v) => !!t && t.type.label === 'name' && (v == null || t.value === v);
const isPunc = (t, l) => !!t && t.type.label === l;
/** a call's arguments: `i` = index of the callee name token whose next token is `(` → { args: [[tokens] per argument], all } */
function callArgs(toks, i) {
  if (!isPunc(toks[i + 1], '(')) return null;
  let depth = 0; const args = [[]];
  for (let j = i + 1; j < toks.length; j++) {
    const t = toks[j], l = t.type.label;
    if (l === '(' || l === '[' || l === '{' || l === '${') depth++;
    if (l === ')' || l === ']' || l === '}') depth--;
    if (j === i + 1) continue;
    if (depth === 0 && l === ')') break;
    if (depth === 1 && l === ',') { args.push([]); continue; }
    args[args.length - 1].push(t);
  }
  return { args: args.filter((x) => x.length), all: args.flat() };
}
/** a key PATH in these tokens: a key name / variable (or a same-file alias of one) whose every enclosing call only carries a
 *  path (join, resolve, a template, a + concatenation, a grouping) — `secretBox(path.join(d, KEY_FILE))` is a box, not a
 *  path; `renameSync(tmp, this._keyFile)` / `copyFileSync(bak, keyFile)` are paths */
function carriesKey(ts, isKey) {
  const stack = [];
  for (let j = 0; j < ts.length; j++) {
    const t = ts[j], l = t.type.label;
    if (l === '(') { const p = ts[j - 1]; stack.push(isName(p) ? (PATHY.has(p.value) ? 'path' : 'call') : p && (p.type.label === ')' || p.type.label === ']') ? 'call' : 'path'); continue; }
    if (l === '[' || l === '{') { stack.push('data'); continue; }
    if (l === '${') { stack.push('path'); continue; }
    if (l === ')' || l === ']' || l === '}') { stack.pop(); continue; }
    if (isKey(t) && stack.every((x) => x === 'path')) return true;
  }
  return false;
}
/** same-file aliases: `const kp = this._keyFile` / `const t = keyFile + '.t'` / `const { _keyFile: f } = mm` ⇒ kp, t, f carry
 *  the key; `const { writeFileSync: put } = require('fs')` ⇒ put is a door; `const N = 32` ⇒ randomBytes(N) is
 *  randomBytes(32). Three rounds (an alias of an alias). */
function aliasesOf(toks) {
  const keys = new Set(), doors = new Map(), nums = new Map();
  const isKey = (t) => (t.type.label === 'name' && (KEYVAR_RE.test(t.value) || keys.has(t.value))) || ((t.type.label === 'string' || t.type.label === 'template') && KEYNAME_RE.test(String(t.value)));
  const STOP = new Set(['const', 'var', 'if', 'return', 'for', 'while', 'function', 'class', 'try', 'throw', 'switch']);
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < toks.length; i++) {
      const d = toks[i];
      if (!(d.type.keyword === 'const' || d.type.keyword === 'var' || isName(d, 'let'))) continue;
      let j = i + 1;
      while (j < toks.length) {
        const pairs = []; let name = null;
        if (isName(toks[j])) { name = toks[j].value; j++; }
        else if (isPunc(toks[j], '{') || isPunc(toks[j], '[')) {
          const obj = isPunc(toks[j], '{'); let depth = 0;
          for (; j < toks.length; j++) {
            const l = toks[j].type.label;
            if (l === '{' || l === '[') depth++;
            if (l === '}' || l === ']') { depth--; if (depth === 0) { j++; break; } continue; }
            if (obj && depth === 1 && isName(toks[j])) {
              const nx = toks[j + 1];
              if (isPunc(nx, ':') && isName(toks[j + 2])) { pairs.push([toks[j].value, toks[j + 2].value]); j += 2; }
              else if (isPunc(nx, ',') || isPunc(nx, '}') || isPunc(nx, '=')) pairs.push([toks[j].value, toks[j].value]);
            }
          }
        } else break;
        const rhs = [];
        if (isPunc(toks[j], '=')) {
          j++; let depth = 0; const line0 = toks[j] ? toks[j].loc.start.line : 0;
          for (; j < toks.length; j++) {
            const t = toks[j], l = t.type.label;
            if (depth === 0 && (l === ',' || l === ';' || l === ')' || l === ']' || l === '}')) break;
            if (depth === 0 && t.loc.start.line > line0 && (STOP.has(t.type.keyword) || isName(t, 'let'))) break;
            if (l === '(' || l === '[' || l === '{' || l === '${') depth++;
            if (l === ')' || l === ']' || l === '}') depth--;
            rhs.push(t);
          }
        }
        if (name && rhs.length === 1 && rhs[0].type.label === 'num') nums.set(name, rhs[0].value);
        if (name && rhs.length && carriesKey(rhs, isKey)) keys.add(name);
        const fromFs = rhs.some((t) => t.type.label === 'string' && FS_MOD_RE.test(t.value)) || (rhs.length > 0 && isName(rhs[rhs.length - 1], 'promises'));
        for (const [prop, local] of pairs) {
          if (KEYVAR_RE.test(prop) || keys.has(prop)) keys.add(local);
          if (fromFs && (READS.has(prop) || WRITES.has(prop))) doors.set(local, prop);
        }
        if (isPunc(toks[j], ',')) { j++; continue; }
        break;
      }
    }
  }
  return { keys, doors, nums, isKey };
}
/** ONE file's verdict, memoized by its text (every src/ file is judged — no prefilter: a key name can be built from parts;
 *  a plant re-judges only the file it changed) */
const JUDGED = new Map();
function judgeFile(rel, text) {
  const hit = JUDGED.get(rel); if (hit && hit.text === text) return hit.out;
  const red = [], seen = { names: [], boxCalls: [], lawCalls: [], random: new Map(), randomExpr: new Map(), doors: 0, aliases: 0, sites: new Set() };
  const out = { red, seen }; JUDGED.set(rel, { text, out });
  {
    const { toks, err } = tokensOf(text);
    if (err) { red.push(`${rel}: could not tokenize (${err}) — the census cannot judge it`); return out; }
    const importsBox = /require\(\s*['"](\.\.?\/)+secret-box(\.js)?['"]\s*\)/.test(text);
    const { keys, doors, nums, isKey } = aliasesOf(toks);
    seen.aliases += keys.size;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const line = t.loc ? t.loc.start.line : t.start;
      if ((t.type.label === 'string' || t.type.label === 'template') && KEYNAME_RE.test(String(t.value))) {
        seen.names.push(`${t.value}@${rel}`);
        const row = STORES.find((s) => s.name === t.value);
        if (!row) red.push(`${rel}: a NEW key file '${t.value}' — add a STORES row (its ciphertext, its rows) and its legs`);
        else if (row.file !== rel) red.push(`${rel}: names ${t.value}, the key file of ${row.file} — a second reader; read it through its store`);
      }
      if ((t.type.label === 'string' || t.type.label === 'template') && STEMS.has(String(t.value)) && STEMS.get(String(t.value)).file !== rel) red.push(`${rel}:${line}: '${t.value}' — the key file of ${STEMS.get(String(t.value)).file} (${STEMS.get(String(t.value)).name}) built at runtime; read it through its store`);
      if (isName(t, 'randomBytes') && isPunc(toks[i + 1], '(')) {
        const a = callArgs(toks, i), arg = (a && a.args[0]) || [];
        const n = arg.length === 1 && arg[0].type.label === 'num' ? arg[0].value : arg.length === 1 && isName(arg[0]) && nums.has(arg[0].value) ? nums.get(arg[0].value) : null;
        if (n === 32) seen.random.set(rel, (seen.random.get(rel) || 0) + 1);
        else if (n == null) seen.randomExpr.set(rel, (seen.randomExpr.get(rel) || 0) + 1);
      }
      if (!isName(t)) continue;
      const prev = toks[i - 1];
      if ((t.value === 'secretBox' && importsBox) || t.value === 'lawfulKey') {
        const a = callArgs(toks, i); if (!a) continue;
        (t.value === 'secretBox' ? seen.boxCalls : seen.lawCalls).push(rel);
        if (!a.all.some((x) => isName(x, 'hasCiphertext'))) red.push(`${rel}:${line}: ${t.value}( without the store's hasCiphertext — a key minted over ciphertext`);
      }
      const door = (READS.has(t.value) || WRITES.has(t.value)) && isPunc(prev, '.') ? t.value : !isPunc(prev, '.') && doors.has(t.value) ? doors.get(t.value) : null;
      if (door) {
        const a = callArgs(toks, i); if (!a) continue;
        seen.doors++;
        const text = a.all.map((x) => x.value ?? x.type.label).join('');
        const site = IO_SITES.find(([f, d, needle]) => f === rel && d === door && text.includes(needle.replace(/\s+/g, '')));
        if (site && a.args.some((x) => carriesKey(x, isKey))) seen.sites.add(site);
        else if (!IO_EXEMPT.has(rel) && a.args.some((x) => carriesKey(x, isKey))) red.push(`${rel}:${line}: ${door}(${a.all.map((x) => x.value ?? x.type.label).join('').slice(0, 90)}) — a key file ${WRITES.has(door) ? 'WRITTEN' : 'read'} outside the law (src/secret-box.js lawfulKey is the one door)`);
      }
    }
  }
  return out;
}
function census(src) {
  const red = [], seen = { names: [], boxCalls: [], lawCalls: [], random: new Map(), randomExpr: new Map(), doors: 0, aliases: 0, sites: new Set() };
  for (const [rel, text] of src) {
    const f = judgeFile(rel, text);
    red.push(...f.red); seen.names.push(...f.seen.names); seen.boxCalls.push(...f.seen.boxCalls); seen.lawCalls.push(...f.seen.lawCalls);
    for (const [k, v] of f.seen.random) seen.random.set(k, v);
    for (const [k, v] of f.seen.randomExpr) seen.randomExpr.set(k, v);
    seen.doors += f.seen.doors; seen.aliases += f.seen.aliases; for (const x of f.seen.sites) seen.sites.add(x);
  }
  for (const [rel, n] of seen.random) {
    const want = RANDOM32.get(rel);
    if (!want) red.push(`${rel}: randomBytes(32) ×${n} — a new 32-byte secret: if it is persisted as a key it goes through lawfulKey; classify it in RANDOM32`);
    else if (want[0] !== n) red.push(`${rel}: randomBytes(32) ${want[0]} → ${n} — classify the new site, then move the count`);
  }
  for (const [rel, [n]] of RANDOM32) if (!seen.random.has(rel)) red.push(`${rel}: RANDOM32 row (${n}) matches nothing — a dead row`);
  for (const [rel, n] of seen.randomExpr) {
    const want = RANDOM_EXPR.get(rel);
    if (!want) red.push(`${rel}: randomBytes(<not a literal>) ×${n} — a secret whose size the census cannot read: if it is persisted as a key it goes through lawfulKey; classify it in RANDOM_EXPR`);
    else if (want[0] !== n) red.push(`${rel}: randomBytes(<not a literal>) ${want[0]} → ${n} — classify the new site, then move the count`);
  }
  for (const [rel, [n]] of RANDOM_EXPR) if (!seen.randomExpr.has(rel)) red.push(`${rel}: RANDOM_EXPR row (${n}) matches nothing — a dead row`);
  for (const x of IO_SITES) if (!seen.sites.has(x)) red.push(`${x[0]}: IO_SITES row ${x[1]}(…${x[2]}…) matches no call there — a dead row`);
  for (const s of STORES) {
    if (!seen.names.some((x) => x === `${s.name}@${s.file}`)) red.push(`${s.file}: the STORES row ${s.name} matches no literal there — a dead row`);
    if (!(s.via === 'secretBox' ? seen.boxCalls : seen.lawCalls).includes(s.file)) red.push(`${s.file}: ${s.name} is read through ${s.via}( — no such call there`);
  }
  return { red, seen };
}
const base = census(SRC);
ok(base.red.length === 0, `the shipped tree (${SRC.size} files): ${STORES.length} key stores (${STORES.map((s) => s.name).join(', ')}), ${base.seen.boxCalls.length} box + ${base.seen.lawCalls.length} lawfulKey calls, every one asks its store; ${base.seen.doors} fs-door calls, EVERY argument judged (${base.seen.aliases} same-file key aliases resolved) — no reader/writer outside secret-box; randomBytes(32) ${[...base.seen.random].map(([f, n]) => `${f.replace(/^src\//, '')}×${n}`).join(' ')}; randomBytes(<expr>) ${[...base.seen.randomExpr].map(([f, n]) => `${f.replace(/^src\//, '')}×${n}`).join(' ')}`, base.red.join('\n      '));
console.log('    store table:'); for (const s of STORES) console.log(`      ${s.name.padEnd(22)} ${s.file.padEnd(38)} via ${s.via.padEnd(9)} · ${s.ciphertext} · rows: ${s.rows}`);
const plant = (rel, from, to, label, expectRed = true) => {
  const m = new Map(SRC); const t = m.get(rel) ?? '';
  if (from != null && !t.includes(from)) { ok(false, `plant anchor present: ${label}`, from.slice(0, 120)); return; }
  m.set(rel, from == null ? to : t.replace(from, to));
  const r = census(m);
  ok(expectRed ? r.red.length > 0 : r.red.length === 0, `${expectRed ? 'RED control' : 'quiet control'}: ${label}${expectRed && r.red.length ? ' ⇒ ' + r.red[0].slice(0, 150) : ''}`, r.red.join(' | '));
};
const MOUNTS_BOX = SRC.get('src/mounts.js').match(/secretBox\(this\._keyFile, \{ hasCiphertext: [^\n]*\}\) \}\);/)?.[0] || 'MISSING';
plant('src/mounts.js', MOUNTS_BOX, 'secretBox(this._keyFile);', 'mounts\' box without its store\'s question (the base rule)');
const ACCT_KEY = SRC.get('src/accounts.js').match(/  _key\(\) \{[^]*?\n  \}\n/)?.[0] || 'MISSING';
const OLD_ACCT_KEY = "  _key() {\n    try { return Buffer.from(fs.readFileSync(this._keyFile, 'utf-8').trim(), 'hex'); }\n    catch {\n      const k = crypto.randomBytes(32);\n      fs.writeFileSync(this._keyFile, k.toString('hex'), { mode: 0o600 });\n      return k;\n    }\n  }\n";
plant('src/accounts.js', ACCT_KEY, OLD_ACCT_KEY, 'accounts\' old _key() (mint on ANY read error)');
const PK_NEW = SRC.get('src/server/mounts-plugins-wiring.js').match(/            const SB = require\('\.\.\/secret-box\.js'\), k = SB\.lawfulKey[^\n]*\n[^\n]*\n            cipher = PS\.cipherOf\(crypto, k\.key\); return cipher;/)?.[0] || 'MISSING';
const PK_OLD = "            let key = null; try { key = fs.readFileSync(keyFile); } catch (e) { if (e.code !== 'ENOENT') throw e; }\n            if (!key) { key = crypto.randomBytes(32); try { fs.writeFileSync(keyFile, key, { mode: 0o600, flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; key = fs.readFileSync(keyFile); } }\n            cipher = PS.cipherOf(crypto, key); return cipher;";
plant('src/server/mounts-plugins-wiring.js', PK_NEW, PK_OLD, 'the passkey store\'s old inline mint (ENOENT, no ciphertext question)');
plant('src/server/foo-store.js', null, "'use strict';\nconst path = require('path');\nconst { secretBox } = require('../secret-box.js');\nconst KEY_FILE = '.foo-key';\nmodule.exports = (d) => secretBox(path.join(d, KEY_FILE), { hasCiphertext: () => false });\n", 'a NEW store with its own key file and no STORES row');
plant('src/server/integration-store.js', "const KEY_FILE = '.integrations-key';", "const KEY_FILE = '.integrations-key';\nconst { writeFileSync: put } = require('fs');\nconst mintAside = (d) => put(require('path').join(d, 'x'), require('crypto').randomBytes(32));", 'an ALIASED mint (writeFileSync: put + randomBytes(32))');
plant('src/app-secrets.js', "SB.lawfulKey(keyFile, { hasCiphertext:", "SB.lawfulKey(keyFile, { noQuestion:", 'app-secrets\' lawfulKey without hasCiphertext');
plant('src/server/channels-engine.js', "const KEY_FILE = '.channels-key';", "const KEY_FILE = '.channels-key';\nconst peekKey = (d) => require('fs').readFileSync(require('path').join(d, KEY_FILE));", 'a second reader of .channels-key (readFileSync(…KEY_FILE))');
plant('src/server/integration-store.js', "const KEY_FILE = '.integrations-key';", "const KEY_FILE = '.integrations-key';\n// const legacy = secretBox(path.join(dataDir, KEY_FILE)); fs.writeFileSync(keyFile, crypto.randomBytes(32));\n", 'a commented-out bare box + mint', false);
// key-file-law-fix (verify r1 F2): the verifier's seven variants — each one GREEN on the first-argument census
const MNT_ANCHOR = '  async restore() {\n';
const V2_LINE = "    if (!fs.existsSync(this._keyFile)) { const t = this._keyFile + '.t'; fs.writeFileSync(t, crypto.randomBytes(16).toString('hex') + crypto.randomBytes(16).toString('hex'), { mode: 0o600 }); fs.renameSync(t, this._keyFile); }\n";
plant('src/mounts.js', MNT_ANCHOR, MNT_ANCHOR + "    { const kp = this._keyFile, KEY_BYTES = 32; try { fs.readFileSync(kp); } catch (e) { if (e && e.code === 'ENOENT') fs.writeFileSync(kp, crypto.randomBytes(KEY_BYTES).toString('hex'), { mode: 0o600 }); } }\n", 'V1 an inline mint in mounts\' restore() through an alias (const kp = this._keyFile) + randomBytes(KEY_BYTES)');
plant('src/mounts.js', MNT_ANCHOR, MNT_ANCHOR + V2_LINE, 'V2 the atomic idiom: tmp + renameSync(tmp, this._keyFile) — the key is the SECOND argument');
plant('src/server/key-peek2.js', null, "'use strict';\nconst fsp = require('fs').promises, path = require('path');\nconst N = ['.mounts', 'key'].join('-');\nmodule.exports = (d) => fsp.readFile(path.join(d, N), 'utf8');\n", "V3 a new module reading .mounts-key with its name built at runtime (['.mounts', 'key'].join('-'))");
plant('src/server/key-peek3.js', null, "'use strict';\nconst fsp = require('fs').promises;\nmodule.exports = (mm) => { const { _keyFile: f } = mm; return fsp.readFile(f, 'utf8'); };\n", 'V4 a new module reading the store\'s field through a destructured alias (const { _keyFile: f } = mm)');
plant('src/server/key-peek4.js', null, "'use strict';\nconst fsp = require('fs').promises;\nmodule.exports = async (mm) => { const fh = await fsp.open(mm._keyFile, 'r'); try { return await fh.readFile('utf8'); } finally { await fh.close(); } };\n", 'V5 a new module opening the key with fs.promises.open(mm._keyFile)');
plant('src/server/vault-store.js', null, "'use strict';\nconst fs = require('fs'), path = require('path'), crypto = require('crypto');\nconst VAULT = '.vault.key', KEY_LEN = 32;\nmodule.exports = (d) => { const f = path.join(d, VAULT); try { return fs.readFileSync(f); } catch { const k = crypto.randomBytes(KEY_LEN); fs.writeFileSync(f, k, { mode: 0o600 }); return k; } };\n", "V6 a new store keyed '.vault.key' minted with randomBytes(KEY_LEN)");
plant('src/mounts.js', MNT_ANCHOR, MNT_ANCHOR + "    { const bak = path.join(this._dataDir || path.dirname(this._file), 'mounts-key.bak'); if (fs.existsSync(bak)) fs.copyFileSync(bak, this._keyFile); }\n", "V7 a 'restore from backup' that copies OVER the live key: copyFileSync(bak, this._keyFile)");
plant('src/server/key-put.js', null, "'use strict';\nconst { writeFileSync: put } = require('fs');\nmodule.exports = (mm) => put(mm._keyFile, 'x');\n", 'a destructured fs door (const { writeFileSync: put } = require(\'fs\')) writing the key');
plant('src/server/key-size.js', null, "'use strict';\nconst crypto = require('crypto');\nmodule.exports = (n) => crypto.randomBytes(n * 2);\n", 'randomBytes(<an expression>) in a new file (a size the census cannot read)');

// ── ③ EVERY STORE, EVERY BRANCH ──────────────────────────────────────────────────────────────────────────────────────
console.log('③ every store × every branch (+ the store\'s base rule as the RED control)');
// ③b's BELT, installed before any store runs: every fs call that names a key file (basename .*-key / *.key) is judged by
// WHO made it — lawful = src/secret-box.js under src/key-file.js's loadOrMintKey (THE law's one door); the suite's own
// fixture calls are not judged; the base-rule RED controls run with the belt paused
const KEYPATH_RE = /(^\.[A-Za-z0-9][A-Za-z0-9._-]*-key|\.key)$/;
const BELT = { paused: 0, lawful: 0, hits: [], seen: new Set() };
const SELF = new URL(import.meta.url).pathname;
const SB_FILE = path.join(REPO, 'src/secret-box.js'), KF_FILE = path.join(REPO, 'src/key-file.js');
const keyArgs = (args) => args.filter((x) => (typeof x === 'string' || Buffer.isBuffer(x) || x instanceof URL) && KEYPATH_RE.test(path.basename(x instanceof URL ? x.pathname : String(x))));
function beltJudge(door, args) {
  if (BELT.paused || !keyArgs(args).length) return;
  const lim = Error.stackTraceLimit; Error.stackTraceLimit = 40; const stack = String(new Error().stack); Error.stackTraceLimit = lim;
  const frames = stack.split('\n').slice(1).map((x) => x.trim()).filter((x) => x.startsWith('at ') && !/\(node:|^at node:/.test(x) && !/\b(beltWrap|beltJudge|injectedRead)\b/.test(x));
  const caller = frames[0] || '?';
  if (caller.includes(SELF) && !/eval at /.test(caller)) return; // the suite's own fixture work (copies, renames, chmods)
  if (caller.includes(SB_FILE) && frames.some((f) => f.includes(KF_FILE))) { BELT.lawful++; return; }
  const k = door + ' ' + caller; if (BELT.seen.has(k)) return; BELT.seen.add(k);
  BELT.hits.push(`${door}(${keyArgs(args).map((x) => path.basename(String(x))).join(', ')}) from ${caller.replace(/^at /, '').slice(0, 170)}`);
}
for (const [obj, tag] of [[fs, 'fs'], [fs.promises, 'fs.promises']]) for (const n of ['readFileSync', 'readFile', 'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'copyFileSync', 'copyFile', 'cpSync', 'cp', 'renameSync', 'rename', 'linkSync', 'link', 'symlinkSync', 'symlink', 'openSync', 'open', 'createReadStream', 'createWriteStream', 'truncateSync', 'truncate', 'unlinkSync', 'unlink', 'rmSync', 'rm']) {
  const real = obj[n]; if (typeof real !== 'function') continue;
  obj[n] = function beltWrap(...args) { beltJudge(`${tag}.${n}`, args); return real.apply(this, args); };
}
const BOOTED = new Map(); // tag → the dir its legs filled (③b boots each store over it again)
const realRead = fs.readFileSync;
async function withReadError(file, code, fn) {
  fs.readFileSync = function injectedRead(p, ...a) { if (path.resolve(String(p)) === path.resolve(file)) throw errno(code); return realRead.call(this, p, ...a); };
  try { return await fn(); } finally { fs.readFileSync = realRead; }
}
const bytes = (f) => { try { return realRead(f).toString('hex'); } catch (e) { return `<${e.code}>`; } };
const copyDir = (a, b) => fs.cpSync(a, b, { recursive: true });
let dirN = 0; const freshDir = (tag) => { const d = path.join(ROOT, `${tag}-${++dirN}`); fs.mkdirSync(d, { recursive: true }); return d; };
/** S = { tag, keyFile(dir), shape(buf) → bool, make(dir, mod), seal(st, text) → handle, open(st, handle) → text|throws,
 *  rowCode(st, handle) → the refusal code the person's row carries (null = none), ctFiles(dir) → [files], load() real module, baseRule() → module */
async function storeLegs(S) {
  const mod = S.load();
  const A = freshDir(S.tag);
  const st = await S.make(A, mod);
  const h = await S.seal(st, 'secret-one');
  const kf = S.keyFile(A);
  let mode = null; try { mode = fs.statSync(kf).mode & 0o777; } catch { }
  ok(mode === 0o600 && S.shape(realRead(kf)), `${S.tag}: a fresh dir mints ONE key (0600, its shape)`, `mode ${mode && mode.toString(8)}`);
  const st1 = await S.make(A, mod);
  ok(await S.open(st1, h) === 'secret-one', `${S.tag}: …and a second store over the same dir opens the secret (one key)`);
  const ct = () => S.ctFiles(A).map((f) => `${path.basename(f)}=${bytes(f)}`).join(',');
  // key-missing
  const B = freshDir(S.tag); copyDir(A, B); fs.renameSync(S.keyFile(B), S.keyFile(B) + '.backup');
  const missing = async (m) => {
    const ct0 = S.ctFiles(B).map(bytes).join(',');
    const s = await S.make(B, m);
    let opened = null; try { opened = await S.open(s, h); } catch { opened = null; }
    const code = await S.rowCode(s, h);
    let sealed = true; try { await S.seal(s, 'secret-two'); } catch { sealed = false; }
    return { opened, code, sealed, minted: fs.existsSync(S.keyFile(B)), same: S.ctFiles(B).map(bytes).join(',') === ct0 };
  };
  const km = await missing(mod);
  ok(km.opened !== 'secret-one' && !km.minted && km.code === 'key-missing' && km.same && !km.sealed, `${S.tag}: key file gone over ciphertext ⇒ key-missing on its row, NOTHING minted, the ciphertext byte-identical, a new secret refused`, JSON.stringify(km));
  fs.renameSync(S.keyFile(B) + '.backup', S.keyFile(B));
  ok(await S.open(await S.make(B, mod), h) === 'secret-one', `${S.tag}: the key restored from the backup opens every secret`);
  // EIO on the SAME store, then the error clears
  const C = freshDir(S.tag); copyDir(A, C);
  const k0 = bytes(S.keyFile(C));
  const sc = await S.make(C, mod);
  const eio = await withReadError(S.keyFile(C), 'EIO', async () => { let o = null; try { o = await S.open(sc, h); } catch { o = null; } return { o, code: await S.rowCode(sc, h) }; });
  ok(eio.o !== 'secret-one' && eio.code === 'key-unreadable:EIO' && bytes(S.keyFile(C)) === k0, `${S.tag}: EIO ⇒ key-unreadable:EIO on its row, the key file byte-identical`, JSON.stringify(eio));
  ok(await S.open(sc, h) === 'secret-one' && await S.rowCode(sc, h) == null, `${S.tag}: …and the SAME store opens every secret once the error clears (nothing cached, nothing replaced)`);
  // malformed
  const D = freshDir(S.tag); copyDir(A, D); fs.writeFileSync(S.keyFile(D), 'abc');
  const sd = await S.make(D, mod);
  let od = null; try { od = await S.open(sd, h); } catch { od = null; }
  const mc = await S.rowCode(sd, h);
  ok(od !== 'secret-one' && mc === 'key-malformed' && realRead(S.keyFile(D), 'utf-8') === 'abc', `${S.tag}: a malformed key ⇒ key-malformed on its row, the file untouched`, JSON.stringify({ od, mc }));
  // a REAL EACCES (chmod 000 — not as root, where it reads anyway)
  if (process.getuid && process.getuid() !== 0) {
    const F = freshDir(S.tag); copyDir(A, F); const k1 = bytes(S.keyFile(F)); fs.chmodSync(S.keyFile(F), 0o000);
    const sf = await S.make(F, mod);
    let of = null; try { of = await S.open(sf, h); } catch { of = null; }
    const fc = await S.rowCode(sf, h);
    fs.chmodSync(S.keyFile(F), 0o600);
    ok(of !== 'secret-one' && fc === 'key-unreadable:EACCES' && bytes(S.keyFile(F)) === k1 && await S.open(sf, h) === 'secret-one', `${S.tag}: a real chmod 000 ⇒ key-unreadable:EACCES, nothing replaced, and the same store opens it after chmod 600`, JSON.stringify({ of, fc }));
  }
  // RED control: the store's base rule
  fs.rmSync(S.keyFile(B)); fs.copyFileSync(S.keyFile(A), S.keyFile(B) + '.backup'); // B: no key again, ciphertext from A
  BELT.paused++; let red; try { red = await missing(S.baseRule()); } finally { BELT.paused--; } // the base rule mints outside the law ON PURPOSE
  ok(red.minted || red.code !== 'key-missing', `${S.tag}: RED control — the base rule over the same dir ${red.minted ? 'MINTS a new key over the ciphertext' : 'never says key-missing'} (the key-missing leg fails on it)`, JSON.stringify(red));
  BOOTED.set(S.tag, A);
  return { A };
}
const loadBase = (rel, edit) => { const src = realRead(path.join(REPO, rel), 'utf-8'); const out = edit(src); if (out === src) throw new Error(`base-rule edit missed in ${rel}`); return MUT.load(rel, out, 'base'); };
const stripBoxQuestion = (src) => src.replace(/secretBox\(([^,()]+(?:\([^()]*\))?), \{ hasCiphertext: [^\n]*?\}\) \}\);/, 'secretBox($1);');
const hexShape = (b) => /^[0-9a-f]{64}$/.test(b.toString('utf-8'));

// accounts
await storeLegs({
  tag: 'accounts', keyFile: (d) => path.join(d, '.accounts-key'), shape: hexShape, ctFiles: (d) => [path.join(d, 'accounts.json')],
  load: () => require(path.join(REPO, 'src/accounts.js')), baseRule: () => loadBase('src/accounts.js', (s) => s.replace(ACCT_KEY, OLD_ACCT_KEY)),
  make: (d, m) => new m.AccountManager({ dataDir: d }),
  seal: (st, text) => { const k = 'sk-ant-' + text + '-' + crypto.randomBytes(6).toString('hex'); const r = st.add({ name: 'kfl', key: k }); return { id: r.id, k }; },
  open: (st, h) => (st.getKey(h.id) === h.k ? 'secret-one' : null),
  rowCode: (st) => { try { st._key(); return null; } catch (e) { return e.code === 'key-unreadable:malformed' ? 'key-malformed' : (e.code || 'threw'); } }, // accounts' own rows word a bad shape as key-unreadable:malformed (lane oat-census-closure)
});
// mounts
await storeLegs({
  tag: 'mounts', keyFile: (d) => path.join(d, '.mounts-key'), shape: hexShape, ctFiles: (d) => [path.join(d, 'mounts.json')],
  load: () => require(path.join(REPO, 'src/mounts.js')), baseRule: () => loadBase('src/mounts.js', stripBoxQuestion),
  make: (d, m) => new m.MountManager({ dataDir: d, broadcast: () => {}, getSetting: () => undefined }),
  seal: (st, text) => { const id = 'kfl' + crypto.randomBytes(3).toString('hex'); st._state.mounts.push({ id, name: 'kfl', type: 's3', endpoint: 'https://s3.example.invalid', bucket: 'b', accessKey: 'AKKFL', secretKeyEnc: st._enc(text) }); st._save(); return { id }; },
  open: (st, h) => st._dec(st._state.mounts.find((m) => m.id === h.id).secretKeyEnc),
  rowCode: (st, h) => { const r = st.list().find((x) => x.id === h.id); return r && r.keyFile ? r.keyFile.code : null; },
});
// integrations
const IS = require(path.join(REPO, 'src/server/integration-store.js'));
await storeLegs({
  tag: 'integrations', keyFile: (d) => path.join(d, '.integrations-key'), shape: hexShape, ctFiles: (d) => [path.join(d, 'integrations.json')],
  load: () => IS, baseRule: () => loadBase('src/server/integration-store.js', stripBoxQuestion),
  make: (d, m) => m.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet }),
  seal: (st, text) => { st.setIntegration('cloud:browserless', { apiKey: 'kfl-' + text, apiUrl: 'https://chrome.example.net' }); return {}; },
  open: (st) => { const r = st.resolveIntegration('cloud:browserless'); return JSON.stringify(r).includes('kfl-secret-one') ? 'secret-one' : null; },
  rowCode: (st) => { const e = st.publicView('cloud:browserless').storeError; return e ? (e.reason || e.code) : null; },
});
// channels (the engine's own box: an account's callers.json is one of its ciphertext files)
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const engines = [];
await storeLegs({
  tag: 'channels', keyFile: (d) => path.join(d, '.channels-key'), shape: hexShape, ctFiles: (d) => [path.join(d, 'channels', 'acct-kfl', 'callers.json')],
  load: () => ENG, baseRule: () => loadBase('src/server/channels-engine.js', stripBoxQuestion),
  make: (d, m) => { const e = m.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, integrations: IS.create({ dataDir: path.join(d, 'int'), env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet }), fetch: async () => { throw new Error('no network in this suite'); }, log: quiet }); engines.push(e); return { e, d }; },
  seal: ({ e, d }, text) => { const blob = e.secrets.seal(text); const f = path.join(d, 'channels', 'acct-kfl', 'callers.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ callers: [{ id: 'c1', tokenEnc: blob }] }), { mode: 0o600 }); return { blob }; },
  open: ({ e }, h) => e.secrets.open(h.blob),
  rowCode: ({ e }, h) => { try { e.secrets.open(h.blob); return null; } catch (x) { return (x && x.reason) || (x && x.code) || 'threw'; } },
});
for (const e of engines) { try { await e.stop?.(); } catch { } }
// app-secrets (the machine's master; the sealed stores are per app)
const AS = require(path.join(REPO, 'src/app-secrets.js'));
await storeLegs({
  tag: 'app-secrets', keyFile: (d) => path.join(d, '.app-secrets-key'), shape: hexShape, ctFiles: (d) => [path.join(d, 'desktop-apps', 'app-kfl', 'portal', 'secrets.json')],
  load: () => AS, baseRule: () => loadBase('src/app-secrets.js', (s) => s.replace(/SB\.lawfulKey\(keyFile, \{ hasCiphertext: [^\n]*\}\);/, 'SB.lawfulKey(keyFile, { hasCiphertext: () => false });')),
  make: (d, m) => ({ d, m }),
  seal: ({ d, m }, text) => { const r = m.appSecretsMaster({ dataDir: d }); if (!r.master) throw new Error(r.refused.code); const f = path.join(d, 'desktop-apps', 'app-kfl', 'portal', 'secrets.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ v: 1, n: 1, sealed: SB.encWith(r.master, text) }), { mode: 0o600 }); return {}; },
  open: ({ d, m }) => { const r = m.appSecretsMaster({ dataDir: d }); if (!r.master) throw new Error(r.refused.code); return SB.decWith(r.master, JSON.parse(realRead(path.join(d, 'desktop-apps', 'app-kfl', 'portal', 'secrets.json'), 'utf-8')).sealed); },
  rowCode: ({ d, m }) => { const r = m.appSecretsMaster({ dataDir: d }); return r.master ? null : r.refused.code; },
});
// passkeys: the wiring's own IIFE, extracted verbatim and run over a scratch rootDir
const WIRING = realRead(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf-8');
const pkStart = WIRING.indexOf('passkeys: (() => {'), pkEnd = WIRING.indexOf('})(),', pkStart);
const PK_IIFE = pkStart > 0 && pkEnd > pkStart ? WIRING.slice(pkStart + 'passkeys: '.length, pkEnd + 4) : null;
ok(!!PK_IIFE && PK_IIFE.includes('lawfulKey(keyFile, { raw: true, hasCiphertext'), 'passkeys: the wiring\'s store IIFE extracted verbatim (it reads its key through lawfulKey, raw, with the store\'s question)');
const pkModule = (iife) => ({ make: (rootDir) => new Function('rootDir', 'path', 'fs', 'require', `return ${iife};`)(rootDir, path, fs, createRequire(path.join(REPO, 'src/server/mounts-plugins-wiring.js'))) });
await storeLegs({
  tag: 'passkeys', keyFile: (d) => path.join(d, 'data', 'browser-passkeys.key'), shape: (b) => b.length === 32, ctFiles: (d) => [path.join(d, 'data', 'browser-passkeys.json')],
  load: () => pkModule(PK_IIFE), baseRule: () => pkModule(PK_IIFE.replace(PK_NEW, PK_OLD)),
  make: (d, m) => { fs.mkdirSync(path.join(d, 'data'), { recursive: true }); return m.make(d); },
  seal: (st, text) => { const sealed = st.cipher.seal(text); if (sealed && sealed.ok === false) throw Object.assign(new Error(sealed.words), { code: sealed.code }); const cur = st.read() || {}; if (!cur.row) st.write({ row: { keySealed: sealed } }); return { sealed: (st.read() || {}).row.keySealed }; },
  open: (st, h) => { const r = st.cipher.open(h.sealed); return r && r.ok === false ? null : r; },
  rowCode: (st, h) => { const r = st.cipher.open(h.sealed); return r && r.ok === false ? r.code : null; }, // key-file-law-fix: the refusal is the doors' VALUE (④), never a throw
});

// the box's own corners (key-file-law-fix, verify r1 L2 / L4)
{
  const d = freshDir('nolink'), kf = path.join(d, '.nolink-key'), realLink = fs.linkSync;
  fs.linkSync = () => { throw Object.assign(new Error('EPERM: no hard links here'), { code: 'EPERM' }); };
  let first, second, landed;
  BELT.paused++; // the minter called bare ON PURPOSE (the belt would rightly say: not under key-file.js)
  try { first = SB.mintKeyFile(kf); landed = realRead(kf, 'utf-8'); second = SB.mintKeyFile(kf); } finally { fs.linkSync = realLink; BELT.paused--; }
  ok(first && first.toString('hex') === landed && (fs.statSync(kf).mode & 0o777) === 0o600 && second === null && realRead(kf, 'utf-8') === landed && fs.readdirSync(d).length === 1, 'L2: a filesystem without hard links (linkSync EPERM) ⇒ an EXCLUSIVE create: the first mint lands (0600), a second answers null (EEXIST — the landed key is re-read), never a rename over it; no tmp left', JSON.stringify({ second, files: fs.readdirSync(d) }));
  const e = freshDir('applink'), real = path.join(e, 'real-app'); fs.mkdirSync(path.join(real, 'portal'), { recursive: true });
  fs.writeFileSync(path.join(real, 'portal', 'secrets.json'), JSON.stringify({ v: 1, n: 2, sealed: 'x' }));
  fs.mkdirSync(path.join(e, 'desktop-apps')); fs.symlinkSync(real, path.join(e, 'desktop-apps', 'app-link'));
  fs.symlinkSync(path.join(e, 'gone'), path.join(e, 'desktop-apps', 'dangling'));
  ok(SB.holdsCiphertext({ each: [{ dir: path.join(e, 'desktop-apps'), file: 'portal/secrets.json' }], re: (t) => /"n":\s*[1-9]/.test(t) }) === true && SB.holdsCiphertext({ each: [{ dir: path.join(e, 'desktop-apps'), file: 'portal/none.json' }] }) === false, 'L4: a SYMLINKED per-app dir holds what its target holds (a lost key is refused, never minted over its sealed logins); a dangling link holds nothing');
}

// ── ③b THE BEHAVIOUR BELT (key-file-law-fix, verify r1 F2) ────────────────────────────────────────────────────────────
console.log('③b the behaviour belt — every key-file fs call while the stores boot and run comes through the law');
const BOOTS = {
  accounts: async (d, m = require(path.join(REPO, 'src/accounts.js'))) => { const a = new m.AccountManager({ dataDir: d }); for (const r of a.list().accounts || []) { try { a.getKey(r.id); } catch { /* a refusal is a row */ } } },
  mounts: async (d, m = require(path.join(REPO, 'src/mounts.js'))) => { const mm = new m.MountManager({ dataDir: d, broadcast: () => {}, getSetting: () => undefined }); mm.maybeUpgradePinnedRclone = () => {}; await mm.restore(); mm.list(); },
  integrations: async (d) => { const st = IS.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet }); st.publicView('cloud:browserless'); st.resolveIntegration('cloud:browserless'); },
  channels: async (d) => { const e = ENG.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, integrations: IS.create({ dataDir: path.join(d, 'int'), env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet }), fetch: async () => { throw new Error('no network in this suite'); }, log: quiet }); try { const f = path.join(d, 'channels', 'acct-kfl', 'callers.json'); if (fs.existsSync(f)) { try { e.secrets.open(JSON.parse(realRead(f, 'utf-8')).callers[0].tokenEnc); } catch { /* a refusal */ } } } finally { try { await e.stop?.(); } catch { } } },
  'app-secrets': async (d) => { AS.appSecretsMaster({ dataDir: d }); },
  passkeys: async (d, iife = PK_IIFE) => { fs.mkdirSync(path.join(d, 'data'), { recursive: true }); const pk = pkModule(iife).make(d); const x = pk.cipher.seal('belt'); if (typeof x === 'string') pk.cipher.open(x); },
};
for (const [tag, boot] of Object.entries(BOOTS)) { await boot(freshDir('boot-' + tag)); if (BOOTED.has(tag)) await boot(BOOTED.get(tag)); }
const beltRed = async (label, fn) => {
  const h0 = BELT.hits.length; let threw = null;
  try { await fn(); } catch (e) { threw = e; }
  const got = BELT.hits.splice(h0);
  ok(got.length > 0, `BEHAVIOUR RED control: ${label} ⇒ ${got[0] ? got[0].slice(0, 160) : 'NOT caught'}`, threw ? `threw: ${threw.message}` : 'the belt saw nothing');
};
await beltRed("mounts' restore() mints its own key (tmp + renameSync(tmp, this._keyFile) — V2, at runtime)", () => BOOTS.mounts(freshDir('belt-v2'), MUT.load('src/mounts.js', realRead(path.join(REPO, 'src/mounts.js'), 'utf-8').replace(MNT_ANCHOR, MNT_ANCHOR + V2_LINE), 'belt-v2')));
await beltRed("the passkey wiring's old inline mint (writeFileSync(keyFile, key, { flag: 'wx' }) in the IIFE)", () => BOOTS.passkeys(freshDir('belt-pk'), PK_IIFE.replace(PK_NEW, PK_OLD)));

// the person's words (the client module) — the codes become a line naming the key file; zh / ja carry every key
{
  const emit = process.emitWarning; process.emitWarning = () => { }; // a typeless src/lib ESM import warns once (expected)
  const W = await import(pathToFileURL(path.join(REPO, 'src/lib/key-file-words.js')).href);
  process.emitWarning = emit;
  const zh = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-zh.js')).href)).default, ja = (await import(pathToFileURL(path.join(REPO, 'src/lib/i18n-ja.js')).href)).default;
  const keys = ['Key file {file} is missing — restore it from a backup', 'Key file {file} is damaged — restore it from a backup; nothing was replaced', 'Key file {file} could not be read ({code}) — no new key was made', 'Stored logins: {why}'];
  ok(W.keyFileWords('key-missing', '.mounts-key') === 'Key file .mounts-key is missing — restore it from a backup' && W.keyFileWords('key-unreadable:EIO', '.mounts-key').includes('(EIO)') && /damaged/.test(W.keyFileWords('key-malformed', 'x')) && W.keyFileWords('bad-ciphertext', 'x') === '', 'keyFileWords: missing → restore, unreadable names the errno, malformed → damaged; nothing else is worded');
  ok(W.appSecretsKeyWords('unavailable: key-missing (.app-secrets-key)') === 'Key file .app-secrets-key is missing — restore it from a backup' && W.appSecretsKeyWords('unavailable: python3 not found on this machine') === '' && W.appSecretsKeyWords('on') === '', 'appSecretsKeyWords: the app\'s secrets state carries the code + the key file; any other unavailable says nothing new');
  ok(keys.every((k) => zh[k] && ja[k]) && zh[keys[0]].includes('从备份恢复') && zh[keys[2]].includes('{code}'), 'zh / ja carry every key-file line (zh: 「密钥文件 {file} 丢失——请从备份恢复」)');
  // L3 (key-file-law-fix): the integrations card's storeError names the file, so the card says the law's own words
  {
    const d = freshDir('int-words'); const s0 = IS.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet });
    s0.setIntegration('cloud:browserless', { apiKey: 'kfl-words', apiUrl: 'https://chrome.example.net' }); fs.rmSync(path.join(d, '.integrations-key'));
    const se = IS.create({ dataDir: d, env: {}, now: () => Date.now(), broadcast: () => {}, log: quiet }).publicView('cloud:browserless').storeError || {};
    const card = realRead(path.join(REPO, 'src/lib/integrations-window.js'), 'utf-8');
    ok(se.reason === 'key-missing' && se.file === '.integrations-key' && W.keyFileWords(se.reason, se.file) === 'Key file .integrations-key is missing — restore it from a backup' && /keyFileWords\(err\.reason, err\.file\)/.test(card), "L3: the integrations card's storeError carries {reason: key-missing, file: .integrations-key} ⇒ its line is the law's translated 'Key file .integrations-key is missing — restore it from a backup' (never 'could not be read' for a missing file)", JSON.stringify(se));
  }
  // the passkey key line's detail (key-file-law-fix, F1) is translated too
  const pkDetail = require(path.join(REPO, 'src/browser-passkey.js')).keyForYouItem({ code: 'key-missing', file: 'x' }).detail;
  ok(zh[pkDetail] && ja[pkDetail], 'zh / ja carry the passkey key line\'s detail', pkDetail);
  // the app-secrets facts → the plan's secrets state → the words (a fake python3 with gi, so the key read is reached)
  const fakeBin = freshDir('fakebin'); fs.writeFileSync(path.join(fakeBin, 'python3'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const E = freshDir('app-facts'); const f = path.join(E, 'desktop-apps', 'app-kfl', 'portal', 'secrets.json'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ v: 1, n: 2, sealed: 'x' }));
  const facts = await AS.appSecretsFacts({ env: { PATH: fakeBin }, mode: 'on', dataDir: E, id: 'app-kfl' });
  const plan = require(path.join(REPO, 'src/desktop-apps.js')).secretServicePlan({ plan: { ok: true, dirs: ['/tmp/kfl-root'] }, facts });
  ok(plan.secrets === 'unavailable: key-missing (.app-secrets-key)' && !fs.existsSync(path.join(E, '.app-secrets-key')) && W.appSecretsKeyWords(plan.secrets).includes('restore'), `app-secrets: a sealed store with no master ⇒ the window's state '${plan.secrets}' ⇒ its ⋯ says restore; nothing minted, no service key`, JSON.stringify({ facts, plan: plan.secrets }));
}

// ── ④ THE PASSKEY DOORS (key-file-law-fix, verify r1 F1) ─────────────────────────────────────────────────────────────
console.log('④ the passkey doors — a key refusal is a VALUE: nothing thrown out of the socket listener, the gate released, the person told');
{
  const PSm = require(path.join(REPO, 'src/browser-passkey-store.js')), PKm = require(path.join(REPO, 'src/browser-passkey.js'));
  const pkcs8 = () => crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const ticks = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); }; // the fake answers on a timer
  const until = async (fn, ms = 1000) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 5)); return fn(); };
  // the CDP answers of scripts/test-browser-passkey.mjs ④ (the hook's private-field anchor answered, every other call {})
  const answer = (m, st) => {
    const R = { 'Target.getTargets': { targetInfos: [{ targetId: 'T1', type: 'page', url: 'https://github.com/login', title: 'Sign in' }] }, 'Target.attachToTarget': { sessionId: 'S1' }, 'Browser.getVersion': { userAgent: 'Mozilla/5.0 Chrome/154.0.0.0' }, 'Runtime.evaluate': { result: { type: 'string', value: 'complete' } }, 'WebAuthn.addVirtualAuthenticator': { authenticatorId: 'A1' } };
    if (m.method === 'Page.addScriptToEvaluateOnNewDocument') st.slot = (String(m.params.source).match(/#(vs[0-9a-f]{32})\b/) || [])[1] || null;
    if (m.method === 'Runtime.getProperties') R['Runtime.getProperties'] = { result: [], privateProperties: st.slot ? [{ name: '#' + st.slot, value: { type: 'function', objectId: 'CTL-1' } }] : [] };
    if (m.method === 'Runtime.callFunctionOn') R['Runtime.callFunctionOn'] = { result: { type: 'number', value: 1 } };
    if (m.method === 'Runtime.evaluate' && m.params && m.params.contextId === 7 && m.params.expression === 'CredentialsContainer.prototype') R['Runtime.evaluate'] = { result: { type: 'object', objectId: 'CCP-7' } }; // the ceremony's document (ctx 7)
    return { id: m.id, result: R[m.method] || {} };
  };
  function fakeCdp() {
    const log = [], st = { slot: null }; let sock = null;
    class FakeWS {
      constructor() { this.readyState = 1; this.h = {}; sock = this; setTimeout(() => this.h.open && this.h.open(), 0); }
      on(ev, fn) { this.h[ev] = fn; }
      close() { this.readyState = 3; }
      send(raw) { const m = JSON.parse(raw); log.push(m); const reply = answer(m, st); setTimeout(() => this.h.message && this.h.message(JSON.stringify(reply)), 0); }
    }
    return { FakeWS, log, push: (o) => sock.h.message(JSON.stringify(o)) };
  }
  const cred = () => ({ credentialId: crypto.randomBytes(16).toString('base64'), isResidentCredential: true, rpId: 'github.com', privateKey: pkcs8(), userHandle: crypto.randomBytes(8).toString('base64'), signCount: 0, userName: 'bob', userDisplayName: 'Bob' });
  /** a profile whose browser-passkeys.json holds a sealed row (policy yes) and whose key file is GONE (a partial restore) */
  async function pkDoor({ iife = PK_IIFE, dialogs = null, WebSocketImpl = null, url = 'ws://fake' } = {}) {
    const d = freshDir('pkdoor'); fs.mkdirSync(path.join(d, 'data'), { recursive: true });
    const k0 = crypto.randomBytes(32);
    const row = PSm.normalizeRow({ credentialId: crypto.randomBytes(16).toString('base64url'), rpId: 'github.com', userHandle: crypto.randomBytes(8).toString('base64url'), userName: 'alice', displayName: 'Alice', keySealed: PSm.seal(PSm.cipherOf(crypto, k0), pkcs8()), signCount: 1, policy: 'yes', createdBy: 'agent', bySession: 'bk-12345678', createdAt: 1 });
    const store = path.join(d, 'data', 'browser-passkeys.json'), keyFile = path.join(d, 'data', 'browser-passkeys.key');
    fs.writeFileSync(store, JSON.stringify(PSm.withRow(PSm.normalizeStore(null), 'bp-1', row)), { mode: 0o600 });
    const f = WebSocketImpl ? null : fakeCdp(), warns = [], items = [], resolved = []; let clock = Date.now();
    const D = (dialogs || require(path.join(REPO, 'src/server/browser-dialogs.js'))).create({ keeper: { profile: () => ({ id: 'bp-1' }), cdpEndpointFor: async () => ({ ok: true, url }), onLease: () => () => {} }, ...(f ? { WebSocketImpl: f.FakeWS } : {}), log: { warn: (x) => warns.push(String(x)), log() {} }, now: () => clock, passkeys: pkModule(iife).make(d), forYou: { add: (pid, it) => { items.push(it); return 'fy-' + items.length; }, resolve: (id) => resolved.push(id) } });
    await D.arm('bp-1');
    const push = (o) => { try { f.push(o); return null; } catch (x) { return x; } };
    const bind = f ? f.log.find((x) => x.method === 'Runtime.addBinding') : null;
    return {
      d, f, D, warns, items, resolved, k0, store, keyFile, step: (ms) => { clock += ms; },
      rows: () => PSm.profileOf(JSON.parse(realRead(store, 'utf-8')), 'bp-1').rows.length,
      added: () => push({ method: 'WebAuthn.credentialAdded', sessionId: 'S1', params: { authenticatorId: 'A1', credential: cred() } }),
      start: (id) => push({ method: 'Runtime.bindingCalled', sessionId: 'S1', params: { name: bind.params.name, executionContextId: 7, payload: JSON.stringify({ ev: 'start', id, kind: 'get', rpId: 'github.com' }) } }),
    };
  }
  const locked = (P) => P.warns.filter((x) => /the passkey store is locked/.test(x)).length;
  // the harvest: a NEW passkey over sealed rows with the key gone
  const P = await pkDoor(); const before = realRead(P.store, 'utf-8');
  const thrown = P.added(); await ticks(4);
  ok(!thrown && P.rows() === 1 && realRead(P.store, 'utf-8') === before && !fs.existsSync(P.keyFile), 'harvest: a NEW passkey over sealed rows with the key file gone ⇒ nothing thrown out of the socket listener, nothing stored, nothing minted (the store byte-identical)', JSON.stringify({ thrown: thrown && thrown.message }));
  const fy = P.items[0] || {};
  ok(P.items.length === 1 && fy.text === 'Key file browser-passkeys.key is missing — restore it from a backup' && fy.i18n && fy.i18n.text.key === 'Key file {file} is missing — restore it from a backup' && fy.i18n.text.params.file === 'browser-passkeys.key' && /passkeys are sealed under this key/.test(fy.detail) && locked(P) === 1, "…and the person is told ONCE: one For-you line naming the key file + the refusal (the key-file law's own words and i18n keys), one server-log line", JSON.stringify({ items: P.items, warns: P.warns }));
  P.added(); await ticks(4);
  ok(P.items.length === 1 && locked(P) === 1 && P.rows() === 1, '…a second new passkey in the same state: still ONE line, still nothing stored');
  // the gate: a modal get for the site of the stored passkey (policy yes)
  const verbOf = (x) => x.method === 'Runtime.callFunctionOn' && x.params && x.params.arguments ? x.params.arguments[1].value : null;
  const n0 = P.f.log.length, s0 = Date.now(); const t2 = P.start(1); await until(() => P.f.log.slice(n0).some((x) => verbOf(x) === 'release'));
  const sent = P.f.log.slice(n0).map((x) => x.method + (verbOf(x) ? `(${verbOf(x)})` : ''));
  ok(!t2 && sent.includes('Runtime.callFunctionOn(release)') && !sent.includes('WebAuthn.addCredential') && P.items.length === 1 && Date.now() - s0 < 1000, `gate: a modal get over the refused key ⇒ RELEASED at once (${sent.join(', ')}), nothing loaded, no second line — the base's hang (nothing sent after the start) closed`, JSON.stringify(sent));
  P.step(PKm.PENDING_SAID_MS + 50);
  const v = P.D.passkeyIn('bp-1', null);
  ok(v.state === 'passkey_open' && v.text.includes("VibeSpace's saved passkeys are locked: browser-passkeys.key is missing — restore it from a backup"), "…while the page still waits, the agent's sentence carries the restore words", JSON.stringify(v).slice(0, 400));
  fs.writeFileSync(P.keyFile, P.k0, { mode: 0o600 }); // restored from the backup
  P.added(); await ticks(4);
  ok(P.rows() === 2 && P.resolved.includes('fy-1'), 'the key file restored ⇒ the next new passkey is kept, and the For-you line resolves itself', JSON.stringify({ rows: P.rows(), resolved: P.resolved }));
  P.D.shutdown();
  // an unreadable key (EISDIR) names its errno
  const U = await pkDoor(); fs.mkdirSync(U.keyFile); U.added(); await ticks(4);
  ok(U.rows() === 1 && (U.items[0] || {}).text === 'Key file browser-passkeys.key could not be read (EISDIR) — no new key was made' && (U.items[0].i18n.text.params || {}).code === 'EISDIR', "an unreadable key file (a directory there) ⇒ the line says 'could not be read (EISDIR)', nothing stored", JSON.stringify(U.items));
  U.D.shutdown();
  // the REAL socket: ws's own listener (a throw there is process 'uncaughtException' = server.js's exit(1))
  {
    const { WebSocketServer } = require('ws');
    const uncaught = [], onUncaught = (x) => uncaught.push(String(x && (x.code || x.message)));
    process.on('uncaughtException', onUncaught);
    let client = null; const st = { slot: null };
    const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    wss.on('connection', (c) => { client = c; c.on('message', (raw) => c.send(JSON.stringify(answer(JSON.parse(String(raw)), st)))); });
    await new Promise((r) => wss.on('listening', r));
    const R = await pkDoor({ WebSocketImpl: true, url: `ws://127.0.0.1:${wss.address().port}` });
    client.send(JSON.stringify({ method: 'WebAuthn.credentialAdded', sessionId: 'S1', params: { authenticatorId: 'A1', credential: cred() } }));
    await new Promise((r) => setTimeout(r, 300));
    process.removeListener('uncaughtException', onUncaught);
    ok(uncaught.length === 0 && R.rows() === 1 && !fs.existsSync(R.keyFile) && R.items.length === 1, `the real ws socket (ws ${require('ws/package.json').version}): the same harvest ⇒ no uncaughtException (the hub stays up), nothing stored, one line`, JSON.stringify(uncaught));
    R.D.shutdown(); for (const c of wss.clients) c.terminate(); await new Promise((r) => wss.close(r));
  }
  // RED controls: 952bb5aef's shape — the wiring THROWS the refusal, the watch has no listener guard / harvest catch /
  // release on a failed gate — and the base wiring (5e9530069's inline mint)
  const DIALOGS_SRC = realRead(path.join(REPO, 'src/server/browser-dialogs.js'), 'utf-8');
  const unguard = (src) => {
    const out = src.replace(/ws\.on\('message', \(d\) => \{ try \{ onMessage\(w, d\); \} catch \(err\) \{[^\n]*?\} \}\);/, "ws.on('message', (d) => onMessage(w, d));")
      .replace('{ try { pkHarvest(w, e, m.method, p); } catch (err) { pkFailed(w, e, null, err); } }', 'pkHarvest(w, e, m.method, p);')
      .replace("    if (rec && rec.outcome === 'pending') pkCtl(w, e, rec, 'release').catch(() => {});\n", '');
    if ((out.match(/pkFailed\(w, e, null, err\)|onMessage\(w, d\); \} catch|pkCtl\(w, e, rec, 'release'\)\.catch/g) || []).length) throw new Error('unguard: an anchor moved');
    return out;
  };
  const THROWS = PK_IIFE.replace(/if \(!k\.ok\) return \{ ok: false, [^\n]*/, "if (!k.ok) throw Object.assign(new Error(require('../key-file.js').refusalWords(k.code, path.basename(keyFile))), { code: k.code });");
  {
    const R = await pkDoor({ iife: THROWS, dialogs: MUT.load('src/server/browser-dialogs.js', unguard(DIALOGS_SRC), 'f1-shape') });
    const th = R.added(); const m0 = R.f.log.length; R.start(1); await new Promise((r) => setTimeout(r, 300)); // the fixed tree releases in < 20 ms
    const after = R.f.log.slice(m0).map((x) => x.method + (verbOf(x) ? `(${verbOf(x)})` : ''));
    ok(THROWS !== PK_IIFE && th && th.code === 'key-missing' && !after.includes('Runtime.callFunctionOn(release)'), `RED control — 952bb5aef's shape (the refusal thrown, the watch unguarded) ⇒ ${th ? `the harvest throws ${th.code} out of the listener` : 'no throw'} and the gate sends ${after.length ? after.join(', ') : 'NOTHING'} after the start (the page hangs)`, JSON.stringify({ th: th && th.message, after }));
    R.D.shutdown();
  }
  BELT.paused++;
  try {
    const R = await pkDoor({ iife: PK_IIFE.replace(PK_NEW, PK_OLD) });
    R.added(); await ticks(4);
    const rows = PSm.profileOf(JSON.parse(realRead(R.store, 'utf-8')), 'bp-1').rows;
    ok(fs.existsSync(R.keyFile) && rows.length === 2 && PSm.open(PSm.cipherOf(crypto, realRead(R.keyFile)), rows.find((x) => x.userName === 'alice')) === null, "RED control — the base wiring (5e9530069's inline mint) ⇒ a NEW key minted beside the sealed rows: the new passkey kept, the old one never opens again");
    R.D.shutdown();
  } finally { BELT.paused--; }
}

// ③b's verdict over EVERYTHING above (③, the boots, ④) — the RED controls' own hits were taken out where they ran
ok(BELT.hits.length === 0 && BELT.lawful > 0, `BEHAVIOUR: ${BELT.lawful} key-file fs calls while the six stores ran every leg, booted over fresh + filled dirs (mounts' restore() too) and the passkey doors ran — every one from src/secret-box.js under key-file.js's loadOrMintKey`, BELT.hits.join(' | '));
for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
