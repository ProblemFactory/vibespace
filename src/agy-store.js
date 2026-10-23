'use strict';
// THE ANTIGRAVITY STORE, READ — PURE (lane agy-subagent-cards, 2026-10-21; the owner, in an Antigravity conversation:
// «使用子代理的时候怎么没有子代理卡片查看细节» / «子代理细节不在你设计的harness框架里吗？»). agy keeps every conversation ON DISK under
// the account's HOME root, <HOME>/.gemini/antigravity-cli/ (MEASURED on the owner's store 2026-10-21, agy 1.4.x — shapes only):
//   conversations/<id>.db       SQLite, table steps(idx, step_type, status, metadata, render_info, step_payload …): the
//                               blobs are protobuf wire format (field names unknown — pbTree below reads what is legible)
//   brain/<id>/.system_generated/logs/transcript.jsonl   ONE legible JSON line per step {step_index, source, type, status,
//                               created_at, content?, thinking?, tool_calls?[{name,args}], truncated_fields?} (append-once;
//                               transcript_full.jsonl = the same untruncated)
//   brain/<parent>/.system_generated/subagents/<sub>.json  {conversationId, subagentDescriptor{typeName, role}, state,
//                               spawnStepIndex (NOT unique — two subs of one call batch shared 187), workspaceUris}
//   brain/<recipient>/.system_generated/messages/<id>.json {id, sender, recipient, timestamp, renderDetails{messageTitle},
//                               content, sourceMetadata.tool{conversationId, stepIndex, toolCall{name, argumentsJson}}} — a
//                               message lives in its RECIPIENT's dir: the parent's TASK for a sub in brain/<sub>/…
//                               (invoke_subagent, stepIndex = the parent's spawning step — UNIQUE per sub), the sub's ANSWER
//                               (send_message) in brain/<parent>/…
// The invoke_subagent tool's own output is only «Created the following subagent: {conversationId, …}» — agy's subagents
// run ASYNC; the answer arrives minutes later as a message, and the sub's state stays SUBAGENT_STATE_ALIVE after it.
// This module PARSES those shapes (text / bytes in, plain rows out — no fs, no sqlite): the machine that holds the store
// does the I/O (data/bin/agy-wrapper.js tails it; the hub's helper door reads a finished sub's transcript), both through
// THESE functions. THE TOKEN LAW: the login file (antigravity-oauth-token) is never a store read — storeReadable refuses
// its name anywhere in a path, and no path this module builds can name it (test-vault-law's control).

const { decodeScalar, normalizeAgyToolArgs } = require('./agy-tool-args.js'); // lane agy-card-details: THE one arg normalizer (JSON-scalar decode + canonical aliases), shared with the wrapper
const TOKEN_FILE = 'antigravity-oauth-token';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (s) => typeof s === 'string' && UUID.test(s);
const SG = '.system_generated';
const ID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const READABLE = [
  new RegExp(`^conversations/${ID}\\.db$`),
  new RegExp(`^brain/${ID}/\\${SG}/(subagents|messages)$`),
  new RegExp(`^brain/${ID}/\\${SG}/(subagents|messages)/[\\w.-]{1,80}\\.json$`),
  new RegExp(`^brain/${ID}/\\${SG}/logs/transcript(_full)?\\.jsonl$`),
];
/** May the store reader open `rel` (a path RELATIVE to <HOME>/.gemini/antigravity-cli)? Only the store's own shapes
 *  above; never the login file, by its name anywhere in the path; never a `..`. */
function storeReadable(rel) {
  const p = String(rel == null ? '' : rel);
  if (!p || p.includes(TOKEN_FILE) || p.split(/[\\/]/).some((seg) => seg === '..' || seg === '.')) return false;
  return READABLE.some((re) => re.test(p));
}
/** A conversation's store paths, relative to the root ('/'-joined; null for an id that is not a conversation id). */
function storePaths(id) {
  if (!isId(id)) return null;
  return {
    db: `conversations/${id}.db`,
    subagents: `brain/${id}/${SG}/subagents`,
    messages: `brain/${id}/${SG}/messages`,
    transcript: `brain/${id}/${SG}/logs/transcript.jsonl`,
    transcriptFull: `brain/${id}/${SG}/logs/transcript_full.jsonl`,
  };
}

