// The CLI's `/model` confirmation echo — ONE parser for every reader (PURE
// tier: no requires; CJS pulled into the browser bundle like search-card.js /
// collab-row.js).
//
// A mid-session model switch (control_request set_model, or a typed /model)
// is confirmed ONLY by a user record the CLI writes:
//   <local-command-stdout>Set model to …</local-command-stdout>
// The control_response says success even for a bogus name, so this echo is
// the authoritative resolution. Three readers used to spell their own regex
// (the status bar, the command-card label, the server's model-lock repin) and
// the CLI changed the spelling under them. The shapes, verbatim from the local
// transcript corpus (2026-09-22, counts are rows; each row's own `version`
// dates it — the plain bare token last appears at 2.1.239, the plain
// alias (id) at 2.1.226, the backticked echo from 2.1.257 on; 2.1.280 is only
// the build on which the miss was NOTICED):
//
//   Set model to claude-fable-5                          bare id        (236)
//   Set model to fable[1m] (claude-fable-5)              alias (id)     last 2.1.226
//   Set model to `opus[1m] (claude-opus-5-5[1m])`        the whole token
//   Set model to `fable[1m] (claude-fable-5-1)`            backticked: first
//                                                          2.1.257 (2026-09-02)
//   Set model to `claude-opus-5`                         backticked bare id (2.1.263)
//   Set model to fable[1m]                               alias only
//   Set model to \x1b[1mFable 5\x1b[22m and saved as your default for new sessions
//   Set model to \x1b[1mOpus 4.7 (1M context) (default)\x1b[22m for this session
//                                                        the TUI picker: a
//                                                        DISPLAY NAME, not a
//                                                        model id ⇒ null
//
// `[1m]` in `opus[1m]` is the 1M-context SUFFIX, not ANSI — ANSI is only ever
// an ESC (\x1b) sequence, so a pre-stripped string keeps its `[1m]` and a raw
// one loses only the escapes. ANSI is handled INSIDE: a bold span
// (\x1b[1m … \x1b[22m) delimits the token exactly as a backtick pair does, so
// `\x1b[1mopus\x1b[22m` parses as the alias `opus`; every other escape is
// stripped. A quoted token (backticks / bold) may be followed by trailing
// prose; an unquoted one must end the line (otherwise "Fable 5 and saved…"
// would read as the alias "Fable").
//
//   parseSetModelEcho(text, {envelope})
//       → { alias, id, quoted } | null
//       alias = the token the CLI named (an alias like `opus[1m]` or a full id);
//       id    = the parenthesised RESOLVED id, or null when the CLI printed
//               none (a bare id / alias-only echo);
//       quoted = the token was backticked or bold.
//       envelope: 'optional' (default) accepts the body with or without the
//       <local-command-stdout> wrapper; 'required' refuses a bare body — every
//       reader of a CHAT RECORD passes 'required', because a user typing the
//       words "Set model to x" is not an echo.
//       Readers want `id || alias` (the status bar) or `id` only (the lock
//       repin upgrades a bare alias to the resolved id).
//   stripSetModelBackticks(label)
//       → the command card's label: the backtick pair (CLI ≥2.1.257) around the
//         model token removed, everything else untouched (a non-echo string
//         comes back as given).
'use strict';

const ANSI_BOLD_SPAN = /\x1b\[1m([^\x1b`]*)\x1b\[22m/g;
const ANSI_ANY = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07/g;
const ENVELOPE = /^<local-command-stdout>([\s\S]*)<\/local-command-stdout>$/;
const PREFIX = 'Set model to ';
// token = one space-free word, optionally followed by " (resolved-id)"
const TOKEN = /^([^\s`()]+)(?: \(([^\s`()]+)\))?$/;
// quoted: `token` then optional trailing prose; unquoted: the token ends the line
const QUOTED = /^`([^`]+)`(?:\s[\s\S]*)?$/;

function parseSetModelEcho(text, opts) {
  if (typeof text !== 'string' || !text) return null;
  const envelope = (opts && opts.envelope) || 'optional';
  let s = text.replace(ANSI_BOLD_SPAN, '`$1`').replace(ANSI_ANY, '').trim();
  const env = ENVELOPE.exec(s);
  if (env) s = env[1].trim();
  else if (envelope === 'required') return null;
  if (!s.startsWith(PREFIX)) return null;
  const rest = s.slice(PREFIX.length).trim();
  let quoted = false, token = rest;
  const q = QUOTED.exec(rest);
  if (q) { quoted = true; token = q[1].trim(); }
  const m = TOKEN.exec(token);
  if (!m) return null;
  return { alias: m[1], id: m[2] || null, quoted };
}

function stripSetModelBackticks(label) {
  if (typeof label !== 'string') return label;
  return label.replace(/^(\s*Set model to )`([^`]*)`/, '$1$2');
}

module.exports = { parseSetModelEcho, stripSetModelBackticks };
