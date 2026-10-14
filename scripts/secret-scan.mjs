#!/usr/bin/env node
/**
 * secret-scan — a dependency-free secret / sensitive-content scanner.
 *
 * SAFE TO PUBLISH: this file embeds only GENERIC secret rules (private keys,
 * cloud/API tokens, connection strings, high-entropy blobs). Any ORGANIZATION-
 * specific patterns and live secret values are loaded at runtime from EXTERNAL
 * files that are never committed here:
 *   REPO_GUARD_COMPANY  — path to a private denylist (one regex per line, # comments)
 *   REPO_GUARD_CREDS    — path to a KEY=VALUE file; each VALUE (≥6 chars) is guarded verbatim
 * Company rules are applied only with --company (the pre-push hook passes it
 * when the push destination is a PUBLIC remote). On CI for a public repo those
 * env vars are unset, so it runs generic-only.
 *
 * THE ONE TABLE (B-89da, 2026-10-13): `RULES` below is the only pattern table. The pre-push hook
 * (scripts/git-hooks/pre-push, `--range`), the fast tier (scripts/ci.mjs, `--tree`) and the Actions workflow
 * (.github/workflows/secret-scan.yml, `--tree`) all run THIS file; test-secret-scan holds the three callers to it.
 * `partner: true` rows are a SUPERSET of the GitHub push-protection partner patterns this repo can hit, at the
 * vendor's documented length where there is one. GitHub never reads `.repo-guard-allow`, so no allow row silences
 * a partner row here either: fix the text — build a token-shaped fixture AT RUNTIME by concatenation, split inside
 * the vendor prefix (`['xo', 'xb-…'].join('')`). 2.369.263's first cut was refused by GitHub (GH013) for a literal
 * Slack-token fixture that both local scans had MATCHED and then dropped, because an allow row
 * (`BEGIN [A-Z ]*PRIVATE KEY`) matched ANOTHER part of the same line. So an allow row now suppresses only a finding
 * it overlaps (or matches itself) — and since partner rows never consult it, the allowlist cannot allow itself
 * (a partner literal written INTO .repo-guard-allow is a finding there too).
 *
 * Input: file paths as args; OR unified-diff / text on stdin (only ADDED lines — those starting with "+" — are
 * scanned when the input looks like a diff, reported as <file>:<new line>); OR
 *   --tree               every tracked file (git ls-files; cwd = the repo)
 *   --range=<a>..<b>     what a push publishes: every commit's added lines (git log -p) + the combined diff, AND
 *   --range=<b>          the full text at <b> of every file the range touches (a lone <b> = what no
 *                        remote-tracking ref has yet)
 * Allowlist: --allow <file> (regex or literal per line) suppresses non-partner matches; a repo may also carry
 * `.repo-guard-allow`. --json prints the findings on stdout.
 *
 * Exit 0 clean · 1 a non-allowlisted finding (printed to stderr) · 2 could not scan (a git error — never "clean").
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ── THE ONE TABLE ──
// partner rows: GitHub push protection refuses these shapes whatever our allowlist says, so it cannot silence them
export const RULES = [
  { id: 'slack-token', partner: true, re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, d: 'Slack bot / user / legacy token' },
  { id: 'slack-config-token', partner: true, re: /\bxoxe[.-][A-Za-z0-9.+/=_-]{10,}/, d: 'Slack app configuration / refresh token' },
  { id: 'slack-app-token', partner: true, re: /\bxapp-\d-[A-Za-z0-9-]{10,}/, d: 'Slack app-level token' },
  { id: 'slack-webhook', partner: true, re: /\bhooks\.slack\.com\/(?:services|workflows|triggers)\/T[A-Z0-9]{6,}\/(?:[A-Za-z0-9_-]+\/){1,2}[A-Za-z0-9_-]{16,}/, d: 'Slack webhook URL' },
  { id: 'github-token', partner: true, re: /\bgh[pousr]_[A-Za-z0-9]{36}/, d: 'GitHub token (ghp_ / gho_ / ghu_ / ghs_ / ghr_)' },
  { id: 'github-pat', partner: true, re: /\bgithub_pat_[A-Za-z0-9_]{82}/, d: 'GitHub fine-grained personal access token' },
  { id: 'gitlab-token', partner: true, re: /\bglpat-[A-Za-z0-9_-]{20}/, d: 'GitLab personal access token' },
  { id: 'anthropic-key', partner: true, re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, d: 'Anthropic API key / OAuth token' },
  { id: 'openai-key', partner: true, re: /\bsk-(?:(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|[A-Za-z0-9]{20,})/, d: 'OpenAI API key' },
  { id: 'google-api-key', partner: true, re: /\bAIza[0-9A-Za-z_-]{35}/, d: 'Google API key' },
  { id: 'google-oauth-secret', partner: true, re: /\bGOCSPX-[A-Za-z0-9_-]{28}/, d: 'Google OAuth client secret' },
  { id: 'google-oauth-token', partner: true, re: /\bya29\.[A-Za-z0-9_-]{20,}/, d: 'Google OAuth access token' },
  { id: 'aws-akid', partner: true, re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, d: 'AWS access key id' },
  { id: 'aws-secret', partner: true, re: /aws.{0,24}?(?:secret|sk)[A-Za-z0-9_.-]{0,24}?["']?\s*[:=]\s*["']?[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/i, d: 'AWS secret access key (assigned)' },
  { id: 'stripe-key', partner: true, re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/, d: 'Stripe / Clerk secret or restricted key' },
  { id: 'twilio-api-key', partner: true, re: /\bSK[0-9a-fA-F]{32}\b/, d: 'Twilio API key' },
  { id: 'sendgrid-key', partner: true, re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/, d: 'SendGrid API key' },
  { id: 'npm-token', partner: true, re: /\bnpm_[A-Za-z0-9]{36}/, d: 'npm access token' },
  { id: 'pypi-token', partner: true, re: /\bpypi-AgE[A-Za-z0-9_-]{50,}/, d: 'PyPI API token' },
  { id: 'huggingface-token', partner: true, re: /\bhf_[A-Za-z0-9]{34}/, d: 'Hugging Face access token' },
  // judged over the line AND the next one (a PEM header, then its key material)
  { id: 'private-key-block', partner: true, window: 2, re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----(?:\\[rn]|\s)*[A-Za-z0-9+/=]{40,}/, d: 'private key block (header + key material)' },
  // generic + this repo's own — an allow row that OVERLAPS the finding suppresses it
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/, d: 'private key header' },
  { id: 'cephx-key', re: /\bAQ[A-Za-z0-9+/]{20,}={0,2}\b/, d: 'cephx key' },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, d: 'JWT' },
  { id: 'mongo-uri', re: /\bmongodb(?:\+srv)?:\/\/[^\s:@/]+:[^\s:@/]+@/, d: 'MongoDB URI with credentials' },
  { id: 'pg-uri', re: /\b(?:postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@/, d: 'DB/queue URI with password' },
  { id: 'generic-secret-assign', re: /(?:password|passwd|secret|api[_-]?key|token|access[_-]?key|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/_\-]{16,}["']?/i, d: 'secret-looking assignment', entropyGate: true },
  // lane webhook-l1-server: a webhook caller's token (src/pairing-token.js kind `webhook`) — minted here, shown once
  { id: 'vibespace-webhook-token', re: /\bvswh_[0-9a-f]{48}\b/, d: 'VibeSpace webhook caller token' },
  // lane webhook-l3-cli-pair: an instance pairing code (src/webhook-pair.js) — base64url JSON that CARRIES a vswh_ token
  { id: 'vibespace-webhook-pair-code', re: /\bvswp_[A-Za-z0-9_-]{40,2048}/, d: 'VibeSpace webhook pairing code' },
  { id: 'basic-auth-url', re: /https?:\/\/[^\s:@/]+:[^\s:@/]{6,}@/, d: 'URL with inline credentials' },
];
// literals that make generic-secret-assign a false positive (placeholders)
const PLACEHOLDER = /(YOUR[_-]|EXAMPLE|PLACEHOLDER|CHANGE[_-]?ME|xxxx+|<[^>]+>|\.\.\.|redacted|dummy|sample|test[_-]?key|\bnull\b|\bnone\b|undefined|process\.env|import\.meta)/i;
export const ALLOW_FILE = '.repo-guard-allow';
// the rule every partner refusal prints — GitHub refuses the shape, so the fix is the text, never an allow row
export const FIXTURE_RULE = 'build token shapes at runtime by concatenation, split inside the vendor prefix: [\'xo\', \'xb-…\'].join(\'\')';

function shannon(s) {
  const m = {}; for (const c of s) m[c] = (m[c] || 0) + 1;
  let h = 0; for (const k in m) { const p = m[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

// ── external layers ──
function loadLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')); } catch { return []; } }
function companyRulesFrom(file) {
  const out = [];
  for (const line of loadLines(file)) { try { out.push({ id: 'company', re: new RegExp(line, 'i'), d: 'organization-specific identifier' }); } catch {} }
  return out;
}
function credSecretsFrom(file) {
  const out = [];
  for (const line of loadLines(file)) {
    const v = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    if (v.length >= 6 && !PLACEHOLDER.test(v)) out.push(v);
  }
  return out;
}
export function allowRulesFrom(files) {
  const out = [];
  for (const af of files) for (const line of loadLines(af)) { try { out.push(new RegExp(line)); } catch { out.push(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); } }
  return out;
}
// an allow row suppresses a finding when it matches the hit itself, or matches the line OVERLAPPING the hit's span
// (never because it matched somewhere else on the line — the rel263 miss)
export function allowedAt(allow, line, start, end, hit) {
  for (const r of allow) {
    if (r.test(hit)) return true;
    const g = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g');
    for (const m of line.matchAll(g)) { if (m[0].length && m.index < end && m.index + m[0].length > start) return true; }
  }
  return false;
}
function redact(s) { if (s.length <= 10) return s.slice(0, 3) + '…'; return s.slice(0, 6) + '…' + s.slice(-3) + ` (${s.length} chars)`; }

const GLOBAL = new WeakMap();
const globalOf = (re) => { let g = GLOBAL.get(re); if (!g) GLOBAL.set(re, g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')); return g; };

/**
 * Judge ONE line (`next` = the line after it, for window rows): per rule, the first match no allow row overlaps
 * (every match is tried — an allowed fixture must not hide a second shape of the same rule on its line). Partner
 * rows never consult the allowlist. Returns findings without file / line.
 */
