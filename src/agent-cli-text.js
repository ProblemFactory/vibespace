'use strict';
// ONE TEXT PER FREE-TEXT COMMAND (lane cli-one-text-arg, the owner 2026-10-14) — THE rule the four agent CLIs share
// (data/bin/vibespace-msg, -channels, -ask, -task). PURE: imports nothing (the file reads go through the `io` the CLI
// hands in). In a checkout a CLI reads this file; on a host with no checkout it reads the boot-time copy
// `agent-cli-text.js` beside it (src/server/agent-tool-generators.js; hosts.js AGENT_TOOLS ships it).
//
// THE INCIDENT: an agent ran `vibespace-channels reply lark/<conv> "…若对照"有源码权限的人 vs 人员名单"会对不上。…" --to <id>`.
// The inner `"` closed the shell string, so the shell handed the CLI three words: `…若对照有源码权限的人`, `vs` and
// `人员名单会对不上。…`. The CLI sent the first one and DROPPED the rest without a word: the person read a message cut
// off mid-sentence, and the agent never learned it. vibespace-msg send / vibespace-ask / vibespace-task progress and
// backlog-add had the same shape (msg and channels dropped the extra words, ask and task joined them and lost the quotes).
//
// THE RULE:
//   ① a free-text command takes ONE text. ANY word after its named arguments is REFUSED by name (exit 2, nothing
//     sent): the refusal quotes the first stray word and says the likely cause. Joining them is never offered — a join
//     hides the same bug.
//   ② two safe doors for long or quoted text: `--text-file <path>` and `--text -` (stdin, a heredoc). A command with a
//     long --detail also takes `--detail-file <path>` (`-` = stdin). The text is the file's bytes as UTF-8 with ONE
//     trailing newline trimmed; the size bound is the route's own (the usage says it per command).
//   ③ the route answers how many characters it KEPT (`chars`, `detailChars` — counted by chars() below) and the CLI
//     echoes `sent: N characters`. A cut that one argument could still carry (a `$(…)` the shell ate) or a cut the
//     route made itself is then visible on the confirmation.

const STRAY_EXIT = 2;

/** Characters as a person counts them: code points (a CJK character, an emoji = 1), never UTF-16 units. */
function chars(s) {
  let n = 0;
  for (const _ of String(s ?? '')) n++;   // eslint-disable-line no-unused-vars
  return n;
}

/** A file's (or stdin's) text: ONE trailing newline trimmed (a heredoc's / an editor's), nothing else. */
function trimOnce(s) { return String(s).replace(/\r?\n$/, ''); }

/** Pull the text doors out of argv. `fields` = the text fields this command has ('text', 'detail').
 *   --text <text> | --text=<text>        the text as one argument (`-` = read stdin)
 *   --text-file <path> | --text-file=<path>   the file's text (`-` = stdin)
 *   --detail-file <path> | --detail-file=<path>   (only when 'detail' is a field)
 *  → { argv (the rest, in order), doors: { text?: {value}|{file}|{stdin:true}, detail?: {file}|{stdin:true} }, error } */
function takeDoors(argv, fields = ['text']) {
  const rest = [];
  const doors = {};
  const want = new Set(fields);
  const set = (field, door, flag) => {
    if (doors[field]) return `${flag}: the ${field} is given twice — give it once`;
    doors[field] = door;
    return null;
  };
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const a = String(list[i]);
    const m = /^--(text|text-file|detail-file)(?:=([\s\S]*))?$/.exec(a);
    const field = m ? (m[1] === 'detail-file' ? 'detail' : 'text') : null;
    if (!m || !want.has(field)) { rest.push(list[i]); continue; }
    let v = m[2];
    if (v === undefined) {
      if (list[i + 1] === undefined) return { argv: rest, doors, error: `--${m[1]} needs a value: ${m[1] === 'text' ? '--text "…" or --text - (stdin)' : `--${m[1]} <path> (- = stdin)`}` };
      v = String(list[++i]);
    }
    const flag = '--' + m[1];
    const door = m[1] === 'text' && v !== '-' ? { value: v, flag } : v === '-' ? { stdin: true, flag } : { file: v, flag };
    const err = set(field, door, flag);
    if (err) return { argv: rest, doors, error: err };
  }
  if (doors.text && doors.text.stdin && doors.detail && doors.detail.stdin) return { argv: rest, doors, error: 'only one text can come from stdin (-) — put the other in a file' };
  return { argv: rest, doors, error: null };
}