const str = (v) => (typeof v === 'string' ? v : '');
const clip = (s, n) => { const t = str(s); return t.length > n ? t.slice(0, n) + '…' : t; };
const parseJson = (t, f = null) => { try { return JSON.parse(t); } catch { return f; } };
const timeOf = (iso) => { const n = Date.parse(str(iso)); return Number.isFinite(n) ? n : null; };

// ── THE WIRE READER (the db's blobs) ──
/** Protobuf bytes → [{f, wt, v}]: v = a Number (varint), a Uint8Array (length-delimited) or null (fixed32/64, skipped).
 *  Throws on a malformed buffer (a blob that is not a message). */
function pbFields(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const out = [];
  let i = 0;
  const varint = () => {
    let v = 0, mul = 1;
    for (let n = 0; n < 10; n++) {
      if (i >= b.length) throw new Error('pb: truncated varint');
      const x = b[i++];
      v += (x & 0x7f) * mul; mul *= 128;
      if (!(x & 0x80)) return v;
    }
    throw new Error('pb: varint too long');
  };
  while (i < b.length) {
    const key = varint(), f = Math.floor(key / 8), wt = key % 8;
    if (f < 1) throw new Error('pb: field 0');
    if (wt === 0) out.push({ f, wt, v: varint() });
    else if (wt === 2) { const n = varint(); if (i + n > b.length) throw new Error('pb: length past the end'); out.push({ f, wt, v: b.subarray(i, i + n) }); i += n; }
    else if (wt === 1 || wt === 5) { i += wt === 1 ? 8 : 4; if (i > b.length) throw new Error('pb: fixed past the end'); out.push({ f, wt, v: null }); }
    else throw new Error(`pb: wire type ${wt}`);
  }
  return out;
}
const UTF8 = typeof TextDecoder === 'function' ? new TextDecoder('utf-8', { fatal: true }) : null;
/** A length-delimited value as TEXT, or null: valid UTF-8, no control byte but \t \n \r, and never STARTING with one (a
 *  nested message's tag byte — render_info's summary {1: "…"} reads "\n\"…" as a string otherwise; measured). */
function legible(u8) {
  if (!UTF8 || !u8.length) return null;
  let s;
  try { s = UTF8.decode(u8); } catch { return null; }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s) || /^[\t\n\r]/.test(s)) return null;
  return s;
}
/** The legible TREE: [{f, kind: 'varint'|'str'|'msg'|'bytes'|'fixed', v, kids?}] — a length-delimited value is a string
 *  when legible, else a nested message when it parses, else bytes. */
function pbTree(bytes, depth = 0) {
  return pbFields(bytes).map(({ f, wt, v }) => {
    if (wt === 0) return { f, kind: 'varint', v };
    if (wt !== 2) return { f, kind: 'fixed', v: null };
    const s = legible(v);
    if (s !== null) return { f, kind: 'str', v: s };
    if (depth < 16) { try { return { f, kind: 'msg', v: null, kids: pbTree(v, depth + 1) }; } catch { /* bytes */ } }
    return { f, kind: 'bytes', v: v.length };
  });
}
/** Every node at a dotted field path ('20.7' = field 20's field 7), in order. */
function pbAll(tree, dotted) {
  let level = Array.isArray(tree) ? tree : [];
  const steps = String(dotted).split('.').map(Number);
  for (let k = 0; k < steps.length; k++) {
    const hits = level.filter((n) => n.f === steps[k]);
    if (k === steps.length - 1) return hits;
    level = hits.flatMap((n) => n.kids || []);
  }
  return [];
}
const pbStr = (tree, dotted) => { const n = pbAll(tree, dotted).find((x) => x.kind === 'str'); return n ? n.v : ''; };
const pbNum = (tree, dotted) => { const n = pbAll(tree, dotted).find((x) => x.kind === 'varint'); return n ? n.v : null; };
/** Every legible string of a blob with its field path — what the report calls «legible». */
function pbStrings(bytes) {
  const out = [];
  const walk = (nodes, pre) => { for (const n of nodes) { const p = pre ? `${pre}.${n.f}` : String(n.f); if (n.kind === 'str') out.push({ path: p, text: n.v }); else if (n.kids) walk(n.kids, p); } };
  try { walk(pbTree(bytes), ''); } catch { /* not a message */ }
  return out;
}

