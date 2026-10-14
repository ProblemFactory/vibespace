#!/usr/bin/env node
// SECRET SCAN — THE LOCAL PUSH GATE CATCHES WHAT GITHUB PUSH PROTECTION CATCHES (B-89da, lane
// prepush-partner-patterns). 2.369.263's first cut was refused by GitHub (GH013) for a literal Slack-token fixture
// that BOTH local scans had matched and then dropped: `.repo-guard-allow`'s `BEGIN [A-Z ]*PRIVATE KEY` row matched
// the PEM header on the SAME line, and the allowlist was applied per line. Fast tier.
//
// Every token-shaped fixture below is BUILT AT RUNTIME — vendor prefixes assembled from pieces split inside them, a
// random body of the vendor's alphabet — so this file holds no literal shape (which is the very defect).
//
// THE LEGS:
//   ① every row of THE ONE TABLE: a RED fixture + GREEN near-misses (one char short / a wrong character); a partner
//      row stays RED under an allow-everything list, a generic row is silenced by an allow row on its hit; a fixture
//      per row, a row per fixture
//   ② THE rel263 SHAPE through the pre-push path — a scratch repo with the REAL hook, scanner and allowlist and a
//      stub ci.mjs: refused before anything else runs, naming file:line and the fixture rule; still refused under
//      VIBESPACE_SKIP_CI=1 and as a new branch; a fix in a LATER commit is still refused (GitHub reads every
//      commit), the squashed fix goes through. CONTROLS: the hook without its scan block lets the push through; the
//      scanner with the line-wide allow (partner rows consulting it) passes the shape — as the base scanner did
//   ③ the allowlist cannot allow itself: the literal, the file's own path and `.*` as rows — still RED, and the
//      literal row is a finding in the allowlist file; the same `.*` still silences a GENERIC row
//   ④ an allow row suppresses only the finding it overlaps; every match on a line is judged (+ the line-wide control)
//   ⑤ --range: every commit's added lines (a token added and removed inside the push, named by commit), the full text
//      of a touched file at its real line, nothing from an untouched file, a lone sha = what no remote-tracking ref
//      has, a never-fetched base falls back to that, an unknown tip exits 2 (never "clean"), a `++` content line is
//      content; --tree reads every tracked file
//   ⑥ THE THREE CALLERS census: the pre-push hook (--range, before the bypass and every tier), scripts/ci.mjs's fast
//      tier (--tree) and the Actions secret-scan workflow (--tree) run scripts/secret-scan.mjs, none carries a
//      pattern of its own; the table's rows pinned by id, every `re:` inside the one table
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { scratch } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SCAN = path.join(REPO, 'scripts', 'secret-scan.mjs');
const S = await import(pathToFileURL(SCAN).href);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };

const GIT_ENV = gitEnvFrom(process.env);
delete GIT_ENV.VIBESPACE_SKIP_CI;
const ROOT = scratch('secret-scan');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

// ── runtime fixture builders ──
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', DIGITS = '0123456789';
const ALNUM = UPPER + UPPER.toLowerCase() + DIGITS, B64URL = ALNUM + '-_', B64 = ALNUM + '+/', HEX = '0123456789abcdef', UPNUM = UPPER + DIGITS;
const rnd = (alphabet, n) => { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += alphabet[b[i] % alphabet.length]; return s; };
const P = (...parts) => parts.join(''); // a vendor prefix, assembled from pieces split inside it
const PEM = (kind) => P('-----BEGIN ', kind ? kind + ' ' : '', 'PRIVATE KEY-----');

