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
//  7. (R3, 2026-09-26) A CHANNEL PICTURE's bytes — the one vendor request a
//     WINDOW can cause — are fetched ON DEMAND, CACHE-FIRST and BUDGET-CHARGED:
//     a census of the engine's order, with four ungated copies as controls.
// Adding a vendor call ANYWHERE else fails this test until it is explicitly
// allowlisted with its gates. That is the desired friction.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { engineSource } from './channels-engine-src.mjs';   // lane dc-channels-seams: the engine + its three family files as one text
const require = createRequire(import.meta.url);

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };

const VENDOR = /api\.anthropic\.com|platform\.claude\.com|console\.anthropic\.com|claude\.ai\/|anthropic-beta/;
// The CONSTRUCTION census also counts OpenAI hosts (dc-pool-quota verify r1): the codex live quota read moved into
// src/harnesses/codex-quota.js and rides the official client's app-server — a raw fetch to ChatGPT/OpenAI beside it
// was invisible here. Only the census widens: whole-file VENDOR reads (permission-rules' comments name chatgpt.com) keep theirs
const CONSTRUCT_HOSTS = new RegExp(VENDOR.source + '|chatgpt\\.com|openai\\.com');
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
    if (!CONSTRUCT_HOSTS.test(lines[i])) continue;
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
  // refreshAvailableModels' v1/models fetch (both auth types) — lived in
  // server.js until the 2.325.0 decomposition moved the CLI environment out
  'src/server/cli-env.js': { max: 4, gates: ['usagePollingEnabled'] },
};
for (const [rel, n] of Object.entries(constructions)) {
  const a = ALLOW[rel];
  ok(!!a, `vendor request construction only in allowlisted files (found in ${rel}${a ? '' : ' — NOT ALLOWLISTED'})`);
  if (a) ok(n <= a.max, `${rel}: construction count ${n} ≤ ${a.max} (a NEW vendor call site must be allowlisted here with its gates)`);
}
// CONTROL: a raw vendor fetch planted beside the codex live read (quota.readLive) is a construction in a file outside
// the rows — the census counts it, so the allowlist check above would go red
{
  const constructionsIn = (text) => { const L = text.split('\n'); let n = 0; for (let i = 0; i < L.length; i++) if (CONSTRUCT_HOSTS.test(L[i]) && REQUESTY.test(L.slice(Math.max(0, i - 4), i + 5).join('\n'))) n++; return n; };
  const cq = fs.readFileSync(path.join(REPO, 'src/harnesses/codex-quota.js'), 'utf-8');
  const planted = cq.replace('function settleLive(', "async function peekUsage() { return fetch('https://chatgpt.com/backend-api/wham/usage'); }\nfunction settleLive(");
  ok(!ALLOW['src/harnesses/codex-quota.js'] && constructionsIn(cq) === 0 && planted !== cq && constructionsIn(planted) === 1, 'CONTROL: a raw ChatGPT fetch planted beside the codex live read is a construction outside the allowlist (RED)', String(constructionsIn(planted)));
}
for (const [rel, a] of Object.entries(ALLOW)) {
  ok(constructions[rel] > 0, `${rel} still holds its allowlisted vendor call (moved/renamed ⇒ update the allowlist)`);
  const text = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  for (const g of a.gates) ok(text.includes(g), `${rel} keeps gate marker '${g}' (§ban-safety gate deleted?)`);
}

// ── 3: the device protocol's vendor surface is EXACTLY the quota-refresh op ──
// (design §Quota refresh origin: "the ONLY device op that may reach the
// vendor API is the human-gated, throttled read-only quota query"). agentd.js
// holds that one op WITH its gates; every other daemon file stays at zero.
{
  const text = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf-8');
  const hits = (text.match(/api\.anthropic\.com/g) || []).length;
  ok(hits === 1, `src/agentd/agentd.js: exactly ONE vendor host literal (the quota-refresh op; found ${hits})`);
  for (const g of ["humanGated !== true", '_quotaAt', 'never refreshes']) {
    ok(text.includes(g), `agentd quota-refresh keeps gate marker '${g}'`);
  }
  ok(!/oauth\/token|platform\.claude\.com/.test(text), 'agentd never touches the token-refresh endpoint (read-only peek only)');
}
for (const rel of ['src/agentd/client.js', 'src/agentd/ws-min.js', 'src/agentd/mux.js']) {
  const text = fs.readFileSync(path.join(REPO, rel), 'utf-8');
  ok(!VENDOR.test(text), `${rel}: zero vendor endpoints`);
}
// bundle: carries the same single op (minified) — gate property names survive
for (const b of ['data/bin/vibespace-agentd.js']) {
  try {
    const text = fs.readFileSync(path.join(REPO, b), 'utf-8');
    ok((text.match(/api\.anthropic\.com/g) || []).length <= 2 && text.includes('humanGated'),
      `${b}: bundle vendor surface = the gated quota-refresh op only`);
  } catch { ok(true, `${b} not built here — source asserted above`); }
}
try {
  const att = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-agentd-attach.js'), 'utf-8');
  ok(!/api\.anthropic\.com|oauth\/usage/.test(att), 'attach-cli bundle carries zero vendor endpoints');
} catch { ok(true, 'attach bundle not built here'); }

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

