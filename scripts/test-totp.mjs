#!/usr/bin/env node
// TWO-STEP CODES — PURE src/totp.js (design q-047 L1, lane vault-totp). Fast tier, in-process, no files.
//   ① RFC 6238 appendix B — the 18 TOTP vectors (SHA1 / SHA256 / SHA512 × 59 s … 20000000000 s, 8 digits)
//   ② RFC 4226 appendix D — the 10 HOTP values (counter 0…9)
//   ③ base32 (RFC 4648): its §10 vectors, a seed as people paste it (spaces, dashes, lower case, padding), a character no
//      alphabet has, a length no encoder makes, random round trips
//   ④ the otpauth link: no secret · hotp · digits=8 · algorithm in lower case · the issuer in the label only · percent-
//      encoding · the issuer parameter over the label · refusals by name (not a link, another type, bad escapes, 5 digits,
//      a 10 s period, MD5, a short seed) · a `__proto__` parameter pollutes nothing
//   ⑤ THE CLOCK: the step at its boundaries (milliseconds floor), the seconds left 1…period, a 60 s period; THE SKEW: verify
//      ±1 step takes a clock 29 s behind or ahead, refuses 2 steps, window 0 = the current step only
//   ⑥ the record: valueOf's named fields, recordOf (sealed text → record | null), uriOf ⇄ parseOtpauth round trip
//   ⑦ names: the default name, the entry name's grammar
//   ⑧ the grants: grantOf's rows, useVerdict — locked first, a conversation in THIS run, a Task Group, a view, another entry
//   ⑨ PURE: no require / import (acorn tokens); the HMAC is injected (none ⇒ a TypeError, never a silent default)
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const T = require(path.join(REPO, 'src/totp.js'));
const acorn = require('acorn');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const hmac = (a, k, m) => crypto.createHmac(String(a).toLowerCase(), k).update(m).digest();
// THE CLASSIC SEED (base32 of "Hello!" + DEADBEEF) — a secret-shaped fixture is BUILT AT RUNTIME, never a literal (the repo's push rule)
const HELLO = ['JBSWY3DP', 'EHPK3PXP'].join('');
const t0 = Date.now();

