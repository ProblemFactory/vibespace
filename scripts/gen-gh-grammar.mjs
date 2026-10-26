#!/usr/bin/env node
// THE gh GRAMMAR, GENERATED FROM gh's OWN --help (lane vault-agent-own — the registry law: a kind of fact is ONE table
// derived from its source, with a census that fails a drift). gh's flags are PER VERB, so a hand-kept list drifts from the
// tool and leaks a host. src/vault-run.js's gh row ships the table + the program-naming env list this script generates;
// test-vault-run-model ⑤c re-runs the SAME parse against the live gh and diffs the WHOLE tree — any drift (a host-reaching
// verb added/removed, a value flag, a repository TYPE/description, a positional spec, a hostname short, a default-host-only
// verb, a program-naming env var) is RED by name.
//
//   node scripts/gen-gh-grammar.mjs            # print the literal (grammar + version + envHijack) to stdout
//   node scripts/gen-gh-grammar.mjs --write    # rewrite the gh row's `grammar` + `grammarVersion` + `envHijack` IN PLACE
//   node scripts/gen-gh-grammar.mjs --write --force "<reason>"   # allow a SHRINK (fewer verbs than shipped) deliberately
//
// FAIL CLOSED (round 6), with two deliberate openings (round 7). The reader reads only the spellings it can read with
// CERTAINTY and BLINDS the rest of gh (a dash before the verb words, or a verb absent from this table — an extension, a typo).
// The table maps "<group> <verb>" → either
//   { value:[flags that take an argument, long+short], repoValues:[value flags whose TYPE column is a repository /
//     [HOST/]OWNER/REPO, OR whose DESCRIPTION names a repository — read as a HOST/OWNER/REPO spec], spec:1 (a positional gh
//     resolves with ghrepo.FromFullName — <…repo[sitory]> / <destination-repo> / a curated <name>), host:'-x' (the
//     --hostname short for this verb, or null) }   — a verb that REACHES A HOST
//   { default:1 }   — a verb a POSITIVE proof clears (round 8): it reaches no host (no repository/host-typed arg, no --hostname,
//     no repository-typed/-named value) AND its help names no program-execution / download / git-road word and no url/path/spec/
//     gist positional — so it runs ok:own, never a FALSE blind, never hand-picked. A verb that reaches no host and FAILS the
//     positive proof (gh copilot execs a PATH program, gh gist clone drives git) is ABSENT ⇒ BLIND, like an unknown verb.
// A verb with NO parseable --help (`unreadable`: a gh extension exec) is also absent and BLINDS. bool flags are NOT kept:
// shapeOf never reads them (the git-driving bool shorts live in the row's blindFlagSubs), and a flag whose MEANING moved from
// bool to value still shows up in `value` — so the equality census stays meaningful and lean.
//
// envHijack: the program-naming env vars gh honours (GH_BROWSER/GH_EDITOR/GH_PAGER + the generic BROWSER/EDITOR/VISUAL/PAGER),
// DERIVED from `gh help environment` (a paragraph whose description names an editor / browser / pager), never a hand list —
// gh reads the GH_ ones FIRST, so a minted value must not run gh with one set. GH_FORCE_TTY is NOT program-naming (its
// description names columns, not a program) and is correctly excluded by the derivation.
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const ghHelp = (args) => { try { return execFileSync('gh', [...args, '--help'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
export const ghHelpAsync = (args) => new Promise((res) => execFile('gh', [...args, '--help'], { encoding: 'utf8', timeout: 15000, maxBuffer: 8e6 }, (e, o) => res(e ? null : o)));   // the census fetches ~250 helps in parallel — the SAME parse (parseHelp), so no drift vs the serial generator
export const ghHelpTopic = (name) => { try { return execFileSync('gh', ['help', name], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
export const ghVersion = () => { try { const o = execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); const m = /gh version (\S+)/.exec(o); return m ? m[1] : null; } catch { return null; } };

// The subcommands a help lists, ONLY inside a *COMMANDS section (never EXAMPLES / HELP TOPICS / LEARN MORE — their lines look
// like `  word: …` too). ALIAS COMMANDS is skipped (an alias `co` = `pr checkout` is not its own verb; an unknown verb
// BLINDS, the safe reading of an alias that may drive git). EXTENSION COMMANDS is skipped BY NAME (round 7, 5a): walking it
// would run `gh <ext> --help` — a third-party binary executed by a test; an extension verb is unknown to the table ⇒ BLIND.
export function sectionSubs(lines) {
  const subs = [];
  let inCmds = false;
  for (const l of lines) {
    if (/^[A-Z]/.test(l)) { inCmds = /\bCOMMANDS\b/.test(l) && !/^(ALIAS|EXTENSION)\b/.test(l); continue; }
    if (!inCmds) continue;
    const m = /^\s{2,}([a-z][a-z0-9-]+):\s/.exec(l);
    if (m) subs.push(m[1]);
  }
  return subs;
}

// A leaf verb's help → { usage, subs, flags{ long → { short, value, type, desc } } }. A FLAGS line is `[-x, ]--long [TYPE]  desc`:
// the flag-spec column runs up to the 2+-space gap before the description; a single non-dash token after the long name is the
// value TYPE ⇒ a value flag; nothing ⇒ a boolean. The description (round 7, MAJOR 3) is kept too — a value gh resolves with
// FromFullName may TYPE as `string` yet its description names a repository (`issue develop --branch-repo`).
export function parseVerb(path) { const h = ghHelp(path); return h == null ? null : parseHelp(h); }

const HEADER = /^[A-Z][A-Z]+(?: [A-Z]+)*$/;   // an all-caps, left-justified section header: USAGE / FLAGS / INHERITED FLAGS / EXAMPLES / LEARN MORE / ARGUMENTS / JSON FIELDS (a description sentence `Clone a gist.` is NOT one)

export function parseHelp(h) {
  const ls = h.split('\n');
  const ui = ls.findIndex((l) => /^USAGE/.test(l));
  const usage = ui >= 0 ? (ls[ui + 1] || '') : '';
  const subs = sectionSubs(ls);
  // round 8 (BLOCKER): the verb's PROSE = its description (the lines before the first section header) + its EXAMPLES block — the
  // positive proof reads this (never the FLAGS, never the USAGE/verb words) for a program-execution / download / git-road word.
  const descLines = []; for (const l of ls) { if (HEADER.test(l)) break; descLines.push(l); }
  let inEx = false; const exLines = [];
  for (const l of ls) { if (HEADER.test(l)) { inEx = /^EXAMPLES\b/.test(l); continue; } if (inEx) exLines.push(l); }
  const prose = descLines.join('\n') + '\n' + exLines.join('\n');
  const flags = {};
  let inFlags = false;
  for (const l of ls) {
    if (/^(FLAGS|INHERITED FLAGS)\b/.test(l)) { inFlags = true; continue; }
    if (/^[A-Z]/.test(l) && !/^(FLAGS|INHERITED FLAGS)\b/.test(l)) inFlags = false;
    if (!inFlags) continue;
    const sp = /^\s+(-\S.*?)\s{2,}(\S.*)$/.exec(l);   // the flag-spec column (it starts with '-'), then the description after the 2+-space gap
    if (!sp) continue;
    const m = /^(?:-([A-Za-z]), )?(--[A-Za-z][\w-]*)(?:\s+((?!-)\S+))?/.exec(sp[1].trim());   // short?, long, TYPE? (a non-dash token)
    if (!m) continue;
    flags[m[2]] = { short: m[1] || null, value: !!m[3], type: m[3] || null, desc: sp[2] };
  }
  return { usage, subs, flags, prose };
}

const REPO_TYPE = /repository|OWNER\/REPO/;                               // the help's TYPE column marks a value gh resolves to a repo (and so a host): `repository`, `[HOST/]OWNER/REPO`
const REPO_DESC = /\b(?:repositor(?:y|ies)|repo|destination)\b|OWNER\/REPO/i;   // round 7 (MAJOR 3): a `string`-typed value whose DESCRIPTION names a repository / destination is resolved by FromFullName too

// round 8 (BLOCKER): {default:1} is a POSITIVE proof, not a negative one. A verb reaches only the default host (⇒ ok:own) ONLY
// if its help (a) names NO program execution / download / git road word in its DESCRIPTION or EXAMPLES, AND (b) takes no
// positional the help NAMES as a url / path / spec / gist (repository/<name> is already a spec ⇒ belongs). Otherwise it EXECUTES
// a program (gh copilot execs the Copilot CLI on PATH) / drives git (gh gist clone → git clone) / takes a host-bearing arg — so
// {default:1} cannot be proven and the verb is ABSENT ⇒ BLIND (asking is cheap; a false ok:own on a program-runner is the leak).
// The word list is DERIVED once (the three categories' markers) and PINNED here; test-vault-run-model ⑤d pins it + a RED fixture
// per word, and the ⑤c census re-runs this proof against the live gh so a new {default:1} verb or a reclassification is RED.
export const PROGRAM_WORDS = Object.freeze(['execute', 'exec', 'run', 'launch', 'open', 'download', 'install', 'clone', 'checkout', 'push', 'pull', 'fetch', 'git', 'browser', 'editor', 'shell', 'command']);
export const POSITIONAL_TYPE_WORDS = Object.freeze(['url', 'path', 'spec', 'gist']);
const wordRe = (words) => new RegExp('\\b(?:' + words.join('|') + ')\\b', 'i');
export function positiveProof(v, progWords = PROGRAM_WORDS, posWords = POSITIONAL_TYPE_WORDS) {
  if (wordRe(progWords).test(v.prose || '')) return false;                                   // (a) a program / download / git word in the description or examples
  const positionals = (String(v.usage || '').match(/<[^>]+>/g) || []).join(' ');
  if (wordRe(posWords).test(positionals)) return false;                                       // (b) a positional the help names as a url / path / spec / gist
  return true;
}

export function leafGrammar(v, specHint) {
  const value = [], repoValues = [];
  for (const [long, info] of Object.entries(v.flags)) {
    if (!info.value) continue;   // round 6: bool flags are not kept (shapeOf never reads them; a bool→value move still shows up in `value`)
    value.push(long); if (info.short) value.push('-' + info.short);
    if ((info.type && REPO_TYPE.test(info.type)) || REPO_DESC.test(info.desc || '')) { repoValues.push(long); if (info.short) repoValues.push('-' + info.short); }
  }
  value.sort(); repoValues.sort();
  const spec = /<[a-z-]*repo(?:sitory)?>/.test(v.usage) || !!specHint ? 1 : 0;   // round 7: <destination-repo> as well as <repository> / <…-repository>
  const hn = v.flags['--hostname'];
  return { value, repoValues, spec, host: hn && hn.short ? '-' + hn.short : null };
}

// A verb REACHES A HOST — a full entry — when: its first/any positional is a repository (spec); or it carries --hostname
// (host); or it has a value the help TYPEs or DESCRIBES as a repository, INCLUDING the inherited -R/--repo (repoValues).
// A verb that reaches no host gets { default:1 } ONLY if positiveProof clears it (round 8); otherwise it is ABSENT ⇒ BLIND.
// repo create's positional is a <name> gh still parses with ghrepo.FromFullName, so it is CURATED with spec:1.
export const CURATED = [{ path: ['repo', 'create'], spec: 1 }];
export const belongs = (g) => !!(g.spec || g.host || (g.repoValues && g.repoValues.length) || (g.value && g.value.includes('--hostname')));   // --hostname (gh api / auth) reaches a host even with no short alias
// round 8 (BLOCKER): a non-host-reaching verb is {default:1} (ok:own) only when positiveProof clears its help; else null ⇒ the
// walk OMITS it ⇒ the reader BLINDS it. Takes the whole parsed help v (leafGrammar for the host read, prose+usage for the proof).
export function entryOf(v) {
  const g = leafGrammar(v);
  if (belongs(g)) return g;
  return positiveProof(v) ? { default: 1 } : null;
}

export function regenerate(groups) {
  const out = {}, unreadable = [];
  const curatedKeys = new Set(CURATED.map((c) => c.path.join(' ')));
  const walk = (path, depth) => {
    const key = path.join(' ');
    if (curatedKeys.has(key)) return;   // curated verbs are added below with their spec hint
    const v = parseVerb(path);
    if (!v) { unreadable.push(key); return; }   // a passthrough with no parseable --help (gh extension exec): absent ⇒ BLIND, but recorded
    if (v.subs.length && depth < 4) { for (const s of v.subs) walk([...path, s], depth + 1); return; }
    const e = entryOf(v); if (e) out[key] = e;   // round 8: a null entry (positiveProof failed) is OMITTED ⇒ the verb BLINDS
  };
  for (const grp of groups) walk([grp], 1);
  for (const c of CURATED) { const v = parseVerb(c.path); if (!v) { unreadable.push(c.path.join(' ')); continue; } out[c.path.join(' ')] = leafGrammar(v, c.spec); }
  return { table: out, unreadable };
}

// The full discovery — every gh COMMAND group of the live gh (HELP TOPICS, ALIAS COMMANDS and EXTENSION COMMANDS excluded).
export function discoverGroups() { return sectionSubs((ghHelp([]) || '').split('\n')); }
export function buildGrammar() { return regenerate(discoverGroups()); }

// The census's builder: the SAME tree + the SAME parse (parseHelp / leafGrammar / entryOf / CURATED), but the ~250 helps are
// fetched concurrently so the whole live tree is compared inside the fast tier (~0.9 s, vs ~8 s serial). Returns the same
// { table, unreadable } as buildGrammar().
export async function buildGrammarParallel(opts = {}) {
  const LIMIT = opts.limit || 16, help = opts.help || ghHelpAsync;
  let active = 0; const q = [];
  const gate = (fn) => new Promise((res, rej) => { const go = () => { active++; Promise.resolve().then(fn).then((v) => { active--; res(v); if (q.length) q.shift()(); }, (e) => { active--; rej(e); if (q.length) q.shift()(); }); }; active < LIMIT ? go() : q.push(go); });
  const out = {}, unreadable = [], curatedKeys = new Set(CURATED.map((c) => c.path.join(' ')));
  const walk = async (path, depth) => {
    const key = path.join(' ');
    if (curatedKeys.has(key)) return;
    const h = await gate(() => help(path));
    if (h == null) { unreadable.push(key); return; }
    const v = parseHelp(h);
    if (v.subs.length && depth < 4) { await Promise.all(v.subs.map((s) => walk([...path, s], depth + 1))); return; }
    const e = entryOf(v); if (e) out[key] = e;   // round 8: a null entry (positiveProof failed) is OMITTED ⇒ the verb BLINDS
  };
  const groups = sectionSubs(((await gate(() => help([]))) || '').split('\n'));
  await Promise.all(groups.map((grp) => walk([grp], 1)));
  for (const c of CURATED) { const h = await gate(() => help(c.path)); if (h == null) { unreadable.push(c.path.join(' ')); continue; } out[c.path.join(' ')] = leafGrammar(parseHelp(h), c.spec); }
  return { table: out, unreadable };
}

// The program-naming env vars (round 7 MAJOR 4; round 8 MAJOR 2 adds GH_PATH), DERIVED from `gh help environment`: a paragraph
// (blank-line delimited) whose leading backtick-quoted NAMES are followed by a description that names an editor / browser /
// pager / executable. Returns a sorted list (null if gh is not runnable). GH_FORCE_TTY / GH_TOKEN / GH_HOST / GH_EXTENSION /
// GH_CONFIG_DIR are excluded by the derivation (they name no program the user supplies — gh SETS GH_EXTENSION / GH_PATH itself).
export function parseEnvHijack(text) {
  const names = new Set();
  for (const para of String(text || '').split(/\n\s*\n/)) {
    const head = /^((?:`[^`]+`(?:,\s*)?)+)/.exec(para);
    if (!head) continue;
    if (!/\b(?:editor|browser|pager|paging|executable)\b/i.test(para)) continue;   // round 8 (MAJOR 2): program-naming only, DERIVED from the help's own words — `executable` admits GH_PATH («the path to the gh executable»); the decoys gh SETS itself (GH_EXTENSION «standalone program», GH_NO_EXTENSION_UPDATE_NOTIFIER «executed») say program/executed, never `executable`, so they stay out, as do GH_CONFIG_DIR / GH_FORCE_TTY
    for (const nm of head[1].match(/`([^`]+)`/g) || []) names.add(nm.replace(/`/g, '').trim());
  }
  return [...names].sort();
}
export function envHijack() { const t = ghHelpTopic('environment'); return t == null ? null : parseEnvHijack(t); }

function literalText(table) {
  const keys = Object.keys(table).sort();
  return '{\n' + keys.map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(table[k])}`).join(',\n') + ',\n    }';
}
function shippedGrammarCount(src) {
  const m = /grammar: \{([\s\S]*?)\n    \}/.exec(src);
  return m ? (m[1].match(/^\s{6}"/gm) || []).length : 0;
}
// round 7 (5d): --write must never silently pin an EMPTY grammar at 'null' (gh absent / broken PATH), nor SHRINK the shipped
// count without a deliberate --force. Returns the refusal message, or null to allow. PURE so the suite can drive it.
export function writeGuard({ ver, hijack, nkeys, shipped, force }) {
  if (ver == null) return "refusing --write: gh version not discovered (gh absent / broken PATH) — the grammar would be pinned at null";
  if (!nkeys) return "refusing --write: discovery produced an EMPTY grammar";
  if (hijack == null || !hijack.length) return "refusing --write: `gh help environment` not read — the program-naming env list would be empty";
  if (nkeys < shipped && !force) return `refusing --write: the new grammar (${nkeys} verbs) SHRINKS below the shipped ${shipped} — pass --write --force "<reason>" to override (a verb really removed upstream)`;
  return null;
}

if (process.argv[1] && process.argv[1].endsWith('gen-gh-grammar.mjs')) {
  const { table } = buildGrammar();
  const ver = ghVersion();
  const hijack = envHijack();
  const lit = literalText(table);
  if (process.argv.includes('--write')) {
    const SRC = new URL('../src/vault-run.js', import.meta.url).pathname;
    const force = process.argv.includes('--force');
    let s = readFileSync(SRC, 'utf8');
    const shipped = shippedGrammarCount(s), nkeys = Object.keys(table).length;
    const refusal = writeGuard({ ver, hijack, nkeys, shipped, force });   // round 7 (5d)
    if (refusal) throw new Error(refusal);
    const g0 = s.indexOf('grammar: {');
    if (g0 < 0) throw new Error('no `grammar: {` in src/vault-run.js');
    const close = s.indexOf('\n    }', g0);
    if (close < 0) throw new Error('no closing `\\n    }` for the grammar block');
    s = s.slice(0, g0) + 'grammar: ' + lit + s.slice(close + '\n    }'.length);
    if (!/grammarVersion: '[^']*'/.test(s)) throw new Error("no `grammarVersion: '…'` in the gh row to pin");
    s = s.replace(/grammarVersion: '[^']*'/, `grammarVersion: '${ver}'`);
    if (!/envHijack: \[[^\]]*\]/.test(s)) throw new Error('no `envHijack: [...]` in the gh row to rewrite');
    s = s.replace(/envHijack: \[[^\]]*\]/, `envHijack: ${JSON.stringify(hijack)}`);
    writeFileSync(SRC, s);
    process.stderr.write(`wrote grammar (${nkeys} verbs, was ${shipped}) + grammarVersion '${ver}' + envHijack ${JSON.stringify(hijack)} into src/vault-run.js\n`);
  } else {
    process.stdout.write(`// gh ${ver}\n// envHijack ${JSON.stringify(hijack)}\n` + lit + '\n');
  }
}
