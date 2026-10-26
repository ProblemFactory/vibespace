#!/usr/bin/env node
// THE gh GRAMMAR, GENERATED FROM gh's OWN --help (lane vault-agent-own, acceptance round 5 — the registry law: a kind of
// fact is ONE table derived from its source, with a census that fails a drift). gh's flags are PER VERB: `-h` is
// `--homepage` under `repo edit` but `--hostname` under `auth status`; `--template` takes a value under `repo create`
// but is a bool under `repo edit`. A hand-kept flag list drifts from the tool and leaks a host (a value flag the row did
// not list, before a `<repository>` positional, hid the host). So src/vault-run.js's gh row ships the grammar this script
// generates, and test-vault-run-model ⑤c re-runs the SAME parse against the live gh and diffs — any drift (a verb, a value
// flag, a bool, a positional shape, a hostname short) is RED by name.
//
//   node scripts/gen-gh-grammar.mjs            # print the literal (paste into the gh row's `grammar:`)
//
// The table maps "<group> <verb>" → { value:[flags that take an argument, long+short], bool:[boolean flags, long+short],
// spec:1 (first positional is <…repository>), host:'-x' (the short alias of --hostname for this verb, or null) }.
// Generated here by DISCOVERING every gh command (walk the tree); the in-suite census walks only the SHIPPED groups (the
// fast tier's budget) + the curated git-driving verbs, so a brand-new GROUP with a repo-spec verb is caught only when this
// script is re-run against a newer gh — stated in docs/kb-file-structure.md.
import { execFileSync } from 'node:child_process';

export const ghHelp = (args) => { try { return execFileSync('gh', [...args, '--help'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };

// A leaf verb's help → its flags. A FLAGS line is `[-x, ]--long [TYPE]  <description>`: the flag spec column runs up to the
// 2+-space gap before the description; within it, a single non-dash token after the long name is the value TYPE (string /
// strings / URL / name / repository / int …) ⇒ a value flag; nothing (or a `--other` usage hint) ⇒ a boolean.
export function parseVerb(path) {
  const h = ghHelp(path);
  if (h == null) return null;
  const ls = h.split('\n');
  const ui = ls.findIndex((l) => /^USAGE/.test(l));
  const usage = ui >= 0 ? (ls[ui + 1] || '') : '';
  const subs = [...h.matchAll(/^\s{2,}([a-z][a-z-]+):\s/gm)].map((m) => m[1]);
  const flags = {};
  let inFlags = false;
  for (const l of ls) {
    if (/^(FLAGS|INHERITED FLAGS)\b/.test(l)) { inFlags = true; continue; }
    if (/^[A-Z]/.test(l) && !/^(FLAGS|INHERITED FLAGS)\b/.test(l)) inFlags = false;
    if (!inFlags) continue;
    const sp = /^\s+(-\S.*?)\s{2,}\S/.exec(l);   // the flag-spec column (it starts with '-'), cut at the description gap
    if (!sp) continue;
    const m = /^(?:-([A-Za-z]), )?(--[A-Za-z][\w-]*)(?:\s+((?!-)\S+))?/.exec(sp[1].trim());   // short?, long, type? (a non-dash token)
    if (!m) continue;
    flags[m[2]] = { short: m[1] || null, value: !!m[3] };
  }
  return { usage, subs, flags };
}

export function leafGrammar(v) {
  const value = [], bool = [];
  for (const [long, info] of Object.entries(v.flags)) {
    (info.value ? value : bool).push(long);
    if (info.short) (info.value ? value : bool).push('-' + info.short);
  }
  value.sort(); bool.sort();
  return { value, bool, spec: /<[a-z-]*repository>/.test(v.usage) ? 1 : 0, host: v.flags['--hostname'] && v.flags['--hostname'].short ? '-' + v.flags['--hostname'].short : null };
}

// A verb BELONGS in the grammar when it reaches a host: a first positional <…repository> (gh resolves it with ghrepo.
// FromFullName and talks to that host) OR a --hostname with a short alias (-h means --hostname only where the verb defines
// it). The git-driving verbs (pr merge / repo create) are CURATED — the cluster rule reads their value/bool flags, but
// they reach a host only through their own positional/flag, so discovery alone would not keep them.
export const CURATED = [['pr', 'merge'], ['repo', 'create']];
export const belongs = (g) => !!(g.spec || g.host);

// Walk `groups` (each a top-level gh group), depth-first, keeping the host-reaching verbs; then add the curated verbs.
export function regenerate(groups) {
  const out = {}, unreadable = [];
  const walk = (path, depth) => {
    const v = parseVerb(path);
    if (!v) { unreadable.push(path.join(' ')); return; }   // a passthrough with no parseable --help (gh extension exec): it reaches no host — skip, but record
    if (v.subs.length && depth < 3) { for (const s of v.subs) walk([...path, s], depth + 1); return; }
    const g = leafGrammar(v);
    if (belongs(g)) out[path.join(' ')] = g;
  };
  for (const grp of groups) walk([grp], 1);
  for (const c of CURATED) { const v = parseVerb(c); if (!v) { unreadable.push(c.join(' ')); continue; } out[c.join(' ')] = leafGrammar(v); }
  return { table: out, unreadable };
}

// The full discovery (every gh group) — the generator's own. The census derives its group set from the SHIPPED table.
export function discoverGroups() {
  const top = ghHelp([]) || '';
  return [...top.matchAll(/^\s{2,}([a-z][a-z-]+):\s/gm)].map((m) => m[1]);
}
export function buildGrammar() { return regenerate(discoverGroups()); }

if (process.argv[1] && process.argv[1].endsWith('gen-gh-grammar.mjs')) {
  const { table } = buildGrammar();
  // one line per verb, keys sorted — a readable, stable literal to paste into src/vault-run.js's gh row
  const keys = Object.keys(table).sort();
  const body = keys.map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(table[k])}`).join(',\n');
  process.stdout.write('{\n' + body + ',\n    }\n');
}