// id → RED fixtures, GREEN near-misses (one char short of the minimum / a character outside the alphabet)
const F = {
  'slack-token': { red: [...'abprs'].map((c) => P('xo', 'x', c, '-') + rnd(DIGITS, 10) + '-' + rnd(DIGITS, 12) + '-' + rnd(ALNUM, 24)), near: [P('xo', 'xb-') + rnd(ALNUM, 9), P('xo', 'xc-') + rnd(ALNUM, 30)] },
  'slack-config-token': { red: [P('xo', 'xe-') + '1-' + rnd(ALNUM, 40), P('xo', 'xe.', 'xo', 'xp-') + '1-' + rnd(ALNUM, 40)], near: [P('xo', 'xe-') + rnd(ALNUM, 9), P('xo', 'xe:') + rnd(ALNUM, 30)] },
  'slack-app-token': { red: [P('xa', 'pp-') + '1-' + rnd(UPNUM, 11) + '-' + rnd(DIGITS, 13) + '-' + rnd(HEX, 64)], near: [P('xa', 'pp-') + '1-' + rnd(ALNUM, 9), P('xa', 'pp-') + 'X-' + rnd(ALNUM, 30)] },
  'slack-webhook': { red: [P('https://hoo', 'ks.slack.com/services/T') + rnd(UPNUM, 8) + '/B' + rnd(UPNUM, 8) + '/' + rnd(ALNUM, 24)], near: [P('https://hoo', 'ks.slack.com/services/T') + rnd(UPNUM, 8) + '/B' + rnd(UPNUM, 8) + '/' + rnd(ALNUM, 15), P('https://hoo', 'ks.slack.com/services/X') + rnd(UPNUM, 8) + '/B' + rnd(UPNUM, 8) + '/' + rnd(ALNUM, 24)] },
  'github-token': { red: [...'pousr'].map((c) => P('g', 'h', c, '_') + rnd(ALNUM, 36)), near: [P('gh', 'p_') + rnd(ALNUM, 35), P('gh', 'p_') + rnd(ALNUM, 12) + '-' + rnd(ALNUM, 24)] },
  'github-pat': { red: [P('git', 'hub_pat_') + rnd(ALNUM, 22) + '_' + rnd(ALNUM, 59)], near: [P('git', 'hub_pat_') + rnd(ALNUM, 81), P('git', 'hub_pat_') + rnd(ALNUM, 40) + '-' + rnd(ALNUM, 41)] },
  'gitlab-token': { red: [P('gl', 'pat-') + rnd(B64URL, 20)], near: [P('gl', 'pat-') + rnd(B64URL, 19), P('gl', 'pat-') + rnd(ALNUM, 9) + '.' + rnd(ALNUM, 20)] },
  'anthropic-key': { red: [P('sk', '-ant-api03-') + rnd(B64URL, 93) + 'AA', P('sk', '-ant-oat01-') + rnd(B64URL, 95)], near: [P('sk', '-ant-') + rnd(B64URL, 19), P('sk', '-ant-') + rnd(ALNUM, 8) + '.' + rnd(ALNUM, 30)] },
  'openai-key': { red: [P('sk', '-') + rnd(ALNUM, 20) + P('T3Blbk', 'FJ') + rnd(ALNUM, 20), P('sk', '-proj-') + rnd(B64URL, 74) + P('T3Blbk', 'FJ') + rnd(B64URL, 74), P('sk', '-svcacct-') + rnd(B64URL, 58)], near: [P('sk', '-') + rnd(ALNUM, 19), P('sk', '-proj-') + rnd(B64URL, 19), P('sk', '-') + rnd(ALNUM, 6) + '.' + rnd(ALNUM, 30)] },
  'google-api-key': { red: [P('AI', 'za') + rnd(B64URL, 35)], near: [P('AI', 'za') + rnd(B64URL, 34), P('AI', 'za') + rnd(ALNUM, 10) + '.' + rnd(ALNUM, 30)] },
  'google-oauth-secret': { red: [P('GOC', 'SPX-') + rnd(B64URL, 28)], near: [P('GOC', 'SPX-') + rnd(B64URL, 27), P('GOC', 'SPX-') + rnd(ALNUM, 10) + '.' + rnd(ALNUM, 20)] },
  'google-oauth-token': { red: [P('ya', '29.') + rnd(B64URL, 60)], near: [P('ya', '29.') + rnd(B64URL, 19), P('ya', '29-') + rnd(B64URL, 60)] },
  'aws-akid': { red: [P('AK', 'IA') + rnd(UPNUM, 16), P('AS', 'IA') + rnd(UPNUM, 16)], near: [P('AK', 'IA') + rnd(UPNUM, 15), P('AK', 'IA') + rnd(UPNUM, 8) + 'x' + rnd(UPNUM, 7)] },
  'aws-secret': { red: ['AWS_SECRET_ACCESS_KEY=' + rnd(B64, 40), 'aws_secret_access_key = "' + rnd(B64, 40) + '"'], near: ['AWS_SECRET_ACCESS_KEY=' + rnd(B64, 39), 'AWS_SECRET_ACCESS_KEY=' + rnd(ALNUM, 20) + '-' + rnd(ALNUM, 20)] },
  'stripe-key': { red: [P('sk', '_live_') + rnd(ALNUM, 24), P('rk', '_live_') + rnd(ALNUM, 24), P('sk', '_test_') + rnd(ALNUM, 24)], near: [P('sk', '_live_') + rnd(ALNUM, 19), P('sk', '_live_') + rnd(ALNUM, 10) + '-' + rnd(ALNUM, 20)] },
  'twilio-api-key': { red: [P('S', 'K') + rnd(HEX, 32)], near: [P('S', 'K') + rnd(HEX, 31), P('S', 'K') + rnd(HEX, 16) + 'g' + rnd(HEX, 15)] },
  'sendgrid-key': { red: [P('S', 'G.') + rnd(B64URL, 22) + '.' + rnd(B64URL, 43)], near: [P('S', 'G.') + rnd(B64URL, 21) + '.' + rnd(B64URL, 43), P('S', 'G.') + rnd(B64URL, 22) + ':' + rnd(B64URL, 43)] },
  'npm-token': { red: [P('np', 'm_') + rnd(ALNUM, 36)], near: [P('np', 'm_') + rnd(ALNUM, 35), P('np', 'm_') + rnd(ALNUM, 12) + '-' + rnd(ALNUM, 24)] },
  'pypi-token': { red: [P('py', 'pi-AgEIcHlwaS5vcmc') + rnd(B64URL, 70)], near: [P('py', 'pi-AgE') + rnd(B64URL, 49), P('py', 'pi-BgE') + rnd(B64URL, 70)] },
  'huggingface-token': { red: [P('h', 'f_') + rnd(ALNUM, 34)], near: [P('h', 'f_') + rnd(ALNUM, 33), P('h', 'f_') + rnd(ALNUM, 10) + '_' + rnd(ALNUM, 30)] },
  // two lines (judged as a window) and the one-line in-string form
  'private-key-block': { red: [PEM('RSA') + '\n' + rnd(B64, 64), PEM('OPENSSH') + '\\n' + rnd(B64, 70)], near: [PEM('RSA') + '\n' + rnd(B64, 39), PEM('RSA') + '\n' + rnd(B64, 20) + '%' + rnd(B64, 30)] },
  // generic rows (an allow row on the hit silences them)
  'private-key': { red: [PEM('EC')], near: [PEM('EC').slice(0, -1), PEM('EC').replace('PRIVATE', 'PUBLIC')] },
  'cephx-key': { red: ['AQ' + rnd(ALNUM, 38) + '=='], near: ['AQ' + rnd(ALNUM, 19), 'AQ' + rnd(ALNUM, 10) + '.' + rnd(ALNUM, 18)] },
  'jwt': { red: [P('ey', 'J') + rnd(ALNUM, 20) + '.' + P('ey', 'J') + rnd(ALNUM, 20) + '.' + rnd(ALNUM, 30)], near: [P('ey', 'J') + rnd(ALNUM, 20) + '.' + P('ey', 'J') + rnd(ALNUM, 20) + '.' + rnd(ALNUM, 9), P('ey', 'J') + rnd(ALNUM, 20) + ':' + P('ey', 'J') + rnd(ALNUM, 20) + ':' + rnd(ALNUM, 30)] },
  'mongo-uri': { red: [P('mongodb', '://') + 'u' + rnd(ALNUM, 5) + ':' + rnd(ALNUM, 12) + '@db.example/x'], near: [P('mongodb', '://') + 'user:@db.example/x', P('mongodb', ':/') + 'user:' + rnd(ALNUM, 12) + '@db.example/x'] },
  'pg-uri': { red: [P('postgres', '://') + 'u:' + rnd(ALNUM, 10) + '@db/app'], near: [P('postgres', '://') + 'u:@db/app', P('postgresx', '://') + 'u:' + rnd(ALNUM, 10) + '@db/app'] },
  'generic-secret-assign': { red: [P('pass', 'word: \'') + rnd(ALNUM, 24) + '\''], near: [P('pass', 'word: \'') + rnd(ALNUM, 15) + '\'', P('pass', 'word: \'') + 'a'.repeat(24) + '\''] },
  'vibespace-webhook-token': { red: [P('vs', 'wh_') + rnd(HEX, 48)], near: [P('vs', 'wh_') + rnd(HEX, 47), P('vs', 'wh_') + rnd(HEX, 20) + 'G' + rnd(HEX, 27)] },
  'vibespace-webhook-pair-code': { red: [P('vs', 'wp_') + rnd(B64URL, 60)], near: [P('vs', 'wp_') + rnd(B64URL, 39), P('vs', 'wp_') + rnd(ALNUM, 10) + '.' + rnd(ALNUM, 40)] },
  'basic-auth-url': { red: [P('https', '://u') + rnd(ALNUM, 3) + ':' + rnd(ALNUM, 8) + '@h.example/'], near: [P('https', '://u') + rnd(ALNUM, 3) + ':' + rnd(ALNUM, 5) + '@h.example/', P('https', '://u') + rnd(ALNUM, 3) + ':' + rnd(ALNUM, 8) + '#h.example/'] },
};
const scan = (text, opts = {}) => S.scanText(text, 'fixture.mjs', opts);
const rulesOf = (text, opts) => scan(text, opts).map((f) => f.rule);

