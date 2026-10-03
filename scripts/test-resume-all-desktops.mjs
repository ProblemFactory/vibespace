#!/usr/bin/env node
// RESUME-ALL COVERS EVERY DESKTOP (2.331.0, real report "服务器重启后那个批量
// resume弹窗只会批量resume当前desktop里的窗口"). At boot only the active
// desktop passes through restoreState; the other desktops' windows are lazy
// saved states — scanStoppedInDesktopStates is the pure scan that folds their
// dead sessions into the offer. This pins the whole decision matrix.
import { scanStoppedInDesktopStates } from '../src/lib/layout.js';
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

const win = (over = {}) => ({ type: 'chat', backendSessionId: 'aaaa-1111', serverSessionId: 'sess-9-1', gridBounds: { left: 0.1, top: 0.1, width: 0.4, height: 0.5 }, title: 'T', ...over });
const DATA = {
  desktopMeta: [{ id: 'd1', name: 'One' }, { id: 'd2', name: 'Two' }, { id: 'd3', name: 'Three' }],
  desktops: {
    d1: { autoSave: { windows: [win({ backendSessionId: 'on-active-desktop' })] } },
    d2: { autoSave: { windows: [
      win(),                                                                    // dead local chat
      win({ type: 'terminal', backendSessionId: 'bbbb-2222', serverSessionId: 'sess-9-2' }), // dead local terminal
      win({ backendSessionId: 'cccc-3333', serverSessionId: 'sess-9-3' }),      // ALIVE — must be skipped
      win({ type: 'files' }),                                                   // not a session window
      { type: 'chat', serverSessionId: 'sess-9-5' },                            // no backend id — skip
      win({ backendSessionId: 'rrrr-7777', serverSessionId: 'sess-9-7', openSpec: { hostId: 'host-x' } }), // dead REMOTE
    ] } },
    d3: { autoSave: { windows: [win({ backendSessionId: 'aaaa-1111', serverSessionId: 'sess-9-8', gridBounds: null })] } }, // same session, 2nd desktop
  },
};
const LIVE = [{ id: 'sess-live', backend: 'claude', backendSessionId: 'cccc-3333' }];
const ALL = [
  { sessionId: 'aaaa-1111', backendSessionId: 'aaaa-1111', backend: 'claude', cwd: '/w/a', name: 'A' },
  { sessionId: 'bbbb-2222', backendSessionId: 'bbbb-2222', backend: 'claude', cwd: '/w/b', name: 'B' },
  { sessionId: 'cccc-3333', backendSessionId: 'cccc-3333', backend: 'claude', cwd: '/w/c', name: 'C' },
];

const out = scanStoppedInDesktopStates(DATA, 'd1', LIVE, ALL, (id) => id === 'aaaa-1111' ? '自定义名' : null);
const ids = out.map((d) => d.opts.backendSessionId);
ok(!ids.includes('on-active-desktop'), 'ACTIVE desktop is excluded (restoreState already collected it)');
ok(ids.includes('aaaa-1111') && ids.includes('bbbb-2222'), 'dead local chat + terminal on other desktops are collected', ids);
ok(!ids.includes('cccc-3333'), 'a LIVE session is never offered');
ok(ids.includes('rrrr-7777'), 'a dead REMOTE window (no local stoppedMatch) is collected from its openSpec identity');
const a = out.find((d) => d.opts.backendSessionId === 'aaaa-1111');
ok(a.name === '自定义名', 'custom name wins over discovery name');
ok(a.opts.winBounds.desktopId === 'd2' || a.opts.winBounds.desktopId === 'd3',
  'winBounds carries the HOME desktop so resumeSession lands it there (2.295.0 placement)', a.opts.winBounds);
ok(out.filter((d) => d.opts.backendSessionId === 'aaaa-1111').length === 2 || out.filter((d) => d.opts.backendSessionId === 'aaaa-1111').length === 1,
  'same session on two desktops yields entries (the collector method dedups by key downstream)');
const r = out.find((d) => d.opts.backendSessionId === 'rrrr-7777');
ok(r.opts.hostId === 'host-x', 'remote entry keeps its hostId for the host-aware resume');
ok(scanStoppedInDesktopStates(null, 'd1', [], [], null).length === 0
  && scanStoppedInDesktopStates({ desktopMeta: [] }, 'd1', [], [], null).length === 0,
  'empty/hostile input never throws');

