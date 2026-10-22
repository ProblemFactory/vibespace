#!/usr/bin/env node
// THE INPUT-SURFACE CENSUS — FAST (lane takeover-census-fast, B-aacd, 2026-10-20; §4 of the heavy scripts/test-takeover-keyboard.mjs
// from verify r3 of lane takeover-keyboard until this lane). Every construct under src/lib/** (+ public/index.html) that makes an
// element take keys — an <input> / <textarea> / <select> / <iframe> / <canvas> / <details> / <datalist> made or written in a
// template (through an element helper or a conditional tag too), a contentEditable, an ARIA text box / combobox / listbox,
// inputmode, designMode, execCommand, a shadow root, delegatesFocus, a tabindex, a CodeMirror EditorView, an xterm Terminal, a
// noVNC RFB, a Tiptap Editor — is ONE row of CENSUS per (file, construct) naming its CLASS (SURFACE_CLASSES: what the user's own
// press does there, where the focus lands). A new surface without a row, a row whose construct left its file, a duplicate, an
// unknown class — RED, by name.
// WHY FAST (B-aacd; lane takeover-surface-census's report §6): the census sat in the heavy suite, which scripts/ci.mjs HOSTS
// routes to the desktop runner (the bare word xpra in its DOM-mini strings), so the Actions mirror never ran it and the
// integrators ran named heavies only — RED from 2d7e2c64 (2.369.313) to .323 unseen, and RED again on the .329 base (two
// surfaces of int328 / int329, classed here). It reads files and greps: no browser, no DOM-mini, no server, well under a
// second. The files come from `git ls-files` (the law: a census lists files through git, never readdirSync — an untracked
// file is not in the tree it judges).
// WHAT STAYS HEAVY: the PROOF of each class — its DOM-mini legs on the real keyboard-yield.js and the §2 patched copy that
// reddens them — is test-takeover-keyboard §4, which imports SURFACE_CLASSES + CENSUS from here (this file checks nothing when
// imported: the run is behind the main-module guard at the end).
//   ① the census over today's tree: every surface classified, no dead row, no duplicate, every class known; every class has rows
//   ② THE PLANTED SURFACE: a scratch git copy of src/lib + index.html with ONE roving-focus <button> (tabIndex 0 + its own keydown
//      handler) appended to the desktop live view, listed by the same git ls-files, read by the same grep ⇒ RED naming
//      "vnc-view.js tabindex" and nothing else; the copy without the plant reads exactly as today's tree
//   ③ the census's own controls (verify r3 / r4 of lane takeover-keyboard, moved whole): a row dropped ⇒ named unclassified, a
//      construct added ⇒ named, a construct gone ⇒ its row DEAD, an unknown class ⇒ named, a surface named only in a comment ⇒
//      none; the belt's omissions on synthetic files (a block comment before code, a `/*` in a string, a regex with a quote, a
//      template line beginning ` * `, a conditional tag, an element helper own / imported under an alias, a library constructor
//      under an alias, every pattern kind)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { gitEnvFrom } from './git-env.mjs';
import { scratchDir } from './scratch.mjs';
export const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export const SURFACE_CLASSES = {
  text:    { press: 'YIELDS', focus: 'the box itself (CodeMirror: its .cm-content); its <label> is the box (verify r4)', script: 'taken back (said once when the user\'s own press elsewhere caused it — Q1)', legs: ['userW', 'textSearch', 'textCm', 'script', 'q1Cue', 'labelPress', 'textPassword'], controls: ['no-press', 'no-contenteditable', 'no-search-type', 'no-label', 'no-password-type'] },
  host:    { press: 'YIELDS', focus: 'xterm\'s helper textarea (its screen and the textarea are one input)', script: 'taken back', legs: ['terminal'], controls: ['no-xterm-host'] },
  picture: { press: 'YIELDS', focus: 'xpra: the pane\'s IME textarea · noVNC: its canvas', script: 'taken back', legs: ['n1Xpra', 'n1Vnc', 'n1Stream', 'n1Script'], controls: ['n1-no-host', 'n1-no-surface', 'n1-no-video'] },
  frame:   { press: 'DECLARED — taken back, said', focus: 'the sink (a press inside a frame is the frame document\'s: nothing tells it from the frame\'s own script — verify r2 H5)', script: 'taken back', legs: ['frameSink', 'h1Frame'], controls: ['blur-frame-blind', 'h1-frame-blind'] },
  choice:  { press: 'DECLARED — the pointer picks', focus: 'the <select> keeps it (its list open); its keys stay the page\'s (F1)', script: 'kept (a script cannot open a list)', legs: ['choiceSelect'], controls: ['no-choice'] },
  control: { press: 'DECLARED — the pointer works', focus: 'the sink takes it back (a checkbox / radio / range / colour / file / read-only field, a role=button chip, a <details> fold\'s summary: its Space / Enter / arrows stay the page\'s; verify r4 measured: the colour picker stays open, a summary toggles)', script: 'taken back', legs: ['controlCheckbox', 'controlSummary', 'controlReadonly', 'controlChip'], controls: ['blur-keeps-all', 'no-readonly'] },
  widget:  { press: 'DECLARED — not typing', focus: 'the sink takes it back while the view owns (a list\'s arrows / Enter stay the page\'s — a listbox / combobox widget of ours too); yielded, the keys stay where they were and the chip says "not in a text box" (r2\'s held)', script: 'taken back', legs: ['widgetList', 'widgetYielded', 'focusStorm'], controls: ['blur-keeps-all', 'where-kind'] },
  dialog:  { press: 'TAKES THE KEYS when the user\'s OWN act opened it (lane dialog-keys, the owner\'s rule) — else TAKEN BACK, said', focus: 'the dialog\'s own choice (a confirm\'s OK, an input dialog\'s box; one that focuses nothing: its first text box, else its overlay — never a button it did not choose); Enter / Escape / Tab / typing are the dialog\'s and the takeover goes on; its close (an answer, a backdrop press, a script\'s removal) gives the keys back where they were — the sink, the yield\'s text box, the older dialog. Its select is the dialog\'s too', script: 'OPENS BY ITSELF ⇒ taken back, SAID once (the password guard: no press — or a synthetic, stale or picture press — never moves the keys out of the page); its Enter is the page\'s', legs: ['dialogUserPress', 'dialogScript', 'dialogSynthetic', 'dialogPicture', 'dialogStale', 'dialogNested', 'dialogScriptClose', 'dialogYielded', 'dialogTwoViews', 'dialogChain', 'dialogFocusless', 'dialogSelect', 'dialogStatic', 'dialogPageBar', 'dialogPassword'], controls: ['dialog-no-rule', 'dialog-trust-any', 'dialog-orphan', 'dialog-no-cue', 'dialog-no-picture', 'dialog-back-base', 'dialog-home-active'] },
  helper:  { press: 'TAKEN BACK — silent', focus: 'the sink (a script-only box: a copy fallback\'s scratch textarea and its execCommand, the terminal\'s paste target — never announced, F2)', script: 'taken back', legs: ['helperCopy', 'cueRecreated'], controls: ['cue-gone-said', 'cue-flag'] },
  view:    { press: 'THE VIEW', focus: 'its own sink (the keys go to the page)', script: '—', legs: ['picture', 'bar', 'ownTab'], controls: ['no-chrome'] },
  none:    { press: 'NOT A KEY SURFACE', focus: 'nothing (a chart, a measuring context, a shadow root that holds paper)', script: '—', legs: ['noneCanvas'], controls: [] },
};
/** [file under src/lib, construct, classes joined by +, where] */
export const CENSUS = [
  ['app.js', 'input', 'text+control', 'Backup & migrate: the passphrases; the section checkboxes; the import file picker'],
  ['appearance-panel.js', 'select', 'choice', 'theme / font'],
  ['app-install-dialog.js', 'details', 'control', 'the plan\'s package list fold (lane custom-app; joined at the 2.369.200 integration)'],
  ['artifact-card.js', 'input', 'text', 'the Artifacts popover\'s filter box (type=search; `/` focuses it, Esc clears — lane artifacts-list-scale)'],
  ['artifact-card.js', 'combobox', 'widget', 'the Artifacts popover\'s rows (role=listbox; ↑ ↓ Enter — lane artifacts-list-scale)'],
  ['artifacts-window.js', 'input', 'text', 'the Artifacts window\'s filter box (type=search — lane artifacts-list-scale)'],
  ['artifacts-window.js', 'combobox', 'widget', 'the Artifacts window\'s rail (role=listbox; a click / Enter = the group filter — lane artifacts-list-scale)'],
  ['artifacts-window.js', 'tabindex', 'widget', 'the Artifacts window\'s rail items (0) and table rows (-1; Enter opens — lane artifacts-list-scale)'],
  ['artifact-card.js', 'tabindex', 'control', 'a deliverable\'s chat card (0, role button, Enter / Space open it beside the chat — lane artifacts-model)'],
  ['app-install-dialog.js', 'input', 'text', 'Install an app…: the search box, the .deb path, a package source\'s fields, Let an agent help…\'s request (lane custom-app)'],
  ['browser-build-dialog.js', 'tabindex', 'control', 'Download another build…: the row that opens the picker and every offered version row of the picker (role button, Enter / Space act — lane chrome-builds-download)'],
  ['browser-build-dialog.js', 'input', 'text+control', 'Change build…: the build radios; a chrome file\'s path box (lane browser-admin 2a — classified at verify r2: the lane never ran this heavy census)'],
  ['browser-live-window.js', 'textarea', 'view', 'the live view\'s keyboard sink'],
  ['browser-live-window.js', 'input', 'text', 'BROWSE YOURSELF\'s address row (his own box: the H exemption — never a reclaim nor a yield); a page dialog\'s prompt answer (lane browser-stuck) — the .197 integration'],
  ['browser-live-window.js', 'tabindex', 'view+helper+widget', 'the view\'s root (0), its sink (-1); his Tabs pane rows (0, BROWSE YOURSELF: Enter goes to that tab)'],
  ['browser-live-window.js', 'inputmode', 'text', 'BROWSE YOURSELF\'s address <input> (`inputmode=url`: the phone keyboard\'s hint on the same text box as the input row) — the .198 integration (r4\'s construct met the .197 row)'],
  ['browser-new-profile.js', 'input', 'text+control', 'New profile…: the name, the CDP port and a chrome file\'s path (text); the provider / machine / build radios (control) — lane browser-admin 1, classified at verify r2; its who radios became the one picker at the 2.369.202 integration'],
  ['browser-new-profile.js', 'inputmode', 'text', 'New profile…: the CDP port box (`inputMode=numeric` — the phone keyboard\'s hint on that text box)'],
  ['browser-passkeys-view.js', 'input', 'control', 'the Passkeys table\'s agents-off switch (a checkbox — lane passkey-ui; composed at the 2.369.261 integration)'],
  ['browser-replay-window.js', 'tabindex', 'widget', 'the replay window (← → Home End Space)'],
  ['browser-trace-view.js', 'input', 'control', 'the actions pane\'s "show page-size changes" checkbox (fitsToggle; the panel\'s record switches became ⋯ menu check rows — design 015)'],
  // browser-who-dialog.js's "Who can use it" radios (control) left with lane everyone-principal (one picker; its search box is principal-picker.js's)
  ['browser-window.js', 'input', 'text', 'the Web view\'s URL bar'],
  ['browser-window.js', 'iframe', 'frame', 'the Web view\'s page'],
  ['channel-filter-editor.js', 'input', 'text+control', 'the filter\'s fields, its radios'],
  ['channel-filter-editor.js', 'textarea', 'text', 'a decision rule\'s condition in plain words (lane decision-rule; composed at the 2.369.261 integration)'],
  ['channel-group-dialogs.js', 'input', 'text+control', 'a group\'s name; the wake checkbox'],
  ['channel-group-dialogs.js', 'textarea', 'text', 'the group\'s context'],
  ['channel-group-dialogs.js', 'select', 'choice', 'the group picker'],
  // the .197 integration: the other lanes' surfaces, each classed by the census's own rules
  ['channel-mail-frame.js', 'iframe', 'frame', 'a mail\'s formatted body (the sandboxed srcdoc frame, lane channel-rich)'],
  ['channel-thread-pane.js', 'tabindex', 'widget', 'the thread pane\'s reply list (-1, lane channel-threads)'],
  ['channel-thread-pane.js', 'textarea', 'text', 'THE THREAD PANE\'S COMPOSER (lane channel-threads)'],
  // the 2.369.249 integration (int248): lane webhook-l2-ui's owner surface, classed by the census's own rules
  ['channel-webhook.js', 'input', 'text+control', 'the New path wizard\'s fields (slug, title, reply name, keys, rate / wakes numbers, the reply URL); the Send a message caller picker\'s checkboxes'],
  ['channel-webhook.js', 'select', 'choice', 'the wizard\'s delivery / policy / caller auth pickers (whSelect)'],
  ['channel-webhook.js', 'textarea', 'text', 'THE SEND A MESSAGE BOX (a path\'s picked callers)'],
  ['channel-webhook.js', 'details', 'control', 'the Join with a pairing code dialog\'s Technical details fold after a pair (the caller id · its reply URL) (lane webhook-pair-join; the 2.369.270 integration)'],
  ['channel-window.js', 'input', 'control', 'the Reply-all checkbox under a Gmail reply (lane gmail-reply-all — composed at the 2.369.202 integration)'],
  ['channel-window.js', 'textarea', 'text', 'THE CHANNEL COMPOSER (a conversation, an agent group)'],
  ['channel-window.js', 'tabindex', 'widget+control', 'the message list (-1, PageUp / Home); an info chip (0)'],
  ['channels-panel.js', 'input', 'text+control', 'search, account fields; the enabled checkbox'],
  ['channels-panel.js', 'select', 'choice', 'account fields'],
  ['channels-panel.js', 'canvas', 'none', 'int214: the freshness pill fit\'s text measure (fitRowPills — never in the document)'],
  ['channels-panel.js', 'tabindex', 'control', 'a paged list\'s END (0): focus there reads the next page (design 008 + owner 2026-10-03, seamless lists) — no keys of its own'],
  ['chat-input.js', 'input', 'control', 'the attach / file / folder pickers (type=file)'],
  ['chat-input.js', 'textarea', 'text', 'THE CHAT COMPOSER'],
  ['chat-input.js', 'tabindex', 'widget', 'the queue strip\'s items'],
  ['chat-minimap.js', 'input', 'text', 'the TOC filter'],
  ['chat-renderers.js', 'input', 'text', 'AskUserQuestion\'s own answer; an inline edit'],
  ['chat-renderers.js', 'tabindex', 'control', 'role=link names (a peer, a collab agent)'],
  ['chat-search.js', 'input', 'text', 'the chat\'s search box (Ctrl+F)'],
  ['chat-status-bar.js', 'input', 'control', 'the publish checkbox'],
  ['chat-status-bar.js', 'textarea', 'text', 'the goal / note editors'],
  ['chat-view.js', 'tabindex', 'widget', 'the chat container (-1: a press on the message list focuses it)'],
  ['code-editor.js', 'select', 'choice', 'the language select'],
  ['code-editor.js', 'iframe', 'frame', 'the HTML / Markdown preview'],
  ['code-editor.js', 'codemirror', 'text', 'THE CODE EDITOR (.cm-content; its gutter takes no typing)'],
  ['customize-mode.js', 'input', 'text', 'a zone\'s value'],
  ['design-ask.js', 'input', 'text', 'the questions sheet\'s "Other…" answer box (lane design-ask): the user types an answer the agent did not offer — composed at the design-joint merge'],
  ['design-canvas.js', 'tabindex', 'widget+frame', 'the Design canvas viewport (role=application, 0: its keys pan / zoom, never typing) + an artboard frame live for comment / focus (0, else -1) — lane design-window, composed at the 2.369.202 integration'],
  ['design-canvas-model.js', 'iframe', 'none', 'Print all\'s document (lane design-present, printAllSrcdoc): one script-only frame per artboard INSIDE the hidden print frame — paper, never a key surface'],
  ['design-changes.js', 'input', 'text+control', 'the Design composer\'s Style row (lane design-changes): two px number boxes (text) + two colour pickers (control)'],
  ['design-changes.js', 'inputmode', 'text', 'the Style row\'s px boxes (`inputMode=numeric` — the phone keyboard\'s hint on those text boxes)'],
  ['design-pick.js', 'contenteditable', 'frame', 'edit in place (lane design-changes): a text INSIDE an artboard frame made editable while picking — the sandboxed frame\'s own document, a frame the keyboard yields to'],
  ['design-present.js', 'iframe', 'none', 'Print all\'s transient frame (lane design-present; off-screen, hidden, pointer-events none, tabIndex -1: paper, never a key surface)'],
  ['design-home.js', 'input', 'text', 'the Design home\'s find box + a row\'s Rename field (Enter / Esc end it) — lane design-systems-home, classified at the 2.369.203 integration'],
  ['design-home.js', 'select', 'choice', 'the publish / new-design "Design system" select (a registered system or none)'],
  ['design-home.js', 'tabindex', 'control', 'a home row (role=listitem, 0: Enter opens that design — no other key)'],
  ['design-present.js', 'tabindex', 'none', 'the Print-all frame\'s tabIndex -1 (never focused)'],
  ['design-tweaks.js', 'input', 'text+control', 'the Tweaks panel: a knob\'s color / range / switch (control) and the + Tweaks request line (text) — lane design-tweaks, classified at the 2.369.203 integration'],
  ['design-tweaks.js', 'select', 'choice', 'the Tweaks panel: a select knob with many / long options'],
  ['design-window.js', 'iframe', 'none', 'the Design window\'s print frame (off-screen, hidden, pointer-events none, tabIndex -1: paper, never a key surface)'],
  ['design-window.js', 'input', 'text+control', 'the Publish design dialog\'s page title + its Public checkbox'],
  ['design-window.js', 'select', 'choice', 'the Design bar\'s pages select'],
  ['design-window.js', 'tabindex', 'none', 'the print frame\'s tabIndex -1 (never focused)'],
  ['design-window.js', 'textarea', 'text', 'THE DESIGN COMMENT COMPOSER (Comment mode)'],
  ['desktop-app-launcher.js', 'details', 'control', 'design 009: the app install dialog\'s Details fold (the plan\'s facts, the root sentence, the commands)'],
  ['desktop-app-launcher.js', 'input', 'text+control', 'URL / command / arguments / cwd; keep-profile checkbox'],
  ['desktop-app-launcher.js', 'select', 'choice', 'lane launch-picture-size: the Apps dialog head\'s Picture size select (follow the pane / the size table / custom)'],
  ['doc-window-ui.js', 'tiptap', 'text', 'THE DOC PAGE (Tiptap v3\'s Editor over ProseMirror\'s view: a contentEditable the user types into — lane doc-window; Tiptap since doc-editor-wheel, composed at the 2.369.221 integration)'],
  ['doc-window-ui.js', 'textarea', 'text', 'a comment\'s note ("What should change?" — lane doc-window)'],
  ['doc-window-ui.js', 'input', 'text', 'the Link dialog\'s address and text fields (lane doc-link-bubble; composed at the 2.369.261 integration)'],
  ['doc-window-ui.js', 'contenteditable', 'none', 'the table grips\' contentEditable \'false\' (design 020, lane doc-editor-ui; composed at the 2.369.223 integration): buttons kept OUT of the page\'s editing — never a key surface; a press opens the existing table menu'],
  ['doc-window-ui.js', 'iframe', 'none', 'Print / Save as PDF\'s transient frame (lane doc-window-width-export, the 2.369.239 integration; off-screen, aria-hidden, tabIndex -1, sandboxed without scripts: paper — focused only to hand the browser its own print dialog; dropped on the next print, the window\'s close or after 2 min)'],
  ['doc-window-ui.js', 'tabindex', 'none', 'the print frame\'s tabIndex -1 (never a Tab stop)'],
  ['machine-desktop.js', 'input', 'text', 'design 014 D1: "Run on its desktop…"\'s command box + the sign-in\'s name / password fields (a page dialog — the picture is not focused while they are)'],
  ['desktop-app-window.js', 'tabindex', 'control', 'the scale chip (role=button)'],
  ['desktop-picker.js', 'tabindex', 'widget', 'lane desktop-v2-entry: the Desktop picker popover (role=menu, -1; ↑ ↓ / Enter pick a row — its keys stay the page\'s)'],
  ['machine-desktop.js', 'tabindex', 'control', 'lanes desktop-v2-entry / -latency: the strip\'s status chip (role=button, 0; Enter / Space open the comparison row)'],
  ['dial-address-picker.js', 'input', 'text+control', 'the pairing sheet\'s address radios; the custom address (lane-pairing)'],
  ['docx-viewer.js', 'iframe', 'frame', 'an altChunk (sandboxed)'],
  ['exit-access-dialog.js', 'input', 'control', 'exit access "Who can use it" radios; the ask checkbox (lane-pairing)'],
  ['external-editor.js', 'codemirror', 'text', 'the Ctrl+G split-pane editor'],
  ['file-explorer-ops.js', 'input', 'text+control', 'publish: the page name; public checkbox (rename = the input dialog, utils.js)'],
  ['file-explorer.js', 'input', 'text+control', 'the path bar; the upload pickers; select-mode checkboxes'],
  ['file-explorer.js', 'select', 'choice', 'the view menu'],
  ['file-explorer.js', 'tabindex', 'widget', 'the file list (-1: arrows / Enter / Delete stay the page\'s while you drive)'],
  ['file-viewer.js', 'input', 'text', 'the CSV filter'],
  ['file-viewer.js', 'iframe', 'frame', 'PDF / HTML preview'],
  ['foryou-links.js', 'tabindex', 'control', 'a path / link in a For-you item\'s words (span role=link, 0: Enter opens it through the one door — lane foryou-attachments)'],
  ['gear-menu.js', 'tabindex', 'widget', 'the ⚙ menu\'s rows (roving tabindex)'],
  ['hex-viewer.js', 'input', 'text', 'jump to offset'],
  ['inbox-window.js', 'tabindex', 'widget', 'the For-you list (0) and the item pane (-1)'],
  ['incident-recorder.js', 'textarea', 'text', '"What went wrong?"'],
  ['jobs-panel.js', 'input', 'text+control', 'job fields; checkboxes'],
  ['jobs-panel.js', 'select', 'choice', 'kind / schedule'],
  ['manage-agents.js', 'input', 'text+control', 'the token paste; the pool member checkboxes'],
  ['manage-agents.js', 'textarea', 'text', 'instructions'],
  ['learn-card.js', 'input', 'text+control', 'LLM plugin 「从我的判定起草」 card: a proposed line\'s tick (checkbox) + its edit box (text) (lane rule-learning; classified at the 2.369.269 integration — the lane never ran this heavy census)'],
  ['learn-card.js', 'details', 'control', 'the drafter card\'s technical folds (the run\'s facts, a row\'s evidence) (lane rule-learning; the 2.369.269 integration)'],
  ['manage-agents.js', 'select', 'choice', 'the token mint\'s account pick when the sign-in proved no account (lane oat-verify-fixes: #oat-pick)'],
  ['manage-agents.js', 'tabindex', 'control', 'the re-login chip (role=button)'],
  ['mounts-dialog.js', 'input', 'text+control', 'a mount\'s fields; a read-only key / link'],
  ['mounts-dialog.js', 'textarea', 'text', 'a multi-line field'],
  ['mounts-dialog.js', 'select', 'choice', 'a choice field'],
  ['open-with.js', 'tabindex', 'widget', '"Open with" menu rows'],
  ['picture-shell.js', 'textarea', 'text+helper', 'the paste box (a real box) · copyViaSelection\'s scratch (read-only, the live view\'s own copy)'],
  ['plugin-client.js', 'iframe', 'frame', 'a plugin\'s window'],
  ['plugins-ui.js', 'input', 'text+control', 'install location; the list rows\' on/off switches (role=switch checkboxes); the file picker'],
  ['plugins-ui.js', 'select', 'choice', 'the source / mode'],
  ['principal-picker.js', 'input', 'text', 'the picker\'s search box (type=search)'],
  ['reaction-picker.js', 'input', 'text', 'the reaction picker\'s search box (type=search, lane channel-threads)'],
  ['record-clear-ui.js', 'tabindex', 'dialog', 'the "Clear content…" confirm\'s overlay (-1, lane redact)'],
  ['refresh-live.js', 'textarea', 'text', 'Refresh all live sessions…: the confirm\'s note (editable, pre-filled; lane refresh-live-sessions — composed at the 2.369.279 integration)'],
  ['remoteapp-card.js', 'details', 'control', 'the RemoteApp card\'s Technical details fold (the pinned certificate\'s fingerprint, the facts — lane remoteapp-r1b, the .292 integration; classified at the .299 integration)'],
  ['remoteapp-card.js', 'input', 'text', 'the RemoteApp card\'s per-machine sign-in fields (user / domain / password — lane remoteapp-r1b, the .292 integration; classified at the .299 integration)'],
  ['resume-account-bar.js', 'select', 'choice', 'the resume bar\'s Use another account picker (pre-filled with the first account that can serve; lane resume-account-door — composed at the 2.369.276 integration)'],
  ['search-window.js', 'input', 'text', 'the Search everything box (type=search, lane global-search — composed at the 2.369.221 integration)'],
  ['search-window.js', 'combobox', 'widget', 'the Search everything results (role=listbox; Enter / a click opens a hit)'],
  ['session-card.js', 'input', 'text+control', 'the per-session config input; checkboxes'],
  ['session-card.js', 'select', 'choice', 'the per-session config select'],
  ['session-palette.js', 'input', 'text', 'the Ctrl+K palette'],
  ['session-props.js', 'input', 'control', 'Session Properties checkboxes'],
  ['session-props.js', 'select', 'choice', 'the account / cap selects'],
  ['session-props.js', 'tabindex', 'widget', 'its window (-1: a click in it gives it the key)'],
  ['settings-ui.js', 'input', 'text+control', 'SETTINGS FIELDS: the search box, text / number fields; checkboxes'],
  ['settings-ui.js', 'textarea', 'text', 'a multi-line setting'],
  ['settings-ui.js', 'select', 'choice', 'an enum setting'],
  ['setup-flows.js', 'input', 'text', 'the password dialogs, the onboarding cwd'],
  ['sidebar-mounts.js', 'input', 'text+control', 'machine / pairing fields; checkboxes'],
  ['sidebar-mounts.js', 'textarea', 'text+control', 'a key paste; read-only share links / tokens (their Copy button copies)'],
  ['sidebar-mounts.js', 'select', 'choice', 'a mode'],
  ['sidebar-rail.js', 'input', 'text', 'Ports / System search, a machine name'],
  ['sidebar-rail.js', 'select', 'choice', 'the rail\'s pickers'],
  ['sidebar-rail.js', 'canvas', 'none', 'the System charts'],
  ['sidebar-rail.js', 'details', 'control', 'the System window\'s Server memory table: the Workers fold (lane server-memory-census; joined at the 2.369.241 integration)'],
  ['sidebar-tasks.js', 'input', 'text+control', 'a reason; checkboxes'],
  ['sidebar-tasks.js', 'select', 'choice', 'the bind picker'],
  ['sidebar-workbench.js', 'select', 'choice', 'the host select'],
  ['sidebar.js', 'input', 'control', 'the filter checkboxes'],
  ['stream-view.js', 'tabindex', 'picture', 'the paired machine\'s WebRTC stream <video> (0; its keydown goes to the machine over the data channel — stream P1-A, the .294 integration; a keyboard surface since the .299 integration)'],
  ['task-detail.js', 'input', 'text+control', 'title / backlog / progress / folders / context; checkboxes; the colour'],
  ['task-detail.js', 'textarea', 'text', 'the objective'],
  ['task-detail.js', 'select', 'choice', 'browser / events / caps'],
  ['task-log.js', 'input', 'text', 'search, an item\'s title, add'],
  ['task-log.js', 'textarea', 'text', 'an item\'s detail'],
  ['task-log.js', 'select', 'choice', 'status / date filters, priority'],
  ['taskbar.js', 'tabindex', 'widget', 'taskbar buttons, the group chooser\'s rows'],
  ['telemetry-client.js', 'canvas', 'none', 'the GPU probe (never in the document)'],
  ['terminal.js', 'input', 'text+control', 'the font size (number); the override checkbox'],
  ['terminal.js', 'textarea', 'helper', 'the Ctrl+C copy fallback\'s scratch'],
  ['terminal.js', 'select', 'choice', 'theme / font'],
  ['terminal.js', 'canvas', 'none', 'the monospace measure'],
  ['terminal.js', 'contenteditable', 'helper+text', 'the Ctrl+V paste target (script-only) · the phone\'s paste pad (a real box)'],
  ['terminal.js', 'xterm', 'host', 'A TERMINAL'],
  ['terminal.js', 'tabindex', 'helper', 'the paste target (-1)'],
  ['theme-editor.js', 'input', 'text+control', 'names / hex values; the colour pickers'],
  ['theme-editor.js', 'select', 'choice', '"start from"'],
  ['usage-dashboard.js', 'input', 'control', 'a checkbox'],
  ['usage-dashboard.js', 'select', 'choice', 'a range'],
  ['usage-dashboard.js', 'canvas', 'none', 'charts'],
  ['usage-window.js', 'input', 'text', 'dates, prices'],
  ['usage-window.js', 'canvas', 'none', 'charts'],
  ['user-todos-row.js', 'textarea', 'text', 'THE FOR-YOU REPLY BOX'],
  ['user-todos-row.js', 'tabindex', 'control', 'a path / link in the For-you window\'s words (role=link, 0: Enter opens it — lane foryou-attachments)'],
  ['user-todos-row.js', 'input', 'control', 'the first-use automation card\'s reach radios in the tray row (只有它开的会话 / 这些岗位的会话 / 整个 VibeSpace — lane key-instance-scope)'],
  ['utils.js', 'textarea', 'text+helper', 'THE INPUT DIALOG\'s box (showInputDialog, multi-line) · copyText\'s fallback scratch'],
  ['utils.js', 'tabindex', 'dialog', 'createModalShell\'s overlay (-1), a confirm\'s own focus — every modal ANNOUNCES its open (announceModal, lane dialog-keys)'],
  ['vnc-view.js', 'novnc', 'picture', 'THE DESKTOP / a VNC app (noVNC\'s canvas)'],
  ['voice-input.js', 'execcommand', 'helper', 'the dictation\'s insertText at the stop-time cursor + the chip\'s Undo (Dropline voice input, q-029 P0)'],
  ['voice-input.js', 'tabindex', 'none', 'the microphone on the phone (-1: never a Tab stop, a tap never focuses the box — lane voice-everywhere; the desk keeps Tab)'],
  ['voice-teach-ui.js', 'input', 'control', 'a proposal\'s term ticks and the per-project opt-in (checkboxes) on the Voice row\'s sheet (q-029 P1; the teach / context switches are settings rows — lane plugin-settings-p0)'],
  ['window-share.js', 'input', 'control', 'the wake / hold checkboxes'],
  ['window-share.js', 'textarea', 'text', 'the share note'],
  ['window.js', 'canvas', 'none', 'the chip text measure'],
  ['xpra-view.js', 'textarea', 'picture', 'the xpra pane\'s IME textarea'],
  ['xpra-view.js', 'canvas', 'picture', 'the xpra pane\'s windows'],
  // lane takeover-surface-census (the .323 base red, measured at int324): the surfaces the .313–.323 lanes grew, none classed the day
  // it landed — each read in its file (its listeners, where its focus lands), classed by the census's own rules
  ['device-acts-dialog.js', 'details', 'control', 'Activity…\'s rows (a <details> per act: its summary opens the output head — lane device-act-audit)'],
  ['device-acts-dialog.js', 'select', 'choice', 'Activity…\'s "Who asked" filter'],
  ['machine-app.js', 'tabindex', 'control', 'one window\'s stream: the stats chip (role=button, 0; a click / Enter / Space open the details — lane stream-stats-popup)'],
  ['machine-displays.js', 'canvas', 'none', 'THE STILL: a display\'s last picture held through a switch (pointer-events none, no tabindex, no listener — lane desktop-display-modes)'],
  ['stream-stats.js', 'canvas', 'none', 'the stream details\' three charts (a hover / a tap reads a second; no keys, no tabindex; the pinned panel sits beside the picture shell, never in it)'],
  ['vault-automation.js', 'input', 'text+control', 'Mint an automation key: its name (text); the verbs\' and Grant to\'s checkboxes (control) — design q-046'],
  ['vault-reveal.js', 'input', 'text', '「验证是你」\'s second password (type=password; opened in the press\'s own task it takes the keys — Show key… asks first since this lane)'],
  ['vault-unlock.js', 'input', 'text', 'the vault\'s unlock / setup / change modals: the second password boxes (type=password)'],
  ['vault-window.js', 'details', 'control', 'a stored value\'s Technical details fold'],
  ['vault-window.js', 'input', 'text+control', 'the Vault window\'s search (type=search); a shown value\'s read-only field (control: the sink takes it back; Copy copies it)'],
  ['vault-window.js', 'select', 'choice', 'the sort select; the header\'s Lock after idle'],
  // lane takeover-census-fast (B-aacd, 2026-10-20): the .329 base was RED again — two surfaces the heavy road hid (int328 + int329), each
  // read in its file and classed by the census's own rules; from this lane on the census runs in every fast gate
  ['account-models.js', 'input', 'text', '模型…\'s rows on Manage agents: a configured provider\'s model id / display name / context boxes (template inputs; the new row\'s id box takes the focus — design q-053 r1, lane provider-record; joined at the 2.369.329 integration)'],
  ['vault-totp-row.js', 'input', 'control', '「用于…」\'s grant picker: a checkbox per running conversation / Task Group (el(\'input\') + type checkbox — design q-047 L1, lane vault-totp; joined at the 2.369.328 integration)'],
  // ── verify r4 (attack 5): the rows the r3 grep could not see — element helpers, conditional tags, index.html, the new kinds ──
  ['browser-replay-window.js', 'combobox', 'widget', 'the sessions / actions lists (role=listbox: ← → Home End Space)'],
  ['channel-filter-editor.js', 'select', 'choice', 'the filter\'s pickers (selectBox — el(\'select\') from channel-chrome.js)'],
  ['channel-outbox.js', 'details', 'control', 'the proposal\'s "Original text" fold'],
  // B-2198 (the raw API, joined at the 2.369.212 integration): the proposal card and the API access dialog
  ['channel-api-card-view.js', 'details', 'control', 'the card\'s frozen-request fold (method, host, path, headers, the body\'s first 400 chars)'],
  ['channel-api-card-view.js', 'input', 'text', 'the Reject\'s "Why (the agent reads it)" box'],
  ['channel-api-dialog.js', 'input', 'text+control', 'API access: a credential\'s per-day cap (number); the All agents write tick (checkbox)'],
  ['channel-api-dialog.js', 'select', 'choice', 'API access: the credential picker, a principal\'s tier'],
  ['exit-runs-dialog.js', 'details', 'control', 'a command\'s row in the machine\'s Commands… list (lane exit-run-output; joined at the 2.369.200 integration)'],
  ['channel-outbox.js', 'tabindex', 'control', 'the Outbox ROW (0, role=button — B-f467: Enter opens its full card)'],
  ['channel-outbox.js', 'input', 'text', 'the reject reason'],
  ['channel-outbox.js', 'textarea', 'text', 'THE OUTBOX EDITOR (a proposal edited before approval)'],
  ['channel-reach-editor.js', 'select', 'choice', 'the sending policy; a grant\'s level'],
  ['channel-reach-editor.js', 'input', 'control', 'a sending guard\'s house switch — files / links / off-hours (a checkbox, role=switch: the policy row and the account Edit dialog — lane guards-door, joined at the 2.369.245 integration)'],
  ['chat-renderers.js', 'details', 'control', 'a diff / media fold, attached pages, a long message'],
  ['subagent-card.js', 'details', 'control', 'an Antigravity subagent card\'s task / answer folds (lane agy-subagent-cards)'],
  ['docx-viewer.js', 'shadow', 'none', 'the Word viewer\'s paper: a shadow root holding pages and a stylesheet, no field (the grep reads the JS that fills it)'],
  ['inbox-window.js', 'combobox', 'widget', 'the For-you list (role=listbox)'],
  ['inbox-window.js', 'input', 'text+control', 'the For-you window\'s filter (type=search, mk(\'input\')) (text); an automation card\'s reach radios in the pane (control — lane key-instance-scope)'],
  ['inbox-window.js', 'textarea', 'text', 'THE FOR-YOU WINDOW\'s REPLY BOX (mk(\'textarea\'))'],
  ['index.html', 'input', 'text+control', 'the sidebar search box; the New Session dialog\'s cwd / name / custom model / extra args, its worktree checkbox; the fork title; grid rows / columns; a preset name'],
  ['index.html', 'select', 'choice', 'the New Session dialog\'s backend / host / task / mode / model / permission / effort / account / browser profile'],
  ['index.html', 'textarea', 'text', 'the fork dialog\'s first message'],
  ['integrations-window.js', 'input', 'text+control', 'a key\'s fields (text / password); the source radios'],
  ['integrations-window.js', 'select', 'choice', 'the default-for-new-accounts preset'],
  ['jobs-panel.js', 'textarea', 'text', 'a job panel\'s multi-line field (a panel schema block: createElement(b.type === \'input\' ? \'input\' : \'textarea\'))'],
  ['manage-agents.js', 'details', 'control', 'a member\'s fold'],
  ['mounts-dialog.js', 'details', 'control', 'the Advanced fields fold'],
  ['picture-shell.js', 'execcommand', 'helper', 'copyViaSelection\'s copy command (the scratch box\'s companion)'],
  ['principal-picker.js', 'combobox', 'widget', 'the picker\'s box wears role=combobox (its list rows by arrows); the box itself is its text row'],
  ['session-props.js', 'details', 'control', 'a fold in the properties'],
  ['setup-flows.js', 'details', 'control', 'the diagnostics report\'s per-error folds'],
  ['sidebar-mounts.js', 'details', 'control', 'the bootstrap log fold'],
  ['task-detail.js', 'details', 'control', 'a progress entry\'s fold'],
  ['task-log.js', 'details', 'control', 'a backlog item with detail (its row: createElement(isExp ? \'details\' : \'div\'))'],
  ['terminal.js', 'execcommand', 'helper', 'the Ctrl+C copy fallback\'s command'],
  ['user-todos-row.js', 'details', 'control', 'an item\'s detail fold'],
  ['utils.js', 'execcommand', 'helper', 'copyText\'s fallback command'],
  ['utils.js', 'input', 'text', 'THE INPUT DIALOG\'s single-line box (showInputDialog: createElement(multiline ? \'textarea\' : \'input\'))'],
  ['workflow-detail.js', 'details', 'control', 'the Error / Result folds'],
];
/** verify r4 (attack 5): THE GREP READS CODE — a scanner, not a line filter. Every comment is dropped (a line comment; a block
 *  comment wherever it sits — before code on its line, or spanning lines: the old filter dropped a whole line that began with
 *  `*` or `/*` and kept a `/*` inside a string), while strings, template literals and regex literals stay whole (an
 *  `'image/*'`, a `/'/g` open or close nothing). Newlines are kept. */
