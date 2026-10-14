// THE SHARED TABLES' IMPACT RULES (lane affected-heavy-deps, B-165f, 2026-10-13) — PURE: no fs, no git, no clock;
// scripts/ci.mjs affectedSuites does the reads and hands this module the diff, the two texts and the suites' closures.
//
// The affected heavy tier selects the suites whose INPUTS a range touches (ci.mjs IMPACT SCOPE). Four files are inputs
// of nearly every heavy suite — the two dictionaries, the settings schema and the app-wide stylesheet — so one entry
// added to one of them selected 258–263 of 300. They are TABLES: an entry changes what ONE string, ONE settings row or
// ONE selector draws. MODELED names a rule per file; a change the rule cannot attribute (a code line in a dictionary,
// a default in the schema, a global selector) falls back to the OLD rule for that file and says why. Every other file
// keeps the old rule — server.js and scripts/ci.mjs among them (a change there can alter any boot; no finer rule is
// proven), and a version bump (package.json) still selects everything.
//   · i18n-table — src/lib/i18n-zh.js / i18n-ja.js. resolveLang() (src/lib/i18n.js) answers 'en' without a DOM (node
//     has no localStorage) and on an English browser, so an edit to dictionary ENTRIES reaches only: the suites that
//     render in that language (a 'zh' / 'zh-CN' / lang=zh token in the suite or a scripts/ file it loads), the suites
//     that open the table file themselves, and the i18n census suites. On a zh/ja RUNNER (LANGUAGE / LC_ALL /
//     LC_MESSAGES / LANG) Chrome renders every page in that language ⇒ the old rule.
//   · settings-text — src/lib/settings-schema.js. An edit to a row's DISPLAY text (label / description / category …
//     t('…') — the line equal once the words are masked) reaches the suites that load the schema in-process, name the
//     row's key or the changed words, open the Settings window, or name a module that draws schema rows. Any other edit
//     (a default, a type, a when, a row added or removed, a line outside the rows) ⇒ the old rule: a default reaches
//     every reader, and readers build their keys (`channels.attention.rule.${id}`, settingPath()) where no grep follows.
//   · css-selectors — public/style.css. An edit inside rules whose every selector names a class or an id: each changed
//     selector is keyed by its RAREST required name (outside :not(); the fewest client modules — tracked src/lib/ +
//     public/ files — draw it) and reaches the pixel suites and the suites that name that key, load a module that draws
//     it in-process, or name that module. A rule with no class or id (html, :root, button…), @keyframes / @font-face /
//     @import, a selector whose every name public/index.html draws (on every page) or a line outside any rule ⇒ the old
//     rule. This one is a HEURISTIC (a booted page draws whatever the suite opens): the 24 h FULL run is its net.
import { dictEntries } from './i18n-extract.mjs';