console.log('\n① every row: a RED fixture built at runtime, GREEN near-misses');
const ALL = [/.*/];
for (const r of S.RULES) {
  const fx = F[r.id];
  if (!fx) { ok(false, `${r.id}: no fixture in this suite — every row of the table needs a RED + its near-misses`); continue; }
  const reds = fx.red.map((t) => rulesOf(t, r.partner ? { allow: ALL } : {}));
  ok(reds.every((ids) => ids.includes(r.id)), `${r.id}: ${fx.red.length} RED fixture(s) found${r.partner ? ' — under an allow-everything list (a partner row never consults it)' : ''}`, reds);
  const nears = fx.near.map((t) => rulesOf(t));
  ok(nears.every((ids) => !ids.includes(r.id)), `${r.id}: ${fx.near.length} near-miss(es) GREEN (one char short / a character outside the alphabet)`, nears);
  if (!r.partner) {
    const hitOf = (t) => { const m = r.re.exec(t); return m ? m[0] : ''; };
    const lit = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    ok(fx.red.every((t) => !rulesOf(t, { allow: [lit(hitOf(t))] }).includes(r.id)), `${r.id}: an allow row on the hit silences it (a generic row)`);
  }
}
ok(Object.keys(F).every((id) => S.RULES.some((r) => r.id === id)), 'every fixture here names a row of the table (no stale fixture)', Object.keys(F).filter((id) => !S.RULES.some((r) => r.id === id)));

