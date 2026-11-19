'use strict';
/**
 * THE KEY-HELPER FACT OF ONE CLAUDE SETTINGS FILE — ONE rule for every machine (B-bc9f): this machine's (src/billing-pick.js
 * localHelperFact, read at a start) and a paired machine's (src/machine-probes.js, bundled into the device agent — its probe's
 * keyHelper / keyHelperUnread). PURE: imports nothing.
 *   text = the file as read, missing = there is no such file → true (a helper is named) / false (it names none, is empty, or there
 *   is no file) / null (it cannot be read: not JSON, not an object, a read that failed — billing wins)
 * Both readers read a regular file of at most SETTINGS_READ_MAX bytes and never wait on a FIFO (the hub's opens it non-blocking,
 * the probe stats it first).
 */
const SETTINGS_READ_MAX = 1 << 20;

/** does a settings object name a helper the CLI would use? (`row` = the harness's creds.keyHelper; anything else = no) */
function namesHelper(settings, row) {
  const key = row && typeof row.setting === 'string' ? row.setting : '';
  if (!key || !settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const v = settings[key];
  return typeof v === 'string' ? v.trim() !== '' : !!v;
}

function helperFactOfText({ text = null, missing = false } = {}, row) {
  if (missing) return false;
  if (typeof text !== 'string') return null;
  if (!text.trim()) return false;   // an EMPTY file names nothing (never «cannot be read»)
  let o;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  return namesHelper(o, row);
}

/** the ssh probe's form of it (hosts.backendStatus' fallback rung, no node there): it reads TEXT — the quoted key ⇒ named (an empty
 *  value too: billing wins); the bare name only (an unquoted key, a comment), a file it cannot open or a grep that could not READ
 *  the file (its exit 2: an I/O error, a stale network handle — never «none») ⇒ cannot be read; a file whose text never names the
 *  setting ⇒ none (a TEXT reading: a key spelled with \u escapes, or a link loop, reads none here). Each grep's exit is read
 *  through `||` (a login shell with errexit never ends on a no-match). No size bound: a huge file is read until the start's own
 *  bound (HELPER_FACT_MS, 8 s), and no answer reads as cannot be read. */
const SSH_HELPER_RUNG = 'vs_kh="$HOME/.claude/settings.json"; if [ -f "$vs_kh" ] && [ -r "$vs_kh" ]; then '
  + 'vs_q=0; grep -q "\\"apiKeyHelper\\"" "$vs_kh" || vs_q=$?; if [ $vs_q -eq 0 ]; then echo "claude-helper|yes"; elif [ $vs_q -ne 1 ]; then echo "claude-helper|unread"; '
  + 'else vs_b=0; grep -q apiKeyHelper "$vs_kh" || vs_b=$?; if [ $vs_b -ne 1 ]; then echo "claude-helper|unread"; fi; fi; '
  + 'elif [ -e "$vs_kh" ]; then echo "claude-helper|unread"; fi; ';

module.exports = { namesHelper, helperFactOfText, SETTINGS_READ_MAX, SSH_HELPER_RUNG };
