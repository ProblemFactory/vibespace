'use strict';
// THE HELPER DOOR `helperTranscriptsOf(record, ctx) → [{file, via}]` (lane artifacts-handover): a parent record that ENDS
// a helper names the helper's own transcript, so the artifact registry reads its write records through the SAME hook
// (`artifactsOf`) and witnesses them as the PARENT's rows with `via: {kind: 'subagent', name}` (src/artifacts.js). The
// live stream carries a Task's tool_use + its result; the subagent's Write lives in its sidechain file
// (<projects>/<project>/<sid>/subagents/agent-<id>.jsonl, linked by agent-<id>.meta.json's `toolUseId`; a workflow run's
// agents under subagents/workflows/<wf>/ — the usage walker's 2.265.0 walk is the precedent for FINDING them).
//   · a tool_result carrying `agentId` (toolUseResult / tool_use_result — a Task / Agent call ended, or launched in the
//     background) whose tool_use_id an agent's meta names; every other tool's result is answered [] without a disk read
//   · a task-notification user record naming that tool-use id (a background agent / a workflow run ended)
//   · a tool_result saying "Run ID: wf_…" REMEMBERS the run under its tool-use id (ctx.runs) — its notification reads
//     every agent of the run
// `ctx` = {sessionId, cwd, home, runs: Map}; this machine's disk only (a remote conversation's sidechains are not
// fetched — none is read). A record that ends nothing ⇒ []. Never throws.
const fs = require('fs');
const path = require('path');

const RUN_ID = /Run ID: (wf_[\w-]+)/;
const NOTE_TUID = /<tool-use-id>([\s\S]*?)<\/tool-use-id>/;
const SID = /^[0-9a-f-]{36}$/i;
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (x && typeof x.text === 'string' ? x.text : '')).join('\n') : '');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const projDirOf = (cwd) => String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');

/** The conversation's subagents dir (the cwd's project dir first, then any project dir holding the session). */
function subagentsDir(ctx) {
  const sid = String((ctx && ctx.sessionId) || '');
  if (!SID.test(sid)) return null;
  const projects = path.join((ctx && ctx.home) || require('os').homedir(), '.claude', 'projects');
  const first = path.join(projects, projDirOf(ctx.cwd), sid, 'subagents');
  if (ctx.cwd && fs.existsSync(first)) return first;
  try { for (const d of fs.readdirSync(projects)) { const p = path.join(projects, d, sid, 'subagents'); if (fs.existsSync(p)) return p; } } catch { }
  return null;
}
/** The agents of a dir: [{file, meta}] (agent-<id>.jsonl beside agent-<id>.meta.json). */
function agentsIn(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => /^agent-[\w-]+\.jsonl$/.test(n)).map((n) => ({ file: path.join(dir, n), meta: readJson(path.join(dir, n.replace(/\.jsonl$/, '.meta.json'))) || {} }));
}
const nameOf = (meta) => String((meta && (meta.description || meta.agentType)) || 'subagent');

function claude(record, ctx = {}) {
  const r = record || {};
  if (r.type !== 'user' || !r.message) return [];
  const content = r.message.content;
  const ended = []; // tool-use ids this record ends
  let note = false;
  const res = r.toolUseResult || r.tool_use_result; // the transcript's / the stream's spelling — a Task / Agent result carries `agentId`
  const isAgentResult = !!(res && typeof res === 'object' && typeof res.agentId === 'string' && res.agentId);
  if (Array.isArray(content)) {
    for (const b of content) {
      if (!b || b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue;
      const m = RUN_ID.exec(textOf(b.content));
      if (m && ctx.runs) { ctx.runs.set(b.tool_use_id, m[1]); continue; } // a workflow LAUNCH: its agents end at the notification
      if (isAgentResult) ended.push(b.tool_use_id); // any other tool's result never touches the disk
    }
  }
  const t = typeof content === 'string' ? content : '';
  if ((r.origin && r.origin.kind === 'task-notification') || /^\s*<task-notification>/.test(t)) {
    const m = NOTE_TUID.exec(t);
    if (m) { ended.push(m[1].trim()); note = true; }
  }
  if (!ended.length) return [];
  const sid = r.sessionId || r.session_id || ctx.sessionId;
  const dir = subagentsDir({ ...ctx, sessionId: sid });
  if (!dir) return [];
  const out = [];
  const agents = agentsIn(dir);
  for (const tuid of ended) {
    for (const a of agents) if (a.meta.toolUseId === tuid) out.push({ file: a.file, via: { kind: 'subagent', name: nameOf(a.meta) } });
    const wf = note && ctx.runs ? ctx.runs.get(tuid) : null;
    if (wf && /^wf_[\w-]+$/.test(wf)) for (const a of agentsIn(path.join(dir, 'workflows', wf))) out.push({ file: a.file, via: { kind: 'subagent', name: nameOf(a.meta), wf } });
  }
  return out;
}
/** A helper transcript's records (bounded: the newest 8 MB of a file). */
function readRecords(file, max = 8 * 1024 * 1024) {
  let text = '';
  try { const st = fs.statSync(file); const fd = fs.openSync(file, 'r'); const n = Math.min(st.size, max); const buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, st.size - n); fs.closeSync(fd); text = buf.toString('utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { } }
  return out;
}

module.exports = { claude, readRecords, subagentsDir };