// ── scratch-repo plumbing ──
const git = (cwd, args, input) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf-8', env: GIT_ENV, input });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const put = (repo, rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
const commit = (repo, files, msg) => { for (const [rel, text] of Object.entries(files)) { if (text === null) fs.rmSync(path.join(repo, rel)); else put(repo, rel, text); } git(repo, ['add', '-A']); git(repo, ['commit', '-q', '-m', msg]); return git(repo, ['rev-parse', 'HEAD']); };
const cli = (cwd, args, script = SCAN) => {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf-8', env: GIT_ENV });
  let json = null; try { json = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { }
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), json: json || [] };
};
const ZERO = '0'.repeat(40);

console.log('\n② the rel263 shape through the pre-push path (a scratch repo, the REAL hook + scanner + allowlist)');
const repo = path.join(ROOT, 'push');
fs.mkdirSync(repo, { recursive: true });
git(repo, ['init', '-q']);
const CALLS = path.join(repo, 'calls.ndjson');
const STUB_CI = `import fs from 'node:fs';\nconst a = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(CALLS)}, JSON.stringify({ mode: a.includes('--check-heavy') ? 'check-heavy' : a.includes('--heavy-launch') ? 'heavy-launch' : 'fast' }) + '\\n');\n`;
const A = commit(repo, {
  '.gitignore': 'calls.ndjson\npre-push*\n', 'README.md': '# scratch\n', 'scripts/ci.mjs': STUB_CI,
  'scripts/secret-scan.mjs': fs.readFileSync(SCAN, 'utf8'), '.repo-guard-allow': fs.readFileSync(path.join(REPO, '.repo-guard-allow'), 'utf8'),
}, 'A');
fs.copyFileSync(path.join(REPO, 'scripts', 'git-hooks', 'pre-push'), path.join(repo, 'pre-push'));
const SLACK = P('xo', 'xb-') + rnd(DIGITS, 10) + '-' + rnd(ALNUM, 13); // `xoxb-` + 24 characters
const ANT = P('sk', '-ant-api03-') + rnd(B64URL, 40);
const SIX = `  const SIX = { ant: '${ANT}', slack: '${SLACK}', pem: '${PEM('RSA')}', mail: 'alice.smith@example.com' };`;
const REL = 'scripts/test-rel263.mjs';
const B = commit(repo, { [REL]: `// the rel263 shape: the PEM header shares the line with the token\nimport fs from 'node:fs';\n${SIX}\n` }, 'B: a literal fixture line');
const calls = () => { try { return fs.readFileSync(CALLS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).mode); } catch { return []; } };
const runHook = (stdin, env = {}, hook = path.join(repo, 'pre-push')) => {
  try { fs.unlinkSync(CALLS); } catch { }
  const r = spawnSync('bash', [hook, 'origin', 'git@example.invalid:x/y.git'], { cwd: repo, input: stdin, encoding: 'utf-8', env: { ...GIT_ENV, ...env } });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), calls: calls() };
};
const push = (local, remote = ZERO, branch = 'main') => `refs/heads/${branch} ${local} refs/heads/${branch} ${remote}\n`;
const allowRows = fs.readFileSync(path.join(REPO, '.repo-guard-allow'), 'utf8').split('\n');
ok(allowRows.includes('BEGIN [A-Z ]*PRIVATE KEY'), 'the repo allowlist still carries the row that hid rel263\'s token (`BEGIN [A-Z ]*PRIVATE KEY`) — the legs below are non-vacuous');
const r1 = runHook(push(B, A));
ok(r1.status === 1, 'the push is REFUSED', r1.out);
ok(r1.out.includes(`${REL}:3`) && /slack-token/.test(r1.out), `…naming the file:line (${REL}:3) and the row`, r1.out);
ok(r1.out.includes('concatenation') && /GH013/.test(r1.out), '…and the fixture rule (build token shapes at runtime by concatenation) with GitHub\'s refusal code', r1.out);
ok(r1.calls.length === 0, 'refused BEFORE the heavy verdict and the fast tier are asked', r1.calls);
const r2 = runHook(push(B, A), { VIBESPACE_SKIP_CI: '1' });
ok(r2.status === 1 && r2.calls.length === 0, 'VIBESPACE_SKIP_CI=1 does not skip the scan (GitHub refuses the shape whatever we skip)', r2.out);
const r5 = runHook(push(B, ZERO, 'feature'));
ok(r5.status === 1 && r5.out.includes(`${REL}:3`), 'a NEW branch (remote sha zeros) is refused too — its whole unpublished range is read', r5.out);
const FIXED = `  const SIX = { ant: ['sk', '${ANT.slice(2)}'].join(''), slack: ['xo', '${SLACK.slice(2)}'].join(''), pem: ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join(''), mail: 'alice.smith@example.com' };`;
const C = commit(repo, { [REL]: `// the rel263 shape: the PEM header shares the line with the token\nimport fs from 'node:fs';\n${FIXED}\n` }, 'C: fixed in a later commit');
const r3 = runHook(push(C, A));
ok(r3.status === 1 && r3.out.includes(`commit ${B.slice(0, 9)}`), 'a fix in a LATER commit of the same push is still refused, naming the commit that carries the literal (GitHub reads every commit)', r3.out);
git(repo, ['checkout', '-q', '-b', 'squashed', A]);
const D = commit(repo, { [REL]: `// the rel263 shape, fixed\nimport fs from 'node:fs';\n${FIXED}\n` }, 'D: the squashed fix');
const r4 = runHook(push(D, A));
ok(r4.status === 0 && r4.calls.join(',') === 'check-heavy,fast,heavy-launch', 'the squashed fix (runtime concatenation) goes through: check-heavy, fast, heavy-launch', r4);
// CONTROL (a): the shipped hook without its scan block
const hookSrc = fs.readFileSync(path.join(repo, 'pre-push'), 'utf8');
const cutFrom = hookSrc.indexOf('# ── SECRET SCAN (B-89da'), cutTo = hookSrc.indexOf('[ "${VIBESPACE_SKIP_CI:-}" = "1" ]');
if (cutFrom > 0 && cutTo > cutFrom) {
  const pre = path.join(repo, 'pre-push.noscan');
  fs.writeFileSync(pre, hookSrc.slice(0, cutFrom) + hookSrc.slice(cutTo));
  const rn = runHook(push(B, A), {}, pre);
  ok(rn.status === 0 && rn.calls.includes('fast'), 'CONTROL: the same hook WITHOUT its scan block lets the rel263 shape through (the block is what refuses)', rn);
} else ok(false, 'CONTROL: the scan block\'s anchors (`# ── SECRET SCAN (B-89da` … the VIBESPACE_SKIP_CI line) are not in the shipped hook — the control would prove nothing');
// CONTROL (b): the scanner with the line-wide allow, partner rows consulting the allowlist
const scanSrc = fs.readFileSync(SCAN, 'utf8');
const EDITS = [
  ['for (const m of line.matchAll(g)) { if (m[0].length && m.index < end && m.index + m[0].length > start) return true; }', 'if (r.test(line)) return true;'],
  ['if (!rule.partner && allowedAt(', 'if (allowedAt('],
];
let lineWide = scanSrc;
for (const [from, to] of EDITS) lineWide = lineWide.replace(from, to);
const lineWideAt = path.join(ROOT, 'secret-scan.linewide.mjs');
fs.writeFileSync(lineWideAt, lineWide);
ok(EDITS.every(([from]) => scanSrc.includes(from)) && lineWide !== scanSrc, 'CONTROL: both anchors of the line-wide copy are in the shipped scanner');
const shipped = cli(repo, [`--range=${A}..${B}`, '--quiet']), wide = cli(repo, [`--range=${A}..${B}`, '--quiet'], lineWideAt);
ok(shipped.status === 1 && wide.status === 0, `CONTROL: over the same push the shipped scanner says RED (rc ${shipped.status}), the line-wide copy says clean (rc ${wide.status}) — rel263's miss, reproduced`, wide.out);
// CONTROL (c): the base scanner itself, when this checkout has the base commit (a shallow CI clone does not)
const base = spawnSync('git', ['-C', REPO, 'show', '2dd2f322a:scripts/secret-scan.mjs'], { encoding: 'utf-8', env: GIT_ENV });
if (base.status === 0) {
  const baseAt = path.join(ROOT, 'secret-scan.base.mjs');
  fs.writeFileSync(baseAt, base.stdout);
  const diff = git(repo, ['diff', '--no-color', A, B]);
  const rb = spawnSync(process.execPath, [baseAt, '--stdin', '--quiet'], { cwd: repo, input: diff + '\n', encoding: 'utf-8', env: GIT_ENV });
  ok(rb.status === 0, `CONTROL: the base scanner (2dd2f322a) passes the rel263 shape with the repo allowlist (rc ${rb.status}) — as it did on 2026-10-13`, rb.stderr);
} else console.log('  · SKIP CONTROL (base scanner): 2dd2f322a is not in this checkout (a shallow clone) — the line-wide copy above stands in');

