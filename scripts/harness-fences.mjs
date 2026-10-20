// scripts/harness-fences.mjs — THE FENCE CENSUS OF A HARNESS (lane harness-add-census, 2026-10-20; the owner 「harness测试改进也做一下吧」).
//
// THE PROBLEM, measured on lane antigravity-harness: the registry (src/harnesses/index.js — ONE descriptor per harness)
// keeps the descriptor + adapter small, and the rest of a new harness's cost was ELEVEN fences the lane met one red at a
// time: a test's id-keyed list, a cli-registry EXCLUDED row, a DECLARED_CLIS row, a count pin, a brand file, an i18n key,
// a kb-features table row, a ci.mjs row … Each is right on its own; together they must be ONE checklist a lane sees at
// once. This module DERIVES that checklist — never a hand list of fences (the memory law):
//
//   · THE TABLE FENCES: every literal TABLE in the tree keyed by harness — an object keyed by id, a list of ids, rows
//     carrying `id:`/`backend:`/`key:` …, a regex or string alternation `claude|codex|…`, a switch on ids — in which ≥ 3 of
//     the REGISTERED harnesses co-occur (acorn over every scripts/**.mjs + src/**, by git ls-files — tracked + untracked-not-ignored, fixtures excepted;
//     a comment is never a table). A harness is keyed by its id OR its program name (`agy` for antigravity: cli-env's
//     `h.acp || h.exe`). For EVERY registered harness and EVERY such site: present, or a FENCE_EXEMPT row with a reason
//     (a codex-only table; shell is a terminal, not a program) — a row that exempts nothing any more is DEAD (red).
//     A numeric pin beside a site that equals its row count (`ids().length === 5`) is named with it.
//   · THE ROW KINDS: the fences no table shows, each a function of the descriptor — d.wrapper → the cli-registry EXCLUDED
//     row + the peer-text DECLARED_CLIS row; a chat harness → public/brand/<id>.svg, its own suite + a scripts/ci.mjs row,
//     an i18n key (zh + ja) for its settings category (= its label); d.id → the New Session <option>, the kb-features
//     harness tables, the registry's require line (built-ins); d.settings → the Settings window's Harnesses group.
//   · THE RULES: the traps that are rules rather than rows (a count pin, a strip leg, the egress / alias / clock /
//     changelog-length laws) — each with a needle the census keeps ALIVE in its suite, printed as the checklist's tail.
//
// THE CHECKLIST is the census's output: «<file>: add <the row>». scripts/test-harness-add-census.mjs runs it on the real
// registry (green, or a real fence lacks an id today) and on a planted descriptor in a child (every fence named);
// scripts/harness-new.mjs IMPORTS the row kinds (their `insert`) — one source of truth, never a second list.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as acorn from 'acorn';
import { gitEnvFrom } from './git-env.mjs';

const require = createRequire(import.meta.url);

/** The tracked files under `pathspecs` (git ls-files -z through the sanitized git env — the pre-push hook's GIT_DIR /
 *  GIT_INDEX_FILE would re-point git). Never a directory walk: a census learns what exists from git. `{ untracked: true }`
 *  adds the untracked-not-ignored files (the id-branch census's scope rule): a lane's new suite is a fence row before its
 *  `git add`, and a stray copy must be VISIBLE (§51), never skipped. */
export function trackedFiles(repo, ...pathspecs) {
  const opts = pathspecs.length && typeof pathspecs[pathspecs.length - 1] === 'object' ? pathspecs.pop() : {};
  const args = ['ls-files', '-z', ...(opts.untracked ? ['--cached', '--others', '--exclude-standard'] : []), '--', ...pathspecs];
  const out = execFileSync('git', args, { cwd: repo, env: gitEnvFrom(process.env), maxBuffer: 1 << 26 });
  return [...new Set(out.toString('utf8').split('\0').filter(Boolean))];
}
/** The code the table census reads: every script (the suites, the gate's tier table, the census helpers the suites import —
 *  scripts/id-branch-census.mjs's own family list was a fence nobody saw) and every source file; scripts/fixtures/ is data. */
export const SCAN_PATHSPECS = Object.freeze(['scripts', 'src']);
export function scanSet(repo) { return trackedFiles(repo, ...SCAN_PATHSPECS, { untracked: true }).filter((f) => /\.(?:m?js|cjs)$/.test(f) && !f.startsWith('scripts/fixtures/') && !/^src\/lib\/i18n-[a-z]+\.js$/.test(f)); } // the i18n dictionaries are words, not tables (scripts/id-branch-census.mjs's scope rule too)