// the db's step_type / status integers (MEASURED: a 231-step parent + a 23-step sub, cross-read against the same steps'
// transcript lines): 14 USER_INPUT · 15 PLANNER_RESPONSE · 23 CHECKPOINT · 101 SYSTEM_MESSAGE · 132 GENERIC (a tool's
// result); status 3 DONE · 5 DONE (every step before the first CHECKPOINT — the transcript says DONE) · 7 ERROR. The db row
// is UPDATED in place (a background command the transcript froze as RUNNING reads DONE there).
const DB_STEP_TYPES = Object.freeze({ 14: 'USER_INPUT', 15: 'PLANNER_RESPONSE', 23: 'CHECKPOINT', 101: 'SYSTEM_MESSAGE', 132: 'GENERIC' });
const DB_STATUS = Object.freeze({ 3: 'DONE', 5: 'DONE', 7: 'ERROR' });
const SOURCE_OF = Object.freeze({ USER_INPUT: 'USER_EXPLICIT', PLANNER_RESPONSE: 'MODEL', GENERIC: 'MODEL', CHECKPOINT: 'SYSTEM', SYSTEM_MESSAGE: 'SYSTEM' });
/** A db steps row {idx, step_type, status, metadata, render_info, step_payload} → the transcript-shaped step (the same
 *  shape transcriptStepOf answers) + the render words only the db carries (verb «Ran», summary, terminal command). The
 *  field paths are the measured ones: payload 5 = metadata (5.1 = created {1 s, 2 ns}), 20 = a planner response
 *  {1 text, 3 thinking, 7 tool call {1 id, 2 name, 3 argsJson}}, 114 = a message {1 text}, 140.2 = a tool result
 *  {1 output}; render_info {5 verb, 6 icon, 7 category, 9.1 summary, 10.3 terminal {1 command, 3 exit code}}. */
function dbStepOf(row) {
  const r = row || {};
  const tree = (b) => { try { return b ? pbTree(b) : []; } catch { return []; } };
  const pay = tree(r.step_payload), meta = tree(r.metadata), ren = tree(r.render_info);
  const type = DB_STEP_TYPES[Number(r.step_type)] || `STEP_TYPE_${Number(r.step_type)}`;
  const sec = pbNum(meta, '1.1') ?? pbNum(pay, '5.1.1'), ns = pbNum(meta, '1.2') ?? pbNum(pay, '5.1.2') ?? 0;
  const calls = pbAll(pay, '20.7').map((n) => ({ name: pbStr(n.kids || [], '2'), args: parseJson(pbStr(n.kids || [], '3'), {}) || {} })).filter((c) => c.name);
  const text = type === 'GENERIC' ? pbStr(pay, '140.2.1') : (pbStr(pay, '20.1') || pbStr(pay, '20.8') || pbStr(pay, '114.1'));
  return {
    idx: Number(r.idx), source: SOURCE_OF[type] || 'MODEL', type, status: DB_STATUS[Number(r.status)] || `STATUS_${Number(r.status)}`,
    at: sec != null ? sec * 1000 + Math.floor(ns / 1e6) : null,
    content: text, thinking: pbStr(pay, '20.3'), toolCalls: calls,
    verb: pbStr(ren, '5') || pbStr(pay, '140.2.3.5'), summary: pbStr(ren, '9.1') || pbStr(pay, '140.2.3.9.1'),
    command: pbStr(ren, '10.3.1'), exitCode: pbNum(ren, '10.3.3'),
  };
}