console.log('\n③ the allowlist cannot allow itself');
git(repo, ['checkout', '-q', 'main']);
const allowNow = fs.readFileSync(path.join(repo, '.repo-guard-allow'), 'utf8');
const E = commit(repo, { '.repo-guard-allow': allowNow + `${SLACK}\nscripts/test-rel263\\.mjs\n${REL}\n.*\n` }, 'E: allow rows for the literal, the path and everything');
const allowLine = (allowNow + `${SLACK}\n`).split('\n').length - 1;
const re = cli(repo, [`--range=${A}..${E}`, '--json', '--quiet']);
ok(re.status === 1 && re.json.some((f) => f.file === REL && f.line === 3 && f.rule === 'slack-token'), 'rows naming the literal, the file\'s own path and `.*` — the token is still RED', re.json);
ok(re.json.some((f) => f.file === '.repo-guard-allow' && f.line === allowLine && f.rule === 'slack-token'), `…and the row that spells the literal is a finding of its own (.repo-guard-allow:${allowLine})`, re.json);
const rh = runHook(push(E, A));
ok(rh.status === 1 && rh.calls.length === 0, 'the hook refuses that push', rh.out);
const GEN = `const password = '${rnd(ALNUM, 24)}';`;
ok(S.judgeLine(GEN, { allow: [] }).some((f) => f.rule === 'generic-secret-assign') && !S.judgeLine(GEN, { allow: [/.*/] }).length, 'the same `.*` still silences a GENERIC row (the allowlist keeps its job for non-partner shapes)');

