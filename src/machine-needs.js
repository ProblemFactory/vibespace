'use strict';
/**
 * THE MACHINE NEEDS CENSUS (lane machine-needs-at-pairing pick 2; 主开发's law 1 — the owner 2026-11-13: «这种需要 vnc 啊，需要 ffmpeg
 * 之类的事情不能在安装的时候自动解决吗？»). Every sentence that tells a person a MACHINE needs something (a program, a setting, a version)
 * is claimed by ONE row here: the need, its platforms, WHO can meet it, and its DOOR.
 *   kind  a = a program with no rights · b = a program + the machine's own prompt (UAC / sudo / its password dialog) ·
 *         c = only the person's switch in that machine's settings · - = nothing can meet it (an edition, a product gap)
 *   door  { present: { marker, surfaces } } — every surface that states the need draws its door (`marker` — one regex, or one per
 *         surface file — is in its source); the
 *         words of a PURE model are drawn by `via[model]` · { none: why } · { deferred: 'machine-needs · B-bd27' } (a door owed by a
 *         later lane — RETIRED by B-bd27 on 2.369.408: every row has its door or its NONE, and the suite reds on a deferred row)
 *   match the sentences of the need (a regex over the words a person reads)
 * NOT_NEEDS = the sentences the census's net catches that state no need of a machine (descriptions of a setting, an outcome on a
 * door that exists, a session's own login) — each with its reason. scripts/test-machine-needs.mjs derives the sentences from the
 * tree (every t() key in the dictionary, through the net — never a hand list), PRINTS the census, and is RED on a sentence no row
 * and no non-need claims, and on a surface that states a present-door need without its door. PURE (no imports).
 * WHAT IT IS — A NET, NOT A PROOF (the reader's item 8, measured by a plant: int359 acc-399 mn2 plant-census): it reads the words a
 * person reads (t() / tr() / i18nKey() literals) that carry a MACHINE word AND a NEED word (NET below). IT CANNOT SEE a need worded
 * past those words («the Frobnicator is missing on {machine}», «get it onto that PC first»), nor A DEVICE'S OWN REFUSAL STRINGS — an
 * agent's English error shown as it came (never a t() literal), nor a need said only in a log line. Those reach a person through
 * the refusal's own words; a lane that adds such a need adds its row by hand.
 */
