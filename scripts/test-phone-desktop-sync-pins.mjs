#!/usr/bin/env node
// THE PHONE ⇄ DESKTOP SYNC — ⑭ THE CAPTURE CENSUS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-phone-desktop-sync.mjs (its two-chrome legs and its git-base ⑩–⑬ controls stay there; ⑭'s base control is a PLANTED text copy here):
//   ⑭ THE CAPTURE CENSUS (static): every call of a raw page capture (captureState / captureWindows / captureWin), of THE
//      ONE CAPTURE (desktop-manager.js captureBuilt) and of recordFor in src/lib, grep-derived per enclosing method — a
//      site the table does not name is RED (a new back door), so is a dead row; the RED control runs it on the base
// It reads every src/lib file BY NAME (src/lib/app.js, src/lib/desktop-manager.js, … — the walk names the directory 'src/lib'), so ci.mjs's affected
// rule selects this suite on a change of any of them.
// Run: node scripts/test-phone-desktop-sync-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1500) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ONLY = (process.env.PDSYNC_ONLY || '').split(',').filter(Boolean);
const want = (id) => !ONLY.length || ONLY.includes(String(id));

// ── ⑭ THE CAPTURE CENSUS (lane phone-arrangement-fixes) ──
const CAPTURE_CALL_RE = /\.(captureWindows|captureState|captureWin|captureBuilt|recordFor)\(/g;
const CHOKE_PIN = "return captureForViewport({ held, built, viewport: this.app.isMobile ? 'phone' : 'desktop' });";
const CAPTURE_SITES = [
  // [file under src/lib, enclosing method, call, count, kind, a needle the enclosing method holds (its wiring pin)]
  ['layout.js', 'captureState', 'captureWindows', 1, 'raw primitive', 'return { windows: this.captureWindows(this.app.desktopManager?.activeDesktopId), ...this.captureChrome() };'],
  ['layout.js', 'captureWindows', 'captureWin', 1, 'raw primitive', 'const winState = this.captureWin(win, id);'],
  ['desktop-manager.js', 'captureBuilt', 'captureWin', 1, 'THE ONE CAPTURE', CHOKE_PIN],
  ['desktop-manager.js', 'captureBuilt', 'captureWindows', 1, 'THE ONE CAPTURE', CHOKE_PIN],
  ['desktop-manager.js', 'recordFor', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'const built = this.captureBuilt(desktopId, held);'],
  ['desktop-manager.js', 'presetState', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'windows: this.captureBuilt(this._activeId, held)'],
  ['desktop-manager.js', 'onSyncRefused', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'built: this.captureBuilt(d, rec)'],
  ['desktop-manager.js', 'onSyncRefused', 'recordFor', 1, 'a record (recordFor captures through THE ONE CAPTURE) — the breaker compares it with the refused one (userW inc-mw1ogdno-5jny)', 'const same = ref.json != null && ref.json === this._writeJson(d, this.recordFor(d));'],
  ['desktop-manager.js', '_updateCachedDesktop', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'const moved = this.captureBuilt(desktopId, '],
  ['desktop-manager.js', 'deleteDesktop', 'recordFor', 1, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  ['desktop-manager.js', 'switchTo', 'recordFor', 1, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  ['stage-manager.js', 'enter', 'recordFor', 1, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  ['layout.js', '_doAutoSave', 'recordFor', 2, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  // a page with no desktop manager — never a phone: app.js builds one on every page (the APP_DM pin below)
  ['layout.js', '_doAutoSave', 'captureState', 1, 'no desktop manager', 'const state = dm?.recordFor && desktopId ? dm.recordFor(desktopId) : this.captureState();'],
  ['layout.js', 'savePreset', 'captureState', 1, 'no desktop manager', 'const state = dm?.presetState ? dm.presetState() : this.captureState();'],
];
const APP_DM = '\n    this.desktopManager = new DesktopManager(this);\n';
const METHOD_RE = /^  (?:async |static )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/;
/** [file, text] pairs → { sites (file · method · call · n), unknown, dead, unpinned } against CAPTURE_SITES. */
const captureCensus = (srcs) => {
  const tally = new Map(), bodies = new Map();
  for (const [rel, text] of srcs) {
    const lines = text.split('\n');
    let method = null, start = 0;
    lines.forEach((l, i) => {
      const m = METHOD_RE.exec(l);
      if (m) { method = m[1]; start = i; }
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      const code = l.replace(/\s\/\/\s.*$/, '');
      for (const c of code.matchAll(CAPTURE_CALL_RE)) {
        const key = `${rel} · ${method} · ${c[1]}`;
        tally.set(key, (tally.get(key) || 0) + 1);
        if (!bodies.has(`${rel} · ${method}`)) { let e = start + 1; while (e < lines.length && lines[e] !== '  }') e++; bodies.set(`${rel} · ${method}`, lines.slice(start, e + 1).join('\n')); }
      }
    });
  }
  const sites = [...tally].map(([k, n]) => `${k} ×${n}`);
  const rowKey = (r) => `${r[0]} · ${r[1]} · ${r[2]}`;
  const unknown = [...tally].filter(([k, n]) => { const r = CAPTURE_SITES.find((x) => rowKey(x) === k); return !r || r[3] !== n; }).map(([k, n]) => `${k} ×${n}`);
  const dead = CAPTURE_SITES.filter((r) => !tally.has(rowKey(r))).map(rowKey);
  const unpinned = CAPTURE_SITES.filter((r) => r[5] && tally.has(rowKey(r)) && !(bodies.get(`${r[0]} · ${r[1]}`) || '').includes(r[5])).map(rowKey);
  return { sites, unknown, dead, unpinned };
};
const libSources = () => {   // this tree's src/lib, file by file (the heavy's git-base branch stays with its ⑩–⑬ controls)
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js')) out.push([path.relative(path.join(repo, 'src/lib'), f), fs.readFileSync(f, 'utf8')]); } };
  walk(path.join(repo, 'src/lib'));
  return out;
};

if (want(14)) {
  console.log('— ⑭ THE CAPTURE CENSUS: every raw capture / ONE-capture / recordFor call site in src/lib');
  const c = captureCensus(libSources());
  console.log('    ⑭ sites: ' + c.sites.join(' | '));
  ok(c.sites.length >= CAPTURE_SITES.length && !c.unknown.length, `⑭: every capture call site in src/lib (${c.sites.length}) is THE ONE CAPTURE, a raw primitive's own body, a record through it, or a pinned no-desktop-manager fallback — none unnamed`, J(c.unknown));
  ok(!c.dead.length && !c.unpinned.length, '⑭: no dead row; every pinned row\'s method holds its pin (the choke ends in captureForViewport, its callers pass the held record)', J({ dead: c.dead, unpinned: c.unpinned }));
  ok(fs.readFileSync(path.join(repo, 'src', 'lib', 'app.js'), 'utf8').includes(APP_DM), '⑭: app.js builds a DesktopManager on every page (the no-desktop-manager fallbacks never run on a phone)');
  // RED CONTROL (lane lg-text-legs-2): a back door PLANTED in a copy of desktop-manager.js's text — a raw capture in a method the table
  // does not name — is named by the census (the heavy's control read the fix's base commit through git; on this tree that base is
  // gone from history, so it only ever skipped — and a history read is §2j's off-master census's business)
  const planted = libSources().map(([f, t]) => [f, f === 'desktop-manager.js' ? t.replace(/\n}\s*$/, '\n  _plantedCapture() {\n    return this.captureWindows();\n  }\n}\n') : t]);
  const pc = captureCensus(planted);
  ok(planted.some(([f, t]) => f === 'desktop-manager.js' && t.includes('_plantedCapture()')) && pc.unknown.some((k) => /desktop-manager\.js · _plantedCapture · captureWindows/.test(k)), '⑭ RED control: a raw capture planted in a copy of desktop-manager.js is a site the table does not name (the census goes red on it)', J(pc.unknown));
  // RED CONTROL, THE OTHER DIRECTION (主开发's 07:14Z verdict — the heavy's base control was red both ways): a PINNED row's needle removed in
  // a copy of layout.js — savePreset captures the page itself again, the pre-fix shape; the call site stays — is named «unpinned»
  const PIN = 'const state = dm?.presetState ? dm.presetState() : this.captureState();';
  const lib = libSources(), unpin = lib.map(([f, t]) => [f, f === 'layout.js' ? t.replace(PIN, 'const state = this.captureState();') : t]);
  const uc = captureCensus(unpin);
  ok(lib.some(([f, t]) => f === 'layout.js' && t.split(PIN).length === 2) && uc.unpinned.includes('layout.js · savePreset · captureState') && !uc.unknown.length, '⑭ RED control (the other direction): savePreset\'s pin removed in a copy of layout.js — the census names the row «unpinned»', J({ unpinned: uc.unpinned, unknown: uc.unknown }));
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