console.log('\n④ an allow row suppresses only the finding it overlaps');
const V = rnd(ALNUM, 20);
const R1 = P('fixture-', 'refresh-0001'); // assembled, so this source line is no assignment-shaped literal itself
const TWO = `const t = { refresh_token: '${R1}', access_token: '${V}' };`;
ok(S.judgeLine(TWO, { allow: [/fixture-refresh-000/] }).some((f) => f.rule === 'generic-secret-assign'), 'a row covering the FIRST assignment leaves the second one RED (every match on the line is judged)');
ok(!S.judgeLine(TWO, { allow: [/fixture-refresh-000/, new RegExp(V)] }).length, 'a row on each value silences both');
ok(!S.judgeLine(`token: '${V}'`, { allow: [new RegExp(`token: '${V}'`)] }).length, 'a row matching the finding itself silences it');
put(path.join(ROOT, 'span'), 'f.mjs', TWO + '\n');
put(path.join(ROOT, 'span'), '.repo-guard-allow', 'fixture-refresh-000\n');
const sw = cli(path.join(ROOT, 'span'), ['f.mjs', '--quiet']), sl = cli(path.join(ROOT, 'span'), ['f.mjs', '--quiet'], lineWideAt);
ok(sw.status === 1 && sl.status === 0, `CONTROL: the line-wide copy lets the second assignment through (shipped rc ${sw.status}, line-wide rc ${sl.status})`);

