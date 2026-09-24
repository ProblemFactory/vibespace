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
const { runMigrations } = require('../migration-runner.js');

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
function create({ rootDir, serverNotice, homeDir = os.homedir(), channels = null, userTodos = null }) {
  const dataDir = path.join(rootDir, 'data');
  const archiveDir = path.join(dataDir, 'archive');

  const MIGRATIONS = [
    {
      id: '2026-08-collapse-kinds-agent-default',
      note: "chat.collapseKinds saved before the 'agent' kind existed (2.368.19) cannot distinguish 'user unchecked it' from 'the option predates the save' — codex collab cards (Agent Wait, send_message…) broke every fold on instances with ANY saved selection (owner report). Add the default-on kind once; unticking it afterwards sticks.",
      run() {
        const f = path.join(dataDir, 'settings.json');
        let doc; try { doc = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return; }
        const v = doc['chat.collapseKinds'];
        if (!Array.isArray(v) || v.includes('agent')) return;
        v.push('agent');
        fs.writeFileSync(f + '.tmp', JSON.stringify(doc, null, 2));
        fs.renameSync(f + '.tmp', f);
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
        try { names = fs.readdirSync(subsDir); } catch { return; }
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
          } catch { }
          return out;
        })();
        for (const d of names) {
          if (!/^sub-[\w-]+$/.test(d)) continue;                  // pools are symlinks, con-* are login scratch
          try { if (fs.lstatSync(path.join(subsDir, d)).isSymbolicLink()) continue; } catch { continue; }
          members.push({ id: d, backend: 'claude', credsPath: path.join(subsDir, d, '.credentials.json'), oatMintedAt: oatMinted[d] || null });
        }
        const transitions = new SlotTransitions({ dataDir });
        let journalText = null;
        const jf = findJournal(dataDir);
        if (jf) { try { journalText = fs.readFileSync(jf, 'utf-8'); } catch { } }
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
        } catch { }
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
        try { accounts = (JSON.parse(fs.readFileSync(path.join(dataDir, 'accounts.json'), 'utf-8'))?.accounts || []).filter((a) => a && a.id); } catch { }
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
        try { cfg = JSON.parse(fs.readFileSync(path.join(homeDir, B.USER_CONFIG_REL), 'utf-8')) || {}; } catch { cfg = {}; }
        let dir = B.configNamesProfile(cfg) ? String(cfg.profile) : path.join(homeDir, '.agent-browser', 'default-profile');
        if (dir.startsWith('~/')) dir = path.join(homeDir, dir.slice(2));
        if (!path.isAbsolute(dir)) dir = path.join(homeDir, '.agent-browser', dir);
        let isDir = false; try { isDir = fs.statSync(dir).isDirectory(); } catch { isDir = false; }
        if (!isDir) { console.log(`[migrate] legacy browser profile: nothing to adopt (${dir} is not a directory)`); return; }
        // A keeper built HERE only touches the registry file (no broadcast, no
        // timer, not installed as the process's keeper — that one is wired
        // later with real deps and reads what this wrote).
        const k = K.create({ dataDir, homeDir, install: false, log: { log() { }, warn() { } } });
        const r = k.adoptDirectory({ label: 'Shared (legacy)', dir, legacy: true, owner: { kind: 'instance', id: null } });
        console.log('[migrate] legacy browser profile:', JSON.stringify({ dir, created: r.created, id: r.profile ? r.profile.id : null, why: r.why || null }));
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
          let doc; try { doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'adapters.json'), 'utf-8')); } catch { return; }
          const { REAL_ADAPTERS } = require('./channels-engine.js');
          const real = new Set(REAL_ADAPTERS.map((m) => m.kind));
          const pending = (doc && Array.isArray(doc.adapters) ? doc.adapters : []).filter((r) => r && real.has(r.kind) && !(typeof r.credentialKey === 'string' && r.credentialKey));
          if (pending.length) throw new Error(`no channels engine to stamp ${pending.length} adapter record(s) (${pending.map((r) => r.id).join(', ')}) — retried on a boot that has one`);
          return;
        }
        const rep = eng.stampCredentialKeys();
        // The shared runner is synchronous (the daemon bundles it), so the stamp's
        // store write is not awaited here: the live records carry the key at once and
        // the engine logs a failed write; the next adapters.json write persists it
        // (verifier r1 low, accepted with this reason).
        // Say what happened even when it is nothing — a repair nobody can see
        // ran is a repair nobody can verify ran. Each stamped row names its
        // EVIDENCE (`token` = the client the token itself recorded; `row-pick`
        // = the integration's pick) and the key the token named.
        console.log('[migrate] channel-credential-key:', JSON.stringify({ stamped: rep.stamped, skipped: rep.skipped }));
        // Deliberately NO serverNotice: no token moved and nothing was
        // archived — each account gained the name of the client it already
        // used. The Communication panel shows it on the row.
      },
    },
    {
      id: '2026-09-spend-notices-expire',
      note: "SPEND NOTICES LIVED FOREVER AS ACTIONS (owner's instance, measured 2026-09-22: 33 open 'For you' items, 15 from Spending, 13 of them filed before the notice lane existed (2.369.118) — no kind, so in the ACTION list colouring the badge — and 137–288 h old: '… has used 10 of its 12 unattended turns this hour (83%)', '… 48 of 60 today (80%)', 'VibeSpace refused the Stop bookkeeping mini-turn …', warnings about hour/day windows that closed weeks ago). The producer now stamps expiresAt and the store expires it; this moves what the store already holds into the lane: every Spending item (sessionName 'Spending' in the 'accounts' row — the name spend-guard's one fileInbox freezes on every item it files, and nothing else writes) becomes kind 'notice'; an OPEN one gets the end of the window it was about (its detail's `Scope: hour` = filing + 1 h, a refusal = + 6 h, anything else + 24 h — the longest window any spend notice talks about): past ⇒ resolved 'expired' with resolvedAt = that end (when it SHOULD have died, so it sorts as old history — kept in the ledger, never deleted), still ahead ⇒ stamped as its expiresAt so it cannot live forever either. Written through the live store and flushed before the ledger row; counts in the ledger's report row.",
      run() {
        const { noticeExpiry } = require('./spend-guard.js');
        const isSpend = (it) => !!it && it.sessionName === 'Spending' && it.sessionKey === 'accounts';
        const live = typeof userTodos === 'function' ? userTodos() : userTodos;
        let store = live, priv = false;
        if (!store || typeof store.reshapeItems !== 'function') {
          if (!fs.existsSync(path.join(dataDir, 'user-todos.json'))) return { matched: 0, rekinded: 0, expired: 0, stamped: 0, store: 'absent' };
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
        const rep = backfillLedgerBySlot({ dataDir, id: '2026-09-backfill-ledger-by-slot' });
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
      },
    },
    {
      id: '2026-08-archive-dormant-task-plans',
      note: 'dormant checklist plan arrays (feature removed 2.121.0) → data/archive/',
      run() {
        const f = path.join(dataDir, 'task-groups.json');
        let doc; try { doc = JSON.parse(fs.readFileSync(f, 'utf-8')); } catch { return; } // no store yet = nothing to do
        const tasks = doc.tasks || {};
        const archived = {};
        for (const [id, t] of Object.entries(tasks)) {
          if (t && Array.isArray(t.plan) && t.plan.length) { archived[id] = t.plan; delete t.plan; }
          else if (t && 'plan' in t) delete t.plan;
        }
        if (!Object.keys(archived).length) return;
        fs.mkdirSync(archiveDir, { recursive: true });
        const out = path.join(archiveDir, 'task-plans-legacy.json');
        let prev = {}; try { prev = JSON.parse(fs.readFileSync(out, 'utf-8')); } catch { }
        fs.writeFileSync(out + '.tmp', JSON.stringify({ ...prev, ...archived }, null, 2));
        fs.renameSync(out + '.tmp', out);
        fs.writeFileSync(f + '.tmp', JSON.stringify(doc, null, 2));
        fs.renameSync(f + '.tmp', f);
      },
    },
  ];

  function runLocalMigrations() {
    const results = runMigrations({ ledgerPath: path.join(dataDir, 'migrations.json'), migrations: MIGRATIONS });
    for (const r of results) {
      if (r.status === 'failed') {
        try { serverNotice?.('migration-failed:' + r.id, `Data migration ${r.id} failed (${r.error}) — will retry on next restart.`, { level: 'warn' }); } catch { }
      }
    }
    return results;
  }

  return { runLocalMigrations, MIGRATIONS };
}

module.exports = { create };