// ── THE TRANSCRIPT (legible) ──
/** One transcript.jsonl line (text or parsed) → the step, or null. */
function transcriptStepOf(line) {
  const r = typeof line === 'string' ? parseJson(line) : line;
  if (!r || typeof r !== 'object' || !Number.isFinite(Number(r.step_index))) return null;
  return {
    idx: Number(r.step_index), source: str(r.source), type: str(r.type), status: str(r.status), at: timeOf(r.created_at),
    content: str(r.content), thinking: str(r.thinking),
    toolCalls: (Array.isArray(r.tool_calls) ? r.tool_calls : []).filter((c) => c && c.name).map((c) => ({ name: String(c.name), args: c.args && typeof c.args === 'object' ? c.args : {} })),
    error: r.error ? clip(typeof r.error === 'string' ? r.error : JSON.stringify(r.error), 400) : '',
    truncated: Array.isArray(r.truncated_fields) ? r.truncated_fields.map(String) : [],
  };
}
/** A tool result's text without agy's «Created At: …\nCompleted At: …\n» head. */
function resultBody(text) { return str(text).replace(/^Created At: [^\n]*\n(?:Completed At: [^\n]*\n)?/, ''); }
/** «[Message] timestamp=… sender=<id> priority=… content=<text>» (a delivered message inside a SYSTEM_MESSAGE) → parts. */
function deliveredMessageOf(text) {
  const m = /\[Message\] timestamp=(\S+) sender=(\S+) priority=(\S+) content=([\s\S]*)$/.exec(str(text));
  if (!m) return null;
  return { at: timeOf(m[1]), sender: m[2], content: m[4].replace(/\n*<\/SYSTEM_MESSAGE>\s*$/, '') };
}

/** THE ONE tool → ACP kind mapping (the wrapper's tool rows and a sub's timeline). */
function kindOfTool(name) {
  const n = String(name || '').toLowerCase();
  if (/command|shell|terminal/.test(n)) return 'execute';
  if (/write|edit|replace|create|patch/.test(n)) return 'edit';
  if (/view|read|list|grep|find|search|glob/.test(n)) return /search|grep|find|glob/.test(n) ? 'search' : 'read';
  if (/fetch|browser|url|web/.test(n)) return 'fetch';
  return 'other';
}
const clipArgs = (args, n = 400) => Object.fromEntries(Object.entries(args || {}).slice(0, 12).map(([k, v]) => [k, typeof v === 'string' ? clip(v, n) : v]));
const WRITE_TOOLS = /^(write_file|write_to_file|edit_file|replace_file_content|multi_replace_file_content|create_file)$/;
const pathArg = (a) => str(decodeScalar(a && (a.Path || a.TargetFile || a.AbsolutePath || a.path || a.file_path))); // lane agy-card-details: the store road's value is a JSON-encoded string — a quoted path broke the artifacts reader

/** A sub's step → the ACP journal records its virtual session draws (the SAME records the parent's chat reads, so the
 *  view is the ACP normalizer's). `st` carries the open tool calls across steps ({pending: []}); `ctx` = {subId,
 *  parentId, parentName, max, maxSide}: the journal's budget — a message's text clips at `max`, a tool's output / a
 *  thought at `maxSide` (1500), an argument at 400 (the full text stays in the store; measured: 23 steps ≈ 26 KB). */