console.log('\n⑤ --range reads every commit, the touched files\' full text — and says when it cannot');
const rr = path.join(ROOT, 'range');
fs.mkdirSync(rr, { recursive: true });
git(rr, ['init', '-q']);
const GH = P('gh', 'p_') + rnd(ALNUM, 36), GH2 = P('gh', 'p_') + rnd(ALNUM, 36), GH3 = P('gh', 'p_') + rnd(ALNUM, 36), SL2 = P('xo', 'xp-') + rnd(DIGITS, 12) + '-' + rnd(ALNUM, 24);
const xLines = ['one', 'two', 'three', 'four', 'five', 'six', `holder ${GH}`, 'eight'];
const A0 = commit(rr, { 'notes/x.txt': xLines.join('\n') + '\n', 'notes/y.txt': `one\nholder ${GH2}\n` }, 'A0');
const A1 = commit(rr, { 'notes/x.txt': [...xLines, 'nine'].join('\n') + '\n' }, 'A1: a clean line appended');
const q1 = cli(rr, [`--range=${A0}..${A1}`, '--json', '--quiet']);
ok(q1.json.some((f) => f.file === 'notes/x.txt' && f.line === 7 && f.rule === 'github-token' && !f.commit), 'a TOUCHED file is read whole: the token already in notes/x.txt is found at its real line 7', q1.json);
ok(!q1.json.some((f) => f.file === 'notes/y.txt'), '…an untouched file is not part of what the push publishes', q1.json);
const A2 = commit(rr, { 'src/t.js': `// t\nconst k = '${SL2}';\n` }, 'A2: a token');
const A3 = commit(rr, { 'src/t.js': '// t\n' }, 'A3: removed again');
const q2 = cli(rr, [`--range=${A1}..${A3}`, '--json', '--quiet']);
ok(q2.status === 1 && q2.json.some((f) => f.file === 'src/t.js' && f.line === 2 && f.commit === A2 && f.rule === 'slack-token'), 'a token added and removed inside the range is found at src/t.js:2, named by its commit', q2.json);
ok(!q2.json.some((f) => f.file.startsWith('notes/')), '…and nothing outside the range', q2.json);
git(rr, ['update-ref', 'refs/remotes/origin/main', A1]);
const q3 = cli(rr, [`--range=${A3}`, '--json', '--quiet']);
ok(q3.json.some((f) => f.file === 'src/t.js' && f.commit === A2) && !q3.json.some((f) => f.file.startsWith('notes/')), 'a lone sha = what no remote-tracking ref has (A1 is published: notes/ is not read)', q3.json);
const q4 = cli(rr, [`--range=${'f'.repeat(39)}1..${A3}`, '--json']);
ok(q4.status === 1 && /never fetched/.test(q4.out) && q4.json.some((f) => f.file === 'src/t.js'), 'a base this checkout never fetched falls back to that reading, and says so', q4.out);
const q5 = cli(rr, [`--range=${'e'.repeat(40)}`]);
ok(q5.status === 2 && /NOT a clean verdict/.test(q5.out), `an unknown tip exits 2 — never "clean" (rc ${q5.status})`, q5.out);
const A4 = commit(rr, { 'src/plus.txt': `++ ${GH3}\n` }, 'A4: a content line that starts with ++');
const q7 = cli(rr, ['--tree', '--json', '--quiet']);
ok(['notes/x.txt:7', 'notes/y.txt:2', 'src/plus.txt:1'].every((k) => q7.json.some((f) => `${f.file}:${f.line}` === k)), '--tree reads every tracked file', q7.json);
const A5 = commit(rr, { 'src/plus.txt': '\n' }, 'A5: removed again');
const q6 = cli(rr, [`--range=${A3}..${A5}`, '--json', '--quiet']);
ok(q6.json.some((f) => f.file === 'src/plus.txt' && f.line === 1 && f.commit === A4), 'an added line whose content starts with `++` is content, not a file header (found in its commit\'s patch)', q6.json);

