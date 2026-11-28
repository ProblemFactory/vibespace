#!/usr/bin/env node
// test-checkpoints (fast, PURE — B-437e, docs/design-harness-features.md §3.2: REWIND A CHAT CONVERSATION IN PLACE, tier
// one = the conversation). The owner ruled «conversation 与 files 都做» on 2026-09-07; this suite gates the door's model:
//   §1 THE ROW — src/backend-caps.js `checkpoints` on every harness (and NO_CAPS / a contributed harness): the closed key
//      set, files false everywhere (tier one never touches the working tree), a true row names its granularity and its
//      verb, a false row names neither; the client mirror (src/lib/agent-meta.js) carries the row on every caps literal
//      — the page's row is DERIVED from the server's (agent-meta reads capsOf), and the values are compared here (U2 entry
//      condition 1: a page still reading «off» when claude's row is on is red)
//   §2 THE VERDICT — src/rewind-door.js rewindVerdict over a table: every refusal reason reached, in its order; the drawn
//      door (rewindPointOf) agrees with the verdict on an idle live conversation
//   §3 THE PLAN — the cut is BEFORE the target (it and all after it go), rewound messages skipped, the newest person's
//      uuid named, the words for the composer; for the 'turn' road the plan's cut equals src/rewind-ops.js's own cut
//      for the same number of turns (what codex's record marks is what the press marked)
//   §4 THE ANSWER — the 13 refusal reasons read from the claude 2.1.322 binary, each with its class and the binary's own
//      «may be sent again»; an unknown reason and an error reply keep their text; the JSON-RPC road
//   §5 RED CONTROLS — four planted defects in a scratch copy of the module, each RED on the law it breaks; the release
//      b06f36e90 has no row (a COUNTED skip without git)
//   §6 THE CLAUDE ROAD (U2), in process over the REAL normalizer, adapter and server door: the wrapper's frame_stamp puts
//      the CLI record uuid on the person's bubble; the door refuses by name (a running / paused turn, a compaction, the
//      queue, no process, another harness, an agent card, no uuid) and writes NOTHING then; a yes writes ONE
//      rewind_conversation naming the target + the newest uuid; the CLI's answer cuts exactly the plan, ONE notice, ONE
//      rewind-answer with the composer words; a refusal / an error keep their reason and text and cut nothing; an answer
//      that is not ours is not read; the RELOAD — the CLI's transcript row last-prompt {rewound, cutUuid | leafUuid} cuts
//      the same, the twin records of one rewind cut once, an anchor this view lacks is SAID and marks nothing, a plain
//      last-prompt row is still no card
//   §7 THE REAL WRAPPER (data/bin/chat-wrapper.js against a stand-in CLI): an idle person frame reaches the CLI with a
//      uuid and the wrapper says it (frame_stamp, same uuid); a frame without a message id or with an origin is untouched
//   §8 RED CONTROLS (U2) — the release's wrapper stamps no idle frame; a normalizer copy that does not read our answer,
//      one that leaves last-prompt ignored — each RED on its law
//   §9 THE PAGE'S DOOR (U4), DOM-free: the REAL methods lifted out of src/lib/chat-renderers.js and src/lib/chat-view.js
//      over fake elements — the button only on a rewind point (the person's own message with its uuid, a harness with the
//      row, never a sub-agent viewer, never a message taken back), drawn when the uuid arrives, gone when struck; a click
//      while a turn runs says so and opens no dialog; the confirm names the count and that files stay; ONE ws frame; the
//      answer puts the words back only into an empty box; every refusal reason has its words; every word in zh + ja; the
//      CSS slot and the touch rule
//   §10 THE PERSON's GOAL PRESS behind the same fence (主开发 r2682): src/ws-handler.js's own set-goal case, lifted over stand-ins —
//      while a rewind is out a set, a clear and a resume are refused BY NAME (rewind-out, the seconds left) and NOTHING is written to
//      the CLI; reading the goal is never stopped; free again once the rewind answers or its minute has passed; the page gives the
//      typed /goal back into a free box and says why (the composer's and the view's own methods, lifted) — RED: the case unfenced
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { anchored } from './scratch.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'b06f36e90'; // 2.369.407 — no checkpoints row, no door
const require = createRequire(import.meta.url);
let passed = 0, failed = 0, skipped = 0;
const ok = (c, msg, why = '') => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg + (why ? ' — ' + why : '')); } return !!c; };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const say = (s) => console.log(s);
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const caps = require(path.join(REPO, 'src/backend-caps.js'));
const door = require(path.join(REPO, 'src/rewind-door.js'));
const ops = require(path.join(REPO, 'src/rewind-ops.js'));

// The two shapes the roads will declare (U2 claude, U3 codex) — the model is proven on them before any row says true.
const MSG_ROW = Object.freeze({ conversation: true, files: false, granularity: 'message', redo: false, verb: 'rewind_conversation' });
const TURN_ROW = Object.freeze({ conversation: true, files: false, granularity: 'turn', redo: false, verb: 'thread/revert' });
const KEYS = ['conversation', 'files', 'granularity', 'redo', 'verb'];

