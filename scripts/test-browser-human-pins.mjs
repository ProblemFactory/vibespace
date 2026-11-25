#!/usr/bin/env node
// THE PERSON'S OWN BROWSING — SOURCE PINS AND CENSUSES (fast — source text, plus the few PURE in-process legs that sat inside the moved blocks; no browser, server or hub — lane text-legs, B-94d3 — its own row: «test-browser-human holds the
// HOLDER census over the browser keeper's lease sites, met only by the .402 prep mirror (chrome-157 added one site)»). MOVED
// VERBATIM from the heavy scripts/test-browser-human.mjs (the real keeper over the fake 0.38.1, the routes, the bridge and every
// mutant-keeper CONTROL stay there): the HOLDER census and the TAB-RELEASE census over src/server/browser-keeper.js (with the
// census's own controls), the restart routes' pin (src/routes/browser.js), «the agent can never reach the person's browsing» (src/routes/
// browser.js, data/bin/vibespace-*), the card census's pins (src/server/mounts-plugins-wiring.js, src/server/browser-handback.js),
// the trace routes' and the replay window's pins, the live window's wiring pins (src/lib/browser-live-window.js), and ④ the words
// (src/browser-human.js's keys in src/lib/i18n-zh.js and src/lib/i18n-ja.js). Each reads the file it pins BY NAME, so ci.mjs's
// affected rule selects this suite on any change of one of them.
// Run: node scripts/test-browser-human-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { anchored } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const HM = require('../src/browser-human.js');
let pass = 0, fail = 0;

const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);

// ── ① the WIRING pin of the person's window share chip (moved from ①'s share block) ──
console.log('— ① the WIRING pin of the person’s window share chip');
{
  // the WIRING: the window builds ONE keyed chip (never a toast) under the address row and patches its text / visibility
  // from the PURE line on every render of their ends (the digest's broadcast included)
  const wsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/shareLine\.dataset\.key = 'share'/.test(wsrc) && /root\.append\(strip, tabRow, watchLine, bar, addrRow, shareLine, endLine,/.test(wsrc) && /const words = H\.ended \|\| st\.stopped \? null : humanShareLine\(profileRowOf\(\), t\);/.test(wsrc) && /endLine\.style\.display = line \? '' : 'none';\n    renderShare\(\);/.test(wsrc) && !/showToast\([^)]*humanShareLine/.test(wsrc) && /if \(H\) \{ renderEnds\(\); renderTitle\(\); \}/.test(wsrc),
    'PIN: their window carries ONE keyed chip under the address row, patched in place from humanShareLine at every render of their ends (never a toast) — the digest\'s broadcast re-renders them (verify r3: that call reverted stayed green on the fast tier; the heavy leg (a) flips the SAME node)');
}