console.log('\n⑥ THE THREE CALLERS run the ONE table');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const hook = read('scripts/git-hooks/pre-push'), ci = read('scripts/ci.mjs'), wf = read('.github/workflows/secret-scan.yml'), ciYml = read('.github/workflows/ci.yml');
const scanAt = hook.indexOf('node scripts/secret-scan.mjs --range="$(range_for_sha "$sha")"');
ok(scanAt > 0, 'caller 1, the pre-push hook: `node scripts/secret-scan.mjs --range=<what the ref publishes>`');
ok(scanAt < hook.indexOf('[ "${VIBESPACE_SKIP_CI:-}" = "1" ]') && scanAt < hook.indexOf('--check-heavy') && scanAt < hook.indexOf('node scripts/ci.mjs ||'), '…before the bypass, the heavy verdict and the fast tier');
const fastGate = ci.slice(ci.indexOf('async function fastGate('), ci.indexOf('async function heavyGate('));
ok(ci.includes("const script = path.join(cwd, 'scripts', 'secret-scan.mjs');") && ci.includes("[script, '--tree', '--quiet']"), 'caller 2, scripts/ci.mjs: runSecretScan spawns scripts/secret-scan.mjs --tree');
ok(fastGate.includes('runSecretScan({ cwd: runRoot, sha })') && fastGate.indexOf('runSecretScan(') < fastGate.indexOf('laneWorker('), '…in the FAST tier, after the build and before the first suite (the Actions fast job runs `node scripts/ci.mjs` too)');
ok(/^\s*if ! node scripts\/secret-scan\.mjs --tree; then$/m.test(wf) && !wf.includes('git ls-files'), 'caller 3, the Actions secret-scan workflow: `node scripts/secret-scan.mjs --tree` (no per-file loop of its own)');
ok(/node scripts\/ci\.mjs\s*$/m.test(ciYml), '…and ci.yml\'s fast job runs scripts/ci.mjs (caller 2 on the runner)');
const OWN_PATTERN = /xox\[|gh\[pousr\]|github_pat_|sk-ant-|AKIA|AIza|GOCSPX|glpat-|PRIVATE KEY|T3Blbk|npm_\[|hf_\[|SG\\\./;
for (const [name, text] of [['scripts/git-hooks/pre-push', hook], ['scripts/ci.mjs', ci], ['.github/workflows/secret-scan.yml', wf], ['.github/workflows/ci.yml', ciYml]]) ok(!OWN_PATTERN.test(text), `${name} carries no secret pattern of its own`, (OWN_PATTERN.exec(text) || [])[0]);
const PARTNER = ['slack-token', 'slack-config-token', 'slack-app-token', 'slack-webhook', 'github-token', 'github-pat', 'gitlab-token', 'anthropic-key', 'openai-key', 'google-api-key', 'google-oauth-secret', 'google-oauth-token', 'aws-akid', 'aws-secret', 'stripe-key', 'twilio-api-key', 'sendgrid-key', 'npm-token', 'pypi-token', 'huggingface-token', 'private-key-block'];
const GENERIC = ['private-key', 'cephx-key', 'jwt', 'mongo-uri', 'pg-uri', 'generic-secret-assign', 'vibespace-webhook-token', 'vibespace-webhook-pair-code', 'basic-auth-url'];
ok(JSON.stringify(S.RULES.filter((r) => r.partner).map((r) => r.id)) === JSON.stringify(PARTNER), `THE ONE TABLE: ${PARTNER.length} partner rows, by id`, S.RULES.filter((r) => r.partner).map((r) => r.id));
ok(JSON.stringify(S.RULES.filter((r) => !r.partner).map((r) => r.id)) === JSON.stringify(GENERIC), `…and ${GENERIC.length} generic rows`, S.RULES.filter((r) => !r.partner).map((r) => r.id));
const tableAt = scanSrc.indexOf('export const RULES = ['), tableEnd = scanSrc.indexOf('\n];\n', tableAt);
const reAt = [...scanSrc.matchAll(/\bre: \//g)].map((m) => m.index);
ok(tableAt > 0 && reAt.length === S.RULES.length && reAt.every((i) => i > tableAt && i < tableEnd), `every \`re:\` in scripts/secret-scan.mjs sits inside the one table (${reAt.length} rows)`);

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