export function codeOnly(src) {
  const s = String(src), n = s.length; let out = '', i = 0;
  const KW = ['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'instanceof', 'void', 'delete', 'throw', 'new', 'yield', 'await'];
  const regexMayStart = (j) => { let k = j - 1; while (k >= 0 && (s[k] === ' ' || s[k] === '\t')) k--; if (k < 0) return true; if ('(,=:[!&|?{};+-*%<>~^\n'.includes(s[k])) return true; const m = /([A-Za-z_$][\w$]*)$/.exec(s.slice(Math.max(0, k - 12), k + 1)); return !!m && KW.includes(m[1]); };
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = s.indexOf('*/', i + 2); const stop = e < 0 ? n : e + 2; out += s.slice(i, stop).replace(/[^\n]/g, ' '); i = stop; continue; }
    if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < n && s[j] !== c && (c === '`' || s[j] !== '\n')) { if (s[j] === '\\') j++; j++; } out += s.slice(i, j + 1); i = j + 1; continue; }
    if (c === '/' && regexMayStart(i)) { let j = i + 1, cls = false; while (j < n && s[j] !== '\n' && (cls || s[j] !== '/')) { if (s[j] === '\\') j++; else if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; j++; } out += s.slice(i, j + 1); i = j + 1; continue; }
    out += c; i++;
  }
  return out;
}
/** verify r4 (attack 5): ELEMENT HELPERS — a function forwarding a parameter to `document.createElement` (`const el = (tag, cls) =>
 *  …`, `export function el(tag …`) and called as `el('textarea', …)`; an EXPORTED one reaches its importers under their local
 *  name (`import { el as chanEl } from './channel-chrome.js'`). The r3 census missed every surface made this way — the outbox
 *  editor, the For-you window's reply box and filter, the integrations window's fields, the reach / filter editors' selects —
 *  and every one made with a conditional tag (`createElement(multiline ? 'textarea' : 'input')`: THE INPUT DIALOG's single-line
 *  box; the jobs panel's textarea). → Map name → exported? */
