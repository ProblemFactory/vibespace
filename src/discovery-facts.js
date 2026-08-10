'use strict';
/**
 * Shared discovery FACT extractors (CS separation, 2.278.0;
 * docs/design-cs-unification.md row "Session discovery facts").
 *
 * Discovery has three fact collectors — the local sweep (routes/sessions.js,
 * hot-path optimized: async parallel probes, B-2104 procStart verification,
 * tmux), the device daemon's discovery-snapshot (agentd.js, bundled by
 * esbuild), and the ssh script (hosts.js, the no-daemon fallback). The
 * COLLECTORS legitimately differ in transport and richness; what must never
 * differ is the INTERPRETATION of the same bytes. It did:
 *
 *  - naming: local took the FIRST LINE of the first real user message; the
 *    remote parser whitespace-collapsed the WHOLE message — the same session
 *    could be named differently depending on which machine it ran on;
 *  - tail-ids: three implementations (session-store full list / agentd
 *    uniq+last-8 / ssh grep|uniq|tail-8) feeding ONE consumer (claimJsonls)
 *    with subtly different mention windows;
 *  - the daemon's lock scan verified only pid LIVENESS — a recycled pid on a
 *    device produced a phantom "running" session, the exact hole the local
 *    sweep closed years ago ("verify process is actually claude").
 *
 * This module is deliberately tiny (fs/child_process only) so the daemon
 * bundle can carry it: the agentd bundle is built by esbuild from src/, so —
 * unlike the ssh one-file scanner — it CAN share code. Every rule below has
 * exactly one home.
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const NAME_MAX = 80;

/** sessionIds appearing in a transcript's TAIL text, uniq-collapsed by run
 *  (records from one session are consecutive), last `max` runs. The LAST id
 *  is the current writer; earlier ones are mentions. Matches the ssh script's
 *  `grep -o | uniq | tail -8` exactly. */
function extractTailIds(text, max = 8) {
  const ids = [];
  const re = /"sessionId":"([\w-]+)"/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    if (ids[ids.length - 1] !== m[1]) ids.push(m[1]);
  }
  return ids.slice(-max);
}

/** The ONE naming rule: first non-empty LINE of a real user message, trimmed,
 *  ≤80 chars; injected <…>-tag context/reminders and slash-command echoes are
 *  not names. Takes a PARSED user record. Returns string|null. */
function nameFromUserRecord(d) {
  const msg = d?.message;
  if (!msg || !msg.content) return null;
  const content = Array.isArray(msg.content)
    ? (msg.content.find((c) => c && c.type === 'text')?.text || '')
    : String(msg.content);
  return nameFromText(content);
}

function nameFromText(text) {
  const firstLine = String(text || '').split('\n').find((l) => l.trim()) || '';
  const cand = firstLine.trim().slice(0, NAME_MAX).trim();
  if (!cand || cand.startsWith('<') || cand.startsWith('/')) return null;
  return cand;
}

/** Same rule over a RAW JSONL line that may be TRUNCATED (the ssh script caps
 *  N lines at ~1500-2000 bytes, so JSON.parse can fail) — full parse first,
 *  regex fallback for cut lines. */
function nameFromUserLine(line) {
  const s = String(line || '');
  try { return nameFromUserRecord(JSON.parse(s)); } catch { }
  // Truncated lines: prefer a properly closed string, but a cut that lands
  // MID-STRING leaves no closing quote — the old parser's regex required one
  // and silently named nothing. The first line is all we need, so an
  // unterminated tail is fine.
  const m = s.match(/"content":"((?:[^"\\]|\\.)*)"/) || s.match(/"text":"((?:[^"\\]|\\.)*)"/)
    || s.match(/"content":"((?:[^"\\]|\\.)*)/) || s.match(/"text":"((?:[^"\\]|\\.)*)/);
  if (!m) return null;
  let frag = m[1].replace(/\\$/, ''); // a cut mid-escape leaves a lone backslash
  let text;
  try { text = JSON.parse('"' + frag + '"'); }
  catch { text = frag.replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\"/g, '"'); }
  return nameFromText(text);
}

/** Portable "is this pid actually claude" — /proc on Linux (zero fork),
 *  `ps -o comm=` elsewhere. The verification the local sweep has had since
 *  the PID-reuse fix and the daemon snapshot never had. */
function pidLooksClaude(pid) {
  try {
    const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf-8').trim();
    if (comm) return comm.includes('claude') || cmdlineLooksClaude(pid);
  } catch { }
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf-8', timeout: 2000 }).trim();
    return cmd === 'claude' || cmd.includes('claude');
  } catch { return false; }
}

function cmdlineLooksClaude(pid) {
  try { return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').includes('claude'); } catch { return false; }
}

module.exports = { extractTailIds, nameFromUserRecord, nameFromUserLine, nameFromText, pidLooksClaude, NAME_MAX };
