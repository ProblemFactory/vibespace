#!/usr/bin/env node
// CHAT INFERENCE E2E (2.337.0, owner: "有long-lived token做CI, 用haiku就行").
// The last uncovered face of 核心工作流: a REAL chat session through the
// product's own pipeline — ws create → accounts oat plumbing → chat-wrapper
// stream-json spawn → normalizer → ws msg push → status settle → kill. One
// haiku turn per push (~500 tokens against the token's subscription quota).
//
// TOKEN SLOT: env VIBESPACE_CI_OAT, else ~/.config/vibespace/ci-oat (chmod
// 600; fill with the output of `claude setup-token`). No token, or no claude
// CLI → clean SKIP, so contributors and secretless CI stay green.
// §ban-safety NOTE (corrected 2026-08-14 by the owner + official docs): the
// oat-in-Actions channel is OFFICIALLY documented (docs/en/github-actions —
// CLAUDE_CODE_OAUTH_TOKEN as a repo secret authenticates a Claude
// subscription in CI), i.e. the ToS "explicitly permit" carve-out. The ban
// postmortem's datacenter-IP co-factor applied to RAW token usage in
// unofficial shapes, not this sanctioned channel. Wired via the
// VIBESPACE_CI_OAT secret; fork PRs get no secret and SKIP.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePort, vncEnv, handedCli, REHOMED } from './scratch.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { skipVerdict, maskText } from './chat-e2e-why.mjs';   // B-5a57: a missing reply says why — a SKIP only on THIS turn's own failure (its legs: test-ci-gate)
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const { fixtureLitter, isFixtureProjectDir, FIXTURE_STALE_MS } = require('../src/fixture-guard.js');

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// THE SWITCH (lane claude-steer-inject r6, §ban-safety): one of the TWO rows that may bill a real turn — VS_NO_REAL_CLI=1 (every
// acceptance run sets it) skips it by name, before a token is read
if (process.env.VS_NO_REAL_CLI === '1') { console.log('SKIPPED test-chat-e2e: VS_NO_REAL_CLI=1 — the real haiku turn is not run'); process.exit(0); }
let token = process.env.VIBESPACE_CI_OAT || '';
if (!token) { try { token = fs.readFileSync(path.join(os.homedir(), '.config', 'vibespace', 'ci-oat'), 'utf-8').trim(); } catch { } }
if (!token) { console.log(`SKIP: no CI token (VIBESPACE_CI_OAT, or ~/.config/vibespace/ci-oat from \`claude setup-token\`${REHOMED ? ' — this run is RE-HOMED, so it reads the env alone: the file of the home it was handed is not read' : ''})`); process.exit(0); }
// B-ba47: the REAL claude of the env this suite was HANDED (scratch.mjs REAL_CLI_ALLOW's row — a re-homed suite's PATH is
// built and carries no CLI); its hub is handed it by name (CLAUDE_CMD)
const CLAUDE_REAL = handedCli('claude');
if (!CLAUDE_REAL) { console.log('SKIP: no claude CLI on the handed env (PATH, ~/.local/bin, $VS_CLAUDE_BIN)'); process.exit(0); }

