// THE SHAPE CENSUS AS A SHARED MASKER + THE OUTPUT BELT'S LEG (lane agent-output-sinks; design q-043 D3 ③).
//
// src/secret-shapes.js `redactSecrets` is THE ONE rule exit output already passes (exit-reach.js) and that the
// agent-output belt (src/agent-output-belt.js) now also runs over the five sink writers (task progress, For-you, a
// status notice, a message, a job log). This suite pins it as a STANDALONE shared masker (its exhaustive R1–R8 table is
// test-exit-run's; here is the module's contract + the belt's new leg): a secret shape's value goes, its NAME stays, a
// non-secret survives, it is idempotent and bounded, and the belt applies it (and chains the vault-run live-value masker
// when it is present — the P0-e seam, existsSync-guarded).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { StringDecoder } from 'node:string_decoder';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => require(path.join(REPO, p));

// lane vault-scrub-forms (q-043 verify M1): the value in every NEW spelling a real producer prints by itself — built here
// with Node's own codecs or from the spec, never with src/vault-run.js
const spellingsOf = (v) => {
  const b = Buffer.from(v), dec = (x) => { const d = new StringDecoder('utf8'); return d.write(x) + d.end(); };
  const bits = [...b].map((x) => x.toString(2).padStart(8, '0')).join('');
  let b32 = ''; for (let i = 0; i < bits.length; i += 5) b32 += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  const qp = [...b].map((x) => (x >= 33 && x <= 126 && x !== 61 ? String.fromCharCode(x) : '=' + x.toString(16).padStart(2, '0').toUpperCase()));
  return [
    ['UTF-16LE (PowerShell Out-File)', dec(Buffer.from(v, 'utf16le'))], ['UTF-16BE', dec(Buffer.from(v, 'utf16le').swap16())],
    ['base32 (oathtool -v)', b32 + '='.repeat((8 - (b32.length % 8)) % 8)], ['base32, lower-case, unpadded', b32.toLowerCase()],
    ['quoted-printable, a soft break inside', qp.slice(0, 9).join('') + '=\r\n' + qp.slice(9).join('')],
    ['\\xNN every byte', [...b].map((x) => '\\x' + x.toString(16).padStart(2, '0')).join('')], ['\\u{…} every character', [...v].map((c) => '\\u{' + c.codePointAt(0).toString(16) + '}').join('')],
    ['HTML entities &#NN;', [...v].map((c) => '&#' + c.codePointAt(0) + ';').join('')], ['colour escapes every 4 characters', [...v].map((c, i) => (i && i % 4 === 0 ? '\x1b[0m' : '') + c).join('')],
    ['base64 wrapped every 20 columns', b.toString('base64').replace(/(.{20})(?=.)/g, '$1\n')],
  ];
};
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const { redactSecrets, REDACTED, INPUT_MAX } = r('src/secret-shapes.js');
const belt = r('src/agent-output-belt.js');
const SB = r('src/secret-box.js');
const { scratch } = await import('./scratch.mjs');

// values built at runtime (secret-scan safe)
const MAT = crypto.randomBytes(20).toString('hex');
const PAT = ['gh', 'p', '_'].join('') + MAT;                 // R4 known prefix
const BEAR = 'Authorization: Bearer ' + crypto.randomBytes(16).toString('hex');   // R3 HTTP credential
const KVV = crypto.randomBytes(16).toString('hex'); const KV = 'api_token=' + KVV; // R2 secret-named KV
const PLAIN = 'the quick brown fox ' + crypto.randomBytes(3).toString('hex');      // a non-secret line