/** Read ONE door through the CLI's io = { readFile(path) → string (utf8), readStdin() → string, stdinIsTTY: bool }.
 *  → { text } | { error } (the error names the flag and the cause; nothing is sent after one). */
function readDoor(door, io) {
  if (!door) return { text: undefined };
  if (door.value !== undefined) return { text: door.value };
  try {
    if (door.stdin) {
      if (io && io.stdinIsTTY) return { error: `${door.flag} - reads the text from stdin, but nothing is piped in (stdin is a terminal or /dev/null) — feed it a heredoc (<<'EOF' … EOF) or a pipe; nothing was sent` };
      return { text: trimOnce(io.readStdin()) };
    }
    return { text: trimOnce(io.readFile(door.file)) };
  } catch (e) {
    const code = e && e.code;
    const why = code === 'ENOENT' ? 'no such file' : code === 'EISDIR' ? 'it is a directory' : code === 'EACCES' ? 'it cannot be read' : String((e && e.message) || e);
    return { error: `${door.flag} ${door.stdin ? '-' : door.file}: ${why} — nothing was sent` };
  }
}

/** The command's text: the positional OR its door — never both (`given` = how the other copy was given, for the
 *  sentence: 'as an argument' for a text, 'by --detail' for a detail). → { text } | { error } */
function textOf(positional, door, io, given = 'as an argument') {
  if (door && positional !== undefined) return { error: `the ${door.flag === '--detail-file' ? 'detail' : 'text'} is given twice — ${given} and by ${door.flag}; give it once — nothing was sent` };
  if (!door) return { text: positional };
  return readDoor(door, io);
}

/** The command's positional words, in order, for a CLI that finds its flags by name (vibespace-channels).
 *  spec = { valued: [flags that take the next word], optional: [flags that take it unless it starts with --],
 *  bare: [flags that take nothing] }; a `--x=v` word takes nothing. → [{ word, at, after }] — `after` = a flag
 *  the spec does not know right before the word (the refusal says it is not an option), else null. */
function positionals(argv, spec = {}) {
  const valued = new Set(spec.valued || []), optional = new Set(spec.optional || []), bare = new Set(spec.bare || []);
  const out = [];
  const list = Array.isArray(argv) ? argv : [];
  let unknownBefore = null;
  for (let i = 0; i < list.length; i++) {
    const a = String(list[i]);
    if (a.startsWith('--') && a.length > 2) {
      if (a.includes('=')) { unknownBefore = null; continue; }
      if (valued.has(a)) { i++; unknownBefore = null; continue; }
      if (optional.has(a)) { if (list[i + 1] !== undefined && !String(list[i + 1]).startsWith('--')) i++; unknownBefore = null; continue; }
      unknownBefore = bare.has(a) ? null : a;
      continue;
    }
    out.push({ word: a, at: i, after: unknownBefore });
    unknownBefore = null;
  }
  return out;
}

const quote = (w) => JSON.stringify(String(w).length > 40 ? String(w).slice(0, 40) + '…' : String(w));

/** THE refusal (① above), or null when nothing is stray.
 *  tool = 'vibespace-channels reply'; what = 'a message' | 'the question' | …; strays = the words after the named
 *  arguments, in order; after = an unknown flag right before the first stray (positionals()); detail = the command
 *  also has --detail (its door is named too). */
function strayRefusal({ tool, what = 'a message', strays, after = null, detail = false, remedy = null }) {
  const s = (strays || []).map(String);
  if (!s.length) return null;
  const n = s.length;
  const head = `${tool}: refused — ${what} is ONE argument — ${n} more word${n === 1 ? '' : 's'} followed it (${quote(s[0])}${n > 1 ? ', …' : ''})`;
  if (/^--?[A-Za-z]/.test(s[0])) return `${head}: ${quote(s[0])} is not an option of ${tool}; run ${tool.split(' ')[0]} with no arguments for its usage — nothing was sent`;
  if (after) return `${head}: ${quote(after)} is not an option of ${tool}, so the word after it stood alone; run ${tool.split(' ')[0]} with no arguments for its usage — nothing was sent`;
  return `${head}: a quote in the text probably closed early; ${remedy || `put the text in a file (--text-file <path>) or on stdin (--text -)${detail ? ' — a long --detail in --detail-file <path>' : ''}, or escape the inner quotes`} — nothing was sent`;
}

