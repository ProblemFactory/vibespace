'use strict';
/**
 * ONE COMMAND LINE ↔ ITS WORDS — PURE, imports nothing (lanes app-register-model / app-register-ui, 2026-10-11: a
 * registered app's launch variants and its remove / reinstall recipes are typed as ONE line and kept as argv). Read
 * POSIX-ish: 'single quotes' keep everything, "double quotes" keep everything but \" \\ \$ \` (escaped), a backslash
 * outside quotes keeps the next character. Nothing is ever a shell: an unbalanced quote, a trailing backslash or one of
 * | ; & > < $ ` outside quotes is refused as { ok:false, code:'bad_args', at } (`at` = the character's index), never
 * guessed. `joinWords(argv)` is the inverse: splitWords(joinWords(a)).argv deep-equals a for every array of strings.
 */
const SHELL_CHARS = '|;&><$`';
const DQ_ESCAPES = '"\\$`';

function splitWords(line) {
  const s = String(line == null ? '' : line);
  const argv = [];
  let cur = '', had = false, q = '', qAt = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q === "'") { if (ch === "'") q = ''; else cur += ch; continue; }
    if (q === '"') {
      if (ch === '"') { q = ''; continue; }
      if (ch === '\\' && i + 1 < s.length && DQ_ESCAPES.includes(s[i + 1])) { cur += s[++i]; continue; }
      cur += ch; continue;
    }
    if (ch === "'" || ch === '"') { q = ch; qAt = i; had = true; continue; }
    if (ch === '\\') { if (i + 1 >= s.length) return { ok: false, code: 'bad_args', at: i }; cur += s[++i]; had = true; continue; }
    if (/\s/.test(ch)) { if (had) { argv.push(cur); cur = ''; had = false; } continue; }
    if (SHELL_CHARS.includes(ch)) return { ok: false, code: 'bad_args', at: i };
    cur += ch; had = true;
  }
  if (q) return { ok: false, code: 'bad_args', at: qAt };
  if (had) argv.push(cur);
  return { ok: true, argv };
}

/** argv → the one line splitWords reads back to the same words (a plain word stays bare, any other is 'quoted'). */
function joinWords(argv) {
  return (Array.isArray(argv) ? argv : []).map((w) => {
    const s = String(w);
    return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
  }).join(' ');
}

module.exports = { SHELL_CHARS, splitWords, joinWords };