// WIRING PIN (2.355.0, userW's inc-msy27q2e repeat): the 2.331.0 commit
// shipped this pure function + this very test but the loadAutoSave CALL was
// never staged — the fix sat dead for 24 releases while its unit test stayed
// green. A pure function's test proves the LOGIC, this pin proves the WIRING.
import fs from 'node:fs';
const laySrc = fs.readFileSync(new URL('../src/lib/layout.js', import.meta.url), 'utf-8');
const callCount = laySrc.split('scanStoppedInDesktopStates(').length - 1;
ok(callCount >= 2, `layout.js CALLS the scanner, not just defines it (${callCount} occurrences)`);
ok(/scanStoppedInDesktopStates\([\s\S]{0,200}_bootStoppedSessions\.push|_bootStoppedSessions\.push[\s\S]{0,600}scanStoppedInDesktopStates\(|scanStoppedInDesktopStates\(data, activeId/.test(laySrc),
  'the call feeds the resume-all collector');

// ── B-ddc0 (lane chat-residuals): a restored window's NAME is the session's name, never its title ──
// The title is `${name} — ${cwd}`; reading it back as the name grew a remote view-only window's
// name by one " — <cwd>" per reload (the 2026-08-13 boot log: "… — /path ×8" once resumed).
{
  const { savedWindowName } = await import('../src/lib/layout.js');
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { pathToFileURL, fileURLToPath } = await import('node:url');
  const { mutantCopies, copiesCensus } = await import('./mutant-copy.mjs');
  const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cwd = '/home/u/agentic-search';
  // each reload: restore from the saved record, then viewSession titles the window `${name} — ${cwd}` and names its openSpec
  const reloads = (scan, n = 8) => {
    let w = { type: 'chat', backendSessionId: 'abc123', cwd, title: `agentic-search — ${cwd}`, openSpec: { action: 'viewSession', hostId: 'host-aidev', backendSessionId: 'abc123', cwd, name: 'agentic-search' } };
    const names = [];
    for (let i = 0; i < n; i++) {
      const [r] = scan({ desktopMeta: [{ id: 'd1' }, { id: 'd2' }], desktops: { d2: { autoSave: { windows: [w] } } } }, 'd1', [], [], () => null);
      names.push(r?.name);
      w = { ...w, title: `${r.name} — ${r.cwd}`, openSpec: { ...w.openSpec, name: r.name } };
    }
    return names;
  };
  const names = reloads(scanStoppedInDesktopStates);
  ok(names.length === 8 && names.every((x) => x === 'agentic-search'), 'B-ddc0 a REMOTE view-only window keeps its name across 8 reloads (the title is never read back as the name)', names.slice(-1));
  ok(savedWindowName({ cwd, title: `agentic-search — ${cwd} — ${cwd} — ${cwd}`, openSpec: { name: `agentic-search — ${cwd} — ${cwd}` } }) === 'agentic-search', 'B-ddc0 an already-grown saved name heals (every trailing " — <cwd>" is the title\'s suffix)');
  ok(savedWindowName({ cwd, title: `agentic-search — ${cwd}` }) === 'agentic-search' && savedWindowName({ title: 'T' }) === 'T' && savedWindowName({ cwd, title: cwd, openSpec: {} }) === cwd, 'B-ddc0 an old record without openSpec.name: the title minus its suffix (a bare title stays as it is)');
  const lay = fs.readFileSync(path.join(repo, 'src/lib/layout.js'), 'utf8');
  ok(!/ws\.title \|\|/.test(lay) && (lay.match(/savedWindowName\(ws\) \|\| 'Session'/g) || []).length === 10, 'B-ddc0 CENSUS: no restore branch reads ws.title as a name (all 10 read savedWindowName)');
  const M = mutantCopies('resume-name', repo);
  const pre = lay.replace("  let name = String(typeof spec === 'string' && spec.trim() ? spec : (ws?.title || ''));", "  let name = String(ws?.title || ''); return name;");
  ok(pre !== lay, 'B-ddc0 (the pre-fix patch applied — the title IS the name)');
  const P = await import(pathToFileURL(M.write('src/lib/layout.js', pre, 'pre-ddc0')).href);
  const pn = reloads(P.scanStoppedInDesktopStates);
  ok((pn[7].match(/ — /g) || []).length === 8, `B-ddc0 NEGATIVE CONTROL: the pre-fix rule grows the name to 8 × " — <cwd>" in 8 reloads (the incident's shape)`, pn[7]);
  for (const r of copiesCensus(M.files, M.dir, repo, { minCopies: 1, label: 'B-ddc0 ' })) ok(r.pass, r.name, r.detail);
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
