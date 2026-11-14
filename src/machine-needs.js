'use strict';
/**
 * THE MACHINE NEEDS CENSUS (lane machine-needs-at-pairing pick 2; 主开发's law 1 — the owner 2026-11-13: «这种需要 vnc 啊，需要 ffmpeg
 * 之类的事情不能在安装的时候自动解决吗？»). Every sentence that tells a person a MACHINE needs something (a program, a setting, a version)
 * is claimed by ONE row here: the need, its platforms, WHO can meet it, and its DOOR.
 *   kind  a = a program with no rights · b = a program + the machine's own prompt (UAC / sudo / its password dialog) ·
 *         c = only the person's switch in that machine's settings · - = nothing can meet it (an edition, a product gap)
 *   door  { present: { marker, surfaces } } — every surface that states the need draws its door (`marker` — one regex, or one per
 *         surface file — is in its source); the
 *         words of a PURE model are drawn by `via[model]` · { none: why } · { deferred: 'machine-needs · B-bd27' } (the owner's
 *         backlog row: a door owed by a later lane)
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
    match: /too old|agent updated|rerun the (device's )?install command|or later|reconnect it to upgrade|reconnect the machine to upgrade|updates itself|retires the older installs/, door: { deferred: DEFERRED } },
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
  { id: 'node-runtime', need: 'Node at or above the advisory floor (the agent\'s runtime)', platforms: ['win32', 'darwin', 'linux'], kind: 'b',
    match: /Node .*(floor|or newer)|upgrade it to \{floor\}/, door: { deferred: DEFERRED } },
  { id: 'agent-browser', need: 'agent-browser and its Chrome on a machine; an agent CLI', platforms: ['win32', 'darwin', 'linux'], kind: 'a',
    match: /agent-browser|CLI is not installed|kernel is not installed/, door: { deferred: DEFERRED } },
  { id: 'hub-machine', need: 'the hub machine\'s own tools and settings (unzip, a display, a VNC server, https)', platforms: ['linux'], kind: 'b',
    match: /unzip|no display backend|no shared desktop|Secure address|strace|setpriv|private folder outside your home/, door: { deferred: DEFERRED } },
]);
/** The net's catches that state no need of a machine — each with its reason. */
const NOT_NEEDS = Object.freeze([
  { why: 'a setting\'s description (its words explain a choice, they ask nothing of a machine)', match: /^(Show the |How long |Whether |Which agent-browser |When an SSH |Expose a machine|VibeSpace also answers|What an agent's browser|When this machine has no desktop session$|ON \(recommended\): )/ },
  { why: 'where a browser runs on the hub machine (an outcome, said; nothing to install)', match: /has no desktop session|the page's picture — this machine has no display/ },
  { why: 'a session\'s own login or an app\'s sign-in road (accounts, not the machine)', match: /has no login on this machine|CLI login|[Rr]uns on this machine only|company app has no relay page|OAuth login and its long-lived token|subscription login has its own absolute lifetime/ }, // 2.369.402's meetings: the account rows' «Runs on this machine only» (a capital R) and login-expiry's two lifetime facts
  { why: 'how the stream travels (a road fact: the device link carries it), said in the details — nothing for the person to do', match: /has no direct UDP — the device link carries it/ }, // the stream lane's sentence (machine-desktop.js), ruled 2.369.402
  { why: 'what an install puts on a machine, said before it runs (the install is that need\'s door)', match: /^This installs what VibeSpace needs on that machine/ },
  { why: 'the hub\'s own record of usage (its data, not a machine\'s need)', match: /usage-history/ },
  { why: 'a door\'s own label or outcome (the need\'s row owns the sentence that states it)', match: /^(Install (xpra|LibreOffice|the Calibri|TightVNC)|\{app\} is not installed on \{machine\}$|Not installed — this machine could not start it|This machine has no virtual microphone to remove)/ },
  { why: 'a platform fact with its alternative said (desktop apps are Linux\'s; a Mac / Windows machine has its whole desktop)', match: /no X11 server/ },
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