export function helperNames(code) {
  const own = new Map();
  for (const m of code.matchAll(/(export\s+)?(?:function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\b|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(\s*([A-Za-z_$][\w$]*)\b[^)]*\)|([A-Za-z_$][\w$]*))\s*=>)/g)) {
    const name = m[2] || m[4], param = m[3] || m[5] || m[6];
    if (!name || !param) continue;
    if (new RegExp('document\\.createElement\\(\\s*' + param + '\\s*\\)').test(code.slice(m.index, m.index + 600))) own.set(name, !!m[1]);
  }
  return own;
}
export function importedHelpers(code, exportedOf) {
  const out = [];
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/([\w.-]+)['"]/g)) {
    const ex = exportedOf.get(m[2]); if (!ex) continue;
    for (const part of m[1].split(',')) { const p = part.trim().split(/\s+as\s+/); const orig = p[0].trim(), local = (p[1] || p[0]).trim(); if (orig && ex.has(orig)) out.push(local); }
  }
  return out;
}
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** the constructs by TAG: a template `<tag`, `createElement(…'tag'…)` with any expression inside (a conditional tag), a helper call
 *  with the literal as any argument */
export const TAG_KINDS = { input: ['input'], textarea: ['textarea'], select: ['select'], iframe: ['iframe'], canvas: ['canvas'], details: ['details', 'summary'], datalist: ['datalist'] };
/** the constructs by PATTERN (verify r4 adds the ones the r3 grep could not see: an ARIA text box, a combobox / listbox widget of
 *  ours, `inputmode`, `designMode`, `execCommand` (a copy fallback's companion), a shadow root and `delegatesFocus`) */
