#!/usr/bin/env node
// THE EGRESS CENSUS (docs/design-communication-panel.zh.md §3.1 fence 1; P1a).
//
// §ban-safety's guard (scripts/test-vendor-whitelist.mjs) is scoped to
// Anthropic, so Lark's and Gmail's HTTP never trips it — which is exactly why
// this feature brings its OWN census, written in that suite's shape: an
// ALLOWLIST WITH REASONS, never an absolute ban. The rule:
//
//   Every outbound request constructed anywhere in the server-side tree
//   either targets a host the ADAPTER THAT CONSTRUCTS IT declares
//   (`module.exports.EGRESS` of a file under src/channels/), or hits a
//   `(file, host)` allowlist entry with an explicit reason. A dead allowlist
//   entry fails the suite too ("still holds the call it was allowlisted for —
//   moved/renamed ⇒ update the allowlist").
//
// "Constructs a request" is decided per FILE — a file that holds a request
// primitive (`fetch(` / `http(s).request(` / `http(s).get(` / axios / got /
// undici) — and every `https?://<host>` literal in that file's CODE (whole-line
// comments blanked) is one of its egress claims. Vendor hosts are defined as
// constants far from the `fetch` that uses them (src/gmail-sync.js's
// `TOKEN_URL` is the design's own example), so a ±N-line proximity window —
// the Anthropic guard's shape — would miss most of what this census exists
// for; the vendor guard keeps its shape because it censuses a STRING, this one
// censuses HOSTS. A channel adapter's literals are checked in BOTH directions
// whether or not the file holds a primitive today (an adapter that names a
// host it never uses is a declaration nobody can trust).
//
// Seeded at birth (the design's words) with the two files that already
// constructed these very hosts before the adapters existed — a gate that is
// red on its first commit gets relaxed by the first person who hits it, and a
// relaxed gate protects nothing. The census still catches its reason for
// being: a THIRD vendor host arriving with no decision.
//
// The file list is `git ls-files` through the ONE sanitized git env
// (scripts/git-env.mjs): the tree also holds product-written runtime
// artefacts (a 64 MB rclone under data/bin) and this census reads SOURCE.
// When git cannot answer for this tree the census SKIPS with git's own words,
// never fails (an export/tarball is not an offender).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { gitEnvFrom } from './git-env.mjs';
const require = createRequire(import.meta.url);

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

