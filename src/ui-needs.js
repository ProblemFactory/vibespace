'use strict';
/**
 * THE UI NEEDS CENSUS (lane ui-needs-a-button — 主开发's UI fix lane L2; the owner 2026-11-13: «你看看这个界面是不是应该优化下，最好
 * 走查一下所有界面找到可优化的布局，提示文本等» — the walk's largest pattern: a sentence that says something is needed, failed or off, or
 * «change it in Settings › …», with no button on its line; and words that point the wrong way). THE RULE: a sentence says the STATE;
 * the button ON ITS LINE does the ACT (src/lib/need-line.js) — it never routes a person by a menu path or a direction.
 * Every sentence a person reads that the NET catches is claimed by ONE row here, or by a non-need with its reason:
 *   NET   path       a menu / settings PATH inside a sentence («Settings → …», «⚙ → …», «Settings › … ›», «the ⋯ menu»)
 *         direction  a DIRECTION to a control («… below», «… above» after a verb or a quoted control)
 *         company    a company / an administrator assumed («your company», «ask your admin(istrator)») — said only where a
 *                    company preset of that kind exists (cluster-presets)
 *         listed     the walk's own «needed / failed / off with no button» sentences, each its row
 *   door  { present: { marker, surfaces } } — every file that states the sentence carries the door's marker (a PURE model's words
 *         count for the surface that draws them: `via`) · { none: why } · { deferred: DEFERRED } (a later pick of this lane, said)
 * THE ROW SHAPE IS lane machine-needs-at-pairing's (src/machine-needs.js); ONE suite reads both tables (scripts/test-needs-doors.mjs).
 * A sentence the MACHINE table claims (a machine's need) is its; this table claims the rest. PURE (no imports).
 */
const DEFERRED = 'ui-needs-a-button · picks 2–4';
// ── THE REST OF THE NET on 935960b7e (derived: work/dump-net.mjs), each claimed by name — the first 64 characters of the sentence ──
const oneOf = (list) => new RegExp('^(?:' + list.map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|') + ')');
const PATHS_LEFT = Object.freeze([
    "A message with no quote and no thread that arrives after this ag",
    "Action trace is off — Settings → Agent browser",
    "Also requires Settings → Integration → \"Allow agents to manage T",
    "Approve or deny from the conversation's Reach dialog (rail → Cha",
    "Auto (Settings → Desktop app scale)",
    "Automatic turns are refused on this account while it bills paid ",
    "Background jobs owned by this conversation message it when they ",
    "Cache on a network filesystem with no local disk to move it to —",
    "Cache on a network filesystem: the home folder is not a persiste",
    "Checking a new Claude Code is turned off in Settings (Accounts) ",
    "Default scale for {app}: Auto (Settings → Desktop app scale). Cl",
    "Developer Console → Security Settings → Redirect URLs. It must m",
    "Developer Console → your app → Security Settings → Redirect URLs",
    "Disabled — master switch is off (Settings → Integration)",
    "Frame shown (Settings → Seamless desktop app windows is off)",
    "Guards on top (also in Settings → Channels): {list} always needs",
    "Have a key instead? Paste it in Services › Integrations › Dropli",
    "How to turn it on: ⚙ → Integrations, the account type’s setup ca",
    "Model-scoped weekly limits (e.g. Fable) aren’t in the passive fe",
    "Nextcloud: Settings → Files shows this address. Use an app passw",
    "No guard is on (also in Settings → Channels) — the policy alone ",
    "No switch can be offered: this version of VibeSpace cannot switc",
    "Not set here: enter it in Settings → Channels → relay page to us",
    "Not set — the default in Settings applies (Integration → Hub aut",
    "Off until you allow agents to use windows on your desktop (Setti",
    "Off — turn it on in Settings → Desktop apps",
    "On-demand quota refresh is disabled in Settings",
    "Open Settings → Spending",
    "Open in Settings",
    "Open in Settings…",
    "Open the Outbox (rail → Channels → Outbox) or the conversation w",
    "Open the Outbox (rail → Channels → Outbox) to approve, edit or r",
    "Policy for the judge: «{text}» — the judge is off (Settings ▸ In",
    "Running sessions do not need it. You will only be asked once — ⚙",
    "Runs at the vendor; it needs your key (⚙ → Integrations) before ",
    "Runs on this machine only. For {host}, log in on the host — or e",
    "Runs on this machine only. For {host}: use “Log in on {host} as ",
    "Sampling is off in Settings — the holds are still measured.",
    "Scale {scale}× from Settings → Desktop app scale — widgets {gdk}",
    "Sessions run the pristine CLI: no hooks, no injected context, no",
    "Settings → Spending",
    "Slack opens its Allow page; press Allow and you are connected. T",
    "Stops as soon as you disable it in ⚙ → Plugins, and VibeSpace st",
    "Stored rate-limit reset credits — one can be consumed when a lim",
    "Suggesting words is off — turn it on in All Settings › Plugins ›",
    "That browser engine plugin is not running on this computer — ena",
    "That engine's plugin did not answer — restart it in ⚙ → Plugins.",
    "The LLM plugin stopped: the model refused the request shape (HTT",
    "The LLM plugin stopped: the provider says the plan does not allo",
    "The action trace is OFF (Settings → Agent browser → Action trace",
    "The background service for {name} is off — turn it on in ⚙ → Plu",
    "The cluster names {plugin} at «{ref}» — not a full commit sha, s",
    "The cluster's plugin {plugin}: waiting for your consent — its ke",
    "The code points at a plain http address — pairing needs https (o",
    "The key lives in Services › Integrations — this section never ho",
    "The policy judge is OFF (Settings ▸ Integration ▸ «Let the polic",
    "The profile did not start: “Name the code that holds the server”",
    "The scale this app was started at (Settings → Desktop app scale)",
    "The telemetry forward target in Settings (Forward diagnostics to",
    "The {name} background service has not answered yet — check ⚙ → P",
    "This conversation is NOT notified when its background jobs finis",
    "This machine: {used} of {cap} browsers running (Settings → Agent",
    "This stored login can’t ship to {host}. If you’ve logged this ac",
    "Turn on what you want in Settings › Plugins › LLM — each feature",
    "Usage refresh is Off in Settings — turn it on to check it, or ru",
    "VibeSpace asks Anthropic once how much of this account’s usage l",
    "VibeSpace's earlier download at {path} is now the program named ",
    "action trace is off (Settings → Agent browser)",
    "change it in the account's Reach & policy… (the account's ⋯ menu",
    "keeping is off (Settings → Agent browser)",
    "or paste a Dropline key in Services › Integrations",
    "the drafter is switched off in Settings › Plugins › LLM",
    "waiting for your consent — its kernel is not fetched; enable it ",
    "{account}'s subscription is no longer active (since {since}): th",
    "{plugin} · no program set — open ⚙ → Plugins → {plugin} → Progra",
    "“{name}” runs on this machine only. For {host}, use “Log in on h",
    "② Or host your own copy (one page serves every provider): the tw",
    "② Your own copy of the relay page (Settings → Channels → relay p",
  ]);