export const MODELED = Object.freeze({
  'src/lib/i18n-zh.js': Object.freeze({ rule: 'i18n-table', lang: 'zh' }),
  'src/lib/i18n-ja.js': Object.freeze({ rule: 'i18n-table', lang: 'ja' }),
  'src/lib/settings-schema.js': Object.freeze({ rule: 'settings-text' }),
  'public/style.css': Object.freeze({ rule: 'css-selectors' }),
});
// The shared files that KEEP the old rule, said in --why so "unchanged" is a decision, not an omission.
export const KEPT = Object.freeze({
  'server.js': 'boots the product — a change there can alter any boot (no finer rule is proven)',
  'scripts/ci.mjs': 'runs every suite — its import graph, unchanged (no finer rule is proven)',
  'package.json': 'a global input (dependencies, the version) — everything',
  'package-lock.json': 'a global input (dependencies) — everything',
});
export const SELF = 'scripts/affected-model.mjs';
// A suite (or a scripts/ helper it loads) that switches the page to the language: a quoted 'zh' / "zh-CN" / `ja`, a
// zh_CN / ja-JP locale, a lang=zh query. Over-matching only selects more.
export const LANG_TOKENS = Object.freeze({
  zh: /['"`]zh(?:[-_][A-Za-z]+)?['"`]|\bzh[-_](?:CN|Hans|Hant|TW|HK|SG)\b|\blang=zh\b/,
  ja: /['"`]ja(?:[-_][A-Za-z]+)?['"`]|\bja[-_]JP\b|\blang=ja\b/,
});
// Suites that compare pixels judge every drawn rule.
export const PIXEL = /\bpixelmatch\b|\bgetImageData\b|\bPNG\.sync\b|\bpngjs\b|\bsamePixels\b|\bdiffPixels\b|\bidlePaintVerdict\b/;
// The Settings window's own words in a suite: it opens / reads the window.
export const SETTINGS_SURFACE = /\bsettings-(?:ui|window|view|search|row)[\w-]*|\bopenSettings\b/;
// A row's display fields — the only fields whose edit draws and does nothing else.
const DISPLAY_FIELDS = 'label|description|placeholder|hint|help|blockTitle|unit|title|category';
const DISPLAY_ONLY = new RegExp(`^\\s*(?:(?:${DISPLAY_FIELDS})\\s*:\\s*tc?\\(#\\)\\s*,?\\s*)+$`);
const STR = `'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`(?:[^\`\\\\]|\\\\.)*\``;
const T_CALL = new RegExp(`\\b(tc?)\\(((?:\\s*(?:${STR})\\s*,?)+)\\)`, 'g');
const STR_RE = new RegExp(STR, 'g');
const decode = (lit) => { try { return JSON.parse(lit[0] === '"' ? lit : '"' + lit.slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'); } catch { return lit.slice(1, -1); } };

/** The -U0 hunks of one file's diff: [{ minus: [{line, text}], plus: [{line, text}] }] (1-based old / new line numbers). */
export function parseHunks(diff) {
  const hunks = [];
  let h = null, o = 0, n = 0;
  for (const raw of String(diff || '').split('\n')) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (m) { h = { minus: [], plus: [] }; hunks.push(h); o = Number(m[1]); n = Number(m[2]); continue; }
    if (!h) continue;
    if (raw[0] === '-') h.minus.push({ line: o++, text: raw.slice(1) });
    else if (raw[0] === '+') h.plus.push({ line: n++, text: raw.slice(1) });
    else if (raw[0] === ' ') { o++; n++; }
  }
  return hunks;
}

/** Per 1-based line: does it hold anything but whitespace and comments? `js` = // comments too (CSS has only block ones). */
export function codeLines(text, { js = true } = {}) {
  const out = [false];
  let inBlock = false;
  for (const line of String(text || '').split('\n')) {
    let code = false, quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      if (js && c === '/' && n === '/') break;
      if (c === '"' || c === "'" || (js && c === '`')) quote = c;
      if (!/\s/.test(c)) code = true;
    }
    out.push(code);
  }
  return out;
}
const changedLines = (hunks, oldText, newText, opts) => {
  const oc = codeLines(oldText, opts), nc = codeLines(newText, opts);
  return hunks.map((h) => ({ minus: h.minus.filter((l) => oc[l.line]), plus: h.plus.filter((l) => nc[l.line]) }));
};

/** i18n-table: the entries an edit changed, or why it is not only entries. */
export function i18nChange({ hunks, oldText, newText }) {
  const keys = new Set(), values = new Set(), offending = [];
  for (const h of changedLines(hunks, oldText, newText)) {
    for (const l of [...h.minus, ...h.plus]) {
      const e = dictEntries(l.text);
      if (e.length === 1) { keys.add(e[0].key); values.add(e[0].value); } else offending.push(`not a dictionary entry: ${l.text.trim().slice(0, 100)}`);
    }
  }
  return { attributable: !offending.length, keys: [...keys], values: [...values], offending };
}

// settings-schema.js rows: 1-based line → the row key it sits in (null = inside SETTINGS_SCHEMA between rows,
// undefined = outside it).
const braceDelta = (line) => { const s = line.replace(STR_RE, '""').replace(/\/\/.*$/, ''); return (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length; };
export function settingsRows(text) {
  const lines = String(text || '').split('\n');
  const rowAt = new Array(lines.length + 1).fill(undefined);
  const start = lines.findIndex((l) => /^const SETTINGS_SCHEMA = \{\s*$/.test(l));
  if (start < 0) return rowAt;
  let end = start + 1;
  while (end < lines.length && !/^\};?\s*$/.test(lines[end])) end++;
  for (let i = start + 1; i < end; i++) rowAt[i + 1] = null;
  for (let i = start + 1; i < end; i++) {
    const m = /^ {2}(['"])((?:(?!\1).)+)\1\s*:\s*\{/.exec(lines[i]);
    if (!m) continue;
    let depth = 0, j = i;
    for (; j < end; j++) { depth += braceDelta(lines[j]); rowAt[j + 1] = m[2]; if (depth <= 0) break; }
    i = j;
  }
  return rowAt;
}
const maskT = (line) => line.replace(T_CALL, '$1(#)');
const tWords = (line) => [...line.matchAll(T_CALL)].flatMap((m) => [...m[2].matchAll(STR_RE)].map((x) => decode(x[0])));
/** settings-text: the rows whose display words changed, or why the edit is more than words. */
export function settingsChange({ hunks, oldText, newText }) {
  const oldRows = settingsRows(oldText), newRows = settingsRows(newText);
  const keys = new Set(), words = new Set(), offending = [];
  const side = (l, rows, tag) => {
    const key = rows[l.line];
    if (key === undefined || key === null) { offending.push(`${tag} line ${l.line} is outside every row: ${l.text.trim().slice(0, 100)}`); return; }
    if (!DISPLAY_ONLY.test(maskT(l.text))) { offending.push(`'${key}': more than display words change (${l.text.trim().slice(0, 100)})`); return; }
    keys.add(key); for (const w of tWords(l.text)) words.add(w);
  };
  for (const h of changedLines(hunks, oldText, newText)) {
    const n = Math.max(h.minus.length, h.plus.length);
    for (let k = 0; k < n; k++) {
      const a = h.minus[k], b = h.plus[k];
      if (a && b && oldRows[a.line] && oldRows[a.line] === newRows[b.line] && maskT(a.text) === maskT(b.text)) {
        keys.add(oldRows[a.line]); for (const w of [...tWords(a.text), ...tWords(b.text)]) words.add(w);
        continue;
      }
      if (a) side(a, oldRows, 'old');
      if (b) side(b, newRows, 'new');
    }
  }
  return { attributable: !offending.length, keys: [...keys], words: [...words], offending };
}

/** CSS blocks with their 1-based line spans: { kind: 'style'|'group'|'at'|'stmt', prelude, start, end, parent }. */
export function cssNodes(text) {
  const nodes = [], stack = [];
  let line = 1, buf = '', bufLine = 0, inComment = false, quote = null;
  const kindOf = (prelude) => {
    const top = stack[stack.length - 1];
    if (top && (top.kind === 'at' || top.kind === 'at-child')) return 'at-child';
    if (/^@(?:media|supports|container|layer|scope|document)\b/i.test(prelude)) return 'group';
    return prelude[0] === '@' ? 'at' : 'style';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '\n') { line++; if (buf) buf += ' '; continue; }
    if (inComment) { if (c === '*' && n === '/') { inComment = false; i++; } continue; }
    if (quote) { buf += c; if (c === '\\') { buf += n || ''; i++; } else if (c === quote) quote = null; continue; }
    if (c === '/' && n === '*') { inComment = true; i++; continue; }
    if (c === '{') { const prelude = buf.trim(); stack.push({ kind: kindOf(prelude), prelude, start: bufLine || line, parent: stack[stack.length - 1] || null }); buf = ''; bufLine = 0; continue; }
    if (c === '}') { const b = stack.pop(); if (b) { b.end = line; nodes.push(b); } buf = ''; bufLine = 0; continue; }
    if (c === ';') { if (!stack.length || stack[stack.length - 1].kind === 'group') { if (buf.trim()) nodes.push({ kind: 'stmt', prelude: buf.trim(), start: bufLine || line, end: line, parent: stack[stack.length - 1] || null }); } buf = ''; bufLine = 0; continue; }
    if (c === '"' || c === "'") quote = c;
    if (!bufLine && !/\s/.test(c)) bufLine = line;
    buf += c;
  }
  return nodes;
}
// The class / id names of one selector list ([] for a selector that names neither — a global one).
const splitTop = (sel) => { const out = []; let depth = 0, cur = ''; for (const c of sel) { if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && !depth) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((s) => s.trim()).filter(Boolean); };
const namesIn = (s) => [...s.matchAll(/[.#](-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
/** Per selector of a list: `all` = every class / id it names ([] = a global selector), `anchor` = the names of the
 *  rightmost compound that has any, outside :not() — the element the rule styles (or the box it styles inside);
 *  `required` = every name outside :not() — a page the rule can style draws them all. */
export function selectorTokens(selectorList) {
  return splitTop(selectorList).map((sel) => {
    const bare = sel.replace(/\[[^\]]*\]/g, '').replace(STR_RE, '');
    const compounds = [];
    let depth = 0, cur = '';
    for (const c of bare) { if (c === '(') depth++; if (c === ')') depth--; if (!depth && /[\s>+~]/.test(c)) { if (cur) compounds.push(cur); cur = ''; } else cur += c; }
    if (cur) compounds.push(cur);
    const own = compounds.map((c) => namesIn(c.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '')));
    return { all: namesIn(bare), anchor: own.filter((n) => n.length).pop() || [], required: [...new Set(own.flat())] };
  });
}
/** css-selectors: the classes / ids of the rules an edit touched, or why it reaches further than named rules. */
export function cssChange({ hunks, oldText, newText }) {
  const tokens = new Set(), offending = [], selectors = [];
  const nodesOld = cssNodes(oldText || ''), nodesNew = cssNodes(newText || '');
  const touch = (l, nodes, tag) => {
    const covering = nodes.filter((x) => x.start <= l.line && l.line <= x.end);
    const bad = covering.find((x) => x.kind === 'at' || x.kind === 'at-child' || x.kind === 'stmt');
    if (bad) { offending.push(`${tag} line ${l.line} is in ${bad.prelude.slice(0, 60)} (not a class/id rule)`); return; }
    let styles = covering.filter((x) => x.kind === 'style');
    if (!styles.length) {
      const g = covering.filter((x) => x.kind === 'group').sort((x, y) => (y.start - x.start))[0];
      if (!g) { offending.push(`${tag} line ${l.line} is outside every rule: ${l.text.trim().slice(0, 100)}`); return; }
      styles = nodes.filter((x) => x.kind === 'style' && x.start >= g.start && x.end <= g.end); // the group's own prelude / brace: every rule inside it
    }
    for (const st of styles) {
      for (let x = st; x && x.kind === 'style'; x = x.parent) {
        for (const [k, { all, required }] of selectorTokens(x.prelude).entries()) {
          const text = splitTop(x.prelude)[k];
          if (!required.length) { offending.push(`'${text}' names no class or id (a global selector)`); continue; }
          for (const t of all) tokens.add(t);
          if (!selectors.some((y) => y.text === text)) selectors.push({ text, required });
        }
      }
    }
  };
  for (const h of changedLines(hunks, oldText, newText, { js: false })) {
    for (const l of h.minus) touch(l, nodesOld, 'old');
    for (const l of h.plus) touch(l, nodesNew, 'new');
  }
  return { attributable: !offending.length, tokens: [...tokens], selectors, offending };
}

/** The change a modeled file's diff makes (null for a file this module does not model). */
export function changeOf(file, { hunks, oldText, newText }) {
  const spec = MODELED[file];
  if (!spec) return null;
  const c = spec.rule === 'i18n-table' ? i18nChange({ hunks, oldText, newText })
    : spec.rule === 'settings-text' ? settingsChange({ hunks, oldText, newText })
      : cssChange({ hunks, oldText, newText });
  return { file, rule: spec.rule, ...c };
}
/** The runner's locale as Chrome reads it (LANGUAGE first, then LC_ALL / LC_MESSAGES / LANG). */
export const runnerLocale = (env = {}) => String(env.LANGUAGE || env.LC_ALL || env.LC_MESSAGES || env.LANG || '').split(':')[0];
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(?<![\\w-])${esc(w)}(?![\\w-])`);
// A class / id as code spells it. A hyphenated name (voice-btn) is specific anywhere; a plain word (recording, active)
// only as a selector (.recording), a whole string ('recording'), inside a class attribute / className, or a classList call.
export function tokenRe(t) {
  if (t.includes('-')) return wordRe(t);
  const w = esc(t);
  return new RegExp(`[.#]${w}(?![\\w-])|(['"\`])${w}\\1|\\bclass(?:Name)?\\s*[=:+]\\s*['"\`][^'"\`]*(?<![\\w-])${w}(?![\\w-])|classList\\.(?:add|remove|toggle|contains|replace)\\([^)]*['"\`]${w}['"\`]`);
}
const baseName = (f) => f.split('/').pop();

/** Which `suites` a modeled change reaches. `closureOf(name)` = { scripts: [rel] (the suite + the scripts/ files it
 *  loads), loads: [rel] (the product files it loads or names — never the boot prefixes) }; `textOf(rel)` = the file
 *  with comments stripped, `rawOf(rel)` = as on disk (a cheap substring prefilter; defaults to textOf); `productFiles`
 *  = the product's source files (src/, public/ — "which module draws this class"); `env` = the runner's environment.
 *  Every per-file test runs ONCE per file (a train range walks ~1 500 files for 300 suites). Answers
 *  { attributable, why, picks: Map name → reason }. */
export function ruleSelect({ change, suites, closureOf: closureRaw, textOf, rawOf = textOf, productFiles = [], env = {} }) {
  const picks = new Map();
  // THIS module is never evidence: it names every table, language and marker (a suite that loads ci.mjs walks it)
  const closureOf = (name) => { const c = closureRaw(name); return { scripts: c.scripts.filter((f) => f !== SELF), loads: c.loads.filter((f) => f !== SELF) }; };
  const add = (name, why) => { if (!picks.has(name)) picks.set(name, why); };
  // a file test, memoised per file: the raw text must hold `needle` (a substring, or the regex itself) before the
  // regex reads the comment-stripped one — most files are never stripped
  const fileTest = (needle, re) => {
    const m = new Map();
    const pre = typeof needle === 'string' ? (t) => t.includes(needle) : (t) => needle.test(t);
    return (f) => { if (!m.has(f)) m.set(f, pre(rawOf(f)) && re.test(textOf(f))); return m.get(f); };
  };
  if (!change.attributable) return { attributable: false, why: change.offending[0] + (change.offending.length > 1 ? ` (+${change.offending.length - 1} more)` : ''), picks };
  const { file, rule } = change;
  if (rule === 'i18n-table') {
    const lang = MODELED[file].lang, loc = runnerLocale(env);
    if (/^(zh|ja)/i.test(loc)) return { attributable: false, why: `the runner's locale is ${loc}: Chrome draws every page from a dictionary`, picks };
    const base = baseName(file).replace(/\.js$/, '');
    const switches = fileTest(LANG_TOKENS[lang], LANG_TOKENS[lang]);
    const opens = fileTest(base, new RegExp(`['"\`][^'"\`\\n]{0,200}\\b${base}(?:\\.js)?['"\`]`));
    for (const s of suites) {
      const c = closureOf(s.name);
      if (/i18n/.test(s.name)) { add(s.name, `an i18n census suite (${file}: ${change.keys.length} entries changed)`); continue; }
      const sw = c.scripts.find(switches);
      if (sw) { add(s.name, `renders in ${lang} (${sw} sets it; ${file}: ${change.keys.length} entries changed)`); continue; }
      const rd = [...c.scripts, ...c.loads].find((f) => f !== file && f !== 'src/lib/i18n.js' && opens(f));
      if (rd) add(s.name, `opens ${file} itself (${rd})`);
    }
    return { attributable: true, why: `${change.keys.length} dictionary entries changed — only a ${lang} page reads them`, picks };
  }
  if (rule === 'settings-text') {
    const named = [...change.keys, ...change.words.filter((w) => w.length >= 6)];
    const namesOne = (() => { const m = new Map(); return (f) => { if (!m.has(f)) { const t = textOf(f); m.set(f, named.find((w) => t.includes(w)) || null); } return m.get(f); }; })();
    const surface = fileTest(SETTINGS_SURFACE, SETTINGS_SURFACE);
    const drawers = productFiles.filter(fileTest('settings-schema', /settings-schema(?:\.js)?['"]/)).filter((f) => f !== file);
    const namesDrawer = drawers.map((f) => fileTest(baseName(f), wordRe(baseName(f))));
    for (const s of suites) {
      const c = closureOf(s.name);
      if (c.loads.includes(file)) { add(s.name, `loads ${file} in-process (${change.keys.join(', ')}: display words changed)`); continue; }
      const hit = c.scripts.map(namesOne).find(Boolean);
      if (hit) { add(s.name, `names ${JSON.stringify(hit.slice(0, 60))} (a changed row)`); continue; }
      if (c.scripts.some(surface)) { add(s.name, 'opens the Settings window (its words in the suite)'); continue; }
      const k = namesDrawer.findIndex((nd) => c.scripts.some(nd));
      if (k >= 0) add(s.name, `names ${drawers[k]}, which draws schema rows`);
    }
    return { attributable: true, why: `display words of ${change.keys.length} row(s) changed (${change.keys.slice(0, 3).join(', ')}${change.keys.length > 3 ? '…' : ''})`, picks };
  }
  // css-selectors: a selector styles a page only where the page draws every name it requires — so each changed
  // selector is keyed by its RAREST required name (the fewest client modules draw it); the client modules = src/lib/
  // and public/ (the brief's "grep in src/lib for the class names"; a server module draws nothing)
  const client = productFiles.filter((f) => (f.startsWith('src/lib/') || f.startsWith('public/')) && !/(^|\/)i18n-[a-z]+\.js$/.test(f));
  // a class named only in a comment is no drawer: a client module is read without its comments too (reading it raw
  // was 1 s faster on the .266 range and selected 127 suites instead of 98)
  const tokTest = new Map();
  const namesTok = (t) => { if (!tokTest.has(t)) tokTest.set(t, fileTest(t, tokenRe(t))); return tokTest.get(t); };
  const drawsTok = namesTok;
  const drawersOf = new Map();
  const drawers = (t) => { if (!drawersOf.has(t)) drawersOf.set(t, client.filter(drawsTok(t))); return drawersOf.get(t); };
  const everywhere = client.includes('public/index.html') && change.selectors.find((x) => x.required.every((t) => drawsTok(t)('public/index.html')));
  if (everywhere) return { attributable: false, why: `public/index.html draws every name of '${everywhere.text}' — a changed rule styles an element of every page`, picks };
  const keys = [...new Set(change.selectors.map((x) => x.required.slice().sort((a, b) => drawers(a).length - drawers(b).length)[0]))];
  const drawn = new Map(); // client file → the first key name it draws
  for (const t of keys) for (const f of drawers(t)) if (!drawn.has(f)) drawn.set(f, t);
  const pixel = fileTest(PIXEL, PIXEL);
  const namesDrawn = [...drawn.keys()].map((f) => [f, fileTest(baseName(f), wordRe(baseName(f)))]);
  for (const s of suites) {
    const c = closureOf(s.name);
    if (c.scripts.some(pixel)) { add(s.name, 'compares pixels (every drawn rule)'); continue; }
    const tok = keys.find((t) => c.scripts.some(namesTok(t)));
    if (tok) { add(s.name, `names .${tok} (a changed rule)`); continue; }
    const ld = c.loads.find((f) => drawn.has(f));
    if (ld) { add(s.name, `loads ${ld}, which draws .${drawn.get(ld)}`); continue; }
    const nm = namesDrawn.find(([, t]) => c.scripts.some(t));
    if (nm) add(s.name, `names ${nm[0]}, which draws .${drawn.get(nm[0])}`);
  }
  return { attributable: true, why: `${change.selectors.length} changed selector(s), keyed by ${keys.map((t) => '.' + t).slice(0, 4).join(' ')}${keys.length > 4 ? '…' : ''}`, picks };
}