say('— §1 the row');
{
  const ids = Object.keys(caps.BACKEND_CAPS);
  const rows = ids.map((id) => [id, caps.capsOf(id).checkpoints]);
  rows.push(['(unknown backend → NO_CAPS)', caps.capsOf('no-such-harness').checkpoints]);
  const contributed = caps.contributeCaps('test-checkpoints-plugin', { fork: false });
  rows.push(['(a contributed harness)', contributed.checkpoints]);
  caps.contributeCaps('test-checkpoints-plugin', null);
  for (const [id, row] of rows) {
    const shape = row && typeof row === 'object' && JSON.stringify(Object.keys(row)) === JSON.stringify(KEYS);
    const law = shape && row.files === false && row.redo === false
      && (row.conversation === true
        ? door.GRANULARITIES.includes(row.granularity) && typeof row.verb === 'string' && row.verb.length > 0
        : row.conversation === false && row.granularity === null && row.verb === null);
    ok(verdictOf(law), `${id}: checkpoints has the closed key set, files:false (tier one), a true row names granularity + verb, a false row neither`, JSON.stringify(row));
  }
  ok(ids.length >= 5 && verdictOf(['claude', 'codex', 'opencode', 'antigravity', 'shell'].every((id) => ids.includes(id))), 'the census saw every declared harness', ids.join(','));
  // A row turns true with its road (never a dead control): claude's road is U2; codex's (thread/revert) is U3.
  ok(caps.capsOf('claude').checkpoints === caps.CLAUDE_CHECKPOINTS && JSON.stringify(caps.CLAUDE_CHECKPOINTS) === JSON.stringify(MSG_ROW),
    'claude offers the door — the row is the shape the model was proven on (message granularity, rewind_conversation)');
  ok(verdictOf(rows.filter(([id]) => id !== 'claude').every(([, r]) => r && r.conversation === false)), 'every other harness is off until its road is built (codex: U3)');
  const bent = caps.contributeCaps('test-checkpoints-bent', { checkpoints: { conversation: true, files: true, granularity: 'message', redo: false, verb: 'x' } });
  const partial = caps.contributeCaps('test-checkpoints-partial', { checkpoints: { conversation: true } });
  const fine = caps.contributeCaps('test-checkpoints-fine', { checkpoints: { conversation: true, files: false, granularity: 'turn', redo: false, verb: 'x/revert' } });
  caps.contributeCaps('test-checkpoints-bent', null); caps.contributeCaps('test-checkpoints-partial', null); caps.contributeCaps('test-checkpoints-fine', null);
  ok(bent.checkpoints === caps.NO_CHECKPOINTS && partial.checkpoints === caps.NO_CHECKPOINTS && fine.checkpoints === caps.NO_CHECKPOINTS
    && caps.checkpointsRowOf({ conversation: true, files: false, granularity: 'turn', redo: false, verb: 'x/revert' }).conversation === true
    && caps.checkpointsRowOf({ conversation: true, files: true, granularity: 'message', redo: false, verb: 'x' }) === caps.NO_CHECKPOINTS
    && caps.setVerifiedCap('opencode', 'checkpoints', { conversation: true }) === false && caps.capsOf('opencode').checkpoints === caps.NO_CHECKPOINTS,
    'a contributed harness\'s row stays OFF (the page has no road for it yet); the shape judge keeps only a well-formed row; no prober flips a row (setVerifiedCap refuses)');
  ok(gateOf(Object.isFrozen(caps.NO_CHECKPOINTS)) && caps.capsOf('opencode').checkpoints === caps.NO_CHECKPOINTS,
    'the off row is ONE frozen object (opencode: its revert takes the FILES with the messages — no conversation-only door)');
  // ONE TABLE, NOT TWO (entry condition 1): the page's row IS the server's — compared by value over every page row
  const { BACKEND_META, backendFeatureCaps } = await import(path.join(REPO, 'src/lib/agent-meta.js'));
  const metaIds = Object.keys(BACKEND_META).filter((id) => BACKEND_META[id].caps);
  caps.contributeCaps('test-checkpoints-page', { checkpoints: MSG_ROW });
  const off = [...metaIds, 'test-checkpoints-page'].filter((id) => backendFeatureCaps(id).checkpoints !== caps.capsOf(id).checkpoints);
  caps.contributeCaps('test-checkpoints-page', null);
  ok(metaIds.length >= 4 && off.length === 0 && backendFeatureCaps('no-such-harness').checkpoints === caps.capsOf('no-such-harness').checkpoints
    && backendFeatureCaps('claude').checkpoints.conversation === true,
    `the page's row is the server's, by value, on every page row (${metaIds.join(', ')}) and for an unknown harness — claude's is on there too`, off.join(','));
  const meta = read('src/lib/agent-meta.js');
  const literals = meta.split('\n').filter((l) => /^\s+caps: \{/.test(l));
  ok(literals.length >= 4 && verdictOf(literals.every((l) => /\bcheckpoints: serverCapsOf\('[a-z-]+'\)\.checkpoints,/.test(l))),
    `the page's caps literals DERIVE the row (checkpoints: serverCapsOf(<id>).checkpoints) — never a second copy (${literals.length})`,
    literals.filter((l) => !/serverCapsOf\('[a-z-]+'\)\.checkpoints/.test(l)).map((l) => l.trim().slice(0, 70)).join(' | '));
}

// A conversation as the normalizer holds it: the person's messages carry the CLI record uuid ('message') and the turn
// id ('turn'); agent cards, a notice, a mid-turn steer and a companion line are not rewind points.
const convo = () => [
  { id: 'c:1', role: 'user', uuid: 'U-a', turnId: 'T-1', content: [{ type: 'text', text: 'first ask' }] },
  { id: 'c:2', role: 'assistant', uuid: 'A-1', content: [{ type: 'text', text: 'ok' }] },
  { id: 'c:3', role: 'user', uuid: 'U-b', turnId: 'T-2', content: [{ type: 'text', text: 'second ask' }, { type: 'image', src: 'x' }] },
  { id: 'c:4', role: 'assistant', uuid: 'A-2', content: [{ type: 'tool_call', toolName: 'Edit' }] },
  { id: 'c:5', role: 'user', uuid: 'U-s', midTurn: true, content: [{ type: 'text', text: 'a steer into the turn' }] },
  { id: 'c:6', role: 'system', noticeKind: 'compacted', content: [{ type: 'text', text: 'note' }] },
  { id: 'c:7', role: 'user', uuid: 'U-c', turnId: 'T-3', content: [{ type: 'text', text: 'third ask' }] },
  { id: 'c:8', role: 'assistant', uuid: 'A-3', content: [{ type: 'text', text: 'done' }] },
];

// The laws, as a function of the module — §5 runs the same checks against planted defects.
function laws(D) {
  const bad = [];
  const m = convo();
  const idle = { live: true };
  const cases = [
    ['ok', MSG_ROW, m[2], idle, null],
    ['not-offered', caps.NO_CHECKPOINTS, m[2], idle, 'not-offered'],
    ['not-offered beats every state', caps.NO_CHECKPOINTS, m[2], { live: false, turnRunning: true }, 'not-offered'],
    ['an agent card', MSG_ROW, m[1], idle, 'not-a-point'],
    ['a notice', MSG_ROW, m[5], idle, 'not-a-point'],
    ['a mid-turn steer', MSG_ROW, m[4], idle, 'not-a-point'],
    ['afloat (held by the wrapper)', MSG_ROW, { ...m[2], afloat: true }, idle, 'not-a-point'],
    ['a companion line', MSG_ROW, { ...m[2], startsTurn: false }, idle, 'not-a-point'],
    ['a synthetic record', MSG_ROW, { ...m[2], synthetic: true }, idle, 'not-a-point'],
    ['a peer\'s message', MSG_ROW, { ...m[2], originKind: 'peer-message' }, idle, 'not-a-point'],
    ['a task notification', MSG_ROW, { ...m[2], originKind: 'task-notification' }, idle, 'not-a-point'],
    ['the auto-resume continue', MSG_ROW, { ...m[2], originKind: 'auto-resume' }, idle, 'not-a-point'],
    ['an earlier member of a batch the CLI ran as one record', MSG_ROW, { ...m[2], batchOf: 'U-z' }, idle, 'not-a-point'],
    ['taken back beats not-a-point', MSG_ROW, { ...m[1], rewound: 'rollback' }, idle, 'already-rewound'],
    ['no uuid beats stopped', MSG_ROW, { ...m[2], uuid: null }, { live: false }, 'no-target-id'],
    ['a running turn beats a compaction', MSG_ROW, m[2], { live: true, turnRunning: true, compacting: true, queued: 1 }, 'turn-running'],
    ['a compaction beats the queue', MSG_ROW, m[2], { live: true, compacting: true, queued: 1 }, 'compacting'],
    ['no state said is stopped (fail closed)', MSG_ROW, m[2], {}, 'stopped'],
    ['taken back already', MSG_ROW, { ...m[2], rewound: 'rollback' }, idle, 'already-rewound'],
    ['no uuid yet', MSG_ROW, { ...m[2], uuid: null }, idle, 'no-target-id'],
    ['turn road without a turn id', TURN_ROW, { ...m[2], turnId: undefined }, idle, 'no-target-id'],
    ['turn road ok', TURN_ROW, m[2], idle, null],
    ['stopped', MSG_ROW, m[2], { live: false }, 'stopped'],
    ['stopped beats busy', MSG_ROW, m[2], { live: false, turnRunning: true }, 'stopped'],
    ['turn running', MSG_ROW, m[2], { live: true, turnRunning: true }, 'turn-running'],
    ['compacting', MSG_ROW, m[2], { live: true, compacting: true }, 'compacting'],
    ['queued', MSG_ROW, m[2], { live: true, queued: 2 }, 'queued'],
  ];
  const reached = new Set();
  for (const [name, row, msg, st, want] of cases) {
    const v = D.rewindVerdict(row, msg, st);
    const got = v.ok ? null : v.reason;
    if (got !== want) bad.push(`verdict:${name} (want ${want}, got ${got})`);
    if (!v.ok) { reached.add(v.reason); if (!D.ANSWER_CLASSES.includes(v.cls)) bad.push(`verdict-class:${name}`); }
    if (JSON.stringify(st) === JSON.stringify(idle) && D.rewindPointOf(row, msg) !== v.ok) bad.push(`point-agrees:${name}`);
  }
  for (const r of Object.keys(D.REWIND_REFUSALS)) if (!D.DOOR_REASONS.includes(r) && !reached.has(r)) bad.push(`refusal-unreached:${r}`);
  // the plan
  const p = D.rewindPlanOf(MSG_ROW, m, 'c:3', { live: true });
  if (!p.ok) bad.push('plan:ok');
  else {
    if (JSON.stringify(p.ids) !== JSON.stringify(['c:3', 'c:4', 'c:5', 'c:6', 'c:7', 'c:8'])) bad.push(`plan:cut-before-target (${p.ids})`);
    if (p.prompts !== 2) bad.push(`plan:prompts (${p.prompts})`);
    if (p.turns !== 2) bad.push(`plan:turns (${p.turns})`);
    const pn = D.rewindPlanOf(MSG_ROW, [...m, { id: 'c:9', role: 'user', originKind: 'task-notification', content: [{ type: 'text', text: '<task-notification>' }] }], 'c:3', { live: true });
    if (pn.turns !== 3 || pn.prompts !== 2) bad.push(`plan:every-turn-counted (${pn.turns}/${pn.prompts})`);
    if (p.targetId !== 'U-b' || p.targetMsgId !== 'c:3') bad.push('plan:target');
    if (p.lastSeenUuid !== 'U-c') bad.push(`plan:last-seen (${p.lastSeenUuid})`);
    if (p.prefillText !== 'second ask') bad.push(`plan:prefill (${p.prefillText})`);
    if (p.count !== p.ids.length) bad.push('plan:count');
  }
  // after the cut is marked (the view's own marking), a second press skips what is gone and names the newest LIVE uuid
  const m2 = convo();
  ops.applyRewound(m2, ['c:7', 'c:8'], 'rollback');
  const p2 = D.rewindPlanOf(MSG_ROW, m2, 'c:1', { live: true });
  if (!p2.ok || JSON.stringify(p2.ids) !== JSON.stringify(['c:1', 'c:2', 'c:3', 'c:4', 'c:5', 'c:6'])) bad.push(`plan:skips-rewound (${p2.ids})`);
  if (p2.ok && p2.lastSeenUuid !== 'U-s') bad.push(`plan:last-seen-live (${p2.lastSeenUuid})`);
  const p3 = D.rewindPlanOf(MSG_ROW, m2, 'c:7', { live: true });
  if (p3.ok || p3.reason !== 'already-rewound') bad.push('plan:rewound-target');
  const p4 = D.rewindPlanOf(MSG_ROW, m, 'c:404', { live: true });
  if (p4.ok || p4.reason !== 'target-not-found') bad.push('plan:not-found');
  const p5 = D.rewindPlanOf(MSG_ROW, m, 'c:3', { live: true, turnRunning: true });
  const p6 = D.rewindPlanOf(MSG_ROW, m, 'c:3', {});
  if (p6.ok || p6.reason !== 'stopped') bad.push('plan:fails-closed');
  if (p5.ok || p5.reason !== 'turn-running') bad.push('plan:verdict-inside');
  // the turn road: the target is named by its turn id, the cut is the target and all after it (the mid-turn steer goes
  // with its turn), no uuid is named. (rewind-ops' rewoundByTurns — the reader of codex's OWN rollback record — counts a
  // steered message as a turn: a finding for the codex unit, U3, which names the turn by id instead.)
  const pt = D.rewindPlanOf(TURN_ROW, m, 'c:3', { live: true });
  if (!pt.ok || pt.targetId !== 'T-2' || JSON.stringify(pt.ids) !== JSON.stringify(['c:3', 'c:4', 'c:5', 'c:6', 'c:7', 'c:8']) || pt.prompts !== 2) bad.push(`plan:turn-road (${pt.ids})`);
  if (pt.lastSeenUuid !== null) bad.push('plan:turn-no-uuid');
  // the answer
  const okA = D.rewindAnswerOf('message', { rewound: true, targetMessageUuid: 'U-b', prefillText: 'second ask', precedingAssistantUuid: 'A-1' });
  if (!okA.ok || okA.prefillText !== 'second ask' || okA.targetUuid !== 'U-b') bad.push('answer:ok');
  for (const [r, row] of Object.entries(MEASURED)) {
    const a = D.rewindAnswerOf('message', { rewound: false, prefillText: null, precedingAssistantUuid: null, error: row.text, reason: r });
    if (a.ok || a.reason !== r || a.retry !== row.retry || a.cls !== row.cls || a.text !== row.text) bad.push(`answer:${r}`);
  }
  const lim = D.rewindAnswerOf('message', { rewound: false, error: 'usage limited', reason: 'usage_limited', target_not_found: true });
  if (lim.ok || lim.reason !== 'usage_limited' || lim.targetNotFound !== true) bad.push('answer:usage-limited-keeps-target-not-found');
  const un = D.rewindAnswerOf('message', { rewound: false, error: 'a new reason', reason: 'brand_new' });
  if (un.ok || un.reason !== 'cli-other' || un.cliReason !== 'brand_new' || un.text !== 'a new reason' || un.cls !== 'other') bad.push('answer:unknown-kept');
  const er = D.rewindAnswerOf('message', { error: 'Unsupported control request subtype: rewind_conversation' });
  if (er.ok || er.reason !== 'cli-error' || !/Unsupported/.test(er.text || '')) bad.push('answer:error-text');
  const none = D.rewindAnswerOf('message', null);
  if (none.reason !== 'no-answer' || none.retry !== false) bad.push('answer:none-is-not-resent');
  if (!D.rewindAnswerOf('turn', { result: { thread: {} } }).ok) bad.push('answer:rpc-ok');
  const re = D.rewindAnswerOf('turn', { error: { code: -32600, message: 'thread/revert only supports paginated threads' } });
  if (re.ok || re.reason !== 'cli-error' || !/paginated/.test(re.text || '')) bad.push('answer:rpc-error');
  for (const a of [un, er, re]) if (!D.ANSWER_CLASSES.includes(a.cls)) bad.push(`answer:class-closed (${a.cls})`);
  return bad;
}

// THE CAPTURED ORACLE (entry condition 2): what claude 2.1.322 states about its rewind_conversation — read from its
// program file as BYTES by scripts/measure-claude-rewind.mjs (never run), with the version and the file's sha256. The
// module's table is judged against it; our CLASS for each reason is ours (src/rewind-door.js), the CLI's words and its
// «may be sent again» are the capture's.
const CAPTURE = JSON.parse(read('scripts/fixtures/claude-cli/2.1.322-rewind-conversation.json'));
const MEASURED = Object.fromEntries(Object.entries(CAPTURE.reasons).map(([k, v]) => [k, { cls: (door.CLAUDE_REWIND_REASONS[k] || {}).cls, retry: v.retry, text: v.text }]));

say('— §2–§4 the verdict, the plan, the answer');
{
  const bad = laws(door);
  ok(bad.length === 0, 'every law holds on the tree: the verdict table (each refusal reached; two reasons at once say the first in order; only the person\'s own messages; the drawn door agrees), the plan (cut before the target, rewound skipped, newest live uuid, the composer words, no stated state = stopped; the turn road by turn id), the answer (13 measured reasons with the CLI\'s own words, unknown + error texts kept, no answer is never resent, the JSON-RPC road)', bad.join(' | '));
  ok(JSON.stringify(Object.keys(door.CLAUDE_REWIND_REASONS).sort()) === JSON.stringify(Object.keys(CAPTURE.reasons).sort())
    && verdictOf(Object.entries(CAPTURE.reasons).every(([k, v]) => door.CLAUDE_REWIND_REASONS[k].retry === v.retry)),
    `the module's reasons and their «may be sent again» are exactly the CAPTURE's (${CAPTURE.cli}, sha256 ${String(CAPTURE.programSha256).slice(0, 12)}) — no more, none missing, none moved`, Object.keys(door.CLAUDE_REWIND_REASONS).join(','));
  ok(CAPTURE.cli === '2.1.322' && gateOf(/^[0-9a-f]{64}$/.test(CAPTURE.programSha256)) && CAPTURE.request.subtype === caps.CLAUDE_CHECKPOINTS.verb
    && gateOf(['target_message_uuid', 'last_seen_user_message_uuid', 'interrupt_if_running'].every((f) => CAPTURE.request.fields.includes(f)))
    && gateOf(['rewound', 'targetMessageUuid', 'prefillText'].every((f) => CAPTURE.reply.done.includes(f))) && gateOf(['rewound', 'reason', 'error'].every((f) => CAPTURE.reply.refused.includes(f)))
    && CAPTURE.persist.row === 'last-prompt' && CAPTURE.persist.writtenBeforeTheLastCheck === true && CAPTURE.persist.healRow.explicit === true && gateOf(/^tengu_/.test(CAPTURE.persist.cutUuidFlag))
    && typeof CAPTURE.persist.healRow.writtenBy === 'string' && CAPTURE.persist.ordinaryRowExplicit === false && gateOf(CAPTURE.persist.writers.some((w) => w.explicit && w.leafUuid === 'null'))
    && verdictOf(CAPTURE.request.fields.includes('expires_at')),
    'the capture names the verb the claude row names, the request fields the door writes, the reply fields the normalizer reads, the transcript row it cuts from and the heal row after it');
  ok(gateOf(/MEASURED by scripts\/measure-claude-rewind\.mjs/.test(CAPTURE._note)) && gateOf(fs.existsSync(path.join(REPO, 'scripts/measure-claude-rewind.mjs'))) && !/child_process|worker_threads|\b(?:spawn|spawnSync|execFile|execFileSync|execSync|fork)\(/.test(read('scripts/measure-claude-rewind.mjs')),
    'the capture is the measuring script\'s (it READS the program file; it starts no process)');
  ok(gateOf(Object.values(door.REWIND_REFUSALS).every((c) => door.ANSWER_CLASSES.includes(c))) && verdictOf(Object.values(door.CLAUDE_REWIND_REASONS).every((r) => door.ANSWER_CLASSES.includes(r.cls))),
    'every refusal and every CLI reason lands in the closed class set the page words');
  const src = read('src/rewind-door.js');
  const reqs = [...src.replace(/^\s*\/\/.*$/gm, '').matchAll(/require\('([^']+)'\)/g)].map((x) => x[1]);
  const cutSrc = read('src/rewind-cut.js');
  ok(JSON.stringify(reqs) === '["./rewind-cut.js"]' && !/require\(/.test(cutSrc.replace(/^\s*\/\/.*$/gm, '')) && !/\bbackend\b\s*[!=]==/.test(src + cutSrc),
    'PURE: the door requires only src/rewind-cut.js, which requires nothing; neither asks a backend id', reqs.join(','));
}

say('— §5 red controls');
{
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-checkpoints-'));
  process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
  const SRC = read('src/rewind-door.js');
  const MUTANTS = [
    ['the verdict forgets a running turn', "  if (state.turnRunning) return no('turn-running');\n", '', 'verdict:turn running'],
    ['the cut lands AFTER the target', '  for (let i = at; i < list.length; i++) {', '  for (let i = at + 1; i < list.length; i++) {', 'plan:cut-before-target'],
    ['the newest uuid counts a taken-back message', "if (m && m.role === 'user' && !m.rewound && !m.afloat", "if (m && m.role === 'user' && !m.afloat", 'plan:last-seen-live'],
    ['an unknown CLI reason is dropped', "reason: row ? why : 'cli-other'", 'reason: row ? why : null', 'answer:unknown-kept'],
  ];
  let i = 0;
  for (const [name, from, to, law] of MUTANTS) {
    if (SRC.split(from).length !== 2) { ok(false, `mutant «${name}»: its anchor is in the module exactly once`); continue; }
    const f = path.join(T, `rewind-door-m${++i}.js`);
    if (!fs.existsSync(path.join(T, 'rewind-cut.js'))) fs.copyFileSync(path.join(REPO, 'src/rewind-cut.js'), path.join(T, 'rewind-cut.js'));
    fs.writeFileSync(f, editAnchor(SRC, from, to, "src/rewind-door.js", 'join'));
    const bad = laws(require(f));
    ok(verdictOf(bad.some((b) => b.startsWith(law))), `RED CONTROL «${name}» ⇒ the law «${law}» is red`, bad.join(' | ') || 'all green');
  }
  const g = spawnSync('git', ['-C', REPO, 'show', `${BASE}:src/backend-caps.js`], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (g.status === 0 && g.stdout) ok(!/\bcheckpoints\b/.test(g.stdout), `RED CONTROL the release ${BASE} has no checkpoints row (§1 is red there)`);
  else { skipped++; say(`  - SKIP the release ${BASE} control: not in this clone`); }
}

// ── §6–§8: the claude road ───────────────────────────────────────────────────────────────────────────────────────────
const { createMessageManager } = require(path.join(REPO, 'src/normalizers.js'));
const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
const H = require(path.join(REPO, 'src/harnesses/index.js'));
const HUMAN = Object.freeze({ kind: 'human', actBy: null });
const { requestRewind, rewindOut, rewindFenceLeft } = require(path.join(REPO, 'src/server/rewind-requests.js'));
const { createUserInputSender } = require(path.join(REPO, 'src/server/user-input.js'));
const DOOR = { requestRewind, rewindOut, rewindFenceLeft, createUserInputSender };
const U = (n) => `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const REC = {
  send: (text, msgId) => ({ type: 'user', message: { role: 'user', content: text }, msgId, timestamp: '2026-11-17T23:00:00.000Z', _fromWebui: true }),
  stamp: (msgId, uuid) => ({ type: 'frame_stamp', msg_id: msgId, cli_uuid: uuid }),
  person: (text, uuid) => ({ type: 'user', uuid, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text }] } }),
  said: (text, uuid) => ({ type: 'assistant', uuid, message: { id: 'msg_' + uuid.slice(-4), role: 'assistant', model: 'claude-sonnet-4-5', content: [{ type: 'text', text }] } }),
  result: () => ({ type: 'result', subtype: 'success', is_error: false, result: '', session_id: 's' }),
  answer: (requestId, body) => ({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response: body } }),
  error: (requestId, text) => ({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error: text } }),
  anchor: (fields) => ({ type: 'last-prompt', lastPrompt: 'x', explicit: true, sessionId: 's', ...fields }),
  rewindOut: (id, at) => ({ type: 'rewind_out', request_id: id, at }),
};
const struck = (mm) => mm.messages.filter((m) => m.rewound === 'rollback').map((m) => m.id);
const notices = (mm) => mm.messages.filter((m) => m.noticeKind === 'rewound');
const cards = (mm) => mm.messages.filter((m) => m.noticeKind === 'unknown-record' || /unknown/i.test(String(m.noticeKind || '')));
/** A live conversation: two person messages sent from the page, each stamped by the wrapper, each answered. */
function liveTwo(MM = createMessageManager, id = 'cp-live') {
  const mm = MM('claude', id);
  const ops = []; mm.onOp((o) => ops.push(o));
  for (const r of [REC.send('first ask', 'm-1'), REC.stamp('m-1', U(1)), REC.said('reply one', U(2)), REC.result(),
    REC.send('second ask', 'm-2'), REC.stamp('m-2', U(3)), REC.said('reply two', U(4)), REC.result()]) mm.processLive(r);
  return { mm, ops };
}
function roadLaws(MM = createMessageManager, D = DOOR) {
  const { requestRewind, rewindOut, rewindFenceLeft, createUserInputSender } = D;
  const bad = [];
  const { mm, ops } = liveTwo(MM);
  const p1 = mm.messages.find((m) => m.webuiMsgId === 'm-1'), p2 = mm.messages.find((m) => m.webuiMsgId === 'm-2');
  if (!p1 || p1.uuid !== U(1) || !p2 || p2.uuid !== U(3)) bad.push(`stamp:uuid-on-bubble (${p1 && p1.uuid}, ${p2 && p2.uuid})`);
  if (!ops.some((o) => o.op === 'edit' && o.id === (p2 && p2.id) && o.fields && o.fields.uuid === U(3))) bad.push('stamp:edit-op');
  mm.processLive(REC.stamp('m-2', U(9)));
  if (p2 && p2.uuid !== U(3)) bad.push('stamp:never-repointed');
  mm.processLive(REC.stamp('m-404', U(8)));
  // the door
  const written = [];
  const session = { mode: 'chat', backend: 'claude', pty: { write: (l) => written.push(l) }, _normalizer: mm, _isStreaming: false, _turnState: 'idle' };
  const refusals = [
    ['a running turn', { _isStreaming: true }, p2 && p2.id, 'turn-running'],
    ['a turn paused on the person', { _turnState: 'requires_action' }, p2 && p2.id, 'turn-running'],
    ['a compaction', { _streamingKind: 'compacting' }, p2 && p2.id, 'compacting'],
    ['no process', { pty: null }, p2 && p2.id, 'stopped'],
    ['another harness (its row is off)', { backend: 'codex' }, p2 && p2.id, 'not-offered'],
    ['an agent card', {}, mm.messages.find((m) => m.role === 'assistant')?.id, 'not-a-point'],
    ['a message nobody holds', {}, 'nope', 'target-not-found'],
  ];
  for (const [name, patch, msgId, want] of refusals) {
    const r = requestRewind({ by: HUMAN, session: { ...session, ...patch }, msgId, lastSeenUuid: U(3) });
    if (r.ok || r.reason !== want) bad.push(`door:${name} (want ${want}, got ${r.ok ? 'ok' : r.reason})`);
  }
  mm._queue = [{ id: 'q1', msgId: 'm-9' }];
  const rq = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3) });
  if (rq.ok || rq.reason !== 'queued') bad.push(`door:queued (${rq.reason})`);
  mm._queue = [];
  const rm = requestRewind({ by: HUMAN, session: null, msgId: p2 && p2.id, lastSeenUuid: U(3) });
  if (rm.ok || rm.reason !== 'stopped') bad.push(`door:an-ended-conversation-is-stopped (${rm.reason})`);
  const rb = requestRewind({ by: HUMAN, session: { ...session, _rebuildPromise: Promise.resolve() }, msgId: p2 && p2.id, lastSeenUuid: U(3) });
  if (rb.ok || rb.reason !== 'rebuilding') bad.push(`door:rebuilding (${rb.reason})`);
  const rp = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(1) });
  if (rp.ok || rp.reason !== 'page-behind') bad.push(`door:page-behind (${rp.reason})`);
  const rn = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id });
  if (rn.ok || rn.reason !== 'page-behind') bad.push(`door:no-page-uuid-is-behind (${rn.reason})`);
  if (written.length) bad.push(`door:refusal-writes-nothing (${written.length})`);
  // WHO (entry condition 4): only the person's own press — an agent, an automation key or nobody named is refused
  for (const by of [null, { kind: 'agent', cid: 'c1' }, { kind: 'automation', key: 'k1', subject: 'external' }]) {
    const x = requestRewind({ by, session, msgId: p2 && p2.id, lastSeenUuid: U(3) });
    if (x.ok || x.reason !== 'not-the-person') bad.push(`door:only-the-person (${JSON.stringify(by)} → ${x.reason})`);
  }
  // …and «the person» is PROVEN at the /ws handshake (sign-in off lets any local process in): no bearer and the strict
  // page verdict — the real header shapes
  const { personOfUpgrade } = require(path.join(REPO, 'src/server/rewind-requests.js'));
  const up = (headers, encrypted = false) => personOfUpgrade({ headers: { host: 'hub.example', ...headers }, socket: { encrypted } });
  if (!(up({ 'sec-fetch-site': 'same-origin' }) && up({ origin: 'http://hub.example' }) && !up({ origin: 'http://hub.example:9' }) && !up({ origin: 'https://hub.example' })
    && !up({}) && !up({ 'sec-fetch-site': 'cross-site' }) && !up({ origin: 'http://evil.example' })
    && !up({ 'sec-fetch-site': 'same-origin', authorization: ['Bearer', 'vsst_' + 'x'].join(' ') })
    && !up({ 'sec-fetch-site': 'same-origin', authorization: ['Bearer', 'jbt_' + 'x'].join(' ') })
    && !up({ 'sec-fetch-site': 'same-origin', authorization: 'Bearer anything' }))) bad.push('door:the-person-proven-at-the-handshake');
  // THE ROAD (entry condition 3): the harness's descriptor's own — none ⇒ not offered; a second harness with a «message»
  // row is sent ITS request, never claude's
  const nr = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3), roadOf: () => null });
  if (nr.ok || nr.reason !== 'not-offered') bad.push('door:no-road-not-offered');
  caps.BACKEND_CAPS['test-checkpoints-plug'] = { ...caps.capsOf('no-such-harness'), checkpoints: MSG_ROW };
  const plugWrites = [];
  const pr = requestRewind({ by: HUMAN, session: { ...session, backend: 'test-checkpoints-plug', pty: { write: (l) => plugWrites.push(l) } }, msgId: p2 && p2.id, lastSeenUuid: U(3),
    roadOf: (id) => (id === 'test-checkpoints-plug' ? { request: () => ({ line: 'THE-PLUGIN-REQUEST', requestId: 'vsr-plug' }) } : null) });
  delete caps.BACKEND_CAPS['test-checkpoints-plug'];
  if (!pr.ok || JSON.stringify(plugWrites) !== '["THE-PLUGIN-REQUEST\\n"]') bad.push(`door:a-plugin-is-sent-its-own-request (${JSON.stringify(plugWrites)})`);
  session._rewindOut = null;
  // THE WORDS BEFORE THE PRESS (entry condition 5): a dry run answers the plan's count, turns and the row's files fact,
  // and writes nothing
  const dr = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3), dryRun: true });
  if (!dr.ok || dr.dryRun !== true || dr.files !== false || dr.turns !== 1 || dr.taken !== rewindPlan(mm, p2).count || written.length || rewindOut(session)) bad.push(`door:dry-run-says-the-plan (${JSON.stringify(dr)})`);
  // the press carries the numbers its confirm said: a conversation that changed in between is refused, nothing written
  const cs = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3), expectTaken: dr.taken + 1 });
  if (cs.ok || cs.reason !== 'changed-since' || written.length) bad.push(`door:changed-since (${cs.reason})`);
  const plan = rewindPlan(mm, p2);
  const T0 = Date.now();
  const r = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3), expectTaken: dr.taken, now: T0, reqId: 'rw-t0press' });
  const r2 = requestRewind({ by: HUMAN, session, msgId: p1 && p1.id, lastSeenUuid: U(3) });
  if (r2.ok || r2.reason !== 'pending') bad.push(`door:one-at-a-time (${r2.reason})`);
  // ONE LIFE (REWIND_LIFE_MS): the mark holds to its last ms and lapses at it; it is the SESSION's (a history rebuild's
  // new normalizer keeps it until that normalizer replays the answer); a new process is never held by an old request
  const LIFE = door.REWIND_LIFE_MS;
  const dryAt = (ms, sess = session) => requestRewind({ by: HUMAN, session: sess, msgId: p1 && p1.id, lastSeenUuid: U(3), dryRun: true, now: T0 + ms });
  if (dryAt(LIFE - 1).reason !== 'pending' || !dryAt(LIFE).ok) bad.push(`door:the-mark-lives-one-life (${dryAt(LIFE - 1).reason}, ${dryAt(LIFE).reason})`);
  const rebuilt = { ...session, _normalizer: MM('claude', 'cp-rebuilt') };
  if (!rewindOut(rebuilt, T0 + 5)) bad.push('door:the-mark-survives-a-rebuild');
  rebuilt._normalizer.processLive(REC.answer(r.requestId, { rewound: false, reason: 'state_changed', error: 'state changed' }));
  if (rewindOut(rebuilt, T0 + 5)) bad.push('door:the-rebuilt-normalizer-replays-the-answer');
  if (!rewindOut({ ...session, pty: { write() { } } }, T0 + 5)) bad.push('door:a-reattached-client-is-the-same-cli');
  if (r.requestId !== door.REWIND_REQUEST_PREFIX + 'rw-t0press') bad.push(`door:the-request-is-named-by-the-page-id (${r.requestId})`);
  let req = null; try { req = JSON.parse(written[0]); } catch { }
  if (!r.ok || written.length !== 1 || !req || req.type !== 'control_request' || req.request.subtype !== 'rewind_conversation'
    || req.request.target_message_uuid !== U(3) || req.request.last_seen_user_message_uuid !== U(3) || req.request.interrupt_if_running !== undefined
    || req.request_id !== r.requestId || !r.requestId.startsWith(door.REWIND_REQUEST_PREFIX)
    || !new RegExp(CAPTURE.expiry.pattern).test(String(req.request.expires_at)) || Math.abs(Date.parse(req.request.expires_at) - (T0 + LIFE)) > 2000
    || Object.keys(req.request).some((k) => k !== 'subtype' && !CAPTURE.request.fields.includes(k))) bad.push(`door:writes-one-request (${written[0]})`);
  if (r.taken !== plan.count || r.turns !== 1 || r.files !== false) bad.push(`door:says-the-plan (${r.taken}/${plan.count}, ${r.turns}, ${r.files})`);
  // a road that cannot build the request, a pipe that cannot take it: refused by name, NO mark noted
  const sx = { ...session, _rewindOut: null };
  const rNoReq = requestRewind({ by: HUMAN, session: sx, msgId: p2 && p2.id, lastSeenUuid: U(3), roadOf: () => ({ request: () => { throw new Error('no uuid'); } }) });
  const sw = { ...session, _rewindOut: null, pty: { write() { throw new Error('EPIPE'); } } };
  const rNoPipe = requestRewind({ by: HUMAN, session: sw, msgId: p2 && p2.id, lastSeenUuid: U(3) });
  if (rNoReq.ok || rNoReq.reason !== 'no-target-id' || sx._rewindOut || rNoPipe.ok || rNoPipe.reason !== 'stopped' || sw._rewindOut) bad.push(`door:an-unwritable-press-notes-nothing (${rNoReq.reason}, ${rNoPipe.reason})`);
  // ONE LIFE FOR A REQUEST (lg-rewind on 2.369.410): the WRAPPER'S RECORD holds the hub's mark while the request lives —
  // past the minute, across a hub restart (the session's own mark gone, a new normalizer fed the buffer), until the CLI's
  // answer; a new wrapper (its buffer starts empty) holds nothing
  mm.processLive(REC.rewindOut(r.requestId, T0));
  const heldIn = dryAt(LIFE - 1), heldPast = dryAt(LIFE);   // inside the minute: wait; AT it and past: wait OR stop the conversation
  if (heldIn.ok || heldIn.reason !== 'pending' || heldPast.ok || heldPast.reason !== 'pending-long') bad.push(`door:held-while-the-request-lives (${heldIn.reason}, ${heldPast.reason})`);
  const restarted = { ...session, _rewindOut: null, _normalizer: MM('claude', 'cp-restart') };
  restarted._normalizer.processLive(REC.rewindOut(r.requestId, T0));
  if (!rewindOut(restarted, T0 + 10 * LIFE)) bad.push('door:a-hub-restart-reads-the-mark-back');
  if (rewindOut({ ...session, _rewindOut: null, _normalizer: MM('claude', 'cp-new-wrapper') }, T0 + 5)) bad.push('door:a-new-wrapper-holds-nothing');
  restarted._normalizer.processLive(REC.answer(r.requestId, { rewound: false, reason: 'state_changed', error: 'state changed' }));
  if (rewindOut(restarted, T0 + 10 * LIFE)) bad.push('door:the-answer-ends-it-after-a-restart');
  // A LATE ANSWER (the one-life cure, three readers' scene): the CLI answers after the minute; between, the person sent M
  // and the hub drew it — the CLI ran M AFTER the rewind, so the cut ends at the last message that stood when the request
  // went out (the wrapper's record noted it); M and its reply stand
  // — (press) the bound the PRESS noted, with NO record (a wrapper older than the record); (record) the record's own bound
  // after a hub restart (a new normalizer, no press note)
  const lateLaw = (which, ml, requestId) => {
    for (const x of [REC.send('sent after the minute', 'm-late'), REC.stamp('m-late', U(81)), REC.said('its reply', U(82)), REC.result()]) ml.processLive(x);
    ml.processLive(REC.answer(requestId, { rewound: true, targetMessageUuid: U(3), prefillText: 'second ask' }));
    const by = (u) => ml.messages.find((m) => m.uuid === u);
    if (by(U(3))?.rewound !== 'rollback' || by(U(4))?.rewound !== 'rollback' || by(U(81))?.rewound || by(U(82))?.rewound) bad.push(`answer:a-late-answer-never-strikes-a-later-send (${which}: ${[3, 4, 81, 82].map((n) => by(U(n))?.rewound || '-')})`);
  };
  { const { mm: ml } = liveTwo(MM, 'cp-late');
    const pl = ml.messages.find((m) => m.webuiMsgId === 'm-2');
    const rl = requestRewind({ by: HUMAN, session: { ...session, _rewindOut: null, _normalizer: ml, pty: { write() { } } }, msgId: pl && pl.id, lastSeenUuid: U(3) });
    if (!rl.ok) bad.push(`answer:a-late-answer-never-strikes-a-later-send (press: ${rl.reason})`); else lateLaw('press', ml, rl.requestId); }
  { const { mm: ml2 } = liveTwo(MM, 'cp-late2');
    ml2.processLive(REC.rewindOut('vsr-late2', Date.now()));
    lateLaw('record', ml2, 'vsr-late2'); }
  // the CLI's answer
  const before = ops.length;
  mm.processLive(REC.answer(r.requestId, { rewound: true, targetMessageUuid: U(3), prefillText: 'second ask', precedingAssistantUuid: U(2) }));
  const after = ops.slice(before);
  if (JSON.stringify(struck(mm)) !== JSON.stringify(plan.ids)) bad.push(`answer:cuts-the-plan (${struck(mm)} vs ${plan.ids})`);
  if (notices(mm).length !== 1 || notices(mm)[0].content[0].rewindData.taken !== plan.count) bad.push('answer:one-notice');
  const rw = after.filter((o) => o.op === 'meta' && o.subtype === 'rewound');
  if (rw.length !== 1 || JSON.stringify(rw[0].data.ids) !== JSON.stringify(plan.ids) || rw[0].data.kind !== 'rollback') bad.push('answer:one-rewound-op');
  const an = after.filter((o) => o.op === 'meta' && o.subtype === 'rewind-answer');
  const aw = an[0] ? door.rewindAnswerOf('message', an[0].data.answer) : null;
  if (an.length !== 1 || an[0].data.requestId !== r.requestId || !aw || aw.ok !== true || aw.prefillText !== 'second ask' || an[0].data.taken !== plan.count) bad.push('answer:rewind-answer');
  if (rewindOut(session, T0 + 5)) bad.push('answer:clears-the-pending-press');
  if (!p1 || p1.rewound) bad.push('answer:keeps-before-target');
  // the same answer read again (a rebuild reads the buffer) cuts nothing more
  mm.processLive(REC.answer(r.requestId, { rewound: true, targetMessageUuid: U(3), prefillText: 'second ask' }));
  if (notices(mm).length !== 1) bad.push('answer:twice-cuts-once');
  // the CLI names the cut's ECHO of the target (2.1.322 `targetMessageUuid: cut.echoUuid`): one this view does not hold
  // cuts NOTHING live and says no notice (a rebuild's transcript row cuts it) — an answer never guesses
  const { mm: me } = liveTwo(MM, 'cp-echo');
  const pe = me.messages.find((m) => m.webuiMsgId === 'm-2');
  const se = { ...session, _rewindOut: null, _normalizer: me, pty: { write: () => { } } }; // its own conversation: no mark of the press above
  const re = requestRewind({ by: HUMAN, session: se, msgId: pe && pe.id, lastSeenUuid: U(3) });
  me.processLive(REC.answer(re.requestId, { rewound: true, targetMessageUuid: U(55), prefillText: 'second ask' }));
  if (!re.ok || !pe || pe.rewound || notices(me).length !== 0 || rewindOut(se)) bad.push('answer:an-unheld-echo-cuts-nothing-live');
  // a refusal, an error, an answer that is not ours
  const { mm: m2, ops: o2 } = liveTwo(MM, 'cp-refuse');
  m2.processLive(REC.answer('vsr-r1', { rewound: false, prefillText: null, precedingAssistantUuid: null, error: 'turn running', reason: 'turn_running' }));
  m2.processLive(REC.error('vsr-r2', 'Unsupported control request subtype: rewind_conversation'));
  m2.processLive(REC.answer('vsu-other', { rewound: true, targetMessageUuid: U(3) }));
  const a2 = o2.filter((o) => o.op === 'meta' && o.subtype === 'rewind-answer').map((o) => door.rewindAnswerOf('message', o.data.answer));
  if (struck(m2).length || notices(m2).length) bad.push('refusal:cuts-nothing');
  if (a2.length !== 2 || a2[0].reason !== 'turn_running' || a2[0].retry !== true || a2[0].text !== 'turn running'
    || a2[1].reason !== 'cli-error' || !/Unsupported/.test(a2[1].text || '')) bad.push(`refusal:said (${JSON.stringify(a2)})`);
  // THE RELOAD — the CLI's transcript, its anchor row in record order
  const rows = [REC.person('first ask', U(1)), REC.said('reply one', U(2)), REC.person('second ask', U(3)), REC.said('reply two', U(4))];
  const h = MM('claude', 'cp-h1'); h.convertHistory([...rows, REC.anchor({ leafUuid: U(2), rewound: true, cutUuid: U(3) })]);
  const hp = h.messages.filter((m) => m.role === 'user');
  if (struck(h).length !== 2 || !hp[1] || hp[1].rewound !== 'rollback' || hp[0].rewound || notices(h).length !== 1) bad.push(`reload:cuts-from-cutUuid (${struck(h).length})`);
  const h2 = MM('claude', 'cp-h2'); h2.convertHistory([...rows, REC.anchor({ leafUuid: U(2), rewound: true })]);
  if (struck(h2).length !== 2 || notices(h2).length !== 1 || !notices(h2)[0].content[0].rewindData.placed) bad.push('reload:leaf-only-cuts-after-anchor');
  const h3 = MM('claude', 'cp-h3'); h3.convertHistory([...rows, REC.answer('vsr-a', { rewound: true, targetMessageUuid: U(3), prefillText: 'second ask' }), REC.anchor({ leafUuid: U(2), rewound: true, cutUuid: U(3) }), REC.said('a new reply', U(5))]);
  if (struck(h3).length !== 2 || notices(h3).length !== 1 || h3.messages.find((m) => m.uuid === U(5))?.rewound) bad.push('reload:twins-cut-once');
  // a rebuild drew the cut from the row FIRST; the live answer then finds it drawn: ONE rewind-answer saying `already`
  const htw = MM('claude', 'cp-twin-answer'); htw.convertHistory([...rows, REC.anchor({ leafUuid: U(2), rewound: true, cutUuid: U(3) })]);
  const otw = []; htw.onOp((o) => otw.push(o)); htw.processLive(REC.answer('vsr-tw', { rewound: true, targetMessageUuid: U(3), prefillText: 'second ask' }));
  const atw = otw.filter((o) => o.op === 'meta' && o.subtype === 'rewind-answer');
  if (atw.length !== 1 || atw[0].data.already !== true || atw[0].data.taken !== 0 || notices(htw).length !== 1) bad.push(`answer:a-twin-says-already (${JSON.stringify(atw.map((o) => o.data))})`);
  const h3c = MM('claude', 'cp-h3c'); h3c.convertHistory([...rows, REC.answer('vsr-c', { rewound: true, targetMessageUuid: U(3) }), REC.said('a hook card', U(9)), REC.anchor({ leafUuid: U(2), rewound: true }), REC.said('a new reply', U(5))]);
  if (struck(h3c).length !== 3 || notices(h3c).length !== 1 || h3c.messages.find((m) => m.uuid === U(9))?.rewound !== 'rollback' || h3c.messages.find((m) => m.uuid === U(5))?.rewound) bad.push(`reload:a-card-after-the-cut-is-no-second-rewind (${struck(h3c).length}, ${notices(h3c).length})`);
  const h3b = MM('claude', 'cp-h3b'); h3b.convertHistory([...rows, REC.answer('vsr-a', { rewound: true, targetMessageUuid: U(3) }), REC.anchor({ leafUuid: U(2), rewound: true }), REC.said('a new reply', U(5))]);
  if (struck(h3b).length !== 2 || notices(h3b).length !== 1) bad.push('reload:leaf-only-twin-cuts-once');
  const two = [...rows, REC.anchor({ leafUuid: U(2), rewound: true }), REC.person('third ask', U(5)), REC.said('reply three', U(6)), REC.anchor({ leafUuid: U(2), rewound: true })];
  const hb = MM('claude', 'cp-h-second'); hb.convertHistory(two);
  const cutIds = (h, ...us) => us.map((u) => h.messages.find((m) => m.uuid === u)?.rewound);
  if (notices(hb).length !== 2 || JSON.stringify(cutIds(hb, U(3), U(4), U(5), U(6))) !== '["rollback","rollback","rollback","rollback"]' || cutIds(hb, U(1), U(2)).some(Boolean))
    bad.push(`reload:a-second-rewind-to-the-same-leaf (${notices(hb).length} notices, ${cutIds(hb, U(3), U(4), U(5), U(6))})`);
  const h4 = MM('claude', 'cp-h4'); h4.convertHistory([...rows, REC.anchor({ leafUuid: U(77), rewound: true })]);
  if (struck(h4).length !== 0 || notices(h4).length !== 1 || notices(h4)[0].content[0].rewindData.placed !== false) bad.push('reload:unplaced-said-not-guessed');
  const h5 = MM('claude', 'cp-h5'); h5.convertHistory([...rows, REC.anchor({ leafUuid: null, rewound: true })]);
  if (struck(h5).length !== 4) bad.push('reload:to-the-start');
  // the CLI's HEAL: a rewind row then a plain explicit row naming the uncut tip (2.1.322 wrote the row, then its last check
  // failed: «state changed», rewound:false) — no cut; a later bookkeeping row (not explicit) lets a cut stand
  const hh = MM('claude', 'cp-heal'); hh.convertHistory([...rows, REC.anchor({ leafUuid: U(2), rewound: true, cutUuid: U(3) }), REC.anchor({ leafUuid: U(4) }), REC.said('more', U(6))]);
  if (struck(hh).length || notices(hh).length) bad.push('reload:heal-row-cancels');
  const hs = MM('claude', 'cp-stand'); hs.convertHistory([...rows, REC.anchor({ leafUuid: U(2), rewound: true, cutUuid: U(3) }), { type: 'last-prompt', lastPrompt: 'x', leafUuid: U(2), sessionId: 's' }]);
  if (struck(hs).length !== 2 || notices(hs).length !== 1) bad.push('reload:a-bookkeeping-row-lets-it-stand');
  // a rebuild reads the buffered answer (its echo not held, no asked target) and the transcript row: ONE cut, ONE notice
  const hEcho = MM('claude', 'cp-h-echo'); hEcho.convertHistory([...rows, REC.answer('vsr-e', { rewound: true, targetMessageUuid: U(66), prefillText: 'x' }), REC.anchor({ leafUuid: U(2), rewound: true, cutUuid: U(3) })]);
  if (struck(hEcho).length !== 2 || notices(hEcho).length !== 1 || notices(hEcho)[0].content[0].rewindData.placed !== true) bad.push('reload:an-unheld-echo-leaves-it-to-the-row');
  // the BATCH: two frames the CLI ran as one record under the last uuid — the first is no point; the cut takes both
  const mb = MM('claude', 'cp-batch');
  for (const x of [REC.send('part a', 'm-a'), REC.stamp('m-a', U(41)), REC.send('part b', 'm-b'), REC.stamp('m-b', U(42)),
    { type: 'system', subtype: 'init', session_id: 's', model: 'claude-sonnet-4-5', tools: [], cwd: '/tmp', user_message_uuids: [U(41), U(42)] },
    REC.said('reply ab', U(43)), REC.result()]) mb.processLive(x);
  const ba = mb.messages.find((x) => x.webuiMsgId === 'm-a'), bb = mb.messages.find((x) => x.webuiMsgId === 'm-b');
  mb.processLive(REC.answer('vsr-b', { rewound: true, targetMessageUuid: U(42), prefillText: 'part a\npart b' }));
  if (!ba || ba.batchOf !== U(42) || door.isPersonPrompt({ ...ba, rewound: undefined }) || !bb || ba.rewound !== 'rollback' || bb.rewound !== 'rollback') bad.push(`batch:earlier-member-goes-with-the-record (${ba && ba.batchOf})`);
  // an explicit row that names NOTHING inside the cut (2.1.322's leaf withdrawal: leafUuid null) is no heal: the cut stands
  const hx = MM('claude', 'cp-heal-x'); hx.convertHistory([...rows, REC.anchor({ leafUuid: U(2), rewound: true, cutUuid: U(3) }), REC.anchor({ leafUuid: null }), REC.said('more', U(6))]);
  if (struck(hx).length !== 2 || notices(hx).length !== 1) bad.push('reload:an-explicit-row-outside-the-cut-is-no-heal');
  const h6 = MM('claude', 'cp-h6'); h6.convertHistory([...rows, REC.anchor({ leafUuid: U(4) })]);
  if (struck(h6).length || notices(h6).length || cards(h6).length || h6.messages.length !== 4) bad.push('reload:plain-last-prompt-is-no-card');
  // THE PERSON'S FENCE (主开发 20:05Z): while a rewind is out the person's send is refused by name — only inside the stated
  // expiry, with its door — and nothing is written; after the expiry it goes through (the hub's mark still holds a rewind);
  // the WINDOW between the press's write and the wrapper's record is the press's own mark (proven by a stall: the record held
  // back while a send arrives); an agent's dispatch is not fenced
  const { mm: msd } = liveTwo(MM, 'cp-send');
  const typed = [];
  const sendS = { mode: 'chat', backend: 'claude', pty: { write: (l) => typed.push(l) }, _normalizer: msd, _isStreaming: false, _turnState: 'idle' };
  const typing = createUserInputSender({ activeSessions: new Map([['cp-send', sendS]]), adapterRegistry: { get: () => null }, BUFFERS_DIR: os.tmpdir(), broadcastToSession() { }, feedLive() { }, autoResume: null, reattachLocalPty: () => false, ptyQuietSince: () => null, log() { } });
  const typeIt = (text, opts = {}) => typing.send('cp-send', text, { msgId: 'mx-' + text, ...opts });
  const s0 = typeIt('before');                         // nothing out: past the fence (no adapter here, so send_failed)
  const p2s = msd.messages.find((m) => m.webuiMsgId === 'm-2');
  const ps = requestRewind({ by: HUMAN, session: sendS, msgId: p2s && p2s.id, lastSeenUuid: U(3) });
  const s1 = typeIt('in-the-window');                  // THE STALL: the wrapper's record is held back — the press's own mark
  msd.processLive(REC.rewindOut(ps.requestId, Date.now()));
  const s2 = typeIt('with-the-record');
  { const ahead = MM('claude', 'cp-ahead'); ahead.processLive(REC.rewindOut('vsr-ahead', Date.now() + 10 * LIFE));   // a wrapper clock running ahead
    const sa = { ...sendS, _rewindOut: null, _normalizer: ahead }, t0 = Date.now();           // after a hub restart: no press mark
    const f0 = rewindFenceLeft(sa, t0), f1 = rewindFenceLeft(sa, t0 + LIFE + 5);
    if (!(f0 > 0 && f0 <= LIFE) || f1 !== 0) bad.push(`send:the-fence-ends-a-minute-after-the-hub-saw-the-request (${f0}, ${f1})`);
    msd.processLive(REC.rewindOut(ps.requestId, Date.now() + 10 * LIFE));                    // the same, with the press's own mark:
    if (!(rewindFenceLeft(sendS) > 0 && rewindFenceLeft(sendS) <= LIFE)) bad.push('send:the-press-own-time-rules-its-fence');
    msd.processLive(REC.rewindOut(ps.requestId, Date.now()));
    const sf = { ...sendS, _rewindOut: { id: 'vsr-future', at: Date.now() + 10 * LIFE }, _normalizer: MM('claude', 'cp-future') };
    if (rewindFenceLeft(sf) > LIFE) bad.push(`send:the-fence-never-says-more-than-the-minute (${rewindFenceLeft(sf)})`); }
  const s3 = typeIt('/compact', { origin: 'dispatch' });
  if (s0.code !== 'send_failed') bad.push(`send:free-before-a-rewind (${s0.code})`);
  if (!ps.ok || typed.length !== 1) bad.push(`send:the-press-wrote-one-request (${ps.reason}, ${typed.length})`);
  if (s1.code !== 'rewind_out' || !(s1.left > 0 && s1.left <= LIFE / 1000) || !/at the latest\), or stop the conversation\.$/.test(s1.error || '')
    || !s1.i18n || s1.i18n.key !== 'A rewind is on its way — your message was not sent. Send it after the rewind answers (in {s} s at the latest), or stop the conversation.' || s1.i18n.params.s !== s1.left) bad.push(`send:the-window-before-the-record (${s1.code}, ${s1.left})`);
  if (s2.code !== 'rewind_out' || typed.length !== 1) bad.push(`send:refused-inside-the-minute (${s2.code}, ${typed.length})`);
  if (s3.code === 'rewind_out') bad.push('send:an-agent-dispatch-is-not-fenced');
  // the stated expiry has passed (the press and its record a minute ago): the person's send goes through, the hub's mark holds
  if (sendS._rewindOut) sendS._rewindOut.at = Date.now() - LIFE - 1;   // (a mutant may mark nothing: never a throw)
  msd.processLive(REC.rewindOut(ps.requestId, Date.now() - LIFE - 1));
  const s4 = typeIt('after-the-minute');
  if (s4.code === 'rewind_out' || !rewindOut(sendS) || rewindFenceLeft(sendS) !== 0) bad.push(`send:goes-through-after-the-expiry (${s4.code})`);
  msd.processLive(REC.answer(ps.requestId, { rewound: false, reason: 'state_changed', error: 'state changed' }));
  if (typeIt('after-the-answer').code !== 'send_failed' || rewindOut(sendS)) bad.push('send:free-after-the-answer');
  return bad;
}
const rewindPlan = (mm, target) => door.rewindPlanOf(caps.capsOf('claude').checkpoints, mm.messages, target && target.id, { live: true });

say('— §6 the claude road');
{
  const bad = roadLaws();
  ok(bad.length === 0, 'the road holds: stamp → uuid on the bubble (once, never re-pointed), the door refuses by name and writes nothing, ONE request naming the target + the newest uuid, the answer cuts exactly the plan (one notice, one rewound op, one rewind-answer with the composer words), twice cuts once, a refusal / an error keep reason + text, not-ours unread; the reload cuts the same from the transcript row (cutUuid, leaf-only, twins once, unplaced said, to the start), a plain last-prompt row is still no card', bad.join(' | '));
  let threw = false; try { ClaudeCodeAdapter.rewindRequest({ targetId: null }); } catch { threw = true; }
  ok(verdictOf(threw), 'the claude request refuses to be built with no target uuid');
  const named = ClaudeCodeAdapter.rewindRequest({ targetId: U(3) }, { id: 'rw-ok123' }).requestId, own = ClaudeCodeAdapter.rewindRequest({ targetId: U(3) }, { id: 'bad id!' }).requestId;
  ok(named === door.REWIND_REQUEST_PREFIX + 'rw-ok123' && verdictOf(/^vsr-[a-z0-9]+$/.test(own)), 'the request is named by the page\'s own id (so the page binds it before it sends); a malformed id is never sent — the adapter names its own', `${named} · ${own}`);
  // THE ROAD IS THE DESCRIPTOR'S: every built-in row on ⇔ its descriptor names a road; validate() refuses a row on without one
  const roads = H.chatHarnessIds().map((id) => [id, caps.capsOf(id).checkpoints.conversation === true, !!H.rewindRoad(id)]);
  let refused = null;
  try { H.assertRewindContract({ id: 'test-plug', caps: { checkpoints: MSG_ROW } }); } catch (e) { refused = e.message; }
  ok(gateOf(roads.every(([, on, road]) => on === road)) && gateOf(H.rewindRoad('claude')) && H.get('claude').rewind.request === H.rewindRoad('claude').request
    && gateOf(/declares a conversation rewind .* but no rewind\.request road/.test(refused || '')) && verdictOf((() => { try { H.assertRewindContract({ id: 'x', caps: { checkpoints: caps.NO_CHECKPOINTS } }); return true; } catch { return false; } })()),
    `the road is the harness descriptor's: row on ⇔ road (${roads.map(([id, on, rd]) => `${id} ${on ? 'on' : 'off'}/${rd ? 'road' : 'none'}`).join(', ')}); a row on without one is refused at registration`, refused || '');
  // WHO MAY ASK (entry condition 4): the ONE caller is the owner's /ws case with the socket's own person; no automation
  // verb, no route, no agent door names a rewind. B-437e files tier: the files door (src/server/rewind-files-door.js) presses
  // the conversation step of «both» through this door — its one caller is its own /ws case, with the same person
  const callers = spawnSync('git', ['-C', REPO, 'grep', '-l', '-F', 'requestRewind(', '--', 'src', 'server.js'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  const wsCase = read('src/ws-handler.js').split("case 'rewind': {")[1]?.split('break;')[0] || '';
  const filesCase = read('src/ws-handler.js').split("case 'rewind-files': {")[1]?.split('break;')[0] || '';
  const filesCallers = spawnSync('git', ['-C', REPO, 'grep', '-l', '-E', "require\\(['\"][^'\"]*rewind-files-door(\\.js)?['\"]\\)", '--', 'src', 'server.js'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  const verbs = require(path.join(REPO, 'src/automation-keys.js')).VERBS || [];
  // a road that PRESSES one (the door, its module, the CLI verb, the ws frame) — the For-you reply route only maps the typing
  // path's refusal code `rewind_out` (one life), it presses nothing
  const routeHits = spawnSync('git', ['-C', REPO, 'grep', '-l', '-F', '-e', 'requestRewind', '-e', 'rewind-requests', '-e', 'rewind_conversation', '-e', "type: 'rewind'", '-e', 'type: "rewind"', '-e', 'rewindRoad', '-e', 'rewindRequest', '-e', 'buildRewind', '-e', 'REWIND_REQUEST_PREFIX', '-e', 'rewind_files', '-e', 'REWIND_FILES_PREFIX', '-e', 'rewindFilesRoad', '-e', 'rewindFilesRequest', '--', 'src/routes', 'src/server/automation-engine.js', 'data/bin/vibespace-msg', 'data/bin/vibespace-task'], { encoding: 'utf8' }).stdout.trim();
  ok(JSON.stringify(callers.sort()) === JSON.stringify(['src/server/rewind-files-door.js', 'src/server/rewind-requests.js', 'src/ws-handler.js']) && gateOf(/by: ws\._personPage === true \? byOfWs\(ws\) : null/.test(wsCase))
    && gateOf(/by = ws\._personPage === true \? byOfWs\(ws\) : null/.test(filesCase)) && JSON.stringify(filesCallers) === '["src/ws-handler.js"]'
    && gateOf(/reqId: typeof data\.reqId === 'string' \? data\.reqId : null/.test(wsCase))
    && gateOf(/ws\._personPage = require\('\.\/server\/rewind-requests\.js'\)\.personOfUpgrade\(req\)/.test(read('src/ws-handler.js')))
    && verbs.length > 5 && !verbs.some((v) => /rewind/i.test(v)) && routeHits === '',
    'the door\'s ONE caller is the owner\'s /ws case with the socket\'s person (byOfWs, only on a socket personOfUpgrade proved at its handshake) — and the files door, whose one caller is its own /ws case with the same person; no automation verb, no route and no agent CLI names a rewind', `${callers.join(',')} | files door: ${filesCallers.join(',')} | verbs ${verbs.filter((v) => /rewind/i.test(v))} | ${routeHits}`);
}

ok(gateOf(/'queue_settle', 'frame_stamp', 'rewind_out',/.test(read('server.js'))) && gateOf(/fail\(res, code, \(r && r\.error\) \|\| 'the reply was not sent', r && r\.i18n \? \{ i18n: r\.i18n \} : null\)/.test(read('src/routes/user-todos-reply.js')))
  && verdictOf(/\.\.\.\(r && r\.i18n \? \{ i18n: r\.i18n \} : \{\}\), reopened: true/.test(read('src/routes/user-todos-reply.js'))),
  'the claude stream knows the wrapper\'s two rewind records (frame_stamp, rewind_out: no «unhandled type» breadcrumb); BOTH For-you reply roads (a live conversation, a reopened one) carry the refusal\'s words as an i18n key');

// THE GROUP HAND-OVER MEETS THE FENCE (B-02a3 — int361's must-check while seaming line 87, 2026-11-19): during the minute a
// rewind is out, a person's hand-over is refused by the typing path — nothing written, the group messages NOT committed
// (they keep waiting for the agent's next turn), the presser told so. It runs where line 87 meets B-02a3 (the train); a
// tree without the hand-over SKIPS it by name (counted)
if (!/async function handOverGroups\(/.test(read('src/server/stash-handover.js'))) { skipped++; say('  - SKIP the group hand-over leg: B-02a3 is not in this tree (it runs where line 87 meets it, the 2.369.412 train)'); }
else {
  const SH = require(path.join(REPO, 'src/server/stash-handover.js'));
  const WO = require(path.join(REPO, 'src/write-origin.js'));
  const { mm: mg } = liveTwo(createMessageManager, 'cp-group');
  const typedG = [];
  const sg = { mode: 'chat', backend: 'claude', backendSessionId: 'cid-group', claudeSessionId: 'cid-group', pty: { write: (l) => typedG.push(l) }, _normalizer: mg, _isStreaming: false, _turnState: 'idle' };
  const p2g = mg.messages.find((m) => m.webuiMsgId === 'm-2');
  const rg = requestRewind({ by: HUMAN, session: sg, msgId: p2g && p2g.id, lastSeenUuid: U(3) });   // pressed while idle…
  sg._isStreaming = true; sg._turnState = 'running';                                              // …then a turn runs (the hand-over's door)
  const typingG = createUserInputSender({ activeSessions: new Map([['w-group', sg]]), adapterRegistry: { get: () => null }, BUFFERS_DIR: os.tmpdir(), broadcastToSession() { }, feedLive() { }, autoResume: null, reattachLocalPty: () => false, ptyQuietSince: () => null, log() { } });
  let commits = 0;
  const sh = SH.create({ activeSessions: new Map([['w-group', sg]]), getGroups: () => ({ reportsForTurn: () => ({ text: 'a message posted in a group', marks: [{ cards: [1] }] }), commitReports: async () => { commits++; } }),
    getSpendGuard: () => ({ authorize: () => ({ ok: true, identity: 'x' }), note() { } }), getSendUserInput: () => typingG.send, log: { warn() { }, log() { } }, groupHandedWaitMs: 50, schedule: (fn, ms) => { const t = setTimeout(fn, Math.min(ms, 60)); if (t && t.unref) t.unref(); return t; } });
  const pressed = WO.pressOf({ headers: { host: 'hub.example', 'sec-fetch-site': 'same-origin' }, socket: {} });
  let hg = null;
  try { hg = await sh.handOverGroups('w-group', { pressed }); } catch (e) { hg = { threw: e.message }; }
  ok(gateOf(rg.ok) && !!pressed && typedG.length === 1 && gateOf(hg) && hg.ok === false && commits === 0 && !sg._groupHandover && verdictOf(/keep waiting|ride its next turn/.test(String(hg.error || ''))),   // the fence's words, or the hand-over's own if a seam puts its turn check first
    'the group hand-over meets the fence: refused while a rewind is out — nothing written, the group messages NOT committed (they keep waiting for the next turn), the presser told so', JSON.stringify({ rg: rg.reason, hg, commits, typed: typedG.length }));
  try { sh.close && sh.close(); } catch { }
}

say('— §7 the real wrapper stamps every person frame');
async function wrapperLaws(wrapperFile, { absent = 3000 } = {}) {   // `absent`: how long to wait for a record the wrapper may never say
  const bad = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-checkpoints-w-'));
  const SID = 'sess-9-1700000000437';
  const buf = path.join(dir, SID + '.buf'), meta = path.join(dir, SID + '.json'), cap = path.join(dir, 'child-got.txt');
  const fake = path.join(dir, 'fake-claude.sh');
  fs.writeFileSync(fake, `#!/bin/bash\nwhile IFS= read -r l; do printf '%s\\n' "$l" >> ${cap}; printf '{"type":"result","subtype":"success"}\\n'; done\n`, { mode: 0o755 });
  const w = spawn(process.execPath, [wrapperFile, buf, meta, fake], { stdio: ['pipe', 'pipe', 'pipe'], detached: true, env: { ...process.env, VIBESPACE_SKIP_AGENT_HOOKS: '1' } });
  const killGroup = () => { try { process.kill(-w.pid, 'SIGKILL'); } catch { } };
  process.on('exit', killGroup); // a suite killed mid-leg leaves no wrapper and no stand-in behind
  let out = '';
  w.stdout.on('data', (d) => { out += d; });
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };
  const capLines = () => { const t = fs.existsSync(cap) ? fs.readFileSync(cap, 'utf8') : ''; const nl = t.lastIndexOf('\n'); return nl < 0 ? [] : t.slice(0, nl).split('\n').filter(Boolean); };
  const outRecs = () => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  try {
    if (!await until(() => fs.existsSync(meta))) { bad.push('wrapper:boot'); return bad; }
    const send = async (o, n) => { w.stdin.write(JSON.stringify(o) + '\n'); return until(() => capLines().length >= n); };
    const results = () => outRecs().filter((r) => r.type === 'result').length;
    await send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'an idle ask' }] }, webui_msg_id: 'm-idle' }, 1);
    await until(() => results() >= 1, 3000);
    await send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'a peer said' }] }, webui_msg_id: 'm-peer', webui_origin: 'peer' }, 2);
    await until(() => results() >= 2, 3000);
    const plain = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'no id' }] } };
    await send(plain, 3);
    await until(() => results() >= 3, 3000);
    // two frames in ONE write: the second arrives while the first's turn runs ⇒ HELD, sent at that turn's end
    const f1 = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'h one' }] }, webui_msg_id: 'm-h1' };
    const f2 = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'h two' }] }, webui_msg_id: 'm-h2' };
    w.stdin.write(JSON.stringify(f1) + '\n' + JSON.stringify(f2) + '\n');
    await until(() => capLines().length >= 5 && results() >= 5, 4000);
    await until(() => outRecs().filter((r) => r.type === 'frame_stamp').length >= 3, absent); // m-idle, m-h1, m-h2: the records, not a sleep
    const got = capLines().map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const recs = outRecs(), st = recs.filter((r) => r.type === 'frame_stamp');
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!got[0] || !UUID.test(String(got[0].uuid || '')) || !capLines()[0].startsWith('{"uuid":')) bad.push(`wrapper:idle-frame-stamped (${capLines()[0] && capLines()[0].slice(0, 60)})`);
    const s0 = st.find((x) => x.msg_id === 'm-idle');
    if (!s0 || !got[0] || s0.cli_uuid !== got[0].uuid || 'uuid' in s0) bad.push(`wrapper:frame_stamp-says-it (${JSON.stringify(st)})`);
    if (!got[1] || got[1].uuid !== undefined || st.some((x) => x.msg_id === 'm-peer')) bad.push('wrapper:origin-frame-untouched');
    if (capLines()[2] !== JSON.stringify(plain)) bad.push('wrapper:no-id-frame-verbatim');
    const q2 = recs.findIndex((x) => x.type === 'queued_input' && x.msg_id === 'm-h2'), s2 = recs.findIndex((x) => x.type === 'frame_stamp' && x.msg_id === 'm-h2');
    const g4 = got.find((x) => x && x.webui_msg_id === 'm-h2');
    if (q2 < 0 || s2 < 0 || s2 < q2 || !g4 || recs[s2].cli_uuid !== g4.uuid) bad.push(`wrapper:a-held-frame-is-stamped-when-it-reaches-the-cli (queued ${q2}, stamp ${s2})`);
    if (s0) {
      await until(() => fs.existsSync(buf) && fs.readFileSync(buf, 'utf8').includes('"frame_stamp"'), 2600);
      if (!(fs.existsSync(buf) && fs.readFileSync(buf, 'utf8').includes('"frame_stamp"'))) bad.push('wrapper:stamp-in-the-buffer');
    }
    // ONE LIFE: OUR rewind request (vsr-) is SAID as it reaches the CLI — on stdout and in the buffer (a hub restart reads it
    // back); another control request is not (last: the stand-in answers every line with a result)
    // a NEW wrapper says nothing is out (its buffer starts empty): no rewind_out before our request
    if (outRecs().some((x) => x.type === 'rewind_out') || (fs.existsSync(buf) && fs.readFileSync(buf, 'utf8').includes('"rewind_out"'))) bad.push('wrapper:a-new-wrapper-says-nothing-out');
    const nCap = capLines().length;
    await send({ type: 'control_request', request_id: 'vsr-rw-wrap1', request: { subtype: 'rewind_conversation', target_message_uuid: '00000000-0000-4000-8000-000000000001' } }, nCap + 1);
    await send({ type: 'control_request', request_id: 'other-ctl-1', request: { subtype: 'set_permission_mode', mode: 'default' } }, nCap + 2);
    await until(() => outRecs().some((x) => x.type === 'rewind_out'), absent);
    const ro = outRecs().filter((x) => x.type === 'rewind_out');
    if (ro.length !== 1 || ro[0].request_id !== 'vsr-rw-wrap1' || !Number.isFinite(ro[0].at) || capLines().length !== nCap + 2) bad.push(`wrapper:rewind-out-said (${JSON.stringify(ro)})`);
    if (ro.length) await until(() => fs.existsSync(buf) && fs.readFileSync(buf, 'utf8').includes('"rewind_out"'), 2600);   // said: its buffer write follows (250 ms – 2 s)
    if (!(fs.existsSync(buf) && fs.readFileSync(buf, 'utf8').includes('"rewind_out"'))) bad.push('wrapper:rewind-out-in-the-buffer');
  } finally {
    try { w.stdin.end(); } catch { }
    killGroup();
    process.off('exit', killGroup);
    await new Promise((r) => { if (w.exitCode !== null || w.signalCode) r(); else { w.once('exit', r); setTimeout(r, 2000); } });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { }
  }
  return bad;
}
{
  const bad = await wrapperLaws(path.join(REPO, 'data/bin/chat-wrapper.js'));
  const wsrc = read('data/bin/chat-wrapper.js');
  const sh = wsrc.slice(wsrc.indexOf('function steerHeld(entry, op) {'), wsrc.indexOf('\n}\n', wsrc.indexOf('function steerHeld(entry, op) {')));
  if (!((wsrc.match(/record\('frame_stamp'/g) || []).length === 1 && /function sayStamp\(msgId, uuid\) \{\n  if \(\(child && !childDead && child\.stdin && child\.stdin\.writable\) \|\| OFFSET_MODE\) record\('frame_stamp'/.test(wsrc)
    && /if \(entry\.stamp\) sayStamp\(entry\.msgId, entry\.stamp\);[^\n]*\n\s+if \(turnBusy \|\| cliOwesTurn\) handOver\(entry\.line/.test(sh))) bad.push('wrapper:every-road-to-the-cli-says-its-stamp');
  if (!/if \(parsed\.type === 'control_request' && \/\^vsr-\/\.test\(String\(parsed\.request_id \|\| ''\)\) && \(\(child && !childDead && child\.stdin && child\.stdin\.writable\) \|\| OFFSET_MODE\)\) record\('rewind_out'/.test(wsrc)) bad.push('wrapper:a-dropped-frame-is-never-said');
  ok(bad.length === 0, 'the REAL wrapper: an idle person frame reaches the CLI with a uuid (its first key) and frame_stamp says the same uuid as cli_uuid (stdout and the buffer; never a top-level uuid); a HELD frame is stamped only when it reaches the CLI (after its queued_input, at the drain); a frame with an origin and one with no message id reach it untouched', bad.join(' | '));
}

say('— §8 red controls (U2)');
{
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-checkpoints-r-'));
  process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
  // the release's wrapper (its src beside it, as the wrapper requires ../../src)
  const g = spawnSync('git', ['-C', REPO, 'show', `${BASE}:data/bin/chat-wrapper.js`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (g.status === 0 && g.stdout) {
    fs.mkdirSync(path.join(T, 'old/data/bin'), { recursive: true });
    fs.writeFileSync(path.join(T, 'old/data/bin/chat-wrapper.js'), g.stdout);
    fs.symlinkSync(path.join(REPO, 'src'), path.join(T, 'old/src'));
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(T, 'old/node_modules'));
    const bad = await wrapperLaws(path.join(T, 'old/data/bin/chat-wrapper.js'), { absent: 400 });   // its source says none of them (proven below): no full wait
    // the control proves its plant first: the release's wrapper says no rewind_out
    if (/record\('rewind_out'/.test(g.stdout) || /record\('frame_stamp'/.test(g.stdout)) bad.length = 0;   // BOTH absent, or the brief waits prove nothing
    ok(gateOf(bad.some((b) => b.startsWith('wrapper:idle-frame-stamped'))) && gateOf(bad.some((b) => b.startsWith('wrapper:frame_stamp-says-it'))) && gateOf(bad.some((b) => b.startsWith('wrapper:a-held-frame'))) && verdictOf(bad.some((b) => b.startsWith('wrapper:rewind-out-said'))), `RED CONTROL the release ${BASE}'s wrapper sends an idle frame unstamped, says no stamp and no rewind_out`, bad.join(' | ') || 'all green');
  } else { skipped++; say(`  - SKIP the release ${BASE} wrapper control: not in this clone`); }
  // normalizer mutants: a scratch copy of src/ with one line changed
  const MSRC = read('src/message-manager.js');
  const NM = [
    ['the normalizer does not read our answer', "    if (String(requestId).startsWith(REWIND_REQUEST_PREFIX)) return this._processRewindAnswer(raw.response, emit); // B-437e: ours\n", '', 'answer:cuts-the-plan'],
    ['last-prompt left ignored', "      case 'last-prompt': return this._processLastPrompt(raw, emit);", "      case 'last-prompt-x': return this._processLastPrompt(raw, emit);", 'reload:cuts-from-cutUuid'],
    ['the CLI\'s heal row not read', "    if (this._pendingRowCut && raw.explicit === true && raw.rewound !== true && this._namesThePendingCut(raw.leafUuid)) { this._pendingRowCut = null; return; }", '', 'reload:heal-row-cancels'],
    ['the stamp is not read', "      case 'frame_stamp': return this._processFrameStamp(raw, emit);", "      case 'frame_stamp-x': return this._processFrameStamp(raw, emit);", 'stamp:uuid-on-bubble'],
    ['the wrapper\'s record is not read', "      case 'rewind_out': if (typeof raw.request_id === 'string') this._rewindAsked = { id: raw.request_id, at: Number(raw.at) || 0, seenAt: Date.now(), lastId: (this.messages[this.messages.length - 1] || {}).id || null }; return;", '', 'door:a-hub-restart-reads-the-mark-back'],
    ['the hub\'s mark lapses at the minute', "  if (said) return said;", "  if (said && now - said.at < REWIND_LIFE_MS) return said;", 'door:held-while-the-request-lives', 'src/server/rewind-requests.js'],
    ['the press marks nothing before its record', "  session._rewindOut = { id: out.requestId, at: now }; // one rewind at a time (rewindOut)", '', 'send:the-window-before-the-record', 'src/server/rewind-requests.js'],
    ['a late answer strikes what was sent after the request', "    const cut = echo && this.messages.some((m) => m && m.uuid === echo) ? this._processRewindCut({ targetUuid: echo, untilId: asked && asked.lastId }, emit) : null;",
      "    const cut = echo && this.messages.some((m) => m && m.uuid === echo) ? this._processRewindCut({ targetUuid: echo, untilId: null }, emit) : null;", 'answer:a-late-answer-never-strikes-a-later-send'],
    ['the fence trusts a wrapper clock running ahead', "  return Math.min(Number(o && o.at) || 0, Number(o && o.seenAt) || Infinity);", "  return Number(o && o.at) || 0;", 'send:the-fence-ends-a-minute-after-the-hub-saw-the-request', 'src/server/rewind-requests.js'],
    ['the fence says more than the minute (a clock stepped back)', "  return o ? Math.min(REWIND_LIFE_MS, Math.max(0, outAt(session, o) + REWIND_LIFE_MS - now)) : 0;", "  return o ? Math.max(0, outAt(session, o) + REWIND_LIFE_MS - now) : 0;", 'send:the-fence-never-says-more-than-the-minute', 'src/server/rewind-requests.js'],
    ['the fence is never up — judged ONLY through the typing path (proves the typing copy sees the mutated door)', "  return o ? Math.min(REWIND_LIFE_MS, Math.max(0, outAt(session, o) + REWIND_LIFE_MS - now)) : 0;", "  return 0;", 'send:refused-inside-the-minute', 'src/server/rewind-requests.js'],
    ['the press notes no bound for a late answer', "  try { session._normalizer.noteRewindPressed?.({ id: out.requestId, lastId: (messages[messages.length - 1] || {}).id || null }); } catch { } // the late answer's bound", '', 'answer:a-late-answer-never-strikes-a-later-send (press', 'src/server/rewind-requests.js'],
    ['the person\'s send is not fenced', "    if (fence > 0) { const left = Math.ceil(fence / 1000); return { ok: false, code: 'rewind_out', left, i18n: { key: 'A rewind is on its way — your message was not sent. Send it after the rewind answers (in {s} s at the latest), or stop the conversation.', params: { s: left } }, error: `A rewind is on its way — this message was not sent. Send it after the rewind answers (in ${left} s at the latest), or stop the conversation.` }; }", '', 'send:refused-inside-the-minute', 'src/server/user-input.js'],
    ['the person\'s fence outlives the expiry', "  return o ? Math.min(REWIND_LIFE_MS, Math.max(0, outAt(session, o) + REWIND_LIFE_MS - now)) : 0;", "  return o ? 1 : 0;", 'send:goes-through-after-the-expiry', 'src/server/rewind-requests.js'],
    ['an earlier rewind\'s struck run reads as a twin', "  if (targetUuid == null && from < end && !take.some(startsATurn)) return { ids: take.map((m) => m.id), placed: true, already: true };",
      "  if (targetUuid == null && list.slice(from).some((m) => m && m.rewound)) return { ids: [], placed: true, already: true };", 'reload:a-second-rewind-to-the-same-leaf', 'src/rewind-cut.js'], // stale-pins: kept — the mutant PLANTS the old rule
    ['a card after the cut reads as a second rewind', "  if (targetUuid == null && from < end && !take.some(startsATurn)) return { ids: take.map((m) => m.id), placed: true, already: true };",
      "  if (targetUuid == null && from < list.length && !take.length) return { ids: [], placed: true, already: true };", 'reload:a-card-after-the-cut-is-no-second-rewind', 'src/rewind-cut.js'],
  ];
  // EACH MUTANT COMPILED IN PLACE (the one-life cure — the suite's fast time): ONE file's source changed and compiled under
  // its own path, so every other require is the real, already-loaded module — no scratch copy of src/, no module graph
  // reloaded per mutant; a file a mutant does not touch that requires the mutated one is compiled over it (`overrides`)
  const NodeModule = require('module');
  const compileAt = (rel, src, overrides = {}) => {
    const filename = path.join(REPO, rel);
    const m = new NodeModule(filename, null);
    m.filename = filename; m.paths = NodeModule._nodeModulePaths(path.dirname(filename));
    const real = m.require.bind(m);
    m.require = (id) => (Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : real(id));
    m._compile(src, filename);
    return m.exports;
  };
  const realDoor = require(path.join(REPO, 'src/server/rewind-requests.js'));
  for (const [name, from, to, law, file = 'src/message-manager.js'] of NM) {
    const FSRC = read(file);
    if (FSRC.split(from).length !== 2) { ok(false, `mutant «${name}»: its anchor is in ${file} exactly once`); continue; }
    const planted = FSRC.split(from).join(to);
    // A RED CONTROL PROVES ITS PLANT FIRST: the mutated source holds the planted line and no longer the anchor
    if (planted.includes(from) || (to && !planted.includes(to))) { ok(false, `mutant «${name}»: its plant is where it claims (${file})`); continue; }
    let bad;
    try {
      const cut = file === 'src/rewind-cut.js' ? compileAt(file, planted) : null;
      const mmMod = file === 'src/message-manager.js' ? compileAt(file, planted) : cut ? compileAt('src/message-manager.js', read('src/message-manager.js'), { './rewind-cut.js': cut }) : null;
      const MM = mmMod ? (backend, id, opts) => new mmMod.MessageManager(id, opts) : createMessageManager;
      const door = file === 'src/server/rewind-requests.js' ? compileAt(file, planted) : realDoor;
      const ui = compileAt('src/server/user-input.js', file === 'src/server/user-input.js' ? planted : read('src/server/user-input.js'), { './rewind-requests.js': door });
      bad = roadLaws(MM, { requestRewind: door.requestRewind, rewindOut: door.rewindOut, rewindFenceLeft: door.rewindFenceLeft, createUserInputSender: ui.createUserInputSender });
    } catch (e) { bad = [`threw: ${e.message}`]; }
    ok(verdictOf(bad.some((b) => b.startsWith(law))), `RED CONTROL «${name}» ⇒ the law «${law}» is red`, bad.join(' | ') || 'all green');
  }
}

say('— §9 the page\'s door');
{
  // lift a block of methods out of a class body in a real file (between two method heads), as a class over injected names
  const lift = (file, from, to, deps) => {
    const src = read(file);
    const a = src.indexOf(from), b = src.indexOf(to, a + 1);
    if (a < 0 || b < 0) throw new Error(`lift: ${from} … ${to} not found in ${file}`);
    const names = Object.keys(deps);
    return new Function(...names, `return class { ${src.slice(a, b)} }`)(...names.map((k) => deps[k]));
  };
  const said = [];
  const T = (k, o) => String(k).replace(/\{(\w+)\}/g, (_, n) => (o && n in o ? String(o[n]) : `{${n}}`));
  const el = (cls = '') => {
    const kids = [], classes = new Set(String(cls).split(/\s+/).filter(Boolean));
    const e = { className: cls, children: kids, title: '', innerHTML: '', attrs: {}, onclick: null, removed: false,
      classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c) },
      setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(c) { kids.push(c); c.parent = this; return c; },
      remove() { this.removed = true; const p = this.parent; if (p) { const j = p.children.indexOf(this); if (j >= 0) p.children.splice(j, 1); } },
      querySelector(sel) { const m = /^:scope > \.([\w-]+)$/.exec(sel); return m ? kids.find((k) => String(k.className).split(/\s+/).includes(m[1])) || null : null; } };
    return e;
  };
  const doc = { createElement: () => el() };
  const TURN_ROW = Object.freeze({ conversation: true, files: false, granularity: 'turn', redo: false, verb: 'thread/rollback' });
  const metaCaps = (b) => ({ checkpoints: b === 'turn-harness' ? TURN_ROW : caps.capsOf(b).checkpoints });
  const R = lift('src/lib/chat-renderers.js', '  addRewindBtn(el, msg) {', '  extractMsgText(msg) {',
    { rewindPointOf: door.rewindPointOf, backendFeatureCaps: metaCaps, UI_ICONS: { rewind: '<svg/>' }, t: T, document: doc });
  const r = new R();
  const clicked = [];
  let live = true;
  Object.assign(r, { _onRewind: (m) => clicked.push(m.id), _canRewind: () => live, backend: 'claude', sessionId: 'sess-1' });
  const person = { id: 'p1', role: 'user', uuid: U(31), content: [{ type: 'text', text: 'ask' }] };
  const drawn = (msg, patch = {}, cls = 'chat-msg') => { const host = el(cls); host._rawMsg = msg; Object.assign(r, patch); r.addRewindBtn(host, msg); Object.assign(r, { backend: 'claude', sessionId: 'sess-1' }); return host.querySelector(':scope > .chat-rewind-btn'); };
  const btn = drawn(person);
  const bad = [];
  if (!btn || !/chat-open-editor-btn/.test(btn.className) || !/Rewind to here/.test(btn.title) || btn.innerHTML !== '<svg/>') bad.push('button:drawn-on-the-person');
  if (btn) { btn.onclick({ stopPropagation() { } }); if (JSON.stringify(clicked) !== '["p1"]') bad.push('button:click-asks-the-view'); }
  if (drawn({ ...person, uuid: null })) bad.push('button:no-uuid-no-door');
  if (drawn({ ...person, role: 'assistant' })) bad.push('button:agent-card');
  if (drawn({ ...person, originKind: 'peer-message' })) bad.push('button:peer');
  if (drawn({ ...person, rewound: 'rollback' })) bad.push('button:struck');
  if (drawn({ ...person, batchOf: U(99) })) bad.push('button:batch-member');
  if (drawn(person, { backend: 'codex' })) bad.push('button:row-off-harness');
  if (drawn(person, { sessionId: 'sub-x' })) bad.push('button:sub-agent-viewer');
  if (drawn(person, {}, 'chat-msg chat-gap-msg')) bad.push('button:gap-slab-copy');
  live = false; if (drawn(person)) bad.push('button:read-only-view'); live = true;
  { const host = el('chat-msg'); const m = { ...person, uuid: null }; host._rawMsg = m; r.addRewindBtn(host, m);
    m.uuid = U(32); r.patchRewindBtn(host, m); const b1 = host.querySelector(':scope > .chat-rewind-btn');
    r.patchRewindBtn(host, m); const n1 = host.children.filter((c) => /chat-rewind-btn/.test(c.className)).length;
    m.batchOf = U(33); r.patchRewindBtn(host, m);
    if (!b1 || n1 !== 1 || host.querySelector(':scope > .chat-rewind-btn')) bad.push('button:follows-the-uuid-and-the-batch'); }
  // the view: the click, the confirm, the frame, the answer, the refusals
  const clock = { now: 0, timers: [], n: 0 };
  const stubSet = (fn, ms) => { const id = ++clock.n; clock.timers.push({ id, fn, at: clock.now + ms, ms }); return id; };
  const stubClear = (id) => { clock.timers = clock.timers.filter((x) => x.id !== id); };
  const advance = (ms) => { clock.now += ms; for (const x of clock.timers.filter((y) => y.at <= clock.now)) { stubClear(x.id); x.fn(); } };
  let held = null;   // view._yes === 'hold': the confirm stays open until held(yes)
  const store = { m: new Map(), dead: false, getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }, setItem(k, v) { if (!this.dead) this.m.set(k, String(v)); }, removeItem(k) { this.m.delete(k); }, get length() { return this.m.size; }, key(i) { return [...this.m.keys()][i] ?? null; } };
  const V = lift('src/lib/chat-view.js', '  _rewindFromMessage(msg) {', '  // Fork a new session from a specific assistant message (the chat fork button).',
    { backendFeatureCaps: metaCaps, rewindPointOf: door.rewindPointOf, rewindPlanOf: door.rewindPlanOf, rewindAnswerOf: door.rewindAnswerOf, t: T,
      REWIND_LIFE_MS: door.REWIND_LIFE_MS, POINT_FIELDS: door.POINT_FIELDS, REWIND_REQUEST_PREFIX: door.REWIND_REQUEST_PREFIX, textOf: door.textOf, setTimeout: stubSet, clearTimeout: stubClear, sessionStorage: store,
      // B-c87d: chat-view's rewind answer focuses the composer through the late-focus door (its own gate: test-late-focus); here a
      // stand-in door that takes the keys, over the scene's clock
      openClock: () => clock.now, PAGE_START: 0, lateFocus: (v) => { if (v && typeof v.focus === 'function') v.focus(); return true; },
      showToast: (m, o) => said.push([m, o && o.type]),
      showConfirmDialog: (o) => { said.push(['confirm', o]); return view._yes === 'hold' ? new Promise((res) => { held = res; }) : Promise.resolve(view._yes); } });
  const reqs = [];
  const view = new V();
  // the real ChatInput.putBack, lifted, over a fake textarea
  const CI = lift('src/lib/chat-input.js', '  putBack(text) {', '  setDisconnected(disconnected) {', {});
  const box = new CI(); box._textarea = { value: '', dispatchEvent() { } }; box.isStreaming = false; box.focus = () => { };
  Object.assign(view, { sessionId: 'sess-1', _readOnly: false, _disposed: false, _yes: true, _chatInput: box,
    _getSessionIds: () => ({ backend: 'claude' }),
    ws: { connected: true, request: (msg, match, opts) => { const q = { msg, match, opts, done: false }; reqs.push(q); return () => { q.done = true; }; } } });
  const convo2 = [person, { id: 'a1', role: 'assistant', uuid: U(33), content: [] }, { id: 'p2', role: 'user', uuid: U(34), content: [{ type: 'text', text: 'two' }] }];
  view._messages = convo2;
  const tick = () => new Promise((res) => setTimeout(res, 0));
  box.isStreaming = true; said.length = 0; view._rewindFromMessage(person); await tick();
  if (said.length !== 1 || !/Stop the current answer first/.test(said[0][0]) || reqs.length) bad.push('view:busy-says-so-no-dialog');
  box.isStreaming = false;
  view._readOnly = true; said.length = 0; view._rewindFromMessage(person); await tick();
  if (said.length !== 1 || !/Resume this conversation first/.test(said[0][0]) || reqs.length) bad.push('view:read-only-says-resume');
  view._readOnly = false; said.length = 0;
  view._rewindFromMessage(person); await tick();
  // FIRST the server's plan (a dry run) — the confirm is worded from IT (the turns that go, the row's files fact)
  const qd = reqs[0];
  if (reqs.length !== 1 || !qd || qd.msg.dryRun !== true || said.some((x) => x[0] === 'confirm')) bad.push('view:asks-the-server-plan-first');
  qd && qd.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qd.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false });
  await tick();
  const conf = said.find((x) => x[0] === 'confirm');
  if (!conf || !/taken back — 2 turns/.test(conf[1].message) || !/Files on disk are not rolled back/.test(conf[1].message) || conf[1].danger !== true || !conf[1].confirmText) bad.push(`view:confirm-worded-from-the-server-plan (${conf && conf[1].message})`);
  const q = reqs[1];
  if (reqs.length !== 2 || !q || q.msg.dryRun || q.msg.type !== 'rewind' || q.msg.msgId !== 'p1' || q.msg.sessionId !== 'sess-1' || !q.msg.reqId || q.msg.lastSeenUuid !== U(34)
    || q.msg.expectTaken !== 3
    || q.opts.timeoutMs !== 15000 || typeof q.opts.isAlive !== 'function' || q.opts.isAlive() !== true) bad.push(`view:then-one-press-with-the-page-newest-uuid (${q && JSON.stringify(q.msg)})`);
  // a second press while the first is out: said, no second request, no dialog
  said.length = 0; view._rewindFromMessage(person); await tick();
  if (reqs.length !== 2 || !said.length || !/already on its way/.test(said[0][0])) bad.push('view:one-at-a-time');
  const matched = q && q.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: q.msg.reqId, ok: true, requestId: 'vsr-1', taken: 3, prompts: 2 });
  const wd = clock.timers.find((x) => x.ms === door.REWIND_LIFE_MS);
  if (!matched || !view._rewindBound?.has('vsr-1') || view._rewindLive !== 'vsr-1' || !wd) bad.push('view:result-arms-the-answer-for-one-life');
  if (q && q.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: 'someone-else' })) bad.push('view:another-result-is-not-ours');
  view._onRewindAnswer({ requestId: 'vsr-other', answer: { rewound: true, prefillText: 'x' }, taken: 3 });
  if (box._textarea.value) bad.push('view:another-answer-is-not-ours');
  said.length = 0;
  view._onRewindAnswer({ requestId: 'vsr-1', answer: { rewound: true, targetMessageUuid: U(31), prefillText: 'ask' }, taken: 3 });
  if (box._textarea.value !== 'ask' || view._rewindInFlight || !said.some((x) => /Rewound — 3 messages taken back\. Your words are back in the box\./.test(x[0]))) bad.push('view:answer-puts-words-back');
  // the box was in use: the real putBack keeps it, and the toast says so
  view._rewindBound.set('vsr-2', { taken: 1, text: 'ask', granularity: 'message' }); box._textarea.value = 'typing'; said.length = 0;
  view._onRewindAnswer({ requestId: 'vsr-2', answer: { rewound: true, prefillText: 'ask' }, taken: 1 });
  if (box._textarea.value !== 'typing' || !said.some((x) => /1 message taken back\. The box already had text/.test(x[0]))) bad.push('view:busy-box-kept');
  box._textarea.value = '';
  // the CLI refused: its reason, its words
  view._rewindBound.set('vsr-3', { taken: 1, text: 'ask', granularity: 'message' }); said.length = 0;
  view._onRewindAnswer({ requestId: 'vsr-3', answer: { rewound: false, reason: 'unseen_later_turn', error: 'unseen later turn', prefillText: null }, taken: 0 });
  if (!said[0] || !/changed meanwhile/.test(said[0][0])) bad.push('view:cli-refusal-said');
  // EVERY reason, its OWN words (a fallback line is not words)
  const WORDS = {
    'not-offered': /cannot be rewound/, 'not-a-point': /cannot be rewound/, 'already-rewound': /cannot be rewound/, 'no-target-id': /does not know this message by an id/,
    'target-not-found': /changed meanwhile/, stopped: /Resume this conversation first/, 'turn-running': /Stop the current answer first/, queued: /waiting in the queue/,
    compacting: /being compacted/, pending: /already on its way/, 'pending-long': /no answer for over a minute — wait for it, or stop the conversation to rewind again\.$/, rebuilding: /still loading/, 'page-behind': /not shown the newest messages/,
    commands_queued: /waiting in the queue/, prompt_pending: /Answer what the agent is asking/, turn_running: /Stop the current answer first/,
    target_not_found: /changed meanwhile/, stale_target: /changed meanwhile/, unseen_later_turn: /changed meanwhile/, state_changed: /changed meanwhile/,
    poll_tool_result_target: /cannot be rewound/, target_splits_tool_call: /cannot be rewound/, delivered_poll_events_in_range: /cannot be rewound/,
    persist_failed: /did not go through/, expired: /did not go through/, usage_limited: /usage limit/, 'cli-error': /refused the rewind: the CLI words/, 'no-answer': /did not go through/,
    'not-the-person': /Only you can rewind/, 'changed-since': /changed while you decided/,
  };
  const classOf = (r) => door.REWIND_REFUSALS[r] || (door.CLAUDE_REWIND_REASONS[r] || {}).cls || (r === 'cli-error' ? 'other' : 'failed');
  for (const [reason, rx] of Object.entries(WORDS)) {
    said.length = 0; view._sayRewindRefusal(reason, classOf(reason), 'the CLI words');
    if (!said[0] || said[0][1] !== 'error' || !rx.test(said[0][0])) bad.push(`view:refusal-words:${reason} (${said[0] && said[0][0]})`);
  }
  said.length = 0; view._sayRewindRefusal('cli-other', 'other', null);
  if (!said[0] || /cli-other/.test(said[0][0])) bad.push('view:no-internal-id-in-words');
  const allReasons = [...Object.keys(door.REWIND_REFUSALS), ...Object.keys(door.CLAUDE_REWIND_REASONS)];
  if (allReasons.some((x) => !(x in WORDS))) bad.push(`view:a-reason-without-pinned-words (${allReasons.filter((x) => !(x in WORDS))})`);
  // cancel sends nothing; a closed view's late answer says nothing
  const n0 = reqs.length; view._yes = false; view._rewindInFlight = false; view._rewindFromMessage(person); await tick();
  const qc = reqs[n0]; qc && qc.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qc.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false }); await tick();
  if (reqs.length !== n0 + 1 || !qc || qc.msg.dryRun !== true) bad.push('view:cancel-sends-only-the-dry-run');
  // a dry run the server refuses is said, and no press follows
  view._yes = true; said.length = 0; view._rewindFromMessage(person); await tick();
  const qr = reqs[n0 + 1]; qr && qr.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qr.msg.reqId, ok: false, reason: 'not-the-person', cls: 'cannot' }); await tick();
  if (reqs.length !== n0 + 2 || !said.some((x) => /Only you can rewind/.test(x[0])) || said.some((x) => x[0] === 'confirm') || view._rewindInFlight) bad.push('view:a-refused-dry-run-is-said');
  // the socket is down: nothing is queued for the reconnect — said, no request
  view._disposed = false; view._rewindInFlight = false; view.ws.connected = false; said.length = 0;
  const nd = reqs.length; view._rewindFromMessage(person); await tick();
  if (reqs.length !== nd || !said.some((x) => /Not connected — nothing was sent/.test(x[0]))) bad.push('view:not-while-disconnected');
  view.ws.connected = true;
  // a dry run with no answer is CANCELLED at its timeout (never answered late into a confirm out of nowhere)
  said.length = 0; view._rewindFromMessage(person); await tick();
  const qt = reqs[reqs.length - 1]; qt && qt.opts.onTimeout();
  if (!qt || !qt.done || view._rewindInFlight || !said.some((x) => /No answer to the rewind yet/.test(x[0]))) bad.push('view:a-silent-dry-run-is-cancelled');
  // a plan that does not SAY files roll back keeps the caveat (an older server sends no `files`)
  said.length = 0; view._yes = false; view._rewindFromMessage(person); await tick();
  const qf = reqs[reqs.length - 1]; qf && qf.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qf.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2 }); await tick();
  const cf = said.find((x) => x[0] === 'confirm');
  if (!cf || !/Files on disk are not rolled back/.test(cf[1].message)) bad.push('view:the-caveat-unless-the-plan-says-files-roll-back');
  // the view closed while the confirm stood open: the press is SAID, nothing sent
  view._yes = true; said.length = 0; view._rewindFromMessage(person); await tick();
  const qx = reqs[reqs.length - 1]; const nx = reqs.length;
  qx && qx.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qx.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false });
  view._disposed = true; await tick();
  if (reqs.length !== nx || !said.some((x) => /The window was closed — nothing was sent/.test(x[0]))) bad.push('view:a-press-in-a-closed-view-is-said');
  // the CLI's «not to be sent again» reaches the words (no «Try again» for unseen_later_turn / stale_target)
  said.length = 0; view._sayRewindRefusal('unseen_later_turn', 'moved', 'unseen later turn', false);
  if (!said[0] || !/changed meanwhile — nothing was taken back\.$/.test(said[0][0])) bad.push(`view:no-try-again-when-not-resendable (${said[0] && said[0][0]})`);
  const n1 = reqs.length; view._rewindInFlight = false; view._rewindFromMessage(person); await tick();
  if (reqs.length !== n1) bad.push('view:a-closed-view-sends-nothing');
  view._disposed = false;
  // ONE LIFE on the page: the watchdog fires at REWIND_LIFE_MS (not before), SAYS it, frees the door — and the press stays
  // BOUND: an answer after the life still says the success and puts the words back (a local CLI never expires a request)
  const press = async (requestId, taken = 3, msg = person) => {
    view._yes = true; view._rewindInFlight = false; said.length = 0; view._rewindFromMessage(msg); await tick();
    const d = reqs[reqs.length - 1]; d.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: d.msg.reqId, ok: true, dryRun: true, taken, turns: 2, files: false }); await tick();
    const pq = reqs[reqs.length - 1]; pq.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: pq.msg.reqId, ok: true, requestId, taken, prompts: 2 });
  };
  await press('vsr-late');
  said.length = 0; advance(door.REWIND_LIFE_MS - 1);
  if (said.length || !view._rewindInFlight) bad.push('view:no-word-before-the-life-ends');
  advance(1);
  if (!said.some((x) => /^The rewind did not answer within a minute — nothing has been taken back yet\. Messages can be sent again; a new rewind waits until this one answers\.$/.test(x[0])) || view._rewindInFlight || !view._rewindBound.has('vsr-late')) bad.push('view:the-life-ends-said-and-still-bound');
  said.length = 0; box._textarea.value = '';
  view._onRewindAnswer({ requestId: 'vsr-late', answer: { rewound: true, targetMessageUuid: U(31), prefillText: 'ask' }, taken: 3 });
  if (box._textarea.value !== 'ask' || !said.some((x) => /Rewound — 3 messages taken back\. Your words are back in the box\./.test(x[0])) || view._rewindBound.has('vsr-late')) bad.push('view:a-late-answer-binds');
  // never «0 messages»: an echo the hub does not hold cuts nothing live (the next history load draws it) — said so; no
  // words from the CLI ⇒ the message's own
  await press('vsr-zero', 4); said.length = 0; box._textarea.value = '';
  view._onRewindAnswer({ requestId: 'vsr-zero', answer: { rewound: true, targetMessageUuid: U(77), prefillText: null }, taken: 0 });
  if (box._textarea.value !== 'ask' || !said.some((x) => /^Rewound to before your message\. This window could not mark what was taken back; it is marked after VibeSpace restarts or this conversation is resumed\. Your words are back in the box\.$/.test(x[0])) || said.some((x) => /\b0 messages/.test(x[0])) || clock.timers.length) bad.push(`view:no-zero-count-and-the-message-words (${said.map((x) => x[0])}, «${box._textarea.value}»)`);
  // a twin's answer (the cut was drawn by a rebuild first): a plain success, never «could not mark»
  await press('vsr-twin', 3); said.length = 0; box._textarea.value = '';
  view._onRewindAnswer({ requestId: 'vsr-twin', answer: { rewound: true, targetMessageUuid: U(31), prefillText: 'ask' }, taken: 0, already: true });
  if (!said.some((x) => /^Rewound to before your message\. Your words are back in the box\.$/.test(x[0])) || said.some((x) => /could not mark/.test(x[0]))) bad.push(`view:a-twin-answer-is-a-plain-success (${said.map((x) => x[0])})`);
  // BOUND BEFORE IT IS SENT: the result frame never comes (lost in a drop) — the CLI's answer under the page's own id binds
  view._yes = true; view._rewindInFlight = false; said.length = 0; view._rewindFromMessage(person); await tick();
  { const d = reqs[reqs.length - 1]; d.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: d.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false }); await tick(); }
  const ql = reqs[reqs.length - 1]; ql.opts.onTimeout(); said.length = 0; box._textarea.value = '';
  view._onRewindAnswer({ requestId: door.REWIND_REQUEST_PREFIX + ql.msg.reqId, answer: { rewound: true, targetMessageUuid: U(31), prefillText: 'ask' }, taken: 3 });
  if (box._textarea.value !== 'ask' || !said.some((x) => /Rewound — 3 messages taken back\./.test(x[0])) || view._rewindInFlight || clock.timers.length) bad.push('view:bound-before-it-is-sent');
  {
    view._yes = true; view._rewindInFlight = false; view._rewindFromMessage(person); await tick();
    const d = reqs[reqs.length - 1]; d.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: d.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false }); await tick();
    const qa = reqs[reqs.length - 1];
    view._onRewindAnswer({ requestId: door.REWIND_REQUEST_PREFIX + qa.msg.reqId, answer: { rewound: true, prefillText: 'ask' }, taken: 3 });
    view._yes = 'hold'; view._rewindFromMessage(person); await tick();      // the next press's dry run is out
    const qn = reqs[reqs.length - 1]; said.length = 0;
    qa.opts.onTimeout();                                                      // the answered press's own wait ends
    if (!qa.done || qn.done || said.length || !view._rewindInFlight) bad.push('view:an-answered-press-timeout-touches-nothing-else');
    qn.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qn.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false }); await tick();
    held && held(false); await tick();
  }
  // the answer is read by the ROW's granularity: a press through a 'turn' row (its JSON-RPC error keeps its words)
  const turnMsg = { id: 'pt', role: 'user', turnId: 'T-1', content: [{ type: 'text', text: 'turn ask' }] };
  const keepIds = view._getSessionIds, keepMsgs = view._messages;
  view._getSessionIds = () => ({ backend: 'turn-harness' }); view._messages = [turnMsg];
  await press('vsr-turn', 1, turnMsg); said.length = 0;
  view._onRewindAnswer({ requestId: 'vsr-turn', answer: { error: { message: 'boom' } }, taken: 0 });
  if (!said[0] || !/refused the rewind: boom/.test(said[0][0])) bad.push(`view:read-by-the-row-granularity (${said[0] && said[0][0]})`);
  view._getSessionIds = keepIds; view._messages = keepMsgs;
  // ONE LIFE (3): THE TAB KEEPS THE BINDING — a page reloaded before the CLI's answer (a NEW view, nothing in memory) binds
  // it: the success said, the words back, the tab's entry gone. Its RED CONTROL: a storage that keeps nothing (its plant
  // proven first: nothing kept after the press) leaves the reloaded page silent
  const reloadLaw = async (id) => {
    const out = [];
    await press(id, 3);
    const keptRaw = store.getItem('vs-rewind:sess-1');
    const view2 = new V(), box2 = new CI();
    box2._textarea = { value: '', dispatchEvent() { } }; box2.focus = () => { };
    Object.assign(view2, { sessionId: 'sess-1', _readOnly: false, _disposed: false, _chatInput: box2, _getSessionIds: () => ({ backend: 'claude' }), ws: view.ws, _messages: view._messages });
    said.length = 0;
    view2._onRewindAnswer({ requestId: id, answer: { rewound: true, targetMessageUuid: U(31), prefillText: null }, taken: 3 });   // no words from the CLI: the message's own
    if (box2._textarea.value !== 'ask' || !said.some((x) => /^Rewound — 3 messages taken back\. Your words are back in the box\.$/.test(x[0]))) out.push('view:a-reloaded-page-binds-the-answer');
    const left = store.getItem('vs-rewind:sess-1');
    if (left && JSON.parse(left)[id]) out.push('view:the-answer-leaves-the-tab');
    view._onRewindAnswer({ requestId: id, answer: { rewound: true, prefillText: 'ask' }, taken: 3 }); box._textarea.value = ''; said.length = 0;   // the first page settles
    return { out, kept: keptRaw ? JSON.parse(keptRaw) : {} };
  };
  { const lr = await reloadLaw('vsr-reload');
    if (lr.out.length || !lr.kept['vsr-reload'] || lr.kept['vsr-reload'].msgId !== 'p1' || lr.kept['vsr-reload'].granularity !== 'message' || Object.keys(lr.kept['vsr-reload']).some((k) => !['msgId', 'granularity', 'at'].includes(k))) bad.push(`view:the-tab-keeps-the-binding-ids-only (${lr.out.join(',')} ${JSON.stringify(lr.kept)})`);
    store.dead = true;
    const dead = await reloadLaw('vsr-reload-dead');
    store.dead = false;
    if (Object.keys(dead.kept).includes('vsr-reload-dead')) bad.push('view:RED CONTROL its plant (a storage that keeps nothing) is not in place');
    else if (!dead.out.includes('view:a-reloaded-page-binds-the-answer')) bad.push('view:RED CONTROL a dead storage left the reloaded page binding (the leg proves nothing)'); }
  // ONE LIFE (4): a send THE HUB REFUSED while a rewind is out comes back into an EMPTY box, with its door and the seconds
  // the hub said; a box in use is never overwritten
  box._textarea.value = ''; box._attachments = []; box._renderAttachments = () => { };
  box._sentAwaiting = new Map([['m42', { text: 'my next ask', attachments: [] }], ['m-other', { text: 'x', attachments: [] }]]); box._pendingSend = { text: 'my next ask', msgId: 'm42' }; said.length = 0;
  box.sentLanded('m-other');                         // ANOTHER message's op landed between the send and the refusal: m42 is still kept
  view._sayRefusedSend(box.refusedSend('m42'), 42);
  if (box._textarea.value !== 'my next ask' || box._pendingSend || box._sentAwaiting.has('m42') || !said.some((x) => /^A rewind is on its way — your message was not sent; it is back in the box\. Send it after the rewind answers \(in 42 s at the latest\), or stop the conversation\.$/.test(x[0]))) bad.push(`view:a-refused-send-comes-back-with-its-door (${said.map((x) => x[0])})`);
  box._textarea.value = 'typing'; box._sentAwaiting.set('m7', { text: 'other', attachments: [] }); said.length = 0;
  view._sayRefusedSend(box.refusedSend('m7'), 7);
  if (box._textarea.value !== 'typing' || !said.some((x) => /box already had text, so it was left alone\)\. Send it after the rewind answers \(in 7 s at the latest\)/.test(x[0]))) bad.push('view:a-refused-send-never-overwrites');
  // ITS words by its msgId: a later send's words never stand in for a refused earlier one; a pictures-only send's pictures come back
  box._textarea.value = ''; box._attachments = []; box._renderAttachments = () => { };
  box._sentAwaiting.set('mB', { text: 'B words', attachments: [] }); said.length = 0;
  const putA = box.refusedSend('mA');               // not this box's send (another view of the conversation): nothing to say
  if (putA !== null || box._textarea.value !== '' || !box._sentAwaiting.has('mB') || said.length) bad.push('view:a-box-that-did-not-send-it-is-silent');
  box.sentLanded('mB');
  if (box.refusedSend('mB') !== null) bad.push('view:a-landed-send-is-never-given-back');
  box._sentAwaiting.set('mP', { text: '', attachments: [{ mediaType: 'image/png', base64: 'AAAA' }] }); said.length = 0;
  view._sayRefusedSend(box.refusedSend('mP'), 9);
  if (box._attachments.length !== 1 || !said.some((x) => /it is back in the box/.test(x[0]))) bad.push('view:a-refused-send-brings-its-pictures-back');
  box._attachments = []; box._textarea.value = 'new typing'; box._sentAwaiting.set('mQ', { text: 'old words', attachments: [{ mediaType: 'image/png', base64: 'BBBB' }] }); said.length = 0;
  view._sayRefusedSend(box.refusedSend('mQ'), 9);
  if (box._attachments.length !== 0 || box._textarea.value !== 'new typing') bad.push('view:a-refused-send-pictures-never-join-new-typing');
  box._attachments = []; box._textarea.value = '';
  // A REFUSED ACTION (Compact now) IS SAID AND GIVES ITS BUTTON BACK: its entry keeps EMPTY words (nothing into the box)
  const actionLaw = (entry) => {
    const out = [], cbtn = { disabled: true };
    view._messageList = { querySelectorAll: (sel) => (sel === '.chat-ctx-compact-btn' ? [cbtn] : []) };
    box._textarea.value = ''; box._sentAwaiting = new Map(entry ? [['mC', entry]] : []); said.length = 0;
    const put = box.refusedSend('mC');
    if (put) view._sayRefusedSend(put, 30);
    if (put === 'action') view._giveActionsBack();
    if (put !== 'action' || box._textarea.value !== '' || cbtn.disabled || !said.some((x) => /^A rewind is on its way — your message was not sent\. Send it after the rewind answers \(in 30 s at the latest\)/.test(x[0]))) out.push('view:a-refused-action-is-said-and-gives-its-button-back');
    view._messageList = undefined;
    return out;
  };
  bad.push(...actionLaw({ text: '', attachments: [], action: true }));
  if (!actionLaw(null).includes('view:a-refused-action-is-said-and-gives-its-button-back')) bad.push('view:RED CONTROL the cure\'s deleted action entry left the refusal said (the leg proves nothing)');
  // the tab prunes EVERY session's day-old entries on a write — never this session's, never a fresh one
  store.setItem('vs-rewind:sess-old', JSON.stringify({ 'vsr-o': { msgId: 'x', granularity: 'message', at: Date.now() - 2 * 86400000 } }));
  store.setItem('vs-rewind:sess-new', JSON.stringify({ 'vsr-n': { msgId: 'y', granularity: 'message', at: Date.now() } }));
  view._keepRewind('vsr-prune', { msgId: 'p1', granularity: 'message' });
  if (store.getItem('vs-rewind:sess-old') || !store.getItem('vs-rewind:sess-new') || !JSON.parse(store.getItem('vs-rewind:sess-1') || '{}')['vsr-prune']) bad.push('view:the-tab-prunes-old-entries-only');
  view._keepRewind('vsr-prune', null); store.removeItem('vs-rewind:sess-new');
  box._textarea.value = ''; said.length = 0;
  // while the confirm stands open the door is one in flight: a second door opens no second dialog
  view._yes = 'hold'; view._rewindInFlight = false; said.length = 0; view._rewindFromMessage(person); await tick();
  const qh = reqs[reqs.length - 1]; qh.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qh.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: false }); await tick();
  const nh = reqs.length; view._rewindFromMessage(person); await tick();
  if (said.filter((x) => x[0] === 'confirm').length !== 1 || reqs.length !== nh || !said.some((x) => /already on its way/.test(x[0]))) bad.push('view:one-confirm-at-a-time');
  held && held(false); await tick();
  if (view._rewindInFlight) bad.push('view:a-cancelled-confirm-frees-the-door');
  // a plan that SAYS files roll back carries no caveat (the files===true branch)
  view._yes = false; said.length = 0; view._rewindFromMessage(person); await tick();
  const qy = reqs[reqs.length - 1]; qy.match({ type: 'rewind-result', sessionId: 'sess-1', reqId: qy.msg.reqId, ok: true, dryRun: true, taken: 3, turns: 2, files: true }); await tick();
  const cy = said.find((x) => x[0] === 'confirm');
  if (!cy || /Files on disk/.test(cy[1].message) || !/2 turns\. The agent will no longer remember them\.$/.test(cy[1].message)) bad.push('view:files-roll-back-no-caveat');
  // the button is re-asked on an edit to ANY field a point is judged on — the door's list is what its two readers read
  const readers = read('src/rewind-cut.js').split('function isPersonPrompt(msg) {')[1].split('\n}\n')[0] + read('src/rewind-door.js').split('function targetIdOf(checkpoints, msg) {')[1].split('\n}\n')[0];
  const readFields = [...new Set([...readers.matchAll(/\bmsg\.([a-zA-Z]+)/g)].map((m) => m[1]))];
  if (readFields.some((f) => !door.POINT_FIELDS.includes(f)) || readFields.length < 8) bad.push(`view:point-fields-cover-the-readers (${readFields.filter((f) => !door.POINT_FIELDS.includes(f))})`);
  ok(bad.length === 0, 'the page\'s door: the button only on a rewind point (not without a uuid, an agent card, a peer\'s message, a struck one, a batch member, a harness whose row is off, a sub-agent viewer, a gap slab\'s copy, a read-only view), follows the uuid and the batch; busy and read-only say so with no dialog; the confirm names the count and that files stay (danger); ONE ws.request (self-unhooking, 15 s said) carrying the page\'s newest uuid; one at a time; only OUR answer acts — the REAL putBack fills only an empty box; the CLI\'s refusal is worded; every reason has its own pinned words; cancel and a closed view send nothing', bad.join(' | '));
  // the WIRING the lifted methods hang on (each a line of the product; a removed one is red here)
  const cv = read('src/lib/chat-view.js'), cr = read('src/lib/chat-renderers.js');
  const wires = [
    ['the renderer draws the door with the other message buttons', /this\.addForkBtn\(el, msg\);\n    this\.addRewindBtn\(el, msg\);/.test(cr)],
    ['the view hands the renderer its click and its live gate', /onRewind: \(msg\) => this\._rewindFromMessage\(msg\)/.test(cv) && /canRewind: \(\) => !this\._readOnly/.test(cv)],
    ['a send the hub refused while a rewind is out comes back to the box (ITS words, by its msgId) with the seconds left — said only by the box that sent it', /if \(msg\.code === 'rewind-out'\) \{ const put = this\._chatInput\?\.refusedSend\?\.\(msg\.msgId\); if \(put\) this\._sayRefusedSend\(put, msg\.left\); if \(put === 'action'\) this\._giveActionsBack\(\); return; \}/.test(cv)],
    ['the composer keeps each send\'s words and pictures by its id until the hub draws THAT message', /this\._sentAwaiting\.set\(msgId, \{ text, attachments: this\._attachments\.slice\(\) \}\);/.test(read('src/lib/chat-input.js')) && /if \(msg\.op === 'create' && msg\.message && msg\.message\.webuiMsgId\) this\._chatInput\?\.sentLanded\?\.\(msg\.message\.webuiMsgId\);/.test(cv)],
    ['a conversation that EXITED drops the tab\'s waiting presses (a re-attach timeout or a sign-in wall keeps them)', /\} else if \(msg\.type === 'exited' && msg\.sessionId === sessionId\) \{\n        this\._hideTyping\(\);\n        try \{ sessionStorage\.removeItem\('vs-rewind:' \+ sessionId\); \} catch \{ \}/.test(cv) && !/_setReadOnly\(\) \{[^}]*sessionStorage/.test(cv)],
    ['an ACTION\'s own text (Compact now) is kept with EMPTY words — never given back, its refusal said, its button given back', /if \(sent && !carriesUserText && this\._sentAwaiting && this\._sentAwaiting\.has\(this\._lastSentId\)\) this\._sentAwaiting\.set\(this\._lastSentId, \{ text: '', attachments: \[\], action: true \}\);/.test(read('src/lib/chat-input.js')) && /this\._lastSentId = msgId; this\._pendingSend\.msgId = msgId;/.test(read('src/lib/chat-input.js')) && /if \(put === 'action'\) this\._giveActionsBack\(\);/.test(cv)],
    ['the design and doc comments say a refusal in the reader\'s language (engines, routes, clients)', /r && r\.i18n \? \{ i18n: r\.i18n \} : \{\}\);/.test(read('src/server/design-engine.js')) && /\.\.\.\(r && r\.i18n \? \{ i18n: r\.i18n \} : \{\}\) \}\);/.test(read('src/server/doc-engine.js'))
      && /\.\.\.\(r && r\.i18n \? \{ i18n: r\.i18n \} : \{\}\) \}\)\);/.test(read('src/routes/design.js')) && /\.\.\.\(r && r\.i18n \? \{ i18n: r\.i18n \} : \{\}\) \}\)\);/.test(read('src/routes/doc.js'))
      && /if \(r\.i18n && r\.i18n\.key\) return t\(r\.i18n\.key, r\.i18n\.params \|\| \{\}\);/.test(read('src/lib/design-window.js')) && /if \(r && r\.i18n && r\.i18n\.key\) return \{ words: t\(r\.i18n\.key, r\.i18n\.params \|\| \{\}\), kind: 'failed' \};/.test(read('src/lib/doc-window-model.js'))],
    ['the ws case answers the refusal by name, scoped to the action, with the seconds left', /if \(!r\.ok && r\.code === 'rewind_out'\) \{ try \{ ws\.send\(JSON\.stringify\(\{ type: 'error', code: 'rewind-out', scope: 'action',[^\n]*left: r\.left/.test(read('src/ws-handler.js'))],
    ['the stream\'s answer reaches the view', /if \(op\.subtype === 'rewind-answer'\) \{ this\._onRewindAnswer\(op\.data\); return; \}/.test(cv)],
    ['an edit to a field a point is judged on (a uuid, a batch, …) redraws the door', /if \(POINT_FIELDS\.some\(\(k\) => k in fields\)\) this\._renderers\.patchRewindBtn\(this\._elements\.get\(id\), msg\);/.test(cv)],
    ['a struck message loses its door', /_markRewoundEl\(el, kind\) \{\n    el\?\.querySelector\?\.\(':scope > \.chat-rewind-btn'\)\?\.remove\(\);/.test(cv)],
    ['a read-only view loses every door', /this\._readOnly = true;\n    this\._messageList\?\.querySelectorAll\?\.\('\.chat-rewind-btn'\)\.forEach\(\(b\) => b\.remove\(\)\);/.test(cv)],
    ['a closed view stops its answer timer and its request', /dispose\(\) \{\n    this\._statusBar\?\.dispose\?\.\(\);\n    clearTimeout\(this\._rewindAnswerTimer\); this\._rewindCancel\?\.\(\);/.test(cv)],
    ['the touch … menu row under the same gate', /rewindPointOf\(backendFeatureCaps\(backend\)\.checkpoints, msg\)[^\n]*\n\s*items\.push\(\{ label: t\('Rewind to here'\)/.test(cv)],
  ];
  const offWires = wires.filter(([, ok]) => !ok).map(([n]) => n);
  ok(offWires.length === 0, `the wiring: ${wires.map(([n]) => n).join(' · ')}`, offWires.join(' | '));
  // no backend id decides any part of the door (the §2.13 law — the caps row decides)
  const blocks = {
    'addRewindBtn': cr.slice(cr.indexOf('  addRewindBtn(el, msg) {'), cr.indexOf('  extractMsgText(msg) {')),
    '_rewindFromMessage': cv.slice(cv.indexOf('  _rewindFromMessage(msg) {'), cv.indexOf('  // Fork a new session from a specific assistant message')),
    'ws rewind': read('src/ws-handler.js').split("case 'rewind': {")[1]?.split('break;')[0] || '',
    'rewind-requests': read('src/server/rewind-requests.js'),
  };
  const idGate = /backend(?:\s*(?:\|\||\?\?)\s*'[a-z-]+'\s*\))?\s*[!=]==\s*'(?:codex|claude|opencode|antigravity|shell)'/;
  ok(gateOf(Object.values(blocks).every((b) => b.length > 50 && !idGate.test(b))) && verdictOf(idGate.test("x.backend === 'claude'")), 'no backend id decides the door — the button, the view, the ws case, the server door (the checker proven on a planted gate)', Object.entries(blocks).filter(([, b]) => idGate.test(b) || b.length <= 50).map(([k]) => k).join(','));
  // every word the door says, in both dictionaries
  const nb = cr.indexOf("Number.isFinite(msg.content[0].rewindData?.taken)"), mb = cv.indexOf('// «Rewind to here» (B-437e): the hover button');
  if (nb < 0 || mb < 0) bad.push('census:markers');
  const texts = [blocks.addRewindBtn, blocks._rewindFromMessage, cr.slice(nb, cr.indexOf('return { el, sideEffect: null };', nb)), cv.slice(mb, cv.indexOf('\n    }\n', mb))];
  const keys = [...new Set(texts.join('\n').match(/\bt\(\s*(['"])((?:(?!\1)[^\\]|\\.)+)\1/g).map((x) => x.replace(/^t\(\s*['"]/, '').slice(0, -1).replace(/\\(['"])/g, '$1')))];
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const missing = keys.filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':'));
  ok(nb > 0 && mb > 0 && keys.length >= 28 && missing.length === 0, `every word the door says (${keys.length}) has its zh and ja entry`, missing.join(' | '));
  const css = read('public/chat.css');
  ok(gateOf(/\.chat-rewind-btn \{ right: 30px; \}/.test(css)) && gateOf(/@media \(hover: none\) and \(pointer: coarse\) \{ \.chat-msg > \.chat-open-editor-btn, \.chat-msg > \.chat-fork-btn \{ display: none; \} \}/.test(css))
    && gateOf(/@media \(hover: none\) and \(pointer: coarse\) \{ \.chat-msg > \.chat-rewind-btn \{ display: none; \} \}/.test(css)) && verdictOf(/:has\(> \.chat-rewind-btn\)[^{]*\{ padding-right: 56px; \}/.test(css)),
    'the CSS: the fork\'s slot (a person\'s message never has a fork button), the words keep the column free, a touch client hides it in its OWN rule (the pinned touch line untouched; the … menu row serves touch)');
  ok(verdictOf(/rewind: +_s\('<path/.test(read('src/lib/icons.js'))), 'the button is an SVG icon (UI_ICONS.rewind)');
}

say('— §10 the person\'s goal press behind the same fence (r2682)');
{
  const RQG = require(path.join(REPO, 'src/server/rewind-requests.js'));
  const LIFE10 = door.REWIND_LIFE_MS;
  const liftGoal = (src) => {
    const a = src.indexOf("        case 'set-goal': {"), b = src.indexOf("\n        case 'rename-session'", a);
    if (a < 0 || b < 0) throw new Error('lift: the set-goal case of src/ws-handler.js not found');
    return new Function('data', 'ws', 'activeSessions', 'broadcastToSession', 'writeSessionMeta', 'readSessionMeta', 'require', `switch (data.type) {\n${src.slice(a, b)}\n}`);
  };
  const srcRequire = (p) => require(path.join(REPO, 'src', p.replace(/^\.\//, '')));
  const press = (caseFn, data, { out = null } = {}) => {
    const typed = [], sent = [], told = [];
    const session = { mode: 'chat', backend: 'claude', _goal: 'the old goal', _prevGoal: 'an older goal', pty: { write: (l) => typed.push(l) } };
    if (out) RQG.setFilesOut(session, { id: 'vsf-goal', at: out, files: true, pty: session.pty });
    caseFn({ type: 'set-goal', sessionId: 'cp-goal', ...data }, { send: (x) => sent.push(JSON.parse(x)) }, new Map([['cp-goal', session]]), (sx, id, f) => told.push(f), async () => true, () => ({}), srcRequire);
    return { typed, sent, told, goal: session._goal };
  };
  const live = liftGoal(read('src/ws-handler.js'));
  const now = Date.now();
  const set = press(live, { goal: 'ship it' }, { out: now }), clear = press(live, { goal: null }, { out: now }), resume = press(live, { action: 'resume' }, { out: now });
  const refused = (r) => r.typed.length === 0 && r.told.length === 0 && r.goal === 'the old goal' && r.sent.length === 1 && r.sent[0].type === 'error' && r.sent[0].code === 'rewind-out' && r.sent[0].scope === 'goal'
    && r.sent[0].left > 0 && r.sent[0].left <= LIFE10 / 1000 && /the goal was not changed/.test(r.sent[0].error || '');
  ok(gateOf(refused(set)) && gateOf(refused(clear)) && verdictOf(refused(resume)), '§10 WHILE A REWIND IS OUT a person\'s goal set, clear and resume are refused BY NAME (rewind-out, scope goal, the seconds left) — nothing written to the CLI, the goal unchanged, nobody told a goal moved', JSON.stringify(set.sent));
  const status = press(live, { action: 'status' }, { out: now });
  ok(status.typed.length === 0 && status.sent.length === 1 && status.sent[0].type === 'goal-updated' && verdictOf(/Goal active: the old goal/.test(status.sent[0].statusMsg || '')), '§10 reading the goal (status) is never stopped by the fence', JSON.stringify(status.sent));
  const free = press(live, { goal: 'ship it' }), late = press(live, { goal: 'ship it' }, { out: now - LIFE10 - 1 });
  ok(verdictOf([free, late].every((r) => r.typed.length === 1 && JSON.parse(r.typed[0]).type === 'set-goal' && r.goal === 'ship it' && r.told.length === 1 && r.told[0].type === 'goal-updated')),
    '§10 with no rewind out — or once its stated minute has passed — the goal press goes through as before (one frame to the CLI, every client told)', JSON.stringify([free.typed, late.typed]));
  // the page: the typed /goal back into a free box, and the words (the composer's and the view's own methods, lifted)
  const CI = read('src/lib/chat-input.js'), CV = read('src/lib/chat-view.js');
  const slice = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a + 1); if (a < 0 || b < 0) throw new Error('lift: ' + from.trim()); return src.slice(a, b); };
  const toasts = [], tt = (k, p) => String(k).replace(/\{(\w+)\}/g, (_, x) => (p && x in p ? p[x] : `{${x}}`));
  const Box = new Function('t', 'showToast', `return class { ${slice(CI, '  refusedGoal() {', '\n  confirmGoal() {')} ${slice(CV, '  _sayRefusedGoal(put, left) {', '\n  /** A refused ACTION (Compact now)')} }`)(tt, (m, o) => toasts.push([m, o && o.type]));
  const box = (text, value) => Object.assign(new Box(), { _pendingGoal: text ? { text } : null, _goalTimer: 1, _clearPending() { this.cleared = true; }, _textarea: { value }, putBack(x) { if (!x) return 'none'; if (this._textarea.value.trim()) return 'kept'; this._textarea.value = x; return 'restored'; } });
  const b1 = box('/goal ship it', ''), r1 = b1.refusedGoal(); b1._sayRefusedGoal(r1, 42);
  const b2 = box('/goal ship it', 'a draft'), r2 = b2.refusedGoal();
  const b3 = box(null, ''), r3 = b3.refusedGoal(); b3._sayRefusedGoal(r3, 42);
  const line = CV.split('\n').find((l) => l.includes("msg.code === 'rewind-out' && msg.scope === 'goal'")) || '';
  const routed = []; new Function('msg', line).call({ _chatInput: { refusedGoal: () => 'restored' }, _sayRefusedGoal: (put, left) => routed.push([put, left]) }, { code: 'rewind-out', scope: 'goal', left: 9 });
  ok(r1 === 'restored' && b1._textarea.value === '/goal ship it' && b1._pendingGoal === null && gateOf(b1.cleared) && r2 === 'kept' && b2._textarea.value === 'a draft' && r3 === null
    && gateOf(/your \/goal is back in the box/.test(toasts[0][0])) && gateOf(/in 42 s at the latest/.test(toasts[0][0])) && toasts[0][1] === 'error' && gateOf(/the goal was not changed\. Change it/.test(toasts[1][0])) && JSON.stringify(routed) === '[["restored",9]]',
    '§10 THE PAGE: the hub\'s goal refusal ends the «Setting goal…» line and puts the typed /goal back into a FREE box (a box with text is left alone; a status-bar press has none), said with the seconds left', JSON.stringify(toasts));
  const unfenced = liftGoal(anchored(read('src/ws-handler.js'), "            if (fenced) { try { ws.send(JSON.stringify({ type: 'error', code: 'rewind-out', scope: 'goal', sessionId: data.sessionId, left: fenced.left, error: fenced.error, message: fenced.error })); } catch { } break; }\n", '', 'checkpoints: the goal case unfenced'));
  const u = press(unfenced, { goal: 'ship it' }, { out: now });
  ok(u.typed.length === 1 && u.goal === 'ship it', 'RED CONTROL (the goal case unfenced): a person\'s /goal goes to the CLI while a rewind is out');
}

say(failed ? `\n${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${passed}${skipped ? `; ${skipped} red control SKIPPED — not in this clone` : ''})`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
