'use strict';
// LOCAL MIGRATION REGISTRY (2.328.0, plan B step 1): the instance's one-shot
// data migrations, run at boot BEFORE restoreSessions through the SHARED
// runner (src/migration-runner.js — the daemon runs its own registry through
// the same runner device-side). Ledger: data/migrations.json. Add new
// migrations APPEND-ONLY with a dated id; never edit a shipped one (instances
// that already ran it will not re-run — ship a follow-up instead). Pattern:
// archive, then strip — never destroy.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runMigrations, failedLine } = require('../migration-runner.js'); // failedLine: an error's first line as a screen may carry it
const MR = require('../migration-reads.js'); // MG1 (r2929): a migration whose input could not be READ has not run — its strict readers (only «not there» is nothing to do)
const { RETIRED_2026_10, stripRetiredSettings } = require('../retired-settings.js'); // PURE: the one retired-key list (the schema re-exports it); 2026-10-settings-rows-retired strips the keys it shipped with
const { redactSecrets } = require('../secret-shapes.js'); // PURE: the one secret-shape rule (2026-10-job-secrets-retired shows no name it flags)
const { renameSynced } = require('../fd-close.js'); // B-574d (lane nl-migrations): the tree's one synced replace (replaceSynced below)
/** B-574d, the slice «hub-migrations» (lane nl-migrations): EVERY store, record or archive this registry rewrote by its own temp +
 *  rename takes its name only after ONE sync of its temp (not yet: the runner's ledger, src/migration-runner.js, and a helper
 *  module's own writer such as src/fixture-ledger-purge.js — other slices of B-574d) — src/fd-close.js renameSynced (written whole, synced, its close judged, renamed), synchronous as the
 *  bare temp + rename it replaces, so no reader's timing moves. A sync or a close that FAILS is a failed write: thrown, the temp
 *  removed, the old file standing — the migration is NOT recorded and runs again at the next start, never «applied» over bytes that
 *  may not be on disk (after a power cut such a store came back empty or torn, and was then held as damaged). Only a file system
 *  that does no sync at all lets the bytes take their name, said once in the journal (the file's name and the code, no path).
 *  A failed RENAME (the last step) throws too, and leaves its temp beside the store as the bare rename did (dropWarmthDerived
 *  removes its own): a fixed «<store>.tmp» is written again by the next run's open, a «<store>.<pid>.tmp» (eight of the sites)
 *  stays beside its store until someone removes it — litter, never read as the store.
 *  `mode` as writeFileSync's (undefined: 0o666 under the umask). */
function replaceSynced(tmp, file, text, mode) {
  renameSynced(tmp, file, text, { mode, where: `[migrate] ${path.basename(file)}`, say: (line) => console.warn(line) });
}

/** THE ACCOUNTS LIST UNREAD (主开发 r3044 (3)): an account-store migration over a list it could not read has NOT run — it throws,
 *  is not recorded, and the runner tries it again at the next start (only «not there» is nothing to do). Asked through the
 *  store's ONE fact (accounts.held()) on the live road, the read's own failure on the store-less one. */
function heldThrows(am) {
  let h = null; try { h = typeof am.held === 'function' ? am.held() : null; } catch { h = { code: 'held-unknown' }; }
  if (h) throw new Error(`the accounts list could not be read (${h.code || 'unread'}) — not run; tried again at the next start`);
}
// r3615 (the should, r3246 (2)'s words): bytes that do not parse never mend by themselves — the refusal says the person's way out
const accountsUnread = (e) => new Error(e instanceof SyntaxError || !(e && e.code)
  ? 'data/accounts.json is there and its bytes do not parse — not run: it does not mend by itself; move it aside (or restore it) and the next start runs it again'
  : `data/accounts.json could not be read (${e.code}) — not run; tried again at the next start`);
/** 2026-09-runaway-parks-void: the old guard's sentence and what replaces it. */
const OLD_RUNAWAY_PREFIX = 'stopped as a runaway: RSS ';
const RUNAWAY_VOID_TEXT = 'stopped by the old resource guard (a per-process RSS sum — retired in 2.369.171)';
// 2026-10-job-secrets-retired (lane job-secrets-retire r2): the retired store's two names and its ONE For-you notice's words —
// structure the client words with t() (zh + ja in src/lib/i18n-*.js); the item is keyed by the migration's id (r3: `itemKey`
// — the both-names notice and the retired one are ONE item, its words the latest state)
const i18nKey = (s) => s; // extraction marker (scripts/i18n-extract.mjs)
const JOB_SECRETS_FILE = 'job-secrets.json';
const JOB_SECRETS_RETIRED = 'job-secrets.retired.json';
const JOB_SECRETS_ITEM = '2026-10-job-secrets-retired'; // the For-you item's key (one item, re-worded, never a second)
const JOB_SECRETS_ACTION = 'job-secrets-retired'; // B-ef1b: the notice's action — its two buttons (src/foryou-actions.js; src/server/job-secrets-door.js answers them)
const JOB_SECRETS_WORDS = Object.freeze({
  text: i18nKey('A plain file kept secrets for background jobs outside the vault: {file} — put each into the vault, then delete the file.'),
  names: i18nKey('It holds {n} name(s): {names} — the values are not shown here.'),
  more: i18nKey('…and {n} more not shown (past the first 20, or shaped like a value rather than a name).'),
  unread: i18nKey('Its names could not be read — open the file to see what it holds.'),
  recipe: i18nKey('VibeSpace no longer reads this file and deletes it only when you say so: «Move into the vault» seals each value as a vault entry and then deletes the file, «Delete the file» deletes it as it is. A job reads a stored secret with --vault NAME=vault://… (vibespace-docs jobs).'),   // B-ef1b: the buttons are the step
  both: i18nKey('Two files hold secrets for background jobs and nothing was moved: {from} and {to}. Move one of them out of data/ (or delete it), then restart — VibeSpace never chooses between your files.'),
});
// 2026-11-warmth-ramp-derived (lane cache-warmth-ramp r2, q-059 r5): a custom theme saved on .374 froze the five «Cache warmth»
// rows' derived strings; the ONE rule that drops them (r3) is PURE and shared with the store's one writer (persistence.js)
const { normalizeCustomThemes } = require('../custom-theme-normalize.js');
// 2026-11-cloak-to-plugin (lane engine-spi-egress L3 — the owner 2026-11-01/02: 「把cloakbrowser也做成插件，默认不要包含」
// 「cloakbrowser直接去掉吧」): CloakBrowser leaves the core and installs as a plugin. This migration is the ONE place in src/
// that names the plugin its records move to (scripts/test-architecture.mjs §105 ENGINE_ID_ROWS) and the old CloakBrowser facts it
// reads (§106): the provider id, the two retired settings rows, the licence row, where VibeSpace's own download unpacked.
const CLOAK_PLUGIN_ID = 'vibespace.cloak-browser';
// round 3: the boot step the browser keeper's boot waits for — 2026-11-cloak-to-plugin when it runs STEPPED (its hash streams); null
// = nothing to wait for. Read through beforeBrowserBoot() (src/server/mounts-plugins-wiring.js bootBrowserKeeper).
let browserBootGate = null;
function beforeBrowserBoot() { return browserBootGate || Promise.resolve(null); }
const CLOAK_MIGRATION_ID = '2026-11-cloak-to-plugin'; // also the For-you item's key (one item, re-worded, never a second)
const CLOAK_OLD = Object.freeze({
  provider: 'cloak', exeKey: 'browser.cloak.executablePath', sitesKey: 'browser.cloak.egressAllowlist', integration: 'cloak',
  cacheDir: path.join('browser-tools', 'cloak-cache'), // VibeSpace's own CLOAKBROWSER_CACHE_DIR (never ~/.cloakbrowser)
  download: path.join('browser-tools', 'cloak-cache', 'chromium-146.0.7680.177.5', 'chrome'), // the measured build's chrome (Linux)
  // round 2 (主开发's law A): the base install's own proof of that file — its stamp (written only after the file's SHA-256 matched
  // the measured build) and the marker of an unpack still in progress — and the measured build the stamp must name
  stamp: path.join('browser-tools', 'cloak-installed.json'), unpackMark: path.join('browser-tools', 'cloak-unpacking.json'),
  measured: Object.freeze({ chromium: '146.0.7680.177.5', sha256: '715722e8605ae3ce81523c1218aba1ec89425786ab33ceaf99f8a6cb5e70e6e8' }),
});
const CLOAK_PLUGIN_WORDS = Object.freeze({
  text: i18nKey('CloakBrowser now installs as a plugin — ⚙ → Plugins → Install plugin…'),
  profiles: i18nKey('{n} browser profile(s) ran CloakBrowser: {labels}. They start again once the plugin is installed and enabled; until then a start is refused by name.'),
  ended: i18nKey('{n} of them were running and were closed at the update — their logins stay in the profile.'),
  carried: i18nKey('Your CloakBrowser program path was carried into ⚙ → Plugins → CloakBrowser.'),
  download: i18nKey('VibeSpace\'s earlier download at {path} is now the program named in ⚙ → Plugins → CloakBrowser — you may move it and change the row.'),
  noProgram: i18nKey('The plugin needs CloakBrowser installed by you — see its README.'),
  keptProgram: i18nKey('Your plugin\'s own program path was kept; the old one is in {archive}.'),
  sites: i18nKey('Your CloakBrowser site list was carried into ⚙ → Plugins → CloakBrowser.'),
  keptSites: i18nKey('Your plugin\'s own site list was kept; the old one is in {archive}.'),
  installEnded: i18nKey('A CloakBrowser install that was running at the update was stopped; what it downloaded stays under data/browser-tools.'),
  installLetGo: i18nKey('A CloakBrowser install was running at the update; its process could not be proven to be the one VibeSpace started, so it was left alone.'),
  proposals: i18nKey('{n} open proposal(s) to switch an agent\'s browser to CloakBrowser were closed — this version cannot switch a browser for the agent.'),
  licence: i18nKey('Your CloakBrowser licence key is no longer used; it stays stored in data/integrations.json.'),
  unverified: i18nKey('VibeSpace\'s earlier download at {path} was left out as unverified — no install record proves it is the build VibeSpace checked; the row is left for the plugin\'s own download.'),
  hintsTier: i18nKey('{n} per-site note(s) that named CloakBrowser now say the site needs an anti-bot browser (tier 2).'),
  hintsDropped: i18nKey('{n} per-site note(s) that named CloakBrowser were removed (no plugin program is set); they are in {archive}.'),
  closed: i18nKey('closed at the update: it ran CloakBrowser, which is now a plugin'), // a running record's words (the keeper's journal + its row)
});

