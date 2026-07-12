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
 * Input: file paths as args, OR unified-diff / text on stdin (only ADDED lines
 * — those starting with "+" — are scanned when the input looks like a diff).
 * Allowlist: --allow <file> (regex or literal per line) suppresses matches; a
 * repo may also carry `.repo-guard-allow`.
 *
 * Exit 1 if any non-allowlisted finding, else 0. Prints findings to stderr.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = { company: false, allow: [], files: [], stdin: false, quiet: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--company') opt.company = true;
  else if (a === '--stdin') opt.stdin = true;
  else if (a === '--quiet') opt.quiet = true;
  else if (a === '--allow') opt.allow.push(args[++i]);
  else opt.files.push(a);
}

// ── generic rules (public-safe) ──
const GENERIC = [
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/, d: 'private key block' },
  { id: 'anthropic-key', re: /\bsk-ant-[a-zA-Z0-9_-]{20,}/, d: 'Anthropic API key' },
  { id: 'openai-key', re: /\bsk-(?:proj-)?[a-zA-Z0-9]{20,}\b/, d: 'OpenAI-style key' },
  { id: 'clerk-secret', re: /\bsk_(?:live|test)_[a-zA-Z0-9]{20,}/, d: 'Clerk/Stripe SECRET key' },
  { id: 'stripe-live', re: /\b(?:rk|sk)_live_[a-zA-Z0-9]{20,}/, d: 'Stripe live key' },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/, d: 'GitHub token' },
  { id: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}/, d: 'GitLab token' },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, d: 'Slack token' },
  { id: 'aws-akid', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, d: 'AWS access key id' },
  { id: 'google-api', re: /\bAIza[0-9A-Za-z_-]{35}\b/, d: 'Google API key' },
  { id: 'cephx-key', re: /\bAQ[A-Za-z0-9+/]{20,}={0,2}\b/, d: 'cephx key' },
  { id: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, d: 'JWT' },
  { id: 'mongo-uri', re: /\bmongodb(?:\+srv)?:\/\/[^\s:@/]+:[^\s:@/]+@/, d: 'MongoDB URI with credentials' },
  { id: 'pg-uri', re: /\b(?:postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@/, d: 'DB/queue URI with password' },
  { id: 'generic-secret-assign', re: /(?:password|passwd|secret|api[_-]?key|token|access[_-]?key|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9+/_\-]{16,}["']?/i, d: 'secret-looking assignment', entropyGate: true },
  { id: 'basic-auth-url', re: /https?:\/\/[^\s:@/]+:[^\s:@/]{6,}@/, d: 'URL with inline credentials' },
];
// literals that make generic-secret-assign a false positive (placeholders)
const PLACEHOLDER = /(YOUR[_-]|EXAMPLE|PLACEHOLDER|CHANGE[_-]?ME|xxxx+|<[^>]+>|\.\.\.|redacted|dummy|sample|test[_-]?key|\bnull\b|\bnone\b|undefined|process\.env|import\.meta)/i;

function shannon(s) {
  const m = {}; for (const c of s) m[c] = (m[c] || 0) + 1;
  let h = 0; for (const k in m) { const p = m[k] / s.length; h -= p * Math.log2(p); }
  return h;
}

// ── external layers ──
function loadLines(p) { try { return fs.readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')); } catch { return []; } }
const companyRules = [];
if (opt.company && process.env.REPO_GUARD_COMPANY) {
  for (const line of loadLines(process.env.REPO_GUARD_COMPANY)) {
    try { companyRules.push({ id: 'company', re: new RegExp(line, 'i'), d: 'organization-specific identifier' }); } catch {}
  }
}
const credSecrets = [];
if (process.env.REPO_GUARD_CREDS) {
  for (const line of loadLines(process.env.REPO_GUARD_CREDS)) {
    const v = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
    if (v.length >= 6 && !PLACEHOLDER.test(v)) credSecrets.push(v);
  }
}
const allowRes = [];
const allowFiles = [...opt.allow];
if (fs.existsSync('.repo-guard-allow')) allowFiles.push('.repo-guard-allow');
for (const af of allowFiles) for (const line of loadLines(af)) { try { allowRes.push(new RegExp(line)); } catch { allowRes.push(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); } }
const allowed = (s) => allowRes.some((r) => r.test(s));

// ── scan ──
const findings = [];
function scanText(text, label) {
  const looksDiff = /^(diff --git|@@ |\+\+\+ |--- )/m.test(text);
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    let line = raw;
    if (looksDiff) { if (!raw.startsWith('+') || raw.startsWith('+++')) return; line = raw.slice(1); }
    const rules = [...GENERIC, ...companyRules];
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const hit = m[0];
      if (rule.entropyGate) { const tail = (hit.split(/[:=]/).pop() || '').replace(/["'\s]/g, ''); if (PLACEHOLDER.test(line) || shannon(tail) < 3.2) continue; }
      if (allowed(line) || allowed(hit)) continue;
      findings.push({ rule: rule.id, d: rule.d, label, line: i + 1, snippet: redact(hit) });
    }
    for (const sec of credSecrets) {
      if (line.includes(sec)) { if (allowed(line)) continue; findings.push({ rule: 'live-credential', d: 'a live value from the credentials store', label, line: i + 1, snippet: redact(sec) }); }
    }
  });
}
function redact(s) { if (s.length <= 10) return s.slice(0, 3) + '…'; return s.slice(0, 6) + '…' + s.slice(-3) + ` (${s.length} chars)`; }

let input = '';
if (opt.stdin || opt.files.length === 0) { try { input = fs.readFileSync(0, 'utf8'); } catch {} if (input) scanText(input, '<stdin>'); }
for (const f of opt.files) { try { scanText(fs.readFileSync(f, 'utf8'), f); } catch {} }

if (findings.length) {
  const out = process.stderr;
  out.write(`\n\x1b[31m✖ secret-scan: ${findings.length} potential secret/sensitive match(es)\x1b[0m\n`);
  for (const f of findings.slice(0, 40)) out.write(`  \x1b[33m${f.rule}\x1b[0m ${f.label}:${f.line}  ${f.d} → ${f.snippet}\n`);
  if (findings.length > 40) out.write(`  … and ${findings.length - 40} more\n`);
  out.write(`\nIf a match is a false positive, add a line to \x1b[36m.repo-guard-allow\x1b[0m (regex or literal).\n`);
  process.exit(1);
}
if (!opt.quiet) process.stderr.write('\x1b[32m✓ secret-scan clean\x1b[0m\n');
process.exit(0);
