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
import './scratch.mjs';   // FIRST (B-ba47): handed a home outside every temp root, this script runs on a temp home of its own before any of its code
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
const ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

const { redactSecrets, redactByValue, wordValue, randomRun, REDACTED, INPUT_MAX } = r('src/secret-shapes.js');
const belt = r('src/agent-output-belt.js');
const SB = r('src/secret-box.js');
const { scratch, anchored } = await import('./scratch.mjs');

// values built at runtime (secret-scan safe)
const MAT = crypto.randomBytes(20).toString('hex');
const PAT = ['gh', 'p', '_'].join('') + MAT;                 // R4 known prefix
const BEAR = 'Authorization: Bearer ' + crypto.randomBytes(16).toString('hex');   // R3 HTTP credential
const KVV = crypto.randomBytes(16).toString('hex'); const KV = 'api_token=' + KVV; // R2 secret-named KV
const PLAIN = 'the quick brown fox ' + crypto.randomBytes(3).toString('hex');      // a non-secret line

console.log('§1 redactSecrets — the shared masker’s contract (R1–R8 exhaustively: test-exit-run)');
{
  const pat = redactSecrets(PAT);
  ok(!pat.text.includes(MAT) && gateOf(pat.text.includes(REDACTED)) && pat.redacted >= 1, 'a known prefix: the material goes, the prefix stays');
  ok(gateOf(redactSecrets(BEAR).text.includes(REDACTED)) && !redactSecrets(BEAR).text.includes(BEAR.split(' ').pop()), 'an HTTP Bearer credential is redacted');
  const kv = redactSecrets(KV);
  ok(!kv.text.includes(KVV) && verdictOf(kv.text.includes('api_token')), 'a secret-named KV: the value goes, the name stays');
  ok(redactSecrets(PLAIN).text === PLAIN && redactSecrets(PLAIN).redacted === 0, 'a non-secret line is returned unchanged (a false hide costs, so the rule is narrow)');
  ok(redactSecrets(redactSecrets(PAT).text).text === redactSecrets(PAT).text, 'idempotent: a redacted text redacts to itself');
  // lane job-notify-user r6: a letters-and-digits family ends where its letters end — a `-` / `_` after it is the text's (a job named
  // «<token> deploy» is STORED `<token>-deploy`; the old common tail `(?![A-Za-z0-9_\-])` left it whole: the ONE name accessor showed it)
  const tail = [PAT + '-deploy', 'deploy-' + PAT + '-2', PAT + '_backup'].map((t) => redactSecrets(t).text);
  const OLD_TAIL = new RegExp('\\bgh[pousr]_[A-Za-z0-9]{20,255}(?![A-Za-z0-9_\\-])');
  ok(gateOf(tail.every((t) => !t.includes(MAT) && t.includes(REDACTED))) && tail[0] === 'ghp_' + REDACTED + '-deploy' && gateOf(OLD_TAIL.test(PAT)) && !OLD_TAIL.test(PAT + '-deploy') && redactSecrets('sk-' + MAT + '-x').text === 'sk-' + REDACTED,
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
      for (const typed of [false, true]) if (redactByValue('job ' + tok + tail, { typed }).text !== out) famBad.push(`${fam} + «${tail}»: the name rule (r9 redactByValue${typed ? ', typed' : ''}) differs → ${redactByValue('job ' + tok + tail, { typed }).text}`);
      if (out.includes(probe) || !out.includes(REDACTED)) famBad.push(`${fam} + «${tail}» → ${out}`);
      else if (kept && !out.endsWith(REDACTED + tail)) famBad.push(`${fam} + «${tail}»: the tail its class does not hold is not kept → ${out}`);
    }
    for (const lead of ['ci_', '-', ' ']) { const out = redactSecrets(lead + tok).text; if (out.includes(probe) || redactByValue(lead + tok).text !== out || redactByValue(lead + tok, { typed: true }).text !== out) famBad.push(`«${lead}» + ${fam} → ${out}`); }
  }
  ok(!famBad.length, `EVERY family its own tail: ${FAM.length} families × {-, _, a word character, the end} and after \`_\` / \`-\` / a blank — the material hidden, a tail its class does not hold kept in clear; the name rule (r9, as typed and stored) the same text${famBad.length ? ' — ' + famBad.join(' | ') : ''}`);
  const FP = ['my-deploy', 'gh-pages', 'npm-run-all', 'npm_config_cache', 'sk-learn', 'hf_hub_download', 'xoxo-gossip', 'AKIA-docs', 'ASIAN_FOOD', 'glpat-x', 'jbt_x', 'deploy-2'];
  ok(verdictOf(FP.every((t) => redactSecrets('run ' + t + ' now').text === 'run ' + t + ' now')), 'the false-positive controls stay in clear (my-deploy, gh-pages, npm-run-all, npm_config_cache, sk-learn, …)', FP.map((t) => redactSecrets(t).text));
  const shp = redactSecrets('x');
  ok(typeof shp.text === 'string' && typeof shp.redacted === 'number', 'returns { text, redacted }');
  ok(redactSecrets('').text === '' && redactSecrets(null).text === '', 'empty / null is handled');
  const huge = 'a'.repeat(INPUT_MAX + 5000);
  ok(redactSecrets(huge).text.length <= INPUT_MAX, 'bounded at INPUT_MAX (never parsed whole past it)');
}