function stepRecords(step, st, ctx = {}) {
  if (!step) return [];
  const sub = String(ctx.subId || 'sub'), max = Number(ctx.max) || 4000, side = Math.min(max, Number(ctx.maxSide) || 1500); // side = a tool's output, a thought
  const id = `${sub}:${step.idx}`;
  const out = [];
  const upd = (u) => out.push({ type: 'acp', kind: 'update', update: u });
  if (step.type === 'SYSTEM_MESSAGE' || step.type === 'USER_INPUT') {
    const d = step.type === 'SYSTEM_MESSAGE' ? deliveredMessageOf(step.content) : null;
    if (d) {
      const from = d.sender === ctx.parentId ? (ctx.parentName || 'Parent Agent') : `${d.sender.slice(0, 8)}`;
      out.push({ type: 'acp', kind: 'user', msgId: id, peer: { name: from, kind: 'peer', body: clip(d.content, max) }, content: [{ type: 'text', text: clip(d.content, max) }] });
    } else if (step.type === 'USER_INPUT') out.push({ type: 'acp', kind: 'user', msgId: id, content: [{ type: 'text', text: clip(step.content, max) }] });
    else out.push({ type: 'acp', kind: 'notice', level: 'info', text: clip(step.content, Math.min(max, 600)), noticeKind: 'agy-system' });
    return out;
  }
  if (step.type === 'PLANNER_RESPONSE') {
    if (step.thinking) upd({ sessionUpdate: 'agent_thought_chunk', messageId: `${id}:t`, content: { type: 'text', text: clip(step.thinking, side) } });
    if (step.content) upd({ sessionUpdate: 'agent_message_chunk', messageId: id, content: { type: 'text', text: clip(step.content, max) } });
    step.toolCalls.forEach((c, k) => {
      const toolCallId = `${id}:${k}`;
      (st.pending || (st.pending = [])).push(toolCallId);
      upd({ sessionUpdate: 'tool_call', toolCallId, title: c.name, kind: kindOfTool(c.name), status: 'in_progress', rawInput: clipArgs(normalizeAgyToolArgs(c.args)) }); // lane agy-card-details: ONE card shape (Path→file_path, StartLine→offset, CommandLine→command, toolSummary→summary)
    });
    return out;
  }
  if (step.type === 'GENERIC') {
    const toolCallId = (st.pending && st.pending.shift()) || null;
    const status = step.status === 'ERROR' ? 'failed' : step.status === 'RUNNING' ? 'in_progress' : 'completed';
    const body = resultBody(step.content) || step.error;
    const content = body ? [{ type: 'content', content: { type: 'text', text: clip(body, side) } }] : undefined;
    if (toolCallId) upd({ sessionUpdate: 'tool_call_update', toolCallId, status, ...(content ? { content } : {}) });
    else upd({ sessionUpdate: 'tool_call', toolCallId: id, title: step.verb || 'result', kind: 'other', status, ...(content ? { content } : {}) });
    return out;
  }
  if (step.type === 'CHECKPOINT') return out;
  if (step.content) out.push({ type: 'acp', kind: 'notice', level: 'info', text: `${step.type}: ${clip(step.content, 300)}`, noticeKind: 'agy-system' });
  return out;
}
/** THE SENTINEL an ended sub's unfinished tool card carries (lane agy-card-details, gap 5): a sub killed / stopped
 *  mid-step left tool calls with no result — they spun «运行中» for ever. The renderer (src/lib/helper-ask.js
 *  isSubTerminated) turns this exact text into the localized «terminated with the subagent». */
const SUB_TERMINATED = '@@agy-subagent-terminated@@';
/** The closing records for a sub that ENDED with tool calls still open (`st.pending`): each is a `tool_call_update`
 *  status 'failed' carrying the sentinel — never left in_progress. Empties `st.pending`. */
function closePendingRecords(st) {
  const ids = st && Array.isArray(st.pending) ? st.pending.splice(0) : [];
  return ids.map((toolCallId) => ({ type: 'acp', kind: 'update', update: { sessionUpdate: 'tool_call_update', toolCallId, status: 'failed', content: [{ type: 'content', content: { type: 'text', text: SUB_TERMINATED } }] } }));
}
/** The files a step's tool calls WROTE (paths) — the card's list and the helper door's artifacts. */
function writesOf(step) { return (step && step.toolCalls || []).filter((c) => WRITE_TOOLS.test(c.name)).map((c) => pathArg(c.args)).filter(Boolean); }
/** A transcript line as the ACP records the artifacts reader understands (a write = a `diff` block naming its path). */
function artifactRecordsOf(line) {
  const step = transcriptStepOf(line);
  if (!step) return [];
  return step.toolCalls.map((c, k) => ({ c, k })).filter(({ c }) => WRITE_TOOLS.test(c.name) && pathArg(c.args)).map(({ c, k }) => {
    const a = normalizeAgyToolArgs(c.args); // lane agy-card-details: decode the store's JSON-encoded args (the path + the content)
    const newText = typeof a.Content === 'string' ? a.Content : typeof a.ReplacementContent === 'string' ? a.ReplacementContent : typeof a.Replacement === 'string' ? a.Replacement : '';
    const edit = !/^write|^create/.test(c.name);
    // the id names the step, the call AND the path: two subs' writes at the same step index never fold into one row
    return { type: 'acp', kind: 'update', update: { sessionUpdate: 'tool_call', toolCallId: `${step.idx}:${k}:${pathArg(a)}`, title: c.name, kind: 'edit', status: 'completed', content: [{ type: 'diff', path: pathArg(a), oldText: edit ? '' : null, newText }] } };
  });
}