const DEFERRED = 'machine-needs · B-bd27';
const NEEDS = Object.freeze([
  // FIRST: a sentence that says the machine's AGENT is too old belongs here, whatever feature it names (an older agent is its own need)
  { id: 'agent-version', need: 'the device agent\'s version (an older agent cannot do it yet)', platforms: ['win32', 'darwin', 'linux'], kind: 'a',
    match: /^(?!Re-pairing this machine from its Machines card)[\s\S]*(too old|agent updated|rerun the (device's )?install command|or later|reconnect it to upgrade|reconnect the machine to upgrade|updates itself)/, // the Machines card's re-pairing says what that door does (a non-need below)
    // B-bd27 X1: «Update its agent…» (src/lib/agent-update-door.js) — the machine's pairing sheet (its command, run again, installs
    // the agent anew; the hub's signed update rides every connection), or Manage agents › Machines for a machine with no sheet
    door: { present: { marker: /agentUpdateDoor\(|agentUpdateAction\(|fsErrorAction\(/, surfaces: ['src/lib/desktop-app-launcher.js', 'src/lib/exit-runs-dialog.js', 'src/lib/file-explorer-ops.js', 'src/lib/machine-app.js', 'src/lib/machine-desktop-handover.js', 'src/lib/machine-desktop.js', 'src/lib/remoteapp-card.js', 'src/lib/stream-mic-strip.js', 'src/lib/app-install-dialog.js'] } } },
  { id: 'tightvnc', need: 'TightVNC Server 2.8.85 — a Windows machine\'s whole desktop', platforms: ['win32'], kind: 'b',
    match: /TightVNC/, door: { present: { marker: /installDoor\(|showInstallDialog\(/, surfaces: ['src/lib/machine-desktop.js', 'src/lib/desktop-app-launcher.js'] } } },
  { id: 'ffmpeg', need: 'ffmpeg 7 or newer with ddagrab and an H.264 rung; libopus; an Opus decoder — the stream, the sound, the voice', platforms: ['win32'], kind: 'a',
    match: /ffmpeg|H\.264 encoder/, door: { present: { marker: /ffmpegDoor\(|ffmpegNeedCode\(/, surfaces: ['src/lib/machine-desktop.js', 'src/lib/machine-app.js', 'src/lib/stream-mic-strip.js'] }, via: { 'src/mic-model.js': 'src/lib/stream-mic-strip.js', 'src/sound-model.js': 'src/lib/stream-mic-strip.js' } } },
  { id: 'virtual-mic', need: 'a virtual microphone (VB-CABLE on Windows, BlackHole 2ch on a Mac)', platforms: ['win32', 'darwin'], kind: 'b',
    match: /virtual microphone|too old for the microphone|This stream has no microphone/, door: { present: { marker: /installDoor\(|install\('virtual-mic'\)|showInstallDialog\(/, surfaces: ['src/lib/machine-desktop.js', 'src/lib/stream-mic-strip.js', 'src/lib/desktop-app-launcher.js'] } } },
  { id: 'vbcable-off', need: 'VB-CABLE\'s devices turned on in Windows\' sound settings', platforms: ['win32'], kind: 'c',
    match: /turned off in Windows/, door: { present: { marker: /settingsDoor\([^)]*'sound'/, surfaces: ['src/lib/stream-mic-strip.js'] }, via: { 'src/mic-model.js': 'src/lib/stream-mic-strip.js' } } },
  { id: 'remote-desktop', need: 'Remote Desktop on (Windows Pro / Enterprise) and RemoteApp\'s sign-in + certificate', platforms: ['win32'], kind: 'c',
    match: /Remote Desktop|RemoteApp|Windows edition|Windows Home|What \{machine\} needs/, door: { present: { marker: { 'src/lib/machine-desktop.js': /openRemoteappSettings\(app, m\)/, 'src/lib/remoteapp-card.js': /settingsDoor\([^)]*'remotedesktop'/ }, surfaces: ['src/lib/machine-desktop.js', 'src/lib/remoteapp-card.js'] } } },
  { id: 'mac-screen-sharing', need: 'Screen Sharing on, with «VNC viewers may control screen with password» — a Mac\'s whole desktop', platforms: ['darwin'], kind: 'c',
    match: /Screen Sharing/, door: { present: { marker: /settingsDoor\([^)]*'sharing'/, surfaces: ['src/lib/machine-desktop.js'] } } },
  { id: 'mac-permissions', need: 'Screen & System Audio Recording and Accessibility for vibespace-screen', platforms: ['darwin'], kind: 'c',
    match: /Screen Recording|Screen & System Audio|Accessibility is off|vibespace-screen/, door: { present: { marker: /showTcc\(|settingsDoor\(|onNeed\?\.\(/, surfaces: ['src/lib/machine-desktop.js', 'src/lib/machine-app.js', 'src/lib/stream-mic-strip.js'] }, via: { 'src/sound-model.js': 'src/lib/stream-mic-strip.js' } } },
  { id: 'mac-helper', need: 'the screen helper — the hub\'s signed prebuilt, or the Command Line Tools to build it', platforms: ['darwin'], kind: 'b',
    match: /Command Line Tools|xcode-select|screen helper yet/, door: { present: { marker: /'clt'/, surfaces: ['src/lib/machine-desktop.js', 'src/lib/machine-app.js'] } } },
  { id: 'xpra', need: 'xpra 6.x — a Linux machine\'s desktop apps', platforms: ['linux'], kind: 'b',
    match: /xpra/, door: { present: { marker: /showInstallDialog\(/, surfaces: ['src/lib/desktop-app-launcher.js'] } } },
  { id: 'libreoffice', need: 'LibreOffice and its look-alike fonts', platforms: ['linux'], kind: 'b',
    match: /LibreOffice|look-alike fonts/, door: { present: { marker: /showInstallDialog\(/, surfaces: ['src/lib/desktop-app-launcher.js'] } } },
  { id: 'sudo-apt', need: 'passwordless sudo / apt-get for an unattended install', platforms: ['linux'], kind: 'b',
    match: /passwordless sudo|apt-get/, door: { none: 'the commands are shown to run by hand: they need the person\'s own password; VibeSpace drives apt only' } },
  { id: 'pairing-curl', need: 'curl or wget, to pair a Linux machine', platforms: ['linux'], kind: 'b',
    match: /needs curl/i, door: { none: 'said before pairing — the machine is not paired yet, so nothing can open a door on it' } },
  { id: 'posix-shell', need: 'a POSIX shell for some file operations on Windows', platforms: ['win32'], kind: '-',
    match: /POSIX shell/, door: { none: 'a product gap — not offered on Windows yet' } },
  // r1066 (lane bl-proposals): a picture pasted into a terminal reaches the CLI through the clipboard of the machine VibeSpace runs on
  { id: 'clipboard-program', need: 'a clipboard program (xclip) on the machine VibeSpace runs on — a picture pasted into a terminal conversation goes through it', platforms: ['linux'], kind: 'b',
    match: /^Paste failed: the clipboard program is not installed on the machine VibeSpace runs on$/, door: { none: 'the hub\'s own machine: a program installed there needs its owner\'s password (apt) — said by name at the paste that failed' } },
  // B-bd27 X2: a Node the machine already had, on a machine with no pairing sheet (an ssh host, the hub's own agent)
  { id: 'node-runtime-system', need: 'the machine\'s own Node at or above the advisory floor (an agent with no pairing sheet runs on it)', platforms: ['win32', 'darwin', 'linux'], kind: 'b',
    match: /runs this machine’s own Node/, door: { none: 'that Node is the machine\'s own program (its package manager, its administrator): its upgrade line is shown to type there, and VibeSpace never upgrades a program it did not install; the agent runs on the new Node from its next connection' } },
  { id: 'node-runtime', need: 'Node at or above the advisory floor (the agent\'s runtime)', platforms: ['win32', 'darwin', 'linux'], kind: 'b',
    match: /Node .*(floor|or newer)|upgrade it to \{floor\}/, door: { present: { marker: /onReinstall\(\)/, surfaces: ['src/lib/machine-runtime-line.js'] } } }, // the open card's «Install again…» (the pairing sheet) beside the system Node's upgrade line
  // B-69ec: a paired machine's own login shell has no agent CLI — the cli-missing dialog's remote words; the dialog draws two
  // doors: «How to install» (the prerequisites) and «Open Manage agents» (Machines › that machine › Install); the next create asks
  // that machine's shell again (a «none» is never kept)
  { id: 'agent-cli-remote', need: 'the agent\'s CLI on a paired machine, on the PATH its own login shell reads', platforms: ['linux', 'darwin'], kind: 'a',
    match: /^Nothing was started\. The \{shell\} of \{machine\} .*has no \{cli\} program on its PATH\.$/, door: { present: { marker: /footer\.append\(docs, manage\)/, surfaces: ['src/lib/cli-missing-dialog.js'] } } },
  { id: 'agent-browser', need: 'agent-browser and its Chrome on a paired machine', platforms: ['win32', 'darwin', 'linux'], kind: 'a',
    match: /agent-browser is not installed on|has no Chrome for agent-browser/, door: { none: 'the ruled road (src/browser-serve.js «never an installer: the user runs the step»): the machine\'s own one command is shown with Copy, and the machine\'s next start of a browser reads it again' } }, // B-bd27 X3
  { id: 'engine-kernel', need: 'a browser engine plugin\'s kernel on the hub machine', platforms: ['linux', 'darwin', 'win32'], kind: 'a',
    match: /kernel is not installed on this computer/, door: { none: 'VibeSpace fetches the kernel itself at the engine\'s first use (and the fleet\'s), and says its download and any failure on the same line — nothing for a person to install' } }, // B-bd27 X3
  { id: 'hub-machine', need: 'the hub machine\'s own system (strace 6.6 or newer, setpriv, unzip, a tracing permission, a private folder outside the home)', platforms: ['linux'], kind: 'b',
    match: /^(this machine has no strace|this machine does not let strace|the check needs strace|this machine has no setpriv|this machine has no private folder|unzip is missing)/,
    door: { none: 'the hub machine\'s own system tools (for a check, for a download): the sentence names the package and its apt line; VibeSpace runs sudo only without a password prompt (sudo -n) and installs none of these tools itself; a kernel setting or a folder is the administrator\'s to change' } }, // B-bd27 H
  // lane lg-providers (B-d578 cure 3, the checkpoint's red of 2.369.412 — 主开发 09:03Z): a third-party provider's Test on Claude Code
  // reads the machine's Windows policy through Windows' own reg.exe; on a WSL hub that needs WSL interop on (Windows programs runnable
  // from WSL). A person CAN meet it — the switch is said in the sentence (B-ee0a words it by platform) — but no door of VibeSpace's
  // can: the hub runs inside that very WSL
  { id: 'windows-policy-helper', need: 'Windows\' own reg.exe, run by the hub to read the Windows policy for Claude Code — on a WSL hub, WSL interop on', platforms: ['linux', 'win32'], kind: 'c',
    match: /could not find or start the Windows helper \(reg\.exe\)/,
    door: { none: 'the WSL distribution\'s own switch (its /etc/wsl.conf «[interop] enabled», then a WSL restart from Windows) — or, on a native Windows hub, its System32 reg.exe — is outside the hub, which runs inside that machine: the sentence says what to turn on and where, and the provider\'s start on another account stays open' } },
]);
/** The net's catches that state no need of a machine — each with its reason. */
const NOT_NEEDS = Object.freeze([
  { why: 'a push mount\'s refusal naming the Settings key that fixes it (agentd.publicUrl) — said in the push dialog (B-af94: now a t() key, so this net reads it); its Settings door on the line is OWED (named: FOUND, not built there)', match: /^no path for the remote to reach this instance — the device tunnel needs the machine daemon link/ },
  { why: 'a setting\'s description (its words explain a choice, they ask nothing of a machine)', match: /^(Show the |How long |Whether |Which agent-browser |When an SSH |Expose a machine|VibeSpace also answers|What an agent's browser|When this machine has no desktop session$|ON \(recommended\): )/ },
  { why: 'where a browser runs on the hub machine (an outcome, said; nothing to install)', match: /has no desktop session|the page's picture — this machine has no display/ },
  { why: 'a session\'s own login or an app\'s sign-in road (accounts, not the machine)', match: /has no login on this machine|CLI login|[Rr]uns on this machine only|company app has no relay page|OAuth login and its long-lived token|subscription login has its own absolute lifetime/ }, // 2.369.402's meetings: the account rows' «Runs on this machine only» (a capital R) and login-expiry's two lifetime facts
  { why: 'how the stream travels (a road fact: the device link carries it), said in the details — nothing for the person to do', match: /has no direct UDP — the device link carries it/ }, // the stream lane's sentence (machine-desktop.js), ruled 2.369.402
  { why: 'what an install puts on a machine, said before it runs (the install is that need\'s door)', match: /^This installs what VibeSpace needs on that machine/ },
  { why: 'the hub\'s own record of usage (its data, not a machine\'s need)', match: /usage-history/ },
  { why: 'the Settings window\'s reason a row does not apply here (it folds the row; the need\'s own surface draws its door)', match: /^(this machine has no shared desktop \(VNC\)|this machine has no display backend|the \{name\} CLI is not installed on this machine)$/ }, // B-bd27: settings-view's `when` reasons
  { why: 'a door\'s own label or outcome (the need\'s row owns the sentence that states it)', match: /^(Re-pairing this machine from its Machines card|Install (xpra|LibreOffice|the Calibri|TightVNC)|\{app\} is not installed on \{machine\}$|Not installed — this machine could not start it|This machine has no virtual microphone to remove)/ },
  { why: 'a platform fact with its alternative said (desktop apps are Linux\'s; a Mac / Windows machine has its whole desktop)', match: /no X11 server/ },
  { why: 'a conversation\'s CPU priority said in its Properties (a machine with no nice program runs it at the server\'s own priority — an outcome told, nothing it asks a person to install)', match: /this machine has no nice program/ }, // B-460d (bl-loop-b, 2.369.412): src/lib/cpu-priority-words.js
  { why: 'a file or a pairing fact, not a need', match: /no absolute path on its machine|Where to put it on this computer|The machine VibeSpace itself runs on|Put it on the device in four steps/ }, // + pair-dialog-polish's step heading (61d795562 — the seam ruled 主开发 11-13)
]);
const needOf = (sentence) => NEEDS.find((r) => r.match.test(String(sentence))) || null;
const notNeedOf = (sentence) => NOT_NEEDS.find((r) => r.match.test(String(sentence))) || null;
/** The census's net: a sentence names a machine AND a need (the words a person reads — the dictionary's keys). */
const NET = Object.freeze({
  subject: /\b(machine|machine’s|machine's|Mac|Mac’s|Windows|Linux|device|computer)\b|\{machine\}|this Linux|the other computer|that machine/i,
  need: /\b(needs?|requires?|install (it|xpra|LibreOffice|TightVNC|the)|turn (it )?on|turned off|put it on|upgrade it|has no|is off for|not installed|too old|or newer|or later|set up once|run this once)\b/i,
});
const inNet = (s) => NET.subject.test(String(s)) && NET.need.test(String(s));
module.exports = { NEEDS, NOT_NEEDS, NET, DEFERRED, needOf, notNeedOf, inNet };