const MODEL = process.env.VIBESPACE_CI_MODEL || 'claude-haiku-4-5-20251001';
const PORT = await freePort(); // free port (2.369.46): fixed 3995 collided between concurrent gates
// THE SUITES' ONE HUB BOOT (P0 of the separation, 2026-11-17): the tree, the home and the session's cwd live in ONE root the
// helper minted; at exit it ends the hub and everything rooted there, removes the worktree through git, then the root
const root = mintRoot('chat-e2e');
const wt = path.join(root, 't');
// ISOLATED $HOME (2026-09-09). This suite runs ONE real haiku turn on every
// non-docs push, so the CLI wrote a real transcript into the developer's REAL
// ~/.claude/projects — and the cleanup that removed it sat at the very END of
// the happy path, after four `process.exit(1)` returns. Measured before this
// change: 155 dead cursor entries in the production ledger from this suite's
// throwaway cwds alone, plus one junk "conversation" per push in the sidebar.
//
// MEASURED (2026-09-09, claude 2.1.263): the real CLI serves a full turn under
// a throwaway HOME with the oat riding CLAUDE_CODE_OAUTH_TOKEN alone —
// `system/init` -> `assistant` -> `result/success` in 2.4 s, no onboarding
// gate, transcript in THAT home. The account this suite seeds is oat-only by
// construction (a fresh worktree data/ has no credential dir), so
// `resolveForSpawn` takes the `oatOnly` branch and the token is the whole
// login. HOME is not in AGENT_ENV_DROP, so the server hands it to the CLI it
// spawns.
const fakeHome = path.join(root, 'home');
for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
// >>> real-home sweep (THE DECLARED WRITE EXCEPTION — do not widen)
// SWEEP what earlier versions of this suite left in the REAL home (the wire
// probe's r5/r6 contract, same threshold, same "spare a run in flight" rule).
// A leftover younger than the threshold may be a CONCURRENT copy of this suite
// — two worktrees pushing minutes apart really do overlap.
//
// This block is the ONLY place this suite writes under the developer's real
// home, and it is a DELETE of names this suite itself minted. It is declared in
// scripts/test-fixture-isolation.mjs's WRITE_EXEMPT and PAID FOR there, and the
// payment is scoped to THESE SENTINELS, not to the file: the census is re-run
// over this file with the region between them removed and must come back
// EMPTY, so a second real-home write anywhere else in this suite goes red even
// though the suite is "exempt". The three gates below (the declared fixture
// convention, this suite's own name, and the shared staleness threshold) are
// asserted there too — widen any of them and the gate goes red.
const swept = [];
{
  const sweptAt = Date.now();
  for (const d of (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })()) {
    if (!d.isDirectory() || !isFixtureProjectDir(d.name) || !d.name.includes('chat-e2e')) continue;
    const p = path.join(REAL_PROJECTS, d.name);
    let ageMs = -1; try { ageMs = sweptAt - fs.statSync(p).mtimeMs; } catch { continue; }
    if (ageMs <= FIXTURE_STALE_MS) continue;
    try { fs.rmSync(p, { recursive: true, force: true }); swept.push(d.name); } catch { }
  }
  if (swept.length) console.log(`  swept ${swept.length} stale leftover(s) from earlier runs: ${swept.slice(0, 3).join(', ')}`);
}
// <<< real-home sweep
let failed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + String(e).slice(0, 300) : ''}`); } };
// B-5a57 cure: a SKIP is not a green — each is COUNTED and said in the closing line, which never reads ALL PASS over one
let skipped = 0;
const skip = (m) => { skipped++; console.log('  ⚠ SKIP: ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) {
  execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
}
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));

// seed the CI billing identity through the REAL account store (worktree data/)
const { AccountManager } = require(path.join(wt, 'src', 'accounts.js'));
const am = new AccountManager({ dataDir: path.join(wt, 'data') });
const acct = am.createSubscription({ name: 'CI-oat' });
am.setOat(acct.id, token);

const cwd = path.join(root, 'cwd');
fs.mkdirSync(cwd, { recursive: true });
// NO AMBIENT API KEY (B-5f0b): agentEnv() hands ANTHROPIC_API_KEY /
// ANTHROPIC_AUTH_TOKEN to the CLI (a user's own choice), and either one
// OUTRANKS the oat this suite seeds — the turn would bill metered API while
// the badge assert below still read "the oat account".
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: CLAUDE_REAL, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' } });
// UNCONDITIONAL cleanup (2026-09-09): the transcript, the home and the worktree went at the very END of the happy path, so every
// early `process.exit(1)` — and every signal — left them behind. Since the one boot helper they all live in its root and go at
// 'exit' with it; the helper arms SIGTERM / SIGINT / SIGHUP itself (each an exit), so this suite carries no signal line.
// BOOT WAIT sized for a LOADED box (2.369.75 gate: the fast tier runs beside
// three implementer workflows on a 3,900-process machine; the worktree server
// took longer than the old 15 s, the loop gave up SILENTLY and the WebSocket
// below threw an unhandled ECONNREFUSED at 18 s). 120 s is a floor (hub.ready's
// own); a server that never answers is a LOUD fail naming the wait, never a stack trace.
const booted = await hub.ready();
check(`worktree server answered /api/home within the boot budget (${booted ? 'yes' : 'NO — 120 s elapsed'})`, verdictOf(booted));
if (!booted) console.log(hub.log().slice(-2000));
if (!booted) { console.log('FAIL'); process.exit(1); }

const WebSocket = require('ws');
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
// a refused/dropped socket is an ASSERT with a reason, not an unhandled 'error' event
const wsOpened = await new Promise((r) => { ws.once('open', () => r(true)); ws.once('error', (e) => { console.log('  ws error: ' + (e && e.message)); r(false); }); });
check('websocket connected to the worktree server', verdictOf(wsOpened));
if (!wsOpened) { console.log('FAIL'); process.exit(1); }
const frames = [];
ws.on('message', (d) => { const s = d.toString(); frames.push(s); });

ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd, model: MODEL, accountId: acct.id, reqId: 'ci1' }));
let sid = null;
for (let i = 0; i < 60 && !sid; i++) {
  const f = frames.map((s) => { try { return JSON.parse(s); } catch { return null; } }).find((m) => m?.type === 'created');
  if (f) sid = f.sessionId; else await sleep(500);
}
check('chat session created through the real spawn path', !!sid, frames.slice(-3).join('\n'));
if (!sid) { console.log('FAIL'); process.exit(1); }

// the magic word is DERIVED in the reply, so our own prompt echo can't match
const turnFrom = frames.length;   // B-5a57 cure: the frames from here on are THIS turn's (the ones before are its creation's)
ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'Do not use any tools. Concatenate the words CANARY and GREEN with an underscore and reply with only that.', msgId: 'ci-m1' }));
let replied = false;
for (let i = 0; i < 180 && !replied; i++) {
  replied = frames.some((s) => s.includes('assistant') && s.includes('CANARY_GREEN'));
  await sleep(1000);
}
// CLASSIFY A MISSING REPLY (2.369.71 gate, five runs): the gate's one real turn
// bills a real account, and that account can be rate-limited or the API can
// error — the CLI then emits an api_error / an is_error result and no assistant
// text ever exists. That proves the pipeline up to the API (spawn → prompt →
// request sent) and disproves nothing of ours; a hard RED there blocked every
// push while the owner's subscriptions were exhausted. Evidence, not a
// guess: the ws frames carry the error result / API error text, and the
// receiver counted the CLI's own api_error event.
// B-5a57 cure (主开发 08:54Z): A SKIP IS NOT A GREEN AND ITS ROAD IS NARROW. Only THIS turn's own failure skips: its own frames
// (they name its session, from its prompt on), its own buffer's result record, the hub's api_error count (this scratch hub runs
// this one session). Limit words in any other frame (a usage broadcast, another conversation) never turn a break into a SKIP.
const buffer = replied ? '' : (() => { try { return fs.readFileSync(path.join(wt, 'data', 'session-buffers', `${sid}.buf`), 'utf8'); } catch { return ''; } })();
let otelApiErrors = 0;
if (!replied) { try { otelApiErrors = Number((await (await fetch(`http://127.0.0.1:${PORT}/api/otel-stats`)).json())?.events?.api_error) || 0; } catch { } }
const verdict = replied ? null : skipVerdict({ frames, buffer, sessionId: sid, from: turnFrom, otelApiErrors });
if (verdict) console.log(`  · the missing reply, read whole: ${JSON.stringify(verdict.why)} — this turn's own frames: ${verdict.own}`);
if (replied) check('haiku inference round-trip: assistant reply flows back over ws (chat-wrapper → normalizer → push)', true);
else if (verdict.skip) skip(`the billing account could not serve the haiku turn (this turn's own ${verdict.kind}: ${verdict.evidence}) — request sent, no reply to round-trip; nothing of ours disproven`);
else check('haiku inference round-trip: assistant reply flows back over ws (chat-wrapper → normalizer → push)', false, `${verdict.kind}: ${JSON.stringify(verdict.why.result)} ${verdict.why.text} — last frames: ${maskText(frames.slice(-3).join('\n')).slice(0, 400)}`);

