#!/usr/bin/env node
// THE EXIT FORENSICS' SOURCE PINS AND CENSUSES (fast — source text, plus the few PURE in-process legs that sat inside the moved blocks; no browser, server or hub — lane text-legs, B-94d3). MOVED VERBATIM from the heavy
// scripts/test-exit-forensics.mjs (its real-teardown legs, its stop / respawn legs and every mutant-copy CONTROL stay there): the
// unexpected-exit wiring pins (server.js, src/lib/app.js, src/lib/session-lifecycle.js), § 5 THE WIRING PINS over the source
// (src/server/session-stdout.js, src/proc-identity.js, src/kept-copies.js, src/harnesses/claude-transport.js, src/hosts.js and the
// three wrappers data/bin/chat-wrapper.js, data/bin/pty-wrapper.js, data/bin/codex-chat-wrapper.js), § 6c THE KILL-DOOR CENSUS,
// the resume words in src/lib/i18n-zh.js / src/lib/i18n-ja.js, and server.js's one heal entry point with its callers' census.
// Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of one of them.
// Run: node scripts/test-exit-forensics-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? `\n      ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
const REL = { chat: 'data/bin/chat-wrapper.js', pty: 'data/bin/pty-wrapper.js', codex: 'data/bin/codex-chat-wrapper.js' };
const chatSrc = read(REL.chat);
const ptySrc = read(REL.pty);
const codexSrc = read(REL.codex);
const SRC = { chat: chatSrc, pty: ptySrc, codex: codexSrc };
const KINDS = ['chat', 'pty', 'codex'];