console.log('§1 redactSecrets — the shared masker’s contract (R1–R8 exhaustively: test-exit-run)');
{
  const pat = redactSecrets(PAT);
  ok(!pat.text.includes(MAT) && pat.text.includes(REDACTED) && pat.redacted >= 1, 'a known prefix: the material goes, the prefix stays');
  ok(redactSecrets(BEAR).text.includes(REDACTED) && !redactSecrets(BEAR).text.includes(BEAR.split(' ').pop()), 'an HTTP Bearer credential is redacted');
  const kv = redactSecrets(KV);
  ok(!kv.text.includes(KVV) && kv.text.includes('api_token'), 'a secret-named KV: the value goes, the name stays');
  ok(redactSecrets(PLAIN).text === PLAIN && redactSecrets(PLAIN).redacted === 0, 'a non-secret line is returned unchanged (a false hide costs, so the rule is narrow)');
  ok(redactSecrets(redactSecrets(PAT).text).text === redactSecrets(PAT).text, 'idempotent: a redacted text redacts to itself');
  // lane job-notify-user r6: a letters-and-digits family ends where its letters end — a `-` / `_` after it is the text's (a job named
  // «<token> deploy» is STORED `<token>-deploy`; the old common tail `(?![A-Za-z0-9_\-])` left it whole: the ONE name accessor showed it)
  const tail = [PAT + '-deploy', 'deploy-' + PAT + '-2', PAT + '_backup'].map((t) => redactSecrets(t).text);
  const OLD_TAIL = new RegExp('\\bgh[pousr]_[A-Za-z0-9]{20,255}(?![A-Za-z0-9_\\-])');
  ok(tail.every((t) => !t.includes(MAT) && t.includes(REDACTED)) && tail[0] === 'ghp_' + REDACTED + '-deploy' && OLD_TAIL.test(PAT) && !OLD_TAIL.test(PAT + '-deploy') && redactSecrets('sk-' + MAT + '-x').text === 'sk-' + REDACTED,
    'a known prefix followed by `-` / `_` (a job name `<token>-deploy`, a suffix `-2`) is redacted — the prefix and the words after stay; a family whose material holds `-` still takes its whole run', tail);
  // lane job-notify-user r7 (accept-r6 confirmed 0): EVERY family its own tail — the material's own class decides where it ends
  // (a run at the first character outside ITS class, a fixed-length family after its length); r6 moved five families and AIza /
  // github_pat_ / xox?- stayed raw before a `-` / `_`. Every family × {`-`, `_`, a word character, the end} and after a `_`
  // (`ci_<token>`: `\b` kept it whole): the material never shows; a tail its class does not hold stays in clear
  const AN = (n) => { let o = ''; while (o.length < n) o += crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, ''); return o.slice(0, n); };
  const UP = (n) => { let o = ''; while (o.length < n) o += crypto.randomBytes(24).toString('hex').toUpperCase(); return o.slice(0, n); };
  const FAM = [   // [family, prefix, material, the class holds '-', holds '_', fixed length]
    ...['p', 'o', 'u', 's', 'r'].map((x) => ['gh' + x + '_', ['g', 'h', x, '_'].join(''), AN(36), false, false, false]),
    ['github_pat_', ['git', 'hub_pat_'].join(''), AN(22) + '_' + AN(59), false, true, false],
    ['sk_live_', ['sk', '_live_'].join(''), AN(24), false, false, false], ['rk_test_', ['rk', '_test_'].join(''), AN(24), false, false, false],
    ['AKIA', ['AK', 'IA'].join(''), UP(16), false, false, true], ['ASIA', ['AS', 'IA'].join(''), UP(16), false, false, true],
    ['npm_', ['np', 'm_'].join(''), AN(36), false, false, true], ['hf_', ['h', 'f_'].join(''), AN(30), false, false, false],
    ['AIza', ['AI', 'za'].join(''), AN(35), true, true, true], ['sk-', ['s', 'k-'].join(''), AN(40), true, true, false],
    ...['a', 'b', 'p', 'r', 's'].map((x) => ['xox' + x + '-', ['xo', 'x', x, '-'].join(''), '1234567890-' + AN(24), true, false, false]),
    ['xoxe-', ['xo', 'xe-'].join(''), '1-' + AN(30), true, true, false], ['xoxe.', ['xo', 'xe.'].join(''), AN(30), true, true, false],
    ['glpat-', ['gl', 'pat-'].join(''), AN(20), true, true, false],
    ...['st', 'mt', 'wh'].map((x) => ['vs' + x + '_', ['v', 's', x, '_'].join(''), AN(32), true, true, false]),
    ['vswp_', ['vs', 'wp_'].join(''), AN(40), true, true, false], ['jbt_', ['jb', 't_'].join(''), AN(32), true, true, false],
  ];
  const famBad = [];
  for (const [fam, pre, mat, dash, under, fixed] of FAM) {
    const tok = pre + mat, probe = mat.slice(-12);
    for (const [tail, kept] of [['-deploy', !dash], ['_prod', !under], ['x', fixed], ['', false]]) {
      const out = redactSecrets('job ' + tok + tail).text;
      if (out.includes(probe) || !out.includes(REDACTED)) famBad.push(`${fam} + «${tail}» → ${out}`);
      else if (kept && !out.endsWith(REDACTED + tail)) famBad.push(`${fam} + «${tail}»: the tail its class does not hold is not kept → ${out}`);
    }
    for (const lead of ['ci_', '-', ' ']) { const out = redactSecrets(lead + tok).text; if (out.includes(probe)) famBad.push(`«${lead}» + ${fam} → ${out}`); }
  }
  ok(!famBad.length, `EVERY family its own tail: ${FAM.length} families × {-, _, a word character, the end} and after \`_\` / \`-\` / a blank — the material hidden, a tail its class does not hold kept in clear${famBad.length ? ' — ' + famBad.join(' | ') : ''}`);
  const FP = ['my-deploy', 'gh-pages', 'npm-run-all', 'npm_config_cache', 'sk-learn', 'hf_hub_download', 'xoxo-gossip', 'AKIA-docs', 'ASIAN_FOOD', 'glpat-x', 'jbt_x', 'deploy-2'];
  ok(FP.every((t) => redactSecrets('run ' + t + ' now').text === 'run ' + t + ' now'), 'the false-positive controls stay in clear (my-deploy, gh-pages, npm-run-all, npm_config_cache, sk-learn, …)', FP.map((t) => redactSecrets(t).text));
  const shp = redactSecrets('x');
  ok(typeof shp.text === 'string' && typeof shp.redacted === 'number', 'returns { text, redacted }');
  ok(redactSecrets('').text === '' && redactSecrets(null).text === '', 'empty / null is handled');
  const huge = 'a'.repeat(INPUT_MAX + 5000);
  ok(redactSecrets(huge).text.length <= INPUT_MAX, 'bounded at INPUT_MAX (never parsed whole past it)');
}

