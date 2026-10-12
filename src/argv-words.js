'use strict';
/**
 * ONE COMMAND LINE ↔ ITS WORDS — PURE, imports nothing (lanes app-register-model / app-register-ui, 2026-10-11: a
 * registered app's launch variants and its remove / reinstall recipes are typed as ONE line and kept as argv). Read
 * POSIX-ish: 'single quotes' keep everything, "double quotes" keep everything but \" \\ \$ \` (escaped), a backslash
 * outside quotes keeps the next character. Nothing is ever a shell: an unbalanced quote, a trailing backslash or one of
 * | ; & > < $ ` outside quotes is refused as { ok:false, code:'bad_args', at, error } (`at` = the character's index,
 * `error` names it: "unbalanced quote at 12" / "a | outside quotes at 7" — rel254 verify F9), never guessed. Words
 * split on ASCII blanks only (a path may hold a no-break space); a backslash-newline OUTSIDE quotes is a POSIX line
 * continuation (removed), inside quotes it is kept (F10). `joinWords(argv)` is the inverse: splitWords(joinWords(a)).argv
 * deep-equals a for every array of strings. `commandLine(v)` is what a PERSON reads: `env K=V … argv (in <cwd>)` with
 * every invisible character (Unicode Cf — bidi controls, zero-width — and C0/C1 controls) shown as <U+202E> (F3/F10).
 */
const SHELL_CHARS = '|;&><$`';
const DQ_ESCAPES = '"\\$`';
const BLANK_RE = /[ \t\n\r\v\f]/;
const at1 = (i) => i + 1; // a person counts characters from 1
const refused = (at, error) => ({ ok: false, code: 'bad_args', at, error });

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
    if (ch === '\\') {
      if (i + 1 >= s.length) return refused(i, `a trailing \\ at ${at1(i)}`);
      if (s[i + 1] === '\n') { i++; continue; } // POSIX: backslash-newline outside quotes is removed (a continuation)
      cur += s[++i]; had = true; continue;
    }
    if (BLANK_RE.test(ch)) { if (had) { argv.push(cur); cur = ''; had = false; } continue; }
    if (SHELL_CHARS.includes(ch)) return refused(i, `a ${ch} outside quotes at ${at1(i)}`);
    cur += ch; had = true;
  }
  if (q) return refused(qAt, `unbalanced quote at ${at1(qAt)}`);
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

/** Every invisible character a word may hold, shown (display only — the argv itself is never rewritten). */
const INVISIBLE_RE = /[\p{Cf}\p{Cc}\u2028\u2029]/gu;
const visible = (s) => String(s).replace(INVISIBLE_RE, (c) => `<U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}>`);
/** ONE launch variant / recipe as a person reads it: its env (`env K=V …`), its argv, its working directory. */
function commandLine(v) {
  const x = v && typeof v === 'object' ? v : {};
  const env = x.env && typeof x.env === 'object' ? Object.entries(x.env) : [];
  const line = `${env.length ? `env ${env.map(([k, val]) => `${k}=${joinWords([val])}`).join(' ')} ` : ''}${joinWords([x.exec, ...(Array.isArray(x.args) ? x.args : [])])}${typeof x.cwd === 'string' && x.cwd ? ` (in ${x.cwd})` : ''}`;
  return visible(line);
}

module.exports = { SHELL_CHARS, splitWords, joinWords, visible, commandLine };
