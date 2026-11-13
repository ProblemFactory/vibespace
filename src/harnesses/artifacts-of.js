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
const { agyFilePath } = require('../agy-tool-args.js'); // lane agy-card-details: decode a store value + percent-decode a file: URI (shared with the store)
// lane artifacts-by-intent: a link in the PERSON's own message is tagged `by: 'user'` (theirs — never «for you»)
const presentOps = (texts, by = '') => { const out = []; for (const s of texts) for (const l of pageLinksIn(s)) { const o = presentOp(l); if (o) out.push(by === 'user' ? { ...o, by } : o); } return out; };
const textBlocks = (content, types) => (typeof content === 'string' ? [content] : Array.isArray(content) ? content.filter((b) => b && types.includes(b.type) && typeof b.text === 'string').map((b) => b.text) : []);
// WHO WROTE A USER-ROLE MESSAGE (lane artifacts-by-intent r3): its PROVENANCE, never the record's type — a peer's
// vibespace-msg send, a group report, VibeSpace's notice / note / continue and a background task's wake all arrive as
// user records. THE verdict the chat and the minimap ask (assistant-note personRow) over THE message each normalizer
// makes of the record (message-manager userRecordOf + applyPeerOrigin / codex-message-manager userItemOf); a delivery
// whose stamp a transport dropped is told by the server's frame at its start (codex-message-manager opensWithServerFrame
// — never on a message sent from our composer). → 'user' (the person typed it) | '' (an agent's words) | null (the CLI's
// compaction summary: a retelling of the conversation — it witnesses nothing). Lazy: the normalizers are SHARED peers;
// each require a LITERAL (r4) — the device's bundle carries the module (esbuild resolves a literal require wherever it
// sits; a variable one is left to the runtime, where '../message-manager.js' is no file beside the bundle).
const lazy = (load) => { let m = null; return () => m || (m = load()); };
const MM = lazy(() => require('../message-manager.js')), CMM = lazy(() => require('../codex-message-manager.js')), NOTE = lazy(() => require('../assistant-note.js'));
const { parseReply, uncut: uncutText } = require('../inbox-reply-text.js'); // PURE: THE For-you reply's grammar (personRow reads the same) + its cut mark's reader (r6)
function authorOf(msg, text, ours) {
  const who = NOTE().personRow(msg);
  if (who.why === 'compact') return null;
  return who.person && (ours || !CMM().opensWithServerFrame(text)) ? 'user' : '';
}
function claudeAuthor(r) {
  const u = MM().userRecordOf(r);
  if (u.nudge) return ''; // the safety stop's note to the model (it joins the stop card): the CLI's words, never the person's
  const msg = { role: 'user', content: [{ type: 'text', text: u.text }], ...u.stamps, ...(u.synthetic ? { synthetic: true } : {}) };
  if (u.peer) MM().applyPeerOrigin(msg, u.peer.po, u.peer.said);
  return authorOf(msg, u.text, !!r._fromWebui);
}
function codexAuthor(p) {
  const u = CMM().userItemOf(p);
  if (!u) return null; // the goal's auto-continue: never a message
  return authorOf({ role: 'user', content: u.content, ...u.stamps }, textBlocks(p.content, ['input_text']).join('\n'), !!u.webuiMsgId);
}
// A FOR-YOU TRAY ANSWER is ONE message with TWO authors (r4): composeReply quotes the ask above the person's answer —
// its text and up to DETAIL_QUOTE_CAP chars of its detail, the ITEM's words (the agent's when the item is its ask — r10).
// The grammar that recognises the reply (parseReply) splits them: a link in the quote is the quoted item's, a link in the
// answer lines the person's. A detail the cap CUT ends in a token cut through (parseReply's `cutAt`): it is no word —
// dropped, so a longer token cut down to a link's length births no row (r5; a link the ask carried whole was folded at the ask — presentAsk). r6: so is the token
// the STORE's cut went through (the quoted text kept to TEXT_MAX ends in the cut mark) — the grammar's ONE reader, `uncut`.
// r10: A QUOTE CARRIES THE ORIGIN OF WHAT IT QUOTES — the tray answers a PRODUCER's item too (the browser's lapsed takeover:
// «Page you left it on: …/p/…»), and its words are nobody's showing. Each quote op names the item it quotes (`quote` = the
// item's id, the reply's marker); the registry keeps it as the agent's only when that item is this conversation's ASK
// (src/artifacts.js quotedOps over the ask route's answer — live and at the rebuild), else drops it.
const uncut = (rp) => uncutText(rp.quote, rp.cutAt);
const quoteOps = (rp) => presentOps([uncut(rp)]).map((o) => ({ ...o, quote: rp.id }));
const said = (by, texts) => {
  if (by !== 'user') return by === null ? [] : presentOps(texts, by);
  const out = [];
  for (const s of texts) { const rp = parseReply(s); if (rp) out.push(...quoteOps(rp), ...presentOps([rp.reply], by)); else out.push(...presentOps([s], by)); }
  return out;
};

/** claude: the assistant record's tool_use blocks — Write births, Edit / MultiEdit / NotebookEdit bump. */
const CLAUDE_OPS = { Write: 'write', Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit' };
function claude(record) {
  const r = record || {};
  if (r.type === 'user' && r.message) { const texts = textBlocks(r.message.content, ['text']); return texts.some((s) => pageLinksIn(s).length) ? said(claudeAuthor(r), texts) : []; } // the person's message — or a peer's, a notice, a wake: by its provenance
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
  if (p && p.type === 'message') { const texts = textBlocks(p.content, ['output_text', 'input_text']); return p.role === 'user' && texts.some((s) => pageLinksIn(s).length) ? said(codexAuthor(p), texts) : presentOps(texts); } // a reply / a user-role message by its provenance
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
  if (u && (u.sessionUpdate === 'agent_message_chunk' || u.sessionUpdate === 'user_message_chunk')) { const texts = textBlocks([u.content], ['text']); return u.sessionUpdate === 'user_message_chunk' && texts.some((s) => pageLinksIn(s).length) ? said(authorOf({ role: 'user', content: [{ type: 'text', text: texts.join('') }] }, texts.join(''), false), texts) : presentOps(texts); } // per chunk: a link split across two chunks is not seen; a user chunk by its provenance (the frame at its start)
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
function antigravity(record) {
  const r = record || {};
  const u = r.kind === 'update' ? r.update : null;
  if (!u || u.sessionUpdate !== 'tool_call') return acp(record);
  const op = AGY_OPS[u.title];
  const inp = u.rawInput && typeof u.rawInput === 'object' ? u.rawInput : null;
  if (op && inp) for (const k of AGY_PATH_KEYS) { const path = agyFilePath(inp[k]); if (path) return [{ path, op, bytes: null, id: u.toolCallId || null }]; }
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

module.exports = { claude, codex, acp, antigravity, ARTIFACT_TOOLS, AGY_ARTIFACT_TOOLS, artifactsIntroLine, claudeAuthor, codexAuthor };
