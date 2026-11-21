#!/usr/bin/env node
// THE EPHEMERAL BROWSER — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM
// from the heavy scripts/test-browser-ephemeral.mjs, whose real keeper / routes / CLI legs and every patched-copy CONTROL stay
// there: ④ r2 L5 the trace-status wiring (chat-view hands the status to the loader, its empty card says why) and ⑥ r5 the
// profile row's Stop. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of it.
// Run: node scripts/test-browser-ephemeral-pins.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } return !!c; };

const REPO = new URL('..', import.meta.url).pathname;

console.log('— ④ lane H: the managed ephemeral browser is a holder row, its events hold the verb, the recorder traces it with no viewer');
{
  const cvSrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8'), tvSrc = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok((cvSrc.match(/msg\.type === 'browser-trace-status'\) \{\n\s*(?:\/\/[^\n]*\n\s*)?this\._browserTrace\?\.onStatus\?\.\(msg\)/g) || []).length === 2 && /gap: armGapFor\(w, st\.armFail\)/.test(tvSrc) && /else if \(gap\) sum\.textContent = t\('not recorded until \{time\}: \{why\}'/.test(tvSrc), '④ r2 L5: WIRING — both chat-view handlers hand `browser-trace-status` to the loader, whose empty card reads "not recorded until {time}: {why}"');
}

console.log('— ⑥ r2/r3: the keeper ends the Chrome its dead daemon left behind — recorded at launch, RE-CAPTURED when the daemon relaunches it, else proven by the directory the keeper minted; anything else is profile_locked by name');
{
    const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
    const pr = tv.slice(tv.indexOf('  function profileRow('), tv.indexOf('  function ephemeralRow('));
    ok(/bprof-stop/.test(pr) && /\/stop`/.test(pr) && /r\.live/.test(pr), '⑥ r5: a NAMED profile row carries a Stop while its browser is live — the unstable remedy the notice names is one click', pr.length);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