// the plugin migration's own notices (src/server/migrations.js words) matched by SHAPE: test-architecture §106 keeps that
// backend's name out of every src file but its rows
const PATHS_LEFT_SHAPES = Object.freeze([/^\S+ now installs as a plugin — ⚙ → Plugins → /, /^Your \S+ (?:program path|site list) was carried into ⚙ → Plugins → /]);
const DIRECTIONS_LEFT = Object.freeze([
    "+ Add a path… (a folder or a file; relative = against the row ab",
    "3. Copy the User OAuth Token (it starts xoxp-) from “OAuth & Per",
    "A Web application client works here too: register the 127.0.0.1 ",
    "A note for the agent (optional). Nothing is sent now. To have th",
    "A sign-in from this page comes back to 127.0.0.1 on any free por",
    "Approve access on the sign-in page (or paste the address back be",
    "At the bottom of that page, under “Your App Configuration Tokens",
    "Click for automatic placement; pick a member below to pin this c",
    "Either sign in above, or paste a key: create one at dropline.fis",
    "Finder: Cmd+K → enter the server address; any username, password",
    "Forced OFF by the environment (VIBESPACE_OPENCODE_SERVE=0) — the",
    "Forced ON by the environment (VIBESPACE_OPENCODE_SERVE=1) — the ",
    "If Slack’s last page shows a code instead of coming back here, p",
    "Inherits the account: {mode} — pick one above to change it for t",
    "Inherits the vendor's default: {mode} — pick one above to change",
    "Insert row above",
    "Insert row below",
    "It will be listed in these {n} groups and get their context; the",
    "It will be listed in this group and get its context; the folder ",
    "No groups yet. \"New group\" starts one with live agent sessions; ",
    "No known applications were found on this machine — use “Advanced",
    "No path called «{text}» — press a suggestion above.",
    "No rules yet — add one below. With no rule nothing matches (a wa",
    "Nothing connected yet. Click “Connect storage” below to add a cl",
    "Nothing you typed here — the button above lists the rest",
    "On Windows the device agent runs as administrator by default — W",
    "Opens a graphical program from this machine in a VibeSpace windo",
    "Paired as \"{id}\". Pick the device’s OS and run the command on it",
    "Paste it below and press Save to vault — it goes straight into t",
    "Paste its otpauth link or type its seed below, preview it, then ",
    "Paste the User OAuth Token (it starts xoxp-) here, then press Co",
    "Popup blocked — copy the link below and open it in a browser you",
    "Sign in first — press “Connect {label}” above.",
    "Starts at {size} — the picture size it last launched with; chang",
    "Stop it, take it away from every conversation that uses it, and ",
    "Stored securely on the server. If the key is passphrase-protecte",
    "That is the refresh token (xoxe-) — copy the token above it on t",
    "The directory is moved beside itself (…forgotten-<time>) and lis",
    "The sign-in screen itself. Open the link, sign in, then paste th",
    "The sign-in screen says something VibeSpace does not know yet — ",
    "This app remembers its last share and launches with it — change ",
    "This key is passphrase-protected — enter its passphrase below.",
    "Type a folder, or pick one below",
    "Type its user name and password below — they go straight into th",
    "VibeSpace could not read the sign-in link — here is the sign-in ",
    "Windows on that machine granted no administrator rights — nobody",
    "click \"Connect Gmail\" below — no terminal needed",
    "click \"Connect Google Drive\" below — no terminal needed",
    "click \"Connect OneDrive\" below — no terminal needed",
    "click \"Connect\" below — no terminal needed",
    "click “List shared drives” (needs access above) or paste an id",
    "every row tells the agent its path and note; 「Tell the agent」 se",
    "resolved against the group's first folder (the row above's folde",
    "resolved against the row above",
    "the model has no zero-data-retention endpoint — pick the other m",
    "the row above",
    "{path} does not exist, nor the folder above ({parent})",
    "✓ Connected as {user} — finish with the “Connect” button below.",
    "✓ Connected as {user} — finish with the “Create & connect” butto",
    "✓ Connected — finish with the “Connect” button below.",
    "✓ Connected — finish with the “Create & connect” button below.",
  ]);