export function judgeLine(line, { next = '', rules = RULES, allow = [], creds = [] } = {}) {
  const out = [];
  for (const rule of rules) {
    const subject = rule.window === 2 && next ? line + '\n' + next : line;
    if (!rule.re.test(subject)) continue;
    for (const m of subject.matchAll(globalOf(rule.re))) {
      if (m.index >= line.length) break;
      const hit = m[0];
      if (rule.entropyGate) { const tail = (hit.split(/[:=]/).pop() || '').replace(/["'\s]/g, ''); if (PLACEHOLDER.test(line) || shannon(tail) < 3.2) continue; }
      if (!rule.partner && allowedAt(allow, line, m.index, m.index + hit.length, hit)) continue;
      out.push({ rule: rule.id, partner: !!rule.partner, d: rule.d, snippet: redact(hit.split('\n')[0]) });
      break;
    }
  }
  for (const sec of creds) {
    const at = line.indexOf(sec);
    if (at < 0) continue;
    if (allowedAt(allow, line, at, at + sec.length, sec)) continue;
    out.push({ rule: 'live-credential', partner: false, d: 'a live value from the credentials store', snippet: redact(sec) });
  }
  return out;
}

const looksDiff = (text) => /^(diff --git|@@ |\+\+\+ |--- )/m.test(text);
function unquotePath(p) {
  if (!p.startsWith('"')) return p;
  try { return JSON.parse(p); } catch { return p.slice(1, -1); }
}

/**
 * Scan a text. A unified diff (or `git log -p` output with `\x01<sha>` commit lines) ⇒ only its ADDED lines, each
 * reported at its file and NEW line number (and commit); `opts.touched` (a Set) collects the files it names. Anything
 * else — or `opts.plain` — ⇒ every line, reported as `label`:<line>.
 */
export function scanText(text, label, opts = {}) {
  const findings = [];
  const lines = text.split('\n');
  if (opts.plain || !looksDiff(text)) {
    lines.forEach((raw, i) => {
      for (const f of judgeLine(raw, { ...opts, next: lines[i + 1] || '' })) findings.push({ ...f, file: label, line: i + 1 });
    });
    return findings;
  }
  let file = label, commit = null, newLine = 0, inHeader = false, gitHeaders = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.startsWith('\x01')) { commit = raw.slice(1).trim() || null; file = label; inHeader = false; continue; }
    if (raw.startsWith('diff --git ')) { gitHeaders = inHeader = true; file = label; continue; }
    if (!inHeader && !gitHeaders && raw.startsWith('--- ') && (lines[i + 1] || '').startsWith('+++ ')) { inHeader = true; continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) { newLine = Number(h[1]); inHeader = false; continue; }
    if (inHeader) {
      if (raw.startsWith('+++ ')) { const p = unquotePath(raw.slice(4).trim()); file = p === '/dev/null' ? label : p.replace(/^b\//, ''); if (p !== '/dev/null' && opts.touched) opts.touched.add(file); }
      continue;
    }
    if (raw.startsWith('+')) {
      const nx = lines[i + 1] && (lines[i + 1][0] === '+' || lines[i + 1][0] === ' ') ? lines[i + 1].slice(1) : '';
      for (const f of judgeLine(raw.slice(1), { ...opts, next: nx })) findings.push({ ...f, file, line: newLine, commit });
      newLine++;
    } else if (raw.startsWith(' ')) newLine++;
  }
  return findings;
}

function gitBuf(cwd, args, input) {
  const r = spawnSync('git', args, { cwd, input, maxBuffer: 1 << 30 });
  if (r.status !== 0) { const e = new Error(`git ${args.slice(0, 3).join(' ')} exited ${r.status}: ${String(r.stderr || '').trim().split('\n')[0]}`); e.code = 'GIT'; throw e; }
  return r.stdout;
}
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

/** Every tracked file's full text (the working tree's copy), one process. */
export function scanTree({ cwd = process.cwd(), ...opts } = {}) {
  const files = gitBuf(cwd, ['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
  const findings = [];
  for (const f of files) {
    let buf; try { const p = path.join(cwd, f); if (fs.lstatSync(p).isSymbolicLink()) continue; buf = fs.readFileSync(p); } catch { continue; }
    if (isBinary(buf)) continue;
    findings.push(...scanText(buf.toString('utf8'), f, { ...opts, plain: true }));
  }
  return { findings, files: files.length };
}

/** Blobs at <rev>:<path> for many paths in one `git cat-file --batch`. */
function blobsAt(cwd, rev, paths) {
  if (!paths.length) return new Map();
  const out = gitBuf(cwd, ['cat-file', '--batch'], paths.map((p) => `${rev}:${p}`).join('\n') + '\n');
  const map = new Map();
  let at = 0;
  for (const p of paths) {
    const nl = out.indexOf(10, at);
    if (nl < 0) break;
    const head = out.subarray(at, nl).toString('utf8');
    at = nl + 1;
    const m = /^[0-9a-f]+ (\w+) (\d+)$/.exec(head);
    if (!m) continue; // "<rev>:<path> missing" — deleted at the tip, or not a blob
    const size = Number(m[2]);
    if (m[1] === 'blob') map.set(p, out.subarray(at, at + size));
    at += size + 1;
  }
  return map;
}

/**
 * What a push publishes: `a..b` (an existing ref) or a lone `b` (a new branch — what no remote-tracking ref has).
 * Every commit's added lines + the combined diff + the full text at the tip of every file the range touches. A base
 * this checkout never fetched falls back to the lone-tip reading (said in `note`); an unknown tip is a git error.
 */
export function scanRange(range, { cwd = process.cwd(), ...opts } = {}) {
  let m = /^([^\s.]+)\.\.([^\s.]+)$/.exec(String(range || '').trim());
  const tip = m ? m[2] : String(range || '').trim();
  const gitErr = (msg) => Object.assign(new Error(msg), { code: 'GIT' });
  if (!tip) throw gitErr('an empty --range names nothing to scan');
  const has = (rev) => spawnSync('git', ['cat-file', '-e', `${rev}^{commit}`], { cwd }).status === 0;
  if (!has(tip)) throw gitErr(`the range's tip ${tip} is not a commit in this repository`);
  let note = null;
  if (m && !has(m[1])) { note = `the range's base ${m[1].slice(0, 12)} is not in this checkout (a remote sha never fetched) — scanning what no remote-tracking ref has instead`; m = null; }
  const diffFlags = ['--no-color', '--no-ext-diff', '--no-textconv', '-U0'];
  const sel = m ? [`${m[1]}..${m[2]}`] : [tip, '--not', '--remotes'];
  const touched = new Set();
  const findings = scanText(gitBuf(cwd, ['log', '-p', '--no-merges', '--format=%x01%H', ...diffFlags, ...sel]).toString('utf8'), '<range>', { ...opts, touched });
  if (m) findings.push(...scanText(gitBuf(cwd, ['diff', ...diffFlags, m[1], m[2]]).toString('utf8'), '<range>', { ...opts, touched }));
  const blobs = blobsAt(cwd, tip, [...touched]);
  for (const [p, buf] of blobs) if (!isBinary(buf)) findings.push(...scanText(buf.toString('utf8'), p, { ...opts, plain: true }));
  return { findings: dedupe(findings), files: touched.size, note };
}

// one finding per file:line:rule — the full-text copy (no commit) wins over a commit's added line
function dedupe(findings) {
  const by = new Map();
  for (const f of findings) {
    const k = `${f.file}:${f.line}:${f.rule}`;
    const had = by.get(k);
    if (!had || (had.commit && !f.commit)) by.set(k, f);
  }
  return [...by.values()];
}

export function formatFindings(findings) {
  const lines = [`\n\x1b[31m✖ secret-scan: ${findings.length} potential secret/sensitive match(es)\x1b[0m`];
  for (const f of findings.slice(0, 40)) lines.push(`  \x1b[33m${f.rule}\x1b[0m ${f.file}:${f.line}${f.commit ? ` (commit ${f.commit.slice(0, 9)})` : ''}  ${f.d} → ${f.snippet}`);
  if (findings.length > 40) lines.push(`  … and ${findings.length - 40} more`);
  if (findings.some((f) => f.partner)) lines.push(`\nA \x1b[33mpartner\x1b[0m shape is what GitHub push protection refuses (GH013), and ${ALLOW_FILE} cannot allow it — ${FIXTURE_RULE}.`);
  if (findings.some((f) => !f.partner)) lines.push(`\nIf a non-partner match is a false positive, add a line to \x1b[36m${ALLOW_FILE}\x1b[0m (regex or literal) that matches the finding itself.`);
  return lines.join('\n') + '\n';
}

function main(argv) {
  const opt = { company: false, allow: [], files: [], stdin: false, quiet: false, json: false, tree: false, range: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--company') opt.company = true;
    else if (a === '--stdin') opt.stdin = true;
    else if (a === '--quiet') opt.quiet = true;
    else if (a === '--json') opt.json = true;
    else if (a === '--tree') opt.tree = true;
    else if (a === '--allow') opt.allow.push(argv[++i]);
    else if (a === '--range') opt.range = argv[++i] || '';
    else if (a.startsWith('--range=')) opt.range = a.slice('--range='.length);
    else opt.files.push(a);
  }
  const rules = [...RULES, ...(opt.company && process.env.REPO_GUARD_COMPANY ? companyRulesFrom(process.env.REPO_GUARD_COMPANY) : [])];
  const creds = process.env.REPO_GUARD_CREDS ? credSecretsFrom(process.env.REPO_GUARD_CREDS) : [];
  const allow = allowRulesFrom([...opt.allow, ...(fs.existsSync(ALLOW_FILE) ? [ALLOW_FILE] : [])]);
  const o = { rules, creds, allow };
  let findings = [];
  try {
    if (opt.tree) findings.push(...scanTree(o).findings);
    if (opt.range != null) { const r = scanRange(opt.range, o); if (r.note) process.stderr.write(`secret-scan: ${r.note}\n`); findings.push(...r.findings); }
    if (!opt.tree && opt.range == null) {
      if (opt.stdin || opt.files.length === 0) { let input = ''; try { input = fs.readFileSync(0, 'utf8'); } catch {} if (input) findings.push(...scanText(input, '<stdin>', o)); }
      for (const f of opt.files) { try { findings.push(...scanText(fs.readFileSync(f, 'utf8'), f, o)); } catch {} }
    }
  } catch (e) {
    if (e.code !== 'GIT') throw e;
    process.stderr.write(`\x1b[31m✖ secret-scan could not scan: ${e.message}\x1b[0m — NOT a clean verdict\n`);
    return 2;
  }
  if (opt.json) process.stdout.write(JSON.stringify(findings) + '\n');
  if (findings.length) { process.stderr.write(formatFindings(findings)); return 1; }
  if (!opt.quiet) process.stderr.write('\x1b[32m✓ secret-scan clean\x1b[0m\n');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
