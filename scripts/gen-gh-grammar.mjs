#!/usr/bin/env node
// THE gh GRAMMAR, GENERATED FROM gh's OWN --help (lane vault-agent-own — the registry law: a kind of fact is ONE table derived
// from its source, with a census that fails a drift). gh's flags are PER VERB, so a hand-kept flag list drifts and leaks a host.
// src/vault-run.js's gh row ships the table + the program-naming env list this script generates; test-vault-run-model ⑤c
// re-runs the SAME parse against the live gh and diffs the WHOLE tree — any drift (a listed verb's shape, a value flag, a
// repository TYPE/description, a positional spec, a hostname short, a program-naming env var, OR an allowlisted verb's live
// help-text HASH) is RED by name.
//
//   node scripts/gen-gh-grammar.mjs                 # print the literal (grammar + version + envHijack) to stdout
//   node scripts/gen-gh-grammar.mjs --allow-shas    # print each allowlisted verb's live help sha
//   node scripts/gen-gh-grammar.mjs --repin --reason "<why>"   # THE re-pin after a gh version roll: rewrite grammarVersion + the 32 ALLOWLIST hashes, print the verbs whose help changed (the re-review list); refuses if a verb's help is gone (the allow SET would change)
//   node scripts/gen-gh-grammar.mjs --write         # rewrite the gh row's `grammar` + `grammarVersion` + `envHijack` IN PLACE
//   node scripts/gen-gh-grammar.mjs --write --force "<reason naming the review>"   # change the reviewed allow set deliberately (--write compares the SET of allowlisted verbs BY NAME, so a same-size swap still needs --force)
//
// FAIL CLOSED. The reader reads only the spellings it can read with CERTAINTY and BLINDS the rest of gh (a dash before the verb
// words, or a verb ABSENT from this table). The table maps "<group> <verb>" → either
//   { value:[flags that take an argument, long+short], repoValues:[value flags whose TYPE is a repository / [HOST/]OWNER/REPO,
//     OR whose DESCRIPTION names a repository AND whose own long name is repo-shaped — read as a HOST/OWNER/REPO spec], spec:1
//     (a positional gh resolves with ghrepo.FromFullName — <…repo[sitory]>), host:'-x' (the --hostname short, or null) }  — a
//     verb that REACHES A HOST (off the default host ⇒ asks)
//   { default:1 }  — an allowlisted verb that reaches no host: ok:own on the default host.
// ROUND 9 (MAJOR 2 — the END of the derivation road for the ALLOW set): a verb is in the grammar AT ALL only if it is on the
// REVIEWED ALLOWLIST below — a hand-written table (NOT derived from prose) of verbs reviewed against what they DO, each pinned
// to a HASH of its live help text. Every other verb is ABSENT ⇒ BLIND (asking is cheap; a false ok:own on a program-runner is
// the leak). The round-8 prose proof (PROGRAM_WORDS) is RETIRED — a rule read from gh's help TEXT cannot prove what a verb DOES
// (gh extension create's help names no git word yet it runs `git init/add/commit` + `go` from the agent's PATH, wire-proven).
// A NEW verb in gh is ABSENT until a reviewer adds it (no silent allow); writeGuard refuses a CHANGE to the allow set (a GROW
// reopens an ok:own door; a SHRINK narrows it) without a deliberate --force naming the review.
//
// envHijack: the program-naming env vars gh honours (GH_BROWSER/GH_EDITOR/GH_PAGER/GH_PATH + the generic BROWSER/EDITOR/VISUAL/
// PAGER + GIT_EDITOR), DERIVED from `gh help environment` (a paragraph whose description names an editor / browser / pager /
// executable), never a hand list — gh reads the GH_ ones FIRST, so a minted value must not run gh with one set. GH_FORCE_TTY /
// GH_EXTENSION / GH_CONFIG_DIR name no program the user supplies and are correctly excluded by the derivation.
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const helpSha = (text) => createHash('sha256').update(String(text)).digest('hex').slice(0, 16);   // round 9: a 64-bit fingerprint of a verb's live --help — the census REDs when the reviewed help changes or the version pin moves