const COMPANY_LEFT = Object.freeze([
    "Company presets: none — ask your admin.",
    "No account yet? Ask your administrator.",
    "No company OAuth client on this instance — ask your admin, or pr",
    "No company OAuth client on this instance — ask your admin. Meanw",
    "No company {name} client on this instance — ask your admin, or u",
    "Sign in with your own Claude account — your company uses a Claud",
    "Your company uses a Claude subscription — sign in with your own ",
    "Your workspace admin may have to approve the app; your company’s",
  ]);
const INSIDE_SETTINGS = Object.freeze([
    "Every feature above counts toward it: once a day's calls have co",
    "Lets sessions YOU designate as \"Group manager\" (Session Properti",
    "OFF (default): when your takeover lapses on its own, the agent i",
    "One item in For you (the default): at most one at a time, never ",
    "Only here in Settings",
    "The LLM plugin's own switch, shown here too. It judges the rows ",
  ]);
const MACHINE_OS = Object.freeze([
    "Opened System Settings › {pane} on {machine}",
    "Remote Desktop is on, but nothing answers on its port 3389; rest",
    "Set up once on the Mac: System Settings → General → Sharing → tu",
    "Turn it on in Settings → System → Remote Desktop; no firewall op",
    "Windows HDR is captured by TightVNC as it is, with no tone mappi",
  ]);
