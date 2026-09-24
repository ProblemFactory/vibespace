#!/usr/bin/env node
// SECRET BOX (docs/design-communication-panel.zh.md §14.7 + §17's
// `test-secret-box` row; decision 24). Fast tier.
//
// THE LEGS:
//   ① PARITY with mounts' former inline `_key/_enc/_dec` — BOTH directions:
//      the pre-fix bytes (embedded VERBATIM below, and cross-checked against
//      `git show HEAD:src/mounts.js` when git can answer) encrypt ⇒ secret-box
//      decrypts; secret-box encrypts ⇒ the pre-fix bytes decrypt. `iv.tag.data`,
//      three base64 segments, byte for byte.
//   ② the key is minted on ENOENT ONLY, 0600, 64 hex.
//   ③ every OTHER read failure is a TYPED `SecretBoxError` (EISDIR / EACCES /
//      an emptied file / a truncated file), and the existing key file's bytes
//      are UNTOUCHED afterwards — never overwritten.
//   ④ two minters racing land on ONE key.
//   ⑤ THE STANDING NEGATIVE CONTROL: the bare-catch copy (§14.7's quoted
//      defect) on an injected EACCES MINTS A NEW KEY, after which the old
//      ciphertext no longer decrypts — the defect itself, kept as a control.
//   ⑥ mounts is switched: MountManager has no inline cipher any more and its
//      `_enc/_dec` round-trip through the box on `data/.mounts-key`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';
import { mutantCopies, copiesCensus, sweepLegacy } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const { secretBox, SecretBoxError } = require(path.join(REPO, 'src/secret-box.js'));
const ROOT = scratch('secretbox');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// ── THE PRE-FIX BYTES, VERBATIM (src/mounts.js:360-381 before this change) ──
// Wrapped in a factory that takes `fs` so the negative control can INJECT a
// read failure the way the world does (EMFILE/EIO/EACCES) without root.
const LEGACY_SRC = `'use strict';
const crypto = require('crypto');
module.exports = function makeLegacy(fs, keyFile) {
  const self = { _keyFile: keyFile };
  self._key = function _key() {
    try { return Buffer.from(fs.readFileSync(this._keyFile, 'utf-8').trim(), 'hex'); }
    catch {
      const k = crypto.randomBytes(32);
      fs.writeFileSync(this._keyFile, k.toString('hex'), { mode: 0o600 });
      return k;
    }
  };
  self._enc = function _enc(text) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', this._key(), iv);
    const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return \`\${iv.toString('base64')}.\${c.getAuthTag().toString('base64')}.\${data.toString('base64')}\`;
  };
  self._dec = function _dec(blob) {
    const [iv, tag, data] = String(blob).split('.').map(s => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', this._key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  };
  return self;
};
`;
// Loaded from a copy written OUTSIDE the tree (scripts/mutant-copy.mjs — this
// process's scratch dir, removed at exit); the tree census at the end measures
// that. It used to be a gitignored sibling, src/.mounts-legacy-enc.prefix-<pid>.js,
// that every src/ scanner running beside this suite read as source.
const MUTSB = mutantCopies('secret-box', REPO);
sweepLegacy(REPO, ['src'], /^\.mounts-legacy-enc\.prefix-(\d+)\.js$/);   // what a pre-fix run stranded (dead PIDs only)
const makeLegacy = MUTSB.load('src/mounts.js', LEGACY_SRC, 'legacy-enc');


