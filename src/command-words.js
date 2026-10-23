'use strict';
// A PERMISSION REQUEST IN A PERSON'S WORDS (lane door-healthy-chat, 2.369.344 — the naive studies on 2.369.342, W2/C10:
// 6–10 «Permission: Bash» cards per task full of shell — `for d in …`, `python3 -I - <<'EOF'`, `rm -f …SingletonLock` — that a
// finance lead or an executive assistant cannot judge). ONE line that says what the request DOES, derived from the command
// itself (never from words the agent wrote about it): «install python-docx · read 3 files». The card shows it above the
// command, which stays one press away (folded; open when the request holds a hidden character — F7). Display only, never a
// permission decision. PURE, CJS: imports only the PURE src/agent-tool-rules.js (its quote-aware `splitShell`); the
// client renders each phrase through t() — the words are `{key, params}` (i18nKey marks them for the extractor).
const { splitShell } = require('./agent-tool-rules.js');
const i18nKey = (s) => s;

const MAX_PHRASES = 3;
const base = (p) => String(p || '').replace(/\/+$/, '').split('/').pop() || String(p || '');
const isOpt = (w) => /^-/.test(w);
const argsOf = (w, from) => w.slice(from).filter((x) => x && !isOpt(x));
const short = (list, n = 2) => (list.length > n ? list.slice(0, n).join(', ') + ' …' : list.join(', '));
const READERS = new Set(['cat', 'head', 'tail', 'less', 'more', 'wc', 'file', 'stat', 'pdftotext', 'pdfinfo', 'xxd', 'od', 'strings', 'md5sum', 'sha256sum', 'cmp', 'diff']);
const LISTERS = new Set(['ls', 'tree', 'find', 'du', 'df', 'pwd']);
const SEARCHERS = new Set(['grep', 'rg', 'ag', 'ugrep', 'egrep', 'fgrep']);
const QUIET = new Set(['cd', 'true', 'export', 'set', 'source', '.', 'sleep', 'echo', 'printf', 'date', 'which', 'type', 'command']);
const LANG = { python: 'Python', python3: 'Python', node: 'JavaScript', ruby: 'Ruby', perl: 'Perl', bash: 'shell', sh: 'shell', zsh: 'shell' };
const SHELLS = new Set(['bash', 'sh', 'zsh']); // a shell's `-c` line is the request itself
const LOOP_HEADS = new Set(['for', 'while', 'until', 'if', 'elif', 'case']);
const LOOP_KEYWORDS = new Set(['do', 'then', 'else']);
const LOOP_ENDS = new Set(['done', 'fi', 'esac']);
// the package managers: the word that installs, per program
const INSTALL_VERBS = Object.freeze({ npm: ['install', 'i', 'add'], pnpm: ['install', 'i', 'add'], yarn: ['add', 'install'], bun: ['add', 'install', 'i'], apt: ['install'], 'apt-get': ['install'], brew: ['install'], dnf: ['install'], yum: ['install'] });
const SYSTEM_INSTALLERS = new Set(['apt', 'apt-get', 'brew', 'dnf', 'yum']);
const TEST_RUNNERS = new Set(['pytest', 'jest', 'vitest', 'mocha']);
const RUN_VERBS = Object.freeze({ npm: ['test', 'run'], pnpm: ['test', 'run'], yarn: ['test', 'run'], bun: ['test', 'run'] });