console.log('§2 THE OUTPUT BELT’S LEG — maskForSink applies the shape rule (and never throws)');
{
  ok(belt.maskForSink('ship it: ' + PAT, {}).includes(REDACTED), 'the belt redacts a secret shape in a sink text');
  ok(belt.maskForSink(PLAIN, {}) === PLAIN, 'the belt leaves a non-secret line untouched');
  ok(belt.maskForSink(null, {}) === '' && belt.maskForSink(12345, {}) === '12345', 'the belt coerces odd input, never throws');
  ok(typeof belt.maskForSink('x'.repeat(INPUT_MAX + 1000), {}) === 'string', 'the belt handles an over-long text');
}

console.log('§3 THE BELT’S MASKABLE-ENTRY ENUMERATION — host: / file: are never maskable');
{
  const dir = scratch('ss-vault');
  fs.mkdirSync(dir, { recursive: true });
  const VAL = 'LV' + crypto.randomBytes(12).toString('hex');
  SB.registerVault(dir, {
    state: () => 'unlocked',
    secretNames: () => [{ name: 'apikey:k', at: 1 }, { name: 'host:h', at: 2 }, { name: 'file:f', at: 3 }],
    secretGet: (n) => ({ ok: true, value: Buffer.from(VAL + ':' + n, 'utf8') }),
  });
  const labels = belt.maskableSecrets(SB.vaultForDir(dir)).map((x) => x.label);
  ok(labels.includes('apikey:k'), 'an apikey: entry is maskable');
  ok(!labels.includes('host:h') && !labels.includes('file:f'), 'host: and file: entries are never maskable (the vault never shows them to an agent)');

  // THE LIVE-VALUE LEG (vault-run.js is sibling P0-e; existsSync-guarded until the rebase)
  if (fs.existsSync(path.join(REPO, 'src/vault-run.js'))) {
    const masked = belt.maskForSink('value is ' + VAL + ':apikey:k here', { dataDir: dir });
    ok(!masked.includes(VAL + ':apikey:k') && masked.includes('[vault:apikey:k]'), 'the live-value leg replaces an apikey: value with its [vault:<entry>] placeholder');
    // lane vault-scrub-forms: the belt masks with vault-run.js's ONE table — every new spelling of the value goes whole
    const SP = spellingsOf(VAL + ':apikey:k'), bad = SP.filter(([, s]) => belt.maskForSink('<' + s + '>', { dataDir: dir }) !== '<[vault:apikey:k]>').map(([n]) => n);
    ok(!bad.length, `the belt masks the value in ${SP.length} more spellings a real tool prints (UTF-16, base32, quoted-printable, escapes, entities, colours, wrapped base64) — each text is exactly «<[vault:apikey:k]>»${bad.length ? ' — NOT: ' + bad.join(', ') : ''}`);
  } else {
    console.log('  — SKIP: src/vault-run.js (sibling vault-run-model P0-e) not on this base; the live-value leg activates at the rebase (verified by hand against 5470a4e1 — see the lane report)');
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
