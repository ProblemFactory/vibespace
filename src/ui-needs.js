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
 *   door  { present: { marker, surfaces, shape } } — every file that states the sentence carries the door's marker (a PURE model's words
 *         count for the surface that draws them: `via` — one file, or every surface that draws them) · { none: why } (pick 5: no row is deferred — every sentence the net catches is a door, a none with its reason, or a non-need)
 *   shape HOW the door sits with its words (the verifier's list for picks 3–6 — read over each surface's AST by scripts/test-needs-doors.mjs:
 *         a marker cannot see placement): none = 'line' — the sentence IS the `words` of a needLine call whose `doors` hold a live door
 *         (a `run` that calls something) · 'toast' (showToast(words, {action})) · 'element' (the element that says it, or its parent,
 *         holds a live door) · 'lines' (a heading over need lines, each with its live door) · {html, key} (one template says it with the
 *         door's attribute; its click handler / link is live) · {chip} (the chip IS the door: its handler is given where its words are)
 *         · {beside} (the door of that id, live, built where the sentence is said) · {guard} (said only under that condition) · {item,
 *         opens | bucket} (a For-you item's own door) · `words` = the carrier's source when the sentence arrives at run time
 * THE ROW SHAPE IS lane machine-needs-at-pairing's (src/machine-needs.js); ONE suite reads both tables (scripts/test-needs-doors.mjs).
 * A sentence the MACHINE table claims (a machine's need) is its; this table claims the rest. PURE (no imports).
 */
// ── THE REST OF THE NET on 935960b7e (derived: work/dump-net.mjs), each claimed by name — the first 64 characters of the sentence ──
const oneOf = (list) => new RegExp('^(?:' + list.map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|') + ')');
// THE REMAINDER after pick 4 — real needs whose doors are not built in this lane yet, each named in the pick-4 report (the next pick or its owner lane)
// a door's own LABEL naming where it opens
const PATHS_LABEL = Object.freeze([
    "Open Settings → Spending",
    "Open in Settings",
    "Open in Settings…",
    "Change the scale for every app in Settings…",   // ui-controls-and-bugs (desktop-app-launcher.js): the menu row that opens the setting
]);
// a path in the VENDOR's own console (Lark developer console, Nextcloud) — VibeSpace draws nothing there
const PATHS_VENDOR = Object.freeze([
    "Developer Console → Security Settings → Redirect URLs. It must m",
    "Developer Console → your app → Security Settings → Redirect URLs",
    "Nextcloud: Settings → Files shows this address. Use an app passw",
]);
// PROVENANCE: the setting a value comes from, on the control or the info line that shows that value
const PATHS_PROVENANCE = Object.freeze([
    "Auto (Settings → Desktop app scale)",
    "Default scale for {app}: Auto (Settings → Desktop app scale). Cl",
    "Frame shown (Settings → Seamless desktop app windows is off)",
    "Not set — the default in Settings applies (Integration → Hub aut",
    "Scale {scale}× from Settings → Desktop app scale — widgets {gdk}",
    "Settings → Spending",
    "Stored rate-limit reset credits — one can be consumed when a lim",
    "The scale this app was started at (Settings → Desktop app scale)",
]);
// «also in …»: the second place the same switch is drawn (the switch is on this line's surface)
const PATHS_ALSO = Object.freeze([
    "Guards on top (also in Settings → Channels): {list} always needs",
    "No guard is on (also in Settings → Channels) — the policy alone ",
]);
// the plugin migration's one-shot notices (src/server/migrations.js words): where a moved row now lives, read once
const PATHS_MIGRATION = Object.freeze([
    "VibeSpace's earlier download at {path} is now the program named ",
]);
// a DIRECTION that is true on its surface: the control it names is drawn on that side in the same dialog / list (pick 4 judged each from its file's draw order; the walk found storage-1 and the TightVNC note wrong — both fixed)
const DIRECTIONS_TRUE = Object.freeze([
    "3. Copy the User OAuth Token (it starts xoxp-) from “OAuth & Per",
    "A Web application client works here too: register the 127.0.0.1 ",
    "A note for the agent (optional). Nothing is sent now. To have th",
    "A sign-in from this page comes back to 127.0.0.1 on any free por",
    "Approve access on the sign-in page (or paste the address back be",
    "Click for automatic placement; pick a member below to pin this c",
    "Either sign in above, or paste a key: create one at dropline.fis",
    "Finder: Cmd+K → enter the server address; any username, password",
    "Forced OFF by the environment (VIBESPACE_OPENCODE_SERVE=0) — the",
    "Forced ON by the environment (VIBESPACE_OPENCODE_SERVE=1) — the ",
    "If Slack’s last page shows a code instead of coming back here, p",
    "Inherits the account: {mode} — pick one above to change it for t",
    "Inherits the vendor's default: {mode} — pick one above to change",
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
    "The directory is moved beside itself (…forgotten-<time>) and lis",
    "The sign-in screen itself. Open the link, sign in, then paste th",
    "The sign-in screen says something VibeSpace does not know yet — ",
    "This app remembers its last share and launches with it — change ",
    "This key is passphrase-protected — enter its passphrase below.",
    "Type a folder, or pick one below",
    "Type its user name and password below — they go straight into th",
    "VibeSpace could not read the sign-in link — here is the sign-in ",
    "click “List shared drives” (needs access above) or paste an id",
    "the model has no zero-data-retention endpoint — pick the other m",
    "✓ Connected as {user} — finish with the “Connect” button below.",
    "✓ Connected as {user} — finish with the “Create & connect” butto",
    "✓ Connected — finish with the “Connect” button below.",
    "✓ Connected — finish with the “Create & connect” button below.",
]);
// names a table ROW or a parent FOLDER («the row above», «Insert row below», «the folder above») — not a control
const DIRECTIONS_ROWS = Object.freeze([
    "+ Add a path… (a folder or a file; relative = against the row ab",
    "Insert row above",
    "Insert row below",
    "every row tells the agent its path and note; 「Tell the agent」 se",
    "resolved against the group's first folder (the row above's folde",
    "resolved against the row above",
    "the row above",
    "{path} does not exist, nor the folder above ({parent})",
]);
// a step on the vendor's own page (api.slack.com) — VibeSpace draws no control there
const DIRECTIONS_VENDOR = Object.freeze([
    "At the bottom of that page, under “Your App Configuration Tokens",
    "That is the refresh token (xoxe-) — copy the token above it on t",
]);
// the vendor's own WORKSPACE admin (Slack approves an app per workspace) — a fact of Slack, not an assumption about this install
const COMPANY_VENDOR = Object.freeze([
    "Your workspace admin may have to approve the app; your company’s",
]);
// the plugin migration's own notices (src/server/migrations.js words) matched by SHAPE: test-architecture §106 keeps that
// backend's name out of every src file but its rows
const PATHS_LEFT_SHAPES = Object.freeze([/^\S+ now installs as a plugin — ⚙ → Plugins → /, /^Your \S+ (?:program path|site list) was carried into ⚙ → Plugins → /]);
const INSIDE_SETTINGS = Object.freeze([
    "Every feature above counts toward it: once a day's calls have co",
    "Lets sessions YOU designate as \"Group manager\" (Session Properti",
    "OFF (default): when your takeover lapses on its own, the agent i",
    "One item in For you (the default): at most one at a time, never ",
    "Only here in Settings",
    "The LLM plugin's own switch, shown here too. It judges the rows ",
  ]);
// B-af94: a mount door's refusal or row words (src/mount-error-words.js — now t() keys, so the need net reads them): said AT the
// door the person used, which is its way out — the exact templates the net catches
const MOUNT_REFUSALS = Object.freeze([
  "rclone backend type required (e.g. dropbox, b2, azureblob)",
  "at least one parameter required",
  "remote path required (e.g. bucket-name or bucket/prefix)",
  "bucket required",
  "keyPath or pass required",
  "user/pass or bearerToken required",
  "endpoint, bucket and accessKey required",
  "secretKey required",
  "installed binary failed to run",
  "name required",
  "token required",
  "A custom OAuth client needs its client secret too",
  "STS response missing credentials",
  "{field} required",
  "Share link is missing {field}",
  "STS AssumeRole failed: {detail}",
  "Gmail needs an OAuth client — pick a preset or provide a custom client id/secret (there is no built-in fallback client for Gmail)",
  "token refresh failed: {detail} — re-authorize this Gmail mount",
  "token refresh failed: {detail}",
  "download failed: {detail}",
  "unzip failed: {detail}",
  "forward failed: {detail}",
  // ↑ commit 2: the cloud mount DIALOG's refusals
  "rclone install on the device failed: {detail}",
  "rclone install on host failed: {detail}",
  "net use failed: {detail}",
  "device serve-folder failed: {detail}",
  "endpoint proxy rewrites signed headers (Cloudflare?) — temporary-credential (STS) shares need rclone 1.63–1.69, a service-account share, or an un-proxied endpoint",
  "connected but the sign-in has expired or been revoked — listings come from cache while every file read fails; re-authorize to fix",
  "CephFS mount failed: {detail}",
  "OneDrive drive lookup failed (HTTP {status})",
]);
const MACHINE_OS = Object.freeze([
    "Opened System Settings › {pane} on {machine}",
    "Remote Desktop is on, but nothing answers on its port 3389; rest",
    "Set up once on the Mac: System Settings → General → Sharing → tu",
    "Turn it on in Settings → System → Remote Desktop; no firewall op",
    "Windows HDR is captured by TightVNC as it is, with no tone mappi",
    // machine-needs-at-pairing (machine-settings-door.js): the pane a machine's settings door names, on that machine's own OS
    "System Settings › General › Sharing",
    "Settings › System › Remote Desktop",
    "Settings › System › Sound",
  ]);
const NEEDS = Object.freeze([
  // ── pick 1: the walk's seven majors ──
  { id: 'folder-create', need: 'a folder that does not exist — «create it?» with its create on the line, missing parents too (sidebar-sessions-4)',
    match: /^Does not exist — create it\?$|^The folder above, \{parent\}, does not exist either\.$|^Create this folder and the missing folders above it$/, door: { present: { marker: /data-act="tick"/, surfaces: ['src/lib/path-field.js'], shape: { html: 'data-act="tick"', key: '\'tick\'' } } } },
  { id: 'parked-ask', need: 'a parked ask — answered on the conversation\'s card: «Open the conversation and answer» on the note\'s line (for-you-2)',
    match: /^Answered on the conversation’s card — open the conversation to answer it$/, door: { present: { marker: /door: 'jump'/, surfaces: ['src/lib/inbox-window.js'], shape: { line: true, words: 'whyTxt' } }, via: { 'src/inbox-reply.js': 'src/lib/inbox-window.js' } } },
  { id: 'deb-file-missing', need: 'a .deb file that is not there / cannot be read — «Choose another file…» on the line (desktop-apps-27)',
    match: /^This file (is not on|cannot be read on) \{machine\}: \{path\}$/, door: { present: { marker: /door: 'deb-repick'/, surfaces: ['src/lib/desktop-app-launcher.js'] }, via: { 'src/lib/app-install-dialog.js': 'src/lib/desktop-app-launcher.js' } } },
  { id: 'move-mode', need: 'move mode says what it is and how it ends — click drops, Esc puts the window back (window-manager-1)',
    match: /^Moving the window: move the mouse to place it, click to drop it, Esc cancels$/, door: { present: { marker: /'keydown', onKey/, surfaces: ['src/lib/window.js'], shape: 'element' } } },
  { id: 'nav-loop', need: 'a navigation loop — «Stop loading» / «Close this tab» on the banner\'s line (browser-live-1)',
    match: /^The agent is told — it may propose clearing the site’s stored login, which you approve$/, door: { present: { marker: /door\('stop'/, surfaces: ['src/lib/browser-loop-banner.js'], shape: 'element' }, via: { 'src/browser-stuck.js': 'src/lib/browser-loop-banner.js' } } },
  { id: 'ssh-refused', need: 'an ssh machine that refuses — the reason in words + «Copy the public key to add» / «Try again» on the line (machines-1)',
    match: /^Can’t (sign in to|reach) \{target\}/, door: { present: { marker: /door: 'public-key'|door: 'retest'/, surfaces: ['src/lib/sidebar-mounts.js'] } } },
  { id: 'public-key', need: 'the public key cannot be shown — its cause by the route\'s code; no key ⇒ «Add it again with a key…» (Add machine\'s create / paste a key) on the line (machines-1, reader #8)',
    match: /^No public key to show — VibeSpace cannot read this machine’s key/, door: { present: { marker: /door: 'key-setup'/, surfaces: ['src/lib/sidebar-mounts.js'] } } },
  // ── the rest of the net: each sentence a door owed by a later pick of THIS lane (named, never silent) ──
  // ── pick 2: the settings and integration doors (the sentence keeps its state; the path became the door) ──
  { id: 'browser-cap', need: 'the machine\'s browser count against its limit — «Change the limit…» on the line (browser-live-8)',
    match: /^This machine: \{used\} of \{cap\} browsers running$/, door: { present: { marker: /settingsDoor\(app, 'browser\.maxRunning'/, surfaces: ['src/lib/browser-live-window.js'] } } },
  { id: 'desk-switch', need: 'agents on the real desktop are off — «Turn on…» on the heading\'s line (desktop-apps-5)',
    match: /^Agents on your real desktop: off$/, door: { present: { marker: /settingsDoor\(app, \(d && d\.setting\) \|\| 'window\.realDesktopTargets'/, surfaces: ['src/lib/desktop-app-launcher.js'] } } },
  { id: 'group-manager', need: 'a group manager also needs the global switch — «Turn on…» on the line (task-groups-15)',
    match: /^Also needs “Allow agents to manage Task Groups” — it is off\.$/, door: { present: { marker: /settingsDoor\(app, 'agents\.allowGroupManagement'/, surfaces: ['src/lib/session-props.js'] } } },
  { id: 'policy-judge', need: 'the vault\'s policy judge is off — «Turn on…» on the line (vault-grants-4)',
    match: /^The policy judge is off — these words are kept for when you turn it on\.$/, door: { present: { marker: /settingsDoor\(app, 'vault\.policyJudge'/, surfaces: ['src/lib/vault-use-row.js'] } } },
  { id: 'proxy-hops', need: 'an address filter behind a reverse proxy — «Proxy setting…» on the line (channels-groups-outbox-10)',
    match: /^Blank accepts any address\. Behind a reverse proxy, set the proxy first/, door: { present: { marker: /settingsDoor\(app, 'webhook\.trustProxyHops'/, surfaces: ['src/lib/channel-webhook.js'] } } },
  { id: 'spend-budget', need: 'pacing is not the money bound — «Set the budget…» (the Spending section) on the line (channels-policy-10)',
    match: /^This is only a rate limit — spending is capped by the account budget\.$/, door: { present: { marker: /settingsDoor\(app, 'spend\.unattendedPerIdentityDay'[\s\S]{0,120}section: true/, surfaces: ['src/lib/channel-filter-editor.js'] } } },
  { id: 'reload', need: 'a setting that takes effect at the next load, changed in this page — «Reload now» on its row (settings-13)',
    match: /^Takes effect after a reload$/, door: { present: { marker: /doors: \[reloadDoor\(\)\]/, surfaces: ['src/lib/settings-ui.js'] } } },
  { id: 'https-address', need: 'a sign-in that needs this instance\'s https address — «Turn on HTTPS…» beside the why (plugins-integrations-13)',
    match: /^Connecting needs an https address: turn on Tailscale HTTPS, or paste a Dropline key$/, door: { present: { marker: /'self-hosted': \(app\) => \(\{[\s\S]{0,400}door: settingsDoor\(app, 'server\.https'/, surfaces: ['src/lib/oauth-connect-row.js'], shape: { element: true, words: 'why()' } }, via: { 'src/integration-registry.js': 'src/lib/oauth-connect-row.js' } } },
  { id: 'browser-list-needs', need: 'the browser list\'s needs said ONCE under it — a cloud browser\'s key «Open Integrations…», the desktop window\'s consent «Turn on…» (browser-profiles-4)',
    match: /^A cloud browser needs your key from its vendor before its first start\.$|^Agents may not use windows on your desktop yet\.$/, door: { present: { marker: /integrationDoor\(app, n\.integration[\s\S]{0,160}settingsDoor\(app, n\.setting/, surfaces: ['src/lib/browser-new-profile.js'] }, via: { 'src/lib/browser-new-profile-model.js': 'src/lib/browser-new-profile.js' } } },
  { id: 'voice-teach-off', need: 'suggesting words is off — «Turn on…» opens the plugin\'s own settings section (the voice sheet, beside plugins-integrations-13)',
    match: /^Suggesting words is off\.$/, door: { present: { marker: /door: 'plugin-settings', run: \(\) => app\._openPluginSettings\('voice-input'\)/, surfaces: ['src/lib/voice-teach-ui.js'] } } },
  { id: 'engine-plugin-off', need: 'a browser engine plugin that is not running — «Plugins…» on the refusal\'s line (the build and new-profile dialogs)',
    match: /^That browser engine plugin is not running on this computer — turn it on in the Plugins list, then try again\.$/, door: { present: { marker: /buildRefusalDoorOf\(r\) === 'plugins'\) \{ const d = pluginsDoor\(app/, surfaces: ['src/lib/browser-build-dialog.js'], shape: 'element' }, via: { 'src/lib/browser-build-model.js': 'src/lib/browser-build-dialog.js' } } },
  { id: 'model-limits-refresh-off', need: 'a meter tooltip: model-scoped limits wait for on-demand refresh, which is off',
    match: /^Model-scoped weekly limits \(e\.g\. Fable\) aren’t in the passive feed — on-demand refresh is off$/, door: { none: 'a tooltip of the usage meter — pressing the row opens the account\'s card, whose usage-refresh chip is the door (pick 5)' } },
  { id: 'llm-key', need: 'the LLM plugin is on with no key — its chip is the door to the key\'s card (usage-16)',
    match: /^On — no API key yet$/, door: { present: { marker: /onChip = \(\) => this\.openIntegration\?\.\(p\.integration \|\| 'llm'\)/, surfaces: ['src/lib/plugins-ui.js'], shape: { chip: 'onChip' } } } },
  // ── pick 3: windows, dialogs and machine rows (the way a sentence named became the door on its line) ──
  { id: 'dial-offline', need: 'a paired device that is offline — its state short + «Show the pairing command…» on the row; what to check folded (machines-6)',
    match: /^Offline since \{time\}$|^Never connected$/, door: { present: { marker: /pairDoor\(this\.app, h, \{ kind: 'secondary' \}\)/, surfaces: ['src/lib/sidebar-mounts.js'] }, via: { 'src/lib/dial-address-picker.js': 'src/lib/sidebar-mounts.js' } } },
  { id: 'elevate-pair', need: 'raise a Windows device agent — «Show the pairing command…» is the primary, the PowerShell recipe the second way (machines-29)',
    match: /^Easiest: run the pairing command again on the machine/, door: { present: { marker: /doors: \[pairDoor\(this\.app, h, \{ kind: 'primary' \}\)/, surfaces: ['src/lib/sidebar-mounts.js'] } } },
  { id: 'dial-reinstall', need: 'a dial-out daemon installed but not dialed in — «Reinstall…» is the primary, the removal a secondary danger (machines-27)',
    match: /^The daemon is installed but <b>not currently dialed in<\/b>/, door: { present: { marker: /dataset\.door = 'dial-reinstall'/, surfaces: ['src/lib/sidebar-mounts.js'], shape: 'element' } } },
  { id: 'mount-offline', need: 'a mount onto a machine that is offline — said first, the machine\'s pairing sheet on the line (storage-5)',
    match: /^“\{name\}” is offline — a mount works once it is connected\.$/, door: { present: { marker: /ctx\.body\.prepend\(needLine\(\{[\s\S]{0,240}pairDoor\(this\.app, h/, surfaces: ['src/lib/sidebar-mounts.js'] } } },
  { id: 'no-machine', need: 'no machine yet — «Add an SSH machine…» and «Pair a device…» on the line, never «in the Remote tab» (agents-accounts-6)',
    match: /^No machines yet — add an SSH machine or pair a device\.$/, door: { present: { marker: /door: 'add-ssh-host'[\s\S]{0,700}pairDoor\(this, null/, surfaces: ['src/lib/manage-agents.js'] } } },
  { id: 'machine-login', need: 'the machine login is not set up while named accounts run — «Log in on this machine…» stays on the row (agents-accounts-8)',
    match: /^machine login not set up$|^machine login inactive$/, door: { present: { marker: /quietLogin \? t\('Log in on this machine…'\)/, surfaces: ['src/lib/manage-agents.js'], shape: 'element' } } },
  { id: 'no-password', need: 'the export dialog with no VibeSpace password — «Set a password…» on the line; rows only for what exists (gear-and-system-12)',
    match: /^No VibeSpace password is set\.$|^There is no sensitive data to export right now\.$/, door: { present: { marker: /door: 'set-password'/, surfaces: ['src/lib/app.js'], shape: ['line', 'element'] } } },
  { id: 'ref-release', need: 'an account still referenced — each reference with its «Release…» door, «Disconnect» beside them (channels-accounts-4)',
    match: /^This account is still referenced — release these first:$/, door: { present: { marker: /refDoor\(app, a, ref, close\)/, surfaces: ['src/lib/channel-account-dialogs.js'], shape: 'lines' } } },
  { id: 'no-replies', need: 'a caller that takes no replies — its line with «Change delivery…», never a greyed box (channels-groups-outbox-2)',
    match: /^takes no replies$/, door: { present: { marker: /door: 'callers'/, surfaces: ['src/lib/channel-webhook.js'] }, via: { 'src/lib/webhook-view.js': 'src/lib/channel-webhook.js' } } },
  { id: 'policy-review', need: 'direct send refused by a review policy — «Change the sending policy…» on the line (channels-policy-7)',
    match: /^Direct send is not offered here: \{why\}$/, door: { present: { marker: /door: 'policy', run/, surfaces: ['src/lib/channel-filter-editor.js'] } } },
  { id: 'policy-above', need: 'the same refusal INSIDE Reach & policy — it names the Sending policy row above it (channels-policy-1)',
    match: /^to allow it, change the Sending policy above\.$/, door: { none: 'the row it names is in the same dialog, directly above this line — a door would open the dialog the person is in' } },
  { id: 'no-switch', need: 'no browser switch can be offered — «Install a browser plugin…» and «Agent browser…» (Change build…) on the line (browser-profiles-19)',
    match: /^No switch can be offered: this version of VibeSpace cannot switch the agent’s browser yet/, door: { present: { marker: /'browser-plugin': app && typeof app\._pluginInstallDialog/, surfaces: ['src/lib/browser-proposal-card.js'], shape: { beside: 'browser-plugin' } }, via: { 'src/browser-switch.js': 'src/lib/browser-proposal-card.js' } } },
  { id: 'passkey-wait', need: 'a page waits for a passkey — «Passkey settings…» beside «Cancel passkey request» (browser-live-13)',
    match: /^Cancel the request to use the page’s other way in, or sign in on your own device/, door: { present: { marker: /open: 'passkeys'/, surfaces: ['src/lib/browser-live-window.js'], shape: 'element' }, via: { 'src/browser-passkey.js': 'src/lib/browser-live-window.js' } } },
  // ── pick 4: acts, the install / editor / folder outliers, the sign-in's personal words ──
  { id: 'remove-failed', need: 'a failed app removal — the sentence once with «Forget it» / «Copy the command» / «Close» on its line; the output once, folded (desktop-apps-18)',
    match: /^The remove recipe failed$/, door: { present: { marker: /door: 'remove-forget'/, surfaces: ['src/lib/desktop-app-launcher.js'] } } },
  { id: 'disk-changed', need: 'a file another program changed while it has unsaved edits — «Reload from disk» / «Keep my changes» on the line (desktop-apps-30)',
    match: /^Another program changed this file on disk$/, door: { present: { marker: /door: 'disk-keep'/, surfaces: ['src/lib/code-editor.js'] } } },
  { id: 'hidden-only', need: 'a folder whose every entry is hidden — said, with «Show hidden files» on the line (phone-23)',
    match: /^This folder is empty — \{n\} hidden files$/, door: { present: { marker: /door: 'show-hidden'/, surfaces: ['src/lib/file-explorer.js'] } } },
  { id: 'mount-cache', need: 'a mount cache on a network filesystem — «Choose a cache folder…» (the setting) on the line',
    match: /^Cache on a network filesystem(: the home folder is not a persistent disk — the cache needs a persistent local folder| with no local disk to move it to — the cache needs a local folder)$/, door: { present: { marker: /settingsDoor\(this\.app, 'mounts\.vfsCacheRoot'/, surfaces: ['src/lib/sidebar-mounts.js'] } } },
  { id: 'claude-signup', need: 'no Claude account yet — «Sign up at claude.ai» on the line, never «ask your administrator» (agents-accounts-15 / first-run-6, M3)',
    match: /^No Claude account yet\?$/, door: { present: { marker: /data-door="claude-signup"/, surfaces: ['src/lib/signin-card.js'], shape: { html: 'data-door="claude-signup"' } } } },
  { id: 'company-admin', need: 'a company app\'s admin named ONLY beside a company preset of that kind (M3; plugins-integrations-20\'s clause)',
    match: /^This is a company app: its admin adds the address\.$/, door: { present: { marker: /if \(model\.who === 'preset'\) card\.appendChild\(el\('div', 'mounts-field-hint oauth-setup-refusal-admin'/, surfaces: ['src/lib/oauth-setup-card.js'], shape: { guard: 'model.who === \'preset\'' } }, via: { 'src/oauth-setup.js': 'src/lib/oauth-setup-card.js' } } },
  { id: 'composer-upload', need: 'chat-core-10 (no upload button in the desktop composer) — TAKEN OUT by 主开发 2026-11-13: not this lane\'s',
    match: /^Type a message\.\.\.$/, door: { none: 'taken out by 主开发 (2026-11-13): the desktop composer is not changed by this lane; files go in by drag, paste or the phone «+»' } },
  // ── pick 5: the last settings paths — each door on its line (the sentence keeps its state) ──
  { id: 'trace-switches', need: 'the action trace / keeping is off — «Turn on…» beside the words (the replay pane, the chat card, the profiles window)',
    match: /^Action trace is off$|^action trace is off$|^The action trace is off\.$|^Keeping is off$/, door: { present: { marker: { 'src/lib/browser-replay-window.js': /settingsDoor\(app, 'browser\.actionTrace'/, 'src/lib/browser-trace-view.js': /settingsDoor\((?:view && view\.app|app), 'browser\.(?:actionTrace|keepConversationBrowser)'/ }, surfaces: ['src/lib/browser-replay-window.js', 'src/lib/browser-trace-view.js'], shape: ['line', 'element'] }, via: { 'src/lib/browser-session-words.js': 'src/lib/browser-replay-window.js' } } },
  { id: 'reply-window', need: 'how long after the agent\'s message a plain reply is judged — its row\'s door on the note',
    match: /^A message with no quote and no thread that arrives after this agent's own message is judged once/, door: { present: { marker: /settingsDoor\([^;]{0,80}'channels\.replyInferHours'/, surfaces: ['src/lib/channel-filter-editor.js'] } } },
  // B-7aef (B-8703's remainder, 主开发 r2680 / r2686): the two doors whose helpers answered text only — each helper answers its words AND
  // its door as data, the caller draws it
  { id: 'channel-account-disabled', need: 'a disabled channel account refused a load or a send — «Enable this account», the channels panel\'s own one-press enable, as the refusal toast\'s action or beside its note (the hub\'s refusal carries the account\'s id)',
    match: /^This account is disabled — enable it to load or send here$/, door: { present: { marker: /accountEnableDoor\(/, surfaces: ['src/lib/channels-panel.js', 'src/lib/channel-window.js', 'src/lib/channel-thread-pane.js'], shape: [{ toast: true, words: 'routeErrorText(' }, { element: true, words: 'routeErrorText(' }] }, via: { 'src/lib/channel-words.js': ['src/lib/channels-panel.js', 'src/lib/channel-window.js', 'src/lib/channel-thread-pane.js'] } } },
  { id: 'proxy-password-in-profile', need: 'a profile\'s proxy address carries its password — «Move the password to the vault», the profile\'s own move (the hub moves the word into the vault: it never crosses the page, an address or a log — 主开发 r2686); the new-profile sheet never meets it (no saved profile); r2863: every person\'s road that meets the launch\'s refusal says it through browser-proxy-dialog.js sayProxyRefusal (the panel\'s Restart / a kept Resume, Browse yourself, the live view\'s Resume / Restart, the For-you Restart, a switch to another backend — r2927), the press aimed at the id the hub\'s answer carries; not a road: the chat card\'s Resume of the throwaway browser (an ephemeral profile holds no saved proxy)',
    match: /^Its proxy address carries its password, which is never used — move it to the vault first\.$/, door: { present: { marker: /t\('Move the password to the vault'\)/, surfaces: ['src/lib/browser-proxy-dialog.js', 'src/lib/browser-exit-dialog.js'], shape: [{ element: true, words: 'proxyWords(' }, { element: true, words: 'WORDS(' }, { toast: true, words: 'reason' }] }, via: { 'src/lib/browser-proxy-model.js': 'src/lib/browser-proxy-dialog.js', 'src/lib/browser-exit-words.js': 'src/lib/browser-exit-dialog.js' } } },
  { id: 'drafter-off', need: 'the rule drafter is switched off — the refusal toast\'s «Turn on…» (its row searched)',
    match: /^the drafter is switched off$/, door: { present: { marker: /openRow\('plugin\.llm\.learn'\)/, surfaces: ['src/lib/learn-card.js'], shape: 'toast' } } },
  { id: 'usage-refresh-off', need: 'usage refresh is off — the lapsed chip and the ⟳ toast open its setting',
    match: /^Usage refresh is off — click to turn it on|^Claude usage refresh is off$/, door: { present: { marker: /data-serve-setting="accounts\.onDemandQuotaRefresh"[\s\S]*settingsDoor\(this, 'accounts\.onDemandQuotaRefresh'/, surfaces: ['src/lib/manage-agents.js'], shape: [{ html: 'data-serve-setting=', key: '[data-serve-setting]' }, 'toast'] } } },
  { id: 'usage-reads-off-wait', need: 'usage reads are off and a walled conversation with no known reset waits for a person — its own chip says so and opens the setting (B-5279)',
    match: /^Usage reads are off$|^Usage reads are off, so this conversation continues when you resume it — press to open the setting\.$/, door: { present: { marker: /data-reads-off-door="1"[\s\S]*settingsDoor\(this\._app, 'accounts\.onDemandQuotaRefresh'\)/, surfaces: ['src/lib/chat-status-bar.js'], shape: [{ html: 'data-reads-off-door=', key: '[data-reads-off-door]' }] } } },
  { id: 'ship-logins', need: 'a stored login that cannot ship to a host — the toast\'s / the billing menu\'s «Ship subscription logins…» door',
    match: /runs on this machine only\. For \{host\}, use “Log in on host…” on the CLI-login row, or turn on “Ship subscription logins to remote hosts”\.$|^This stored login can’t ship to \{host\}\./, door: { present: { marker: /settingsDoor\(this, 'accounts\.shipSubscriptionToRemote'/, surfaces: ['src/lib/manage-agents.js', 'src/lib/session-lifecycle.js'], shape: ['toast', { beside: 'settings:accounts.shipSubscriptionToRemote' }] } } },
  { id: 'master-switch', need: 'the VibeSpace integration\'s master switch is off — «Turn on…» on its card',
    match: /^Disabled — its master switch is off$/, door: { present: { marker: /settingsDoor\(this, 'agents\.vibespaceIntegration'/, surfaces: ['src/lib/manage-agents.js'], shape: 'element' } } },
  { id: 'llm-stopped-model', need: 'the LLM plugin stopped on a plan / model refusal — its chip opens the plugin\'s settings (the judging model)',
    match: /^The LLM plugin stopped: .* Change the judging model in the plugin’s settings, or the key on its Integrations card\.$/, door: { present: { marker: /d\.stop\.why === 'plan' \|\| d\.stop\.why === 'shape'\)\) onChip = \(\) => this\._openPluginSettings\(p\.id\)/, surfaces: ['src/lib/plugins-ui.js'], shape: { chip: 'onChip' } } } },
  { id: 'plugin-service', need: 'a backend\'s background service is off / silent — the toast\'s «Turn on…» / «Plugins…» (the Plugins list)',
    match: /^The background service for \{name\} is off\.$|^The \{name\} background service has not answered yet\.$/, door: { present: { marker: /action: pluginsDoor\(this, \{ label: t\('Turn on…'\) \}\)[\s\S]*action: pluginsDoor\(this, \{ label: t\('Plugins…'\) \}\)/, surfaces: ['src/lib/plugins-ui.js'], shape: 'toast' } } },
  { id: 'job-notify', need: 'job auto-notify for this conversation — its setting\'s «Change…» on the hint',
    match: /Each Task Group can also set its own\.$/, door: { present: { marker: /settingsDoor\(app, 'agents\.jobNotify'/, surfaces: ['src/lib/session-props.js'], shape: 'element' } } },
  { id: 'sampling-off', need: 'a server profile refused: the sampler is off — the toast\'s «Turn on…»',
    match: /^The profile did not start: “Name the code that holds the server” is off\.$/, door: { present: { marker: /settingsDoor\(this, 'telemetry\.loopHoldSampling'/, surfaces: ['src/lib/setup-flows.js'], shape: 'toast' } } },
  { id: 'private-reply-urls', need: 'a pairing code that points at plain http — «Allow private reply URLs…» beside the refusal',
    match: /^The code points at a plain http address — pairing needs https, or private reply URLs allowed$/, door: { present: { marker: /settingsDoor\(app, 'webhook\.allowPrivateReplyUrl'/, surfaces: ['src/lib/channel-webhook.js'], shape: 'element' }, via: { 'src/lib/webhook-view.js': 'src/lib/channel-webhook.js' } } },
  { id: 'relay-page', need: 'the relay page is a setting of the account type — «Relay page setting…» on the setup card\'s rows that name it',
    match: /its address is this account type’s relay page setting\)\.$|register its address and set it as the relay page\.$|^Not set here: set it as the relay page to use it\.$/, door: { present: { marker: /settingsDoor\([^;]{0,90}`channels\.\$\{model\.kind\}RelayUrl`/, surfaces: ['src/lib/oauth-setup-card.js'], shape: 'element' }, via: { 'src/oauth-setup.js': 'src/lib/oauth-setup-card.js' } } },
  { id: 'push-steps', need: 'how to turn real-time push on — «Open its setup card…» on the steps line',
    match: /^How to turn it on: the account type’s setup card, under «Real-time push — optional»/, door: { present: { marker: /integrationDoor\([^;]{0,80}a\.kind, \{ label: t\('Open its setup card…'\)/, surfaces: ['src/lib/channels-panel.js'], shape: 'element' }, via: { 'src/channel-caps.js': 'src/lib/channels-panel.js' } } },
  { id: 'cli-check-off', need: 'the Claude Code check is turned off — the press\'s toast opens the switch the row declares',
    match: /^Checking a new Claude Code is turned off — those accounts wait until you update VibeSpace$/, door: { present: { marker: /settingsDoor\(app, checkRow\.checkOffSetting/, surfaces: ['src/lib/user-todos-actions.js'], shape: { toast: true, words: 'said.off' } }, via: { 'src/foryou-actions.js': 'src/lib/user-todos-actions.js' } } },
  { id: 'engine-fact', need: 'the default browser engine\'s plugin is missing / has no program — its door on the fact line',
    match: /^\{plugin\} · no program set \(its Program file setting\)$|^That browser engine plugin is not running on this computer\.$/, door: { present: { marker: /engineFactDoor\(r\)[\s\S]{0,200}pluginDoor\(this\.app, fd\.plugin/, surfaces: ['src/lib/settings-ui.js'], shape: 'element' }, via: { 'src/lib/browser-build-model.js': 'src/lib/settings-ui.js' } } },
  { id: 'pool-serve-lapsed', need: 'a pooled subscription that stopped serving — filed under For you\'s «accounts» bucket, whose door is Manage Agents (its row\'s Re-check / setting chip)',
    match: /'s subscription is no longer active \(since \{since\}\): the pool skips it/, door: { present: { marker: /if \(key === 'accounts'\) \{ close\(\); app\._showAgentsDialog/, surfaces: ['src/lib/user-todos-actions.js'], shape: { item: true, bucket: 'accounts' } }, via: { 'src/server/usage-pool-engine.js': 'src/lib/user-todos-actions.js' } } },
  // ── pick 6: the Outbox pointer's door (主开发's ruling on pick 5's report: a new For-you action type, open-outbox) ──
  // ── the verifier's list for picks 3–6: a live need a rewording had taken out of the net ──
  { id: 'overage-turns', need: 'automatic turns are refused while an account bills paid overage — «Allow automatic turns…» beside the Credits chip in the usage popup (the Spending row that allows them)',
    match: /^Automatic turns are refused on this account while it bills paid overage/, door: { present: { marker: /settingsDoor\(this, 'spend\.allowOverageTurns'[\s\S]*data-door="settings:spend\.allowOverageTurns"/, surfaces: ['src/lib/usage-meter.js'], shape: { html: 'data-door="settings:spend.allowOverageTurns"', key: '.usage-spend-door' } }, via: { 'src/lib/usage-source.js': 'src/lib/usage-meter.js' } } },
  { id: 'outbox-pointer', need: 'new messages awaiting approval on an account — «Open the Outbox» on the For-you item\'s line (the tray row and the For-you window), the door its registry row declares',
    match: /^Open the Outbox to approve, edit or reject\.$/, door: { present: { marker: { 'src/lib/user-todos-row.js': /const doorHtml = \(i, t\) => \{ const d = doorOf\(i\); return d \? `<div class="ut-exit-answer ut-door-answer"><button type="button" class="mounts-btn mounts-btn-primary need-door ut-door"[\s\S]*reconnectHtml\(i, t\) \+ doorHtml\(i, t\)/, 'src/lib/inbox-window.js': /door: \(it\) => \{ const d = doorOf\(it\)[\s\S]*door: doorOf\(it\),[\s\S]*if \(a === 'door'\) \{ model\.jump\(it\.sessionKey, it\); return; \}/ }, surfaces: ['src/lib/user-todos-row.js', 'src/lib/inbox-window.js'], shape: { item: true, opens: 'outbox' } }, via: { 'src/server/channels-outbound.js': ['src/lib/user-todos-row.js', 'src/lib/inbox-window.js'] } } },
  // B-8703 (主开发 r4450): the long-lived token identity check's four items — each answered in THAT account's long-lived token dialog
  { id: 'oat-token-check', need: 'a long-lived token whose identity the check doubts (another account\'s, unverified, looks like another\'s, its window moved) — «Long-lived token…» on the For-you item\'s line (the tray row and the For-you window), the door its registry row declares: that account\'s dialog',
    match: /^A long-lived token (belongs to another account and bills that account|is unverified: its usage window can no longer say whose it is|looks like another account’s) — |^An account’s usage window moved away from the one its long-lived token was confirmed with — /, door: { present: { marker: { 'src/lib/user-todos-row.js': /const doorHtml = \(i, t\) => \{ const d = doorOf\(i\); return d \? `<div class="ut-exit-answer ut-door-answer"><button type="button" class="mounts-btn mounts-btn-primary need-door ut-door"[\s\S]*reconnectHtml\(i, t\) \+ doorHtml\(i, t\)/, 'src/lib/inbox-window.js': /door: \(it\) => \{ const d = doorOf\(it\)[\s\S]*door: doorOf\(it\),[\s\S]*if \(a === 'door'\) \{ model\.jump\(it\.sessionKey, it\); return; \}/ }, surfaces: ['src/lib/user-todos-row.js', 'src/lib/inbox-window.js'], shape: { item: true, opens: 'oat' } }, via: { 'src/server/oat-identity.js': ['src/lib/user-todos-row.js', 'src/lib/inbox-window.js'] } } },
  // ── the restack for 2.369.412 (lane bl-accounts' hand): the release's own sentences this net met on 2.369.410 ──
  { id: 'mounts-rclone', need: 'the storage helper (rclone) missing on the hub — «Install rclone» on the same card (ui-phone-and-fit put the card\'s words in the person\'s language on 2.369.410)',
    match: /^One-time setup needed$|^Connecting storage needs a small helper tool\. Install it here — no terminal required\.$/, door: { present: { marker: /api\('\/api\/mounts\/rclone\/install'/, surfaces: ['src/lib/sidebar-mounts.js'], shape: 'element' } } },
  { id: 'handover-cap-unset', need: 'B-0a33 (2.369.410): a hand-over refused because no limit is set for turns nobody typed — «Open Settings → Spending» on the refusal\'s toast (the Spending section selected). Its words named the path as the release shipped them (主开发\'s ruling (a) at the restack for 2.369.412); B-d073 took the path out — the row\'s link in the words, the toast\'s door beside them',
    match: /^Not handed over — no limit is set for turns nobody typed on (?:\{account\}|this instance): set a number in its row: \{link\}\. The notices keep waiting\.$/, door: { present: { marker: /w\.door === 'spending' && settings && typeof settings\.open === 'function' \? \{ label: t\('Open Settings → Spending'\)/, surfaces: ['src/lib/stash-strip.js'], shape: { toast: true, words: 'w.text' } }, via: { 'src/stash-summary.js': 'src/lib/stash-strip.js' } } },
  // ── the move onto 2.369.412's checkpoint (主开发 2026-11-19 00:44Z): a need WITH its door present — the row's LINK in the words ──
  { id: 'resume-batch-cap', need: 'a resume of stopped sessions refused by a spend ceiling — the row it names, as its LINK on the refusal\'s own line (lane auto-resume-bulk / lg-recovery: a refusal names where its value changes; B-d073 took the menu path out of the words — the link is the whole door)',
    match: /^Change «\{setting\}»: \{link\}$|^\{member\} can take \{left\} more turns nobody typed (?:this hour|today); this batch needs \{need\}\.$|^This VibeSpace can take \{left\} more turns nobody typed today; this batch needs \{need\}\.$/,
    door: { present: { marker: /link: spendRowLink\(\{ why \}\)/, surfaces: ['src/lib/bulk-resume.js'], shape: { link: 'toastWordsInto', words: 'batchRefusalWords(' } } } },
  // ── the chat status strip's step two (lane mask-value-shape): a tool that did not start, said in plain words where the
  //    conversation's start facts live (Session Properties «At its start», ⚙ Diagnostics «Tools that did not start») ──
  { id: 'start-tool-failed', need: 'a tool of the conversation (an MCP server, a plugin) failed to start or waits for a sign-in — said by what it is, beside the protocol row',
    match: /^The \{name\} plugin isn’t working: it failed to load when this conversation started\.$|^The \{name\} tool needs you to sign in before the agent can use it\.$|^The \{name\} tool isn’t connected: it failed when this conversation started, so the agent can’t use it\.$/,
    door: { none: 'the act is the agent CLI\'s own (its MCP / plugin configuration and its sign-in, which the CLI runs); VibeSpace starts none of these tools, so no door here could do it — the words name WHICH tool, the row beside them the CLI\'s own record' } },
]);
/** The net's catches that state no need with a missing door — each with its reason. */
const NOT_NEEDS = Object.freeze([
  { why: 'r3244 (lane lg-group-parents): an outcome of the migration ledger\'s unread read, said in its For-you item — nothing to press: the next start reads it again by itself (the item closes then); torn bytes say their own way out in the line beside it', match: /^Reading it failed \(\{error\}\); it is read again at the next start\.$/ },
  { why: 'B-f276 family (r3168 — login-request-card\'s words, the table of held codes in src/lib/utils.js): the automation store\'s held refusal — it reads again by itself; its door is the Vault window\'s own line for the held keys (src/lib/vault-window.js); r3314: the lane\'s new words (r3285) ask nothing of the person', match: /^Automation keys can't be read right now\. Nothing was lost or changed, and no key works until they read again\./ },
  { why: 'an OUTCOME said where the person reads a machine\'s CLI settings (r3064, lane bl-scratch): the helper\'s own failure on that machine, its message beside it — the machine card\'s Install / Reinstall and the settings window\'s «Check machines…» on the same rows are its doors', match: /^the helper failed$/ },
  { why: 'a synced list lifted from TORN bytes (lane lg-recovery, 主开发 r3262 / r3271): said ONCE at the lift — an outcome (the file was damaged), where its damaged bytes are kept, and the two ways a person has, both their own (add again what is missing where they add it; mend the file by hand and restart) — no door of the page could do either; never «restore that copy»', match: /^\{list\} could not be read: the file was damaged\. Its damaged bytes are kept aside as \{name\} in VibeSpace’s data folder\./ },
  { why: 'a paste\'s failure said at the paste (r1066): the screen\'s clipboard could not be opened, did not take the picture, or could not be asked — an outcome; pasting again is the way — except on a hub with NO display at all, where every paste ends at «could not be opened» (a screen it does not have: no door here)', match: /^Paste failed: (the clipboard (of the screen VibeSpace runs on could not be opened|did not take the picture)|could not ask the clipboard — paste again)$/ },
  { why: 'a mount door\'s refusal or row words, worded by code (src/mount-error-words.js, B-af94): said AT the door the person used — the storage or machine row, the dialog that asked, its toast — and that door is its way out (the dialog\'s own fields, Remount, Re-authorize, Connect)', match: oneOf(MOUNT_REFUSALS) },
  { why: 'says what is NOT needed («no terminal needed») — the Connect button it names is on the same form, above the box (pick 4, storage-1)', match: /^press “Connect[^”]*” — no terminal needed$/ },
  { why: 'an OUTCOME said where the person reads this machine\'s CLI settings (r3462, lane bl-scratch): the helper\'s read of a settings file failed — the line is the state, the next look reads again', match: /^not known now — the read of the file failed$/ },
  { why: 'the need\'s own fields are under it on the same form (the client id and secret boxes) — the form is its door', match: /^Gmail needs your own OAuth client here \(with the gmail\.readonly scope\)\.$/ },
  { why: 'B-bcf8 (主开发 r4256 (3), r4297\'s must): the live view\'s still-picture line names the door that works from where the person stands — while they DRIVE, the tab\'s own chip above («Bring this tab to the front of its window»: src/lib/browser-live-window.js clickOf answers front only then, and the line asks that same verdict); while they only WATCH, the bar\'s own Take over first, then that chip — each named ONLY where the view draws it (r4334: the chip in the tab row above, the row drawn and the chip not folded; Take over on the bar), else the fact alone. No new control', match: /^VibeSpace could not bring this page back to the front\. (Click its tab above|Take over, then click its tab above) to bring it forward\.$/ },
  { why: 'inside Settings: a row\'s own description naming another row of the same window (no door is owed — it is on that page)', match: oneOf(INSIDE_SETTINGS) },
  { why: 'a MACHINE\'s own operating-system settings path (Windows / macOS) — lane machine-needs-at-pairing\'s table claims it (src/machine-needs.js, its doors)', match: oneOf(MACHINE_OS) },  { why: "a door's own label naming where it opens", match: oneOf(PATHS_LABEL) },
  { why: "a path in the vendor's own console — VibeSpace draws nothing there", match: oneOf(PATHS_VENDOR) },
  { why: 'provenance: the setting a value comes from, said on the control or info line that shows the value (a fact, not a need)', match: oneOf(PATHS_PROVENANCE) },
  { why: '«also in …»: the second place the same switch is drawn', match: oneOf(PATHS_ALSO) },
  { why: "the plugin migration's one-shot notices: where a moved row now lives (matched by shape: test-architecture §106 keeps that backend's name out of src)", match: new RegExp([oneOf(PATHS_MIGRATION).source, ...PATHS_LEFT_SHAPES.map((r) => r.source)].join('|')) },
  { why: 'a direction that is true on its surface: the control it names is drawn on that side in the same dialog / list', match: oneOf(DIRECTIONS_TRUE) },
  { why: 'names a table row or a parent folder, not a control — no door is owed', match: oneOf(DIRECTIONS_ROWS) },
  { why: "a step on the vendor's own page — VibeSpace draws no control there", match: oneOf(DIRECTIONS_VENDOR) },
  { why: 'a consent prompt saying where its switch lives LATER — nothing is needed now; the prompt\'s own buttons are the act', match: /^Stops as soon as you disable it in ⚙ → Plugins, and VibeSpace stops it by itself|^Running sessions do not need it\. You will only be asked once — ⚙ → Plugins can turn it on later\.$/ },
  { why: 'inside the static Diagnostics report page (a blob page holds no door to the app; the same switch has its door in Settings)', match: /^Sampling is off in Settings — the holds are still measured\.$/ },
  { why: 'inside the static Diagnostics report page (2.369.407, the main loop held by day and hour): the hourly table\'s own description — «need not agree» says two measures differ, it states no need', match: /^What the server writes to its journal once an hour, newest first — the last 24 hours, kept until it restarts\. Engines are each future owner’s share of the busy time OUTSIDE holds \(a file that holds two owners’ work today is a bucket of its own, marked «\*»\) — the held time is named by the holds, under «total held»; each share is rounded on its own, so they add to 100 % only up to rounding\. The busy share is the runtime’s own measure and the busy ticks are the census’s: two instruments, which need not agree\. Memory is the server’s own, then its processes by kind; an idle conversation’s age is read from its output file, so it survives a restart — a read that ran out of time shows «\?» with how many it read\.$/ },   // the WHOLE text, start to end: a need sentence added to it later is not claimed by this row
  { why: "the vendor's own workspace admin (Slack approves an app per workspace) — not an assumption about this install", match: oneOf(COMPANY_VENDOR) },
  // the restack for 2.369.412 (lane bl-accounts' hand): B-a470's quoted failure, and two sentences B-bd27's narrower machine rows hand to this table
  { why: 'B-a470 (2.369.410): an engine plugin\'s OWN probe error, quoted and never translated — the sentence reports the failure and asks nothing of a person', match: /^\{plugin\} · its plugin failed: \{what\}$/ },
  { why: 'the VibeSpace image\'s own strace (the hub\'s system — B-bd27\'s hub-machine row is a «none» for those tools): the next image brings a newer one, nothing to press or install', match: /^this VibeSpace image’s strace is older than 6\.6, and the check needs one that takes everything it traces with it/ },
  { why: 'a setting\'s own description: what its recording takes (30 fps WebM, agent-browser at or above its floor), said before it is turned on — a fact of the setting, not a need left without a door', match: /^Record this profile's screen \(30 fps WebM, needs agent-browser ≥ \{floor\}\) whenever its browser is live/ },
  // the move onto 2.369.412's checkpoint 8f96c01eb (-moved2, lane bl-accounts' hand): the checkpoint's own sentences this net met, each judged
  { why: 'the answer to the person\'s own press (the session list\'s ⋯ menu, auto-continue for the stopped sessions): it says what the press did', match: /^Auto-continue is off for \{n\} sessions$/ },
  { why: 'the auto-continue chip\'s own title: the chip it titles is its door (a press turns it on)', match: /^Auto-continue is off: this session waits for you — click to have it continue by itself when its limit resets$/ },
  { why: 'inside Settings: Claude\'s usage-refresh row\'s own description (usage-predict) — a sentence per choice, no door owed', match: /^Reads each Claude account’s limits from Anthropic — the only source of model-scoped weekly limits like Fable/ },
  { why: 'the sign-in-off row\'s own words: its door «Set password…» is the control of the same row (settings-ui _renderSpendSignInOff)', match: /^Sign-in is off: anything that can reach VibeSpace can change these limits\. Set a password so only you can\.$/ },
  { why: 'provenance: Session Properties\' CPU-priority fact line says where its value comes from (B-460d) — the server\'s own, or (block line 346, r2199) the machine\'s own for a conversation on another machine, a joined terminal\'s too: each NAMES WHERE the setting lives (Settings) and sends nobody to a door that does not exist — a fact, not a need', match: /^(?:The server’s own — lowering it is off in Settings|Its machine’s own — lowering it is off in Settings|Its machine’s own when this terminal started its shell — lowering it is off in Settings; a terminal that joined a shell already running keeps that shell’s)$/ },
  { why: 'a direction true on its surface: the field it names is drawn right below it, in the same box', match: /^No website login is saved yet — type this one below\.$/ },
  { why: 'a direction true on its surface: the field it names is drawn right below it, in the same box', match: /^The saved logins could not be read — try again, or type this one below\.$/ },
  { why: 'a confirm dialog\'s consequence: its own button is the act', match: /^The value leaves the vault\. The conversation that stored it can no longer use it/ },
  { why: 'the answer to the person\'s own Test press (lg-providers): what the provider lacks, said in the form the person is filling', match: /^This provider does not offer what \{harness\} needs$/ },
  { why: 'the answer to the person\'s own Test press (lg-providers): what the provider lacks, said in the form the person is filling', match: /^This provider does not offer what this agent needs$/ },
  { why: 'the answer to the person\'s own Test press (lg-providers): what the provider lacks, said in the form the person is filling', match: /^This provider does not serve the model, or not what this agent needs$/ },
  { why: 'B-69ec\'s remote refusal, inside the CLI-missing dialog, which draws its own doors', match: /^Nothing was started\. The alias for \{cli\} in the \{shell\} of \{machine\} names \{path\}, which is missing\.$/ },
  { why: 'setting-doors\' card: its words are the link to the row they name (whyLink)', match: /^A raise needs its «until» — change it on the row$/ },
  { why: 'setting-doors\' card: its words are the link to the row they name (whyLink)', match: /^\{value\} would stay above \{back\}, the value before the hold — a raise needs its «until»; change it on the row$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: the login form\'s own check — its two fields are on the same form, the form is its door', match: /^A new login needs its user name and its password\.$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: the answer to the person\'s own Check press, on the row that holds Check', match: /^The exit could not be checked — the server failed; try again\.$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: the refusal names its own door — «Set up the vault…» is drawn beside it (say(text, \'setup\'))', match: /^The vault is not set up yet — press Set up the vault…, then try again\.$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: the exit dialog\'s fact: its door is the footer\'s «Type it by hand» button (browser-exit-dialog), in the same dialog', match: /^This profile attaches to a browser VibeSpace does not start — that browser leaves by its own settings, so a check here could state an exit it does not use\. Type the exit by hand if a plugin needs it\.$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: the exit dialog\'s fact: its door is the footer\'s «Type it by hand» button (browser-exit-dialog), in the same dialog', match: /^This profile has no proxy of its own — its browser may leave by another road, so a check here could state an exit it does not use\. Type the exit by hand if a plugin needs it\.$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: a direction true on its surface: the login choice is drawn below it in the same dialog', match: /^A proxy's user name and password go in the vault — give the address alone, then choose its login below\.$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: a direction true on its surface: the press it names is drawn below it in the same note', match: /^Its saved proxy address carries its password, which is never used\. The press below moves that password into the vault in one step — the profile keeps the address and that login\. Or give the address here and choose its login\.$/ },
  { why: 'B-8b87 (the profile proxy) on 2.369.412\'s checkpoint d87ad011f: a direction true on its surface: the field and Check are the exit row\'s own, above the line', match: /^Type the exit by hand, or give another check address in the field above and press Check\.$/ },
  // ui-plain-words' move onto 2.369.412's checkpoint 500911fd9 (-moved3, lane bl-accounts): the unit's own sentences this net met, each judged
  { why: 'ui-plain-words (storage-3): a direction true on its surface — the machine picker is drawn above the path field, in the same dialog, before a machine is picked', match: /^the machine you pick above$|^On the machine you pick above:$/ },
  { why: 'ui-plain-words (vault, with B-bc3b\'s two branches): a direction true on its surface — the hosts it names are listed right below the hint, in the same row', match: /^Its agents use it for the hosts below without asking you each time, and never see the secret itself\. Another host, or a command that could go anywhere(?:, is refused: an agent's own value goes only where you say| \(a shell, a script\), still asks you)\.$/ },
  { why: 'inside Settings: the LLM plugin\'s attention row\'s own description (ui-plain-words\' words) naming its own draft button, drawn below it in the same row — no door is owed', match: /^In your own words \(at most 1,500 characters\), what the judging model should pick out for you — it reads it as written\./ },
  { why: 'ui-plain-words (the dial picker): a connected address\'s history — the attempts that failed BEFORE it connected; it is connected now, nothing is needed', match: /^Before that, \{n\} attempts failed \(\{reason\}\)$/ },
  { why: 'ui-plain-words (session-props, with ui-needs-a-button pick 5\'s door): the on-state of a conversation\'s job notices — «need input» is the JOBS\' need, said as a fact; the «Change…» door that switches it is on the same line', match: /^Background jobs tell this conversation when they finish or need input\.$/ },
  // the automation store's next touch (login-request-card): the Vault window's line for TORN automation keys — its way out IS this sentence (the hand-mending, then the restart), said where the person reads the hold; the ONE table's words beside it
  { why: 'the Vault window\'s own line after the ONE table\'s held words for automation keys whose saved list is TORN: the way out (mend it by hand, then restart) is this sentence itself — no button can mend bytes', match: /^The saved list is damaged; it needs mending by hand, then a restart\.$/ },
  // B-e3fe follow-up: «Set it aside»'s failure toast — said where the press was made; the door is the item's own button on that row
  { why: 'a press\'s own failure toast (the unreadable record of waiting messages): the «Set it aside» button it answers stays on the For-you item, its door', match: /^Could not set the file aside$/ },
  { why: 'the For-you item\'s own words for an account whose usage file started again after damaged bytes (r3285): its way out IS this sentence — the account\'s refresh in Accounts, the door the person already has; the item resolves at that reading', match: /^Refresh this account's usage \(its refresh in Accounts\): the first whole reading ends the wait\./ },
  { why: 'a press\'s own failure toast (an account\'s unreadable usage file, r3136 / r3200): the «Set it aside» button it answers stays on the For-you item, its door', match: /^Could not set the usage file aside$/ },
  { why: 'the manager stack\'s piece 7 (deliveries resume their addressee): the reason a delivery did not resume an ended conversation, inside that row\'s «— not resumed: …» line (src/lib/wake-grant-rows.js refusalWords) — the ended row\'s own Resume is its door', match: /^the resume failed$/ },
  // B-3b03 follow-up (lane hub-loop-stalls): a chat upload's outcome — what landed, and the hub's own reason for the rest
  { why: 'B-3b03 follow-up: an upload\'s outcome said after the press — what landed and the hub\'s own reason for the rest (a refusal: «the file readers are restarting — try again in a moment»); its door is the same upload, pressed again', match: /^Uploaded \{n\}, \{failed\} not uploaded: \{msg\} \(e\.g\. \{name\}\)$/ },
  // B-23e5 r2198 law 8: the Ctrl+G pane's refused load (src/lib/external-editor.js) — said on the pane's own path line, its one door beside it
  { why: 'B-23e5 r2198 law 8: the Ctrl+G pane\'s refused load, said on the pane\'s path line with its one door beside it — «Close editor» hands the terminal back and writes nothing over the file; the next edit from the terminal opens it again', match: /^Failed to load \{path\}: \{why\}$/ },
]);
/** THE DOORS OWED (主开发's ruling (a), 2026-11-18 23:33Z; their own heading at 2026-11-19 00:44Z): a sentence that sends a person down
 *  a menu path where a door ON ITS LINE is owed. B-d073 built the four its family held (bulk-resume's Close toast and hint, the
 *  Integrations window's two Test lines): its ceiling is 0. B-8703 unit 1 (主开发 r533, 2026-11-20): the path net's two holes closed
 *  (the gear «⚙ →» — `\b⚙` could never match — and the three-dot menu «⋯ →» / «⋯ menu» / «in ⋯») and the zh / ja net over each
 *  VALUE whose English form the nets miss (VALUE_NET) newly catch the sentences below — each LISTED here with its file, so the net is
 *  honest and red on one more; unit 2 makes each a door where a helper that exists makes it one line, the rest keep their row with
 *  the reason. B-7aef: a Settings row's description now carries a door (settings-schema `door`, settings-ui SETTINGS_DOORS) — the
 *  Diagnostics report's and Customize mode's rows left the list. Each family's count only falls (test-needs-doors). */
const DOORS_OWED = Object.freeze([
  { family: 'B-8703', why: 'src/lib/settings-schema.js: KEPT (B-8703 unit 2) — a Settings row\'s own description of a window\'s menu item («Show window frame» on another surface) — a Settings row has a door slot now (B-7aef: a schema row\'s `door`), but this command acts on ONE window (its own ⋯ menu) and Settings has no window to aim it at', match: /^An app that draws its own title bar \(GTK header bars, e\./ },
  { family: 'B-8703', why: 'src/lib/settings-schema.js: KEPT (B-8703 unit 2) — a Settings row\'s own description of a window\'s menu item («Scale» on another surface) — a Settings row has a door slot now (B-7aef: a schema row\'s `door`), but this command acts on ONE window (its own ⋯ menu) and Settings has no window to aim it at', match: /^How large a desktop application draws itself, for sharp / },
  { family: 'B-8703', why: 'src/lib/channel-webhook.js: KEPT (B-8703 unit 2) — a path on ANOTHER VibeSpace (where the pairing code is pasted) — no control of this instance can stand there', match: /^Shown once — paste it on the other VibeSpace: Channels →/ },
]);
const owedOf = (sentence) => DOORS_OWED.find((r) => r.match.test(String(sentence))) || null;
const needOf = (sentence) => NEEDS.find((r) => r.match.test(String(sentence))) || null;
const notNeedOf = (sentence) => NOT_NEEDS.find((r) => r.match.test(String(sentence))) || null;
/** The census's net (the words a person reads — every t() / tr() / i18nKey() literal). */
const NET = Object.freeze({
  // B-8703: `\b⚙` could never match (JS \b is ASCII: no word boundary before a symbol) — the gear and the three-dot menu in every
  // spelling the tree uses («⚙ →», «⋯ →», «⋯ menu», «in ⋯»)
  path: /(?:\bSettings|⚙)\s*(→|›|▸)|(→|›|▸)\s*(Integrations|Plugins|Settings|Channels)\b|\bin Settings\b|⋯\s*(→|›|▸)|⋯ menu\b|\bin ⋯(?=$|[\s.,;:)—])|Services › Integrations/,
  direction: /\b(click|press|tap|pick|choose|use|paste|type|fill|enter|select|tick|open|sign in|add one|connect)\b[^.;—]{0,60}\b(below|above)\b|[“"«][^”"»]{2,40}[”"»]\s*(button\s+)?(below|above)\b|\b(button|switch|box|field|link|row|code|token|folder|address) (below|above)\b/i,
  company: /\byour company\b|\bcompany uses\b|\b(ask|contact) your admin(istrator)?\b|\bask your administrator\b/i,
  // reader follow-up #5 — THE NEED WORDS: a sentence that says something failed / is needed / is off / is not set / is missing
  // (or asks to turn it on) — the walk's own pattern, which the three nets above could not see. A catch is a ROW, a NOT_NEED with
  // its reason, or an entry of the frozen NEED_DEBT (scripts/fixtures/need-debt.json) — never silent
  need: /\b(failed|fails)\b|\bneeds?\b|\bneeded\b|\brequired\b|\b(is|are) (turned |switched )?off\b|\bnot (set|configured)\b|\bmissing\b|\bturn (it|them|this) on\b/i,
});
// THE NEED DEBT (reader follow-up #5) — every sentence this net caught when it landed that no row claims — is the suite's frozen
// list, scripts/fixtures/need-debt.json (out of src: its sentences would read as surfaces to the tree's other censuses)
const LISTED = new RegExp(NEEDS.map((r) => r.match.source).join('|'));
const inNet = (s) => { const x = String(s); return NET.path.test(x) || NET.direction.test(x) || NET.company.test(x) || LISTED.test(x); };
/** B-8703 (the verifier's M5): THE ZH / JA NET — read by test-needs-doors over each dictionary VALUE whose English form the nets
 *  above miss: a menu path or a direction to a control said only in a translation is caught too, and claimed by its English form's
 *  row (a value is the same sentence). [path, direction] per language; ja «上の / 下の» only after a sentence's start or its
 *  punctuation («マシン上のフォルダー» is «on the machine», no direction), «以上の / 以下の» before a control's word anywhere (B-8703
 *  unit 2's read: a ja value kept «以下のオプション» after its English lost «below»). PURE: regexes only — the census does the reading. */
const VALUE_NET = Object.freeze({
  zh: Object.freeze([/(设置|⚙)\s*(→|›|▸)|(→|›|▸)\s*(集成|插件|设置|频道)|⋯\s*(菜单|→)|在\s*⋯\s*(里|中)/, /(上面|下面|上方|下方)(的|这|那)?[^，。；—]{0,12}(按钮|开关|框|字段|链接|代码|令牌|文件夹|地址)/]),
  ja: Object.freeze([/(設定|⚙)\s*(→|›|▸)|(→|›|▸)\s*(連携|プラグイン|設定|チャンネル)|⋯\s*(メニュー|→)/, /(?:^|[、。（(—「]\s*)(?:上|下)の(?:「|[^、。；—]{0,14}(?:ボタン|スイッチ|欄|フィールド|リンク|コード|トークン|フォルダー|アドレス))|以(?:上|下)の[^、。；—]{0,14}(?:オプション|スイッチ|ボタン|欄|フィールド|リンク|コード|トークン|フォルダー|アドレス|設定|項目)/]),
});
module.exports = { NEEDS, NOT_NEEDS, DOORS_OWED, NET, VALUE_NET, needOf, notNeedOf, owedOf, inNet };