console.log('— the unexpected-exit wiring (source pins)');
{
  // WIRING PINS: the server installs it with the live clients; the client routes the ask to the sidebar Resume's own path
  ok(/require\('\.\/src\/server\/unexpected-exit'\)\.install\(\{ userTodos, sessionKeyFor: [^\n]*activeSessions, clients: \(\) => wss\.clients(?:, buffersDir: BUFFERS_DIR)?(?:, accounts)? \}\)/.test(read('server.js')), 'server.js installs the orchestrator with the store, the key fn and the live ws clients');
  const appSrc = read('src/lib/app.js'), lcSrc = read('src/lib/session-lifecycle.js');
  const body = lcSrc.slice(lcSrc.indexOf('  _respawnAfterExit(sess = {}) {'), lcSrc.indexOf('  // Jump the sidebar to a conversation'));
  ok(/msg\.type === 'unexpected-exit-respawn' && msg\.session\) \{ try \{ this\._respawnAfterExit\(msg\.session\); \}/.test(appSrc)
    && /this\.resumeSession\(sess\.backendSessionId, [^\n]*excludeWebuiId: sess\.serverId/.test(body) && !/\.send\(|sendInput|continue/.test(body),
    'the client runs resumeSession (excluding the dead id) and sends nothing into the conversation');
}

// ── § 5 WIRING PINS over the source ─────────────────────────────────────────
console.log('— §5 wiring: the line, the event and the tomb are built from exitFacts —');
{
  const s = read('src/server/session-stdout.js');
  ok(/require\('\.\.\/exit-facts\.js'\)/.test(s) && /const facts = exitFacts\(\{ meta: wrapperMeta, socketPath: session\.socketPath \|\| null, socketExists, wrapperRunning: settle\.running, asked: session\._exitAsked, now: Date\.now\(\) \}\)/.test(s), 'session-stdout requires exit-facts and builds `facts` from the ONE meta read');
  ok((s.match(/readFileSync\(path\.join\(BUFFERS_DIR, id \+ '\.json'\)/g) || []).length === 0 && /settleWrapperMeta\(wrapperMetaPath, WRAPPER_SETTLE_MS, finishTeardown\);/.test(s),
    'r4: the teardown reads the wrapper meta only through settleWrapperMeta (no second, unsettled read)');
  const lineSrc = s.split('\n').find((l) => l.includes('[session] exited'));
  ok(!!lineSrc && lineSrc.trim().startsWith('console.log(') && lineSrc.includes('${facts.suffix}`'), 'the "[session] exited" console.log ends with ${facts.suffix}', lineSrc);
  ok(/__vsEvent\?\.\('session-exited', .*\$\{facts\.eventSuffix\}`\)/.test(s), 'the session-exited event carries ${facts.eventSuffix}');
  ok(/wrapperFate: facts\.wrapperFate/.test(s) && /socketFate: facts\.socketFate/.test(s), 'the tomb carries the same facts');
  // dc-harness-store (2.369.213): chat-wrapper.js reads the claude stream-json flags from ONE PURE module (the remote spawn
  // reads the same list through the adapter). Admitted only while that module requires NOTHING and the wrapper is not a
  // remote-shipped tool (it runs on the server box beside src/; HostManager.AGENT_TOOLS is the ship list).
  const TRANSPORT_REQ = "require(path.join(__dirname, '..', '..', 'src', 'harnesses', 'claude-transport.js'))";
  // B-5ee1 (lane pid-identity-close): the wrapper records its child's BIRTH beside the pid — src/proc-identity.js, SHARED
  // (node builtins only: fs, child_process), admitted on the same terms: it requires nothing but builtins
  const PI_REQ = "require(path.join(__dirname, '..', '..', 'src', 'proc-identity.js'))";
  const builtinsOnly = (t) => !/require\((?!['"](fs|child_process)['"])[^)]*\)/.test(t.replace(/^\s*(\/\/|\*).*$/gm, ''));
  ok(builtinsOnly(read('src/proc-identity.js')) && !builtinsOnly("const x = require('./other.js');\n"), 'chat-wrapper.js\'s birth module (src/proc-identity.js) requires node builtins only (fs, child_process) — CONTROL: a relative require is red');
  // lane claude-steer-inject (2.369.362): the wrapper keeps a person's mid-turn pictures as files beside its OWN buffer
  // (<id>.img) — src/kept-copies.js, the one module that names, writes, reads and drops them, SHARED with the hub's restore.
  // Admitted on the same terms as proc-identity, and on purpose an EAGER require (never a late one): the wrapper outlives a
  // hub update, so a late require would load whatever src/ holds by then; at start it loads the module its own build shipped.
  // Builtins only (fs, path, crypto); it opens no socket and touches only files under the folder its buffer path names.
  const KC_REQ = "require(path.join(__dirname, '..', '..', 'src', 'kept-copies.js'))";
  const keptOnly = (t) => !/require\((?!['"](fs|path|crypto)['"])[^)]*\)/.test(t.replace(/^\s*(\/\/|\*).*$/gm, '')) && !/\b(net|http|https|dgram|tls)\b['"]\)|\bfetch\(|\bimport\b/.test(t.replace(/^\s*(\/\/|\*).*$/gm, ''));
  ok(keptOnly(read('src/kept-copies.js')) && !keptOnly("const x = require('./other.js');\n") && !keptOnly("const n = require('net');\n") && !keptOnly("fetch('http://x');\n"),
    'chat-wrapper.js\'s kept-copies module (src/kept-copies.js) requires node builtins only (fs, path, crypto) and reaches no network — CONTROL: a relative require, a net require or a fetch is red');
  // lane lg-store-writes (B-15ac): the ONE close of a written file — src/fd-close.js, SHARED with the hub; admitted on kept-copies'
  // terms: node builtins only (fs), no network, an EAGER require at the wrapper's start (its fallback says the same words — ⑤ of
  // test-fd-close-census pins the two spellings equal)
  const FC_REQ = "require(path.join(__dirname, '..', '..', 'src', 'fd-close.js'))";
  const fsOnly = (t) => !/require\((?!['"]fs['"])[^)]*\)/.test(t.replace(/^\s*(\/\/|\*).*$/gm, '')) && !/\b(net|http|https|dgram|tls)\b['"]\)|\bfetch\(|\bimport\b/.test(t.replace(/^\s*(\/\/|\*).*$/gm, ''));
  ok(fsOnly(read('src/fd-close.js')) && !fsOnly("const x = require('./other.js');\n") && !fsOnly("const n = require('net');\n"), 'the wrappers\' close module (src/fd-close.js) requires node builtins only (fs) and reaches no network — CONTROL: a relative or a net require is red');
  // B-cd4b (lane bl-loop-a, the wrapper's hold): every said line on disk before it is said — src/said-journal.js, SHARED with the hub's
  // restore (the fence's words, its PURE gap); admitted on fd-close's terms: node builtins (fs) and the close module only, no network,
  // an EAGER require at the wrapper's start (a tree without it keeps the timer alone)
  const SJ_REQ = "require(path.join(__dirname, '..', '..', 'src', 'said-journal.js'))";
  const sjOnly = (t) => { const u = t.replace(/^\s*(\/\/|\*).*$/gm, ''); return !/require\((?!['"]fs['"]|['"]\.\/fd-close\.js['"])[^)]*\)/.test(u) && !/\b(net|http|https|dgram|tls)\b['"]\)|\bfetch\(|\bimport\b/.test(u); };
  ok(sjOnly(read('src/said-journal.js')) && !sjOnly("const x = require('./other.js');\n") && !sjOnly("const n = require('net');\n"), 'the wrappers\' said journal (src/said-journal.js) requires node builtins (fs) and the close module only, and reaches no network — CONTROL: a relative or a net require is red');
  const transportPure = (t) => !/\brequire\(|\bimport\b/.test(t.replace(/^\s*\/\/.*$/gm, ''));
  const shipList = (t) => ((t.match(/static AGENT_TOOLS = \[([^\]]*)\]/) || [])[1] || '');
  ok(transportPure(read('src/harnesses/claude-transport.js')) && /'vibespace-status'/.test(shipList(read('src/hosts.js'))) && !/wrapper/.test(shipList(read('src/hosts.js'))),
    'chat-wrapper.js\'s one non-builtin require (src/harnesses/claude-transport.js) is PURE (no require / import) and no wrapper is on the remote ship list (HostManager.AGENT_TOOLS)');
  ok(!transportPure("'use strict';\nconst x = require('./other.js');\n") && /wrapper/.test(shipList("  static AGENT_TOOLS = ['vibespace-status', 'chat-wrapper.js'];")),
    'CONTROL: a require in the transport module, or a wrapper on the ship list, is red');
  // the manager stack (lane conversation-facts, majordomo piece 2; restacked onto int411): the wrapper keeps the conversation's FACTS
  // in its sidecar (observations only — the hub judges) through src/conversation-facts.js, SHARED with the hub's judge. Admitted on
  // the transport module's terms: PURE (no require / import), and required ONCE at the wrapper's start (the build it shipped with).
  const CF_REQ = "require(path.join(__dirname, '..', '..', 'src', 'conversation-facts.js'))";
  ok(transportPure(read('src/conversation-facts.js')) && /^try \{ CF = require\(path\.join\(__dirname, '\.\.', '\.\.', 'src', 'conversation-facts\.js'\)\);/m.test(read('data/bin/chat-wrapper.js')),
    'chat-wrapper.js\'s facts module (src/conversation-facts.js) is PURE (no require / import) and is required once, at the wrapper\'s start (top level)');
  // B-5a4d root, unit 2: the transcript path by the tree's ONE rule — src/fixture-guard.js encodeCwd (session-store cwdToProjectDir, restated
  // there because PURE imports nothing). Admitted on the same terms: PURE, required ONCE at the wrapper's start (top level).
  const FG_REQ = "require(path.join(__dirname, '..', '..', 'src', 'fixture-guard.js'))";
  ok(transportPure(read('src/fixture-guard.js').replace(/\/\*[\s\S]*?\*\//g, '')) && /^let FG = null; try \{ FG = require\(path\.join\(__dirname, '\.\.', '\.\.', 'src', 'fixture-guard\.js'\)\);/m.test(read('data/bin/chat-wrapper.js')),
    'chat-wrapper.js\'s path rule (src/fixture-guard.js, B-5a4d root) is PURE (no require / import) and is required once, at the wrapper\'s start (top level)');
  for (const [f, src] of KINDS.map((k) => [path.basename(REL[k]), SRC[k]])) {
    ok(!/require\((?!['"](fs|path|os|child_process|crypto)['"])[^)]*\)/.test(src.replace(/require\(path\.join\(__dirname, '\.\.\/\.\.\/node_modules\/node-pty'\)\)/, '').replace(TRANSPORT_REQ, '').replace(PI_REQ, '').replace(KC_REQ, '').replace(CF_REQ, '').replace(FC_REQ, '').replace(SJ_REQ, '').replace(FG_REQ, '')),
      `${f}: node builtins only (a STATIC file; node-pty is its one pre-existing dependency; crypto since lane codex-0159: the reset-credit consume's idempotencyKey; dc-harness-store 2.369.213: the claude transport flags' PURE module, below; pid-identity-close 2.369.242: the child's birth, src/proc-identity.js, above; claude-steer-inject 2.369.362: the kept copies, src/kept-copies.js, above; the manager stack: the conversation's facts, src/conversation-facts.js, PURE, above; the wrapper's hold: the said journal, src/said-journal.js, above)`);
    const body = src.slice(src.indexOf('function onWrapperSignal'), src.indexOf('for (const sig of Object.keys(WRAPPER_SIGNO))'));
    ok(body.length > 0 && !/await|setTimeout|setImmediate|\.write\(|\.end\(|Promise/.test(body.replace(/fs\.writeFileSync|clearTimeout/g, '')),   // stale-pins: kept — an absence check on ITS own body (fs.writeFileSync left only in src/app-secrets-seal.js by B-694d)
      `${f}: the signal handler is synchronous (no await/timer/stream write)`);
    ok(!/writeFileSync|persistMeta\(/.test(body) && /overwriteIfPresent\(metaFile, /.test(body) && /overwriteIfPresent\(bufferFile, buffer\) && fs\.existsSync\(metaFile\)\) persistBuffer\(\)/.test(body),
      `${f}: the handler writes the meta only through overwriteIfPresent ('r+'), the buffer only into an existing .buf or while the meta exists`);
  }
}

// ── § 6c THE KILL-DOOR CENSUS (B-f698 verify r2) ────────────────────────────
// Every call that can end a process on the SERVER side is declared here, per file, with WHY its exit is never
// judged "unexpected": an ACTOR mark (`_exitAsked` / markAskedByPid) set BEFORE the kill, an ATTACH client (the CLI
// keeps running under its dtach socket; a pty exit with the socket present re-attaches), an UNREGISTERED process (no
// session ⇒ no teardown), a DEVICE (remote ⇒ never respawned), or NOT A CONVERSATION. Every CLIENT door (window
// close, sidebar / card / Manage agents Terminate, pool switch + account change + restart-in-place, resume-all) is
// App.killSession → the ws kill case ('terminate'). A NEW kill call anywhere, or a new file with one, turns this red
// until it is declared — a respawn after a kill the user or VibeSpace asked for is the defect it fences.
// (A kill through an injected alias — bridge-watch / opencode-serve `kill = (pid, sig) => process.kill(…)` — is
// counted where the alias is defined.)
console.log('— §6c every kill door is declared: an actor marked before the kill, or why its exit is never judged —');
{
  const KILL_CALL = /\b(?:process\.kill|\.kill)\s*\((?:[^()]|\([^()]*\))*\)/g;   // a liveness probe `kill(pid, 0)` is no door
  const KILL_DOORS = {
    'src/ws-handler.js': [2, 'actor terminate: the ws kill case — every client door is App.killSession'],
    'src/server/vault-run-door.js': [3, 'vibespace-vault run (lane vault-run-door; declared by lane vault-manual-and-lock): its OWN child\'s process group (SIGTERM, SIGKILL after the grace — a timeout, a lock, the caller gone, the run\'s end) with the child handle as its fallback, and a stray carrying the run\'s mark found by a fresh /proc scan — never a pid read from a file'],
    'src/adapters/claude-code.js': [1, "actor interrupt: the Stop's SIGINT fallback"],
    'src/server/sysinfo-wiring.js': [1, 'actor user-signal: the System panel'],
    'src/server/hub-port.js': [1, 'not a conversation: the hub\'s OWN end (endSelf: process.kill(process.pid, \'SIGTERM\') — its normal shutdown, the stores flushed), the ONE site of every end the separation\'s port module makes (a bad start, no interface within the re-join bound, a refused join)'],
    'src/routes/sessions.js': [1, 'actor user-kill: /api/kill-pid'],
    'src/server/session-stdout.js': [3, 'attach: reattachLocalPty + an abandoned device open-session'],
    'src/server/bridge-watch.js': [2, "attach: shutdown's endAttachPtys + orphaned dtach -a clients (alias)"],
    'src/pty-duck.js': [1, "attach: a device handle's pty duck"],
    'src/server/boot-restore.js': [1, 'unregistered: a duplicate husk retired at boot before adoption'],
    'src/server/provider-test.js': [3, 'not a conversation: the provider Test\'s own probe child (B-d578 U4) — its group on a timeout or after its exit, the child alone when its group cannot be signalled'],
    'src/agentd/agentd.js': [6, "device: the daemon's own pipe / pty sessions + the posixShells probe's 3 s stop of a shell that never answered (windows-device-fs r2)"],
    'src/agentd/attach-cli.js': [1, 'device: an attach client'],
    'src/agentd/client.js': [1, 'device: an attach client'],
    'src/discovery-facts.js': [1, "device: the discovery walk's OWN child (our execFile handle — lane lg-remote-hardening, B-5278 unit 2), ended by SIGKILL when it is let go past DISCOVERY_STUCK_MS — never a conversation"],
    'src/dial-session-bridge.js': [5, 'device: dial bridge handles (+ dial-bridge-credit: a pty opened for an attach that went away is ended at the open)'],
    'src/server/dial-pairing.js': [1, 'device: a pairing handle'],
    'src/hosts.js': [1, 'device: an install child on a timeout'],
    'src/server/cli-usage-door.js': [1, "not respawned: the Re-check usage read's OWN `agy -p /usage` child (lane antigravity-card-fixes; int332 seam — the lane forked before this census's row set), SIGKILL at the read's timeout — a bounded one-shot a person pressed for; its exit is the read's answer (a named refusal), never a session's"],
    'src/server/cli-models-door.js': [2, "not respawned: the models listing's OWN `agy models` child, the leader of its own process group (lane agy-models-report, rounds 2–3) — its group SIGKILLed before the leader's exit is seen (the 20 s timeout, the 64 KiB cap), and after it only on proof a member of ours is alive (the number not reused; the pipe held or a /proc member started since the child); a bounded one-shot a person's opening / press asked for; its exit is the listing's verdict, no session"],
    'src/opencode-serve.js': [5, 'not respawned: OpenCode serve (backend ≠ claude)'],
    'src/desktop-serve.js': [3, 'not a conversation: desktop apps'],
    'src/device-mount.js': [2, 'not a conversation: rclone mounts — its own rclone daemon (B-323e, lane bl-machines-b: the unmount pair and the held files\' open now ride the starter, which ends them at their bound)'],
    'src/mounts.js': [2, 'not a conversation: mounts — the token reader, a pending start\'s child (B-e783: the daemons\' own kills go through PI.signalIdentity, src/proc-identity.js — a recycled pid is never signalled; B-91aa: a hung health probe\'s `ls` is the starter\'s child, killed there — src/server/child-starter-proc.js; B-323e: the cache count and machine-mounts\' ls / realpath children are the starter\'s too)'],
    'src/server/child-starter.js': [6, 'not a conversation: the hub\'s program starter (B-91aa) — fault(): the ONE starter process it spawned and holds (`proc`), killed at a fault before it is replaced once or the old road takes over (closing it only ends its pipe); run()\'s old direct road: the child that call spawned, at its own timeout, and past its output bound (B-323e smalls: once, its pipes closed first — execFile\'s maxBuffer end; it signals only the child that call spawned) · B-323e\'s remainder (lane bl-chat-b, r2689): a SESSION child\'s own group (it started the child detached: its pid is the group\'s id) by its own handle, at the child\'s exit and at the bound — the person\'s login-shell look (src/server/cli-cmd.js runShell, whose own two kills went with it) · line 1004\'s follow (lane mask-value-shape, 主开发 r4444): on its DIRECT road, a start past its bound asked with termFirst (the two sudo starts of src/mounts.js) gets SIGTERM at the bound (sudo relays it to the mount program) and SIGKILL only after the grace — two calls, the same child'],
    'src/server/child-starter-proc.js': [6, 'not a conversation: the starter\'s own children (B-91aa) — a request\'s child (spawned for that request) at the request\'s timeout, and past its output bound (B-323e smalls: once, its pipes closed first — execFile\'s maxBuffer end; it signals only the child this process spawned for that request and holds); bye(): every child in its `held` map when the hub\'s pipe ends (stdin end / close, a broken stdout) — it kills only what it spawned · B-323e\'s remainder (lane bl-chat-b, r2689): a SESSION child\'s own group (it started the child detached: its pid is the group\'s id) by its own handle, at the child\'s exit and at the bound and at the starter\'s end — the person\'s login-shell look (src/server/cli-cmd.js runShell, whose own two kills went with it) · line 1004\'s follow (lane mask-value-shape, 主开发 r4444): on the starter process, a start past its bound asked with termFirst (the two sudo starts of src/mounts.js) gets SIGTERM at the bound (sudo relays it to the mount program) and SIGKILL only after the grace — two calls, the same child'],
    'src/proc-identity.js': [2, 'not a conversation: the identity-proven signal (background jobs\' group kill, B-1cc6) — moved from src/jobs.js'],
    'src/plugins/frp.js': [2, 'not a conversation: plugins (the frpc daemon it started; and the person\'s own take-over of a relay client it did not start — B-1217 its round)'],
    'src/plugins/tailscale.js': [1, 'not a conversation: plugins (the tailscaled it started)'],
    'src/server/plugin-loader.js': [2, 'not a conversation: plugin children'],
    'src/port-forward.js': [1, 'not a conversation: port forwards'],
    'src/remote-fs.js': [3, 'not a conversation: file transfers; B-23e5 r2411 (3): an ssh write past the device road\'s 30 s bound'],
    'src/routes/files.js': [6, 'not a conversation: file transfers (ckpt61 cure 3: + a failed folder copy ends whichever side still runs)'],
    'src/server/browser-keeper.js': [5, 'not a conversation: agent browsers and their stale holders (the 2.369.202 integration: lanes browser-windows / jobs-browser / browser-admin added four; rv-browser F7 moved the install children out — the two rows below; lane one-browser-b1 added the fifth: attachStart SIGKILLs the Chrome it just spawned when its starttime cannot be read)'],
    'src/server/browser-attach-launch.js': [2, "not a conversation: agent browsers — the attach road's Chrome that the launch itself spawned (our child handle), ended by endChild (SIGTERM, a grace, then SIGKILL) when its DevToolsActivePort never appeared (lane one-browser-b1)"],
    'src/server/browser-installs.js': [3, 'not a conversation: THE install slot — a step child past its wall clock, a re-attached stalled step (its pid, or its npm group) — rv-browser F7, moved out of the keeper'],
    'src/server/browser-cli-install.js': [2, 'not a conversation: the browser CLI install\'s detached npm group (or its child) past its deadline — rv-browser F7, moved out of the keeper'],
    // the 2.369.202 integration — kill calls the other lanes of this release added beside lane unexpected-exit's census
    'src/agentd/worker-pool.js': [1, "device: the daemon ends ITSELF by SIGKILL after its exit handlers while an fs worker is stuck in the kernel (lane runaway-daemon) — never a conversation"],
    'src/claude-oat-probe.js': [6, 'not a conversation: the long-lived-token measurement\'s OWN tracer groups (lane cli-self-measure) — each the `setpriv --pdeathsig KILL -- strace --kill-on-exit -f` it spawned, killed by its handle at the belt, at a variant\'s end, at the mint variant\'s end by design (lane oat-add-door: setup-token waits for a code for ever), at the --version run\'s cap (twice each: the kill and the after-check), or when the hub that forked it goes away (killAll); the kernel ends every tracee with its tracer (acceptance r2 items 4 + 5: no pid is read from the trace)'],
    'src/server/cli-self-measure.js': [3, 'not a conversation: the hub\'s forked measurement child (lane cli-self-measure) — SIGTERM at its bound / the switch off / the CLI moving on, SIGKILL 5 s later, and every live one at the hub\'s exit'],
    'src/codex-reset-helper.js': [2, 'not a conversation: the bounded codex app-server child of a reset-credit press (lane reset-path), its own process group, ended at its deadline'],
    'src/vnc.js': [2, 'not a conversation: VNC (lane desktop-apps-safety B-956d added the held-display retry\'s end — composed at the 2.369.202 integration)'],
    'src/window-targets.js': [2, 'not a conversation: X helpers'],
    // the 2.369.204 integration — usage-index-shadow (on the .202 base) re-raises the server's OWN exit: at process exit the index worker is joined; past its 2 s bound the server ends itself (SIGTERM, then SIGKILL if ignored) — never a conversation
    // lane usage-fold-worker-exit-hook (.284): both index owners re-raise through THE exit hook, and so do the usage ledger's fold workers
    'src/server/exit-hook.js': [2, "not a conversation: the server's own exit, re-raised past a worker's join bound — the index owners' close and the usage ledger's fold workers (usage-fold-worker-exit-hook)"],
    // the 2.369.221 integration — lane global-search's ORCH joins its index worker at process exit the same way (its own close bound; its re-raise is the exit hook's since .284)
    // the 2.369.237 integration — lane daemon-orphan-end's end-daemon op and lane fork-flag-server-side's fork proof
    'src/browser-serve.js': [2, "not a conversation: a machine's browser daemon with no browser, ended by pid+starttime when the hub asks (end-daemon, daemon-orphan-end)"],
    'src/ws-create.js': [1, "actor fork-resumed-parent: a pending fork's own CLI holding its parent's id, SIGKILLed before its first turn (B-8b7b)"],
    // the 2.369.252 integration — lane machine-app-crop's window watch on a paired Windows / macOS machine
    'src/machine-window.js': [1, "device: the window look's child (window-track's PowerShell follow loop, run by the daemon; a Mac's look is its screen helper's facts — no child here, lane mac-window-list-helper) — ended when the watch stops or its first look never answers (machine-app-crop)"],
    // the 2.369.256 integration — lane app-display-portal's own session bus for a sandboxed app (startPortalBus)
    'src/input-inject.js': [1, "device: THE input injector's own resident child — the PowerShell (lane stream-p1a-transport) or the Mac helper's `input` — killed through its spawn handle when a line's answer times out (respawned at the next event), when a Mac's Accessibility grant changed under it (lane stream-mac-ax-respawn — the same kill site) or the injector closes; never a conversation"],
    'src/desktop-display.js': [2, "not a conversation: desktop apps — a sandboxed app's own portal bus (dbus-daemon) that never listened within its deadline, SIGKILLed through our own spawn handle (app-display-portal); lane remoteapp-r1b added the second: the RemoteApp first-connection run (xfreerdp /auth-only on a loopback forward, our own spawn handle) SIGKILLed at its 20 s deadline (rdpTrustRun)"],
    // the 2.369.262 integration — lane tls-pass-retry's runChild: execFile WITHOUT its timeout + our own bound
    'src/server/tls.js': [2, "not a conversation: a tailscale status / cert child or a boot-restore probe (fuser / pgrep / the fd scan) past its own bound — runChild's timer TERMs it (the answer it already wrote is kept, tls-pass-retry) and KILLs it 1 s later if it is still there (B-92a4)"],
    // the 2.369.263 integration — lane oat-mint-flow (+ oat-verify-fixes): the hub's own `claude setup-token` PTY
    'src/server/oat-mint.js': [1, "not a conversation: the token mint's own setup-token PTY (node-pty, our spawn handle), SIGKILLed when the mint ends, is cancelled or times out (oat-mint-flow)"],
    // the 2.369.344 integration (int344) — lane door-signin-card (+ door-signin-fixes): the hub's own `claude auth login --claudeai` PTY
    'src/server/claude-signin.js': [1, "not a conversation: the Claude sign-in card's own `claude auth login --claudeai` PTY (node-pty, our spawn handle), SIGKILLed when the sign-in ends, is cancelled (the card closed / the page that held it left), is superseded or times out (door-signin-card)"],
    // lane stream-p1b-screen: the screen source's own ffmpeg children on the paired machine
    'src/agentd/stream-screen.js': [2, "device: the screen source's own ffmpeg children (the capture / the encoder, our spawn handles — lane stream-p1b-screen), ended when the stream stops, when the encoder restarts at a new rate, or when the other one died; + lane desktop-handover's ONE-STILL ffmpeg (desktop-grab), ended at its own time bound or when it hands more than a picture; never a conversation"],
    // the 2.369.304 integration (int304) — the Mac screen helper (lane stream-p3m-build, .302) and the Windows window helper (lane stream-p2w-build)
    'src/agentd/stream-mac.js': [4, "device: a Mac's own screen helper (vibespace-screen capture — our spawn handle, lane stream-p3m-build): killed when the source ends by name, and 1 s after `quit` when it has not exited (lane speaker-passthrough-v1 added the third: the helper replaced IN PLACE by one started with --audio — the old one 1 s after its `quit`; lane mac-locked-capture the fourth: a helper silent past LOCK_RULE.startMs — it waits in ScreenCaptureKit for good on a locked screen); never a conversation"],
    'src/agentd/stream-window-source.js': [1, "device: the window source's own children (the vibespace-wgc helper + its ffmpeg encoder — our spawn handles, lane stream-p2w-build), ended when the stream stops, when the encoder restarts at a new size, or when the other one died; never a conversation"],
    'src/desktop-mic.js': [2, "device: the microphone road's own children (the decoder ffmpeg on Windows + the vibespace-mic helper — our spawn handles, lane stream-mic-road; declared at int339), stdin closed when the voice stops and SIGTERMed only if still alive after STOP_GRACE_MS, or the decoder when the road closed while it started; never a conversation"],
    // lane speaker-passthrough-v1 — the machine's sound on Windows (the microphone helper's `loopback` + the encoder ffmpeg)
    'src/desktop-sound.js': [1, "device: the sound road's own children (the vibespace-mic helper's `loopback` + the encoder ffmpeg — our spawn handles, lane speaker-passthrough-v1), stdin closed when the sound is turned off or its stream ends and SIGTERMed only if still alive a second later; never a conversation"],
    // lane runtime-floor — the product's own-Node provisioner's bounded child
    'src/node-runtime.js': [1, "not a conversation: the provisioner's node download / verify / `--version` child (lane runtime-floor), SIGKILLed by its watchdog timer at the timeout — a bounded one-shot; its exit is the provision's answer, never a session's"],
    // lane job-logs-sweep (.398) — the job-logs remover's OWN child: no row since B-323e (lane bl-jobs) — one batch a child, started and
    // killed past its bound by THE STARTER (src/server/child-starter-proc.js, by request id); src/job-logs-sweep.js signals nothing
    'src/store-exit-keeper.js': [1, "not a conversation: the hub's OWN process (lane hub-loop-stalls commit 2, the store writer's exit keeper thread) — SIGKILL only after a CRASH with no stop asked, ONE full grace after the crash, its one line on fd 2 first (so who ended the hub is in the journal); after a stop it ends nothing (the service manager's kill is the one coming)"],
  };
  // the actor pins: the mark is set BEFORE the kill it names (the teardown reads it; the kill case deletes the session late)
  const ACTOR_PINS = [
    ['src/ws-handler.js', "session._exitAsked = { by: 'terminate', at: Date.now() };", ["process.kill(dpid, 'SIGTERM')", 'if (session.pty) session.pty.kill();']],
    ['src/adapters/claude-code.js', "session._exitAsked = { by: 'interrupt', at: Date.now() };", ["process.kill(session._childPid, 'SIGINT')"]],
    ['src/server/sysinfo-wiring.js', "markAskedByPid(pid, 'user-signal', { refreshOnly: sig === 'CONT' })", ["process.kill(pid, 'SIG' + sig)"]],
    ['src/routes/sessions.js', "markAskedByPid(pid, 'user-kill')", ["process.kill(pid, 'SIGTERM')"]],
    ['src/ws-create.js', "session._exitAsked = { by: 'fork-resumed-parent', at: Date.now() };", ["process.kill(Number(lock.pid), 'SIGKILL')"]],
  ];
  const serverFiles = (root) => {
    const out = ['server.js'];
    const walk = (rel) => { for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (e.isDirectory()) { if (!(rel === 'src' && /^(lib|public)$/.test(e.name))) walk(r); } else if (e.name.endsWith('.js')) out.push(r); } };
    walk('src');
    return out;
  };
  function killDoorCensus(readOf, files) {
    const bad = [];
    for (const f of files) {
      const n = [...readOf(f).matchAll(KILL_CALL)].filter((m) => !/,\s*0\s*\)$/.test(m[0])).length;
      const want = KILL_DOORS[f] ? KILL_DOORS[f][0] : 0;
      if (n !== want) bad.push(`${f}: ${n} kill call(s), ${want} declared${KILL_DOORS[f] ? ' (' + KILL_DOORS[f][1] + ')' : ''}`);
    }
    for (const f of Object.keys(KILL_DOORS)) if (!files.includes(f)) bad.push(`${f}: declared but gone`);
    for (const [f, mark, kills] of ACTOR_PINS) {
      const s = readOf(f), at = s.indexOf(mark);
      for (const k of kills) { const ki = s.indexOf(k, Math.max(0, at)); if (at < 0 || ki < 0 || ki - at > 2500) bad.push(`${f}: the actor mark does not precede ${k}`); }
    }
    const ui = [];
    const walkLib = (rel) => { for (const e of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) { const r = rel + '/' + e.name; if (e.isDirectory()) walkLib(r); else if (e.name.endsWith('.js')) ui.push(r); } };
    walkLib('src/lib');
    const sends = ui.flatMap((f) => [...readOf(f).matchAll(/type: *'kill'/g)].map(() => f));
    const ks = readOf('src/lib/session-lifecycle.js');
    const body = ks.slice(ks.indexOf('  killSession(webuiId, backendSessionId) {'), ks.indexOf('\n  },', ks.indexOf('  killSession(webuiId, backendSessionId) {')));
    if (sends.length !== 2 || sends.some((f) => f !== 'src/lib/session-lifecycle.js') || (body.match(/type: 'kill'/g) || []).length !== 2)
      bad.push(`client: the ws kill is sent outside App.killSession (${sends.join(', ')})`);
    return bad;
  }
  const files = serverFiles(REPO);
  const real = (f) => read(f);
  const census = killDoorCensus(real, files);
  ok(census.length === 0, `every server kill call is declared (${Object.values(KILL_DOORS).reduce((a, [n]) => a + n, 0)} calls in ${Object.keys(KILL_DOORS).length} files), every actor is marked before its kill, the client kills only through App.killSession`, census.join(' | '));
  // controls: each must go red
  const mut = (file, fn) => (f) => (f === file ? fn(read(f)) : read(f));
  ok(killDoorCensus(mut('src/server/ops-routes.js', (s) => s + "\nfunction stopIt(s) { process.kill(s._childPid, 'SIGTERM'); }\n"), files).some((b) => b.startsWith('src/server/ops-routes.js')),
    'control: a NEW kill door in an undeclared file is red');
  ok(killDoorCensus(mut('src/jobs.js', (s) => s + "\nfunction stopIt(s) { s.pty.kill(); }\n"), files).some((b) => b.startsWith('src/jobs.js')),
    'control: one more kill call in a declared file is red');
  ok(killDoorCensus(mut('src/ws-handler.js', (s) => s.replace("session._exitAsked = { by: 'terminate', at: Date.now() };", '')), files).some((b) => /actor mark does not precede/.test(b)),
    'control: the ws kill case without its actor mark is red');
  // control: a mark FARTHER than the window from its kill is red — the census reads the distance, not only the presence (the 23:42Z
  // verdict on restack-411 moved2: the window stays 2500, bl-jobs' own cure e3f4b93b5 brought the kills back inside it)
  {
    const MARK = "session._exitAsked = { by: 'terminate', at: Date.now() };";
    const far = (s) => s.replace(MARK, MARK + '\n      // ' + 'x'.repeat(2600));
    const farWs = far(read('src/ws-handler.js')), gap = farWs.indexOf("process.kill(dpid, 'SIGTERM')", farWs.indexOf(MARK)) - farWs.indexOf(MARK);
    ok(farWs.includes(MARK) && gap > 2500, `control, its plant first: the copy holds the ws kill case's mark ${gap} chars before its kill (past the 2500 window)`);
    ok(killDoorCensus(mut('src/ws-handler.js', far), files).some((b) => /actor mark does not precede/.test(b)), 'control: a mark farther than the window from its kill is red');
  }
  ok(killDoorCensus(mut('src/lib/chat-view.js', (s) => s + "\nfunction stopIt(ws, id) { ws.send({ type: 'kill', sessionId: id }); }\n"), files).some((b) => b.startsWith('client:')),
    'control: a client kill sent around App.killSession is red');
  // the actors the census names are each an asked exit, never a respawn — even mid-turn with a crash code
  const { askedActor: AA, unexpectedExitVerdict: UV } = require(path.join(REPO, 'src/exit-facts.js'));
  const t0 = 1_800_000_000_000;
  for (const by of ['terminate', 'interrupt', 'user-signal', 'user-kill']) {
    const v = UV({ mode: 'chat', backend: 'claude', midTurn: true, facts: { code: 1, signal: null, wrapperFate: 'finalized' }, conversationId: 'c-' + by, askedBy: AA({ by, at: t0 - 20000 }, t0), now: t0 });
    ok(v.action === null && v.why === 'asked:' + by, `actor ${by}: a mid-turn exit it asked for is never respawned (${v.why})`);
  }
  // r2: STOP → TERM → CONT a minute later — the TERM is delivered at the CONT; the CONT re-stamps the mark
  {
    const UX = require(path.join(REPO, 'src/server/unexpected-exit.js'));
    // the session pids sit ABOVE the kernel's ceiling (pid_max is at most 2^22 = 4194304): markAskedByPid reads /proc for a pid's
    // children, so no real process on the machine can ever change this leg (the verdict's should, follow-up of part one)
    const NO_PID = 4194304;
    let clock = t0; const sx = { _childPid: NO_PID + 4242 }, other = { _childPid: NO_PID + 5151 };
    UX.install({ activeSessions: new Map([['sx', sx], ['so', other]]), now: () => clock, log: { log() { }, warn() { } } });
    UX.markAskedByPid(NO_PID + 4242, 'user-signal');                         // the panel's TERM while the CLI is STOPped
    clock += 60000;
    ok(AA(sx._exitAsked, clock) === null, 'r2 control: a minute later the TERM mark alone is stale (the CONT would kill a "crash")');
    UX.markAskedByPid(NO_PID + 4242, 'user-signal', { refreshOnly: true });  // the panel's CONT delivers the pending TERM
    UX.markAskedByPid(NO_PID + 5151, 'user-signal', { refreshOnly: true });  // a CONT of a session nobody signalled
    ok(AA(sx._exitAsked, clock) === 'user-signal' && UV({ mode: 'chat', midTurn: true, facts: { code: null, signal: 'SIGTERM', wrapperFate: 'finalized' }, conversationId: 'cx', askedBy: AA(sx._exitAsked, clock), now: clock }).action === null,
      'r2: the CONT re-stamps the mark — the TERM it delivers is the user\'s kill, never respawned');
    ok(other._exitAsked === undefined, 'r2: a CONT marks nothing new (a session never signalled stays unmarked)');
    UX.install({});
  }
}

console.log('— the resume words and the one heal entry point (source pins + census)');
{
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(['running again', 'running again (resumed {time})'].every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')), 'the resolution\'s words have zh + ja');
  const srv = read('server.js');
  const builder = srv.split('function activeSessionsPayload() {')[1] || '';
  ok(/^\s*try \{ require\('\.\/src\/server\/unexpected-exit'\)\.healResumed\(\); \}/.test(builder), 'PIN: server.js activeSessionsPayload (the publish every create / resume / restore passes through) runs the heal pass first');
  // (git grep over the checkout: this census needs a .git checkout — in an exported tree `callers` is empty and the leg fails
  // CLOSED, a false red, never a false green)
  const callers = spawnSync('git', ['-C', REPO, 'grep', '-l', 'healResumed(', '--', 'src', 'server.js'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean).sort();
  ok(callers.join(',') === 'server.js,src/server/unexpected-exit.js', 'census: healResumed is called from the ONE entry point only (never per call site)', callers);
}

console.log(`\n${fail ? '✗' : '✓'} test-exit-forensics-pins: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
