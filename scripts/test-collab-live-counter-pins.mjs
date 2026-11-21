#!/usr/bin/env node
// THE COLLAB LIVE COUNTER's WIRING PINS (fast, text only — lane text-legs, B-94d3). MOVED VERBATIM from the heavy scripts/test-collab-live-counter.mjs (its browser /
// hub legs and every mutant CONTROL stay there): ④ — a pure composer with an unstaged call site is dead code: chat-view, chat-renderers, chat-input, chat-run-summary and chat.css call the PURE collab module. Each reads the file it pins BY NAME, so ci.mjs's affected rule
// selects this suite on a change of that file.
// Run: node scripts/test-collab-live-counter-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof n !== 'string') throw new TypeError('a leg\'s name is not a string — its arguments are swapped (test-ci-gate-tiers §7b)'); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 500) : ''}`); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

console.log('— ④ wiring pins (a pure composer with an unstaged call site is dead code)');
{
  const cv = read('src/lib/chat-view.js');
  const cr = read('src/lib/chat-renderers.js');
  const ci = read('src/lib/chat-input.js');
  const rs = read('src/lib/chat-run-summary.js');
  check('chat-view imports the composers from the PURE collab module', /import \{ collabTrafficStats, collabHeadText, collabRunPart, subAgentStreamLabel \} from '\.\.\/collab-row\.js';/.test(cv));
  check('the renderer asks the VIEW whether a card is live (view-only ⇒ always frozen) and the answer is REMEMBERED',
    /isCollabLive: \(msg\) => this\._noteCollabHeadPainted\(msg\?\.id, this\._liveCollabId\(\) === msg\?\.id\),/.test(cv)
    && /this\._isCollabLive = isCollabLive \|\| null;/.test(cr)
    && /const live = !!this\._isCollabLive\?\.\(msg\);/.test(cr));
  check('liveness = the LAST message, and only while the turn streams', /_liveCollabId\(\) \{\s*\n\s*if \(!this\._typingSince \|\| this\._disposed\) return null;[\s\S]{0,220}return \(last\?\.collab && !last\.collab\.report\) \? last\.id : null;/.test(cv));
  check('the ticker is only armed when something is live (a claude session never carries an interval) and paints once immediately',
    /if \(this\._collabTimer \|\| this\._disposed \|\| !this\._liveCollabId\(\)\) return;\s*\n\s*this\._collabTimer = setInterval[^\n]*\n\s*this\._tickCollab\(\);/.test(read('src/lib/chat-view.js')));
  check('ONE interval per ChatView, bound to the window AbortController + cleared in dispose (never one timer per message)',
    (cv.match(/setInterval\(\(\) => this\._tickCollab\(\), 1000\)/g) || []).length === 1
    && /pressSignal\.addEventListener\('abort', \(\) => this\._stopCollabTick\(\), \{ once: true \}\)/.test(cv)
    && /this\._stopCollabTick\(\);/.test(cv.slice(cv.indexOf('  dispose() {'))));
  check('a hidden window is a NO-OP and resume repaints immediately (setSuspended)',
    /_tickCollab\(\) \{\s*\n\s*if \(this\._disposed\) return;\s*\n\s*if \(this\._suspended\) return;/.test(cv)
    && /this\._tickCollab\(\); \/\/ the ages went stale while hidden/.test(cv));
  check('the ticker never pages, trims, scrolls or writes the pin', (() => {
    const body = cv.slice(cv.indexOf('  _tickCollab() {'), cv.indexOf('  // _showTyping / _hideTyping delegate'));
    return body.length > 200 && !/_extendTop|_extendBottom|_trimTop|_trimBottom|_pinned =|scrollTop =/.test(body);
  })());
  check('op dispatch notes the record KIND after the message is applied (a coalescing edit carries the grown rows)',
    // THE LAW: the record's kind is noted right AFTER the message is applied. .388 (the train's seam): midturn-order's create
    // carries its place ({before, at}) as a second argument — the order the law needs is unchanged
    /this\._onCreateMessage\(op\.message(?:, op\.before \? op : null)?\);\s*\n\s*this\._noteRecordKind\(op\.message\);/.test(cv)
    && /this\._onEditMessage\(op\.id, op\.fields\);[\s\S]{0,140}this\._noteRecordKind\(this\._messages\.find\(\(m\) => m\.id === op\.id\)\);/.test(cv));
  check('the server stays the label authority: the override yields back ONLY what it took',
    /_onServerStreamLabel\(label, kind\) \{/.test(cv) && /this\._collabLabelShown = false; \/\/ the server is writing the line itself now/.test(cv)
    && /if \(this\._collabLabelShown\) \{\s*\n\s*this\._collabLabelShown = false;/.test(cv)
    && !/if \(msg\.label\) this\._showTyping\(msg\.label, msg\.kind \|\| null\);/.test(cv));
  check('turn end FREEZES every surface (a ticking age on a finished turn reads as progress)',
    /_hideTyping\(\) \{[\s\S]{0,320}this\._freezeCollab\(\);/.test(cv) && /_freezeCollab\(\) \{\s*\n\s*this\._stopCollabTick\(\);/.test(cv));
  // r2 (verifier MAJOR): the freeze walked only the card the TICKER had
  // painted, so a burst that ran entirely while the window was hidden — the
  // ticker is a no-op then — never froze at all.
  check('the freeze walks the SET of live-painted heads, never "the card the ticker last painted"',
    /_freezeCollab\(\) \{[\s\S]{0,260}this\._freezeStaleHeads\(null, now\);/.test(cv)
    && /_freezeStaleHeads\(liveId, now\) \{[\s\S]{0,220}for \(const id of \[\.\.\.this\._liveHeadIds\]\)/.test(cv)
    && /this\._liveHeadIds = new Set\(\);/.test(cv)
    && !/_tickedCollabId/.test(cv));
  check('…and the tick uses the same sweep (a card that stops being live is frozen once, whoever painted it)',
    /_tickCollab\(\) \{[\s\S]{0,700}this\._freezeStaleHeads\(liveId, now\);\s*\n\s*if \(liveId\) this\._paintCollabHead\(liveId, true, now\);/.test(cv));
  // chat-view.js is DOM-free at import and its resume guards are unit-tested on
  // PROTOTYPE-ONLY views whose constructor never ran (test-chat-trim-guard) —
  // setSuspended(false) runs a tick on those, so every new constructor field
  // the tick path touches must be optional there (caught by that suite: a bare
  // `this._liveHeadIds.size` threw and took the whole resume suite down).
  check('the live-head set is lazily created and read optionally (a prototype-only view still ticks)',
    /const ids = \(this\._liveHeadIds \|\|= new Set\(\)\);/.test(cv)
    && /if \(!this\._liveHeadIds\?\.size\) return;/.test(cv)
    && /this\._liveHeadIds\?\.delete\(msgId\); return;/.test(cv));
  // r2 (verifier BLOCKER): the label CHANGES on every tick (the age), so a
  // memo keyed on the label text could never protect anything — the button was
  // rebuilt once a second and trusted Stop clicks were swallowed. A text
  // change must be a textContent write into the label's own element.
  check('ChatInput.showTyping writes the label TEXT and never rebuilds the Stop button while the kind is unchanged',
    /const liveBtn = this\._isStreaming \? this\._streamStatus\.querySelector\('\.chat-interrupt-btn'\) : null;/.test(ci)
    && /const labelEl = liveBtn && this\._typingKind === kind \? this\._streamStatus\.querySelector\('\.chat-stream-label'\) : null;/.test(ci)
    && /if \(labelEl\) \{\s*\n\s*if \(this\._typingLabel !== label\) \{ labelEl\.textContent = label; this\._typingLabel = label; \}/.test(ci)
    && /<span class="chat-stream-label">\$\{escHtml\(label\)\}<\/span>/.test(ci)
    && /this\._typingLabel = null;[\s\S]{0,80}this\._typingKind = null;/.test(ci));
  check('…and the button-less pending line still falls through to a FULL render (it has no .chat-interrupt-btn)',
    /this\._typingLabel = null; \/\/ this line has no Stop button/.test(ci));
  // The two lines are TWINS: the pin is their PARITY, never one spelling of
  // the paint-only spinner. 2.369.150's accessibility pass added
  // aria-hidden="true" to the spinner at every creation site (test-ax-paint ③
  // owns that census) and the old literal `<span class="chat-spinner"></span>`
  // went red on markup the invariant never depended on. What it depends on:
  // the label is its OWN element in BOTH lines (same template, extracted from
  // each file and compared) and the read-only line takes the text-write path.
  // The behaviour itself is proven in ⑤b on a real read-only view.
  const STREAM_LINE = /<span class="chat-spinner"[^>]*><\/span> <span class="chat-stream-label">\$\{escHtml\(label\)\}<\/span>/;
  const roLine = (cv.match(STREAM_LINE) || [])[0] || null, ciLine = (ci.match(STREAM_LINE) || [])[0] || null;
  check('the read-only stream line carries the same label element (a ticking age is a text write there too)',
    !!roLine && roLine === ciLine
    && /if \(roLabel && !this\._streamStatus\.classList\.contains\('hidden'\)\) \{/.test(cv),
    `read-only: ${roLine} · chat-input: ${ciLine}`);
  check('the run label takes a PRE-COMPOSED collab segment — chat-run-summary still imports nothing but PURE modules (B-40f8: src/assistant-note.js; int209: src/exit-call.js, lane exit-calls-in-history; lane touch-chip-cause: src/shell-words.js, the shell scanner — never src/channel-touch.js)',
    /collabPart: collabRunPart\(collabStats, \{ now, live, t \}\)/.test(cv) && /collabPart = ''/.test(rs) && (rs.match(/^\s*import .*$/gm) || []).every((l) => /from '\.\.\/(?:assistant-note|exit-call|shell-words)\.js';/.test(l)));
  check('the run record carries the label recipe so the ticker never builds a second kind table',
    /const rec = \{ header, members, inline, footer: null, label, open: false, mkLabel, collabStats/.test(cv)
    && /run\.mkLabel\(\{ now, live \}\)/.test(cv));
  check('the run header keeps a separator before the clickable chips (r2: "2 sub-agent events water_research" read as one phrase)',
    /\$\{label \? ' · ' : ' '\}<span class="chat-run-agents">/.test(cv));
  check('the ticker repaints header, footer AND the floating bar (three views of ONE label)',
    /const footLabel = run\.footer\?\.querySelector\('\.chat-run-label'\);/.test(cv) && /if \(this\._runBarRun === run\) this\._scheduleRunBar\(\);/.test(cv));
  check('chat.css styles the head with theme vars only (§17)', /\.chat-collab-head \{ color: var\(--text\); font-variant-numeric: tabular-nums; \}/.test(read('public/chat.css')));
  for (const f of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) {
    const d = read(f);
    const keys = ['"Sub-agent traffic":', '"{n} message":', '"{n} agent":', '"{n} sub-agent":', '"last {age} ago":', '"over {span}":', '"{n}s":', '"{m} min {s} s":', '"{s} s":', '"Sub-agents working — {msgs} this turn":', '"Sub-agents working — {msgs} this turn, last {age} ago":', '"record timestamp":', '"arrival time":'];
    check(`${path.basename(f)} carries every new key`, keys.every((k) => d.includes(k)), keys.filter((k) => !d.includes(k)).join(' '));
  }
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