// the turn must SETTLE (result processed — the /compact-class "stuck on thinking" regressions)
let settled = false;
for (let i = 0; i < 30 && !settled; i++) {
  try {
    const act = await (await fetch(`http://127.0.0.1:${PORT}/api/active`)).json();
    const s = (act.sessions || act || []).find?.((x) => x.id === sid || x.sessionId === sid);
    settled = s ? !(s.isStreaming || s.chatStatus === 'streaming') : false;
  } catch { }
  if (!settled) await sleep(1000);
}
check('turn settles (result record processed, not stuck streaming)', verdictOf(settled));

// billing identity really was the oat account (badge path)
try {
  const act = await (await fetch(`http://127.0.0.1:${PORT}/api/active`)).json();
  const s = (act.sessions || act || []).find?.((x) => x.id === sid || x.sessionId === sid);
  check('session bills through the seeded oat account', (s?.accountId || s?.account) === acct.id, JSON.stringify(s?.accountId));
} catch (e) { check('session bills through the seeded oat account', false, e.message); }

// OTel truth loop (2.361.0): the spawned session got OTEL_* env pointing at
// the worktree server's /otel receiver — the CLI's api_request event should
// land in the truth stash (proves env injection + receiver + parser E2E).
// Exporter flushes every 5s; poll past the settle.
//
// CLASSIFY THE MISS (2.367.1). This assertion failed on EVERY GitHub Actions
// push from 2.361.0 to 2.367.0 — 20+ red runs and a failure email each time —
// while the same test passed locally, because whether the CLI exports OTel at
// all is a property of the RUNNER, not of our pipeline. So: no OTLP post ever
// arriving is reported as a loud SKIP (nothing of ours is proven, nothing of
// ours is broken); posts arriving but no usable api_request IS our bug and
// still fails. The receiver's own counters make the two distinguishable.
{
  const stashFp = path.join(wt, 'data', 'usage-history', 'otel-truth.ndjson');
  let truthOk = false, tail = '';
  for (let i = 0; i < 24 && !truthOk; i++) {
    try {
      tail = fs.readFileSync(stashFp, 'utf-8').trim();
      truthOk = tail.split('\n').some((l) => { try { const r = JSON.parse(l); return r.event === 'api_request' && r.rid && r.orgUuid; } catch { return false; } });
    } catch { }
    if (!truthOk) await sleep(1000);
  }
  let st = null;
  try { st = await (await fetch(`http://127.0.0.1:${PORT}/api/otel-stats`)).json(); } catch { }
  const posts = st?.posts || 0, rejected = st?.rejected || 0, kept = st?.kept || 0, noOrg = st?.noOrg || 0, noRid = st?.noRid || 0;
  const stat = JSON.stringify(st);
  if (truthOk) {
    check('OTel truth stash captured the real api_request (env→receiver→parser E2E)', true);
  } else if (posts === 0 && rejected === 0) {
    // the runner's CLI exported nothing — nothing of ours is proven OR broken
    skip(`this CLI/runner exported no OTLP logs at all — ${stat}`);
  } else if (kept > 0 && (noOrg + noRid) >= kept) {
    // Everything of OURS worked: env injected → exporter posted → parser
    // understood the payload and found api_request records. They are dropped
    // before the stash because THIS IDENTITY's events carry no
    // organization.id (or no request id) — a property of the account (CI runs
    // on a personal setup-token), not a defect. Assert what is actually
    // provable here.
    check(`OTel E2E reached the parser: api_request records arrived and parsed (stash needs organization.id + request id, which this identity does not send — ${stat})`, true);
  } else if (kept === 0) {
    // OTLP posts arrived but the parser found NO api_request record in the poll
    // window — indistinguishable from "the CLI did not export an api_request
    // here" (a different event flushed first, or the api_request batch had not
    // flushed before the turn ended). That is a runner/timing property, not our
    // pipeline: env injection + the receiver are proven by the post arriving.
    // (2.369.71 gate: a single non-api_request post reached this box; the old
    // code hard-failed it. A parser regression on a REAL api_request instead
    // lands in the kept>0 branch below, which still FAILS.)
    skip(`OTLP posted but no api_request record parsed in the window (posts=${posts}) — runner/timing, env→receiver proven — ${stat}`);
  } else {
    // api_request records parsed WITH usable identity, yet the stash is empty —
    // that IS our pipeline (parser→stash) breaking, and it stays a hard failure.
    check(`OTel truth stash captured the real api_request (${stat})`, false, tail.slice(-200));
  }
}

ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
await sleep(1500);

