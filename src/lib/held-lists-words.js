// PURE (B-f276 family unit B, 主开发 r3032, lane bl-phone-ui): THE ONE NOTICE's words — a held list's PLAIN name by what the hub names
// it (a store's file base name, an older hold's key — never shown), the chip's words, a row's line, the section's sentence, a press's
// answer. `t` is the page's; times come in already worded (page-time). Nothing here names a file, a path or a value.
const i18nKey = (s) => s;   // a declared visible template (scripts/i18n-extract)
const NAMES = Object.freeze({
  'mounts.json': i18nKey('the storage list'), 'login-expiry.json': i18nKey('the record of the login warnings already filed'), 'sysinfo-history.json': i18nKey('the CPU and memory history'), 'device-upgrades.json': i18nKey('the record of the agent updates of your machines'), 'dial-health.json': i18nKey('the record of extra agents dialing in to your machines'), 'turn-carry-outstanding.json': i18nKey('the record of the conversations a restart interrupted'), 'cli-self-measure.json': i18nKey('this hub’s record of the Claude Code builds it measured'), /* lane lg-remote-hardening, r4718 (B-f276): the two machine watches' ledgers */ 'stash-handover.json': i18nKey('the record of messages already handed to agents'), 'msg-stash.json': i18nKey('the messages waiting for agents'), 'mount-tokens.json': i18nKey('the folder links'), 'plugins.json': i18nKey('the plugins’ settings'),
  'user-todos': i18nKey('For you'), 'task-groups': i18nKey('the Task Groups'), 'hosts.json': i18nKey('the paired machines'), 'machine-mounts.json': i18nKey('the mounts of your paired machines'), 'host-mounts.json': i18nKey('an older list of folders shared with your machines'), 'device-mounts.json': i18nKey('an older list of your machines’ folders mounted here'),   /* lane lg-remote-hardening, r4985 (B-f276): the legacy mount stores */   // 2b: both on the helper (each row is its file's)
  // the stores that joined the helper on the hotfix's tip (r3224 / r3233 — the family's rows): each list's plain name
  'accounts.json': i18nKey('your accounts list'),
  'window-leases.json': i18nKey('the record of which agent holds which window'), 'window-reach.json': i18nKey('the share mode of each window'),   // lg-recovery (B-f276 slice window-targets): the window engine's two stores
  'port-forwards.json': i18nKey('the list of port forwards'),   // bl-machines-a (lines 702 + 749): the Ports panel's list
  'instance-url.json': i18nKey('the publish setting of this VibeSpace'),   // bl-machines-a (line 646): «Publish this VibeSpace»
  'instance.json': i18nKey('this VibeSpace’s own id'),   // 主开发 r3336 (src/auth.js): the sign-in's id file (a notice never names the folder)
  'app-proposals.json': i18nKey('the app proposals'),
  'auto-resume.json': i18nKey('the record of waiting continues'),
  'browser-forgotten.json': i18nKey('the browsers you set aside'),
  'browser-kept.json': i18nKey('the list of kept browsers'),   // card-door-in-chat (r3585)
  'bindings.json': i18nKey('which browser belongs to which conversation'),   // card-door-in-chat (r3585: browser-env/bindings.json)
  'api-proposals.json': i18nKey('the API proposals'),
  'decision-examples.json': i18nKey('the labels you taught'),
  'designs.json': i18nKey('the list of designs'),
  'feedback-outbox.json': i18nKey('the feedback waiting to be sent'),
  'doc-owners.json': i18nKey('the list of who owns each document window'),   // r3332 (lane bl-proposals)
  'feedback.json': i18nKey('the feedback reports'),
  'extract-journal.json': i18nKey('the record of unfinished extractions'),   // r3333 unit 2 (lane lg-group-parents): the archive extraction journal
  'providers.json': i18nKey('the list of model providers'),
  // r3333 unit 3 (lane lg-group-parents): four small stores
  'voice-suggestions.json': i18nKey('the voice dictionary suggestions'),
  'cli-unmeasured-notice.json': i18nKey('the record of the unmeasured Claude Code notice'),
  'maintenance.json': i18nKey('the maintenance banner'),
  'cli-model-catalog.json': i18nKey('the Claude Code model catalog'),
  // B-f276 (lane hub-loop-stalls, r4719): four said-once records
  'hook-root-notice.json': i18nKey('the record of the agent hooks notice already said'),
  'state.json': i18nKey('the HTTPS record'),   // data/tls/state.json (src/server/tls.js): the only store held under this base name
  'browser-login-reminders.json': i18nKey('the record of the sign-in reminders already filed'),
  'cli-registration.json': i18nKey('the record of the Claude Code builds already said'),
  '__models__.json': i18nKey('the list of models learned from conversations'),   // B-f276 s1126: usage-cache/__models__.json (src/server/cli-env.js)
  'published-pages.json': i18nKey('the list of published pages'),
  'setting-holds.json': i18nKey('the raised spending ceilings'),
  'vault-use-marks.json': i18nKey('who may use your stored values'),
  'session-status.json': i18nKey('the conversations’ statuses'),
  // the stores of the units picked into the hotfix's trial after the chain (主开发 r3314)
  'callers.json': i18nKey('the webhook callers'),
  'pair-pending.json': i18nKey('the pending pairing codes'),
  'vault-grants.json': i18nKey('who may receive your two-step codes'),
  'usage-reset-claims.json': i18nKey('the reset marks'),
  'vault-grant-ends.json': i18nKey('the list of approvals that ended'),   // lg-vault-env's own plain name (r3377)
  'vault-run-tools.json': i18nKey('the record of the sealed tools'),   // lg-vault-env's tools record (r5367)
  'people.json': i18nKey('a channel account’s list of people'),   // bl-mail (line 698, 主开发 r3608): a channels account's people memo — one hold an account, each listed by this name
  'agent-door.json': i18nKey('the port remote conversations reach their tools by'),   // r3333 unit 1 (lane lg-group-parents): the agent door's record
  'opencode-serve.json': i18nKey('the record of the OpenCode background service'),   // bl-chat-b's own plain name (r3334 unit 1)
  'plugin-registry.json': i18nKey('which plugins are on and trusted'),
  'vault.json': i18nKey('your vault'),   // lg-vault-env's vault record (unit (b), the train 2.369.418)
  'browser-passkeys.json': i18nKey('the browsers’ passkeys'),   // r3261 (bl-browser-b): the passkey store joined the helper
  'pricing.json': i18nKey('your edited prices'),   // bl-ci's own plain name (r3145 unit 2: usage-history/pricing.json; r3488)
  // lg-recovery: the synced stores (src/sync-store.js, one create site, a store per file — r3489: the rows in the unit)
  'drafts.json': i18nKey('your saved drafts'), 'stage-sync.json': i18nKey('the Stage layout'), 'uploads-sync.json': i18nKey('the list of recent uploads'), 'settings-sync.json': i18nKey('the synced settings'),
  'browser-takeovers.json': i18nKey('the requests waiting for you to take over'),   // r3261 (bl-browser-b): the takeover requests joined the helper
  'dropline-oauth.json': i18nKey('your voice sign-in'),   // bl-chat-b's own plain name (r3334 unit 2)
  // B-f276 family (form 3 rank 6, lane bl-loop-a, r3175): the paid judge's counter and memo
  'decision-usage.json': i18nKey('the language model plugin’s spending record'),
  'decision-memo.json': i18nKey('the language model plugin’s saved answers'),
  'decision-journal.jsonl': i18nKey('the language model plugin’s journal of calls'),   // r4121: the journal's own hold, an older row of the list (the engine's heldRow)
  'otel-token': i18nKey('the sign-in value your conversations report their usage with'),   // B-f276 family unit 2: the OTel sign-in value's own hold, an older row of the list
  'auto-cli-state.json': i18nKey('the automatic usage reads — paused while their pacing record cannot be read'),   // B-574d (主开发 r5143): the auto-cli loop's unknown wait, an older row of the list (the loop's heldRow) — shown only while the automatic reads are on (r5213)
  '.instance-id': i18nKey('this VibeSpace’s anonymous usage id'),   // B-f276 (r4721, lane lg-vault-stages): data/telemetry/.instance-id on the helper
  'jobs.lock': i18nKey('Background Work’s lock'),   // B-f276 slice jobs-side-files (lane bl-proposals s1126): held, no job starts and no record changes
  'exit.json': i18nKey('a background job run’s end record'),
  'pid.json': i18nKey('a background job run’s process record'),   // B-f276, the stamp unit (lane bl-proposals): held, that run is judged once it reads   // B-f276 slice jobs-side-files (s1126): held, that run waits to be judged
});
/** r3314: a store the hub holds as ONE FILE PER THING is named by the file's shape (a conversation's record: data/session-meta/cw-<seq>-<ms>.json) */
const NAMED_BY_SHAPE = Object.freeze([Object.freeze([/^cw-\d+-\d+\.json$/, i18nKey('a conversation’s saved details')]),
  Object.freeze([/^host-[\w.-]+\.token$/, i18nKey('a paired machine’s link token')])]);   // B-f276 (r4721): data/agentd/host-<id>.token (the no-vault window), one file a machine