export const RE_KINDS = {
  contenteditable: /\.contentEditable\s*=|\bcontenteditable\s*=|setAttribute\(['"]contenteditable['"]/i,
  textbox: /role=\\?["']?textbox|['"]role['"]\s*,\s*['"]textbox['"]/i,
  combobox: /role=\\?["']?(?:combobox|listbox)|['"]role['"]\s*,\s*['"](?:combobox|listbox)['"]/i,
  inputmode: /\binputmode\s*=|\.inputMode\s*=|setAttribute\(['"]inputmode['"]/i,
  designmode: /\.designMode\s*=/,
  execcommand: /\bexecCommand\(/,
  shadow: /\battachShadow\(/,
  delegatesfocus: /delegatesFocus\s*:\s*true/,
  tabindex: /\.tabIndex\s*=\s*-?\d|\btabindex\s*=\s*\\?["']?-?\d|setAttribute\(['"]tabindex['"]/i,
};
/** the LIBRARY constructors: `new EditorView(` / `new Terminal(` / `new RFB(` — and the same under an import ALIAS
 *  (`import { EditorView as EV } from 'codemirror'`, a default import of noVNC under any name) */
export const LIB_CTORS = [
  { kind: 'codemirror', name: 'EditorView', from: /^(?:codemirror|@codemirror\/view)$/ },
  { kind: 'xterm', name: 'Terminal', from: /^@?xterm(?:\/xterm)?$/ },
  { kind: 'novnc', name: 'RFB', from: /novnc/, dflt: true },
  { kind: 'tiptap', name: 'Editor', from: /^@tiptap\/core$/, importedOnly: true },   // (2.369.221) `Editor` is a generic name: only the one imported from @tiptap/core
];
/** lane takeover-census-fast: the scan is MEMOIZED per file text — the code-only text, its helper names, and the kinds found
 *  under a given helper list. One full read of the tree costs ~0.7 s, and the controls below read it twenty-odd times with one
 *  file changed or added; an unchanged file is a lookup (the rules are the same: only repeated work is skipped). */
const CODE_OF = new Map(), HELPERS_OF = new Map(), KINDS_OF = new Map();
const codeOf = (t) => { let c = CODE_OF.get(t); if (c === undefined) { c = codeOnly(t); CODE_OF.set(t, c); } return c; };
const helpersOf = (c) => { let h = HELPERS_OF.get(c); if (!h) { h = helperNames(c); HELPERS_OF.set(c, h); } return h; };
function kindsOf(c, helpers) {
  let byHelpers = KINDS_OF.get(c); if (!byHelpers) { byHelpers = new Map(); KINDS_OF.set(c, byHelpers); }
  const hk = helpers.join(','); const hit = byHelpers.get(hk); if (hit) return hit;
  const kinds = [];
  for (const [k, tags] of Object.entries(TAG_KINDS)) {
    const lit = '[\'"](?:' + tags.join('|') + ')[\'"]';
    const res = [new RegExp('<(?:' + tags.join('|') + ')\\b'), new RegExp('createElement\\([^)\\n]*' + lit)];
    if (helpers.length) res.push(new RegExp('\\b(?:' + helpers.map(esc).join('|') + ')\\([^;\\n]*?' + lit));
    if (res.some((re) => re.test(c))) kinds.push(k);
  }
  for (const [k, re] of Object.entries(RE_KINDS)) if (re.test(c)) kinds.push(k);
  for (const L of LIB_CTORS) {
    const names = L.importedOnly ? [] : [L.name];
    for (const m of c.matchAll(/import\s+(?:([A-Za-z_$][\w$]*)|\{([^}]*)\})\s*from\s*['"]([^'"]+)['"]/g)) {
      if (!L.from.test(m[3])) continue;
      if (m[1] && L.dflt) names.push(m[1]);
      if (m[2]) for (const part of m[2].split(',')) { const p = part.trim().split(/\s+as\s+/); if (p[0].trim() === L.name) names.push((p[1] || p[0]).trim()); }
    }
    if (new RegExp('new\\s+(?:' + names.map(esc).join('|') + ')\\(').test(c)) kinds.push(L.kind);
  }
  byHelpers.set(hk, kinds);
  return kinds;
}
export function surfaceHits(files) {
  const codes = files.map(([f, t]) => [f, codeOf(t)]);
  const exportedOf = new Map(), ownOf = new Map();
  for (const [f, c] of codes) { const h = helpersOf(c); ownOf.set(f, [...h.keys()]); exportedOf.set(f, new Set([...h].filter(([, ex]) => ex).map(([k]) => k))); }
  const out = new Set();
  for (const [f, c] of codes) {
    const helpers = [...new Set([...ownOf.get(f), ...importedHelpers(c, exportedOf)])];
    for (const k of kindsOf(c, helpers)) out.add(f + ' ' + k);
  }
  return out;
}
export function censusVerdict(hits, rows) {
  const keys = rows.map((r) => r[0] + ' ' + r[1]);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  const unclassified = [...hits].filter((h) => !keys.includes(h)).sort();
  const dead = keys.filter((k) => !hits.has(k)).sort();
  const badClass = rows.filter((r) => !String(r[2]).split('+').every((c) => SURFACE_CLASSES[c])).map((r) => r[0] + ' ' + r[1] + ' → ' + r[2]);
  return { unclassified, dead, dup, badClass, ok: !unclassified.length && !dead.length && !dup.length && !badClass.length };
}
/** The tree the census judges: every TRACKED .js under src/lib/** (git ls-files — the law: never readdirSync; a tracked file
 *  deleted on disk is skipped) keyed by its path under src/lib, plus public/index.html as 'index.html' (verify r4: the sidebar
 *  search box, the New Session / fork / grid dialogs — surfaces born in the markup). `repo` may be a scratch git copy (②). */
export function readLib(repo) {
  const files = execFileSync('git', ['ls-files', '--', 'src/lib'], { cwd: repo, encoding: 'utf8', env: gitEnvFrom(process.env) }).split('\n').filter((f) => f.endsWith('.js') && fs.existsSync(path.join(repo, f)));
  return [...files.map((f) => [f.replace(/^src\/lib\//, ''), fs.readFileSync(path.join(repo, f), 'utf8')]), ['index.html', fs.readFileSync(path.join(repo, 'public/index.html'), 'utf8')]];
}
/** ②'s plant: a roving-focus <button> with its own keydown handler — the `tabindex` construct the census reads (a bare <button>
 *  is every button: the census enumerates what TAKES typing or the focus, never every listener). */
export const PLANTED_SURFACE = "\nconst plantedRove = document.createElement('button'); plantedRove.tabIndex = 0; plantedRove.addEventListener('keydown', (e) => { e.stopPropagation(); });\n";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pass = 0, fail = 0;
  const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
  const J = (x) => JSON.stringify(x);
  const t0 = Date.now();

  console.log('① the input-surface census: every element that takes keys, grep-derived over git ls-files, classified, every class known');
  const LIB = readLib(REPO);
  const HITS = surfaceHits(LIB);
  const CV = censusVerdict(HITS, CENSUS);
  ok(CV.ok && HITS.size === CENSUS.length && HITS.size >= 120, `the census: ${HITS.size} (file, construct) surfaces in ${LIB.length} files (src/lib/** + index.html) — every one classified, no dead row, no duplicate, every class known`, J(CV));
  { const byClass = {}; for (const r of CENSUS) for (const c of r[2].split('+')) (byClass[c] ||= []).push(r[0].replace(/\.js$/, '') + ':' + r[1]);
    const unused = Object.keys(SURFACE_CLASSES).filter((c) => !byClass[c]);
    ok(!unused.length, `every class has rows (${Object.entries(byClass).map(([c, l]) => c + ' ' + l.length).join(' · ')})`, unused.join(', '));
    console.log('  census by class: ' + Object.entries(SURFACE_CLASSES).map(([c, v]) => `\n    ${c.padEnd(8)} ${v.press} — ${v.focus}\n             rows: ${(byClass[c] || []).join(', ')}`).join('')); }

  console.log('② the planted surface: a scratch git copy of the tree, one roving-focus <button> in the desktop live view ⇒ RED by name');
  { const S = scratchDir('takeover-census');
    try {
      for (const [rel, text] of LIB) { const p = rel === 'index.html' ? path.join(S, 'public', rel) : path.join(S, 'src/lib', rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
      const git = (...a) => execFileSync('git', a, { cwd: S, encoding: 'utf8', env: gitEnvFrom(process.env), stdio: ['ignore', 'pipe', 'pipe'] });
      git('init', '-q'); git('add', '-A');
      const copy = readLib(S), copyHits = surfaceHits(copy), clean = censusVerdict(copyHits, CENSUS);
      ok(clean.ok && copy.length === LIB.length && copyHits.size === HITS.size, `the scratch copy (git init + add, the same ls-files road, ${copy.length} files) reads exactly as today's tree: green`, J(clean));
      const live = path.join(S, 'src/lib/vnc-view.js');
      ok(fs.existsSync(live) && !/tabIndex|tabindex/i.test(codeOnly(fs.readFileSync(live, 'utf8'))), 'the desktop live view (vnc-view.js) has no tabindex construct of its own before the plant');
      fs.appendFileSync(live, PLANTED_SURFACE); git('add', '-A');
      const red = censusVerdict(surfaceHits(readLib(S)), CENSUS);
      ok(!red.ok && J(red.unclassified) === J(['vnc-view.js tabindex']) && !red.dead.length && !red.dup.length && !red.badClass.length, 'NEGATIVE CONTROL (one roving-focus <button> with a keydown handler planted in vnc-view.js): RED — "vnc-view.js tabindex" unclassified, nothing else moves', J(red));
      console.log('  the control\'s verdict: ' + J(red));
      fs.writeFileSync(path.join(S, 'src/lib/planted-untracked.js'), PLANTED_SURFACE);
      const untracked = censusVerdict(surfaceHits(readLib(S)), CENSUS);
      ok(J(untracked.unclassified) === J(['vnc-view.js tabindex']), 'an UNTRACKED file is not in the tree the census judges (git ls-files lists tracked files: a lane\'s gate runs on what it committed)', J(untracked));
      git('add', '-A');
      const tracked = censusVerdict(surfaceHits(readLib(S)), CENSUS);
      ok(J(tracked.unclassified) === J(['planted-untracked.js tabindex', 'vnc-view.js tabindex']), '…and the moment it is added, its surface is named too', J(tracked));
    } finally { fs.rmSync(S, { recursive: true, force: true }); }
  }

  console.log('③ the census\'s own controls: a row dropped, a construct added / gone, an unknown class, a comment, the belt\'s omissions');
  // the census's own controls: a row removed ⇒ its surface named unclassified; a construct added to a file ⇒ named; a row whose
  // construct left its file ⇒ dead; an unknown class ⇒ named
  { const drop = CENSUS.filter((r) => !(r[0] === 'code-editor.js' && r[1] === 'codemirror'));
    const d = censusVerdict(HITS, drop);
    ok(!d.ok && J(d.unclassified) === J(['code-editor.js codemirror']), 'NEGATIVE CONTROL (the code editor\'s row removed): the census names "code-editor.js codemirror" unclassified', J(d));
    const added = surfaceHits([...LIB.map(([f, t]) => f === 'hex-viewer.js' ? [f, t + "\nconst x = document.createElement('iframe');\n"] : [f, t])]);
    const a = censusVerdict(added, CENSUS);
    ok(!a.ok && J(a.unclassified) === J(['hex-viewer.js iframe']), 'NEGATIVE CONTROL (a frame added to hex-viewer.js): the census names "hex-viewer.js iframe" unclassified', J(a));
    const gone = surfaceHits(LIB.map(([f, t]) => f === 'window.js' ? [f, t.replace(/document\.createElement\('canvas'\)/g, 'null')] : [f, t]));
    const g = censusVerdict(gone, CENSUS);
    ok(!g.ok && J(g.dead) === J(['window.js canvas']), 'NEGATIVE CONTROL (window.js\'s canvas gone): its row is named DEAD', J(g));
    const bad = censusVerdict(HITS, CENSUS.map((r) => r[0] === 'chat-input.js' && r[1] === 'textarea' ? [r[0], r[1], 'texty', r[3]] : r));
    ok(!bad.ok && bad.badClass.length === 1, 'NEGATIVE CONTROL (a row with an unknown class): named', J(bad.badClass));
    const commented = surfaceHits([['x.js', "// a <select> in a comment\n/**\n * <iframe> in a doc comment\n */\nconst u = 'https://x'; // <textarea> trailing\n/* <input> in a block */\n/*\n * <canvas> in a\n * doc block */\n"]]);
    ok(commented.size === 0, 'the grep reads CODE: a surface named only in a comment (line, doc block, trailing, a block on its own line) is no surface; a URL\'s :// keeps its line', J([...commented])); }
  // verify r4 (attack 5): THE BELT'S OWN OMISSIONS — each construct that slipped past the r3 grep is now named, on a synthetic file
  // (the census's controls stay red on a REAL omission, never on a comment): a block comment BEFORE code on its line, a `/*` inside a
  // string, a regex with a quote, a surface in a template literal whose line begins with ` * `, a conditional tag, an element helper (own,
  // and imported under an alias from a file that exports it), a library constructor under an alias, and every pattern kind
  { const probe = (name, text, want) => { const h = surfaceHits([...LIB, [name, text]]); const got = [...h].filter((x) => x.startsWith(name + ' ')).map((x) => x.slice(name.length + 1)).sort(); ok(J(got) === J([...want].sort()), `NEGATIVE CONTROL (the belt sees ${want.length ? want.join(' + ') : 'nothing'} in: ${text.replace(/\n/g, '⏎').slice(0, 96)})`, J(got)); };
    probe('p1.js', "/* a note */ const i = document.createElement('input');\n", ['input']);
    probe('p2.js', "const a = 'image/*'; const s = document.createElement('select'); const b = 'x';\n", ['select']);
    probe('p3.js', "const r = /'/g; const t = document.createElement('textarea');\n", ['textarea']);
    probe('p4.js', "const html = `\n * <input type=text>\n`;\n", ['input']);
    probe('p5.js', "const i = document.createElement(multi ? 'textarea' : 'input');\n", ['input', 'textarea']);
    probe('p6.js', "const mk = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };\nconst t = mk('textarea', 'box'); const s = mk('div', 'x', mk('select'));\n", ['select', 'textarea']);
    probe('p7.js', "import { el as z } from './channel-chrome.js';\nconst f = z('iframe');\n", ['iframe']);
    probe('p8.js', "import { el } from './hex-viewer.js';\nconst f = el('iframe');\n", []); // hex-viewer exports no element helper: `el` there is nobody's
    probe('p9.js', "import { EditorView as EV } from 'codemirror';\nconst v = new EV({});\n", ['codemirror']);
    probe('p10.js', "import Rfb from '../../public/novnc.js';\nconst v = new Rfb(el, url);\n", ['novnc']);
    probe('p11.js', "const d = document.createElement('div'); d.setAttribute('role', 'textbox'); d.inputMode = 'numeric'; document.designMode = 'on'; const s = h.attachShadow({ mode: 'open', delegatesFocus: true }); document.execCommand('copy'); const l = '<datalist id=x>'; const c = '<div role=\"combobox\">';\n", ['textbox', 'inputmode', 'designmode', 'shadow', 'delegatesfocus', 'execcommand', 'datalist', 'combobox']);
    probe('p12.js', "const d = document.createElement(exp ? 'details' : 'div'); const s = '<summary>x</summary>'; d.setAttribute('contenteditable', 'true'); d.setAttribute('tabindex', '0');\n", ['details', 'contenteditable', 'tabindex']);
    probe('p14.js', "import { Editor as TE } from '@tiptap/core';\nconst e = new TE({ element: host });\n", ['tiptap']);
    probe('p15.js', "const e = new Editor({});\n", []); // an `Editor` imported from nowhere (or elsewhere) is nobody's surface
    probe('p13.js', "// <input> here\n/* <textarea> */ const x = 1; /* <select>\n<iframe> */\nconst re = /<canvas>/; const s = \"// <details>\";\n", ['canvas', 'details']); // a regex literal and a string are code; the comments are not
  }


  console.log(`\n(${Date.now() - t0} ms)`);
  console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}
