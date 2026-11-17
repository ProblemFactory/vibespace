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
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'b06f36e90'; // 2.369.407 — no checkpoints row, no door
const require = createRequire(import.meta.url);
let passed = 0, failed = 0, skipped = 0;
const ok = (c, msg, why = '') => { if (c) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg + (why ? ' — ' + why : '')); } return !!c; };
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
    ok(law, `${id}: checkpoints has the closed key set, files:false (tier one), a true row names granularity + verb, a false row neither`, JSON.stringify(row));
  }
  ok(ids.length >= 5 && ['claude', 'codex', 'opencode', 'antigravity', 'shell'].every((id) => ids.includes(id)), 'the census saw every declared harness', ids.join(','));
  // A row turns true with its road (never a dead control): claude's road is U2; codex's (thread/revert) is U3.
  ok(caps.capsOf('claude').checkpoints === caps.CLAUDE_CHECKPOINTS && JSON.stringify(caps.CLAUDE_CHECKPOINTS) === JSON.stringify(MSG_ROW),
    'claude offers the door — the row is the shape the model was proven on (message granularity, rewind_conversation)');
  ok(rows.filter(([id]) => id !== 'claude').every(([, r]) => r && r.conversation === false), 'every other harness is off until its road is built (codex: U3)');
  const bent = caps.contributeCaps('test-checkpoints-bent', { checkpoints: { conversation: true, files: true, granularity: 'message', redo: false, verb: 'x' } });
  const partial = caps.contributeCaps('test-checkpoints-partial', { checkpoints: { conversation: true } });
  const fine = caps.contributeCaps('test-checkpoints-fine', { checkpoints: { conversation: true, files: false, granularity: 'turn', redo: false, verb: 'x/revert' } });
  caps.contributeCaps('test-checkpoints-bent', null); caps.contributeCaps('test-checkpoints-partial', null); caps.contributeCaps('test-checkpoints-fine', null);
  ok(bent.checkpoints === caps.NO_CHECKPOINTS && partial.checkpoints === caps.NO_CHECKPOINTS && fine.checkpoints === caps.NO_CHECKPOINTS
    && caps.checkpointsRowOf({ conversation: true, files: false, granularity: 'turn', redo: false, verb: 'x/revert' }).conversation === true
    && caps.checkpointsRowOf({ conversation: true, files: true, granularity: 'message', redo: false, verb: 'x' }) === caps.NO_CHECKPOINTS
    && caps.setVerifiedCap('opencode', 'checkpoints', { conversation: true }) === false && caps.capsOf('opencode').checkpoints === caps.NO_CHECKPOINTS,
    'a contributed harness\'s row stays OFF (the page has no road for it yet); the shape judge keeps only a well-formed row; no prober flips a row (setVerifiedCap refuses)');
  ok(Object.isFrozen(caps.NO_CHECKPOINTS) && caps.capsOf('opencode').checkpoints === caps.NO_CHECKPOINTS,
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
  ok(literals.length >= 4 && literals.every((l) => /\bcheckpoints: serverCapsOf\('[a-z-]+'\)\.checkpoints,/.test(l)),
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
    && Object.entries(CAPTURE.reasons).every(([k, v]) => door.CLAUDE_REWIND_REASONS[k].retry === v.retry),
    `the module's reasons and their «may be sent again» are exactly the CAPTURE's (${CAPTURE.cli}, sha256 ${String(CAPTURE.programSha256).slice(0, 12)}) — no more, none missing, none moved`, Object.keys(door.CLAUDE_REWIND_REASONS).join(','));
  ok(CAPTURE.cli === '2.1.322' && /^[0-9a-f]{64}$/.test(CAPTURE.programSha256) && CAPTURE.request.subtype === caps.CLAUDE_CHECKPOINTS.verb
    && ['target_message_uuid', 'last_seen_user_message_uuid', 'interrupt_if_running'].every((f) => CAPTURE.request.fields.includes(f))
    && ['rewound', 'targetMessageUuid', 'prefillText'].every((f) => CAPTURE.reply.done.includes(f)) && ['rewound', 'reason', 'error'].every((f) => CAPTURE.reply.refused.includes(f))
    && CAPTURE.persist.row === 'last-prompt' && CAPTURE.persist.writtenBeforeTheLastCheck === true && CAPTURE.persist.healRow.explicit === true && /^tengu_/.test(CAPTURE.persist.cutUuidFlag)
    && typeof CAPTURE.persist.healRow.writtenBy === 'string' && CAPTURE.persist.ordinaryRowExplicit === false && CAPTURE.persist.writers.some((w) => w.explicit && w.leafUuid === 'null')
    && CAPTURE.request.fields.includes('expires_at'),
    'the capture names the verb the claude row names, the request fields the door writes, the reply fields the normalizer reads, the transcript row it cuts from and the heal row after it');
  ok(/MEASURED by scripts\/measure-claude-rewind\.mjs/.test(CAPTURE._note) && fs.existsSync(path.join(REPO, 'scripts/measure-claude-rewind.mjs')) && !/child_process|worker_threads|\b(?:spawn|spawnSync|execFile|execFileSync|execSync|fork)\(/.test(read('scripts/measure-claude-rewind.mjs')),
    'the capture is the measuring script\'s (it READS the program file; it starts no process)');
  ok(Object.values(door.REWIND_REFUSALS).every((c) => door.ANSWER_CLASSES.includes(c)) && Object.values(door.CLAUDE_REWIND_REASONS).every((r) => door.ANSWER_CLASSES.includes(r.cls)),
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
    fs.writeFileSync(f, SRC.split(from).join(to));
    const bad = laws(require(f));
    ok(bad.some((b) => b.startsWith(law)), `RED CONTROL «${name}» ⇒ the law «${law}» is red`, bad.join(' | ') || 'all green');
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
const { requestRewind } = require(path.join(REPO, 'src/server/rewind-requests.js'));
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
function roadLaws(MM = createMessageManager) {
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
  mm._rewindOut = null;
  // THE WORDS BEFORE THE PRESS (entry condition 5): a dry run answers the plan's count, turns and the row's files fact,
  // and writes nothing
  const dr = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3), dryRun: true });
  if (!dr.ok || dr.dryRun !== true || dr.files !== false || dr.turns !== 1 || dr.taken !== rewindPlan(mm, p2).count || written.length || mm.rewindPending()) bad.push(`door:dry-run-says-the-plan (${JSON.stringify(dr)})`);
  // the press carries the numbers its confirm said: a conversation that changed in between is refused, nothing written
  const cs = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3), expectTaken: dr.taken + 1 });
  if (cs.ok || cs.reason !== 'changed-since' || written.length) bad.push(`door:changed-since (${cs.reason})`);
  const plan = rewindPlan(mm, p2);
  const r = requestRewind({ by: HUMAN, session, msgId: p2 && p2.id, lastSeenUuid: U(3), expectTaken: dr.taken });
  const r2 = requestRewind({ by: HUMAN, session, msgId: p1 && p1.id, lastSeenUuid: U(3) });
  if (r2.ok || r2.reason !== 'pending') bad.push(`door:one-at-a-time (${r2.reason})`);
  let req = null; try { req = JSON.parse(written[0]); } catch { }
  if (!r.ok || written.length !== 1 || !req || req.type !== 'control_request' || req.request.subtype !== 'rewind_conversation'
    || req.request.target_message_uuid !== U(3) || req.request.last_seen_user_message_uuid !== U(3) || req.request.interrupt_if_running !== undefined
    || req.request_id !== r.requestId || !r.requestId.startsWith(door.REWIND_REQUEST_PREFIX)
    || !(Date.parse(req.request.expires_at) > Date.now() + 30000 && Date.parse(req.request.expires_at) < Date.now() + 90000)
    || Object.keys(req.request).some((k) => k !== 'subtype' && !CAPTURE.request.fields.includes(k))) bad.push(`door:writes-one-request (${written[0]})`);
  if (r.taken !== plan.count || r.turns !== 1 || r.files !== false) bad.push(`door:says-the-plan (${r.taken}/${plan.count}, ${r.turns}, ${r.files})`);
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
  if (mm.rewindPending()) bad.push('answer:clears-the-pending-press');
  if (!p1 || p1.rewound) bad.push('answer:keeps-before-target');
  // the same answer read again (a rebuild reads the buffer) cuts nothing more
  mm.processLive(REC.answer(r.requestId, { rewound: true, targetMessageUuid: U(3), prefillText: 'second ask' }));
  if (notices(mm).length !== 1) bad.push('answer:twice-cuts-once');
  // the CLI names the cut's ECHO of the target (2.1.322 `targetMessageUuid: cut.echoUuid`): one this view does not hold
  // cuts NOTHING live and says no notice (a rebuild's transcript row cuts it) — an answer never guesses
  const { mm: me } = liveTwo(MM, 'cp-echo');
  const pe = me.messages.find((m) => m.webuiMsgId === 'm-2');
  const se = { ...session, _normalizer: me, pty: { write: () => { } } };
  const re = requestRewind({ by: HUMAN, session: se, msgId: pe && pe.id, lastSeenUuid: U(3) });
  me.processLive(REC.answer(re.requestId, { rewound: true, targetMessageUuid: U(55), prefillText: 'second ask' }));
  if (!re.ok || !pe || pe.rewound || notices(me).length !== 0 || me.rewindPending()) bad.push('answer:an-unheld-echo-cuts-nothing-live');
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
  const h3b = MM('claude', 'cp-h3b'); h3b.convertHistory([...rows, REC.answer('vsr-a', { rewound: true, targetMessageUuid: U(3) }), REC.anchor({ leafUuid: U(2), rewound: true }), REC.said('a new reply', U(5))]);
  if (struck(h3b).length !== 2 || notices(h3b).length !== 1) bad.push('reload:leaf-only-twin-cuts-once');
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
  return bad;
}
const rewindPlan = (mm, target) => door.rewindPlanOf(caps.capsOf('claude').checkpoints, mm.messages, target && target.id, { live: true });