// `homeDir` is a PARAMETER, not an ambient fact: a migration that reads the
// transcript tree (the origin backfill) must be drivable against a scratch
// home, or its suite reads — and its timing depends on — whatever ~/.claude
// the developer happens to have (measured: 3.9 GB / 27 s on this instance).
// `channels` (2026-09-22) is the CHANNELS ENGINE handle (or a getter for it):
// `data/channels/adapters.json` has exactly ONE writer — the engine's
// serialized door — so a migration that reshapes an adapter record goes
// through the engine, never through a second store instance (a private copy
// written back is the read-modify-write lost update §5.1 exists to forbid).
// `userTodos` (2.369.152) is the LIVE UserTodoManager (or a getter for it):
// server.js builds it ~770 lines before the migrations run and it holds
// data/user-todos.json in memory, so a migration that wrote the file beside it
// would be overwritten by its next save. Without one (a suite, a boot with no
// inbox) the migration builds a PRIVATE manager on the same file — no timer,
// flushed through the store's own atomic writer before it returns.
// `desktopKeeper` / `browserKeeper` (2026-09-25) are the LIVE keepers (or
// getters): each holds its store in memory (the desktop keeper loads at
// construction and commits after its async boot adoption), so a migration
// that rewrote data/desktop-apps.json or data/browser-profiles.json beside it
// would be overwritten by its next save — the reshape goes THROUGH the keeper
// (`reshapeStore`), the file directly only when there is none (a suite).
// `hosts` (lane-pairing ⑥) is the LIVE HostManager (or a getter): it holds data/hosts.json in memory and saves it
// whole, so the exit-access reshape goes through `hosts.reshapeStore`, the file directly only when there is none.
// `accounts` (2026-09-28) is the LIVE AccountManager (or a getter for it): it holds
// data/accounts.json in memory and saves the whole state on every write, so the
// pool reshape goes THROUGH it (`migrateManualPools`) — a file written beside it
// would be overwritten by its next save. Without one the migration FAILS (and is
// retried next boot) rather than writing beside a store it cannot see.
// `plugins` (lane plugin-settings-p0) is the LIVE PluginManager (it holds data/plugins.json and is the settings
// writer's client); `integrations` (lane llm-plugin-rename) is the LIVE integration store (it holds
// data/integrations.json in memory and saves it whole) — the 2026-10-llm-rename move goes through both, and FAILS by
// name (retried next boot) when there is something to move and the store that holds it was not handed in.
// `grants` (lane grants-unify) is THE grants store (src/server/grants-store.js, or a getter) the 2026-10-grants-unify
// rows are seeded into; without one the store of this data dir (the installed one when it is this dir's). `note` (the
// boot trace's — ⚙ Diagnostics) hears the grants store's boot check (grantsStoreBoot) by name.
// `tasks` (lane task-group-context) is the LIVE TaskGroupManager (or a getter): it holds data/task-groups.json in memory
// and saves it whole, so the Context-table migration goes THROUGH it (`migrateContextRows`), the file only when there is
// none (a suite).
function create({ rootDir, serverNotice, homeDir = os.homedir(), channels = null, userTodos = null, desktopKeeper = null, browserKeeper = null, hosts = null, accounts = null, plugins = null, integrations = null, grants = null, note = null, tasks = null, usageHistory = null, settings = null,
  // 2026-11-cloak-to-plugin's measured build (CLOAK_OLD.measured): a SEAM for the suites only — a suite cannot ship the 200 MB
  // Chromium whose SHA-256 the base install stamped, so it hands the facts of the small file it plants
  cloakMeasured = CLOAK_OLD.measured }) {
  const dataDir = path.join(rootDir, 'data');
  const archiveDir = path.join(dataDir, 'archive');

  // 2026-10-job-secrets-retired + 2026-11-job-secrets-buttons (B-ef1b): the retired store's ONE For-you notice — filed through
  // the live inbox store (r2/r3) by both; `buttons` = its action (src/foryou-actions.js `job-secrets-retired`: «Move into the vault» /
  // «Delete the file», src/server/job-secrets-door.js) — the «Two files…» notice carries none (nothing was moved, the owner chooses)
  const jsFill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
  // B-44f3 (THE STORE-READ LAW): the live For-you store a migration goes through — while it is HELD unread the migration is
  // refused BY NAME before it reads anything (code todos-unread): a held store's list is empty because it is unread, so a reshape
  // or a «no notice needed» judged on it would be recorded as applied over nothing. runLocalMigrations runs the refused rows again
  // at the read (whenRead) — never «at the next restart».
  const liveTodos = () => {
    const t = typeof userTodos === 'function' ? userTodos() : userTodos;
    if (t && typeof t.isHeldUnread === 'function' && t.isHeldUnread()) throw Object.assign(new Error(t.unreadRefusal('a data migration')), { code: 'todos-unread' });
    return t;
  };
  // ONE For-you item keyed by this migration — THROUGH the live inbox store (it holds data/user-todos.json in memory);
  // without one a PRIVATE store on the same file, flushed before the runner records the row (a throw fails the run)
  const jsTell = (head, lines, { buttons = false } = {}) => {
    const live = liveTodos();   // B-44f3: refused by name while For you is held unread
    let store = live, priv = false;
    if (!store || typeof store.add !== 'function') {
      const { UserTodoManager } = require('../user-todos.js');
      store = new UserTodoManager({ dataDir, expirySweepMs: 0 });
      priv = true;
    }
    try {
      const it = store.add('vault', { origin: 'vault', kind: 'notice', urgency: 'high', by: 'system', sessionName: 'Vault', itemKey: JOB_SECRETS_ITEM, ...(buttons ? { action: { type: JOB_SECRETS_ACTION } } : {}), text: jsFill(head), detail: lines.length ? lines.map(jsFill).join('\n') : null, i18n: { text: head, ...(lines.length ? { detail: lines } : {}), source: { key: i18nKey('Vault') } } });
      store.flush();
      return { notice: it && it.id ? 'filed' : 'not filed', via: priv ? 'private' : 'live' };
    } finally { if (priv) { try { store.stop(); } catch { } } }
  };
  /** The retired file's NAMES (never a value: parsed here, and only the names leave) → the notice's detail lines. */
  const jsLines = () => {
    const retiredFile = path.join(dataDir, JOB_SECRETS_RETIRED);
    let names = null;
    try { if (fs.statSync(retiredFile).size <= 1024 * 1024) { const doc = JSON.parse(fs.readFileSync(retiredFile, 'utf-8')); if (doc && typeof doc === 'object' && !Array.isArray(doc)) names = Object.keys(doc); } } catch { names = null; }
    // a name is SHOWN only when it is shaped like an environment-variable name AND the secret-shapes belt finds nothing in it
    // (r3, review F1: most tokens fit a variable's shape — ghp_…, npm_…, hf_…, AKIA…, a hex run); anything else — a value
    // pasted into the name field, the accident class — is counted, never shown
    const shown = (names || []).filter((n) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n) && redactSecrets(n, { runs: true }).redacted === 0).slice(0, 20);
    const lines = names
      ? [{ key: JOB_SECRETS_WORDS.names, params: { n: names.length, names: shown.join(', ') || '—' } }, ...(names.length > shown.length ? [{ key: JOB_SECRETS_WORDS.more, params: { n: names.length - shown.length } }] : [])]
      : [{ key: JOB_SECRETS_WORDS.unread }];
    lines.push({ key: JOB_SECRETS_WORDS.recipe });
    return { names, lines };
  };
  const MIGRATIONS = [
    {
      id: '2026-08-collapse-kinds-agent-default',
      note: "chat.collapseKinds saved before the 'agent' kind existed (2.368.19) cannot distinguish 'user unchecked it' from 'the option predates the save' — codex collab cards (Agent Wait, send_message…) broke every fold on instances with ANY saved selection (owner report). Add the default-on kind once; unticking it afterwards sticks.",
      run() {
        const f = path.join(dataDir, 'settings.json');
        // B-225b R9: through the settings' three answers — not there ⇒ nothing to do; HELD ⇒ THROWN by name (runs at the next start;
        // the release returned here and was recorded done over a file it never read)
        const doc = require('../store-hold.js').readNow(f, { valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v), what: 'this migration' });
        if (doc === undefined) return;
        const v = doc['chat.collapseKinds'];
        if (!Array.isArray(v) || v.includes('agent')) return;
        v.push('agent');
        replaceSynced(f + '.tmp', f, JSON.stringify(doc, null, 2));
      },
    },
    {
      id: '2026-09-collapse-kinds-note-default',
      note: "lane S3 (naive-user study 2): the new 'note' kind (VibeSpace's notes to the assistant — the Stop nudge, the tools intro) ships ON in chat.collapseKinds, and a SAVED selection cannot tell 'user unchecked it' from 'the option predates the save' (the 'agent' precedent above). Add it once; unticking it afterwards sticks.",
      run() {
        const f = path.join(dataDir, 'settings.json');
        // B-225b R9: through the settings' three answers — not there ⇒ nothing to do; HELD ⇒ THROWN by name (runs at the next start;
        // the release returned here and was recorded done over a file it never read)
        const doc = require('../store-hold.js').readNow(f, { valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v), what: 'this migration' });
        if (doc === undefined) return;
        const v = doc['chat.collapseKinds'];
        if (!Array.isArray(v) || v.includes('note')) return;
        v.push('note');
        replaceSynced(f + '.tmp', f, JSON.stringify(doc, null, 2));
      },
    },
    {
      id: '2026-09-reattribute-readings-by-slot',
      note: 'quota readings were keyed by the OTel-observed org = the identity the CLI cached at SPAWN, so after any pool hot switch a session\'s readings were filed under the account it started on. Re-attributes or archives (never silently keeps) the provably-foreign entries in usage-cache / usage-anchors / attribution.ndjson, and drops the learned rates so the estimator re-learns from the cleaned anchors.',
      run() {
        const { repairReadings, findJournal } = require('../reading-repair.js');
        const { SlotTransitions } = require('../slot-transitions.js');
        // The members whose credential files can date their own death. Read
        // straight off disk: this runs BEFORE restoreSessions and must not
        // depend on a booted AccountManager (a migration that needs the app
        // running is a migration that cannot repair a broken app).
        const subsDir = path.join(dataDir, 'subs');
        const members = [];
        let names = [];
        names = MR.list(subsDir, 'data/subs'); if (!names) return;   // MG1: not there = nothing to do; any other failed read = not run
        // A member's credential DIR is only half its login (2026-09-07 r2): an
        // account with a wiped dir and a valid LONG-LIVED TOKEN still spawns
        // (`oatOnly`) and still produces readings under its own key, so
        // enumerating members from disk alone dated a live account's "death"
        // from the wipe and archived everything it wrote afterwards. Read the
        // roster for `oatMintedAt` — presence + timestamp only, the encrypted
        // token is never touched (and this migration still runs before any
        // AccountManager exists).
        const oatMinted = (() => {
          const out = {};
          try {
            const st = JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf-8'));
            for (const a of (st?.accounts || [])) if (a && a.id && a.oatEnc && a.oatMintedAt) out[a.id] = Number(a.oatMintedAt) || 0;
          } catch (e) { if (!(e && e.code === 'ENOENT')) throw accountsUnread(e); }   // r3060 Q3: only «not there» is nothing to do
          return out;
        })();
        for (const d of names) {
          if (!/^sub-[\w-]+$/.test(d)) continue;                  // pools are symlinks, con-* are login scratch
          { const ls = MR.lstat(path.join(subsDir, d), 'data/subs/' + d); if (!ls || ls.isSymbolicLink()) continue; }   // MG1: gone since the list = skipped; unread = not run
          members.push({ id: d, backend: 'claude', credsPath: path.join(subsDir, d, '.credentials.json'), oatMintedAt: oatMinted[d] || null });
        }
        const transitions = new SlotTransitions({ dataDir });
        let journalText = null;
        const jf = findJournal(dataDir);
        if (jf) journalText = MR.readText(jf, path.basename(jf));   // MG1: a journal found and then unread = not run
        const rep = repairReadings({ dataDir, members, transitions, id: '2026-09-reattribute-readings-by-slot', journalText });
        const touched = (rep.caches?.foreign || 0) + (rep.anchors?.dropped || 0) + (rep.attribution?.foreign || 0);
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran.
        console.log('[migrate] readings-by-slot:', JSON.stringify({
          members: rep.markers.length, journal: rep.journal,
          caches: rep.caches, anchors: rep.anchors, attribution: rep.attribution,
        }));
        if (touched) {
          try {
            serverNotice?.('readings-repaired', `Quota bookkeeping repaired: ${touched} reading(s) that belonged to another account were archived to data/archive/ (a pool hot switch had filed them under the account each session started on). Panels and the usage estimator re-derive from the cleaned data.`, { level: 'info' });
          } catch { }
        }
      },
    },
    {
      id: '2026-09-refile-readings-by-window-v2',
      note: "the readings-by-slot repair could only act where a member's own credential file DATED its death — one member on this instance — so every reading mis-filed BETWEEN TWO LOGGED-IN accounts survived it (its own header calls that the silent half). A weekly reset is an account fingerprint, so those entries can be proven foreign and re-filed by their window: re-attributes or archives-with-a-reason the anchors whose weekly phase is not their stream's, rescues a cache snapshot carrying another account's window, drops the learned rates, and SEEDS each account's own window so the live window guard is armed on this boot instead of on the next panel refresh. Since r4 it moves PER BUCKET — an anchor is a snapshot of a usage-cache FILE and that file has two writers, so a mis-keyed reading leaves a record that is itself a MIX (another account's 7d on top of this stream's own model-scoped bucket); measured on a copy of this instance, 444 of the 476 re-files were that shape, and moving them whole wrote another member's Fable bucket into the target's cache, which is what accountRemaining / weeklyDeadline / bucketRems read. Since r6 it also judges the machine login's SECOND snapshot, data/usage-cache.json — the boot seed of _rateLimitCache, which is not in the usage-cache directory the repair walks and, because a rebuild rewinds fetchedAt, is guaranteed to win ingestPassiveUsage's newest-wins merge for both the machine-login row and the named subscription of the same quota.",
      run() {
        const { repairByWindow } = require('../reading-repair.js');
        // Candidates to RECEIVE a re-filed reading are the CURRENT roster: a
        // removed subscription cannot hold readings, and on this instance a
        // removed account shares a live one's weekly phase — counting it would
        // make every genuinely re-filable entry ambiguous. Read straight off
        // disk (this runs before any AccountManager exists).
        let roster = null, accounts = null;
        try {
          const st = JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf-8'));
          // The RECORDS as well as the ids (r5): resolving a usage-cache FILE
          // to its identity is `usageIdentityGroups`' job, and that reads the
          // record's backend (a ChatGPT and an Anthropic login sharing an email
          // must never merge), its type (a pool holds no quota of its own) and
          // its declared email. Handing over only ids would make this
          // migration's map a second, weaker spelling of the engine's.
          accounts = (st?.accounts || []).filter((a) => a && a.id);
          roster = accounts.filter((a) => a.type === 'subscription').map((a) => a.id);
        } catch (e) { if (!(e && e.code === 'ENOENT')) throw accountsUnread(e); }   // r3060 Q3: only «not there» is nothing to do
        const rep = repairByWindow({ dataDir, roster, accounts, id: '2026-09-refile-readings-by-window-v2' });
        const a = rep.anchors, c = rep.caches;
        console.log('[migrate] readings-by-window:', JSON.stringify({
          identities: rep.identities.length, receivers: rep.identities.filter((x) => x.canReceive).length,
          anchors: a, caches: c,
          // the machine login's SECOND snapshot (data/usage-cache.json, the
          // boot seed of _rateLimitCache) — not in the usage-cache directory,
          // and newer than anything the repair rebuilds there, so a foreign
          // window left in it wins the newest-wins merge for BOTH panel rows
          globalFile: rep.globalFile, globalFileWhy: rep.globalFileWhy,
        }));
        // A dropped BUCKET is its own repaired thing: 443 of this instance's 444
        // partial moves carry no whole-record action at all, so counting only
        // records would report "nothing happened" about the half of the repair
        // that touches the model caps the pool decides on.
        const touched = (a?.refiled || 0) + (a?.archived || 0) + (a?.stripped || 0) + (c?.foreign || 0) + (c?.scopedStripped || 0) + (rep.globalFile === 'archived' ? 1 : 0);
        if (touched) {
          try {
            serverNotice?.('readings-window-repaired', `Quota bookkeeping repaired: ${touched} reading(s) whose usage window belongs to a different account were re-filed, split or archived to data/archive/ (a pool switch had filed them on the account a session was pointed at, not the one whose credentials answered). Panels and the usage estimator re-derive from the cleaned data.`, { level: 'info' });
          } catch { }
        }
      },
    },
    {
      id: '2026-09-repair-sidecars-by-api-phase',
      note: "B-855a c2: the /usage panel probe took its org context from the machine-wide ~/.claude.json, so for weeks a member's panel could be ANOTHER member's — and that foreign panel re-stamped the member's established-window sidecar, after which the live guard archived the member's OWN readings as foreign for ever ('refusing to write X a reading from another window'); the roster showed somebody else's usage and the pool called the healthiest Fable member 'Fable 2 % < 5 %'. The witness a panel cannot fake is the weekly window the member's own slot-verified rate_limit_events state. Derives each roster account's API phase from those (anchors whose 7d MOVED on a rate-limit-event + the slot-verified readings the guard archived), re-stamps a contradicting sidecar (source 'api'), archives + rebuilds a contradicting cache from the newest wholly-agreeing anchor (or empties it with a reason), and writes the last 24 h of archived own readings back through the ONE write path. Measured on a copy of this instance 2026-09-17: 10 identities with evidence, 3 sidecars re-stamped, 7 confirmed, 3 caches replaced, 128 readings re-admitted, idempotent, 90 ms. The SAME repair also runs at every boot and on POST /api/usage/repair-identity — this row only makes the ledger say it ran once on the upgrade boot.",
      run() {
        const { repairSidecarsByApiPhase } = require('../reading-repair.js');
        let accounts = null;
        try { accounts = (JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf-8'))?.accounts || []).filter((a) => a && a.id); } catch (e) { if (!(e && e.code === 'ENOENT')) throw accountsUnread(e); }   // r3060 Q3: only «not there» is nothing to do
        if (!accounts) return; // no roster yet = nothing to anchor
        const rep = repairSidecarsByApiPhase({ dataDir, accounts, id: '2026-09-repair-sidecars-by-api-phase' });
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran.
        console.log('[migrate] sidecars-by-api-phase:', JSON.stringify({ counts: rep.counts, ms: rep.ms, identities: rep.identities.map((r) => ({ key: r.key, apiPhase: r.apiPhase, n: r.n, of: r.of, sidecar: r.sidecar, cache: r.cache, readmitted: r.readmitted })) }));
        const c = rep.counts || {};
        const touched = (c.restamped || 0) + (c.replaced || 0) + (c.emptied || 0) + (c.stripped || 0);
        if (touched) {
          try {
            serverNotice?.('readings-identity-repaired', `Quota bookkeeping repaired: ${c.restamped} account window(s) and ${(c.replaced || 0) + (c.emptied || 0)} usage snapshot(s) that had been taken from another account's /usage panel were re-anchored to each account's own API-reported window, and ${c.readmitted} of the account's own readings were written back (archived copies in data/archive/). Panels and the pool re-derive from the cleaned data.`, { level: 'info' });
          } catch { }
        }
      },
    },
    {
      id: '2026-09-purge-test-fixture-ledger',
      note: "two suites wrote SYNTHETIC claude transcripts into the developer's real ~/.claude/projects (the worktree server they spawn inherited HOME and can only discover what lives under its own home), and the production instance's usage walk ingested their hand-written `usage` blocks: 79,533 permanent ledger rows on this instance claiming 982,140 tokens of a model nobody ever ran (measured 2026-09-09 14:39 UTC on a copy of its stores; 79,778 rows removed in all, 222 dead cursors, 1,575 anchors re-measured), attributed to the machine login and counted into the costSince of its anchor pairs. Archives every fixture row (synthetic sid family, or a throwaway fixture cwd) to data/archive/, drops the dead cursors, voids the anchor costSince values that measured an interval containing one, and drops the learned rates so the estimator re-learns. From this release the walk and discovery refuse the convention outright (src/fixture-guard.js), so this is a one-shot clean-up of history, not a guard.",
      run() {
        const { purgeFixtureLedger } = require('../fixture-ledger-purge.js');
        const rep = purgeFixtureLedger({ dataDir, id: '2026-09-purge-test-fixture-ledger' });
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran.
        console.log('[migrate] fixture-ledger:', JSON.stringify(rep));
        if (rep.rowsRemoved || rep.cursors) {
          try {
            serverNotice?.('fixture-ledger-purged', `Usage bookkeeping repaired: ${rep.rowsRemoved} ledger row(s) written by test fixtures (${rep.synthetic} of them fabricated — a synthetic transcript, no request ever made) were archived to data/archive/, ${rep.cursors} dead cursor(s) dropped and ${rep.anchorsVoided} usage anchor(s) re-measured. The Usage window and the quota estimator re-derive from the cleaned data.`, { level: 'info' });
          } catch { }
        }
      },
    },
    {
      id: '2026-09-backfill-quota-limits',
      note: "a usage-cache snapshot could hold exactly ONE set of buckets, so codex's concurrent limits collapsed into whichever pushed last (B-9213: measured on this instance, one conversation pushed `codex` at 5-100 %, the GPT-5.3-Codex-Spark model cap at 0 % and `premium` with no windows at all — the file on disk held Spark and the plan limit was gone). Every write now goes through src/usage-cache-write.js and merges PER limitId; this stamps the typed `limits` onto the files written before that, so they are self-describing from the upgrade boot instead of from whenever their account next produces a reading (an idle account can be days away). Moves no number, changes no fetchedAt, touches no sidecar; archives each pre-migration object first.",
      run() {
        const { backfillLimits } = require('../quota-model-migrate.js');
        const r = backfillLimits({ cacheDir: path.join(dataDir, 'usage-cache'), archiveDir, id: '2026-09-backfill-quota-limits' });
        console.log('[migrate] quota-limits backfill:', JSON.stringify(r));
        // Deliberately NO serverNotice: nothing changed for the user — no
        // number moved and no reading was archived away. A notice about a
        // shape change is noise, and the notices this instance already sends
        // about quota repairs are about DATA that moved.
      },
    },
    {
      id: '2026-09-usage-origin-backfill',
      note: "the ledger could not say WHICH kind of transcript a request came from, so the Usage window could not separate a conversation's own spend from its subagents' and its workflows', and — because an agent record carries ITS OWN cwd — every agent that ran in a git worktree was its own row in 'By project' (272 of this instance's 3,155 agent transcripts carry a worktree path, measured 2026-09-10). From this release the walk stamps origin/wf/agent and attributes an agent event to the PARENT project's cwd (keeping its own as wcwd); this names the rows written before that, by walking the transcript tree once and looking up each row's rid. A row whose transcript is gone gets origin 'unknown' rather than a guess. Copies every shard verbatim under data/archive/ before rewriting it.",
      run() {
        const { backfillUsageOrigin } = require('../usage-origin-backfill.js');
        const rep = backfillUsageOrigin({ dataDir, projectsDir: path.join(homeDir, '.claude', 'projects'), id: '2026-09-usage-origin-backfill' });
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran.
        console.log('[migrate] usage-origin:', JSON.stringify(rep));
        // Deliberately NO serverNotice: no usage moved between accounts and no
        // row was archived away — the ledger gained a label. The notices this
        // instance sends are about DATA that moved.
      },
    },
    {
      id: '2026-09-weekly-lanes-unfold',
      note: "inc-mubu23bd-5vxi (2026-09-21, owner '刚才7d用量红了，刷新之后变成绿的了'): since 2.361.2 the rate_limit_event parse mapped claude's overage-included weekly type — the 2.1.274 binary's own 'overage-included weekly (per-model bucket)', about twice the plan week on every account with a model cap — onto the PLAN weekly lane and never read the record's unifiedWindows, so the plan 7d cache of every capped account was overwritten by the bucket whenever the representative claim was the bucket (the owner's read 86 % beside a verified panel saying 43 %; the taskbar donut flipped red/green against every panel). The parse is fixed; this re-derives each plan week last written by an event from the newest windowed event in the live buffers linked to that credential slot, judged by the account's own established window, through the one write path — a panel-sourced value is never touched, a key with no linked event is left for the next panel or event, and the report says what happened per key (src/weekly-lanes-unfold.js).",
      run() {
        const { unfoldWeeklyLanes } = require('../weekly-lanes-unfold.js');
        const rep = unfoldWeeklyLanes({ dataDir, id: '2026-09-weekly-lanes-unfold' });
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran.
        console.log('[migrate] weekly-lanes-unfold:', JSON.stringify(rep));
        if (rep.rederived) {
          try {
            serverNotice?.('weekly-lanes-unfolded', `Quota bookkeeping repaired: ${rep.rederived} account(s) had their plan weekly usage overwritten by the model-cap bucket (a rate_limit_event lane mapping bug); each was re-derived from its own latest windowed reading (pre-repair copies in data/archive/). Panels and the pool re-derive from the corrected data.`, { level: 'info' });
          } catch { }
        }
        // A REFUSED REPAIR IS A FAILED RUN (r2): the runner's contract is
        // "failed = logged loudly, not recorded, retried next boot", and a
        // report that swallowed an unwritable archive or a refused write was
        // recorded as applied — the plan week kept the bucket's number for
        // good. The keys already re-derived are `already` on the retry.
        if (rep.unreadable) throw new Error(`usage-cache dir unreadable: ${rep.unreadable}`);
        if (rep.refused) throw new Error(`${rep.refused} key(s) refused: ${rep.keys.filter((k) => k.action === 'refused').map((k) => `${k.key} (${k.why})`).join('; ')}`);
      },
    },
    {
      id: '2026-09-adopt-legacy-browser-profile',
      note: "agent browser P1, migration step 2 (design-agent-browser-v2 §8): the ONE shared profile every agent used to land in (the `profile` key of ~/.agent-browser/config.json, else ~/.agent-browser/default-profile when it exists) becomes a registry record named \"Shared (legacy)\" — sharing 'instance', marked legacy — so an agent that explicitly asks for it gets its own tab in it instead of a stolen one. Nothing moves and nothing is deleted (the 98 GB stay where they are); a registry that already names that directory is left alone.",
      run() {
        const B = require('../browser-profiles.js');
        const K = require('./browser-keeper.js');
        let cfg = {};
        cfg = MR.readJson(path.join(homeDir, B.USER_CONFIG_REL), B.USER_CONFIG_REL) || {};   // MG1: not there = the default profile; unread or torn = not run (never the wrong folder)
        let dir = B.configNamesProfile(cfg) ? String(cfg.profile) : path.join(homeDir, '.agent-browser', 'default-profile');
        if (dir.startsWith('~/')) dir = path.join(homeDir, dir.slice(2));
        if (!path.isAbsolute(dir)) dir = path.join(homeDir, '.agent-browser', dir);
        let dst = null; try { dst = fs.statSync(dir); } catch (e) { if (!(e && (e.code === 'ENOENT' || e.code === 'ENOTDIR'))) throw MR.unread(`the legacy browser profile folder (${path.basename(dir)})`, e); }   // MG1: not there = nothing to adopt; any other failed stat = not run (r3246 (1): never the whole path)
        const isDir = !!(dst && dst.isDirectory());
        if (!isDir) { console.log(`[migrate] legacy browser profile: nothing to adopt (${path.basename(dir)} is not a directory)`); return; }   // r3288 (5): never the whole path
        // A keeper built HERE only touches the registry file (no broadcast, no
        // timer, not installed as the process's keeper — that one is wired
        // later with real deps and reads what this wrote).
        const k = K.create({ dataDir, homeDir, install: false, log: { log() { }, warn() { } } });
        const r = k.adoptDirectory({ label: 'Shared (legacy)', dir, legacy: true, owner: { kind: 'instance', id: null } });
        // lane lg-store-writes U5b: the registry is the store writer's — on disk before this migration is recorded (only when the
        // writer owes it); one that did not land throws EVSNOTONDISK and the runner HOLDS the migrations after it to the next boot
        if (typeof k.landNow === 'function' && !k.landNow()) throw Object.assign(new Error('browser-profiles.json: the adopted record is in memory and not on disk yet (the storage still holds the write) — not recorded, it runs again at the next boot'), { code: 'EVSNOTONDISK' });
        if (typeof k.detachGrants === 'function') k.detachGrants();   // lane lg-store-writes (the moved2 cure 2): this private keeper ends here — it answers no later grant change
        console.log('[migrate] legacy browser profile:', JSON.stringify({ dir, created: r.created, id: r.profile ? r.profile.id : null, why: r.why || null }));
      },
    },
    {
      id: '2026-09-browser-profiles-all-conversations',
      note: "owner ruling A (2026-09-26, \"A吧\" — after two naive-user studies failed the same task): a NAMED browser profile is usable by ALL of the owner's conversations by default; only the user's panel switch keeps one to a single conversation. Every named record in data/browser-profiles.json owned by ONE conversation (owner kind 'session' — made by an agent's `vibespace-browser new` / `new --adopt` or the card's adopt) becomes usable by all conversations (owner kind 'instance'), the old owner kept as `createdBy`. None of them can have been an explicit \"only this conversation\": before the ruling `--sharing` took owner|instance (the P6 tab-isolation knob) and 'owner' was also the default, so the registry cannot tell and the ruling's default applies. Ephemeral records (a conversation's own temporary browser), the legacy shared record and a task-owned record (an explicit Task-Group scope; nothing ever created one) are left alone; `sharing` (tab isolation) is never touched. Through the live keeper when there is one, else the file (atomic, its mode kept); a missing file is not a failure.",
      run() {
        const B = require('../browser-profiles.js');
        const file = path.join(dataDir, 'browser-profiles.json');
        // VERIFY S5 (2026-09-26): only a MISSING file is "nothing to migrate" — an unreadable or unparsable one FAILS BY
        // NAME (the runner records the failure and retries at the next boot, never stamping the ledger): a torn or
        // unreadable registry marked "applied" would never be migrated once it is whole again
        let disk = null, missing = false;
        try { disk = JSON.parse(fs.readFileSync(file, 'utf-8')); }
        catch (e) { if (e && e.code === 'ENOENT') missing = true; else throw new Error(`${path.basename(file)} could not be read (${e && e.code ? e.code : 'unparsable JSON'}: ${e && e.message}) — not migrated; retried at the next boot`); }
        if (missing) { const rep = { file: path.basename(file), via: 'none', migrated: [], kept: [] }; console.log('[migrate] browser-profiles-all-conversations:', JSON.stringify(rep)); return rep; }
        if (!disk || typeof disk !== 'object') throw new Error(`${path.basename(file)} is not a registry document (${JSON.stringify(disk)}) — not migrated; retried at the next boot`);
        const k = typeof browserKeeper === 'function' ? browserKeeper() : browserKeeper;
        let r, via;
        if (k && typeof k.reshapeStore === 'function') { r = k.reshapeStore((doc) => B.migrateScopeAll(doc)); via = 'keeper'; }
        else {
          r = B.migrateScopeAll(disk); via = 'file';
          if (r.migrated.length) {
            let mode = 0o600; try { mode = fs.statSync(file).mode & 0o777; } catch { }
            const tmp = `${file}.${process.pid}.tmp`;
            replaceSynced(tmp, file, JSON.stringify(disk, null, 2), mode);
          }
        }
        const rep = { file: path.basename(file), via, migrated: r.migrated, kept: r.kept.length };
        // Say what happened even when it is nothing — a repair nobody can see ran is a repair nobody can verify ran.
        console.log('[migrate] browser-profiles-all-conversations:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-09-browser-profiles-who-list',
      note: "\"Who can use it\" becomes a LIST (2026-09-27, the owner: give a browser profile to several conversations and/or Task Groups). Every named record in data/browser-profiles.json kept to ONE conversation (owner kind 'session') or one Task Group (owner kind 'task') becomes `{kind:'only', who:[that row]}` (a helper's key → its conversation's), and — for those records only — every conversation whose pin the USER made on it no earlier than its last \"Who can use it\" change (the pin that let it in yesterday, owner ruling A (4), a rule that is gone: a pin never authorizes now, the list does) is added to the list, so nothing anyone could open yesterday is refused today. \"All my conversations\" records, the legacy shared record, a conversation's temporary browser and an already-listed record are left alone. Through the live keeper when there is one, else the file (atomic, its mode kept); a missing file is not a failure; an unreadable one fails by name and is retried at the next boot.",
      run() {
        const B = require('../browser-profiles.js');
        const file = path.join(dataDir, 'browser-profiles.json');
        let disk = null, missing = false;
        try { disk = JSON.parse(fs.readFileSync(file, 'utf-8')); }
        catch (e) { if (e && e.code === 'ENOENT') missing = true; else throw new Error(`${path.basename(file)} could not be read (${e && e.code ? e.code : 'unparsable JSON'}: ${e && e.message}) — not migrated; retried at the next boot`); }
        if (missing) { const rep = { file: path.basename(file), via: 'none', migrated: [], kept: 0 }; console.log('[migrate] browser-profiles-who-list:', JSON.stringify(rep)); return rep; }
        if (!disk || typeof disk !== 'object') throw new Error(`${path.basename(file)} is not a registry document (${JSON.stringify(disk)}) — not migrated; retried at the next boot`);
        const k = typeof browserKeeper === 'function' ? browserKeeper() : browserKeeper;
        let r, via;
        if (k && typeof k.reshapeStore === 'function') { r = k.reshapeStore((doc) => B.migrateWhoList(doc)); via = 'keeper'; }
        else {
          r = B.migrateWhoList(disk); via = 'file';
          if (r.migrated.length) {
            let mode = 0o600; try { mode = fs.statSync(file).mode & 0o777; } catch { }
            const tmp = `${file}.${process.pid}.tmp`;
            replaceSynced(tmp, file, JSON.stringify(disk, null, 2), mode);
          }
        }
        const rep = { file: path.basename(file), via, migrated: r.migrated, kept: r.kept };
        console.log('[migrate] browser-profiles-who-list:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-09-channel-credential-key',
      note: "the Communication panel manages ACCOUNTS like the storage mounts do (owner 2026-09-22): every channel adapter record carries `credentialKey` — `cluster:<presetKey>` or `own` — naming the OAuth client / tenant app its token was minted under, so a change of the integration's default pick never refreshes an existing token with another client (Google answers invalid_client; §14.2 'never a silent swap'). A record from before the model is stamped ONCE through the engine's own serialized writer with the client its OWN TOKEN names when this instance still offers it (a Gmail token records the preset key it was exchanged under — the honest reading of what minted it, whatever the row's pick says now), else with the integration's CURRENT pick (what refreshed it until now); the report names the evidence per record. A record whose token names nothing offered and whose integration resolves to nothing is left unstamped and keeps following the row's pick, as before.",
      run() {
        const eng = typeof channels === 'function' ? channels() : channels;
        if (!eng || typeof eng.stampCredentialKeys !== 'function') {
          // No engine on this boot (a suite, a build without the panel):
          // nothing to stamp unless a real adapter record exists — then the
          // run FAILS by name so the runner retries it on a boot that has one
          // (a recorded no-op would leave the record legacy for good).
          const doc = MR.readJson(path.join(dataDir, 'channels', 'adapters.json'), 'channels/adapters.json'); if (!doc) return;   // MG1: not there = nothing to do; unread or torn = not run
          const { REAL_ADAPTERS } = require('./channels-engine.js');
          const real = new Set(REAL_ADAPTERS.map((m) => m.kind));
          const pending = (doc && Array.isArray(doc.adapters) ? doc.adapters : []).filter((r) => r && real.has(r.kind) && !(typeof r.credentialKey === 'string' && r.credentialKey));
          if (pending.length) throw new Error(`no channels engine to stamp ${pending.length} adapter record(s) (${pending.map((r) => r.id).join(', ')}) — retried on a boot that has one`);
          return;
        }
        const rep = eng.stampCredentialKeys();
        // B-a09e — A MIGRATION WHOSE STORE WRITE IS DEFERRED IS A STEPPED ONE: it returns the promise of its LANDED write and the
        // runner records it when that write lands (src/migration-runner.js's stepped road) — a crash before then leaves it
        // unrecorded and the next boot stamps again (idempotent); a write that fails is a failed run, retried next boot.
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran. Each stamped row names its
        // EVIDENCE (`token` = the client the token itself recorded; `row-pick`
        // = the integration's pick) and the key the token named.
        console.log('[migrate] channel-credential-key:', JSON.stringify({ stamped: rep.stamped, skipped: rep.skipped }));
        // Deliberately NO serverNotice: no token moved and nothing was
        // archived — each account gained the name of the client it already
        // used. The Communication panel shows it on the row.
        return Promise.resolve(rep.write).then(() => ({ stamped: rep.stamped.length, skipped: rep.skipped.length }));
      },
    },
    {
      id: '2026-09-channel-custom-client-inline',
      note: "an account's OAuth client lives ON the account (docs/design-integrations-per-account.zh.md r4 §2.3/§2.6, 2.369.165): a channel account still naming `own` — the retired Integrations card's values — gets those values decrypted (`.integrations-key`, through the store's ONE legacy reader) and RE-SEALED under `.channels-key` onto its own record as `credential {appId, appSecretEnc}`, and is stamped `custom` only AFTER that atomic write landed. The SAME function the engine runs reader-side when such a record is read (`inlineLegacyClient`), so this row only makes the copy happen at boot and names it. A record whose values cannot be read (the key file missing — never minted here —, the values undecryptable or incomplete) FAILS the run BY NAME and keeps `own`: retried next boot, never re-pointed at a preset. integrations.json's lark / gmail values stay in place. Idempotent: a `custom` record is skipped; this instance had zero `own` accounts, so here it is a dry run.",
      run() {
        const eng = typeof channels === 'function' ? channels() : channels;
        if (!eng || typeof eng.inlineLegacyClients !== 'function') {
          // No engine on this boot: a record naming `own` makes the run FAIL by
          // name (retried on a boot that has one); none is a success.
          const doc = MR.readJson(path.join(dataDir, 'channels', 'adapters.json'), 'channels/adapters.json'); if (!doc) return;   // MG1: not there = nothing to do; unread or torn = not run
          const pending = (doc && Array.isArray(doc.adapters) ? doc.adapters : []).filter((r) => r && r.credentialKey === 'own');
          if (pending.length) throw new Error(`no channels engine to move the saved client onto ${pending.length} account(s) (${pending.map((r) => r.id).join(', ')}) — retried on a boot that has one`);
          return;
        }
        const rep = eng.inlineLegacyClients();
        // The copies land through the engine's serialized door (client first, stamp after). B-a09e: a STEPPED migration — recorded
        // once every copy LANDED; a copy whose write failed (or whose plan failed by then) fails the run: the record keeps `own`
        // (served and retried reader-side) and the migration runs again next boot.
        console.log('[migrate] channel-custom-client-inline:', JSON.stringify({ copied: rep.copied, failed: rep.failed.map((f) => ({ id: f.id, code: f.code })), skipped: rep.skipped }));
        // A plan that failed fails the run AT ONCE, by name (never recorded); the other copies' writes go on through the door.
        if (rep.failed.length) {
          Promise.resolve(rep.write).catch((err) => console.error(`[migrate] channel-custom-client-inline: a copy's write failed (the record keeps 'own' and is retried when read): ${(err && err.message) || err}`));
          throw new Error(`the saved client could not be moved onto ${rep.failed.map((f) => `${f.id} (${f.code}: ${f.why})`).join('; ')} — retried next boot`);
        }
        return Promise.resolve(rep.write).then((rs) => {
          const late = (rs || []).filter((r) => r && r.ok === false);
          if (late.length) throw new Error(`the saved client could not be moved onto ${late.map((r) => r.code).join(', ')} — retried next boot`);
        });
      },
    },
    {
      id: '2026-09-channels-aggregated-im',
      note: "a linked channel account is an AGGREGATED IM (owner ruling 2026-09-26, docs/design-communication-panel.zh.md §5 invariant 6 as rewritten): there is no `tracked` step any more — every conversation of a linked account is fetched, on a per-conversation cadence (hot 30 s / warm 5 min / cold 15 min by activity, or the owner's override). So, through the engine's own serialized door: every conversation the owner had TRACKED keeps being polled fast — `refresh.every = 30` stamped `by:'migration'` (visible and editable as its \"Refresh every ▸\"; 'tracked ⇒ hot'); a conversation that was never ingested gets its backlog marked READ (`readAt` = now), so the upgrade does not open on thousands of unread messages from before; the `tracked` field is removed everywhere; every account is stamped `linkedAt` (unread counts start there). Assignments, filters, reach grants and anchors are untouched. Idempotent: a second run finds nothing tracked and stamps nothing.",
      run() {
        const eng = typeof channels === 'function' ? channels() : channels;
        if (!eng || typeof eng.migrateAggregated !== 'function') {
          // No engine on this boot: an index still carrying `tracked` makes the
          // run FAIL by name so a boot with an engine retries it (a recorded
          // no-op would leave the rows with a gate nothing reads).
          let doc; try { doc = require('../channel-store.js').readIndexFamily(path.join(dataDir, 'channels')); } catch (e) { throw MR.unread('channels/' + ((e && e.file) || 'index.json'), e); }   // B-360d unit 1 (law 8): the family, never index.json alone; MG1: null when not there, a throw for anything else — not run
          const pending = Object.values((doc && doc.conversations) || {}).filter((e) => e && 'tracked' in e).length;
          if (pending) throw new Error(`no channels engine to migrate ${pending} conversation(s) off the retired tracked flag — retried on a boot that has one`);
          return;
        }
        // The shared runner is synchronous; the engine computes its plan NOW
        // from the live index (so these counts ARE the rows it changes) and
        // queues exactly that plan through its serialized door, first in line.
        // A store that refuses writes THROWS here — a FAILED run, retried next
        // boot, never a recorded success whose edits were refused (lane R2
        // verify, 2026-09-26: the report was filled a microtask late and the
        // boot line said zeros on every instance).
        const rep = eng.migrateAggregated();
        // B-a09e: a STEPPED migration — recorded once its index and adapters writes LANDED (both durable); a failed write fails the run
        // (retried next boot: the rows keep `tracked` until a boot with a writable store).
        const counts = { hot: rep.hot.length, readStamped: rep.readStamped, cleared: rep.cleared, linked: rep.linked };
        console.log('[migrate] channels-aggregated-im:', JSON.stringify(counts));
        return Promise.resolve(rep.write).then(() => ({ hot: counts.hot, readStamped: counts.readStamped, cleared: counts.cleared, linked: counts.linked.length }));
      },
    },
    {
      id: '2026-09-channels-access-watchers',
      note: "ACCESS AND NOTIFICATION ARE TWO OPERATIONS, ACCESS FIRST (R4, the owner 2026-09-27: \"你之前的交互的问题是把'让agent能访问对话'和'让agent会被通知'耦合在一起了\" / \"这实际上应该是两种不同的操作，前者是后者的前提\"). Every grain of a channel account (the account, a rule's conversations, one conversation) now holds an ACCESS list (who may see and act, with an authority draft|send) and a WATCHERS list (who is woken, wake|digest, with the filter / cap / window / receipt fields). Through the engine's own serialized door: every pre-split single assignment — a conversation's `assignment`, an account / rule record's top-level `principal` — becomes ONE access row + ONE watcher row for its principal (the watcher keeps the pace ledger: a conversation's own wakes, the inherited grains' mirrors excluded; a record's `stats`); every reach grant with origin `assignment` becomes origin `access`; pending hits held before the split are tagged with the watcher they were held for. The engine reads a pre-split record the same way before this runs (merged, never a fallback) and lifts one in place before any write reaches it, so the boot order changes WHEN the bytes change, never what is read. Idempotent: a second run finds nothing to lift.",
      run() {
        const eng = typeof channels === 'function' ? channels() : channels;
        if (!eng || typeof eng.migrateGrants !== 'function') {
          // No engine on this boot: an index still holding a pre-split record
          // FAILS the run by name (retried on a boot that has one).
          let doc; try { doc = require('../channel-store.js').readIndexFamily(path.join(dataDir, 'channels')); } catch (e) { throw MR.unread('channels/' + ((e && e.file) || 'index.json'), e); }   // B-360d unit 1 (law 8): the family, never index.json alone; MG1: null when not there, a throw for anything else — not run
          const convs = Object.values((doc && doc.conversations) || {}).filter((e) => e && e.assignment && e.assignment.principal).length;
          const grains = [...Object.values((doc && doc.accountAssignments) || {}), ...Object.values((doc && doc.patternAssignments) || {})].filter((g) => g && g.principal).length;
          if (convs || grains) throw new Error(`no channels engine to split ${convs} conversation assignment(s) and ${grains} account/rule assignment(s) into access + notification — retried on a boot that has one`);
          return;
        }
        // the plan is computed NOW from the live index (these counts ARE the
        // rows it changes) and queued through the serialized door; a store
        // that refuses writes THROWS — a failed run, retried next boot
        const rep = eng.migrateGrants();
        // B-a09e: a STEPPED migration — recorded once the lifted index is ON DISK; a write that fails (or is held past the writer's
        // bound) fails the run: every reader still lifts the old shape, and the migration runs again next boot
        const counts = { conversations: rep.conversations, accounts: rep.accounts, patterns: rep.patterns, grantsRenamed: rep.grantsRenamed, pendingTagged: rep.pendingTagged };
        console.log('[migrate] channels-access-watchers:', JSON.stringify(counts));
        return Promise.resolve(rep.write).then(() => counts);
      },
    },
    {
      id: '2026-09-channel-threads-derive',
      note: "THREADED REPLIES AND REACTIONS IN CHANNELS (lane channel-threads, 2026-09-28 — the owner: \"我发现你似乎不支持 lark 的内嵌回复 (thread) 功能, 以及 reaction\"). NO message line is rewritten: a record's place (what it answers, which thread, the thread's root) is DERIVED from the columns it already holds — the fold recovers a topic's root as its earliest record with no parent — and reactions live in a new append-only side log. Through the engine's own serialized doors: every conversation whose adapter declares a thread / reaction capability row and whose cached send verdict predates those rows is marked for re-resolution on its next open (`convCaps.at = 0` — one chat lookup, the pattern every open already follows), and every channel account is stamped `reactionPolicy: 'propose'` (an agent's reaction is proposed to you, like a reply; an absent row reads the same — the stamp makes it explicit). Idempotent: a second run finds nothing to reset or stamp.",
      run() {
        const eng = typeof channels === 'function' ? channels() : channels;
        if (!eng || typeof eng.migrateThreads !== 'function') {
          const doc = MR.readJson(path.join(dataDir, 'channels', 'adapters.json'), 'channels/adapters.json'); if (!doc) return;   // MG1: not there = nothing to do; unread or torn = not run
          const pending = ((doc && doc.adapters) || []).filter((r) => r && !['propose', 'direct', 'off'].includes(r.reactionPolicy)).length;
          if (pending) throw new Error(`no channels engine to stamp the reaction policy on ${pending} account(s) — retried on a boot that has one`);
          return;
        }
        const rep = eng.migrateThreads();
        // B-a09e: a STEPPED migration — recorded once its adapters and index writes are ON DISK; a write that fails fails the run
        // (an absent reaction policy reads 'propose' and a stale verdict is re-resolved on open meanwhile) and it runs again next boot
        const counts = { stamped: rep.stamped.length, reset: rep.reset };
        console.log('[migrate] channel-threads-derive:', JSON.stringify(counts));
        return Promise.resolve(rep.write).then(() => counts);
      },
    },
    {
      id: '2026-09-spend-notices-expire',
      note: "SPEND NOTICES LIVED FOREVER AS ACTIONS (owner's instance, measured 2026-09-22: 33 open 'For you' items, 15 from Spending, 13 of them filed before the notice lane existed (2.369.118) — no kind, so in the ACTION list colouring the badge — and 137–288 h old: '… has used 10 of its 12 unattended turns this hour (83%)', '… 48 of 60 today (80%)', 'VibeSpace refused the Stop bookkeeping mini-turn …', warnings about hour/day windows that closed weeks ago). The producer now stamps expiresAt and the store expires it; this moves what the store already holds into the lane: every Spending item (sessionName 'Spending' in the 'accounts' row — the name spend-guard's one fileInbox freezes on every item it files, and nothing else writes) becomes kind 'notice'; an OPEN one gets the end of the window it was about (its detail's `Scope: hour` = filing + 1 h, a refusal = + 6 h, anything else + 24 h — the longest window any spend notice talks about): past ⇒ resolved 'expired' with resolvedAt = that end (when it SHOULD have died, so it sorts as old history — kept in the ledger, never deleted), still ahead ⇒ stamped as its expiresAt so it cannot live forever either. Written through the live store and flushed before the ledger row; counts in the ledger's report row.",
      run() {
        const { noticeExpiry } = require('./spend-guard.js');
        // r3288 (2): only the notices it was WRITTEN FOR — spend-guard's words as they were filed then, plain text with no structured
        // words (`i18n`): every Spending notice that carries structured words is a later producer's (the setting holds' three
        // notices; spend-guard's own later ones carry their expiry too) — a second run (a ledger moved aside runs every migration
        // again) takes nothing it was not written for
        const isSpend = (it) => !!it && it.sessionName === 'Spending' && it.sessionKey === 'accounts' && !(it.i18n && typeof it.i18n === 'object');
        const live = liveTodos();   // B-44f3: refused by name while For you is held unread
        let store = live, priv = false;
        if (!store || typeof store.reshapeItems !== 'function') {
          if (!MR.exists(path.join(dataDir, 'user-todos.json'), 'user-todos.json')) return { matched: 0, rekinded: 0, expired: 0, stamped: 0, store: 'absent' };   // MG1: «absent» only when not there
          const { UserTodoManager } = require('../user-todos.js');
          store = new UserTodoManager({ dataDir, expirySweepMs: 0 });
          priv = true;
        }
        const rep = { matched: 0, rekinded: 0, expired: 0, stamped: 0, store: priv ? 'private' : 'live' };
        try {
          store.reshapeItems((it, now) => {
            if (!isSpend(it)) return false;
            rep.matched++;
            let changed = false;
            if (it.kind !== 'notice') { it.kind = 'notice'; rep.rekinded++; changed = true; }
            if (it.status === 'open' && it.expiresAt == null) {
              const born = Number(it.createdAt) || 0;
              // the window the notice was ABOUT: spend-guard's own detail line
              // `Scope: hour|day|instance`, a refusal's 6 h cadence, else a day
              const d = String(it.detail || '');
              const end = noticeExpiry(/^Scope: (\w+)$/m.exec(d)?.[1] || (/^Refusal: /m.test(d) ? 'refusal' : 'day'), born);
              if (end <= now) {
                // resolvedAt = when it SHOULD have expired, never the upgrade
                // boot: the instant is true and the retirements sort as old
                // history under Recently resolved, not as today's resolutions
                it.status = 'done'; it.resolvedAt = born > 0 ? end : now; it.resolvedBy = 'expired';
                rep.expired++; changed = true;
              } else { it.expiresAt = end; rep.stamped++; changed = true; }
            }
            return changed;
          });
          // BOTH paths flush (the live store's save is a 500 ms debounce): the
          // atomic write lands BEFORE the runner records applied[id], so a crash
          // in between re-runs the migration instead of losing the reshaping.
          // A throw here FAILS the run (retried next boot).
          store.flush();
        } finally { if (priv) store.stop(); }
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran.
        console.log('[migrate] spend-notices-expire:', JSON.stringify(rep));
        // Deliberately NO serverNotice: the user sees the result — the stale
        // rows left the inbox (resolved 'expired', under Recently resolved).
        return rep;
      },
    },
    {
      id: '2026-09-backfill-ledger-by-slot',
      note: "B-f69c ② (owner decision ut-1c6c15a2db ②): from 2.361.0 until the 2026-09-07 attribution law the OTel-observed org — the identity the CLI cached at SPAWN — decided which account a permanent ledger row was billed to, twice over: truthLookup overrode the bake by request id, and corrective attribution entries wrote the observed org into attribution.ndjson for every later bake. Both were unwired going forward; the rows kept the account each hot-switched conversation STARTED on. This re-keys every row the OTel path demonstrably wrote (its rid in the OTel stash with that account, or a corrective entry governing it) to the credential slot that held the session at the row's time — the slot-transition ledger first, then the conversation's own attribution walk with the corrective entries set aside — refuses an answer the reading-window rules contradict (the lag shadow of a re-point, a slot whose login was already dead), ARCHIVES every row it cannot prove with a per-row reason (never a guess), archives the corrective entries themselves, and re-learns the estimator rates of every identity whose accounts moved (src/ledger-slot-backfill.js).",
      run() {
        const { backfillLedgerBySlot } = require('../ledger-slot-backfill.js');
        const pass = backfillLedgerBySlot({ dataDir, id: '2026-09-backfill-ledger-by-slot' });
        // r4125 (line 828's follow): a pass whose own prices reader started on a TORN read waits for the prices' first settle — it is
        // then a stepped migration (src/migration-runner.js records it when it ends); every other pass answers at once, as before
        if (pass && typeof pass.then === 'function') return pass.then((rep) => said(rep));
        return said(pass);
        function said(rep) {
          // Say what happened even when it is nothing — a repair nobody can see
          // ran is a repair nobody can verify ran. ONE line; the same counts ride
          // the ledger's report row (the runner stores the returned object).
          console.log('[migrate] ledger-by-slot:', JSON.stringify(rep));
          // THE WHOLE REPAIR (quota r2): a pass that resumes a crashed one states
          // both — `total` — never only the remainder it found left to do
          const T = rep.total || { rekeyed: rep.rekeyed, archived: rep.archived, corrective: rep.corrective };
          if (T.rekeyed || T.archived) {
            try {
              serverNotice?.('ledger-by-slot', `Usage bookkeeping repaired: ${T.rekeyed} ledger row(s) that were billed to the account a conversation STARTED on (the OTel-observed org) were re-keyed to the account whose credentials actually served them, and ${T.archived} row(s) whose account cannot be proven were archived to data/archive/ with a reason each. The Usage window and the quota estimator (${rep.relearned} identit${rep.relearned === 1 ? 'y' : 'ies'} re-learned) re-derive from the repaired ledger.`, { level: 'info' });
            } catch { }
          }
          return { rows: rep.rows, candidates: rep.candidates, rekeyed: T.rekeyed, archived: T.archived, untouched: rep.untouched, confirmed: rep.confirmed, corrective: T.corrective, relearned: rep.relearned, ...(rep.resumed ? { resumed: true, thisPass: { rekeyed: rep.rekeyed, archived: rep.archived, corrective: rep.corrective } } : {}) };
        }
      },
    },
    {
      id: '2026-09-runaway-parks-void',
      note: "until 2026-09-25 the desktop-app and browser keepers STOPPED a session whose per-process VmRSS SUM crossed a footprint limit, PARKED its registry row / profile for an hour and (desktop apps) removed its browser profile: the owner launched Google Chrome as a desktop app and 3 s after ready it was stopped at 'RSS 2.0 GB (limit 2.0 GB)' over 25 processes that share their binary, libraries and copy-on-write heap (measured on the same box: 891 chrome pids ΣVmRSS 94.67 GB vs ΣPss 15.09 GB). The owner's ruling: a resource guard never stops an app a person or an agent is using — it reports. This voids what the old guard left on disk: every `runawayParkedUntil` map is removed (a park no longer exists), and a record's lastError that says `stopped as a runaway: RSS …` is rewritten to say which guard stopped it and that its metric was an RSS sum. Nothing else is touched; a missing file is not a failure.",
      run() {
        const rep = { desktop: voidRunaway(path.join(dataDir, 'desktop-apps.json'), 'apps', desktopKeeper), browser: voidRunaway(path.join(dataDir, 'browser-profiles.json'), 'browsers', browserKeeper) };
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran.
        console.log('[migrate] runaway-parks-void:', JSON.stringify(rep));
        // Deliberately NO serverNotice: the parks were invisible except as a
        // refused launch, and the rewritten lastError is what the panels show.
        return rep;
      },
    },
    {
      id: '2026-09-desktop-apps-host-key',
      note: "desktop apps lane C1 (docs/design-desktop-apps-seamless.zh.md §3.5, D8): a desktop app may now run on a PAIRED device (the `desktop-serve` agentd op), so the hub's registry names the MACHINE of every record. Every record in data/desktop-apps.json without a `hostId` gains `hostId: 'local'` — every record written before this lane ran on this machine (the keeper refused any other host). Through the live keeper when there is one (its in-memory store is what it saves next), else the file itself (atomic tmp+rename, its mode kept). A record that already names a machine is left alone; a missing file is not a failure and nothing is created.",
      run() {
        const rep = stampDesktopHostKey(path.join(dataDir, 'desktop-apps.json'), desktopKeeper);
        console.log('[migrate] desktop-apps-host-key:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-09-pool-manual-priority',
      note: "the whole-pool manual switch is retired (owner 2026-09-28: \"手动切换整个池其实比较confusing…做成'手动优先级'\"): a pool with auto:false — pinned by hand to its current target — gets priority [current target, …the other members in list order] and auto:true. The owner's intent is kept as the top of the order and nothing moves at boot by itself (#1 is the member the pool already sits on); a pool already auto is untouched",
      run() {
        const am = typeof accounts === 'function' ? accounts() : accounts;
        if (!am || typeof am.migrateManualPools !== 'function') {
          // no store on this boot: nothing to reshape is a success; a manual pool is a FAILURE by name (retried next boot)
          let doc = null; try { doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf-8')); } catch (e) { if (e && e.code === 'ENOENT') return []; throw accountsUnread(e); }   // r3044 (3): only «not there» is nothing to do
          const manual = (doc && Array.isArray(doc.accounts) ? doc.accounts : []).filter((a) => a && a.type === 'pooled' && a.auto !== true).length; // manual = anything the retired switch read as manual (`!!auto` false)
          if (manual) throw new Error(`no live account store to reshape ${manual} manual pool(s) through`);
          return [];
        }
        heldThrows(am);   // r3044 (3): never «ran» over an unread list — the runner tries again at the next start
        accountsReadItsFile(am);   // r3615 (MG1, r2944): a start whose read said «not there» while the file IS there — the list is empty and unheld
        const rep = am.migrateManualPools();
        console.log('[migrate] pool-manual-priority:', JSON.stringify(rep.map((r) => ({ id: r.id, priority: r.priority.length }))));
        return rep;
      },
    },
    {
      id: '2026-08-archive-dormant-task-plans',
      note: 'dormant checklist plan arrays (feature removed 2.121.0) → data/archive/',
      run() {
        { const tm0 = typeof tasks === 'function' ? tasks() : tasks; const held = tm0 && typeof tm0.unreadRefusal === 'function' ? tm0.unreadRefusal('this migration') : null; if (held) throw new Error(held); }   // THE STORE HELD UNREAD (lane bl-windows): never a write of a held store — run again at the next start
        const f = path.join(dataDir, 'task-groups.json');
        const doc = MR.readJson(f, 'task-groups.json'); if (!doc) return; // no store yet = nothing to do; MG1: unread or torn = not run
        const recs = doc.tasks || {};   // (named apart from the live store `tasks` the hold check above asks — lane bl-windows)
        const archived = {};
        for (const [id, t] of Object.entries(recs)) {
          if (t && Array.isArray(t.plan) && t.plan.length) { archived[id] = t.plan; delete t.plan; }
          else if (t && 'plan' in t) delete t.plan;
        }
        if (!Object.keys(archived).length) return;
        fs.mkdirSync(archiveDir, { recursive: true });
        const out = path.join(archiveDir, 'task-plans-legacy.json');
        const prev = MR.readJson(out, 'archive/' + path.basename(out)) || {};   // MG1: an earlier archive unread is never written over with this run's alone
        replaceSynced(out + '.tmp', out, JSON.stringify({ ...prev, ...archived }, null, 2));
        replaceSynced(f + '.tmp', f, JSON.stringify(doc, null, 2));
      },
    },
    {
      id: '2026-09-exit-access-lists',
      note: "lane-pairing ⑥ (B-7007): a machine's exit access was ONE boolean `allowExit` that opened it to EVERY conversation for both things an exit does — borrowing its network and running shell commands on it as the machine's user. It is now two lists per machine (`exit.use`, `exit.run`: nobody | everyone | only [conversations / Task Groups], run with 'ask me each time'). Behaviour is unchanged by this pass: `allowExit: true` becomes everyone / everyone (every agent could use and run before), off / absent becomes nobody / nobody; a record that already carries `exit` is kept. Every record's old value is archived to data/archive/hosts-allow-exit-<ts>.json FIRST, then the field is stripped. Through the live HostManager when there is one (it saves hosts.json whole), else the file (atomic). An unreadable hosts.json fails the run by name (retried next boot, nothing touched).",
      run() {
        const rep = migrateExitLists();
        console.log('[migrate] exit-access-lists:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-design-kit-removed',
      note: "the Design window replaces the Claude CLI's /design kit (lane design-docs, docs/design-design-window.md §3.6): VibeSpace used to extract that kit — the CLI's own skill text, seeding helper and editor payload — out of the installed claude into data/design-kit/<cliVersion>/ and hand it to agents. Nothing reads it any more, and it is the CLI vendor's content, not ours, so it is DELETED rather than archived (the one exception to archive-then-strip: keeping a copy is the thing to stop). A symlink at data/design-kit is unlinked, never followed; a symlink inside it is removed as a link. Absent = nothing to do. A failure (a permission) is retried next boot. The three canvases published from it stay on /p/<id> untouched (data/published-pages/ is never read here).",
      run() {
        const rep = removeDesignKit(path.join(dataDir, 'design-kit'));
        console.log('[migrate] design-kit-removed:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-settings-rows-retired',
      note: "settings cleanup part 1 (B-df40, lane settings-prune): the experimental VibeSpace channel (the Claude Code channels research preview of 2.344.0 — not the Channels feature) is removed with its per-session socket path, and three rows nothing applied went with it (window.enableBounceOnFocus, terminal.preserveCustomTitle, sessionCard.detailTruncation); agentd.dataPlane / remoteSessions / sessions were stored without a row since they graduated in 2.175.0. Each listed key (RETIRED_SETTING_KEYS, src/retired-settings.js) present in data/settings.json is ARCHIVED in this migration's ledger report ({stripped: {key: value}}) and stripped; every other key keeps its value and order; a file holding none of them is not rewritten (byte-identical), an absent or unparseable one is left alone. data/channel-socks/ loses its sockets (only entries that ARE sockets) and the directory goes when nothing else is in it; a link at that path is never followed.",
      run() {
        const rep = { ...stripRetiredSettingsFile(path.join(dataDir, 'settings.json')), socks: removeChannelSocks(path.join(dataDir, 'channel-socks')) };
        console.log('[migrate] settings-rows-retired:', JSON.stringify({ ...rep, stripped: Object.keys(rep.stripped) }));
        return rep;
      },
    },
    {
      id: '2026-10-archive-codex-fork-replays',
      note: "a forked codex rollout opens by REPLAYING its ancestors' token_count records, all stamped at the fork instant, and the walk keyed each one by the FORK's thread id — so the same API request was counted twice (price check wf_d2b3907b-2c5, 2026-10-02: 1,661 rows on the author's instance, 1,557 gpt-5.6-sol + 104 with a null model, ≈ $177, all 2026-08-24..25). Both walkers skip the replay from this release; this archives the rows written before that — only a LOCAL codex row whose thread's rollout is a fork, stamped within 2 s of the fork instant, whose original (an earlier row of another thread, same cumulative total, identical tokens) is still in the ledger (src/codex-fork-ledger-purge.js). Archive first (data/archive/codex-fork-replays-<day>.ndjson, a reason per row), atomic shard rewrite, idempotent. The estimator re-derives on its own: its interval costs are keyed by the ledger's event count.",
      run() {
        const { purgeCodexForkReplays } = require('../codex-fork-ledger-purge.js');
        const rep = purgeCodexForkReplays({ dataDir, codexSessionsDir: path.join(process.env.CODEX_HOME || path.join(homeDir, '.codex'), 'sessions'), id: '2026-10-archive-codex-fork-replays' });
        console.log('[migrate] codex-fork-replays:', JSON.stringify(rep));
        if (rep.archived) {
          try {
            serverNotice?.('codex-fork-replays-archived', `Usage bookkeeping repaired: ${rep.archived} Codex ledger row(s) counted a request twice (a forked conversation replays its parent's usage records) and were archived to data/archive/ with a reason each. The Usage window and the quota estimator re-derive from the cleaned ledger.`, { level: 'info' });
          } catch { }
        }
        return rep;
      },
    },
    {
      id: '2026-10-plugin-config-to-settings',
      note: "the VS Code plugin model (lane plugin-settings-p0, docs/design-plugin-settings.zh.md): a built-in plugin's configuration rows live in data/settings.json (src/plugin-settings.js tables) — each value data/plugins.json held (the Decision API switches + budget, the Voice language + teach switches, the frp relay fields, the Tailscale up flags) moves there once unless settings already holds one, and leaves plugins.json; decision-api's config.threshold (read by nobody — decision.threshold is the one truth) is dropped. Goes THROUGH the live PluginManager (it holds plugins.json in memory).",
      run() {
        const pm = typeof plugins === 'function' ? plugins() : plugins;
        if (!pm || typeof pm.migrateConfigToSettings !== 'function') return { skipped: 'no plugin manager' };
        // MG1 (r2944): the manager's load has a bare catch and no hold — the file read here first (unread or torn = not run), and a
        // plan the disk holds that the manager did not act on means its load did not read the file (not run)
        const disk = MR.readJson(path.join(dataDir, 'plugins.json'), 'plugins.json');
        let sv = {}; try { const st0 = typeof settings === 'function' ? settings() : settings; sv = (st0 && typeof st0.read === 'function' && st0.read()) || {}; } catch { sv = {}; }
        const owed = disk ? require('../plugin-settings.js').migrationPlan(disk, sv) : null;
        const rep = pm.migrateConfigToSettings();
        if (owed && (Object.keys(owed.patch || {}).length || Object.keys(owed.strip || {}).length) && !(rep.moved || []).length && !Object.keys(rep.stripped || {}).length) throw pluginsUnloaded();
        console.log('[migrate] plugin-config-to-settings:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-llm-rename',
      note: "the Decision API plugin is the LLM plugin (lane llm-plugin-rename, owner 2026-10-14: one key named by its provider, a switch per feature): (a) data/settings.json `plugin.decision-api.<k>` → `plugin.llm.<k>` unless the new key holds a value (the new one wins, the old key leaves either way; decision.threshold / attentionBlock / implicitLabels keep their spelling); (b) data/plugins.json's `decision-api` record → `llm` whole (the on-switch kept) THROUGH the live PluginManager — a record already under `llm` wins and the old one is removed, never merged; a record that arrives holding old config fields gets the config → settings move again; (c) data/integrations.json's `decision-api` record → `llm` (its values as they are, the cluster|own choice, the Test state) THROUGH the live integration store, same rule, and the card's retired `model` field leaves it — a non-empty one becomes `plugin.llm.judgeModel` when that is empty (written BEFORE the record moves, so a failed run re-reads it); (d) data/decision-memo.json / decision-usage.json / decision-journal.jsonl keep their names and shapes. A second run finds nothing under the old id (no-op).",
      run() {
        const rep = migrateLlmRename();
        console.log('[migrate] llm-rename:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-grants-unify',
      note: "EVERY PLACE YOU GIVE AGENTS ACCESS IS ONE ROW SHAPE (lane grants-unify, the owner 2026-10-23: 「权限系统要 unify 一下，不想引入太多复杂度」 — the only concepts are 给谁 and 除了). A browser profile's \"Who can use it\", an automation key's grant and its reach, a channel's access / reach / notification / raw-API tier, a machine's exit (use, run), a desktop window's share and a Task Group's outside visibility become rows {door, resource, to, except} of ONE store (data/grants.json, written by ONE writer, every change audited in data/grants-audit.jsonl), judged by ONE model (src/grant-model.js admits). Each row is carried over by the model's own legacy mapper and — before it is written — JUDGED: for every principal the old rows name (each conversation in its old spelling and the one spelling, a member of each named Task Group, an outsider), the old reader's verdict must equal the new one; a resource whose verdicts differ is NOT written (nobody may use it until it is given again) and is NAMED, and the run then fails by name (retried next boot) — every resource that agreed is written. A row the store already holds is kept. A machine whose run list asked each time keeps asking (exit.run.ask → exit.ask). The old fields stay on disk one release, UNREAD (the follow-up strips them). Exceptions (except) start empty — nothing anyone could do yesterday changes.",
      run() { return grantsUnify(); },
    },
    {
      id: '2026-10-task-group-context-rows',
      note: "a Task Group's Context table (lane task-group-context, POC v2.2 + the owner's fourth level): ONE ordered list `ctx` of rows (path + note + how much the agent is told + verbs) replaces the two old folder bindings. Every group without a table gets its rows from its old fields — each folders[] entry becomes a row told 文件名 tagged 自动发现会话 (the membership by cwd it already had, now recursive), contextDir a row told 文件名 tagged agent 在这里记笔记 (one row when it IS one of the folders; the .vibespace/TASK.md mirror stays in it). The old fields stay in the file for one release (an older build still reads them) and are no longer read. THROUGH the live TaskGroupManager when there is one (it holds task-groups.json and saves it whole), else the file (atomic). A group that already has `ctx` is skipped (a second run finds nothing). An unreadable store fails the run by name (retried next boot, nothing touched).",
      run() {
        const tm = typeof tasks === 'function' ? tasks() : tasks;
        const rep = tm && typeof tm.migrateContextRows === 'function' ? tm.migrateContextRows() : migrateContextRowsFile(path.join(dataDir, 'task-groups.json'));
        console.log('[migrate] task-group-context-rows:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-task-group-archived-members',
      note: "AN ARCHIVED CONVERSATION LEAVES ITS TASK GROUPS (lane task-group-fanout, measured 2026-10-24: 752 member keys in the lanes group, never pruned — every one rode every tasks-updated broadcast and every membership test). From this release an archive unbinds it through the store's ONE unbind writer (unbindKeys, rule task-membership membersWithout); this run prunes the keys the archive list (data/user-state.json archivedSessions — `<backend>:<id>`, or an older bare id) already names. A key whose conversation is merely not discovered yet (a machine offline at boot) is NEVER pruned. ARCHIVE FIRST: the pruned keys per group go to data/archive/task-group-archived-members.json, then the store drops them. THROUGH the live TaskGroupManager when there is one, else the file (atomic). No archive list / no store = nothing to do; an unreadable store fails by name (retried next boot).",
      run() {
        // B-225b R9: the conversation list through its THREE answers — not there ⇒ nothing to do; HELD (a read that failed, bytes that
        // are not the list) ⇒ THROWN by name, so the runner runs it again at the next start (the release returned «0 archived» here and
        // was recorded as applied for good over a list it never read)
        const st = require('../store-hold.js').readNow(path.join(dataDir, 'user-state.json'), { valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v), what: 'this migration' });
        if (st === undefined) return { archived: 0 };
        const archived = Array.isArray(st.archivedSessions) ? st.archivedSessions.map(String) : [];
        if (!archived.length) return { archived: 0 };
        const tm = typeof tasks === 'function' ? tasks() : tasks;
        { const held = tm && typeof tm.unreadRefusal === 'function' ? tm.unreadRefusal('this migration') : null; if (held) throw new Error(held); }   // THE STORE HELD UNREAD (lane bl-windows): a dry run over the EMPTY held store would mark it done with nothing pruned — run again at the next start
        const f = path.join(dataDir, 'task-groups.json');
        let doc = null;
        if (!tm || typeof tm.unbindKeys !== 'function') {
          try { doc = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch (e) { if (e && e.code === 'ENOENT') return { archived: archived.length, groups: 0 }; throw e; }   // no store = nothing to do; unreadable = fail by name
        }
        const gone = {};
        if (tm && typeof tm.unbindKeys === 'function') Object.assign(gone, tm.unbindKeys(archived, { dryRun: true }).gone);
        else for (const [id, t] of Object.entries((doc && doc.tasks) || {})) { const r = require('../task-membership.js').membersWithout(t && t.sessions, archived); if (r.gone.length) gone[id] = r.gone; }
        const n = Object.values(gone).reduce((a, l) => a + l.length, 0);
        if (n) {
          fs.mkdirSync(archiveDir, { recursive: true });
          const out = path.join(archiveDir, 'task-group-archived-members.json');
          const prev = MR.readJson(out, 'archive/' + path.basename(out)) || {};   // MG1: an earlier archive unread is never written over with this run's alone
          const merged = { ...prev };
          for (const [id, keys] of Object.entries(gone)) merged[id] = [...new Set([...(Array.isArray(prev[id]) ? prev[id] : []), ...keys])];
          replaceSynced(out + '.tmp', out, JSON.stringify(merged, null, 2));
          if (tm && typeof tm.unbindKeys === 'function') tm.unbindKeys(archived);
          else {
            for (const [id, keys] of Object.entries(gone)) doc.tasks[id].sessions = require('../task-membership.js').membersWithout(doc.tasks[id].sessions, keys, { exact: true }).keep;
            replaceSynced(f + '.tmp', f, JSON.stringify(doc, null, 2));
          }
        }
        const rep = { archived: archived.length, groups: Object.keys(gone).length, keys: n, via: tm && typeof tm.unbindKeys === 'function' ? 'store' : 'file' };
        console.log('[migrate] task-group-archived-members:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-vault-always-to-grants',
      note: "«ALWAYS» IS A GRANT (lane vault-use-grants, the owner 2026-10-27: 「每个密码请求都要我同意太麻烦了！」): a run card's «Always» now writes a vault-use grant (this conversation × the run's hosts, the grants store) instead of a command-shape row in data/vault-run.json. The old «always» rows are CARRIED into grants by the run door at its FIRST verified read — the store is marked under a key derived from the vault's DEK, so it can be judged only while the vault is unlocked (a boot is locked; an unverified row an agent could have written is never carried). This boot half counts what waits (read bounded, never trusted) so the ledger says what the upgrade found.",
      run() {
        const f = path.join(dataDir, 'vault-run.json');
        let n = 0, present = false;
        { const st = MR.stat(f, 'vault-run.json'); present = !!(st && st.isFile()); if (present && st.size <= 1024 * 1024) { const d = MR.readJson(f, 'vault-run.json'); n = Array.isArray(d && d.always) ? d.always.length : 0; } }   // MG1: not there = nothing waits; unread or torn = not run
        const rep = { store: present, alwaysRows: n, carriedAt: n ? 'the first unlocked read of the run door (the mark verified)' : 'nothing to carry' };
        console.log('[migrate] vault-always-to-grants:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-vault-use-per-scope-ends',
      note: "A GRANT'S SCOPES CARRY THEIR OWN ENDS (lane vault-standing-request r4 — 主开发: «a member's scopes carry THEIR OWN ENDS … never one end per member»): a vault-use member (who may use a stored secret with no card, for which hosts, until when) had ONE end for all its hosts and commands, so a later write had either to merge (another host took that end, or lost its own) or to replace (the hosts the owner had given were lost). Each member is now stored as its SCOPES — each host and each command its own end, tool and writer (src/vault-use-grant.js) — and a write touches only the scopes it names. Every member stored before is reshaped to the same scopes with the same end — what it always meant: the vault's mark is over that meaning (canonOf), so the reshaped member verifies as it did and no vault is needed (a boot is locked). A member whose mark would move (a legacy single tool, a tool for a host it does not hold) is left as it is and still read as before; a row this release cannot read is left untouched; either is named in ONE notice. An unreadable grants store fails the run by name (retried next boot). A second run finds nothing to reshape.",
      run() {
        const g = grantsStoreOf();
        if (g && typeof g.health === 'function' && !g.health().readable) throw new Error('data/grants.json could not be read — retried on the next boot');
        const U = require('../vault-use-grant.js');
        const rep = { rows: 0, members: 0, reshaped: 0, kept: 0, unreadable: 0 };
        for (const raw of g.rowsOfDoor('vault-use')) {
          rep.rows++;
          const plan = U.scopedRowOf(raw);
          if (!plan.ok) { rep.unreadable++; continue; }
          rep.members += plan.to.length; rep.kept += plan.unmapped.length;
          if (!plan.mapped) continue;
          const w = g.set('vault-use', raw.resource, { to: plan.to, except: plan.except }, 'migration');
          if (!(w && w.ok)) throw new Error(`a grant row could not be written (${(w && w.code) || 'not_written'}) — retried on the next boot`);
          rep.reshaped += plan.mapped;
        }
        if (rep.kept || rep.unreadable) serverNotice?.('vault-use-per-scope-kept', `Vault grants: ${rep.kept} grant(s) could not be given per-host ends${rep.unreadable ? ` and ${rep.unreadable} grant row(s) could not be read` : ''} — they are kept as they were and still work as before (one end for all their hosts). To give each host its own end, take the grant back (✕) in the Vault window and grant it again.`, { level: 'warn' });
        console.log('[migrate] vault-use-per-scope-ends:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-closed-access-pointers-hidden',
      note: "A POINTER HIDES, NEVER DECIDES (lane wake-approve-card, acceptance rounds 3 → 4 — 主开发): an access request's For-you item (its pointer to the Reach dialog) the PERSON closed before round 3 — ✓ Mark done / ✕ Dismiss / «Mark all seen», recorded resolvedBy 'user' — while its request stands OPEN lost its ↺ in round 3 and was never brought back (round 3's resurface brings back only a HIDDEN pointer), so the owner never saw it again and the agent's re-ask was told «already open». Each such record (an open-channel item whose id an OPEN access request holds, closed by 'user') becomes what round 3 writes for that close — status 'dismissed', resolvedBy 'hidden' («hidden — nothing was decided»; its resolvedAt kept) — THROUGH the live inbox store (flushed before the ledger row); then the engine's resurface (the boot reconcile's — it ran before this run) brings it back to For you now, and the re-ask brings it back from here on. Which requests are open is the CHANNELS ENGINE's to say (its index holds them): without one while a channels data dir exists the run FAILS by name (retried on a boot that has one); no channels data = nothing to do. A second run finds nothing (each such record is hidden or open again).",
      run() {
        const eng = typeof channels === 'function' ? channels() : channels;
        if (!eng || typeof eng.openAccessPointers !== 'function') {
          if (!MR.exists(path.join(dataDir, 'channels'), 'channels')) return { open: 0, hidden: 0, back: 0, store: 'absent' };   // MG1: «absent» only when not there
          throw new Error('no channels engine to name the open access requests — retried on a boot that has one');
        }
        const ids = new Set(eng.openAccessPointers());
        if (!ids.size) return { open: 0, hidden: 0, back: 0 };
        const { isPointer, HIDDEN_BY } = require('../foryou-actions.js');
        const live = liveTodos();   // B-44f3: refused by name while For you is held unread
        let store = live, priv = false;
        if (!store || typeof store.reshapeItems !== 'function') {
          if (!MR.exists(path.join(dataDir, 'user-todos.json'), 'user-todos.json')) return { open: ids.size, hidden: 0, back: 0, store: 'absent' };   // MG1: «absent» only when not there
          const { UserTodoManager } = require('../user-todos.js');
          store = new UserTodoManager({ dataDir, expirySweepMs: 0 });
          priv = true;
        }
        const rep = { open: ids.size, hidden: 0, back: 0, store: priv ? 'private' : 'live' };
        store.reshapeItems((it) => {
          if (!it || !ids.has(String(it.id)) || it.status === 'open' || it.resolvedBy !== 'user' || !isPointer(it)) return false;
          it.status = 'dismissed'; it.resolvedBy = HIDDEN_BY;   // what round 3 writes for the person's close of a pointer (src/user-todos.js hideOf)
          rep.hidden++;
          return true;
        });
        store.flush();   // the atomic write lands BEFORE the runner records applied[id] (a throw fails the run — retried next boot)
        if (rep.hidden && !priv && typeof eng.resurfacePointers === 'function') rep.back = eng.resurfacePointers();   // the engine holds THIS store: back in For you now
        console.log('[migrate] closed-access-pointers-hidden:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-10-usage-ledger-dedup',
      note: "A RE-EMISSION COSTS ZERO BYTES (lane ledger-dedup-law, B-7f9e, measured 2026-10-26 on a fleet instance): the usage harvest re-sent the whole window since its device cursor at every run (the cursor commit waited at the hub-act gate for an owner who never answered) and the ledger appended it again — the readers deduplicate by rid, so the totals stayed right while one monthly shard grew 1 GiB → 23.8 GiB (≥ 95 % repeats) and an outside probe that read it whole took the container down. From this release the ingest deduplicates at write time and the hub keeps the device cursor; this pass shrinks what was written before: every shard whose sampled rows / unique-rid ratio is over 1.2 (or that is over 1 GiB) is deduplicated by rid, keeping the FIRST row (what every reader already counted — the totals do not change), streaming through a tmp file renamed in, a copy whose bytes differ from the kept row archived first; STEPPED on the loop (≤ 40 ms a turn — the boot law), recorded when it ends, so a restart mid-way runs it again from the shard it was on (the tmp discarded). The ledger cache sees the new inode and rebuilds off the loop.",
      run() {
        const LD = require('../usage-ledger-dedup.js');
        const dir = path.join(dataDir, 'usage-history');
        let names = [];
        names = (MR.list(dir, 'usage-history') || []).filter((f) => LD.SHARD_RE.test(f)).sort();   // MG1: not there = no shards; any other failed list = not run
        if (!names.length) return { shards: 0, deduped: 0 };
        const uh = typeof usageHistory === 'function' ? usageHistory() : usageHistory;
        const turn = () => new Promise((r) => setImmediate(r));
        return (async () => {
          const rep = { shards: names.length, sampled: [], deduped: 0, before: 0, after: 0, removed: 0, archived: 0, journal: [] };
          for (const f of names) {
            await turn(); // one shard's sample per loop turn (≤ 16 MiB read)
            let sh; try { sh = LD.shapeOf(path.join(dir, f)); } catch (e) { if (e && e.code === 'ENOENT') { rep.sampled.push({ shard: f, error: 'ENOENT' }); continue; } throw MR.unread('usage-history/' + f, e); }   // MG1: a shard gone since the list is skipped; one unread = the step fails (not recorded)
            const ratio = sh.ratio == null ? null : Math.round(sh.ratio * 100) / 100;
            rep.sampled.push({ shard: f, size: sh.size, ratio });
            if (!(sh.size > 1024 ** 3 || (ratio != null && ratio > 1.2))) continue;
            const file = path.join(dir, f);
            const r = uh && typeof uh.dedupShard === 'function' ? await uh.dedupShard(file, { why: 'the one-shot migration' }) : await LD.runStepped(LD.dedupSteps(file, { archiveDir }));
            const line = { shard: f, before: r.before, after: r.after, removed: r.removed, archived: r.archived, renamed: r.renamed, ...(r.why ? { why: r.why } : {}) };
            console.log('[migrate] usage-ledger-dedup', JSON.stringify(line));
            rep.journal.push(line);
            if (r.renamed) { rep.deduped++; rep.removed += r.removed; rep.archived += r.archived; }
            rep.before += r.before; rep.after += r.after;
          }
          if (rep.deduped) { try { serverNotice?.('usage-ledger-deduped', `Usage bookkeeping repaired: ${rep.removed} repeated ledger row(s) were removed from ${rep.deduped} file(s) (${(rep.before / 2 ** 20).toFixed(0)} → ${(rep.after / 2 ** 20).toFixed(0)} MiB) — the first copy of each kept, the Usage window's totals unchanged.`, { level: 'info' }); } catch { } }
          return rep;
        })();
      },
    },
    {
      id: '2026-10-job-secrets-retired',
      note: "A SECRET AT REST NAMES ITS VAULT ENTRY — OR THE OWNER IS TOLD (lane job-secrets-retire r2, design-vault-service-secret D10): data/job-secrets.json was a PLAINTEXT store of a job's secrets (the old GET / POST /api/jobs-secrets — no client ever wrote it; the engine read it into a job's env as envFrom). From this release nothing reads it and its routes are gone, so a store an owner once filled by hand would sit in data/ in the clear with no door and nobody told. This one-shot RENAMES it to data/job-secrets.retired.json (0600 — the owner's bytes, KEPT: never deleted by us) and files ONE For-you notice under Vault naming the file, the names it held (names only, never a value) and the recipe (each into the vault as a secret entry, then delete the file; a job reads one with --vault). src/vault.js SECRETS_AT_REST names the retired file until the owner deletes it. No file ⇒ nothing. A run that renamed and then failed to file the notice is not recorded: the next boot finds the retired file and files it (ONE item, keyed by this migration). Both names present ⇒ FAILS by name, nothing moved (never over the owner's bytes) — and the same For-you item says so first (r3: the runner runs before any client connects, so a journal line alone reached nobody). A state with nothing left to tell — no file, a non-file, an empty store — settles that item (r4).",
      run() {
        const from = path.join(dataDir, JOB_SECRETS_FILE), to = path.join(dataDir, JOB_SECRETS_RETIRED);
        // a state with nothing left to tell (no file, a non-file, an empty store) SETTLES the one item an earlier boot filed —
        // «Two files…» never stays open over files the owner already removed (r4, review R3-F2). The LIVE store only (a fresh
        // install still makes no data/user-todos.json), flushed before the runner records the row — the row never runs again
        const settle = (rep) => {
          const live = liveTodos();   // B-44f3: held ⇒ refused by name OUTSIDE the catch (the row runs again at the read — never «settled» over an unread list)
          try {
            const ids = live?.idsWhere?.((i) => i.sessionKey === 'vault' && i.itemKey === JOB_SECRETS_ITEM && i.status === 'open') || [];
            for (const x of ids) live.setStatus(x, 'done', 'system');
            if (ids.length) live.flush?.();
          } catch { }
          return rep;
        };
        let st = null;
        st = MR.lstat(from, JOB_SECRETS_FILE);   // not there — nothing was stored, or an earlier run renamed it; MG1: any other failed stat = not run
        if (st && !st.isFile() && !st.isSymbolicLink()) return settle({ store: 'not-a-file' });   // a directory / socket by that name was never the store
        if (st) {
          if (MR.exists(to, JOB_SECRETS_RETIRED)) {   // MG1: existsSync answers false for any stat error
            // r3 (review F2): the runner runs inside hub.listen's callback, before any client connects — the failure is said
            // in For you too, and the error carries `told` so the runner files no second item for it
            let told = false;
            try { told = jsTell({ key: JOB_SECRETS_WORDS.both, params: { from: 'data/' + JOB_SECRETS_FILE, to: 'data/' + JOB_SECRETS_RETIRED } }, []).notice === 'filed'; } catch (e) { if (e && e.code === 'todos-unread') throw e; console.warn(`[migrate] job-secrets-retired: the For-you notice was not filed — ${e && e.message}`); }   // B-44f3: a refusal by name rides out — the row runs again at the read (never «retry on next restart»)
            throw Object.assign(new Error(`data/${JOB_SECRETS_RETIRED} already exists beside data/${JOB_SECRETS_FILE} — nothing moved (never over the owner's bytes); move one of them aside and restart`), { told });
          }
          fs.renameSync(from, to);
        } else if (!MR.exists(to, JOB_SECRETS_RETIRED)) return settle({ store: 'absent' });   // MG1: «absent» only when not there
        if (fs.lstatSync(to).isFile()) fs.chmodSync(to, 0o600);   // a symlink's target is not ours to chmod
        // r3288 (2): a SECOND run over its own result (a ledger moved aside runs every migration again) never reopens the notice the
        // person CLOSED — its sibling's rule (2026-11-job-secrets-buttons): a keyed item that is not open stays as the owner left it
        if (!st) {
          const live = liveTodos();   // B-44f3: refused by name while For you is held unread
          const ids = (fn) => (live && typeof live.idsWhere === 'function' ? live.idsWhere(fn) || [] : []);
          const keyed = ids((i) => i.sessionKey === 'vault' && i.itemKey === JOB_SECRETS_ITEM), open = ids((i) => i.sessionKey === 'vault' && i.itemKey === JOB_SECRETS_ITEM && i.status === 'open');
          if (keyed.length && !open.length) { console.log('[migrate] job-secrets-retired: its notice is kept as the owner left it (closed)'); return { store: 'renamed-earlier', to: 'data/' + JOB_SECRETS_RETIRED, notice: 'kept as the owner left it (closed)' }; }
        }
        // its NAMES only — the values are parsed to find the names and never leave this function (no log, no ledger, no notice)
        const { names, lines } = jsLines();
        const rep = { store: st ? 'renamed' : 'renamed-earlier', to: 'data/' + JOB_SECRETS_RETIRED, names: names ? names.length : null };
        if (names && !names.length) { console.log('[migrate] job-secrets-retired:', JSON.stringify(rep)); return settle({ ...rep, notice: 'none (it held no name)' }); }
        Object.assign(rep, jsTell({ key: JOB_SECRETS_WORDS.text, params: { file: 'data/' + JOB_SECRETS_RETIRED } }, lines, { buttons: true }));
        if (rep.notice !== 'filed') throw new Error('the For-you notice was not filed — retried next boot (the file is renamed and kept)');
        console.log('[migrate] job-secrets-retired:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-11-warmth-ramp-derived',
      note: "the cache-warmth ramp (q-059 r5, lane cache-warmth-ramp r2): the warmth tokens derive from the theme's RAW hues now, but a custom theme saved on .374 holds the OLD derivation strings in its css (the theme editor seeded each «Cache warmth» row with it, a save froze it) and its injected rule outranks style.css — so per theme, each of the five keys whose stored value byte-equals its .374 string is DROPPED and the derivation applies; any other value is the person's and stays; nothing is said (nothing they chose changed)",
      run() {
        const rep = dropWarmthDerived(path.join(dataDir, 'custom-themes.json'));
        console.log('[migrate] warmth-ramp-derived:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-11-warmth-derived-current',
      note: "B-2e7b (the theme editor stored a «Cache warmth» row's CURRENT derivation as if the person chose it): a custom theme saved since the r5 ramp holds the five current strings verbatim, so the next change of a derivation would need another migration. The ONE rule (src/custom-theme-normalize.js) drops a value equal to its key's current derivation too — the store's writer applies it at every save; this row runs it once over what is on disk",
      run() {
        const rep = dropWarmthDerived(path.join(dataDir, 'custom-themes.json'));
        console.log('[migrate] warmth-derived-current:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: AGY_READS_MIGRATION_ID,
      note: "ONE ROW PER VENDOR (lane usage-predict; the owner looked at the quota row on 2026-11-16 and asked «fable是antigravity吗？»): Antigravity's two automatic usage reads (after a usage wall, after a stretch of work) leave Claude's row (accounts.onDemandQuotaRefresh) for their own, antigravity.autoUsageReads — and an instance whose shared row was Off keeps them off: nobody gets a read they turned off",
      run() {
        const st = typeof settings === 'function' ? settings() : settings;
        // no live store: nothing to do on disk ⇒ done; something to do ⇒ FAILS by name, runs at the next boot (the plugin moves' rule).
        // A settings.json torn at boot reads as «nothing to do» and is recorded done — harmless: antigravity.autoUsageReads then holds
        // no value, and a row holding none reads Off while Claude's row is Off, at every read (src/harness-settings.js readRow, U2)
        if (!st && !peek('settings.json', (d) => d['accounts.onDemandQuotaRefresh'] === 'off' && d['antigravity.autoUsageReads'] === undefined)) { console.log(`[migrate] ${AGY_READS_MIGRATION_ID}: nothing to do on disk (no live settings store was needed)`); return { changed: false, why: 'nothing to do' }; }
        const rep = agyReadsFollowClaudeOff(st);
        console.log(`[migrate] ${AGY_READS_MIGRATION_ID}: ${rep.why}`);
        return rep;
      },
    },
    {
      id: CLOAK_MIGRATION_ID,
      note: "CLOAKBROWSER INSTALLS AS A PLUGIN (lane engine-spi-egress L3 + its acceptance rounds 2 and 3, design-desk cloak-plugin.md §4 + its addendum §3 — the owner 2026-11-01/02: 「把cloakbrowser也做成插件，默认不要包含」「cloakbrowser直接去掉吧」): the core keeps no CloakBrowser of its own, so what this instance holds of it moves to the plugin `vibespace.cloak-browser` ONCE — no shim, no auto-install, nothing deleted. READ first — its own archive, data/browser-profiles.json, data/settings.json, the plugin's seeds.json: a torn or unreadable one FAILS by name before any write (retried at the next boot). VibeSpace's earlier download is carried ONLY when its install proof says so (data/browser-tools/cloak-installed.json names the measured build and the file hashes to it — the hash STREAMED, the row then STEPPED and the keeper's boot waiting for it; never on a retry that already has its verdict); otherwise it is left out, said as unverified. ARCHIVE BEFORE STRIP: the archive is the FIRST write (pending until the notice is out) and holds everything the run displaces; a retry resumes that judgement — the same end state, one notice in the first run's words, its `via` too. Then, each step idempotent: the seeds merged into seeds.json (never over the plugin's own); the program path + the site list into the plugin's rows (never over a value they hold), both old keys stripped; THROUGH the live keeper: every CloakBrowser profile → chromium + the plugin as its build, a defaultBackend of CloakBrowser cleared everywhere, a running one marked endAtBoot (ended by identity before adoption — and a record a failed run leaves is ended by the keeper's unreadable-record rule), the old proxy / seat / major readings dropped, an open proposal re-judged unavailable, a site hint naming it kept as tier 2 (the plugin has a program row) or dropped and archived; ONE For-you notice — only when something moved.",
      run() { return migrateCloakToPlugin(); },
    },
    {
      id: '2026-11-job-secrets-buttons',
      note: "THE RETIRED JOB-SECRETS NOTICE HAS ITS BUTTONS (B-ef1b — the follow-up of lane job-secrets-retire, int361's seam F reading 2026-10-30: a notice that asks the owner to do something is answerable where it appears): 2026-10-job-secrets-retired filed ONE notice that asked, in words only, to put each value into the vault and delete the file. It now carries two buttons (src/foryou-actions.js job-secrets-retired — «Move into the vault» / «Delete the file», answered by src/server/job-secrets-door.js). This one-shot re-files that ONE notice (the same key: its words the latest, the buttons on it) while data/job-secrets.retired.json is still there and the notice is still OPEN — one the owner closed stays closed (pruned from the tray too: no open notice ⇒ nothing filed); no retired file (or a second store beside it, which the first one-shot still reports) ⇒ nothing filed.",
      run() {
        const to = path.join(dataDir, JOB_SECRETS_RETIRED);
        let st = null;
        st = MR.lstat(to, JOB_SECRETS_RETIRED); if (!st) return { notice: 'none (no retired file)' };   // MG1: any other failed stat = not run
        if (!st.isFile()) return { notice: 'none (not a file)' };
        if (MR.exists(path.join(dataDir, JOB_SECRETS_FILE), JOB_SECRETS_FILE)) return { notice: 'none (two files — 2026-10-job-secrets-retired says so)' };
        const live = liveTodos();   // B-44f3: refused by name while For you is held unread
        let store = live, priv = false;
        if (!store || typeof store.idsWhere !== 'function') { const { UserTodoManager } = require('../user-todos.js'); store = new UserTodoManager({ dataDir, expirySweepMs: 0 }); priv = true; }
        if (priv && typeof store.isHeldUnread === 'function' && store.isHeldUnread()) { try { store.stop(); } catch { } throw Object.assign(new Error('user-todos.json is there and could not be read — not run: the next start tries again'), { code: MR.CODE }); }   // MG1: a held private store answers no item — never «no open notice»
        let keyed = [], open = [];
        try {
          keyed = store.idsWhere((i) => i.sessionKey === 'vault' && i.itemKey === JOB_SECRETS_ITEM) || [];
          open = store.idsWhere((i) => i.sessionKey === 'vault' && i.itemKey === JOB_SECRETS_ITEM && i.status === 'open') || [];
        } finally { if (priv) { try { store.stop(); } catch { } } }
        if (!open.length) return { notice: keyed.length ? 'kept as the owner left it (closed)' : 'none (no open notice — closed and pruned, or never filed)' };   // THE READ (r1): never a notice the owner closed brought back (a pruned one included)
        const { names, lines } = jsLines();
        if (names && !names.length) return { notice: 'none (it holds no name)' };
        const rep = { names: names ? names.length : null, ...jsTell({ key: JOB_SECRETS_WORDS.text, params: { file: 'data/' + JOB_SECRETS_RETIRED } }, lines, { buttons: true }) };
        if (rep.notice !== 'filed') throw new Error('the For-you notice was not filed — retried next boot (the file is kept)');
        console.log('[migrate] job-secrets-buttons:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-11-default-key-names',
      note: "B-ba7d (the owner's decision 2026-11-18: a key's last characters are the person's own read only): a key added without a name was named «API key …<its tail>», a name that travels in every list, push, payload and usage row — renamed «API key» (the person reads the tail through POST /api/accounts/tails)",
      run() {
        const am = typeof accounts === 'function' ? accounts() : accounts;
        if (!am || typeof am.renameDefaultKeyNames !== 'function') {
          // no store on this boot: a stored default name is a FAILURE by name (retried next boot); none is a success
          let doc = null; try { doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf-8')); } catch (e) { if (e && e.code === 'ENOENT') return []; throw accountsUnread(e); }   // r3044 (3): only «not there» is nothing to do
          const left = (doc && Array.isArray(doc.accounts) ? doc.accounts : []).filter((a) => a && a.tail && a.name === 'API key …' + a.tail).length;
          if (left) throw new Error(`no live account store to rename ${left} default key name(s) through`);
          return [];
        }
        heldThrows(am);   // r3044 (3): never «ran» over an unread list — the runner tries again at the next start
        accountsReadItsFile(am);   // r3615 (MG1, r2944): a start whose read said «not there» while the file IS there — the list is empty and unheld
        const rep = am.renameDefaultKeyNames();
        console.log('[migrate] default-key-names:', JSON.stringify({ renamed: rep.length }));
        return rep;
      },
    },
    {
      id: '2026-11-keeper-reshapes-retried',
      note: "MG1 (row B-f276, r2929 (b)): 2026-09-runaway-parks-void and 2026-09-desktop-apps-host-key read a store that was THERE and could not be read as «no store», and were recorded over nothing. Their ledger report tells that from a run that reshaped (`via: 'none'` beside 'keeper' / 'file'); a ledger written before reports rode it has none, and is read as «over nothing». Each such store that is there NOW in the old shape is reshaped once more, through its live keeper or its file (both reshapes are idempotent).",
      run() {
        const L = MR.readJson(path.join(dataDir, 'migrations.json'), 'migrations.json') || {};
        const applied = (L && L.applied) || {}, reports = (L && L.reports) || {};
        const overNothing = (id, part) => { if (!applied[id]) return false; const r = reports[id]; const x = r && (part ? r[part] : r); return !x || x.via === 'none'; };
        const recs = (doc, key) => Object.values(doc && doc[key] && typeof doc[key] === 'object' ? doc[key] : {});
        const parked = (doc, key) => !!doc && ('runawayParkedUntil' in doc || recs(doc, key).some((r) => r && typeof r.lastError === 'string' && r.lastError.startsWith(OLD_RUNAWAY_PREFIX)));
        const unkeyed = (doc) => recs(doc, 'apps').some((r) => r && typeof r === 'object' && !(typeof r.hostId === 'string' && r.hostId));
        const DA = path.join(dataDir, 'desktop-apps.json'), BP = path.join(dataDir, 'browser-profiles.json');
        const rep = {};
        if (overNothing('2026-09-runaway-parks-void', 'desktop') && parked(MR.readJson(DA, 'desktop-apps.json'), 'apps')) rep.desktop = voidRunaway(DA, 'apps', desktopKeeper);
        if (overNothing('2026-09-runaway-parks-void', 'browser') && parked(MR.readJson(BP, 'browser-profiles.json'), 'browsers')) rep.browser = voidRunaway(BP, 'browsers', browserKeeper);
        if (overNothing('2026-09-desktop-apps-host-key') && unkeyed(MR.readJson(DA, 'desktop-apps.json'))) rep.hostKey = stampDesktopHostKey(DA, desktopKeeper);
        console.log('[migrate] keeper-reshapes-retried:', JSON.stringify(rep));
        return rep;
      },
    },
    {
      id: '2026-11-kept-browser-notes',
      note: "THE KEPT BROWSERS' FOLDERS OF TODAY GET THEIR NOTE (主开发 r3786 hold 8, line 821's second form — LAW 5): a kept browser's folder now holds a small note (its key, its conversation, its first time — src/server/browser-kept-note.js) written before its browser starts, and every start reconciles the rows and the bindings from the notes; a folder made before this release has none. ONE STEPPED pass (the boot never waits for it; off the loop): every row the kept list AND a binding both name, while both files read, gets its note; a row only one of them names gets nothing; a failure is not recorded and runs again at the next start",
      run() { return require('./browser-kept-note.js').noteExisting({ dataDir }).then((rep) => { console.log('[migrate] kept-browser-notes:', JSON.stringify(rep)); return rep; }); },
    },
  ];
  /** MG1 (r2944) on the train (r3615): THE LIVE LIST STARTED OVER A FILE IT NEVER READ. The accounts list's own hold (heldThrows)
   *  covers a read that failed and torn bytes; it does not cover a start whose read answered «not there» while the file IS there by
   *  the migration step (a network folder that answers so once, a file put back during the boot): the list starts fresh, EMPTY and
   *  unheld. So after heldThrows the migration reads the file itself (unread or torn ⇒ not run) and refuses when it holds an id the
   *  live store did not load ⇒ not run, nothing recorded, the next start tries again. */
  function accountsReadItsFile(am) {
    const doc = MR.readJson(path.join(dataDir, 'accounts.json'), 'accounts.json');
    const ids = (doc && Array.isArray(doc.accounts) ? doc.accounts : []).map((a) => a && a.id).filter(Boolean);
    if (typeof am.get === 'function' && ids.some((id) => !am.get(id))) throw Object.assign(new Error('accounts.json holds records the live account store did not load at this start — not run: the next start tries again'), { code: MR.CODE });
  }
  const pluginsUnloaded = () => Object.assign(new Error('plugins.json holds records the live plugin manager did not load at this start — not run: the next start tries again'), { code: MR.CODE });

  /** 2026-10-grants-unify: every pre-unify who-list → rows of THE grants store (src/server/grants-migration.js). `ensure`
   *  = leave data/grants.json on disk even when nothing was carried (false on the rollback re-run below). */
  function grantsStoreOf() { const g = typeof grants === 'function' ? grants() : grants; return g || require('./grants-store.js').forDir(dataDir); }
  function grantsUnify({ ensure = true } = {}) {
    const eng = typeof channels === 'function' ? channels() : channels;
    // B-f276 A3 (主开发 r566 #3): the channels PAUSED (a file of theirs could not be read) — the who-lists are not read from an index
    // nobody read: the run FAILS by name and the runner retries it at the next boot (never recorded as done over an empty list)
    { const pz = eng && typeof eng.pausedState === 'function' ? eng.pausedState() : null; if (pz) throw Object.assign(new Error(`grants-unify waits: ${pz.error}`), { code: 'store-blocked' }); }
    let channelIndex = null;
    try { channelIndex = eng && eng.store && eng.store.index && typeof eng.store.index.snapshot === 'function' ? eng.store.index.snapshot() : null; } catch { channelIndex = null; }
    let bindings = null;
    try { bindings = require('./browser-bindings.js').create({ dataDir }); } catch { bindings = null; }
    // r3054: a key no binding names stands for ITSELF in the grants it is moved to — so while the bindings file cannot be read this
    // one-shot step WAITS (a failed step runs again at the next start), never moving a grant from its conversation to a bare key
    if (bindings && typeof bindings.state === 'function' && bindings.state() === 'unknown') throw new Error('the browser bindings file could not be read — this step runs again at the next start');
    const rep = require('./grants-migration.js').migrate({ dataDir, store: grantsStoreOf(), hosts, channelIndex, ensure, resolveBrowserKey: (bk) => { try { return bindings ? bindings.conversationOf(bk) || null : null; } catch { return null; } } });
    console.log('[migrate] grants-unify:', JSON.stringify(rep));
    return rep;
  }
  /**
   * THE ROLLBACK ROAD (verify F2): the ledger is keyed by id, so a data/grants.json deleted AFTER 2026-10-grants-unify ran
   * left every door closed with nothing said (the owner's grants gone, the migration answering `already`). A boot whose
   * ledger is stamped but finds NO store on disk:
   *  · an old list is still on disk (they stay one release, unread) ⇒ the migration RUNS AGAIN — the same judge, a row
   *    the store holds is kept — and the store comes back as the old lists say (what a downgrade would read); said by name
   *    (`rearmed`) in the log and ⚙ Diagnostics;
   *  · nothing is left to carry ⇒ `grants_store_missing` in the log, ⚙ Diagnostics and a notice — every door stays closed
   *    (nobody, never everyone), and no file is made, so the next boot says it again until access is given.
   * → what the ledger result gains (`{}` when the store is on disk).
   */
  function grantsStoreBoot() {
    const id = '2026-10-grants-unify';
    const st = grantsStoreOf();
    if (!st || typeof st.onDisk !== 'function' || st.onDisk()) return {};
    const say = (line) => { try { note?.(line); } catch { } };
    try {
      const rep = grantsUnify({ ensure: false });
      if ((rep.seeded || 0) + (rep.kept || 0) > 0) {
        const line = `[migrate] ${id} rearmed: data/grants.json was missing while the lists from before the upgrade are still on disk — ${rep.seeded} grant row(s) carried again (a grant changed since the upgrade reads as it did before it)`;
        console.warn(line); say(line);
        return { status: 'rearmed', report: rep };
      }
      const line = 'grants_store_missing: data/grants.json is missing and no list from before the upgrade is left to carry — every door is closed (nobody may use anything) until access is given again';
      console.warn(`[grants] ${line}`); say(line);
      try { serverNotice?.('grants_store_missing', `Access lists: ${line}.`, { level: 'warn' }); } catch { }
      return { missing: 'grants_store_missing' };
    } catch (e) {
      // the journal keeps the error whole; ⚙ Diagnostics and the toast are screens — its first line through the runner's belt (r4)
      const line = `[migrate] ${id} rearmed (data/grants.json was missing) and FAILED: `;
      console.warn(line + e.message); say(line + failedLine(e));
      try { serverNotice?.('migration-failed:' + id, `Data migration ${id} ran again because data/grants.json was missing, and failed: ${failedLine(e)}`, { level: 'warn' }); } catch { }
      return { status: 'failed', rearmed: true, error: e.message };
    }
  }

  /** 2026-10-task-group-context-rows without a live store: the rows written into the file beside the old fields (kept,
   *  one release), atomically. No file = nothing to do; an unparseable one throws (the runner retries next boot). */
  function migrateContextRowsFile(file) {
    let raw;
    try { raw = fs.readFileSync(file, 'utf-8'); } catch (e) { if (e.code === 'ENOENT') return { skipped: 'no store' }; throw e; }
    const doc = JSON.parse(raw);
    const TC = require('../task-context.js');
    const rep = { groups: 0, rows: 0, folders: 0, notes: 0, merged: 0, nonRecursive: 0, skipped: 0, via: 'file' };
    for (const t of Object.values((doc && doc.tasks) || {})) {
      if (!t || typeof t !== 'object') continue;
      if (Array.isArray(t.ctx)) { rep.skipped++; continue; }
      const m = TC.rowsFromLegacy({ folders: t.folders, contextDir: t.contextDir });
      t.ctx = m.rows;
      rep.groups++; rep.rows += m.rows.length; rep.folders += m.folders; rep.notes += m.notes; rep.merged += m.merged; rep.nonRecursive += m.nonRecursive;
    }
    if (rep.groups) replaceSynced(file + '.tmp', file, JSON.stringify(doc, null, 2));
    return rep;
  }

  /** What the DISK holds (read-only; an unreadable file counts as "may hold" — the run then needs the live store that owns it).
   *  Hoisted from 2026-10-llm-rename unchanged (lane usage-predict: 2026-11-agy-reads-follow-claude-off asks it too). */
  const peek = (name, test) => {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf-8')); } catch (e) { return !(e && e.code === 'ENOENT'); }
    try { return !!test(doc || {}); } catch { return true; }
  };
  /** 2026-10-llm-rename: what the DISK holds under the old id (read-only; an unreadable file counts as "may hold" — the
   *  run then needs the live store that owns it), then the move through the live PluginManager + integration store. */
  function migrateLlmRename() {
    const FROM = 'decision-api', TO = 'llm';
    { const st0 = typeof settings === 'function' ? settings() : settings; let sv = null; try { sv = st0 && typeof st0.read === 'function' ? st0.read() : null; } catch { sv = null; }
      if (sv && sv[Symbol.for('vibespace.settings-held')]) throw new Error('the settings (data/settings.json) could not be read — nothing was moved; it runs at the next start'); }   // B-225b R9: never moved over the defaults
    const inSettings = peek('settings.json', (d) => Object.keys(d).some((k) => k.startsWith(`plugin.${FROM}.`)));
    const inPlugins = peek('plugins.json', (d) => d.plugins && d.plugins[FROM]);
    const inStore = peek('integrations.json', (d) => d.integrations && (d.integrations[FROM] || (d.integrations[TO] && d.integrations[TO].values && d.integrations[TO].values.model !== undefined)));
    const pm = typeof plugins === 'function' ? plugins() : plugins;
    const st = typeof integrations === 'function' ? integrations() : integrations;
    if ((inSettings || inPlugins) && !(pm && typeof pm.renamePlugin === 'function')) throw new Error(`data/${inPlugins ? 'plugins' : 'settings'}.json holds the ${FROM} plugin and no live PluginManager was handed in — nothing was moved`);
    if (inStore && !(st && typeof st.renameRecord === 'function')) throw new Error(`data/integrations.json holds the ${FROM} row and no live integration store was handed in — nothing was moved`);
    // the card's retired model field → the plugin's judgeModel row (only where settings holds none), FIRST
    const model = st && typeof st.plainOf === 'function' ? (st.plainOf(FROM, ['model']).model || st.plainOf(TO, ['model']).model || '') : '';
    // MG1 (r2944): the manager's load has a bare catch and no hold — plugins.json read here (unread or torn = not run); a record the
    // disk holds under the old id that the manager did not move means its load did not read the file (not run)
    const pdisk = pm && typeof pm.renamePlugin === 'function' ? MR.readJson(path.join(dataDir, 'plugins.json'), 'plugins.json') : null;
    const plug = pm && typeof pm.renamePlugin === 'function' ? pm.renamePlugin(FROM, TO, { seed: model ? { judgeModel: model } : {} }) : { settings: { moved: [], dropped: [], seeded: [] }, record: 'none', config: null };
    if (pdisk && pdisk.plugins && pdisk.plugins[FROM] && plug.record === 'none') throw pluginsUnloaded();
    const store = inStore ? st.renameRecord(FROM, TO, { drop: ['model'] }) : { moved: false, dropped: false };
    return { settings: plug.settings, plugins: plug.record, config: plug.config, integrations: store, judgeModel: plug.settings.seeded.length ? 'seeded' : model ? 'kept' : 'none' };
  }

  /** 2026-11-warmth-ramp-derived: data/custom-themes.json is ROWS — `{ <name>: { css: { '--key': 'value' }, terminal } }`
   *  (src/routes/persistence.js, the /api/custom-themes store), not CSS text. Per theme, a --warmth-* value byte-equal to ITS
   *  .374 string is dropped; any other value stays — another key's string, a colour, a space; a theme (or its css) that is not
   *  an object is skipped and named in the report: src/custom-theme-normalize.js, the ONE rule (r3 — the store's writer runs
   *  it too, so a .374 bundle imported later is dropped at the door; its by-name maps are prototype-less). The store is
   *  computed WHOLE and written ONCE (tmp +
   *  rename, 2-space JSON as the route writes it, the file's mode kept) and only when something dropped — an untouched store
   *  stays byte-identical, and a throw anywhere before the rename (after the first theme or the last) leaves the file as it
   *  was, so the runner's retry converges. The route fills its in-memory copy at a request's first read; the registry runs in
   *  hub.listen's callback, before any request. The report rides the ledger (`reports[id]`): every dropped key by theme — the
   *  archive (the values are the five constants). */
  function dropWarmthDerived(file) {
    const none = (store) => ({ store, themes: 0, dropped: {}, kept: 0, skipped: [] });
    // B-225b R9: through the store's three answers — not there ⇒ nothing to do; HELD (a read that failed, bytes that are not the set)
    // ⇒ THROWN by name: never rewritten, and the runner runs it again at the next start (the release recorded «unparseable» as done)
    const doc = require('../store-hold.js').readNow(file, { valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v), what: 'this migration' });
    if (doc === undefined) return none('absent');
    const n = normalizeCustomThemes(doc);
    const rep = { store: 'untouched', themes: n.themes, dropped: n.dropped, kept: n.kept, skipped: n.skipped };
    if (!n.changed) return rep;   // nothing dropped ⇒ never written (test-migrations pins it by inode + mtime)
    let mode = 0o644; try { mode = fs.statSync(file).mode & 0o777; } catch { }
    const tmp = `${file}.${process.pid}.tmp`;
    try { replaceSynced(tmp, file, JSON.stringify(n.doc, null, 2), mode); } catch (e) { try { fs.unlinkSync(tmp); } catch { } throw e; }   // a failed rename leaves no temp either
    rep.store = 'rewritten';
    return rep;
  }

  /** 2026-11-cloak-to-plugin (the row's note says the rule): READ everything, then write — seeds, settings, the keeper's
   *  registry, the archive, the ONE notice. → the report (what moved; the ledger keeps it). */
  // round 3 (主开发's law A′): THE PROOF NEVER HOLDS THE BOOT. The download's SHA-256 is STREAMED (the base install's own sha256Of
  // shape, 1 MiB at a time) — the row is then a STEPPED one (its run() returns a promise the runner records when it ends) and the
  // keeper's boot waits for it (`beforeBrowserBoot()` — the order law: nothing is adopted before this migration has judged it);
  // the WHOLE body runs after the hash (nothing it reads can change under it). The hash runs ONCE: a retry whose pending archive
  // already holds the verdict never hashes again. No hash needed (no download, no stamp, a stamp for another build) ⇒ the row
  // stays synchronous, as it always was.
  const sha256Of = (file) => new Promise((resolve, reject) => { const h = require('crypto').createHash('sha256'); fs.createReadStream(file, { highWaterMark: 1 << 20 }).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex'))); });
  /** What the earlier download's install proof says WITHOUT hashing it: a final verdict, or `{needHash, file, stamp}`. */
  function cloakDownloadFacts() {
    const dl = path.join(dataDir, CLOAK_OLD.download);
    const dst = MR.stat(dl, CLOAK_OLD.download);   // MG1: not there = absent; any other failed stat = not run
    let exec = false; if (dst && dst.isFile()) { try { fs.accessSync(dl, fs.constants.X_OK); exec = true; } catch (e) { if (!(e && e.code === 'EACCES')) throw MR.unread(CLOAK_OLD.download, e); } }   // EACCES = not executable: never an install
    if (!exec) return { present: false, proven: false, why: 'absent' };
    const mark = MR.exists(path.join(dataDir, CLOAK_OLD.unpackMark), CLOAK_OLD.unpackMark);
    const st = MR.readJson(path.join(dataDir, CLOAK_OLD.stamp), CLOAK_OLD.stamp);   // MG1: not there = no install stamp; unread or torn = not run
    if (!st || typeof st !== 'object') return { present: true, proven: false, why: mark ? 'an unpack the update cut (its marker, no install stamp)' : 'no install stamp' };
    if (st.chromium !== cloakMeasured.chromium || st.sha256 !== cloakMeasured.sha256) return { present: true, proven: false, why: `the install stamp names Chromium ${String(st.chromium).slice(0, 40)}, not the measured build` };
    return { needHash: true, file: dl, stamp: st };
  }
  function migrateCloakToPlugin() {
    let held = null; // a pending run's verdict (the hash ran once already)
    { const a = MR.readJson(path.join(archiveDir, `${CLOAK_MIGRATION_ID}.json`), `archive/${CLOAK_MIGRATION_ID}.json`); const p = a && Array.isArray(a.runs) ? a.runs.find((x) => x && x.pending === true) : null; held = p && p.rep && p.rep.download ? p.rep.download : null; }   // MG1: not there = no pending run; unread or torn = not run
    if (held) return cloakMigrateNow({ present: true, proven: !!held.proven, why: String(held.why || '') });
    const f = cloakDownloadFacts();
    if (!f.needHash) return cloakMigrateNow(f);
    const run = sha256Of(f.file).then(
      (got) => cloakMigrateNow(got === f.stamp.sha256 ? { present: true, proven: true, why: 'the install stamp and the file\'s SHA-256 agree' } : { present: true, proven: false, why: 'the file is not the one its install stamp names (its SHA-256 differs)' }),
      (e) => { throw MR.unread(CLOAK_OLD.download, e); });   // MG1: the download could not be read to its end = not run (the step fails; never «unproven» over an unread file)
    browserBootGate = run.then(() => null, () => null);
    return run;
  }
  function cloakMigrateNow(download) {
    const B = require('../browser-profiles.js');
    const ENG = require('../browser-engines.js'); // PURE: the plugin's reserved rows (`plugin.<id>.executablePath` / `.egressAllowlist`)
    const SW = require('../browser-switch.js');   // PURE: a re-judged proposal's digest
    const ID = CLOAK_MIGRATION_ID, P = CLOAK_OLD.provider;
    const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const readJson = (file, what) => {
      let text = null;
      try { text = fs.readFileSync(file, 'utf-8'); } catch (e) { if (e && e.code === 'ENOENT') return { missing: true, doc: null }; throw new Error(`${what} could not be read (${(e && e.code) || 'error'}: ${e && e.message}) — not migrated; retried at the next boot`); }
      let doc;
      try { doc = JSON.parse(text); } catch (e) { throw new Error(`${what} could not be read (unparsable JSON: ${e && e.message}) — not migrated, the file left as it is; retried at the next boot`); }
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`${what} is not ${what === 'data/settings.json' ? 'a settings document' : 'an object'} (${JSON.stringify(doc).slice(0, 40)}) — not migrated; retried at the next boot`);
      return { missing: false, doc, text };
    };
    const writeAtomic = (file, text, mode) => { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); replaceSynced(`${file}.${process.pid}.tmp`, file, text, mode); };
    const modeOf = (file, d) => { try { return fs.statSync(file).mode & 0o777; } catch { return d; } };
    // round 2 (主开发's law B): a crash between two writes, made on purpose by the suites' harness — an env-gated throw right AFTER
    // the named write (never in production: the variable is the suites' own), so every torn shape a real crash leaves is driven
    const faultAfter = (step) => { if (process.env.VIBESPACE_TEST_MIGRATION_FAULT === `${ID}:${step}`) throw new Error(`a planted fault after the ${step} write (VIBESPACE_TEST_MIGRATION_FAULT) — retried at the next boot`); };
    // ── READ, never guess — the archive FIRST: it may hold the only copy of what an earlier run displaced ──
    const regFile = path.join(dataDir, 'browser-profiles.json'), setFile = path.join(dataDir, 'settings.json');
    const seedsFile = path.join(dataDir, 'plugins-state', CLOAK_PLUGIN_ID, 'seeds.json');
    const archFile = path.join(archiveDir, `${ID}.json`);
    const archive = 'data/archive/' + path.basename(archFile);
    const A = readJson(archFile, archive);
    const priorRuns = A.doc && Array.isArray(A.doc.runs) ? A.doc.runs.filter((r) => r && typeof r === 'object') : [];
    // a run that ARCHIVED and then failed before its notice was out: its judgement — made on the files before any of them changed — is
    // the truth this run finishes (a retry never re-judges a settings file the first run already stripped)
    const pending = priorRuns.find((r) => r.pending === true) || null;
    const doneRuns = priorRuns.filter((r) => r !== pending);
    const R = readJson(regFile, 'data/browser-profiles.json');
    const S = readJson(setFile, 'data/settings.json');
    const profiles = R.doc && Array.isArray(R.doc.profiles) ? R.doc.profiles.filter((p) => p && typeof p === 'object') : [];
    const seeded = profiles.filter((p) => p.provider === P && Number.isInteger(p.fingerprintSeed) && p.fingerprintSeed >= 1);
    const pendingSeeds = pending && pending.seedsAdd && typeof pending.seedsAdd === 'object' ? pending.seedsAdd : {};
    let table = null;
    if (seeded.length || Object.keys(pendingSeeds).length) {
      const T = readJson(seedsFile, `data/plugins-state/${CLOAK_PLUGIN_ID}/seeds.json`);   // the plugin's own rule: never over a table it cannot read
      table = Object.assign(Object.create(null), T.doc || {});
    }
    const sdoc = S.doc || {};
    const str = (v) => (typeof v === 'string' ? v : '');
    const exeRow = ENG.binaryRowPath(CLOAK_PLUGIN_ID), sitesRow = ENG.egressRowPath(CLOAK_PLUGIN_ID);
    // ── THE JUDGEMENT (a pure plan over what was read; nothing is written until the archive holds it) ──
    // round 2 (主开发's law A): VibeSpace's earlier download becomes the plugin's program ONLY when the base's own install proof says
    // so — data/browser-tools/cloak-installed.json names the measured Chromium and the measured SHA-256 (the gate the base keeper
    // applied before it ever ran the file) AND the file's SHA-256 is the stamp's. Unstamped (an unpack the update cut — its marker),
    // stamped for another build, or changed since: left out, said as unverified; the row is left for the plugin's own download
    const dl = path.join(dataDir, CLOAK_OLD.download), dlShown = 'data/' + CLOAK_OLD.download.split(path.sep).join('/');
    // `download` = the proof's verdict, judged before this body ran (migrateCloakToPlugin: streamed, never on the boot's tick)
    const judge = () => {
      const rep = { profiles: [], defaults: [], seeds: { added: [], kept: [] }, settings: { program: 'none', sites: 'none', old: {}, kept: {} }, download: { proven: download.proven, why: download.why },
        ended: [], proposals: [], egress: 0, seats: false, hints: { tier: [], dropped: [] }, install: null, licence: false, left: [] };
      const seedsAdd = {};
      if (table) for (const p of seeded) { if (own(table, p.id)) rep.seeds.kept.push(p.id); else { seedsAdd[p.id] = p.fingerprintSeed; rep.seeds.added.push(p.id); } }
      // the two path facts + the site list (addendum §3: the user's value verbatim, else the PROVEN earlier download, else empty)
      const oldExe = str(sdoc[CLOAK_OLD.exeKey]), oldSites = str(sdoc[CLOAK_OLD.sitesKey]);
      const set = {};
      if (str(sdoc[exeRow]).trim()) { if (oldExe.trim() || download.proven) { rep.settings.program = 'kept'; rep.settings.kept[exeRow] = sdoc[exeRow]; } }
      else if (oldExe.trim()) { set[exeRow] = oldExe; rep.settings.program = 'carried'; }
      else if (download.proven) { set[exeRow] = dl; rep.settings.program = 'download'; }
      else if (download.present) rep.settings.program = 'unverified';
      if (oldSites.trim()) { if (str(sdoc[sitesRow]).trim()) { rep.settings.sites = 'kept'; rep.settings.kept[sitesRow] = sdoc[sitesRow]; } else { set[sitesRow] = oldSites; rep.settings.sites = 'carried'; } }
      for (const k of [CLOAK_OLD.exeKey, CLOAK_OLD.sitesKey]) if (own(sdoc, k)) rep.settings.old[k] = sdoc[k];
      return { rep, set, seedsAdd };
    };
    const fresh = judge();
    const plan = pending ? { rep: clone(pending.rep || {}), set: { ...(pending.set || {}) }, seedsAdd: { ...pendingSeeds } } : fresh;
    const rep = plan.rep;
    // a site hint names a provider or a tier, never an engine: a hint for CloakBrowser keeps the site's memory as tier 2 (the tier
    // its row declared — an anti-bot browser) when the plugin has a program row, else it is dropped (archived)
    const programRowAfter = () => str(own(plan.set, exeRow) ? plan.set[exeRow] : sdoc[exeRow]).trim();
    // ── (3) the registry's reshape — run once on a COPY for the judgement (the archive holds it), then for real ──
    const isMarkedEgress = (e) => !!(e && typeof e === 'object' && e.cloak === true);
    const touches = (doc) => {
      const ps = Array.isArray(doc && doc.profiles) ? doc.profiles : [];
      const bs = doc && doc.browsers && typeof doc.browsers === 'object' ? Object.values(doc.browsers) : [];
      return ps.some((p) => p && (p.provider === P || p.defaultBackend === P)) || bs.some((r) => r && isMarkedEgress(r.egress))
        || !!(doc && ((doc.seats && own(doc.seats, P)) || (doc.majors && own(doc.majors, P))))
        || (Array.isArray(doc && doc.siteHints) && doc.siteHints.some((h) => h && h.backend === P))
        || (Array.isArray(doc && doc.blocked) && doc.blocked.some((e) => e && e.proposal && ['open', 'approved', 'failed'].includes(e.proposal.state) && e.proposal.plan && e.proposal.plan.kind !== 'none'));
    };
    const merged = Object.assign(Object.create(null), table || {}, plan.seedsAdd);
    const reshape = (doc, col) => {
      const ps = Array.isArray(doc.profiles) ? doc.profiles : [];
      const moved = new Set();
      for (const p of ps) {
        if (!p || typeof p !== 'object') continue;
        if (p.defaultBackend === P) { p.defaultBackend = null; col.defaults.push(p.id); }
        if (p.provider !== P) continue;
        col.profiles.push({ id: p.id, label: String(p.label || ''), dir: p.dir || null, ...(own(p, 'browser') ? { browser: p.browser } : {}), ...(p.fingerprintSeed != null ? { seed: p.fingerprintSeed } : {}) });
        moved.add(p.id);
        p.provider = 'chromium';
        p.browser = { kind: 'plugin', id: CLOAK_PLUGIN_ID };
        // the seed leaves the record only once it is in the plugin's table (a crash between the two loses nothing)
        if (p.fingerprintSeed != null && (!Number.isInteger(p.fingerprintSeed) || own(merged, p.id))) p.fingerprintSeed = null;
        if (p.dir) col.left.push(String(p.dir));
      }
      for (const r of Object.values(doc.browsers && typeof doc.browsers === 'object' ? doc.browsers : {})) {
        if (!r || typeof r !== 'object') continue;
        const old = isMarkedEgress(r.egress);
        if (old) { delete r.egress; col.egress++; }
        if ((moved.has(r.profileId) || old) && B.isLiveBrowser(r)) { r.endAtBoot = { why: CLOAK_PLUGIN_WORDS.closed, by: ID }; col.ended.push({ id: r.profileId, pid: Number.isInteger(r.pid) ? r.pid : null }); }
      }
      if (doc.seats && own(doc.seats, P)) { delete doc.seats[P]; col.seats = true; }
      if (doc.majors && own(doc.majors, P)) delete doc.majors[P];
      if (Array.isArray(doc.siteHints)) {
        const keepTier = !!programRowAfter();
        doc.siteHints = doc.siteHints.filter((h) => {
          if (!h || h.backend !== P) return true;
          if (keepTier) { h.backend = null; h.tier = 2; col.hints.tier.push(String(h.host || '')); return true; }
          col.hints.dropped.push({ ...h }); return false;
        });
      }
      for (const e of Array.isArray(doc.blocked) ? doc.blocked : []) {
        const pr = e && e.proposal;
        if (!pr || pr.kind === 'site-reset' || !['open', 'approved', 'failed'].includes(pr.state) || !pr.plan || pr.plan.kind === 'none') continue;
        Object.assign(pr, { state: 'unavailable', plan: { kind: 'none', why: 'unavailable' }, install: 'unavailable', installWhy: 'provider_unavailable', progress: null }); // the why a new claim's plan carries (SW.proposalPlan)
        for (const k of ['installError', 'installBytes', 'installFrom']) delete pr[k];
        pr.digest = SW.proposalDigest(pr);
        col.proposals.push({ id: String(e.id || ''), site: String(pr.site || ''), itemId: pr.itemId || null });
      }
    };
    const regCol = () => ({ profiles: [], defaults: [], ended: [], proposals: [], egress: 0, seats: false, hints: { tier: [], dropped: [] }, left: [] });
    const dry = regCol();
    const regTouched = !!(R.doc && touches(R.doc));
    if (regTouched) reshape(clone(R.doc), dry);
    // the judgement's registry facts: a pending run's (judged before its registry changed) united with anything new since
    const byId = (xs, ys, k = 'id') => { const seen = new Set((xs || []).map((x) => x && x[k])); return [...(xs || []), ...(ys || []).filter((y) => y && !seen.has(y[k]))]; };
    rep.profiles = byId(rep.profiles, dry.profiles); rep.ended = byId(rep.ended, dry.ended); rep.proposals = byId(rep.proposals, dry.proposals);
    rep.defaults = [...new Set([...(rep.defaults || []), ...dry.defaults])]; rep.egress = Math.max(Number(rep.egress) || 0, dry.egress); rep.seats = !!(rep.seats || dry.seats);
    rep.hints = { tier: [...new Set([...((rep.hints && rep.hints.tier) || []), ...dry.hints.tier])], dropped: byId((rep.hints && rep.hints.dropped) || [], dry.hints.dropped, 'host') };
    rep.left = [...new Set([...(rep.left || []), ...dry.left])];
    // the install slot's restart (it ran when the keeper was made, before this): a CloakBrowser install it found running
    try { const k = typeof browserKeeper === 'function' ? browserKeeper() : browserKeeper; const ri = k && typeof k.retiredInstall === 'function' ? k.retiredInstall() : null; if (ri && ri.kind === P && ri.result !== 'gone') rep.install = { result: ri.result, pid: ri.pid, step: ri.step }; } catch { /* no keeper */ }
    // a licence key the integration store holds for the CloakBrowser row — PRESENCE only, never its value (it stays where it is)
    { const d = MR.readJson(path.join(dataDir, 'integrations.json'), 'integrations.json'); const r = d && d.integrations && d.integrations[CLOAK_OLD.integration]; rep.licence = !!(rep.licence || (r && r.values && typeof r.values === 'object' && Object.keys(r.values).length)); }   // MG1: not there = no licence; unread or torn = not run
    if (MR.exists(path.join(dataDir, CLOAK_OLD.cacheDir), CLOAK_OLD.cacheDir)) rep.left = [...new Set([...rep.left, 'data/' + CLOAK_OLD.cacheDir.split(path.sep).join('/')])];
    // (an old row stored EMPTY is stripped and archived, but tells nobody anything: a user who never ran CloakBrowser hears nothing)
    const somethingNow = !!(rep.profiles.length || rep.defaults.length || rep.seeds.added.length || rep.settings.program !== 'none' || rep.settings.sites !== 'none' || Object.values(rep.settings.old).some((v) => String(v == null ? '' : v).trim()) || rep.ended.length || rep.proposals.length || rep.install || rep.licence || rep.hints.tier.length || rep.hints.dropped.length);
    const settingsToWrite = Object.keys(rep.settings.old).length || Object.keys(plan.set).some((row) => sdoc[row] !== plan.set[row]);
    const out = { ...rep, earlierRuns: doneRuns.length, resumed: !!pending };
    if (!pending && !somethingNow && !settingsToWrite && !regTouched && !Object.keys(plan.seedsAdd).length) {
      console.log(`[migrate] ${ID}: nothing of CloakBrowser on this instance${doneRuns.length ? ' left (an earlier run moved it and said so)' : ''} — nothing moved, no notice`);
      return { ...out, via: 'none', notice: 'none' };
    }
    // ── (1) THE ARCHIVE, BEFORE ANY OTHER WRITE (the runner's own rule): everything this run will displace — the old values, the plugin's
    // own rows it keeps, the seeds it adds, the profiles and records it changes, the hints it drops — `pending` until its notice is out ──
    const runAt = (pending && pending.at) || new Date().toISOString();
    const thisRun = { at: runAt, pending: true, rep, set: plan.set, seedsAdd: plan.seedsAdd };
    writeAtomic(archFile, JSON.stringify({ id: ID, runs: [...doneRuns, thisRun] }, null, 2), 0o600);
    faultAfter('archive');
    // ── (2) the seeds — merged, never over a profile the plugin seeded already ──
    if (table && Object.keys(plan.seedsAdd).some((id) => !own(table, id))) {
      for (const [id, seed] of Object.entries(plan.seedsAdd)) if (!own(table, id)) table[id] = seed;
      writeAtomic(seedsFile, JSON.stringify(table, null, 2) + '\n', 0o600);
      faultAfter('seeds');
    }
    // ── (3) the settings: the judged rows (a row that holds another value since is the user's, never overwritten), both old keys stripped ──
    {
      const drop = new Set([CLOAK_OLD.exeKey, CLOAK_OLD.sitesKey]);
      const next = Object.fromEntries(Object.entries(sdoc).filter(([k]) => !drop.has(k)));
      for (const [row, v] of Object.entries(plan.set)) if (!str(next[row]).trim() || next[row] === v) next[row] = v;
      if (JSON.stringify(next) !== JSON.stringify(sdoc)) { writeAtomic(setFile, JSON.stringify(next, null, 2), modeOf(setFile, 0o644)); faultAfter('settings'); }
    }
    // ── (4) the registry — THROUGH the live keeper (it holds the file in memory and saves it whole), else the file ──
    let via = (pending && pending.via) || 'none';
    if (regTouched) {
      const k = typeof browserKeeper === 'function' ? browserKeeper() : browserKeeper;
      if (k && typeof k.reshapeStore === 'function') { k.reshapeStore((doc) => reshape(doc, regCol())); via = 'keeper'; }
      else { reshape(R.doc, regCol()); writeAtomic(regFile, JSON.stringify(R.doc, null, 2), modeOf(regFile, 0o600)); via = 'file'; }
      thisRun.via = via; writeAtomic(archFile, JSON.stringify({ id: ID, runs: [...doneRuns, thisRun] }, null, 2), 0o600); // round 3 (law B′): the first run's `via`, kept for a resumed one
      faultAfter('registry');
    }
    thisRun.via = via;
    // ── (5) ONE notice — the words of every run that moved something (this one judged before any file changed) ──
    const runs = [...doneRuns, thisRun].map((r) => ({ via: r.via, ...(r.rep || r) }));
    const all = (f) => runs.flatMap((r) => r[f] || []);
    const last = (pick) => runs.map(pick).filter((x) => x && x !== 'none').pop() || 'none';
    const labels = [...new Set(all('profiles').map((p) => p.label || p.id))];
    const lines = [];
    if (labels.length) lines.push({ key: CLOAK_PLUGIN_WORDS.profiles, params: { n: labels.length, labels: labels.slice(0, 6).join(', ') + (labels.length > 6 ? ', …' : '') } });
    if (all('ended').length) lines.push({ key: CLOAK_PLUGIN_WORDS.ended, params: { n: all('ended').length } });
    const program = last((r) => r.settings && r.settings.program);
    if (program === 'carried') lines.push({ key: CLOAK_PLUGIN_WORDS.carried });
    else if (program === 'download') lines.push({ key: CLOAK_PLUGIN_WORDS.download, params: { path: dlShown } });
    else if (program === 'kept') lines.push({ key: CLOAK_PLUGIN_WORDS.keptProgram, params: { archive } });
    else if (program === 'unverified') lines.push({ key: CLOAK_PLUGIN_WORDS.unverified, params: { path: dlShown } });
    else if (labels.length) lines.push({ key: CLOAK_PLUGIN_WORDS.noProgram });
    const sites = last((r) => r.settings && r.settings.sites);
    if (sites === 'carried') lines.push({ key: CLOAK_PLUGIN_WORDS.sites });
    else if (sites === 'kept') lines.push({ key: CLOAK_PLUGIN_WORDS.keptSites, params: { archive } });
    const hintsTier = [...new Set(runs.flatMap((r) => (r.hints && r.hints.tier) || []))], hintsDropped = runs.flatMap((r) => (r.hints && r.hints.dropped) || []);
    if (hintsTier.length) lines.push({ key: CLOAK_PLUGIN_WORDS.hintsTier, params: { n: hintsTier.length } });
    if (hintsDropped.length) lines.push({ key: CLOAK_PLUGIN_WORDS.hintsDropped, params: { n: hintsDropped.length, archive } });
    const inst = runs.map((r) => r.install).filter(Boolean).pop();
    if (inst) lines.push({ key: inst.result === 'ended' ? CLOAK_PLUGIN_WORDS.installEnded : CLOAK_PLUGIN_WORDS.installLetGo });
    if (all('proposals').length) lines.push({ key: CLOAK_PLUGIN_WORDS.proposals, params: { n: all('proposals').length } });
    if (runs.some((r) => r.licence)) lines.push({ key: CLOAK_PLUGIN_WORDS.licence });
    const fill = (l) => l.key.replace(/\{(\w+)\}/g, (m, k) => (l.params && l.params[k] != null ? String(l.params[k]) : m));
    const told = somethingNow;
    if (told) {
      const live = liveTodos();   // B-44f3: refused by name while For you is held unread
      let store = live, priv = false;
      if (!store || typeof store.add !== 'function') { const { UserTodoManager } = require('../user-todos.js'); store = new UserTodoManager({ dataDir, expirySweepMs: 0 }); priv = true; }
      let filed = false;
      try {
        // a proposal's For-you Approve that can no longer run is closed (its card says unavailable at the next rebuild)
        for (const pr of all('proposals')) { try { const it = pr.itemId && typeof store.get === 'function' ? store.get(pr.itemId) : null; if (it && it.status === 'open') store.setStatus(pr.itemId, 'dismissed', 'system'); } catch { /* gone */ } }
        const head = { key: CLOAK_PLUGIN_WORDS.text };
        const it = store.add('browser', { origin: 'browser', kind: 'notice', urgency: 'normal', by: 'system', sessionName: 'Agent browser', itemKey: ID, text: fill(head), detail: lines.length ? lines.map(fill).join('\n') : null, i18n: { text: head, ...(lines.length ? { detail: lines } : {}), source: { key: i18nKey('Agent browser') } } });
        store.flush?.();
        filed = !!(it && it.id);
      } finally { if (priv) { try { store.stop(); } catch { } } }
      if (!filed) throw new Error('the For-you notice was not filed — retried at the next boot (what moved is in ' + archive + ')');
      faultAfter('notice');
    }
    // ── (6) the run is done: the archive says so (a retry after this point finds nothing pending — and tells nobody twice) ──
    delete thisRun.pending;
    writeAtomic(archFile, JSON.stringify({ id: ID, runs: [...doneRuns, thisRun] }, null, 2), 0o600);
    console.log(`[migrate] ${ID}:`, JSON.stringify({ via, profiles: rep.profiles.length, defaults: rep.defaults.length, seeds: rep.seeds, program: rep.settings.program, sites: rep.settings.sites, download: rep.download, hints: { tier: rep.hints.tier.length, dropped: rep.hints.dropped.length }, ended: rep.ended.length, proposals: rep.proposals.length, install: rep.install, licence: rep.licence, earlierRuns: doneRuns.length, resumed: !!pending }));
    return { ...out, via, notice: told ? 'filed' : 'none' };
  }

  /** 2026-10-settings-rows-retired, the settings half: strip RETIRED_SETTING_KEYS from data/settings.json, the values
   *  returned as the archive (the ledger report). Written the way the settings route writes it (2-space JSON, atomic,
   *  the file's mode kept) and ONLY when something was stripped — a file without them stays byte-identical. */
  function stripRetiredSettingsFile(file) {
    // B-225b R9: through the settings' three answers — HELD (unreadable, or bytes that are not the settings) ⇒ THROWN by name: never
    // rewritten, never recorded (the release recorded «unparseable» as done, for good)
    const doc = require('../store-hold.js').readNow(file, { valid: (v) => !!v && typeof v === 'object' && !Array.isArray(v), what: 'this migration' });
    if (doc === undefined) return { settings: 'absent', stripped: {} };
    const { doc: kept, stripped } = stripRetiredSettings(doc, RETIRED_2026_10); // the keys THIS migration shipped with — a later retirement carries its own
    if (!Object.keys(stripped).length) return { settings: 'untouched', stripped };
    let mode = 0o644; try { mode = fs.statSync(file).mode & 0o777; } catch { }
    const tmp = `${file}.${process.pid}.tmp`;
    replaceSynced(tmp, file, JSON.stringify(kept, null, 2), mode);
    return { settings: 'rewritten', stripped };
  }

  /** 2026-10-settings-rows-retired, the socket half: data/channel-socks/<windowId>.sock were the removed channel's
   *  per-session sockets. Removes the entries that ARE sockets (lstat), then the directory if it is left empty; any
   *  other entry is kept and named. A link at the path is left as it is (never followed). */
  function removeChannelSocks(dir) {
    let st;
    try { st = fs.lstatSync(dir); } catch (e) { if (e && e.code === 'ENOENT') return { dir: 'absent', sockets: 0 }; throw e; }
    if (!st.isDirectory()) return { dir: 'kept', why: st.isSymbolicLink() ? 'symlink' : 'not-a-directory', sockets: 0 };
    let sockets = 0;
    const kept = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isSocket()) { fs.unlinkSync(path.join(dir, e.name)); sockets++; } else kept.push(e.name);
    }
    if (kept.length) return { dir: 'kept', why: 'not-only-sockets', sockets, kept: kept.slice(0, 20) };
    fs.rmdirSync(dir);
    return { dir: 'removed', sockets };
  }

  /** 2026-10-design-kit-removed: delete the extracted vendor kit. lstat first — a link at the root is unlinked, never
   *  followed (rmSync removes links inside as links); the report counts what went (it rides the ledger). */
  function removeDesignKit(dir) {
    let st;
    try { st = fs.lstatSync(dir); } catch (e) { if (e && e.code === 'ENOENT') return { removed: false, why: 'absent' }; throw e; }
    if (!st.isDirectory()) { fs.unlinkSync(dir); return { removed: true, kind: st.isSymbolicLink() ? 'symlink' : 'file', versions: 0, files: 0, bytes: 0 }; }
    let versions = 0, files = 0, bytes = 0;
    const walk = (d, depth) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const fp = path.join(d, e.name);
        if (depth === 0 && e.isDirectory()) versions++;
        if (e.isDirectory() && depth < 4) walk(fp, depth + 1);
        else if (!e.isDirectory()) { files++; try { bytes += fs.lstatSync(fp).size; } catch { } }
      }
    };
    try { walk(dir, 0); } catch { /* the count is a report, never a reason to keep the files */ }
    fs.rmSync(dir, { recursive: true });
    return { removed: true, kind: 'dir', versions, files, bytes };
  }

  /** 2026-09-exit-access-lists (lane-pairing ⑥): archive every record's `allowExit`, then lift each record through
   *  the ONE PURE rule (src/exit-reach.js migrateExitAccess) and strip the boolean. */
  function migrateExitLists() {
    const E = require('../exit-reach.js');
    const file = path.join(dataDir, 'hosts.json');
    if (!MR.exists(file, 'hosts.json')) return { converted: [], defaulted: 0, kept: 0, via: 'none' };   // MG1: «none» only when not there (existsSync answers false for any stat error)
    let disk;
    try { disk = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { throw new Error(`data/hosts.json is unreadable (${e.message}) — exit access not migrated; nothing was touched`); }
    if (!disk || !Array.isArray(disk.hosts)) throw new Error('data/hosts.json has no hosts list — exit access not migrated; nothing was touched');
    const H = typeof hosts === 'function' ? hosts() : hosts;
    const now = Date.now();
    const reshape = (state) => {
      const out = { converted: [], defaulted: 0, kept: 0 };
      const recs = Array.isArray(state && state.hosts) ? state.hosts : [];
      if (!recs.some((h) => h && (h.exit === undefined || 'allowExit' in h))) return out;
      // ARCHIVE FIRST (archive-never-destroy): every record's old boolean, before anything is stripped
      fs.mkdirSync(archiveDir, { recursive: true });
      const arch = path.join(archiveDir, `hosts-allow-exit-${now}.json`);
      const snap = {};
      for (const h of recs) if (h && h.id) snap[h.id] = h.allowExit === true;
      replaceSynced(arch + '.tmp', arch, JSON.stringify(snap, null, 2));
      for (const h of recs) {
        if (!h || typeof h !== 'object') continue;
        const m = E.migrateExitAccess(h, { now });
        if (m.kind === 'kept') out.kept++;
        else { h.exit = m.exit; if (m.kind === 'converted') out.converted.push(h.id); else out.defaulted++; }
        delete h.allowExit;
      }
      out.archive = path.basename(arch);
      return out;
    };
    if (H && typeof H.reshapeStore === 'function') return { ...H.reshapeStore(reshape), via: 'hosts' };
    const rep = reshape(disk);
    if (!rep.archive) return { ...rep, via: 'file' };
    let mode = 0o600; try { mode = fs.statSync(file).mode & 0o777; } catch { }
    const tmp = `${file}.${process.pid}.tmp`;
    replaceSynced(tmp, file, JSON.stringify(disk, null, 2), mode);
    return { ...rep, via: 'file' };
  }

  /** The 2026-09-runaway-parks-void reshape of ONE keeper store: drop the park
   *  map, rewrite the old guard's RSS-sum lastError on every record under
   *  `recordsKey`. Through the live keeper when there is one (its in-memory
   *  store is what it saves next), else the file itself (atomic tmp+rename).
   *  Returns the counts; a missing / unreadable file = nothing to do. */
  function voidRunaway(file, recordsKey, keeperOrGetter) {
    let disk = null;
    disk = MR.readJson(file, path.basename(file));   // MG1: not there = no store; unread or torn = not run (never recorded over a false «none», the keeper never skipped)
    const parksOnDisk = disk && disk.runawayParkedUntil && typeof disk.runawayParkedUntil === 'object' ? Object.keys(disk.runawayParkedUntil).length : 0;
    const shape = (doc) => {
      let rewritten = 0;
      if (!doc || typeof doc !== 'object') return rewritten;
      if ('runawayParkedUntil' in doc) delete doc.runawayParkedUntil;
      const recs = doc[recordsKey] && typeof doc[recordsKey] === 'object' ? Object.values(doc[recordsKey]) : [];
      for (const r of recs) if (r && typeof r.lastError === 'string' && r.lastError.startsWith(OLD_RUNAWAY_PREFIX)) { r.lastError = RUNAWAY_VOID_TEXT; rewritten++; }
      return rewritten;
    };
    if (!disk) return { file: path.basename(file), via: 'none', parks: 0, rewritten: 0 }; // no store (never written / unreadable): nothing to void — and a keeper is never made to CREATE one here
    const k = typeof keeperOrGetter === 'function' ? keeperOrGetter() : keeperOrGetter;
    if (k && typeof k.reshapeStore === 'function') {
      // the keeper's next save would overwrite a file edit: reshape its memory, it commits (atomic) — and the disk
      // is reshaped too when the keeper never loaded that shape (it drops the park map on read)
      const rewritten = k.reshapeStore(shape);
      return { file: path.basename(file), via: 'keeper', parks: parksOnDisk, rewritten: Number(rewritten) || 0 };
    }
    const hadMap = 'runawayParkedUntil' in disk;
    const rewritten = shape(disk);
    if (!hadMap && !rewritten) return { file: path.basename(file), via: 'file', parks: 0, rewritten: 0 };
    let mode = 0o600; try { mode = fs.statSync(file).mode & 0o777; } catch { }
    const tmp = `${file}.${process.pid}.tmp`;
    replaceSynced(tmp, file, JSON.stringify(disk, null, 2), mode);
    return { file: path.basename(file), via: 'file', parks: parksOnDisk, rewritten };
  }

  /** The 2026-09-desktop-apps-host-key reshape: every record without `hostId` gains 'local'. Through the live keeper
   *  when there is one (voidRunaway's reason), else the file (atomic, its mode kept). Returns the counts. */
  function stampDesktopHostKey(file, keeperOrGetter) {
    let disk = null;
    disk = MR.readJson(file, path.basename(file));   // MG1: not there = no store; unread or torn = not run (never recorded over a false «none», the keeper never skipped)
    const shape = (doc) => {
      let stamped = 0;
      const recs = doc && doc.apps && typeof doc.apps === 'object' ? Object.values(doc.apps) : [];
      for (const r of recs) if (r && typeof r === 'object' && !(typeof r.hostId === 'string' && r.hostId)) { r.hostId = 'local'; stamped++; }
      return stamped;
    };
    if (!disk) return { file: path.basename(file), via: 'none', records: 0, stamped: 0 }; // no store: nothing to stamp — and a keeper is never made to CREATE one here
    const records = disk.apps && typeof disk.apps === 'object' ? Object.keys(disk.apps).length : 0;
    const k = typeof keeperOrGetter === 'function' ? keeperOrGetter() : keeperOrGetter;
    if (k && typeof k.reshapeStore === 'function') return { file: path.basename(file), via: 'keeper', records, stamped: Number(k.reshapeStore(shape)) || 0 };
    const stamped = shape(disk);
    if (!stamped) return { file: path.basename(file), via: 'file', records, stamped: 0 };
    let mode = 0o600; try { mode = fs.statSync(file).mode & 0o777; } catch { }
    const tmp = `${file}.${process.pid}.tmp`;
    replaceSynced(tmp, file, JSON.stringify(disk, null, 2), mode);
    return { file: path.basename(file), via: 'file', records, stamped };
  }

  // MG1 (r2929): every run with the shared helpers' reads strict (src/migration-reads.js `during` — its synchronous part)
  const strictRun = (m) => ({ ...m, run: () => MR.during(() => m.run(), dataDir) });   // r3246 (1): its notices name files under data/ by their place there
  function runLocalMigrations({ only = null } = {}) {   // `only` = ids (a suite's one boot of one migration)
    // lane hub-loop-stalls commit 2: the live ledger's cursors are written by the store writer — an owed write is settled
    // before any migration reads or rewrites _cursors.json (never an older state landing after a migration's own)
    try { const uh0 = typeof usageHistory === 'function' ? usageHistory() : usageHistory; if (uh0 && typeof uh0.settleCursors === 'function') uh0.settleCursors(); } catch { }
    // lane lg-store-writes (B-0248 U5): what THESE migrations hand the store writer lands before the ledger is stamped — every
    // store a migration DIRTIED while they ran: its change count moved since the start (the U4/U5 cure — by version, never by
    // «owed before»: a store with an unrelated save queued before the run that a migration then reshaped is landed too); a
    // store owed before and not touched since is not theirs (never waited on here); a flush deferred by an exit counts as not landed
    let SWm = null, before = new Map();
    try { SWm = require('../store-writer.js').storeWriter(); before = new Map(SWm.stats().map((s) => [s.file, s.version])); } catch { SWm = null; }
    const landStores = () => {
      if (!SWm) return [];
      const owed = storesToLand(before, SWm.stats());
      if (!owed.length) return [];
      const r = SWm.flushSync(owed);
      return r.deferred ? owed.map((f) => ({ file: f, name: path.basename(f), why: 'the hub is exiting' })) : (r.left || []);
    };
    // `todos` (r3, review F2b): a failed row is ONE For-you item keyed by its id, resolved by the run that succeeds (the runner's)
    const results = runMigrations({ ledgerPath: path.join(dataDir, 'migrations.json'), migrations: (Array.isArray(only) ? MIGRATIONS.filter((m) => only.includes(m.id)) : MIGRATIONS).map(strictRun), todos: userTodos, landStores, onLate: (r) => {
      // a stepped migration that ended after the boot's pass (lane ledger-dedup-law): its failure is said like a sync one's —
      // through the SAME door (B-44f3, the first read's should: a For-you refusal there waits for the read too, never «next restart»).
      // A toast reaches every client's screen: its error is the runner's failedLine — belted whole, then cut (r4, review N3)
      if (r.status === 'failed') sayFailures([r]);
    } });
    for (const r of results) if (r.id === '2026-10-grants-unify' && r.status === 'already') Object.assign(r, grantsStoreBoot());   // verify F2: the ledger stamped, the store deleted
    sayFailures(results);   // B-44f3: a row For you refused while held waits for its read; any other failure is said as before
    return results;
  }
  /** B-44f3: the rows For you refused while it is held unread run again at its read (whenRead — an async step after the boot, for
   *  those rows only: the ledger backfill touches no For-you item, so its synchronous load never runs here) — said as WAITING, never
   *  as «failed»; every other failed row is said as before («will retry on next restart»). */
  function sayFailures(results) {
    // r2999: the ledger is there and could not be read — every migration answers failed by that ONE cause: said once, never one
    // notice an id (nothing ran, nothing was rewritten; the next start reads the ledger again)
    if (results && results.ledgerUnread) { try { serverNotice?.('migrations-ledger-unread', `Data migrations did not run at this start: ${results.ledgerUnread}.`, { level: 'warn' }); } catch { } return; }
    // waiting only when the LIVE store can say when it reads (a private store a suite wires says nothing — said as failed, as before)
    const ut = typeof userTodos === 'function' ? userTodos() : userTodos, canWait = !!(ut && typeof ut.whenRead === 'function');
    const waiting = canWait ? results.filter((r) => r.status === 'failed' && r.code === 'todos-unread').map((r) => r.id) : [];
    if (waiting.length) {
      console.warn(`[migrate] ${waiting.join(', ')}: For you cannot read its saved list — ${waiting.length === 1 ? 'it runs' : 'they run'} once it reads`);
      try { ut?.whenRead?.(() => { runLocalMigrations({ only: waiting }); }, 'the data migrations that waited for For you'); } catch { }
    }
    for (const r of results) {
      if (r.status === 'failed' && !waiting.includes(r.id)) {
        try { serverNotice?.('migration-failed:' + r.id, `Data migration ${r.id} failed (${failedLine(r.error)}) — will retry on next restart.`, { level: 'warn' }); } catch { }
      }
    }
  }

  return { runLocalMigrations, MIGRATIONS, grantsStoreBoot };
}

// ── ONE ROW PER VENDOR (lane usage-predict, 2026-11-16) ───────────────────────────────────────────────────────────────
// Before it, Claude's row (accounts.onDemandQuotaRefresh) also governed Antigravity's two automatic usage reads, and its Off
// stopped them. They have their own row now (antigravity.autoUsageReads, default on). An instance whose shared row was Off gets
// the new row Off — only where it holds no value of its own; anything else is left as it is. It goes THROUGH the live settings
// store (`settings`: { read, patch } — src/routes/persistence.js readSettings / patchSettings, the one writer of
// data/settings.json); without one it FAILS by name and runs at the next boot. → { changed, why }.
const AGY_READS_MIGRATION_ID = '2026-11-agy-reads-follow-claude-off';
function agyReadsFollowClaudeOff(store) {
  if (!store || typeof store.read !== 'function' || typeof store.patch !== 'function') throw new Error('no live settings store was handed in — it runs at the next boot');
  const doc = store.read() || {};
  if (doc[Symbol.for('vibespace.settings-held')]) throw new Error('the settings (data/settings.json) could not be read — nothing was written; it runs at the next boot');   // B-225b R9: never judged on the defaults
  if (doc['accounts.onDemandQuotaRefresh'] !== 'off') return { changed: false, why: `Claude's row is ${JSON.stringify(doc['accounts.onDemandQuotaRefresh'] || 'manual')} — Antigravity's automatic reads stay on (their default)` };
  if (doc['antigravity.autoUsageReads'] !== undefined) return { changed: false, why: `antigravity.autoUsageReads already holds ${JSON.stringify(doc['antigravity.autoUsageReads'])} — left as it is` };
  store.patch({ 'antigravity.autoUsageReads': 'off' });
  return { changed: true, why: "Claude's row was Off — Antigravity's automatic usage reads are Off too (antigravity.autoUsageReads = off)" };
}

/** THE STORES THE BOOT'S MIGRATIONS LAND BEFORE THEIR STAMP (lane lg-store-writes, the U4/U5 cure) — PURE: owed now (dirty or
 *  in flight) AND their change count moved since `before` (file → the store's version when the migrations started; a store
 *  new since then counts as moved). A store owed before the run and untouched since is not the migrations' (never waited on);
 *  one owed before AND reshaped by a migration is. → files */
function storesToLand(before, stats) { return (stats || []).filter((s) => (s.dirty || s.inflight) && s.file && s.version !== before.get(s.file)).map((s) => s.file); }

module.exports = { AGY_READS_MIGRATION_ID, agyReadsFollowClaudeOff, create, storesToLand, beforeBrowserBoot, OLD_RUNAWAY_PREFIX, RUNAWAY_VOID_TEXT, JOB_SECRETS_FILE, JOB_SECRETS_RETIRED, JOB_SECRETS_ITEM, JOB_SECRETS_WORDS, CLOAK_PLUGIN_ID, CLOAK_MIGRATION_ID, CLOAK_PLUGIN_WORDS, JOB_SECRETS_ACTION };