console.log('① RFC 6238 appendix B');
{
  const K = { SHA1: Buffer.from('12345678901234567890'), SHA256: Buffer.from('12345678901234567890123456789012'), SHA512: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234') };
  const B = [
    [59, '94287082', '46119246', '90693936'], [1111111109, '07081804', '68084774', '25091201'], [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'], [2000000000, '69279037', '90698825', '38618901'], [20000000000, '65353130', '77737706', '47863826'],
  ];
  const bad = [];
  for (const [s, ...codes] of B) ['SHA1', 'SHA256', 'SHA512'].forEach((a, i) => { const got = T.totp(K[a], { now: s * 1000, digits: 8, algorithm: a, hmac }).code; if (got !== codes[i]) bad.push(`${a}@${s}: ${got} ≠ ${codes[i]}`); });
  ok(bad.length === 0, 'the 18 vectors (3 algorithms × 6 instants, 8 digits) — every one', bad);
}

console.log('② RFC 4226 appendix D');
{
  const D = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  const got = D.map((_, c) => T.hotp(Buffer.from('12345678901234567890'), c, { hmac }));
  ok(got.join() === D.join(), 'HOTP counter 0…9 (6 digits, SHA1)', got);
  let threw = null; try { T.hotp(Buffer.from('k'), -1, { hmac }); } catch (e) { threw = e; }
  ok(threw instanceof RangeError, 'a negative counter ⇒ RangeError (refused, never wrapped)');
}

console.log('③ base32');
{
  const V = [['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']];
  ok(V.every(([p, e]) => T.base32Encode(Buffer.from(p)) === e) && V.slice(1).every(([p, e]) => Buffer.from(T.base32Decode(e).bytes).toString() === p), 'RFC 4648 §10: every vector both ways');
  const h = T.base32Decode(HELLO);
  ok(h.ok && Buffer.from(h.bytes).toString('hex') === '48656c6c6f21deadbeef' && h.text === HELLO, 'the classic seed → "Hello!" + DEADBEEF');
  const pasted = T.base32Decode(' jbsw y3dp-ehpk 3pxp== ');
  ok(pasted.ok && pasted.text === HELLO && Buffer.from(pasted.bytes).equals(Buffer.from(h.bytes)), 'as people paste it (lower case, spaces, dashes, padding) ⇒ the same bytes and the canonical text');
  ok([HELLO.slice(0, 15) + '1', HELLO.slice(0, 15) + '0', HELLO.slice(0, 15) + '8', 'JBSW+3DP'].every((s) => T.base32Decode(s).code === 'bad_seed'), 'a character outside A–Z 2–7 ⇒ bad_seed');
  ok(['A', 'ABC', 'ABCDEF', HELLO.slice(0, 9)].every((s) => T.base32Decode(s).code === 'bad_seed') && T.base32Decode('').code === 'bad_seed', 'a length no encoder makes (1, 3, 6 past a multiple of 8) or nothing ⇒ bad_seed');
  let rt = true;
  for (let n = 1; n <= 40; n++) { const b = crypto.randomBytes(n); const d = T.base32Decode(T.base32Encode(b)); if (!d.ok || !Buffer.from(d.bytes).equals(b)) rt = false; }
  ok(rt, 'random bytes 1…40 round-trip encode → decode');
}

console.log('④ the otpauth link');
{
  const S = HELLO;
  const P = (u) => T.parseOtpauth(u, { now: 1e12 });
  ok(P('otpauth://totp/GitHub:owner?issuer=GitHub').code === 'bad_seed', 'no secret ⇒ bad_seed');
  ok(P(`otpauth://hotp/GitHub:owner?secret=${S}&counter=1`).code === 'hotp_unsupported', 'a hotp link ⇒ hotp_unsupported');
  const d8 = P(`otpauth://totp/GitHub:owner?secret=${S}&digits=8`);
  ok(d8.ok && d8.value.digits === 8 && d8.value.period === 30 && d8.value.algorithm === 'SHA1', 'digits=8 ⇒ 8 (period and algorithm default 30 / SHA1)', d8);
  const low = P(`otpauth://totp/x?secret=${S}&algorithm=sha256&period=60`);
  ok(low.ok && low.value.algorithm === 'SHA256' && low.value.period === 60, 'algorithm=sha256 (lower case) ⇒ SHA256; period=60', low);
  const lab = P(`otpauth://totp/Cloudflare:dash?secret=${S}`);
  ok(lab.ok && lab.value.issuer === 'Cloudflare' && lab.value.account === 'dash', 'the issuer in the label only ⇒ the issuer', lab);
  const pct = P(`otpauth://totp/ACME%20Co:jane%40example.com?secret=${S.toLowerCase()}&issuer=ACME+Co`);
  ok(pct.ok && pct.value.issuer === 'ACME Co' && pct.value.account === 'jane@example.com' && pct.value.seed === S, 'percent-encoding in the label, `+` in a parameter, a lower-case secret', pct);
  const both = P(`otpauth://totp/Old%20Name:me?secret=${S}&issuer=New%20Name`);
  ok(both.ok && both.value.issuer === 'New Name', 'the issuer parameter wins over the label\'s', both);
  ok(P('https://example.com/totp?secret=' + S).code === 'bad_uri' && P(`otpauth://steam/x?secret=${S}`).code === 'bad_uri' && P(`otpauth://totp/%E0%A4%A?secret=${S}`).code === 'bad_uri', 'not an otpauth link · another type · a broken escape ⇒ bad_uri');
  ok(P(`otpauth://totp/x?secret=${S}&digits=5`).code === 'bad_digits' && P(`otpauth://totp/x?secret=${S}&period=10`).code === 'bad_period' && P(`otpauth://totp/x?secret=${S}&algorithm=MD5`).code === 'bad_algorithm' && P('otpauth://totp/x?secret=JBSWY3DP').code === 'seed_too_short',
    '5 digits · a 10 s period · MD5 · a 40-bit seed ⇒ each refused by name (never trimmed)');
  const proto = P(`otpauth://totp/x?secret=${S}&__proto__=polluted&constructor=x`);
  ok(proto.ok && ({}).polluted === undefined && Object.keys(proto.value).join() === 'v,seed,digits,period,algorithm,issuer,account,addedAt,source', 'a __proto__ parameter pollutes nothing; the value is its named fields', proto);
  ok(P('otpauth://totp/x?secret=' + 'A'.repeat(3000)).code === 'bad_uri', 'a link over 2048 characters ⇒ bad_uri');
}

console.log('⑤ the clock and the skew');
{
  const K = Buffer.from('12345678901234567890');
  const at = (ms, o = {}) => T.totp(K, { now: ms, hmac, ...o });
  ok(at(0).step === 0 && at(0).secondsLeft === 30 && at(29999).step === 0 && at(29999).secondsLeft === 1 && at(30000).step === 1 && at(30000).secondsLeft === 30, 'the step turns at 30 000 ms exactly (milliseconds floored); the seconds left run 30 … 1');
  ok(at(59000).step === 1 && at(59000).secondsLeft === 1 && at(59999).code === at(30000).code && at(60000).code !== at(59999).code, 'one code holds the whole step; the next step is a new code');
  ok(at(59000, { period: 60 }).step === 0 && at(59000, { period: 60 }).secondsLeft === 1 && at(60000, { period: 60 }).secondsLeft === 60, 'a 60 s period: its own boundaries');
  let range = true;
  for (let s = 0; s < 200; s++) { const r = at(s * 1000 + 999); if (!(r.secondsLeft >= 1 && r.secondsLeft <= 30)) range = false; }
  ok(range, 'the seconds left are always 1 … period');
  const now = 1_700_000_015_000;
  const cur = at(now).code, prev = at(now - 30000).code, next = at(now + 30000).code, far = at(now - 60000).code;
  const V = (c, w = 1) => T.verify(K, c, { now, window: w, hmac });
  ok(V(cur).ok && V(cur).delta === 0 && V(prev).delta === -1 && V(next).delta === 1, 'verify ±1: the current code (0), a clock 30 s behind (−1), 30 s ahead (+1)');
  ok(T.verify(K, at(now - 29000).code, { now, window: 1, hmac }).ok && T.verify(K, at(now + 29000).code, { now, window: 1, hmac }).ok, 'a clock 29 s behind or ahead ⇒ taken');
  ok(V(far).code === 'wrong_code' && V(prev, 0).code === 'wrong_code' && V(cur, 0).ok, 'two steps away ⇒ wrong_code; window 0 ⇒ the current step only');
  ok(V('12345').code === 'bad_code' && V('12a456').code === 'bad_code' && V(` ${cur.slice(0, 3)} ${cur.slice(3)} `).ok, 'a code of the wrong shape ⇒ bad_code; spaces inside are forgiven');
}

console.log('⑥ the record');
{
  const v = T.valueOf({ seed: 'jbsw y3dp ehpk 3pxp', issuer: 'GitHub', account: 'owner@example.com' }, { now: 1_760_000_000_000, source: 'manual' });
  ok(v.ok && JSON.stringify(v.value) === JSON.stringify({ v: 1, seed: HELLO, digits: 6, period: 30, algorithm: 'SHA1', issuer: 'GitHub', account: 'owner@example.com', addedAt: 1_760_000_000_000, source: 'manual' }), 'valueOf: the named fields, the canonical seed, the defaults', v);
  ok(T.valueOf({ seed: HELLO, issuer: 'x'.repeat(121) }).code === 'bad_text' && T.valueOf({ seed: HELLO, account: 'a\nb' }).code === 'bad_text' && T.valueOf({ seed: HELLO, digits: '6x' }).code === 'bad_digits' && T.valueOf({ seed: 'A'.repeat(208) }).code === 'bad_seed',
    'an issuer over 120 · a control character · "6x" digits · a seed over 128 bytes ⇒ refused by name');
  ok(T.valueOf({ seed: HELLO, source: 'qr' }, { source: 'nonsense' }).value.source === 'manual', 'an unknown source ⇒ manual');
  const rec = T.recordOf(JSON.stringify(v.value));
  ok(rec && JSON.stringify(rec) === JSON.stringify(v.value), 'recordOf(the sealed text) ⇒ the same record');
  ok(T.recordOf('not json') === null && T.recordOf(JSON.stringify({ ...v.value, v: 2 })) === null && T.recordOf(JSON.stringify({ ...v.value, seed: 'jbsw y3dp ehpk 3pxp' })) === null && T.recordOf(JSON.stringify({ ...v.value, digits: 9 })) === null && T.recordOf('null') === null,
    'recordOf refuses: not JSON · another version · a seed not in its canonical form · 9 digits · null');
  const u = T.uriOf(v.value);
  const back = T.parseOtpauth(u);
  ok(u === `otpauth://totp/GitHub:owner%40example.com?secret=${v.value.seed}&issuer=GitHub&algorithm=SHA1&digits=6&period=30` && back.ok && ['seed', 'digits', 'period', 'algorithm', 'issuer', 'account'].every((k) => back.value[k] === v.value[k]), 'uriOf ⇄ parseOtpauth: the link carries the seed and every setting', u);
  const bare = T.valueOf({ seed: HELLO, algorithm: 'sha512', digits: 8, period: 60 }).value;
  ok(T.uriOf(bare, 'my-code') === `otpauth://totp/my-code?secret=${bare.seed}&algorithm=SHA512&digits=8&period=60` && bare.seed === v.value.seed, 'no issuer, no account ⇒ the entry\'s name is the label');
}

console.log('⑦ names');
{
  ok(T.nameOf('GitHub', 'owner@example.com') === 'github-owner' && T.nameOf('', '') === 'code' && T.nameOf('Ünïcode Bank', 'me') === 'unicode-bank-me' && T.nameOf('..', '--') === 'code' && T.nameOf('x'.repeat(200), 'y').length === 120,
    'the default name: issuer + the account\'s local part, ASCII, ≤ 120 (github-owner · code · unicode-bank-me)');
  ok(T.entryOf('github-owner') === 'totp:github-owner' && T.entryOf('a b') === null && T.entryOf('x'.repeat(121)) === null && T.entryOf('') === null && T.entryOf('a/b') === null, 'entryOf: [\\w.-]{1,120} or null');
  ok(T.nameOfEntry('totp:github-owner') === 'github-owner' && T.nameOfEntry('host:h1') === null && T.nameOfEntry('totp:a b') === null, 'nameOfEntry: only a totp entry');
}

console.log('⑧ the grants');
{
  const RUN = 'a'.repeat(24), RUN2 = 'b'.repeat(24);
  const gS = T.grantOf({ id: 'tg-0123456789ab', entry: 'totp:gh', subject: 'session:c-1', at: 5, by: 'user:o', run: RUN });
  const gG = T.grantOf({ id: 'tg-0123456789ac', entry: 'totp:gh', subject: 'group:T-1', at: 5, by: 'user:o', run: null, extra: 'dropped' });
  ok(gS && gS.run === RUN && gG && gG.run === null && !('extra' in gG), 'grantOf: a conversation\'s grant holds its run; a Task Group\'s none; named fields only');
  ok([{ id: 'x', entry: 'totp:gh', subject: 'session:c', run: RUN }, { id: 'tg-0123456789ab', entry: 'host:h', subject: 'session:c', run: RUN }, { id: 'tg-0123456789ab', entry: 'totp:gh', subject: 'session:c' }, { id: 'tg-0123456789ab', entry: 'totp:gh', subject: 'group:g', run: RUN }, { id: 'tg-0123456789ab', entry: 'totp:gh', subject: 'external' }].every((r) => T.grantOf(r) === null),
    'grantOf refuses: a bad id · another entry kind · a conversation without its run · a group with one · `external`');
  const U = (o) => T.useVerdict({ grants: [gS, gG], entry: 'totp:gh', vaultState: 'unlocked', ...o });
  const me = { conversationId: 'c-1', groups: [], run: RUN };
  ok(U({ caller: me, vaultState: 'locked' }).code === 'vault_locked' && U({ caller: me, vaultState: 'not_set_up' }).code === 'vault_not_set_up', 'LOCKED first: a granted caller on a locked vault ⇒ vault_locked (not set up ⇒ vault_not_set_up)');
  ok(U({ caller: me }).ok && U({ caller: me }).grant.subject === 'session:c-1', 'the conversation in THIS run ⇒ ok');
  ok(U({ caller: { ...me, run: RUN2 } }).code === 'not_granted', 'the same conversation in ANOTHER run (it ended and came back) ⇒ not_granted');
  ok(U({ caller: { conversationId: 'c-2', groups: [], run: RUN } }).code === 'not_granted' && U({ caller: { conversationId: 'c-2', groups: ['T-1'], run: RUN2 } }).ok, 'another conversation ⇒ not_granted; one in the granted Task Group ⇒ ok');
  ok(U({ caller: { conversationId: 'c-3', groups: ['T-2'], run: RUN } }).code === 'not_granted' && U({ caller: me, entry: 'totp:other' }).code === 'not_granted', 'another group · another entry ⇒ not_granted');
  ok(U({ caller: { groups: ['T-1'] } }).code === 'unauthorized' && U({ caller: { ...me, live: false } }).code === 'not_running' && U({ caller: null }).code === 'unauthorized', 'no conversation id ⇒ unauthorized; a view (not running) ⇒ not_running');
}

console.log('⑨ PURE');
{
  const src = fs.readFileSync(path.join(REPO, 'src/totp.js'), 'utf8');
  const toks = [...acorn.tokenizer(src, { ecmaVersion: 'latest', sourceType: 'script' })];
  const names = toks.filter((t) => t.type.label === 'name').map((t) => t.value);
  ok(!names.includes('require') && !toks.some((t) => t.type.keyword === 'import') && !/\bcrypto\b|\bBuffer\b|process\./.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')), 'src/totp.js imports nothing and names no crypto / Buffer / process (comments never count)');
  let threw = null; try { T.totp(Buffer.from('k'), { now: 0 }); } catch (e) { threw = e; }
  ok(threw instanceof TypeError, 'no hmac injected ⇒ TypeError (never a silent default)');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass}) — ${Date.now() - t0} ms`);
process.exit(fail ? 1 : 0);
