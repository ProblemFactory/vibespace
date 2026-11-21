'use strict';
/**
 * THE OpenCode-serve OP TABLE — one definition of "what can be asked of the
 * OpenCode serve on a machine", so the three transports cannot drift
 * (S9 remainder piece (e), B-eac2; the CS separation law: `hostId` is a
 * PARAMETER, never a branch).
 *
 * SHARED tier: imports NOTHING but the facts object it is handed. It runs
 *   • in the server process, against the local `facts()` singleton;
 *   • inside `agentd` on a paired device (the daemon bundles src/opencode-serve.js
 *     and builds its own facts there — the SAME code, executed where the store is);
 *   • mirrored by data/bin/vibespace-opencode-op, the shipped single file for
 *     checkout-less ssh hosts (the documented "shipped scanner" exception —
 *     an ssh host has no checkout, so it cannot require this module; the
 *     parity suite scripts/test-opencode-remote.mjs pins the op names,
 *     required params and result keys on both sides).
 *
 * WHY A TABLE AND NOT A METHOD PER TRANSPORT: the 2.276.0 twin-set lesson.
 * Every "reach the serve" caller names an op from OPENCODE_OPS and passes a
 * hostId; adding an op is ONE row plus one mirror line in the shipped script,
 * and the parity suite fails a one-sided edit.
 *
 * The RESULT of every op is plain JSON (it crosses a device link / an ssh
 * pipe), and every FAILURE is an Error whose message names the machine-side
 * cause — a rung that swallows a failure would leave the user's action
 * silently undone.
 */

/** op name → { member, required[], build(params) → args[], result(v) → json }
 *  `member` is the facts method; `build` maps the wire params onto its
 *  arguments; `result` normalises the return so all three rungs agree. */
// B-5278 unit 2, part 5: A CONVERSATION's READ AND THE STATUS LIST ARE BOUNDED where they are made, the same for every rung
// (the device's op, the local rung, and the hub's synthesis of the ssh rung's raw payload). A read keeps the conversation's
// session record (records[0]) and the NEWEST records whose serialized size fits READ_MAX; when older ones are dropped it says so
// (truncated, total, kept) — a reader must show that older history is not shown. The status list keeps at most STATUS_MAX entries.
const READ_MAX = 32 * 1024 * 1024, STATUS_MAX = 2000;
/** PURE: {session, records} within READ_MAX → the same, plus {truncated, total, kept} when the oldest were dropped */
function boundRead(session, records, max = READ_MAX) {
  const all = Array.isArray(records) ? records : [];
  if (!all.length) return { session: session || null, records: all };
  const head = all[0] && all[0].kind === 'session' ? 1 : 0;
  let size = head ? Buffer.byteLength(JSON.stringify(all[0])) + 1 : 0, from = all.length;
  for (let i = all.length - 1; i >= head; i--) {
    const n = Buffer.byteLength(JSON.stringify(all[i])) + 1;
    if (size + n > max) break;
    size += n; from = i;
  }
  if (from === head) return { session: session || null, records: all };
  const kept = all.length - from;
  return { session: session || null, records: [...all.slice(0, head), ...all.slice(from)], truncated: true, total: all.length - head, kept };
}
/** PURE: the status map, at most STATUS_MAX entries (truncated when more) */
function boundStatus(v, max = STATUS_MAX) {
  const m = v && typeof v === 'object' ? v : {}, keys = Object.keys(m);
  if (keys.length <= max) return { statuses: m };
  const out = {}; for (const k of keys.slice(0, max)) out[k] = m[k];
  return { statuses: out, truncated: true, total: keys.length };
}

