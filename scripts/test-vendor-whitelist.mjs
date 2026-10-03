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

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