say('— §6 the claude road');
{
  const bad = roadLaws();
  ok(bad.length === 0, 'the road holds: stamp → uuid on the bubble (once, never re-pointed), the door refuses by name and writes nothing, ONE request naming the target + the newest uuid, the answer cuts exactly the plan (one notice, one rewound op, one rewind-answer with the composer words), twice cuts once, a refusal / an error keep reason + text, not-ours unread; the reload cuts the same from the transcript row (cutUuid, leaf-only, twins once, unplaced said, to the start), a plain last-prompt row is still no card', bad.join(' | '));
  let threw = false; try { ClaudeCodeAdapter.rewindRequest({ targetId: null }); } catch { threw = true; }
  ok(threw, 'the claude request refuses to be built with no target uuid');
  // THE ROAD IS THE DESCRIPTOR'S: every built-in row on ⇔ its descriptor names a road; validate() refuses a row on without one
  const roads = H.chatHarnessIds().map((id) => [id, caps.capsOf(id).checkpoints.conversation === true, !!H.rewindRoad(id)]);
  let refused = null;
  try { H.assertRewindContract({ id: 'test-plug', caps: { checkpoints: MSG_ROW } }); } catch (e) { refused = e.message; }
  ok(roads.every(([, on, road]) => on === road) && H.rewindRoad('claude') && H.get('claude').rewind.request === H.rewindRoad('claude').request
    && /declares a conversation rewind .* but no rewind\.request road/.test(refused || '') && (() => { try { H.assertRewindContract({ id: 'x', caps: { checkpoints: caps.NO_CHECKPOINTS } }); return true; } catch { return false; } })(),
    `the road is the harness descriptor's: row on ⇔ road (${roads.map(([id, on, rd]) => `${id} ${on ? 'on' : 'off'}/${rd ? 'road' : 'none'}`).join(', ')}); a row on without one is refused at registration`, refused || '');
  // WHO MAY ASK (entry condition 4): the ONE caller is the owner's /ws case with the socket's own person; no automation
  // verb, no route, no agent door names a rewind
  const callers = spawnSync('git', ['-C', REPO, 'grep', '-l', '-F', 'requestRewind(', '--', 'src', 'server.js'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
  const wsCase = read('src/ws-handler.js').split("case 'rewind': {")[1]?.split('break;')[0] || '';
  const verbs = require(path.join(REPO, 'src/automation-keys.js')).VERBS || [];
  const routeHits = spawnSync('git', ['-C', REPO, 'grep', '-l', '-i', '-F', 'rewind', '--', 'src/routes', 'src/server/automation-engine.js', 'data/bin/vibespace-msg', 'data/bin/vibespace-task'], { encoding: 'utf8' }).stdout.trim();
  ok(JSON.stringify(callers.sort()) === JSON.stringify(['src/server/rewind-requests.js', 'src/ws-handler.js']) && /by: ws\._personPage === true \? byOfWs\(ws\) : null/.test(wsCase)
    && /ws\._personPage = require\('\.\/server\/rewind-requests\.js'\)\.personOfUpgrade\(req\)/.test(read('src/ws-handler.js'))
    && verbs.length > 5 && !verbs.some((v) => /rewind/i.test(v)) && routeHits === '',
    'the door\'s ONE caller is the owner\'s /ws case with the socket\'s person (byOfWs, only on a socket personOfUpgrade proved at its handshake); no automation verb, no route and no agent CLI names a rewind', `${callers.join(',')} | verbs ${verbs.filter((v) => /rewind/i.test(v))} | ${routeHits}`);
}

say('— §7 the real wrapper stamps every person frame');
async function wrapperLaws(wrapperFile) {
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
    await new Promise((res) => setTimeout(res, 150)); // the stamp record follows the frame's write
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
    const bad = await wrapperLaws(path.join(T, 'old/data/bin/chat-wrapper.js'));
    ok(bad.some((b) => b.startsWith('wrapper:idle-frame-stamped')) && bad.some((b) => b.startsWith('wrapper:frame_stamp-says-it')) && bad.some((b) => b.startsWith('wrapper:a-held-frame')), `RED CONTROL the release ${BASE}'s wrapper sends an idle frame unstamped and says no stamp`, bad.join(' | ') || 'all green');
  } else { skipped++; say(`  - SKIP the release ${BASE} wrapper control: not in this clone`); }
  // normalizer mutants: a scratch copy of src/ with one line changed
  const MSRC = read('src/message-manager.js');
  const NM = [
    ['the normalizer does not read our answer', "    if (String(requestId).startsWith(REWIND_REQUEST_PREFIX)) return this._processRewindAnswer(raw.response, emit); // B-437e: ours\n", '', 'answer:cuts-the-plan'],
    ['last-prompt left ignored', "      case 'last-prompt': return this._processLastPrompt(raw, emit);", "      case 'last-prompt-x': return this._processLastPrompt(raw, emit);", 'reload:cuts-from-cutUuid'],
    ['the CLI\'s heal row not read', "    if (this._pendingRowCut && raw.explicit === true && raw.rewound !== true && this._namesThePendingCut(raw.leafUuid)) { this._pendingRowCut = null; return; }", '', 'reload:heal-row-cancels'],
    ['the stamp is not read', "      case 'frame_stamp': return this._processFrameStamp(raw, emit);", "      case 'frame_stamp-x': return this._processFrameStamp(raw, emit);", 'stamp:uuid-on-bubble'],
  ];
  // ONE scratch copy of src/ (37 MB), re-patched per mutant with the copy's modules dropped from the require cache
  const M = path.join(T, 'mut');
  fs.cpSync(path.join(REPO, 'src'), path.join(M, 'src'), { recursive: true });
  for (const f of ['package.json', 'node_modules']) { try { fs.symlinkSync(path.join(REPO, f), path.join(M, f)); } catch { } }
  const mreq = createRequire(path.join(M, 'package.json'));
  for (const [name, from, to, law] of NM) {
    if (MSRC.split(from).length !== 2) { ok(false, `mutant «${name}»: its anchor is in src/message-manager.js exactly once`); continue; }
    for (const key of Object.keys(mreq.cache)) if (key.startsWith(M + path.sep)) delete mreq.cache[key];
    fs.writeFileSync(path.join(M, 'src/message-manager.js'), MSRC.split(from).join(to));
    const MM = mreq('./src/normalizers.js').createMessageManager;
    let bad;
    try { bad = roadLaws(MM); } catch (e) { bad = [`threw: ${e.message}`]; }
    ok(bad.some((b) => b.startsWith(law)), `RED CONTROL «${name}» ⇒ the law «${law}» is red`, bad.join(' | ') || 'all green');
  }
}

say(failed ? `\n${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${passed}${skipped ? `; ${skipped} red control SKIPPED — not in this clone` : ''})`);
process.exit(failed ? 1 : 0);