// ── THE SUBAGENT ROWS ──
/** subagents/<id>.json → {id, typeName, role, state, alive, spawnStep, workspaces} | null. */
function subagentRowOf(j) {
  if (!j || typeof j !== 'object' || !isId(j.conversationId)) return null;
  const d = j.subagentDescriptor || {};
  const state = str(j.state) || 'SUBAGENT_STATE_UNSPECIFIED';
  return { id: j.conversationId, typeName: str(d.typeName), role: str(d.role), state, alive: state === 'SUBAGENT_STATE_ALIVE', spawnStep: Number.isFinite(Number(j.spawnStepIndex)) ? Number(j.spawnStepIndex) : null, workspaces: (Array.isArray(j.workspaceUris) ? j.workspaceUris : []).map(String).slice(0, 8) };
}
/** messages/<id>.json → {id, sender, recipient, at, title, content, conv, step, tool, args} | null. */
function messageRowOf(j) {
  if (!j || typeof j !== 'object' || !isId(j.id)) return null;
  const t = (j.sourceMetadata && j.sourceMetadata.tool) || {};
  const call = t.toolCall || {};
  return { id: j.id, sender: str(j.sender), recipient: str(j.recipient), at: timeOf(j.timestamp), title: str(j.renderDetails && j.renderDetails.messageTitle), content: str(j.content), conv: str(t.conversationId), step: Number.isFinite(Number(t.stepIndex)) ? Number(t.stepIndex) : null, tool: str(call.name), args: parseJson(str(call.argumentsJson), {}) || {} };
}
/** The parent's TASK for a sub (read from the SUB's messages): invoke_subagent from the parent; `step` (the parent's
 *  spawning step) when known — the one link that is unique per sub. The earliest when several. */
function taskOf(messages, { parentId, subId, step = null } = {}) {
  const hits = (messages || []).filter((m) => m && m.recipient === subId && m.sender === parentId && m.tool === 'invoke_subagent' && (step == null || m.step === step));
  return hits.sort((a, b) => (a.at || 0) - (b.at || 0))[0] || null;
}
/** The sub's ANSWERS (read from the PARENT's messages): what it sent its parent, oldest first. */
function answersOf(messages, { parentId, subId } = {}) {
  return (messages || []).filter((m) => m && m.sender === subId && (!parentId || m.recipient === parentId)).sort((a, b) => (a.at || 0) - (b.at || 0));
}
/** «Created the following subagent: {"conversationId": …}» (the invoke_subagent tool's own output) → the sub's id. */
function createdSubagentOf(text) {
  const m = /Created the following subagent:\s*(\{[\s\S]*?\n\})/.exec(str(text)) || /"conversationId":\s*"([0-9a-f-]{36})"/i.exec(str(text));
  if (!m) return null;
  const j = m[1].startsWith('{') ? parseJson(m[1]) : { conversationId: m[1] };
  return j && isId(j.conversationId) ? j.conversationId : null;
}
/** The ids a stream's subagent_info names, if any field carries one (its shape is unmeasured; never a guess beyond
 *  an id-shaped value under an id-ish key). */
function subagentInfoIds(info) {
  const list = Array.isArray(info) ? info : (info && Array.isArray(info.subagents) ? info.subagents : []);
  return list.map((x) => x && (x.conversation_id || x.conversationId || x.id)).filter(isId);
}
/** Is the sub still WORKING? Its last step is a final planner response (DONE, no tool call) ⇒ idle — it has answered or
 *  stopped; a sub with no step yet is working (just spawned). */
function subPhaseOf(lastStep) {
  if (!lastStep) return 'working';
  return lastStep.type === 'PLANNER_RESPONSE' && lastStep.status !== 'RUNNING' && !lastStep.toolCalls.length ? 'idle' : 'working';
}
/** A stopped sub's LAST PROGRESS for its parent card (lane agy-card-details gap 5): the last planner prose, else the
 *  last tool's own words (toolSummary / toolAction / name) — a killed research sub that only ever read files still
 *  says what it was last doing, never a bare «它没有发回答复». */
