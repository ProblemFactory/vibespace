#!/usr/bin/env node
// THE gh GRAMMAR, GENERATED FROM gh's OWN --help (lane vault-agent-own — the registry law: a kind of fact is ONE table
// derived from its source, with a census that fails a drift). gh's flags are PER VERB, so a hand-kept list drifts from the
// tool and leaks a host. src/vault-run.js's gh row ships the table this script generates; test-vault-run-model ⑤c re-runs
// the SAME parse against the live gh and diffs the WHOLE tree — any drift (a host-reaching verb added/removed, a value flag,
// a repository TYPE, a positional spec, a hostname short) is RED by name.
//
//   node scripts/gen-gh-grammar.mjs            # print the literal (grammar + version) to stdout
//   node scripts/gen-gh-grammar.mjs --write    # rewrite the gh row's `grammar` + `grammarVersion` in src/vault-run.js IN PLACE
//
// ROUND 6 (fail closed — do not model cobra): the reader reads only the spellings it can read with CERTAINTY and BLINDS the
// rest of gh (a dash before the verb words, or a verb absent from this table). So the table carries EVERY verb that REACHES A
// HOST by the criterion below; a verb that reaches none is simply absent and BLINDS (it asks — asking is cheap). The table
// maps "<group> <verb>" → { value:[flags that take an argument, long+short], repoValues:[value flags whose TYPE column is a
// repository / [HOST/]OWNER/REPO — read as a HOST/OWNER/REPO spec], spec:1 (the first positional is a repository gh resolves
// with ghrepo.FromFullName — <…repository> or a curated <name>), host:'-x' (the --hostname short for this verb, or null) }.
// bool flags are NOT kept: shapeOf never reads them (the git-driving bool shorts live in the row's blindFlagSubs), and a flag
// whose MEANING moved from bool to value still shows up in `value` — so the equality census stays meaningful and lean.
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const ghHelp = (args) => { try { return execFileSync('gh', [...args, '--help'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
export const ghHelpAsync = (args) => new Promise((res) => execFile('gh', [...args, '--help'], { encoding: 'utf8', timeout: 15000, maxBuffer: 8e6 }, (e, o) => res(e ? null : o)));   // the census fetches ~230 helps in parallel — the SAME parse (parseHelp), so no drift vs the serial generator
export const ghVersion = () => { try { const o = execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); const m = /gh version (\S+)/.exec(o); return m ? m[1] : null; } catch { return null; } };

// The subcommands a help lists, ONLY inside a *COMMANDS section (never EXAMPLES / HELP TOPICS / ALIASES / LEARN MORE — their
// lines look like `  word: …` too). ALIAS COMMANDS is skipped: an alias (`co` = `pr checkout`) is not its own verb; a gh the
// table does not know BLINDS, which is the safe reading of an alias that may drive git.
function sectionSubs(lines) {
  const subs = [];
  let inCmds = false;
  for (const l of lines) {
    if (/^[A-Z]/.test(l)) { inCmds = /\bCOMMANDS\b/.test(l) && !/^ALIAS\b/.test(l); continue; }
    if (!inCmds) continue;
    const m = /^\s{2,}([a-z][a-z0-9-]+):\s/.exec(l);
    if (m) subs.push(m[1]);
  }
  return subs;
}

// A leaf verb's help → { usage, subs, flags{ long → { short, value, type } } }. A FLAGS line is `[-x, ]--long [TYPE]  desc`:
// the flag-spec column runs up to the 2+-space gap before the description; a single non-dash token after the long name is the
// value TYPE (string / repository / [HOST/]OWNER/REPO / int …) ⇒ a value flag; nothing ⇒ a boolean.
export function parseVerb(path) { const h = ghHelp(path); return h == null ? null : parseHelp(h); }

export function parseHelp(h) {
  const ls = h.split('\n');
  const ui = ls.findIndex((l) => /^USAGE/.test(l));
  const usage = ui >= 0 ? (ls[ui + 1] || '') : '';
  const subs = sectionSubs(ls);
  const flags = {};
  let inFlags = false;
  for (const l of ls) {
    if (/^(FLAGS|INHERITED FLAGS)\b/.test(l)) { inFlags = true; continue; }
    if (/^[A-Z]/.test(l) && !/^(FLAGS|INHERITED FLAGS)\b/.test(l)) inFlags = false;
    if (!inFlags) continue;
    const sp = /^\s+(-\S.*?)\s{2,}\S/.exec(l);   // the flag-spec column (it starts with '-'), cut at the description gap
    if (!sp) continue;
    const m = /^(?:-([A-Za-z]), )?(--[A-Za-z][\w-]*)(?:\s+((?!-)\S+))?/.exec(sp[1].trim());   // short?, long, TYPE? (a non-dash token)
    if (!m) continue;
    flags[m[2]] = { short: m[1] || null, value: !!m[3], type: m[3] || null };
  }
  return { usage, subs, flags };
}

const REPO_TYPE = /repository|OWNER\/REPO/;   // the help's TYPE column marks a value gh resolves to a repo (and so a host): `repository`, `[HOST/]OWNER/REPO`

export function leafGrammar(v, specHint) {
  const value = [], repoValues = [];
  for (const [long, info] of Object.entries(v.flags)) {
    if (!info.value) continue;   // round 6: bool flags are not kept (shapeOf never reads them; a bool→value move still shows up in `value`)
    value.push(long); if (info.short) value.push('-' + info.short);
    if (info.type && REPO_TYPE.test(info.type)) { repoValues.push(long); if (info.short) repoValues.push('-' + info.short); }
  }
  value.sort(); repoValues.sort();
  const spec = /<[a-z-]*repository>/.test(v.usage) || !!specHint ? 1 : 0;
  const hn = v.flags['--hostname'];
  return { value, repoValues, spec, host: hn && hn.short ? '-' + hn.short : null };
}

// A verb REACHES A HOST — and so BELONGS in the table — when: its first positional is a repository (spec); or it carries
// --hostname (host); or it has a value flag the help TYPEs as a repository, INCLUDING the inherited -R/--repo (repoValues).
// Everything else reaches only the agent's own host or no host, and BLINDS when run (it asks). repo create's positional is a
// <name> gh still parses with ghrepo.FromFullName, so it is CURATED with spec:1.
export const CURATED = [{ path: ['repo', 'create'], spec: 1 }];
export const belongs = (g) => !!(g.spec || g.host || (g.repoValues && g.repoValues.length) || (g.value && g.value.includes('--hostname')));   // --hostname (gh api / auth) reaches a host even with no short alias

export function regenerate(groups) {
  const out = {}, unreadable = [];
  const curatedKeys = new Set(CURATED.map((c) => c.path.join(' ')));
  const walk = (path, depth) => {
    const key = path.join(' ');
    if (curatedKeys.has(key)) return;   // curated verbs are added below with their spec hint
    const v = parseVerb(path);
    if (!v) { unreadable.push(key); return; }   // a passthrough with no parseable --help (gh extension exec): reaches no host — skip, but record
    if (v.subs.length && depth < 4) { for (const s of v.subs) walk([...path, s], depth + 1); return; }
    const g = leafGrammar(v);
    if (belongs(g)) out[key] = g;
  };
  for (const grp of groups) walk([grp], 1);
  for (const c of CURATED) { const v = parseVerb(c.path); if (!v) { unreadable.push(c.path.join(' ')); continue; } out[c.path.join(' ')] = leafGrammar(v, c.spec); }
  return { table: out, unreadable };
}

// The full discovery — every gh COMMAND group of the live gh (HELP TOPICS and ALIAS COMMANDS excluded). The census walks THIS
// whole tree so a brand-new host-reaching verb in any group is caught, not only the shipped groups.
export function discoverGroups() { return sectionSubs((ghHelp([]) || '').split('\n')); }
export function buildGrammar() { return regenerate(discoverGroups()); }

// The census's builder: the SAME tree + the SAME parse (parseHelp / leafGrammar / belongs / CURATED), but the ~230 helps are
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
    const g = leafGrammar(v);
    if (belongs(g)) out[key] = g;
  };
  const groups = sectionSubs(((await gate(() => help([]))) || '').split('\n'));
  await Promise.all(groups.map((grp) => walk([grp], 1)));
  for (const c of CURATED) { const h = await gate(() => help(c.path)); if (h == null) { unreadable.push(c.path.join(' ')); continue; } out[c.path.join(' ')] = leafGrammar(parseHelp(h), c.spec); }
  return { table: out, unreadable };
}

function literalText(table) {
  const keys = Object.keys(table).sort();
  return '{\n' + keys.map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(table[k])}`).join(',\n') + ',\n    }';
}

if (process.argv[1] && process.argv[1].endsWith('gen-gh-grammar.mjs')) {
  const { table } = buildGrammar();
  const ver = ghVersion();
  const lit = literalText(table);
  if (process.argv.includes('--write')) {
    const SRC = new URL('../src/vault-run.js', import.meta.url).pathname;
    let s = readFileSync(SRC, 'utf8');
    const g0 = s.indexOf('grammar: {');
    if (g0 < 0) throw new Error('no `grammar: {` in src/vault-run.js');
    const close = s.indexOf('\n    }', g0);
    if (close < 0) throw new Error('no closing `\\n    }` for the grammar block');
    s = s.slice(0, g0) + 'grammar: ' + lit + s.slice(close + '\n    }'.length);
    if (!/grammarVersion: '[^']*'/.test(s)) throw new Error("no `grammarVersion: '…'` in the gh row to pin");
    s = s.replace(/grammarVersion: '[^']*'/, `grammarVersion: '${ver}'`);
    writeFileSync(SRC, s);
    process.stderr.write(`wrote grammar (${Object.keys(table).length} verbs) + grammarVersion '${ver}' into src/vault-run.js\n`);
  } else {
    process.stdout.write(`// gh ${ver}\n` + lit + '\n');
  }
}
