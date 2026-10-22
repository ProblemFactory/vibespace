'use strict';
// THE HARNESS HOOK `artifactsOf(record) → [{path, op: 'write'|'edit', bytes, id} | a `present` op] | []` (lane artifacts-model;
// src/artifacts.js is the reducer it feeds). Each descriptor in src/harnesses/ declares ONE of these readers (or `null`
// = never produces: a plain shell); every caller asks the descriptor, never an id. PURE: a record in, ops out — the
// live stdout consumer, the rebuild's replay and a dead session's history read feed the SAME records here. `id` = the
// call that made the change (a record seen twice — parse + device feed, an ACP tool_call + its update — moves a row once).
const bytesOf = (s) => (typeof s === 'string' ? Buffer.byteLength(s) : null);
// lane pages-chip-groups: a page link in a TEXT block (never a tool call / result) witnesses a page shown here —
// src/artifacts.js pageLinksIn / presentOp turn the text into `present` ops (the registry resolves them at read)
const { pageLinksIn, presentOp } = require('../artifacts.js');
const presentOps = (texts) => { const out = []; for (const s of texts) for (const l of pageLinksIn(s)) { const o = presentOp(l); if (o) out.push(o); } return out; };
const textBlocks = (content, types) => (typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((b) => b && types.includes(b.type) && typeof b.text === 'string').map((b) => b.text) : []);

/** claude: the assistant record's tool_use blocks — Write births, Edit / MultiEdit / NotebookEdit bump. */
const CLAUDE_OPS = { Write: 'write', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit' };
function claude(record) {
  const r = record || {};
  if (r.type === 'user' && r.message) return presentOps(textBlocks(r.message.content, ['text'])); // the user's / a peer's message
  if (r.type !== 'assistant' || !Array.isArray(r.message && r.message.content)) return [];
  const out = [];
  for (const b of r.message.content) {
    if (!b || b.type !== 'tool_use' || !CLAUDE_OPS[b.name]) continue;
    const inp = b.input || {};
    const path = inp.file_path || inp.notebook_path;
    if (typeof path !== 'string' || !path) continue;
    out.push({ path, op: CLAUDE_OPS[b.name], bytes: b.name === 'Write' ? bytesOf(inp.content) : null, id: b.id || null });
  }
  return out.concat(presentOps(textBlocks(r.message.content, ['text'])));
}

/** codex: apply_patch — the custom_tool_call envelope ("*** Add File: / *** Update File:") or the live function_call's
 *  JSON {changes:[{path, kind:{type}}]}. A FileChange item is the RESULT of the same call — never counted twice. */
const PATCH_LINE = /^\*\*\* (Add|Update) File: (.+)$/gm;
const CHANGE_OP = { add: 'write', update: 'edit' };
function codex(record) {
  const p = record && record.type === 'response_item' && record.payload;
  if (p && p.type === 'message') return presentOps(textBlocks(p.content, ['output_text', 'input_text'])); // a reply / the user's message
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
  if (u && (u.sessionUpdate === 'agent_message_chunk' || u.sessionUpdate === 'user_message_chunk')) return presentOps(textBlocks([u.content], ['text'])); // per chunk: a link split across two chunks is not seen
  if (!u || (u.sessionUpdate !== 'tool_call' && u.sessionUpdate !== 'tool_call_update') || !Array.isArray(u.content)) return [];
  const out = [];
  for (const c of u.content) {
    if (!c || c.type !== 'diff' || typeof c.path !== 'string' || !c.path) continue;
    out.push({ path: c.path, op: c.oldText == null ? 'write' : 'edit', bytes: bytesOf(c.newText), id: u.toolCallId || null });
  }
  return out;
}

/** antigravity (lane agy-status-bar-facts — the owner's conversation wrote .md reports and a SKILL.md and showed no
 *  Artifacts chip): agy is not ACP. Its wrapper journals each tool step as an ACP `tool_call` whose title is agy's tool
 *  name and whose rawInput is agy's parameters — never a `diff` content, so the ACP reader saw nothing. MEASURED on the
 *  owner's two conversations (shapes only): the stream names its writes write_file (a new file) and edit_file, each with
 *  an ABSOLUTE `Path` and no content; init.tools lists the model-facing names write_to_file / replace_file_content /
 *  multi_replace_file_content — both families are read. A file: URI is percent-decoded to its path; a relative path is
 *  the conversation cwd's (the reducer resolves it). The row is born on the call, as claude's Write (id = agy's step
 *  key: the call seen twice moves its row once). Every other record goes to the ACP reader (a text chunk's page links). */
const AGY_OPS = { write_file: 'write', write_to_file: 'write', edit_file: 'edit', replace_file_content: 'edit', multi_replace_file_content: 'edit' };
const AGY_PATH_KEYS = ['Path', 'TargetFile', 'AbsolutePath', 'FilePath'];
function agyPath(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  if (!/^file:/i.test(v)) return v;
  try { const u = new URL(v); return u.protocol === 'file:' && (!u.host || u.host === 'localhost') ? decodeURIComponent(u.pathname) || null : null; } catch { return null; }
}
function antigravity(record) {
  const r = record || {};
  const u = r.kind === 'update' ? r.update : null;
  if (!u || u.sessionUpdate !== 'tool_call') return acp(record);
  const op = AGY_OPS[u.title];
  const inp = u.rawInput && typeof u.rawInput === 'object' ? u.rawInput : null;
  if (op && inp) for (const k of AGY_PATH_KEYS) { const path = agyPath(inp[k]); if (path) return [{ path, op, bytes: null, id: u.toolCallId || null }]; }
  return acp(record); // a call that carries an ACP `diff` (a record built from agy's own transcript) reads as ACP's
}

/** lane artifacts-prompt-hint: the tools each reader above witnesses, as the agent knows them — a descriptor declares
 *  its row as `artifactTools` (ACP: the agent's own tool names are not ours to know ⇒ `[]` = unnamed). */
const ARTIFACT_TOOLS = { claude: Object.keys(CLAUDE_OPS), codex: ['apply_patch'], acp: [] };
/** the antigravity reader's tools as agy's MODEL knows them (init.tools) — the names the agent-facing sentence uses */
const AGY_ARTIFACT_TOOLS = ['write_to_file', 'replace_file_content', 'multi_replace_file_content'];
/** THE ONE agent-facing sentence (tools intro + the task context's tools section, once per session): which writes become
 *  Artifacts. `names` = the session's descriptor `artifactTools` (`[]`/absent = "your file tools"; `null` = a harness with
 *  no artifacts reader ⇒ no line — never promise a collection that cannot happen). English, never through t(). */
function artifactsIntroLine(names) {
  if (names === null) return '';
  const list = Array.isArray(names) && names.length ? ` (${names.join(' / ')})` : '';
  return `Use your file tools${list} for files the user should see — they become this conversation's Artifacts; shell-written files do not.`;
}

module.exports = { claude, codex, acp, antigravity, ARTIFACT_TOOLS, AGY_ARTIFACT_TOOLS, artifactsIntroLine };
