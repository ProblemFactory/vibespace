#!/usr/bin/env node
// VENDOR-CALL WHITELIST GUARD (docs/design-three-tier.md §Quota refresh origin:
// "the safety law is a WHITELIST … a guard test enforces the whitelist
// structurally"). §ban-safety is the one law whose violation gets accounts
// BANNED (real Max ban, refunded, 2.60.0 postmortem) — so which code may
// construct a request to Anthropic is pinned HERE, not by discipline.
//
// Contract:
//  1. The ONLY files that construct an HTTP request to an Anthropic endpoint
//     are the allowlisted ones, with their exact construction counts.
//  2. Each allowlisted site keeps its GATES (opt-in setting / human-gate
//     setting / 429 backoff) — deleting a gate fails this test even though
//     the call site itself is unchanged.
//  3. The device daemon (source AND built bundle) contains ZERO vendor
//     endpoints: no device op may originate a vendor call. When the
//     human-gated quota-refresh op moves device-side, it gets allowlisted
//     HERE deliberately, with its own gate asserts — that is the point.
//  4. The shipped usage tools (statusline capture + remote scanner) import no
//     network primitives at all: purely passive by construction.
// Adding a vendor call ANYWHERE else fails this test until it is explicitly
// allowlisted with its gates. That is the desired friction.
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const VENDOR = /api\.anthropic\.com|platform\.claude\.com|console\.anthropic\.com|claude\.ai\/|anthropic-beta/;
const REQUESTY = /https?\.request\s*\(|\bfetch\s*\(|axios|got\s*\(/;

// ── collect every server-side JS file (the browser bundle never holds tokens) ──
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.git', 'public', 'docs', 'lib'].includes(e.name)) continue; // src/lib = browser
      walk(p);
    } else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
  }
};
walk(path.join(REPO, 'src'));
files.push(path.join(REPO, 'server.js'));
for (const f of fs.readdirSync(path.join(REPO, 'data', 'bin'))) {
  if (/\.(js|mjs)$/.test(f) || !f.includes('.')) {
    const p = path.join(REPO, 'data', 'bin', f);
    try { if (fs.statSync(p).isFile()) files.push(p); } catch { }
  }
}

// ── 1+2: request constructions near a vendor string, per file ──
// A "construction" = a vendor endpoint within ±4 lines of a request primitive.
const constructions = {}; // rel → count
for (const f of files) {
  let text; try { text = fs.readFileSync(f, 'utf-8'); } catch { continue; }
  const rel = path.relative(REPO, f);
  if (rel.startsWith('data/bin/vibespace-agentd')) continue; // asserted separately below
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!VENDOR.test(lines[i])) continue;
    const lo = Math.max(0, i - 4), hi = Math.min(lines.length, i + 5);
    const ctx = lines.slice(lo, hi).join('\n');
    if (REQUESTY.test(ctx)) constructions[rel] = (constructions[rel] || 0) + 1;
  }
}

const ALLOW = {
  // _fetchOAuthUsage (oauth/usage) + _fetchOAuthRoles (claude_cli/roles):
  // each URL line + its anthropic-beta header line sit inside one https.request
  // context window; counts pin the shape, not exact line numbers.
  'src/usage-routes.js': { max: 6, gates: ['usagePollingEnabled', '_rateLimitBackoffUntil', "onDemandQuotaRefresh"] },
  // refreshAvailableModels' v1/models fetch (both auth types)
  'server.js': { max: 4, gates: ['usagePollingEnabled'] },
};
for (const [rel, n] of Object.entries(constructions)) {
  const a = ALLOW[rel];
  ok(!!a, `vendor request construction only in allowlisted files (found in ${rel}${a ? '' : ' — NOT ALLOWLISTED'})`);
  if (a) ok(n <= a.max, `${rel}: construction count ${n} ≤ ${a.max} (a NEW vendor call site must be allowlisted here with its gates)`);
}
for (const [rel, a] of Object.entries(ALLOW)) {
  ok(constructions[rel] > 0, `${rel} still holds its allowlisted vendor call (moved/renamed ⇒ update the allowlist)`);
  const text = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  for (const g of a.gates) ok(text.includes(g), `${rel} keeps gate marker '${g}' (§ban-safety gate deleted?)`);
}

// ── 3: the device daemon may NEVER hold a vendor endpoint ──
for (const rel of ['src/agentd/agentd.js', 'src/agentd/client.js', 'src/agentd/ws-min.js', 'src/agentd/mux.js']) {
  const text = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  ok(!VENDOR.test(text), `${rel}: zero vendor endpoints (no device op may originate a vendor call)`);
}
// the BUILT bundle too (it embeds shared src/ modules — a vendor call leaking
// in through a require graph edge is exactly what this catches)
for (const b of ['data/bin/vibespace-agentd.js', 'data/bin/vibespace-agentd-attach.js']) {
  try {
    const text = fs.readFileSync(path.join(REPO, b), 'utf-8');
    ok(!/api\.anthropic\.com|platform\.claude\.com|oauth\/usage/.test(text), `${b}: built bundle carries zero vendor endpoints`);
  } catch { ok(true, `${b} not built here (gitignored artifact) — source files asserted above`); }
}

// ── 4: shipped usage tools are passive by construction ──
// vibespace-usage legitimately requires child_process — it PASSES THROUGH the
// user's own statusline command (by design); the passivity contract for it is
// "no network primitive + no vendor endpoint". The scanner allows neither.
{
  const u = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage'), 'utf-8');
  ok(!/require\(['"](https?|net|tls|dgram)['"]\)/.test(u) && !/\bfetch\s*\(/.test(u) && !VENDOR.test(u),
    'data/bin/vibespace-usage: no network primitive, no vendor endpoint (statusline passthrough via child_process is the one sanctioned spawn)');
  const sc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage-scan'), 'utf-8');
  ok(!/require\(['"](https?|net|tls|dgram|child_process)['"]\)/.test(sc) && !/\bfetch\s*\(/.test(sc),
    'data/bin/vibespace-usage-scan: imports no network primitive at all (purely passive)');
}

// ── 5: the CLI-native quota channel stays write-to-STDIN (first-party call) ──
const adapter = fs.readFileSync(path.join(REPO, 'src/adapters/claude-code.js'), 'utf-8');
ok(/get_usage/.test(adapter) && !VENDOR.test(adapter), 'claude-code adapter: get_usage rides the CLI control channel, never a direct vendor call');

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
