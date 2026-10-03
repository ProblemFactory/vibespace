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
const require = createRequire(import.meta.url);

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
  // refreshAvailableModels' v1/models fetch (both auth types) — lived in
  // server.js until the 2.325.0 decomposition moved the CLI environment out
  'src/server/cli-env.js': { max: 4, gates: ['usagePollingEnabled'] },
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
  /** THE CENSUS: rows [name, pass, detail] over the engine's + the routes' + every server file's text. */
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
    rows.push(['ON-DEMAND: the engine\'s attachment() is called ONLY by the GET attachment route (every `.attachment(` in the server tree)', /engine\(\)\.attachment\(/.test(routeBody) && engineCallers.length === 1 && engineCallers[0] === 'src/routes/channels.js', engineCallers.join(', ')]);
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
  const noCache = mutEngine('no-cache', 'const hit = store.attachmentGet(adapterId, convId, attId);', 'const hit = null;');
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
  for (const x of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 6, label: '§7 ' })) ok(x.pass, x.name + (x.pass ? '' : ' — ' + x.detail));
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
  const keeperSrc = fs.readFileSync(path.join(REPO, keeperRel), 'utf-8'), routesSrc = fs.readFileSync(path.join(REPO, routesRel), 'utf-8');
  const serverTexts = Object.fromEntries(files.map((f) => [path.relative(REPO, f), (() => { try { return fs.readFileSync(f, 'utf-8'); } catch { return ''; } })()]));
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
  const timer = mut('timer', keeperRel, keeperSrc, '  const reattached = reattachInstall();', '  const reattached = reattachInstall(); setInterval(() => { try { api.installCli({}); } catch { /* none */ } }, 3600e3);');
  ok(reds(slotCensus(timer, routesSrc, { ...serverTexts, [keeperRel]: timer })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a keeper that installs on a timer is RED');
  const open = mut('agent-token', routesRel, routesSrc, "  if (refuseAgentBearer(req, res, INSTALL_IS_USERS)) return;\n  const k = keeperOr503(res); if (!k) return;\n  if (typeof k.installCli", "  const k = keeperOr503(res); if (!k) return;\n  if (typeof k.installCli");
  ok(reds(slotCensus(keeperSrc, open, { ...serverTexts, [routesRel]: open })).some((n) => /USER-ONLY/.test(n)), '§8 CONTROL: a CLI install route an agent token reaches is RED');
  const twoSlots = mut('two-slots', keeperRel, keeperSrc, "VERBS.cliInstallVerdict({ version: String(version || ''), running: installState.running,", "VERBS.cliInstallVerdict({ version: String(version || ''), running: false,");
  ok(reds(slotCensus(twoSlots, routesSrc, { ...serverTexts, [keeperRel]: twoSlots })).some((n) => /ONE SLOT/.test(n)), '§8 CONTROL: a CLI install that ignores the slot is RED');
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
  const engineSrc = serverTexts[engineRel];
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

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