// The embedded bytes are the ones the tree shipped: cross-check against git
// when it can answer (a tarball export cannot — SKIP with the reason, never
// a false green).
{
  let shipped = null, why = null;
  try {
    // HEAD may already carry the fix; the PARENT of a commit that touched
    // mounts.js is where the inline cipher last lived. Walk back until the
    // inline `_key()` is found (bounded).
    for (const ref of ['HEAD', 'HEAD~1', 'HEAD~2', 'HEAD~3']) {
      let s; try { s = execFileSync('git', ['show', `${ref}:src/mounts.js`], { cwd: REPO, env: gitEnvFrom(process.env), encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 }); } catch (e) { why = e.message; break; }
      if (/_key\(\) \{\n    try \{ return Buffer\.from\(fs\.readFileSync\(this\._keyFile/.test(s)) { shipped = s; break; }
    }
  } catch (e) { why = e.message; }
  if (!shipped) console.log(`  … SKIP git cross-check of the embedded pre-fix bytes (${why || 'no ancestor within 3 commits still carries the inline cipher'})`);
  else {
    const pick = (name) => { const m = shipped.match(new RegExp(`  ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}`)); return m ? m[0] : ''; };
    const norm = (s) => s.replace(/^\s+/gm, '').replace(/\s+$/gm, '');
    for (const fn of ['_key', '_enc', '_dec']) {
      const theirs = norm(pick(fn)).replace(/^_(key|enc|dec)\(/, 'self._$1 = function _$1(');
      const mine = norm(LEGACY_SRC.match(new RegExp(`self\\.${fn} = function ${fn}\\([^)]*\\) \\{[\\s\\S]*?\\n  \\};`))[0]).replace(/;$/, '');
      ok(theirs.split('\n').slice(1).join('\n') === mine.split('\n').slice(1).join('\n'), `embedded pre-fix ${fn}() body is byte-identical to the shipped one (modulo the method/function header)`, `theirs=${JSON.stringify(theirs)} mine=${JSON.stringify(mine)}`);
    }
  }
}

// ── ① PARITY, both directions ──
{
  const keyFile = path.join(ROOT, 'parity', '.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  const legacy = makeLegacy(fs, keyFile);
  const box = secretBox(keyFile);
  const plain = 'sk-live-' + 'a'.repeat(40) + ' 日本語 \n';
  const fromLegacy = legacy._enc(plain);
  ok(fromLegacy.split('.').length === 3 && fromLegacy.split('.').every((s) => /^[A-Za-z0-9+/=]+$/.test(s)), 'the pre-fix ciphertext is `iv.tag.data`, three base64 segments');
  ok(box.dec(fromLegacy) === plain, 'PARITY →: the pre-fix _enc encrypts ⇒ secret-box decrypts');
  const fromBox = box.enc(plain);
  ok(legacy._dec(fromBox) === plain, 'PARITY ←: secret-box encrypts ⇒ the pre-fix _dec decrypts');
  ok(fromBox.split('.').length === 3 && Buffer.from(fromBox.split('.')[0], 'base64').length === 12 && Buffer.from(fromBox.split('.')[1], 'base64').length === 16, 'secret-box: 12-byte iv, 16-byte tag — the same layout');
  ok(box.dec(box.enc('')) === '' && box.dec(box.enc('x')) === 'x', 'round trip on the empty string and a 1-char string');
  let threw = null; try { box.dec('not.a.blob'); } catch (e) { threw = e; }
  ok(threw instanceof SecretBoxError && threw.code === 'bad-ciphertext', 'garbage ciphertext is a TYPED bad-ciphertext, not a raw crypto throw');
  let threw2 = null; try { box.dec('only-one-segment'); } catch (e) { threw2 = e; }
  ok(threw2 instanceof SecretBoxError && threw2.code === 'bad-ciphertext', 'a blob without three segments is TYPED too');
}

// ── ② ENOENT-only minting, 0600, 64 hex ──
{
  const keyFile = path.join(ROOT, 'fresh', 'sub', '.key');
  const box = secretBox(keyFile);
  ok(!box.hasKey(), 'no key before the first use');
  const c = box.enc('hello');
  ok(box.hasKey(), 'the first enc() minted the key (ENOENT ⇒ create)');
  const st = fs.statSync(keyFile);
  ok((st.mode & 0o777) === 0o600, `key file is 0600 (got ${(st.mode & 0o777).toString(8)})`);
  const hex = fs.readFileSync(keyFile, 'utf-8').trim();
  ok(/^[0-9a-f]{64}$/.test(hex), 'key file holds exactly 64 hex characters');
  ok(box.dec(c) === 'hello', 'and it decrypts what it encrypted');
  ok(!fs.readdirSync(path.dirname(keyFile)).some((f) => f.includes('.tmp-')), 'no temp file left behind after minting');
  // a SECOND box on the same file reads, never re-mints
  const again = secretBox(keyFile);
  ok(again.dec(c) === 'hello' && fs.readFileSync(keyFile, 'utf-8').trim() === hex, 'a second box over the same file READS the key (bytes unchanged)');
}

// ── ③ every other errno is TYPED and the key file is never overwritten ──
{
  const dir = path.join(ROOT, 'errno'); fs.mkdirSync(dir, { recursive: true });
  // (a) EISDIR: a directory where the key file should be
  const asDir = path.join(dir, '.key-isdir'); fs.mkdirSync(asDir);
  let e1 = null; try { secretBox(asDir).enc('x'); } catch (e) { e1 = e; }
  ok(e1 instanceof SecretBoxError && e1.code === 'key-unreadable' && /EISDIR/.test(e1.message), `EISDIR ⇒ TYPED key-unreadable naming the errno (got ${e1 && e1.code}: ${e1 && e1.message})`);
  ok(fs.statSync(asDir).isDirectory(), 'and the directory is still there — nothing was minted over it');
  // (b) an EMPTIED file (a crash mid-write, a bad restore): NOT a fresh key
  const emptied = path.join(dir, '.key-empty'); fs.writeFileSync(emptied, '', { mode: 0o600 });
  let e2 = null; try { secretBox(emptied).enc('x'); } catch (e) { e2 = e; }
  ok(e2 instanceof SecretBoxError && e2.code === 'key-malformed', `an emptied key file ⇒ TYPED key-malformed (got ${e2 && e2.code})`);
  ok(fs.readFileSync(emptied, 'utf-8') === '', 'the emptied file is left exactly as found (never overwritten with a new key)');
  // (c) a TRUNCATED file
  const trunc = path.join(dir, '.key-trunc'); fs.writeFileSync(trunc, 'abcdef0123456789', { mode: 0o600 });
  let e3 = null; try { secretBox(trunc).dec('a.b.c'); } catch (e) { e3 = e; }
  ok(e3 instanceof SecretBoxError && e3.code === 'key-malformed', `a truncated key file ⇒ TYPED key-malformed, on dec() too (got ${e3 && e3.code})`);
  ok(fs.readFileSync(trunc, 'utf-8') === 'abcdef0123456789', 'the truncated file is untouched');
  // (d) EACCES — only observable as non-root
  const denied = path.join(dir, '.key-denied');
  const good = secretBox(denied); const blob = good.enc('secret');
  fs.chmodSync(denied, 0o000);
  let e4 = null; try { secretBox(denied).dec(blob); } catch (e) { e4 = e; }
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot) console.log('  … SKIP EACCES leg (running as root, chmod 000 does not deny)');
  else {
    ok(e4 instanceof SecretBoxError && e4.code === 'key-unreadable' && /EACCES/.test(e4.message), `EACCES ⇒ TYPED key-unreadable (got ${e4 && e4.code}: ${e4 && e4.message})`);
    fs.chmodSync(denied, 0o600);
    ok(secretBox(denied).dec(blob) === 'secret', 'once readable again the SAME key decrypts the old ciphertext — nothing was minted meanwhile');
  }
}

// ── ④ two minters racing land on ONE key ──
{
  const keyFile = path.join(ROOT, 'race', '.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  const a = secretBox(keyFile), b = secretBox(keyFile);
  const ka = a.readKey(), kb = b.readKey();
  ok(ka.equals(kb), 'two boxes minting "at once" over one path both read the key that landed (link refuses to clobber)');
  ok(a.dec(b.enc('cross')) === 'cross', 'and they interoperate');
}

// ── ⑤ THE STANDING NEGATIVE CONTROL: the bare catch mints on an injected EACCES ──
{
  const keyFile = path.join(ROOT, 'legacy', '.key');
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  const legacy = makeLegacy(fs, keyFile);
  const blob = legacy._enc('old secret');
  const before = fs.readFileSync(keyFile, 'utf-8');
  // Inject ONE read failure that is not ENOENT — the world's EMFILE/EIO/EACCES.
  let injected = 0;
  const fsShim = { ...fs, readFileSync: (...a) => { if (injected++ === 0) { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; } return fs.readFileSync(...a); }, writeFileSync: fs.writeFileSync.bind(fs) };
  const legacyInjected = makeLegacy(fsShim, keyFile);
  legacyInjected._enc('anything');           // the bare catch swallows EACCES and MINTS
  const after = fs.readFileSync(keyFile, 'utf-8');
  ok(before !== after, 'PRE-FIX: the bare catch replaced the key file on a non-ENOENT read failure');
  let dead = false; try { legacy._dec(blob); } catch { dead = true; }
  ok(dead, 'PRE-FIX: the old ciphertext no longer decrypts — the defect §14.7 describes, silent and permanent');
  // The same injection against secret-box (through a real, non-ENOENT
  // failure) was leg ③: typed error, bytes untouched. Say so beside the control.
  const keyFile2 = path.join(ROOT, 'legacy2', '.key');
  fs.mkdirSync(path.dirname(keyFile2), { recursive: true });
  const box = secretBox(keyFile2); const blob2 = box.enc('old secret');
  const bytes2 = fs.readFileSync(keyFile2, 'utf-8');
  fs.chmodSync(keyFile2, 0o000);
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  if (!isRoot) {
    let typed = null; try { secretBox(keyFile2).enc('x'); } catch (e) { typed = e; }
    fs.chmodSync(keyFile2, 0o600);
    ok(typed instanceof SecretBoxError && fs.readFileSync(keyFile2, 'utf-8') === bytes2 && secretBox(keyFile2).dec(blob2) === 'old secret',
      'FIXED: the same failure against secret-box is typed, the bytes are untouched and the old ciphertext still decrypts');
  } else { fs.chmodSync(keyFile2, 0o600); console.log('  … SKIP fixed-side EACCES twin (root)'); }
}

// ── ⑥ mounts is switched to the box ──
{
  const src = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf-8');
  ok(/require\('\.\/secret-box'\)/.test(src), 'src/mounts.js requires src/secret-box.js');
  ok(!/createCipheriv|createDecipheriv/.test(src), 'src/mounts.js carries NO inline cipher any more (the twin is gone, not duplicated)');
  ok(!/fs\.writeFileSync\(this\._keyFile/.test(src), 'src/mounts.js no longer writes its key file itself (the bare-catch mint is gone)');
  const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
  const dataDir = path.join(ROOT, 'mounts-data'); fs.mkdirSync(dataDir, { recursive: true });
  const mm = new MountManager({ dataDir, broadcast: () => {}, getSetting: () => undefined });
  const c = mm._enc('mount-secret');
  ok(fs.existsSync(path.join(dataDir, '.mounts-key')) && mm._dec(c) === 'mount-secret', 'MountManager._enc/_dec round-trip through the box on data/.mounts-key (its OWN key file, decision 24)');
  ok(makeLegacy(fs, path.join(dataDir, '.mounts-key'))._dec(c) === 'mount-secret', 'and the pre-fix reader decrypts what the switched MountManager wrote — no stored mount secret needs re-encrypting');
}

// ── ⑦ describeJsonError: a parse failure described WITHOUT the bytes that failed (r2) ──
// V8's SyntaxError message quotes the source around the error position, so a
// mistyped secret-bearing env block logged through `e.message` printed the
// tail of the secret. Both readers (the integrations store and
// mounts.drivePresets) log the helper's answer; test-integration-registry §4b
// drives them through the real modules — this is the primitive's own leg.
{
  const { describeJsonError } = require(path.join(REPO, 'src/secret-box.js'));
  const SECRET = 'sk-' + 'Q7f3'.repeat(8) + 'ZZZ99';
  let e = null; try { JSON.parse(`[{"k":"${SECRET}"},]`); } catch (x) { e = x; }
  ok(e instanceof SyntaxError && e.message.includes(SECRET.slice(-6)), 'CONTROL: the retired `e.message` carries the secret\'s tail (V8 quotes the bytes around the error)');
  const d = describeJsonError(e);
  ok(/^not valid JSON \(SyntaxError/.test(d) && !/"/.test(d) && !d.includes(SECRET.slice(-6)) && !d.includes(SECRET.slice(0, 6)), `the helper keeps the class and no quoted fragment (${d})`);
  let pos = null; try { JSON.parse('{"a":1,"b":}'); } catch (x) { pos = x; }
  const dp = describeJsonError(pos);
  ok(/not valid JSON \(SyntaxError/.test(dp) && (!/at position/.test(pos.message) || /at position \d+/.test(dp)), `the position is kept exactly when V8 states one (${dp})`);
  ok(describeJsonError(new Error('not an array')) === 'not an array' && describeJsonError('plain') === 'plain', 'a non-SyntaxError keeps its own message (it carries no input bytes)');
}


// ── tree: THE TREE IS NEVER WRITTEN (B-0220 generalized, batch r1) ──
// Measured HERE, while every patched copy this run made still exists (the exit
// handlers remove them — a census taken after exit passes on the pre-fix
// placement too). The copies used to be SIBLINGS inside src/ (gitignored, so
// a plain `git status` never saw them) and any suite scanning src/ beside this
// one counted them as product code; they are written to this process's scratch
// dir now (scripts/mutant-copy.mjs).
console.log('\ntree: the patched copies never touch the tree');
for (const r of copiesCensus(MUTSB.files, MUTSB.dir, REPO, { minCopies: 1 })) ok(r.pass, 'tree: ' + r.name, r.pass ? undefined : r.detail);

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