/** ONE simple command (its words) → a phrase `{key, params}`, `{quiet: true}` for a step not worth saying, or null. */
function phraseOfWords(words) {
  let w = words.slice();
  while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w.shift(); // VAR=value prefixes
  if (w[0] === 'sudo' || w[0] === 'env' || w[0] === 'nohup' || w[0] === 'time') w = w.slice(1);
  while (w.length && LOOP_KEYWORDS.has(w[0])) w = w.slice(1);
  if (!w.length) return { quiet: true };
  const head = base(w[0]);
  if (LOOP_ENDS.has(head)) return { quiet: true };
  if (LOOP_HEADS.has(head)) return { key: i18nKey('repeat a step for each item'), params: {}, loop: true };
  if (QUIET.has(head)) return { quiet: true };
  // installs: pip / python -m pip / uv pip / npm / yarn / pnpm / apt / brew
  const pipAt = head === 'pip' || head === 'pip3' ? 1 : (LANG[head] === 'Python' && w[1] === '-m' && w[2] === 'pip') ? 3 : (head === 'uv' && w[1] === 'pip') ? 2 : -1;
  if (pipAt >= 0 && w[pipAt] === 'install') return { key: i18nKey('install {what}'), params: { what: short(argsOf(w, pipAt + 1)) || 'Python packages' } };
  if (INSTALL_VERBS[head] && INSTALL_VERBS[head].includes(w[1])) { const a = argsOf(w, 2); return a.length ? { key: i18nKey('install {what}'), params: { what: short(a) } } : SYSTEM_INSTALLERS.has(head) ? { key: i18nKey('install {what}'), params: { what: head } } : { key: i18nKey('install the project\'s packages'), params: {} }; }
  if (READERS.has(head)) { const f = argsOf(w, 1); return f.length ? { key: '', read: f } : { quiet: true }; } // a reader in a pipe reads no file of its own
  if (LISTERS.has(head)) { const d = argsOf(w, 1)[0]; return d ? { key: i18nKey('look through {dir}'), params: { dir: base(d) + '/' } } : { key: i18nKey('look through the folder'), params: {} }; }
  if (SEARCHERS.has(head)) return { key: i18nKey('search the files'), params: {} };
  if (head === 'rm' || head === 'rmdir' || head === 'unlink' || head === 'trash') { const f = argsOf(w, 1); return f.length === 1 ? { key: i18nKey('delete {name}'), params: { name: base(f[0]) } } : { key: i18nKey('delete {n} files'), params: { n: f.length } }; }
  if (head === 'cp' || head === 'rsync') return { key: i18nKey('copy files'), params: {} };
  if (head === 'mv') { const f = argsOf(w, 1); return f.length === 2 ? { key: i18nKey('move or rename {name}'), params: { name: base(f[0]) } } : { key: i18nKey('move files'), params: {} }; }
  if (head === 'mkdir') { const d = argsOf(w, 1); return { key: i18nKey('create the folder {name}'), params: { name: d.length ? base(d[0]) + '/' : '?' } }; }
  if (head === 'touch') return { key: i18nKey('create a file'), params: {} };
  if (head === 'chmod' || head === 'chown') return { key: i18nKey('change who may use a file'), params: {} };
  if (head === 'curl' || head === 'wget') { const u = w.slice(1).find((x) => /^https?:\/\//i.test(x)); let host = ''; try { host = u ? new URL(u).host : ''; } catch { host = ''; } return host ? { key: i18nKey('download from {host}'), params: { host } } : { key: i18nKey('download a file'), params: {} }; }
  if (head === 'git') { const sub = w.slice(1).find((x) => !isOpt(x)) || ''; return { key: i18nKey('use git ({what})'), params: { what: sub || 'git' } }; }
  if (head === 'tar' || head === 'unzip' || head === 'zip' || head === 'gzip' || head === 'gunzip') return { key: i18nKey('pack or unpack files'), params: {} };
  if (head === 'libreoffice' || head === 'soffice' || head === 'pandoc') return { key: i18nKey('convert a document'), params: {} };
  if (LANG[head]) {
    // `bash -c "<line>"`: the line itself is the request — said by what IT does (an `rm -rf` inside is named, never «a snippet»)
    const ci = w.indexOf('-c');
    if (SHELLS.has(head) && ci > 0 && typeof w[ci + 1] === 'string' && w[ci + 1].trim()) return { inner: w[ci + 1] };
    const script = w.slice(1).find((x) => !isOpt(x) && x !== '-');
    if (w.includes('-c') || w.includes('-e') || w.includes('-') || !script) return { key: i18nKey('run a {lang} snippet'), params: { lang: LANG[head] } };
    return { key: i18nKey('run {name}'), params: { name: base(script) } };
  }
  if (TEST_RUNNERS.has(head) || (RUN_VERBS[head] && RUN_VERBS[head].includes(w[1]))) return { key: i18nKey('run the project\'s tests or scripts'), params: {} };
  return { key: i18nKey('run {name}'), params: { name: head } };
}

/** A shell command line → its phrases (≤ 3 + «and {n} more steps»): the reads of several commands are ONE «read N files»,
 *  a repeated phrase is said once. A line the splitter will not guess at (a heredoc, a substitution, unbalanced quotes)
 *  is named by what runs it: «run a Python snippet», or «run a shell script». [] for an empty line. */
function commandPhrases(line, depth = 0) {
  const text = String(line == null ? '' : line).trim();
  if (!text) return [];
  const segs = splitShell(text);
  if (!segs) {
    const first = (text.match(/^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:sudo\s+)?(\S+)/) || [])[1] || '';
    const lang = LANG[base(first)];
    return [lang ? { key: i18nKey('run a {lang} snippet'), params: { lang } } : { key: i18nKey('run a shell script'), params: {} }];
  }
  const out = [];
  const reads = [];
  let readSlot = null, loop = false;
  for (const s of segs) {
    const p = phraseOfWords(s.words || []);
    if (!p || p.quiet) continue;
    if (p.inner != null) { // a shell's -c line: its own phrases, one level deep (a deeper one is «a shell script»)
      const inner = depth < 1 ? commandPhrases(p.inner, depth + 1) : [{ key: i18nKey('run a shell script'), params: {} }];
      for (const q of inner) if (!out.some((o) => o.key === q.key && JSON.stringify(o.params) === JSON.stringify(q.params))) out.push(q);
      continue;
    }
    if (p.read) { reads.push(...p.read); if (!readSlot) out.push(readSlot = { key: '', params: {} }); continue; } // the reads are ONE phrase, where the first one ran
    if (p.loop) { loop = true; continue; }
    const same = out.find((o) => o.key === p.key);
    if (same && p.key === i18nKey('use git ({what})')) { if (!same.params.what.split(', ').includes(p.params.what)) same.params = { what: same.params.what + ', ' + p.params.what }; continue; }
    if (!out.some((o) => o.key === p.key && JSON.stringify(o.params) === JSON.stringify(p.params))) out.push({ key: p.key, params: p.params });
  }
  if (readSlot) {
    const uniq = [...new Set(reads)];
    Object.assign(readSlot, uniq.length === 1 ? { key: i18nKey('read {name}'), params: { name: base(uniq[0]) } } : { key: i18nKey('read {n} files'), params: { n: uniq.length } });
  }
  if (loop) out.push({ key: i18nKey('repeat a step for each item'), params: {} });
  if (!out.length) out.push({ key: i18nKey('run {name}'), params: { name: base((segs[0].words || [])[0] || '?') } });
  if (out.length > MAX_PHRASES) { const n = out.length - MAX_PHRASES; out.length = MAX_PHRASES; out.push({ key: i18nKey('and {n} more steps'), params: { n } }); }
  return out;
}

/** A pending tool request → its phrases: Bash by its command, a file tool by the file it names. [] = nothing to say. */
function requestPhrases(toolName, input) {
  const i = input && typeof input === 'object' ? input : {};
  const tool = String(toolName || '');
  if (tool === 'Bash' || typeof i.command === 'string') return commandPhrases(typeof i.command === 'string' ? i.command : i.cmd);
  const file = i.file_path || i.notebook_path || i.path || '';
  if (tool === 'Write' && file) return [{ key: i18nKey('write {name}'), params: { name: base(file) } }];
  if ((tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') && file) return [{ key: i18nKey('edit {name}'), params: { name: base(file) } }];
  if (tool === 'Read' && file) return [{ key: i18nKey('read {name}'), params: { name: base(file) } }];
  if (tool === 'WebFetch' && typeof i.url === 'string') { let host = ''; try { host = new URL(i.url).host; } catch { host = ''; } return host ? [{ key: i18nKey('open {host}'), params: { host } }] : []; }
  return [];
}

module.exports = { commandPhrases, requestPhrases, MAX_PHRASES };
