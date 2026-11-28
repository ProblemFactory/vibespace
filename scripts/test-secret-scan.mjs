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
//      has, a never-fetched base or an unknown tip exits 2 BY NAME (never "clean"; the old fallback read the kit's clone clean — CONTROL), a `++` content line is
//      content; --tree reads every tracked file
//   ⑥ THE THREE CALLERS census: the pre-push hook (--range, before the bypass and every tier), scripts/ci.mjs's fast
//      tier (--tree) and the Actions secret-scan workflow (--tree) run scripts/secret-scan.mjs, none carries a
//      pattern of its own; the table's rows pinned by id, every `re:` inside the one table
//   ⑦ B-ecc4 — THE PUSHING CHECKOUT'S ALLOW FILE JUDGES A PUSH: the hook runs `node scripts/secret-scan.mjs` in the
//      checkout that pushes, so the allow rows are its WORKING TREE's — for a release pushed from production, the running
//      release's, never the range's. The production-cwd case (a row added inside the range counts in the lane's own
//      checkout and NOT in a checkout at the release), and therefore the pin: the tree's allow file gains no row over the
//      77 it held at 2.369.407 (by hash; a dead row may go) — a text that needs a row is fixed instead; the lane's own
//      range scan now names that row too (⑧), so the lane's gate no longer says clean there
//   ⑧ B-ecc4 part 1 — THE ALLOW-ROW CENSUS over a range (what the push hook and the test kit's build-check:secret-scan
//      run): every row a commit adds that the BASE's allow file lacks is a finding by commit and line, a row a merge
//      brought by its line in the tip's file; a comment, a blank, a moved / taken-out / put-back base row are not; a
//      lone tip is not judged and says so; the report names the cure. RED CONTROL: the scanner with the census cut out
//      answers the same range clean
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { scratch, anchored } from './scratch.mjs';
import { gitEnvFrom } from './git-env.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SCAN = path.join(REPO, 'scripts', 'secret-scan.mjs');
const S = await import(pathToFileURL(SCAN).href);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };

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
  ok(verdictOf(reds.every((ids) => ids.includes(r.id))), `${r.id}: ${fx.red.length} RED fixture(s) found${r.partner ? ' — under an allow-everything list (a partner row never consults it)' : ''}`, reds);
  const nears = fx.near.map((t) => rulesOf(t));
  ok(verdictOf(nears.every((ids) => !ids.includes(r.id))), `${r.id}: ${fx.near.length} near-miss(es) GREEN (one char short / a character outside the alphabet)`, nears);
  if (!r.partner) {
    const hitOf = (t) => { const m = r.re.exec(t); return m ? m[0] : ''; };
    const lit = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    ok(verdictOf(fx.red.every((t) => !rulesOf(t, { allow: [lit(hitOf(t))] }).includes(r.id))), `${r.id}: an allow row on the hit silences it (a generic row)`);
  }
}
ok(verdictOf(Object.keys(F).every((id) => S.RULES.some((r) => r.id === id))), 'every fixture here names a row of the table (no stale fixture)', Object.keys(F).filter((id) => !S.RULES.some((r) => r.id === id)));

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
  const r = spawnSync('bash', [hook, 'origin', 'git@example.invalid:x/y.git'], { cwd: repo, input: stdin, encoding: 'utf-8', env: { ...GIT_ENV, VIBESPACE_HOOK_NODE_DIR: path.join(ROOT, 'hook-node'), ...env } });   // B-e381: the tiers' node folder in this run's scratch
  return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), calls: calls() };
};
const push = (local, remote = ZERO, branch = 'main') => `refs/heads/${branch} ${local} refs/heads/${branch} ${remote}\n`;
const allowRows = fs.readFileSync(path.join(REPO, '.repo-guard-allow'), 'utf8').split('\n');
ok(verdictOf(allowRows.includes('BEGIN [A-Z ]*PRIVATE KEY')), 'the repo allowlist still carries the row that hid rel263\'s token (`BEGIN [A-Z ]*PRIVATE KEY`) — the legs below are non-vacuous');
const r1 = runHook(push(B, A));
ok(r1.status === 1, 'the push is REFUSED', r1.out);
ok(gateOf(r1.out.includes(`${REL}:3`)) && verdictOf(/slack-token/.test(r1.out)), `…naming the file:line (${REL}:3) and the row`, r1.out);
ok(gateOf(r1.out.includes('concatenation')) && verdictOf(/GH013/.test(r1.out)), '…and the fixture rule (build token shapes at runtime by concatenation) with GitHub\'s refusal code', r1.out);
ok(r1.calls.length === 0, 'refused BEFORE the heavy verdict and the fast tier are asked', r1.calls);
const r2 = runHook(push(B, A), { VIBESPACE_SKIP_CI: '1' });
ok(r2.status === 1 && r2.calls.length === 0, 'VIBESPACE_SKIP_CI=1 does not skip the scan (GitHub refuses the shape whatever we skip)', r2.out);
const r5 = runHook(push(B, ZERO, 'feature'));
ok(r5.status === 1 && verdictOf(r5.out.includes(`${REL}:3`)), 'a NEW branch (remote sha zeros) is refused too — its whole unpublished range is read', r5.out);
const FIXED = `  const SIX = { ant: ['sk', '${ANT.slice(2)}'].join(''), slack: ['xo', '${SLACK.slice(2)}'].join(''), pem: ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join(''), mail: 'alice.smith@example.com' };`;
const C = commit(repo, { [REL]: `// the rel263 shape: the PEM header shares the line with the token\nimport fs from 'node:fs';\n${FIXED}\n` }, 'C: fixed in a later commit');
const r3 = runHook(push(C, A));
ok(r3.status === 1 && verdictOf(r3.out.includes(`commit ${B.slice(0, 9)}`)), 'a fix in a LATER commit of the same push is still refused, naming the commit that carries the literal (GitHub reads every commit)', r3.out);
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
  ok(rn.status === 0 && verdictOf(rn.calls.includes('fast')), 'CONTROL: the same hook WITHOUT its scan block lets the rel263 shape through (the block is what refuses)', rn);
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
ok(gateOf(EDITS.every(([from]) => scanSrc.includes(from))) && lineWide !== scanSrc, 'CONTROL: both anchors of the line-wide copy are in the shipped scanner');
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
ok(re.status === 1 && verdictOf(re.json.some((f) => f.file === REL && f.line === 3 && f.rule === 'slack-token')), 'rows naming the literal, the file\'s own path and `.*` — the token is still RED', re.json);
ok(verdictOf(re.json.some((f) => f.file === '.repo-guard-allow' && f.line === allowLine && f.rule === 'slack-token')), `…and the row that spells the literal is a finding of its own (.repo-guard-allow:${allowLine})`, re.json);
const rh = runHook(push(E, A));
ok(rh.status === 1 && rh.calls.length === 0, 'the hook refuses that push', rh.out);
const GEN = `const password = '${rnd(ALNUM, 24)}';`;
ok(gateOf(S.judgeLine(GEN, { allow: [] }).some((f) => f.rule === 'generic-secret-assign')) && !S.judgeLine(GEN, { allow: [/.*/] }).length, 'the same `.*` still silences a GENERIC row (the allowlist keeps its job for non-partner shapes)');