// ── 5b: THE /usage PANEL PROBE MAKES ITS ONE VENDOR CALL AND NO OTHER (B-9b40) ──
// claude 2.1.288 print mode loads the account's claude.ai connectors unless the MCP config is strict
// (`headlessSyncsClaudeAiConnectors: !strictConfig && …`): before this every auto-cli probe listed them
// and opened the mcp-proxy for each (production: five mcp-logs-claude-ai-* dirs per member, one file per probe).
{
  const { PANEL_PROBE_ARGS } = require(path.join(REPO, 'src/usage-routes.js'));
  ok(Array.isArray(PANEL_PROBE_ARGS) && PANEL_PROBE_ARGS.includes('--strict-mcp-config') && !PANEL_PROBE_ARGS.some((a) => /^--mcp-config/.test(a)),
    'B-9b40: the auto-cli /usage probe loads NO MCP server (--strict-mcp-config, no --mcp-config)', JSON.stringify(PANEL_PROBE_ARGS));
  ok(Array.isArray(PANEL_PROBE_ARGS) && PANEL_PROBE_ARGS[0] === '-p' && PANEL_PROBE_ARGS[1] === '/usage' && PANEL_PROBE_ARGS.length === 3, 'B-9b40: …and asks for /usage and nothing else');
  const ur = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf-8');
  ok((ur.match(/execFile\(bin, \[\.\.\.PANEL_PROBE_ARGS\]/g) || []).length === 1 && !/'-p', '\/usage'/.test(ur.replace(/const PANEL_PROBE_ARGS = [^\n]*/, '')),
    'B-9b40: the probe spawns exactly PANEL_PROBE_ARGS — no second spelling of the argv');
}

// ── 6: LOCAL ORACLES (owner ruling 6 of docs/design-harness-features.md §5.1) ──
// "用（逐条附「不发 vendor 请求」证据进白名单豁免；人触发/已有节拍）", with §4.2's
// hard gate: the zero-network property must be MEASURED per command, never
// inferred from the shape of the CLI. Two halves:
//   (a) STRUCTURAL — every shipped oracle carries a proof whose every measured
//       run is 0 INET connects; every measured-and-REJECTED candidate carries
//       its counts and its verdict and can never appear as a shipped oracle;
//       the runner can only spawn registry argv and holds no vendor endpoint.
//   (b) LIVE — when strace + the CLI are present, RE-MEASURE each shipped
//       oracle here and fail on any AF_INET/AF_INET6 connect. A NEGATIVE
//       CONTROL (a deliberate loopback connect) proves the detector can see
//       one, so a green run is never vacuous.
// The REJECTED candidates are deliberately NOT re-run: they reach
// api.anthropic.com by construction, and a suite that runs on every push is
// exactly the "on a timer" shape §ban-safety forbids. Their numbers are the
// hand-measurement recorded in src/local-oracles.js with tool + date + version.
{
  const { ORACLES, NOT_ORACLES, PROOF_KEYS, oracle, rejected, blockedCapability, blockingRejectionsFor } = require(path.join(REPO, 'src/local-oracles.js'));
  const runner = fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf-8');
  // "IN-PROCESS" is load-bearing (round-2 verifier). This assert reads the
  // file's own text, so it can only ever speak about requests this MODULE
  // constructs — it says nothing about what a child it spawns does, and the
  // first cut of this module spawned `codex app-server`, which connects to
  // chatgpt.com. The companion assert below is the one that covers children.
  ok(!VENDOR.test(runner) && !REQUESTY.test(runner.split('\n').filter((l) => VENDOR.test(l)).join('\n')),
    'src/server/permission-rules.js (the oracle runner + rule reader) constructs NO vendor request IN-PROCESS');
  ok(/spawn\(cmd, o\.argv\.slice\(\)/.test(runner),
    'the oracle runner spawns the REGISTRY\'s frozen argv — a caller cannot supply its own command');
  // …AND that is the ONLY child it starts. A file that may spawn a vendor CLI
  // needs every such spawn to come from the measured registry, because the
  // registry is the thing that cannot accept an entry without a proof. A
  // second `spawn(` here is exactly how a 7-connect app-server child shipped
  // under a menu advertising "no network requests (measured)".
  {
    // count CODE spawns only: the comments above the runner quote the call on
    // purpose (they explain why it is the only one), and a census that counts
    // its own documentation is a census that gets silenced by rewording it.
    const code = runner.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const spawns = (code.match(/\bspawn\s*\(/g) || []).length;
    ok(spawns === 1, `src/server/permission-rules.js starts exactly ONE kind of child — the registry oracle (found ${spawns} spawn call(s) in code; a new one must go through src/local-oracles.js, which needs a measurement)`);
    // the counter must be able to SEE a second one, or the 1 above is luck
    ok(((code + '\n  const x = spawn(other, []);').match(/\bspawn\s*\(/g) || []).length === 2,
      'NEGATIVE CONTROL: the spawn census counts a second call when one is present (so "exactly one" is a measurement)');
    ok(!/'app-server'/.test(runner) && !/"app-server"/.test(runner),
      'src/server/permission-rules.js starts no `codex app-server` child: measured 2026-09-07 at 7 INET connects incl. chatgpt.com:443 with an EMPTY CODEX_HOME, so the codex INSTANCE scope is not offered at all');
  }
  // A rejection that claims to explain a missing capability must actually
  // match a caps row that is OFF. Otherwise the note is decoration and the
  // connecting path is live again — the exact regression this round fixes.
  {
    const { capsOf } = require(path.join(REPO, 'src/backend-caps.js'));
    const dig = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    const blocking = NOT_ORACLES.filter((r) => r.blocks);
    ok(blocking.length > 0, `at least one rejection explains a switched-off capability (${blocking.map((r) => r.blocks).join(', ') || 'none'})`);
    for (const r of blocking) {
      const [backend, ...rest] = r.blocks.split('.');
      const capPath = rest.join('.');
      const live = dig(capsOf(backend), capPath);
      ok(live === false, `${r.id}: the capability it blocks (${r.blocks}) is really OFF — re-enabling it needs a NEW measurement, not just a caps edit (found ${JSON.stringify(live)})`);
      ok(blockedCapability(backend, capPath) === r, `${r.id}: is reachable through blockedCapability('${backend}', '${capPath}') — the server's refusal and the menu's note read the SAME record`);
      ok(blockingRejectionsFor(backend).includes(r), `${r.id}: appears in blockingRejectionsFor('${backend}') so the menu shows it EVEN THOUGH ${backend} has shipped oracles (a missing button must be explained)`);
    }
    // the client mirror must agree, or the chrome offers a door the server refuses
    const meta = fs.readFileSync(path.join(REPO, 'src/lib/agent-meta.js'), 'utf-8');
    ok(/permissionRules: \{ source: 'config-read', session: true, instance: false, liveVerb: true \}/.test(meta),
      'src/lib/agent-meta.js mirrors codex permissionRules.instance:false (a client that still offered the row would fetch a refusal)');
  }
  ok(!/setInterval|setTimeout\([^)]*runOracle/.test(runner) && /app\.post\('\/api\/local-oracle/.test(runner),
    'an oracle runs ONLY on a POST (a button): nothing schedules one, and the route is not a pre-fetchable GET');
  ok(ORACLES.length > 0, `at least one measured-clean oracle ships (${ORACLES.map((o) => o.id).join(', ') || 'none'})`);
  const rejectedIds = new Set(NOT_ORACLES.map((o) => o.id));
  for (const o of ORACLES) {
    ok(PROOF_KEYS.every((k) => o.proof && o.proof[k] != null) && Array.isArray(o.proof.runs) && o.proof.runs.length > 0,
      `oracle ${o.id}: carries a proof (tool + date + CLI version + at least one measured run)`);
    ok(o.proof.runs.every((r) => r.inetConnects === 0),
      `oracle ${o.id}: EVERY recorded run measured ZERO INET connects (${o.proof.runs.map((r) => `${r.what}=${r.inetConnects}`).join('; ')})`);
    ok(!rejectedIds.has(o.id), `oracle ${o.id}: is not also on the rejected list`);
    // program-use billing law: an oracle is a READ, never an inference channel
    ok(!o.argv.some((a) => /^(-p|--print|exec|--json-schema|--output-schema|-o)$/.test(a)),
      `oracle ${o.id}: argv carries no print/exec/inference flag (${o.argv.join(' ')})`);
  }
  for (const r of NOT_ORACLES) {
    ok(r.measured && r.measured.inetConnects > 0 && typeof r.verdict === 'string' && r.verdict.length > 20,
      `rejected candidate ${r.id}: keeps its measurement (${r.measured?.inetConnects} INET connects) and the reason it is not offered`);
    ok(!oracle(r.id) && !!rejected(r.id), `rejected candidate ${r.id}: cannot be looked up as a shipped oracle`);
  }
  ok(NOT_ORACLES.some((r) => r.id === 'claude-auth-status') && NOT_ORACLES.some((r) => r.id === 'claude-agents-list') && NOT_ORACLES.some((r) => r.id === 'codex-doctor'),
    'the three candidates the design proposed (claude auth status / claude agents / codex doctor) are all recorded as MEASURED AND REJECTED — the negative control that keeps them out');
  ok(!ORACLES.some((o) => o.backend === 'claude'),
    'no claude oracle ships: every measured claude subcommand reached api.anthropic.com, including with every traffic-suppressing env set');
  // THE OTHER app-server SPAWN IN THE REPO (round-2 verifier, same root cause).
  // src/codex-thread-read.js is shipped B-21e4 code whose behaviour this round
  // deliberately does NOT change — but it carried the same unmeasured "no
  // network of ours" claim, and a false comment is how the next reader ships
  // the same mistake. The measurement now lives in it; this assert keeps it
  // there. (An UNMEASURED reassurance is worse than none: it is the sentence
  // someone will cite as the precedent.)
  {
    const ctr = fs.readFileSync(path.join(REPO, 'src/codex-thread-read.js'), 'utf-8');
    ok(!/no\s+network\s+of\s+ours/.test(ctr),
      'src/codex-thread-read.js no longer claims its `codex app-server` child makes no network calls (measured: it connects to chatgpt.com even logged out)');
    ok(/strace/.test(ctr) && /chatgpt\.com/.test(ctr) && /B-af31/.test(ctr),
      'src/codex-thread-read.js records the measurement + the tool + the backlog id that owns the §ban-safety decision, instead of a reassurance nobody checked');
  }

  // ── (b) the live re-measurement ──
  const has = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'pipe' }); return true; } catch { return false; } };
  const cmdPath = (bin) => { try { return execFileSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf-8' }).trim(); } catch { return ''; } };
  const straceOk = has('strace');
  if (!straceOk) {
    ok(true, 'SKIP live re-measurement: strace is not on PATH (`command -v strace` found nothing) — the recorded proofs above stand alone');
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oracle-'));
    const ENVBASE = { HOME: tmp, PATH: process.env.PATH || '/usr/bin:/bin', TERM: 'dumb' };
    /** Run one command under strace and count INET connects. AF_UNIX and
     *  AF_NETLINK are NOT network (every process does those). */
    const inetConnects = (bin, argv, timeoutMs = 60000) => {
      const out = path.join(tmp, 'trace-' + Math.random().toString(36).slice(2));
      let timedOut = false;
      try {
        execFileSync('strace', ['-f', '-qq', '-e', 'trace=network', '-o', out, bin, ...argv],
          { env: ENVBASE, stdio: 'ignore', timeout: timeoutMs });
      } catch (e) {
        // a non-zero exit is fine: the TRACE is the measurement — but only a
        // trace of a command that EXITED (B-5f0b): a timeout kill is partial
        if (e && (e.code === 'ETIMEDOUT' || (e.signal && e.status === null))) timedOut = true;
      }
      if (timedOut) { try { fs.unlinkSync(out); } catch { } return { timedOut: true, timeoutMs }; }
      let text = ''; try { text = fs.readFileSync(out, 'utf-8'); } catch { return null; }
      const lines = text.split('\n').filter((l) => /\bconnect\(/.test(l) && /AF_INET6?/.test(l));
      return { n: lines.length, sample: lines.slice(0, 2).join(' | ') };
    };
    // NEGATIVE CONTROL FIRST: a deliberate LOOPBACK connect must be seen, or a
    // green measurement below means nothing. Loopback, never a vendor — the
    // rejected candidates stay un-run precisely because re-running them WOULD
    // be the call this law forbids.
    const ctl = inetConnects(process.execPath, ['-e', "const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>process.exit(0));setTimeout(()=>process.exit(0),300)"]);
    ok(ctl && ctl.n >= 1, `NEGATIVE CONTROL: the detector sees a deliberate loopback connect (${ctl?.n} INET connect lines) — a zero below is a measurement, not a blind spot`);
    // THE TERMINAL SIGNAL (B-5f0b): a trace is a measurement only once the
    // traced command EXITED. A run the 60 s timeout killed on a loaded box
    // holds whatever had been traced by then, and its "zero" is vacuous.
    // Driven deterministically: a loopback connect AFTER a 1.5 s wait, under a
    // 400 ms budget — the trace ends before the connect ever happens.
    const cut = inetConnects(process.execPath, ['-e', "setTimeout(()=>{const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>process.exit(0))},1500)"], 400);
    ok(cut && cut.timedOut === true, `TERMINAL SIGNAL: a trace the timeout cut short is reported as timedOut, never as a zero-connect measurement (${JSON.stringify(cut)})`);
    for (const o of ORACLES) {
      const bin = cmdPath(o.backend === 'codex' ? 'codex' : o.backend);
      if (!bin) { ok(true, `SKIP live re-measurement of ${o.id}: ${o.backend} is not installed here (\`command -v ${o.backend}\` found nothing)`); continue; }
      const got = inetConnects(bin, o.argv.slice());
      if (got?.timedOut) { ok(true, `SKIP live re-measurement of ${o.id}: ${o.backend} ${o.argv.join(' ')} did not exit within ${got.timeoutMs} ms on this machine — a trace cut short is not a zero (B-5f0b)`); continue; }
      ok(got && got.n === 0, `LIVE: ${o.id} (${o.backend} ${o.argv.join(' ')}) opened ZERO INET connections under strace${got && got.n ? ' — got ' + got.n + ': ' + got.sample : ''}`);
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
  }
}

// ── 7: A CHANNEL PICTURE'S BYTES (R3, 2026-09-26 — docs/design-communication-panel.zh.md §23) ──
// The owner: "lark图像不能预览吗？". Showing a Lark / Gmail picture needs ONE more vendor request per
// picture (Lark `messages/:id/resources/:key`, Gmail `attachments.get`) — the only vendor call a WINDOW
// can cause. It is allowlisted HERE deliberately, with its three gates, and the census below is a
// FUNCTION of the source text so an UNGATED copy (scripts/mutant-copy.mjs, never src/) turns it red:
//   ON-DEMAND      the ONLY caller of any adapter's `fetchAttachment` is the engine's `attachment()`,
//                  and the only caller of THAT is the GET attachment route (a thumbnail the window
//                  rendered, a person's click) — ingest, timers and agent routes never fetch bytes;
//   CACHE-FIRST    `attachment()` asks the cache (`store.attachmentGet`) and the PURE verdict first, and
//                  the verdict serves a cached file whatever the budget / back-off / account say;
//   BUDGET-CHARGED the fetch runs only on the verdict's `fetch` — after the back-off and `affordable()` —
//                  through `vendor(rec, e, …)`, where the adapter's meter charges the account's minute.
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  /** THE CENSUS: rows [name, pass, detail] over the engine's + the routes' + every server file's text.
   *  lane channel-attach-read (B-d6b9, design 005 §4): the AGENT's route is the second caller, admitted ONLY behind its
   *  two conditions — the read route's REACH asked first inside attachment() (before the cache: a cached picture of a
   *  conversation the agent may not read is no picture), and the AGENTS' SHARE asked between the verdict's `fetch` and
   *  the one vendor call; the agent route calls it `by: 'agent'` with the caller's principal, never as the owner. */
  const attachmentCensus = (engineSrc, routesSrc, serverTexts) => {
    const rows = [];
    const E = strip(engineSrc);
    const at = E.indexOf('async function attachment(');
    const end = at < 0 ? -1 : E.indexOf('\n  }\n', at);
    const body = at < 0 || end < 0 ? '' : E.slice(at, end);
    const pos = (needle, from = 0) => body.indexOf(needle, from);
    const cache = pos('store.attachmentGet('), v1 = pos('Att.fetchVerdict('), owner = pos('ownerRecordOf('), v2 = v1 < 0 ? -1 : pos('Att.fetchVerdict(', v1 + 1), gate = pos("case 'fetch': break;"), call = pos('.fetchAttachment(');
    rows.push(['the engine\'s attachment() exists and fetches through ONE adapter call', !!body && call > 0 && body.split('.fetchAttachment(').length === 2, `body ${body.length} chars, calls ${body.split('.fetchAttachment(').length - 1}`]);
    rows.push(['CACHE-FIRST: the cache is asked, then the verdict, BEFORE the owner lookup and long before the fetch', cache > 0 && v1 > cache && owner > v1 && call > owner && /Att\.fetchVerdict\(\{ cached: !!hit/.test(body), JSON.stringify({ cache, v1, owner, call })]);
    const facts = v2 > 0 ? body.slice(v2, body.indexOf('});', v2)) : '';
    rows.push(['BUDGET-CHARGED: the fetch verdict is asked the back-off AND the minute\'s budget (`affordable(rec, e)`) and a join', /backoff: inBackoff\(e\)/.test(facts) && /affordable: affordable\(rec, e\)/.test(facts) && /inflight: attInflight\.has\(k\)/.test(facts), facts.slice(0, 240)]);
    rows.push(['…and the fetch runs only on the verdict\'s `fetch` (every other act returns first), charged through vendor(rec, e, …)', gate > v2 && call > gate && /return budgetRefusal\(rec, e\);\s*\n\s*\}/.test(body.slice(v2, call)) && /vendor\(rec, e, \(\) => e\.adapter\.fetchAttachment\(/.test(body), JSON.stringify({ v2, gate, call })]);
    const callers = [];
    for (const [rel, text] of Object.entries(serverTexts)) {
      const code = strip(text);
      const n = (code.match(/\.fetchAttachment\(/g) || []).length;
      if (n) callers.push(`${rel}:${n}`);
    }
    rows.push(['ON-DEMAND: `.fetchAttachment(` is CALLED from exactly one place in the server tree (the engine\'s attachment())', callers.length === 1 && callers[0] === 'src/server/channels-engine.js:1', callers.join(', ')]);
    const R = strip(routesSrc);
    const routeAt = R.indexOf("router.get('/api/channels/:adapterId/:convId/attachment/:id'");
    const routeBody = routeAt < 0 ? '' : R.slice(routeAt, R.indexOf('\n});', routeAt));
    // r-verify (2026-09-26): EVERY `.attachment(` in the server tree counts, whatever its receiver is called
    // (a receiver-name list let a wiring file's `engine.attachment(` through), and inside the engine a bare
    // `attachment(` occurs ONCE — its definition: an ingest that queued `attachment(rec.id, convId, id)` per
    // fresh picture on the next tick was GREEN on the receiver list and on a synchronous runtime count
    const engineCallers = Object.entries(serverTexts).flatMap(([rel, text]) => ((strip(text).match(/\.attachment\(/g) || []).map(() => rel)));
    rows.push(['ON-DEMAND: the engine\'s attachment() is called ONLY by the owner\'s GET attachment route and the agent\'s (every `.attachment(` in the server tree)', /engine\(\)\.attachment\(/.test(routeBody) && engineCallers.slice().sort().join() === 'src/agent-routes.js,src/routes/channels.js', engineCallers.join(', ')]);
    const AR = strip(serverTexts['src/agent-routes.js'] || '');
    const arAt = AR.indexOf("app.get('/api/agent/channels/attachment'");
    const arBody = arAt < 0 ? '' : AR.slice(arAt, AR.indexOf('\n});', arAt));
    rows.push(['AGENT DOOR: the agent\'s route asks it `by: \'agent\'` with the calling session\'s principal (a session token — agentSession — never as the owner)', /const hit = agentSession\(req, res\);/.test(arBody) && /eng\.attachment\(key\.adapterId, key\.convId, att, \{ msg, by: 'agent', principal: channelPrincipal\(s, id\) \}\)/.test(arBody) && (arBody.match(/\.attachment\(/g) || []).length === 1, arBody.slice(0, 200)]);
    const reach = pos("if (agent && !(ctx && ctx.kind === 'agent' && stillSees(ctx, adapterId, convId))) return ACL.notFound();");
    rows.push(['AGENT REACH FIRST: an agent\'s call asks the read route\'s reach (stillSees — the uniform not-found) BEFORE the cache is asked', /const agent = by === 'agent';/.test(body) && reach > 0 && cache > reach, JSON.stringify({ reach, cache })]);
    const share = pos('if (agent) { const sh = agentShareRefusal(rec, e); if (sh) return sh; }');
    rows.push(['AGENT SHARE: an agent\'s fetch asks the agents\' share (agentShareRefusal) after the verdict\'s `fetch` and before the one vendor call, and its charge is the agents\'', share > gate && gate > 0 && call > share && /spendAs\(agent \? 'agent' : 'owner', /.test(body.slice(share, call)), JSON.stringify({ gate, share, call })]);
    const bare = E.match(/(?<![.\w$])attachment\(/g) || [];
    rows.push(['ON-DEMAND: inside the engine `attachment(` is never INVOKED — its definition is the only bare occurrence (no ingest / timer / view prefetches a picture through it)', bare.length === 1 && /async function attachment\(/.test(E), `bare occurrences: ${bare.length}`]);
    return rows;
  };
  const serverTexts = {};
  for (const f of files) { const rel = path.relative(REPO, f); try { serverTexts[rel] = fs.readFileSync(f, 'utf-8'); } catch { } }
  const engineRel = 'src/server/channels-engine.js', routesRel = 'src/routes/channels.js';
  const engineSrc = serverTexts[engineRel], routesSrc = serverTexts[routesRel];
  for (const [name, pass, detail] of attachmentCensus(engineSrc, routesSrc, serverTexts)) ok(pass, `§7 ${name}`, detail);
  // the PURE verdict's table — the gate's own semantics, run (not read)
  const AttSrc = fs.readFileSync(path.join(REPO, 'src/channel-attachments.js'), 'utf-8');
  const verdictTable = (A) => {
    const full = { cached: false, remembered: null, owner: true, fetchable: true, enabled: true, inflight: false, backoff: false, affordable: true };
    return [
      ['a cached file is served even with the budget spent, the vendor backing off and the account disabled', A.fetchVerdict({ ...full, cached: true, affordable: false, backoff: true, enabled: false }).act === 'serve'],
      ['a spent budget is refused `vendor-budget` — never a fetch', A.fetchVerdict({ ...full, affordable: false }).act === 'refuse' && A.fetchVerdict({ ...full, affordable: false }).code === 'vendor-budget'],
      ['the vendor\'s back-off is refused `backoff` — never a fetch', A.fetchVerdict({ ...full, backoff: true }).code === 'backoff'],
      ['a remembered vendor refusal answers with no fetch (the person\'s Retry skips it)', A.fetchVerdict({ ...full, remembered: { code: 'forbidden' } }).act === 'refuse' && A.fetchVerdict({ ...full, remembered: { code: 'forbidden' }, retry: true }).act === 'fetch'],
      ['nothing is fetched before the log named the attachment (`lookup`), nor for an id no record carries', A.fetchVerdict({ cached: false }).act === 'lookup' && A.fetchVerdict({ ...full, owner: false }).code === 'not-found'],
      ['a fetch in flight is JOINED (one charge), a metadata-only adapter is refused', A.fetchVerdict({ ...full, inflight: true }).act === 'join' && A.fetchVerdict({ ...full, fetchable: false }).code === 'not-supported'],
      ['only every gate open answers `fetch`', A.fetchVerdict(full).act === 'fetch'],
    ];
  };
  for (const [name, pass] of verdictTable(require(path.join(REPO, 'src/channel-attachments.js')))) ok(pass, `§7 verdict: ${name}`);
  // lane channel-threads (spec §6.1): a CUSTOM EMOJI's picture is the second picture a window can cause a vendor to
  // serve — the same three gates, read off the engine's `emojiImage()`: ON-DEMAND (`.emojiImage(` called from exactly
  // that function; the engine's function called only by the GET emoji route), CACHE-FIRST (the account's picture
  // cache before anything else), BUDGET-CHARGED (the back-off and the minute's budget before the one metered call)
  const emojiCensus = (engineSrc2, routesSrc2, texts) => {
    const rows = [];
    const E = strip(engineSrc2);
    const at = E.indexOf('async function emojiImage(');
    const end = at < 0 ? -1 : E.indexOf('\n  }\n', at);
    const body = at < 0 || end < 0 ? '' : E.slice(at, end);
    // verify r2 (MONEY): the emoji route follows the attachment's ONE order (PURE Att.fetchVerdict) — the cache, the
    // REMEMBERED refusal, then the verdict asked the back-off (the account's and a picture rate limit) and the budget,
    // the fetch only on its `fetch`
    const cache = body.indexOf('store.attachmentGet('), v1 = body.indexOf('Att.fetchVerdict({ cached: !!hit, remembered })'), v2 = v1 < 0 ? -1 : body.indexOf('Att.fetchVerdict(', v1 + 1), gate = body.indexOf("case 'fetch': break;"), call = body.indexOf('vendor(rec, e, () => e.adapter.emojiImage(');
    const facts = v2 > 0 ? body.slice(v2, body.indexOf('});', v2)) : '';
    rows.push(['EMOJI CACHE-FIRST + BUDGET-CHARGED: emojiImage() asks the cache and the remembered refusal, then ONE verdict with the back-off and the budget, then ONE metered call on its `fetch`', !!body && cache > 0 && v1 > cache && v2 > v1 && gate > v2 && call > gate && /backoff: inBackoff\(e\)/.test(facts) && /affordable: affordable\(rec, e\)/.test(facts) && /inflight: emojiFlights\.has\(fk\)/.test(facts) && /return budgetRefusal\(rec, e\);\s*\n\s*\}/.test(body.slice(v2, call)) && body.split('.emojiImage(').length === 2, JSON.stringify({ cache, v1, v2, gate, call })]);
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) { const n = (strip(text).match(/\.emojiImage\(/g) || []).length; if (n) callers.push(`${rel}:${n}`); }
    const R = strip(routesSrc2);
    const rAt = R.indexOf("router.get('/api/channels/:adapterId/emoji/:key'");
    const rBody = rAt < 0 ? '' : R.slice(rAt, R.indexOf('\n});', rAt));
    rows.push(['EMOJI ON-DEMAND: `.emojiImage(` is called by the engine once (its vendor call) and by the GET emoji route once — nowhere else in the server tree', callers.sort().join() === 'src/routes/channels.js:1,src/server/channels-engine.js:1' && /engine\(\)\.emojiImage\(/.test(rBody), callers.join(', ')]);
    return rows;
  };
  for (const [name, pass, detail] of emojiCensus(engineSrc, routesSrc, serverTexts)) ok(pass, `§7 ${name}`, detail);
  {
    const from = 'inflight: emojiFlights.has(fk), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e) });';
    ok(engineSrc.split(from).length === 2, '§7 CONTROL emoji: the budget fact of emojiImage()\'s verdict is spelled once');
    const mut = engineSrc.replace(from, 'inflight: emojiFlights.has(fk), backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t });');
    const r = emojiCensus(mut, routesSrc, { ...serverTexts, [engineRel]: mut }).filter(([, p]) => !p).map(([n]) => n);
    ok(r.some((n) => /EMOJI CACHE-FIRST \+ BUDGET-CHARGED/.test(n)), `§7 CONTROL: an emojiImage() that skips the budget is RED (${r.join(' | ')})`);
  }
  // §7b lane channel-avatars (B-5fe1, 2026-10-04): A PERSON'S PICTURE — allowlisted HERE deliberately: Lark
  // `contact/v3/users/:id` + the picture host's bytes, Slack `users.info` + avatars.slack-edge.com. ON-DEMAND (the
  // adapters' `avatarImage` called once by the engine, the engine's once by the GET avatar route), MEMO-FIRST (the
  // account's on-disk memo + its remembered refusal before anything), OURS ONLY + BUDGET-CHARGED (the author named by a
  // record of the account, the back-off and the budget, then ONE call through vendor(rec, e, …) — paced inside the adapter).
  const avatarCensus = (engineSrc3, routesSrc3, texts) => {
    const E = strip(engineSrc3);
    const at = E.indexOf('async function avatarImage(');
    const body = at < 0 ? '' : E.slice(at, E.indexOf('\n  }\n', at));
    const p = (x) => body.indexOf(x);
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) { const n = (strip(text).match(/\.avatarImage\(/g) || []).length; if (n) callers.push(`${rel}:${n}`); }
    const R = strip(routesSrc3);
    const rAt = R.indexOf("router.get('/api/channels/avatar'");
    const rBody = rAt < 0 ? '' : R.slice(rAt, R.indexOf('\n});', rAt));
    return [
      ['AVATAR MEMO-FIRST + OURS ONLY + BUDGET-CHARGED: avatarImage() asks the memo and its refusal, then ONE verdict with the owner, the back-off and the budget, then ONE metered call on its `fetch`', !!body && p('store.avatarGet(') > 0 && p('Att.fetchVerdict({ cached: f.cached') > p('store.avatarGet(') && p('owner: authorIsOurs(') > p('Att.fetchVerdict({ cached: f.cached') && p('affordable: affordable(rec, e)') > p('owner: authorIsOurs(') && p("case 'fetch': break;") > p('affordable: affordable(rec, e)') && p('vendor(rec, e, () => e.adapter.avatarImage(') > p("case 'fetch': break;")],
      ['AVATAR ON-DEMAND: `.avatarImage(` is called by the engine once (its vendor call) and by the GET avatar route once — nowhere else in the server tree', callers.sort().join() === 'src/routes/channels.js:1,src/server/channels-engine.js:1' && /engine\(\)\.avatarImage\(/.test(rBody), callers.join(', ')],
    ];
  };
  for (const [name, pass, detail] of avatarCensus(engineSrc, routesSrc, serverTexts)) ok(pass, `§7b ${name}`, detail);
  {
    const from = 'backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e) });\n    switch (v.act) {\n      case \'join\': return avatarFlights';
    ok(engineSrc.split(from).length === 2, '§7b CONTROL avatar: the budget fact of avatarImage()\'s verdict is spelled once');
    const mut = engineSrc.replace(from, from.replace(', affordable: affordable(rec, e)', ''));
    const r = avatarCensus(mut, routesSrc, { ...serverTexts, [engineRel]: mut }).filter(([, q]) => !q).map(([n]) => n);
    ok(r.some((n) => /AVATAR MEMO-FIRST/.test(n)), `§7b CONTROL: an avatarImage() that skips the budget is RED (${r.join(' | ')})`);
    const wf2 = 'src/server/channels-wiring.js';
    const sweep = serverTexts[wf2] + '\nfunction sweepFaces(engine, rows) { for (const r of rows) engine.avatarImage(r.adapterId, r.author).catch(() => {}); }\n';
    const r2 = avatarCensus(engineSrc, routesSrc, { ...serverTexts, [wf2]: sweep }).filter(([, q]) => !q).map(([n]) => n);
    ok(r2.some((n) => /AVATAR ON-DEMAND/.test(n)), `§7b CONTROL: a wiring-file copy that sweeps every author's picture is RED (${r2.join(' | ')})`);
  }
  // THE CONTROLS: ungated copies, written by scripts/mutant-copy.mjs into this run's scratch dir
  const MUT = mutantCopies('vendor-whitelist-att', REPO);
  const reds = (rows) => rows.filter(([, p]) => !p).map(([n]) => n);
  const mutEngine = (label, from, to) => {
    ok(engineSrc.includes(from), `§7 CONTROL ${label}: the edit's anchor is in the engine`);
    const f = MUT.write(engineRel, engineSrc.replace(from, to), label);
    return reds(attachmentCensus(fs.readFileSync(f, 'utf-8'), routesSrc, { ...serverTexts, [engineRel]: fs.readFileSync(f, 'utf-8') }));
  };
  const noBudget = mutEngine('no-budget', 'affordable: affordable(rec, e),', '');
  ok(noBudget.length >= 1 && noBudget.some((n) => /BUDGET-CHARGED/.test(n)), `§7 CONTROL: a copy that drops the budget fact is RED (${noBudget.join(' | ')})`);
  // lane channel-attach-read: the agent caller's two conditions, each removed in a copy — and a route that asks as the owner
  const noReach = mutEngine('agent-no-reach', "if (agent && !(ctx && ctx.kind === 'agent' && stillSees(ctx, adapterId, convId))) return ACL.notFound();", '');
  ok(noReach.some((n) => /AGENT REACH FIRST/.test(n)), `§7 CONTROL: a copy whose agent call skips the reach check is RED (${noReach.join(' | ')})`);
  const noShare = mutEngine('agent-no-share', 'if (agent) { const sh = agentShareRefusal(rec, e); if (sh) return sh; }', '');
  ok(noShare.some((n) => /AGENT SHARE/.test(n)), `§7 CONTROL: a copy whose agent fetch skips the agents' share is RED (${noShare.join(' | ')})`);
  {
    const arRel = 'src/agent-routes.js', from = "{ msg, by: 'agent', principal: channelPrincipal(s, id) }";
    ok(serverTexts[arRel].split(from).length === 2, '§7 CONTROL agent-as-owner: the anchor is spelled once in the agent route');
    const af = MUT.write(arRel, serverTexts[arRel].replace(from, '{ msg }'), 'agent-as-owner');
    const asOwner = reds(attachmentCensus(engineSrc, routesSrc, { ...serverTexts, [arRel]: fs.readFileSync(af, 'utf-8') }));
    ok(asOwner.some((n) => /AGENT DOOR/.test(n)), `§7 CONTROL: an agent route that asks as the OWNER (no by / principal) is RED (${asOwner.join(' | ')})`);
  }
  const noCache = mutEngine('no-cache', 'const legacy = () => {\n      const o = store.attachmentGet(adapterId, convId, attId);\n      if (!o || (o.meta && o.meta.msg)) return null;\n      const carriers = store.readTail(adapterId, convId, { limit: 5000 }).filter((r) => r && Array.isArray(r.attachments) && r.attachments.some((a) => a && String(a.id) === String(attId)));\n      return carriers.length === 1 && String(carriers[0].vendorId) === scope ? o : null;\n    };\n    const hit = store.attachmentGet(adapterId, convId, attId, scope) || (scope && !agent ? legacy() : null);', 'const hit = null;');   // verify r2: the bare-id `legacy` asks the cache too — the copy drops both
  ok(noCache.some((n) => /CACHE-FIRST/.test(n)), `§7 CONTROL: a copy that never asks the cache is RED (${noCache.join(' | ')})`);
  const second = mutEngine('ingest-fetch', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts));', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts)); for (const x of r.records || []) for (const a of x.attachments || []) await e.adapter.fetchAttachment(convId, { messageId: x.vendorId, attachmentId: a.id });');
  ok(second.some((n) => /ON-DEMAND/.test(n)), `§7 CONTROL: a copy whose INGEST fetches every picture is RED (${second.join(' | ')})`);
  // r-verify: the two callers the first census missed — an INTERNAL prefetch at ingest, a wiring file's own receiver name
  const prefetch = mutEngine('ingest-prefetch', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs);', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs); for (const x of freshRecs) for (const at of x.attachments || []) setTimeout(() => attachment(rec.id, convId, at.id).catch(() => {}), 0);');
  ok(prefetch.some((n) => /never INVOKED/.test(n)), `§7 CONTROL: a copy whose INGEST prefetches every picture through the engine's OWN attachment() is RED (${prefetch.join(' | ')})`);
  const wiringRel = 'src/server/channels-wiring.js';
  ok(typeof serverTexts[wiringRel] === 'string', '§7 CONTROL wiring-prefetch: the wiring file is in the census');
  const wf = MUT.write(wiringRel, serverTexts[wiringRel] + '\nfunction prefetchPictures(engine, rows) { for (const r of rows) engine.attachment(r.adapterId, r.id, r.attId).catch(() => {}); }\n', 'wiring-prefetch');
  const wiring = reds(attachmentCensus(engineSrc, routesSrc, { ...serverTexts, [wiringRel]: fs.readFileSync(wf, 'utf-8') }));
  ok(wiring.some((n) => /every `\.attachment\(` in the server tree/.test(n)), `§7 CONTROL: a wiring-file copy calling \`engine.attachment(\` (a receiver the old list did not name) is RED (${wiring.join(' | ')})`);
  const Amut = MUT.load('src/channel-attachments.js', AttSrc.replace("if (f.affordable === false) return { act: 'refuse', code: 'vendor-budget' };", ''), 'no-budget-verdict');
  ok(AttSrc.includes("if (f.affordable === false) return { act: 'refuse', code: 'vendor-budget' };") && reds(verdictTable(Amut)).length >= 1, `§7 CONTROL: a PURE verdict without its budget gate is RED (${reds(verdictTable(Amut)).join(' | ')})`);
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 9, label: '§7 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ── 8: THE BROWSER-TOOLS INSTALL SLOT (lane browser-admin 2b, 2026-10-01) ──
// VibeSpace downloads a program in exactly ONE place: the browser keeper's install slot (data/browser-tools), shared by the
// CloakBrowser install (lane-cloak) and the browser CLI install (`agent-browser@<version>`). Allowlisted HERE deliberately
// with its gates, as a FUNCTION of the source text (an ungated copy turns it red):
//   USER-ONLY   each install is reached from ONE route, and that route refuses an agent's token by name
//               (refuseAgentBearer) — no timer, no boot path, no agent route installs anything;
//   ONE SPAWN   every npm the keeper runs is `SW.installArgv(...)` (a prefix of ours, --no-save, a pinned spec);
//   REGISTRY    the CLI install's spec is CLI_PACKAGE@<the verdict's version> and its argv carries --ignore-scripts (the
//               package's postinstall — the one script that would fetch from GitHub — never runs): the npm registry
//               is the ONE host (the measured record CLI_PIN_RECORD names it);
//   ONE SLOT    the CLI install's verdict is asked the slot's `installState.running` (never two installs at once).
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const keeperRel = 'src/server/browser-keeper.js', routesRel = 'src/routes/browser.js';
  // rv-browser F7 (lane dc-browser-installs): the install slot and its rows moved out of the keeper — the census reads them AS
  // the keeper (ONE text: the keeper + the slot + every INSTALLERS row file), never as "another module" calling the installs
  const INSTALL_FILES = ['src/server/browser-installs.js', ...[...fs.readFileSync(path.join(REPO, 'src/server/browser-installs.js'), 'utf-8').matchAll(/require\('\.\/([\w-]+\.js)'\)/g)].map((m) => 'src/server/' + m[1])];
  const keeperSrc = [keeperRel, ...INSTALL_FILES].map((rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8')).join('\n'), routesSrc = fs.readFileSync(path.join(REPO, routesRel), 'utf-8');
  const serverTexts = Object.fromEntries(files.map((f) => [path.relative(REPO, f), (() => { try { return fs.readFileSync(f, 'utf-8'); } catch { return ''; } })()]));
  for (const rel of INSTALL_FILES) { if (serverTexts[rel] != null) serverTexts[keeperRel] = keeperSrc; delete serverTexts[rel]; } // the slot + rows ride the keeper's text
  const slotCensus = (K, R, texts) => {
    const rows = [];
    const k = strip(K), r = strip(R);
    const fnBody = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) return ''; const end = src.indexOf('\n  }\n', at); return end < 0 ? '' : src.slice(at, end); };
    const cli = fnBody(k, 'installCli');
    rows.push(['installCli exists', !!cli, '']);
    rows.push(['ONE SPAWN: every npm the keeper runs is SW.installArgv (cloak\'s runStep + the CLI\'s spawn)', (k.match(/SW\.installArgv\(/g) || []).length === 2 && /spawn\(npm, argv,/.test(cli) && /const argv = \[\.\.\.SW\.installArgv\(\{ spec: v0\.spec, prefix \}\), '--ignore-scripts'\];/.test(cli), `${(k.match(/SW\.installArgv\(/g) || []).length} installArgv`]);
    rows.push(['REGISTRY: the CLI install runs --ignore-scripts and its spec comes from THE verdict (CLI_PACKAGE@<version>)', /'--ignore-scripts'/.test(cli) && /VERBS\.cliInstallVerdict\(/.test(cli), '']);
    rows.push(['ONE SLOT: the CLI install\'s verdict is asked the slot\'s running state', /cliInstallVerdict\(\{ version: String\(version \|\| ''\), running: installState\.running,/.test(cli), '']);
    // USER-ONLY: who calls installCli / installCloak across the server tree — only routes/browser.js, each behind refuseAgentBearer
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) {
      const code = strip(text);
      for (const m of code.matchAll(/\.(installCli|installCloak)\(/g)) callers.push(rel + ':' + m[1]);
      if (rel !== keeperRel && /\binstallCli\(|\binstallCloak\(/.test(code.replace(/\.(installCli|installCloak)\(/g, ''))) callers.push(rel + ':bare');
    }
    // the ONE other caller: lane browser-propose's runner — its `inst.start` (= installCloak) runs only inside run(), run()
    // only from approve(), and approve only from the user's Approve route (refuseAgentBearer, PROPOSAL_IS_USERS)
    const PROPOSE = 'src/server/browser-propose.js';
    const ext = callers.filter((c) => !c.startsWith(routesRel + ':') && c !== PROPOSE + ':installCloak');
    const pr = strip(texts[PROPOSE] || '');
    const proposeOk = (pr.match(/inst\.start\(/g) || []).length === 1 && /async function run\(entry\) \{[\s\S]*inst\.start\(/.test(pr) && (pr.match(/[^.\w]run\(/g) || []).length === 2 && /function approve\([\s\S]{0,600}run\(st\.entry\)/.test(pr)
      && /router\.post\('\/api\/browser\/proposals\/:id\/approve'[\s\S]{0,120}refuseAgentBearer\(req, res, PROPOSAL_IS_USERS\)/.test(r);
    rows.push(['USER-ONLY: installCli / installCloak are called only from src/routes/browser.js and the proposal runner\'s user-approved run (no timer, no boot path, no other module)', ext.length === 0 && callers.filter((c) => c.startsWith(routesRel)).length === 2 && proposeOk, callers.join(', ') + (proposeOk ? '' : ' · the proposal runner\'s install is not approve-only')]);
    const route = (p) => { const at = r.indexOf(`router.post('${p}'`); if (at < 0) return ''; const end = r.indexOf('\n});', at); return end < 0 ? '' : r.slice(at, end); };
    const rc = route('/api/browser/cli/install'), rk = route('/api/browser/install');
    rows.push(['USER-ONLY: each install route refuses an agent\'s token (refuseAgentBearer) BEFORE the keeper is asked', /refuseAgentBearer\(req, res, INSTALL_IS_USERS\)/.test(rc) && rc.indexOf('refuseAgentBearer') < rc.indexOf('installCli(') && /refuseAgentBearer\(req, res, INSTALL_IS_USERS\)/.test(rk) && rk.indexOf('refuseAgentBearer') < rk.indexOf('installCloak('), '']);
    rows.push(['no AGENT route installs anything', !/router\.(get|post)\('\/api\/agent\/[^']*'[\s\S]{0,800}?(installCli|installCloak)\(/.test(r.replace(/router\.(get|post|patch|delete)\('\/api\/(?!agent)/g, '§')), '']);
    return rows;
  };
  const reds = (rows) => rows.filter(([, p]) => !p).map(([n, , d]) => n + (d ? ' [' + d + ']' : ''));
  for (const [n, p, d] of slotCensus(keeperSrc, routesSrc, serverTexts)) ok(p, '§8 ' + n + (p || !d ? '' : ' — ' + d));
  const V = require(path.join(REPO, 'src/browser-verbs.js'));
  ok(V.CLI_PIN_RECORD.registryHost === 'registry.npmjs.org' && V.cliInstallVerdict({}).spec === `${V.CLI_PACKAGE}@${V.TABLE_VERSION}` && V.cliInstallVerdict({ version: 'https://evil.example/x.tgz' }).ok === false, '§8 the CLI spec is the package at a dotted version (never a URL / a tarball / another package); the measured record names the ONE host');
  // CONTROLS
  const MUT = mutantCopies('vendor-whitelist-slot', REPO);
  const mut = (label, rel, src, from, to) => { ok(src.includes(from), `§8 CONTROL ${label}: the edit's anchor is in ${rel}`); const f = MUT.write(rel, src.replace(from, to), label); return fs.readFileSync(f, 'utf-8'); };
  const scripts = mut('scripts-run', keeperRel, keeperSrc, "    const argv = [...SW.installArgv({ spec: v0.spec, prefix }), '--ignore-scripts'];", '    const argv = [...SW.installArgv({ spec: v0.spec, prefix })];');
  ok(reds(slotCensus(scripts, routesSrc, { ...serverTexts, [keeperRel]: scripts })).some((n) => /REGISTRY|ONE SPAWN/.test(n)), '§8 CONTROL: a CLI install that lets the package\'s scripts run is RED');
  const timer = mut('timer', keeperRel, keeperSrc, '  const reattached = installs.reattach();', '  const reattached = installs.reattach(); setInterval(() => { try { api.installCli({}); } catch { /* none */ } }, 3600e3);');
  ok(reds(slotCensus(timer, routesSrc, { ...serverTexts, [keeperRel]: timer })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a keeper that installs on a timer is RED');
  const open = mut('agent-token', routesRel, routesSrc, "  if (refuseAgentBearer(req, res, INSTALL_IS_USERS)) return;\n  const k = keeperOr503(res); if (!k) return;\n  if (typeof k.installCli", "  const k = keeperOr503(res); if (!k) return;\n  if (typeof k.installCli");
  ok(reds(slotCensus(keeperSrc, open, { ...serverTexts, [routesRel]: open })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a CLI install route an agent token reaches is RED');
  const twoSlots = mut('two-slots', keeperRel, keeperSrc, "VERBS.cliInstallVerdict({ version: String(version || ''), running: installState.running,", "VERBS.cliInstallVerdict({ version: String(version || ''), running: false,");
  ok(reds(slotCensus(twoSlots, routesSrc, { ...serverTexts, [keeperRel]: twoSlots })).some((n) => /ONE SLOT/.test(n)), '§8 CONTROL: a CLI install that ignores the slot is RED');
  // lane chrome-builds-download (design 004, B-80c1): THE SLOT'S THIRD KIND — a Chrome for Testing build into the CLI's own
  // builds folder. OUR fetch (no child downloads), so the census reads the fetch itself:
  //   ONE FETCH   the keeper has exactly ONE `fetch(` — inside `buildFetch`, AFTER egressVerdict over the hosts of
  //               CHROME_BUILDS_RECORD (https only, redirects by hand); no http(s).request / http(s).get anywhere in the keeper;
  //   USER-ONLY   installChromeBuild / removeChromeBuild / chromeBuildsAvailable are called only from routes/browser.js, each
  //               route refusing an agent's token BEFORE the keeper is asked — no timer, no boot path, no agent route;
  //   ONE SLOT    the download asks `installState.running` and takes the slot as kind `chrome-build`.
  const buildCensus = (K, R, texts) => {
    const rows = [], k = strip(K), r = strip(R);
    const fnBody = (src, name) => { const at = src.indexOf(`function ${name}(`); if (at < 0) return ''; const end = src.indexOf('\n  }\n', at); return end < 0 ? '' : src.slice(at, end); };
    const bf = fnBody(k, 'buildFetch'), inst = fnBody(k, 'installChromeBuild');
    rows.push(['installChromeBuild + buildFetch exist', !!bf && !!inst, '']);
    const fetches = (k.match(/\bfetch\(/g) || []).length;
    rows.push(['ONE FETCH: the keeper\'s only `fetch(` is buildFetch\'s, after egressVerdict over CHROME_BUILDS_RECORD\'s hosts (https only, redirect: manual)', fetches === 1 && /const ev = B\.egressVerdict\(x\.hostname, buildHosts\(\)\);\s*if \(!ev\.allow \|\| x\.protocol !== 'https:'\) throw namedError\('build_url_offhost',/.test(bf) && bf.indexOf('B.egressVerdict(') < bf.indexOf('fetch(') && /redirect: 'manual'/.test(bf)
      && /const CBR = VERBS\.CHROME_BUILDS_RECORD;/.test(k) && /const buildHosts = \(\) => B\.parseEgressAllowlist\(\[CBR\.listHost, CBR\.fileHost\]\);/.test(k), `${fetches} fetch(`]);
    const reqs = k.match(/\bhttps?\.(request|get)\(/g) || [];
    rows.push(['ONE FETCH: no other request leaves the keeper (its one http.get is the CDP probe of a browser\'s own /json/version)', reqs.length === 1 && /http\.get\(\{ host: target\.hostname, port: target\.port \|\| \(target\.protocol === 'https:' \? 443 : 80\), path: '\/json\/version',/.test(k), reqs.join(' ')]);
    const callers = [];
    for (const [rel, text] of Object.entries(texts)) for (const m of strip(text).matchAll(/\.(installChromeBuild|removeChromeBuild|chromeBuildsAvailable)\(/g)) callers.push(rel + ':' + m[1]);
    rows.push(['USER-ONLY: the download, the removal and the list reads are called only from src/routes/browser.js (no timer, no boot path, no other module)', callers.length === 3 && callers.every((c) => c.startsWith(routesRel + ':')), callers.join(', ')]);
    const route = (verb, p) => { const at = r.indexOf(`router.${verb}('${p}'`); if (at < 0) return ''; const end = r.indexOf('\n});', at); return end < 0 ? '' : r.slice(at, end); };
    const rs = [route('get', '/api/browser/builds/available'), route('post', '/api/browser/builds/download'), route('delete', '/api/browser/builds/:version')];
    rows.push(['USER-ONLY: each of the three routes refuses an agent\'s token (refuseAgentBearer) BEFORE the keeper is asked', rs.every((x) => /refuseAgentBearer\(req, res, BUILDS_DOWNLOAD_IS_USERS\)/.test(x) && x.indexOf('refuseAgentBearer') < x.search(/k\.(chromeBuildsAvailable|installChromeBuild|removeChromeBuild)\(/)), '']);
    rows.push(['no AGENT route downloads a build', !/router\.(get|post|delete)\('\/api\/agent\/[^']*'[\s\S]{0,800}?(installChromeBuild|removeChromeBuild|chromeBuildsAvailable)\(/.test(r.replace(/router\.(get|post|patch|delete)\('\/api\/(?!agent)/g, '§')), '']);
    rows.push(['ONE SLOT: the download asks the slot\'s running state and takes it as its row\'s id (`chrome-build`)', /if \(installState\.running\) throw namedError\('install_running',/.test(inst) && /Object\.assign\(installState, \{ running: true, kind: ROW\.id,/.test(inst) && /const ROW = \{ id: 'chrome-build',/.test(keeperSrc), '']);
    return rows;
  };
  for (const [n, p, d] of buildCensus(keeperSrc, routesSrc, serverTexts)) ok(p, '§8 ' + n + (p || !d ? '' : ' — ' + d));
  const noVerdict = mut('build-no-verdict', keeperRel, keeperSrc, '      const ev = B.egressVerdict(x.hostname, buildHosts());', '      const ev = { allow: true };');
  ok(reds(buildCensus(noVerdict, routesSrc, { ...serverTexts, [keeperRel]: noVerdict })).some((n) => /ONE FETCH/.test(n)), '§8 CONTROL: a build fetch without the egress verdict is RED');
  const secondFetch = mut('build-second-fetch', keeperRel, keeperSrc, '  async function jsonBody(res, max) {', '  async function headOf(u) { return fetch(u, { method: \'HEAD\' }); }\n  async function jsonBody(res, max) {');
  ok(reds(buildCensus(secondFetch, routesSrc, { ...serverTexts, [keeperRel]: secondFetch })).some((n) => /ONE FETCH/.test(n)), '§8 CONTROL: a second fetch site beside buildFetch is RED');
  const openDl = mut('build-agent-token', routesRel, routesSrc, "router.post('/api/browser/builds/download', async (req, res) => {\n  if (refuseHost(req, res)) return;\n  if (refuseAgentBearer(req, res, BUILDS_DOWNLOAD_IS_USERS)) return;", "router.post('/api/browser/builds/download', async (req, res) => {\n  if (refuseHost(req, res)) return;");
  ok(reds(buildCensus(keeperSrc, openDl, { ...serverTexts, [routesRel]: openDl })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a download route an agent token reaches is RED');
  const atBoot = mut('build-at-boot', keeperRel, keeperSrc, '  const reattached = installs.reattach();', "  const reattached = installs.reattach(); setTimeout(() => { api.installChromeBuild({ version: VERBS.CHROME_BUILDS_RECORD.measured.stable }).catch(() => {}); }, 0);");
  ok(reds(buildCensus(atBoot, routesSrc, { ...serverTexts, [keeperRel]: atBoot })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a keeper that downloads a build at boot is RED');
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 4, label: '§8 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ── 9: A THREAD BORN AFTER ITS ROOT WAS STORED (lane lark-threads, 2026-10-01 — the owner's post) ──
// Two more vendor reads, allowlisted HERE deliberately with their gates (a function of the source text — an ungated copy,
// written by scripts/mutant-copy.mjs, turns it red):
//   RECHECK  `.recentRoots(` (ONE page of a chat's newest messages) is called ONCE in the server tree — the engine's
//            `recheckOne()`, through `vendor(rec, e, …)` (the minute's budget, the pace); `recheckOne` is invoked ONLY by
//            the drain's `recheck` action (rule 22a, the timer — one page per conversation per channels.threadRecheckSec)
//            and the OWNER's press (rule 22b, `act.recheck`, floored) — never an agent route, never an ingest;
//   BY-ID    `.messageById(` is called ONCE — the engine's `fetchMissing()`, through `vendor(rec, e, …)`, after the per-tick
//            bound (BYID_PER_TICK) and `affordable(rec, e)` are asked; every answer that is not a thread reply remembered
//            (BYID_MEMORY_MS) — `fetchMissing` is invoked only from the change feed's page (`feedPage`).
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  const bodyOf = (E, head) => { const at = E.indexOf(head); if (at < 0) return ''; const end = E.indexOf('\n  }\n', at); return end < 0 ? '' : E.slice(at, end); };
  const census = (engineSrc, serverTexts) => {
    const rows = [];
    const E = strip(engineSrc);
    const callersOf = (re) => { const out = []; for (const [rel, text] of Object.entries(serverTexts)) { const n = (strip(text).match(re) || []).length; if (n) out.push(`${rel}:${n}`); } return out; };
    const rc = callersOf(/\.recentRoots\(/g), bc = callersOf(/\.messageById\(/g);
    rows.push(['RECHECK: `.recentRoots(` is called from exactly one place in the server tree (the engine\'s recheckOne)', rc.length === 1 && rc[0] === 'src/server/channels-engine.js:1' && /vendor\(rec, e, \(\) => e\.adapter\.recentRoots\(/.test(bodyOf(E, 'async function recheckOne(')), rc.join(', ')]);
    const invokes = (E.match(/(?<![.\w$])recheckOne\(/g) || []).length;
    const fo = bodyOf(E, '      const fetchOne = async (act) => {') || E;
    rows.push(['RECHECK: recheckOne is invoked only by the drain\'s `recheck` action and the OWNER\'s press (`act.recheck`, floored by recheckOnPress)', invokes === 3 && /act\.type === 'recheck'\) \{ e\.chargeBy = 'timer'; result = await recheckOne\(/.test(E) && /if \(act\.recheck && threadsRow\(registry\.capsOf\(rec\.kind\)\)\.listing === 'separate' && Drain\.recheckOnPress\(/.test(E), `bare occurrences ${invokes} (the definition + 2)`]);
    const fm = bodyOf(E, 'async function fetchMissing(');
    const bound = fm.indexOf('if (e.byIdTick.n >= BYID_PER_TICK || !affordable(rec, e)'), call = fm.indexOf('vendor(rec, e, () => e.adapter.messageById(');
    rows.push(['BY-ID: `.messageById(` is called from exactly one place (the engine\'s fetchMissing), through vendor(rec, e, …), AFTER the per-tick bound and the minute\'s budget', bc.length === 1 && bc[0] === 'src/server/channels-engine.js:1' && bound > 0 && call > bound, JSON.stringify({ callers: bc, bound, call })]);
    rows.push(['BY-ID: every answer that is not a thread reply (and every refusal) is remembered — never asked again per tick', /rememberById\(e, vid, 'refused'\)/.test(fm) && /rememberById\(e, vid, \(r && r\.kind\) \|\| 'absent'\)/.test(fm) && /e\.byIdMem\.has\(vid\)/.test(fm), '']);
    const fmCalls = (E.match(/(?<![.\w$])fetchMissing\(/g) || []).length;
    rows.push(['BY-ID: fetchMissing is invoked only from the change feed\'s page', fmCalls === 2 && /if \(separate\) await fetchMissing\(rec, e\);/.test(bodyOf(E, 'async function feedPage(')), `bare occurrences ${fmCalls}`]);
    return rows;
  };
  const serverTexts = {};
  for (const f of files) { const rel = path.relative(REPO, f); try { serverTexts[rel] = fs.readFileSync(f, 'utf-8'); } catch { } }
  const engineRel = 'src/server/channels-engine.js';
  const engineSrc = engineSource(REPO);   // lane dc-channels-seams: the engine + its three family files as one text
  ok(typeof engineSrc === 'string', '§9 the engine is in the server census');
  for (const [name, pass0, detail] of census(engineSrc, serverTexts)) ok(pass0, `§9 ${name}`, detail);
  const MUT = mutantCopies('vendor-whitelist-lkt', REPO);
  const reds = (rows) => rows.filter(([, p]) => !p).map(([n]) => n);
  const mutEngine = (label, from, to) => {
    ok(engineSrc.includes(from), `§9 CONTROL ${label}: the edit's anchor is in the engine`);
    const f = MUT.write(engineRel, engineSrc.replace(from, to), label);
    const t = fs.readFileSync(f, 'utf-8');
    return reds(census(t, { ...serverTexts, [engineRel]: t }));
  };
  const ingestRecheck = mutEngine('ingest-recheck', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs);', 'if (freshRecs.length) en.authors = mergeAuthors(en.authors, freshRecs); setTimeout(() => recheckOne(rec, e, convId, { by: \'timer\' }).catch(() => {}), 0);');
  ok(ingestRecheck.some((n) => /RECHECK: recheckOne is invoked only/.test(n)), `§9 CONTROL: a copy whose INGEST rechecks every conversation it reads is RED (${ingestRecheck.join(' | ')})`);
  const unbounded = mutEngine('byid-unbounded', 'if (e.byIdTick.n >= BYID_PER_TICK || !affordable(rec, e) || outlived(rec, e)) break;', 'if (outlived(rec, e)) break;');
  ok(unbounded.some((n) => /BY-ID: `\.messageById\(`/.test(n)), `§9 CONTROL: a by-id loop without its per-tick bound and the budget is RED (${unbounded.join(' | ')})`);
  const ingestById = mutEngine('ingest-byid', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts));', 'const r = await vendor(rec, e, () => e.adapter.history(convId, opts)); for (const x of r.records || []) await e.adapter.messageById(convId, { messageId: x.vendorId });');
  ok(ingestById.some((n) => /BY-ID: `\.messageById\(`/.test(n)), `§9 CONTROL: a copy whose INGEST reads every message by id is RED (${ingestById.join(' | ')})`);
  const forgets = mutEngine('byid-forgets', "rememberById(e, vid, 'refused'); f.counters.missingRefused++;", 'f.counters.missingRefused++;');
  ok(forgets.some((n) => /remembered/.test(n)), `§9 CONTROL: a by-id read that forgets a refusal (asked again every tick) is RED (${forgets.join(' | ')})`);
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 4, label: '§9 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// ── 10: THE CODEX APP-SERVER SPAWNS + THE RESET-CREDIT HELPER (lane reset-path, 2026-10-01) ──
// The owner: the Agents list could not use a codex reset credit without a live chat session. The fix is ONE
// bounded `codex app-server` child (src/codex-reset-helper.js) — the first app-server a PERSON'S CLICK starts
// outside a conversation, and a vendor act (the consume IS the vendor call; the app-server's own startup also
// reaches out — measured). It is allowlisted HERE deliberately, with its gates, and every other app-server
// argv in the server tree is a row too — a new one fails until it is listed with its reason:
//   ONE CALLER    the helper is called only by the engine's writeResetCreditViaHelper, after the spend ceiling
//                 and the attempt record (the floor arms on its `onSent`);
//   HUMAN ONLY    that writer is called only by consumeResetCreditFor (the human-only POST, after the
//                 preview's refusals), never by the auto rung, never under a timer;
//   MEASURED      MEASURED_CONNECTS: our own process 0 internet-family calls, the app-server's startup set recorded;
//   LIVE (strace) the helper over the STUB app-server with an EMPTY CODEX_HOME opens ZERO internet connections.
{
  const strip8 = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  const APP_SERVER = /\[\s*['"]app-server['"]/g;
  const ALLOW_APP_SERVER = {
    'src/codex-thread-read.js': 'B-21e4: the thread/read fallback for a thread with no rollout (navigation-triggered; parked as B-af31)',
    'src/adapters/codex.js': 'a conversation\'s OWN app-server, inside its wrapper (the session is the conversation)',
    'src/local-oracles.js': 'a measured-and-REJECTED candidate record (codex-app-server-config-read) — never spawned',
    'src/codex-reset-helper.js': 'THE RESET-CREDIT HELPER — a person\'s click on Use… with no conversation to carry it (gates below; +1 read per human press, both paths — the owner\'s yes on ut-cdaa01aff0, verify r8 T0)',
  };
  const hits8 = {};
  for (const f of files) {
    const rel = path.relative(REPO, f);
    if (rel.startsWith('data/bin/vibespace-agentd')) continue; // the built bundle carries copies of the two rows above
    let t = ''; try { t = strip8(fs.readFileSync(f, 'utf8')); } catch { continue; }
    const n = (t.match(APP_SERVER) || []).length;
    if (n) hits8[rel] = n;
  }
  for (const [rel, n] of Object.entries(hits8)) ok(!!ALLOW_APP_SERVER[rel], `§10 a \`codex app-server\` argv only in an allowlisted file (${rel}: ${n}${ALLOW_APP_SERVER[rel] ? '' : ' — NOT ALLOWLISTED'})`);
  for (const [rel, why] of Object.entries(ALLOW_APP_SERVER)) ok(hits8[rel] > 0, `§10 allowlist row still matches: ${rel} (${why.split(' — ')[0]})`);
  // THE HELPER'S GATES — a census over TEXT so a patched copy can be shown red
  const helperCensus = (engineText, routeText, helperText) => {
    const E = strip8(engineText), R = strip8(routeText), H = strip8(helperText);
    const rows = [];
    const fnBody = (src, header) => { const at = src.indexOf(header); if (at < 0) return ''; const end = src.indexOf('\n}\n', at); return end < 0 ? '' : src.slice(at, end); };
    const calls = (re) => (E.match(re) || []).length;
    const hb = fnBody(E, 'function writeResetCreditViaHelper(');
    const auth = hb.indexOf("spendGuard.authorize({ reason: 'codex-reset-credit'"), open = hb.indexOf('openResetCreditTry('), spawnAt = hb.indexOf('consumeResetCreditViaAppServer(');
    rows.push(['ONE CALLER: the helper is called once in the server tree, by writeResetCreditViaHelper, after the spend ceiling and the attempt record', calls(/consumeResetCreditViaAppServer\(/g) === 1 && auth > 0 && open > auth && spawnAt > open && /onSent: \(\) => noteResetCreditSent\(t\)/.test(hb), JSON.stringify({ calls: calls(/consumeResetCreditViaAppServer\(/g), auth, open, spawnAt })]);
    const cb = fnBody(E, 'function consumeResetCreditFor(');
    const pv = cb.indexOf('const p = resetCreditPreview('), refuse = cb.indexOf('if (p.code) return'), w = cb.indexOf('writeResetCreditViaHelper(');
    rows.push(['HUMAN ONLY: writeResetCreditViaHelper is called once, by consumeResetCreditFor, after the preview\'s refusals (floor / in_flight / no_credits)', (E.match(/writeResetCreditViaHelper\(/g) || []).length === 2 && pv > 0 && refuse > pv && w > refuse, JSON.stringify({ n: (E.match(/writeResetCreditViaHelper\(/g) || []).length, pv, refuse, w })]);
    // verify r1: the timer census reads up to three lines past a `setTimeout(` / `setInterval(` — a planted call on
    // the next line (the press's own spawn deferred under a timer, a multi-line interval) escaped the same-line form
    rows.push(['NEVER THE AUTO RUNG, NEVER A TIMER: no helper call in resetCreditRung, none under setTimeout / setInterval (up to three lines in)', !/writeResetCreditViaHelper\(|consumeResetCreditViaAppServer\(/.test(fnBody(E, 'function resetCreditRung(')) && !/set(?:Timeout|Interval)\((?:[^\n]*\n){0,3}[^\n]*(?:writeResetCreditViaHelper|consumeResetCreditViaAppServer)/.test(E), '']);
    const post = R.indexOf("app.post('/api/accounts/:id/reset-credit'"), bearer = R.indexOf('if (isAgentBearer(req)) return res.status(403)', post), consume = R.indexOf('engine.consumeResetCreditFor(', post);
    rows.push(['HUMAN ONLY: the POST refuses an agent\'s session / job token BEFORE it reaches the engine; the GET preview never consumes', post > 0 && bearer > post && consume > bearer && /\(vsst_\|jbt_\)/.test(R) && R.slice(0, post).indexOf('consumeResetCreditFor(') < 0, JSON.stringify({ post, bearer, consume })]);
    rows.push(['the helper module builds no request of its own (no http/fetch, no vendor host in code)', !/require\(['"](https?|net|tls)['"]\)/.test(H) && !REQUESTY.test(H) && !/https?:\/\//.test(H.replace(/MEASURED_CONNECTS = Object\.freeze\(\{[\s\S]*?\}\);/, '')), '']);
    return rows;
  };
  const engRel = 'src/server/usage-pool-engine.js', routeRel = 'src/routes/reset-credit.js', helperRel = 'src/codex-reset-helper.js';
  const engT = fs.readFileSync(path.join(REPO, engRel), 'utf8'), routeT = fs.readFileSync(path.join(REPO, routeRel), 'utf8'), helperT = fs.readFileSync(path.join(REPO, helperRel), 'utf8');
  for (const [name, pass8, detail] of helperCensus(engT, routeT, helperT)) ok(pass8, `§10 ${name}`, detail);
  const H = require(path.join(REPO, helperRel));
  const M = H.MEASURED_CONNECTS;
  ok(M && /strace/.test(M.tool) && /^\d{4}-\d\d-\d\d$/.test(M.date) && /codex-cli \d+\.\d+\.\d+/.test(M.version) && /unshare -n/.test(M.runner) && M.ours.inet === 0 && M.appServer.inetOk === 0 && M.appServer.inet === M.appServer.dns + M.appServer.https + M.appServer.other,
    '§10 MEASURED: the helper\'s connect set is a measurement (tool, date, CLI version, runner) — our own process 0 internet-family calls, none succeeded in the empty namespace', JSON.stringify(M));
  // CONTROLS — the census over patched TEXT
  const red8 = (rows) => rows.filter(([, p8]) => !p8).map(([n]) => n);
  const swapEng = (from, to) => { ok(engT.includes(from), `§10 CONTROL: the anchor is in the engine (${from.slice(0, 50).trim()}…)`); return engT.replace(from, to); };
  const before = swapEng("  const t = openResetCreditTry({ key, sid: null, via: 'helper', origin: 'user', resetsAtSec, lane: null, now, idemKey, av, creditsAt: resetCreditsLeft(null, key), reportsSent: true, window: spentWindowOf(readRawUsageCache(key)) });", "  codexResetHelper.consumeResetCreditViaAppServer({ idempotencyKey: 'x' });\n  const t = openResetCreditTry({ key, sid: null, via: 'helper', origin: 'user', resetsAtSec, lane: null, now, idemKey, av, creditsAt: resetCreditsLeft(null, key), reportsSent: true, window: spentWindowOf(readRawUsageCache(key)) });");
  ok(red8(helperCensus(before, routeT, helperT)).some((n) => /ONE CALLER/.test(n)), '§10 CONTROL: a second helper call BEFORE the attempt record is RED');
  const auto = swapEng("    // AUTO — through the ONE writer the manual button uses too (writeResetCredit).", "    if (!session.pty) writeResetCreditViaHelper(key, { resetsAtSec: R });\n    // AUTO — through the ONE writer the manual button uses too (writeResetCredit).");
  ok(red8(helperCensus(auto, routeT, helperT)).some((n) => /NEVER THE AUTO RUNG/.test(n)), '§10 CONTROL: an auto rung that falls to the helper is RED');
  const timer = swapEng("function writeResetCreditViaHelper(", "function _retry(k) { setTimeout(() => writeResetCreditViaHelper(k), 60e3); }\nfunction writeResetCreditViaHelper(");
  ok(red8(helperCensus(timer, routeT, helperT)).some((n) => /NEVER A TIMER/.test(n)), '§10 CONTROL: a helper call under a timer is RED');
  const deferred = swapEng("  Promise.resolve(codexResetHelper.consumeResetCreditViaAppServer({", "  setTimeout(() => {\n  Promise.resolve(codexResetHelper.consumeResetCreditViaAppServer({");
  ok(red8(helperCensus(deferred, routeT, helperT)).some((n) => /NEVER A TIMER/.test(n)), '§10 CONTROL (verify r1): the press\'s own spawn deferred under a MULTI-LINE timer is RED (the same-line census let it through)');
  const routeOpen = routeT.replace("      if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });\n", '');
  ok(routeOpen !== routeT && red8(helperCensus(engT, routeOpen, helperT)).some((n) => /agent's session \/ job token/.test(n)), '§10 CONTROL: a POST that lets an agent token through is RED');
  const fetchy = helperT.replace("const { spawn } = require('child_process');", "const { spawn } = require('child_process');\nconst https = require('https');");
  ok(fetchy !== helperT && red8(helperCensus(engT, routeT, fetchy)).some((n) => /builds no request/.test(n)), '§10 CONTROL: a helper that loads an http client is RED');
  // verify r2 (Q5): the timer census above is LEXICAL and ENGINE-ONLY — a timer two files away reaching the helper
  // through the EXPORTED consumeResetCreditFor (server.js hands it to the routes; any module could call it) escaped
  // it. A TREE-WIDE census of every CALL of consumeResetCreditFor: the route's POST (twice — the press, and the press
  // re-asked after the conversation's read) and the engine's own definition; nothing else, none under a timer
  const ALLOW_CONSUME_CALLS = { 'src/routes/reset-credit.js': 2, 'src/server/usage-pool-engine.js': 1 };
  // verify r3: a REFERENCE census beside the call census — `const f = engine.consumeResetCreditFor; setInterval(f, …)` and
  // `engine.consumeResetCreditFor.bind(engine)` carry no `(` after the name and slipped the call census whole. Every
  // mention of the name is counted per file (the route: its typeof guard + two calls; the engine: the definition + the
  // export; server.js: the one engine literal handed to the routes) and a `.bind(` / `.call(` / `.apply(` on it is RED
  const ALLOW_CONSUME_REFS = { 'src/routes/reset-credit.js': 3, 'src/server/usage-pool-engine.js': 2, 'server.js': 1 };
  const consumeCalls = (text) => (strip8(text).match(/consumeResetCreditFor\(/g) || []).length;
  const consumeRefs = (text) => (strip8(text).match(/\bconsumeResetCreditFor\b/g) || []).length;
  const consumeBound = (text) => /\bconsumeResetCreditFor\s*\.\s*(?:bind|call|apply)\s*\(/.test(strip8(text));
  const consumeUnderTimer = (text) => /set(?:Timeout|Interval)\((?:[^\n]*\n){0,3}[^\n]*\bconsumeResetCreditFor\b/.test(strip8(text));
  // verify r4 (T2 ⑤): a reach into the engine object that never SPELLS the name — `engine['consume' + 'ResetCreditFor']`,
  // `Reflect.get(engine, k)`, a spread re-export `{ ...engine }` — carries no reference the census above can count. The
  // server tree reaches the engine by dotted names only; any dynamic reach into an object called `engine` is RED by shape
  // verify r5 (reproduced over the r4 census itself: FIVE aliasing shapes passed it — `const e = engine; e['consume' + …]`,
  // a parameter `eng` with `Reflect.get(eng, k)`, `const { engine: pe } = deps; { ...pe }`, `Object.values(engine).find(f =>
  // f.name.endsWith('ResetCreditFor'))`, `engine?.[k]`): a census keyed on ONE identifier is a census of a spelling. It is
  // keyed on the NAME REACHED and on EVERY ALIAS the file binds to the engine: ① any string fragment that assembles the name
  // ('consume' + …, … + 'ResetCreditFor', a bare 'ResetCreditFor', a template literal); ② the engine or any alias of it
  // (const/let/var x = …engine, { engine: x }, a parameter named engine / eng, this.engine) reached by a computed member
  // ([…] / ?.[…]), Reflect.get/apply/ownKeys, a spread, Object.values/entries/keys/getOwnPropertyNames, for…in
  const consumeDynamic = (text) => {
    const s = strip8(text);
    if (/['"]consume['"]\s*\+|\+\s*['"]ResetCreditFor['"]|['"]ResetCreditFor['"]|`consume\$\{|\}ResetCreditFor`/.test(s)) return true;
    const aliases = new Set(['engine', 'eng']);
    for (const m of s.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[\w$]+\s*\.\s*)*engine\b(?!\s*(?:\.|\?\.|\(|\[))/g)) aliases.add(m[1]); // the expression ENDS at the engine (`const r = engine.takeover(…)` binds a result, not the engine)
    for (const m of s.matchAll(/\bengine\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) aliases.add(m[1]);
    const names = [...aliases].map((a) => a.replace(/\$/g, '\\$')).join('|');
    const recv = `(?:\\b(?:${names})\\b|\\bthis\\s*\\.\\s*engine\\b)`;
    return new RegExp(`${recv}\\s*(?:\\?\\.)?\\s*\\[|\\bReflect\\s*\\.\\s*(?:get|apply|ownKeys)\\s*\\(\\s*${recv}|\\.\\.\\.\\s*${recv}\\s*[,}]|\\bObject\\s*\\.\\s*(?:values|entries|keys|getOwnPropertyNames)\\s*\\(\\s*${recv}|\\bfor\\s*\\(\\s*(?:const|let|var)\\s+[\\w$]+\\s+in\\s+${recv}`).test(s);
  };
  const callCensus = (texts) => { const bad = []; for (const [rel, t] of Object.entries(texts)) { const n = consumeCalls(t); if (n && n !== (ALLOW_CONSUME_CALLS[rel] || 0)) bad.push(`${rel}: ${n} call(s), allowed ${ALLOW_CONSUME_CALLS[rel] || 0}`); const m = consumeRefs(t); if (m && m !== (ALLOW_CONSUME_REFS[rel] || 0)) bad.push(`${rel}: ${m} reference(s), allowed ${ALLOW_CONSUME_REFS[rel] || 0}`); if (consumeBound(t)) bad.push(`${rel}: consumeResetCreditFor bound with bind/call/apply`); if (consumeUnderTimer(t)) bad.push(`${rel}: a consumeResetCreditFor call under a timer`); if (consumeDynamic(t)) bad.push(`${rel}: a dynamic reach into the engine object (engine[…] / Reflect.get(engine / { …engine })`); } return bad; };
  const treeTexts = {}; for (const f of files) { const rel = path.relative(REPO, f); if (rel.startsWith('data/bin/vibespace-agentd')) continue; try { treeTexts[rel] = fs.readFileSync(f, 'utf8'); } catch { } }
  const badCalls = callCensus(treeTexts);
  ok(badCalls.length === 0, '§10 TREE CENSUS (verify r2): consumeResetCreditFor is CALLED only by the route\'s POST (twice) and defined once in the engine — no other caller, none under a timer anywhere in the server tree', badCalls.join(' | '));
  ok(Object.keys(ALLOW_CONSUME_CALLS).every((rel) => consumeCalls(treeTexts[rel] || '') === ALLOW_CONSUME_CALLS[rel]), '§10 TREE CENSUS: the allowlist rows still match (route 2, engine 1)');
  ok(Object.keys(ALLOW_CONSUME_REFS).every((rel) => consumeRefs(treeTexts[rel] || '') === ALLOW_CONSUME_REFS[rel]), '§10 TREE CENSUS (verify r3): the reference rows still match (route 3, engine 2, server.js 1)', JSON.stringify(Object.fromEntries(Object.keys(ALLOW_CONSUME_REFS).map((rel) => [rel, consumeRefs(treeTexts[rel] || '')]))));
  const plantedAlias = { ...treeTexts, 'server.js': (treeTexts['server.js'] || '') + "\nconst nudgeFn = engine.consumeResetCreditFor;\nsetInterval(nudgeFn, 60e3);\n" };
  ok(callCensus(plantedAlias).some((b) => /^server\.js: 2 reference\(s\), allowed 1/.test(b)) && !callCensus(plantedAlias).some((b) => /server\.js: \d+ call/.test(b)), '§10 TREE CENSUS CONTROL (verify r3): a call through a VARIABLE (const f = engine.consumeResetCreditFor; setInterval(f)) is RED by the reference census — the call census alone saw nothing', callCensus(plantedAlias).join(' | '));
  const plantedBind = { ...treeTexts, 'src/ws-handler.js': (treeTexts['src/ws-handler.js'] || '') + "\nconst spend = engine.consumeResetCreditFor.bind(engine);\n" };
  ok(callCensus(plantedBind).some((b) => /bound with bind\/call\/apply/.test(b)) && callCensus(plantedBind).some((b) => /^src\/ws-handler\.js: 1 reference/.test(b)), '§10 TREE CENSUS CONTROL (verify r3): a `.bind(` on it is RED twice (the bind, and a reference in a file with none allowed)', callCensus(plantedBind).join(' | '));
  const plantedTimer = { ...treeTexts, 'server.js': (treeTexts['server.js'] || '') + "\nsetInterval(() => {\n  engine.consumeResetCreditFor('x');\n}, 60e3);\n" };
  ok(callCensus(plantedTimer).some((b) => /^server\.js: a consumeResetCreditFor call under a timer/.test(b)), '§10 TREE CENSUS CONTROL: a timer TWO FILES AWAY (a setInterval in server.js calling engine.consumeResetCreditFor) is RED');
  const plantedCaller = { ...treeTexts, 'src/ws-handler.js': (treeTexts['src/ws-handler.js'] || '') + "\nfunction nudge(e) { return e.consumeResetCreditFor('x'); }\n" };
  ok(callCensus(plantedCaller).some((b) => /^src\/ws-handler\.js: 1 call/.test(b)), '§10 TREE CENSUS CONTROL: a new caller in another file is RED until it is allowlisted with its reason');
  for (const [what, line] of [['a dynamic property (engine[\'consume\' + \'ResetCreditFor\'])', "setInterval(() => engine['consume' + 'ResetCreditFor']('x'), 60e3);"], ['Reflect.get(engine, k)', "const k = 'consume' + 'ResetCreditFor'; setInterval(Reflect.get(engine, k), 60e3);"], ['a spread re-export ({ ...engine })', 'module.exports = { ...engine };'],
    // verify r5: the aliasing shapes the r4 census let through — the key is assembled from fragments the fragment rule does
    // not know ('cons' + 'umeResetCreditFor'), so only the ALIAS rule can catch them
    ['an alias (const e = engine; e[k])', "const e = engine;\nconst k = 'cons' + 'umeResetCreditFor';\nsetInterval(() => e[k]('x'), 60e3);"],
    ['this.engine[k]', "class N { constructor(engine) { this.engine = engine; } tick() { const k = 'cons' + 'umeResetCreditFor'; this.engine[k]('x'); } }"],
    ['a parameter eng + Reflect.get(eng, k)', "function nudge(eng) { const k = 'cons' + 'umeResetCreditFor'; return Reflect.get(eng, k)('x'); }"],
    ['a destructured alias spread ({ engine: pe } … { ...pe })', 'const { engine: pe } = deps;\nmodule.exports = { ...pe };'],
    ['Object.values(engine) found by suffix', "Object.values(engine).find((f) => typeof f === 'function' && /CreditFor$/.test(f.name))('x');"],
    ['an optional chain (engine?.[k])', "const k = 'cons' + 'umeResetCreditFor'; setInterval(() => engine?.[k]('x'), 60e3);"],
    ['a template literal (`consume${…}`)', "const tail = 'ResetCreditFor'; setInterval(() => engine[`consume${tail}`]('x'), 60e3);"]]) {
    const planted = { ...treeTexts, 'server.js': (treeTexts['server.js'] || '') + '\n' + line + '\n' };
    ok(callCensus(planted).some((b) => /^server\.js: a dynamic reach into the engine object/.test(b)), `§10 TREE CENSUS CONTROL (verify r4): ${what} spells no name the reference census could count — RED by shape`, callCensus(planted).join(' | '));
  }
  // ── THE READ CENSUS (verify r9 ⑥): every `account/rateLimits/read` REQUEST site in the tree is a ROW with its gate — the
  //    owner's yes (ut-cdaa01aff0) bought "+1 read per human press, both paths" and nothing more; a new site is RED until it is
  //    listed here with its reason (the engine never builds one: it asks a wrapper / the helper)
  {
    const READ = /request\(\s*['"]account\/rateLimits\/read['"]/g;
    const ALLOW_READ = {
      'data/bin/codex-chat-wrapper.js': { n: 3, why: 'readAccountLimits (the boot read, fire-and-forget; the on-demand `codex-read-limits` verb: the usage menu ⟳ and the route\'s read over an unsettled prior) · the read BEFORE a consume (inside `if (msg.readFirst === true)` of the codex-reset-credit handler — the engine sets the flag only for a person\'s press, verify r8 T0) · the post-reset read after a consume' },
      'src/codex-reset-helper.js': { n: 2, why: 'the helper\'s read-first (a person\'s press with no conversation to carry it) · its post-consume read' },
    };
    const hitsR = {};
    for (const f of files) { const rel = path.relative(REPO, f); if (rel.startsWith('data/bin/vibespace-agentd')) continue; let t = ''; try { t = strip8(fs.readFileSync(f, 'utf8')); } catch { continue; } const n = (t.match(READ) || []).length; if (n) hitsR[rel] = n; }
    ok(JSON.stringify(Object.keys(hitsR).sort()) === JSON.stringify(Object.keys(ALLOW_READ).sort()) && Object.entries(ALLOW_READ).every(([rel, r]) => hitsR[rel] === r.n), `§10 READ CENSUS (verify r9 ⑥): the account/rateLimits/read request sites are exactly the allowlisted rows, by file and count (${JSON.stringify(hitsR)})`, JSON.stringify(hitsR));
    const wrapperRaw = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8'), wrapperT = strip8(wrapperRaw);
    const rc = wrapperT.indexOf("msg.type === 'codex-reset-credit')"), rf = wrapperT.indexOf('if (msg.readFirst === true) {', rc), rd = wrapperT.indexOf("request('account/rateLimits/read'", rf), go = wrapperT.indexOf('resetCreditGoWaiters.set(idempotencyKey', rd), cons = wrapperT.indexOf("request('account/rateLimitResetCredit/consume'", go);
    ok(rc > 0 && rf > rc && rd > rf && go > rd && cons > go, '§10 READ CENSUS: the wrapper\'s read before a consume sits inside the readFirst gate of the codex-reset-credit handler, the wait for the go follows it, and the consume comes after the wait (the order in the source)', JSON.stringify({ rc, rf, rd, go, cons }));
    const countR = (t) => (strip8(t).match(READ) || []).length;
    ok(!ALLOW_READ['src/server/usage-pool-engine.js'] && countR(engT) === 0 && countR(engT + "\nsetInterval(() => request('account/rateLimits/read', {}), 60e3);\n") === 1, '§10 READ CENSUS CONTROL: a planted read site in the engine is RED (a file outside the rows)');
    ok(countR(wrapperRaw) === 3 && countR(wrapperRaw + "\nconst extra = await request('account/rateLimits/read', {}, 20000);\n") === 4, '§10 READ CENSUS CONTROL: a fourth read in the wrapper is RED (the count is the row)');
    // THE SHAPE CENSUS (verify r10 ⑥): the read census counts a LITERAL method name — a read spelled through a variable, a
    // template literal or a computed string would never match it. So every `request(` in the two carriers must name its
    // method as a string literal; the ONE non-literal call is startThread's closed ternary over three thread verbs
    // (thread/start | thread/resume | thread/fork), pinned by shape. Any other non-literal first argument is RED by shape —
    // the runtime census (test-reset-credit-ui §4b: the stub app-server's own log, reads per press) is the second witness
    {
      const helperRaw = fs.readFileSync(path.join(REPO, 'src/codex-reset-helper.js'), 'utf8');
      const NONLIT = /(?<!function )\brequest\(\s*(?!['"`])([^,)]+)/g; // a CALL whose first argument is not a string literal (the `function request(method, …)` definition is not a call)
      const nonLit = (t) => [...strip8(t).matchAll(NONLIT)].map((m) => m[1].trim());
      const ternaryOk = /const method = resumeId \? \(isFork \? 'thread\/fork' : 'thread\/resume'\) : 'thread\/start';\n  if \(resumeId\) params\.threadId = resumeId;\n  const resp = await request\(method, params, 120000\);/.test(wrapperRaw);
      ok(ternaryOk && JSON.stringify(nonLit(wrapperRaw)) === JSON.stringify(['method']), '§10 SHAPE CENSUS (verify r10 ⑥): every request() in the wrapper names a literal method except startThread\'s closed ternary (thread/start | resume | fork) — a method spelled through a variable elsewhere is RED by shape', JSON.stringify(nonLit(wrapperRaw)));
      ok(nonLit(helperRaw).length === 0, '§10 SHAPE CENSUS: every request() in the helper names a literal method', JSON.stringify(nonLit(helperRaw)));
      const planted = "\nconst m2 = 'account/rateLimits/' + 'read'; const r9 = await request(m2, {}, 20000);\n";
      ok(JSON.stringify(nonLit(wrapperRaw + planted)) === JSON.stringify(['method', 'm2']) && countR(wrapperRaw + planted) === 3, '§10 SHAPE CENSUS CONTROL: a read spelled through a variable keeps the LITERAL count at 3 (the text census is blind to it) and is RED by shape (a non-literal method name)', JSON.stringify(nonLit(wrapperRaw + planted)));
    }
  }
  // verify r2 (Q5): the strace leg below is the REAL witness of the census — it must run in the tier that gates a
  // push. This suite is in ci.mjs's FAST tier (the pre-push tier); on a CI runner a missing strace is RED, never a SKIP
  const ciRows = fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8');
  ok(/\{\s*name:\s*'test-vendor-whitelist',\s*tier:\s*'fast'/.test(ciRows), '§10 TIER PIN: test-vendor-whitelist is in the FAST tier of scripts/ci.mjs (the tier that gates a push) — its strace leg runs before every push');
  // LIVE: the helper over the STUB app-server, an EMPTY CODEX_HOME, under strace — zero internet connections
  const has8 = (bin) => { try { execFileSync('sh', ['-c', `command -v ${bin}`], { stdio: 'pipe' }); return true; } catch { return false; } };
  const onCI = !!(process.env.CI || process.env.GITHUB_ACTIONS);
  if (!has8('strace')) ok(!onCI, onCI ? '§10 LIVE leg: strace is REQUIRED on a CI runner — the leg that gates a push may never SKIP there (install strace on the runner)' : '§10 SKIP live leg: strace is not on PATH — the census + the recorded measurement stand alone (a CI runner would be RED here)');
  else {
    const { writeStub } = await import('./codex-app-server-stub.mjs');
    const tmp8 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-vwl-helper-'));
    try {
      const stub = writeStub(tmp8);
      const home = path.join(tmp8, 'codex-home'); fs.mkdirSync(home);
      const drv = (extra) => { const f = path.join(tmp8, `drv-${Math.random().toString(36).slice(2)}.cjs`); fs.writeFileSync(f, `'use strict';\n${extra}\nrequire(${JSON.stringify(path.join(REPO, helperRel))}).consumeResetCreditViaAppServer({ idempotencyKey: 'k-vwl-1', env: process.env, cwd: process.env.CODEX_HOME, codexCmd: ${JSON.stringify(stub)}, pressedBy: 'person' }).then((r) => { process.stdout.write(JSON.stringify(r)); setTimeout(() => process.exit(0), 300); });\n`); return f; };
      const traced = (f) => {
        const out = path.join(tmp8, 'trace-' + Math.random().toString(36).slice(2));
        const env8 = { HOME: tmp8, CODEX_HOME: home, PATH: process.env.PATH || '/usr/bin:/bin', STUB_TABLE: path.join(REPO, 'scripts/fixtures/codex-app-server/0.159.3-methods.json'), STUB_LOG: path.join(tmp8, 'rpc.ndjson'), STUB_READ_USED: '0' };
        let res = ''; try { res = execFileSync('strace', ['-f', '-qq', '-e', 'trace=connect', '-o', out, process.execPath, f], { env: env8, timeout: 30000, encoding: 'utf8' }); } catch { }
        let text = ''; try { text = fs.readFileSync(out, 'utf8'); } catch { }
        return { result: (() => { try { return JSON.parse(res); } catch { return null; } })(), inet: text.split('\n').filter((l) => /\bconnect\(/.test(l) && /AF_INET6?/.test(l)).length };
      };
      const live = traced(drv(''));
      ok(live.result && live.result.sent === true && live.result.outcome === 'reset' && live.inet === 0, '§10 LIVE: the helper over the stub (EMPTY CODEX_HOME) consumed and read — and the whole tree opened ZERO internet connections', JSON.stringify(live));
      const ctl8 = traced(drv("const s=require('net').connect(1,'127.0.0.1');s.on('error',()=>{});"));
      ok(ctl8.inet >= 1, '§10 LIVE CONTROL: the same run with one deliberate loopback connect is SEEN (the zero above is a measurement)', JSON.stringify(ctl8));
    } finally { try { fs.rmSync(tmp8, { recursive: true, force: true }); } catch { } }
  }
}

// lane message-facts (B-f066, design 007 S5): THE BACKFILL IS ON DEMAND — the ONE caller of an adapter's `factsOf` is the engine's
// `messageFacts`, reached only from the owner's facts route; no timer, no ingest / pass path, no agent route asks it
{
  const engSrc = engineSource(REPO);
  const calls = [...engSrc.matchAll(/adapter\.factsOf\(/g)].map((m) => m.index);
  const at = engSrc.indexOf('async function messageFacts(');
  const end = engSrc.indexOf('\n  }\n', at);
  const body = engSrc.slice(at, end);
  ok(calls.length === 1 && calls[0] > at && calls[0] < end, 'message-facts: the engine calls an adapter\'s factsOf exactly once, inside messageFacts', JSON.stringify({ calls: calls.length }));
  ok(!/setTimeout|setInterval|\.pass\(|requestRefresh/.test(body), 'message-facts: messageFacts arms no timer and starts no pass');
  const callers = [...engSrc.matchAll(/messageFacts\(/g)].length;
  const routes = ['src/routes/channels.js', 'src/agent-routes.js', 'src/routes/agent-channels.js'].filter((f) => fs.existsSync(path.join(REPO, f))).map((f) => [f, (fs.readFileSync(path.join(REPO, f), 'utf-8').match(/messageFacts\(/g) || []).length]);
  ok(callers === 1 && routes.filter(([, n]) => n).length === 1 && routes.find(([f]) => f === 'src/routes/channels.js')[1] === 1, 'message-facts: messageFacts is reached only from the owner\'s route (src/routes/channels.js), never an agent route', JSON.stringify({ callers, routes }));
  const gm = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
  ok(!/\.factsOf\(/.test(gm) && /async factsOf\(convId\) \{\n[^\n]*\n\s*const t = await api\(/.test(gm), 'message-facts: gmail\'s factsOf reads through the gate (api: token → pace → meter)');
}

// §FS design 010 (B-c9be, lane channels-full-search): THE VENDOR'S OWN SEARCH IS ASKED ONLY ON A PERSON'S ACT. Its one
// adapter call sits in the engine's `vendorSearch`, reached ONLY from the owner's press route (`searchVendor`) and the
// agent's explicit `--full` (`searchFullFor` ← `searchFor`); `around` only from the owner's sheet and the agent's
// `--around`. No timer, no ingest pass, no keystroke: the client asks the full route only from the dialog's press / its
// scroll sentinel, never from an `input` listener. A derived census over the function bodies + two planted controls.
console.log('§FS the full search: the call sites (a press, an explicit --full — never a timer, an ingest, a keystroke)');
{
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
  const bodies = (src) => { const out = new Map(); let cur = null, buf = []; for (const l of src.split('\n')) { const m = /^  (?:async\s+)?function\s+(\w+)\s*\(/.exec(l); if (m) { if (cur) out.set(cur, buf.join('\n')); cur = m[1]; buf = [l]; } else if (cur) buf.push(l); } if (cur) out.set(cur, buf.join('\n')); return out; };
  const callers = (b, re, self) => [...b].filter(([n, x]) => n !== self && re.test(x.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))).map(([n]) => n).sort().join();
  const judge = (eng, panel) => {
    const b = bodies(eng);
    const sh = panel.slice(panel.indexOf('function showSearchDialog('), panel.indexOf('/** THE OPTIONS EDITOR:'));
    return {
      adapterSearch: callers(b, /e\.adapter\.search\(/), vendorSearch: callers(b, /\bvendorSearch\(/, 'vendorSearch'), searchFullFor: callers(b, /\bsearchFullFor\(/, 'searchFullFor'),
      adapterAround: callers(b, /e\.adapter\.around\(/), aroundFor: callers(b, /\baroundFor\(/, 'aroundFor'),
      clientRoutes: (panel.match(/\/api\/channels\/search\/full/g) || []).length, keystroke: /addEventListener\('input'/.test(sh), askCalls: (sh.match(/\bask\(st/g) || []).length,
    };
  };
  const want = { adapterSearch: 'vendorSearch', vendorSearch: 'searchFullFor,searchVendor', searchFullFor: 'searchFor', adapterAround: 'aroundFor', aroundFor: 'aroundOwner,readAroundFor', clientRoutes: 1, keystroke: false, askCalls: 3 };
  const ENGS = engineSource(REPO), PANEL = read('src/lib/channels-panel.js');
  const j = judge(ENGS, PANEL);
  ok(JSON.stringify(j) === JSON.stringify(want), 'the full search\'s ONE adapter call is reached only from the press route and the agent\'s --full; around only from the sheet and --around; the client asks only on a press / the scroll sentinel / the once-retry', JSON.stringify(j));
  const rc = read('src/routes/channels.js'), ar = read('src/agent-routes.js');
  ok((rc.match(/engine\(\)\.searchVendor\(/g) || []).length === 1 && /router\.get\('\/api\/channels\/search\/full'[\s\S]{0,400}engine\(\)\.searchVendor\(/.test(rc) && (rc.match(/engine\(\)\.aroundOwner\(/g) || []).length === 1 && (ar.match(/full: req\.query\.full === '1'/g) || []).length === 1, 'the owner\'s two routes and the agent\'s one flag are the only doors');
  const tickSpot = ENGS.indexOf('  function feedDue(rec, e, t = now()) {');
  const planted = ENGS.slice(0, tickSpot) + "  function feedDue(rec, e, t = now()) {\n    vendorSearch(rec, 'x', {});" + ENGS.slice(tickSpot + '  function feedDue(rec, e, t = now()) {'.length);
  const keyed = PANEL.replace("  go.onclick = run;\n", "  go.onclick = run;\n  input.addEventListener('input', () => { for (const st of []) ask(st); });\n");
  const jp = judge(planted, PANEL), jk = judge(ENGS, keyed);
  ok(tickSpot > 0 && jp.vendorSearch.includes('feedDue') && keyed !== PANEL && jk.keystroke === true && jk.askCalls === 4, 'CONTROL: a vendor search planted in the feed\'s tick, and a keystroke listener in the dialog, are each caught by name', JSON.stringify({ tick: jp.vendorSearch, keystroke: jk.keystroke }));
}

// §FS-G design 010 S6 (lane channels-followups): GMAIL'S FULL SEARCH IS ASKED ONLY THROUGH ITS `search` / `around`. The
// engine half is §FS above (the adapter's `search` reached only from the owner's press route and the agent's --full,
// `around` only from the sheet and --around). Here the adapter half, over src/channels/gmail.js's own units (the
// adapter's methods and create()'s helpers): the request that carries the person's WORDS (`messages.list` with a `q`
// that is not one of the reconcile's own `in:sent` queries) and the per-hit metadata read live in `search` alone; the
// thread read for context in `around` alone; no other unit calls either method (no listing, ingest, push or reconcile
// path searches). Two planted copies prove the census reads what it claims.
console.log('§FS-G design 010 S6: Gmail\'s search requests live in its search / around only');
{
  const units = (src) => {
    const out = new Map(); let cur = null, buf = [];
    const head = (l) => { const m = /^  (?:async\s+)?function\s+(\w+)\s*\(/.exec(l) || /^  const (\w+) = /.exec(l) || /^    (?:async\s+)?([A-Za-z_]\w*)\s*\([^)]*\)\s*\{\s*$/.exec(l) || /^    (?:async\s+)?([A-Za-z_]\w*)\s*\(\{[^)]*\}\s*=\s*\{\}\)\s*\{\s*$/.exec(l); return m ? m[1] : null; };
    for (const l of src.split('\n')) { const n = head(l); if (n) { if (cur) out.set(cur, (out.get(cur) || '') + buf.join('\n')); cur = n; buf = [l]; } else if (cur) buf.push(l); }
    if (cur) out.set(cur, (out.get(cur) || '') + buf.join('\n'));
    return out;
  };
  const code = (x) => x.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
  const judge = (src) => {
    const u = units(src);
    const where = (pred) => [...u].filter(([, b]) => pred(code(b))).map(([n]) => n).sort().join();
    return {
      words: where((b) => b.split('\n').some((l) => /api\(`\/messages\?/.test(l) && !/in:sent/.test(l))),
      hitRead: where((b) => /'gmail search hit'/.test(b)),
      aroundRead: where((b) => /'gmail thread around'/.test(b)),
      searchCallers: [...u].filter(([n, b]) => n !== 'search' && /(?:this|adapter|impl|a)\.search\(|\bsearch\(\{\s*query/.test(code(b))).map(([n]) => n).sort().join(),
      aroundCallers: [...u].filter(([n, b]) => n !== 'around' && /(?:this|adapter|impl|a)\.around\(/.test(code(b))).map(([n]) => n).sort().join(),
      methods: ['listConversations', 'history', 'search', 'around'].filter((n) => u.has(n)).join(),
    };
  };
  const GS = fs.readFileSync(path.join(REPO, 'src/channels/gmail.js'), 'utf-8');
  const want = { words: 'search', hitRead: 'search', aroundRead: 'around', searchCallers: '', aroundCallers: '', methods: 'listConversations,history,search,around' };
  const j = judge(GS);
  ok(JSON.stringify(j) === JSON.stringify(want), 'gmail.js: the request with the person\'s words and the per-hit metadata read are in `search` only, the context read in `around` only, and no other unit calls either (the units are real: the listing, the history, search, around)', JSON.stringify(j));
  const L0 = '    async listConversations({ cursor = null, limit = 100 } = {}) {\n';
  const H0 = '    async history(convId, { anchor = null, limit = 50 } = {}) {\n';
  const planted = GS.split(L0).length === 2 ? GS.replace(L0, L0 + "      await this.search({ query: 'x' });\n") : null;
  const wordsInHistory = GS.split(H0).length === 2 ? GS.replace(H0, H0 + "      await api(`/messages?${new URLSearchParams({ q: String(convId) })}`, { what: 'x' });\n") : null;
  const jp = planted && judge(planted), jw = wordsInHistory && judge(wordsInHistory);
  ok(jp && jp.searchCallers === 'listConversations' && jw && jw.words === 'history,search', 'CONTROL: a search planted in the listing, and a words query planted in the history read, are each caught by name', JSON.stringify({ planted: jp && jp.searchCallers, words: jw && jw.words }));
}

// ── 12: SLACK'S APP CREATE WITH A PASTED SETUP TOKEN (lane slack-connect-easy, design 017) ──
// One more vendor method, allowlisted HERE with its rules (a function of the source text — a patched copy written by
// scripts/mutant-copy.mjs turns each red):
//   ONE SITE   the method name lives only in src/channels/slack-manifest.js (`CREATE_METHOD`); slack.js builds the request
//              once (`Manifest.createRequest(`) inside `createApp`, a JSON POST with the PASTED token as the Bearer;
//   ONE PER HUMAN ACT  `createApp(` is invoked once — the paste exchange's `create` branch, reached only through
//              `oauth.forwardCallback(` from `finish()` (a person pressed "Create the app"), and the token is dropped in
//              that branch's `finally`;
//   KEPT / DROPPED  the answer's `app_id` (and a workspace when named) is read; `credentials` / `client_secret` /
//              `signing_secret` / `oauth_authorize_url` are never read on this (http) path.
{
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"\\])\/\/[^'"\n]*$/gm, '$1');
  const bodyOf = (S, head) => { const at = S.indexOf(head); if (at < 0) return ''; const end = S.indexOf('\n  }\n', at); return end < 0 ? '' : S.slice(at, end); };
  const census = (slackSrc, serverTexts) => {
    const rows = [];
    const S = strip(slackSrc);
    // a user-facing i18nKey('…') sentence may NAME the method (the registry row's describe); a request cannot be built from one
    const where = []; for (const [rel, text] of Object.entries(serverTexts)) { const n = (strip(text).replace(/i18nKey\('(?:[^'\\]|\\.)*'\)/g, '').match(/apps\.manifest\.create/g) || []).length; if (n) where.push(`${rel}:${n}`); }
    rows.push(['ONE SITE: the method name `apps.manifest.create` appears once in the server tree — slack-manifest.js\'s CREATE_METHOD', where.join() === 'src/channels/slack-manifest.js:1', where.join()]);
    const ca = bodyOf(S, '  async function createApp(setupToken, ownerName) {');
    rows.push(['ONE SITE: slack.js builds the create request once, inside createApp — a JSON POST whose Bearer is the pasted token', (S.match(/Manifest\.createRequest\(/g) || []).length === 1 && /const req = Manifest\.createRequest\(manifest\);/.test(ca) && (S.match(/callSlack\(fetchFn, req\.method, req\.body, \{ token: setupToken, json: true \}\)/g) || []).length === 1 && /callSlack\(fetchFn, req\.method, req\.body, \{ token: setupToken, json: true \}\)/.test(ca), `createApp body ${ca.length} chars`]);
    const calls = (S.match(/(?<![.\w$])createApp\(/g) || []).length;
    rows.push(['ONE PER HUMAN ACT: createApp is invoked once — the paste exchange\'s `create` branch, the token dropped in its finally', calls === 2 && /if \(act\.act === 'create'\) \{\n\s*try \{ return await createApp\(pasted, label\); \} finally \{ pasted = null; \}/.test(S), `bare occurrences ${calls}`]);
    rows.push(['ONE PER HUMAN ACT: the exchange is reached only through finish() → oauth.forwardCallback (a paste)', (S.match(/\.forwardCallback\(/g) || []).length === 2 && /if \(fl && fl\.mode === 'public'\) \{[^\n]*\n\s*const r = await oauth\.forwardCallback\(flowId, typeof pasted === 'string' \? pasted : ''\);/.test(S) && /async finish\(flowId, pasted, \{ box = null \} = \{\}\) \{[\s\S]*?const r = await oauth\.forwardCallback\(flowId, pasted\.trim\(\), \{ box: b \}\);/.test(S), '']);
    // design 018: `client_secret` may name the workspace app's OWN secret only inside callSlack's Basic-auth scrub
    const cs0 = S.indexOf('async function callSlack('), S2 = cs0 < 0 ? S : S.slice(0, cs0) + S.slice(S.indexOf('\n}\n', cs0));
    rows.push(['KEPT / DROPPED: createApp reads the app id and never the credentials, the client / signing secret or the authorize URL', /a\.app_id/.test(ca) && !/credentials|client_secret|signing_secret|verification_token|oauth_authorize_url/.test(ca) && !/\.credentials\b|client_secret|oauth_authorize_url/.test(S2), '']);
    return rows;
  };
  const serverTexts = {};
  for (const f of files) { const rel = path.relative(REPO, f); try { serverTexts[rel] = fs.readFileSync(f, 'utf-8'); } catch { } }
  const slackRel = 'src/channels/slack.js';
  const slackSrc = serverTexts[slackRel];
  ok(typeof slackSrc === 'string' && typeof serverTexts['src/channels/slack-manifest.js'] === 'string', '§12 slack.js and slack-manifest.js are in the server census');
  for (const [name, pass_, detail] of census(slackSrc, serverTexts)) ok(pass_, '§12 ' + name, detail);
  const MUT = mutantCopies('vendor-whitelist-slack', REPO);
  const reds = (rows) => rows.filter((r) => !r[1]).map((r) => r[0]);
  const mut = (tag, from, to) => { if (!slackSrc.includes(from)) return null; const f = MUT.write(slackRel, slackSrc.replace(from, to), tag); return fs.readFileSync(f, 'utf-8'); };
  const keeps = mut('keeps-credentials', '    const appId = typeof a.app_id', '    const kept = a.credentials && a.credentials.client_secret; void kept;\n    const appId = typeof a.app_id');
  ok(keeps && reds(census(keeps, { ...serverTexts, [slackRel]: keeps })).some((n) => /KEPT/.test(n)), '§12 CONTROL: a copy that reads the create\'s credentials is RED');
  const twice = mut('second-caller', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n      if (cursor === \'x\') await createApp(\'\', \'\');\n');
  ok(twice && reds(census(twice, { ...serverTexts, [slackRel]: twice })).some((n) => /ONE PER HUMAN ACT/.test(n)), '§12 CONTROL: a copy that also creates from the conversation listing is RED');
  const keepsToken = mut('no-drop', 'try { return await createApp(pasted, label); } finally { pasted = null; }', 'return await createApp(pasted, label);');
  ok(keepsToken && reds(census(keepsToken, { ...serverTexts, [slackRel]: keepsToken })).some((n) => /ONE PER HUMAN ACT/.test(n)), '§12 CONTROL: a copy that does not drop the setup token is RED');
  // ── 13: THE WORKSPACE APP'S CODE EXCHANGE (lane slack-workspace-app, design 018) ──
  //   ONE SITE   `oauth.v2.access` lives only in slack-manifest.js (`EXCHANGE_METHOD`); slack.js calls it once, inside
  //              `exchangeCode`, the app's id + secret as HTTP Basic and the consent's own redirect_uri beside the code
  //              (Slack refuses a mismatch; with several registered URLs it needs it on both steps);
  //   ONE PER HUMAN ACT  `exchangeCode(` is invoked once — the public begin's `exchange` closure, which oauth-loopback
  //              runs at most once per state (the landing route or a paste);
  //   THE SECRET  `.secret()` is read once, inside that call's arguments — never kept in a variable.
  const census13 = (slackText, texts) => {
    const S = strip(slackText), rows = [];
    const where = []; for (const [rel, text] of Object.entries(texts)) { const n = (strip(text).replace(/i18nKey\('(?:[^'\\]|\\.)*'\)/g, '').match(/oauth\.v2\.access/g) || []).length; if (n) where.push(`${rel}:${n}`); }
    rows.push(['ONE SITE: the method name `oauth.v2.access` appears once in the server tree — slack-manifest.js\'s EXCHANGE_METHOD', where.join() === 'src/channels/slack-manifest.js:1', where.join()]);
    const ex = bodyOf(S, '  async function exchangeCode(code, redirectUri, cancelled) {');
    rows.push(['ONE SITE: exchangeCode posts the code with the consent\'s redirect_uri, the app authenticated by HTTP Basic', (S.match(/Manifest\.EXCHANGE_METHOD/g) || []).length === 1 && /callSlack\(fetchFn, Manifest\.EXCHANGE_METHOD, \{ code: String\(code\), \.\.\.\(redirectUri \? \{ redirect_uri: redirectUri \} : \{\}\) \}, \{ basic: \{ id: c\.clientId, secret: c\.secret\(\) \} \}\)/.test(ex), '']);
    const calls13 = (S.match(/(?<![.\w$])exchangeCode\(/g) || []).length;
    rows.push(['ONE PER HUMAN ACT: exchangeCode is invoked once — the public begin\'s exchange closure', calls13 === 2 && /exchange: async \(\{ code, redirectUri, cancelled = null \}\) => exchangeCode\(code, redirectUri, cancelled\),/.test(S), `bare occurrences ${calls13}`]);
    rows.push(['THE SECRET: read once, inside the exchange call\'s arguments', (S.match(/\.secret\(\)/g) || []).length === 1 && !/=\s*c\.secret\(\)/.test(S), '']);
    return rows;
  };
  for (const [name, pass_, detail] of census13(slackSrc, serverTexts)) ok(pass_, '§13 ' + name, detail);
  const noRedirect = mut('no-redirect', '{ code: String(code), ...(redirectUri ? { redirect_uri: redirectUri } : {}) }', '{ code: String(code) }');
  ok(noRedirect && reds(census13(noRedirect, { ...serverTexts, [slackRel]: noRedirect })).some((n) => /ONE SITE: exchangeCode/.test(n)), '§13 CONTROL: a copy that drops the redirect_uri from the exchange is RED');
  const twice13 = mut('exchange-twice', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n', '    async listConversations({ cursor = null, limit = 100 } = {}) {\n      if (cursor === \'x\') await exchangeCode(\'c\', null, null);\n');
  ok(twice13 && reds(census13(twice13, { ...serverTexts, [slackRel]: twice13 })).some((n) => /ONE PER HUMAN ACT/.test(n)), '§13 CONTROL: a copy that also exchanges from the conversation listing is RED');
  const keeps13 = mut('keeps-secret', '    const c = workspaceClient();\n    let r;\n    try { r = await callSlack(fetchFn, Manifest.EXCHANGE_METHOD', '    const c = workspaceClient();\n    const kept = c.secret(); void kept;\n    let r;\n    try { r = await callSlack(fetchFn, Manifest.EXCHANGE_METHOD');
  ok(keeps13 && reds(census13(keeps13, { ...serverTexts, [slackRel]: keeps13 })).some((n) => /THE SECRET/.test(n)), '§13 CONTROL: a copy that keeps the secret in a variable is RED');
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 3, label: '§12 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
}

// §14 B-2198 THE CHANNELS RAW API (docs/design-channel-raw-api.md) — the ONE allow-listed pass-through vendor surface:
// src/server/channel-api.js constructs vendor requests at ONE site (`vendorFetch`), only to the hosts the credential's
// DECLARED row names (an adapter's `api` row beside its `apiBearer`; the storage mounts' row + its `refresh` token
// endpoint — lane channel-api-declared: the core names no vendor), never following a redirect, and only behind
// the grant (`tierNow(ctx`) and the account's meter (`c.gate()` / `c.charge()`); no other file reaches `rawApi`'s fetch.
// Controls: the host gate cut, the meter cut, the grant cut — each RED.
console.log('§14 the Channels raw API: ONE fetch site, the host table, the grant, the account meter');
{
  const rel = 'src/server/channel-api.js';
  const src0 = fs.readFileSync(path.join(REPO, rel), 'utf8');
  const fence = fs.readFileSync(path.join(REPO, 'src/channel-api.js'), 'utf8');
  const census14 = (src) => {
    const bad = [];
    const sites = (src.match(/\bfetchFn\(/g) || []).length;
    if (sites !== 1) bad.push(`${sites} fetch sites — exactly ONE (vendorFetch)`);
    // a raw global fetch( beside fetchFn (redirects followed, no host table) is a second site too (verify r1)
    const raw = (src.match(/(?<![\w.])fetch\(/g) || []).length;
    if (raw) bad.push(`${raw} raw fetch( call(s) — every vendor request goes through vendorFetch`);
    const vf = (src.match(/\n  function vendorFetch\([\s\S]*?\n  \}/) || [''])[0];
    if (!/if \(u\.protocol !== 'https:' \|\| !hosts\.has\(u\.host\)\) throw/.test(vf)) bad.push('THE HOST TABLE gate is gone from vendorFetch');
    if (!/redirect: 'manual'/.test(vf)) bad.push('vendorFetch follows redirects (THE REDIRECT RULE)');
    const call = (src.match(/\n  async function call\([\s\S]*?\n  \}\n/) || [''])[0];
    const iGate = call.indexOf('const g = c.gate();'), iRun = call.indexOf('await run(');
    if (iGate < 0 || iRun < 0 || iGate > iRun || !/if \(g\) \{/.test(call)) bad.push('THE ACCOUNT METER (c.gate) is not asked before the run');
    if (!/const tr = tierNow\(ctx, cred\);\n    const c = tr\.tier !== 'none' \? credentialOf\(cred\) : null;\n    if \(!c\) return NOT_GRANTED\(\);/.test(call)) bad.push('THE GRANT (tierNow) is not asked before the credential is resolved');
    const runB = (src.match(/\n  async function run\([\s\S]*?\n  \}\n/) || [''])[0];
    if (!/c\.charge\(\);\n\s+res = await vendorFetch\(/.test(runB)) bad.push('a vendor request is not charged to the account meter');
    return bad;
  };
  ok(census14(src0).length === 0, '§14 the raw API: ONE fetch site behind the host table, no redirect, the grant, the account meter', census14(src0).join('; '));
  ok(src0.includes('await vendorFetch(row.refresh,') && census14(src0.replace('await vendorFetch(row.refresh,', 'await fetch(row.refresh,')).length > 0, 'CONTROL: §14 a raw fetch( planted beside vendorFetch (the mount refresh) is red (verify r1)');
  // THE HOSTS ARE DERIVED FROM THE DECLARATIONS (never a second hand list): every adapter module's `api` row + the mounts'
  const chDir = path.join(REPO, 'src/channels');
  const declared = [...fs.readdirSync(chDir).filter((f) => /\.js$/.test(f)).map((f) => require(path.join(chDir, f))).filter((m) => m && m.adapter && m.adapter.api).map((m) => ({ who: m.adapter.kind, row: m.adapter.api })),
    ...Object.entries(require(path.join(REPO, 'src/mounts.js')).MountManager.OAUTH_API).map(([v, row]) => ({ who: `mount-${v}`, row }))];
  const reach = declared.flatMap(({ who, row }) => [...row.hosts, ...(row.refresh ? [new URL(row.refresh).host] : [])].map((h) => `${who}:${h}`));
  const hostLit = /['"`](https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|cn|net|org|io|ai|dev|app)\b/i;
  ok(declared.length >= 4 && !reach.some((x) => /anthropic|claude\.ai/i.test(x)) && !/anthropic|claude\.ai/i.test(fence + src0) && !hostLit.test(fence) && !hostLit.test(src0), `§14 the hosts are the DECLARED rows' (${declared.map((d) => d.who).join(', ')}) — no Anthropic endpoint among them, and the fence + orchestrator hold no host literal`, reach.join(' '));
  const others = fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).map((f) => `src/${f}`).filter((f) => /\.js$/.test(f) && f !== rel && /\brawApi\b/.test(fs.readFileSync(path.join(REPO, f), 'utf8')) && /\bvendorFetch\(/.test(fs.readFileSync(path.join(REPO, f), 'utf8')));
  ok(others.length === 0, '§14 no other file calls the raw API\'s vendorFetch', others.join(', '));
  const cut = (a, b) => (src0.split(a).length === 2 ? src0.replace(a, b) : null);
  const ctl = [
    ['the host gate cut', cut(" || !hosts.has(u.host)) throw", ") throw"), /HOST TABLE/],
    ['the meter cut', cut("    const g = c.gate();\n    if (g) {", "    const g = null;\n    if (g) {"), /ACCOUNT METER/],
    ['the grant cut', cut("    const c = tr.tier !== 'none' ? credentialOf(cred) : null;", "    const c = credentialOf(cred);"), /THE GRANT/],
    ['the charge cut', cut("        c.charge();\n", ""), /charged/],
  ];
  const r = ctl.map(([n, s, re]) => ({ n, red: !!s && census14(s).some((x) => re.test(x)) }));
  ok(r.every((x) => x.red), `§14 CONTROLS: ${r.map((x) => `${x.n} (${x.red ? 'RED' : 'missed'})`).join(', ')}`);
}

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
