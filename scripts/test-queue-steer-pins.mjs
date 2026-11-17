#!/usr/bin/env node
// QUEUED vs STEERED input — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-queue-steer.mjs, whose browser / real-wrapper / restart legs and every patched-copy CONTROL stay
// there: ③ the ws 'queue-op' case and the client's queue writers, ⑤ the strip's i18n + CSS pins, ⑦ the attach payload's
// notification-steer pin, ⑨d the chord's keybinding pins, the wiring + docs pins, ⑧ the Stop button's source half, ⑨ the
// wrapper-side pins ((h), (j6), (j8), (j9), (j9b)) and ⑬'s ring + attach-ask pins. Each reads the file it pins BY NAME, so
// ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-queue-steer-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const indexHead = (f) => ((t) => (t.split(/^## INDEX\b.*$/m)[1] || '').split(/^## /m)[0])(read(f));

console.log('— ③ the ws case gates on the caps row AND the running wrapper');
{
  const src = read('src/ws-handler.js');
  const m = /case 'queue-op': \{([\s\S]*?)\n        \}/.exec(src);
  ok("ws-handler has ONE 'queue-op' case", !!m);
  const body = m ? m[1] : '';
  ok('it reads inputModes from backend-caps — no backend-id branch anywhere in the case', /capsOf\(session\.backend\)\.inputModes/.test(body) && !/=== 'codex'|=== 'claude'|=== 'opencode'|=== 'antigravity'/.test(body), body.slice(0, 400));
  ok('the gate is the VERB TABLE, not a pair of booleans: no verbs ⇒ refuse, an undeclared verb ⇒ refuse WITH ITS OWN SENTENCE', /if \(!harnessVerbs\.length\)/.test(body) && /if \(!harnessVerbs\.includes\(data\.op\)\) \{ refuse\(queueVerbRefusal\(data\.op, label\)/.test(body), body.slice(0, 400));
  {
    // …and that sentence says what happens to the message ANYWAY (a refusal
    // that only says "no" leaves the user wondering if it is lost).
    const fn = /function queueVerbRefusal\(op, label\) \{[\s\S]*?\n\}/.exec(src)?.[0] || '';
    const refusal = new Function('op', 'label', fn + '; return queueVerbRefusal(op, label);');
    for (const [verb, must] of [['steer', /runs after it/], ['reorder', /order they were sent/], ['edit', /remove it and send a new one/], ['run-now', /runs when the current turn ends/], ['run-all', /run when the current turn ends/]]) {
      ok(`ws refusal for '${verb}' names the harness AND what happens to the message`, /Claude/.test(refusal(verb, 'Claude')) && must.test(refusal(verb, 'Claude')), refusal(verb, 'Claude'));
    }
    ok('every refusal carries a machine `reason` beside the sentence (the client can branch, the user can read)', /refuse = \(message, reason\)/.test(body) && /reason: reason \|\| 'unsupported'/.test(body));
  }
  ok("every refusal is CODED 'queue-op-unsupported' with a human reason (never silent, never a bare session error)", /code: 'queue-op-unsupported'/.test(body) && /error: message, message/.test(body) && !/ws\.send\(JSON\.stringify\(\{ type: 'error', sessionId: data\.sessionId \}\)\)/.test(body));
  ok('the adapter throw is the second line of defense (formatQueueOp inside a try that refuses with e.message)', /payload = adapter\.formatQueueOp\(\{/.test(body) && /catch \(e\) \{ refuse\(e\.message, 'malformed'\); break; \}/.test(body));
  ok("…and `afterId: null` reaches the adapter as a POSITION: the key is spread only when the client sent one (absent ≠ front)", /\.\.\.\('afterId' in data \? \{ afterId: data\.afterId === null \? null : String\(data\.afterId \|\| ''\) \} : \{\}\)/.test(body), body.slice(-1200));
  ok('the frame goes to the wrapper on stdin, like every other verb', /session\.pty\.write\(payload \+ '\\n'\)/.test(body));
  // ── ROUND-2 VERIFIER, finding 6: `edit` is the one verb that carries USER
  // TEXT, and this frame reaches the wrapper over RAW PTY STDIN — the `input`
  // case routes anything large through the frame file precisely because a big
  // pty write gets shredded (the 79928a2b/c1206711 class). Two bounds, both
  // loud: the wrapper's own edit cap, and the transport ceiling AFTER JSON
  // escaping (a control-char string grows sixfold, so the first does not imply
  // the second).
  ok('finding 6: an over-long edit text is REFUSED with evidence before the frame is built (never an unbounded raw-stdin write)',
    /if \(typeof data\.text === 'string' && data\.text\.length > QUEUE_EDIT_MAX_CHARS\) \{/.test(body) && /'text-too-long'/.test(body) && /it was NOT saved/.test(body), body.slice(-1600));
  ok('…and the built FRAME is bounded too (JSON escaping can multiply the text sixfold), refused with its own reason',
    /if \(payload\.length > QUEUE_OP_MAX_BYTES\) \{/.test(body) && /'frame-too-large'/.test(body) && /it was NOT sent/.test(body), body.slice(-1200));

  // ── finding 3 (server half): a ws refusal never becomes a `queue_op_result`,
  // so the strip could not find the row it had marked pending. The refusal
  // echoes the op AND its id for exactly that join.
  ok('finding 3: every queue-op refusal ECHOES the op and its id (the client marked that row pending before sending; nothing else will ever answer it)',
    /op: data\.op \|\| null, id: data\.id \|\| null/.test(body), body.slice(0, 900));
  // GATE ②, THE WRAPPER SKEW (round-1 review): the caps row describes a KIND
  // of agent; a LONG-LIVED PROCESS is a different question. A codex session
  // spawned before this release satisfies the row and drops the frame
  // silently — the 2.361.1/2.364.1 class, twice shipped.
  ok("…and ALSO on the RUNNING wrapper's own advert (its sidecar verb list, or the in-band one for a remote wrapper), not just the static row", /wrapperCaps\(BUFFERS_DIR, data\.sessionId, session\.socketPath\)/.test(body) && /const served = wcaps\.inputQueue \? wcaps\.queueVerbs/.test(body) && /if \(!served\) \{/.test(body), body.slice(-1400));
  ok('…and a wrapper that serves SOME verbs is refused only the ones it does not serve, naming what it does serve (skew, not a dead session)', /if \(!served\.includes\(data\.op\)\) \{[\s\S]{0,300}it serves \$\{served\.join\(', '\)\}/.test(body), body.slice(-1400));
  ok('…whose refusal says what happens to the message AND how to get the controls', /predates the input-queue update/.test(body) && /Terminate \+ Resume/.test(body) && /still starting up/.test(body));
  ok('the negative verdict is never cached on the session (a wrapper writing its sidecar late must not be locked out)', !/_wrapperInputQueue/.test(src));
  ok('…and a REMOTE wrapper (its sidecar lives on ITS machine) is not mistaken for an old one — its in-band verb list, or a bare published queue, is proof enough', /session\._normalizer\?\.queueVerbsPublished\?\.\(\)/.test(body) && /queuePublished\?\.\(\) \? LEGACY_QUEUE_VERBS\.slice\(\) : null/.test(body));
  {
    // A pre-verb-table wrapper adverts `inputQueue` and NO list — it serves
    // exactly the three verbs that existed then, and must keep serving them.
    const wf = read('src/server/wrapper-files.js');
    ok('wrapperCaps maps a verb-LESS inputQueue advert to the legacy three (never to the current seven)', /const \{ LEGACY_QUEUE_VERBS \} = require\('\.\.\/backend-caps\.js'\);/.test(wf) && /Array\.isArray\(caps && caps\.queueVerbs\)[\s\S]{0,160}inputQueue \? LEGACY_QUEUE_VERBS\.slice\(\) : \[\]/.test(wf), wf.slice(-800));

  }
  ok('wrapperCaps reads inputQueue from the sidecar the WRAPPER itself writes', /const inputQueue = !!\(caps && caps\.inputQueue\)/.test(read('src/server/wrapper-files.js')));
  // CLIENT: a coded per-session error must NOT be read as an attach failure
  // (the 2.363.1 rule) — but "any code = scoped" is TOO WIDE: 'ended-during-
  // attach' is a coded error whose SESSION IS GONE and must keep the rescue.
  const cv = read('src/lib/chat-view.js');
  const scopedSet = /const SCOPED_REFUSAL_CODES = new Set\(\[([\s\S]*?)\]\);/.exec(cv)?.[1] || '';
  ok('client: the scoped-refusal codes are an EXPLICIT allow-list, not "anything with a code"', /'input-rejected'/.test(scopedSet) && /'not-codex-chat'/.test(scopedSet) && /'queue-op-unsupported'/.test(scopedSet), scopedSet);
  ok("…'ended-during-attach' is NOT in it (its session is dead — a live-looking empty window is the regression)", !!scopedSet && !/ended-during-attach/.test(scopedSet), scopedSet);
  ok("…and a NEW server refusal can opt in without a client release via scope:'action'", /msg\?\.scope === 'action'/.test(cv) && /scope: 'action'/.test(body));
  ok('client: an attach failure still takes the view-only rescue path', /if \(!this\._tryViewOnlyRescue\(\)\)/.test(cv));
  // the queue rides EVERY window-birth payload (the 2.368.4 rule)
  ok("attach carries the queue from the normalizer", /queue: session\._normalizer\?\.queueState\?\.\(\) \|\| \[\]/.test(read('src/ws-handler.js')));
  ok("…and the wrapper's queue advert — SUPPORTED **and the verb list** — rides the SAME payload (the client cannot read a sidecar), and it is computed from the ONE sidecar read the attach handler already made (2.369.16: no second /proc walk here)", /const wcapsAttach = wrapperCaps\(BUFFERS_DIR, data\.sessionId, session\.socketPath\);[\s\S]{0,600}const queueAdvert = \(\(\) => \{\s*\n\s*const wc = wcapsAttach;[\s\S]{0,2000}return \{ queueSupported: !!served, queueVerbs: served \|\| null, queueKnown: !served \|\| published, queueNotifSteer: notificationSteerOf\(wc, \{ inBand, published \}\) \};/.test(read('src/ws-handler.js')));
  { const wsc = read('src/ws-create.js');
    ok("…'created' carries all three, and says the fresh wrapper has reported NOTHING yet", /queue: \[\],/.test(wsc) && /queueSupported: false,[\s\S]{0,400}queueVerbs: null,/.test(wsc)); }
  // …and `queueKnown` carries its OWN `in meta` test even though it is a
  // modifier read inside `queue`'s guard: test-auto-resume's drift guard reads
  // every `meta.<key>` in this body and requires one (a partial meta must never
  // reset a fact), and spelling the absent case out is also how "an older
  // server's payload is KNOWN" stops being an implicit truth of `!== false`.
  // Stated as ORDER + SHAPE rather than "these two lines within N characters":
  // the claim is that the advert is applied FIRST, and a byte budget between
  // them turns every added comment into a red suite (it did, twice).
  {
    const advert = cv.indexOf("if ('queueSupported' in meta) this._setQueueSupported(meta.queueSupported, ('queueVerbs' in meta) ? meta.queueVerbs : undefined, { at: rxAt, notifSteer: ('queueNotifSteer' in meta) ? meta.queueNotifSteer : undefined });");
    const queue = cv.indexOf("if ('queue' in meta) this._setQueue(meta.queue, {");
    ok('the client applies both through the carries-the-key guard, advert (and its verb list) FIRST',
      advert > 0 && queue > advert && /if \('queue' in meta\) this\._setQueue\(meta\.queue, \{\s*\n\s*known: \('queueKnown' in meta\) \? meta\.queueKnown !== false : true,/.test(cv),
      JSON.stringify({ advert, queue }));
    // …and BOTH are judged by the SAME arrival stamp (r3). The advert is not a
    // lesser fact: a stale `queueSupported:false` collapses `_queueCaps()` to
    // NO_QUEUE_CAPS and the composer then renders zero rows — the identical
    // user-visible outcome r2's row guard exists to prevent. So `rxAt` is
    // computed ONCE, above the advert, and handed to both.
    const stamp = cv.indexOf("const rxAt = Number.isFinite(rxTick) ? rxTick : performance.now();");
    ok('…and the arrival stamp is computed ONCE, ABOVE the advert, and passed to BOTH queue writers (an advert judged by "whatever ran last" empties the strip just as thoroughly as stale rows)',
      stamp > 0 && stamp < advert && /at: rxAt,\n/.test(cv), JSON.stringify({ stamp, advert, queue }));
  }
  // ONE WRITER for the capability, because a FLIP has a consequence (the
  // rendered chips must be re-applied — round-2's MAJOR). A bare assignment
  // anywhere else silently skips it.
  ok('`_queueSupported` has exactly ONE writer besides its initialiser (_setQueueSupported), so every flip is observable',
    (cv.match(/this\._queueSupported = /g) || []).length === 2 && /_setQueueSupported\(next, verbs, \{ at = performance\.now\(\), notifSteer \} = \{\}\) \{[\s\S]{0,1300}this\._queueSupported = val;\s*\n\s*this\._queueVerbsServed = list;\s*\n\s*this\._queueNotifSteer = steerNotif;\s*\n\s*this\._refreshQueueChips\(\);/.test(cv),
    (cv.match(/this\._queueSupported = [^\n]*/g) || []));
  ok('…and the VERB LIST shares that one writer (a wrapper that gains verbs without changing `supported` must re-apply the chips too)',
    (cv.match(/this\._queueVerbsServed = /g) || []).length === 2 && /JSON\.stringify\(list\) === JSON\.stringify\(this\._queueVerbsServed\)/.test(cv),
    (cv.match(/this\._queueVerbsServed = [^\n]*/g) || []));
  ok("…and the live meta path uses it too (a wrapper's baseline queue_changed also arrives after the bubbles), carrying the verbs it published", /if \(op\.supported\) this\._setQueueSupported\(true, Array\.isArray\(op\.verbs\) \? op\.verbs : LEGACY_QUEUE_VERBS\.slice\(\), \{ notifSteer: Array\.isArray\(op\.verbs\) \? op\.verbs\.map\(\(v\) => String\(v\)\)\.includes\('steer'\) : false \}\);/.test(cv));
  ok('B-d963: …and the notification-steer fact shares that one writer too (initialiser + _setQueueSupported, nothing else)',
    (cv.match(/this\._queueNotifSteer = /g) || []).length === 2 && /steerNotif === this\._queueNotifSteer\) return;/.test(cv),
    (cv.match(/this\._queueNotifSteer = [^\n]*/g) || []));
  ok("a queue op's RESULT reaches the strip as its own meta op (a row that spins forever is the silent failure wearing a spinner)", /if \(op\.subtype === 'queue-result'\) \{[\s\S]{0,700}this\._chatInput\?\.setQueueOpResult\(op\.id, op\.ok !== false, op\.text \|\| '', op\.queueOp \|\| null\);[^\n]*\n\s*return;\s*\n\s*\}/.test(cv));
  // lane stop-refills-composer: the result names its VERB — only the edit's own result answers a pending edit (a Stop's
  // `remove ok:true` for the edited row is the gone outcome: the rewrite is kept), and Stop's put-back has its ONE toast
  ok("…naming its verb, so a Stop's remove never resolves a pending edit as saved (lane stop-refills-composer)", /this\._resolvePendingEdit\(queueOp == null \|\| queueOp === 'edit' \? ok : false, text \|\| ''\)/.test(read('src/lib/chat-input.js')));
  ok("Stop's put-back is ONE toast on every client (_onMeta handles queue-putback; the words are already in the box)", /if \(op\.subtype === 'queue-putback'\) \{[\s\S]{0,1300}showToast\(parts\.join\(' · '\), \{ duration: 6000 \}\);\s*\n\s*return;/.test(cv));
  ok("…and a 'gone' verdict REMOVES the row first (the wrapper is authoritative about absence; a red ghost is the incident)", /if \(op\.ok === false && op\.reason === 'gone'\) this\._dropQueueRow\(op\.id\);/.test(cv));
  ok('wiring pin: the strip, the row keyboard and the chip send the SAME ws message through one method', /const frame = \{ type: 'queue-op', sessionId: this\.sessionId, op, id: id \|\| null \};/.test(cv) && (cv.match(/type: 'queue-op'/g) || []).length === 1);
  ok("…and the verb's own argument rides it: afterId only when the caller supplied one (null = the front), text only when it is a string", /if \(extra && 'afterId' in extra\) frame\.afterId = extra\.afterId === null \? null : String\(extra\.afterId\);/.test(cv) && /if \(extra && typeof extra\.text === 'string'\) frame\.text = extra\.text;/.test(cv));
  // NO DEAD CONTROLS: the chip is clickable only where the VIEW says steer
  // (harness row ∧ running wrapper — ONE definition), and every queue action
  // on a read-only/offline window SPEAKS through one choke point.
  const cr = read('src/lib/chat-renderers.js');
  ok('the bubble chip asks the VIEW whether this session can steer (no second capability definition in the renderer)', /_canSteerQueue\(\) \? this\._onQueueChipClick : null/.test(cr) && /this\._getQueueCaps\?\.\(\)\?\.steer/.test(cr) && /getQueueCaps: \(\) => this\._queueCaps\(\)/.test(cv));
  ok('_queueCaps is the intersection: no wrapper advert ⇒ no controls at all', /if \(!this\._queueSupported\) return NO_QUEUE_CAPS;/.test(cv) && /const NO_QUEUE_CAPS = Object\.freeze\(\{ queue: false, steer: false, queueOps: false, queueVerbs: Object\.freeze\(\[\]\), notifSteerMissing: false \}\);/.test(cv));
  ok('…and it INTERSECTS the harness table with what the running wrapper serves, re-deriving steer/queueOps FROM the result (never carried over)', /const caps = doorCapsOf\(row, served\);/.test(cv) && /return \{ \.\.\.caps, notifSteerMissing \};/.test(cv) && /const verbs = \(row\.queueVerbs \|\| \[\]\)\.filter\(\(v\) => !Array\.isArray\(servedVerbs\) \|\| servedVerbs\.includes\(v\)\);/.test(read('src/backend-caps.js')) && /steer: verbs\.includes\('steer'\), queueOps: verbs\.length > 0, queueVerbs: verbs/.test(read('src/backend-caps.js')));   // ONE derivation, src/backend-caps.js doorCapsOf (lane reply-door-follows-enter)
  ok('every queue action passes ONE liveness choke point that toasts (strip buttons included — a dead button that eats the click is the silent failure)', /_queueOpsLive\(\) \{/.test(cv) && /if \(!this\._queueOpsLive\(\)\) return false;\s*\n\s*const frame = \{ type: 'queue-op'/.test(cv) && (cv.match(/showToast\(t\('This session is not live/g) || []).length === 1);
  ok('…and the strip is DIMMED under .chat-input-disconnected, so the state is visible BEFORE the click', /\.chat-input-disconnected \.chat-queue-strip \{ opacity/.test(read('public/chat.css')));
  const cw2 = read('data/bin/codex-chat-wrapper.js');
  ok('removing a queued PEER message hands the text back to the delivery ladder (never a silent loss of a message already reported delivered)', /known\?\.kind === 'peer' && known\.text\) emitTaskEvent\('peer_message_result', \{ ok: false/.test(cw2));
  // A refused Steer-all printed the SAME failure twice, and the batch card
  // defaulted the turn kind to "review" (so a compact turn was named wrong).
  ok('a refused steer-all prints ONE card (the per-item result, which carries the real reason AND kind); the batch abort is journal-only', /log\(`steer-all aborted after/.test(cw2) && !/emitTaskEvent\('queue_op_result', \{ op: 'steer-all', ok: false/.test(cw2));
  ok('…and its SUCCESS summary is still emitted (bookkeeping, card-less by normalizer construction)', /emitTaskEvent\('queue_op_result', \{ op: 'steer-all', ok: true, done \}\)/.test(cw2));
  // STOP CLEARS THE QUEUE ON EVERY HARNESS (owner decision 2026-09-07 — the
  // 2026-09-06 divergence is closed). The bubbles must say 'removed', not clear
  // as if they had RUN (the normalizer clears a chip that left with no result).
  const aw2 = read('data/bin/acp-wrapper.js');
  // THE ORDER LAW (lane stop-refills-composer, owner 2026-10-24 — Stop still drops, and what it dropped comes back into
  // the composer): the per-item removal results → ONE queue_dropped record → the emptied republish, on acp AND codex
  // (a composer editing a dropped row must get the draft op while that edit is still open)
  const orderOf = (src, a, b, c) => { const i = src.search(a), j = src.search(b), k = src.search(c); return i > 0 && j > i && k > j; };
  ok("ACP Stop: each dropped entry's removal → ONE queue_dropped (the person's rows) → the republish (a cleared chip means 'it ran')", orderOf(aw2, /for \(const q of dropped\) record\('queue_op_result', \{ op: 'remove', id: q\.id, ok: true, msg_id: q\.opts\?\.msgId \|\| '', reason: 'stopped' \}\);/, /record\('queue_dropped', droppedRecordFor\(/, /\n      if \(dropped\.length\) publishQueue\(\);/));
  ok("codex Stop: every 'stopped' result → ONE queue_dropped (after the latch) → the republish", orderOf(cw2, /emitTaskEvent\('queue_op_result', \{ op: 'remove', id, ok: true, msg_id: known\?\.msgId \|\| '', reason: 'stopped' \}\);/, /if \(putBack\.length\) emitTaskEvent\('queue_dropped', droppedRecordFor\(putBack,/, /await refreshQueue\(\{ timeoutMs: rpcBudget\(\) \}\);/));
  ok('codex Stop clears the app-server queue too — the deletes go out BEFORE turn/interrupt, or the app-server drains them when the turn ends', /try \{ await clearQueueForStop\(\); \}[\s\S]{0,600}?if \(stopTurnId\) await interruptTurn\(stopTurnId\);/.test(cw2));
  // round-3: BOTH halves single-flight — a double-click (or a second attached
  // client) is ONE sweep and ONE interrupt, never a second sweep reporting the
  // first one's removals as "it already ran" (test-codex-p2-wrapper §②e drives it)
  ok('codex Stop is single-flight on both halves: a second Stop rides the running sweep and the in-flight turn/interrupt', /if \(stopSweepInFlight\) return stopSweepInFlight;/.test(cw2) && /if \(interruptInFlight && interruptInFlight\.turnId === turnId\)/.test(cw2));
  ok("codex steer reads the delete's verdict too: a drained item warns about the second run instead of a bare ok", /if \(!dequeued\) \{[\s\S]{0,400}?reason: 'steered-not-dequeued', detail: 'it had already left the queue \(it may run a second time\)'/.test(cw2));
  ok("…reporting each dropped item as a removal with reason 'stopped' (the SAME frame the ACP wrapper emits, so one client path renders both)", /emitTaskEvent\('queue_op_result', \{ op: 'remove', id, ok: true, msg_id: known\?\.msgId \|\| '', reason: 'stopped' \}\);/.test(cw2));
  ok('…and a delete that FAILS is reported (ok:false) + journalled, never a silent "cleared" queue', /emitTaskEvent\('queue_op_result', \{ op: 'remove', id, ok: false, reason: 'error', detail: e\.message, msg_id: known\?\.msgId \|\| '' \}\);/.test(cw2) && /log\(`interrupt: thread\/queue\/delete failed for/.test(cw2));
  ok('…and a queued PEER message Stop drops goes back to the delivery ladder (same rule as the explicit remove)', /if \(known\?\.kind === 'peer' && known\.text\) emitTaskEvent\('peer_message_result', \{ ok: false, reason: 'dropped by Stop before it was delivered'/.test(cw2));
}

console.log('— ⑤ the client strip (DOM-free render of the REAL ChatInput)');
{
  {
    const HINT = 'Restart this session to receive notifications without a billed turn';

    ok('…the hint is translated (zh + ja)', read('src/lib/i18n-zh.js').includes(HINT) && read('src/lib/i18n-ja.js').includes(HINT));
    ok('…and the suggested-remove title is translated too', read('src/lib/i18n-zh.js').includes('Remove — it is delivered with the next prompt instead, without a billed turn') && read('src/lib/i18n-ja.js').includes('Remove — it is delivered with the next prompt instead, without a billed turn'));
    ok('…and the new classes are styled with theme vars (§17)', /\.chat-queue-skew \{[^}]*var\(--/.test(read('public/chat.css')) && /\.chat-queue-btn-suggest \{[^}]*var\(--/.test(read('public/chat.css')));
  }

  ok('the chord answer NEVER consults the textarea (it must not flicker per keystroke)', !/steerChordAllowed[\s\S]{0,200}_textarea/.test(read('src/lib/chat-input.js')));

  // _send's MERGED contract, at the source (2.369.61 chord ⊕ round-5 bail-out):
  // a STRING msgId when a queueable message went out, `true` when it took the
  // box without one (/goal, an edit), `false` on every bail.
  {
    const src = read('src/lib/chat-input.js');
    ok('_send returns the msgId for a real message, `true` when it took the box without one (/goal, an edit), and `false` on every bail — the chord reads the id, sendText reads the bail',
      /return msgId;/.test(src) && (src.match(/return false;/g) || []).length >= 3 && /const msgId = typeof r === 'string' \? r : null;/.test(src), (src.match(/return (false|true|msgId);[^\n]*/g) || []));
    // …and the value it can NEVER answer with (r2 verifier): the pre-merge
    // contract's `null` is gone, so a stub that returns it tests nothing.
    const sendBody = src.slice(src.indexOf('\n  _send('), src.indexOf('\n  _addImageAttachment('));   // `_send({ hold })` since lane claude-steer-inject
    ok('the merged _send has no `return null` path left — the third value is `true`, and a test stubbing `null` would pin a state the product cannot reach',
      sendBody.length > 500 && !/\breturn null\b/.test(sendBody), sendBody.length);
  }
}

console.log('— ⑦ FUNCTIONAL client: a normalizer-produced bubble → a real queue-op, and the error split');
{
  {
    const ws = read('src/ws-handler.js');
    ok('the attach payload carries queueNotifSteer from the ONE derivation (notificationSteerOf over the same sidecar read + in-band proof)', /queueNotifSteer: notificationSteerOf\(wc, \{ inBand, published \}\)/.test(ws));
  }
  {
      ok('the sentence is translated (zh + ja)', read('src/lib/i18n-zh.js').includes('Sent — but it could not be injected into the running turn') && read('src/lib/i18n-ja.js').includes('Sent — but it could not be injected into the running turn'));
  }

  {
    const cv = read('src/lib/chat-view.js');

    ok('…registered ONCE at module scope (registerCommand rejects a duplicate id BY DESIGN — a per-view registration would throw on the second chat window)', /if \(!hasCommand\(STEER_NOW_COMMAND\)\) \{\s*\n\s*registerCommand\(/.test(cv));

    ok("the KEYBINDING is 'alt+enter' → that command, per view, carrying the WINDOW's signal", /registerKeybinding\(\{\s*\n\s*key: 'alt\+enter',\s*\n\s*command: STEER_NOW_COMMAND,/.test(cv) && /signal: winInfo\?\._listenerCtl\?\.signal,/.test(cv));
    ok('…with a `when` that scopes the chord to THIS view (which is also what makes N simultaneous registrations of one chord legal)', /when: \(ctx\) => steerTargetView\(ctx\) === this && this\._canSteerComposer\(\)/.test(cv));
    ok('…and dispose() unregisters BOTH the binding and the view (a view can be replaced while its window lives on)', /this\._steerKeyDispose\?\.\(\);/.test(cv) && /LIVE_CHAT_VIEWS\.delete\(this\);/.test(cv));
    ok('the composer keydown routes through the SAME command, never a private handler', /onSteerChord: \(\) => runCommand\(STEER_NOW_COMMAND, \{ view: this \}\)/.test(cv) && /if \(this\._onSteerChord\) this\._onSteerChord\(\); else this\.steerNow\(\);/.test(read('src/lib/chat-input.js')));
  }

}

console.log('— wiring + docs pins');
{
  const cinput = read('src/lib/chat-input.js');
  // (2.369.195: lane channel-jump's stash strip — what waits FOR the agent — sits above this one — what YOU sent; both above the box)
  ok('the strip is above the box: the input area\'s second child, right under the stash strip (as designed)', /inputArea\.append\(this\._stashStrip\.el, this\._queueStrip, this\._attachArea/.test(cinput));
  ok('the strip renders nothing for a harness without queueOps (no dead control)', /const items = this\._queueCaps\.queueOps \? this\._queue : \[\];/.test(cinput));
  // ROUND-5: THE EDITOR OWNS THE BOX — a DOM-free pin on the guard itself, so
  // the shape survives an edit that never opens a browser.
  ok('sendText REFUSES while a queued-message editor owns the box (an action can never be swallowed into an `edit`)',
    /sendText\(text, \{ carriesUserText = false \} = \{\}\) \{\n\s*if \(!this\._textarea\) return false;\n\s*if \(this\._editingQueueId \|\| this\._pendingEdit\) \{\n\s*showToast\(t\('Finish or cancel the queued-message edit first/.test(cinput));
  ok('…and the action spends nothing of the user\'s: the half-typed box and the pending attachments are put back around the send',
    /const keptText = this\._textarea\.value;/.test(cinput) && /const keptAttachments = this\._attachments;/.test(cinput)
    && /if \(keptAttachments\.length\) \{ this\._attachments = keptAttachments; this\._renderAttachments\(\); \}/.test(cinput));
  ok('…and `_send` ANSWERS whether it took the box, so a bail-out reaches the action\'s caller as a refusal too',
    /_send\((?:\{ hold = false \} = \{\})?\) \{\n\s*const text = this\._textarea\.value\.trim\(\);\n\s*const hasAttachments = this\._attachments\.length > 0;\n\s*if \(!text && !hasAttachments\) return false;/.test(cinput)
    && /const sent = this\._send\(\) !== false;/.test(cinput) && /\n    return sent;\n  \}/.test(cinput));
  ok('…and the draft SLOT is handed back with the text (confirmDelivery would clear the store out from under it)',
    /if \(prevPendingSend\) this\._pendingSend = prevPendingSend;\n\s*else if \(!carriesUserText\) this\._pendingSend = null;/.test(cinput));
  // ROUND-6: the three follow-ups of the same audit.
  ok('round-6: an OLDER unconfirmed send keeps its slot rather than being cleared by the action that overwrote it',
    /if \(prevPendingSend\) this\._pendingSend = prevPendingSend;/.test(cinput)
    && !/this\._pendingSend && this\._pendingSend !== prevPendingSend/.test(cinput));
  ok('round-6: the delivery echo only clears what THAT send put in the store (a restored prompt is not its to delete)',
    /const stored = loadDraft\('chat', this\._sessionId\);\n\s*if \(stored && stored !== pending\.text && !\(pending\.text === '' && stored === pending\.storeBefore\)\) return;\n\s*clearDraft\('chat', this\._sessionId\);/.test(cinput));
  ok('round-6: sendText puts the box back UNCONDITIONALLY (an empty box must not keep the action\'s own text after a bail-out)',
    /const sent = this\._send\(\) !== false;[\s\S]{0,900}?\n    this\._textarea\.value = keptText;\n/.test(cinput));
  ok('round-6: the LATE writer (uploaded paths) lands on the edit\'s stash, never on the editor\'s box',
    /if \(this\._pendingEdit \|\| this\._editingQueueId\) \{ this\._stashUploadedPaths\(text\); return; \}/.test(cinput)
    && /_stashUploadedPaths\(text\) \{/.test(cinput)
    && /if \(this\._pendingEdit\) this\._pendingEdit\.draftBefore = append\(this\._pendingEdit\.draftBefore\);/.test(cinput));
  ok('round-6: …and the dead-socket notice cannot claim a restore it did not perform',
    /restoredMsg: t\('Connection lost — your message may not have been sent; the text was restored to the input'\),/.test(cinput)
    && /keptMsg: t\('Connection lost — your last message may not have been sent \(the input already had text, so it was left alone\)'\),/.test(cinput));
  // ── ROUND-7: the four follow-ups of the same audit. ────────────────────
  // ⓐ THE RELEASE MUST STAND OUTSIDE THE GATE. Round-6 put the slot hand-back
  // INSIDE `if (keptText.trim())`, i.e. it never ran for the ORDINARY state of
  // an action button: an empty box.
  ok('round-7: the draft-slot release stands OUTSIDE the `keptText.trim()` gate, which an action fired from an EMPTY box never enters',
    /\n    this\._textarea\.value = keptText;\n(?:\s*\/\/[^\n]*\n)*    if \(prevPendingSend\) this\._pendingSend = prevPendingSend;\n    else if \(!carriesUserText\) this\._pendingSend = null;\n    if \(keptText\.trim\(\)\) \{/.test(cinput));
  ok('round-7: …and the store the action PINNED to its own text is put back to what was really there (captured beside the slot, before the send)',
    /const prevDraft = loadDraft\('chat', this\._sessionId\);/.test(cinput)
    && /\} else if \(!carriesUserText \|\| prevPendingSend\) \{\n(?:\s*\/\/[^\n]*\n)*      saveDraft\('chat', this\._sessionId, prevDraft\);\n    \}/.test(cinput));
  // ⓑ+ⓒ ONE helper for the three holders of unsent text, and it answers with
  // WHAT IT DID rather than one sentence for every outcome.
  ok('round-7: ONE `_announceUnsent` helper, THREE outcomes (nothing to restore / restored / box occupied)',
    /_announceUnsent\(text, \{ restoredMsg, keptMsg, noneMsg \}\) \{\n\s*if \(!text\) \{[\s\S]{0,240}?return 'none';[\s\S]{0,400}?return 'restored';[\s\S]{0,240}?return 'kept';\n  \}/.test(cinput));
  ok('round-7: …and all THREE callers go through it — the unconfirmed send and BOTH /goal twins',
    [...cinput.matchAll(/this\._announceUnsent\(/g)].length === 3
    && /noneMsg: t\('Connection lost — your last message may not have been sent'\),/.test(cinput));
  ok('round-7: …so neither /goal twin can still announce a restore it did not perform',
    !/showToast\(t\('Connection lost before the goal was set — your command was restored to the input'\)/.test(cinput)
    && !/showToast\(t\('Goal not confirmed — the session may be unresponsive\. Your command was restored to the input\.'\)/.test(cinput)
    && /keptMsg: t\('Connection lost before the goal was set — the input already had text, so your command was left alone'\),/.test(cinput)
    && /keptMsg: t\('Goal not confirmed — the session may be unresponsive\. The input already had text, so your command was left alone\.'\),/.test(cinput));
  // ⓓ THE CLEAR MUST KNOW WHAT THE SEND DISPLACED, or a send with no text of
  // its own can never clear anything again.
  ok('round-7: the send records what it displaced in the store, and the deferred clear accepts EITHER its pin or that value',
    // (lane draft-focus-guard: a HELD draft — another client's, never shown in this box — is not what the send displaced)
    /const storeBefore = this\._heldDraft !== null \? null : loadDraft\('chat', this\._sessionId\);\n\s*if \(text\) saveDraft\('chat', this\._sessionId, text\);\n\s*this\._pendingSend = \{ text, storeBefore \};/.test(cinput)
    && /if \(stored && stored !== pending\.text && !\(pending\.text === '' && stored === pending\.storeBefore\)\) return;/.test(cinput));
  // ── ROUND-8: `sendText` HAS TWO KINDS OF CALLER, and round-7 released for
  // both. The design request is a message BUILT AROUND THE USER'S OWN BRIEF,
  // typed into a dropdown that closes on a true — the slot `_send` arms is
  // then the only copy, so releasing it made a half-open socket lose the
  // brief with zero trace (round 6, whose release sat inside the trim gate,
  // had restored it with a notice). The flag names the difference; the
  // DEFAULT is the action semantics, so a forgetful caller loses a rescue
  // rather than leaving someone else's text armed in the box.
  ok('round-8: `sendText` takes `carriesUserText`, defaulting to the ACTION semantics',
    /sendText\(text, \{ carriesUserText = false \} = \{\}\) \{/.test(cinput));
  ok('round-8: the release is scoped by WHO AUTHORED the payload — an older unconfirmed send still wins, and only an ACTION releases to nothing',
    /if \(prevPendingSend\) this\._pendingSend = prevPendingSend;\n\s*else if \(!carriesUserText\) this\._pendingSend = null;/.test(cinput)
    && !/this\._pendingSend = prevPendingSend \|\| null;/.test(cinput));
  ok("round-8: …and the store restore is skipped for exactly that case, so `_send`'s pin survives for a user-authored payload",
    /\} else if \(!carriesUserText \|\| prevPendingSend\) \{/.test(cinput));
  ok('round-8: the `storeBefore` arm of the deferred clear is scoped to a send with NO text of its own (a text-carrying send may only clear its own pin)',
    /!\(pending\.text === '' && stored === pending\.storeBefore\)/.test(cinput)
    && !/stored !== pending\.storeBefore/.test(cinput));
  // BOTH CALL SITES SAY WHICH THEY ARE, at the call — the flag is a claim
  // about the payload's author and it lives where the payload is built.
  {
    const cview = read('src/lib/chat-view.js');
    ok('round-8: the in-chat action button passes `carriesUserText: false` explicitly (product-authored text owns nothing)',
      /onSendText: \(txt\) => this\._chatInput\?\.sendText\(txt, \{ carriesUserText: false \}\),/.test(cview));
    ok('round-8: …and the design request passes true, because the dropdown that holds the brief closes on a true',
      /return this\._chatInput\.sendText\(msg, \{ carriesUserText: true \}\) !== false;/.test(cview));
    ok('round-8: those are still the ONLY two callers (a third would have to make the same choice on purpose)',
      [...cview.matchAll(/\.sendText\(/g)].length === 2
      && [...cinput.matchAll(/\n  sendText\(/g)].length === 1);
  }
  // The new sentences are real i18n keys (a missing zh/ja entry ships English).
  {
    const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
    const keys = ['Connection lost — your last message may not have been sent',
      'Connection lost before the goal was set — the input already had text, so your command was left alone',
      'Goal not confirmed — the session may be unresponsive. The input already had text, so your command was left alone.'];
    ok('round-7: every new notice has a zh AND a ja entry', keys.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')), keys.filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':')));
  }
  ok('…and every OTHER programmatic writer of the textarea is audited where they live (guard or reason, one list)',
    /EVERY PROGRAMMATIC WRITER OF THE TEXTAREA/.test(cinput) && /input-history recall \(ArrowUp\/ArrowDown\)/.test(cinput)
    && /`_insertUploadedPaths` \(upload button, folder picker, ChatView's/.test(cinput));
  // THE AUDIT'S OWN BLIND SPOT (round-6): the writer it missed writes through a
  // LOCAL alias, so grepping the field name cannot find it. Every alias of the
  // textarea must therefore be enumerated here, not just `this._textarea`.
  {
    const writes = [...cinput.matchAll(/\n\s+ta\.value = /g)].length;
    const guard = cinput.indexOf('this._stashUploadedPaths(text); return; }');
    const alias = cinput.indexOf("const ta = this._textarea;\n    const start");
    ok(`exactly ONE aliased writer of the box, and the editor guard stands above it (writes=${writes}, guard@${guard}, alias@${alias})`,
      writes === 1 && guard > 0 && alias > guard);
  }
  // A refusal that leaves the control dead is the offered action disappearing
  // right after its own toast said to come back — both callers must survive it,
  // and the design brief lives ONLY in that dropdown's textarea.
  ok('the Compact-now button re-enables itself when the send is refused',
    /if \(this\._onSendText\('\/compact'\) === false\) btn\.disabled = false;/.test(read('src/lib/chat-renderers.js')));
  ok('the design dropdown keeps the typed brief when the send is refused (it closed BEFORE the send)',
    /if \(this\._onDesignRequest\(brief, \{ public: pubCb\.checked[^}]*\}\) === false\) return;\n\s*dropdown\.remove\(\);/.test(read('src/lib/chat-status-bar.js'))
    && /return this\._chatInput\.sendText\(msg, \{ carriesUserText: true \}\) !== false;/.test(read('src/lib/chat-view.js')));
  const cw = read('data/bin/codex-chat-wrapper.js');
  const aw = read('data/bin/acp-wrapper.js');
  ok('BOTH wrappers serve the new stdin verb in the same batch (the frame-file lesson)', /msg\.type === 'queue-op'/.test(cw) && /case 'queue-op':/.test(aw));
  ok('both adverts caps.inputQueue in the sidecar THEY write', /inputQueue: true/.test(cw) && /inputQueue: true/.test(aw));
  {
    // 2.369.354: the claude chat-wrapper serves the same verbs and adverts them (the server never asks a process that
    // does not — a pre-.354 claude wrapper would forward a queue-op line to the CLI verbatim)
    const clw = read('data/bin/chat-wrapper.js');
    ok('the claude chat-wrapper serves queue-op AND queue-resync, never forwarding either to the CLI', /if \(parsed\.type === 'queue-op'\) \{ handleQueueOp\(parsed\); continue; \}/.test(clw) && /if \(parsed\.type === 'queue-resync'\) \{ publishQueue\(\); continue; \}/.test(clw));
    // (acceptance r2, lane claude-steer-inject: the advert STARTS as the .354 three and gains the steer pair at the CLI's
    // first state word — proveState writes the sidecar at once; a CLI that says none never advertises the hand-over)
    // int361 (主开发's seam, claude-steer × human-cli): the caps literal holds the hold verbs; human-cli r3 sets `receipts` on its own line
    ok('…and adverts inputQueue + its verb list + queueResync (+ human-cli\'s receipts) in the sidecar it writes', /caps: \{ frameFile: true, inputQueue: true, queueVerbs: CLAUDE_HOLD_VERBS, queueResync: true \}/.test(clw) && /\nmeta\.caps\.receipts = true;/.test(clw) && /const CLAUDE_QUEUE_VERBS = \['remove', 'steer', 'steer-all', 'reorder', 'edit'\];/.test(clw) && /const CLAUDE_HOLD_VERBS = \['remove', 'reorder', 'edit'\];/.test(clw) && /function proveState\(\) \{\n\s+stateProven = true;\n\s+meta\.caps\.queueVerbs = CLAUDE_QUEUE_VERBS;/.test(clw));
  }
  ok('the ACP unknown-verb message lists queue-op (the wrapper tells the truth about what it serves)', /chat-input\/interrupt\/queue-op\//.test(aw));
  // DISTINCT phrases per file (a loose grep matched 'queue-operation' in an
  // unrelated essay and the docs pin passed while the docs were empty)
  ok('kb-features documents QUEUED vs STEERED incl. the multi-queue rule', /QUEUED vs STEERED/.test(read('docs/kb-features.md')) && /steering item N injects\s*\n?\s*\*\*only N\*\*/.test(read('docs/kb-features.md')));
  // 2026-09-07: the SECOND rule that lives in this section — a VibeSpace
  // notification steers, a person's message queues, and a steer carries only
  // itself. It must be written where the user reads it AND cite the upstream
  // sources, because "a steer carries only itself" is what makes it safe.
  {
    const kbf = read('docs/kb-features.md');
    ok('kb-features states the notification rule in the same section', /SYSTEM NOTIFICATIONS STEER, PEOPLE QUEUE/.test(kbf) && /a steer carries only itself/.test(kbf));
    ok('…with the codex-rs sources cited (turn_processor.rs + get_pending_input/split_off)', /turn_processor\.rs/.test(kbf) && /get_pending_input/.test(kbf) && /split_off\(0\)/.test(kbf));
    ok('…and names the derived lane per harness (never a backend-id branch)', /notificationDelivery/.test(kbf) && /cli-inbox/.test(kbf) && /steer:'unsupported'|steer:.unsupported./.test(kbf));
    ok('kb-features Background Work says the floor+stash drain as ONE block', /renderNotifStash/.test(kbf) && /ONE rendered block/.test(kbf));
    ok("kb-api documents the peer-message frame's typed origin", /TYPED ORIGIN/.test(read('docs/kb-api.md')) && /mode:'steered'/.test(read('docs/kb-api.md')));
  }
  ok("kb-api documents the ws 'queue-op' message + the queue_changed/queue_op_result events", /\*\*Input queue \(`queue-op`/.test(read('docs/kb-api.md')) && /queue_op_result \{op, id, msg_id, ok, reason, detail\}/.test(read('docs/kb-api.md')));
  ok('design-harness-plugins §1 records the closure on its own P2 row', /两种发送模式 ✅2026-09-06/.test(read('docs/design-harness-plugins.md')));
  ok('…and the round-2 client laws are written down where the strip lives (kb-file-structure) and where the user reads (kb-features)',
    /THE QUEUE STRIP'S CLIENT LAWS/.test(read('docs/kb-file-structure.md')) && /Your rewrite is never spent on a refusal/.test(read('docs/kb-features.md')));
  ok('…and kb-api documents the echoed op/id and BOTH size gates on the one verb that carries user text',
    /`op` and `id` are ECHOED/.test(read('docs/kb-api.md')) && /text-too-long/.test(read('docs/kb-api.md')) && /frame-too-large/.test(read('docs/kb-api.md')));
  ok('design-harness-features §2.1 records the adversarial round with its six findings', /round-2 对抗验证：6 条真缺陷/.test(read('docs/design-harness-features.md')));
  ok('…and §2.1b records the notification-steer decision with its upstream citations', /### 2\.1b/.test(read('docs/design-harness-features.md')) && /turn_processor\.rs:1023-1039/.test(read('docs/design-harness-features.md')) && /split_off\(0\)/.test(read('docs/design-harness-features.md')));
  { const kbfs = read('docs/kb-file-structure.md');
    ok('kb-file-structure carries the wrapper/normalizer/ws essays (the measured app-server facts live there)',
      /THE INPUT QUEUE — QUEUED vs STEERED/.test(kbfs) && /QUEUE STATE IS SESSION STATE, NEVER A MESSAGE/.test(kbfs) && /the ONE new case for QUEUED vs STEERED/.test(kbfs) && /no `remove`/.test(kbfs)); }

  // ── ⑨ THE CHORD: wiring + i18n + docs ──
  const cinput2 = read('src/lib/chat-input.js');
  const cv2 = read('src/lib/chat-view.js');
  ok('the chord is checked BEFORE the plain-Enter branch (that branch tests only !shiftKey and would swallow Alt+Enter as an ordinary send — the bug this ordering exists to prevent)',
    // lane chat-enter-ime: the plain-Enter branch is now the PURE enterKeyAction behind this._enterGuard.enter (its
    // non-Shift Enter is 'send', Alt included — so the ordering still matters)
    cinput2.indexOf("e.key === 'Enter' && e.altKey") > 0 && cinput2.indexOf("e.key === 'Enter' && e.altKey") < cinput2.indexOf("this._enterGuard.enter(e,"));
  ok('…and it is the ONLY new chord: Tab stays the slash completion, Ctrl/Cmd+Enter stays plain send',
    // lane channel-enter-ime: the slash picker's Tab/Enter now stands behind !imeOwnsKey(e) (an input method's Enter commits its word)
    /if \((?:!imeOwnsKey\(e\) && \()?e\.key === 'Tab' \|\| e\.key === 'Enter'\)/.test(cinput2) && /const mod = !!\(e\.ctrlKey \|\| e\.metaKey\);[\s\S]*?return mod \? 'send' : 'newline';/.test(read('src/lib/chat-enter-keys.js')) && /if \(act === 'send'\) \{ e\.preventDefault\(\); this\._send\(\); \}/.test(cinput2)
    && (cinput2.match(/e\.key === 'Enter' && e\.altKey/g) || []).length === 1);
  ok('the chord condition excludes every other modifier (Alt+Shift/Alt+Ctrl+Enter are not it)', /e\.key === 'Enter' && e\.altKey && !e\.ctrlKey && !e\.metaKey && !e\.shiftKey && \(this\.steerChordAllowed \|\| this\.holdChordAllowed\)/.test(cinput2));
  ok('BOTH surfaces gate on the ONE capability answer, never on a backend id', /this\._steerBtn\.classList\.toggle\('hidden', !\(live && modes\.allowSteerChord\)\)/.test(cinput2) && !/=== 'codex'|=== 'claude'|=== 'opencode'|=== 'antigravity'/.test(cinput2));
  ok('…which comes from the PURE composerSendModes over the LIVE queue caps (the same object the strip reads)', /_sendModes\(\) \{ return composerSendModes\(this\._queueCaps[,)]/.test(cinput2) && /_canSteerComposer\(\) \{ return !!this\._chatInput\?\.steerChordAllowed; \}/.test(cv2));
  ok('both faces repaint on BOTH inputs: the streaming flag AND the late-arriving caps (the dead-chip ordering)', /_updateSendModes\(\);\s*\n\s*\}/.test(cinput2) && /this\._renderQueue\(\);[\s\S]{0,400}this\._updateSendModes\(\);/.test(cinput2) && (cinput2.match(/this\._updateSendModes\(\)/g) || []).length >= 4, (cinput2.match(/this\._updateSendModes\(\)/g) || []).length);
  ok('the send→steer conversion reuses the ONE queue-op sender (no second wire shape anywhere)', /this\._sendQueueOp\('steer', it\.id\);/.test(cv2) && (cv2.match(/type: 'queue-op'/g) || []).length === 1);
  ok('the ≤768px button carries an SVG icon and an aria-label, never a glyph (§17)', /this\._steerBtn\.innerHTML = UI_ICONS\.bolt;/.test(cinput2) && /setAttribute\('aria-label'/.test(cinput2));
  ok('the two surfaces are split by VIEWPORT in CSS, theme vars only (§17)',
    /@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{ \.chat-send-hint \{ display: none; \} \}/.test(read('public/chat.css'))
    && /@media \(max-width: 768px\), \(pointer: coarse\) and \(max-width: 1023px\) \{ \.chat-steer-btn:not\(\.hidden\) \{ display: inline-flex; \} \}/.test(read('public/chat.css'))
    && /\.chat-steer-btn\.hidden \{ display: none; \}/.test(read('public/chat.css'))
    && !/chat-(send-hint|steer-btn)[^}]*#[0-9a-f]{3,6}/i.test(read('public/chat.css')));
  { const zh2 = read('src/lib/i18n-zh.js'), ja2 = read('src/lib/i18n-ja.js');
    ok('every new chord string is translated (zh + ja)', ['"Enter queues"', '"Alt+Enter injects now"', '"Send now — inject into the running turn"', '"Sending during a turn"', '"Enter queues it — it runs after this turn"'].every((k) => zh2.includes(k) && ja2.includes(k))); }
  ok('Session Properties documents it, gated by the SAME predicate (and shows nothing where there is no queue surface)', /composerSendModes\(getBackendMeta\(s\.backend \|\| 'claude'\)\?\.caps\?\.inputModes\)/.test(read('src/lib/session-props.js')) && /if \(sm\.showHint\)/.test(read('src/lib/session-props.js')));
  // ROUND-2 MINOR, at the source too: `section()` APPENDS, so no lazy row may
  // call it directly — the header is memoised behind ONE factory (⑨f proves
  // the behaviour in a real document; this is the drift guard).
  { const sp = read('src/lib/session-props.js');
    ok('…and its section header is created at most ONCE (no `cfgSec || section(...)` per lazy row — that idiom printed the header twice)',
      /const cfgSection = \(\) => \{ if \(!cfgSecMemo\) cfgSecMemo = section\(t\('Config overrides'\)\); return cfgSecMemo; \};/.test(sp)
      && !/row\(cfgSec \|\| section\(/.test(sp)
      && (sp.match(/section\(t\('Config overrides'\)\)/g) || []).length === 2, (sp.match(/section\(t\('Config overrides'\)\)/g) || []).length); }
  // ROUND-2 MAJOR, at the source: the timeout's silence is a TURN IDENTITY
  // comparison, never the truthiness of a flag the next turn re-arms.
  { const cv3 = read('src/lib/chat-view.js');
    ok('the steer timeout compares the TURN it was armed in (a re-armed flag is not the same turn)',
      /const turnAtSend = this\._turnEpoch \|\| 0;/.test(cv3) && /if \(\(this\._turnEpoch \|\| 0\) !== turnAtSend\) return;/.test(cv3));
    ok('…and the epoch advances ONLY at the real boundary: _noteTurnBoundary, called first thing by the turn_complete meta op — never on the label arm (round 3)',
      /_noteTurnBoundary\(\) \{ this\._turnEpoch = \(this\._turnEpoch \|\| 0\) \+ 1; \}/.test(cv3)
      && /op\.subtype === 'turn_complete'\) \{\s*\n\s*this\._noteTurnBoundary\(\);/.test(cv3)
      && !/if \(!this\._typingSince\) \{[\s\S]{0,160}_turnEpoch/.test(cv3)
      && (cv3.match(/this\._turnEpoch = /g) || []).length === 1); }
  { const kbd = read('docs/keyboard-shortcuts.md');
    ok('docs/keyboard-shortcuts.md carries the chord, the per-harness table and the ≤768px behaviour', /\*\*Alt\+Enter\*\*/.test(kbd) && /Sending while a turn is running/.test(kbd) && /chat\.steerNow/.test(kbd) && /Touch \/ ≤768px/.test(kbd)); }
  { const kbf = read('docs/kb-features.md');
    ok('kb-features QUEUED vs STEERED gains the chord, the hint gate and the touch face', /THE CHORD: `Alt\+Enter` = steer/.test(kbf) && /not `queue`\*\*/.test(kbf) && /≤768px: no chords, a BUTTON/.test(kbf));
    ok('…and the round-2 invariants: WHICH turn the timeout is about, and the once-only Config-overrides header', /\*\*WHICH turn, never "a turn"/.test(kbf) && /at most once, on\s*\n\s*first demand\*\* \(`cfgSection\(\)`\)/.test(kbf)); }
  { const kbfs2 = read('docs/kb-file-structure.md');
    ok('kb-file-structure: the chord essays live under chat-input.js AND contributions.js', /THE Alt\+Enter STEER CHORD/.test(kbfs2) && /THE FIRST CORE `registerKeybinding` CHORD/.test(kbfs2));
    ok("…and chat-view.js carries the chord's view half incl. the turn-identity guard", /THE STEER CHORD'S VIEW HALF/.test(kbfs2) && /`_turnEpoch`/.test(kbfs2)); }
  { const kbd2 = read('docs/keyboard-shortcuts.md');
    ok('docs say what happens when the turn ends first (silence, not an apology)', /\*\*If the turn ends first,\*\*/.test(kbd2)); }
  ok('the kb-file-structure INDEX head indexes the new PURE predicate', /composerSendModes/.test(indexHead('docs/kb-file-structure.md')));
}

console.log('— ⑧ the Stop button is one-shot while an interrupt is in flight');
{
  const cinput = read('src/lib/chat-input.js');
  ok('every Stop entry point goes through _fireInterrupt (plain click AND the armed compaction confirm)',
    (cinput.match(/this\._fireInterrupt\(\)/g) || []).length === 2 && !/btn\.onclick = \(\) => this\._onInterrupt\(\)/.test(cinput), cinput.match(/_(fire|on)Interrupt\(\)/g));
  ok('the pending state is re-applied by showTyping itself (the label repaint is what used to hand the button back)', /if \(this\._stopPending\) \{ this\._applyStopPending\(btn\);/.test(cinput));
  ok('it ends on the turn ending (hideTyping) AND on a bounded fallback timer — a Stop button that stays dead is the one failure this control may not have',
    /hideTyping\(\) \{[\s\S]{0,400}this\._endStopPending\(\);/.test(cinput) && /setTimeout\(\(\) => \{[\s\S]{0,300}this\._endStopPending\(\);\s*\n\s*\}, ChatInput\.STOP_PENDING_MS\)/.test(cinput));
  ok('dispose clears the timer (no orphaned callback into a closed window)', /if \(this\._stopPendingTimer\) \{ clearTimeout\(this\._stopPendingTimer\); this\._stopPendingTimer = null; \}/.test(cinput));
  // the window must OUTLAST the wrapper's own Stop budget, or it re-arms while
  // the sweep it is waiting for is still running
  const pendingMs = Number(/static get STOP_PENDING_MS\(\) \{ return (\d+); \}/.exec(cinput)?.[1]);
  const sweepMs = Number(/const STOP_SWEEP_TOTAL_MS = (\d+);/.exec(read('data/bin/codex-chat-wrapper.js'))?.[1]);
  ok(`the pending window (${pendingMs}ms) outlasts the codex wrapper's whole Stop sweep budget (${sweepMs}ms)`, pendingMs > sweepMs, { pendingMs, sweepMs });
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok('the new strings are translated (zh + ja)', ["'Stopping…':", "'Stopping the current turn…':"].every((k) => zh.includes(k) && ja.includes(k)));
  ok("Stop's put-back toast is translated (zh + ja — lane stop-refills-composer)", ['"Stop put {n} queued message(s) back into the input box":', '"{k} attached image(s) were not put back — attach them again":', '"{k} other attachment(s) were not put back — attach them again":', '"{m} message(s) came back shortened":', '"{k} more queued message(s) were too long to put back":'].every((k) => zh.includes(k) && ja.includes(k)));
  ok('the pending look is a CLASS in the stylesheet, theme vars only (§17)', /\.chat-interrupt-btn\.chat-interrupt-pending/.test(read('public/chat.css')) && !/chat-interrupt-pending[^}]*#[0-9a-f]{3,6}/i.test(read('public/chat.css')));
}

console.log('— ⑨ steered messages: one bubble each, live and after a reload');
{
  // (h) THE WRAPPER SIDE, by construction: the branch that records an inherited
  // submission, the cid bookkeeping that stops it doubling our own bubbles, and
  // the breadcrumb every OTHER unrouted item kind now leaves (its absence is
  // how `userMessage` stayed lost through four releases).
  {
    const cw = read('data/bin/codex-chat-wrapper.js');
    ok("item/completed routes `userMessage` — the app-server's own carrier for a submission entering the turn", /if \(type === 'userMessage'\) \{[\s\S]{0,220}recordInboundUserMessage\(asString\(item\.clientId \|\| item\.client_id\), userInputToContent\(item\.content\)/.test(cw));
    ok('a landed steer writes the bubble AT ONCE, in queue order (the commit twin arrives up to a minute later)', /await request\('turn\/steer'[\s\S]{0,1600}recordInboundUserMessage\(cid, userInputToContent\(item\.input\), 'steered'\)/.test(cw));
    // INTEGRATION (2026-09-07): the `turn/steer` call itself now lives in
    // `steerInput`, which the notification lane shares — so the fact this pin
    // owns is stated where it happens: steerOne RETURNS the refusal (whatever
    // `steerInput` classified) BEFORE the line that writes the bubble.
    ok('…and a REFUSED steer records nothing (that message is still queued)',
      /const st = await steerInput\(item\.input, cid\);\n\s*if \(!st\.ok\) \{[\s\S]{0,220}?return \{ \.\.\.base, \.\.\.st \};\n\s*\}/.test(cw)
      && /if \(!st\.ok\) \{[\s\S]{0,1200}?recordInboundUserMessage\(cid, userInputToContent\(item\.input\), 'steered'\)/.test(cw)
      && !/steerInput[\s\S]{0,400}?recordInboundUserMessage/.test(cw.slice(cw.indexOf('async function steerInput'), cw.indexOf('async function steerOne'))));
    ok('every id whose bubble we already wrote is remembered — chat-input, the queued cid and the peer cid', (cw.match(/noteRecordedUserCid\(/g) || []).length >= 5);
    ok('the record carries the queue id + its producer as out-of-band markers, LAST, so the stable payload stays {type, role, content}',
      /record\('response_item', \{\n\s*type: 'message', role: 'user', content: blocks, webui_queue_id: id, webui_queue_via: kind,\n\s*\.\.\.\(kind === 'drained' \? \{ webui_after_commit: true \} : \{\}\),\n\s*\}\);/.test(cw));
    // WHICH producer wrote it is load-bearing, not decoration: the two sit on
    // opposite sides of codex's own copy in time, and only the LATE one may
    // yield to it (see (j3)). A `via` the reader does not know must degrade to
    // the EARLY meaning — an unnamed producer may never delete a bubble.
    ok('…and the producer is a NAMED enum, defaulting to the early meaning', /INBOUND_USER_VIA = \{ steered: 'steered', drained: 'drained' \}/.test(cw) && /INBOUND_USER_VIA\[via\] \|\| 'steered'/.test(cw));
    ok('the item/completed twin — the one that arrives AFTER codex persisted its own copy — is the record marked \'drained\'', /if \(type === 'userMessage'\) \{[\s\S]{0,260}, 'drained'\);/.test(cw));
    ok('an inherited queue row advertises the app-server cid as its msgId so the strip row and the bubble chip join', /msgId: known \? \(known\.msgId \|\| ''\) : cid/.test(cw) && /msg_id: known \? \(known\.msgId \|\| ''\) : cid/.test(cw));
    ok('NO SILENT DROPS: an unrouted item/completed kind is logged once and counted in the sidecar', /noteUnhandledItem\(type\);\n\}/.test(cw) && /meta\.unhandledItems/.test(cw));
    ok('…and the deliberate no-ops are NAMED (a set, not silence)', /NO_RENDER_COMPLETED_ITEMS = new Set\(\[[\s\S]{0,400}'hookPrompt'/.test(cw));
  }

    // (j6) THE CENSUS. The yield rule above is only as complete as the list of
    // producers that DECLARE their commit order — the round-2 peer regression
    // (test-peer-msg-card, idle path) was exactly a producer nobody had asked
    // the question of. Three writers of a user record exist in the wrapper; a
    // fourth must answer "had the app-server committed it yet?" before it
    // ships, so this count is a gate, not a decoration.
    {
      const cw = read('data/bin/codex-chat-wrapper.js');
      const producers = cw.match(/record\('response_item',[\s\S]{0,300}?role: 'user'/g) || [];
      // (lane lg-text-legs-3, B-94d3: the two census legs below had their arguments swapped in the heavy — `ok(n, c, e)` got the
      // condition as the NAME and a non-empty string as the condition, so neither could ever fail; put right on the move)
      ok(`every wrapper producer of a user record is accounted for: chat-input (early), the inherited-queue bubble (steer early / drain late), the peer copy (queued early / idle late) — found ${producers.length}`, producers.length === 3, producers.length);
      ok('and exactly the two LATE ones declare it', /webui_after_commit/.test(cw) && (cw.match(/webui_after_commit: true/g) || []).length === 2, (cw.match(/webui_after_commit: true/g) || []).length);
    }
    {
      // THE WIRING PIN (2.355.0 lesson): the reader half above is only half the
      // fix — our copy has to be SPELLED by the same function that encodes the
      // submission, or the two drift again the next time either is touched.
      const cw8 = read('data/bin/codex-chat-wrapper.js');
      ok('WIRING PIN: handleInput writes the content through userInputToContent(encodeUserInput(…)) — ONE spelling, never a second hand-rolled array',
        /content: userInputToContent\(encodeUserInput\(text, attachments\)\),/.test(cw8)
        && !/attachments\.map\(\(item\) => \(\{ type: 'input_image', image_url: item\.image_url \}\)\)/.test(cw8));
      // …and the THIRD producer of our copy: the SERVER's preview record
      // (CodexAdapter._buildUserPreview → session.buffer, ws-handler). It
      // carries the same webui_msg_id, so it WINS the fingerprint and its
      // content key is the one that claims — a wrapper-only fix changes
      // nothing in production. test-codex-p2-wrapper ⑦(a2) compares the two
      // byte for byte through one client frame; this is the cheap tripwire.
      ok('WIRING PIN: the server-side preview record spells the content the same way — text first, attachments after',
        /const content = \[\n\s*\.\.\.\(text \? \[\{ type: 'input_text', text \}\] : \[\]\),\n\s*\.\.\.attachments\.map\(a => \(\{ type: 'input_image', image_url: a\.image_url \}\)\),\n\s*\];/.test(read('src/adapters/codex.js')));
    }
    {
      // …and NO producer writes it any more. A marker with a reader rule and no
      // writer is the shape this round removed; a marker with a writer that the
      // preview overrides is the shape it removed BEFORE that.
      ok('NO producer writes `webui_no_commit`: not the wrapper, not the adapter\'s preview, not the ws layer',
        ['data/bin/codex-chat-wrapper.js', 'src/adapters/codex.js', 'src/ws-handler.js']
          .every((f) => !/webui_no_commit\s*:/.test(read(f))));
      // ⑥ WIRING PINS — the reader's rule is dead unless the wrapper speaks it.
      const cw9 = read('data/bin/codex-chat-wrapper.js');
      // ONE GATE (round 4): the same predicate both withdraws the claim and
      // decides that the wrapper serves the text — two gates sharing a regex
      // were what round 3 had, and the declaration they fed was unreachable.
      ok('WIRING PIN: the retraction and the executor are behind ONE gate (one regex, no second spelling to drift)',
        /if \(!attachments\.length && isWrapperSlashCommand\(text\)\) \{\n\s*retractUserRecord\(msg\.msgId, 'served by the wrapper as a slash command'\);\n\s*await applySlashCommand\(text\);\n\s*return;\n\s*\}/.test(cw9)
        // ONE regex object, used by the predicate AND by the executor: a second
        // literal listing the commands is what would drift the two apart.
        && /^const SLASH_COMMAND_RE = /m.test(cw9)
        && /function isWrapperSlashCommand\(text\) \{\n\s*return SLASH_COMMAND_RE\.test/.test(cw9)
        && /const m = SLASH_COMMAND_RE\.exec\(String\(text \|\| ''\)\.trim\(\)\);/.test(cw9)
        && (cw9.match(/\/\^\\\/\(compact\|review\|model\|effort\)/g) || []).length === 1);
      // …and it is withdrawn BEFORE the command runs: /compact takes 1–2
      // minutes, and a wrapper killed inside that window would otherwise leave
      // a claim standing over a message it never sent.
      ok('WIRING PIN: the retraction precedes the await, not the return', cw9.indexOf("retractUserRecord(msg.msgId, 'served by the wrapper as a slash command')") < cw9.indexOf('await applySlashCommand(text);'));
      ok('WIRING PIN: every path where the submission never lands AS WRITTEN retracts — turn/start, thread/queue/add, an explicit remove, the Stop sweep, a wrapper-served slash command, an EDIT',
        (cw9.match(/retractUserRecord\(/g) || []).length === 7
        && /retractUserRecord\(msg\.msgId \|\| cid, 'thread\/queue\/add failed: '/.test(cw9)
        && /retractUserRecord\(msg\.msgId, 'turn\/start failed: '/.test(cw9)
        && /retractUserRecord\(item\.clientUserMessageId, 'removed from the queue before it ran'\)/.test(cw9)
        && /retractUserRecord\(cid, 'dropped by Stop before it ran'\)/.test(cw9)
        && /retractUserRecord\(msg\.msgId, 'served by the wrapper as a slash command'\)/.test(cw9)
        && /retractUserRecord\(cid, 'edited before it ran'\)/.test(cw9),
        (cw9.match(/retractUserRecord\([^)]*\)/g) || []).join(' | '));
      ok('…and a retraction is only ever emitted for a record we actually wrote', /if \(!msgId \|\| !recordedUserCids\.has\(msgId\)\) return false;/.test(cw9));
    }
    {
      // ⑥ WIRING PINS — the gate, its placement, and the fact it compares.
      const cwE = read('data/bin/codex-chat-wrapper.js');
      const editBlock = /\/\/ ── EDIT \(text only[\s\S]*?\n  \}\n/.exec(cwE)?.[0] || '';
      ok('WIRING PIN: the edit branch retracts by the item\'s OWN cid, on the SUCCESS path only',
        /retractUserRecord\(cid, 'edited before it ran'\)/.test(editBlock)
        && editBlock.indexOf("await request('thread/queue/update'") < editBlock.indexOf("retractUserRecord(cid, 'edited before it ran')")
        && editBlock.indexOf("retractUserRecord(cid, 'edited before it ran')") < editBlock.indexOf("emitTaskEvent('queue_op_result', { op, id, ok: true"),
        editBlock.slice(0, 200));
      ok('…and it is GATED on the text having really changed, measured against the FRESH queue row',
        /const rewritten = queuedFullText\(item\.input\) !== text;/.test(editBlock)
        && /if \(rewritten\) retractUserRecord\(cid, 'edited before it ran'\);/.test(editBlock)
        // the gate is computed BEFORE the RPC — `item.input` is the row we read,
        // and the update overwrites the server's copy
        && editBlock.indexOf('const rewritten =') < editBlock.indexOf("await request('thread/queue/update'"));
      ok('…and a FAILED update retracts nothing (the queued text is untouched, so the claim still holds)',
        !/catch \(e\) \{[\s\S]*?retractUserRecord/.test(editBlock), editBlock.slice(editBlock.indexOf('} catch')).slice(0, 200));
    }

}

console.log('— ⑬ the queue across a restart: a guess says so, and the wrapper is asked');
{
  // ⑬a THE RING. Both wrappers that own a queue keep stdout bounded by dropping
  // the HEAD, so a `queue_changed` scrolls out of the file a restarted server
  // rebuilds from. Pinned in both, because the property is what makes (b) true.
  for (const f of ['data/bin/codex-chat-wrapper.js', 'data/bin/acp-wrapper.js']) {
    const w = read(f);
    ok(`${path.basename(f)}: stdout is a RING that drops the HEAD (${/const MAX_BUFFER = (\d+);/.exec(w)?.[1]} bytes) — a queue publication is a record like any other and scrolls out`,
      /const MAX_BUFFER = \d+;/.test(w) && /if \(buffer\.length > MAX_BUFFER\) \{[\s\S]{0,240}buffer = buffer\.slice\(idx \+ 1\);/.test(w));
  }

  {
    const src = read('src/ws-handler.js');

    // …and the ASK is gated on BOTH the harness row and the per-PROCESS advert.
    ok('the attach ASKS the wrapper to re-state ONLY when it does not know, and only a wrapper that ADVERTS the verb (an ACP wrapper too old for it answers with a VISIBLE error card)',
      /if \(!queueAdvert\.queueKnown && session\.pty && wcapsAttach\.queueResync\s*\n\s*&& \(capsOf\(session\.backend\)\.inputModes\?\.queueVerbs \|\| \[\]\)\.length\) \{/.test(src));
    ok('…through the ADAPTER, like every other stdin verb (the wire spelling lives with formatQueueOp, never inline here)',
      /const ad = adapterRegistry\.get\(session\.backend\);\s*\n\s*if \(ad\) session\.pty\.write\(ad\.formatQueueResync\(\) \+ '\\n'\);/.test(src));
    ok("'created' says the same: a RESUMED thread hands the new wrapper a queue it never filled, so the `[]` there is a placeholder too",
      /queueKnown: false,/.test(read('src/ws-create.js')));
  }

}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
