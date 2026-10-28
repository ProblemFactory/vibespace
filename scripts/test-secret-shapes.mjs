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

{
  const S = r('src/secret-shapes.js');
  // round 21/23 (B-5a9a + MAJOR): inside a JSON document (a quoted key `"name":`) a bare value closes at `,` `}` `]` `)` so a one-line JSON is never swallowed; on a dotenv / shell / `--flag=value` / bare line the value is a STRING redacted WHOLE to the line end (never cut at a delimiter — r21 cut `DB_PASSWORD=Xy)9#kq]Lm2v` at the `)` and leaked the tail)
  const j = S.redactSecrets('{"use_auth":false,"token":"abc123def456ghi","ok":true,"n":5}').text;
  ok(j === '{"use_auth":false,"token":"«redacted»","ok":true,"n":5}', 'R2 keeps a one-line JSON WHOLE: the quoted token is redacted while the typed values (use_auth:false, ok:true, n:5 — round 22) and the closing `}` survive (B-5a9a: the swallow is gone)', j);
  const brace = S.redactSecrets('{"password":hunter2hunter2}').text;
  ok(brace === '{"password":«redacted»}', 'R2 bare value stops at `}` — the object close survives (B-5a9a: not swallowed to the line end)', brace);
  // round 23 (MAJOR, RED on 4ff55fb4): a dotenv / shell / `--flag=value` value is a STRING — redacted WHOLE to the line end, never cut at `,` `)` `]` and never kept because it is numeric
  const dotenv1 = S.redactSecrets('export DB_PASSWORD=Xy)9#kq]Lm2v').text;
  ok(dotenv1 === 'export DB_PASSWORD=«redacted»', 'round 23 (MAJOR): a dotenv value holding a `)` / `]` is redacted WHOLE (4ff55fb4 cut it at the `)` and leaked `9#kq]Lm2v`)', dotenv1);
  const numKey = '12345678' + '90123456';   // a 16-digit value built by concatenation (no literal `API_KEY=<digits>` in source — lane secret-scan)
  const dotenv2 = S.redactSecrets('DB_PASSWORD=' + '84726193' + '\nAPI_KEY=' + numKey).text;
  ok(dotenv2 === 'DB_PASSWORD=«redacted»\nAPI_KEY=«redacted»', 'round 23 (MAJOR): a NUMERIC dotenv password is redacted (4ff55fb4 kept the 8-digit value — a value under `=` is a string, not a typed number)', dotenv2);
  const dcomma = S.redactSecrets('password=s3cr3t,Tail-of-it').text;
  ok(dcomma === 'password=«redacted»', 'round 23: a `=` value is NOT cut at `,` — the whole tail is hidden (4ff55fb4 kept `,Tail-of-it`)', dcomma);
  const flagLine = S.redactSecrets('--allowPassword=true:\nnext line stays\nand this one too').text;
  ok(flagLine === '--allowPassword=«redacted»\nnext line stays\nand this one too', 'round 23 (B-5a9a\u2019s own shape): a `--flag=value` value is redacted WHOLE to the line end (not cut at `:`) and the NEXT lines are not swallowed', flagLine);
  const jcomma = S.redactSecrets('{"token":abc123def4567,"id":42}').text;
  ok(jcomma === '{"token":«redacted»,"id":42}', 'round 23: inside a JSON document (a quoted key) a BARE value still closes at `,` — the one-line JSON is not swallowed', jcomma);
  const bearer = S.redactSecrets('Authorization: Bearer abc123def456ghijkl and more').text;
  ok(bearer === 'Authorization: «redacted»', 'a space is still NOT a delimiter — the whole line-tail after an auth name is redacted (R2 hides more, never less; the `Bearer <token> and more` goes to the line end)', bearer);
  // round 22: in the GENERIC name-based pass, a BARE value a parser TYPES as a boolean / number / null under a secret-named key is NOT a secret — it stays; a quoted string or a real token stays REDACTED (fail-closed). RED on a51611f2 (which redacted `false`/`5`/`null` by name).
  const typed = S.redactSecrets('{"use_auth":false,"token":"abc123def456ghi","count":5,"ttl":null,"enabled":true,"ratio":-2.5}').text;
  ok(typed === '{"use_auth":false,"token":"«redacted»","count":5,"ttl":null,"enabled":true,"ratio":-2.5}', 'round 22: a boolean / number / null under a secret-named key stays (not a secret); a quoted string value under one is still redacted', typed);
  const yaml = S.redactSecrets('config:\n  password: false\n  secret: 42\n  api_key: hunter2hunter2').text;
  ok(yaml === 'config:\n  password: false\n  secret: 42\n  api_key: «redacted»', 'round 22/25: the typed rule holds for an INDENTED YAML mapping — a bool / number stays, a real value is redacted', yaml);
  // round 25 (item 4, refuted-but-real; RED on a1f79c42): the typed skip is ONLY inside a PROVABLE document — a lone `NAME: value`, an HTTP header or prose redacts a numeric secret WHOLE (daade1a7 did; r22's `:`-wide skip leaked it); a JSON quoted key and an INDENTED YAML mapping still keep a typed bool / number
  const belt = (t) => S.redactSecrets(t).text;
  ok(belt('DB_PASSWORD: 84726193') === 'DB_PASSWORD: «redacted»'
    && belt('> X-Api-Key: 8472619384726193') === '> X-Api-Key: «redacted»'
    && belt('the wifi password: 84726193') === 'the wifi password: «redacted»'
    && belt('Authorization: 8472619384726193') === 'Authorization: «redacted»'
    && belt('password: 84726193') === 'password: «redacted»'
    && belt('{"password": 84726193}') === '{"password": 84726193}'
    && belt('  password: 84726193') === '  password: 84726193',
    'round 25 (item 4): a numeric secret on a header / prose / lone `NAME: value` line is redacted WHOLE; a JSON quoted key ({"password": 5}) and an indented YAML mapping (  password: …) still keep a typed value', { header: belt('> X-Api-Key: 8472619384726193'), lone: belt('password: 84726193'), json: belt('{"password": 84726193}'), indented: belt('  password: 84726193') });
  const quotedFalse = S.redactSecrets('{"key":"false"}').text;
  ok(quotedFalse === '{"key":"«redacted»"}', 'round 22 (fail-closed): a QUOTED "false" is a string the parser cannot type as a boolean — it stays redacted (a secret may spell itself anything)', quotedFalse);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
