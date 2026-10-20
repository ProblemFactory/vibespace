#!/usr/bin/env node
// AN AGENT'S ACTION MAY PLACE A WINDOW; ONLY A PERSON'S ACTION MAY FOCUS ONE (lane agent-window-no-steal, owner 2026-10-11:
// "我另一个对话操作chrome的时候还是疯狂把自己提到前台" — six agent Chromes in a day, each opened in front of his work).
// FAST, in-process: ① the PURE verdict table src/lib/desktop-app-placement.js agentWindowPlacement — every origin × the chat
// on this desk / another desk / minimized / absent × the active window × interacting × phone × the setting ⇒ {act, focus,
// deskSwitch, badge}; ② satelliteFocus (rule 3); ③ a RED control: a copy whose setting gate is gone yields focus:true for an
// agent row and the census below goes red on it; ④ the doors read the verdict (source pins: app.js, desktop-app-window.js,
// xpra-view.js, window.js, browser-live-window.js); ⑤ the setting (default OFF, said in its description, zh/ja words).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'src/lib/desktop-app-placement.js';
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
let failed = 0, passed = 0;
const ok = (c, n, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + JSON.stringify(e).slice(0, 600) : ''}`); } };

const ORIGINS = ['agent-browser', 'self-open', 'user', undefined];
const CHAT = { winId: 'win-chat', sessionId: 'w-A' };
const STATES = {
  here: [{ ...CHAT, minimized: false, hidden: false, deskId: 'd1' }],
  otherDesk: [{ ...CHAT, minimized: false, hidden: true, deskId: 'd2' }],
  minimized: [{ ...CHAT, minimized: true, hidden: false, deskId: 'd1' }],
  none: [{ winId: 'win-x', sessionId: 'w-B', minimized: false, hidden: false, deskId: 'd1' }],
};
const ACTIVES = [null, 'win-editor', 'win-chat'];
/** Every row of the table through module `P` → [{row, out}] */
function table(P) {
  const rows = [];
  for (const origin of ORIGINS) for (const [state, chats] of Object.entries(STATES)) for (const active of ACTIVES) for (const interacting of [false, true]) for (const phone of [false, true]) for (const front of [false, true]) {
    const msg = { type: 'desktop-app-opened', sessionId: 'w-A', appId: 'da-1', ...(origin ? { origin } : {}) };
    const row = { origin, state, active, interacting, phone, front };
    rows.push({ row, out: P.agentWindowPlacement({ msg, chats, active, desk: 'd1', phone, interacting, front }) });
  }
  return rows;
}
/** THE INVARIANT: with the setting off, no row focuses and no row switches a desktop. → the offending rows */
const focusOffenders = (rows) => rows.filter(({ row, out }) => out.deskSwitch !== false || (!row.front && out.focus !== false));

console.log('① the PURE verdict table');
{
  const P = await import(pathToFileURL(path.join(REPO, REL)).href);
  const rows = table(P);
  ok(rows.length === 4 * 4 * 3 * 2 * 2 * 2, `${rows.length} rows`);
  ok(focusOffenders(rows).length === 0, 'setting OFF ⇒ focus:false on EVERY row; deskSwitch:false on every row (setting ON too)', focusOffenders(rows).slice(0, 3));
  const agent = (o) => o.row.origin && o.row.origin !== 'user';
  ok(rows.filter((o) => !agent(o)).every((o) => o.out.act === 'none'), 'a person\'s origin (user / none) ⇒ nothing opens from the broadcast (his own launch keeps its own door: front + focus)');
  const off = rows.filter((o) => agent(o) && !o.row.front && !o.row.phone);
  ok(off.filter((o) => o.row.state === 'here').every((o) => o.out.act === 'beside' && o.out.fromWin === 'win-chat' && o.out.badge && !o.out.minimize), 'chat on THIS desk, shown ⇒ beside it (its chain), quiet, the taskbar pulses');
  ok(off.filter((o) => o.row.state === 'here').every((o) => o.out.behind === (o.row.active === 'win-editor')), '… behind the active window when that is another window (the chat itself active ⇒ nothing to go under)');
  ok(off.filter((o) => o.row.state === 'otherDesk').every((o) => o.out.act === 'desk' && o.out.deskId === 'd2' && o.out.badge), 'chat on ANOTHER desk ⇒ created on that desk (hidden by the desktop model), no switch');
  ok(off.filter((o) => o.row.state === 'minimized').every((o) => o.out.act === 'own' && o.out.behind === !!o.row.active && o.out.minimize === o.row.interacting && o.out.badge), 'chat minimized ⇒ its own window behind the active one; minimized to the taskbar while the person is mid-act');
  ok(off.filter((o) => o.row.state === 'none').every((o) => o.out.act === 'none' && o.out.why === 'not-here'), 'no window of that chat on this client ⇒ nothing (D3: a client without the chat opens nothing)');
  const ph = rows.filter((o) => agent(o) && !o.row.front && o.row.phone);
  ok(ph.filter((o) => o.row.state === 'here').every((o) => o.out.act === 'own' && !o.out.focus && o.out.badge), 'phone showing the chat ⇒ its own window, NOT shown (the shown window stays), the title badge says it is there');
  ok(ph.filter((o) => o.row.state !== 'here').every((o) => o.out.act === 'none'), 'phone not showing the chat ⇒ nothing');
  const on = rows.filter((o) => agent(o) && o.row.front);
  const old = (o) => P.agentBrowserPlacement({ msg: { type: 'desktop-app-opened', sessionId: 'w-A', appId: 'da-1', origin: 'agent-browser' }, chats: STATES[o.row.state], phone: o.row.phone });
  ok(on.every((o) => o.out.act === old(o).act && o.out.focus === (o.out.act !== 'none') && !o.out.badge), 'setting ON ⇒ exactly D3\'s old answer (beside / own on a phone / nothing) WITH focus — today\'s behaviour');
  ok(P.agentWindowPlacement({ msg: { type: 'desktop-app-opened', sessionId: 'w-A', appId: 'da-1', origin: 'agent-browser' }, chats: STATES.here, visible: false }).act === 'none', 'a hidden page opens nothing');
}

console.log('①d the design-open push rides the SAME verdict (lane design-window-placement)');
{
  const P = await import(pathToFileURL(path.join(REPO, REL)).href);
  const dmsg = (sid = 'w-A') => ({ type: 'design-open', sessionId: sid, openSpec: { action: 'openDesign', host: null, dir: '/proj/designs/x', sessionId: sid } });
  const drows = [];
  for (const [state, chats] of Object.entries(STATES)) for (const active of ACTIVES) for (const interacting of [false, true]) for (const phone of [false, true]) for (const front of [false, true]) {
    drows.push({ row: { state, active, interacting, phone, front }, out: P.agentWindowPlacement({ msg: dmsg(), chats, active, desk: 'd1', phone, interacting, front }) });
  }
  ok(drows.length === 4 * 3 * 2 * 2 * 2, `${drows.length} design-open rows`);
  ok(drows.filter((o) => o.out.deskSwitch !== false || (!o.row.front && o.out.focus !== false)).length === 0, 'design-open: setting OFF ⇒ focus:false on every row; deskSwitch:false on every row (ON too)');
  const off = drows.filter((o) => !o.row.front && !o.row.phone);
  ok(off.filter((o) => o.row.state === 'here').every((o) => o.out.act === 'beside' && o.out.fromWin === 'win-chat' && o.out.badge && !o.out.minimize && o.out.behind === (o.row.active === 'win-editor')), 'a Design opened beside a SHOWN chat ⇒ beside it (its split), quiet, the taskbar pulses, behind another active window');
  ok(off.filter((o) => o.row.state === 'otherDesk').every((o) => o.out.act === 'desk' && o.out.deskId === 'd2' && o.out.badge), 'chat on ANOTHER desk ⇒ the Design is created there (hidden by the desktop model), no switch');
  ok(off.filter((o) => o.row.state === 'minimized').every((o) => o.out.act === 'own' && o.out.behind === !!o.row.active && o.out.minimize === o.row.interacting && o.out.badge), 'chat minimized ⇒ its own window behind the active one; minimized while the person is mid-act');
  ok(off.filter((o) => o.row.state === 'none').every((o) => o.out.act === 'none' && o.out.why === 'not-here'), 'no window of that chat here ⇒ nothing (D3)');
  const ph = drows.filter((o) => !o.row.front && o.row.phone);
  ok(ph.filter((o) => o.row.state === 'here').every((o) => o.out.act === 'own' && !o.out.focus && o.out.badge), 'phone showing the chat ⇒ its own window, never the shown one, the title badge says it is there');
  ok(ph.filter((o) => o.row.state !== 'here').every((o) => o.out.act === 'none'), 'phone not showing the chat ⇒ nothing');
  const on = drows.filter((o) => o.row.front);
  ok(on.filter((o) => o.row.state === 'here' && !o.row.phone).every((o) => o.out.act === 'beside' && o.out.focus === true), 'setting ON ⇒ the Design comes to the FRONT (beside + focus) — the control');
  ok(on.filter((o) => o.row.state === 'none').every((o) => o.out.act === 'none'), 'setting ON + no chat here ⇒ still nothing');
  ok(P.agentPlacedSession(dmsg('w-Z')) === 'w-Z' && P.agentPlacedSession({ type: 'desktop-app-opened', origin: 'self-open', appId: 'a', sessionId: 'w-Q' }) === 'w-Q', 'agentPlacedSession reads the session id of BOTH pushes');
  ok([{ type: 'design-open', sessionId: 'w-A', openSpec: { action: 'openDesign', dir: '' } }, { type: 'design-open', sessionId: '', openSpec: { action: 'openDesign', dir: '/d' } }, { type: 'design-open', sessionId: 'w-A', openSpec: { action: 'other', dir: '/d' } }, { type: 'design-open', sessionId: 'w-A' }].every((m) => P.agentWindowPlacement({ msg: m, chats: STATES.here }).act === 'none' && P.agentPlacedSession(m) === null), 'a design-open with no folder / no session / a non-openDesign action / no openSpec ⇒ nothing opens (a person’s door never rides this push)');
}

console.log('② satelliteFocus — a second top-level of a running app (rule 3)');
{
  const { satelliteFocus: S, agentOpenedRecord: A } = await import(pathToFileURL(path.join(REPO, REL)).href);
  ok(S({ agentOpened: false }).focus === true, 'an app the person opened: its new window comes to the front (today)');
  ok(S({ agentOpened: true }).focus === false, 'an agent-opened app\'s new window: placed beside its main pane, never revealed');
  ok(S({ agentOpened: true, mainActive: true }).focus === true, '… unless the person is looking at that main pane (it is the active window)');
  ok(S({ agentOpened: true, front: true }).focus === true, '… or the setting is ON');
  ok(A({ origin: 'agent-browser' }) === true && A({ origin: 'launcher' }) === false && A(null) === false, 'agentOpenedRecord: the record\'s origin names an agent');
}

console.log('③ RED control — a copy without the setting gate');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-awns-'));
  try {
    const src = read(REL);
    const from = 'const base = { focus: false,';
    ok(src.includes(from), 'the mutant anchor is in the module');
    fs.writeFileSync(path.join(dir, 'mutant.mjs'), src.replace(from, 'const base = { focus: true,'));
    const M = await import(pathToFileURL(path.join(dir, 'mutant.mjs')).href);
    const bad = focusOffenders(table(M));
    ok(bad.length > 0 && bad.some((o) => o.row.origin === 'agent-browser' && !o.row.front && o.out.focus === true), `the census goes RED on it (${bad.length} agent rows with focus:true, setting off)`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log('④ the doors read the verdict');
{
  const app = read('src/lib/app.js');
  ok(/agentWindowPlacement\(\{ msg, chats, active: this\.wm\.activeWindowId \|\| null, desk: dm\?\.activeDesktopId \|\| null, phone: !!this\.isMobile, visible: document\.visibilityState !== 'hidden', interacting, front: this\.settings\?\.get\('desktop\.agentWindowsFront'\) === true \}\)/.test(app), 'app.js asks agentWindowPlacement on every desktop-app-opened (the setting is `front`)');
  ok(/this\.openDesktopApp\(msg\.appId, \{ intoChain: p\.act === 'beside' \? this\.linkPlacement\(p\.fromWin\) : undefined, quiet: true \}\)/.test(app), 'focus:false ⇒ openDesktopApp(…, {quiet: true}) — beside through lane F\'s split door');
  ok(/if \(p\.act === 'desk'\) dm\?\.moveWindowToDesktop\(w\.id, p\.deskId\);/.test(app) && /else if \(!w\._tabChain\) this\.wm\.placeBehind\(w\.id\);/.test(app) && /if \(p\.badge\) this\.wm\.markArrived\(w\.id\);/.test(app), 'desk ⇒ moved to the chat\'s desktop (no switch); a free window ⇒ placeBehind; badge ⇒ markArrived');
  ok(!/agentBrowserPlacement\(/.test(app), 'app.js no longer asks the focus-blind verdict');
  const da = read('src/lib/desktop-app-window.js');
  ok(/if \(!quiet\) app\.wm\.revealWindow\(winId, \{ replay: !!syncId \}\); return win;/.test(da), 'openDesktopApp: an already-open app is NOT revealed by a quiet open');
  ok(/\.\.\.\(quiet \? \{ quiet: true \} : \{\}\), \/\/ lane agent-window-no-steal/.test(da), 'openDesktopApp hands quiet to createWindow (its asked quiet: the active window and the caret stay)');
  ok(/fresh: true, quiet: !satelliteFocus\(\{ agentOpened: agentOpenedRecord\(rec\), mainActive: app\.wm\.activeWindowId === winInfo\.id, front: app\.settings\?\.get\('desktop\.agentWindowsFront'\) === true \}\)\.focus/.test(da), 'a fresh satellite asks satelliteFocus');
  ok(/if \(fresh && !quiet\) app\.wm\.revealWindow\(w\.id\); else if \(fresh\) \{ app\.wm\.placeBehind\(w\.id\); app\.wm\.markArrived\(w\.id\); \}/.test(da) && /if \(fresh && !quiet\) handle\.focus\(\);/.test(da), 'a quiet satellite is placed behind + pulses, its pane never takes the keyboard');
  ok(/mayFocus: \(\) => app\.wm\.activeWindowId === winInfo\.id/.test(da) && /if \(mayFocus\(\)\) ime\.focus\(\{ preventScroll: true \}\);/.test(read('src/lib/xpra-view.js')), 'xpra-view: a picture that connects behind the person\'s work never takes the caret (mayFocus)');
  const wm = read('src/lib/window.js');
  const pb = wm.slice(wm.indexOf('  placeBehind(id) {'), wm.indexOf('/** The quiet "it is there"'));
  ok(pb.length > 100 && !/focusWindow|revealWindow|switchTo/.test(pb), 'window.js placeBehind: restacks only — never focuses, never reveals, never switches a desktop');
  ok(/classList\.remove\('window-arrived'\); \/\/ the person came to it/.test(wm), 'focusWindow clears the arrival mark (the person came to it)');
  const tb = read('src/lib/taskbar.js');
  ok(/item\.classList\.add\('arrived'\)/.test(tb) && /el\.classList\.toggle\('arrived'/.test(tb), 'the taskbar entry (single + group) carries the arrival mark');
  ok(/#mobile-nav-title\.arrived/.test(read('public/style.css')) && /classList\.toggle\('arrived'/.test(read('src/lib/mobile-nav.js')), 'the phone\'s title carries it (the shown window is never replaced)');
  const bl = read('src/lib/browser-live-window.js');
  ok(/const quiet = app\.settings\?\.get\('desktop\.agentWindowsFront'\) !== true;/.test(bl) && /syncId, intoChain, quiet \}\);/.test(bl), 'the live view the agent\'s browser start auto-opens follows the same rule (quiet beside the chat)');
  // lane design-window-placement: the Design window's door reads the SAME verdict, through app.placeAgentWindow
  const dw = read('src/lib/design-window.js');
  ok(/app\.placeAgentWindow\(m, \(p, \{ focus \}\) => \(\{/.test(dw) && /win: openDesign\(app, \{ host: spec\.host \|\| '', dir: spec\.dir, sessionId: sid, quiet: !focus \}\)/.test(dw), 'installDesignWindow routes the design-open push through app.placeAgentWindow (quiet unless the front setting focuses it)');
  ok(/if \(quiet\) \{ app\.wm\.markArrived\(existing\.id\); app\.wm\.revealWindow\(existing\.id, \{ raise: false \}\); \}/.test(dw), 'openDesign: an agent\'s re-open of an OPEN design pulses + shows its tab, never raised (raise:false)');
  ok(/placeAgentWindow\(msg, open\) \{/.test(app) && /const p = agentWindowPlacement\(\{ msg, chats, active: this\.wm\.activeWindowId \|\| null, desk: dm\?\.activeDesktopId \|\| null, phone: !!this\.isMobile, visible: document\.visibilityState !== 'hidden', interacting, front: this\.settings\?\.get\('desktop\.agentWindowsFront'\) === true \}\)/.test(app), 'app.placeAgentWindow asks the SAME verdict as the desktop-app door');
  ok(/const r = open\(p, \{ focus: !!p\.focus \}\) \|\| \{\};/.test(app) && /if \(r\.fresh\) \{/.test(app) && /if \(p\.act === 'beside' && host\) \{ this\.wm\.snapToHalf\(p\.fromWin, 'left'\); this\.wm\.snapToHalf\(w\.id, 'right'\); \}/.test(app), 'app.placeAgentWindow positions ONLY a FRESH window: beside = snap (chat left, Design right), else desk / behind; an existing one placed itself');
}

console.log('⑤ the setting');
{
  const S = read('src/lib/settings-schema.js');
  const i = S.indexOf("'desktop.agentWindowsFront': {");
  const row = S.slice(i, S.indexOf('liveApply', i));
  ok(i > 0 && /type: 'boolean', default: false/.test(row) && /category: t\('Desktop apps'\)/.test(row), 'Settings → Desktop apps → a boolean, default OFF');
  ok(/OFF \(the default\)/.test(row) && /ON: it comes to the front/.test(row), 'its description says the default and the old behaviour');
  for (const lang of ['zh', 'ja']) { const L = read(`src/lib/i18n-${lang}.js`); ok(L.includes('"Agent-opened windows come to the front":') && L.includes('"OFF (the default): a window an agent opens'), `${lang}: the label and the description are translated`); }
  ok(/a Design it opens/.test(row), 'the description names a Design beside the desktop apps (lane design-window-placement)');
  for (const lang of ['zh', 'ja']) { const L = read(`src/lib/i18n-${lang}.js`); ok(L.includes(', a Design it opens — is placed beside'), `${lang}: the new design clause is in the translated key`); }
}

console.log(failed ? `\nFAIL (${failed} failed, ${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
