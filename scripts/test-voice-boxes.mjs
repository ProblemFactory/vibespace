#!/usr/bin/env node
// test-voice-boxes — lane voice-everywhere (owner 2026-10-13: "我们是不是应该在每个输入框都做一下那个 Dropline？我在手机上想要
// 回一下 inbox 里的东西，发现没有"): THE CENSUS OF MESSAGE BOXES. Every textarea the client builds under src/lib
// (createElement('textarea') / mk('textarea') / el('textarea') / `<textarea` in markup) is a ROW: `attached` (its file
// calls attachDictation — THE one attach point, src/lib/voice-input.js; the chat composer's flavour is createVoiceInput)
// or left out with its one-line reason (not a message box: a settings / form field, a key or config paste, a stored
// record's field, an off-screen copy helper, a keyboard proxy…). A new textarea without a row is RED, a row whose box
// is gone is RED (a dead row), a file whose attach calls do not match its attached rows is RED.
// + the source pins of the attach point: the mic never focuses (no .focus() in voice-input.js; pointerdown + mousedown
//   cancelled; out of the phone's tab order), ONE implementation (one MediaRecorder, one dictate fetch), absent when
//   off (html.voice-absent + the plugins-updated broadcast), an idle mic holds no document listener.
// RED controls: a planted textarea, a dropped attach call, a dead row, a planted focus() — each must turn the census red.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = 'src/lib';
let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : ''}`); }
};
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// THE CENSUS — [file, anchor (in the site line or the 3 lines under it), verdict, n = how many sites the row covers]
// verdict 'attached' = a message box with the microphone; `by` = the file that attaches it (a caller's hook)
const A = 'attached';
const ROWS = [
  ['chat-input.js', "this._textarea = document.createElement('textarea')", A, 1, 'the chat composer (createVoiceInput = the chat flavour)'],
  ['user-todos-row.js', "ta.className = 'ut-reply-input'", A, 1, 'the For-you reply box'],
  ['inbox-window.js', "'iw-reply-input'", A, 1, 'the Inbox window reply'],
  ['channel-window.js', "t('Write a message — it is sent at once, as you')", A, 1, 'the channel composer (a direct send / a reply)'],
  ['channel-window.js', 'Message the group as You', A, 1, 'the group composer'],
  ['channel-thread-pane.js', 'Reply in thread…', A, 1, 'the thread reply'],
  ['channel-webhook.js', 'chan-wh-text', A, 1, 'a message to a path\'s callers'],
  ['channel-group-dialogs.js', 'chan-group-context', A, 1, 'a new group\'s opening context (the first thing each member reads)'],
  ['channel-outbox.js', 'chan-prop-edit', A, 1, 'an agent\'s drafted reply, edited before it goes'],
  ['design-window.js', 'design-comment-input', A, 1, 'a comment to the agent on a design frame'],
  ['doc-window-ui.js', "ta.placeholder = t('What should change?')", A, 1, 'a comment to the agent on a doc passage'],
  ['chat-status-bar.js', 'chat-design-brief', A, 1, 'the brief for a new design'],
  ['chat-status-bar.js', 'chat-ask-custom', A, 1, 'the goal the agent works toward'],
  ['utils.js', "createElement(multiline ? 'textarea'", A, 1, 'showInputDialog multiline — attached by its caller through `decorate` (Custom review instructions)', 'chat-status-bar.js'],
  ['window-share.js', 'wshare-note-input', A, 1, 'the note to the agent a window is shared with'],
  ['jobs-panel.js', "b.type === 'input' ? 'input' : 'textarea'", A, 1, 'a job\'s question answered in its panel (the textarea block)'],
  ['channel-filter-editor.js', 'chan-dec-cond', 'a notification rule\'s condition — a setting the judge reads, not a message', 1],
  ['mounts-dialog.js', "el = document.createElement('textarea')", 'a mount form\'s field (configuration)', 1],
  ['doc-window-ui.js', 'doc-raw-edit', 'a doc block\'s raw source — an editor of the document, not a message', 1],
  ['browser-live-window.js', 'browser-live-kbd', 'the hidden keyboard proxy of a live browser (keys go to the page)', 1],
  ['xpra-view.js', 'const ime =', 'the hidden IME proxy of a desktop window (keys go to the app)', 1],
  ['xpra-view.js', 'const sime =', 'the hidden IME proxy of a satellite pane (keys go to the app)', 1],
  ['picture-shell.js', "ta.value = String(text ?? '')", 'an off-screen copy helper', 1],
  ['picture-shell.js', 'vnc-paste-input', 'text pasted onto a remote desktop\'s clipboard — not a message', 1],
  ['task-log.js', "ta.className = 'task-log-edit-detail'", 'a backlog item\'s stored detail (a record field)', 1],
  ['task-log.js', 'const addDetail', 'a new backlog item\'s detail (a record field)', 1],
  ['task-detail.js', 'task-detail-objective', 'a task\'s stored objective (a record field)', 1],
  ['sidebar-mounts.js', 'mounts-key-paste', 'an SSH private key paste', 1],
  ['channel-webhook.js', 'chan-wh-paste', 'a pairing code paste (a credential — lane webhook-pair-join)', 1],
  ['sidebar-mounts.js', 'k.publicKey', 'a read-only public key to copy', 1],
  ['sidebar-mounts.js', 'device-pair-cmd', 'a read-only pairing command to copy', 1],
  ['sidebar-mounts.js', '[gdrive]', 'an rclone.conf paste', 1],
  ['sidebar-mounts.js', '<textarea readonly', 'read-only links / tokens / config to copy', 5],
  ['sidebar-mounts.js', '<textarea name="${k}"', 'a mount form\'s field (configuration)', 1],
  ['incident-recorder.js', "What went wrong?", 'the incident snapshot\'s optional note, frozen with the diagnostics — not a conversation', 1],
  ['settings-ui.js', "const textarea = document.createElement('textarea')", 'a JSON setting field', 1],
  ['settings-ui.js', 'settings-multiline-text', 'a multi-line setting field', 1],
  ['terminal.js', "position:fixed;left:-9999px", 'an off-screen copy helper', 1],
  ['utils.js', "ta.style.cssText = 'position:fixed;left:-9999px'", 'an off-screen copy helper', 1],
  ['manage-agents.js', 'ta.maxLength = cap', 'an agent profile\'s instruction setting (a settings field)', 1],
].map(([file, anchor, verdict, n, why, by]) => ({ file, anchor, verdict, n: n || 1, why: verdict === A ? why : verdict, by: by || null }));

const SITE = /(?:createElement|\bmk|\bel)\([^;]*?'textarea'|<textarea\b/;
const CALL = /\b(?:attachDictation|createVoiceInput)\(/g;
const callsIn = (src) => src.split('\n').filter((l) => !/^\s*import\b|^\s*(?:export\s+)?function\s/.test(l) && !/^\s*\/\//.test(l)).join('\n').match(CALL)?.length || 0;

/** files = {name: text}; rows as above → {sites, problems[]} — PURE so the RED controls run it on planted copies */
function census(files, rows) {
  const problems = [], sites = [], used = new Map(rows.map((r) => [r, 0]));
  for (const [name, src] of Object.entries(files)) {
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      if (!SITE.test(l)) return;
      const ctx = lines.slice(i, i + 4).join('\n');
      const hits = rows.filter((r) => r.file === name && ctx.includes(r.anchor));
      sites.push({ name, line: i + 1, row: hits[0] || null });
      if (hits.length !== 1) problems.push(hits.length ? `${name}:${i + 1} matches ${hits.length} rows` : `${name}:${i + 1} a NEW textarea — attach the microphone (attachDictation) or give its row a reason: ${l.trim().slice(0, 100)}`);
      else used.set(hits[0], used.get(hits[0]) + 1);
    });
  }
  for (const [r, k] of used) if (k !== r.n) problems.push(`row ${r.file} «${r.anchor}» covers ${k} site(s), declared ${r.n}${k ? '' : ' — a DEAD row'}`);
  const want = {};
  for (const r of rows) if (r.verdict === A) { const f = r.by || r.file; want[f] = (want[f] || 0) + r.n; }
  for (const [f, k] of Object.entries(want)) {
    const got = files[f] === undefined ? -1 : callsIn(files[f]);
    if (got !== k) problems.push(`${f}: ${got} attach call(s) for ${k} attached box(es)`);
  }
  return { sites, problems };
}

const libFiles = () => Object.fromEntries(fs.readdirSync(path.join(REPO, LIB)).filter((f) => f.endsWith('.js')).sort().map((f) => [f, read(`${LIB}/${f}`)]));
const FILES = libFiles();

console.log('① the census: every textarea under src/lib is a row — attached, or its reason');
const C = census(FILES, ROWS);
ok(C.problems.length === 0, `${C.sites.length} textareas, ${ROWS.filter((r) => r.verdict === A).length} message boxes attached, ${ROWS.filter((r) => r.verdict !== A).reduce((n, r) => n + r.n, 0)} left out with a reason — no new box, no dead row, attach calls match`, C.problems);
ok(C.sites.length >= 40, `the census regex sees the tree (${C.sites.length} sites ≥ 40 — a vacuous grep would see none)`, C.sites.length);
console.log('    attached:');
for (const r of ROWS.filter((x) => x.verdict === A)) console.log(`      · ${r.file} — ${r.why}`);
console.log('    left out:');
for (const r of ROWS.filter((x) => x.verdict !== A)) console.log(`      · ${r.file} «${r.anchor}»${r.n > 1 ? ` ×${r.n}` : ''} — ${r.why}`);
const named = ['user-todos-row.js', 'inbox-window.js', 'channel-window.js', 'channel-thread-pane.js', 'chat-input.js'];
ok(named.every((f) => ROWS.some((r) => r.file === f && r.verdict === A)), 'the owner\'s boxes are attached: chat, For-you reply, Inbox window reply, channel + thread composers', named);

console.log('② RED controls — each plant turns the census red');
{
  const planted = { ...FILES, 'zz-planted.js': "export function box() {\n  const note = document.createElement('textarea');\n  return note;\n}\n" };
  const r1 = census(planted, ROWS);
  ok(r1.problems.some((p) => /zz-planted\.js:2 a NEW textarea/.test(p)), 'RED: a planted textarea without a row', r1.problems);
  const dropped = { ...FILES, 'user-todos-row.js': FILES['user-todos-row.js'].replace('voiceField(ta, attachDictation(ta))', 'ta') };
  const r2 = census(dropped, ROWS);
  ok(dropped['user-todos-row.js'] !== FILES['user-todos-row.js'] && r2.problems.some((p) => /user-todos-row\.js: 0 attach call/.test(p)), 'RED: the For-you reply box without its attach call', r2.problems);
  const r3 = census(FILES, [...ROWS, { file: 'inbox-window.js', anchor: 'iw-gone-box', verdict: 'x', n: 1 }]);
  ok(r3.problems.some((p) => /iw-gone-box.*DEAD/.test(p)), 'RED: a row whose box is gone (a dead row)', r3.problems);
  const decoless = { ...FILES, 'chat-status-bar.js': FILES['chat-status-bar.js'].replace(/, decorate: \(ta\) => \{[^}]*\} \}/, ' }') };
  const r4 = census(decoless, ROWS);
  ok(decoless['chat-status-bar.js'] !== FILES['chat-status-bar.js'] && r4.problems.some((p) => /chat-status-bar\.js: 2 attach call/.test(p)), 'RED: Custom review\'s dialog without its decorate hook', r4.problems);
}

console.log('③ the attach point: ONE implementation, never a focus, absent when off, no idle listener');
const V = read(`${LIB}/voice-input.js`);
const pins = (src) => ({
  oneAttach: (src.match(/export function attachDictation\(/g) || []).length === 1,
  chatFlavour: /export function createVoiceInput\([^)]*\) \{\n\s*return attachDictation\(textarea, \{[^}]*placement: 'chat' \}\);/.test(src),
  oneRecorder: (src.match(/new MediaRecorder\(/g) || []).length === 1 && (src.match(/fetch\('\/api\/voice\/dictate'/g) || []).length === 1,
  noFocus: !/\.focus\(/.test(src),
  pressHeld: /btn\.addEventListener\('pointerdown', hold\);/.test(src) && /btn\.addEventListener\('mousedown', hold\);/.test(src) && /const hold = \(e\) => e\.preventDefault\(\);/.test(src),
  phoneTab: /matchMedia\('\(max-width: 768px\)'\)\.matches\) btn\.tabIndex = -1/.test(src),
  escWhileRecording: (src.match(/document\.addEventListener\('keydown', onKey, true\)/g) || []).length === 1 && /rec\.start\(250\);\n\s*document\.addEventListener\('keydown', onKey, true\)/.test(src) && /function release\(\) \{\n\s*document\.removeEventListener\('keydown', onKey, true\);/.test(src),
  docListeners: (src.match(/document\.addEventListener\(/g) || []).length === 2,
  absentClass: /classList\.toggle\('voice-absent', !voiceOn\)/.test(src),
  neverFocusedEnd: /stopSel = everFocused \?/.test(src),
});
const P = pins(V);
for (const [k, v] of Object.entries(P)) ok(v, `voice-input.js: ${({ oneAttach: 'ONE attachDictation', chatFlavour: 'createVoiceInput = attachDictation(…, placement chat)', oneRecorder: 'one MediaRecorder, one dictate request', noFocus: 'no .focus() anywhere — the mic never focuses the box (nor the chip\'s Undo)', pressHeld: 'pointerdown + mousedown cancelled on the button (no focus moves on the press)', phoneTab: 'the phone: tabIndex −1 (never a focus stop)', escWhileRecording: 'Esc is bound when recording starts and unbound at release', docListeners: 'two document listeners in the file: Esc (while recording) + ONE page-lifetime visibilitychange', absentClass: 'the plugin off / not connected ⇒ html.voice-absent', neverFocusedEnd: 'a box never focused takes the words at its end' })[k]}`);
ok(pins(V.replace('stopSel = null;\n    const before', 'stopSel = null; textarea.focus();\n    const before')).noFocus === false, 'RED: a planted textarea.focus() in insert() is caught');
const CSS = read('public/style.css');
ok(/html\.voice-absent \.chat-voice-btn \{ display: none !important; \}/.test(CSS), 'style.css (app-wide, not chat.css — a surface may load style.css alone): html.voice-absent hides every microphone (absent, never greyed)');
const APP = read(`${LIB}/app.js`);
ok(/if \(msg\.type === 'plugins-updated'\) noteVoicePlugins\(msg\.plugins\);/.test(APP), 'app.js: the plugins-updated broadcast tells every microphone (multi-client: another client switching voice off removes it here)');
ok(/noteVoiceStatus\(st\);/.test(read(`${LIB}/voice-plugin-card.js`)), 'voice-plugin-card.js: the card\'s status read tells every microphone too');
const PANEL = read(`${LIB}/user-todos-panel.js`);
ok(PANEL.includes("item.querySelector(':scope > .ut-body > .ut-reply textarea')") && !PANEL.includes('.ut-reply > textarea'), 'user-todos-panel.js: Send reads the reply inside its field (the box is no longer a direct child of .ut-reply)');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
