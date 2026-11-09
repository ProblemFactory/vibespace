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
import os from 'node:os';
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

// ── lane mask-value-shape (the owner 2026-11-07, «这种情况你觉得应该处理吗？URL被替换和redact了») ──
// An agent filed a For-you ask carrying gcloud's `--no-launch-browser` sign-in URL; the belt masked `token_usage=remote` (a
// PUBLIC parameter whose NAME holds «token») and the card drew a whole-looking link to a broken target.
// LAW 1 (r2, restated) the belt never judges a VALUE to keep it — it judges the NAME: a credential word must be the name's HEAD
// (or sit under a container head); one that only modifies a DESCRIPTOR head names a fact about a credential and is public.
// LAW 2 a masked link (or path) never looks whole · LAW 3 ONE belt
console.log('lane mask-value-shape: THE NAME GRAMMAR (two censuses) + THE PUBLIC-URL CORPUS + A MASKED LINK IS WORDS');
{
  const SS = r('src/secret-shapes.js'), J = JSON.stringify;
  // an export the tree lacks (the base, r1) reds its legs BY NAME — never a crash that names none
  const fnOf = (f) => (typeof f === 'function' ? f : () => undefined);
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('mvs', REPO);
  const FY = await import(path.join(REPO, 'src/lib/foryou-links.js'));
  const DM = r('src/decision-model.js');
  // the owner's URL, retyped from his shot (Google's PUBLIC gcloud client id; state / code_challenge are per-flow public nonces —
  // joined at runtime all the same, the hygiene law for any token-shaped run)
  const OWNER = ['https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=32555940559.apps.googleusercontent.com',
    '&redirect_uri=https%3A%2F%2Fsdk.cloud.google.com%2Fauthcode.html&scope=openid+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email',
    '+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcloud-platform+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fappengine.admin',
    '+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fsqlservice.login+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcompute',
    '+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Faccounts.reauth&state=', 'G42wCKQftAKJ8', 'hXM23vRQmZRemWgo1',
    '&prompt=consent&token_usage=remote&access_type=offline&code_challenge=', '84YRSvbJxBuQKBxdqc59', 'MbopMncKgHbHST40pDWDBU4',
    '&code_challenge_method=S256'].join('');
  const seeded = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const rand = seeded(20261107), pick = (a) => a[Math.floor(rand() * a.length)], runOf = (alpha, n) => Array.from({ length: n }, () => pick(alpha)).join('');
  const LOW = 'abcdefghijklmnopqrstuvwxyz', B62 = LOW + LOW.toUpperCase() + '0123456789', HEX = '0123456789abcdef';
  const sig64 = runOf(HEX, 64), tok = runOf(B62, 32), keyId = ['AK', 'IAIOSFODNN7EXAMPLE'].join('');
  const beltOver = (shapes) => { const b = fs.readFileSync(path.join(REPO, 'src/agent-output-belt.js'), 'utf8'); return M.load('src/agent-output-belt.js', b.replace("require('./secret-shapes.js')", `require(${J(shapes)})`), 'belt'); };
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');

  // LAW 1 — THE NAME GRAMMAR, the table
  const HOLDERS = ['access_token', 'api_key', 'auth_token', 'REDIS_AUTH', 'BASIC_AUTH', 'client_secret', 'X-Amz-Signature', 'X-Amz-Credential', 'X-Amz-Security-Token', 'token', 'auth', 'key', 'session_id', 'token_value', 'key_id', 'SECRET_KEY_BASE', 'token_blob', 'auth_payload', 'key_material', 'client-key-data', '_authToken', 'allowPassword', 'DB_PASSWORD', 'apiKey', 'credentials', 'ADMIN_CREDENTIALS', 'JUPYTER_TOKEN', 'VAULT_DEV_ROOT_TOKEN_ID', 'XDG_SESSION_ID', 'auth_uri', 'token_uri', 'token_url', 'password_reset_url', 'SECRET_WEBHOOK_URL', 'AUTH_ENDPOINT'];   // r4 (α): an address under a credential word holds
  const PUBLIC_NAMES = ['token_usage', 'token_type', 'token_access_type', 'auth_type', 'TOKEN_TTL', 'SSH_AUTH_SOCK', 'secret_scanning', 'secretName', 'password_policy', 'pass_through'];
  const holder = fnOf(SS.holderName);
  const wrongH = HOLDERS.filter((n) => holder(n) !== true), wrongP = PUBLIC_NAMES.filter((n) => holder(n) !== false);
  ok(wrongH.length === 0 && wrongP.length === 0 && holder('client_id') === false && holder('state') === false,
    `LAW 1 THE NAME GRAMMAR: ${HOLDERS.length} names HOLD a secret (a credential HEAD, a container head, any non-descriptor head — fail closed), ${PUBLIC_NAMES.length} DESCRIBE one (a credential word modifying a descriptor head); no credential word ⇒ none${wrongH.length ? ' — not holders: ' + wrongH.join(', ') : ''}${wrongP.length ? ' — not public: ' + wrongP.join(', ') : ''}`);
  const CH = SS.CONTAINER_HEADS || new Set(), DH = SS.DESCRIPTOR_HEADS || new Set();
  ok(CH.size > 0 && DH.size > 0 && ![...CH].some((h) => DH.has(h)) && ![...DH].some((h) => SS.SECRET_WORDS.has(h)), 'THE GRAMMAR\'S TABLES: the container heads and the descriptor heads are disjoint, and no credential word is a descriptor (a bare token / key / auth is always its own head)');

  // LAW 1 — CENSUS (A) THE REGRESSION CENSUS: a value is never a reason to keep — every class of value, a person's or a
  // program's, under every HOLDER shape is masked: 0 leaks by construction (r1's floor kept 86–98 % of most of these)
  const WORDS = ['changeme', 'letmein', 'supersecret', 'foobared', 'sunshine', 'monkey', 'dragon', 'football', 'baseball', 'master', 'shadow', 'trustno', 'welcome', 'password', 'qwerty', 'iloveyou', 'princess', 'admin', 'secret', 'remote', 'offline', 'consent', 'orange', 'purple', 'river', 'mountain', 'coffee', 'garden', 'silver', 'winter', 'summer', 'autumn', 'thunder', 'falcon', 'harbor', 'lantern', 'meadow', 'pepper', 'rocket', 'tiger', 'velvet', 'window', 'yellow', 'zebra', 'anchor', 'bridge', 'candle', 'dolphin', 'engine', 'forest'];
  const DEFAULT_PAIRS = ['admin:admin', 'root:toor', 'admin:changeme', 'admin:password', 'root:root', 'user:user', 'guest:guest', 'admin:letmein', 'admin:sunshine', 'test:test', 'pi:raspberry', 'ubnt:ubnt', 'admin:1234', 'root:calvin', 'admin:admin123', 'oracle:oracle', 'postgres:postgres', 'sa:sa', 'elastic:changeme', 'kibana:changeme', 'admin:secret', 'vagrant:vagrant', 'ftp:ftp', 'support:support', 'manager:manager', 'demo:demo', 'operator:operator', 'tomcat:tomcat', 'jenkins:jenkins', 'nagios:nagios'];
  const CV = () => pick('bcdfghjklmnprstvz') + pick('aeiou');
  const CLASSES = {
    'user:pass pairs (word:word)': () => pick(WORDS) + ':' + pick(WORDS),
    'one dictionary word': () => pick(WORDS),
    'diceware (4 words)': () => [0, 1, 2, 3].map(() => pick(WORDS)).join(pick(['-', '_', ' '])),
    'pwgen-style (pronounceable + digits)': () => CV() + CV() + CV() + CV() + runOf('0123456789', 2),
    'proquint (cvcvc-cvcvc)': () => [0, 1].map(() => pick('bdfghjklmnprstvz') + pick('aiou') + pick('bdfghjklmnprstvz') + pick('aiou') + pick('bdfghjklmnprstvz')).join('-'),
    'the 30 default pairs': () => pick(DEFAULT_PAIRS),
    'lowercase ×4…×20': () => runOf(LOW, 4 + Math.floor(rand() * 17)),
    'UPPERCASE ×8': () => runOf(LOW.toUpperCase(), 8),
    'Capitalized word': () => { const w = pick(WORDS); return w[0].toUpperCase() + w.slice(1); },
    'xxxx-xxxx': () => runOf(LOW, 4) + '-' + runOf(LOW, 4),
    'a small number (≤ 5 digits)': () => String(Math.floor(rand() * 99999)),
    'a path': () => '/' + pick(WORDS) + '/' + pick(WORDS),
    'a word that spells a typed scalar': () => pick(['true', 'false', 'null', 'yes', 'none']),
  };
  // every holder SHAPE the acceptance attacked: dotenv, export, a --flag, JSON, a URL query (first and later), a form body
  const SHAPES = [(v) => `api_key=${v}`, (v) => `auth_token=${v}`, (v) => `export REDIS_AUTH=${v}`, (v) => `BASIC_AUTH=${v}`, (v) => `run --auth=${v}`, (v) => `ADMIN_CREDENTIALS=${v}`, (v) => `ENCRYPTION_KEY=${v}`, (v) => `JUPYTER_TOKEN=${v}`,
    (v) => `{"apiKey": ${J(v)}}`, (v) => `{"auth": ${J(v)}, "n": 1}`, (v) => `credentials=${v}`, (v) => `https://notebook.example/lab?token=${encodeURIComponent(v)}`, (v) => `https://x.example/a?user=bob&auth=${encodeURIComponent(v)}`, (v) => `grant=1&api_key=${encodeURIComponent(v)}&scope=email`];
  const leaksOf = (S, scrub) => { const out = {}; for (const [k, mk] of Object.entries(CLASSES)) { let leak = 0, n = 0; for (let i = 0; i < 160; i++) { const v = mk(), text = SHAPES[i % SHAPES.length](v); const o = scrub ? scrub(text) : S.redactSecrets(text).text; n++; if (o.includes(v) || o.includes(encodeURIComponent(v))) leak++; } out[k] = { leak, n }; } return out; };
  const regLine = (res) => Object.entries(res).map(([k, v]) => `${k} ${(100 * v.leak / v.n).toFixed(2)} %`).join(' · ');
  const regA = leaksOf(SS);
  ok(Object.values(regA).every((v) => v.leak === 0), `CENSUS (A) REGRESSION — ${Object.keys(CLASSES).length} value classes × ${SHAPES.length} holder shapes (${Object.values(regA).reduce((a, v) => a + v.n, 0)} texts) leak 0: ${regLine(regA)}`);
  const regDM = leaksOf(SS, (text) => DM.scrub(text, 2000));
  ok(Object.values(regDM).every((v) => v.leak === 0), `CENSUS (A) through decision-model's ONE SCRUB (redactSecrets runs:true, the vendor-bound text): leak 0 of ${Object.values(regDM).reduce((a, v) => a + v.n, 0)}`);
  // RED CONTROL: a mutant that re-adds a value floor (keeps a lowercase word under a holder name) — census (A) goes red by name
  const floorMut = M.load('src/secret-shapes.js', SRC.replace('    n++;\n    out += text.slice(last, headEnd)', '    if (/^[a-z]{4,12}$/.test(inner)) { KV_HEAD.lastIndex = valEnd; continue; }\n    n++;\n    out += text.slice(last, headEnd)').replace('    const keep = queryTail(text, vs, ve, at(text, m.index));', '    if (/^[a-z]{4,12}$/.test(text.slice(vs, ve))) { QUERY_HEAD_RE.lastIndex = ve; continue; }\n    const keep = queryTail(text, vs, ve, at(text, m.index));'), 'valuefloor');
  const regMut = leaksOf(floorMut);
  ok(floorMut.redactSecrets('api_key=changeme').text === 'api_key=changeme' && regMut['one dictionary word'].leak > 0, `RED CONTROL (a value floor re-added): api_key=changeme kept, census (A) leaks — one dictionary word ${(100 * regMut['one dictionary word'].leak / regMut['one dictionary word'].n).toFixed(1)} %`);

  // LAW 1 — CENSUS (B) THE PUBLIC CENSUS: the owner's URL through THE BELT and through the For-you writer — byte-identical
  ok(belt.maskForSink(OWNER) === OWNER, 'CENSUS (B): the owner\'s URL through maskForSink is BYTE-IDENTICAL (token_usage=remote — a usage, not a token)');
  {
    const UT = r('src/user-todos.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-mvs-'));
    try {
      const m = new UT.UserTodoManager({ dataDir: dir, expirySweepMs: 0 });
      const it = m.add('claude:mvs', { text: 'Open this link and paste the code back', detail: '链接（gcloud --no-launch-browser 流程）： ' + OWNER + ' — 我拿到码后写入', origin: 'agent' });
      const u = new URL(it.detail.split(' ').find((w) => w.startsWith('https://')));
      ok(it.detail.includes(OWNER) && u.searchParams.get('token_usage') === 'remote' && u.searchParams.get('access_type') === 'offline' && u.searchParams.get('code_challenge_method') === 'S256' && [...u.searchParams.keys()].length === 10,
        'CENSUS (B): through the For-you writer (user-todos.add, origin agent — THE card\'s store) the stored detail holds the URL whole: all ten parameters, token_usage=remote', it.detail.slice(-160));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const KEPT = {
    'token_usage=remote': 'https://x.example/a?prompt=consent&token_usage=remote&b=1', 'token_type=bearer': 'https://x.example/cb#token_type=bearer&expires_in=3600',
    'token_access_type=offline': 'https://x.example/a?token_access_type=offline', 'auth_type=rerequest': 'https://x.example/a?auth_type=rerequest',
    'TOKEN_TTL=3600': 'TOKEN_TTL=3600', 'SSH_AUTH_SOCK': 'SSH_AUTH_SOCK=/run/user/1000/keyring/ssh', 'the URN under grant_type': 'grant_type=urn:ietf:params:oauth:grant-type:device_code',
    'X-Amz-Algorithm / Expires / SignedHeaders': 'https://b.s3.amazonaws.com/r?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600&X-Amz-SignedHeaders=host',
    'secret_scanning / password_policy / pass_through': 'secret_scanning=enabled\npassword_policy=strict\npass_through=true',
  };
  for (const [n, t] of Object.entries(KEPT)) ok(SS.redactSecrets(t).text === t, `CENSUS (B) kept — ${n}`);
  const MASKED = {
    'signed S3 Credential + Signature': ['https://b.s3.amazonaws.com/r?X-Amz-Credential=' + keyId + '%2F20261107%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Signature=' + sig64, sig64], 'access_token=': ['https://x.example/cb#access_token=' + tok + '&token_type=bearer', tok],
    '?token=': ['https://x.example/a?token=' + tok, tok], 'client_secret=offline': ['client_secret=offline', 'offline'], 'session_id': ['session_id=84726193', '84726193'], 'sig=ab12': ['https://x.example/cb?sig=ab12', 'ab12'],
    'key=wdjb-mjht': ['https://x.example/a?key=wdjb-mjht', 'wdjb-mjht'], 'password=remote': ['password=remote', 'remote'], '?passcode=consent': ['https://x.example/a?passcode=consent', 'consent'],
    'a vault-mark smuggle (?token=[vault:<40 hex>])': ['https://x.example/a?token=[vault:' + runOf(HEX, 40) + ']', 'vault:'],
    'r4 (α) token_uri in a pasted client JSON (the base\'s verdict: a false hide costs nothing)': ['{"token_uri": "https://oauth2.googleapis.com/token"}', 'oauth2.googleapis.com'],
  };
  for (const [n, [t, frag]] of Object.entries(MASKED)) { const o = SS.redactSecrets(t).text; ok(!o.includes(frag) && o.includes(REDACTED) && !o.endsWith(']') && SS.redactSecrets(o).text === o, `CENSUS (B) still masked — ${n} (idempotent)`); }

  // r3 (B): a url / uri / endpoint head is public ONLY without a userinfo — a credential-named CONNECTION STRING is masked whole
  const pw = ['pw', 'Q7x', 'kL2'].join('');
  const CONN = ['SESSION_REDIS_URL=redis://:' + pw + '@cache', 'AUTH_DATABASE_URL=postgres://app:' + pw + '@db', 'TOKEN_STORE_URI=mongodb://u:' + pw + '@m1', '{"session_url": "redis://:' + pw + '@cache"}', 'SECRET_ENDPOINT=https://u:' + pw + '@vault.example', 'AUTH_URL=https://admin:' + pw + '@db/', 'REDIS_AUTH_URL=redis://:' + pw + '@c', '{"token_uri": "https://u:' + pw + '@oauth2.example/token"}', 'https://x.example/a?auth_url=https%3A%2F%2Fadmin%3A' + pw + '%40db%2F'];
  const connLeak = CONN.filter((t) => SS.redactSecrets(t).text.includes(pw) || DM.scrub(t, 2000).includes(pw));
  ok(connLeak.length === 0, `r3 (B): ${CONN.length} credential-named connection strings with a userinfo masked (the belt and the vendor scrub)${connLeak.length ? ' — leaked: ' + connLeak.join(' · ') : ''}`);
  // r3 (C): a PUBLIC name's value is walked on — a holder nested inside it is masked, the public name stays
  const nest = SS.redactSecrets('https://x.example/a?next=https://app.example/reset?token=' + tok).text;
  ok(nest === 'https://x.example/a?next=https://app.example/reset?token=«redacted»' && SS.redactSecrets('https://x.example/a?continue=https://app.example/cb?code=1&token=' + tok).text.endsWith('&token=«redacted»') && belt.maskForSink(OWNER) === OWNER, 'r3 (C): a holder nested RAW in a public value is masked in place (next / continue stay), the owner\'s URL unchanged', nest);
  // r4 (M1 + M2, law α): a credential-named ADDRESS holds — a capability URL, an encoded nested holder, a connection string all hide behind it
  const CAP = { 'a Slack webhook (SECRET_WEBHOOK_URL)': 'SECRET_WEBHOOK_URL=https://hooks.slack.com/services/T0/B0/' + tok, 'a private calendar (PRIVATE_ICAL_URL)': 'PRIVATE_ICAL_URL=https://cal.example/ical/x/private-' + runOf(HEX, 24) + '/basic.ics', 'a bot token in a path (TOKEN_URL)': 'TOKEN_URL=https://api.telegram.org/bot123456:' + tok + '/getMe', 'a query key (AUTH_ENDPOINT)': 'AUTH_ENDPOINT=https://x.example/cb?k=' + tok,
    'an encoded nested token (?password_reset_url=…%3Ftoken%3D…)': 'https://x.example/a?password_reset_url=https%3A%2F%2Fapp.example%2Freset%3Ftoken%3D' + tok, 'an encoded nested access_token (?auth_url=…%26access_token%3D…)': 'https://x.example/a?auth_url=https%3A%2F%2Fapp%2Fcb%3Fcode%3D1%26access_token%3D' + tok, 'an encoded nested sid (?token_url=…%3Bsid%3D…)': 'https://x.example/a?token_url=https%3A%2F%2Fapp%2Fx%3Bsid%3D' + tok };
  for (const [n, t] of Object.entries(CAP)) { const o = SS.redactSecrets(t).text, d = DM.scrub(t, 2000); ok(!o.includes(tok) && !o.includes('private-') && !d.includes(tok) && o.includes(REDACTED), `r4 (M1/M2, α) ${n}: masked through the belt and the vendor scrub`); }
  // r4: a PUBLIC query value is judged DECODED ONCE — an encoded nested holder or a userinfo masks it whole (fail closed); a plain one stays
  const pub = (t) => SS.redactSecrets(t).text;
  ok(pub('https://x.example/a?next=https%3A%2F%2Fapp.example%2Freset%3Ftoken%3D' + tok) === 'https://x.example/a?next=«redacted»' && pub('https://x.example/a?next=https%3A%2F%2Fu%3A' + tok + '%40db%2F') === 'https://x.example/a?next=«redacted»' && pub('https://x.example/a?next=https://u:' + tok + '@db/x') === 'https://x.example/a?next=«redacted»'
    && pub('https://x.example/a?redirect_uri=https%3A%2F%2Fapp.example%2Fcb&state=abc') === 'https://x.example/a?redirect_uri=https%3A%2F%2Fapp.example%2Fcb&state=abc' && pub('https://x.example/a?next=%E0%A4%A&t=%3Ftoken%3D' + tok).endsWith('&t=«redacted»'),
    'r4: a public query value decoded once — an encoded nested token, an encoded / raw userinfo ⇒ masked whole; a plain encoded redirect_uri kept; a malformed escape never hides a nested token');
  // r5 (M2): a userinfo holds a secret only WITH A PASSWORD — a bare username is an identity (the owner's complaint class: a public URL
  // masked whole and drawn as an unopenable link); an EMPTY password (`user:@` — HTTP Basic's API-key form, curl's `-u key:`) still holds
  {
    const KEEP = ['https://ci.example/build?repo=ssh://git@github.com/o/r.git&ref=main', 'https://a.example/x?profile=https://alice@social.example', 'https://ci.example/build?repo=ssh%3A%2F%2Fgit%40github.com%2Fo%2Fr.git&ref=main'];
    const moved = KEEP.filter((u) => SS.redactSecrets(u).text !== u || belt.maskForSink(u) !== u || DM.scrub(u, 2000) !== u || (typeof FY.maskedNoteOf === 'function' ? FY.maskedNoteOf(belt.maskForSink(u)) : '') !== '');   // a tree without the export reds BY NAME (the belt legs), never a crash
    ok(!moved.length, `r5 (M2): ${KEEP.length} public URLs carrying a bare USERNAME (ssh://git@…, https://alice@…, encoded git%40) byte-identical through the belt, maskForSink and the vendor scrub — drawn as links, no note`, moved);
    const EMPTY = ['https://a.example/x?next=https://user:@api.example/v1', 'https://a.example/x?next=https%3A%2F%2Fuser%3A%40api.example%2Fv1'];
    ok(EMPTY.every((u) => SS.redactSecrets(u).text === 'https://a.example/x?next=«redacted»'), 'r5 (M2): an EMPTY password (`user:@`, raw and encoded) still holds — masked whole', EMPTY.map((u) => SS.redactSecrets(u).text));
    ok(!/USERINFO_RE/.test(SRC) && /function passwordUserinfo\(d\)/.test(SRC), 'r5 (M2): r4\'s USERINFO_RE (any `user@`) is gone — passwordUserinfo judges the userinfo');
  }
  // r5 (M3): the decoded-once judgement reads the WHOLE value — a password-carrying userinfo one redirect deeper (raw, encoded, mixed) masks it
  {
    const DEEP = { 'encoded, one redirect deeper (?next=https://a/b%3Fr%3Dhttps%3A%2F%2Fu%3Apw%40h)': 'https://a.example/cb?next=https://a.example/b%3Fr%3Dhttps%3A%2F%2Fu%3A' + pw + '%40h', 'a path redirect, encoded (?redirect=/b?r=https%3A%2F%2Fu%3Apw%40h)': 'https://a.example/cb?redirect=/b?r=https%3A%2F%2Fu%3A' + pw + '%40h', 'raw, one redirect deeper (?next=https://a/b?r=https://u:pw@h)': 'https://a.example/cb?next=https://a.example/b?r=https://u:' + pw + '@h', 'raw, an empty user (…?r=redis://:pw@h)': 'https://a.example/cb?next=https://a.example/b?r=redis://:' + pw + '@h' };
    for (const [n, u] of Object.entries(DEEP)) { const o = SS.redactSecrets(u).text, d = DM.scrub(u, 2000), b = belt.maskForSink(u); ok(!o.includes(pw) && !d.includes(pw) && !b.includes(pw) && /\?(?:next|redirect)=«redacted»$/.test(o), `r5 (M3) ${n}: the whole public value masked (the belt, maskForSink, the vendor scrub)`, o); }
  }
  // r4 (M4): the belt reads each value ONCE — never a decode per HEAD (r3 peeked 640 characters and decoded at every `&token_url=` / `AUTH_URL=`
  // head: 13× the base on a 64 KiB storm; a count of steps cannot see it — a builtin is one step — so the decodes are COUNTED)
  {
    const real = globalThis.decodeURIComponent; let n = 0;
    globalThis.decodeURIComponent = (v) => { n++; return real(v); };
    try {
      for (const [label, text, most] of [['`&token_url=%41`×4096 (a holder: masked, never decoded)', 'x?' + '&token_url=%41'.repeat(4096), 0],
        ['` AUTH_URL=https%3A%2F%2Fu%3Ap%40h`×4096 (a holder)', ' AUTH_URL=https%3A%2F%2Fu%3Ap%40h'.repeat(4096), 0],
        ['`?next=%3Ftoken_type%3D`×4096 (ONE public value, its nested heads inside it)', '?next=%3Ftoken_type%3D'.repeat(4096), 1],
        ['`&a=https%3A%2F%2Fh`×4096 (4096 public values, each judged once)', 'x?' + '&a=https%3A%2F%2Fh'.repeat(4096), 4096]]) {
        n = 0; SS.redactSecrets(text);
        ok(n <= most, `r4 (M4): the belt decodes each value at most once — ${label}: ${n} decode${n === 1 ? '' : 's'} (≤ ${most})`);
      }
    } finally { globalThis.decodeURIComponent = real; }
  }
  // r3 (G): nothing of a holder's value is shown — the prose keeps only the closer of a wrapper IT opened, or ONE sentence-final `.` / `,`
  const g = (t) => SS.redactSecrets(t).text;
  ok(g('https://x.example/?password=Summer2024!') === 'https://x.example/?password=«redacted»' && g('https://x.example/?pass=!!!') === 'https://x.example/?pass=«redacted»' && g('https://x.example/?token=.') === 'https://x.example/?token=«redacted»',
    'r3 (G): a value\'s own last character is never shown (`Summer2024!`), a value of closers only is masked whole (`!!!`, `.`)');
  ok(g('see https://x.example/?password=pw).') === 'see https://x.example/?password=«redacted».' && g('see (https://x.example/?password=pw).') === 'see (https://x.example/?password=«redacted»).' && g('open [Sign in](https://x.example/cb?token=abc).') === 'open [Sign in](https://x.example/cb?token=«redacted»).' && g('「https://x.example/?token=abc」') === '「https://x.example/?token=«redacted»」' && g('it is https://x.example/?token=abc, then') === 'it is https://x.example/?token=«redacted», then',
    'r3 (G): a `)` the prose did not open stays INSIDE the mask; the prose\'s own `(` / `[label](` / `「` closer and one sentence-final `.` / `,` stay outside');
  // r3 (A): a long closer run is LINEAR — pinned by the count in test-exit-run (§2b's R7 shapes: closers then a letter, closers at the end,
  // a public-name storm; and closers-then-a-letter ≤ ×2 the steps of closers-at-the-end), never by a clock here (test-ci-gate's ratchet)
  // r3 (J): the container heads are CONSULTED (a container head holds — the grammar reads the table, not only its fail-closed default)
  ok(/SECRET_WORDS\.has\(head\) \|\| CONTAINER_HEADS\.has\(head\)/.test(SRC) && ['session_id', 'token_value', 'key_id', 'client-key-data'].every((n) => holder(n) === true), 'r3 (J): CONTAINER_HEADS is consulted by holderName (session_id, token_value, key_id, client-key-data hold)');
  // r3 (D, E): a masked token is EXACTLY its URL / path token (CJK punctuation bounds it); a bare vault mark is words
  const CJK = { en: 'Wrote /home/u/proj/config/app.env, where API_KEY=«redacted», see.', zh: '已写入 /home/u/proj/config/app.env，其中API_KEY=«redacted»，请查看。', ja: '/home/u/proj/config/app.env に書き込み、API_KEY=«redacted»、確認してください。' };
  for (const [lg, t] of Object.entries(CJK)) { const sg = FY.segmentText(t); ok(sg.filter((x) => x.t === 'link' && x.kind === 'path' && x.ref === '/home/u/proj/config/app.env').length === 1 && !sg.some((x) => x.t === 'masked'), `r3 (D) ${lg}: the path is ONE link to /home/u/proj/config/app.env, the rest words — no masked span`); }
  const cjkUrl = FY.segmentText('请打开https://app.example.com/login?token=«redacted»，然后看。');
  ok(cjkUrl.filter((x) => x.t === 'masked').map((x) => x.s).join('|') === 'https://app.example.com/login?token=«redacted»', 'r3 (D): a masked URL inside CJK prose — only the URL token is the masked span', cjkUrl);
  const bare = FY.segmentText('value: [vault:secrets/db/secret] then and API_KEY=[vault:secrets/db/secret] and see [vault:web-login:https://x.example/#u] ok');
  ok(!bare.some((x) => x.t === 'masked' || x.t === 'link') && FY.maskedNoteOf('value: [vault:secrets/db/secret] then') === '', 'r3 (E): a BARE vault mark (and `NAME=[vault:…]`, and one naming a URL) is words — no masked «link», no note');
  // r4 (M3): a clean URL then a masked one in ONE blank-free run (CJK prose — the owner's own shape): two tokens, each judged on its own
  const M3S = { en: 'first open https://app.example.com/a, then https://x.example/cb?token=«redacted» to sign in', zh: '先打开https://app.example.com/a，再用https://x.example/cb?token=«redacted»登录', ja: 'まずhttps://app.example.com/a、次にhttps://x.example/cb?token=«redacted»でログイン' };
  for (const [lg, t] of Object.entries(M3S)) { const sg = FY.segmentText(t), links = sg.filter((x) => x.t === 'link'), mk = sg.filter((x) => x.t === 'masked');
    ok(links.length === 1 && links[0].ref === 'https://app.example.com/a' && mk.length === 1 && mk[0].s.startsWith('https://x.example/cb?token=«redacted»') && !links.some((x) => x.ref.includes('redacted')), `r4 (M3) ${lg}: the clean URL is ONE link to https://app.example.com/a, the masked one words — no link holds the mark`, sg); }
  // r5 (M1): a BALANCED full-width pair inside a URL token stays part of it (a CJK page title) — an unpaired CJK mark ends the token
  const M1S = { '…/wiki/東京（都） — a balanced pair: ONE whole link': ['see https://ja.example/wiki/東京（都） ok', 'https://ja.example/wiki/東京（都）'], '…/wiki/「東京」 — a corner-bracket pair': ['见https://ja.example/wiki/「東京」 ok', 'https://ja.example/wiki/「東京」'], '…/x，然后点 — the comma ends it': ['look https://a.example/x，然后点', 'https://a.example/x'], '…/x。 — the stop ends it': ['看https://a.example/x。', 'https://a.example/x'], '…/東京（都），再说 — the pair kept, the comma ends it': ['先看https://ja.example/wiki/東京（都），再说', 'https://ja.example/wiki/東京（都）'], '（…/a）吧 — the prose\'s own pair is not the token\'s': ['（https://x.example/a）吧', 'https://x.example/a'], '…/a（b — an unpaired opener ends it': ['https://x.example/a（b ok', 'https://x.example/a'] };
  for (const [n, [t, want]] of Object.entries(M1S)) { const got = FY.segmentText(t).filter((x) => x.t === 'link').map((x) => x.ref).join('|'); ok(got === want, `r5 (M1) For you (segmentText): ${n}`, got); }
  // r7 (M8): a character that occurs INSIDE real URLs never cuts a token in the middle — only CJK sentence punctuation and an unpaired full-width
  // bracket do (foryou-links URL_STOP); a dash / curly quote / ellipsis / wave dash at the END is shed (cleanPath's rule). r4–r6 cut these at the mark
  {
    const M8 = { '…/wiki/Mexican–American_War (an en dash inside)': ['see https://en.wikipedia.org/wiki/Mexican–American_War', 'https://en.wikipedia.org/wiki/Mexican–American_War'], '…/a〜b/c (a wave dash inside)': ['https://ja.example/a〜b/c ok', 'https://ja.example/a〜b/c'], '…/a…b (an ellipsis inside)': ['https://x.example/a…b ok', 'https://x.example/a…b'], '…/2024—report/index.html (an em dash in the path)': ['see https://x.example/2024—report/index.html ok', 'https://x.example/2024—report/index.html'], '“…/a” 的 (a closing curly quote shed, nothing else)': ['“https://x.example/a” 的', 'https://x.example/a'], '…/it’s-here (a curly apostrophe inside)': ['see https://x.example/it’s-here ok', 'https://x.example/it’s-here'], '…/a～b (a full-width tilde inside)': ['https://x.example/a～b ok', 'https://x.example/a～b'] };
    for (const [n, [t, want]] of Object.entries(M8)) { const got = FY.segmentText(t).filter((x) => x.t === 'link').map((x) => x.ref).join('|'); ok(got === want, `r7 (M8) For you (segmentText): ${n} — ONE link to ${want}`, got); }
  }
  // r8 (a): a LETTER never leaves a URL — 々 〆 〇 〻 (letters / numbers inside path-linkify's CJK_PUNCT ranges) at a URL's END stay in it; a
  // CJK comma after one still stops the token (the base's For-you shed them: `…/wiki/人々` linked `…/wiki/人`)
  {
    const L8 = { '…/wiki/人々 (々 U+3005 ends it)': ['see https://ja.wikipedia.org/wiki/人々', 'https://ja.wikipedia.org/wiki/人々'], '…/二〇〇〇 (〇 U+3007)': ['see https://ja.example/二〇〇〇', 'https://ja.example/二〇〇〇'], '…/締〆 (〆 U+3006)': ['see https://ja.example/締〆', 'https://ja.example/締〆'], '…/a〻 (〻 U+303B)': ['see https://ja.example/a〻', 'https://ja.example/a〻'], '…/人々，然后 (the letter kept, the comma stops)': ['https://ja.wikipedia.org/wiki/人々，然后', 'https://ja.wikipedia.org/wiki/人々'] };
    for (const [n, [t, want]] of Object.entries(L8)) { const got = FY.segmentText(t).filter((x) => x.t === 'link').map((x) => x.ref).join('|'); ok(got === want, `r8 (a) For you (segmentText): ${n} — ONE link to ${want}`, got); }
  }
  // r5 (m4): a code span holding a belt's mark is never a rel link (a press would open a file that does not exist) — the chat's rule
  {
    const segs = (t) => FY.segmentText(t).filter((x) => x.t !== 'text');
    ok(!segs('see `a«redacted».txt` now').length && !segs('see `x[vault:k].md` now').length, 'r5 (m4): a code span holding a mark with no `/` before it (`a«redacted».txt`, `x[vault:k].md`) is words — no link', [segs('see `a«redacted».txt` now'), segs('see `x[vault:k].md` now')]);
    ok(segs('see `a.txt` now').some((x) => x.t === 'link' && x.kind === 'rel' && x.ref === 'a.txt') && segs('see `docs/«redacted».md` now').some((x) => x.t === 'masked') && !segs('see `docs/«redacted».md` now').some((x) => x.t === 'link'), 'r5 (m4): a plain code-span filename stays a rel link; a masked path in one is words + the note');
  }
  // F2 — R7 judges the NAME alone and its run stops before the closer that ends it: three wrappers
  const WRAP = { '[Sign in](…)': (u) => '[Sign in](' + u + ')', '(…)': (u) => 'open it (' + u + ') then', 'a sentence\'s end': (u) => 'open ' + u + '.' };
  const SECRET_URL = 'https://app.example.com/login?next=%2Fhome&token=' + tok;
  for (const [n, w] of Object.entries(WRAP)) {
    const o = belt.maskForSink(w(SECRET_URL));
    ok(belt.maskForSink(w(OWNER)) === w(OWNER) && o === w(SECRET_URL.replace(tok, REDACTED)), `F2 ${n}: the owner's URL byte-identical; a secret-bearing one masked with the wrapper intact`);
  }
  ok(SS.redactSecrets('https://x.example/a?token=ab(cd)').text === 'https://x.example/a?token=«redacted»' && SS.redactSecrets('see (https://x.example/a?token=ab(cd)).').text === 'see (https://x.example/a?token=«redacted»).', 'F2: a `)` the run itself opened stays inside the mask; the one that closes the prose stays outside');

  // LAW 3 — the public-URL corpus (THE census every sink inherits: the belt, exit-reach's heads, a job's log)
  const PUBLIC = {
    'Google OAuth — the owner\'s gcloud sign-in': OWNER,
    'Dropbox OAuth (token_access_type=offline)': 'https://www.dropbox.com/oauth2/authorize?client_id=' + runOf(LOW + '0123456789', 15) + '&response_type=code&token_access_type=offline&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&state=' + runOf(B62, 22),
    'Facebook login (auth_type=rerequest)': 'https://www.facebook.com/v19.0/dialog/oauth?client_id=1234567890&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&state=' + runOf(B62, 22) + '&auth_type=rerequest&scope=email',
    'GitHub device flow': 'https://github.com/login/device',
    'GitHub OAuth app': 'https://github.com/login/oauth/authorize?client_id=Iv1.' + runOf(HEX, 16) + '&scope=repo%20read%3Aorg&state=' + runOf(B62, 22) + '&allow_signup=true',
    'Lark app auth': 'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_' + runOf(HEX, 16) + '&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&scope=contact%3Auser.base%3Areadonly&state=' + runOf(B62, 22),
    'Slack install': 'https://slack.com/oauth/v2/authorize?client_id=1234567890.1234567890123&scope=chat%3Awrite%2Cchannels%3Aread&user_scope=&redirect_uri=https%3A%2F%2Fexample.com%2Fcb&state=' + runOf(B62, 22),
    'Stripe checkout': 'https://checkout.stripe.com/c/pay/cs_test_' + runOf(B62, 58) + '#fid' + runOf(B62, 40),
    'an OAuth implicit callback with no token (token_type=bearer, expires_in)': 'https://example.com/cb#token_type=bearer&expires_in=3600&state=' + runOf(B62, 16),
  };
  for (const [n, u] of Object.entries(PUBLIC)) {
    const segs = FY.segmentText('open ' + u + ' then paste the code'), links = segs.filter((g) => g.t === 'link');
    ok(SS.redactSecrets(u).text === u && belt.maskForSink(u) === u && links.length === 1 && links[0].ref === u && !segs.some((g) => g.t === 'masked'), `LAW 3 corpus — ${n}: byte-identical through the belt and ONE whole link on the card`);
  }
  const SECRET = {
    'a signed S3 URL (X-Amz-Credential / X-Amz-Signature masked, the plain X-Amz-* kept)': ['https://bucket.s3.amazonaws.com/report.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=' + keyId + '%2F20261107%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261107T120000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=' + sig64, [keyId.slice(4), sig64], ['X-Amz-Algorithm=AWS4-HMAC-SHA256', 'X-Amz-Expires=3600', 'X-Amz-SignedHeaders=host']],
    'an OAuth implicit callback carrying its token': ['https://example.com/cb#access_token=' + tok + '&token_type=bearer&expires_in=3600', [tok], ['token_type=bearer', 'expires_in=3600']],
    'a magic sign-in link': ['https://app.example.com/login?token=' + tok + '&next=%2Fhome', [tok], ['next=%2Fhome']],
  };
  for (const [n, [u, frags, keep]] of Object.entries(SECRET)) {
    const o = belt.maskForSink('open ' + u + ' then paste the code'), segs = FY.segmentText(o), html = FY.linkedHtml(o);
    ok(frags.every((f) => !o.includes(f)) && keep.every((k) => o.includes(k)) && segs.filter((g) => g.t === 'masked').length === 1 && !segs.some((g) => g.t === 'link') && /class="fy-masked"/.test(html) && /class="masked-link-note">Part of this link was masked, so it will not open — ask the agent to send the link without the secret\.</.test(html) && !/data-ref="https/.test(html),
      `LAW 2 + 3 corpus — ${n}: masked (the plain parameters kept), drawn as WORDS with the note, no link`);
  }
  // LAW 2 — the marks: raw, percent-encoded with either colon (marked leaves it raw), a 440-character entry; a «redacted» the agent
  // typed itself is judged exactly like the belt's (one mark, one rule)
  const ml = fnOf(SS.maskedLink), longEntry = 'web-login:https://x.example/' + 'a'.repeat(400) + '#user';
  ok(J(ml('https://x/?t=' + REDACTED)) === J({ shape: true, vault: [] }) && J(ml('https://x/?t=%C2%ABredacted%C2%BB')) === J({ shape: true, vault: [] }) && J(ml('https://x/?k=%5Bvault%3Aapikey%3Aexample%5D')) === J({ shape: false, vault: ['apikey:example'] }) && J(ml('https://x/?k=%5Bvault:apikey:example%5D')) === J({ shape: false, vault: ['apikey:example'] }) && J(ml('https://x/p/[vault:' + longEntry + ']')) === J({ shape: false, vault: [longEntry] }) && ml(OWNER) === null,
    'maskedLink: «redacted» raw or percent-encoded, a [vault:<entry>] raw / %3A / raw-colon (marked\'s href) / 440 characters long — the entry named; the owner\'s URL none');
  // LAW 2 — a PATH a belt masked inside (m4), and the vault road where a mark survives the belt (a path piece, never a holder's value)
  const pseg = FY.segmentText('The report: /home/u/out/[vault:secret:run]/report.md and out/[vault:secret:run]/r.md and /home/u/' + REDACTED + '/x.txt.');
  ok(pseg.filter((g) => g.t === 'masked').length === 3 && !pseg.some((g) => g.t === 'link') && pseg.map((g) => g.s).join('') === 'The report: /home/u/out/[vault:secret:run]/report.md and out/[vault:secret:run]/r.md and /home/u/' + REDACTED + '/x.txt.' && FY.segmentText('plain /home/u/x/report.md').filter((g) => g.t === 'link').length === 1,
    'LAW 2 (m4): an absolute path, a relative path and a path holding «redacted» are each ONE masked segment (no link, the words whole); a plain path stays a link');
  const vtext = belt.maskForSink('the file https://files.example.com/[vault:secret:0123456789]/report.pdf now'), vhtml = FY.linkedHtml(vtext);
  ok(/class="fy-masked">https:\/\/files\.example\.com\/\[vault:secret:0123456789\]\/report\.pdf<\/span>/.test(vhtml) && /it holds the vault entry secret:0123456789: reveal it in Vault/.test(vhtml) && !/fy-link/.test(vhtml), 'LAW 2: a link whose path holds a vault mark (no holder name, so the belt keeps the mark) names its road — the entry, revealed in Vault', vhtml);
  ok(fnOf(FY.maskedNoteOf)('progress: ' + SS.redactSecrets('https://app.example.com/login?token=' + tok).text) !== '' && fnOf(FY.maskedNoteOf)('progress: ' + OWNER) === '', 'maskedNoteOf: a text drawn as words says its masked link; a whole link says nothing');
  // LAW 2 — THE SURFACE CENSUS: every surface that draws a belted store's words asks the ONE masked-link rule
  const SURFACES = {
    'the For-you card — tray, window, the chat\'s ask card (user-todos-row wordsHtml + linkifyInto)': ['src/lib/user-todos-row.js', [/linkedHtml\(String\(text \|\| ''\), \{ escape: escHtml, note: \(g\) => maskedLinkNote\(g, tr\) \}\)/, /n\.textContent = maskedLinkNote\(g, tr\);/]],
    'a chat peer card — a group message, a stashed message (chat-renderers linkifyUrls + the <a> pass + the path pass)': ['src/lib/chat-renderers.js', [/const mask = linkMask\(raw\);[^\n]*\n\s*if \(mask\) return this\._maskedToken\(raw, mask\);/, /if \(anchor\) \{ const masked = this\._maskedAnchor\(match\); if \(masked\) return masked; \}/, /txt\.replace\(MASKED_PATH_RE, \(run\) => \{ const mask = pathMask\(run\); return mask \? this\._maskedToken\(run, mask\) : run; \}\)/, /const fmask = linkMask\(raw\); if \(fmask\) return this\._maskedToken\(raw, fmask\);/, /if \(linkMask\(txt\)\) \{ const cm = pathMask\(txt\);/]],
    'the progress note + its detail (task-log)': ['src/lib/task-log.js', [/maskedNoteOf\(note\.textContent, t\)/, /maskedNoteOf\(d\.textContent, t\)/]],
    'the stash line (stash-strip)': ['src/lib/stash-strip.js', [/n = maskedNoteOf\(w, t\)/]],
    'the group message in the IM (channel-window groupBody)': ['src/lib/channel-window.js', [/maskedNoteOf\(groupBodyRuns\(rec\)\.map\(\(r\) => r\.text\)\.join\(''\), t\)/]],
    'the status reason + detail (session-props)': ['src/lib/session-props.js', [/maskNoteHtml\(st\.reason\)/, /maskNoteHtml\(st\.detail\)/]],
  };
  const surfaceOk = (src, pins) => pins.every((re) => re.test(src));
  const off = Object.entries(SURFACES).filter(([, [f, pins]]) => !surfaceOk(fs.readFileSync(path.join(REPO, f), 'utf8'), pins)).map(([n]) => n);
  ok(off.length === 0, `LAW 2 SURFACE CENSUS: all ${Object.keys(SURFACES).length} surfaces that draw a belted store's words ask the one masked-link rule${off.length ? ' — off: ' + off.join(' · ') : ''}`);
  const tl = fs.readFileSync(path.join(REPO, 'src/lib/task-log.js'), 'utf8');
  ok(!surfaceOk(tl.replace('maskedNoteOf(note.textContent, t)', "''"), SURFACES['the progress note + its detail (task-log)'][1]), 'CONTROL: a surface copy that draws its words without the rule ⇒ the census is RED');

  // RED CONTROLS (patched copies, each run through the SAME legs)
  const baseRule = M.load('src/secret-shapes.js', SRC.replace('    if (!holderName(m[4])) continue;', '    if (!secretName(m[4])) continue;').replace('let hold = holderName(m[2]), ve = -1;', 'let hold = secretName(m[2]), ve = -1;'), 'baserule');
  ok(baseRule.redactSecrets(OWNER).text.includes('token_usage=' + REDACTED) && beltOver(M.files[M.files.length - 1]).maskForSink(OWNER) !== OWNER && baseRule.redactSecrets('TOKEN_TTL=3600').text !== 'TOKEN_TTL=3600',
    'RED CONTROL (the base\'s word test in place of the grammar): token_usage=«redacted» through the belt — census (B) goes red');
  const fySrc = fs.readFileSync(path.join(REPO, 'src/lib/foryou-links.js'), 'utf8');
  ok(fySrc.includes('const mask = marked ? maskedLink(ref) : null;') && fySrc.includes('const mk = marked && m.index >= scannedTo ? pathToken(s, m.index) : null;'), 'the base-card control\'s two patches each find their line');
  const FY0 = await import(M.write('src/lib/foryou-links.js', fySrc.replace('const mask = marked ? maskedLink(ref) : null;', 'const mask = null;').replace('const mk = marked && m.index >= scannedTo ? pathToken(s, m.index) : null;', 'const mk = null;'), 'nomask', { esm: true }));
  const s0 = FY0.segmentText(belt.maskForSink(SECRET['a magic sign-in link'][0] + ' and /home/u/out/[vault:secret:run]/report.md'));
  ok(s0.some((g) => g.t === 'link' && g.ref.includes(REDACTED)) && s0.some((g) => g.t === 'link' && g.kind === 'path') && !s0.some((g) => g.t === 'masked'), 'RED CONTROL (the base\'s card): a masked URL and a masked path are whole-looking LINKS — the LAW 2 legs go red');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