// ── THE RULE, as a function over injected inputs (the controls drive it over
//    synthetic files; the census drives it over the tree) ──────────────────
const PRIMITIVE = /https?\.request\s*\(|https?\.get\s*\(|\bfetch\s*\(|\baxios\b|\bgot\s*\(|\bundici\b/;
const HOST = /https?:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)(?=[/:'"`?#\s)\]]|$)/gi;
/** Hosts that are never egress: loopback is not a vendor, and the RFC 2606
 *  reserved names + schema hosts are documentation, not targets. */
const EXEMPT = (h) => /(^|\.)example\.(com|org|net)$|^(www\.)?w3\.org$|^schema\.org$|(^|\.)example$|^localhost$|^\d{1,3}(\.\d{1,3}){3}$/.test(h);
const blankComments = (text) => text.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l)).join('\n');
const hostsOf = (text) => { const out = new Set(); let m; HOST.lastIndex = 0; while ((m = HOST.exec(text))) { const h = m[1].toLowerCase(); if (!EXEMPT(h)) out.add(h); } return out; };

/**
 * @param files  [{rel, text, egress?: string[]|null}] — `egress` is the
 *               adapter's own declaration for src/channels/<kind>.js, null
 *               for every other file
 * @param allow  { 'rel|host': reason }
 * @returns { rows, offenders, deadAllow, undeclared, deadDeclared }
 */
function census(files, allow) {
  const rows = [];
  const offenders = [];      // (file, host) constructed with no decision
  const undeclared = [];     // an adapter literal outside its EGRESS
  const deadDeclared = [];   // an EGRESS entry no literal in the file matches
  const used = new Set();
  for (const f of files) {
    const code = blankComments(f.text);
    const primitive = PRIMITIVE.test(code);
    const hosts = hostsOf(code);
    const isAdapter = Array.isArray(f.egress);
    rows.push({ rel: f.rel, primitive, hosts: [...hosts].sort(), adapter: isAdapter });
    if (isAdapter) {
      const declared = new Set(f.egress.map((h) => String(h).toLowerCase()));
      for (const h of hosts) if (!declared.has(h)) undeclared.push({ rel: f.rel, host: h });
      for (const h of declared) if (!hosts.has(h)) deadDeclared.push({ rel: f.rel, host: h });
      continue;
    }
    if (!primitive) continue;   // a literal in a file that makes no request is not egress
    for (const h of hosts) {
      const k = `${f.rel}|${h}`;
      if (allow[k]) used.add(k); else offenders.push({ rel: f.rel, host: h });
    }
  }
  const deadAllow = Object.keys(allow).filter((k) => !used.has(k));
  return { rows, offenders, undeclared, deadDeclared, deadAllow };
}

// ── THE ALLOWLIST: (file, host) → the reason this request is a decision ──
// Seeded at birth with the two files §3.1 names (gmail-sync, mounts) and with
// every other construction the tree held when the census was born, each with
// its reason. A NEW pair fails the suite until it is added HERE with one.
const ALLOW = {
  // ── the two seeds §3.1 names ──
  'src/gmail-sync.js|oauth2.googleapis.com': 'Gmail-as-a-folder mount (2.134.0): the OAuth code exchange + refresh for the read-only mail sync, under the user\'s own consent — the ORIGINAL of oauth-loopback\'s ephemeral mode',
  'src/gmail-sync.js|accounts.google.com': 'the consent page the loopback flow opens for the Gmail mount',
  'src/gmail-sync.js|www.googleapis.com': 'the `gmail.readonly` SCOPE identifier — a host literal in a file that makes requests, not a request target',
  'src/gmail-sync.js|gmail.googleapis.com': 'the Gmail API (history.list / messages.get) the read-only sync polls under the user\'s consent, 404-tolerant, cursor advanced only after a complete pass',
  'src/mounts.js|downloads.rclone.org': 'the one-click rclone install (pinned version into data/bin) — a human\'s click, boot self-heal of a missing binary',
  'src/mounts.js|graph.microsoft.com': 'the native OneDrive mount\'s Microsoft Graph base (global cloud), under the user\'s consent',
  'src/mounts.js|graph.microsoft.us': 'the native OneDrive mount\'s Microsoft Graph base (US Government cloud)',
  'src/mounts.js|graph.microsoft.de': 'the native OneDrive mount\'s Microsoft Graph base (Germany cloud)',
  'src/mounts.js|microsoftgraph.chinacloudapi.cn': 'the native OneDrive mount\'s Microsoft Graph base (China cloud)',
  // ── every other construction the tree held when the census was born ──
  'src/server/cli-env.js|api.anthropic.com': '§ban-safety: the guarded models fetch — its GATES are pinned by scripts/test-vendor-whitelist.mjs; this row only records that the host is a known decision',
  'src/usage-routes.js|api.anthropic.com': '§ban-safety: the opt-in / human-gated usage reads — GATES pinned by scripts/test-vendor-whitelist.mjs',
  'src/plugins.js|pkgs.tailscale.com': 'the tailscale plugin\'s install download (release index + binary) — a human\'s Install click',
  'src/plugins.js|github.com': 'the frp plugin\'s pinned release tarball download — a human\'s Install click',
  'src/plugins.js|opencode.ai': 'a help URL inside an error message ("install OpenCode first"), not a request target — the census over-includes on purpose and this row classifies it',
  'src/server/plugin-install.js|api.github.com': 'plugin install from a GitHub release (the release lookup) — a human\'s Install action, consent per package',
  'src/server/ops-routes.js|raw.githubusercontent.com': 'the update check (the public repo\'s package.json + CHANGELOG) behind ⚙ → Update VibeSpace — a human\'s click',
  'src/server/mounts-plugins-wiring.js|nodejs.org': 'the node runtime tarball relayed to a paired device that cannot reach nodejs.org itself (corporate egress) — an operator\'s pairing action',
  'data/bin/vibespace-exit|ifconfig.me': 'a help-text EXAMPLE the agent runs by hand through a borrowed exit (`curl https://ifconfig.me`); the tool\'s own fetch targets the VibeSpace API only',
};

// ── 1. the tree ───────────────────────────────────────────────────────────
console.log('§1 the egress census over the server-side tree');
let files = null, skipWhy = null;
try {
  const env = gitEnvFrom(process.env);
  const out = execFileSync('git', ['-C', REPO, 'ls-files', '-z', '--', 'src', 'server.js', 'data/bin'], { env, encoding: 'utf-8', maxBuffer: 16 << 20 });
  files = out.split('\0').filter(Boolean);
} catch (e) { skipWhy = `git ls-files failed: ${(e && e.stderr && String(e.stderr).trim()) || (e && e.message) || e}`; }
if (!files) {
  console.log(`  … SKIP: ${skipWhy} — the census reads the SOURCE list and this tree has none to read (export/tarball, or git not on PATH)`);
} else {
  const wanted = files.filter((rel) => !rel.startsWith('src/lib/')                  // browser code never holds a token
    && !/^data\/bin\/vibespace-agentd(-attach)?\.js$/.test(rel)                      // built bundles — their source is src/agentd
    && (/\.(js|mjs)$/.test(rel) || (/^data\/bin\/[^/.]+$/.test(rel))));              // JS, or an extensionless data/bin tool
  const input = [];
  for (const rel of wanted) {
    let text; try { text = fs.readFileSync(path.join(REPO, rel), 'utf-8'); } catch { continue; }   // tracked but deleted
    let egress = null;
    // An adapter's LIVE lane (src/channels/live/<kind>.js, P1b) constructs its own
    // requests (the Gmail Pub/Sub pull) and declares its own EGRESS the same way;
    // the lane CORE (lane.js) constructs none and declares none.
    if (/^src\/channels\/(live\/)?[^/]+\.js$/.test(rel) && !/\/(index|fake|lane)\.js$/.test(rel)) {
      const mod = require(path.join(REPO, rel));
      egress = Array.isArray(mod.EGRESS) ? mod.EGRESS : [];
      // A lane whose transport is a vendor SDK (live/lark.js) constructs no
      // request itself: an EMPTY declaration is honest there, and the census
      // still holds it to it (a literal that appears later is undeclared).
      const constructs = PRIMITIVE.test(blankComments(text));
      ok(Array.isArray(mod.EGRESS) && (mod.EGRESS.length > 0 || !constructs), `${rel} declares ${constructs ? 'a non-empty' : 'its'} EGRESS (${constructs ? 'an adapter that constructs requests names its hosts' : 'it constructs no request of its own, so an empty declaration is the truth'})`);
    }
    input.push({ rel, text, egress });
  }
  const r = census(input, ALLOW);
  const egressFiles = r.rows.filter((x) => x.primitive || x.adapter);
  console.log(`  … ${input.length} files walked; ${egressFiles.length} construct requests:`);
  for (const x of egressFiles) console.log(`     ${x.adapter ? '[adapter] ' : ''}${x.rel}: ${x.hosts.length ? x.hosts.join(', ') : '(no vendor host literal)'}`);
  ok(input.some((f) => f.rel === 'src/channels/lark.js') && input.some((f) => f.rel === 'src/channels/gmail.js') && input.some((f) => f.rel === 'src/channels/live/gmail.js' && Array.isArray(f.egress)) && input.some((f) => f.rel === 'src/gmail-sync.js') && input.some((f) => f.rel === 'src/mounts.js') && input.some((f) => f.rel === 'server.js'),
    'SCOPE: the walk really covers the two adapters, the Gmail push lane (judged as an adapter), the two seeded files and server.js (a census that can pass vacuously is not a census)');
  ok(r.undeclared.length === 0, `every host a channel adapter constructs a request to is in its own EGRESS (${r.undeclared.length} undeclared)`, r.undeclared.map((x) => `${x.rel} → ${x.host}`).join('\n    '));
  ok(r.deadDeclared.length === 0, `every EGRESS entry is a host the adapter really names (${r.deadDeclared.length} dead declarations)`, r.deadDeclared.map((x) => `${x.rel} declares ${x.host} but never names it`).join('\n    '));
  ok(r.offenders.length === 0, `every other outbound request targets an allowlisted (file, host) WITH a reason (${r.offenders.length} undecided)`,
    r.offenders.map((x) => `${x.rel} → ${x.host}   ⇒ add ALLOW['${x.rel}|${x.host}'] = '<why this request is a decision>'`).join('\n    '));
  ok(r.deadAllow.length === 0, `no dead allowlist entry (${r.deadAllow.length}) — a file that stopped constructing its allowlisted request must lose its row`, r.deadAllow.join('\n    '));
  // The two seeds §3.1 names are still the reason the allowlist is not a ban.
  ok(Object.keys(ALLOW).some((k) => k.startsWith('src/gmail-sync.js|')) && Object.keys(ALLOW).some((k) => k.startsWith('src/mounts.js|')),
    'the allowlist was seeded at birth with src/gmail-sync.js and src/mounts.js (§3.1: an absolute ban would have been red on its first commit)');
  // A channel adapter's hosts and gmail-sync's overlap ON PURPOSE (the same
  // Google endpoints, two consumers); the census must see both, not collapse them.
  const gm = r.rows.find((x) => x.rel === 'src/channels/gmail.js'), gs = r.rows.find((x) => x.rel === 'src/gmail-sync.js');
  ok(gm && gs && gm.hosts.some((h) => gs.hosts.includes(h)), 'the Gmail adapter and gmail-sync name the same vendor hosts and each is judged by its own rule (adapter: EGRESS; gmail-sync: the allowlist)');
}

// ── 2. CONTROLS over synthetic files — the rule's own edges ──────────────
console.log('§2 controls: the rule over synthetic files');
{
  const mk = (rel, text, egress = null) => ({ rel, text, egress });
  const r1 = census([mk('src/x.js', "const u = 'https://vendor.test/api';\nawait fetch(u);\n")], {});
  ok(r1.offenders.length === 1 && r1.offenders[0].host === 'vendor.test', 'POSITIVE: a host literal in a file with a request primitive is an undecided egress');
  const r2 = census([mk('src/x.js', "const u = 'https://vendor.test/api';\nawait fetch(u);\n")], { 'src/x.js|vendor.test': 'reason' });
  ok(r2.offenders.length === 0 && r2.deadAllow.length === 0, 'an allowlisted (file, host) with a reason is a decision');
  const r3 = census([mk('src/x.js', "const u = 'https://vendor.test/api';\n")], {});
  ok(r3.offenders.length === 0 && r3.rows[0].primitive === false, 'NEGATIVE: a host literal in a file that makes NO request is not egress');
  const r4 = census([mk('src/x.js', "// see https://vendor.test/docs\nawait fetch(url);\n")], {});
  ok(r4.offenders.length === 0, 'NEGATIVE: a host behind a whole-line // comment is prose (a census reads CODE)');
  const r5 = census([mk('src/x.js', "await fetch('http://127.0.0.1:3456/x');\nawait fetch('https://api.example.com/y');\n")], {});
  ok(r5.offenders.length === 0, 'NEGATIVE: loopback and RFC 2606 example hosts are never egress');
  const r6 = census([mk('src/x.js', "await fetch('https://vendor.test/api');\n")], { 'src/x.js|vendor.test': 'r', 'src/gone.js|old.vendor.test': 'moved away' });
  ok(r6.deadAllow.length === 1 && r6.deadAllow[0] === 'src/gone.js|old.vendor.test', 'a dead allowlist entry is reported (moved/renamed ⇒ update the allowlist)');
  const r7 = census([mk('src/channels/v.js', "const A = 'https://a.vendor.test/x';\nawait fetch(A);\n", ['b.vendor.test'])], {});
  ok(r7.undeclared.length === 1 && r7.undeclared[0].host === 'a.vendor.test' && r7.deadDeclared.length === 1 && r7.deadDeclared[0].host === 'b.vendor.test' && r7.offenders.length === 0,
    'an ADAPTER is judged by its own EGRESS in both directions — an undeclared literal AND a declaration nothing uses — never by the allowlist');
  const r8 = census([mk('src/channels/v.js', "const A = 'https://a.vendor.test/x';\n", ['a.vendor.test'])], {});
  ok(r8.undeclared.length === 0 && r8.deadDeclared.length === 0, "an adapter's literals are checked whether or not the file holds a primitive today (the declaration must be trustworthy before the first fetch lands)");
  const r9 = census([mk('src/x.js', "const u = `https://${host}/api`;\nawait fetch(u);\n")], {});
  ok(r9.offenders.length === 0, 'BOUNDARY, stated: a host held in a VARIABLE is invisible to a literal census — the adapter contract (fence 3, in-process fetch) and review carry that case');
  ok(PRIMITIVE.test("https.request({") && PRIMITIVE.test("await fetch(") && PRIMITIVE.test("import got from 'got'; got(") && !PRIMITIVE.test("fetchJson(") && !PRIMITIVE.test("prefetch("),
    'the primitive detector matches the request shapes and not fetchJson/prefetch');
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
