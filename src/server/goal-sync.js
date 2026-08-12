'use strict';
// GOAL-STATUS SYNC (extracted verbatim from server.js, decomposition #2).
// ORCH tier: reads the session transcript tail for the JSONL-only goal_status
// attachments (never on stream-json stdout) and mirrors them into wrapper
// meta + client broadcasts.
const fs = require('fs');
const path = require('path');

function create({ hosts, broadcastToSession, findSessionJsonlPath }) {
// ── Native goal status sync (Claude) ──
// /goal runs natively in the CLI (Stop hook drives continuation + met
// detection), but goal_status attachments are JSONL-only — they are NOT
// emitted on stream-json stdout (same gap class as subagent messages,
// anthropics/claude-code#8262). After each turn we tail the session JSONL for
// the newest goal_status and sync session state from it.
function checkClaudeGoalStatus(session, id) {
  if (!session.claudeSessionId) return;
  // Remote session: goal_status attachments land in the transcript ON THE
  // HOST — the local data/remote-jsonl cache only refreshes at attach/history
  // fetches, so met-detection could lag arbitrarily (audit 2.192.0). Kick a
  // throttled background refresh; this pass tail-reads whatever is cached and
  // the next result-triggered check sees the refreshed file.
  if (session.host && hosts) {
    const now = Date.now();
    if (!session._goalJsonlFetchAt || now - session._goalJsonlFetchAt > 30000) {
      session._goalJsonlFetchAt = now;
      hosts.fetchSessionJsonl(session.host, session.claudeSessionId).catch(() => {});
    }
  }
  try {
    const fp = findSessionJsonlPath(session.claudeSessionId, session.cwd || '');
    if (!fp) return;
    const stat = fs.statSync(fp);
    const TAIL = 65536;
    let content;
    if (stat.size > TAIL) {
      const fd = fs.openSync(fp, 'r');
      try {
        const buf = Buffer.alloc(TAIL);
        const n = fs.readSync(fd, buf, 0, TAIL, stat.size - TAIL);
        content = buf.toString('utf-8', 0, n);
        content = content.slice(content.indexOf('\n') + 1);
      } finally { fs.closeSync(fd); }
    } else {
      content = fs.readFileSync(fp, 'utf-8');
    }
    // Newest goal_status record wins
    let latest = null;
    for (const line of content.split('\n')) {
      if (!line.includes('"goal_status"')) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === 'attachment' && rec.attachment?.type === 'goal_status') latest = rec;
      } catch {}
    }
    if (!latest || latest.uuid === session._lastGoalStatusUuid) return;
    session._lastGoalStatusUuid = latest.uuid;
    const a = latest.attachment;
    const prevGoal = session._goal;
    if (a.durationMs) session._goalElapsed = a.durationMs;
    if (a.tokens) session._goalTokensUsed = a.tokens;
    if (a.met) {
      if (prevGoal) session._prevGoal = prevGoal;
      session._goal = null;
      session._goalStatus = 'complete';
      const reason = (a.reason || '').slice(0, 300);
      broadcastToSession(session, id, {
        type: 'goal-updated', sessionId: id, goal: null, goalStatus: 'complete',
        goalElapsed: session._goalElapsed || 0,
        statusMsg: `Goal met: ${a.condition}${reason ? `\n${reason}` : ''}`,
      });
      // Sync the wrapper meta too — the CLI already cleared its goal natively,
      // but the wrapper can't see that (attachments are JSONL-only). Without
      // this, a server restart would restore a stale "active" goal from meta.
      // (/goal clear on an already-cleared goal is a synthetic no-op.)
      if (session.pty) { try { session.pty.write(JSON.stringify({ type: 'set-goal', goal: null }) + '\n'); } catch {} }
    } else if (a.condition) {
      const changed = session._goal !== a.condition;
      session._goal = a.condition;
      session._goalStatus = 'active';
      if (changed || a.durationMs) {
        broadcastToSession(session, id, {
          type: 'goal-updated', sessionId: id, goal: a.condition, goalStatus: 'active',
          goalElapsed: session._goalElapsed || 0,
          statusMsg: a.sentinel && changed ? `Goal set: ${a.condition}` : null,
        });
      }
    }
  } catch {}
}

  return { checkClaudeGoalStatus };
}
module.exports = { create };