/** The echo (③): `sent: N characters` from the route's count; when the route kept fewer than this CLI handed it, the
 *  cut is SAID. An older route that does not count ⇒ this CLI's own count of what it sent. */
function sentLine({ chars: kept, detailChars } = {}, text, detail) {
  const given = chars(String(text ?? '').trim());   // routes trim the ends; that is not a cut
  const n = Number.isFinite(kept) ? kept : chars(text);
  let line = `sent: ${n} character${n === 1 ? '' : 's'}`;
  if (n < given) line += ` — ${given} were given: the last ${given - n} were CUT`;
  if (typeof detail === 'string' && detail.trim()) {
    const dGiven = chars(detail.trim());
    const d = Number.isFinite(detailChars) ? detailChars : chars(detail);
    line += ` + --detail ${d}`;
    if (d < dGiven) line += ` (${dGiven} were given: the last ${dGiven - d} were CUT)`;
  }
  return line;
}

/** THE flow of one free-text slot, in order: a door the CLI could not take → a stray word → the text (the argument or
 *  its door, never both). doors = takeDoors()'s answer. → { text } | { error } (the whole sentence; exit STRAY_EXIT). */
function oneText({ tool, what, positional, strays, after = null, detail = false, doors, io }) {
  if (doors && doors.error) return { error: `${tool}: refused — ${doors.error} — nothing was sent` };
  const stray = strayRefusal({ tool, what, strays, after, detail });
  if (stray) return { error: stray };
  const t = textOf(positional, doors && doors.doors ? doors.doors.text : null, io);
  return t.error ? { error: `${tool}: refused — ${t.error}` } : t;
}

// ── THE AGENT CHANNEL SEARCH ANSWER'S WORDS (lane search-no-group-log, a gate red 2026-10-21) ─────────────────────────
// The agent search door answers FACTS and a `saidKind` KEY (src/channel-search.js SR.searchSaidKind), never the caller's
// typed query — so a cleared record's word can never ride back in the answer (test-record-clear-walk). The CLI words the
// key HERE with its OWN local `q` (its argv): the same sentences the server used to send. ONE place, rendered CLI-side
// (src/channel-search.js re-exports searchSaid / HIDDEN_TEXT / SHARE_DOOR; its PURE searchAnswer = searchSaid(kind, f)).
const SEARCH_SHARE_DOOR = "Channels › the conversation's ⋯ or the account's ⋯ → Grant access…";
/** THE ONE SENTENCE for hits the caller may not read — the same bytes whatever matched, however much, wherever. */
const SEARCH_HIDDEN_TEXT = `matches exist that you cannot read — ask the user to share them with you (${SEARCH_SHARE_DOOR}).`;
/**
 * THE WORDS of an agent's search, from the server's `saidKind` KEY + the caller's OWN `q` (never the server's) →
 * `[line…]`, printed after the rows it may read. `hiddenMatch` (a flag on the answer) appends the existence sentence —
 * never a count, an account, a title or a word of it. `saved` = the saved hits the CLI printed first (`--full`).
 */
function searchSaid(kind, { q = '', saved = null, hiddenMatch = false } = {}) {
  const words = `"${String(q)}"`;
  const hid = hiddenMatch === true ? [SEARCH_HIDDEN_TEXT] : [];
  switch (kind) {
    case 'none': return [`nothing matches ${words}.`];
    case 'none-readable': return [`nothing you can read matches ${words}.`, ...hid];
    case 'none-not-shared': return [`nothing you can read matches ${words} — no conversation of the connected channels is shared with you (ask the user to grant access).`];
    case 'full-added-unknown': return [`the account's own search added nothing you can read to what is saved here for ${words}.`, ...hid];
    case 'full-added-beyond': { const n = Math.max(0, Math.floor(Number(saved) || 0)); return [`the account's own search added nothing beyond the ${n} saved ${n === 1 ? 'hit' : 'hits'} above.`, ...hid]; }
    case 'full-none-either': return [`the account's own search found nothing you can read for ${words} either.`, ...hid];
    case 'hits': return hid;
    default: return hid;
  }
}

module.exports = { STRAY_EXIT, chars, trimOnce, takeDoors, readDoor, textOf, positionals, strayRefusal, sentLine, oneText, searchSaid, SEARCH_HIDDEN_TEXT, SEARCH_SHARE_DOOR };