function lastProgressOf(lastStep) {
  if (!lastStep) return '';
  if (typeof lastStep.content === 'string' && lastStep.content.trim()) return clip(lastStep.content, 2000);
  const tcs = Array.isArray(lastStep.toolCalls) ? lastStep.toolCalls : [];
  const tc = tcs[tcs.length - 1];
  if (tc) { const a = normalizeAgyToolArgs(tc.args); return clip(str(a.summary || a.title || tc.name), 300); }
  return '';
}
/** THE CARD the parent conversation shows for one subagent (the journal's `subagent` record). */
function cardOf({ toolCallId, row, task, answer, lastStep, startedAt = null, steps = 0, files = [], now = 0, ended = false } = {}) {
  const st = row ? row.state : 'SUBAGENT_STATE_UNSPECIFIED';
  const phase = subPhaseOf(lastStep);
  let status = 'running';
  if (row && !row.alive && st !== 'SUBAGENT_STATE_UNSPECIFIED') status = /FAIL|ERROR/.test(st) ? 'failed' : /KILL|CANCEL|STOP|ABORT/.test(st) ? 'stopped' : 'completed';
  else if (ended || phase === 'idle') status = 'completed';
  const start = startedAt || (task && task.at) || null;
  const end = status === 'running' ? null : ((lastStep && lastStep.at) || now || null);
  return {
    toolCallId: toolCallId || null, subId: row ? row.id : null,
    role: row ? clip(row.role, 200) : '', typeName: row ? clip(row.typeName, 80) : '', state: st,
    spawnStep: task && task.step != null ? task.step : (row ? row.spawnStep : null),
    task: task ? clip(task.content, 6000) : '', taskTitle: task ? clip(task.title, 200) : '',
    status, startedAt: start, endedAt: end, elapsedMs: start && end ? Math.max(0, end - start) : null,
    result: answer ? clip(answer.content, 20000) : '', lastText: answer ? '' : lastProgressOf(lastStep), steps, files: (files || []).slice(-20),
  };
}

// ── ALREADY RAN (the cards' addendum, 2026-10-22): an invoke_subagent row the journal holds with NO card — a sub that ran
// under a wrapper older than the cards (dtach keeps a running wrapper's code across an update). The hub draws it from the
// store anyway (src/agy-backfill.js), the SAME card and sub steps the wrapper's tail builds, read whole at once. ──
/** The journal's invoke_subagent rows that no `subagent` record names: [{toolCallId, parentId, step, ts}] — the
 *  wrapper's row key is `<conversation>:<step>`, the parent's spawning step its sub's TASK names. */
function unlinkedSpawns(records) {
  const carded = new Set(), out = [];
  for (const r of records || []) if (r && r.kind === 'subagent' && r.toolCallId) carded.add(String(r.toolCallId));
  for (const r of records || []) {
    const u = r && r.kind === 'update' && r.update;
    if (!u || u.sessionUpdate !== 'tool_call' || u.title !== 'invoke_subagent' || carded.has(String(u.toolCallId))) continue;
    const m = /^([0-9a-f-]{36}):(\d{1,6})$/i.exec(String(u.toolCallId || ''));
    if (m && isId(m[1]) && !out.some((x) => x.toolCallId === u.toolCallId)) out.push({ toolCallId: u.toolCallId, parentId: m[1], step: Number(m[2]), ts: r.ts || null });
  }
  return out;
}
/** The sub a parent's invoke_subagent STEP created, BY ID: the step's own output in the parent transcript names it
 *  («Created the following subagent: {conversationId}» — createdSubagentOf). The link the stream-vs-transcript index
 *  drift cannot break (lane agy-card-details gap 4; MEASURED on the owner's store: the stream toolCallId said :24/:25,
 *  the transcript's GENERIC result sat at step 24/25, the sub rows' spawnStepIndex BOTH said 27 — only the output's own
 *  id is sure, and it is unique per call). null when the step named none (an older agy, another store). */
