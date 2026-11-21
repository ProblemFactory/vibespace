'use strict';
/**
 * home-verdict.js — WHOSE HOME DOES THIS PROCESS RUN ON? (B-ba47, lane cli-update-needs-nothing, 2026-11-14). PURE: no
 * fs, no env, no clock — every input is an argument, so the table in scripts/test-home-verdict.mjs is the whole proof.
 *
 * The 2.369.401 hotfix night: a claim launched outside the lane env handed its suites the person's HOME, and the hubs
 * two of them booted found the real claude / codex in ~/.local/bin, walked ~/.claude/projects and created their usage
 * index under ~/.vibespace. The law — VibeSpace's own tooling run from a temporary folder uses a home of its own — is
 * decided ONCE, at the process boundary, by this ONE verdict and ONE value rule:
 *   · scripts/scratch.mjs re-homes a SUITE (or a debug script a person runs by hand) at import — suiteRehome;
 *   · a hub's boot re-homes a THROWAWAY hub (shape H) — hubRehome, whose second clause IS suiteRehome.
 * Both re-home the same way — rehomeEnv — and every child either process starts inherits the re-homed env by
 * construction, whatever spelling it reads its home by ($HOME, os.homedir(), XDG_*, a value naming a path under it).
 */
const { isUnder, trimSlash } = require('./server-root.js');
const { CONVERSATION_MARKS } = require('./conversation-env.js');   // PURE too: the process marks a suite keeps (主开发 r863)

const isAbs = (p) => typeof p === 'string' && p.startsWith('/');
const rootsOf = (tmpRoots) => (Array.isArray(tmpRoots) ? tmpRoots : []).filter(isAbs).map(trimSlash);
/** The four XDG base-directory names a re-homed env UNSETS (主开发 2026-11-14 13:41Z): each process then derives them from
 *  its OWN $HOME — the re-homed process, and every child that names a HOME of its own (a hub a suite boots on its scratch
 *  home), as on a lane, whose env sets none. Set to the new home they followed the SUITE into a child's own home.
 *  XDG_RUNTIME_DIR is not one of them: it lives in /run/user, names no home, and holds the session bus a desktop leg needs. */
const XDG_BASE = Object.freeze(['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME']);

/** The temp root `p` lies under (the root itself counts), or null. */
function tempRootOf(p, tmpRoots) {
  const r = trimSlash(p);
  if (!isAbs(r)) return null;
  return rootsOf(tmpRoots).find((t) => isUnder(r, t)) || null;
}

/** a path SPELLED as the kernel would be handed it: doubled slashes and '.' segments collapsed, no trailing slash — and
 *  '..' KEPT (主开发 18:25Z B1: a parent step is applied by the walk, to what the prefix RESOLVED to, never by spelling) */
function cleanPath(p) {
  const segs = [];
  for (const x of String(p).split('/')) { if (!x || x === '.') continue; segs.push(x); }
  return '/' + segs.join('/');
}
const parentOf = (p) => (p === '/' ? '/' : p.replace(/\/[^/]*$/, '') || '/');
const joinOf = (d, x) => (d === '/' ? `/${x}` : `${d}/${x}`);
/** THE WALK (B1): where the absolute path `p` RESOLVES, walked as the kernel walks it — component by component from '/', a
 *  name joined to the RESOLVED prefix, a link read and walked from the folder it sits in, '..' to the parent of what the
 *  prefix resolved to; a component that is not there is walked ON as if it were made (主开发 01:18Z: a missing folder, a
 *  parent step, then a link INTO the home lands in the home once a program makes the folder). Two primitives are the caller's: `kind(p)` → 'link' | 'dir' | 'file' |
 *  'missing' | 'error' (could not look: no permission, a name too long, …) and `readlink(p)`. → the path, or null when it
 *  COULD NOT LOOK (the 40-hop bound, a look that failed, a part that is a file with more after it, a readlink that threw):
 *  a value naming such a path is DROPPED. */