const NEEDS = Object.freeze([
  // ── pick 1: the walk's seven majors ──
  { id: 'folder-create', need: 'a folder that does not exist — «create it?» with its create on the line, missing parents too (sidebar-sessions-4)',
    match: /^Does not exist — create it\?$|^The folder above, \{parent\}, does not exist either\.$|^Create this folder and the missing folders above it$/, door: { present: { marker: /data-act="tick"/, surfaces: ['src/lib/path-field.js'] } } },
  { id: 'parked-ask', need: 'a parked ask — answered on the conversation\'s card: «Open the conversation and answer» on the note\'s line (for-you-2)',
    match: /^Answered on the conversation’s card — open the conversation to answer it$/, door: { present: { marker: /door: 'jump'/, surfaces: ['src/lib/inbox-window.js'] }, via: { 'src/inbox-reply.js': 'src/lib/inbox-window.js' } } },
  { id: 'deb-file-missing', need: 'a .deb file that is not there / cannot be read — «Choose another file…» on the line (desktop-apps-27)',
    match: /^This file (is not on|cannot be read on) \{machine\}: \{path\}$/, door: { present: { marker: /door: 'deb-repick'/, surfaces: ['src/lib/desktop-app-launcher.js'] }, via: { 'src/lib/app-install-dialog.js': 'src/lib/desktop-app-launcher.js' } } },
  { id: 'move-mode', need: 'move mode says what it is and how it ends — click drops, Esc puts the window back (window-manager-1)',
    match: /^Moving the window: move the mouse to place it, click to drop it, Esc cancels$/, door: { present: { marker: /'keydown', onKey/, surfaces: ['src/lib/window.js'] } } },
  { id: 'nav-loop', need: 'a navigation loop — «Stop loading» / «Close this tab» on the banner\'s line (browser-live-1)',
    match: /^The agent is told — it may propose clearing the site’s stored login, which you approve$/, door: { present: { marker: /door\('stop'/, surfaces: ['src/lib/browser-loop-banner.js'] }, via: { 'src/browser-stuck.js': 'src/lib/browser-loop-banner.js' } } },
  { id: 'ssh-refused', need: 'an ssh machine that refuses — the reason in words + «Copy the public key to add» / «Try again» on the line (machines-1)',
    match: /^Can’t (sign in to|reach) \{target\}/, door: { present: { marker: /door: 'public-key'|door: 'retest'/, surfaces: ['src/lib/sidebar-mounts.js'] } } },
  // ── the rest of the net: each sentence a door owed by a later pick of THIS lane (named, never silent) ──
  { id: 'settings-paths', need: 'a sentence that routes a person by a menu / settings path — its door (src/lib/need-line.js settingsDoor / integrationDoor / a window\'s opener) replaces the path (picks 2–3)', match: new RegExp([oneOf(PATHS_LEFT).source, ...PATHS_LEFT_SHAPES.map((r) => r.source)].join('|')), door: { deferred: DEFERRED } },
  { id: 'directions', need: 'a hint that points at a control by a direction — checked on its surface: the door on the line, or the direction kept where it is true (pick 4)', match: oneOf(DIRECTIONS_LEFT), door: { deferred: DEFERRED } },
  { id: 'company-words', need: 'a sentence that assumes a company / an administrator — said only where a company preset of that kind exists (pick 4)', match: oneOf(COMPANY_LEFT), door: { deferred: DEFERRED } },
]);
/** The net's catches that state no need with a missing door — each with its reason. */
const NOT_NEEDS = Object.freeze([
  { why: 'inside Settings: a row\'s own description naming another row of the same window (no door is owed — it is on that page)', match: oneOf(INSIDE_SETTINGS) },
  { why: 'a MACHINE\'s own operating-system settings path (Windows / macOS) — lane machine-needs-at-pairing\'s table claims it (src/machine-needs.js, its doors)', match: oneOf(MACHINE_OS) },
]);
const needOf = (sentence) => NEEDS.find((r) => r.match.test(String(sentence))) || null;
const notNeedOf = (sentence) => NOT_NEEDS.find((r) => r.match.test(String(sentence))) || null;
/** The census's net (the words a person reads — every t() / tr() / i18nKey() literal). */
const NET = Object.freeze({
  path: /\b(Settings|⚙)\s*(→|›|▸)|(→|›|▸)\s*(Integrations|Plugins|Settings|Channels)\b|\bin Settings\b|\bthe ⋯ menu\b|⋯ menu\)|Services › Integrations/,
  direction: /\b(click|press|tap|pick|choose|use|paste|type|fill|enter|select|tick|open|sign in|add one|connect)\b[^.;—]{0,60}\b(below|above)\b|[“"«][^”"»]{2,40}[”"»]\s*(button\s+)?(below|above)\b|\b(button|switch|box|field|link|row|code|token|folder|address) (below|above)\b/i,
  company: /\byour company\b|\bcompany uses\b|\b(ask|contact) your admin(istrator)?\b|\bask your administrator\b/i,
});
const LISTED = new RegExp(NEEDS.map((r) => r.match.source).join('|'));
const inNet = (s) => { const x = String(s); return NET.path.test(x) || NET.direction.test(x) || NET.company.test(x) || LISTED.test(x); };
module.exports = { NEEDS, NOT_NEEDS, NET, DEFERRED, needOf, notNeedOf, inNet };
