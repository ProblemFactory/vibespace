/**
 * HostManager — SSH host registry for remote sessions (collaboration P2).
 *
 * - Host records in data/hosts.json: {id, name, user, host, port, keyPath}.
 *   No secrets stored — auth is ssh key based (reuses ~/.ssh by default; an
 *   in-app generated ed25519 pair lives in data/ssh/ with the public key
 *   surfaced for authorized_keys).
 * - Connectivity test: `ssh -o BatchMode=yes … true` (never prompts).
 * - Remote session discovery runs over ssh on demand (lock files + project
 *   JSONL listing), cached with a short TTL — no daemon on the remote.
 * - Remote transcripts stay on the remote host by design; resume/fork must
 *   target the same host (session records carry `host`).
 */

const fs = require('fs');
const REMOVAL_RETRY_MS = 60 * 1000;   // 主开发 04:33Z (2b): a removal's own files wait for its record to land — asked again this far apart
const os = require('os');
const path = require('path');
const FC = require('./fd-close.js');   // B-15ac: the ONE close of a written file (a failed close said in the journal)
const SR = require('./store-read.js'); // remainder of B-f276 (bl-jobs): a read that FAILED is no answer — held, never written over
const HOLD = require('./store-read-hold.js');   // B-f276 family unit 2 commit 3: the kept copies' question (copiesOf)
const HOSTS_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v);   // hosts.json's one shape check (the start's read and the helper's)
const READ_WAITS_MAX = 256;   // 主开发 01:20Z (4): the waits for a held hosts.json's read are BOUNDED (keyed ones replace: one a key)
const crypto = require('crypto');
const SOCK = require('./sock-path.js');   // B-3767 unit 2: THE folder verdict (ensureSocketDir) for the ssh control folder
const { REMOTE_PRELUDE, nodeFinder, agentNodeOf } = require('./remote-shell.js');
// the hello a device's link holds, read from MEMORY (B-24e2's follow-up door helloInfo: status() also reads the socket's witness on
// the loop); an older DeviceManager without it ⇒ status().info. B-b83c reads the agent's own node through it
// B-99b9: the path field's two asks on another machine (hosts.dirSlice): the hub's own wait, the run's bound, the marks and holds
const DIR_SLICE_WAIT_MS = 2000;      // the hub stops WAITING on its asks here and replies (its own race, never the run's timeout)
const SLICE_TYPED_CAP = 4;          // typed folders one text asks at once (the bases' order): each is ONE shell there; past it, named unread
const SLICE_RUN_MS = 6000;           // a run's own bound there (the device's runCmd / the ssh rung)
const COLLECT_STUCK_ASK_MS = 10000;   // r2974: a machine whose collector said it cannot serve is asked again whether it can, behind the answers, at most this often
const SLICE_DEADLINE_MS = 20000;     // a run that has not SETTLED by now never will (a shell stuck in the kernel): missed / hung — past the longest road
                                    // (the device's connect 4 s + the hub's own bound 7.5 s, then the ssh rung's 6 s), so a slow healthy landing is kept (r949)
const SLICE_HUNG_MS = 30e3;          // a typed folder that never landed: marked this long (the hub rung's PROBE_LATE_MS)
const SLICE_HOLD_MS = 30e3;          // a rest that did not land holds the machine's rest this long, doubling on each miss in a row…
const SLICE_HOLD_MAX_MS = 600e3;     // …up to this
const LIST_FRESH_REMOTE_MS = 2000;   // a landed rest older than this is said LATE while a new one is out (the rung's LIST_FRESH_MS)
const helloOf = (dm) => { try { return typeof dm.helloInfo === 'function' ? dm.helloInfo() : dm.status().info; } catch { return null; } };
const { parseReceiptLines, decodePlan } = require('./harness-config'); // CFG| receipt lines from the shipped helper (design-harness-settings §6); the plan codec (r3064)
const AC = require('./agentd/answer-caps.js'); // B-5278: a usage walk's dropped events said once; the device walk's harvest bound
const { usageBearerOk, usageBearerRefusal } = require('./login-expiry.js'); // PURE: THE USAGE BEARER LAW (B-5e0d — the host rungs follow the local ladder's rule)
const { execFile } = require('child_process');
/** B-2ca0: the port words and the destination of a record — module functions (sshArgs / sshCmd are also called with a stand-in
 *  `this`): an ssh-config entry (`viaConfig`) keeps its own Port when none was typed (null) and its own User when none was given */
const portArgsOf = (h) => (h && h.viaConfig && h.port == null ? [] : ['-p', String((h && h.port) || 22)]);   // its read 2: a TYPED port (22 too) always wins; only a port left empty is the config's
const destOf = (h) => (h && h.viaConfig && !h.user ? String(h.host) : `${h.user}@${h.host}`);
/** B-2ca0 (commit 2): a machine reached THROUGH another host — `jump` (a pasted block's ProxyJump, or the form's field), dialled by
 *  a hop of OUR ssh (a ProxyCommand, below). A shell command is built from it, so a record's jump is asked again here: one that does
 *  not read refuses the road by name — never a dial around it, never an option */
const { jumpVerdict, jumpParts, jumpTargetOk } = require('./ssh-config-block.js');
// its third read: the hop's command carries the record's address as ssh's %h (an ssh before 9.6 checks no character of it; a tailnet
// name's %h is the plugin's IP) — a machine behind a jump host has an address of plain host characters (jumpTargetOk, the page's rule
// too), at the add, at the import and on every road
const jumpArgsOf = (h, sshDir) => {
  if (!h || h.jump == null) return [];
  const j = jumpVerdict(h.jump);
  if (!j.ok) throw new Error(`"${h.name || h.host}": its jump host is not one [user@]host[:port] — add the machine again`);
  if (j.jump && !jumpTargetOk(h.host)) throw new Error(`"${h.name || h.host}": a machine behind a jump host has an address of plain host characters — add the machine again`);
  if (!j.jump) return [];
  // its delta read: ssh's own -J hop takes NONE of our -o options (OpenSSH builds it as `ssh -l -p -W … host`) — a bastion never dialled
  // would ask about its host key on no tty, with no BatchMode and no ConnectTimeout. The hop is OUR ssh, with the same options; each of
  // its words is plain host characters (jumpVerdict), `[%h]:%p` quoted for the shell ssh runs a ProxyCommand with
  const p = jumpParts(j.jump);
  // the move onto 6ce6b8124 (lane lg-remote-hardening): the host-key check left SSH_BASE_OPTS for HK.hostKeyOpts (per record) — and
  // r3431 (B-7f0b's remainder): the HOP's check is the record's too (HK.hopKeyOpts): a jump host key the person pinned ⇒ strict over
  // the record's own hop file; none ⇒ exactly as at the release, accept-new into the hub user's own known_hosts (nothing pins by itself)
  return ['-o', 'ProxyCommand=' + ['ssh', ...SSH_BASE_OPTS, ...HK.hopKeyOpts(sshDir, h), ...(p.user ? ['-l', p.user] : []), ...(p.port ? ['-p', p.port] : []), '-W', "'[%h]:%p'", p.host].join(' ')];
};
/** B-2ca0 follow-up (主开发 19:23Z): ONE VERDICT over an ssh machine record's words — the add asks it of a typed machine and the config
 *  import of EVERY record a bundle carries (an imported record is judged as the add judges a typed one: a user beginning with «-» would
 *  be an argv word ssh reads as an option at the next dial). → null | an Error with its code (the add throws it; the import names it) */
const CONTROL_RE = /[\x00-\x1f\x7f]/;
/** its reads: an imported KEY PATH is absolute and holds no control character — as the add takes one (a space or a quote is a
 *  person's file name: sshCmd quotes by rsync's own rule, every other road passes argv) */
const PLAIN_KEY_PATH = /^\/[^\x00-\x1f\x7f]*$/;
/** its reads: a graduated machine's install folder is EXACTLY the shape the hub writes — `$HOME/.vibespace/device@<host>`, the host
 *  in the installer's own characters (src/server/mounts-plugins-wiring.js graduation; scripts/vibespace-agentd-install.sh ROOT).
 *  The removal runs `rm -rf` on it there: `$HOME//`, `$HOME/.ssh` or `$HOME/..` never pass (the wiring's guard asks THIS rule) */
const dialRootOk = (r) => typeof r === 'string' && /^\$HOME\/\.vibespace\/device@[A-Za-z0-9][A-Za-z0-9.-]*$/.test(r);   // its delta read: the host starts with a letter or digit (`device@..` is no host; the removal's pkill reads it as a pattern)
/** its delta read: the install folder of a graduated machine, derived as the INSTALLER derives it (scripts/vibespace-agentd-install.sh:
 *  the URL's text after `://` up to the first «/», «:» or «?», then only A-Za-z0-9.-, else `dial`) — the hub's old derivation took the
 *  URL's whole hostname, so an IPv6 base named another folder (`[fd00::1]` ⇒ fd001 here, fd00 there) and the removal missed the install */
const dialRootOf = (base) => {
  const host = ((String(base || '').replace(/^[a-z]+:\/\//i, '').match(/^[^/:?]+/) || [''])[0]).replace(/[^A-Za-z0-9.-]/g, '');
  return `$HOME/.vibespace/device@${host || 'dial'}`;
};
function sshRecordRefusal({ host, user, viaConfig = false, jump = null } = {}) {
  const no = (why, code) => Object.assign(new Error(why), code ? { code } : {});
  if (!host) return no('host required');
  if (!user && !viaConfig) return no('user required');   // an alias of the hub's ssh config may leave its User to the config
  if (String(host).startsWith('-') || String(user || '').startsWith('-')) return no('the address and the user may not start with «-»', 'dash');   // never an ssh option
  if (CONTROL_RE.test(String(host)) || CONTROL_RE.test(String(user || ''))) return no('the address and the user hold no control character', 'control');
  const jv = jumpVerdict(jump);   // ONE jump host, plain host characters (the hop's command is built from it)
  if (!jv.ok) return no(jv.code === 'chain' ? 'one jump host only — a chain of jump hosts is not used' : 'the jump host is not one [user@]host[:port]', 'jump-' + jv.code);
  if (jv.jump && !jumpTargetOk(host)) return no('a machine behind a jump host has an address of plain host characters', 'jump-target-form');
  return null;
}
/** …and its PORT, as the add stores it: an alias left empty ⇒ null (the config's); empty ⇒ 22; else a whole number 1–65535 —
 *  anything else is refused by code (never a word on ssh's argv). → { port } | { refuse: Error } */
function sshPortOf(port, viaConfig = false) {
  if (port == null || String(port).trim() === '') return { port: viaConfig ? null : 22 };
  const n = Number(String(port).trim());
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? { port: n } : { refuse: Object.assign(new Error('the port is a whole number from 1 to 65535'), { code: 'port-form' }) };
}
/** its read: the shared connection's socket — a record reached through a jump host gets its own (an ssh whose %C does not hash the
 *  jump would let two records to one address, through different jump hosts, ride one connection) */
const cmNameOf = (h) => (h && (h.jump || (h.sshConfig && h.sshConfig.proxied)) ? `%C-j${crypto.createHash('sha1').update(String(h.jump || 'config:' + h.host)).digest('hex').slice(0, 8)}` : '%C');   // its delta read: an alias its ssh config proxies too
/** B-2ca0: the add route's verdict over resolveAlias's answer `a` and the form's `body` → { viaConfig, port, user, sshConfig, refuse }.
 *  A CONFIGURED name (an alias, or an entry with its own Port / User) is `viaConfig`; a port left EMPTY is the config's (null) — a
 *  typed one (22 too) is the person's; a blank user is the config's only where the entry names one (else «user required»: ssh would
 *  dial as the hub's own user); `sshConfig` = what ssh resolves (the SFTP road reads no ssh config). Pure. */
function configVerdict(a, body, home = '') {
  const user = String((body && body.user) || '').trim(), portIn = body && body.port != null ? String(body.port).trim() : '';
  const configured = !!(a && a.configured);
  if (!user && !(configured && !a.userIsDefault)) return { refuse: 'user required' };
  const idf = a && a.identityFile ? String(a.identityFile).replace(/^~(?=\/)/, home) : null;
  const po = sshPortOf(portIn, configured);   // B-2ca0 follow-up: the add's own port rule — a typed «abc» is refused by code, never 22 in silence
  if (po.refuse) return { refuse: po.refuse.message, code: 'port-form' };
  return { viaConfig: configured, user, port: po.port,
    ...(configured ? { sshConfig: { host: a.hostname, user: a.user, port: a.port || 22, identityFile: idf, ...(a.proxied ? { proxied: true } : {}) } } : {}) };   // commit 2: proxied — ssh reaches it through another host (the SFTP road cannot)
}
/** B-2ca0: `ssh -G <name>`'s output (one «key value» line each, lower-case keys, the first one wins) → { alias, hostname, user, port } */
// ssh's DEFAULT identity files: `ssh -G` lists them when an entry names none — then the entry names no key (its read 3)
const SSH_DEFAULT_IDS = new Set(['id_rsa', 'id_ecdsa', 'id_ecdsa_sk', 'id_ed25519', 'id_ed25519_sk', 'id_xmss', 'id_dsa'].map((k) => '~/.ssh/' + k));
function parseSshG(text, name) {
  const kv = Object.create(null), ids = [];
  for (const line of String(text || '').split('\n')) { const m = /^(\S+)\s+(.*)$/.exec(line.trim()); if (!m) continue; if (m[1].toLowerCase() === 'identityfile') ids.push(m[2]); if (!(m[1].toLowerCase() in kv)) kv[m[1].toLowerCase()] = m[2]; }
  const named = ids.every((f) => SSH_DEFAULT_IDS.has(f)) ? null : ids.find((f) => !SSH_DEFAULT_IDS.has(f));
  if (!kv.hostname) return null;
  const proxied = [kv.proxyjump, kv.proxycommand].some((x) => x && x.toLowerCase() !== 'none');   // commit 2: the entry dials THROUGH another host
  return { alias: kv.hostname.toLowerCase() !== String(name).toLowerCase(), hostname: kv.hostname, user: kv.user || null, port: Number(kv.port) || null, identityFile: named || null, proxied };
}
const { serviceEnv, SSH_ENV_KEEP } = require('./agent-env.js');
const { claimJsonls, cwdToProjectDir } = require('./session-store');
const { nameFromUserLine, interpretDiscoveryLines, synthesizeDiscoveryLines, isZstPath, isZstBuffer, ZSTD_MAGIC } = require('./discovery-facts');
const { classifyPrivateKey } = require('./ssh-key-format');
const { fdScanShellFns, cliIdentityShellFns } = require('./writer-sweep');
// the existence probe in front of every kill, from its ONE home (B-3185 r6):
// sysinfo-wiring's signalProc embeds the same text, so there is no per-site
// reason left to get wrong.
const { pidAliveShellFn } = require('./cli-identity');
// lane lg-remote-hardening (B-7f0b, q-042 D6): a machine's ssh host-key pin — its file, its options, its refusal by name
const HK = require('./host-keys.js');

/** B-5e0d: THE USAGE BEARER LAW at the host rungs (kb-design-lessons §9 addendum 2.369.361; the local ladder's usageBearerOk):
 *  only the CLI's own login token — a refresh token beside it — is handed to the usage read. A long-lived token (none beside it,
 *  known by its SHAPE, never its prefix) is refused BY NAME (code 'long-lived': nothing is read); an expired login → null (never
 *  refreshed here — the host's own CLI refreshes it). Nothing is sent anywhere by this: it only answers what may be. */
function remoteUsageBearer(o, whose) {
  if (!o || typeof o !== 'object' || typeof o.accessToken !== 'string' || !o.accessToken) return null;
  // an EXPIRED login is «no valid login» whatever its shape (a login both expired and without its refresh token is not
  // named long-lived): the expiry is asked first, as the device's own op asks it
  if (o.expiresAt && o.expiresAt <= Date.now() + 60000) return null;
  if (!usageBearerOk(o)) throw usageBearerRefusal(whose);
  return o.accessToken;
}

/** B-5e0d: THE PASSIVE USAGE CACHE through the shell — the readings the host's vibespace-usage hook wrote, the files and the
 *  shape an agent's quota-refresh reply carries ({<file stem>: <reading with fetchedAt>}). Read only for an agent OLDER than
 *  the usage bearer law once the law refused its login (asked, that agent would send the token itself): file reads, no
 *  token read, nothing sent; bounded (PASSIVE_PEEK_FILES files, each cut at PASSIVE_PEEK_BYTES). */
// B-5278 unit 2 (r1135): THE PASSIVE READINGS ARE ONE RULE on both roads — the device's readPassive (agentd.js) and this twin
// (held equal by test-device-producer-bounds' parity leg): the first AC.PASSIVE_FILES_MAX names in byte order (a name
// `[\w.-]{1,120}.json`, never __models__), each within AC.PASSIVE_FILE_MAX; a file over it, or an entry that is not a readable file,
// counted; the count printed after the readings
const PASSIVE_PEEK_FILES = AC.PASSIVE_FILES_MAX, PASSIVE_PEEK_BYTES = AC.PASSIVE_FILE_MAX, PASSIVE_PEEK_MARK = '@@vs-passive@@', PASSIVE_PEEK_LEFT = '@@vs-passive-left@@';
const PASSIVE_PEEK_SH = 'cd "$HOME/.vibespace/usage-cache" 2>/dev/null || exit 0; LC_ALL=C ls -1A 2>/dev/null | { n=0; left=0; while IFS= read -r b; do '
  + 'case "$b" in *.json) ;; *) continue;; esac; case "$b" in __models__*) continue;; esac; case "${b%.json}" in "" | *[!A-Za-z0-9_.-]*) continue;; esac; [ ${#b} -le 125 ] || continue; '
  + 'n=$((n+1)); if [ "$n" -gt ' + PASSIVE_PEEK_FILES + ' ]; then left=$((left+1)); continue; fi; '
  + 'if [ ! -f "$b" ] || [ ! -r "$b" ]; then left=$((left+1)); continue; fi; s=$(wc -c < "$b" 2>/dev/null) || { left=$((left+1)); continue; }; s=$((s+0)); '
  + 'if [ "$s" -gt ' + PASSIVE_PEEK_BYTES + ' ]; then left=$((left+1)); continue; fi; '
  + "printf '\\n" + PASSIVE_PEEK_MARK + " %s\\n' \"$b\"; head -c " + PASSIVE_PEEK_BYTES + " \"$b\"; done; printf '\\n" + PASSIVE_PEEK_LEFT + " %s\\n' \"$left\"; }; true";
/** PURE: the peek's output → {<stem>: reading} (a file that is not a reading with fetchedAt is left out, as the agent leaves it). */
/** (r1135) the twin's own count of what it left out (the line after the readings) */
function passiveLeftOfPeek(raw) { const s = String(raw || ''), i = s.lastIndexOf('\n' + PASSIVE_PEEK_LEFT + ' '); return i < 0 ? 0 : Math.max(0, parseInt(s.slice(i + PASSIVE_PEEK_LEFT.length + 2), 10) || 0); }
function passiveOfPeek(raw) {
  const out = {};
  const s0 = String(raw || ''), li = s0.lastIndexOf('\n' + PASSIVE_PEEK_LEFT + ' '), body = li < 0 ? s0 : s0.slice(0, li);
  for (const part of body.split('\n' + PASSIVE_PEEK_MARK + ' ').slice(1)) {
    const nl = part.indexOf('\n');
    const name = nl > 0 ? part.slice(0, nl) : '';
    if (!/^[\w.-]{1,120}\.json$/.test(name) || name.startsWith('__models__')) continue;
    let j = null; try { j = JSON.parse(part.slice(nl + 1)); } catch { j = null; }
    if (j && typeof j === 'object' && j.fetchedAt) out[name.slice(0, -5)] = j;
  }
  return out;
}

// THE SSH HARVEST'S LIMITS (B-6ded, list 1) — what the hub takes from one run of the shipped scanner, and the bound that
// run is held to (usageScanBound: half the bytes, a third of the seconds), passed down in the command. The scanner keeps
// its cursor when its stdout write fails; without a bound a backlog over these limits failed every harvest the same way.
const USAGE_HARVEST_LIMITS = Object.freeze({ maxBuffer: 128 * 1024 * 1024, timeoutMs: 180000 });
// B-5278 unit 2 (r849): a device that could not walk answered its LAST list, its age said — every row says it is old (the
// marks the hub's own last-known list carries: stale, staleAt)
// (r951, THE LAW of item 4) the rows the hub's own fallback serves: each keeps its own age, and its reason is the DEVICE's own
// reply when it gave one (a walk that ran out of time — never «unreachable» for a machine that answered), else unreachable
const lastKnownRows = (sessions, at, deviceWhy) => sessions.map((s) => ({ ...s, stale: true, staleAt: s.staleAt || at, staleWhy: deviceWhy || undefined }));
const discoveryCodeOf = (e) => (e && typeof e.code === 'string' && /^discovery-/.test(e.code) ? e.code : null);
// B-5278 unit 2, its third part (r1044): a device that said its walk is STILL RUNNING (or ran out of its bound, or answered more
// than its bound) is not walked again — its snapshot ask would join the same walk, and the ssh rung would walk the same slow home a
// second time while the first walks on. The hub goes to its last list with the device's reason at once. A child that failed or
// could not start is another matter: the ssh rung's shell walk is a different road, and it is still tried.
const NO_SECOND_WALK = new Set(['discovery-slow', 'discovery-timeout', 'discovery-too-large']);
const staleSessions = (sessions, stale) => { const at = Date.now() - Math.max(0, Number(stale && stale.ageMs) || 0); return sessions.map((x) => ({ ...x, stale: true, staleAt: at, staleWhy: (stale && stale.why) || undefined })); };
const usageScanBound = (L) => ({ maxBytes: Math.floor(L.maxBuffer / 2), maxMs: Math.floor(L.timeoutMs / 3) });
// …and a harvest that failed backs off: 1 min, doubling, at most 30 min (a forced harvest — the owner's own ask — goes)
const HARVEST_BACKOFF_MS = 60 * 1000, HARVEST_BACKOFF_MAX_MS = 30 * 60 * 1000;
/** B-3767 unit 2 (the reader's should): is the ssh control folder ours (sharing on)? A REFUSED folder is judged again at each ask
 *  (one lstat), so its removal turns sharing back on without a restart; a new reason is said once. Ours once, ours after: a 0700
 *  folder of this uid cannot be swapped by another user. */
function cmUsable(hm) {   // a function of the manager, so a method borrowed onto a bare object (a suite's) keeps sharing on
  if (!hm._cmRefused) return true;
  const cm = SOCK.ensureSocketDir(hm._cmDir);
  const why = cm.ok ? null : `${hm._cmDir}: ${cm.why}`;
  if (why && why !== hm._cmRefused) console.warn(`[hosts] ssh connection sharing is off — its control folder is refused: ${why} (the way out: start the hub again with TMPDIR set to a private folder — or have the folder's owner remove it (in a shared, sticky temp folder only its owner or root can); sharing comes back by itself once the folder is gone)`);
  hm._cmRefused = why;
  return !why;
}

const SSH_BASE_OPTS = [
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=6',
  // the host-key check is per record (lane lg-remote-hardening): HK.hostKeyOpts — accept-new for a record with no pin,
  // StrictHostKeyChecking=yes over the record's own pin file for a pinned one
  // Keepalive (2.124.0, remote-stability pass): silent NAT drops / network
  // blips used to leave half-open ssh pipes lingering for the whole TCP
  // timeout — sessions looked alive but were dead, and nothing could react.
  // 15s app-level probes, 4 misses ⇒ ssh exits within ~60s so the reconnect
  // layers (chat-wrapper remote retry / pty-wrapper retry) can act. Applies
  // to EVERY ssh use (session spawns, discovery, remote-fs, rsync via sshCmd).
  '-o', 'ServerAliveInterval=15',
  '-o', 'ServerAliveCountMax=4',
  '-o', 'TCPKeepAlive=yes',
];

/** A MOVED CACHE SLOT IS TERMINAL ON EVERY RUNG (B-7638 round 5). The remote
 *  transcript fetch has two rungs, and the data plane's failures degrade to the
 *  ssh one by design — a `catch` that treats EVERY throw as "this transport did
 *  not work, try the other". The over-cap "the slot moved, refusing to splice"
 *  verdict is not that kind of failure: it is a statement about the CACHE, true
 *  on every transport, and letting it degrade handed the next rung the moved
 *  file to delta from (right-size / wrong-bytes cache, stamped complete, served
 *  forever — the exact corruption the refusal exists to prevent). So the verdict
 *  travels as a CODE the fallback re-throws, never as a message nobody reads. */
const SLOT_MOVED = 'ESLOTMOVED';
const slotMovedError = (msg) => Object.assign(new Error(msg), { code: SLOT_MOVED });
/** How many bytes the LAST fetch of a remote-transcript slot stamped (B-7638
 *  round 5) — ONE definition, because the delta legality test and the error
 *  that explains a refusal must not be able to disagree about it. */
const stampedSizeOf = (meta) => (meta && Number.isFinite(Number(meta.size)) ? Number(meta.size) : NaN);

/** THE ONE STDIN FEED (lane hub-dies-dead-ssh-host — the .346 verify round's HIGH: picking a paired ssh machine that
 *  cannot be reached stopped the whole hub). A child's stdin is a stream, and a stream 'error' nobody listens to is an
 *  uncaught exception — server.js's handler exits the hub on it. ssh to a machine it cannot reach exits at once
 *  (BatchMode), so the bytes we feed it meet a closed pipe: write EPIPE (ECONNRESET / ERR_STREAM_DESTROYED by timing).
 *  feedStdin listens BEFORE the first write and keeps the error as a fact of the feed (`fed.error`) — never a throw,
 *  never an uncaught; the child's own result (its exit, ssh's stderr) says what happened and sshRefusal names it. Every
 *  child this file, src/remote-fs.js and src/machine-mounts.js feed goes through here (test-architecture §101). */
const STDIN_GONE = new Set(['EPIPE', 'ECONNRESET', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END']);
function feedStdin(child, bytes) {
  const fed = { error: null };
  const stdin = child && child.stdin;
  if (!stdin) return fed;
  stdin.on('error', (e) => { if (!fed.error) fed.error = e; });
  try { if (bytes == null) stdin.end(); else stdin.end(bytes); } catch (e) { if (!fed.error) fed.error = e; }
  return fed;
}
/** «my-mac cannot be reached», as an error with a CODE (the road's refusal and the host rung's): the machine's id and
 *  name and ssh's own last stderr line ride along for the field / the route to say. */
function unreachableError(h, line = '') {
  const name = (h && (h.name || h.id)) || 'the machine';
  const l = String(line || '').trim().slice(0, 300);
  return Object.assign(new Error(`${name} cannot be reached${l ? ' — ' + l : ''}`), { code: 'host-unreachable', hostId: (h && h.id) || null, host: name, sshLine: l, params: { host: name, line: l } });
}
/** A failed ssh road BY NAME (feedStdin's partner): `host-unreachable` when ssh itself could not reach the machine (its
 *  own exit 255 — resolve / connect / auth — or no answer within the bound), `ssh-exited-early` when the far side ended
 *  before it read what we fed it. null = no failure, or not the road's (the remote command's own exit: the caller's words). */
function sshRefusal(h, err, stderr, fed) {
  if (!err) return null; // the child succeeded: whatever the pipe said, the answer stands
  const line = String(stderr || '').trim().split('\n').filter(Boolean).pop() || '';
  // lane lg-remote-hardening: a key ssh would not trust is no unreachable machine — judged on ssh's OWN exit (255) only, never
  // a remote program's stderr (a dotfiles `git pull` printing «Host key verification failed» on the far side)
  const hk = err && err.code === 255 ? HK.hostKeyRefusal(h, stderr) : null;
  if (hk) return hk;
  if (err && (err.code === 255 || err.killed)) return unreachableError(h, line || (err.killed ? 'no answer in time' : ''));
  if (!(fed && fed.error && STDIN_GONE.has(fed.error.code))) return null;
  const name = (h && (h.name || h.id)) || 'the machine';
  return Object.assign(new Error(`${name} ended the connection before it read its input (${fed.error.code})${line ? ' — ' + line : ''}`), { code: 'ssh-exited-early', hostId: (h && h.id) || null, host: name, sshLine: line.slice(0, 300) });
}
/** A route's words for a refusal: `{ unreachable: { host, hostId, line } }` for the path field, else nothing. */
const refusalBody = (e) => (e && e.code === 'host-unreachable' ? { unreachable: { host: e.host || '', hostId: e.hostId || null, line: e.sshLine || '' } } : {});
const REACH_TTL_MS = 60 * 1000;

// lane device-bundle-signing-fix-r2 (verify-r1 RED-3): the ssh road's remote step — ONE sh script, the tar on stdin
// (agentd.js + token [+ agentd.manifest.json]); see HostManager#installAgentd for the rungs. The token always lands
// (the hub's bridge needs it); `current` moves only through a rung that says so — an existing install's own agent
// (`--land-upgrade`, the landBundle verdict) for any build that replaces it.
function installAgentdScript(ver, signed) {
  const V = String(ver).replace(/[^\w.-]/g, '');
  return REMOTE_PRELUDE + 'umask 077; D="$HOME/.vibespace/agentd"; V="' + V + '"; SIGNED=' + (signed ? 1 : 0) + '; S="$D/state/incoming.$$"; '
    + 'mkdir -p "$D/state" "$S" && tar -x -C "$S" && mv -f "$S/token" "$D/state/token" && chmod 600 "$D/state/token" || { rm -rf "$S"; echo "VS-AGENTD-FAILED staging: the tar did not land"; exit 0; }; '
    + 'F=$(basename "$(readlink "$D/current" 2>/dev/null)" 2>/dev/null); '
    + 'if [ -f "$D/current/agentd.js" ] && cmp -s "$S/agentd.js" "$D/current/agentd.js"; then echo "VS-AGENTD-INSTALLED current"; '
    + 'elif [ ! -e "$D/current" ]; then mkdir -p "$D/$V" && mv -f "$S/agentd.js" "$D/$V/agentd.js" && ln -sfn "$D/$V" "$D/current" && echo "VS-AGENTD-INSTALLED fresh"; '
    + 'elif [ "$SIGNED" != 1 ]; then echo "VS-AGENTD-REFUSED unsigned-local-build from=$F: this VibeSpace\'s agent build is not the signed release"; '
    + 'elif grep -qF -e --land-upgrade "$D/current/agentd.js" 2>/dev/null; then node "$D/current/agentd.js" --land-upgrade "$S/agentd.js" --version "$V" --manifest "$S/agentd.manifest.json"; '
    + 'else mkdir -p "$D/$V" && mv -f "$S/agentd.js" "$D/$V/agentd.js" && ln -sfn "$D/$V" "$D/current" && echo "VS-AGENTD-INSTALLED legacy"; fi; '
    + 'rm -rf "$S"';
}
/** The remote step's one line → { landed } | { landed: 'verified', from, tofu } | { refused, from, floor, keyId, why } |
 *  { failed } | null (anything else — the caller's "unexpected response"). */
function installAgentdAnswer(out) {
  const t = String(out || ''); let m;
  if ((m = /VS-AGENTD-INSTALLED (current|fresh|legacy)/.exec(t))) return { landed: m[1] };
  if ((m = /VS-AGENTD-LANDED (\S+) from=(\S*)(?: tofu=([0-9a-f,]+))?/.exec(t))) return { landed: 'verified', from: m[2] || null, tofu: m[3] ? m[3].split(',').filter((k) => /^[0-9a-f]{16}$/.test(k)).slice(0, 16) : null };
  if ((m = /VS-AGENTD-REFUSED ([a-z-]{1,40}) from=(\S*?)(?: floor=(\S+?))?(?: key=([0-9a-f]{16}))?: ?([^\n]*)/.exec(t))) return { refused: m[1], from: m[2] || null, floor: m[3] || null, keyId: m[4] || null, why: m[5].slice(0, 200) };
  if ((m = /VS-AGENTD-DEFERRED ([a-z-]{1,40}) from=(\S*?): ?([^\n]*)/.exec(t))) return { deferred: m[1], from: m[2] || null, why: m[3].slice(0, 200) };   // B-93e7: the host could not sync the bundle — it keeps its agent; the next connect tries again
  if ((m = /VS-AGENTD-FAILED ([^\n]*)/.exec(t))) return { failed: m[1].slice(0, 200) };
  return null;
}

const RETIRED_MAX = 512, RETIRED_DAYS = 180;   // B-4d71: the unpaired dial tokens' tombstones (noteRetiredDial)
/** lane lg-remote-hardening (主开发 00:36Z small 7): a key refusal's code is a DEVICE's word too (hub-key-*) — bounded before it is
 *  stored: letters, digits, - and _ only, 48 at most; anything else is the generic refusal. */
const codeOf = (c) => { const x = String(c || ''); return /^[A-Za-z0-9_-]{1,48}$/.test(x) ? x : /^hub[-_]/.test(x) ? 'hub-key-mismatch' : 'device-key-mismatch'; }; // 主开发 01:11Z small (5): a hub-side word stays hub-side
// B-0248 unit 4: a cached remote copy's landing waits at most this long (the fetch's own ssh bound is 120 s)
const CACHE_LAND_MS = 120000;

class HostManager {
  constructor({ dataDir }) {
    this._seatFp = new Map(); // lane lg-remote-hardening (主开发 00:36Z small 2): `${id}|${road}|${code}` → the fingerprint that refusal was said with
    this._upgrades = new Map(); // lane lg-remote-hardening (unit 3's cure, at the restack): id → the open upgrade attempt's mark
    this.convIndex = new (require('./conversation-index.js').ConversationIndex)({ dataDir });
    this.dataDir = dataDir;
    // lane device-act-audit: THE hub's record of every act / code op it sends a device (src/device-audit.js —
    // data/device-audit.jsonl); every DeviceManager construction hands its lines here through `noteAct`
    this.deviceAudit = require('./device-audit.js').create({ dataDir, log: (m) => console.warn(m) });
    this._file = path.join(dataDir, 'hosts.json');
    this._sshDir = path.join(dataDir, 'ssh');
    // ControlPath sockets must stay under the ~104-char unix-socket limit —
    // the data dir can be arbitrarily deep (bit on first try: workspace path
    // + cm-<40hex>.<tmpsuffix> overflowed), so masters live in a short
    // per-uid tmp dir instead.
    this._cmDir = path.join(os.tmpdir(), `vs-cm-${process.getuid ? process.getuid() : 'u'}`);
    // B-3767 unit 2 (主开发 11:40Z): the folder is judged before use — sock-path's ensureSocketDir (made 0700; a folder, not a link,
    // this uid's, no group/other bits). A folder another user planted is refused BY NAME, once, with the way out, and ssh runs
    // WITHOUT connection sharing — never a control socket in somebody else's folder (before: a mkdir in a catch, then used)
    const cm = SOCK.ensureSocketDir(this._cmDir);
    this._cmRefused = cm.ok ? null : `${this._cmDir}: ${cm.why}`;
    if (this._cmRefused) console.warn(`[hosts] ssh connection sharing is off — its control folder is refused: ${this._cmRefused} (the way out: start the hub again with TMPDIR set to a private folder — or have the folder's owner remove it (in a shared, sticky temp folder only its owner or root can); sharing comes back by itself once the folder is gone)`);
    this._state = { hosts: [] };
    this._discoveryCache = new Map(); // hostId -> {at, sessions}
    // LAST-KNOWN discovery results, persisted across restarts (2.124.0): the
    // sidebar shows remote sessions immediately after a reload / while a host
    // is unreachable, marked stale, instead of an empty zone.
    this._discFile = path.join(dataDir, 'remote-sessions-cache.json');
    this._persistedDisc = {};
    try { this._persistedDisc = JSON.parse(fs.readFileSync(this._discFile, 'utf-8')) || {}; } catch { }
    this._load();
    try { this._copies().refresh().catch(() => { }); } catch { }   // B-f276 family unit 2 commit 3: the kept copies read off the loop at the start
  }

  /** B-574d (lane nl-paired, 主开发 r4752): the last-known lists go through THE STORE WRITER — a write at a cadence (after every
   *  discovery result) never on the hub's loop, its bytes made AT the write (the latest lists: a burst is one write, as the 2 s
   *  timer's was), written whole and SYNCED before the rename on the writer's thread. Before: writeFileSync + renameSync on the
   *  main thread 2 s after each result, its temp never synced — after a power loss the file could come back empty and an
   *  unreachable machine's last sessions were gone from the sidebar until it answered; a failure was swallowed. Paced, not
   *  durable: a cache (a SIGKILL loses at most its last paced change; a stop's exit flush writes it). Its ONE reader is the
   *  constructor above, at the next start; a failed write is the writer's to say (and it retries). */
  _persistDiscovery(id, sessions) {
    this._persistedDisc[id] = { at: Date.now(), sessions };
    const W = this._storeWriter || require('./store-writer.js').storeWriter();
    W.dirty(this._discFile, { name: 'remote-sessions-cache.write', debounceMs: 2000, produce: () => JSON.stringify(this._persistedDisc) });
  }

  /** Drop the in-memory discovery cache for a host so the NEXT sidebar poll
   *  re-probes immediately — called after remote create/kill/exit so the list
   *  doesn't stay wrong for the cache TTL (state-sync pass, 2.124.0). */
  invalidateDiscovery(id) {
    this._discoveryCache.delete(id);
    // …and TELL THE CLIENTS (2.309.0, real report: terminate a remote chat and
    // the Recent zone kept showing it live until a manual ⟳). The client's
    // per-host list has no TTL — it is loaded on demand and kept — so dropping
    // only the SERVER cache made the staleness invisible-but-permanent. The
    // notification hangs off the one invalidation entry point rather than each
    // of the ~8 call sites, because "someone remembered one site" is exactly
    // how this bug existed (the /api/kill-pid path had a hand-wired refresh;
    // the ws terminate path did not).
    try { this.onDiscoveryDirty?.(id); } catch { }
  }

  /** Drop the cached DeviceManager for a host (called when a dial device
   *  re-dials with a fresh stream) so hosts.device() rebuilds it. */
  invalidateDevice(id) { try { this._devices?.get(id)?.stop?.(); } catch { } this._devices?.delete(id); }

  /** 主开发 r3115 (2): A REMOVER NEVER REMOVES WHAT A KEPT COPY OF TORN BYTES STILL NAMES: does a kept copy of hosts.json's torn bytes still name machine `id`? (from memory; unknown ⇒ yes) — the
   *  removers by the list's silence ask it first: the transcript caches (sweepJsonlCache), the exit lists (exit-proxy pruneLists),
   *  the desktop-app records (desktop-access: such a machine is «unavailable», never «not a paired machine») */
  namedByCopy(id) {
    // round wxzvih2as's MUST (1): A PERSON's REMOVAL BEATS THE COPIES — a machine the person REMOVED (its id written into hosts.json at the removal, kept across restarts) is never kept by a
    // copy: its exit lists, its cache and its desktop records go as at any removal; pairing it again takes the id off that list
    if (Array.isArray(this._state.removedIds) && this._state.removedIds.includes(String(id))) return false;
    return this._copies().names(String(id));
  }
  /** r3982 (2): did a PERSON remove machine `id` (its id in the removed list this store keeps) — asked by the mounts list before the copies */
  removedByPerson(id) { return Array.isArray(this._state.removedIds) && this._state.removedIds.includes(String(id)); }
  /** a PERSON's removal of machine `id` (remove()) — the newest 200 kept in the store itself; a machine added again leaves the list */
  _noteRemoved(id) { const was = Array.isArray(this._state.removedIds) ? this._state.removedIds : []; this._state.removedIds = [...was.filter((x) => x !== id), String(id)].slice(-200); }
  _noteAdded(id) { if (Array.isArray(this._state.removedIds) && this._state.removedIds.includes(String(id))) this._state.removedIds = this._state.removedIds.filter((x) => x !== String(id)); }
  _copies() { return this.__copies || (this.__copies = HOLD.copiesOf({ file: this._file, prefix: path.basename(this._asideName()).replace(/\d+$/, ''), log: (m) => console.warn(m), omit: ['removedIds'] })); }   // (round wjgchwl6a (7): the removed list is no id)
  /** remainder of B-f276 (bl-jobs, the store-read law over hosts.json — the SOLE holder of every paired machine and every
   *  dialTokenHash since B-f3e8), on the FAMILY HELPER since 2b (src/store-read-hold.js, 主开发 r3648 / r3790): data → loaded ·
   *  missing → empty · torn bytes → HELD while they are copied aside OFF the loop (once a content: a copy of the same bytes is their
   *  copy), then empty · a read that FAILED (EIO, EACCES, a timeout on network storage) → HELD: the machines are not shown, NOTHING is
   *  written over the file (_save asks the hold), a person's change is refused by name, and the file is read again off the loop until
   *  it answers (a read past the helper's bound is said, and its answer used the moment it comes). For the copy's moment a lookup
   *  of a machine refuses by name and a dial-in is held (r3790, decision 1) */
  _load() {
    this._hold = HOLD.create({
      file: this._file, valid: HOSTS_SHAPE, code: 'hosts-unread', aside: (mark) => this._asideName(mark),
      words: (f) => this._heldWords(f), log: (m) => console.warn('[hosts] ' + m),
      onLift: (value, info) => this._lifted(value, info), readMs: () => this._readMs,   // (_readMs: a suite's knob — unset, the helper's own bound)
    });
    let read;
    try { read = { text: fs.readFileSync(this._file, 'utf-8') }; } catch (error) { read = { error }; }
    const a = SR.storeAnswer(read, { valid: HOSTS_SHAPE });
    if (this._hold.start(a) !== 'held') this._loadAnswer(a);   // held: the machines list stays empty until the lift
  }
  /** what the store holds now: the start's answer (data | missing) or a lift's — the ONE writer of the records from the file */
  _loadAnswer(a) {
    this._state = a.state === 'data' ? a.value : { hosts: [] };
    if (!Array.isArray(this._state.hosts)) this._state.hosts = [];
    // lane lg-remote-hardening: every pinned record's file, as its record says (a restored hosts.json, a deleted file)
    for (const h of this._state.hosts) if (HK.pinned(h) || HK.hopPinned(h)) { try { HK.writePinFile(this._sshDir, h); } catch (e) { console.warn(`[hosts] the host-key pin file of ${h.name || h.id} was not written: ${e.message}`); } }
    if (a.state === 'data') this._reachChanged('hosts.json read');   // at boot nothing is wired yet (a no-op); a held store read again mid-life brings machines back — re-judged. Its read r3 (Y2): an EMPTY lift (torn bytes set aside, a gone file) re-judges nothing, as a boot does — a prune over the empty list cleared every machine's exit lists
  }
  /** the hold LIFTED (the helper's onLift): `value` the records READ, or null (torn bytes kept aside as `setAside`, or the file gone —
   *  the list starts empty). What waited for the machines runs now */
  _lifted(value, { setAside = null } = {}) {
    if (setAside) this._tornCopy = setAside;   // the MOVE (part one): the page says the torn lift and where its copy is (this run)
    this._loadAnswer(value ? { state: 'data', value } : { state: 'missing' });
    try { this.onDiscoveryDirty?.(null); } catch { }
    try { this.onReadAgain?.(); } catch { }   // its read r1 (S1): every page's machines list is drawn again (exit-routes wires hosts-updated)
    const waits = this._readWaits ? [...this._readWaits.values()].map((w) => w.fn) : []; this._readWaits = null;   // its read r1 (S5): what waited for the machines runs now
    for (const fn of waits) { try { fn(); } catch (e) { console.warn('[hosts] a wait for the machines failed:', e && e.message); } }
  }
  _asideName(mark = Date.now()) { return this._file + '.corrupt-' + mark; }   // ONE set-aside name: the helper's keep and the copies' prefix (the census counts the names)
  /** the copy of hosts.json's torn bytes this run started empty over (its base name), or null — the page's torn words */
  tornCopy() { return this._tornCopy || null; }
  /** 2b: the hold is the helper's — every guard of this file asks it by its old name: { code, at } while held, else null */
  get _unread() { const f = this._hold ? this._hold.held() : null; return f ? { code: f.code, at: f.since } : null; }
  /** a read again now (the held store's own road — the notice's press reads it through the helper) → true when it lifted */
  readAgain() { return this._hold ? this._hold.again() : Promise.resolve(false); }
  /** the kept copies were read (an unread answer names every id — the page waits for a read before it says «the damaged list may name it») */
  copiesRead() { try { return this._copies().ready(); } catch { return false; } }
  /** part one's words follow (r3792): read, and no copy left out of the look (more copies than it reads: an older one may name an id) */
  copiesWhole() { try { return this._copies().whole(); } catch { return false; } }
  /** read the kept copies if they were never read → a promise settled once the read in flight ends (the mounts list then tells the page) */
  copiesWarm() { try { return this._copies().warm(); } catch { return Promise.resolve(); } }   // ONE set-aside name: the boot's and a read again's (the census counts the names)
  /** the words a person reads while hosts.json is held (the machines list, a refused change) */
  unreadWords() {
    // its read r2 (S5): while a read of it has not answered past its bound, the words say so (no new read starts then) — 2b: the hold's facts
    return this._hold ? this._hold.words() : null;
  }
  /** the held words from the hold's facts (`f`: its code, and `waiting` while a read is past its bound) */
  _heldWords(f) { return `hosts.json in VibeSpace's data folder could not be read (${f.code}); ${f.waiting ? 'a read of it is still waiting for the storage to answer, and its answer is used the moment it comes' : 'VibeSpace reads it again every few minutes'}. No machine is lost: nothing is written over it, and changes to machines wait until it reads.`; }
  _refuseIfUnread(what) {
    if (this._unread) throw this._heldError(what);
  }
  /** run `fn` over the machines as soon as they are KNOWN — now, or once a held hosts.json reads (its read r1, S5: a sweep over
   *  the held, empty list ran over nothing and never again) */
  //  主开发 01:20Z (4): the list of waits has a BOUND and a KEY — a wait given a `key` (a conversation's remote stop) REPLACES the
  //  one waiting under it (asked again, ONE runs at the read), and past READ_WAITS_MAX the oldest is let go, said
  //  主开发 04:33Z (3): a wait let go is NAMED in the line, and its `onLetGo` runs (a remote stop's tells the person: the conversation
  //  they were told «stops as soon as they read» may still be running)
  whenRead(fn, what = 'a sweep over the machines', key = null, { onLetGo = null } = {}) {
    if (!this._unread) return fn();
    const W = this._readWaits = this._readWaits || new Map();
    const k = key == null ? Symbol(what) : String(key), again = W.has(k);
    W.delete(k); W.set(k, { fn, what, onLetGo: typeof onLetGo === 'function' ? onLetGo : null });
    if (W.size > READ_WAITS_MAX) {
      const [[k0, w0]] = W; W.delete(k0);
      console.warn(`[hosts] ${READ_WAITS_MAX} waits for hosts.json to read — the oldest is let go (it will not run at the read): ${w0.what}`);
      if (w0.onLetGo) { try { w0.onLetGo(); } catch (e) { console.warn('[hosts] telling a wait let go failed:', e && e.message); } }
    }
    if (!again) console.warn(`[hosts] ${what} waits for hosts.json to read (${this._unread.code}) — it runs then; a restart before that forgets it`);   // its read r2 (X4): said
  }

  /** B-48a4 (the exit door's cost; the coordinator's word (e), 2026-11-18): EVERY write of hosts.json goes through THE STORE
   *  WRITER — the bytes produced at its write (the latest state in memory; a burst is one write) and written whole on its own
   *  thread (temp + rename), at once (`durable`: its pace set aside, as the old synchronous write was immediate); the main loop
   *  never waits on the data dir for it. Before: writeFileSync + renameSync on the main thread at every save — the run ledger's
   *  throttled one once a minute per machine under exit commands. ONE writer of the file, so a later state always lands last.
   *  A failure is the writer's to say (and it retries); `persisted()` = the file holds the state saved so far (a reader of it). */
  _save() {
    // THE MEETING (B-f276's held store × B-48a4's queued save; 主开发 23:21Z): law 1 — a HELD hosts.json takes no write: this check is
    // the FIRST line, before anything is queued
    if (!this._hold.writable('a hosts.json write')) return false;   // (said once a hold, by the helper)
    const W = this._storeWriter || require('./store-writer.js').storeWriter();
    // law 2 — the bytes are made AT the write (lazily): a write queued before a hold must never land the held, EMPTY list. The
    // producer refuses while held: the writer keeps the write owed and retries it, and once the file reads again it writes the
    // state READ (the file's own machines), never the empty one
    W.dirty(this._file, { name: 'hosts.write', produce: () => { if (this._unread) throw Object.assign(new Error('hosts.json is held (its read failed) — nothing is written over it until it reads'), { code: 'EHELD' }); return JSON.stringify(this._state, null, 2); } });
    W.durable(this._file).catch(() => { });
  }
  persisted() { if (this._unread) return Promise.resolve(false); return (this._storeWriter || require('./store-writer.js').storeWriter()).durable(this._file); }   // law 3 of the meeting with B-f276: a HELD store is never «on disk» (its saves are refused)
  /** B-48a4 cure: why the last save is not on disk yet (the writer's own words: queued behind N writes, or its failure) — null when it is */
  whyNotDurable() { if (this._unread) return { why: 'held', code: this._unread.code }; const W = this._storeWriter || require('./store-writer.js').storeWriter(); return (typeof W.whyNotDurable === 'function' && W.whyNotDurable(this._file)) || null; }

  list() {
    // dial hosts carry a live `online` field (server wires dialOnline to the
    // dialed-in stream registry) — the ONE machine list is the whole roster,
    // there is no separate device API anymore (B-f3e8).
    // lane device-upgrade-stuck: `agentUpgrade` = the agent's failed update (src/server/device-upgrade-watch.js rowOf) —
    // the row's line until the device reports the version
    const up = (h) => { const u = this.agentUpgradeOf?.(h.id); return u ? { agentUpgrade: u } : {}; };
    // lane host-stale-dialer (B-6136): `dialHealth` = a second agent with an old token knocking while the device is in (src/dial-health.js)
    const dh = (h) => { const v = h.deviceId ? this.dialHealthOf?.(h) : null; return v ? { dialHealth: v } : {}; };
    // lane device-node-version: `runtime` = the node its agent runs on, judged against the floor table (src/device-runtime.js)
    const DR = require('./device-runtime.js');
    const out = this._state.hosts.map(h => (h.transport === 'dial'
      ? { ...h, dialTokenHash: undefined, online: !!this.dialOnline?.(h.deviceId), ...up(h), ...dh(h), runtime: DR.runtimeRow(h) }
      // graduated ssh machine (B-6640): expose the upgrade + live-dial state
      // (hash stays redacted like pure-dial records)
      : { ...h, dialTokenHash: undefined, ...(h.deviceId ? { graduated: true, dialLive: !!this.dialOnline?.(h.deviceId) } : {}), ...up(h), ...dh(h), runtime: DR.runtimeRow(h), ...HK.pinView(h) }));
    // the B-f276 remainder's cure (主开发 23:20Z, (a)): a HELD list is empty because it is UNREAD — it carries the hold's words (`held`,
    // not enumerated: the JSON is unchanged); every caller is a row of scripts/test-hosts-held-census.mjs
    if (this._unread) Object.defineProperty(out, 'held', { value: this.unreadWords() });
    return out;
  }

  get(id) {
    // the B-f276 remainder's cure (主开发 23:20Z, (a) ONE reply while held): a HELD store answers a lookup «unknown, by name» —
    // never «not found» (ten callers read the held, empty list as a machine GONE: test-hosts-held-census holds every caller's row)
    if (this._unread) throw this._heldError();
    const h = this._state.hosts.find(x => x.id === id);
    if (!h) throw Object.assign(new Error('host not found'), { code: 'host_not_found' });   // B-2566's remainder (r1730 (1)): a machine the list READ gone is said by a TYPED code (src/mount-error-words.js's own) — a reader matches the code, never the words
    return h;
  }
  /** (a) «is the store held?» — the one question every caller of a lookup asks before reading an absence as «gone» */
  held() { return !!this._unread; }
  _heldError(what) { return Object.assign(new Error(what ? `${what}: ${this.unreadWords()}` : this.unreadWords()), { code: 'hosts-unread', status: 503 }); }

  /** The host record a dialed-in device belongs to (deviceId = wire identity). */
  findByDeviceId(deviceId) {
    // (a) «is it paired?» while HELD answers «unknown, by name» (hosts-unread) — never «not paired» (null read as «unpaired»)
    if (this._unread) throw this._heldError();
    // Pure-dial first (existing behavior), else a GRADUATED ssh record
    // (B-6640: an ssh machine that also dials out carries deviceId +
    // dialTokenHash on its ssh record — dial-in auth and the dial-in hooks
    // must resolve it, or the daemon's dial is rejected as unknown).
    return this._state.hosts.find(h => h.transport === 'dial' && h.deviceId === String(deviceId))
      || this._state.hosts.find(h => h.deviceId === String(deviceId)) || null;
  }

  /** B-6640: mark an ssh machine as dial-graduated — assigns its stable
   *  deviceId (the mint + dial-in key) and records the install root for a
   *  later deterministic removal. transport STAYS 'ssh'/absent: every ssh
   *  path keeps working as the bootstrap + rescue channel; only the live
   *  routing (_deviceConnect) prefers the dialed-in stream. */
  graduateDial(id, { dialRoot } = {}) {
    this._refuseIfUnread('moving a machine');   // remainder of B-f276: a held hosts.json takes no change
    const h = this.get(id);
    if (h.transport === 'dial') throw new Error('already a dial device');
    if (!h.deviceId) {
      h.deviceId = ('grad-' + id).replace(/[^\w-]/g, '').slice(0, 32);
      // lane lg-remote-hardening (unit 3's cure): the dial-out agent runs under its own root with its OWN key — a pin learned
      // over ssh is not its key. From now on the device key is judged on the dial road, which starts with no pin.
      this._dropDeviceKey(h, { setAside: true });
    }
    if (dialRoot) h.dialRoot = String(dialRoot);
    try { require('./agentd/client.js').DeviceManager.dropHelloFolds('host:' + id); } catch {}   // B-0194: its ssh name's hello folds said and dropped (it folds under its device id now)
    this._save();
    return h;
  }

  /** unit 3's cure (its verdict, and 主开发's «as if a must»): a machine that ALREADY dials out is refused BY NAME before an
   *  upgrade runs anything — a re-press (a dialog left open, a second tab) would mint a new pairing over the working one (its
   *  token rotated, its pin dropped, its link ended) and a failure after that mint could restore none of it. The door is the
   *  one the row's words name: Remove dial-out, then Upgrade to dial-out (a new pairing). */
  notDialOut(id) {
    // 主开发 at the restack: WHILE an upgrade of this machine runs (its installer may take minutes), the recipe below would
    // kill the agent and remove its root while the installer writes there — the words for that state are «wait for it»
    if (this.upgradeRunning(id)) throw Object.assign(new Error('an upgrade of this machine is running — wait for it'), { code: 'upgrade-running' });
    if (this.get(id).deviceId) throw Object.assign(new Error('this machine already dials out — Remove dial-out first, then Upgrade to dial-out (that makes a new pairing)'), { code: 'already-dial-out' });
  }

  /** the upgrade to dial-out as ONE attempt of THIS press: graduateDial, and its rollback — the record back to ssh with its own
   *  pin. A machine already dialing out never gets this far (notDialOut). → { rollBack } */
  beginGraduation(id, { dialRoot } = {}) {
    this.notDialOut(id);
    this.graduateDial(id, { dialRoot });
    // THE ATTEMPT'S MARK (主开发 at the restack): a rollback touches the record only while ITS attempt is the open one — never a
    // later upgrade's (an attempt that ended, a Remove and a new press in another tab). In memory: a hub restart ends every attempt.
    const mark = {};
    this._upgrades.set(id, mark);
    const open = () => this._upgrades.get(id) === mark;
    return {
      rollBack: () => { if (!open()) return; this._upgrades.delete(id); this.ungraduateDial(id); },
      finish: () => { if (open()) this._upgrades.delete(id); },
    };
  }
  /** whether an upgrade of this machine is running now (its attempt open): Remove dial-out and a second Upgrade wait for it */
  upgradeRunning(id) { return this._upgrades.has(id); }

  ungraduateDial(id) {
    this._refuseIfUnread('moving a machine back');   // remainder of B-f276: a held hosts.json takes no change
    const h = this.get(id);
    if (!h.deviceId) return h; // nothing dials out (a second Remove from another tab, a rollback after one): the ssh road's own pin and ask are left alone
    try { if (h.deviceId) require('./agentd/client.js').DeviceManager.dropHelloFolds('dev:' + h.deviceId); } catch {}   // B-0194: its device name's hello folds said and dropped
    delete h.deviceId; delete h.dialTokenHash; delete h.dialRoot;
    this._dropDeviceKey(h, { restore: true }); // the dial road's pin goes with it, and the ssh road's own comes back
    this._save();
    return h;
  }

  /** unit 3's cure: a road's device-key state goes when the road's agent changes (a graduation, its removal) — its items too */
  _dropDeviceKey(h, { setAside = false, restore = false } = {}) {
    const had = !!(h.deviceKey || h.deviceKeyRefused || h.deviceKeyForgotAt || h.deviceKeyUnprovenAt);
    const aside = setAside && h.deviceKey ? h.deviceKey : null; // the ssh road's own pin, kept while the machine dials out
    // a Forget asked while the machine dialed out cleared the set-aside ssh pin and left the SSH ROAD's own ask (sshKeyForgot —
    // the dial agent's next proof clears only the dial road's): when dial-out goes, the ssh road still ASKS for a proof, and the
    // key it learns is told (the notice), never pinned in silence
    const asked = restore && h.sshKeyForgot ? h.sshKeyForgot : null;
    // …and a Forget still PENDING on the ssh road when the machine is upgraded (no ssh agent has proved a key since: the upgrade
    // runs raw ssh) is carried into that ssh road's own ask
    // (and a pending «Let in without a key» the same way: 主开发 at the restack — a rollback used to leave no pin, no ask and no mark)
    const pending = setAside && (h.deviceKeyForgotAt || h.deviceKeyUnprovenAt) ? { at: h.deviceKeyForgotAt || null, fp: h.deviceKeyForgotFp || null, unproven: h.deviceKeyUnprovenAt || null } : null;
    if (restore || setAside) delete h.sshKeyForgot;
    if (pending) h.sshKeyForgot = pending;
    delete h.deviceKey; delete h.deviceKeyRefused; delete h.deviceKeyForgotAt; delete h.deviceKeyForgotFp; delete h.deviceKeyUnprovenAt;
    if (aside) h.sshDeviceKey = aside;
    if (restore) { if (h.sshDeviceKey) h.deviceKey = h.sshDeviceKey; delete h.sshDeviceKey; } // a failed install's rollback never pins anew in silence
    if (asked) { if (asked.at) h.deviceKeyForgotAt = asked.at; if (asked.fp) h.deviceKeyForgotFp = asked.fp; if (asked.unproven) h.deviceKeyUnprovenAt = asked.unproven; }
    if (had) { try { this.onHostKeyPinned?.(h, 'device', { notice: true }); } catch { } }
  }

  /** Dial-in hook for GRADUATED hosts (wired from the server's dial-in
   *  branch): the fresh dial stream should win over a cached ssh-transport
   *  DeviceManager — evict it so the next op rebuilds over the dial link.
   *  In-flight ops on the old dm finish undisturbed. */
  onDialIn(deviceId) {
    const h = this.findByDeviceId(deviceId);
    for (const fn of this._dialInHooks || []) { try { fn(h ? h.id : null); } catch { /* a hook never breaks the dial-in */ } }
    if (!h || h.transport === 'dial') return;
    const cached = this._devices?.get(h.id);
    if (cached && !cached._dialStream) this._devices.delete(h.id);
  }

  /** lane machine-desktop-apps: another layer hears every dial-in (the device's daemon said hello on a fresh link) —
   *  `fn(hostId)`; the access layer lists a Windows / macOS machine's installed apps then. → unsubscribe */
  addDialInHook(fn) { if (!this._dialInHooks) this._dialInHooks = new Set(); this._dialInHooks.add(fn); return () => this._dialInHooks.delete(fn); }

  /** Pairing credential lives ON the host record (B-f3e8 — dial-tokens.json
   *  folded in). setDialToken find-or-creates so re-pairing an existing name
   *  rotates the token in place. */
  setDialToken(deviceId, sha256Hash, { name } = {}) {
    this._refuseIfUnread('pairing a device');   // remainder of B-f276: a held hosts.json takes no change
    let h = this.findByDeviceId(deviceId);
    if (!h) { this.add({ name: name || deviceId, transport: 'dial', deviceId }); h = this.findByDeviceId(deviceId); }
    // add() keys by the SANITIZED id — a different raw deviceId that sanitizes
    // to the same id collides and findByDeviceId (raw match) stays null
    if (!h) throw new Error(`device name "${deviceId}" collides with an existing pairing after sanitization — pick another name`);
    // lane lg-remote-hardening (D3): a NEW pairing command is the person re-trusting this machine — the device key its
    // record pinned is forgotten with the old token (the next hello pins the key the paired agent proves)
    if (h.dialTokenHash && h.dialTokenHash !== String(sha256Hash) && (h.deviceKey || h.deviceKeyRefused || h.deviceKeyForgotAt || h.deviceKeyUnprovenAt || h.hubPinned || h.hubPinClearedAt)) { delete h.deviceKey; delete h.deviceKeyRefused; delete h.deviceKeyForgotAt; delete h.deviceKeyForgotFp; delete h.deviceKeyUnprovenAt; delete h.hubPinned; delete h.hubPinClearedAt; try { this.onHostKeyPinned?.(h, 'device', { notice: true }); } catch { } } // the device's hub pin is voided by the new token too
    h.dialTokenHash = String(sha256Hash);
    this._save();
    return h.id;
  }
  dialTokenHash(deviceId) { return this.findByDeviceId(deviceId)?.dialTokenHash || null; }
  /** B-4d71: THE UNPAIRED DIAL TOKENS — a tombstone per unpaired pairing: the name, its DIAL token's hash (what the device dials
   *  with), the hash of its HOST token (the retire proof's key, src/pairing-token.js) and when. A device unpaired while offline dials
   *  again with that exact token and is answered «retired» with the proof (src/server/dial-pairing.js). Several a name (an unpair, a
   *  re-pair, an unpair again: each pairing's device is told); a new pairing drops none (a fresh token never matches one). At most
   *  RETIRED_MAX, the oldest out; past RETIRED_DAYS a tombstone is forgotten. Not carried by exportBundle (a moved hub forgets them).
   *  The proof key (the HOST token's hash) sits here in the clear: what it can do is make the retire proof for a device that is
   *  already unpaired — nothing more (the proof names its purpose and that device; src/pairing-token.js). */
  noteRetiredDial(deviceId, hash, proofKey = null) {
    if (!deviceId || !hash) return;
    const now = Date.now(), keep = (this._state.retiredDials || []).filter((r) => r && now - (Number(r.at) || 0) < RETIRED_DAYS * 864e5);   // (a pairing is unpaired once: its record goes with it)
    keep.push({ deviceId: String(deviceId).slice(0, 64), hash: String(hash), ...(proofKey ? { proofKey: String(proofKey) } : {}), at: now });
    this._state.retiredDials = keep.slice(-RETIRED_MAX);
    this._save();
  }
  /** the tombstone of `deviceId` whose dial token `token` is (`matches(token, hash)`: the constant-time compare), or null */
  retiredDialFor(deviceId, token, matches) {
    const now = Date.now();
    return (this._state.retiredDials || []).find((x) => x && x.deviceId === deviceId && now - (Number(x.at) || 0) < RETIRED_DAYS * 864e5 && matches(token, x.hash)) || null;
  }

  /** THE store's door for a one-shot reshaping (src/server/migrations.js): `fn(state)` mutates the in-memory
   *  `{hosts: […]}` and returns a report; ONE atomic save follows. The migration goes through the LIVE manager
   *  because it holds hosts.json in memory and saves it whole — a second writer beside it would be overwritten. */
  reshapeStore(fn) {
    this._refuseIfUnread('reshaping the machines store');   // remainder of B-f276: a held hosts.json takes no change
    const rep = fn(this._state);
    this._save();
    this._reachChanged('reshape');
    // B-48a4 cure: a migration's reshape is ON DISK before its ledger says done (a boot-time kill leaves no unmigrated file under a
    // stamped ledger) — by the flush's OWN answer (the census of the class, 2.369.412): a file it LEFT (the storage held the writer
    // past its bound, or the write failed) THROWS, so the runner counts the migration failed and runs it again at the next boot
    // (each reshape through here is idempotent); the queued write still lands when the writer can
    if (!this._flushLanded()) throw new Error('data/hosts.json is not on disk yet (the store writer has not written it: held by the storage past its bound, a failed write, or the hub is exiting) — the migration runs again at the next boot');
    return rep;
  }
  /** B-48a4 cure: hosts.json written NOW (the named flush) → true only when the writer's own answer says nothing of it is left
   *  owed (never «not failed»: a write still queued or held is not on disk either) */
  _flushLanded() { if (this._unread) return false; const r = this.flushThrottled(); return !!r && !r.deferred && !(r.left || []).some((x) => x && x.file === this._file) && !this.whyNotDurable(); }   // its read (N1): another store's held write is not this file's

  /**
   * A WRITE THAT CAN WITHDRAW REACH TELLS THE ONE RE-JUDGE (verify-r3 A-r3a). A machine's `exit` lists live on its
   * record, and more than the "Who can use it" PATCH rewrites a record: Settings → Import config REPLACES every
   * record (`importBundle` — a narrower list, or the machine gone), `remove` deletes one, a migration reshapes the
   * store. Only the PATCH re-judged, so after an import that took a conversation off a machine its OPEN connection
   * through the machine kept carrying bytes and its "ask me each time" request kept waiting (reproduced with the real
   * HostManager + ExitProxyManager: scratch/r3-repro-a.mjs E1/E2). Every such writer calls this after its save;
   * server.js points `onReachChange` at `exitProxy.rejudgeAll` (a writer before the exit manager exists — the boot
   * migration — is a no-op: nothing is lent yet). Never throws.
   */
  _reachChanged(why) { try { this.onReachChange?.(why); } catch (e) { console.warn('[hosts] reach re-judge failed:', e && e.message); } }

  /** EXIT ACCESS (lane-pairing ⑥; lane grants-unify): the machine's two LISTS live in the ONE grants store now
   *  (src/server/grants-store.js, written by the exit manager); the record keeps what is not a list — `ask`, the hub
   *  list, the stamp (PURE src/exit-reach.js `storedExit`) — MERGED into `exit`, so `lastRun` and the pre-unify
   *  `use` / `run` (on disk one more release, unread) stay as they are. */
  setExitAccess(id, exit) {
    this._refuseIfUnread("changing a machine's exit access");   // remainder of B-f276: a held hosts.json takes no change
    const h = this.get(id);
    const was = h.exit && typeof h.exit === 'object' && !Array.isArray(h.exit) ? h.exit : {};
    const keep = {};
    for (const k of ['lastRun', 'use', 'run']) if (was[k] !== undefined) keep[k] = was[k];   // the run ledger + the pre-unify lists (unread)
    h.exit = { ...keep, ...exit };
    this._save();
    this._reachChanged('exit-access');
    return h;
  }
  /** The row's "last run" — throttled like the dial facts (one write per machine per 60 s; a crash loses ≤ 60 s of
   *  last-run stamps, never a grant). A record from before the migration is lifted through the ONE PURE rule. */
  setLastRun(id, rec) {
    const h = this.get(id);
    if (!h.exit || typeof h.exit !== 'object' || Array.isArray(h.exit)) h.exit = {};   // lane grants-unify: never a list here (the grants store holds them)
    h.exit.lastRun = rec;
    this._saveThrottled('exit:' + id);
    return h;
  }

  /** ONE save per `key` per 60 s (the dial facts + the run ledger are OBSERVATIONS: a refused daemon retries every
   *  30 s and each retry must not rewrite hosts.json). A skipped save is not lost — a timer writes it at the end of
   *  the window (unref'd: it never holds the process open); an urgent write clears the window. */
  _saveThrottled(key, { windowMs = 60000 } = {}) {
    this._throttle = this._throttle || new Map();
    const t = this._throttle.get(key) || { at: 0, timer: null };
    const now = Date.now();
    if (now - t.at >= windowMs && !t.timer) { t.at = now; this._throttle.set(key, t); try { this._save(); } catch (e) { console.warn('[hosts] save failed:', e.message); } return true; }
    if (!t.timer) {
      t.timer = setTimeout(() => { t.timer = null; t.at = Date.now(); try { this._save(); } catch (e) { console.warn('[hosts] save failed:', e.message); } }, Math.max(1000, windowMs - (now - t.at)));
      t.timer.unref?.();
    }
    this._throttle.set(key, t);
    return false;
  }
  /** Flush every pending throttled write now (SIGTERM / a suite). → the writer's flush answer ({written, left, deferred}) or null */
  flushThrottled() {
    let pending = false;
    for (const t of (this._throttle || new Map()).values()) if (t.timer) { clearTimeout(t.timer); t.timer = null; pending = true; }
    if (pending) this._save();
    // B-48a4: what the store writer still owes of hosts.json is written NOW (its own bounded synchronous flush — a suite's read of
    // the file, the stop; during the exit the writer's exit flush writes it once)
    try { return (this._storeWriter || require('./store-writer.js').storeWriter()).flushSync([this._file], { waitedBy: 'hosts.flushThrottled' }) || null; } catch { return null; }
  }

  /**
   * THE DIAL FACTS (lane-pairing ③, §4.5): what the server observed of a device's dials, on its host record under
   * `dial` — `{generation, tokenMintedAt, mintedHost, mintedBase, lastProbeAt, firstConnectAt, lastConnectAt, lastDisconnectAt,
   * lastRefusal, lastAccept, lastAuthFail, lastDuplicate, lastGreetingRefused}`. `event` ∈ minted | refused | accepted | disconnected | authFail | greetingRefused |
   * probed | duplicate (verify-r1 B9: a second daemon refused as a copy of this pairing — `{at, from, boot}`, persisted at
   * once when the row's 10-min note is not already on, else throttled — verify-r2: r1 wrote at once for every NEW boot
   * id, so a copy sending a fresh id per knock wrote hosts.json per knock; the row carries it for 10 min).
   * In memory at once; persisted NOW on minted / accepted / a refusal whose CODE changed / the first auth failure,
   * else throttled (a refused daemon retries every 30 s — the code and its first instant are the facts that
   * matter). → `{changed}` = the row's state (PURE dialRowState) moved, so the caller broadcasts; null when no
   * record answers to the device id (an unpaired name — nothing to note).
   */
  /** lane device-act-audit: one audit line of a device client (src/agentd/client.js `onAct`) → data/device-audit.jsonl,
   *  bound to the machine it was sent to (its CURRENT name; `local` = this machine's own daemon). Never throws. */
  noteAct(hostId, line) {
    let machine = hostId === 'local' ? 'this machine' : hostId;
    try { const h = hostId === 'local' ? null : this.get(hostId); if (h) machine = h.name || h.id; } catch { /* a removed row: its id */ }
    try { return this.deviceAudit.append({ ...line, hostId: String(hostId), machine }); } catch { return null; }
  }
  /** lane device-allow-flags: the allow list a machine's agent STATES (every hello-ack — src/device-policy.js reportOf) kept on
   *  its record as `devicePolicy` (the Machines card shows it, offline too). Persisted only when it moved. → true = moved. */
  notePolicy(hostId, policy) {
    const DPx = require('./device-policy.js');
    const p = DPx.reportOf(policy);
    let h = null; try { h = this.get(hostId); } catch { return false; }
    if (!h || !p) return false;
    const was = h.devicePolicy ? JSON.stringify([h.devicePolicy.allow, h.devicePolicy.source, h.devicePolicy.at]) : '';
    if (was === JSON.stringify([p.allow, p.source, p.at])) return false;
    h.devicePolicy = p;
    try { this._save(); } catch (e) { console.warn('[hosts] save failed:', e.message); }
    return true;
  }
  /** lane win-input-elevated: whether a machine's device agent STATES it runs elevated (every hello-ack `elevated`) — kept on
   *  its record as `deviceElevated` (the Machines card shows the badge / the Run-as-administrator door, offline too). → true = moved. */
  noteElevated(hostId, elevated) {
    const e = elevated === true;
    let h = null; try { h = this.get(hostId); } catch { return false; }
    if (!h) return false;
    if ((h.deviceElevated === true) === e) return false; // absent / false both read as not-elevated ⇒ the card is unchanged, no repaint (a first hello of `false` must not broadcast)
    h.deviceElevated = e;
    try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
    return true;
  }
  /** lane device-node-version: the node a machine's device agent STATES it runs on (every hello-ack — src/device-runtime.js
   *  runtimeOf: `{node, openssl, own, platform}`) kept on its record as `deviceRuntime` with the instant it was first said;
   *  the row's `runtime` judges it (runtimeRow — the floor table), offline too. Persisted only when it moved. → true = moved. */
  /** lane lg-remote-hardening (B-7f0b — q-042 D3): THE DEVICE KEY of a machine's record. `learned` (the first proof its
   *  token admitted) ⇒ pinned (`deviceKey` {pub, fp, at}); `refused` (another key, a bad signature, no proof) ⇒ the row's
   *  `deviceKeyRefused` {code, fp, at} and the For-you watch — the Machines card says it with its door (pair again /
   *  forget the key). → true when the record moved. */
  noteDeviceKey(hostId, event, facts = {}) {
    let h = null; try { h = this.get(hostId); } catch { return false; }
    if (!h) return false;
    if (event === 'learned') {
      if (typeof facts.pub !== 'string' || (h.deviceKey && h.deviceKey.pub === facts.pub)) return false;
      const afterForget = !!(h.deviceKeyForgotAt || h.deviceKeyUnprovenAt) && !(h.deviceKeyForgotFp && facts.fp && h.deviceKeyForgotFp === facts.fp); // the SAME key again is nothing new
      h.deviceKey = { pub: facts.pub, fp: facts.fp || null, at: Date.now() }; delete h.deviceKeyRefused; delete h.deviceKeyForgotAt; delete h.deviceKeyForgotFp; delete h.deviceKeyUnprovenAt;
      try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
      console.log(`[hosts] ${h.name || h.id}: its device key is pinned (${facts.fp || '?'}) — from now on only that key is this machine`);
      if (afterForget) { try { this.onDeviceKeyLearned?.(h, { fp: facts.fp || null }); } catch { } } // unit 3's cure: the person is told WHICH key the open pin took
      return true;
    }
    if (event === 'proved') { // unit 3's cure: the pinned key proved again — the row's refusal (and its item) end
      const rr = h.deviceKeyRefused;
      if (!rr || (rr.road && facts.road && rr.road !== facts.road)) return false; // ONE road's proof never clears the other road's refusal
      delete h.deviceKeyRefused;
      try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
      try { this.onHostKeyPinned?.(h, 'device'); } catch { }
      return true;
    }
    // a link that OPENED: an earlier refusal (either side's key) is resolved — the card's chip and its For-you item go
    if (event === 'linked') {
      const rl = h.deviceKeyRefused; // unit 5's cure 2: a link that opened on ONE road never clears the other road's refusal
      if (!rl || (rl.road && facts.road && rl.road !== facts.road)) return false;
      delete h.deviceKeyRefused;
      try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
      try { this.onHostKeyPinned?.(h, 'device'); } catch { }
      return true;
    }
    // must B (主开发's verdict of 2026-11-18): the person let an ssh machine pin this hub's key again — its pin and a hub-side
    // refusal go (the For-you item with them); the next hello pins the current key
    if (event === 'hub-pin-cleared') {
      const hubSide = h.deviceKeyRefused && /^hub[-_]/.test(h.deviceKeyRefused.code || '');
      if (!h.hubPinned && !hubSide) return false;
      delete h.hubPinned; if (hubSide) delete h.deviceKeyRefused; h.hubPinClearedAt = Date.now(); // 主开发 00:36Z small (1): the act's time, for a put-back to be judged against
      try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
      try { this.onHostKeyPinned?.(h, 'device'); } catch { }
      return true;
    }
    // D3 half b: the device pins THIS hub's key (the signed ok pinned it) — kept (a hub that loses its identity must then say so, never re-mint)
    if (event === 'hub-pinned') {
      if (h.hubPinned) return false;
      h.hubPinned = Date.now();
      try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
      return true;
    }
    if (event === 'refused' || (event === 'refused-again' && facts.code)) facts = { ...facts, code: codeOf(facts.code) }; // 主开发 00:36Z small (7): a device's word, bounded
    if (event === 'refused') {
      if (facts.road && facts.code) this._seatFp.set(`${h.id}|${facts.road}|${facts.code}`, facts.fp || null); // small (2): the fingerprint a put-back of this code carries
      const same = h.deviceKeyRefused && h.deviceKeyRefused.code === facts.code && h.deviceKeyRefused.fp === (facts.fp || null) && (h.deviceKeyRefused.road || null) === (facts.road || null); // one episode per road
      // the read's must 1: the dial row shows a refusal only when it is NEWER than the last connect — every dial-in moves that
      // connect, and its hello is refused the same way again, so a repeat on a NEW connect moves the refusal's time past it (at
      // most one write per connect: a refused stream stays dialed in), or the row read «connected» again after a restart / a wake
      const lca = Number(h.dial && h.dial.lastConnectAt) || 0, at = Math.max(Date.now(), lca + 1);
      const again = same && !(Number(h.deviceKeyRefused.at) > lca);
      if (!same) h.deviceKeyRefused = { code: String(facts.code || 'device-key-mismatch'), fp: facts.fp || null, at, ...(facts.road ? { road: String(facts.road) } : {}) };
      else if (again) h.deviceKeyRefused.at = at;
      if (!same || again) { try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); } }
      try { this.onHostKeyRefused?.(h, { kind: 'device', code: facts.code, fp: facts.fp || null, pinned: !!h.deviceKey, road: facts.road || null }); } catch { }
      return !same || again;
    }
    // the read's must 1 (the seat): a refused copy that takes the seat back after a newcomer's connect says its refusal AGAIN —
    // the stored one, on its road, its time moved past that connect (dial-pairing reseat); nothing stored on that road ⇒ nothing
    if (event === 'refused-again') {
      const kr = h.deviceKeyRefused, lca = Number(h.dial && h.dial.lastConnectAt) || 0, code = String(facts.code || '');
      // the second read: the seat's OWN refusal — a newcomer refused another way overwrote the record: it is put back to the seat's
      // code (the fingerprint is not known here). The third read: a record that is GONE is never rebuilt — a person's act cleared it
      // (Forget, Let in without a key, Let it pin this hub's key, a new hub key) and the seat's kept refusal predates that act
      // 主开发 00:36Z small (1): never a refusal OLDER than a person's act on this machine (Forget, Let in without a key, Let it pin
      // this hub's key) — inside one probation the seat's kept refusal can predate it; small (2): the seat's own fingerprint, so the
      // For-you watch meets the same episode and files nothing again
      const actAt = Math.max(Number(h.deviceKeyForgotAt) || 0, Number(h.deviceKeyUnprovenAt) || 0, Number(h.hubPinClearedAt) || 0);
      if (code && kr && (kr.road || null) === (facts.road || null) && kr.code !== code && !(Number(facts.at) && Number(facts.at) < actAt)) { const fp = this._seatFp.get(`${h.id}|${facts.road || ''}|${code}`) || null; h.deviceKeyRefused = { code, fp, at: Math.max(Date.now(), lca + 1), ...(facts.road ? { road: String(facts.road) } : {}) }; try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); } try { this.onHostKeyRefused?.(h, { kind: 'device', code, fp, pinned: !!h.deviceKey, road: facts.road || null }); } catch { } return true; } // the third read: the item names the seat's code
      if (!kr || (kr.road || null) !== (facts.road || null) || Number(kr.at) > lca) return false;
      kr.at = Math.max(Date.now(), lca + 1);
      try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
      return true;
    }
    return false;
  }
  /** The person forgets a machine's device key (its card's door): the next hello pins the key its agent proves. Unit 3's
   *  cure: the live link is dropped NOW (the next hello is the one judged), the record then ASKS for a proof (an answer that
   *  proves nothing is refused, device-key-missing), and the key the next proof pins is told to the person (For you). */
  forgetDeviceKey(hostId, { unproven = false } = {}) {
    const h = this.get(hostId);
    if (unproven) {
      // «Let in without a key» — its OWN request, never a second Forget: only while the record asks for a proof and holds no
      // key (an agent that cannot prove one: an empty or unreadable key file, an agent older than the key). The refusal it
      // was held by ends, and a key it proves later is told (the notice), as after a Forget
      if (h.deviceKey || !h.deviceKeyForgotAt) throw Object.assign(new Error('nothing to let in: this machine\'s record does not ask its agent for a proof'), { code: 'device-key-not-asked' });
      delete h.deviceKeyForgotAt; h.deviceKeyUnprovenAt = Date.now(); delete h.deviceKeyRefused;
      this._save();
      try { this.onHostKeyPinned?.(h, 'device'); } catch { }
      return { deviceKey: null, unproven: true };
    }
    // a key pinned ⇒ the record ASKS for a proof from now on. With none pinned there is nothing to forget: refused by name, so
    // a stale dialog never clears a refusal nor flips a mark
    if (!h.deviceKey) throw Object.assign(new Error('no device key is pinned for this machine — nothing to forget'), { code: 'device-key-none' });
    h.deviceKeyForgotAt = Date.now(); h.deviceKeyForgotFp = h.deviceKey.fp || null;
    if (h.transport !== 'dial' && h.deviceId && h.sshDeviceKey) h.sshKeyForgot = { at: h.deviceKeyForgotAt, fp: (h.sshDeviceKey && h.sshDeviceKey.fp) || null }; // the ssh road's own ask, kept until dial-out goes (the dial agent's next proof clears only the dial road's)
    delete h.deviceKey; delete h.deviceKeyRefused; delete h.sshDeviceKey; // the person re-trusts the machine: the ssh road's set-aside pin goes too
    this._save();
    try { this.onHostKeyPinned?.(h, 'device', { notice: true }); } catch { }
    try { this.invalidateDevice(hostId); } catch { } // the next use greets the device again and pins the key it proves
    return { deviceKey: null };
  }
  noteRuntime(hostId, rt) {
    const DR = require('./device-runtime.js');
    const r = DR.runtimeOf(rt);
    let h = null; try { h = this.get(hostId); } catch { return false; }
    if (!h) return false;
    const key = (x) => JSON.stringify([x.node, x.openssl, x.own, x.platform]);
    if (h.deviceRuntime && key(DR.runtimeOf(h.deviceRuntime)) === key(r)) return false;
    h.deviceRuntime = { ...r, at: Date.now() };
    try { this._save(); } catch (err) { console.warn('[hosts] save failed:', err.message); }
    return true;
  }
  /** lane hub-act-ask: THE ASK's door of a REMOTE machine's device client (src/agentd/client.js `actGate`) — the asker
   *  server.js puts on `hubActs` (src/server/hub-act-ask.js); none wired (a suite, a tool) ⇒ every act goes (the audit still
   *  names who asked). `hostIdOf` = the row's id, or a function (a dial device's row is looked up at the act). */
  actGateFor(hostIdOf) {
    const id = () => (typeof hostIdOf === 'function' ? hostIdOf() : hostIdOf);
    return {
      check: (payload, o) => (this.hubActs ? this.hubActs.check(id(), payload, o) : Promise.resolve(null)),
      verdict: (payload, o) => (this.hubActs ? this.hubActs.verdict(id(), payload, o) : { verdict: 'allow', reason: 'unwired' }),
    };
  }
  noteDial(deviceId, event, facts = {}) {
    const h = this.findByDeviceId(deviceId);
    if (!h) return null;
    const DF = require('./dial-facts.js');
    const rowOf = () => DF.dialRowState({ ...h, online: h.transport === 'dial' ? !!this.dialOnline?.(h.deviceId) : false, dialLive: !!this.dialOnline?.(h.deviceId) });
    const before = rowOf();
    const d = h.dial && typeof h.dial === 'object' ? h.dial : (h.dial = {});
    const at = Number(facts.at) || Date.now();
    // verify-r4 F1 (+F7 the device's OS): `dialed` = the device's own address (the sheet's default), `host` = the Host header
    // as received (a relay's). verify-r5 C2: the device's STATEMENTS (`dialed`, `platform`) are kept only for a dial that
    // PROVED it holds the pairing (`own` — accepted); a refusal is anyone who knows the name (no token): its statements
    // are nobody's facts and never land on the device's record (the row used to name a stranger's `dialed` first)
    const hint = (own = true) => ({ from: String(facts.from || '').slice(0, 64), attempt: Number(facts.attempt) || 0, last: facts.last && facts.last.code ? { code: String(facts.last.code).slice(0, 40), at: Number(facts.last.at) || null } : null, daemon: facts.daemon ? String(facts.daemon).slice(0, 40) : null, host: String(facts.host || '').slice(0, 120), dialed: (() => { const v = own && facts.dialed ? DF.dialBaseVerdict(facts.dialed) : null; return v && v.ok ? v.base.slice(0, DF.DIAL_BASE_MAX) : null; })(), platform: own && DF.DAEMON_PLATFORMS.includes(facts.platform) ? facts.platform : null });
    let urgent = false;
    if (event === 'minted') {
      d.generation = (Number(d.generation) || 0) + 1; d.tokenMintedAt = at; delete d.lastRefusal;
      if (facts.host) d.mintedHost = String(facts.host).slice(0, 120);
      // naive-user N-sheet: the BASE the command was made for (the pairing sheet checks it again — it used to check the
      // browser's origin); a mint without one drops a stale one (base + host always describe the same command)
      const vb = facts.base ? DF.dialBaseVerdict(facts.base) : null;
      if (vb && vb.ok) d.mintedBase = vb.base.slice(0, 200); else delete d.mintedBase;
      urgent = true;
    } else if (event === 'refused') {
      const prev = d.lastRefusal && d.lastRefusal.code;
      // lane host-stale-dialer: `since` = when this run of refusals began (the same code, no gap past 10 min) — the row says it
      const run = prev && prev === String(facts.code || 'token-mismatch') && at - (Number(d.lastRefusal.at) || 0) <= 10 * 60 * 1000 ? (Number(d.lastRefusal.since) || Number(d.lastRefusal.at) || at) : at;
      d.lastRefusal = { code: String(facts.code || 'token-mismatch').slice(0, 40), at, since: run, ...hint(false) }; // verify-r5 C2: no token ⇒ no statement kept
      urgent = prev !== d.lastRefusal.code;
    } else if (event === 'accepted') {
      // lane device-act-audit (design q-042 D10): the addresses this device has dialed in FROM (keyed: IPv4 / an IPv6 /64 —
      // src/device-acts.js addressKeyOf); a first dial from one not in the set is an URGENT For-you item (the hub's
      // onDeviceAlert door — src/server/device-alerts.js). The set is seeded with the address of the last accepted dial
      // before this lane, so an existing device is not news at the first restart; a relay / ingress (loopback) is never news.
      const DAx = require('./device-acts.js');
      const from = String(facts.from || '');
      const key = DAx.isLoopbackAddr(from) ? null : DAx.addressKeyOf(from);
      if (!Array.isArray(d.knownFrom)) {
        const seed = d.lastAccept && d.lastAccept.from && !DAx.isLoopbackAddr(d.lastAccept.from) ? DAx.addressKeyOf(d.lastAccept.from) : null;
        d.knownFrom = seed ? [seed] : [];
      }
      if (key && !d.knownFrom.includes(key)) {
        d.knownFrom = [...d.knownFrom, key].slice(-16);
        try { this.onDeviceAlert?.('new-address', { hostKey: h.id, machine: h.name || h.id, deviceId, address: from.slice(0, 64), addressKey: key, at, first: !d.firstConnectAt }); } catch (e) { console.warn('[hosts] new-address alert not filed:', e.message); }
      }
      d.lastAccept = { at, ...hint() };
      // THE LAW (主开发 2026-11-20, list line 144's cure): between a connect and a refusal of the same machine, the row reads THE ORDER
      // THE HUB RECORDED THEM, never the luck of the clock. A refusal recorded after a connect reads after it; a connect recorded
      // after a refusal reads after it — a tie of the clock and a clock that stepped back, both directions. So a connect's stamp is
      // never before a refusal stamp it was recorded after (a tie reads connected: the row's compare is strict), and a refusal's is
      // never at or before the connect it was recorded after (below, and noteDeviceKey's dial road)
      const kr0 = h.deviceKeyRefused && typeof h.deviceKeyRefused === 'object' && (!h.deviceKeyRefused.road || h.deviceKeyRefused.road === 'dial') ? h.deviceKeyRefused : null;
      // …and above the connect before it (the reader's M1): a connect's stamp is the link's identity (the keep box's liveSince /
      // keepSince), so two connects never share one, even while a refusal's stamp stands above a clock that stepped back
      d.lastConnectAt = Math.max(at, Number(d.lastAuthFail && d.lastAuthFail.at) || 0, Number(d.lastGreetingRefused && d.lastGreetingRefused.at) || 0, Number(kr0 && kr0.at) || 0, (Number(d.lastConnectAt) || 0) + 1); if (!d.firstConnectAt) d.firstConnectAt = at;
      urgent = true;
    } else if (event === 'disconnected') {
      d.lastDisconnectAt = at;
    } else if (event === 'authFail') {
      urgent = !(d.lastAuthFail && Number(d.lastAuthFail.at) > (Number(d.lastConnectAt) || 0));
      d.lastAuthFail = { at: Math.max(at, (Number(d.lastConnectAt) || 0) + 1) };   // THE LAW above: recorded after the connect, it reads after it
    } else if (event === 'greetingRefused') { // unit 4's cure: the row says «greeting refused» (its door: update / reinstall the agent)
      urgent = !(d.lastGreetingRefused && Number(d.lastGreetingRefused.at) > (Number(d.lastConnectAt) || 0));
      d.lastGreetingRefused = { at: Math.max(at, (Number(d.lastConnectAt) || 0) + 1) };   // THE LAW above: recorded after the connect, it reads after it
    } else if (event === 'probed') {
      d.lastProbeAt = at;
    } else if (event === 'duplicate') {
      // verify-r2: urgent only when the row's 10-min note is not already on — a token-holder sending a fresh boot id
      // per knock wrote hosts.json per knock (r1: urgent on every NEW boot); the note's instant is all the row reads
      const prevAt = Number(d.lastDuplicate && d.lastDuplicate.at) || 0;
      d.lastDuplicate = { at, from: String(facts.from || '').slice(0, 64), boot: facts.boot ? String(facts.boot).slice(0, 32) : null, daemon: facts.daemon ? String(facts.daemon).slice(0, 40) : null };
      urgent = at - prevAt > DF.DUP_NOTE_MS;
    } else return null;
    if (urgent) { try { this._save(); } catch (e) { console.warn('[hosts] save failed:', e.message); } } else this._saveThrottled('dial:' + h.id);
    const after = rowOf();
    return { changed: before.state !== after.state || before.reason !== after.reason || !!before.dup !== !!after.dup, row: after };
  }

  /** B-f3e8 one-time migration: the legacy dial-tokens.json (deviceId →
   *  sha256) folds into the dial host records. MUST be lossless — devices in
   *  the field hold the raw tokens; a lost hash locks every daemon out
   *  permanently. The legacy file is renamed only AFTER every entry landed
   *  in hosts.json (a crash mid-way just re-runs it). */
  migrateDialTokenFile(file) {
    if (!fs.existsSync(file)) return false;
    // 主开发 01:20Z (6): a HELD hosts.json — the migration WAITS for the read and its boot line says so (it was «failed»: its first
    // lookup threw the hold); the legacy file stays where it is until then
    if (this._unread) { this.whenRead(() => { this._migrateDialTokensAtRead(file); }, `the dial-token migration (${path.basename(file)} into hosts.json)`, 'migrate:dial-tokens'); return false; }   // 主开发 04:33Z (4): at the read, off the loop
    const all = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const [devId, hash] of Object.entries(all)) {
      if (hash && !this.dialTokenHash(devId)) this.setDialToken(devId, hash);
    }
    const ok = Object.entries(all).every(([devId, hash]) => !hash || this.dialTokenHash(devId));
    if (!ok) { console.warn('[hosts] dial-token migration incomplete — legacy file kept'); return false; }
    // B-48a4 (its law, a checkpoint's red: test-machine-migrate): every save of hosts.json is the store writer's — queued, not on
    // disk yet. The hashes are written NOW (the named flush), and the legacy file is renamed only once the writer says they ARE on
    // disk: a kill between a queued save and the rename would lose every hash (each daemon in the field locked out for good)
    if (!this._flushLanded()) {
      console.warn('[hosts] dial-token migration: hosts.json is not on disk yet — the legacy file is kept until it is (renamed then, in this process; if the hub ends first, the next boot runs it again)');
      // its read (S1): the file must not outlive this process's state — an unpair before the next boot would be undone by a rerun
      // (the old hash folded back in). Memory is the authority: once the writer says the state is on disk, every hash still held
      // is there and one that is gone was removed on purpose — the file goes then (asked again each minute until it does)
      const later = () => this.persisted().then((on) => { if (on) fs.rename(file, file + '.migrated', () => { }); else { const t = setTimeout(later, 60000); t.unref?.(); } }, () => { });
      later();
      return false;
    }
    fs.renameSync(file, file + '.migrated');
    return true;
  }

  /** 主开发 04:33Z (4): the migration that WAITED for a held hosts.json runs at the read OFF the main loop — the legacy file sits in the
   *  data folder that was failing: read async (no existsSync / readFileSync there on the loop), the hashes taken in, the file renamed
   *  (async) only once the writer says they are on disk; held again meanwhile ⇒ it waits again. → a promise (never rejects) */
  _migrateDialTokensAtRead(file) {
    return fs.promises.readFile(file, 'utf-8').then((text) => {
      if (this._unread) { this.whenRead(() => { this._migrateDialTokensAtRead(file); }, `the dial-token migration (${path.basename(file)} into hosts.json)`, 'migrate:dial-tokens'); return false; }
      const all = JSON.parse(text);
      for (const [devId, hash] of Object.entries(all)) if (hash && !this.dialTokenHash(devId)) this.setDialToken(devId, hash);
      if (!Object.entries(all).every(([devId, hash]) => !hash || this.dialTokenHash(devId))) { console.warn('[hosts] dial-token migration incomplete — legacy file kept'); return false; }
      const later = () => this.persisted().then((on) => { if (on) fs.rename(file, file + '.migrated', () => { }); else { const t = setTimeout(later, 60000); t.unref?.(); } }, () => { });
      later();
      return true;
    }).catch((e) => { if (!(e && e.code === 'ENOENT')) console.warn('[hosts] dial-token migration failed:', e && e.message); return false; });
  }

  add({ name, user, host, port, keyPath, privateKey, transport, deviceId, dialTokenHash, replaces = null, viaConfig = false, sshConfig = null, jump = null }) {
    this._refuseIfUnread('adding a machine');   // remainder of B-f276: a held hosts.json takes no change
    // DIAL host (graduation slice B): a paired dial-out device promoted to a
    // full machine — no ssh fields; every data path rides deviceForDial.
    if (transport === 'dial') {
      if (!deviceId) throw new Error('deviceId required for a dial host');
      const id = 'host-dial-' + String(deviceId).replace(/[^\w-]/g, '');
      if (this._state.hosts.some(h => h.id === id)) return id; // idempotent
      const rec = { id, name: String(name || deviceId).slice(0, 60), transport: 'dial', deviceId: String(deviceId), createdAt: Date.now() };
      if (dialTokenHash) rec.dialTokenHash = String(dialTokenHash);
      this._state.hosts.push(rec); this._noteAdded(id);
      this._save();
      return id;
    }
    // B-2ca0: the record's words judged by THE verdict the config import asks too (follow-up, 主开发 19:23Z)
    const refusal = sshRecordRefusal({ host, user, viaConfig, jump });
    if (refusal) throw refusal;
    const po = sshPortOf(port, viaConfig);
    if (po.refuse) throw po.refuse;
    const jv = jumpVerdict(jump);
    const id = 'host-' + crypto.randomBytes(4).toString('hex');
    const hasKeyText = !!(privateKey && String(privateKey).trim());
    const rec = {
      id,
      name: String(name || host).slice(0, 60),
      user: String(user || ''), host: String(host),
      port: po.port,   // B-2ca0: null = the ssh config's port; follow-up: a whole number 1–65535, else refused above
      ...(viaConfig ? { viaConfig: true, ...(sshConfig ? { sshConfig } : {}) } : {}),   // B-2ca0: the address is an ALIAS of the hub's ssh config (the add route asked ssh -G)
      ...(jv.jump ? { jump: jv.jump } : {}),
      keyPath: null,
      // honest key provenance for the UI (real report: an IMPORTED private key
      // was labeled 'using VibeSpace key'): imported = user pasted/uploaded it;
      // app = the VibeSpace-generated key; default = the system's ssh keys.
      // B-2ca0 commit 2: file = a key file of the hub the person named (a pasted block's IdentityFile) — not VibeSpace's own key
      keySource: hasKeyText ? 'imported' : (keyPath ? (String(keyPath) === path.join(this._sshDir, 'id_ed25519') ? 'app' : 'file') : 'default'),
      createdAt: Date.now(),
    };
    // Name collision is checked BEFORE any file write — the old order wrote
    // data/ssh/<id>.key and THEN threw, orphaning a key file no record ever
    // referenced again. `replaces` (verifier #3): the record this one REPLACES keeps no claim on its name — the route removes it
    // once this one is saved.
    // the refusal carries a CODE (exit-routes sends it; the page words it — lane ui-language, the walk's machines-12)
    if (this._state.hosts.some(h => h.name === rec.name && h.id !== replaces)) throw Object.assign(new Error('A host with that name exists'), { code: 'host-name-taken' });
    // Pasted/uploaded private key → stored per-host under data/ssh, 0600.
    // add() stays SYNCHRONOUS (setDialToken calls it and immediately does
    // findByDeviceId on the result), so it cannot run the ssh-keygen unlock —
    // the /api/hosts route decrypts first via src/ssh-key.js and hands us
    // plaintext. This is the BELT for any caller that skips the route:
    // BatchMode ssh can never prompt, so a still-encrypted key is refused
    // rather than stored as a key that will only fail at connect time with a
    // bare "Permission denied (publickey)".
    if (hasKeyText) {
      const body = String(privateKey).replace(/\r\n/g, '\n').trim() + '\n';
      const info = classifyPrivateKey(body);
      if (!info.usable) throw new Error('Not a valid private key (missing BEGIN PRIVATE KEY header)');
      if (info.encrypted) {
        const e = new Error('Key is passphrase-protected — supply its passphrase so it can be unlocked at import');
        e.code = 'key-encrypted';
        throw e;
      }
      fs.mkdirSync(this._sshDir, { recursive: true, mode: 0o700 });
      const kp = path.join(this._sshDir, `${id}.key`);
      fs.writeFileSync(kp, body, { mode: 0o600 });
      rec.keyPath = kp;
    } else if (keyPath) {
      rec.keyPath = String(keyPath);
    }
    this._state.hosts.push(rec); this._noteAdded(rec.id);
    this._save();
    return rec.id;
  }

  remove(id) {
    this._refuseIfUnread('removing a machine');   // remainder of B-f276: a held hosts.json takes no change
    try { if (this._realCwds) this._realCwds.delete(id); } catch { }   // B-16d7: a removed machine's real folders go with it
    const h = this.get(id);
    // uploaded per-host key files are ours to clean up
    const uploadedKey = h.keyPath && h.keyPath.startsWith(this._sshDir) && h.keyPath.endsWith(`${id}.key`) ? h.keyPath : null;   // (not a key STORE's file: test-key-file-law names those by `keyFile`)
    this._state.hosts = this._state.hosts.filter(x => x.id !== id);
    this._noteRemoved(id);   // (B-f276 family unit 2: the removal is written with the list — no kept copy keeps anything of it)
    this._discoveryCache.delete(id);
    try { const DMx = require('./agentd/client.js').DeviceManager; if (h.deviceId) DMx.dropHelloFolds('dev:' + h.deviceId); DMx.dropHelloFolds('host:' + id); } catch {}   // B-0194: what its hello folds owe said, then they go (both names) — memory only: at once (the restack's meeting; the files wait for the landing below)
    this._save();
    this._reachChanged('remove');
    // 主开发 04:33Z (2b): the record LANDS first (its save is the store writer's, QUEUED — B-48a4) — the machine's own files and the other
    // stores' teardown only once hosts.json carries the removal: unlinked first, a restart before the save landed brought the record back
    // without its key. → a promise of that teardown (never rejects; false = the record came BACK — an import, a restore — nothing of it goes)
    return this._whenRemovalLands(id).then((landed) => {
      if (!landed) { console.warn(`[hosts] ${id} is back in the machines list before its removal reached hosts.json — its key file, its transcript cache and the sign-ins kept for it stay`); return false; }
      if (uploadedKey) { try { fs.unlinkSync(uploadedKey); } catch {} }
      try { HK.writePinFile(this._sshDir, { id }); } catch { } // lane lg-remote-hardening: its host-key pin goes (an unpinned record has no file)
      try { this.onHostKeyPinned?.(h); this.onHostKeyPinned?.(h, 'device', { notice: true }); } catch { } // …and its host-key items (never an urgent item about a machine that is gone)
      // The host's remote-transcript cache is dead weight once the host is gone
      // (files up to 64MB each accumulated forever — audit round-3).
      // r4006 law E: the machine's owed copies and records leave the writer first (forget: one not in flight is dropped, one IN FLIGHT
      // lands and is unlinked again). The folder goes only once every write of it in flight has landed (bounded), so no owed write
      // makes the folder again after this removal (the writer's thread makes a missing folder for the write it runs). AT THE BOUND (line
      // 888's follow, r4154 (2)): on storage that holds a write past 120 s, or a copy parked behind another file's write, a write still owed
      // when the bound passes lands after the folder went: its makeDir makes the folder again, and the file is unlinked after it (it was
      // forgotten) — so what comes back is an EMPTY folder, never the copy's bytes, until the next start's sweep (sweepJsonlCache)
      let inFlight = [];
      try { const W = this._W(), base = path.join(this.dataDir, 'remote-jsonl', id) + path.sep, until = Date.now() + CACHE_LAND_MS;
        for (const st of (typeof W.stats === 'function' ? W.stats() : [])) if (st && typeof st.file === 'string' && st.file.startsWith(base)) { this._letCacheGo(W, st.file); if (st.inflight && typeof W.durable === 'function') inFlight.push(this._cacheLanded(W, st.file, until)); }   // forget FIRST (it answers every waiter at once), then wait for the in-flight write's landing
      } catch { }
      return Promise.all(inFlight).then(() => {
        try { fs.rmSync(path.join(this.dataDir, 'remote-jsonl', id), { recursive: true, force: true }); } catch {}
        this._removed(id);
        return true;
      });
    }, () => false);
  }
  /** (2b): the removal of `id` is on disk — asked again while the writer still owes it (its read r1, S1: never given up — the writer
   *  keeps the write owed and may land it later; given up, the key file and the sealed sign-ins stayed for good). Each ask is one
   *  `persisted()` wait (bounded by the writer), then `_removalRetryMs` (a suite's seam) on an unref'd timer. → true once on disk,
   *  false when the record is back (an import, a restore) */
  async _whenRemovalLands(id) {
    for (let k = 0; ; k++) {
      if (this._state.hosts.some((x) => x.id === id)) return false;   // the record is back: nothing of it goes
      if (await this.persisted()) return !this._state.hosts.some((x) => x.id === id);
      if (k === 0) console.warn(`[hosts] ${id} is removed here, but hosts.json does not carry it yet — its key file, its transcript cache and the sign-ins kept for it wait until it does (asked again until then; a restart before it lands brings the machine back)`);
      await new Promise((r) => { const t = setTimeout(r, Number(this._removalRetryMs) > 0 ? Number(this._removalRetryMs) : REMOVAL_RETRY_MS); t.unref?.(); });
    }
  }
  /** lane desktop-vnc-remember: who hears that a machine was REMOVED (its unpair) — a holder of a per-machine secret forgets
   *  it (src/server/desktop-access.js: the machine's sealed sign-ins). → the unsubscribe function */
  onRemoved(fn) { if (!this._removedFns) this._removedFns = new Set(); this._removedFns.add(fn); return () => this._removedFns.delete(fn); }
  _removed(id) { for (const fn of this._removedFns || []) { try { fn(id); } catch (e) { console.warn('[hosts] a removal listener failed:', e && e.message); } } }

  // Boot sweep: remote-jsonl dirs whose host no longer exists (orphaned before
  // remove() learned to clean up) + cached transcripts unused for 30 days.
  sweepJsonlCache() {
    if (this._unread) return;   // the B-f276 remainder, its read r1 (M1): a HELD list knows no machine — every machine's cache would read as an orphan
    const base = path.join(this.dataDir, 'remote-jsonl');
    let dirs = [];
    try { dirs = fs.readdirSync(base); } catch { return; }
    const live = new Set(this._state.hosts.map((h) => h.id));
    const cutoff = Date.now() - 30 * 86400000;
    for (const d of dirs) {
      const dir = path.join(base, d);
      if (!live.has(d)) { if (this.namedByCopy(d)) continue; try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} continue; }   // (B-f276 family unit 2: a machine a kept copy names keeps its cache)
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        try {
          const fp = path.join(dir, f);
          if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
        } catch {}
      }
    }
  }

  /** Config transfer: host records + the private-key TEXT of any uploaded keys. */
  exportBundle() {
    const keys = {};
    for (const h of this._state.hosts) {
      if (h.keyPath && h.keyPath.startsWith(this._sshDir)) {
        try { keys[h.id] = fs.readFileSync(h.keyPath, 'utf-8'); } catch {}
      }
    }
    return { hosts: this._state.hosts, keys };
  }

  /** Import a host bundle — records REPLACE, uploaded keys rewritten (0600).
   *  Returns {warnings} — a passphrase-protected key in the bundle is SKIPPED
   *  (we can't prompt for its passphrase during an unattended import, and
   *  writing it would produce a host that only fails at connect time); the
   *  caller surfaces the reason in the import result. */
  importBundle(bundle) {
    // remainder of B-f276: a held hosts.json takes no change — its read r1 (S3): SAID in the import's own answer, never a throw
    // inside the import route (Express answered its default 503 page, the rest of the import half-applied)
    if (this._unread) return { warnings: [`the machines were not imported — ${this.unreadWords()}`], skipped: true, code: 'hosts-unread' };   // the code: the page words it
    const warnings = [];
    if (!bundle || !Array.isArray(bundle.hosts)) return { warnings };
    fs.mkdirSync(this._sshDir, { recursive: true, mode: 0o700 });
    const hosts = [];
    for (const h of bundle.hosts) {
      const rec = { ...h };
      if (rec.sshConfig) delete rec.sshConfig;   // B-2ca0: what ANOTHER hub's ssh config resolved is not this hub's (the SFTP road reads it)
      // its read (follow-up): the record's ID names its key file (<ssh dir>/<id>.key) and caches — only the shape this hub makes
      if (!/^host-[A-Za-z0-9_-]+$/.test(String(rec.id || ''))) { warnings.push(`${rec.name || 'a record'}: skipped — its id is not one this hub makes`); continue; }
      if (rec.transport !== 'dial') {
        rec.viaConfig = rec.viaConfig === true;   // its read: a boolean, never a bundle's «yes»
        if (!rec.viaConfig) delete rec.viaConfig;
        // B-2ca0 follow-up (主开发 19:23Z): EVERY imported ssh record is judged as the add judges a typed one — its user, address, jump
        // (THE verdict), its port (the add's rule) and its key path; one that fails is skipped by name, never carried to an argv
        const refusal = sshRecordRefusal({ host: rec.host, user: rec.user, viaConfig: !!rec.viaConfig, jump: rec.jump });
        const po = sshPortOf(rec.port, !!rec.viaConfig);
        const ownKey = !!(bundle.keys && bundle.keys[h.id] && typeof rec.keyPath === 'string' && rec.keyPath.startsWith(this._sshDir));   // rewritten below
        const badKey = rec.keyPath != null && (typeof rec.keyPath !== 'string' || CONTROL_RE.test(rec.keyPath) || (!ownKey && !PLAIN_KEY_PATH.test(rec.keyPath)));
        const why = refusal ? refusal.message : po.refuse ? po.refuse.message : badKey ? (typeof rec.keyPath === 'string' && CONTROL_RE.test(rec.keyPath) ? 'its key path holds a control character' : 'its key path is not an absolute path') : null;
        if (why) { warnings.push(`${rec.name || h.id}: skipped — ${why}`); continue; }
        const j = jumpVerdict(rec.jump);
        if (j.jump) rec.jump = j.jump; else delete rec.jump;
        rec.port = po.port; rec.host = String(rec.host); rec.user = String(rec.user || '');
        if (rec.dialRoot != null && !dialRootOk(rec.dialRoot)) { warnings.push(`${rec.name || h.id}: its install folder is not one this hub writes — dropped (no remote teardown)`); delete rec.dialRoot; }
      }
      // lane grants-unify: a bundle from before the unify asks each time under `exit.run.ask` — carried to `exit.ask` (the
      // field the reader reads) so an import never runs without asking what used to ask; its lists ride `bundle.grants`
      // (or are mapped from those records) through the exit manager's importLists — never read from here
      if (rec.exit && typeof rec.exit === 'object' && !Array.isArray(rec.exit) && rec.exit.ask === undefined && rec.exit.run && rec.exit.run.ask === true) rec.exit = { ...rec.exit, ask: true };
      // A bundle from a pre-2.160.0 instance carries dial records WITHOUT the
      // token hash (it lived in dial-tokens.json, never exported) — a wholesale
      // replace would lock every paired device out. Keep the hash we have.
      if (rec.transport === 'dial' && !rec.dialTokenHash) {
        const cur = this.findByDeviceId(rec.deviceId);
        if (cur?.dialTokenHash) rec.dialTokenHash = cur.dialTokenHash;
      }
      const keyText = bundle.keys?.[h.id];
      if (keyText && h.keyPath && h.keyPath.startsWith(this._sshDir)) {
        if (classifyPrivateKey(keyText).encrypted) {
          // Don't write a key ssh can never use non-interactively.
          rec.keyPath = null;
          rec.keySource = 'default';
          warnings.push(`${rec.name || h.id}: key skipped (passphrase-protected — re-import it in Remote → Add machine)`);
        } else {
          // rebase the key under THIS instance's ssh dir
          const kp = path.join(this._sshDir, `${h.id}.key`);
          fs.writeFileSync(kp, keyText, { mode: 0o600 });
          rec.keyPath = kp;
        }
      } else if (h.keyPath && h.keyPath.startsWith(this._sshDir)) {
        rec.keyPath = null; // key text missing — fall back to ~/.ssh
      }
      // B-2ca0 follow-up: the KEY SOURCE is the add's own derivation from what this hub now holds — never the bundle's word
      if (rec.transport !== 'dial') rec.keySource = rec.keyPath ? (rec.keyPath === path.join(this._sshDir, 'id_ed25519') ? 'app' : String(rec.keyPath).startsWith(this._sshDir) ? 'imported' : 'file') : 'default';
      hosts.push(rec);
    }
    const before = Array.isArray(this._state.hosts) ? this._state.hosts : [];
    this._state.hosts = hosts;
    // round wjgchwl6a (2): a machine the import DROPS is a person's removal by another door (the verdict below) — written into the removed
    // list WITH the list, before the exit lists are judged again, so no kept copy keeps its rows; a machine the import brings leaves it
    { const now = new Set(hosts.map((r) => r && String(r.id))); for (const old of before) if (old && !now.has(String(old.id))) this._noteRemoved(old.id); for (const id of now) this._noteAdded(id); }
    this._save();
    this._reachChanged('import'); // verify-r3 A-r3a: an import can narrow a machine's lists or drop the machine — on the line after the save (test-exit-proxy A-r3a); the pin files and the items below follow it
    for (const r of hosts) { try { HK.writePinFile(this._sshDir, r); } catch (e) { warnings.push(`${r.name || r.id}: its host-key pin file was not written (${e.message})`); } } // lane lg-remote-hardening
    // 主开发's verdict of 2026-11-18: a machine the import DROPS is a removal — its pin file goes and its host-key items are
    // resolved (never a pin file, nor an urgent item, about a machine that is gone)
    const kept = new Set(hosts.map((r) => r && r.id));
    for (const old of before) {
      if (!old || kept.has(old.id)) continue;
      try { HK.writePinFile(this._sshDir, { id: old.id }); } catch { }
      try { this.onHostKeyPinned?.(old); this.onHostKeyPinned?.(old, 'device', { notice: true }); } catch { }
    }
    // the reader of unit 3: a KEPT machine whose pin or address the import changed rides no connection made before it — its
    // master is told to exit and its cached device link (which captured the old ssh options) is rebuilt
    const prevById = new Map(before.filter(Boolean).map((x) => [x.id, x]));
    for (const r of hosts) { const o = r && prevById.get(r.id); if (o && (o.host !== r.host || JSON.stringify(o.hostKeys || null) !== JSON.stringify(r.hostKeys || null) || JSON.stringify(o.jumpHostKeys || null) !== JSON.stringify(r.jumpHostKeys || null) || (o.jump || null) !== (r.jump || null) || JSON.stringify(o.deviceKey || null) !== JSON.stringify(r.deviceKey || null))) this._dropConnections(o); }
    return { warnings };
  }

  /** ssh argv for a host (shared by test/discovery/bootstrap/session spawn).
   *  multiplex (2.125.0): ControlMaster connection reuse for SHORT-LIVED
   *  per-op ssh (discovery probes, remote-fs, rsync) — first op pays the
   *  handshake, the next ~10min ride the persisted master (~1s → ~50ms).
   *  NEVER set it on SESSION pipes: if a session's ssh became the master,
   *  its death would kill every multiplexed connection with it (coupling
   *  unrelated sessions), and long-lived pipes pin the master forever. */
  sshArgs(h, { tty = false, reverse = null, multiplex = false } = {}) {
    if (h && h.transport === 'dial') throw new Error(`"${h.name}" is a dial-out device — it has no ssh; this operation must ride the device link`);
    const args = [...HK.hostKeyOpts(this._sshDir, h), ...SSH_BASE_OPTS, ...portArgsOf(h), ...this._tailnetOpts(h), ...jumpArgsOf(h, this._sshDir)];
    if (h.keyPath) args.push('-i', h.keyPath, '-o', 'IdentitiesOnly=yes');
    if (multiplex && cmUsable(this)) {
      args.push('-o', 'ControlMaster=auto', '-o', `ControlPath=${path.join(this._cmDir, cmNameOf(h))}`, '-o', 'ControlPersist=600');
    }
    if (tty) args.push('-t');
    // Reverse tunnel (remote 127.0.0.1:<rport> → this server): remote agent
    // tools (vibespace-status/-task) call VIBESPACE_API through it. Placed
    // BEFORE the destination so option parsing is unambiguous. Bind failures
    // (port in use) only warn — the session still runs, tools just degrade.
    if (reverse) args.push('-R', reverse);
    args.push(destOf(h));
    return args;
  }

  /** THE ENV OF EVERY SSH ROAD (lane spawn-env-debts, 2026-10-20), beside the argv: a multiplexed call's ssh FORKS the
   *  ControlMaster (ControlPersist=600), and the master keeps the env of the call that forked it for ten minutes while
   *  every later call rides it — so ONE road that inherited put the hub's whole env (its tokens) into the process every
   *  road shares. Every ssh spawn (and rsync over sshCmd) hands `env: hosts.sshEnv()`; the agentd bridge builds the same
   *  (src/agentd/client.js, SSH_ENV_KEEP). test-architecture §93 holds every road to it. */
  sshEnv() { return serviceEnv(process.env, { keep: SSH_ENV_KEEP }); }

  /** ssh option STRING for tools that take a transport command (rsync -e):
   *  everything sshArgs adds except the destination. */
  sshCmd(h) {
    const args = [...HK.hostKeyOpts(this._sshDir, h), ...SSH_BASE_OPTS, ...portArgsOf(h), ...this._tailnetOpts(h), ...jumpArgsOf(h, this._sshDir)];
    if (h.keyPath) args.push('-i', h.keyPath, '-o', 'IdentitiesOnly=yes');
    // rsync transports are short-lived per-op — ride the shared master too (unless its folder was refused)
    if (cmUsable(this)) args.push('-o', 'ControlMaster=auto', '-o', `ControlPath=${path.join(this._cmDir, cmNameOf(h))}`, '-o', 'ControlPersist=600');
    // B-2ca0 follow-up (its read): quoted by RSYNC's own rule — its -e splitter honours '…' and "…", a doubled quote inside is one quote,
    // and a backslash is NO escape (a JSON-quoted `\"` ended the quote there: a path holding `"` became words — an option — of ssh)
    return 'ssh ' + args.map((a) => (/[\s"'\\]/.test(a) ? `'${a.replace(/'/g, "''")}'` : a)).join(' ');
  }

  /** B-2ca0: an ALIAS of the hub's ssh config (`viaConfig`) keeps the config's own Port and User unless the person set them — the
   *  release always said `-p 22` and `user@`, which OVERRIDE the config (an entry on port 2222 was dialled on 22, its User replaced).
   *  A port left EMPTY at the add is stored null — the config's; a typed one (22 too) is the person's (round 3). */
  _portArgs(h) { return portArgsOf(h); }
  dest(h) { return destOf(h); }
  /** B-2ca0: is `host` an ALIAS of the hub's ssh config? One bounded `ssh -G` child — it prints the configuration ssh WOULD use and
   *  connects to nothing (a `Match exec` of the hub's config runs, as on every ssh road). → { alias, configured, userIsDefault, hostname,
   *  user, port, identityFile } (alias: the resolved hostname is not the name typed;
   *  configured: alias, or the entry sets a port / user of its own) | null (no answer, a
   *  name that is not a plain host word — never an option) */
  resolveAlias(host, { ms = 5000, graceMs = 500 } = {}) {
    const name = String(host || '');
    if (!name || name.startsWith('-') || /\s/.test(name)) return Promise.resolve(null);
    return new Promise((done) => {
      // B-2ca0 follow-up (主开发 19:23Z): a TIMER OF ITS OWN — a killed child whose stdout a grandchild still holds (a `Match exec` of the
      // hub's config, a ProxyCommand) never calls back; the add route answers anyway, as «not an alias» (`graceMs` past the kill)
      let over = false, cp = null;
      const resolve = (v) => { if (over) return; over = true; clearTimeout(tm); done(v); };
      // its read: the timer also lets go of the child's pipes (a grandchild holding them would keep the fds for as long as it lives)
      const tm = setTimeout(() => { try { if (cp && cp.stdout) cp.stdout.destroy(); if (cp && cp.stderr) cp.stderr.destroy(); } catch { /* gone */ } resolve(null); }, ms + graceMs);
      cp = execFile('ssh', ['-G', name], { env: this.sshEnv(), timeout: ms, killSignal: 'SIGKILL' }, (err, out) => {
        const g = err ? null : parseSshG(out, name);
        if (!g) return resolve(null);
        // its read: an entry with NO HostName still configures the name (`Host gpu01.example.com` + `Port 2222`) — configured = it
        // resolves elsewhere, or its port or user is not ssh's default (22, the hub's own user)
        let me = ''; try { me = os.userInfo().username; } catch { }
        const userIsDefault = !g.user || g.user === me;
        resolve({ ...g, userIsDefault, configured: g.alias || (g.port != null && g.port !== 22) || !userIsDefault || g.proxied });   // commit 2: an entry that dials through another host is configured too
      });
    });
  }

  /** A TAILNET NAME WITHOUT THE SYSTEM RESOLVER (lane tailscale-plugin-pod-dns): the tunnel plugin never takes over
   *  the container's DNS, so `<host>.<tailnet>.ts.net` is answered by the plugin's own peer table (nameLookup — wired
   *  to plugins.tunnelLookup) and ssh dials that IP; HostKeyAlias keeps known_hosts keyed by the name. [] otherwise. */
  _tailnetOpts(h) {
    let hit = null;
    try { hit = typeof this.nameLookup === 'function' && h && h.host ? this.nameLookup(String(h.host)) : null; } catch { }
    return hit && hit.ip ? ['-o', `HostName=${hit.ip}`, '-o', `HostKeyAlias=${h.host}`] : [];
  }

  /** B-b83c: the usage scanner's fallback runs the agent's OWN node first (the first argv word, no shell), else `node` */
  static scannerNodeOf(dm) { return agentNodeOf(helloOf(dm)) || 'node'; }

  /** B-b83c: a DIAL device's own node, as its hello said it (src/remote-shell.js agentNodeOf) — read from a link that is ALREADY up
   *  (connectedDevice never starts a connect: no second wait before the probe's own); an ssh host, an older agent, a device not
   *  connected now ⇒ null (the release's text) */
  async _agentNodeOf(h) {
    if (!h || h.transport !== 'dial') return null;
    try { const dm = this.connectedDevice(h.id); return dm ? agentNodeOf(helloOf(dm)) : null; } catch { return null; }
  }

  /** Run a read-only shell probe on ANY machine — ssh hosts via _ssh, dial
   *  devices via the device daemon's run-cmd (2.188.0: the Manage-Agents
   *  status probes were ssh-only, so a selected dial device showed everything
   *  as not-installed/unreachable while the same probes worked over ssh). */
  /** `by` (lane device-act-audit): who asked — a caller that knows (a person's route, an agent) names it; the hub's own
   *  probes are `system:hosts`. */

  async _hostShell(h, script, { timeoutMs = 15000, by = 'system:hosts', consent = false, env = null } = {}) { // `consent` (B-69ec): a person's own press carries it; `env` (B-b83c): the dial run's env (the ssh road has none to hand)
    try {
      if (h.transport === 'dial') {
        // 15s, not the 6s default (review catch): accountsStatus rides this
        // inside session CREATE (linked/host-held rescue) — a tight bound
        // failed creates a slow-but-healthy link would have served.
        const dm = await this.deviceBounded(h.id, 15000);
        if (consent) { const rc = await dm.runCmd('sh', ['-c', script], { timeoutMs, by, consent: true, ...(env ? { env } : {}) }); return String(rc.stdout || ''); } // B-69ec: a person's create carries its consent
        const r = await dm.runCmd('sh', ['-c', script], { timeoutMs, by, ...(env ? { env } : {}) });
        return String(r.stdout || '');
      }
      return String(await this._ssh(h, script, { timeoutMs }));
    } catch (e) {
      // Probe-failure telemetry (2.207.0): silent host-probe failures made
      // identity/roster bugs look like data bugs. Name + transport only.
      global.__vsEvent?.('host-probe-failed', h.transport === 'dial' ? 'dial' : 'ssh');
      throw e;
    }
  }

  /** Anthropic login state ON THE HOST (read-only probe, one round trip):
   *  subscription = remote credentials.json holds an OAuth token; cliKey = the
   *  remote's console-login-minted primaryApiKey (importable into the central
   *  store). Mirrors AccountManager's local probes — INCLUDING the API-key
   *  auth shapes (2.188.0: backendStatus learned apiKeyHelper in 2.186.7 but
   *  this probe didn't, so one dialog said "logged in (apiKeyHelper)" on top
   *  and "not logged in" in the accounts roster for the same host). Also
   *  returns the host login's IDENTITY: claude email from ~/.claude.json
   *  oauthAccount (config-reported, can lag a /login switch) and the codex
   *  auth.json id_token payload segment (decoded server-side — the JWT email
   *  can never go stale relative to the token itself). */
  async accountsStatus(id) {
    const h = this.get(id);
    // R1 (three-tier): op-first — the SHARED machine-probes implementation
    // answers from the machine itself (probe-creds). The ssh script below
    // stays as the fallback for daemon-less hosts and pre-R1 daemons (whose
    // unknown-op silence times the bounded request out).
    try {
      const dm = await this.deviceBounded(id, 6000);
      const r = await dm.probeCreds();
      if (r?.facts && r.facts.subscription) return r.facts;
    } catch { }
    // JSON field greps tolerate ": " — the CLI writes ~/.claude.json with
    // INDENTED JSON on most machines, and the old no-space patterns were
    // blind there (real incident: a Console key + email sat in the config
    // for months while accountsStatus reported cliKey absent / email null —
    // "Import its key" never appeared and the key was later orphaned by an
    // OAuth login switch).
    const out = await this._hostShell(h,
      `echo "OS:$(uname -s 2>/dev/null)"; `
      + `S=$(grep -c accessToken "$HOME/.claude/.credentials.json" 2>/dev/null); echo "SUB:$S"; `
      + `K=$(grep -o "primaryApiKey\\": *\\"sk-ant-[^\\"]*" "$HOME/.claude.json" 2>/dev/null | head -1); echo "KEY:$K"; `
      + `grep -q "\\"apiKeyHelper\\"" "$HOME/.claude/settings.json" 2>/dev/null && echo "HELPER:yes" || echo "HELPER:no"; `
      + `E=$(grep -o "emailAddress\\": *\\"[^\\"]*" "$HOME/.claude.json" 2>/dev/null | head -1); echo "EMAIL:$E"; `
      + `J=$(grep -o "id_token\\": *\\"[^\\"]*" "$HOME/.codex/auth.json" 2>/dev/null | head -1 | cut -d. -f2); echo "CXJWT:$J"; `
      // Credential-file mtimes (GNU stat else BSD) — the freshness anchor for
      // the 2.114.1 identity class: a cached roles-derived orgEmail OLDER than
      // the creds file describes the PREVIOUS login and must not be preferred
      // (real report: on-host /login switch kept showing the old account 2h).
      + `M=$(stat -c %Y "$HOME/.claude/.credentials.json" 2>/dev/null || stat -f %m "$HOME/.claude/.credentials.json" 2>/dev/null); echo "CMT:$M"; `
      + `MX=$(stat -c %Y "$HOME/.codex/auth.json" 2>/dev/null || stat -f %m "$HOME/.codex/auth.json" 2>/dev/null); echo "XMT:$MX"; `
      // Per-account subscription logins held ON the host (2.199.0): isolated
      // creds dirs under ~/.vibespace/subs/<acctId> minted by an on-host
      // login (or a past opt-in ship) — a session picking that account runs
      // on the host-side dir, nothing ships. find -exec (no shell globs —
      // zsh nomatch aborts glob-carrying lines in _hostShell scripts).
      + `HS=$(find "$HOME/.vibespace/subs" -maxdepth 2 -name ".credentials.json" -exec grep -l accessToken {} + 2>/dev/null | tr "\\n" " "); echo "HSUBS:$HS"; `
      // Sanitized helper state for a currently-watched on-host login. The
      // attempt id is random but non-secret; matching it avoids both stale
      // markers and another concurrent account's completion.
      + `find "$HOME/.vibespace/subs" -maxdepth 2 -name ".vibespace-login-status.json" -exec grep -H "\\"state\\":" {} + 2>/dev/null | sed "s/^/HSSTAT:/"; `
      // per-dir identity email — the anchor for same-account auto-merge
      // (2.205.0): a host login whose email matches an EXISTING record means
      // duplicate records of one real account
      + `find "$HOME/.vibespace/subs" -maxdepth 2 -name ".claude.json" -exec grep -H -o "emailAddress\\": *\\"[^\\"]*" {} + 2>/dev/null | sed "s/^/HSE:/"`);
    const hostOs = /^OS:([A-Za-z0-9._-]+)\s*$/m.exec(out);
    const sub = /SUB:(\d+)/.exec(out);
    const key = /KEY:primaryApiKey": *"(sk-ant-[^\s"]+)/.exec(out);
    const helper = /HELPER:yes/.test(out);
    const email = /EMAIL:emailAddress": *"([^"\s]+)/.exec(out);
    const cxSeg = /CXJWT:([A-Za-z0-9_-]{8,})/.exec(out);
    const cmt = /CMT:(\d+)/.exec(out);
    const xmt = /XMT:(\d+)/.exec(out);
    let codexEmail = null, codexPlan = null;
    if (cxSeg) {
      try {
        const payload = JSON.parse(Buffer.from(cxSeg[1], 'base64url').toString('utf-8'));
        codexEmail = payload.email || null;
        codexPlan = payload['https://api.openai.com/auth']?.chatgpt_plan_type || null;
      } catch { }
    }
    const hsubs = /HSUBS:([^\n]*)/.exec(out);
    const hostSubs = hsubs
      ? [...hsubs[1].matchAll(/subs\/([\w-]+)\/\.credentials\.json/g)].map((m) => m[1])
      : [];
    const hostSubLoginStatus = {};
    for (const m of out.matchAll(/HSSTAT:.*subs\/([\w-]+)\/\.vibespace-login-status\.json:[^\n]*"state":"(running|success|error)"[^\n]*"attempt":"([a-zA-Z0-9._-]{8,80})"/g)) {
      hostSubLoginStatus[m[1]] = { state: m[2], attempt: m[3] };
    }
    const hostSubEmails = {};
    for (const m of out.matchAll(/HSE:.*subs\/([\w-]+)\/\.claude\.json:emailAddress": *"([^"\s]+)/g)) {
      hostSubEmails[m[1]] = m[2];
    }
    return {
      platform: hostOs ? hostOs[1].toLowerCase() : null,
      subscription: { loggedIn: !!(sub && parseInt(sub[1]) > 0), email: email ? email[1] : null },
      cliKey: key ? { present: true, tail: key[1].slice(-8) } : { present: false },
      keyHelper: helper,
      codex: { email: codexEmail, plan: codexPlan },
      credsMtime: cmt ? parseInt(cmt[1]) : null,      // seconds — claude .credentials.json
      codexAuthMtime: xmt ? parseInt(xmt[1]) : null,  // seconds — codex auth.json
      hostSubs, // acct ids with a live host-side creds dir (~/.vibespace/subs/<id>)
      hostSubLoginStatus, // {acctId:{state,attempt}} from sanitized on-host helper markers
      hostSubEmails, // { acctId: identity email of its host-side dir } — merge anchor
    };
  }

  /** Rename a per-account creds dir on the host (same-account record merge —
   *  2.205.0). Refuses to clobber an existing target dir. */
  async renameHostSubDir(id, fromAcct, toAcct) {
    if (!/^sub-[\w-]{1,40}$/.test(fromAcct) || !/^sub-[\w-]{1,40}$/.test(toAcct)) throw new Error('bad account id');
    const h = this.get(id);
    const out = await this._hostShell(h,
      `if [ -e "$HOME/.vibespace/subs/${toAcct}" ]; then echo EXISTS; elif [ -d "$HOME/.vibespace/subs/${fromAcct}" ]; then mv "$HOME/.vibespace/subs/${fromAcct}" "$HOME/.vibespace/subs/${toAcct}" && echo MOVED; else echo ABSENT; fi`);
    return /MOVED/.test(out);
  }

  /** Full remote primaryApiKey + org name (for one-click import into the
   *  central store — travels over the ssh/device channel, never argv). */
  async cliPrimaryKey(id) {
    const h = this.get(id);
    // ": *" tolerance — indented-JSON configs (see accountsStatus note)
    const out = await this._hostShell(h,
      `grep -o "primaryApiKey\\": *\\"sk-ant-[^\\"]*" "$HOME/.claude.json" 2>/dev/null | head -1; grep -o "organizationName\\": *\\"[^\\"]*" "$HOME/.claude.json" 2>/dev/null | head -1`);
    const key = /primaryApiKey": *"(sk-ant-[^\s"]+)/.exec(out);
    const org = /organizationName": *"([^"]+)/.exec(out);
    return { key: key ? key[1] : null, org: org ? org[1] : null };
  }

  /** Remote $HOME, cached per host — injection needs ABSOLUTE remote paths
   *  (agent file tools don't expand ~ or $HOME). */
  async homeDir(h) {
    if (!this._homes) this._homes = new Map();
    if (this._homes.has(h.id)) return this._homes.get(h.id);
    try {
      // dial machines have no ssh — resolve the home over the device link
      // (B-0d70: a null home here made New Session default the device cwd to
      // the LOCAL home, which doesn't exist on the device → spawn/cd failure).
      let out;
      if (h.transport === 'dial') {
        // 15s (review catch): this default feeds the session-create cwd — a
        // deadline records the POD's local home as the device cwd (B-0d70).
        const dm = await this.deviceBounded(h.id, 15000);
        out = String((await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { by: 'system:hosts' })).stdout || '').trim().split('\n').pop().trim();
      } else {
        out = String(await this._ssh(h, 'echo "$HOME"')).trim().split('\n').pop().trim();
      }
      if (out && out.startsWith('/')) { this._homes.set(h.id, out); return out; }
    } catch { }
    return null;
  }

  _ssh(h, remoteCmd, { timeoutMs = 15000, maxBuffer = 4 * 1024 * 1024, encoding, fresh = false, connectTimeoutS = 0 } = {}) {
    return new Promise((resolve, reject) => {
      execFile('ssh', [...(connectTimeoutS ? ['-o', `ConnectTimeout=${connectTimeoutS}`] : []), ...this.sshArgs(h, { multiplex: !fresh }), '--', remoteCmd], { env: this.sshEnv(), timeout: timeoutMs, maxBuffer, ...(encoding !== undefined ? { encoding } : {}) }, (err, stdout, stderr) => {
        if (err) {
          const hk = err.code === 255 ? HK.hostKeyRefusal(h, stderr?.toString()) : null; // lane lg-remote-hardening: ssh's OWN refusal (exit 255) by name, and the For-you watch hears it
          if (hk) { if (hk.code === 'host-key-changed') { try { this.onHostKeyRefused?.(h, hk); } catch { } } return reject(hk); } // a pin that cannot be used is said on its row, never as a changed key in For you
          return reject(Object.assign(new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)), { killed: !!err.killed, signal: err.signal || null }));   // B-99b9 (r949): the run's own FACTS kept (its bound killed it) — a caller never reads them from the words
        }
        resolve(stdout);
      });
    });
  }

  /** Connectivity + remote tool inventory in ONE round trip. */
  async test(id, { by = 'system:hosts' } = {}) {
    const h = this.get(id);
    // dial machine: no ssh — a real round trip over the dialed-in link (runCmd
    // exercises the whole mux path) + the daemon's self-reported identity.
    if (h.transport === 'dial') {
      if (!this.dialOnline?.(h.deviceId)) throw new Error('not dialed in — start the daemon on the device (rerun the install command)');
      const t0 = Date.now();
      const dm = await this.deviceBounded(id, 8000);
      const st = dm.status();
      let tools;
      try {
        const r = await dm.runCmd('sh', ['-c', 'for c in dtach node claude codex; do command -v $c >/dev/null 2>&1 && printf "%s=yes " $c || printf "%s=no " $c; done'], { timeoutMs: 8000, by });
        tools = {};
        for (const m of String(r.stdout || '').matchAll(/(\w+)=(yes|no)/g)) tools[m[1]] = m[2] === 'yes';
      } catch { tools = null; } // Windows daemon: no sh — identity still proves the link
      return { ok: true, latencyMs: Date.now() - t0, dial: true, tools, info: st.info || null };
    }
    const probe = REMOTE_PRELUDE + 'echo VS-OK; for c in dtach node claude codex; do command -v $c >/dev/null 2>&1 && printf "%s=yes " $c || printf "%s=no " $c; done; echo; uname -sm';
    const t0 = Date.now();
    // The probe must measure what SESSIONS experience: a FRESH connection.
    // Multiplexed probes ride the persisted ControlMaster, whose ESTABLISHED
    // TCP flow survives firewall/route changes (conntrack keeps it; the
    // keepalives maintain it) — so a host whose address went dark kept
    // showing READY for hours while every new session pipe timed out (real
    // userL report 2.228.1: sidebar green, session stuck "host
    // reconnecting"). On fresh-fail we still try the mux once, ONLY to name
    // the situation precisely.
    let out;
    try {
      out = await this._ssh(h, probe, { timeoutMs: 10000, fresh: true });
    } catch (freshErr) {
      if (freshErr && (freshErr.code === 'host-key-changed' || freshErr.code === 'host-key-name')) throw freshErr; // lane lg-remote-hardening: never re-diagnosed over a live master (which checks no key)
      let muxAlive = false;
      // B-3767 unit 2: with sharing off there is no established channel to ask — a second fresh try would name a false cause
      if (cmUsable(this)) { try { muxAlive = String(await this._ssh(h, 'echo VS-MUX', { timeoutMs: 6000 })).includes('VS-MUX'); } catch {} }
      if (muxAlive) {
        throw new Error(`new SSH connections fail (${String(freshErr.message || freshErr).slice(0, 120)}) while an already-established channel still responds — the network path to this host changed (firewall/NAT/address). File transfers over the old channel may still work, but sessions cannot connect until the address is fixed.`);
      }
      throw freshErr;
    }
    if (!out.includes('VS-OK')) throw new Error('unexpected response');
    const tools = {};
    for (const m of out.matchAll(/(\w+)=(yes|no)/g)) tools[m[1]] = m[2] === 'yes';
    return { ok: true, latencyMs: Date.now() - t0, tools, uname: (out.trim().split('\n').pop() || '').trim() };
  }

  /** Kill an EXTERNAL/tmux agent process ON the host (sidebar Terminate for
   *  remote-discovered sessions — the pid is remote). Validates the pid is a
   *  claude/codex process there before SIGTERM (killPidShell = THE shared
   *  identity); device link first, ssh fallback (dial machines have no ssh).
   *  FOUR outcomes since r5 — VS_OK / VS_GONE are the only ones that return,
   *  VS_NOTAGENT and VS_UNKNOWN both THROW, because "nothing was signalled" is
   *  never a success (see killPidShell for the busybox `ps -p` incident). */
  async killRemotePid(id, pid, { by = 'system:hosts' } = {}) {
    const h = this.get(id);
    const p = parseInt(pid, 10);
    if (!Number.isFinite(p) || p <= 1) throw new Error('bad pid');
    const cmd = killPidShell(p);
    let out = '';
    if (h.transport === 'dial' || this.dataPlaneOn?.()) {
      try { const dm = await this.deviceBounded(id); out = String((await dm.runCmd('sh', ['-c', cmd], { timeoutMs: 10000, by })).stdout || ''); }
      catch (e) { if (h.transport === 'dial') throw new Error('device unreachable: ' + e.message); }
    }
    if (!out) out = String(await this._ssh(h, cmd));
    // r5: FOUR outcomes. VS_UNKNOWN is "it is alive and I could not read a
    // thing about it" — nothing was signalled, so it must not be reported as a
    // success (the busybox `ps -p` hole answered VS_GONE = success + gone) nor
    // as the finding "not an agent", which we did not make. It is checked
    // FIRST so a future caller cannot reach the generic `kill failed:` line
    // and paste a token at the user instead of an explanation.
    if (out.includes('VS_UNKNOWN')) throw new Error('that PID is running on the host but its command line could not be read there — nothing was terminated');
    if (out.includes('VS_NOTAGENT')) throw new Error('that PID is not a claude/codex process on the host');
    if (!out.includes('VS_OK') && !out.includes('VS_GONE')) throw new Error('kill failed: ' + out.trim().slice(0, 120));
    this.invalidateDiscovery(id); // the card should flip on the next poll
    return { success: true, gone: out.includes('VS_GONE') };
  }

  /** CAN THIS MACHINE BE REACHED — asked at most once a minute (lane hub-dies-dead-ssh-host). The host rung's FIRST
   *  question for a paired ssh machine (dirComplete / dirSlice / its recent folders / its home), so a machine that
   *  cannot be reached is refused BY NAME before anything else spawns — never an ssh child per keystroke. A live device
   *  link says yes with no spawn; a fresh unreachable memo (the transcript road's _hostDownUntil) says no with none;
   *  else ONE bounded `ssh … true` (BatchMode, ConnectTimeout=3, the shared ControlMaster — a yes warms it for the
   *  listing that follows), single-flight per machine, its verdict kept REACH_TTL_MS. A dial device is not asked (its
   *  link is the only road and answers for itself). → { ok, at, via, line? } */
  async reachable(id) {
    const h = this.get(id);
    if (!h || h.transport === 'dial') return { ok: true, at: Date.now(), via: 'not-ssh' };
    const R = (this._reach ||= new Map());
    const c = R.get(id) || {};
    if (c.verdict && Date.now() - c.verdict.at < REACH_TTL_MS) return c.verdict;
    if (c.p) return c.p;
    const keep = (v) => { R.set(id, { verdict: v }); return v; };
    if (this.linkState(id) === 'online') return keep({ ok: true, at: Date.now(), via: 'link' });
    if ((this._hostDownUntil?.get(id) || 0) > Date.now()) return keep({ ok: false, at: Date.now(), via: 'memo', line: '' });
    const p = this._ssh(h, 'true', { timeoutMs: 5000, connectTimeoutS: 3 })
      .then(() => keep({ ok: true, at: Date.now(), via: 'probe' }), (e) => keep({ ok: false, at: Date.now(), via: 'probe', line: String((e && e.message) || e || '').trim().split('\n').pop().slice(0, 300) }));
    R.set(id, { ...c, p });
    return p;
  }
  /** …the same as a refusal: throws unreachableError (code 'host-unreachable', the machine's name, ssh's line) or returns. */
  async refuseUnreachable(id) {
    const v = await this.reachable(id);
    if (!v.ok) throw unreachableError(this.get(id), v.line);
  }

  /** Remote directory autocomplete — parent-dir listing, prefix-filter.
   *  Device link first (the ONLY path for dial machines — real report: the
   *  pull dialog completed LOCAL folders; ssh fallback below unchanged). */
  async dirComplete(id, input, { by = 'system:hosts' } = {}) {
    const h = this.get(id);
    if (h && h.transport !== 'dial') await this.refuseUnreachable(id); // BY NAME, before any spawn (lane hub-dies-dead-ssh-host)
    const raw = String(input || '');
    const slash = raw.lastIndexOf('/');
    const parent = slash >= 0 ? raw.slice(0, slash) || '/' : '';
    const prefix = slash >= 0 ? raw.slice(slash + 1) : raw;
    if (h.transport === 'dial' || this.dataPlaneOn?.()) {
      try {
        const dm = await this.deviceBounded(id, 4000);
        let base = parent;
        if (base === '' || base === '~') base = String((await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { timeoutMs: 5000, by })).stdout || '').trim() || '/';
        else if (base.startsWith('~/')) base = String((await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { timeoutMs: 5000, by })).stdout || '').trim() + base.slice(1);
        const r = await dm.fsList(base);
        const shown = (parent === '' || parent === '~') ? '~' : parent;
        return r.entries
          .filter(e => e.isDir && e.name.toLowerCase().startsWith(prefix.toLowerCase()))
          .slice(0, 20)
          .map(e => (shown === '/' ? '/' : shown + '/') + e.name);
      } catch { if (h.transport === 'dial') return []; /* ssh hosts fall through */ }
    }
    const base = (parent === '' || parent === '~') ? '"$HOME"' : `'${parent.replace(/'/g, `'\\''`)}'`;
    const out = await this._ssh(h, `cd ${base} 2>/dev/null && ls -1ap 2>/dev/null | grep '/$' | head -60`, { timeoutMs: 6000 }).catch(() => '');
    const shownParent = (parent === '' || parent === '~') ? '~' : parent;
    return out.split('\n')
      .map(s => s.replace(/\/$/, ''))
      .filter(s => s && s !== '.' && s !== '..' && s.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 20)
      .map(s => (shownParent === '/' ? '/' : shownParent + '/') + s);
  }

  /** THE PATH FIELD ON THIS MACHINE (lane path-field — the owner's note ④: a remote machine gets the SAME recommendations,
   *  computed for it). ONE sh script (src/dir-slice-script.js) lists / probes / indexes there — over the device link's
   *  runCmd first (the ONLY road for a dial machine), the ssh rung otherwise (plain sh, never the login prelude) — and PURE
   *  src/path-candidates.js sliceListing builds the listing this machine's SafeFs answer builds. Paths come in that machine's
   *  `~/…` form. Kept per machine: the folder index 60 s and the Mac's display names 10 min.
   *  B-99b9 (主开发 r826, THE SMALLER SHAPE) — ONE HUNG SOURCE THERE NEVER COSTS A HEALTHY TYPED FOLDER ITS LISTING. TWO ASKS, the
   *  state in THIS hub's memory, nothing written or detached there:
   *  · R1, THE TYPED ASK: only the folders the text itself gives (sliceAsk's `typed`), its own short round trip beside R2; one
   *    already in flight for the same folders is JOINED. The hub stops WAITING at about 2 s (its own race, never the run's
   *    timeout); the run goes on to its own bound and a late landing is KEPT and served to the next ask (slow is not hung). A
   *    typed folder is marked HUNG only when its run never landed by the run's own deadline — for 30 s (the rung's
   *    PROBE_LATE_MS), covering text at or under it, with no new run then; the reply says when it is asked again.
   *  · R2, THE REST (the bases, the home when it is not typed, the probes, the index, the names): ONE in flight a machine; the
   *    last landed rest served, said late while one is out; a rest that does not land HOLDS that machine's rest 30 s, doubling
   *    on each miss in a row up to 10 minutes, reset by a landing.
   *  · `partial` is true EXACTLY when the typed folders have no landed result (not even a kept one); a late or held rest sets
   *    rowsLate / rowsUnread (+ rowsHeld) / probesLate — the names the field words — and never `partial`.
   *  → { suggestions, listing, self, took, partial, verdict?, rowsLate?, sourcesLate?, rowsUnread?, sourcesUnread?, rowsHeld?, heldFor?, probesLate? } */
  async dirSlice(id, { text = '', bases = [], probe = [], q = '', kind = 'folder', waitMs, press = false, late = false } = {}, { by = 'system:hosts', signal = null } = {}) {
    // r1508 / r1636 / r1651 — THE MACHINE COLLECTS, THE HUB SHAPES: an agent that says `dir-collect` (with its home, on a posix machine)
    // collects the facts THERE over this hub's plan, and this hub shapes them with ITS OWN shaper (src/server/dir-slice.js — the very
    // function of its own answer). An older agent (no capability: never asked an unknown op), a Windows machine and an ssh-only one
    // keep the sh road below, as before.
    // r2974 — THE LAW: A MACHINE's LISTING IS NEVER WORSE THAN THE RELEASE's. The collector serves only while it can: an ask it cannot
    // serve (its agent said its collector is stuck, a refusal, its bound, a reply with no facts, no capability) is served by the
    // release's road below — a child a call, which touches neither of that machine's pools; a machine whose agent said its collector is
    // stuck stays on that road until the agent says it has a live worker again (asked behind the answers). «Still looking» is then said
    // only while an answer can still come
    const road = this.collectRoadOf(id);
    if (road && !this._collectHeld(id, road)) { const r = await this._dirCollected(id, road, { text, bases, probe, q, kind, press, late }, { signal, by }); if (r) return r; }
    const h = this.get(id);
    if (h && h.transport !== 'dial') await this.refuseUnreachable(id); // BY NAME, before any spawn (lane hub-dies-dead-ssh-host)
    const PC = require('./path-candidates.js');
    const DS = require('./dir-slice-script.js');
    const t0 = Date.now();
    const now = () => (typeof this._now === 'function' ? this._now() : Date.now());   // the marks' and holds' clock (a suite hands its own)
    const files = kind === 'file';
    const norm = (v) => (Array.isArray(v) ? v : []).map(String).filter((p) => p && (p.startsWith('/') || p.startsWith('~')) && !/[\t\n]/.test(p)).map((p) => (p.length > 1 ? p.replace(/\/+$/, '') : p));
    const baseList = norm(bases).slice(0, 12);
    const probes = [...new Set(norm(probe))].slice(0, 40);
    const probeAs = new Map(); for (const p of (Array.isArray(probe) ? probe : []).map(String)) { const n = norm([p])[0]; if (n) probeAs.set(n, [...(probeAs.get(n) || []), p]); }   // the field's own strings
    const ask = PC.sliceAsk(text, baseList.map((p) => ({ path: p })));
    for (const k of ['list', 'typed']) ask[k] = ask[k].filter((p) => !/[\t\n]/.test(p));   // r949: a path holding a tab or a newline is never asked (it could fake a row)
    const fuzzy = String(q || '').trim();
    const c = (this._sliceCache = this._sliceCache || new Map()).get(id) || { index: null, names: null };
    this._sliceCache.set(id, c);
    c.r1 = c.r1 || new Map(); c.hung = c.hung || new Map();
    const r2 = c.r2 || (c.r2 = { p: null, raw: null, at: 0, miss: 0, heldUntil: 0, gen: 0, since: 0 });
    const WAIT = Math.max(50, Math.min(5000, Number(waitMs) || DIR_SLICE_WAIT_MS));
    const deadline = t0 + WAIT;
    const sleepUntil = (ms) => new Promise((r) => { const tm = setTimeout(r, Math.max(0, ms - Date.now())); tm.unref?.(); });
    const errs = [];
    // B-99b9: a HANG is a run that never ended (its own bound killed it, or it printed no end) — never a refusal, an offline device or a
    // connect failure: those are said as the machine's own words and never mark nor hold anything. 主开发 r949, THE LAW: a hang is told
    // from a refusal by the run's OWN FACTS, never by its words — the ssh child killed at its bound (`killed`, kept by _ssh), the
    // machine's own bound stopped it (the device's `timedOut`), or no answer by the hub's own bound on the device road (`hang`)
    const RUN_MS = Number(this._sliceRunMs) > 0 ? Number(this._sliceRunMs) : SLICE_RUN_MS;   // a suite's shorter bound (its seam); the product's is SLICE_RUN_MS
    const hangOf = (why) => Object.assign(new Error(why), { hang: true });
    const isHang = (e) => !!(e && (e.hang === true || e.killed === true));
    const ownBound = (p, ms) => new Promise((resolve, reject) => { const tm = setTimeout(() => reject(hangOf('no answer within the run\'s bound')), ms); tm.unref?.(); p.then((v) => { clearTimeout(tm); resolve(v); }, (e) => { clearTimeout(tm); reject(e); }); });
    const run = async (script) => {
      if (h.transport === 'dial' || this.dataPlaneOn?.()) {
        try { const dm = await this.deviceBounded(id, 4000); const r = await ownBound(dm.runCmd('sh', ['-c', script], { timeoutMs: RUN_MS, waitMs: RUN_MS * 1.5, by }), RUN_MS * 1.25); if (r && r.timedOut) throw hangOf('stopped at the run\'s bound there'); if (r && r.truncated) throw new Error('its answer was over the bound and cut'); return String((r && r.stdout) || ''); }   // a cut answer is no hang: said, nothing marked
        catch (e) { if (h.transport === 'dial' || isHang(e)) throw e; /* an ssh host's refused device road falls through — never a run that hung there */ }
      }
      // B-99b9: plain sh there, NOT the login shell's prelude (the prelude itself stats the home)
      // r949: ssh's own connect bound (3 s) ends a machine that does not answer its connect BEFORE the run's bound — its own exit 255,
      // a refusal said by its words, never a run killed as a hang
      return String(await this._ssh(h, `exec sh -c '${script.replace(/'/g, `'\\''`)}'`, { timeoutMs: RUN_MS, connectTimeoutS: 3 }));
    };
    // ── R1, THE TYPED ASKS: ONE A TYPED FOLDER (主开发 r880), joined and marked per folder; at most SLICE_TYPED_CAP at once ──
    const typedAll = ask.typed, typed = typedAll.slice(0, SLICE_TYPED_CAP), capped = typedAll.slice(SLICE_TYPED_CAP);
    const hungOf = (p) => { for (const [hp, until] of c.hung) if (until > now() && (p === hp || p.startsWith(hp === '/' ? '/' : hp + '/'))) return { path: hp, until }; return null; };
    const markHung = (list) => { for (const p of list) c.hung.set(p, now() + SLICE_HUNG_MS); if (c.hung.size > 64) for (const [k, u] of c.hung) if (u <= now()) c.hung.delete(k); };
    const r1Of = (list) => {   // → its entry { raw (landed or kept), p (in flight), err } — JOINED when one is out for the same folders
      const k = (files ? 'F' : 'D') + '\n' + list.join('\n');
      let e = c.r1.get(k);
      if (!e) {
        e = { raw: null, at: 0, p: null, since: 0, gen: 0, err: null }; c.r1.set(k, e);
        if (c.r1.size > 64) for (const [k2, e2] of c.r1) if (!e2.p) { c.r1.delete(k2); break; }   // never one still in flight
      }
      if (e.p && now() - e.since > SLICE_DEADLINE_MS) { e.p = null; e.gen++; markHung(list); }   // a run that never settled: its own deadline passed
      if (!e.p && !list.some(hungOf)) {
        const gen = ++e.gen; e.since = now(); e.err = null;
        e.p = run(DS.sliceScript({ list, files })).then((out) => {
          const r = DS.parseSlice(out);
          if (e.gen === gen) { e.p = null; if (r.done) { e.raw = r; e.at = now(); } else markHung(list); }   // landed late or not: KEPT; never landed by the run's bound: hung
          return r;
        }, (err) => { if (e.gen === gen) { e.p = null; if (isHang(err)) markHung(list); else { e.err = err; errs.push(err); } } return null; });
      }
      return e;
    };
    const r1s = typed.map((p) => ({ p, hung: hungOf(p), e: null }));
    for (const t of r1s) if (!t.hung) t.e = r1Of([t.p]);
    // ── R2, THE REST ── (one in flight a machine; held after a miss, the hold doubling; the index refresh rides it)
    const fresh = (x, ms) => x && Date.now() - x.at < ms;
    const restList = ask.list.filter((p) => !typedAll.includes(p)).slice(0, 14);
    const wantIndex = !!fuzzy && !fresh(c.index, 60e3);
    const wantNames = !fresh(c.names, 600e3);
    const restWant = { list: restList, probes, index: wantIndex, names: wantNames };
    const miss = () => { r2.miss++; r2.heldUntil = now() + Math.min(SLICE_HOLD_MAX_MS, SLICE_HOLD_MS * 2 ** (r2.miss - 1)); };
    if (r2.p && now() - r2.since > SLICE_DEADLINE_MS) { r2.p = null; r2.gen++; miss(); }   // a rest that never settled: missed
    if (!(r2.heldUntil > now()) && !r2.p && (restList.length || probes.length || wantIndex || wantNames)) {
      const gen = ++r2.gen; r2.since = now(); const want = restWant;
      r2.p = run(DS.sliceScript({ ...want, files })).then((out) => {
        const r = DS.parseSlice(out);
        if (r2.gen === gen) {
          r2.p = null;
          if (r.done) {
            r2.raw = r; r2.at = now(); r2.miss = 0; r2.heldUntil = 0;
            if (want.index) c.index = { at: Date.now(), dirs: r.index.dirs, links: r.index.links };   // a refresh that did not land keeps the old index
            if (want.names) c.names = { at: Date.now(), map: r.localized };
          } else miss();
        }
        return r;
      }, (err) => { if (r2.gen === gen) { r2.p = null; if (isHang(err)) miss(); else errs.push(err); } return null; });
    }
    // THE WAIT: the hub's own race, about 2 s for all of them (never a run's timeout)
    await Promise.race([Promise.all([...r1s.map((t) => t.e && t.e.p), r2.p].filter(Boolean)), sleepUntil(deadline)]);
    for (const t of r1s) if (!t.hung && t.e && !t.e.raw && !t.e.p) t.hung = hungOf(t.p);   // it ended unlanded within the wait
    const landed = r1s.filter((t) => t.e && t.e.raw);
    const r1Raws = landed.map((t) => t.e.raw);
    /* exactly one folder starts with the typed last segment → list it too, on R1's road (never a mount point said by name only) */
    const tx = String(text || '');
    const last = /\s/.test(tx) || !tx.includes('/') ? '' : tx.slice(tx.lastIndexOf('/') + 1).toLowerCase();
    let oneRaw = null;
    if (last && r1Raws.length) {
      const one = [];
      for (const r of r1Raws) for (const d of r.dirs) { const hits = (d.kids || []).filter((k) => !k.link && !k.mount && k.name.toLowerCase().startsWith(last)); if (hits.length === 1) one.push(d.path.replace(/\/$/, '') + '/' + hits[0].name); }
      const oneList = [...new Set(one)].slice(0, 4);
      if (oneList.length && !oneList.some(hungOf)) { const e1 = r1Of(oneList); if (e1.p) await Promise.race([e1.p, sleepUntil(deadline)]); oneRaw = e1.raw; }
    }
    const held = r2.heldUntil > now();
    const restRaw = r2.raw;
    if (!r1Raws.length && !restRaw && errs.length) throw errs[0];   // the machine refused BY NAME and nothing is kept: said as the release said it
    const home = (r1Raws[0] && r1Raws[0].home) || (restRaw && restRaw.home) || c.home || '';
    if (home) c.home = home;
    const typedAbs = new Set(r1Raws.flatMap((r) => r.dirs.map((d) => d.path)));
    const dirs = [...r1Raws.flatMap((r) => r.dirs), ...(oneRaw ? oneRaw.dirs : []), ...(restRaw ? restRaw.dirs.filter((d) => !typedAbs.has(d.path)) : [])];
    const homeRow = dirs.find((d) => d.path === home && Array.isArray(d.kids));
    if (homeRow) c.selfRoots = (homeRow.kids || []).filter((k) => k.pkg === PC.SELF_PACKAGE).map((k) => home + '/' + k.name);
    const self = { home, roots: c.selfRoots || [] };   // the last landed home row's: an unlanded one never offers the instance's own checkout
    const mounts = (restRaw && restRaw.mounts) || (r1Raws[0] && r1Raws[0].mounts) || [];
    const listing = PC.sliceListing({ home, machine: id, dirs, probes: restRaw ? restRaw.probes : [], index: fuzzy && c.index ? c.index : null, mounts, localized: (c.names && c.names.map) || {}, q: fuzzy });
    // THE REPLY NAMES WHAT IT LACKS, with this machine's own rung's keys — worked out from what the landed rest COVERS (a rest asked for
    // other folders, or joined, never passes for this ask's)
    const abs = (p) => (p === '~' ? home : p.startsWith('~/') ? home + p.slice(1) : p);
    const restDirs = new Set(restRaw ? restRaw.dirs.map((d) => d.path) : []), restProbes = new Set(restRaw ? restRaw.probes.map((x) => x.path) : []);
    const restFresh = !!restRaw && now() - r2.at <= LIST_FRESH_REMOTE_MS;
    const missList = restList.filter((p) => !home || !restDirs.has(abs(p)) || !restFresh), missProbes = probes.filter((p) => !home || !restProbes.has(abs(p)) || !restFresh);
    const probeStrings = (xs) => xs.flatMap((p) => probeAs.get(p) || [p]);
    const idxOut = !!fuzzy && !c.index;
    const typedOut = r1s.filter((t) => !(t.e && t.e.raw)).map((t) => t.p);
    const out = { suggestions: PC.legacySuggestions(listing, tx), listing, self, os: (r1Raws[0] && r1Raws[0].os) || (restRaw && restRaw.os) || '', took: Date.now() - t0,
      partial: typed.length > 0 && !r1Raws.length };   // NONE of the typed folders has a landed result (not even a kept one)
    if (typed.length && !r1Raws.length && r1s.every((t) => t.hung)) { const first = r1s.reduce((a, t) => (!a || t.hung.until < a.until ? t.hung : a), null); out.verdict = { kind: 'skipped', path: first.path, retryIn: Math.max(0, first.until - now()) }; }   // the field: «asked again in N s» — only when EVERY typed folder is hung
    const lateList = [...(r1Raws.length ? typedOut : []), ...(held ? [] : missList)];   // not covered by the landed rest, or older than its freshness
    if (held && (missList.length || missProbes.length)) Object.assign(out, { rowsUnread: true, sourcesUnread: missList, rowsHeld: true, heldFor: Math.max(0, r2.heldUntil - now()), ...(missProbes.length ? { probesLate: probeStrings(missProbes) } : {}) });
    else if (!held && missProbes.length) out.probesLate = probeStrings(missProbes);   // never marked asked by the field (B-0f3d: never «known absent»)
    if (lateList.length || idxOut) Object.assign(out, { rowsLate: true, sourcesLate: lateList });
    if (capped.length) Object.assign(out, { rowsUnread: true, rowsCapped: SLICE_TYPED_CAP, sourcesUnread: [...(out.sourcesUnread || []), ...capped] });   // past the cap: named, never dropped
    const named = errs.find((e) => e && e.code);
    if (named && !out.error) Object.assign(out, { error: String(named.message || named).slice(0, 120), ...refusalBody(named) });   // a typed ask refused BY NAME is said, kept data or not
    return out;
  }

  /** r2974: is this machine held on the release's road (its agent said its collector cannot serve)? While held, the agent is asked
   *  whether it can again — behind the answers, at most every COLLECT_STUCK_ASK_MS; its «live» ends the hold. A NEW HELLO ends the hold
   *  at once (r3015 (3): the agent restarted or its link came back — the device manager stays the same across reconnects, its hello is
   *  the link's own: a fresh collector asked anew) */
  _collectHeld(id, { dm }) {
    const m = this._collectStuck && this._collectStuck.get(id);
    if (!m) return false;
    if (m.dm !== dm || helloOf(dm) !== m.hello) { this._collectStuck.delete(id); return false; }
    const every = Number(this._collectStuckAskMs) >= 0 && this._collectStuckAskMs !== null ? Number(this._collectStuckAskMs) : COLLECT_STUCK_ASK_MS;   // (a suite's shorter one: its seam)
    if (!m.asking && Date.now() - m.askedAt >= every && typeof dm.dirCollectState === 'function') {
      m.asking = true; m.askedAt = Date.now();
      Promise.resolve().then(() => dm.dirCollectState()).then((s) => {
        if (s && s.live === true && this._collectStuck.get(id) === m) { this._collectStuck.delete(id); try { console.warn(`[hosts] the folder field on ${id}: its collector says it has a live worker again — asked there again`); } catch { } }
      }, () => { }).finally(() => { m.asking = false; });
    }
    return true;
  }
  _collectStuckMark(id, dm, e) {
    const S = (this._collectStuck = this._collectStuck || new Map());
    if (S.has(id) && S.get(id).dm === dm && S.get(id).hello === helloOf(dm)) return;
    S.set(id, { dm, hello: helloOf(dm), at: Date.now(), askedAt: Date.now(), asking: false });
    try { console.warn(`[hosts] the folder field on ${id} is served by the release's road: ${String((e && e.message) || e).slice(0, 160)} — until its agent says it has a live worker again`); } catch { }
  }

  /** r1636: the collector road to this machine, or null (the sh road): its agent CONNECTED now (a list never starts a connect), its hello
   *  saying `dir-collect`, its home absolute, not Windows (the plan is in posix paths). → { dm, info } | null */
  collectRoadOf(id) {
    const dm = typeof this.connectedDevice === 'function' ? this.connectedDevice(id) : null;
    const info = dm ? helloOf(dm) : null;
    const caps = info && Array.isArray(info.capabilities) ? info.capabilities : [];
    return caps.includes('dir-collect') && typeof info.home === 'string' && info.home.startsWith('/') && info.platform !== 'win32' && typeof dm.dirCollect === 'function' ? { dm, info } : null;
  }

  /** r1636 / r1651: THE FOLDER FIELD ON A PAIRED MACHINE — ONE trip to the line and the rows (the agent's `dir-collect`: the plan in
   *  THAT machine's paths, its home from the hello; `by` = who asked, as on the sh road), TWO for all (the page's quiet re-ask, `late`: the agent waits ≤ 1 s for the facts on
   *  their way and replies once). This hub keeps, per machine, only each index root's copy and its version: the ask names the version
   *  held and the agent answers «the same» in a few bytes; a newer one is held THERE on the ordinary reply (never in front of the line
   *  and the rows: this hub answers from the copy it has, and the page's quiet re-ask carries the new one). A Mac's display names stay
   *  on the sh road (r1651 Q1), asked once in ten minutes, behind. The marks' ends come in THAT machine's clock: rebased to this one. */
  async _dirCollected(id, { dm, info }, args, { signal = null, by = 'system:hosts' } = {}) {
    const DSL = require('./server/dir-slice.js'), PC = require('./path-candidates.js');
    const t0 = Date.now();
    const c = (this._collectCache = this._collectCache || new Map()).get(id) || { index: new Map(), names: null, namesAt: 0 };
    this._collectCache.set(id, c);
    const P = DSL.plan({ ...args, budgetMs: 450 }, info.home);
    // r2752 (c): a copy CUT at the cap is named too, by the version of the whole index it was cut from — the machine answers «the same»
    // (still cut, the rows say so) and never sends it again at every keystroke; a new walk is a new version, sent whole or cut again
    const have = {}; for (const r of P.wire.roots) { const e = c.index.get(r); if (e) have[r] = e.v; }
    // r2974 (the law above): a collect REFUSED, LATE or FAILED (the agent's bound, its error, a reply with no facts, no capability) is
    // NOT shaped here — null: the release's road answers THIS ask (dirSlice). An agent that said its collector has NO usable worker
    // (`collector-stuck`, gone) puts this machine on that road until it says it has a live worker again; one whose read is out past this
    // ask's budget (held) sends only this ask there. The person's newer ask (abort) passes on
    let F;
    try { F = await dm.dirCollect({ ...P.wire, ...(P.wire.roots.length ? { index: { have } } : {}) }, { signal, timeoutMs: 2400 }); }
    catch (e) {
      if (e && e.code === 'aborted') throw e;
      if (e && e.code === 'collector-stuck' && !(e.state && e.state.why === 'held')) this._collectStuckMark(id, dm, e);   // `held` (one read out past this ask's budget): this ask only
      return null;
    }
    const got = Date.now(), shift = got - (Number(F && F.at) || got);
    for (const a of (F && F.answers) || []) if (a && Number.isFinite(a.until)) a.until += shift;   // THAT machine's clock → this hub's
    let stale = false;
    F.index = (F.index || []).map((r, i) => {
      const root = P.wire.roots[i];
      if (!r || !r.ok) return r;
      if (r.ok.same || r.ok.held) {
        const e = c.index.get(root);
        if (!e) return { held: true };   // (a copy dropped meanwhile: a fact on its way, the late re-ask carries it)
        if (r.ok.held) stale = true;   // the copy this hub has answers now; the newer one rides the page's quiet re-ask
        return { ok: e };
      }
      c.index.set(root, { v: r.ok.v, dirs: r.ok.dirs || [], links: r.ok.links || [], partial: !!r.ok.partial, ...(r.ok.cut ? { cut: true } : {}) });
      if (c.index.size > 16) c.index.delete(c.index.keys().next().value);
      return { ok: c.index.get(root) };
    });
    if (stale) F.factsLate = true;
    // r1651 Q1: a Mac's display names (文稿 for Documents) stay on today's road — the sh script's names alone, once in ten minutes, behind
    if (info.platform === 'darwin' && Date.now() - c.namesAt > 600e3) {
      c.namesAt = Date.now();
      const DSS = require('./dir-slice-script.js');
      Promise.resolve().then(() => dm.runCmd('sh', ['-c', DSS.sliceScript({ list: [], names: true })], { timeoutMs: 6000, by }))
        .then((r) => { const raw = DSS.parseSlice(String((r && r.stdout) || '')); if (raw && raw.localized) c.names = raw.localized; }, () => { });
    }
    const out = DSL.shape(P, F, { machine: id, localized: c.names || {}, took: Date.now() - t0 });
    return { suggestions: PC.legacySuggestions(out.listing, String(args.text || '')), ...out, os: info.platform === 'darwin' ? 'Darwin' : info.platform === 'linux' ? 'Linux' : String(info.platform || '') };
  }

  /** B-24e2: does the build `version` a conversation runs on this machine DECLARE the background signal — read by the machine of its OWN program file (shared
   *  src/machine-probes.js cliLevel, behind probe-cli with `level: true` — no new op). → its answer ({state: 'read' | 'reading' | 'cut' |
   *  'none', …}) | null: an OLDER device agent ignores the flag and answers no level (the hub reads «unknown», as before — never a wait).
   *  A dropped link or the op's bound REJECTS (the asker ends its ask and asks again at a later facts read). */
  async cliLevelOf(id, version = null) {
    const dm = this.connectedDevice(id);   // round wwf11hqbh (2): A LIST NEVER STARTS A CONNECT — a machine not connected is a quiet skip
    if (!dm) return { state: 'offline' };
    const info = typeof dm.helloInfo === 'function' ? dm.helloInfo() : typeof dm.status === 'function' ? dm.status().info : null;   // (wiqep65pr (6)) the hello the link already holds — no connect() can start in a gap; memory only (wr3vak19m (1))
    const caps = info && Array.isArray(info.capabilities) ? info.capabilities : [];
    if (!caps.includes('cli-level')) return null;   // (3) an OLDER agent (it may not even answer the op): asked nothing, never a 9 s wait
    const r = await dm.probeCli(null, { level: true, version });
    const lv = r && r.facts && r.facts.claude ? r.facts.claude.level : null;
    return lv && typeof lv === 'object' && typeof lv.state === 'string' ? lv : null;
  }

  /** Backend status on a host (mirrors local /api/backend-status shape). */
  async backendStatus(id, { helper = null } = {}) {   // B-77ed: `helper` = a start's { cwd, ownFile } — its files read by the one rule
    const h = this.get(id);
    // R1: op-first (shared machine-probes via probe-cli); ssh script fallback.
    try {
      const dm = await this.deviceBounded(id, 6000);
      const r = await dm.probeCli(helper);
      const f = r?.facts;
      if (f?.claude && (!helper || typeof f.claude.startHelper === 'string')) {   // B-77ed: an agent older than the start's answer falls to the shell rung below
        return {
          claude: { installed: !!f.claude.installed, ...(f.claude.version ? { version: f.claude.version } : {}),
            loggedIn: !!f.claude.loggedIn, ...(f.claude.loginMethod ? { loginMethod: f.claude.loginMethod } : {}),
            ...(f.claude.keyHelper ? { keyHelper: true } : {}), ...(f.claude.keyHelperUnread === true ? { keyHelperUnread: true } : {}), ...(typeof f.claude.startHelper === 'string' ? { startHelper: f.claude.startHelper } : {}) },
          codex: { installed: !!f.codex.installed, ...(f.codex.version ? { version: f.codex.version } : {}), loggedIn: !!f.codex.loggedIn },
        };
      }
    } catch { }
    const probe = REMOTE_PRELUDE
      + 'for c in claude codex; do '
      + 'if command -v $c >/dev/null 2>&1; then v=$($c --version 2>/dev/null | head -1); echo "$c|yes|$v"; else echo "$c|no|"; fi; done; '
      // login state: OAuth token OR console-managed key OR an apiKeyHelper —
      // .credentials.json existence alone missed every API-key-authed machine
      // (real report: an apiKeyHelper host ran claude fine, showed "not
      // logged in"). Quoted grep patterns so a prompt-history mention (stored
      // JSON-escaped as \"…\") can't false-positive.
      + 'if grep -q accessToken "$HOME/.claude/.credentials.json" 2>/dev/null; then echo "claude-login|yes|oauth"; '
      + 'elif grep -q "\\"primaryApiKey\\"" "$HOME/.claude.json" 2>/dev/null; then echo "claude-login|yes|console-key"; '
      + 'elif [ -f "$HOME/.claude/settings.json" ] && grep -q "\\"apiKeyHelper\\"" "$HOME/.claude/settings.json" 2>/dev/null; then echo "claude-login|yes|key-helper"; '   // B-bc9f: a regular file only (a FIFO never holds the probe)
      + 'elif command -v security >/dev/null 2>&1 && security find-generic-password -s "Claude Code-credentials" >/dev/null 2>&1; then echo "claude-login|yes|keychain"; '
      + 'else echo "claude-login|no"; fi; '
      // apiKeyHelper as an INDEPENDENT flag (2.191.0, real CW-H200 mixup): the
      // CLI's real precedence puts a configured helper ABOVE OAuth (verified
      // in the 2.1.211 binary — HS() disables claude.ai auth whenever the
      // merged settings carry apiKeyHelper, valid creds or not). The elif
      // ladder above hides the helper the moment OAuth creds exist, so the
      // dialog said "logged in" while every session billed via the helper.
      + (helper ? require('./helper-fact.js').sshHelperRungFor(helper) : require('./helper-fact.js').SSH_HELPER_RUNG)   // B-bc9f: the third state on this road too («unread»); B-77ed: a start's files
      + '[ -f "$HOME/.codex/auth.json" ] && echo "codex-login|yes" || echo "codex-login|no"';
    const out = await this._hostShell(h, probe, { timeoutMs: 10000 });
    const st = { claude: {}, codex: {} };
    for (const line of out.split('\n')) {
      const [k, v, ver] = line.split('|');
      if (k === 'claude' || k === 'codex') { st[k].installed = v === 'yes'; if (ver) st[k].version = ver.trim(); }
      else if (k === 'claude-login') { st.claude.loggedIn = v === 'yes'; if (ver) st.claude.loginMethod = ver.trim(); }
      else if (k === 'claude-helper') { st.claude.keyHelper = v === 'yes'; if (v === 'unread') st.claude.keyHelperUnread = true; }
      else if (k === 'codex-login') st.codex.loggedIn = v === 'yes';
    }
    if (helper && !out.split('\n').some((l) => l.startsWith('claude-helper|'))) st.claude.keyHelperUnread = true;   // B-77ed: the start's rung always answers — no line (a cut answer) cannot be read
    return st;
  }

  // ── VibeSpace integration on the host (2.129.0, backlog B-34bb) ─────────
  // Transparency for the ~/.vibespace footprint remote sessions leave on a
  // box (the user was rightly startled finding it unannounced): what's
  // installed, whether it matches the local copies, whether the hook is
  // registered in the REMOTE's own CLI configs, and how many keeper session
  // files exist — plus explicit install/refresh + remove.

  /** The STATIC agent-tool set shipped to remotes. Readers use agentTools()
   *  (below), which appends the plugin-generated shims — the per-spawn
   *  distribution in ws-create, agentToolsStatus/installAgentTools here.
   *  Browser takeover (design-browser-takeover §4): `agent-browser` is the
   *  SHIM (the remote prelude puts ~/.vibespace/bin first, so it hides the
   *  real binary from the agent) and `vibespace-browser-verbs.js` the verb
   *  table the shipped `vibespace-browser` runs (copied at boot from
   *  src/browser-verbs.js); `vibespace-browser-stuck.js` its page-dialog words (lane browser-stuck, copied at boot from
   *  src/browser-stuck.js); `vibespace-browser-passkey.js` its passkey words (lane browser-passkey, copied at boot from
   *  src/browser-passkey.js); `vibespace-browser-read-back.js` its read-back of a fill (lane digit-zero, copied at boot from
   *  src/browser-read-back.js); `agent-cli-text.js` the ONE-text rule vibespace-msg / -channels / -ask / -task
   *  share (lane cli-one-text-arg, copied at boot from src/agent-cli-text.js); `cli-call.js` THE ONE CALL every agent CLI makes
   *  to the hub (lane cli-call-timeouts, copied at boot from src/cli-call.js); `vibespace` the PERSON'S CLI (lane human-cli — on a
   *  machine with no hub it answers «no VibeSpace hub has run here» with the door) + `vibespace-local-index.js` its PURE
   *  half (copied at boot from src/local-index.js). test-architecture §52 fails a static tool left out. */
  static AGENT_TOOLS = ['vibespace-status', 'vibespace-task', 'vibespace-ask', 'vibespace-exit', 'vibespace-remote', 'vibespace-job', 'vibespace-docs', 'vibespace-msg', 'vibespace-page', 'vibespace-design', 'vibespace-channels', 'vibespace-browser', 'vibespace-browser-verbs.js', 'vibespace-browser-stuck.js', 'vibespace-browser-passkey.js', 'vibespace-browser-read-back.js', 'agent-cli-text.js', 'cli-call.js', 'fd-close.js', 'vibespace', 'vibespace-local-index.js', 'agent-browser', 'vibespace-window', 'vibespace-app', 'vibespace-feedback', 'vibespace-vault', 'vibespace-api', 'vibespace-hook.mjs', 'vibespace-hook-register.mjs', 'vibespace-remote-keeper', 'vibespace-claude-subscription-login.mjs', 'vibespace-usage'];
  /** Plugin agent-tool shims (Plugin Ph4, 2.369.30): the loader installs a
   *  provider returning the `vibespace-tool-<plugin>-<name>` files it
   *  generates right now, so they ship to ssh hosts and dial devices with the
   *  core tools (docs/plugins.md). Default = none (no loader = no shims). */
  static extraAgentTools = () => [];
  /** THE ship list: static tools + live plugin shims (deduped, static first). */
  static agentTools() {
    let extra = [];
    try { extra = (HostManager.extraAgentTools() || []).filter((n) => typeof n === 'string' && /^vibespace-tool-[a-z0-9.-]+$/.test(n)); } catch { extra = []; }
    return [...HostManager.AGENT_TOOLS, ...extra.filter((n) => !HostManager.AGENT_TOOLS.includes(n))];
  }

  /** Integration state ON THE HOST in one ssh round trip: per-tool presence +
   *  sha256 (content compare beats mtime — the local hook/status tools are
   *  REGENERATED every server boot with identical content), hook registration
   *  (grep in the remote's own settings), node availability, keeper session
   *  files. Read-only probe. */
  async agentToolsStatus(id) {
    if (typeof this.rootFactsNow === 'function') await this.rootFactsNow();   // B-1425 (r827): the status reads the root's true facts
    const h = this.get(id);
    const agentNode = await this._agentNodeOf(h);   // B-b83c: a dial device's own node (its hello said it); none ⇒ the release's text
    const probe = REMOTE_PRELUDE
      + `for f in ${HostManager.agentTools().join(' ')}; do `
      + 'p="$HOME/.vibespace/bin/$f"; if [ -f "$p" ]; then s=$( (sha256sum "$p" 2>/dev/null || shasum -a 256 "$p" 2>/dev/null) | cut -d" " -f1 ); echo "T|$f|$s"; else echo "T|$f|"; fi; done; '
      + 'command -v node >/dev/null 2>&1 && echo "NODE|yes" || echo "NODE|no"; '
      + HostManager.hookLeftProbe(HostManager.hookClis())   // r4014 (1): THE look, over the declared rows (r4073 (3): «err» reads not known)
      + 'echo "KEEP|$(ls "$HOME/.vibespace/run" 2>/dev/null | grep -c "\\.sock$")"; '
      // CLI-CONFIG RECEIPTS (design-harness-settings §6), GATED: only a helper
      // that knows the plan env (grep for the env NAME in the shipped file) is
      // asked `--status` — an older helper would treat it as an ordinary
      // REGISTRATION RUN (a write inside a read-only probe). Otherwise the UI
      // says "not checked — reinstall the tools".
      + 'if grep -q VIBESPACE_CLI_CONFIG "$HOME/.vibespace/bin/vibespace-hook-register.mjs" 2>/dev/null; then ' + nodeFinder({ agentNode: !!agentNode })
      + `if [ -n "$VS_NODE" ]; then VIBESPACE_CLI_CONFIG=${this._cliConfigPlanB64()} "$VS_NODE" "$HOME/.vibespace/bin/vibespace-hook-register.mjs" --status 2>/dev/null; else echo "CFG|*|*|no-node"; fi; `
      + 'else echo "CFG|*|*|unknown"; fi';
    const out = await this._hostShell(h, probe, { timeoutMs: 12000, ...(agentNode ? { env: { VS_AGENT_NODE: agentNode } } : {}) });
    const st = { tools: {}, node: false, hooks: {}, keeperSessions: 0, cliConfig: parseReceiptLines(out), refused: this._ownerWriteRefusal() };
    for (const line of out.split('\n')) {
      const p = line.trim().split('|');
      if (p[0] === 'T') st.tools[p[1]] = { present: !!p[2], sha256: p[2] || null };
      else if (p[0] === 'NODE') st.node = p[1] === 'yes';
      else if (p[0] === 'HOOK') st.hooks[p[1]] = p[2] === 'yes' ? true : p[2] === 'err' ? null : false;   // r4073 (3): err = not known (null), never «not registered»
      else if (p[0] === 'KEEP') st.keeperSessions = parseInt(p[1], 10) || 0;
    }
    return st;
  }

  /** The base64 CLI-config plan for the helper's env (server.js sets
   *  `hosts.cliConfigPlanB64`); a hosts instance with no server behind it
   *  (tests, tooling) sends an empty hooks-only plan marker — never undefined
   *  in a shell line. */
  _cliConfigPlanB64() {
    try { const v = typeof this.cliConfigPlanB64 === 'function' ? this.cliConfigPlanB64() : ''; return /^[A-Za-z0-9+/=]*$/.test(v) ? v : ''; } catch { return ''; }
  }

  /** Install/refresh the tools + register the hook — the SAME tar-over-stdin
   *  channel the per-spawn distribution uses (nothing bulky/secret in argv;
   *  no token here, tokens stay strictly per-session). */
  /** THE ROOT VERDICT (src/server-root.js; server.js sets `hosts.ownerWriteRefusal`):
   *  null, or the refusal — a worktree / temp server ships the tools but runs
   *  no register helper on another machine either. No server behind it = null. */
  _ownerWriteRefusal() {
    try { return typeof this.ownerWriteRefusal === 'function' ? this.ownerWriteRefusal() : null; } catch { return null; }
  }

  /** r3064 (4): what a run's receipts say did NOT land on that machine, said once per cause — the refused or failed receipts of a
   *  CLI by their reason with their keys, a whole-run failure (the helper's own crash) by its words, a plan's hooks part the helper
   *  printed nothing of (no node there, or it stopped before its first receipt) as «not known», and the root verdict's refusal (no
   *  helper ran there). [] = every part landed. PURE. */
  /** r4014 (1): THE LOOK's LIST COMES FROM THE DECLARED ROWS — every registered harness whose descriptor names a hook file
   *  (`inject.hookFile`, the rows the tools' generators register hooks from) as [cli, its path under that machine's $HOME, quoted],
   *  read at each call: a harness added by its descriptor alone is looked at, never skipped at a Remove */
  static hookFiles() {
    const sq = (x) => `'${String(x).replace(/'/g, "'\\''")}'`;
    return require('./harnesses').list().filter((x) => x && x.inject && x.inject.hookFile && Array.isArray(x.inject.hookFile.rel)).map((x) => [String(x.id), `"$HOME"/${sq(x.inject.hookFile.rel.join('/'))}`, sq(x.id)]);
  }
  static hookClis() { return HostManager.hookFiles().map(([c]) => c); }
  /** the look at whether our marker is still in each CLI's hook file (the status probe's own lines too) → one line a CLI:
   *  HOOK|<cli>|yes (our entries still there) · no (no such file, or none of ours) · err|<why> (r4014 (2), never «gone»): why =
   *  unreadable (the file is THERE but could not be read) · dangling (the file is a link to nowhere: a volume not mounted yet) ·
   *  folder-dangling (the CLI's FOLDER is a link to nowhere, r4073 (1)) · unsearchable (its folder cannot be searched: a root-owned
   *  ~/.claude) */
  static hookLeftProbe(clis) {
    return HostManager.hookFiles().filter(([c]) => clis.includes(c)).map(([, file, q]) => `f=${file}; d="\${f%/*}"; if [ -L "$d" ] && [ ! -e "$d" ]; then v='err|folder-dangling'; elif [ ! -d "\${d%/*}" ] || [ ! -x "\${d%/*}" ]; then v='err|unsearchable'; elif [ -L "$f" ] && [ ! -e "$f" ]; then v='err|dangling'; elif [ ! -e "$f" ] && [ -d "$d" ] && [ ! -x "$d" ]; then v='err|unsearchable'; elif [ ! -e "$f" ]; then v=no; elif [ ! -r "$f" ]; then v='err|unreadable'; else grep -q vibespace-hook.mjs "$f" 2>/dev/null; v=$?; if [ "$v" = 0 ]; then v=yes; elif [ "$v" = 1 ]; then v=no; else v='err|unreadable'; fi; fi; printf 'HOOK|%s|%s\\n' ${q} "$v"; `).join('');
  }
  /** r4014 (2): the door a look that did not reply names (its words; the page words it by the code `look-no-reply`) */
  static LOOK_NO_REPLY = 'the look at that machine\'s hook files did not reply — nothing removed';
  /** r4073 (2): each cause of «err» in its TRUE words (never «is there» for a link to nowhere); the page words them by `why` */
  static LOOK_ERR_WORDS = Object.freeze({ unreadable: 'its hook file is there but could not be read', dangling: 'its hook file is a link to nowhere (a volume not mounted yet?)', 'folder-dangling': 'its folder is a link to nowhere (a volume not mounted yet?)', unsearchable: 'its folder cannot be searched', unknown: 'its hook file could not be looked at' });   // unknown: a cause this hub does not know (a newer probe) — never the «is there» words
  static installNotLanded(receipts, { refused = null, hooks = [] } = {}) {
    if (refused) return [`the hooks and CLI settings were not registered there: ${refused.line || refused.why || 'this server never writes a machine\'s CLI config'}`];
    const rs = Array.isArray(receipts) ? receipts : [], by = new Map();
    // A STATE THIS HUB DOES NOT KNOW (a newer helper's) is parsed «unknown» and is NOT counted here as failed. On the INSTALL road the
    // helper is the hub's own (it ships in the same tar just before it runs, so the states agree); on the REMOVE road the machine's
    // installed helper may be another version, so there a hooks row in an unknown state is no known strip — uninstallAgentTools looks at
    // that CLI's hook file (r3784: the choice pinned by test-cli-config-runner either way)
    for (const x of rs) {
      if (!x || (x.state !== 'error' && x.state !== 'refused')) continue;
      const k = `${x.harness || '*'}|${x.reason || x.state}`;
      if (!by.has(k)) by.set(k, { harness: x.harness, why: x.reason || x.state, keys: [] });
      if (x.key) by.get(k).keys.push(x.key);
    }
    const out = [...by.values()].map((g) => (g.harness ? `${g.harness} (${g.keys.join(', ')}): ${g.why}` : `the helper: ${g.why}`));
    if (!rs.some((x) => x && !x.harness && x.state !== 'unknown')) for (const h of hooks) if (!rs.some((x) => x && x.harness === h && x.key === 'hooks')) out.push(`${h} (hooks): not known — the helper printed nothing of them (no node on that machine, or it stopped before its first receipt)`);
    return out;
  }
  /** the harnesses whose hook entries a plan touches (the runner's own rule): a JSON file with hook events (a strip: with hooks named) */
  static hooksOfPlan(planB64, { uninstall = false } = {}) {
    const plan = decodePlan(planB64);
    return plan && Array.isArray(plan.files) ? [...new Set(plan.files.filter((f) => f && f.format === 'json' && f.hooks && (uninstall || Array.isArray(f.hooks.events))).map((f) => f.harness))] : [];
  }

  async installAgentTools(id, toolDir) {
    if (typeof this.rootFactsNow === 'function') await this.rootFactsNow();   // B-1425: the verdict on the root's true facts (server.js sets hosts.rootFactsNow)
    const refused = this._ownerWriteRefusal();
    const h = this.get(id);
    const present = HostManager.agentTools().filter((n) => { try { return fs.statSync(path.join(toolDir, n)).isFile(); } catch { return false; } });
    if (!present.length) throw new Error('no agent tools found locally');
    const { execFileSync } = require('child_process');
    const tar = execFileSync('tar', ['-c', '-C', toolDir, ...present], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
    return new Promise((resolve, reject) => {
      const child = execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--',
        'umask 077; mkdir -p "$HOME/.vibespace/bin"; tar -x -C "$HOME/.vibespace/bin"; chmod +x "$HOME/.vibespace/bin"/vibespace-* "$HOME/.vibespace/bin/agent-browser" 2>/dev/null || true; '
        + REMOTE_PRELUDE
        // POSIX node finder (2.244.4): nvm.sh sourcing only works in bash — a
        // dash login shell leaves `node` unresolvable (userN's Novita)
        + nodeFinder()
        // VIBESPACE_CLI_CONFIG (design-harness-settings §6): the base64 CLI-config
        // plan (claude cleanupPeriodDays, codex [history] persistence, …) rides
        // the register helper — the helper prints one CFG| receipt per managed
        // key and one for our hook entries per file (r2844), returned with the
        // install result and judged by installNotLanded. Shell-safe bare (base64).
        + (refused ? '' : `[ -n "$VS_NODE" ] && VIBESPACE_CLI_CONFIG=${this._cliConfigPlanB64()} "$VS_NODE" "$HOME/.vibespace/bin/vibespace-hook-register.mjs" 2>/dev/null; `)
        + 'echo VS-INSTALLED'],
        { env: this.sshEnv(), timeout: 30000 }, (err, stdout, stderr) => {
          if (err) return reject(sshRefusal(h, err, stderr, fed) || new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)));
          if (!String(stdout).includes('VS-INSTALLED')) return reject(new Error('unexpected response'));
          const cliConfig = parseReceiptLines(String(stdout));
          resolve({ installed: present, cliConfig, notLanded: HostManager.installNotLanded(cliConfig, { refused, hooks: HostManager.hooksOfPlan(this._cliConfigPlanB64()) }), ...(refused ? { refused } : {}) });
        });
      const fed = feedStdin(child, tar);
    });
  }

  /** ── CS data-plane (2.146.0): per-host DeviceManager over the ssh stdio
   *  bridge — the shared engine for the fs/discovery/transcript/usage
   *  switchovers. ALWAYS ON since the 2.175.0 graduation;
   *  connection failures surface so callers fall back to the legacy ssh path.
   *  deps.agentd = { ensureAgentdOnHost, agentdHostToken, bundlePath, version }
   *  injected by server.js after boot. ── */
  /** device() with a hard connect DEADLINE — for READ-ONLY probes and
   *  interactive surfaces (B-fa6f, userN's flapping H200 links): the
   *  connect retry ladder runs up to ~2.7 minutes, and on a lossy path where
   *  TCP opens but the ssh banner hangs (ConnectTimeout only bounds the TCP
   *  connect — verified live) every data-plane consumer sat on that ladder
   *  BEFORE reaching its own ssh fallback / error UI. The race never cancels
   *  the underlying connect — a later success still heals the cached link
   *  for everyone. Session-ESTABLISHING paths keep calling device() directly:
   *  they want the full ladder. */
  deviceBounded(id, connectMs = 6000) {
    const p = this.device(id);
    // Observe the LOSER: after the deadline wins, the underlying connect keeps
    // running (deliberate — a late success heals the cached link), but a late
    // ladder-exhausted REJECTION with no remaining handler is an
    // unhandledRejection, which crashes modern Node. One no-op catch marks it
    // handled without swallowing the race's own rejection path.
    p.catch(() => { });
    return Promise.race([
      p,
      new Promise((_, rj) => setTimeout(() => rj(new Error(`device link not responding within ${Math.round(connectMs / 1000)}s — it may be flapping; reconnection keeps retrying in the background, try again shortly`)), connectMs).unref()),
    ]);
  }

  /** THE machine handle — remote host OR this machine (device #0).
   *
   *  CS SEPARATION (2.276.0): `hostId` must be a PARAMETER, not a branch. The
   *  local daemon has been a full DeviceManager since 2.158.0 (same binary,
   *  same mux, same op surface — the transport is the ONLY difference), but it
   *  lived in a server.js variable that `device()` could not return because
   *  this method started with `this.get(id)`. So every consumer wrote
   *  `if (host) { …dm path… } else { …local path… }` — two implementations per
   *  feature, and the local twin is the one nobody exercises when they fix a
   *  remote bug (and vice versa: the remote twin is the one that silently
   *  lags). Passing a falsy id now yields device #0, so a consumer can be
   *  written ONCE and run on any machine including this one. */
  /** The cached machine handle ONLY when it is connected right now — never a connect ladder (lane C2: the desktop
   *  launch dialog's machine picker draws a row per machine and must not bootstrap an ssh host to do it). */
  connectedDevice(id) {
    if (this.isLocal(id)) return this._localDevice || null;
    const dm = this._devices?.get(id);
    try { return dm && (typeof dm.isLinked === 'function' ? dm.isLinked() : dm.status().connected) ? dm : null; } catch { return null; }   // B-24e2 follow-up: memory only (status() reads the socket's witness)
  }
  setLocalDevice(dm) { this._localDevice = dm; }
  isLocal(id) { return !id || id === 'local'; }

  async device(id) {
    if (this.isLocal(id)) {
      if (!this._localDevice) throw new Error('local device daemon is not available');
      return this._localDevice;
    }
    if (!this._devices) this._devices = new Map();
    const cached = this._devices.get(id);
    if (cached?.status().connected) return cached;
    // IN-FLIGHT DEDUP (review catch): deviceBounded abandons its race loser,
    // so without this every timed-out probe stacked ANOTHER full connect
    // ladder (fresh DeviceManager + ensureAgentdOnHost ssh + up to ~13 ssh
    // spawns) — a 5s-polling sidebar against a flapping host multiplied them.
    if (!this._deviceInflight) this._deviceInflight = new Map();
    const inflight = this._deviceInflight.get(id);
    if (inflight) return inflight;
    const p = this._deviceConnect(id);
    this._deviceInflight.set(id, p);
    p.finally(() => this._deviceInflight.delete(id)).catch(() => { });
    return p;
  }

  /** R4: every connected device pushes transcript-growth dirt (the daemon
   *  fs.watches .claude/sessions+projects and .codex/sessions). One signal,
   *  two consumers: discovery cache freshness + the push-triggered usage
   *  harvest (server wires onDeviceDirty). Idempotent per dm; the client
   *  re-arms it on reconnect. Failure is harmless — polling remains. */
  _armDirtyPush(id, dm) {
    try {
      dm.watchDiscovery(() => {
        try { this.invalidateDiscovery(id); } catch { }
        try { this.onDeviceDirty?.(id); } catch { }
      }).catch(() => { });
    // session-brain step 2 (DARK): device-side normalizer stream — consumer
    // only COMPARES until parity earns the switch. Failure harmless.
    try { dm.watchSessionEvents?.((m) => { try { this.onSessionEvents?.(id, m); } catch { } }).catch(() => { }); } catch { }
    } catch { }
    // usage-events PUSH (R4 finale): events stream in seconds-fresh; the ack
    // AFTER durable ingest commits the device cursor (two-phase). When this
    // stream is live the 60s-floor dirty-kick harvest becomes the fallback
    // rung (it stays armed — a lapsed push heals through it). Capability-
    // gated; old daemons just keep the pull path.
    try {
      let held = false, landing = []; // a chunk of this push (≤ 500 events each; the LAST carries the seq) was not made durable; r8: the chunks still landing
      dm.watchUsageEvents?.((m) => {
        try {
          const text = (m.batch || []).join('\n');
          // B-5278 (r557 (6)): the batch's left-out count is said at its ACK — once; a batch left unacked is sent again, unsaid till then
          const said = () => { if (m.seq != null && Number(m.oversize) > 0) console.warn(AC.droppedSaid((dm._machineName && dm._machineName()) || id, Math.floor(Number(m.oversize)), 'usage push')); };
          let r = this.onUsageEvents?.(id, text);
          // lane ledger-dedup-law r8: a held month's rows land on the hold's async road — the seq is acked once EVERY chunk of
          // its push has (the daemon walks again from its committed cursor: an ack is never ahead of what landed)
          if (r && typeof r.then === 'function') { landing.push(r); r = true; }
          if (r === false) held = true;
          if (m.seq != null && landing.length) { const seq = m.seq, ok = !held, w = landing; held = false; landing = []; Promise.all(w).then((rs) => { if (ok && rs.every((x) => x !== false)) { dm.ackUsageEvents(seq); said(); } }, () => { }); return; }
          if (m.seq != null) { if (held) r = false; held = false; }
          if (m.seq != null) {
            // ingest is synchronous today (ingestRemoteEvents appends + fsyncs
            // via appendFileSync) — ack only on success; a throw above leaves
            // the batch unacked and it re-emits. `false` = not every row was
            // made durable (lane ledger-dedup-law r5: usage-history `ackOf`,
            // the harvest road's own verdict — deferred, or a month's hold
            // unwritten; a pause alone acks: its rows are held): unacked,
            // the device keeps the batch
            if (r !== false) { dm.ackUsageEvents(m.seq); said(); }
          }
        } catch { held = m.seq == null; /* unacked → re-emitted → the write-time dedup keeps none of it twice */ }
      }).catch(() => { });
    } catch { }
  }

  async _deviceConnect(id) {
    if (!this.agentdDeps) throw new Error('agentd deps not wired');
    const h = this.get(id);
    // dial hosts have no ssh — the daemon is already dialed IN; drive it
    // over that live stream (deviceForDial caches per device id)
    if (h.transport === 'dial') {
      if (!this.agentdDeps.deviceForDial) throw new Error('dial transport not wired');
      const dm = await this.agentdDeps.deviceForDial(h.deviceId);
      this._devices.set(id, dm);
      this._armDirtyPush(id, dm);
      return dm;
    }
    // GRADUATED ssh host with a LIVE dial-in link (B-6640): ride the ws
    // dial stream — our own handshake/heartbeat/backpressure — instead of an
    // ssh child (banner hangs, ControlMaster staleness, per-op spawns). Any
    // failure falls straight through to the ssh path: never worse than today.
    if (h.deviceId && this.dialOnline?.(h.deviceId) && this.agentdDeps.deviceForDial) {
      try {
        const dm = await this.agentdDeps.deviceForDial(h.deviceId);
        this._devices.set(id, dm);
        this._armDirtyPush(id, dm);
        return dm;
      } catch { /* ssh fallback below */ }
    }
    await this.agentdDeps.ensureAgentdOnHost(id);
    const remoteCmd = REMOTE_PRELUDE + `exec node "$HOME/.vibespace/agentd/current/agentd.js" --stdio`;
    const { DeviceManager } = require('./agentd/client.js');
    const dm = new DeviceManager({
      dataDir: this.dataDir,
      bundlePath: this.agentdDeps.bundlePath,
      version: this.agentdDeps.version,
      transport: { kind: 'ssh', hostToken: () => this.agentdDeps.agentdHostToken(id), sshBin: 'ssh', sshArgs: this.sshArgs(h, { multiplex: true }), remoteCmd },   // asked at every connect (lane vault-e2e-password-fix-r2: LOCKED ⇒ vault_locked by name)
      log: () => {},
      // lane device-upgrade-stuck: the same door as a dial device (src/server/device-upgrade-watch.js)
      onUpgradeStuck: (from, to, info) => this.onAgentUpgrade?.('stuck', { ...(info || {}), hostKey: id, machine: h.name || id, from, to }),
      helloKey: h.deviceId ? 'dev:' + h.deviceId : 'host:' + id,   // B-0194: the update refused at each reconnect folds across these instances — ONE store with the dial road for a graduated host; host ids and device ids never share a name
      onVersionMatch: (v) => this.onAgentUpgrade?.('matched', { hostKey: id, version: v }),
      onUpgradeBegin: (from, to) => this.onAgentUpgrade?.('begun', { hostKey: id, machine: h.name || id, from, to }), // lane win-upgrade-pipe
      onAnswer: (v) => this.onAgentUpgrade?.('answered', { hostKey: id, version: v }),
      onAct: (line) => this.noteAct(id, line), // lane device-act-audit: every act sent over this link = one line of data/device-audit.jsonl
      onUpgradeRefused: (from, to, info) => this.onAgentUpgrade?.('refused', { ...(info || {}), hostKey: id, machine: h.name || id, from, to }), // lane device-bundle-signing
      onUpgradeTrusted: (from, to, info) => this.onAgentUpgrade?.('trusted', { ...(info || {}), hostKey: id, machine: h.name || id, from, to }), // fix r2: a first trust (TOFU)
      onPolicy: (p) => this.notePolicy(id, p), onElevated: (e) => this.noteElevated(id, e), machine: () => h.name || id, // lane device-allow-flags: its stated allow list; lane win-input-elevated: its own token elevation; its name in a refusal
      onRuntime: (rt) => this.noteRuntime(id, rt), // lane device-node-version: the node its agent runs on (the Machines card judges it)
      actGate: this.actGateFor(id), // lane hub-act-ask: an act nobody clicked follows the machine's Hub automation list (asks on a cluster instance)
      devicePin: () => { try { const k = this.get(id).deviceKey; return k == null ? null : (k && typeof k.pub === 'string' ? k.pub : ''); } catch { return null; } }, onDeviceKey: (ev, f) => this.noteDeviceKey(id, ev, { ...(f || {}), road: 'ssh' }), deviceProofRequired: () => { try { return !!this.get(id).deviceKeyForgotAt; } catch { return false; } }, deviceJudged: () => { try { return require('./dial-facts.js').pairingDoorOf(this.get(id)) !== 'dial-out'; } catch { return true; } }, // unit 3's cure: a machine upgraded to dial-out is judged on its dial road only // lane lg-remote-hardening (D3)
      hubIdentity: this.agentdDeps.hubIdentity || null, // D3 half b: this hub's identity (the vault's entry; a lost one said by name)
    });
    await dm.connect();
    this._devices.set(id, dm);
    this._armDirtyPush(id, dm);
    // We are now talking to this machine's daemon — but over an ssh child
    // (per-op spawns, banner hangs, ControlMaster staleness). ws is strictly
    // better once it exists, so tell the server it may graduate this machine
    // in the background. ssh stays the bootstrap + rescue channel forever.
    try { this.onSshConnected?.(id); } catch { }
    return dm;
  }

  /** M2 remote install: land the agentd bundle into ~/.vibespace/agentd/<ver>/
   *  + symlink `current`, and provision the host vsht_ token (0600) so the
   *  standing remote daemon authenticates the server's ssh-bridge connection.
   *  Bundle + token (+ the release record) ride ONE tar over ssh stdin (never argv). Idempotent.
   *  THE SSH ROAD VERIFIES TOO (lane device-bundle-signing-fix-r2, verify-r1 RED-3): it ships exactly what the dial road
   *  would push (DeviceManager.releaseOf — the bundle, and its manifest when these bytes ARE the signed release) and the
   *  host lands it through the agent ALREADY installed there (`agentd.js --land-upgrade` = the same landBundle as a dial
   *  link: signature, floor, pin — installAgentdScript). The rungs: these bytes already run there ⇒ nothing; nothing
   *  installed yet ⇒ lands as is (the owner's add-host act — the installer's trust-on-first-use; the new agent pins its
   *  baked keys at its first start); an install exists and this build is unsigned ⇒ `unsigned-local-build` (the row
   *  only); a pre-signing agent there (no --land-upgrade) ⇒ the SIGNED release lands unverified once, like every
   *  pre-signing dial device. A refusal / a first trust reach the same door; the host keeps its running agent.
   *  Not a fence against a hub that holds this host's ssh key (that is a shell already — design q-042 D6). */
  async installAgentd(id, bundlePath, version, hostToken) {
    const h = this.get(id);
    if (!fs.existsSync(bundlePath)) throw new Error('device daemon bundle missing: ' + bundlePath);
    const rel = require('./agentd/client.js').DeviceManager.releaseOf(bundlePath, String(version));
    const ver = String(rel.version || version).replace(/[^\w.-]/g, '');
    // stage a tar: agentd.js + token (+ agentd.manifest.json — the release record — when signed)
    const os2 = require('os');
    const stage = fs.mkdtempSync(path.join(os2.tmpdir(), 'vs-agentd-stage-'));
    try {
      fs.copyFileSync(bundlePath, path.join(stage, 'agentd.js'));
      fs.writeFileSync(path.join(stage, 'token'), String(hostToken), { mode: 0o600 });
      if (rel.signed) fs.writeFileSync(path.join(stage, 'agentd.manifest.json'), JSON.stringify(rel.manifest));
      // B-323e (lane bl-keys-misc, 主开发 r1351): the tar is ASYNC — it was a SYNCHRONOUS start (up to 15 s held) redone on every connect
      // while an install keeps failing (connects come from polls). B-323e's remainder (lane nl-starts): it rides the hub's STARTER — its
      // bytes cannot cross the starter's line pipe, so the archive is written into its own stage folder (`-f`, the same members) and read
      // back here, off the loop: the same bound (15 s), the same cap (32 MiB), the service env (r1381 (1)). THE ARCHIVE HOLDS THE HOST'S
      // TOKEN (主开发 r4910): it is made EMPTY AND 0600 before tar writes into it (tar keeps an existing file's mode — so no road, a failed
      // or orphaned tar included, leaves it wider), inside the stage mkdtemp made (0700), and set 0600 again before it is read back; its
      // SIZE is asked first — past the bound it is refused by name and never read into memory; the stage (the token, the
      // archive) is removed on every road (a failed tar, a failed read-back, a failed or finished ssh — the catch below; a hub that ends
      // between leaves it to the OS's own temp cleaning: nothing of ours sweeps vs-agentd-stage-, src/temp-sweepers.js). Every failure
      // fails the install BY NAME — a tar with no reply or that failed in execFile's words («Command failed: tar …» + what it said, the
      // starter's silence as itself), a read-back that failed or an empty archive as theirs — never «nothing to install»
      const tarFile = path.join(stage, 'bundle.tar'), tarArgs = ['-c', '-f', tarFile, '-C', stage, 'agentd.js', 'token', ...(rel.signed ? ['agentd.manifest.json'] : [])];
      try { await fs.promises.writeFile(tarFile, '', { mode: 0o600, flag: 'wx' }); } catch (e) { throw new Error(`the agent bundle's archive could not be made: ${(e && e.code) || (e && e.message) || e}`); }
      const tr = await require('./server/child-starter').childStarter().run('tar', tarArgs, { timeoutMs: 15000, capture: true, maxBuffer: 64 * 1024, envAdd: {} });
      if (!tr || tr.unknown || tr.timedOut || tr.overflow || tr.started === false || tr.code !== 0) {
        // the starter gave NO answer (it may have ended with its tar still running, unbounded): the catch removes the stage now, and
        // once more past the tar's own bound — a late write of an orphaned tar can keep the folder from going (its reader's find)
        if (!tr || tr.unknown) { const late = setTimeout(() => { fs.promises.rm(stage, { recursive: true, force: true }).catch(() => { }); }, 15000 + 4000); late.unref?.(); }
        const said = !tr || tr.unknown ? 'the starter gave no answer' : tr.timedOut ? 'no answer in 15000 ms' : tr.started === false ? `spawn tar ${tr.error || 'failed'}` : tr.overflow ? 'its output passed 64 KiB' : (String(tr.stderr || '').trim() || (tr.code == null ? (tr.signal ? `ended by ${tr.signal}` : `ended with no exit code${tr.error ? ` (${tr.error})` : ''}`) : `exit ${tr.code}`));
        throw Object.assign(new Error(`Command failed: tar ${tarArgs.join(' ')}\n${said}`), { code: tr && tr.started === false ? tr.error : tr ? tr.code : null });
      }
      let size = 0;
      try { await fs.promises.chmod(tarFile, 0o600); size = (await fs.promises.stat(tarFile)).size; } catch (e) { throw new Error(`the agent bundle's tar could not be read back: ${(e && e.code) || (e && e.message) || e}`); }
      if (size > 32 * 1024 * 1024) throw new RangeError(`the agent bundle's tar is ${size} bytes — past its 32 MiB bound`);   // refused unread
      if (!size) throw new Error("the agent bundle's tar is empty");
      let tar;
      try { tar = await fs.promises.readFile(tarFile); } catch (e) { throw new Error(`the agent bundle's tar could not be read back: ${(e && e.code) || (e && e.message) || e}`); }
      const remote = installAgentdScript(ver, rel.signed);
      return await new Promise((resolve, reject) => {   // awaited: a rejection inside reaches the catch below too (the stage removed — idempotent)
        const child = execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--', remote],
          { env: this.sshEnv(), timeout: 30000 }, (err, stdout, stderr) => {
            try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
            if (err) return reject(sshRefusal(h, err, stderr, fed) || new Error((stderr?.toString() || err.message || '').trim().slice(0, 300)));
            const r = installAgentdAnswer(stdout);
            if (!r) return reject(new Error('unexpected response: ' + String(stdout).slice(0, 120)));
            if (r.deferred) { console.warn(`[hosts] ${h.name || id}: its agent's update to ${ver} was deferred (${r.deferred}: ${r.why}) — it keeps running ${r.from || 'its agent'}; the next connect tries again`); return resolve({ agentdPath: '$HOME/.vibespace/agentd/current/agentd.js', ...r }); }   // B-93e7
            if (r.failed) return reject(new Error('the host could not land the agent: ' + r.failed));
            const machine = h.name || id;
            if (r.refused) { try { this.onAgentUpgrade?.('refused', { hostKey: id, machine, from: r.from, to: ver, code: r.refused, keyId: r.keyId, floor: r.floor, by: 'system:device-upgrade' }); } catch { } } // int315: lane device-act-audit's `by` for the version-drift push (ensureAgentdOnHost)
            if (r.tofu) { try { this.onAgentUpgrade?.('trusted', { hostKey: id, machine, from: r.from, to: ver, keyIds: r.tofu, by: 'system:device-upgrade' }); } catch { } }
            resolve({ agentdPath: '$HOME/.vibespace/agentd/current/agentd.js', ...r });
          });
        const fed = feedStdin(child, tar);
      });
    } catch (e) { try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}; throw e; }
  }

  /** Remove the integration: unregister the hook from the remote CLI configs
   *  (needs the register script still present — runs BEFORE the rm), then rm
   *  exactly our tool files. Per-session token files (.tok-*) and account key
   *  files are left alone (running sessions own them); NOTE a future remote
   *  session spawn re-installs everything by design (per-spawn distribution). */
  async uninstallAgentTools(id) {
    if (typeof this.rootFactsNow === 'function') await this.rootFactsNow();   // B-1425 (r827): the root's true facts first
    // an UNKNOWN root (unread, or a read that never answered) is refused BY NAME — never a half uninstall that removes the tools
    // (the register helper with them) and skips the machine's hook strip, so every hook call there would fail
    { const r = this._ownerWriteRefusal(); if (r && r.kind === 'unknown') throw Object.assign(new Error(`the agent tools were not removed: ${r.why}`), { code: 'root_unknown' }); }
    const h = this.get(id);
    const rms = HostManager.agentTools().map((n) => `"$HOME/.vibespace/bin/${n}"`).join(' ');
    // plugin shims of plugins disabled/uninstalled since the last ship are not
    // in the live list any more — the glob sweeps every generated shim
    // r3064: THE STRIP FIRST, judged by its receipts; the tools are removed only when it landed — a refused strip (a hand-broken
    // settings file) keeps the register helper and the hook script, so the entries left in the file still find their program
    let stripped = [], stripRan = false;
    // r3784, THE REMOVE ROAD's LAW IN TWO HALVES: the tools are never removed under hooks whose strip is not KNOWN to have landed, and
    // Remove is never refused for a helper's age. A CLI whose strip printed no hooks receipt in a state this hub knows (an older helper
    // is silent even when it succeeds; a newer one may print a state this hub does not know; a helper killed before it printed; no node
    // or no helper at all; a server that never writes a machine's CLI config, so it strips nothing) is LOOKED AT: our marker still in
    // its hook file ⇒ the tools are kept and that is said, by its cause; gone ⇒ the strip is known, the tools go
    // r4014 (2): UNKNOWN REMOVES NOTHING, LITERALLY — a hook file that is there but cannot be read («err») keeps the tools, said by
    // its cause; a reply that does not answer for every CLI (empty, garbage, cut) removes nothing and names its door
    const look = async (clis, cause) => {
      let out = '';
      try { out = String(await this._ssh(h, REMOTE_PRELUDE + HostManager.hookLeftProbe(clis), { timeoutMs: 15000 })); }
      catch (e) { return { ok: false, code: 'look-no-reply', notLanded: [HostManager.LOOK_NO_REPLY], error: `${HostManager.LOOK_NO_REPLY} (the tools kept): ${cause} — ${String((e && e.message) || e).split('\n')[0].slice(0, 160)}` }; }   // its read's S8: a look that hung or failed over ssh names the same door
      const said = new Map(out.split('\n').map((l) => /^HOOK\|(.+?)\|(yes|no|err)(?:\|([a-z-]+))?$/.exec(l.trim())).filter(Boolean).map((m) => [m[1], m[2] === 'err' ? 'err|' + (m[3] && Object.hasOwn(HostManager.LOOK_ERR_WORDS, m[3]) ? m[3] : m[3] ? 'unknown' : 'unreadable') : m[2]]));
      if (!clis.every((c) => said.has(c))) return { ok: false, code: 'look-no-reply', notLanded: [HostManager.LOOK_NO_REPLY], error: `${HostManager.LOOK_NO_REPLY} (the tools kept): ${cause}` };
      const left = clis.filter((c) => said.get(c) === 'yes'), unread = clis.filter((c) => String(said.get(c)).startsWith('err|')).map((c) => ({ cli: c, why: said.get(c).slice(4) }));
      if (!left.length && !unread.length) return null;
      const nl = [...left.map((c) => `${c} (hooks): still in its hook file — ${cause}`), ...unread.map((u) => `${u.cli} (hooks): ${HostManager.LOOK_ERR_WORDS[u.why]}, so whether our entries are left is not known — ${cause}`)];
      // r4073 (2): an err of its own CODE (the page words it, its causes too, in three languages) when nothing is known to be left
      return { ok: false, ...(unread.length ? { code: 'look-err', unread, left } : {}), notLanded: nl, error: `the hooks were not removed on that machine (the tools kept, so the entries left still run): ${nl.join('; ')}` };
    };
    const refusal = this._ownerWriteRefusal();
    if (!refusal) {
      const sOut = String(await this._ssh(h, REMOTE_PRELUDE + nodeFinder() + 'if [ -n "$VS_NODE" ] && [ -f "$HOME/.vibespace/bin/vibespace-hook-register.mjs" ]; then echo VS-HELPER-RAN; "$VS_NODE" "$HOME/.vibespace/bin/vibespace-hook-register.mjs" --uninstall 2>/dev/null || true; fi; echo VS-STRIPPED', { timeoutMs: 15000 }));
      if (!sOut.includes('VS-STRIPPED')) throw new Error('unexpected response');
      stripRan = sOut.includes('VS-HELPER-RAN');
      const sRecs = parseReceiptLines(sOut);
      stripped = HostManager.installNotLanded(sRecs);
      if (stripped.length) return { ok: false, notLanded: stripped, error: `the hooks were not removed on that machine (the tools kept, so the entries left still run): ${stripped.join('; ')}` };
      // r4073's follow read (M1): a hooks receipt «missing» is LOOKED at too — the helper reads a CLI folder that is a link to
      // nowhere (or one it cannot search) as «missing», so the look decides: truly absent ⇒ no (removed), else err (kept)
      const unsaid = HostManager.hookClis().filter((c) => !sRecs.some((x) => x && x.harness === c && x.key === 'hooks' && x.state !== 'unknown' && x.state !== 'missing'));
      if (unsaid.length) { const kept = await look(unsaid, stripRan ? 'the helper there said nothing this hub knows of the strip' : 'no helper ran there (no node, or its register helper is gone), so its hooks could not be stripped'); if (kept) return kept; }
    } else {
      const kept = await look(HostManager.hookClis(), `this server never writes a machine's CLI config (${refusal.why || refusal.kind}), so it strips nothing`);
      if (kept) return kept;
    }
    // r3784: the removal's OWN failure is said (the hooks are gone, the tools could not be removed), never «removed»
    // no glob: a login shell's «no match» (zsh) would drop the whole line — the shims are found by find (POSIX)
    const cmd = REMOTE_PRELUDE + `rm -f ${rms} 2>/dev/null && { [ ! -d "$HOME/.vibespace/bin" ] || find "$HOME/.vibespace/bin" -maxdepth 1 -name 'vibespace-tool-*' -exec rm -f {} + 2>/dev/null; } && echo VS-REMOVED || echo VS-NOT-REMOVED`;
    const out = String(await this._ssh(h, cmd, { timeoutMs: 15000 }));
    if (out.includes('VS-NOT-REMOVED')) return { ok: false, notLanded: [stripRan ? 'the tools: could not be removed (the hooks were removed)' : 'the tools: could not be removed'], error: stripRan ? 'the hooks were removed on that machine, but its tools could not be removed' : 'the tools on that machine could not be removed' };
    if (!out.includes('VS-REMOVED')) throw new Error('unexpected response');
    return { ok: true };
  }

  // ── In-app key generation (optional; default is the user's own ~/.ssh) ──

  keyInfo() {
    // B-48a4 (b): GET /api/hosts read the public key from the data dir at EVERY call — one synchronous read per open page per
    // exit command (measured). The facts are KEPT for the process: read once (the first ask), again only when this process
    // makes the key (generateKey reads fresh before and after); a key placed in data/ssh by hand is seen at the next start
    const priv = path.join(this._sshDir, 'id_ed25519');
    if (this._key) return { ...this._key.v };
    let v;
    try { v = { exists: true, path: priv, publicKey: fs.readFileSync(priv + '.pub', 'utf-8').trim() }; } catch { v = { exists: false, path: priv, publicKey: null }; }
    this._key = { at: Date.now(), v };
    return { ...v };
  }

  /** lane ui-needs-a-button (主开发 Q2, machines-1): THE PUBLIC HALF of the key an EXISTING ssh machine signs in with — read, never made:
   *  its own key file's `.pub`, else derived on THIS server (`ssh-keygen -y`); a machine on the default identities shows the hub user's
   *  ~/.ssh/*.pub. Never the private key's bytes, anywhere. → {ok, keys: [{publicKey, source}]} | {ok:false, code}
   *  BOUNDED (reader follow-up #3): the key path is the PERSON's (POST /api/hosts keyPath — it may sit on a hung mount), so every read
   *  is a CHILD with a 5 s bound (`head` for a .pub, `ssh-keygen -y` for the derive) and a timer of our own past it — never a
   *  threadpool read the hub waits on. `timeoutMs` = the bound (a suite shortens it). */
  /** B-2ca0 (commit 2, its read): a KEY FILE OF THIS SERVER the person named (a pasted block's IdentityFile) — can BatchMode ssh use
   *  it? ONE bounded `ssh-keygen -y -P '' -f <file>` child (it derives the public half; the private bytes stay in the child): a key
   *  with a passphrase ⇒ key-file-encrypted (BatchMode never types one: every dial would end in a bare «Permission denied»); a file
   *  it cannot read, not a private key, or no answer in the bound ⇒ key-file-unusable; a key others can read ⇒ key-file-open (ssh
   *  refuses such a key too). → { ok: true } | { ok: false, code } */
  keyFileVerdict(file, { timeoutMs = 5000 } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; clearTimeout(tm); resolve(v); };
      const tm = setTimeout(() => end({ ok: false, code: 'key-file-unusable' }), timeoutMs + 500);   // a child stuck in a mount's read: our own answer
      try {
        execFile('ssh-keygen', ['-y', '-P', '', '-f', String(file)], { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1 << 16 }, (err, out, errOut) => {
          if (!err && /^(ssh-|ecdsa-|sk-)/.test(String(out || '').trim())) return end({ ok: true });
          const f = String(file);   // its reads: ssh-keygen's own words only — never the PATH (it may say anything); only its quoted / leading forms are taken out
          const why = String(errOut || '').split(`"${f}"`).join('""').split(`'${f}'`).join("''").split(`${f}: `).join(': ');
          end({ ok: false, code: /UNPROTECTED PRIVATE KEY FILE|are too open/i.test(why) ? 'key-file-open' : /passphrase/i.test(why) ? 'key-file-encrypted' : 'key-file-unusable' });
        });
      } catch { end({ ok: false, code: 'key-file-unusable' }); }
    });
  }

  async publicKeyOf(id, { timeoutMs = 5000 } = {}) {
    const h = this.get(id);
    if (!h || h.transport === 'dial') return { ok: false, code: 'not_ssh' };
    const keyLine = (out) => { const s = String(out || '').trim().split('\n')[0] || ''; return /^(ssh-|ecdsa-|sk-)/.test(s) ? s : null; };
    // the child's answer, or null at the bound (a child stuck in a mount's read may outlive its kill: our timer answers anyway)
    const bounded = (start) => new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (done) return; done = true; clearTimeout(tm); resolve(v); };
      const tm = setTimeout(() => end(null), timeoutMs + 500);
      if (tm.unref) tm.unref();
      try { start((err, out) => end(err ? null : keyLine(out))); } catch { end(null); }
    });
    const pubOf = (file) => bounded((cb) => execFile('head', ['-n', '1', '--', file], { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1 << 16 }, cb));
    if (h.keyPath) {
      const direct = await pubOf(h.keyPath + '.pub');
      if (direct) return { ok: true, keys: [{ publicKey: direct, source: 'file' }] };
      const derived = await bounded((cb) => execFile('ssh-keygen', ['-y', '-P', '', '-f', h.keyPath], { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1 << 16 }, cb));
      return derived ? { ok: true, keys: [{ publicKey: derived, source: 'derived' }] } : { ok: false, code: 'no_key' };
    }
    const home = require('os').homedir();
    const keys = (await Promise.all(['id_ed25519', 'id_ecdsa', 'id_rsa'].map((n) => pubOf(path.join(home, '.ssh', n + '.pub'))))).filter(Boolean).map((k) => ({ publicKey: k, source: 'default' }));
    return keys.length ? { ok: true, keys } : { ok: false, code: 'no_key' };
  }

  generateKey() {
    this._key = null;   // B-48a4: a fresh read before making one (a key made outside this process since: never overwritten — ssh-keygen would ask)
    if (this.keyInfo().exists) return this.keyInfo();
    fs.mkdirSync(this._sshDir, { recursive: true, mode: 0o700 });
    return new Promise((resolve, reject) => {
      execFile('ssh-keygen', ['-t', 'ed25519', '-N', '', '-C', 'vibespace', '-f', path.join(this._sshDir, 'id_ed25519')], (err) => {
        this._key = null;   // B-48a4: the kept key facts are read again (made, or a failure left something)
        if (err) return reject(new Error('ssh-keygen failed: ' + err.message));
        resolve(this.keyInfo());
      });
    });
  }

  // ── THE SSH HOST-KEY PIN (lane lg-remote-hardening, B-7f0b — design q-042 D6): src/host-keys.js is the road; these are its
  // three acts. A pin is the PERSON's act (the routes refuse an agent's token): they see what the machine shows and confirm. ──

  /** The key the machine shows NOW: one fresh ssh over the record's own road (its port, key, tailnet name, the hub user's ssh
   *  config) with a scratch known_hosts — ssh writes the host key there at key exchange, before any login, so a refused
   *  login still shows it; no master is ridden. → [{type, key, fp}] | throws host-key-none-seen (with ssh's last line). */
  async hostKeyScan(id, { timeoutMs = 15000 } = {}) {
    const h = this.get(id);
    if (h.transport === 'dial') throw Object.assign(new Error(`"${h.name}" is a dial-out device — it has no ssh host key`), { code: 'host-key-no-ssh' });
    const bad0 = HK.nameWhy(h); // the cure's reader: Check the key now / the add flow scanned an address no pin can name
    if (bad0) throw HK.pinRefusal(h, bad0);
    const fsp = fs.promises;
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vs-hostkey-'));
    const scratch = path.join(dir, 'known_hosts');
    try {
      // the move onto 6ce6b8124 meets B-2ca0: the scan asks the machine the dials reach — an alias's own Port and User, its jump host
      const args = [...HK.scanOpts(scratch), ...SSH_BASE_OPTS, ...this._portArgs(h), ...this._tailnetOpts(h), ...jumpArgsOf(h, this._sshDir), this.dest(h), 'true'];   // B-2ca0's own words (_portArgs / dest); a jump record's hop logs in to its bastion as the first dial would — the scan's own options stay on the destination
      const said = await new Promise((resolve) => { execFile('ssh', args, { env: this.sshEnv(), timeout: timeoutMs }, (err, _out, stderr) => resolve(String(stderr || (err && err.message) || ''))); });
      const keys = HK.keysOfScan(await fsp.readFile(scratch, 'utf8').catch(() => ''));
      if (!keys.length) throw Object.assign(new Error(`${h.name} showed no ssh host key — ${(said.trim().split('\n').filter(Boolean).pop() || 'no answer').slice(0, 200)}`), { code: 'host-key-none-seen', hostId: h.id });
      return keys;
    } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }

  /** r3431: the key the record's JUMP HOST shows now — one fresh ssh to the hop itself (its user and port, the hub user's ssh
   *  config: the road its ProxyCommand dials), a scratch known_hosts, no login (the scan's own options). → [{type, key, fp}] |
   *  throws host-key-none-seen (with ssh's last line) / host-key-no-jump */
  async hopKeyScan(id, { timeoutMs = 15000 } = {}) {
    const h = this.get(id);
    const p = HK.hopOf(h);
    if (!p) throw Object.assign(new Error(`"${h.name}" has no jump host`), { code: 'host-key-no-jump', hostId: h.id });
    const fsp = fs.promises;
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vs-hostkey-'));
    const scratch = path.join(dir, 'known_hosts');
    try {
      const args = [...HK.scanOpts(scratch), ...SSH_BASE_OPTS, ...(p.user ? ['-l', p.user] : []), ...(p.port ? ['-p', p.port] : []), p.host, 'true'];
      const said = await new Promise((resolve) => { execFile('ssh', args, { env: this.sshEnv(), timeout: timeoutMs }, (err, _out, stderr) => resolve(String(stderr || (err && err.message) || ''))); });
      const keys = HK.keysOfScan(await fsp.readFile(scratch, 'utf8').catch(() => ''));
      if (!keys.length) throw Object.assign(new Error(`${h.name}'s jump host ${p.host} showed no ssh host key — ${(said.trim().split('\n').filter(Boolean).pop() || 'no answer').slice(0, 200)}`), { code: 'host-key-none-seen', hostId: h.id, jump: p.host });
      return keys;
    } finally { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }

  /** Pin what the person confirmed: the machine is asked AGAIN and only the keys it shows now whose fingerprints the person
   *  chose are kept (a key nobody was shown is never pinned). → the record's pin view | throws host-key-not-seen.
   *  r3431 (one press pins both): a fingerprint the machine does not show is looked for among its JUMP HOST's, asked of the hop
   *  again at this moment; the hop's chosen keys are pinned in the same act (a machine already pinned gets its hop alone). */
  async pinHostKeys(id, fps) {
    const want = new Set([].concat(fps || []).map((x) => String(x).trim()).filter(Boolean));
    const h0 = this.get(id);
    if (!want.size) throw Object.assign(new Error('choose the key to pin'), { code: 'host-key-none-chosen', hostId: h0.id });
    // 主开发's verdict of 2026-11-18: an address no pin line can name is refused BEFORE anything is scanned or written
    const bad = HK.nameWhy(h0);
    if (bad) throw HK.pinRefusal(h0, bad);
    // r3688 (line 814's round, must 2): A DOOR A REFUSAL NAMES CAN BE COMPLETED. A record with a jump host asks its HOP first (a fresh
    // scan into a scratch file: a changed hop key is SEEN, never refused), then the machine THROUGH the hop. A changed hop key stops that
    // machine scan (strict over the old pin file, or the hub's stale line when unpinned), so its failure is tolerated here as the dialog's
    // GET tolerates it, and the hop's chosen key is pinned alone. Every chosen key must be shown now by one of them, else NOTHING is pinned
    // and the words say whose answer is missing: the hop's own failure, the machine scan's own error, or what each shows (no half pin)
    const hop = HK.hopOf(h0);
    let hopErr = null, scanErr = null;
    const seenHop = hop ? await this.hopKeyScan(id).catch((e) => { hopErr = e; return []; }) : [];
    const seen = await this.hostKeyScan(id).catch((e) => { if (!hop) throw e; scanErr = e; return []; });
    const keep = seen.filter((k) => want.has(k.fp)), keepHop = seenHop.filter((k) => want.has(k.fp));
    const shown = new Set([...keep, ...keepHop].map((k) => k.fp));
    if ([...want].every((fp) => shown.has(fp))) return this._pinTheseKeys(id, keep.length ? keep : null, keepHop.length ? keepHop : null);
    if (hopErr) throw Object.assign(new Error(`${h0.name}'s jump host ${hop.host} did not answer, so its key could not be read now — nothing was pinned (${String((hopErr && hopErr.message) || 'no answer').slice(0, 200)})`), { code: 'host-key-jump-no-answer', hostId: h0.id, jump: hop.host, params: { name: h0.name, jump: hop.host } });
    if (scanErr) throw scanErr;
    throw Object.assign(new Error(`${h0.name} does not show the key you chose any more (it shows ${seen.map((k) => k.fp).join(', ') || 'none'}${hop ? `; its jump host ${hop.host} shows ${seenHop.map((k) => k.fp).join(', ') || 'none'}` : ''}) — look again before pinning; nothing was pinned`), { code: 'host-key-not-seen', hostId: h0.id });
  }

  /** ONE pin's tail (a confirmed scan's keys, or the keys this hub already trusts): the record, landed or undone, then its pin file
   *  and its connections. → the record's pin view */
  async _pinTheseKeys(id, keys, hopKeys = null) {
    const h = this.get(id);
    const was = { hostKeys: h.hostKeys, hostKeysAt: h.hostKeysAt, jumpHostKeys: h.jumpHostKeys, jumpHostKeysAt: h.jumpHostKeysAt };
    if (keys) { h.hostKeys = keys.map(({ type, key, fp }) => ({ type, key, fp })); h.hostKeysAt = Date.now(); }
    if (hopKeys) { h.jumpHostKeys = hopKeys.map(({ type, key, fp }) => ({ type, key, fp })); h.jumpHostKeysAt = Date.now(); }   // r3431
    this._save();
    await this._landedOrUndo(h, was, 'pinned'); // 主开发's hunt (2.369.411's hosts store writes off the loop): told «pinned» only once it landed
    // between the landed record and the pin file below, a start (a hub restart) rewrites the file FROM THE RECORD (_load's heal) —
    // the record is the truth the file follows, so the window loses nothing (small 2)
    HK.writePinFile(this._sshDir, h);
    this._dropConnections(h);
    try { this.onHostKeyPinned?.(h, 'ssh', { part: keys && hopKeys ? 'both' : hopKeys ? 'hop' : 'machine' }); } catch { }   // r3873 (4): which key a person pinned decides only its own key's For-you item
    return HK.pinView(h);
  }

  /** B-7f0b (the coordinator's r1220 (2)): ONE PRESS of a person pins the key(s) this hub ALREADY trusts for a machine — its own
   *  known_hosts lines (HK.knownKeysOf: the line ssh wrote at the first dial). No new trust and nothing asked of the machine; a
   *  record with no such line is refused BY NAME (host-key-not-known): its Host key… dialog's scan-and-confirm stays its road.
   *  Nothing pins by itself: only this press. `file` is a suite's stand-in (never a caller's word: the route passes none).
   *  r1602: the press pins only where ssh's lookup name is CERTAIN from the record itself — a record that takes its address or
   *  port from this hub's ssh configuration (viaConfig: an alias, its HostName / Port / HostKeyAlias) is refused by name
   *  (host-key-via-config) and its Host key… dialog's scan-and-confirm is its road; a record whose pin was REFUSED as unusable is
   *  refused by that pin's own words, never re-pinned from the file. */
  async pinKnownHostKeys(id, { file = null } = {}) {
    const h0 = this.get(id);
    if (h0.transport === 'dial') throw Object.assign(new Error(`${h0.name} dials out — it has no ssh host key to pin`), { code: 'host-key-no-ssh', hostId: h0.id });
    const hop = HK.hopOf(h0), needHop = !!hop && !HK.hopPinned(h0);   // r3431: ONE press pins both — the hop by its own known line
    if (HK.pinned(h0) && !needHop) return HK.pinView(h0);
    if (HK.pinned(h0)) { const hu = HK.hopUnusable(h0); if (hu) throw HK.pinRefusal(h0, hu); return this._pinKnownHop(h0, hop, file, null); }   // r3688: a hop pin that cannot be used is refused by its own words (r1602), never re-pinned from the file
    const unusable = HK.pinUnusable(h0);
    if (unusable) throw HK.pinRefusal(h0, unusable);
    const bad = HK.nameWhy(h0);
    if (bad) throw HK.pinRefusal(h0, bad);
    if (h0.viaConfig) throw Object.assign(new Error(`${h0.name} takes its address or port from this hub's ssh configuration, so the key ssh trusted for it is filed under a name the record does not hold — open its Host key… to check the key it shows now`), { code: 'host-key-via-config', hostId: h0.id, params: { name: h0.name } });
    let keys;
    try { keys = await HK.knownKeysOf(h0, { file: file || this._knownHostsFile() }); }
    catch (e) { throw Object.assign(new Error(`${h0.name}: ${e.message} — open its Host key… to check the key it shows now`), { code: e.code || 'host-key-known-unreadable', hostId: h0.id, params: { name: h0.name } }); }
    if (!keys.length) throw Object.assign(new Error(`this hub trusts no key for ${h0.name} yet — open its Host key… to check the key it shows now`), { code: 'host-key-not-known', hostId: h0.id, params: { name: h0.name } });
    return needHop ? this._pinKnownHop(h0, hop, file, keys) : this._pinTheseKeys(h0.id, keys);
  }
  /** r3431: the hop's half of the one press — the key this hub ALREADY trusts for the jump host (its own known_hosts line, under the
   *  name ssh looked the hop up by); none and nothing else to pin ⇒ host-key-not-known (the dialog's scan-and-confirm is its road);
   *  none but the machine's own keys ⇒ the machine is pinned and its row keeps saying the jump host's key is not pinned */
  async _pinKnownHop(h0, hop, file, keys) {
    // r3688 (its round's should) + r3873 (2)(3): r1602's certainty rule for the HOP as for the machine. The hop is pinned from this hub's
    // line only where ssh's lookup name is CERTAIN: `ssh -G <hop>` answered within its bound and names no configuration of its own
    // (another HostName, its Port when none was typed, or a hop of its own). A hop of this hub's configuration, or a check with no answer
    // (uncertain is never certain), leaves the HOP unpinned — its chip and its road (the dialog's scan, the hop asked itself) stay — and
    // the machine's own known key is pinned exactly as at the release; the press says what it left (`hopLeft`). Nothing else to pin ⇒
    // refused by name
    const a = await this.resolveAlias(hop.host);
    let left = !a ? 'unchecked' : (a.alias || a.proxied || (!hop.port && a.port != null && a.port !== 22)) ? 'via-config' : null;
    if (left === 'via-config' && !keys) throw Object.assign(new Error(`${h0.name}'s jump host ${hop.host} takes its address or port from this hub's ssh configuration, so the key ssh trusted for it is filed under a name the record does not hold — open its Host key… to check the key it shows now`), { code: 'host-key-via-config', hostId: h0.id, jump: hop.host, params: { name: h0.name, jump: hop.host } });
    if (left === 'unchecked' && !keys) throw Object.assign(new Error(`${h0.name}'s jump host ${hop.host}: this hub could not check which name ssh files its key under (ssh -G gave no answer in its bound) — open its Host key… to check the key it shows now`), { code: 'host-key-jump-unchecked', hostId: h0.id, jump: hop.host, params: { name: h0.name, jump: hop.host } });
    let hk = [];
    if (!left) {
      try { hk = await HK.knownKeysOf({ host: hop.host, port: hop.port }, { file: file || this._knownHostsFile() }); }
      catch (e) { if (!keys) throw Object.assign(new Error(`${h0.name}'s jump host: ${e.message} — open its Host key… to check the key it shows now`), { code: e.code || 'host-key-known-unreadable', hostId: h0.id, params: { name: h0.name } }); left = 'unreadable'; }
    }
    if (!hk.length && !keys) throw Object.assign(new Error(`this hub trusts no key for ${h0.name}'s jump host ${hop.host} yet — open its Host key… to check the key it shows now`), { code: 'host-key-not-known', hostId: h0.id, jump: hop.host, params: { name: h0.name, jump: hop.host } });
    const v = await this._pinTheseKeys(h0.id, keys, hk.length ? hk : null);
    return hk.length ? v : { ...v, hopLeft: left || 'not-known' };
  }
  /** the hub user's own known_hosts. SSH READS THE PASSWD HOME (getpwuid), whatever $HOME says, so the key a first dial trusted
   *  is in THAT home's file (test-architecture §68's reasoned site): a PATH read for its lines (knownKeysOf), never written. */
  _knownHostsFile() { return path.join(require('os').userInfo().homedir, '.ssh', 'known_hosts'); }

  /** lane lg-remote-hardening (the reader's should 8): a pin decided ⇒ no connection accepted before it rides on — the record's
   *  ControlMaster is told to exit (%C does not change with the alias) and its cached device link is rebuilt with the new options. */
  _dropConnections(h) {
    try { const a = this.sshArgs(h, { multiplex: true }); execFile('ssh', [...a.slice(0, -1), '-O', 'exit', a[a.length - 1]], { env: this.sshEnv(), timeout: 5000 }, () => { }); } catch { }
    try { this.invalidateDevice(h.id); } catch { }
  }

  /** 主开发's hunt: the hosts store writes off the loop — an act that tells a person done waits for its record to land; when it did
   *  not, the record is put back as it was (and saved so) and the act is refused BY NAME, nothing half done (no pin file, no item
   *  resolved, no «done»). A hosts without a store (a suite's stand-in) answers at once. */
  async _landedOrUndo(h, was, what) {
    // 主开发 01:11Z small (1): two presses in flight on one machine (two pins, a pin and an unpin), both refused, must never leave
    // memory on the first press's value. The machine keeps a BASE while acts are in flight: the newest value that LANDED (before
    // any, the value from before the first act in flight). An act that lands moves the base to its own value; the LAST act in
    // flight, refused, puts the base back — never a value from before an act that landed (the reader's must: an unpin landed,
    // then a pin refused, ended pinned again under a person told «pin removed»). It holds because the store writer answers in
    // CALL order (every durable() wait has the same bound from its call, and a failed write refuses every waiter at once): a
    // later act is never refused while an earlier one still waits and then lands
    const now = {}; for (const k of Object.keys(was)) now[k] = h[k]; // this act's own value (its caller set it just before, no await between)
    if (!this._actBase) this._actBase = new Map();
    let base = this._actBase.get(h.id); if (!base) { base = { was: {}, n: 0 }; this._actBase.set(h.id, base); }
    for (const [k, v] of Object.entries(was)) if (!(k in base.was)) base.was[k] = v;
    base.n++;
    let landed = true;
    try { landed = typeof this.persisted !== 'function' || await this.persisted(); if (landed) { Object.assign(base.was, now); base.landed = true; } } finally { base.n--; if (!base.n) this._actBase.delete(h.id); }
    if (landed) return;
    const w = (typeof this.whyNotDurable === 'function' && this.whyNotDurable()) || {};
    if (!base.n) {
      for (const [k, v] of Object.entries(base.was)) { if (v === undefined) delete h[k]; else h[k] = v; }
      // an act that landed meanwhile wrote the pin file from the record as it stood (it may have held this act's value): the file
      // follows the record put back, and a connection opened against it meanwhile is dropped (as a decided pin's tail does)
      if (base.landed && 'hostKeys' in base.was) {
        try { HK.writePinFile(this._sshDir, h); } catch (e) { console.warn(`[hosts] the host-key pin file of ${h.name || h.id} was not put back (${e.message})`); }
        try { this._dropConnections(h); } catch { }
      }
    }
    this._save();
    throw Object.assign(new Error(`${h.name || h.id} is NOT ${what}: hosts.json is not on disk (${w.why === 'queued' ? `queued behind ${w.ahead || 'other'} write(s)` : w.code || w.why || 'the storage did not answer'}) — nothing changed; try again in a moment`), { code: 'host-key-not-durable', hostId: h.id });
  }

  /** The pin removed: the record is dialled as before (the first key ssh meets is trusted). → the pin view. */
  async unpinHostKeys(id) {
    const h = this.get(id);
    const was = { hostKeys: h.hostKeys, hostKeysAt: h.hostKeysAt, jumpHostKeys: h.jumpHostKeys, jumpHostKeysAt: h.jumpHostKeysAt };
    delete h.hostKeys; delete h.hostKeysAt; delete h.jumpHostKeys; delete h.jumpHostKeysAt;   // r3431: the hop's pin goes with it
    this._save();
    await this._landedOrUndo(h, was, 'unpinned');
    HK.writePinFile(this._sshDir, h);
    this._dropConnections(h);
    try { this.onHostKeyPinned?.(h); } catch { }
    return HK.pinView(h);
  }

  // ── Remote session transcripts (JSONL over ssh → local cache) ──
  // The cache makes remote sessions first-class: findSessionJsonlPath scans
  // data/remote-jsonl/<hostId>/, so history load / View History / pagination /
  // search all work unchanged. Invalidation by remote size+mtime (one ssh stat
  // when fresh; stat+cat when stale). Session ids are UUIDs — no collisions.
  async fetchSessionJsonl(id, sessionId, opts = {}) { return this.fetchTranscript(id, 'claude', sessionId, opts); }
  // Does the host still run a LIVE keeper child for this claude conversation?
  // Returns the keeper sid to ATTACH to (ws create keeperSid path — never a
  // second writer), or null. One read-only probe: scan the persistence-layer
  // session metas mentioning the conversation id, keep only those whose
  // childPid (the claude process) is alive. 2.218.0 — resume host inference's
  // double-writer guard. ssh hosts scan the keeper's ~/.vibespace/run; DIAL
  // devices scan the daemon's pipe-session store (~/.vibespace/*/state/
  // sessions — the sid feeds attach-pipe-session, audit #11/#47).
  async findKeeperFor(id, conversationId) {
    if (!/^[\w-]+$/.test(conversationId)) return null;
    const h = this.get(id);
    if (!h) return null;
    const cid = JSON.stringify(conversationId);
    // ONE scan over BOTH stores, returning {sid, kind} (2.247.3): the old ssh
    // leg read only legacy ~/.vibespace/run — it never saw agentd pipe
    // sessions at all — and matching by grep-in-state-json only found RESUMED
    // spawns (the --resume arg embeds the cid); a fresh-spawned claude's
    // conversation id lives ONLY in its own lock ~/.claude/sessions/<pid>.json,
    // so the second grep leg covers those (userL's 12 orphans were all
    // invisible to the old probe for one reason or the other). kind tells the
    // consumer WHICH attach transport the sid belongs to — tagging a legacy
    // keeper sid as agentd (or vice versa) routes the adopt into a binary
    // that has never heard of it.
    const script = `scan() { for f in "$1"/*.json; do [ -e "$f" ] || continue
      grep -q '"exited"' "$f" 2>/dev/null && continue
      cpid=$(sed -n 's/.*"childPid":\\([0-9]*\\).*/\\1/p' "$f" | head -1)
      [ -n "$cpid" ] && kill -0 "$cpid" 2>/dev/null || continue
      if grep -l ${cid} "$f" >/dev/null 2>&1 || grep -l ${cid} "$HOME/.claude/sessions/$cpid.json" >/dev/null 2>&1; then echo "$2|$(basename "$f" .json)"; fi
    done; }
    for d in "$HOME"/.vibespace/*/state/sessions; do [ -d "$d" ] && scan "$d" agentd; done
    scan "$HOME/.vibespace/run" keeper`;
    try {
      // SESSION-ESTABLISHING (review catch, do not re-bound BELOW 15s): this
      // probe decides ADOPT-a-live-claude vs sweep+respawn — a deadline here
      // reads as "no live keeper" and the writer sweep then SIGTERMs the
      // healthy claude the full ladder would have adopted. 15s per the
      // documented invariant (the ssh leg was 10s, below the bar the dial
      // leg already honored — 2.271.0 audit T1-1/T1-7).
      const out = String(await this._hostShell(h, script, { timeoutMs: 15000 }) || '');
      const hits = out.trim().split('\n').map((l) => l.trim()).filter((l) => /^(agentd|keeper)\|[\w][\w-]*$/.test(l))
        .map((l) => { const [kind, sid] = l.split('|'); return { kind, sid }; });
      // newest-transport first: an agentd hit wins over a legacy keeper one
      return hits.find((x) => x.kind === 'agentd') || hits[0] || null;
    } catch (e) {
      // CRITICAL DISTINCTION (2.271.0, the sweep-kills-healthy-claude class):
      // a FAILED probe (timeout/host lag) must NOT read as "no keeper" — the
      // caller would sweep+respawn and SIGTERM the surviving claude it should
      // have adopted, corrupting the transcript with a second writer. Return a
      // distinct sentinel so every consumer can refuse-and-retry instead.
      return { error: true, reason: String(e?.message || e) };
    }
  }
  // Remote SUBAGENT transcript (2.191.0, remote workflow viewer's View Log):
  // agent-<id>.jsonl lives under <projDir>/<sid>/subagents/ (plain agents) or
  // <sid>/subagents/workflows/wf_*/ (dynamic-workflow agents) — same
  // cache/invalidation model as the session transcript.
  async fetchAgentJsonl(id, agentId, { claudeSessionId = '', maxBytes = 32 * 1024 * 1024 } = {}) {
    if (!/^[\w-]+$/.test(agentId)) throw new Error('bad agent id');
    const sidPath = claudeSessionId && /^[\w-]+$/.test(claudeSessionId)
      ? `-path ${JSON.stringify('*/' + claudeSessionId + '/subagents/*')}` : `-path '*/subagents/*'`;
    return this._fetchRemoteByFind(id, `-maxdepth 6 -name ${JSON.stringify('agent-' + agentId + '.jsonl')} ${sidPath}`,
      path.join(id, 'agents', 'agent-' + agentId + '.jsonl'), { maxBytes });
  }
  // Remote CODEX rollout (B-10ed): view-history/resume-load of a codex thread
  // that ran on the host. Cached under remote-jsonl/<host>/codex/ — the codex
  // finder (findCodexSessionJsonlPath) scans that cache like claude's.
  async fetchCodexJsonl(id, threadId, opts = {}) { return this.fetchTranscript(id, 'codex', threadId, opts); }
  /** THE remote transcript fetch (S3): the harness descriptor's store.remoteFind
   *  names where find(1) looks on the host, the predicate (codex: .jsonl OR
   *  .jsonl.zst — a compressed rollout lands under the .jsonl cache name and
   *  readers detect it by magic bytes) and the cache name; this method only
   *  runs the shared fetch-and-cache core. Unknown backends throw in get(). */
  async fetchTranscript(id, backend, sessionId, { maxBytes = null } = {}) {
    if (!/^[\w-]+$/.test(String(sessionId || ''))) throw new Error('bad session id');
    const h = require('./harnesses').get(backend || 'claude');
    if (!h.store || typeof h.store.remoteFind !== 'function') throw new Error(`${h.id} conversations cannot be fetched from a host (no remote transcript location)`);
    const rf = h.store.remoteFind(sessionId);
    const r = await this._fetchRemoteByFind(id, rf.findExpr, path.join(id, rf.cacheRel), { maxBytes: maxBytes || rf.maxBytes || 64 * 1024 * 1024, root: rf.root });
    if (typeof r === 'string' && r && typeof h.store.noteFetched === 'function') { try { h.store.noteFetched(sessionId, r); } catch { } }   // B-a60e remainder: the copy just written is known to its finder at once
    if (h.spawn?.isLocalConversation) { try { this.convIndex.note(sessionId, id, { src: 'fetch' }); } catch { } } // conversation-location index (R3 tail)
    return r;
  }
  /** APPEND A DELTA ONLY AT THE OFFSET IT WAS COMPUTED FROM (B-7638 round 4).
   *  Both rungs derive the append offset from a stat taken BEFORE the remote
   *  read; anything that moves the cache inside that window (another fetch of
   *  the same slot, a heal, an operator) makes the offset stale, and a blind
   *  `appendFileSync` then welds a DUPLICATE region onto the file — which the
   *  same poll stamps as complete. So the write re-reads the size through the
   *  fd it is about to write with, and writes POSITIONALLY: at a matching
   *  offset the write is idempotent (the same bytes land in the same place),
   *  and at a mismatching one it does not happen at all. false = "the slot
   *  moved" ⇒ the caller refetches whole (or fails loudly when a whole refetch
   *  is impossible), never splices. Extracted as a method so a test can neuter
   *  it and show the pre-fix doubling. */
  _appendDeltaAt(cachePath, offset, buf) {
    let fd, closeFailed = false;   // B-15ac follow (主开发 r831): a failed close is NO landing — false, so the caller reads the whole file again
    try {
      try { fd = fs.openSync(cachePath, 'r+'); } catch { return false; }     // no prefix to grow — whole refetch
      if (fs.fstatSync(fd).size !== offset) return false;                    // the slot moved under the delta
      // …and write the WHOLE delta: writeSync may return short on a big buffer
      // (appendFileSync loops internally; a positional write does not), and a
      // silently truncated tail is the 2.187.0 stump class one layer down.
      for (let off = 0; off < buf.length;) {
        const n = fs.writeSync(fd, buf, off, buf.length - off, offset + off);
        if (!(n > 0)) throw new Error(`short cache write at ${offset + off}`);
        off += n;
      }
    } finally { fd = FC.closeWritten(fd, `the hosts delta (${path.basename(cachePath)})`, (l) => { closeFailed = true; console.warn(`[hosts] ${l}`); }); }   // B-15ac: said, never swallowed
    return !closeFailed;
  }
  /** TERMINAL vs DEGRADABLE (B-7638 round 5). The data-plane rung's catch means
   *  "this transport did not work — try the other one", and that is right for
   *  every TRANSPORT failure. A verdict about the CACHE is not one: it is true
   *  on every rung, and degrading it handed the ssh rung the moved file to
   *  compute a fresh offset from. Extracted as a method for the usual reason:
   *  a test can neuter it and show the pre-fix silent swallow. */
  _isTerminalFetchError(e) { return !!e && e.code === SLOT_MOVED; }
  /** DID AN EARLIER RUNG WATCH THIS SLOT MOVE? (B-7638 round 5) — in-window
   *  knowledge that must not die with the rung that learned it. The slab rung
   *  can see the movement and then fail for an unrelated reason (its own whole
   *  refetch dying, the device link dropping), and the ssh rung underneath
   *  would otherwise compute a fresh offset from the moved file and splice.
   *  Neuterable like its two siblings, so each leg can be shown load-bearing
   *  on its own. */
  _slotMovedEarlier(observed) { return !!(observed && observed.moved); }
  /** IS THIS PREFIX STILL OURS? (B-7638 round 5) — the durable half of
   *  `_appendDeltaAt`'s question. That guard only sees a slot that moves DURING
   *  the remote read; one poll later the foreign bytes are simply IN the file,
   *  the offset it re-reads matches them and the append lands right behind
   *  them — right-size / wrong-bytes cache, stamped complete, served forever.
   *  So the delta rungs also ask the meta: a delta may only extend bytes THIS
   *  cache's own writers put there, i.e. the file may not hold MORE than the
   *  last fetch stamped. A SHORTER file is deliberately allowed — a positional
   *  append only ever writes at the end, so it is still a genuine prefix (a
   *  crash between the append and the meta write, a truncation), and refusing
   *  it would strand every over-cap slot that ever crashed mid-write. A meta
   *  without a usable size is not a prefix claim at all ⇒ whole refetch.
   *  Extracted as a method for the same reason `_appendDeltaAt` is: a test can
   *  neuter it and show the pre-fix seal. */
  _prefixIsOurs(localSize, meta) { return localSize <= stampedSizeOf(meta); }   // NaN ⇒ false ⇒ whole refetch
  /** IS THIS STILL THE FILE WE MEASURED? (B-7638 round 7 — the round-6 verify's
   *  third finding). The over-stamp heal compares the cache's [stamp, EOF)
   *  against the remote's own bytes, and BOTH sides of that comparison were
   *  taken at different times: `localSize` comes from a stat before the remote
   *  round trip, the local bytes are read after it. A slot that shrinks in
   *  between (a truncation, a non-atomic writer, an operator repairing it)
   *  hands back a short — or entirely different — region, and comparing THAT
   *  against the remote yields a mismatch which is a fact about the race, not
   *  about the bytes: the pre-fix code called it 'foreign' ("the bytes past
   *  that point were CHECKED against the remote: they are not its own") and
   *  MEMOIZED that verdict for ten minutes, so one transient shrink condemned
   *  a perfectly healthy over-cap slot until the memo expired. A slot that
   *  changed under the probe is the MOVED class instead: terminal for this
   *  poll, remembered by nobody. Extracted as a method for the usual reason —
   *  a test can neuter it and show the pre-fix mis-diagnosis. */
  _healGapIsStillOurs(cachePath, localSize, localGap, gap) {
    if (!Buffer.isBuffer(localGap) || localGap.length < gap) return false;      // the region we judged is no longer readable
    try { return fs.statSync(cachePath).size === localSize; } catch { return false; }
  }
  /** …AND THE ONE SHAPE THAT RULE MUST NOT CONDEMN (B-7638 round 6). A cache
   *  LONGER than its stamp is the corruption above — EXCEPT when the stamp
   *  itself was short, which is exactly what the whole `cat` rung produced
   *  before round 5: it stamped the PROBE's stat while `cat` handed back the
   *  bytes the live transcript had grown to since. Over the cap that shape has
   *  no whole refetch to fall back on, so every over-cap slot last written by
   *  that code — a stopped remote thread that opened yesterday — would fail
   *  forever on a rule written for a corruption it does not have. This is the
   *  precondition of the ONE-TIME heal: a slot whose meta predates the marker
   *  every writer now stamps (`sizeExact` = "meta.size is the file's real byte
   *  length"), holding more bytes than that meta claims. A meta WITH the marker
   *  is never healed — those writers cannot over-stamp, so a longer file there
   *  is genuinely foreign and round 5's refusal stands. Neuterable like its
   *  siblings, so the pre-fix permanent failure can be shown. */
  _overStampedLegacySlot(localSize, meta) {
    const stamped = stampedSizeOf(meta);
    return !!meta && meta.sizeExact !== true && Number.isFinite(stamped) && localSize > stamped;
  }
  /** ≤1 DEGRADE LINE PER HOST **PER FAULT** PER MINUTE (B-7638 round 6; the
   *  key is round 7's). Round 5 made the data-plane fallback speak (repo law:
   *  what a catch swallows, it names) — but the thing it degrades on is usually
   *  PERSISTENT (a device link that is down stays down), and every session
   *  poll, every window attach and every goal-sync tick fetches transcripts. A
   *  line per fetch buries the journal in one repeating sentence, which is a
   *  different way of saying nothing. So the FIRST fault in each window is
   *  printed verbatim, with a count of what the window suppressed carried onto
   *  the next one (a suppressed fault is not a forgotten fault).
   *  ROUND 7 — "similar" has to MEAN similar. Round 6 keyed the window on the
   *  host alone, so the first fault held the whole minute and a DIFFERENT fault
   *  on that host inside it (the gap probe dying while the link flaps, a free
   *  identifier an extraction left behind — the 2.340.2 class this line exists
   *  to expose) was dropped into a "+N similar" tally that names nothing: the
   *  rate limiter became the silent catch it replaced. The window is therefore
   *  keyed on the host AND the message's CLASS — the same sentence with its
   *  offsets/sizes/ids blanked — so each distinct fault speaks once a minute
   *  and only genuine repeats are counted. */
  _degradeClassKey(id, msg) {
    return id + '\u0000' + String(msg == null ? '' : msg)
      .replace(/0x[0-9a-fA-F]+/g, '#')       // hex offsets
      .replace(/\d+/g, '#')                  // byte offsets, sizes, pids, ports, clock values
      .replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  _warnDegradeOnce(id, msg, nowMs = Date.now()) {
    const seen = (this._degradeWarnAt ||= new Map());
    const key = this._degradeClassKey(id, msg);
    const st = seen.get(key) || { at: 0, n: 0 };
    if (nowMs - st.at < 60000) { seen.set(key, { at: st.at, n: st.n + 1 }); return false; }
    // the map is a rate limiter, not a log: a fault class nobody has seen in
    // ten minutes carries no count worth reporting, so it is dropped rather
    // than kept forever (one entry per distinct fault per host otherwise).
    if (seen.size > 500) for (const [k, v] of seen) if (nowMs - v.at >= 600000) seen.delete(k);
    seen.set(key, { at: nowMs, n: 0 });
    console.warn(msg + (st.n ? ` (+${st.n} similar suppressed in the last minute)` : ''));
    return true;
  }
  // ONE FETCH PER CACHE SLOT AT A TIME (B-7638 round 4). The delta rungs are
  // read-then-append against a size measured before the read, so two
  // OVERLAPPING fetches of the same slot — the session poll and a user opening
  // the window, two clients, goal-sync and an attach — each computed the same
  // offset from the same stat and each appended the same tail: the cache grew
  // a duplicated region, and once the remote passed the doubled size the next
  // delta stamped the spliced file COMPLETE. A stopped conversation never
  // changes again, so it then served duplicated (and, past the doubled point,
  // missing) records forever. The slot is the shared mutable resource, so the
  // slot is what gets serialized: a second caller awaits the FIRST caller's
  // verdict instead of racing it (one remote read, one append). Every caller
  // resolves its cap from the same harness descriptor, so a coalesced caller
  // cannot lose a cap it needed — and the next poll re-decides with its own.
  async _fetchRemoteByFind(id, findExpr, cacheRel, opts = {}) {
    const slot = path.join(this.dataDir, 'remote-jsonl', cacheRel);
    const inflight = (this._slotFetches ||= new Map());
    const cur = inflight.get(slot);
    if (cur) return cur;
    const run = this._fetchRemoteByFindOnce(id, findExpr, cacheRel, opts);   // async ⇒ rejects, never throws synchronously
    inflight.set(slot, run);
    const clear = () => { if (inflight.get(slot) === run) inflight.delete(slot); };
    run.then(clear, clear);
    return run;
  }
  // Shared fetch-and-cache core (generalized from fetchSessionJsonl 2.191.0 —
  // findExpr = the find(1) predicate under "$HOME"/.claude/projects; cacheRel
  // = path under data/remote-jsonl/). All the 2.187.0/2.188.1 integrity
  // invariants live HERE: count-gated reads, never stamp meta for bytes not
  // received, cache-valid requires the FILE to hold meta.size bytes. Reached
  // ONLY through the single-flight wrapper above — one writer per slot.
  async _fetchRemoteByFindOnce(id, findExpr, cacheRel, { maxBytes = 64 * 1024 * 1024, root = '"$HOME"/.claude/projects' } = {}) {
    const h = this.get(id);
    const cachePath = path.join(this.dataDir, 'remote-jsonl', cacheRel);
    // Known-unreachable host memo (2.218.0, real report): with the host DOWN,
    // every window's view-only attach ate a full ssh connect timeout (~15s)
    // before the stale-cache fallback kicked in — a desktop of 3 such windows
    // read as "blank/gone". After one timeout, serve the cache instantly for
    // 60s instead of re-probing per request.
    if (Date.now() < (this._hostDownUntil?.get(id) || 0) && fs.existsSync(cachePath)) return cachePath;
    const metaPath = cachePath + '.meta';
    let meta = null;
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
    // ONE CACHE SLOT, MANY REMOTE FILES (2.369.x, codex .zst). A backend's
    // remoteFind predicate may resolve DIFFERENT files across polls — codex
    // matches `rollout-*<tid>.jsonl` OR `….jsonl.zst`, and the host compresses
    // a finished rollout — while the slot is keyed by conversation id only.
    // The meta recorded {size,mtime} alone, so the append-only delta path
    // happily concatenated the compressed file's bytes onto the cached PLAIN
    // prefix (or vice versa) and stamped the result complete; a stopped thread
    // never changes again, so the corrupt transcript was served forever. The
    // meta now records the resolved remote path + whether it is compressed:
    // a changed path invalidates the slot (full refetch), and a compressed
    // remote (or an already-compressed cache file) is NEVER delta-appended —
    // recompression rewrites the whole file, it does not append plain bytes.
    // HEALING A SLOT THE PRE-FIX CODE ALREADY CORRUPTED (same batch, review
    // follow-up): provenance only protects slots THIS code wrote. A meta
    // stamped before the field exists carries no remotePath, and reading that
    // as "same file" is vacuously true — so an ALREADY spliced cache (plain
    // prefix + the twin's bytes, stamped complete) kept passing the size/mtime
    // short-circuit and was served forever, because a stopped thread never
    // changes again. A meta WITHOUT provenance is therefore NOT valid: refetch
    // whole once and rewrite it. And never take the meta's word about the
    // BYTES either — a hybrid is visible in the file itself: the head tells
    // plain from compressed, and an append always lands its foreign bytes at
    // the TAIL. A plain transcript is UTF-8 JSON text, so neither marker can
    // occur there legitimately: a raw NUL is invalid JSON (it must be escaped),
    // and the frame magic's first two bytes `28 b5` are invalid UTF-8 (0xb5 is
    // a continuation byte and '(' is not a lead byte) — no false positives, and
    // a false one would only cost one refetch anyway.
    const readCacheAt = (pos, len) => {
      let fd;
      try {
        fd = fs.openSync(cachePath, 'r');
        const b = Buffer.alloc(len);
        const n = fs.readSync(fd, b, 0, len, pos);
        return b.subarray(0, Math.max(0, n));
      } catch { return Buffer.alloc(0); } finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { } } }
    };
    const cacheIsCompressed = () => isZstBuffer(readCacheAt(0, 4));
    const spliceMarkers = (buf) => buf.includes(0x00) || buf.indexOf(ZSTD_MAGIC) >= 0;
    // The splice markers are looked for in the TAIL, because an append lands
    // its foreign bytes there. ONE decision outlives that window: the over-cap
    // ADOPTION below keeps bytes this code never fetched, and a slot the
    // pre-fix delta path spliced and then kept appending to has the marker
    // BURIED under the later appends — invisible to a 4KB tail read. So the
    // adoption (and only the adoption, it is paid once per slot) scans the
    // WHOLE file: chunked, with a 3-byte carry so a magic split across a
    // chunk boundary is still seen.
    // …and it answers in THREE states (round 7): true = scanned clean, false =
    // a marker is in there (a verdict about the bytes), null = the file could
    // not be read at all — which is not a verdict about anything. The caller
    // refuses this poll either way, but only a VERDICT is remembered: a
    // transient EMFILE must not freeze a healthy slot for ten minutes (the
    // same line the heal draws between 'unverified' and a refusal).
    const wholeCacheOk = (csize) => {
      const CH = 1 << 20;
      let fd;
      try {
        fd = fs.openSync(cachePath, 'r');
        const buf = Buffer.alloc(CH + 3);        // [0,3) = the previous window's last 3 bytes
        let pos = 0, carryLen = 0;
        while (pos < csize) {
          const n = fs.readSync(fd, buf, 3, Math.min(CH, csize - pos), pos);
          if (n <= 0) return null;                                        // unreadable ⇒ cannot verify
          const win = buf.subarray(3 - carryLen, 3 + n);
          if (spliceMarkers(win)) return false;
          pos += n;
          carryLen = Math.min(3, win.length);
          win.subarray(win.length - carryLen).copy(buf, 3 - carryLen);
        }
        return true;
      } catch { return null; } finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch { } } }
    };
    // ONE WHOLE-FILE SCAN PER SLOT — not one per RUNG per POLL (B-7638 round
    // 7, the round-6 verify's finding). The scan above is a synchronous read of
    // the entire cache file on the event loop, and the shipped shape paid for
    // it twice in a single poll (the slab rung's `cacheUsable`, then the ssh
    // rung's after the fallback — plus the heal's own, on a meta the version
    // marker calls current) and again on EVERY poll, because the slots that
    // need it are exactly the ones that REFUSE: a refused poll leaves the meta
    // byte-identical by design, so nothing ever retires the legacy marker and
    // a 64 MB slot was re-read on every session poll, attach and goal-sync
    // tick, forever. The verdict is a statement about BYTES, so it is memoized
    // against the bytes it was made on — the cache file's identity (inode,
    // size, mtime): our own writers all change size or mtime (and drop the
    // entry outright), and anything that rewrites the slot behind us
    // invalidates it the same way. TTL'd so a slot nobody touches re-verifies
    // eventually rather than being trusted from memory forever.
    const scanMemo = (this._deepScanMemo ||= new Map());
    const dropScanMemo = () => { scanMemo.delete(cachePath); };
    const deepCacheOk = (stt) => {
      const key = `${stt.ino}:${stt.size}:${stt.mtimeMs}`;
      const hit = scanMemo.get(cachePath);
      if (hit && hit.key === key && Date.now() - hit.at < 600000) return hit.ok;
      const ok = wholeCacheOk(stt.size);
      if (ok === null) return false;                                      // no verdict to remember — refuse this poll, ask again on the next
      if (scanMemo.size > 500) for (const [k, v] of scanMemo) if (Date.now() - v.at >= 600000) scanMemo.delete(k);
      scanMemo.set(cachePath, { key, ok, at: Date.now() });
      return ok;
    };
    const cacheBytesOk = (remotePath, { deep = false } = {}) => {
      let stt = null;
      try { stt = fs.statSync(cachePath); } catch { return false; }
      const csize = stt.size;
      const head = readCacheAt(0, 4);
      const zstRemote = isZstPath(remotePath);
      if (head.length >= 4) {
        if (isZstBuffer(head) !== zstRemote) return false;                // the other twin's bytes are in the slot
        if (zstRemote) return true;                                       // compressed: the magic IS the evidence
      } else if (zstRemote) {
        return false;                                                     // a zstd frame is never shorter than its 4-byte magic
      }
      // A cache SHORTER than the magic cannot be judged BY the magic — but it
      // also cannot BE a compressed frame nor hide a splice, and an empty or
      // one-tiny-record transcript is perfectly legitimate. Reading that as
      // "unverifiable ⇒ refetch" re-pulled every such transcript on EVERY poll
      // forever (the check below still applies to whatever bytes exist).
      if (head.length && /\.jsonl$/i.test(cachePath) && head[0] !== 0x7b && head[0] !== 0x5b) return false; // a JSONL cache starts with a record
      if (deep) return deepCacheOk(stt);
      const tail = readCacheAt(Math.max(0, csize - 4096), Math.min(4096, csize));
      return !spliceMarkers(tail);
    };
    // A pre-provenance meta heals by ONE whole refetch. The single exception:
    // a remote grown past maxBytes cannot be refetched whole at all (the delta
    // path is how such a slot got there), and failing "too large" on a
    // transcript that worked yesterday is a worse answer than the byte check —
    // there, a verified cache adopts the provenance we just resolved.
    const sameRemote = (remotePath) => !!meta && meta.remotePath === remotePath;
    const adopting = (remotePath, size) => !sameRemote(remotePath) && !!meta && !meta.remotePath && size > maxBytes;
    // WHICH SLOTS OWE WHOLE-FILE EVIDENCE (review round 2). Provenance alone is
    // not proof the bytes were ever deep-checked: the tail-only adoption that
    // shipped before this fix ADOPTED a buried hybrid and then let the delta
    // path stamp remotePath onto it, so `sameRemote` is true for exactly the
    // corruption this scan exists to find. A meta is trusted on the cheap tail
    // check only once it carries the schema marker every writer below stamps —
    // i.e. once THIS code verified (or fetched) the bytes. Older metas pay for
    // one whole-file scan the first time their bytes are trusted, and are
    // re-stamped so it is paid ONCE per slot, never per poll.
    const META_V = 2;
    const legacyMeta = () => !!meta && !(Number(meta.v) >= META_V);
    // …and a SECOND marker, orthogonal to the schema version (round 6): does
    // meta.size mean "the file's real byte length"? Every writer below stamps
    // what the slot ACTUALLY holds, so from here on it always does — but the
    // whole `cat` rung stamped the probe's stat until round 5, and a v:2 meta
    // it wrote is indistinguishable from a current one by version alone. The
    // marker is what makes the over-stamp heal ONE-TIME (and, once stamped,
    // makes round 5's "grow only what we stamped" absolute again).
    const exactMeta = () => !!meta && meta.sizeExact === true;
    const provenanceOk = (remotePath, size) => sameRemote(remotePath) || adopting(remotePath, size);
    const cacheUsable = (remotePath, size) => provenanceOk(remotePath, size)   // cheap verdict first — the deep scan only runs on bytes we might actually trust
      && cacheBytesOk(remotePath, { deep: legacyMeta() });
    // …and the verification is RECORDED before we hand the cache back. Without
    // the stamp the slot stays legacy forever and every later poll re-runs the
    // whole-file scan. `adopted` additionally marks bytes we VERIFIED rather
    // than fetched (the over-cap exception), for anyone reading the meta later.
    const stampVerified = (remotePath, size, mtime) => {
      const adopt = !sameRemote(remotePath);
      if (!adopt && !legacyMeta() && exactMeta()) return;                   // already ours, already current-schema, already an exact-size claim
      try {
        // the short-circuit that got here compared meta.size, the remote size
        // AND the file's own size, so stamping `sizeExact` is a verified fact,
        // not a promise — and it shrinks the marker-less population (the only
        // one the over-stamp heal can ever run on) by one slot per poll.
        meta = { ...(meta || {}), size, mtime, fetchedAt: Date.now(), remotePath, compressed: isZstPath(remotePath), v: META_V, sizeExact: true, ...(adopt ? { adopted: true } : {}) };
        fs.writeFileSync(metaPath, JSON.stringify(meta));
      } catch { }
    };
    // PROVENANCE IS DURABLE — SO THE META WRITERS MUST NOT REBUILD IT (review
    // round 3). Both rungs stamped a FRESH object at the end of a fetch, so a
    // delta that grew an ADOPTED over-cap slot erased the one marker saying
    // "these bytes were VERIFIED, never fetched" (and the `slab` lane marker
    // with it) — exactly the durability the adoption note above claims. The
    // prior meta is spread and this fetch overwrites only what it just
    // learned. A WHOLE refetch is the single case that legitimately drops
    // those two: they describe bytes that are no longer in the slot, while a
    // delta keeps the prefix they were stamped for.
    const nextMeta = (fields, { whole }) => {
      const m = { ...(meta || {}) };
      if (whole) { delete m.adopted; delete m.slab; delete m.healedStampAt; }   // …and the heal record: it describes bytes that are no longer in the slot
      // `sizeExact` is stamped by BOTH rungs unconditionally because both of
      // them now pass the bytes the file actually holds (the slab rung's reads
      // are length-checked; the ssh rung stamps buf.length / localSize+delta).
      return { ...m, ...fields, fetchedAt: Date.now(), compressed: isZstPath(fields.remotePath), v: META_V, sizeExact: true };
    };
    // GROW ONLY WHAT WE STAMPED (B-7638 round 5). `_appendDeltaAt` catches a
    // slot that moves DURING the remote read; the same movement one poll
    // EARLIER is invisible to it — the foreign bytes are already in the file,
    // so the offset it re-reads matches and the append lands right after them,
    // and the stamp then says COMPLETE with the remote's bytes for that region
    // missing forever. The durable form of the same question is asked of the
    // meta instead of the clock: a delta may only extend bytes THIS cache's
    // own writers put there, i.e. the file may not hold MORE than the last
    // fetch stamped. Larger = something appended behind our back (the exact
    // corruption); smaller is left alone deliberately — a positional append
    // only ever writes at the end, so a short file is still a genuine prefix
    // (a crash between the append and the meta write, or a truncation), and
    // refusing it would strand every over-cap slot that ever crashed mid-write.
    const stampedSize = () => stampedSizeOf(meta);                       // for the refusal's own words — the DECISION is _prefixIsOurs
    const heldStampedBytes = (localSize) => this._prefixIsOurs(localSize, meta);
    // ONE-TIME SELF-HEAL FOR A SLOT THE OLD WHOLE `cat` OVER-STAMPED (B-7638
    // round 6 — the round-5 verify's finding). The rule above is right about
    // the corruption it was written for and wrong about one INNOCENT shape it
    // cannot tell apart: until round 5 the whole `cat` rung stamped the
    // PROBE's stat while `cat` returned everything the live transcript had
    // grown to since, leaving meta.size < the file's real length on a
    // perfectly healthy fetch. Under the cap that costs one whole re-pull and
    // heals; OVER the cap there is no whole re-pull, so those slots — remote
    // stopped threads that opened yesterday — would fail FOREVER on a rule
    // meant for foreign bytes they do not have.
    // Size alone cannot separate "our stamp was short" from "someone appended
    // clean-looking bytes", so we ask the only witness that can: THE REMOTE.
    // The bytes past the stamp are read back (a BOUNDED read of just the gap)
    // and compared byte-for-byte with what the cache holds there. Equal ⇒ the
    // cache is a genuine prefix and the stamp was merely short ⇒ re-stamp it
    // once, with the marker, and the delta rides again. Not equal ⇒ this IS
    // the round-5 corruption and the refusal stands. A local splice scan alone
    // would NOT do: the reported corruption's foreign bytes are ordinary text
    // (⑥g/E2 in the suite), so only the remote can falsify them.
    // Bounded three ways so it can never become a per-poll cost or a way
    // around round 5: only over the cap (under it the remedy is a whole
    // refetch), only for metas without the `sizeExact` marker (a round-5+
    // writer cannot over-stamp), and once per slot (the re-stamp ends it).
    let healVerdict = 'skip';
    const healOverStamp = async (remotePath, localSize, size, { usable, readRemote }) => {
      healVerdict = 'skip';
      // A REFUSAL IS REMEMBERED, NEVER STAMPED (round 6). The disk invariant is
      // that a refused poll leaves cache AND meta byte-identical (stamping a
      // slot we would not serve freezes the corruption in), so the verdict is
      // memoized IN MEMORY, per slot: the local whole-file scan and the remote
      // gap read are paid once, not once per poll on a slot that is broken
      // forever — and, like `observed.moved`, what one rung learned reaches the
      // next one instead of dying with it.
      const refusedAt = (this._healRefusedAt ||= new Map());
      // …and the memo carries the VERDICT, not just the fact of one: the
      // refusal it replays has to give the same diagnosis it gave the first
      // time (a message that changes with the cache state is a message the
      // reader cannot use).
      const refuse = (why) => { refusedAt.set(cachePath, { at: Date.now(), why, size: localSize }); return (healVerdict = why); };
      if (!usable || !(size > maxBytes)) return healVerdict;                    // under the cap a whole refetch is the remedy — nothing to adopt
      if (!this._overStampedLegacySlot(localSize, meta)) return healVerdict;
      // …and it is a statement about the FILE it was made on: a slot whose
      // size has changed since (an operator repaired it, a later poll grew it)
      // is judged again rather than serving a verdict about bytes that are gone.
      const memo = refusedAt.get(cachePath);
      if (memo && memo.size === localSize && Date.now() - memo.at < 600000) return (healVerdict = memo.why);
      // …and a slot a rung WATCHED move in this very window is never a heal
      // candidate: we already know where those bytes came from, so asking the
      // remote about them is a round trip whose answer we have (round 5's leg
      // (ii), through its single reader).
      if (this._slotMovedEarlier(observed)) return refuse('moved');
      const stamped = stampedSizeOf(meta), gap = localSize - stamped;
      if (localSize > size || gap > maxBytes) return refuse('unbounded');       // longer than the remote / a gap we cannot bound: not a prefix we can prove
      // the local evidence first (it is free): a slot carrying a splice marker
      // anywhere is not healed no matter what the gap compares to. "Free" is
      // now literal (round 7): the scan asks the same memoized verdict
      // `cacheUsable` already asked this poll, on the same bytes, so the heal
      // can state the check outright instead of inferring from a `deepDone`
      // flag whether some earlier caller happened to have run it.
      if (!cacheBytesOk(remotePath, { deep: true })) return refuse('spliced');
      let remoteGap = null;
      try { remoteGap = await readRemote(stamped, gap); } catch (e) {
        this._warnDegradeOnce(id, `[hosts] ${id}: could not read the remote's [${stamped},${localSize}) to check an over-stamped cache slot (${e && e.message || e})`);
        return (healVerdict = 'unverified');                                    // a TRANSPORT failure — retry next poll, never adopt on faith
      }
      if (!Buffer.isBuffer(remoteGap) || remoteGap.length < gap) return (healVerdict = 'unverified');
      // …and the comparison must be about THE FILE WE MEASURED (round 7).
      // `localSize` was stat'd before the remote round trip; a slot that
      // changes inside that window — a truncation, an operator repairing it,
      // anything writing the slot — makes `readCacheAt` hand back a different
      // (or short) region, and comparing THAT against the remote produces a
      // mismatch which is a fact about the race, not about the bytes. Calling
      // it 'foreign' would both mis-diagnose it and MEMOIZE a proven-corruption
      // verdict for ten minutes about a file that no longer exists. A slot
      // that shifted under the probe is the MOVED class: terminal for this
      // poll (nothing is adopted), remembered by nobody, re-judged next poll.
      const localGap = readCacheAt(stamped, gap);
      if (!this._healGapIsStillOurs(cachePath, localSize, localGap, gap)) return (healVerdict = 'shifted');
      if (!remoteGap.subarray(0, gap).equals(localGap)) return refuse('foreign');
      try {
        meta = { ...meta, size: localSize, sizeExact: true, healedStampAt: Date.now(), v: META_V };
        fs.writeFileSync(metaPath, JSON.stringify(meta));
      } catch (e) { return (healVerdict = 'unverified'); }
      refusedAt.delete(cachePath);
      console.warn(`[hosts] ${id}: over-stamped cache slot healed — the ${gap} bytes past the stamped ${stamped} are the remote's own, meta re-stamped at ${localSize}`);
      return (healVerdict = 'healed');
    };
    // …and what the heal LEARNED goes into the refusal — but ONLY what that
    // verdict actually established. "It grew outside our writers", "…and the
    // remote says those are not its bytes", "…and it carries a splice marker"
    // and "…and the remote could not be asked (retryable)" are four different
    // facts, and a refusal that claims the check it skipped is the "an error
    // string is not a diagnosis" law with the sign flipped.
    const HEAL_NOTES = {
      spliced: ', and it carries a splice marker (bytes from another file, or an older spliced append), so those bytes cannot be adopted either',
      foreign: ', and the bytes past that point were CHECKED against the remote: they are not its own',
      moved: ', and this poll watched the slot move — those bytes came from outside this cache',
      shifted: ', and the cached file changed size while those bytes were being checked, so nothing was compared (retryable on the next poll)',
      unverified: ', and the remote could not be read to check whether those bytes are its own (retryable on the next poll)',
    };
    const healNote = () => HEAL_NOTES[healVerdict] || '';
    // …and when a whole refetch is BOTH impossible (over the cap) and the only
    // way out (the cache cannot be grown), say so — naming WHICH fault, and
    // including that there is no remedy on this side. "remote transcript too
    // large" alone sends the reader diagnosing a size problem on a slot whose
    // real fault is spliced (or foreign-appended) bytes; an error string is not
    // a diagnosis, and neither is advice that cannot work (this suffix is
    // reachable ONLY when the remote is past the cap, so deleting the cache
    // just destroys the last copy and fails identically).
    const cacheFault = (localSize, verified) => (!verified ? 'the cached copy could not be verified (bytes from another file, or spliced)'
      : (meta && localSize > 0 && !heldStampedBytes(localSize) ? `the cached copy holds ${localSize} bytes where the last fetch stamped ${stampedSize()} (it grew outside this cache's own writers, so it is no longer a prefix of the remote${healNote()})` : ''));
    const tooLarge = (n, fault) => new Error(`remote transcript too large (${(n / 1048576) | 0}MB)`
      + (fault && fs.existsSync(cachePath) ? ` — and ${fault}, so there is no prefix to grow from; the remote is past the ${(maxBytes / 1048576) | 0}MB fetch cap and cannot be re-fetched whole (deleting the cache would not help)` : ''));
    // CS data-plane: INCREMENTAL slab sync — transcripts are append-only, so
    // when the cache already holds a prefix we fetch ONLY [cachedSize, size)
    // via read-range instead of re-pulling the whole file (the remote-jsonl
    // whole-file cache's biggest cost). Any failure → legacy ssh path below.
    const observed = { moved: false };      // what the slab rung learns about the SLOT, read by the ssh rung (see the append refusal below)
    if (this.dataPlaneOn?.() || h.transport === 'dial') {
      try {
        const dm = await this.deviceBounded(id);
        // locate via the discovery snapshot (cached-ish) or a targeted find —
        // `sort` makes the pick DETERMINISTIC and prefers the plain twin
        // (".jsonl" sorts before ".jsonl.zst"), so a codex thread whose
        // rollout exists in both forms doesn't flap between them per poll
        const find = await dm.runCmd('sh', ['-c', `find ${root} ${findExpr} 2>/dev/null | sort | head -1`], { by: 'system:transcript-fetch' });
        const remotePath = find.stdout.trim();
        if (!remotePath) return fs.existsSync(cachePath) ? cachePath : null;
        const st = await dm.fsStat(remotePath);
        const size = st.stat.size, mtime = Math.floor(st.stat.mtimeMs / 1000);
        // cache "valid" requires the FILE to actually hold meta.size bytes — a
        // pre-2.187.0 truncated fetch stamped full-size meta over a 256KB stump,
        // and for a transcript that never grows again (stopped session) the
        // size/mtime match would serve the stump FOREVER (the self-heal only
        // triggers when the remote file changes) — and the bytes must have come
        // from the SAME remote file (see the cache-slot note above)
        const usable = cacheUsable(remotePath, size);   // ONE verdict per poll AND per rung: the whole-file scan behind it is memoized against the bytes it judged (round 7)
        if (meta && meta.size === size && meta.mtime === mtime && usable && (() => { try { return fs.statSync(cachePath).size === size; } catch { return false; } })()) { stampVerified(remotePath, size, mtime); return cachePath; }
        // B-0248 unit 4: no mkdir here (a round trip on the loop each fetch): the whole copy's folder is made by the store writer (makeDir); a delta and the heal paths write only into a copy that is there
        let localSize = 0;
        try { localSize = fs.statSync(cachePath).size; } catch { }
        // …and BEFORE the delta legality test, the one-time over-stamp heal
        // (round 6): a pre-round-5 stamp is short by construction, and over the
        // cap the rule below would strand the slot forever. It may rewrite
        // `meta` (verified against the remote's own bytes) or say why it did not.
        await healOverStamp(remotePath, localSize, size, { usable, readRemote: async (off, len) => (await dm.fsReadRange(remotePath, off, len)).data });
        // append-only delta is legal ONLY when the same, uncompressed remote
        // file grew: a different remote path (or either side compressed) means
        // the cached prefix is not a prefix of what we are fetching. The
        // both-compressed case looks the most innocent and is the worst: same
        // path, verified bytes (a .zst slot's magic IS its evidence), cached
        // archive shorter than the remote — yet re-compression REWRITES the
        // archive, so the "delta" would weld a foreign frame tail onto the old
        // frames. Negative-controlled in test-codex-zst ⑥d on BOTH rungs.
        // …and ONLY over bytes this cache's own writers put there (round 5):
        // a slot that grew behind our back is no longer a prefix of the remote.
        const canDelta = usable && !isZstPath(remotePath) && !cacheIsCompressed() && heldStampedBytes(localSize);
        // the cap guards what we FETCH — with a warm prefix that's just the
        // delta, so a transcript growing past maxBytes keeps incrementing
        // instead of suddenly erroring (a 45MB real session was on track)
        const deltaSlab = canDelta && localSize > 0 && localSize <= size && !!meta;
        const fetchBytes = deltaSlab ? size - localSize : size;
        if (fetchBytes > maxBytes) throw tooLarge(fetchBytes, cacheFault(localSize, usable));
        let grewSlab = deltaSlab;
        if (deltaSlab && size > localSize) {
          // append-only delta — the slab win
          const delta = await dm.fsReadRange(remotePath, localSize, size - localSize);
          // NEVER stamp meta for bytes we didn't get (a truncated read once
          // cached a 256KB prefix as a "complete" 45MB transcript — the
          // permanently-ancient-history incident); mismatch → legacy ssh
          if (delta.data.length !== size - localSize) throw new Error(`short read-range: ${delta.data.length} of ${size - localSize}`);
          // …and never at an offset the slot has already moved past (round 4):
          // a stale offset appends a DUPLICATE region. Under the cap the whole
          // file is still fetchable, so fall through to the whole read below;
          // over it (where the delta is the only road) fail loudly rather than
          // splice — the corruption this whole batch exists to prevent.
          if (this._appendDeltaAt(cachePath, localSize, delta.data)) dropScanMemo();   // the bytes changed ⇒ so does the verdict about them
          else {
            // MOVEMENT OUTLIVES THIS RUNG (round 5). The verdict used to be a
            // plain Error thrown INSIDE the data-plane try, so the over-cap
            // refusal landed in the silent fallback catch and the ssh rung
            // then recomputed its offset from the MOVED file and spliced —
            // right size, wrong bytes, stamped complete, served forever. It is
            // now typed (the catch re-throws it) and the flag below denies the
            // next rung a delta even when the failure that got us there was
            // something else entirely (a whole refetch that then failed).
            observed.moved = true;
            if (size > maxBytes) throw slotMovedError(`cache slot moved under the delta (offset ${localSize}) and the remote is past the ${(maxBytes / 1048576) | 0}MB fetch cap — refusing to splice`);
            console.warn(`[hosts] ${id}: cache slot moved under the slab delta (offset ${localSize}) — refetching whole`);
            grewSlab = false;
          }
        }
        if (!grewSlab) {
          // no/invalid prefix (or remote rotated smaller) — full streamed fetch
          const whole = await dm.fsReadRange(remotePath, 0, size);
          if (whole.data.length !== size) throw new Error(`short read-range: ${whole.data.length} of ${size}`);
          await this._landCacheNotExact(metaPath, meta, id);   // r4006 law D: the old record claims no exact size before the copy is handed
          await this._landCacheWhole(cachePath, whole.data, id);   // B-0248 unit 4: the store writer's thread writes it (landed before its record)
          dropScanMemo();
        }
        await this._landCacheMeta(metaPath, JSON.stringify(nextMeta({ size, mtime, slab: true, remotePath }, { whole: !grewSlab })), id);
        return cachePath;
      } catch (e2) {
        // A CACHE VERDICT IS NOT A TRANSPORT FAILURE (round 5): the moved-slot
        // refusal is true on every rung, so it is re-thrown instead of degraded.
        if (this._isTerminalFetchError(e2)) throw e2;
        // …and everything that IS degraded says so VERBATIM (repo law): this
        // catch swallowed every data-plane fault silently — including the
        // refusal above and any free-identifier ReferenceError an extraction
        // leaves behind (2.340.2 class) — so the only signal a fetch had
        // degraded was the ssh cost nobody was measuring.
        // …ONCE A MINUTE PER HOST (round 6): a dead data plane stays dead, and
        // every session poll / attach / goal-sync tick comes through here.
        this._warnDegradeOnce(id, `[hosts] ${id}: data-plane transcript fetch failed (${e2 && e2.message || e2}) — falling back to the ssh rung`);
      }
    }
    const probe = `f=$(find ${root} ${findExpr} 2>/dev/null | sort | head -1); [ -n "$f" ] && { stat -c '%s %Y' "$f" 2>/dev/null || stat -f '%z %m' "$f"; } && echo "$f"`;
    let out;
    try {
      out = (await this._ssh(h, probe, { timeoutMs: 15000 })).toString().trim();
      this._hostDownUntil?.delete(id); // reachable again — drop the memo
    }
    catch (e) {
      // Host unreachable (machine down, network partition) — remember for 60s
      // (see the memo check at entry) and serve the stale cached transcript;
      // only throw when there's nothing to serve.
      (this._hostDownUntil ||= new Map()).set(id, Date.now() + 60000);
      if (fs.existsSync(cachePath)) return cachePath;
      throw e;
    }
    if (!out) return fs.existsSync(cachePath) ? cachePath : null; // gone remotely — keep stale cache if any
    const [sizeMtime, remotePath] = [out.split('\n')[0], out.split('\n')[1]];
    const [size, mtime] = sizeMtime.split(' ').map(Number);
    // same stump-integrity + same-remote-file + cache-bytes checks as the slab path above
    const usableSsh = cacheUsable(remotePath, size);
    if (meta && meta.size === size && meta.mtime === mtime && usableSsh && (() => { try { return fs.statSync(cachePath).size === size; } catch { return false; } })()) { stampVerified(remotePath, size, mtime); return cachePath; }
    let localSizeSsh = 0;
    try { localSizeSsh = fs.statSync(cachePath).size; } catch { }
    // the same one-time over-stamp heal as the slab rung (round 6) — and this
    // is the rung that PRODUCED the shape, so it is the one that most often
    // meets it. `tail -c +N | head -c LEN` reads just the gap (1-based on GNU
    // and BSD alike); a host without `head -c` degrades to a longer answer,
    // whose first LEN bytes are still exactly the region under test.
    await healOverStamp(remotePath, localSizeSsh, size, {
      usable: usableSsh,
      readRemote: async (off, len) => this._ssh(h, `tail -c +${off + 1} ${JSON.stringify(remotePath)} | head -c ${len}`, { timeoutMs: 120000, maxBuffer: maxBytes + 1024, encoding: 'buffer' }),
    });
    // APPEND-ONLY DELTA ON THE LEGACY RUNG TOO (B-7638 round 2). The slab rung
    // has grown an over-cap slot by its delta since 2.187.0; this rung only
    // ever whole-`cat`ted, so the SAME conversation — one the data plane is
    // off/failing for — hard-failed "too large" on its very next byte of
    // growth: a >maxBytes transcript that opened yesterday is an error today,
    // with no fallback to the verified cache. Same legality test as the slab
    // rung (same remote file, uncompressed on both sides — a re-compressed
    // .zst remote over a .zst cache is a whole refetch, ⑥d — cached prefix no
    // longer than the remote), same never-stamp-bytes-we-didn't-get rule;
    // `tail -c +N` is 1-based on both GNU and BSD.
    // …plus the two round-5 clauses: never a delta after the slab rung watched
    // this slot move (`observed.moved`, in-window knowledge that must not die
    // with the rung that learned it), and never over bytes we did not stamp
    // (`heldStampedBytes`, the same knowledge one poll later — the file itself
    // still carries the foreign append long after the race that wrote it).
    const canDeltaSsh = usableSsh && !this._slotMovedEarlier(observed) && !isZstPath(remotePath) && !cacheIsCompressed() && localSizeSsh > 0 && localSizeSsh <= size && !!meta && heldStampedBytes(localSizeSsh);
    const fetchBytesSsh = canDeltaSsh ? size - localSizeSsh : size;
    if (fetchBytesSsh > maxBytes) throw tooLarge(fetchBytesSsh, cacheFault(localSizeSsh, usableSsh));
    // B-0248 unit 4: no mkdir here (a round trip on the loop each fetch): the whole copy's folder is made by the store writer (makeDir); a delta and the heal paths write only into a copy that is there
    let stampSize = size;
    let grewSsh = false;
    if (canDeltaSsh) {
      try {
        if (size > localSizeSsh) {
          const delta = await this._ssh(h, `tail -c +${localSizeSsh + 1} ${JSON.stringify(remotePath)}`, { timeoutMs: 120000, maxBuffer: maxBytes + 1024, encoding: 'buffer' });
          // fewer bytes than the stat promised = a truncated read: never stamp
          // those (the 2.187.0 stump rule). MORE is normal on a live transcript —
          // it grew between the stat and the read, and an append-only file's
          // extra tail bytes are genuinely its next bytes — so keep them and
          // stamp what the file ACTUALLY holds (the stump check compares the two).
          if (delta.length < size - localSizeSsh) throw new Error(`short tail read: ${delta.length} of ${size - localSizeSsh}`);
          // …and the offset must still be the END of the slot (round 4). It was
          // measured before the `tail` ran; if anything moved the cache since,
          // appending welds a DUPLICATE region on. The throw lands in the
          // fallback below — whole `cat` under the cap, a hard failure over it.
          if (!this._appendDeltaAt(cachePath, localSizeSsh, delta)) throw slotMovedError(`cache slot moved under the tail delta (offset ${localSizeSsh}) — refusing to splice`);
          dropScanMemo();
          stampSize = localSizeSsh + delta.length;
        }
        grewSsh = true;
      } catch (eDelta) {
        // THE DELTA IS AN OPTIMISATION, NOT THE ONLY ROAD (round 3). Round 2
        // REPLACED the whole `cat` on the LAST rung with the delta, so a `tail`
        // that fails — the remote truncated/rotated between the stat and the
        // read, or a host whose `tail` has no `-c +N` — now hard-fails a fetch
        // the pre-delta code completed, and this rung has nothing below it to
        // fall through to. Under the cap the whole file is still fetchable, so
        // fetch it; the hard error is kept for the ONE case where a whole
        // re-pull is impossible by construction (over the cap — where the
        // delta was not an optimisation but the only road).
        if (size > maxBytes) throw eDelta;
        console.warn(`[hosts] ${id}: tail delta failed (${eDelta && eDelta.message || eDelta}) — falling back to a whole fetch`);
        stampSize = size;
      }
    }
    if (!grewSsh) {
      const buf = await this._ssh(h, `cat ${JSON.stringify(remotePath)}`, { timeoutMs: 120000, maxBuffer: maxBytes + 1024, encoding: 'buffer' });
      await this._landCacheNotExact(metaPath, meta, id);   // r4006 law D: the old record claims no exact size before the copy is handed
      await this._landCacheWhole(cachePath, buf, id);   // B-0248 unit 4: the store writer's thread writes it (landed before its record)
      dropScanMemo();
      // STAMP WHAT THE FILE ACTUALLY HOLDS (round 5) — the rule the tail branch
      // above already follows. `cat` runs after the probe stat, so a live
      // transcript hands back MORE bytes than `size`; stamping the stat value
      // left meta.size < the file's real length on a perfectly healthy fetch,
      // and the "grew outside our writers" invariant would then read its own
      // whole fetch as foreign bytes and refuse the next delta (over the cap,
      // that is a hard failure). The slab rung's whole read is length-checked,
      // so it has no such gap.
      stampSize = buf.length;
    }
    await this._landCacheMeta(metaPath, JSON.stringify(nextMeta({ size: stampSize, mtime, remotePath }, { whole: !grewSsh })), id);
    return cachePath;
  }

  /** B-0248 step 2, unit 4 (lane bl-loop-b, 主开发 r3320 / r3883): a remote transcript's WHOLE copy goes through THE STORE WRITER — its
   *  temp, write and rename on the writer's thread. The release wrote it (up to the 64 MB fetch cap) by writeFileSync + rename ON THE
   *  LOOP: 239 ms at local speed for 64 MB, and a rename's whole delay on slow storage (the page bl-loop-b/b0248-page.md, row 7). The
   *  fetched buffer is handed BY REFERENCE (byRef: the writer copies it 4 MB a turn, so nothing holds one turn — the buffer is never
   *  written into after), urgent (its fetch waits), and answered only once ON DISK: the record (meta) is written after it, so a
   *  reader never meets a record that names bytes the copy does not hold. A write that cannot land THROWS by name, as the release's
   *  failed write did (the fetch's own road says it). The delta APPENDS (_appendDeltaAt) stay where they are: a small tail a poll */
  async _landCacheWhole(file, data, id = null) {
    // r4006 (the round on line 888), laws A, B, E, F: the fetched bytes are held in ONE cell, reachable only while their write is owed
    // (a producer answering null writes nothing: «equal to the disk»); once durable() has answered — landed, refused or past its
    // bound — the cell is emptied and the writer's entry for the file leaves (_letCacheGo). A machine removed meanwhile gets no copy
    // §72 (src/timed-sync.js): the hand-off to the writer is this site's own, by its row's literal name; the bytes are the one cell's
    await this._landCacheBytes(file, data, id, 'the cached copy', (W, cell) => W.dirty(file, { name: 'remote-jsonl.write', urgent: true, makeDir: true, produce: () => { const b = cell(); return b == null ? null : require('./store-writer.js').byRef(b); } }));
  }
  /** B-0248 unit 4: the copy's record (its .meta) through the same writer, answered once on disk — after the bytes it names */
  async _landCacheMeta(file, text, id = null) {
    await this._landCacheBytes(file, text, id, "the cached copy's record", (W, cell) => W.dirty(file, { name: 'remote-jsonl-meta.write', urgent: true, makeDir: true, produce: cell }));
  }
  /** r4006 law D: before a WHOLE copy is handed, a record that claims an exact size is written without that claim. A stop between the
   *  copy's landing and its new record then leaves a record that names no exact size: the over-stamp heal reads the next poll (also
   *  above the fetch cap), never «too large» for good. No record yet: nothing to say */
  async _landCacheNotExact(metaPath, meta, id = null) {
    if (!meta || meta.sizeExact !== true) return;
    const { sizeExact, ...rest } = meta;
    await this._landCacheMeta(metaPath, JSON.stringify(rest), id);   // the record without its exact claim, nothing added (r4154 (4): no field nobody reads)
  }
  /** `hand(W, cell)`: the caller's own W.dirty of `file` (its row's name, §72); its producer reads `cell()` — the bytes while their
   *  write is owed, null once emptied (null = «equal to the disk»: nothing is written) */
  async _landCacheBytes(file, bytes, id, what, hand) {
    if (id != null && !this._state.hosts.some((x) => x && x.id === id)) throw Object.assign(new Error(`${what} ${path.basename(file)} is not written: its machine is removed`), { code: 'ECACHEWRITE' });   // law E (get() throws for a removed machine: the list is asked)
    const W = this._W();
    let held = bytes;
    hand(W, () => held);
    let ok = false;
    // WHAT A FORGET ANSWERS (r4154 (5)): the writer's forget() answers EVERY waiter of the file at once, with TRUE — so a machine's removal
    // (it forgets the folder's rows) answers this wait «landed» for bytes that will never stand. Hence the machine is asked again after
    // the wait: a removed machine's copy or record is refused by name (ECACHEWRITE), and the fetch never returns a path for it
    try { ok = await W.durable(file, { timeoutMs: CACHE_LAND_MS }); }
    finally { held = null; this._letCacheGo(W, file); }
    if (!ok) throw Object.assign(new Error(`${what} ${path.basename(file)} could not be written (the store writer did not land it)`), { code: 'ECACHEWRITE' });
    if (id != null && !this._state.hosts.some((x) => x && x.id === id)) throw Object.assign(new Error(`${what} ${path.basename(file)} is not kept: its machine was removed while it was written`), { code: 'ECACHEWRITE' });
  }
  /** r4006 laws A, B, F: the file's entry LEAVES the writer once its answer is in (W.forget). By the writer's own code (src/store-writer.js
   *  forget): on a file NOT in flight it drops the entry and never touches the file; on one IN FLIGHT (the bound passed mid-write) it
   *  lets that write land and then unlinks the file again on the writer's thread. So a copy (or a record) answered «not written» never
   *  stands later over one a later poll has grown — the next poll fetches whole — and the writer's table keeps no entry a transcript */
  _letCacheGo(W, file) { try { if (typeof W.forget === 'function') W.forget(file); } catch { } }
  /** r4006 law E: the write of `file` IN FLIGHT at a removal has LANDED (or the bound `until` passed). One durable() answer is not
   *  that: forget() answers every waiter at once, and the fetch's own _letCacheGo (its finally, a microtask after the removal's
   *  forget) answered the removal's wait while the copy still flew, so the landing made the folder again (this cure's first gate).
   *  So it asks again while the writer still owes the file a write (pending(): the unlink after a forgotten landing is none).
   *  ASKED BEFORE EACH WAIT (r4154 (3)): a row whose only job in flight is that UNLINK shows inflight in stats(), but its end settles no
   *  waiter (the entry just goes) — a wait there was answered only by its timer at the bound; nothing is owed, so it returns at once.
   *  AT MOST 8 ASKS (r4154 (0)): if durable() ever answered at once while pending() stayed true, a loop bounded only by `until` would
   *  spin on microtasks until the bound; the cap stops that */
  async _cacheLanded(W, file, until) {
    for (let k = 0; k < 8 && Date.now() < until; k++) {
      if (typeof W.pending === 'function' && !W.pending(file)) return;
      try { await W.durable(file, { timeoutMs: Math.max(1, until - Date.now()) }); } catch { return; }
      if (typeof W.pending !== 'function') return;   // a writer without pending(): its one answer
    }
  }
  /** the process's store writer, or a suite's own (`hm._writer`: the stand-in thread) */
  _W() { return this._writer || require('./store-writer.js').storeWriter(); }

  // Remote WORKFLOW state (2.191.0, remote View Workflow): one read-only
  // compound probe (ssh multiplexed ~50ms warm, or dial runCmd) returning the
  // terminal snapshot + live journal + agent-file inventory for a run. TTL
  // cache 2s — below the viewer's 2.5s live poll, so N clients ≈ 1 round trip
  // per 2s. Payload sections are nonce-delimited (snapshot/journal content is
  // arbitrary text — fixed markers could collide). stat is GNU-else-BSD so
  // macOS dial devices work.
  async fetchWorkflowState(id, runId, claudeSessionId = '', cwd = '') {
    if (!/^wf_[\w-]{1,64}$/.test(runId)) throw new Error('bad run id');
    const h = this.get(id);
    if (!this._wfStateCache) this._wfStateCache = new Map();
    const key = id + ':' + runId;
    const hit = this._wfStateCache.get(key);
    if (hit && Date.now() - hit.at < 2000) return hit.val;
    const nonce = crypto.randomBytes(8).toString('hex');
    const M = (s) => `__VSWF_${nonce}_${s}__`;
    const sidOk = claudeSessionId && /^[\w-]+$/.test(claudeSessionId);
    const projDir = sidOk && cwd ? cwdToProjectDir(String(cwd)) : '';
    const targeted = projDir
      ? `S="$P"/${JSON.stringify(projDir)}/${JSON.stringify(claudeSessionId)}/workflows/${JSON.stringify(runId + '.json')}; [ -f "$S" ] || S=""; D="$P"/${JSON.stringify(projDir)}/${JSON.stringify(claudeSessionId)}/subagents/workflows/${JSON.stringify(runId)}; [ -d "$D" ] || D=""; `
      : '';
    const script = `P="$HOME/.claude/projects"; S=""; D=""; ${targeted}`
      + `[ -n "$S" ] || S=$(find "$P" -maxdepth 4 -name ${JSON.stringify(runId + '.json')} -path '*/workflows/*' 2>/dev/null | head -1); `
      + `[ -n "$D" ] || D=$(find "$P" -maxdepth 5 -name ${JSON.stringify(runId)} -type d -path '*/subagents/workflows/*' 2>/dev/null | head -1); `
      + `mt(){ stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }; `
      + `echo "SNAPMT:$( [ -n "$S" ] && mt "$S" )"; `
      + `echo "JMT:$( [ -n "$D" ] && mt "$D/journal.jsonl" )"; `
      + `echo "AMT:$( [ -n "$D" ] && for f in "$D"/agent-*.jsonl; do [ -f "$f" ] && mt "$f"; done | sort -n | tail -1 )"; `
      // the newest mtime of EVERY file of the run (meta.json too) — the stall
      // verdict's input, the local read's rule (readRunDirParts stats every file);
      // JMT/AMT stay the resumed-after-snapshot rule's inputs, as locally (lane Q verify)
      + `echo "NMT:$( [ -n "$D" ] && for f in "$D"/*; do [ -f "$f" ] && mt "$f"; done | sort -n | tail -1 )"; `
      // the HOST's clock — the stall verdict (src/workflow-disk.js) compares the
      // host's mtimes against the host's now, so machine clock skew never
      // turns a live run stalled or a dead one running (2026-09-26)
      + `echo "NOW:$(date +%s)"; `
      + `[ -n "$D" ] && ls -1 "$D" 2>/dev/null | sed 's/^/AG:/'; `
      + `echo "NM:$( [ -n "$D" ] && ls -1 "$(dirname "$(dirname "$(dirname "$D")")")/workflows/scripts" 2>/dev/null | grep -F -- ${JSON.stringify('-' + runId + '.js')} | head -1 )"; `
      // dial run-cmd slices stdout at 1MB — keep the whole payload under it
      // (snapshot 700K + journal 250K + metas 40K + headers; a truncated journal
      // only degrades attempt labels — the metas carry them too — a truncated
      // snapshot 500s with a clear error)
      + `echo ${JSON.stringify(M('SNAP'))}; [ -n "$S" ] && head -c 700000 "$S"; `
      + `echo; echo ${JSON.stringify(M('JOURNAL'))}; [ -n "$D" ] && head -c 250000 "$D/journal.jsonl"; echo`
      // each agent's meta.json (description = label, workflowPhase, model) as ONE
      // line `<file>\t<json>` — JSON's own newlines are whitespace, folded to spaces
      + `; echo ${JSON.stringify(M('META'))}; [ -n "$D" ] && for f in "$D"/agent-*.meta.json; do [ -f "$f" ] && printf '%s\\t' "$(basename "$f")" && head -c 4000 "$f" | tr '\\n\\r' '  ' && echo; done | head -c 40000; echo`;
    const out = await this._hostShell(h, script, { timeoutMs: 20000 });
    const [head, rest] = out.split(M('SNAP') + '\n');
    if (rest === undefined) throw new Error('workflow probe returned no payload');
    const [snapRaw, journalAndMeta] = rest.split('\n' + M('JOURNAL') + '\n');
    // the META section trails the journal (absent ⇒ no metas: the disk view
    // then labels from the journal alone — never the old skeleton)
    const metaAt = journalAndMeta === undefined ? -1 : journalAndMeta.lastIndexOf('\n' + M('META') + '\n');
    const journalRaw = journalAndMeta === undefined ? undefined : (metaAt >= 0 ? journalAndMeta.slice(0, metaAt) : journalAndMeta);
    const metas = {};
    if (metaAt >= 0) {
      for (const line of journalAndMeta.slice(metaAt + M('META').length + 2).split('\n')) {
        const tab = line.indexOf('\t');
        const m = tab > 0 ? line.slice(0, tab).match(/^agent-([0-9a-f]+)\.meta\.json$/) : null;
        if (!m) continue;
        try { const o = JSON.parse(line.slice(tab + 1)); if (o && typeof o === 'object') metas[m[1]] = o; } catch { /* cut by the 40K cap */ }
      }
    }
    const headLines = head.split('\n');
    const grab = (p) => { const l = headLines.find((x) => x.startsWith(p)); return l ? l.slice(p.length).trim() : ''; };
    const val = {
      snapMtime: Number(grab('SNAPMT:')) || 0,
      journalMtime: Number(grab('JMT:')) || 0,
      agentMtime: Number(grab('AMT:')) || 0,
      newestMtime: Number(grab('NMT:')) || 0,
      agentFiles: headLines.filter((x) => x.startsWith('AG:')).map((x) => x.slice(3).trim()).filter(Boolean),
      scriptName: grab('NM:'),
      snapText: (snapRaw || '').trim() || null,
      journalText: (journalRaw === undefined ? '' : journalRaw),
      metas,
      now: Number(grab('NOW:')) || 0,
      hasRunDir: false,
    };
    val.hasRunDir = !!(val.journalMtime || val.agentMtime || val.agentFiles.length);
    this._wfStateCache.set(key, { at: Date.now(), val });
    return val;
  }

  // ── Remote usage (2.127.0) ──

  /** Harvest per-request usage events from the host's ~/.claude transcripts.
   *  Ships the scanner over ssh STDIN (never argv) and runs it; the remote
   *  keeps its own byte cursors (~/.vibespace/usage-cursor.json), so after the
   *  first full pass each harvest returns only NEW events. Throttled 15min per
   *  host unless forced. Returns the raw NDJSON text ('' when throttled).
   *  `ledger` (lane ledger-dedup-law F2 — every server caller passes the UsageHistory): the harvest INGESTS itself and
   *  answers the ingest's `{added, appended, duplicates, since, …}` (`{added: 0, throttled: true}` when throttled). On the
   *  device road THE HUB KEEPS THE CURSOR: the device walks from the hub's copy (`ledger.hostCursorOf`) and the hub's
   *  durable ingest is the commit — the device's cursor file is never written, so nothing of VibeSpace's own upkeep waits
   *  at the hub-act gate (a cluster instance held that `files` act for an owner who never answered, and every harvest
   *  re-sent the whole window). An older daemon that cannot take the hub's cursor walks from its own, the ledger drops
   *  what it already holds (0 bytes) and this says `since-unsupported` once per machine. */
  /** B-6ded list 1: a harvest that failed backs off (1 min, doubling, at most 30 min) instead of the next kick walking the
   *  whole remote backlog again at once; one that came back resets it. */
  _harvestFailed(id) {
    if (!this._usageHarvestFail) this._usageHarvestFail = new Map();
    const n = ((this._usageHarvestFail.get(id) || {}).n || 0) + 1;
    this._usageHarvestFail.set(id, { n, until: Date.now() + Math.min(HARVEST_BACKOFF_MAX_MS, HARVEST_BACKOFF_MS * 2 ** (n - 1)) });
    this._usageHarvestAt.set(id, 0); // the throttle never counts a failed run; the backoff above is the pause
  }
  _harvestLanded(id) { if (this._usageHarvestFail) this._usageHarvestFail.delete(id); }
  async harvestUsage(id, { force = false, scannerPath, minIntervalMs, ledger = null } = {}) {
    const h = this.get(id);
    const ingest = (text, { cursors = null, since = null, oversize = 0 } = {}) => {
      // B-5278: a walk's dropped usage events (an id over its bound) are said once, whichever road walked — money not counted —
      // and (r557 (6)) only when that walk's rows were made durable (an unacked walk is walked again, unsaid till then)
      const dropped = oversize || AC.oversizeOf(text);
      const said = (x) => { if (dropped && !(x && x.ack === false)) console.warn(AC.droppedSaid((h && h.name) || id, dropped, 'usage walk')); return x; };
      if (!ledger) return said(text);
      // B-5278: a walk with no events still hands its cursors over (one stopped on its bound with none, one whose records were
      // all dropped) — the hub's copy moves, never re-read from the same place at every harvest
      const r = (text || cursors) ? ledger.ingestRemoteEvents(id, (h && h.name) || id, text || '', { cursors, since }) : { added: 0, appended: 0, duplicates: 0 };
      const out = (x) => (since ? { ...x, since } : x);
      return r && typeof r.then === 'function' ? r.then(out).then(said) : said(out(r)); // lane ledger-dedup-law r8: a held month's rows land on the hold's async road — awaited
    };
    if (!this._usageHarvestAt) this._usageHarvestAt = new Map();
    const last = this._usageHarvestAt.get(id) || 0;
    // minIntervalMs: the event-driven cadence (a remote session's turn just
    // ended → harvest soon so the ledger + billing popup lag ~a minute, not
    // 15). The 15-min default remains the idle/背景 cadence. Still one ssh/
    // device round trip per call — never sub-minute.
    const gate = Math.max(60 * 1000, minIntervalMs ?? 15 * 60 * 1000);
    if (!force && Date.now() - last < gate) return ledger ? { added: 0, throttled: true } : '';
    const fail = this._usageHarvestFail && this._usageHarvestFail.get(id);
    if (!force && fail && Date.now() < fail.until) return ledger ? { added: 0, throttled: true, backoff: { failures: fail.n, until: fail.until } } : '';
    this._usageHarvestAt.set(id, Date.now());
    const script = fs.readFileSync(scannerPath, 'utf-8');
    // CS data-plane: ship+run the scanner through the daemon (streaming exec —
    // NDJSON output can be huge). Same cursor semantics; legacy ssh fallback.
    if (this.dataPlaneOn?.() || h.transport === 'dial') {
      let got = null; // what the device road answered: {text, cursors?, since?} — ingested AFTER the transport's own try
      try {
        const dm = await this.deviceBounded(id);
        // R4 `usage.scan`: the walker is BUNDLED in the daemon (≥2.286.0) —
        // no per-harvest script ship. TWO-PHASE, THE HUB'S SIDE (lane
        // ledger-dedup-law F2): the cursor moves only after the count-gated
        // transfer fully landed AND the ingest made it durable — and it moves
        // HERE, in the hub's copy beside the ledger, never by a write on the
        // device (a link death mid-transfer leaves it put; the next harvest
        // walks from the same place). Older daemon / op failure → script-ship
        // fallback.
        let r = null;
        try {
          const hub = ledger && typeof ledger.hostCursorOf === 'function' ? ledger.hostCursorOf(id) : null;
          r = await dm.usageScan({ hubCursor: hub ? hub.cursors : null, bound: usageScanBound(this.usageHarvestLimits || USAGE_HARVEST_LIMITS) });
        } catch (e3) {
          if (!/lacks usage-scan/.test(e3.message || '')) console.warn('[usage] usage-scan op failed, falling back to script ship:', e3.message);
        }
        if (r) {
          if (r.since === 'unsupported') {
            if (!this._sinceSaid) this._sinceSaid = new Set();
            if (!this._sinceSaid.has(id)) { this._sinceSaid.add(id); console.warn(`[usage] ${(h && h.name) || id}: since-unsupported — its device agent cannot walk from the hub's cursor (an older daemon): each harvest re-reads the window since the device's own cursor and the ledger keeps none of it twice (0 bytes), until the device agent is updated`); }
          }
          got = { text: r.ndjson, cursors: r.cursors || null, since: r.since || 'device', oversize: r.oversize || 0 };
        }
        if (!got) { // an older daemon (no usage-scan op) / the op failed: ship the scanner (it keeps its own cursor on the device)
          const home = (await dm.runCmd('sh', ['-c', 'echo "$HOME"'], { by: 'system:usage-harvest' })).stdout.trim();
          const scanPath = home + '/.vibespace/bin/vibespace-usage-scan';
          await dm.fsWrite(scanPath, script, { by: 'system:usage-harvest' }); // fsWrite mkdirs the parent
          const chunks = [];
          // B-b83c: the agent's own node first (this fallback is reached by an older daemon — it says no nodePath — or by a failed op)
          const { code, error } = await dm.runStream(HostManager.scannerNodeOf(dm), [scanPath], { onData: (b) => chunks.push(b), by: 'system:usage-harvest' });
          if (error) throw new Error(error);
          if (code !== 0) throw new Error('scanner exit ' + code);
          got = { text: Buffer.concat(chunks).toString('utf-8') };
        }
      } catch (e2) {
        // DIAL has no ssh fallback (sshArgs throws 'is a dial-out device'),
        // and the ssh path would MISDIAGNOSE the device-link failure as a
        // transport-absent one (2.271.0 T3-6). Rethrow the real error and
        // reset the throttle so the next kick retries instead of a silent
        // 15-min block on a misleading message.
        if (h.transport === 'dial') { this._harvestFailed(id); throw e2; }
        /* ssh host: fall through to the legacy ssh path below */
      }
      // the ingest is the hub's own (an ingest that throws is never a reason to walk the machine again by another road)
      if (got) { this._harvestLanded(id); return ingest(got.text, got); }
    }
    const L = this.usageHarvestLimits || USAGE_HARVEST_LIMITS, B = usageScanBound(L);
    return new Promise((resolve, reject) => {
      const child = execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--',
        'umask 077; mkdir -p "$HOME/.vibespace/bin"; cat > "$HOME/.vibespace/bin/vibespace-usage-scan"; ' + REMOTE_PRELUDE + `VIBESPACE_USAGE_SCAN_MAX_BYTES=${B.maxBytes} VIBESPACE_USAGE_SCAN_MAX_MS=${B.maxMs} node "$HOME/.vibespace/bin/vibespace-usage-scan"`],
        { env: this.sshEnv(), timeout: L.timeoutMs, maxBuffer: L.maxBuffer }, (err, stdout, stderr) => {
          if (err) { this._harvestFailed(id); return reject(sshRefusal(h, err, stderr, fed) || new Error((stderr || err.message || '').toString().slice(0, 200))); }
          this._harvestLanded(id);
          try { resolve(ingest(stdout.toString())); } catch (e) { reject(e); }
        });
      const fed = feedStdin(child, script);
    });
  }

  /** ONE OpenCode-serve op on a REMOTE machine (S9 remainder piece (e),
   *  B-eac2). `hostId` is a PARAMETER: the caller names the machine and the
   *  op, this method only chooses the transport.
   *    RUNG 1 (preferred) — the `opencode-serve` agentd op: the daemon
   *      BUNDLES src/opencode-serve.js and runs the very same
   *      runOpencodeOp() against its own facts, so a paired device behaves
   *      exactly like this machine (keeper, caches, live lane and all).
   *    RUNG 2 (FALLBACK, ssh hosts with no daemon) — ship
   *      data/bin/vibespace-opencode-op and feed it the op on stdin. That
   *      file is the documented checkout-less single-file exception and is
   *      parity-pinned by scripts/test-opencode-remote.mjs.
   *  Returns the op's plain-JSON result; every failure THROWS with the
   *  machine-side reason (a user action must never fail silently). */
  async opencodeOp(hostId, op, params = {}, { timeoutMs = 60000, startOf = null } = {}) {   // `startOf(hello, machine)`: B-460d's last part — the serve's start for THAT machine (its caller's verdict), handed with the op
    const h = this.get(hostId);
    if (!h) throw new Error(`unknown host ${hostId}`);
    if (this.dataPlaneOn?.() || h.transport === 'dial') {
      try {
        const dm = await this.deviceBounded(hostId);
        let start = null; if (typeof startOf === 'function') { try { start = startOf(helloOf(dm), h); } catch { start = null; } }   // a verdict that cannot be read: the release's start
        return await dm.opencodeServe(op, params, { timeoutMs, ...(start ? { start } : {}) });
      } catch (e) {
        // a dial device has NO ssh fallback — reporting the ssh path's error
        // instead of the device one misdiagnoses the failure (2.271.0 T3-6).
        // An SSH host falls through on ANY device failure, exactly like the
        // usage-scan and transcript rungs above: the daemon may be old
        // ('lacks opencode-serve'), down, or mid-upgrade, and the shipped
        // script answers the same question. The two rungs share ONE record
        // (~/.vibespace/opencode-serve.json), so the fallback REUSES the
        // daemon's serve instead of starting a second one.
        if (h.transport === 'dial') throw e;
        console.warn('[opencode] device op unavailable on ' + hostId + ', falling back to the ssh rung:', e.message);
      }
    }
    // The script rides the COMMAND (base64, ~12 KB — well inside ARG_MAX) and
    // the op json rides STDIN. Deliberately not both on stdin: `head -c N`
    // may read-ahead past N bytes from a pipe, which would eat the op.
    const script = fs.readFileSync(path.join(__dirname, '..', 'data', 'bin', 'vibespace-opencode-op'));
    const b64 = script.toString('base64');
    const stdout = await new Promise((resolve, reject) => {
      const child = execFile('ssh', [...this.sshArgs(h, { multiplex: true }), '--',
        'umask 077; mkdir -p "$HOME/.vibespace/bin"; printf %s ' + JSON.stringify(b64)
        + ' | base64 -d > "$HOME/.vibespace/bin/vibespace-opencode-op"; '
        + REMOTE_PRELUDE + 'node "$HOME/.vibespace/bin/vibespace-opencode-op"'],
        { env: this.sshEnv(), timeout: timeoutMs, maxBuffer: 96 * 1024 * 1024 }, (err, out, stderr) => {
          if (err) return reject(sshRefusal(h, err, stderr, fed) || new Error((stderr || err.message || '').toString().slice(0, 300) || 'ssh failed'));
          resolve(out.toString());
        });
      const fed = feedStdin(child, JSON.stringify({ op, params }));
    });
    let parsed = null;
    for (const line of stdout.trim().split('\n')) { try { const j = JSON.parse(line); if (j && typeof j.ok === 'boolean') parsed = j; } catch { } }
    if (!parsed) throw new Error(`opencode op '${op}' on ${hostId} returned no result (${stdout.trim().slice(-200) || 'no output'})`);
    if (!parsed.ok) throw new Error(parsed.error || `opencode op '${op}' failed on ${hostId}`);
    return parsed.result || {};
  }

  /** READ-ONLY peek at the host's own claude login token (ban-safety: never
   *  refresh, never write — expired/absent → null; the host's own CLI usage
   *  refreshes it). Powers the on-demand quota ⟳ for remote hosts. */
  async readRemoteOAuth(id) {
    const h = this.get(id);
    let raw;
    // _hostShell: dial devices peek via the device link (2.188.0 — the ⟳ in
    // the quota popup threw for paired devices; the peek was ssh-only)
    // UNREACHABLE ≠ TOKEN-ABSENT (2.271.0 T2-12): both used to return null, so
    // the ⟳ route told the user "no valid login on the host — log in there"
    // when the host was merely down. Throw a tagged error instead; the route
    // renders "host unreachable" and skips stamping its throttle.
    try { raw = await this._hostShell(h, 'cat "$HOME/.claude/.credentials.json" 2>/dev/null || true', { timeoutMs: 10000 }); }
    catch (e) { const err = new Error('host unreachable: ' + (e?.message || e)); err.code = 'host-unreachable'; throw err; }
    let o = null;
    try { o = JSON.parse(raw).claudeAiOauth || null; } catch { o = null; }
    return remoteUsageBearer(o, 'the host\'s login');   // B-5e0d: the bearer law (a long-lived token refused by name)
  }

  /** READ-ONLY peek at a host-HELD account's login token (2.245.0): the
   *  isolated creds dir ~/.vibespace/subs/<subId> a per-account on-host login
   *  minted. Same §ban-safety class as readRemoteOAuth — never refresh, never
   *  write; expired/absent → null (the account's own sessions on the host
   *  refresh it). Powers the on-demand quota ⟳ for host-held accounts. */
  async readRemoteSubOAuth(id, subId) {
    if (!/^sub-[\w-]{1,40}$/.test(String(subId || ''))) return null;
    const h = this.get(id);
    let raw;
    // same unreachable-vs-absent split as readRemoteOAuth (2.271.0 T2-12)
    try { raw = await this._hostShell(h, `cat "$HOME/.vibespace/subs/${subId}/.credentials.json" 2>/dev/null || true`, { timeoutMs: 10000 }); }
    catch (e) { const err = new Error('host unreachable: ' + (e?.message || e)); err.code = 'host-unreachable'; throw err; }
    let o = null;
    try { o = JSON.parse(raw).claudeAiOauth || null; } catch { o = null; }
    return remoteUsageBearer(o, 'the account\'s folder on the host');   // B-5e0d: the bearer law (a long-lived token refused by name)
  }

  /** B-5e0d: the host's PASSIVE usage cache through the shell (PASSIVE_PEEK_SH above) — for an agent older than the usage bearer
   *  law, which the ⟳ never asks once the law refused its login: the person keeps the reading that cost nothing. */
  async readRemotePassiveUsage(id) {
    const h = this.get(id);
    const raw = await this._hostShell(h, PASSIVE_PEEK_SH, { timeoutMs: 10000 }), left = passiveLeftOfPeek(raw);
    if (left > 0) { if (!this._passiveLeftSaid) this._passiveLeftSaid = new Set(); if (!this._passiveLeftSaid.has(id)) { this._passiveLeftSaid.add(id); console.warn(`[bounds] ${h.name}: ${left} passive usage reading(s) left out (more than ${PASSIVE_PEEK_FILES} files, or one over ${PASSIVE_PEEK_BYTES / 1024} KiB)`); } }
    return passiveOfPeek(raw);
  }

  // ── Remote session discovery (lock-first, same algorithm as local) ──

  /** Cheap link-state classifier for the offline-bias defense:
   *  'online'  — dial link live, or a cached device connection reports connected
   *  'offline' — dial host with NO live link, or a fresh unreachable memo
   *  'unknown' — pure-ssh host with no cached facts (reachability is probed at
   *              use; absence of evidence is not evidence of absence).
   *  Deliberately never probes — this runs inside estimator/pool decisions. */
  linkState(id) {
    // the B-f276 remainder's cure (主开发 23:20Z, its audit H3): while HELD no machine can be reached (every dial is held off, every
    // connect meets the hold) — 'offline', so the pool's dark-source defense stays ON (get threw here, and usage-pool-engine's
    // darkSources swallowed it: an EMPTY dark list while remote machines kept spending)
    if (this._unread) return 'offline';
    let h; try { h = this.get(id); } catch { return 'unknown'; }   // ALSO CURED: a removed machine's id threw the same way (one removed source emptied the whole list)
    if (!h) return 'unknown';
    try {
      if (h.transport === 'dial' || h.deviceId) {
        if (this.dialOnline?.(h.deviceId || id)) return 'online';
        if (h.transport === 'dial') return 'offline'; // dial-only: no link = unreachable
      }
      if ((this._hostDownUntil?.get(id) || 0) > Date.now()) return 'offline';
      const dm = this._devices?.get(id);
      if (dm?.status?.().connected) return 'online';
    } catch { }
    return 'unknown';
  }

  /** The single owning host of a conversation per the location index, or
   *  null (unknown/ambiguous). Claims from since-removed hosts are ignored. */
  conversationOwner(sessionId) {
    // the B-f276 remainder's cure: a HELD list keeps every claim («unknown», never «gone»); a removed machine's claim is FILTERED
    // (get threw «host not found» inside the filter, so one removed machine's old claim made the whole answer null)
    try { return this.convIndex.ownerHost(sessionId, (hid) => { if (this._unread) return true; try { return !!this.get(hid); } catch { return false; } }); } catch { return null; }
  }

  /** B-16d7: THE REAL FOLDERS OF A MACHINE'S CONVERSATIONS, as THAT machine resolved them (discovery's R fact → a row's
   *  `hostRealCwd`): ONE map per host, replaced by each discovery answer (at most 500). Read by the Task-Group store
   *  (task-groups _realHere: another machine's conversation is matched by its own machine's path — the hub never resolves it) and
   *  by the live row (hostRealFieldsOf). A host whose discovery never said one: none. */
  _noteRealCwds(id, sessions) {
    if (!this._realCwds) this._realCwds = new Map();
    const rows = Array.isArray(sessions) ? sessions : [], prev = this._realCwds.get(id) || new Map(), m = new Map();
    const said = rows.some((s) => s && typeof s.hostRealCwd === 'string');
    for (const s of rows) {
      if (!s || typeof s.cwd !== 'string' || m.size >= 500) continue;
      if (typeof s.hostRealCwd === 'string') m.set(s.cwd, s.hostRealCwd);
      // an answer that says NO real folder at all (a rung without the fact: the ssh one on a host with no timeout, the device's
      // inline fallback, a budget spent before its first folder) keeps the last one for a cwd it still lists — no membership flap
      // between sweeps. An answer that says ANY — every resolved folder is said, a no-link one as itself — is the whole truth: a
      // listed cwd it does not name (past its budget) loses its real folder until a sweep names it again
      else if (!said && prev.has(s.cwd)) m.set(s.cwd, prev.get(s.cwd));
    }
    this._realCwds.set(id, m);
    // the Task-Group store re-judges the groups a moved real folder adds or takes (task-groups hostRealMoved)
    const moved = [];
    for (const [c, r] of m) if (prev.get(c) !== r) moved.push([c, r]);
    for (const [c, r] of prev) if (m.get(c) !== r) moved.push([c, r]);
    if (moved.length && typeof this.onRealCwdsMoved === 'function') { try { this.onRealCwdsMoved(moved, id); } catch { } }   // + THE MACHINE (B-06de × B-16d7: a moved real folder names only the groups whose row is on that machine)
  }
  realCwdOf(id, cwd) {
    if (!id || typeof cwd !== 'string') return null;
    if (!this._realCwds) this._realCwds = new Map();
    const known = () => { try { return !!this.get(id); } catch { return false; } };   // (get throws for an unknown id: this reader never throws — the live payload calls it)
    if (!this._realCwds.has(id) && this._persistedDisc?.[id]?.sessions && known()) this._noteRealCwds(id, this._persistedDisc[id].sessions);   // the last-known list, before the first fresh sweep
    const m = this._realCwds.get(id);
    return (m && m.get(cwd)) || null;
  }
  /** the live row's own field (server.js activeSessionsPayload): another machine's conversation carries its machine's real path */
  hostRealFieldsOf(s) { let r = null; try { r = s && s.host ? this.realCwdOf(s.host, s.cwd) : null; } catch { r = null; } return r ? { hostRealCwd: r } : {}; }

  /** B-5278 (r1082): a last list of this machine the hub could answer (its cache or the one kept on disk) */
  _hasLastList(id) { const last = this._discoveryCache.get(id) || this._persistedDisc[id]; return !!(last && Array.isArray(last.sessions)); }
  async discoverSessions(id, { ttlMs = 15000 } = {}) {
    const h = this.get(id);
    const hit = this._discoveryCache.get(id);
    if (hit && Date.now() - hit.at < ttlMs) return hit.sessions;
    // STALE-WHILE-REVALIDATE (2.320.0, inc-msp2srj2 "AIDev默认没有session"):
    // a COLD sweep blocks 10-60s right after a server restart (device
    // bootstrap, daemon self-upgrade, ssh master rebuild — measured 12.3s on
    // a healthy link), and for that whole window the zone renders EMPTY.
    // The persisted last-known list was sitting on disk the entire time but
    // was only consulted on FAILURE. Serve it IMMEDIATELY (stale-marked) and
    // refresh in the BACKGROUND — the 2.310.0 remote-sessions push delivers
    // the fresh result to every client when it lands. An explicit ⟳
    // (ttlMs 0) still blocks for the real scan, so "refresh" means refresh.
    if (ttlMs > 0 && !hit && this._persistedDisc[id]?.sessions?.length) {
      try { this.onDiscoveryDirty?.(id); } catch { } // debounced: one background compute + one broadcast
      // (r951) the list kept on disk, served while it is read again: its own age, and THAT reason — never «unreachable» for a
      // machine nobody has asked yet
      return lastKnownRows(this._persistedDisc[id].sessions, this._persistedDisc[id].at, 'discovery-rescan');
    }
    // One round trip: alive lock files + all project JSONLs (path, mtime, size)
    const script = `
      # R = B-16d7: THIS machine's real path of a cwd it lists — EVERY resolved one (equal: no link), the same list as the device's
      # (discovery-facts cwdsToResolve: live locks' and listed heads' cwds; an escaped JSON spelling, a relative path, a control
      # character never); stdin closed, no command kept in a variable (zsh never splits one)
      # (once per distinct cwd in a pipeline, only within 4 s of the scan's start (both loops share it), each under «timeout -k 1 2»;
      # none where the host has no timeout: an unbounded cd into a dead mount would hold the whole list)
      vs_t0=$(date +%s); vs_seen='|'; command -v timeout >/dev/null 2>&1 && vs_to=1 || vs_to=
      vs_real() { [ -n "$1" ] && [ -n "$vs_to" ] || return 0; case "$vs_seen" in *"|$1|"*) return 0 ;; esac; vs_seen="$vs_seen$1|"; [ $(( $(date +%s) - vs_t0 )) -lt 4 ] || return 0; case "$1" in /*) ;; *) return 0 ;; esac; case "$1" in *[[:cntrl:]]*|*\\\\*) return 0 ;; esac; vs_r=$(timeout -k 1 2 sh -c 'cd -P -- "$1" 2>/dev/null && pwd -P' _ "$1" </dev/null 2>/dev/null); case "$vs_r" in ''|*[[:cntrl:]]*) return 0 ;; esac; printf 'R %s\\t%s\\n' "$1" "$vs_r"; return 0; }
      find "$HOME"/.claude/sessions -maxdepth 1 -name '*.json' 2>/dev/null | while read -r f; do
        pid=$(basename "$f" .json)
        kill -0 "$pid" 2>/dev/null && { echo "LOCK $(cat "$f")"; vs_real "$(grep -o '"cwd":"[^"]*"' "$f" 2>/dev/null | head -n 1 | cut -d'"' -f4)"; }
      done
      # -printf is GNU-only — on macOS/BSD ssh hosts it errored into the
      # 2>/dev/null and the WHOLE remote history silently vanished (audit
      # 2.192.0). Probe once; BSD falls back to a stat -f loop (slower but
      # correct; Linux keeps the single-command fast path).
      if find "$HOME"/.claude -maxdepth 0 -printf '' 2>/dev/null; then GNUFIND=1; else GNUFIND=; fi
      if [ -n "$GNUFIND" ]; then
        find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' ! -name 'agent-*' -printf 'J %T@ %s %p\\n' 2>/dev/null | sort -rn -k2 | head -200
      else
        find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' ! -name 'agent-*' 2>/dev/null | while read -r f; do
          set -- $(stat -f '%m %z' "$f" 2>/dev/null); [ -n "$1" ] && echo "J $1 $2 $f"
        done | sort -rn -k2 | head -200
      fi
      # K = keeper session metas (~/.vibespace/run) — lets discovery classify a
      # keeper-managed claude as reattachable instead of generic 'external'
      # (B-4058: pod rebuild loses local state; the keeper+claude survive)
      find "$HOME"/.vibespace/run -maxdepth 1 -name '*.json' 2>/dev/null | while read -r kf; do
        printf 'K %s\\t' "$(basename "$kf" .json)"; head -c 4000 "$kf" | tr -d '\\n'; echo
      done
      # cwd from the head of each JSONL (projDir decode is ambiguous; the first
      # record may be a summary without cwd, so grep the first cwd field instead)
      { if [ -n "$GNUFIND" ]; then
          find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' ! -name 'agent-*' -printf '%T@ %p\\n' 2>/dev/null
        else
          find "$HOME"/.claude/projects -maxdepth 2 -name '*.jsonl' ! -name 'agent-*' 2>/dev/null | while read -r f; do
            m=$(stat -f '%m' "$f" 2>/dev/null); [ -n "$m" ] && echo "$m $f"
          done
        fi; } | sort -rn | head -60 | while read -r _ f; do
        vs_hc=$(head -c 16000 "$f" | grep -o '"cwd":"[^"]*"' | head -n 1); printf 'H %s\\t%s\\n' "$f" "$vs_hc"
        vs_real "$(printf '%s' "$vs_hc" | cut -d'"' -f4)"
        # up to 6 early user records (NOT just the first) — the first user turn is
        # often an injected <vibespace-task-context>/<system-reminder>; the JS side
        # skips those and takes the first REAL message (matches local naming).
        grep -m6 '"type":"user"' "$f" 2>/dev/null | while IFS= read -r u; do printf 'N %s\\t' "$f"; printf '%s' "$u" | head -c 2000; printf '\\n'; done
        # TT = the CLI's own title records (2.1.288 session_title_changed) in the head 256 KB + tail 64 KB windows —
        # the last 3; the JS side takes the newest parseable (discovery-facts titleFromText, ONE rule with local)
        { head -c 262144 -- "$f"; echo; tail -c 65536 -- "$f"; } 2>/dev/null | grep -F '"subtype":"session_title_changed"' | tail -n 3 | while IFS= read -r u; do printf 'TT %s\\t' "$f"; printf '%s' "$u" | head -c 2000; printf '\\n'; done
        # T = sessionIds seen in the file TAIL (last = current writer; records
        # carry the CURRENT id even when a resume kept the ORIGINAL filename).
        # uniq collapses runs (records from one session are consecutive).
        printf 'T %s\\t' "$f"; tail -c 65536 -- "$f" 2>/dev/null | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4 | uniq | tail -n 8 | tr '\\n' ','; echo
      done
      # C = codex rollouts (~/.codex/sessions) so codex terminal sessions run
      # remotely reappear as resumable STOPPED cards (B-10ed — they used to
      # vanish from the sidebar the moment they ended). HC = head cwd.
      if [ -d "$HOME/.codex/sessions" ]; then
        CDX=$({ if [ -n "$GNUFIND" ]; then
          find "$HOME"/.codex/sessions -type f \\( -name 'rollout-*.jsonl' -o -name 'rollout-*.jsonl.zst' \\) -printf 'C %T@ %s %p\\n' 2>/dev/null
        else
          find "$HOME"/.codex/sessions -type f \\( -name 'rollout-*.jsonl' -o -name 'rollout-*.jsonl.zst' \\) 2>/dev/null | while read -r f; do
            m=$(stat -f '%m %z' "$f" 2>/dev/null); [ -n "$m" ] && echo "C $m $f"
          done
        fi; } | sort -rn -k2 | head -100)
        [ -n "$CDX" ] && printf '%s\\n' "$CDX"
        # HC = head cwd; NC = the first user records (2000B each, the codex naming
        # rule picks the first non-injected one); a .zst rollout is read through
        # zstd(1) when the host has it, else it lists nameless. CO = rollouts held
        # OPEN by a codex process = RUNNING threads (no lock files in codex).
        # HC/NC ride the 30 NEWEST rollouts only (a head read each; an older
        # primary lists nameless); SC rides EVERY listed rollout (verifier r1,
        # 2026-09-24: inside the 30-slot loop 25 of 48 real sub-agents listed
        # as primary). The own session_meta is line 0 (~22 KB measured), so an
        # SC-only read takes 128 KiB. The daemon's HEAD_FACTS/SC_HEAD_BYTES twin.
        [ -n "$CDX" ] && printf '%s\\n' "$CDX" | { i=0; while read -r c m s f; do
          i=$((i+1)); if [ "$i" -le 30 ]; then N=200000; else N=131072; fi
          case "$f" in *.zst) HD=$( (command -v zstd >/dev/null 2>&1 && zstd -dc -- "$f" 2>/dev/null) | head -c "$N" );; *) HD=$(head -c "$N" -- "$f" 2>/dev/null);; esac
          if [ "$i" -le 30 ]; then
            printf 'HC %s\\t' "$f"; printf '%s' "$HD" | grep -o '"cwd":"[^"]*"' | head -n 1; echo
            printf '%s' "$HD" | grep -m3 '"role":"user"' | while IFS= read -r u; do printf 'NC %s\\t' "$f"; printf '%s' "$u" | head -c 2000; printf '\\n'; done
          fi
          # SC = the thread's classification (2026-09-24): thread_source /
          # parent_thread_id / agent_* from its OWN session_meta (the one whose
          # "id" is the file's thread id — a v2 sub-agent also copies its
          # parent's meta) — discovery-facts.classifyCodexThread reads them, so
          # a remote sub-agent lists as a sub-agent, never as the owner's own.
          TID=$(printf '%s' "$f" | sed -n 's/.*\\([0-9a-fA-F]\\{8\\}-[0-9a-fA-F]\\{4\\}-[0-9a-fA-F]\\{4\\}-[0-9a-fA-F]\\{4\\}-[0-9a-fA-F]\\{12\\}\\)\\.jsonl.*/\\1/p')
          [ -n "$TID" ] && printf '%s\\n' "$HD" | grep '"type":"session_meta"' | grep -m1 "\\"id\\":\\"$TID\\"" | { IFS= read -r ML || true; case "$ML" in *'"thread_source":"subagent"'*|*'"subagent":'*) printf 'SC %s\\t' "$f"; printf '%s' "$ML" | grep -oE '"(thread_source|parent_thread_id|agent_nickname|agent_path|agent_role|subagent)":"[^"]*"|"thread_spawn":[{]' | tr '\\n' ' '; echo;; esac; }
        done; }
${codexOpenRolloutsShell()}
      fi
    `.trim();
    let out, snapStale = null;   // B-5278 unit 2 (r849): the device answered its LAST snapshot, its age said
    let deviceWhy = null, deviceErr = null;   // (r951) the device's own named reply, remembered through the rungs below
    try {
      // CS data-plane (device data plane — always on since the 2.175.0 flag graduation): the daemon's raw-facts snapshot
      // SYNTHESIZED into the exact LOCK/J/H/N/T line format the ssh script
      // emits — the parser below runs UNCHANGED (zero interpretation drift).
      // Any failure falls through to the classic ssh script.
      out = null;
      if (this.dataPlaneOn?.() || h.transport === 'dial') {
        try {
          // HARD DEADLINE on the device path (2.246.2, userN's flapping
          // link): device(id) runs the connect retry ladder — up to ~13 ×
          // (8s handshake + backoff) ≈ 2.7 MINUTES — and a lossy path where
          // TCP opens but the ssh banner hangs (observed live: ssh blew past
          // ConnectTimeout=8, which only bounds the TCP connect) rides that
          // ladder to the end. Discovery is a read-only probe with TWO
          // fallbacks right below (legacy ssh script, 20s hard kill → stale
          // cache), so the sidebar sat on "Scanning sessions over ssh…" for
          // minutes while 85 cached sessions were one throw away. The race
          // doesn't cancel the background connect (deliberate — a later
          // success heals the device link for everyone else).
          const deadline = (p, ms, what) => Promise.race([p,
            new Promise((_, rj) => setTimeout(() => rj(new Error(`${what} deadline`)), ms).unref())]);
          const dm = await this.deviceBounded(id);
          // ── R5 SWITCHOVER (2.292.0): ask the DEVICE for finished session
          // cards (`discovery-claims`, dark since 2.291.0 with byte-identical
          // parity). The claim algorithm runs where the facts are; the
          // orchestrator's job shrinks to cross-machine merging. Ladder:
          // claims op → the snapshot+synthesize path (SAME shared functions,
          // just executed here) → legacy ssh script → stale cache. All three
          // rungs stay exercised; capability-gating degrades old daemons.
          let claimed = null;
          if ((await dm.connect?.())?.info?.capabilities?.includes?.('discovery-claims')) {
            try {
              const res = await deadline(dm.discoveryClaims({ hostId: h.id, hostName: h.name }), 15000, 'device-claims');
              if (res?.error) throw new Error(res.error);
              if (Array.isArray(res?.sessions)) claimed = res.stale ? staleSessions(res.sessions, res.stale) : res.sessions;
            } catch (e3) {
              if (discoveryCodeOf(e3)) { deviceWhy = discoveryCodeOf(e3); deviceErr = e3; }
              // B-5278 unit 2 (r849): a refusal is said ONCE a machine and reason (the rungs below stay as they were)
              if (!this._claimsSaid) this._claimsSaid = new Set();
              const said = `${id}\n${String(e3.message).slice(0, 80)}`;
              if (!this._claimsSaid.has(said)) { this._claimsSaid.add(said); console.warn(`[discovery] device claims failed for ${h.name} — falling back to server-side interpretation:`, e3.message); }
            }
          }
          if (claimed) {
            this._discoveryCache.set(id, { at: Date.now(), sessions: claimed });
            this._noteRealCwds(id, claimed);   // B-16d7
            try { this.convIndex.noteDiscovery(id, claimed); } catch { }
            if (!claimed.some((s) => s && s.stale)) this._persistDiscovery(id, claimed);   // an OLD list is never kept as the last-known one
            return claimed;
          }
          // (r1044) the snapshot ask would join the same walk: skipped when there is a last list to answer; (r1082's should) with none,
          // waiting on that same walk once more is the person's only road — joining it is no second walk
          if (NO_SECOND_WALK.has(deviceWhy) && this._hasLastList(id)) throw deviceErr;
          const snap = await deadline(dm.discoverySnapshot(), 12000, 'device-discovery');
          out = synthesizeDiscoveryLines(snap); // shared with the device's own discovery.v2 chain
          snapStale = snap && snap.stale ? snap.stale : null;
        } catch (e2) { out = null; if (discoveryCodeOf(e2)) { deviceWhy = discoveryCodeOf(e2); deviceErr = e2; } /* legacy fallback below */ }
      }
      // (r1044) never a second walk of the same home while its first walks on («still walking»); after a walk that ran out of its
      // bound or answered too much, the ssh road is skipped only when there is a last list — (r1082's should) a home never listed
      // keeps that road
      if (out == null && (deviceWhy === 'discovery-slow' || (NO_SECOND_WALK.has(deviceWhy) && this._hasLastList(id)))) throw deviceErr;
      if (out == null) out = await this._ssh(h, script, { timeoutMs: 20000 });
    } catch (e) {
      // Host unreachable — serve LAST-KNOWN (expired memory cache, else the
      // disk-persisted copy from a previous run) marked stale instead of
      // failing the sidebar into an empty remote zone (2.124.0).
      const last = this._discoveryCache.get(id) || this._persistedDisc[id];
      if (last && Array.isArray(last.sessions)) {
        // (r908 (3)) a row's OWN age is kept; (r951) its reason is the device's own reply when it gave one, else unreachable
        return lastKnownRows(last.sessions, last.at, deviceWhy);
      }
      // (r951) no list to show: a machine that answered by name is said by its own words (its code), never as unreachable
      if (deviceWhy) throw Object.assign(new Error(`${h.name}: ${deviceErr.message}`), { code: deviceWhy });
      throw e;
    }
    const read = interpretDiscoveryLines(out, { hostId: h.id, hostName: h.name, claimJsonls });
    const sessions = snapStale ? staleSessions(read, snapStale) : read;
    this._discoveryCache.set(id, { at: Date.now(), sessions });
    this._noteRealCwds(id, sessions);   // B-16d7
    try { this.convIndex.noteDiscovery(id, sessions); } catch { }
    if (!snapStale) this._persistDiscovery(id, sessions);   // an OLD list is never kept as the last-known one
    return sessions;
  }
}

/** THE remote Terminate script (`killRemotePid`) — the OTHER kill path, and
 *  the one B-3185 left behind (r4, found by review).
 *
 *  It used to decide "may I SIGTERM this pid?" with
 *  `case "$(ps -p N -o args=)" in *claude*|*codex*)` — the exact whole-argv
 *  substring rule the sweep retired, still live on a path that KILLS, on a
 *  machine the user cannot see. Everything the retired rule got wrong applies
 *  here verbatim and worse: a remote `tail -f ~/.claude/projects/<id>.jsonl`,
 *  an editor with the transcript open, a wrapper whose ARGUMENTS name
 *  `…/bin/codex`, or a dtach master carrying the whole `claude --resume …`
 *  command line (SIGTERMing which DESTROYS the session) all matched — and the
 *  route answered `{success:true}`, so the user was told the terminate worked.
 *
 *  It now asks the ONE identity (src/cli-identity.js, embedded as shell text
 *  because a host has no checkout), for BOTH CLI names, exactly like the sweep.
 *
 *  THE EXISTENCE TEST WAS `ps -p N -o args=`, AND BUSYBOX `ps` HAS NO `-p`
 *  (r5, found by review). Measured on this box, busybox 1.37.0: `ps -p N -o
 *  args=` prints `ps: invalid option -- 'p'` + a usage block to STDERR and
 *  exits 1, so the capture — whose whole point was `2>/dev/null` — is EMPTY
 *  for every pid alive or dead. On a host whose login shell lives in busybox
 *  (Alpine images, embedded boxes, any `ash` rootfs — and remember both ssh
 *  rungs hand this text to the REMOTE USER'S shell, the r3 lesson), EVERY
 *  Terminate answered `VS_GONE` and `killRemotePid` returned
 *  `{success:true, gone:true}` while NOTHING had been signalled: the route
 *  told the user the process was already gone, the sidebar flipped the card,
 *  and the CLI kept running and kept writing. A capability the probe does not
 *  have must never read as a FACT about the pid.
 *
 *  EXISTENCE IS NOW A LADDER, AND EVERY RUNG IS POSITIVE EVIDENCE (`vs_alive`,
 *  whose text and full rationale live in src/cli-identity.js — ONE definition
 *  since r6, embedded here and by sysinfo-wiring's `signalProc`). `kill -0`
 *  succeeding is proof; its FAILURE is ambiguous (EPERM and ESRCH share an
 *  exit status) so it is handed to `[ -d /proc/N ]` and then `ps -p N` rather
 *  than believed. Only when all three say nothing do we say `VS_GONE`.
 *
 *  r5 ENUMERATED THE SIBLING AND LET IT KEEP ITS OWN `ps -p` ON A REASON — and
 *  the reason was wrong (r6, found by review): `signalProc`'s script has TWO
 *  `ps -p` calls, and "it sits on the FAILURE branch of a kill that already
 *  happened" was only true of the second. The first is the post-signal
 *  aliveness check on the SUCCESS branch, where a busybox-blind probe
 *  manufactures a false `{ok:true, gone:true}` (measured). Both sites now
 *  embed this ladder, and the suite's standing sweep refuses any `ps -p` used
 *  as an existence test on a kill/signal path.
 *
 *  …AND "I COULD NOT LOOK" IS NOT "IT IS NOT AN AGENT" (r5). Once the pid is
 *  known to exist, `vs_is_cli` returning false has two very different causes:
 *  we read its argv/exe and it is a `tail` (a FINDING), or we could read
 *  NEITHER (no /proc AND a `ps` that cannot answer — precisely the busybox +
 *  no-/proc combination above). `vs_known` separates them, so the outcomes are
 *  now FOUR: `VS_GONE` (no rung can see the pid), `VS_OK` (killed),
 *  `VS_NOTAGENT` (alive, evidence read, not an agent CLI), `VS_UNKNOWN`
 *  (alive, NO evidence readable — nothing was signalled, and the caller says
 *  so rather than inventing either of the other three).
 *
 *  Exit status: every branch ends 0 except a failing `kill`, which is the ONE
 *  thing the caller does want to hear about (`_ssh` rejects a non-zero exit) —
 *  a FINDING never decides the status (the r2 lesson), only the ACT does. */
function killPidShell(pid) {
  const p = Number(pid);
  // The pid is interpolated into shell text: it must be a number, here, at the
  // one place that builds the text — never "the caller validated it".
  if (!Number.isInteger(p) || p <= 1) throw new Error('bad pid');
  return `${cliIdentityShellFns()}
${pidAliveShellFn()}
vs_known() {
  # Did we manage to READ anything about this pid? The same two sources
  # vs_is_cli uses, in the same order, through the same capture — so
  # "not an agent" is only ever said about evidence we actually held.
  vs_cap vs_argv "$1" 0
  [ -n "$vs_c_v" ] && return 0
  vs_cap readlink "/proc/$1/exe"
  [ -n "$vs_c_v" ]
}
if ! vs_alive ${p}; then echo VS_GONE
elif vs_is_cli ${p} claude || vs_is_cli ${p} codex; then kill -TERM ${p} && echo VS_OK
elif vs_known ${p}; then echo VS_NOTAGENT
else echo VS_UNKNOWN
fi`;
}

/** CO leg of the ssh discovery script: rollout files held OPEN by a codex
 *  process = RUNNING threads (codex has no lock files). THE STANDING-SWEEP TWIN
 *  OF B-3185 (r2): this leg used to carry all three shapes that fix retired —
 *  a `tr` + `grep` fork PAIR per process over `/proc/[0-9]*` (7356 forks on a
 *  3700-process host, inside a 20s discovery budget that runs per host, per
 *  sweep), a `readlink` fork PER FD under every match, and an identity test
 *  that regex-matched the WHOLE argv (so a VibeSpace wrapper or dtach master
 *  carrying `…/bin/codex resume <tid>` as ARGUMENTS answered "codex" and its
 *  inherited rollout fd marked a dead thread RUNNING). It now runs the SHARED
 *  shell functions from src/writer-sweep.js — one batched `ls -l` per 400 fd
 *  directories plus the executable identity test — so the sweep and discovery
 *  agree on "is this process the codex CLI" by construction.
 *
 *  `read -r copid cot` relies on default IFS: the pid is the first field and
 *  the REST of the line (the fd target, spaces included) lands in `cot`.
 *
 *  THE lsof BRANCH IS THE SAME RULE TOO (r3). It was left "unchanged" through
 *  r1/r2 because macOS/BSD hosts have no /proc — but "no /proc" only changes
 *  how you ENUMERATE holders, not how you decide whether a holder is the CLI,
 *  and it was still asking lsof's COMMAND field (`c ~ /codex/`): comm, matched
 *  as a SUBSTRING, so `codex-keeper`, `codexd` or a dtach master renamed after
 *  the thread marked a dead thread RUNNING on every mac host. It now emits
 *  `p`+`n` (pid + name) and runs the SAME `vs_is_cli`, so the identity rule is
 *  one rule on both rungs of both branches. The function definitions therefore
 *  moved ABOVE the `if`: emitted inside the `then` block they did not exist in
 *  the `else` branch at all.
 *
 *  THE TRAILING `:` IS LOAD-BEARING. This leg is the LAST thing in the ssh
 *  discovery script, so its status IS the script's status — and `_ssh` REJECTS
 *  a non-zero exit, which sends the whole host's discovery into the
 *  serve-stale-cache catch. A `while read` loop exits with its LAST iteration's
 *  status, so this leg would exit 1 whenever the last matching fd under $HOME
 *  belonged to a process that is not the codex CLI (a reader, a wrapper, a
 *  dtach master) — data-dependent, invisible in a run that happens to end on a
 *  real app-server, and caught only because the suite runs the leg for real
 *  against a fixture HOME. Never let a scan's FINDINGS decide a script's exit
 *  status. */
function codexOpenRolloutsShell() {
  return `${fdScanShellFns()}
${cliIdentityShellFns()}
        if [ -d /proc/self ]; then
          vs_fd_scan "/rollout-[^/]*[.]jsonl" | while read -r copid cot; do
            case "$cot" in "$HOME"/.codex/sessions/*rollout-*.jsonl|"$HOME"/.codex/sessions/*rollout-*.jsonl.zst) ;; *) continue;; esac
            vs_is_cli "$copid" codex && echo "CO $cot"
          done
        else
          lsof -Fpn +D "$HOME"/.codex/sessions 2>/dev/null | awk '/^p/{p=substr($0,2)} /^n/ && $0 ~ /rollout-.*\\.jsonl(\\.zst)?$/ {print p "\\t" substr($0,2)}' | while read -r copid cot; do
            vs_is_cli "$copid" codex && echo "CO $cot"
          done
        fi
        : # what this leg FOUND must never become the discovery script's exit status`;
}

// ── Bootstrap ──
// One ssh session runs a step-marked script; the caller receives structured
// progress events (step start/ok/fail) plus the raw log stream — the UI shows
// a step list with an expandable live log. Idempotent: every step checks
// before installing.
const i18nKey = (s) => s; // the extraction marker (scripts/i18n-extract.mjs) — the page words each step through t()
const BOOTSTRAP_STEPS = [
  { key: 'connect', label: i18nKey('Connect') },
  { key: 'dtach', label: i18nKey('dtach (keeps sessions alive)') },
  { key: 'node', label: 'Node.js' },
  { key: 'claude', label: 'Claude Code CLI' },
];

function bootstrapScript() {
  return `
set -u
export PATH="$HOME/.local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
step() { echo "::STEP:$1:$2::"; }
step connect start
echo "connected: $(uname -sm) — $(whoami)@$(hostname)"
step connect ok

step dtach start
if command -v dtach >/dev/null 2>&1; then
  echo "dtach already installed: $(command -v dtach)"
  step dtach ok
else
  echo "dtach missing — trying package managers (needs passwordless sudo) then source build"
  if command -v brew >/dev/null 2>&1 && brew install dtach >/dev/null 2>&1; then
    echo "installed via Homebrew"
    step dtach ok
  elif sudo -n apt-get install -y dtach >/dev/null 2>&1 || sudo -n yum install -y dtach >/dev/null 2>&1 || sudo -n dnf install -y dtach >/dev/null 2>&1; then
    echo "installed via package manager"
    step dtach ok
  elif command -v gcc >/dev/null 2>&1 || command -v cc >/dev/null 2>&1; then
    tmp=$(mktemp -d) && cd "$tmp" \\
      && curl -fsSL -o dtach.tar.gz https://github.com/crigler/dtach/archive/refs/tags/v0.9.tar.gz \\
      && tar xzf dtach.tar.gz && cd dtach-0.9 && ./configure >/dev/null && make >/dev/null \\
      && mkdir -p "$HOME/.local/bin" && cp dtach "$HOME/.local/bin/" \\
      && echo "built from source into ~/.local/bin/dtach" && step dtach ok \\
      || step dtach fail
    cd "$HOME"
  else
    echo "no sudo and no compiler — install dtach manually"
    step dtach fail
  fi
fi

step node start
if command -v node >/dev/null 2>&1; then
  echo "node already installed: $(node --version)"
  step node ok
else
  echo "installing node via nvm…"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" 2>/dev/null
  nvm install --lts >/dev/null 2>&1 && echo "node $(node --version) via nvm" && step node ok || step node fail
fi

step claude start
if command -v claude >/dev/null 2>&1 || [ -x "$HOME/.local/bin/claude" ]; then
  echo "claude already installed: $(claude --version 2>/dev/null || "$HOME/.local/bin/claude" --version 2>/dev/null)"
  step claude ok
else
  echo "installing Claude Code (native installer)…"
  curl -fsSL https://claude.ai/install.sh | bash >/dev/null 2>&1 \\
    && echo "installed: $($HOME/.local/bin/claude --version 2>/dev/null || echo done)" && step claude ok || step claude fail
fi
echo "::DONE::"
`.trim();
}

HostManager.prototype.bootstrapSteps = () => BOOTSTRAP_STEPS.map(s => ({ ...s }));

/**
 * Run the bootstrap; onEvent receives {type:'step', key, status} and
 * {type:'log', line} events. Resolves with the final step map.
 */
HostManager.prototype.bootstrap = function (id, onEvent) {
  const h = this.get(id);
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const steps = Object.fromEntries(BOOTSTRAP_STEPS.map(s => [s.key, 'pending']));
    const child = spawn('ssh', [...this.sshArgs(h), 'bash -s'], { env: this.sshEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let spawnErr = null; child.on('error', (e) => { spawnErr = e; }); // no ssh at all is an answer too, never an uncaught
    const fed = feedStdin(child, bootstrapScript());
    let buf = '', lastErrLine = '';
    const feed = (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        const m = line.match(/^::STEP:(\w+):(\w+)::$/);
        if (m) {
          steps[m[1]] = m[2] === 'start' ? 'running' : m[2];
          onEvent({ type: 'step', key: m[1], status: steps[m[1]] });
        } else if (line === '::DONE::') { /* final resolve below */ }
        else if (line.trim()) onEvent({ type: 'log', line: line.slice(0, 500) });
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', (chunk) => { const l = String(chunk).trim().split('\n').filter(Boolean).pop(); if (l) lastErrLine = l; feed(chunk); });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 10 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      for (const k of Object.keys(steps)) if (steps[k] === 'pending' || steps[k] === 'running') steps[k] = 'fail';
      const refusal = sshRefusal(h, code !== 0 ? { code: spawnErr ? spawnErr.code : code } : null, lastErrLine || (spawnErr && spawnErr.message) || '', fed);
      if (refusal) onEvent({ type: 'log', line: refusal.message.slice(0, 500) });
      onEvent({ type: 'done', code, steps, ...(refusal ? { refusal: refusal.code } : {}) });
      resolve(steps);
    });
  });
};

module.exports = { HostManager, lastKnownRows, staleSessions, NO_SECOND_WALK, PASSIVE_PEEK_SH, passiveOfPeek, passiveLeftOfPeek, USAGE_HARVEST_LIMITS, usageScanBound, codexOpenRolloutsShell, killPidShell, installAgentdScript, installAgentdAnswer, feedStdin, sshRefusal, unreachableError, refusalBody, parseSshG, configVerdict, sshRecordRefusal, sshPortOf, dialRootOk, dialRootOf };