/** the names this module knows (a lane whose store joins adds its name here — the census reds a held store with none) */
export const HELD_NAMED = Object.freeze(Object.keys(NAMES));
const nameKey = (what) => { const w = String(what || ''); return Object.prototype.hasOwnProperty.call(NAMES, w) ? NAMES[w] : (NAMED_BY_SHAPE.find(([re]) => re.test(w)) || [])[1] || null; };
/** true when the notice has a plain name for what the hub names a held list (the names' census asks it) */
export function heldNamed(what) { return !!nameKey(what); }
export function heldListName(what, t) { const k = nameKey(what); return k ? t(k) : t(i18nKey('a saved list')); }
export function heldChipWords(n, t) { return t(i18nKey('Lists unreadable · {n}'), { n }); }
export function heldChipTitle(t) { return t(i18nKey('Some of VibeSpace’s lists cannot be read right now — the system panel names them')); }
export function heldSectionTitle(t) { return t(i18nKey('Lists that could not be read')); }
export function heldSectionNote(t) { return t(i18nKey('Nothing is written over these lists, and changes to them wait until they read. VibeSpace reads them again by itself.')); }
export function heldPressLabel(t) { return t(i18nKey('Read again now')); }
/** a next try whose time has passed (r3212): worded, never a time in the past */
export function heldSoonWord(t) { return t(i18nKey('in a moment')); }
/** one row: its plain name, since when, the next try (each worded by the caller; '' = not known) */
export function heldRowWords(row, t, { since = '', next = '' } = {}) {
  const name = heldListName(row && row.what, t);
  if (since && next) return t(i18nKey('{name} — since {since}, next try {next}'), { name, since, next });
  if (since) return t(i18nKey('{name} — since {since}'), { name, since });
  return name;
}
/** the press's answer → its toast { text, tone } */
export function heldPressWords(r, t) {
  if (!r) return { text: t(i18nKey('Could not reach the server')), tone: 'error' };
  if (r.code === 'held_read_too_soon') return { text: t(i18nKey('They were just read again — try again in a few seconds.')), tone: 'warn' };
  if (r.code === 'held_read_running') return { text: t(i18nKey('They are being read again right now.')), tone: 'info' };
  if (r.error || r.ok === false) return { text: t(i18nKey('Could not read them again — try again in a moment.')), tone: 'error' };   // never the hub's English
  const n = Array.isArray(r.lists) ? r.lists.length : 0;
  return n ? { text: t(i18nKey('{n} still could not be read — VibeSpace keeps reading them again by itself.'), { n }), tone: 'warn' } : { text: t(i18nKey('Every list reads again.')), tone: 'ok' };
}