export const ghHelp = (args) => { try { return execFileSync('gh', [...args, '--help'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
export const ghHelpAsync = (args) => new Promise((res) => execFile('gh', [...args, '--help'], { encoding: 'utf8', timeout: 15000, maxBuffer: 8e6 }, (e, o) => res(e ? null : o)));   // the census fetches ~250 helps in parallel — the SAME parse (parseHelp), so no drift vs the serial generator
export const ghHelpTopic = (name) => { try { return execFileSync('gh', ['help', name], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
export const ghVersion = () => { try { const o = execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }); const m = /gh version (\S+)/.exec(o); return m ? m[1] : null; } catch { return null; } };

// The subcommands a help lists, ONLY inside a *COMMANDS section (never EXAMPLES / HELP TOPICS / LEARN MORE). ALIAS COMMANDS and
// EXTENSION COMMANDS are skipped BY NAME (an alias BLINDS; walking EXTENSION COMMANDS would exec a third-party binary in a test).
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

// A leaf verb's help → { usage, subs, flags{ long → { short, value, type, desc } } }. A FLAGS line is `[-x, ]--long [TYPE]  desc`.
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
    const sp = /^\s+(-\S.*?)\s{2,}(\S.*)$/.exec(l);   // the flag-spec column (it starts with '-'), then the description after the 2+-space gap
    if (!sp) continue;
    const m = /^(?:-([A-Za-z]), )?(--[A-Za-z][\w-]*)(?:\s+((?!-)\S+))?/.exec(sp[1].trim());   // short?, long, TYPE? (a non-dash token)
    if (!m) continue;
    flags[m[2]] = { short: m[1] || null, value: !!m[3], type: m[3] || null, desc: sp[2] };
  }
  return { usage, subs, flags };
}

const REPO_TYPE = /repositor|OWNER\/REPO/i;                               // the TYPE column names a repo gh resolves to a host: `repository`, `[HOST/]OWNER/REPO`, `<…-repository>`
const REPO_DESC = /\b(?:repositor(?:y|ies)|repo|destination)\b|OWNER\/REPO/i;   // round 7: a `string`-typed value whose DESCRIPTION names a repository / destination is resolved by FromFullName too
const REPO_NAME = /repo/i;   // round 9 (BLOCKER): a DESCRIPTION-only repo match is a spec ONLY when the flag's own long name is repo-shaped (--repo / --signer-repo / --branch-repo). Else --branch ("view a branch OF THE REPOSITORY"), --source-ref, --signer-workflow, --order ("order of REPOSITORIES") merely MENTION a repository but are a ref / branch / sort / digest — NOT a HOST/OWNER/REPO spec, so their value must never be read as a host (that mis-read minted a bogus @feature card and drove the round-8 host-shape patch the BLOCKER reverts)

const LAUNCH_DESC = /\b(?:browser|editor)\b/i;   // round 10 (BLOCKER 1a): a flag whose help OPENS a browser / editor — gh execs the launcher the agent NAMES (the browser:/editor: key of its config file, or exec.LookPath('xdg-open', …) on the child's PATH) with the minted value in that program's env, ok:own and no card. The grammar never reads bool flags, so --web/-w (19 verbs) and --editor/-e (4) are recorded in `launch` and shapeOf BLINDS the verb when one is present (an unknown verb — the card asks). Census over the 32 helps: every launcher's description names "browser" or "editor" and no non-launcher flag does; --web/--editor are matched by NAME too, in case a future help drops the word
export function leafGrammar(v, specHint) {
  const value = [], repoValues = [], launch = [];
  for (const [long, info] of Object.entries(v.flags)) {
    if (long === '--web' || long === '--editor' || LAUNCH_DESC.test(info.desc || '')) { launch.push(long); if (info.short) launch.push('-' + info.short); }
    if (!info.value) continue;   // bool flags are not kept (shapeOf never reads them; a bool→value move still shows up in `value`)
    value.push(long); if (info.short) value.push('-' + info.short);
    if ((info.type && REPO_TYPE.test(info.type)) || (REPO_DESC.test(info.desc || '') && REPO_NAME.test(long))) { repoValues.push(long); if (info.short) repoValues.push('-' + info.short); }
  }
  value.sort(); repoValues.sort(); launch.sort();
  const spec = /<[a-z-]*repo(?:sitory)?>/.test(v.usage) || !!specHint ? 1 : 0;
  const hn = v.flags['--hostname'];
  return { value, repoValues, spec, host: hn && hn.short ? '-' + hn.short : null, ...(launch.length ? { launch } : {}) };
}

export const belongs = (g) => !!(g.spec || g.host || (g.repoValues && g.repoValues.length) || (g.value && g.value.includes('--hostname')));   // --hostname (gh api / auth) reaches a host even with no short alias

// ROUND 9 (MAJOR 2): THE REVIEWED ALLOWLIST — the set of verbs a minted own value may run with NO CARD (ok:own on the default
// host), reviewed against what each verb DOES (not what its help SAYS). Everything NOT here is ABSENT ⇒ BLIND. OUT, because it
// drives git / execs / downloads / opens / edits a local tree: extension *, copilot, gist clone, repo clone/fork/sync/create,
// pr checkout, pr merge --delete-branch, run download, release download/upload, browse, codespace *, auth *. A host-reaching
// allowlisted verb keeps its computed shape so OFF the default host it still asks (gh issue list -R evil/o/r). `sha` is the
// sha256(16) of the verb's live `gh <verb> --help` at the pinned version — the census REDs by name on a change (re-review the
// verb) or a version move. Re-pin after a review: `node scripts/gen-gh-grammar.mjs --allow-shas`.
export const ALLOWLIST = [
  { path: ["api"], note: "raw GitHub API call; reads the default host unless --hostname (host-reaching \u21d2 off-host asks)", sha: "c6136b139e05d1b4" },
  { path: ["issue", "list"], note: "lists issues on the default host; -R asks off-host", sha: "087b48ab4d0fe3a4" },
  { path: ["issue", "view"], note: "shows one issue; -R asks off-host", sha: "ae334e259bf88145" },
  { path: ["issue", "create"], note: "opens an issue on the default host; -R asks off-host (no local tree)", sha: "59d622a4d2954327" },
  { path: ["issue", "comment"], note: "comments on an issue; -R asks off-host", sha: "7438c723dcbc9582" },
  { path: ["issue", "close"], note: "closes an issue; -R asks off-host", sha: "977a3100120d92c0" },
  { path: ["pr", "list"], note: "lists pull requests; -R asks off-host", sha: "c1a905bb71b1060e" },
  { path: ["pr", "view"], note: "shows one PR; -R asks off-host (no checkout)", sha: "30004c2cb2259298" },
  { path: ["pr", "create"], note: "opens a PR; allowlisted ONLY with --head AND -R (or GH_REPO), each NON-EMPTY (an empty --head= / -H \"\" / -R \"\" reads as ABSENT — gh falls back to the CWD repo). EVERY other shape resolves the CWD repo: `git status` (UncommittedChangeCount, over core.fsmonitor) and, when the head is unpushed, `git push` (the repo's pre-push hook / core.hooksPath), so it BLINDS (src/vault-run.js needFlagSubs). With --head X -R o/r gh still reads the CWD — `git remote -v` and two `git config` reads — but runs NO git status and NO push, so no agent-named program (fsmonitor / a pre-push hook) runs; round 11 MAJOR 3 corrects the earlier «resolves no CWD repo, neither git call runs»", sha: "8edfc544c5dc4897" },
  { path: ["pr", "checks"], note: "shows a PR's CI checks; -R asks off-host", sha: "8fda9c43de95c8f7" },
  { path: ["pr", "status"], note: "shows the PR status of the current context; -R asks off-host", sha: "20c2404d73e83375" },
  { path: ["pr", "comment"], note: "comments on a PR; -R asks off-host", sha: "c6cd0d1fbfeaee08" },
  { path: ["run", "list"], note: "lists Actions runs; -R asks off-host", sha: "9699f4c42bb70cd3" },
  { path: ["run", "view"], note: "shows one run; -R asks off-host (NOT run download, which writes a local tree)", sha: "bc53445e2dbd82ab" },
  { path: ["run", "watch"], note: "watches a run to completion; -R asks off-host", sha: "c11b5656e6346945" },
  { path: ["release", "list"], note: "lists releases; -R asks off-host", sha: "c17c14536fabc886" },
  { path: ["release", "view"], note: "shows one release; -R asks off-host (NOT release download/upload)", sha: "ddd859ffd12b3a61" },
  { path: ["repo", "view"], note: "shows a repo's README on the default host; a <repository>/-R spec asks off-host (NOT repo clone)", sha: "160742b7bd41eea4" },
  { path: ["repo", "list"], note: "lists an owner's repos on the default host", sha: "b8f66ff1f4c5840f" },
  { path: ["search", "code"], note: "code search on the default host", sha: "c327bf075d6e5b45" },
  { path: ["search", "commits"], note: "commit search; -R filters by OWNER/REPO, off-host asks", sha: "da6000f0c027a39b" },
  { path: ["search", "issues"], note: "issue search on the default host", sha: "df1e1e86f18084f9" },
  { path: ["search", "prs"], note: "PR search on the default host", sha: "18f09c9d892aad99" },
  { path: ["search", "repos"], note: "repo search on the default host", sha: "b883451560cd65cd" },
  { path: ["config", "get"], note: "reads one gh config value; no network", sha: "51dfaa04607f8b5d" },
  { path: ["ssh-key", "list"], note: "lists the account's SSH keys on the default host", sha: "ef42a7ee6d55e818" },
  { path: ["org", "list"], note: "lists the account's orgs on the default host", sha: "810eaca5242dc078" },
  { path: ["workflow", "list"], note: "lists Actions workflows; -R asks off-host", sha: "6d60b14dd5808614" },
  { path: ["workflow", "view"], note: "shows one workflow; -R asks off-host", sha: "2fc66c98ff7f2f49" },
  { path: ["label", "list"], note: "lists labels; -R asks off-host", sha: "ba3fe4ed847b0e0e" },
  { path: ["variable", "list"], note: "lists Actions variable NAMES; -R asks off-host", sha: "7265b6befa738662" },
  { path: ["secret", "list"], note: "lists secret NAMES (never values, per the use law); -R asks off-host", sha: "5fb4ceacc81a5376" },
];
export const ALLOW_KEYS = Object.freeze(new Set(ALLOWLIST.map((e) => e.path.join(' '))));
export const CURATED = [];   // round 9: repo create's FromFullName <name> positional is OUT of the allow set (it creates + pushes) ⇒ ABSENT ⇒ BLIND, so nothing is curated-in anymore

// round 9 (MAJOR 2): a verb is emitted ONLY if allowlisted; then host-reaching ⇒ its computed shape, else {default:1}. Otherwise
// null ⇒ the walk OMITS it ⇒ the reader BLINDS it (an unknown verb, a non-allowlisted verb, an extension).
export function entryOf(v, key) {
  if (!ALLOW_KEYS.has(key)) return null;
  const g = leafGrammar(v);
  if (belongs(g)) return g;
  return g.launch ? { default: 1, launch: g.launch } : { default: 1 };   // round 10: a no-host verb that still opens a browser (search repos --web) keeps its launch set so shapeOf blinds the flag
}

// round 9 (MAJOR 2): the live help-text sha of each allowlisted verb vs its pinned ALLOWLIST sha — returns every drift ({key,
// pinned, live}); a non-empty result is RED by name (re-review the changed verb, or the gh version pin moved). PURE.
export function allowHashDrift(liveShaByKey, allowlist = ALLOWLIST) {
  const drift = [];
  for (const e of allowlist) { const key = e.path.join(' '); const live = liveShaByKey[key]; if (live !== e.sha) drift.push({ key, pinned: e.sha, live: live == null ? null : live }); }
  return drift;
}

export function regenerate(groups) {
  const out = {}, unreadable = [], shas = {};
  const walk = (path, depth) => {
    const key = path.join(' ');
    const h = ghHelp(path);
    if (h == null) { unreadable.push(key); return; }   // a passthrough with no parseable --help (gh extension exec): absent ⇒ BLIND, but recorded
    const v = parseHelp(h);
    if (v.subs.length && depth < 4) { for (const s of v.subs) walk([...path, s], depth + 1); return; }
    const e = entryOf(v, key); if (e) { out[key] = e; shas[key] = helpSha(h); }   // round 9: null (not allowlisted) ⇒ OMITTED ⇒ BLIND
  };
  for (const grp of groups) walk([grp], 1);
  return { table: out, unreadable, shas };
}

export function discoverGroups() { return sectionSubs((ghHelp([]) || '').split('\n')); }
export function buildGrammar() { return regenerate(discoverGroups()); }

// The census's builder: the SAME tree + the SAME parse (parseHelp / leafGrammar / entryOf / ALLOWLIST), the ~250 helps fetched
// concurrently. Returns { table, unreadable, shas } — shas is the live help-text sha of every EMITTED (allowlisted) verb.
export async function buildGrammarParallel(opts = {}) {
  const LIMIT = opts.limit || 16, help = opts.help || ghHelpAsync;
  let active = 0; const q = [];
  const gate = (fn) => new Promise((res, rej) => { const go = () => { active++; Promise.resolve().then(fn).then((v) => { active--; res(v); if (q.length) q.shift()(); }, (e) => { active--; rej(e); if (q.length) q.shift()(); }); }; active < LIMIT ? go() : q.push(go); });
  const out = {}, unreadable = [], shas = {};
  const walk = async (path, depth) => {
    const key = path.join(' ');
    const h = await gate(() => help(path));
    if (h == null) { unreadable.push(key); return; }
    const v = parseHelp(h);
    if (v.subs.length && depth < 4) { await Promise.all(v.subs.map((s) => walk([...path, s], depth + 1))); return; }
    const e = entryOf(v, key); if (e) { out[key] = e; shas[key] = helpSha(h); }
  };
  const groups = sectionSubs(((await gate(() => help([]))) || '').split('\n'));
  await Promise.all(groups.map((grp) => walk([grp], 1)));
  return { table: out, unreadable, shas };
}

// The program-naming env vars (round 7/8), DERIVED from `gh help environment`: a paragraph whose leading backtick-quoted NAMES
// are followed by a description naming an editor / browser / pager / executable. Returns a sorted list (null if gh is absent).
export function parseEnvHijack(text) {
  const names = new Set();
  for (const para of String(text || '').split(/\n\s*\n/)) {
    const head = /^((?:`[^`]+`(?:,\s*)?)+)/.exec(para);
    if (!head) continue;
    if (!/\b(?:editor|browser|pager|paging|executable)\b/i.test(para)) continue;   // program-naming only — `executable` admits GH_PATH; GH_EXTENSION «standalone program» / GH_NO_EXTENSION_UPDATE_NOTIFIER «executed» / GH_CONFIG_DIR / GH_FORCE_TTY stay out
    for (const nm of head[1].match(/`([^`]+)`/g) || []) names.add(nm.replace(/`/g, '').trim());
  }
  return [...names].sort();
}
export function envHijack() { const t = ghHelpTopic('environment'); return t == null ? null : parseEnvHijack(t); }

// round 9 (MINOR 3): the REAL envHijack compare, a PURE function the census ⑤c calls AND a stale-literal test drives — returns
// the drift ({live, shipped}) or null when equal, so a test reds the COMPARE itself, not merely asserts that two lists differ.
export function envHijackDrift(live, shipped) { return (live != null && JSON.stringify(live) === JSON.stringify(shipped)) ? null : { live: live == null ? null : live, shipped: shipped == null ? null : shipped }; }

function literalText(table) {
  const keys = Object.keys(table).sort();
  return '{\n' + keys.map((k) => `      ${JSON.stringify(k)}: ${JSON.stringify(table[k])}`).join(',\n') + ',\n    }';
}
function shippedGrammarKeys(src) {
  const m = /grammar: \{([\s\S]*?)\n    \}/.exec(src);
  return m ? [...m[1].matchAll(/^\s{6}"([^"]+)":/gm)].map((x) => x[1]) : [];
}
// round 9 (MAJOR 2): --write must never pin an EMPTY / null-version grammar nor an empty env list, and must refuse a CHANGE to
// the reviewed allow set (a GROW reopens an ok:own door; a SHRINK narrows it) without a deliberate --force naming the review.
// Returns the refusal message, or null to allow. PURE so the suite can drive it.
export function writeGuard({ ver, hijack, keys, shippedKeys, force }) {
  if (ver == null) return "refusing --write: gh version not discovered (gh absent / broken PATH) — the grammar would be pinned at null";
  if (!keys || !keys.length) return "refusing --write: discovery produced an EMPTY grammar";
  if (hijack == null || !hijack.length) return "refusing --write: `gh help environment` not read — the program-naming env list would be empty";
  const now = new Set(keys), was = new Set(shippedKeys || []);                 // round 10 (MINOR): compare the SET of allowlisted verbs BY NAME, not the count — a same-size swap (one verb out, one in) is a GROW+SHRINK the count would miss
  const added = keys.filter((k) => !was.has(k)).sort(), removed = [...was].filter((k) => !now.has(k)).sort();
  if ((added.length || removed.length) && !force) return `refusing --write: the reviewed allow set changes${added.length ? ` — added ${added.join(', ')}` : ''}${removed.length ? ` — removed ${removed.join(', ')}` : ''}; a GROW reopens an ok:own door and a SHRINK narrows it (a same-size swap is both) — pass --write --force "<reason naming the review>"`;
  return null;
}

function argReason() {
  const i = process.argv.indexOf('--reason');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith('--reason='));
  return eq ? eq.slice('--reason='.length) : '';
}

if (process.argv[1] && process.argv[1].endsWith('gen-gh-grammar.mjs')) {
  if (process.argv.includes('--repin')) {
    // round 10 (MINOR): THE ONE re-pin after a gh version rolls — rewrites the version pin (src/vault-run.js grammarVersion) AND
    // the 32 ALLOWLIST help hashes (here), prints each verb whose help text changed (the re-review list), and refuses when the
    // allow SET would change (a verb's help gone — renamed/removed): that needs a hand review + --write --force, not a re-pin.
    const reason = argReason();
    if (!reason) throw new Error('refusing --repin: pass --reason "<why the gh version rolled / what you re-reviewed>" — a re-pin moves the hash a verb is reviewed against');
    const ver = ghVersion();
    if (ver == null) throw new Error('refusing --repin: gh version not discovered (gh absent / broken PATH)');
    const live = {};
    for (const e of ALLOWLIST) { const k = e.path.join(' '); const h = ghHelp(e.path); if (h == null) throw new Error(`refusing --repin: \`gh ${k} --help\` is unreadable — the allow SET would change (the verb moved / was removed); review ALLOWLIST by hand, then node scripts/gen-gh-grammar.mjs --write --force "<reason>"`); live[k] = helpSha(h); }
    const changed = ALLOWLIST.filter((e) => live[e.path.join(' ')] !== e.sha).map((e) => e.path.join(' '));
    const GEN = new URL(import.meta.url).pathname;
    let g = readFileSync(GEN, 'utf8');
    g = g.split('\n').map((line) => {
      const m = /^\s*\{ path: (\[[^\]]*\]),/.exec(line);
      if (!m) return line;
      let p; try { p = JSON.parse(m[1]); } catch { return line; }
      const k = Array.isArray(p) ? p.join(' ') : null;
      return k && k in live ? line.replace(/sha: "[0-9a-f]*"/, `sha: "${live[k]}"`) : line;
    }).join('\n');
    writeFileSync(GEN, g);
    const SRC = new URL('../src/vault-run.js', import.meta.url).pathname;
    let v = readFileSync(SRC, 'utf8');
    if (!/grammarVersion: '[^']*'/.test(v)) throw new Error("no `grammarVersion: '…'` in the gh row to pin");
    writeFileSync(SRC, v.replace(/grammarVersion: '[^']*'/, `grammarVersion: '${ver}'`));
    process.stderr.write(`re-pinned ${ALLOWLIST.length} help hashes + grammarVersion '${ver}' (reason: ${reason}).\nRe-review the verbs whose help changed: ${changed.length ? changed.join(', ') : '(none — only the version pin moved)'}\nThen node scripts/gen-gh-grammar.mjs --write if a reviewed shape changed.\n`);
  } else if (process.argv.includes('--allow-shas')) {
    const ver = ghVersion();
    const lines = ALLOWLIST.map((e) => { const h = ghHelp(e.path); return `${JSON.stringify(e.path.join(' '))}: ${JSON.stringify(h == null ? null : helpSha(h))}`; });
    process.stdout.write(`// allowlist help shas @ gh ${ver}\n` + lines.join('\n') + '\n');
  } else {
    const { table } = buildGrammar();
    const ver = ghVersion();
    const hijack = envHijack();
    const lit = literalText(table);
    if (process.argv.includes('--write')) {
      const SRC = new URL('../src/vault-run.js', import.meta.url).pathname;
      const force = process.argv.includes('--force');
      let s = readFileSync(SRC, 'utf8');
      const shippedKeys = shippedGrammarKeys(s), keys = Object.keys(table);
      const refusal = writeGuard({ ver, hijack, keys, shippedKeys, force });
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
      process.stderr.write(`wrote grammar (${keys.length} verbs, was ${shippedKeys.length}) + grammarVersion '${ver}' + envHijack ${JSON.stringify(hijack)} into src/vault-run.js\n`);
    } else {
      process.stdout.write(`// gh ${ver}\n// envHijack ${JSON.stringify(hijack)}\n` + lit + '\n');
    }
  }
}
