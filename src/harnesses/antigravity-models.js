'use strict';
// PURE — AGY'S OWN MODEL LIST, PARSED AS DATA (lane agy-models-report, the owner 2026-11-10: «Antigravity 支持的模型为什么
// 是写死的呀？不应该从 Antigravity 自己汇报吗？»). `agy models` (MEASURED on agy 1.5.5, 2026-11-10, a signed-in account):
// a first line «Fetching available models...», then one `<id>\t<label>` row per model the ACCOUNT may use (Gemini and
// non-Gemini — the plan decides), in agy's order; signed out: «Error: Please sign in to view available models. …», rc 0.
// The door (src/server/cli-models-door.js) hands this STDOUT ONLY (no sign-in value is ever read) and keeps the verdict:
//   · 'rows'       — at least one row: { id, label }, deduplicated, agy's order, at most ROWS_MAX;
//   · 'signed-out' — the «Please sign in» line, or no row at all (an answer with nothing to offer is a login's answer);
//   · 'unreadable' — anything else: its first line said (bounded), nothing kept.
// An id matches ID_RE (what agy really lists: gemini-*, claude-*, gpt-oss-* — not only gemini-); a label is at most
// LABEL_MAX characters with no control character or markup — otherwise the row keeps its id as its label; the Unicode
// direction controls are dropped from a label (round 2).
const ID_RE = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
const LABEL_MAX = 60;
const ROWS_MAX = 200;
const WORDS_MAX = 160;
const FETCHING_RE = /^fetching available models/i;
const SIGN_IN_RE = /please sign in/i;
// eslint-disable-next-line no-control-regex
const BAD_LABEL_RE = /[\u0000-\u001f\u007f-\u009f<>]/;

const bounded = (s) => { const one = String(s || '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim(); return one.length > WORDS_MAX ? one.slice(0, WORDS_MAX - 1) + '…' : one; };

// the Unicode direction controls (embeddings, overrides, isolates, the marks): a vendor label never reorders what is drawn
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;
function labelOf(id, raw) {
  const l = String(raw || '').replace(BIDI_RE, '').trim();
  if (!l || BAD_LABEL_RE.test(l)) return id;
  return l.length > LABEL_MAX ? l.slice(0, LABEL_MAX - 1) + '…' : l;
}

/** @param {{code:any, stdout:string}} answer → { verdict:'rows', rows } | { verdict:'signed-out'|'unreadable', why } */
function parseModelsAnswer({ code, stdout } = {}) {
  const rows = [];
  const seen = new Set();
  let other = null;
  for (const raw of String(stdout || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || FETCHING_RE.test(line.trim())) continue;
    if (SIGN_IN_RE.test(line)) return { verdict: 'signed-out', why: bounded(line) };
    const tab = line.indexOf('\t');
    const id = tab < 0 ? '' : line.slice(0, tab).trim();
    if (!ID_RE.test(id)) { if (other == null) other = line; continue; }
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(Object.freeze({ id, label: labelOf(id, line.slice(tab + 1)) }));
    if (rows.length >= ROWS_MAX) break;
  }
  if (rows.length) return { verdict: 'rows', rows };
  if (other == null && (code === 0 || code == null)) return { verdict: 'signed-out', why: 'Antigravity listed no models for this sign-in' };
  return { verdict: 'unreadable', why: bounded(other != null ? other : `exit ${code}`) };
}

module.exports = { parseModelsAnswer, ID_RE, LABEL_MAX, ROWS_MAX, WORDS_MAX, BIDI_RE };