const OPENCODE_OPS = {
  state: {
    member: 'state', required: [], build: () => [],
    result: (v) => ({
      installed: !!v?.installed, ready: !!v?.ready, parked: !!v?.parked, parkedKind: v?.parkedKind || null,
      version: v?.version || null, port: v?.port || null, caps: v?.caps || null,
      liveLaneHealthy: !!v?.liveLaneHealthy, pendingQuestions: v?.pendingQuestions || 0,
      busySessions: v?.busySessions || 0, lastError: v?.lastError || null,
    }),
  },
  read: {
    member: 'readConversation', required: ['id'], build: (p) => [String(p.id), {}],
    // the records ARE the payload (the reader replays them); messages are dropped
    // on the wire — they are the same facts, twice, and the big half
    result: (v) => boundRead(v?.session || null, v?.records),   // B-5278: the newest records within READ_MAX
  },
  revert: {
    member: 'revertTo', required: ['id', 'messageID'],
    build: (p) => [String(p.id), { messageID: String(p.messageID), partID: p.partID || null, cwd: p.cwd || null }],
    result: (v) => ({ session: v || null }),
  },
  unrevert: {
    member: 'unrevert', required: ['id'], build: (p) => [String(p.id), { cwd: p.cwd || null }],
    result: (v) => ({ session: v || null }),
  },
  answer: {
    member: 'answerQuestion', required: ['requestId', 'answers'],
    build: (p) => [String(p.requestId), p.answers],
    result: (v) => ({ ok: !!v?.ok, sessionID: v?.sessionID || null, answers: v?.answers || null }),
  },
  reject: {
    member: 'rejectQuestion', required: ['requestId'], build: (p) => [String(p.requestId), {}],
    result: (v) => ({ ok: !!v?.ok, sessionID: v?.sessionID || null }),
  },
  'pty-open': {
    member: 'openPty', required: [],
    build: (p) => [{ cwd: p?.cwd || null, command: p?.command || null, args: Array.isArray(p?.args) ? p.args : null, title: p?.title || null }],
    // NOTE the deliberate asymmetry: `url`/`auth` are how the SERVER connects
    // to the serve's ws. They are returned across a device link (which is
    // already the trusted control plane) and are stripped before anything
    // reaches a browser — see src/server/opencode-access.js.
    result: (v) => ({ pty: v?.pty || null, url: v?.url || null, auth: v?.auth || null, ticketed: !!v?.ticketed }),
  },
  'pty-close': {
    member: 'closePty', required: ['ptyId'], build: (p) => [String(p.ptyId), { cwd: p?.cwd || null }],
    result: (v) => ({ ok: !!v?.ok }),
  },
  'pty-resize': {
    member: 'resizePty', required: ['ptyId'],
    build: (p) => [String(p.ptyId), { rows: Number(p.rows) || 24, cols: Number(p.cols) || 80, cwd: p?.cwd || null }],
    result: (v) => ({ ok: !!v?.ok }),
  },
  status: {
    member: 'statusMap', required: [], build: () => [{}],
    result: (v) => boundStatus(v),   // B-5278: at most STATUS_MAX entries
  },
};

// DELIBERATELY ABSENT: `fork`. The harness descriptor's own `store.forkSession`
// owns forking, and ws-create takes that path only for a LOCAL conversation
// (an explicit `!data.hostId` guard) — a remote fork is refused today, not
// silently done on the wrong machine. A row here that nothing can reach is a
// dead row, and scripts/test-opencode-s9.mjs fails one.
const OPENCODE_OP_NAMES = Object.freeze(Object.keys(OPENCODE_OPS));

/** Validate + normalise wire params for an op. PURE; throws with the op name
 *  and the missing key so a rung never fails as an unexplained 500. */
function checkOpParams(op, params) {
  const def = OPENCODE_OPS[op];
  if (!def) throw new Error(`unknown opencode op '${op}' (known: ${OPENCODE_OP_NAMES.join(', ')})`);
  const p = params && typeof params === 'object' ? params : {};
  for (const k of def.required) {
    const v = p[k];
    if (v === undefined || v === null || v === '') throw new Error(`opencode op '${op}' needs '${k}'`);
  }
  return p;
}

/** Execute one op against a facts object. This is the WHOLE machine-side
 *  implementation: the daemon handler and the local rung both call it, so
 *  "runs where the facts live" is literally the same function. */
async function runOpencodeOp(facts, op, params = {}) {
  const def = OPENCODE_OPS[op];
  const p = checkOpParams(op, params);
  if (typeof facts?.[def.member] !== 'function') throw new Error(`opencode op '${op}' is not available on this machine (no ${def.member})`);
  const out = await facts[def.member](...def.build(p));
  return def.result(out);
}

module.exports = { OPENCODE_OPS, OPENCODE_OP_NAMES, checkOpParams, runOpencodeOp, boundRead, boundStatus, READ_MAX, STATUS_MAX };
