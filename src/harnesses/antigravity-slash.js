'use strict';
// ANTIGRAVITY'S OWN SLASH COMMANDS — the CLOSED list agy answers itself (lane agy-slash-guard-paths, 2.369.341). PURE: no
// require, no import — data/bin/agy-wrapper.js reads it beside src/ (as chat-wrapper.js reads claude-transport.js), and the
// descriptor re-exports it (src/harnesses/antigravity.js AGY_SLASH_COMMANDS). ONE definition.
// MEASURED on agy 1.4.3: scripts/fixtures/antigravity-cli-1.4.3.json `slashInPrint.answeredWithoutATurn` (provenance
// 'changelog' — the binary's own `agy changelog`). One of these arriving in the stream ENDS the session (exit 2: the
// fixture's `stream.inputErrors`), so the wrapper keeps it out. A new agy version's new command is a new fixture and a new
// row here (test-agy-harness pins this list to the fixture), never a regex.
// A chat line IS a command only when its first word — up to the first whitespace — is one of these, in any case:
// `/model`, `/usage opus`. Every other line that starts with "/" is TEXT and reaches agy: a path (`/home/u/x.zip 这里是…`
// — the composer's upload writes the file's path FIRST — `/tmp/a.txt`), `/ 2`, `/2026`, `/notacommand hello`.
const AGY_SLASH_COMMANDS = Object.freeze(['/usage', '/quota', '/credits', '/model', '/effort', '/skills', '/permissions', '/hooks', '/help', '/changelog', '/config']);

/** The agy command a chat line IS (its list spelling, e.g. '/model'), or null when the line is text for the agent. */
function agySlashCommand(text) {
  const head = String(text == null ? '' : text).trimStart().split(/\s/, 1)[0].toLowerCase();
  return AGY_SLASH_COMMANDS.includes(head) ? head : null;
}

module.exports = { AGY_SLASH_COMMANDS, agySlashCommand };
