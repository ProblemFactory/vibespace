// THE FORMS OF A SECRET ARE BUILT WHEN THE VAULT CHANGES, NEVER WHEN A TEXT IS MASKED (lane vault-masker-once — the owner's hub
// 2026-11-11, two named CPU samples: src/vault-run.js formsOf / percentForms / createRunMasker / jsonForms / base64Forms + the
// vault's decrypt held about three quarters of the main thread degraded, over half in an ordinary minute — the output belt
// (src/agent-output-belt.js maskForSink) decrypted every maskable entry and compiled every form of each for EVERY text it masked).
// A REAL vault engine (src/server/vault-engine.js, a fast KDF) over a scratch data dir holding INVENTED secrets only, reached by
// the belt through src/secret-box.js like every sink; a wrapping provider counts the decrypts the belt asks for.
//   ① N texts masked ⇒ ONE build: the maskable entries decrypted once and compileForms run once (counts, no clock)
//   ② a vault change ⇒ a rebuild, and the very next text sees it: an entry ADDED is masked, an EDITED one masked by its new
//      value and no longer by its old, a REMOVED one no longer masked
//   ③ the lock ⇒ nothing compiled is held (a door's lock and a quiet one); a text masked while locked masks no live value, as
//      before; the unlock builds nothing until a text asks
//   ④ EQUALITY: every text a sink writes is byte-identical to the per-call build (master's road: decrypt, compile, mask, the
//      shape census) — random texts carrying every form of every entry, its near-misses (one character changed, one short) and
//      pieces of other values, 0 differences
// Run: node scripts/test-vault-masker-once.mjs   (in-process, scratch dirs only)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const T0 = performance.now();

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => require(path.join(REPO, p));
const VE = r('src/server/vault-engine.js'), SB = r('src/secret-box.js'), belt = r('src/agent-output-belt.js'), VR = r('src/vault-run.js');
const { redactSecrets } = r('src/secret-shapes.js');

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : ''}`); } };
const quiet = { log() {}, warn() {}, error() {}, info() {} };
let seed = 0x2a11ce;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
const pick = (s) => s[Math.floor(rnd() * s.length)];
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SPECIAL = B62 + '+/=%&?#@!$-_.:;,"\\ <>\'';
const strOf = (n, set = B62) => { let s = ''; for (let i = 0; i < n; i++) s += pick(set); return s; };

const dataDir = scratch('vmo-vault'), wrapDir = scratch('vmo-wrap');
fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(wrapDir, { recursive: true });
const eng = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: quiet, idleTimer: false });
const PW = 'masker-once-' + crypto.randomBytes(6).toString('hex');
try {
  if (!(await eng.setup(PW)).ok) throw new Error('setup');
  if (eng.state() !== 'unlocked') await eng.unlock(PW);
  // 44 INVENTED entries — the owner's count, mixed lengths and kinds (a web login's password is masked by itself)
  const LENS = [12, 16, 20, 24, 32, 40, 48, 64, 80, 96];
  for (let i = 0; i < 30; i++) eng.secretPut(`apikey:mo-${i}`, 'mo-' + strOf(LENS[i % LENS.length] - 3));
  for (let i = 0; i < 8; i++) eng.secretPut(`secret:${crypto.randomBytes(5).toString('hex')}`, strOf([16, 33, 57, 90, 128, 160, 200, 24][i], i % 2 ? SPECIAL : B62));
  for (let i = 0; i < 4; i++) eng.secretPut(`web-login:https://site${i}.example.test#user${i}`, JSON.stringify({ username: `user${i}`, password: strOf(14 + 6 * i, SPECIAL) }));
  for (let i = 0; i < 2; i++) eng.secretPut(`totp:mo-${i}`, strOf(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'));
  const real = SB.vaultForDir(dataDir);
  let gets = 0;
  SB.registerVault(wrapDir, { ...real, secretGet: (n) => { gets++; return real.secretGet(n); } });   // the same engine, its decrypts counted
  let builds = 0;
  const compile0 = VR.compileForms;
  if (typeof compile0 === 'function') VR.compileForms = (...a) => { builds++; return compile0(...a); };
  const maskable = () => belt.maskableSecrets(real).filter((x) => Buffer.byteLength(x.value, 'utf8') >= VR.MIN_MASK_BYTES);
  const M0 = maskable();
  /** master's road, per call: decrypt, compile, mask, the shape census (src/agent-output-belt.js maskForSink at e74fabc6b) */
  const reference = (text, sec = maskable()) => { let s = String(text); if (sec.length) s = VR.maskText(s, sec); return redactSecrets(s).text; };   // the list (decrypted) and a FRESH compile per text
  const filler = () => { let s = ''; const n = 1 + Math.floor(rnd() * 6); for (let i = 0; i < n; i++) s += pick(['the build ', 'ok ', 'upload chunk ', 'retry 3 ', 'status 200 ', '\n', 'error: ', 'token is ', '{"k":"', '"} ', '%20', '&amp; ']); return s; };

  console.log('① N texts masked ⇒ ONE build');
  gets = 0; builds = 0;
  for (let i = 0; i < 50; i++) belt.maskForSink(filler() + M0[i % M0.length].value + filler(), { dataDir: wrapDir });
  ok(gets === M0.length, `50 texts ⇒ the ${M0.length} maskable entries decrypted ONCE (${gets} decrypts; a per-text build is ${50 * M0.length})`, { gets });
  ok(builds === 1, `50 texts ⇒ compileForms ran ONCE (${builds})`, { builds });
  ok(typeof real.masksHeld === 'function' && real.masksHeld() === true, 'the vault holds ONE compiled set while unlocked (masksHeld)');
  const t1 = `x ${M0[3].value} y`;
  ok(belt.maskForSink(t1, { dataDir: wrapDir }).includes(`[vault:${M0[3].label}]`) && !belt.maskForSink(t1, { dataDir: wrapDir }).includes(M0[3].value), 'a value in a text is masked by the shared set — its placeholder, never the value');

  console.log('② a vault change ⇒ a rebuild; the very next text sees it');
  const NEWV = 'mo-added-' + strOf(24), EDV = 'mo-edited-' + strOf(30), OLDV = M0.find((x) => x.label === 'apikey:mo-5').value;
  gets = 0; builds = 0;
  eng.secretPut('apikey:mo-added', NEWV);
  const a1 = belt.maskForSink(`added: ${NEWV}`, { dataDir: wrapDir });
  ok(a1 === 'added: [vault:apikey:mo-added]' && builds === 1 && gets === M0.length + 1, `an entry ADDED ⇒ the very next text masks it, after ONE rebuild (${builds} build, ${gets} decrypts)`, { a1, builds, gets });
  eng.secretPut('apikey:mo-5', EDV);
  const e1 = belt.maskForSink(`new ${EDV} old ${OLDV}`, { dataDir: wrapDir });
  ok(e1 === `new [vault:apikey:mo-5] old ${OLDV}` && builds === 2, 'an entry EDITED ⇒ the next text masks its NEW value and no longer its old one (the vault no longer holds it)', { e1, builds });
  eng.secretDrop('apikey:mo-added');
  const d1 = belt.maskForSink(`gone ${NEWV}`, { dataDir: wrapDir });
  ok(d1 === `gone ${NEWV}` && builds === 3, 'an entry REMOVED ⇒ the next text no longer masks it', { d1, builds });
  for (let i = 0; i < 20; i++) belt.maskForSink(`again ${EDV}`, { dataDir: wrapDir });
  ok(builds === 3, `…and no change ⇒ no rebuild: 20 more texts, still ${builds} builds`, { builds });
  eng.secretPut('apikey:mo-5', OLDV);   // put back: the corpus below runs over the 44

  console.log('③ the lock ⇒ nothing compiled is held');
  belt.maskForSink(`warm ${OLDV}`, { dataDir: wrapDir });
  const held0 = typeof real.masksHeld === 'function' ? real.masksHeld() : 'no masksHeld';
  eng.lock('door');
  const held1 = typeof real.masksHeld === 'function' ? real.masksHeld() : 'no masksHeld';
  ok(held0 === true && held1 === false, `a lock DROPS the compiled set (held ${held0} → ${held1})`, { held0, held1 });
  gets = 0; builds = 0;
  const L1 = belt.maskForSink(`locked ${OLDV}`, { dataDir: wrapDir });
  ok(L1 === `locked ${OLDV}` && gets === 0 && builds === 0 && (typeof real.masksHeld !== 'function' || real.masksHeld() === false), 'a text masked while LOCKED masks no live value (as before), decrypts nothing, builds nothing', { L1, gets, builds });
  await eng.unlock(PW);
  ok(typeof real.masksHeld === 'function' && real.masksHeld() === false && builds === 0, 'the unlock builds nothing until a text asks');
  belt.maskForSink(`after ${OLDV}`, { dataDir: wrapDir });
  ok(builds === 1 && real.masksHeld() === true, '…the first text after it builds ONE set');
  eng.lock('shutdown', { quiet: true });
  ok(typeof real.masksHeld === 'function' && real.masksHeld() === false, 'a QUIET lock (the shutdown\'s, which runs no lock hooks) drops it too');
  await eng.unlock(PW);

  console.log('④ EQUALITY — every text byte-identical to the per-call build (master\'s road)');
  const M = maskable();
  const corpus = [];
  for (const x of M) {
    const forms = VR.formsOf(x.value).map((f) => f.text);
    corpus.push(forms.map((f) => { const k = Math.floor(rnd() * f.length); return filler() + f + filler() + f.slice(0, -1) + filler() + f.slice(0, k) + (f[k] === 'Q' ? 'R' : 'Q') + f.slice(k + 1); }).join('') + filler());   // every form of it, each one character short, each with one character changed
  }
  for (let i = 0; i < 30; i++) {   // mixes: pieces of several values, forms of others, shapes the census redacts
    let s = '';
    for (let j = 0; j < 6; j++) { const x = pick(M); const f = pick(VR.formsOf(x.value)).text; s += filler() + (rnd() < 0.5 ? f : f.slice(0, Math.max(1, Math.floor(f.length / 2)))) + (rnd() < 0.2 ? ' API_KEY=sk-live-' + strOf(24) : ''); }
    corpus.push(s);
  }
  let diffs = 0, first = null, hits = 0;
  for (const t of corpus) { const a = belt.maskForSink(t, { dataDir: wrapDir }), b = reference(t, M); if (a !== b) { diffs++; if (!first) first = { t: t.slice(0, 200), a: a.slice(0, 200), b: b.slice(0, 200) }; } if (a.includes('[vault:')) hits++; }
  ok(diffs === 0 && hits > M.length, `${corpus.length} texts carrying every form of all ${M.length} values, their near-misses and mixes ⇒ 0 differences from the per-call build (${hits} texts masked something)`, first || { diffs, hits });
  const big = corpus.join('\n');
  ok(belt.maskForSink(big, { dataDir: wrapDir }) === reference(big), `…and one ${Math.round(big.length / 1024)} KB text holding all of them: identical`);
  ok(VR.isCompiledForms && !VR.isCompiledForms(M) && VR.maskText('z ' + M[0].value, M) === VR.maskText('z ' + M[0].value, VR.compileForms(M)), 'a masker from a compiled set and one from the list mask alike (createRunMasker takes either)');
  VR.compileForms = compile0;
} catch (e) {
  ok(false, 'the run did not throw', e && e.stack);
} finally {
  try { eng.close(); } catch { }
}
console.log(`\n${fail ? '✗' : '✓'} test-vault-masker-once: ${pass} passed, ${fail} failed`);
if (fail) { console.log('FAIL'); process.exit(1); } else { console.log(`ALL PASS (${pass}) — ${Math.round(performance.now() - T0)} ms`); process.exit(0); }