// THE REAL HOME IS UNTOUCHED. The CLI's transcript went to the isolated home
// (removed with the helper's root at exit), so this asserts the CONSEQUENCE rather than trusting
// the env var: no fixture entry appeared in the developer's own projects dir.
{
  const { cwdToProjectDir } = require(path.join(wt, 'src', 'session-store.js'));
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures; swept ${swept.length} stale)`,
    lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
  check('…and this suite\'s own cwd is not among them (the CLI wrote under the isolated home)',
    !after.some((d) => d.name === cwdToProjectDir(cwd)), cwdToProjectDir(cwd));
  // POSITIVE CONTROL: the isolation must not be "the CLI never ran". A real
  // turn leaves a real transcript — under the ISOLATED home.
  const iso = path.join(fakeHome, '.claude', 'projects');
  const isoDirs = (() => { try { return fs.readdirSync(iso); } catch { return []; } })();
  check(`the real turn's transcript landed under the ISOLATED home (${isoDirs.length} project dir(s))`,
    verdictOf(isoDirs.includes(cwdToProjectDir(cwd))), JSON.stringify(isoDirs.slice(0, 3)));
}
ws.close();
console.log(failed ? `\n${failed} FAILED${skipped ? ` · ${skipped} SKIPPED` : ''}` : skipped ? `\n${skipped} SKIPPED — not a pass: what each skip names was not proven` : '\nALL PASS');
process.exit(failed ? 1 : 0); import { verdictOf } from './lib/check.mjs';
