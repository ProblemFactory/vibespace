#!/usr/bin/env node
// THE STDOUT REGISTRY — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the
// heavy scripts/test-stdout-registry.mjs, whose consumers driven over stub ptys, the engine-dep census over its own stub, the
// vocabulary law, the adapter's spawn env and the real wire leg stay there (with its own release-gate pin): B3's drift guard,
// the ONE-writer census of the cleared kind (with its injected fourth exit as the control), the 'status' handled pin, the
// SendUserFile key and the renderer's hand-off, CLAUDE_STREAM_TYPES' queue records, the wiring pins and B3's seams. Each reads
// the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-stdout-registry-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import { anchored } from './scratch.mjs';   // the planted control's edit (fails by name if its anchor moves)
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; process.stderr.write('  ✗ ' + n + (e ? ' — ' + e : '') + '\n'); } }; // stderr directly: console.error is captured below
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('— B3 turn truth (claude)');
{
  // DRIFT GUARD (the 2.331.0 lesson): the fix is ONE `??` pair at ONE read
  // point — a later "clean-up to the documented schema" silently restores the
  // production bug, and only the camelCase legs above would catch it.
  const csj = read('src/server/stdout/claude-stream-json.js');
  ok('the read point still accepts BOTH spellings (drift guard)', /ev\.hook_type \?\? ev\.hookType/.test(csj) && /ev\.hint_text \?\? ev\.hintText/.test(csj), 'claude-stream-json.js stopped reading both compact_progress spellings');
  const strays = csj.replace(/ev\.hook_type \?\? ev\.hookType/g, '').replace(/ev\.hint_text \?\? ev\.hintText/g, '');
  ok('…and nothing downstream re-reads the raw event (one read, one normalized broadcast)', !/ev\.hook_type|ev\.hint_text|ev\.hookType|ev\.hintText/.test(strays));
}
{
    // ── THE PIN HAS TO SEE A *SILENT* EXIT (round 7) ───────────────────────
    //    Round 6 counted CALL SITES (`retires === 2`), which detects a deleted
    //    call and is blind to the defect it was written for: a FOURTH exit that
    //    clears the kind on its own. REPRODUCED on this suite — inserting
    //      if (msg.type === 'system' && msg.subtype === 'vs_fake_silent_exit')
    //        { session._streamingKind = null; }
    //    into the consumer left ALL 168 asserts green, pin included. So the pin
    //    is now on the ASSIGNMENTS: `endCompaction` is the ONE WRITER of the
    //    cleared kind (it broadcasts, and `retireCompaction` is the guarded
    //    wrapper both turn-lifecycle exits call), and a fifth exit is a NEW
    //    write, which this census makes red by construction.
    const csj2 = read('src/server/stdout/claude-stream-json.js');
    // Comment lines are prose ABOUT the rule (this file's own essay quotes the
    // assignment) — the census is about code.
    const codeLines = (src) => src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l));
    const clearsIn = (src) => codeLines(src)
      .map((l) => ({ l }))
      .filter(({ l }) => /_streamingKind\s*(=[^=]|\]\s*=[^=])/.test(l) && /=\s*null/.test(l));
    const clears = clearsIn(csj2);
    ok(`CENSUS: exactly ONE line in the consumer clears _streamingKind, and it is inside endCompaction (${clears.length} found)`,
      clears.length === 1 && /sess\._streamingKind = null;/.test(clears[0].l)   // `sess` is endCompaction's own parameter name
      && /const endCompaction = \(sess, sid, \{ result = null, error = null, announce = true \}/.test(csj2)
      && /const retireCompaction = \(sess, sid\) => \(sess\._streamingKind === 'compacting' \? endCompaction\(sess, sid\) : false\);/.test(csj2),
      JSON.stringify(clears.map((c) => c.l.trim())));
    ok('…and that one writer BROADCASTS the retirement (a clear that does not speak is the whole defect)',
      /sess\._streamingKind = null;[^]{0,500}?if \(announce\) broadcastToSession\(sess, sid, \{ type: 'compact-progress'[^]{0,120}?event: 'compact_end'/.test(csj2),
      'endCompaction no longer broadcasts compact_end next to the clear');
    // The ONE announce-suppressed caller is the dormant compact_progress lane,
    // which publishes its own frame for the same transition a few lines down.
    const suppressed = [...csj2.matchAll(/announce: false/g)].length;
    ok(`…and exactly ONE caller suppresses the announcement (${suppressed}) — the dormant compact_progress lane, which broadcasts its own frame for the same end`,
      suppressed === 1 && /if \(ev\.type === 'compact_end'\) endCompaction\(session, id, \{ announce: false \}\);/.test(csj2));
    // NEGATIVE CONTROL: the census must SEE the injected exit that fooled the
    // round-6 pin. Run it over the same source with that line put back.
    const injected = csj2.replace('const authoritative = session._turnStateSeen === true;',
      "const authoritative = session._turnStateSeen === true;\n            if (msg.type === 'system' && msg.subtype === 'vs_fake_silent_exit') { session._streamingKind = null; }");
    ok('NEGATIVE CONTROL: the census FLAGS the exact fourth silent exit that left round 6\'s call-site pin green',
      clearsIn(injected).length === clears.length + 1, JSON.stringify(clearsIn(injected).map((c) => c.l.trim())));
    // …and no OTHER module may clear it either (the teardown path retires
    // through the consumer's own bound function — session-schema row).
    const otherClearers = ['src/ws-handler.js', 'src/server/session-stdout.js', 'src/server/stdout/codex-events.js', 'src/server/stdout/acp-events.js']
      .filter((f) => clearsIn(read(f)).length > 0);
    ok('…and no other module clears the claim behind the consumer\'s back (the teardown exit calls session._retireCompaction)',
      otherClearers.length === 0 && /session\._retireCompaction\?\.\(\)/.test(read('src/server/session-stdout.js'))
      && /_retireCompaction:/.test(read('src/session-schema.js')), JSON.stringify(otherClearers));
}
{
  ok("'status' is listed as HANDLED so the unknown-subtype breadcrumb stops firing for the record that marks every real compaction",
    /'status',/.test(read('src/message-manager.js').slice(0, read('src/message-manager.js').indexOf('])'))));
}

console.log('— agent→user channel (SendUserMessage / SendUserFile)');
{
    // ...and the shipped consumer must not spell that key any more
    const csj = read('src/server/stdout/claude-stream-json.js');
    ok('...and the shipped SendUserFile publish namespaces its key and passes NO visibility flag',
      /srcKey: `userfile:\$\{session\.backendSessionId \|\| session\.claudeSessionId \|\| id\}:\$\{abs\}`/.test(csj)
      && !/makePublic:\s*false/.test(csj) && !/srcKey: 'local:' \+ abs/.test(csj), 'claude-stream-json srcKey/makePublic');
}
{
    // WIRING PIN: the pure rule is useless if the renderer never feeds it the
    // outcome (the 2.355.0 unstaged-wiring class).
    const cr = read('src/lib/chat-renderers.js');
    ok('...and chat-renderers really HANDS the outcome to the record (a pure rule with no call site is a fix that never ships)',
      /userChannelRecord\(\{\s*\n\s*toolName: block\.toolName, input: block\.input, output: block\.output,\s*\n\s*status: msg\.status \|\| block\.status, toolStatus: msg\.toolStatus,/.test(cr), 'chat-renderers _renderUserChannelMsg');
}

console.log('— the put-back door at the feedLive gate (lane stop-refills-composer)');
{
    const srvSrc = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
    const lit = /const CLAUDE_STREAM_TYPES = new Set\(\[([\s\S]*?)\]\);/.exec(srvSrc);
    ok('server.js CLAUDE_STREAM_TYPES lists the wrapper\'s four queue records (the unknown-type breadcrumb stays quiet for a handled record)', !!lit && ['queued_input', 'queue_changed', 'queue_op_result', 'queue_dropped'].every((t) => lit[1].includes(`'${t}'`)));
}

console.log('— wiring pins');
{
  const ss = read('src/server/session-stdout.js');
  // `permissionRulesRef` joined the deps on 2026-09-07 (owner ruling 10): the
  // codex/acp consumers route a `permission_rules` answer back to the pending
  // READ — a lazy ref like the others, never a new inline consumer.
  ok('session-stdout requires the registry and builds it ONCE in create() with the orchestrator deps', /require\('\.\/stdout\/index\.js'\)/.test(ss) && (ss.match(/createStdoutRegistry\(/g) || []).length === 1 && /createStdoutRegistry\(\{ activeSessions, engine, CLAUDE_STREAM_TYPES, _seenStreamTypes, USAGE_SCANNER_PATH,\s*\n\s*checkClaudeGoalStatus, noteModelSeen, noteHarnessModels, sbSeenFirst, hosts, usageHistory, deliverRef, pagesRef, permissionRulesRef, brainRef \}\)/.test(ss));
  ok('…hands its own closures (feedLive, broadcasts, meta store, todo helpers) as ONE helpers object', /const stdoutHelpers = \{ feedLive: \(s, m\) => \{ feedLive\(s, m\); SEARCH\.noteLive\(s\); \}, broadcastToSession, broadcastActiveSessions, readSessionMeta, writeSessionMeta,\s*\n\s*updateSessionTodos, applyTaskToolUpdate, emitTaskListTodos \};/.test(ss)); // lane global-search: feedLive also tells the search index
  ok('…setupSessionPty resolves caps.streamProtocol → registry → attach (no protocol branch left in session-stdout)', /const consumer = streamProto \? stdoutConsumers\.get\(streamProto\) : null;/.test(ss) && /consumer\.attach\(session, id, ptyProcess, helpersFor\(id\)\);/.test(ss) && !/streamProto === '/.test(ss) && !/feedLive\(session, /.test(ss) && !/_stdin_ack/.test(ss));
  ok('…the no-protocol text is unchanged and the no-consumer case is its own loud line + event', /has no streamProtocol in src\/backend-caps\.js — chat output passes through RAW \(register a pipeline\)/.test(ss) && /registers no consumer for it — chat output passes through RAW \(register one\)/.test(ss) && /'chat-protocol-no-consumer'/.test(ss));
  ok('…still dispatches on capsOf(session.backend) (the `backend || claude` default + NO_CAPS fallback are unchanged)', /const streamProto = capsOf\(session\.backend\)\.streamProtocol;/.test(ss));
  const idx = read('src/server/stdout/index.js');
  ok('registry maps the three protocols to their modules', /'stream-json': require\('\.\/claude-stream-json\.js'\)/.test(idx) && /'codex-events': require\('\.\/codex-events\.js'\)/.test(idx) && /'acp-events': require\('\.\/acp-events\.js'\)/.test(idx));
  for (const [m, proto] of [['claude-stream-json', 'stream-json'], ['codex-events', 'codex-events'], ['acp-events', 'acp-events']]) {
    const src = read(`src/server/stdout/${m}.js`);
    ok(`${m}.js: create(deps) → { protocol: '${proto}', attach(session, id, ptyProcess, helpers) }, feeds the normalizer only through feedLive`, new RegExp(`^const protocol = '${proto}';$`, 'm').test(src) && /function attach\(session, id, ptyProcess, \{ feedLive, broadcastToSession, broadcastActiveSessions, readSessionMeta, writeSessionMeta/.test(src) && /return \{ protocol, attach \};/.test(src) && /feedLive\(session, msg\)/.test(src) && !/_normalizer\.processLive/.test(src));
  }
  ok('the claude consumer keeps the session-brain wiring EXACTLY (sbSeenFirst registration precedes the served-model latch; sbSeenFirst arrives via deps)', /sbSeenFirst\(session, msg\);\s*\n\s*if \(msg\.type === 'assistant' && !msg\.parent_tool_use_id && !msg\.isSidechain\s*\n\s*&& msg\.message\?\.model/.test(read('src/server/stdout/claude-stream-json.js')) && /checkClaudeGoalStatus, noteModelSeen, sbSeenFirst, hosts, usageHistory, pagesRef, brainRef = null \}\)/.test(read('src/server/stdout/claude-stream-json.js')));

  {
    const cs = read('src/server/stdout/claude-stream-json.js');
    const ad = read('src/adapters/claude-code.js');
    const mm = read('src/message-manager.js');
    const wsh = read('src/ws-handler.js');
    const srv = read('server.js');

      ok('…it rides the spawn env, never an allowlist: agentEnv() is a DROP table, so ws-handler needs no entry for it',
        /AGENT_ENV_DROP/.test(wsh) && !/CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS/.test(wsh) && /env\.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS = '1';/.test(ad));

    ok('session_state_changed is listed as HANDLED so the unknown-subtype breadcrumb stops lying about it',
      /'session_state_changed',/.test(mm.slice(0, mm.indexOf('])'))));
    ok('the three new top-level types are in server.js CLAUDE_STREAM_TYPES (the 2.289.0 mistake: the set lagging the handler)',
      /'set_in_progress_tool_use_ids', 'compact_progress', 'tombstone'/.test(srv));
    ok('the consumer reads the PURE turn-state module, and so does the ws attach path (ONE decision, no twin)',
      /require\('\.\.\/\.\.\/turn-state\.js'\)/.test(cs) && /turnStateEffect\(st, \{ hasLabel: !!session\._streamingLabel \}\)/.test(cs)
      && /reconcileAttachStreaming \} = require\('\.\/turn-state'\)/.test(wsh) && /const rec = reconcileAttachStreaming\(\{/.test(wsh));
    ok('the derived writes are GATED on the authority latch, not deleted (an old CLI keeps every one of them)',
      /const authoritative = session\._turnStateSeen === true;/.test(cs) && /if \(!authoritative\) session\._isStreaming = false;/.test(cs) && /if \(!authoritative\) session\._isStreaming = true;/.test(cs));
    ok('the attach payload carries the tri-state turnState + the run set (null = never reported, NOT idle)',
      /turnState: session\._turnStateSeen \? \(session\._turnState \|\| null\) : null,/.test(wsh) && /inProgressTools: session\._inProgressTools \? \[\.\.\.session\._inProgressTools\] : \[\],/.test(wsh));
    const cv = read('src/lib/chat-view.js');
    const sb = read('src/lib/chat-status-bar.js');
    const cr = read('src/lib/chat-renderers.js');
    ok('the client consumes all three pushes and both payload keys',
      /msg\.type === 'turn-state'/.test(cv) && /msg\.type === 'tools-in-progress'/.test(cv) && /msg\.type === 'compact-progress'/.test(cv)
      && /if \('turnState' in meta\)/.test(cv) && /if \('inProgressTools' in meta\)/.test(cv));
    ok("the status bar draws the third state and NEVER asserts one it was not told (null ≠ idle)",
      /this\._turnState === 'requires_action'/.test(sb) && /const next = \(v === 'idle' \|\| v === 'running' \|\| v === 'requires_action'\) \? v : null;/.test(sb));
    ok('the hardcoded compaction apology is now the FALLBACK of one hint function (ONE copy of the sentence, in compactFallbackHint)',
      /compactHintText\(\) \{/.test(cr) && /compactFallbackHint\(\) \{/.test(cr) && /if \(!s\) return this\.compactFallbackHint\(\);/.test(cr)
      && (cr.match(/Compacting a large conversation takes 1/g) || []).length === 1);
    // WIRING PIN (round 5): the fix lives at the CARD's build site — a held
    // terminal stage must not become the view's permanent voice. A pure
    // predicate whose call site is not staged is the 2.355.0 class.
    ok('…and a NEW card gates that sentence on compactInFlight(), never on the held stage',
      /compactInFlight\(\) \{/.test(cr) && /s\.event !== 'compact_end'/.test(cr)
      && /chat-ctx-full-hint">\$\{escHtml\(this\.compactInFlight\(\) \? this\.compactHintText\(\) : this\.compactFallbackHint\(\)\)\}/.test(cr),
      'appendContextFullCard renders the held stage into a card built after the compaction ended');
    ok('…and only the CLI’s own "success" is reported as FINISHED (a hook-blocked compaction ends with no outcome and compacted nothing)',
      /if \(s\.result === 'success'\) return t\('Compaction finished\.'\);/.test(cr) && /return t\('Compaction ended\.'\);/.test(cr),
      'a compact_end with result:null still claims success');
    const ro = read('src/rewind-ops.js');
    ok("both harnesses emit the SAME 'rewound' op through the one PURE builder",
      /rewoundOp\(\{ harness: 'claude'/.test(mm) && /rewoundOp\(\{ harness: 'codex'/.test(read('src/codex-message-manager.js'))
      && /module\.exports = \{ rewoundByRecord, rewoundByTurns, applyRewound, rewoundOp, REWOUND_KINDS \};/.test(ro));
    ok("codex's thread_rolled_back is OUT of SKIPPED_EVENT_TYPES and routed (it was invisible history)",
      !/'thread_rolled_back'/.test(read('src/codex-message-manager.js').split('SKIPPED_EVENT_TYPES')[1].split('\n]')[0])
      && /if \(type === 'thread_rolled_back'\) return this\._processRolledBack\(event, emit\);/.test(read('src/codex-message-manager.js')));
    ok('both normalizers drop rewound messages from turnMap (the minimap must not point at ghosts) — the ONE turnMap, src/message-window.js (dc-twins M10), which both extend',
      /if \(m\.rewound\) continue;/.test(read('src/message-window.js')) && ['src/message-manager.js', 'src/codex-message-manager.js'].every((f) => /extends MessageWindow/.test(read(f)) && !/^  turnMap\(\)/m.test(read(f))));
    const css = read('public/chat.css');
    ok('the two retraction kinds have their OWN display rules (no global .hidden in this project)',
      /\.chat-msg-superseded \{ display: none; \}/.test(css) && /\.chat-msg-rewound \{/.test(css) && /\.chat-tool-inflight \.chat-tool-label::after/.test(css));
  }
  const arch = read('scripts/test-architecture.mjs');
  ok('test-architecture tiers src/server/stdout/ as ORCH by path (startsWith src/server/) — the consumers may use the engine; SHARED descriptors never reach up into them', /p\.startsWith\('src\/server\/'\)/.test(arch) && !/src\/server\/stdout/.test(read('src/harnesses/index.js').replace(/\/\/[^\n]*/g, '')) && !/require\(['"]\.\.\/server\//.test(read('src/harnesses/index.js')));
}

console.log('— unknown-records: notification / api_error / vcs / code_change reach the SAME four session-brain consumers from the parse AND the device feed');
{
  const fixtureRows = fs.readFileSync(path.join(REPO, 'scripts/fixtures/unknown-records/claude-transcript.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.type === 'system' && r.subtype === 'api_error');
  ok('the fixture\'s own api_error rows exist and are TRANSCRIPT rows (never on stdout — the census of 35 live buffers saw zero); the consumer is forward-compat for the stream twin, the transcript path is NOT consumed (a days-old 401 must not evict today\'s member)', fixtureRows.length >= 1 && fixtureRows.every((r) => 'parentUuid' in r || 'retryAttempt' in r) && !/api_error/.test(fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8')) && !/noteApiErrorAuth/.test(fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8')), fixtureRows.map((r) => [r.error?.status, r.retryAttempt]));

  ok('the parse and the device feed call the SAME four named functions (source pin: claudeSideEffects names each; the parse calls each through brainRef)', ['noteHarnessNotification', 'noteApiErrorAuth', 'noteVcsState', 'notePublishedChange'].every((fn) => new RegExp("subtype === '[a-z_]+'\\) " + fn + "\\(session, sid, msg\\);").test(read('src/server/session-brain.js')) && new RegExp('brainRef\\?\\.' + fn + '\\?\\.\\(session, id, msg\\)').test(read('src/server/stdout/claude-stream-json.js'))));
}


console.log('— the file road\'s seam (主开发 r4741): three numbers on the session, never on the wire');
{
  // CONDITION 2: three numbers only — the seam's ONE maker (fileRoadOf) builds {judged, started, settled} of zeros, and nothing else
  // in the module assigns the field (a list, a per-file map or a second maker would be a new write, red here)
  const csj = read('src/server/stdout/claude-stream-json.js');
  const makers = csj.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l) && /_fileRoad\s*=(?!=)/.test(l));
  ok('the seam has ONE maker, of three integers (judged, started, settled), and no other line of the module assigns session._fileRoad',
    makers.length === 1 && /session\._fileRoad \|\| \(session\._fileRoad = \{ judged: 0, started: 0, settled: 0 \}\)/.test(makers[0]), makers);
  // CONDITION 1 (the sessions list's own builder): server.js activeSessionsPayload builds each row field by field — no spread of the
  // session, the seam never among the fields it names; the heavy scripts/test-stdout-registry.mjs judges the broadcasts and the stored meta it writes
  const bodyOf = (src, head) => { const i = src.indexOf(head); if (i < 0) return null; let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } return null; };
  const judgeList = (src) => { const b = bodyOf(src, 'function activeSessionsPayload() {'); return !!b && !/\.\.\.\s*s\b(?!\.)/.test(b) && !/_fileRoad/.test(b); };   // each row names its fields (the road's other underscore fields it shows are picked by name; this one is never picked)
  const srv = read('server.js');
  ok('the sessions list (server.js activeSessionsPayload) names its fields one by one: no spread of a session, and _fileRoad is not among them', judgeList(srv));
  const planted = anchored(srv, 'function activeSessionsPayload() {', 'function activeSessionsPayload() { const zz = (s) => ({ ...s });', 'pins-list-spread');
  ok('CONTROL: a list builder that SPREADS the session is red (the planted copy)', !judgeList(planted));
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