console.log('\n④ an allow row suppresses only the finding it overlaps');
const V = rnd(ALNUM, 20);
const R1 = P('fixture-', 'refresh-0001'); // assembled, so this source line is no assignment-shaped literal itself
const TWO = `const t = { refresh_token: '${R1}', access_token: '${V}' };`;
ok(verdictOf(S.judgeLine(TWO, { allow: [/fixture-refresh-000/] }).some((f) => f.rule === 'generic-secret-assign')), 'a row covering the FIRST assignment leaves the second one RED (every match on the line is judged)');
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
ok(verdictOf(q1.json.some((f) => f.file === 'notes/x.txt' && f.line === 7 && f.rule === 'github-token' && !f.commit)), 'a TOUCHED file is read whole: the token already in notes/x.txt is found at its real line 7', q1.json);
ok(!q1.json.some((f) => f.file === 'notes/y.txt'), '…an untouched file is not part of what the push publishes', q1.json);
const A2 = commit(rr, { 'src/t.js': `// t\nconst k = '${SL2}';\n` }, 'A2: a token');
const A3 = commit(rr, { 'src/t.js': '// t\n' }, 'A3: removed again');
const q2 = cli(rr, [`--range=${A1}..${A3}`, '--json', '--quiet']);
ok(q2.status === 1 && verdictOf(q2.json.some((f) => f.file === 'src/t.js' && f.line === 2 && f.commit === A2 && f.rule === 'slack-token')), 'a token added and removed inside the range is found at src/t.js:2, named by its commit', q2.json);
ok(!q2.json.some((f) => f.file.startsWith('notes/')), '…and nothing outside the range', q2.json);
git(rr, ['update-ref', 'refs/remotes/origin/main', A1]);
const q3 = cli(rr, [`--range=${A3}`, '--json', '--quiet']);
ok(gateOf(q3.json.some((f) => f.file === 'src/t.js' && f.commit === A2)) && !q3.json.some((f) => f.file.startsWith('notes/')), 'a lone sha = what no remote-tracking ref has (A1 is published: notes/ is not read)', q3.json);
// EITHER END NOT A COMMIT HERE IS REFUSED BY NAME (the test kit's scan check, 2026-11-19): a never-fetched base once fell back
// to the lone-tip reading, which over a clone whose remote-tracking refs hold every commit reads NOTHING — and said clean
const q4 = cli(rr, [`--range=${'f'.repeat(39)}1..${A3}`, '--json']);
ok(q4.status === 2 && gateOf(/the range's base f{39}1 is not a commit in this repository/.test(q4.out)) && gateOf(/NOT a clean verdict/.test(q4.out)) && q4.json.length === 0,
  `a base this checkout never fetched is REFUSED by name — exit 2, never «clean», nothing printed as findings (rc ${q4.status})`, q4.out);
const q4t = cli(rr, [`--range=${A0}..${'d'.repeat(40)}`, '--json']);
ok(q4t.status === 2 && verdictOf(/the range's tip d{40} is not a commit in this repository/.test(q4t.out)), `…and an unknown TIP in the two-ended form (rc ${q4t.status})`, q4t.out);
{ // CONTROL (the kit's find, reproduced): the scanner with the old fallback put back, over a range whose base this checkout lacks
  // and whose tip a remote-tracking ref already holds, answers CLEAN (exit 0) — A2's token in that history unread
  const NOW_LINE = "  if (m && !has(m[1])) throw gitErr(`the range's base ${m[1]} is not a commit in this repository (a remote sha never fetched?) — a range whose ends are not both commits here is never read as clean: fetch the base, or name the lone tip`);\n";
  const WAS_LINE = "  if (m && !has(m[1])) { note = `the range's base ${m[1].slice(0, 12)} is not in this checkout (a remote sha never fetched) — scanning what no remote-tracking ref has instead`; m = null; }\n";
  const fallbackAt = path.join(ROOT, 'secret-scan.fallback.mjs');
  fs.writeFileSync(fallbackAt, scanSrc.replace(NOW_LINE, WAS_LINE));
  git(rr, ['update-ref', 'refs/remotes/origin/kit', A3]);   // every commit up to A3 published, as in the kit's clone
  const was = cli(rr, [`--range=${'f'.repeat(39)}1..${A3}`, '--quiet'], fallbackAt), now = cli(rr, [`--range=${'f'.repeat(39)}1..${A3}`, '--quiet']);
  git(rr, ['update-ref', '-d', 'refs/remotes/origin/kit']);
  ok(scanSrc.split(NOW_LINE).length === 2 && was.status === 0 && gateOf(/scanning what no remote-tracking ref has instead/.test(was.out)) && now.status === 2,
    `CONTROL: with the old fallback put back (its own «scanning what no remote-tracking ref has instead» said) the same range reads CLEAN (rc ${was.status}) though A2 carries a token; the shipped scanner refuses it (rc ${now.status})`, was.out); }
const q5 = cli(rr, [`--range=${'e'.repeat(40)}`]);
ok(q5.status === 2 && verdictOf(/NOT a clean verdict/.test(q5.out)), `an unknown tip exits 2 — never "clean" (rc ${q5.status})`, q5.out);
const A4 = commit(rr, { 'src/plus.txt': `++ ${GH3}\n` }, 'A4: a content line that starts with ++');
const q7 = cli(rr, ['--tree', '--json', '--quiet']);
ok(verdictOf(['notes/x.txt:7', 'notes/y.txt:2', 'src/plus.txt:1'].every((k) => q7.json.some((f) => `${f.file}:${f.line}` === k))), '--tree reads every tracked file', q7.json);
const A5 = commit(rr, { 'src/plus.txt': '\n' }, 'A5: removed again');
const q6 = cli(rr, [`--range=${A3}..${A5}`, '--json', '--quiet']);
ok(verdictOf(q6.json.some((f) => f.file === 'src/plus.txt' && f.line === 1 && f.commit === A4)), 'an added line whose content starts with `++` is content, not a file header (found in its commit\'s patch)', q6.json);

console.log('\n⑥ THE THREE CALLERS run the ONE table');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const hook = read('scripts/git-hooks/pre-push'), ci = read('scripts/ci.mjs'), wf = read('.github/workflows/secret-scan.yml'), ciYml = read('.github/workflows/ci.yml');
const scanAt = hook.indexOf('node scripts/secret-scan.mjs --range="$(range_for_sha "$sha")"');
ok(scanAt > 0, 'caller 1, the pre-push hook: `node scripts/secret-scan.mjs --range=<what the ref publishes>`');
ok(scanAt < hook.indexOf('[ "${VIBESPACE_SKIP_CI:-}" = "1" ]') && scanAt < hook.indexOf('node scripts/ci.mjs --check-heavy --head=') && scanAt < hook.indexOf('node scripts/ci.mjs $kg ||'), '…before the bypass, the heavy verdict and the fast tier');
const fastGate = ci.slice(ci.indexOf('async function fastGate('), ci.indexOf('async function heavyGate('));
ok(gateOf(ci.includes("const script = path.join(cwd, 'scripts', 'secret-scan.mjs');")) && verdictOf(ci.includes("[script, '--tree', '--quiet']")), 'caller 2, scripts/ci.mjs: runSecretScan spawns scripts/secret-scan.mjs --tree');
ok(gateOf(fastGate.includes('runSecretScan({ cwd: runRoot, sha })')) && fastGate.indexOf('await runFastLanes(plan, {') > 0 && fastGate.indexOf('runSecretScan(') < fastGate.indexOf('await runFastLanes(plan, {'), '…in the FAST tier, after the build and before the first suite (the Actions fast job runs `node scripts/ci.mjs` too)');
ok(gateOf(/^\s*if ! node scripts\/secret-scan\.mjs --tree; then$/m.test(wf)) && !wf.includes('git ls-files'), 'caller 3, the Actions secret-scan workflow: `node scripts/secret-scan.mjs --tree` (no per-file loop of its own)');
// THE HOSTED FAST JOB RUNS THE SECRET SCAN — the law, never the line's spelling (主开发 11:48Z, after B-7353 split the job in two):
// the job's line runs scripts/ci.mjs, whole or as one part; EVERY part reaches the scan (fastGate calls it unconditionally, after the
// build and before any lane, whatever part it runs); and the scan's own suite is a fast row the split puts in exactly one part
const FAST_RUN = /^\s*- run: node scripts\/ci\.mjs(?: --fast-part=\$\{\{ matrix\.part \}\}\/\d+)?(?: --keep-going)?\s*$/m;
ok(verdictOf(FAST_RUN.test(ciYml)), '…and ci.yml\'s fast job runs scripts/ci.mjs — the whole tier or one part of it (--fast-part=${{ matrix.part }}/n) — caller 2 on the runner');
const runLine = (ciYml.match(FAST_RUN) || [''])[0];
ok(!!runLine && !FAST_RUN.test(ciYml.replace(runLine, runLine.replace('scripts/ci.mjs', 'scripts/other.mjs'))) && !FAST_RUN.test(ciYml.replace(runLine, runLine.replace('scripts/ci.mjs', 'scripts/ci.mjs --only=test-a'))),
  'CONTROL: a fast job line that runs another script — or the tier cut to a named list — is red');
ok(gateOf(/\n {4}if \(!runSecretScan\(\{ cwd: runRoot, sha \}\)\.ok\)/.test(fastGate)) && fastGate.indexOf('if (part) fast = fastPartPlan(') > 0 && fastGate.indexOf('if (part) fast = fastPartPlan(') < fastGate.indexOf('runSecretScan('),
  '…and EVERY part runs the scan: fastGate calls it unconditionally, after the part\'s cut is made and before its lanes');
{ const C = await import(pathToFileURL(path.join(REPO, 'scripts', 'ci.mjs')).href), fp = C.workflowFastPartsAt(ciYml);
  const sourceOf = (n) => { try { return fs.readFileSync(path.join(REPO, 'scripts', n + '.mjs'), 'utf8'); } catch { return ''; } };
  const parts = fp ? C.fastPartPlan(C.SUITES.filter((x) => x.tier === 'fast'), fp.n, { sourceOf }).parts : [];
  const holding = parts.filter((p) => p.some((x) => x.name === 'test-secret-scan')).length;
  ok(gateOf(C.SUITES.some((x) => x.name === 'test-secret-scan' && x.tier === 'fast')) && !!fp && holding === 1,
    `…and the scan's own suite is a FAST row the split puts in exactly ONE of the workflow's ${fp ? fp.n : '?'} parts (test-ci-gate §2 holds every row in exactly one)`); }
const OWN_PATTERN = /xox\[|gh\[pousr\]|github_pat_|sk-ant-|AKIA|AIza|GOCSPX|glpat-|PRIVATE KEY|T3Blbk|npm_\[|hf_\[|SG\\\./;
for (const [name, text] of [['scripts/git-hooks/pre-push', hook], ['scripts/ci.mjs', ci], ['.github/workflows/secret-scan.yml', wf], ['.github/workflows/ci.yml', ciYml]]) ok(!OWN_PATTERN.test(text), `${name} carries no secret pattern of its own`, (OWN_PATTERN.exec(text) || [])[0]);
const PARTNER = ['slack-token', 'slack-config-token', 'slack-app-token', 'slack-webhook', 'github-token', 'github-pat', 'gitlab-token', 'anthropic-key', 'openai-key', 'google-api-key', 'google-oauth-secret', 'google-oauth-token', 'aws-akid', 'aws-secret', 'stripe-key', 'twilio-api-key', 'sendgrid-key', 'npm-token', 'pypi-token', 'huggingface-token', 'private-key-block'];
const GENERIC = ['private-key', 'cephx-key', 'jwt', 'mongo-uri', 'pg-uri', 'generic-secret-assign', 'vibespace-webhook-token', 'vibespace-webhook-pair-code', 'basic-auth-url'];
ok(JSON.stringify(S.RULES.filter((r) => r.partner).map((r) => r.id)) === JSON.stringify(PARTNER), `THE ONE TABLE: ${PARTNER.length} partner rows, by id`, S.RULES.filter((r) => r.partner).map((r) => r.id));
ok(JSON.stringify(S.RULES.filter((r) => !r.partner).map((r) => r.id)) === JSON.stringify(GENERIC), `…and ${GENERIC.length} generic rows`, S.RULES.filter((r) => !r.partner).map((r) => r.id));
const tableAt = scanSrc.indexOf('export const RULES = ['), tableEnd = scanSrc.indexOf('\n];\n', tableAt);
const reAt = [...scanSrc.matchAll(/\bre: \//g)].map((m) => m.index);
ok(tableAt > 0 && reAt.length === S.RULES.length && verdictOf(reAt.every((i) => i > tableAt && i < tableEnd)), `every \`re:\` in scripts/secret-scan.mjs sits inside the one table (${reAt.length} rows)`);

console.log('\n⑦ B-ecc4: the PUSHING checkout\'s allow file judges what a push publishes (the production-cwd case) — so a pick adds no row');
{
  const pc = path.join(ROOT, 'pushing');
  fs.mkdirSync(pc, { recursive: true });
  git(pc, ['init', '-q']);
  const P0 = commit(pc, { 'scratch.txt': 'scratch\n', 'scripts/secret-scan.mjs': fs.readFileSync(SCAN, 'utf8'), '.repo-guard-allow': fs.readFileSync(path.join(REPO, '.repo-guard-allow'), 'utf8') }, 'P0: the release');
  const VAL = rnd(ALNUM, 24), GENLINE = `const password = '${VAL}';`;   // a GENERIC shape (an allow row may silence it); built at runtime
  const P1 = commit(pc, { 'src/g.js': GENLINE + '\n', '.repo-guard-allow': fs.readFileSync(path.join(pc, '.repo-guard-allow'), 'utf8') + VAL + '\n' }, 'P1: a generic secret and an allow row for it, in the range');
  // the lane's own checkout (its working tree IS the range's tip): the row it added counts
  const own = cli(pc, [`--range=${P0}..${P1}`, '--json', '--quiet']);
  // the checkout that pushes a release (production — a CLONE): its working tree is the running release; the range's commits are in it
  const prod = path.join(ROOT, 'pushing-prod');
  git(ROOT, ['clone', '-q', pc, prod]);
  git(prod, ['checkout', '-q', '--detach', P0]);
  const atRelease = cli(prod, [`--range=${P0}..${P1}`, '--json', '--quiet'], path.join(prod, 'scripts', 'secret-scan.mjs'));
  const genAt = (r) => (r.json || []).some((f) => f.file === 'src/g.js' && f.line === 1 && f.rule === 'generic-secret-assign');
  const valLine = fs.readFileSync(path.join(pc, '.repo-guard-allow'), 'utf8').split('\n').findIndex((l) => l.trim() === VAL) + 1;
  const rowAt = (r) => (r.json || []).filter((f) => f.rule === S.ALLOW_ROW_RULE).map((f) => `${f.file}:${f.line}@${String(f.commit).slice(0, 9)}`);
  ok(!genAt(own) && gateOf(genAt(atRelease)) && atRelease.status === 1,
    `THE PRODUCTION-CWD CASE: one range, one allow row added in it — in the lane's checkout (at the range's tip) the row counts: src/g.js:1 is not a finding (its findings: ${JSON.stringify((own.json || []).map((f) => `${f.rule} ${f.file}:${f.line}`))}); in the pushing checkout at the release it does not: RED at src/g.js:1 (rc ${atRelease.status}) — the row never counts at the push`, { own: own.json, atRelease: atRelease.json });
  ok(valLine > 0 && own.status === 1 && rowAt(own).join() === `.repo-guard-allow:${valLine}@${P1.slice(0, 9)}` && rowAt(atRelease).join() === rowAt(own).join(),
    `…and the lane's own gate is no longer clean there (before part 1 it said rc 0): the allow-row census names the row in both checkouts — ${rowAt(own).join()} (rc ${own.status}); see ⑧`, { own: own.json, valLine });
  // …and the hook asks exactly that checkout: its scan runs `node scripts/secret-scan.mjs` from the pushing checkout's root
  const hookText = fs.readFileSync(path.join(REPO, 'scripts', 'git-hooks', 'pre-push'), 'utf8');
  ok(gateOf(/^\s*node scripts\/secret-scan\.mjs --range="\$\(range_for_sha "\$sha"\)" --quiet$/m.test(hookText)) && !/--allow[\s=]/.test(hookText) && verdictOf(fs.readFileSync(SCAN, 'utf8').includes("fs.existsSync(ALLOW_FILE) ? [ALLOW_FILE] : []")),
    '…the hook runs the pushing checkout\'s scripts/secret-scan.mjs with no --allow, and the scanner reads ALLOW_FILE relative to its cwd (the working tree), never the range\'s tip');
  // PICK 1 — so a pick adds no row: every row the tree's allow file holds is one of the 77 it held at 2.369.407 (sha256, 12 hex)
  const ALLOW_407 = new Set('3cc12ce2667e 3f3434d8240e c19438560b65 03d104c669e3 30548b5cb1c8 ea62db040a9c 01b9083c8bc8 e092ca99a7a7 8b02551f72b4 723ecb08abae 999d3d5fb4dc 7b4aa4407bc5 c32aa37b25e2 7dca712ed078 1966454e3b8a cf9935d8e391 45895de6778e ed1722b2d2ad 4f4552bff5b2 6bfdfbf9e1c1 27060996ec53 7e542c9b2015 f1f8a11fea21 8fd3fe55ed05 0e17bae56c63 5dcb6aad924d 9779fcac3937 da0b0b95d3b1 749c7dc29631 835f971d349b 865254dcfb90 f78312c46e59 bb49f01b9dd8 b7b70fd3a07e ca4e0588b586 f7d29a7e7b86 85b4932501f8 4e6e02616841 34359798e030 7fbc475f8283 6bbe590f1e6d eb227ed5bc15 1c22db73ecbb cbbc8a064f87 bc5e96105884 0b1905f56677 fe93c201d672 0fc4f6fa3a5e 8470b7b4c82c e0f51801d025 e101f457792f 79de2834097f 6cc566d54873 3a77e7758d0a 4841e95e341f ae5edd108af9 736257930fb7 e6972cb90caa 13f0c8e81e74 ba732f7f43bb 8803269a812f 79315bfa201b dfb8d5d93047 60d9057e35e2 7240ceccf4e4 0ef383bb9d47 77266140b7bb 00298af781bf 7f6fde709e71 6e9ea61808b9 b810b42b1e2a 1cb6571ffa9e c3b578964845 22601c9e6239 f65d7d8cceb3 1b5a110d3736 2f2cc53cc3bb'.split(' '));
  const rowsOf = (text) => text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const h12 = (r) => crypto.createHash('sha256').update(r).digest('hex').slice(0, 12);
  const newRows = (text) => rowsOf(text).filter((r) => !ALLOW_407.has(h12(r)));
  const treeAllow = fs.readFileSync(path.join(REPO, '.repo-guard-allow'), 'utf8');
  ok(ALLOW_407.size === 77 && newRows(treeAllow).length === 0,
    `PICK 1: .repo-guard-allow gains no row — ${rowsOf(treeAllow).length} row(s), each one of the 77 of 2.369.407 (a row added in a pick takes effect only after production moves; fix the text: ${S.FIXTURE_RULE})`, newRows(treeAllow).map((r) => r.slice(0, 40)));
  ok(newRows(treeAllow + VAL + '\n').length === 1 && newRows(treeAllow.split('\n').slice(1).join('\n')).length === 0 && newRows('# a comment\n\n').length === 0,
    'PICK 1 CONTROL: a planted row is named; a row taken away, a comment and a blank line are not');
}

console.log('\n⑧ B-ecc4 part 1: THE ALLOW-ROW CENSUS — no commit of a range adds a row to the allow file (red by name: the commit and the line)');
{
  const ar = path.join(ROOT, 'allowrows');
  fs.mkdirSync(ar, { recursive: true });
  git(ar, ['init', '-q']);
  const AF = '.repo-guard-allow', BASE_ROWS = ['# the release\'s rows', 'row-alpha', 'row-beta', 'row-gamma'];
  const file = (rows) => rows.join('\n') + '\n';
  const NEW1 = 'row-new-' + rnd(ALNUM, 8), GAMMA2 = 'row-gamma-' + rnd(ALNUM, 8), BYMERGE = 'row-merge-' + rnd(ALNUM, 8);
  const B0 = commit(ar, { [AF]: file(BASE_ROWS), 'notes.txt': 'one\n' }, 'B0: the base');
  const B1 = commit(ar, { [AF]: file([...BASE_ROWS, NEW1]), 'notes.txt': 'one\ntwo\n' }, 'B1: a new row (RED)');
  const B2 = commit(ar, { [AF]: file([...BASE_ROWS, NEW1, '# a comment', '']) }, 'B2: a comment and a blank line');
  const B3 = commit(ar, { [AF]: file(['# the release\'s rows', 'row-beta', 'row-gamma', NEW1, '# a comment', '', 'row-alpha']) }, 'B3: a base row moved');
  const B4 = commit(ar, { [AF]: file(['# the release\'s rows', 'row-beta', 'row-gamma', '# a comment', '', 'row-alpha']) }, 'B4: the new row taken out again');
  const B5 = commit(ar, { [AF]: file(['# the release\'s rows', 'row-gamma', '# a comment', '', 'row-alpha']) }, 'B5: a base row taken out');
  const B6 = commit(ar, { [AF]: file(['# the release\'s rows', 'row-gamma', '# a comment', '', 'row-alpha', 'row-beta']) }, 'B6: …and put back');
  const B7 = commit(ar, { [AF]: file(['# the release\'s rows', GAMMA2, '# a comment', '', 'row-alpha', 'row-beta']) }, 'B7: a base row edited (RED)');
  // sorted: `git log` reads newest first, the order is no part of the verdict
  const rows = (r) => (r.json || []).filter((f) => f.rule === S.ALLOW_ROW_RULE).map((f) => `${f.file}:${f.line}@${f.commit ? f.commit.slice(0, 9) : 'none'}`).sort();
  const want = [`${AF}:5@${B1.slice(0, 9)}`, `${AF}:2@${B7.slice(0, 9)}`].sort();
  const c1 = cli(ar, [`--range=${B0}..${B7}`, '--json', '--quiet']);
  ok(c1.status === 1 && JSON.stringify(rows(c1)) === JSON.stringify(want),
    `over B0..B7 the census names exactly the two new rows, each by its commit and line: ${JSON.stringify(rows(c1))} (B1's row is RED though B4 took it out again — a range scan reads every commit; B7's edited row is a new row) (rc ${c1.status})`, { got: c1.json, want });
  ok(!c1.json.some((f) => f.rule === S.ALLOW_ROW_RULE && [B2, B3, B4, B5, B6].includes(f.commit)) && verdictOf(c1.json.every((f) => f.rule === S.ALLOW_ROW_RULE)),
    `CONTROLS: a comment and a blank (B2), a base row moved (B3), a row taken out (B4, B5) and a base row put back (B6) are not named; the range has no other finding (${c1.json.length} finding(s), all the census's)`, c1.json);
  ok(verdictOf(c1.json.every((f) => f.rule !== S.ALLOW_ROW_RULE || (!f.snippet.includes(NEW1) && !f.snippet.includes(GAMMA2)))), '…and no finding prints a row whole (its snippet is redacted, as every finding\'s is)', c1.json.map((f) => f.snippet));
  const c2 = cli(ar, [`--range=${B0}..${B7}`, '--quiet']);
  const said = c2.out.replace(/\x1b\[[0-9;]*m/g, '');
  ok(c2.status === 1 && gateOf(said.includes(`allow-row-added ${AF}:5 (commit ${B1.slice(0, 9)})`)) && gateOf(said.includes('never counts when the release is pushed')) && gateOf(said.includes('Fold the cure INTO that commit')) && !said.includes('If a non-partner match is a false positive'),
    `the report says it by name — «allow-row-added ${AF}:5 (commit ${B1.slice(0, 9)})», why the row never counts, and the cure (fold it into that commit); not the false-positive advice`, said);
  const c3 = cli(ar, [`--range=${B1}..${B7}`, '--json', '--quiet']);
  ok(JSON.stringify(rows(c3)) === JSON.stringify([`${AF}:2@${B7.slice(0, 9)}`]), `the floor is the range's BASE: over B1..B7 (a base that holds B1's row) only B7's row is named — ${JSON.stringify(rows(c3))}`, c3.json);
  // a merge whose resolution adds a row: no commit's patch shows it (the scan reads --no-merges), so it is named at its line in the tip's file
  git(ar, ['checkout', '-q', '--detach', B0]);
  const S1 = commit(ar, { 'side.txt': 'side\n' }, 'S1: a side line');
  git(ar, ['checkout', '-q', '--detach', B7]);
  git(ar, ['merge', '-q', '--no-ff', '--no-commit', S1]);
  const M = commit(ar, { [AF]: file(['# the release\'s rows', GAMMA2, '# a comment', '', 'row-alpha', 'row-beta', BYMERGE]) }, 'M: a merge that adds a row');
  const c4 = cli(ar, [`--range=${B0}..${M}`, '--json', '--quiet']);
  ok(git(ar, ['rev-list', '--parents', '-n', '1', M]).split(' ').length === 3 && JSON.stringify(rows(c4)) === JSON.stringify([...want, `${AF}:7@none`].sort()),
    `a row a MERGE brought (no commit's patch adds it) is named at its line in the tip's file, with no commit (the kit's scan check blames such a line): ${JSON.stringify(rows(c4))}`, c4.json);
  // a lone tip (a first publication: no base, no remote-tracking ref) is not judged by the census, and that is said
  const c5 = cli(ar, [`--range=${B7}`, '--json']);
  ok(c5.status === 0 && rows(c5).length === 0 && verdictOf(/the allow-row census \(B-ecc4\) needs the range's base: a lone tip/.test(c5.out)),
    `a lone tip is not judged by the census and the scan says so («${(c5.out.match(/the allow-row census[^\n]*/) || [''])[0].slice(0, 110)}») (rc ${c5.status})`, c5.out);
  // PURE: what a row is
  ok(JSON.stringify(S.allowRowsOf('# c\n\n  x  \ny\n')) === '["x","y"]' && S.allowRowsAdded(`\x01c1\ndiff --git a/${AF} b/${AF}\n--- a/${AF}\n+++ b/${AF}\n@@ -0,0 +3,2 @@\n+keep\n+fresh\n`, new Set(['keep'])).map((a) => `${a.commit}:${a.line}:${a.row}`).join() === 'c1:4:fresh'
    && S.allowRowsAdded(`\x01c1\ndiff --git a/x/${AF} b/x/${AF}\n--- a/x/${AF}\n+++ b/x/${AF}\n@@ -0,0 +1 @@\n+fresh\n`).length === 0,
    'PURE allowRowsAdded: a row the floor holds is not new; the new row is at its new line, by its commit; a file named like it below the root is not the allow file (the scanner reads the root\'s)');
  // RED CONTROL: the scanner with the census cut out answers the same range CLEAN — the census is what names the rows
  const cutAt = path.join(ROOT, 'secret-scan.nocensus.mjs');
  fs.writeFileSync(cutAt, anchored(scanSrc, 'const census = allowRowCensus(cwd, m ? m[1] : null, tip, logText);', 'const census = { findings: [], note: null };', 'test-secret-scan ⑧ nocensus'));
  const cut = cli(ar, [`--range=${B0}..${B7}`, '--json', '--quiet'], cutAt);
  ok(cut.status === 0 && cut.json.length === 0 && c1.status === 1,
    `RED CONTROL: the scanner with the census cut out says CLEAN over B0..B7 (rc ${cut.status}) where the shipped one names ${rows(c1).length} row(s) (rc ${c1.status}) — the gate's scan was this blind before part 1`, cut.out);
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
