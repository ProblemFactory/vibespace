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

console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
