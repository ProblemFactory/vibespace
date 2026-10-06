'use strict';
// THE HARNESS HOOK `artifactsOf(record) → [{path, op: 'write'|'edit', bytes, id}] | []` (lane artifacts-model;
// src/artifacts.js is the reducer it feeds). Each descriptor in src/harnesses/ declares ONE of these readers (or `null`
// = never produces: a plain shell); every caller asks the descriptor, never an id. PURE: a record in, ops out — the
// live stdout consumer, the rebuild's replay and a dead session's history read feed the SAME records here. `id` = the
// call that made the change (a record seen twice — parse + device feed, an ACP tool_call + its update — moves a row once).
const bytesOf = (s) => (typeof s === 'string' ? Buffer.byteLength(s) : null);

/** claude: the assistant record's tool_use blocks — Write births, Edit / MultiEdit / NotebookEdit bump. */
const CLAUDE_OPS = { Write: 'write', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit' };
function claude(record) {
  const r = record || {};
  if (r.type !== 'assistant' || !Array.isArray(r.message && r.message.content)) return [];
  const out = [];
  for (const b of r.message.content) {
    if (!b || b.type !== 'tool_use' || !CLAUDE_OPS[b.name]) continue;
    const inp = b.input || {};
    const path = inp.file_path || inp.notebook_path;
    if (typeof path !== 'string' || !path) continue;
    out.push({ path, op: CLAUDE_OPS[b.name], bytes: b.name === 'Write' ? bytesOf(inp.content) : null, id: b.id || null });
  }
  return out;
}

/** codex: apply_patch — the custom_tool_call envelope ("*** Add File: / *** Update File:") or the live function_call's
 *  JSON {changes:[{path, kind:{type}}]}. A FileChange item is the RESULT of the same call — never counted twice. */
const PATCH_LINE = /^\*\*\* (Add|Update) File: (.+)$/gm;
const CHANGE_OP = { add: 'write', update: 'edit' };
function codex(record) {
  const p = record && record.type === 'response_item' && record.payload;
  if (!p || p.name !== 'apply_patch' || (p.type !== 'custom_tool_call' && p.type !== 'function_call')) return [];
  const id = p.call_id || p.id || null;
  const out = [];
  let args = null;
  if (p.type === 'function_call') { try { args = JSON.parse(p.arguments || '{}'); } catch { args = null; } }
  if (args && Array.isArray(args.changes)) {
    for (const c of args.changes) {
      const op = c && CHANGE_OP[c.kind && c.kind.type];
      if (op && typeof c.path === 'string' && c.path) out.push({ path: c.path, op, bytes: null, id });
    }
    return out;
  }
  const text = typeof p.input === 'string' ? p.input : (args && typeof args.input === 'string' ? args.input : '');
  for (const m of text.matchAll(PATCH_LINE)) out.push({ path: m[2].trim(), op: m[1] === 'Add' ? 'write' : 'edit', bytes: null, id });
  return out;
}

/** ACP: a tool call's `diff` content (oldText null/absent = a new file), or the client-side fs/write_text_file call. */
function acp(record) {
  const r = record || {};
  if (r.method === 'fs/write_text_file' && r.params && typeof r.params.path === 'string') {
    return [{ path: r.params.path, op: 'write', bytes: bytesOf(r.params.content), id: r.id != null ? 'fs:' + r.id : null }];
  }
  const u = r.kind === 'update' ? r.update : (r.params && r.params.update) || null;
  if (!u || (u.sessionUpdate !== 'tool_call' && u.sessionUpdate !== 'tool_call_update') || !Array.isArray(u.content)) return [];
  const out = [];
  for (const c of u.content) {
    if (!c || c.type !== 'diff' || typeof c.path !== 'string' || !c.path) continue;
    out.push({ path: c.path, op: c.oldText == null ? 'write' : 'edit', bytes: bytesOf(c.newText), id: u.toolCallId || null });
  }
  return out;
}

/** lane artifacts-prompt-hint: the tools each reader above witnesses, as the agent knows them — a descriptor declares
 *  its row as `artifactTools` (ACP: the agent's own tool names are not ours to know ⇒ `[]` = unnamed). */
const ARTIFACT_TOOLS = { claude: Object.keys(CLAUDE_OPS), codex: ['apply_patch'], acp: [] };
/** THE ONE agent-facing sentence (tools intro + the task context's tools section, once per session): which writes become
 *  Artifacts. `names` = the session's descriptor `artifactTools` (`[]`/absent = "your file tools"; `null` = a harness with
 *  no artifacts reader ⇒ no line — never promise a collection that cannot happen). English, never through t(). */
function artifactsIntroLine(names) {
  if (names === null) return '';
  const list = Array.isArray(names) && names.length ? ` (${names.join(' / ')})` : '';
  return `Use your file tools${list} for files the user should see — they become this conversation's Artifacts; shell-written files do not.`;
}

module.exports = { claude, codex, acp, ARTIFACT_TOOLS, artifactsIntroLine };