function walk(p, { kind, readlink } = {}, max = 40) {
  const queue = String(p).split('/').filter((x) => x && x !== '.');
  let cur = '/', hops = 0;
  while (queue.length) {
    const c = queue.shift();
    if (c === '..') { cur = parentOf(cur); continue; }
    const next = joinOf(cur, c), k = kind(next);
    if (k === 'link') {
      if (++hops > max) return null;
      let t; try { t = String(readlink(next)); } catch { return null; }
      if (t.startsWith('/')) cur = '/';
      queue.unshift(...t.split('/').filter((x) => x && x !== '.'));
      continue;
    }
    if (k === 'missing') { cur = next; continue; }
    if (k === 'error' || (k === 'file' && queue.length) || (k !== 'dir' && k !== 'file')) return null;
    cur = next;
  }
  return cur;
}
/** The resolver with NO file system: every name a folder, no links — '..' then applies to the spelled prefix. This module
 *  reads no fs; a caller passes the file system's (scripts/scratch.mjs resolveFs: this walk over lstat + readlink). */
const noLinks = (p) => walk(p, { kind: () => 'dir', readlink: () => { throw new Error('no links'); } });
const lc = (p) => p.toLowerCase();
const underOne = (q, keys) => keys.some((h) => q === h || q.startsWith(h + '/'));
/** the handed home(s) as compared: each SPELLING (cleanPath) and where it RESOLVES, lower-cased (the comparison may fold
 *  case: it can only drop more) — '/' names nothing */
const homeKeys = (homes, resolve = noLinks) => [...new Set((Array.isArray(homes) ? homes : [homes]).filter(isAbs)
  .flatMap((h) => [cleanPath(h), resolve(h)]).filter(isAbs).map(lc))].filter((h) => h !== '/');
/** Does the absolute path `p` lie under one of the keys — as SPELLED (no '..' folded: /home/u/../x is spelled under the
 *  home), else where it RESOLVES? A path the walk could not look at counts as under (when in doubt it drops). The spelling
 *  answers first, so the walk never runs for a path it already answered. */
const underKey = (p, keys, resolve = noLinks) => {
  if (underOne(lc(cleanPath(p)), keys)) return true;
  const r = resolve(p);
  return r === null || underOne(lc(r), keys);
};

/** THE SUITE VERDICT. `home` = the home the process would use (os.homedir(): $HOME, else the passwd entry), judged by where
 *  it RESOLVES (主开发 18:25Z item 1: a home spelled through a temp root is not under it). A home under a temp root (a lane
 *  env's home, a scratch home a suite made) is left alone; any other home — the person's, the hosted runner's account
 *  home — is re-homed; so is a home that is not an absolute path. `tmpRoots` are the system's fixed temp folders (/tmp,
 *  /var/tmp: they hold every lane's home), `varRoots` the temp-directory VARIABLE's (TMPDIR) — a variable root that equals
 *  the handed home or stands above it is not a temp root (TMPDIR=$HOME no longer turns the re-home off); every root is
 *  judged resolved too. `notTemp` (scripts/scratch.mjs's seam): folders that are NOT temp roots for
 *  this verdict — it can only turn a re-home ON.
 *  → { rehome, why }   why: 'temp-home' (left alone) · 'home' · 'no-home' */
function suiteRehome({ home, tmpRoots, varRoots = [], notTemp = [], resolve = noLinks } = {}) {
  if (!isAbs(home)) return { rehome: true, why: 'no-home' };
  const at = (p) => { const r = resolve(p); return r === null ? cleanPath(p) : r; };
  const h = at(home);
  const nt = rootsOf(notTemp).map(at);
  if (nt.some((t) => isUnder(h, t))) return { rehome: true, why: 'home' };
  const roots = [...rootsOf(tmpRoots).map(at), ...rootsOf(varRoots).map(at).filter((t) => !isUnder(h, t))];
  if (roots.some((t) => isUnder(h, t))) return { rehome: false, why: 'temp-home' };
  return { rehome: true, why: 'home' };
}

/** THE HUB VERDICT (shape H). A hub is THROWAWAY ⇔ the handed home would be re-homed by the suite verdict (it is not
 *  under a temp root — a suite already gave it one) AND its declared root lies under a temp root that is not inside
 *  that home (TMPDIR=/home/x/tmp is no proof of a throwaway copy) AND the root is not a recognised real install
 *  (`realInstall`: a service unit naming this root, read once at boot by the caller — this function reads nothing).
 *  → { rehome, why }   why: 'throwaway' · 'temp-home' · 'no-root' · 'not-temp' · 'real-install' */
