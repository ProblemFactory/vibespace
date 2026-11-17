#!/usr/bin/env node
// test-checkpoints (fast, PURE — B-437e, docs/design-harness-features.md §3.2: REWIND A CHAT CONVERSATION IN PLACE, tier
// one = the conversation). The owner ruled «conversation 与 files 都做» on 2026-09-07; this suite gates the door's model:
//   §1 THE ROW — src/backend-caps.js `checkpoints` on every harness (and NO_CAPS / a contributed harness): the closed key
//      set, files false everywhere (tier one never touches the working tree), a true row names its granularity and its
//      verb, a false row names neither; the client mirror (src/lib/agent-meta.js) carries the row on every caps literal
//      (test-harness-contract deep-compares the values — it only sees keys the client HAS, so the presence is pinned here)
//   §2 THE VERDICT — src/rewind-door.js rewindVerdict over a table: every refusal reason reached, in its order; the drawn
//      door (rewindPointOf) agrees with the verdict on an idle live conversation
//   §3 THE PLAN — the cut is BEFORE the target (it and all after it go), rewound messages skipped, the newest person's
//      uuid named, the words for the composer; for the 'turn' road the plan's cut equals src/rewind-ops.js's own cut
//      for the same number of turns (what codex's record marks is what the press marked)
//   §4 THE ANSWER — the 13 refusal reasons read from the claude 2.1.322 binary, each with its class and the binary's own
//      «may be sent again»; an unknown reason and an error reply keep their text; the JSON-RPC road
//   §5 RED CONTROLS — four planted defects in a scratch copy of the module, each RED on the law it breaks; the release
//      b06f36e90 has no row (a COUNTED skip without git)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
  // This unit (U1) builds no road: every row is off until the unit that builds its road turns it on.
  ok(rows.every(([, r]) => r && r.conversation === false), 'U1: no harness offers the door yet (a row turns true with its road — never a dead control)');
  const bent = caps.contributeCaps('test-checkpoints-bent', { checkpoints: { conversation: true, files: true, granularity: 'message', redo: false, verb: 'x' } });
  const partial = caps.contributeCaps('test-checkpoints-partial', { checkpoints: { conversation: true } });
  const fine = caps.contributeCaps('test-checkpoints-fine', { checkpoints: { conversation: true, files: false, granularity: 'turn', redo: false, verb: 'x/revert' } });
  caps.contributeCaps('test-checkpoints-bent', null); caps.contributeCaps('test-checkpoints-partial', null); caps.contributeCaps('test-checkpoints-fine', null);
  ok(bent.checkpoints === caps.NO_CHECKPOINTS && partial.checkpoints === caps.NO_CHECKPOINTS && fine.checkpoints.conversation === true && Object.isFrozen(fine.checkpoints)
    && caps.setVerifiedCap('opencode', 'checkpoints', { conversation: true }) === false && caps.capsOf('opencode').checkpoints === caps.NO_CHECKPOINTS,
    'a contributed row enters ONLY in its shape (files:true / a partial row ⇒ the off row; a well-formed one frozen) and no prober flips the row (setVerifiedCap refuses)');
  ok(Object.isFrozen(caps.NO_CHECKPOINTS) && caps.capsOf('opencode').checkpoints === caps.NO_CHECKPOINTS,
    'the off row is ONE frozen object (opencode: its revert takes the FILES with the messages — no conversation-only door)');
  const meta = read('src/lib/agent-meta.js');
  const literals = meta.split('\n').filter((l) => /^\s+caps: \{/.test(l) || /^const NO_FEATURE_CAPS = /.test(l));
  ok(literals.length >= 5 && literals.every((l) => /\bcheckpoints: NO_CHECKPOINTS\b/.test(l)),
    `the client mirror carries the row on every caps literal (${literals.length}) — the same frozen object the server row holds`,
    literals.filter((l) => !/\bcheckpoints:/.test(l)).map((l) => l.trim().slice(0, 60)).join(' | '));
  ok(/import \{[^}]*\bNO_CHECKPOINTS\b[^}]*\} from '\.\.\/backend-caps\.js';/.test(meta), 'the client imports the row from the server module (one source)');
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
  for (const r of Object.keys(D.REWIND_REFUSALS)) if (r !== 'target-not-found' && !reached.has(r)) bad.push(`refusal-unreached:${r}`);
  // the plan
  const p = D.rewindPlanOf(MSG_ROW, m, 'c:3', { live: true });
  if (!p.ok) bad.push('plan:ok');
  else {
    if (JSON.stringify(p.ids) !== JSON.stringify(['c:3', 'c:4', 'c:5', 'c:6', 'c:7', 'c:8'])) bad.push(`plan:cut-before-target (${p.ids})`);
    if (p.prompts !== 2) bad.push(`plan:prompts (${p.prompts})`);
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

// The 13 reasons as READ from the installed claude 2.1.322 binary — its `jv` text table (the CLI's own words, the
// `error` field) and its `Kv` «may be sent again» table — pinned here so a module edit cannot quietly move one. A
// hand copy: re-reading the 340 MB binary in a fast suite is not paid; a new CLI build is re-read by hand (the lane's
// binary grep, kb essay).
const MEASURED = {
  commands_queued: { cls: 'busy', retry: true, text: 'commands queued' }, prompt_pending: { cls: 'busy', retry: false, text: 'prompt pending' },
  turn_running: { cls: 'busy', retry: true, text: 'turn running' }, target_not_found: { cls: 'moved', retry: true, text: 'target not found' },
  stale_target: { cls: 'moved', retry: false, text: 'stale target' }, unseen_later_turn: { cls: 'moved', retry: false, text: 'unseen later turn' },
  poll_tool_result_target: { cls: 'cannot', retry: false, text: 'poll tool_result target' },
  target_splits_tool_call: { cls: 'cannot', retry: false, text: 'target splits a tool call' },
  delivered_poll_events_in_range: { cls: 'cannot', retry: false, text: 'delivered poll events in range' },
  persist_failed: { cls: 'failed', retry: true, text: 'failed to persist rewind anchor' }, state_changed: { cls: 'moved', retry: true, text: 'state changed' },
  usage_limited: { cls: 'limit', retry: false, text: 'usage limited' }, expired: { cls: 'failed', retry: true, text: 'expired' },
};

say('— §2–§4 the verdict, the plan, the answer');
{
  const bad = laws(door);
  ok(bad.length === 0, 'every law holds on the tree: the verdict table (each refusal reached; two reasons at once say the first in order; only the person\'s own messages; the drawn door agrees), the plan (cut before the target, rewound skipped, newest live uuid, the composer words, no stated state = stopped; the turn road by turn id), the answer (13 measured reasons with the CLI\'s own words, unknown + error texts kept, no answer is never resent, the JSON-RPC road)', bad.join(' | '));
  ok(JSON.stringify(Object.keys(door.CLAUDE_REWIND_REASONS).sort()) === JSON.stringify(Object.keys(MEASURED).sort()),
    'the module names exactly the 13 reasons the 2.1.322 binary has — no more, none missing', Object.keys(door.CLAUDE_REWIND_REASONS).join(','));
  ok(Object.values(door.REWIND_REFUSALS).every((c) => door.ANSWER_CLASSES.includes(c)) && Object.values(door.CLAUDE_REWIND_REASONS).every((r) => door.ANSWER_CLASSES.includes(r.cls)),
    'every refusal and every CLI reason lands in the closed class set the page words');
  const src = read('src/rewind-door.js');
  ok(!/require\(/.test(src.replace(/^\s*\/\/.*$/gm, '')) && !/\bbackend\b\s*[!=]==/.test(src), 'PURE: the module requires nothing and never asks a backend id');
}

say('— §5 red controls');
{
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-checkpoints-'));
  process.on('exit', () => { try { fs.rmSync(T, { recursive: true, force: true }); } catch { } });
  const SRC = read('src/rewind-door.js');
  const MUTANTS = [
    ['the verdict forgets a running turn', "  if (state.turnRunning) return no('turn-running');\n", '', 'verdict:turn running'],
    ['the cut lands AFTER the target', '  for (let i = at; i < list.length; i++) {', '  for (let i = at + 1; i < list.length; i++) {', 'plan:cut-before-target'],
    ['the newest uuid counts a taken-back message', "if (m && m.role === 'user' && !m.rewound && typeof m.uuid === 'string' && m.uuid) { lastSeenUuid", "if (m && m.role === 'user' && typeof m.uuid === 'string' && m.uuid) { lastSeenUuid", 'plan:last-seen-live'],
    ['an unknown CLI reason is dropped', "reason: row ? why : 'cli-other'", 'reason: row ? why : null', 'answer:unknown-kept'],
  ];
  let i = 0;
  for (const [name, from, to, law] of MUTANTS) {
    if (SRC.split(from).length !== 2) { ok(false, `mutant «${name}»: its anchor is in the module exactly once`); continue; }
    const f = path.join(T, `rewind-door-m${++i}.js`);
    fs.writeFileSync(f, SRC.split(from).join(to));
    const bad = laws(require(f));
    ok(bad.some((b) => b.startsWith(law)), `RED CONTROL «${name}» ⇒ the law «${law}» is red`, bad.join(' | ') || 'all green');
  }
  const g = spawnSync('git', ['-C', REPO, 'show', `${BASE}:src/backend-caps.js`], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (g.status === 0 && g.stdout) ok(!/\bcheckpoints\b/.test(g.stdout), `RED CONTROL the release ${BASE} has no checkpoints row (§1 is red there)`);
  else { skipped++; say(`  - SKIP the release ${BASE} control: not in this clone`); }
}

say(failed ? `\n${failed} FAILED (${passed} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${passed}${skipped ? `; ${skipped} red control SKIPPED — not in this clone` : ''})`);
process.exit(failed ? 1 : 0);