function subIdForStep(read, parentId, step) {
  const pp = read && storePaths(parentId);
  if (!pp || !Number.isFinite(Number(step))) return null;
  const lines = read.allLines(pp.transcript) || [];
  for (const line of lines) { const s = transcriptStepOf(line); if (s && s.idx === Number(step) && s.type === 'GENERIC') { const id = createdSubagentOf(s.content); if (id) return id; } }
  return null;
}
/** ONE sub read whole from the store — what the wrapper's adopt + tail journal step by step, at once. `read` = the
 *  machine's gated reader (src/agy-store-fs.js: rows / allLines; a `dbRows` only where a db may be opened — never the
 *  hub's main thread, so the hub draws a sub with no transcript as its card alone); → {subId, card, subs, final} | null
 *  (no sub of `parentId` whose task names `step` — another login's store, an older agy). `subs` = the `sub` records' bodies. */
function snapshotOf(read, { parentId, toolCallId, step, now = 0, max = 4000, maxSteps = 4000 } = {}) {
  const pp = read && storePaths(parentId);
  if (!pp || !Number.isFinite(Number(step))) return null;
  let row = null, task = null;
  const byId = subIdForStep(read, parentId, Number(step)); // lane agy-card-details gap 4: the invoke_subagent output names the sub (link by ID, never the stream step alone)
  if (byId) { const r = subagentRowOf(parseJson(read.read(`${pp.subagents}/${byId}.json`))); if (r) { row = r; task = taskOf(read.rows(storePaths(r.id).messages, messageRowOf), { parentId, subId: r.id }); } }
  if (!row) for (const r of read.rows(pp.subagents, subagentRowOf)) {
    const t = taskOf(read.rows(storePaths(r.id).messages, messageRowOf), { parentId, subId: r.id, step: Number(step) });
    if (t) { row = r; task = t; break; }
  }
  if (!row) return null;
  const sp = storePaths(row.id), lines = read.allLines(sp.transcript);
  const steps = lines ? lines.map(transcriptStepOf) : (read.dbRows ? read.dbRows(sp.db, -1).map(dbStepOf) : []);
  const named = /^Message from (.{1,60})$/.exec(task.title || '');
  const st = { pending: [] }, subs = [], files = [];
  let last = null, n = 0;
  for (const s of steps.slice(0, maxSteps)) {
    if (!s || (last && s.idx <= last.idx)) continue;
    n++; last = s;
    for (const p of writesOf(s)) if (!files.includes(p)) files.push(p);
    for (const rec of stepRecords(s, st, { subId: row.id, parentId, parentName: named ? named[1] : null, max })) subs.push({ subId: row.id, toolCallId, rec });
  }
  const final = !row.alive || subPhaseOf(last) === 'idle';
  const terminated = !row.alive && /KILL|CANCEL|STOP|ABORT|FAIL|ERROR/i.test(String(row.state || '')); // lane agy-card-details gap 5: killed / stopped-with-parent / failed only — NOT an answered sub (agy leaves it ALIVE)
  if (terminated) for (const rec of closePendingRecords(st)) subs.push({ subId: row.id, toolCallId, rec }); // lane agy-card-details gap 5: an ended sub never leaves a tool card «运行中»
  const answers = final ? answersOf(read.rows(pp.messages, messageRowOf), { parentId, subId: row.id }) : [];
  const card = cardOf({ toolCallId, row, task, answer: answers[answers.length - 1] || null, lastStep: last, startedAt: task.at, steps: n, files, now });
  return { subId: row.id, card, subs, final };
}

module.exports = {
  TOKEN_FILE, isId, storeReadable, storePaths,
  pbFields, pbTree, pbAll, pbStrings, dbStepOf, DB_STEP_TYPES, DB_STATUS,
  transcriptStepOf, resultBody, deliveredMessageOf, kindOfTool, stepRecords, writesOf, artifactRecordsOf,
  subagentRowOf, messageRowOf, taskOf, answersOf, createdSubagentOf, subagentInfoIds, subPhaseOf, cardOf,
  unlinkedSpawns, snapshotOf, subIdForStep, closePendingRecords, SUB_TERMINATED,
  decodeScalar, normalizeAgyToolArgs,
};