function hubRehome({ root, home, tmpRoots, varRoots = [], resolve = noLinks, realInstall = false } = {}) {
  const r = trimSlash(root);
  if (!isAbs(r)) return { rehome: false, why: 'no-root' };
  const s = suiteRehome({ home, tmpRoots, varRoots, resolve });
  if (!s.rehome) return { rehome: false, why: s.why };
  const h = trimSlash(home);
  const roots = [...rootsOf(tmpRoots), ...rootsOf(varRoots)].filter((t) => !(isAbs(h) && isUnder(t, h)));
  if (!roots.some((t) => isUnder(r, t))) return { rehome: false, why: 'not-temp' };
  if (realInstall) return { rehome: false, why: 'real-install' };
  return { rehome: true, why: 'throwaway' };
}

/** THE SYSTEM'S FIXED DIRECTORIES (主开发 17:06Z item A: PATH IS BUILT, NOT FILTERED): a re-homed process's PATH is its own
 *  tool folder and these — NOTHING of the handed PATH is carried, so no entry, however spelled or linked, leads into the home. */
const SYSTEM_PATHS = Object.freeze({
  linux: Object.freeze(['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin']),
  darwin: Object.freeze(['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']),
});
const systemPath = (platform) => SYSTEM_PATHS[platform] || SYSTEM_PATHS.linux;
/** THE TOOLS A RE-HOMED PATH REACHES BY NAME — linked into the new home's own folder (binDir), each a row with its reason. A
 *  missing tool has two doors: install it in a system directory, or add it here as a row (a REAL agent CLI never: its door
 *  is scripts/scratch.mjs REAL_CLI_ALLOW). */
