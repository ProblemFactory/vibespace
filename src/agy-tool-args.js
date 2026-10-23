'use strict';
// THE AGY TOOL ARGUMENT NORMALIZER (lane agy-card-details, 2026-10-22 — the owner, in an Antigravity conversation with two
// screenshots: «你 review 一下 agy 支持，我发现很多卡片都缺少细节»). agy's tool arguments reach a card by TWO roads with
// DIFFERENT shapes:
//   · the LIVE stream (the wrapper's tool_info.parameters): agy's own keys, CLEAN values — {Path, CommandLine, StartLine, …};
//   · the STORE (the db step args / a transcript step's tool_calls[].args): the SAME keys but every value a JSON-ENCODED
//     STRING — "Path":"\"/home/x\"", "StartLine":"1", "CommandLine":"\"ls -la\"", "Content":"\"# …\"" (MEASURED on the
//     owner's store 2026-10-22: the parent's 32 read_file calls each carried a \"-wrapped Path, every StartLine/EndLine a
//     quoted integer, run_command's CommandLine / toolSummary \"-wrapped).
// ONE normalizer BOTH roads pass, so a card reads ONE shape (the invariant: a harness's tool arguments are normalized
// once). It (1) DECODES a value that is a JSON-encoded SCALAR to that scalar — never an object / array, so a blob argument
// keeps its string — and (2) gives agy's keys the card's CANONICAL aliases (file_path / command / cwd / offset / limit /
// title / summary) while KEEPING the raw keys (decoded), which ride the card's 技术细节 fold. PURE: no I/O, no builtin — the
// wrapper (where agy runs) and the store (src/agy-store.js) both call it; test-architecture keeps it in the PURE set.

/** A value that is a JSON-encoded SCALAR → that scalar (a string / finite number / boolean / null); anything else is
 *  returned unchanged. Only a STRING is ever parsed, and only to a scalar — an object / array arg keeps its string, and a
 *  clean value ("/home/x", "ls -la", a path that starts with a digit) is not valid JSON so it stays itself. (A clean
 *  value that is ITSELF a bare JSON literal — the command "42" — would decode to 42; agy's store never carries one, and a
 *  bare-literal command is vanishingly rare; the renderer Strings() it either way.) */
function decodeScalar(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!/^(?:".*"|-?\d[\d.eE+-]*|true|false|null)$/s.test(s)) return v; // a bare path / command never looks like JSON
  try {
    const p = JSON.parse(s);
    if (p === null || typeof p === 'string' || typeof p === 'boolean') return p;
    if (typeof p === 'number' && Number.isFinite(p)) return p;
    return v;
  } catch { return v; }
}

const FILE_KEYS = ['Path', 'AbsolutePath', 'TargetFile', 'FilePath'];
const firstOf = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return undefined; };

/** agy's raw tool arguments → {canonical aliases first, then the decoded raw keys}. `raw` not an object ⇒ {}. The
 *  aliases a card's head / words read; the raw keys stay for its 技术细节 fold. Idempotent (a second pass is a no-op). */
function normalizeAgyToolArgs(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const dec = {};
  for (const [k, v] of Object.entries(raw).slice(0, 24)) dec[k] = decodeScalar(v);
  const out = {};
  const fp = firstOf(dec, FILE_KEYS); if (fp != null) out.file_path = fp;
  if (dec.CommandLine != null && dec.CommandLine !== '') out.command = dec.CommandLine;
  if (dec.Cwd != null && dec.Cwd !== '') out.cwd = dec.Cwd;
  const start = Number(dec.StartLine); if (dec.StartLine != null && dec.StartLine !== '' && Number.isFinite(start)) out.offset = start;
  const end = Number(dec.EndLine); if (dec.EndLine != null && dec.EndLine !== '' && Number.isFinite(end)) out.limit = end;
  if (dec.toolAction != null && dec.toolAction !== '') out.title = dec.toolAction;
  if (dec.toolSummary != null && dec.toolSummary !== '') out.summary = dec.toolSummary;
  for (const [k, v] of Object.entries(dec)) if (!(k in out)) out[k] = v; // the raw keys (decoded) after the canonical aliases
  return out;
}

/** agy's absolute Path / file: URI → a filesystem path (decoded first, so a \"-wrapped store value is unwrapped); null
 *  when empty or not a local file URI. Shared by the artifacts reader (src/harnesses/artifacts-of.js). */
function agyFilePath(v) {
  const d = decodeScalar(v);
  if (typeof d !== 'string' || !d.trim()) return null;
  if (!/^file:/i.test(d)) return d;
  try { const u = new URL(d); return u.protocol === 'file:' && (!u.host || u.host === 'localhost') ? (decodeURIComponent(u.pathname) || null) : null; } catch { return null; }
}

module.exports = { decodeScalar, normalizeAgyToolArgs, agyFilePath, FILE_KEYS };
