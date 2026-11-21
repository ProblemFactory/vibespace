#!/usr/bin/env node
// THE RESTORE LIVENESS — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from
// the heavy scripts/test-restore-liveness.mjs, whose fault-injected daemons, the end-to-end restore, the healer's functional legs
// and every patched-copy CONTROL (with its premise) stay there: §5 the wiring pins — one healer, two triggers, the liveness
// stamp. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-restore-liveness-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? `\n      ${extra}` : '')); } };

// ── § 5 ONE HEALER, TWO TRIGGERS ───────────────────────────────────────────
console.log('— §5 the attach probe and the input detector share ONE re-attach —');
{
  const wsSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf-8');
  // the detector moved with THE typing path into src/server/user-input.js
  // (design-user-inbox-reply D1.1: the ws chat-input case + the For-you reply share it)
  const uiSrc = fs.readFileSync(path.join(REPO, 'src/server/user-input.js'), 'utf-8');
  ok(/reattachLocalPty\(sessionId, session, `Broken pty stdin detected \(/.test(uiSrc) && /sendUserInput\(data\.sessionId, data\.text/.test(wsSrc),
    'WIRING PIN: the broken-stdin detector calls the shared reattachLocalPty');
  ok(!/pty\.spawn\(DTACH_CMD/.test(wsSrc),
    'WIRING PIN: ws-handler no longer spawns its own dtach attach (one implementation, not two)');
  ok(/ptyQuietSince\(session, sentAt\)/.test(uiSrc),
    'WIRING PIN: the detector asks the liveness STAMP, not session.buffer.length');
  const stdoutSrc = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf-8');
  ok((stdoutSrc.match(/pty\.spawn\(DTACH_CMD/g) || []).length === 2,
    'WIRING PIN: exactly two local dtach spawns remain (the first attach + the ONE healer)');
  ok(/ptyProcess\.onData\(\(\) => \{ if \(session\.pty === ptyProcess\) session\._lastPtyDataAt = Date\.now\(\); \}\);/.test(stdoutSrc),
    'WIRING PIN: the liveness stamp is registered in setupSessionPty — the one place every pty is wired — and only the CURRENT bridge stamps (B-1217)');
}

console.log(fail ? `\nFAIL (${fail} failed, ${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