const TOOL_ROWS = Object.freeze([
  Object.freeze({ name: 'node', from: 'self', is: ['node'], why: "the runtime itself — the suite's OWN node (scripts/scratch.mjs: the running executable, or, when that resolves under the handed home, a link or copy of it out of the home): a script's `#!/usr/bin/env node` and a spawn of `node` by name" }),
  Object.freeze({ name: 'npm', from: 'beside-node', is: ['npm', 'npm-cli.js'], why: "the build road (ci.mjs runBuild, the stub gate repos) — the copy BESIDE the resolved node, its own installation's, never a manager's shim first on a PATH" }),
  Object.freeze({ name: 'npx', from: 'beside-node', is: ['npx', 'npx-cli.js'], why: 'the suites that bundle with `npx esbuild` — beside the resolved node, as npm' }),
  Object.freeze({ name: 'dtach', from: 'home-local-bin', is: ['dtach'], why: "the session helper the product itself builds into ~/.local/bin on a machine without admin rights — linked only when no system directory has one" }),
  Object.freeze({ name: 'gh', from: 'outside-home', is: ['gh'], why: "the first copy on the handed PATH that RESOLVES outside the handed home: the CI's pinned, reviewed gh (test-vault-run-model ⑤c) — linked only when that copy is not in a system directory (the system's directories answer the same)" }),
]);
const AGENT_CLIS = Object.freeze(['claude', 'codex', 'opencode', 'agy', 'gemini', 'qwen', 'cursor-agent', 'copilot', 'amp', 'aider', 'goose', 'crush', 'kimi']);
const baseOf = (p) => String(p).replace(/\/+$/, '').replace(/^.*\//, '');
/** What to link into binDir: [{ name, target }]. Pure: `exists(file)` and `resolve(path)` are the caller's. `execPath` = the
 *  node the suite now RUNS (its own); `nodeInstall` = the folder npm / npx sit beside (the handed node's, resolved). A row
 *  links only a file that RESOLVES to what the row names (`is`: its own basenames) — a row whose file leads to anything
 *  else (an agent CLI under a helper's name) is not linked; a row NAMED like an agent CLI is refused outright. */
function binLinks({ execPath = null, nodeInstall = null, handedPath = [], home = null, exists = () => false, resolve = noLinks, platform = 'linux', rows = TOOL_ROWS } = {}) {
  const keys = homeKeys(home ? [home] : [], resolve), sys = systemPath(platform), out = [];
  const beside = isAbs(nodeInstall) ? cleanPath(nodeInstall) : isAbs(execPath) && resolve(execPath) ? parentOf(resolve(execPath)) : null;
  for (const r of rows) {
    if (AGENT_CLIS.includes(r.name)) throw new Error(`binLinks(): ${r.name} is an agent CLI — never linked into a re-homed PATH`);
    let target = null;
    if (r.from === 'self') target = isAbs(execPath) ? resolve(execPath) : null;
    else if (r.from === 'beside-node') { const f = beside ? joinOf(beside, r.name) : null; target = f && exists(f) ? f : null; }
    else if (r.from === 'home-local-bin') { const f = home ? `${cleanPath(home)}/.local/bin/${r.name}` : null; target = f && !sys.some((d) => exists(`${d}/${r.name}`)) && exists(f) ? resolve(f) : null; }
    else if (r.from === 'outside-home') { const f = handedPath.filter(isAbs).map((d) => joinOf(cleanPath(d), r.name)).find((x) => !(keys.length && underKey(x, keys, resolve)) && exists(x)); target = f && !sys.includes(parentOf(f)) ? resolve(f) : null; }
    const lands = target && resolve(target);
    if (target && lands && (r.is || [r.name]).includes(baseOf(lands)) && !AGENT_CLIS.includes(baseOf(lands))) out.push({ name: r.name, target });
  }
  return out;
}

/** THE ENVIRONMENT A RE-HOMED PROCESS HANDS ON IS BUILT, NOT FILTERED (主开发 01:18Z / 01:23Z). It carries HOME (the new
 *  one), PATH (built) and ONLY the variables named here — exact names, and the prefixes that are the tree's own knobs, the
 *  runner's and the locale's — each with its value's SHAPE. A value that fits its shape is judged (a path three ways); one
 *  that fits none is not carried. Everything else is NOT carried, and the one line names it. */
const SHAPES = Object.freeze({
  word: (v) => !/[/~$]/.test(v),                                                          // no path, no home by name
  zone: (v) => /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(v),               // an IANA time zone (Area/City)
  path: (v) => isAbs(v) && !/[:\n\0]/.test(v),                                            // one absolute path (no ':' — a list is never judged as one path)
  paths: (v) => v !== '' && v.split(':').every((x) => isAbs(x) && !/[\n\0]/.test(x)),     // a : list of them, carried WHOLE or not at all
});
const R = (name, shape, why, prog) => Object.freeze({ name, shape, why, ...(prog ? { prog } : {}) });
const P = (prefix, why) => Object.freeze({ prefix, shape: 'any', why });
const ENV_ROWS = Object.freeze([
  ...['USER', 'LOGNAME'].map((n) => R(n, 'word', "the account's NAME (git, ssh and the CLIs read it; a name, never a path)")),
  ...['LANG', 'LANGUAGE', 'TERM', 'NO_COLOR'].map((n) => R(n, 'word', 'the locale and the terminal: how text is read and drawn')),
  P('LC_', 'the locale categories'),
  R('TZ', 'zone', "the clock's zone: what a suite's own dates are printed in"),
  ...['CI', 'NODE_ENV', 'UV_THREADPOOL_SIZE'].map((n) => R(n, 'word', 'a switch of the run itself (the CI, node)')),
  R('NO_UPDATE_NOTIFIER', 'word', 'npm asks no update check', 'npm (its update notifier)'),
  ...['GH_PIN_VERSION', 'SEGMENT_DOWNLOAD_TIMEOUT_MINS'].map((n) => R(n, 'word', 'set by the CI workflow for every step')),
  ...['TMPDIR', 'SHELL'].map((n) => R(n, 'path', 'where scratch goes, and the shell a child runs — a path, judged three ways')),
  ...['SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS'].map((n) => R(n, 'path', 'the certificates a TLS client trusts — a path, judged three ways', 'node and openssl')),
  ...['GIT_SSL_CAINFO', 'GIT_SSL_CAPATH'].map((n) => R(n, 'path', 'the certificates git trusts — a path, judged three ways')),
  R('XDG_DATA_DIRS', 'paths', "the system's shared data folders — a list, carried whole or not at all", 'the desktop programs a suite starts (GTK, fontconfig, xdg-open)'),
  // the PRODUCT's own namespace is carried ONLY by these named rows — the few the harness and the CI workflow set for a suite;
  // everything else under it (a job's token and names, the instance's password and keys, a paired machine's device root…) is
  // the product's, never a suite's knob (主开发 02:28Z cure 2)
  R('VIBESPACE_CI_OAT', 'word', "the CI's sign-in for the ONE real turn (test-chat-e2e), set by the workflow"),
  R('VIBESPACE_CI_DIR_SWEEP', 'word', "the tier runner's directory-sweep switch, set for each suite"),
  R('VIBESPACE_SUITE_BUDGET_MS', 'word', "the tier runner's budget for the suite it runs"),
  R('VIBESPACE_SUITE_HANG_REPORT', 'path', "where the tier runner asks a suite's hang report to go — a path, judged three ways"),
  // the re-land's census (主开发 r1083 cure 1: every name the runner, the workflow file or the kit hands a suite is a row or a named NOT)
  R('VIBESPACE_SUITE_EGRESS_FILE', 'path', "where the tier runner's egress sampler writes a suite's sockets (B-9dd0): a fork()ed child and a Worker carry the sampler by its --require and the file by this name — a path, judged three ways"),
  R('VIBESPACE_CI_SCRATCH_ROOTS', 'paths', "the gate's configured scratch roots (scripts/scratch-run.mjs SCRATCH_ROOTS_ENV): a suite's own stamp and the reaper's judgment read them — a list, carried whole or not at all"),
  // THE PROCESS MARKS (B-ba47's follow-up, 主开发 r863 MUST 2): ids, no route and no credential — how the person's Stop and a
  // job's stop find what a suite's children left behind; the scratch import keeps them, so the built env carries them too
  ...CONVERSATION_MARKS.map((n) => R(n, 'word', "a process MARK (src/conversation-env.js CONVERSATION_MARKS): an id the person's Stop or a job's stop finds escapees by — no route, no credential")),
  P('VS_', "the SUITES' namespace: their knobs, carried by shape"),
  P('GITHUB_', "the hosted runner's"), P('RUNNER_', "the hosted runner's"),
]);
const DESKTOP = 'the person\'s DESKTOP SESSION: a re-homed suite must not open a window on the person\'s screen, use the person\'s session bus, or ask the person\'s keyring — a suite that needs a display, a bus or a runtime folder makes its own';
const N = (why, tag, prog) => (n) => Object.freeze({ name: n, why, tag, ...(prog && prog(n) ? { prog: prog(n) } : {}) });
const ENV_NOT = Object.freeze([
  ...['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_DESKTOP', 'XDG_SESSION_CLASS', 'DESKTOP_SESSION', 'XDG_SEAT', 'XDG_SESSION_ID', 'XDG_VTNR', 'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'GNOME_KEYRING_CONTROL', 'GPG_AGENT_INFO', 'PULSE_SERVER'].map(N(DESKTOP, 'the desktop session', (n) => (['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP', 'SSH_AUTH_SOCK'].includes(n) ? null : 'the desktop\'s own programs (the session, the keyring, the signing agent, the sound server)'))),
  ...['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'no_proxy', 'NO_PROXY', 'all_proxy', 'ALL_PROXY', 'ftp_proxy', 'FTP_PROXY'].map(N('a PROXY: the suites are loopback-only, and the claims\' environment unsets them', 'a proxy', () => 'curl, git, npm')),
  // a PINNED agent CLI (the suites' own pin form, VS_<CLI>_BIN — the computed family): the person's real CLI. A suite reaches one
  // only through the real-CLI accessor (scripts/scratch.mjs REAL_CLI_ALLOW), which reads the HANDED pin (主开发 02:28Z cure 1)
  ...AGENT_CLIS.map((c) => `VS_${c.toUpperCase().replace(/-/g, '_')}_BIN`).map(N("a PINNED agent CLI: the person's real CLI — a suite reaches one only through the real-CLI accessor (scripts/scratch.mjs REAL_CLI_ALLOW)", 'a pinned agent CLI', () => 'the real-CLI accessor (scripts/scratch.mjs handedCliCandidates)')),
  ...['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME'].map(N("an XDG base folder: it follows each process's OWN home", 'an XDG base folder', (n) => (n === 'XDG_STATE_HOME' ? 'every XDG program' : null))),
  ...['PWD'].map(N("the caller's shell's folder, not the suite's", "the caller's shell")),
  // the tier runner's OWN knobs and the kit's switch (主开发 r1083 cure 1): how the runner runs, never what a suite is handed for itself
  ...['VIBESPACE_CI_LANES', 'VIBESPACE_CI_LANE_ROOT', 'VIBESPACE_CI_REMOTE_RUN'].map(N("the tier runner's own (how many lanes, where they live, a remote run's word): a suite is handed what each means for it (its HOME, its budget), never the runner's knob", "the runner's own")),
  ...['VIBESPACE_SKIP_AGENT_HOOKS'].map(N("the kit's switch for the hubs it starts itself: a suite that needs it sets it for its own child, by name", "the kit's switch")),
  ...['NODE_OPTIONS'].map(N('free text that can preload code from anywhere — not a shape', 'free text')),
  ...['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'NVM_DIR', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'CODEX_API_KEY'].map(N("the person's agent CLIs: their folders, their sign-ins", "the person's agent CLIs", (n) => (['ANTHROPIC_AUTH_TOKEN', 'CODEX_API_KEY'].includes(n) ? 'the agent CLIs' : null))),
]);
const notRow = (k, not = ENV_NOT) => not.find((x) => x.name === k) || null;
const rowOf = (k, rows = ENV_ROWS) => rows.find((x) => x.name === k) || rows.filter((x) => x.prefix && k.startsWith(x.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0] || null;
/** THE THREE WAYS (主开发 01:18Z / 01:23Z): the absolute path `p` lands where the kernel walks it (going ON past a missing
 *  part), where a program that folds parent steps by spelling lands it, and its PARENT folder (where a write in it lands)
 *  by both. → null (fine: every landing is outside the handed home, or under the CHECKOUT's own root — the suite's own
 *  tree, amendment 5) or the reason it is not carried. */
function judgePath(p, keys, { resolve = noLinks, checkout = [] } = {}) {
  const sp = cleanPath(p), parent = parentOf(sp), k = resolve(sp);
  // a path whose kernel landing is INSIDE the checkout (its root included) is the suite's own tree: its parent is not asked
  const own = k !== null && checkout.length && underOne(lc(k), checkout);
  const lands = [['as the kernel walks it', k], ['folded by spelling', resolve(noLinks(sp))], ...(own ? [] : [['its parent, as the kernel walks it', resolve(parent)], ['its parent, folded by spelling', resolve(noLinks(parent))]])];   // a fold is walked through links too (8b)
  for (const [how, l] of lands) {
    if (l === null) return `could not look (${how})`;
    if (underOne(lc(l), keys) && !(checkout.length && underOne(lc(l), checkout))) return `under the handed home (${how})`;
  }
  return null;
}
/** One value of a carried row: → null (carried) or why it is not. */
function judgeValue(row, v, keys, opt) {
  if (row.shape === 'any') {
    if (SHAPES.word(v)) return null;
    if (SHAPES.path(v)) return judgePath(v, keys, opt);
    if (SHAPES.paths(v)) { for (const x of v.split(':')) { const w = judgePath(x, keys, opt); if (w) return `an entry ${w}`; } return null; }
    return 'not a word, not a path';
  }
  if (!SHAPES[row.shape](v)) return `not a ${row.shape}`;
  if (row.shape === 'path') return judgePath(v, keys, opt);
  if (row.shape === 'paths') { for (const x of v.split(':')) { const w = judgePath(x, keys, opt); if (w) return `an entry ${w}`; } return null; }
  return null;
}

/** THE VALUE RULE — the environment BUILT from `env`, re-homed from the handed home (`oldHome`; `oldHomes`: other spellings)
 *  to `newHome`: HOME = newHome; PATH = binDir + the system's fixed directories (nothing of the handed PATH carried; what was
 *  not is reported: under the home in `~` form, else as it was); every other variable carried ONLY when it is a row of
 *  ENV_ROWS (and not of ENV_NOT) and its value fits the row's shape and passes its judgment. `checkout` = the suite's own
 *  tree (a path under it is carried even when it lies under the handed home: the hosted runner's workspace does).
 *  → { env, carried, notCarriedNames: [{ name, why }], dropped: [names], notCarried: [PATH entries], pathDropped,
 *  handedPath, binDir, unset, own, ownPath } — names, entries and reasons, never a value. The home's keys are made ONCE.
 *  `handed` (B-ba47 B2, 主开发 2026-11-15 11:17Z item 3: «a suite's own planted names and records reach its own children
 *  exactly as on master») = the environment the process was STARTED with (scripts/scratch.mjs reads the kernel's copy,
 *  /proc/self/environ): only what it holds is the caller's to judge. A name the process set ITSELF — absent from it, or with
 *  another value — is the suite's own and is kept as it is (`own`); its own PATH entries (`ownPath`: not in the handed PATH)
 *  go in front of the built one; a handed name it removed stays removed. A suite whose first load of the re-home comes after
 *  its own code ran (a dynamic import: test-agentd-remote's census leg planted four names, then `import('./mutant-copy.mjs')`)
 *  so loses nothing it planted. null = not known (no /proc): every name is judged, the rule before. */
function rehomeEnv(env, { oldHome, oldHomes = [], newHome, binDir, platform = 'linux', resolve = noLinks, checkout = null, rows = ENV_ROWS, not = ENV_NOT, handed = null } = {}) {
  const nh = trimSlash(newHome);
  if (!isAbs(nh) || nh === '/') throw new Error('rehomeEnv(): newHome must be an absolute directory');
  const homes = [oldHome, ...(Array.isArray(oldHomes) ? oldHomes : [])];
  const keys = homeKeys(homes, resolve), sys = systemPath(platform);
  const co = checkout ? homeKeys([checkout], resolve) : [];
  const bin = isAbs(binDir) ? trimSlash(binDir) : `${nh}/.vs-bin`;
  const out = {}, carried = [], notCarriedNames = [], unset = XDG_BASE.filter((k) => env && env[k] !== undefined);
  const started = handed && typeof handed === 'object' ? handed : null;
  const isOwn = (k, v) => !!started && (!Object.prototype.hasOwnProperty.call(started, k) || started[k] !== v);
  const handedPath = String((started && typeof started.PATH === 'string' ? started.PATH : env && env.PATH) || '').split(':');
  const ownPath = started ? [...new Set(String((env && env.PATH) || '').split(':').filter((d) => d && !handedPath.includes(d)))] : [];
  const own = [];
  const keyOf = (q) => keys.find((k) => lc(q) === k || lc(q).startsWith(k + '/'));
  const tilde = (d) => {   // the ~ form of an entry under the home — by its spelling first, by where it resolves when that does not answer
    const raw = cleanPath(d), rk = keyOf(raw);
    if (rk) return '~' + raw.slice(rk.length);
    const res = resolve(d), k = res && keyOf(res);
    return k ? '~' + res.slice(k.length) : res === null ? `${d} (could not look)` : d;
  };
  const notCarried = [...new Set(handedPath.filter((d) => !sys.includes(trimSlash(d))).map((d) => (!d ? '(an empty entry)' : !isAbs(d) ? `(relative: ${d})` : tilde(d))))];
  for (const [k, v] of Object.entries(env || {})) {
    if (v === undefined || k === 'HOME' || k === 'PATH') continue;
    if (isOwn(k, v)) { out[k] = v; own.push(k); continue; }   // the process set it itself: its own, never judged
    const no = notRow(k, not), row = no ? null : rowOf(k, rows);
    const why = no ? no.why : !row ? 'not a row' : judgeValue(row, String(v), keys, { resolve, checkout: co });
    if (why) { notCarriedNames.push({ name: k, why }); continue; }
    out[k] = v; carried.push(k);
  }
  out.PATH = [...ownPath, bin, ...sys].join(':');
  out.HOME = nh;
  notCarriedNames.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { env: out, carried: carried.sort(), notCarriedNames, dropped: notCarriedNames.map((x) => x.name), notCarried, pathDropped: notCarried.length, handedPath: handedPath.filter(Boolean), binDir: bin, unset, own: own.sort(), ownPath };
}

module.exports = { XDG_BASE, SYSTEM_PATHS, TOOL_ROWS, AGENT_CLIS, ENV_ROWS, ENV_NOT, SHAPES, tempRootOf, suiteRehome, hubRehome, cleanPath, walk, noLinks, homeKeys, judgePath, binLinks, rehomeEnv };
