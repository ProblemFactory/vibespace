// THE ENTRY LABEL OF A CHAT-MODE CLAUDE START — PURE (imports nothing; the Claude adapter reads it, so it is an input of the
// device agent's bundle — it carries NO word of a person's: the words are src/lib/entry-label-words.js). 主开发 r4483, the
// owner's word (2026-11-25): a SETTING (claude.entryLabel, src/harness-settings.js) for the name a chat-mode Claude
// conversation's CLI reports on its requests (its entry label), off by default, the person's choice.
//
// THE FACTS IT STANDS ON (read by the coordinator from the installed CLI 2.1.322's own text — never read by this lane):
//   - every request's billing line carries cc_entrypoint, taken from the environment name CLAUDE_CODE_ENTRYPOINT as it stands;
//   - at its start the CLI KEEPS a value already set, except one: «cli» on a non-interactive start is rewritten BY THE CLI to
//     sdk-cli — so no «cli» choice is offered (the vendor means cli for interactive starts only), and a typed «cli» is refused;
//   - the vendor's own rule for a name on requests: 1 to 32 characters of a–z, 0–9, _ and -, starting with a letter, not starting
//     with sdk; reserved: every entry name of the vendor's own, any name beginning with remote, and local_projects.
// Chat mode runs the CLI's NON-INTERACTIVE stream start on pipes, which the CLI labels sdk-cli; a terminal conversation is the
// CLI's interactive start, labelled cli — the adapter's ONE env name (src/adapters/claude-code.js) is for chat mode only.
// UNPROVEN until the measurement's reading: that the stream protocol behaves the same under a name the CLI does not know
// (src/claude-oat-probe.js's `entry` variant records it).
//
// THE STORED VALUE IS ONE STRING (the row is a combobox, like the default model): 'off' (or nothing) = pass nothing, the CLI's own
// label; 'vibespace' = our fixed name; any other string = a name the person typed (Custom…), judged by nameVerdict.

const ENTRY_VAR = 'CLAUDE_CODE_ENTRYPOINT';
const OFF = 'off';
const OURS = 'vibespace';
/** The row's listed choices (the combobox adds Custom… for a typed name). NO «cli» among them. */
const CHOICES = Object.freeze([OFF, OURS]);
/** The vendor's own entry names, as its text lists them (each refused as a typed name). */
const VENDOR_NAMES = Object.freeze(['cli', 'mcp', 'sdk-cli', 'sdk-ts', 'sdk-py', 'bench', 'claude-vscode', 'claude-code-github-action',
  'local-agent', 'local_agent', 'claude-desktop', 'claude-desktop-3p', 'claude-in-teams', 'claude_in_slack', 'claude-in-slack', 'ssh-remote',
  'claude-coworker', 'claude-coworker-terminal', 'claude-security']);
const RESERVED = Object.freeze(['local_projects']);
/** The resolved account kind of a third-party provider's conversation (src/server/provider-spawn.js answers { kind: 'provider' }):
 *  its requests go to that provider's own address, not the vendor's — the owner's ask is the vendor's service (主开发 r4672 (1)). */
const PROVIDER_KIND = 'provider';
const NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/;
/** The refusal codes, in the order nameVerdict asks. */
const REFUSALS = Object.freeze(['entry_name_empty', 'entry_name_shape', 'entry_name_cli', 'entry_name_sdk', 'entry_name_vendor', 'entry_name_remote', 'entry_name_reserved']);

/** A typed name's verdict, refused BY NAME with its reason's code: `{ok: true, name}` | `{ok: false, code}` (REFUSALS order:
 *  empty · shape (the characters, the length, the first letter) · cli (the CLI rewrites it on a chat start) · sdk (a name
 *  starting with sdk) · vendor (one of the vendor's own names) · remote (a name starting with remote) · reserved). */
function nameVerdict(name) {
  const n = name == null ? '' : String(name);
  if (!n) return { ok: false, code: 'entry_name_empty' };
  if (!NAME_RE.test(n)) return { ok: false, code: 'entry_name_shape' };
  if (n === 'cli') return { ok: false, code: 'entry_name_cli' };
  if (n.startsWith('sdk')) return { ok: false, code: 'entry_name_sdk' };
  if (VENDOR_NAMES.includes(n)) return { ok: false, code: 'entry_name_vendor' };
  if (n.startsWith('remote')) return { ok: false, code: 'entry_name_remote' };
  if (RESERVED.includes(n)) return { ok: false, code: 'entry_name_reserved' };
  return { ok: true, name: n };
}

/** The stored value as one start reads it: `{on: false}` (off, nothing stored, an empty Custom… field) | `{on: true, name,
 *  typed}` (typed: the person's own name, not a listed choice) | `{on: false, refused: code, typed: true}` (a typed name the
 *  rule refuses: NOTHING is passed — the CLI's own label stands, never a half-applied name). */
function entryLabelOf(value) {
  const v = value == null ? '' : String(value);
  if (v === '' || v === OFF) return { on: false };
  if (v === OURS) return { on: true, name: OURS, typed: false };
  const r = nameVerdict(v);
  return r.ok ? { on: true, name: r.name, typed: true } : { on: false, refused: r.code, typed: true };
}

/** The name a start passes (CLAUDE_CODE_ENTRYPOINT's value), or null: a CHAT start with the setting on and a name the rule takes,
 *  on an account that is not a third-party provider's. A terminal start never — its own label (cli) is the true one; a start that
 *  names no mode never; a provider's conversation never (its requests are not the vendor's: the account's kind, a fact of the
 *  resolved account, never a guess from an address). */
function entryNameFor({ mode = null, value = null, accountKind = null } = {}) {
  if (mode !== 'chat') return null;
  if (accountKind === PROVIDER_KIND) return null;
  const l = entryLabelOf(value);
  return l.on ? l.name : null;
}

module.exports = { ENTRY_VAR, OFF, OURS, CHOICES, VENDOR_NAMES, RESERVED, PROVIDER_KIND, NAME_RE, REFUSALS, nameVerdict, entryLabelOf, entryNameFor };