console.log('§1b THE NAME RULE — a job\'s NAME is a label a person reads (lane job-notify-user r9, the rule fixed by the acceptance owner)');
{
  // accept-r8 (confirmed 0 + 2): r8 ran R8's random run on the SLUG (a name of short words became one run, erased whole) and judged a
  // word row's value by `valueShaped` (plain Capitalized words joined by `- _ .` were no value — a passphrase after `password:` stored
  // in clear; a trailing `!` stripped — «password: Summer1!» kept 7 of 8). THE RULE: (a) the shape rows anywhere — and the run row
  // (20+, three classes, none of the six readable shapes) on the name AS TYPED only; (b) a word row hides ONLY the one token after its
  // word, and only a value (8+ counting its punctuation AND two classes, or 8+ digits, or `- _ .` joining 3+ parts with a capital / digit)
  const AN = (n) => { let o = ''; while (o.length < n) o += crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, ''); return o.slice(0, n); };
  const T = (t) => redactByValue(t, { typed: true }).text, S = (t) => redactByValue(t).text, R = REDACTED;
  let V = AN(13) + '9!'; while (!/[a-z]/.test(V) || !/[A-Z]/.test(V)) V = AN(13) + '9!';   // a 15-character value with every class
  // a 20+ run of THREE classes, drawn until it is one — AN alone lacks a class about once in 560 draws at 36 characters (measured: 355 of 200 000), and the run row
  // rightly keeps such a run: the leg went red by the draw (B-ba09's follow gate, box zone; green at UTC on the same tip)
  const RUN3 = (n) => { let v = AN(n); while (!/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/[0-9]/.test(v)) v = AN(n); return v; };
  const FAMV = ['gh', 'p_'].join('') + AN(36), JW = ['ey', 'J'].join('') + AN(20) + '.' + ['ey', 'J'].join('') + AN(20) + '.' + AN(24), EY = ['ey', 'J'].join('');
  const H40 = crypto.randomBytes(20).toString('hex'), H64 = crypto.randomBytes(32).toString('hex');
  const PW = ['Correct', 'Horse', 'Battery', 'Staple'], UPW = ['CORRECT', 'HORSE', 'BATTERY'].join('-');   // passphrase fixtures built at run time (secret-scan)
  // (b) — the brief's words: the ONE token after the word, and only a value
  const KEEP = ['password reset', 'token refresh', 'auth: fix login flow', 'bearer of bad news', 'password change', 'nightly password rotation', 'session: cleanup old rows', 'token: refresh',
    'password nightly-rotation', 'password GITHUB_TOKEN', 'auth: fix-login-flow', 'password:\n  reset the vault', '    Password    REG_SZ    rotate', 'password hunter2',
    'auth: fix login flow 2026-10-29', 'session: nightly cleanup v2.369.361', 'session: refactor src/jobs.js', 'key: renew ~/.ssh/config', 'sig: verify release v1.2.3-rc1', 'my-deploy', 'gh-pages'];
  const kept = KEEP.filter((t) => T(t) !== t || S(t) !== t);
  ok(!kept.length, `(b) a word row keeps an ordinary token — ${KEEP.length} names whole («password reset», «token refresh», «auth: fix login flow», «bearer of bad news», a date / a version / a path AFTER the token, a joined lowercase word…)${kept.length ? ' — ' + kept.map((t) => `«${t}» → ${T(t)}`).join(' | ') : ''}`);
  const HIDE = [['rotate password: ' + PW.join('-'), 'rotate password: ' + R], ['set DB_PASSWORD=Correct.Horse.Battery.Staple', 'set DB_PASSWORD=' + R], ['password: Summer1!', 'password: ' + R],
    ['password Passw0rd', 'password ' + R], ['password 12345678', 'password ' + R], ['login password Correct_Horse_Battery_Staple', 'login password ' + R], ['api_key=' + UPW, 'api_key=' + R],
    ['token: 1234-5678-9012', 'token: ' + R], ['ticket: PROJ-1234 rollout', 'ticket: ' + R + ' rollout'], ['password ' + V + ' rotation', 'password ' + R + ' rotation'], ['rotate Bearer ' + V, 'rotate Bearer ' + R],
    ['?token=' + V.slice(0, 14) + '&x=1', '?token=' + R + '&x=1'], ['password:\n  ' + V, 'password:\n  ' + R], ['token: |\n  ' + V, 'token: |\n  ' + R], ['    Password    REG_SZ    ' + V, '    Password    REG_SZ    ' + R],
    ['token ' + AN(30), 'token ' + R], ['password: "' + V + ' x"', 'password: "' + R + '"'], ['password password ' + V, 'password password ' + R],
    // r253 (主开发, round wlc6blvqo): an ASSIGNMENT, a holder query parameter and the header word hide ANY value (the release's R2 / R7 / R3)
    ['auth=fix', 'auth=' + R], ['?token=refresh&x=1', '?token=' + R + '&x=1'], ['check bearer rotation', 'check bearer ' + R]];
  const hBad = HIDE.filter(([t, want]) => T(t) !== want || S(t) !== want).map(([t, want]) => `«${t.slice(0, 34)}» → ${T(t)} (want ${want})`);
  ok(!hBad.length, `(b) a VALUE after every word row is hidden — the token only, the word and the words after it stay (R2 \`password:\` / \`DB_PASSWORD=\` / \`ticket:\`, its next line, a YAML block, R3, R5 both, R6, R7; a Capitalized / UPPER / digit passphrase joined by \`- _ .\`; Summer1! with its !; 8+ digits)${hBad.length ? ' — ' + hBad.join(' | ') : ''}`);
  const J = { 'Summer1!': true, 'hunter2!': true, 'Passw0rd': true, '12345678': true, 'Correct-Horse-Battery-Staple': true, 'CORRECT-HORSE-BATTERY': true, '1234-5678-9012': true, 'reset-v2': true, 'ResetFlow': true,
    hunter2: false, reset: false, refresh: false, rotation: false, 'fix-login-flow': false, 'CORRECT-HORSE': false, 'nightly-rotation': false, 'GITHUB_TOKEN': false, ['ghp_' + R]: false };
  const jBad = Object.entries(J).filter(([t, want]) => wordValue(t) !== want);
  ok(!jBad.length, `(b) wordValue, the judge, by its clauses: 8+ counting punctuation; two classes (\`- _ .\` are joiners, no class); 8+ digits; 3+ joined parts with a capital or a digit${jBad.length ? ' — ' + jBad.map(([t]) => t).join(', ') : ''}`);
  // (a) the shape rows anywhere — a family (its head kept), a JWT (after `_` too), a 40 / 64-hex digest standing alone, a random run AS TYPED
  const SHAPE = [['deploy ' + H40, 'deploy ' + R], ['pull (' + H64 + ') now', 'pull (' + R + ') now'], ['ci_' + JW, 'ci_' + EY + R], ['x ' + FAMV + ' now', 'x ghp_' + R + ' now'], ['token=' + FAMV, 'token=ghp_' + R],
    ['deploy ' + RUN3(36), 'deploy ' + R], ['deploy ' + AN(12) + '!x' + AN(8), 'deploy ' + R]];
  const sBad = SHAPE.filter(([t, want]) => T(t) !== want).map(([t, want]) => `«${t.slice(0, 30)}…» → ${T(t)} (want ${want})`);
  ok(!sBad.length, `(a) a SHAPE is hidden wherever it sits — a family (its head kept, before a word row judges what is left), a JWT after \`_\`, a 40 / 64-hex digest standing alone, a 20+ run of three classes${sBad.length ? ' — ' + sBad.join(' | ') : ''}`);
  const NEVER = ['backup 2026-10-29T03:26:00Z', 'at T03:26:00.123456789Z', 'ship VibeSpace-2.369.362-Linux-x64', 'tag v1.2.3-RC.1+Build.20261029', 'restore 550E8400-e29b-41D4-a716-446655440000',
    'tail /var/log/VibeSpace/Server-2026.log', 'build C:\\Users\\Dev\\Project2026\\out', 'mirror https://Example.com/Repo2026/archive', 'notify John.Doe2026@Example.com weekly', 'GitHub CI on macOS 15 and iOS 18 for PR 42',
    'bisect-' + H40, 'deploy ' + H40.slice(0, 32), 'rerun TestHandlerReturnsNotFound', 'nightly-db-backup-2026-10-29', 'deploy ' + AN(12) + '9'];
  const nBad = NEVER.filter((t) => T(t) !== t);
  ok(!nBad.length && verdictOf(NEVER.slice(0, 9).every((t) => t.split(' ').some((w) => w.length >= 20 && [/[a-z]/, /[A-Z]/, /[0-9]/, /[!-,\/:-@\[-^`{-~]/].filter((re) => re.test(w)).length >= 3))),
    `(a) the six a person reads are NEVER hidden by the run row — a date, a time, a version, a uuid, a path, a URL, an email (each a 20+ run of three classes); short words, a sha joined by \`-\`, an md5, a run of two classes, a run under 20${nBad.length ? ' — ' + nBad.map((t) => `«${t}» → ${T(t)}`).join(' | ') : ''}`);
  // the run row NEVER on a stored slug (labelOf, a scheduled run's record): an older record of short words reads whole; a family still goes
  const SLUGS = ['GitHub-CI-on-macOS-15-and-iOS-18-for-PR-42', 'QA-run-3-for-PR-482-on-iOS-17-and-M2-Mac', 'deploy-EU-west2-canary', 'deploy-' + RUN3(36)];
  ok(gateOf(SLUGS.every((t) => S(t) === t)) && T('deploy-EU-west2-canary') === 'deploy-EU-west2-canary' && T(['Q7w8E9', 'r0T1y2', 'U3i4O5', 'p6A7s8'].join('-')) === R && S('deploy-' + FAMV) === 'deploy-ghp_' + R && gateOf(randomRun('A1b2C3d4E5f6G7h8I9j0')) && !randomRun('A1b2C3d4E5f6G7h8I9j') && !randomRun('550e8400-e29b-41d4-a716-446655440000'),
    '(a) the run row never runs on a STORED name — a slug reads whole (a name of short words, a kebab name, even a run), a family is still hidden; typed, a kebab name with a plain word between its joiners is a label (r253: the output belt\'s own run test), one with none is one 20+ run (hidden)', SLUGS.map(S));
  // idempotent and bounded (its linearity is counted, never clocked: test-exit-run's r9 name-rule legs, by the work meter)
  ok(gateOf([...KEEP, ...HIDE.map(([t]) => t), ...SHAPE.map(([t]) => t), ...NEVER].every((t) => T(T(t)) === T(t) && S(S(t)) === S(t))) && T('a'.repeat(INPUT_MAX + 99)).length <= INPUT_MAX,
    'the name rule is idempotent (a hidden name hides to itself), as typed and stored, and bounded at INPUT_MAX');
  // (e) ONE SOURCE for the shape rows: the name rule calls the very rows redactSecrets calls, and every row of redactSecrets is answered
  const ssrc = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  const body = (fn) => { const i = ssrc.indexOf(`function ${fn}(`); return ssrc.slice(i, ssrc.indexOf('\n}\n', i)); };
  const bS = body('redactSecrets'), bV = body('redactByValue'), bK = body('nameKv');
  // r10 (lane lg-recovery, on 2.369.413): the rows are compared AS ROWS — the release's redactSecrets hands each its reporter
  // (`redactPem(text, say)`, `if (say) say(…)`, the message mode), so an exact call no longer reads the same in both bodies
  const SHAPE_ROWS = [/\bredactPem\(text\b/, /\bredactJwt\(text\)/, /text\.replace\(PREFIX_RE, \(m\) => \{ n\+\+; const h = PREFIX_HEAD\.exec\(m\);/];
  const once = (re) => (ssrc.match(re) || []).length === 1;
  ok(gateOf(SHAPE_ROWS.every((re) => re.test(bS) && re.test(bV))) && gateOf(once(/\nconst PREFIX_RE = /g)) && gateOf(once(/\nfunction redactJwt\(/g)) && gateOf(once(/\nfunction redactPem\(/g)) && verdictOf(once(/\nconst PREFIX_HEAD = /g)),
    '(e) the SHAPE rows are ONE source — R1, the JWT scan and R4 (with its head) are the very calls redactSecrets makes, each spelled once in the file');
  const ANSWER = { JOINER_IN_WORD_RE: bV, redactPem: bV, redactJwt: bV, PREFIX_RE: bV, redactKv: bK.includes('KV_HEAD') && bV.includes('nameKv(text)') ? bV : '', redactContinuations: bK.includes('blanksEnd(text, s)') && bK.includes('BLOCK_VAL') ? bV : '',
    REG_RE: bV, REG_NAME_RE: bV, RUN_RE: bV.includes('NAME_RUN_RE') ? bV : '',
    HTTP_RE: /\bHTTP_NAME_RE = \(\(\) => \{ const src = HTTP_RE\.source/.test(ssrc) && bV.includes('nameWord(text, HTTP_NAME_RE,') ? bV : '',
    // r10: at a name the two word rows are built FROM the output belt's own (only their blank run widened — NAME_BLANKS), and R7 is
    // the release's own query walk with its name grammar (nameQuery over QUERY_HEAD_RE, holderName)
    WORD_NEXT_RE: /\bWORD_NEXT_NAME_RE = NAME_BLANKS\(WORD_NEXT_RE\)/.test(ssrc) && bV.includes('nameWord(text, WORD_NEXT_NAME_RE,') ? bV : '',
    WORD_RUN_RE: /\bWORD_RUN_NAME_RE = NAME_BLANKS\(WORD_RUN_RE\)/.test(ssrc) && bV.includes('nameWord(text, WORD_RUN_NAME_RE,') ? bV : '',
    redactQuery: bV.includes('row(nameQuery(text))') && body('nameQuery').includes('QUERY_HEAD_RE') && body('nameQuery').includes('holderName(m[2])') ? bV : '',
    // B-da2d: R9 is the very same call at a name (a password by its place — no word test)
    redactUserinfo: bS.includes('text = redactUserinfo(text, (head) =>') && bV.includes('text = redactUserinfo(text, () =>') ? bV : '',
    // B-829f: the escaped-JSON reader is the very same row at a name (LAST in both)
    redactEscapedPairs: bS.includes('const esc = redactEscapedPairs(text, say);') && bV.includes('row(redactEscapedPairs(text));') ? bV : '' };
  const sRows = [...new Set([...bS.matchAll(/\b(redact[A-Z]\w*|[A-Z][A-Z_]*_RE)\b/g)].map((m) => m[1]))].filter((k) => k !== 'redactSecrets');
  const MAPPED = new Set(['redactKv', 'redactContinuations', 'RUN_RE', 'WORD_NEXT_RE', 'WORD_RUN_RE', 'HTTP_RE', 'redactQuery']);   // answered by the name's own row
  const unanswered = sRows.filter((k) => !(k in ANSWER) || !ANSWER[k] || (!MAPPED.has(k) && !bV.includes(k)));
  ok(sRows.length >= 12 && !unanswered.length, `(e) every row of redactSecrets is answered by the name rule (${sRows.length}: the same row, or — R2 / R2b — nameKv over the same KV_HEAD with the next-line and block rules, R8 — the name's run row)${unanswered.length ? ' — a row the name rule does not answer: ' + unanswered.join(', ') : ''}`);
  // THE MUTANTS, each RED by name: r8's plain-words exemption (a Capitalized passphrase kept) / the run row on a stored slug
  const mdir = scratch('ss-name-mut'); fs.mkdirSync(mdir, { recursive: true });
  fs.copyFileSync(path.join(REPO, 'src/credential-words.js'), path.join(mdir, 'credential-words.js'));
  const WV = "  if (t.includes(REDACTED) || [...t].length < 8) return false;", mutA = anchored(ssrc, WV, WV + " if (t.split(/[-_.']+/).every((w) => !w || /^(?:[a-z]+|[A-Z]+|[A-Z][a-z]+)$/.test(w))) return false;", 'r8 plain-words exemption');
  fs.writeFileSync(path.join(mdir, 'secret-shapes.js'), mutA); const MA = require(path.join(mdir, 'secret-shapes.js'));
  // r253: an ASSIGNMENT hides any value (anyValue) — the word test this mutant loosens is the PROSE forms' only; the assignment forms stay hidden under it
  const aRed = ['rotate password: ' + PW.join('-'), 'login password ' + PW.join('_'), 'passphrase ' + PW.join('.')].filter((t) => MA.redactByValue(t, { typed: true }).text !== T(t));
  const aHeld = ['set DB_PASSWORD=' + PW.join('.'), 'api_key=' + UPW].every((t) => MA.redactByValue(t, { typed: true }).text === T(t) && T(t).includes(R));
  ok(mutA !== ssrc && aRed.length === 3 && MA.redactByValue(aRed[0], { typed: true }).text === aRed[0] && verdictOf(aHeld), `MUTANT — r8's plain-words exemption: a Capitalized passphrase in PROSE kept, RED by name — ${aRed.map((t) => `«${t}» → ${MA.redactByValue(t, { typed: true }).text}`).join(', ')}; the assignments stay hidden under it (r253)`);
  const mdir2 = scratch('ss-name-mut2'); fs.mkdirSync(mdir2, { recursive: true }); fs.copyFileSync(path.join(REPO, 'src/credential-words.js'), path.join(mdir2, 'credential-words.js'));
  const mutB = anchored(ssrc, '    if (typed) text = text.replace(NAME_RUN_RE,', '    if (true) text = text.replace(NAME_RUN_RE,', 'the run row on a stored slug');
  fs.writeFileSync(path.join(mdir2, 'secret-shapes.js'), mutB); const MB = require(path.join(mdir2, 'secret-shapes.js'));
  const bRed = SLUGS.filter((t) => MB.redactByValue(t).text !== t);
  ok(mutB !== ssrc && bRed.length >= 3, `MUTANT — the run row on a stored slug (r8's labelOf): RED by name — ${bRed.map((t) => `«${t.slice(0, 30)}» → ${MB.redactByValue(t).text}`).join(', ')}`);
  ok(belt.maskForSink('password reset', { byValue: true }) === 'password reset' && belt.maskForSink('password reset', {}) === 'password ' + REDACTED && gateOf(belt.maskForSink('ship ' + PAT, { byValue: true }).includes(REDACTED))
    && belt.maskForSink('deploy ' + RUN3(36), { byValue: true, typed: true }) === 'deploy ' + REDACTED && belt.maskForSink('GitHub-CI-on-macOS-15-and-iOS-18-for-PR-42', { byValue: true }) === 'GitHub-CI-on-macOS-15-and-iOS-18-for-PR-42',
    'the output belt carries the name rule (`maskForSink(t, { byValue, typed })` — typed: the run row; a stored name: never; a sink text keeps the narrow table\'s hide-more rule)');
}

console.log('§2 THE OUTPUT BELT’S LEG — maskForSink applies the shape rule (and never throws)');
{
  ok(verdictOf(belt.maskForSink('ship it: ' + PAT, {}).includes(REDACTED)), 'the belt redacts a secret shape in a sink text');
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
  ok(verdictOf(labels.includes('apikey:k')), 'an apikey: entry is maskable');
  ok(!labels.includes('host:h') && !labels.includes('file:f'), 'host: and file: entries are never maskable (the vault never shows them to an agent)');

  // THE LIVE-VALUE LEG (vault-run.js is sibling P0-e; existsSync-guarded until the rebase)
  if (fs.existsSync(path.join(REPO, 'src/vault-run.js'))) {
    const masked = belt.maskForSink('value is ' + VAL + ':apikey:k here', { dataDir: dir });
    ok(!masked.includes(VAL + ':apikey:k') && verdictOf(masked.includes('[vault:apikey:k]')), 'the live-value leg replaces an apikey: value with its [vault:<entry>] placeholder');
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
  // the owner's URL, retyped from the owner's own shot (Google's PUBLIC gcloud client id; state / code_challenge are per-flow public nonces —
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
  const beltOver = (shapes) => { const b = fs.readFileSync(path.join(REPO, 'src/agent-output-belt.js'), 'utf8'); return M.load('src/agent-output-belt.js', editAnchor(b, "require('./secret-shapes.js')", `require(${J(shapes)})`, "src/agent-output-belt.js"), 'belt'); };
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
  ok(verdictOf(Object.values(regA).every((v) => v.leak === 0)), `CENSUS (A) REGRESSION — ${Object.keys(CLASSES).length} value classes × ${SHAPES.length} holder shapes (${Object.values(regA).reduce((a, v) => a + v.n, 0)} texts) leak 0: ${regLine(regA)}`);
  const regDM = leaksOf(SS, (text) => DM.scrub(text, 2000));
  ok(verdictOf(Object.values(regDM).every((v) => v.leak === 0)), `CENSUS (A) through decision-model's ONE SCRUB (redactSecrets runs:true, the vendor-bound text): leak 0 of ${Object.values(regDM).reduce((a, v) => a + v.n, 0)}`);
  // RED CONTROL: a mutant that re-adds a value floor (keeps a lowercase word under a holder name) — census (A) goes red by name
  const floorMut = M.load('src/secret-shapes.js', editAnchor(editAnchor(SRC, '    n++;\n    out += text.slice(last, headEnd)', '    if (/^[a-z]{4,12}$/.test(inner)) { KV_HEAD.lastIndex = valEnd; continue; }\n    n++;\n    out += text.slice(last, headEnd)', "src/secret-shapes.js"), '    const keep = queryTail(text, vs, ve, at(text, m.index));', '    if (/^[a-z]{4,12}$/.test(text.slice(vs, ve))) { QUERY_HEAD_RE.lastIndex = ve; continue; }\n    const keep = queryTail(text, vs, ve, at(text, m.index));', "src/secret-shapes.js"), 'valuefloor');
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
      ok(gateOf(it.detail.includes(OWNER)) && u.searchParams.get('token_usage') === 'remote' && u.searchParams.get('access_type') === 'offline' && u.searchParams.get('code_challenge_method') === 'S256' && [...u.searchParams.keys()].length === 10,
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
  for (const [n, [t, frag]] of Object.entries(MASKED)) { const o = SS.redactSecrets(t).text; ok(!o.includes(frag) && gateOf(o.includes(REDACTED)) && !o.endsWith(']') && SS.redactSecrets(o).text === o, `CENSUS (B) still masked — ${n} (idempotent)`); }

  // r3 (B): a url / uri / endpoint head is public ONLY without a userinfo — a credential-named CONNECTION STRING is masked whole
  const pw = ['pw', 'Q7x', 'kL2'].join('');
  const CONN = ['SESSION_REDIS_URL=redis://:' + pw + '@cache', 'AUTH_DATABASE_URL=postgres://app:' + pw + '@db', 'TOKEN_STORE_URI=mongodb://u:' + pw + '@m1', '{"session_url": "redis://:' + pw + '@cache"}', 'SECRET_ENDPOINT=https://u:' + pw + '@vault.example', 'AUTH_URL=https://admin:' + pw + '@db/', 'REDIS_AUTH_URL=redis://:' + pw + '@c', '{"token_uri": "https://u:' + pw + '@oauth2.example/token"}', 'https://x.example/a?auth_url=https%3A%2F%2Fadmin%3A' + pw + '%40db%2F'];
  const connLeak = CONN.filter((t) => SS.redactSecrets(t).text.includes(pw) || DM.scrub(t, 2000).includes(pw));
  ok(connLeak.length === 0, `r3 (B): ${CONN.length} credential-named connection strings with a userinfo masked (the belt and the vendor scrub)${connLeak.length ? ' — leaked: ' + connLeak.join(' · ') : ''}`);
  // r3 (C): a PUBLIC name's value is walked on — a holder nested inside it is masked, the public name stays
  const nest = SS.redactSecrets('https://x.example/a?next=https://app.example/reset?token=' + tok).text;
  ok(nest === 'https://x.example/a?next=https://app.example/reset?token=«redacted»' && gateOf(SS.redactSecrets('https://x.example/a?continue=https://app.example/cb?code=1&token=' + tok).text.endsWith('&token=«redacted»')) && belt.maskForSink(OWNER) === OWNER, 'r3 (C): a holder nested RAW in a public value is masked in place (next / continue stay), the owner\'s URL unchanged', nest);
  // r4 (M1 + M2, law α): a credential-named ADDRESS holds — a capability URL, an encoded nested holder, a connection string all hide behind it
  const CAP = { 'a Slack webhook (SECRET_WEBHOOK_URL)': 'SECRET_WEBHOOK_URL=https://hooks.slack.com/services/T0/B0/' + tok, 'a private calendar (PRIVATE_ICAL_URL)': 'PRIVATE_ICAL_URL=https://cal.example/ical/x/private-' + runOf(HEX, 24) + '/basic.ics', 'a bot token in a path (TOKEN_URL)': 'TOKEN_URL=https://api.telegram.org/bot123456:' + tok + '/getMe', 'a query key (AUTH_ENDPOINT)': 'AUTH_ENDPOINT=https://x.example/cb?k=' + tok,
    'an encoded nested token (?password_reset_url=…%3Ftoken%3D…)': 'https://x.example/a?password_reset_url=https%3A%2F%2Fapp.example%2Freset%3Ftoken%3D' + tok, 'an encoded nested access_token (?auth_url=…%26access_token%3D…)': 'https://x.example/a?auth_url=https%3A%2F%2Fapp%2Fcb%3Fcode%3D1%26access_token%3D' + tok, 'an encoded nested sid (?token_url=…%3Bsid%3D…)': 'https://x.example/a?token_url=https%3A%2F%2Fapp%2Fx%3Bsid%3D' + tok };
  for (const [n, t] of Object.entries(CAP)) { const o = SS.redactSecrets(t).text, d = DM.scrub(t, 2000); ok(!o.includes(tok) && !o.includes('private-') && !d.includes(tok) && verdictOf(o.includes(REDACTED)), `r4 (M1/M2, α) ${n}: masked through the belt and the vendor scrub`); }
  // r4: a PUBLIC query value is judged DECODED ONCE — an encoded nested holder or a userinfo masks it whole (fail closed); a plain one stays
  const pub = (t) => SS.redactSecrets(t).text;
  ok(pub('https://x.example/a?next=https%3A%2F%2Fapp.example%2Freset%3Ftoken%3D' + tok) === 'https://x.example/a?next=«redacted»' && pub('https://x.example/a?next=https%3A%2F%2Fu%3A' + tok + '%40db%2F') === 'https://x.example/a?next=«redacted»' && pub('https://x.example/a?next=https://u:' + tok + '@db/x') === 'https://x.example/a?next=«redacted»'
    && pub('https://x.example/a?redirect_uri=https%3A%2F%2Fapp.example%2Fcb&state=abc') === 'https://x.example/a?redirect_uri=https%3A%2F%2Fapp.example%2Fcb&state=abc' && verdictOf(pub('https://x.example/a?next=%E0%A4%A&t=%3Ftoken%3D' + tok).endsWith('&t=«redacted»')),
    'r4: a public query value decoded once — an encoded nested token, an encoded / raw userinfo ⇒ masked whole; a plain encoded redirect_uri kept; a malformed escape never hides a nested token');
  // r5 (M2): a userinfo holds a secret only WITH A PASSWORD — a bare username is an identity (the owner's complaint class: a public URL
  // masked whole and drawn as an unopenable link); an EMPTY password (`user:@` — HTTP Basic's API-key form, curl's `-u key:`) still holds
  {
    const KEEP = ['https://ci.example/build?repo=ssh://git@github.com/o/r.git&ref=main', 'https://a.example/x?profile=https://alice@social.example', 'https://ci.example/build?repo=ssh%3A%2F%2Fgit%40github.com%2Fo%2Fr.git&ref=main'];
    const moved = KEEP.filter((u) => SS.redactSecrets(u).text !== u || belt.maskForSink(u) !== u || DM.scrub(u, 2000) !== u || (typeof FY.maskedNoteOf === 'function' ? FY.maskedNoteOf(belt.maskForSink(u)) : '') !== '');   // a tree without the export reds BY NAME (the belt legs), never a crash
    ok(!moved.length, `r5 (M2): ${KEEP.length} public URLs carrying a bare USERNAME (ssh://git@…, https://alice@…, encoded git%40) byte-identical through the belt, maskForSink and the vendor scrub — drawn as links, no note`, moved);
    const EMPTY = ['https://a.example/x?next=https://user:@api.example/v1', 'https://a.example/x?next=https%3A%2F%2Fuser%3A%40api.example%2Fv1'];
    ok(verdictOf(EMPTY.every((u) => SS.redactSecrets(u).text === 'https://a.example/x?next=«redacted»')), 'r5 (M2): an EMPTY password (`user:@`, raw and encoded) still holds — masked whole', EMPTY.map((u) => SS.redactSecrets(u).text));
    ok(!/USERINFO_RE/.test(SRC) && verdictOf(/function passwordUserinfo\(d\)/.test(SRC)), 'r5 (M2): r4\'s USERINFO_RE (any `user@`) is gone — passwordUserinfo judges the userinfo');
  }
  // r5 (M3): the decoded-once judgement reads the WHOLE value — a password-carrying userinfo one redirect deeper (raw, encoded, mixed) masks it
  {
    const DEEP = { 'encoded, one redirect deeper (?next=https://a/b%3Fr%3Dhttps%3A%2F%2Fu%3Apw%40h)': 'https://a.example/cb?next=https://a.example/b%3Fr%3Dhttps%3A%2F%2Fu%3A' + pw + '%40h', 'a path redirect, encoded (?redirect=/b?r=https%3A%2F%2Fu%3Apw%40h)': 'https://a.example/cb?redirect=/b?r=https%3A%2F%2Fu%3A' + pw + '%40h', 'raw, one redirect deeper (?next=https://a/b?r=https://u:pw@h)': 'https://a.example/cb?next=https://a.example/b?r=https://u:' + pw + '@h', 'raw, an empty user (…?r=redis://:pw@h)': 'https://a.example/cb?next=https://a.example/b?r=redis://:' + pw + '@h' };
    for (const [n, u] of Object.entries(DEEP)) { const o = SS.redactSecrets(u).text, d = DM.scrub(u, 2000), b = belt.maskForSink(u); ok(!o.includes(pw) && !d.includes(pw) && !b.includes(pw) && verdictOf(/\?(?:next|redirect)=«redacted»$/.test(o)), `r5 (M3) ${n}: the whole public value masked (the belt, maskForSink, the vendor scrub)`, o); }
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
  ok(gateOf(/SECRET_WORDS\.has\(head\) \|\| CONTAINER_HEADS\.has\(head\)/.test(SRC)) && verdictOf(['session_id', 'token_value', 'key_id', 'client-key-data'].every((n) => holder(n) === true)), 'r3 (J): CONTAINER_HEADS is consulted by holderName (session_id, token_value, key_id, client-key-data hold)');
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
    ok(links.length === 1 && links[0].ref === 'https://app.example.com/a' && mk.length === 1 && gateOf(mk[0].s.startsWith('https://x.example/cb?token=«redacted»')) && !links.some((x) => x.ref.includes('redacted')), `r4 (M3) ${lg}: the clean URL is ONE link to https://app.example.com/a, the masked one words — no link holds the mark`, sg); }
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
    ok(gateOf(segs('see `a.txt` now').some((x) => x.t === 'link' && x.kind === 'rel' && x.ref === 'a.txt')) && gateOf(segs('see `docs/«redacted».md` now').some((x) => x.t === 'masked')) && !segs('see `docs/«redacted».md` now').some((x) => x.t === 'link'), 'r5 (m4): a plain code-span filename stays a rel link; a masked path in one is words + the note');
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
    ok(gateOf(frags.every((f) => !o.includes(f))) && gateOf(keep.every((k) => o.includes(k))) && segs.filter((g) => g.t === 'masked').length === 1 && !segs.some((g) => g.t === 'link') && gateOf(/class="fy-masked"/.test(html)) && gateOf(/class="masked-link-note">Part of this link was masked, so it will not open — ask the agent to send the link without the secret\.</.test(html)) && !/data-ref="https/.test(html),
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
  ok(gateOf(/class="fy-masked">https:\/\/files\.example\.com\/\[vault:secret:0123456789\]\/report\.pdf<\/span>/.test(vhtml)) && gateOf(/it holds the vault entry secret:0123456789: reveal it in Vault/.test(vhtml)) && !/fy-link/.test(vhtml), 'LAW 2: a link whose path holds a vault mark (no holder name, so the belt keeps the mark) names its road — the entry, revealed in Vault', vhtml);
  ok(fnOf(FY.maskedNoteOf)('progress: ' + SS.redactSecrets('https://app.example.com/login?token=' + tok).text) !== '' && fnOf(FY.maskedNoteOf)('progress: ' + OWNER) === '', 'maskedNoteOf: a text drawn as words says its masked link; a whole link says nothing');
  // LAW 2 — THE SURFACE CENSUS: every surface that draws a belted store's words asks the ONE masked-link rule
  const SURFACES = {
    'the For-you card — tray, window, the chat\'s ask card (user-todos-row wordsHtml + linkifyInto)': ['src/lib/user-todos-row.js', [/linkedHtml\(String\(text \|\| ''\), \{ escape: escHtml, note: \(g\) => maskedLinkNote\(g, tr\), whole, has: isSettingKey, draw: fyDraw \}\)/, /n\.textContent = maskedLinkNote\(g, tr\);/]],
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
  const baseRule = M.load('src/secret-shapes.js', editAnchor(editAnchor(SRC, '    if (!holderName(m[4])) continue;', '    if (!secretName(m[4])) continue;', "src/secret-shapes.js"), 'let hold = holderName(m[2]), ve = -1;', 'let hold = secretName(m[2]), ve = -1;', "src/secret-shapes.js"), 'baserule');
  ok(gateOf(baseRule.redactSecrets(OWNER).text.includes('token_usage=' + REDACTED)) && beltOver(M.files[M.files.length - 1]).maskForSink(OWNER) !== OWNER && baseRule.redactSecrets('TOKEN_TTL=3600').text !== 'TOKEN_TTL=3600',
    'RED CONTROL (the base\'s word test in place of the grammar): token_usage=«redacted» through the belt — census (B) goes red');
  const fySrc = fs.readFileSync(path.join(REPO, 'src/lib/foryou-links.js'), 'utf8');
  ok(gateOf(fySrc.includes('const mask = marked ? maskedLink(ref) : null;')) && verdictOf(fySrc.includes('const mk = marked && m.index >= scannedTo ? pathToken(s, m.index) : null;')), 'the base-card control\'s two patches each find their line');
  const FY0 = await import(M.write('src/lib/foryou-links.js', editAnchor(editAnchor(fySrc, 'const mask = marked ? maskedLink(ref) : null;', 'const mask = null;', "src/lib/foryou-links.js"), 'const mk = marked && m.index >= scannedTo ? pathToken(s, m.index) : null;', 'const mk = null;', "src/lib/foryou-links.js"), 'nomask', { esm: true }));
  const s0 = FY0.segmentText(belt.maskForSink(SECRET['a magic sign-in link'][0] + ' and /home/u/out/[vault:secret:run]/report.md'));
  ok(gateOf(s0.some((g) => g.t === 'link' && g.ref.includes(REDACTED))) && gateOf(s0.some((g) => g.t === 'link' && g.kind === 'path')) && !s0.some((g) => g.t === 'masked'), 'RED CONTROL (the base\'s card): a masked URL and a masked path are whole-looking LINKS — the LAW 2 legs go red');
}

console.log('lane mask-value-shape B-4f7f: A HEAD WHOSE LAST WORD IS AN ACT OR A THING HOLDS NOTHING (the found table) — its price, every real shape still taken');
{
  // 主开发 r2803 / r2884 / r2982 / r3017: the table NOT_CREDENTIAL_HEADS, found in the line files (int359/sched-1117/lines, the
  // corpus page b4f7f/corpus-measure-2.md), read at holderVerdict's last line; every other last word still FAILS CLOSED. THE LAW: no
  // word is on it under which a real credential can plausibly pass with no other rule taking its value. THE REACH, by its definition
  // (r3083): every caller of redactSecrets / redactByValue — the module's comment names them (a process's command line, a job's
  // output, the vault doors' cards and the rest beside messages)
  const SS = r('src/secret-shapes.js'), J = JSON.stringify;
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('b4f7f', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  // made-up values only, built at runtime by joining pieces: a word and digits, a PIN's digits — no shape rule takes them by
  // themselves, so only their HEAD can hide them; a base64 service-account blob; an escaped-JSON service-account value
  const val = () => ['maple', 'river', 'copper', 'lantern', 'harbor'][crypto.randomInt(5)] + crypto.randomInt(100, 999), pin = () => String(100000 + crypto.randomInt(899999));
  const b64 = () => Buffer.from(JSON.stringify({ type: ['service', 'account'].join('_'), project_id: 'demo-' + crypto.randomInt(1000, 9999), private_key_id: crypto.randomBytes(8).toString('hex') }, null, 2)).toString('base64');
  const escJson = (v) => JSON.stringify(JSON.stringify({ type: ['service', 'account'].join('_'), client_secret: v }));
  // A LEG OF ITS KIND FOR EVERY WORD ON THE TABLE: a head the line files held only by failing closed (or one of its kind, never a
  // tree file's name) — and THE PRICE: a credential word, then the table word, then a made-up value (r3017 (a))
  const KINDS = { scan: 'secret-scan', watch: 'session-events-watch', checking: 'StrictHostKeyChecking',
    js: 'token-door.js', mjs: 'key-census.mjs', law: 'key-file-law', line: 'session-spawn-line', dialog: 'new-session-dialog',
    schema: 'token-schema', form: 'token-form', pty: 'setupSessionPty', alias: 'HostKeyAlias', startup: 'session.restore_on_startup',
    brain: 'key-brain', source: 'apiKeySource', locked: 'hostTokenLocked', for: 'usageCacheKeyFor', asked: 'session._exitAsked',
    nice: 'session._cpuNice', unread: 'keyHelperUnread', use: 'session.mayUse', off: 'keyHelperOff', pinned: 'hosts.onHostKeyPinned',
    of: 'lineageKeyOf', why: 'keyWhy' };
  const CRED = ['token', 'key', 'secret', 'password'];
  const PRICE = Object.fromEntries(Object.keys(KINDS).map((w, i) => [w, (CRED[i % CRED.length] + '_' + w).toUpperCase()]));
  const TWINS = Object.keys(KINDS).map((w, i) => w + '_' + CRED[i % CRED.length]);
  // the corpus page's «cured public» heads that stay public (auth.json and auth-check hold again: json and check are off, r3017)
  const PAGE_PUBLIC = ['secret-scan', 'test-secret-scan', 'session-lifecycle.js', 'StrictHostKeyChecking', 'HostKeyAlias', 'test-key-file-law', 'keyHelperOff', 'usageCacheKeyFor'];
  // the sighting's own shape (bl-proposals msg 2231): ordinary words, a sha range, counts, capitals — after a freed head it is kept WHOLE
  const SIGHT = ': clean over 942cb0908..the tip, 9 FAILED (30 passed), BOTH zones GREEN';
  // THE WORDS LEFT OFF (each still failing closed): r2982's six, the page's six, r3017's three and the four of its watch list, and re
  const OFF = ['pin', 'pins', 'helper', 'args', 'options', 'reset', 'local', 'pre', 'info', 'set', 'box', 'store', 'json', 'only', 'check', 'build', 'dns', 'ui', 'real', 're'];
  // EVERY REAL SHAPE STILL TAKEN: r2982's names; the corpus heads that turn back to a mark with r3017's cure; the twins (each table word
  // FOLLOWED by a credential's name — they guard the table being read on ANY word, nothing more)
  const STILL = ['scan_secret', 'check_token', 'reset_token', 'store_password', 'json_key', 'pin_secret', 'build_token', 'helper_auth', 'source_key',
    'auth.json', 'auth-check', 'key-only', 'VS_SIG_STALL_BUILD', 'VerifyHostKeyDNS', 'test-session-title-ui', 'test-host-key-pin-real', 'MERGE_SID_RE'];
  // ONE MADE-UP LINE FOR EACH WORD LEFT OFF, a made-up value after its head (r2982's six, r3017 (b): the three removed with the heads
  // that removed each, the two Kubernetes file entries with a base64 blob; the watch list's four and re; the page's six): each HIDDEN
  const OFF_LINES = () => { const B = b64(), piece = B.slice(8, 40), L = (w, head, sep, v, tail = '') => [w, head + sep + v + tail, v.length > 40 ? piece : v];
    const p1 = pin(), vs = Array.from({ length: 24 }, val);
    return [L('pin', 'auth_pin', ': ', pin()), ['pins', 'SIM_AUTH_PINS=' + p1 + ',' + pin(), p1], L('helper', 'apiKeyHelper', ': echo ', vs[0]), L('args', 'auth_args', ': ', vs[1], ' --verbose'),
      L('options', 'session-options', ': ', vs[2], ' --fast'), L('reset', 'password-reset', ': ', vs[3]), L('local', 'DB_PASSWORD_LOCAL', '=', vs[4]), L('pre', 'API_KEY_PRE', '=', vs[5]),
      L('info', 'AUTH_INFO', '=', vs[6]), L('set', 'keptKeySet', ': ', vs[7]), L('box', 'secret-box', ': ', vs[8]), L('store', 'session-store', ': ', vs[9]),
      L('json', 'GOOGLE_CREDENTIALS_JSON', '=', vs[10]), L('json', 'GCP_SA_KEY_JSON', '=', vs[20]), L('json', 'GCP_SA_KEY_JSON', '=', B), ['json', 'GOOGLE_CREDENTIALS_JSON=' + escJson(vs[11]), vs[11], 'escaped'],
      L('json', 'data:\n  key.json', ': ', B), L('json', 'data:\n  credentials.json', ': ', B),
      L('only', 'DB_PASSWORD_READ_ONLY', '=', vs[12]), L('check', 'password_check', '=', vs[13]), ['check', '{"user":"ann","passwordCheck":"' + vs[14] + '"}', vs[14]],
      L('build', 'NPM_TOKEN_BUILD', '=', vs[15]), L('build', 'NPM_TOKEN_BUILD', '=', B), L('dns', 'CF_API_TOKEN_DNS', '=', vs[16]), L('ui', 'ADMIN_PASSWORD_UI', '=', vs[17]), L('real', 'PASSWORD_REAL', '=', vs[18]), L('re', 'password_re', '=', vs[19])]; };
  const shows = (o, secret) => o.includes(secret);
  const MSG = (S, t) => S.redactSecrets(t, { message: true }).text, LINE = (S, t) => S.redactSecrets(t).text;
  const tableOf = (S) => S.NOT_CREDENTIAL_HEADS instanceof Set ? S.NOT_CREDENTIAL_HEADS : new Set();
  const lastOf = (n) => n.split(/[_\-.\s]+|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean).pop().toLowerCase();
  const publicBad = (S) => [...new Set([...Object.values(KINDS), ...PAGE_PUBLIC])].filter((h) => S.holderName(h) !== false || MSG(S, h + SIGHT) !== h + SIGHT);
  const priceOf = (S) => Object.entries(PRICE).map(([w, n]) => { const v = val(); return [w, n, v, LINE(S, n + '=' + v).includes(v) && MSG(S, n + '=' + v).includes(v)]; });   // r3083 (3): in both modes
  const stillBad = (S) => [...STILL, ...TWINS].filter((n) => S.holderName(n) !== true);
  const offBad = (S) => OFF_LINES().filter(([, line, secret]) => [MSG(S, line), LINE(S, line)].some((o) => shows(o, secret))).map(([w, line]) => w + ' ' + line.split(/[:=]/)[0].trim());
  const flagBad = (S) => { const v = val(), a = MSG(S, 'flags: --password-store=basic'), b = MSG(S, 'flags: --password-store=' + v); return a !== 'flags: --password-store=basic' || b.includes(v); };
  const overlapBad = (S) => [...tableOf(S)].filter((w) => S.SECRET_WORDS.has(w) || S.CONTAINER_HEADS.has(w) || S.DESCRIPTOR_HEADS.has(w) || OFF.includes(w));
  const kindsBad = (S) => { const t = tableOf(S), k = Object.keys(KINDS); return [...[...t].filter((w) => !k.includes(w) || !PRICE[w]), ...k.filter((w) => !t.has(w)), ...k.filter((w) => lastOf(KINDS[w]) !== w)]; };
  ok(tableOf(SS).size > 0 && publicBad(SS).length === 0, `B-4f7f (1) THE FOUND HEADS FREE: ${tableOf(SS).size} last words on the table; a head of its kind for each and the corpus page's «cured public» heads read public, and the sighting's words after them are kept whole${publicBad(SS).length ? ' — still holding: ' + J(publicBad(SS)) : ''}`);
  { const pr = priceOf(SS), hid = pr.filter((x) => !x[3]);
    ok(hid.length === 0, `B-4f7f (a) THE PRICE OF EACH WORD (r3017), what the loosening lets through, a credential word then the table word then a made-up value — every one SHOWS in both modes: ${pr.map(([w, n]) => n).join(' ')}${hid.length ? ' — hidden after all: ' + J(hid.map((x) => x[1])) : ''}`); }
  ok(stillBad(SS).length === 0, `B-4f7f (c) EVERY REAL SHAPE STILL TAKEN: ${STILL.length} names (r2982's list, the corpus heads r3017's cure turns back) and ${TWINS.length} twins (a table word FOLLOWED by a credential's name) hold${stillBad(SS).length ? ' — public now: ' + J(stillBad(SS)) : ''}`);
  ok(offBad(SS).length === 0, `B-4f7f (b) EVERY WORD LEFT OFF HOLDS: ${OFF_LINES().length} made-up lines, a value after each head (r3017's json / only / check with GOOGLE_CREDENTIALS_JSON (short, escaped JSON), GCP_SA_KEY_JSON (short, base64), key.json and credentials.json file entries (base64), DB_PASSWORD_READ_ONLY, password_check, passwordCheck; build dns ui real re; r2982's six; the page's six): every value hidden in both modes${offBad(SS).length ? ' — shown under: ' + J(offBad(SS)) : ''}`);
  ok(!flagBad(SS), 'B-4f7f (c) --password-store still holds ON PURPOSE: a known value (basic) is kept, any other value is hidden (KNOWN_FLAG_VALUES; «store» stays off the table)');
  { const v = val(), K = b64(), T = SS.redactSecrets('secret-scan: ' + PAT + '\ntoken-door.js:\n-----BEGIN PRIVATE KEY-----\n' + K + '\n-----END PRIVATE KEY-----\nend').text;
    const q = SS.redactSecrets('https://ci.example.com/cb?secret_scan=clean&scan_secret=' + v).text;
    ok(!T.includes(PAT) && !T.includes(K.slice(8, 40)) && gateOf(T.startsWith('secret-scan: ')) && verdictOf(T.includes('token-door.js:')), `B-4f7f (c) A REAL SHAPE AFTER A FREED HEAD is still taken by its own rule: a known-prefix token after secret-scan, a PEM block after token-door.js — the heads stay, the secrets go (${J(T.slice(0, 80))}…)`);
    ok(gateOf(q.includes('secret_scan=clean')) && !q.includes(v), `B-4f7f THE QUERY ROAD reads the same grammar: ?secret_scan=clean stays, ?scan_secret=<value> is hidden (${J(q)})`); }
  ok(tableOf(SS).size > 0 && overlapBad(SS).length === 0, `B-4f7f (3) THE TABLE meets no credential, container or descriptor word and none of the ${OFF.length} left off${overlapBad(SS).length ? ' — met: ' + J(overlapBad(SS)) : ''}`);
  ok(tableOf(SS).size > 0 && kindsBad(SS).length === 0, `B-4f7f (4) EVERY WORD ON THE TABLE HAS A LEG OF ITS KIND AND ITS PRICE LINE (a head ending in it; a word added without both is red)${kindsBad(SS).length ? ' — without: ' + J(kindsBad(SS)) : ''}`);
  // RED CONTROLS (patched copies of the module, each through the SAME legs)
  const LAST = '  return !DESCRIPTOR_HEADS.has(head) && !NOT_CREDENTIAL_HEADS.has(head);';
  const TODAY = M.load('src/secret-shapes.js', editAnchor(SRC, LAST, '  return !DESCRIPTOR_HEADS.has(head);', 'src/secret-shapes.js'), 'b4f7f-today');   // stale-pins: kept (the base's verdict line is this red copy's REPLACEMENT, never an anchor)
  ok(publicBad(TODAY).length >= 10 && verdictOf(priceOf(TODAY).every((x) => !x[3])), `RED CONTROL (the verdict that does not read the table, d458fc27d's): ${publicBad(TODAY).length} heads still hold and every price line is hidden — legs (1) and (a) go red`);
  const OPEN = M.load('src/secret-shapes.js', editAnchor(SRC, LAST, '  return false;', 'src/secret-shapes.js'), 'b4f7f-open');
  const openExpect = STILL.filter((n) => !SS.SECRET_WORDS.has(lastOf(n)) && !SS.CONTAINER_HEADS.has(lastOf(n))).length;   // the STILL names whose last word is no credential's or container's
  const plainL = OFF_LINES().filter((x) => !x[3]).length;   // B-829f: the escaped line's inner pair is judged by the escaped reader too, whatever its head
  ok(openExpect > 0 && stillBad(OPEN).length >= openExpect && offBad(OPEN).length === plainL && verdictOf(flagBad(OPEN)), `RED CONTROL (FAIL OPEN: every last word that is no credential's name is public): ${stillBad(OPEN).length} names go public and all ${offBad(OPEN).length} made-up values show — legs (b) and (c) go red`);
  const ANY = M.load('src/secret-shapes.js', editAnchor(SRC, '  if (SECRET_WORDS.has(head) || CONTAINER_HEADS.has(head)) return true;', '  if (words.some((w) => NOT_CREDENTIAL_HEADS.has(w))) return false;\n  if (SECRET_WORDS.has(head) || CONTAINER_HEADS.has(head)) return true;', 'src/secret-shapes.js'), 'b4f7f-any');
  ok(stillBad(ANY).filter((n) => TWINS.includes(n) || n === 'scan_secret').length >= 20, `RED CONTROL (the table read on ANY word, not the last): ${stillBad(ANY).length} names go public (scan_secret, the twins) — leg (c) goes red`);
  const TBL = 'const NOT_CREDENTIAL_HEADS = new Set([';
  const OFFON = M.load('src/secret-shapes.js', editAnchor(SRC, TBL, TBL + OFF.map((w) => J(w)).join(', ') + ', ', 'src/secret-shapes.js'), 'b4f7f-off-on');
  { const lines = OFF_LINES().filter((x) => !x[3]), shownL = lines.filter(([, line, secret]) => [MSG(OFFON, line), LINE(OFFON, line)].every((o) => shows(o, secret))), hiddenL = lines.filter((x) => !shownL.includes(x));   // r3083 (2): keyed by LINE, both modes
    ok(shownL.length === lines.length && gateOf(OFF.every((w) => shownL.some(([x]) => x === w))) && overlapBad(OFFON).length === OFF.length && kindsBad(OFFON).length === OFF.length, `RED CONTROL (the ${OFF.length} words left off put ON the table): EVERY ONE of the ${lines.length} lines shows its value in both modes — the base64 entries too, so each is hidden by its head and by nothing else — and the table legs (3) and (4) name the words${hiddenL.length ? ' — still hidden by another rule: ' + J(hiddenL.map(([w, l]) => w + ' ' + l.split(/[:=]/)[0].trim())) : ''}`); }
  { const esc = OFF_LINES().filter((x) => x[3]);   // B-829f (主开发 r3116): an escaped-JSON value is judged as plain JSON is — by the escaped reader, whatever its outer head
    ok(esc.length > 0 && verdictOf(esc.every(([, line, secret]) => [OFFON, OPEN].every((S) => [MSG(S, line), LINE(S, line)].every((o) => !shows(o, secret))))), `B-829f: the escaped-JSON line (${esc.map(([w, l]) => l.split('=')[0]).join(', ')}) stays HIDDEN even with its word on the table or the verdict failing open — its inner client_secret is judged by the escaped reader`); }
  const CREDON = M.load('src/secret-shapes.js', editAnchor(SRC, TBL, TBL + "'token', ", 'src/secret-shapes.js'), 'b4f7f-cred');
  ok(gateOf(overlapBad(CREDON).includes('token')) && verdictOf(kindsBad(CREDON).includes('token')), 'RED CONTROL (a credential word on the table): leg (3) names «token», leg (4) finds it without a leg of its kind — red');
}

console.log('lane bl-msg B-3e61: A MESSAGE ARRIVES WHOLE — the message mode (one token), a known flag, the sender is told');
{
  const SS = r('src/secret-shapes.js'), J = JSON.stringify;
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('blm', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  const v = () => crypto.randomBytes(6).toString('hex');            // a value per leg, built at runtime
  const TAIL = 'and the rest of the brief arrives whole';               // what the seven sightings lost (plain words: what a message keeps)
  // the sightings as the row tells them (each: the text, the value that must go, the name that must stay)
  const SIGHT = (V) => ({
    '1st: the session word glued to its token': [`Step 3: NO key.grant line for session:${V} must appear, ${TAIL}`, V, 'session:'],
    '2nd: a data-key attribute in a selector': [`Click .pp-row[data-key=${V}:*] ${TAIL}`, V, 'data-key='],
    '6th: a suite name ending in schema, a colon, a quoted leg': [`test-session-schema: «${V} passes» ${TAIL}`, V, 'test-session-schema:'],
    'a lane name ending in shield, a colon': [`agent-credential-shield: ${V} is stood down, ${TAIL}`, V, 'agent-credential-shield:'],
    'a dotenv token mid-sentence': [`set it with DB_PASSWORD=${V} then ${TAIL}`, V, 'DB_PASSWORD='],
    'a CJK sentence (no blank after the value)': [`会话 session:${V}，然后 ${TAIL}`, V, 'session:'],
    'a value in parentheses (the closer is the prose\'s)': [`the value (token=${V}) ${TAIL}`, V, 'token='],
  });
  const S1 = SIGHT(v());
  // B-4f7f (主开发 r2982 / r3017 (d)): the 6th sighting's head is a SUITE's name (test-session-schema) — no credential's: its value
  // stays because of what the head names, so that sighting arrives WHOLE in both modes (its own leg below); the six that still hold
  // keep these legs, meaning kept
  const FREED = '6th: a suite name ending in schema, a colon, a quoted leg';
  const run = (SSx, opt) => Object.entries(S1).filter(([n]) => n !== FREED).map(([n, [t, V, name]]) => { const said = []; const o = SSx.redactSecrets(t, { ...opt, said }); return { n, t, V, name, o, said }; });
  const msg = run(SS, { message: true });
  const bad = msg.filter((x) => x.o.text.includes(x.V) || !x.o.text.includes(TAIL) || !x.o.text.includes(x.name) || !x.o.text.includes(REDACTED));
  ok(bad.length === 0, `MESSAGE MODE: all ${msg.length} sightings keep the REST of the message, hide the value, keep the name${bad.length ? ' — off: ' + bad.map((x) => x.n + ' → ' + J(x.o.text)).join(' · ') : ''}`);
  ok(verdictOf(msg.every((x) => x.said.includes(x.name))), `MESSAGE MODE: \`said\` names each trigger as written (${msg.map((x) => x.said.join('+')).join(' · ')})`);
  { const [t6] = S1[FREED], s6 = [], whole = (S) => S.redactSecrets(t6, { message: true, said: s6 }).text === t6 && S.redactSecrets(t6, {}).text === t6;
    ok(gateOf(whole(SS)) && s6.length === 0, 'B-4f7f: the 6th sighting arrives WHOLE in both modes and names no trigger — its value stays because its head is a SUITE\'s name (test-session-schema), no credential\'s; the found table reads that suite name as public');
    const T6 = M.load('src/secret-shapes.js', editAnchor(SRC, '  return !DESCRIPTOR_HEADS.has(head) && !NOT_CREDENTIAL_HEADS.has(head);', '  return !DESCRIPTOR_HEADS.has(head);', 'src/secret-shapes.js'), 'b4f7f-6th');   // stale-pins: kept (the base's verdict line is this red copy's REPLACEMENT)
    ok(!whole(T6), 'RED CONTROL (the verdict that does not read the table): the 6th sighting loses its value again — its WHOLE leg goes red'); }
  ok(verdictOf(msg.every((x) => SS.redactSecrets(x.o.text, { message: true }).text === x.o.text)), 'MESSAGE MODE is idempotent: a masked message masks to itself (the group log\'s second belt pass finds nothing)');
  { const X = S1['1st: the session word glued to its token'][1], a = SS.redactSecrets(`(token=${X}). more`, { message: true }).text, b = SS.redactSecrets(`session:\u00A0${'z'.repeat(9)}7 rest`, { message: true }).text;
    ok(!a.includes(X) && gateOf(a.endsWith(' more')) && !b.includes('zzzz') && verdictOf(b.endsWith(' rest')), 'MESSAGE MODE: a value glued to a closer is hidden with it, the plain rest stays; a no-break blank after the head is no escape', J([a, b])); }
  // a STORED head keeps the line-end extent (exit output, a job log: hides more, never less)
  const line = run(SS, {});
  ok(verdictOf(line.every((x) => !x.o.text.includes(x.V) && !x.o.text.includes(TAIL))), 'the LINE MODE (no option — exit output, a job log) still hides to the line end: the stored head is unchanged');
  // a header is never prose: the scheme word alone would leave the credential after it
  const BT = v() + v(), DG = v() + v();
  // r2 (the adversarial read F1–F4): a header of ANY scheme, a cookie list, a key block flattened onto one line, a credential word before its token
  const hdr = [`Authorization: Bearer ${BT} ${TAIL}`, `Authorization: Digest username="u", response="${DG}" ${TAIL}`, `the token: basic ${BT}`, `Authorization: Bot ${BT}.x ${TAIL}`,
    `Cookie: theme=dark; PHPSESSID=${DG}; JSESSIONID=${BT}`, `PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY----- MII${BT} -----END RSA PRIVATE KEY-----`, `auth: password ${BT} then`, `secret: key ${BT}${DG} tail`, `token: Bearer ${BT} ok`].map((t) => SS.redactSecrets(t, { message: true }).text);
  ok(verdictOf(hdr.every((t) => !t.includes(BT) && !t.includes(DG))), `MESSAGE MODE: a header (any scheme), a cookie list, a one-line key block and a credential word with its token are hidden (${hdr.map(J).join(' · ')})`);
  // r2 (F6 / F7): a scheme or credential word in PROSE takes one more word, never the rest; a mention is never a value
  const prose2 = [[`auth: token rotation is broken, ${TAIL}`, TAIL], [`Session: basic checks pass, ${TAIL}`, TAIL]].map(([t, k]) => SS.redactSecrets(t, { message: true }).text.includes(k));
  const at = [`key: @beta please ${TAIL}`].map((t) => SS.redactSecrets(t, { message: true, mentions: ['beta'] }).text === t && SS.redactSecrets(t, { message: true }).text !== t);   // a MEMBER's @ only (the caller's names); a sink with none spares no @
  const atV = [`DB_PASSWORD=@${BT}x then`, `key=@beta then`, `secret: @${BT}#x rest`].map((t) => !SS.redactSecrets(t, { message: true }).text.includes(t.split(/[=:] ?/)[1].split(' ')[0]));
  ok(gateOf(prose2.every(Boolean)) && gateOf(at.every(Boolean)) && verdictOf(atV.every(Boolean)), 'MESSAGE MODE: «auth: token rotation…» keeps its rest; a MENTION in its own shape under a `:` head stays (the @-scan wakes it); an @ value under `=`, or one naming no member, is masked (the cure of batch 6)');
  // multi-line shapes keep their own rules in a message: a YAML continuation, a JSON object, a quoted value with blanks
  const PW = v();
  const multi = [`notes\npassword:\n  ${PW}\nback`, `{"password": "${PW} x", "user": "u"}`, `password: "${PW} two words"`, `-----BEGIN PRIVATE KEY-----\n${PW}\n-----END PRIVATE KEY-----`].map((t) => SS.redactSecrets(t, { message: true }).text);
  ok(verdictOf(multi.every((t) => !t.includes(PW))), 'MESSAGE MODE: a YAML continuation, a JSON value, a quoted value with blanks and a PEM block are hidden whole');
  // a KNOWN FLAG with a value from its closed public list is no credential — in both modes; any other value of it is masked
  const KF = fnOf2(SS.KNOWN_FLAG_VALUES);
  const fl = ['', 'message'].map((mode) => { const o = mode ? { message: true } : {}; const K = v();
    return { keep: SS.redactSecrets(`chrome --password-store=basic --api-key=${K} ${TAIL}`, o).text, K, odd: SS.redactSecrets(`chrome --password-store=${PW} ${TAIL}`, o).text, q: SS.redactSecrets(`--password-store="kwallet5" x`, o).text, dot: SS.redactSecrets(`--password-store=basic.${PW} x`, o).text, end: SS.redactSecrets('use --password-store=basic.', o).text }; });
  ok(gateOf(KF) && verdictOf(fl.every((f) => f.keep.includes('--password-store=basic') && !f.keep.includes(f.K) && !f.odd.includes(PW) && f.q === '--password-store="kwallet5" x' && !f.dot.includes(PW) && f.end === 'use --password-store=basic.')),
    `A KNOWN FLAG: --password-store=basic stays in both modes and the scan walks on past it (the next --api-key is masked); --password-store=<other> is masked (${fl.map((f) => J(f.keep)).join(' · ')})`);
  // RED CONTROLS (patched copies through the SAME legs)
  const cut = (src, from, to, name) => { ok(verdictOf(src.includes(from)), `the control «${name}» finds its line`); return M.load('src/secret-shapes.js', editAnchor(src, from, to, "src/secret-shapes.js"), name); };
  const MSG_LINE = 'if (message && !q && !LINE_HEADS.has(String(m[4]).toLowerCase())) {';
  const noMsg = cut(SRC, MSG_LINE, 'if (false) {', 'no-message-mode');
  ok(verdictOf(run(noMsg, { message: true }).every((x) => !x.o.text.includes(TAIL))), 'RED CONTROL (the message mode removed): every sighting loses its rest again — the MESSAGE MODE leg goes red');
  ok(!SS.redactSecrets('Authorization: Bot hunter x', { message: true }).text.includes('hunter'), 'MESSAGE MODE: a header keeps the line rule whole — a plain-looking credential after an unlisted scheme is hidden too');
  const noHeads = cut(SRC, MSG_LINE, 'if (message && !q) {', 'no-line-heads');
  ok(verdictOf(noHeads.redactSecrets('Authorization: Bot hunter x', { message: true }).text.includes('hunter')), 'RED CONTROL (the header list removed): a plain-looking credential after an unlisted scheme is left in clear — the header leg goes red');
  const noTwo = cut(SRC, 'takeNext = !keep && (AUTH_SCHEMES.has(w) || SECRET_WORDS.has(w));', 'takeNext = false;', 'no-two-token');
  ok(!SS.redactSecrets('auth: password hunter then', { message: true }).text.includes('hunter') && !SS.redactSecrets('token: Bearer abc ok', { message: true }).text.includes('abc'), 'MESSAGE MODE: a credential / scheme word takes its next token even when that one looks plain');
  ok(gateOf(noTwo.redactSecrets('auth: password hunter then', { message: true }).text.includes('hunter')) && verdictOf(noTwo.redactSecrets('token: Bearer abc ok', { message: true }).text.includes('abc')), 'RED CONTROL (the credential word takes no token): «auth: password …» and «token: Bearer …» leave the secret in clear — the header leg goes red');
  const noFlag = cut(SRC, 'if (flagEnd >= 0) {', 'if (false) {', 'no-flag');
  ok(!noFlag.redactSecrets('chrome --password-store=basic x', { message: true }).text.includes('--password-store=basic'), 'RED CONTROL (the known-flag check removed): --password-store=basic is masked again — the flag leg goes red');
  // the belt carries the mode + the collector to the shapes (the group log and the stash ask it)
  const said = []; const bo = belt.maskForSink(S1['1st: the session word glued to its token'][0], { message: true, said });
  ok(gateOf(bo.includes(TAIL)) && !bo.includes(S1['1st: the session word glued to its token'][1]) && gateOf(said.includes('session:')) && !belt.maskForSink(S1['1st: the session word glued to its token'][0]).includes(TAIL),
    'THE BELT: maskForSink(text, { message: true, said }) keeps the rest and says what it masked; without it the line mode stays');
}
function fnOf2(x) { return x && typeof x.get === 'function' ? x : null; }

console.log('the cure of batch 6 — THE LAW over a GENERATED corpus: a message keeps only plain words of what the line rule hides');
{
  const SS = r('src/secret-shapes.js'), J = JSON.stringify;
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('blm-cure6', REPO);
  // heads (a JSON key, a YAML key, a wrapper-opened key among them) CROSSED with the separators that open a head (a blank, none, a
  // full-width colon or equals open none — both modes then match by construction, so they prove nothing and are left out)
  const HEADS = ['session', 'password', 'token', 'api_key', 'DB_PASSWORD', 'X-Auth-Token', 'test-session-schema', '"password"', '    password', '`DB_PASSWORD'];
  const SEPS = [':', '=', ': ', '= ', ' : '];
  const PAIRS = { '(': ')', '[': ']', '{': '}', '「': '」', '『': '』', '（': '）', '【': '】', '〔': '〕', '〈': '〉', '《': '》', '«': '»', '‘': '’', '“': '”' };
  // every opener class, glued to the value — and the marks that come with a blank (`=> `, `:= `, `- `, `( `: the value is the NEXT word)
  const OPENERS = ['', 'a', '7', '已', 'é', 'Ж', '٣', 'Ｘ', ...'!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~', ...'「『（【〔〈《«‘“，、。：；！？', '=> ', ':= ', '- ', '( ', ': ', '「 '];
  const rnd = (n, alpha) => Array.from(crypto.randomBytes(n), (x) => alpha[x % alpha.length]).join('');
  const LET = 'abcdefghijklmnopqrstuvwxyz', UP = LET.toUpperCase(), MIX = LET + UP + '0123456789';
  // the core of a value and the tokens that must never stay where the line rule hid them (`w` / `groups`: only when the value's first
  // chunk is what the shape says — no opener glued in front)
  const SHAPES = [
    () => { const v = 'Xk9' + rnd(9, MIX); return { core: v, must: [v] }; },
    () => { const v = crypto.randomBytes(16).toString('hex'); return { core: v, must: [v] }; },
    () => { const w = 'Pz' + rnd(6, LET); return { core: `${w} horse battery`, must: [w] }; },     // a passphrase: its FIRST word (the said cost: its later plain words stay)
    () => { const v = 'Q7' + rnd(14, MIX); return { core: `Bot ${v}`, must: [v] }; },               // a scheme nobody listed, then the value
    () => { const v = rnd(8, MIX) + '#9'; return { core: `@${v}`, must: [v] }; },                  // an @ that is no mention
    () => { const w = rnd(7, LET); return { core: `Bearer ${w}`, must: [], w: [w] }; },             // a scheme word, then a plain-looking value
    () => { const w = rnd(7, LET); return { core: `password ${w}`, must: [], w: [w] }; },           // a credential word, then a plain-looking value
    () => { const v = rnd(6, LET) + rnd(6, UP); return { core: `x ${v}`, must: [v] }; },           // a letters-only token of mixed case, after the value
    () => { const g = [0, 1, 2, 3].map(() => rnd(4, LET)); return { core: g.join(' '), must: [g[0]], w: g.slice(1) }; },   // an app password: four groups
    () => { const g = [0, 1, 2, 3].map(() => rnd(4, UP + '234567')); return { core: g.join(' '), must: [g[0]], w: g.slice(1) }; },   // a TOTP key in groups
    // B-34c8 round w7azupbri: a TWO-group code whose second group is lowercase letters with a prose mark, and an app code with a comma
    // INSIDE — after a STRONG head every group is a must-hide (`strongOnly`: after a session word the prose exception may keep them)
    () => { const g = [rnd(2, '0123456789') + rnd(2, LET), rnd(4, LET)]; return { core: `${g[0]} ${g[1]}.`, must: [g[0]], w: [g[1]], strongOnly: true }; },
    () => { const g = [0, 1, 2, 3].map(() => rnd(4, LET)); return { core: `${g[0]} ${g[1]}, ${g[2]} ${g[3]}`, must: [g[0]], w: g.slice(1), strongOnly: true }; },
  ];
  const strongH = (h) => !/session/i.test(h);   // the corpus's heads: «session» and «test-session-schema» are the weak ones
  const TAILS = [   // what follows: plain words; secrets after a stop, a bracket, a plain word; a SECOND head in every spelling it has
    () => ({ t: '', must: [] }), () => ({ t: ' and the rest of it', must: [] }), () => ({ t: '，然后继续', must: [] }),
    () => { const v = 'Q9' + rnd(8, MIX); return { t: `，${v}`, must: [v] }; },
    () => { const v = rnd(8, MIX) + '#7'; return { t: ` （备用：${v}）`, must: [v] }; },
    () => { const v = 'Z8' + rnd(10, MIX); return { t: ` then ${v} ok`, must: [v] }; },
    () => { const v = 'W6' + rnd(9, MIX); return { t: `「${v}」 end`, must: [v] }; },
    ...[(w) => ` and password: ${w}`, (w) => ` {"password": "${w}"}`, (w) => ` and password = ${w}`, (w) => ` password : ${w}`, (w) => `, auth: password ${w}`, (w) => `; Authorization: Bot ${w}`, (w) => `; secret: "correct ${w} battery"`, (w) => ` {'user': 'app', 'password': '${w}'}`,
      (w) => `，然后 password：${w}`, (w) => `，password : ${w}`, (w) => ` run --api-key=${w}`, (w) => ` and \`DB_PASSWORD=${w}\` then`]
      .map((f) => () => { const w = rnd(7, LET); return { t: f(w), must: [w] }; }),
    // r5 (the read's F2): a second head whose OWN rule ends early (a closed quote, a JSON value), then more secrets; a head glued in a chunk
    ...[(w, v) => ` and password: "${w}" then ${v}`, (w, v) => ` {"secret": "${w}", "recovery": "${v}"}`, (w, v) => ` id=7,password=${v} hi ${w}x9`]
      .map((f) => () => { const w = rnd(7, LET), v = 'R5' + rnd(10, MIX); return { t: f(w, v), must: [w, v] }; }),
  ];
  const STOPS = '、。，；：！？「」『』（）【】《》〈〉';
  // cure 2 (the test machine's run at dcdd8d590): the MASK is a separator too — the line rule's «api_key:«redacted»» and the message
  // mode's «api_key:「«redacted»」» hold the same head piece «api_key:» (a chunk compare read it as a kept piece)
  const chunks = (t) => t.split(new RegExp(`[\\s${STOPS}]+|«redacted»`, 'u')).filter(Boolean);
  // an INDEPENDENT, stricter plain word than the module's: lowercase ≤ 12, Capitalized ≤ 12, an acronym ≤ 3, or a run of CJK, with
  // edge marks from a short list; a head's own name stays in both. A chunk the module keeps that this calls not plain is a loosening
  const EDGE = '.,;:!?()[]{}"\'«»“”‘’—-…=`〔〕';
  const HEADWORDS = new Set(['password', 'auth', 'Authorization', 'secret', 'user', 'app', 'redacted']);
  // a HEAD PIECE the corpus itself wrote (one of its own names, with its opener and its separator — «,token=», «{"password":», «--api-key=»)
  const HEAD_NAMES = new Set(['session', 'password', 'token', 'api_key', 'DB_PASSWORD', 'X-Auth-Token', 'test-session-schema', 'secret', 'recovery', 'auth', 'Authorization', 'user', 'api-key', 'id']);
  const headPiece = (x) => { const h = /^[`"'*<({\[,;]{0,3}-{0,2}["']?([A-Za-z_][A-Za-z0-9_.-]{0,80})["']?[ \t]*[:=][({\[«「『（【〔〈《‘“`"']{0,2}$/.exec(x); return !!h && HEAD_NAMES.has(h[1]); };   // a2: every MSG_PAIRS opener (the run at a3bd41c23: «api_key:〔»)
  const plainT = (c) => { if (headPiece(c)) return true; let a0 = 0, b0 = c.length; while (a0 < b0 && EDGE.includes(c[a0])) a0++; while (b0 > a0 && EDGE.includes(c[b0 - 1])) b0--; const core = c.slice(a0, b0);
    return core === '' ? c.length <= 3 : HEADWORDS.has(core) || /^(?:[a-z]{1,12}|[A-Z][a-z]{1,11}|[A-Z]{1,3})$/.test(core) || /^[぀-ヿ㐀-鿿]+$/u.test(core); };
  // r632 (主开发 22:49Z, a box-zone red of another lane's gate, placed by reading): THE LINE'S OWN FIXED WORDS ARE NO VALUE. A random
  // four-letter group of a letters-only grouped value fell INSIDE the second head's own word («password», which the line rule masks to
  // the line end and the message mode keeps): a substring check read the head's word as the value. A must piece leaks only where it
  // stands OUTSIDE every fixed word of the corpus — its heads in every spelling, its tails' connectives, its shapes' words, the member
  // row, the mask word (each tail and shape drawn once, its values taken out) — and a value that merely CONTAINS a fixed word still counts
  const fixedOf = (text, values) => values.reduce((t, v) => t.split(v).join(' '), text);
  const FIXED_TEXT = [...HEADS, ...HEAD_NAMES, ...HEADWORDS, 'redacted', 'I reset the password', '@beta',
    ...TAILS.map((f) => { const x = f(); return fixedOf(x.t, x.must); }), ...SHAPES.map((f) => { const x = f(); return fixedOf(x.core, [...x.must, ...(x.w || [])]); })].join(' ');
  const FIXED_WORDS = [...new Set(FIXED_TEXT.match(/[A-Za-z][A-Za-z0-9_-]*/g) || [])];
  const insideFixed = (c, at, len) => FIXED_WORDS.some((w) => { for (let i = c.indexOf(w); i >= 0 && i <= at; i = c.indexOf(w, i + 1)) if (at + len <= i + w.length) return true; return false; });
  const holdsPiece = (c, t) => { for (let i = c.indexOf(t); i >= 0; i = c.indexOf(t, i + 1)) if (!insideFixed(c, i, t.length)) return true; return false; };
  const leakedIn = (lo, mo, must) => must.some((t) => !lo.includes(t) && chunks(mo).some((c) => holdsPiece(c, t) && !headPiece(c)));
  const judge = (SSx, { stopAtFirst = false, rev = false, only = '' } = {}) => {   // a control stops at its first leak (and walks the openers from the end); `only` = one scene's rows
    const leaks = [], loose = [], nonIdem = []; let lines = 0, n0 = 0;
    const one = (L, op, must, opt, allowed = [], scene = '') => {
      const lo = SSx.redactSecrets(L).text, mo = SSx.redactSecrets(L, { message: true, ...opt }).text;
      lines++;
      if (!stopAtFirst && SSx.redactSecrets(mo, { message: true, ...opt }).text !== mo) nonIdem.push(L + ' ⇒ ' + mo);   // r5: a second pass changes nothing
      // B-34c8 (ALSO CURED, run 8f594ece4-20261119034021-both): a token leaks only inside a chunk that is no head piece the corpus wrote — a
      // random app-password group «assw» inside a kept «,password=» was read as a leak by a substring check
      if (leakedIn(lo, mo, must)) leaks.push({ L, op, mo, scene });   // r632: never inside one of the line's own fixed words
      const lt = chunks(lo), extra = chunks(mo).filter((x) => { const at = lt.indexOf(x); if (at >= 0) { lt.splice(at, 1); return false; } return true; });
      const allowedIn = (x) => { const y = x.replace(/[.,;:!?]+$/, ''); return allowed.some((w) => y === w || (y.endsWith(w) && headPiece(y.slice(0, -w.length)))); };   // cure 2: «@beta,» and «session:@beta» (a head glued to it) are the member's @ too
      if (extra.some((x) => !plainT(x) && !allowedIn(x))) loose.push(L + ' ⇒ ' + mo);
    };
    const ops = only ? [] : rev ? [...OPENERS].reverse() : OPENERS;
    for (const op of ops) for (const closed of PAIRS[op.trim()] ? [false, true] : [false]) for (const h of HEADS) for (const sep of SEPS) {
      if (stopAtFirst && leaks.length) return { leaks, loose, lines, nonIdem };
      const sh = SHAPES[n0 % SHAPES.length](), tl = TAILS[(n0 * 7 + 3) % TAILS.length](); n0++;
      const must = [...sh.must, ...tl.must, ...(sh.w && op === '' && (!sh.strongOnly || strongH(h)) ? sh.w : [])];
      one(h + sep + op + sh.core + (closed ? PAIRS[op.trim()] : '') + (h.startsWith('`') ? '`' : '') + tl.t, op, must, {});
    }
    for (const sh0 of only ? [] : SHAPES) for (const tlf of TAILS) for (const h of HEADS) {   // the product of shapes × tails on every head, no opener
      if (stopAtFirst && leaks.length) return { leaks, loose, lines, nonIdem };
      const sh = sh0(), tl = tlf();
      one(h + ': ' + sh.core + (h.startsWith('`') ? '`' : '') + tl.t, '', [...sh.must, ...tl.must, ...(sh.w && (!sh.strongOnly || strongH(h)) ? sh.w : [])], {});
    }
    // a MEMBER's mention under a `:` head is kept (the caller names its members) — and every secret after it is still hidden
    for (const h of !only || only === 'mentions' ? HEADS : []) for (const sep of [':', ': ']) for (const tlf of TAILS) { const tl = tlf(), L = `${h}${sep}@beta${tl.t}`; one(L, '@', tl.must, { mentions: ['beta'] }, ['@beta']); if (!stopAtFirst && !SSx.redactSecrets(L, { message: true, mentions: ['beta'] }).text.includes('@beta')) leaks.push({ L: L + ' (the member\'s @ was lost)', op: '@', mo: '' }); }   // r6: the member's @ survives too
    // cure 2 (主开发 08:42Z, MUST 1): a MEMBER's @ after a CJK value, glued behind a stop, after a credential word, after «password» in
    // prose — it survives, and every secret around it is still hidden
    for (const tlf of !only || only === 'mentions' ? TAILS : []) {
      const tl = tlf(), x = 'Q9' + rnd(8, MIX);
      const rows = [...HEADS.flatMap((h) => [[`${h}: 已修好 @beta${tl.t}`, 'cjk', []], [`${h}: ${x}，@beta${tl.t}`, 'glued', [x]], [`${h}: password @beta${tl.t}`, 'next', []]]), [`I reset the password @beta${tl.t}`, 'r5', []]];
      for (const [L, scene, own] of rows) {
        one(L, '@', [...tl.must, ...own], { mentions: ['beta'] }, ['@beta'], scene);
        if (!SSx.redactSecrets(L, { message: true, mentions: ['beta'] }).text.includes('@beta')) leaks.push({ L: L + ' (the member\'s @ was lost)', op: '@', mo: '', scene });
      }
    }
    // cure 2 (MUST 2): THE PIECE BEFORE A GLUED INNER HEAD is judged like any chunk — the word after a credential word or a scheme, a
    // group's last group, ASCII glued to the value through a stop; and a group's last group before a comma (the run at dcdd8d590)
    for (const h of !only || only === 'pre' ? HEADS : []) for (const sep of SEPS) {
      const w = rnd(7, LET), v = 'R7' + rnd(10, MIX), x = 'Q9' + rnd(8, MIX), gr = [0, 1, 2, 3].map(() => rnd(4, LET)), tw = h.startsWith('`') ? '`' : '';
      for (const [L, must, scene] of [[`${h}${sep}password ${w},token=${v}`, [w, v], 'pre'], [`${h}${sep}Bearer ${w}(password=${v} ok`, [w, v], 'pre'], [`${h}${sep}${gr.join(' ')},token=${v}`, [...gr, v], 'pre'],
        [`${h}${sep}${x}，${w}(password=${v}`, [x, w, v], 'pre'], [`${h}${sep}${gr.join(' ')}, done`, gr, 'group']]) {
        if (stopAtFirst && leaks.length) return { leaks, loose, lines, nonIdem };
        one(L + tw, '', must, {}, [], scene);
      }
    }
    if (!only || only === 'pre') { const w = rnd(7, LET); one(`auth: password ${w},token=${rnd(7, LET)}`, '', [w], {}, [], 'pre'); }   // the readers' own line
    return { leaks, loose, lines, nonIdem };
  };
  const g = judge(SS);
  ok(g.lines > 5000 && g.leaks.length === 0, `THE LAW, a differential over ${g.lines} generated lines (every opener class × ${HEADS.length} heads × ${SEPS.length} separators, closed and open pairs; ${SHAPES.length} value shapes × ${TAILS.length} tails on every head — secrets after stops, brackets, plain words, a second head in 8 spellings, letters-only and grouped secrets; a member's mention after a CJK value, a stop, a credential word, «password» in prose; the piece before a glued inner head): where the line rule hides a token, the message mode hides it too${g.leaks.length ? ' — LEAKS: ' + g.leaks.slice(0, 4).map((x) => J(x.L + ' ⇒ ' + x.mo)).join(' · ') : ''}`);
  ok(g.loose.length === 0, `…and every chunk the message mode keeps beyond the line rule is a plain word by a STRICTER, independent rule (or the member's @)${g.loose.length ? ' — ' + g.loose.slice(0, 3).map(J).join(' · ') : ''}`);
  ok(g.nonIdem.length === 0, `…and a second message pass over its own output changes nothing, on all ${g.lines} lines (the group log belts twice)${g.nonIdem.length ? ' — ' + g.nonIdem.slice(0, 3).map(J).join(' · ') : ''}`);
  // r632 THE VERY CASE, planted: a letters-only grouped value whose group «sswo» stands INSIDE the second head's word «password», after a
  // CJK comma, a connective and that head with the CJK colon. The message mode hides every part of the value; the judge no longer reads
  // the head's word as the value (green). CONTROLS (red): a real piece of the value standing in the output, and a value that merely
  // CONTAINS a fixed word — each is a leak; and the previous judge (a plain substring) reads the planted case as one
  {
    const gs = ['kqzv', 'sswo', 'tbme', 'rjdl'], w2 = 'mnbvcxz', L = `token: ${gs[0]} ${gs[1]}, ${gs[2]} ${gs[3]}，然后 password：${w2}`, must = [...gs, w2];
    const lo = SS.redactSecrets(L).text, mo = SS.redactSecrets(L, { message: true }).text;
    const oldJudge = (t) => !lo.includes(t) && chunks(mo).some((c) => c.includes(t) && !headPiece(c));
    const facts = { L, lo, mo, fixedWords: FIXED_WORDS.length, leaked: leakedIn(lo, mo, must), previousJudgeSaw: must.filter(oldJudge) };
    ok(!facts.leaked && gateOf(mo.includes('password')) && facts.previousJudgeSaw.join() === 'sswo', 'r632 THE VERY CASE: a group inside the second head\'s own word «password» is no leak — the message mode hid every part of the value (the previous judge counted «sswo»)', J(facts));
    if (!facts.leaked) console.log('      ' + J(facts));
    const real = mo + ' sswo', contains = mo + ' zzpasswordqq';
    const c1 = leakedIn(lo, real, must), c2 = leakedIn(lo, contains, ['zzpasswordqq']);
    ok(gateOf(c1) && verdictOf(c2), 'r632 CONTROLS: a real piece of the value standing in the output is a leak, and so is a value that merely CONTAINS a fixed word — the judge can still go red', J({ realPiece: c1, containsFixedWord: c2 }));
    console.log('      ' + J({ realPiece: c1, containsFixedWord: c2 }));
  }
  // r5 (the read's F1): a message mode that FAILS is the line rule — never the partial text a throw left (a control throws on purpose)
  { const TH = M.load('src/secret-shapes.js', editAnchor(editAnchor(SRC, 'function messageValue(text, s, e, {', 'function messageValue(text, s, e, {', "src/secret-shapes.js"), "  let out = '', i = s, first = !later,", "  if (text.includes('THROWME')) throw new Error('control'); let out = '', i = s, first = !later,", "src/secret-shapes.js"), 'throws');
    const L = 'session: THROWME ghp_' + 'A'.repeat(36) + ' and Bearer ' + 'b'.repeat(30), a = TH.redactSecrets(L, { message: true }).text, b0 = TH.redactSecrets(L).text;
    ok(a === b0 && !a.includes('A'.repeat(36)), 'a message mode that throws gives the LINE result whole (the token after it hidden, not skipped)', J(a)); }
  // cure 2 (主开发 08:42Z): a mask made by the GAP FILTER is named in the sender's answer — the head whose region it filtered
  { const X = 'Q9' + rnd(10, MIX), L = `session: @beta password: "${rnd(8, LET)}" then ${X}`, said = [], o = SS.redactSecrets(L, { message: true, mentions: ['beta'], said }).text;
    ok(!o.includes(X) && gateOf(o.includes('@beta')) && gateOf(said.includes('session:')) && verdictOf(said.includes('password:')), 'a mask made by the gap filter is named in the answer (the region\'s head «session:»), beside the inner head\'s own', J({ o, said }));
    const GAP = 'if (say && filterHead) say(filterHead); }';
    ok(SRC.split(GAP).length === 2, 'the control «the gap names nothing» finds its line');
    const s2 = []; M.load('src/secret-shapes.js', editAnchor(SRC, GAP, '}', "src/secret-shapes.js"), 'gap-unnamed').redactSecrets(L, { message: true, mentions: ['beta'], said: s2 });
    ok(!s2.includes('session:'), 'RED CONTROL (the gap names nothing): «session:» is missing from the answer — the leg above goes red', J(s2)); }
  // RED CONTROLS: this round's musts compiled back in — each must find a leak OF ITS OWN SCENE (the opener of the line that leaked)
  const W1 = 'if (MESSAGE_STOPS.has(text.charCodeAt(j))) { if (first) return null;', W1B = '      if (ce < 0) return null;', W2 = 'else if (sepColon && isMention(chunk, mentions)) keep = true;';
  ok(SRC.split(W1).length === 2 && SRC.split(W1B).length === 2 && SRC.split(W2).length === 2, 'the three controls find their lines');
  const r1 = judge(M.load('src/secret-shapes.js', editAnchor(SRC, W1, 'if (MESSAGE_STOPS.has(text.charCodeAt(j))) { if (first) { out += text.slice(i, e); return { out, end: e }; }', "src/secret-shapes.js"), 'must1'), { stopAtFirst: true, rev: true });
  ok(r1.leaks.length > 0 && verdictOf('，、。：；！？'.includes(r1.leaks[0].op)), `RED CONTROL (must 1 — a value that opens on a CJK stop stays in clear): the corpus finds it on a stop opener, e.g. ${J(r1.leaks[0] ? r1.leaks[0].L : '')}`);
  const r1b = judge(M.load('src/secret-shapes.js', editAnchor(SRC, W1B, '      if (ce < 0) { out += text.slice(i, e); return { out, end: e }; }', "src/secret-shapes.js"), 'must1b'), { stopAtFirst: true, rev: true });
  ok(r1b.leaks.length > 0 && verdictOf(PAIRS[r1b.leaks[0].op.trim()]), `RED CONTROL (must 1, its bracket half — an open pair stays in clear): the corpus finds it on a pair opener, e.g. ${J(r1b.leaks[0] ? r1b.leaks[0].L : '')}`);
  const r2 = judge(M.load('src/secret-shapes.js', editAnchor(SRC, W2, 'else if (chunk.charCodeAt(0) === 64) keep = true;', "src/secret-shapes.js"), 'must2'), { stopAtFirst: true });
  ok(r2.leaks.length > 0 && verdictOf(/(?:^|[:=] ?)@/.test(r2.leaks[0].L)), `RED CONTROL (must 2 — any @ value is a mention): the corpus finds it on an @ value, e.g. ${J(r2.leaks[0] ? r2.leaks[0].L : '')}`);
  // cure 2's RED CONTROLS: each of its rules compiled back out — the corpus finds a leak OF ITS OWN SCENE (a control whose line is gone
  // fails by name, RULES 06:25Z)
  const c2 = (from, to, name) => { ok(SRC.split(from).length === 2, `the control «${name}» finds its line`); return M.load('src/secret-shapes.js', editAnchor(SRC, from, to, "src/secret-shapes.js"), name); };
  const C2 = {
    'an ASCII-only opener (MUST 1)': [c2('      else if (!OPENS_VALUE_RE.test(chunk)) return null;', '      else if (!/^[A-Za-z0-9]/.test(chunk)) return null;', 'c2-ascii'), 'mentions', 'cjk'],
    'the glued rule eats a member (MUST 1)': [c2('const keeps = (c, w) => (w.charCodeAt(0) === 64 && isMention(w, mentions)) ||', 'const keeps = (c, w) => (!glued && w.charCodeAt(0) === 64 && isMention(w, mentions)) ||', 'c2-glued'), 'mentions', 'glued'],
    'the word after a credential word eats a member (MUST 1)': [c2('const keeps = (c, w) => (w.charCodeAt(0) === 64 && isMention(w, mentions)) ||', 'const keeps = (c, w) => (!takeNext && w.charCodeAt(0) === 64 && isMention(w, mentions)) ||', 'c2-next'), 'mentions', 'next'],
    '«password» in prose eats a member (MUST 1)': [c2('ml = mset && mentionLead(tok, mset);', 'ml = null;', 'c2-r5'), 'mentions', 'r5'],
    'the piece before an inner head kept when plain (MUST 2)': [c2('out += blank + (OPENER_PIECE_RE.test(pre) || !w || keeps(pre, w) ? pre : REDACTED + pre.slice(t));', 'out += blank + (plainChunk(pre) || OPENER_PIECE_RE.test(pre) ? pre : REDACTED);', 'c2-pre'), 'pre', 'pre'],   // stale-pins: kept (the OLD line is the mutant compiled back in, never an anchor)
    'a group read with its comma': [c2('!(group && groupAt(w, weak ? groupN : 2) === group)', '!(group && groupOf(w) === group)', 'c2-group'), 'pre', 'group'],
  };
  for (const [name, [SSc, only, scene]] of Object.entries(C2)) {
    const rc = judge(SSc, { only }), hit = rc.leaks.find((x) => x.scene === scene);
    ok(!!hit, `RED CONTROL (${name}): the corpus finds a leak of its own scene «${scene}»${hit ? ', e.g. ' + J(hit.L + ' ⇒ ' + hit.mo) : ' — none found'}`);
  }
  // B-34c8 (cure 2's readers, measured; 主开发: ONE backlog row): THE MEASURED CASES as corpus rows — each a group message with the
  // member set given — and THE OVER-MASK ORACLE: ordinary text beside a value keeps every word the STRICTER, independent rule (plainT)
  // calls plain, and with no head at all the line comes back as it was. Three were cured (groupAt, the glued rule after a value of
  // other scripts, mentionLead's stop); three stay as stated (the plain-word cost, R5's non-mention, a label of other scripts)
  {
    const MSG = (SSx, L) => SSx.redactSecrets(L, { message: true, mentions: ['beta'] }).text, LINE = (L) => SS.redactSecrets(L).text;
    const val = 'Xk9' + rnd(9, MIX), tok = 'Hx7' + rnd(8, MIX);
    const s1 = rnd(2, '0123456789') + rnd(2, LET), s2 = rnd(4, LET), s3 = rnd(2, LET) + rnd(2, '0123456789'), s4 = rnd(4, LET), ap = [0, 1, 2, 3].map(() => rnd(4, LET));   // built at runtime
    const CASES = {
      c1: ['(1) a plain word with its comma right after ONE short value is prose — «failed,» kept (groupAt; cured)', 'session: fixed1 failed, retry now', (o) => !o.includes('fixed1') && o.includes(' failed, retry now')],
      c1b: ['(1) …a split code keeps its second group hidden with its comma («5678,» is no plain word)', 'password: 1234 5678, ok', (o) => !o.includes('1234') && !o.includes('5678') && o.endsWith(' ok')],
      c2: ['(2) ASCII glued behind a value of other scripts through a CJK stop is a new word — «please» kept (cured)', 'session: 已修好，please check', (o) => !o.includes('已修好') && o.includes('，please check')],
      c2b: ['(2) …a value that holds ASCII keeps the glued rule — «hunter» behind «Xk9…，» hidden', `session: ${val}，hunter check`, (o) => !o.includes(val) && !o.includes('hunter') && o.endsWith(' check')],
      c3: ['(3) R5: the full-width colon after a member\'s @ is kept, what follows it hidden (mentionLead; cured)', `I reset the password @beta：${tok}`, (o) => o.includes('@beta：') && !o.includes(tok)],
      c4: ['(4) a member\'s @ resets the word after a credential word: a plain word after it stays — the stated plain-word cost', 'auth: password @beta hunter', (o) => o.includes('@beta hunter')],
      c4b: ['(4) …a word with a digit after it is still hidden', 'auth: password @beta hunter2', (o) => o.includes('@beta') && !o.includes('hunter2')],
      c5: ['(5) R5 with a possessive after the @ is no mention — the token hidden whole, as the release (the line rule) does', 'I reset the password @beta\'s', (o, L) => !o.includes('beta') && o === LINE(L)],
      c5b: ['(5) …and with a glued ASCII mark after it', `I reset the password @beta:${tok}`, (o, L) => !o.includes(tok) && o === LINE(L)],
      c6: ['(6) a full-width colon after a label of other scripts is left as the release leaves it (the message mode = the line rule)', `密码：${tok}`, (o, L) => o === LINE(L)],
      // round w7azupbri (主开发's ruling): after a STRONG head every chunk keeps the base's strip and group verdict
      c7: ['(7) a STRONG head: a two-group code whose second group is lowercase letters with a full stop — BOTH groups hidden', `password: ${s1} ${s2}.`, (o) => !o.includes(s1) && !o.includes(s2)],
      c7b: ['(7) …the same with a comma and prose after it — both groups hidden, «use it once» kept', `password: ${s3} ${s4}, use it once`, (o) => !o.includes(s3) && !o.includes(s4) && o.endsWith(' use it once')],
      c7c: ['(7) …an app code with a comma INSIDE — all four groups hidden (the comma no longer resets the group)', `password: ${ap.join(' ').replace(ap[1] + ' ', ap[1] + ', ')}`, (o) => ap.every((x) => !o.includes(x))],
      c7d: ['(7) …and the measured shape after a strong head: «failed,» is the group\'s there (only a session word keeps it)', 'password: fixed1 failed, retry now', (o) => !o.includes('failed') && o.endsWith(' retry now')],
    };
    for (const [, [name, L, pass]] of Object.entries(CASES)) { const o = MSG(SS, L); ok(verdictOf(pass(o, L)), `B-34c8 ${name}`, J({ L, o })); }
    // THE OVER-MASK ORACLE: ordinary chunks (a path with a line number, a URL with a query, a base64 run) in four places — no head; after
    // an ASCII value; after a value of other scripts, a blank or a CJK stop between; after ONE short group-shaped value (cure 2's
    // groupAt case). The group rule's own cost is outside it: a same-length word with NO mark right after a 4–8 value is the group's
    // (an app password's groups are plain-looking words)
    const ORD = ['src/foo.js line 42', 'https://example.com/search?q=build&page=2', 'aGVsbG8gd29ybGQ= 和 dGhlIHJlc3Q='];
    const over = [];
    for (const X of ORD) {
      for (const L of [`see ${X} then`]) { const o = MSG(SS, L); if (!(o === LINE(L) && (X.startsWith('aGVs') || o === L))) over.push({ L, o, why: 'no head: not as it was' }); }
      for (const [L, after] of [[`session: ${val} ${X} and the rest`, val], [`session: 已修好 ${X} 然后 more`, '已修好'], [`session: 已修好，${X} and more`, '已修好'], [`session: fixed1 ${X}, then more`, 'fixed1'], [`session: fixed1 failed, ${X} and more`, 'fixed1']]) {
        const o = MSG(SS, L), have = chunks(o), want = chunks(L.slice(L.indexOf(after) + after.length)).filter((x) => plainT(x));
        const lost = want.filter((x) => { const at = have.indexOf(x); if (at < 0) return true; have.splice(at, 1); return false; });
        if (lost.length || o.includes(after)) over.push({ L, o, lost });
      }
    }
    ok(over.length === 0, `B-34c8 THE OVER-MASK ORACLE: ${ORD.length} ordinary chunks × 6 places — every word the stricter rule calls plain stays beside a value, the value itself hidden; with no head the line is as it was${over.length ? ' — ' + over.slice(0, 3).map(J).join(' · ') : ''}`);
    // RED CONTROLS: each cure compiled back out ⇒ its measured row goes red (a control whose line is gone fails by name)
    const GA = "const groupAt = (c, n = 2) => groupOf(c.length > 16 ? '' : c) || (n >= 2 || !plainChunk(c) ? groupOf(c.length > 16 ? '' : c.replace(/[.,;:!?)\\]}\"'»”’…—–-]+$/, '')) : null);";
    const GL = 'masking = !tail; glued = !prose; }';
    const ML = '  return at[0] + stop + (!more || more === REDACTED ? more : REDACTED);';
    for (const [name, from, to, key] of [
      ['groupAt strips every chunk\'s comma (cure 2\'s)', GA, "const groupAt = (c) => groupOf(c.length > 16 ? '' : c.replace(/[.,;:!?)\\]}\"'»”’…—–-]+$/, ''));", 'c1'],   // stale-pins: kept (the OLD line is the mutant compiled back in, never an anchor)
      ['the glued rule after any value', GL, 'masking = !tail; glued = true; }', 'c2'],   // stale-pins: kept (the OLD line is the mutant compiled back in, never an anchor)
      ['mentionLead eats the stop', ML, "  return at[0] + (!rest || rest === REDACTED ? rest : REDACTED);", 'c3'],
      ['every head weak (the prose exception after a password too)', 'const weakHead = (name) => { const ws = nameWords(name); return ', 'const weakHead = (name) => { const ws = nameWords(name); return true || ', 'c7'],
    ]) {
      ok(SRC.split(from).length === 2, `the control «${name}» finds its line`);
      const SSc = M.load('src/secret-shapes.js', editAnchor(SRC, from, to, "src/secret-shapes.js"), 'b34c8-' + key), [, L, pass] = CASES[key], o = MSG(SSc, L);
      ok(!pass(o, L), `RED CONTROL (${name}): its measured row goes red — ${J(o)}`);
    }
  }
  // the main loop's guard: a COUNT of steps, never a clock — every message-mode loop is marked, each character read a bounded number of times
  ok(SRC.split('/*msg-step*/').length - 1 >= 9, 'the step marks are in every message-mode loop');
  const ST = M.load('src/secret-shapes.js', editAnchor(SRC, '/*msg-step*/', 'globalThis.__msgSteps = (globalThis.__msgSteps || 0) + 1;', "src/secret-shapes.js", 'join'), 'steps');
  const HOSTILE = ['password: ' + 'a'.repeat(100000), 'token: x ' + '"\''.repeat(50000), 'token: x ' + 'token: ('.repeat(8000), 'key: ' + 'x9 '.repeat(20000), 'secret: x' + '「'.repeat(60000), 'token: a9 ' + '.'.repeat(60000) + 'x', 'token: x @' + '!'.repeat(60000) + 'x', 'token: (' + 'a'.repeat(60000), 'token: x ' + '{"a":'.repeat(12000)];
  const steps = HOSTILE.map((t) => { globalThis.__msgSteps = 0; ST.redactSecrets(t, { message: true, mentions: ['beta'] }); return { len: Math.min(t.length, INPUT_MAX), n: globalThis.__msgSteps }; });
  ok(gateOf(steps.every((x) => x.n <= 6 * x.len)) && verdictOf(steps.every((x) => x.n > 1000)), `LINEAR BY COUNT: ${steps.map((x) => `${x.n} steps / ${x.len} chars`).join(' · ')} — each ≤ 6 × its length, each loop seen`);
}

console.log('lane bl-msg B-be02: a secret NAME=value INSIDE a prose line — the head before it no longer eats its opener');
{
  const SS = r('src/secret-shapes.js'), J = JSON.stringify;
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  const V = crypto.randomBytes(8).toString('hex'), N = String(10000000 + crypto.randomInt(89999999));
  // the row's measured cases (0 redactions on the release) + a public head before a holder mid-line
  // r2 (the adversarial read G1 / G2 / G5): the wrapped forms agents write and a flag that carries an assignment; the base hid none of these
  const PROSE = [`A prose line: API_KEY=${V} should be hidden.`, `set it so: DB_PASSWORD=${N}`, `status: token=${V} rest`, 'set `DB_PASSWORD=' + N + '` then', `"API_KEY=${V}"`, `**API_KEY=${V}** x`, `<API_KEY=${V}>`, `gcloud run deploy --set-env-vars=API_KEY=${V},DB_PASSWORD=${N}`];
  const judge = (SSx, o) => PROSE.map((t) => ({ t, out: SSx.redactSecrets(t, o).text }));
  const leaks = (rows) => rows.filter((x) => x.out.includes(V) || x.out.includes(N));
  for (const [mode, o] of [['line', {}], ['message', { message: true }]]) {
    const rows = judge(SS, o), bad = leaks(rows);
    ok(bad.length === 0, `${mode.toUpperCase()} MODE: a secret-named NAME=value after a public «word:» head is redacted — all ${rows.length} prose lines${bad.length ? ' — leaked: ' + bad.map((x) => J(x.out)).join(' · ') : ''}`);
  }
  ok(SS.redactSecrets(`A prose line: API_KEY=${V} should be hidden.`, { message: true }).text === `A prose line: API_KEY=${REDACTED} should be hidden.`, 'MESSAGE MODE: the name stays, the value is one token, the rest of the sentence arrives');
  ok(SS.redactSecrets('user: alice').text === 'user: alice' && SS.redactSecrets(`{"user": "x", "token": "${V}"}`).text === `{"user": "x", "token": "${REDACTED}"}` && SS.redactSecrets(`TOKEN_TTL=3600 API_KEY=${V} tail`, { message: true }).text === `TOKEN_TTL=3600 API_KEY=${REDACTED} tail`,
    'a public head alone stays, a JSON neighbour and a descriptor head before a holder are judged as before');
  // a vault mark (the live-value masker's placeholder) is never re-opened: the give-back is the blanks only, never the head's `:`
  const MARK = 'see «<[vault:apikey:k]>» and [vault:agent:ops/deploy] here';
  ok(SS.redactSecrets(MARK).text === MARK && SS.redactSecrets(MARK, { message: true }).text === MARK, 'a vault mark stays whole in both modes (its `vault:` head gives back no colon)');
  const COLON = editAnchor(SRC, "(m[5].endsWith('=') ? 1 : 0));   // r2", "(/[:=]$/.test(m[5]) ? 1 : 0));   // r2", "src/secret-shapes.js");
  ok(COLON !== SRC && mutantCopies('blmbe2', REPO).load('src/secret-shapes.js', COLON, 'colon-back').redactSecrets(MARK).text !== MARK, 'RED CONTROL (the colon given back too — the first cut): the vault mark is re-masked — the leg above goes red');
  ok(SS.redactSecrets(SS.redactSecrets(PROSE[0]).text).text === SS.redactSecrets(PROSE[0]).text, 'idempotent');
  ok(SS.redactSecrets('set `DB_PASSWORD=' + N + '` then', { message: true }).text === 'set `DB_PASSWORD=' + REDACTED + '` then' && SS.redactSecrets(`**API_KEY=${V}** x`, { message: true }).text === `**API_KEY=${REDACTED}** x`, 'MESSAGE MODE: the wrapper\'s closing twin stays the prose\'s (a backtick, the bold marks)');
  const noOpen = mutantCopies('blmbe3', REPO).load('src/secret-shapes.js', editAnchor(SRC, "/(^|[\\s,;{(\\[:/=`\"'*<])(-{0,2})", "/(^|[\\s,;{(\\[:/])(-{0,2})", "src/secret-shapes.js"), 'no-new-openers');
  ok(gateOf(SRC.includes("/(^|[\\s,;{(\\[:/=`\"'*<])(-{0,2})")) && leaks(judge(noOpen, {})).length >= 5, `RED CONTROL (the base's openers): the wrapped forms and the flag's assignment leak again (${leaks(judge(noOpen, {})).length}/${PROSE.length})`);
  // RED CONTROL: the give-back removed — the row's two sentences leak again in both modes
  const GIVE = "    KV_HEAD.lastIndex = headEnd - (bl || (m[5].endsWith('=') ? 1 : 0));   // r2: a bare `=` is given back (an opener now) — never a `:`\n";
  ok(SRC.split(GIVE).length === 2, 'the control finds its line (the give-back)');
  const noBack = mutantCopies('blmbe', REPO).load('src/secret-shapes.js', editAnchor(SRC, GIVE, '', "src/secret-shapes.js"), 'no-give-back');
  ok(leaks(judge(noBack, {})).length >= 3 && leaks(judge(noBack, { message: true })).length >= 3, `RED CONTROL (the head keeps its trailing blank): the prose lines leak again (${leaks(judge(noBack, {})).length}/${PROSE.length}) — the legs above go red`);
}

// ── B-da2d (lane paced-wake-retry — row B-a3fe's remainder, found by lane lg-recovery on 2026-11-20): R9, A URL'S PASSWORD STANDING
// ON ITS OWN. The release read a userinfo only inside a query value (R7 hidesHolder): `https://deploy:<pw>@git.example/x` in a
// message, a job's output head or a job's name was kept in plain. THE LAWS (the coordinator's ruling, 2026-11-21): only the password
// goes — the scheme, the user and the host stay; only after a scheme and `://`; a bare user (ssh / scp / a mail address / a git
// remote) is kept; a port is no password; a percent-encoded one still is; an empty one hides nothing; the mark is the belts' own;
// OVER-MASKING IS A DEFECT — each shape that must stay is a leg, beside the six that must go and the red control (the release's rows)
// r2209 (主开发): the R7 expressions of LINE 246 (fa0a6c1a5, this follow's base) and of the ROUND's tip (e06c2a0e9), planted by the
// legs below — line 246's masker = this tree with line 246's value expressions (free text and name); the round's tip = its four
const R7_L246 = {
  head: "const QUERY_HEAD_RE = /([?&;#])([A-Za-z0-9_.\\-\\[\\]%]{1,80})=(?!«)(?=[^&#;\\s\"'<>])/g;",   // stale-pins: kept (line 246's R7 head, compared)
  value: "const QUERY_VALUE_RE = /[^&#;\\s\"'<>]{1,65536}/y;",   // stale-pins: kept (line 246's value class, planted to compare)
  nested: "const NESTED_HEAD_RE = /[?&;#]([A-Za-z0-9_.\\-\\[\\]%]{1,80})=(?!«)(?=[^&#;\\s\"'<>])/g;",   // stale-pins: kept (line 246's nested head, compared)
};
const R7_E06 = {
  head: "const QUERY_HEAD_RE = /([?&;#])([A-Za-z0-9_.\\-\\[\\]%]{1,80})=(?!«)(?=«|[^&#;\\s\"'<>`\\u0080-\\uffff])/g;",   // stale-pins: kept (the round's tip, a red control)
  value: "const QUERY_VALUE_RE = /«[^&#;\\s\"'<>`«»\\u0080-\\uffff]{1,65536}»?|(?:[^&#;\\s\"'<>`\\u0080-\\uffff]|«redacted»){1,65536}/y;",   // stale-pins: kept (the round's tip, a red control)
  nested: "const NESTED_HEAD_RE = /[?&;#]([A-Za-z0-9_.\\-\\[\\]%]{1,80})=(?!«)(?=«|[^&#;\\s\"'<>`\\u0080-\\uffff])/g;",   // stale-pins: kept (the round's tip, a red control)
};
const R7_0582_NAME = "const NAME_QUERY_VALUE_RE = /«[^«»\\r\\n]{1,65536}»|(?:«redacted»|[^&#;\\s\"'<>]){1,65536}/y;";   // stale-pins: kept (058237eb2's name-road expression: the mark read as a quote, r2280's red control)
const R7_KINDS = ['accented', 'startsOutside', 'guillemetName', 'encodedNested', 'rawNested', 'backtick', 'guillemet', 'turnToCjk'];
const r7Plant = (src, which) => {
  const lineOf = (s, k) => s.split('\n').find((l) => l.startsWith(k)).split('   //')[0], asName = (l) => 'const NAME_QUERY_VALUE_RE = ' + l.slice('const QUERY_VALUE_RE = '.length);
  const P = which === 'l246' ? [['const QUERY_VALUE_RE = ', R7_L246.value], ['const NAME_QUERY_VALUE_RE = ', asName(R7_L246.value)]]
    : [['const QUERY_HEAD_RE = ', R7_E06.head], ['const QUERY_VALUE_RE = ', R7_E06.value], ['const NESTED_HEAD_RE = ', R7_E06.nested], ['const NAME_QUERY_VALUE_RE = ', asName(R7_E06.value)]];
  let s = src; for (const [k, v] of P) s = anchored(s, lineOf(s, k), v, `r2209 ${which} ${k.trim()}`); return s;
};

console.log('B-da2d: R9 — a URL\'s password standing on its own: only it goes (a message, an output head, a job\'s name); every kept shape kept');
{
  const SS = r('src/secret-shapes.js'), J = JSON.stringify, M = r('src/job-model.js');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const FY = await import(path.join(REPO, 'src/lib/foryou-links.js'));
  const DM = r('src/decision-model.js');
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  // values built at run time (secret-scan safe)
  const pw = ['Hx7', 'q2', 'Lm9', 'z'].join(''), pe = ['p', '%40', 'ss', '%21', 'Q9'].join(''), pa = ['pa', '@', 'ss', 'W0rd'].join('');
  // THE SIX THAT MUST GO — [what, the text, what every reader gets back]
  const GO = [
    ['a git remote over https', 'git push https://deploy:' + pw + '@git.example/org/repo.git main', 'git push https://deploy:' + REDACTED + '@git.example/org/repo.git main', [pw]],
    ['a connection string, a port after its host', 'DATABASE_URL=postgres://app:' + pw + '@db.internal:5432/main', 'DATABASE_URL=postgres://app:' + REDACTED + '@db.internal:5432/main', [pw]],
    ['a password with no user', 'redis://:' + pw + '@cache.internal:6379/0', 'redis://:' + REDACTED + '@cache.internal:6379/0', [pw]],
    ['a percent-encoded password', 'curl https://ops:' + pe + '@api.example/v1', 'curl https://ops:' + REDACTED + '@api.example/v1', [pe, 'ss%21']],
    ['a raw @ inside the password (the LAST @ ends the userinfo)', 'amqp://worker:' + pa + '@mq.example:5672', 'amqp://worker:' + REDACTED + '@mq.example:5672', [pa, 'ssW0rd']],
    ['in prose, in parentheses and in a markdown link (an upper-case scheme)', 'see (https://ci:' + pw + '@build.example) and [x](HTTPS://ci:' + pw + '@build.example/a)', 'see (https://ci:' + REDACTED + '@build.example) and [x](HTTPS://ci:' + REDACTED + '@build.example/a)', [pw]],
    // round wiagjybli: a real password with Chinese prose glued after it (a full-width comma ends the host) and JSON's escaped slashes
    ['a real password, Chinese prose glued after the host', '见https://ci:' + pw + '@h.example，谢谢', '见https://ci:' + REDACTED + '@h.example，谢谢', [pw]],
    ['JSON with escaped slashes (PHP json_encode)', '{"dsn":"mysql:\\/\\/app:' + pw + '@db.example\\/main"}', '{"dsn":"mysql:\\/\\/app:' + REDACTED + '@db.example\\/main"}', [pw]],
    // round wmkwcfhkr (the narrow round's must): punctuation or a host list after the port can no longer un-hide it — nothing after the at-sign is read
    ['narrow round: a port, then a sentence\'s full stop', 'Broker is amqp://worker:' + pw + '@mq.example:5672.', 'Broker is amqp://worker:' + REDACTED + '@mq.example:5672.', [pw]],
    ['narrow round: a port inside a markdown link', '[db](postgres://app:' + pw + '@db.internal:5432)', '[db](postgres://app:' + REDACTED + '@db.internal:5432)', [pw]],
    ['narrow round: a list of hosts (a MongoDB replica set)', 'mongodb://admin:' + pw + '@h1.example:27017,h2.example:27017/db?replicaSet=rs0', 'mongodb://admin:' + REDACTED + '@h1.example:27017,h2.example:27017/db?replicaSet=rs0', [pw]],
    ['narrow round: a port, then a comma and prose', 'mysql://root:' + pw + '@db:3306, then', 'mysql://root:' + REDACTED + '@db:3306, then', [pw]],
    ['ASCII signs a generated password carries (^ { } | \\)', 'mysql://root:' + 'P^ss{1}|x' + '\\' + 'y' + '@db/x', 'mysql://root:' + REDACTED + '@db/x', ['P^ss{1}']],
    // round wz8ibfxag (the follow, r1655 (2)): shapes the generator's alphabet never draws, one fixed row each
    ['a pass-phrase holding a raw colon (the user part ends at the FIRST one)', 'git push https://ops:' + ['pa', ':ss', ':word9'].join('') + '@git.example/o/r', 'git push https://ops:' + REDACTED + '@git.example/o/r', ['pa:ss:word9', 'ss:word9']],
    ['a pass-phrase of lowercase words', 'curl https://deploy:' + ['correct', 'horse', 'battery', 'staple'].join('-') + '@api.example/v1', 'curl https://deploy:' + REDACTED + '@api.example/v1', ['correct-horse-battery-staple', 'battery']],
    ['a pass-phrase holding an equals sign', 'mysql://root:' + ['a', '=b', '=c9'].join('') + '@db/x', 'mysql://root:' + REDACTED + '@db/x', ['a=b=c9']],
  ];
  // THE SHAPES THAT MUST STAY, byte for byte (over-masking is a defect)
  const KEEP = [
    ['an ssh remote (a bare user)', 'git clone ssh://git@github.com/org/repo.git'], ['an scp remote (no scheme)', 'git remote add origin git@github.com:org/repo.git'],
    ['an scp copy (a colon after the host)', 'scp ./a.txt ops@backup.example:/srv/a.txt'], ['a mail address', 'write to ops@example.com or mailto:ops@example.com'],
    ['a port and no userinfo', 'curl https://example.com:8443/health'], ['a user, a port and an @ in the path', 'open https://ops@social.example:443/@ops'],
    ['an EMPTY password (hides nothing)', 'curl https://ci:@api.example/v1'], ['a bare user over ftp', 'ftp://anonymous@ftp.example.org/pub'],
    ['an IPv6 host (colons, no userinfo)', 'curl http://[2001:db8::5]:8080/x'],
    // round wiagjybli (THE MUST): unspaced CJK prose — a host ends where a host can end; the readers' three sentences word for word
    ['lens 1: a port, a full-width comma, a mention later', '已部署到http://10.0.0.5:' + '8080，请@lead验收'],
    ['lens 2: the same with another mention', '已部署到http://10.0.0.5:' + '8080，请@alice验收'],
    ['lens 3: a blank before the URL, a mention with a blank after', '服务起在 http://10.0.0.5:' + '8080，有问题@ops 看一下'],
    ['a mail address later in the sentence', '服务在http://10.0.0.5:' + '3456，请联系ops@corp.example'],
    ['CJK letters glued to the port (no punctuation)', 'http://h.example:' + '8080请@lead'],
    ['a JSON with no blanks (a quote ends the authority)', '{"url":"https://x.example","mail":"ops@y.example"}'],
  ];
  const roads = (S, t) => ({ head: S.redactSecrets(t).text, message: S.redactSecrets(t, { message: true }).text, name: S.redactByValue(t, { typed: true }).text, stored: S.redactByValue(t).text });
  const goBad = GO.filter(([, t, want]) => { const o = roads(SS, t); return o.head !== want || o.message !== want || o.name !== want || o.stored !== want || belt.maskForSink(t, { message: true }) !== want || belt.maskForSink(t, { byValue: true, typed: true }) !== want || SS.redactSecrets(want).text !== want; });
  for (const [what, t, want] of GO) console.log(`      ${J(t).slice(0, 70).padEnd(72)} → ${roads(SS, t).head === want ? 'only the password masked' : J(roads(SS, t))}   (${what})`);
  ok(!goBad.length, `R9 THE SIX (and the round's two: Chinese prose after the host, JSON's escaped slashes): a URL's password standing on its own — ONLY it goes, the scheme, the user and the host stay — through the output belt (an output head), the message mode, maskForSink (a message and a job's name), the name rule (typed and stored); idempotent${goBad.length ? ' — wrong: ' + goBad.map(([w, t]) => w + ' ' + J(roads(SS, t))).join(' · ') : ''}`);
  const vendor = GO.filter(([, t, , frags]) => frags.some((f) => DM.scrub(t, 2000).includes(f)));
  ok(!vendor.length, 'R9: the vendor scrub (a text bound for a vendor\'s model, R8 on) keeps no piece of the six passwords', vendor.map(([w]) => w));
  const keepBad = KEEP.filter(([, t]) => { const o = roads(SS, t); return o.head !== t || o.message !== t || o.name !== t || o.stored !== t || belt.maskForSink(t, { message: true }) !== t || DM.scrub(t, 2000) !== t || FY.maskedNoteOf(belt.maskForSink(t, { message: true })) !== ''; });
  ok(!keepBad.length, `R9 KEPT: ${KEEP.length} shapes byte-identical through every road (an output head, a message, a job's name typed and stored, the vendor scrub) and drawn as links with no note — ${KEEP.map(([w]) => w).join(' · ')}${keepBad.length ? ' — MOVED: ' + keepBad.map(([w, t]) => w + ' ' + J(roads(SS, t))).join(' · ') : ''}`);
  // a job's NAME end to end (resolveName → the name rule → the slug): the user and the host stay readable in it
  const NAME = 'deploy https://ci:' + pw + '@git.example/x', WANT_NAME = 'deploy-https-ci-' + REDACTED + '-git.example-x';
  ok(M.resolveName(NAME, new Set()).name === WANT_NAME && M.resolveName('clone ssh://git@github.com/o/r', new Set()).name === 'clone-ssh-git-github.com-o-r', 'R9 a job\'s NAME: «' + NAME.replace(pw, '<password>') + '» is stored as ' + WANT_NAME + ' (the user and the host stay); an ssh remote\'s name keeps its user', M.resolveName(NAME, new Set()).name);
  // the sender is told what was masked (the head as written), each mask counted once; a query value is still R7's (masked whole, once)
  const said = []; SS.redactSecrets(GO[0][1], { message: true, said });
  const PART = 'git push https://ci:abc-ghp_' + 'A1b2'.repeat(9) + '@github.com/o/r', WHOLE = 'git push https://ci:ghp_' + 'A1b2'.repeat(9) + '@github.com/o/r', VMARK = 'curl https://u:[vault:ci-token]@h.example/x';
  ok(gateOf(said.includes('https://deploy:')) && SS.redactSecrets(GO[0][1]).redacted === 1 && SS.redactSecrets(GO[5][1]).redacted === 2 && SS.redactSecrets('https://x.example/a?next=https://u:' + pw + '@db/x').text === 'https://x.example/a?next=' + REDACTED && SS.redactSecrets('https://x.example/a?next=https://u:' + pw + '@db/x').redacted === 2
    && SS.redactSecrets(PART).text === 'git push https://ci:' + REDACTED + '@github.com/o/r' && SS.redactSecrets(WHOLE).text === 'git push https://ci:' + REDACTED + '@github.com/o/r' && SS.redactByValue(PART, { typed: true }).text === 'git push https://ci:' + REDACTED + '@github.com/o/r'
    && SS.redactSecrets(VMARK).text === VMARK && SS.redactSecrets(VMARK, { message: true }).text === VMARK,
    'R9: the sender is told «https://deploy:» (what was masked); one mask per password; inside a query value R9 hides the pass-phrase FIRST and R7 then masks the whole value, as r5 had it (two masks, the text R7\'s); a password a row masked IN PART is masked whole (nothing of «abc-» kept, round wiagjybli); a password that IS a vault mark stays (its entry\'s name)', said);
  // a masked URL is drawn as WORDS with a note in the For-you card (lane mask-value-shape law 2 — never a link that looks whole)
  ok(FY.maskedNoteOf(belt.maskForSink(GO[0][1], { message: true })) !== '' && gateOf(SS.maskedLink(GO[0][2])) && SS.maskedLink(GO[0][2]).shape === true, 'R9: a URL whose password was masked is a MASKED LINK — the For-you card draws it as words with its note');
  // bounded and linear BY COUNT: the authority walk's steps, counted in an instrumented copy (never clocked)
  const STEP_AT = "    const c = d.charCodeAt(j);\n    if (c === 47 || c === 63 || c === 35 || isBlankCode(c)) break;                 // `/ ? #` or a blank: the stretch ended\n";
  const MS = mutantCopies('da2d-steps', REPO).load('src/secret-shapes.js', anchored(SRC, STEP_AT, '    globalThis.__r9Steps++;\n' + STEP_AT, 'R9 the walk counted'), 'steps');
  // each storm holds an `@` (no `@`, no walk); the walks of one text never overlap (each ends at the `/` of the next `://`)
  const HOSTILE = ['x://' + 'a:@'.repeat(21000), 'a://b'.repeat(13000) + '@', ('h://u:p@' + 'x'.repeat(1100) + ' ').repeat(55), 'h://' + ':'.repeat(30000) + '@'.repeat(30000), ('a://' + 'b'.repeat(1020) + '/').repeat(60) + '@', ('see https://u:' + pw + '@h.example/x ').repeat(1800)];
  const ROADS = [['the output belt', (t) => MS.redactSecrets(t)], ['the message mode', (t) => MS.redactSecrets(t, { message: true })], ['the name rule', (t) => MS.redactByValue(t, { typed: true })]];
  const steps = HOSTILE.flatMap((t) => ROADS.map(([road, f]) => { globalThis.__r9Steps = 0; f(t); return { road, len: Math.min(t.length, INPUT_MAX), n: globalThis.__r9Steps }; }));
  ok(gateOf(steps.every((x) => x.n <= x.len)) && verdictOf(steps.every((x) => x.n > 1000)), `R9 LINEAR BY COUNT (${HOSTILE.length} storms × ${ROADS.length} roads): ${steps.filter((x, i) => i % ROADS.length === 0).map((x) => `${x.n} steps / ${x.len} chars`).join(' · ')} — every road's walk ≤ the text's length, each walk seen`);
  // the walk's bound (r4's, ≤ 1 024 characters of authority): a 1 000-character password is masked whole
  const LONG = 'https://u:' + pw.repeat(111) + '@h.example/x';
  ok(SS.redactSecrets(LONG).text === 'https://u:' + REDACTED + '@h.example/x' && SS.redactByValue(LONG, { typed: true }).text === 'https://u:' + REDACTED + '@h.example/x', 'R9: a password of ' + pw.length * 111 + ' characters (inside the walk\'s 1 024 bound) is masked whole on both roads');
  // THE RED CONTROLS, each RED by name
  const R9S = "    text = redactUserinfo(text, (head) => { n++; if (say) say(head); });   // R9 (B-da2d): a URL's password standing on its own — only it goes; BEFORE R7: R7's value cut must never split a pass-phrase\n";
  const R9V = "    text = redactUserinfo(text, () => { n++; });   // R9 (B-da2d): a URL's password, whatever it is — only it goes (the output belt's own row, before R7 as there)\n";
  const REL = mutantCopies('da2d-release', REPO).load('src/secret-shapes.js', anchored(anchored(SRC, R9S, '', 'R9 in the output belt'), R9V, '', 'R9 in the name rule'), 'release');
  const relLeak = GO.filter(([, t, , frags]) => { const o = roads(REL, t); return frags.some((f) => o.head.includes(f) && o.message.includes(f) && o.name.includes(f)); });
  const relName = M.resolveName(NAME, new Set(), { mask: (t) => REL.redactByValue(t, { typed: true }).text }).name;
  ok(relLeak.length === GO.length && verdictOf(relName.includes(pw)), `RED CONTROL — THE RELEASE'S ROWS (no R9): all ${relLeak.length}/${GO.length} passwords kept in plain on every road; the job's name stored as ${relName.replace(pw, '<the password>')} — the legs above go red`);
  const NOQ = mutantCopies('da2d-noquote', REPO).load('src/secret-shapes.js', anchored(SRC, '    const a = userinfoAt(text, from, true);', '    const a = userinfoAt(text, from, false);', 'R9 no quote ends'), 'noquote');
  const jsonKeep = KEEP.find(([w]) => w.startsWith('a JSON'))[1];
  ok(NOQ.redactSecrets(jsonKeep).text !== jsonKeep, 'RED CONTROL — NO QUOTE ENDS THE AUTHORITY: the compact JSON\'s mail address is over-masked (' + J(NOQ.redactSecrets(jsonKeep).text) + ') — the KEPT leg goes red');
  const FIRST = mutantCopies('da2d-firstat', REPO).load('src/secret-shapes.js', anchored(SRC, '    if (c === 64) at = j; else', '    if (c === 64) { if (at < 0) at = j; } else', 'R9 the first @'), 'firstat');
  ok(verdictOf(FIRST.redactSecrets(GO[4][1]).text.includes('ssW0rd')), 'RED CONTROL — THE FIRST @ ENDS THE USERINFO: the tail of a password holding a raw @ is kept (' + J(FIRST.redactSecrets(GO[4][1]).text) + ') — the six go red');
  // ── round wiagjybli (the readers' must, the coordinator's law): IN FREE TEXT A HOST ENDS WHERE A HOST CAN END
  // every stop of a message — the module's ONE list, MESSAGE_STOPS, read from the module — ends the walk: a port, the stop, a mention after
  const msm = /\nconst MESSAGE_STOPS = new Set\(\[\.\.\.'([^']+)'\]/.exec(SRC), STOPS = msm ? [...msm[1]] : [];
  const stopBad = STOPS.filter((ch) => { const t = 'http://10.0.0.5:' + '8080' + ch + '@lead'; return SS.redactSecrets(t).text !== t || SS.redactSecrets(t, { message: true }).text !== t || SS.redactByValue(t, { typed: true }).text !== t; });
  ok(STOPS.length >= 15 && !stopBad.length, `CJK: every one of the ${STOPS.length} stops of a message (MESSAGE_STOPS, the ONE list) ends a free text's authority — a port, the stop, then «@lead» — kept on every road${stopBad.length ? ' — moved at: ' + stopBad.join(' ') : ''}`);
  // an at-mention's place is unmoved (the mention = the sentence's LAST @): the owner's @-picker place is moved by the mask of the words BEFORE it (groups-engine's own
  // arithmetic: maskForSink of the prefix) — it lands on the mention when the URL's authority ends before it
  const MENTIONS = [...KEEP.filter(([w]) => w.startsWith('lens')).map(([, t]) => t), '见https://ci:' + pw + '@h.example，请@lead验收'];
  const placeOf = (mask, g) => { const ps = g.lastIndexOf('@'), m = /^@[a-z]+/.exec(g.slice(ps))[0], body = mask(g), d = mask(g.slice(0, ps)).length - ps; return body.slice(ps + d, ps + d + m.length) === m && !body.includes(pw); };
  const sinkMask = (t) => belt.maskForSink(t, { message: true });
  ok(verdictOf(MENTIONS.every((g) => placeOf(sinkMask, g))), `CJK: an at-mention's place is unmoved — the picker's place moved by its prefix's mask lands on the mention (${MENTIONS.length} sentences: the readers' three, and a real password before a mention, masked)`);
  // the mask's own mark is read WHOLE inside the walk: a user masked before never lets its password through
  const MUSER = 'git push https://ghp_' + 'A1b2'.repeat(9) + ':' + pw + '@github.com/o/r';
  ok(SS.redactSecrets(MUSER).text === 'git push https://ghp_' + REDACTED + ':' + REDACTED + '@github.com/o/r' && SS.redactSecrets(MUSER, { message: true }).text === 'git push https://ghp_' + REDACTED + ':' + REDACTED + '@github.com/o/r', 'CJK: the belts\' own mark «redacted» is read whole inside a free text\'s authority — a user R4 masked first keeps its password masked too');
  // a password that starts inside the vendor scrub's kept window is read whole (VALUE_MAX ≥ the walk's 1 024): no prefix at the cut
  const CUT = 'x'.repeat(300) + ' https://u:' + pw.repeat(100) + '@h.example/x', cp = DM.cleanPart(CUT, 100);
  ok(SS.VALUE_MAX >= 1024 && !cp.includes(pw) && !cp.includes(pw.slice(0, 5)), `the vendor scrub cuts BEFORE it redacts, at 4× + VALUE_MAX (${SS.VALUE_MAX} ≥ the walk's 1 024): a 900-character password starting inside the kept window leaves no piece — ${J(cp.slice(-60))}`);
  // ── THE LAW (the coordinator's r1504 + r1510, after two rounds whose musts came from the cure before them): whether a pass-phrase
  // is hidden is decided by the STRETCH alone (from after `://` to its own end: a blank, a line end, `/ ? #`, a quote, `< >`, a
  // backtick, any character outside ASCII — the mark read whole), the pass-phrase from the colon after the user part to the stretch's
  // LAST at-sign; nothing after that at-sign is read. THE IMAGE TAG (accepted, fail closed — r1510 (4)): a tag is hidden as a pass-phrase
  const DOCKER = 'skopeo copy docker://alpine:3.19@sha256:' + 'ab12'.repeat(16) + ' oci:./img', DOCKER_HID = 'skopeo copy docker://alpine:' + REDACTED + '@sha256:' + 'ab12'.repeat(16) + ' oci:./img';
  ok(SS.redactSecrets(DOCKER).text === DOCKER_HID && SS.redactSecrets(DOCKER, { message: true }).text === DOCKER_HID && SS.redactByValue(DOCKER).text === DOCKER_HID, 'THE LAW: an image reference\'s tag is hidden as a pass-phrase (accepted over-mask, r1510 (4)): nothing before its at-sign tells it from a login, and nothing after it is read');
  // ── THE SEEDED GENERATOR (r1504: the proof is no longer a list of sentences). Latin and Chinese prose around addresses of every shape —
  // ports, host lists, IPv6 hosts, brackets, quotes, a markdown link, a code span, a sentence's end, two addresses a line, mentions and
  // e-mail addresses nearby — each built from KNOWN parts with its made-up pass-phrase known: in every draw the pass-phrase is hidden
  // WHOLE and nothing else differs, on three roads (the output belt, the message mode, the name rule as stored; the name AS TYPED adds
  // its own run row over the host after a mask, a rule of its own — the fixed legs above hold that road). The NAMED CLASSES of accepted
  // over-mask (r1510) are drawn on purpose, each with what it hides BY CONSTRUCTION, and counted: (A) a host and port glued to a later
  // at-sign with no blank (the port and the glued word hidden; the mention after stays whole); (B) an image reference's tag; (C) a raw
  // at-sign's widening (a pass-phrase URL glued to a later at-sign: the host and the glued word hidden with it)
  const genDraws = (S, { seed = 0x5eed1504, draws = 2400, onDraw = null, r7 = false } = {}) => {   // onDraw(text, its secrets hidden by construction, its named exceptions, its R7 kind): a second judge of the same draws (r2106); r7: the R7 kinds drawn too (r2209)
    let st = seed >>> 0;
    const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const PW_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789-._~!$&*+%^|[]{}\\,;()@';   // no blank, no `/ ? #`, no quote, no `:` `=` (another row's head)
    const passOf = () => { let p = ''; const n = 6 + Math.floor(rnd() * 15); for (let i = 0; i < n; i++) p += pick(PW_CH); return p; };
    const SCHEMES = ['https', 'http', 'postgres', 'postgresql', 'mysql', 'redis', 'amqp', 'mongodb', 'ftp', 'sftp', 'git+https', 'smb', 'HTTPS'];
    const USERS = ['deploy', 'ops', 'app', 'ci', 'worker', 'svc', 'backup', 'u', ''];
    const HOSTS = ['db.internal', 'h.example', 'cache.internal', 'mq.example', '10.0.0.5', 'build.example'];
    const LA = ['deploy', 'to', 'then', 'see', 'the', 'broker', 'is', 'connect', 'via', 'logs', 'from', 'and', 'ok', 'done', 'check'];
    const ZH = ['已部署到', '服务在', '请', '验收', '看一下', '有问题', '连接', '日志里', '然后', '谢谢'];
    const hostOf = () => {
      const r = rnd();
      if (r < 0.12) return { h: 'h1.example:27017,h2.example:27017' + (rnd() < 0.5 ? ',h3.example:27017' : ''), path: true, kind: 'list' };
      if (r < 0.24) return { h: '[2001:db8::' + (1 + Math.floor(rnd() * 9)) + ']' + (rnd() < 0.6 ? ':' + (1 + Math.floor(rnd() * 65535)) : ''), path: true, kind: 'v6' };
      const port = rnd() < 0.6; return { h: pick(HOSTS) + (port ? ':' + (1 + Math.floor(rnd() * 65535)) : ''), path: false, kind: port ? 'port' : 'host' };
    };
    const cover = { draws: 0, pass: 0, nopass: 0, zh: 0, la: 0, port: 0, list: 0, v6: 0, wrapped: 0, twoAddr: 0, mention: 0, mail: 0, sentenceEnd: 0 };
    const classes = { A: 0, B: 0, C: 0, D: 0 }, bad = [];
    for (let k = 0; k < draws; k++) {
      cover.draws++;
      let t = '', want = '', qAt = -1, laterAt = false;
      const passes = [], secrets = [];
      const put = (x) => { if (qAt >= 0 && x.includes('@')) laterAt = true; t += x; want += x; }, hide = (x) => { secrets.push(x); if (qAt >= 0 && x.includes('@')) laterAt = true; t += x; want += REDACTED; };
      if (r7 && rnd() < 0.45) {   // r2209 (主开发): THE R7 KINDS — a holder's query value as the restated law reads it, each secret known
        const HOLD = ['password', 'token', 'access_token', 'api_key', 'client_secret', 'passwd', 'auth_token'];
        const UP = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789-._~!$*+', CJKS = '密码钥匙令牌鉴权凭证パスワード비밀번호';
        const OTHER = ['ÄÖÜßÉÈÇÑØÅäöüéèçñøå', 'ΑΒΓΔΛΜΠΣΩαβγδλμπσω', 'ЖЗИЛПФЦШЯДжзилпфцшяд'];
        const runOf = (a, n) => { const c = [...a]; let s = ''; for (let i = 0; i < n; i++) s += pick(c); return s; };
        const mixed = () => { let s = runOf(UP, 2 + Math.floor(rnd() * 4)); for (let i = 1 + Math.floor(rnd() * 3); i > 0; i--) s += runOf(pick(OTHER), 1 + Math.floor(rnd() * 3)) + runOf(UP, 1 + Math.floor(rnd() * 4)); return s; };
        const outside = () => runOf(pick([...OTHER, CJKS]), 1 + Math.floor(rnd() * 2)) + mixed();
        const zh = rnd() < 0.5, name = pick(HOLD), kind = pick(R7_KINDS), ex = [];
        const end = (glued) => { const e = rnd(); if (e < 0.4) put(' ' + pick(LA)); else if (e < 0.65) put('&lang=en ' + pick(LA)); else if (glued && zh) put(pick(ZH)); };
        put(zh ? pick(ZH) : pick(LA) + ' ');
        if (kind === 'accented') { put('https://app.example/login?' + name + '='); hide(mixed()); end(true); }
        else if (kind === 'startsOutside') { put('https://app.example/login?' + name + '='); hide(outside()); end(true); }
        else if (kind === 'guillemetName') { put('https://app.example/x?' + name + '=«'); hide(rnd() < 0.5 ? runOf(CJKS, 2 + Math.floor(rnd() * 3)) : mixed()); put('»'); end(false); }
        else if (kind === 'encodedNested') { const s = encodeURIComponent(outside()), u = encodeURIComponent('https://b.example/cb?' + name + '=') + s; put('https://a.example/login?next=' + u.slice(0, u.length - s.length)); hide(s); end(true); }
        else if (kind === 'rawNested') { put('https://a.example/login?next=https://b.example/cb?' + name + '='); hide(outside()); end(true); }
        else {   // (e) / (f): the named exceptions — hidden up to the stop, shown from it on (on a free text only)
          const pre = runOf(UP, 6 + Math.floor(rnd() * 6)), stop = kind === 'backtick' ? '`' : kind === 'guillemet' ? '«' : runOf(CJKS, 2 + Math.floor(rnd() * 2)), shown = stop + runOf(UP, 2 + Math.floor(rnd() * 5));
          put('https://app.example/login?' + name + '=' + pre + shown); ex.push({ kind, hidden: pre, shown }); put(' ' + pick(LA));
        }
        if (onDraw) onDraw(t, secrets, ex, kind);
        continue;
      }
      const r = rnd();
      if (r < 0.06) {   // (A) a host and port glued to a later at-sign, no blank — the port and the glued word hidden by construction
        classes.A++;
        put(pick(['see ', 'logs at ', '']) + 'http://' + pick(HOSTS) + ':'); hide(String(1 + Math.floor(rnd() * 65535)) + pick(['|', ',', ';', '!', '*', '+']) + pick(['ops', 'ask', 'team']));
        put('@corp.example' + pick([' now', '.', '']));
      } else if (r < 0.10) {   // (B) an image reference's tag
        classes.B++;
        put('skopeo copy docker://' + pick(['alpine', 'nginx', 'node']) + ':'); hide(pick(['3.19', '1.27', '22']));
        put('@sha256:' + 'ab12'.repeat(16) + ' oci:./img');
      } else if (r < 0.14) {   // (C) a raw at-sign's widening: a pass-phrase URL glued to a later at-sign — hidden through the glued word
        classes.C++;
        put('see https://' + pick(USERS.filter(Boolean)) + ':'); hide(passOf() + '@h.example' + pick([',', ';', '|', '!']) + 'ops');
        put('@corp.example now');
      } else {
        const zh = rnd() < 0.5; cover[zh ? 'zh' : 'la']++;
        const n = rnd() < 0.3 ? 2 : 1; if (n === 2) cover.twoAddr++;
        for (let a = 0; a < n; a++) {
          put(zh ? pick(ZH) : (a ? ' ' : '') + pick(LA) + ' ');
          const [o, c] = zh ? pick([['', ''], ['「', '」'], ['（', '）']]) : pick([['', ''], ['(', ')'], ['[link](', ')'], ['<', '>'], ['"', '"'], ['`', '`']]);
          if (o) cover.wrapped++;
          const host = hostOf(); if (host.kind !== 'host') cover[host.kind]++;
          put(o + pick(SCHEMES) + '://');
          const v = rnd();
          if (v < 0.6) { cover.pass++; put(pick(USERS) + ':'); const pp = passOf(); passes.push(pp); hide(pp); put('@'); }
          else { cover.nopass++; put(v < 0.75 ? '' : v < 0.88 ? 'git@' : 'ci:@'); }
          const tail = host.path || rnd() < 0.4 ? pick(['/main', '/x/y.git', '/db?replicaSet=rs0']) : '';
          if (zh && qAt < 0 && tail.includes('?')) { put(host.h + tail.slice(0, tail.indexOf('?'))); qAt = want.length; put(tail.slice(tail.indexOf('?')) + c); } else put(host.h + tail + c);
          if (zh) put(pick(['，', '。', '、', '；', '！', '']));
          else { const p = pick(['', '.', ',', ';', ')', ':', '!', '?']); if (p === '.' || p === '!' || p === '?') cover.sentenceEnd++; put(p); }
          const m = rnd();
          if (m < 0.3) { cover.mention++; put(zh ? '请@lead验收' : ' @lead please'); } else if (m < 0.5) { cover.mail++; put(zh ? '联系ops@corp.example' : ' mail ops@corp.example'); }
        }
        if (zh) put(pick(ZH)); else put(' ' + pick(LA));
      }
      // (D, the coordinator's r1553): a query value glued to unspaced Chinese prose with a later at-sign in the same run is
      // R7's to read (since r2209 an ASCII-led value ends at the prose, and R9 hides the later pass-phrase on its own). Its
      // check (r1655 (1), round wz8ibfxag): the output IS the HIDDEN-WHOLE form read by the same road — every pass-phrase hidden
      // whole first, then R7 — so a TAIL left after a cut differs (a whole-pass-phrase test let it pass); nothing before the value differs
      if (onDraw) onDraw(t, secrets, [], null);
      const classD = qAt >= 0 && laterAt;
      let fired = false;
      for (const [road, f] of [['head', (x) => S.redactSecrets(x).text], ['message', (x) => S.redactSecrets(x, { message: true }).text], ['name', (x) => S.redactByValue(x).text]]) {
        const out = f(t); if (out === want) continue;
        if (classD && out === f(want) && out.slice(0, qAt) === want.slice(0, qAt)) { fired = true; continue; }
        bad.push({ road, t, out, want });
      }
      if (fired) classes.D++;
    }
    return { bad, classes, cover };
  };
  const G = genDraws(SS);
  console.log(`      the generator (seed 0x5eed1504): ${J(G.cover)} · the named classes: (A) glued host and port ${G.classes.A}, (B) image tag ${G.classes.B}, (C) raw at-sign's widening ${G.classes.C}, (D) R7's query value glued to Chinese prose ${G.classes.D}`);
  for (const b of G.bad.slice(0, 4)) console.log(`      ✗ ${b.road}: ${J(b.t)} → ${J(b.out)} (want ${J(b.want)})`);
  ok(!G.bad.length && G.cover.draws >= 2000 && G.cover.pass > 500 && G.cover.zh > 500 && G.cover.la > 500 && G.cover.port > 100 && G.cover.list > 50 && G.cover.v6 > 50 && G.cover.sentenceEnd > 100 && G.cover.mention > 200 && G.cover.mail > 100 && G.cover.twoAddr > 200 && G.classes.A > 50 && G.classes.B > 50 && G.classes.C > 50,
    `THE LAW BY A SEEDED GENERATOR: ${G.cover.draws} draws × 3 roads — in every draw the pass-phrase is hidden WHOLE and nothing else differs (the three named classes each hidden as constructed: A ${G.classes.A}, B ${G.classes.B}, C ${G.classes.C}; (D) R7's glued query value ${G.classes.D}, the hidden-whole form read by the same road and nothing before it differs)${G.bad.length ? ' — ' + G.bad.length + ' wrong' : ''}`);
  // THE REDS of the round, each RED by name: the generator against the walks of the two tips before (today's 4e85efb11 — the port test;
  // the one before, 831481e7d — no stop but a quote), each loaded in place of the law's walk
  const UI_I = SRC.indexOf('function userinfoAt('), UI_FN = SRC.slice(UI_I, SRC.indexOf('\n}\n', UI_I) + 3);
  const W4E8 = ["function userinfoAt(d, from, free) {   // THE WALK OF 4e85efb11 (a red control): the address alphabet and the port test",
    "  const AUTH_CH = new Uint8Array(128); for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~%!$&()*+,;=:@[]') AUTH_CH[ch.charCodeAt(0)] = 1;",
    "  const portOk = (s, e) => { let i = s; if (i < e && d.charCodeAt(i) === 91) { while (i < e && d.charCodeAt(i) !== 93) i++; if (i === e) return false; i++; } else while (i < e && d.charCodeAt(i) !== 58) i++; if (i < e && d.charCodeAt(i++) !== 58) return false; for (; i < e; i++) { const c = d.charCodeAt(i); if (c < 48 || c > 57) return false; } return true; };",
    "  let at = -1, colon = -1, j = from;",   // stale-pins: kept (the walk of 4e85efb11, a red control)
    "  for (const end = Math.min(d.length, from + 1024); j < end; j++) {",   // stale-pins: kept (the walk of 4e85efb11, a red control)
    "    const c = d.charCodeAt(j);",
    "    if (c === 47 || c === 63 || c === 35 || isBlankCode(c)) break;",
    "    if (free) { if (c === 0xAB && d.startsWith(REDACTED, j)) { j += REDACTED.length - 1; continue; } if (c > 127 || !AUTH_CH[c]) break; }",
    "    if (c === 64) at = j; else if (c === 58 && colon < 0) colon = j;",
    "  }",
    "  if (colon < 0 || colon > at) return null;",   // stale-pins: kept (the walk of 4e85efb11, a red control)
    "  return !free || portOk(at + 1, j) ? [colon, at] : null;",
    "}", ""].join('\n');
  const W831 = ["function userinfoAt(d, from, quotes) {   // THE WALK OF 831481e7d (a red control): a quote, < > or a backtick its only free-text stop",
    "  let at = -1, colon = -1;",
    "  for (let j = from, end = Math.min(d.length, from + 1024); j < end; j++) {",
    "    const c = d.charCodeAt(j);",
    "    if (c === 47 || c === 63 || c === 35 || isBlankCode(c) || (quotes && (c === 34 || c === 39 || c === 60 || c === 62 || c === 96))) break;",
    "    if (c === 64) at = j; else if (c === 58 && colon < 0) colon = j;",
    "  }",
    "  return colon >= 0 && colon < at ? [colon, at] : null;",
    "}", ""].join('\n');
  const T4E8 = mutantCopies('da2d-w4e8', REPO).load('src/secret-shapes.js', anchored(SRC, UI_FN, W4E8, 'the walk of 4e85efb11'), 'w4e8');
  const T831 = mutantCopies('da2d-w831', REPO).load('src/secret-shapes.js', anchored(SRC, UI_FN, W831, 'the walk of 831481e7d'), 'w831');
  const G4 = genDraws(T4E8, { draws: 1000 }), G8 = genDraws(T831, { draws: 1000 });
  const leaked4 = G4.bad.filter((b) => !b.t.includes('docker://') && b.want.includes(REDACTED) && !b.out.includes(REDACTED)).length, eaten8 = G8.bad.filter((b) => !b.want.includes(REDACTED) && b.out.includes(REDACTED)).length;
  console.log(`      under the walk of 4e85efb11: ${G4.bad.length} wrong (${leaked4} with the pass-phrase left in plain), e.g. ${J((G4.bad.find((b) => !b.out.includes(REDACTED)) || G4.bad[0] || {}).t)}`);
  console.log(`      under the walk of 831481e7d: ${G8.bad.length} wrong (${eaten8} masked where nothing is secret), e.g. ${J((G8.bad.find((b) => !b.want.includes(REDACTED)) || G8.bad[0] || {}).out)}`);
  ok(leaked4 > 10 && eaten8 > 10, `RED CONTROLS — THE GENERATOR AGAINST THE TWO WALKS BEFORE: 4e85efb11's (the port test) leaves ${leaked4} pass-phrases in plain; 831481e7d's (no stop but a quote) masks ${eaten8} texts with nothing secret — the law's leg goes red under each`);
  // the round's own fixed rows under the walk of 4e85efb11: the narrow round's must, red by name
  const NARROW = GO.filter(([w]) => w.startsWith('narrow round:'));
  const nLeak = NARROW.filter(([, t, , frags]) => frags.some((f) => T4E8.redactSecrets(t).text.includes(f)));
  ok(NARROW.length === 4 && nLeak.length === 4, `RED CONTROL — THE WALK OF 4e85efb11: the narrow round's ${nLeak.length}/4 rows keep their pass-phrase (${nLeak.map(([w]) => w.slice(15)).join(' · ')}) — the GO leg goes red`);
  // the readers' three sentences under the walk of 831481e7d: round wiagjybli's must, red by name
  const tipEaten = KEEP.filter(([w]) => w.startsWith('lens')).filter(([, t]) => T831.redactSecrets(t, { message: true }).text !== t);
  const tipMoved = MENTIONS.filter((g) => !placeOf((t) => T831.redactSecrets(t, { message: true }).text, g));
  ok(tipEaten.length === 3 && tipMoved.length >= 3, `RED CONTROL — THE WALK OF 831481e7d: the readers' ${tipEaten.length}/3 sentences eaten (${tipEaten.map(([, t]) => J(T831.redactSecrets(t, { message: true }).text)).join(' · ')}), ${tipMoved.length} mention places moved — the KEEP and mention legs go red`);
  // r1553 (a) THE LEAK THE GENERATOR FOUND, a NAMED leg (its shape written out, pinned whatever the generator draws next): an address
  // with a query, glued to unspaced Chinese prose that later holds a URL with a userinfo. R7's value runs to the next `& # ;` or blank,
  // so it swallowed the prose and cut the later pass-phrase at its `;`: the URL's scheme went with the cut, R9 never saw it, and the
  // tail stayed in plain. R9 now runs FIRST (both rules): every pass-phrase is hidden whole before R7 reads the value; R7 then reads
  // that value up to the prose (r2209: an ASCII-led value ends at the CJK kind) (class D: the hidden-whole form read by the same road, nothing before the query value differs)
  const Q7 = "    text = redactQuery(text, (head) => { n++; if (say) say(head); });   // R7 — lane mask-value-shape r3: ONE linear walk (THE NAME GRAMMAR; a public name's value walked on)\n";
  const pA = ['MS|*~', 'MWK\\', 'UZG%'].join(''), pB = ['D^%+@|', ';', 'U).8-3'].join(''), pC = ['CW^', '\\NN\\'].join('');
  const LEAKS = [['a later pass-phrase holding the «;» R7 cut at', '有问题（redis://app:' + pA + '@build.example:4301/db?replicaSet=rs0）！联系ops@corp.example日志里「HTTPS://ops:' + pB + '@mq.example」；看一下', [pA, pB, 'U).8-3', 'D^%+@|']],
    ['a later URL with an EMPTY userinfo (R7 holds it, r5)', '服务在https://ci:' + pC + '@mq.example:32257/db?replicaSet=rs0看一下（mongodb://ci:@h.example:668/x/y.git）有问题', [pC]]];
  const leakBad = LEAKS.filter(([, t, frags]) => { const pre = t.slice(0, t.indexOf('?')).split(frags[0]).join(REDACTED);
    return [SS.redactSecrets(t).text, SS.redactSecrets(t, { message: true }).text, SS.redactByValue(t).text, SS.redactByValue(t, { typed: true }).text, belt.maskForSink(t, { message: true })].some((o) => frags.some((f) => o.includes(f)) || !o.startsWith(pre)); });
  ok(!leakBad.length, `R9 BEFORE R7 — the generator's leak, named: an address with a query glued to unspaced Chinese prose that later holds a URL with a userinfo — on five roads no byte of either pass-phrase is out, and nothing before the query value differs${leakBad.length ? ' — wrong: ' + leakBad.map(([w]) => w).join(' · ') : ''}`);
  // r1554 / r1658 (lane mask-value-shape): R7's value now ends at the prose (r2209: after an ASCII first character a CJK one ends it), so the ORDER
  // alone no longer leaks this text: the control plants the order of 4e85efb11 WITH the release's value class (the two together were
  // the leak); the order alone under today's value class is checked to leak nothing (a second fence, not a red)
  const VAL_NOW = SRC.split('\n').find((l) => l.startsWith('const QUERY_VALUE_RE = ')).split('   //')[0];
  const R7ORDER = anchored(SRC, R9S + Q7, Q7 + R9S, 'R7 before R9 (the order of the tip before)');
  // r2106 → r2209 (主开发): NOTHING THE R7 FOLLOW LETS THROUGH THAT LINE 246 HIDES, judged by a PARTIAL show. The generator, the R7
  // kinds drawn too (a holder's value with an accented letter; one that starts outside ASCII; a CJK or accented one in guillemets at a
  // name; an encoded and a raw nested holder whose value starts outside ASCII), runs through line 246's masker (this tree with line 246's
  // two value expressions planted: an anchored copy) and through this tree's, on three roads: ANY FOUR CHARACTERS IN A ROW of a secret
  // that this tree shows more often than line 246 does is red. The only named exceptions, each counted, on the two free-text roads:
  // (e) a backtick or a « that is not the mark inside an ASCII-led value (shown from it on) and (f) a pass-phrase turning from ASCII to
  // CJK (hidden up to the turn); at a name they are secrets like every other. REDS: the round's tip e06c2a0e9 (its four expressions
  // planted) shows each kind the round's musts named; this tree without R9's two calls shows the pass-phrases line 246 hides
  {
    const lineOf = (src, k) => src.split('\n').find((l) => l.startsWith(k)).split('   //')[0];
    ok(lineOf(SRC, 'const QUERY_HEAD_RE = ') === R7_L246.head && lineOf(SRC, 'const NESTED_HEAD_RE = ') === R7_L246.nested,
      'r2209 (c): the free text\'s head and the DECODED address\'s nested head are line 246\'s own, character for character');
    const L246 = mutantCopies('r2106-line246', REPO).load('src/secret-shapes.js', r7Plant(SRC, 'l246'), 'line246');
    const TIPE06 = mutantCopies('r2209-tip-e06c', REPO).load('src/secret-shapes.js', r7Plant(SRC, 'e06'), 'tip-e06c');
    const R9_CALLS = SRC.split('\n').filter((l) => l.trim().startsWith('text = redactUserinfo(text,'));
    let noR9 = SRC; for (const l of R9_CALLS) noR9 = anchored(noR9, l + '\n', '', 'no R9 ' + l.trim().slice(0, 40));
    const NO_R9 = mutantCopies('r2106-no-r9', REPO).load('src/secret-shapes.js', noR9, 'no-r9');
    const ROADS = [(S, x) => S.redactSecrets(x).text, (S, x) => S.redactSecrets(x, { message: true }).text, (S, x) => S.redactByValue(x).text];
    const grams = (x) => { const c = [...x]; if (c.length < 4) return [x]; const g = []; for (let i = 0; i + 4 <= c.length; i++) g.push(c.slice(i, i + 4).join('')); return g; };
    const occ = (s, g) => s.split(g).length - 1;
    const more = (a, b, x) => grams(x).some((g) => occ(b, g) > occ(a, g));   // shown HERE more often than line 246 shows it
    const judge = (M, draws = 2400) => {
      let n = 0, secrets = 0; const shown = [], kinds = {}, exc = { backtick: 0, guillemet: 0, turnToCjk: 0 }, odd = [];
      genDraws(SS, { r7: true, draws, onDraw: (x, sec, ex, kind) => {
        n++; secrets += sec.length + ex.length; if (kind) kinds[kind] = (kinds[kind] || 0) + 1;
        ROADS.forEach((f, road) => {
          const a = f(L246, x), b = f(M, x);
          for (const s of sec) if (more(a, b, s)) shown.push({ x, s, kind: kind || 'R9', road });
          for (const e of ex) {
            if (road === 2) { if (more(a, b, e.hidden + e.shown)) shown.push({ x, s: e.hidden + e.shown, kind: e.kind, road }); continue; }   // at a name: a secret like every other
            if (more(a, b, e.hidden)) shown.push({ x, s: e.hidden, kind: e.kind, road });
            else if (b.includes(e.shown) && !a.includes(e.shown)) exc[e.kind]++;   // the named exception, as named: hidden up to it, shown from it on
            else odd.push({ x, b, kind: e.kind });
          }
        });
      } });
      return { draws: n, secrets, shown, kinds, exc, odd };
    };
    const byKind = (r) => r.shown.reduce((o, s) => ({ ...o, [s.kind]: (o[s.kind] || 0) + 1 }), {});
    const nl = judge(SS), nlr = judge(NO_R9), nle = judge(TIPE06, 800), ek = byKind(nle);
    const MUST_KINDS = ['accented', 'startsOutside', 'guillemetName', 'encodedNested'];
    for (const s of nl.shown.slice(0, 3)) console.log(`      ✗ ${s.kind} on road ${s.road}: ${J(s.x)} shows ${J(s.s)}`);
    ok(R9_CALLS.length === 2 && nl.draws >= 2000 && nl.secrets > 1000 && gateOf(R7_KINDS.every((k) => nl.kinds[k] > 30)) && nl.shown.length === 0 && nl.odd.length === 0
      && nl.exc.backtick > 0 && nl.exc.guillemet > 0 && nl.exc.turnToCjk > 0 && nlr.shown.length > 10 && verdictOf(MUST_KINDS.every((k) => ek[k] > 0)),
      `NOTHING THE R7 FOLLOW LETS THROUGH THAT LINE 246 HIDES, judged by a PARTIAL show (any four characters in a row): ${nl.draws} draws (the R7 kinds ${J(nl.kinds)}), ${nl.secrets} secrets × 3 roads — ${nl.shown.length} shown here that line 246 hides; the named exceptions, counted on the two free-text roads: (e) a backtick ${nl.exc.backtick}, a « not the mark ${nl.exc.guillemet}, (f) ASCII turning to CJK ${nl.exc.turnToCjk}${nl.odd.length ? ' — ' + nl.odd.length + ' not as named' : ''}; RED the round's tip e06c2a0e9: ${J(ek)}; RED no R9: ${nlr.shown.length} shown`);
  }
  const R7FIRST = mutantCopies('da2d-r7first', REPO).load('src/secret-shapes.js', anchored(R7ORDER, VAL_NOW, "const QUERY_VALUE_RE = /[^&#;\\s\"'<>]{1,65536}/y;", 'the release value class beside the old order'), 'r7first');   // stale-pins: kept (the red control plants the release's value class back)
  const ORDER_ONLY = mutantCopies('da2d-order-only', REPO).load('src/secret-shapes.js', R7ORDER, 'order-only');
  ok(!ORDER_ONLY.redactSecrets(LEAKS[0][1]).text.includes('U).8-3'), 'R7 before R9 under R7\'s value-end law (r1554): the later pass-phrase stays hidden whole (the value ends at the prose, R9 then reads the address)');
  const tailOut = R7FIRST.redactSecrets(LEAKS[0][1]).text;
  ok(gateOf(tailOut.includes('U).8-3')) && !SS.redactSecrets(LEAKS[0][1]).text.includes('U).8-3'), 'RED CONTROL — R7 BEFORE R9 (the order of 4e85efb11 and before): the later pass-phrase\'s tail after the «;» is left in plain (' + J(tailOut.slice(tailOut.indexOf('?'))) + ')');
  // r1655 (1) with lens 3: the GENERATOR ITSELF is red under that control (class D now compares the hidden-whole form, so a tail is caught)
  const GR = genDraws(R7FIRST, { draws: 1000 }), grD = GR.bad.filter((b) => b.t.includes('?replicaSet='));
  for (const b of grD.slice(0, 2)) console.log(`      under R7 first: ${b.road}: ${J(b.out.slice(b.out.indexOf('?')))} (want ${J(b.want.slice(b.want.indexOf('?')))})`);
  ok(grD.length > 0, `RED CONTROL — THE GENERATOR under R7 before R9 with the release's value class: ${grD.length} draws of the named shape go red (class D holds the hidden-whole form: a tail after a cut differs)`);
  // lens 3 (round wz8ibfxag): the NAME road's order has its own red — R7 at a name (nameQuery: its value class still runs into the prose) before R9
  const NQ = "    row(nameQuery(text));   // r10 (B-a3fe, on 2.369.413): R7 at a name — the release's linear walk and its name grammar\n";
  const R7NAME = mutantCopies('da2d-r7name', REPO).load('src/secret-shapes.js', anchored(SRC, R9V + NQ, NQ + R9V, 'R7 before R9 at a name'), 'r7name');
  const nameTail = R7NAME.redactByValue(LEAKS[0][1]).text;
  ok(gateOf(nameTail.includes('U).8-3')) && !SS.redactByValue(LEAKS[0][1]).text.includes('U).8-3'), 'RED CONTROL — R7 BEFORE R9 AT A NAME: the later pass-phrase\'s tail after the «;» is left in plain in a job\'s name (' + J(nameTail.slice(nameTail.indexOf('?'))) + ')');
  const NOMARK = mutantCopies('da2d-nomark', REPO).load('src/secret-shapes.js', anchored(SRC, "      if (c === 0xAB && d.startsWith(REDACTED, j)) { j += REDACTED.length - 1; continue; }   // the belts' own mark, read WHOLE\n", '', 'the mark not read whole'), 'nomark');
  ok(verdictOf(NOMARK.redactSecrets(MUSER).text.includes(pw)), 'RED CONTROL — THE MARK ENDS THE WALK (« outside the alphabet): a user masked before lets its password through (' + J(NOMARK.redactSecrets(MUSER).text.replace(pw, '<the password>')) + ')');
}

console.log('r1554 → r2209 (主开发\'s law, restated; beside line 246\'s stretch law): a query value on a FREE TEXT is read as line 246 read it with ONE new stop — after an ASCII first character, a character of the CJK kind ends it');
{
  const SS = r('src/secret-shapes.js'), J = JSON.stringify;
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  const lineOf = (src, k) => src.split('\n').find((l) => l.startsWith(k)).split('   //')[0];
  const T = crypto.randomBytes(9).toString('hex'), PW = crypto.randomBytes(6).toString('hex');
  // the find's shapes: a holder's value glued to unspaced Chinese prose that later holds a mail address, a userinfo (and an EMPTY
  // user before an at-sign) and a second URL; a public value glued the same way with a password userinfo after it
  const CASES = [
    { t: `看这里https://a.example/cb?token=${T}后面是说明，请发到ops@example.com或打开https://b.example/x?q=1再试`, gone: [T], kept: ['后面是说明', 'ops@example.com', 'https://b.example/x?q=1', '再试'] },
    { t: `回调地址https://a.example/cb?access_token=${T}然后用ftp://deploy:${PW}@files.example/拉取`, gone: [T], kept: ['然后用ftp://', 'files.example/拉取'] },
    { t: `链接?sig=${T}，空用户:${PW}@host.example 之后`, gone: [T], kept: ['，空用户', 'host.example 之后'] },
    { t: `搜索https://s.example/?q=hello世界https://u:${PW}@h.example/`, gone: [], kept: ['?q=hello世界'] },
    { t: '见`https://a.example/?token=' + T + '`说明在后', gone: [T], kept: ['`说明在后'] },   // a markdown code span: the value ends at its backtick
  ];
  const judge = (SSx, o) => CASES.map((c) => { const out = SSx.redactSecrets(c.t, o).text; return { out, ok: c.gone.every((g) => !out.includes(g)) && c.kept.every((k) => out.includes(k)) }; });
  for (const [mode, o] of [['line', {}], ['message', { message: true }]]) {
    const rows = judge(SS, o), bad = rows.filter((x) => !x.ok);
    ok(bad.length === 0, `${mode.toUpperCase()} MODE: a query value glued to unspaced prose is the value ALONE — the prose, a mail address, a userinfo's words and a second URL after it stay (${rows.length} cases)${bad.length ? ' — wrong: ' + bad.map((x) => J(x.out)).join(' · ') : ''}`);
  }
  console.log(`  · judged: ${J(judge(SS, {}).map((x) => x.out.slice(0, 90)))}`);
  // unchanged where no free text runs on: an ASCII URL's holder value whole, its neighbour kept; a percent-encoded UTF-8 value read whole
  const ENC = `https://a.example/?token=${T}%E5%AF%86%E7%A0%81&lang=zh`;
  ok(SS.redactSecrets(`https://a.example/?token=${T}&x=1`).text === `https://a.example/?token=${REDACTED}&x=1` && SS.redactSecrets(ENC).text === `https://a.example/?token=${REDACTED}&lang=zh`,
    'an ASCII URL is read as before: its holder value masked whole (a percent-encoded non-ASCII value too), its neighbour kept');
  // r2209: what a holder's value hides, on every kind the round named — a free text (the line and the message mode) or a name
  const grams = (x) => { const c = [...x]; if (c.length < 4) return [x]; const g = []; for (let i = 0; i + 4 <= c.length; i++) g.push(c.slice(i, i + 4).join('')); return g; };
  const outs = (S, t, w) => (w === 'name' ? [S.redactByValue(t).text] : [S.redactSecrets(t).text, S.redactSecrets(t, { message: true }).text]);
  const hides = (S, [, t, x, w]) => outs(S, t, w).every((o) => o.includes(REDACTED) && !grams(x).some((g) => o.includes(g)));
  const ROWS = [   // [what, the text, the secret, the road]
    ['(a) an accented letter inside', 'login https://h.example/login?password=Müller2024 next', 'Müller2024', 'free'],
    ['(a) Greek inside', 'see ?token=AB12λμ34xy ok', 'AB12λμ34xy', 'free'],
    ['(a) Cyrillic inside, glued to Chinese prose after', '登录?access_token=QW9жз77再试', 'QW9жз77', 'free'],
    ['(b) a value that starts with an accented letter', 'login ?password=Ärger99 next', 'Ärger99', 'free'],
    ['(b) a value that starts with CJK', '设置 ?token=密码在这里', '密码在这里', 'free'],
    ['(b) a value that starts with a backtick (a code span opened at the value)', 'use ?token=`QW12ER34` here', 'QW12ER34', 'free'],
    ['(c) an encoded nested holder whose value starts outside ASCII', 'open https://a.example/login?next=https%3A%2F%2Fb.example%2Fcb%3Fpassword%3D%C3%84rger2024 now', '%C3%84rger2024', 'free'],
    ['(c) a raw nested holder whose value starts outside ASCII', 'open https://a.example/login?next=https://b.example/cb?password=Ärger2024 now', 'Ärger2024', 'free'],
    ['(d) at a name: a CJK value in guillemets', 'nightly?password=«密码»', '密码', 'name'],
    ['(d) at a name: an accented value in guillemets', 'nightly?password=«Grüße2024»', 'Grüße2024', 'name'],
    ['(d) at a name: a value in guillemets with a blank inside', 'nightly?password=«Kenn wort9»', 'Kenn wort9', 'name'],
    ['at a name: an accented value', 'nightly?password=Kücheñ42x', 'Kücheñ42x', 'name'],
  ];
  const rowBad = ROWS.filter((row) => !hides(SS, row));
  ok(!rowBad.length, `r2209 (a)–(d): a holder's value hidden WHOLE on every kind the round named (${ROWS.length}: an accented, a Greek, a Cyrillic letter inside — part of the value; a value that starts outside ASCII or with a backtick — line 246's run; an encoded and a raw nested holder — line 246's own nested head; at a name a value in guillemets from its « to its », and an accented one)${rowBad.length ? ' — wrong: ' + rowBad.map((row) => row[0] + ' → ' + J(outs(SS, row[1], row[3]))).join(' · ') : ''}`);
  console.log(`  · judged: ${J(ROWS.map((row) => outs(SS, row[1], row[3])[0]))}`);
  // r2209 (e) / (f), NAMED: the two things this shows that line 246 hid, and THE ONE LIMIT — [what, the text, hidden, shown]
  const NAMED = [
    ['(e) a backtick inside (a code span\'s end)', 'run ?token=QW12ER34`ZX9 now', 'QW12ER34', '`ZX9'],
    ['(e) a « that is not the mark inside', 'run ?token=QW12ER34«ZX9 now', 'QW12ER34', '«ZX9'],
    ['(f) a pass-phrase turning from ASCII to CJK', 'run ?password=QW12ER34密码ZX9 now', 'QW12ER34', '密码ZX9'],
  ];
  const namedOk = NAMED.every(([, t, h, s]) => outs(SS, t, 'free').every((o) => o.includes(REDACTED + s) && !grams(h).some((g) => o.includes(g))) && outs(SS, t, 'name').every((o) => !grams(h + s).some((g) => o.includes(g))));
  ok(verdictOf(namedOk), `r2209 (e) / (f), NAMED: on a free text a backtick and a « that is not the mark end an ASCII-led value (shown from it on — no credential carries either raw), and a pass-phrase turning from ASCII to CJK is hidden up to the turn (THE ONE LIMIT); at a name all three are hidden whole — ${J(NAMED.map(([, t]) => SS.redactSecrets(t).text))}`);
  // (a): every MESSAGE_STOPS member is of the CJK kind — it ends an ASCII-led value
  const STOPS = [...((SRC.match(/const MESSAGE_STOPS = new Set\(\[\.\.\.'([^']+)'\]/) || [])[1] || '')];
  const stopBad = STOPS.filter((ch) => SS.redactSecrets('x ?token=QW12ER34' + ch + '之后').text !== 'x ?token=' + REDACTED + ch + '之后');
  ok(STOPS.length >= 10 && !stopBad.length, `(a) every MESSAGE_STOPS member (${STOPS.length}) ends an ASCII-led value${stopBad.length ? ' — not: ' + stopBad.join(' ') : ''}`);
  ok(verdictOf(ROWS.every(([, t, , w]) => w === 'name' || SS.redactSecrets(SS.redactSecrets(t).text).text === SS.redactSecrets(t).text)), 'idempotent on the rows');
  // r2280 (1): at a NAME the belts' own mark is NEVER an opening quote — a public value that is the mark with an encoded address glued
  // after it is read whole (line 246's run) and hidden when that address holds a holder. RED: 058237eb2's guillemet branch (the mark read
  // as a quote: only the mark judged, the encoded pass-phrase shown)
  const PWN = 'Pw' + crypto.randomBytes(5).toString('hex'), MARKED = 'job?next=' + REDACTED + 'https%3A%2F%2Fh.example%2Fcb%3Fpassword%3D' + PWN + ' now';
  const N0582 = mutantCopies('r2280-name-0582', REPO).load('src/secret-shapes.js', anchored(SRC, lineOf(SRC, 'const NAME_QUERY_VALUE_RE = '), R7_0582_NAME, 'r2280 the mark read as a quote'), 'name-0582');
  const mk = SS.redactByValue(MARKED).text, mkRed = N0582.redactByValue(MARKED).text;
  ok(!mk.includes(PWN) && gateOf(mk.startsWith('job?next=' + REDACTED)) && verdictOf(mkRed.includes(PWN)), `r2280 (1): at a name the mark is never an opening quote — the mark with an encoded holder glued after it is hidden whole: ${J(mk)}; RED (058237eb2's guillemet branch): ${J(mkRed)}`);
  // r2280 (3), by law (d): at a name a value in guillemets with a tail glued after its » — only the quoted part hidden, the tail shown
  ok(SS.redactByValue('nightly?password=«Summer1!»tail').text === 'nightly?password=' + REDACTED + 'tail', `r2280 (3): at a name «…» is the value and a glued tail is not (law (d)) — ${J(SS.redactByValue('nightly?password=«Summer1!»tail').text)}`);
  // r2280 (5): the kept copy of line 246's R7 expressions IS fa0a6c1a5's text, read from git when this clone has it (the comparison stays
  // the real one when the tree moves); a clone without it says so loudly
  {
    const { gitEnvFrom } = await import('./git-env.mjs');
    const { spawnSync } = await import('node:child_process');
    const g = spawnSync('git', ['show', 'fa0a6c1a5:src/secret-shapes.js'], { cwd: REPO, encoding: 'utf8', env: gitEnvFrom(process.env), maxBuffer: 64 * 1024 * 1024 });   // test-architecture §75: a tested spawnSync (g.status below)
    if (g.status !== 0) console.log(`  SKIP (LOUD): r2280 (5) — git cannot read fa0a6c1a5 here (${(g.stderr || '').trim().slice(0, 80)})`);
    else ok(lineOf(g.stdout, 'const QUERY_VALUE_RE = ') === R7_L246.value && lineOf(g.stdout, 'const QUERY_HEAD_RE = ') === R7_L246.head && lineOf(g.stdout, 'const NESTED_HEAD_RE = ') === R7_L246.nested,
      'r2280 (5): the kept copy of line 246\'s three R7 expressions is fa0a6c1a5\'s text, character for character');
  }
  ok(SS.redactSecrets(SS.redactSecrets(CASES[0].t).text).text === SS.redactSecrets(CASES[0].t).text, 'idempotent');
  // RED CONTROL: the release's value class (up to the next & # ; ' " < > or blank) — the prose, the mail and the second URL masked
  const rel = mutantCopies('r1554-r7', REPO).load('src/secret-shapes.js', anchored(SRC, lineOf(SRC, 'const QUERY_VALUE_RE = '), R7_L246.value, 'r1554-release-value'), 'release-value');
  const redRows = judge(rel, {});
  ok(redRows.filter((x) => !x.ok).length >= 4, `RED CONTROL (the release's value class): ${redRows.filter((x) => !x.ok).length} of ${CASES.length} cases mask the prose after the value — ${J(redRows[0].out.slice(0, 90))}`);
  // RED CONTROL (r2209): the round's tip e06c2a0e9, its four expressions planted — the musts' rows show a holder's value in part or whole
  const E06 = mutantCopies('r2209-rows-e06c', REPO).load('src/secret-shapes.js', r7Plant(SRC, 'e06'), 'rows-e06c');
  const e06Bad = ROWS.filter((row) => !hides(E06, row));
  ok(e06Bad.length >= 8, `RED CONTROL (r2209, the round's tip e06c2a0e9 planted): ${e06Bad.length} of ${ROWS.length} rows show a holder's value in part or whole — ${J(e06Bad.slice(0, 3).map((row) => outs(E06, row[1], row[3])[0]))}`);
}

console.log('lane mask-value-shape B-829f: A VALUE THAT IS ITSELF ESCAPED JSON is judged as plain JSON already is — both modes, both entry functions');
{
  // 主开发 r3101 / r3116: the page b4f7f/b829f-page.md; the reader redactEscapedPairs runs LAST in redactSecrets and redactByValue
  const SS = r('src/secret-shapes.js'), J = JSON.stringify;
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const M = mutantCopies('b829f', REPO);
  const SRC = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8');
  // made-up values only, built at runtime; esc(obj) is the object written as ONE escaped string's inside ({\"a\":\"b\"})
  const val = () => ['maple', 'river', 'copper', 'lantern', 'harbor'][crypto.randomInt(5)] + crypto.randomInt(100, 999);
  const esc = (obj) => JSON.stringify(JSON.stringify(obj)).slice(1, -1);
  const MODES = [['message', (S, t, said) => S.redactSecrets(t, { message: true, said }).text], ['line', (S, t, said) => S.redactSecrets(t, { said }).text], ['a job name', (S, t) => S.redactByValue(t).text]];
  const TODAY = M.load('src/secret-shapes.js', editAnchor(editAnchor(SRC, '    const esc = redactEscapedPairs(text, say); text = esc.text; n += esc.n;', '', 'src/secret-shapes.js'), '    row(redactEscapedPairs(text));', '', 'src/secret-shapes.js'), 'b829f-today');
  // which characters of the input a mask covers (the output is the input with some stretches replaced by the mark)
  const covered = (t, o) => { const cov = new Uint8Array(t.length), parts = o.split(REDACTED); let at = 0;
    for (let k = 0; k < parts.length; k++) { const pc = parts[k]; const x = k === 0 ? 0 : (k === parts.length - 1 && pc === '' ? t.length : t.indexOf(pc, at)); if (x < 0) { cov.fill(1, at); return cov; } if (k > 0) cov.fill(1, at, x); at = x + pc.length; }
    return cov; };
  const onlyAdds = (t, mode) => { const a = covered(t, mode(TODAY, t)), b = covered(t, mode(SS, t)); for (let x = 0; x < t.length; x++) if (a[x] && !b[x]) return false; return true; };
  // (a) THE HOLE CLOSED: the two scenes of the page, every mode, the inner name said
  const v1 = val(), v2 = val();
  const SCENES = [['a service-account JSON as ONE escaped string under a name with no credential word', 'FIREBASE_SERVICE_ACCOUNT_JSON="' + esc({ type: ['service', 'account'].join('_'), client_secret: v1 }) + '"', v1, 'client_secret', null],
    ['a structured log line carrying an escaped request body', J({ body: J({ user: 'ann', password: v2 }) }), v2, 'password', 'ann']];
  for (const [what, t, v, name, keep] of SCENES) {
    const res = MODES.map(([m, f]) => { const said = []; const o = f(SS, t, said); return [m, o, said]; });
    ok(gateOf(res.every(([, o]) => !o.includes(v) && o.includes(REDACTED) && (!keep || o.includes(keep)))) && verdictOf(res.filter(([m]) => m !== 'a job name').every(([, , said]) => said.includes(name))),
      `B-829f (a) THE HOLE CLOSED — ${what}: the inner value is hidden in the message mode, the line mode and a job name, «${name}» is said, the rest kept (${J(res[0][1])})`);
    ok(verdictOf(MODES.every(([, f]) => f(TODAY, t).includes(v))), `RED CONTROL (the reader removed, 7b4cd5120's belt): ${what} — the inner value shows in every mode`);
  }
  // (i) an escaped quote INSIDE the value does not end it (a backslash run of 3 is a quote of the value; a run of 1 closes)
  { const a = val(), b = val(), t = 'log: "{' + '\\"password\\":\\"' + a + '\\\\\\"' + b + '\\"}"';
    ok(verdictOf(MODES.every(([, f]) => { const o = f(SS, t); return !o.includes(a) && !o.includes(b); })), `B-829f an escaped quote inside the value does not end it: both pieces hidden (${J(MODES[1][1](SS, t))})`);
    const FIRST = M.load('src/secret-shapes.js', editAnchor(SRC, '      if ((r - b + 1) % 4 === 1) { ve = r; break; }', '      { ve = r; break; }', 'src/secret-shapes.js'), 'b829f-first');
    ok(verdictOf(MODES.some(([, f]) => f(FIRST, t).includes(b))), 'RED CONTROL (the value ended at the first escaped quote): the piece after the inner quote shows'); }
  // (e) THE PRICE: what plain JSON already masks that is no credential is masked inside escaped JSON too — one leg a kind
  { const fx = "the leg sends '{" + '\\"password\\":\\"x\\"' + "}' and expects a 401", fxPlain = "the leg sends '{\"password\":\"x\"}' and expects a 401";
    ok(verdictOf(MODES.slice(0, 2).every(([, f]) => !f(SS, fx).includes('\\"x\\"') && !f(SS, fxPlain).includes('"x"'))), `B-829f (e) THE PRICE — a fixture value quoted in prose about code is masked inside escaped JSON, as plain JSON's is today (${J(MODES[0][1](SS, fx))})`);
    const se = 'cfg: "{' + '\\"session\\":\\"main\\"' + '}"', sePlain = 'cfg: {"session":"main"}';
    ok(verdictOf(MODES.slice(0, 2).every(([, f]) => !f(SS, se).includes('main') && !f(SS, sePlain).includes('main'))), `B-829f (e) THE PRICE — a plain session name is masked inside escaped JSON, as plain JSON's is today (the grammar holds «session»): ${J(MODES[0][1](SS, se))}`);
    const prose = ['the note says \\"hello\\" and \\"bye\\"', 'the flag \\"--fast\\" stays', 'a \\"name\\" field and a \\"type\\" field'];
    ok(verdictOf(prose.every((t) => MODES.every(([, f]) => f(SS, t) === t))), 'B-829f (e) prose that merely QUOTES with escaped quotes is untouched (no colon after the quoted word, no string value)'); }
  // (g) a descriptor stays, and a number, a boolean or null after the colon is no string: left alone
  { const t = 'out: "{' + '\\"token_type\\":\\"Bearer\\",\\"expires_in\\":3600,\\"token\\":3600,\\"auth\\":true,\\"key\\":null' + '}"';
    ok(verdictOf(MODES.every(([, f]) => f(SS, t) === t)), `B-829f a descriptor (token_type) stays, and a number, a boolean and null under a holder are left alone (${J(t)})`); }
  // (c) BOUNDED: one level; a value escaped TWICE is left as today; a value past ESC_VALUE_MAX and a name past ESC_NAME_MAX are left to the
  // older rules; and the belt never throws on a torn or odd escape
  { const v = val(), twice = 'cfg: "' + JSON.stringify(JSON.stringify(JSON.stringify({ password: v }))).slice(1, -1) + '"';
    ok(verdictOf(MODES.every(([, f]) => f(SS, twice) === f(TODAY, twice))), `B-829f (c) a value escaped TWICE (\\\\\\"name\\\\\\":) is LEFT AS TODAY: the reader reads one level, so its inner pair is judged by no rule, as before this row (${J(MODES[1][1](SS, twice).slice(0, 60))}…)`);
    const big = 'log: "{' + '\\"password\\":\\"' + 'a'.repeat((SS.ESC_VALUE_MAX || 8192) + 10) + '\\"}"', longName = 'log: "{' + '\\"' + 'n'.repeat((SS.ESC_NAME_MAX || 80) + 1) + '_password\\":\\"' + v + '\\"}"';
    ok(SS.ESC_VALUE_MAX > 0 && SS.ESC_NAME_MAX > 0 && verdictOf(MODES.every(([, f]) => f(SS, big) === f(TODAY, big) && f(SS, longName) === f(TODAY, longName))), `B-829f (c) a value longer than ESC_VALUE_MAX (${SS.ESC_VALUE_MAX}) and a name longer than ESC_NAME_MAX (${SS.ESC_NAME_MAX}) are left to the older rules, as today`);
    const TORN = ['\\"', '\\"\\"', '\\"a\\":', '\\"a\\":\\"', '\\"password\\":\\"abc', 'x\\', '\\\\\\"', '\\"password\\" : \\"' + v + '\\"', '\\"\uD800\\":\\"v\\"', '\\"password\\":\\"' + '\\\\\\"'.repeat(3000), '\\"pw\\":\\"\n\\"', '\\'.repeat(5000) + '"'];
    const seeded = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    const rnd = seeded(829), AL = ['\\', '"', ':', ' ', 'a', 'password', 'token_type', '\n', '{', '}', ',', 'x', '«redacted»'];
    const FUZZ = Array.from({ length: 2000 }, () => Array.from({ length: 1 + Math.floor(rnd() * 40) }, () => AL[Math.floor(rnd() * AL.length)]).join(''));
    let threw = 0, lost = 0; for (const t of [...TORN, ...FUZZ]) for (const [, f] of MODES) { try { f(SS, t); } catch { threw++; } }
    for (const t of [...TORN, ...FUZZ, ...SCENES.map((x) => x[1])]) for (const [, f] of MODES.slice(0, 2)) if (!onlyAdds(t, f)) lost++;
    ok(threw === 0, `B-829f (c) the belt NEVER THROWS on ${TORN.length} torn or odd escapes and ${FUZZ.length} generated ones, in every mode${threw ? ' — threw ' + threw : ''}`);
    ok(lost === 0, `B-829f (1) IT ONLY ADDS MASKS: on the same ${TORN.length + FUZZ.length + SCENES.length} texts, every character 7b4cd5120's belt masked is still masked, in both modes${lost ? ' — unmasked on ' + lost : ''}`);
    const idem = [...SCENES.map((x) => x[1]), ...FUZZ.slice(0, 300)].every((t) => MODES.slice(0, 2).every(([m, f]) => { const o = f(SS, t); return f(SS, o) === o; }));
    ok(verdictOf(idem), 'B-829f a second pass over the belt\'s own output changes nothing (both modes; the scenes and 300 generated texts)'); }
  // (d) THE TIME BOUND, by a STEP COUNT (no clock in this suite: a slow machine is never red, a regression of ten times is): the reader's
  // steps on five made-up 64 KiB worst shapes stay under 4 per character
  // r3200: the line-end lookup is counted too (the characters it scans), so a lookup per value start would show
  const COUNTED = (src) => editAnchor(editAnchor(src, '/*esc-step*/', 'globalThis.__escSteps = (globalThis.__escSteps || 0) + 1;', 'src/secret-shapes.js', 'join'), '/*esc-line*/', 'globalThis.__escSteps = (globalThis.__escSteps || 0) + (lineEnd - vs);', 'src/secret-shapes.js');
  { const ST = M.load('src/secret-shapes.js', COUNTED(SRC), 'b829f-steps');
    const N = SS.INPUT_MAX || 65536, fill = (u) => u.repeat(Math.ceil(N / u.length)).slice(0, N);
    const W = [['name starts that never close', fill('\\"a')], ['holder pairs back to back', fill('\\"token\\":\\"v\\",')], ['one value 64 KiB long', '\\"token\\":\\"' + 'v'.repeat(N - 20) + '\\"'],
      ['backslash runs before every quote', fill('\\\\\\"')], ['an unclosed value on one long line', '\\"token\\":\\"' + fill('\\\\\\"x').slice(20)],
      ['value starts back to back on ONE long line, its end at the text\'s end (r3200: the end looked up once a line)', fill('\\"token\\":\\"v\\",').slice(0, N - 1) + '\n']];
    const steps = W.map(([w, t]) => { globalThis.__escSteps = 0; ST.redactSecrets(t); return [w, globalThis.__escSteps, t.length]; });
    ok(steps.length === 6 && verdictOf(steps.every(([, s, n]) => s <= 4 * n)), `B-829f (d) THE BOUND: the reader is linear, its line-end lookups counted — ${steps.map(([w, s, n]) => `${w} ${s} steps / ${n} characters`).join(' · ')} (the ceiling: 4 a character)`);
    const EVERY = M.load('src/secret-shapes.js', COUNTED(editAnchor(SRC, '    if (vs > lineEnd) {', '    if (true) {', 'src/secret-shapes.js')), 'b829f-every');
    const [w6, t6] = W[5]; globalThis.__escSteps = 0; EVERY.redactSecrets(t6); const s6 = globalThis.__escSteps;
    ok(s6 > 4 * t6.length, `RED CONTROL (the line's end looked up again for every value start, c2e4437e8's form): «${w6}» takes ${s6} steps for ${t6.length} characters — the bound leg goes red`); }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