// ── ③ the card census's two PINs (moved from ③'s first block — its runtime CONTROL stays in the heavy suite) ──
console.log('— ③ the card census’s two PINs');
{
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/const onSession = \(m\) => \{ for \(const \[, s\] of activeSessions\) \{ if \(s && s\._browserKey === m\.browserKey\)/.test(wiring), 'PIN: the wiring\'s onSession matches a marker to a conversation by its OWN browser key (the rule the census above models)');
  const hb = fs.readFileSync(path.join(REPO, 'src/server/browser-handback.js'), 'utf8');
  ok(/if \(ev && ev\.human\) return;/.test(hb), 'PIN: the announcer ignores their window\'s own events (no card, notice, stale sweep, inbox, delivery)');
}

// ── ③ THE HOLDER CENSUS (moved whole) ──
console.log('— ③ THE HOLDER CENSUS');
{
  // THE HOLDER CENSUS: every `reg.leases` site of the keeper, by the function it sits in — a reader that asks whether a
  // browser is USED goes through holdersOn; one that needs a CONVERSATION reads the leases. A new site is RED until classified.
  const src = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const lines = src.split('\n');
  // lane chrome-157 (the .402 prep mirror): a callback handed to a hook (`x.onTold((t) => {` — it has no name of its own) is named
  // by its HOOK, never credited to the named function above it; `hook: false` is the census without that rule (the CONTROL below)
  const FN = /^  (?:async )?function (\w+)\(|^  const (\w+) = (?:\(|async|\w+ =>|\{)/, HOOK = /^  (?:if \(.*\) )?\w+\.(on[A-Z]\w*)\((?:async )?\([^)]*\) => \{\s*$/;
  const fnAtBy = (hook) => (i) => { for (let x = i; x >= 0; x--) { const m = FN.exec(lines[x]); if (m) return m[1] || m[2]; const h = hook && HOOK.exec(lines[x]); if (h) return h[1]; } return '(top)'; };
  const siteCount = (fnAt) => { const out = {}; lines.forEach((l, i) => { if (/^\s*(\*|\/\/|\/\*)/.test(l)) return; const n = (l.replace(/\/\/.*$/, '').match(/reg\.leases/g) || []).length; if (n) { const f = fnAt(i); out[f] = (out[f] || 0) + n; } }); return out; };
  const sites = siteCount(fnAtBy(true)), sites0 = siteCount(fnAtBy(false));
  // conversation-only: admission, caps, pins, the takeover's siblings, the re-judge, the ephemeral records, the timers, the
  // log lines that count conversations — each needs a CONVERSATION (their row has no session, no key an agent could hold)
  // B-7a30 unit 2' (bl-browser-a): the ephemeral row's lease read moved out of ephemerals()' anonymous mapper into ephRow, so
  // ephemeralFor(bk) builds only its own row — the same site, the same class: it reads the CONVERSATION lease of an ephemeral
  // profile (its sessionId, leased), and the person's own row never holds one (an ephemeral profile is not_attachable)
  const CONVERSATION = { ephEventFields: 1, ephRow: 1, leasesFor: 1, leasesOn: 1, removeVerdict: 1, updateProfileNow: 1, knownKeysOf: 1, rejudgeLeases: 1, ceilingNow: 1, ownsLive: 1, ownLive: 1, ensureEphemeral: 2, retireEphemeral: 2,
    // lane keeper-sweep-yields (2.369.407): retireEphemeral's second site reads «is this record's CONVERSATION carried again» once
    // more after the reap's await, before any stop (a conversation resumed meanwhile keeps its browser); retireInSteps asks the same
    // of each orphan before its step — an ephemeral record's lease is its conversation's, and the person's own row never holds one
    // (browseYourselfVerdict: an ephemeral profile is not_attachable), so both are conversation questions, never «is it used»
    retireInSteps: 1,
    keepRebound: 1, takeRebound: 1, // verify r3 (F4): the rebound note rides the CONVERSATION's lease until an answer carries it (their row binds no tab of ours)
    attach: 7 /* lane browser-resume C: + the rebind's new tab as its lease's root; verify r2 F2: the queued rebind re-asks for ITS OWN lease after the wait (conversation-only) */, detach: 3, stop: 1, releaseAll: 1, browse: 1, endHuman: 1, quitHuman: 1, navigateHuman: 1, mirrorLeaseInput: 1, takeover: 1, siblingLeases: 1, noteLeaseUrl: 1, inputSummaryFor: 1, handBackOnStop: 1, statusFor: 3 /* + lane jobs-browser: a job's window is its conversation's helper row (the 2.369.202 integration) */, liveHoldingFor: 1, setFor: 1, driveHolderFacts: 1, noteDrive: 1, dropChild: 3, switcherView: 1, switchBackend: 1, reconcile: 3, boot: 1, tick: 1, ensureTimer: 1, api: 1,
    requestLeaseHeld: 1, // lane browser-takeover-queue: does the conversation that asked still hold that browser (its own lease — their row is no request's)
    releaseJobHandle: 1, // lane jobs-browser (the 2.369.202 integration): a job's handle lets go of the leases IT holds — a job is a conversation's child, never their row
    rejudgeAll: 1, // the .197 integration: identity r4's Task Group re-judge asks "does a CONVERSATION lease this profile" (their row belongs to no Task Group)
    // lane browser-propose: a proposal's plan counts the OTHER conversations on the profile it would switch; the approved
    // new profile's page opens in THIS conversation's own lease (their row is no conversation's)
    proposalTargetFor: 1, openInLease: 1,
    // lane browser-admin 2a: Change build… tells every CONVERSATION leased on the browser it restarts (their own browsing is
    // refused `browsing_yourself` before it — never restarted under their page) and its view counts them; verify r1 F1: the
    // second site of each is the DRIVEN check (SW.holdOf over the conversations' leases + their input states, humans excluded
    // — their own browsing is refused by name a line earlier): a conversation driving it by hand ⇒ `browser_driven`, never a
    // restart under the user's hands
    buildsView: 2, setBrowserChoice: 2,
    restartProfile: 1, // int220 (lane browser-unresponsive): a hung browser's Restart tells every OTHER CONVERSATION leased on it (their own row holds no lease)
    // verify r2 (B5): the fall-back from a build that closed within seconds tells every CONVERSATION it told "changed" (their own
    // browsing was refused before the change; a takeover meanwhile is refused browser_restarting by the H2 rule)
    fallBackFromChange: 1,
    // lane browser-resume B: a Resume of an attachment needs THIS conversation's lease (never widened; decideAttach judges);
    // the hand-back names a browser THIS conversation holds (their `hu-` row is never a conversation's to hand back)
    resumeAttachment: 1, continueState: 1,
    // lane browser-resume C: whose tab it is — the conversations' tab ROOTS are their leases' (their own tab is added from
    // `humans`, never a lease); the agent's own tab verbs need ITS lease; the user's row judges a CONVERSATION's tab; the
    // orphan rule (adoptable) asks whether any conversation leases the browser; the rebind's new tab is its lease's root
    // lane mirror-green-229 (the 2.369.231 integration): rootsAt = the roots a CONVERSATION lease held when a tab read began
    // (keepTabRoots prunes only those; a root stamped during the read survives it) — tab roots are leases', their row holds none
    noteTabBorn: 2, // B-e674 unit 2's cure (r683): a takeover's birth is rooted to the CONVERSATION taken over (its lease) — r694 (1): its lease's own window read first, the lease read again after that answer
    currentTabOf: 1, // B-21cc (r2491): the vault fill's CURRENT tab is read under THIS conversation's own lease (its session's own `tab list`); their row holds no lease
    personDriving: 1, // B-e674 unit 2: the birth stamp asks whether the person drives a CONVERSATION's view (its lease's input); their own row holds no lease
    tabHoldersOf: 1, keepTabRoots: 1, rootsAt: 1, bootstrapTabRoot: 1, agentTabAct: 4, tabOwnersFor: 1, userTabAct: 1, whoseOf: 1, // accept-fixes-strip F8: another holder's tab is named by ITS lease's conversation (a conversation reader)
    // lane site-reset verify r3 #2: the PERSISTED WITNESS lives on a CONVERSATION's lease (`l.tabs` — the tabs the dialog watch
    // saw born of its verbs); their row holds no lease — their tabs are their row's own (`ownTab` / `adopted`)
    noteOwnTab: 1, forgetOwnTab: 1, dropLeaseTabs: 2 /* + lane browser-ui-prompts-r2: a fresh Chrome forgot each lease's permission decisions */, pruneOwnTabs: 1, // r4 #3: pruned to the browser's tabs at a watch's connect
    notePermission: 1, // lane browser-ui-prompts-r2 (the 2.369.237 integration): `vibespace-browser permission` writes a CONVERSATION's per-origin decision on its own lease (their row holds no lease; their browsing asks Chrome itself)
    tabsLost: 1, // lane profile-lock-roll L2: every CONVERSATION lease of a replaced browser is marked `life` (their row holds no lease — their tab ends with the browser, said by their window)
    holderTabs: 1, // lane site-reset verify r1: a CONVERSATION lease's pinned tab (+ r3's persisted witness); their tabs are read off their row, by their key, before this loop
    // lane browser-windows: a CONVERSATION lease's own window (its `windowIn` / roots at attach — their tab opens in their own window
    // through openOwnTab, never a lease), the WINDOW MATES a takeover of a conversation's window takes with it (conversation
    // leases only: their row is never a mate — their window is their own), and agentTabAct's 4th site (the lease that records the
    // new tab's window + its label)
    ownWindowAtAttach: 2, windowMatesOf: 1, ownMarkOf: 1, takeBackOwnTab: 3, // row B-0e4a: the lease's own mark and its take-back (a conversation's lease only; r4282: its new mark after «many» / «unknown»)
    // verify r1 T2 ⑧ (one window per holder): openOwnTab reads the CONVERSATION lease's `windowId` + roots to open a later tab IN
    // its window (their key names no lease ⇒ their first tab is a new window of their own, their popups stay in it by Chrome's rule)
    openOwnTab: 1,
    // verify r2 ⑦: sharedWindowOf reads the CONVERSATION lease's windowIn (is its tab in the shared window of an older run?) for
    // the takeover / handback / paused words — their key names no lease, so their own takeover is never worded as "shared" through it
    sharedWindowOf: 1,
    // lane browser-profile-clone (the 2.369.239 integration): "Copy logins from" refuses a source a CONVERSATION leases (source_leased
    // names it — a browser is never taken from an agent); their row is the user asking for the copy (its Stop is the panel's, their own act)
    cloneHolders: 1,
    // lane browser-tabs-by-window (the 2.369.240 integration): the tab groups' holder windows — a CONVERSATION lease's stamped
    // `windowId` while it is of this browser run (`windowIn`); their window is read off their own tab (`h.ownTab`) before this loop
    holderWindowsOf: 1,
    // int349 (lane browser-x-in-window, B2): the X picture's CDP window — a CONVERSATION lease's own window found by its browser
    // key (`l.windowId`); their key names no lease, so their window is read off their own tab (holderTabs) after it
    holderWindowOf: 1,
    // B-1626 / K23 (its cure 2): the window a viewer's CONVERSATION owns — its lease's stamped windowId (a person's own key names no
    // lease: that viewer's thaw reads the person's tabs off the person's row, through the watch's scope)
    viewerWindowOf: 1,
    // lane browser-shared-profile-freeze: the scope road's url is minted only for a CONVERSATION lease that stands (an agent's
    // key — the user's own Browse-yourself key keeps the raw url, leaseRoadVerdict's `human` row)
    leaseUrlFor: 1,
    // lane chrome-157 (THE WINDOW; the .402 prep mirror): the callback handed to the mediator's onTold hook finds the lease whose
    // download folder it was — by the profile and that CONVERSATION's own browser key — to name the conversation its notice goes to;
    // a told event comes only from a grant, and a grant is minted only for a conversation lease (the person's own key keeps the raw url)
    onTold: 1,
    // B-9584 (B, 主开发 r1791): a tab the place's hold CLOSED (sites on the list, its place not given) marks the CONVERSATION lease
    // that bound it (its next command says why by name); the person's own row binds no tab of ours
    onGeoEvent: 1,
  };
  // holder: "who holds this browser / is it used" — through holdersOn (the conversations' leases + their row)
  const HOLDER = { list: 1, holdersOn: 1 };
  const want = { ...CONVERSATION, ...HOLDER };
  const unclassified = Object.keys(sites).filter((f) => !(f in want)).map((f) => `${f}: ${sites[f]}`);
  const moved = Object.keys(sites).filter((f) => f in want && want[f] !== sites[f]).map((f) => `${f}: ${sites[f]} (table ${want[f]})`);
  ok(!unclassified.length && !moved.length, `the HOLDER census: every \`reg.leases\` site of browser-keeper.js (${Object.values(sites).reduce((a, b) => a + b, 0)} in ${Object.keys(sites).length} functions) is classified conversation-only or holder — a new or moved site is RED until the table says which it is`, { unclassified, moved });
  // CONTROL (lane chrome-157): the census WITHOUT the hook rule credits the onTold callback's site to the named function above it,
  // which the table does not list — RED, as the .402 prep mirror met it; the hook rule is what classifies it
  { const un0 = Object.keys(sites0).filter((f) => !(f in want)), mv0 = Object.keys(sites0).filter((f) => f in want && want[f] !== sites0[f]), sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    ok(sites.onTold === 1 && !('onTold' in sites0) && sum(sites0) === sum(sites) && (un0.length + mv0.length) > 0, 'CONTROL: without the hook rule the onTold callback\'s site lands on the function above it and the census is RED (the same sites, one credited wrongly)', { un0, mv0 }); }
  ok(/const leasedNow = \(profileId\) => holdersOn\(profileId\)\.length > 0;/.test(src) && /B\.browserIdle\(rec, holdersOn\(rec\.profileId\), t, idleMs\(\)\)/.test(src) && /humans: humanRowsOn\(p\.id\)/.test(src), 'the holder readers go through holdersOn: the idle clock, the heal, the switch\'s hold');
  // lane browser-windows verify r5 ⑥: "does the USER drive any window of this browser" is a HOLDER question (the conversations'
  // leases + their row) — r4 read reg.leases by hand and was classified conversation-only; it goes through holdersOn now (each
  // conversation's drive off the in-memory inputs, their off their row) and has no reg.leases site to classify
  ok(/const userDrivesAnyWindowOf = \(profileId\) => \{ const pid = String\(profileId \|\| ''\); return holdersOn\(pid\)\.some\(\(h\) => h\.human \? h\.input === 'user' : \(\(inputs\.get\(inputKey\(h\.browserKey, pid\)\) \|\| \{\}\)\.input === 'user'\)\); \};/.test(src) && !('userDrivesAnyWindowOf' in sites), 'verify r5 ⑥ (lane browser-windows): userDrivesAnyWindowOf — a HOLDER question — goes through holdersOn (the conversations\' leases + their row), never reg.leases by hand');
}

// ── ③ THE TAB-RELEASE CENSUS, its route pins and its CONTROLS (moved; the paths driven over the fake 0.38.1 stay in the heavy suite) ──
console.log('— ③ THE TAB-RELEASE CENSUS, its route pins and its CONTROLS');
{
  // verify r4 — THE TAB-RELEASE CENSUS (r3's MED class: a conversation's page the person takes must never receive that conversation's
  // next command). The orphan rule is only as good as ONE record — `reg.leftTabs`, written by ONE recorder `noteLeftTab` —
  // so, grep-derived over browser-keeper.js: (a) every statement that RELEASES a lease (the lease set shrinks or is
  // replaced, a helper's handle is forgotten) sits in a function that calls the recorder, or is declared with its reason;
  // (b) every statement that FORGETS a left key is declared with its reason (the bound: an evicted key is marked first);
  // (c) every keeper act that CLOSES a conversation's tab marks `tabClosed` (its next attach binds a new tab first), or is
  // declared. A new site is RED until the tables say what it is; a row that names no site is RED (dead). Every path the
  // brief names is walked to its site through the call it makes. Then the paths are driven over the fake 0.38.1.
  const census = (text) => {
    const lines = text.split('\n');
    const head = /^  (?:async )?function (\w+)\(|^  const (\w+) = (?:\(|async|\w+ =>|\{)/;
    const fnAt = (i) => { for (let x = i; x >= 0; x--) { const m = head.exec(lines[x]); if (m) return m[1] || m[2]; } return '(top)'; };
    const code = (l) => (/^\s*(\*|\/\/|\/\*)/.test(l) ? '' : l.replace(/\/\/.*$/, ''));
    const at = (re) => { const out = {}; lines.forEach((l, i) => { const n = (code(l).match(re) || []).length; if (n) { const f = /^\s*let reg\s*=/.test(l) ? '(declaration)' : fnAt(i); out[f] = (out[f] || 0) + n; } }); return out; };
    const body = (name) => { const s = lines.findIndex((l) => { const m = head.exec(l); return m && (m[1] || m[2]) === name; }); if (s < 0) return ''; let e = lines.length; for (let x = s + 1; x < lines.length; x++) if (head.test(lines[x])) { e = x; break; } return lines.slice(s, e).map(code).join('\n'); };
    return {
      releases: at(/reg\.leases\s*=(?!=)(?!\s*reg\.leases\.map\()|reg\.leases\.(?:splice|pop|shift)\(|reg\.leases\.length\s*=(?!=)|delete reg\.children\[|\breg\s*=(?!=)\s*B\./g),
      forgets: at(/delete reg\.leftTabs\[|reg\.leftTabs\s*=(?!=)|delete m\[/g),
      ends: at(/'tab', 'close'|closeAll\(/g),
      body,
    };
  };
  const RECORDS = { detach: 'the agent\'s detach (its CLI `close`), the UI\'s Detach, a pin that moves, a re-judge (narrowing / verb-time / a Task Group change), Delete…, a conversation found on another machine', dropChild: 'a helper\'s handle dropped', reconcile: 'the tick\'s carrier drop (a conversation that ended, a killed session) and the boot\'s (a restart without it); a helper\'s lease with its parent' };
  const RELEASE_DECLARED = { '(declaration)': 'the empty registry before the first load',
    // the B-f276 remainder (bl-jobs, block line 236 — checkpoint 60's red, read one by one against the unit's own law «while the
    // registry is held no browser is ended for a record nobody could read»): both are a LOAD's bookkeeping, no live tab ends
    loadFrom: 'the load over one read\'s answer — at the boot it replaces the empty registry; at the read again it replaces the HELD one, which is empty and unread: while held no lease can be recorded (every act that records is refused store_unread; attach finds no profile in it), so no lease is in memory to lose; the normalizer drops only a MALFORMED row',
    heldRetry: 'a read again whose LOAD THREW: the half-loaded registry (loadFrom is synchronous — nothing attached meanwhile, no tab was bound to it) is put back to the empty, unread one and the store held again; the file keeps every lease and the next try loads it — nothing is stopped or closed' };
  const FORGETS = { removeProfile: 'the record is gone (removal needs no lease and a stopped browser)', stop: 'the browser stopped — every page went with it (a lease held at the stop is marked tabClosed; a key that left before answers the binary\'s own tab_gone, never another tab)', attach: 'the key is back — it holds a lease on its own tab again', adoptOrphan: 'moved into tabClosed first: every left key is marked', noteLeftTab: 'the bound — an evicted key is marked tabClosed first (fail closed, verify r4)' };
  const ENDS = { closeLeaseSession: 'the tab a narrowing took closes under its session — marked when the close went through', stop: 'every lease of a stopped browser is marked (never a switch: it re-opens each lease\'s own tab under its session)' };
  const ENDS_DECLARED = { endHuman: 'THEIR tabs, each by id — never a conversation\'s',
    // lane browser-resume C (§3.9, the owner's ruling 3) — each judged by PURE src/browser-tabs.js BEFORE it runs:
    agentTabAct: 'the agent\'s own `tab close` of its OWN tab (the verdict first — another holder\'s tab is not_your_tab, nothing runs); its session answers the binary\'s own tab_gone after its current tab, said in the answer',
    userTabAct: 'the user\'s ✕ on the viewed agent\'s tab while THE PERSON drives it (never its last; its current tab first moves to a neighbour of its own) — recorded on the takeover\'s cycle, said at the handback; never another conversation\'s',
    closeHumanTab: 'THEIR tab by id, never their last (their current tab first moves to another of theirs) — never a conversation\'s' };
  // the paths the brief names, each walked to the site it releases through (caller → callee, both in the keeper)
  const PATHS = [
    ['the tick\'s drop / a session kill (the carrier grace)', 'tick', 'reconcile'], ['a restore (a restart without the conversation)', 'boot', 'reconcile'],
    ['detach (the agent, the UI, the CLI\'s close)', 'detach', 'noteLeftTab'], ['a helper\'s handle', 'dropChild', 'noteLeftTab'],
    ['a lease revoked by a narrowing / a Task Group change', 'rejudgeLeases', 'detach'], ['…its tab closed', 'rejudgeLeases', 'closeLeaseSession'],
    ['a Task Group change re-judged AT ONCE (identity r4\'s hook — the .197 integration adds its row)', 'rejudgeAll', 'rejudgeLeases'],
    ['a conversation on another machine', 'attach', 'detach'], ['Delete…', 'releaseAll', 'detach'],
    ['Quit the whole browser', 'quitHuman', 'stop'], ['a backend switch', 'switchBackend', 'stop'],
    ['a heal (a NEW Chrome — every tab went: their browsing ends, a conversation answers the binary\'s own tab_gone, lane H r4)', 'recaptureBrowser', 'tabsWentWithBrowser'],
  ];
  // declared, no keeper site: a fork's parent keeps its key and its lease (the fork gets a NEW key — a new session, its own
  // tab: measured on the real 0.38.1, verify/repro-r4-real newkey); the agent's own `tab close` keeps its lease and its
  // session answers the binary's tab_gone (measured: never another tab); the row / strip Stop = stop()
  // the .197 integration: lane browser-stuck's human RESTART (both routes) releases through the keeper's stop() — the
  // ENDS row above marks every lease of the stopped browser — and never under THEIR page (409 browsing_yourself); pinned below
  const judge = (text) => {
    const c = census(text), bad = [];
    for (const [f, n] of Object.entries(c.releases)) { if (f in RECORDS) { if (!c.body(f).includes('noteLeftTab(')) bad.push(`release in ${f} without the recorder`); } else if (!(f in RELEASE_DECLARED)) bad.push(`release in ${f} (${n}) not in the census`); }
    for (const f of Object.keys(RECORDS)) if (!(f in c.releases)) bad.push(`dead row: ${f} releases nothing`);
    for (const f of Object.keys(c.forgets)) if (!(f in FORGETS)) bad.push(`forget in ${f} not in the census`);
    for (const f of Object.keys(FORGETS)) if (!(f in c.forgets)) bad.push(`dead row: ${f} forgets nothing`);
    if (!c.body('noteLeftTab').includes("{ markTabLost(pd.id, x, 'closed'); delete m[x]; }")) bad.push('the bound forgets without marking'); // the ONE mark pair (lane profile-lock-roll)
    for (const f of Object.keys(c.ends)) { if (f in ENDS) { if (!/reg\.tabClosed\[|markTabLost\(/.test(c.body(f))) bad.push(`${f} closes a conversation's tab without the mark`); } else if (!(f in ENDS_DECLARED)) bad.push(`tab close in ${f} not in the census`); }
    for (const f of Object.keys(ENDS)) if (!(f in c.ends)) bad.push(`dead row: ${f} closes nothing`);
    for (const [, from, to] of PATHS) if (!c.body(from).includes(to + '(')) bad.push(`path ${from} → ${to} gone`);
    return { bad, c };
  };
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const J0 = judge(ksrc);
  {
    const rbR = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
    const restartBodies = ['/api/browser/profiles/:id/restart', '/api/browser/session/:sessionId/restart'].map((r) => { const i = rbR.indexOf(`router.post('${r}'`); return i < 0 ? '' : rbR.slice(i, rbR.indexOf('\nrouter.', i + 1)); });
    ok(restartBodies.every((b) => b && /await k\.stop\(/.test(b) && /k\.humanOf\(/.test(b) && /code: 'browsing_yourself'/.test(b) && b.indexOf('k.humanOf(') < b.indexOf('await k.stop(')), 'THE TAB-RELEASE CENSUS (the .197 integration): both human Restart routes release through the keeper\'s stop() (its marks) and refuse BEFORE it while the person browses the profile');
  }
  ok(!J0.bad.length && Object.keys(J0.c.releases).length >= 5, `THE TAB-RELEASE CENSUS: every lease release of browser-keeper.js (${Object.values(J0.c.releases).reduce((a, b) => a + b, 0)} in ${Object.keys(J0.c.releases).join(', ')}) calls the ONE recorder or is declared; every forget of a left key (${Object.keys(J0.c.forgets).join(', ')}) is declared (the bound marks first); every tab the keeper closes (${Object.keys(J0.c.ends).join(', ')}) marks tabClosed or is declared; the ${PATHS.length} named paths reach their sites`, J0.bad);
  const cut = (f, s, r) => { if (!ksrc.includes(s)) return null; return judge(ksrc.replace(s, r)).bad; };
  const controls = [
    ['detach without the recorder', cut('detach', "    noteLeftTab(id, browserKey); // verify r3", "    // (control)"), /release in detach without the recorder/],
    ['dropChild without the recorder', cut('dropChild', '    for (const l of reg.leases) if (l.browserKey === handle) noteLeftTab(l.profileId, handle);', '    // (control)'), /release in dropChild without the recorder/],
    ['the tick without the recorder', cut('reconcile', '      noteLeftTab(d.lease.profileId, d.lease.browserKey);\n', ''), /release in reconcile without the recorder/],
    ['a NEW release site', judge(ksrc.replace('  function dropChild(handle) {', '  function dropAllLeases() { reg.leases = []; }\n  function dropChild(handle) {')).bad, /release in dropAllLeases \(1\) not in the census/],
    ['the bound forgetting without the mark', cut('noteLeftTab', "{ markTabLost(pd.id, x, 'closed'); delete m[x]; }", 'delete m[x];'), /the bound forgets without marking/],
    ['a NEW forget site', judge(ksrc.replace('  function dropChild(handle) {', '  function forgetLeft(id) { delete reg.leftTabs[id]; }\n  function dropChild(handle) {')).bad, /forget in forgetLeft not in the census/],
    ['closeLeaseSession without the mark', cut('closeLeaseSession', "      if (t && t.ok) { markTabLost(p.id, browserKey, 'closed'); commit(); }", '      if (t && t.ok) { commit(); }'), /closeLeaseSession closes a conversation's tab without the mark/],
    ['a NEW tab-close site (lane browser-resume C)', judge(ksrc.replace('  function dropChild(handle) {', "  async function closeAnyTab(id) { return rt.exec(null, ['tab', 'close', id]); }\n  function dropChild(handle) {")).bad, /tab close in closeAnyTab not in the census/],
    ['a re-judge that no longer detaches', cut('rejudgeLeases', "      try { detach({ profileId, browserKey: l.browserKey, by: 'user' }); out.detached", "      try { (() => {})({ profileId, browserKey: l.browserKey, by: 'user' }); out.detached"), /path rejudgeLeases → detach gone/],
  ];
  const cbad = controls.filter(([, b, re]) => !(Array.isArray(b) && b.some((x) => re.test(x)))).map(([n, b]) => ({ n, b }));
  ok(!cbad.length, `CONTROLS (${controls.length}): the census reddens a copy that skips each recorder site (detach, dropChild, the tick), a new release site, the bound that forgets without marking, a new forget site, a closed tab without its mark, a NEW tab-close site (lane browser-resume C), a path that no longer reaches its site`, cbad);
}

// ── ③ THE AGENT CAN NEVER REACH THE PERSON'S BROWSING (moved whole) ──
console.log('— ③ THE AGENT CAN NEVER REACH THE PERSON’S BROWSING');
{
  // THE AGENT CAN NEVER REACH THEIR BROWSING: no /api/agent/ route and no agent CLI names their key, their routes or their verbs
  const routes = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const agentPart = routes.slice(routes.indexOf("const AGENT_PREFIX = '/api/agent/browser';"));
  const FORBID = /\bhu-|\/browse\b|browse\/|humanTake|humanAttach|humanRelease|closeHuman|quitHuman|navigateHuman|\bbrowse\(|humanOf|humanTargetFor/;
  ok(agentPart.length > 5000 && !FORBID.test(agentPart), 'no /api/agent/browser/* handler names their key, their routes or their verbs');
  const agentRoutes = [...routes.matchAll(/router\.(?:get|post|patch|delete)\('(\/api\/agent\/[^']+)'/g)].map((m) => m[1]);
  ok(agentRoutes.length > 8 && !agentRoutes.some((p) => /\/browse(\/|$)|human/.test(p)) && /router\.post\('\/api\/browser\/profiles\/:id\/browse'/.test(routes) && ![...routes.matchAll(/router\.\w+\('([^']+)'/g)].some((m) => /^\/api\/agent\/.*\bbrowse\b/.test(m[1])), 'their four routes are /api/browser/* (cookie only) — no /api/agent/… twin');
  // (a walk built by path.join names no file the affected rule sees: this suite's ci.mjs row declares reads: ['data/bin/'], so a
  // new data/bin/vibespace-* CLI selects it in a lane's affected list too)
  const clis = fs.readdirSync(path.join(REPO, 'data/bin')).filter((n) => /^vibespace-/.test(n) && fs.statSync(path.join(REPO, 'data/bin', n)).isFile());
  const hits = clis.filter((n) => /\bhu-[0-9a-f]|\/api\/browser\/browse|profiles\/[^'"`]*\/browse|humanKeyFor/.test(fs.readFileSync(path.join(REPO, 'data/bin', n), 'utf8')));
  ok(clis.length > 5 && hits.length === 0, `no agent CLI (${clis.length} data/bin/vibespace-*) names their key or their routes`, hits);
}

// ── ②b the trace routes' PIN (moved from ②b's trace block) ──
console.log('— ②b the trace routes’ PIN');
{
  const rt = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8');
  ok((rt.match(/!B\.isBrowserKey\(givenKey\) && !HM\.isHumanKey\(givenKey\)/g) || []).length === 2, 'PIN: both trace routes (`/actions`, `/sessions`) accept their `hu-` key beside a conversation\'s');
}

// ── ②b the replay window's PIN (moved from ②b's guard block) ──
console.log('— ②b the replay window’s PIN');
{
  const rw = fs.readFileSync(path.join(REPO, 'src/lib/browser-replay-window.js'), 'utf8');
  ok(/\^\(bk\|hu\)-\[0-9a-f\]\{8\}\$/.test(rw), 'PIN: the replay window\'s target accepts their key (Replay on their session opens it)');
}

// ── ③ the strip's PIN (moved from ③'s strip-stop block) ──
console.log('— ③ the strip’s PIN');
{
  const wsrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-live-window.js'), 'utf8');
  ok(/stoppableRows\(st\.rows, \{ browsing: \(\(app\._browserProfiles && app\._browserProfiles\.leases\) \|\| \[\]\)\.filter\(\(l\) => l && l\.human\)\.map\(\(l\) => l\.profileId\) \}\)/.test(wsrc) && /if \(x\.yours\) \{/.test(wsrc) && /r\.code === 'browsing_yourself' \? humanRefusalText\('browsing_yourself', \{ label: x\.label \|\| '', act: 'stop' \}, t\)/.test(wsrc),
    'PIN: the strip reads the digest\'s human rows (their row says so, no Stop) and words a `browsing_yourself` refusal in the device\'s language');
}

// ═══ ④ THE WORDS ══════════════════════════════════════════════════════════════
console.log('— ④ the words: en through the module, zh + ja from the dictionaries');
{
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const lit = (f) => [...fs.readFileSync(path.join(REPO, f), 'utf8').matchAll(/\bt\((['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  const keys = [...new Set(lit('src/browser-human.js'))];
  const missing = keys.filter((x) => !zh[x] || !ja[x]);
  ok(keys.length >= 25 && missing.length === 0, `every key of src/browser-human.js (${keys.length}) is in zh AND ja`, missing);
  const OWNER = {
    'Browse yourself': ['自己浏览', '自分で閲覧'], 'Open your browsing window': ['打开你的浏览窗口', '閲覧ウィンドウを開く'], 'You are browsing': ['你正在浏览', 'あなたが閲覧中'],
    'You are browsing it': ['你正在浏览它', 'あなたが閲覧中です'], 'You were browsing it — Continue': ['你刚才在浏览 — 继续', '閲覧の途中です — 続ける'], 'Type an address': ['输入网址', 'アドレスを入力'],
    'Only web addresses': ['只能输入网页地址', 'ウェブのアドレスのみ'], 'Continue browsing': ['继续浏览', '閲覧を続ける'], 'Browse again': ['再次浏览', 'もう一度閲覧'],
    "You're browsing this in another window": ['你正在另一个窗口里浏览它', '別のウィンドウで閲覧中です'], 'Continue here': ['在这里继续', 'ここで続ける'], Keyboard: ['键盘', 'キーボード'],
    'You · {time} · {dur}': ['你 · {time} · {dur}', 'あなた · {time} · {dur}'], 'Open it yourself': ['自己打开', '自分で開く'], 'Quit the whole browser': ['退出整个浏览器', null],
  };
  const bad = Object.entries(OWNER).filter(([k0, [z, a]]) => (z && zh[k0] !== z) || (a && ja[k0] !== a) || !zh[k0] || !ja[k0]).map(([k0]) => k0);
  ok(bad.length === 0, 'the design\'s own words in zh and ja (§6\'s table; "退出整个浏览器" is the owner\'s)', bad);
  const tZh = (s, p) => String(zh[s] || s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const tJa = (s, p) => String(ja[s] || s).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const rendered = [tZh, tJa].flatMap((tt) => [...HM.REFUSAL_CODES, 'not_browsing', 'not_web'].map((c) => HM.humanRefusalText(c, { label: 'Work', machine: 'dev-1', pid: 7, n: 6 }, tt)).concat(Object.values(HM.humanEndChoices({ conversations: 2, names: ['A'] }, tt)).flatMap((x) => (x && typeof x === 'object' ? Object.values(x) : [x])).filter((x) => typeof x === 'string')));
  ok(rendered.every((x) => x && !/\{\w+\}/.test(x)) && rendered.filter((x, i) => i >= rendered.length / 2).every((x) => !/[“”]/.test(x)), 'every refusal and end-button sentence renders in zh and ja with no {param} left; ja never carries “ ”', rendered.filter((x) => !x || /\{\w+\}/.test(x)));
}

// ── ⑤ B-b56d (2.369.413, the coordinator's ruling 2026-11-19 01:42Z): THE PERSON'S OPEN HELD BY THE BROWSER'S OWN SIGN-IN SHEET ──
console.log('— ⑤ B-b56d: the person’s open that the browser’s own sign-in sheet holds is said as the sheet, never «did not go through»');
{
  const WHY = 'Navigation failed: net::ERR_INVALID_AUTH_CREDENTIALS';   // the driver's words on the box's display road (int361's log, 2026-11-19)
  const native = { state: 'prompt', prompt: { id: 'prm-x', type: 'http-auth', native: true, origin: 'http://127.0.0.1:9', realm: 'Team' } };
  const form = { state: 'prompt', prompt: { id: 'prm-f', type: 'http-auth', origin: 'http://127.0.0.1:9', realm: 'Team' } };
  const v1 = HM.openSignInVerdict({ why: WHY, stuck: native });
  ok(v1 && v1.sheet === true && v1.origin === 'http://127.0.0.1:9' && v1.realm === 'Team', 'B-b56d: the driver\'s ERR_INVALID_AUTH_CREDENTIALS while the person\'s key holds the browser\'s OWN sheet ⇒ the sheet (who asks named)', v1);
  ok(HM.openSignInVerdict({ why: WHY, stuck: null }) === null && HM.openSignInVerdict({ why: WHY, stuck: form }) === null && HM.openSignInVerdict({ why: 'Navigation failed: net::ERR_NAME_NOT_RESOLVED', stuck: native }) === null && HM.openSignInVerdict({ why: WHY, stuck: { state: 'passkey' } }) === null,
    'B-b56d: a real failure stays one — no sheet recorded, VibeSpace\'s own form (not the browser\'s sheet), another error, another stuck state');
  const ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const nav = (ks.match(/  async function navigateHuman\(key, act = \{\}\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  const iVerdict = nav.indexOf('HM.openSignInVerdict({ why, stuck: stuckSource(key) })'), iFail = nav.indexOf("the user's ${v.act} did not go through"), iThrow = nav.indexOf("throw namedError('nav_failed', why)");
  ok(nav && iVerdict > 0 && iVerdict < iFail && iFail < iThrow && /if \(sheet\) \{[^\n]*return \{ ok: true, act: v\.act, url: v\.url \|\| null, signIn: sheet/.test(nav),
    'B-b56d: the keeper\'s navigateHuman reads the verdict BEFORE it says «did not go through» and answers {ok, signIn} — the tab kept (no unadopt), no nav_failed', { iVerdict, iFail, iThrow });
  // RED CONTROL, ON THE SOURCE TEXT (the keeper is not run here: the heavy (g2) leg runs it) — the base's navigateHuman (no verdict): it proves its plant first
  const baseNav = anchored(nav, /      let sheet = null; if \(stuckSource\)[^\n]*\n      if \(sheet\) \{[^\n]*\n/, '', 'b56d-keeper-no-verdict');   // scratch.mjs anchored(): a moved line fails BY NAME
  ok(nav.length > 0 && baseNav.length < nav.length && !/openSignInVerdict/.test(baseNav) && /did not go through/.test(baseNav), 'CONTROL plant: the copy is the keeper\'s navigateHuman with the verdict\'s two lines taken out (what 2.369.412 runs)');
  const legOn = (src) => { const a = src.indexOf('HM.openSignInVerdict({ why, stuck: stuckSource(key) })'), b = src.indexOf("the user's ${v.act} did not go through"), c = src.indexOf("throw namedError('nav_failed', why)"); return !!src && a > 0 && a < b && b < c && /if \(sheet\) \{[^\n]*return \{ ok: true, act: v\.act, url: v\.url \|\| null, signIn: sheet/.test(src); };
  ok(legOn(nav) && !legOn(baseNav) && !/signIn: sheet/.test(baseNav) && /throw namedError\('nav_failed', why\)/.test(baseNav), 'CONTROL (B-b56d, the source text): the leg\'s own predicate holds on the keeper and FAILS on the copy without the verdict, whose text goes on to throw nav_failed — the person read «Could not open it» while the browser asked them to sign in (RED for the leg above)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