/** The names a harness is keyed by, read off its descriptor. `program` = the executable cli-env resolves (`h.acp ||
 *  h.exe`; a chat harness without either runs a program named as its id — claude, codex); a terminal harness has none. */
export function harnessNames(d) {
  const program = d.exe?.command || d.acp?.command || (d.kind === 'terminal' ? null : d.id);
  const table = d.settings && typeof d.settings === 'object' ? d.settings : null;
  return {
    id: d.id, kind: d.kind, label: d.label, program,
    keys: [...new Set([d.id, program].filter(Boolean))],
    wrapper: d.wrapper || null,
    brand: d.brand || d.acp?.brand || null,
    hasCreds: !!d.creds,
    settingsPrefix: table ? (table.prefix || d.settingsPrefix || d.id) : null,
    category: table ? (table.category || null) : null,
  };
}

// ── THE TABLE SCAN ──────────────────────────────────────────────────────────────────────────────────────────────────
const ID_FIELDS = new Set(['id', 'backend', 'harness', 'harnessId', 'key']);
const MIN_IDS = 3;
const litStr = (n) => (n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : null);
const keyName = (p) => {
  if (!p || p.type !== 'Property') return null;
  if (p.computed) return litStr(p.key);
  return p.key.type === 'Identifier' ? p.key.name : litStr(p.key);
};
function parse(text) {
  const opts = { ecmaVersion: 'latest', allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowImportExportEverywhere: true, locations: true };
  try { return acorn.parse(text, { ...opts, sourceType: 'module' }); } catch { return acorn.parse(text, { ...opts, sourceType: 'script' }); }
}
function walk(node, visit, anc = []) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, anc);
  anc.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'type') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, anc); }
    else if (v && typeof v.type === 'string') walk(v, visit, anc);
  }
  anc.pop();
}
const WORD = /[A-Za-z0-9_-]+/g;
const LITERAL = /['"`]([a-z][a-z0-9-]*)['"`]|(?:^|[\s{,])([a-z][a-z0-9-]*)\s*:(?!:)|(?<=\|)([a-z][a-z0-9-]*)|([a-z][a-z0-9-]*)(?=\|)/gm; // the pipe forms are zero-width: `claude|codex|` must credit both
/** The harness ids a token list names (by id or program), distinct. */
function matchKeys(tokens, byKey) {
  const found = new Set();
  for (const t of tokens) if (t != null && byKey.has(t)) found.add(byKey.get(t));
  return [...found];
}
function declOf(src, anc) {
  for (let i = anc.length - 1; i >= 0; i--) {
    const a = anc[i];
    if (a.type === 'VariableDeclarator' && a.id.type === 'Identifier') return a.id.name;
    if (a.type === 'Property') { const k = keyName(a); if (k) return k; }
    if (a.type === 'AssignmentExpression') return src.slice(a.left.start, a.left.end).slice(0, 40);
    if (a.type === 'CallExpression') {
      const callee = src.slice(a.callee.start, a.callee.end).slice(0, 30);
      const first = a.arguments[0] && litStr(a.arguments[0]);
      return first ? `${callee}('${first.slice(0, 50)}…')` : `${callee}(…)`;
    }
  }
  return '(top level)';
}
function statementOf(anc) {
  for (let i = anc.length - 1; i >= 0; i--) if (/(?:Statement|Declaration)$/.test(anc[i].type) && anc[i].type !== 'BlockStatement' && anc[i].type !== 'Program') return anc[i];
  return null;
}
function countPins(src, anc, n) {
  const st = statementOf(anc);
  if (!st) return [];
  const t = src.slice(st.start, st.end);
  const pins = [];
  for (const m of t.matchAll(/(\.length\s*)?(===|==)\s*(\d+)\b/g)) if (Number(m[3]) === n) pins.push({ n, text: m[0].replace(/\s+/g, ' ') });
  return pins;
}
const TEXTS = new Map(); // abs → { key: mtime+size, text } — the same string object across census runs (one read, one hash)
function readCached(abs) {
  let st = null; try { st = fs.statSync(abs); } catch { return null; }
  const key = `${st.mtimeMs}:${st.size}`, hit = TEXTS.get(abs);
  if (hit && hit.key === key) return hit.text;
  let text = null; try { text = fs.readFileSync(abs, 'utf8'); } catch { return null; }
  TEXTS.set(abs, { key, text });
  return text;
}
const MEMO = new Map(); // text → Map<keysSig, sites>
/** Every harness-keyed table site in one file's source. `names` = harnessNames() rows. */
export function tableSites(rel, text, names) {
  const byKey = new Map();
  for (const n of names) for (const k of n.keys) byKey.set(k, n.id);
  const sig = [...byKey.keys()].sort().join('|');
  let perText = MEMO.get(text);
  if (!perText) { perText = new Map(); MEMO.set(text, perText); }
  if (perText.has(sig)) return perText.get(sig).map((s) => ({ ...s, file: rel }));
  const sites = [];
  // THE PRE-FILTER (67 MB → the few files that could hold a table): a file must name ≥ MIN_IDS harnesses at all
  // (includes), and name them in a LITERAL position — quoted, an object key, beside a `|` — as every shape below does
  const quick = new Set();
  for (const [k, id] of byKey) if (text.includes(k)) quick.add(id);
  const literal = new Set();
  if (quick.size >= MIN_IDS) for (const m of text.matchAll(LITERAL)) { const id = byKey.get(m[1] || m[2] || m[3] || m[4]); if (id) literal.add(id); }
  if (literal.size >= MIN_IDS) {
    const ast = parse(text);
    const push = (node, anc, shape, found, keysSeen) => {
      if (found.length < MIN_IDS) return;
      sites.push({ file: rel, line: node.loc.start.line, endLine: node.loc.end.line, shape, decl: declOf(text, anc), head: text.slice(node.start, node.start + 160).replace(/\s+/g, ' '), found, keysSeen, countPins: countPins(text, anc, found.length) });
    };
    walk(ast, (node, anc) => {
      if (node.type === 'ObjectExpression') {
        const keys = node.properties.map(keyName);
        push(node, anc, 'object', matchKeys(keys, byKey), keys.filter((k) => byKey.has(k)));
      } else if (node.type === 'ArrayExpression') {
        const strs = node.elements.map(litStr);
        if (matchKeys(strs, byKey).length >= MIN_IDS) { push(node, anc, 'list', matchKeys(strs, byKey), strs.filter((s) => byKey.has(s))); return; }
        const rowKeys = node.elements.map((e) => {
          if (!e) return null;
          if (e.type === 'ObjectExpression') { for (const p of e.properties) { const k = keyName(p); if (k && ID_FIELDS.has(k) && litStr(p.value) != null) return litStr(p.value); } return null; }
          if (e.type === 'ArrayExpression' && e.elements[0]) return litStr(e.elements[0]);
          return null;
        });
        push(node, anc, 'rows', matchKeys(rowKeys, byKey), rowKeys.filter((s) => byKey.has(s)));
      } else if (node.type === 'Literal' && node.regex) {
        const toks = node.regex.pattern.match(WORD) || [];
        push(node, anc, 'regex', matchKeys(toks, byKey), toks.filter((s) => byKey.has(s)));
      } else if (node.type === 'Literal' && typeof node.value === 'string' && node.value.includes('|')) {
        const toks = node.value.split('|').map((s) => s.replace(/^[^A-Za-z0-9_-]+|[^A-Za-z0-9_-]+$/g, ''));
        push(node, anc, 'alternation', matchKeys(toks, byKey), toks.filter((s) => byKey.has(s)));
      } else if (node.type === 'SwitchStatement') {
        const cs = node.cases.map((c) => litStr(c.test));
        push(node, anc, 'switch', matchKeys(cs, byKey), cs.filter((s) => byKey.has(s)));
      }
    });
  }
  perText.set(sig, sites.map((s) => { const { file, ...rest } = s; return rest; }));
  return sites;
}
/** The whole tree's sites. `files` = [{ rel, text }]. */
export function scanTables(files, names) {
  const out = [];
  for (const { rel, text } of files) out.push(...tableSites(rel, text, names));
  return out;
}

// ── THE EXEMPTIONS: a judgment per site and id, with its reason (the only hand-written part; a dead row is red) ──────
/** { file, needle (a substring of `<decl> <head>`), ids: [harness ids the site rightly omits], why } */
export const FENCE_EXEMPT = Object.freeze([
  { file: 'scripts/ci.mjs', needle: 'REAL_PROGRAMS', ids: ['shell'], why: "a terminal session runs the person's own shell — no program a suite spawns by harness name" },
  { file: 'scripts/ci.mjs', needle: 'REAP_NAMES', ids: ['shell'], why: 'the reaper names agent PROGRAMS left behind; the shell harness has none' },
  { file: 'scripts/test-architecture.mjs', needle: 'KEY_LITERAL', ids: ['shell'], why: 'shell declares no settings table — no `shell.` key can exist' },
  { file: 'scripts/test-architecture.mjs', needle: 'ARG_LITERAL', ids: ['shell'], why: 'shell declares no settings table — no harnessSetting(\'shell\') can exist' },
  { file: 'scripts/test-architecture.mjs', needle: 'schema.matchAll', ids: ['shell'], why: 'shell declares no settings table — no `shell.` schema row can exist' },
  { file: 'scripts/test-architecture.mjs', needle: 'REAL_CLI', ids: ['shell'], why: 'the real-CLI census names agent PROGRAMS; the shell harness has none' },
  { file: 'scripts/test-contributions.mjs', needle: 'cartesian(', ids: ['opencode', 'antigravity'], why: "the cartesian is the LEGACY menu builder's domain (the test's frozen copy of the pre-registry session-card menu: the three original backends + undefined); opencode has a registry-only item (session.opencodeTerminal — measured: the oracle lacks «Open terminal in this session»), and a new harness's menu is judged by the registry's caps, never by the frozen oracle" },
  { file: 'scripts/test-exit-forensics.mjs', needle: 'r1Table', ids: ['shell'], why: 'the rows are CHAT conversations (mode chat, mid-turn); a terminal has no turn to respawn' },
  { file: 'scripts/test-harness-contract.mjs', needle: 'every((id) => HARNESSES[id])', ids: ['opencode', 'antigravity'], why: 'the three ORIGINAL built-ins as the registry sanity pin; the conformance loop below runs every registered id' },
  { file: 'scripts/test-harness-contract.mjs', needle: '.every((id) => capsOf(id).worktree.supported === false)', ids: ['claude'], why: "the pin's SUBJECT: the same line asserts claude is the one harness WITH the --worktree flag; the list is everyone else" },
  { file: 'scripts/test-harness-contract.mjs', needle: 'consumers', ids: ['shell'], why: 'the stdout consumer per chat harness; a terminal has no stream protocol' },
  { file: 'scripts/test-model-providers.mjs', needle: "'gemini', 'gemini'", ids: ['antigravity', 'shell'], why: "the provider KINDS' harness projection (q-045 §2.2): antigravity has no provider kind yet (Google's own login only); shell runs no model" },
  { file: 'scripts/test-queue-steer.mjs', needle: "[['codex', 'codex']", ids: ['shell'], why: 'the queue verbs per chat harness; a terminal has no queue' },
  { file: 'scripts/test-queue-steer.mjs', needle: "=== 'codex'|=== 'claude'", ids: ['shell'], why: 'the no-id-branch pin over the queue-op case and the composer: a terminal has no queue, nothing there can branch on it' },
  { file: 'scripts/test-settings-view.mjs', needle: 'harnesses', ids: ['shell'], why: 'the installed-CLI facts of the Settings view; shell has no settings section' },
  { file: 'src/artifacts.js', needle: 'AGENT_CONFIG_DIR', ids: ['antigravity', 'shell'], why: "keyed by the agent's config DOTDIR, not its id: antigravity's is .gemini (listed); a terminal has none" },
  { file: 'src/harness-settings.js', needle: 'HARNESS_SETTINGS', ids: ['shell'], why: 'shell declares no settings table (the contract allows none)' },
  { file: 'src/lib/app.js', needle: 'BACKEND_SESSION_OPTIONS', ids: ['shell'], why: 'a terminal has no model / effort options' },
  { file: 'src/lib/manage-agents.js', needle: 'BACKENDS', ids: ['opencode', 'shell'], why: "the Agents panel's CLI rows (a login / update / install command each): an ACP agent's presence rides the server's harness list (cli-env), a terminal is no CLI" },
  { file: 'src/model-providers.js', needle: "kind('self-hosted", ids: ['antigravity', 'shell'], why: "a kind's harness list is its interface projection (q-045 §2.2): antigravity speaks only Google's own login; shell runs no model" },
]);

export function fenceVerdict(sites, names, exempt = FENCE_EXEMPT) {
  const missing = []; const used = new Set();
  for (const s of sites) {
    const key = `${s.decl} ${s.head}`;
    for (const n of names) {
      if (s.found.includes(n.id)) continue;
      const ex = exempt.findIndex((e) => e.file === s.file && key.includes(e.needle) && e.ids.includes(n.id));
      if (ex >= 0) { used.add(ex); continue; }
      missing.push({ file: s.file, line: s.line, shape: s.shape, decl: s.decl, head: s.head, id: n.id, add: n.keys.length > 1 ? `'${n.id}' (or its program '${n.program}')` : `'${n.id}'`, countPins: s.countPins });
    }
  }
  const dead = exempt.filter((e, i) => !used.has(i));
  // the product's tables first (src/backend-caps.js, src/lib/agent-meta.js … — the contract suite needs those rows before it
  // can list the rest), then the suites' pins; file order within
  const rank = (f) => (f.startsWith('src/') ? 0 : f.startsWith('scripts/ci.mjs') ? 1 : 2);
  missing.sort((a, b) => rank(a.file) - rank(b.file) || a.file.localeCompare(b.file) || a.line - b.line);
  return { missing, dead };
}

// ── THE ROW KINDS: each a function of the descriptor; `check` names what is missing, `insert` writes it (the generator) ─
const base = (p) => path.posix.basename(p);
const agentCliRe = (suiteText) => { const m = /const AGENT_CLI_RE = \/(.*)\/([a-z]*);/.exec(suiteText || ''); return m ? new RegExp(m[1], m[2]) : null; };
const block = (text, open, close) => { const a = text.indexOf(open); if (a < 0) return null; const b = text.indexOf(close, a); return b < 0 ? null : { a, b: b + close.length, body: text.slice(a, b) }; };
const insertBefore = (text, marker, row) => { const i = text.indexOf(marker); if (i < 0) throw new Error(`insert: marker not found: ${marker}`); return text.slice(0, i) + row + text.slice(i); };
export const ROW_KINDS = Object.freeze([
  {
    kind: 'cli-registry-excluded', file: 'scripts/test-cli-registry.mjs',
    applies: (n) => !!n.wrapper,
    row: (n) => `  '${base(n.wrapper)}': 'a wrapper the server spawns a ${n.label} chat session through',\n`,
    check(n, ctx) { const b = block(ctx.read(this.file) || '', 'const EXCLUDED = Object.freeze({', '\n});'); return b && b.body.includes(`'${base(n.wrapper)}':`) ? [] : [{ file: this.file, row: `${this.row(n).trim()} — inside EXCLUDED (every data/bin file has one registry row or one EXCLUDED reason)` }]; },
    insert(n, text) { const b = block(text, 'const EXCLUDED = Object.freeze({', '\n});'); if (!b) throw new Error('EXCLUDED block not found'); return text.slice(0, b.b - 4) + this.row(n) + text.slice(b.b - 4); },
  },
  {
    kind: 'peer-text-declared', file: 'scripts/test-peer-text-census.mjs',
    applies: (n) => !!n.wrapper,
    row: (n) => `  '${n.wrapper}': 'a harness WRAPPER: its stdout is the server\\'s stream-json feed, never an agent\\'s Bash result (${n.label})',\n`,
    check(n, ctx) {
      const suite = ctx.read(this.file) || '';
      const b = block(suite, 'const DECLARED_CLIS = {', '\n};');
      if (b && b.body.includes(`'${n.wrapper}':`)) return [];
      const re = agentCliRe(suite), w = ctx.read(n.wrapper);
      if (re && w != null && !re.test(w)) return []; // a wrapper that never reaches the agent API needs no declaration
      return [{ file: this.file, row: `${this.row(n).trim()} — inside DECLARED_CLIS (a data/bin file that reaches the agent API is walked or declared)` }];
    },
    insert(n, text) { const b = block(text, 'const DECLARED_CLIS = {', '\n};'); if (!b) throw new Error('DECLARED_CLIS block not found'); return text.slice(0, b.b - 3) + this.row(n) + text.slice(b.b - 3); },
  },
  {
    kind: 'brand-svg', file: (n) => `public/brand/${n.id}.svg`,
    applies: (n) => n.kind === 'chat',
    check(n, ctx) {
      const f = this.file(n), out = [];
      if (!ctx.exists(f)) out.push({ file: f, row: `the harness's mark (an svg; the client META row's iconSrc and the descriptor's brand name '/brand/${n.id}.svg')` });
      if (n.brand && n.brand !== `/brand/${n.id}.svg`) out.push({ file: f, row: `the descriptor's brand is '${n.brand}' — name '/brand/${n.id}.svg' (one file per harness id)` });
      return out;
    },
    insert(n) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#888"/><text x="12" y="16" text-anchor="middle" font-size="12" font-family="sans-serif" fill="#fff">${n.label.slice(0, 1).toUpperCase()}</text></svg>\n`; },
  },
  {
    kind: 'i18n-category', file: ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js'],
    applies: (n) => n.kind === 'chat',
    key: (n) => n.category || n.label,
    row(n) { return `  ${JSON.stringify(this.key(n))}: ${JSON.stringify(this.key(n))},\n`; },
    check(n, ctx) { const k = this.key(n); return this.file.filter((f) => !(ctx.read(f) || '').includes(`\n  ${JSON.stringify(k)}:`)).map((f) => ({ file: f, row: `${this.row(n).trim()} — the Settings category (= the label) is translated: a key in each language file` })); },
    insert(n, text) { const i = text.lastIndexOf('\n}'); if (i < 0) throw new Error('i18n object end not found'); return text.slice(0, i) + '\n' + this.row(n).replace(/\n$/, '') + text.slice(i); },
  },
  {
    kind: 'settings-group', file: 'src/lib/settings-schema.js',
    applies: (n) => !!n.category,
    row: (n) => `t('${n.category}')`,
    check(n, ctx) { const m = /\{ id: 'harness', label: t\('Harnesses'\), categories: \[([^\]]*)\] \}/.exec(ctx.read(this.file) || ''); return m && m[1].includes(this.row(n)) ? [] : [{ file: this.file, row: `${this.row(n)} — in SETTINGS_GROUPS' harness group categories (the Settings window's Harnesses tree)` }]; },
    insert(n, text) { const m = /(\{ id: 'harness', label: t\('Harnesses'\), categories: \[[^\]]*)(\] \})/.exec(text); if (!m) throw new Error('harness group not found'); return text.slice(0, m.index) + m[1] + `, ${this.row(n)}` + m[2] + text.slice(m.index + m[0].length); },
  },
  {
    kind: 'backend-option', file: 'public/index.html',
    applies: () => true,
    row: (n) => `<option value="${n.id}" hidden>${n.label}</option>`,
    check(n, ctx) { return (ctx.read(this.file) || '').includes(`<option value="${n.id}"`) ? [] : [{ file: this.file, row: `${this.row(n)} — in the New Session Backend <select id="input-backend"> (hidden until the CLI resolves)` }]; },
    insert(n, text) { return insertBefore(text, '<option value="shell"', this.row(n)); },
  },
  {
    kind: 'own-suite-ci-row', file: 'scripts/ci.mjs',
    applies: (n) => n.kind === 'chat',
    suite: (n) => `scripts/test-${n.id}-harness.mjs`,
    row: (n) => `  { name: 'test-${n.id}-harness', tier: 'fast', why: 'in-process · <measure> s — the ${n.label} descriptor ⇄ its fixture; the wrapper against a stub ${n.program}' },\n`,
    ownSuites(ctx) { // which suites require which descriptor file — one pass over the suites per census
      if (!ctx.memo.ownSuites) {
        const m = new Map();
        for (const f of ctx.files) {
          if (!/^scripts\/test-.*\.mjs$/.test(f) || /test-architecture\.mjs$|test-harness-contract\.mjs$|test-harness-add-census\.mjs$/.test(f)) continue;
          for (const h of (ctx.read(f) || '').matchAll(/harnesses\/([a-z][a-z0-9-]*)(?:\.js)?['"`]/g)) { if (!m.has(h[1])) m.set(h[1], []); if (!m.get(h[1]).includes(f)) m.get(h[1]).push(f); }
        }
        ctx.memo.ownSuites = m;
      }
      return ctx.memo.ownSuites;
    },
    check(n, ctx) {
      const own = this.ownSuites(ctx).get(n.id) || [];
      if (!own.length) return [{ file: this.suite(n), row: `the harness's own fast suite (requires src/harnesses/${n.id}.js: the descriptor ⇄ its measured fixture, the wrapper against a stub ${n.program}) + its ${this.file} row ${this.row(n).trim()}` }];
      const ci = ctx.read(this.file) || '';
      return own.filter((f) => !ci.includes(`name: '${base(f).replace(/\.mjs$/, '')}'`)).map((f) => ({ file: this.file, row: `{ name: '${base(f).replace(/\.mjs$/, '')}', tier: 'fast', why: 'in-process · <measure> s' } — every scripts/test-*.mjs is in one tier` }));
    },
    insert(n, text) { return insertBefore(text, "  { name: 'test-harness-contract', tier: 'fast'", this.row(n)); },
  },
  {
    kind: 'kb-features', file: 'docs/kb-features.md',
    applies: () => true,
    row: (n) => `| ${n.id} | TODO | TODO | TODO | TODO |`,
    check(n, ctx) {
      const text = ctx.read(this.file) || '', out = [];
      for (const t of mdTables(text, ctx.names)) if (!t.ids.includes(n.id)) out.push({ file: `${this.file}:${t.line}`, row: `a row for ${n.id} in the «${t.header}» table (every harness-keyed table names every harness)` });
      if (!text.includes(n.label)) out.push({ file: this.file, row: `a feature entry naming «${n.label}» (what the user can do with it, under the lane's heading)` });
      return out;
    },
    insert(n, text, ctx) {
      // a TODO row at the end of every harness-keyed table that lacks the id (bottom-up so the line numbers hold)
      for (const t of mdTables(text, ctx.names).slice().reverse()) if (!t.ids.includes(n.id)) { const lines = text.split('\n'); lines.splice(t.endLine, 0, `| ${n.id} |${' TODO |'.repeat(Math.max(1, t.cols - 1))}`); text = lines.join('\n'); }
      if (!text.includes(n.label)) { // the feature entry, after the last harness-keyed table (the lane rewrites it in the user's words)
        const tables = mdTables(text, ctx.names), last = tables.length ? tables[tables.length - 1].endLine : null;
        const entry = `- **${n.label} conversations — TODO (the lane's entry): what a person can do with it, in their words; the measured facts the harness rests on.**`;
        if (last == null) text += `\n${entry}\n`;
        else { const lines = text.split('\n'); lines.splice(last, 0, '', entry); text = lines.join('\n'); }
      }
      return text;
    },
  },
  {
    kind: 'registry-require', file: 'src/harnesses/index.js',
    applies: (n, ctx) => ctx.builtin.includes(n.id),
    row: (n) => `require('./${n.id}')`,
    check(n, ctx) { return (ctx.read(this.file) || '').includes(this.row(n)) ? [] : [{ file: this.file, row: `${this.row(n)} — in the built-in descriptor list (the registry loop)` }]; },
    insert(n, text) { const m = /for \(const h of \[(require\('\.\/[a-z-]+'\)(?:, require\('\.\/[a-z-]+'\))*)\]\)/.exec(text); if (!m) throw new Error('registry loop not found'); return text.slice(0, m.index) + m[0].replace(m[1], `${m[1]}, ${this.row(n)}`) + text.slice(m.index + m[0].length); },
  },
]);

/** The markdown tables of a doc keyed by harness: ≥ MIN_IDS distinct ids among the first cells. `names` may be [] (then
 *  the ids found are by the cell text alone — the generator's insert reads only `endLine`/`cols`). */
const MD_MEMO = new Map();
export function mdTables(text, names) {
  const sig = names.map((n) => n.id).join('|');
  let per = MD_MEMO.get(text); if (!per) { per = new Map(); MD_MEMO.set(text, per); }
  if (per.has(sig)) return per.get(sig);
  const out = mdTablesScan(text, names);
  per.set(sig, out);
  return out;
}
function mdTablesScan(text, names) {
  const lines = text.split('\n'); const out = []; let i = 0;
  const idOf = (cell) => { const c = cell.toLowerCase(); for (const n of names) if (new RegExp(`(?<![a-z0-9_-])${n.id}(?![a-z0-9_-])`).test(c)) return n.id; return null; };
  while (i < lines.length) {
    if (!/^\|/.test(lines[i])) { i++; continue; }
    const start = i; while (i < lines.length && /^\|/.test(lines[i])) i++;
    const rows = lines.slice(start, i);
    if (rows.length < 3) continue;
    const cells = rows.slice(2).map((r) => r.split('|')[1].trim());
    const ids = [...new Set(cells.map(idOf).filter(Boolean))];
    if (ids.length >= MIN_IDS) out.push({ line: start + 1, endLine: i, header: rows[0].split('|')[1].trim(), cols: rows[0].split('|').length - 2, ids });
  }
  return out;
}

// ── THE RULES: traps that are laws, not rows — a needle each, kept alive in its suite ───────────────────────────────
export const RULES = Object.freeze([
  { suite: 'scripts/test-settings-view.mjs', needle: 'h\\.acp \\|\\| h\\.exe', what: 'the installed-CLI pin: a non-ACP executable rides `exe: {command}` (cli-env `h.acp || h.exe`); the advanced-tier bound (`adv.length <= 95`) moves when the harness adds advanced rows' },
  { suite: 'scripts/test-codex-pool.mjs', needle: 'rosterSort', what: 'the roster count pin = the harnesses WITH creds (an account roster each, src/lib/manage-agents.js): a harness with creds adds a `.sort(rosterSort)` roster and bumps the pin', derive: (names) => names.filter((n) => n.hasCreds).length },
  { suite: 'scripts/test-harness-spawn.mjs', needle: "spawnForm: 'isolated-home'", what: 'a creds.spawnForm the create path resolves (securestorage | isolated-home): a new form needs a register()ed leg here' },
  { suite: 'scripts/test-agent-env.mjs', needle: 'keyEnvVars', what: 'every creds.keyEnvVars name is stripped from agents AND jobs — a leg per harness that declares any; never put HOME in a *EnvVar field (it would strip HOME from everything: the census guards it)' },
  { suite: 'scripts/test-channels-egress.mjs', needle: 'host literal', what: 'a vendor host literal in a wrapper / adapter that makes requests is an undecided egress: a redacted pointer, or an EXPLAINED row' },
  { suite: 'scripts/test-record-clear-census.mjs', needle: 'one-level alias pass', what: 'a peer-text field copied into a local and read at a sink (even a truthiness test inside a notice) is judged — belt it or declare it' },
  { suite: 'scripts/test-ci-gate.mjs', needle: 'Date.now() delta', what: 'a fast suite carries no wall-clock bound (`Date.now()` / `performance.now()` deltas): a complexity claim is a COUNT' },
  { suite: 'scripts/test-changelog-style.mjs', needle: 'en 160 / zh 90 / ja 90', what: 'changelog bullets: one line each, en ≤ 160 / zh ≤ 90 / ja ≤ 90 code points, no engineering words, the next-patch heading' },
]);

// ── THE CENSUS ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** @param override — { rel: text } replaces a file's text (a mutant), text null = the file is gone. */
export function census({ repo, descriptors, builtin = null, override = {}, exempt = FENCE_EXEMPT, files = null } = {}) {
  const names = descriptors.map(harnessNames);
  files = files || scanSet(repo);
  const read = (rel) => (Object.prototype.hasOwnProperty.call(override, rel) ? override[rel] : readCached(path.isAbsolute(rel) ? rel : path.join(repo, rel)));
  const exists = (rel) => (Object.prototype.hasOwnProperty.call(override, rel) ? override[rel] != null : fs.existsSync(path.join(repo, rel)));
  const ctx = { repo, read, exists, files, names, builtin: builtin || descriptors.map((d) => d.id), memo: {} };
  const sites = scanTables(files.map((rel) => ({ rel, text: read(rel) })).filter((f) => f.text != null), names);
  const { missing, dead } = fenceVerdict(sites, names, exempt);
  const rows = [];
  for (const k of ROW_KINDS) for (const n of names) if (k.applies(n, ctx)) for (const m of k.check(n, ctx)) rows.push({ kind: k.kind, id: n.id, ...m });
  const rules = RULES.map((r) => { const t = read(r.suite); return { ...r, alive: !!t && t.includes(r.needle), derived: r.derive ? r.derive(names) : null }; });
  const checklist = [
    ...missing.map((m) => `${m.file}:${m.line}: add ${m.add} to ${m.decl} (a ${m.shape} keyed by harness: ${m.head.slice(0, 48)}…)${m.countPins.length ? ` and move its count pin ${m.countPins.map((p) => `${p.text} → ${p.n + 1}`).join(', ')}` : ''}`),
    ...rows.map((r) => `${r.file}: add ${r.row}`),
    ...dead.map((d) => `${d.file}: DEAD exemption «${d.needle}» for ${d.ids.join(', ')} — nothing is missing there any more (drop the row)`),
    ...rules.map((r) => `rule · ${r.suite}: ${r.what}${r.derived != null ? ` (derived today: ${r.derived})` : ''}${r.alive ? '' : ' — ITS NEEDLE IS GONE: the rule moved or died; re-find it'}`),
  ];
  return { names, sites, missing, dead, rows, rules, checklist, ok: !missing.length && !dead.length && !rows.length && rules.every((r) => r.alive) };
}

/** The checklist as text — what a new harness lane reads. */
export function formatChecklist(result) {
  const fenceLines = result.checklist.filter((l) => !l.startsWith('rule · '));
  const ruleLines = result.checklist.filter((l) => l.startsWith('rule · '));
  return [
    `${fenceLines.length} row(s) to add for ${result.names.map((n) => n.id).join(', ')} (${result.sites.length} harness-keyed table sites + ${ROW_KINDS.length} row kinds):`,
    ...fenceLines.map((l) => `  · ${l}`),
    `${ruleLines.length} rule(s) a harness lane meets:`,
    ...ruleLines.map((l) => `  · ${l.slice('rule · '.length)}`),
  ].join('\n');
}

export function loadRegistry(repo) { return require(path.join(repo, 'src/harnesses/index.js')); }

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const repo = path.resolve(process.argv[2] || process.cwd());
  const H = loadRegistry(repo);
  const r = census({ repo, descriptors: H.list(), builtin: H.ids().filter((id) => H.isBuiltin(id)) });
  console.log(formatChecklist(r));
  process.exit(r.ok ? 0 : 1);
}
