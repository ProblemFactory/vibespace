#!/usr/bin/env node
// THE CODEX P2 WRAPPER's SOURCE PINS (fast, text only — lane text-legs, B-94d3, 主开发 2026-11-17 22:33Z: a leg that reads only
// product SOURCE TEXT belongs to the fast tier, where every lane's gate sees it in seconds). MOVED VERBATIM from the heavy
// scripts/test-codex-p2-wrapper.mjs (its stub-driven legs stay there): the wrapper pins (data/bin/codex-chat-wrapper.js — the queue,
// the steer, Stop's single-flight halves, the sweep latch, slash commands, foreign threads, item records), the normalizer pin
// (src/codex-message-manager.js), the peer card's renderer pins (src/lib/chat-renderers.js — the escaped sender, the one body
// renderer), the notification-steer rule's call-site pins, and the permission-key PARITY between the shipped wrapper and the PURE
// src/permission-rules.js. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on any change of one.
// Run: node scripts/test-codex-p2-wrapper-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

console.log('— the wrapper and normalizer pins (moved from test-codex-p2-wrapper.mjs)');
// pins
const wsrc = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
ok(/if \(meta\.threadId && meta\.activeTurnId\) \{[\s\S]{0,600}?await request\('thread\/queue\/add'/.test(wsrc), 'wrapper pin: chat-input queues on an active turn');
ok(/noteQueued\(cid, \{ kind: 'user', msgId: msg\.msgId \|\| '' \}\);[\s\S]{0,200}?await request\('thread\/queue\/add'/.test(wsrc) && /noteQueued\(cid, \{ kind: 'user'[\s\S]{0,200}?noteRecordedUserCid\(cid\);/.test(wsrc), "wrapper pin: the item's identity is registered BEFORE the add (the queue/changed refresh can beat the reply) — and so is the fact that its bubble already exists");
ok(!/request\('thread\/queue\/remove'/.test(wsrc) && /thread\/queue\/delete', \{ threadId: meta\.threadId, queuedSubmissionId/.test(wsrc), 'wrapper pin: removal is thread/queue/DELETE with queuedSubmissionId — 0.153.4 has no thread/queue/remove');
ok(/await request\('turn\/steer'[\s\S]{0,300}expectedTurnId: meta\.activeTurnId/.test(wsrc), 'wrapper pin: every steer carries the ACTIVE turn id as its precondition');
ok(/try \{ await clearQueueForStop\(\); \}[\s\S]{0,600}?if \(stopTurnId\) await interruptTurn\(stopTurnId\);/.test(wsrc) && /entry\.promise = request\('turn\/interrupt'/.test(wsrc), 'wrapper pin: Stop clears the queue BEFORE turn/interrupt (the app-server drains what is left when the turn ends), and a sweep that throws may not eat the interrupt');
// round-3 pins: BOTH halves of Stop are single-flight (stdin dispatches
// handleInput without awaiting it, so two frames really do overlap)
ok(/let stopSweepInFlight = null;\s*\nasync function clearQueueForStop\(\) \{\s*\n\s*if \(stopSweepInFlight\) return stopSweepInFlight;/.test(wsrc) && /async function _clearQueueForStop\(\) \{/.test(wsrc), 'wrapper pin: the Stop sweep is SINGLE-FLIGHT — a second Stop rides the running one instead of re-listing the queue it is deleting');
ok(/if \(interruptInFlight && interruptInFlight\.turnId === turnId\)/.test(wsrc), 'wrapper pin: turn/interrupt coalesces per TURN + a live RPC (never a time window — an answered RPC with the turn still running is a real retry)');
ok(/emitTaskEvent\('queue_op_result', \{ op: 'remove', id, ok: true, msg_id: known\?\.msgId \|\| '', reason: 'stopped' \}\);/.test(wsrc) && /await refreshQueue\(\{ timeoutMs: rpcBudget\(\) \}\);[\s\S]{0,400}\n\s*return removed;/.test(wsrc), "wrapper pin: every dropped item is reported as a removal BEFORE the republish (a cleared chip reads as 'it ran'), and that republish is BUDGETED like the rest of the sweep");
// …and a `queue-resync` that landed while the latch was up is still OWED
// (2026-09-09): the closing refresh above dedups on our own fingerprint, so it
// is not a re-statement — the asker would wait forever for an answer the sweep
// silently swallowed.
ok(/if \(queueResyncOwed\) resyncQueue\(\);\s*\n\s*return removed;/.test(wsrc) && /if \(queueSweepActive\) \{ queueResyncOwed = true;/.test(wsrc),
  'wrapper pin: a resync asked DURING a Stop sweep is deferred, not dropped — the sweep pays it after its own closing refresh');
// round-2 pins: the three defects, in the source
ok(/if \(queueSweepActive\) return;\n\s*const fp = JSON\.stringify/.test(wsrc), 'wrapper pin: the sweep latch sits on publishQueue — the ONE choke point (turn/started republishes the CACHED list with no RPC at all)');
ok(/return resp\?\.deleted !== false;/.test(wsrc) && /ours = await deleteQueuedItem\(id, rpcBudget\(\)\);/.test(wsrc), "wrapper pin: the delete's own {deleted:false} verdict is READ (an item drained between the list and the delete RAN — it is not a Stop removal)");
ok(/const deadline = Date\.now\(\) \+ STOP_SWEEP_TOTAL_MS;/.test(wsrc) && /const rpcBudget = \(\) => Math\.min\(STOP_SWEEP_RPC_MS/.test(wsrc), 'wrapper pin: the sweep is budgeted per-RPC AND overall — Stop is a safety control, not a queue-management routine');
ok(/if \(method === 'thread\/queue\/changed'\) \{ refreshQueue\(\); return; \}/.test(wsrc), 'wrapper pin: the app-server\'s queue/changed drives a re-LIST (the notification carries no items)');
ok(/thread\/compact\/start/.test(wsrc) && /applySlashCommand\(text\)/.test(wsrc), 'wrapper pin: slash commands + real compact');
ok(/const foreign = foreignThreadOf\(params\);/.test(wsrc) && /!THREAD_ID_NOT_SCOPE\.has\(method\)/.test(wsrc) && !/THREAD_SCOPED_METHODS/.test(wsrc), 'wrapper pin: the gate is INVERTED — a notification NAMING another thread is foreign unless allowlisted (a method whitelist goes stale: error / thread/compacted / thread/queue/changed / turn/diff/updated were all missing)');
ok(/if \(replyAgentPath\) meta\.agentPath = replyAgentPath;/.test(wsrc), 'wrapper pin: meta.agentPath is ASSIGNED from the thread reply (it used to be read-only, so every fallback was dead)');
ok(/itemCtx = \{ threadId: asString\(params\?\.threadId/.test(wsrc) && /function recordItem\(payload\)/.test(wsrc), 'wrapper pin: item records carry the notification\'s thread/turn context');
const cm = fs.readFileSync(path.join(REPO, 'src/codex-message-manager.js'), 'utf8');
ok(/this\._status\.slashCommands \|\| \[\]/.test(cm) && !/slashCommands: \[\],/.test(cm), 'normalizer pin: init slashCommands come from wrapper_meta (no hardcoded empty list left)');

// wrapper pins for the rule (the 2.355.0 unstaged-wiring lesson: a behaviour
// with no call-site pin can be reverted by an extraction and stay green)
ok(/const peerKind = msg\.kind === 'notification' \? 'notification' : 'peer';/.test(wsrc), "wrapper pin: the frame's typed origin decides the lane, and an untyped frame is a PEER");
ok(/if \(peerKind === 'notification' && meta\.activeTurnId\) \{[\s\S]{0,200}?await steerInput\(encodeUserInput\(text, \[\]\), /.test(wsrc), 'wrapper pin: a notification on a busy session takes the steer lane');
ok(/async function steerInput\(input, clientUserMessageId\) \{[\s\S]{0,400}?await request\('turn\/steer'/.test(wsrc) && /steerInput\(item\.input, cid\)/.test(wsrc), 'wrapper pin: ONE turn/steer call site (steerInput), shared by the queue verb and the notification lane');
ok(!/steerInput[\s\S]{0,300}queue\/list/.test(wsrc) && /input,\n\s*expectedTurnId: meta\.activeTurnId,/.test(wsrc), "wrapper pin: steerInput sends the caller's input and nothing else — it never reads or writes the queue");
ok(/mode: 'steered'/.test(wsrc) && /steerFailed: steerFailed\.reason/.test(wsrc), 'wrapper pin: the result reports the lane, and a fallback names the refused steer');

// ── the peer card's renderer pins (moved from the notification-XSS block of test-codex-p2-wrapper.mjs) ──
console.log('— the peer card renders its sender escaped, its body through the one renderer');
{
    const cr = fs.readFileSync(path.join(REPO, 'src/lib/chat-renderers.js'), 'utf8');
    // (the .197 integration: lane group-report-card put the GROUP head between the two lines — its sender is the same
    // escaped span, its group name escaped too — so the pin reads the block, bounded, and the group span's escaping)
    ok(/const nameSpan = msg\.peerFrom \? `<span class="chat-peer-name" role="link" tabindex="0">\$\{escHtml\(msg\.peerFrom\)\}<\/span>` : '';[\s\S]{0,1400}const groupSpan = g \? `<span class="chat-peer-group" role="link" tabindex="0">\$\{escHtml\(g\.name \|\| g\.id\)\}<\/span>` : '';[\s\S]{0,1600}\{ name: nameSpan \}\) : nameSpan;\s*\n\s*const nameHtml = g \? [\s\S]{0,300}\{ name: nameSpan \}[\s\S]{0,120}\{ name: nameSpan \}/.test(cr) && /const sp = `<span class="chat-peer-name" role="link" tabindex="0" data-peer="\$\{escHtml\(a\.name\)\}">\$\{escHtml\(a\.name\)\}<\/span>`;/.test(cr), 'renderer pin: the peer/notification LABEL goes through escHtml before it enters innerHTML (both titles — S3 verify F3 added "an agent calling itself …" — take the one escaped span)');
    // (the 2.369.202 integration: lane peer-card-fold moved the body into _peerBodyHtml — the peer text through the same
    // renderMarkdown, headings demoted, whole or folded; the pin follows the text to the one renderer)
    ok(/const body = this\._peerBodyHtml\(msg, core\);/.test(cr) && /_peerBodyHtml\(msg, text, who\) \{[\s\S]{0,400}<div class="chat-text">\$\{demoteHeadings\(this\.renderMarkdown\(String\(text \|\| ''\)\.trim\(\)\)\)\}<\/div>/.test(cr) && /renderMarkdown\(text(?:, \{ [^}]*\} = \{\})?\) \{[\s\S]{0,900}sanitizeHtml\((?:this\._fileHrefs\()?marked\.parse/.test(cr), 'renderer pin: the BODY goes through renderMarkdown, i.e. sanitizeHtml (src/lib/safe-html.js — the XSS law; the renderer\'s options argument — internal links\' vsLinks / streaming — never skips it)');
}

// ── ⑧'s PARITY leg (moved from test-codex-p2-wrapper.mjs ⑧: the shipped wrapper's key list vs the PURE module) ──
console.log('— the permission keys: wrapper ⇄ PURE');
{
  // PARITY: the wrapper is a SHIPPED SINGLE FILE (it runs on hosts with no
  // checkout), so its key list cannot require the pure module — it is pinned.
  const wsrc = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
  const listed = (wsrc.match(/const PERMISSION_CONFIG_KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
  const wrapperKeys = [...listed.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const pureKeys = require(path.join(REPO, 'src/permission-rules.js')).CODEX_PERMISSION_KEYS;
  ok(wrapperKeys.length > 0 && wrapperKeys.join(',') === [...pureKeys].join(','),
    'PARITY: the shipped wrapper\'s permission-key list is byte-for-byte the PURE module\'s (the usage scanner drifted twice by exactly this route)',
    `wrapper=[${wrapperKeys}] pure=[${[...pureKeys]}]`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
